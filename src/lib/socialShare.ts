/**
 * Compartir contenido en redes — el espejo del navegador (v4.1013).
 *
 * ⚠️ MÍNIMO A PROPÓSITO: rótulos, tonos y la forma de las respuestas. **NO
 * trae el criterio**: quién puede publicar en qué página, si el artículo se
 * puede compartir y qué falla lo decide el SERVIDOR y viaja resuelto. Con dos
 * criterios, el modal ofrecería una página que la API rechaza —y lo que se
 * separaría es en la cuenta de qué organización aparece una publicación—.
 * Es la misma regla que dejó `reachesSubmission` fuera del bundle (v4.999).
 */

import type { CopyPolicy } from './reelShareCopy';

export type ShareNetwork = 'facebook' | 'instagram' | 'linkedin' | 'x';

/** La FORMA de lo que se publica. La decide el servidor a partir de la
 *  entidad: un artículo es un enlace y un Reel es el video ya montado. La
 *  pantalla la LEE para saber qué pintar; no la elige. */
export type ShareKind = 'link' | 'video';

export interface ShareTarget {
    id: string;
    network: ShareNetwork | string;
    networkLabel: string;
    name: string;
    pageId: string;
    avatar: string | null;
    status: string;
    /** Lo decide el servidor. La pantalla lo PINTA, no lo recalcula. */
    ready: boolean;
    reason: string | null;
    /** Dónde se corrige. Un bloqueo sin salida se lee como una avería. */
    fix: string | null;
    code: string | null;
    /** De qué Página cuelga una cuenta de Instagram. Es lo que permite
     *  comprobar que el Instagram que se ve es el de ESTA Página. */
    linkedPageId?: string | null;
    linkedPageName?: string | null;
    username?: string | null;
    /** Lo que se publica igual y conviene saber antes de pulsar. NO bloquea. */
    warnings?: string[];
    /** El id OFICIAL de Meta: Page ID para una Página, id de la cuenta
     *  profesional para Instagram. ADITIVO — un servidor anterior a v4.1043
     *  no lo manda. */
    platformId?: string | null;
    /** Cuándo se leyó de Meta por última vez. */
    lastSyncAt?: string | null;
    /** Si es la cuenta PRINCIPAL declarada por el sitio. Lo decide el
     *  servidor; la pantalla lo pinta y lo usa para abrir marcada. */
    isDefault?: boolean;
}

/** El estado de la conexión de Meta, resuelto por el servidor. Distingue los
 *  tres casos que en la pantalla se ven idénticos: sin Página, con Página y
 *  sin Instagram, y con las dos pero alguna sin servir. */
export interface ShareIntegration {
    /** La sincronización más reciente de cualquiera de las cuentas. Sin esta
     *  fecha, «ya reconecté y sigue sin aparecer» no se puede distinguir de
     *  «la sincronización nunca corrió». */
    lastSyncAt?: string | null;
    facebook: {
        connected: boolean; ready: boolean; count: number;
        accounts: { id: string; name: string; pageId: string; platformId?: string | null; lastSyncAt?: string | null; ready: boolean; reason: string | null }[];
    };
    instagram: {
        connected: boolean; ready: boolean; count: number;
        accounts: { id: string; name: string; username: string | null; platformId?: string | null; lastSyncAt?: string | null; ready: boolean; reason: string | null; linkedPageId: string | null; linkedPageName: string | null }[];
    };
    notes: { tone: 'info' | 'warn' | 'bad'; text: string; fix: string | null }[];
}

export interface ShareHistoryEntry {
    id: string;
    /** Con qué cuenta salió. Es lo que permite avisar de un repetido POR
     *  CUENTA y no sólo «ya se publicó alguna vez». */
    accountId?: string | null;
    network: string;
    accountName: string | null;
    pageId: string | null;
    status: 'published' | 'error' | 'pending';
    externalId: string | null;
    externalUrl: string | null;
    message: string | null;
    link: string | null;
    mediaUrl?: string | null;
    errorCode: string | null;
    error: string | null;
    userName: string | null;
    createdAt: string;
}

export interface ShareSummary {
    published: boolean;
    networks: string[];
    count: number;
    lastAt: string | null;
    failed: number;
    lastUrl?: string | null;
}

