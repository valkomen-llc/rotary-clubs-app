// ════════════════════════════════════════════════════════════════════
// Infografías de Campaña — el CRITERIO
// v4.833.0
//
// El preset «Maneras de Contribuir» del Generador de Publicaciones convierte
// una campaña de contribución en una pieza para redes. Este archivo es PURO:
// sin base, sin red, sin IA, sin DOM. Decide qué objetivos existen, qué
// indicadores se pueden publicar, qué layout le toca a cada combinación y qué
// le falta a una campaña para poder generar.
//
// Vive aparte por el mismo motivo que `seoRules.js` lejos de `seoAudit.js` y
// que `reelSpec.js` lejos de `reelController.js`: un motor que sólo se puede
// ejercitar contra una base real termina sin pruebas.
//
// ── LA DECISIÓN DE FONDO: SE COMPONE, NO SE GENERA ──────────────────
//
// El Generador de Publicaciones regenera la FOTOGRAFÍA con un modelo de
// imagen. Eso no sirve acá y no es una preferencia estética:
//
//   · La regla #1 del sitio prohíbe postprocesar la salida de un modelo —el
//     equipo rechazó dos veces el composite con las palabras «se ve overlay /
//     montaje»—, así que no se puede dibujar el texto encima.
//   · Pedirle al modelo que ESCRIBA las cifras tampoco: `designCompose.js` ya
//     lo dejó documentado —los modelos generativos no escriben texto de forma
//     fiable— y cuando un número sale deformado no hay salida limpia.
//
// Por eso la pieza se compone con el grafo de escena de Plantillas IA, que es
// determinista: cada cifra se dibuja donde se declaró y dice lo que dice la
// campaña. Este archivo produce las VARIABLES; `campaignTemplates.js` pone los
// nodos; `designSpec.js` compila y `designRender.ts` exporta. No hay un segundo
// camino de maquetación, que es la regla del módulo que se reutiliza.
//
// ── LA VERACIDAD NO SE PIDE: SE FILTRA ──────────────────────────────
//
// `publishableStats` es la única puerta por la que un indicador llega a una
// pieza, y exige lo mismo que `validateStats` al publicar la campaña: etiqueta,
// valor, FUENTE y fecha. Un indicador sin fuente no se muestra aunque esté
// guardado y activo — igual que `resolveForSite` hace con la página pública.
// El modelo escribe el copy; las CIFRAS no las escribe nunca.
// ════════════════════════════════════════════════════════════════════

import { normalizeContent, normalizeStats, normalizeCenters, groupCenters } from './contributionSpec.js';

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const arr = (v) => (Array.isArray(v) ? v : []);

// ─── Objetivo de la pieza ──────────────────────────────────────────────
//
// Qué se quiere lograr con ESTA publicación. No es el tipo de campaña —una
// misma emergencia necesita una pieza que sensibilice, otra que pida aportes y
// otra que diga dónde llevar la ropa—.
//
// `needs` es lo que el objetivo EXIGE para tener sentido: sin eso, la pieza
// saldría vacía y es mejor decirlo antes de generar (`validateBeforeGenerate`)
// que entregar un recuadro en blanco.
export const OBJECTIVES = {
    sensibilizacion: {
        id: 'sensibilizacion',
        label: 'Sensibilización',
        help: 'Contexto, impacto humano y un llamado a la acción.',
        needs: [],
        layout: 'emergencia_cta',
        tone: 'sobrio, empático y movilizador',
        focus: 'qué está pasando y por qué importa actuar ahora',
    },
    recaudacion: {
        id: 'recaudacion',
        label: 'Recaudación',
        help: 'El aporte económico manda; el resto acompaña.',
        needs: ['donationCta'],
        layout: 'emergencia_cta',
        tone: 'directo, transparente y agradecido',
        focus: 'que aportar es concreto, seguro y hace una diferencia medible',
    },
    ayuda_humanitaria: {
        id: 'ayuda_humanitaria',
        label: 'Ayuda humanitaria',
        help: 'Qué elementos se necesitan, con su detalle.',
        needs: ['requiredItems'],
        layout: 'elementos_requeridos',
        tone: 'concreto y práctico',
        focus: 'exactamente qué se necesita y para quién',
    },
    panorama: {
        id: 'panorama',
        label: 'Panorama de la emergencia',
        help: 'Las cifras con su fuente, en primer plano.',
        needs: ['stats'],
        layout: 'impacto_estadistico',
        tone: 'factual, sobrio, sin adjetivar la tragedia',
        focus: 'la magnitud de lo ocurrido según las fuentes registradas',
    },
    centros: {
        id: 'centros',
        label: 'Centros de acopio',
        help: 'Dónde llevar lo que se dona.',
        needs: ['centers'],
        layout: 'centros_acopio',
        tone: 'práctico y hospitalario',
        focus: 'que acercarse a dejar una donación es fácil y está organizado',
    },
    impacto: {
        id: 'impacto',
        label: 'Impacto de la campaña',
        help: 'Lo que ya se logró, con sus aliados.',
        needs: ['stats'],
        layout: 'resultados',
        tone: 'agradecido y sobrio, sin autoelogio',
        focus: 'lo que la respuesta colectiva ya consiguió, y que sigue haciendo falta',
    },
};

