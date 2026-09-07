/**
 * articleSpec.js — El CRITERIO del Asistente de Redacción de Noticias.
 *
 * **Puro**: sin base, sin red, sin IA, sin DOM. Aquí vive QUÉ es un artículo
 * publicable y cómo se le pide al modelo; la orquestación (llamar al proveedor,
 * reintentar) vive en la ruta. Es la misma separación que `seoRules.js` frente a
 * `seoAudit.js`: un criterio que sólo se ejercita contra un proveedor real
 * termina sin pruebas, y entonces nadie se entera de que una regla cambió.
 *
 * Regla de fondo del sitio: **el modelo ESCRIBE y el código DECIDE**. Un modelo
 * de lenguaje incumple con naturalidad una longitud aunque se le pida, así que
 * `validateArticle` comprueba y la ruta reintenta devolviéndole la REGLA
 * CONCRETA que rompió. Pedirle «revisá el formato» no corrige nada.
 */

import { LIMITS, stripHtml, truncateAtWord, slugify } from './seoSpec.js';

// ── Qué es un artículo que puede posicionar ──────────────────────────────────
//
// El piso NO se inventa: `seoRules.js` ya marca `content_thin` por debajo de
// 150 palabras y recomienda 300. Pero ése es el umbral con el que la auditoría
// DENUNCIA un artículo pobre, no la meta de un artículo que compita: por eso el
// objetivo de redacción apunta más alto y el mínimo duro se queda en el
// recomendado de la auditoría. Un artículo generado no puede nacer ya señalado
// por nuestro propio informe de SEO.
//
// El techo existe por el presupuesto de salida del modelo, no por gusto: pasado
// ese punto la respuesta se trunca a mitad del JSON y no queda nada aprovechable.
//
// ⚠️ EL TOTAL DE PALABRAS NO MIDE SI UN ARTÍCULO ESTÁ DESARROLLADO, y ése era el
// defecto: cinco secciones de un párrafo corto suman 320 palabras y pasaban el
// piso. Lo que separa un artículo de una lista de subtítulos es que CADA sección
// se sostenga, así que la regla dura es POR SECCIÓN (`minSectionBlocks` y
// `minSectionWords`) y el total pasa a ser un objetivo. Un mínimo total alto no
// serviría: obligaría a rellenar, y rellenar sobre un contexto pobre es inventar
// —lo único que este flujo no puede hacer—.
//
// La PROFUNDIDAD es un parámetro y no una constante porque los dos consumidores
// del generador reciben material distinto: el Asistente de Redacción escribe
// desde lo que teclee un editor —que pueden ser dos líneas— y el workflow de
// Solicitudes desde un brief estructurado. Exigirle a los dos la misma extensión
// dejaría a uno cortándose y al otro rellenando.
export const DEPTH_PROFILES = {
    estandar: {
        id: 'estandar',
        label: 'estándar',
        minWords: 300,      // el "recomendado" de content_thin — por debajo, la auditoría lo señala
        targetWords: 900,   // la meta de redacción
        maxWords: 1400,     // techo práctico: más no cabe en una sola respuesta con el resto del JSON
        minSections: 3,     // secciones con su H2
        maxSections: 6,
        minSectionBlocks: 2,   // párrafos (o párrafo + lista) por sección
        minSectionWords: 90,
        maxParagraphWords: 90, // un párrafo más largo no se lee en un teléfono
    },
    reportaje: {
        id: 'reportaje',
        label: 'reportaje',
        minWords: 300,
        targetWords: 1100,
        maxWords: 1600,
        minSections: 4,
        maxSections: 7,
        minSectionBlocks: 2,
        minSectionWords: 130,
        maxParagraphWords: 90,
    },
};

export const DEFAULT_DEPTH = 'estandar';

/** El perfil, venga por nombre o ya resuelto. Ante un nombre desconocido, el
 *  estándar: equivocarse hacia el perfil exigente haría fallar artículos que
 *  hoy se entregan bien. */
export const depthOf = (d) => (d && typeof d === 'object' && d.minSectionWords ? d : DEPTH_PROFILES[d] || DEPTH_PROFILES[DEFAULT_DEPTH]);

/** El perfil de siempre. Se conserva con este nombre porque lo consume el
 *  Asistente de Redacción y sus pruebas desde v4.891. */
export const BODY = DEPTH_PROFILES.estandar;

