// ════════════════════════════════════════════════════════════════════
// El outro se PEGA sobre el Reel ya montado — v4.1245
//
// EL REPORTE
// ----------
// En rotary4281.org, «Volver a montar con el outro» terminaba en
// «Ningún proveedor de montaje pudo completar el Reel — ffmpeg: montaje del
// Reel: se agotó el tiempo (224s)». El Reel SIN outro estaba montado (18 s,
// 20,9 MB); poner el outro de 5,2 s rehacía la pieza ENTERA desde las
// escenas: cuatro clips de Kling, rótulos, música, voz con ducking y, por la
// memoria (v4.1051), en dos pasadas. Sobre el único vCPU que Vercel comparte
// con el resto del tráfico del sitio, eso no entra en el presupuesto.
//
// LO MEDIDO (1 núcleo, el mismo ffmpeg empaquetado)
// -------------------------------------------------
//   montaje completo de 4 escenas + outro + música + voz + rótulos   70 s
//   el mismo Reel ya montado + el outro, en una pasada                26 s
// En producción el primero pasó de 224 s; el segundo queda holgado.
//
// LA DECISIÓN
// -----------
// Cambiar el outro NO cambia nada de lo que va ANTES del outro. Así que el
// video montado sin outro se guarda como BASE (`config.base`) y poner,
// cambiar o ajustar el outro es una sola composición base + outro, con el
// compositor que ya existe y está probado para eso: el de «Outro sobre un
// video de la Biblioteca» (`libraryOutro.js`, v4.1039). No se escribe un
// segundo grafo de outro.
//
// LAS REGLAS
// ----------
//  1. LA BASE SE IDENTIFICA POR SU HUELLA (`baseMontageKey`): los clips, la
//     música, la voz y los rótulos — todo lo que va antes del outro. Si algo
//     de eso cambió, la base no sirve y se monta entero, como siempre.
//  2. UN MÁSTER MONTADO ANTES DE v4.1245 no tiene huella. Se acepta como base
//     sólo si su sello dice que NO lleva outro, si su duración medida es la
//     de las escenas, y si la locución vigente no es posterior al montaje.
//     Al usarlo, queda guardado como base con su huella: la próxima vez es
//     exacto.
//  3. QUITAR EL OUTRO, con la base al día, no codifica nada: la base vuelve a
//     ser el máster.
//  4. NADA DE ESTO REGENERA UNA ESCENA NI GASTA CRÉDITOS: es postproducción
//     de archivos que ya existen.
// ════════════════════════════════════════════════════════════════════

import path from 'path';
import { writeFile, readFile } from 'fs/promises';
import {
    planLibraryOutro, buildLibraryOutroGraph, buildLibraryOutroArgs, validateComposedOutro,
} from './libraryOutro.js';
import { probeMp4 } from './outroQuality.js';

export const OUTRO_APPEND_VERSION = '4.1245.0';

/** Cuánto puede apartarse la duración de un máster legado de la de sus escenas. */
export const LEGACY_BASE_TOLERANCE_SEC = 1.0;

