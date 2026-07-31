// ════════════════════════════════════════════════════════════════════
// Creador de Reels IA — copies por plataforma
// v4.666.0
//
// Genera los textos de publicación para TikTok, Instagram Reels y YouTube
// Shorts, listos para copiar y pegar.
//
// NO ES UN MOTOR NUEVO. Usa `generateCopy` —el mismo servicio del Generador de
// Publicaciones, con su cadena de proveedores y su respaldo— y las mismas
// reglas editoriales (`institutionalVoice.js`), que desde v4.666 viven en un
// único sitio para que la voz de la plataforma no se bifurque.
//
// DE DÓNDE SALE EL ANÁLISIS: del que ya hizo el director al armar el Reel. Las
// tres fotos ya se miraron con un modelo de visión —sujeto, marca, texto,
// personas, energía, plano— y esa información está guardada en el proyecto.
// Volver a mirarlas costaría tres llamadas de visión para saber lo mismo. El
// copy se escribe sobre lo que YA se sabe de la pieza.
//
// CUÁNDO CORRE: al crear el Reel, justo después de la dirección y ANTES de que
// terminen los clips. Los clips tardan 1-3 minutos; el copy, ~10 s. Cuando el
// video está listo, los textos llevan rato esperando. Ese es el paralelismo
// pedido, y sale gratis porque el análisis ya está hecho.
// ════════════════════════════════════════════════════════════════════

import { generateCopy } from '../services/copywritingService.js';
import { INSTITUTIONAL_VOICE, dateClause, identityClause } from './institutionalVoice.js';
import { MOTION_STYLES, MUSIC_STYLES } from './reelSpec.js';

// ─── Plataformas ───────────────────────────────────────────────────────────
//
// Cada una con su límite real y su prioridad editorial. Los límites son los que
// la plataforma acepta; `sweetSpot` es donde el texto rinde mejor, y es lo que
// se le pide al modelo — pedir el máximo produce muros de texto que nadie lee.
export const COPY_PLATFORMS = {
    tiktok: {
        id: 'tiktok',
        label: 'TikTok',
        maxChars: 2200,
        sweetSpot: 150,
        maxHashtags: 6,
        priority: 'engagement',
        guidance: 'Tono conversacional y directo, como si se lo contaras a alguien. Arranque de alto impacto en la primera línea: en TikTok el texto compite con el video. Una sola idea, sin rodeos. Emojis con moderación, donde aporten ritmo.'
    },
    instagram_reels: {
        id: 'instagram_reels',
        label: 'Instagram Reels',
        maxChars: 2200,
        sweetSpot: 400,
        maxHashtags: 8,
        priority: 'interacción',
        guidance: 'Apertura que enganche, un relato breve en dos o tres frases —qué pasó y por qué importa—, el beneficio para la comunidad y un cierre que invite a responder. Emojis sólo si aportan valor.'
    },
    youtube_shorts: {
        id: 'youtube_shorts',
        label: 'YouTube Shorts',
        maxChars: 1000,
        sweetSpot: 250,
        maxHashtags: 5,
        priority: 'descubrimiento por búsqueda',
        guidance: 'Escrito para que se encuentre buscando. Las palabras clave importantes en la primera frase y en el título. Descripción informativa antes que emotiva: qué se ve, quién lo hace, dónde. Hashtags pocos y precisos; #Shorts entre ellos.'
    }
};

export const DEFAULT_PLATFORMS = Object.keys(COPY_PLATFORMS);

// ─── Categorías de campaña ─────────────────────────────────────────────────
//
// Lo que el modelo elige para etiquetar la pieza. Sirve para filtrar en la
// Biblioteca y para reutilizar el Reel después desde el calendario editorial.
export const CAMPAIGN_CATEGORIES = [
    'institucional', 'lifestyle', 'corporativo', 'marketplace', 'gastronomia',
    'fitness', 'nutricion', 'deportivo', 'industrial', 'moda', 'salud',
    'eventos', 'educacion', 'medioambiente', 'servicio-comunitario', 'recaudacion'
];

export const MARKETING_GOALS = [
    'notoriedad', 'interaccion', 'trafico', 'captacion', 'donacion',
    'inscripcion', 'fidelizacion', 'reclutamiento'
];

// ─── Prompt ────────────────────────────────────────────────────────────────

