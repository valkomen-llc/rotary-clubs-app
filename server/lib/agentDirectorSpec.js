// ═══════════════════════════════════════════════════════════════════════
// Dirección IA — Director de Inteligencia y Operaciones Rotarias: EL CRITERIO
// (v4.1329.0)
//
// PURO: sin base, sin red, sin IA. Decide:
//   · qué CAPACIDADES tiene el Director (cada una = pasos sobre workflows y
//     herramientas que YA existen en el runtime, nunca acceso libre);
//   · cómo se INTERPRETA un objetivo escrito por una persona (palabras clave
//     → capacidades; sin coincidencia, preguntas, nunca un plan inventado);
//   · cómo se arma el PLAN (objetivo, alcance, entregables, pasos, agentes,
//     equipos, fuentes, herramientas, dependencias, riesgos, costo estimado,
//     aprobaciones y bloqueos);
//   · los estados del plan y sus transiciones;
//   · cómo se CONSOLIDA el entregable a partir de los informes de los pasos.
//
// Regla de oro (la misma de todo el Command Center): el sitio sobre el que
// actúa el Director sale de la SESIÓN o del plan guardado, nunca del texto del
// objetivo ni de la respuesta de un modelo. El modelo, si interviene, sólo
// redacta la lectura del objetivo: no elige pasos, herramientas ni alcance.
// ═══════════════════════════════════════════════════════════════════════

export const DIRECTOR_KEY = 'rotary-intelligence-director';

export const DIRECTOR_TEMPLATE = {
    key: DIRECTOR_KEY,
    team: 'direccion',
    level: 'any',
    name: 'Director de Inteligencia y Operaciones Rotarias',
    role: 'Orquestador: interpreta objetivos, arma planes, coordina equipos especializados y entrega resultados para revisión humana',
    description: 'Agente principal de la Dirección IA. Trabaja dentro del ámbito de UNA organización (club, distrito, feria, evento o programa), con sus permisos y su conocimiento autorizado. No es un superusuario: propone, coordina y consolida; las decisiones las toman personas.',
    systemPrompt: [
        'Eres el Director de Inteligencia y Operaciones Rotarias de una organización que usa Club Platform.',
        'Tu trabajo es leer el objetivo de un administrador y explicarlo con claridad: qué se pide, para quién, con qué alcance y qué entregables tendría.',
        'Trabajas SOLO con el contexto autorizado de esta organización. No supones autoridad sobre otras organizaciones, distritos ni sobre Rotary International.',
        'No inventas políticas, cifras, nombres ni declaraciones. Si falta un dato, lo dices y lo conviertes en una pregunta.',
        'No apruebas ni rechazas proyectos, no confirmas pagos, no cambias estados oficiales ni envías comunicaciones: eso lo decide una persona.',
    ].join(' '),
    toolRequests: [
        { tool: 'site_context', mode: 'read' },
        { tool: 'knowledge_search', mode: 'read' },
        { tool: 'events_list', mode: 'read' },
        { tool: 'fair_submissions_list', mode: 'read' },
    ],
};

// ── Estados de un plan ─────────────────────────────────────────────────
export const PLAN_STATES = {
    draft: { label: 'Borrador', help: 'Guardado para seguir trabajando; nadie lo ha enviado a aprobación.' },
    pending_approval: { label: 'Pendiente de aprobación', help: 'Una persona con permiso sobre esta organización debe aprobarlo antes de ejecutar.' },
    changes_requested: { label: 'Cambios solicitados', help: 'Quien revisó pidió ajustes: se rehace el objetivo y se genera un plan nuevo.' },
    approved: { label: 'Aprobado · en cola', help: 'Aprobado: los pasos se ejecutan uno a uno (desde el panel o en el ciclo automático).' },
    running: { label: 'En ejecución', help: 'Un paso se está ejecutando.' },
    needs_attention: { label: 'Requiere intervención', help: 'Un paso falló o lo frenó un presupuesto; se puede reintentar.' },
    review: { label: 'En revisión', help: 'El entregable está listo y espera la revisión de una persona.' },
    completed: { label: 'Completado', help: 'Una persona revisó y cerró el entregable.' },
    cancelled: { label: 'Cancelado', help: 'Se canceló; queda el historial.' },
};
const PLAN_TRANSITIONS = {
    draft: ['pending_approval', 'cancelled'],
    pending_approval: ['approved', 'changes_requested', 'cancelled'],
    changes_requested: ['cancelled'],
    approved: ['running', 'needs_attention', 'review', 'cancelled'],
    running: ['approved', 'needs_attention', 'review', 'cancelled'],
    needs_attention: ['approved', 'cancelled'],
    review: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
};
export function canTransitionPlan(from, to) { return (PLAN_TRANSITIONS[from] || []).includes(to); }

export const STEP_STATES = {
    pending: 'Pendiente', running: 'Ejecutándose', done: 'Hecho', failed: 'Falló', handoff: 'Para una persona', skipped: 'Omitido',
};