export const DEFAULT_OBJECTIVE = 'sensibilizacion';
export const OBJECTIVE_IDS = Object.keys(OBJECTIVES);
export const objectiveCatalog = () => OBJECTIVE_IDS.map(id => ({
    id, label: OBJECTIVES[id].label, help: OBJECTIVES[id].help, needs: OBJECTIVES[id].needs,
}));

// ─── Audiencia ─────────────────────────────────────────────────────────
//
// A quién se le habla. Cambia el ENCUADRE del copy, no los datos: la comunidad
// rotaria internacional necesita saber dónde queda el lugar y qué es el
// Distrito; el público local ya lo sabe y decirlo suena a folleto.
export const AUDIENCES = {
    local: {
        id: 'local',
        label: 'Comunidad local',
        help: 'Quien vive cerca y puede acercarse a un punto de acopio.',
        frame: 'Le hablás a la comunidad local, que conoce el lugar y la institución. No hace falta explicar dónde queda ni qué es Rotary.',
    },
    internacional: {
        id: 'internacional',
        label: 'Comunidad rotaria internacional',
        help: 'Clubes, distritos, socios, fundaciones y aliados de otros países.',
        frame: 'Le hablás a clubes rotarios, distritos, socios, fundaciones y organizaciones humanitarias de OTROS países. Situá el lugar en su país y nombrá al Distrito, porque quien lee puede no saber dónde queda. El tono es institucional y creíble: sos una organización pidiendo apoyo a sus pares, no una campaña publicitaria.',
    },
};

export const DEFAULT_AUDIENCE = 'local';
export const AUDIENCE_IDS = Object.keys(AUDIENCES);
export const audienceCatalog = () => AUDIENCE_IDS.map(id => ({
    id, label: AUDIENCES[id].label, help: AUDIENCES[id].help,
}));

// ─── Idioma ────────────────────────────────────────────────────────────
//
// El traductor del sitio trabaja sobre el DOM ya pintado y guarda el resultado.
// Una pieza exportada a canvas lleva el texto HORNEADO: ni el traductor ni
// `data-no-translate` la alcanzan nunca. Por eso el idioma se resuelve al
// GENERAR EL COPY, pidiéndoselo al modelo, y las cosas que no se traducen
// —nombres propios, cifras, ciudades, instituciones, URLs— se protegen ahí.
//
// La lista queda abierta a más idiomas: agregar uno es una entrada más.
export const LANGUAGES = {
    es: { id: 'es', label: 'Español', name: 'español latinoamericano neutro' },
    en: { id: 'en', label: 'Inglés', name: 'English (international)' },
};

