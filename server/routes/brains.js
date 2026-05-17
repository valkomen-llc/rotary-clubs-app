// ─────────────────────────────────────────────────────────────────────────────
// 🧠 BRAINS API v4.351 — Endpoints del Centro de Inteligencia
//
// Reglas de acceso:
//   - administrator: ve todo (master + todos los brains)
//   - resto: ve solo el brain de su club / distrito + el master en read-only
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
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
    ingestMemory,
} from '../services/brainService.js';

const router = express.Router();

// Antes de cualquier endpoint, validamos que las tablas existan. Si están
// dormant (db push pendiente), devolvemos 503 con un mensaje accionable.
const ensureReady = async (req, res, next) => {
    try {
        await prisma.brain.findFirst({ select: { id: true } });
        next();
    } catch (err) {
        if (err?.code === 'P2021' || /does not exist/i.test(err.message || '')) {
            return res.status(503).json({
                error: 'BRAINS_NOT_MIGRATED',
                message: 'El sistema de cerebros aún no está activo en este entorno. Corré `npm run db:push` para crear las tablas.',
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

// ─── List + master ─────────────────────────────────────────────────────────

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

// ─── Reindex + bootstrap (admin only) ──────────────────────────────────────

router.post('/reindex', authMiddleware, roleMiddleware(['administrator']), async (req, res) => {
    try {
        const onlyKind = req.body?.onlyKind || null;
        const result = await reindexAll({ onlyKind });
        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('[brains] reindex:', err);
        res.status(500).json({ error: 'Error reindexing', detail: err.message });
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
