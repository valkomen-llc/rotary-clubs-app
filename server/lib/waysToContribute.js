// ════════════════════════════════════════════════════════════════════
// «Maneras de Contribuir» dentro del Generador de Publicaciones — el CRITERIO
// v4.967.0
//
// Este archivo es PURO: sin base, sin red, sin IA, sin reloj propio. Por eso
// se prueba entero con `npm run test:ways` y por eso la orquestación
// (contentStudioController) no contiene criterio.
//
// QUÉ ES Y QUÉ NO ES. Es el DÉCIMO tipo de publicación del generador de
// siempre: una publicación a partir de una FOTOGRAFÍA, con el contexto de una
// campaña de contribución detrás. NO es la Infografía de Campaña (v4.833,
// `campaignPostSpec.js`), que compone una pieza gráfica con el motor de
// Plantillas IA y no tiene fotografía que regenerar. Los dos salen de la misma
// campaña y son cosas distintas:
//
//   Infografía de Campaña  → la plataforma DIBUJA la pieza (cifras, fuentes,
//                            escudos). El modelo no escribe dentro de la imagen.
//   Maneras de Contribuir  → la fotografía es la pieza; lo que la campaña
//                            aporta es el CONTEXTO del copy y de dónde salen
//                            las fotos.
//
// Mezclarlas en un solo flujo obligaría a que el motor de imagen, el enfoque
// Rotary y el selector de foto significaran cosas distintas según un ajuste
// enterrado, que es exactamente el defecto que este módulo evita.
//
// ─── Decisiones que viven acá y conviene no mover ────────────────────
//
// - EL CATÁLOGO DE OBJETIVOS ES EL DE `campaignPostSpec.js`, no uno propio.
//   El mismo «Ayuda humanitaria» tiene que significar lo mismo en una
//   infografía y en un post, o el cliente ve dos personalidades de la misma
//   plataforma (regla de v4.667). De aquél se toman `label`, `tone` y `focus`;
//   `layout` y `needs` NO aplican acá —son de la composición gráfica— y por eso
//   este flujo no los mira: una publicación con fotografía nunca sale vacía,
//   así que la puerta de `validateBeforeGenerate` no tiene nada que proteger.
//
// - LA RELACIÓN CAMPAÑA↔BIBLIOTECA YA EXISTE Y NO SE INVENTA OTRA. Las fotos
//   de una campaña son las que su contenido ya declara: la portada, sus
//   diapositivas, la galería «Rotarios en acción» y las carátulas de sus
//   videos. Todas salieron de la Biblioteca Multimedia y viven como URL dentro
//   de `content`. Crear una tabla puente sería una SEGUNDA verdad sobre lo
//   mismo, que se contradice en cuanto alguien cambie una foto desde el editor
//   de la campaña — el error que ya se evitó con `publicKeyOf` en Plantillas IA
//   y con `hasBackdrop` en el compositor.
//
// - EL CONTEXTO ADICIONAL NO ES OBLIGATORIO, Y SU AUSENCIA SE DICE. Sin él la
//   generación ocurre igual, y el brief declara explícitamente qué se está
//   haciendo (`DEFAULT_CONTEXT_NOTE`). No se deja el hueco en silencio: un
//   hueco es una invitación a completarlo y un modelo de lenguaje completa
//   huecos por diseño — la lección de la Campaña de Emergencia (v4.783).
//
// - NO SE INVENTA NADA, Y ESO SON TRES CAPAS, no una frase en el prompt.
//   (1) al brief sólo entra lo que la campaña tiene guardado, y lo que NO se
//   sabe se declara como desconocido; (2) la cláusula de veracidad, elegida
//   según el tipo de campaña; (3) `validateEmergencyCopy` —el CÓDIGO decide—,
//   con reintento que devuelve la REGLA CONCRETA que se rompió. Sin la capa 3,
//   «le pedimos que no invente» es una afirmación que no se puede sostener.
//
// - EL TEXTO DEL USUARIO ES DATO SUMINISTRADO. Si alguien escribe «entregamos
//   300 mercados en Quibdó», ese 300 y ese Quibdó dejan de ser invención: el
//   contexto adicional entra al universo de lo permitido del validador. Sin
//   eso, la única forma de contar lo que de verdad pasó sería que el validador
//   lo rechazara.
// ════════════════════════════════════════════════════════════════════

