const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const prisma = require('../lib/prisma');

// Generate social media suggestions based on month and knowledge base
router.post('/suggest', authMiddleware, async (req, res) => {
    const { month, year } = req.body;

    if (!process.env.OPENAI_API_KEY) {
        return res.status(503).json({ error: 'Configuración de IA no disponible. Por favor agregue OPENAI_API_KEY al .env' });
    }

    try {
        // 1. Get knowledge base content relevant to the club or global
        const knowledge = await prisma.knowledgeSource.findMany({
            where: {
                OR: [
                    { clubId: req.user.clubId },
                    { clubId: null }
                ]
            }
        });

        // 2. Prepare context for OpenAI
        const context = knowledge.map(k => `${k.title}: ${k.content}`).join('\n\n');
        const prompt = `Actúa como un experto en Imagen Pública de Rotary International. 
        Basado en el siguiente conocimiento institucional:
        ${context}
        
        Sugiere 4 ideas de publicaciones para redes sociales para el mes de ${month}/${year}. 
        Cada sugerencia debe incluir:
        - Título
        - Texto sugerido (Copy)
        - Plataforma recomendada
        - Fecha sugerida
        
        Formato JSON: [{"title": "...", "content": "...", "platform": "...", "date": "..."}]`;

        // 3. Call OpenAI (using fetch for simplicity if openai sdk is not preferred)
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4-turbo-preview",
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" }
            })
        });

        const data = await response.json();
        const suggestions = JSON.parse(data.choices[0].message.content);

        res.json(suggestions);
    } catch (error) {
        console.error('AI Suggestion Error:', error);
        res.status(500).json({ error: 'Error al generar sugerencias con IA' });
    }
});

// Manage Knowledge Base
router.get('/knowledge', authMiddleware, async (req, res) => {
    try {
        const sources = await prisma.knowledgeSource.findMany({
            where: {
                OR: [
                    { clubId: req.user.clubId },
                    { clubId: null }
                ]
            }
        });
        res.json(sources);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching knowledge base' });
    }
});

router.post('/knowledge', authMiddleware, async (req, res) => {
    try {
        const { title, type, content, fileUrl } = req.body;
        const source = await prisma.knowledgeSource.create({
            data: {
                title,
                type,
                content, // Expecting extracted text here
                fileUrl,
                clubId: req.user.role === 'administrator' && !req.body.isLocal ? null : req.user.clubId
            }
        });
        res.json(source);
    } catch (error) {
        res.status(500).json({ error: 'Error adding knowledge source' });
    }
});

module.exports = router;
