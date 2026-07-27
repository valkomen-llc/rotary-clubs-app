// ════════════════════════════════════════════════════════════════════
// Postulación de Proyectos — Feria de Proyectos Rotary Colombia
// v4.592.0 — Módulo completo: wizard público + pago Stripe + TRM oficial
//            + redirección a Rotary Grants tras la confirmación del pago.
//
// Edición vigente (configurable desde el admin, sin tocar código):
//   12ª Feria de Proyectos Rotary Colombia — Valledupar.
//
// Persistencia: tablas creadas de forma perezosa con SQL crudo
// (CREATE TABLE IF NOT EXISTS), mismo patrón que "BannerTemplate" y "Lead".
// Quedan FUERA de Prisma a propósito: el `prisma db push` del build no las
// toca y la configuración del cliente sobrevive a deploys y migraciones.
// NINGUNA operación aquí es destructiva (no hay DROP/TRUNCATE/DELETE de
// configuración): la fila de config sólo cambia cuando el admin guarda.
//
// Pagos: NO se implementa una integración nueva de Stripe. Se reutiliza la
// cuenta/servicio ya existente (misma STRIPE_SECRET_KEY y el mismo webhook
// de /api/payments/webhook) creando una Checkout Session con
// metadata.type = 'project_fair_registration'.
// ════════════════════════════════════════════════════════════════════
import Stripe from 'stripe';
import db from '../lib/db.js';
import EmailService from '../services/EmailService.js';

console.log('[projectFairController] v4.594.0 cargado — Postulación de Proyectos 12ª Feria de Proyectos Rotary Colombia (Valledupar): wizard + TRM oficial + Stripe + redirección a Rotary Grants. Formulario en /postular-proyecto');

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_12345');
const DEFAULT_FRONTEND_URL = 'https://app.clubplatform.org';
// Slug público del formulario (v4.594). Los anteriores (/feria-proyectos,
// /inscribir-proyecto) siguen funcionando: el frontend los redirige aquí.
const DEFAULT_FORM_PATH = '/postular-proyecto';

// ── Configuración por defecto ───────────────────────────────────────
// SOLO respaldo: los valores guardados por el admin siempre mandan (merge
// profundo). Si se agregan campos nuevos en el futuro, hacerlo de forma
// aditiva y opcional para no invalidar lo ya guardado.
export const DEFAULT_CONFIG = {
    enabled: true,
    formPath: DEFAULT_FORM_PATH,
    edition: {
        number: 12,
        ordinal: '12ª',
        name: '12ª Feria de Proyectos Rotary Colombia',
        city: 'Valledupar',
        country: 'Colombia',
        year: 2026,
        dates: '',
        key: '12-valledupar',
    },
    deadline: '2026-08-10',
    presentation: { maxMinutes: 5 },
    registration: {
        amountCop: 250000,
        currency: 'COP',
        concept: 'Inscripción de proyecto',
        maxProjectsPerClub: 1,
    },
    districts: [
        { value: 'Rotary Distrito 4281', label: 'Rotary Distrito 4281' },
        { value: 'Rotary Distrito 4271', label: 'Rotary Distrito 4271' },
    ],
    // Las siete Áreas de Enfoque de Rotary International. `key` es el valor
    // que se almacena (estable para búsquedas/clasificación) y `label` el
    // texto que ve el usuario.
    focusAreas: [
        { key: 'peace', label: 'Promoción de la Paz.' },
        { key: 'disease_prevention', label: 'Prevención y Tratamiento de Enfermedades.' },
        { key: 'water_sanitation', label: 'Agua, Saneamiento e Higiene.' },
        { key: 'maternal_child_health', label: 'Salud Materno Infantil.' },
        { key: 'basic_education', label: 'Educación Básica y Alfabetización.' },
        { key: 'economic_development', label: 'Desarrollo Económico Comunitario.' },
        { key: 'environment', label: 'Medio Ambiente.' },
    ],
    redirect: {
        url: 'https://grants25a.org/',
        label: 'Continuar hacia Rotary Grants 25A',
        delaySeconds: 8,
        name: 'Rotary Grants 25A',
    },
    trm: {
        provider: 'superfinanciera',
        fallbackProviders: ['open_er_api', 'exchangerate_host'],
        manualRate: null,
        refreshHours: 12,
    },
    content: {
        title: 'Postulación de Proyectos',
        subtitle: '12ª Feria de Proyectos Rotary Colombia — Valledupar',
        intro: 'Los clubes rotarios podrán postular un (1) proyecto para presentarlo durante la 12ª Feria de Proyectos Rotary Colombia, que se realizará en la ciudad de Valledupar. La feria conecta proyectos de alto impacto con potenciales aliados nacionales e internacionales, patrocinadores, financiadores, fundaciones y colaboradores estratégicos.',
        requirements: [
            'Proyectos en ejecución o listos para implementar',
            'Iniciativas que requieran acompañamiento técnico o cofinanciación',
            'Propuestas alineadas con una o varias de las áreas de enfoque de Rotary International',
        ],
        note: 'El proyecto debe estar alineado con al menos una de las siete áreas de enfoque de Rotary International y contar con el Formulario de Necesidades de la Comunidad adjunto.',
        priorityNote: 'Los proyectos inscritos con anterioridad recibirán prioridad en la revisión técnica, observaciones CADRE y traducción oficial al inglés. ¡No dejes pasar esta oportunidad!',
    },
    notifications: {
        adminEmails: [],
        sendReceipt: true,
    },
    // Club/organización a la que se asocia el cobro en la billetera de la
    // plataforma. Si queda vacío, el pago se procesa igual (cuenta master)
    // pero no se registra fila en "Payment".
    clubId: null,
};

