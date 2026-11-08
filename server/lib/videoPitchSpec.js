// ════════════════════════════════════════════════════════════════════
// Video Pitch Profesional — el CRITERIO, puro (v4.1293.0)
// Feria de Proyectos Rotary Colombia
//
// Todo lo que decide el módulo y que no necesita base ni red vive acá, para
// que `npm run test:video-pitch` lo pruebe sin levantar nada:
//
//   · Los ESTADOS de una solicitud y qué transiciones existen, y quién las
//     puede hacer (el club o el comité).
//   · El FORMULARIO del participante: cuatro bloques, qué se precarga, qué es
//     obligatorio para ENVIAR y cómo se mide el avance.
//   · Los ARCHIVOS: formatos admitidos por su tipo REAL (bytes), topes y las
//     advertencias de calidad (vertical, baja resolución) que NUNCA rechazan.
//   · La ESTRUCTURA DEL GUION: cinco escenas con su duración objetivo, y la
//     validación de lo que devuelve el modelo.
//   · Las NOTIFICACIONES: qué cambio de estado avisa al participante.
//
// Nada de esto escribe en ningún sitio. Las decisiones que necesitan la base
// están en `videoPitchController.js`.
// ════════════════════════════════════════════════════════════════════

// ── Estados ──────────────────────────────────────────────────────────
// `not_requested` es VIRTUAL: la tarjeta lo muestra cuando no hay fila. Los
// demás viven en `VideoPitchRequest.status`.
export const STATUSES = [
    { key: 'not_requested',           label: 'No solicitado',                  tone: 'slate',   stage: 0, terminal: false },
    { key: 'draft',                   label: 'Borrador',                       tone: 'amber',   stage: 1, terminal: false },
    { key: 'submitted',               label: 'Solicitud enviada',              tone: 'blue',    stage: 2, terminal: false },
    { key: 'in_review',               label: 'En revisión',                    tone: 'indigo',  stage: 3, terminal: false },
    { key: 'info_required',           label: 'Información adicional requerida', tone: 'orange', stage: 3, terminal: false },
    { key: 'script_in_progress',      label: 'Guion en preparación',           tone: 'violet',  stage: 4, terminal: false },
    { key: 'script_pending_approval', label: 'Guion pendiente de aprobación',  tone: 'amber',   stage: 5, terminal: false },
    { key: 'script_approved',         label: 'Guion aprobado',                 tone: 'emerald', stage: 6, terminal: false },
    { key: 'in_production',           label: 'En producción',                  tone: 'blue',    stage: 7, terminal: false },
    { key: 'video_in_review',         label: 'Video en revisión',              tone: 'indigo',  stage: 8, terminal: false },
    { key: 'finished',                label: 'Finalizado',                     tone: 'emerald', stage: 9, terminal: false },
    { key: 'delivered',               label: 'Entregado',                      tone: 'emerald', stage: 10, terminal: true },
    { key: 'cancelled',               label: 'Cancelado',                      tone: 'slate',   stage: 0, terminal: true },
];
export const STATUS_KEYS = STATUSES.map(s => s.key);
export const STORED_STATUS_KEYS = STATUS_KEYS.filter(k => k !== 'not_requested');
export const statusMeta = (key) => STATUSES.find(s => s.key === key) || STATUSES[0];
export const isStatus = (key) => STORED_STATUS_KEYS.includes(key);

// Transiciones del COMITÉ (quién produce). Una transición ausente no existe:
// el servidor contesta 409 y dice cuáles sí.
export const ADMIN_TRANSITIONS = {
    submitted:               ['in_review', 'info_required', 'cancelled'],
    in_review:               ['info_required', 'script_in_progress', 'cancelled'],
    info_required:           ['in_review', 'cancelled'],
    script_in_progress:      ['script_pending_approval', 'script_approved', 'info_required', 'cancelled'],
    script_pending_approval: ['script_approved', 'script_in_progress', 'cancelled'],
    script_approved:         ['in_production', 'script_in_progress'],
    in_production:           ['video_in_review', 'finished', 'script_in_progress'],
    video_in_review:         ['in_production', 'finished'],
    finished:                ['delivered', 'in_production'],
    delivered:               ['in_production'],
    cancelled:               ['submitted'],
    draft:                   ['cancelled'],
};

