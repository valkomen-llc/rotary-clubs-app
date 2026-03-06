const prisma = require('../lib/prisma');

const getSections = async (req, res) => {
    const { page, clubId } = req.query;
    try {
        const where = {
            ...(page && { page }),
            ...(req.user.role !== 'administrator' ? { clubId: req.user.clubId } : (clubId && { clubId }))
        };
        const sections = await prisma.contentSection.findMany({ where });
        res.json(sections);
    } catch (err) {
        res.status(500).json({ error: 'Error fetching sections' });
    }
};

const updateSection = async (req, res) => {
    const { id } = req.params;
    const { content } = req.body;

    try {
        // Find section first to check ownership
        const existing = await prisma.contentSection.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Section not found' });

        if (req.user.role !== 'administrator' && existing.clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'Not authorized for this club' });
        }

        const section = await prisma.contentSection.update({
            where: { id },
            data: {
                content: typeof content === 'string' ? content : JSON.stringify(content)
            },
        });
        res.json(section);
    } catch (err) {
        res.status(500).json({ error: 'Error updating section' });
    }
};

const createSection = async (req, res) => {
    const { page, section, content, clubId } = req.body;

    try {
        const targetClubId = req.user.role === 'administrator' ? clubId : req.user.clubId;

        const newSection = await prisma.contentSection.create({
            data: {
                page,
                section,
                content: typeof content === 'string' ? content : JSON.stringify(content),
                clubId: targetClubId
            },
        });
        res.status(201).json(newSection);
    } catch (err) {
        res.status(500).json({ error: 'Error creating section' });
    }
};

module.exports = { getSections, updateSection, createSection };
