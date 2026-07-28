// ════════════════════════════════════════════════════════════════════
// Postulación de Proyectos — Feria de Proyectos Rotary Colombia
// v4.592.0 — Módulo completo: wizard público + pago Stripe + TRM oficial
//            + redirección a Rotary Grants tras la confirmación del pago.
//
// Edición vigente (configurable desde el admin, sin tocar código):
//   XII Feria de Proyectos Rotary Colombia — Valledupar.
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
import { DEFAULT_MASTER_FORM } from '../lib/projectFairMasterForm.js';

console.log('[projectFairController] v4.611.0 cargado — Postulación de Proyectos XII Feria de Proyectos Rotary Colombia (Valledupar): wizard + TRM oficial + Stripe + redirección a Rotary Grants. Formulario en /postular-proyecto, panel de registro en /registro-feria');

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_12345');
const DEFAULT_FRONTEND_URL = 'https://app.clubplatform.org';
// Slug público del formulario (v4.594). Los anteriores (/feria-proyectos,
// /inscribir-proyecto) siguen funcionando: el frontend los redirige aquí.
const DEFAULT_FORM_PATH = '/postular-proyecto';
// Tiempo de exposición de cada proyecto durante la feria. Es un rango
// (de 5 a 6 minutos), no un tope único: el equipo lo comunica así a los clubes.
const DEFAULT_PRESENTATION = { minMinutes: 5, maxMinutes: 6 };

/**
 * Texto del tiempo de presentación: "de 5 a 6 minutos" cuando hay rango,
 * "de máximo 6 minutos" cuando sólo se configuró el tope.
 */
export const presentationLabel = (presentation) => {
    const max = Number(presentation?.maxMinutes) || DEFAULT_PRESENTATION.maxMinutes;
    const min = Number(presentation?.minMinutes) || 0;
    if (min > 0 && min < max) return `de ${min} a ${max} minutos`;
    return `de máximo ${max} minutos`;
};

