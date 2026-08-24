// El CICLO DE VIDA de un aporte. Puro: sin base, sin red, sin Stripe, sin DOM.
//
// v4.885 — Decide en qué punto del camino está el dinero de un aporte, cuándo
// se libera, cuántos días faltan y qué transiciones son legales. Vive aparte de
// la orquestación por el mismo motivo que `seoRules.js` frente a `seoAudit.js`
// y que `ledgerSpec.js` frente a `ledger.js`: un motor de estados financieros
// que sólo se ejercita contra Stripe y una base real termina sin pruebas, y
// entonces nadie se entera de que una regla cambió de signo.
//
// ═════════════════════════════════════════════════════════════════════
// ⚠️ EL DEFECTO QUE ESTO CORRIGE: «pending» NO ES UNA FECHA.
// ═════════════════════════════════════════════════════════════════════
//
// El `bucketOf` de v4.844 decía:
//
//     if (p.stripeStatus === 'pending' || (p.availableOn && availableOn > now))
//         return 'in_transit';
//
// La primera mitad de esa condición NO DEPENDE DEL TIEMPO. `stripeStatus` es
// una columna que escribe el webhook con lo que Stripe contesta EN EL MOMENTO
// DEL COBRO, y en ese momento una balance transaction está SIEMPRE en
// `pending` — el dinero acaba de entrar. Así que todo aporte nacía con
// `stripeStatus = 'pending'` y se quedaba «En tránsito» PARA SIEMPRE, hubieran
// pasado seis días o seis meses, porque nada en la plataforma volvía a mirar
// esa fila.
//
// Lo único que la actualizaba era el botón «Sincronizar con Stripe», que es
// manual — y que además, por defecto, EXCLUÍA de sus candidatos a los pagos
// que ya tenían `availableOn`. O sea: el aporte que más necesitaba corregirse
// era precisamente el que el botón no miraba.
//
// La corrección tiene dos mitades y las dos hacen falta:
//
//   1. AQUÍ: la fecha manda sobre la columna. Si `availableOn` ya pasó, el
//      dinero está liberado, diga lo que diga un `stripeStatus` que nadie
//      actualizó. Una fecha vencida es un hecho; una columna vieja es una
//      opinión desactualizada.
//
//   2. En el barrido (`walletSweep.js`): la columna se pone al día sola,
//      contra Stripe, sin que nadie abra el módulo.
//
// Sin (1), el barrido tendría que correr para que la pantalla dijera la
// verdad. Sin (2), la columna seguiría mintiendo para siempre y el libro mayor
// nunca se enteraría de la liberación. Se arreglan las dos.
//
// ═════════════════════════════════════════════════════════════════════
// LA REGLA DE LOS 6 DÍAS: QUÉ ES Y QUÉ NO ES.
// ═════════════════════════════════════════════════════════════════════
//
// Se auditó antes de tocarla, y NO se cambió. Son DOS esperas encadenadas y
// tienen orígenes distintos:
//
//   · `availableOn`     — la fecha OFICIAL de Stripe (`balance_transaction
//                         .available_on`). No la calculamos: la leemos. Es la
//                         fuente de verdad de cuándo el proveedor suelta el
//                         dinero, y depende del país, del método de pago y del
//                         calendario bancario de Stripe. Ya se usaba así.
//
//   · `clubAvailableOn` — `availableOn` + 6 días CALENDARIO. Es el margen
//                         operativo de la plataforma, no una regla de Stripe.
//
// Que sean días CALENDARIO y no hábiles está medido, no supuesto: el código
// vigente hace `availableOn.getTime() + 6 * 24 * 60 * 60 * 1000`, que suma
// 144 horas corridas. Se conserva exactamente esa aritmética. Cambiarla a días
// hábiles movería la fecha de liberación de todos los aportes vivos, y eso es
// una decisión de negocio, no una corrección de un defecto.
//
// ⚠️ NO SE INVENTA UNA FECHA DE STRIPE QUE STRIPE NO DIO. Cuando `availableOn`
// falta —la balance transaction todavía no existía en el momento del webhook,
// que es el caso común— se PUEDE estimar para mostrar un contador, pero esa
// estimación viaja MARCADA (`estimated: true`) y NUNCA decide un bucket ni
// dispara un asiento en el libro. Presentar una estimación propia como si
// fuera el calendario de Stripe es exactamente el tipo de afirmación que este
// módulo no hace.

