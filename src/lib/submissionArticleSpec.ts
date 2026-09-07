// ════════════════════════════════════════════════════════════════════════════
// Solicitud → artículo — el espejo MÍNIMO del navegador (v4.1000)
//
// Sólo lo que hace falta para PINTAR: rótulos, tonos y los períodos del
// informe. El criterio —qué etapa sigue, qué transición vale, cómo se
// puntúa una portada— vive en el servidor y viaja RESUELTO en la respuesta
// (`nextStates`, `stages`, `score`). Copiarlo acá daría dos verdades.
// ════════════════════════════════════════════════════════════════════════════

export type ArticleStateId =
    | 'recibida' | 'analizando' | 'generando' | 'borrador_listo' | 'en_revision'
    | 'requiere_info' | 'aprobado' | 'publicado' | 'descartado' | 'error';

export const ARTICLE_STATES: Record<ArticleStateId, { label: string; tone: string; working?: boolean; help: string }> = {
    recibida: { label: 'Recibida', tone: 'sky', working: true, help: 'En cola: el artículo se genera solo en el próximo minuto.' },
    analizando: { label: 'Analizando', tone: 'sky', working: true, help: 'Se está mirando el material y eligiendo la portada.' },
    generando: { label: 'Generando borrador', tone: 'sky', working: true, help: 'Se está redactando el artículo y su SEO.' },
    borrador_listo: { label: 'Borrador listo', tone: 'amber', help: 'Hay un borrador para revisar. Nada se publicó.' },
    en_revision: { label: 'En revisión', tone: 'amber', help: 'Alguien lo está revisando.' },
    requiere_info: { label: 'Requiere información', tone: 'amber', help: 'Falta un dato y hay que pedírselo a quien envió.' },
    aprobado: { label: 'Aprobado', tone: 'emerald', help: 'Aprobado para publicar. Todavía no está en línea.' },
    publicado: { label: 'Publicado', tone: 'blue', help: 'Está en línea y se mide.' },
    descartado: { label: 'Descartado', tone: 'gray', help: 'No se va a publicar. Se conserva con su motivo.' },
    error: { label: 'Error', tone: 'red', help: 'Una etapa falló. Se puede reintentar sin regenerar todo.' },
};

const CHIP: Record<string, string> = {
    sky: 'bg-sky-50 text-sky-700 border border-sky-200',
    amber: 'bg-amber-50 text-amber-800 border border-amber-200',
    emerald: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    blue: 'bg-blue-50 text-blue-700 border border-blue-200',
    gray: 'bg-gray-100 text-gray-600 border border-gray-200',
    red: 'bg-red-50 text-red-700 border border-red-200',
};

export const articleStateLabel = (id?: string | null) => (id && ARTICLE_STATES[id as ArticleStateId]?.label) || (id || 'No generado');
export const articleStateChip = (id?: string | null) => CHIP[(id && ARTICLE_STATES[id as ArticleStateId]?.tone) || 'gray'] || CHIP.gray;
export const articleIsWorking = (id?: string | null) => Boolean(id && ARTICLE_STATES[id as ArticleStateId]?.working);

/** Lo que se pinta en el listado: cuatro palabras, no diez estados. */
export const articleBadge = (id?: string | null): { label: string; chip: string } => {
    if (!id) return { label: 'No generado', chip: CHIP.gray };
    if (articleIsWorking(id)) return { label: 'Generando', chip: CHIP.sky };
    if (id === 'publicado') return { label: 'Publicado', chip: CHIP.blue };
    if (id === 'error') return { label: 'Error', chip: CHIP.red };
    if (id === 'descartado') return { label: 'Descartado', chip: CHIP.gray };
    return { label: 'Borrador', chip: CHIP.amber };
};

export const IMPACT_PERIODS: { id: string; label: string }[] = [
    { id: 'h24', label: 'Últimas 24 horas' },
    { id: 'd7', label: '7 días' },
    { id: 'd30', label: '30 días' },
    { id: 'todo', label: 'Todo el período' },
];

export const fmtInt = (n: number) => new Intl.NumberFormat('es-CO').format(Math.round(Number(n) || 0));
export const fmtDuration = (sec: number) => {
    const s = Math.max(0, Math.round(Number(sec) || 0));
    const m = Math.floor(s / 60);
    return m ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
};

export default { ARTICLE_STATES, articleStateLabel, articleStateChip, articleIsWorking, articleBadge, IMPACT_PERIODS, fmtInt, fmtDuration };