// ── Configuración por defecto ───────────────────────────────────────
// SOLO respaldo: los valores guardados por el admin siempre mandan (merge
// profundo). Si se agregan campos nuevos en el futuro, hacerlo de forma
// aditiva y opcional para no invalidar lo ya guardado.
export const DEFAULT_CONFIG = {
    enabled: true,
    formPath: DEFAULT_FORM_PATH,
    edition: {
        number: 12,
        // Las ediciones del evento se nombran en número romano (convención
        // habitual para versiones de eventos): XII, XIII, …
        ordinal: 'XII',
        name: 'XII Feria de Proyectos Rotary Colombia',
        city: 'Valledupar',
        country: 'Colombia',
        year: 2026,
        dates: '',
        key: '12-valledupar',
    },
    deadline: '2026-08-10',
    presentation: { ...DEFAULT_PRESENTATION },
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
        subtitle: 'XII Feria de Proyectos Rotary Colombia — Valledupar',
        intro: 'Los clubes rotarios podrán postular un (1) proyecto para presentarlo durante la XII Feria de Proyectos Rotary Colombia, que se realizará en la ciudad de Valledupar. La feria conecta proyectos de alto impacto con potenciales aliados nacionales e internacionales, patrocinadores, financiadores, fundaciones y colaboradores estratégicos.',
        requirements: [
            'Proyectos en ejecución o listos para implementar',
            'Iniciativas que requieran acompañamiento técnico o cofinanciación',
            'Propuestas alineadas con una o varias de las áreas de enfoque de Rotary International',
        ],
        note: 'El proyecto debe estar alineado con al menos una de las siete áreas de enfoque de Rotary International y contar con el Formulario de Necesidades de la Comunidad adjunto.',
        // v4.609 — Fechas clave del proceso, editables desde el panel. Cada
        // entrada tiene la fecha (para ordenarla y darle formato) y el texto
        // que ve el club.
        scheduleTitle: 'Fechas importantes del proceso',
        schedule: [
            { date: '2026-09-01', label: 'Plazo para subir proyectos a Global Grants' },
            { date: '2026-10-15', label: 'Comunicación de los clubes con los CADRES' },
            { date: '2026-11-09', label: 'Fecha máxima para enviar el formato', prefix: 'Hasta el' },
            { date: '2026-11-25', label: 'Fecha máxima para enviar el PowerPoint', prefix: 'Hasta el' },
            { date: '2027-01-10', label: 'Fecha máxima para enviar el video de presentación del proyecto', prefix: 'Hasta el' },
        ],
        priorityNote: 'Los proyectos inscritos con anterioridad recibirán prioridad en la revisión técnica, observaciones CADRE y traducción oficial al inglés. ¡No dejes pasar esta oportunidad!',
    },
    notifications: {
        adminEmails: [],
        sendReceipt: true,
    },
    // Perfiles del módulo de gestión. El rol 'administrator' de la plataforma
    // siempre tiene acceso total; estas listas otorgan permisos adicionales
    // por correo sin tocar el modelo global de usuarios.
    access: {
        admins: [],     // gestión completa del módulo (además del rol 'administrator')
        finance: [],    // ven pagos, comprobantes y pueden sincronizar con Stripe
        reviewers: [],  // consultan, comentan y mueven estados de revisión
    },
    // ── Panel público de registro (v4.602) ──────────────────────────
    // Copia del panel de inscripción de la Conferencia LATIR: logo, cuenta
    // regresiva, botón, precios y fecha de cierre. Vive en /registro-feria y
    // es el destino del botón de registro de la cabecera.
    // Aditivo y opcional: los campos vacíos se completan solos con los datos
    // de la edición (nombre, ciudad, fecha límite) y el botón lleva al
    // formulario de postulación, así que funciona sin configurar nada.
    registrationPanel: {
        enabled: true,
        headerLogo: '',
        title: '',            // vacío → nombre de la edición
        subtitle: '',         // vacío → ciudad, país
        startDate: '',        // vacío → cuenta regresiva hasta la fecha límite
        buttonLabel: 'Inscripciones',
        buttonLink: '',       // vacío → formulario de postulación (formPath)
        ticketGeneralLabel: 'Inscripción de proyecto:',
        ticketGeneral: '',    // vacío → valor de inscripción configurado
        ticketNote: '',
        ticketRotexLabel: '',
        ticketRotex: '',
        closeLabel: 'Cierre de inscripciones:',
        closeDateText: '',    // vacío → fecha límite configurada
        footerImage: '',
        intro: '',            // texto opcional al lado del panel
    },
    // v4.608 — Formulario maestro de formulación (plantilla editable) y panel
    // del club. `masterForm.sections` define el formulario completo; el panel
    // lo renderiza y las descargas Word/PDF lo recorren.
    masterForm: DEFAULT_MASTER_FORM,
    portal: {
        enabled: true,
        path: '/mi-proyecto',
        // Tras confirmarse el pago el club entra aquí a formular su proyecto;
        // el enlace a Rotary Grants queda dentro del panel como paso siguiente.
        redirectAfterPayment: true,
        welcome: 'Tu inscripción está confirmada. Ahora formula tu proyecto: puedes guardar y volver cuantas veces necesites hasta la fecha límite.',
    },
    // Umbrales del panel de alertas.
    alerts: {
        pendingPaymentHours: 48,
        budgetOutlierUsd: 500000,
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

    // ── v4.598 — Gestión de Postulaciones y Pagos ────────────────────
    // Todo lo que sigue es ADITIVO: columnas nuevas con ADD COLUMN IF NOT
    // EXISTS y tablas nuevas con CREATE TABLE IF NOT EXISTS. Ninguna
    // sentencia borra, trunca ni reescribe datos existentes.
    //
    // Nota de diseño: `status` sigue siendo el estado del PAGO (lo consume el
    // formulario público); `workflowStatus` es el estado del proceso interno
    // de revisión. Separarlos evita romper el flujo público al mover una
    // postulación por el circuito administrativo.
    const addColumn = async (sql) => { await db.query(sql).catch(() => {}); };
    await Promise.all([
        addColumn(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS "workflowStatus" VARCHAR(40) DEFAULT 'received'`),
        addColumn(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal'`),
        addColumn(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS "internalCategory" VARCHAR(120)`),
        addColumn(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS "assigneeId" TEXT`),
        addColumn(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS "assigneeName" VARCHAR(160)`),
        addColumn(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMPTZ`),
        addColumn(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS "reviewedBy" VARCHAR(160)`),
        addColumn(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS "stripeChargeId" TEXT`),
        addColumn(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT`),
        addColumn(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS "paymentMethod" VARCHAR(60)`),
        addColumn(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS "receiptUrl" TEXT`),
        addColumn(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS "amountReceived" NUMERIC(14,2)`),
        addColumn(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS "refundedAmount" NUMERIC(14,2)`),
        addColumn(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS "refundedAt" TIMESTAMPTZ`),
        addColumn(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS "lastPaymentError" TEXT`),
        addColumn(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS "redirectedAt" TIMESTAMPTZ`),
    ]);
    // Postulaciones anteriores al módulo: se les da el estado de proceso que
    // corresponde a su estado de pago (sólo donde aún está vacío).
    await db.query(`
        UPDATE "ProjectFairSubmission"
        SET "workflowStatus" = CASE WHEN status = 'paid' THEN 'payment_confirmed' ELSE 'pending_payment' END
        WHERE "workflowStatus" IS NULL
    `).catch(() => {});

    // Línea de tiempo + auditoría. Un solo registro cronológico por
    // postulación: eventos del formulario, de Stripe y de la gestión interna
    // (incluidos los comentarios, con type='comment').
    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProjectFairEvent" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "submissionId" TEXT NOT NULL,
            type VARCHAR(50) NOT NULL,
            title VARCHAR(250),
            detail TEXT,
            "actorId" TEXT,
            "actorName" VARCHAR(160),
            "actorRole" VARCHAR(60),
            metadata JSONB DEFAULT '{}',
            "createdAt" TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "ProjectFairEvent_submission_idx" ON "ProjectFairEvent" ("submissionId", "createdAt" DESC);`).catch(() => {});

    // Archivos adjuntos de la postulación (se suben a S3; aquí la metadata).
    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProjectFairFile" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "submissionId" TEXT NOT NULL,
            "fileName" VARCHAR(300) NOT NULL,
            "fileUrl" TEXT NOT NULL,
            "fileSize" BIGINT,
            "contentType" VARCHAR(120),
            "uploadedBy" VARCHAR(160),
            "createdAt" TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "ProjectFairFile_submission_idx" ON "ProjectFairFile" ("submissionId");`).catch(() => {});

    // Catálogo de etiquetas + relación con postulaciones.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProjectFairTag" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            label VARCHAR(120) NOT NULL,
            color VARCHAR(20) DEFAULT 'slate',
            "isSystem" BOOLEAN DEFAULT false,
            "createdAt" TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProjectFairTag_label_key" ON "ProjectFairTag" (lower(label));`).catch(() => {});
    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProjectFairSubmissionTag" (
            "submissionId" TEXT NOT NULL,
            "tagId" TEXT NOT NULL,
            "createdAt" TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY ("submissionId", "tagId")
        );
    `);

    // ── v4.608 — Cuenta del club y formulario maestro ────────────────
    // La identidad del postulante vive AQUÍ, no en la tabla User de la
    // plataforma: así un club nunca puede alcanzar rutas /admin/*, cuyo
    // guardián sólo comprueba que haya sesión iniciada.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProjectFairAccount" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "submissionId" TEXT NOT NULL,
            email VARCHAR(200) NOT NULL,
            "passwordHash" TEXT NOT NULL,
            "clubName" VARCHAR(200),
            "lastLoginAt" TIMESTAMPTZ,
            "resetToken" TEXT,
            "resetExpiry" TIMESTAMPTZ,
            "createdAt" TIMESTAMPTZ DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProjectFairAccount_email_key" ON "ProjectFairAccount" (lower(email));`).catch(() => {});
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProjectFairAccount_submission_key" ON "ProjectFairAccount" ("submissionId");`).catch(() => {});

    // Respuestas del formulario maestro. `answers` es un JSONB con la forma
    // { seccion: { campo: valor } }, guiado por la plantilla de la config.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProjectFairMasterForm" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "submissionId" TEXT NOT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'draft',
            answers JSONB NOT NULL DEFAULT '{}',
            "completionPct" INTEGER NOT NULL DEFAULT 0,
            "submittedAt" TIMESTAMPTZ,
            "lastEditedAt" TIMESTAMPTZ,
            "lockedAt" TIMESTAMPTZ,
            "reopenedAt" TIMESTAMPTZ,
            "reopenedBy" VARCHAR(160),
            "createdAt" TIMESTAMPTZ DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProjectFairMasterForm_submission_key" ON "ProjectFairMasterForm" ("submissionId");`).catch(() => {});

    // Historial de cada guardado y envío: permite auditar qué cambió y cuándo,
    // y recuperar una versión anterior si el club se equivoca.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProjectFairFormRevision" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "submissionId" TEXT NOT NULL,
            answers JSONB NOT NULL DEFAULT '{}',
            "completionPct" INTEGER,
            action VARCHAR(30),
            "actorType" VARCHAR(20),
            "actorName" VARCHAR(160),
            "createdAt" TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "ProjectFairFormRevision_submission_idx" ON "ProjectFairFormRevision" ("submissionId", "createdAt" DESC);`).catch(() => {});

    // Eventos crudos recibidos de Stripe: fuente de verdad del pago y base de
    // la idempotencia (un mismo event.id nunca se procesa dos veces).
    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProjectFairStripeEvent" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "stripeEventId" TEXT NOT NULL UNIQUE,
            type VARCHAR(80) NOT NULL,
            "submissionId" TEXT,
            "objectId" TEXT,
            payload JSONB,
            "receivedAt" TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "ProjectFairStripeEvent_submission_idx" ON "ProjectFairStripeEvent" ("submissionId", "receivedAt" DESC);`).catch(() => {});

    // Etiquetas sugeridas por el equipo. Se crean una sola vez; el admin puede
    // borrarlas o agregar las suyas desde el módulo.
    for (const [label, color] of DEFAULT_TAGS) {
        await db.query(
            `INSERT INTO "ProjectFairTag" (label, color, "isSystem") VALUES ($1, $2, true) ON CONFLICT DO NOTHING`,
            [label, color]
        ).catch(() => {});
    }

    _tablesReady = true;
};