import { normalizeCurrency } from './money.js';

/** El margen operativo de la plataforma, en días calendario, sobre la fecha de
 *  Stripe. Es el mismo 6 que llevan `financialController`, `paymentController`
 *  y `paypalController` desde v4.421 — al tocarlo, tocar los cuatro. */
export const PLATFORM_HOLDING_DAYS = 6;

/** Lo que Stripe tarda típicamente en liberar, para ESTIMAR cuando todavía no
 *  dio su fecha. Sólo se usa para pintar un contador aproximado; nunca decide
 *  un estado ni un asiento. */
export const STRIPE_TYPICAL_HOLD_DAYS = 7;

const DIA_MS = 24 * 60 * 60 * 1000;

/* ─── LOS ESTADOS ────────────────────────────────────────────────────
 *
 * Catálogo CERRADO, como `METRIC_TYPES` en las campañas y `ENTRY_TYPES` en el
 * libro mayor. Un estado que no esté acá no se puede escribir ni consultar, así
 * que no puede aparecer en la pantalla un punto del camino que nadie declaró.
 *
 * Los ids son los que la Bóveda ya usaba (`bucketOf`) MÁS los dos que faltaban
 * —el ciclo terminaba en «disponible» y el dinero sigue moviéndose después—.
 * Conservar la nomenclatura anterior es lo que permite desplegar esto sin
 * reescribir la pantalla ni migrar una sola fila: los cuatro estados que ya se
 * pintaban significan exactamente lo mismo que antes.
 *
 * `terminal` marca el final de un camino: de ahí no se sale solo.
 */
export const LIFECYCLE_STATES = {
    processing: {
        label: 'Procesando',
        help: 'El cobro se registró y el proveedor todavía no lo confirmó.',
        order: 10,
        terminal: false,
    },
    in_transit: {
        label: 'En tránsito',
        help: 'El proveedor confirmó el cobro y retiene el dinero hasta su fecha de liberación.',
        order: 20,
        terminal: false,
    },
    available_soon: {
        label: 'Disponible próximamente',
        help: 'El proveedor liberó el dinero. Corre el margen operativo de la plataforma.',
        order: 30,
        terminal: false,
    },
    available: {
        label: 'Disponible para retiro',
        help: 'El dinero se puede usar. Disponible NO significa desembolsado.',
        order: 40,
        terminal: false,
    },
    // v4.885 — Los dos que faltaban. El ciclo anterior terminaba en
    // «disponible», que responde «¿se puede usar?» y no «¿se usó?». Entre esas
    // dos preguntas vivía todo el trabajo operativo que la Bóveda no registraba
    // en ninguna parte.
    disbursing: {
        label: 'Desembolso iniciado',
        help: 'Se registró un traslado parcial hacia el beneficiario. Todavía no cubre el total.',
        order: 50,
        terminal: false,
    },
    disbursed: {
        label: 'Desembolsado',
        help: 'El traslado hacia el beneficiario se completó y quedó comprobado.',
        order: 60,
        terminal: true,
    },
    refunded: {
        label: 'Reembolsado',
        help: 'El dinero se devolvió al aportante. Deja de contar como ingreso.',
        order: 90,
        terminal: true,
    },
    failed: {
        label: 'Fallido',
        help: 'El cobro no llegó a completarse.',
        order: 91,
        terminal: true,
    },
};

export const STATE_IDS = Object.keys(LIFECYCLE_STATES);
export const isState = (id) => Object.prototype.hasOwnProperty.call(LIFECYCLE_STATES, String(id || ''));
export const stateLabel = (id) => LIFECYCLE_STATES[id]?.label || String(id || '');