const PLATFORM_SENDER = '"Feria de Proyectos Rotary Colombia" <noreply@clubplatform.org>';

// ── Utilidades ──────────────────────────────────────────────────────
const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Merge profundo: lo guardado (over) manda; lo que falte se completa con los
// defaults. Los arrays se reemplazan tal cual (distritos, áreas de enfoque).
const deepMerge = (base, over) => {
    if (over === undefined || over === null) return base;
    if (!isPlainObject(base) || !isPlainObject(over)) return over;
    const out = { ...base };
    for (const k of Object.keys(over)) {
        out[k] = (isPlainObject(base[k]) && isPlainObject(over[k])) ? deepMerge(base[k], over[k]) : over[k];
    }
    return out;
};

const clean = (v, max = 250) => String(v ?? '').trim().slice(0, max);
const isEmail = (v) => /^\S+@\S+\.\S+$/.test(String(v || ''));

// Fecha calendario en Colombia (America/Bogota) → 'YYYY-MM-DD'.
// La TRM se renueva por día calendario colombiano, no por UTC.
const bogotaDate = (date = new Date()) =>
    new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date);

const resolveOrigin = (req, returnUrl) => {
    if (returnUrl && /^https?:\/\//.test(returnUrl)) return returnUrl.replace(/\/$/, '');
    const headerOrigin = req.headers?.origin;
    if (headerOrigin && /^https?:\/\//.test(headerOrigin)) return headerOrigin.replace(/\/$/, '');
    return DEFAULT_FRONTEND_URL;
};

// Ruta pública del formulario. Se normaliza para que siempre empiece con "/"
// y no termine en "/", de modo que las URLs de retorno de Stripe queden bien
// formadas aunque el admin la escriba de otra manera.
const normalizeFormPath = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return DEFAULT_FORM_PATH;
    const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
    return withSlash.replace(/\/+$/, '') || DEFAULT_FORM_PATH;
};

// Referencia corta y legible para el postulante (aparece en el comprobante).
const buildPublicRef = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    return `FP-${s}`;
};

