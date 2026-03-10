import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Get the available balance for a club (only for funds held by Valkomen)
export const getClubBalance = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' && req.query.clubId ? req.query.clubId : req.user.clubId;

        if (!clubId) {
            return res.status(400).json({ error: 'clubId is required' });
        }

        // 1. Calculate total funds processed by Valkomen for this club
        const successfulPlatformPayments = await prisma.payment.findMany({
            where: {
                clubId,
                isPlatformCollection: true,
                status: 'succeeded'
            }
        });

        const totalCollected = successfulPlatformPayments.reduce((acc, curr) => acc + (curr.netAmount || 0), 0);

        // 2. Calculate sum of existing payout requests (pending, processing, completed)
        const payoutRequests = await prisma.payoutRequest.findMany({
            where: {
                clubId,
                status: {
                    in: ['pending', 'processing', 'completed']
                }
            }
        });

        const totalRequested = payoutRequests.reduce((acc, curr) => acc + curr.amount, 0);

        const availableBalance = Math.max(0, totalCollected - totalRequested);

        res.json({
            availableBalance,
            totalCollected,
            totalRequested,
            currency: 'usd' // Defaults to USD, can be dynamic later
        });
    } catch (error) {
        console.error('Error getting club balance:', error);
        res.status(500).json({ error: 'Internal server error' });
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

        const payouts = await prisma.payoutRequest.findMany({
            where: { clubId },
            orderBy: { createdAt: 'desc' },
            include: { club: { select: { name: true } } }
        });

        res.json(payouts);
    } catch (error) {
        console.error('Error fetching payout history:', error);
        res.status(500).json({ error: 'Internal server error' });
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