const buildSystemPrompt = () => `${INSTITUTIONAL_VOICE}

Además, ahora escribís para VIDEO VERTICAL CORTO (Reels, TikTok, Shorts). Eso cambia tres cosas:

A. El texto acompaña al video, no lo reemplaza. No describas plano por plano lo que ya se ve: aportá el porqué, el contexto y el llamado.
B. La primera línea decide si alguien sigue leyendo. Que diga algo, no que anuncie que va a decir algo.
C. Cada plataforma se escribe distinto. No adaptes un mismo texto tres veces: escribí tres textos.`;

const describeScenes = (scenes = []) => scenes
    .map((s, i) => {
        const a = s.analysis || {};
        const bits = [
            a.summary || 'escena sin descripción',
            a.subject ? `tipo ${a.subject}` : null,
            a.hasPeople ? 'con personas' : null,
            a.hasBrand ? 'con marca visible' : null,
            a.hasText ? 'con texto en pantalla' : null
        ].filter(Boolean);
        return `  ${i + 1}. ${bits.join(', ')}`;
    })
    .join('\n');

export const buildCopyPrompt = ({
    reel,
    scenes,
    clubName,
    clubCategory,
    clubCity,
    eventDateHuman = null,
    locale = 'es'
}) => {
    const hasSpecificClubName = Boolean(clubName && clubName.trim());
    const motion = MOTION_STYLES[scenes[0]?.style]?.label || 'cinematográfico';
    const music = MUSIC_STYLES[reel.direction?.musicStyle]?.label || null;

    const platformSpecs = Object.values(COPY_PLATFORMS)
        .map(p => `- ${p.id} (${p.label}): apunta a ~${p.sweetSpot} caracteres, máximo ${p.maxChars}. Máximo ${p.maxHashtags} hashtags. Prioridad: ${p.priority}. ${p.guidance}`)
        .join('\n');

    return `Entidad: "${clubName || '(sin nombre)'}"${clubCategory ? ` (categoría: ${clubCategory})` : ''}${clubCity ? ` — ciudad: ${clubCity}` : ''}.
${identityClause(hasSpecificClubName)}
${dateClause(eventDateHuman)}

Se trata de un REEL VERTICAL de ${reel.config?.timing?.finalDurationSec || 14} segundos, en ${reel.format}, con tres escenas:
${describeScenes(scenes)}

Estilo de movimiento: ${motion}.${music ? ` Banda sonora: ${music}.` : ''}${reel.direction?.rationale ? `\nIntención del montaje: ${reel.direction.rationale}` : ''}

Escribí el texto de publicación para cada plataforma.${locale !== 'es' ? `\n\nIMPORTANTE: todo el contenido de los campos de texto va en el idioma con código "${locale}", no en español. Los identificadores (category, marketingGoal) siguen en español.` : ''}

Plataformas:
${platformSpecs}

Devolvé este JSON exacto, sin texto alrededor y sin bloques de código:
{
  "title": "título del Reel, máximo 70 caracteres",
  "subtitle": "subtítulo de una línea, máximo 120 caracteres",
  "hook": "la primera frase hablada o escrita que engancha, máximo 90 caracteres",
  "category": "una de: ${CAMPAIGN_CATEGORIES.join(', ')}",
  "marketingGoal": "uno de: ${MARKETING_GOALS.join(', ')}",
  "audience": "a quién le habla esta pieza, una frase corta",
  "keywords": ["5-8 palabras clave para búsqueda, sin almohadilla"],
  "platforms": {
    "tiktok":          { "description": "...", "cta": "...", "hashtags": ["#..."] },
    "instagram_reels": { "description": "...", "cta": "...", "hashtags": ["#..."] },
    "youtube_shorts":  { "description": "...", "cta": "...", "hashtags": ["#..."] }
  }
}

Reglas:
- "description" NO incluye los hashtags: van aparte, en su array.
- "cta" es una sola frase concreta y accionable, distinta en cada plataforma.
- Los tres "description" tienen que ser TEXTOS DISTINTOS, no el mismo con cambios cosméticos. Si los tres se parecen, está mal.
- Hashtags con almohadilla, específicos y relevantes. Nada de #viral, #fyp ni #parati.
- No describas la imagen literalmente; conectá con el propósito y la comunidad.`;
};

// ─── Normalización ─────────────────────────────────────────────────────────