// ── Esquema (creación perezosa, nunca destructiva) ───────────────────
let _tablesReady = false;
const ensureTables = async () => {
    if (_tablesReady) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProjectFairConfig" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            key VARCHAR(80) NOT NULL UNIQUE DEFAULT 'active',
            config JSONB NOT NULL DEFAULT '{}',
            "createdAt" TIMESTAMPTZ DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProjectFairSubmission" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "publicRef" VARCHAR(20),
            "editionKey" VARCHAR(80),
            "firstName" VARCHAR(120),
            "lastName" VARCHAR(120),
            email VARCHAR(200) NOT NULL,
            phone VARCHAR(60),
            "clubName" VARCHAR(200),
            district VARCHAR(160),
            "projectName" VARCHAR(250),
            "projectDescription" TEXT,
            "focusArea" VARCHAR(80),
            "focusAreaLabel" VARCHAR(200),
            "budgetUsd" NUMERIC(14,2),
            status VARCHAR(30) NOT NULL DEFAULT 'pending_payment',
            "amountCop" NUMERIC(14,2),
            "amountUsd" NUMERIC(14,2),
            "trmRate" NUMERIC(14,4),
            "trmDate" VARCHAR(10),
            "trmSource" VARCHAR(80),
            "trmFetchedAt" TIMESTAMPTZ,
            "stripeSessionId" TEXT,
            "stripePaymentIntentId" TEXT,
            "paidAt" TIMESTAMPTZ,
            "clubId" TEXT,
            metadata JSONB DEFAULT '{}',
            "createdAt" TIMESTAMPTZ DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "ProjectFairSubmission_status_idx" ON "ProjectFairSubmission" (status);`).catch(() => {});
    await db.query(`CREATE INDEX IF NOT EXISTS "ProjectFairSubmission_email_idx" ON "ProjectFairSubmission" (email);`).catch(() => {});
    await db.query(`CREATE INDEX IF NOT EXISTS "ProjectFairSubmission_session_idx" ON "ProjectFairSubmission" ("stripeSessionId");`).catch(() => {});
    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProjectFairTrm" (
            date VARCHAR(10) PRIMARY KEY,
            rate NUMERIC(14,4) NOT NULL,
            source VARCHAR(80),
            "fetchedAt" TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    _tablesReady = true;
};

// ── Configuración ────────────────────────────────────────────────────
const readConfig = async () => {
    await ensureTables();
    const { rows } = await db.query('SELECT config FROM "ProjectFairConfig" WHERE key = $1 LIMIT 1', ['active']);
    let saved = rows[0]?.config || {};
    if (typeof saved === 'string') {
        try { saved = JSON.parse(saved); } catch { saved = {}; }
    }
    return deepMerge(DEFAULT_CONFIG, saved);
};

// Config pública: sin datos sensibles de operación (clubId, correos internos).
const toPublicConfig = (cfg) => ({
    enabled: cfg.enabled !== false,
    formPath: normalizeFormPath(cfg.formPath),
    edition: cfg.edition,
    deadline: cfg.deadline,
    presentation: cfg.presentation,
    registration: {
        amountCop: Number(cfg.registration?.amountCop) || 0,
        currency: cfg.registration?.currency || 'COP',
        concept: cfg.registration?.concept || 'Inscripción de proyecto',
        maxProjectsPerClub: cfg.registration?.maxProjectsPerClub ?? 1,
    },
    districts: Array.isArray(cfg.districts) ? cfg.districts : [],
    focusAreas: Array.isArray(cfg.focusAreas) ? cfg.focusAreas : [],
    redirect: cfg.redirect,
    content: cfg.content,
});

// GET /api/project-fair/config  (público)
export const getPublicConfig = async (_req, res) => {
    try {
        const cfg = await readConfig();
        res.json(toPublicConfig(cfg));
    } catch (error) {
        console.error('[project-fair] getPublicConfig:', error);
        res.status(500).json({ error: 'No se pudo cargar la configuración de la convocatoria' });
    }
};

// GET /api/project-fair/admin/config  (admin)
export const getAdminConfig = async (_req, res) => {
    try {
        res.json(await readConfig());
    } catch (error) {
        console.error('[project-fair] getAdminConfig:', error);
        res.status(500).json({ error: 'No se pudo cargar la configuración' });
    }
};

// PUT /api/project-fair/admin/config  (admin)
// Merge profundo sobre lo YA guardado: nunca se resetea la configuración del
// cliente, sólo se sobreescriben las claves que llegan en el cuerpo.
export const saveAdminConfig = async (req, res) => {
    try {
        await ensureTables();
        const incoming = isPlainObject(req.body) ? req.body : {};

        const { rows } = await db.query('SELECT config FROM "ProjectFairConfig" WHERE key = $1 LIMIT 1', ['active']);
        let current = rows[0]?.config || {};
        if (typeof current === 'string') {
            try { current = JSON.parse(current); } catch { current = {}; }
        }
        const merged = deepMerge(current, incoming);

        await db.query(`
            INSERT INTO "ProjectFairConfig" (key, config, "updatedAt")
            VALUES ($1, $2::jsonb, NOW())
            ON CONFLICT (key) DO UPDATE SET config = $2::jsonb, "updatedAt" = NOW()
        `, ['active', JSON.stringify(merged)]);

        res.json(deepMerge(DEFAULT_CONFIG, merged));
    } catch (error) {
        console.error('[project-fair] saveAdminConfig:', error);
        res.status(500).json({ error: 'No se pudo guardar la configuración' });
    }
};

// ── TRM (Tasa Representativa del Mercado) ────────────────────────────
// Nunca se usan valores estáticos: se consulta un proveedor cuya fuente es la
// TRM oficial de la Superintendencia Financiera de Colombia (por defecto, el
// dataset abierto de datos.gov.co) con proveedores de respaldo configurables.
const TRM_PROVIDERS = {
    // Fuente oficial: Superintendencia Financiera de Colombia, publicada en
    // el portal de Datos Abiertos (dataset 32sa-8pi3).
    superfinanciera: {
        label: 'Superintendencia Financiera de Colombia (datos.gov.co)',
        fetch: async () => {
            const url = 'https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde%20DESC';
            const r = await fetch(url, { headers: { Accept: 'application/json' } });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const rows = await r.json();
            const row = Array.isArray(rows) ? rows[0] : null;
            const rate = Number(row?.valor);
            if (!rate || !isFinite(rate)) throw new Error('Respuesta sin valor de TRM');
            return { rate, validFrom: row?.vigenciadesde || null, validTo: row?.vigenciahasta || null };
        },
    },
    open_er_api: {
        label: 'open.er-api.com',
        fetch: async () => {
            const r = await fetch('https://open.er-api.com/v6/latest/USD');
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            const rate = Number(data?.rates?.COP);
            if (!rate) throw new Error('Respuesta sin COP');
            return { rate };
        },
    },
    exchangerate_host: {
        label: 'exchangerate.host',
        fetch: async () => {
            const key = process.env.EXCHANGERATE_HOST_KEY;
            const url = key
                ? `https://api.exchangerate.host/live?access_key=${encodeURIComponent(key)}&source=USD&currencies=COP`
                : 'https://api.exchangerate.host/latest?base=USD&symbols=COP';
            const r = await fetch(url);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            const rate = Number(data?.quotes?.USDCOP ?? data?.rates?.COP);
            if (!rate) throw new Error('Respuesta sin COP');
            return { rate };
        },
    },
    openexchangerates: {
        label: 'openexchangerates.org',
        fetch: async () => {
            const appId = process.env.OPENEXCHANGERATES_APP_ID;
            if (!appId) throw new Error('Falta OPENEXCHANGERATES_APP_ID');
            const r = await fetch(`https://openexchangerates.org/api/latest.json?app_id=${encodeURIComponent(appId)}&symbols=COP`);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            const rate = Number(data?.rates?.COP);
            if (!rate) throw new Error('Respuesta sin COP');
            return { rate };
        },
    },
    currencyapi: {
        label: 'currencyapi.com',
        fetch: async () => {
            const key = process.env.CURRENCY_API_KEY;
            if (!key) throw new Error('Falta CURRENCY_API_KEY');
            const r = await fetch(`https://api.currencyapi.com/v3/latest?apikey=${encodeURIComponent(key)}&base_currency=USD&currencies=COP`);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            const rate = Number(data?.data?.COP?.value);
            if (!rate) throw new Error('Respuesta sin COP');
            return { rate };
        },
    },
    apilayer: {
        label: 'apilayer — Exchange Rates Data API',
        fetch: async () => {
            const key = process.env.APILAYER_KEY;
            if (!key) throw new Error('Falta APILAYER_KEY');
            const r = await fetch('https://api.apilayer.com/exchangerates_data/latest?base=USD&symbols=COP', {
                headers: { apikey: key },
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            const rate = Number(data?.rates?.COP);
            if (!rate) throw new Error('Respuesta sin COP');
            return { rate };
        },
    },
};

// Caché en memoria (por instancia) + caché en BD (sobrevive cold starts).
let _trmMemo = null; // { date, rate, source, fetchedAt }

const readTrmFromDb = async (date) => {
    const { rows } = await db.query('SELECT date, rate, source, "fetchedAt" FROM "ProjectFairTrm" WHERE date = $1 LIMIT 1', [date]);
    if (!rows[0]) return null;
    return {
        date: rows[0].date,
        rate: Number(rows[0].rate),
        source: rows[0].source,
        fetchedAt: rows[0].fetchedAt,
    };
};

const readLastKnownTrm = async () => {
    const { rows } = await db.query('SELECT date, rate, source, "fetchedAt" FROM "ProjectFairTrm" ORDER BY date DESC LIMIT 1');
    if (!rows[0]) return null;
    return { date: rows[0].date, rate: Number(rows[0].rate), source: rows[0].source, fetchedAt: rows[0].fetchedAt };
};

const storeTrm = async (date, rate, source) => {
    await db.query(`
        INSERT INTO "ProjectFairTrm" (date, rate, source, "fetchedAt")
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (date) DO UPDATE SET rate = $2, source = $3, "fetchedAt" = NOW()
    `, [date, rate, source]);
};

/**
 * Devuelve la TRM vigente del día calendario colombiano.
 * Orden: caché (memoria → BD del día) → proveedor configurado → respaldos →
 * tasa manual de la config → última TRM conocida en BD.
 * `force` salta la caché (lo usa el botón "Actualizar" del admin).
 */
export const resolveTrm = async (cfg, { force = false } = {}) => {
    await ensureTables();
    const today = bogotaDate();
    const trmCfg = cfg?.trm || DEFAULT_CONFIG.trm;
    const refreshMs = Math.max(1, Number(trmCfg.refreshHours) || 12) * 60 * 60 * 1000;

    if (!force) {
        if (_trmMemo && _trmMemo.date === today && (Date.now() - new Date(_trmMemo.fetchedAt).getTime()) < refreshMs) {
            return { ..._trmMemo, cached: true };
        }
        const stored = await readTrmFromDb(today);
        if (stored && (Date.now() - new Date(stored.fetchedAt).getTime()) < refreshMs) {
            _trmMemo = stored;
            return { ...stored, cached: true };
        }
    }

    const chain = [trmCfg.provider, ...(Array.isArray(trmCfg.fallbackProviders) ? trmCfg.fallbackProviders : [])]
        .filter(Boolean)
        .filter((p, i, arr) => arr.indexOf(p) === i);

    for (const name of chain) {
        const provider = TRM_PROVIDERS[name];
        if (!provider) continue;
        try {
            const { rate } = await provider.fetch();
            const rounded = Math.round(Number(rate) * 10000) / 10000;
            const result = { date: today, rate: rounded, source: provider.label, fetchedAt: new Date().toISOString() };
            _trmMemo = result;
            await storeTrm(today, rounded, provider.label).catch(() => {});
            return { ...result, cached: false };
        } catch (err) {
            console.warn(`[project-fair] TRM proveedor "${name}" falló: ${err?.message}`);
        }
    }

    const manual = Number(trmCfg.manualRate);
    if (manual > 0) {
        const result = { date: today, rate: manual, source: 'Tasa manual configurada', fetchedAt: new Date().toISOString() };
        _trmMemo = result;
        return { ...result, cached: false, manual: true };
    }

    const last = await readLastKnownTrm();
    if (last) {
        console.warn('[project-fair] TRM: usando última tasa conocida en BD', last.date);
        return { ...last, cached: true, stale: true };
    }

    throw new Error('No fue posible obtener la TRM vigente');
};

// GET /api/project-fair/trm  (público)
export const getTrm = async (req, res) => {
    try {
        const cfg = await readConfig();
        const trm = await resolveTrm(cfg, { force: req.query?.force === 'true' });
        const amountCop = Number(cfg.registration?.amountCop) || 0;
        res.json({
            ...trm,
            amountCop,
            amountUsd: trm.rate > 0 ? Math.round((amountCop / trm.rate) * 100) / 100 : null,
            currency: 'COP',
        });
    } catch (error) {
        console.error('[project-fair] getTrm:', error);
        res.status(503).json({ error: 'No fue posible consultar la TRM vigente. Intenta nuevamente en unos minutos.' });
    }
};

// ── Inscripción ──────────────────────────────────────────────────────
const mapSubmission = (row, { includeInternal = false } = {}) => {
    if (!row) return null;
    const base = {
        id: row.id,
        publicRef: row.publicRef,
        editionKey: row.editionKey,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
        clubName: row.clubName,
        district: row.district,
        projectName: row.projectName,
        projectDescription: row.projectDescription,
        focusArea: row.focusArea,
        focusAreaLabel: row.focusAreaLabel,
        budgetUsd: row.budgetUsd === null ? null : Number(row.budgetUsd),
        status: row.status,
        amountCop: row.amountCop === null ? null : Number(row.amountCop),
        amountUsd: row.amountUsd === null ? null : Number(row.amountUsd),
        trmRate: row.trmRate === null ? null : Number(row.trmRate),
        trmDate: row.trmDate,
        trmSource: row.trmSource,
        trmFetchedAt: row.trmFetchedAt,
        paidAt: row.paidAt,
        createdAt: row.createdAt,
    };
    if (includeInternal) {
        base.stripeSessionId = row.stripeSessionId;
        base.stripePaymentIntentId = row.stripePaymentIntentId;
        base.clubId = row.clubId;
        base.metadata = row.metadata;
    }
    return base;
};

const validateSubmission = (body, cfg) => {
    const errors = {};
    const firstName = clean(body.firstName, 120);
    const lastName = clean(body.lastName, 120);
    const email = clean(body.email, 200).toLowerCase();
    const phone = clean(body.phone, 60);
    const clubName = clean(body.clubName, 200);
    const district = clean(body.district, 160);
    const projectName = clean(body.projectName, 250);
    const projectDescription = clean(body.projectDescription, 8000);
    const focusArea = clean(body.focusArea, 80);
    const budgetUsd = Number(String(body.budgetUsd ?? '').replace(/[^\d.,-]/g, '').replace(/,/g, ''));

    if (!firstName) errors.firstName = 'Ingresa tu nombre.';
    if (!lastName) errors.lastName = 'Ingresa tu apellido.';
    if (!isEmail(email)) errors.email = 'Ingresa un correo electrónico válido.';
    if (!phone || phone.replace(/\D/g, '').length < 7) errors.phone = 'Ingresa un número de contacto válido.';
    if (!clubName) errors.clubName = 'Indica el Club Rotario que postula el proyecto.';

    const districts = Array.isArray(cfg.districts) ? cfg.districts : [];
    if (!district) errors.district = 'Selecciona el distrito al que pertenece el club.';
    else if (districts.length && !districts.some(d => d.value === district)) errors.district = 'Selecciona un distrito habilitado para esta convocatoria.';

    if (!projectName) errors.projectName = 'Escribe el nombre del proyecto.';
    if (!projectDescription || projectDescription.length < 40) errors.projectDescription = 'Describe el proyecto con al menos 40 caracteres.';

    const areas = Array.isArray(cfg.focusAreas) ? cfg.focusAreas : [];
    const area = areas.find(a => a.key === focusArea || a.label === focusArea);
    if (!area) errors.focusArea = 'Selecciona una de las siete áreas de enfoque de Rotary International.';

    if (!budgetUsd || !isFinite(budgetUsd) || budgetUsd <= 0) errors.budgetUsd = 'Indica el presupuesto total del proyecto en USD.';

    return {
        errors,
        data: {
            firstName, lastName, email, phone, clubName, district,
            projectName, projectDescription,
            focusArea: area?.key || focusArea,
            focusAreaLabel: area?.label || null,
            budgetUsd: isFinite(budgetUsd) ? Math.round(budgetUsd * 100) / 100 : null,
        },
    };
};

// POST /api/project-fair/submissions  (público)
// Registra oficialmente la inscripción en estado 'pending_payment' y devuelve
// el resumen con la TRM vigente para la pantalla de pago.
export const createSubmission = async (req, res) => {
    try {
        const cfg = await readConfig();
        if (cfg.enabled === false) {
            return res.status(403).json({ error: 'La convocatoria no está disponible en este momento.' });
        }

        const { errors, data } = validateSubmission(req.body || {}, cfg);
        if (Object.keys(errors).length) {
            return res.status(400).json({ error: 'Revisa los campos marcados.', fields: errors });
        }

        await ensureTables();

        const amountCop = Number(cfg.registration?.amountCop) || 0;
        let trm = null;
        try { trm = await resolveTrm(cfg); } catch { /* la pantalla de pago reintenta */ }
        const amountUsd = trm?.rate > 0 ? Math.round((amountCop / trm.rate) * 100) / 100 : null;

        const { rows } = await db.query(`
            INSERT INTO "ProjectFairSubmission"
                ("publicRef", "editionKey", "firstName", "lastName", email, phone, "clubName", district,
                 "projectName", "projectDescription", "focusArea", "focusAreaLabel", "budgetUsd",
                 status, "amountCop", "amountUsd", "trmRate", "trmDate", "trmSource", "trmFetchedAt", "clubId", metadata)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb)
            RETURNING *
        `, [
            buildPublicRef(),
            cfg.edition?.key || null,
            data.firstName, data.lastName, data.email, data.phone, data.clubName, data.district,
            data.projectName, data.projectDescription, data.focusArea, data.focusAreaLabel, data.budgetUsd,
            'pending_payment', amountCop, amountUsd,
            trm?.rate ?? null, trm?.date ?? null, trm?.source ?? null, trm?.fetchedAt ?? null,
            cfg.clubId || null,
            JSON.stringify({
                edition: cfg.edition,
                submittedAt: new Date().toISOString(),
                userAgent: clean(req.headers['user-agent'], 300),
            }),
        ]);

        res.status(201).json({
            submission: mapSubmission(rows[0]),
            trm: trm ? { ...trm, amountCop, amountUsd } : null,
        });
    } catch (error) {
        console.error('[project-fair] createSubmission:', error);
        res.status(500).json({ error: 'No pudimos registrar la inscripción. Intenta nuevamente.' });
    }
};

// POST /api/project-fair/submissions/:id/checkout  (público)
// Genera la sesión de pago reutilizando la pasarela Stripe ya implementada.
export const createCheckout = async (req, res) => {
    try {
        await ensureTables();
        const cfg = await readConfig();
        const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [req.params.id]);
        const submission = rows[0];
        if (!submission) return res.status(404).json({ error: 'Inscripción no encontrada' });
        if (submission.status === 'paid') {
            return res.status(400).json({ error: 'Esta inscripción ya tiene el pago confirmado.' });
        }

        // El monto NUNCA viene del cliente: se toma de la configuración.
        const amountCop = Number(cfg.registration?.amountCop) || 0;
        if (amountCop <= 0) return res.status(400).json({ error: 'El valor de inscripción no está configurado.' });

        // TRM vigente al momento del pago (informativa para el usuario, se
        // conserva junto a la inscripción).
        let trm = null;
        try { trm = await resolveTrm(cfg); } catch { /* seguimos: el cobro es en COP */ }
        const amountUsd = trm?.rate > 0 ? Math.round((amountCop / trm.rate) * 100) / 100 : null;

        const origin = resolveOrigin(req, req.body?.returnUrl);
        // Ruta del formulario a la que Stripe devuelve al usuario. Configurable
        // (`formPath`) por si en el futuro cambia el slug público.
        const formPath = normalizeFormPath(cfg.formPath);
        const stripe = getStripe();
        const edition = cfg.edition?.name || 'Feria de Proyectos Rotary Colombia';

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            customer_email: submission.email,
            line_items: [{
                price_data: {
                    // Stripe cobra en COP (moneda decimal): monto en centavos.
                    currency: (cfg.registration?.currency || 'COP').toLowerCase(),
                    product_data: {
                        name: `${cfg.registration?.concept || 'Inscripción de proyecto'} — ${edition}`,
                        description: `Proyecto: ${String(submission.projectName).slice(0, 150)} · ${submission.clubName}`,
                    },
                    unit_amount: Math.round(amountCop) * 100,
                },
                quantity: 1,
            }],
            success_url: `${origin}${formPath}?submission=${submission.id}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}${formPath}?submission=${submission.id}&pago=cancelado`,
            metadata: {
                type: 'project_fair_registration',
                submissionId: submission.id,
                publicRef: submission.publicRef || '',
                editionKey: cfg.edition?.key || '',
                clubName: String(submission.clubName || '').slice(0, 150),
                district: String(submission.district || '').slice(0, 100),
                trmRate: trm?.rate ? String(trm.rate) : '',
                trmDate: trm?.date || '',
                amountUsd: amountUsd ? String(amountUsd) : '',
                clubId: cfg.clubId || '',
            },
        });

        await db.query(`
            UPDATE "ProjectFairSubmission"
            SET "stripeSessionId" = $1, "amountCop" = $2, "amountUsd" = $3,
                "trmRate" = COALESCE($4, "trmRate"), "trmDate" = COALESCE($5, "trmDate"),
                "trmSource" = COALESCE($6, "trmSource"), "trmFetchedAt" = COALESCE($7, "trmFetchedAt"),
                "updatedAt" = NOW()
            WHERE id = $8
        `, [session.id, amountCop, amountUsd, trm?.rate ?? null, trm?.date ?? null, trm?.source ?? null, trm?.fetchedAt ?? null, submission.id]);

        res.json({ url: session.url, sessionId: session.id });
    } catch (error) {
        console.error('[project-fair] createCheckout:', error);
        res.status(500).json({ error: error.message || 'No se pudo iniciar el pago.' });
    }
};

