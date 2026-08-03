// ════════════════════════════════════════════════════════════════════════════
// SEO Inteligente — REGLAS DE AUDITORÍA (puras)
//
// Todo lo que decide si algo está bien o mal vive acá, y **este archivo no toca
// la base de datos ni la red**. Recibe páginas ya resueltas y devuelve
// hallazgos.
//
// Está separado de `seoAudit.js` a propósito, y no por estética: es lo que
// permite probar el criterio del módulo sin una base, sin Prisma y sin
// credenciales (`npm run test:seo`). Un motor de auditoría que sólo se puede
// ejercitar contra una base real termina sin pruebas, y entonces nadie se
// entera de que una regla cambió de signo.
//
// REGLA DURABLE — **acá no entra ninguna llamada a un modelo.** Todo es
// aritmética y comparación de cadenas: contar caracteres, buscar un `alt`,
// comparar dos textos. La IA entra después, en `seoAI.js`, a REDACTAR la
// recomendación de un hallazgo que este archivo ya encontró. Es el mismo
// criterio que `crmRecommendations.js`: darle la base a un modelo y pedirle
// «decime qué mejorar» produce cifras plausibles y no auditables.
//
// Corolario práctico: **sin credencial de modelo la auditoría funciona igual.**
// Pierde la redacción, no los hallazgos.
// ════════════════════════════════════════════════════════════════════════════

import {
    LIMITS, ISSUES, SCORE_WEIGHTS, PAGE_KINDS, stripHtml, normalizePath, slugify,
} from './seoSpec.js';
import { expectedSchemaTypes } from './seoSchema.js';

// ── Lectura del cuerpo de la página ──────────────────────────────────────────
// Analiza el HTML que el administrador escribió en el editor. No es un
// rastreador: no pide la página por red ni ejecuta React. Mira el contenido
// guardado, que es lo que acabará dentro del <main>.
//
// Lo que NO puede ver, y por eso no lo reporta: lo que pintan los componentes de
// la plantilla (cabecera, pie, secciones de la portada). Afirmar «esta página no
// tiene H1» cuando el H1 lo pone la plantilla sería un falso positivo, así que
// las comprobaciones de encabezados sólo corren sobre contenido que sí tiene
// cuerpo propio.
export function analyzeBody(html) {
    const raw = String(html || '');
    const headings = [];
    const headingRe = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
    let m;
    while ((m = headingRe.exec(raw))) {
        headings.push({ level: Number(m[1]), text: stripHtml(m[2]).slice(0, 200) });
    }

    const images = [];
    const imgRe = /<img\b([^>]*)>/gi;
    while ((m = imgRe.exec(raw))) {
        const attrs = m[1];
        const src = /\bsrc\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] || '';
        const altMatch = /\balt\s*=\s*["']([^"']*)["']/i.exec(attrs);
        images.push({
            src,
            alt: altMatch ? altMatch[1] : null,
            // `alt=""` es VÁLIDO y significa "imagen decorativa". No es lo mismo
            // que no tener el atributo, y confundirlos llenaría el informe de
            // falsos positivos sobre separadores y adornos.
            hasAttr: Boolean(altMatch),
            decorative: Boolean(altMatch) && altMatch[1].trim() === '',
        });
    }

    const links = { internal: [], external: [] };
    const linkRe = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
    while ((m = linkRe.exec(raw))) {
        const href = m[1].trim();
        if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
        (/^https?:\/\//i.test(href) ? links.external : links.internal).push(href);
    }

    const text = stripHtml(raw);
    const words = text ? text.split(/\s+/).filter(Boolean) : [];
    return {
        headings, images, links,
        text,
        wordCount: words.length,
        h1Count: headings.filter(h => h.level === 1).length,
        hasBody: raw.trim().length > 0,
        readingMinutes: Math.max(1, Math.round(words.length / 200)),
    };
}

// El cuerpo de cada tipo vive en una columna distinta. Un solo sitio donde se
// decide cuál, para que no se disperse el criterio.
export function bodyHtmlOf(page) {
    const e = page.entity;
    if (!e) return '';
    if (page.kind === 'post') return e.content || '';
    if (page.kind === 'project') return e.description || '';
    if (page.kind === 'event') return e.htmlContent || e.description || '';
    if (page.kind === 'product') return e.description || '';
    return '';
}