export const LIMITS = { minObjective: 15, maxObjective: 4000, maxCapabilities: 3, stepLockSeconds: 150 };

// ── Capacidades ────────────────────────────────────────────────────────
// Cada paso es de tres clases:
//   · workflow — un workflow EXISTENTE del runtime (hallazgos deterministas,
//                la IA sólo redacta); deja su informe en AgentWorkflowRun;
//   · tool     — una herramienta N0 (lectura) del catálogo, con el sitio del plan;
//   · handoff  — trabajo que, por diseño, hace una persona en su módulo (con
//                su propio control de aprobación). El Director lo deja indicado
//                con su enlace; no lo ejecuta.
// `specialists` son palabras para buscar en el catálogo agentes del equipo que
// ya existan (The Agency): el Director PROPONE, no instala.
export const CAPABILITIES = [
    {
        key: 'fair_review', label: 'Analizar proyectos postulados',
        quick: 'Analiza todos los proyectos postulados a la feria, revisa la información diligenciada, identifica datos faltantes y prepara un resumen para el comité organizador.',
        keywords: [/postulaci|postulad|proyectos?\s+(de\s+la\s+)?feria|feria|comit[eé]\s+(evaluador|organizador)|formularios?\s+incomplet/i],
        weight: 3,
        teams: ['proyectos', 'analitica'],
        specialists: { proyectos: ['project', 'analyst', 'evaluat', 'report', 'document', 'research'], analitica: ['data', 'analytic', 'report'] },
        steps: [
            { kind: 'workflow', workflowKey: 'fair_submission_review', label: 'Revisar cada postulación: registro, Formulación y FDD; requisitos, campos vacíos e inconsistencias', team: 'proyectos', tools: ['fair_submissions_list', 'fair_submission_review'], risk: 'N0', ai: true },
        ],
        deliverables: ['Resumen por proyecto', 'Lista de pendientes por proyecto (campo por campo)', 'Informe consolidado para el comité', 'Recomendaciones administrativas'],
        never: ['Aprobar, rechazar o puntuar proyectos', 'Cambiar el estado de una postulación o su pago'],
        siteTypes: ['Feria de Proyectos', 'district'],
    },
    {
        key: 'fair_translation', label: 'Traducir proyectos al inglés',
        quick: 'Necesito traducir los proyectos postulados al inglés para preparar las libretas y documentos de la feria.',
        keywords: [/traduc|ingl[eé]s|english|biling[uü]e|libreta/i],
        weight: 3,
        teams: ['comunicaciones', 'proyectos'],
        specialists: { comunicaciones: ['translat', 'language', 'content', 'writer'], proyectos: ['document', 'report'] },
        steps: [
            { kind: 'tool', tool: 'fair_translation_status', label: 'Estado de la traducción de cada proyecto (sin traducir, borrador, por revisar, aprobada, desactualizada)', team: 'proyectos', tools: ['fair_translation_status'], risk: 'N0', ai: false },
            { kind: 'handoff', module: 'expediente', label: 'Generar, corregir y aprobar la traducción en el Expediente de cada proyecto (glosario Rotary, huella del original, versión aprobada inmutable)', team: 'comunicaciones', href: '/admin/postulaciones-pagos', risk: 'N1' },
        ],
        deliverables: ['Inventario de traducción por proyecto', 'Lista priorizada de proyectos por traducir o actualizar', 'Fichas PDF en español, inglés y bilingüe desde el Expediente'],
        never: ['Sobrescribir el texto original', 'Aprobar traducciones sin revisión humana', 'Traducir nombres, cifras, correos o documentos'],
        siteTypes: ['Feria de Proyectos', 'district'],
    },
    {
        key: 'registrations', label: 'Revisar inscripciones',
        quick: 'Analiza las inscripciones de la conferencia distrital y prepara un informe de registros pendientes de validación.',
        keywords: [/inscrip|inscrit|registros?\s+pendientes|conferencia|convenci[oó]n|asistentes|comprobante/i],
        weight: 2,
        teams: ['eventos'],
        specialists: { eventos: ['event', 'registration', 'quality', 'report', 'support'] },
        steps: [
            { kind: 'workflow', workflowKey: 'event_registration_review', label: 'Revisar inscripciones: comprobantes, duplicados, pagos y estados que no cuadran, datos incompletos', team: 'eventos', tools: ['events_list', 'events_registration_review'], risk: 'N0', ai: true },
        ],
        deliverables: ['Informe de registros pendientes de validación', 'Hallazgos por inscripción con su código', 'Borrador de recordatorio (no se envía)'],
        never: ['Confirmar o cambiar pagos', 'Fusionar o eliminar inscripciones', 'Enviar correos o WhatsApp sin aprobación'],
        siteTypes: ['Evento o Convención', 'district', 'club', 'Feria de Proyectos'],
    },
    {
        key: 'communication', label: 'Crear comunicado',
        quick: 'Prepara un comunicado institucional sobre los avances de los proyectos sociales del distrito.',
        keywords: [/comunicad|noticia|bolet[ií]n|anuncio|publicaci[oó]n|redes\s+sociales|correo\s+institucional|campa[nñ]a\s+de\s+comunicaci/i],
        weight: 2,
        teams: ['comunicaciones'],
        specialists: { comunicaciones: ['content', 'brand', 'social', 'email', 'writer'] },
        steps: [
            { kind: 'workflow', workflowKey: 'institutional_comms', label: 'Redactar noticia, texto para redes, WhatsApp y correo con el contexto autorizado; revisión de tono; noticia como BORRADOR', team: 'comunicaciones', tools: ['site_context', 'content_create_news_draft'], risk: 'N1', ai: true, input: 'brief' },
        ],
        deliverables: ['Borrador de noticia (no publicada)', 'Textos para redes, WhatsApp y correo', 'Revisión de tono', 'Aprobación pendiente para publicar'],
        never: ['Publicar o enviar sin aprobación', 'Inventar cifras de impacto', 'Atribuir declaraciones a autoridades rotarias'],
        siteTypes: [],
    },
    {
        key: 'membership', label: 'Campaña o análisis de membresía',
        quick: 'Analiza la participación de los socios y recomiéndame acciones para mejorar el involucramiento.',
        keywords: [/membres|socios?|retenci[oó]n|participaci[oó]n|involucramiento|nuevos\s+socios/i],
        weight: 2,
        teams: ['membresia'],
        specialists: { membresia: ['member', 'engagement', 'retention', 'community'] },
        steps: [
            { kind: 'workflow', workflowKey: 'membership_review', label: 'Cifras AGREGADAS de socios, tendencia de altas y bajas, junta y perfiles incompletos', team: 'membresia', tools: ['membership_summary'], risk: 'N0', ai: true },
        ],
        deliverables: ['Indicadores agregados', 'Hallazgos de tendencia', 'Propuestas de acción para la junta', 'Borrador de mensaje a los socios'],
        never: ['Perfilar o puntuar a una persona', 'Contactar o dar de baja socios', 'Mostrar nombres o datos personales'],
        siteTypes: ['club', 'district'],
    },
    {
        key: 'district_report', label: 'Preparar informe institucional',
        quick: 'Prepara un informe ejecutivo de la actividad de los clubes del distrito en los últimos 90 días.',
        keywords: [/informe\s+(institucional|ejecutivo|distrital)|clubes\s+del\s+distrito|actividad\s+de\s+los\s+clubes|gobernador|indicadores\s+distritales/i],
        weight: 2,
        teams: ['analitica'],
        specialists: { analitica: ['analytic', 'report', 'data', 'executive'] },
        steps: [
            { kind: 'workflow', workflowKey: 'district_report', label: 'Consolidar noticias, eventos y proyectos de cada club del distrito; borrador del informe', team: 'analitica', tools: ['site_context'], risk: 'N0', ai: true },
        ],
        deliverables: ['Indicadores por club', 'Clubes sin actividad publicada', 'Borrador del informe (validación del distrito)'],
        never: ['Publicar el informe sin validación del distrito'],
        siteTypes: ['district'],
    },
    {
        key: 'site_audit', label: 'Auditar el sitio web',
        quick: 'Revisa el estado del sitio web: identidad, contenido reciente, eventos y SEO, y propón tareas priorizadas.',
        keywords: [/sitio\s+web|p[aá]gina\s+web|seo|auditor[ií]a\s+web|contenido\s+del\s+sitio|portal/i],
        weight: 2,
        teams: ['tecnologia'],
        specialists: { tecnologia: ['seo', 'ux', 'accessib', 'frontend', 'audit'] },
        steps: [
            { kind: 'workflow', workflowKey: 'site_audit', label: 'Identidad, contenido reciente, eventos y última auditoría SEO; tareas técnicas propuestas', team: 'tecnologia', tools: ['site_context', 'seo_latest_audit', 'content_recent'], risk: 'N0', ai: true },
        ],
        deliverables: ['Hallazgos priorizados', 'Tareas técnicas propuestas'],
        never: ['Cambiar el sitio automáticamente'],
        siteTypes: [],
    },
    {
        key: 'indicators', label: 'Analizar indicadores',
        quick: 'Analiza los indicadores de la organización y dime qué está funcionando y qué no.',
        keywords: [/indicador|m[eé]tricas?|tendencia|estad[ií]stica|anal[ií]tica|desempe[nñ]o/i],
        weight: 1,
        teams: ['analitica'],
        specialists: { analitica: ['analytic', 'data', 'report', 'performance'] },
        steps: [
            { kind: 'tool', tool: 'site_context', label: 'Contexto del sitio: noticias, proyectos y eventos recientes', team: 'analitica', tools: ['site_context'], risk: 'N0', ai: false },
            { kind: 'workflow', workflowKey: 'site_audit', label: 'Indicadores de contenido, eventos y SEO con hallazgos', team: 'tecnologia', tools: ['site_context', 'seo_latest_audit', 'content_recent'], risk: 'N0', ai: true },
        ],
        deliverables: ['Indicadores del sitio', 'Hallazgos y recomendaciones con evidencia'],
        never: ['Inventar cifras'],
        siteTypes: [],
    },
    {
        key: 'finance', label: 'Revisión financiera',
        quick: 'Revisa los registros financieros y los pagos, y dime qué inconsistencias hay. Sólo lectura.',
        keywords: [/financ|conciliaci|tesorer|libro\s+mayor|pagos?\s+sin|saldos?|contab/i],
        weight: 2,
        teams: ['finanzas'],
        specialists: { finanzas: ['financ', 'account', 'reconcil', 'audit'] },
        steps: [
            { kind: 'workflow', workflowKey: 'finance_review', label: 'Libro mayor de la Bóveda y pagos del sitio: descuadres, reversos huérfanos y pagos sin soporte', team: 'finanzas', tools: ['finance_review'], risk: 'N0', ai: true },
        ],
        deliverables: ['Hallazgos con la referencia de cada caso', 'Qué verificar en tesorería'],
        never: ['Confirmar pagos', 'Alterar saldos o el libro mayor'],
        siteTypes: [],
    },
    {
        key: 'formulation', label: 'Formular un proyecto',
        quick: 'Ayúdame a estructurar un proyecto de servicio a partir de esta idea: …',
        keywords: [/formular|estructurar\s+(un\s+)?proyecto|idea\s+de\s+proyecto|marco\s+l[oó]gico|propuesta\s+de\s+proyecto/i],
        weight: 2,
        teams: ['proyectos'],
        specialists: { proyectos: ['project', 'planner', 'strateg', 'writer'] },
        steps: [
            { kind: 'workflow', workflowKey: 'project_formulation', label: 'Chequeo de lo que falta y borrador estructurado (objetivos, actividades, indicadores, riesgos)', team: 'proyectos', tools: ['site_context'], risk: 'N0', ai: true, input: 'idea' },
        ],
        deliverables: ['Borrador estructurado del proyecto', 'Preguntas para el club (lo que falta)'],
        never: ['Inventar cifras o beneficiarios', 'Aprobar el proyecto'],
        siteTypes: [],
    },
    {
        key: 'event_planning', label: 'Organizar un evento',
        quick: 'Quiero organizar un evento institucional: revisa los eventos actuales y propón cómo prepararlo.',
        keywords: [/organizar\s+(un\s+)?evento|planear\s+(un\s+)?evento|log[ií]stica|agenda\s+del\s+evento/i],
        weight: 1,
        teams: ['eventos'],
        specialists: { eventos: ['event', 'project', 'planner'] },
        steps: [
            { kind: 'tool', tool: 'events_list', label: 'Eventos actuales del sitio y sus inscripciones', team: 'eventos', tools: ['events_list'], risk: 'N0', ai: false },
            { kind: 'handoff', module: 'eventos', label: 'Crear el evento, sus categorías de inscripción y su página en el módulo Eventos', team: 'eventos', href: '/admin/eventos', risk: 'N2' },
        ],
        deliverables: ['Panorama de los eventos actuales', 'Pasos para crear el evento en el módulo'],
        never: ['Crear o publicar eventos sin una persona'],
        siteTypes: [],
    },
    {
        key: 'custom_workflow', label: 'Crear workflow personalizado',
        quick: 'Quiero automatizar una revisión que hacemos cada semana: arma un workflow personalizado.',
        keywords: [/workflow|automatiz|flujo\s+de\s+trabajo|cada\s+semana|cada\s+mes|programar/i],
        weight: 1,
        teams: ['direccion'],
        specialists: { direccion: ['workflow', 'automation', 'orchestr', 'project'] },
        steps: [
            { kind: 'handoff', module: 'constructor', label: 'Diseñar los pasos en el Constructor (herramientas N0/N1, agentes instalados, aprobación humana para N2/N3) y programarlo', team: 'direccion', href: '/admin/agentes?s=constructor', risk: 'N1' },
        ],
        deliverables: ['Workflow en borrador en el Constructor'],
        never: ['Publicar un workflow con acciones externas sin aprobación'],
        siteTypes: [],
    },
];
export const CAPABILITY_KEYS = CAPABILITIES.map(c => c.key);
export const capabilityByKey = (k) => CAPABILITIES.find(c => c.key === k) || null;

