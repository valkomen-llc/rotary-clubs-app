// ════════════════════════════════════════════════════════════════════
// Slider Global / Llamados a la Acción — espejo del criterio
//
// Duplicado A PROPÓSITO de `server/lib/spotlightSpec.js`, como `ADMIN_ROLES`,
// `designSpec` y los otros seis specs del sitio. Si cambia uno, cambiar el
// otro: `npm run test:spotlight` carga los dos y compara LAS SALIDAS de las
// funciones, no sólo las constantes.
//
// QUÉ NO ESTÁ ACÁ, y es deliberado: `targetsSite`, `resolveSlideLink` y
// `slidesForSite`. El alcance de un slide y el destino de su botón los
// resuelve el SERVIDOR y viajan RESUELTOS, igual que el calendario de la
// Distribución (v4.864) y el período de la Bóveda (v4.849). Con el alcance
// calculado también acá, el panel podría afirmar que un slide alcanza a un
// sitio que la página no le sirve, y eso no lo ve ningún typecheck.
//
// LO QUE SÍ ESTÁ es lo que el PANEL necesita para avisar en vivo —estado de
// vigencia y validación— y lo que sólo puede resolverse en el navegador:
// componer la lista final con el slide LOCAL del propio sitio.
// ════════════════════════════════════════════════════════════════════

export interface SlideType { id: string; label: string; hint: string }

/** El tipo es CLASIFICACIÓN, no aspecto: los siete se pintan igual. La única
 *  excepción es `contribucion`, que habilita el vínculo con una campaña. */
export const SLIDE_TYPES: SlideType[] = [
    { id: 'general', label: 'Llamado a la acción', hint: 'Cualquier pieza institucional.' },
    // ⚠️ El id `contribucion` NO se toca: está guardado en slides ya
    // publicados. El rótulo sí — el módulo se llama «Campañas de
    // Contribución» desde v4.986.
    { id: 'contribucion', label: 'Campañas de Contribución', hint: 'Se puede vincular a una campaña y el enlace lo resuelve el sistema.' },
    { id: 'polio', label: 'End Polio Now', hint: 'La campaña histórica de erradicación.' },
    { id: 'emergencia', label: 'Emergencias y catástrofes', hint: 'Un hecho en curso.' },
    { id: 'proyecto', label: 'Proyectos de impacto', hint: 'Un proyecto propio o de la red.' },
    { id: 'convocatoria', label: 'Convocatorias', hint: 'Becas, subvenciones, postulaciones.' },
    { id: 'evento', label: 'Eventos y campañas institucionales', hint: 'Conferencias, convenciones, aniversarios.' },
];

export const SLIDE_TYPE_IDS = SLIDE_TYPES.map(t => t.id);
export const DEFAULT_SLIDE_TYPE = 'general';
export const slideTypeLabel = (id: string): string =>
    SLIDE_TYPES.find(t => t.id === id)?.label || SLIDE_TYPES[0].label;

export type LinkKind = 'url' | 'campaign';
export const LINK_KINDS: LinkKind[] = ['url', 'campaign'];

export type OpenMode = 'auto' | 'blank';
export const OPEN_MODES: OpenMode[] = ['auto', 'blank'];
export const OPEN_MODE_LABELS: Record<OpenMode, string> = {
    auto: 'Automático — interno en la misma pestaña, externo en una nueva',
    blank: 'Siempre en una pestaña nueva',
};

export type TargetingMode = 'all' | 'districts' | 'clubs';
export const TARGETING_MODES: TargetingMode[] = ['all', 'districts', 'clubs'];
export const TARGETING_LABELS: Record<TargetingMode, string> = {
    all: 'Todos los sitios de la red',
    districts: 'Los sitios de estos distritos',
    clubs: 'Sólo estos sitios',
};

export const MAX_SLIDES_PER_SITE = 8;
export const DEFAULT_AUTOPLAY_MS = 7000;
export const MIN_AUTOPLAY_MS = 3000;
export const MAX_AUTOPLAY_MS = 20000;

