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
// v4.978 — El pago de una inscripción: el CRITERIO (puro) y su historial de
// intentos. Ver `server/lib/projectFairPayment.js` para la regla de fondo —
// un intento anterior NO es un pago confirmado.
import {
    hasConfirmedPayment, canStartPayment, readSessionOutcome, reusableCheckout,
    paymentViewOf, attemptHistoryOf, lastFailureOf,
} from '../lib/projectFairPayment.js';
// v4.980 — El recargo que paga quien se inscribe. El criterio es PURO y vive
// aparte; acá sólo se aplica. Se SUMA al precio, al revés que la retención de
// los aportes, que se descuenta del receptor.
import { computeSurcharge, describeSurcharge, resolveSurchargeRates, surchargeEnabled } from '../lib/checkoutSurcharge.js';
import { getSurchargeConfig } from '../lib/checkoutSurchargeStore.js';
import {
    ensurePaymentAttemptTable, claimAttempt, openAttemptOf, resolveAttempt,
    resolveOpenAttemptFor, resolveAttemptFor, listAttempts,
} from '../lib/projectFairPaymentAttempts.js';
import db from '../lib/db.js';
import { TRM_PROVIDERS } from '../lib/trm.js';
import EmailService from '../services/EmailService.js';
import { DEFAULT_MASTER_FORM, dropRetiredBudgetRows } from '../lib/projectFairMasterForm.js';
import { DEFAULT_FDD_FORM } from '../lib/projectFairFddForm.js';
import { seedDistrictClubs } from '../lib/rotaryClubs.js';

console.log('[projectFairController] v4.979.0 cargado — Postulación de Proyectos POR EDICIONES: cada edición es un evento del calendario, con su convocatoria, sus postulaciones y sus reportes aislados. Wizard agrupado + TRM oficial + Stripe + redirección a Rotary Grants. Formulario en /postular-proyecto, panel de registro en /registro-feria. Pago con reintento: mientras no haya pago CONFIRMADO, el club siempre tiene una ruta segura para completarlo');

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
    deadline: '2026-11-09',
    presentation: { ...DEFAULT_PRESENTATION },
    registration: {
        // Moneda en la que el admin fija el precio (v4.612):
        //   'COP' → se anuncia en pesos y se cobra su equivalente en dólares
        //           con la TRM del día del pago.
        //   'USD' → se anuncia y se cobra el mismo valor en dólares, sin TRM.
        // El cobro en Stripe siempre se hace en USD.
        priceMode: 'COP',
        amountCop: 250000,
        amountUsd: 0,
        currency: 'COP',
        concept: 'Inscripción de proyecto',
        maxProjectsPerClub: 1,
    },
    // El orden es el que ve el postulante en la lista desplegable. Se puede
    // reordenar desde la pestaña Convocatoria.
    // Cada distrito puede traer SU lista de clubes (`clubs`). Con la lista
    // cargada, el formulario ofrece un desplegable; sin ella, el club se
    // escribe a mano. Se administra desde la pestaña Convocatoria.
    districts: [
        { value: 'Rotary Distrito 4271', label: 'Rotary Distrito 4271', clubs: [] },
        { value: 'Rotary Distrito 4281', label: 'Rotary Distrito 4281', clubs: [] },
    ],
    // Tipos de documento del representante que postula. Se piden para poder
    // facturar la inscripción y para acreditar a quien llega a la feria.
    // `key` es lo que se almacena; `label` lo que ve el postulante.
    idTypes: [
        { key: 'cc', label: 'Cédula de ciudadanía' },
        { key: 'ce', label: 'Cédula de extranjería' },
        { key: 'passport', label: 'Pasaporte' },
        { key: 'nit', label: 'NIT' },
    ],
    // Rol del representante dentro del club. Los cargos de junta se nombran por
    // el CARGO ("Presidencia", "Secretaría") y no por la persona ("Presidente",
    // "Secretario"): así la lista es neutra por construcción, sin la
    // acumulación de "(a)" que vuelve ilegible un desplegable, y coincide con
    // cómo Rotary nombra los cargos en sus propios documentos.
    //
    // `otro` es especial: al elegirlo, el formulario pide escribir el cargo y
    // el servidor lo exige (`clubRoleOther`). Su clave no se cambia sin
    // ajustar esa validación.
    clubRoles: [
        { key: 'presidencia', label: 'Presidencia' },
        { key: 'presidencia_electa', label: 'Presidencia electa' },
        { key: 'presidencia_saliente', label: 'Presidencia saliente' },
        { key: 'vicepresidencia', label: 'Vicepresidencia' },
        { key: 'secretaria', label: 'Secretaría' },
        { key: 'tesoreria', label: 'Tesorería' },
        { key: 'protocolo', label: 'Protocolo (macero)' },
        { key: 'dir_club', label: 'Dirección de Servicio en el Club' },
        { key: 'dir_profesional', label: 'Dirección de Servicio Profesional' },
        { key: 'dir_comunidad', label: 'Dirección de Servicio en la Comunidad' },
        { key: 'dir_internacional', label: 'Dirección de Servicio Internacional' },
        { key: 'dir_nuevas_generaciones', label: 'Dirección de Nuevas Generaciones' },
        { key: 'presidencia_comision', label: 'Presidencia de comisión' },
        { key: 'socio_activo', label: 'Socia o socio activo' },
        { key: 'otro', label: 'Otro' },
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
        // v4.618 — Plantilla del correo, editable desde el panel.
        branding: {
            headerLogoUrl: '',   // logo sobre "Comprobante de inscripción"
            footerLogoUrl: '',   // logo al pie del cuerpo del correo
            footerText: '',      // línea opcional bajo el logo del pie
        },
        // Remitente. Si el dominio no está verificado con el proveedor de
        // correo, el envío se reintenta con el remitente de la plataforma para
        // que el comprobante llegue igual.
        sender: {
            name: '',
            email: '',
            replyTo: '',
        },
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
    // v4.642 — Segundo formulario del proyecto: Solicitud de Aportes del FDD
    // 2026-2027. Se agrega de forma aditiva, igual que `masterForm`: quien no
    // lo haya configurado recibe la plantilla oficial y nada de lo guardado
    // se toca. Los formularios disponibles se listan en
    // `server/lib/projectFormsRegistry.js`.
    fddForm: DEFAULT_FDD_FORM,
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
/**
 * Columnas que comparten todas las tablas de formularios del proyecto
 * (v4.642). Se aplican con ADD COLUMN IF NOT EXISTS sobre cada tabla para que
 * la Formulación —que tiene tabla propia desde antes— y los formularios
 * nuevos se puedan leer y escribir con el mismo código.
 *
 *   approval      respuestas de la sección reservada al Distrito (firmas del
 *                 GD y del presidente del Comité de LFRI, aporte aprobado).
 *                 Vive aparte de `answers` a propósito: así ninguna escritura
 *                 del club puede alcanzarla ni siquiera por error.
 *   reviewStatus  decisión del Distrito: in_review · approved · rejected
 */
const PROJECT_FORM_COLUMNS = (table) => [
    `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS approval JSONB NOT NULL DEFAULT '{}'`,
    `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "reviewStatus" VARCHAR(30)`,
    `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMPTZ`,
    `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "reviewedBy" VARCHAR(160)`,
    `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "reviewNote" TEXT`,
];

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
        // v4.677 — Datos del representante que faltaban para facturar y acreditar.
        addColumn(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS country VARCHAR(120)`),
        addColumn(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS city VARCHAR(160)`),
        addColumn(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS "idType" VARCHAR(40)`),
        addColumn(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS "idTypeLabel" VARCHAR(120)`),
        addColumn(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS "idNumber" VARCHAR(60)`),
        addColumn(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS notes TEXT`),
        // v4.678 — Departamento y rol del representante dentro del club.
        addColumn(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS department VARCHAR(160)`),
        addColumn(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS "clubRole" VARCHAR(60)`),
        addColumn(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS "clubRoleLabel" VARCHAR(160)`),
        addColumn(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS "clubRoleOther" VARCHAR(160)`),
        // v4.683 — El módulo pasa a trabajar por EDICIONES. La edición es el
        // `CalendarEvent` de la feria, el mismo que ya usa el módulo de
        // inscripciones a eventos: así una edición ("XIII Feria 2027") es UNA
        // cosa en toda la plataforma y no dos que hay que mantener en paralelo.
        addColumn(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS "eventId" TEXT`),
        addColumn(`ALTER TABLE "ProjectFairTag" ADD COLUMN IF NOT EXISTS "eventId" TEXT`),
        addColumn(`ALTER TABLE "ProjectFairConfig" ADD COLUMN IF NOT EXISTS "eventId" TEXT`),
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
        // v4.612 — Moneda con la que se fijó el precio ('COP' o 'USD') y moneda
        // con la que Stripe cobró realmente. Se guardan por inscripción para
        // que un cambio posterior de la convocatoria no altere la lectura de
        // los pagos ya hechos.
        addColumn(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS "priceMode" VARCHAR(3)`),
        addColumn(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS "chargeCurrency" VARCHAR(3)`),
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
    // v4.625 — Rol del postulante. Se otorga cuando el webhook de Stripe
    // confirma el pago y se suspende ante un reembolso; nunca lo decide el
    // navegador. Ver `grantProjectManagerRole` / `suspendProjectManagerRole`.
    await db.query(`ALTER TABLE "ProjectFairAccount" ADD COLUMN IF NOT EXISTS role VARCHAR(40) DEFAULT 'applicant'`).catch(() => {});
    await db.query(`ALTER TABLE "ProjectFairAccount" ADD COLUMN IF NOT EXISTS "roleGrantedAt" TIMESTAMPTZ`).catch(() => {});
    await db.query(`ALTER TABLE "ProjectFairAccount" ADD COLUMN IF NOT EXISTS "roleRevokedAt" TIMESTAMPTZ`).catch(() => {});
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

    // v4.642 — Columnas comunes a todos los formularios del proyecto. Se
    // agregan también aquí para que la Formulación y los formularios nuevos
    // tengan la misma forma y el código los trate igual (ver
    // `projectFormsRegistry.storageOf`). Aditivo: no toca ningún dato.
    for (const sql of PROJECT_FORM_COLUMNS('ProjectFairMasterForm')) {
        await db.query(sql).catch(() => {});
    }

    // v4.642 — Respuestas de los DEMÁS formularios del proyecto (hoy, la
    // Solicitud de Aportes del FDD). Una fila por proyecto y formulario. La
    // Formulación se queda en su tabla: mover datos ya guardados de los clubes
    // sería una operación destructiva y no hace falta para nada.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProjectFairProjectForm" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "submissionId" TEXT NOT NULL,
            "formKey" VARCHAR(60) NOT NULL,
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
    for (const sql of PROJECT_FORM_COLUMNS('ProjectFairProjectForm')) {
        await db.query(sql).catch(() => {});
    }
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProjectFairProjectForm_form_key" ON "ProjectFairProjectForm" ("submissionId", "formKey");`).catch(() => {});

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
    // El historial es de todos los formularios. Las revisiones anteriores a
    // v4.642 son de la Formulación, de ahí el valor por defecto.
    await db.query(`ALTER TABLE "ProjectFairFormRevision" ADD COLUMN IF NOT EXISTS "formKey" VARCHAR(60) DEFAULT 'master'`).catch(() => {});
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

    // Índices del aislamiento por edición (v4.683). El de configuración es
    // ÚNICO: una edición tiene una convocatoria y sólo una.
    await db.query(`CREATE INDEX IF NOT EXISTS "ProjectFairSubmission_event_idx" ON "ProjectFairSubmission" ("eventId", "createdAt" DESC);`).catch(() => {});
    await db.query(`CREATE INDEX IF NOT EXISTS "ProjectFairTag_event_idx" ON "ProjectFairTag" ("eventId");`).catch(() => {});
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProjectFairConfig_event_uidx" ON "ProjectFairConfig" ("eventId") WHERE "eventId" IS NOT NULL;`).catch(() => {});

    // Etiquetas sugeridas por el equipo. Se crean una sola vez; el admin puede
    // borrarlas o agregar las suyas desde el módulo.
    for (const [label, color] of DEFAULT_TAGS) {
        await db.query(
            `INSERT INTO "ProjectFairTag" (label, color, "isSystem") VALUES ($1, $2, true) ON CONFLICT DO NOTHING`,
            [label, color]
        ).catch(() => {});
    }

    // v4.978 — Historial de intentos de pago. Un intento no es una inscripción:
    // el índice único parcial de esta tabla es lo que impide que un doble clic
    // o dos pestañas abran dos cobros para la misma inscripción.
    await ensurePaymentAttemptTable();

    await bindLegacyEdition();

    _tablesReady = true;
};

