// v4.414 — el flujo de LECTURA usa pg directo (db.js). El query engine de
// Prisma cold-starts demasiado lento en Vercel serverless: la primera query
// puede tomar varios segundos hasta que la function timeout y axios reporte
// "Network Error". /api/admin/stats ya usa este patrón y funciona estable.
// Para escrituras puntuales (requestPayout, updatePayoutStatus) sigue siendo
// OK usar Prisma, no son hot path.
import db from '../lib/db.js';
import prisma from '../lib/prisma.js';
import {
    normalizeCurrency, roundMoney, currencyMeta,
    sumByCurrency, subtractByCurrency, currenciesOf, primaryCurrency,
} from '../lib/money.js';
import { siteCurrency } from '../lib/clubCurrency.js';
import { postPayout, postPayoutCancel, reconcileClub } from '../lib/ledger.js';

console.log('[PAYOUTS v4.847] Saldos POR MONEDA + libro mayor en sombra');

// v4.843 — La moneda del sitio vive en `clubCurrency.js`: la consultan también
// `financialController` y la barra superior del panel, y tres copias del mismo
// criterio se separan en silencio.

/**
 * El saldo de un club, POR MONEDA.
 *
 * v4.841 — Hasta v4.840 esto era un `SUM("netAmount")` sin `GROUP BY
 * currency`, y por eso el Distrito 4281 veía «$47.507,75»: ocho dólares con
 * noventa y un centavos sumados a cuarenta y siete mil pesos. El número era
 * aritméticamente exacto y no significaba nada.
 *
 * Es una función y no un endpoint a propósito: la usan la consulta del panel y
 * la validación del retiro. Antes el retiro la llamaba pasándole un `res`
 * falso y se quedaba con lo que devolviera — que era `undefined`, porque el
 * endpoint no devolvía nada. Ver `requestPayout`.
 */
export const computeBalances = async (clubId) => {
    const [paymentsResult, payoutsResult] = await Promise.all([
        db.query(
            `SELECT amount, currency, "netAmount" FROM "Payment"
             WHERE "clubId" = $1 AND "isPlatformCollection" = true AND status = 'succeeded'`,
            [clubId]
        ),
        db.query(
            `SELECT amount, currency FROM "PayoutRequest"
             WHERE "clubId" = $1 AND status IN ('pending', 'processing', 'completed')`,
            [clubId]
        )
    ]);

    const collected = sumByCurrency(paymentsResult.rows, r => r.netAmount, r => r.currency);
    const gross = sumByCurrency(paymentsResult.rows, r => r.amount, r => r.currency);
    const requested = sumByCurrency(payoutsResult.rows, r => r.amount, r => r.currency);

    // Un saldo negativo no se compensa contra OTRA moneda: se acota en cero
    // dentro de la suya. Cruzarlas es exactamente lo que este cambio impide.
    const availableRaw = subtractByCurrency(collected, requested);
    const available = {};
    for (const [code, value] of Object.entries(availableRaw)) available[code] = Math.max(0, value);

    // Un retiro en una moneda en la que el club nunca recibió nada no se
    // puede conciliar. Se REPORTA en vez de restarse contra otra: hasta
    // v4.840 `PayoutRequest.currency` no se escribía nunca y toda fila vieja
    // quedó con su valor por omisión, USD. La migración de la Fase 2 les
    // resuelve la moneda real; mientras tanto se ven.
    const unreconciled = Object.keys(requested)
        .filter(code => !(code in collected))
        .map(code => ({ currency: code, amount: requested[code] }));

    const preferred = await siteCurrency(clubId);
    const currencies = currenciesOf({ ...gross, ...collected, ...requested }, preferred);

    return { gross, collected, requested, available, currencies, unreconciled, preferred };
};

// GET /api/payouts/balance
export const getClubBalance = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' && req.query.clubId ? req.query.clubId : req.user.clubId;

        if (!clubId) {
            return res.status(400).json({ error: 'clubId is required' });
        }

        const b = await computeBalances(clubId);

        // Una entrada por moneda. Es lo que la pantalla consume desde v4.841.
        const byCurrency = b.currencies.filter(Boolean).map(code => ({
            currency: code,
            decimals: currencyMeta(code).decimals,
            availableBalance: b.available[code] || 0,
            totalCollected: b.collected[code] || 0,
            totalGross: b.gross[code] || 0,
            totalRequested: b.requested[code] || 0,
        }));

        // Los campos sueltos se CONSERVAN —un navegador con el bundle anterior
        // en caché sigue pintando algo— pero ya no llevan la mezcla: llevan la
        // moneda PRINCIPAL, y `currency` dice cuál es en vez del literal 'USD'
        // que había escrito. Un bundle viejo muestra de menos, que en una
        // pantalla de retiros es el lado seguro; nunca de más.
        const main = primaryCurrency(b.available, b.preferred);
        const mainRow = byCurrency.find(r => r.currency === main);

        res.json({
            byCurrency,
            unreconciled: b.unreconciled,
            currency: main,
            availableBalance: mainRow?.availableBalance || 0,
            totalCollected: mainRow?.totalCollected || 0,
            totalRequested: mainRow?.totalRequested || 0,
        });
    } catch (error) {
        console.error('[Payouts] Error getting club balance:', error);
        res.status(500).json({ error: 'Internal server error', detail: error.message?.slice(0, 200) });
    }
};