/** Cuánto dura el cruce entre un slide y el siguiente. El mismo del hero de
 *  una campaña: una transición corta se lee como un corte. */
export const SLIDE_FADE_MS = 900;

/** Cuánto hay que arrastrar para que cuente como un gesto de paso, en píxeles.
 *  Por debajo es un desplazamiento vertical con el dedo torcido, no un swipe. */
export const SWIPE_THRESHOLD_PX = 48;

const str = (v: unknown): string => (v == null ? '' : String(v)).trim();
const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
    const n = Number.parseInt(String(v), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
};

export interface SlideTargeting {
    mode: TargetingMode;
    districts: string[];
    clubIds: string[];
    excludeClubIds: string[];
}

export function normalizeTargeting(raw: any = {}): SlideTargeting {
    const mode: TargetingMode = TARGETING_MODES.includes(raw?.mode) ? raw.mode : 'all';
    const districts = Array.isArray(raw?.districts)
        ? [...new Set(raw.districts.map((d: unknown) => str(d)).filter((d: string) => /^\d{3,5}$/.test(d)))] as string[]
        : [];
    const clubIds = Array.isArray(raw?.clubIds)
        ? [...new Set(raw.clubIds.map((c: unknown) => str(c)).filter(Boolean))] as string[]
        : [];
    const excludeClubIds = Array.isArray(raw?.excludeClubIds)
        ? [...new Set(raw.excludeClubIds.map((c: unknown) => str(c)).filter(Boolean))] as string[]
        : [];
    return { mode, districts, clubIds, excludeClubIds };
}

export interface Slide {
    id: string;
    name: string;
    slideType: string;
    title: string;
    text: string;
    image: string;
    imageAlt: string;
    imageMobile: string;
    imageMobileAlt: string;
    buttonText: string;
    buttonUrl: string;
    buttonIcon: string;
    linkKind: LinkKind;
    campaignId: string;
    openMode: OpenMode;
    active: boolean;
    priority: number;
    startAt: string | null;
    endAt: string | null;
    publishedAt: string | null;
    autoplayMs: number;
    targeting: SlideTargeting;
    clubId: string | null;
}

/**
 * Da forma y tolera campos faltantes; nunca inventa textos.
 *
 * ⚠️ NO ES EL ESTADO DEL FORMULARIO. Es el contrato de LECTURA y de guardado:
 * aplicado a cada pulsación haría imposible escribir —recorta espacios y
 * descarta lo vacío— y es exactamente el defecto que rompió el editor de la
 * sede en v4.718. El editor trabaja sobre un borrador libre y normaliza al
 * validar y al guardar.
 */
export function normalizeSlide(raw: any = {}): Slide {
    const linkKind: LinkKind = LINK_KINDS.includes(raw?.linkKind) ? raw.linkKind : 'url';
    return {
        id: str(raw?.id),
        name: str(raw?.name),
        slideType: SLIDE_TYPE_IDS.includes(raw?.slideType) ? raw.slideType : DEFAULT_SLIDE_TYPE,
        title: str(raw?.title),
        text: str(raw?.text),
        image: str(raw?.image),
        imageAlt: str(raw?.imageAlt),
        imageMobile: str(raw?.imageMobile),
        imageMobileAlt: str(raw?.imageMobileAlt),
        buttonText: str(raw?.buttonText),
        buttonUrl: str(raw?.buttonUrl),
        buttonIcon: str(raw?.buttonIcon) || 'star',
        linkKind,
        campaignId: linkKind === 'campaign' ? str(raw?.campaignId) : '',
        openMode: OPEN_MODES.includes(raw?.openMode) ? raw.openMode : 'auto',
        active: raw?.active === true || raw?.active === 'true',
        priority: Number.isFinite(Number(raw?.priority)) ? Number(raw.priority) : 0,
        startAt: raw?.startAt || null,
        endAt: raw?.endAt || null,
        publishedAt: raw?.publishedAt || null,
        autoplayMs: clampInt(raw?.autoplayMs, MIN_AUTOPLAY_MS, MAX_AUTOPLAY_MS, DEFAULT_AUTOPLAY_MS),
        targeting: normalizeTargeting(raw?.targeting),
        clubId: str(raw?.clubId) || null,
    };
}