// Transiciones del PARTICIPANTE: enviar, responder a un pedido de información
// y decidir sobre el guion. Nada más.
export const PARTICIPANT_TRANSITIONS = {
    draft:                   ['submitted'],
    info_required:           ['submitted'],
    script_pending_approval: ['script_approved', 'script_in_progress'],
};

export const canTransition = (from, to, { actor = 'admin' } = {}) => {
    const table = actor === 'participant' ? PARTICIPANT_TRANSITIONS : ADMIN_TRANSITIONS;
    return Array.isArray(table[from]) && table[from].includes(to);
};

/** Estados en los que el club todavía puede EDITAR la solicitud. */
export const EDITABLE_STATUSES = ['draft', 'info_required'];
export const participantCanEdit = (status) => EDITABLE_STATUSES.includes(status);

/** Estados «seguros» para cambiar en bloque desde la bandeja. */
export const BULK_STATUS_PAIRS = [
    ['submitted', 'in_review'],
    ['in_review', 'script_in_progress'],
    ['finished', 'delivered'],
];
export const bulkStatusAllowed = (from, to) => BULK_STATUS_PAIRS.some(([a, b]) => a === from && b === to);

/** Qué requiere cada estado destino para poder entrar. */
export const transitionRequirements = (to, { hasApprovedScript = false, hasDeliverable = false } = {}) => {
    if (to === 'in_production' && !hasApprovedScript) return 'Para entrar en producción hace falta un guion aprobado.';
    if (to === 'delivered' && !hasDeliverable) return 'Para entregar hace falta subir el video final.';
    return null;
};

// ── Indicadores de la bandeja ────────────────────────────────────────
export const KPI_GROUPS = {
    total:            { label: 'Total de solicitudes', statuses: STORED_STATUS_KEYS.filter(k => k !== 'draft') },
    new:              { label: 'Nuevas',               statuses: ['submitted'] },
    pending_info:     { label: 'Pendientes de información', statuses: ['info_required'] },
    pending_script:   { label: 'Pendientes de guion',  statuses: ['in_review', 'script_in_progress', 'script_pending_approval'] },
    in_production:    { label: 'En producción',        statuses: ['script_approved', 'in_production', 'video_in_review'] },
    finished:         { label: 'Finalizadas',          statuses: ['finished'] },
    delivered:        { label: 'Entregadas',           statuses: ['delivered'] },
};
export const summarizeRequests = (rows) => {
    const out = {};
    for (const [k, g] of Object.entries(KPI_GROUPS)) out[k] = rows.filter(r => g.statuses.includes(r.status)).length;
    out.cancelled = rows.filter(r => r.status === 'cancelled').length;
    out.drafts = rows.filter(r => r.status === 'draft').length;
    return out;
};

// ── Formulario ───────────────────────────────────────────────────────
export const LANGUAGES = [
    { key: 'es',        label: 'Español' },
    { key: 'en',        label: 'Inglés' },
    { key: 'es_sub_en', label: 'Español con subtítulos en inglés' },
    { key: 'en_sub_es', label: 'Inglés con subtítulos en español' },
];
export const OBJECTIVES = [
    { key: 'funding',             label: 'Conseguir financiación' },
    { key: 'international_allies', label: 'Buscar aliados internacionales' },
    { key: 'fair',                label: 'Presentar el proyecto en la Feria' },
    { key: 'technical_support',   label: 'Conseguir apoyo técnico o institucional' },
    { key: 'other',               label: 'Otro' },
];
export const TONES = [
    { key: 'inspiring',     label: 'Inspirador y humano' },
    { key: 'institutional', label: 'Institucional y sobrio' },
    { key: 'urgent',        label: 'Urgente, centrado en la necesidad' },
    { key: 'hopeful',       label: 'Esperanzador, centrado en la solución' },
];
export const languageLabel = (k) => LANGUAGES.find(l => l.key === k)?.label || '';
export const objectiveLabel = (k) => OBJECTIVES.find(o => o.key === k)?.label || '';