// ── Comprobaciones de UNA página ─────────────────────────────────────────────
export function auditPage({ page, meta, override, config }) {
    const found = [];
    const add = (code, evidence = {}, proposedValue = null) => {
        const spec = ISSUES[code];
        if (!spec) return;
        found.push({
            path: page.path, code,
            axis: spec.axis, severity: spec.severity, impact: spec.impact,
            effort: spec.effort, autoFixable: spec.autoFixable,
            evidence, proposedValue,
        });
    };

    // ── Indexabilidad ────────────────────────────────────────────────────────
    if (override?.canonical && override.canonical.includes('#')) {
        add('canonical_fragment', { canonical: override.canonical });
    }
    if (!meta.indexable && !PAGE_KINDS[page.kind]?.noindex) {
        add('noindex_unexpected', { reason: override?.indexable === false ? 'ajuste del panel' : 'regla del módulo' });
    }

    // ── Metadatos ────────────────────────────────────────────────────────────
    const titleLen = (meta.title || '').length;
    if (!titleLen) add('title_missing');
    else if (titleLen < LIMITS.title.min) add('title_too_short', { length: titleLen, min: LIMITS.title.min, current: meta.title });
    else if (titleLen > LIMITS.title.max) add('title_too_long', { length: titleLen, max: LIMITS.title.max, current: meta.title });

    const descLen = (meta.description || '').length;
    if (!descLen) add('description_missing');
    else if (descLen < LIMITS.description.min) add('description_too_short', { length: descLen, min: LIMITS.description.min, current: meta.description });
    else if (descLen > LIMITS.description.max) add('description_too_long', { length: descLen, max: LIMITS.description.max, current: meta.description });

    if (!meta.image) add('og_image_missing', { fallbackTried: ['imagen de la entidad', 'imagen por defecto del sitio', 'logo'] });

    // ── Contenido ────────────────────────────────────────────────────────────
    // Sólo para páginas con cuerpo propio guardado. Una página de plantilla no
    // se juzga por lo que el módulo no puede ver.
    const body = analyzeBody(bodyHtmlOf(page));
    if (body.hasBody) {
        if (body.h1Count === 0 && body.headings.length > 0) add('h1_missing', { headings: body.headings.slice(0, 5) });
        if (body.h1Count > 1) add('h1_multiple', { count: body.h1Count });

        let prev = 0;
        for (const h of body.headings) {
            if (prev && h.level > prev + 1) { add('heading_gap', { from: `H${prev}`, to: `H${h.level}`, text: h.text }); break; }
            prev = h.level;
        }

        const missingAlt = body.images.filter(i => !i.hasAttr);
        if (missingAlt.length) {
            add('alt_missing', { count: missingAlt.length, samples: missingAlt.slice(0, 5).map(i => i.src) });
        }

        if (body.wordCount > 0 && body.wordCount < 150) {
            add('content_thin', { wordCount: body.wordCount, recommended: 300 });
        }
        if (body.links.internal.length === 0 && body.wordCount > 150) {
            add('no_internal_links', { wordCount: body.wordCount });
        }
    }

    // ── Datos estructurados ──────────────────────────────────────────────────
    // El módulo emite JSON-LD para todas las páginas indexables, así que este
    // hallazgo aparece cuando NO se pudo emitir: casi siempre un evento sin
    // fecha, que Schema.org exige.
    const expected = expectedSchemaTypes(page.kind);
    if (page.kind === 'event' && !page.entity?.startDate) {
        add('schema_missing', { expected, reason: 'El evento no tiene fecha de inicio y Schema.org la exige.' });
    }

    return { issues: found, body };
}

// ── Duplicados en todo el sitio ──────────────────────────────────────────────
// Se comprueba entre páginas, no dentro de una. Por eso vive fuera de
// `auditPage`: hace falta el conjunto completo.
export function auditDuplicates(entries) {
    const issues = [];
    const group = (key) => {
        const map = new Map();
        for (const e of entries) {
            const v = String(e.meta[key] || '').trim().toLowerCase();
            if (!v) continue;
            if (!map.has(v)) map.set(v, []);
            map.get(v).push(e.page.path);
        }
        return map;
    };

    for (const [value, paths] of group('title')) {
        if (paths.length > 1) {
            for (const p of paths) {
                const spec = ISSUES.title_duplicated;
                issues.push({
                    path: p, code: 'title_duplicated', axis: spec.axis, severity: spec.severity,
                    impact: spec.impact, effort: spec.effort, autoFixable: spec.autoFixable,
                    evidence: { value, sharedWith: paths.filter(x => x !== p).slice(0, 5), count: paths.length },
                });
            }
        }
    }
    for (const [value, paths] of group('description')) {
        if (paths.length > 1) {
            for (const p of paths) {
                const spec = ISSUES.description_duplicated;
                issues.push({
                    path: p, code: 'description_duplicated', axis: spec.axis, severity: spec.severity,
                    impact: spec.impact, effort: spec.effort, autoFixable: spec.autoFixable,
                    evidence: { value: value.slice(0, 120), sharedWith: paths.filter(x => x !== p).slice(0, 5), count: paths.length },
                });
            }
        }
    }

    // Canibalización: dos páginas cuyo TEXTO se parece demasiado. Se compara con
    // una huella de palabras (Jaccard sobre el conjunto de términos), no con una
    // distancia carácter a carácter: dos noticias sobre lo mismo con distinto
    // orden de párrafos son duplicados y una comparación literal no las vería.
    const withText = entries.filter(e => e.body?.wordCount >= 120);
    for (let i = 0; i < withText.length; i++) {
        for (let j = i + 1; j < withText.length; j++) {
            const sim = jaccard(withText[i].body.text, withText[j].body.text);
            if (sim >= 0.8) {
                const spec = ISSUES.duplicate_content;
                for (const [a, b] of [[withText[i], withText[j]], [withText[j], withText[i]]]) {
                    issues.push({
                        path: a.page.path, code: 'duplicate_content', axis: spec.axis,
                        severity: spec.severity, impact: spec.impact, effort: spec.effort,
                        autoFixable: spec.autoFixable,
                        evidence: { similarTo: b.page.path, similarity: Math.round(sim * 100) },
                    });
                }
            }
        }
    }

    // Huérfanas: ninguna otra página del sitio las enlaza. Sólo se mira entre el
    // contenido que TIENE cuerpo propio; los enlaces del menú y del pie los pone
    // la plantilla y el módulo no los ve, así que las páginas fijas quedan fuera
    // de esta comprobación para no acusarlas en falso.
    const linked = new Set();
    for (const e of entries) {
        for (const href of e.body?.links?.internal || []) linked.add(normalizePath(href));
    }
    for (const e of entries) {
        const dynamic = PAGE_KINDS[e.page.kind]?.dynamic;
        if (!dynamic) continue;
        if (!linked.has(normalizePath(e.page.path))) {
            const spec = ISSUES.orphan_page;
            issues.push({
                path: e.page.path, code: 'orphan_page', axis: spec.axis, severity: spec.severity,
                impact: spec.impact, effort: spec.effort, autoFixable: spec.autoFixable,
                evidence: { note: 'No se encontró ningún enlace desde otro contenido del sitio. Los enlaces del menú y del pie no se cuentan porque los pinta la plantilla.' },
            });
        }
    }

    return issues;
}

