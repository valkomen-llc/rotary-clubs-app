// ─────────────────────────────────────────────────────────────────────────────
// 🧠 BRAIN SERVICE v4.351 — Cerebros IA distribuidos para Club Platform
//
// Cada Brain es una unidad de inteligencia: un MASTER global (singleton) +
// uno por sitio (Club / District). Las BrainMemory son fragmentos indexados
// con embedding de Gemini text-embedding-004 (768d). BrainRelation es el
// grafo entre cerebros (PARENT_OF, MEMBER_OF, COLLABORATES_WITH, etc.).
// La búsqueda semántica usa cosine en JS — suficiente hasta ~50k memorias
// por brain. Cuando crezca, migramos a pgvector.
// ─────────────────────────────────────────────────────────────────────────────
import prisma from '../lib/prisma.js';

console.log('🧠 BRAIN SERVICE v4.353 — cerebros + grafo 3D + obsidian export + carga documental + reindex resiliente 📚');

// Las tablas Brain/BrainMemory/BrainRelation se crean vía `prisma db push`.
// Hasta que ese push se corra en producción, todas las operaciones aquí
// fallarían con P2021 (relation does not exist). Para no romper los flujos
// existentes (crear post / project / event), chequeamos una vez por proceso
// y si no existen, marcamos el servicio como dormant — todas las funciones
// devuelven null/empty silenciosamente hasta que el deploy migre el schema.
let _tablesReady = null;
async function ensureTables() {
    if (_tablesReady !== null) return _tablesReady;
    try {
        await prisma.brain.findFirst({ select: { id: true } });
        _tablesReady = true;
        return true;
    } catch (err) {
        if (err?.code === 'P2021' || /does not exist|relation .* does not exist/i.test(err.message || '')) {
            console.warn('[brainService] tablas Brain/* aún no existen — corré `npm run db:push` para activarlas. Servicio en dormant mode.');
        } else {
            console.warn('[brainService] table check error:', err.message);
        }
        _tablesReady = false;
        return false;
    }
}

