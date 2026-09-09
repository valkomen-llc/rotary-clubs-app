// EL DESEMBOLSO AGRUPADO: cómo se parte una selección en lotes, qué suma cada
// lote y cómo se escribe el ÚNICO correo que lo confirma.
//
// v4.996 — Puro: sin base, sin red, sin DOM. El criterio vive aparte de la
// orquestación (`disbursements.js`) por el mismo motivo que
// `walletLifecycle.js` y `disbursementNotice.js`: acá se decide con qué se
// agrupa, qué se suma, a qué se le llama «resuelto» y qué dice el correo, y
// todo eso tiene que poder probarse sin Postgres ni un proveedor de correo.
//
// ═════════════════════════════════════════════════════════════════════
// ⚠️ UN GIRO QUE CUBRE VARIOS APORTES ES UNA OPERACIÓN, NO N OPERACIONES.
// ═════════════════════════════════════════════════════════════════════
//
// Hasta v4.995 el bloque escribía una fila de `Disbursement` por aporte —eso
// sigue siendo correcto: es lo que permite reversar uno, atribuirlo a su
// campaña y cuadrarlo contra el extracto— y le pedía a CADA fila que avisara.
// Ocho aportes girados en una sola transferencia producían OCHO correos
// idénticos al mismo beneficiario, con ocho «Monto: 45.321 COP» que no eran el
// monto de nada que él hubiera recibido. Se reportó con la bandeja delante.
//
// La corrección no es «mandar menos correos»: es que el LOTE exista como
// entidad —`DisbursementBatch`— con su referencia, sus totales, su comprobante
// y SU notificación. Las N filas de `Disbursement` cuelgan de él por `batchId`
// y no avisan por su cuenta.
//
// ═════════════════════════════════════════════════════════════════════
// ⚠️ NUNCA SE MEZCLAN EN UN CORREO APORTES DE DESTINOS DISTINTOS.
// ═════════════════════════════════════════════════════════════════════
//
// La llave de agrupación es sitio + moneda + campaña + beneficiario. Dos de las
// cuatro no son negociables por dinero: la MONEDA, porque un total que sume
// pesos con dólares es el «$47.507,75» de v4.841; y el BENEFICIARIO, porque un
// correo que le cuente a una fundación aportes que se giraron a otra afirma un
// traslado que no recibió. La campaña separa porque el correo la nombra en su
// cabecera y en su pie, y un lote de dos campañas no tendría cabecera posible.
//
// ═════════════════════════════════════════════════════════════════════
// ⚠️ NINGÚN MARCADOR SIN RESOLVER SALE EN UN CORREO.
// ═════════════════════════════════════════════════════════════════════
//
// El aviso de v4.885 salió a producción con «{{beneficiary_name}}» impreso
// como firma. `applyVariables` deja el marcador y lo REPORTA a propósito —es
// la regla de las plantillas de Notificaciones—, y el envío del desembolso
// ignoraba el reporte. Acá la regla es la del pedido: lo obligatorio que falta
// DETIENE el envío con su motivo; lo opcional que falta se OMITE (la línea no
// se dibuja); y el HTML final se inspecciona antes de salir buscando `{{`,
// `${`, `undefined`, `null` y `[object Object]`. Un correo que no sale se ve en
// la ficha y se reintenta; uno que salió con un marcador ya salió.

import { formatAmount, formatDate } from './disbursementNotice.js';
// v4.1014 — La frase que distingue una CONCILIACIÓN de un aviso de traslado.
// Vive en el criterio de la conciliación porque es lo que la hace no ser un
// segundo aviso de giro; acá sólo se pinta.
import { RECONCILIATION_NOTE, buildReconciliationSubject } from './reconciliationSpec.js';
import { escapeHtml } from './notificationTemplate.js';

/* ─── IDENTIDAD DEL LOTE ─────────────────────────────────────────────*/

/** El tipo de notificación que un lote emite. Catálogo de UNO a propósito:
 *  un segundo tipo entra acá con su propia llave, nunca improvisado. */
export const BATCH_NOTIFICATION_TYPE = 'disbursement_completed';

/**
 * La llave de idempotencia de la notificación de un lote.
 *
 * Es `lote + tipo`, que es lo que pidió el cliente y lo que hace que un doble
 * clic, un refresco o un reintento del proceso NO vuelvan a mandar el correo:
 * la primera vuelta la marca y las siguientes la encuentran marcada.
 */