const parseJsonObject = (result) => {
    const text = result == null ? '' : (typeof result === 'string' ? result : (result.content || ''));
    if (!text) return null;
    const cleaned = text.replace(/```json\s*|```/g, '').trim();
    try { return JSON.parse(cleaned); } catch { /* sigue */ }
    const s = cleaned.indexOf('{');
    const e = cleaned.lastIndexOf('}');
    if (s === -1 || e <= s) return null;
    try { return JSON.parse(cleaned.slice(s, e + 1)); } catch { return null; }
};

const clean = (v, max) => String(v ?? '').trim().slice(0, max);

// Los hashtags llegan de formas variadas: array, cadena separada por espacios,
// con o sin almohadilla. Se normalizan a un array de `#algo` sin repetidos.
const normaliseHashtags = (raw, max) => {
    let list = [];
    if (Array.isArray(raw)) list = raw;
    else if (typeof raw === 'string') list = raw.split(/[\s,]+/);
    return list
        .map(h => String(h).trim())
        .filter(Boolean)
        .map(h => (h.startsWith('#') ? h : `#${h}`))
        .map(h => h.replace(/[^#\p{L}\p{N}_]/gu, ''))
        .filter(h => h.length > 1)
        .filter((h, i, a) => a.findIndex(x => x.toLowerCase() === h.toLowerCase()) === i)
        .slice(0, max);
};

// Recorta la descripción al límite de la plataforma SIN cortar una palabra por
// la mitad. Un copy truncado a mitad de palabra se ve como un error del
// sistema, no como una decisión.
const trimToLimit = (text, limit) => {
    const t = String(text || '').trim();
    if (t.length <= limit) return t;
    const cut = t.slice(0, limit);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + '…';
};

export const sanitizeCopy = (raw, { locale = 'es' } = {}) => {
    const platforms = {};
    for (const spec of Object.values(COPY_PLATFORMS)) {
        const p = raw?.platforms?.[spec.id] || {};
        const hashtags = normaliseHashtags(p.hashtags, spec.maxHashtags);
        const cta = clean(p.cta, 200);
        // El límite se aplica sobre el texto COMPLETO que se va a publicar
        // —descripción + CTA + hashtags—, que es lo que la plataforma cuenta.
        const tail = (cta ? cta.length + 2 : 0) + hashtags.join(' ').length + 2;
        platforms[spec.id] = {
            platform: spec.id,
            label: spec.label,
            description: trimToLimit(p.description, Math.max(80, spec.maxChars - tail)),
            cta,
            hashtags,
            maxChars: spec.maxChars
        };
        platforms[spec.id].fullText = [
            platforms[spec.id].description,
            cta,
            hashtags.join(' ')
        ].filter(Boolean).join('\n\n');
        platforms[spec.id].charCount = platforms[spec.id].fullText.length;
    }

    return {
        locale,
        title: clean(raw?.title, 70),
        subtitle: clean(raw?.subtitle, 120),
        hook: clean(raw?.hook, 90),
        category: CAMPAIGN_CATEGORIES.includes(raw?.category) ? raw.category : 'institucional',
        marketingGoal: MARKETING_GOALS.includes(raw?.marketingGoal) ? raw.marketingGoal : 'notoriedad',
        audience: clean(raw?.audience, 160),
        keywords: Array.isArray(raw?.keywords)
            ? raw.keywords.map(k => clean(k, 40)).filter(Boolean).slice(0, 8)
            : [],
        platforms
    };
};

// ─── Generación ────────────────────────────────────────────────────────────

export const generateReelCopy = async ({
    reel, scenes, clubName, clubCategory, clubCity, eventDateHuman = null,
    locale = 'es', provider = null
}) => {
    const system = buildSystemPrompt();
    const userText = buildCopyPrompt({ reel, scenes, clubName, clubCategory, clubCity, eventDateHuman, locale });

    const result = await generateCopy({
        ...(provider ? { provider } : {}),
        system,
        userText,
        temperature: 0.7,
        // Tres textos completos más metadatos: con menos, el JSON llega
        // truncado y el parser lo descarta entero.
        maxTokens: 2600,
        jsonMode: true
    });

    const raw = parseJsonObject(result);
    if (!raw) throw new Error('El generador de copy no devolvió JSON válido.');

    return {
        copy: sanitizeCopy(raw, { locale }),
        provider: result?.provider || null,
        model: result?.model || null,
        prompt: userText
    };
};

// Regenera el copy de UNA plataforma sin tocar las otras dos. Es lo que permite
// insistir sobre el texto de TikTok sin perder el de Instagram que ya gustaba.
export const regeneratePlatformCopy = async ({
    reel, scenes, platform, clubName, clubCategory, clubCity,
    eventDateHuman = null, locale = 'es', instruction = null, provider = null
}) => {
    const spec = COPY_PLATFORMS[platform];
    if (!spec) throw new Error(`Plataforma desconocida: ${platform}`);

    const base = buildCopyPrompt({ reel, scenes, clubName, clubCategory, clubCity, eventDateHuman, locale });
    const userText = `${base}

DEVOLVÉ SÓLO la plataforma "${platform}". El resto del JSON puede ir vacío.${instruction ? `\n\nIndicación adicional de quien pide el texto: ${instruction}` : ''}`;

    const result = await generateCopy({
        ...(provider ? { provider } : {}),
        system: buildSystemPrompt(),
        userText,
        temperature: 0.85,
        maxTokens: 1200,
        jsonMode: true
    });

    const raw = parseJsonObject(result);
    if (!raw) throw new Error('El generador de copy no devolvió JSON válido.');

    const sanitized = sanitizeCopy(raw, { locale });
    return {
        platform: sanitized.platforms[platform],
        provider: result?.provider || null,
        model: result?.model || null,
        prompt: userText
    };
};

// ─── Exportación ───────────────────────────────────────────────────────────
//
// Cuatro formatos de texto plano y un paquete. El PDF no se arma acá: `jspdf`
// es una librería de navegador y ya se usa así en el resto del panel, así que
// el PDF lo genera la pantalla con estos mismos datos.

export const copyToText = (copy, reel) => {
    const lines = [
        `${copy.title || reel.title}`,
        copy.subtitle ? copy.subtitle : null,
        '',
        `Reel · ${reel.durationSec ?? '—'} s · ${reel.width}×${reel.height} · ${reel.format}`,
        `Categoría: ${copy.category} · Objetivo: ${copy.marketingGoal}`,
        copy.audience ? `Público: ${copy.audience}` : null,
        copy.hook ? `Hook: ${copy.hook}` : null,
        copy.keywords?.length ? `Palabras clave: ${copy.keywords.join(', ')}` : null,
        ''
    ].filter(l => l !== null);

    for (const p of Object.values(copy.platforms)) {
        lines.push(
            '─'.repeat(60),
            p.label.toUpperCase(),
            '─'.repeat(60),
            p.description,
            '',
            p.cta,
            '',
            p.hashtags.join(' '),
            `(${p.charCount} caracteres de ${p.maxChars})`,
            ''
        );
    }
    return lines.join('\n');
};

// CSV con una fila por plataforma. Las comillas se escapan doblándolas, que es
// lo que entiende Excel; sin eso, un copy con comillas rompe la tabla entera.
export const copyToCsv = (copy, reel) => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['plataforma', 'titulo', 'descripcion', 'cta', 'hashtags', 'caracteres', 'categoria', 'objetivo', 'reel', 'duracion', 'resolucion'];
    const rows = Object.values(copy.platforms).map(p => [
        p.label, copy.title, p.description, p.cta, p.hashtags.join(' '),
        p.charCount, copy.category, copy.marketingGoal,
        reel.title, reel.durationSec ?? '', `${reel.width}x${reel.height}`
    ].map(esc).join(','));
    // BOM para que Excel abra los acentos bien. Sin él, "Rotario" sale "RotarÃ­o".
    return '﻿' + [header.map(esc).join(','), ...rows].join('\n');
};

export const copyToJson = (copy, reel, extra = {}) => JSON.stringify({
    reel: {
        id: reel.id, title: reel.title, videoUrl: reel.videoUrl, posterUrl: reel.posterUrl,
        durationSec: reel.durationSec, width: reel.width, height: reel.height,
        format: reel.format, qualityTier: reel.qualityTier,
        engine: reel.engine, engineModel: reel.engineModel,
        musicStyle: reel.direction?.musicStyle || reel.musicStyle,
        musicUrl: reel.musicUrl, renderProvider: reel.renderProvider,
        createdAt: reel.createdAt, processingMs: reel.processingMs
    },
    copy,
    ...extra
}, null, 2);
