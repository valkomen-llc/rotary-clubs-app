// ════════════════════════════════════════════════════════════════════
// Creador de Reels IA — banda sonora
// v4.668.0
//
// La música la elige el director a partir de lo que detecta en las fotos y la
// genera un modelo. Cada pieza suena distinta porque un motor generativo nunca
// devuelve dos veces lo mismo, ni con el mismo prompt.
//
// ─── POR QUÉ ELEVENLABS ES EL PRINCIPAL, Y NO SUNO ──────────────────────────
//
// No es una decisión de calidad de audio: es de LICENCIA.
//
// Estas piezas las publica una institución en YouTube, donde el Content ID
// reclama automáticamente. Un Distrito de Rotary con un reclamo de copyright en
// un video de servicio comunitario es un problema reputacional, no técnico.
//
//   · ElevenLabs Music entrena con catálogo licenciado mediante acuerdos
//     firmados (Merlin, Kobalt) y concede derechos comerciales explícitos.
//   · Stable Audio entrena con AudioSparx, también licenciado. Más barato y
//     especializado en camas instrumentales, que es exactamente lo que hace
//     falta acá — no canciones con voz.
//   · Suno y Udio no divulgan sus datos de entrenamiento y están demandados por
//     las discográficas. Además, consumidos a través de una pasarela
//     revendedora, no queda claro quién sostiene la licencia comercial.
//
// Suno se conserva DECLARADO y funcional —quien lo quiera lo enciende por
// entorno— pero deja de ser el default, y su ficha dice por qué.
//
// LA VARIEDAD NO VIENE DEL PROVEEDOR, viene del prompt: los nueve estilos de
// `MUSIC_STYLES`, con su BPM y su descriptor, que el director elige según lo que
// ve en las fotos. Cambiar de proveedor por variedad sería resolver el problema
// equivocado.
//
// LA BIBLIOTECA ES LA SEGUNDA FUENTE, no un plan B improvisado: se declara como
// proveedor igual que el generativo. Sirve para dos casos reales — que el
// modelo falle, y que el usuario quiera reemplazar la pista desde la
// previsualización por algo aprobado de antemano.
//
// POR QUÉ NO SE MEZCLA ACÁ: poner la música debajo del video exige un paso de
// mezcla, y esta infraestructura no tiene ffmpeg. La pista se entrega como un
// archivo aparte y quien la mezcla es el proveedor de montaje, que recibe la
// URL en `soundtrack`. Es la misma razón por la que el Generador de Outros pide
// la voz al motor de audio nativo en vez de generarla por separado.
// ════════════════════════════════════════════════════════════════════

import { MUSIC_STYLES, DEFAULT_MUSIC_STYLE } from './reelSpec.js';

const KIE_API_BASE = 'https://api.kie.ai/api/v1';

// ─── Proveedores ───────────────────────────────────────────────────────────
//
// Mismo criterio que el registro de motores de video: el id del modelo es
// configurable por entorno porque las pasarelas los renombran, y agregar un
// proveedor es una entrada acá más su adaptador.
// `mode` distingue cómo se obtiene la pista, igual que en la capa de montaje:
//   · `sync`  — la petición devuelve el audio. Se sube y listo.
//   · `async` — crea una tarea y hay que sondearla.
// El controlador se ramifica por ese campo y no por el nombre del proveedor.
//
// `licensing` es metadata de verdad, no adorno: es el criterio que decide el
// orden de la cadena, y se muestra en el panel para que quien cambie el
// proveedor sepa qué está aceptando.
export const MUSIC_PROVIDERS = {
    elevenlabs_music: {
        id: 'elevenlabs_music',
        label: 'ElevenLabs Music',
        mode: 'sync',
        model: process.env.ELEVENLABS_MUSIC_MODEL || 'music_v1',
        envKey: 'ELEVENLABS_API_KEY',
        instrumental: true,
        licensing: 'cleared',
        licensingNote: 'Entrenado con catálogo licenciado (Merlin, Kobalt). Derechos comerciales explícitos.',
        isDefault: true,
        note: 'Principal. Misma credencial que la narración: un proveedor para voz y música.'
    },
    stable_audio: {
        id: 'stable_audio',
        label: 'Stable Audio 2',
        mode: 'sync',
        model: process.env.STABLE_AUDIO_MODEL || 'stable-audio-2',
        envKey: 'STABILITY_API_KEY',
        instrumental: true,
        licensing: 'cleared',
        licensingNote: 'Entrenado con AudioSparx, licenciado. Uso comercial permitido.',
        note: 'Respaldo. Más económico y especializado en camas instrumentales.'
    },
    kie_music: {
        id: 'kie_music',
        label: 'KIE.AI · Suno',
        mode: 'async',
        model: process.env.REEL_MUSIC_MODEL || 'suno/v5',
        envKey: 'KIE_API_KEY',
        instrumental: true,
        licensing: 'unclear',
        licensingNote: 'Datos de entrenamiento no divulgados y litigio abierto con las discográficas. Consumido vía pasarela, la licencia comercial no es trazable. No se usa por defecto para piezas institucionales.',
        note: 'Disponible, pero fuera de la cadena automática. Se activa a propósito con REEL_MUSIC_PROVIDER.'
    },
    library: {
        id: 'library',
        label: 'Biblioteca licenciada',
        mode: 'sync',
        envKey: null,
        licensing: 'cleared',
        licensingNote: 'Pistas que subió el propio equipo, con su licencia ya resuelta.',
        note: 'Pistas cargadas en la Biblioteca multimedia, etiquetadas por estilo.'
    }
};

