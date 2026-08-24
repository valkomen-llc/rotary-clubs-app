// A QUIÉN se le avisa de un desembolso y CON QUÉ TEXTO.
//
// v4.888 — Puro: sin base, sin red, sin Meta, sin DOM. El criterio vive aparte
// de la orquestación por el mismo motivo que `walletLifecycle.js` frente a
// `disbursements.js`: aquí se decide a quién se le escribe y qué dice el
// mensaje, y eso tiene que poder probarse sin una cuenta de WhatsApp.
//
// ═════════════════════════════════════════════════════════════════════
// ⚠️ WHATSAPP NO ADMITE TEXTO LIBRE HACIA UN DESCONOCIDO.
// ═════════════════════════════════════════════════════════════════════
//
// Es el hecho que decide TODO el diseño de este archivo, y no es una
// preferencia nuestra: fuera de la ventana de 24 horas desde el último mensaje
// entrante, Meta SÓLO entrega PLANTILLAS previamente aprobadas. Un beneficiario
// al que le vamos a avisar de un giro casi nunca nos escribió antes, así que
// componer el mensaje al vuelo —como se hace con el correo— produciría un
// rechazo de Meta en cada envío.
//
// De ahí las tres consecuencias que gobiernan el módulo:
//
//   1. El texto de WhatsApp está ESTANDARIZADO y es una constante de este
//      archivo, no algo que se redacte por sitio. Lo que cambia entre sitios
//      son las VARIABLES.
//
//   2. La plantilla hay que ENVIARLA A META y esperar su aprobación, una sola
//      vez para toda la plataforma. Mientras no esté aprobada, no se manda y
//      se DICE — nunca se intenta y se falla mudo. Es la regla que este
//      proyecto ya dejó escrita con los recorridos sembrados (v4.701): «una
//      plantilla la aprueba Meta y vive en la cuenta del cliente; sembrar algo
//      que apunte a plantillas inventadas daría uno que falla en el primer
//      envío o —peor— que parece funcionar».
//
//   3. Las variables de Meta son POSICIONALES (`{{1}}`, `{{2}}`…), no con
//      nombre. El orden es parte del contrato con Meta: cambiarlo sin volver a
//      someter la plantilla manda los datos a los huecos equivocados —el nombre
//      del beneficiario donde va el monto— sin ningún error. Por eso el orden
//      se declara UNA vez, en `WA_VARIABLES`, y de ahí salen tanto el cuerpo
//      como los valores.
//
// El CORREO no tiene esa restricción y sigue componiéndose con los bloques de
// `notificationTemplate.js`, que ya permite personalizar por sitio. Son dos
// canales con dos reglas distintas y unificarlos sería inventar una limitación
// donde no la hay, o saltarse una donde sí la hay.

/* ─── LOS CANALES ────────────────────────────────────────────────────
 *
 * Catálogo CERRADO. Un canal que no esté acá no se puede pedir ni registrar,
 * así que no puede aparecer en la ficha un aviso que nadie sabe de dónde salió.
 */
export const NOTICE_CHANNELS = {
    email: {
        label: 'Correo electrónico',
        help: 'Se compone con la plantilla del sitio. Admite texto libre.',
        requiresApprovedTemplate: false,
    },
    whatsapp: {
        label: 'WhatsApp',
        help: 'Sale con una plantilla aprobada por Meta. El texto es el mismo para toda la plataforma; lo que cambia son los datos.',
        requiresApprovedTemplate: true,
    },
};
export const CHANNEL_IDS = Object.keys(NOTICE_CHANNELS);
export const isChannel = (id) => Object.prototype.hasOwnProperty.call(NOTICE_CHANNELS, String(id || ''));

/* ─── LA PLANTILLA ESTÁNDAR DE WHATSAPP ──────────────────────────────
 *
 * ⚠️ EL ORDEN DE `WA_VARIABLES` ES EL CONTRATO CON META. Meta numera las
 * variables por posición, así que reordenarlas sin volver a someter la
 * plantilla pone cada dato en el hueco de otro —silenciosamente—. Al agregar
 * una variable, agregarla AL FINAL y volver a enviar la plantilla a revisión.
 *
 * `id` es de dónde sale el valor; `label` es para la pantalla del operador.
 */
export const WA_VARIABLES = [
    { id: 'beneficiary', label: 'Beneficiario', sample: 'Fundación Colombiana de Rotarios' },
    { id: 'amount', label: 'Monto con su moneda', sample: 'US$ 182,43' },
    { id: 'date', label: 'Fecha del desembolso', sample: '24 de agosto de 2026' },
    { id: 'method', label: 'Medio del traslado', sample: 'Transferencia bancaria' },
    { id: 'reference', label: 'Referencia', sample: '0000054400' },
    { id: 'site', label: 'Sitio que lo envía', sample: 'Rotary Distrito 4281' },
];
export const WA_VARIABLE_IDS = WA_VARIABLES.map(v => v.id);

