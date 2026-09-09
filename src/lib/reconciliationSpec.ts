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
 *   · `checkExtraAttachments` — el VEREDICTO sobre un archivo adjunto lo da el
 *     servidor. Acá viven sus LÍMITES, que es otra cosa: sirven para avisar
 *     antes de gastar la subida, como `checkFileMeta` en las Solicitudes de
 *     contenido. Con el veredicto duplicado, la pantalla aceptaría un archivo
 *     que la API rechaza —o al revés, y entonces no se podría adjuntar algo
 *     perfectamente válido—.
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

/* ─── EL ÁMBITO (v4.1015) ────────────────────────────────────────────
 *
 * ⚠️ SÓLO RÓTULOS. Qué ámbito le toca a una selección lo decide el SERVIDOR y
 * viaja resuelto en `scope`: con el criterio también acá, la pantalla podría
 * prometer una conciliación consolidada y salir la de un lote —o al revés—, y
 * lo que se separaría es qué documento recibe un tercero. Es la misma razón
 * por la que este espejo no trae `planReconciliation` ni `validateResend`.
 */
export type AmbitoConciliacion = 'traslado' | 'seleccion';

export const AMBITO_LABEL: Record<AmbitoConciliacion, { titulo: string; bajada: string }> = {
    traslado: {
        titulo: 'Conciliación del traslado',
        bajada: 'Relación completa de un giro ya efectuado',
    },
    seleccion: {
        titulo: 'Conciliación consolidada',
        bajada: 'Relación de los aportes elegidos, con la referencia de cada movimiento',
    },
};

/** Lo que se le dice a quien va a mandar una consolidada, junto al botón. */
/* ─── DE QUÉ MOVIMIENTO SALIÓ UNA FILA — v4.1018 ─────────────────────
 *
 * ⚠️ ESPEJO DE `sourceKindLabel` EN `server/lib/reconciliationSpec.js`, y está
 * duplicado a propósito como el resto de este archivo. Lo pintan el PDF, el CSV
 * y este modal: escrito a mano en cada uno, una clase nueva sale mal en dos de
 * ellos y nadie lo nota. Pasó con `agrupacion` —un giro conjunto anterior a
 * v4.996— que el modal rotulaba «Giro suelto», afirmando de un traslado
 * agrupado justo lo contrario de lo que es.
 *
 * Si cambia uno, cambiar el otro: lo comprueba `test:reconciliation`.
 */
export type ClaseMovimiento = 'lote' | 'agrupacion' | 'suelto';

export const sourceKindLabel = (kind?: string | null): string =>
    (String(kind) === 'suelto' ? 'Giro suelto' : 'Traslado agrupado');

/* ─── LOS ARCHIVOS ADICIONALES — v4.1020 ─────────────────────────────
 *
 * ⚠️ SON LÍMITES, NO EL VEREDICTO. Quien decide si un archivo se admite es el
 * servidor (`checkExtraAttachments`); esto existe para no gastar una subida —y
 * la espera del envío— en un archivo que se va a rechazar, y para poder DECIR
 * los topes en la pantalla en vez de que se descubran con un error.
 *
 * Si cambian allá, cambian acá: lo comprueba `test:reconciliation`.
 */
export const EXTRA_MAX_FILES = 5;

/** ⚠️ EL TOPE ES DEL CONJUNTO Y SALE DEL CUERPO DE LA PETICIÓN, no del correo:
 *  estos archivos viajan en la MISMA petición del reenvío y una función
 *  serverless corta en ~4,5 MB. Ver el criterio del servidor. */
export const EXTRA_MAX_TOTAL_BYTES = 4 * 1024 * 1024;

export const EXTRA_TYPES_LABEL = 'PDF, JPG o PNG';

/** Por MIME **y** por extensión: el carrete de un móvil manda el tipo vacío. */
export const isAcceptableExtra = (mime?: string | null, name?: string | null): boolean => {
    const m = String(mime || '').toLowerCase().trim();
    if (['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'].includes(m)) return true;
    const ext = String(name || '').toLowerCase().match(/\.([a-z0-9]{1,5})$/)?.[1] || '';
    return ['pdf', 'jpg', 'jpeg', 'png'].includes(ext);
};

export const AVISO_CONSOLIDADA =
    'Los aportes elegidos vienen de más de un movimiento. Se genera UN documento '
    + 'consolidado que conserva la referencia de cada traslado original; ninguno de '
    + 'ellos se modifica.';

export default {
    sourceKindLabel,

    DISBURSED_BUCKETS, isDisbursedBucket, selectionClassOf, AMBITO_LABEL, AVISO_CONSOLIDADA,
    ESTADO_ENVIO, ESTADO_DESTINATARIO, RECONCILIATION_NOTE, AVISO_SIN_MOVIMIENTO,
    EXTRA_MAX_FILES, EXTRA_MAX_TOTAL_BYTES, EXTRA_TYPES_LABEL, isAcceptableExtra,
};