/* ─── QUÉ TRANSICIONES SON LEGALES ───────────────────────────────────
 *
 * ⚠️ EL CAMINO DEL DINERO NO RETROCEDE, y eso no es una preferencia estética:
 * es lo que impide que un aporte ya desembolsado vuelva a «disponible» porque
 * una consulta a Stripe llegó tarde o desordenada. Es la misma lección que
 * `mergeDeliveryState` en las notificaciones —los eventos del proveedor llegan
 * sin orden garantizado— aplicada a dinero, donde el precio de equivocarse es
 * pagar dos veces.
 *
 * Las dos excepciones son deliberadas y las dos son HECHOS NUEVOS, no
 * correcciones: un reembolso y un fallo pueden llegar en cualquier momento y
 * terminan el camino desde donde estén.
 */
const AVANCE = ['processing', 'in_transit', 'available_soon', 'available', 'disbursing', 'disbursed'];

/** ¿Se puede pasar de `desde` a `hacia` sin que sea un retroceso? */
export const canTransition = (desde, hacia) => {
    if (!isState(desde) || !isState(hacia)) return false;
    if (desde === hacia) return false;
    // Un reembolso o un fallo son hechos nuevos: llegan desde donde sea.
    if (hacia === 'refunded' || hacia === 'failed') return true;
    // De un terminal no se sale. Un aporte reembolsado que «vuelve» a
    // disponible sería dinero que ya se devolvió contado dos veces.
    if (LIFECYCLE_STATES[desde].terminal) return false;
    const a = AVANCE.indexOf(desde);
    const b = AVANCE.indexOf(hacia);
    if (a < 0 || b < 0) return false;
    return b > a;
};

/** El más avanzado de dos estados, para que un evento fuera de orden no haga
 *  retroceder nada. `null` significa «no había estado previo». */
export const mergeState = (previo, nuevo) => {
    if (!isState(nuevo)) return isState(previo) ? previo : null;
    if (!isState(previo)) return nuevo;
    if (previo === nuevo) return previo;
    if (canTransition(previo, nuevo)) return nuevo;
    return previo;
};

/* ─── EN QUÉ PUNTO ESTÁ UN APORTE ────────────────────────────────────
 *
 * Reemplaza al `bucketOf` de `financialController.js`, con la MISMA salida
 * para los seis estados que aquél devolvía. Lo que cambia es una sola cosa —y
 * es la corrección de fondo del módulo—: una FECHA VENCIDA gana sobre una
 * columna sin actualizar.
 *
 * `now` entra como PARÁMETRO. Una función que consulta el reloj por dentro no
 * se puede probar, y ésta decide dónde está el dinero de alguien.
 */
export const bucketOf = (p, now = new Date()) => {
    if (!p) return 'processing';

    // Los terminales primero: son hechos sobre el cobro entero y no admiten
    // matices de calendario.
    if (p.status === 'refunded') return 'refunded';
    if (p.status === 'failed') return 'failed';
    if (p.status === 'pending') return 'processing';

    const ahora = now instanceof Date ? now : new Date(now);
    const liberacionStripe = fechaValida(p.availableOn);
    const liberacionClub = fechaValida(p.clubAvailableOn);

    // ── El corazón de la corrección ──────────────────────────────────
    //
    // Con fecha de Stripe conocida, LA FECHA DECIDE. `stripeStatus` no entra
    // en esta rama a propósito: es la columna que se quedaba en 'pending' para
    // siempre. Mientras la fecha no llegue, el dinero está en tránsito; una
    // vez pasó, está liberado, aunque nadie haya sincronizado la columna.
    if (liberacionStripe) {
        if (liberacionStripe > ahora) return 'in_transit';
        // Liberado por Stripe. Ahora corre el margen de la plataforma.
        // Sin `clubAvailableOn` guardado se deriva del propio `availableOn`:
        // es aritmética exacta sobre un dato de Stripe, no una estimación.
        const disponibleEl = liberacionClub || new Date(liberacionStripe.getTime() + PLATFORM_HOLDING_DAYS * DIA_MS);
        return disponibleEl > ahora ? 'available_soon' : 'available';
    }

    // ── Sin fecha de Stripe ──────────────────────────────────────────
    //
    // No sabemos cuándo libera el proveedor, así que no podemos afirmar que
    // liberó. Se queda en tránsito y el barrido irá a preguntárselo a Stripe.
    // Es el lado seguro: decir «disponible» sin saberlo pondría a alguien a
    // pedir un retiro sobre dinero que el proveedor todavía retiene.
    //
    // `clubAvailableOn` sin `availableOn` sí decide —lo escribe PayPal, que no
    // tiene tránsito del proveedor (v4.866)— porque ahí la fecha es un dato
    // real de nuestro lado, no una estimación.
    if (liberacionClub) return liberacionClub > ahora ? 'available_soon' : 'available';

    return 'in_transit';
};

