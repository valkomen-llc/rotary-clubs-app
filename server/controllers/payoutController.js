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
import { postPayout, postPayoutCancel, reconcileClub, backfillClub } from '../lib/ledger.js';
import {
    filaDeSitio, consolidar, porSitio, takeRate, ticketPromedio, soloConMovimiento,
} from '../lib/centralWallet.js';
import { DEFAULT_RULES, validateRules, resolveRate, describeRate } from '../lib/feeRules.js';
import { planRecalc, registroDeCorreccion } from '../lib/feeRecalc.js';
import { getFeeRules, saveFeeRules } from '../lib/feeRulesStore.js';
import { resolveMethods, validateMethods, mergeMethods, MOTIVOS as MOTIVOS_METODO } from '../lib/paymentMethods.js';
import { getPaymentMethods, savePaymentMethods } from '../lib/paymentMethodsStore.js';
import { getFxRates, saveFxRates } from '../lib/fxRatesStore.js';
import { validateRates, STALE_DAYS as FX_STALE_DAYS, rateAgeDays } from '../lib/fxRates.js';

console.log('[PAYOUTS v4.861] Recálculo deliberado de la retención + reglas de comisión configurables');

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

        const cuadra = report.neto.ok && report.saldo.ok;
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
            saldo: report.saldo,
            soloEnElLibro: report.soloEnElLibro,
            cuentas: report.cuentas,
            legacy,
        });
    } catch (error) {
        console.error('Error reconciling ledger:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * POST /api/payouts/admin/ledger/:clubId/backfill — carga el historial.
 *
 * v4.848 — Fase 2, primer paso. Asienta hacia atrás lo que la plataforma ya
 * tenía registrado, para que el informe de conciliación pueda llegar a cuadrar.
 *
 * **DE ENSAYO por defecto**: sin `{"apply": true}` no escribe nada y devuelve
 * lo que haría. Escribir es idempotente —correrlo dos veces da todo duplicado,
 * que es lo correcto— pero lo valioso es mirar primero: lo que NO se puede
 * cargar y por qué es la mitad del resultado.
 *
 * Del operador de la plataforma, como el informe: es una herramienta de
 * migración sobre infraestructura compartida.
 */
export const backfillLedger = async (req, res) => {
    try {
        const clubId = req.params.clubId;
        if (!clubId) return res.status(400).json({ error: 'clubId es obligatorio' });

        const apply = req.body?.apply === true;
        const resultado = await backfillClub(clubId, { apply });

        if (!resultado.ok) {
            return res.status(resultado.reason === 'sin_libro' ? 409 : 500).json({
                error: resultado.reason === 'sin_libro'
                    ? 'El libro todavía no existe en esta base.'
                    : 'No pude leer el historial.',
                detail: resultado.detail || null,
            });
        }

        // Después de cargar, el informe: es la pregunta que se venía a hacer.
        // En ensayo no se consulta —nada cambió— y decirlo evita que se lea el
        // informe de antes como si fuera el de después.
        const legacy = await computeBalances(clubId);
        const report = apply ? await reconcileClub(clubId, legacy) : null;

        return res.json({
            clubId,
            ...resultado,
            conciliacion: report?.ok
                ? {
                    estado: report.neto.ok && report.saldo.ok ? 'cuadra' : 'difiere',
                    neto: report.neto,
                    saldo: report.saldo,
                    soloEnElLibro: report.soloEnElLibro,
                }
                : null,
        });
    } catch (error) {
        console.error('Error backfilling ledger:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * GET /api/payouts/admin/overview — la BÓVEDA CENTRAL.
 *
 * v4.853 — Fase 1 de la wallet multi-sitio. Lo que recaudaron TODOS los sitios,
 * por sitio y por moneda, con su consolidado.
 *
 * ⚠️ DOS CONSULTAS AGREGADAS, NO UNA POR SITIO. Con `GROUP BY` en la base, la
 * pantalla escala a miles de sitios; trayendo los aportes y sumándolos en el
 * navegador —que es lo que hace hoy la Bóveda local, y está bien para UN
 * sitio— la central sería inusable con el segundo cliente grande.
 *
 * ⚠️ LEE DE `Payment`, NO DEL LIBRO MAYOR, y es a propósito: el libro está en
 * sombra y su historial se está cargando. Cuando el informe de conciliación
 * cuadre se cambia la fuente acá, en un solo sitio. Mientras tanto la Bóveda
 * central dice exactamente lo mismo que la local de cada sitio, que es la
 * propiedad que hace comparables las dos pantallas.
 *
 * Del OPERADOR de la plataforma. Un administrador de sitio no puede ver esto:
 * es información de todas las organizaciones alojadas.
 */
export const getCentralOverview = async (req, res) => {
    try {
        const soloActivos = req.query.movimiento !== 'todos';
        const ahora = new Date();

        // Los aportes, agrupados por sitio y moneda. Las cubetas se resuelven
        // en SQL con el MISMO criterio que `bucketOf` en la Bóveda local: entre
        // que Stripe libera y que el club puede pedirlo hay un período de
        // retención, y las dos pantallas tienen que contarlo igual.
        const [aportes, retiros] = await Promise.all([
            db.query(
                `SELECT p."clubId", p.currency,
                        COUNT(*)::int                                      AS aportes,
                        COALESCE(SUM(p.amount), 0)                         AS bruto,
                        COALESCE(SUM(p."applicationFee"), 0)               AS plataforma,
                        COALESCE(SUM(p."netAmount"), 0)                    AS neto,
                        COALESCE(SUM(CASE WHEN p."availableOn" IS NULL OR p."availableOn" > NOW()
                                          THEN p."netAmount" ELSE 0 END), 0)      AS en_transito,
                        COALESCE(SUM(CASE WHEN p."availableOn" <= NOW()
                                           AND p."clubAvailableOn" > NOW()
                                          THEN p."netAmount" ELSE 0 END), 0)      AS disponible_pronto,
                        c.name, c.type, c.district
                   FROM "Payment" p
                   LEFT JOIN "Club" c ON c.id = p."clubId"
                  WHERE p."isPlatformCollection" = true AND p.status = 'succeeded'
                  GROUP BY p."clubId", p.currency, c.name, c.type, c.district`
            ),
            db.query(
                `SELECT "clubId", currency, COALESCE(SUM(amount), 0) AS retirado
                   FROM "PayoutRequest"
                  WHERE status IN ('pending', 'processing', 'completed')
                  GROUP BY "clubId", currency`
            ),
        ]);

        const retiradoDe = new Map();
        for (const r of retiros.rows) {
            retiradoDe.set(`${r.clubId}|${normalizeCurrency(r.currency)}`, Number(r.retirado) || 0);
        }

        const filas = aportes.rows.map(r => filaDeSitio({
            clubId: r.clubId,
            clubName: r.name,
            clubType: r.type,
            district: r.district,
            currency: r.currency,
            aportes: Number(r.aportes) || 0,
            bruto: Number(r.bruto) || 0,
            plataforma: Number(r.plataforma) || 0,
            neto: Number(r.neto) || 0,
            enTransito: Number(r.en_transito) || 0,
            disponibleProximamente: Number(r.disponible_pronto) || 0,
            retirado: retiradoDe.get(`${r.clubId}|${normalizeCurrency(r.currency)}`) || 0,
        }));

        const total = consolidar(filas);
        const sitiosTodos = porSitio(filas);
        const sitios = soloActivos ? soloConMovimiento(sitiosTodos) : sitiosTodos;

        // ⚠️ Un retiro en una moneda en la que el sitio nunca recibió aportes no
        // se puede conciliar y se REPORTA en vez de restarse contra otra: hasta
        // v4.840 `PayoutRequest.currency` no se escribía y toda fila vieja quedó
        // en USD por omisión. Es el mismo aviso que da la Bóveda local, ahora
        // sobre toda la plataforma.
        const conAportes = new Set(filas.map(f => `${f.clubId}|${f.currency}`));
        const sinConciliar = retiros.rows
            .filter(r => !conAportes.has(`${r.clubId}|${normalizeCurrency(r.currency)}`))
            .map(r => ({ clubId: r.clubId, currency: normalizeCurrency(r.currency), amount: Number(r.retirado) || 0 }));

        return res.json({
            generadoEn: ahora.toISOString(),
            total,
            takeRate: takeRate(total),
            ticketPromedio: ticketPromedio(total),
            sitios,
            sitiosConMovimiento: soloConMovimiento(sitiosTodos).length,
            sitiosTotales: sitiosTodos.length,
            sinConciliar,
            // De dónde salen las cifras. Cuando la fuente pase al libro mayor,
            // esta pantalla tiene que poder decirlo sin que nadie lo adivine.
            fuente: 'payments',
        });
    } catch (error) {
        console.error('[Payouts] Error en la Bóveda Central:', error);
        res.status(500).json({ error: 'Internal server error', detail: error.message?.slice(0, 200) });
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

// ═══════════════════════════════════════════════════════════════════
// LAS REGLAS DE COMISIÓN (v4.854)
// ═══════════════════════════════════════════════════════════════════
//
// Del OPERADOR de la plataforma: la tarifa es de la infraestructura compartida,
// no de una organización. Un administrador de sitio no la ve ni la cambia — lo
// comprueba la ruta, no sólo la pantalla.

/** Qué tarifa rige hoy, y cómo queda para cada moneda. */
export const getFeeRulesConfig = async (req, res) => {
    try {
        const rules = await getFeeRules();
        // Se devuelve además la tarifa YA RESUELTA por moneda: un JSON con
        // herencia no se lee de un vistazo, y quien mira el panel quiere saber
        // qué se le cobra a un aporte en pesos, no reconstruir la cascada.
        const monedas = ['COP', 'USD'];
        const resuelto = {};
        for (const code of monedas) {
            const plataforma = resolveRate(rules, { scope: 'platform', currency: code });
            const procesador = resolveRate(rules, { scope: 'processor', currency: code });
            resuelto[code] = {
                plataforma: { ...plataforma, texto: describeRate(plataforma) },
                procesador: { ...procesador, texto: describeRate(procesador) },
            };
        }
        // Los avisos se calculan sobre lo vigente, no sólo al guardar: una
        // configuración que se dejó a medias hace meses tiene que seguir
        // diciéndolo cada vez que alguien abra la pantalla.
        const { warnings } = validateRules(rules);
        res.json({ rules, porDefecto: DEFAULT_RULES, resuelto, warnings });
    } catch (error) {
        console.error('[FEE-RULES] Error leyendo la configuración:', error);
        res.status(500).json({ error: 'No se pudo leer la configuración de comisiones.' });
    }
};

/** Guarda la tarifa. El operador escribe; el CÓDIGO decide si es válida. */
export const updateFeeRulesConfig = async (req, res) => {
    try {
        const { rules, errors, warnings } = validateRules(req.body?.rules);
        // Los errores se devuelven TODOS y con su motivo concreto: «configuración
        // inválida» a secas obliga a probar campo por campo.
        if (errors.length) return res.status(422).json({ error: 'La configuración tiene errores.', errors });
        await saveFeeRules(rules);
        // ⚠️ Cambiar la tarifa NO mueve ningún cobro anterior: `Payment` guarda
        // el IMPORTE retenido, no el porcentaje. Se dice en la respuesta para
        // que la pantalla lo pueda decir, en vez de dejar a quien la cambia
        // preguntándose si acaba de tocar la contabilidad del año.
        res.json({
            rules, warnings,
            aviso: 'La tarifa nueva rige para los aportes que entren de ahora en adelante. '
                + 'Los cobros ya registrados conservan la retención que se les aplicó.',
        });
    } catch (error) {
        console.error('[FEE-RULES] Error guardando la configuración:', error);
        res.status(500).json({ error: 'No se pudo guardar la configuración de comisiones.' });
    }
};

/**
 * Aplica la tarifa vigente a los aportes que TODAVÍA NO SE PUEDEN RETIRAR.
 *
 * ⚠️ Es la única vía por la que la retención de un cobro registrado cambia, y
 * es deliberada: la pide una persona, es de ENSAYO salvo `{"apply": true}`,
 * queda registrada en la traza del aporte y sólo alcanza el dinero que es
 * imposible que se haya girado. `syncPaymentsWithStripe` sigue SIN recalcular
 * nada — un cálculo que se dispara como efecto secundario de otra operación es
 * lo que reescribe la contabilidad sin que nadie lo decida (v4.854).
 */
export const recalcFees = async (req, res) => {
    try {
        const aplicar = req.body?.apply === true;
        const clubId = req.body?.clubId || null;
        const ids = Array.isArray(req.body?.paymentIds) ? req.body.paymentIds.filter(Boolean) : null;
        const ahora = new Date();

        // Se traen SÓLO los que pueden cambiar: acreditados, de la plataforma y
        // con la disponibilidad todavía por delante. El límite va en el WHERE y
        // no después, así que un aporte ya retirable ni siquiera se mira.
        const cond = [`p.status = 'succeeded'`, `p."isPlatformCollection" = true`, `p."clubAvailableOn" > $1`];
        const args = [ahora];
        if (clubId) { args.push(clubId); cond.push(`p."clubId" = $${args.length}`); }
        if (ids?.length) { args.push(ids); cond.push(`p.id = ANY($${args.length})`); }

        const { rows } = await db.query(
            `SELECT p.id, p."clubId", p.amount, p.currency, p."applicationFee", p."netAmount",
                    p.status, p."isPlatformCollection", p."clubAvailableOn", p."rawPayload", p."createdAt",
                    c.name AS "clubName"
               FROM "Payment" p
               LEFT JOIN "Club" c ON c.id = p."clubId"
              WHERE ${cond.join(' AND ')}
              ORDER BY p."createdAt" DESC
              LIMIT 500`,
            args
        );

        const rules = await getFeeRules();
        const plan = planRecalc(rows, { rules, ahora });

        if (!aplicar) {
            return res.json({
                ensayo: true,
                ...plan,
                aviso: 'Nada se escribió. Repetí con {"apply": true} para aplicarlo.',
            });
        }

        // Se escribe uno por uno y con UPDATE CONDICIONAL sobre la retención
        // anterior: si otra vuelta ya lo corrigió, esta no vuelve a hacerlo. Es
        // el mismo candado optimista de `ingestScene` y del reclamo de escenas.
        const aplicados = [];
        const fallidos = [];
        for (const a of plan.aplicables) {
            try {
                const fila = rows.find(r => r.id === a.id);
                let payload = {};
                try { payload = fila?.rawPayload ? JSON.parse(fila.rawPayload) : {}; } catch { payload = {}; }
                // La traza es una LISTA: una segunda corrección no borra la
                // primera. Es lo que contesta «¿por qué éste retiene 2,1 % y
                // aquél 5 %?» dentro de seis meses.
                const correcciones = Array.isArray(payload.feeCorrections) ? payload.feeCorrections : [];
                correcciones.push(registroDeCorreccion(a, {
                    por: req.user?.email || req.user?.id || 'operador',
                    cuando: ahora,
                    motivo: req.body?.reason || 'la tarifa de la plataforma cambió',
                }));
                payload.feeCorrections = correcciones;

                const upd = await db.query(
                    `UPDATE "Payment"
                        SET "applicationFee" = $2, "netAmount" = $3, "rawPayload" = $4, "updatedAt" = NOW()
                      WHERE id = $1 AND "applicationFee" = $5 AND "clubAvailableOn" > $6
                      RETURNING id`,
                    [a.id, a.plataformaAhora, a.netoAhora, JSON.stringify(payload), a.plataformaAntes, ahora]
                );
                if (upd.rowCount) aplicados.push(a);
                else fallidos.push({ id: a.id, error: 'otra vuelta lo corrigió primero, o ya es retirable' });
            } catch (e) {
                fallidos.push({ id: a.id, error: e?.message || 'no se pudo escribir' });
            }
        }

        console.log(`[FEE-RECALC] ${aplicados.length} aporte(s) corregidos por ${req.user?.email || req.user?.id}`);
        res.json({
            ensayo: false,
            ...plan,
            aplicados: aplicados.length,
            fallidos,
            aviso: 'La corrección quedó registrada en la traza de cada aporte, con su valor anterior.',
        });
    } catch (error) {
        console.error('[FEE-RECALC] Error recalculando:', error);
        res.status(500).json({ error: 'No se pudo recalcular la retención.' });
    }
};

// ═══════════════════════════════════════════════════════════════════
// LOS MÉTODOS DE PAGO (v4.868)
// ═══════════════════════════════════════════════════════════════════
//
// Del OPERADOR: qué vías de cobro ofrece la plataforma es infraestructura
// compartida, no de una organización.

/** Qué métodos hay, si están configurados y si están activados. */
// ═══════════════════════════════════════════════════════════════════
// LAS TASAS DE CAMBIO (v4.870)
// ═══════════════════════════════════════════════════════════════════
//
// Existen por una sola razón: PayPal no procesa pesos colombianos, así que sin
// una tasa configurada el botón no aparece nunca en el sitio de un distrito
// colombiano. La regla de siempre NO cambia —«no se inventa una tasa»—: si no
// hay ninguna escrita acá, no se convierte y no se ofrece.
//
// Del OPERADOR de la plataforma: la cuenta de cobro es una sola y la tasa
// decide cuánto se le cobra a alguien.

export const getFxRatesConfig = async (req, res) => {
    try {
        const rates = await getFxRates();
        const ahora = new Date();
        // La EDAD de cada tasa viaja resuelta: la pantalla no rehace aritmética
        // de fechas —misma regla que el período de la Bóveda—.
        const detalle = Object.entries(rates).map(([pair, val]) => ({
            pair,
            perUnit: val.perUnit,
            source: val.source || null,
            updatedAt: val.updatedAt || null,
            ageDays: rateAgeDays(val.updatedAt, ahora),
        }));
        res.json({
            rates: detalle,
            staleDays: FX_STALE_DAYS,
            aviso: 'La conversión sólo ocurre cuando la cuenta del proveedor no cobra en la moneda del aporte. Sin tasa configurada, ese método no se ofrece.',
        });
    } catch (error) {
        console.error('[FX] Error leyendo las tasas:', error);
        res.status(500).json({ error: 'No se pudieron leer las tasas de cambio.' });
    }
};

export const updateFxRatesConfig = async (req, res) => {
    try {
        const { rates, errors, warnings } = validateRates(req.body?.rates);
        if (errors.length) return res.status(422).json({ error: 'Las tasas tienen errores.', errors });
        await saveFxRates(rates);
        const ahora = new Date();
        res.json({
            rates: Object.entries(rates).map(([pair, val]) => ({
                pair, perUnit: val.perUnit, source: val.source || null,
                updatedAt: val.updatedAt || null, ageDays: rateAgeDays(val.updatedAt, ahora),
            })),
            warnings,
            aviso: 'Rige para los aportes que empiecen de ahora en adelante. Los ya cobrados conservan la tasa con la que se cobraron.',
        });
    } catch (error) {
        console.error('[FX] Error guardando las tasas:', error);
        res.status(500).json({ error: 'No se pudieron guardar las tasas de cambio.' });
    }
};

export const getPaymentMethodsConfig = async (req, res) => {
    try {
        const config = await getPaymentMethods();
        // ⚠️ El estado sale del ENTORNO y NUNCA incluye el secreto, ni
        // recortado: lo único que hace falta saber es si está o no está.
        const methods = resolveMethods(config, process.env);
        res.json({
            methods,
            motivos: MOTIVOS_METODO,
            // Dónde se cargan las credenciales. Sin esto, el panel dice «faltan
            // variables» y no dice dónde ponerlas.
            donde: 'Variables de entorno del proyecto en Vercel (Settings → Environment Variables). Después de cargarlas hay que redeployar.',
        });
    } catch (error) {
        console.error('[PAYMENT-METHODS] Error leyendo:', error);
        res.status(500).json({ error: 'No se pudieron leer los métodos de pago.' });
    }
};

/** Activa o desactiva. El operador escribe; el CÓDIGO decide si es válido. */
export const updatePaymentMethodsConfig = async (req, res) => {
    try {
        const { methods, errors, warnings } = validateMethods(req.body?.methods, process.env);
        if (errors.length) return res.status(422).json({ error: 'La configuración tiene errores.', errors });
        const guardado = await savePaymentMethods(mergeMethods(methods));
        res.json({
            methods: resolveMethods(guardado, process.env),
            warnings,
            aviso: 'Los cambios rigen para los aportes que empiecen de ahora en adelante.',
        });
    } catch (error) {
        console.error('[PAYMENT-METHODS] Error guardando:', error);
        res.status(500).json({ error: 'No se pudieron guardar los métodos de pago.' });
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
