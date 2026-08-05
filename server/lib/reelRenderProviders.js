// ════════════════════════════════════════════════════════════════════
// Creador de Reels IA — capa de montaje (render alojado)
// v4.664.0
//
// POR QUÉ EXISTE ESTA CAPA
//
// Unir tres clips con fundidos y una pista musical es un paso de render, y esta
// infraestructura no lo puede hacer: la API corre en Vercel serverless, sin
// ffmpeg y con un tope de 120 s por petición (`vercel.json`). Es exactamente el
// "Pendiente conocido" que ya estaba anotado para el Generador de Outros.
//
// Desde v4.664 hay DOS caminos y el primero no se puede quedar sin configurar:
//
//   · `ffmpeg` (local, por defecto) — el binario viaja con la aplicación
//     (`ffmpeg-static`). Monta dentro de la propia función. Medido sobre el caso
//     real: ~12 s para 14 s en 1080×1920 con dos fundidos y música, holgado
//     dentro de los 120 s. Es el principal porque un proveedor externo sin
//     credencial deja el módulo sin montar nada — que es exactamente lo que
//     pasó al estrenarlo.
//   · alojados (`shotstack`, `creatomate`, `json2video`) — reciben el montaje
//     en JSON y devuelven el MP4. Siguen valiendo para piezas más largas o
//     resoluciones donde el techo de la función se quede corto.
//
// El principal y el de respaldo se eligen por entorno (`REEL_RENDER_PROVIDER` y
// `REEL_RENDER_FALLBACK`) sin desplegar. Si el principal falla, se intenta el
// siguiente ANTES de darle un error al usuario.
//
// `mode` distingue los dos: `local` monta y devuelve el archivo en el acto;
// `remote` crea un trabajo y hay que sondearlo. El controlador se ramifica por
// ese campo y no por el nombre del proveedor.
//
// QUÉ NO ES: esto NO es postprocesar el output del modelo. La regla durable
// —heredada del Generador de Publicaciones y del de Outros— prohíbe retocar el
// archivo que devuelve un modelo generativo: nada de composites, máscaras,
// blur ni recortes sobre el contenido, porque se ve como un montaje pegado.
// Acá el contenido de cada clip viaja INTACTO; lo que se declara es el montaje
// —qué clip va cuándo, cómo se encadenan, qué suena debajo—, que es una
// operación de edición, no un retoque. Ningún adaptador aplica filtros, escalas
// forzadas ni correcciones de color sobre los clips.
//
// EL CONTRATO, igual para los tres:
//   submitRender(spec)  → { jobId, provider }
//   pollRender(jobId)   → { state, url, posterUrl, failMsg, raw }
//   capabilities        → qué sabe hacer cada uno
//
// `state` se normaliza a: 'queued' | 'rendering' | 'success' | 'failed'.
// ════════════════════════════════════════════════════════════════════

import { TRANSITIONS, MUSIC_FADE_SEC, MUSIC_VOLUME_DEFAULT } from './reelSpec.js';

// ─── Registro ──────────────────────────────────────────────────────────────
//
// `envKey` es la credencial que lo habilita. Un proveedor sin su clave en el
// entorno no se ofrece: es el mismo criterio del panel de traducción.
export const RENDER_PROVIDERS = {
    ffmpeg: {
        id: 'ffmpeg',
        label: 'FFmpeg (en el servidor)',
        mode: 'local',
        envKey: null,
        capabilities: { maxHeight: 3840, poster: true, transitions: true, soundtrack: true, callback: false },
        note: 'Monta dentro de la aplicación. No necesita credencial ni servicio externo.'
    },
    shotstack: {
        id: 'shotstack',
        label: 'Shotstack',
        envKey: 'SHOTSTACK_API_KEY',
        mode: 'remote',
        capabilities: { maxHeight: 3840, poster: true, transitions: true, soundtrack: true, callback: true },
        note: 'Transiciones nativas y pista de audio con fundidos. Entorno de pruebas gratuito (`stage`).'
    },
    creatomate: {
        id: 'creatomate',
        label: 'Creatomate',
        envKey: 'CREATOMATE_API_KEY',
        mode: 'remote',
        capabilities: { maxHeight: 3840, poster: true, transitions: true, soundtrack: true, callback: true },
        note: 'Composición por elementos con animaciones de entrada y salida.'
    },
    json2video: {
        id: 'json2video',
        label: 'JSON2Video',
        envKey: 'JSON2VIDEO_API_KEY',
        mode: 'remote',
        capabilities: { maxHeight: 2160, poster: false, transitions: true, soundtrack: true, callback: true },
        note: 'Escenas con transición declarada. No entrega fotograma de portada.'
    }
};

