// ════════════════════════════════════════════════════════════════════════════
// Solicitud de contenido → artículo de noticia — el CRITERIO
// v4.1000.0
//
// Cada solicitud que llega por el formulario público se convierte SOLA en un
// borrador de noticia: texto periodístico, SEO, etiquetas, categoría, portada
// sugerida y galería ordenada. Lo que NO hace sola es publicar: el borrador
// nace `published = false` y la publicación es un acto humano, siempre.
//
// Este archivo es PURO: sin base, sin red, sin IA, sin reloj propio —toda
// función que dependa del tiempo recibe `now`—. La orquestación vive en
// `submissionArticleEngine.js`; acá vive QUÉ se decide y CON QUÉ criterio,
// que es lo que se prueba con `npm run test:submissions:article`.
//
// ─── Decisiones que viven acá y conviene no mover ────────────────────────
//
// - UNA SOLICITUD = UN ARTÍCULO PRINCIPAL. La idempotencia es de la BASE
//   (`SubmissionArticle.submissionId` es único) y no de una comprobación
//   previa: entre leer y escribir caben un refresco, un reintento del cron y
//   un webhook. Duplicar es una acción EXPLÍCITA y produce otro Post, nunca
//   otra fila de workflow.
//
// - EL WORKFLOW AVANZA POR ETAPAS Y CADA ETAPA SE RECLAMA. El sondeo del
//   navegador, el cron y una recarga pueden llegar a la vez; el reclamo sobre
//   `attempts` (entero exacto, v4.800) hace que sólo uno ejecute la etapa. Y
//   un fallo en una etapa no tira las anteriores: «Borrador generado — SEO
//   pendiente» es un estado real, no un error.
//
// - EL MODELO ESCRIBE, EL CÓDIGO DECIDE. Longitudes, estructura y —sobre
//   todo— VERACIDAD: `validateEmergencyCopy` (la capa 3 de la Campaña de
//   Emergencia) rechaza cifras, atribuciones y cuantificadores que la
//   solicitud no suministró. Lo que la solicitud no dice, el artículo no lo
//   dice, y se marca «Información no suministrada».
//
// - LA PORTADA SE SUGIERE, NO SE IMPONE. El puntaje combina lo MEDIDO (sharp:
//   nitidez, exposición, resolución, duplicados) con lo DESCRITO (visión:
//   personas, captura de pantalla, relevancia). El usuario puede cambiarla por
//   cualquier foto de la solicitud.
//
// - LAS ETIQUETAS SE NORMALIZAN POR CLAVE (sin tildes, sin caja) y conservan la
//   forma EXISTENTE del sitio cuando la hay: «Sevilla», «sevilla» y «SEVILLA»
//   son la misma etiqueta, y la que manda es la que ya se usó.
//
// - LA CATEGORÍA SE ELIGE DE LAS QUE HAY. Una que el modelo invente no crea
//   nada: queda como SUGERENCIA y el artículo cae a la mejor existente.
// ════════════════════════════════════════════════════════════════════════════

import { LIMITS, stripHtml, truncateAtWord } from './seoSpec.js';
import { buildSubmissionContext, activityDateLabel, clubNames } from './contentSubmissionSpec.js';
import { validateEmergencyCopy } from './emergencySpec.js';
import { classifyAgent, parseUserAgent, readUtm, attributeSource, visitorSeed, canIdentifyVisitor, referrerHost, dayKey, shiftDayKey } from './linkTracking.js';

const str = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const arr = (v) => (Array.isArray(v) ? v : []);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const num = (v, def = 0) => (Number.isFinite(Number(v)) ? Number(v) : def);
const stripAccents = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// ─── Los estados editoriales ───────────────────────────────────────────────
//
// Son los del pedido, con su orden y su tono. `working` marca los que el
// motor mueve solo; el resto los mueve una persona.
export const ARTICLE_STATES = {
    recibida: { id: 'recibida', label: 'Recibida', order: 10, tone: 'sky', working: true, help: 'En cola: el artículo se genera solo en el próximo minuto.' },
    analizando: { id: 'analizando', label: 'Analizando', order: 20, tone: 'sky', working: true, help: 'Se está mirando el material y eligiendo la portada.' },
    generando: { id: 'generando', label: 'Generando borrador', order: 30, tone: 'sky', working: true, help: 'Se está redactando el artículo y su SEO.' },
    borrador_listo: { id: 'borrador_listo', label: 'Borrador listo', order: 40, tone: 'amber', help: 'Hay un borrador para revisar. Nada se publicó.' },
    en_revision: { id: 'en_revision', label: 'En revisión', order: 50, tone: 'amber', help: 'Alguien lo está revisando.' },
    requiere_info: { id: 'requiere_info', label: 'Requiere información', order: 55, tone: 'amber', help: 'Falta un dato y hay que pedírselo a quien envió.' },
    aprobado: { id: 'aprobado', label: 'Aprobado', order: 60, tone: 'emerald', help: 'Aprobado para publicar. Todavía no está en línea.' },
    publicado: { id: 'publicado', label: 'Publicado', order: 70, tone: 'blue', help: 'Está en línea y se mide.' },
    descartado: { id: 'descartado', label: 'Descartado', order: 90, tone: 'gray', help: 'No se va a publicar. Se conserva con su motivo.' },
    error: { id: 'error', label: 'Error', order: 95, tone: 'red', help: 'Una etapa falló. Se puede reintentar sin regenerar todo.' },
};
export const ARTICLE_STATE_IDS = Object.keys(ARTICLE_STATES);
export const ARTICLE_INITIAL_STATE = 'recibida';
export const articleStateLabel = (id) => ARTICLE_STATES[id]?.label || id;
export const isWorkingState = (id) => ARTICLE_STATES[id]?.working === true;