export type SlideState = 'inactivo' | 'programado' | 'vigente' | 'vencido';
export const SLIDE_STATE_LABELS: Record<SlideState, string> = {
    inactivo: 'Inactivo',
    programado: 'Programado',
    vigente: 'Vigente',
    vencido: 'Vencido',
};

/** `now` va por PARÁMETRO: una función que consulta el reloj por dentro no se
 *  puede probar. */
export function slideState(slide: any, now: Date): SlideState {
    if (!slide?.active) return 'inactivo';
    if (!(now instanceof Date)) throw new Error('slideState necesita `now` (regla de pureza)');
    const start = slide.startAt ? new Date(slide.startAt) : null;
    const end = slide.endAt ? new Date(slide.endAt) : null;
    if (end && !Number.isNaN(end.getTime()) && now >= end) return 'vencido';
    if (start && !Number.isNaN(start.getTime()) && now < start) return 'programado';
    return 'vigente';
}

export const isSlideLive = (slide: any, now: Date): boolean => slideState(slide, now) === 'vigente';

export interface SlideValidation { ok: boolean; errors: string[]; warnings: string[]; slide: Slide }

/** `errors` = no se puede publicar; `warnings` = se puede, y hay que decirlo.
 *  Tratarlos igual convierte cualquier aviso en un bloqueo y se dejan de leer. */
export function validateSlide(raw: any = {}): SlideValidation {
    const s = normalizeSlide(raw);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!s.name) errors.push('El slide necesita un nombre interno: es como se lo encuentra en la lista.');
    if (!s.image && !s.title && !s.text) {
        errors.push('Un slide sin imagen, sin título y sin texto no muestra nada.');
    }
    if (!s.image) warnings.push('Sin imagen de fondo el slide se pinta sobre el azul del sitio.');
    if (s.image && !s.imageAlt) {
        warnings.push('La imagen no tiene texto alternativo: un lector de pantalla no podrá describirla.');
    }

    if (s.linkKind === 'campaign' && !s.campaignId) {
        errors.push('Elegí la campaña de contribución a la que lleva el botón.');
    }
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
    if (t.mode === 'clubs' && t.clubIds.length && t.clubIds.every(id => t.excludeClubIds.includes(id))) {
        errors.push('Todos los sitios elegidos están además excluidos: el slide no se vería en ninguno.');
    }

    return { ok: errors.length === 0, errors, warnings, slide: s };
}

// ─── La lista final que ve un visitante ─────────────────────────────────
//
// Sólo existe en el navegador, y por eso no tiene par en el servidor: el
// slide LOCAL es el «Bloque Destacado» de siempre —`club.spotlightContent`
// más la imagen `spotlight` de Distribución de Imágenes—, que ya viven en el
// cliente. Pedírselo al servidor sería una consulta más por visita para
// resolver algo que ya está cargado.
//
// EL LOCAL VA AL FINAL, y es una decisión, no un descuido: los slides
// globales son campañas de la red —una emergencia, una convocatoria— con
// vigencia acotada, y el local es la pieza permanente del sitio. Que el
// llamado urgente vaya primero es lo que se pidió. Que el sitio pueda
// cambiar ese orden es el CONTROL LOCAL que queda preparado: `clubId` en la
// tabla convierte un slide propio en una fila más, con su propia prioridad,
// sin duplicar ni un solo global.
export interface RenderableSlide extends Slide {
    /** `true` = el «Bloque Destacado» del propio sitio, no un slide global.
     *  Se conserva para poder decirlo en la vista previa del panel. */
    isLocal?: boolean;
}

export function withLocalSlide(global: Slide[], local: RenderableSlide | null): RenderableSlide[] {
    const list: RenderableSlide[] = [...(Array.isArray(global) ? global : [])];
    if (local && (local.image || local.title || local.text)) list.push({ ...local, isLocal: true });
    return list.slice(0, MAX_SLIDES_PER_SITE);
}