/**
 * Los temas del CONTEXTO del proyecto: lo que el sistema YA sabe por la
 * postulación y la Formulación, y le muestra al club en sólo lectura antes de
 * pedirle información adicional (v4.1295). Hasta v4.1294 eran «preguntas
 * guiadas» que el club tenía que volver a responder; el comité pidió que el
 * bloque B fuera UN solo campo, porque esa información ya está sincronizada
 * con el proyecto. `source` es de dónde sale cada tema. Las respuestas
 * guiadas que un borrador anterior haya guardado se conservan y el expediente
 * de la IA las sigue leyendo (`LEGACY_STORY_KEYS`).
 */
export const CONTEXT_TOPICS = [
    { key: 'description',   label: 'Descripción del proyecto',                      source: 'postulación / objetivos.projectDescription' },
    { key: 'problem',       label: '¿Cuál es el problema más importante que quieren resolver?', source: 'necesidades.needs' },
    { key: 'location',      label: '¿Dónde se desarrollará el proyecto?',                      source: 'identificacion.city' },
    { key: 'beneficiaries', label: '¿Cuántas personas se beneficiarán?',                        source: 'necesidades.beneficiariesCount' },
    { key: 'solution',      label: '¿Qué solución propone el club?',                            source: 'necesidades.needsResponse' },
    { key: 'results',       label: '¿Qué resultados esperan conseguir?',                        source: 'objetivos.generalObjective' },
    { key: 'resources',     label: '¿Qué recursos o financiación necesitan?',                   source: 'presupuesto.budgetTable' },
    { key: 'support',       label: '¿Qué tipo de apoyo buscan de aliados internacionales?',     source: null },
    { key: 'sustainability', label: 'Sostenibilidad',                                          source: 'sostenibilidad.sustainability' },
    { key: 'communityRole', label: 'Participación de la comunidad',                            source: 'sostenibilidad.communityRole' },
];
/** Compatibilidad: claves de las preguntas guiadas de v4.1293–v4.1294. */
export const LEGACY_STORY_KEYS = ['problem', 'location', 'beneficiaries', 'solution', 'results', 'resources', 'support'];
/** @deprecated desde v4.1295: el bloque B es un solo campo. Se mantiene para el expediente de la IA. */
export const GUIDED_QUESTIONS = CONTEXT_TOPICS.filter(t => LEGACY_STORY_KEYS.includes(t.key));

/** La información adicional es OPCIONAL: el guion se nutre de la postulación y la Formulación. */
export const DESCRIPTION_MIN = 0;
export const DESCRIPTION_MAX = 6000;
export const TEXT_MAX = 2500;

const str = (v, max = TEXT_MAX) => String(v ?? '').trim().slice(0, max);
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
const isPhone = (v) => String(v || '').replace(/[^\d]/g, '').length >= 7;

/** Lo que se guarda, normalizado: nada que no esté previsto entra. */
export const normalizeAnswers = (input = {}) => {
    const a = input || {};
    const id = a.identification || {};
    const st = a.story || {};
    const pr = a.preferences || {};
    const co = a.consent || {};
    const story = { description: str(st.description, DESCRIPTION_MAX) };
    // Respuestas guiadas de borradores anteriores: se conservan si existen, nunca se piden.
    for (const k of LEGACY_STORY_KEYS) { const v = str(st[k]); if (v) story[k] = v; }
    return {
        identification: {
            responsibleName: str(id.responsibleName, 160),
            email: str(id.email, 200).toLowerCase(),
            whatsapp: str(id.whatsapp, 60),
        },
        story,
        preferences: {
            language: LANGUAGES.some(l => l.key === pr.language) ? pr.language : '',
            objective: OBJECTIVES.some(o => o.key === pr.objective) ? pr.objective : '',
            objectiveOther: str(pr.objectiveOther, 300),
            notes: str(pr.notes, 2000),
        },
        consent: { mediaAuthorization: co.mediaAuthorization === true },
    };
};

/** Los datos que SIEMPRE salen de la postulación: el club no los edita acá. */
export const lockedIdentity = (submission) => ({
    district: submission?.district || '',
    clubName: submission?.clubName || '',
    projectName: submission?.projectName || '',
    publicRef: submission?.publicRef || '',
    submissionId: submission?.id || null,
});