// Etiquetas iniciales (se pueden borrar o ampliar desde el módulo).
const DEFAULT_TAGS = [
    ['Requiere revisión', 'amber'],
    ['Prioridad alta', 'red'],
    ['Documentación incompleta', 'orange'],
    ['Pago confirmado', 'emerald'],
    ['Potencial alianza', 'violet'],
    ['Pendiente de traducción', 'sky'],
];

// ── Línea de tiempo ──────────────────────────────────────────────────
// Registrar un evento nunca debe tumbar la operación principal (un pago
// confirmado no se pierde porque falle su bitácora), por eso captura errores.
export const logEvent = async (submissionId, { type, title, detail = null, actor = null, metadata = {} }) => {
    if (!submissionId || !type) return null;
    try {
        const { rows } = await db.query(`
            INSERT INTO "ProjectFairEvent" ("submissionId", type, title, detail, "actorId", "actorName", "actorRole", metadata)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *
        `, [
            submissionId, type, title || null, detail,
            actor?.id || null, actor?.name || null, actor?.role || null,
            JSON.stringify(metadata || {}),
        ]);
        return rows[0];
    } catch (err) {
        console.error('[project-fair] No pude registrar el evento:', err?.message);
        return null;
    }
};

// Guarda el evento crudo de Stripe. Devuelve false si ya había sido procesado
// (idempotencia): el llamador debe abortar en ese caso.
export const recordStripeEvent = async (event, submissionId = null) => {
    if (!event?.id) return true;
    await ensureTables();
    try {
        const { rowCount } = await db.query(`
            INSERT INTO "ProjectFairStripeEvent" ("stripeEventId", type, "submissionId", "objectId", payload)
            VALUES ($1,$2,$3,$4,$5::jsonb)
            ON CONFLICT ("stripeEventId") DO NOTHING
        `, [
            event.id,
            event.type || 'unknown',
            submissionId,
            event.data?.object?.id || null,
            JSON.stringify(event.data?.object || {}).slice(0, 200000),
        ]);
        if (rowCount === 0) {
            console.log(`[project-fair] Evento de Stripe ${event.id} ya procesado (skip)`);
            return false;
        }
        return true;
    } catch (err) {
        console.error('[project-fair] No pude registrar el evento de Stripe:', err?.message);
        return true; // ante la duda, se procesa: los handlers son idempotentes
    }
};