export const DEFAULT_LANGUAGE = 'es';
export const LANGUAGE_IDS = Object.keys(LANGUAGES);
export const languageCatalog = () => LANGUAGE_IDS.map(id => ({ id, label: LANGUAGES[id].label }));

// ─── Formatos ──────────────────────────────────────────────────────────
//
// Los dos que pidió el cliente y NADA MÁS con este preset: un formato
// arbitrario obligaría a rehacer los layouts, y una pieza que no encaja en el
// feed no sirve. Son los ids de `designSpec.FORMATS`.
export const FORMAT_IDS = ['post_1_1', 'post_4_5'];
export const DEFAULT_FORMAT_ID = 'post_1_1';
export const isCampaignFormat = (id) => FORMAT_IDS.includes(id);

// ─── Presets de layout ─────────────────────────────────────────────────
//
// Cuánta información aguanta cada composición. `maxStats` no es un gusto: es
// cuántos indicadores caben LEGIBLES en ese lienzo, y por encima de ese número
// el texto se achica hasta dejar de leerse — que es exactamente lo que
// `autoFit` avisa con `overflow` cuando ya es tarde.
//
// El 1:1 aguanta menos que el 4:5 con el mismo diseño: es el mismo ancho con
// menos alto, así que lo que se recorta es la cantidad de bloques, no su
// tamaño.
export const LAYOUTS = {
    impacto_estadistico: {
        id: 'impacto_estadistico',
        label: 'Impacto estadístico',
        summary: 'Las cifras mandan, con su fuente debajo.',
        maxStats: { post_1_1: 3, post_4_5: 4 },
        maxItems: 0,
        maxCities: 0,
        wantsImage: true,
    },
    emergencia_cta: {
        id: 'emergencia_cta',
        label: 'Emergencia + llamado',
        summary: 'Título fuerte, fotografía, dos cifras y el botón.',
        maxStats: { post_1_1: 2, post_4_5: 3 },
        maxItems: 0,
        maxCities: 0,
        wantsImage: true,
    },
    elementos_requeridos: {
        id: 'elementos_requeridos',
        label: 'Elementos que se requieren',
        summary: 'La lista de lo que se necesita, con su detalle.',
        maxStats: { post_1_1: 0, post_4_5: 2 },
        maxItems: { post_1_1: 4, post_4_5: 6 },
        maxCities: 0,
        wantsImage: false,
    },
    // v4.835. La densidad de esta composición es la que pidió el cliente: en
    // 1:1 se RESUME por ciudad y en 4:5 caben las direcciones. Meter ocho
    // direcciones en un cuadrado achicando el texto produce una pieza que no
    // se puede leer en un teléfono, que es donde se mira.
    centros_acopio: {
        id: 'centros_acopio',
        label: 'Centros de acopio',
        summary: 'Dónde llevar la donación: por ciudad en 1:1, con dirección en 4:5.',
        maxStats: 0,
        maxItems: 0,
        maxCities: { post_1_1: 5, post_4_5: 3 },
        // En 4:5 cada ciudad muestra además sus direcciones.
        maxCenters: { post_1_1: 0, post_4_5: 6 },
        wantsImage: false,
    },
    resultados: {
        id: 'resultados',
        label: 'Impacto de la campaña',
        summary: 'Lo logrado, con la frase institucional y los aliados.',
        maxStats: { post_1_1: 3, post_4_5: 4 },
        maxItems: 0,
        maxCities: 0,
        maxPartners: { post_1_1: 4, post_4_5: 5 },
        wantsImage: true,
    },
};

export const LAYOUT_IDS = Object.keys(LAYOUTS);
export const layoutCatalog = () => LAYOUT_IDS.map(id => ({
    id, label: LAYOUTS[id].label, summary: LAYOUTS[id].summary,
}));

/** Cuántos elementos de una clase entran en ese layout y ese formato. Un
 *  `maxX` puede ser un número (igual en los dos formatos) o un mapa. */