export const notificationKey = (batchId, type = BATCH_NOTIFICATION_TYPE) =>
    `${String(batchId || '').trim()}::${String(type || '').trim()}`;

/**
 * Bajo qué «contribución» queda la entrega en `NotificationDelivery`.
 *
 * La bitácora de entregas identifica cada envío por contribución + evento +
 * destinatario, y ése es el índice único que impide dos correos a la misma
 * dirección. Un lote no es una contribución, así que se le da un identificador
 * propio con prefijo: `batch:<id>`. Así el mismo índice que protege el recibo
 * de un aporte protege el aviso del lote, sin una segunda bitácora.
 */
export const deliveryContributionId = (batchId) => `batch:${String(batchId || '').trim()}`;

/** La referencia CORTA del lote, para leerla en un correo o en una ficha.
 *  Los últimos ocho caracteres del id, en mayúsculas — la misma convención
 *  con que la Bóveda pinta la referencia de un aporte (`#F45D20DB`). */
export const batchRef = (batchId) => {
    const id = String(batchId || '').replace(/-/g, '');
    if (!id) return '';
    return `LOTE-${id.slice(-8).toUpperCase()}`;
};

/* ─── AGRUPACIÓN ─────────────────────────────────────────────────────*/

/** El beneficiario, comparable: sin espacios repetidos ni mayúsculas. Es lo
 *  que hace que «COLROTARIOS» y «Colrotarios » caigan en el mismo lote. */
export const normalizeBeneficiary = (s) =>
    String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

/** La llave de un grupo. Sitio + moneda + campaña + beneficiario. */
export const batchGroupKey = ({ clubId, currency, campaignId, beneficiary } = {}) =>
    [
        String(clubId || '').trim(),
        String(currency || 'USD').toUpperCase(),
        String(campaignId || '').trim(),
        normalizeBeneficiary(beneficiary),
    ].join('|');

/**
 * Parte una selección en lotes.
 *
 * `items` son aportes ya resueltos —con su moneda, su campaña (si la tiene) y
 * lo que se va a girar de cada uno—; `beneficiary` es el que escribió quien
 * registra. Devuelve un grupo por llave, en el orden en que apareció el primer
 * aporte de cada uno: dos vueltas sobre la misma selección dan los mismos
 * lotes en el mismo orden, que es lo que hace posible reconocer una operación
 * repetida.
 */
export const groupForBatches = (items = [], { clubId, beneficiary } = {}) => {
    const grupos = new Map();
    for (const it of items || []) {
        if (!it) continue;
        const currency = String(it.currency || 'USD').toUpperCase();
        const campaignId = it.campaignId ? String(it.campaignId) : '';
        const key = batchGroupKey({ clubId, currency, campaignId, beneficiary });
        if (!grupos.has(key)) {
            grupos.set(key, {
                key,
                clubId: String(clubId || ''),
                currency,
                campaignId: campaignId || null,
                campaignName: it.campaignName ? String(it.campaignName) : null,
                beneficiary: String(beneficiary || '').trim(),
                items: [],
            });
        }
        const g = grupos.get(key);
        // El nombre de la campaña se toma del primer aporte que lo traiga: un
        // aporte anterior a v4.844 puede tener el id sin el nombre.
        if (!g.campaignName && it.campaignName) g.campaignName = String(it.campaignName);
        g.items.push(it);
    }
    return [...grupos.values()];
};

/* ─── TOTALES ────────────────────────────────────────────────────────*/

const decimalesDe = (currency) => (['COP', 'CLP', 'JPY'].includes(String(currency || '').toUpperCase()) ? 0 : 2);
const redondea = (n, currency) => {
    const f = Math.pow(10, decimalesDe(currency));
    return Math.round((Number(n) || 0) * f) / f;
};

/**
 * Lo que suma un lote.
 *
 * ⚠️ UNA SOLA MONEDA. Si los aportes no comparten moneda no se suma nada y se
 * dice: `groupForBatches` ya los separó, así que llegar acá con dos monedas es
 * un error del llamador, no un caso a resolver sumando.
 *
 * `net` es lo que se GIRA (la suma de lo desembolsado); `gross`, `fees` y
 * `platformRetention` son lo que esos aportes costaron en origen, para que el
 * lote conteste solo «de cuánto bruto salió este giro». La comisión del
 * procesador se DERIVA —bruto − retención − neto del aporte—, como en
 * `movementOf`: aceptarla de fuera permitiría un desglose que cuadra porque
 * alguien mandó el número que hacía falta.
 *
 * El redondeo se hace UNA vez, al final: acumular redondeos corre el total en
 * los céntimos, y acá se acumulan tantos como aportes haya.
 */
