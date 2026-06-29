// ════════════════════════════════════════════════════════════════════
// Banner / Pendón Template Controller
// v4.501.0 — Generador público de pendones (mesa de trabajo 80×180 cm)
//
// El administrador configura, desde Content Studio, la "plantilla por
// defecto" (imagen de fondo + textos/logo por defecto). Esa plantilla se
// sirve públicamente en /generador-pendones para que cualquier persona con
// el enlace pueda editar título/subtítulo + logo de Rotary y descargar un
// PDF apto para impresión a gran escala.
//
// La tabla "BannerTemplate" se crea de forma perezosa en runtime
// (CREATE TABLE IF NOT EXISTS), mismo patrón que el resto de tablas que
// se autogestionan fuera de Prisma (ver routes/public.js → "Lead").
// ════════════════════════════════════════════════════════════════════
import db from '../lib/db.js';

console.log('[bannerTemplateController] v4.513.0 cargado — Generador de Pendones (merge profundo; persistencia de personalización)');

const DEFAULT_WIDTH_CM = 80;
const DEFAULT_HEIGHT_CM = 180;

// Configuración por defecto que se devuelve aunque el admin todavía no haya
// guardado una plantilla, para que el generador público siempre funcione.
export const DEFAULT_CONFIG = {
    logo: { url: null, scale: 1 },
    people: [
        { name: 'Francesco Arezzo', role: 'Presidente, Rotary International', period: '(Periodo Rotario 2025-2026)' },
        { name: 'Jorge Raúl Ossa Botero', role: 'Gobernador, Rotary Distrito 4281', period: '(Periodo Rotario 2025-2026)' },
        { name: 'Pedro Alejandro Castillo', role: 'Presidente, Club Rotario Yopal', period: '(Periodo Rotario 2025-2026)' },
    ],
    colors: { name: '#17458f', role: '#2a5cb8', period: '#6b7da0' },
    sizes: { name: 6.5, role: 3.5, period: 2.5 },
    footer: { show: true, logoUrl: null, logoScale: 1 },
    margins: { x: 6, y: 4 },
    offsets: {},
};

let _tableReady = false;
const ensureTable = async () => {
    if (_tableReady) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS "BannerTemplate" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            name VARCHAR(255) NOT NULL DEFAULT 'Plantilla de Pendón',
            "backgroundUrl" TEXT,
            "widthCm" INTEGER NOT NULL DEFAULT ${DEFAULT_WIDTH_CM},
            "heightCm" INTEGER NOT NULL DEFAULT ${DEFAULT_HEIGHT_CM},
            config JSONB NOT NULL DEFAULT '{}',
            "isActive" BOOLEAN NOT NULL DEFAULT true,
            "clubId" TEXT,
            "createdAt" TIMESTAMPTZ DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    _tableReady = true;
};

// Merge profundo: los valores guardados (over) siempre mandan; los campos que
// falten (p. ej. nuevos en una actualización) se completan con los defaults.
// Los arrays (p. ej. `people`) se reemplazan tal cual (no se fusionan por índice).
const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
const deepMerge = (base, over) => {
    if (over === undefined || over === null) return base;
    if (!isPlainObject(base) || !isPlainObject(over)) return over;
    const out = { ...base };
    for (const k of Object.keys(over)) {
        out[k] = (isPlainObject(base[k]) && isPlainObject(over[k])) ? deepMerge(base[k], over[k]) : over[k];
    }
    return out;
};

const normalizeRow = (row) => {
    if (!row) return null;
    let config = row.config;
    if (typeof config === 'string') {
        try { config = JSON.parse(config); } catch { config = {}; }
    }
    return {
        id: row.id,
        name: row.name,
        backgroundUrl: row.backgroundUrl,
        widthCm: row.widthCm,
        heightCm: row.heightCm,
        config: deepMerge(DEFAULT_CONFIG, config || {}),
        isActive: row.isActive,
        clubId: row.clubId,
        updatedAt: row.updatedAt,
    };
};

// Selecciona la plantilla activa. Si hay clubId, prioriza la del club y cae a
// la global (clubId NULL). Si no hay ninguna, devuelve una plantilla virtual
// con la config por defecto (sin imagen de fondo).
const selectActive = async (clubId) => {
    const cid = clubId || null;
    const result = await db.query(
        `SELECT * FROM "BannerTemplate"
         WHERE "isActive" = true AND ("clubId" = $1 OR "clubId" IS NULL)
         ORDER BY ("clubId" = $1) DESC NULLS LAST, "updatedAt" DESC
         LIMIT 1`,
        [cid]
    );
    if (result.rows[0]) return normalizeRow(result.rows[0]);
    return {
        id: null,
        name: 'Plantilla de Pendón',
        backgroundUrl: null,
        widthCm: DEFAULT_WIDTH_CM,
        heightCm: DEFAULT_HEIGHT_CM,
        config: { ...DEFAULT_CONFIG },
        isActive: true,
        clubId: null,
        updatedAt: null,
    };
};