export { ensureTables };

// ── Configuración ────────────────────────────────────────────────────
/**
 * Antes de v4.610 el tiempo de presentación era un tope único
 * (`presentation.maxMinutes`). Una fila guardada con ese formato, al mezclarse
 * con el rango por defecto, dejaría un rango incoherente (min del defecto +
 * max viejo). Si la fila guardada no trae `minMinutes`, es de esa época: se
 * ignora su `presentation` para que aplique el rango por defecto. En cuanto el
 * admin guarde el rango desde la pestaña Convocatoria, manda lo guardado.
 */
// El texto por defecto de la fecha del 15 de octubre decía "los padres" por
// error: son los CADRES (los asesores técnicos de Rotary). Si la fila guardada
// tiene exactamente ese texto equivocado, se corrige al leerla. Sólo se toca
// esa cadena literal: cualquier redacción propia del admin queda intacta.
const LEGACY_CADRE_LABEL = 'Comunicación de los clubes con los padres';
const CADRE_LABEL = 'Comunicación de los clubes con los CADRES';

const normalizeSavedConfig = (saved) => {
    let out = saved;

    /*
     * Antes de v4.610 el tiempo de presentación era un tope único
     * (`presentation.maxMinutes`). Una fila guardada con ese formato, al
     * mezclarse con el rango por defecto, dejaría un rango incoherente (min
     * del defecto + max viejo). Si la fila guardada no trae `minMinutes`, es
     * de esa época: se ignora su `presentation` para que aplique el rango por
     * defecto. En cuanto el admin guarde el rango desde la pestaña
     * Convocatoria, manda lo guardado.
     */
    if (isPlainObject(out?.presentation) && out.presentation.minMinutes === undefined) {
        const { presentation, ...rest } = out;
        out = rest;
    }

    if (Array.isArray(out?.content?.schedule) && out.content.schedule.some(i => i?.label === LEGACY_CADRE_LABEL)) {
        out = {
            ...out,
            content: {
                ...out.content,
                schedule: out.content.schedule.map(i => (i?.label === LEGACY_CADRE_LABEL ? { ...i, label: CADRE_LABEL } : i)),
            },
        };
    }

    return out;
};