// El cuerpo NO lleva <h1>. La página pública ya pinta el título del artículo
// como <h1> (`BlogPost.tsx`), así que un H1 dentro del cuerpo produce DOS en la
// misma página — que es justo lo que Google señala. Las secciones empiezan en H2.
export const FORBIDDEN_BODY_TAGS = ['h1', 'script', 'style', 'iframe', 'form'];

// Etiquetas que el editor visual (Quill) sabe pintar y guardar. Pedirle al
// modelo algo que el editor va a descartar al primer guardado es prometer un
// formato que no sobrevive.
export const ALLOWED_BODY_TAGS = ['p', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'blockquote', 'a', 'br'];

export const MAX_KEYWORDS = 8;
export const MAX_CATEGORIES = 3;

// ── El prompt ────────────────────────────────────────────────────────────────

/**
 * Las instrucciones del sistema. Se construyen DESDE `seoSpec.LIMITS`, no desde
 * números escritos a mano: con dos catálogos, el prompt pediría un límite y la
 * auditoría aplicaría otro, y el artículo nacería con un hallazgo de SEO encima.
 * Era exactamente el caso hasta v4.890 — el prompt pedía un titular de «máx 70»
 * y `LIMITS.title.max` es 60.
 */
export function buildArticleSystemPrompt({ siteName = '', extra = '', depth = DEFAULT_DEPTH } = {}) {
    const marca = siteName ? `El sitio se llama "${siteName}".` : '';
    const d = depthOf(depth);
    return `Eres ArticulIA, redactor jefe de un club Rotary. Conviertes un contexto breve en un artículo de blog completo, veraz y optimizado para buscadores. ${marca}

VOZ
- Institucional, humana y concreta. Rotary es "Gente de Acción": se cuenta lo que se hizo y a quién sirvió.
- Español neutro. Sin exclamaciones de más, sin clichés de marketing, sin superlativos vacíos.
- NO INVENTAS DATOS. Cifras, nombres propios, fechas y lugares: sólo los que estén en el contexto. Si un dato no está, se escribe sin él en vez de completarlo.

ESTRUCTURA Y PROFUNDIDAD DEL CUERPO (es lo que separa un artículo de una lista de subtítulos)
- Extensión: entre ${d.minWords} y ${d.maxWords} palabras de texto visible. Apunta a ${d.targetWords}.
- Entrada: un primer párrafo de 45 a 70 palabras que responda qué pasó, quién lo hizo, dónde y para quién, con la palabra clave principal de forma natural.
- ${d.minSections} a ${d.maxSections} secciones, cada una abierta por un <h2> descriptivo que diga de qué trata ("Seis puntos de entrega en el coliseo", no "Desarrollo").
- CADA SECCIÓN SE DESARROLLA: al menos ${d.minSectionBlocks} bloques —dos párrafos, o un párrafo y una lista— y ${d.minSectionWords} palabras. Una sección de una sola frase no es una sección.
- Un párrafo sostiene UNA idea y la desarrolla: el hecho, cómo ocurrió, quién intervino y qué significó para quien lo recibió. De 45 a ${d.maxParagraphWords} palabras; ninguno más largo, no se lee en un teléfono.
- Cuando el contexto traiga una frase entre comillas, va en <blockquote> atribuida a quien la dijo. Es lo que le da voz humana al artículo.
- Al menos una lista <ul> o <ol> cuando haya pasos, componentes, aliados o cifras que enumerar.
- Cierra con una sección de proyección o llamado a la acción institucional.
- LA PROFUNDIDAD SALE DE DESARROLLAR LO QUE EL CONTEXTO SÍ DICE —el orden de los hechos, el proceso, quién hizo qué, el efecto en las personas, el propósito institucional de Rotary—, NUNCA de agregar hechos, cifras, nombres, fechas ni declaraciones que no estén ahí. Nada de frases de relleno ni de párrafos que repitan lo ya dicho con otras palabras.
- NO uses <h1>: el título del artículo ya se pinta como <h1> en la página.
- Etiquetas permitidas y ninguna otra: ${ALLOWED_BODY_TAGS.map(t => `<${t}>`).join(', ')}.

RESPONDE ÚNICAMENTE CON UN JSON VÁLIDO. Sin markdown, sin explicaciones, sin \`\`\`.

{
  "noticia_titulo": "Titular informativo, entre ${LIMITS.title.min} y ${LIMITS.title.max} caracteres. Sin el nombre del sitio.",
  "noticia_cuerpo": "HTML del artículo según la estructura de arriba.",
  "noticia_categorias": "Hasta ${MAX_CATEGORIES} categorías separadas por coma",
  "seo_titulo": "Título para Google, entre ${LIMITS.title.min} y ${LIMITS.title.max} caracteres. Puede diferir del titular.",
  "seo_descripcion": "Meta descripción entre ${LIMITS.description.min} y ${LIMITS.description.max} caracteres, con la palabra clave y un motivo para hacer clic.",
  "slug": "url-amigable-en-minusculas-con-guiones",
  "keywords": "hasta ${MAX_KEYWORDS} palabras clave separadas por coma",
  "copys_redes": "Texto para redes sociales, 2 o 3 frases, sin hashtags de relleno"
}

Cuenta los caracteres del titular, del seo_titulo y de la seo_descripcion ANTES de responder. Son límites duros: fuera de rango, Google recorta el resultado a mitad de frase.${extra ? `\n\n${extra}` : ''}`;
}