import { normalizeContent, CAMPAIGN_TYPES } from './contributionSpec.js';
import {
    OBJECTIVES, DEFAULT_OBJECTIVE,
    AUDIENCES, DEFAULT_AUDIENCE,
    LANGUAGES, DEFAULT_LANGUAGE,
    publishableStats, activeItems,
} from './campaignPostSpec.js';
import { EMERGENCY_FACT_CLAUSE } from './emergencySpec.js';

export const WAYS_TYPE_ID = 'ways_to_contribute';
// ⚠️ EL ID NO SE TOCA Y EL RÓTULO SÍ (v4.986). `ways_to_contribute` está
// guardado en publicaciones ya generadas; el nombre que LEE una persona pasó a
// ser el del módulo, porque dos nombres para lo mismo es lo que ese cambio vino
// a deshacer. Lo que tampoco se toca es el PROMPT: describe el enfoque
// editorial del tipo —de qué maneras se puede aportar—, no el módulo, y
// reescribirlo cambiaría el copy que se genera sin que nadie lo haya pedido.
export const WAYS_TYPE_LABEL = 'Campañas de Contribución';

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const arr = (v) => (Array.isArray(v) ? v : []);

// ─── El contexto adicional ─────────────────────────────────────────────

/** Tope del campo libre. Entra ENTERO al prompt, así que se acota acá. */
export const MAX_ADDITIONAL_CONTEXT = 1200;

/**
 * Lo que el brief declara cuando el usuario no escribió nada.
 *
 * NO es un valor por defecto disfrazado de dato: es una descripción honesta de
 * la situación, y va acompañada de la instrucción de apoyarse en lo que la
 * campaña sí tiene. Dejar el hueco vacío haría que el modelo lo llenara.
 */
export const DEFAULT_CONTEXT_NOTE =
    'El usuario no escribió contexto adicional: está creando una publicación de Maneras de Contribuir para esta campaña, sin destacar nada en particular. Apoyate ÚNICAMENTE en lo que la campaña tiene registrado más arriba y en la fotografía elegida.';

export const normalizeAdditionalContext = (raw) => str(raw, MAX_ADDITIONAL_CONTEXT);

// ─── Las fotos de la campaña ───────────────────────────────────────────
//
// De dónde sale cada una. Se rotula porque no es lo mismo la portada —que el
// administrador eligió como imagen principal— que una foto que mandó un club
// para la galería, y quien elige la foto de una publicación quiere saberlo.
export const ASSET_ORIGINS = {
    hero: 'Portada de la campaña',
    gallery: 'Rotarios en acción',
    video: 'Carátula de video',
    partner: 'Aliado',
    social: 'Imagen para compartir',
    // v4.968 — lo que un club envió por el formulario público y el equipo
    // aprobó. No sale del contenido de la campaña sino de la bandeja de
    // solicitudes, así que lo agrega el controlador; se declara acá para que
    // el rótulo salga de un solo sitio.
    aporte: 'Aporte de un club',
};

const VIDEO_RE = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;

/**
 * Los archivos que la campaña ya tiene asociados, en el orden en que conviene
 * ofrecerlos: primero lo que el administrador eligió como principal, después lo
 * que mandaron los clubes.
 *
 * Devuelve URLs, no filas de `Media`: el vínculo con la Biblioteca lo resuelve
 * quien tenga base delante (`resolveAssetMedia` en el controlador). Acá no se
 * consulta nada — es lo que hace este archivo probable sin base.
 *
 * Los VIDEOS se marcan y no se descartan: el generador de publicaciones trabaja
 * sobre una fotografía, pero esconder los videos de la campaña haría creer que
 * no los tiene. Quien decide qué es elegible es `pickableAssets`.
 */
