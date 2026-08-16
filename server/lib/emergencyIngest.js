// ════════════════════════════════════════════════════════════════════════
// La ORQUESTACIÓN de la lectura automatizada — v4.825
//
// Descarga la fuente, se la da al modelo para que EXTRAIGA las cifras y
// devuelve propuestas ya juzgadas. El criterio no vive acá: vive en
// `emergencyFeed.js`, que es puro y se prueba sin red ni credenciales.
//
// Lo que este archivo sí decide es cómo se trae el material y cómo se
// degrada. Nada de lo que pase acá puede tumbar nada: es un cron que mira
// páginas de terceros, así que un portal caído, un HTML que cambió de forma
// o un modelo sin credencial tienen que dejar un motivo escrito y seguir.
// ════════════════════════════════════════════════════════════════════════
import { generateCopy } from '../services/copywritingService.js';
import {
    normalizeFeed, normalizeSource, isFetchableUrl, buildExtractionPrompt,
    parseExtraction, judgeReading, readingKey,
    publishedCutoffOf, publishedValueOf,
} from './emergencyFeed.js';

/** Tope de descarga. Una nota de prensa son decenas de kB; un megabyte ya es
 *  otra cosa y no hay motivo para leerla entera dentro de una función. */
const MAX_BYTES = 1_500_000;
const FETCH_TIMEOUT_MS = 20_000;

/** Cuánto texto se le manda al modelo. Suficiente para el cuerpo de una
 *  nota; por encima, se paga por leer los comentarios y el pie de página. */
const MAX_TEXT_CHARS = 14_000;

const IMAGEN = /\.(png|jpe?g|webp|gif|avif)(\?|$)/i;

/**
 * Descarga una dirección con tope de tiempo y de tamaño.
 *
 * La dirección se revalida DESPUÉS de los redireccionamientos: `fetch` los
 * sigue solo, y una redirección hacia `localhost` o hacia una IP privada
 * convertiría este cron en un lector de la red interna de la función.
 * Comprobar sólo la de entrada dejaría esa puerta abierta.
 */
async function descargar(url) {
    if (!isFetchableUrl(url)) throw new Error('La dirección no es una https válida.');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            signal: ctrl.signal,
            redirect: 'follow',
            headers: {
                // Identificarse es lo correcto con un portal de un tercero, y
                // además es lo que permite que nos bloqueen si no nos quieren.
                'User-Agent': 'ClubPlatformForRotary/1.0 (lector de balances oficiales)',
                'Accept': 'text/html,application/json,image/*;q=0.8,*/*;q=0.5',
                'Accept-Language': 'es-CO,es;q=0.9',
            },
        });
        if (!isFetchableUrl(res.url || url)) {
            throw new Error('La fuente redirigió a una dirección que no se puede leer.');
        }
        if (!res.ok) throw new Error(`La fuente respondió ${res.status}.`);
        const tipo = String(res.headers.get('content-type') || '').toLowerCase();
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > MAX_BYTES) throw new Error('La respuesta de la fuente es demasiado grande.');
        return { buf, tipo, url: res.url || url };
    } finally { clearTimeout(t); }
}

/**
 * HTML → texto. No es un parser: es lo justo para que el modelo lea el
 * cuerpo de una nota. Se quitan `script`, `style` y los comentarios ANTES
 * que las etiquetas — al revés, su contenido quedaría suelto en el texto y
 * el modelo leería código como si fuera prosa.
 */
export function htmlATexto(html) {
    return String(html || '')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<\/(p|div|li|tr|h[1-6]|section|article|br)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
        .replace(/[ \t ]+/g, ' ')
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
        .trim();
}

/**
 * Le pide al modelo que extraiga. Devuelve el crudo; quien decide qué
 * sobrevive es `parseExtraction` (el código), no esto.
 *
 * Con `imagen` va por visión, que es el único camino posible: la UNGRD
 * publica el balance como INFOGRAFÍA —el propio cliente lo mandó así— y ahí
 * no hay texto que raspar. Es el mismo `generateCopy` con `imageUrl` que ya
 * usan el control de fidelidad del Creador de Reels y Plantillas IA.
 */