export const batchTotals = (items = []) => {
    const lista = (items || []).filter(Boolean);
    if (!lista.length) return { ok: false, reason: 'sin_aportes', count: 0 };
    const monedas = new Set(lista.map(i => String(i.currency || 'USD').toUpperCase()));
    if (monedas.size > 1) return { ok: false, reason: 'monedas_mezcladas', count: lista.length, currencies: [...monedas] };
    const currency = [...monedas][0];

    let gross = 0, retention = 0, netContrib = 0, net = 0;
    for (const it of lista) {
        const g = Number(it.gross) || 0;
        const r = Number(it.platformFee) || 0;
        const n = Number(it.netContribution) || 0;
        gross += g;
        retention += r;
        netContrib += n;
        net += Number(it.amount) || 0;
    }
    const fees = Math.max(0, gross - retention - netContrib);
    return {
        ok: true,
        currency,
        count: lista.length,
        gross: redondea(gross, currency),
        fees: redondea(fees, currency),
        platformRetention: redondea(retention, currency),
        net: redondea(net, currency),
    };
};

/* ─── EL CORREO CONSOLIDADO ──────────────────────────────────────────
 *
 * Una plantilla propia, con la misma piel que el correo de inscripción a la
 * Conferencia (v4.945): fondo gris claro, cabecera SEPARADA del cuerpo con el
 * mismo aire arriba y abajo, tarjeta blanca redondeada, y el pie con el
 * logotipo real del sitio. Arriba va el logotipo de la PLATAFORMA, porque es
 * Club Platform quien administra y confirma el traslado; abajo, el del SITIO
 * de donde salieron los aportes. Nada de eso está escrito en el código: llega
 * en `platform` y en `site`, y un sitio sin logotipo cargado sale sin
 * logotipo — se dibuja su nombre, jamás un emblema «parecido».
 */

const AZUL = '#17458F';
const TINTA = '#0f172a';
const GRIS = '#64748b';
const GRIS_CLARO = '#94a3b8';
const FUENTE = "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";

/** Lo que el correo NO puede salir sin. Falta cualquiera → no se envía. */
export const REQUIRED_VARS = ['batch_ref', 'total_amount', 'currency', 'disbursement_date', 'site_name', 'count'];

/** Lo que, si falta, simplemente no se dibuja. */
export const OPTIONAL_VARS = ['campaign_name', 'bank_reference', 'method', 'recipient_name', 'site_logo', 'platform_logo', 'notes', 'receipt_name', 'attachments_note'];

/** El importe con símbolo Y código. `$ 200.000` a secas no distingue pesos de
 *  dólares en una bandeja donde conviven los dos (v4.843). */
export const moneyWithCode = (amount, currency) => {
    const code = String(currency || 'USD').toUpperCase();
    return `${formatAmount(amount, code)} ${code}`;
};

/** Una fecha corta para la tabla, en la zona del sitio: la función corre en
 *  UTC y un aporte de las 8 de la noche en Bogotá caería en el día siguiente. */
