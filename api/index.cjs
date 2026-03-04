const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const app = express();
const prisma = new PrismaClient();

app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());

// Health check unificado
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'API is working' });
});

// Importamos las rutas originales
const authRoutes = require('../server/routes/auth');
const adminRoutes = require('../server/routes/admin');

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

module.exports = app;