/**
 * Migración de v4.683 — el módulo pasa a trabajar por ediciones.
 *
 * Hasta v4.682 había UNA convocatoria global (la fila `key = 'active'`) y las
 * postulaciones sólo llevaban `editionKey`, un sello de texto que no filtraba
 * nada. Aquí esa convocatoria y sus postulaciones se atan a la edición a la
 * que de verdad pertenecen, que es el `CalendarEvent` de la feria.
 *
 * NO ADIVINA. Si hay un solo evento en el calendario, es ése sin ambigüedad.
 * Si hay varios, se busca el que coincida con el nombre de la edición
 * guardada; si tampoco, la convocatoria queda SIN vincular y el panel lo dice,
 * en vez de atar las postulaciones pagadas de un cliente a la edición
 * equivocada. Nada se borra ni se mueve: sólo se rellena una columna vacía.
 *
 * Se reintenta en cada arranque en frío hasta que consigue vincular, porque es
 * idempotente y sale por lo derecho si ya está hecha. Eso la vuelve
 * autorreparable: si el evento del calendario se crea después del despliegue,
 * la vinculación ocurre sola en el siguiente arranque.
 */
export const bindLegacyEdition = async () => {
    try {
        const legacy = await db.query(`SELECT config, "eventId" FROM "ProjectFairConfig" WHERE key = 'active' LIMIT 1`);
        if (!legacy.rows.length || legacy.rows[0].eventId) return;   // sin nada que migrar, o ya migrada

        let cfg = legacy.rows[0].config || {};
        if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch { cfg = {}; } }

        // OJO: `CalendarEvent` es de TODA la plataforma, que aloja muchos
        // sitios. Buscar "si hay un solo evento" sin acotar por club no es
        // cierto casi nunca, y por eso hasta v4.683 la vinculación no ocurría.
        // El club sale de la convocatoria o, si no está configurado, del que
        // quedó sellado en las propias postulaciones.
        const clubId = cfg?.clubId
            || (await db.query(`SELECT "clubId" FROM "ProjectFairSubmission" WHERE "clubId" IS NOT NULL LIMIT 1`)).rows[0]?.clubId
            || null;
        const events = clubId
            ? await db.query('SELECT id, title FROM "CalendarEvent" WHERE "clubId" = $1 ORDER BY "startDate" DESC NULLS LAST', [clubId])
            : await db.query('SELECT id, title FROM "CalendarEvent" ORDER BY "startDate" DESC NULLS LAST');
        let target = null;
        if (events.rows.length === 1) {
            target = events.rows[0];
        } else if (events.rows.length > 1) {
            const name = String(cfg?.edition?.name || '').trim().toLowerCase();
            if (name) target = events.rows.find(e => String(e.title || '').trim().toLowerCase() === name) || null;
        }

        if (!target) {
            console.warn('[project-fair] La convocatoria quedó SIN edición vinculada: no hay un evento del calendario que la identifique sin ambigüedad. Se vincula desde el panel.');
            return;
        }

        await db.query(`UPDATE "ProjectFairConfig" SET "eventId" = $1, "updatedAt" = NOW() WHERE key = 'active'`, [target.id]);
        const subs = await db.query(`UPDATE "ProjectFairSubmission" SET "eventId" = $1 WHERE "eventId" IS NULL`, [target.id]);
        const tags = await db.query(`UPDATE "ProjectFairTag" SET "eventId" = $1 WHERE "eventId" IS NULL`, [target.id]);
        console.log(`[project-fair] Edición vinculada a "${target.title}": ${subs.rowCount} postulación(es) y ${tags.rowCount} etiqueta(s) migradas.`);
    } catch (err) {
        // Nunca tumba el arranque: sin migrar, el módulo sigue leyendo la
        // convocatoria global de siempre.
        console.error('[project-fair] bindLegacyEdition:', err?.message);
    }
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

// ── Rol del postulante ───────────────────────────────────────────────
// Un club que se inscribió es 'applicant'; cuando el pago queda confirmado
// asciende a 'project_manager' (Gestor de Proyectos) y con un reembolso pasa
// a 'project_manager_suspended' (conserva lectura y descarga, pierde edición).
//
// El ascenso SIEMPRE lo dispara el webhook de Stripe, nunca el regreso del
// navegador, y es idempotente: repetir el evento no vuelve a otorgarlo ni
// duplica la auditoría.
export const APPLICANT_ROLES = {
    APPLICANT: 'applicant',
    MANAGER: 'project_manager',
    SUSPENDED: 'project_manager_suspended',
};

export const grantProjectManagerRole = async (submission, { reason = null } = {}) => {
    try {
        const { rowCount } = await db.query(`
            UPDATE "ProjectFairAccount"
               SET role = $1, "roleGrantedAt" = NOW(), "roleRevokedAt" = NULL, "updatedAt" = NOW()
             WHERE "submissionId" = $2 AND COALESCE(role, '') <> $1
        `, [APPLICANT_ROLES.MANAGER, submission.id]);
        if (!rowCount) return false;   // ya lo tenía, o no hay cuenta

        await logEvent(submission.id, {
            type: 'role_granted',
            title: 'Rol de Gestor de Proyectos otorgado',
            detail: 'El club puede formular y administrar su proyecto.',
            metadata: { role: APPLICANT_ROLES.MANAGER, reason },
        });
        console.log(`[project-fair] 🎓 Gestor de Proyectos — ${submission.publicRef} (${submission.email})`);
        return true;
    } catch (err) {
        // No bloquea la confirmación del pago: el pago es lo crítico.
        console.error('[project-fair] No pude otorgar el rol de gestor:', err?.message);
        return false;
    }
};

export const suspendProjectManagerRole = async (submission, { reason = null } = {}) => {
    try {
        const { rowCount } = await db.query(`
            UPDATE "ProjectFairAccount"
               SET role = $1, "roleRevokedAt" = NOW(), "updatedAt" = NOW()
             WHERE "submissionId" = $2 AND role = $3
        `, [APPLICANT_ROLES.SUSPENDED, submission.id, APPLICANT_ROLES.MANAGER]);
        if (!rowCount) return false;

        await logEvent(submission.id, {
            type: 'role_suspended',
            title: 'Rol de Gestor de Proyectos suspendido',
            detail: 'Conserva la consulta y la descarga; pierde la edición y el envío.',
            metadata: { role: APPLICANT_ROLES.SUSPENDED, reason },
        });
        return true;
    } catch (err) {
        console.error('[project-fair] No pude suspender el rol de gestor:', err?.message);
        return false;
    }
};

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

    // Antes de v4.617 el formulario maestro era una plantilla genérica de
    // arranque, sin editor en el panel: nadie pudo haberla personalizado. Una
    // copia guardada sin `version` es de esa época y se descarta para que
    // aplique la plantilla oficial en Word. Las copias posteriores llevan
    // versión y se respetan tal cual.
    if (isPlainObject(out?.masterForm) && out.masterForm.version === undefined) {
        const { masterForm, ...rest } = out;
        out = rest;
    }

    // El comité retiró del presupuesto los tres conceptos internacionales
    // (v4.788). Quitarlos de `projectFairMasterForm.js` no basta: si la
    // convocatoria tiene su propia copia de la plantilla, el merge reemplaza el
    // array de secciones entero y el cambio del código no llegaría nunca —la
    // misma trampa del catálogo de clubes en v4.707—. Se limpian al leer, como
    // la etiqueta de los CADRES y el orden de los distritos, así que se
    // autorrepara sin escribir en la base durante un despliegue.
    if (isPlainObject(out?.masterForm)) {
        const limpio = dropRetiredBudgetRows(out.masterForm);
        if (limpio !== out.masterForm) out = { ...out, masterForm: limpio };
    }

    // Los dos distritos venían en el orden equivocado por defecto (4281 antes
    // que 4271). Si la fila guardada tiene exactamente esa pareja en ese orden,
    // se invierte al leerla. Cualquier otra lista —con más distritos, con otros
    // nombres o ya ordenada— queda intacta, y el admin puede reordenarla desde
    // la pestaña Convocatoria.
    if (Array.isArray(out?.districts) && out.districts.length === 2
        && out.districts[0]?.value === 'Rotary Distrito 4281'
        && out.districts[1]?.value === 'Rotary Distrito 4271') {
        out = { ...out, districts: [out.districts[1], out.districts[0]] };
    }

    // v4.706 — Cada distrito lleva SU lista de clubes; sin lista, el club se
    // escribe a mano, que es como funcionó siempre.
    //
    // v4.707 — Y antes de normalizar se SIEMBRA el catálogo de los distritos
    // 4271 y 4281. El orden importa: `seedDistrictClubs` distingue un distrito
    // que nunca tuvo el campo (`undefined` → se siembra) de uno cuya lista
    // dejó vacía el administrador (`[]` → se respeta), y normalizar primero
    // borraría esa distinción convirtiendo todo en `[]`. La semilla no puede
    // ir en `DEFAULT_CONFIG` porque `deepMerge` reemplaza los arrays enteros:
    // la fila guardada la taparía.
    if (Array.isArray(out?.districts)) {
        out = {
            ...out,
            districts: seedDistrictClubs(out.districts).map(d => ({
                ...d,
                clubs: Array.isArray(d?.clubs) ? d.clubs.map(c => String(c || '').trim()).filter(Boolean) : [],
            })),
        };
    }

    return out;
};