/** Accesos rápidos de la consola (el texto que se pega en el campo). */
export const QUICK_ACTIONS = CAPABILITIES.map(c => ({ key: c.key, label: c.label, text: c.quick }));

// ── Interpretación ─────────────────────────────────────────────────────
const norm = (s) => String(s || '').normalize('NFC');

/**
 * Lee el objetivo y elige capacidades por palabras clave. Devuelve las
 * coincidencias ordenadas y, si no hay ninguna, preguntas para aclarar.
 * `forced` (claves elegidas a mano desde un acceso rápido) se respeta si existe.
 */
export function interpretObjective(text, { forced = [] } = {}) {
    const t = norm(text).trim();
    const errors = [];
    if (t.length < LIMITS.minObjective) errors.push(`Describe el objetivo en al menos ${LIMITS.minObjective} caracteres.`);
    if (t.length > LIMITS.maxObjective) errors.push(`El objetivo no puede pasar de ${LIMITS.maxObjective} caracteres.`);
    const scored = CAPABILITIES.map(c => {
        const hits = c.keywords.reduce((n, re) => n + (t.match(new RegExp(re.source, 'gi')) || []).length, 0);
        return { key: c.key, label: c.label, score: hits * c.weight };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
    const forcedOk = (Array.isArray(forced) ? forced : []).filter(k => capabilityByKey(k));
    let chosen = forcedOk.length ? forcedOk : scored.map(s => s.key);
    // «traducir los proyectos postulados» no es «analizarlos»: la traducción
    // manda cuando aparece y no se pidió análisis/revisión explícitamente.
    if (!forcedOk.length && chosen.includes('fair_translation') && chosen.includes('fair_review') && !/analiz|revis|faltant|incomplet|resumen/i.test(t)) chosen = chosen.filter(k => k !== 'fair_review');
    // «indicadores» genérico sobra si ya hay un análisis concreto.
    if (!forcedOk.length && chosen.length > 1 && chosen.includes('indicators')) chosen = chosen.filter(k => k !== 'indicators');
    chosen = [...new Set(chosen)].slice(0, LIMITS.maxCapabilities);
    const clarify = chosen.length ? [] : [
        '¿Sobre qué módulo trabajamos: proyectos de la feria, inscripciones de un evento, comunicaciones, membresía, finanzas o el sitio web?',
        '¿Qué entregable esperas: un informe, un borrador, una lista de pendientes o un workflow?',
        '¿Para quién es el resultado (comité, junta, gobernación, equipo técnico)?',
    ];
    return { text: t, errors, matches: scored, capabilities: chosen, clarify };
}

// ── Plan ───────────────────────────────────────────────────────────────
/** Elige, entre agentes del catálogo, los que mejor encajan con las palabras del equipo. */
export function rankSpecialists(templates = [], words = [], limit = 3) {
    const ws = words.map(w => String(w).toLowerCase());
    return templates
        .map(t => {
            const hay = `${t.name || ''} ${t.role || ''} ${t.key || ''}`.toLowerCase();
            return { ...t, score: ws.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0) };
        })
        .filter(t => t.score > 0)
        .sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name)))
        .slice(0, limit);
}

