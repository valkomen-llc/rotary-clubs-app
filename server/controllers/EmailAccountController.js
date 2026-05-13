import prisma from '../lib/prisma.js';

export const getEmailAccounts = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' && req.query.clubId ? req.query.clubId : req.user.clubId;

        if (!clubId) {
            return res.status(400).json({ error: 'Club ID is required' });
        }

        const accounts = await prisma.emailAccount.findMany({
            where: { clubId },
            orderBy: { createdAt: 'asc' }
        });

        res.json(accounts);
    } catch (error) {
        console.error('Error fetching email accounts:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

export const createEmailAccount = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' && req.body.clubId ? req.body.clubId : req.user.clubId;
        const { email, label, password, isPrimary, provider } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const account = await prisma.emailAccount.create({
            data: {
                email,
                label,
                password, // Note: In a real system, this should be encrypted or handled by a mail provider API
                isPrimary: isPrimary || false,
                provider: provider || 'platform',
                clubId
            }
        });

        res.status(201).json(account);
    } catch (error) {
        console.error('Error creating email account:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

export const deleteEmailAccount = async (req, res) => {
    try {
        const { id } = req.params;
        const clubId = req.user.clubId;

        const existing = await prisma.emailAccount.findUnique({ where: { id } });
        
        if (!existing) {
            return res.status(404).json({ error: 'Account not found' });
        }

        if (existing.clubId !== clubId && req.user.role !== 'administrator') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        await prisma.emailAccount.delete({ where: { id } });
        res.json({ message: 'Account deleted' });
    } catch (error) {
        console.error('Error deleting email account:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export default {
    getEmailAccounts,
    createEmailAccount,
    deleteEmailAccount
};