/**
 * Los clubes que el catálogo reconoce para un distrito. Vacío significa dos
 * cosas distintas y las dos llevan al mismo sitio: que ese distrito no tiene
 * lista cargada, o que el distrito no existe. En ambos casos el club se
 * escribe a mano, que es el comportamiento anterior a v4.706.
 */
export const clubsOfDistrict = (cfg, district) => {
    const d = (Array.isArray(cfg?.districts) ? cfg.districts : []).find(x => x?.value === district);
    return Array.isArray(d?.clubs) ? d.clubs : [];
};

const parseConfig = (raw) => {
    let saved = raw || {};
    if (typeof saved === 'string') { try { saved = JSON.parse(saved); } catch { saved = {}; } }
    return saved;
};

/**
 * Convocatoria de UNA edición. Sin `eventId` devuelve la convocatoria abierta
 * —la que atiende el formulario público—, que es el comportamiento de siempre.
 *
 * Cada edición tiene su propia fila, así que cambiar precios, fechas, textos o
 * el formulario de la XIII no toca nada de la XII.
 */
const readConfig = async (eventId = null) => {
    await ensureTables();
    const { rows } = eventId
        ? await db.query('SELECT config FROM "ProjectFairConfig" WHERE "eventId" = $1 LIMIT 1', [eventId])
        : await db.query(`
            SELECT config FROM "ProjectFairConfig"
            -- Abierta primero; entre varias, la editada más recientemente.
            ORDER BY (config->>'enabled' IS DISTINCT FROM 'false') DESC, "updatedAt" DESC
            LIMIT 1`);
    return deepMerge(DEFAULT_CONFIG, normalizeSavedConfig(parseConfig(rows[0]?.config)));
};

// La usa el módulo de Postulación de Proyectos, siempre con la edición abierta.
export const readConfigForAdmin = (eventId = null) => readConfig(eventId);

/**
 * Convocatoria a la que pertenece UNA postulación — la del panel del club.
 *
 * No es lo mismo que `readConfig(null)`, que devuelve la convocatoria ABIERTA.
 * Hasta v4.690 el panel del club usaba esa: acertaba sólo porque hay una sola
 * edición. El día que se abra la XIII, un proyecto de la XII habría visto el
 * plazo, los precios y el formulario de la XIII. Era el pendiente que dejó
 * anotado la refactorización por ediciones (v4.683) y aquí se cierra, porque
 * nombrar el evento en el panel obliga a nombrar el correcto.
 *
 * SI LA EDICIÓN NO TIENE FILA PROPIA se cae a la abierta, que es el
 * comportamiento de siempre. Es deliberado: `readConfig` mezcla contra
 * `DEFAULT_CONFIG` y nunca devuelve vacío, así que sin esta comprobación una
 * postulación con `eventId` huérfano se quedaría con la plantilla POR DEFECTO
 * —perdiendo el formulario que su club está diligenciando— sin que nada avise.
 */
export const readConfigForSubmission = async (eventId = null) => {
    await ensureTables();
    if (eventId) {
        const { rows } = await db.query('SELECT config FROM "ProjectFairConfig" WHERE "eventId" = $1 LIMIT 1', [eventId]);
        if (rows[0]) return deepMerge(DEFAULT_CONFIG, normalizeSavedConfig(parseConfig(rows[0].config)));
    }
    return readConfig(null);
};

/**
 * El evento de una edición, para que el panel del club pueda decir a qué feria
 * está postulando: nombre, sede, fechas y la dirección de su ficha pública.
 *
 * LOS DATOS SALEN DEL `CalendarEvent`, no de `cfg.edition`. Una edición ES un
 * evento de la plataforma (v4.683), así que su sede y sus fechas ya viven ahí y
 * son las que muestra el módulo de Eventos. `cfg.edition` es un bloque escrito
 * a mano que sólo se usa de respaldo: si el panel leyera de ahí, podría decir
 * una ciudad mientras la ficha del evento dice otra — dos verdades del mismo
 * dato, y la que ve el rotario sería la que nadie mantiene.
 */
export const readEditionEvent = async (eventId) => {
    if (!eventId) return null;
    const { rows } = await db.query(
        'SELECT id, title, slug, "startDate", "endDate", location, image FROM "CalendarEvent" WHERE id = $1 LIMIT 1',
        [eventId],
    );
    const e = rows[0];
    if (!e) return null;
    return {
        id: e.id,
        title: e.title || '',
        // Sin slug la ficha se abre igual por el id: el endpoint público acepta
        // los dos (v4.658). Se prefiere el slug porque es lo que se publica.
        url: `/eventos/${e.slug || e.id}`,
        startDate: e.startDate || null,
        endDate: e.endDate || null,
        location: e.location || '',
        image: e.image || null,
    };
};

/**
 * Igual que `readConfig`, pero devuelve TAMBIÉN a qué edición pertenece la
 * convocatoria leída. Lo necesita el formulario público: una postulación se
 * sella con la edición en la que se hizo, y con el texto solo —como hasta
 * v4.682— no había forma de filtrar por ella.
 */
const readOpenEdition = async () => {
    await ensureTables();
    const { rows } = await db.query(`
        SELECT "eventId", config FROM "ProjectFairConfig"
        ORDER BY (config->>'enabled' IS DISTINCT FROM 'false') DESC, "updatedAt" DESC
        LIMIT 1`);
    return {
        eventId: rows[0]?.eventId || null,
        cfg: deepMerge(DEFAULT_CONFIG, normalizeSavedConfig(parseConfig(rows[0]?.config))),
    };
};

/**
 * Las ediciones del módulo: los eventos del calendario que ya tienen
 * convocatoria, con el resumen que necesita el listado. Es lo que ve el
 * administrador al entrar, igual que en el módulo de Eventos.
 */
export const listEditions = async () => {
    await ensureTables();
    const { rows } = await db.query(`
        SELECT
            c."eventId",
            c.config,
            c."updatedAt",
            e.title, e.slug, e."startDate", e.location,
            COALESCE(s.total, 0)::int  AS "submissions",
            COALESCE(s.paid, 0)::int   AS "paidSubmissions",
            COALESCE(s.usd, 0)::numeric AS "collectedUsd"
        FROM "ProjectFairConfig" c
        LEFT JOIN "CalendarEvent" e ON e.id = c."eventId"
        LEFT JOIN (
            SELECT "eventId",
                   count(*) AS total,
                   count(*) FILTER (WHERE status = 'paid') AS paid,
                   sum("amountUsd") FILTER (WHERE status = 'paid') AS usd
            FROM "ProjectFairSubmission" GROUP BY "eventId"
        ) s ON s."eventId" IS NOT DISTINCT FROM c."eventId"
        ORDER BY e."startDate" DESC NULLS LAST, c."updatedAt" DESC
    `);

    return rows.map(r => {
        const cfg = deepMerge(DEFAULT_CONFIG, normalizeSavedConfig(parseConfig(r.config)));
        return {
            eventId: r.eventId,
            // Sin evento vinculado la edición sigue siendo utilizable: se
            // muestra con el nombre que tiene su propia convocatoria y el panel
            // ofrece vincularla. No se inventa un evento.
            linked: Boolean(r.eventId),
            title: r.title || cfg.edition?.name || 'Convocatoria sin vincular',
            slug: r.slug || null,
            startDate: r.startDate || null,
            location: r.location || [cfg.edition?.city, cfg.edition?.country].filter(Boolean).join(', '),
            edition: cfg.edition,
            deadline: cfg.deadline,
            enabled: cfg.enabled !== false,
            submissions: r.submissions,
            paidSubmissions: r.paidSubmissions,
            collectedUsd: Number(r.collectedUsd) || 0,
            updatedAt: r.updatedAt,
        };
    });
};