/** Una fecha utilizable, o `null`. Ni `undefined`, ni `Invalid Date`, ni una
 *  cadena vacía disfrazada de fecha. */
const fechaValida = (v) => {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
};

/* ─── EL CALENDARIO DE UN APORTE ─────────────────────────────────────
 *
 * Lo que el pedido enumera como mínimo indispensable:
 *
 *   recepción → liberación estimada → días restantes → estado → liberación real
 *
 * Todo se DERIVA de las fechas guardadas. No hay ninguna columna nueva que
 * mantener sincronizada, así que no hay dos verdades que puedan contradecirse
 * —la lección de `publicKeyOf` en Plantillas IA y de `hasBackdrop` en las
 * infografías—.
 */
export const scheduleOf = (p, now = new Date()) => {
    const ahora = now instanceof Date ? now : new Date(now);
    const recibido = fechaValida(p?.createdAt);
    const stripeLibera = fechaValida(p?.availableOn);
    const clubDispone = fechaValida(p?.clubAvailableOn);
    const estado = bucketOf(p, ahora);

    // La fecha en que el dinero queda disponible para el club. En orden de
    // preferencia: la guardada, la derivada de Stripe, la estimada.
    //
    // ⚠️ `estimated` NO es decorativo. Marca que la fecha la calculamos
    // NOSOTROS a partir de un promedio, no que la dijo Stripe. Una estimación
    // presentada como dato oficial es lo que hace que alguien planifique un
    // pago contra una fecha que no existe.
    let disponibleEl = null;
    let estimado = false;
    let fuente = null;

    if (clubDispone) {
        disponibleEl = clubDispone;
        fuente = 'guardada';
    } else if (stripeLibera) {
        disponibleEl = new Date(stripeLibera.getTime() + PLATFORM_HOLDING_DAYS * DIA_MS);
        fuente = 'derivada_de_stripe';
    } else if (recibido) {
        disponibleEl = new Date(recibido.getTime() + (STRIPE_TYPICAL_HOLD_DAYS + PLATFORM_HOLDING_DAYS) * DIA_MS);
        estimado = true;
        fuente = 'estimada';
    }

    // Los días que faltan, redondeados HACIA ARRIBA: quedan «2 días» hasta que
    // de verdad no queda ninguno. Prometer que algo está listo medio día antes
    // es peor que decir un día de más.
    const faltan = disponibleEl
        ? Math.max(0, Math.ceil((disponibleEl.getTime() - ahora.getTime()) / DIA_MS))
        : null;

    return {
        recibidoEl: recibido ? recibido.toISOString() : null,
        // Cuándo suelta el PROVEEDOR. `null` cuando Stripe todavía no lo dijo.
        stripeLiberaEl: stripeLibera ? stripeLibera.toISOString() : null,
        // Cuándo lo puede usar el CLUB: la de arriba más el margen.
        disponibleEl: disponibleEl ? disponibleEl.toISOString() : null,
        estimado,
        fuente,
        diasRestantes: faltan,
        // La fecha REAL de liberación: sólo existe una vez ocurrió. Antes de
        // eso es `null`, no la fecha prevista — confundir lo previsto con lo
        // ocurrido es cómo un calendario deja de servir para auditar.
        liberadoEl: (disponibleEl && disponibleEl <= ahora) ? disponibleEl.toISOString() : null,
        estado,
        estadoLabel: stateLabel(estado),
        holdingDays: PLATFORM_HOLDING_DAYS,
    };
};

