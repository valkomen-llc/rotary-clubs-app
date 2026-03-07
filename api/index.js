import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from '../server/routes/auth.js';
import adminRoutes from '../server/routes/admin.js';
import clubRoutes from '../server/routes/clubs.js';
import mediaRoutes from '../server/routes/media.js';
import calendarRoutes from '../server/routes/calendar.js';
import aiRoutes from '../server/routes/ai.js';
import authController from '../server/controllers/authController.js';
const { createInitialAdmin } = authController;

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
app.use('/api/clubs', clubRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/ai', aiRoutes);

export default app;
