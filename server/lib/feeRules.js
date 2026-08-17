// LAS REGLAS DE COMISIÓN. Puro: sin base, sin red, sin DOM.
//
// v4.854 — Fase 2 del rediseño de la Bóveda.
//
// ═════════════════════════════════════════════════════════════════════
// LO QUE ESTO CORRIGE
// ═════════════════════════════════════════════════════════════════════
//
// El 5 % de la plataforma estaba escrito a mano en CINCO sitios —dos constantes
// en `financialController.js`, una en `paymentController.js` y tres usos—, y el
// comentario que lo acompañaba ya decía que había que unificarlo. Una regla de
// negocio duplicada cinco veces no falla ruidosamente: alguien cambia cuatro,
// se olvida de la quinta, y a partir de ahí dos caminos de cobro retienen
// cantidades distintas por el mismo concepto. Es la misma clase de problema que
// `sendCampaign` arrastra en el CRM.
//
// Y hay un segundo número, peor: el estimado del procesador era
// `(total * 0.029) + 0.30` PARA TODAS LAS MONEDAS. El 0,30 es el componente
// fijo en DÓLARES de la tarifa de Stripe, aplicado tal cual a un cobro en
// pesos, donde 30 centavos de peso no son nada. La fórmula no está mal escrita:
// está escrita para una sola moneda y usada en todas.
//
// ═════════════════════════════════════════════════════════════════════
// DESPLEGAR ESTO NO CAMBIA NINGUNA CIFRA
// ═════════════════════════════════════════════════════════════════════
//
// `DEFAULT_RULES` reproduce EXACTAMENTE lo que hay hoy, incluido el estimado de
// dólares aplicado a toda moneda. Se corrige la duplicación, no la tarifa: qué
// cobra Stripe en Colombia es un dato que no tenemos y **no se inventa** — se
// configura cuando alguien lo mire en el panel de Stripe. Hasta entonces el
// estimado se declara como lo que es, y la Bóveda ya distingue una comisión
// «medida» de una «estimada» desde v4.850.
//
// ═════════════════════════════════════════════════════════════════════
// LA HISTORIA NO SE REESCRIBE, Y SALE GRATIS
// ═════════════════════════════════════════════════════════════════════
//
// Cambiar la regla NO puede mover lo que ya se le cobró a nadie. Sale gratis
// porque `Payment.applicationFee` guarda el IMPORTE, no el porcentaje: un
// aporte de marzo conserva su comisión aunque la regla cambie en abril, y la
// tasa que se le aplicó se reconstruye dividiendo. Por eso NO hace falta una
// columna nueva en `Payment` — que además sería el riesgo de despliegue que
// documenta la regla de `logo_intl` (v4.699): un modelo de Prisma con una
// columna que todavía no existe en la base deja en 500 toda consulta que lo
// toque, y acá caería sobre el cobro.

import { normalizeCurrency, roundMoney, currencyMeta } from './money.js';

/** La llave de `PlatformConfig` donde vive la configuración. Mismo patrón que
 *  `crm_automation_settings`: se edita desde el panel, sin desplegar. */
export const FEE_RULES_KEY = 'financial_fee_rules';

/**
 * Lo que hay HOY, escrito una sola vez.
 *
 * ⚠️ Al tocar estos números se cambia lo que se le retiene a un club. No son un
 * valor por omisión cosmético: son la tarifa vigente.
 */
export const DEFAULT_RULES = {
    // Lo que retiene Club Platform. Es un ingreso de la plataforma.
    platform: {
        percent: 0.05,        // 5 %
        fixed: 0,
        byCurrency: {},       // { COP: { percent, fixed } }
        bySite: {},           // { <clubId>: { percent, fixed } } — acuerdos particulares
    },
    // Lo que se ESTIMA que cobra el procesador mientras no llega el dato real.
    // No es un ingreso nuestro y no se cobra: sólo sirve para adelantar el neto.
    processor: {
        percent: 0.029,       // 2,9 %
        fixed: 0.30,          // ⚠️ 0,30 USD. Ver la cabecera: hoy se aplica a toda moneda.
        byCurrency: {},
    },
};

/** Las dos reglas que existen. Catálogo CERRADO: una clave que no esté acá no
 *  se puede configurar, así que no puede aparecer una tercera retención que
 *  nadie sepa de dónde salió. */
export const SCOPES = ['platform', 'processor'];

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * Qué tarifa le toca a un cobro, y POR QUÉ.
 *
 * El orden va de lo más específico a lo más general: el acuerdo del SITIO, la
 * tarifa de la MONEDA, la general. Es el mismo orden que `audienceOfCategory` y
 * que el rótulo del destino de un aporte — lo particular gana sobre lo general,
 * nunca al revés.
 *
 * Devuelve también `source`: sin él, «¿por qué a este club se le retuvo el 3 %?»
 * no se puede contestar dos semanas después. Es el mismo vacío que el CRM tenía
 * antes de `CrmWebhookEvent`.
 */
