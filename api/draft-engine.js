
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
                generationConfig: { 
                    temperature: 0.1, 
                    maxOutputTokens: 1024,
                    responseMimeType: "application/json"
                }
            })
        });

        const data = await response.json();
        
        // Manejo de errores de cuota o seguridad de Google
        if (data.error) {
            return res.status(200).json({ error: `Google Gemini dice: ${data.error.message}` });
        }

        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!raw) return res.status(200).json({ error: 'La IA respondió con un mensaje vacío.', raw: data });

        try {
            const article = JSON.parse(raw);
            return res.status(200).json(article);
        } catch (parseError) {
            return res.status(200).json({ error: 'Error al procesar el JSON de la IA', raw: raw.substring(0, 100) });
        }

    } catch (error) {
        console.error('[Draft-Engine] Fatal Error:', error);
        return res.status(200).json({ error: 'Error interno en el motor de redacción', details: error.message });
    }
}