const EMBED_MODEL = 'text-embedding-004';
const EMBED_DIMS  = 768;
const EMBED_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent`;

// Map Club.category → Brain.kind. Default a CLUB para el resto.
const CATEGORY_TO_KIND = {
    club: 'CLUB',
    association: 'ASSOCIATION',
    exchange_program: 'PROGRAM',
    event: 'EVENT',
    conference: 'CONFERENCE',
    project_fair: 'PROJECT_FAIR',
    foundation: 'FOUNDATION',
};

const truncate = (str, max = 8000) => {
    if (!str) return '';
    const s = String(str);
    return s.length > max ? s.slice(0, max) : s;
};

// ─── Embeddings ──────────────────────────────────────────────────────────────

export async function embedText(text) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        // Sin API key devolvemos un vector vacío; la ingesta continúa y la
        // memory queda persistida sin embedding. Search la ignorará.
        return [];
    }
    const cleaned = truncate(text, 8000);
    if (!cleaned.trim()) return [];

    const url = `${EMBED_ENDPOINT}?key=${encodeURIComponent(key)}`;
    const body = {
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text: cleaned }] },
    };

    try {
        const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!r.ok) {
            const errText = await r.text().catch(() => '');
            console.warn(`[brainService] embed ${r.status}:`, errText.slice(0, 200));
            return [];
        }
        const data = await r.json();
        const values = data?.embedding?.values;
        if (!Array.isArray(values) || values.length !== EMBED_DIMS) return [];
        return values;
    } catch (err) {
        console.warn('[brainService] embed error:', err.message);
        return [];
    }
}

// Cosine similarity entre dos vectores del mismo tamaño. Asume L2 > 0.
function cosine(a, b) {
    if (!a || !b || a.length === 0 || a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na  += a[i] * a[i];
        nb  += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 0 : dot / denom;
}

// ─── Brain getters / creators ────────────────────────────────────────────────

export async function getOrCreateMasterBrain() {
    if (!(await ensureTables())) return null;
    let master = await prisma.brain.findFirst({ where: { isMaster: true } });
    if (master) return master;
    master = await prisma.brain.create({
        data: {
            kind: 'MASTER',
            name: 'Club Platform AI Core',
            isMaster: true,
            identityPrompt:
                'Eres el Cerebro Maestro de Club Platform. Conoces todos los clubes, ' +
                'distritos, asociaciones y programas conectados al ecosistema rotario. ' +
                'Tu rol es coordinar, relacionar y construir memoria institucional global.',
        },
    });
    return master;
}

export async function getOrCreateBrainForClub(clubId) {
    if (!clubId) return null;
    if (!(await ensureTables())) return null;
    const existing = await prisma.brain.findUnique({ where: { clubId } });
    if (existing) return existing;

    const club = await prisma.club.findUnique({ where: { id: clubId } });
    if (!club) return null;

    const kind = CATEGORY_TO_KIND[club.category] || 'CLUB';
    return prisma.brain.create({
        data: {
            kind,
            name: club.name,
            clubId: club.id,
            identityPrompt:
                `Eres el cerebro de "${club.name}". Aprende únicamente de este sitio: ` +
                `recuerda sus proyectos, directivos, líneas de acción, eventos y voz. ` +
                `Genera contenido coherente con su identidad.`,
            metadata: {
                city: club.city,
                country: club.country,
                subdomain: club.subdomain,
                category: club.category,
                type: club.type,
            },
        },
    });
}

export async function getOrCreateBrainForDistrict(districtId) {
    if (!districtId) return null;
    if (!(await ensureTables())) return null;
    const existing = await prisma.brain.findUnique({ where: { districtId } });
    if (existing) return existing;

    const district = await prisma.district.findUnique({ where: { id: districtId } });
    if (!district) return null;

    return prisma.brain.create({
        data: {
            kind: 'DISTRICT',
            name: district.name,
            districtId: district.id,
            identityPrompt:
                `Eres el cerebro del Distrito ${district.number || ''} — ${district.name}. ` +
                `Coordina los clubes afiliados y construye una visión distrital.`,
            metadata: {
                number: district.number,
                governor: district.governor,
                subdomain: district.subdomain,
            },
        },
    });
}

// Resuelve el brain correcto para un clubId. Si tiene districtId, también lo
// devuelve para que ingestMemory pueda replicar.
export async function resolveBrainsForClub(clubId) {
    if (!clubId) return { site: null, district: null };
    const club = await prisma.club.findUnique({
        where: { id: clubId },
        select: { id: true, districtId: true },
    });
    if (!club) return { site: null, district: null };

    const [site, district] = await Promise.all([
        getOrCreateBrainForClub(clubId),
        club.districtId ? getOrCreateBrainForDistrict(club.districtId) : Promise.resolve(null),
    ]);
    return { site, district };
}

// ─── Ingestión de memorias ───────────────────────────────────────────────────

// Crea memorias en: brain del sitio, brain del distrito (si aplica) y master.
// Todas comparten el mismo (sourceType, sourceId) para idempotencia.
// kind ∈ POST | PROJECT | EVENT | KNOWLEDGE | MEMBER | DOCUMENT | PUBLICATION | NOTE.
export async function ingestMemory({
    clubId,
    districtId,
    kind,
    sourceId,
    sourceType,
    title,
    content,
    metadata = {},
}) {
    if (!sourceId || !sourceType) {
        console.warn('[brainService] ingestMemory: sourceId & sourceType required');
        return null;
    }
    if (!(await ensureTables())) return null;
    const safeTitle = (title || '').toString().slice(0, 300) || '(sin título)';
    const safeContent = truncate(content || '', 12000);
    const embedInput = `${safeTitle}\n\n${safeContent}`.trim();

    // Resolver targets
    const master = await getOrCreateMasterBrain();
    let site = null;
    let district = null;
    if (clubId) {
        const resolved = await resolveBrainsForClub(clubId);
        site = resolved.site;
        district = resolved.district;
    } else if (districtId) {
        district = await getOrCreateBrainForDistrict(districtId);
    }

    // Una sola llamada a embed, todos los brains comparten el vector.
    const embedding = await embedText(embedInput);

    const targets = [master, site, district].filter(Boolean);
    const results = [];

    for (const brain of targets) {
        try {
            const row = await prisma.brainMemory.upsert({
                where: {
                    brainId_sourceType_sourceId: {
                        brainId: brain.id,
                        sourceType,
                        sourceId,
                    },
                },
                update: {
                    title: safeTitle,
                    content: safeContent,
                    embedding,
                    metadata,
                    clubId: clubId || null,
                    districtId: districtId || null,
                    kind,
                    updatedAt: new Date(),
                },
                create: {
                    brainId: brain.id,
                    kind,
                    sourceType,
                    sourceId,
                    title: safeTitle,
                    content: safeContent,
                    embedding,
                    metadata,
                    clubId: clubId || null,
                    districtId: districtId || null,
                },
            });
            results.push(row);
        } catch (err) {
            console.warn(`[brainService] ingest fail brain=${brain.id}:`, err.message);
        }
    }

    // Refrescar memoryCount de cada brain afectado (no crítico — en background).
    Promise.all(targets.map(b =>
        prisma.brainMemory.count({ where: { brainId: b.id } }).then(count =>
            prisma.brain.update({ where: { id: b.id }, data: { memoryCount: count } })
        ).catch(() => {})
    )).catch(() => {});

    return { embeddingLength: embedding.length, written: results.length };
}

// Helper non-blocking — para enganchar desde controllers sin esperar.
// El caller invoca el original, devuelve la response al cliente y dispara
// ingestMemorySafe en paralelo. Si falla, solo logueamos.
export function ingestMemorySafe(payload) {
    return ingestMemory(payload).catch(err =>
        console.warn('[brainService] ingestMemorySafe error:', err.message)
    );
}

// ─── Búsqueda semántica ──────────────────────────────────────────────────────

// Busca top-k memorias dentro de un brain (o todos si brainId == null).
// Devuelve [{ memory, score }] ordenado por score desc.
export async function searchMemories({ brainId, query, k = 8, kind }) {
    if (!(await ensureTables())) return [];
    const qVec = await embedText(query);
    if (qVec.length === 0) {
        // Sin embedding viable, fallback a búsqueda por LIKE simple.
        const rows = await prisma.brainMemory.findMany({
            where: {
                ...(brainId ? { brainId } : {}),
                ...(kind ? { kind } : {}),
                OR: [
                    { title:   { contains: query, mode: 'insensitive' } },
                    { content: { contains: query, mode: 'insensitive' } },
                ],
            },
            take: k,
            orderBy: { createdAt: 'desc' },
        });
        return rows.map(m => ({ memory: m, score: 0 }));
    }

    // KNN en JS: traemos las memorias (filtradas por brainId si vino) y
    // ordenamos por cosine. Para volúmenes <50k esto es rápido.
    const memories = await prisma.brainMemory.findMany({
        where: {
            ...(brainId ? { brainId } : {}),
            ...(kind ? { kind } : {}),
        },
        // Si crece mucho, podemos paginar y batchear. Por ahora pull-all.
        take: 5000,
        orderBy: { updatedAt: 'desc' },
    });

    const scored = memories
        .map(m => ({ memory: m, score: cosine(qVec, m.embedding || []) }))
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, k);

    return scored;
}

// ─── Relaciones entre brains ─────────────────────────────────────────────────

export async function relateBrains({ fromBrainId, toBrainId, kind, weight = 1.0, source = 'auto', metadata = {} }) {
    if (!fromBrainId || !toBrainId || fromBrainId === toBrainId) return null;
    try {
        return await prisma.brainRelation.upsert({
            where: {
                fromBrainId_toBrainId_kind: { fromBrainId, toBrainId, kind },
            },
            update: { weight, source, metadata },
            create: { fromBrainId, toBrainId, kind, weight, source, metadata },
        });
    } catch (err) {
        console.warn('[brainService] relateBrains error:', err.message);
        return null;
    }
}

// Construye las relaciones deterministas iniciales:
//   MASTER -[PARENT_OF]-> *
//   Club   -[MEMBER_OF]-> District
//   SponsoredClub.club -[PARTICIPATES_IN]-> SponsoredClub.parentClub
export async function bootstrapRelations() {
    const master = await getOrCreateMasterBrain();
    let edges = 0;

    // 1. MASTER → todos los brains
    const allBrains = await prisma.brain.findMany({ where: { isMaster: false } });
    for (const b of allBrains) {
        const r = await relateBrains({
            fromBrainId: master.id,
            toBrainId: b.id,
            kind: 'PARENT_OF',
            source: 'auto',
        });
        if (r) edges++;
    }

    // 2. Club → District (MEMBER_OF) cuando Club.districtId existe
    const clubsWithDistrict = await prisma.club.findMany({
        where: { districtId: { not: null } },
        select: { id: true, districtId: true },
    });
    for (const c of clubsWithDistrict) {
        const [clubBrain, districtBrain] = await Promise.all([
            getOrCreateBrainForClub(c.id),
            getOrCreateBrainForDistrict(c.districtId),
        ]);
        if (clubBrain && districtBrain) {
            const r = await relateBrains({
                fromBrainId: clubBrain.id,
                toBrainId: districtBrain.id,
                kind: 'MEMBER_OF',
                source: 'auto',
            });
            if (r) edges++;
        }
    }

    // SponsoredClub no es club-a-club: es un sub-grupo (rotaract/interact) que
    // vive dentro del club padrino. No genera relación entre cerebros.
    // SIMILAR_TO (clubes con proyectos parecidos) llega en v4.352 con vector
    // matching cross-brain.

    return { master: master.id, brains: allBrains.length, edges };
}

// ─── Backfill / reindex ──────────────────────────────────────────────────────

// Re-ingesta todo el contenido existente como memorias. Idempotente gracias al
// upsert sobre (brainId, sourceType, sourceId).
//
// Resiliencia (v4.353):
//   - Cada error individual se captura con detalle (primer error preservado
//     en `firstError` para mostrar al user el motivo concreto del fallo).
//   - Soporta `timeBudgetMs` (default 90s, < Vercel maxDuration de 120s) para
//     cortar el batch antes del timeout HTTP y devolver progreso parcial.
//   - Cuando se corta por tiempo, `truncated: true` y el caller puede llamar
//     /reindex de nuevo para continuar (los items ya procesados se saltean por
//     el upsert idempotente y la skip-list de sourceId existentes).
//   - Soporta `skipExisting: true` para saltear memorias ya indexadas — útil
//     cuando se llama repetidamente para continuar un reindex incompleto.
export async function reindexAll({ onlyKind, timeBudgetMs = 90_000, skipExisting = false } = {}) {
    const stats = {
        posts: 0, projects: 0, events: 0, knowledge: 0,
        skipped: 0, errors: 0,
        firstError: null, lastError: null,
    };
    const deadline = Date.now() + timeBudgetMs;
    const want = (k) => !onlyKind || onlyKind === k;

    const captureErr = (where, err) => {
        stats.errors++;
        const msg = `${where}: ${err?.message || String(err)}`.slice(0, 400);
        if (!stats.firstError) stats.firstError = msg;
        stats.lastError = msg;
    };

    // Pre-cargar sourceIds ya existentes por tipo para skip rápido
    let existing = null;
    if (skipExisting) {
        const rows = await prisma.brainMemory.findMany({
            where: { sourceType: { in: ['Post', 'Project', 'CalendarEvent', 'KnowledgeSource'] } },
            select: { sourceType: true, sourceId: true },
        });
        existing = new Set(rows.map(r => `${r.sourceType}:${r.sourceId}`));
    }
    const shouldSkip = (type, id) => existing && existing.has(`${type}:${id}`);

    if (want('POST') && Date.now() < deadline) {
        const posts = await prisma.post.findMany({
            where: { clubId: { not: null } },
            select: { id: true, title: true, content: true, clubId: true, category: true, published: true, createdAt: true },
        });
        for (const p of posts) {
            if (Date.now() >= deadline) return { stats, truncated: true };
            if (shouldSkip('Post', p.id)) { stats.skipped++; continue; }
            try {
                await ingestMemory({
                    clubId: p.clubId,
                    kind: 'POST',
                    sourceType: 'Post',
                    sourceId: p.id,
                    title: p.title || '(sin título)',
                    content: p.content || '',
                    metadata: { category: p.category, published: p.published, createdAt: p.createdAt },
                });
                stats.posts++;
            } catch (err) { captureErr(`Post ${p.id}`, err); }
        }
    }

    if (want('PROJECT') && Date.now() < deadline) {
        const projects = await prisma.project.findMany({
            where: { deletedAt: null, clubId: { not: null } },
            select: { id: true, title: true, description: true, clubId: true, category: true, status: true, impacto: true, ubicacion: true, beneficiarios: true, createdAt: true },
        });
        for (const p of projects) {
            if (Date.now() >= deadline) return { stats, truncated: true };
            if (shouldSkip('Project', p.id)) { stats.skipped++; continue; }
            try {
                await ingestMemory({
                    clubId: p.clubId,
                    kind: 'PROJECT',
                    sourceType: 'Project',
                    sourceId: p.id,
                    title: p.title || '(sin título)',
                    content: [p.description, p.impacto].filter(Boolean).join('\n\n'),
                    metadata: { category: p.category, status: p.status, ubicacion: p.ubicacion, beneficiarios: p.beneficiarios },
                });
                stats.projects++;
            } catch (err) { captureErr(`Project ${p.id}`, err); }
        }
    }

    if (want('EVENT') && Date.now() < deadline) {
        const events = await prisma.calendarEvent.findMany({
            select: { id: true, title: true, description: true, htmlContent: true, clubId: true, type: true, startDate: true, endDate: true, location: true },
        });
        for (const e of events) {
            if (Date.now() >= deadline) return { stats, truncated: true };
            if (shouldSkip('CalendarEvent', e.id)) { stats.skipped++; continue; }
            try {
                await ingestMemory({
                    clubId: e.clubId,
                    kind: 'EVENT',
                    sourceType: 'CalendarEvent',
                    sourceId: e.id,
                    title: e.title || '(sin título)',
                    content: [e.description, e.htmlContent].filter(Boolean).join('\n\n').replace(/<[^>]+>/g, ' '),
                    metadata: { type: e.type, startDate: e.startDate, endDate: e.endDate, location: e.location },
                });
                stats.events++;
            } catch (err) { captureErr(`Event ${e.id}`, err); }
        }
    }

    if (want('KNOWLEDGE') && Date.now() < deadline) {
        const sources = await prisma.knowledgeSource.findMany();
        for (const k of sources) {
            if (Date.now() >= deadline) return { stats, truncated: true };
            if (shouldSkip('KnowledgeSource', k.id)) { stats.skipped++; continue; }
            try {
                await ingestMemory({
                    clubId: k.clubId,
                    kind: 'KNOWLEDGE',
                    sourceType: 'KnowledgeSource',
                    sourceId: k.id,
                    title: k.title || '(sin título)',
                    content: k.content || '',
                    metadata: { type: k.type, fileUrl: k.fileUrl, isGlobal: !k.clubId },
                });
                stats.knowledge++;
            } catch (err) { captureErr(`KnowledgeSource ${k.id}`, err); }
        }
    }

    // Recalcular relaciones al final (solo si terminamos a tiempo).
    let rel = null;
    if (Date.now() < deadline) {
        try {
            rel = await bootstrapRelations();
        } catch (err) {
            captureErr('bootstrapRelations', err);
        }
    }

    return { stats, relations: rel, truncated: false };
}

// ─── Listado / detalle ───────────────────────────────────────────────────────

export async function listBrains() {
    if (!(await ensureTables())) return [];
    const brains = await prisma.brain.findMany({
        orderBy: [{ isMaster: 'desc' }, { memoryCount: 'desc' }, { name: 'asc' }],
        include: {
            club:     { select: { id: true, name: true, subdomain: true, city: true, country: true, category: true, type: true, logo: true } },
            district: { select: { id: true, name: true, number: true, subdomain: true } },
            _count:   { select: { memories: true, outgoingRelations: true, incomingRelations: true } },
        },
    });
    return brains;
}

export async function getBrainDetail(brainId) {
    if (!(await ensureTables())) return null;
    return prisma.brain.findUnique({
        where: { id: brainId },
        include: {
            club:     { select: { id: true, name: true, subdomain: true, city: true, country: true, category: true } },
            district: { select: { id: true, name: true, number: true, subdomain: true } },
            outgoingRelations: { include: { toBrain:   { select: { id: true, name: true, kind: true } } } },
            incomingRelations: { include: { fromBrain: { select: { id: true, name: true, kind: true } } } },
        },
    });
}

export async function listRecentMemories({ brainId, limit = 20, kind }) {
    if (!(await ensureTables())) return [];
    return prisma.brainMemory.findMany({
        where: { ...(brainId ? { brainId } : {}), ...(kind ? { kind } : {}) },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: {
            id: true, brainId: true, kind: true, sourceId: true, sourceType: true,
            title: true, content: true, clubId: true, createdAt: true, updatedAt: true,
        },
    });
}
