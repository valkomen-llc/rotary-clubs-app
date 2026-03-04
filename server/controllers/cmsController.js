const prisma = require('../lib/prisma');

const getSections = async (req, res) => {
    const { page } = req.query;
    try {
        const where = page ? { page } : {};
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
    const { page, section, content } = req.body;

    try {
        const newSection = await prisma.contentSection.create({
            data: {
                page,
                section,
                content: typeof content === 'string' ? content : JSON.stringify(content)
            },
        });
        res.status(201).json(newSection);
    } catch (err) {
        res.status(500).json({ error: 'Error creating section' });
    }
};

module.exports = { getSections, updateSection, createSection };