export const capacityOf = (layoutId, formatId, key = 'maxStats') => {
    const l = LAYOUTS[layoutId];
    if (!l) return 0;
    const v = l[key];
    if (typeof v === 'number') return v;
    return Number(v?.[formatId] ?? 0);
};

/**
 * Qué layout le toca a esta pieza.
 *
 * Manda lo que el USUARIO haya elegido —igual que en el Creador de Reels, donde
 * la preferencia explícita gana sobre el director—; si no eligió, lo decide el
 * objetivo. Y si el layout elegido no puede pintar lo que hay —pedir
 * «elementos requeridos» sin elementos—, se dice en `notes` y se cae al que sí
 * puede, en vez de entregar una pieza con un hueco.
 */
export const pickLayout = ({ objective, requested = null, formatId = DEFAULT_FORMAT_ID, stats = [], items = [], cities = 0 } = {}) => {
    const notes = [];
    const obj = OBJECTIVES[objective] || OBJECTIVES[DEFAULT_OBJECTIVE];
    let id = LAYOUTS[requested] ? requested : obj.layout;

    if (id === 'elementos_requeridos' && !items.length) {
        notes.push('La campaña no tiene elementos requeridos activos: se usa la composición de emergencia.');
        id = 'emergencia_cta';
    }
    if (id === 'impacto_estadistico' && !stats.length) {
        notes.push('No hay indicadores publicables: se usa la composición de emergencia.');
        id = 'emergencia_cta';
    }
    if (id === 'resultados' && !stats.length) {
        notes.push('No hay indicadores publicables: se usa la composición de emergencia.');
        id = 'emergencia_cta';
    }
    if (id === 'centros_acopio' && !cities) {
        notes.push('La campaña no tiene centros publicados: se usa la composición de emergencia.');
        id = 'emergencia_cta';
    }
    return { id, layout: LAYOUTS[id], notes, capacity: capacityOf(id, formatId) };
};

// ─── Qué indicadores pueden salir en una pieza ─────────────────────────
//
// La misma exigencia que `validateStats` impone al publicar la campaña:
// etiqueta, valor, FUENTE y fecha. Un indicador activo sin fuente no viaja a la
// página pública (`resolveForSite`) y tampoco puede viajar a una pieza — sería
// publicar una cifra que nadie puede verificar, firmada por una institución.
//
// Devuelve TAMBIÉN los descartados y por qué: un filtro silencioso deja al
// usuario mirando una pieza sin la cifra que esperaba y sin saber qué le falta
// a su campaña.
export function publishableStats(rawStats) {
    const ok = [];
    const skipped = [];
    for (const s of normalizeStats(rawStats)) {
        if (!s.active) continue;                       // retirado a propósito, no es un defecto
        if (!s.label || !s.value) { skipped.push({ id: s.id, label: s.label || s.id, reason: 'le falta etiqueta o valor' }); continue; }
        if (!s.source) { skipped.push({ id: s.id, label: s.label, reason: 'no tiene fuente registrada' }); continue; }
        if (!s.updatedAt || Number.isNaN(new Date(s.updatedAt).getTime())) {
            skipped.push({ id: s.id, label: s.label, reason: 'no tiene fecha de actualización válida' });
            continue;
        }
        ok.push(s);
    }
    return { stats: ok, skipped };
}

/** Los que el usuario marcó, en el orden de la campaña y acotados a lo que
 *  entra. Sin selección se toman los primeros — que es el orden en que el
 *  administrador los dejó, no un ranking inventado. */
export function chooseStats(publishable, selectedIds, capacity) {
    const wanted = arr(selectedIds).map(id => String(id));
    const pool = wanted.length ? publishable.filter(s => wanted.includes(s.id)) : publishable;
    return pool.slice(0, Math.max(0, capacity));
}

// ─── Elementos requeridos y centros ────────────────────────────────────

export function activeItems(content) {
    return arr(content?.requiredItems).filter(it => it.active !== false && it.title);
}

