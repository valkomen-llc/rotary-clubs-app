
export default async function handler(req, res) {
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(200).json({ error: 'Falta GEMINI_API_KEY en el servidor' });

        const { context } = req.body;
        if (!context) return res.status(200).json({ error: 'Falta el contexto del artículo' });

        const systemPrompt = `Eres ArticulIA, redactor de Rotary. Transforma el contexto en un artículo BREVE.
        ESTRUCTURA JSON ESTRICTA:
        {
          "title": "Titular (máx 60 car)",
          "content": "HTML: 2 párrafos cortos y 1 lista de puntos.",
          "seoTitle": "SEO Title (máx 55 car)",
          "seoDescription": "Meta desc (máx 150 car)",
          "slug": "url-corta",
          "keywords": "3 palabras clave",
          "socialCopy": "Copy breve con emojis"
        }`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ 
                    parts: [{ text: `${systemPrompt}\n\nContexto: ${context}` }] 
                }],
                generationConfig: { temperature: 0.4, maxOutputTokens: 1024 }
            })
        });

        const data = await response.json();
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        const firstBrace = raw.indexOf('{');
        const lastBrace = raw.lastIndexOf('}');
        
        if (firstBrace === -1 || lastBrace === -1) {
            return res.status(200).json({ error: 'La IA no devolvió un formato JSON válido', raw });
        }

        const article = JSON.parse(raw.substring(firstBrace, lastBrace + 1));
        return res.status(200).json(article);

    } catch (error) {
        console.error('[Draft-Engine] Fatal Error:', error);
        return res.status(200).json({ error: 'Error interno en el motor de redacción', details: error.message });
    }
}
