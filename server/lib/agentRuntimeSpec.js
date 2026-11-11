// ═══════════════════════════════════════════════════════════
// AI Agent Command Center — runtime: EL CRITERIO (v4.1316.0)
//
// PURO: sin base, sin red, sin IA. Decide:
//   · los estados de una tarea y sus transiciones, reintentos y topes;
//   · el CATÁLOGO de herramientas (contrato, módulo, nivel de riesgo, modos);
//   · qué puede ejecutar una instalación con una herramienta concedida;
//   · la huella de una acción que espera aprobación (lo aprobado es lo que
//     se ejecuta: si la carga cambia, hay que aprobar de nuevo);
//   · las programaciones (diaria, semanal, cada N minutos, por evento) en la
//     hora de Colombia;
//   · los CHEQUEOS DETERMINISTAS de los tres pilotos. Un hallazgo cita la
//     fila que lo sostiene: lo que dice un informe se puede verificar.
// ═══════════════════════════════════════════════════════════

import crypto from 'node:crypto';

// ── Tareas ─────────────────────────────────────────────────────────────
export const TASK_STATES = {
    queued: 'En cola', running: 'Ejecutándose', waiting_approval: 'Esperando aprobación',
    succeeded: 'Completada', failed: 'Fallida (se reintentará)', dead: 'Fallida definitivamente', cancelled: 'Cancelada',
};
const TASK_TRANSITIONS = {
    queued: ['running', 'cancelled'],
    running: ['succeeded', 'failed', 'dead', 'waiting_approval', 'queued', 'cancelled'],
    waiting_approval: ['queued', 'succeeded', 'cancelled'],
    failed: ['queued', 'running', 'dead', 'cancelled'],
    succeeded: [], dead: ['queued'], cancelled: [],
};
export function canTransitionTask(from, to) { return (TASK_TRANSITIONS[from] || []).includes(to); }

export const LIMITS = {
    maxStepsPerRun: 12,
    maxToolCallsPerStep: 4,
    maxDelegationDepth: 3,
    maxAttempts: 3,
    leaseSeconds: 90,
    tickBudgetMs: 240_000,     // de los 300 s de la función
    maxTasksPerTick: 10,
    maxOutputChars: 20_000,
    maxToolResultChars: 12_000,
};

/** Espera antes del reintento N (1, 2, 3…): 1, 4, 16 minutos. */
export function retryDelayMs(attempt) {
    return Math.min(60, 4 ** Math.max(0, attempt - 1)) * 60_000;
}

/** ¿Se puede delegar? Ni más de N niveles, ni a sí mismo dentro de la cadena. */
export function canDelegate({ chain = [], targetInstallationId }) {
    if (chain.length >= LIMITS.maxDelegationDepth) return { ok: false, reason: `Se alcanzó la profundidad máxima de delegación (${LIMITS.maxDelegationDepth}).` };
    if (chain.includes(targetInstallationId)) return { ok: false, reason: 'Un agente no puede delegarse una tarea a sí mismo dentro de la misma cadena.' };
    return { ok: true };
}

/** Clave de idempotencia estable para una entrada. */
export function idempotencyKeyFor(parts) {
    return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 40);
}

// ── Riesgo y modos ─────────────────────────────────────────────────────
// N0 lectura · N1 borrador · N2 acción interna reversible · N3 acción externa
// o institucional. Lo PROHIBIDO no tiene herramienta (ver PROHIBITED).
export const RISK = {
    N0: { label: 'Lectura', approval: 'none' },
    N1: { label: 'Borrador', approval: 'none' },
    N2: { label: 'Acción interna', approval: 'responsible' },
    N3: { label: 'Acción externa', approval: 'always' },
};
export const GRANT_MODES = { read: 'Sólo lectura', draft: 'Hasta borradores', act_with_approval: 'Acciones con aprobación' };
const MODE_ALLOWS = { read: ['N0'], draft: ['N0', 'N1'], act_with_approval: ['N0', 'N1', 'N2', 'N3'] };

export const PROHIBITED = [
    'Confirmar, modificar o reembolsar pagos',
    'Mover saldos o escribir en el libro mayor de la Bóveda',
    'Eliminar o fusionar inscripciones, participantes o postulaciones',
    'Aprobar o rechazar proyectos',
    'Cambiar permisos o roles',
    'Desplegar código o cambiar la configuración técnica',
];