/* ─── QUÉ HAY QUE HACER CON UN APORTE ────────────────────────────────
 *
 * El juicio que consume el barrido. Es puro para poder probarlo con fechas
 * fabricadas: un motor que decide gastar una llamada a Stripe por aporte tiene
 * que poder ejercitarse sin Stripe.
 *
 * Devuelve la acción Y EL MOTIVO. «¿Por qué este aporte no avanzó?» es la
 * pregunta que hay que poder contestar dos semanas después, y sin el motivo
 * escrito no tiene dónde mirarse — el mismo vacío que el CRM tenía antes de
 * `CrmWebhookEvent`.
 */
export const planFor = (p, now = new Date()) => {
    const ahora = now instanceof Date ? now : new Date(now);
    const estado = bucketOf(p, ahora);
    const guardado = isState(p?.lifecycleState) ? p.lifecycleState : null;

    // Un terminal no se toca. Ni se consulta a Stripe por él: gastar una
    // llamada para confirmar que un reembolso sigue siendo un reembolso es
    // gastar por nada.
    if (LIFECYCLE_STATES[estado]?.terminal) {
        return { accion: 'ninguna', estado, motivo: `Estado terminal (${stateLabel(estado)}).` };
    }

    // Sin fecha de Stripe hay que ir a preguntársela. Es el caso del aporte
    // recién cobrado, cuya balance transaction todavía no existía cuando el
    // webhook la buscó.
    if (!fechaValida(p?.availableOn)) {
        return { accion: 'consultar_stripe', estado, motivo: 'Sin fecha de liberación de Stripe: hay que pedírsela.' };
    }

    // La columna dice «pending» y la fecha ya pasó. La fila está desactualizada
    // y hay que ponerla al día contra el proveedor: es el aporte que se quedaba
    // «En tránsito» para siempre.
    if (p?.stripeStatus === 'pending' && fechaValida(p.availableOn) <= ahora) {
        return {
            accion: 'consultar_stripe',
            estado,
            motivo: 'La fecha de liberación ya pasó y la columna sigue en «pending»: hay que confirmarlo con el proveedor.',
        };
    }

    // El estado registrado se quedó atrás respecto del que dicen las fechas.
    // No hace falta Stripe para esto: es aritmética de calendario sobre datos
    // que ya tenemos, así que se anota y listo.
    if (guardado !== estado) {
        return {
            accion: 'anotar_estado',
            estado,
            desde: guardado,
            motivo: guardado
                ? `El calendario dice «${stateLabel(estado)}» y lo registrado era «${stateLabel(guardado)}».`
                : `Primera vez que se registra el estado: «${stateLabel(estado)}».`,
        };
    }

    return { accion: 'ninguna', estado, motivo: 'Al día.' };
};

/* ─── DESEMBOLSOS ────────────────────────────────────────────────────
 *
 * ⚠️ DISPONIBLE NO ES DESEMBOLSADO, y la distinción es el motivo de que esta
 * parte exista. «Disponible» responde «¿se puede usar este dinero?»;
 * «desembolsado» responde «¿se trasladó de verdad?». La Bóveda contestaba la
 * primera y no tenía dónde registrar la segunda, así que el traslado a un
 * beneficiario ocurría fuera de la plataforma y no dejaba rastro.
 */

/** Los medios de traslado. CERRADO: un medio inventado no se puede reportar ni
 *  conciliar contra un extracto bancario. */