export function campaignAssets(rawContent) {
    const content = normalizeContent(rawContent);
    const out = [];
    const seen = new Set();

    const push = (url, origin, meta = {}) => {
        const u = str(url, 600);
        if (!u || seen.has(u)) return;
        seen.add(u);
        out.push({
            url: u,
            kind: VIDEO_RE.test(u) ? 'video' : 'image',
            origin,
            originLabel: ASSET_ORIGINS[origin] || origin,
            alt: str(meta.alt, 200),
            caption: str(meta.caption, 200),
            credit: str(meta.credit, 160),
        });
    };

    // La portada y sus diapositivas. `hero.image` se conserva aparte de
    // `hero.images` por la regla aditiva de `contributionSpec` — una campaña
    // guardada con una sola imagen sigue teniendo la suya.
    push(content.hero.image, 'hero', { alt: content.hero.imageAlt });
    for (const im of arr(content.hero.images)) push(im.url, 'hero', { alt: im.alt });

    // La galería «Rotarios en acción»: lo que mandaron los clubes, con su
    // pie y su crédito. Es la que más contexto textual trae, y por eso es la
    // que hace posible recomendar.
    for (const it of arr(content.gallery?.items)) {
        push(it.url, 'gallery', { alt: it.alt, caption: it.caption, credit: it.credit });
    }

    // Las carátulas de los videos de sección. Son fotografías reales de la
    // campaña aunque su video no sirva para un post.
    for (const v of arr(content.requiredItemsVideos)) push(v.poster, 'video', { caption: v.title });
    push(content.requiredItemsVideo?.poster, 'video', { caption: content.requiredItemsVideo?.title });

    push(content.seo?.ogImage, 'social', {});

    for (const p of arr(content.partners)) {
        if (p.active === false) continue;
        push(p.logo, 'partner', { caption: p.name });
    }

    return out;
}

/**
 * Lo que se puede elegir como fotografía de la publicación.
 *
 * Se excluyen los videos —el motor de imagen recibe una foto— y los logotipos
 * de aliados: un escudo institucional no es la fotografía de una publicación, y
 * ofrecerlo invita a publicar una pieza que se ve rota.
 */
export const pickableAssets = (assets) =>
    arr(assets).filter(a => a.kind === 'image' && a.origin !== 'partner');

/** El texto que acompaña a una foto, si lo tiene. */
export const describeAsset = (asset) => {
    if (!asset) return '';
    return [asset.caption, asset.alt, asset.credit ? `Aporta: ${asset.credit}` : '']
        .map(s => str(s, 200)).filter(Boolean).join(' · ');
};

/**
 * ¿Hay con qué recomendar?
 *
 * Recomendar sin metadata sería ordenar al azar y presentarlo como criterio.
 * Si ninguna foto tiene pie, alt ni crédito, el botón no se ofrece — un control
 * que no controla nada es peor que no tenerlo (v4.650).
 */
export const assetsHaveText = (assets) => pickableAssets(assets).some(a => !!describeAsset(a));

// ─── La veracidad ──────────────────────────────────────────────────────

/**
 * La cláusula para una campaña que NO es una emergencia.
 *
 * `EMERGENCY_FACT_CLAUSE` habla de un desastre real y de personas afectadas:
 * aplicada a una campaña de educación o de agua describe una situación que no
 * existe, y un modelo al que se le describe mal la situación escribe mal. Lo
 * que NO cambia entre las dos es la regla de fondo, y por eso el validador es
 * el mismo: ningún dato que no se haya suministrado.
 */
export const CONTRIBUTION_FACT_CLAUSE = `CONTEXTO INSTITUCIONAL REAL — REGLAS ABSOLUTAS SOBRE LOS DATOS:

Estás escribiendo a nombre de una organización sobre una iniciativa que existe de verdad. Su credibilidad depende de que no aparezca ni un solo dato que no te hayamos dado.

PROHIBIDO ESCRIBIR, bajo cualquier forma (número, palabra o aproximación):
- cantidad de beneficiarios, familias, personas atendidas o comunidades alcanzadas;
- dinero recaudado, invertido o necesitado, ni metas económicas;
- cantidad de entregas, jornadas, kits, viviendas, escuelas u horas de trabajo;
- nombres de ciudades, barrios, comunidades, clubes o aliados que no estén en los datos;
- fechas, plazos u horarios que no estén en los datos;
- resultados, logros o avances que no estén en los datos;
- cifras presentadas como oficiales, y frases como "según reportes" o "las autoridades informan".

Tampoco valen las aproximaciones vagas con forma de dato: "cientos de familias", "miles de personas", "la mayoría de la comunidad", "gran parte de la región". Son cifras disfrazadas.

QUÉ HACER EN SU LUGAR: hablá de lo que la iniciativa ES y de por qué importa, sin cuantificar.
- Correcto: "Familias de la región están recibiendo apoyo para volver a empezar."
- Correcto: "Cada aporte hace posible que este trabajo continúe."
- INCORRECTO: "Ya beneficiamos a más de 500 familias."
- INCORRECTO: "Recaudamos 20 millones para la causa."

TONO: humano, sobrio y agradecido. Se reconoce a quien participa; no se hace autoelogio institucional.
PROHIBIDO el sensacionalismo y las mayúsculas sostenidas.`;