export const shortDate = (value, timeZone = 'America/Bogota') => {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    try {
        return new Intl.DateTimeFormat('es-CO', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
    } catch {
        return d.toISOString().slice(0, 10);
    }
};

/** La referencia corta de un aporte: `#` + los últimos ocho del id del pago,
 *  como la pinta la Bóveda. */
export const paymentRef = (paymentId) => {
    const id = String(paymentId || '').replace(/-/g, '');
    return id ? `#${id.slice(-8).toUpperCase()}` : '';
};

/**
 * Cómo se presenta un aportante en el correo.
 *
 * ⚠️ UN APORTE ANÓNIMO NO PUBLICA NOMBRE NI CORREO. El destinatario de este
 * correo es un TERCERO —el beneficiario del giro—, y quien marcó «anónimo» no
 * autorizó que su nombre viaje a nadie. Es la regla del listado de aportantes
 * (v4.862) y la de la exportación de la Bóveda (v4.850), y acá pesa más porque
 * el dato sale de la plataforma. Un aporte sin nombre tampoco se inventa uno:
 * se rotula «Aportante sin nombre» — un renglón en blanco se lee como un
 * error del sistema.
 */
export const donorLine = (it = {}) => {
    if (it.isAnonymous) return { name: 'Aportante anónimo', email: '' };
    const name = String(it.donorName || '').trim();
    const email = String(it.donorEmail || '').trim();
    return { name: name || email || 'Aportante sin nombre', email };
};

/**
 * Las variables del correo, ya resueltas, y cuáles faltan.
 *
 * Es el ÚNICO punto que decide con qué se llena el correo: el sujeto, el HTML
 * y el texto plano leen de acá. Devuelve `missing` partido en obligatorias y
 * opcionales, que es lo que la puerta de envío necesita para decidir.
 */
/**
 * `receipt` es lo que VA ADJUNTO, y lo declara quien envía: el correo sólo
 * dice «adjunto a este correo» cuando el archivo de verdad se pudo leer y
 * viaja con él. Tomarlo de `batch.receiptName` afirmaría un adjunto que el
 * envío pudo no haber conseguido (v4.997).
 */
export const resolveBatchVars = (input = {}) => {
    const { batch = {}, items = [], site = {}, campaign = null, platform = {}, recipientName = '', receipt = null } = input;
    const currency = String(batch.currency || items[0]?.currency || '').toUpperCase();
    const totales = batchTotals(items.map(it => ({ ...it, currency: it.currency || currency })));
    const vars = {
        // ⚠️ v4.1015 — LA REFERENCIA DECLARADA MANDA. Una conciliación
        // consolidada no sale de un lote: trae la suya (`CONC-…`) y su
        // `batch.id` es null, así que `batchRef(null)` daría vacío y el correo
        // se detendría por falta de una variable obligatoria. Es ADITIVO: un
        // lote real ya trae `ref` desde `batchPublico` y vale lo mismo.
        batch_ref: String(batch.ref || batchRef(batch.id)),
        batch_id: String(batch.id || ''),
        total_amount: totales.ok ? moneyWithCode(totales.net, currency) : '',
        currency,
        count: totales.ok ? String(totales.count) : '',
        // Una consolidación tiene un RANGO, no una fecha. Se declara en
        // `dateLabel`; elegir una de las varias sería decir que un movimiento
        // representa a todos, y ninguno lo hace.
        disbursement_date: String(batch.dateLabel || formatDate(batch.disbursedAt)),
        site_name: String(site?.name || '').trim(),
        site_logo: String(site?.logoUrl || '').trim(),
        campaign_name: String(campaign?.name || batch.campaignName || '').trim(),
        bank_reference: String(batch.reference || '').trim(),
        method: String(batch.methodLabel || batch.method || '').trim(),
        recipient_name: String(recipientName || batch.beneficiary || '').trim(),
        platform_name: String(platform?.name || 'Club Platform for Rotary').trim(),
        platform_logo: String(platform?.logoUrl || '').trim(),
        notes: String(batch.notes || '').trim(),
        // v4.998 — VARIOS comprobantes: los nombres van separados por coma,
        // en el orden en que se adjuntaron. `receipt_count` no es una
        // variable de la plantilla: decide sólo el singular o el plural del
        // renglón.
        // v4.1018 — Lo que el correo dice de sus adjuntos. Lo declara QUIEN
        // ENVÍA, con los archivos que de verdad consiguió leer: el correo no
        // puede prometer un comprobante que no viaja (v4.997).
        attachments_note: String(input?.attachmentsNote || '').trim(),
        receipt_name: String(
            Array.isArray(receipt?.names) && receipt.names.length
                ? receipt.names.filter(Boolean).join(', ')
                : (receipt?.name || '')
        ).trim(),
    };
    const receiptCount = Array.isArray(receipt?.names) && receipt.names.length
        ? receipt.names.filter(Boolean).length
        : (vars.receipt_name ? 1 : 0);
    const vacia = (k) => !String(vars[k] ?? '').trim();
    return {
        vars,
        receiptCount,
        totales,
        missingRequired: REQUIRED_VARS.filter(vacia),
        missingOptional: OPTIONAL_VARS.filter(vacia),
    };
};

/**
 * Inspecciona lo que se va a mandar.
 *
 * Es la ÚLTIMA puerta y no confía en las anteriores: busca en el asunto, el
 * HTML y el texto plano cualquier forma de marcador sin resolver o de valor
 * vacío escapado como texto. Se aplica sobre el resultado FINAL, así que
 * atrapa también un valor que llegó como `undefined` desde un dato que nadie
 * declaró variable.
 */
export const checkRendered = ({ subject = '', html = '', text = '' } = {}) => {
    const problemas = [];
    const piezas = [['asunto', subject], ['html', html], ['texto', text]];
    const patrones = [
        [/\{\{\s*[a-zA-Z0-9_]*\s*\}\}/, 'un marcador {{…}} sin resolver'],
        [/\$\{[^}]*\}/, 'una interpolación ${…} sin resolver'],
        [/\[undefined\]|\bundefined\b/, 'el valor «undefined»'],
        [/\[object Object\]/, 'un objeto sin serializar'],
        [/(^|[\s>:(])null([\s<.,;)]|$)/, 'el valor «null»'],
        [/\bNaN\b/, 'un número inválido (NaN)'],
    ];
    for (const [donde, contenido] of piezas) {
        const s = String(contenido ?? '');
        for (const [re, motivo] of patrones) {
            if (re.test(s)) problemas.push(`En el ${donde} quedó ${motivo}.`);
        }
    }
    return { ok: problemas.length === 0, problemas: [...new Set(problemas)] };
};

