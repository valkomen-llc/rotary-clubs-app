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
        const { status, metadata, details, priority, agentId } = req.body;
        
        const updateData = { updatedAt: new Date() };
        if (status) updateData.status = status;
        if (priority) updateData.priority = priority;
        if (agentId) updateData.agentId = agentId;

        if (details) {
            try {
                updateData.details = typeof details === 'string' ? JSON.parse(details) : details;
            } catch (e) {
                updateData.details = details;
            }
        }

        if (metadata) {
            try {
                updateData.metadata = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
            } catch (e) {
                updateData.metadata = metadata;
            }
        }

        const updatedGrant = await prisma.fundingOpportunity.update({
            where: { id },
            data: updateData
        });
        res.json(updatedGrant);
    } catch (error) {
        console.error("Error updating grant:", error);
        res.status(500).json({ error: "Failed to update grant opportunity." });
    }
};

export const deleteGrant = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.fundingOpportunity.delete({
            where: { id }
        });
        res.json({ success: true, message: "Grant deleted successfully." });
    } catch (error) {
        console.error("Error deleting grant:", error);
        res.status(500).json({ error: "Failed to delete grant opportunity." });
    }
};