export const DISBURSEMENT_METHODS = [
    { id: 'transferencia', label: 'Transferencia bancaria' },
    { id: 'ach', label: 'ACH / interbancaria' },
    { id: 'cheque', label: 'Cheque' },
    { id: 'efectivo', label: 'Efectivo' },
    { id: 'compensacion', label: 'Compensación interna' },
    { id: 'otro', label: 'Otro' },
];
export const METHOD_IDS = DISBURSEMENT_METHODS.map(m => m.id);
export const isMethod = (id) => METHOD_IDS.includes(String(id || ''));

/** Los estados de un desembolso. `reversed` es cómo se corrige uno: NUNCA se
 *  borra. Una operación financiera confirmada que desaparece sin rastro es
 *  justo lo que un libro existe para impedir. */
export const DISBURSEMENT_STATES = ['confirmado', 'reversado'];

/** Tipos de comprobante admitidos, con su extensión. Cerrado: lo que se sube
 *  termina alojado y servido por nosotros. */
export const RECEIPT_TYPES = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
};
export const RECEIPT_MIMES = Object.keys(RECEIPT_TYPES);
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

export const receiptExtension = (mime) => RECEIPT_TYPES[String(mime || '').toLowerCase()] || null;

/**
 * ¿Este comprobante se puede aceptar?
 *
 * Se comprueba el TIPO y el TAMAÑO, y se dicen los dos motivos por separado:
 * «archivo no válido» a secas obliga a probar a ciegas cuál de las dos cosas
 * está mal.
 */
export const checkReceipt = ({ mime, bytes } = {}) => {
    const errores = [];
    const tipo = String(mime || '').toLowerCase();
    if (!tipo) errores.push('El comprobante llegó sin tipo de archivo.');
    else if (!RECEIPT_MIMES.includes(tipo)) {
        errores.push(`Sólo se admiten PDF, JPG y PNG. Este archivo es «${tipo}».`);
    }
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) errores.push('El comprobante llegó vacío.');
    else if (n > RECEIPT_MAX_BYTES) {
        errores.push(`El comprobante pesa ${(n / 1024 / 1024).toFixed(1)} MB y el máximo es ${RECEIPT_MAX_BYTES / 1024 / 1024} MB.`);
    }
    return { ok: errores.length === 0, errores };
};

/**
 * Cuánto queda por desembolsar de un aporte, y si ya está cubierto.
 *
 * ⚠️ SE ADMITEN PARCIALES, Y NO SE MARCA COMPLETO HASTA QUE LA SUMA LLEGA.
 * Es exigencia expresa del pedido y además la única forma honesta de
 * representar un traslado que se hizo en dos giros: marcarlo completo con el
 * primero afirmaría que el beneficiario recibió todo cuando recibió la mitad.
 *
 * Los REVERSADOS no suman. Un desembolso corregido no trasladó nada, y contarlo
 * dejaría el aporte marcado como cubierto por un movimiento que se anuló.
 *
 * La tolerancia es de media unidad mínima de la moneda: sin ella, un aporte de
 * 1.484.437 pesos desembolsado en tres giros exactos podría quedar
 * eternamente a 0,0000001 de cerrarse por el redondeo del punto flotante — la
 * misma clase de problema que documenta `roundMoney` con el 8,915.
 */
export const disbursementBalance = ({ net, disbursements = [], currency = 'USD' } = {}) => {
    const code = normalizeCurrency(currency);
    const total = Number(net);
    const objetivo = Number.isFinite(total) ? Math.max(0, total) : 0;

    const vivos = (disbursements || []).filter(d => d && d.status !== 'reversado');
    const cubierto = vivos.reduce((suma, d) => suma + (Number(d.amount) || 0), 0);

    // Media unidad mínima de PRESENTACIÓN: en pesos, medio peso; en dólares,
    // medio centavo. Es holgura contra el punto flotante, no contra un faltante
    // real — un giro que se queda corto de verdad no cae dentro de esto.
    const tolerancia = code === 'COP' || code === 'CLP' || code === 'JPY' ? 0.5 : 0.005;

    const restante = Math.max(0, objetivo - cubierto);
    const completo = objetivo > 0 && restante <= tolerancia;

    return {
        currency: code,
        objetivo,
        cubierto,
        restante: completo ? 0 : restante,
        completo,
        parcial: cubierto > 0 && !completo,
        cuantos: vivos.length,
        reversados: (disbursements || []).length - vivos.length,
    };
};