/** El mensaje del usuario. Corto a propósito: el proveedor trunca el prompt de
 *  usuario (no el del sistema), así que las reglas viven arriba y aquí sólo va
 *  el contexto real más, en un reintento, lo que hubo que corregir. */
export function buildArticleUserPrompt({ context, brokenRules = [] }) {
    const base = `Contexto real de lo ocurrido:\n${String(context || '').trim()}`;
    if (!brokenRules.length) return base;
    return `${base}\n\nTu respuesta anterior no cumplió estas reglas. Corrígelas manteniendo el resto:\n${brokenRules.map(r => `- ${r}`).join('\n')}`;
}

// ── Lectura de la respuesta ──────────────────────────────────────────────────

/**
 * Rescata el objeto JSON de una respuesta de modelo.
 *
 * Acepta el JSON limpio, el envuelto en ```json y —esto es lo que faltaba— el
 * TRUNCADO: cuando el modelo agota su presupuesto de salida, la respuesta llega
 * sin la llave de cierre y un `match(/\{[\s\S]*\}/)` no casa con NADA, así que
 * un artículo casi completo se tiraba entero. `closeTruncated` cierra las
 * comillas y llaves que falten para poder aprovechar los campos que sí llegaron.
 *
 * Devuelve `{ data, truncated }`; `data` es null cuando no hay nada que rescatar.
 */
