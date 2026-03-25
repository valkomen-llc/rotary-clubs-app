import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';

const prisma = new PrismaClient();
const router = express.Router();

/**
 * ==========================================
 * SPONSORED CLUBS (ROTARACT / INTERACT)
 * ==========================================
 */

/**
 * GET /api/sponsored-clubs/:type
 * Returns the sponsored club of the specified type for the authenticated user's club.
 */
router.get('/:type', authMiddleware, async (req, res) => {
    try {
        const { type } = req.params;
        const clubId = req.user.clubId;

        const sponsoredClub = await prisma.sponsoredClub.findUnique({
            where: {
                clubId_type: {
                    clubId: clubId,
                    type: type.toLowerCase()
                }
            },
            include: {
                members: {
                    orderBy: {
                        name: 'asc'
                    }
                },
                projects: {
                    orderBy: {
                        date: 'desc'
                    }
                }
            }
        });

        res.json(sponsoredClub || { type: type.toLowerCase(), members: [], projects: [] });
    } catch (error) {
        console.error(`Error fetching sponsored club (${req.params.type}):`, error);
        res.status(500).json({ error: 'Error fetching sponsored club record' });
    }
});

/**
 * PUT /api/sponsored-clubs/:type
 * Create or update the sponsored club's general information.
 */
router.put('/:type', authMiddleware, async (req, res) => {
    try {
        const { type } = req.params;
        const clubId = req.user.clubId;
        const { name, foundationDate, meetingInfo, description, logo, facebookUrl, instagramUrl } = req.body;

        const data = {
            name,
            foundationDate: foundationDate ? new Date(foundationDate) : null,
            meetingInfo,
            description,
            logo,
            facebookUrl,
            instagramUrl
        };

        const sponsoredClub = await prisma.sponsoredClub.upsert({
            where: {
                clubId_type: {
                    clubId: clubId,
                    type: type.toLowerCase()
                }
            },
            update: data,
            create: {
                clubId: clubId,
                type: type.toLowerCase(),
                ...data
            }
        });

        res.json(sponsoredClub);
    } catch (error) {
        console.error(`Error updating sponsored club (${req.params.type}):`, error);
        res.status(500).json({ error: 'Error updating sponsored club record' });
    }
});

/**
 * ==========================================
 * MEMBERS
 * ==========================================
 */

/**
 * POST /api/sponsored-clubs/:type/members
 */
router.post('/:type/members', authMiddleware, async (req, res) => {
    try {
        const { type } = req.params;
        const clubId = req.user.clubId;
        const { id, name, role, email, phone, birthDate, image, isBoard } = req.body;

        // Ensure the sponsored club exists
        let sponsoredClub = await prisma.sponsoredClub.findUnique({
            where: { clubId_type: { clubId, type: type.toLowerCase() } }
        });

        if (!sponsoredClub) {
            sponsoredClub = await prisma.sponsoredClub.create({
                data: {
                    clubId,
                    type: type.toLowerCase(),
                    name: `Club ${type.charAt(0).toUpperCase() + type.slice(1)}`
                }
            });
        }

        const memberData = {
            name,
            role,
            email,
            phone,
            birthDate: birthDate ? new Date(birthDate) : null,
            image,
            isBoard: !!isBoard
        };

        let member;
        if (id) {
            member = await prisma.sponsoredClubMember.update({
                where: { id },
                data: memberData
            });
        } else {
            member = await prisma.sponsoredClubMember.create({
                data: {
                    ...memberData,
                    sponsoredClubId: sponsoredClub.id
                }
            });
        }

        res.json(member);
    } catch (error) {
        console.error('Error saving member:', error);
        res.status(500).json({ error: 'Error saving member record' });
    }
});

/**
 * DELETE /api/sponsored-clubs/:type/members/:memberId
 */
router.delete('/:type/members/:memberId', authMiddleware, async (req, res) => {
    try {
        await prisma.sponsoredClubMember.delete({
            where: { id: req.params.memberId }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting member:', error);
        res.status(500).json({ error: 'Error deleting member record' });
    }
});

/**
 * ==========================================
 * PROJECTS
 * ==========================================
 */

/**
 * POST /api/sponsored-clubs/:type/projects
 */
router.post('/:type/projects', authMiddleware, async (req, res) => {
    try {
        const { type } = req.params;
        const clubId = req.user.clubId;
        const { id, title, description, date, image, images, status } = req.body;

        let sponsoredClub = await prisma.sponsoredClub.findUnique({
            where: { clubId_type: { clubId, type: type.toLowerCase() } }
        });

        if (!sponsoredClub) {
            sponsoredClub = await prisma.sponsoredClub.create({
                data: {
                    clubId,
                    type: type.toLowerCase(),
                    name: `Club ${type.charAt(0).toUpperCase() + type.slice(1)}`
                }
            });
        }

        const projectData = {
            title,
            description,
            date: date ? new Date(date) : null,
            image,
            images: images || [],
            status: status || 'completed'
        };

        let project;
        if (id) {
            project = await prisma.sponsoredClubProject.update({
                where: { id },
                data: projectData
            });
        } else {
            project = await prisma.sponsoredClubProject.create({
                data: {
                    ...projectData,
                    sponsoredClubId: sponsoredClub.id
                }
            });
        }

        res.json(project);
    } catch (error) {
        console.error('Error saving project:', error);
        res.status(500).json({ error: 'Error saving project record' });
    }
});

/**
 * DELETE /api/sponsored-clubs/:type/projects/:projectId
 */
router.delete('/:type/projects/:projectId', authMiddleware, async (req, res) => {
    try {
        await prisma.sponsoredClubProject.delete({
            where: { id: req.params.projectId }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting project:', error);
        res.status(500).json({ error: 'Error deleting project record' });
    }
});

export default router;