// Config pública: sin datos sensibles de operación (clubId, correos internos).
// `surcharge` son las TASAS del recargo, no el importe: el importe lo calcula
// el servidor al abrir el pago. Se pasa desde fuera porque leerlo exige la
// base y esta función es una proyección pura de la configuración.
const toPublicConfig = (cfg, surcharge = null) => ({
    surcharge,
    enabled: cfg.enabled !== false,
    formPath: normalizeFormPath(cfg.formPath),
    edition: cfg.edition,
    deadline: cfg.deadline,
    presentation: cfg.presentation,
    registration: {
        priceMode: resolvePriceMode(cfg),
        amountCop: Number(cfg.registration?.amountCop) || 0,
        amountUsd: Number(cfg.registration?.amountUsd) || 0,
        currency: cfg.registration?.currency || 'COP',
        concept: cfg.registration?.concept || 'Inscripción de proyecto',
        maxProjectsPerClub: cfg.registration?.maxProjectsPerClub ?? 1,
    },
    districts: Array.isArray(cfg.districts) ? cfg.districts : [],
    idTypes: Array.isArray(cfg.idTypes) ? cfg.idTypes : [],
    clubRoles: Array.isArray(cfg.clubRoles) ? cfg.clubRoles : [],
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
        // Las TASAS del recargo, en la moneda en la que se publicó el precio.
        // Degrada: sin configuración el paso de pago se ve como antes.
        let surcharge = null;
        try {
            const sc = await getSurchargeConfig();
            const moneda = resolvePriceMode(cfg);
            const activo = surchargeEnabled(sc, 'project_fair');
            surcharge = {
                enabled: activo,
                currency: moneda,
                lines: activo
                    ? resolveSurchargeRates(sc, { currency: moneda })
                        .map(r => ({ key: r.key, label: r.label, percent: r.percent, fixed: r.fixed }))
                    : [],
            };
        } catch (err) {
            console.warn('[project-fair] No pude resolver el recargo:', err?.message);
        }
        res.json(toPublicConfig(cfg, surcharge));
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

        // La edición viene de la ruta del panel. Sin ella se conserva el
        // comportamiento anterior sobre la convocatoria histórica.
        const eventId = clean(req.query?.evento, 60) || null;

        const { rows } = eventId
            ? await db.query('SELECT config FROM "ProjectFairConfig" WHERE "eventId" = $1 LIMIT 1', [eventId])
            : await db.query(`SELECT config FROM "ProjectFairConfig" WHERE key = 'active' LIMIT 1`);
        const merged = deepMerge(parseConfig(rows[0]?.config), incoming);

        if (eventId) {
            await db.query(`
                INSERT INTO "ProjectFairConfig" (key, "eventId", config, "updatedAt")
                VALUES ($1, $2, $3::jsonb, NOW())
                ON CONFLICT ("eventId") WHERE "eventId" IS NOT NULL
                DO UPDATE SET config = $3::jsonb, "updatedAt" = NOW()
            `, [`edition:${eventId}`, eventId, JSON.stringify(merged)]);
        } else {
            await db.query(`
                INSERT INTO "ProjectFairConfig" (key, config, "updatedAt")
                VALUES ($1, $2::jsonb, NOW())
                ON CONFLICT (key) DO UPDATE SET config = $2::jsonb, "updatedAt" = NOW()
            `, ['active', JSON.stringify(merged)]);
        }

        res.json(deepMerge(DEFAULT_CONFIG, merged));
    } catch (error) {
        console.error('[project-fair] saveAdminConfig:', error);
        res.status(500).json({ error: 'No se pudo guardar la configuración' });
    }
};

// ── Ediciones del módulo (v4.683) ────────────────────────────────────

// GET /admin/ediciones — la primera pantalla del módulo.
export const getEditions = async (_req, res) => {
    try {
        res.json({ editions: await listEditions() });
    } catch (error) {
        console.error('[project-fair] getEditions:', error);
        res.status(500).json({ error: 'No pudimos cargar las ediciones.' });
    }
};

/**
 * POST /admin/ediciones — crear una edición nueva.
 *
 * Body: { eventId, from?, enabled? }
 *
 * Se CLONA la convocatoria de otra edición (`from`) o, si no se indica, la más
 * reciente. Clonar es lo que hace que abrir la XIV no obligue a reconstruir
 * precios, textos, distritos, áreas, tipos de documento, cargos y la plantilla
 * del formulario: la edición nueva nace con la estructura completa y se le
 * cambia lo que haya cambiado.
 *
 * Lo que NO se clona son los datos: postulaciones, pagos, formularios
 * diligenciados y etiquetas se quedan en su edición. Clonar la configuración es
 * heredar el molde; clonar los datos sería inventar inscripciones.
 *
 * Nace CERRADA (`enabled: false`) a propósito, igual que en el módulo de
 * inscripciones a eventos: abrir una convocatoria al público es una decisión
 * explícita, no el efecto secundario de crearla.
 */
export const createEdition = async (req, res) => {
    try {
        await ensureTables();
        const eventId = clean(req.body?.eventId, 60);
        if (!eventId) return res.status(400).json({ error: 'Elige el evento del calendario al que corresponde esta edición.' });

        const evento = await db.query('SELECT id, title, slug, "startDate", location FROM "CalendarEvent" WHERE id = $1 LIMIT 1', [eventId]);
        if (!evento.rows[0]) return res.status(404).json({ error: 'Ese evento no existe en el calendario.' });

        const yaExiste = await db.query('SELECT 1 FROM "ProjectFairConfig" WHERE "eventId" = $1 LIMIT 1', [eventId]);
        if (yaExiste.rows.length) {
            return res.status(409).json({ error: 'Ese evento ya tiene una convocatoria. Ábrela desde el listado.' });
        }

        const from = clean(req.body?.from, 60);
        const origen = from
            ? await db.query('SELECT config FROM "ProjectFairConfig" WHERE "eventId" = $1 LIMIT 1', [from])
            : await db.query('SELECT config FROM "ProjectFairConfig" ORDER BY "updatedAt" DESC LIMIT 1');

        const base = deepMerge(DEFAULT_CONFIG, normalizeSavedConfig(parseConfig(origen.rows[0]?.config)));
        const clonada = {
            ...base,
            // La edición nueva se identifica con SU evento; heredar el nombre y
            // la ciudad de la anterior sería anunciar la feria equivocada.
            edition: { ...base.edition, name: evento.rows[0].title || base.edition?.name || '', key: eventId },
            // Sin fecha límite heredada: la de la edición anterior ya pasó.
            deadline: null,
            enabled: req.body?.enabled === true,
        };

        const { rows } = await db.query(`
            INSERT INTO "ProjectFairConfig" (key, "eventId", config, "updatedAt")
            VALUES ($1, $2, $3::jsonb, NOW())
            RETURNING "eventId"
        `, [`edition:${eventId}`, eventId, JSON.stringify(clonada)]);

        console.log(`[project-fair] Edición creada para "${evento.rows[0].title}"${from ? ` clonando ${from}` : ' clonando la más reciente'}.`);
        res.status(201).json({ eventId: rows[0].eventId, editions: await listEditions() });
    } catch (error) {
        console.error('[project-fair] createEdition:', error);
        res.status(500).json({ error: 'No pudimos crear la edición.' });
    }
};

/**
 * PUT /admin/ediciones/vincular — atar una convocatoria sin vincular a su
 * evento del calendario.
 *
 * Es la salida cuando la migración automática no pudo identificar la edición
 * sin ambigüedad. Aquí no hay ambigüedad posible: la elige una persona. Se
 * arrastran también las postulaciones y etiquetas que quedaron sueltas, que es
 * justo lo que hace que la edición pase a mostrar sus datos.
 */
export const linkEdition = async (req, res) => {
    try {
        await ensureTables();
        const eventId = clean(req.body?.eventId, 60);
        if (!eventId) return res.status(400).json({ error: 'Elige el evento del calendario al que corresponde esta edición.' });

        const evento = await db.query('SELECT id, title FROM "CalendarEvent" WHERE id = $1 LIMIT 1', [eventId]);
        if (!evento.rows[0]) return res.status(404).json({ error: 'Ese evento no existe en el calendario.' });

        const ocupado = await db.query('SELECT 1 FROM "ProjectFairConfig" WHERE "eventId" = $1 LIMIT 1', [eventId]);
        if (ocupado.rows.length) return res.status(409).json({ error: 'Ese evento ya tiene una convocatoria.' });

        const { rowCount } = await db.query(
            `UPDATE "ProjectFairConfig" SET "eventId" = $1, "updatedAt" = NOW() WHERE "eventId" IS NULL`, [eventId]);
        if (!rowCount) return res.status(404).json({ error: 'No hay ninguna convocatoria sin vincular.' });

        const subs = await db.query(`UPDATE "ProjectFairSubmission" SET "eventId" = $1 WHERE "eventId" IS NULL`, [eventId]);
        const tags = await db.query(`UPDATE "ProjectFairTag" SET "eventId" = $1 WHERE "eventId" IS NULL`, [eventId]);
        console.log(`[project-fair] Edición vinculada a mano con "${evento.rows[0].title}": ${subs.rowCount} postulación(es), ${tags.rowCount} etiqueta(s).`);

        res.json({ eventId, submissions: subs.rowCount, editions: await listEditions() });
    } catch (error) {
        console.error('[project-fair] linkEdition:', error);
        res.status(500).json({ error: 'No pudimos vincular la edición.' });
    }
};

/**
 * GET /admin/ediciones/disponibles — eventos del calendario que todavía NO
 * tienen convocatoria. Es lo que se ofrece al crear una edición nueva, para
 * que no haya que escribir un identificador a mano.
 */
export const getAvailableEvents = async (req, res) => {
    try {
        await ensureTables();
        // Acotado al club de quien administra: `CalendarEvent` es de toda la
        // plataforma y sin este filtro la lista traería los eventos de otros
        // sitios alojados, que no tienen nada que ver con esta feria.
        const clubId = req?.user?.clubId || null;
        const { rows } = await db.query(`
            SELECT e.id, e.title, e.slug, e."startDate", e.location
            FROM "CalendarEvent" e
            WHERE NOT EXISTS (SELECT 1 FROM "ProjectFairConfig" c WHERE c."eventId" = e.id)
              ${clubId ? 'AND e."clubId" = $1' : ''}
            ORDER BY e."startDate" DESC NULLS LAST
        `, clubId ? [clubId] : []);
        res.json({ events: rows });
    } catch (error) {
        console.error('[project-fair] getAvailableEvents:', error);
        res.status(500).json({ error: 'No pudimos cargar los eventos del calendario.' });
    }
};

// ── Precio de la inscripción ─────────────────────────────────────────
// El cobro en Stripe SIEMPRE se hace en dólares; lo que cambia es cómo se
// anuncia el precio y de dónde sale la cifra en dólares:
//
//   priceMode 'COP' → el admin fija pesos. Se muestran pesos y se cobra
//                     amountCop / TRM del día. Sin TRM no se puede cobrar.
//   priceMode 'USD' → el admin fija dólares. Se muestran y se cobran tal cual,
//                     sin depender de la TRM.
//
// `amountUsd` es siempre lo que se le cobra al club; `amountCop` es el precio
// anunciado en pesos (null cuando el precio se fijó en dólares).
export const PRICE_MODES = ['COP', 'USD'];

const round2 = (n) => Math.round(Number(n) * 100) / 100;

