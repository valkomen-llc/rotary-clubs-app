// ════════════════════════════════════════════════════════════════════
// Creador de Reels IA — banda sonora
// v4.663.0
//
// La música la elige el director a partir de lo que detecta en las fotos y se
// genera con un modelo generativo a través de KIE.AI, que ya es la pasarela de
// la plataforma: misma credencial, mismo endpoint `/jobs/createTask`, mismo
// patrón crear → sondear que usan el video y la imagen.
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
export const MUSIC_PROVIDERS = {
    kie_music: {
        id: 'kie_music',
        label: 'KIE.AI · música generativa',
        model: process.env.REEL_MUSIC_MODEL || 'suno/v5',
        envKey: 'KIE_API_KEY',
        instrumental: true,
        note: 'Genera una pista instrumental a medida del estilo detectado.'
    },
    library: {
        id: 'library',
        label: 'Biblioteca licenciada',
        envKey: null,
        note: 'Pistas cargadas en la Biblioteca multimedia, etiquetadas por estilo.'
    }
};

export const DEFAULT_MUSIC_PROVIDER =
    process.env.REEL_MUSIC_PROVIDER && MUSIC_PROVIDERS[process.env.REEL_MUSIC_PROVIDER]
        ? process.env.REEL_MUSIC_PROVIDER
        : 'kie_music';

export const isMusicProviderAvailable = (id) => {
    const p = MUSIC_PROVIDERS[id];
    if (!p) return false;
    if (!p.envKey) return true;
    return Boolean(process.env[p.envKey]);
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

// Lanza la generación de la pista. Devuelve inmediatamente: la espera la hace
// el sondeo, igual que con el video. Cuando el proveedor es la biblioteca,
// resuelve en el acto porque no hay nada que esperar.
export const startSoundtrack = async ({
    style = DEFAULT_MUSIC_STYLE,
    durationSec = 15,
    provider = null,
    clubId = null,
    callbackUrl = null,
    metadata = {}
} = {}) => {
    const styleSpec = MUSIC_STYLES[style] || MUSIC_STYLES[DEFAULT_MUSIC_STYLE];
    const chosen = provider && isMusicProviderAvailable(provider) ? provider : DEFAULT_MUSIC_PROVIDER;

    if (chosen === 'library' || !isMusicProviderAvailable('kie_music')) {
        const track = await pickFromLibrary(style, clubId);
        if (track) {
            return { provider: 'library', state: 'success', url: track.url, mediaId: track.id, style, taskId: null };
        }
        // Sin pista y sin modelo: el Reel sale mudo. Es un resultado válido y
        // se informa; no se cae el montaje por no tener música.
        return { provider: 'library', state: 'failed', url: null, taskId: null, style, failMsg: 'No hay pistas de audio en la Biblioteca para este estilo.' };
    }

    // La pista se pide un poco más larga que la pieza: que sobre música es
    // trivial de recortar en el montaje; que falte deja un silencio al final.
    const requested = Math.ceil(durationSec) + 3;
    const prompt = `${styleSpec.prompt}, around ${styleSpec.bpm} BPM, clean loopable ending`;

    const taskId = await createKieMusicTask({ prompt, durationSec: requested, callbackUrl, metadata });
    return { provider: 'kie_music', state: 'queued', url: null, taskId, style, prompt, requestedSec: requested };
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
