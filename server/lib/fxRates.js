// LAS TASAS DE CAMBIO. Puro: sin base, sin red, sin DOM.
//
// v4.870 — Cobrar en una moneda distinta de la que se publicó.
//
// ═════════════════════════════════════════════════════════════════════
// POR QUÉ EXISTE ESTO, Y POR QUÉ NO CONTRADICE LA REGLA DE SIEMPRE
// ═════════════════════════════════════════════════════════════════════
//
// La regla del sitio es «NO SE INVENTA UNA TASA», no «no se convierte nunca».
// Es exactamente la del `fx` de las inscripciones a eventos: `currency` es lo
// que se PUBLICA, `settlementCurrency` lo que COBRA la pasarela, y si difieren
// se convierte con una tasa CONFIGURADA guardando los TRES datos —valor
// original, valor convertido y la tasa con la que se hizo—. Sin tasa
// configurada no se convierte y el método no se ofrece: eso no cambió.
//
// Lo que hacía falta era el caso de PayPal: no procesa pesos colombianos, así
// que sin conversión el botón nunca aparecía en el sitio de un distrito
// colombiano — que es donde vive la mayoría de los aportes. Decisión expresa
// del cliente: «que mapeen pesos para los rotarios de acá, pero cuando vaya a
// pagar por PayPal que lo convierta automáticamente a dólares».
//
// ⚠️ LA CONVERSIÓN SE DICE ANTES DE COBRAR. Es la mitad que hace legítimo todo
// esto: el visitante eligió «$ 100.000» y hay que enseñarle «se te cobrarán
// US$ 24,80» ANTES de mandarlo a PayPal. Convertir en silencio sería
// cambiarle el trato a mitad de camino, que es lo que la regla anterior
// protegía. Convertir A LA VISTA es otra cosa.

import { normalizeCurrency, roundMoney } from './money.js';

/** La llave de `PlatformConfig` donde viven las tasas. */
export const FX_RATES_KEY = 'fx_rates';

/** Cuántos días vale una tasa antes de que el panel avise de que está vieja.
 *  No la invalida: una tasa vieja sigue siendo una tasa que alguien escribió, y
 *  dejar de cobrar por eso sería peor. Avisa. */
export const STALE_DAYS = 45;

/**
 * La llave de un par. Siempre `ORIGEN_DESTINO`, en mayúsculas.
 *
 * Construida distinto en dos sitios, una tasa guardada no se encontraría al
 * leerla — el mismo motivo por el que `deliveryKey` se normaliza en un solo
 * lugar.
 */
export const pairKey = (from, to) => `${normalizeCurrency(from)}_${normalizeCurrency(to)}`;

/**
 * Cuánto vale una unidad de `to` expresada en `from`.
 *
 * ⚠️ SE GUARDA COMO LO DICE UNA PERSONA: «4.000 pesos por dólar», no
 * «0,00025 dólares por peso». Un número con cuatro ceros a la derecha de la
 * coma se teclea mal y el error no se ve — y acá el error es cuánto se le
 * cobra a alguien.
 */
export const rateFor = (rates, from, to) => {
    const origen = normalizeCurrency(from);
    const destino = normalizeCurrency(to);
    if (!origen || !destino) return null;
    if (origen === destino) return { perUnit: 1, source: null, updatedAt: null, same: true };

    const fila = rates?.[pairKey(origen, destino)];
    const perUnit = Number(fila?.perUnit);
    if (!Number.isFinite(perUnit) || perUnit <= 0) return null;

    return {
        perUnit,
        source: fila?.source || null,
        updatedAt: fila?.updatedAt || null,
        same: false,
    };
};

/** ¿Hace cuánto se escribió esta tasa? `null` si no lo dice. */
export const rateAgeDays = (updatedAt, ahora = new Date()) => {
    if (!updatedAt) return null;
    const t = new Date(updatedAt).getTime();
    if (!Number.isFinite(t)) return null;
    const dias = Math.floor((ahora.getTime() - t) / 86_400_000);
    return dias < 0 ? 0 : dias;
};

/**
 * Convertir un importe.
 *
 * Devuelve SIEMPRE los tres datos —original, convertido y la tasa—, porque son
 * los tres los que hay que guardar y los tres los que hay que enseñar. Sin
 * tasa configurada devuelve el motivo; no inventa ninguna.
 */