export const resolvePriceMode = (cfg) => {
    const raw = String(cfg?.registration?.priceMode || cfg?.registration?.currency || 'COP').toUpperCase();
    return PRICE_MODES.includes(raw) ? raw : 'COP';
};

/**
 * Calcula el precio a partir de la configuración y (si hace falta) la TRM.
 * @returns {{ mode, amountCop, amountUsd, needsTrm, trm, ready, error }}
 */
export const computePricing = (cfg, trm) => {
    const mode = resolvePriceMode(cfg);

    if (mode === 'USD') {
        const amountUsd = round2(Number(cfg?.registration?.amountUsd) || 0);
        return {
            mode, amountCop: null, amountUsd, needsTrm: false, trm: null,
            ready: amountUsd > 0,
            error: amountUsd > 0 ? null : 'El valor de inscripción en dólares no está configurado.',
        };
    }

    const amountCop = Math.round(Number(cfg?.registration?.amountCop) || 0);
    const rate = Number(trm?.rate) || 0;
    if (amountCop <= 0) {
        return { mode, amountCop, amountUsd: null, needsTrm: true, trm: null, ready: false, error: 'El valor de inscripción no está configurado.' };
    }
    if (rate <= 0) {
        return {
            mode, amountCop, amountUsd: null, needsTrm: true, trm: null, ready: false,
            error: 'No fue posible consultar la TRM vigente para calcular el valor en dólares. Intenta nuevamente en unos minutos.',
        };
    }
    return { mode, amountCop, amountUsd: round2(amountCop / rate), needsTrm: true, trm, ready: true, error: null };
};

/**
 * El precio con el recargo, que es lo que de verdad se cobra.
 *
 * ⚠️ EL RECARGO SE CALCULA SOBRE EL PRECIO PUBLICADO, en SU moneda, y el cobro
 * en dólares sale de convertir el TOTAL. Al revés —convertir primero y recargar
 * después— el desglose que ve el club en pesos no cuadraría con lo que se le
 * cobra, porque el redondeo del peso y el del dólar no caen en el mismo sitio.
 *
 * Devuelve el `pricing` intacto más `charge`: lo que ya existía no cambia de
 * forma, así que un consumidor que sólo mire el precio sigue viendo el precio.
 */
export const quoteCheckout = (pricing, surchargeConfig, trm = null) => {
    const flow = 'project_fair';
    if (!pricing?.ready) return { ...pricing, surcharge: null, chargeUsd: pricing?.amountUsd ?? null, chargeCop: pricing?.amountCop ?? null };

    if (pricing.mode === 'USD') {
        const q = computeSurcharge(pricing.amountUsd, { config: surchargeConfig, currency: 'USD', flow });
        return { ...pricing, surcharge: q, chargeUsd: q.total, chargeCop: null };
    }

    const q = computeSurcharge(pricing.amountCop, { config: surchargeConfig, currency: 'COP', flow });
    const rate = Number(trm?.rate) || Number(pricing.trm?.rate) || 0;
    return {
        ...pricing,
        surcharge: q,
        chargeCop: q.total,
        // Sin TRM no se inventa una conversión: se conserva la que ya venía.
        chargeUsd: rate > 0 ? round2(q.total / rate) : pricing.amountUsd,
    };
};