async function extraer({ source, material, imageUrl }) {
    const res = await generateCopy({
        system: buildExtractionPrompt(),
        userText: imageUrl
            ? 'Leé el balance de la imagen y devolvé únicamente el JSON.'
            : `Documento de «${source.name}»:\n\n${material}`,
        imageUrl: imageUrl || null,
        temperature: 0.1,
        maxTokens: 900,
        jsonMode: true,
    });
    return res?.content ?? res?.text ?? res;
}

/**
 * Lee UNA fuente y devuelve sus propuestas ya juzgadas.
 *
 * Nunca lanza: devuelve `{ ok:false, error }`. Es un barrido sobre sitios de
 * terceros y el fallo de uno no puede llevarse por delante a los demás — ni
 * dejar la campaña sin el motivo escrito, que es lo que hace diagnosticable
 * un «no se actualiza» dos semanas después.
 */
export async function readSource({ campaign, source, now = new Date() }) {
    const src = normalizeSource(source);
    const feed = normalizeFeed(campaign?.feed);
    const stats = Array.isArray(campaign?.stats) ? campaign.stats : [];

    try {
        const { buf, tipo, url } = await descargar(src.url);
        const esImagen = src.format === 'imagen' || tipo.startsWith('image/') || IMAGEN.test(url);

        let crudo;
        if (esImagen) {
            crudo = await extraer({ source: src, imageUrl: url });
        } else {
            const texto = tipo.includes('json')
                ? buf.toString('utf8').slice(0, MAX_TEXT_CHARS)
                : htmlATexto(buf.toString('utf8')).slice(0, MAX_TEXT_CHARS);
            if (!texto.trim()) return { ok: false, sourceId: src.id, error: 'La fuente no devolvió texto legible.' };
            crudo = await extraer({ source: src, material: texto });
        }

        const { figures, cutoff, descartes } = parseExtraction(crudo);
        if (!figures.length) {
            return {
                ok: true, sourceId: src.id, sourceName: src.name, url,
                readings: [],
                // Que no haya cifras NO es un error: la mayoría de las veces
                // la página simplemente no cambió o no es un balance. Se
                // informa como lectura vacía, no como avería.
                note: descartes.length ? descartes.join(' ') : 'No se encontraron cifras en esta lectura.',
            };
        }

        const readings = figures.map(figure => {
            const juicio = judgeReading({
                figure,
                source: src,
                cutoff,
                current: publishedValueOf(stats, figure.metric),
                publishedCutoff: publishedCutoffOf(stats, figure.metric),
                feed,
                now,
            });
            return {
                ...juicio,
                approx: figure.approx,
                quote: figure.quote,
                url,
                key: readingKey({
                    campaignId: campaign?.id, sourceId: src.id,
                    metric: figure.metric, cutoff, value: figure.value,
                }),
            };
        });

        return {
            ok: true, sourceId: src.id, sourceName: src.name, url,
            readings,
            note: descartes.length ? descartes.join(' ') : '',
        };
    } catch (e) {
        return { ok: false, sourceId: src.id, sourceName: src.name, error: String(e?.message || e).slice(0, 300) };
    }
}

/**
 * Lee TODAS las fuentes activas de una campaña, en serie.
 *
 * En serie y no en paralelo a propósito: son doce fuentes como mucho, cada
 * una gasta una llamada al modelo, y dispararlas juntas sólo adelanta el
 * momento en que un portal nos limita por ráfaga. Con presupuesto de tiempo,
 * como el barrido de Reels: lo que no entre se lee en la vuelta siguiente.
 */
export async function readCampaign({ campaign, now = new Date(), timeBudgetMs = 60_000 }) {
    const feed = normalizeFeed(campaign?.feed);
    if (!feed.enabled) return { skipped: 'apagada', results: [] };

    const activas = feed.sources.filter(s => s.active && isFetchableUrl(s.url));
    if (!activas.length) return { skipped: 'sin_fuentes', results: [] };

    const arranque = Date.now();
    const results = [];
    for (const source of activas) {
        if (Date.now() - arranque > timeBudgetMs) {
            results.push({ ok: false, sourceId: source.id, sourceName: source.name, error: 'No entró en el presupuesto de tiempo de esta vuelta; se lee en la siguiente.' });
            continue;
        }
        results.push(await readSource({ campaign, source, now }));
    }
    return { skipped: '', results };
}

export default { readSource, readCampaign, htmlATexto };