/** ¿Qué hace esta llamada con esta concesión? 'run' | 'approval' | 'deny'. */
export function decideToolUse({ tool, grantMode, autoApproveN2 = false }) {
    if (!tool) return { decision: 'deny', reason: 'Herramienta desconocida.' };
    if (!grantMode) return { decision: 'deny', reason: 'Esta herramienta no está concedida a la instalación.' };
    if (!(MODE_ALLOWS[grantMode] || []).includes(tool.risk)) return { decision: 'deny', reason: `La concesión «${GRANT_MODES[grantMode] || grantMode}» no alcanza una herramienta de nivel ${tool.risk}.` };
    if (tool.risk === 'N3') return { decision: 'approval', reason: 'Acción externa: requiere aprobación humana.' };
    if (tool.risk === 'N2' && !autoApproveN2) return { decision: 'approval', reason: 'Acción interna: requiere aprobación del responsable.' };
    return { decision: 'run', reason: '' };
}

/** La huella de una acción: lo aprobado es exactamente lo que se ejecuta. */
export function approvalHash({ tool, args, siteId }) {
    const canon = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((o, k) => (o[k] = canon(v[k]), o), {}) : Array.isArray(v) ? v.map(canon) : v);
    return crypto.createHash('sha256').update(JSON.stringify({ tool, args: canon(args || {}), siteId: siteId || null })).digest('hex');
}

// ── Catálogo de herramientas ───────────────────────────────────────────
// `scope: 'installation'` = el sitio SIEMPRE sale de la instalación, nunca de
// los argumentos (no hay `siteId` en ningún esquema, a propósito).
const obj = (properties, required = []) => ({ type: 'object', properties, required });
export const TOOL_CATALOG = [
    { key: 'site_context', module: 'dashboard', risk: 'N0', team: null, description: 'Datos básicos del sitio: nombre, tipo, distrito, proyectos y noticias recientes.', parameters: obj({}) },
    { key: 'events_list', module: 'events', risk: 'N0', team: 'eventos', description: 'Lista los eventos del sitio con inscripciones (los más recientes primero).', parameters: obj({ limit: { type: 'integer', description: 'Máximo 30.' } }) },
    { key: 'events_registration_review', module: 'events', risk: 'N0', team: 'eventos', description: 'Revisa las inscripciones de un evento y devuelve hallazgos clasificados (sin comprobante, posible duplicado, pago y estado que no cuadran, datos incompletos), cada uno con su evidencia.', parameters: obj({ eventId: { type: 'string', description: 'Id del evento (de events_list).' } }, ['eventId']) },
    { key: 'fair_submissions_list', module: 'project_fair', risk: 'N0', team: 'proyectos', description: 'Lista las postulaciones de la Feria de Proyectos del sitio.', parameters: obj({ limit: { type: 'integer', description: 'Máximo 100.' } }) },
    { key: 'fair_submission_review', module: 'project_fair', risk: 'N0', team: 'proyectos', description: 'Revisa UNA postulación: requisitos cumplidos o faltantes e inconsistencias, con el campo que sostiene cada observación.', parameters: obj({ submissionId: { type: 'string' } }, ['submissionId']) },
    { key: 'content_recent', module: 'news', risk: 'N0', team: 'comunicaciones', description: 'Noticias recientes del sitio (título, fecha, si está publicada).', parameters: obj({ limit: { type: 'integer', description: 'Máximo 20.' } }) },
    { key: 'seo_latest_audit', module: 'seo', risk: 'N0', team: 'comunicaciones', description: 'Último resultado del SEO Inteligente del sitio: puntaje y problemas abiertos.', parameters: obj({}) },
    { key: 'content_create_news_draft', module: 'news', risk: 'N1', team: 'comunicaciones', description: 'Crea una noticia en BORRADOR (nunca publicada) para que una persona la revise.', parameters: obj({ title: { type: 'string' }, content: { type: 'string', description: 'Cuerpo en HTML simple o texto.' } }, ['title', 'content']) },
    { key: 'content_publish_news', module: 'news', risk: 'N3', team: 'comunicaciones', description: 'Publica una noticia que está en borrador. SIEMPRE requiere aprobación humana.', parameters: obj({ postId: { type: 'string' } }, ['postId']) },
    { key: 'delegate_task', module: 'agents', risk: 'N1', team: null, description: 'Encarga una tarea a otro agente instalado en el mismo ámbito.', parameters: obj({ targetTemplateKey: { type: 'string', description: 'Clave de la plantilla del agente destinatario.' }, goal: { type: 'string' } }, ['targetTemplateKey', 'goal']) },
];
export const TOOL_KEYS = TOOL_CATALOG.map(t => t.key);
export const toolByKey = (k) => TOOL_CATALOG.find(t => t.key === k) || null;