// ── TRM (Tasa Representativa del Mercado) ────────────────────────────
// Nunca se usan valores estáticos: se consulta un proveedor cuya fuente es la
// TRM oficial de la Superintendencia Financiera de Colombia (por defecto, el
// dataset abierto de datos.gov.co) con proveedores de respaldo configurables.
// v4.846 — Los proveedores viven en `server/lib/trm.js`: la Bóveda necesita la
// misma cadena para convertir a pesos la comisión que Stripe cobra en dólares,
// y una segunda copia se separaría en silencio de ésta. El resolutor de ABAJO
// se queda acá porque es de la Feria: depende de `ProjectFairConfig` (proveedor
// elegido, respaldos, tasa manual) y de su propio criterio de vencimiento.

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
// Con el precio fijado en dólares la TRM no interviene en el cobro, así que se
// responde el precio sin consultarla: la pantalla de pago no depende de un
// proveedor externo para algo que no necesita.
export const getTrm = async (req, res) => {
    try {
        const cfg = await readConfig();
        if (resolvePriceMode(cfg) === 'USD') {
            const pricing = computePricing(cfg, null);
            return res.json({
                rate: null, date: null, source: null, fetchedAt: null,
                priceMode: pricing.mode, amountCop: null, amountUsd: pricing.amountUsd,
                currency: 'USD',
            });
        }
        const trm = await resolveTrm(cfg, { force: req.query?.force === 'true' });
        const pricing = computePricing(cfg, trm);
        res.json({
            ...trm,
            priceMode: pricing.mode,
            amountCop: pricing.amountCop,
            amountUsd: pricing.amountUsd,
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
        country: row.country || null,
        department: row.department || null,
        city: row.city || null,
        clubRole: row.clubRole || null,
        clubRoleLabel: row.clubRoleLabel || null,
        clubRoleOther: row.clubRoleOther || null,
        idType: row.idType || null,
        idTypeLabel: row.idTypeLabel || null,
        idNumber: row.idNumber || null,
        notes: row.notes || null,
        projectName: row.projectName,
        projectDescription: row.projectDescription,
        focusArea: row.focusArea,
        focusAreaLabel: row.focusAreaLabel,
        budgetUsd: row.budgetUsd === null ? null : Number(row.budgetUsd),
        status: row.status,
        priceMode: row.priceMode || null,
        chargeCurrency: row.chargeCurrency || null,
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
    const country = clean(body.country, 120);
    const department = clean(body.department, 160);
    const city = clean(body.city, 160);
    const clubRole = clean(body.clubRole, 60);
    const clubRoleOther = clean(body.clubRoleOther, 160);
    const idType = clean(body.idType, 40);
    const idNumber = clean(body.idNumber, 60);
    // v4.682 — La postulación ya NO pide comentarios: ese campo vive ahora en el
    // registro de asistentes al evento, que es donde el cliente lo quiere. Se
    // sigue aceptando —y mostrando en la ficha— para no perder lo que ya
    // escribieron las postulaciones anteriores.
    const notes = clean(body.notes, 2000);
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

    // v4.706 — El club NO se exige dentro de la lista: un catálogo se queda
    // viejo, y un club nuevo o recién fusionado que no figure en él no puede
    // quedarse sin postular. Lo que SÍ se rechaza es un club que pertenece al
    // catálogo de OTRO distrito: eso no es un club que falte en la lista, es
    // una pareja distrito-club que se contradice, y llegaría de haber elegido
    // el club y cambiado el distrito después. Sin riesgo de falso positivo: un
    // club que figure en los dos catálogos pasa por la primera condición.
    if (clubName && district && !errors.district) {
        const propios = clubsOfDistrict(cfg, district);
        const igual = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
        if (propios.length && !propios.some(c => igual(c, clubName))) {
            const ajeno = districts.find(d => d.value !== district
                && (Array.isArray(d.clubs) ? d.clubs : []).some(c => igual(c, clubName)));
            if (ajeno) errors.clubName = `${clubName} pertenece a ${ajeno.label}. Revisa el distrito seleccionado.`;
        }
    }

    // v4.677 — País y ciudad del representante. El país llega de una lista en
    // el formulario; aquí sólo se exige que venga, porque no es un dato del
    // que dependa ningún permiso ni ningún cobro.
    if (!country) errors.country = 'Selecciona tu país.';
    // El departamento se elige de una lista cuando el país es Colombia y se
    // escribe en los demás; aquí sólo se exige que venga, igual que el país.
    if (!department) errors.department = 'Indica tu departamento o estado.';
    if (!city) errors.city = 'Escribe tu ciudad.';

    // Documento: el tipo sí se valida contra el catálogo de la convocatoria,
    // como el distrito, para que no entren valores inventados.
    const idTypes = Array.isArray(cfg.idTypes) ? cfg.idTypes : [];
    const idTypeMatch = idTypes.find(t => t.key === idType || t.label === idType);
    if (!idType) errors.idType = 'Selecciona el tipo de documento.';
    else if (idTypes.length && !idTypeMatch) errors.idType = 'Selecciona un tipo de documento válido.';
    if (!idNumber) errors.idNumber = 'Escribe tu número de documento.';
    else if (idNumber.replace(/[^\w]/g, '').length < 5) errors.idNumber = 'El número de documento parece incompleto.';

    // v4.678 — Rol dentro del club. Se valida contra el catálogo de la
    // convocatoria; "Otro" obliga a escribir cuál, porque un "Otro" sin
    // detalle no dice nada y es justo el dato que se quería recoger.
    const clubRoles = Array.isArray(cfg.clubRoles) ? cfg.clubRoles : [];
    const roleMatch = clubRoles.find(r => r.key === clubRole || r.label === clubRole);
    if (!clubRole) errors.clubRole = 'Selecciona tu rol dentro del club.';
    else if (clubRoles.length && !roleMatch) errors.clubRole = 'Selecciona un rol válido.';
    else if (roleMatch?.key === 'otro' && !clubRoleOther) errors.clubRoleOther = 'Escribe cuál es tu cargo.';

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
            country, department, city,
            clubRole: roleMatch?.key || clubRole,
            clubRoleLabel: roleMatch?.label || null,
            // Sólo se guarda el texto libre si el rol elegido es "Otro": si no,
            // quedaría un texto huérfano contradiciendo al cargo del catálogo.
            clubRoleOther: roleMatch?.key === 'otro' ? clubRoleOther : null,
            idType: idTypeMatch?.key || idType,
            idTypeLabel: idTypeMatch?.label || null,
            idNumber, notes,
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
        const { eventId, cfg } = await readOpenEdition();
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

        // Sólo se consulta la TRM si el precio está fijado en pesos.
        let trm = null;
        if (resolvePriceMode(cfg) === 'COP') {
            try { trm = await resolveTrm(cfg); } catch { /* la pantalla de pago reintenta */ }
        }
        const pricing = computePricing(cfg, trm);

        const { rows } = await db.query(`
            INSERT INTO "ProjectFairSubmission"
                ("publicRef", "editionKey", "firstName", "lastName", email, phone, "clubName", district,
                 "eventId",
                 country, department, city, "idType", "idTypeLabel", "idNumber", notes,
                 "clubRole", "clubRoleLabel", "clubRoleOther",
                 "projectName", "projectDescription", "focusArea", "focusAreaLabel", "budgetUsd",
                 status, "amountCop", "amountUsd", "trmRate", "trmDate", "trmSource", "trmFetchedAt", "clubId",
                 "priceMode", metadata)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34::jsonb)
            RETURNING *
        `, [
            buildPublicRef(),
            cfg.edition?.key || null,
            data.firstName, data.lastName, data.email, data.phone, data.clubName, data.district,
            eventId,
            data.country, data.department, data.city, data.idType, data.idTypeLabel, data.idNumber, data.notes || null,
            data.clubRole, data.clubRoleLabel, data.clubRoleOther,
            data.projectName, data.projectDescription, data.focusArea, data.focusAreaLabel, data.budgetUsd,
            'pending_payment', pricing.amountCop, pricing.amountUsd,
            trm?.rate ?? null, trm?.date ?? null, trm?.source ?? null, trm?.fetchedAt ?? null,
            cfg.clubId || null,
            pricing.mode,
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
            trm: trm ? { ...trm, priceMode: pricing.mode, amountCop: pricing.amountCop, amountUsd: pricing.amountUsd } : null,
        });
    } catch (error) {
        console.error('[project-fair] createSubmission:', error);
        res.status(500).json({ error: 'No pudimos registrar la inscripción. Intenta nuevamente.' });
    }
};

// ════════════════════════════════════════════════════════════════════
// v4.978 — Completar o reintentar el pago de una inscripción
//
// UN SOLO CAMINO PARA COBRAR. Antes de esta versión, iniciar el pago vivía
// entero dentro de `createCheckout` —la ruta pública del wizard—, así que el
// panel del club no tenía por dónde reintentar y quien recibía un rechazo del
// banco quedaba encerrado. Ahora las dos puertas —el wizard y el panel—
// entran por `beginCheckout`, y por eso las dos heredan lo mismo: la
// sincronización con el proveedor, la reutilización de la sesión abierta y el
// reclamo que impide el cobro duplicado. Un segundo camino de cobro se separa
// en silencio, y acá lo que se separaría es dinero.
// ════════════════════════════════════════════════════════════════════

/**
 * Pregunta al proveedor por el estado REAL antes de decidir nada.
 *
 * ⚠️ ES EL PASO QUE IMPIDE COBRAR DOS VECES POR UN PROBLEMA DE
 * SINCRONIZACIÓN. Un pago puede estar confirmado en Stripe y todavía no en
 * nuestra base —el webhook se demoró, se perdió, o el usuario cerró la
 * pestaña antes de volver—: sin esta consulta, el panel mostraría «Pendiente
 * de pago», el club pulsaría «Completar pago» y pagaría por segunda vez algo
 * que ya pagó.
 *
 * Nunca lanza: corre en el camino de una pantalla y de un cobro. Si Stripe no
 * responde, se sigue con lo que hay en la base —que es el lado seguro: la
 * inscripción se queda pendiente y no se confirma un pago que no vimos—.
 */
export const syncPaymentState = async (submission, { sessionId = null } = {}) => {
    if (!submission) return { submission: null, changed: false };
    if (hasConfirmedPayment(submission)) return { submission, changed: false };

    const target = clean(sessionId, 200) || submission.stripeSessionId;
    if (!target) return { submission, changed: false };

    let outcome = 'unknown';
    try {
        const session = await getStripe().checkout.sessions.retrieve(target);
        outcome = readSessionOutcome(session);
        if (outcome === 'paid') {
            // La metadata es lo que ata la sesión a la inscripción; una sesión
            // creada antes de que existiera se completa acá para que el flujo
            // idempotente de siempre la reconozca.
            if (!session.metadata?.submissionId) {
                session.metadata = { ...(session.metadata || {}), submissionId: submission.id };
            }
            await confirmPaidSession(session);
        } else if (outcome === 'expired') {
            // La sesión murió sin pagarse: el intento que la sostenía deja de
            // estar abierto. Sin esto, el índice único bloquearía el reintento
            // legítimo del club para siempre.
            await resolveOpenAttemptFor(submission.id, 'expired');
        }
    } catch (err) {
        console.warn('[project-fair] No pude sincronizar el pago con Stripe:', err?.message);
        return { submission, changed: false };
    }

    const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [submission.id]);
    const fresh = rows[0] || submission;
    return { submission: fresh, changed: fresh.status !== submission.status, outcome };
};

/** Expira una sesión de Stripe sin ruido: es limpieza, no parte del cobro. */
const expireSessionQuietly = async (sessionId) => {
    if (!sessionId) return;
    try { await getStripe().checkout.sessions.expire(sessionId); } catch { /* ya vencida o cobrada */ }
};

/**
 * Inicia —o retoma— el pago de una inscripción.
 *
 * Devuelve siempre uno de tres desenlaces y ninguno es una excepción:
 *   { alreadyPaid, submission }  ya estaba pagada (o acaba de confirmarse)
 *   { blocked, error }           no corresponde cobrar (reembolsada, sin TRM…)
 *   { url, reused, attemptId }   a dónde mandar al usuario
 */
export const beginCheckout = async (submissionId, { req = null, returnUrl = null, sessionId = null, actor = null } = {}) => {
    await ensureTables();

    const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [submissionId]);
    let submission = rows[0];
    if (!submission) return { blocked: 'not_found', status: 404, error: 'Inscripción no encontrada' };

    // 1. Lo que ya sabemos. Si la fila dice que está pagada, no hay nada que
    //    preguntar ni que cobrar.
    if (hasConfirmedPayment(submission)) {
        return { alreadyPaid: true, submission: mapSubmission(submission) };
    }
    if (!canStartPayment(submission)) {
        return {
            blocked: 'refunded', status: 409,
            error: 'Esta inscripción fue reembolsada. Escríbenos si necesitas volver a inscribir el proyecto.',
        };
    }

    // 2. ⚠️ SE LE PREGUNTA AL PROVEEDOR ANTES DE COBRAR NADA, y va antes de
    //    calcular el precio a propósito: «¿ya está pagado?» no puede depender
    //    de que la convocatoria tenga bien puesto su valor. Un pago puede
    //    estar confirmado en Stripe y todavía no acá —el webhook se demoró, se
    //    perdió, o el club cerró la pestaña antes de volver—, y sin esta
    //    consulta pagaría por segunda vez algo que ya pagó.
    let attempt = await openAttemptOf(submission.id);
    const candidateId = clean(sessionId, 200) || attempt?.sessionId || submission.stripeSessionId || null;
    let existing = null;
    let outcome = 'unknown';

    if (candidateId) {
        try {
            existing = await getStripe().checkout.sessions.retrieve(candidateId);
            outcome = readSessionOutcome(existing);
            if (outcome === 'paid') {
                // La metadata es lo que ata la sesión a la inscripción; una
                // sesión creada antes de que existiera se completa acá para
                // que el flujo idempotente de siempre la reconozca.
                if (!existing.metadata?.submissionId) {
                    existing.metadata = { ...(existing.metadata || {}), submissionId: submission.id };
                }
                await confirmPaidSession(existing);
                const again = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [submission.id]);
                return { alreadyPaid: true, submission: mapSubmission(again.rows[0] || submission) };
            }
        } catch (err) {
            // La pasarela caída no confirma un pago que no vimos: se sigue con
            // lo que hay en la base, que es el lado seguro —la inscripción se
            // queda pendiente y no se da por pagada—.
            console.warn('[project-fair] No pude leer la sesión de pago anterior:', err?.message);
            existing = null;
        }
    }

    // 3. El monto NUNCA viene del cliente: sale de la configuración de SU
    //    edición, y con el precio en pesos, de la TRM del momento del pago.
    const cfg = await readConfigForSubmission(submission.eventId || null);
    let trm = null;
    if (resolvePriceMode(cfg) === 'COP') {
        try { trm = await resolveTrm(cfg); } catch { /* pricing.ready quedará en false */ }
    }
    const pricing = computePricing(cfg, trm);
    if (!pricing.ready) {
        return {
            blocked: 'pricing',
            status: pricing.needsTrm && pricing.amountCop > 0 ? 503 : 400,
            error: pricing.error,
        };
    }
    // El recargo se resuelve ACÁ, con el precio que acaba de calcular el
    // servidor: nunca viene del navegador. `amountCop`/`amountUsd` siguen
    // siendo el PRECIO publicado —es lo que se le anunció al club y lo que
    // guarda su inscripción—; `chargeUsd` es lo que se le cobra.
    const surchargeConfig = await getSurchargeConfig();
    const quote = quoteCheckout(pricing, surchargeConfig, trm);
    const { amountCop, amountUsd } = pricing;
    const chargeUsd = quote.chargeUsd;
    const chargeCop = quote.chargeCop;
    const surcharge = quote.surcharge;

    // 4. ¿Sirve la sesión que ya existe? Reutilizarla es lo que hace que un
    //    doble clic, dos pestañas o un refresco a mitad del checkout lleven al
    //    MISMO cobro en vez de abrir otro.
    let reusable = null;
    if (existing) {
        // ⚠️ Se compara lo que se COBRA, no el precio: si el recargo cambió,
        // la sesión abierta cobra un valor que ya no es el vigente y hay que
        // expirarla, igual que cuando se mueve la TRM.
        if (reusableCheckout(existing, { amountUsd: chargeUsd })) {
            reusable = existing;
        } else {
            if (outcome === 'open') {
                // Sigue abierta pero ya no sirve —el importe cambió con la
                // TRM—. Se expira: dejarla viva sería un enlace que cobra un
                // valor que ya no es el vigente.
                await expireSessionQuietly(existing.id);
            }
            // ⚠️ Y SU INTENTO SE CIERRA CON ELLA. El índice único admite un
            // solo intento abierto por inscripción: dejarlo vivo sobre una
            // sesión que ya no sirve deja al club en «ya hay un pago en curso»
            // hasta que llegue el webhook de caducidad —minutos u horas—, que
            // es el mismo callejón por otra puerta. Lo destapó la prueba del
            // camino, no la lectura.
            if (attempt) {
                await resolveAttempt(attempt.id, outcome === 'expired' ? 'expired' : 'canceled');
                attempt = null;
            }
        }
    }

    if (reusable) {
        if (attempt) return { url: reusable.url, reused: true, attemptId: attempt.id, pricing, quote };
        // La sesión sigue viva pero su intento se cerró: es el caso de la
        // tarjeta declinada DENTRO del checkout —el webhook cierra el intento
        // y Stripe deja la sesión abierta para que se reintente con otra—.
        // Se abre un intento nuevo sobre la misma sesión: así el historial
        // dice «Intento #2» y no se paga por una sesión de más.
        const claimed = await claimAttempt(submission.id, {
            sessionId: reusable.id, amountCop: chargeCop ?? amountCop, amountUsd: chargeUsd, currency: 'USD',
            metadata: { reusedSession: true, priceMode: pricing.mode, surcharge: surcharge?.surcharge || 0 },
        });
        if (claimed) {
            await logEvent(submission.id, {
                type: 'checkout_retried', title: 'Reintento de pago',
                detail: 'Se retomó la sesión de pago que seguía abierta.',
                metadata: { sessionId: reusable.id, attemptId: claimed.id },
                actor,
            });
            return { url: reusable.url, reused: true, attemptId: claimed.id, pricing, quote };
        }
        // Perdió la carrera: manda el intento del ganador.
        const winner = await openAttemptOf(submission.id);
        return { url: reusable.url, reused: true, attemptId: winner?.id || null, pricing, quote };
    }

    // 4. No hay nada que reutilizar: se crea una sesión nueva.
    const formPath = normalizeFormPath(cfg.formPath);
    const base = resolveOrigin(req || { headers: {} }, returnUrl);
    const edition = cfg.edition?.name || 'Feria de Proyectos Rotary Colombia';

    const session = await getStripe().checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        customer_email: submission.email,
        line_items: [{
            price_data: {
                currency: 'usd',
                product_data: {
                    name: `${cfg.registration?.concept || 'Inscripción de proyecto'} — ${edition}`,
                    // El recargo se NOMBRA también acá: la pantalla de Stripe
                    // es lo último que ve quien paga, y un total mayor que el
                    // precio anunciado sin explicación se lee como un error.
                    description: [
                        `Proyecto: ${String(submission.projectName).slice(0, 150)} · ${submission.clubName}`,
                        pricing.mode === 'COP'
                            ? `${fmtCop(amountCop)} a TRM ${Number(trm.rate).toLocaleString('es-CO', { maximumFractionDigits: 2 })}`
                            : null,
                        surcharge?.surcharge > 0 ? `Incluye ${describeSurcharge(surcharge)}` : null,
                    ].filter(Boolean).join(' · ').slice(0, 250),
                },
                unit_amount: Math.round(chargeUsd * 100),
            },
            quantity: 1,
        }],
        success_url: `${base}${formPath}?submission=${submission.id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}${formPath}?submission=${submission.id}&pago=cancelado`,
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
            priceMode: pricing.mode,
            trmRate: trm?.rate ? String(trm.rate) : '',
            trmDate: trm?.date || '',
            amountCop: amountCop ? String(amountCop) : '',
            amountUsd: amountUsd ? String(amountUsd) : '',
            // v4.980 — El desglose del recargo viaja a Stripe para que la
            // conciliación no dependa sólo de nuestra base, igual que la tasa
            // de cambio de una inscripción al evento.
            surchargeCurrency: surcharge?.enabled ? surcharge.currency : '',
            surchargeAmount: surcharge?.surcharge ? String(surcharge.surcharge) : '',
            surchargeLines: surcharge?.lines?.length
                ? surcharge.lines.map(l => `${l.key}:${l.amount}`).join(',').slice(0, 200)
                : '',
            chargeUsd: chargeUsd ? String(chargeUsd) : '',
            chargeCop: chargeCop ? String(chargeCop) : '',
            clubId: cfg.clubId || '',
        },
    });

    // 5. EL RECLAMO. Se hace DESPUÉS de crear la sesión y no antes: un reclamo
    //    previo que muriera a mitad dejaría un intento abierto sin sesión, y
    //    con él la inscripción bloqueada para reintentar. Perder la carrera
    //    acá cuesta una sesión de Stripe que se expira en el acto — nunca un
    //    segundo cobro, porque a la sesión huérfana no llega nadie.
    const claimed = await claimAttempt(submission.id, {
        sessionId: session.id, amountCop: chargeCop ?? amountCop, amountUsd: chargeUsd, currency: 'USD',
        metadata: { priceMode: pricing.mode, trmRate: trm?.rate ?? null, surcharge: surcharge?.surcharge || 0 },
    });
    if (!claimed) {
        await expireSessionQuietly(session.id);
        const winner = await openAttemptOf(submission.id);
        if (winner?.sessionId) {
            try {
                const other = await getStripe().checkout.sessions.retrieve(winner.sessionId);
                if (reusableCheckout(other, { amountUsd: chargeUsd })) {
                    return { url: other.url, reused: true, attemptId: winner.id, pricing, quote };
                }
            } catch { /* se responde con el error de abajo */ }
        }
        return { blocked: 'busy', status: 409, error: 'Ya hay un pago en curso para esta inscripción. Actualiza la página e inténtalo de nuevo.' };
    }

    await db.query(`
        UPDATE "ProjectFairSubmission"
        SET "stripeSessionId" = $1, "amountCop" = $2, "amountUsd" = $3,
            "trmRate" = COALESCE($4, "trmRate"), "trmDate" = COALESCE($5, "trmDate"),
            "trmSource" = COALESCE($6, "trmSource"), "trmFetchedAt" = COALESCE($7, "trmFetchedAt"),
            "priceMode" = $8, "chargeCurrency" = 'USD',
            "updatedAt" = NOW()
        WHERE id = $9
    `, [session.id, amountCop, amountUsd, trm?.rate ?? null, trm?.date ?? null, trm?.source ?? null, trm?.fetchedAt ?? null, pricing.mode, submission.id]);

    await logEvent(submission.id, {
        type: 'checkout_created',
        title: 'Sesión de pago creada',
        detail: [
            pricing.mode === 'COP' ? fmtCop(amountCop) : fmtUsd(amountUsd),
            surcharge?.surcharge > 0
                ? `+ ${describeSurcharge(surcharge)} = ${pricing.mode === 'COP' ? fmtCop(chargeCop) : fmtUsd(chargeUsd)}`
                : null,
            pricing.mode === 'COP'
                ? `se cobra ${fmtUsd(chargeUsd)} a TRM ${Number(trm.rate).toLocaleString('es-CO', { maximumFractionDigits: 2 })}`
                : null,
        ].filter(Boolean).join(' · '),
        metadata: {
            sessionId: session.id, priceMode: pricing.mode, amountCop, amountUsd,
            trmRate: trm?.rate ?? null, attemptId: claimed.id,
            surcharge: surcharge?.enabled ? {
                currency: surcharge.currency, amount: surcharge.surcharge,
                lines: surcharge.lines, total: surcharge.total,
            } : null,
            chargeUsd, chargeCop,
        },
        actor,
    });

    return { url: session.url, sessionId: session.id, reused: false, attemptId: claimed.id, pricing, quote };
};

