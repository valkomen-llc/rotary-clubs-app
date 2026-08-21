// ════════════════════════════════════════════════════════════════════
// Slider Global / Llamados a la Acción — el CRITERIO
//
// PURO: sin base, sin red, sin IA, sin DOM. Por el mismo motivo que
// `seoRules.js` vive aparte de `seoAudit.js` y `contributionSpec.js` aparte
// de su controlador — un criterio que sólo se ejercita contra una base real
// termina sin pruebas, y entonces nadie se entera de que una regla cambió de
// signo.
//
// QUÉ RESUELVE ESTE ARCHIVO: qué slides le tocan a un sitio, en qué orden, y
// a dónde lleva el botón de cada uno. La forma de pintarlos es de
// `SpotlightSection.tsx`; el camino a los datos, del controlador.
//
// DE DÓNDE VIENE: el «Bloque Destacado» de v4.746 —una imagen, un título, un
// texto y un botón, cargados por el administrador del sitio— es el mismo
// contenedor. Lo que cambia es de dónde sale el contenido: hasta v4.878 sólo
// del propio sitio, ahora también de un slide publicado UNA vez en Club
// Platform que alcanza a todos los sitios que se elijan.
//
// LA DECISIÓN DE FONDO: un slide global es UNA FILA que cada sitio resuelve
// AL LEER, no una copia por sitio. Es la misma decisión que Campañas de
// Contribución (v4.807) y la contraria a la del ecosistema del Distrito
// (v4.747), y por el mismo motivo: aquellos contenidos son del club de
// origen y el clon le da autonomía; una campaña global es de la plataforma y
// corregirle una cifra —o retirarla— tiene que reflejarse en todos los
// sitios al instante. Con copias, retirar una emergencia serían N escrituras
// y la que fallara seguiría publicada.
// ════════════════════════════════════════════════════════════════════

import { normalizeTargeting as normalizeCampaignTargeting, targetsSite as campaignTargetsSite } from './contributionSpec.js';

// ─── Tipos de slide ─────────────────────────────────────────────────────
//
// El tipo es CLASIFICACIÓN —sirve para encontrar un slide entre veinte y para
// filtrar la tabla del panel—, no aspecto: los siete se pintan exactamente
// igual. Decirlo importa, o alguien elegirá «Emergencia» esperando que la
// pieza salga en rojo.
//
// La única excepción es `contribucion`, que es lo que habilita el vínculo con
// una campaña de Maneras de Contribuir.
export const SLIDE_TYPES = [
    { id: 'general', label: 'Llamado a la acción', hint: 'Cualquier pieza institucional.' },
    { id: 'contribucion', label: 'Maneras de Contribuir', hint: 'Se puede vincular a una campaña y el enlace lo resuelve el sistema.' },
    { id: 'polio', label: 'End Polio Now', hint: 'La campaña histórica de erradicación.' },
    { id: 'emergencia', label: 'Emergencias y catástrofes', hint: 'Un hecho en curso.' },
    { id: 'proyecto', label: 'Proyectos de impacto', hint: 'Un proyecto propio o de la red.' },
    { id: 'convocatoria', label: 'Convocatorias', hint: 'Becas, subvenciones, postulaciones.' },
    { id: 'evento', label: 'Eventos y campañas institucionales', hint: 'Conferencias, convenciones, aniversarios.' },
];

export const SLIDE_TYPE_IDS = SLIDE_TYPES.map(t => t.id);
export const DEFAULT_SLIDE_TYPE = 'general';

export const slideTypeLabel = id =>
    SLIDE_TYPES.find(t => t.id === id)?.label || SLIDE_TYPES[0].label;

// ─── De dónde sale el enlace ────────────────────────────────────────────
//
// `url` — el administrador la escribe. `campaign` — la resuelve el sistema a
// partir de una campaña de Maneras de Contribuir, POR SITIO: es lo que
// permite publicar «Colombia nos necesita» una vez y que en cada sitio el
// botón lleve a la página de contribución de ESE sitio.
export const LINK_KINDS = ['url', 'campaign'];

// Dónde vive la landing de una campaña de contribución. Es la ruta que
// `App.tsx` monta para `ManerasDeContribuir`, que a su vez pinta
// `CampaignLanding` cuando /contribution-campaigns/active devuelve una.
export const CONTRIBUTION_PATH = '/maneras-de-contribuir';