// El proveedor local no tiene credencial: su disponibilidad es que el binario
// exista. Se comprueba una vez y se cachea — `isFfmpegAvailable` importa el
// paquete, y hacerlo en cada llamada al catálogo sería gratis pero ruidoso.
let _ffmpegReady = null;
export const refreshFfmpegAvailability = async () => {
    const { isFfmpegAvailable } = await import('./reelFfmpeg.js');
    _ffmpegReady = await isFfmpegAvailable();
    return _ffmpegReady;
};

export const isRenderProviderAvailable = (id) => {
    const p = RENDER_PROVIDERS[id];
    if (!p) return false;
    // `_ffmpegReady === null` significa "todavía no se comprobó". Se da por
    // disponible: el binario viaja con la aplicación, así que lo normal es que
    // esté, y si no lo estuviera el fallo aparece al montar y la cadena de
    // respaldo lo cubre. Optimista a propósito — lo contrario escondería el
    // proveedor principal en el primer arranque en frío.
    if (p.mode === 'local') return _ffmpegReady !== false;
    return Boolean(process.env[p.envKey]);
};

export const availableRenderProviders = () =>
    Object.keys(RENDER_PROVIDERS).filter(isRenderProviderAvailable);

// El proveedor activo: el que diga el entorno si está configurado; si no,
// FFmpeg; si tampoco, el primero con credencial.
export const activeRenderProvider = () => {
    const wanted = process.env.REEL_RENDER_PROVIDER;
    if (wanted && isRenderProviderAvailable(wanted)) return wanted;
    if (wanted && !isRenderProviderAvailable(wanted)) {
        console.warn(`[REEL] REEL_RENDER_PROVIDER=${wanted} no está disponible (${RENDER_PROVIDERS[wanted]?.envKey || 'binario ausente'}).`);
    }
    if (isRenderProviderAvailable('ffmpeg')) return 'ffmpeg';
    return availableRenderProviders()[0] || null;
};

// La CADENA: principal, respaldo declarado y cualquier otro disponible como
// último recurso, sin repetir. Es lo que hace que un fallo del principal no
// llegue al usuario si hay con qué montar.
export const renderChain = () => {
    const primary = activeRenderProvider();
    const fallback = process.env.REEL_RENDER_FALLBACK;
    return [primary, fallback, ...availableRenderProviders()]
        .filter((id, i, arr) => id && arr.indexOf(id) === i && isRenderProviderAvailable(id));
};

// ─── Descripción neutral del montaje ───────────────────────────────────────
//
// Lo que el controlador arma y cada adaptador traduce. Deliberadamente pobre:
// clips con su recorte, transiciones entre ellos, una pista de audio y el
// formato de salida. Nada de filtros ni de correcciones — ver la cabecera.
//
//   {
//     width, height, fps,
//     clips:      [{ src, startAt, durationSec, transitionIn, transitionOut }],
//     soundtrack: { src, volume, fadeIn, fadeOut } | null,
//     callbackUrl
//   }
//
// `startAt` es el segundo del CLIP en el que empieza a usarse. Cuando el motor
// entregó 5 s y el montaje quiere 4.3, el sobrante se descarta desde el final:
// el arranque de un clip generativo es siempre el más fiel a la foto original,
// porque es donde el modelo todavía no derivó.
/**
 * Ritmo de fotogramas del montaje (v4.716).
 *
 * Hasta v4.715 se forzaba 30 fps sin mirar qué había entregado el motor. Si los
 * clips vienen a 24, el filtro `fps=30` no interpola: DUPLICA fotogramas, y lo
 * hace en un patrón irregular (unos se repiten y otros no). Sobre contenido con
 * poco movimiento eso se percibe como saltos —«reproducción por fotogramas»—,
 * que es parte de lo que se reportó.
 *
 * Si los tres clips coinciden en su ritmo, se adopta el suyo y no se duplica
 * nada. Si difieren, hay que conformarlos igualmente y se toma el MAYOR: subir
 * duplica, pero bajar tira fotogramas y eso sí se ve siempre.
 *
 * `probeMp4` deja el fps medido en `quality.measured.fps` de cada escena. Sin
 * esa medida se mantiene el valor por defecto: no se adivina.
 */