/**
 * Precarga del bloque A y sugerencias del bloque B. Las sugerencias salen de
 * la postulación y de la Formulación (`ProjectFairMasterForm.answers`), y se
 * ofrecen como texto IMPORTABLE: nunca pisan lo que el club ya escribió.
 */
export const prefillFrom = ({ submission, masterAnswers = null }) => {
    const m = masterAnswers || {};
    const get = (path) => {
        const [s, f] = String(path || '').split('.');
        const v = m?.[s]?.[f];
        return v === undefined || v === null ? '' : v;
    };
    const budget = get('presupuesto.budgetTable');
    const cost = budget && typeof budget === 'object' ? budget.projectCost || budget.rows?.projectCost : null;
    const costText = (() => {
        if (!cost || typeof cost !== 'object') return '';
        const parts = [];
        if (cost.pesos) parts.push(`Costo del proyecto: ${cost.pesos} COP`);
        if (cost.usd) parts.push(`${cost.usd} USD`);
        return parts.join(' · ');
    })();
    const beneficiariesText = [get('necesidades.beneficiaries'), get('necesidades.beneficiariesCount')]
        .map(v => String(v || '').trim()).filter(Boolean).join('\n');
    const resourcesText = [costText, submission?.budgetUsd ? `Presupuesto declarado en la postulación: ${Number(submission.budgetUsd).toLocaleString('es-CO')} USD` : '']
        .filter(Boolean).join('\n');
    return {
        identification: {
            responsibleName: [submission?.firstName, submission?.lastName].filter(Boolean).join(' '),
            email: String(submission?.email || '').toLowerCase(),
            whatsapp: submission?.phone || '',
        },
        suggestions: {
            description: String(submission?.projectDescription || get('objetivos.projectDescription') || '').trim(),
            problem: String(get('necesidades.needs') || '').trim(),
            location: [get('identificacion.city'), submission?.district].map(v => String(v || '').trim()).filter(Boolean).join(' · '),
            beneficiaries: beneficiariesText,
            solution: String(get('necesidades.needsResponse') || '').trim(),
            results: String(get('objetivos.generalObjective') || '').trim(),
            resources: resourcesText,
            support: '',
            sustainability: String(get('sostenibilidad.sustainability') || '').trim(),
            communityRole: String(get('sostenibilidad.communityRole') || '').trim(),
            focusArea: submission?.focusAreaLabel || '',
        },
    };
};

/**
 * El CONTEXTO del proyecto tal como se le muestra al club (v4.1295): los temas
 * con valor, en el orden de `CONTEXT_TOPICS`, y si la Formulación ya aporta
 * algo. Es lo mismo que lee la IA; por eso se muestra: para que el club agregue
 * sólo lo que falte.
 */
export const projectContextOf = ({ submission, masterAnswers = null }) => {
    const { suggestions } = prefillFrom({ submission, masterAnswers });
    const items = CONTEXT_TOPICS
        .map(t => ({ key: t.key, label: t.label, value: String(suggestions[t.key] || '').trim() }))
        .filter(t => t.value);
    const hasFormulation = Boolean(masterAnswers && Object.values(masterAnswers).some(sec => sec && typeof sec === 'object' && Object.values(sec).some(v => String(v ?? '').trim())));
    return { items, hasFormulation, hasProjectContext: items.length > 0 };
};

/** Avance del formulario, en %: lo obligatorio pesa más que lo opcional. */
export const completionOf = (answers, { fileCount = 0 } = {}) => {
    const a = normalizeAnswers(answers);
    const checks = [
        [3, Boolean(a.identification.responsibleName)],
        [3, isEmail(a.identification.email)],
        [3, isPhone(a.identification.whatsapp)],
        // La información adicional es opcional: pesa poco y no bloquea.
        [6, a.story.description.length > 0],
        [16, Boolean(a.preferences.language)],
        [16, Boolean(a.preferences.objective)],
        [20, fileCount > 0],
        [20, a.consent.mediaAuthorization],
    ];
    const total = checks.reduce((s, [w]) => s + w, 0);
    const done = checks.reduce((s, [w, ok]) => s + (ok ? w : 0), 0);
    return Math.round((done / total) * 100);
};