export const convertAmount = (amount, from, to, rates, ahora = new Date()) => {
    const origen = normalizeCurrency(from);
    const destino = normalizeCurrency(to);
    const monto = Number(amount);

    if (!origen || !destino) return { ok: false, reason: 'sin_moneda' };
    if (!Number.isFinite(monto) || monto <= 0) return { ok: false, reason: 'sin_importe' };

    const tasa = rateFor(rates, origen, destino);
    if (!tasa) return { ok: false, reason: 'sin_tasa', from: origen, to: destino };

    // Se redondea a la unidad de la moneda DESTINO, que es la que se cobra.
    const convertido = roundMoney(monto / tasa.perUnit, destino);

    // Un importe que se redondea a cero no es un cobro: es un error de tasa
    // que la pasarela rechazaría con un mensaje que no explica nada.
    if (!(convertido > 0)) return { ok: false, reason: 'importe_cero', from: origen, to: destino };

    return {
        ok: true,
        converted: !tasa.same,
        // Los TRES datos.
        originalAmount: monto,
        originalCurrency: origen,
        amount: convertido,
        currency: destino,
        perUnit: tasa.perUnit,
        rateSource: tasa.source,
        rateUpdatedAt: tasa.updatedAt,
        rateAgeDays: rateAgeDays(tasa.updatedAt, ahora),
    };
};

/**
 * Junta las tasas AUTOMÁTICAS con las escritas a mano.
 *
 * ⚠️ LA AUTOMÁTICA MANDA, y es lo contrario de la regla habitual del sitio
 * —«la preferencia explícita del usuario manda sobre lo que decide el
 * sistema»—. Acá no aplica: una tasa de cambio no es una preferencia, es un
 * HECHO que cambia todos los días, y el fallo característico de la escrita a
 * mano es quedarse vieja — que es exactamente lo que la automática resuelve.
 * La manual queda de RESPALDO y como única vía para un par que la fuente
 * automática no cubre.
 *
 * Es una función aparte y pura a propósito: el orden de precedencia es la
 * decisión que gobierna cuánto se le cobra a alguien, y dentro de la capa de
 * I/O no se podría probar.
 */
export const mergeRates = (manual, auto) => ({ ...(manual || {}), ...(auto || {}) });

export const MOTIVOS_FX = {
    sin_moneda: 'No se resolvió la moneda del aporte.',
    sin_importe: 'No hay un importe que convertir.',
    sin_tasa: 'No hay una tasa de cambio configurada para este par de monedas.',
    importe_cero: 'El importe convertido queda en cero: revisá la tasa configurada.',
};

/**
 * Valida lo que llega del panel. El operador escribe, el CÓDIGO decide.
 *
 * Se rechaza —no se interpreta— una tasa que no es un número positivo: adivinar
 * ahí es cobrarle a alguien lo que no era.
 */
export const validateRates = (input, ahora = new Date()) => {
    const out = {};
    const errors = [];
    const warnings = [];

    for (const [clave, val] of Object.entries(input || {})) {
        const partes = String(clave).toUpperCase().split('_');
        const from = normalizeCurrency(partes[0]);
        const to = normalizeCurrency(partes[1]);
        if (!from || !to || partes.length !== 2) {
            errors.push(`«${clave}» no es un par de monedas válido (se escribe ORIGEN_DESTINO, por ejemplo COP_USD).`);
            continue;
        }
        if (from === to) {
            errors.push(`${from} y ${to} son la misma moneda: no hay nada que convertir.`);
            continue;
        }

        const perUnit = Number(val?.perUnit);
        if (!Number.isFinite(perUnit) || perUnit <= 0) {
            errors.push(`${from} → ${to}: la tasa tiene que ser un número mayor que cero.`);
            continue;
        }

        out[pairKey(from, to)] = {
            perUnit,
            source: String(val?.source || '').slice(0, 200) || null,
            updatedAt: val?.updatedAt || new Date(ahora).toISOString(),
        };

        // La fuente no es obligatoria y se PIDE igual: dentro de seis meses,
        // «¿de dónde salió este 4.032?» no tiene dónde mirarse sin ella. Misma
        // regla que la fuente de un indicador del panorama.
        if (!out[pairKey(from, to)].source) {
            warnings.push(`${from} → ${to}: sin fuente anotada. Conviene decir de dónde salió la tasa.`);
        }

        const edad = rateAgeDays(out[pairKey(from, to)].updatedAt, ahora);
        if (edad !== null && edad > STALE_DAYS) {
            warnings.push(`${from} → ${to}: la tasa tiene ${edad} días. Revisala.`);
        }
    }

    return { rates: out, errors, warnings };
};

/** Lee lo guardado. NUNCA lanza: corre en el camino del cobro. */
export const parseRates = (raw) => {
    if (!raw) return {};
    try {
        const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!obj || typeof obj !== 'object') return {};
        const out = {};
        for (const [clave, val] of Object.entries(obj)) {
            const perUnit = Number(val?.perUnit);
            if (!Number.isFinite(perUnit) || perUnit <= 0) continue;
            out[String(clave).toUpperCase()] = {
                perUnit,
                source: val?.source || null,
                updatedAt: val?.updatedAt || null,
            };
        }
        return out;
    } catch (e) {
        console.warn(`[FX] Tasas ilegibles, se sigue sin conversión: ${e?.message}`);
        return {};
    }
};

export default {
    FX_RATES_KEY, STALE_DAYS, MOTIVOS_FX,
    pairKey, rateFor, rateAgeDays, convertAmount, mergeRates, validateRates, parseRates,
};