export const isMusicProviderAvailable = (id) => {
    const p = MUSIC_PROVIDERS[id];
    if (!p) return false;
    if (!p.envKey) return true;
    return Boolean(process.env[p.envKey]);
};

export const DEFAULT_MUSIC_PROVIDER = (() => {
    const wanted = process.env.REEL_MUSIC_PROVIDER;
    if (wanted && isMusicProviderAvailable(wanted)) return wanted;
    if (isMusicProviderAvailable('elevenlabs_music')) return 'elevenlabs_music';
    if (isMusicProviderAvailable('stable_audio')) return 'stable_audio';
    return 'library';
})();

// La CADENA de generación. Suno queda FUERA a propósito: entra sólo si alguien
// lo pide por `REEL_MUSIC_PROVIDER`, y entonces se respeta esa elección sin
// respaldo — igual que en la capa de montaje, un proveedor pedido a mano manda.
export const musicChain = () => {
    const wanted = process.env.REEL_MUSIC_PROVIDER;
    if (wanted && isMusicProviderAvailable(wanted)) return [wanted];
    return ['elevenlabs_music', 'stable_audio'].filter(isMusicProviderAvailable);
};

// ─── Generativo vía KIE ────────────────────────────────────────────────────

const snippet = (data) => JSON.stringify(data ?? {}).slice(0, 400);

// Crea la tarea de música. Devuelve el id; la espera la hace el que llama.
const createKieMusicTask = async ({ prompt, durationSec, callbackUrl = null, metadata = {} }) => {
    const apiKey = process.env.KIE_API_KEY;
    if (!apiKey) throw new Error('KIE_API_KEY no configurada');

    const model = MUSIC_PROVIDERS.kie_music.model;

    // Igual que con el video: el `input` se arma con los campos que declara el
    // modelo, no por acumulación de alias. Mandar campos "por si acaso" fue lo
    // que rompió el Generador de Outros en v4.645 — KIE valida el input contra
    // el esquema y contesta "This field is required" sin decir cuál.
    const input = {
        prompt,
        instrumental: true,
        duration: Math.round(durationSec)
    };

    const resp = await fetch(`${KIE_API_BASE}/jobs/createTask`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input, metadata, ...(callbackUrl ? { callBackUrl: callbackUrl } : {}) })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || (data.code && data.code !== 200)) {
        const reason = data.msg || data.message || `HTTP ${resp.status} ${snippet(data)}`;
        throw new Error(`KIE música (${model}): ${reason} — campos enviados: ${Object.keys(input).join(', ')}`);
    }
    const taskId = data.task_id || data.data?.task_id || data.data?.taskId;
    if (!taskId) throw new Error(`KIE música devolvió sin task_id: ${snippet(data)}`);
    return taskId;
};