/** El estado que le corresponde a un aporte según lo que se le haya
 *  desembolsado. `null` significa «los desembolsos no tienen nada que decir»:
 *  no hay ninguno, y entonces manda el calendario. */
export const stateFromDisbursements = (balance) => {
    if (!balance || balance.cuantos === 0) return null;
    return balance.completo ? 'disbursed' : 'disbursing';
};

/**
 * Un desembolso propuesto, saneado y juzgado. El modelo ESCRIBE y el CÓDIGO
 * DECIDE — la regla del sitio desde `validateEmergencyCopy`, acá aplicada a un
 * formulario administrativo que mueve dinero.
 *
 * Se devuelven TODOS los errores, no el primero: «datos inválidos» obliga a
 * corregir de a un campo por intento.
 */
export const validateDisbursement = (raw, { balance, now = new Date() } = {}) => {
    const errores = [];
    const avisos = [];

    const monto = Number(raw?.amount);
    if (!Number.isFinite(monto) || monto <= 0) {
        errores.push('El monto tiene que ser un número mayor que cero.');
    } else if (balance) {
        // Tolerancia de un céntimo por el redondeo, no por generosidad: pasarse
        // del disponible es registrar un traslado que no pudo ocurrir.
        if (monto > balance.restante + 0.01) {
            errores.push(
                `El monto (${monto}) supera lo que queda por desembolsar (${balance.restante}). ` +
                `Un desembolso no puede trasladar más de lo que el aporte tiene.`
            );
        }
    }

    const fecha = fechaValida(raw?.disbursedAt);
    if (!fecha) {
        errores.push('Falta la fecha del desembolso.');
    } else {
        const ahora = now instanceof Date ? now : new Date(now);
        // Un día de holgura: la función corre en UTC y quien registra puede
        // estar en otro huso. Más allá de eso es una fecha mal escrita.
        if (fecha.getTime() > ahora.getTime() + DIA_MS) {
            errores.push('La fecha del desembolso está en el futuro. Se registra lo que ya ocurrió, no lo que se planea.');
        }
    }

    const beneficiario = String(raw?.beneficiary || '').trim();
    if (!beneficiario) errores.push('Falta el beneficiario o prestatario.');
    if (beneficiario.length > 200) errores.push('El nombre del beneficiario es demasiado largo (máximo 200 caracteres).');

    if (!isMethod(raw?.method)) {
        errores.push(`Medio de transferencia desconocido. Los admitidos son: ${METHOD_IDS.join(', ')}.`);
    }

    const referencia = String(raw?.reference || '').trim();
    if (!referencia) {
        // AVISO, no error: un traslado en efectivo puede no tener número, y
        // bloquear el registro por eso dejaría el movimiento sin anotar en
        // ninguna parte, que es peor que anotarlo sin referencia.
        avisos.push('Sin número de referencia no se puede cruzar este desembolso con un extracto bancario.');
    } else if (referencia.length > 120) {
        errores.push('La referencia es demasiado larga (máximo 120 caracteres).');
    }

    const correo = String(raw?.notifyEmail || '').trim();
    if (raw?.notify && !correo) {
        errores.push('Se pidió notificar al beneficiario pero no hay a qué dirección escribirle.');
    }
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
        errores.push('La dirección de correo del beneficiario no es válida.');
    }

    if (String(raw?.notes || '').length > 2000) {
        errores.push('Las observaciones son demasiado largas (máximo 2000 caracteres).');
    }

    return { ok: errores.length === 0, errores, avisos };
};

/**
 * El desembolso saneado que se va a escribir. Sólo salen los campos
 * declarados: lo que no esté acá no se puede ni expresar en la petición, que es
 * el patrón `stripProtected` del resto del sitio. Un cuerpo que traiga
 * `status: 'reversado'` o un `id` no cambia nada.
 */
