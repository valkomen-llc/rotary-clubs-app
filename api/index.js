import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from '../server/routes/auth.js';
import adminRoutes from '../server/routes/admin.js';
import { createInitialAdmin } from '../server/controllers/authController.js';

dotenv.config();

const app = express();

app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());

// API root
app.get('/api', (req, res) => {
    res.json({ status: 'ok', message: 'API is responding at /api' });
});

// Health check
app.get('/api/health', async (req, res) => {
    try {
        await createInitialAdmin();
        res.json({ status: 'ok', message: 'API Vercel is working and Admin check completed' });
    } catch (err) {
        res.status(500).json({ status: 'error', error: err.message });
    }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

export default app;