/** Valida los argumentos contra el esquema del catálogo. Recorta lo que sobra. */
export function sanitizeToolArgs(tool, args) {
    const props = tool?.parameters?.properties || {};
    const req = tool?.parameters?.required || [];
    const out = {};
    const errors = [];
    for (const [k, def] of Object.entries(props)) {
        const v = args?.[k];
        if (v == null || v === '') continue;
        if (def.type === 'integer') { const n = parseInt(v, 10); if (Number.isFinite(n)) out[k] = n; else errors.push(`${k} debe ser un número.`); }
        else out[k] = String(v).slice(0, k === 'content' ? 20000 : 500);
    }
    for (const r of req) if (out[r] == null) errors.push(`Falta ${r}.`);
    return { args: out, errors };
}

// ── Programaciones ─────────────────────────────────────────────────────
// Colombia no tiene horario de verano: UTC−5 todo el año.
export const TZ_OFFSET_MIN = -300;

/** Formatos: 'daily@07:00', 'weekly@1@07:00' (1=lunes…7=domingo), 'every@60' (minutos), 'event@tipo'. */
export function parseCadence(c) {
    const s = String(c || '').trim();
    let m;
    if ((m = /^daily@([01]\d|2[0-3]):([0-5]\d)$/.exec(s))) return { kind: 'daily', h: +m[1], min: +m[2] };
    if ((m = /^weekly@([1-7])@([01]\d|2[0-3]):([0-5]\d)$/.exec(s))) return { kind: 'weekly', dow: +m[1], h: +m[2], min: +m[3] };
    if ((m = /^every@(\d{1,5})$/.exec(s)) && +m[1] >= 15) return { kind: 'every', minutes: +m[1] };
    if ((m = /^event@([a-z_.]{3,60})$/.exec(s))) return { kind: 'event', type: m[1] };
    return null;
}

export function describeCadence(c) {
    const p = parseCadence(c);
    if (!p) return 'Programación inválida';
    const hh = (h, mi) => `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
    if (p.kind === 'daily') return `Todos los días a las ${hh(p.h, p.min)}`;
    if (p.kind === 'weekly') return `Cada ${['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][p.dow - 1]} a las ${hh(p.h, p.min)}`;
    if (p.kind === 'every') return `Cada ${p.minutes} minutos`;
    return `Cuando ocurre «${p.type}»`;
}

/** La próxima ejecución DESPUÉS de `from` (Date). null para los de evento. */
export function nextRunAt(cadence, from = new Date()) {
    const p = parseCadence(cadence);
    if (!p || p.kind === 'event') return null;
    if (p.kind === 'every') return new Date(from.getTime() + p.minutes * 60_000);
    const local = new Date(from.getTime() + TZ_OFFSET_MIN * 60_000); // reloj de Bogotá, en campos UTC
    const cand = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), p.h, p.min));
    if (p.kind === 'weekly') {
        const dow = ((cand.getUTCDay() + 6) % 7) + 1; // 1=lunes
        cand.setUTCDate(cand.getUTCDate() + ((p.dow - dow + 7) % 7));
    }
    while (cand.getTime() <= local.getTime()) cand.setUTCDate(cand.getUTCDate() + (p.kind === 'weekly' ? 7 : 1));
    return new Date(cand.getTime() - TZ_OFFSET_MIN * 60_000);
}

// ── Eventos de los módulos ─────────────────────────────────────────────
export const AGENT_EVENT_TYPES = {
    'event_registration.created': 'Nueva inscripción a un evento',
    'event_registration.completed': 'Nueva inscripción completada (con comprobante)',
    'fair_submission.created': 'Nueva postulación a la Feria de Proyectos',
    'content_submission.received': 'Nueva solicitud de contenido',
};

// ── Chequeos deterministas: INSCRIPCIONES (piloto W3) ──────────────────
const lower = (v) => String(v || '').trim().toLowerCase();
const digits = (v) => String(v || '').replace(/\D+/g, '');
const SETTLED = ['paid', 'confirmed', 'accredited', 'attended', 'no_show'];

