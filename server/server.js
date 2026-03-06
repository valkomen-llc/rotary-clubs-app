const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;

app.use(cors({
    origin: true, // Allow all origins during development
    credentials: true
}));
app.use(express.json());

// Basic health and setup check
app.get('/api/health', async (req, res) => {
    try {
        await createInitialAdmin();
        res.json({ status: 'ok', message: 'Rotary API is running and admin check completed' });
    } catch (err) {
        res.status(500).json({ status: 'error', error: err.message });
    }
});

// Import routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const clubRoutes = require('./routes/clubs');
const mediaRoutes = require('./routes/media');
const { createInitialAdmin } = require('./controllers/authController');

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/clubs', clubRoutes);
app.use('/api/media', mediaRoutes);

// Export the app for Vercel Serverless Functions
module.exports = app;

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, async () => {
        console.log(`Server is running on port ${PORT}`);
        await createInitialAdmin();
    });
}