const readConfig = async () => {
    await ensureTables();
    const { rows } = await db.query('SELECT config FROM "ProjectFairConfig" WHERE key = $1 LIMIT 1', ['active']);
    let saved = rows[0]?.config || {};
    if (typeof saved === 'string') {
        try { saved = JSON.parse(saved); } catch { saved = {}; }
    }
    return deepMerge(DEFAULT_CONFIG, normalizeSavedConfig(saved));
};

// La usa el módulo de Gestión de Postulaciones y Pagos.
export const readConfigForAdmin = () => readConfig();

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
    // Panel público de registro (v4.602): sólo textos e imágenes, nada
    // sensible. Lo consume /registro-feria.
    registrationPanel: cfg.registrationPanel || {},
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

    // v4.608 — La cuenta del club se crea con la postulación: la contraseña
    // se pide aquí, cuando el club ya está escribiendo su correo, y no
    // después del pago (donde el abandono es mucho más caro).
    const password = String(body.password || '');
    if (cfg.portal?.enabled !== false && cfg.masterForm?.enabled !== false) {
        if (!password) errors.password = 'Crea una contraseña para acceder a tu panel.';
        else if (password.length < 8) errors.password = 'La contraseña debe tener al menos 8 caracteres.';
        else if (body.passwordConfirm !== undefined && String(body.passwordConfirm) !== password) {
            errors.passwordConfirm = 'Las contraseñas no coinciden.';
        }
    }

    return {
        errors,
        password,
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

        const { errors, data, password } = validateSubmission(req.body || {}, cfg);
        if (Object.keys(errors).length) {
            return res.status(400).json({ error: 'Revisa los campos marcados.', fields: errors });
        }

        await ensureTables();

        // Un correo, una postulación: si ya tiene cuenta, se le invita a entrar
        // a su panel en vez de duplicar el registro y el cobro.
        const existing = await db.query('SELECT id FROM "ProjectFairAccount" WHERE lower(email) = $1 LIMIT 1', [data.email]);
        if (existing.rows.length) {
            return res.status(409).json({
                error: 'Este correo ya tiene una postulación registrada. Ingresa a tu panel para continuar con tu proyecto.',
                fields: { email: 'Ya existe una postulación con este correo.' },
                portalPath: cfg.portal?.path || '/mi-proyecto',
            });
        }

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

        // Cuenta del club (identidad propia del módulo, no de la plataforma).
        if (password) {
            const { createAccountFor } = await import('./projectFairPortalController.js');
            await createAccountFor(rows[0], password);
        }

        await logEvent(rows[0].id, {
            type: 'form_submitted',
            title: 'Formulario enviado',
            detail: `${data.projectName} — ${data.clubName} (${data.district})`,
            metadata: { focusArea: data.focusArea, budgetUsd: data.budgetUsd, publicRef: rows[0].publicRef },
        });

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
            // La misma metadata viaja al PaymentIntent: así los eventos de
            // pago fallido o reembolso llegan ligados a la postulación aunque
            // no traigan la Checkout Session.
            payment_intent_data: {
                metadata: {
                    type: 'project_fair_registration',
                    submissionId: submission.id,
                    publicRef: submission.publicRef || '',
                },
            },
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

        await logEvent(submission.id, {
            type: 'checkout_created',
            title: 'Sesión de pago creada',
            detail: `${fmtCop(amountCop)} COP${amountUsd ? ` · equivalente ${fmtUsd(amountUsd)}` : ''}`,
            metadata: { sessionId: session.id, amountCop, amountUsd, trmRate: trm?.rate ?? null },
        });

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

    // Trazabilidad completa del cobro: además de la sesión, se consultan el
    // PaymentIntent y el Charge para guardar cliente, método de pago,
    // comprobante y monto realmente recibido. Si Stripe no responde, se sigue
    // con lo que trae la sesión (el pago ya está confirmado).
    let charge = null;
    let customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id || null;
    if (paymentIntentId) {
        try {
            const pi = await getStripe().paymentIntents.retrieve(paymentIntentId, {
                expand: ['latest_charge.payment_method_details'],
            });
            charge = pi?.latest_charge || null;
            customerId = customerId || (typeof pi?.customer === 'string' ? pi.customer : pi?.customer?.id || null);
        } catch (err) {
            console.warn('[project-fair] No pude leer el PaymentIntent en Stripe:', err?.message);
        }
    }

    const amountReceived = (session.amount_total ?? charge?.amount ?? 0) / 100;
    const { rows: updated } = await db.query(`
        UPDATE "ProjectFairSubmission"
        SET status = 'paid',
            "workflowStatus" = CASE WHEN "workflowStatus" IN ('received','pending_payment','draft') OR "workflowStatus" IS NULL
                                    THEN 'payment_confirmed' ELSE "workflowStatus" END,
            "stripeSessionId" = COALESCE($1, "stripeSessionId"),
            "stripePaymentIntentId" = COALESCE($2, "stripePaymentIntentId"),
            "stripeChargeId" = COALESCE($3, "stripeChargeId"),
            "stripeCustomerId" = COALESCE($4, "stripeCustomerId"),
            "paymentMethod" = COALESCE($5, "paymentMethod"),
            "receiptUrl" = COALESCE($6, "receiptUrl"),
            "amountReceived" = COALESCE($7, "amountReceived"),
            "lastPaymentError" = NULL,
            "paidAt" = NOW(),
            metadata = COALESCE(metadata, '{}'::jsonb) || $8::jsonb,
            "updatedAt" = NOW()
        WHERE id = $9
        RETURNING *
    `, [
        session.id || null,
        paymentIntentId,
        charge?.id || null,
        customerId,
        charge?.payment_method_details?.type || null,
        charge?.receipt_url || null,
        amountReceived || null,
        JSON.stringify({
            payment: {
                sessionId: session.id,
                paymentIntentId,
                chargeId: charge?.id || null,
                customerId,
                amountTotal: (session.amount_total ?? null),
                currency: (session.currency || '').toUpperCase(),
                confirmedAt: new Date().toISOString(),
            },
        }),
        submissionId,
    ]);

    const paid = updated[0];
    console.log(`[project-fair] ✅ Pago confirmado — inscripción ${paid.publicRef} (${paid.clubName}) ref ${paymentIntentId || session.id}`);

    await logEvent(submissionId, {
        type: 'payment_succeeded',
        title: 'Pago aprobado',
        detail: `${fmtCop(amountReceived)} ${(session.currency || 'cop').toUpperCase()}${charge?.payment_method_details?.type ? ` · ${charge.payment_method_details.type}` : ''}`,
        metadata: {
            sessionId: session.id,
            paymentIntentId,
            chargeId: charge?.id || null,
            customerId,
            receiptUrl: charge?.receipt_url || null,
            amountReceived,
            trmRate: paid.trmRate ? Number(paid.trmRate) : null,
        },
    });

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

// ── Otros desenlaces del pago (fuente de verdad: webhook de Stripe) ──
// Los tres son idempotentes y sólo se aplican si la postulación no está ya
// pagada, para que un evento fuera de orden no degrade un pago confirmado.
const findSubmissionForStripe = async (object) => {
    const id = object?.metadata?.submissionId;
    if (id) {
        const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [id]);
        if (rows[0]) return rows[0];
    }
    // Respaldo: buscar por los identificadores de Stripe ya guardados.
    const candidates = [
        ['stripeSessionId', object?.id],
        ['stripePaymentIntentId', typeof object?.payment_intent === 'string' ? object.payment_intent : object?.payment_intent?.id],
        ['stripePaymentIntentId', object?.object === 'payment_intent' ? object?.id : null],
        ['stripeChargeId', object?.object === 'charge' ? object?.id : null],
    ];
    for (const [column, value] of candidates) {
        if (!value) continue;
        const { rows } = await db.query(`SELECT * FROM "ProjectFairSubmission" WHERE "${column}" = $1 LIMIT 1`, [value]);
        if (rows[0]) return rows[0];
    }
    return null;
};