// Lo que una PERSONA puede hacer con el estado. El motor no pasa por acá.
const FLOW = {
    borrador_listo: ['en_revision', 'requiere_info', 'aprobado', 'descartado'],
    en_revision: ['aprobado', 'requiere_info', 'descartado', 'borrador_listo'],
    requiere_info: ['en_revision', 'borrador_listo', 'descartado'],
    aprobado: ['publicado', 'en_revision', 'descartado'],
    // Publicado no retrocede a mano: se despublica desde Noticias, y el hook
    // de `updatePost` lo devuelve a «aprobado».
    publicado: [],
    descartado: ['borrador_listo'],
    error: ['recibida'],
};
export const canTransitionArticle = (from, to) => Array.isArray(FLOW[from]) && FLOW[from].includes(to);
export const nextArticleStates = (from) => (FLOW[from] || []).map(id => ({ id, label: articleStateLabel(id) }));
export const ARTICLE_REASON_REQUIRED = ['requiere_info', 'descartado'];
export const articleNeedsReason = (to) => ARTICLE_REASON_REQUIRED.includes(to);

// ─── Las etapas del motor ──────────────────────────────────────────────────
//
// Cada `advance` ejecuta UNA etapa y suelta el reclamo. Es lo que hace que el
// sondeo del navegador pinte «Analizando contenido…» → «Seleccionando
// portada…» cuando OCURRE, no cuando cree que va por ahí (v4.756), y lo que
// mantiene cada llamada dentro del presupuesto de la función.
export const STAGES = [
    { id: 'validar', label: 'Validando la solicitud…', state: 'analizando', optional: false },
    { id: 'analizar', label: 'Analizando contenido…', state: 'analizando', optional: true },
    { id: 'portada', label: 'Seleccionando portada…', state: 'analizando', optional: true },
    { id: 'multimedia', label: 'Preparando multimedia…', state: 'analizando', optional: true },
    { id: 'generar', label: 'Generando artículo…', state: 'generando', optional: false },
    { id: 'seo', label: 'Generando SEO…', state: 'generando', optional: true },
    { id: 'borrador', label: 'Creando el borrador…', state: 'generando', optional: false },
];
export const STAGE_IDS = STAGES.map(s => s.id);
export const stageLabel = (id) => STAGES.find(s => s.id === id)?.label || id;
export const STAGE_MAX_TRIES = 2;
export const CLAIM_WINDOW_MIN = 10;

/** La etapa que sigue: la primera que no está en `ok`. `null` = todas hechas. */
export const nextStage = (stages = {}) => STAGES.find(s => stages?.[s.id]?.status !== 'ok') || null;

/**
 * El estado que se DERIVA de las etapas. Es lo que hace que «borrador
 * generado, SEO pendiente» exista: una etapa OPCIONAL fallida no tumba el
 * borrador; una OBLIGATORIA sí.
 */
export const deriveWorkflowStatus = (stages = {}) => {
    const pending = [];
    for (const s of STAGES) {
        const st = stages?.[s.id];
        if (st?.status === 'ok') continue;
        if (st?.status === 'error') {
            if (!s.optional) return { status: 'error', pending, failedStage: s.id, error: st.error || '' };
            pending.push(s.id);
            continue;
        }
        // Todavía no se llegó a esta etapa.
        return { status: s.state === 'generando' ? 'generando' : 'analizando', pending, nextStage: s.id };
    }
    return { status: 'borrador_listo', pending };
};

/** Con qué etapa se retoma tras un error: la primera obligatoria fallida, o
 *  la opcional que se pida. Reintentar NO regenera lo que ya está en `ok`. */
export const stageToRetry = (stages = {}, wanted = '') => {
    if (wanted && STAGE_IDS.includes(wanted)) return wanted;
    const fallida = STAGES.find(s => stages?.[s.id]?.status === 'error');
    return fallida?.id || nextStage(stages)?.id || null;
};

// ─── Validación previa ─────────────────────────────────────────────────────
//
// Antes de gastar una llamada de visión y otra de texto. Un error BLOQUEA; un
// aviso se guarda y viaja al artículo como «Información no suministrada».
export const MIN_CONTEXT_CHARS = 40;

export const readableText = (s = {}) => [s.title, s.description, s.story, s.extra].map(v => str(v, 5000)).filter(Boolean).join(' ');

export const checkSubmissionReady = (s = {}, { files = [] } = {}) => {
    const errors = [];
    const warnings = [];
    const texto = readableText(s);
    if (texto.length < MIN_CONTEXT_CHARS) errors.push(`La solicitud no trae texto suficiente para redactar (${texto.length} caracteres; hacen falta al menos ${MIN_CONTEXT_CHARS}).`);
    const clubes = [s.club, s.participatingClubs, ...clubNames(s.clubs)].map(v => str(v, 200)).filter(Boolean);
    if (!clubes.length) errors.push('La solicitud no dice qué club o entidad hizo la actividad.');
    if (s.activityDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(s.activityDate)) && String(s.activityDate).length < 4) {
        warnings.push('La fecha de la actividad no se pudo leer: el artículo no la nombra.');
    }
    const imagenes = arr(files).filter(f => f?.kind === 'image');
    if (!imagenes.length) warnings.push('La solicitud no trae fotografías: el artículo sale sin portada ni galería.');
    const inaccesibles = arr(files).filter(f => f?.accessible === false);
    if (inaccesibles.length) warnings.push(`${inaccesibles.length} archivo(s) no se pudieron leer y quedan fuera de la galería.`);
    return { ok: errors.length === 0, errors, warnings };
};

/** Lo que la solicitud NO dice, con nombre. Se declara en el prompt y se
 *  guarda con el artículo: un hueco en silencio es una invitación a llenarlo. */