export const resolveRate = (rules, { scope = 'platform', currency, clubId } = {}) => {
    if (!SCOPES.includes(scope)) throw new Error(`Regla desconocida: ${scope}`);
    const base = (rules || DEFAULT_RULES)[scope] || DEFAULT_RULES[scope];
    const code = normalizeCurrency(currency);

    const sitio = clubId ? base.bySite?.[clubId] : null;
    const moneda = base.byCurrency?.[code];

    const pick = (key) => {
        // `0` es una tarifa válida —un club sin comisión— y `null`/`undefined`
        // es «no configurado». Con `||` los dos serían lo mismo y una exención
        // acordada se leería como si no existiera.
        if (sitio && num(sitio[key]) !== null) return { value: num(sitio[key]), from: 'sitio' };
        if (moneda && num(moneda[key]) !== null) return { value: num(moneda[key]), from: 'moneda' };
        return { value: num(base[key]) ?? 0, from: 'general' };
    };

    const percent = pick('percent');
    const fixed = pick('fixed');
    return {
        scope,
        currency: code,
        percent: percent.value,
        fixed: fixed.value,
        // De dónde salió cada mitad. Pueden venir de sitios distintos: un club
        // puede tener porcentaje propio y heredar el fijo.
        source: { percent: percent.from, fixed: fixed.from },
    };
};

/**
 * El importe que corresponde retener.
 *
 * ⚠️ SE REDONDEA a la unidad de la moneda. Hasta v4.853 no se redondeaba y la
 * comisión de un cobro en pesos salía con decimales que el peso no tiene —el
 * mismo defecto de `roundMoney(8.915)` que abrió este rediseño, en la otra
 * punta—. Y se acota al bruto: una tarifa fija sobre un aporte menor que ella
 * daría una comisión mayor que el aporte y un neto negativo.
 */
export const computeFee = (amount, rate) => {
    const bruto = num(amount) ?? 0;
    if (bruto <= 0) return 0;
    const crudo = bruto * (num(rate?.percent) ?? 0) + (num(rate?.fixed) ?? 0);
    return roundMoney(Math.min(Math.max(0, crudo), bruto), rate?.currency);
};

/** Atajo: lo que retiene la plataforma sobre este cobro. */
export const platformFee = (amount, { rules, currency, clubId } = {}) =>
    computeFee(amount, resolveRate(rules, { scope: 'platform', currency, clubId }));

/** Atajo: lo que se ESTIMA que cobrará el procesador. No es un cobro nuestro y
 *  se sustituye por el dato real en cuanto Stripe lo entrega. */
export const estimatedProcessorFee = (amount, { rules, currency } = {}) =>
    computeFee(amount, resolveRate(rules, { scope: 'processor', currency }));

/**
 * El desglose completo de un cobro, en una sola llamada.
 *
 * El NETO se deriva restando; nunca se recibe de fuera. Es la misma regla que
 * `buildDonationEntry` en el libro mayor y `filaDeSitio` en la Bóveda Central:
 * aceptarlo permitiría un desglose que cuadra porque alguien mandó el número
 * que hacía falta.
 */
export const breakdown = (amount, { rules, currency, clubId, processorFee } = {}) => {
    const code = normalizeCurrency(currency);
    const bruto = roundMoney(num(amount) ?? 0, code);
    const plataforma = platformFee(bruto, { rules, currency: code, clubId });
    // Si llegó la comisión REAL del procesador se usa ésa; el estimado sólo
    // existe mientras no la haya.
    const medida = num(processorFee);
    const procesador = medida !== null
        ? roundMoney(Math.max(0, medida), code)
        : estimatedProcessorFee(bruto, { rules, currency: code });
    return {
        currency: code,
        bruto,
        plataforma,
        procesador,
        // Acotado en cero: un neto negativo no es un neto, es un dato mal leído.
        neto: roundMoney(Math.max(0, bruto - plataforma - procesador), code),
        // Lo que ya distingue la Bóveda desde v4.850. Se declara acá para que
        // no haya que deducirlo dos veces.
        base: medida !== null ? 'medida' : 'estimada',
    };
};

/**
 * Valida lo que llega del panel. El administrador escribe, el CÓDIGO decide —
 * misma regla que `validateTemplate` con Meta y que `validateEmergencyCopy`.
 *
 * Devuelve `{ rules, errors, warnings }`. Un error impide guardar; un aviso no.
 * Tratarlos igual convierte cualquier aviso en un bloqueo y se dejan de leer.
 */
