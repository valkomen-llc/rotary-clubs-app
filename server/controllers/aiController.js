export const proxyPerplexity = async (req, res) => {
    try {
        const fetch = (await import('node-fetch')).default;
        
        const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY || req.headers.authorization?.replace('Bearer ', '')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body)
        });

        const data = await perplexityResponse.json();
        return res.status(perplexityResponse.status).json(data);
    } catch (error) {
        console.error('Error proxying Perplexity:', error);
        return res.status(500).json({ error: error.message });
    }
};