/**
 * Estimación del costo de IA de un plan: tokens típicos por paso que redacta
 * con IA × el precio de referencia del modelo. Es una ESTIMACIÓN (se dice);
 * el costo real sale del Consumo de IA al ejecutar.
 */
export const TOKENS_PER_AI_STEP = { input: 7000, output: 1500 };
export function estimateCost({ aiSteps = 0, directorRead = false, price = null } = {}) {
    const calls = aiSteps + (directorRead ? 1 : 0);
    const tokens = { input: calls * TOKENS_PER_AI_STEP.input, output: calls * TOKENS_PER_AI_STEP.output };
    if (!price || price.inputPerMTok == null) return { estimated: true, calls, tokens, usd: null, note: calls ? 'El modelo no tiene precio de referencia: se medirá al ejecutar.' : 'Este plan no usa IA.' };
    const usd = (tokens.input / 1e6) * Number(price.inputPerMTok) + (tokens.output / 1e6) * Number(price.outputPerMTok || 0);
    return { estimated: true, calls, tokens, usd: Math.round(usd * 10000) / 10000, model: price.model || null, note: 'Estimado con el precio de referencia; el costo real se mide en Consumo de IA.' };
}

/**
 * Arma el plan. Todo lo que recibe ya fue leído por el servidor para el sitio
 * del plan; esta función sólo decide.
 *
 * @param interpretation  salida de interpretObjective
 * @param site            { id, name, type } (canónico en `siteType`)
 * @param policy          política del tipo de sitio ({ enabled, allowedTeams })
 * @param director        { installed, state, reason, installationId, model }
 * @param installations   instalaciones del sitio: [{ id, team, templateName, enabled, state }]
 * @param catalog         { [team]: [{ id, key, name, role }] } plantillas publicadas por equipo
 * @param sources         [{ id, name, scope, memories }] cerebros consultables
 * @param workflows       WORKFLOWS del runtime (para validar que el paso exista)
 * @param tools           TOOL_CATALOG del runtime
 * @param price           precio de referencia del modelo del Director
 */
