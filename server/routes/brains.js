// ─────────────────────────────────────────────────────────────────────────────
// 🧠 BRAINS API v4.353 — Endpoints del Centro de Inteligencia
//
// Reglas de acceso:
//   - administrator: ve todo (master + todos los brains)
//   - resto: ve solo el brain de su club / distrito + el master en read-only
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';
import multer from 'multer';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import { s3 } from '../lib/storage.js';
import pkg from '@aws-sdk/client-s3';
const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = pkg;
import {
    getOrCreateMasterBrain,
    getOrCreateBrainForClub,
    getOrCreateBrainForDistrict,
    listBrains,
    getBrainDetail,
    listRecentMemories,
    searchMemories,
    relateBrains,
    bootstrapRelations,
    reindexAll,
    reindexBatch,
    reindexProgress,
    ingestMemory,
    syncBrainWithOnboarding,
} from '../services/brainService.js';
import { processDocumentSafe, deleteDocument } from '../services/documentProcessor.js';

const router = express.Router();

// Multer para upload de documentos brain — memoryStorage para tener el buffer
// y procesarlo + subirlo a S3 desde el mismo handler.
const docUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max por archivo
    fileFilter: (req, file, cb) => {
        const ext = (file.originalname || '').toLowerCase().split('.').pop();
        const allowed = ['pdf', 'docx', 'doc', 'txt', 'md', 'markdown', 'rtf'];
        if (allowed.includes(ext)) return cb(null, true);
        cb(new Error(`Tipo no soportado. Permitidos: ${allowed.join(', ')}`));
    },
});