/**
 * Los centros, resumidos por CIUDAD. Es lo que hace que quepan: en 1:1 no
 * entran ocho direcciones legibles, y meterlas achicando el texto produce una
 * pieza que no se puede leer en un teléfono — el defecto que este layout existe
 * para evitar. El detalle completo vive en la landing, que es donde se puede
 * mostrar entero y actualizar sin regenerar nada.
 */
export function centerSummary(centers, capacity) {
    // `normalizeCenters` devuelve `{ centers, skipped }` — pasarle el objeto
    // entero a `groupCenters` daría cero ciudades en silencio.
    const cities = groupCenters(normalizeCenters(centers).centers);
    const countOf = (g) => (g.groups || []).reduce((n, grp) => n + (grp.centers?.length || 0), 0);
    const total = cities.reduce((n, g) => n + countOf(g), 0);
    const shown = cities.slice(0, Math.max(0, capacity));
    return {
        cities: shown.map(g => ({ city: g.city, count: countOf(g) })),
        total,
        hidden: Math.max(0, cities.length - shown.length),
    };
}

/**
 * Los centros CON su dirección, para el formato que tiene sitio.
 *
 * El resumen por ciudad (`centerSummary`) es lo que cabe en un cuadrado; en
 * vertical entran las direcciones, que es lo que de verdad hace falta para ir
 * a dejar algo. Se acota a `capacity` y se dice cuántos quedaron fuera: una
 * lista recortada en silencio hace creer que ésos son todos los puntos.
 */
export function centerDetail(centers, capacity) {
    const cities = groupCenters(normalizeCenters(centers).centers);
    const flat = [];
    for (const c of cities) {
        for (const g of c.groups || []) {
            for (const center of g.centers || []) {
                flat.push({
                    city: c.city,
                    name: center.name || '',
                    address: center.address,
                    schedule: center.schedule || '',
                });
            }
        }
    }
    const shown = flat.slice(0, Math.max(0, capacity));
    return { centers: shown, total: flat.length, hidden: Math.max(0, flat.length - shown.length) };
}

/** Los aliados con logotipo, que es lo único que la pieza puede dibujar. Un
 *  aliado sin logo no se nombra en texto: la franja es de escudos y una
 *  mezcla de escudos y nombres sueltos se lee como un error. */
export function activePartners(content, capacity) {
    return arr(content?.partners)
        .filter(p => p?.active !== false && p?.logo)
        .slice(0, Math.max(0, capacity));
}

// ─── Validación ANTES de generar ───────────────────────────────────────
//
// Lo que pide el encargo: comprobar campaña, datos, cifras con fuente, imagen,
// CTA, URL y formato ANTES de producir. Se separa en `errors` —no se puede
// generar— y `warnings` —se puede, y hay que decirlo—, porque tratarlos igual
// convierte cualquier aviso en un bloqueo y el usuario deja de leerlos.
export function validateBeforeGenerate({ campaign, objective, formatId, layoutId, imageUrl, stats, centerCount = null } = {}) {
    const errors = [];
    const warnings = [];

    if (!campaign?.id) errors.push('No hay campaña seleccionada.');
    const content = normalizeContent(campaign?.content);
    const obj = OBJECTIVES[objective] || OBJECTIVES[DEFAULT_OBJECTIVE];

    if (!isCampaignFormat(formatId)) {
        errors.push('El formato no es uno de los dos de este preset (1080×1080 o 1080×1350).');
    }
    if (layoutId && !LAYOUTS[layoutId]) errors.push('La composición elegida no existe.');

    if (!content.hero.title) errors.push('La campaña no tiene título: es lo que encabeza la pieza.');

    const { stats: publishable, skipped } = publishableStats(campaign?.stats);
    const chosen = arr(stats).length ? arr(stats) : publishable;

    for (const need of obj.needs) {
        if (need === 'stats' && !publishable.length) {
            errors.push('Este objetivo muestra cifras y la campaña no tiene ningún indicador publicable (con etiqueta, valor, fuente y fecha).');
        }
        if (need === 'requiredItems' && !activeItems(content).length) {
            errors.push('Este objetivo muestra los elementos que se requieren y la campaña no tiene ninguno activo.');
        }
        if (need === 'donationCta' && !content.hero.ctaPrimary?.label && !content.donateCard?.buttonText) {
            warnings.push('La campaña no declara un botón de aporte: la pieza va a usar el llamado genérico.');
        }
        // v4.835. Los centros NO viajan en la campaña: viven en su propia
        // tabla y los cuenta quien llama. Sin ese dato no se puede juzgar acá
        // —y decidir por omisión que «no hay» bloquearía una campaña que sí
        // los tiene—, así que sólo se comprueba cuando se suministra.
        if (need === 'centers' && Number.isFinite(centerCount) && centerCount <= 0) {
            errors.push('Este objetivo muestra los centros de acopio y la campaña no tiene ninguno publicado.');
        }
    }

    for (const s of skipped) {
        warnings.push(`El indicador «${s.label}» no se puede publicar porque ${s.reason}.`);
    }
    if (!imageUrl && LAYOUTS[layoutId || obj.layout]?.wantsImage) {
        warnings.push('Sin fotografía, la composición deja ese espacio al color de la campaña.');
    }
    if (chosen.length > capacityOf(layoutId || obj.layout, formatId)) {
        warnings.push(`Esta composición muestra ${capacityOf(layoutId || obj.layout, formatId)} indicadores; el resto no entra y no se dibuja.`);
    }

    return { ok: errors.length === 0, errors, warnings };
}

