import express from 'express';
import db from '../lib/db.js';

const router = express.Router();

// In-memory L1 cache: lang -> hash -> translation
const memCache = {};

// Simple hash for caching
const hashText = (text, lang) => `${lang}::${text.substring(0, 120)}`;

// ── POST /api/translate ─────────────────────────────────────────────────────
// Public (no auth required) — caches by text + lang in DB
// Body: { text: string, targetLang: string }  (targetLang = 'en', 'fr', etc.)
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

    // L3: Gemini API
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
        return res.status(503).json({
            error: 'Gemini API key not configured. Go to Integrations and add your GEMINI_API_KEY.',
            translated: text
        });
    }

    try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const langNames = {
            en: 'English', fr: 'French', pt: 'Portuguese',
            de: 'German', it: 'Italian', ja: 'Japanese', ko: 'Korean'
        };
        const langName = langNames[targetLang] || targetLang;

        const prompt = `Translate the following text to ${langName}. 
Rules:
- Return ONLY the translated text, nothing else
- Preserve HTML tags if present
- Keep proper nouns (Rotary, Rotaract, etc.) unchanged
- Maintain the same tone and formatting

Text to translate:
${text}`;

        const result = await model.generateContent(prompt);
        const translated = result.response.text().trim();

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

// ── POST /api/translate/bulk ────────────────────────────────────────────────
// Translate multiple strings at once (for page load)
// Body: { texts: string[], targetLang: string }
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
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const langNames = {
            en: 'English', fr: 'French', pt: 'Portuguese',
            de: 'German', it: 'Italian', ja: 'Japanese', ko: 'Korean'
        };
        const langName = langNames[targetLang] || targetLang;

        // Send all as numbered list for efficiency
        const numbered = texts.map((t, i) => `[${i + 1}] ${t}`).join('\n');
        const prompt = `Translate the following numbered list to ${langName}.
Return ONLY the translated numbered list in the same format [1], [2], etc.
Do not translate proper nouns: Rotary, Rotaract, Interact.

${numbered}`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text().trim();

        // Parse numbered responses
        const translations = texts.map((original, i) => {
            const match = responseText.match(new RegExp(`\\[${i + 1}\\]\\s*(.+?)(?=\\[${i + 2}\\]|$)`, 's'));
            return match ? match[1].trim() : original;
        });

        // Cache all results
        texts.forEach((text, i) => {
            const key = hashText(text, targetLang);
            memCache[key] = translations[i];
        });

        return res.json({ translations });
    } catch (err) {
        return res.json({ translations: texts, error: err.message });
    }
});

// ── GET /api/translate/settings ─────────────────────────────────────────────
// Check if Gemini is configured (for the Integrations page)
router.get('/settings', async (req, res) => {
    const hasKey = !!process.env.GEMINI_API_KEY;
    res.json({ configured: hasKey });
});

export default router;