// ─── Cómo se abre el enlace ─────────────────────────────────────────────
//
// `auto` es la regla del sitio desde v4.657: externo = OTRO DOMINIO, no
// «empieza por http», y lo decide `ctaTarget` en el navegador —que es el
// único que sabe en qué dominio se está pintando—.
//
// `blank` FUERZA pestaña nueva. Existe porque hay un caso que `auto` no
// cubre: un PDF o un formulario alojado en el propio dominio, donde perder la
// página es una molestia real. Lo que NO existe es forzar «misma pestaña»
// para un dominio ajeno: sacar al visitante del sitio sin poder volver es
// justo lo que la regla evita, y ofrecerlo sería una casilla que empeora.
export const OPEN_MODES = ['auto', 'blank'];

// Cuántos slides ve un visitante como mucho. No es una restricción técnica:
// un carrusel de quince es una lista que nadie recorre, y el último no lo ve
// nadie. Lo que sobra se anota, no se descarta en silencio.
export const MAX_SLIDES_PER_SITE = 8;

// Cuánto se queda cada slide antes de pasar al siguiente, si no se configura
// otra cosa. Más lento que la tira de fotos de una campaña (1,8 s) y que sus
// videos (4,2 s) a propósito: acá hay un título, un párrafo y un botón, y
// hay que darle a alguien tiempo de LEERLOS y decidir si pulsa.
export const DEFAULT_AUTOPLAY_MS = 7000;
export const MIN_AUTOPLAY_MS = 3000;
export const MAX_AUTOPLAY_MS = 20000;