function jaccard(a, b) {
    const setA = new Set(String(a).toLowerCase().split(/\W+/).filter(w => w.length > 3));
    const setB = new Set(String(b).toLowerCase().split(/\W+/).filter(w => w.length > 3));
    if (!setA.size || !setB.size) return 0;
    let inter = 0;
    for (const w of setA) if (setB.has(w)) inter++;
    return inter / (setA.size + setB.size - inter);
}

// ── Comprobaciones del sitio ─────────────────────────────────────────────────
export function auditSiteLevel({ club, config, pages }) {
    const issues = [];
    const push = (code, evidence) => {
        const spec = ISSUES[code];
        issues.push({
            path: '/', code, axis: spec.axis, severity: spec.severity, impact: spec.impact,
            effort: spec.effort, autoFixable: spec.autoFixable, evidence,
        });
    };

    const extra = String(config?.robotsExtra || '');
    if (/^\s*Disallow:\s*\/\s*$/im.test(extra)) {
        push('robots_blocks_all', { line: extra.match(/^\s*Disallow:\s*\/\s*$/im)?.[0] });
    }
    if (extra.includes('/#')) {
        push('robots_fragment_rule', { note: 'Las reglas con # no bloquean nada: el navegador nunca manda el fragmento al servidor.' });
    }

    // Contenido sin slug: se publica por identificador y pierde la palabra clave
    // en la dirección. No es un fallo, es una oportunidad concreta y automática.
    const noSlug = pages.filter(p => p.missingSlug);
    if (noSlug.length) {
        for (const p of noSlug.slice(0, 50)) {
            issues.push({
                path: p.path, code: 'not_in_sitemap', axis: 'indexability',
                severity: 'low', impact: 30, effort: 'auto', autoFixable: true,
                evidence: {
                    note: 'La dirección usa el identificador interno en vez de un texto legible.',
                    suggested: `${p.path.split('/').slice(0, -1).join('/')}/${slugify(p.label || '')}`,
                },
            });
        }
    }

    return issues;
}

// ── La nota, eje por eje ─────────────────────────────────────────────────────
// Se parte de 100 y se descuenta por hallazgo, con tope. El descuento es
// proporcional al número de páginas: diez títulos duplicados en un sitio de diez
// páginas es un desastre; en uno de quinientas, un detalle. Una nota que no
// mirara el tamaño castigaría igual a los dos.
export function scoreByAxis(issues, pageCount) {
    const scores = {};
    const denom = Math.max(1, pageCount);
    for (const axis of Object.keys(SCORE_WEIGHTS)) {
        const mine = issues.filter(i => i.axis === axis);
        let penalty = 0;
        for (const i of mine) {
            const weight = { critical: 30, high: 12, medium: 5, low: 2 }[i.severity] || 2;
            penalty += weight / denom;
        }
        // Un solo hallazgo crítico no puede dejar el eje por encima de 50, por
        // grande que sea el sitio: «crítico» significa que algo no funciona, y
        // promediarlo hasta hacerlo desaparecer sería vaciar la palabra.
        const hasCritical = mine.some(i => i.severity === 'critical');
        const raw = Math.max(0, 100 - penalty * 100);
        scores[axis] = Math.round(hasCritical ? Math.min(raw, 50) : raw);
    }
    return scores;
}

export function countBy(rows, key) {
    const out = {};
    for (const r of rows) out[r[key]] = (out[r[key]] || 0) + 1;
    return out;
}

export default { analyzeBody, bodyHtmlOf, auditPage, auditDuplicates, auditSiteLevel, scoreByAxis, countBy };