// ─── El carrusel ───────────────────────────────────────────────────────
//
// Una campaña de emergencia tiene más información de la que entra en una
// pieza. El carrusel la reparte en varias, cada una con su objetivo, y las
// deja en el ORDEN en que se leen: qué pasó, qué tan grave es, qué se necesita,
// dónde llevarlo y cómo aportar.
//
// Es el mismo arco que la landing (v4.828): contexto → magnitud → cómo ayudo →
// dónde. Repetirlo acá no es casualidad — quien ve el carrusel y quien entra a
// la página tienen que encontrarse lo mismo en el mismo orden.
export const CAROUSEL_SLIDES = ['sensibilizacion', 'panorama', 'ayuda_humanitaria', 'centros', 'recaudacion'];

/** El tope de diapositivas. Instagram admite diez; cinco es lo que una campaña
 *  puede llenar con datos REALES sin repetirse, que es el límite que importa. */
export const CAROUSEL_MAX = 5;

/**
 * Qué diapositivas puede llenar ESTA campaña, en orden.
 *
 * Una que no tiene datos se SALTA y se dice por qué: entregar una diapositiva
 * vacía en medio de un carrusel es peor que entregar una menos, y sin el
 * motivo el usuario no sabe qué cargarle a su campaña para recuperarla.
 */
export function planCarousel({ campaign, formatId = DEFAULT_FORMAT_ID, centerCount = null } = {}) {
    const slides = [];
    const skipped = [];
    for (const objective of CAROUSEL_SLIDES) {
        const check = validateBeforeGenerate({ campaign, objective, formatId, centerCount });
        if (check.ok) slides.push({ objective, label: OBJECTIVES[objective].label });
        else skipped.push({ objective, label: OBJECTIVES[objective].label, reason: check.errors[0] || 'no hay datos' });
        if (slides.length >= CAROUSEL_MAX) break;
    }
    return { slides, skipped };
}