const str = v => (v == null ? '' : String(v)).trim();
const clampInt = (v, min, max, fallback) => {
    const n = Number.parseInt(v, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
};

// ─── Targeting ──────────────────────────────────────────────────────────
//
// El alcance POSITIVO —«todos», «estos distritos», «estos sitios»— se resuelve
// con el MISMO criterio de las campañas de contribución
// (`contributionSpec.targetsSite`). No se escribe un segundo: aquél ya trata
// `Club.district` como una LISTA («4271, 4281», v4.748) y ya está probado, y
// con dos criterios un slide podría alcanzar a un sitio que la campaña que
// anuncia no alcanza — el botón llevaría a una página que ese sitio no tiene.
//
// Lo que se AÑADE encima es la exclusión, que las campañas no tienen: una
// campaña global se publica «a todos MENOS a estos dos», y sin exclusión la
// única forma sería enumerar los ciento y pico que sí.
//
// El modo por defecto es `all`, al revés que en campañas (que es `clubs`).
// Es lo que se pidió —una campaña global se despliega desde un solo lugar sin
// configurarla sitio por sitio— y lo que lo hace seguro es que un slide nace
// INACTIVO: publicar sigue siendo un acto deliberado. La lección de v4.737
// —la campaña de un distrito que se volvió la portada de todos los
// distritos— era sobre contenido escrito EN EL CÓDIGO, que nadie eligió;
// esto es una fila que alguien creó, tituló y encendió.
export const TARGETING_MODES = ['all', 'districts', 'clubs'];

export function normalizeTargeting(raw = {}) {
    const base = normalizeCampaignTargeting({
        // El modo por defecto de las campañas es `clubs`; el nuestro es `all`.
        mode: TARGETING_MODES.includes(raw?.mode) ? raw.mode : 'all',
        districts: raw?.districts,
        clubIds: raw?.clubIds,
    });
    const exclude = Array.isArray(raw?.excludeClubIds)
        ? [...new Set(raw.excludeClubIds.map(c => str(c)).filter(Boolean))]
        : [];
    return { ...base, excludeClubIds: exclude };
}

/**
 * ¿Este slide se muestra en este sitio?
 * `site` = { id, districtId?, district? } — la forma en que ya viaja un club.
 *
 * La exclusión gana SIEMPRE, incluso sobre un `clubs` que nombre al sitio.
 * Es la lectura natural de «excluir» y es además la segura: quien escribe una
 * exclusión está quitando a alguien a propósito, y que un alcance positivo la
 * anulara convertiría el control en una casilla que a veces no hace nada.
 */
export function targetsSite(targeting, site) {
    const t = normalizeTargeting(targeting);
    if (!site?.id) return false;
    if (t.excludeClubIds.includes(String(site.id))) return false;
    return campaignTargetsSite(t, site);
}

// ─── Vigencia ───────────────────────────────────────────────────────────
//
// Un slide se sirve si está encendido Y el instante cae dentro de su ventana.
// Sin fechas, la publicación es permanente — que es lo que se pidió y además
// lo que espera cualquiera que deje los dos campos en blanco.
//
// Se DERIVA al leer, sin cron: es la misma decisión que `effectiveStatus` de
// las campañas (v4.807). Un cron que apagara slides vencidos añadiría una
// pieza que puede fallar para resolver algo que una comparación de fechas ya
// resuelve, y dejaría un slide publicado hasta la vuelta siguiente.
export const SLIDE_STATES = ['inactivo', 'programado', 'vigente', 'vencido'];

/** `now` va por PARÁMETRO — una función que consulta el reloj por dentro no
 *  se puede probar (la lección de `yearsSince`, v4.729). */
export function slideState(slide, now) {
    if (!slide?.active) return 'inactivo';
    if (!(now instanceof Date)) throw new Error('slideState necesita `now` (regla de pureza)');
    const start = slide.startAt ? new Date(slide.startAt) : null;
    const end = slide.endAt ? new Date(slide.endAt) : null;
    if (end && !Number.isNaN(end.getTime()) && now >= end) return 'vencido';
    if (start && !Number.isNaN(start.getTime()) && now < start) return 'programado';
    return 'vigente';
}

export const isSlideLive = (slide, now) => slideState(slide, now) === 'vigente';

// ─── Normalización ──────────────────────────────────────────────────────
//
// Da forma y tolera campos faltantes; NUNCA inventa textos. Es lo que hace
// que un slide guardado antes de que existiera un campo siga leyéndose.
export function normalizeSlide(raw = {}) {
    const linkKind = LINK_KINDS.includes(raw?.linkKind) ? raw.linkKind : 'url';
    return {
        id: str(raw.id),
        name: str(raw.name),
        slideType: SLIDE_TYPE_IDS.includes(raw?.slideType) ? raw.slideType : DEFAULT_SLIDE_TYPE,

        title: str(raw.title),
        text: str(raw.text),

        image: str(raw.image),
        imageAlt: str(raw.imageAlt),
        // Opcional a propósito: sin ella se usa la de escritorio, que es lo
        // que hace hoy el Bloque Destacado y se ve correctamente.
        imageMobile: str(raw.imageMobile),
        imageMobileAlt: str(raw.imageMobileAlt),

        buttonText: str(raw.buttonText),
        buttonUrl: str(raw.buttonUrl),
        buttonIcon: str(raw.buttonIcon) || 'star',
        linkKind,
        campaignId: linkKind === 'campaign' ? str(raw.campaignId) : '',
        openMode: OPEN_MODES.includes(raw?.openMode) ? raw.openMode : 'auto',

        active: raw?.active === true || raw?.active === 'true',
        priority: Number.isFinite(Number(raw?.priority)) ? Number(raw.priority) : 0,
        startAt: raw?.startAt || null,
        endAt: raw?.endAt || null,
        // Va en la normalización porque es la MITAD del desempate de
        // `slidesForSite`: sin él, dos slides de la misma prioridad se
        // ordenarían siempre por id y publicar uno nuevo no lo adelantaría.
        publishedAt: raw?.publishedAt || null,
        autoplayMs: clampInt(raw?.autoplayMs, MIN_AUTOPLAY_MS, MAX_AUTOPLAY_MS, DEFAULT_AUTOPLAY_MS),

        targeting: normalizeTargeting(raw?.targeting),
        // NULL/'' = slide GLOBAL de Club Platform. La columna existe desde el
        // primer día para que un slide LOCAL de un sitio sea una fila más el
        // día que se implemente, sin migrar nada ni duplicar los globales.
        clubId: str(raw.clubId) || null,
    };
}

// ─── Validación ─────────────────────────────────────────────────────────
//
// `errors` = no se puede publicar; `warnings` = se puede, y hay que decirlo.
// Tratarlos igual convierte cualquier observación en un bloqueo y se dejan de
// leer (la lección de `validateBeforeGenerate`, v4.833).
export function validateSlide(raw = {}) {
    const s = normalizeSlide(raw);
    const errors = [];
    const warnings = [];

    if (!s.name) errors.push('El slide necesita un nombre interno: es como se lo encuentra en la lista.');
    // Sin nada que mostrar no hay slide. Misma regla que el Bloque Destacado
    // de v4.746: se comprueban las tres cosas y no sólo la imagen, para que
    // quien escriba el texto antes de subir la pieza vea lo que lleva escrito.
    if (!s.image && !s.title && !s.text) {
        errors.push('Un slide sin imagen, sin título y sin texto no muestra nada.');
    }
    if (!s.image) warnings.push('Sin imagen de fondo el slide se pinta sobre el azul del sitio.');
    if (s.image && !s.imageAlt) {
        warnings.push('La imagen no tiene texto alternativo: un lector de pantalla no podrá describirla.');
    }

    if (s.linkKind === 'campaign' && !s.campaignId) {
        errors.push('Elegí la campaña de Maneras de Contribuir a la que lleva el botón.');
    }
    // Un botón que no lleva a ninguna parte es peor que ninguno (v4.650), y
    // un destino sin texto no se puede pulsar porque no se dibuja.
    if (s.buttonText && s.linkKind === 'url' && !s.buttonUrl) {
        errors.push('El botón tiene texto pero no destino: no se va a dibujar.');
    }
    if (!s.buttonText && (s.buttonUrl || s.campaignId)) {
        warnings.push('Hay un destino configurado pero el botón no tiene texto, así que no se dibuja.');
    }

    const start = s.startAt ? new Date(s.startAt) : null;
    const end = s.endAt ? new Date(s.endAt) : null;
    if (start && Number.isNaN(start.getTime())) errors.push('La fecha de inicio no se entiende.');
    if (end && Number.isNaN(end.getTime())) errors.push('La fecha de finalización no se entiende.');
    if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end <= start) {
        errors.push('La finalización tiene que ser posterior al inicio.');
    }
    if (!s.startAt && !s.endAt) {
        warnings.push('Sin fechas, la publicación es permanente hasta que alguien la desactive.');
    }

    const t = s.targeting;
    if (t.mode === 'districts' && t.districts.length === 0) {
        errors.push('Elegiste «distritos» y no marcaste ninguno: el slide no se vería en ningún sitio.');
    }
    if (t.mode === 'clubs' && t.clubIds.length === 0) {
        errors.push('Elegiste «sitios específicos» y no marcaste ninguno: el slide no se vería en ningún sitio.');
    }
    if (t.mode === 'clubs' && t.clubIds.every(id => t.excludeClubIds.includes(id))) {
        if (t.clubIds.length) errors.push('Todos los sitios elegidos están además excluidos: el slide no se vería en ninguno.');
    }

    return { ok: errors.length === 0, errors, warnings, slide: s };
}

