// v4.414 — el flujo de LECTURA usa pg directo (db.js). El query engine de
// Prisma cold-starts demasiado lento en Vercel serverless: la primera query
// puede tomar varios segundos hasta que la function timeout y axios reporte
// "Network Error". /api/admin/stats ya usa este patrón y funciona estable.
// Para escrituras puntuales (requestPayout, updatePayoutStatus) sigue siendo
// OK usar Prisma, no son hot path.
import db from '../lib/db.js';
import prisma from '../lib/prisma.js';

// Get the available balance for a club (only for funds held by Valkomen)
export const getClubBalance = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' && req.query.clubId ? req.query.clubId : req.user.clubId;

        if (!clubId) {
            return res.status(400).json({ error: 'clubId is required' });
        }

        const [paymentsResult, payoutsResult] = await Promise.all([
            db.query(
                `SELECT COALESCE(SUM("netAmount"), 0) AS total FROM "Payment"
                 WHERE "clubId" = $1 AND "isPlatformCollection" = true AND status = 'succeeded'`,
                [clubId]
            ),
            db.query(
                `SELECT COALESCE(SUM(amount), 0) AS total FROM "PayoutRequest"
                 WHERE "clubId" = $1 AND status IN ('pending', 'processing', 'completed')`,
                [clubId]
            )
        ]);

        const totalCollected = parseFloat(paymentsResult.rows[0]?.total || 0);
        const totalRequested = parseFloat(payoutsResult.rows[0]?.total || 0);
        const availableBalance = Math.max(0, totalCollected - totalRequested);

        res.json({
            availableBalance,
            totalCollected,
            totalRequested,
            currency: 'USD'
        });
    } catch (error) {
        console.error('[Payouts] Error getting club balance:', error);
        res.status(500).json({ error: 'Internal server error', detail: error.message?.slice(0, 200) });
    }
};

// Club requests a new payout
export const requestPayout = async (req, res) => {
    try {
        const clubId = req.user.clubId;
        const { amount, bankDetails, notes } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid amount requested' });
        }

        // Create a mock req to reuse logic and check balance
        const balanceReq = { user: req.user };
        const balanceRes = {
            json: (data) => data,
            status: () => balanceRes
        };
        const balanceData = await getClubBalance(balanceReq, balanceRes);

        if (balanceData && balanceData.error) {
            return res.status(500).json({ error: 'Error calculating balance' });
        }

        if (amount > balanceData.availableBalance) {
            return res.status(400).json({ error: 'Insufficient available balance' });
        }

        const payout = await prisma.payoutRequest.create({
            data: {
                amount: parseFloat(amount),
                bankDetails: bankDetails ? JSON.stringify(bankDetails) : null,
                notes,
                clubId,
                status: 'pending'
            }
        });

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

// Admin only: update payout status
export const updatePayoutStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, additionalNotes } = req.body; // status: processing, completed, rejected

        const payout = await prisma.payoutRequest.update({
            where: { id },
            data: {
                status,
                ...(additionalNotes && { notes: additionalNotes })
            }
        });

        res.json(payout);
    } catch (error) {
        console.error('Error updating payout status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export default {
    getClubBalance,
    requestPayout,
    getClubPayoutHistory,
    getAllPayoutRequests,
    updatePayoutStatus
};