// Confirma la inscripción a partir de una Checkout Session pagada.
// Idempotente: si la inscripción ya está en 'paid', no duplica nada.
export const confirmPaidSession = async (session) => {
    const submissionId = session?.metadata?.submissionId;
    if (!submissionId) return null;

    await ensureTables();
    const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [submissionId]);
    const submission = rows[0];
    if (!submission) {
        console.warn('[project-fair] Sesión pagada sin inscripción asociada:', submissionId);
        return null;
    }
    if (submission.status === 'paid') return mapSubmission(submission);

    const paymentIntentId = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || null;

    const { rows: updated } = await db.query(`
        UPDATE "ProjectFairSubmission"
        SET status = 'paid',
            "stripeSessionId" = COALESCE($1, "stripeSessionId"),
            "stripePaymentIntentId" = COALESCE($2, "stripePaymentIntentId"),
            "paidAt" = NOW(),
            metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
            "updatedAt" = NOW()
        WHERE id = $4
        RETURNING *
    `, [
        session.id || null,
        paymentIntentId,
        JSON.stringify({
            payment: {
                sessionId: session.id,
                paymentIntentId,
                amountTotal: (session.amount_total ?? null),
                currency: (session.currency || '').toUpperCase(),
                confirmedAt: new Date().toISOString(),
            },
        }),
        submissionId,
    ]);

    const paid = updated[0];
    console.log(`[project-fair] ✅ Pago confirmado — inscripción ${paid.publicRef} (${paid.clubName}) ref ${paymentIntentId || session.id}`);

    // Registro del cobro en la billetera de la plataforma (opcional: sólo si
    // el admin asoció un club/organización a la feria).
    if (submission.clubId) {
        try {
            const prisma = (await import('../lib/prisma.js')).default;
            const providerRef = paymentIntentId || session.id;
            const existing = await prisma.payment.findFirst({ where: { providerRef, provider: 'stripe' }, select: { id: true } });
            if (!existing) {
                const total = (session.amount_total || 0) / 100;
                await prisma.payment.create({
                    data: {
                        provider: 'stripe',
                        providerRef,
                        status: 'succeeded',
                        amount: total,
                        currency: (session.currency || 'cop').toUpperCase(),
                        isPlatformCollection: true,
                        clubId: submission.clubId,
                        rawPayload: JSON.stringify({
                            type: 'project_fair_registration',
                            submissionId,
                            publicRef: paid.publicRef,
                            sessionId: session.id,
                        }),
                    },
                });
            }
        } catch (err) {
            console.error('[project-fair] No pude registrar el Payment del cobro:', err?.message);
        }
    }

    // Comprobante por correo (no bloquea la confirmación si falla).
    try {
        const cfg = await readConfig();
        if (cfg.notifications?.sendReceipt !== false) {
            await sendReceiptEmail(paid, cfg);
        }
        const admins = Array.isArray(cfg.notifications?.adminEmails) ? cfg.notifications.adminEmails.filter(isEmail) : [];
        if (admins.length) {
            await EmailService.sendPlatformEmail({
                to: admins.join(','),
                subject: `Nueva inscripción pagada — ${paid.publicRef} · ${paid.clubName}`,
                html: buildAdminNotificationHtml(paid, cfg),
                from: PLATFORM_SENDER,
            }).catch(() => {});
        }
    } catch (err) {
        console.error('[project-fair] Error enviando comprobante:', err?.message);
    }

    return mapSubmission(paid);
};