export function parseArticle(raw) {
    const clean = String(raw || '')
        .replace(/^﻿/, '')
        .replace(/```(?:json)?/gi, '')
        .trim();
    if (!clean) return { data: null, truncated: false };

    const first = clean.indexOf('{');
    if (first < 0) return { data: null, truncated: false };

    const last = clean.lastIndexOf('}');
    if (last > first) {
        try { return { data: JSON.parse(clean.slice(first, last + 1)), truncated: false }; } catch { /* se intenta rescatar */ }
    }

    const rescued = closeTruncated(clean.slice(first));
    if (rescued) {
        try { return { data: JSON.parse(rescued), truncated: true }; } catch { /* no hay nada que rescatar */ }
    }
    return { data: null, truncated: false };
}

/** Cierra un JSON cortado a mitad: descarta la clave incompleta del final y
 *  añade las comillas y llaves que faltan. No adivina contenido; sólo permite
 *  leer lo que ya venía escrito. */
export function closeTruncated(text) {
    let inString = false, escaped = false;
    const stack = [];
    let lastSafe = -1; // último punto donde el objeto estaba "entre campos"

    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (escaped) { escaped = false; continue; }
        if (c === '\\') { escaped = true; continue; }
        if (c === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (c === '{' || c === '[') stack.push(c);
        else if (c === '}' || c === ']') stack.pop();
        else if (c === ',' && stack.length === 1) lastSafe = i;
    }
    if (!stack.length) return null;          // no estaba truncado
    if (lastSafe < 0) return null;           // ni un campo completo: nada que rescatar

    let out = text.slice(0, lastSafe);
    for (let i = stack.length - 1; i >= 0; i--) out += stack[i] === '{' ? '}' : ']';
    return out;
}

/** Toma el primer campo con contenido de una lista de nombres posibles. Los
 *  modelos alternan entre el nombre en español y su equivalente en inglés. */
export function pickField(data, names) {
    for (const n of names) {
        const v = data?.[n] ?? data?.article?.[n] ?? data?.data?.[n];
        if (typeof v === 'string' && v.trim()) return v.trim();
        if (typeof v === 'number') return String(v);
        if (Array.isArray(v) && v.length) return v.join(', ');
    }
    return '';
}

export const FIELD_ALIASES = {
    title: ['noticia_titulo', 'titulo', 'title', 'headline', 'titular'],
    body: ['noticia_cuerpo', 'cuerpo', 'content', 'html', 'body', 'text'],
    categories: ['noticia_categorias', 'categorias', 'categories', 'categoria', 'tags'],
    seoTitle: ['seo_titulo', 'seoTitle', 'tituloSeo'],
    seoDescription: ['seo_descripcion', 'seoDescription', 'descripcionSeo'],
    slug: ['slug', 'url', 'post_slug'],
    keywords: ['keywords', 'palabrasClave', 'palabras_clave'],
    socialCopy: ['copys_redes', 'socialCopy', 'postSocial', 'copy'],
};

/** Normaliza la respuesta cruda a la forma que consume la pantalla. */
export function normalizeArticle(data) {
    const list = (raw, max) => String(raw || '')
        .split(',').map(s => s.trim()).filter(Boolean)
        .filter((v, i, a) => a.findIndex(x => x.toLowerCase() === v.toLowerCase()) === i)
        .slice(0, max);

    return {
        title: pickField(data, FIELD_ALIASES.title),
        body: pickField(data, FIELD_ALIASES.body),
        categories: list(pickField(data, FIELD_ALIASES.categories), MAX_CATEGORIES),
        seoTitle: pickField(data, FIELD_ALIASES.seoTitle),
        seoDescription: pickField(data, FIELD_ALIASES.seoDescription),
        slug: pickField(data, FIELD_ALIASES.slug),
        keywords: list(pickField(data, FIELD_ALIASES.keywords), MAX_KEYWORDS).join(', '),
        socialCopy: pickField(data, FIELD_ALIASES.socialCopy),
    };
}

// ── Medición ─────────────────────────────────────────────────────────────────

/**
 * Mide el cuerpo con el MISMO criterio que la auditoría del sitio
 * (`seoRules.analyzeBody`): `stripHtml` y palabras separadas por espacios. Con
 * dos formas de contar, el generador diría 320 palabras y el informe de SEO
 * marcaría `content_thin` sobre el mismo texto.
 */
/**
 * Parte el cuerpo en secciones: cada <h2> con lo que va debajo hasta el
 * siguiente encabezado. Es lo único que contesta «¿esta sección está
 * desarrollada?», y el total de palabras no puede contestarlo.
 *
 * Un BLOQUE es un párrafo con texto, una lista o una cita suelta. Se cuentan
 * juntos a propósito: una sección resuelta con un párrafo y una lista de seis
 * aliados está desarrollada, y exigirle dos párrafos la marcaría en falso.
 */
export function sectionsOf(html) {
    const raw = String(html || '');
    const marcas = [];
    const hRe = /<h2\b[^>]*>([\s\S]*?)<\/h2>/gi;
    let m;
    while ((m = hRe.exec(raw))) marcas.push({ title: stripHtml(m[1]), start: m.index, end: hRe.lastIndex });

    return marcas.map((h, i) => {
        const cuerpo = raw.slice(h.end, i + 1 < marcas.length ? marcas[i + 1].start : raw.length);
        let p, parrafos = 0;
        const pRe = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
        while ((p = pRe.exec(cuerpo))) if (stripHtml(p[1]).trim()) parrafos++;
        // Una cita con <p> adentro ya se contó como párrafo: sólo suma la suelta.
        let q, citas = 0;
        const bqRe = /<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi;
        while ((q = bqRe.exec(cuerpo))) if (!/<p\b/i.test(q[1]) && stripHtml(q[1]).trim()) citas++;
        const listas = (cuerpo.match(/<\s*(ul|ol)\b/gi) || []).length;
        const texto = stripHtml(cuerpo);
        return {
            title: h.title,
            blocks: parrafos + listas + citas,
            paragraphs: parrafos,
            words: texto ? texto.split(/\s+/).filter(Boolean).length : 0,
            hasList: listas > 0,
            hasQuote: /<\s*blockquote\b/i.test(cuerpo),
        };
    });
}

export function analyzeArticleBody(html) {
    const raw = String(html || '');
    const headings = [];
    const hRe = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
    let m;
    while ((m = hRe.exec(raw))) headings.push({ level: Number(m[1]), text: stripHtml(m[2]) });

    const paragraphs = [];
    const pRe = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
    while ((m = pRe.exec(raw))) {
        const t = stripHtml(m[1]);
        if (t) paragraphs.push({ text: t, words: t.split(/\s+/).filter(Boolean).length });
    }

    const text = stripHtml(raw);
    const words = text ? text.split(/\s+/).filter(Boolean) : [];
    const tags = new Set();
    const tagRe = /<\s*\/?\s*([a-z][a-z0-9]*)\b/gi;
    while ((m = tagRe.exec(raw))) tags.add(m[1].toLowerCase());

    return {
        wordCount: words.length,
        headings,
        h1Count: headings.filter(h => h.level === 1).length,
        h2Count: headings.filter(h => h.level === 2).length,
        paragraphs,
        longestParagraph: paragraphs.reduce((a, p) => Math.max(a, p.words), 0),
        hasList: /<\s*(ul|ol)\b/i.test(raw),
        hasQuote: /<\s*blockquote\b/i.test(raw),
        sections: sectionsOf(raw),
        tags: [...tags],
        forbidden: [...tags].filter(t => FORBIDDEN_BODY_TAGS.includes(t)),
        readingMinutes: Math.max(1, Math.round(words.length / 200)),
    };
}

// ── Validación ───────────────────────────────────────────────────────────────

/**
 * Las reglas que el artículo rompió, redactadas para devolvérselas al modelo.
 *
 * Se separan en `errors` —no se puede entregar así— y `warnings` —se puede, y
 * hay que decirlo—. Tratarlos igual convierte cualquier observación en un
 * bloqueo y se dejan de leer. Sólo los `errors` disparan un reintento.
 */
export function validateArticle(article, { siteName = '', depth = DEFAULT_DEPTH } = {}) {
    const errors = [];
    const warnings = [];
    const a = article || {};
    const d = depthOf(depth);

    const t = String(a.title || '').trim();
    if (!t) errors.push('Falta "noticia_titulo".');
    else {
        if (t.length < LIMITS.title.min) errors.push(`El titular tiene ${t.length} caracteres y necesita al menos ${LIMITS.title.min}.`);
        if (t.length > LIMITS.title.max) errors.push(`El titular tiene ${t.length} caracteres y el máximo es ${LIMITS.title.max}.`);
        if (t === t.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(t)) errors.push('El titular está en mayúsculas sostenidas: escríbelo en mayúscula y minúscula.');
    }

    const st = String(a.seoTitle || '').trim();
    if (!st) errors.push('Falta "seo_titulo".');
    else {
        if (st.length < LIMITS.title.min) errors.push(`El "seo_titulo" tiene ${st.length} caracteres y necesita al menos ${LIMITS.title.min}.`);
        if (st.length > LIMITS.title.max) errors.push(`El "seo_titulo" tiene ${st.length} caracteres y el máximo es ${LIMITS.title.max}.`);
        // El nombre del sitio lo añade el compositor del <head>; si el modelo lo
        // mete, sale repetido dos veces en el resultado de Google.
        if (siteName && st.toLowerCase().includes(siteName.toLowerCase())) {
            warnings.push(`El "seo_titulo" incluye el nombre del sitio ("${siteName}"), que se añade después automáticamente.`);
        }
    }

    const sd = String(a.seoDescription || '').trim();
    if (!sd) errors.push('Falta "seo_descripcion".');
    else {
        if (sd.length < LIMITS.description.min) errors.push(`La "seo_descripcion" tiene ${sd.length} caracteres y necesita al menos ${LIMITS.description.min}.`);
        if (sd.length > LIMITS.description.max) errors.push(`La "seo_descripcion" tiene ${sd.length} caracteres y el máximo es ${LIMITS.description.max}.`);
    }

    const body = analyzeArticleBody(a.body);
    if (!String(a.body || '').trim()) {
        errors.push('Falta "noticia_cuerpo".');
    } else {
        if (body.wordCount < d.minWords) {
            errors.push(`El cuerpo tiene ${body.wordCount} palabras y necesita al menos ${d.minWords}. Desarrolla cada sección con detalle concreto del contexto.`);
        } else if (body.wordCount < d.targetWords * 0.7) {
            warnings.push(`El cuerpo tiene ${body.wordCount} palabras; el objetivo son ${d.targetWords}.`);
        }
        if (body.wordCount > d.maxWords) warnings.push(`El cuerpo tiene ${body.wordCount} palabras y el máximo recomendado es ${d.maxWords}.`);

        if (body.h1Count > 0) errors.push('El cuerpo contiene <h1>. El título ya se pinta como <h1> en la página: usa <h2> para las secciones.');
        if (body.h2Count < d.minSections) errors.push(`El cuerpo tiene ${body.h2Count} secciones con <h2> y necesita al menos ${d.minSections}.`);
        if (body.h2Count > d.maxSections) warnings.push(`El cuerpo tiene ${body.h2Count} secciones con <h2>; el máximo recomendado es ${d.maxSections}.`);

        // ⚠️ La regla que de verdad decide si es un artículo. Se nombra la
        // sección concreta y sus dos números: «desarrollá más» no corrige nada,
        // y el modelo tiene que saber CUÁL sección y CUÁNTO le falta.
        for (const sec of body.sections) {
            const flojaEnBloques = sec.blocks < d.minSectionBlocks;
            const flojaEnPalabras = sec.words < d.minSectionWords;
            if (!flojaEnBloques && !flojaEnPalabras) continue;
            errors.push(`La sección «${sec.title || 'sin título'}» tiene ${sec.blocks} bloque(s) de contenido y ${sec.words} palabras: necesita al menos ${d.minSectionBlocks} (dos párrafos, o un párrafo y una lista) y ${d.minSectionWords} palabras. Desarrollala con el detalle que ya está en el contexto —el proceso, quién hizo qué, el efecto— sin agregar datos nuevos.`);
        }

        if (body.longestParagraph > d.maxParagraphWords) {
            errors.push(`Hay un párrafo de ${body.longestParagraph} palabras y el máximo es ${d.maxParagraphWords}. Pártelo en dos.`);
        }
        if (!body.hasList) warnings.push('El cuerpo no tiene ninguna lista. Una lista de pasos, componentes o beneficios mejora la lectura.');

        const forbidden = body.forbidden.filter(t2 => t2 !== 'h1');
        if (forbidden.length) errors.push(`El cuerpo usa etiquetas no permitidas: ${forbidden.join(', ')}.`);
    }

    return { errors, warnings, body };
}

// ── Reparación ───────────────────────────────────────────────────────────────

/**
 * Ajusta por código lo que se puede ajustar sin reescribir: recortar sin partir
 * palabras y derivar lo que falte. **No inventa contenido**: si el cuerpo es
 * corto, sigue siendo corto y la validación lo sigue diciendo.
 *
 * Se aplica tras agotar los reintentos, con el mismo criterio que `composeMeta`:
 * un artículo con el título dos caracteres largo es mejor que ningún artículo.
 */
export function repairArticle(article) {
    const a = { ...(article || {}) };
    const repaired = [];

    if (a.title && a.title.length > LIMITS.title.max) {
        a.title = truncateAtWord(a.title, LIMITS.title.max);
        repaired.push('titular recortado');
    }
    if (!a.seoTitle && a.title) { a.seoTitle = truncateAtWord(a.title, LIMITS.title.max); repaired.push('seo_titulo derivado del titular'); }
    if (a.seoTitle && a.seoTitle.length > LIMITS.title.max) {
        a.seoTitle = truncateAtWord(a.seoTitle, LIMITS.title.max);
        repaired.push('seo_titulo recortado');
    }
    if (a.seoDescription && a.seoDescription.length > LIMITS.description.max) {
        a.seoDescription = truncateAtWord(a.seoDescription, LIMITS.description.max);
        repaired.push('seo_descripcion recortada');
    }
    if (!a.seoDescription && a.body) {
        const text = stripHtml(a.body);
        if (text) { a.seoDescription = truncateAtWord(text, LIMITS.description.max); repaired.push('seo_descripcion derivada del cuerpo'); }
    }
    // El slug definitivo lo resuelve `resolvePostSlug` al guardar (libera el
    // choque de unicidad y aplica las palabras reservadas). Aquí sólo se le da
    // forma para que la pantalla muestre algo coherente.
    if (a.slug) a.slug = slugify(a.slug);
    else if (a.title) { a.slug = slugify(a.title); repaired.push('slug derivado del titular'); }

    if (!a.title && a.body) {
        const text = stripHtml(a.body);
        if (text) { a.title = truncateAtWord(text.split(/\s+/).slice(0, 12).join(' '), LIMITS.title.max); repaired.push('titular derivado del cuerpo'); }
    }

    return { article: a, repaired };
}

export default {
    BODY, DEPTH_PROFILES, DEFAULT_DEPTH, depthOf,
    ALLOWED_BODY_TAGS, FORBIDDEN_BODY_TAGS, MAX_KEYWORDS, MAX_CATEGORIES,
    buildArticleSystemPrompt, buildArticleUserPrompt,
    parseArticle, closeTruncated, pickField, normalizeArticle,
    sectionsOf, analyzeArticleBody, validateArticle, repairArticle,
};