// ── PÚBLICO: GET /api/public/banner-template ──────────────────────────
export const getPublicTemplate = async (req, res) => {
    try {
        await ensureTable();
        const tpl = await selectActive(req.query.clubId);
        res.json(tpl);
    } catch (error) {
        console.error('[bannerTemplate] getPublic:', error);
        // Nunca romper la página pública: devolver la config por defecto.
        res.json({
            id: null, name: 'Plantilla de Pendón', backgroundUrl: null,
            widthCm: DEFAULT_WIDTH_CM, heightCm: DEFAULT_HEIGHT_CM,
            config: { ...DEFAULT_CONFIG }, isActive: true, clubId: null, updatedAt: null,
        });
    }
};

// ── ADMIN: GET /api/banner/template ───────────────────────────────────
// Devuelve la plantilla que el admin de este club (o la global) edita.
export const getAdminTemplate = async (req, res) => {
    try {
        await ensureTable();
        // Los administradores de plataforma editan la global; el resto, la de su club.
        const clubId = req.user?.role === 'administrator' ? (req.query.clubId || null) : (req.user?.clubId || null);
        const tpl = await selectActive(clubId);
        res.json(tpl);
    } catch (error) {
        console.error('[bannerTemplate] getAdmin:', error);
        res.status(500).json({ error: 'No se pudo cargar la plantilla' });
    }
};

// ── ADMIN: PUT /api/banner/template ───────────────────────────────────
// Crea o actualiza la plantilla por defecto (upsert por clubId).
export const saveTemplate = async (req, res) => {
    try {
        await ensureTable();
        const { name, backgroundUrl, widthCm, heightCm, config } = req.body || {};

        // Plataforma → global (clubId NULL). Otros roles → su club.
        const clubId = req.user?.role === 'administrator'
            ? (req.body?.clubId || null)
            : (req.user?.clubId || null);

        const safeConfig = deepMerge(DEFAULT_CONFIG, config || {});
        const w = Number.isFinite(+widthCm) && +widthCm > 0 ? Math.round(+widthCm) : DEFAULT_WIDTH_CM;
        const h = Number.isFinite(+heightCm) && +heightCm > 0 ? Math.round(+heightCm) : DEFAULT_HEIGHT_CM;

        // ¿Existe ya una plantilla para este alcance? (mismo clubId)
        const existing = await db.query(
            `SELECT id FROM "BannerTemplate" WHERE "clubId" IS NOT DISTINCT FROM $1 ORDER BY "updatedAt" DESC LIMIT 1`,
            [clubId]
        );

        let row;
        if (existing.rows[0]) {
            const upd = await db.query(
                `UPDATE "BannerTemplate"
                 SET name = $2, "backgroundUrl" = $3, "widthCm" = $4, "heightCm" = $5,
                     config = $6, "isActive" = true, "updatedAt" = NOW()
                 WHERE id = $1 RETURNING *`,
                [existing.rows[0].id, name || 'Plantilla de Pendón', backgroundUrl || null, w, h, JSON.stringify(safeConfig)]
            );
            row = upd.rows[0];
        } else {
            const ins = await db.query(
                `INSERT INTO "BannerTemplate" (name, "backgroundUrl", "widthCm", "heightCm", config, "isActive", "clubId")
                 VALUES ($1, $2, $3, $4, $5, true, $6) RETURNING *`,
                [name || 'Plantilla de Pendón', backgroundUrl || null, w, h, JSON.stringify(safeConfig), clubId]
            );
            row = ins.rows[0];
        }

        res.json(normalizeRow(row));
    } catch (error) {
        console.error('[bannerTemplate] save:', error);
        res.status(500).json({ error: 'No se pudo guardar la plantilla', details: error.message });
    }
};

// ── PÚBLICO: GET /api/public/banner-image?url=... ─────────────────────
// Proxy de imagen con CORS abierto para que el <canvas> del cliente pueda
// exportar a PDF sin "tainted canvas" (la imagen de fondo vive en S3).
export const proxyBannerImage = async (req, res) => {
    try {
        const { url } = req.query;
        if (!url || typeof url !== 'string') return res.status(400).json({ error: 'URL requerida' });

        // Solo permitimos imágenes de nuestro bucket S3 / dominios de assets,
        // para no convertir esto en un proxy abierto.
        let host;
        try { host = new URL(url).host; } catch { return res.status(400).json({ error: 'URL inválida' }); }
        const allowed = host.endsWith('.amazonaws.com') || host.endsWith('amazonaws.com')
            || host.endsWith('.clubplatform.org') || host.endsWith('cloudfront.net');
        if (!allowed) return res.status(403).json({ error: 'Origen no permitido' });

        const response = await fetch(url);
        if (!response.ok) return res.status(502).json({ error: 'No se pudo obtener la imagen' });
        const buffer = Buffer.from(await response.arrayBuffer());
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=3600');
        res.set('Access-Control-Allow-Origin', '*');
        res.send(buffer);
    } catch (error) {
        console.error('[bannerTemplate] proxyImage:', error);
        res.status(500).json({ error: 'Error al obtener la imagen' });
    }
};