export function buildPlan({ interpretation, site, siteType, policy, director = {}, installations = [], catalog = {}, sources = [], workflows = {}, tools = [], price = null, teamsAllowed = null } = {}) {
    const caps = (interpretation?.capabilities || []).map(capabilityByKey).filter(Boolean);
    const toolByKey = new Map(tools.map(t => [t.key, t]));
    const allowsTeam = (team) => (teamsAllowed ? teamsAllowed(team) : true);
    const blockers = [];
    const warnings = [];
    if (!caps.length) blockers.push('No identifiqué qué hacer con este objetivo: responde las preguntas y vuelve a intentarlo.');
    if (policy && !policy.enabled) blockers.push('Los agentes no están integrados con este tipo de sitio (Gobierno → Tipos de sitio).');
    if (!director.installed) blockers.push('El Director no está instalado en esta organización: instálalo y enciéndelo para poder ejecutar planes.');
    else if (!['active', 'running'].includes(director.state)) blockers.push(`El Director está «${director.stateLabel || director.state}»${director.reason ? `: ${director.reason}` : ''}. Debe estar Activo para ejecutar.`);

    const steps = [];
    let seq = 0;
    for (const cap of caps) {
        if (cap.siteTypes.length && siteType && !cap.siteTypes.includes(siteType)) warnings.push(`«${cap.label}» está pensado para ${cap.siteTypes.join(', ')}; esta organización es «${siteType}». Puede no encontrar datos.`);
        let prevId = null;
        for (const s of cap.steps) {
            seq += 1;
            const id = `s${seq}`;
            const teamOk = allowsTeam(s.team);
            if (!teamOk) blockers.push(`El equipo «${s.team}» no está permitido para este tipo de sitio (paso ${seq}).`);
            if (s.kind === 'workflow' && !workflows[s.workflowKey]) blockers.push(`El workflow «${s.workflowKey}» no existe.`);
            if (s.kind === 'tool') {
                const tool = toolByKey.get(s.tool);
                if (!tool) blockers.push(`La herramienta «${s.tool}» no existe.`);
                else if (tool.risk !== 'N0') blockers.push(`La herramienta «${s.tool}» no es de lectura: el Director sólo ejecuta lecturas directas.`);
            }
            // El agente que redacta: uno ENCENDIDO del mismo equipo en el sitio (el
            // mismo criterio que `aiNarrative` del runtime). Sin él, el paso corre
            // igual y su informe dice por qué no hay resumen con IA.
            const agent = installations.find(i => i.team === s.team && i.enabled && ['active', 'running', 'profile_only'].includes(i.state)) || null;
            if (s.kind === 'workflow' && s.ai && !agent) warnings.push(`Paso ${seq}: no hay un agente encendido del equipo «${s.team}» en este sitio; los hallazgos salen completos, pero sin resumen con IA.`);
            steps.push({
                id, seq, capability: cap.key, kind: s.kind, label: s.label, team: s.team,
                workflowKey: s.workflowKey || null, tool: s.tool || null, module: s.module || null, href: s.href || null,
                inputFrom: s.input || null,
                tools: (s.tools || []).map(k => ({ key: k, risk: toolByKey.get(k)?.risk || null })),
                risk: s.risk, ai: Boolean(s.ai && agent),
                agent: agent ? { installationId: agent.id, name: agent.templateName } : null,
                dependsOn: prevId ? [prevId] : [],
                status: 'pending',
            });
            prevId = id;
        }
    }

    const teams = [...new Set(steps.map(s => s.team))];
    const specialists = [];
    for (const cap of caps) for (const team of cap.teams) {
        const installed = installations.filter(i => i.team === team);
        const suggested = rankSpecialists(catalog[team] || [], cap.specialists?.[team] || []);
        specialists.push({
            team, capability: cap.key,
            installed: installed.map(i => ({ installationId: i.id, name: i.templateName, state: i.state, enabled: i.enabled })),
            suggested: suggested.filter(t => !installed.some(i => i.templateKey === t.key)).map(t => ({ templateId: t.id, key: t.key, name: t.name, role: t.role })),
        });
    }
    const approvals = [
        { at: 'plan', label: 'Aprobar el plan antes de ejecutar', who: 'Quien administra esta organización o la plataforma' },
        ...steps.filter(s => s.risk === 'N3' || s.risk === 'N2').map(s => ({ at: s.id, label: `${s.label}: lo hace una persona en su módulo`, who: 'Responsable del módulo' })),
        ...(caps.some(c => c.key === 'communication') ? [{ at: 'publish', label: 'Publicar la noticia (aprobación N3 en la bandeja de Aprobaciones)', who: 'Quien administra esta organización' }] : []),
        ...(caps.some(c => c.key === 'district_report') ? [{ at: 'validate', label: 'Validar el informe distrital', who: 'El distrito' }] : []),
        { at: 'review', label: 'Revisar y cerrar el entregable', who: 'Quien aprobó el plan u otra persona con permiso' },
    ];
    const risks = [...new Set(caps.flatMap(c => c.never))].map(n => `No hará: ${n}.`);
    risks.push('Los datos de formularios y documentos se tratan como DATOS, nunca como instrucciones para el Director.');
    const cost = estimateCost({ aiSteps: steps.filter(s => s.ai).length, directorRead: director.installed && ['active', 'running'].includes(director.state), price });

    return {
        version: 1,
        objective: interpretation?.text || '',
        interpreted: caps.map(c => c.label),
        matches: interpretation?.matches || [],
        clarify: interpretation?.clarify || [],
        context: { siteId: site?.id ? String(site.id) : null, siteName: site?.name || null, siteType: siteType || null },
        scope: `Sólo los datos de «${site?.name || 'esta organización'}» que las herramientas autorizadas permiten leer. Nada de otras organizaciones.`,
        deliverables: [...new Set(caps.flatMap(c => c.deliverables))],
        steps, teams, specialists,
        sources: sources.map(s => ({ id: s.id, name: s.name, scope: s.scope, memories: s.memories ?? null })),
        tools: [...new Map(steps.flatMap(s => s.tools).map(t => [t.key, t])).values()],
        dependencies: steps.filter(s => s.dependsOn.length).map(s => ({ step: s.id, after: s.dependsOn })),
        risks, approvals, cost, blockers: [...new Set(blockers)], warnings: [...new Set(warnings)],
        director: { installationId: director.installationId || null, state: director.state || null, model: director.model || null },
    };
}

