import express from 'express';
import db from '../lib/db.js';

const router = express.Router();

// In-memory L1 cache: lang -> hash -> translation
const memCache = {};

// Simple hash for caching
const hashText = (text, lang) => `${lang}::${text.substring(0, 120)}`;

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = (key) =>
    `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${key}`;

const langNames = {
    en: 'English', fr: 'French', pt: 'Portuguese',
    de: 'German', it: 'Italian', ja: 'Japanese', ko: 'Korean'
};

// Core Gemini call using native fetch (v1 REST API — no SDK)
async function geminiTranslate(prompt, apiKey) {
    const resp = await fetch(GEMINI_ENDPOINT(apiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
        })
    });
    if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Gemini API ${resp.status}: ${err}`);
    }
    const data = await resp.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

// ── POST /api/translate ──────────────────────────────────────────────────────
router.post('/', async (req, res) => {
    const { text, targetLang } = req.body;

    if (!text || !targetLang || targetLang === 'es') {
        return res.json({ translated: text });
    }

    const cacheKey = hashText(text, targetLang);

    // L1: Memory cache
    if (memCache[cacheKey]) {
        return res.json({ translated: memCache[cacheKey], source: 'memory' });
    }

    // L2: Database cache
    try {
        const existing = await db.query(
            `SELECT value FROM "Setting" WHERE key = $1 AND "clubId" IS NULL LIMIT 1`,
            [`translation::${cacheKey}`]
        );
        if (existing.rows.length > 0) {
            memCache[cacheKey] = existing.rows[0].value;
            return res.json({ translated: existing.rows[0].value, source: 'cache' });
        }
    } catch (_) { /* DB cache miss is ok */ }

    // L3: Gemini REST API
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
        return res.status(503).json({
            error: 'Gemini API key not configured.',
            translated: text
        });
    }

    try {
        const langName = langNames[targetLang] || targetLang;
        const prompt = `Translate the following text to ${langName}.
Rules:
- Return ONLY the translated text, nothing else
- Preserve HTML tags if present
- Keep proper nouns (Rotary, Rotaract, Interact) unchanged
- Maintain the same tone and formatting

Text to translate:
${text}`;

        const translated = await geminiTranslate(prompt, geminiKey);

        // Save to L1 memory
        memCache[cacheKey] = translated;

        // Save to L2 DB cache (async, don't wait)
        db.query(
            `INSERT INTO "Setting" (id, key, value, "clubId", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, NULL, NOW())
             ON CONFLICT (key, "clubId") DO UPDATE SET value = $2, "updatedAt" = NOW()`,
            [`translation::${cacheKey}`, translated]
        ).catch(() => { /* ignore cache write errors */ });

        return res.json({ translated, source: 'gemini' });
    } catch (err) {
        console.error('Gemini translation error:', err.message);
        return res.json({ translated: text, error: err.message });
    }
});

// ── POST /api/translate/bulk ─────────────────────────────────────────────────
router.post('/bulk', async (req, res) => {
    const { texts, targetLang } = req.body;
    if (!texts || !targetLang || targetLang === 'es') {
        return res.json({ translations: texts });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
        return res.json({ translations: texts });
    }

    try {
        const langName = langNames[targetLang] || targetLang;
        const numbered = texts.map((t, i) => `[${i + 1}] ${t}`).join('\n');
        const prompt = `Translate the following numbered list to ${langName}.
Return ONLY the translated numbered list in the same format [1], [2], etc.
Do not translate proper nouns: Rotary, Rotaract, Interact.

${numbered}`;

        const responseText = await geminiTranslate(prompt, geminiKey);

        const translations = texts.map((original, i) => {
            const match = responseText.match(new RegExp(`\\[${i + 1}\\]\\s*(.+?)(?=\\[${i + 2}\\]|$)`, 's'));
            return match ? match[1].trim() : original;
        });

        texts.forEach((text, i) => {
            memCache[hashText(text, targetLang)] = translations[i];
        });

        return res.json({ translations });
    } catch (err) {
        return res.json({ translations: texts, error: err.message });
    }
});

// ── GET /api/translate/settings ──────────────────────────────────────────────
router.get('/settings', async (req, res) => {
    const hasKey = !!process.env.GEMINI_API_KEY;
    res.json({ configured: hasKey });
});

export default router;