export const validateRules = (input) => {
    const errors = [];
    const warnings = [];
    const out = { platform: { byCurrency: {}, bySite: {} }, processor: { byCurrency: {} } };

    for (const scope of SCOPES) {
        const src = input?.[scope] || {};
        const dst = out[scope];
        const etiqueta = scope === 'platform' ? 'la retención de la plataforma' : 'el estimado del procesador';

        const leer = (obj, donde) => {
            const r = {};
            for (const key of ['percent', 'fixed']) {
                if (obj?.[key] === undefined || obj?.[key] === null || obj?.[key] === '') continue;
                const v = num(obj[key]);
                if (v === null) { errors.push(`${donde}: «${obj[key]}» no es un número.`); continue; }
                if (v < 0) { errors.push(`${donde}: no puede ser negativa.`); continue; }
                // Un porcentaje mayor que 1 casi siempre es alguien escribiendo
                // «5» queriendo decir 5 %. Se RECHAZA en vez de interpretarse:
                // adivinar acá es quedarse con el 500 % de un aporte.
                if (key === 'percent' && v > 1) {
                    errors.push(`${donde}: el porcentaje se escribe en tanto por uno (0.05 = 5 %), no «${obj[key]}».`);
                    continue;
                }
                r[key] = v;
            }
            return r;
        };

        Object.assign(dst, leer(src, etiqueta));
        for (const [code, val] of Object.entries(src.byCurrency || {})) {
            const cur = normalizeCurrency(code);
            if (!cur) continue;
            const r = leer(val, `${etiqueta} en ${cur}`);
            if (Object.keys(r).length) dst.byCurrency[cur] = r;
        }
        if (scope === 'platform') {
            for (const [clubId, val] of Object.entries(src.bySite || {})) {
                if (!clubId) continue;
                const r = leer(val, `${etiqueta} del sitio ${clubId}`);
                if (Object.keys(r).length) dst.bySite[clubId] = r;
            }
        }
    }

    // Lo que hoy es cierto y conviene que se vea: la fórmula del procesador es
    // la de dólares. No es un error —es lo que había— pero sí algo que hay que
    // mirar, así que se DICE.
    const proc = { ...DEFAULT_RULES.processor, ...out.processor };
    if ((proc.fixed || 0) > 0 && !Object.keys(out.processor.byCurrency || {}).length) {
        warnings.push(
            `El componente fijo del procesador (${proc.fixed}) es el de dólares y se aplica a TODAS las monedas. ` +
            'En un cobro en pesos no significa nada. Configurá el de cada moneda con la tarifa real de Stripe.'
        );
    }
    // Una retención mayor que la mitad del aporte no es ilegal, pero es tan
    // improbable que casi siempre es un error de dedo.
    const platPct = out.platform.percent ?? DEFAULT_RULES.platform.percent;
    if (platPct > 0.5) warnings.push(`La plataforma retendría el ${Math.round(platPct * 100)} % de cada aporte.`);

    return { rules: mergeRules(out), errors, warnings };
};

/**
 * Mezcla lo configurado sobre lo que hay hoy.
 *
 * Lo que el operador NO tocó conserva su valor: un guardado parcial no puede
 * dejar la plataforma sin tarifa. Misma regla aditiva que `putAuto` con las
 * traducciones y que los presets del Creador de Reels.
 */
export const mergeRules = (saved) => {
    const out = JSON.parse(JSON.stringify(DEFAULT_RULES));
    for (const scope of SCOPES) {
        const s = saved?.[scope];
        if (!s) continue;
        if (num(s.percent) !== null) out[scope].percent = num(s.percent);
        if (num(s.fixed) !== null) out[scope].fixed = num(s.fixed);
        out[scope].byCurrency = { ...out[scope].byCurrency, ...(s.byCurrency || {}) };
        if (scope === 'platform') out[scope].bySite = { ...out[scope].bySite, ...(s.bySite || {}) };
    }
    return out;
};

/**
 * Lee lo guardado, que llega como texto desde `PlatformConfig`.
 *
 * NUNCA lanza: esto corre en el camino del cobro. Una configuración ilegible
 * degrada a la tarifa vigente —que es lo que había antes de que esta función
 * existiera— en vez de tumbar un pago. Se avisa por consola con el motivo.
 */
export const parseRules = (raw) => {
    if (!raw) return DEFAULT_RULES;
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return mergeRules(parsed);
    } catch (e) {
        console.warn(`[FEE-RULES] Configuración ilegible, se usa la tarifa por defecto: ${e?.message}`);
        return DEFAULT_RULES;
    }
};

/**
 * Cómo se explica una tarifa en una pantalla.
 *
 * Un porcentaje suelto no dice si además hay un fijo, y un fijo sin su moneda
 * no dice nada. Va acá y no en el JSX para que el panel y el informe lo digan
 * igual.
 */
export const describeRate = (rate) => {
    const pct = `${Math.round((rate?.percent ?? 0) * 10000) / 100} %`;
    const fijo = rate?.fixed ?? 0;
    if (!fijo) return pct;
    const dec = currencyMeta(rate?.currency).decimals;
    return `${pct} + ${fijo.toFixed(dec)} ${normalizeCurrency(rate?.currency)}`;
};

export default {
    FEE_RULES_KEY, DEFAULT_RULES, SCOPES,
    resolveRate, computeFee, platformFee, estimatedProcessorFee, breakdown,
    validateRules, mergeRules, parseRules, describeRate,
};
