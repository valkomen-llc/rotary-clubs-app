// Una base en memoria que entiende lo justo del SQL del libro mayor.
//
// v4.847 — NO es un Postgres: es un doble que reconoce las seis sentencias que
// `ledger.js` emite y guarda las filas en arrays. Lo que se prueba con él es el
// CAMINO —cuántos parámetros lleva cada consulta, en qué orden ocurren las
// escrituras, que la idempotencia se resuelva de verdad y que los saldos salgan
// agrupados por moneda—, que es exactamente lo que una prueba de criterio no
// puede ver. Es la lección de v4.744: `pickDistrictSite` era correcto y el
// defecto estaba en el camino.
//
// Lo que este doble NO demuestra es que el SQL sea válido para Postgres. Eso
// exige una base y se comprueba al desplegar; acá se dice para no afirmar de
// más.

export let tablas = { LedgerAccount: [], LedgerTransaction: [], LedgerLine: [], Payment: [], PayoutRequest: [] };
export let log = [];
export let fallar = null;   // pon un texto para que la siguiente consulta lance

export const reset = () => {
    tablas = { LedgerAccount: [], LedgerTransaction: [], LedgerLine: [], Payment: [], PayoutRequest: [] };
    log = [];
    fallar = null;
};

/** Siembra el historial que la carga hacia atrás va a leer. */
export const sembrar = ({ payments = [], payouts = [] }) => {
    tablas.Payment.push(...payments);
    tablas.PayoutRequest.push(...payouts);
};
export const romper = (msg) => { fallar = msg; };

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const query = async (text, params = []) => {
    const sql = norm(text);
    log.push(sql.slice(0, 60));

    if (fallar) { const m = fallar; fallar = null; throw new Error(m); }

    if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(sql)) return { rows: [] };

    // ¿Existen las tablas? El doble siempre dice que sí: crearlas es cosa de
    // Postgres y acá ya están.
    if (/to_regclass/.test(sql)) return { rows: [{ ok: true }] };

    if (/^INSERT INTO "LedgerAccount"/.test(sql)) {
        const [id, clubId, kind, currency] = params;
        const ya = tablas.LedgerAccount.find(a => a.clubId === clubId && a.kind === kind && a.currency === currency);
        if (!ya) tablas.LedgerAccount.push({ id, clubId, kind, currency });
        return { rows: [] };
    }

    if (/^SELECT id FROM "LedgerAccount"/.test(sql)) {
        const [clubId, kind, currency] = params;
        const fila = tablas.LedgerAccount.find(a => a.clubId === clubId && a.kind === kind && a.currency === currency);
        return { rows: fila ? [{ id: fila.id }] : [] };
    }

    if (/^INSERT INTO "LedgerTransaction"/.test(sql)) {
        const [id, kind, clubId, currency, sourceType, sourceRef, reverses, occurredAt, meta] = params;
        // EL ÍNDICE ÚNICO. Es lo que hace que reentregar un webhook no duplique
        // dinero, y es lo que esta prueba viene a ejercitar.
        const choca = tablas.LedgerTransaction.some(t => t.sourceType === sourceType && t.sourceRef === sourceRef);
        if (choca) return { rows: [] };
        tablas.LedgerTransaction.push({ id, kind, clubId, currency, sourceType, sourceRef, reverses, occurredAt, meta });
        return { rows: [{ id }] };
    }

    if (/^INSERT INTO "LedgerLine"/.test(sql)) {
        const [id, transactionId, accountId, clubId, account, currency, minor, basis, meta] = params;
        if (!accountId) throw new Error('línea sin cuenta');
        tablas.LedgerLine.push({ id, transactionId, accountId, clubId, account, currency, minor: Number(minor), basis, meta });
        return { rows: [] };
    }

    if (/SUM\(minor\)/.test(sql)) {
        const [clubId] = params;
        const acc = new Map();
        for (const l of tablas.LedgerLine) {
            if (l.clubId !== clubId) continue;
            const k = `${l.account}|${l.currency}`;
            acc.set(k, (acc.get(k) || 0) + l.minor);
        }
        return {
            rows: [...acc.entries()].map(([k, minor]) => {
                const [account, currency] = k.split('|');
                return { account, currency, minor };
            }),
        };
    }

    // El historial que lee la carga hacia atrás. Se filtra por club y por los
    // mismos criterios del SQL real, para que la prueba ejercite lo que de
    // verdad va a leerse y no una lista completa.
    if (/FROM "Payment"/.test(sql)) {
        const [clubId] = params;
        return { rows: tablas.Payment.filter(p => p.clubId === clubId) };
    }
    if (/FROM "PayoutRequest"/.test(sql)) {
        const [clubId] = params;
        return { rows: tablas.PayoutRequest.filter(p => p.clubId === clubId) };
    }

    throw new Error(`El doble no conoce esta consulta: ${sql.slice(0, 80)}`);
};

export default { query, prisma: {}, pool: null };