// GET /api/project-fair/submissions/:id  (público — pantalla de confirmación)
// Reconciliación defensiva: si el webhook aún no llega, consultamos la sesión
// en Stripe y confirmamos con el mismo flujo idempotente.
export const getSubmissionStatus = async (req, res) => {
    try {
        await ensureTables();
        const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [req.params.id]);
        let submission = rows[0];
        if (!submission) return res.status(404).json({ error: 'Inscripción no encontrada' });

        const sessionId = clean(req.query.session_id, 200) || submission.stripeSessionId;
        if (submission.status !== 'paid' && sessionId) {
            try {
                const session = await getStripe().checkout.sessions.retrieve(sessionId);
                if (session?.payment_status === 'paid') {
                    if (!session.metadata?.submissionId) session.metadata = { ...(session.metadata || {}), submissionId: submission.id };
                    await confirmPaidSession(session);
                    const refreshed = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [submission.id]);
                    submission = refreshed.rows[0] || submission;
                }
            } catch (err) {
                console.warn('[project-fair] No pude reconciliar la sesión con Stripe:', err?.message);
            }
        }

        const cfg = await readConfig();
        res.json({
            submission: mapSubmission(submission),
            redirect: cfg.redirect,
            edition: cfg.edition,
        });
    } catch (error) {
        console.error('[project-fair] getSubmissionStatus:', error);
        res.status(500).json({ error: 'No se pudo consultar el estado de la inscripción' });
    }
};