/**
 * Lo que impide ENVIAR. Vacío = se puede enviar. `hasProjectContext` dice si
 * la postulación o la Formulación ya cuentan el proyecto: si no, y el club
 * tampoco escribió nada, se ADVIERTE (no se bloquea: el comité puede pedirlo).
 */
export const validateForSubmit = (answers, { fileCount = 0, hasProjectContext = true } = {}) => {
    const a = normalizeAnswers(answers);
    const errors = [];
    if (!a.identification.responsibleName) errors.push({ field: 'identification.responsibleName', message: 'Indica quién es la persona responsable de la solicitud.' });
    if (!isEmail(a.identification.email)) errors.push({ field: 'identification.email', message: 'Escribe un correo electrónico válido.' });
    if (!isPhone(a.identification.whatsapp)) errors.push({ field: 'identification.whatsapp', message: 'Escribe un número de WhatsApp de contacto.' });
    if (!a.preferences.language) errors.push({ field: 'preferences.language', message: 'Elige el idioma de la narración.' });
    if (!a.preferences.objective) errors.push({ field: 'preferences.objective', message: 'Elige el objetivo principal del video.' });
    if (a.preferences.objective === 'other' && !a.preferences.objectiveOther) errors.push({ field: 'preferences.objectiveOther', message: 'Describe el objetivo del video.' });
    if (!a.consent.mediaAuthorization) errors.push({ field: 'consent.mediaAuthorization', message: 'Confirma que el club cuenta con autorización para usar los materiales.' });
    // Los materiales no bloquean el envío: el comité puede pedirlos después.
    // Pero se advierte, porque sin ellos no hay video.
    const warnings = fileCount === 0 ? ['No adjuntaste fotografías ni videos. El comité te los pedirá para producir el video.'] : [];
    if (!hasProjectContext && !a.story.description) warnings.push('Tu Formulación del proyecto está vacía y no agregaste información: el guion no tendrá con qué contar el proyecto. Completa la Formulación o escribe aquí lo esencial.');
    return { ok: errors.length === 0, errors, warnings };
};