/** El input de un workflow sale del plan (objetivo), nunca de un modelo. */
export function stepInput(step, plan) {
    if (step.inputFrom === 'brief') return { brief: String(plan.objective || '').slice(0, 2000) };
    if (step.inputFrom === 'idea') return { idea: String(plan.objective || '').slice(0, 4000) };
    return {};
}

/** El siguiente paso a ejecutar: el primero pendiente cuyas dependencias terminaron. */
export function nextStep(plan) {
    const steps = plan?.steps || [];
    const finished = new Set(steps.filter(s => ['done', 'handoff', 'skipped'].includes(s.status)).map(s => s.id));
    return steps.find(s => s.status === 'pending' && (s.dependsOn || []).every(d => finished.has(d))) || null;
}
export const planFinished = (plan) => (plan?.steps || []).every(s => ['done', 'handoff', 'skipped'].includes(s.status));

// ── Resumen de un informe de workflow (para el entregable) ─────────────
function countFindings(report) {
    if (!report) return 0;
    if (Array.isArray(report.findings)) return report.findings.length;
    if (typeof report.findings === 'number') return report.findings;
    if (Array.isArray(report.submissions)) return report.submissions.reduce((n, s) => n + (s.missing?.length || 0) + (s.issues?.length || 0), 0);
    return 0;
}