export const missingInfo = (s = {}) => {
    const faltan = [];
    if (!str(s.activityDate, 40)) faltan.push({ key: 'fecha', label: 'Fecha de la actividad' });
    if (!str(s.location, 200) && !str(s.city, 120)) faltan.push({ key: 'lugar', label: 'Lugar de la actividad' });
    if (!str(s.club, 160) && !clubNames(s.clubs).length && !str(s.participatingClubs, 400)) faltan.push({ key: 'club', label: 'Club que participó' });
    const texto = readableText(s);
    if (!/\d/.test(texto)) faltan.push({ key: 'cifras', label: 'Cifras (cantidades, beneficiarios, montos)' });
    if (!/[«"“]/.test(texto)) faltan.push({ key: 'testimonios', label: 'Testimonios o declaraciones textuales' });
    if (!str(s.senderName, 160)) faltan.push({ key: 'responsable', label: 'Responsable de la actividad' });
    return faltan;
};

// ─── El prompt ─────────────────────────────────────────────────────────────

/**
 * El contexto que se le da al modelo. Reutiliza `buildSubmissionContext`
 * —el MISMO brief que consume el Generador de Publicaciones— y le suma quién
 * envió y qué campaña era. Lo que no se sabe se DECLARA.
 */
export const buildArticleContext = ({ submission = {}, campaign = null, siteName = '' } = {}) => {
    const L = [];
    if (campaign?.name) L.push(`Campaña de la que forma parte: «${campaign.name}».`);
    if (siteName) L.push(`Sitio que publica: ${siteName}.`);
    if (submission.senderName) {
        const cargo = [submission.role, submission.club].filter(Boolean).join(', ');
        L.push(`Quien envió el material: ${submission.senderName}${cargo ? ` (${cargo})` : ''}. Podés nombrarlo como responsable de la actividad, sin inventar cargos.`);
    }
    L.push(buildSubmissionContext(submission));
    const faltan = missingInfo(submission);
    if (faltan.length) {
        L.push(`INFORMACIÓN NO SUMINISTRADA (escribí SIN estos datos, no los completes ni los estimes): ${faltan.map(f => f.label).join('; ')}.`);
    }
    return L.join('\n');
};

/** Las reglas que se SUMAN al prompt del Asistente de Redacción para este
 *  flujo. Cortas y en positivo, como todo el sitio. */
export const buildArticleExtraRules = ({ categories = [], clubName = '' } = {}) => {
    const cats = arr(categories).filter(Boolean);
    return `ESTE ARTÍCULO SALE DE UNA SOLICITUD DE CONTENIDO ENVIADA POR UN CLUB.
- Toda la información viene del contexto de abajo. Lo que no está ahí, no existe: sin cifras, fechas, lugares, nombres, cargos, beneficiarios ni resultados que no se hayan escrito.
- Si falta un dato importante, el artículo se escribe sin él. No lo estimes ni lo describas de forma que parezca conocido.
- Una frase entre comillas del contexto puede citarse SOLO atribuida a quien la escribió. No inventes declaraciones.
- Narrativa: lead que responde qué pasó y quién lo hizo → contexto de la actividad → desarrollo → participación del club → impacto o propósito → cierre institucional. Sin exageraciones ni tono publicitario: periodístico, humano, institucional.
- El titular nombra al club y a la acción concreta cuando el contexto lo permite${clubName ? ` (el club es «${clubName}»)` : ''}. Evitá titulares genéricos como «Entrega de ayudas».
${cats.length ? `- Elegí UNA categoría de esta lista y escribila exacta en "categoria": ${cats.join(' | ')}. Si ninguna encaja, dejá "categoria" vacía y proponé una en "categoria_sugerida".` : '- Escribí en "categoria" una categoría breve y en "categoria_sugerida" la misma.'}

AGREGÁ ESTOS CAMPOS AL JSON (además de los de arriba):
  "extracto": "Resumen de 1 o 2 frases, entre 120 y 300 caracteres, sin hashtags.",
  "etiquetas": ["hasta 8 etiquetas cortas: club, ciudad, tema, campaña, distrito"],
  "categoria": "una de la lista, o vacía",
  "categoria_sugerida": "sólo si ninguna de la lista encaja",
  "og_titulo": "Título para redes, entre ${LIMITS.ogTitle.min} y ${LIMITS.ogTitle.max} caracteres.",
  "og_descripcion": "Descripción para redes, entre ${LIMITS.ogDescription.min} y ${LIMITS.ogDescription.max} caracteres.",
  "no_suministrado": ["los datos que faltaron y por eso el artículo no los nombra"]`;
};

/** Los campos extra que `normalizeArticle` no conoce. El código valida cada
 *  uno: el modelo propone y una lista de etiquetas de 40 entradas se recorta. */
export const readArticleExtras = (data = {}) => {
    const pick = (names) => {
        for (const n of names) {
            const v = data?.[n] ?? data?.article?.[n];
            if (typeof v === 'string' && v.trim()) return v.trim();
            if (Array.isArray(v) && v.length) return v;
        }
        return '';
    };
    const lista = (v) => (Array.isArray(v) ? v : String(v || '').split(','))
        .map(x => str(x, 60)).filter(Boolean);
    return {
        excerpt: str(pick(['extracto', 'excerpt', 'resumen']), LIMITS.ogDescription.hardMax),
        tags: lista(pick(['etiquetas', 'tags'])).slice(0, 12),
        category: str(pick(['categoria', 'category']), 60),
        suggestedCategory: str(pick(['categoria_sugerida', 'suggested_category']), 60),
        ogTitle: str(pick(['og_titulo', 'ogTitle']), LIMITS.ogTitle.hardMax),
        ogDescription: str(pick(['og_descripcion', 'ogDescription']), LIMITS.ogDescription.hardMax),
        notProvided: lista(pick(['no_suministrado', 'not_provided'])).slice(0, 10),
    };
};

/** El extracto siempre existe: si el modelo no lo dio, sale del primer párrafo. */
export const excerptFor = (excerpt, bodyHtml) => {
    const e = str(excerpt, 400);
    if (e.length >= 40) return truncateAtWord(e, 300);
    const texto = stripHtml(String(bodyHtml || ''));
    return truncateAtWord(texto, 240);
};

// ─── Veracidad: el CÓDIGO decide ───────────────────────────────────────────
//
// `validateEmergencyCopy` compara los números del texto contra los que el
// usuario ESCRIBIÓ. El universo de lo suministrado es todo lo que trae la
// solicitud, junto: si el club escribió «300 mercados», ese 300 deja de ser
// invención. Es la capa 3 de la Campaña de Emergencia (v4.783), reutilizada
// tal cual: un segundo validador de cifras se separaría del primero.
export const veracityContextFor = (s = {}, campaign = null) => ({
    magnitude: readableText(s),
    description: [s.title, s.description, s.story, s.extra, s.senderName, s.role, campaign?.name].filter(Boolean).join(' '),
    communities: [s.club, s.participatingClubs, ...clubNames(s.clubs), s.district].filter(Boolean).join(' '),
    eventDate: [s.activityDate, activityDateLabel(s.activityDate)].filter(Boolean).join(' '),
    location: [s.location, s.city].filter(Boolean).join(' '),
    customDisaster: '', customNeed: '', contactUrl: '',
});

export const checkArticleVeracity = ({ title = '', body = '', excerpt = '' } = {}, ctx = {}) => {
    const issues = [];
    const partes = [['titular', title], ['cuerpo', stripHtml(String(body || ''))], ['extracto', excerpt]];
    for (const [campo, texto] of partes) {
        if (!String(texto || '').trim()) continue;
        const r = validateEmergencyCopy(texto, ctx, { field: campo });
        for (const i of r.issues) issues.push(`[${campo}] ${i}`);
    }
    return { ok: issues.length === 0, issues };
};

// ─── Etiquetas y categorías ────────────────────────────────────────────────

/** La clave por la que dos etiquetas son la misma: sin tildes, sin caja, sin
 *  signos. «Sevilla», «sevilla» y «SEVILLA» → «sevilla». */
export const tagKey = (t) => stripAccents(String(t || '')).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const titleCase = (t) => str(t, 60).split(' ').map(w => (w.length > 3 || /^[a-záéíóúñ]/i.test(w) === false)
    ? w.charAt(0).toUpperCase() + w.slice(1)
    : (['de', 'del', 'la', 'las', 'el', 'los', 'y', 'en', 'por', 'para', 'con'].includes(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1))
).join(' ');

export const MAX_TAGS = 8;

/**
 * Junta las etiquetas propuestas con las que el sitio YA usa. La forma que
 * manda es la existente; una nueva entra en forma de título. Deduplicado por
 * clave, acotado a `MAX_TAGS`, y los datos fijos (club, distrito, campaña) van
 * PRIMERO porque son los que de verdad agrupan.
 */
export const mergeTags = ({ proposed = [], existing = [], fixed = [] } = {}) => {
    const porClave = new Map();
    for (const e of arr(existing)) { const k = tagKey(e); if (k && !porClave.has(k)) porClave.set(k, str(e, 60)); }
    const salida = [];
    const vistas = new Set();
    const agregar = (t) => {
        const k = tagKey(t);
        if (!k || vistas.has(k) || salida.length >= MAX_TAGS) return;
        vistas.add(k);
        salida.push(porClave.get(k) || titleCase(t));
    };
    for (const t of arr(fixed)) agregar(t);
    for (const t of arr(proposed)) agregar(t);
    return salida;
};

/** Las que van siempre que el dato exista: el club, el distrito, la campaña. */
export const fixedTagsFor = (s = {}, campaign = null) => {
    const t = [];
    if (s.district) t.push(`Rotary Distrito ${str(s.district, 20)}`);
    if (s.club) t.push(str(s.club, 60));
    if (campaign?.name) t.push(str(campaign.name, 60));
    if (s.city) t.push(str(s.city, 40));
    return t;
};

export const DEFAULT_CATEGORIES = [
    'Servicio Humanitario', 'Emergencias', 'Proyectos', 'Comunidad', 'Salud',
    'Rotary', 'Actividades de Club', 'Campañas de Contribución',
];
export const FALLBACK_CATEGORY = 'Actividades de Club';

/**
 * Elige la categoría entre las EXISTENTES. Exacta por clave; si no, la que
 * contenga la propuesta o al revés; si no, el respaldo. Nunca crea una: lo
 * que el modelo inventó vuelve como `suggested` para que una persona decida.
 */
export const pickCategory = ({ proposed = '', suggested = '', existing = [] } = {}) => {
    const catalogo = [...new Set([...arr(existing), ...DEFAULT_CATEGORIES].map(c => str(c, 60)).filter(Boolean))];
    const buscar = (texto) => {
        const k = tagKey(texto);
        if (!k) return null;
        const exacta = catalogo.find(c => tagKey(c) === k);
        if (exacta) return exacta;
        const parcial = catalogo.find(c => tagKey(c).includes(k) || k.includes(tagKey(c)));
        return parcial || null;
    };
    const p = buscar(proposed);
    if (p) return { category: p, isNew: false, suggested: '' };
    const s = buscar(suggested);
    if (s) return { category: s, isNew: false, suggested: '' };
    const nueva = str(suggested || proposed, 60);
    return { category: catalogo.includes(FALLBACK_CATEGORY) ? FALLBACK_CATEGORY : catalogo[0], isNew: Boolean(nueva), suggested: nueva };
};

// ─── La portada y la galería ───────────────────────────────────────────────

export const GALLERY_ROLES = {
    portada: { id: 'portada', label: 'Portada sugerida', order: 0 },
    contexto: { id: 'contexto', label: 'Contexto', order: 1 },
    actividad: { id: 'actividad', label: 'Actividad', order: 2 },
    participantes: { id: 'participantes', label: 'Participantes', order: 3 },
    resultado: { id: 'resultado', label: 'Resultado', order: 4 },
    cierre: { id: 'cierre', label: 'Cierre', order: 5 },
    secundaria: { id: 'secundaria', label: 'Secundaria', order: 6 },
    video: { id: 'video', label: 'Video', order: 7 },
};
export const GALLERY_ROLE_IDS = Object.keys(GALLERY_ROLES);
export const isGalleryRole = (r) => GALLERY_ROLE_IDS.includes(r);

// Umbrales MEDIDOS con la misma técnica que `inspectSourceImage` (Laplaciano
// sobre 512 px): una foto de móvil nítida da 8-25; una borrosa, menos de 4.
export const IMAGE_THRESHOLDS = {
    minSharpness: 4,
    minWidth: 640,
    darkMean: 55,        // luminancia media por debajo → demasiado oscura
    brightMean: 225,     // por encima → quemada
    duplicateDistance: 6, // bits de dHash 8×8
    minCoverScore: 35,
};

/** dHash de 8×8 bits sobre una muestra en gris de 9×8 (fila por fila). */
export const dhashBits = (gray9x8 = []) => {
    const bits = [];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        bits.push(num(gray9x8[y * 9 + x]) < num(gray9x8[y * 9 + x + 1]) ? 1 : 0);
    }
    return bits.join('');
};
export const hammingDistance = (a = '', b = '') => {
    if (!a || !b || a.length !== b.length) return Infinity;
    let d = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
    return d;
};

/** Marca duplicados: la primera de cada grupo se queda; las demás apuntan a
 *  ella. Se compara con TODAS las anteriores, no sólo la vecina. */
export const markDuplicates = (images = []) => {
    const salida = [];
    for (const img of images) {
        let duplicateOf = null;
        for (const prev of salida) {
            if (prev.duplicateOf) continue;
            if (hammingDistance(img.hash, prev.hash) <= IMAGE_THRESHOLDS.duplicateDistance) { duplicateOf = prev.fileId; break; }
        }
        salida.push({ ...img, duplicateOf });
    }
    return salida;
};

/**
 * El puntaje de portada, 0-100, con su porqué. Combina lo medido y lo
 * descrito; sin visión decide sólo lo medido, y se dice.
 */
export const scoreImage = (img = {}) => {
    const razones = [];
    let s = 50;
    const v = img.vision || null;
    const w = num(img.width), h = num(img.height);
    if (w && h) {
        if (Math.max(w, h) < IMAGE_THRESHOLDS.minWidth) { s -= 25; razones.push('resolución baja'); }
        else if (Math.max(w, h) >= 1600) { s += 8; razones.push('buena resolución'); }
        const ratio = w / h;
        if (ratio >= 1.2 && ratio <= 2.1) { s += 8; razones.push('formato apaisado, apto para portada'); }
        else if (ratio < 0.8) { s -= 6; razones.push('formato vertical'); }
    }
    if (typeof img.sharpness === 'number') {
        if (img.sharpness < IMAGE_THRESHOLDS.minSharpness) { s -= 30; razones.push('desenfocada'); }
        else if (img.sharpness > 10) { s += 6; razones.push('nítida'); }
    }
    if (typeof img.brightness === 'number') {
        if (img.brightness < IMAGE_THRESHOLDS.darkMean) { s -= 20; razones.push('demasiado oscura'); }
        else if (img.brightness > IMAGE_THRESHOLDS.brightMean) { s -= 12; razones.push('quemada'); }
        else { s += 4; }
    }
    if (img.duplicateOf) { s -= 40; razones.push('repite otra foto'); }
    if (v) {
        if (v.screenshot) { s -= 45; razones.push('captura de pantalla'); }
        if (v.document) { s -= 35; razones.push('documento'); }
        if (v.blurry) { s -= 15; razones.push('la visión la ve borrosa'); }
        if (v.dark) { s -= 8; }
        if (v.people) { s += 10; razones.push('personas visibles'); }
        if (v.facesVisible) { s += 5; }
        if (v.showsActivity) { s += 12; razones.push('muestra la actividad'); }
        s += clamp(num(v.relevance, 5) - 5, -5, 5) * 2;
    } else {
        razones.push('sin análisis de visión: puntúa sólo lo medido');
    }
    return { score: clamp(Math.round(s), 0, 100), reasons: razones };
};

/** Qué NO puede ser portada aunque puntúe: lo que no representa la actividad. */
export const coverExcluded = (img = {}) => {
    const v = img.vision || {};
    if (img.duplicateOf) return 'repite otra foto';
    if (v.screenshot) return 'es una captura de pantalla';
    if (v.document) return 'es un documento';
    if (typeof img.sharpness === 'number' && img.sharpness < IMAGE_THRESHOLDS.minSharpness) return 'está desenfocada';
    if (typeof img.brightness === 'number' && img.brightness < IMAGE_THRESHOLDS.darkMean) return 'es demasiado oscura';
    return null;
};

/** La portada: la mejor de las elegibles. Si ninguna es elegible, la mejor a
 *  secas y se AVISA — una galería sin portada es peor que una portada floja. */
export const pickCover = (images = []) => {
    const fotos = arr(images).filter(i => i.kind !== 'video' && !i.excluded);
    if (!fotos.length) return { cover: null, reason: 'sin fotografías' };
    const puntuadas = fotos.map(i => ({ ...i, ...(typeof i.score === 'number' ? { score: i.score } : scoreImage(i)) }));
    const elegibles = puntuadas.filter(i => !coverExcluded(i));
    const pool = elegibles.length ? elegibles : puntuadas;
    pool.sort((a, b) => b.score - a.score || num(a.sortOrder) - num(b.sortOrder));
    const mejor = pool[0];
    return {
        cover: mejor.fileId,
        score: mejor.score,
        reason: elegibles.length ? `la mejor de ${elegibles.length} elegible(s)` : 'ninguna cumple los criterios; se sugiere la mejor disponible',
        weak: !elegibles.length || mejor.score < IMAGE_THRESHOLDS.minCoverScore,
    };
};

/**
 * El orden de la galería: la portada primero, después por ROL en el orden
 * narrativo y, dentro del rol, por puntaje. Los duplicados y lo que no
 * representa la actividad quedan EXCLUIDOS, no borrados: siguen disponibles
 * para que una persona los incluya.
 */
export const planGallery = (images = [], coverId = null) => {
    const conRol = arr(images).map(i => ({
        ...i,
        role: i.kind === 'video' ? 'video' : (isGalleryRole(i.role) ? i.role : 'secundaria'),
        excluded: i.excluded === true || (i.kind !== 'video' && Boolean(coverExcluded(i))),
        isCover: i.fileId === coverId,
    }));
    const incluidas = conRol.filter(i => !i.excluded);
    incluidas.sort((a, b) => {
        if (a.isCover !== b.isCover) return a.isCover ? -1 : 1;
        const ra = GALLERY_ROLES[a.role]?.order ?? 6, rb = GALLERY_ROLES[b.role]?.order ?? 6;
        if (ra !== rb) return ra - rb;
        return num(b.score) - num(a.score) || num(a.sortOrder) - num(b.sortOrder);
    });
    const orden = [...incluidas, ...conRol.filter(i => i.excluded)].map((i, idx) => ({ ...i, sortOrder: idx }));
    const fotos = incluidas.filter(i => i.role !== 'video');
    // La disposición: con hasta cuatro fotos una sola galería; con más, dos
    // bloques por rol para que no caigan diez fotos seguidas sin estructura.
    let blocks;
    if (fotos.length <= 4) blocks = [{ title: 'Galería', fileIds: fotos.map(f => f.fileId) }];
    else {
        const primera = fotos.filter(f => ['portada', 'contexto', 'actividad'].includes(f.role));
        const segunda = fotos.filter(f => !['portada', 'contexto', 'actividad'].includes(f.role));
        blocks = [
            { title: 'La actividad', fileIds: (primera.length ? primera : fotos.slice(0, Math.ceil(fotos.length / 2))).map(f => f.fileId) },
            { title: 'Participantes y resultado', fileIds: (primera.length ? segunda : fotos.slice(Math.ceil(fotos.length / 2))).map(f => f.fileId) },
        ].filter(b => b.fileIds.length);
    }
    return { items: orden, blocks, videos: incluidas.filter(i => i.role === 'video').map(v => v.fileId) };
};

// ─── El análisis de visión sobre la hoja de contacto ───────────────────────
//
// UNA sola llamada: `generateCopy` acepta UNA imagen, así que las fotos viajan
// compuestas en una cuadrícula numerada por posición. El modelo DESCRIBE cada
// una y el código decide; un rol fuera del catálogo cae a «secundaria».
export const SHEET_COLUMNS = 3;
export const SHEET_THUMB = 360;
export const ALT_MAX = 125;

export const buildSheetSystemPrompt = (n) => `Sos el editor fotográfico de una publicación institucional de Rotary. Recibís UNA imagen que es una cuadrícula con ${n} fotografías, numeradas de 1 a ${n} por posición: ${SHEET_COLUMNS} por fila, de izquierda a derecha y de arriba hacia abajo.
Para CADA número describí sólo lo VISIBLE. No nombres personas, no cuentes cuántas hay, no deduzcas dónde ni cuándo fue tomada.
Respondé ÚNICAMENTE con un JSON: {"fotos":[{"n":1,"role":"contexto|actividad|participantes|resultado|cierre|secundaria","people":true,"faces_visible":false,"screenshot":false,"document":false,"blurry":false,"dark":false,"relevance":7,"shows_activity":true,"alt":"descripción de lo visible, máximo ${ALT_MAX} caracteres","caption":"pie corto opcional"}]}`;

export const parseSheetAnalysis = (raw, n) => {
    const limpio = String(raw || '').replace(/```(?:json)?/gi, '').trim();
    let data = null;
    try { data = JSON.parse(limpio); } catch {
        const m = limpio.match(/\{[\s\S]*\}/);
        if (m) { try { data = JSON.parse(m[0]); } catch { data = null; } }
    }
    const lista = arr(data?.fotos || data?.photos || data);
    const porN = new Map();
    for (const f of lista) {
        const idx = num(f?.n);
        if (!(idx >= 1 && idx <= n) || porN.has(idx)) continue;
        porN.set(idx, {
            role: isGalleryRole(f?.role) && f.role !== 'portada' && f.role !== 'video' ? f.role : 'secundaria',
            people: f?.people === true,
            facesVisible: f?.faces_visible === true || f?.facesVisible === true,
            screenshot: f?.screenshot === true,
            document: f?.document === true,
            blurry: f?.blurry === true,
            dark: f?.dark === true,
            relevance: clamp(num(f?.relevance, 5), 0, 10),
            showsActivity: f?.shows_activity === true || f?.showsActivity === true,
            alt: str(f?.alt, ALT_MAX),
            caption: str(f?.caption, 160),
        });
    }
    return { ok: porN.size > 0, byIndex: porN, missing: Array.from({ length: n }, (_, i) => i + 1).filter(i => !porN.has(i)) };
};

/** Un ALT que no puede faltar: si la visión no lo dio, sale del contexto. */
export const altFallback = (s = {}, idx = 1) => {
    const base = str(s.title, 80) || 'Actividad del club';
    const club = str(s.club, 60);
    return str(`${base}${club ? ` — ${club}` : ''} (foto ${idx})`, ALT_MAX);
};

// ─── Lo que se guarda del borrador ─────────────────────────────────────────

/** La foto de un Post para el historial de versiones: lo que un humano puede
 *  cambiar y lo que hay que poder devolver. */
export const VERSION_FIELDS = ['title', 'slug', 'content', 'category', 'tags', 'keywords', 'seoTitle', 'seoDescription', 'seoImage', 'socialCopy', 'ctaCopy', 'image', 'images', 'videoGallery'];
export const snapshotOf = (post = {}) => Object.fromEntries(VERSION_FIELDS.map(k => [k, post?.[k] ?? null]));

/** Qué cambió entre dos fotos, por campo. Es lo que se muestra en «Última edición». */
export const diffSnapshots = (a = {}, b = {}) => VERSION_FIELDS.filter(k => JSON.stringify(a?.[k] ?? null) !== JSON.stringify(b?.[k] ?? null));

export const REGENERABLE_SECTIONS = {
    titulo: { id: 'titulo', label: 'Título', field: 'title' },
    introduccion: { id: 'introduccion', label: 'Introducción', field: 'content' },
    extracto: { id: 'extracto', label: 'Extracto', field: 'seoDescription' },
    seo: { id: 'seo', label: 'SEO', field: 'seo' },
    redaccion: { id: 'redaccion', label: 'Mejorar redacción', field: 'content' },
};
export const isRegenerableSection = (s) => Object.keys(REGENERABLE_SECTIONS).includes(s);

/** El primer párrafo del cuerpo y el resto, para regenerar sólo la
 *  introducción sin tocar lo demás. */
export const splitIntro = (html = '') => {
    const m = String(html || '').match(/^\s*(<p[^>]*>[\s\S]*?<\/p>)([\s\S]*)$/i);
    if (!m) return { intro: '', rest: String(html || '') };
    return { intro: m[1], rest: m[2] };
};

export const originNote = (submissionId = '') => `Generado automáticamente desde Solicitud #${String(submissionId || '').slice(0, 8).toUpperCase()}`;

// ─── El tracking del artículo ──────────────────────────────────────────────
//
// Reutiliza `linkTracking.js` entero: bots, dispositivo, atribución y hash
// del visitante. Escribir un segundo clasificador de bots sería la copia que
// se queda atrás.
export const HIT_KINDS = ['view', 'leave', 'click'];
export const MAX_DURATION_SEC = 3600;

export const shapeHit = (body = {}) => {
    const kind = HIT_KINDS.includes(body?.kind) ? body.kind : 'view';
    const viewId = /^[a-zA-Z0-9-]{8,64}$/.test(String(body?.viewId || '')) ? String(body.viewId) : '';
    return {
        kind, viewId,
        durationSec: clamp(Math.round(num(body?.durationSec)), 0, MAX_DURATION_SEC),
        scrollPct: clamp(Math.round(num(body?.scrollPct)), 0, 100),
        target: str(body?.target, 200),
        referrer: str(body?.referrer, 600),
        search: str(body?.search, 600),
        width: clamp(Math.round(num(body?.width)), 0, 10000),
    };
};

export const describeHit = ({ headers = {}, body = {}, userAgent = '', ip = '', clubId = '' } = {}) => {
    const hit = shapeHit(body);
    const agent = classifyAgent(userAgent, headers);
    const ua = parseUserAgent(userAgent);
    const utm = readUtm(hit.search);
    const source = attributeSource({ referrer: hit.referrer, utm });
    const identifiable = canIdentifyVisitor({ ip, userAgent });
    return {
        ...hit,
        isBot: agent.isBot, botReason: agent.reason || '',
        device: ua.device, browser: ua.browser, os: ua.os,
        referrerHost: referrerHost(hit.referrer),
        sourceKind: source.kind, sourceLabel: source.label, sourceEvidence: source.evidence,
        // `readUtm` devuelve las claves en camelCase (la forma de linkTracking).
        utmSource: utm.utmSource || '', utmMedium: utm.utmMedium || '', utmCampaign: utm.utmCampaign || '',
        utmContent: utm.utmContent || '', utmTerm: utm.utmTerm || '',
        country: str(headers['x-vercel-ip-country'] || '', 2).toUpperCase(),
        city: str(headers['x-vercel-ip-city'] ? decodeURIComponentSafe(headers['x-vercel-ip-city']) : '', 80),
        identifiable,
        seed: identifiable ? visitorSeed({ clubId, ip, userAgent }) : '',
    };
};
const decodeURIComponentSafe = (v) => { try { return decodeURIComponent(String(v)); } catch { return String(v); } };

// ─── El impacto: los hechos los calcula el código ──────────────────────────

export const IMPACT_PERIODS = {
    h24: { label: 'Últimas 24 horas', hours: 24 },
    d7: { label: '7 días', days: 7 },
    d30: { label: '30 días', days: 30 },
    todo: { label: 'Todo el período', days: 0 },
};
export const IMPACT_PERIOD_IDS = Object.keys(IMPACT_PERIODS);

export const fmtInt = (n) => new Intl.NumberFormat('es-CO').format(Math.round(num(n)));
export const fmtDuration = (sec) => {
    const s = Math.max(0, Math.round(num(sec)));
    const m = Math.floor(s / 60);
    return m ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
};

/**
 * Los hechos del informe, con lo que se puede afirmar y nada más. Los
 * porcentajes salen de los eventos de vista (no de clics) y los primeros dos
 * días se comparan contra el total para decir si el pico fue temprano.
 */
export const buildImpactFacts = ({ publishedAt = null, totals = {}, series = [], sources = [], now = new Date() } = {}) => {
    const views = num(totals.views);
    const uniques = num(totals.uniques);
    const clicks = num(totals.clicks);
    const avgSeconds = totals.samples ? num(totals.seconds) / num(totals.samples) : 0;
    const totalFuentes = arr(sources).reduce((a, s) => a + num(s.views), 0) || 0;
    const fuentes = arr(sources).map(s => ({ label: s.label, views: num(s.views), pct: totalFuentes ? Math.round(num(s.views) * 100 / totalFuentes) : 0 }))
        .sort((a, b) => b.views - a.views);
    const social = fuentes.filter(f => /facebook|instagram|whatsapp|x\b|twitter|linkedin|tiktok|redes/i.test(f.label)).reduce((a, f) => a + f.pct, 0);
    const pico = arr(series).reduce((best, d) => (num(d.views) > num(best?.views) ? d : best), null);
    let primeros2Dias = null;
    if (publishedAt) {
        const d0 = dayKey(new Date(publishedAt));
        const d1 = shiftDayKey(d0, 1);
        const primeros = arr(series).filter(d => d.day === d0 || d.day === d1).reduce((a, d) => a + num(d.views), 0);
        primeros2Dias = views ? Math.round(primeros * 100 / views) : 0;
    }
    const dias = publishedAt ? Math.max(0, Math.floor((new Date(now) - new Date(publishedAt)) / 86400000)) : null;
    return {
        views, uniques, clicks, avgSeconds: Math.round(avgSeconds),
        sources: fuentes, socialPct: social, peakDay: pico?.day || null, peakViews: num(pico?.views),
        firstTwoDaysPct: primeros2Dias, daysSincePublished: dias, publishedAt,
    };
};

/** La conclusión, escrita por CÓDIGO. Es lo que sale cuando el modelo no está
 *  o no se le cree; y es la plantilla contra la que se valida lo que redacte. */
export const impactSentence = (f = {}) => {
    if (!num(f.views)) return 'El artículo todavía no registra visualizaciones.';
    const partes = [`El artículo ha recibido ${fmtInt(f.views)} visualizaciones de ${fmtInt(f.uniques)} visitantes únicos desde su publicación`];
    if (f.daysSincePublished != null) partes[0] += f.daysSincePublished === 0 ? ' (hoy)' : ` (${fmtInt(f.daysSincePublished)} día${f.daysSincePublished === 1 ? '' : 's'})`;
    partes[0] += '.';
    if (f.socialPct > 0) partes.push(`El ${f.socialPct} % del tráfico provino de redes sociales.`);
    if (f.sources?.[0]) partes.push(`La fuente principal fue ${f.sources[0].label} (${f.sources[0].pct} %).`);
    if (f.firstTwoDaysPct != null && f.firstTwoDaysPct >= 50) partes.push(`El mayor volumen de visitas se registró durante las primeras 48 horas (${f.firstTwoDaysPct} %).`);
    else if (f.peakDay) partes.push(`El pico de tráfico fue el ${f.peakDay} con ${fmtInt(f.peakViews)} visualizaciones.`);
    if (num(f.avgSeconds) > 0) partes.push(`El tiempo promedio de lectura fue de ${fmtDuration(f.avgSeconds)}.`);
    if (num(f.clicks) > 0) partes.push(`Se registraron ${fmtInt(f.clicks)} clics en enlaces del artículo.`);
    return partes.join(' ');
};

/** Los números que se pueden afirmar. Un texto redactado por un modelo que
 *  traiga otro número se descarta entero: no se inventan métricas. */
export const impactNumbers = (f = {}) => {
    const s = new Set();
    const add = (n) => { if (Number.isFinite(Number(n))) { s.add(String(Math.round(Number(n)))); } };
    [f.views, f.uniques, f.clicks, f.avgSeconds, f.socialPct, f.peakViews, f.firstTwoDaysPct, f.daysSincePublished].forEach(add);
    if (num(f.avgSeconds)) { add(Math.floor(f.avgSeconds / 60)); add(f.avgSeconds % 60); }
    for (const src of arr(f.sources)) { add(src.pct); add(src.views); }
    if (f.peakDay) String(f.peakDay).split('-').forEach(add);
    ['24', '48', '7', '30', '100', '1', '2'].forEach(add);
    return s;
};
export const summaryIsFaithful = (text = '', facts = {}) => {
    const permitidos = impactNumbers(facts);
    const encontrados = String(text || '').replace(/[.,](?=\d{3}\b)/g, '').match(/\d+/g) || [];
    return encontrados.every(n => permitidos.has(String(Number(n))));
};

export default {
    ARTICLE_STATES, ARTICLE_STATE_IDS, ARTICLE_INITIAL_STATE, articleStateLabel, isWorkingState,
    canTransitionArticle, nextArticleStates, ARTICLE_REASON_REQUIRED, articleNeedsReason,
    STAGES, STAGE_IDS, stageLabel, STAGE_MAX_TRIES, CLAIM_WINDOW_MIN, nextStage, deriveWorkflowStatus, stageToRetry,
    MIN_CONTEXT_CHARS, readableText, checkSubmissionReady, missingInfo,
    buildArticleContext, buildArticleExtraRules, readArticleExtras, excerptFor,
    veracityContextFor, checkArticleVeracity,
    tagKey, mergeTags, fixedTagsFor, MAX_TAGS, DEFAULT_CATEGORIES, FALLBACK_CATEGORY, pickCategory,
    GALLERY_ROLES, GALLERY_ROLE_IDS, isGalleryRole, IMAGE_THRESHOLDS, dhashBits, hammingDistance, markDuplicates,
    scoreImage, coverExcluded, pickCover, planGallery,
    SHEET_COLUMNS, SHEET_THUMB, ALT_MAX, buildSheetSystemPrompt, parseSheetAnalysis, altFallback,
    VERSION_FIELDS, snapshotOf, diffSnapshots, REGENERABLE_SECTIONS, isRegenerableSection, splitIntro, originNote,
    HIT_KINDS, MAX_DURATION_SEC, shapeHit, describeHit,
    IMPACT_PERIODS, IMPACT_PERIOD_IDS, fmtInt, fmtDuration, buildImpactFacts, impactSentence, impactNumbers, summaryIsFaithful,
};