export interface ShareEntity {
    id: string; title: string; published: boolean; image: string | null;
    excerpt: string; socialCopy: string; slug: string | null;
    /** Sólo cuando la forma es `video` (un Reel). */
    kind?: ShareKind;
    mediaUrl?: string | null;
    posterUrl?: string | null;
    durationSec?: number | null;
    width?: number | null;
    height?: number | null;
    sizeBytes?: number | null;
    format?: string | null;
    status?: string | null;
}

/** Qué hubo que hacerle al copy propuesto para que cumpliera la regla. Es lo
 *  que permite decir «se acortó, revisalo» en vez de entregar un texto
 *  recortado como si fuera el que alguien escribió. */
export interface ShareCopyNotes {
    /** Si hubo un copy escrito del que partir, o si el pie salió del título.
     *  ⚠️ NO viaja el copy largo entero: la pantalla no lo lee y mete tres
     *  párrafos en una respuesta que se pide al abrir el modal. */
    fromCopy?: boolean;
    shortened?: boolean;
    cut?: 'oracion' | 'palabra' | null;
    sanitized?: boolean;
    links?: string[];
}

export interface ShareTargetsResponse {
    entity: ShareEntity;
    /** ADITIVO: un servidor anterior a v4.1042 no lo manda y la pantalla se
     *  comporta como antes (enlace). */
    kind?: ShareKind;
    kindLabel?: string;
    mediaUrl?: string | null;
    integration?: ShareIntegration | null;
    /** El copy propuesto POR RED. `null` cuando la entidad no tiene uno por
     *  red —un artículo—: entonces manda `defaultMessage`. */
    defaultMessages?: Record<string, string> | null;
    publicUrl: string | null;
    publicUrlReason: string | null;
    shareable: boolean;
    shareReason: string | null;
    shareFix: string | null;
    targets: ShareTarget[];
    /** Con qué abre marcado el modal: la Página y el Instagram PRINCIPALES
     *  del sitio, ya resueltos contra `targets` (un principal que apunta a
     *  una cuenta borrada o que no puede publicar llega en `null`). */
    defaults?: { facebook: string | null; instagram: string | null };
    networks: { id: string; label: string; available: boolean; linkable: boolean; kinds?: string[]; note: string | null }[];
    defaultMessage: string;
    /** La REGLA del copy, resuelta por el servidor. `null` para lo que no
     *  tiene una propia —un artículo—, y entonces la pantalla se comporta
     *  como siempre. ADITIVO: un servidor anterior a v4.1052 no lo manda. */
    copyPolicy?: CopyPolicy | null;
    /** ⚠️ UNA REGLA POR RED (v4.1061), para lo que se publica como ENLACE. Un
     *  artículo lleva un texto por red —los 280 de X y los 3.000 de LinkedIn
     *  no admiten el mismo— y por eso el contador se pinta con la de la
     *  pestaña activa. `null` para lo que tiene una sola. La declara el
     *  SERVIDOR y viaja resuelta; ADITIVO, un servidor anterior no lo manda y
     *  la pantalla cae a `copyPolicy`. */
    copyPolicies?: Record<string, CopyPolicy> | null;
    copyNotes?: ShareCopyNotes | null;
    messageMax: number;
    history: ShareHistoryEntry[];
    summary: ShareSummary | null;
}

export interface ShareOutcome {
    accountId: string;
    network: string;
    accountName: string | null;
    pageId: string | null;
    ok: boolean;
    externalId?: string | null;
    externalUrl?: string | null;
    error?: string | null;
    fix?: string | null;
    code?: string | null;
    duplicate?: boolean;
    retryable?: boolean;
}

/** El dominio que se le enseña a quien va a publicar, para que compruebe a
 *  dónde va a llevar el enlace ANTES de mandarlo. */
export const hostOf = (url: string | null | undefined): string => {
    if (!url) return '';
    try { return new URL(url).host.replace(/^www\./i, ''); } catch { return ''; }
};

export const NETWORK_LABELS: Record<string, string> = {
    facebook: 'Facebook',
    instagram: 'Instagram',
    linkedin: 'LinkedIn',
    x: 'X (Twitter)',
};

export const networkLabel = (id: string): string => NETWORK_LABELS[id] || id;