/** Pago rechazado por Stripe (payment_intent.payment_failed). */
export const handlePaymentFailed = async (paymentIntent) => {
    await ensureTables();
    const submission = await findSubmissionForStripe(paymentIntent);
    if (!submission || submission.status === 'paid') return null;

    const reason = paymentIntent?.last_payment_error?.message
        || paymentIntent?.last_payment_error?.code
        || 'El pago fue rechazado por la pasarela.';

    await db.query(`
        UPDATE "ProjectFairSubmission"
        SET status = 'failed', "workflowStatus" = 'payment_failed',
            "stripePaymentIntentId" = COALESCE($1, "stripePaymentIntentId"),
            "lastPaymentError" = $2, "updatedAt" = NOW()
        WHERE id = $3
    `, [paymentIntent?.id || null, String(reason).slice(0, 500), submission.id]);

    await logEvent(submission.id, {
        type: 'payment_failed',
        title: 'Pago rechazado',
        detail: String(reason).slice(0, 500),
        metadata: { paymentIntentId: paymentIntent?.id || null, code: paymentIntent?.last_payment_error?.code || null },
    });
    console.log(`[project-fair] ⚠️ Pago rechazado — inscripción ${submission.publicRef}: ${reason}`);
    return submission.id;
};

/** La sesión de pago caducó sin completarse (checkout.session.expired). */
export const handleCheckoutExpired = async (session) => {
    await ensureTables();
    const submission = await findSubmissionForStripe(session);
    if (!submission || submission.status === 'paid') return null;

    await db.query(`
        UPDATE "ProjectFairSubmission"
        SET status = 'pending_payment', "workflowStatus" = 'pending_payment', "updatedAt" = NOW()
        WHERE id = $1
    `, [submission.id]);

    await logEvent(submission.id, {
        type: 'checkout_expired',
        title: 'Sesión de pago caducada',
        detail: 'El enlace de pago expiró sin completarse. La inscripción sigue disponible para reintentar.',
        metadata: { sessionId: session?.id || null },
    });
    return submission.id;
};