/** Lo esencial de un paso, para el entregable y la pantalla. Sin datos personales. */
export function summarizeStepResult(step, result) {
    if (!result) return { headline: 'Sin resultado.', findings: 0, items: [] };
    if (step.kind === 'workflow') {
        const r = result.report || {};
        const items = [];
        if (r.kind === 'fair_submission_review') {
            for (const s of (r.submissions || []).slice(0, 60)) items.push({ ref: s.ref || s.submissionId, title: s.project?.name || null, detail: [...(s.missing || []).map(m => `Falta: ${m.label}`), ...(s.issues || []).map(i => i.evidence)].slice(0, 8) });
            return { headline: `${(r.submissions || []).length} postulaciones revisadas · ${r.complete || 0} con el registro completo · ${r.withMissing || 0} con faltantes en el registro · ${r.formsIncomplete || 0} con Formulación o FDD por completar · ${r.withIssues || 0} con observaciones.`, findings: countFindings(r), items };
        }
        if (r.kind === 'event_registration_review') {
            for (const e of (r.events || []).slice(0, 10)) items.push({ ref: e.eventId, title: e.title || null, detail: (e.findings || []).slice(0, 8).map(f => `${f.code || f.registrationId}: ${f.evidence}`) });
            return { headline: `${(r.events || []).length} eventos revisados · ${r.findings || 0} hallazgos.`, findings: countFindings(r), items };
        }
        if (r.kind === 'institutional_comms') {
            return { headline: r.newsDraft ? `Noticia en borrador «${r.newsDraft.title}»; publicarla espera aprobación.` : 'Textos redactados; no se pudo crear el borrador de la noticia.', findings: 0, items: [{ ref: r.newsDraft?.id || null, title: r.drafts?.title || null, detail: Object.entries(r.tone || {}).filter(([, v]) => !v.ok).map(([k, v]) => `Tono (${k}): ${v.flags.join(' ')}`) }] };
        }
        if (r.kind === 'district_report') return { headline: `${r.clubs || 0} clubes · ${r.totals?.news || 0} noticias · ${r.totals?.events || 0} eventos · ${(r.quietClubs || []).length} sin actividad publicada.`, findings: (r.quietClubs || []).length, items: [] };
        if (r.kind === 'project_formulation') return { headline: r.draft ? `Borrador «${r.draft.title || 'sin título'}» con ${(r.draft.missingInfo || []).length} preguntas para el club.` : 'Chequeo de la idea listo; sin borrador estructurado.', findings: (r.check?.missing || []).length, items: [] };
        const list = Array.isArray(r.findings) ? r.findings : [];
        for (const f of list.slice(0, 20)) items.push({ ref: f.ref || f.area || f.kind || null, title: null, detail: [f.evidence || f.finding || ''].filter(Boolean) });
        return { headline: `${list.length} hallazgos.`, findings: list.length, items };
    }
    if (step.kind === 'tool') {
        if (step.tool === 'fair_translation_status') {
            const p = result.projects || [];
            return { headline: `${p.length} proyectos · ${result.counts?.approved || 0} aprobadas · ${result.counts?.pending || 0} por traducir o revisar · ${result.counts?.outdated || 0} desactualizadas.`, findings: (result.counts?.pending || 0) + (result.counts?.outdated || 0), items: p.filter(x => x.state !== 'approved').slice(0, 60).map(x => ({ ref: x.ref, title: x.name, detail: [`${x.label}${x.total ? ` · ${x.counts?.missing || 0} campos sin traducir de ${x.total}` : ''}`] })) };
        }
        if (step.tool === 'events_list') return { headline: `${(result.events || []).length} eventos con inscripciones.`, findings: 0, items: (result.events || []).map(e => ({ ref: e.eventId, title: e.title, detail: [`${e.registrations} inscripciones`] })) };
        if (step.tool === 'site_context') return { headline: `${result.site?.name || 'Sitio'} · ${result.projectCount ?? 0} proyectos · ${(result.recentNews || []).length} noticias recientes · ${(result.upcomingEvents || []).length} eventos próximos.`, findings: 0, items: [] };
        return { headline: 'Lectura hecha.', findings: 0, items: [] };
    }
    return { headline: 'Lo hace una persona en su módulo.', findings: 0, items: [] };
}

