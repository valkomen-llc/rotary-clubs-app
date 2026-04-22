
export default async function handler(req, res) {
    // Permitir CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const { context } = req.body;
    
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(200).json({ error: 'Error: GEMINI_API_KEY no encontrada en el servidor.' });
        }

        const systemPrompt = `Eres ArticulIA, redactor veloz de Rotary. Transforma el contexto en un artículo BREVE.
        ESTRUCTURA JSON ESTRICTA:
        {
          "title": "Titular (máx 60 car)",
          "content": "HTML: 2 párrafos cortos y 1 lista de puntos.",
          "seoTitle": "SEO Title (máx 55 car)",
          "seoDescription": "Meta desc (máx 150 car)",
          "slug": "url-corta",
          "keywords": "3 palabras clave",
          "tags": ["Rotary", "Acción"],
          "socialCopy": "Copy breve con emojis"
        }`;

        const userPrompt = `Contexto: ${context}`;

        console.log('[ArticulIA-Capsule] Llamando a motor estable (v1)...');
        
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ 
                    parts: [{ text: `${systemPrompt}\n\nContexto: ${userPrompt}` }] 
                }],
                generationConfig: { temperature: 0.4, maxOutputTokens: 1024 }
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            return res.status(200).json({ error: `Error de API: ${data.error?.message || 'Fallo desconocido'}` });
        }

        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const firstBrace = raw.indexOf('{');
        const lastBrace = raw.lastIndexOf('}');
        
        if (firstBrace === -1 || lastBrace === -1) {
            return res.status(200).json({ error: 'La IA no devolvió un formato válido', raw });
        }

        const article = JSON.parse(raw.substring(firstBrace, lastBrace + 1));
        res.status(200).json(article);

    } catch (error) {
        console.error('[ArticulIA-Capsule] Crash:', error.message);
        res.status(200).json({ 
            error: 'La cápsula de IA ha tenido un error interno', 
            details: error.message 
        });
    }
}
