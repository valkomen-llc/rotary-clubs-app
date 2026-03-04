const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());

// Esta función es necesaria para que createInitialAdmin funcione en Vercel
const { createInitialAdmin } = require('../server/controllers/authController');

// Health check unificado con el creador de Admin
app.get('/api/health', async (req, res) => {
    try {
        await createInitialAdmin();
        res.json({ status: 'ok', message: 'API Vercel is working and Admin check completed' });
    } catch (err) {
        res.status(500).json({ status: 'error', error: err.message });
    }
});

// Importamos las rutas originales
const authRoutes = require('../server/routes/auth');
const adminRoutes = require('../server/routes/admin');

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

module.exports = app;
