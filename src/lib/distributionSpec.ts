/**
 * Distribución multi-destino — el espejo del criterio en el navegador.
 *
 * v4.864. Es DELIBERADAMENTE mínimo: rótulos, colores y las pocas constantes
 * que hacen falta para pintar. **No hay aritmética de fechas acá.**
 *
 * ⚠️ EL CALENDARIO LO RESUELVE EL SERVIDOR Y VIAJA RESUELTO (`POST
 * /distribution/preview`). La pantalla no rehace el cálculo: con dos
 * implementaciones, la línea de tiempo del asistente y las horas que de verdad
 * se guardan podrían discrepar, y eso se lee como que la programación no
 * funciona. Es la regla que la Bóveda dejó escrita en v4.849 con el período.
 *
 * Lo que sí se espeja son los rótulos, y `npm run test:distribution` comprueba
 * que coincidan con los del servidor: un estado que exista en un lado y no en
 * el otro se pinta como texto crudo.
 */

export type JobStatus =
    | 'pending' | 'scheduled' | 'processing' | 'awaiting_manual'
    | 'published' | 'failed' | 'no_permission' | 'rate_limited'
    | 'needs_reconnect' | 'paused' | 'cancelled';

export type CampaignStatus =
    | 'draft' | 'scheduled' | 'running' | 'paused'
    | 'done' | 'partial' | 'failed' | 'cancelled';

export type TargetType = 'page' | 'instagram' | 'group_manual';
export type ContentKind = 'text' | 'link' | 'image' | 'video';

/** Rótulo y color de cada estado de destino. El color CODIFICA el desenlace. */
export const JOB_STATUS_UI: Record<JobStatus, { label: string; tone: 'ok' | 'fail' | 'wait' | 'warn' | 'off' }> = {
    pending:         { label: 'Pendiente',             tone: 'wait' },
    scheduled:       { label: 'Programada',            tone: 'wait' },
    processing:      { label: 'Procesando',            tone: 'wait' },
    awaiting_manual: { label: 'Esperando publicación', tone: 'warn' },
    published:       { label: 'Publicada',             tone: 'ok'   },
    failed:          { label: 'Fallida',               tone: 'fail' },
    no_permission:   { label: 'Sin permisos',          tone: 'fail' },
    rate_limited:    { label: 'Límite alcanzado',      tone: 'warn' },
    needs_reconnect: { label: 'Requiere reconexión',   tone: 'fail' },
    paused:          { label: 'Pausada',               tone: 'off'  },
    cancelled:       { label: 'Cancelada',             tone: 'off'  },
};

export const CAMPAIGN_STATUS_UI: Record<CampaignStatus, { label: string; tone: 'ok' | 'fail' | 'wait' | 'warn' | 'off' }> = {
    draft:     { label: 'Borrador',               tone: 'off'  },
    scheduled: { label: 'Programada',             tone: 'wait' },
    running:   { label: 'En curso',               tone: 'wait' },
    paused:    { label: 'Pausada',                tone: 'warn' },
    done:      { label: 'Completada',             tone: 'ok'   },
    // Una campaña con destinos fallidos NUNCA se pinta en verde. Es la
    // contradicción que este proyecto ya prohibió una vez: insignia verde
    // sobre una tarjeta que dice que algo falló.
    partial:   { label: 'Completada con fallos',  tone: 'warn' },
    failed:    { label: 'Fallida',                tone: 'fail' },
    cancelled: { label: 'Cancelada',              tone: 'off'  },
};

export const TONE_CLASS: Record<'ok' | 'fail' | 'wait' | 'warn' | 'off', string> = {
    ok:   'bg-emerald-50 text-emerald-700 border-emerald-200',
    fail: 'bg-red-50 text-red-700 border-red-200',
    wait: 'bg-blue-50 text-blue-700 border-blue-200',
    warn: 'bg-amber-50 text-amber-700 border-amber-200',
    off:  'bg-gray-100 text-gray-600 border-gray-200',
};

export const CONTENT_KIND_UI: Record<ContentKind, { label: string; hint: string }> = {
    text:  { label: 'Solo texto', hint: 'Un mensaje sin archivo.' },
    link:  { label: 'Enlace',     hint: 'Texto y un enlace. Es lo que usa «compartir una publicación».' },
    image: { label: 'Imagen',     hint: 'Una foto con su texto.' },
    video: { label: 'Video',      hint: 'Un video con su texto. Sirve para un Reel ya montado.' },
};

export const TARGET_TYPE_UI: Record<TargetType, { label: string; viaApi: boolean }> = {
    page:         { label: 'Página de Facebook', viaApi: true },
    instagram:    { label: 'Instagram',          viaApi: true },
    group_manual: { label: 'Grupo de Facebook',  viaApi: false },
};

export const INTERVAL_PRESETS = [5, 10, 15, 30, 60];
export const MIN_INTERVAL_MINUTES = 5;

/**
 * El aviso del modo asistido. Se pinta junto al botón de programar, no sólo en
 * la lista de grupos: quien va a gastar el gesto es quien tiene que leerlo.
 */
export const MANUAL_NOTICE =
    'Meta retiró la API de Grupos el 22 de abril de 2024. La plataforma deja el texto y el archivo listos y registra el resultado; publicar en el grupo lo hace una persona.';

export const statusUI = (s: string) =>
    JOB_STATUS_UI[s as JobStatus] || { label: s, tone: 'off' as const };

export const campaignUI = (s: string) =>
    CAMPAIGN_STATUS_UI[s as CampaignStatus] || { label: s, tone: 'off' as const };