const fila = (rotulo, valor) => {
    const v = String(valor ?? '').trim();
    if (!v) return '';
    return `<tr><td style="padding:4px 0;font-size:13px;color:${GRIS};white-space:nowrap;vertical-align:top;width:46%">${escapeHtml(rotulo)}</td>`
        + `<td style="padding:4px 0 4px 12px;font-size:13px;color:${TINTA};font-weight:600;vertical-align:top">${escapeHtml(v)}</td></tr>`;
};

/**
 * Compone el correo consolidado.
 *
 * Devuelve `{ ok, subject, html, text, vars, missingRequired, missingOptional,
 * problemas }`. Con `ok: false` NO se envía: `missingRequired` dice qué faltó
 * y `problemas` qué quedó mal en el resultado. Todo lo que entra al HTML pasa
 * por `escapeHtml`: el nombre de un aportante lo escribió un desconocido en un
 * formulario público.
 */
export const buildBatchEmail = (input = {}) => {
    const { vars, totales, missingRequired, missingOptional, receiptCount } = resolveBatchVars(input);
    // ⚠️ v4.1014 — EL MISMO CONSTRUCTOR CON DOS VOCES, y `conciliacion` es
    // ADITIVO: sin el modo, este correo sale byte a byte igual que en v4.998.
    //
    // Se agrega un modo en vez de escribir un segundo constructor porque las
    // cifras, la tabla, el pie y la puerta de marcadores sin resolver son las
    // MISMAS: con dos plantillas, el día que se corrija una columna la otra se
    // queda atrás y nadie se entera hasta que un club lo lee.
    //
    // Lo que cambia es lo único que tiene que cambiar: que quien lo recibe
    // entienda que NO le giraron otra vez. Un correo de conciliación con el
    // titular «El desembolso ha sido completado» hace creer que hubo un
    // segundo traslado, y eso es peor que no mandar nada.
    const conciliacion = input.mode === 'reconciliation';
    // ⚠️ v4.1015 — Y DENTRO DE LA CONCILIACIÓN, DOS ÁMBITOS. Uno relaciona UN
    // traslado; el otro consolida varios movimientos. Llamar «traslado» a lo
    // segundo afirmaría una transferencia que no existe, que es exactamente lo
    // que la nota de conciliación viene a evitar.
    const consolidada = conciliacion && input.scope === 'seleccion';
    const fuentes = Array.isArray(input.batch?.sources) ? input.batch.sources : [];
    // v4.998 — «Comprobantes: adjuntos a este correo (a.pdf, b.png)» cuando son
    // varios; en singular cuando es uno. El renglón no sale sin ninguno.
    const varios = receiptCount > 1;
    const rotuloComprobante = varios ? 'Comprobantes' : 'Comprobante';
    const fraseAdjunto = varios ? 'Adjuntos a este correo' : 'Adjunto a este correo';
    if (missingRequired.length || !totales.ok) {
        return {
            ok: false, subject: '', html: '', text: '', vars, totales,
            missingRequired, missingOptional,
            problemas: [
                ...(totales.ok ? [] : [`No se pudo totalizar el lote (${totales.reason}).`]),
                ...(missingRequired.length ? [`Faltan datos obligatorios: ${missingRequired.join(', ')}.`] : []),
            ],
        };
    }

    const items = (input.items || []).map(it => {
        const d = donorLine(it);
        return {
            name: d.name,
            email: d.email,
            date: shortDate(it.date || it.createdAt),
            ref: paymentRef(it.paymentId),
            amount: moneyWithCode(it.amount, vars.currency),
        };
    });

    const subject = conciliacion
        ? buildReconciliationSubject({
            campaignName: vars.campaign_name,
            beneficiary: vars.recipient_name,
            batchRef: vars.batch_ref,
        })
        : `Desembolso completado — ${vars.count} aporte${vars.count === '1' ? '' : 's'} · ${vars.total_amount}`
            + (vars.campaign_name ? ` · ${vars.campaign_name}` : '');

    const saludo = vars.recipient_name ? `Hola ${escapeHtml(vars.recipient_name)},` : 'Hola,';
    const origen = vars.campaign_name
        ? `a los siguientes aportes recibidos a través de la campaña <strong style="color:${TINTA}">${escapeHtml(vars.campaign_name)}</strong>`
        : `a los siguientes aportes recibidos a través de <strong style="color:${TINTA}">${escapeHtml(vars.site_name)}</strong>`;

    const cabecera = vars.platform_logo
        ? `<img src="${escapeHtml(vars.platform_logo)}" alt="${escapeHtml(vars.platform_name)}" height="46" style="display:inline-block;max-height:46px;width:auto"/>`
        : `<p style="margin:0;font-size:15px;font-weight:700;letter-spacing:.02em;color:${AZUL}">${escapeHtml(vars.platform_name)}</p>`;

    const filasTabla = items.map(it =>
        `<tr>`
        + `<td style="padding:10px 8px;border-top:1px solid #e2e8f0;font-size:13px;color:${TINTA};vertical-align:top">`
        + `<div style="font-weight:600">${escapeHtml(it.name)}</div>`
        + (it.email ? `<div style="font-size:12px;color:${GRIS}">${escapeHtml(it.email)}</div>` : '')
        + `</td>`
        + `<td style="padding:10px 8px;border-top:1px solid #e2e8f0;font-size:12px;color:${GRIS};vertical-align:top;white-space:nowrap">${escapeHtml(it.date)}</td>`
        + `<td style="padding:10px 8px;border-top:1px solid #e2e8f0;font-size:12px;color:${GRIS};vertical-align:top;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap">${escapeHtml(it.ref)}</td>`
        + `<td align="right" style="padding:10px 8px;border-top:1px solid #e2e8f0;font-size:13px;color:${TINTA};font-weight:600;vertical-align:top;white-space:nowrap">${escapeHtml(it.amount)}</td>`
        + `</tr>`
    ).join('');

    const html = `<div style="margin:0;padding:26px 12px;background:#eef2f7;font-family:${FUENTE}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px">
    <tr><td align="center" style="padding:0 0 26px">${cabecera}</td></tr>
    <tr><td style="background:#ffffff;padding:32px 32px 24px;border-radius:16px">
        <h1 style="margin:0 0 4px;font-size:22px;line-height:1.3;color:${AZUL}">${conciliacion ? 'Conciliación de aportes trasladados' : 'El desembolso ha sido completado'}</h1>
        <p style="margin:0 0 18px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:${GRIS}">${consolidada ? 'Relación consolidada de traslados ya efectuados' : (conciliacion ? 'Relación de un traslado ya efectuado' : 'Confirmación de traslado de aportes')}</p>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${TINTA}">${saludo}</p>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:${TINTA}">${consolidada
            ? `Adjuntamos la relación consolidada de los aportes ya trasladados a favor de <strong style="color:${TINTA}">${escapeHtml(vars.recipient_name || vars.site_name)}</strong>, ${origen}. Corresponde a ${fuentes.length} movimiento${fuentes.length === 1 ? '' : 's'} ya efectuado${fuentes.length === 1 ? '' : 's'}, cuya referencia individual figura en el documento.`
            : (conciliacion
                ? `Adjuntamos la relación de aportes correspondientes al traslado realizado a favor de <strong style="color:${TINTA}">${escapeHtml(vars.recipient_name || vars.site_name)}</strong>, ${origen}.`
                : `Te confirmamos que ${escapeHtml(vars.platform_name)} ha registrado como completado el traslado de los recursos correspondientes ${origen}.`)}</p>
${conciliacion ? `        <p style="margin:0 0 18px;padding:14px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;font-size:13px;line-height:1.6;color:#92400e">${escapeHtml(RECONCILIATION_NOTE)}</p>
` : ''}${vars.attachments_note ? `        <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:${TINTA}">${escapeHtml(vars.attachments_note)}</p>
` : ''}
        <div style="margin:18px 0;padding:16px 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px">
            <p style="margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${GRIS}">${consolidada ? 'Detalle de la conciliación' : (conciliacion ? 'Detalle del traslado' : 'Detalle del desembolso')}</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%">
                ${fila(consolidada ? 'Referencia de la conciliación' : (conciliacion ? 'Referencia del traslado' : 'Referencia del desembolso'), vars.batch_ref)}
                ${fila(consolidada ? 'Fechas de los traslados' : (conciliacion ? 'Fecha del traslado' : 'Fecha'), vars.disbursement_date)}
                ${consolidada ? fila('Movimientos de origen', String(fuentes.length)) : ''}
                ${fila('Sitio de origen', vars.site_name)}
                ${fila('Campaña', vars.campaign_name)}
                ${fila('Cantidad de aportes', vars.count)}
                ${fila('Monto total', vars.total_amount)}
                ${fila('Medio', vars.method)}
                ${fila('Referencia bancaria', vars.bank_reference)}
                ${fila(rotuloComprobante, vars.receipt_name ? `${fraseAdjunto} (${vars.receipt_name})` : '')}
            </table>
        </div>
        <p style="margin:18px 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${GRIS}">Aportes incluidos</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse">
            <tr>
                <th align="left" style="padding:6px 8px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${GRIS_CLARO};font-weight:600">Aportante</th>
                <th align="left" style="padding:6px 8px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${GRIS_CLARO};font-weight:600">Fecha</th>
                <th align="left" style="padding:6px 8px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${GRIS_CLARO};font-weight:600">Referencia</th>
                <th align="right" style="padding:6px 8px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${GRIS_CLARO};font-weight:600">Aporte</th>
            </tr>
            ${filasTabla}
            <tr>
                <td colspan="3" style="padding:12px 8px;border-top:2px solid ${AZUL};font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${GRIS};font-weight:700">${conciliacion ? 'Total trasladado' : 'Total desembolsado'}</td>
                <td align="right" style="padding:12px 8px;border-top:2px solid ${AZUL};font-size:16px;color:${AZUL};font-weight:700;white-space:nowrap">${escapeHtml(vars.total_amount)}</td>
            </tr>
        </table>
${vars.notes ? `        <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:${GRIS}"><strong style="color:${TINTA}">Observaciones:</strong> ${escapeHtml(vars.notes)}</p>
` : ''}        <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:${GRIS}">${conciliacion
            ? 'Si alguna cifra no coincide con lo que registraste, respondé a este correo y lo revisamos.'
            : 'Según la entidad financiera, la acreditación puede tardar algunos días hábiles en verse reflejada. Si algo no coincide con lo que esperabas, respondé a este correo y lo revisamos.'}</p>
    </td></tr>
    <tr><td style="padding:26px 24px;text-align:center">
${vars.site_logo ? `        <img src="${escapeHtml(vars.site_logo)}" alt="${escapeHtml(vars.site_name)}" height="46" style="display:inline-block;max-height:46px;width:auto;margin-bottom:10px"/>
` : ''}        <p style="margin:0 0 2px;font-size:13px;font-weight:700;color:#334155">${escapeHtml(vars.site_name)}</p>
${vars.campaign_name ? `        <p style="margin:0 0 6px;font-size:12px;color:${GRIS_CLARO}">Campaña: ${escapeHtml(vars.campaign_name)}</p>
` : ''}        <p style="margin:0;font-size:11px;color:${GRIS_CLARO}">Este correo fue generado automáticamente por ${escapeHtml(vars.platform_name)}.</p>
    </td></tr>
</table>
</td></tr></table>
</div>`;

    const text = [
        conciliacion ? 'Conciliación de aportes trasladados' : 'El desembolso ha sido completado',
        conciliacion ? 'Relación de un traslado ya efectuado' : 'Confirmación de traslado de aportes',
        '',
        vars.recipient_name ? `Hola ${vars.recipient_name},` : 'Hola,',
        conciliacion
            ? `Adjuntamos la relación de aportes correspondientes al traslado realizado a favor de ${vars.recipient_name || vars.site_name}, `
                + (vars.campaign_name ? `a través de la campaña ${vars.campaign_name}.` : `a través de ${vars.site_name}.`)
            : `Te confirmamos que ${vars.platform_name} ha registrado como completado el traslado de los recursos correspondientes a los siguientes aportes recibidos a través de `
                + (vars.campaign_name ? `la campaña ${vars.campaign_name}.` : `${vars.site_name}.`),
        conciliacion ? `\n${RECONCILIATION_NOTE}\n` : '',
        // La misma frase que el HTML: el correo lleva las dos versiones y una
        // que dijera menos que la otra sería una contradicción.
        vars.attachments_note || '',
        '',
        `${conciliacion ? 'Referencia del traslado' : 'Referencia del desembolso'}: ${vars.batch_ref}`,
        `${conciliacion ? 'Fecha del traslado' : 'Fecha'}: ${vars.disbursement_date}`,
        `Sitio de origen: ${vars.site_name}`,
        vars.campaign_name ? `Campaña: ${vars.campaign_name}` : '',
        `Cantidad de aportes: ${vars.count}`,
        `Monto total: ${vars.total_amount}`,
        vars.method ? `Medio: ${vars.method}` : '',
        vars.bank_reference ? `Referencia bancaria: ${vars.bank_reference}` : '',
        vars.receipt_name ? `${rotuloComprobante}: ${fraseAdjunto.toLowerCase()} (${vars.receipt_name})` : '',
        '',
        conciliacion ? 'Aportes conciliados:' : 'Aportes incluidos:',
        ...items.map(it => `- ${it.name}${it.email ? ` <${it.email}>` : ''} · ${it.date} · ${it.ref} · ${it.amount}`),
        '',
        `${conciliacion ? 'TOTAL TRASLADADO' : 'TOTAL DESEMBOLSADO'}: ${vars.total_amount}`,
        vars.notes ? `\nObservaciones: ${vars.notes}` : '',
        '',
        conciliacion
            ? 'Si alguna cifra no coincide con lo que registraste, respondé a este correo y lo revisamos.'
            : 'Según la entidad financiera, la acreditación puede tardar algunos días hábiles en verse reflejada. Si algo no coincide con lo que esperabas, respondé a este correo y lo revisamos.',
        '',
        vars.site_name,
        vars.campaign_name ? `Campaña: ${vars.campaign_name}` : '',
        `Este correo fue generado automáticamente por ${vars.platform_name}.`,
    ].join('\n').replace(/\n{3,}/g, '\n\n');

    const revision = checkRendered({ subject, html, text });
    return {
        ok: revision.ok,
        subject, html, text, vars, totales,
        missingRequired, missingOptional,
        problemas: revision.problemas,
        items,
    };
};