// POST /api/payouts/request — el club pide un retiro EN UNA MONEDA.
//
// v4.841 — Acá vivía el defecto más caro del módulo. La comprobación de saldo
// era esta:
//
//     const balanceRes = { json: (data) => data, status: () => balanceRes };
//     const balanceData = await getClubBalance(balanceReq, balanceRes);
//     if (amount > balanceData.availableBalance) { ... }
//
// `getClubBalance` llama a `res.json(...)` pero NO devuelve nada, así que
// `balanceData` era `undefined` y `balanceData.availableBalance` también. En
// JavaScript `cualquierNúmero > undefined` es `false` —no lanza, no avisa—,
// de modo que la comparación dejaba pasar SIEMPRE: se podía pedir un retiro
// por cualquier importe, sin saldo. Ahora se llama a `computeBalances`, que
// devuelve datos y no una respuesta HTTP; el `res` falso desapareció con el
// defecto.
export const requestPayout = async (req, res) => {
    try {
        const clubId = req.user.clubId;
        if (!clubId) return res.status(400).json({ error: 'clubId es obligatorio' });

        const { amount, currency, bankDetails, notes } = req.body || {};

        const requested = Number(amount);
        if (!Number.isFinite(requested) || requested <= 0) {
            return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
        }

        // La moneda es OBLIGATORIA y no tiene valor por omisión. Hasta v4.840
        // no se escribía nunca y toda fila quedaba en USD por el default de la
        // columna, dijera lo que dijera el cobro que la originó.
        const code = normalizeCurrency(currency);
        if (!code) {
            return res.status(400).json({ error: 'La moneda del retiro es obligatoria' });
        }

        const balances = await computeBalances(clubId);
        const available = balances.available[code] || 0;

        if (!(code in balances.collected)) {
            return res.status(400).json({
                error: `El club no ha recibido aportes en ${code}. Elegí una de: ${balances.currencies.filter(Boolean).join(', ') || 'ninguna'}.`,
            });
        }

        // Un importe con más decimales de los que la moneda admite no se
        // redondea por lo bajo: se rechaza. Medio peso no existe, y aceptarlo
        // dejaría el saldo descuadrado por una fracción que nadie pidió.
        if (roundMoney(requested, code) !== requested) {
            const d = currencyMeta(code).decimals;
            return res.status(400).json({
                error: d === 0
                    ? `${code} no admite decimales.`
                    : `${code} admite ${d} decimales.`,
            });
        }

        if (requested > available) {
            return res.status(400).json({
                error: 'Saldo disponible insuficiente',
                available,
                currency: code,
            });
        }

        const payout = await prisma.payoutRequest.create({
            data: {
                amount: requested,
                currency: code,
                bankDetails: bankDetails ? JSON.stringify(bankDetails) : null,
                notes,
                clubId,
                status: 'pending'
            }
        });

        // v4.847 — El asiento del retiro, EN SOMBRA. Se escribe después de
        // crear la solicitud y nunca la rompe: si el libro falla, el retiro
        // queda pedido igual. `sourceRef` es el id de la solicitud, así que un
        // reintento no puede asentar el mismo retiro dos veces.
        const asiento = await postPayout({
            clubId,
            currency: code,
            amount: requested,
            sourceRef: payout.id,
            occurredAt: payout.createdAt || new Date(),
            meta: { estado: 'pending' },
        });
        if (!asiento.ok) console.warn(`[LEDGER] el retiro ${payout.id} quedó sin asentar (${asiento.reason})`);

        res.status(201).json(payout);
    } catch (error) {
        console.error('Error requesting payout:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Get payout history for the club
export const getClubPayoutHistory = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' && req.query.clubId ? req.query.clubId : req.user.clubId;

        if (!clubId) {
            return res.status(400).json({ error: 'clubId is required' });
        }

        // v4.414 — pg directo, mismo motivo que getClubBalance
        const result = await db.query(
            `SELECT id, amount, currency, status, "bankDetails", notes, "createdAt", "updatedAt"
             FROM "PayoutRequest"
             WHERE "clubId" = $1
             ORDER BY "createdAt" DESC
             LIMIT 200`,
            [clubId]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('[Payouts] Error fetching payout history:', error);
        res.status(500).json({ error: 'Internal server error', detail: error.message?.slice(0, 200) });
    }
};

// Admin only: view all payout requests
export const getAllPayoutRequests = async (req, res) => {
    try {
        const payouts = await prisma.payoutRequest.findMany({
            orderBy: { createdAt: 'desc' },
            include: { club: { select: { name: true } } }
        });

        res.json(payouts);
    } catch (error) {
        console.error('Error fetching all payouts:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Los estados que un retiro puede tener. Catálogo CERRADO desde v4.841: antes
// se escribía en la columna el texto que llegara en el cuerpo, y como el saldo
// se calcula restando los retiros en `pending`/`processing`/`completed`, una
// palabra inventada sacaba el retiro de esa cuenta y le devolvía el dinero al
// club en la pantalla. Las TRANSICIONES válidas —que un retiro pagado no
// pueda volver a pendiente— son de la Fase 4, cuando el retiro tenga sus
// asientos en el ledger; esto sólo cierra el conjunto.
const PAYOUT_STATUSES = ['pending', 'processing', 'completed', 'rejected'];

/**
 * GET /api/payouts/admin/ledger/:clubId — el libro contra la Bóveda.
 *
 * v4.847 — Es lo ÚNICO que lee el libro en la Fase 1, y su razón de existir es
 * que una fase en sombra sin forma de contrastar los dos libros es una promesa.
 *
 * Es del OPERADOR de la plataforma, no del administrador del sitio: es una
 * herramienta de migración sobre infraestructura compartida, y lo que muestra
 * —cuánto historial le falta al libro nuevo— se lee como un descuadre si no se
 * sabe qué se está mirando. Lo comprueba la ruta, no la pantalla.
 *
 * Sólo LEE. Un diagnóstico que cambia cosas al mirarlas no sirve para
 * diagnosticar (misma regla que el panel del CRM).
 */
export const getLedgerReconciliation = async (req, res) => {
    try {
        const clubId = req.params.clubId || req.user?.clubId;
        if (!clubId) return res.status(400).json({ error: 'clubId es obligatorio' });

        const legacy = await computeBalances(clubId);
        const report = await reconcileClub(clubId, legacy);

        if (!report.ok) {
            return res.json({
                clubId,
                estado: 'sin_libro',
                // «No se pudo comprobar» NO es un tipo de «bien»: se dice
                // distinto, igual que `unknown` en el diagnóstico del CRM.
                mensaje: 'El libro todavía no existe en esta base. No hay nada que contrastar.',
                legacy,
            });
        }

        const cuadra = report.neto.ok && report.disponible.ok;
        return res.json({
            clubId,
            estado: cuadra ? 'cuadra' : 'difiere',
            // Que difiera es lo ESPERABLE hoy y decirlo evita que se lea como
            // una avería: el libro arranca vacío y sólo asienta lo posterior a
            // v4.847, así que la diferencia mide el historial que le falta.
            mensaje: cuadra
                ? 'El libro dice lo mismo que la Bóveda.'
                : 'El libro difiere de la Bóveda. En la Fase 1 es lo esperable: sólo tiene los hechos posteriores a su estreno.',
            neto: report.neto,
            disponible: report.disponible,
            cuentas: report.cuentas,
            legacy,
        });
    } catch (error) {
        console.error('Error reconciling ledger:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Admin only: update payout status
export const updatePayoutStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, additionalNotes } = req.body;

        if (!PAYOUT_STATUSES.includes(status)) {
            return res.status(400).json({
                error: `Estado inválido. Los admitidos son: ${PAYOUT_STATUSES.join(', ')}.`,
            });
        }

        const payout = await prisma.payoutRequest.update({
            where: { id },
            data: {
                status,
                ...(additionalNotes && { notes: additionalNotes })
            }
        });

        // v4.847 — Un retiro RECHAZADO devuelve el dinero a disponible, y en el
        // libro eso es un asiento nuevo, no una corrección del anterior: el
        // libro sólo agrega. El asiento del retiro sigue ahí —el retiro se pidió
        // de verdad— y encima queda el que lo anula.
        //
        // `sourceRef` lleva el sufijo `:anulado`, así que rechazar dos veces el
        // mismo retiro no devuelve el dinero dos veces: choca con el índice.
        if (status === 'rejected') {
            const asiento = await postPayoutCancel({
                clubId: payout.clubId,
                currency: payout.currency,
                amount: payout.amount,
                payoutId: payout.id,
                occurredAt: new Date(),
                reason: additionalNotes || 'rechazado por el operador',
            });
            if (!asiento.ok) console.warn(`[LEDGER] la anulación del retiro ${payout.id} quedó sin asentar (${asiento.reason})`);
        }

        res.json(payout);
    } catch (error) {
        console.error('Error updating payout status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export default {
    computeBalances,
    getClubBalance,
    requestPayout,
    getClubPayoutHistory,
    getAllPayoutRequests,
    updatePayoutStatus
};