export const resolveEditFps = (scenes = [], fallback = 30) => {
    const measured = scenes
        .map(s => Number(s?.quality?.measured?.fps))
        // Un fps fuera de este rango es un error de lectura del contenedor, no
        // un ritmo real: no se le hace caso.
        .filter(v => Number.isFinite(v) && v >= 20 && v <= 61)
        .map(v => Math.round(v));
    if (!measured.length) return fallback;
    const unique = [...new Set(measured)];
    return unique.length === 1 ? unique[0] : Math.max(...measured);
};

export const buildEditSpec = ({
    scenes,
    tier,
    fps = 30,
    soundtrackUrl = null,
    soundtrackVolume = MUSIC_VOLUME_DEFAULT,
    voice = null,
    callbackUrl = null
}) => {
    const clips = scenes.map((scene, i) => {
        const prev = scenes[i - 1];
        return {
            src: scene.videoUrl,
            startAt: 0,
            durationSec: scene.durationSec,
            // La transición de entrada de una escena es la de salida de la
            // anterior: un fundido es una sola cosa vista desde los dos lados.
            transitionIn: i === 0 ? null : (prev?.transitionOut || 'fade'),
            transitionOut: i === scenes.length - 1 ? 'fade' : (scene.transitionOut || 'fade')
        };
    });

    const totalSec = clips.reduce((sum, c, i) => {
        const overlap = i === 0 ? 0 : (TRANSITIONS[c.transitionIn]?.overlap ?? 0);
        return sum + c.durationSec - overlap;
    }, 0);

    return {
        width: tier.width,
        height: tier.height,
        // El ritmo real de los clips manda sobre el valor por defecto: forzar
        // 30 sobre clips de 24 duplica fotogramas y se ve como saltos.
        fps: resolveEditFps(scenes, fps),
        clips,
        totalSec: Number(totalSec.toFixed(2)),
        soundtrack: soundtrackUrl
            ? { src: soundtrackUrl, volume: soundtrackVolume, fadeIn: MUSIC_FADE_SEC, fadeOut: MUSIC_FADE_SEC }
            : null,
        // La voz va aparte de la música: el montaje las mezcla con ducking, no
        // las suma sin más. Sólo el compositor local lo soporta hoy.
        voice,
        callbackUrl
    };
};

// Posición de cada clip en la línea de tiempo, ya descontando los solapamientos.
// Lo usan los tres adaptadores, así que vive una sola vez.
const layoutTimeline = (clips) => {
    let cursor = 0;
    return clips.map((clip, i) => {
        const overlap = i === 0 ? 0 : (TRANSITIONS[clip.transitionIn]?.overlap ?? 0);
        const start = Math.max(0, cursor - overlap);
        cursor = start + clip.durationSec;
        return { ...clip, start: Number(start.toFixed(3)), end: Number(cursor.toFixed(3)) };
    });
};

// ─── Shotstack ─────────────────────────────────────────────────────────────
//
// El nombre de la transición se manda tal cual lo declara `TRANSITIONS.provider`
// cuando Shotstack lo conoce; lo que no reconoce cae a `fade`. Traducir a un
// efecto parecido pero distinto sería peor que el fundido neutro.
const SHOTSTACK_TRANSITIONS = new Set([
    'fade', 'reveal', 'wipeLeft', 'wipeRight', 'slideLeft', 'slideRight',
    'slideUp', 'slideDown', 'carouselLeft', 'carouselRight', 'zoom'
]);
const shotstackTransition = (id) => {
    if (!id || id === 'cut') return null;
    const name = TRANSITIONS[id]?.provider || id;
    return SHOTSTACK_TRANSITIONS.has(name) ? name : 'fade';
};

const shotstackBase = () =>
    process.env.SHOTSTACK_ENV === 'stage'
        ? 'https://api.shotstack.io/edit/stage'
        : 'https://api.shotstack.io/edit/v1';

