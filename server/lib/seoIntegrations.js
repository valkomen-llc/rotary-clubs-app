// ════════════════════════════════════════════════════════════════════════════
// SEO Inteligente — INTEGRACIONES
//
// REGLA DURABLE — **una integración sin credencial se declara NO CONECTADA, no
// se rellena con ceros.** Es la misma regla del panel de auditoría del Creador
// de Reels («sin tarifa configurada el panel dice "sin tarifa configurada", no
// $0») y del CRM. Un tablero que muestra «0 impresiones» y «0 clics» sobre un
// sitio que nunca conectó Search Console no está informando: está afirmando algo
// falso, y manda a buscar un problema de posicionamiento donde sólo hay una
// credencial sin poner.
//
// Por eso `integrationStatus` distingue cuatro estados y `unknown` NO es un tipo
// de «bien»:
//
//   connected     — hay credencial y respondió.
//   disconnected  — hay credencial pero falló o falta autorizar.
//   not_configured— falta la credencial. Es lo normal, no un error.
//   unavailable   — no se pudo comprobar ahora mismo.
//
// QUÉ SE PUEDE Y QUÉ NO, con honestidad:
//
//   • **Impresiones, clics, CTR y posición**: sólo Search Console. No hay forma
//     de estimarlos desde acá y no se intenta. Sin conectar, esos indicadores
//     del tablero salen vacíos con su motivo escrito.
//   • **Backlinks**: exigen un índice de enlaces propio (Ahrefs, Majestic,
//     Moz). No lo tenemos y no se inventa. El módulo NO reporta backlinks.
//   • **Posición real en el buscador**: exige consultar resultados, que ni
//     Google ni Bing permiten sin un proveedor de SERP de pago. La columna
//     «posición» de las palabras clave sólo se llena con datos de Search
//     Console.
//   • **Core Web Vitals**: sí se pueden medir, con PageSpeed Insights, que es
//     gratuito con clave de API. Es la única de este grupo implementada de
//     punta a punta acá.
// ════════════════════════════════════════════════════════════════════════════

import { INTEGRATIONS } from './seoSpec.js';

const env = (k) => (process.env[k] || '').trim();

/**
 * Estado de cada integración declarada. No hace peticiones de red salvo que se
 * le pida (`probe`): el tablero lo llama en cada carga y una comprobación
 * remota por integración lo volvería lento.
 */
export async function integrationStatus(config = {}, { probe = false } = {}) {
    const out = {};
    for (const [key, spec] of Object.entries(INTEGRATIONS)) {
        const missing = (spec.needs || []).filter(n => !env(n));
        const saved = config?.integrations?.[key] || {};

        let state;
        if (spec.auth === 'script') {
            state = saved.id ? 'connected' : 'not_configured';
        } else if (missing.length) {
            state = 'not_configured';
        } else if (spec.auth === 'oauth') {
            // Con credencial de aplicación pero sin autorización del sitio, la
            // integración NO está conectada: falta el paso que da acceso a los
            // datos de esa propiedad.
            state = saved.refreshToken ? 'connected' : 'disconnected';
        } else {
            state = 'connected';
        }

        out[key] = {
            key,
            label: spec.label,
            provides: spec.provides,
            note: spec.note || null,
            auth: spec.auth,
            state,
            missingEnv: missing,
            property: saved.property || saved.id || null,
            lastCheckedAt: saved.lastCheckedAt || null,
            // Lo que el tablero necesita para no pintar ceros: si no está
            // conectada, sus indicadores se muestran vacíos con este motivo.
            reason: state === 'not_configured'
                ? (spec.auth === 'script'
                    ? 'Falta el identificador en la configuración del módulo.'
                    : `Falta configurar en el entorno: ${missing.join(', ')}.`)
                : state === 'disconnected'
                    ? 'La credencial existe pero este sitio todavía no autorizó el acceso.'
                    : null,
        };
    }

    if (probe && out.pagespeed.state === 'connected') {
        out.pagespeed.lastProbe = await probePageSpeed('https://www.google.com').catch(e => ({ ok: false, error: e.message }));
    }
    return out;
}

// ── PageSpeed Insights ───────────────────────────────────────────────────────
/**
 * Mide Core Web Vitals de una dirección.
 *
 * Devuelve DOS bloques y los distingue, porque responden a preguntas distintas:
 *
 *   lab   — laboratorio (Lighthouse). Siempre viene. Es una simulación
 *           reproducible, útil para comparar antes y después de un cambio.
 *   field — campo (CrUX): usuarios reales de los últimos 28 días. Sólo existe
 *           si el sitio tiene tráfico suficiente. **Es el que usa Google para
 *           posicionar.**
 *
 * Presentar el de laboratorio como si fuera el de campo es el error clásico del
 * módulo de rendimiento: se optimiza para un número que no es el que cuenta.
 * Cuando no hay datos de campo se dice, no se sustituye por el otro.
 */