// Consulta el estado de una tarea de música. Misma superficie `/jobs/recordInfo`
// que usan el video y la imagen: el viejo `/jobs/getTaskDetail` da 404 en la
// versión actual de la API.
export const getKieMusicTask = async (taskId) => {
    const apiKey = process.env.KIE_API_KEY;
    const resp = await fetch(`${KIE_API_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(`KIE recordInfo (música) falló: HTTP ${resp.status} ${snippet(data)}`);
    if (data.code && data.code !== 200) throw new Error(`KIE recordInfo (música): ${data.msg || snippet(data)}`);

    const state = String(data.data?.state || data.state || '').toLowerCase();

    if (state === 'success' || state === 'completed') {
        let result = {};
        const rj = data.data?.resultJson ?? data.data?.result;
        if (typeof rj === 'string' && rj.length) { try { result = JSON.parse(rj); } catch { result = {}; } }
        else if (rj && typeof rj === 'object') result = rj;
        const output = data.data?.output || {};
        const candidate = Object.keys(result).length ? result : output;

        const urls = candidate.resultUrls || candidate.audio_urls || candidate.audioUrls
            || candidate.result_urls
            || (candidate.audio_url ? [candidate.audio_url] : null)
            || (candidate.audioUrl ? [candidate.audioUrl] : null)
            || (candidate.resultUrl ? [candidate.resultUrl] : null);
        const url = Array.isArray(urls) ? urls[0] : urls;
        if (!url) return { state: 'failed', url: null, failMsg: `KIE terminó sin URL de audio: ${snippet(data)}`, raw: data };
        return { state: 'success', url, failMsg: null, raw: data };
    }

    if (state === 'fail' || state === 'failed' || state === 'error') {
        return {
            state: 'failed', url: null,
            failMsg: data.data?.failMsg || data.data?.message || snippet(data),
            raw: data
        };
    }
    return { state: state === 'queuing' || state === 'queued' ? 'queued' : 'running', url: null, failMsg: null, raw: data };
};

// ─── ElevenLabs Music (principal) ──────────────────────────────────────────
//
// Síncrono: la petición devuelve el MP3. Sin tarea, sin sondeo, sin URL
// efímera que se caduque antes de copiarla.
//
// `music_length_ms` es lo que hace que la pista dure lo que tiene que durar. El
// rango que acepta el proveedor es 10 s a 5 min; se acota para no mandarle un
// valor que rechace y perder la generación por un redondeo.
const ELEVENLABS_MIN_MS = 10_000;
const ELEVENLABS_MAX_MS = 300_000;

const generateWithElevenLabs = async ({ prompt, durationSec }) => {
    const ms = Math.min(ELEVENLABS_MAX_MS, Math.max(ELEVENLABS_MIN_MS, Math.round(durationSec * 1000)));

    const resp = await fetch('https://api.elevenlabs.io/v1/music', {
        method: 'POST',
        headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg'
        },
        body: JSON.stringify({
            prompt,
            music_length_ms: ms,
            model_id: MUSIC_PROVIDERS.elevenlabs_music.model
        })
    });

    if (!resp.ok) {
        // El cuerpo del error viaja entero: es lo único que permite distinguir
        // "modelo renombrado" de "cuota agotada" sin desplegar nada.
        const body = await resp.text().catch(() => '');
        throw new Error(`ElevenLabs Music: HTTP ${resp.status} ${body.slice(0, 300)}`);
    }

    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.length < 2000) {
        throw new Error(`ElevenLabs Music devolvió un archivo vacío (${buffer.length} bytes).`);
    }
    return { buffer, contentType: 'audio/mpeg', extension: 'mp3' };
};

// ─── Stable Audio (respaldo) ───────────────────────────────────────────────
//
// También síncrono. Va en multipart porque la API de Stability lo exige incluso
// cuando no hay archivo que subir: mandarlo como JSON devuelve 400.
const generateWithStableAudio = async ({ prompt, durationSec }) => {
    const form = new FormData();
    form.append('prompt', prompt);
    // Stability acepta hasta 190 s. Nuestras piezas rondan los 17, pero se acota
    // igual: un valor fuera de rango tira toda la generación.
    form.append('duration', String(Math.min(190, Math.max(1, Math.round(durationSec)))));
    form.append('output_format', 'mp3');
    form.append('model', MUSIC_PROVIDERS.stable_audio.model);

    const resp = await fetch('https://api.stability.ai/v2beta/audio/stable-audio-2/text-to-audio', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.STABILITY_API_KEY}`,
            'Accept': 'audio/*'
        },
        body: form
    });

    if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new Error(`Stable Audio: HTTP ${resp.status} ${body.slice(0, 300)}`);
    }

    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.length < 2000) {
        throw new Error(`Stable Audio devolvió un archivo vacío (${buffer.length} bytes).`);
    }
    return { buffer, contentType: 'audio/mpeg', extension: 'mp3' };
};

const SYNC_ADAPTERS = {
    elevenlabs_music: generateWithElevenLabs,
    stable_audio: generateWithStableAudio
};

// ─── Biblioteca licenciada ─────────────────────────────────────────────────
//
// Busca en la Biblioteca multimedia una pista de audio cuyo nombre contenga el
// estilo. Es una convención de nombre a propósito: no agrega una tabla ni un
// campo nuevo para algo que el administrador resuelve subiendo el archivo con
// un nombre reconocible (`musica-institucional-01.mp3`).
const pickFromLibrary = async (style, clubId) => {
    const db = (await import('./db.js')).default;
    const { rows } = await db.query(
        `SELECT id, url, filename FROM "Media"
         WHERE type = 'audio'
           AND (lower(filename) LIKE $1 OR lower(filename) LIKE '%musica%')
           AND ("clubId" = $2 OR "clubId" IS NULL)
         ORDER BY (lower(filename) LIKE $1) DESC, "createdAt" DESC
         LIMIT 1`,
        [`%${style}%`, clubId || null]
    );
    return rows[0] || null;
};

