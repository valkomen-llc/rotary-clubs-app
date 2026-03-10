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
async function geminiTranslate(prompt, apiKey, maxOutputTokens = 2048) {
    const resp = await fetch(GEMINI_ENDPOINT(apiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens }
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
- Keep proper nouns (Rotary, Rotaract, Interact, ClubPlatform) unchanged
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
    if (!texts || !Array.isArray(texts) || !targetLang || targetLang === 'es') {
        return res.json({ translations: texts || [] });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
        return res.json({ translations: texts });
    }

    // Pre-fill from L1 and L2 caches, collect what needs fetching
    const results = new Array(texts.length).fill(null);
    const toFetchIndices = [];

    for (let i = 0; i < texts.length; i++) {
        const text = texts[i];
        const cacheKey = hashText(text, targetLang);
        if (memCache[cacheKey]) {
            results[i] = memCache[cacheKey];
            continue;
        }
        // L2: DB cache
        try {
            const existing = await db.query(
                `SELECT value FROM "Setting" WHERE key = $1 AND "clubId" IS NULL LIMIT 1`,
                [`translation::${cacheKey}`]
            );
            if (existing.rows.length > 0) {
                memCache[cacheKey] = existing.rows[0].value;
                results[i] = existing.rows[0].value;
                continue;
            }
        } catch (_) { /* ok */ }
        toFetchIndices.push(i);
    }

    if (toFetchIndices.length === 0) {
        return res.json({ translations: results });
    }

    try {
        const langName = langNames[targetLang] || targetLang;
        const toFetchTexts = toFetchIndices.map(i => texts[i]);
        const numbered = toFetchTexts.map((t, i) => `[${i + 1}] ${t}`).join('\n');
        const prompt = `Translate the following numbered list to ${langName}.
Return ONLY the translated numbered list in the exact format [1] translation, [2] translation, etc. — one per line.
Do NOT add extra commentary. Keep proper nouns unchanged: Rotary, Rotaract, Interact, ClubPlatform.

${numbered}`;

        const responseText = await geminiTranslate(prompt, geminiKey, 8192);

        toFetchIndices.forEach((origIdx, i) => {
            const match = responseText.match(new RegExp(`\\[${i + 1}\\]\\s*(.+?)(?=\\[${i + 2}\\]|$)`, 's'));
            const translated = match ? match[1].trim() : texts[origIdx];
            results[origIdx] = translated;

            // Persist to L1 + L2 cache async
            const ck = hashText(texts[origIdx], targetLang);
            memCache[ck] = translated;
            db.query(
                `INSERT INTO "Setting" (id, key, value, "clubId", "updatedAt")
                 VALUES (gen_random_uuid(), $1, $2, NULL, NOW())
                 ON CONFLICT (key, "clubId") DO UPDATE SET value = $2, "updatedAt" = NOW()`,
                [`translation::${ck}`, translated]
            ).catch(() => { /* ignore cache write errors */ });
        });

        return res.json({ translations: results });
    } catch (err) {
        toFetchIndices.forEach(i => { results[i] = texts[i]; });
        return res.json({ translations: results, error: err.message });
    }
});

// ── GET /api/translate/settings ──────────────────────────────────────────────
router.get('/settings', async (req, res) => {
    const hasKey = !!process.env.GEMINI_API_KEY;
    res.json({ configured: hasKey });
});

// ── GET /api/translate/usage ──────────────────────────────────────────────────
// Returns translation usage stats for super admin. Auth handled by frontend guard.
router.get('/usage', async (req, res) => {
    try {
        // Total cached translation entries in DB
        const totalResult = await db.query(
            `SELECT COUNT(*) AS total FROM "Setting"
             WHERE key LIKE 'translation::%' AND "clubId" IS NULL`
        );
        const total = parseInt(totalResult.rows[0]?.total || '0', 10);

        // Per-language breakdown — extract lang from key prefix "translation::lang::..."
        const byLangResult = await db.query(
            `SELECT
                split_part(split_part(key, '::', 2), '::', 1) AS lang,
                COUNT(*) AS count,
                SUM(char_length(value)) AS chars
             FROM "Setting"
             WHERE key LIKE 'translation::%' AND "clubId" IS NULL
             GROUP BY 1
             ORDER BY 2 DESC`
        );

        // In-memory cache counters (cross-session estimate)
        const memCacheTotal = Object.values(memCache).reduce((acc, m) => acc + Object.keys(m).length, 0);

        // Cost estimate: Gemini 2.0 Flash input ≈ $0.075/1M tokens, output ≈ $0.30/1M tokens
        // Rough heuristic: avg 30 tokens input + 35 tokens output per translation call
        const AVG_INPUT_TOKENS = 30;
        const AVG_OUTPUT_TOKENS = 35;
        const INPUT_COST_PER_M = 0.075;
        const OUTPUT_COST_PER_M = 0.30;
        const estimatedCost = (
            (total * AVG_INPUT_TOKENS / 1_000_000) * INPUT_COST_PER_M +
            (total * AVG_OUTPUT_TOKENS / 1_000_000) * OUTPUT_COST_PER_M
        );

        const estimatedTokensInput = total * AVG_INPUT_TOKENS;
        const estimatedTokensOutput = total * AVG_OUTPUT_TOKENS;

        res.json({
            totalCachedTranslations: total,
            memCacheEntries: memCacheTotal,
            byLanguage: byLangResult.rows.map(r => ({
                lang: r.lang,
                count: parseInt(r.count, 10),
                chars: parseInt(r.chars || '0', 10),
            })),
            estimatedTokensInput,
            estimatedTokensOutput,
            estimatedCostUSD: parseFloat(estimatedCost.toFixed(6)),
            model: 'gemini-2.0-flash',
            pricingNote: 'Estimación: $0.075/M tokens entrada + $0.30/M tokens salida (precios de Google AI Studio)',
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