/**
 * El nombre de la plantilla en Meta. En snake_case y estable: cambiarlo obliga
 * a volver a pasar por revisión, y mientras tanto los envíos fallan con
 * «template name does not exist».
 */
export const WA_TEMPLATE_NAME = 'desembolso_confirmado';

/**
 * La plantilla, tal como se somete a Meta.
 *
 * ⚠️ CATEGORÍA `UTILITY`, no `MARKETING`, y la diferencia importa por dos
 * motivos: es más barata por conversación y —lo que de verdad cuenta— no exige
 * el consentimiento publicitario que Meta pide para marketing. Un aviso de que
 * a alguien le llegó un dinero es una utilidad transaccional, no una campaña.
 *
 * El cuerpo es DELIBERADAMENTE sobrio: no promete una fecha de acreditación
 * —sabemos cuándo se ordenó el traslado, no cuándo lo abona el banco— y no
 * agradece un aporte, porque el destinatario acá RECIBE dinero, no lo dio. Es
 * la misma distinción que obligó a separar la plantilla del desembolso de la
 * del recibo en v4.885.
 */
export const WA_TEMPLATE = {
    name: WA_TEMPLATE_NAME,
    displayName: 'Desembolso confirmado',
    category: 'UTILITY',
    language: 'es',
    folder: 'transaccional',
    headerType: 'NONE',
    bodyText:
        'Hola {{1}}: te confirmamos que el traslado de los fondos se realizó.\n\n'
        + 'Monto: {{2}}\n'
        + 'Fecha: {{3}}\n'
        + 'Medio: {{4}}\n'
        + 'Referencia: {{5}}\n\n'
        + 'Según la entidad financiera, la acreditación puede tardar algunos días hábiles '
        + 'en verse reflejada. Si algo no coincide con lo que esperabas, respondé a este '
        + 'mensaje y lo revisamos.',
    footerText: '{{6}}',
    buttons: [],
};

/* ─── LOS DESTINATARIOS ──────────────────────────────────────────────
 *
 * Se admiten VARIOS por canal: un desembolso a una fundación suele avisarse a
 * su tesorería y a quien lo gestiona, y obligar a elegir uno hacía que el
 * segundo se enterara por otra vía o no se enterara.
 *
 * ⚠️ LO QUE NO SE PUDO INTERPRETAR SE DICE, CON SU MOTIVO. Un descarte
 * silencioso deja a quien pegó cinco direcciones sin saber cuáles entraron —es
 * la regla de `skipped` en los centros de acopio y en el panel de grupos—. Acá
 * pesa más: lo que se pierde es que alguien no se entere de que le giraron.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** El tope por canal. Se exporta porque la pantalla lo DICE al pie del
 *  campo: un recorte silencioso deja a quien pegó quince direcciones sin
 *  saber que cinco quedaron fuera. */
export const MAX_POR_CANAL = 10;

/** Parte lo pegado por comas, punto y coma o saltos de línea. */
const partir = (raw) => {
    if (Array.isArray(raw)) return raw.map(x => String(x || '').trim()).filter(Boolean);
    return String(raw || '')
        .split(/[,;\n\r]+/)
        .map(x => x.trim())
        .filter(Boolean);
};

/**
 * Los correos válidos, deduplicados, y los que se descartaron con su motivo.
 *
 * Se normalizan a minúsculas antes de deduplicar: `Ana@Club.org` y
 * `ana@club.org` son la misma persona, y con dos entradas recibiría el aviso
 * dos veces. Es la misma normalización que `deliveryKey` en las notificaciones
 * (v4.855), y tiene que ser la misma o la llave de idempotencia no coincidiría.
 */
export const parseEmails = (raw) => {
    const validos = [];
    const descartados = [];
    const vistos = new Set();

    for (const item of partir(raw)) {
        const correo = item.toLowerCase();
        if (!EMAIL_RE.test(correo)) {
            descartados.push({ valor: item, motivo: 'No parece una dirección de correo.' });
            continue;
        }
        if (correo.length > 200) {
            descartados.push({ valor: item, motivo: 'La dirección es demasiado larga.' });
            continue;
        }
        if (vistos.has(correo)) continue;   // repetido: no es un error, es de más
        vistos.add(correo);
        if (validos.length >= MAX_POR_CANAL) {
            descartados.push({ valor: item, motivo: `Máximo ${MAX_POR_CANAL} destinatarios por canal.` });
            continue;
        }
        validos.push(correo);
    }
    return { validos, descartados };
};