/**
 * Hallazgos sobre las inscripciones de UN evento. `registrations` = filas de
 * "EventRegistration"; `completed` = filas de "EventCompletedRegistration".
 * Cada hallazgo: { kind, severity, registrationId, source, evidence }.
 */
export function reviewRegistrations({ registrations = [], completed = [], now = new Date() } = {}) {
    const findings = [];
    const push = (f) => findings.push(f);
    const all = [
        ...registrations.map(r => ({ ...r, source: 'EventRegistration' })),
        ...completed.map(r => ({ ...r, source: 'EventCompletedRegistration' })),
    ];
    const activeOf = (r) => !['cancelled', 'refunded', 'rejected', 'expired', 'draft'].includes(r.status);

    // Duplicados: mismo correo o mismo documento entre inscripciones activas.
    const byKey = new Map();
    for (const r of all.filter(activeOf)) {
        for (const key of [lower(r.email) && `email:${lower(r.email)}`, digits(r.documentNumber).length >= 5 && `doc:${digits(r.documentNumber)}`].filter(Boolean)) {
            if (!byKey.has(key)) byKey.set(key, []);
            byKey.get(key).push(r);
        }
    }
    const seenPairs = new Set();
    for (const [key, rows] of byKey) {
        const unique = [...new Map(rows.map(r => [`${r.source}:${r.id}`, r])).values()];
        if (unique.length < 2) continue;
        const ids = unique.map(r => r.id).sort().join('|');
        if (seenPairs.has(ids)) continue;
        seenPairs.add(ids);
        push({ kind: 'possible_duplicate', severity: 'medium', registrationId: unique[0].id, source: unique[0].source, related: unique.map(r => ({ id: r.id, source: r.source, code: r.registrationCode || r.publicRef || null })), evidence: `${unique.length} inscripciones activas comparten ${key.startsWith('email') ? 'el correo' : 'el documento'}.` });
    }

    for (const r of completed) {
        if (!activeOf(r)) continue;
        if (!r.receiptKey && r.status === 'submitted' && !['stripe', 'paypal'].includes(lower(r.paymentMethod))) {
            push({ kind: 'missing_receipt', severity: 'high', registrationId: r.id, source: 'EventCompletedRegistration', evidence: 'Pendiente de validación y sin comprobante adjunto.' });
        }
        if (r.status === 'submitted' && r.createdAt && now - new Date(r.createdAt) > 7 * 86400_000) {
            push({ kind: 'stale_pending', severity: 'medium', registrationId: r.id, source: 'EventCompletedRegistration', evidence: `Lleva ${Math.floor((now - new Date(r.createdAt)) / 86400_000)} días pendiente de validación.` });
        }
        const missing = ['firstName', 'lastName', 'documentNumber', 'phone'].filter(f => !String(r[f] || '').trim());
        if (missing.length) push({ kind: 'incomplete_data', severity: 'low', registrationId: r.id, source: 'EventCompletedRegistration', evidence: `Faltan: ${missing.join(', ')}.` });
    }

    for (const r of registrations) {
        if (!activeOf(r)) continue;
        const total = Number(r.totalAmount || 0);
        if (SETTLED.includes(r.status) && total > 0 && !r.paidAt && !r.stripePaymentIntentId && !r.receiptUrl) {
            push({ kind: 'payment_state_mismatch', severity: 'high', registrationId: r.id, source: 'EventRegistration', evidence: `Figura «${r.status}» por ${total} ${r.currency || ''} sin fecha de pago, pago de Stripe ni comprobante.` });
        }
        if (r.status === 'pending_payment' && r.createdAt && now - new Date(r.createdAt) > 5 * 86400_000) {
            push({ kind: 'stale_pending', severity: 'medium', registrationId: r.id, source: 'EventRegistration', evidence: `Pendiente de pago hace ${Math.floor((now - new Date(r.createdAt)) / 86400_000)} días.` });
        }
        const missing = ['firstName', 'lastName', 'phone'].filter(f => !String(r[f] || '').trim());
        if (missing.length) push({ kind: 'incomplete_data', severity: 'low', registrationId: r.id, source: 'EventRegistration', evidence: `Faltan: ${missing.join(', ')}.` });
    }

    const order = { high: 0, medium: 1, low: 2 };
    findings.sort((a, b) => order[a.severity] - order[b.severity]);
    const counts = findings.reduce((acc, f) => (acc[f.kind] = (acc[f.kind] || 0) + 1, acc), {});
    return { total: all.length, active: all.filter(activeOf).length, findings, counts };
}