// ─── El brief para el modelo ───────────────────────────────────────────
//
// SÓLO entra lo que la campaña tiene guardado, y lo que NO se sabe se dice
// explícitamente — un hueco en silencio es una invitación a completarlo. Es la
// misma construcción de `buildEmergencyBrief` y por el mismo motivo.
//
// Las CIFRAS van en el brief como referencia de lo que la pieza va a mostrar,
// no para que el modelo las escriba: las dibuja la plantilla. Se las damos para
// que el texto no contradiga lo que está viendo el lector.
export function buildCampaignBrief({ campaign, objective, audience, language, stats = [], items = [], centers = null } = {}) {
    const content = normalizeContent(campaign?.content);
    const obj = OBJECTIVES[objective] || OBJECTIVES[DEFAULT_OBJECTIVE];
    const aud = AUDIENCES[audience] || AUDIENCES[DEFAULT_AUDIENCE];
    const lang = LANGUAGES[language] || LANGUAGES[DEFAULT_LANGUAGE];

    const L = [];
    L.push(`CAMPAÑA: «${campaign?.name || content.hero.title}».`);
    if (content.hero.title) L.push(`Título publicado: «${content.hero.title}».`);
    if (content.hero.subtitle) L.push(`Subtítulo: «${content.hero.subtitle}».`);
    if (content.hero.badge) L.push(`Insignia: «${content.hero.badge}».`);
    if (content.hero.text) L.push(`Descripción publicada: «${content.hero.text}».`);

    // Ubicación y fecha del HECHO. Son campos propios desde v4.833 justamente
    // para no tener que deducirlos del texto: adivinar una ciudad o una fecha
    // en una pieza institucional es lo que la regla de veracidad prohíbe.
    if (content.location) L.push(`Lugar del hecho: ${content.location}.`);
    else L.push('NO se conoce el lugar exacto del hecho: no lo nombres.');
    if (content.eventDate) L.push(`Fecha del hecho: ${content.eventDate}.`);
    else L.push('NO se conoce la fecha del hecho: no la menciones ni la calcules.');

    if (stats.length) {
        L.push('CIFRAS QUE LA PIEZA VA A MOSTRAR (dibujadas por la plantilla — NO las escribas en el texto, pero no las contradigas):');
        for (const s of stats) L.push(`  · ${s.label}: ${s.value} — fuente ${s.source}${s.updatedAt ? `, corte ${s.updatedAt}` : ''}.`);
    } else {
        L.push('La pieza NO muestra cifras. No inventes ninguna.');
    }

    if (items.length) {
        L.push(`ELEMENTOS QUE SE NECESITAN: ${items.map(i => i.title).join('; ')}.`);
    }
    if (centers?.total) {
        L.push(`Hay ${centers.total} puntos de acopio en ${centers.cities.length} ciudad(es): ${centers.cities.map(c => c.city).join(', ')}.`);
    }
    if (content.finalCta?.quote) L.push(`Frase institucional de la campaña: «${content.finalCta.quote}».`);

    L.push(`OBJETIVO DE ESTA PUBLICACIÓN: ${obj.label} — tono ${obj.tone}, foco ${obj.focus}.`);
    L.push(`AUDIENCIA: ${aud.frame}`);
    L.push(`IDIOMA DE SALIDA: ${lang.name}. Escribí TODO en ese idioma.`);
    L.push('Los nombres propios, las instituciones, las ciudades, las URLs y las cifras se escriben tal cual: no se traducen ni se adaptan.');

    return L.join('\n');
}

