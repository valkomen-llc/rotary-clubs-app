// La TRM — Tasa Representativa del Mercado.
//
// v4.846 — Los proveedores estaban dentro de `projectFairController.js`, que
// los usa para cobrar la inscripción a la Feria. La Bóveda necesita lo mismo
// para expresar en pesos la comisión que Stripe cobra en dólares, y escribir
// una segunda cadena habría dado dos listas que se separan en silencio. Viven
// acá y la Feria las importa de acá.
//
// Lo que se AGREGA es la consulta HISTÓRICA: la Feria sólo necesita la tasa de
// hoy; un aporte hay que convertirlo con la del día en que ocurrió, o la
// comisión de un cobro de hace tres meses se recalcularía distinta cada vez
// que alguien abriera la ficha.
//
// ⚠️ LA TRM ES DIARIA. No existe una TRM por hora: la Superintendencia
// Financiera publica UN valor por día hábil, vigente de las 00:00 a las 23:59.
// Pedir «la TRM de las 2:31 p. m.» no tiene respuesta, y fingir esa precisión
// sería inventar. Lo que se usa es la vigente ESE día.

import db from './db.js';

// ── Proveedores ──────────────────────────────────────────────────────
//
// La fuente oficial es la Superintendencia Financiera de Colombia, publicada
// en el portal de Datos Abiertos (dataset 32sa-8pi3). Los demás son respaldos
// de mercado: NO son la TRM oficial y su etiqueta lo dice, porque de eso
// depende que quien lea la ficha sepa qué está mirando.
export const TRM_PROVIDERS = {
    superfinanciera: {
        label: 'Superintendencia Financiera de Colombia (datos.gov.co)',
        official: true,
        fetch: async () => {
            const url = 'https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde%20DESC';
            const r = await fetch(url, { headers: { Accept: 'application/json' } });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const rows = await r.json();
            const row = Array.isArray(rows) ? rows[0] : null;
            const rate = Number(row?.valor);
            if (!rate || !isFinite(rate)) throw new Error('Respuesta sin valor de TRM');
            return { rate, validFrom: row?.vigenciadesde || null, validTo: row?.vigenciahasta || null };
        },
        /** La TRM vigente en una fecha concreta. Es lo que la Feria no
         *  necesitaba y un aporte sí. */
        fetchForDate: async (date) => {
            const where = encodeURIComponent(
                `vigenciadesde <= '${date}T00:00:00.000' AND vigenciahasta >= '${date}T00:00:00.000'`
            );
            const url = `https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$where=${where}`;
            const r = await fetch(url, { headers: { Accept: 'application/json' } });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const rows = await r.json();
            const row = Array.isArray(rows) ? rows[0] : null;
            const rate = Number(row?.valor);
            if (!rate || !isFinite(rate)) throw new Error(`Sin TRM publicada para ${date}`);
            return { rate, validFrom: row?.vigenciadesde || null, validTo: row?.vigenciahasta || null };
        },
    },
    open_er_api: {
        label: 'open.er-api.com',
        fetch: async () => {
            const r = await fetch('https://open.er-api.com/v6/latest/USD');
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            const rate = Number(data?.rates?.COP);
            if (!rate) throw new Error('Respuesta sin COP');
            return { rate };
        },
    },
    exchangerate_host: {
        label: 'exchangerate.host',
        fetch: async () => {
            const key = process.env.EXCHANGERATE_HOST_KEY;
            const url = key
                ? `https://api.exchangerate.host/live?access_key=${encodeURIComponent(key)}&source=USD&currencies=COP`
                : 'https://api.exchangerate.host/latest?base=USD&symbols=COP';
            const r = await fetch(url);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            const rate = Number(data?.quotes?.USDCOP ?? data?.rates?.COP);
            if (!rate) throw new Error('Respuesta sin COP');
            return { rate };
        },
    },
    openexchangerates: {
        label: 'openexchangerates.org',
        fetch: async () => {
            const appId = process.env.OPENEXCHANGERATES_APP_ID;
            if (!appId) throw new Error('Falta OPENEXCHANGERATES_APP_ID');
            const r = await fetch(`https://openexchangerates.org/api/latest.json?app_id=${encodeURIComponent(appId)}&symbols=COP`);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            const rate = Number(data?.rates?.COP);
            if (!rate) throw new Error('Respuesta sin COP');
            return { rate };
        },
    },
    currencyapi: {
        label: 'currencyapi.com',
        fetch: async () => {
            const key = process.env.CURRENCY_API_KEY;
            if (!key) throw new Error('Falta CURRENCY_API_KEY');
            const r = await fetch(`https://api.currencyapi.com/v3/latest?apikey=${encodeURIComponent(key)}&base_currency=USD&currencies=COP`);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            const rate = Number(data?.data?.COP?.value);
            if (!rate) throw new Error('Respuesta sin COP');
            return { rate };
        },
    },
    apilayer: {
        label: 'apilayer — Exchange Rates Data API',
        fetch: async () => {
            const key = process.env.APILAYER_KEY;
            if (!key) throw new Error('Falta APILAYER_KEY');
            const r = await fetch('https://api.apilayer.com/exchangerates_data/latest?base=USD&symbols=COP', {
                headers: { apikey: key },
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            const rate = Number(data?.rates?.COP);
            if (!rate) throw new Error('Respuesta sin COP');
            return { rate };
        },
    },
};

// ── La TRM de una FECHA ──────────────────────────────────────────────

/** El día calendario colombiano de un instante. La TRM es diaria y su día es
 *  el de Bogotá, no el del servidor —que corre en UTC—: un aporte de las 8 de
 *  la noche en Colombia es del día siguiente en UTC y le tocaría otra tasa. */
export const bogotaDay = (when) => {
    const d = when ? new Date(when) : new Date();
    if (!Number.isFinite(d.getTime())) return null;
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d);
};

// Caché en memoria por instancia. Una TRM pasada es INMUTABLE, así que una vez
// resuelta no vuelve a consultarse nunca — no hay vencimiento que aplicar.
const memo = new Map();

/** La caché en base. Se reutiliza `ProjectFairTrm`, que es la tabla de TRM de
 *  la plataforma aunque su nombre venga del módulo que la estrenó: está
 *  indexada por fecha, que es exactamente lo que hace falta. Crear una segunda
 *  daría dos cachés de lo mismo. Todo va en `try`: si la tabla no existe
 *  todavía, se consulta al proveedor y ya. */
const fromDb = async (date) => {
    try {
        const { rows } = await db.query(
            'SELECT rate, source FROM "ProjectFairTrm" WHERE date = $1 LIMIT 1', [date]
        );
        if (!rows[0]) return null;
        const rate = Number(rows[0].rate);
        return rate > 0 ? { rate, source: rows[0].source } : null;
    } catch { return null; }
};

const toDb = async (date, rate, source) => {
    try {
        await db.query(`
            INSERT INTO "ProjectFairTrm" (date, rate, source, "fetchedAt")
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (date) DO UPDATE SET rate = $2, source = $3, "fetchedAt" = NOW()
        `, [date, rate, source]);
    } catch { /* sin caché se vuelve a consultar; no es un fallo del aporte */ }
};

/**
 * La TRM vigente el día de una fecha dada. `null` si no se pudo obtener.
 *
 * NUNCA lanza y NUNCA inventa una tasa: quien llame decide qué hacer sin
 * tasa, y en la Bóveda lo que se hace es no convertir y decirlo. Una comisión
 * convertida con una tasa inventada es peor que una sin convertir.
 *
 * @returns { rate, source, date, official } | null
 */
export const trmForDate = async (when) => {
    const date = bogotaDay(when);
    if (!date) return null;

    if (memo.has(date)) return memo.get(date);

    const cached = await fromDb(date);
    if (cached) {
        const hit = { ...cached, date, official: /superintendencia/i.test(cached.source || '') };
        memo.set(date, hit);
        return hit;
    }

    const hoy = bogotaDay(new Date());
    const chain = ['superfinanciera', 'open_er_api', 'exchangerate_host', 'openexchangerates', 'currencyapi', 'apilayer'];

    for (const name of chain) {
        const provider = TRM_PROVIDERS[name];
        if (!provider) continue;
        // Para una fecha PASADA sólo sirve un proveedor que sepa consultarla:
        // los de respaldo devuelven la tasa de HOY, y usarla para un aporte de
        // hace tres meses sería una cifra falsa presentada como histórica.
        const esPasado = date !== hoy;
        const fn = esPasado ? provider.fetchForDate : provider.fetch;
        if (!fn) continue;
        try {
            const { rate } = await fn(date);
            const rounded = Math.round(Number(rate) * 10000) / 10000;
            if (!(rounded > 0)) continue;
            const result = { rate: rounded, source: provider.label, date, official: !!provider.official };
            memo.set(date, result);
            await toDb(date, rounded, provider.label);
            return result;
        } catch (err) {
            console.warn(`[TRM] proveedor "${name}" falló para ${date}: ${err?.message}`);
        }
    }

    console.warn(`[TRM] sin tasa para ${date}: no se convierte.`);
    return null;
};

export default { TRM_PROVIDERS, trmForDate, bogotaDay };
