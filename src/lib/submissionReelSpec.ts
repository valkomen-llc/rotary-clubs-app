// ════════════════════════════════════════════════════════════════════════════
// Solicitud → Reel — el espejo MÍNIMO del navegador (v4.1006)
//
// Sólo lo que hace falta para PINTAR: rótulos y tonos. El criterio —qué fotos
// se eligen, qué etapa sigue, a qué estado se puede pasar, cuántos créditos
// cuesta— vive en el servidor y viaja RESUELTO en la respuesta (`stages`,
// `nextStates`, `estimate`, `selection`). Copiarlo acá daría dos verdades
// sobre el mismo Reel, y lo que se separaría es qué se le cobra a alguien.
// ════════════════════════════════════════════════════════════════════════════

export type ReelStateId =
    | 'recibida' | 'analizando' | 'preparando' | 'generando' | 'componiendo'
    | 'borrador_listo' | 'en_revision' | 'aprobado' | 'publicado' | 'descartado' | 'error';

export const REEL_STATES: Record<ReelStateId, { label: string; tone: string; working?: boolean; help: string }> = {
    recibida: { label: 'En cola', tone: 'sky', working: true, help: 'En cola: el Reel se prepara solo en el próximo minuto.' },
    analizando: { label: 'Analizando contenido', tone: 'sky', working: true, help: 'Se está mirando el material y eligiendo las fotografías.' },
    preparando: { label: 'Preparando storyboard', tone: 'sky', working: true, help: 'Se está armando la historia y el guion.' },
    generando: { label: 'Generando escenas', tone: 'sky', working: true, help: 'Las fotografías se están animando. Tarda entre uno y tres minutos.' },
    componiendo: { label: 'Componiendo Reel', tone: 'sky', working: true, help: 'Se está montando el video con su música y su voz.' },
    borrador_listo: { label: 'Borrador listo', tone: 'amber', help: 'Hay un Reel para revisar. Nada se publicó.' },
    en_revision: { label: 'En revisión', tone: 'amber', help: 'Alguien lo está revisando.' },
    aprobado: { label: 'Aprobado', tone: 'emerald', help: 'Aprobado para publicar. Todavía no salió a ninguna red.' },
    publicado: { label: 'Publicado', tone: 'blue', help: 'Salió a las redes.' },
    descartado: { label: 'Descartado', tone: 'gray', help: 'No se va a publicar. Se conserva con su motivo.' },
    error: { label: 'Error', tone: 'red', help: 'Una etapa falló. Se puede reintentar sin regenerar lo que ya está.' },
};

const CHIP: Record<string, string> = {
    sky: 'bg-sky-50 text-sky-700 border border-sky-200',
    amber: 'bg-amber-50 text-amber-800 border border-amber-200',
    emerald: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    blue: 'bg-blue-50 text-blue-700 border border-blue-200',
    gray: 'bg-gray-100 text-gray-600 border border-gray-200',
    red: 'bg-red-50 text-red-700 border border-red-200',
};

export const reelStateLabel = (id?: string | null) => (id && REEL_STATES[id as ReelStateId]?.label) || 'No generado';
export const reelStateChip = (id?: string | null) => CHIP[(id && REEL_STATES[id as ReelStateId]?.tone) || 'gray'] || CHIP.gray;
export const reelStateHelp = (id?: string | null) => (id && REEL_STATES[id as ReelStateId]?.help) || 'Todavía no se generó ningún Reel para esta solicitud.';
export const reelIsWorking = (id?: string | null) => Boolean(id && REEL_STATES[id as ReelStateId]?.working);

/** Las redes a las que va esta pieza. Es lo que se PINTA, no lo que se publica. */
export const REEL_NETWORKS = [
    { id: 'instagram_reels', label: 'Instagram' },
    { id: 'facebook_reels', label: 'Facebook' },
    { id: 'tiktok', label: 'TikTok' },
    { id: 'youtube_shorts', label: 'YouTube Shorts' },
];

export const fmtSeconds = (s?: number | null) => {
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return '—';
    return `${n.toFixed(n % 1 ? 1 : 0)} s`;
};