// ─── Las variables que consume la plantilla ────────────────────────────
//
// La frontera entre la campaña y el grafo de escena. Todo lo que la pieza
// dibuja sale de acá; la plantilla sólo dice DÓNDE va cada cosa.
export function buildVariables({ campaign, copy = {}, stats = [], items = [], centers = null, partners = [], imageUrl = '', logoUrl = '', qrUrl = '' } = {}) {
    const content = normalizeContent(campaign?.content);
    const v = {
        titulo: str(copy.headline, 90) || str(content.hero.title, 90),
        subtitulo: str(copy.subheadline, 140) || str(content.hero.subtitle, 140),
        contexto: str(copy.context, 320),
        insignia: str(copy.badge, 48) || str(content.hero.badge, 48),
        cta: str(copy.cta, 44),
        cierre: str(copy.closing, 120),
        url: str(copy.url, 120),
        imagen: str(imageUrl, 600),
        logo: str(logoUrl, 600),
        qr: str(qrUrl, 600),
    };
    // Los indicadores viajan numerados porque la plantilla es DATO: un nodo por
    // posición. Sin numerar habría que generar nodos al vuelo, que es
    // exactamente el motor de maquetación reactiva que el módulo no tiene.
    stats.forEach((s, i) => {
        v[`cifra${i + 1}`] = str(s.value, 24);
        v[`cifra${i + 1}_label`] = str(s.label, 60);
        v[`cifra${i + 1}_fuente`] = str(s.source, 80);
    });
    items.forEach((it, i) => {
        v[`elemento${i + 1}`] = str(it.title, 60);
        v[`elemento${i + 1}_detalle`] = str(it.description, 90);
    });
    (centers?.cities || []).forEach((c, i) => {
        v[`ciudad${i + 1}`] = str(c.city, 40);
        v[`ciudad${i + 1}_puntos`] = c.count ? `${c.count} punto${c.count === 1 ? '' : 's'}` : '';
    });
    (centers?.centers || []).forEach((c, i) => {
        v[`centro${i + 1}`] = str(c.name || c.city, 60);
        v[`centro${i + 1}_dir`] = [str(c.address, 90), str(c.city, 40)].filter(Boolean).join(' · ');
        v[`centro${i + 1}_horario`] = str(c.schedule, 60);
    });
    // Cuántos puntos hay en total. Va SIEMPRE que haya centros, aunque la
    // pieza muestre menos: recortar en silencio haría creer que ésos son
    // todos, y quien vive en otra ciudad se quedaría sin buscar.
    if (centers?.total) {
        v.centros_total = centers.hidden
            ? `y ${centers.hidden} punto${centers.hidden === 1 ? '' : 's'} más en la página`
            : `${centers.total} punto${centers.total === 1 ? '' : 's'} de acopio`;
    }
    (partners || []).forEach((p, i) => { v[`aliado${i + 1}`] = str(p.logo, 600); });
    // La fecha de corte de lo que se muestra. Es un dato de la pieza, no del
    // copy: quien la vea tiene que poder saber a cuándo corresponden las cifras
    // sin ir a buscarlo.
    v.corte = str(latestCut(stats), 40);
    return v;
}

/** El corte más reciente de los indicadores que se muestran. */
export function latestCut(stats) {
    let best = null;
    for (const s of arr(stats)) {
        const t = new Date(s?.updatedAt).getTime();
        if (Number.isNaN(t)) continue;
        if (best === null || t > best) best = t;
    }
    if (best === null) return '';
    const d = new Date(best);
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

/** La dirección pública de la campaña, que es lo que va al QR y al pie. Sale
 *  del slug y del dominio del sitio: componerla en el navegador daría una
 *  dirección distinta según desde dónde se generó la pieza. */
export function campaignUrl(campaign, siteUrl) {
    const base = str(siteUrl, 200).replace(/\/+$/, '');
    const slug = str(campaign?.slug, 120);
    if (!base) return '';
    return slug ? `${base}/maneras-de-contribuir?c=${encodeURIComponent(slug)}` : `${base}/maneras-de-contribuir`;
}

export default {
    OBJECTIVES, DEFAULT_OBJECTIVE, OBJECTIVE_IDS, objectiveCatalog,
    AUDIENCES, DEFAULT_AUDIENCE, AUDIENCE_IDS, audienceCatalog,
    LANGUAGES, DEFAULT_LANGUAGE, LANGUAGE_IDS, languageCatalog,
    FORMAT_IDS, DEFAULT_FORMAT_ID, isCampaignFormat,
    LAYOUTS, LAYOUT_IDS, layoutCatalog, capacityOf, pickLayout,
    publishableStats, chooseStats, activeItems, centerSummary, centerDetail, activePartners,
    CAROUSEL_SLIDES, CAROUSEL_MAX, planCarousel,
    validateBeforeGenerate, buildCampaignBrief, buildVariables, latestCut, campaignUrl,
};
