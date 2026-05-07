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
