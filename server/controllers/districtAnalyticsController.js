import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Obtiene métricas de salud y crecimiento de todos los clubes del distrito
 */
export const getDistrictHealth = async (req, res) => {
    try {
        const { districtId } = req.query;
        
        // Si no hay districtId, asumimos global (para super admins) o filtramos por el distrito del usuario
        const whereClub = districtId ? { districtId } : {};

        // 1. Obtener todos los clubes del distrito
        const clubs = await prisma.club.findMany({
            where: whereClub,
            include: {
                _count: {
                    select: {
                        members: true,
                        leads: true,
                        projects: true,
                        posts: true
                    }
                }
            }
        });

        // 2. Calcular métricas agregadas
        const totalClubs = clubs.length;
        const totalMembers = clubs.reduce((acc, club) => acc + club._count.members, 0);
        const totalLeads = clubs.reduce((acc, club) => acc + club._count.leads, 0);
        const totalProjects = clubs.reduce((acc, club) => acc + club._count.projects, 0);

        // 3. Análisis de Crecimiento (Socios en los últimos 90 días)
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const newMembers = await prisma.clubMember.findMany({
            where: {
                club: { districtId: districtId || undefined },
                createdAt: { gte: ninetyDaysAgo }
            },
            select: { clubId: true }
        });

        // Agrupar crecimiento por club para el leaderboard
        const growthByClub = newMembers.reduce((acc, m) => {
            acc[m.clubId] = (acc[m.clubId] || 0) + 1;
            return acc;
        }, {});

        const leaderboard = clubs.map(club => ({
            id: club.id,
            name: club.name,
            growth: growthByClub[club.id] || 0,
            totalMembers: club._count.members,
            activityScore: calculateActivityScore(club._count)
        })).sort((a, b) => b.growth - a.growth).slice(0, 5);

        // 4. Estado de Gobernanza (SaaS Status)
        const saasStatus = {
            active: clubs.filter(c => c.subscriptionStatus === 'active').length,
            trial: clubs.filter(c => c.subscriptionStatus === 'trial').length,
            suspended: clubs.filter(c => c.subscriptionStatus === 'suspended').length,
            expired: clubs.filter(c => c.subscriptionStatus === 'expired').length
        };

        res.json({
            summary: {
                totalClubs,
                totalMembers,
                totalLeads,
                totalProjects,
                averageMembersPerClub: totalClubs > 0 ? Math.round(totalMembers / totalClubs) : 0
            },
            saasStatus,
            leaderboard,
            predictive: {
                churnRisk: calculateChurnRisk(clubs),
                growthPotential: totalLeads > 0 ? 'High' : 'Moderate'
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[DistrictAnalytics] Error:', error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * Calcula un score de actividad (0-100) basado en volumen de contenido y gestión
 */
function calculateActivityScore(counts) {
    const { members, leads, projects, posts } = counts;
    const score = (posts * 2) + (projects * 5) + (leads * 3);
    return Math.min(100, score);
}

/**
 * Lógica predictiva simple para identificar riesgos de salud en el distrito
 */
function calculateChurnRisk(clubs) {
    const expiredCount = clubs.filter(c => c.subscriptionStatus === 'expired' || c.subscriptionStatus === 'suspended').length;
    const total = clubs.length;
    if (total === 0) return 'Low';
    const ratio = expiredCount / total;
    if (ratio > 0.3) return 'High';
    if (ratio > 0.1) return 'Moderate';
    return 'Low';
}
