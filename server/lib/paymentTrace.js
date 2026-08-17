// La TRAZA de un aporte: de dónde vino, qué se le descontó y cómo se pagó.
//
// Puro: sin base, sin red. Recibe filas ya leídas y devuelve el emparejamiento.
//
// v4.844 — `Donation` y `Payment` son dos tablas y NO hay ninguna clave que las
// una. Se crean seguidas dentro del mismo webhook y ahí termina la relación:
// una guarda quién donó y la otra cuánto entró de verdad. Por eso la pantalla
// las mostraba en dos sitios distintos —«Aportes recibidos» y «Movimientos»— y
// no había forma de saber qué movimiento correspondía a qué aportante.
//
// El vínculo se escribe ahora DENTRO de `Payment.rawPayload`, que es una
// columna de texto con JSON libre. No se agrega una columna a Prisma a
// propósito: `Donation` y `Payment` se consultan con `findMany` sin `select`
// en media plataforma, así que una columna declarada en el esquema y todavía
// inexistente en la base deja esas consultas respondiendo 500 hasta que
// alguien corra `db:push` a mano — es la regla de `logo_intl` (v4.699), y acá
// caería sobre el cobro.
//
// Para las filas ANTERIORES al vínculo —que son todas las que ya existen— se
// empareja por heurística, y la heurística se DECLARA en el resultado: quien
// mire la ficha tiene que poder distinguir un vínculo exacto de una
// coincidencia deducida.

/** Cuánto pueden separarse en el tiempo un aporte y su pago para considerarlos
 *  el mismo hecho. Se crean en la misma vuelta del webhook, con una llamada a
 *  Stripe de por medio: dos minutos es holgado y sigue siendo estrecho frente
 *  a la distancia entre dos aportes distintos. */
export const MATCH_WINDOW_MS = 2 * 60 * 1000;

/** El JSON de `rawPayload`, o `{}`. Nunca lanza: es texto que escribió otra
 *  versión del código y puede tener cualquier forma. */
export const parsePayload = (raw) => {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

const time = (value) => {
    const t = new Date(value || 0).getTime();
    return Number.isFinite(t) ? t : 0;
};

const lower = (s) => String(s || '').trim().toLowerCase();

/**
 * De dónde vino el aporte, en el orden de lo MÁS específico a lo más general.
 * Es el mismo orden con que `createDonationCheckout` arma el rótulo del recibo:
 * un proyecto concreto, una campaña, un bloque de la página de aportes y, por
 * último, el club a secas. Que coincidan importa — el recibo que recibió el
 * donante y la ficha que mira el club tienen que decir lo mismo.
 */
export const originOf = (payload) => {
    const p = payload || {};
    if (p.projectTitle) return { kind: 'proyecto', label: p.projectTitle, id: p.projectId || null };
    if (p.campaignName) return { kind: 'campana', label: p.campaignName, id: p.campaignId || null };
    // `purpose` es lo que viajó al recibo. Cuando la campaña no dejó su nombre
    // —los pagos anteriores a v4.844— sigue siendo el mejor dato que hay.
    if (p.purpose) return { kind: p.campaignId ? 'campana' : 'destino', label: p.purpose, id: p.campaignId || p.blockId || null };
    if (p.blockLabel) return { kind: 'destino', label: p.blockLabel, id: p.blockId || null };
    return null;
};

/** Cómo se pagó, para escribirlo como lo escribe el recibo de Stripe:
 *  «Visa ···3778», «Apple Pay», «Mastercard ···4242». */
export const methodOf = (payload, fallbackType) => {
    const card = payload?.card || {};
    const marca = card.brand ? String(card.brand) : '';
    const billetera = card.wallet ? String(card.wallet) : '';
    const ultimos = card.last4 ? String(card.last4) : '';
    if (!marca && !billetera && !ultimos) {
        return fallbackType ? { label: String(fallbackType), brand: '', last4: '', wallet: '' } : null;
    }
    const partes = [];
    if (marca) partes.push(marca.charAt(0).toUpperCase() + marca.slice(1));
    if (ultimos) partes.push(`···${ultimos}`);
    if (billetera) partes.push(billetera === 'apple_pay' ? 'Apple Pay' : billetera === 'google_pay' ? 'Google Pay' : billetera);
    return { label: partes.join(' '), brand: marca, last4: ultimos, wallet: billetera };
};

/**
 * Empareja aportes con pagos.
 *
 * Devuelve, por cada aporte, el pago que le corresponde y CÓMO se decidió:
 *
 *   `exact`      el pago guarda el id del aporte. Sin ambigüedad posible.
 *   `heuristic`  coinciden club, moneda, importe y momento. Es una deducción.
 *   null         no se encontró ninguno.
 *
 * Un pago sólo se asigna UNA vez: dos aportes del mismo importe en el mismo
 * minuto no pueden quedarse los dos con el mismo movimiento — eso mostraría el
 * mismo dinero dos veces. El que gane es el más cercano en el tiempo.
 *
 * Los pagos que no casan con ningún aporte se devuelven aparte: son cobros
 * reales —una compra de la tienda, una membresía, una inscripción— y no pueden
 * desaparecer de la pantalla sólo porque no nacieron de una donación.
 */
export const linkDonationsToPayments = (donations, payments) => {
    const pagos = (payments || []).map(p => ({ pago: p, payload: parsePayload(p.rawPayload) }));
    const tomados = new Set();

    // Primera pasada: los vínculos EXACTOS. Van antes que la heurística, o una
    // coincidencia deducida podría quedarse con el pago de otro aporte que sí
    // lo tenía declarado.
    const porDonacion = new Map();
    for (const { pago, payload } of pagos) {
        if (payload.donationId) porDonacion.set(String(payload.donationId), pago);
    }

    const enlaces = new Map();
    for (const d of donations || []) {
        const exacto = porDonacion.get(String(d.id));
        if (exacto && !tomados.has(exacto.id)) {
            tomados.add(exacto.id);
            enlaces.set(d.id, { payment: exacto, match: 'exact' });
        }
    }

    // Segunda pasada: la heurística, sobre lo que quedó libre.
    for (const d of donations || []) {
        if (enlaces.has(d.id)) continue;

        const cuando = time(d.date);
        const candidatos = pagos
            .filter(({ pago }) => !tomados.has(pago.id))
            .filter(({ pago }) => String(pago.currency || '').toUpperCase() === String(d.currency || '').toUpperCase())
            .filter(({ pago }) => Number(pago.amount) === Number(d.amount))
            .map(({ pago, payload }) => ({
                pago,
                distancia: Math.abs(time(pago.createdAt) - cuando),
                // El correo no se EXIGE —un aporte anónimo puede no tenerlo—
                // pero cuando los dos lo traen y coinciden, desempata.
                mismoCorreo: !!(d.donorEmail && payload?.customerDetails?.email
                    && lower(payload.customerDetails.email) === lower(d.donorEmail)),
            }))
            .filter(c => c.distancia <= MATCH_WINDOW_MS)
            .sort((a, b) => (b.mismoCorreo - a.mismoCorreo) || (a.distancia - b.distancia));

        const elegido = candidatos[0];
        if (elegido) {
            tomados.add(elegido.pago.id);
            enlaces.set(d.id, { payment: elegido.pago, match: 'heuristic' });
        }
    }

    const huerfanos = pagos.filter(({ pago }) => !tomados.has(pago.id)).map(({ pago }) => pago);
    return { links: enlaces, orphans: huerfanos };
};

export default { MATCH_WINDOW_MS, parsePayload, originOf, methodOf, linkDonationsToPayments };