/** El entregable final: una sección por paso, en orden, con su fuente. */
export function consolidateDeliverable(plan, { costUsd = null, now = new Date() } = {}) {
    const sections = (plan.steps || []).map(s => ({
        step: s.id, label: s.label, kind: s.kind, status: s.status,
        headline: s.summary?.headline || (s.status === 'handoff' ? 'Pendiente de una persona en su módulo.' : '—'),
        findings: s.summary?.findings || 0,
        items: s.summary?.items || [],
        aiSummary: s.aiSummary || null, aiNote: s.aiNote || null,
        source: s.workflowRunId ? { type: 'workflow_run', id: s.workflowRunId } : s.kind === 'tool' ? { type: 'tool', key: s.tool } : s.href ? { type: 'module', href: s.href } : null,
        error: s.error || null,
    }));
    const totalFindings = sections.reduce((n, s) => n + s.findings, 0);
    const pendingHuman = sections.filter(s => s.kind === 'handoff').map(s => s.label);
    return {
        title: `Entregable: ${plan.interpreted?.join(' + ') || 'plan'}`,
        generatedAt: now.toISOString(),
        objective: plan.objective,
        organization: plan.context?.siteName || null,
        headline: `${sections.filter(s => s.status === 'done').length} de ${sections.length} pasos ejecutados · ${totalFindings} hallazgos${pendingHuman.length ? ` · ${pendingHuman.length} para una persona` : ''}.`,
        sections, totalFindings, pendingHuman,
        costUsd, deliverables: plan.deliverables || [],
        disclaimer: 'Los hallazgos salen de reglas deterministas sobre los datos de esta organización; los resúmenes con IA son borradores. Nada se aprobó, rechazó, pagó, publicó ni envió.',
    };
}

/** Una entrada del historial del plan. */
export const historyEntry = (action, user, extra = {}) => ({ at: new Date().toISOString(), action, by: user?.id || user?.userId || null, role: user?.role || null, ...extra });

export const HISTORY_ACTIONS = {
    created: 'Plan generado', submitted: 'Enviado a aprobación', approved: 'Plan aprobado', changes_requested: 'Cambios solicitados',
    cancelled: 'Cancelado', step_started: 'Paso iniciado', step_done: 'Paso terminado', step_failed: 'Paso falló', step_handoff: 'Paso para una persona',
    step_retry: 'Reintento de paso', budget_blocked: 'Frenado por presupuesto', review_ready: 'Entregable listo', completed: 'Entregable revisado y cerrado',
};