// ── Comprobante / notificaciones ─────────────────────────────────────
const fmtCop = (n) => `$${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })} COP`;
const fmtUsd = (n) => (n === null || n === undefined ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`);
const esc = (s) => String(s ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const buildReceiptHtml = (s, cfg) => {
    const primary = '#17458F';
    const accent = '#F7A81B';
    const edition = cfg.edition?.name || 'Feria de Proyectos Rotary Colombia';
    const city = cfg.edition?.city || '';
    const paidAt = s.paidAt ? new Date(s.paidAt).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota' }) : '';
    const row = (k, v) => `<tr><td style="padding:11px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:14px">${k}</td><td style="padding:11px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;font-size:14px">${v}</td></tr>`;

    return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937;max-width:620px;margin:0 auto;background:#f8fafc;padding:24px 0">
  <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.06)">
    <div style="background:${primary};color:#fff;padding:34px 32px;text-align:center">
      <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;opacity:.8;margin-bottom:8px">Comprobante de inscripción</div>
      <h1 style="margin:0;font-size:24px;font-weight:700;color:#fff">${esc(edition)}</h1>
      ${city ? `<div style="margin-top:6px;font-size:14px;opacity:.85">${esc(city)}, ${esc(cfg.edition?.country || 'Colombia')}</div>` : ''}
    </div>
    <div style="padding:32px">
      <p style="font-size:16px;line-height:1.6;margin:0 0 22px">
        ¡Hola ${esc(s.firstName)}! Confirmamos que la inscripción del proyecto
        <strong>"${esc(s.projectName)}"</strong> del <strong>${esc(s.clubName)}</strong> fue registrada y su pago está confirmado.
      </p>

      <div style="background:linear-gradient(135deg,${accent}14,${accent}26);border-radius:12px;padding:20px;margin-bottom:24px;text-align:center">
        <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#64748b;margin-bottom:6px">Referencia de inscripción</div>
        <div style="font-size:30px;font-weight:800;color:${primary};letter-spacing:.06em">${esc(s.publicRef)}</div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        ${row('Club Rotario', esc(s.clubName))}
        ${row('Distrito', esc(s.district))}
        ${row('Área de enfoque', esc(s.focusAreaLabel || s.focusArea))}
        ${row('Presupuesto del proyecto', fmtUsd(s.budgetUsd))}
        ${row('Valor de inscripción', fmtCop(s.amountCop))}
        ${s.trmRate ? row('TRM aplicada', `${Number(s.trmRate).toLocaleString('es-CO', { maximumFractionDigits: 2 })} COP/USD${s.trmDate ? ` · ${esc(s.trmDate)}` : ''}`) : ''}
        ${s.amountUsd ? row('Equivalente informativo', fmtUsd(s.amountUsd)) : ''}
        ${paidAt ? row('Fecha del pago', esc(paidAt)) : ''}
        ${row('Estado', '<span style="color:#059669">Pago confirmado</span>')}
      </table>

      <div style="background:#f1f5f9;border-left:3px solid ${primary};padding:16px 18px;border-radius:8px">
        <p style="margin:0;font-size:14px;line-height:1.6;color:#334155">
          <strong>Siguiente paso:</strong> continúa tu registro internacional en
          <a href="${esc(cfg.redirect?.url || 'https://grants25a.org/')}" style="color:${primary};font-weight:700">${esc(cfg.redirect?.name || 'Rotary Grants 25A')}</a>.
          Recuerda que la presentación del proyecto durante la feria tendrá un tiempo máximo de
          ${esc(cfg.presentation?.maxMinutes || 5)} minutos.
        </p>
      </div>
    </div>
    <div style="background:#f8fafc;padding:18px 32px;text-align:center;font-size:12px;color:#94a3b8;border-top:1px solid #e5e7eb">
      Comprobante automático · ${esc(edition)}<br>
      <span style="font-family:Menlo,monospace;font-size:11px;color:#cbd5e1">tx: ${esc((s.stripePaymentIntentId || s.stripeSessionId || '').slice(-18))}</span>
    </div>
  </div>
</div>`;
};