// ─── Traer el Bloque Destacado de un sitio al Slider Global ─────────────
//
// Un sitio puede llevar años con su Bloque Destacado propio —el END POLIO NOW
// del Distrito 4281 es el caso que originó esto— configurado en dos pantallas
// distintas: el texto en Configuración / Identidad y la imagen en Imágenes del
// Sitio. Para administrarlo desde acá hay que convertirlo en un slide, y
// copiarlo a mano es la forma segura de equivocarse en una URL o perder el
// icono.
//
// PURA a propósito: recibe lo que ya se leyó de la base y devuelve el slide.
// La I/O vive en el controlador.

/**
 * El slide equivalente al Bloque Destacado de un sitio.
 *
 * ⚠️ NACE APUNTANDO SÓLO A ESE SITIO (`mode: 'clubs'`), no a todos. Es lo que
 * reproduce EXACTAMENTE lo que ese sitio muestra hoy: importar no puede ser
 * una forma de publicar en toda la red sin haberlo pedido. Ampliarlo a «todos
 * los sitios» es una decisión posterior y explícita —y es justo lo que se
 * querrá con una campaña como END POLIO NOW—, pero se toma mirando el alcance,
 * no como efecto secundario de una importación.
 *
 * `local` es el JSON de `spotlight_section_content`; `image`, el hueco
 * `spotlight` de las imágenes del sitio.
 */
export function slideFromLocalBlock({ clubId, clubName, local = {}, image = {} } = {}) {
    const txt = v => String(v ?? '').trim();
    const nombre = txt(clubName) || 'un sitio';
    return normalizeSlide({
        // El nombre interno dice de dónde vino: dentro de un mes, «Importado
        // de Distrito 4281» contesta solo por qué existe este slide.
        name: `${txt(local.title).slice(0, 40) || 'Bloque Destacado'} — ${nombre}`,
        slideType: DEFAULT_SLIDE_TYPE,
        title: txt(local.title),
        text: txt(local.text),
        image: txt(image.url),
        imageAlt: txt(image.alt),
        buttonText: txt(local.buttonText),
        buttonUrl: txt(local.buttonUrl),
        icon: txt(local.icon) || 'star',
        linkKind: 'url',
        targeting: { mode: 'clubs', clubIds: [String(clubId ?? '')].filter(Boolean) },
    });
}

/**
 * ¿El Bloque Destacado de este sitio tiene algo que importar?
 *
 * El MISMO criterio con el que `SpotlightSection` decide si se dibuja: sin
 * imagen, sin título y sin texto no hay bloque. Ofrecer en la lista un sitio
 * cuyo bloque no se ve sería ofrecer un slide vacío.
 */
export const hasLocalBlock = ({ local = {}, image = {} } = {}) =>
    !!(String(image.url ?? '').trim() || String(local.title ?? '').trim() || String(local.text ?? '').trim());

