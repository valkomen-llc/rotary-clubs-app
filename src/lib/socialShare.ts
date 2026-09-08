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

export type ShareNetwork = 'facebook' | 'instagram' | 'linkedin' | 'x';

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
}

export interface ShareHistoryEntry {
    id: string;
    network: string;
    accountName: string | null;
    pageId: string | null;
    status: 'published' | 'error' | 'pending';
    externalId: string | null;
    externalUrl: string | null;
    message: string | null;
    link: string | null;
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

export interface ShareTargetsResponse {
    entity: { id: string; title: string; published: boolean; image: string | null; excerpt: string; socialCopy: string; slug: string | null };
    publicUrl: string | null;
    publicUrlReason: string | null;
    shareable: boolean;
    shareReason: string | null;
    shareFix: string | null;
    targets: ShareTarget[];
    networks: { id: string; label: string; available: boolean; linkable: boolean; note: string | null }[];
    defaultMessage: string;
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

export default { hostOf, networkLabel, newOperationKey, outcomeTone, NETWORK_LABELS };
