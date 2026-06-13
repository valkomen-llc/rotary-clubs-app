import prisma from '../lib/prisma.js';

export const getWalletStats = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { club: true }
        });

        if (!user || (user.role !== 'crowdfunder' && user.role !== 'administrator' && user.role !== 'club_admin')) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const isSuperAdmin = user.role === 'administrator';
        const clubId = user.clubId;
        const pools = await prisma.crowdfundPool.findMany({
            where: isSuperAdmin ? {} : { clubId },
            include: {
                activations: true
            }
        });

        // Compute aggregate stats
        const stats = pools.map(pool => {
            const activeActivations = pool.activations.filter(a => a.status === 'active').length;
            const totalEarned = activeActivations * (31.25 - pool.costPerUnit);
            const projectedAnnualProfit = activeActivations * (31.25 - pool.costPerUnit); // For now same as earned
            
            return {
                id: pool.id,
                totalCapital: pool.totalCapital,
                costPerUnit: pool.costPerUnit,
                totalUnits: pool.totalUnits,
                activeUnits: activeActivations,
                availableUnits: pool.totalUnits - activeActivations,
                earned: totalEarned,
                projectedAnnualProfit,
                currency: pool.currency,
                activations: pool.activations
            };
        });

        res.json({ pools: stats });
    } catch (error) {
        console.error('Error fetching wallet stats:', error);
        res.status(500).json({ error: error.message });
    }
};

// Lista los pools registradores disponibles para asignar manualmente
// el registro de un dominio desde la edición del club. Solo admin.
export const getPools = async (req, res) => {
    try {
        const pools = await prisma.crowdfundPool.findMany({
            include: {
                club: { select: { name: true } },
                activations: { select: { id: true, status: true } }
            },
            orderBy: { createdAt: 'asc' }
        });

        const result = pools.map(pool => {
            const activeUnits = pool.activations.filter(a => a.status === 'active').length;
            return {
                id: pool.id,
                clubId: pool.clubId,
                registrarName: pool.club?.name || 'Pool sin club',
                totalUnits: pool.totalUnits,
                activeUnits,
                availableUnits: Math.max(0, pool.totalUnits - activeUnits),
                costPerUnit: pool.costPerUnit,
                currency: pool.currency
            };
        });

        res.json({ pools: result });
    } catch (error) {
        console.error('Error fetching crowdfund pools:', error);
        res.status(500).json({ error: error.message });
    }
};