const shotstack = {
    async submit(spec) {
        const laid = layoutTimeline(spec.clips);

        const timeline = {
            background: '#000000',
            tracks: [{
                clips: laid.map(clip => ({
                    asset: {
                        type: 'video',
                        src: clip.src,
                        // Sólo se recorta el sobrante del final; el contenido no
                        // se toca. `trim` es el segundo del clip donde empieza.
                        trim: clip.startAt || 0,
                        volume: 0
                    },
                    start: clip.start,
                    length: clip.durationSec,
                    // `cover` sin escala explícita: el clip llega en la misma
                    // proporción que la salida, así que no hay recorte real.
                    fit: 'cover',
                    transition: {
                        ...(shotstackTransition(clip.transitionIn) ? { in: shotstackTransition(clip.transitionIn) } : {}),
                        ...(shotstackTransition(clip.transitionOut) ? { out: shotstackTransition(clip.transitionOut) } : {})
                    }
                }))
            }]
        };

        if (spec.soundtrack) {
            timeline.soundtrack = {
                src: spec.soundtrack.src,
                effect: 'fadeInFadeOut',
                volume: spec.soundtrack.volume
            };
        }

        const body = {
            timeline,
            output: {
                format: 'mp4',
                fps: spec.fps,
                size: { width: spec.width, height: spec.height },
                // `quality: high` es lo que sube la tasa de bits del encoder.
                // Un Reel de 15 s en 1080×1920 sale por encima de los 8 Mbps,
                // que es lo que exige el umbral de calidad del módulo.
                quality: 'high',
                // Fotograma de portada al segundo 1: sirve de miniatura en la
                // biblioteca y es lo que permite comparar contra la foto de
                // origen en la comprobación de fidelidad.
                poster: { capture: 1 }
            },
            ...(spec.callbackUrl ? { callback: spec.callbackUrl } : {})
        };

        const resp = await fetch(`${shotstackBase()}/render`, {
            method: 'POST',
            headers: {
                'x-api-key': process.env.SHOTSTACK_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data?.success) {
            throw new Error(`Shotstack render: ${describeError(resp, data)}`);
        }
        const jobId = data.response?.id;
        if (!jobId) throw new Error(`Shotstack no devolvió id de render: ${snippet(data)}`);
        return { jobId };
    },

    async poll(jobId) {
        const resp = await fetch(`${shotstackBase()}/render/${encodeURIComponent(jobId)}`, {
            headers: { 'x-api-key': process.env.SHOTSTACK_API_KEY }
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(`Shotstack estado: ${describeError(resp, data)}`);

        const r = data.response || {};
        const status = String(r.status || '').toLowerCase();
        if (status === 'done') {
            return { state: 'success', url: r.url || null, posterUrl: r.poster || null, failMsg: null, raw: data };
        }
        if (status === 'failed') {
            return { state: 'failed', url: null, posterUrl: null, failMsg: r.error || 'Shotstack marcó el render como fallido', raw: data };
        }
        return { state: status === 'queued' ? 'queued' : 'rendering', url: null, posterUrl: null, failMsg: null, raw: data };
    }
};

// ─── Creatomate ────────────────────────────────────────────────────────────
//
// Compone por elementos con `track` y `time`. Las transiciones se declaran
// como animaciones de entrada del elemento siguiente.
const CREATOMATE_ANIMATIONS = {
    fade: 'fade', dissolve: 'fade', blur: 'fade',
    slideLeft: 'slide', zoom: 'scale', none: null
};

const creatomate = {
    async submit(spec) {
        const laid = layoutTimeline(spec.clips);

        const elements = laid.map((clip, i) => {
            const anim = CREATOMATE_ANIMATIONS[TRANSITIONS[clip.transitionIn]?.provider || 'fade'];
            return {
                type: 'video',
                source: clip.src,
                track: 1,
                time: clip.start,
                duration: clip.durationSec,
                trim_start: clip.startAt || 0,
                volume: 0,
                fit: 'cover',
                ...(i > 0 && anim ? {
                    animations: [{
                        type: anim,
                        transition: true,
                        duration: TRANSITIONS[clip.transitionIn]?.overlap ?? 0.5,
                        time: 'start'
                    }]
                } : {})
            };
        });

        if (spec.soundtrack) {
            elements.push({
                type: 'audio',
                source: spec.soundtrack.src,
                track: 2,
                time: 0,
                duration: spec.totalSec,
                volume: Math.round(spec.soundtrack.volume * 100),
                audio_fade_in: spec.soundtrack.fadeIn,
                audio_fade_out: spec.soundtrack.fadeOut
            });
        }

        const resp = await fetch('https://api.creatomate.com/v1/renders', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.CREATOMATE_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                output_format: 'mp4',
                width: spec.width,
                height: spec.height,
                frame_rate: spec.fps,
                elements,
                ...(spec.callbackUrl ? { webhook_url: spec.callbackUrl } : {})
            })
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(`Creatomate render: ${describeError(resp, data)}`);

        // Devuelve un array (uno por salida pedida); acá siempre es uno.
        const first = Array.isArray(data) ? data[0] : data;
        if (!first?.id) throw new Error(`Creatomate no devolvió id de render: ${snippet(data)}`);
        return { jobId: first.id };
    },

    async poll(jobId) {
        const resp = await fetch(`https://api.creatomate.com/v1/renders/${encodeURIComponent(jobId)}`, {
            headers: { 'Authorization': `Bearer ${process.env.CREATOMATE_API_KEY}` }
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(`Creatomate estado: ${describeError(resp, data)}`);

        const status = String(data.status || '').toLowerCase();
        if (status === 'succeeded') {
            return { state: 'success', url: data.url || null, posterUrl: data.snapshot_url || null, failMsg: null, raw: data };
        }
        if (status === 'failed') {
            return { state: 'failed', url: null, posterUrl: null, failMsg: data.error_message || 'Creatomate marcó el render como fallido', raw: data };
        }
        return { state: status === 'planned' ? 'queued' : 'rendering', url: null, posterUrl: null, failMsg: null, raw: data };
    }
};

// ─── JSON2Video ────────────────────────────────────────────────────────────
//
// Modelo por escenas: cada escena declara su transición de entrada y la
// duración la toma del elemento de video.
const JSON2VIDEO_TRANSITIONS = {
    fade: 'fade', dissolve: 'fade', slideLeft: 'slide',
    zoom: 'zoom', blur: 'fade', none: null
};

const json2video = {
    async submit(spec) {
        const scenes = spec.clips.map((clip, i) => {
            const style = JSON2VIDEO_TRANSITIONS[TRANSITIONS[clip.transitionIn]?.provider || 'fade'];
            return {
                elements: [{
                    type: 'video',
                    src: clip.src,
                    start: 0,
                    duration: clip.durationSec,
                    volume: 0,
                    resize: 'cover'
                }],
                ...(i > 0 && style ? {
                    transition: { style, duration: TRANSITIONS[clip.transitionIn]?.overlap ?? 0.5 }
                } : {})
            };
        });

        const body = {
            resolution: 'custom',
            width: spec.width,
            height: spec.height,
            quality: 'high',
            scenes,
            ...(spec.soundtrack ? {
                elements: [{
                    type: 'audio',
                    src: spec.soundtrack.src,
                    volume: spec.soundtrack.volume,
                    'fade-in': spec.soundtrack.fadeIn,
                    'fade-out': spec.soundtrack.fadeOut
                }]
            } : {}),
            ...(spec.callbackUrl ? { webhook: spec.callbackUrl } : {})
        };

        const resp = await fetch('https://api.json2video.com/v2/movies', {
            method: 'POST',
            headers: {
                'x-api-key': process.env.JSON2VIDEO_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data?.success === false) throw new Error(`JSON2Video render: ${describeError(resp, data)}`);

        const jobId = data.project || data.id;
        if (!jobId) throw new Error(`JSON2Video no devolvió id de proyecto: ${snippet(data)}`);
        return { jobId };
    },

    async poll(jobId) {
        const resp = await fetch(`https://api.json2video.com/v2/movies?project=${encodeURIComponent(jobId)}`, {
            headers: { 'x-api-key': process.env.JSON2VIDEO_API_KEY }
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(`JSON2Video estado: ${describeError(resp, data)}`);

        const movie = data.movie || data;
        const status = String(movie.status || '').toLowerCase();
        if (status === 'done') {
            return { state: 'success', url: movie.url || null, posterUrl: null, failMsg: null, raw: data };
        }
        if (status === 'error' || status === 'failed') {
            return { state: 'failed', url: null, posterUrl: null, failMsg: movie.message || 'JSON2Video marcó el render como fallido', raw: data };
        }
        return { state: status === 'pending' ? 'queued' : 'rendering', url: null, posterUrl: null, failMsg: null, raw: data };
    }
};

// ─── FFmpeg local ──────────────────────────────────────────────────────────
//
// No crea un trabajo: monta y devuelve el archivo. Por eso `submit` responde
// con `output` en vez de `jobId`, y `poll` nunca se llama para este proveedor.
//
// Los clips se descargan acá porque FFmpeg necesita archivos locales. Es la
// diferencia con los alojados, que reciben URLs y descargan ellos.
const ffmpegLocal = {
    async submit(spec) {
        const { composeReel } = await import('./reelFfmpeg.js');

        const fetchBuffer = async (url, what) => {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`No se pudo descargar ${what} (${resp.status})`);
            return Buffer.from(await resp.arrayBuffer());
        };

        // En paralelo: son descargas independientes y en serie sumarían.
        const buffers = await Promise.all(
            spec.clips.map((c, i) => fetchBuffer(c.src, `el clip ${i + 1}`))
        );

        // ── Sin pasada de normalización previa (v4.671) ──
        //
        // Hasta v4.670 cada clip cuya resolución o fps no coincidiera con el
        // destino se recodificaba ENTERO antes de montar. Era trabajo perdido y
        // es lo que rompía el módulo: la normalización agotaba su tiempo y el
        // montaje moría con «ningún proveedor pudo completar el Reel».
        //
        // Perdido porque `buildFilterGraph` YA conforma cada entrada, con la
        // misma cadena exacta —scale + crop + fps + setsar + format=yuv420p—
        // antes de encadenar los fundidos. La pasada previa recodificaba para
        // que el montaje volviera a recodificar idéntico: doble encode, doble
        // pérdida de generación y el doble de segundos del presupuesto.
        //
        // No hay riesgo de "concatenar archivos dispares": nada se concatena en
        // crudo. FFmpeg DECODIFICA cada entrada y la conforma dentro del grafo,
        // que es el sitio correcto para hacerlo. Comprobado con tres clips a
        // 1280x720@30, 1920x1080@24 y 720x1280@25 —uno de ellos con pista de
        // audio—: salen unidos en 1080x1920@30, 14,00 s, en una sola pasada.
        //
        // El audio de un clip se ignora por construcción: el grafo sólo toma
        // `[i:v]` de cada entrada, así que una pista suelta no desalinea nada.
        const notes = [];
        const clips = spec.clips.map((c, i) => ({ ...c, buffer: buffers[i] }));

        let voiceBuffer = null;
        if (spec.voice?.src) {
            try {
                voiceBuffer = await fetchBuffer(spec.voice.src, 'la narración');
            } catch (e) {
                notes.push(`La narración no se pudo descargar: ${e.message} El Reel se montó sin voz.`);
            }
        }

        let musicBuffer = null;
        if (spec.soundtrack?.src) {
            try {
                musicBuffer = await fetchBuffer(spec.soundtrack.src, 'la banda sonora');
            } catch (e) {
                // Sin música el Reel sigue siendo válido: se anota y se monta.
                notes.push(`La banda sonora no se pudo descargar: ${e.message} El Reel se montó sin música.`);
            }
        }

        const result = await composeReel({
            clips,
            musicBuffer,
            voiceBuffer,
            voiceLeadIn: spec.voice?.leadIn ?? 0,
            voiceStretch: spec.voice?.stretch ?? 1,
            width: spec.width,
            height: spec.height,
            fps: spec.fps,
            musicVolume: spec.soundtrack?.volume ?? 0.85,
            fadeSec: spec.soundtrack?.fadeIn ?? 1
        });

        return {
            output: {
                buffer: result.buffer,
                posterBuffer: result.posterBuffer,
                expectedDurationSec: result.expectedDurationSec,
                hasMusic: Boolean(musicBuffer),
                hasVoice: Boolean(voiceBuffer),
                notes
            }
        };
    },

    // Nunca se sondea un montaje local: cuando `submit` vuelve, ya está hecho.
    async poll() {
        return { state: 'success', url: null, posterUrl: null, failMsg: null, raw: null };
    }
};

const ADAPTERS = { ffmpeg: ffmpegLocal, shotstack, creatomate, json2video };

// ─── API pública ───────────────────────────────────────────────────────────

// El cuerpo de la respuesta va SIEMPRE dentro del error. Es la lección de KIE
// (v4.646): un proveedor que contesta "campo inválido" sin decir cuál deja el
// módulo roto sin pista, y el mensaje textual es lo único que permite
// corregirlo desde el entorno, sin desplegar.
const snippet = (data) => JSON.stringify(data ?? {}).slice(0, 400);
const describeError = (resp, data) =>
    data?.message || data?.error || data?.msg || `HTTP ${resp.status} ${snippet(data)}`;

export const submitRender = async (spec, providerId = null) => {
    // Los proveedores alojados de este registro no exponen ducking por cadena
    // lateral. Con narración, el montaje local es el único que mezcla bien, así
    // que se prioriza y se dice por qué.
    if (spec.voice?.src && !providerId && isRenderProviderAvailable('ffmpeg')) {
        providerId = 'ffmpeg';
    }
    // Con proveedor explícito se usa ese y sólo ese —lo pidió el usuario desde
    // el panel, y silenciarlo con un respaldo sería desobedecerlo—. Sin él, la
    // cadena completa.
    const chain = providerId
        ? (isRenderProviderAvailable(providerId) ? [providerId] : [])
        : renderChain();

    if (!chain.length) {
        const err = new Error(
            providerId
                ? `El proveedor de montaje "${providerId}" no está disponible.`
                : 'No hay proveedor de montaje disponible. FFmpeg no se pudo cargar y no hay credencial de ningún servicio alojado.'
        );
        err.code = 'NO_RENDER_PROVIDER';
        throw err;
    }

    const failures = [];
    const diagnostics = [];
    for (const id of chain) {
        try {
            const res = await ADAPTERS[id].submit(spec);
            const mode = RENDER_PROVIDERS[id].mode;
            if (failures.length) {
                console.warn(`[REEL] montaje: ${failures.join(' | ')} — resuelto con ${id}`);
            }
            console.log(`[REEL] montaje en ${id} (${mode}): ${spec.width}×${spec.height}, ${spec.totalSec}s, ${spec.clips.length} clips, música=${Boolean(spec.soundtrack)}`);
            return {
                provider: id,
                mode,
                jobId: res.jobId || null,
                output: res.output || null,
                // Qué se intentó antes. Va al historial técnico del proyecto:
                // que el principal fallara y lo salvara el respaldo es
                // justamente lo que hay que poder ver después.
                attempted: failures
            };
        } catch (e) {
            failures.push(`${id}: ${e.message}`);
            // El diagnóstico técnico se guarda aparte del mensaje: el comando,
            // el código de salida y la cola de stderr no van a la pantalla del
            // usuario, pero sin ellos un fallo de montaje hay que reproducirlo
            // a ciegas. `submitRender` los propaga y el controlador los guarda.
            diagnostics.push({
                provider: id,
                message: e.message,
                code: e.code || null,
                ffmpeg: e.ffmpeg || null,
                at: new Date().toISOString()
            });
            console.error(`[REEL] montaje con ${id} falló:`, e.message);
        }
    }

    const err = new Error(`Ningún proveedor de montaje pudo completar el Reel — ${failures.join(' | ')}`);
    err.code = 'RENDER_FAILED';
    err.attempted = failures;
    err.diagnostics = diagnostics;
    throw err;
};

export const pollRender = async (jobId, providerId) => {
    const id = providerId || activeRenderProvider();
    if (!id || !ADAPTERS[id]) throw new Error(`Proveedor de montaje desconocido: ${providerId}`);
    return ADAPTERS[id].poll(jobId);
};

// Descarga el montaje terminado. La URL del proveedor caduca —igual que la de
// KIE—, así que el archivo se copia a nuestro bucket en cuanto está listo.
export const fetchRenderBuffer = async (url) => {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`No se pudo descargar el montaje (${resp.status})`);
    return Buffer.from(await resp.arrayBuffer());
};
