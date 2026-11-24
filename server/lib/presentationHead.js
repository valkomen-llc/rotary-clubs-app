// ════════════════════════════════════════════════════════════════════
// Presentación comercial de Club Platform — el <head> SIN JavaScript
// (v4.1356.0)
//
// `/presentacion` se comparte por WhatsApp, correo y redes, y esos
// rastreadores no ejecutan JavaScript (regla v4.703): el título, la
// descripción y las etiquetas Open Graph tienen que ir en el documento.
// Sin esto, el enlace se previsualizaba con la ficha del sitio que lo
// sirve (un club o la genérica), no con la de la presentación.
//
// Es PURO y no toca la base: no puede demorar ni tumbar el documento.
//
// ⚠️ `title` y `description` son los de `PRESENTATION.meta` en
// `src/config/clubPlatformPresentation.ts`. `scripts/test-presentation.mjs`
// compara los dos archivos: cambiar uno sin el otro rompe el `prebuild`.
// ════════════════════════════════════════════════════════════════════
import { stripManagedTags } from './seoRender.js';

export const PRESENTATION_PATH = '/presentacion';

export const PRESENTATION_META = {
    title: 'Club Platform for Rotary — Un activo digital para tu club',
    description: 'Un ecosistema digital para conectar, comunicar, movilizar recursos y multiplicar el impacto rotario. Conoce los planes Club Digital y Club Inteligente.',
    siteName: 'Club Platform for Rotary',
    // Sin imagen propia para compartir, el logotipo. Si se sube una de
    // 1200 × 630, ponerla acá y en `meta.shareImage` de la configuración.
    image: 'https://rotary-platform-assets.s3.us-east-1.amazonaws.com/platform/logo/1776225800089-Club_Platform_for_Rotary.png',
    largeImage: false,
};

const escAttr = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const isPresentationPath = (path) => String(path || '').replace(/\/+$/, '') === PRESENTATION_PATH;

/** Puro: el documento base con el `<head>` de la presentación. */
export function renderPresentationHead(html, { host, protocol = 'https', meta = PRESENTATION_META } = {}) {
    const url = `${protocol}://${host}${PRESENTATION_PATH}`;
    const tags = [
        `<meta name="description" content="${escAttr(meta.description)}">`,
        `<meta name="robots" content="index, follow">`,
        `<meta property="og:type" content="website">`,
        `<meta property="og:site_name" content="${escAttr(meta.siteName)}">`,
        `<meta property="og:title" content="${escAttr(meta.title)}">`,
        `<meta property="og:description" content="${escAttr(meta.description)}">`,
        `<meta property="og:url" content="${escAttr(url)}">`,
        `<meta property="og:locale" content="es_CO">`,
        ...(meta.image ? [`<meta property="og:image" content="${escAttr(meta.image)}">`] : []),
        `<meta name="twitter:card" content="${meta.image && meta.largeImage ? 'summary_large_image' : 'summary'}">`,
        `<meta name="twitter:title" content="${escAttr(meta.title)}">`,
        `<meta name="twitter:description" content="${escAttr(meta.description)}">`,
        ...(meta.image ? [`<meta name="twitter:image" content="${escAttr(meta.image)}">`] : []),
        `<link rel="canonical" href="${escAttr(url)}">`,
    ];
    let out = stripManagedTags(html).replace(/\s*<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>/gi, '');
    const title = `<title>${escAttr(meta.title)}</title>`;
    out = /<title\b[^>]*>[\s\S]*?<\/title>/i.test(out) ? out.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, title) : out.replace(/<head\b([^>]*)>/i, `<head$1>\n    ${title}`);
    const block = `\n    <!-- Presentación comercial de Club Platform — etiquetas resueltas en el servidor -->\n    ${tags.join('\n    ')}\n  `;
    return out.includes('</head>') ? out.replace('</head>', `${block}</head>`) : out + block;
}

export default { PRESENTATION_PATH, PRESENTATION_META, isPresentationPath, renderPresentationHead };