/** Reembolso total o parcial (charge.refunded). */
export const handleRefund = async (charge) => {
    await ensureTables();
    const submission = await findSubmissionForStripe(charge);
    if (!submission) return null;

    const refunded = (charge?.amount_refunded || 0) / 100;
    const total = (charge?.amount || 0) / 100;
    const isFull = refunded >= total && total > 0;

    await db.query(`
        UPDATE "ProjectFairSubmission"
        SET status = $1, "workflowStatus" = $2,
            "refundedAmount" = $3, "refundedAt" = NOW(),
            "stripeChargeId" = COALESCE($4, "stripeChargeId"),
            "updatedAt" = NOW()
        WHERE id = $5
    `, [
        isFull ? 'refunded' : 'paid',
        isFull ? 'refunded' : submission.workflowStatus || 'payment_confirmed',
        refunded,
        charge?.id || null,
        submission.id,
    ]);

    await logEvent(submission.id, {
        type: 'refund',
        title: isFull ? 'Reembolso total' : 'Reembolso parcial',
        detail: `${fmtCop(refunded)} de ${fmtCop(total)} ${(charge?.currency || 'cop').toUpperCase()}`,
        metadata: { chargeId: charge?.id || null, refunded, total, isFull },
    });
    console.log(`[project-fair] ↩️ Reembolso ${isFull ? 'total' : 'parcial'} — inscripción ${submission.publicRef}: ${refunded}`);
    return submission.id;
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
          Recuerda que la presentación del proyecto durante la feria tendrá una duración
          ${esc(presentationLabel(cfg.presentation))}.
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

// Reenvío del comprobante desde el módulo de gestión: misma plantilla que el
// envío automático, devolviendo el resultado para poder informarlo en la UI.
export const sendReceiptFor = async (submission, cfg) => {
    try {
        return await EmailService.sendPlatformEmail({
            to: submission.email,
            subject: `Inscripción confirmada ${submission.publicRef} — ${cfg.edition?.name || 'Feria de Proyectos Rotary Colombia'}`,
            html: buildReceiptHtml(submission, cfg),
            from: PLATFORM_SENDER,
        });
    } catch (error) {
        return { success: false, error: error?.message || 'Error enviando el correo' };
    }
};

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

// Ficha completa de una postulación (datos + línea de tiempo + adjuntos +
// etiquetas) para exportarla a PDF desde el módulo de gestión.
export const buildSubmissionSnapshot = async (id, { includePayments = false } = {}) => {
    await ensureTables();
    const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [id]);
    if (!rows[0]) return null;

    const [events, files, tags] = await Promise.all([
        db.query('SELECT type, title, detail, "actorName", "createdAt" FROM "ProjectFairEvent" WHERE "submissionId" = $1 ORDER BY "createdAt" ASC', [id]),
        db.query('SELECT "fileName", "fileUrl", "createdAt" FROM "ProjectFairFile" WHERE "submissionId" = $1 ORDER BY "createdAt" ASC', [id]),
        db.query(`SELECT t.label, t.color FROM "ProjectFairSubmissionTag" st JOIN "ProjectFairTag" t ON t.id = st."tagId" WHERE st."submissionId" = $1`, [id]),
    ]);

    const s = rows[0];
    const submission = mapSubmission(s);
    submission.workflowStatus = s.workflowStatus;
    submission.priority = s.priority;
    submission.internalCategory = s.internalCategory;
    submission.assigneeName = s.assigneeName;
    submission.reviewedAt = s.reviewedAt;
    submission.reviewedBy = s.reviewedBy;
    if (includePayments) {
        submission.stripeSessionId = s.stripeSessionId;
        submission.stripePaymentIntentId = s.stripePaymentIntentId;
        submission.stripeChargeId = s.stripeChargeId;
        submission.stripeCustomerId = s.stripeCustomerId;
        submission.paymentMethod = s.paymentMethod;
        submission.receiptUrl = s.receiptUrl;
        submission.amountReceived = s.amountReceived === null ? null : Number(s.amountReceived);
        submission.refundedAmount = s.refundedAmount === null ? null : Number(s.refundedAmount);
    }

    return { submission, events: events.rows, files: files.rows, tags: tags.rows };
};

// ── Admin ────────────────────────────────────────────────────────────
// El listado, la exportación y la ficha de las postulaciones viven ahora en
// projectFairAdminController (módulo unificado "Postulaciones y Pagos"), que
// aplica permisos por perfil. Aquí sólo queda el catálogo de proveedores TRM.

// GET /api/project-fair/admin/trm-providers
export const listTrmProviders = async (_req, res) => {
    res.json(Object.entries(TRM_PROVIDERS).map(([key, p]) => ({ key, label: p.label })));
};