// ─── API pública ───────────────────────────────────────────────────────────

// Genera la pista. Recorre la CADENA: si el principal falla, se intenta el
// siguiente ANTES de darle un error al usuario. Lo que se intentó viaja en
// `attempted` para que quede en el historial del proyecto — que ElevenLabs
// fallara y lo salvara Stable Audio es justo lo que hay que poder ver después.
//
// Devuelve una de tres formas, según el modo del proveedor que resolvió:
//   { state:'success', buffer }   — sync: el audio ya está, hay que subirlo
//   { state:'success', url }      — biblioteca: ya vive en S3
//   { state:'queued',  taskId }   — async: hay que sondear
export const startSoundtrack = async ({
    style = DEFAULT_MUSIC_STYLE,
    durationSec = 15,
    provider = null,
    clubId = null,
    callbackUrl = null,
    metadata = {}
} = {}) => {
    const styleSpec = MUSIC_STYLES[style] || MUSIC_STYLES[DEFAULT_MUSIC_STYLE];

    // La pista se pide un poco más larga que la pieza: que sobre música es
    // trivial de recortar en el montaje; que falte deja un silencio al final.
    const requested = Math.ceil(durationSec) + 3;

    // El prompt es lo que hace que dos Reels del mismo estilo no suenen igual:
    // describe el carácter, no una canción concreta. "instrumental" y "no
    // vocals" están en `MUSIC_STYLES.prompt` porque una voz cantando debajo de
    // una locución es lo peor que le puede pasar a esta pieza.
    const prompt = `${styleSpec.prompt}, around ${styleSpec.bpm} BPM, clean loopable ending, background music bed for a short institutional video`;

    // Proveedor pedido explícitamente: se usa ese y sólo ese. El usuario eligió.
    const chain = provider && isMusicProviderAvailable(provider) ? [provider] : musicChain();
    const attempted = [];

    for (const id of chain) {
        const spec = MUSIC_PROVIDERS[id];
        try {
            if (spec.mode === 'sync' && SYNC_ADAPTERS[id]) {
                const audio = await SYNC_ADAPTERS[id]({ prompt, durationSec: requested });
                if (attempted.length) console.warn(`[REEL] música: ${attempted.join(' | ')} — resuelto con ${id}`);
                console.log(`[REEL] música generada con ${id} (${style}, ~${requested}s, ${Math.round(audio.buffer.length / 1024)} kB)`);
                return {
                    provider: id, state: 'success', buffer: audio.buffer,
                    contentType: audio.contentType, extension: audio.extension,
                    url: null, taskId: null, style, prompt, requestedSec: requested, attempted
                };
            }
            if (spec.mode === 'async') {
                const taskId = await createKieMusicTask({ prompt, durationSec: requested, callbackUrl, metadata });
                return {
                    provider: id, state: 'queued', taskId, url: null, buffer: null,
                    style, prompt, requestedSec: requested, attempted
                };
            }
        } catch (e) {
            attempted.push(`${id}: ${e.message}`);
            console.error(`[REEL] música con ${id} falló:`, e.message);
        }
    }

    // Sin generativo, la biblioteca. Es la última red, no el primer recurso, y
    // va en try/catch: un fallo de la base no puede tumbar la generación de
    // música entera — como mucho deja el Reel sin pista, que ya se informa.
    let track = null;
    try {
        track = await pickFromLibrary(style, clubId);
    } catch (e) {
        attempted.push(`library: ${e.message}`);
        console.error('[REEL] música desde la Biblioteca falló:', e.message);
    }
    if (track) {
        return {
            provider: 'library', state: 'success', url: track.url, mediaId: track.id,
            buffer: null, taskId: null, style, prompt, requestedSec: requested, attempted
        };
    }

    // El Reel sale mudo. Es un resultado válido y se informa con el motivo
    // real: sin esto, "se montó sin música" no dice si falló algo o si nadie
    // configuró nada.
    return {
        provider: null, state: 'failed', url: null, buffer: null, taskId: null,
        style, prompt, requestedSec: requested, attempted,
        failMsg: attempted.length
            ? `Ningún proveedor de música pudo generar la pista — ${attempted.join(' | ')}`
            : 'No hay proveedor de música configurado ni pistas en la Biblioteca para este estilo.'
    };
};

export const pollSoundtrack = async (provider, taskId) => {
    if (provider !== 'kie_music') return { state: 'success', url: null, failMsg: null };
    return getKieMusicTask(taskId);
};

export const fetchAudioBuffer = async (url) => {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`No se pudo descargar la pista de audio (${resp.status})`);
    return Buffer.from(await resp.arrayBuffer());
};