const buildAdminNotificationHtml = (s, cfg) => `
<div style="font-family:Arial,sans-serif;color:#1f2937;max-width:600px;margin:0 auto">
  <h2 style="color:#17458F">Nueva inscripción pagada — ${esc(cfg.edition?.name || 'Feria de Proyectos')}</h2>
  <ul style="font-size:14px;line-height:1.8;padding-left:18px">
    <li><strong>Referencia:</strong> ${esc(s.publicRef)}</li>
    <li><strong>Proyecto:</strong> ${esc(s.projectName)}</li>
    <li><strong>Club:</strong> ${esc(s.clubName)} (${esc(s.district)})</li>
    <li><strong>Representante:</strong> ${esc(s.firstName)} ${esc(s.lastName)} — ${esc(s.email)} · ${esc(s.phone)}</li>
    <li><strong>Área de enfoque:</strong> ${esc(s.focusAreaLabel || s.focusArea)}</li>
    <li><strong>Presupuesto:</strong> ${fmtUsd(s.budgetUsd)}</li>
    <li><strong>Inscripción:</strong> ${fmtCop(s.amountCop)}${s.trmRate ? ` · TRM ${Number(s.trmRate).toLocaleString('es-CO', { maximumFractionDigits: 2 })}` : ''}</li>
  </ul>
</div>`;