/**
 * El VEREDICTO del pago, ya resuelto, para que la pantalla sólo lo pinte.
 *
 * ⚠️ ESTO NO SE CALCULA EN EL NAVEGADOR, y es la exigencia expresa del pedido:
 * el frontend nunca es la fuente de verdad del estado del pago. Por eso no hay
 * espejo de `projectFairPayment.js` en `src/` — una segunda copia del criterio
 * allá se separaría de ésta en silencio, y lo que se separaría es si a alguien
 * se le ofrece pagar dos veces.
 */
export const paymentStateFor = async (submission) => {
    const attempts = await listAttempts(submission.id);
    const view = paymentViewOf(submission, { lastFailure: lastFailureOf(attempts) });

    // v4.980 — El desglose del recargo viaja RESUELTO, en la moneda en la que
    // se publicó el precio. No hace falta la TRM para pintarlo: la conversión
    // a dólares sólo interviene al cobrar. Sin la configuración —la base no
    // respondió— la pantalla se ve como antes de que esto existiera.
    const priceMode = String(submission.priceMode || 'COP').toUpperCase() === 'USD' ? 'USD' : 'COP';
    const precio = priceMode === 'USD' ? Number(submission.amountUsd) : Number(submission.amountCop);
    let surcharge = null;
    try {
        surcharge = computeSurcharge(precio, {
            config: await getSurchargeConfig(),
            currency: priceMode,
            flow: 'project_fair',
        });
    } catch (err) {
        console.warn('[project-fair] No pude resolver el recargo:', err?.message);
    }

    return {
        ...view,
        priceMode,
        surcharge,
        amountCop: submission.amountCop === null || submission.amountCop === undefined ? null : Number(submission.amountCop),
        amountUsd: submission.amountUsd === null || submission.amountUsd === undefined ? null : Number(submission.amountUsd),
        paidAt: submission.paidAt || null,
        receiptUrl: submission.receiptUrl || null,
        attempts: attemptHistoryOf(attempts),
    };
};