// ── Archivos ─────────────────────────────────────────────────────────
export const FILE_KINDS = {
    image:    { label: 'Fotografía', extensions: ['jpg', 'jpeg', 'png'], mimes: { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' }, maxMb: 25 },
    video:    { label: 'Video',      extensions: ['mp4', 'mov'],         mimes: { mp4: 'video/mp4', mov: 'video/quicktime' },         maxMb: 500 },
    document: { label: 'Documento',  extensions: ['pdf'],                mimes: { pdf: 'application/pdf' },                           maxMb: 20 },
};
export const FILE_ROLES = ['material', 'deliverable', 'thumbnail'];
export const MAX_FILES_PER_REQUEST = 25;
export const ACCEPTED_EXTENSIONS = Object.values(FILE_KINDS).flatMap(k => k.extensions.map(e => `.${e}`));

export const extensionOf = (filename) => String(filename || '').toLowerCase().split('.').pop() || '';
export const kindOfExtension = (ext) => Object.keys(FILE_KINDS).find(k => FILE_KINDS[k].extensions.includes(ext)) || null;
export const maxMbFor = (kind, env = process.env) => {
    const override = Number(env[`VIDEO_PITCH_MAX_${String(kind).toUpperCase()}_MB`]);
    return override > 0 ? override : (FILE_KINDS[kind]?.maxMb || 25);
};

/** Comprobación PREVIA (nombre y peso declarados), antes de prefirmar. */
export const checkUploadMeta = ({ filename, size, role = 'material', env = process.env }) => {
    const ext = extensionOf(filename);
    const kind = kindOfExtension(ext);
    const errores = [];
    if (!kind) errores.push(`Formato no admitido. Acepta ${ACCEPTED_EXTENSIONS.join(', ')}.`);
    if (role === 'deliverable' && kind !== 'video') errores.push('El video final debe ser un MP4 o MOV.');
    if (role === 'thumbnail' && kind !== 'image') errores.push('La miniatura debe ser JPG o PNG.');
    const bytes = Number(size) || 0;
    if (bytes <= 0) errores.push('El archivo está vacío.');
    if (kind && bytes > maxMbFor(kind, env) * 1024 * 1024) errores.push(`${FILE_KINDS[kind].label}: supera el tope de ${maxMbFor(kind, env)} MB.`);
    return { ok: errores.length === 0, errores, kind, ext, contentType: kind ? FILE_KINDS[kind].mimes[ext] : null };
};

/** El tipo REAL por los bytes: lo que el navegador declara no vale. */
export const sniffKind = (head) => {
    const b = Buffer.isBuffer(head) ? head : Buffer.from(head || []);
    if (b.length < 8) return null;
    if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return { kind: 'image', ext: 'jpg' };
    if (b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') return { kind: 'image', ext: 'png' };
    if (b.toString('ascii', 0, 5) === '%PDF-') return { kind: 'document', ext: 'pdf' };
    const atom = b.toString('ascii', 4, 8);
    if (atom === 'ftyp') {
        const brand = b.toString('ascii', 8, 12).toLowerCase();
        return { kind: 'video', ext: brand.startsWith('qt') ? 'mov' : 'mp4' };
    }
    if (['moov', 'mdat', 'wide', 'free', 'skip', 'pnot'].includes(atom)) return { kind: 'video', ext: 'mov' };
    return null;
};

/** El juicio del archivo YA subido: peso de S3 y tipo por su contenido. */
export const judgeUploadedFile = ({ filename, bytes, head, role = 'material', env = process.env }) => {
    const meta = checkUploadMeta({ filename, size: bytes, role, env });
    if (!meta.ok) return { ok: false, error: meta.errores.join(' ') };
    const real = sniffKind(head);
    if (!real) return { ok: false, error: 'El contenido del archivo no corresponde a ningún formato admitido (JPG, PNG, MP4, MOV o PDF).' };
    if (real.kind !== meta.kind) return { ok: false, error: `El archivo dice ser ${FILE_KINDS[meta.kind].label.toLowerCase()} pero su contenido es ${FILE_KINDS[real.kind].label.toLowerCase()}.` };
    return { ok: true, kind: meta.kind, ext: meta.ext, contentType: meta.contentType };
};

/**
 * Advertencias de calidad. Las dimensiones las DECLARA el navegador (sólo él
 * las puede leer sin bajar el archivo entero): se guardan como declaradas y
 * las advertencias nunca rechazan, sólo avisan.
 */
export const qualityWarnings = ({ kind, width, height, durationSec }) => {
    const w = Number(width) || 0, h = Number(height) || 0;
    const out = [];
    if (kind === 'document') return out;
    if (w && h) {
        if (h > w) out.push('Es vertical: en un video horizontal 16:9 quedará con bandas o recortada.');
        else if (Math.abs(w / h - 16 / 9) > 0.15) out.push('No es 16:9: puede necesitar recorte para el formato del video.');
        const shortSide = Math.min(w, h);
        if (kind === 'image' && shortSide < 1080) out.push(`Resolución baja (${w}×${h}): se recomienda 1920×1080 o superior.`);
        if (kind === 'video' && shortSide < 720) out.push(`Resolución baja (${w}×${h}): se recomienda Full HD (1920×1080).`);
    }
    if (kind === 'video' && Number(durationSec) > 0 && Number(durationSec) < 3) out.push('Es un clip muy corto (menos de 3 segundos).');
    return out;
};

export const fmtBytes = (n) => {
    const b = Number(n) || 0;
    if (b >= 1024 * 1024 * 1024) return `${(b / (1024 * 1024 * 1024)).toFixed(1).replace('.', ',')} GB`;
    if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
    if (b >= 1024) return `${Math.round(b / 1024)} KB`;
    return `${b} B`;
};

export const MATERIAL_TIPS = {
    photos: [
        'Preferiblemente horizontales, relación 16:9.',
        'Resolución recomendada 1920 × 1080 píxeles o superior.',
        'Nítidas, bien iluminadas y originales del club.',
        'De la comunidad, las necesidades identificadas, actividades y beneficiarios (con autorización).',
    ],
    videos: [
        'Preferiblemente horizontales, relación 16:9, en Full HD.',
        'Grabaciones estables y bien iluminadas.',
        'Evita videos borrosos, muy comprimidos o con marcas de agua.',
        'Conserva el audio original cuando aporte contexto.',
    ],
};

// ── Guion ────────────────────────────────────────────────────────────
export const TARGET_SECONDS_DEFAULT = 150;
export const TARGET_SECONDS_MAX = 180;
export const TARGET_SECONDS_MIN = 60;
export const clampTargetSeconds = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return TARGET_SECONDS_DEFAULT;
    return Math.max(TARGET_SECONDS_MIN, Math.min(TARGET_SECONDS_MAX, Math.round(n)));
};

/** Las cinco escenas y su reparto proporcional del tiempo (suma 1). */
export const SCENE_PLAN = [
    { number: 1, key: 'hook',     title: 'Gancho emocional',    share: 0.17, goal: 'Mostrar una necesidad real de la comunidad y captar la atención con una pregunta, una situación humana o un dato verificado.' },
    { number: 2, key: 'problem',  title: 'Contexto y problema', share: 0.23, goal: 'Comunidad beneficiaria, situación actual, necesidad identificada y consecuencias de no intervenir.' },
    { number: 3, key: 'solution', title: 'Solución propuesta',  share: 0.27, goal: 'El proyecto, cómo se implementa y el papel del club rotario.' },
    { number: 4, key: 'impact',   title: 'Impacto esperado',    share: 0.17, goal: 'Beneficios previstos e indicadores disponibles, distinguiendo lo esperado de lo ya logrado.' },
    { number: 5, key: 'cta',      title: 'Llamado a la acción', share: 0.16, goal: 'Qué apoyo se necesita, cómo colaborar, por qué importa y cómo establecer contacto.' },
];
export const sceneDurations = (targetSeconds = TARGET_SECONDS_DEFAULT) => {
    const t = clampTargetSeconds(targetSeconds);
    const raw = SCENE_PLAN.map(s => Math.round(s.share * t));
    const diff = t - raw.reduce((a, b) => a + b, 0);
    raw[2] += diff; // la escena de la solución absorbe el redondeo
    return raw;
};

/** Normaliza y valida lo que devolvió el modelo (o lo que editó una persona). */
export const normalizeScript = (input, { targetSeconds = TARGET_SECONDS_DEFAULT, fileIds = [] } = {}) => {
    const src = input && typeof input === 'object' ? input : {};
    const scenesIn = Array.isArray(src.scenes) ? src.scenes : [];
    const durations = sceneDurations(targetSeconds);
    const known = new Set((fileIds || []).map(String));
    const scenes = SCENE_PLAN.map((plan, i) => {
        const s = scenesIn.find(x => Number(x?.number) === plan.number) || scenesIn[i] || {};
        const mats = (Array.isArray(s.materials) ? s.materials : []).map(String).filter(id => known.has(id));
        return {
            number: plan.number,
            key: plan.key,
            title: str(s.title, 120) || plan.title,
            durationSec: Number(s.durationSec) > 0 ? Math.round(Number(s.durationSec)) : durations[i],
            narration: str(s.narration, 2500),
            visual: str(s.visual, 1200),
            materials: mats,
            onScreenText: str(s.onScreenText, 300),
            notes: str(s.notes, 1200),
        };
    });
    const missingInfo = (Array.isArray(src.missingInfo) ? src.missingInfo : []).map(v => str(v, 300)).filter(Boolean).slice(0, 12);
    const totalSeconds = scenes.reduce((a, s) => a + s.durationSec, 0);
    const problems = [];
    scenes.forEach(s => { if (!s.narration) problems.push(`La escena ${s.number} no tiene narración.`); });
    if (totalSeconds > TARGET_SECONDS_MAX + 15) problems.push(`El guion suma ${totalSeconds} s y el máximo es ${TARGET_SECONDS_MAX} s.`);
    return {
        ok: problems.length === 0,
        problems,
        script: {
            title: str(src.title, 160),
            summary: str(src.summary, 800),
            scenes,
            missingInfo,
            totalSeconds,
            targetSeconds: clampTargetSeconds(targetSeconds),
        },
    };
};

/** Palabras por minuto de una locución tranquila: para estimar si el texto cabe. */
export const WORDS_PER_MINUTE = 140;
export const narrationFits = (narration, durationSec) => {
    const words = String(narration || '').trim().split(/\s+/).filter(Boolean).length;
    const maxWords = Math.ceil((durationSec / 60) * WORDS_PER_MINUTE * 1.15);
    return { words, maxWords, fits: words <= maxWords };
};

// ── Notificaciones ───────────────────────────────────────────────────
// Un cambio de estado avisa al participante UNA vez: la clave de deduplicación
// es (solicitud, tipo, evento que lo causó).
export const PARTICIPANT_NOTIFICATIONS = {
    submitted:               { kind: 'received',        subject: 'Recibimos tu solicitud de Video Pitch' },
    info_required:           { kind: 'info_required',   subject: 'Necesitamos información adicional para tu Video Pitch' },
    script_pending_approval: { kind: 'script_ready',    subject: 'El guion de tu Video Pitch está listo para tu revisión' },
    script_approved:         { kind: 'script_approved', subject: 'El guion de tu Video Pitch fue aprobado' },
    in_production:           { kind: 'in_production',   subject: 'Tu Video Pitch entró en producción' },
    finished:                { kind: 'finished',        subject: 'Tu Video Pitch está finalizado' },
    delivered:               { kind: 'delivered',       subject: 'Tu Video Pitch está disponible' },
};
export const notificationFor = (status) => PARTICIPANT_NOTIFICATIONS[status] || null;

// ── Número de solicitud ──────────────────────────────────────────────
export const requestNumber = (year, seq) => `VP-${year}-${String(seq).padStart(4, '0')}`;

// ── Bandeja: filtros y CSV ───────────────────────────────────────────
export const LIST_SORTS = ['createdAt', 'updatedAt', 'submittedAt', 'status', 'projectName', 'clubName', 'district'];
export const normalizeSort = (v) => (LIST_SORTS.includes(v) ? v : 'updatedAt');

const csvCell = (v) => {
    const s = String(v ?? '').replace(/\r?\n/g, ' ');
    return /[;"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const requestsCsv = (rows) => {
    const head = ['Número', 'Proyecto', 'Club Rotario', 'Distrito', 'Responsable', 'Correo', 'WhatsApp', 'Estado', 'Materiales', 'Responsable de producción', 'Radicada', 'Actualizada'];
    const lines = rows.map(r => [
        r.number, r.projectName, r.clubName, r.district, r.responsibleName, r.email, r.whatsapp,
        statusMeta(r.status).label, r.materialCount, r.assigneeName || '', r.submittedAt || '', r.updatedAt || '',
    ].map(csvCell).join(';'));
    return `﻿${head.join(';')}\n${lines.join('\n')}`;
};

export default {
    STATUSES, STATUS_KEYS, STORED_STATUS_KEYS, statusMeta, isStatus, ADMIN_TRANSITIONS, PARTICIPANT_TRANSITIONS,
    canTransition, EDITABLE_STATUSES, participantCanEdit, BULK_STATUS_PAIRS, bulkStatusAllowed, transitionRequirements,
    KPI_GROUPS, summarizeRequests, LANGUAGES, OBJECTIVES, TONES, languageLabel, objectiveLabel, CONTEXT_TOPICS, LEGACY_STORY_KEYS, GUIDED_QUESTIONS,
    DESCRIPTION_MIN, normalizeAnswers, lockedIdentity, prefillFrom, projectContextOf, completionOf, validateForSubmit,
    FILE_KINDS, FILE_ROLES, MAX_FILES_PER_REQUEST, ACCEPTED_EXTENSIONS, extensionOf, kindOfExtension, maxMbFor,
    checkUploadMeta, sniffKind, judgeUploadedFile, qualityWarnings, fmtBytes, MATERIAL_TIPS,
    TARGET_SECONDS_DEFAULT, TARGET_SECONDS_MAX, TARGET_SECONDS_MIN, clampTargetSeconds, SCENE_PLAN, sceneDurations,
    normalizeScript, WORDS_PER_MINUTE, narrationFits, PARTICIPANT_NOTIFICATIONS, notificationFor, requestNumber,
    LIST_SORTS, normalizeSort, requestsCsv,
};