export const REGISTRATION_FINDING_LABELS = {
    missing_receipt: 'Sin comprobante', possible_duplicate: 'Posible duplicado', payment_state_mismatch: 'Pago y estado no cuadran',
    stale_pending: 'Pendiente hace días', incomplete_data: 'Datos incompletos',
};

// ── Chequeos deterministas: POSTULACIONES (piloto W2) ──────────────────
export const SUBMISSION_REQUIREMENTS = [
    { key: 'projectName', label: 'Nombre del proyecto', test: (s) => String(s.projectName || '').trim().length >= 5 },
    { key: 'projectDescription', label: 'Descripción (mínimo 200 caracteres)', test: (s) => String(s.projectDescription || '').trim().length >= 200 },
    { key: 'focusArea', label: 'Área de interés de Rotary', test: (s) => Boolean(s.focusArea || s.focusAreaLabel) },
    { key: 'budgetUsd', label: 'Presupuesto en USD', test: (s) => Number(s.budgetUsd) > 0 },
    { key: 'clubName', label: 'Club', test: (s) => String(s.clubName || '').trim().length > 2 },
    { key: 'district', label: 'Distrito', test: (s) => String(s.district || '').trim().length > 0 },
    { key: 'contact', label: 'Contacto (correo y teléfono)', test: (s) => /@/.test(String(s.email || '')) && digits(s.phone).length >= 7 },
];

export function reviewSubmission(s = {}) {
    const met = []; const missing = []; const issues = [];
    for (const r of SUBMISSION_REQUIREMENTS) (r.test(s) ? met : missing).push({ key: r.key, label: r.label });
    const budget = Number(s.budgetUsd);
    if (budget > 0 && budget < 500) issues.push({ field: 'budgetUsd', evidence: `Presupuesto muy bajo para un proyecto (${budget} USD): confirmar la cifra.` });
    if (budget > 2_000_000) issues.push({ field: 'budgetUsd', evidence: `Presupuesto inusualmente alto (${budget} USD): confirmar la cifra.` });
    const desc = String(s.projectDescription || '');
    if (desc && /lorem ipsum|prueba|test/i.test(desc) && desc.length < 400) issues.push({ field: 'projectDescription', evidence: 'La descripción parece de prueba.' });
    if (s.status && !['paid', 'confirmed', 'covered'].includes(s.status)) issues.push({ field: 'status', evidence: `Pago de la inscripción: «${s.status}» (informativo; postular no exige pagar).` });
    return { submissionId: s.id || null, ref: s.publicRef || null, met, missing, issues, complete: missing.length === 0 };
}

// ── Revisión de tono (piloto W4) ───────────────────────────────────────
// Frases que un borrador de un club NO puede afirmar sin respaldo: hablar en
// nombre de Rotary International o prometer lo que no consta.
const RISKY = [
    { re: /rotary international (anuncia|informa|declara|confirma)/i, why: 'Habla en nombre de Rotary International.' },
    { re: /\b(garantizamos|garantizado|100\s?%)\b/i, why: 'Promete un resultado sin respaldo.' },
    { re: /\b(oficialmente aprobado|aprobado por la fundaci[oó]n rotaria)\b/i, why: 'Afirma una aprobación institucional.' },
];
export function toneReview(text) {
    const t = String(text || '');
    const flags = RISKY.filter(r => r.re.test(t)).map(r => r.why);
    if (t.length > 0 && t.length < 120) flags.push('Muy corto para una noticia.');
    return { ok: flags.length === 0, flags };
}

