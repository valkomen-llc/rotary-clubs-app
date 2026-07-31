/**
 * Registro de consumo por proveedor — Creador de Reels IA
 * ========================================================
 *
 * Cada llamada a un servicio externo deja una fila acá: qué proveedor, qué
 * operación, cuánto tardó, cuántas unidades gastó y si salió bien. El panel de
 * auditoría es la SUMA de estas filas agrupada por proveedor.
 *
 * Por qué existe
 * --------------
 * La pregunta que lo motivó —«¿KIE está haciendo cosas que no le tocan?»— no se
 * podía contestar mirando la pantalla, sólo leyendo el código. Un módulo que
 * reparte trabajo entre cuatro motores tiene que poder MOSTRAR ese reparto, no
 * sólo cumplirlo.
 *
 * Reglas
 * ------
 * · **Lo que se mide se mide; lo que se estima se dice.** El tiempo (`ms`) y las
 *   unidades naturales (caracteres de voz, segundos de música, tokens del
 *   modelo) son medidas reales. Los créditos son NUESTRA estimación, no el
 *   saldo del proveedor, igual que el resto del módulo.
 * · **El costo en dinero sólo aparece si hay tarifa configurada.** Ninguna
 *   tarifa viene inventada por defecto: los precios dependen del plan de cada
 *   cuenta y publicar un número inventado es peor que no publicar ninguno.
 *   Se configuran con `REEL_RATE_*` y entonces el panel los calcula.
 * · **Registrar no puede romper la generación.** Todo escribe con try/catch: un
 *   fallo del registro no puede tumbar un Reel que se generó bien.
 * · **`scope` es el contrato de separación.** Dice a qué familia de trabajo
 *   pertenece cada operación. Es lo que permite detectar —y mostrar— que un
 *   proveedor está haciendo algo que no le corresponde.
 */

import db from './db.js';

// ─── Proveedores ───────────────────────────────────────────────────────────
//
// `allows` enumera los scopes que le corresponden a cada proveedor. Es la
// declaración explícita del reparto de responsabilidades: si alguna vez se
// registra una operación fuera de esa lista, el panel lo marca en rojo.
export const USAGE_PROVIDERS = {
    kie: {
        id: 'kie',
        label: 'KIE.AI',
        role: 'Imagen y video',
        allows: ['video', 'image'],
        unit: 'credits',
        unitLabel: 'créditos',
        note: 'Anima las fotos y adapta el lienzo. No genera voz, música, copy ni texto.'
    },
    elevenlabs: {
        id: 'elevenlabs',
        label: 'ElevenLabs',
        role: 'Audio',
        allows: ['voice', 'music'],
        unit: 'characters',
        unitLabel: 'caracteres / segundos',
        note: 'Locución y banda sonora instrumental.'
    },
    stability: {
        id: 'stability',
        label: 'Stability · Stable Audio',
        role: 'Audio (respaldo)',
        allows: ['music'],
        unit: 'seconds',
        unitLabel: 'segundos',
        note: 'Respaldo de música cuando ElevenLabs no responde.'
    },
    llm: {
        id: 'llm',
        label: 'Modelo de lenguaje',
        role: 'Texto',
        allows: ['text', 'vision'],
        unit: 'tokens',
        unitLabel: 'tokens',
        note: 'Copy, guion, storytelling y análisis de las fotos. Ningún recurso multimedia.'
    },
    ffmpeg: {
        id: 'ffmpeg',
        label: 'FFmpeg',
        role: 'Montaje',
        allows: ['render'],
        unit: 'seconds',
        unitLabel: 'segundos de proceso',
        note: 'Corre en nuestra propia función: no consume créditos de terceros.'
    },
    render: {
        id: 'render',
        label: 'Montaje alojado',
        role: 'Montaje',
        allows: ['render'],
        unit: 'seconds',
        unitLabel: 'segundos de proceso',
        note: 'Shotstack, Creatomate o JSON2Video, si se configuran como principal.'
    }
};

// ─── Operaciones ───────────────────────────────────────────────────────────
//
// El `provider` de acá es el que DEBERÍA atenderla. Al registrar se guarda
// también el que realmente la atendió, y el panel compara los dos.
export const USAGE_OPERATIONS = {
    'scene.expand':     { label: 'Adaptación del lienzo',   provider: 'kie',        scope: 'image' },
    'scene.animate':    { label: 'Animación de la escena',  provider: 'kie',        scope: 'video' },
    'music.generate':   { label: 'Banda sonora',            provider: 'elevenlabs', scope: 'music' },
    'voice.synthesize': { label: 'Locución',                provider: 'elevenlabs', scope: 'voice' },
    'copy.generate':    { label: 'Copy por plataforma',     provider: 'llm',        scope: 'text' },
    'script.generate':  { label: 'Guion de la locución',    provider: 'llm',        scope: 'text' },
    'director.analyze': { label: 'Análisis de la fotografía', provider: 'llm',      scope: 'vision' },
    'director.plan':    { label: 'Dirección del montaje',   provider: 'llm',        scope: 'text' },
    'fidelity.judge':   { label: 'Control de fidelidad',    provider: 'llm',        scope: 'vision' },
    'expansion.judge':  { label: 'Control de la adaptación', provider: 'llm',       scope: 'vision' },
    'render.compose':   { label: 'Montaje final',           provider: 'ffmpeg',     scope: 'render' }
};