const num = (v) => (v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
const r3 = (v) => Math.round(v * 1000) / 1000;

/**
 * La huella de TODO lo que va antes del outro. Dos montajes con la misma
 * huella producen la misma base, fotograma a fotograma.
 *
 * Lee el spec en las dos formas en que existe —el del montaje, con los
 * búferes de los rótulos, y el guardado en la fila, sin ellos— y por eso de
 * los rótulos toma sólo cuándo aparecen y qué dicen.
 */
export const baseMontageKey = (spec) => {
    if (!spec || !Array.isArray(spec.clips)) return null;
    const clips = spec.clips.filter((c) => !c?.isOutro);
    if (!clips.length) return null;
    return JSON.stringify({
        v: 1,
        w: spec.width ?? null, h: spec.height ?? null, fps: spec.fps ?? null,
        clips: clips.map((c) => [c.src || null, num(c.startAt) || 0, num(c.durationSec), c.transitionIn || null]),
        music: spec.soundtrack?.src ? [spec.soundtrack.src, num(spec.soundtrack.volume)] : null,
        voice: spec.voice?.src ? [spec.voice.src, num(spec.voice.leadIn) ?? 0, num(spec.voice.stretch) ?? 1] : null,
        text: (spec.textOverlays || []).map((o) => [num(o.startSec), num(o.endSec), o.text || null]),
    });
};

/** Lo que dura la pieza SIN el outro: el total menos lo que el outro aporta. */
export const baseTotalSec = (spec) => {
    const total = num(spec?.totalSec);
    if (total == null) return null;
    const outro = spec?.outro;
    if (!outro?.src) return total;
    const dur = num(outro.durationSec) || 0;
    const t = outro.transitionIn === 'cut' ? 0 : (num(outro.transitionSec) ?? 0);
    return r3(total - (dur - t));
};

/**
 * ¿Cómo se monta este spec? Devuelve `{ mode, base, reason }`:
 *
 *   · `append`  — hay una base al día: se pega el outro encima.
 *   · `restore` — el spec no lleva outro y la base al día ya ES la pieza.
 *   · `full`    — se monta entero, como siempre.
 *
 * `project` es la fila (`videoUrl`, `s3Key`, `durationSec`, `config`);
 * `narration` la locución vigente, o null.
 */
export const pickMontagePath = ({ spec, project, narration = null } = {}) => {
    const key = baseMontageKey(spec);
    if (!key) return { mode: 'full', base: null, reason: 'El spec no tiene escenas.' };
    const config = project?.config || {};
    const stored = config.base && typeof config.base === 'object' ? config.base : null;
    const hasOutro = Boolean(spec?.outro?.src);

    // 1. La base guardada, con su huella.
    if (stored?.url && stored.key === key) {
        if (!hasOutro) {
            if (project?.videoUrl && project.videoUrl === stored.url) {
                return { mode: 'full', base: null, reason: 'El máster ya es la base: no hay nada que restaurar.' };
            }
            return { mode: 'restore', base: { ...stored, source: 'base' }, reason: 'Sin outro, la base al día es la pieza.' };
        }
        return { mode: 'append', base: { ...stored, source: 'base' }, reason: 'Hay una base al día: se pega el outro encima.' };
    }

    if (!hasOutro) return { mode: 'full', base: null, reason: 'Sin outro y sin base al día.' };

    // 2. El máster actual, si él mismo es una base.
    const master = config.master && typeof config.master === 'object' ? config.master : null;
    if (!project?.videoUrl || !master?.stampedAt) {
        return { mode: 'full', base: null, reason: 'No hay un máster sellado que sirva de base.' };
    }
    if (master.outro?.src) {
        return { mode: 'full', base: null, reason: 'El máster actual ya lleva un outro: no sirve de base.' };
    }
    const fromMaster = {
        url: project.videoUrl, s3Key: project.s3Key || null,
        durationSec: num(project.durationSec) ?? num(master.durationSec),
        key, stampedAt: master.stampedAt,
    };
    if (master.baseKey) {
        return master.baseKey === key
            ? { mode: 'append', base: { ...fromMaster, source: 'master' }, reason: 'El máster sin outro es la base al día.' }
            : { mode: 'full', base: null, reason: 'Cambió algo antes del outro desde el último montaje.' };
    }

    // 3. Máster legado (antes de v4.1245): sin huella. Se corrobora.
    const esperado = baseTotalSec(spec);
    const medido = fromMaster.durationSec;
    if (esperado == null || medido == null || Math.abs(medido - esperado) > LEGACY_BASE_TOLERANCE_SEC) {
        return { mode: 'full', base: null, reason: `El máster dura ${medido ?? '?'} s y las escenas ${esperado ?? '?'} s: no se puede usar de base.` };
    }
    const vozEn = narration?.createdAt ? Date.parse(narration.createdAt) : null;
    const selloEn = Date.parse(master.stampedAt);
    if (vozEn && Number.isFinite(selloEn) && vozEn > selloEn) {
        return { mode: 'full', base: null, reason: 'La locución es posterior al último montaje.' };
    }
    return { mode: 'append', base: { ...fromMaster, source: 'legacy' }, reason: 'El máster sin outro (montado antes de v4.1245) sirve de base.' };
};

/**
 * Descarga con tope de tiempo (regla de v4.875): la misma forma que la del
 * montaje local, para que un origen que no responde no se coma el presupuesto.
 */
export const fetchBufferWithTimeout = (timeoutMs = Number(process.env.REEL_CLIP_FETCH_TIMEOUT_MS) || 45_000) => async (url, what) => {
    let resp;
    try {
        resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
        throw new Error(e?.name === 'TimeoutError'
            ? `No se pudo descargar ${what}: el origen no respondió en ${Math.round(timeoutMs / 1000)} s.`
            : `No se pudo descargar ${what}: ${e.message}`);
    }
    if (!resp.ok) throw new Error(`No se pudo descargar ${what} (${resp.status})`);
    return Buffer.from(await resp.arrayBuffer());
};

/** Lo que se guarda en `config.base`. */
export const baseRecord = ({ url, s3Key = null, probe = {}, key, stampedAt = new Date().toISOString() }) => ({
    url, s3Key,
    durationSec: num(probe.durationSec),
    width: num(probe.width), height: num(probe.height),
    hasAudio: probe.hasAudio === true,
    key, stampedAt,
});

/**
 * Pega el outro sobre la base, en UNA pasada. `fetchBuffer(url, qué)` es la
 * descarga con tope de tiempo del montaje (la misma regla de v4.875).
 *
 * Devuelve la forma de `composeReel` —`buffer`, `posterBuffer`,
 * `expectedDurationSec`, `hasMusic`, `notes`— para que la ingesta no
 * distinga un camino del otro.
 */
export const appendOutroToBase = async ({ baseUrl, outro, fetchBuffer, timeoutMs = 200_000 }) => {
    const { runFfmpeg, withTempDir, targetBitrate } = await import('./reelFfmpeg.js');
    const [baseBuf, outroBuf] = await Promise.all([
        fetchBuffer(baseUrl, 'el video base del Reel'),
        fetchBuffer(outro.src, 'el outro'),
    ]);
    const mainProbe = probeMp4(baseBuf);
    const outroProbe = probeMp4(outroBuf);
    if (mainProbe.parseError) throw new Error(`No se pudo leer el video base: ${mainProbe.parseError}`);
    if (outroProbe.parseError) throw new Error(`No se pudo leer el outro: ${outroProbe.parseError}`);

    const plan = planLibraryOutro({
        main: mainProbe,
        outro: { ...outroProbe, durationSec: outroProbe.durationSec || outro.durationSec },
        transitionType: outro.transitionIn || 'fade',
        transitionSec: outro.transitionSec,
        outroAudio: Boolean(outro.audioEnabled),
    });
    if (!plan.ok) throw new Error(plan.problems.join(' '));

    return withTempDir(async (dir) => {
        const mainPath = path.join(dir, 'base.mp4');
        const outroPath = path.join(dir, 'outro.mp4');
        const outPath = path.join(dir, 'reel.mp4');
        await writeFile(mainPath, baseBuf);
        await writeFile(outroPath, outroBuf);

        const graph = buildLibraryOutroGraph(plan);
        const args = buildLibraryOutroArgs({
            mainPath, outroPath, outputPath: outPath, plan, graph,
            bitrate: targetBitrate(plan.width, plan.height),
        });
        console.log(`[REEL/outro] base ${plan.mainDurationSec}s + outro ${plan.outroDurationSec}s − ${plan.transition.sec}s = ${plan.finalDurationSec}s · audio: ${plan.audio.mode}`);
        const empezo = Date.now();
        await runFfmpeg(args, { timeoutMs, label: 'outro sobre el Reel montado' });
        const segundos = Math.round((Date.now() - empezo) / 1000);

        const buffer = await readFile(outPath);
        const probe = probeMp4(buffer);
        const verdict = validateComposedOutro({ probe, plan });
        if (!verdict.ok) throw new Error(verdict.problems.join(' '));

        let posterBuffer = null;
        try {
            const poster = path.join(dir, 'poster.jpg');
            await runFfmpeg(['-y', '-ss', '1', '-i', outPath, '-frames:v', '1', '-q:v', '2', poster],
                { timeoutMs: 20_000, label: 'miniatura' });
            posterBuffer = await readFile(poster);
        } catch (e) {
            console.warn('[REEL/outro] no se pudo generar la miniatura:', e.message);
        }

        const notes = [
            `Outro pegado sobre el video ya montado en ${segundos} s (${plan.mainDurationSec} s + ${plan.outroDurationSec} s − ${plan.transition.sec} s de transición): no se volvió a montar ninguna escena.`,
            ...plan.warnings,
            ...verdict.warnings,
        ];
        if (plan.audio.mode === 'main_fade_out') {
            notes.push('El outro va sin su audio: la música del Reel se desvanece durante la transición.');
        }
        return {
            buffer, posterBuffer,
            expectedDurationSec: plan.finalDurationSec,
            hasMusic: plan.audio.mode !== 'none',
            notes,
            plan,
        };
    });
};

export default {
    OUTRO_APPEND_VERSION, LEGACY_BASE_TOLERANCE_SEC,
    baseMontageKey, baseTotalSec, pickMontagePath, baseRecord, appendOutroToBase, fetchBufferWithTimeout,
};