// POST /api/project-fair/submissions/:id/checkout  (público)
// La puerta del wizard. Toda la lógica vive en `beginCheckout`, que comparte
// con el panel del club: así el wizard también sincroniza antes de cobrar y
// reutiliza la sesión abierta en vez de crear otra.
export const createCheckout = async (req, res) => {
    try {
        const result = await beginCheckout(req.params.id, {
            req,
            returnUrl: req.body?.returnUrl,
            sessionId: req.body?.sessionId || req.query?.session_id,
        });
        if (result.alreadyPaid) {
            // No es un error: es la respuesta correcta a «quiero pagar algo que
            // ya está pagado». Se devuelve la inscripción para que la pantalla
            // se actualice sola en vez de mandar a nadie a un segundo cobro.
            return res.json({ alreadyPaid: true, submission: result.submission });
        }
        if (result.blocked) return res.status(result.status || 400).json({ error: result.error });
        res.json({ url: result.url, sessionId: result.sessionId, reused: !!result.reused });
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
            "chargeCurrency" = COALESCE($10, "chargeCurrency"),
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
        (session.currency || '').toUpperCase() || null,
    ]);

    const paid = updated[0];
    // El intento que sostenía esta sesión queda cerrado como aprobado. El
    // historial NO se sobrescribe: los rechazos anteriores siguen ahí, que es
    // lo único que contesta «¿por qué este club llamó a soporte?» dentro de
    // seis meses.
    await resolveAttemptFor(submissionId, 'succeeded', { sessionId: session.id, paymentIntentId });
    console.log(`[project-fair] ✅ Pago confirmado — inscripción ${paid.publicRef} (${paid.clubName}) ref ${paymentIntentId || session.id}`);

    // El pago confirmado es lo que convierte al club en Gestor de Proyectos.
    await grantProjectManagerRole(paid, { reason: paymentIntentId || session.id });

    await logEvent(submissionId, {
        type: 'payment_succeeded',
        title: 'Pago aprobado',
        detail: `${fmtAmount(amountReceived, session.currency)}${charge?.payment_method_details?.type ? ` · ${charge.payment_method_details.type}` : ''}`,
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
                // ⚠️ v4.980 — LO QUE RETUVO LA PLATAFORMA SE REGISTRA, y sale
                // del recargo que se le SUMÓ al club, no de `feeRules`: acá el
                // precio publicado es lo que la organización tiene que
                // recibir, así que la retención es exactamente la línea de
                // traslado interbancario que pagó de más quien se inscribió.
                // Recalcularla con la tarifa de los aportes descontaría dos
                // veces —una al sumar y otra al retener—.
                const md = session.metadata || {};
                const lineas = String(md.surchargeLines || '')
                    .split(',').filter(Boolean)
                    .map(par => par.split(':'))
                    .reduce((acc, [k, v]) => ({ ...acc, [k]: Number(v) || 0 }), {});
                const totalRecargo = Number(md.surchargeAmount) || 0;
                // El recargo se calculó en la moneda PUBLICADA y este Payment
                // vive en la del cobro. Se reparte lo recibido en la misma
                // proporción —cada línea sobre el total publicado— en vez de
                // convertir con una tasa que acá no tenemos. Sin recargo, la
                // retención es cero y se dice así.
                const totalPublicado = Number(md.chargeCop) || Number(md.chargeUsd) || 0;
                const enMonedaDelCobro = (valor) => (
                    totalRecargo > 0 && totalPublicado > 0 && total > 0
                        ? Math.round((valor / totalPublicado) * total * 100) / 100
                        : 0
                );
                const retencion = enMonedaDelCobro(lineas.transfer || 0);
                const procesador = enMonedaDelCobro(lineas.gateway || 0);
                await prisma.payment.create({
                    data: {
                        provider: 'stripe',
                        providerRef,
                        status: 'succeeded',
                        amount: total,
                        applicationFee: retencion > 0 ? retencion : null,
                        netAmount: total > 0 ? Math.max(0, Math.round((total - retencion - procesador) * 100) / 100) : null,
                        currency: (session.currency || 'cop').toUpperCase(),
                        isPlatformCollection: true,
                        clubId: submission.clubId,
                        rawPayload: JSON.stringify({
                            type: 'project_fair_registration',
                            submissionId,
                            publicRef: paid.publicRef,
                            sessionId: session.id,
                            // El desglose se guarda TAL CUAL se cobró, en su
                            // moneda: dentro de un año «¿por qué este club pagó
                            // 262.500 por una inscripción de 250.000?» tiene
                            // que poder contestarse sin reconstruir tarifas.
                            surcharge: totalRecargo > 0 ? {
                                currency: md.surchargeCurrency || null,
                                amount: totalRecargo,
                                lines: lineas,
                                chargeCop: md.chargeCop ? Number(md.chargeCop) : null,
                                chargeUsd: md.chargeUsd ? Number(md.chargeUsd) : null,
                            } : null,
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
            await sendFairEmail({
                to: admins.join(','),
                subject: `Nueva inscripción pagada — ${paid.publicRef} · ${paid.clubName}`,
                html: buildAdminNotificationHtml(paid, cfg),
                cfg,
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

    // Un rechazo CIERRA su intento —no la inscripción—. La sesión de Stripe
    // puede seguir abierta para que el club pruebe otra tarjeta: si vuelve y
    // pulsa «Reintentar pago», `beginCheckout` la retoma y abre el intento
    // siguiente, y el historial dice «Intento #1 → Rechazado · Intento #2 →…».
    await resolveAttemptFor(submission.id, 'failed', {
        paymentIntentId: paymentIntent?.id || null,
        failureCode: paymentIntent?.last_payment_error?.decline_code || paymentIntent?.last_payment_error?.code || null,
        failureMessage: reason,
    });

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

    // Sin esto el intento quedaría abierto para siempre y el índice único
    // bloquearía el reintento legítimo del club: un candado sin salida
    // convierte una sesión caducada en un callejón.
    await resolveAttemptFor(submission.id, 'expired', { sessionId: session?.id || null });

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
        detail: `${fmtAmount(refunded, charge?.currency)} de ${fmtAmount(total, charge?.currency)}`,
        metadata: { chargeId: charge?.id || null, refunded, total, isFull },
    });
    // Un reembolso total deja el proyecto en consulta: se suspende el rol.
    if (isFull) await suspendProjectManagerRole(submission, { reason: charge?.id || 'refund' });
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
// Monto en la moneda con la que Stripe procesó el cobro (hoy siempre USD; los
// pagos anteriores a v4.612 se hicieron en COP y se siguen leyendo bien).
const fmtAmount = (n, currency) =>
    String(currency || 'usd').toLowerCase() === 'cop' ? fmtCop(n) : fmtUsd(n);
const esc = (s) => String(s ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Sólo se admiten URLs http(s) para los logos: evita inyectar cualquier cosa
// en el HTML del correo desde la configuración.
const safeImageUrl = (url) => {
    const raw = String(url || '').trim();
    return /^https?:\/\/[^\s"'<>]+$/i.test(raw) ? raw : '';
};

/** Logo sobre "Comprobante de inscripción", si el admin configuró uno. */
const headerLogoHtml = (cfg) => {
    const url = safeImageUrl(cfg?.notifications?.branding?.headerLogoUrl);
    if (!url) return '';
    return `<div style="margin-bottom:18px"><img src="${url}" alt="" style="max-width:230px;max-height:70px;height:auto;display:inline-block"></div>`;
};

/** Logo y texto del pie del cuerpo del correo. */
const footerBrandingHtml = (cfg) => {
    const url = safeImageUrl(cfg?.notifications?.branding?.footerLogoUrl);
    const text = String(cfg?.notifications?.branding?.footerText || '').trim();
    if (!url && !text) return '';
    return `<div style="text-align:center;padding:24px 32px 4px;border-top:1px solid #e5e7eb">
      ${url ? `<img src="${url}" alt="" style="max-width:200px;max-height:64px;height:auto;display:inline-block">` : ''}
      ${text ? `<div style="margin-top:10px;font-size:13px;color:#6b7280">${esc(text)}</div>` : ''}
    </div>`;
};

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
      ${headerLogoHtml(cfg)}
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
        ${s.amountCop ? row('Valor de inscripción', fmtCop(s.amountCop)) : ''}
        ${s.trmRate ? row('TRM aplicada', `${Number(s.trmRate).toLocaleString('es-CO', { maximumFractionDigits: 2 })} COP/USD${s.trmDate ? ` · ${esc(s.trmDate)}` : ''}`) : ''}
        ${s.amountUsd ? row(s.amountCop ? 'Valor cobrado' : 'Valor de inscripción', fmtUsd(s.amountUsd)) : ''}
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
    ${footerBrandingHtml(cfg)}
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
    <li><strong>Inscripción:</strong> ${s.amountCop ? `${fmtCop(s.amountCop)} · cobrados ${fmtUsd(s.amountUsd)}` : fmtUsd(s.amountUsd)}${s.trmRate ? ` · TRM ${Number(s.trmRate).toLocaleString('es-CO', { maximumFractionDigits: 2 })}` : ''}</li>
  </ul>
</div>`;

/**
 * Remitente configurado en la convocatoria, en formato `"Nombre" <correo>`.
 * Devuelve null si no hay uno propio: entonces se usa el de la plataforma.
 */
export const resolveSender = (cfg) => {
    const email = String(cfg?.notifications?.sender?.email || '').trim();
    if (!isEmail(email)) return null;
    const name = String(cfg?.notifications?.sender?.name || cfg?.edition?.name || 'Feria de Proyectos').trim();
    return `"${name.replace(/"/g, '')}" <${email}>`;
};

/**
 * Envío de los correos del módulo. Si la convocatoria define un remitente
 * propio se usa ese; y si el proveedor lo rechaza —típicamente porque el
 * dominio todavía no está verificado— se reintenta con el remitente de la
 * plataforma, para que el correo llegue igual en vez de perderse.
 */
export const sendFairEmail = async ({ to, subject, html, cfg }) => {
    const custom = resolveSender(cfg);
    const replyTo = String(cfg?.notifications?.sender?.replyTo || '').trim() || undefined;

    const attempt = (from) => EmailService.sendPlatformEmail({ to, subject, html, from, replyTo });

    try {
        if (custom) {
            const first = await attempt(custom);
            if (first?.success) return first;
            console.warn(`[project-fair] El remitente propio (${custom}) fue rechazado: ${first?.error || 'sin detalle'}. Reintento con el remitente de la plataforma.`);
            const fallback = await attempt(PLATFORM_SENDER);
            return fallback?.success
                ? { ...fallback, usedFallbackSender: true }
                : fallback;
        }
        return await attempt(PLATFORM_SENDER);
    } catch (error) {
        return { success: false, error: error?.message || 'Error enviando el correo' };
    }
};

// Reenvío del comprobante desde el módulo de gestión: misma plantilla que el
// envío automático, devolviendo el resultado para poder informarlo en la UI.
export const sendReceiptFor = async (submission, cfg) => sendFairEmail({
    to: submission.email,
    subject: `Inscripción confirmada ${submission.publicRef} — ${cfg.edition?.name || 'Feria de Proyectos Rotary Colombia'}`,
    html: buildReceiptHtml(submission, cfg),
    cfg,
});

const sendReceiptEmail = async (submission, cfg) => {
    if (!isEmail(submission.email)) return;
    const result = await sendReceiptFor(submission, cfg);
    if (result?.success) console.log(`[project-fair] ✉️ Comprobante enviado a ${submission.email}${result.usedFallbackSender ? ' (con el remitente de la plataforma)' : ''}`);
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
