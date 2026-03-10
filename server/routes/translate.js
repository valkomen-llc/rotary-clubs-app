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

// Core Gemini call using native fetch (v1 REST API)
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
    if (!text || !targetLang || targetLang === 'es') return res.json({ translated: text });

    const cacheKey = hashText(text, targetLang);

    if (memCache[cacheKey]) return res.json({ translated: memCache[cacheKey], source: 'memory' });

    try {
        const existing = await db.query(
            `SELECT value FROM "Setting" WHERE key = $1 AND "clubId" IS NULL LIMIT 1`,
            [`translation::${cacheKey}`]
        );
        if (existing.rows.length > 0) {
            memCache[cacheKey] = existing.rows[0].value;
            return res.json({ translated: existing.rows[0].value, source: 'cache' });
        }
    } catch (_) { }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return res.status(503).json({ error: 'Gemini API key not configured.', translated: text });

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
        memCache[cacheKey] = translated;
        db.query(
            `INSERT INTO "Setting" (id, key, value, "clubId", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, NULL, NOW())
             ON CONFLICT (key, "clubId") DO UPDATE SET value = $2, "updatedAt" = NOW()`,
            [`translation::${cacheKey}`, translated]
        ).catch(() => { });
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
    if (!geminiKey) return res.json({ translations: texts });

    const results = new Array(texts.length).fill(null);
    const toFetchIndices = [];

    for (let i = 0; i < texts.length; i++) {
        const text = texts[i];
        const cacheKey = hashText(text, targetLang);
        if (memCache[cacheKey]) { results[i] = memCache[cacheKey]; continue; }
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
        } catch (_) { }
        toFetchIndices.push(i);
    }

    if (toFetchIndices.length === 0) return res.json({ translations: results });

    try {
        const langName = langNames[targetLang] || targetLang;
        const toFetchTexts = toFetchIndices.map(i => texts[i]);
        const numbered = toFetchTexts.map((t, i) => `[${i + 1}] ${t}`).join('\n');
        const prompt = `Translate the following numbered list to ${langName}.
Return ONLY the translated numbered list in the exact format [1] translation, [2] translation, etc. -- one per line.
Do NOT add extra commentary. Keep proper nouns unchanged: Rotary, Rotaract, Interact, ClubPlatform.

${numbered}`;

        const responseText = await geminiTranslate(prompt, geminiKey, 8192);

        toFetchIndices.forEach((origIdx, i) => {
            const match = responseText.match(new RegExp(`\\[${i + 1}\\]\\s*(.+?)(?=\\[${i + 2}\\]|$)`, 's'));
            const translated = match ? match[1].trim() : texts[origIdx];
            results[origIdx] = translated;
            const ck = hashText(texts[origIdx], targetLang);
            memCache[ck] = translated;
            db.query(
                `INSERT INTO "Setting" (id, key, value, "clubId", "updatedAt")
                 VALUES (gen_random_uuid(), $1, $2, NULL, NOW())
                 ON CONFLICT (key, "clubId") DO UPDATE SET value = $2, "updatedAt" = NOW()`,
                [`translation::${ck}`, translated]
            ).catch(() => { });
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

// ── GET /api/translate/usage -- Super Admin usage stats ──────────────────────
router.get('/usage', async (req, res) => {
    try {
        const totalResult = await db.query(
            `SELECT COUNT(*) AS total FROM "Setting" WHERE key LIKE 'translation::%' AND "clubId" IS NULL`
        );
        const total = parseInt(totalResult.rows[0]?.total || '0', 10);

        const byLangResult = await db.query(
            `SELECT
                split_part(split_part(key, '::', 2), '::', 1) AS lang,
                COUNT(*) AS count,
                SUM(char_length(value)) AS chars
             FROM "Setting"
             WHERE key LIKE 'translation::%' AND "clubId" IS NULL
             GROUP BY 1 ORDER BY 2 DESC`
        );

        // Domain usage logs: key format txlog::LANG::DOMAIN
        const logsResult = await db.query(
            `SELECT key, value FROM "Setting" WHERE key LIKE 'txlog::%' AND "clubId" IS NULL`
        );

        const domainsByLang = {};
        for (const row of logsResult.rows) {
            const parts = row.key.split('::');
            if (parts.length < 3) continue;
            const lang = parts[1];
            const domain = parts[2];
            let info = { count: 0, pages: [], lastSeen: null };
            try { info = JSON.parse(row.value); } catch { /* ok */ }
            if (!domainsByLang[lang]) domainsByLang[lang] = [];
            domainsByLang[lang].push({ domain, count: info.count || 0, pages: info.pages || [], lastSeen: info.lastSeen || null });
        }

        // Enrich with Club name
        const allDomains = [...new Set(logsResult.rows.map(r => r.key.split('::')[2]).filter(Boolean))];
        const clubNames = {};
        if (allDomains.length) {
            const clubRes = await db.query(
                `SELECT domain, subdomain, name FROM "Club" WHERE domain = ANY($1) OR subdomain = ANY($1)`,
                [allDomains]
            );
            for (const c of clubRes.rows) {
                if (c.domain) clubNames[c.domain] = c.name;
                if (c.subdomain) clubNames[c.subdomain] = c.name;
            }
        }
        for (const lang of Object.keys(domainsByLang)) {
            domainsByLang[lang] = domainsByLang[lang].map(d => ({ ...d, clubName: clubNames[d.domain] || null }));
        }

        const memCacheTotal = Object.values(memCache).reduce((acc, m) => acc + Object.keys(m).length, 0);
        const AVG_IN = 30, AVG_OUT = 35;
        const estimatedCost = (total * AVG_IN / 1_000_000) * 0.075 + (total * AVG_OUT / 1_000_000) * 0.30;

        res.json({
            totalCachedTranslations: total,
            memCacheEntries: memCacheTotal,
            byLanguage: byLangResult.rows.map(r => ({
                lang: r.lang,
                count: parseInt(r.count, 10),
                chars: parseInt(r.chars || '0', 10),
                domains: domainsByLang[r.lang] || [],
            })),
            estimatedTokensInput: total * AVG_IN,
            estimatedTokensOutput: total * AVG_OUT,
            estimatedCostUSD: parseFloat(estimatedCost.toFixed(6)),
            model: 'gemini-2.0-flash',
            pricingNote: '$0.075/M tokens entrada + $0.30/M tokens salida (Google AI Studio)',
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/translate/log-domain -- frontend registers which domain/page translated
router.post('/log-domain', async (req, res) => {
    const { lang, domain, page, count } = req.body;
    if (!lang || !domain) return res.json({ ok: false });
    const key = `txlog::${lang}::${domain}`;
    try {
        const existing = await db.query(
            `SELECT value FROM "Setting" WHERE key = $1 AND "clubId" IS NULL LIMIT 1`, [key]
        );
        let info = { count: 0, pages: [], lastSeen: null };
        if (existing.rows.length) { try { info = JSON.parse(existing.rows[0].value); } catch { /* ok */ } }
        info.count = (info.count || 0) + (count || 1);
        info.lastSeen = new Date().toISOString();
        if (page && !info.pages.includes(page)) {
            info.pages = [...(info.pages || []).slice(-19), page]; // max 20 unique pages
        }
        await db.query(
            `INSERT INTO "Setting" (id, key, value, "clubId", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, NULL, NOW())
             ON CONFLICT (key, "clubId") DO UPDATE SET value = $2, "updatedAt" = NOW()`,
            [key, JSON.stringify(info)]
        );
        res.json({ ok: true });
    } catch (err) { res.json({ ok: false, error: err.message }); }
});

// ── GET /api/translate/analytics -- load GA4 config ──────────────────────────
router.get('/analytics', async (req, res) => {
    try {
        const r = await db.query(
            `SELECT value FROM "Setting" WHERE key = 'analytics_ga4_id' AND "clubId" IS NULL LIMIT 1`
        );
        res.json({ gaId: r.rows[0]?.value || '' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/translate/analytics -- save GA4 ID ─────────────────────────────
router.post('/analytics', async (req, res) => {
    const { gaId } = req.body;
    if (!gaId) return res.status(400).json({ error: 'gaId required' });
    try {
        await db.query(
            `INSERT INTO "Setting" (id, key, value, "clubId", "updatedAt")
             VALUES (gen_random_uuid(), 'analytics_ga4_id', $1, NULL, NOW())
             ON CONFLICT (key, "clubId") DO UPDATE SET value = $1, "updatedAt" = NOW()`,
            [gaId]
        );
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