/**
 * Los teléfonos válidos en formato E.164, deduplicados.
 *
 * ⚠️ LA VALIDACIÓN LA HACE `phone.js`, NO ESTE ARCHIVO. Aquel módulo ya sabe
 * distinguir un móvil colombiano de un fijo, cuándo anteponer el código de país
 * y cuándo NO adivinar — y es el mismo que usa el CRM para todo lo que sale
 * hacia Meta. Un segundo criterio de teléfonos daría dos formas de normalizar
 * el mismo número, y entonces el aviso saldría a un destino y el registro
 * diría otro.
 *
 * Se recibe la función como PARÁMETRO para que este archivo siga siendo puro y
 * probable sin arrastrar el módulo de teléfonos.
 */
export const parsePhones = (raw, validar) => {
    const validos = [];
    const descartados = [];
    const vistos = new Set();

    for (const item of partir(raw)) {
        const r = validar(item);
        if (!r?.ok) {
            // El motivo de `phone.js` se propaga TEXTUAL: explica qué formato
            // se esperaba, que es exactamente lo que hace falta para corregir.
            descartados.push({ valor: item, motivo: r?.reason || 'Número no válido.' });
            continue;
        }
        if (vistos.has(r.e164)) continue;
        vistos.add(r.e164);
        if (validos.length >= MAX_POR_CANAL) {
            descartados.push({ valor: item, motivo: `Máximo ${MAX_POR_CANAL} destinatarios por canal.` });
            continue;
        }
        validos.push(r.e164);
    }
    return { validos, descartados };
};

/**
 * Los destinatarios de un desembolso, saneados y por canal.
 *
 * Conserva `notifyEmail` —el campo de una sola dirección de v4.885— para que
 * las filas escritas antes sigan teniendo a quién avisarle. Es la regla aditiva
 * del proyecto: un cliente con el bundle viejo que sólo mande `notifyEmail` no
 * nota nada.
 */
export const resolveRecipients = ({ emails, phones, legacyEmail = null } = {}, validarTelefono) => {
    const correo = parseEmails(emails ?? legacyEmail ?? '');
    const wa = validarTelefono
        ? parsePhones(phones ?? '', validarTelefono)
        : { validos: [], descartados: [] };

    return {
        email: correo.validos,
        whatsapp: wa.validos,
        descartados: [
            ...correo.descartados.map(d => ({ ...d, canal: 'email' })),
            ...wa.descartados.map(d => ({ ...d, canal: 'whatsapp' })),
        ],
        total: correo.validos.length + wa.validos.length,
    };
};

/* ─── LAS VARIABLES ──────────────────────────────────────────────────
 *
 * Una sola fuente para los dos canales: el correo las consume por NOMBRE
 * —`{{disbursement_amount}}`— y WhatsApp por POSICIÓN. Armarlas dos veces es
 * cómo se llega a que el correo diga una cifra y el WhatsApp otra.
 */

/** El monto con su moneda, para leerlo de corrido en un mensaje. */
export const formatAmount = (amount, currency) => {
    const code = String(currency || 'USD').toUpperCase();
    const sinDecimales = code === 'COP' || code === 'CLP' || code === 'JPY';
    try {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency', currency: code,
            minimumFractionDigits: sinDecimales ? 0 : 2,
            maximumFractionDigits: sinDecimales ? 0 : 2,
        }).format(Number(amount) || 0);
    } catch {
        return `${amount} ${code}`;
    }
};

export const formatDate = (value) => {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
};

/**
 * Los datos del aviso, ya listos para pintar.
 *
 * `siteName` es lo que hace que la plantilla estandarizada se sienta de cada
 * sitio: el texto es el mismo para toda la plataforma y la firma dice quién lo
 * manda. Sin él, un beneficiario recibiría un WhatsApp de un número que no
 * reconoce hablándole de un dinero, que es exactamente lo que parece una
 * estafa.
 */
export const buildNoticeData = ({ disbursement, siteName = '', methodLabel = '' } = {}) => {
    const moneda = String(disbursement?.currency || 'USD').toUpperCase();
    return {
        beneficiary: String(disbursement?.beneficiary || '').trim(),
        amount: formatAmount(disbursement?.amount, moneda),
        currency: moneda,
        // Sin decorar: la plantilla del correo dibuja importe y moneda por
        // separado y este valor es el número a secas.
        amountRaw: String(disbursement?.amount ?? ''),
        date: formatDate(disbursement?.disbursedAt),
        method: methodLabel || String(disbursement?.method || ''),
        // ⚠️ «Sin referencia» y NO un hueco vacío: un renglón en blanco dentro
        // de un mensaje se lee como un error del sistema, y en WhatsApp Meta
        // además RECHAZA un parámetro vacío.
        reference: String(disbursement?.reference || '').trim() || 'sin referencia',
        site: String(siteName || '').trim() || 'Club Platform for Rotary',
    };
};