/**
 * La clave de la operación. Se genera al ABRIR el modal, no al pulsar: es lo
 * que hace que un doble clic —o el reintento del navegador tras un tropiezo de
 * red— caiga en la MISMA operación y no publique dos veces. «Publicar
 * nuevamente» pide una clave nueva, a propósito.
 */
export const newOperationKey = (): string => {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    } catch { /* algunos navegadores lo exponen sólo en contexto seguro */ }
    return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/** Cómo se lee un desenlace en la pantalla. El servidor manda el texto; acá
 *  sólo se decide el tono. */
export const outcomeTone = (o: ShareOutcome): 'ok' | 'warn' | 'bad' =>
    o.ok ? 'ok' : o.code === 'in_flight' ? 'warn' : 'bad';

/** Cuántos segundos dura, dicho como lo diría una persona. Sólo formatea: la
 *  medida la trae el servidor y un valor ausente se dice, no se inventa. */
export const duracionLegible = (seg: number | null | undefined): string => {
    if (seg == null || !Number.isFinite(Number(seg))) return 'sin medir';
    const s = Number(seg);
    if (s < 60) return `${s.toFixed(1).replace(/\.0$/, '')} s`;
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.round(s % 60)).padStart(2, '0')} min`;
};

/** Un grupo de Facebook disponible y autorizado para difusión (v4.1073). */
export interface ShareGroupTarget {
    id: string;
    groupId: string;
    name: string;
    url: string | null;
    language: string;
    languageLabel: string;
    region?: string;
    tags: string[];
    status: 'verificado' | 'sin_verificar' | 'sin_permiso' | 'retirado' | string;
    canPublish: boolean;
    lastPublishedAt: string | null;
    favorite?: boolean;
    source?: string;
}

export interface MetaSyncDiagnostic {
    fanpage?: string;
    pageId?: string;
    metaNotice?: string;
    solution?: string;
}

export interface MetaGroupSyncResponse {
    ok: boolean;
    synced: number;
    metaStatus: 'synced' | 'restricted_by_meta_policy' | 'error';
    message: string;
    diagnostic?: MetaSyncDiagnostic;
    error?: string;
}

export interface GroupDistributionOutcome {
    groupId: string;
    name: string;
    url: string | null;
    dialogUrl?: string | null;
    status: 'published' | 'pending' | 'error';
    error?: string | null;
    publishedAt?: string | null;
    message?: string | null;
}

/**
 * Generador contextual de llamada a la acción (CTA) para grupos de Facebook (v4.1075).
 * - Máximo 100 caracteres.
 * - Terminado en emoji pertinente según temática rotaria.
 * - Atractivo, natural, en español y sin hashtags.
 */
export const generateDeterministicGroupCTA = (
    title: string = '',
    excerpt: string = '',
    content: string = ''
): string => {
    const text = `${title} ${excerpt} ${content}`.toLowerCase();

    let emoji = '🌎';
    let tema = 'comunidad';

    if (/agua|filtro|acueducto|potable|hídric|saneamiento/i.test(text)) {
        emoji = '💧';
        tema = 'agua';
    } else if (/salud|médic|vacuna|enferm|hospital|quirúrgic|dental|cáncer|cirugía/i.test(text)) {
        emoji = '🩺';
        tema = 'salud';
    } else if (/educa|escuela|colegio|beca|libro|estudiante|alfabetiza|formación/i.test(text)) {
        emoji = '📚';
        tema = 'educacion';
    } else if (/paz|conflicto|diálogo|convivencia|armonía|derechos/i.test(text)) {
        emoji = '🕊️';
        tema = 'paz';
    } else if (/ambiente|árbol|reforest|ecolog|climátic|recicla|naturaleza/i.test(text)) {
        emoji = '🌱';
        tema = 'ambiente';
    } else if (/joven|juventud|rotaract|interact|intercambio|ryla/i.test(text)) {
        emoji = '🌟';
        tema = 'juventud';
    } else if (/donac|alimento|solidar|ayuda|vivienda|techo|apoyo|emergencia|reconstru/i.test(text)) {
        emoji = '🤝';
        tema = 'solidaridad';
    }

    const opciones: Record<string, string[]> = {
        agua: [
            `Llevamos agua potable y esperanza donde más se necesita con Rotary. ${emoji}`,
            `Así transforma Rotary vidas con acceso a agua limpia y saneamiento. ${emoji}`,
            `Servicio que transforma: proyectos de agua potable con sello rotario. ${emoji}`,
        ],
        salud: [
            `Comprometidos con la salud y el bienestar de nuestras comunidades. ${emoji}`,
            `Rotary en acción por la prevención y el cuidado médico solidario. ${emoji}`,
            `Cuidar la vida es nuestro lema: mira cómo servimos en salud comunitaria. ${emoji}`,
        ],
        educacion: [
            `Impulsando el futuro de la niñez mediante educación y servicio rotario. ${emoji}`,
            `Rotary transformando vidas a través de la educación y el apoyo escolar. ${emoji}`,
            `Educación que abre puertas: conoce este gran proyecto de servicio rotario. ${emoji}`,
        ],
        paz: [
            `Construyendo puentes de paz, diálogo y esperanza junto a Rotary. ${emoji}`,
            `Servicio rotario para fortalecer la convivencia en nuestras comunidades. ${emoji}`,
        ],
        ambiente: [
            `Protegiendo nuestro planeta y sembrando futuro con acción rotaria. ${emoji}`,
            `Cuidar el medio ambiente es servir a la humanidad: conócelo aquí. ${emoji}`,
        ],
        juventud: [
            `Inspirando el liderazgo juvenil y la vocación de servicio con Rotary. ${emoji}`,
            `Líderes jóvenes que transforman el mundo con energía y solidaridad. ${emoji}`,
        ],
        solidaridad: [
            `Manos solidarias que construyen esperanza en nuestras comunidades. ${emoji}`,
            `Así respondemos al llamado del servicio: Rotary presente donde se necesita. ${emoji}`,
            `La fuerza de la solidaridad en acción a través del servicio rotario. ${emoji}`,
        ],
        comunidad: [
            `Conoce cómo Rotary transforma comunidades a través del servicio y la solidaridad. ${emoji}`,
            `Gente de acción: mira cómo Rotary impacta positivamente nuestras regiones. ${emoji}`,
            `El servicio rotario en acción transformando realidades comunitarias. ${emoji}`,
        ],
    };

    const lista = opciones[tema] || opciones.comunidad;

    // Si el título es corto y descriptivo, podemos armar una frase con él si no supera 100 caracteres
    const tLimpio = title.replace(/[«»"“”]/g, '').trim();
    if (tLimpio && tLimpio.length <= 60) {
        const ctaTitulo = `Conoce esta iniciativa de servicio rotario: ${tLimpio} ${emoji}`;
        if (ctaTitulo.length <= 100) return ctaTitulo;
    }

    for (const op of lista) {
        if (op.length <= 100) return op;
    }

    return `Conoce cómo Rotary transforma comunidades a través del servicio y la solidaridad. 🌎`;
};

export interface CustomDistributionList {
    id: string;
    name: string;
    description: string;
    color: string;
    isDefault: boolean;
    groupCount?: number;
}

export interface BatchDistributionConfig {
    batchSize: number;
    safetyNotice?: string;
    recommendedRange?: { min: number; max: number; default: number };
}

export interface GroupUrlValidationResult {
    ok: boolean;
    groupId?: string;
    canonicalUrl?: string;
    inferredName?: string;
    language?: string;
    suggestedTags?: string[];
    error?: string;
}

export interface GroupCapabilityReport {
    groupId: string;
    canPublishViaApi: boolean;
    channel: 'meta_dialog_assisted' | 'api_direct';
    mode: 'assisted' | 'direct';
    status: string;
    policyRestriction?: string;
    officialReason?: string;
}

export interface GroupQueueItem extends GroupDistributionOutcome {
    inProcess?: boolean;
    stepIndex?: number;
}

export interface DistributionProgressState {
    total: number;
    completed: number;
    pending: number;
    errors: number;
    skipped?: number;
    currentIndex: number;
    isExecuting: boolean;
    autoRunning?: boolean;
    isPaused?: boolean;
    cadenceSeconds?: number;
    countdownSeconds?: number;
    nextGroupId?: string | null;
}

export default { hostOf, networkLabel, newOperationKey, outcomeTone, duracionLegible, generateDeterministicGroupCTA, NETWORK_LABELS };