const sendReceiptEmail = async (submission, cfg) => {
    if (!isEmail(submission.email)) return;
    const result = await EmailService.sendPlatformEmail({
        to: submission.email,
        subject: `Inscripción confirmada ${submission.publicRef} — ${cfg.edition?.name || 'Feria de Proyectos Rotary Colombia'}`,
        html: buildReceiptHtml(submission, cfg),
        from: PLATFORM_SENDER,
    });
    if (result?.success) console.log(`[project-fair] ✉️ Comprobante enviado a ${submission.email}`);
    else console.error('[project-fair] Comprobante NO enviado:', result?.error || 'desconocido');
};

// ── Admin: listado y exportación ─────────────────────────────────────
// GET /api/project-fair/admin/submissions
export const listSubmissions = async (req, res) => {
    try {
        await ensureTables();
        const status = clean(req.query.status, 30);
        const search = clean(req.query.search, 120);
        const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));

        const where = [];
        const params = [];
        if (status && status !== 'all') { params.push(status); where.push(`status = $${params.length}`); }
        if (search) {
            params.push(`%${search}%`);
            const i = params.length;
            where.push(`("clubName" ILIKE $${i} OR "projectName" ILIKE $${i} OR email ILIKE $${i} OR "publicRef" ILIKE $${i})`);
        }
        params.push(limit);

        const { rows } = await db.query(
            `SELECT * FROM "ProjectFairSubmission"
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY "createdAt" DESC LIMIT $${params.length}`,
            params
        );

        const { rows: statsRows } = await db.query(`
            SELECT status, COUNT(*)::int AS count, COALESCE(SUM("amountCop"),0)::float AS total
            FROM "ProjectFairSubmission" GROUP BY status
        `);
        const stats = statsRows.reduce((acc, r) => ({ ...acc, [r.status]: { count: r.count, totalCop: r.total } }), {});

        res.json({ submissions: rows.map(r => mapSubmission(r, { includeInternal: true })), stats });
    } catch (error) {
        console.error('[project-fair] listSubmissions:', error);
        res.status(500).json({ error: 'No se pudieron cargar las inscripciones' });
    }
};

// GET /api/project-fair/admin/submissions.csv
export const exportSubmissionsCsv = async (_req, res) => {
    try {
        await ensureTables();
        const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" ORDER BY "createdAt" DESC');
        const headers = ['Referencia', 'Estado', 'Fecha', 'Nombre', 'Apellido', 'Email', 'Teléfono', 'Club', 'Distrito',
            'Proyecto', 'Área de enfoque', 'Presupuesto USD', 'Inscripción COP', 'Equivalente USD', 'TRM', 'Fecha TRM', 'Pago (Stripe)'];
        const cell = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
        const lines = [headers.join(';')];
        for (const r of rows) {
            lines.push([
                r.publicRef, r.status, r.createdAt ? new Date(r.createdAt).toISOString() : '',
                r.firstName, r.lastName, r.email, r.phone, r.clubName, r.district,
                r.projectName, r.focusAreaLabel || r.focusArea, r.budgetUsd, r.amountCop, r.amountUsd,
                r.trmRate, r.trmDate, r.stripePaymentIntentId || r.stripeSessionId,
            ].map(cell).join(';'));
        }
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="inscripciones-feria-proyectos.csv"');
        // BOM para que Excel en español abra el CSV con acentos correctos.
        res.send('﻿' + lines.join('\n'));
    } catch (error) {
        console.error('[project-fair] exportSubmissionsCsv:', error);
        res.status(500).json({ error: 'No se pudo exportar' });
    }
};

// GET /api/project-fair/admin/trm-providers
export const listTrmProviders = async (_req, res) => {
    res.json(Object.entries(TRM_PROVIDERS).map(([key, p]) => ({ key, label: p.label })));
};