// ── Workflows (definidos en código; el constructor visual los mostrará) ─
export const WORKFLOWS = {
    event_registration_review: {
        key: 'event_registration_review', label: 'Revisión asistida de inscripciones a eventos', team: 'eventos', pilot: true,
        triggers: ['manual', 'schedule', 'event@event_registration.completed', 'event@event_registration.created'],
        steps: ['Reunir inscripciones del evento (N0)', 'Chequeos deterministas: comprobantes, duplicados, pagos, datos', 'Resumen y borradores de recordatorio con IA (N1, opcional)', 'Informe para el Equipo de Registro', 'Decisión humana en la ficha de cada inscripción'],
        never: ['Confirmar pagos', 'Fusionar o eliminar inscripciones'],
        inputs: { eventId: 'opcional: sin él, los eventos con inscripciones del sitio' },
    },
    fair_submission_review: {
        key: 'fair_submission_review', label: 'Revisión de postulaciones de la Feria', team: 'proyectos', pilot: true,
        triggers: ['manual', 'schedule', 'event@fair_submission.created'],
        steps: ['Reunir postulaciones del sitio (N0)', 'Requisitos e inconsistencias por postulación', 'Resumen para el comité con IA (N1, opcional)', 'Informe con la fuente de cada observación', 'El comité decide'],
        never: ['Aprobar, rechazar o puntuar proyectos', 'Cambiar estados o valores'],
        inputs: { submissionId: 'opcional: sin él, todas las del sitio' },
    },
    institutional_comms: {
        key: 'institutional_comms', label: 'Comunicaciones institucionales', team: 'comunicaciones', pilot: true,
        triggers: ['manual', 'event@content_submission.received'],
        steps: ['Contexto autorizado del sitio (N0)', 'Borradores: noticia, redes, WhatsApp y correo (IA)', 'Revisión de tono e identidad', 'Noticia como BORRADOR (N1)', 'Publicar: aprobación humana (N3)'],
        never: ['Publicar o enviar sin aprobación', 'Hablar en nombre de Rotary International'],
        inputs: { brief: 'qué se quiere comunicar', audience: 'opcional' },
    },
};
export const WORKFLOW_KEYS = Object.keys(WORKFLOWS);

/** Plantillas por defecto de los pilotos (se crean como borrador en el registro). */
export const PILOT_TEMPLATES = [
    {
        key: 'pilot-validacion-inscripciones', team: 'eventos', level: 'site', allowedSiteTypes: ['Evento o Convención', 'district', 'club', 'Feria de Proyectos'],
        name: 'Validación de inscripciones', role: 'Revisa inscripciones a eventos y prepara observaciones para el Equipo de Registro',
        tools: [['site_context', 'read'], ['events_list', 'read'], ['events_registration_review', 'read']],
        prompt: 'Eres el agente de Validación de inscripciones de un sitio rotario. Recibes hallazgos YA calculados sobre las inscripciones de un evento (sin comprobante, posibles duplicados, pagos que no cuadran, datos incompletos). Tu trabajo: resumirlos en español claro para el Equipo de Registro, ordenados por urgencia, y redactar borradores breves y cordiales de recordatorio para quienes deben enviar su comprobante. Cita siempre el código o id de cada inscripción. Nunca confirmas pagos, ni fusionas o eliminas registros: eso lo decide una persona en la ficha de la inscripción.',
    },
    {
        key: 'pilot-evaluacion-postulaciones', team: 'proyectos', level: 'site', allowedSiteTypes: ['Feria de Proyectos', 'district'],
        name: 'Evaluación de postulaciones', role: 'Revisa postulaciones de proyectos y prepara observaciones para el comité',
        tools: [['site_context', 'read'], ['fair_submissions_list', 'read'], ['fair_submission_review', 'read']],
        prompt: 'Eres el agente de Evaluación de postulaciones de la Feria de Proyectos. Recibes, por cada postulación, los requisitos cumplidos y faltantes y las inconsistencias detectadas. Escribe para el comité un resumen breve por postulación: qué está completo, qué falta y qué conviene preguntarle al club, citando el campo de donde sale cada observación. No apruebas, no rechazas y no puntúas proyectos: el comité decide.',
    },
    {
        key: 'pilot-comunicaciones', team: 'comunicaciones', level: 'site', allowedSiteTypes: [],
        name: 'Comunicaciones institucionales', role: 'Redacta borradores de noticias, redes, WhatsApp y correo con el tono del sitio',
        tools: [['site_context', 'read'], ['content_recent', 'read'], ['content_create_news_draft', 'draft'], ['content_publish_news', 'act_with_approval']],
        prompt: 'Eres el agente de Comunicaciones institucionales de un sitio rotario. A partir de un pedido y del contexto autorizado del sitio, redactas en español: una noticia (título y cuerpo), un texto para redes sociales, un mensaje corto de WhatsApp y un correo. Tono cercano e institucional, datos concretos sólo si están en el contexto, sin inventar cifras. Nunca hablas en nombre de Rotary International ni prometes resultados. La noticia queda como borrador; publicarla requiere aprobación humana.',
    },
];
