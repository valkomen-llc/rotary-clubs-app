/**
 * Espejo MÍNIMO del criterio de la conciliación — v4.1014
 *
 * ⚠️ ES MÍNIMO A PROPÓSITO. Acá vive SÓLO lo que hace falta para PINTAR: los
 * rótulos y qué clase de aporte es cada uno, que decide si se ofrece una
 * casilla y cuál barra de acciones aparece.
 *
 * Lo que NO está y no puede estar:
 *
 *   · `groupByTransfer` — a qué traslado pertenece una selección lo resuelve el
 *     servidor (`/disbursement-batches/resolve`) y viaja RESUELTO. Con dos
 *     agrupamientos, la pantalla diría «una conciliación» y saldrían dos.
 *   · `validateResend` — quién decide si un reenvío se puede hacer es el
 *     servidor. Con dos criterios, la pantalla ofrecería un envío que la API
 *     rechaza, o peor, al revés.
 *   · `reconciliationTotals` — las cifras del documento las compone el
 *     servidor. Dos aritméticas sobre el mismo traslado dirían dos totales, y
 *     lo que se separaría es lo que un club cree que recibió.
 *
 * Lo comprueba una prueba que verifica su AUSENCIA.
 */

/** Las dos formas del giro. Espejo de `DISBURSED_BUCKETS` en el servidor. */
export const DISBURSED_BUCKETS = ['disbursed', 'disbursing'];

export const isDisbursedBucket = (bucket?: string | null): boolean =>
    DISBURSED_BUCKETS.includes(String(bucket || ''));

/** Las dos clases de selección. Nunca se mezclan: ver `selectionClassOf`. */
export type ClaseSeleccion = 'disponible' | 'trasladado' | 'ninguna';

/**
 * La CLASE de un aporte para la selección.
 *
 * ⚠️ SOBRE `disponible` SE REGISTRA UN GIRO —mueve dinero— Y SOBRE
 * `trasladado` SE REENVÍA UN DOCUMENTO —no mueve nada—. Un botón que actuara
 * sobre una mezcla haría una de las dos cosas mal, y una de ellas es dinero.
 * Por eso la barra de acciones mira la clase y con una mezcla no ejecuta: lo
 * dice y ofrece quedarse con una.
 *
 * Esto decide qué se PINTA. Quién puede de verdad es el servidor, que vuelve a
 * comprobarlo y puede saltarse un aporte con su motivo.
 */
export const selectionClassOf = (
    mov: { id?: string; status?: string; bucket?: string; availableOn?: string | null } | null | undefined,
    restante = 0,
): ClaseSeleccion => {
    if (!mov?.id) return 'ninguna';
    if (mov.status === 'refunded' || mov.status === 'failed') return 'ninguna';
    if (isDisbursedBucket(mov.bucket)) return 'trasladado';
    if (mov.status === 'pending') return 'ninguna';
    const retenido = !!(mov.availableOn && new Date(mov.availableOn) > new Date());
    if (retenido) return 'ninguna';
    return restante > 0.005 ? 'disponible' : 'ninguna';
};

/** Cómo se rotula cada estado de un envío en el historial. */
export const ESTADO_ENVIO: Record<string, { label: string; cls: string }> = {
    enviado: { label: 'Enviada', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    parcial: { label: 'Enviada en parte', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
    reenviada: { label: 'Reenviada', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
    fallido: { label: 'Error de entrega', cls: 'bg-red-50 text-red-700 border-red-200' },
    omitido: { label: 'No se envió', cls: 'bg-gray-50 text-gray-600 border-gray-200' },
    duplicado: { label: 'Ya se había enviado', cls: 'bg-gray-50 text-gray-600 border-gray-200' },
    sin_destinatario: { label: 'Sin destinatario', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
};

/** Y cada resultado por destinatario. */
export const ESTADO_DESTINATARIO: Record<string, { label: string; cls: string }> = {
    enviado: { label: 'Enviado', cls: 'bg-emerald-100 text-emerald-800' },
    fallido: { label: 'Falló', cls: 'bg-red-100 text-red-700' },
    duplicado: { label: 'Ya lo tenía', cls: 'bg-gray-100 text-gray-600' },
    omitido: { label: 'Omitido', cls: 'bg-amber-100 text-amber-800' },
};

/**
 * La frase que distingue una conciliación de un aviso de giro. Es la MISMA que
 * manda el servidor; acá se muestra en el modal ANTES de enviar, para que
 * quien lo pide sepa exactamente qué va a leer el destinatario.
 */
export const RECONCILIATION_NOTE =
    'Este mensaje corresponde únicamente a una notificación y conciliación del '
    + 'movimiento previamente efectuado. No representa un nuevo traslado.';

/** El aviso que la pantalla pinta junto al botón: reenviar no mueve dinero. */
export const AVISO_SIN_MOVIMIENTO =
    'Reenviar la conciliación no crea un desembolso, no cambia ningún saldo y no '
    + 'toca el estado financiero de estos aportes. Es sólo el documento y el correo.';

export default {
    DISBURSED_BUCKETS, isDisbursedBucket, selectionClassOf,
    ESTADO_ENVIO, ESTADO_DESTINATARIO, RECONCILIATION_NOTE, AVISO_SIN_MOVIMIENTO,
};