// Créditos estimados de las operaciones que no los declaran en su propio
// registro. Los de video ya viven en `VIDEO_ENGINES[].creditEstimate`; éstos
// son los que faltaban. Son estimaciones NUESTRAS, con la misma honestidad que
// el resto del medidor, y se corrigen por entorno sin desplegar.
export const CREDIT_ESTIMATES = {
    expansion: Number(process.env.REEL_CREDITS_EXPANSION || 4)
};

// ─── Tarifas ───────────────────────────────────────────────────────────────
//
// Sin variable de entorno NO hay costo: se devuelve null y el panel dice que
// falta configurar la tarifa. Inventar un precio por defecto sería exactamente
// el tipo de número que después nadie sabe de dónde salió.
const rate = (key) => {
    const raw = process.env[key];
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
};

export const RATES = () => ({
    // USD por crédito de KIE
    kieCredit: rate('REEL_RATE_KIE_CREDIT_USD'),
    // USD por cada 1.000 caracteres de locución
    elevenCharsK: rate('REEL_RATE_ELEVENLABS_CHARS_USD'),
    // USD por segundo de música generada
    musicSecond: rate('REEL_RATE_MUSIC_SECOND_USD'),
    // USD por cada 1.000 tokens del modelo de lenguaje
    llmTokensK: rate('REEL_RATE_LLM_TOKENS_USD')
});

// Costo aproximado de UNA fila. `null` cuando no hay tarifa para su unidad.
export const rowCost = (row, rates = RATES()) => {
    const units = Number(row.units || 0);
    if (!units) return null;
    switch (row.unit) {
        case 'credits':    return rates.kieCredit    == null ? null : units * rates.kieCredit;
        case 'characters': return rates.elevenCharsK == null ? null : (units / 1000) * rates.elevenCharsK;
        case 'seconds':    return rates.musicSecond  == null ? null : units * rates.musicSecond;
        case 'tokens':     return rates.llmTokensK   == null ? null : (units / 1000) * rates.llmTokensK;
        default:           return null;
    }
};

// Tokens realmente gastados, leídos de la respuesta cruda del proveedor.
// `generateCopy` devuelve `raw` con el cuerpo entero, y los tres proveedores
// informan su consumo — cada uno con otro nombre. Sin esto habría que estimar
// los tokens, y una estimación de tokens no sirve para auditar un gasto.
export const tokensOf = (raw) => {
    if (!raw || typeof raw !== 'object') return 0;
    // OpenAI
    if (raw.usage?.total_tokens) return Number(raw.usage.total_tokens);
    // Anthropic
    if (raw.usage?.input_tokens != null || raw.usage?.output_tokens != null) {
        return Number(raw.usage.input_tokens || 0) + Number(raw.usage.output_tokens || 0);
    }
    // Gemini
    if (raw.usageMetadata?.totalTokenCount) return Number(raw.usageMetadata.totalTokenCount);
    return 0;
};

// ─── Escritura ─────────────────────────────────────────────────────────────

export const recordUsage = async ({
    projectId, clubId = null, sceneId = null,
    operation, provider, model = null,
    units = 0, unit = null, credits = 0,
    ms = 0, status = 'ok', detail = null, target = null
}) => {
    if (!projectId || !operation) return null;
    const spec = USAGE_OPERATIONS[operation];
    try {
        const { rows } = await db.query(
            `INSERT INTO "ReelUsage"
                (id, "projectId", "clubId", "sceneId", operation, scope,
                 provider, "expectedProvider", model, units, unit, credits,
                 ms, status, detail, target, "createdAt")
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
             RETURNING *`,
            [
                projectId, clubId, sceneId, operation, spec?.scope || null,
                provider || spec?.provider || null, spec?.provider || null, model,
                Number(units) || 0, unit, Math.round(Number(credits) || 0),
                Math.round(Number(ms) || 0), status,
                detail ? String(detail).slice(0, 500) : null,
                target
            ]
        );
        return rows[0];
    } catch (e) {
        // Nunca lanza: el registro es observabilidad, no parte del producto.
        console.warn(`[REEL-USAGE] no se pudo registrar ${operation}: ${e.message}`);
        return null;
    }
};

/**
 * Envuelve una llamada a un proveedor, la mide y la registra.
 *
 * Devuelve exactamente lo que devuelva `fn`, y relanza su error tal cual: el
 * registro observa, no cambia el comportamiento. `meta` permite que la propia
 * llamada informe unidades reales que sólo se conocen después (los caracteres
 * que se sintetizaron, los tokens que gastó el modelo).
 */