/** Qué cláusula le toca a esta campaña. La decide su TIPO, no su nombre. */
export const factClauseFor = (campaignType) =>
    CAMPAIGN_TYPES[campaignType]?.emergency ? EMERGENCY_FACT_CLAUSE : CONTRIBUTION_FACT_CLAUSE;

/**
 * El universo de lo suministrado, para `validateEmergencyCopy`.
 *
 * El contexto adicional entra: lo que el usuario escribió es dato, no
 * invención. Sin eso, contar «entregamos 300 mercados» sería imposible aunque
 * quien lo escribe lo sepa de primera mano.
 */
export function waysFactContext({ content, stats = [], items = [], asset = null, additionalContext = '', url = '' } = {}) {
    const c = content || normalizeContent({});
    return {
        magnitude: stats.map(s => `${s.label} ${s.value}`).join(' | '),
        description: [
            c.hero?.title, c.hero?.subtitle, c.hero?.text, c.hero?.highlight,
            c.finalCta?.text, c.finalCta?.quote,
            ...arr(c.infoBlocks).filter(b => b.active !== false).map(b => `${b.title} ${b.text}`),
            normalizeAdditionalContext(additionalContext),
        ].filter(Boolean).join(' '),
        communities: [
            ...items.map(i => `${i.title} ${i.description || ''}`),
            describeAsset(asset),
        ].filter(Boolean).join(' '),
        eventDate: c.eventDate || '',
        location: c.location || '',
        customDisaster: '',
        customNeed: '',
        contactUrl: url || '',
    };
}

// ─── El brief ──────────────────────────────────────────────────────────

/**
 * El contexto ESTRUCTURADO que recibe el orquestador (punto 13 del pedido),
 * en la forma que este sitio ya usa: texto para el modelo, no JSON.
 *
 * Se declara explícitamente lo que NO se sabe. Es deliberado y es la capa 1 de
 * la defensa contra la invención.
 */