/**
 * Los valores para Meta, EN ORDEN.
 *
 * ⚠️ Sale de `WA_VARIABLES`, no de una lista escrita a mano: con dos listas, el
 * día que se agregue una variable al cuerpo, los valores se corren de posición
 * y cada dato aparece en el hueco del siguiente. Meta no da ningún error por
 * eso — entrega el mensaje mal armado.
 */
export const buildWaParameters = (data) => WA_VARIABLES.map(v => String(data?.[v.id] ?? ''));

/**
 * ¿Se puede mandar por WhatsApp?
 *
 * Devuelve el motivo cuando NO, y el motivo es la mitad del valor: «no se pudo
 * avisar» a secas obliga a adivinar si falta el número, la configuración o la
 * aprobación de Meta, que se corrigen en tres sitios distintos.
 */
export const canSendWhatsApp = ({ config, template, phones = [] } = {}) => {
    if (!phones.length) {
        return { ok: false, motivo: 'No hay ningún número al que escribirle.' };
    }
    if (!config) {
        return {
            ok: false,
            motivo: 'WhatsApp no está configurado en la plataforma. Se configura en Comunicaciones CRM → Configuración.',
        };
    }
    if (config.enabled === false) {
        return { ok: false, motivo: 'La integración de WhatsApp está desactivada.' };
    }
    if (!template) {
        return {
            ok: false,
            motivo: `La plantilla «${WA_TEMPLATE_NAME}» todavía no existe. Creala desde `
                + `Comunicaciones CRM → Plantillas y enviala a Meta para su aprobación.`,
        };
    }
    // ⚠️ Meta SÓLO entrega plantillas APROBADAS. Intentar con una pendiente o
    // rechazada devuelve un error del proveedor y consume un intento; decirlo
    // acá es lo que convierte «no llegó» en «falta un paso y es éste».
    const estado = String(template.status || '').toLowerCase();
    if (estado !== 'approved') {
        return {
            ok: false,
            motivo: estado === 'pending' || estado === 'submitted'
                ? `La plantilla «${WA_TEMPLATE_NAME}» está esperando la aprobación de Meta. `
                    + `La revisión suele tardar entre unos minutos y 24 horas.`
                : `La plantilla «${WA_TEMPLATE_NAME}» está en estado «${estado || 'desconocido'}» y Meta `
                    + `sólo entrega las aprobadas.`
                    + (template.rejectionReason ? ` Motivo del rechazo: ${template.rejectionReason}` : ''),
        };
    }
    return { ok: true, motivo: null };
};

/* ─── EL REGISTRO DE LO QUE SE MANDÓ ─────────────────────────────────
 *
 * Un resultado por canal Y POR DESTINATARIO. Con un solo estado por
 * desembolso, un aviso que llegó a dos de tres direcciones se vería como
 * «enviado» y nadie sabría cuál falló.
 */
export const noticeResult = ({ channel, target, state, error = null, at = null, messageId = null }) => ({
    channel: isChannel(channel) ? channel : 'email',
    target: String(target || ''),
    state,                       // 'enviado' | 'fallido' | 'duplicado' | 'omitido'
    error: error ? String(error).slice(0, 500) : null,
    messageId: messageId || null,
    at: at || new Date().toISOString(),
});

/**
 * El resumen que la ficha necesita: cuántos salieron, cuántos fallaron y por
 * qué canal. `null` cuando no se registró nada — que NO es «no se avisó», es
 * que este desembolso es anterior al registro por destinatario.
 */
export const summarizeResults = (results) => {
    if (!Array.isArray(results) || !results.length) return null;
    const resumen = { enviados: 0, fallidos: 0, omitidos: 0, porCanal: {} };
    for (const r of results) {
        const c = r?.channel || 'email';
        resumen.porCanal[c] ||= { enviados: 0, fallidos: 0, omitidos: 0 };
        if (r?.state === 'enviado') { resumen.enviados++; resumen.porCanal[c].enviados++; }
        else if (r?.state === 'fallido') { resumen.fallidos++; resumen.porCanal[c].fallidos++; }
        else if (r?.state === 'omitido') { resumen.omitidos++; resumen.porCanal[c].omitidos++; }
    }
    return resumen;
};

export default {
    NOTICE_CHANNELS, CHANNEL_IDS, isChannel,
    WA_VARIABLES, WA_VARIABLE_IDS, WA_TEMPLATE_NAME, WA_TEMPLATE,
    parseEmails, parsePhones, resolveRecipients,
    formatAmount, formatDate, buildNoticeData, buildWaParameters,
    canSendWhatsApp, noticeResult, summarizeResults,
    MAX_POR_CANAL,
};