// Lista de SQL DDL para crear las tablas Brain. Usado por:
// 1. POST /api/brains/migrate (manual, super admin)
// 2. Auto-migration en ensureReady cuando detecta tablas faltantes (v4.364)
const BRAIN_MIGRATION_SQLS = [
    // Brain
    `CREATE TABLE IF NOT EXISTS "Brain" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "kind" TEXT NOT NULL DEFAULT 'CLUB',
        "name" TEXT NOT NULL,
        "identityPrompt" TEXT,
        "clubId" TEXT,
        "districtId" TEXT,
        "isMaster" BOOLEAN NOT NULL DEFAULT false,
        "memoryCount" INTEGER NOT NULL DEFAULT 0,
        "metadata" JSONB DEFAULT '{}',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Brain_clubId_key" ON "Brain"("clubId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Brain_districtId_key" ON "Brain"("districtId")`,
    `CREATE INDEX IF NOT EXISTS "Brain_kind_idx" ON "Brain"("kind")`,
    `CREATE INDEX IF NOT EXISTS "Brain_isMaster_idx" ON "Brain"("isMaster")`,
    `DO $$ BEGIN
        ALTER TABLE "Brain" ADD CONSTRAINT "Brain_clubId_fkey"
            FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$`,
    `DO $$ BEGIN
        ALTER TABLE "Brain" ADD CONSTRAINT "Brain_districtId_fkey"
            FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$`,

    // BrainMemory
    `CREATE TABLE IF NOT EXISTS "BrainMemory" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "brainId" TEXT NOT NULL,
        "kind" TEXT NOT NULL,
        "sourceId" TEXT,
        "sourceType" TEXT,
        "title" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "embedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
        "metadata" JSONB DEFAULT '{}',
        "clubId" TEXT,
        "districtId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "BrainMemory_brainId_sourceType_sourceId_key"
        ON "BrainMemory"("brainId", "sourceType", "sourceId")`,
    `CREATE INDEX IF NOT EXISTS "BrainMemory_brainId_idx" ON "BrainMemory"("brainId")`,
    `CREATE INDEX IF NOT EXISTS "BrainMemory_sourceId_idx" ON "BrainMemory"("sourceId")`,
    `CREATE INDEX IF NOT EXISTS "BrainMemory_kind_idx" ON "BrainMemory"("kind")`,
    `CREATE INDEX IF NOT EXISTS "BrainMemory_clubId_idx" ON "BrainMemory"("clubId")`,
    `DO $$ BEGIN
        ALTER TABLE "BrainMemory" ADD CONSTRAINT "BrainMemory_brainId_fkey"
            FOREIGN KEY ("brainId") REFERENCES "Brain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

    // BrainRelation
    `CREATE TABLE IF NOT EXISTS "BrainRelation" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "fromBrainId" TEXT NOT NULL,
        "toBrainId" TEXT NOT NULL,
        "kind" TEXT NOT NULL,
        "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
        "source" TEXT NOT NULL DEFAULT 'auto',
        "metadata" JSONB DEFAULT '{}',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "BrainRelation_fromBrainId_toBrainId_kind_key"
        ON "BrainRelation"("fromBrainId", "toBrainId", "kind")`,
    `CREATE INDEX IF NOT EXISTS "BrainRelation_fromBrainId_idx" ON "BrainRelation"("fromBrainId")`,
    `CREATE INDEX IF NOT EXISTS "BrainRelation_toBrainId_idx" ON "BrainRelation"("toBrainId")`,
    `DO $$ BEGIN
        ALTER TABLE "BrainRelation" ADD CONSTRAINT "BrainRelation_fromBrainId_fkey"
            FOREIGN KEY ("fromBrainId") REFERENCES "Brain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN
        ALTER TABLE "BrainRelation" ADD CONSTRAINT "BrainRelation_toBrainId_fkey"
            FOREIGN KEY ("toBrainId") REFERENCES "Brain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

    // BrainDocument
    `CREATE TABLE IF NOT EXISTS "BrainDocument" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "brainId" TEXT NOT NULL,
        "filename" TEXT NOT NULL,
        "mimeType" TEXT NOT NULL,
        "size" INTEGER NOT NULL DEFAULT 0,
        "fileUrl" TEXT,
        "s3Key" TEXT,
        "category" TEXT,
        "description" TEXT,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "errorMessage" TEXT,
        "chunkCount" INTEGER NOT NULL DEFAULT 0,
        "charCount" INTEGER NOT NULL DEFAULT 0,
        "uploadedBy" TEXT,
        "metadata" JSONB DEFAULT '{}',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "processedAt" TIMESTAMP(3),
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS "BrainDocument_brainId_idx" ON "BrainDocument"("brainId")`,
    `CREATE INDEX IF NOT EXISTS "BrainDocument_status_idx" ON "BrainDocument"("status")`,
    `DO $$ BEGIN
        ALTER TABLE "BrainDocument" ADD CONSTRAINT "BrainDocument_brainId_fkey"
            FOREIGN KEY ("brainId") REFERENCES "Brain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
];

async function runBrainMigration() {
    const results = [];
    for (let i = 0; i < BRAIN_MIGRATION_SQLS.length; i++) {
        const sql = BRAIN_MIGRATION_SQLS[i];
        const sqlSummary = sql.split('\n')[0].slice(0, 80);
        try {
            await prisma.$executeRawUnsafe(sql);
            results.push({ step: i + 1, summary: sqlSummary, ok: true });
        } catch (err) {
            results.push({
                step: i + 1,
                summary: sqlSummary,
                ok: false,
                error: err.message?.slice(0, 200),
                code: err.code,
            });
        }
    }
    return results;
}

// Antes de cualquier endpoint, validamos que las tablas existan. Si están
// dormant (db push pendiente), AUTO-MIGRAMOS (v4.364). Si la auto-migration
// falla por permisos de DB o lo que sea, devolvemos 503 y el frontend
// muestra el botón manual.
//
// Cache: una vez que las tablas existen, no chequeamos en cada request.
let _tablesOkUntil = 0;
let _autoMigrationAttempted = false;

const ensureReady = async (req, res, next) => {
    // Cache hit — saltar el query si chequeamos hace poco
    if (Date.now() < _tablesOkUntil) return next();

    try {
        // Timeout 3s — si Prisma no responde en ese tiempo, asumimos que el
        // problema es la conexión, NO la migración. Dejamos pasar al endpoint
        // que tiene su propio manejo defensivo.
        const result = await Promise.race([
            prisma.brain.findFirst({ select: { id: true } }).then(() => 'ok'),
            new Promise(resolve => setTimeout(() => resolve('timeout'), 3000)),
        ]);

        if (result === 'timeout') {
            console.warn('[brains/ensureReady] DB check timed out — letting through');
            return next();
        }
        _tablesOkUntil = Date.now() + 5 * 60 * 1000;
        return next();
    } catch (err) {
        if (err?.code === 'P2021' || /does not exist/i.test(err.message || '')) {
            // v4.364: auto-migrate al detectar tablas faltantes. Solo lo
            // intentamos UNA vez por boot — si falla, no insistir.
            if (!_autoMigrationAttempted) {
                _autoMigrationAttempted = true;
                console.log('[brains/ensureReady] Tables missing — attempting auto-migration...');
                try {
                    const t0 = Date.now();
                    const results = await runBrainMigration();
                    const failed = results.filter(r => !r.ok);
                    console.log(`[brains/ensureReady] Auto-migration finished in ${Date.now() - t0}ms · ${results.length - failed.length}/${results.length} ok`);

                    // Re-chequear que ahora sí existe la tabla principal
                    await prisma.brain.findFirst({ select: { id: true } });
                    _tablesOkUntil = Date.now() + 5 * 60 * 1000;
                    return next();
                } catch (migrateErr) {
                    console.error('[brains/ensureReady] Auto-migration failed:', migrateErr.message);
                    return res.status(503).json({
                        error: 'BRAINS_NOT_MIGRATED',
                        message: 'El sistema de cerebros aún no está activo. Auto-migración falló: ' + (migrateErr.message?.slice(0, 200) || 'unknown'),
                        autoMigrationAttempted: true,
                    });
                }
            }

            return res.status(503).json({
                error: 'BRAINS_NOT_MIGRATED',
                message: 'El sistema de cerebros aún no está activo en este entorno. Corré `npm run db:push` para crear las tablas.',
                autoMigrationAttempted: true,
            });
        }
        return res.status(500).json({ error: 'Error checking brain tables', detail: err.message });
    }
};

const isSuperAdmin = (req) => req.user?.role === 'administrator';

// Devuelve los brains que el caller puede ver. Super admin: todos. Resto:
// el master + el del propio club (+ distrito si aplica).
async function visibleBrainsFor(req) {
    if (isSuperAdmin(req)) return listBrains();

    const allowed = [];
    const master = await getOrCreateMasterBrain();
    allowed.push(master.id);

    if (req.user.clubId) {
        const b = await getOrCreateBrainForClub(req.user.clubId);
        if (b) allowed.push(b.id);
    }
    if (req.user.districtId) {
        const b = await getOrCreateBrainForDistrict(req.user.districtId);
        if (b) allowed.push(b.id);
    }

    return prisma.brain.findMany({
        where: { id: { in: allowed } },
        orderBy: [{ isMaster: 'desc' }, { name: 'asc' }],
        include: {
            club:     { select: { id: true, name: true, subdomain: true, city: true, country: true, category: true, type: true, logo: true } },
            district: { select: { id: true, name: true, number: true, subdomain: true } },
            _count:   { select: { memories: true, outgoingRelations: true, incomingRelations: true } },
        },
    });
}

async function userCanReadBrain(req, brain) {
    if (!brain) return false;
    if (isSuperAdmin(req)) return true;
    if (brain.isMaster) return true;
    if (brain.clubId && brain.clubId === req.user.clubId) return true;
    if (brain.districtId && brain.districtId === req.user.districtId) return true;
    return false;
}

// ─── Ping (sin auth, sin DB) ───────────────────────────────────────────────
// Endpoint super liviano para verificar que el router brains responde. Útil
// para descartar problemas de Vercel / proxy / autenticación.
// CRITICAL: declarado lo MÁS arriba posible, antes de cualquier middleware
// que pueda colgar. NO usa await, NO toca DB, NO requiere auth.
router.get('/ping', (req, res) => {
    res.set('X-Brains-Version', 'v4.360');
    res.json({
        ok: true,
        version: 'v4.360',
        timestamp: new Date().toISOString(),
        env: {
            vercelRegion: process.env.VERCEL_REGION || null,
            nodeEnv: process.env.NODE_ENV || null,
        },
    });
});

// Helper: race una promise contra un timeout. Si la promise tarda más que
// `ms`, resuelve con el fallback en vez de quedarse colgada indefinidamente.
// Útil cuando el connection pool de Prisma está bloqueado o lento.
const withTimeout = (promise, ms, fallback) => Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(fallback), ms)),
]);

// ─── Migración manual (admin only) ──────────────────────────────────────────
// Crea las tablas Brain/BrainMemory/BrainRelation/BrainDocument si no existen,
// usando CREATE TABLE IF NOT EXISTS. Solo super admin. Útil cuando el deploy
// de Vercel no incluye `prisma db push` y las tablas faltan en producción.
//
// IMPORTANT: declarado ANTES de router.use(ensureReady) porque la migración es
// justamente lo que CREA las tablas.

router.post("/migrate", authMiddleware, async (req, res) => {
    const t0 = Date.now();
    const results = await runBrainMigration();
    _tablesOkUntil = 0;
    _autoMigrationAttempted = true;
    res.json({
        ok: results.every(r => r.ok),
        elapsedMs: Date.now() - t0,
        version: "v4.364",
        results,
        message: "Tablas Brain/BrainMemory/BrainRelation/BrainDocument creadas (o ya existían). Refrescá la página.",
    });
});

// ─── Diagnóstico (admin only) ──────────────────────────────────────────────
// IMPORTANT: declarado ANTES de router.use(ensureReady) porque el diagnóstico
// también tiene que poder reportar el caso "tablas no migradas".

router.get('/diagnose', authMiddleware, roleMiddleware(['administrator']), async (req, res) => {
    const report = {
        timestamp: new Date().toISOString(),
        version: 'v4.354',
        env: {
            geminiConfigured: !!process.env.GEMINI_API_KEY,
            awsConfigured: !!(process.env.AWS_BUCKET_NAME && (process.env.ROTARY_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID)),
            vercelRegion: process.env.VERCEL_REGION || null,
        },
        tables: {},
        brain: {},
        sources: {},
        warnings: [],
    };

    // Check de tablas
    try {
        await prisma.brain.findFirst({ select: { id: true } });
        report.tables.brain = 'ok';
    } catch (err) {
        report.tables.brain = `ERROR: ${err.code || err.message?.slice(0, 100)}`;
        report.warnings.push('Tablas Brain no migradas — correr `npm run db:push` o `prisma db push` en producción.');
    }
    try { await prisma.brainMemory.findFirst({ select: { id: true } }); report.tables.brainMemory = 'ok'; }
    catch (err) { report.tables.brainMemory = `ERROR: ${err.code || err.message?.slice(0, 100)}`; }
    try { await prisma.brainRelation.findFirst({ select: { id: true } }); report.tables.brainRelation = 'ok'; }
    catch (err) { report.tables.brainRelation = `ERROR: ${err.code || err.message?.slice(0, 100)}`; }
    try { await prisma.brainDocument.findFirst({ select: { id: true } }); report.tables.brainDocument = 'ok'; }
    catch (err) {
        report.tables.brainDocument = `ERROR: ${err.code || err.message?.slice(0, 100)}`;
        report.warnings.push('Tabla BrainDocument no migrada — el feature de carga documental (v4.353) requiere `prisma db push` en producción.');
    }

    // Conteos del brain system
    if (report.tables.brain === 'ok') {
        try {
            const [brainsCount, hasMaster, memoriesCount, docsCount, relsCount] = await Promise.all([
                prisma.brain.count(),
                prisma.brain.findFirst({ where: { isMaster: true }, select: { id: true } }),
                prisma.brainMemory.count(),
                report.tables.brainDocument === 'ok' ? prisma.brainDocument.count() : Promise.resolve(null),
                prisma.brainRelation.count(),
            ]);
            report.brain = {
                totalBrains: brainsCount,
                hasMaster: !!hasMaster,
                totalMemories: memoriesCount,
                totalDocuments: docsCount,
                totalRelations: relsCount,
            };
        } catch (err) {
            report.brain.error = err.message?.slice(0, 200);
        }
    }

    // Conteos de las fuentes vs lo ya indexado (= pending de reindex)
    if (report.tables.brain === 'ok') {
        try {
            const [posts, projects, events, knowledge, indexedSourceIds] = await Promise.all([
                prisma.post.count({ where: { clubId: { not: null } } }),
                prisma.project.count({ where: { deletedAt: null, clubId: { not: null } } }),
                prisma.calendarEvent.count(),
                prisma.knowledgeSource.count(),
                prisma.brainMemory.groupBy({
                    by: ['sourceType'],
                    _count: { sourceType: true },
                    where: { sourceType: { in: ['Post', 'Project', 'CalendarEvent', 'KnowledgeSource', 'BrainDocument'] } },
                }),
            ]);
            const indexedMap = Object.fromEntries(indexedSourceIds.map(r => [r.sourceType, r._count.sourceType]));
            report.sources = {
                posts: { total: posts, indexed: indexedMap.Post || 0, pending: Math.max(0, posts - (indexedMap.Post || 0)) },
                projects: { total: projects, indexed: indexedMap.Project || 0, pending: Math.max(0, projects - (indexedMap.Project || 0)) },
                events: { total: events, indexed: indexedMap.CalendarEvent || 0, pending: Math.max(0, events - (indexedMap.CalendarEvent || 0)) },
                knowledge: { total: knowledge, indexed: indexedMap.KnowledgeSource || 0, pending: Math.max(0, knowledge - (indexedMap.KnowledgeSource || 0)) },
                documents: indexedMap.BrainDocument || 0,
            };

            const totalPending = report.sources.posts.pending + report.sources.projects.pending +
                                 report.sources.events.pending + report.sources.knowledge.pending;
            report.totalPending = totalPending;
            if (totalPending === 0 && (posts + projects + events + knowledge) > 0) {
                report.warnings.push('Todo el contenido ya está indexado.');
            }
        } catch (err) {
            report.sources.error = err.message?.slice(0, 200);
        }
    }

    if (!report.env.geminiConfigured) {
        report.warnings.push('GEMINI_API_KEY no está configurada — los embeddings quedan vacíos y la búsqueda semántica no funciona.');
    }

    res.json(report);
});

// ─── List + master ─────────────────────────────────────────────────────────
// ATENCIÓN (v4.360): /ping, /diagnose, /me, /me/initialize, /me/extras están
// declarados ANTES de este `router.use(ensureReady)` para que sigan respondiendo
// incluso si las tablas Brain no están migradas o si la DB está lenta. Ellos
// hacen su propio chequeo defensivo con timeouts.

router.use(ensureReady);

router.get('/', authMiddleware, async (req, res) => {
    try {
        const brains = await visibleBrainsFor(req);
        res.json(brains);
    } catch (err) {
        console.error('[brains] list:', err);
        res.status(500).json({ error: 'Error listing brains' });
    }
});

router.get('/master', authMiddleware, async (req, res) => {
    try {
        const master = await getOrCreateMasterBrain();
        const detail = await getBrainDetail(master.id);
        const stats = await brainGlobalStats();
        res.json({ ...detail, stats });
    } catch (err) {
        console.error('[brains] master:', err);
        res.status(500).json({ error: 'Error fetching master brain' });
    }
});

async function brainGlobalStats() {
    const [brainCount, memoryCount, relationCount, byKind] = await Promise.all([
        prisma.brain.count(),
        prisma.brainMemory.count(),
        prisma.brainRelation.count(),
        prisma.brainMemory.groupBy({ by: ['kind'], _count: { kind: true } }),
    ]);
    return {
        brains: brainCount,
        memories: memoryCount,
        relations: relationCount,
        memoriesByKind: byKind.reduce((acc, r) => ({ ...acc, [r.kind]: r._count.kind }), {}),
    };
}

// ─── Brain del user actual (v4.360 emergency degraded mode) ─────────────────
// Endpoint READ-ONLY con timeouts internos en cada query (Promise.race con
// 5s). Si Prisma está colgado o el connection pool exhausto, devolvemos un
// estado 'degraded' rápido en vez de quedarnos esperando indefinidamente.
//
// v4.360: el problema reportado en producción no era cold start ni código
// pesado — era infraestructura (connection pool / DB lento / Prisma engine).
// Solución: race-condition entre las queries y un timeout, devolvemos lo que
// haya antes de los 5 segundos. Si todo timeoutea, scope='degraded' y el user
// puede reintentar.
router.get('/me', authMiddleware, async (req, res) => {
    const t0 = Date.now();
    const timings = {};
    const QUERY_TIMEOUT_MS = 5000;

    try {
        const masterPromise = withTimeout(
            prisma.brain.findFirst({
                where: { isMaster: true },
                select: { id: true, name: true, memoryCount: true, kind: true },
            }).catch(err => {
                console.warn('[brains/me] master find err:', err.message);
                return { __error: err.code || 'unknown' };
            }),
            QUERY_TIMEOUT_MS,
            { __timeout: true }
        );

        let myBrainPromise = Promise.resolve(null);
        if (req.user?.clubId) {
            myBrainPromise = withTimeout(
                prisma.brain.findUnique({
                    where: { clubId: req.user.clubId },
                    include: {
                        club:     { select: { id: true, name: true, subdomain: true, city: true, country: true, category: true, type: true, logo: true, description: true, email: true, phone: true } },
                        _count:   { select: { memories: true, outgoingRelations: true, incomingRelations: true } },
                    },
                }).catch(err => { console.warn('[brains/me] club brain err:', err.message); return { __error: err.code || 'unknown' }; }),
                QUERY_TIMEOUT_MS,
                { __timeout: true }
            );
        } else if (req.user?.districtId) {
            myBrainPromise = withTimeout(
                prisma.brain.findUnique({
                    where: { districtId: req.user.districtId },
                    include: {
                        district: { select: { id: true, name: true, number: true, subdomain: true } },
                        _count:   { select: { memories: true, outgoingRelations: true, incomingRelations: true } },
                    },
                }).catch(err => { console.warn('[brains/me] district brain err:', err.message); return { __error: err.code || 'unknown' }; }),
                QUERY_TIMEOUT_MS,
                { __timeout: true }
            );
        }

        const onboardingPromise = req.user?.clubId
            ? withTimeout(
                prisma.setting.findFirst({
                    where: { clubId: req.user.clubId, key: 'onboarding_completed' },
                }).catch(() => null),
                QUERY_TIMEOUT_MS,
                null
            )
            : Promise.resolve(null);

        const [masterRaw, myBrainRaw, onboardingRow] = await Promise.all([
            masterPromise, myBrainPromise, onboardingPromise,
        ]);
        timings.queries = Date.now() - t0;

        const masterTimedOut = masterRaw?.__timeout === true;
        const masterErrored = masterRaw?.__error;
        const brainTimedOut = myBrainRaw?.__timeout === true;
        const brainErrored = myBrainRaw?.__error;

        const master = (masterRaw && !masterTimedOut && !masterErrored) ? masterRaw : null;
        const myBrain = (myBrainRaw && !brainTimedOut && !brainErrored) ? myBrainRaw : null;

        // Si TODAS las queries timeoutearon, devolvemos 'degraded' — el panel
        // muestra mensaje de "DB lenta, reintentá" en lugar de spinner perpetuo.
        if (masterTimedOut && (brainTimedOut || !req.user?.clubId && !req.user?.districtId)) {
            return res.json({
                scope: 'degraded',
                detail: 'La base de datos no responde en este momento. Probable connection pool exhausto en Vercel o cold start crítico. Reintentá en unos segundos.',
                timings,
                version: 'v4.360',
                diagnostic: { masterTimedOut, brainTimedOut, masterErrored, brainErrored },
            });
        }

        // Master no existe → not-initialized
        if (!master && !masterTimedOut && !masterErrored) {
            return res.json({
                scope: 'not-initialized',
                reason: 'no-master',
                detail: 'El cerebro maestro aún no fue creado. Hacé click en "Inicializar mi cerebro" para crearlo.',
                clubId: req.user?.clubId || null,
                districtId: req.user?.districtId || null,
                timings,
                version: 'v4.360',
            });
        }

        // Si el master erroreó (no timeout, error real ej. tabla faltante)
        if (masterErrored) {
            return res.json({
                scope: 'degraded',
                detail: `Error de DB al leer el cerebro maestro: ${masterErrored}. Probable tabla Brain no migrada (correr prisma db push).`,
                timings,
                version: 'v4.360',
                diagnostic: { masterErrored },
            });
        }

        if (!req.user?.clubId && !req.user?.districtId) {
            return res.json({
                scope: 'master-only',
                master,
                timings,
                version: 'v4.360',
            });
        }

        if (!myBrain && !brainTimedOut && !brainErrored) {
            return res.json({
                scope: 'not-initialized',
                reason: 'no-site-brain',
                detail: 'El cerebro de tu sitio aún no se creó. Hacé click en "Inicializar mi cerebro" para crearlo a partir de la información del onboarding.',
                clubId: req.user?.clubId || null,
                districtId: req.user?.districtId || null,
                master,
                timings,
                version: 'v4.360',
            });
        }

        // Todo OK
        res.json({
            scope: 'site',
            brain: myBrain,
            master,
            onboarding: {
                completed: onboardingRow?.value === 'true',
                step: null,
            },
            timings,
            version: 'v4.360',
        });
    } catch (err) {
        console.error('[brains] me:', err, 'timings:', timings);
        res.status(500).json({ error: 'Error fetching own brain', detail: err.message?.slice(0, 300), timings, version: 'v4.360' });
    }
});

// POST /api/brains/me/initialize — crea el master y/o el brain del sitio si no
// existen. Separado de /me para que la carga del panel sea siempre rápida.
router.post('/me/initialize', authMiddleware, async (req, res) => {
    const t0 = Date.now();
    try {
        // 1. Master
        const master = await getOrCreateMasterBrain();
        if (!master) {
            return res.status(500).json({ error: 'Could not create master brain' });
        }

        // 2. Brain del user
        let myBrain = null;
        if (req.user?.clubId) {
            myBrain = await getOrCreateBrainForClub(req.user.clubId);
        } else if (req.user?.districtId) {
            myBrain = await getOrCreateBrainForDistrict(req.user.districtId);
        }

        // 3. Sync con onboarding si hay clubId (best effort, fire-and-forget)
        if (myBrain && req.user?.clubId) {
            syncBrainWithOnboarding(req.user.clubId).catch(err =>
                console.warn('[brains/initialize] sync onboarding:', err.message)
            );
        }

        res.json({
            ok: true,
            elapsedMs: Date.now() - t0,
            master: master ? { id: master.id, name: master.name } : null,
            brain: myBrain ? { id: myBrain.id, name: myBrain.name, kind: myBrain.kind } : null,
        });
    } catch (err) {
        console.error('[brains] initialize:', err);
        res.status(500).json({ error: 'Error initializing brain', detail: err.message?.slice(0, 300) });
    }
});

// Carga diferida: memorias recientes + documentos + relaciones detalladas.
// El frontend lo pide después de pintar el hero, así el panel aparece rápido.
router.get('/me/extras', authMiddleware, async (req, res) => {
    try {
        let myBrain = null;
        if (req.user?.clubId) {
            myBrain = await prisma.brain.findUnique({ where: { clubId: req.user.clubId } }).catch(() => null);
        } else if (req.user?.districtId) {
            myBrain = await prisma.brain.findUnique({ where: { districtId: req.user.districtId } }).catch(() => null);
        }
        if (!myBrain) return res.json({ memories: [], documents: [], outgoing: [], incoming: [], documentsCount: 0 });

        const memoriesPromise = prisma.brainMemory.findMany({
            where: { brainId: myBrain.id },
            orderBy: { updatedAt: 'desc' },
            take: 30,
            select: { id: true, kind: true, title: true, content: true, sourceType: true, createdAt: true, updatedAt: true },
        }).catch(() => []);

        const documentsPromise = prisma.brainDocument.findMany({
            where: { brainId: myBrain.id },
            orderBy: { createdAt: 'desc' },
            take: 50,
        }).catch(() => []);

        const documentsCountPromise = prisma.brainDocument.count({ where: { brainId: myBrain.id } }).catch(() => 0);

        const outgoingPromise = prisma.brainRelation.findMany({
            where: { fromBrainId: myBrain.id },
            include: { toBrain: { select: { id: true, name: true, kind: true } } },
        }).catch(() => []);

        const incomingPromise = prisma.brainRelation.findMany({
            where: { toBrainId: myBrain.id },
            include: { fromBrain: { select: { id: true, name: true, kind: true } } },
        }).catch(() => []);

        const [memories, documents, documentsCount, outgoing, incoming] = await Promise.all([
            memoriesPromise, documentsPromise, documentsCountPromise, outgoingPromise, incomingPromise,
        ]);

        res.json({ memories, documents, documentsCount, outgoing, incoming });
    } catch (err) {
        console.error('[brains] me/extras:', err);
        res.status(500).json({ error: 'Error fetching extras', detail: err.message?.slice(0, 300) });
    }
});

// PATCH /api/brains/:id/settings — el admin de sitio edita identityPrompt
// y config del brain. Marca `identityPromptOverridden:true` para que el sync
// del onboarding no pise la customización.
router.patch('/:id/settings', authMiddleware, async (req, res) => {
    try {
        const brain = await prisma.brain.findUnique({ where: { id: req.params.id } });
        if (!brain) return res.status(404).json({ error: 'Brain not found' });

        const canEdit = isSuperAdmin(req) ||
            (brain.clubId && brain.clubId === req.user.clubId) ||
            (brain.districtId && brain.districtId === req.user.districtId);
        if (!canEdit) return res.status(403).json({ error: 'Access denied' });

        const { identityPrompt, config, resetIdentityToAuto } = req.body || {};

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = {};
        const md = brain.metadata || {};

        if (resetIdentityToAuto) {
            // Volver al identityPrompt derivado del Club + quitar el override flag
            const club = brain.clubId ? await prisma.club.findUnique({ where: { id: brain.clubId } }) : null;
            if (club) {
                const { buildIdentityPromptFromClub } = await import('../services/brainService.js');
                data.identityPrompt = buildIdentityPromptFromClub(club);
            }
            data.metadata = { ...md, identityPromptOverridden: false };
        } else if (typeof identityPrompt === 'string') {
            data.identityPrompt = identityPrompt.slice(0, 4000);
            data.metadata = { ...md, identityPromptOverridden: true };
        }

        if (config && typeof config === 'object') {
            const existingConfig = (md.config || {});
            data.metadata = {
                ...(data.metadata || md),
                config: {
                    ...existingConfig,
                    ...config,
                },
            };
        }

        const updated = await prisma.brain.update({ where: { id: brain.id }, data });
        res.json({ ok: true, brain: updated });
    } catch (err) {
        console.error('[brains] settings:', err);
        res.status(500).json({ error: 'Error updating settings', detail: err.message });
    }
});

// POST /api/brains/:id/sync-onboarding — re-extrae info del Club + Settings +
// ContentSections y la persiste como memorias en el brain.
router.post('/:id/sync-onboarding', authMiddleware, async (req, res) => {
    try {
        const brain = await prisma.brain.findUnique({ where: { id: req.params.id } });
        if (!brain) return res.status(404).json({ error: 'Brain not found' });

        const canSync = isSuperAdmin(req) ||
            (brain.clubId && brain.clubId === req.user.clubId);
        if (!canSync) return res.status(403).json({ error: 'Access denied' });

        if (!brain.clubId) return res.status(400).json({ error: 'Brain has no clubId — no hay onboarding del cual sincronizar' });

        const result = await syncBrainWithOnboarding(brain.clubId);
        res.json(result);
    } catch (err) {
        console.error('[brains] sync-onboarding:', err);
        res.status(500).json({ error: 'Error syncing onboarding', detail: err.message });
    }
});

// ─── Brain detail + recent memories ────────────────────────────────────────

router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const detail = await getBrainDetail(req.params.id);
        if (!detail) return res.status(404).json({ error: 'Brain not found' });
        if (!(await userCanReadBrain(req, detail))) return res.status(403).json({ error: 'Access denied' });

        const memories = await listRecentMemories({ brainId: detail.id, limit: 30 });
        res.json({ ...detail, recentMemories: memories });
    } catch (err) {
        console.error('[brains] detail:', err);
        res.status(500).json({ error: 'Error fetching brain' });
    }
});

router.get('/:id/memories', authMiddleware, async (req, res) => {
    try {
        const brain = await prisma.brain.findUnique({ where: { id: req.params.id } });
        if (!brain) return res.status(404).json({ error: 'Brain not found' });
        if (!(await userCanReadBrain(req, brain))) return res.status(403).json({ error: 'Access denied' });

        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const kind = req.query.kind || undefined;
        const memories = await listRecentMemories({ brainId: brain.id, limit, kind });
        res.json(memories);
    } catch (err) {
        console.error('[brains] memories:', err);
        res.status(500).json({ error: 'Error fetching memories' });
    }
});

// ─── Búsqueda semántica ────────────────────────────────────────────────────

router.post('/:id/query', authMiddleware, async (req, res) => {
    try {
        const { query, k = 8, kind } = req.body || {};
        if (!query || !query.trim()) return res.status(400).json({ error: 'query required' });

        const brain = await prisma.brain.findUnique({ where: { id: req.params.id } });
        if (!brain) return res.status(404).json({ error: 'Brain not found' });
        if (!(await userCanReadBrain(req, brain))) return res.status(403).json({ error: 'Access denied' });

        const results = await searchMemories({ brainId: brain.id, query, k, kind });
        res.json({ brain: { id: brain.id, name: brain.name, kind: brain.kind, isMaster: brain.isMaster }, results });
    } catch (err) {
        console.error('[brains] query:', err);
        res.status(500).json({ error: 'Error querying brain' });
    }
});

// Búsqueda global sobre el master (más k para agrupar por brain en el client).
router.post('/master/query', authMiddleware, async (req, res) => {
    try {
        const { query, k = 12, kind } = req.body || {};
        if (!query || !query.trim()) return res.status(400).json({ error: 'query required' });
        const master = await getOrCreateMasterBrain();

        let results = await searchMemories({ brainId: master.id, query, k, kind });

        // Non-super-admins ven solo memorias de su scope.
        if (!isSuperAdmin(req)) {
            const myClub = req.user.clubId;
            const myDistrict = req.user.districtId;
            results = results.filter(r => {
                if (!myClub && !myDistrict) return true;
                if (myClub && r.memory.clubId === myClub) return true;
                if (myDistrict && r.memory.districtId === myDistrict) return true;
                return false;
            });
        }

        res.json({ results });
    } catch (err) {
        console.error('[brains] master query:', err);
        res.status(500).json({ error: 'Error querying master brain' });
    }
});

// ─── Relaciones ────────────────────────────────────────────────────────────

router.post('/relate', authMiddleware, roleMiddleware(['administrator']), async (req, res) => {
    try {
        const { fromBrainId, toBrainId, kind, weight, source } = req.body || {};
        if (!fromBrainId || !toBrainId || !kind) return res.status(400).json({ error: 'fromBrainId, toBrainId, kind required' });
        const rel = await relateBrains({ fromBrainId, toBrainId, kind, weight, source: source || 'manual' });
        res.json(rel);
    } catch (err) {
        console.error('[brains] relate:', err);
        res.status(500).json({ error: 'Error creating relation' });
    }
});

router.get('/master/graph', authMiddleware, async (req, res) => {
    try {
        const [brains, relations] = await Promise.all([
            prisma.brain.findMany({
                select: { id: true, name: true, kind: true, isMaster: true, memoryCount: true,
                          club: { select: { logo: true, subdomain: true } } },
            }),
            prisma.brainRelation.findMany({
                select: { id: true, fromBrainId: true, toBrainId: true, kind: true, weight: true, source: true },
            }),
        ]);

        // El grafo es pública entre clubes del ecosistema — nombres y conteos
        // de memorias no son sensibles. Si en el futuro hay nodos privados,
        // se filtra acá según req.user.role.
        res.json({ nodes: brains, edges: relations });
    } catch (err) {
        console.error('[brains] graph:', err);
        res.status(500).json({ error: 'Error fetching graph' });
    }
});

// Full graph para react-force-graph-3d — incluye brains + memorias como nodos.
// Frontend puede togglear si renderiza solo brains o brains + memorias.
router.get('/graph/full', authMiddleware, async (req, res) => {
    try {
        const includeMemories = req.query.memories !== 'false';
        const memoryLimit = Math.min(parseInt(req.query.memoryLimit) || 500, 2000);

        const [brains, relations] = await Promise.all([
            prisma.brain.findMany({
                select: {
                    id: true, name: true, kind: true, isMaster: true, memoryCount: true,
                    clubId: true, districtId: true,
                    club: { select: { logo: true, subdomain: true, city: true, country: true } },
                    district: { select: { subdomain: true, number: true } },
                },
            }),
            prisma.brainRelation.findMany({
                select: { id: true, fromBrainId: true, toBrainId: true, kind: true, weight: true, source: true },
            }),
        ]);

        let memories = [];
        if (includeMemories) {
            memories = await prisma.brainMemory.findMany({
                take: memoryLimit,
                orderBy: { updatedAt: 'desc' },
                select: {
                    id: true, brainId: true, kind: true, title: true, sourceType: true, sourceId: true,
                    createdAt: true,
                },
            });
        }

        const nodes = [
            ...brains.map(b => ({
                id: `brain:${b.id}`,
                nodeType: 'brain',
                kind: b.kind,
                name: b.name,
                isMaster: b.isMaster,
                memoryCount: b.memoryCount,
                logo: b.club?.logo || null,
                subdomain: b.club?.subdomain || b.district?.subdomain || null,
                location: b.club?.city && b.club?.country ? `${b.club.city}, ${b.club.country}` :
                          b.district?.number ? `Distrito ${b.district.number}` : null,
            })),
            ...memories.map(m => ({
                id: `memory:${m.id}`,
                nodeType: 'memory',
                kind: m.kind,
                name: m.title,
                brainId: `brain:${m.brainId}`,
                sourceType: m.sourceType,
                sourceId: m.sourceId,
                createdAt: m.createdAt,
            })),
        ];

        const links = [
            ...relations.map(r => ({
                source: `brain:${r.fromBrainId}`,
                target: `brain:${r.toBrainId}`,
                linkType: 'relation',
                kind: r.kind,
                weight: r.weight,
            })),
            ...memories.map(m => ({
                source: `memory:${m.id}`,
                target: `brain:${m.brainId}`,
                linkType: 'belongs',
                weight: 0.3,
            })),
        ];

        res.json({
            nodes,
            links,
            stats: { brains: brains.length, memories: memories.length, relations: relations.length },
        });
    } catch (err) {
        console.error('[brains] full graph:', err);
        res.status(500).json({ error: 'Error fetching full graph' });
    }
});

// Export payload para Obsidian Vault — toda la info textual para que el
// frontend arme el ZIP. Filtrado por rol: super admin descarga todo, otros
// solo su scope (master + propio brain + brain del distrito si aplica).
router.get('/export/payload', authMiddleware, async (req, res) => {
    try {
        const isAdmin = req.user?.role === 'administrator';
        const myClubId = req.user?.clubId;
        const myDistrictId = req.user?.districtId;

        const orClauses = [{ isMaster: true }];
        if (myClubId)     orClauses.push({ clubId: myClubId });
        if (myDistrictId) orClauses.push({ districtId: myDistrictId });

        const brainWhere = isAdmin ? {} : { OR: orClauses };

        const brains = await prisma.brain.findMany({
            where: brainWhere,
            include: {
                club: { select: { name: true, subdomain: true, city: true, country: true, category: true, description: true } },
                district: { select: { name: true, number: true, subdomain: true } },
            },
        });

        const brainIds = brains.map(b => b.id);

        const [memories, relations] = await Promise.all([
            prisma.brainMemory.findMany({
                where: { brainId: { in: brainIds } },
                select: {
                    id: true, brainId: true, kind: true, sourceType: true, sourceId: true,
                    title: true, content: true, metadata: true, clubId: true,
                    createdAt: true, updatedAt: true,
                },
                orderBy: { updatedAt: 'desc' },
            }),
            prisma.brainRelation.findMany({
                where: {
                    OR: [
                        { fromBrainId: { in: brainIds } },
                        { toBrainId: { in: brainIds } },
                    ],
                },
                select: { fromBrainId: true, toBrainId: true, kind: true, weight: true, source: true },
            }),
        ]);

        res.json({
            generatedAt: new Date().toISOString(),
            version: 'v4.352',
            scope: isAdmin ? 'global' : 'scoped',
            brains: brains.map(b => ({
                id: b.id,
                name: b.name,
                kind: b.kind,
                isMaster: b.isMaster,
                identityPrompt: b.identityPrompt,
                memoryCount: b.memoryCount,
                clubId: b.clubId,
                districtId: b.districtId,
                club: b.club,
                district: b.district,
                createdAt: b.createdAt,
            })),
            memories,
            relations,
        });
    } catch (err) {
        console.error('[brains] export payload:', err);
        res.status(500).json({ error: 'Error generating export payload', detail: err.message });
    }
});

// ─── Reindex + bootstrap (admin only) ──────────────────────────────────────

// Versión legacy — re-indexa todo en una llamada. Mantenida por compatibilidad
// pero el frontend a partir de v4.354 usa /reindex/batch + /reindex/progress.
router.post('/reindex', authMiddleware, roleMiddleware(['administrator']), async (req, res) => {
    try {
        const onlyKind = req.body?.onlyKind || null;
        const skipExisting = req.body?.skipExisting === true;
        const timeBudgetMs = Math.min(parseInt(req.body?.timeBudgetMs) || 90_000, 110_000);
        const result = await reindexAll({ onlyKind, skipExisting, timeBudgetMs });
        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('[brains] reindex:', err);
        res.status(500).json({ error: 'Error reindexing', detail: err.message });
    }
});

// Reindex paginado (v4.354) — el frontend loopea hasta done=true.
router.post('/reindex/batch', authMiddleware, roleMiddleware(['administrator']), async (req, res) => {
    try {
        const cursor = req.body?.cursor || null;
        const batchSize = Math.min(parseInt(req.body?.batchSize) || 15, 50);
        const timeBudgetMs = Math.min(parseInt(req.body?.timeBudgetMs) || 25_000, 100_000);
        const skipExisting = req.body?.skipExisting !== false;
        const result = await reindexBatch({ cursor, batchSize, timeBudgetMs, skipExisting });
        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('[brains] reindex batch:', err);
        res.status(500).json({ error: 'Error in reindex batch', detail: err.message });
    }
});

router.get('/reindex/progress', authMiddleware, roleMiddleware(['administrator']), async (req, res) => {
    try {
        const data = await reindexProgress();
        if (!data) return res.status(503).json({ error: 'BRAINS_NOT_MIGRATED' });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Error fetching progress', detail: err.message });
    }
});

router.post('/bootstrap', authMiddleware, roleMiddleware(['administrator']), async (req, res) => {
    try {
        const result = await bootstrapRelations();
        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('[brains] bootstrap:', err);
        res.status(500).json({ error: 'Error bootstrapping', detail: err.message });
    }
});

// ─── Documentos del cerebro ────────────────────────────────────────────────
// Cada admin puede subir documentos institucionales (reglamentos, estatutos,
// manuales, etc.) al brain de su sitio. El super admin puede subir al master
// para que la información alimente a todos los cerebros.

router.get('/:id/documents', authMiddleware, async (req, res) => {
    try {
        const brain = await prisma.brain.findUnique({ where: { id: req.params.id } });
        if (!brain) return res.status(404).json({ error: 'Brain not found' });
        if (!(await userCanReadBrain(req, brain))) return res.status(403).json({ error: 'Access denied' });

        const docs = await prisma.brainDocument.findMany({
            where: { brainId: brain.id },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true, filename: true, mimeType: true, size: true, fileUrl: true,
                category: true, description: true, status: true, errorMessage: true,
                chunkCount: true, charCount: true, uploadedBy: true,
                createdAt: true, processedAt: true,
            },
        });
        res.json(docs);
    } catch (err) {
        console.error('[brains] documents list:', err);
        res.status(500).json({ error: 'Error listing documents', detail: err.message });
    }
});

router.post('/:id/documents', authMiddleware, docUpload.single('file'), async (req, res) => {
    try {
        const brain = await prisma.brain.findUnique({ where: { id: req.params.id } });
        if (!brain) return res.status(404).json({ error: 'Brain not found' });

        // Permisos para subir: super admin todo. Resto: solo a su propio brain.
        const canUpload = isSuperAdmin(req) ||
            (brain.clubId && brain.clubId === req.user.clubId) ||
            (brain.districtId && brain.districtId === req.user.districtId);
        if (!canUpload) return res.status(403).json({ error: 'Access denied' });

        if (!req.file) return res.status(400).json({ error: 'file required' });

        const { category, description } = req.body || {};
        const buffer = req.file.buffer;
        const filename = req.file.originalname || 'documento';
        const mimeType = req.file.mimetype || 'application/octet-stream';
        const size = req.file.size || buffer.length;

        // Subir a S3 — clave bajo brains/<brainId>/documents/
        const bucket = process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';
        const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
        const s3Key = `brains/${brain.id}/documents/${Date.now()}-${safeName}`;
        let fileUrl = null;
        try {
            await s3.send(new PutObjectCommand({
                Bucket: bucket,
                Key: s3Key,
                Body: buffer,
                ContentType: mimeType,
            }));
            fileUrl = `https://${bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`;
        } catch (uploadErr) {
            // Si S3 falla, igual procesamos — el binario solo se necesita ahora,
            // y el texto extraído queda en BrainMemory.
            console.warn('[brains] S3 upload fallback:', uploadErr.message);
        }

        // Crear el row en DB
        const doc = await prisma.brainDocument.create({
            data: {
                brainId: brain.id,
                filename,
                mimeType,
                size,
                fileUrl,
                s3Key,
                category: category || null,
                description: description || null,
                status: 'pending',
                uploadedBy: req.user?.userId || req.user?.id || null,
                metadata: {},
            },
        });

        // Procesar async — no bloqueamos la response
        processDocumentSafe({ documentId: doc.id, buffer });

        res.status(202).json({ ok: true, document: doc });
    } catch (err) {
        console.error('[brains] document upload:', err);
        res.status(500).json({ error: 'Error uploading document', detail: err.message });
    }
});