export function buildWaysBrief({
    campaign = {}, content = null, objective = DEFAULT_OBJECTIVE,
    audience = DEFAULT_AUDIENCE, language = DEFAULT_LANGUAGE,
    stats = [], items = [], asset = null, additionalContext = '',
    campaignUrl = '', clubName = '',
} = {}) {
    const c = content || normalizeContent(campaign.content);
    const obj = OBJECTIVES[objective] || OBJECTIVES[DEFAULT_OBJECTIVE];
    const aud = AUDIENCES[audience] || AUDIENCES[DEFAULT_AUDIENCE];
    const lang = LANGUAGES[language] || LANGUAGES[DEFAULT_LANGUAGE];
    const extra = normalizeAdditionalContext(additionalContext);

    const L = [];
    L.push('CAMPAÑA DE «MANERAS DE CONTRIBUIR» SOBRE LA QUE ESTÁS ESCRIBIENDO:');
    L.push(`  Nombre: «${campaign.name || c.hero.title || 'sin nombre'}».`);
    if (c.hero.title) L.push(`  Título publicado: «${c.hero.title}».`);
    if (c.hero.subtitle) L.push(`  Subtítulo: «${c.hero.subtitle}».`);
    if (c.hero.badge) L.push(`  Insignia: «${c.hero.badge}».`);
    if (c.hero.text) L.push(`  Descripción publicada: «${c.hero.text}».`);
    if (c.hero.highlight) L.push(`  Frase destacada: «${c.hero.highlight}».`);

    // Lugar y fecha del HECHO. Son campos propios de la campaña desde v4.833
    // justamente para no tener que deducirlos del texto.
    if (c.location) L.push(`  Lugar del hecho: ${c.location}. Podés nombrarlo.`);
    else L.push('  NO se conoce el lugar del hecho: no nombres ninguna ciudad, región ni país.');
    if (c.eventDate) L.push(`  Fecha del hecho: ${c.eventDate}. Podés nombrarla.`);
    else L.push('  NO se conoce la fecha del hecho: no la menciones ni la calcules.');

    if (stats.length) {
        L.push('  CIFRAS REGISTRADAS (con fuente — podés mencionarlas TAL CUAL, sin redondear ni proyectar):');
        for (const s of stats) L.push(`    · ${s.label}: ${s.value} — fuente ${s.source}${s.updatedAt ? `, corte ${s.updatedAt}` : ''}.`);
    } else {
        L.push('  La campaña NO tiene cifras registradas. No inventes ninguna, en ninguna forma.');
    }

    if (items.length) {
        L.push('  QUÉ SE NECESITA (registrado en la campaña):');
        for (const it of items) L.push(`    · ${it.title}${it.description ? ` — ${it.description}` : ''}`);
    } else {
        L.push('  La campaña no enumera elementos necesarios. No inventes ninguno.');
    }

    const ways = arr(c.waysToHelp).filter(w => w.active !== false && w.title);
    if (ways.length) {
        L.push(`  MANERAS DE CONTRIBUIR QUE LA CAMPAÑA OFRECE: ${ways.map(w => w.title).join('; ')}.`);
        L.push('  Contribuir NO es solamente donar dinero: nombrá la manera que corresponda al objetivo de esta publicación.');
    }

    const infos = arr(c.infoBlocks).filter(b => b.active !== false && (b.title || b.text));
    for (const b of infos) L.push(`  Información institucional — «${b.title}»: ${b.text}`);

    if (c.finalCta?.quote) L.push(`  Frase institucional de la campaña: «${c.finalCta.quote}».`);
    if (c.finalCta?.text) L.push(`  Cierre publicado: «${c.finalCta.text}».`);

    const partners = arr(c.partners).filter(p => p.active !== false && p.name);
    if (partners.length) L.push(`  ALIADOS de la campaña: ${partners.map(p => p.name).join(', ')}. No nombres ningún otro.`);

    if (campaignUrl) L.push(`  Página de la campaña: ${campaignUrl}. Es el ÚNICO enlace que podés mencionar.`);
    else L.push('  NO hay enlace de campaña disponible: no inventes ninguna dirección web.');

    if (clubName) L.push(`  Publica: ${clubName}.`);

    L.push('');
    L.push('LA FOTOGRAFÍA DE ESTA PUBLICACIÓN:');
    if (asset) {
        const d = describeAsset(asset);
        L.push(`  Procedencia: ${asset.originLabel || 'Biblioteca del sitio'}.`);
        if (d) L.push(`  Lo que la campaña dice de ella: «${d}».`);
        else L.push('  La campaña no guarda ninguna descripción de esta fotografía.');
        // ── Lo que contó quien la envió (v4.968) ────────────────────
        //
        // Cuando la fotografía llegó por el formulario público de aportes, su
        // historia viaja con ella. Es la fuente de contexto MÁS FUERTE que
        // tiene este brief —la escribió alguien que estuvo ahí— y es lo único
        // que permite nombrar el club, el lugar y lo que se hizo sin deducirlo
        // de los píxeles.
        if (asset.submissionContext) {
            L.push('  ESTA FOTOGRAFÍA LA ENVIÓ UN CLUB CON SU HISTORIA:');
            for (const linea of String(asset.submissionContext).split('\n')) L.push(`    ${linea}`);
        }
        L.push('  Mirala, pero NO la describas literalmente ni afirmes hechos que sólo estás deduciendo de ella: cuántas personas hay, qué se está entregando o dónde fue tomada no son datos hasta que estén escritos más arriba.');
    } else {
        L.push('  No hay información registrada sobre la fotografía. No afirmes nada sobre lo que se ve en ella.');
    }

    L.push('');
    L.push('CONTEXTO ADICIONAL DE QUIEN PUBLICA:');
    L.push(extra ? `  «${extra}»` : `  ${DEFAULT_CONTEXT_NOTE}`);
    if (extra) {
        L.push('  Esto es lo que quien publica quiere destacar y es información suministrada: podés usarla y nombrarla. Lo que NO esté acá ni más arriba, no existe.');
    }

    L.push('');
    L.push(`OBJETIVO DE ESTA PUBLICACIÓN: ${obj.label} — tono ${obj.tone}, foco ${obj.focus}.`);
    L.push(`AUDIENCIA: ${aud.frame}`);
    L.push(`IDIOMA DE SALIDA: ${lang.name}. Escribí TODO en ese idioma.`);
    L.push('Los nombres propios, las instituciones, las ciudades, las URLs y las cifras se escriben tal cual: no se traducen ni se adaptan.');
    L.push('NO todas las publicaciones piden dinero. Si el objetivo no es recaudar, no pidas donaciones: mostrá el impacto, agradecé, explicá la necesidad o invitá a participar, según el objetivo.');

    return L.join('\n');
}

