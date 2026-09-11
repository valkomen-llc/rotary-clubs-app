// ════════════════════════════════════════════════════════════════════════════
// Solicitud → Reel — el espejo MÍNIMO del navegador (v4.1006 · v4.1012)
//
// Sólo lo que hace falta para PINTAR: rótulos y tonos. El criterio —qué fotos
// se eligen, qué etapa sigue, a qué estado se puede pasar, cuántos créditos
// cuesta— vive en el servidor y viaja RESUELTO en la respuesta (`stages`,
// `nextStates`, `estimate`, `selection`). Copiarlo acá daría dos verdades
// sobre el mismo Reel, y lo que se separaría es qué se le cobra a alguien.
// ════════════════════════════════════════════════════════════════════════════

export type ReelStateId =
    | 'recibida' | 'analizando' | 'preparando' | 'configurando' | 'generando' | 'componiendo'
    | 'borrador_listo' | 'en_revision' | 'aprobado' | 'publicado' | 'descartado' | 'incompleto' | 'error';

export const REEL_STATES: Record<ReelStateId, { label: string; tone: string; working?: boolean; help: string }> = {
    recibida: { label: 'En cola', tone: 'sky', working: true, help: 'En cola: el Reel se prepara solo en el próximo minuto.' },
    analizando: { label: 'Analizando contenido', tone: 'sky', working: true, help: 'Se está mirando el material y eligiendo las fotografías.' },
    preparando: { label: 'Preparando storyboard', tone: 'sky', working: true, help: 'Se está armando la historia y el guion.' },
    // ⚠️ `working` AUSENTE A PROPÓSITO: es lo que apaga el sondeo del navegador.
    // Un Reel esperando confirmación no tiene nada que avanzar, y sondearlo cada
    // cuatro segundos sería una petición por nada mientras alguien lee.
    configurando: { label: 'Configurando', tone: 'violet', help: 'Preparado y esperando confirmación. Todavía no se gastó ni un crédito de video.' },
    generando: { label: 'Generando escenas', tone: 'sky', working: true, help: 'Las fotografías se están animando. Tarda entre uno y tres minutos.' },
    componiendo: { label: 'Componiendo Reel', tone: 'sky', working: true, help: 'Se está montando el video con su música y su voz.' },
    borrador_listo: { label: 'Borrador listo', tone: 'amber', help: 'Hay un Reel para revisar. Nada se publicó.' },
    en_revision: { label: 'En revisión', tone: 'amber', help: 'Alguien lo está revisando.' },
    aprobado: { label: 'Aprobado', tone: 'emerald', help: 'Aprobado para publicar. Todavía no salió a ninguna red.' },
    publicado: { label: 'Publicado', tone: 'blue', help: 'Salió a las redes.' },
    descartado: { label: 'Descartado', tone: 'gray', help: 'No se va a publicar. Se conserva con su motivo.' },
    // v4.1028: `working` AUSENTE a propósito — no hay nada que sondear hasta que
    // alguien pulse «Continuar». Las escenas ya generadas están guardadas.
    incompleto: { label: 'Incompleto', tone: 'amber', help: 'Faltan escenas. Las ya generadas están guardadas y no vuelven a consumir créditos: se continúa sólo lo pendiente.' },
    error: { label: 'Error', tone: 'red', help: 'Una etapa falló. Se puede reintentar sin regenerar lo que ya está.' },
};

const CHIP: Record<string, string> = {
    sky: 'bg-sky-50 text-sky-700 border border-sky-200',
    violet: 'bg-violet-50 text-violet-700 border border-violet-200',
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

/**
 * ⚠️ ACÁ NO HAY CRITERIO DE DURACIÓN, DE CRÉDITOS NI DE SELECCIÓN, y su
 * ausencia es deliberada (v4.1012). Cuánto puede durar la pieza con este
 * material, qué fotografías se proponen, si el plan se puede confirmar y
 * cuántos créditos va a costar lo resuelve el SERVIDOR y viaja ya resuelto en
 * `planner`. Copiarlo acá daría dos verdades sobre el mismo Reel, y lo que se
 * separaría es cuánto se le cobra a alguien y qué duración se le promete.
 *
 * Lo único que vive en el navegador es lo que se PINTA.
 */
export const SLOT_TONE: Record<string, string> = {
    contexto: 'bg-sky-100 text-sky-700',
    personas: 'bg-emerald-100 text-emerald-700',
    accion: 'bg-amber-100 text-amber-700',
    resultado: 'bg-fuchsia-100 text-fuchsia-700',
    cierre: 'bg-indigo-100 text-indigo-700',
    libre: 'bg-gray-100 text-gray-600',
};