export const disbursementShape = (raw) => ({
    amount: Math.round((Number(raw?.amount) || 0) * 100) / 100,
    disbursedAt: fechaValida(raw?.disbursedAt),
    beneficiary: String(raw?.beneficiary || '').trim().slice(0, 200),
    method: isMethod(raw?.method) ? raw.method : 'otro',
    reference: String(raw?.reference || '').trim().slice(0, 120) || null,
    notes: String(raw?.notes || '').trim().slice(0, 2000) || null,
    notifyEmail: String(raw?.notifyEmail || '').trim().toLowerCase().slice(0, 200) || null,
    notify: raw?.notify === true,
});

/* ─── LA LÍNEA DE TIEMPO ─────────────────────────────────────────────
 *
 * ⚠️ LOS EVENTOS SON DATOS, NUNCA SE FABRICAN EN LA PANTALLA. Es exigencia
 * expresa del pedido y tiene un motivo concreto: una línea de tiempo compuesta
 * en el navegador a partir de fechas sueltas afirma que algo ocurrió sin que
 * nadie lo haya registrado, y entonces deja de servir para auditar — que es lo
 * único para lo que sirve una línea de tiempo.
 *
 * Esta función ORDENA y ROTULA lo que ya está guardado. No inventa un evento
 * que no esté en la tabla.
 */
export const EVENT_LABELS = {
    received: 'Aporte recibido',
    processing: 'Procesamiento iniciado',
    in_transit: 'En tránsito en el proveedor',
    available_soon: 'Fondos liberados por el proveedor',
    available: 'Disponible para retiro',
    disbursing: 'Desembolso parcial registrado',
    disbursed: 'Desembolso registrado',
    notified: 'Beneficiario notificado',
    notify_failed: 'No se pudo notificar al beneficiario',
    reversed: 'Desembolso reversado',
    refunded: 'Aporte reembolsado',
    failed: 'Cobro fallido',
    reconciled: 'Conciliado con el proveedor',
};

export const eventLabel = (kind) => EVENT_LABELS[kind] || String(kind || '');

/** La línea de tiempo lista para pintar: ordenada por cuándo ocurrió y con el
 *  rótulo puesto. Los empates se rompen por el orden del estado, no por el id:
 *  dos eventos del mismo segundo tienen que salir siempre en el mismo orden o
 *  la ficha se ve distinta en cada carga. */
export const buildTimeline = (events = []) => {
    return (events || [])
        .filter(e => e && e.kind)
        .map(e => ({
            kind: e.kind,
            label: eventLabel(e.kind),
            at: e.occurredAt || e.createdAt || null,
            from: e.fromState || null,
            to: e.toState || null,
            actor: e.actorLabel || e.actorId || null,
            actorKind: e.actorKind || 'system',
            reference: e.reference || null,
            note: e.note || null,
        }))
        .sort((a, b) => {
            const ta = a.at ? new Date(a.at).getTime() : 0;
            const tb = b.at ? new Date(b.at).getTime() : 0;
            if (ta !== tb) return ta - tb;
            const oa = LIFECYCLE_STATES[a.to]?.order ?? 0;
            const ob = LIFECYCLE_STATES[b.to]?.order ?? 0;
            return oa - ob;
        });
};

export default {
    PLATFORM_HOLDING_DAYS, STRIPE_TYPICAL_HOLD_DAYS,
    LIFECYCLE_STATES, STATE_IDS, isState, stateLabel,
    canTransition, mergeState, bucketOf, scheduleOf, planFor,
    DISBURSEMENT_METHODS, METHOD_IDS, isMethod, DISBURSEMENT_STATES,
    RECEIPT_TYPES, RECEIPT_MIMES, RECEIPT_MAX_BYTES, receiptExtension, checkReceipt,
    disbursementBalance, stateFromDisbursements, validateDisbursement, disbursementShape,
    EVENT_LABELS, eventLabel, buildTimeline,
};
