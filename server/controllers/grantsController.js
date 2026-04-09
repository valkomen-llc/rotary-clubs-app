import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const createGrant = async (req, res) => {
    try {
        const { title, description, matchCategory, sourceUrl, sourceName, deadline, amount, clubId } = req.body;
        // Basic validation
        if (!title || !description) {
            return res.status(400).json({ error: "Title and description are required." });
        }
        const grant = await prisma.fundingOpportunity.create({
            data: {
                title,
                description,
                matchCategory,
                sourceUrl,
                sourceName,
                deadline: deadline ? new Date(deadline) : null,
                amount: amount ? parseFloat(amount) : null,
                clubId: clubId || null
            }
        });
        res.status(201).json(grant);
    } catch (error) {
        console.error("Error creating grant:", error);
        res.status(500).json({ error: "Failed to create grant opportunity." });
    }
};

export const getGrants = async (req, res) => {
    try {
        const grants = await prisma.fundingOpportunity.findMany({
            orderBy: { createdAt: 'desc' },
            take: 200 // reasonable limit for MVP
        });
        res.json(grants);
    } catch (error) {
        console.error("Error fetching grants:", error);
        res.status(500).json({ error: "Failed to fetch grants." });
    }
};

export const updateGrantStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, metadata } = req.body;
        
        const updateData = { status, updatedAt: new Date() };
        if (metadata) {
            try {
                updateData.metadata = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
            } catch (e) {
                updateData.metadata = metadata;
            }
        }

        const grant = await prisma.fundingOpportunity.update({
            where: { id },
            data: updateData
        });
        res.json(grant);
    } catch (error) {
        console.error("Error updating grant status:", error);
        res.status(500).json({ error: "Failed to update grant status." });
    }
};