router.delete('/documents/:docId', authMiddleware, async (req, res) => {
    try {
        const doc = await prisma.brainDocument.findUnique({
            where: { id: req.params.docId },
            include: { brain: true },
        });
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        const canDelete = isSuperAdmin(req) ||
            (doc.brain.clubId && doc.brain.clubId === req.user.clubId) ||
            (doc.brain.districtId && doc.brain.districtId === req.user.districtId);
        if (!canDelete) return res.status(403).json({ error: 'Access denied' });

        // Borrar el binario de S3 (best effort)
        if (doc.s3Key) {
            try {
                await s3.send(new DeleteObjectCommand({
                    Bucket: process.env.AWS_BUCKET_NAME || 'rotary-platform-assets',
                    Key: doc.s3Key,
                }));
            } catch (s3Err) {
                console.warn('[brains] s3 delete fallback:', s3Err.message);
            }
        }

        const result = await deleteDocument(doc.id);
        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('[brains] document delete:', err);
        res.status(500).json({ error: 'Error deleting document', detail: err.message });
    }
});

// Re-procesar un documento ya cargado (útil cuando se ajusta el chunking).
router.post('/documents/:docId/reprocess', authMiddleware, async (req, res) => {
    try {
        const doc = await prisma.brainDocument.findUnique({
            where: { id: req.params.docId },
            include: { brain: true },
        });
        if (!doc) return res.status(404).json({ error: 'Document not found' });
        const canReprocess = isSuperAdmin(req) ||
            (doc.brain.clubId && doc.brain.clubId === req.user.clubId) ||
            (doc.brain.districtId && doc.brain.districtId === req.user.districtId);
        if (!canReprocess) return res.status(403).json({ error: 'Access denied' });

        if (!doc.s3Key) return res.status(400).json({ error: 'No s3Key — el archivo original no está disponible para re-procesar.' });

        // Descargar el binario de S3 y volver a procesar
        const obj = await s3.send(new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME || 'rotary-platform-assets',
            Key: doc.s3Key,
        }));
        const chunks = [];
        for await (const chunk of obj.Body) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);

        // Borrar memorias previas, luego procesar
        await prisma.brainMemory.deleteMany({
            where: { sourceType: 'BrainDocument', sourceId: { startsWith: `${doc.id}:` } },
        });
        processDocumentSafe({ documentId: doc.id, buffer });
        res.status(202).json({ ok: true });
    } catch (err) {
        console.error('[brains] document reprocess:', err);
        res.status(500).json({ error: 'Error reprocessing document', detail: err.message });
    }
});

// ─── Ingest manual de nota libre (NOTE kind) ───────────────────────────────

router.post('/:id/notes', authMiddleware, async (req, res) => {
    try {
        const brain = await prisma.brain.findUnique({ where: { id: req.params.id } });
        if (!brain) return res.status(404).json({ error: 'Brain not found' });
        if (!(await userCanReadBrain(req, brain))) return res.status(403).json({ error: 'Access denied' });

        const { title, content } = req.body || {};
        if (!title || !content) return res.status(400).json({ error: 'title & content required' });

        // Para notas, sourceId es generado y el brain dueño es el propio brain.
        const sourceId = `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const result = await ingestMemory({
            clubId: brain.clubId || undefined,
            districtId: brain.districtId || undefined,
            kind: 'NOTE',
            sourceType: 'BrainNote',
            sourceId,
            title,
            content,
            metadata: { authorId: req.user.userId || req.user.id, authoredAt: new Date().toISOString() },
        });
        res.json({ ok: true, sourceId, ...result });
    } catch (err) {
        console.error('[brains] note:', err);
        res.status(500).json({ error: 'Error adding note' });
    }
});

export default router;