export const track = async (ctx, fn) => {
    const startedAt = Date.now();
    const collected = {};
    try {
        const result = await fn(collected);
        await recordUsage({
            ...ctx, ...collected,
            ms: Date.now() - startedAt,
            status: 'ok'
        });
        return result;
    } catch (e) {
        await recordUsage({
            ...ctx, ...collected,
            ms: Date.now() - startedAt,
            status: 'error',
            detail: e.message
        });
        throw e;
    }
};

// ─── Lectura ───────────────────────────────────────────────────────────────

const emptyProvider = (id) => {
    const p = USAGE_PROVIDERS[id];
    return {
        id, label: p?.label || id, role: p?.role || null, note: p?.note || null,
        unitLabel: p?.unitLabel || null,
        calls: 0, errors: 0, ms: 0, credits: 0, units: 0,
        costUsd: null, costKnown: true,
        operations: [], violations: []
    };
};

/**
 * Desglose del consumo de un Reel, agrupado por proveedor.
 *
 * `costKnown: false` en un proveedor significa que gastó unidades pero no hay
 * tarifa configurada para convertirlas a dinero. Es distinto de gastar cero, y
 * el panel lo dice con esas palabras en vez de mostrar «$0».
 */
export const usageReport = async (projectId) => {
    const rates = RATES();
    let rows = [];
    try {
        const r = await db.query(
            `SELECT * FROM "ReelUsage" WHERE "projectId" = $1 ORDER BY "createdAt" ASC`,
            [projectId]
        );
        rows = r.rows;
    } catch (e) {
        console.warn(`[REEL-USAGE] no se pudo leer el consumo: ${e.message}`);
        return { available: false, reason: e.message, providers: [], totals: null, rates };
    }

    const byProvider = new Map();
    let totalCost = 0;
    let anyCostUnknown = false;

    for (const row of rows) {
        const pid = row.provider || 'llm';
        if (!byProvider.has(pid)) byProvider.set(pid, emptyProvider(pid));
        const bucket = byProvider.get(pid);

        bucket.calls += 1;
        if (row.status === 'error') bucket.errors += 1;
        bucket.ms += Number(row.ms || 0);
        bucket.credits += Number(row.credits || 0);
        bucket.units += Number(row.units || 0);

        const cost = rowCost(row, rates);
        if (cost == null && Number(row.units || 0) > 0) {
            bucket.costKnown = false;
            anyCostUnknown = true;
        } else if (cost != null) {
            bucket.costUsd = (bucket.costUsd || 0) + cost;
            totalCost += cost;
        }

        // Desglose por operación, que es como lo pide el panel: «Animación
        // escena 1», «Animación escena 2»…
        const spec = USAGE_OPERATIONS[row.operation];
        bucket.operations.push({
            operation: row.operation,
            label: spec?.label || row.operation,
            target: row.target,
            model: row.model,
            units: Number(row.units || 0),
            unit: row.unit,
            credits: Number(row.credits || 0),
            ms: Number(row.ms || 0),
            status: row.status,
            detail: row.detail,
            at: row.createdAt
        });

        // Separación de responsabilidades: una operación atendida por un
        // proveedor que no la tiene entre sus `allows` es exactamente lo que
        // este panel existe para hacer visible.
        const allowed = USAGE_PROVIDERS[pid]?.allows || [];
        if (row.scope && allowed.length && !allowed.includes(row.scope)) {
            bucket.violations.push({
                operation: row.operation,
                label: spec?.label || row.operation,
                scope: row.scope,
                expected: row.expectedProvider
            });
        }
    }

    const providers = [...byProvider.values()].sort((a, b) => b.ms - a.ms);

    return {
        available: true,
        providers,
        totals: {
            calls: rows.length,
            errors: rows.filter(r => r.status === 'error').length,
            ms: rows.reduce((s, r) => s + Number(r.ms || 0), 0),
            credits: rows.reduce((s, r) => s + Number(r.credits || 0), 0),
            costUsd: totalCost > 0 ? totalCost : null,
            costKnown: !anyCostUnknown,
            violations: providers.reduce((s, p) => s + p.violations.length, 0)
        },
        rates
    };
};

// Consumo agregado del mes, para el freno de gasto y el panel general.
export const monthlyUsage = async (clubId = null) => {
    try {
        const { rows } = await db.query(
            `SELECT provider, SUM(credits)::int AS credits, SUM(ms)::bigint AS ms, COUNT(*)::int AS calls
               FROM "ReelUsage"
              WHERE "createdAt" >= date_trunc('month', NOW())
                AND ($1::text IS NULL OR "clubId" = $1)
              GROUP BY provider`,
            [clubId]
        );
        return rows.map(r => ({
            provider: r.provider,
            label: USAGE_PROVIDERS[r.provider]?.label || r.provider,
            credits: Number(r.credits || 0),
            ms: Number(r.ms || 0),
            calls: Number(r.calls || 0)
        }));
    } catch {
        return [];
    }
};