/* ─── EL RESUMEN PARA LA PANTALLA ────────────────────────────────────*/

/**
 * Lo que la pantalla dice ANTES de confirmar y DESPUÉS de registrar, con los
 * mismos números: cuántos lotes, cuántos correos, cuánto por lote.
 */
export const describeBatches = (grupos = []) => {
    const lotes = (grupos || []).map(g => {
        const t = batchTotals(g.items || []);
        return {
            key: g.key,
            currency: g.currency,
            campaignId: g.campaignId || null,
            campaignName: g.campaignName || null,
            beneficiary: g.beneficiary || '',
            count: t.ok ? t.count : (g.items || []).length,
            total: t.ok ? t.net : 0,
            totalLabel: t.ok ? moneyWithCode(t.net, g.currency) : '',
        };
    });
    return {
        lotes,
        cuantosLotes: lotes.length,
        cuantosAportes: lotes.reduce((a, l) => a + l.count, 0),
        // Una notificación por lote: es la frase que la pantalla pinta junto al
        // botón. Con cinco aportes del mismo destino dice «1», no «5».
        cuantasNotificaciones: lotes.length,
    };
};

export default {
    BATCH_NOTIFICATION_TYPE, notificationKey, deliveryContributionId, batchRef,
    normalizeBeneficiary, batchGroupKey, groupForBatches, batchTotals,
    REQUIRED_VARS, OPTIONAL_VARS, moneyWithCode, shortDate, paymentRef, donorLine,
    resolveBatchVars, checkRendered, buildBatchEmail, describeBatches,
};