// ─── A dónde lleva el botón ─────────────────────────────────────────────
//
// Devuelve `{ url, reason }`. `url` vacía = este slide NO tiene botón, y
// `reason` dice por qué — nunca se dibuja uno que no lleva a ninguna parte
// (v4.650), y nunca se descarta en silencio.
//
// `campaigns` es un índice `{ [id]: { id, servable, targeting } }`. Se pasa
// resuelto desde fuera para que esta función siga siendo pura: consultar la
// base por dentro la haría imposible de probar y metería un viaje de red en
// el camino de una página pública.
export function resolveSlideLink(slide, site, campaigns = {}) {
    const s = normalizeSlide(slide);
    if (s.linkKind !== 'campaign') return { url: s.buttonUrl, reason: '' };

    const campaign = campaigns[s.campaignId];
    if (!campaign) return { url: '', reason: 'La campaña vinculada ya no existe.' };
    if (!campaign.servable) return { url: '', reason: 'La campaña vinculada no está activa en este momento.' };
    // La campaña se pinta en la landing de ESTE sitio, así que si no lo
    // alcanza el botón llevaría a una página que ese sitio no muestra. Es la
    // misma comprobación que hace la propia landing, con el mismo criterio.
    if (!campaignTargetsSite(campaign.targeting, site)) {
        return { url: '', reason: 'La campaña vinculada no alcanza a este sitio.' };
    }
    return { url: CONTRIBUTION_PATH, reason: '' };
}

// ─── Qué slides le tocan a un sitio, y en qué orden ─────────────────────
//
// El orden es EXPLÍCITO y ESTABLE: prioridad declarada, luego publicación más
// reciente, luego id. Si dependiera del orden en que la base devuelve las
// filas, el mismo sitio vería los slides en otro orden en cada visita —es la
// regla de `pickDistrictSite` y de `pickCampaignForSite`—.
//
// ⚠️ UN SLIDE VINCULADO A UNA CAMPAÑA QUE NO SE PUEDE ABRIR **SE RETIRA
// ENTERO**, no se pinta sin botón. Y es deliberado: ese slide existe PARA
// llevar a la campaña —«Tu contribución puede ayudar», sin nada que pulsar—,
// así que sin destino no es una pieza incompleta, es una pieza que miente.
// Un slide de enlace normal sin botón sí se pinta: ahí el botón es un extra.
export function slidesForSite(slides, site, now, campaigns = {}) {
    const kept = [];
    const dropped = [];

    for (const raw of (Array.isArray(slides) ? slides : [])) {
        const s = normalizeSlide(raw);
        if (!isSlideLive(s, now)) {
            dropped.push({ id: s.id, reason: `Estado: ${slideState(s, now)}.` });
            continue;
        }
        if (!targetsSite(s.targeting, site)) {
            dropped.push({ id: s.id, reason: 'No alcanza a este sitio.' });
            continue;
        }
        const link = resolveSlideLink(s, site, campaigns);
        if (s.linkKind === 'campaign' && !link.url) {
            dropped.push({ id: s.id, reason: link.reason });
            continue;
        }
        kept.push({ ...s, buttonUrl: link.url });
    }

    kept.sort((a, b) =>
        (Number(b.priority) || 0) - (Number(a.priority) || 0)
        || new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()
        || String(a.id).localeCompare(String(b.id))
    );

    const shown = kept.slice(0, MAX_SLIDES_PER_SITE);
    // Lo que no entra se DICE. Un recorte silencioso convierte «se publicó»
    // en una afirmación falsa (la regla del prompt de escena, v4.705).
    if (kept.length > shown.length) {
        dropped.push({
            id: null,
            reason: `${kept.length - shown.length} slide(s) quedaron fuera: el tope por sitio es ${MAX_SLIDES_PER_SITE}.`,
        });
    }
    return { slides: shown, dropped };
}

export default {
    slideFromLocalBlock, hasLocalBlock,
    SLIDE_TYPES, SLIDE_TYPE_IDS, DEFAULT_SLIDE_TYPE, slideTypeLabel,
    LINK_KINDS, OPEN_MODES, CONTRIBUTION_PATH,
    MAX_SLIDES_PER_SITE, DEFAULT_AUTOPLAY_MS, MIN_AUTOPLAY_MS, MAX_AUTOPLAY_MS,
    TARGETING_MODES, normalizeTargeting, targetsSite,
    SLIDE_STATES, slideState, isSlideLive,
    normalizeSlide, validateSlide, resolveSlideLink, slidesForSite,
};