export async function probePageSpeed(url, { strategy = 'mobile' } = {}) {
    const key = env('PAGESPEED_API_KEY');
    if (!key) return { ok: false, state: 'not_configured', reason: 'Falta PAGESPEED_API_KEY.' };

    const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
    endpoint.searchParams.set('url', url);
    endpoint.searchParams.set('key', key);
    endpoint.searchParams.set('strategy', strategy);
    for (const c of ['performance', 'seo', 'accessibility', 'best-practices']) {
        endpoint.searchParams.append('category', c);
    }

    const res = await fetch(endpoint, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        // El error del proveedor se propaga TEXTUAL, igual que con Meta en el
        // CRM: «no se pudo medir» deja a quien corrige sin saber qué pasó.
        return { ok: false, state: 'error', status: res.status, reason: body.slice(0, 500) };
    }
    const data = await res.json();
    const audits = data?.lighthouseResult?.audits || {};
    const categories = data?.lighthouseResult?.categories || {};
    const crux = data?.loadingExperience?.metrics || null;

    const num = (id) => audits[id]?.numericValue ?? null;
    const pct = (c) => categories[c]?.score != null ? Math.round(categories[c].score * 100) : null;

    return {
        ok: true,
        state: 'ok',
        strategy,
        fetchedAt: new Date().toISOString(),
        scores: {
            performance: pct('performance'),
            seo: pct('seo'),
            accessibility: pct('accessibility'),
            bestPractices: pct('best-practices'),
        },
        lab: {
            provenance: 'reported',
            lcp: num('largest-contentful-paint'),
            fcp: num('first-contentful-paint'),
            cls: audits['cumulative-layout-shift']?.numericValue ?? null,
            tbt: num('total-blocking-time'),
            ttfb: num('server-response-time'),
            speedIndex: num('speed-index'),
        },
        field: crux ? {
            provenance: 'reported',
            source: 'CrUX — usuarios reales, 28 días',
            lcp: crux.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null,
            inp: crux.INTERACTION_TO_NEXT_PAINT?.percentile ?? null,
            cls: crux.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile != null
                ? crux.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : null,
            fcp: crux.FIRST_CONTENTFUL_PAINT_MS?.percentile ?? null,
            ttfb: crux.EXPERIENCE_TIME_TO_FIRST_BYTE_MS?.percentile ?? null,
        } : {
            provenance: 'unavailable',
            reason: 'El sitio no tiene tráfico suficiente para el informe de experiencia de usuarios reales (CrUX). Los datos de laboratorio sí están.',
        },
    };
}

// ── IndexNow ─────────────────────────────────────────────────────────────────
/**
 * Avisa a Bing, Yandex y Seznam de que una dirección cambió.
 *
 * **Google NO participa en IndexNow** y no hay forma de forzarle un rastreo por
 * API pública: para Google, el aviso equivalente es el `lastmod` del sitemap.
 * Decir «avisamos a los buscadores» a secas daría a entender que también a
 * Google, y sería falso.
 */
export async function pingIndexNow(origin, urls = []) {
    const key = env('INDEXNOW_KEY');
    if (!key) return { ok: false, state: 'not_configured', reason: 'Falta INDEXNOW_KEY.' };
    if (!urls.length) return { ok: true, submitted: 0 };

    const host = new URL(origin).host;
    try {
        const res = await fetch('https://api.indexnow.org/IndexNow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
                host, key,
                keyLocation: `${origin}/${key}.txt`,
                urlList: urls.slice(0, 10_000),
            }),
            signal: AbortSignal.timeout(15_000),
        });
        return {
            ok: res.ok, status: res.status, submitted: urls.length,
            engines: 'Bing, Yandex, Seznam (Google no participa en IndexNow)',
            reason: res.ok ? null : (await res.text().catch(() => '')).slice(0, 300),
        };
    } catch (e) {
        return { ok: false, reason: e.message };
    }
}

/**
 * Avisa a Google y Bing de que el sitemap cambió.
 *
 * Google retiró el endpoint de ping de sitemaps en 2023: hoy la única vía es que
 * el sitemap esté declarado en robots.txt y registrado en Search Console. Se
 * deja dicho acá para que nadie vuelva a implementarlo creyendo que funciona.
 */
export function sitemapPingNote() {
    return {
        google: 'Retirado por Google en 2023. El sitemap se descubre por robots.txt y por Search Console.',
        bing: 'Usa IndexNow, que es lo que implementa este módulo.',
    };
}

export default { integrationStatus, probePageSpeed, pingIndexNow, sitemapPingNote };