// ─── La recomendación de contenido ─────────────────────────────────────
//
// EL MODELO PROPONE, EL CÓDIGO DECIDE. Se le pasan los PIES de las fotos —no
// las fotos: mirar veinticuatro imágenes son veinticuatro llamadas de visión
// por recomendación— y contesta índices. Cualquier índice que no exista se
// descarta, así que una respuesta inventada no puede elegir una foto que no
// está. Es el mismo criterio que las intenciones del CRM y los iconos de la
// varita: catálogo CERRADO.
//
// Y por eso la pantalla lo DICE: recomienda leyendo lo que la campaña escribió
// de cada foto, no mirándolas. Afirmar lo segundo sería prometer una búsqueda
// semántica que la Biblioteca no tiene.

export const RECOMMEND_MAX = 6;

export function buildRecommendPrompt({ assets = [], additionalContext = '', campaignName = '', objectiveLabel = '' } = {}) {
    const list = pickableAssets(assets);
    const L = [];
    L.push(`Campaña: «${campaignName || 'sin nombre'}».`);
    if (objectiveLabel) L.push(`Objetivo de la publicación: ${objectiveLabel}.`);
    L.push(additionalContext
        ? `Lo que se quiere destacar: «${normalizeAdditionalContext(additionalContext)}».`
        : 'No se indicó qué destacar: elegí las fotografías más representativas de la campaña.');
    L.push('');
    L.push('FOTOGRAFÍAS DISPONIBLES (índice — descripción registrada):');
    list.forEach((a, i) => {
        L.push(`  ${i}. [${a.originLabel}] ${describeAsset(a) || 'sin descripción registrada'}`);
    });
    L.push('');
    L.push(`Elegí hasta ${RECOMMEND_MAX} y ordenalas de más a menos relevante. Sólo podés usar los índices de la lista.`);
    L.push('Si ninguna descripción se relaciona con lo que se quiere destacar, devolvé la lista vacía en vez de elegir al azar.');
    L.push('Devolvé este JSON exacto: {"picks":[{"index":0,"reason":"…"}]}');
    return L.join('\n');
}

/**
 * Lee lo que contestó el modelo. Nunca lanza: una recomendación es una
 * comodidad y un fallo suyo no puede impedir elegir la foto a mano.
 */
export function parseRecommendation(raw, assetCount) {
    let data = raw;
    if (typeof raw === 'string') {
        try { data = JSON.parse(raw); } catch { return []; }
    }
    const picks = arr(data?.picks);
    const out = [];
    const seen = new Set();
    for (const p of picks) {
        const i = Number(p?.index);
        if (!Number.isInteger(i) || i < 0 || i >= assetCount) continue;  // catálogo CERRADO
        if (seen.has(i)) continue;
        seen.add(i);
        out.push({ index: i, reason: str(p?.reason, 160) });
        if (out.length >= RECOMMEND_MAX) break;
    }
    return out;
}

/** Los catálogos que la pantalla necesita, sin que arme ninguna lista propia. */
export const waysObjectiveCatalog = () => Object.keys(OBJECTIVES).map(id => ({
    id, label: OBJECTIVES[id].label, help: OBJECTIVES[id].help,
}));

export default {
    WAYS_TYPE_ID, WAYS_TYPE_LABEL, MAX_ADDITIONAL_CONTEXT, DEFAULT_CONTEXT_NOTE,
    ASSET_ORIGINS, campaignAssets, pickableAssets, describeAsset, assetsHaveText,
    CONTRIBUTION_FACT_CLAUSE, factClauseFor, waysFactContext, buildWaysBrief,
    buildRecommendPrompt, parseRecommendation, RECOMMEND_MAX, waysObjectiveCatalog,
    normalizeAdditionalContext,
};
