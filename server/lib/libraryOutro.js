/**
 * Outro sobre un video de la Biblioteca — el CRITERIO (v4.1039)
 * ==============================================================
 *
 * Un video que YA existe en la Biblioteca Multimedia —un Reel montado, un
 * MP4 subido— recibe uno de los outros guardados en la plataforma y sale una
 * NUEVA versión: `VIDEO EXISTENTE → OUTRO → TRANSICIÓN → COMPOSICIÓN FFMPEG →
 * VIDEO FINAL`. Este archivo decide cuánto dura la pieza, cómo se enganchan
 * los dos clips, qué se hace con cada pista de audio y cómo se llama y dónde
 * vive la versión. Es PURO: sin base, sin red, sin ffmpeg — lo que hace que se
 * pueda probar sin montar nada.
 *
 * Reglas que sostiene:
 *
 * - ES COMPOSICIÓN, NO GENERACIÓN. Ningún motor generativo participa: el video
 *   principal viaja con sus píxeles y su audio tal como están —música,
 *   locución y ambiente ya mezclados en el máster— y el outro entra con los
 *   suyos. Créditos: CERO, siempre (`credits: 0` en el plan, y una prueba lee
 *   el controlador para exigir que no importe el cliente de KIE).
 *
 * - EL VIDEO PRINCIPAL MANDA LA GEOMETRÍA. Resolución y fps son los del
 *   máster; el outro se conforma a ellos dentro del grafo —cover/crop al
 *   centro, sin bandas— exactamente como entra al montaje de un Reel (v4.1032).
 *
 * - LA TRANSICIÓN ES SUAVE POR CATÁLOGO y es el MISMO catálogo del outro de un
 *   Reel (`OUTRO_TRANSITIONS`): fundido, disolvencia o corte. Se acota a
 *   [0,3, 1,2] s y, además, a la MITAD del clip más corto: un `xfade` cuyo
 *   solapamiento supere a uno de los dos clips no tiene con qué solaparse.
 *
 * - LA DURACIÓN FINAL SE CALCULA, NUNCA SE TRUNCA: `main + outro − transición`.
 *   El outro se reproduce ENTERO, con su voz y su música completas.
 *
 * - EL AUDIO SE ANALIZA ANTES DE UNIR (con `probeMp4`, que lee el contenedor)
 *   y hay CUATRO escenarios declarados, no un solo grafo para todos:
 *     · los dos con audio → `acrossfade` lineal del largo de la transición:
 *       la cola del principal baja mientras la cabeza del outro sube, sin
 *       superposición seca ni salto de nivel;
 *     · sólo el principal → su pista se desvanece durante la transición y el
 *       tramo del outro queda en silencio (no se inventa nada);
 *     · sólo el outro → su pista entra con fundido y se DESPLAZA a su segundo,
 *       renumerada por muestras después de `adelay` (la lección de v4.1033);
 *     · ninguno → sin pista, `-an`.
 *   Con «corte directo» las pistas se concatenan sin cruce.
 *
 * - EL ORIGINAL NO SE TOCA. La versión es OTRO objeto de S3 con OTRA fila de
 *   `Media`; «Cambiar outro» vuelve a componer SIEMPRE desde el máster
 *   original (nunca desde una versión que ya lleva outro) y «Quitar outro»
 *   retira la versión sin reprocesar nada.
 */

import { OUTRO_TRANSITIONS, OUTRO_TRANSITION_SEC, OUTRO_MAX_SEC, OUTRO_MIN_SEC } from './reelOutro.js';

export const LIBRARY_OUTRO_VERSION = '4.1039.0';

// El video principal tiene un techo porque el montaje recodifica la pieza
// ENTERA (un `xfade` obliga a decodificar y volver a codificar los dos clips)
// y corre dentro de una función con presupuesto de tiempo: ~1× tiempo real
// sobre la vCPU. Es un techo del TRANSPORTE, no del criterio; `LIBRARY_OUTRO_MAX_MAIN_SEC`
// lo corrige por entorno.
export const MAX_MAIN_SEC = 180;
export const MAX_OUTRO_SEC = OUTRO_MAX_SEC;
export const MIN_OUTRO_SEC = OUTRO_MIN_SEC;
export const DEFAULT_FPS = 30;
// Tolerancia al validar la duración del archivo compuesto: el `xfade` cierra
// en un fotograma, y un contenedor declara la duración en su propia escala.
export const DURATION_TOLERANCE_SEC = 0.35;
// Cuánto puede costar la composición en /tmp: los dos clips de entrada más el
// resultado, que se estima con la tasa del principal (o 10 Mbps si no se sabe).
export const TMP_BUDGET_BYTES = 450 * 1024 * 1024;
export const OUTPUT_FACTOR = 1.15;
export const FALLBACK_BITRATE_BPS = 10_000_000;

export const COMPOSITION_STATUSES = {
    processing: { id: 'processing', label: 'Componiendo…' },
    ready: { id: 'ready', label: 'Listo para publicar' },
    failed: { id: 'failed', label: 'La composición falló' },
    removed: { id: 'removed', label: 'Outro quitado' }
};

export const AUDIO_MODES = {
    crossfade: { id: 'crossfade', label: 'Cruce suave entre el audio del video y el del outro' },
    concat: { id: 'concat', label: 'El audio del outro sigue al del video, sin cruce' },
    main_fade_out: { id: 'main_fade_out', label: 'El audio del video se desvanece; el outro va en silencio' },
    outro_fade_in: { id: 'outro_fade_in', label: 'El video es mudo; el audio del outro entra con fundido' },
    none: { id: 'none', label: 'Sin pista de audio' }
};

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round3 = (v) => Number(Number(v).toFixed(3));

// Nombre del efecto para ffmpeg. Lo que no está en el catálogo cae al fundido,
// que es el neutro — un efecto parecido pero distinto sería peor.
const XFADE_OF = { fade: 'fade', dissolve: 'dissolve', none: null };

/** El catálogo que ofrece la pantalla, resuelto acá para no escribirlo dos veces. */
export const transitionOptions = () => Object.values(OUTRO_TRANSITIONS).map(t => ({
    id: t.id, label: t.label, description: t.description, isDefault: Boolean(t.isDefault)
}));

/**
 * Normaliza la transición pedida. `cut` es 0 s; lo demás se acota al rango
 * del catálogo. El tope extra por la duración de los clips se aplica en el
 * plan, que es donde se conocen.
 */
export const normalizeTransition = ({ transitionType, transitionSec } = {}) => {
    const type = OUTRO_TRANSITIONS[transitionType] ? transitionType : 'fade';
    if (type === 'cut') return { type, sec: 0, ffmpeg: null };
    const requested = num(transitionSec) ?? OUTRO_TRANSITION_SEC.default;
    const sec = Number(clamp(requested, OUTRO_TRANSITION_SEC.min, OUTRO_TRANSITION_SEC.max).toFixed(2));
    const provider = OUTRO_TRANSITIONS[type].provider;
    return { type, sec, ffmpeg: XFADE_OF[provider] || 'fade' };
};

/**
 * El PLAN de la composición. Recibe lo MEDIDO de los dos archivos —lo que
 * `probeMp4` dijo: duración, medidas, fps, si traen audio— y devuelve todo lo
 * que hace falta para montar: la duración final, dónde arranca el outro, qué
 * geometría se usa y qué se hace con el audio. `ok: false` con sus `problems`
 * cuando no se puede montar; `warnings` son avisos que no bloquean.
 */
export const planLibraryOutro = ({ main = {}, outro = {}, transitionType, transitionSec, outroAudio = true, maxMainSec = MAX_MAIN_SEC } = {}) => {
    const problems = [];
    const warnings = [];

    const mainSec = num(main.durationSec);
    const outroSec = num(outro.durationSec);
    if (!mainSec || mainSec <= 0) problems.push('No se pudo medir la duración del video principal.');
    if (!outroSec || outroSec <= 0) problems.push('No se pudo medir la duración del outro.');
    if (mainSec && mainSec > maxMainSec) {
        problems.push(`El video principal dura ${Math.round(mainSec)} s y el máximo para componer con outro es ${maxMainSec} s: la composición recodifica la pieza entera y no entra en el tiempo de procesamiento.`);
    }
    if (outroSec && outroSec > MAX_OUTRO_SEC) problems.push(`El outro dura ${outroSec} s y el máximo es ${MAX_OUTRO_SEC} s.`);
    if (outroSec && outroSec < MIN_OUTRO_SEC) problems.push(`El outro dura ${outroSec} s: demasiado corto para un cierre.`);

    const width = num(main.width) && main.width > 0 ? Math.round(main.width) : null;
    const height = num(main.height) && main.height > 0 ? Math.round(main.height) : null;
    if (!width || !height) problems.push('No se pudo leer la resolución del video principal.');
    // fps: el del máster, redondeado; sin medida, 30. Un fps fraccionario
    // (29,97) se conserva como está — forzar 30 duplicaría fotogramas (v4.716).
    const fpsRaw = num(main.fps);
    const fps = fpsRaw && fpsRaw > 1 && fpsRaw <= 120 ? Number(fpsRaw.toFixed(3)) : DEFAULT_FPS;

    let transition = normalizeTransition({ transitionType, transitionSec });
    if (mainSec && outroSec && transition.sec > 0) {
        const cap = Number((Math.min(mainSec, outroSec) / 2).toFixed(2));
        if (transition.sec > cap) {
            const capped = Math.max(0, cap);
            warnings.push(`La transición se acotó a ${capped} s: no puede superar la mitad del clip más corto.`);
            transition = { ...transition, sec: capped };
            if (capped === 0) transition = { type: 'cut', sec: 0, ffmpeg: null };
        }
    }

    const mainHasAudio = main.hasAudio === true;
    const outroHasAudio = outro.hasAudio === true && outroAudio !== false;
    if (outro.hasAudio === true && outroAudio === false) warnings.push('El outro trae audio y se pidió mudo: irá sin su pista.');
    let audioMode = 'none';
    if (mainHasAudio && outroHasAudio) audioMode = transition.sec > 0 ? 'crossfade' : 'concat';
    else if (mainHasAudio) audioMode = 'main_fade_out';
    else if (outroHasAudio) audioMode = 'outro_fade_in';

    if (width && height && num(outro.width) && num(outro.height)) {
        const ar = (w, h) => Number((w / h).toFixed(3));
        if (Math.abs(ar(width, height) - ar(outro.width, outro.height)) > 0.02) {
            warnings.push(`El outro (${outro.width}×${outro.height}) no tiene la proporción del video (${width}×${height}): se escala y se recorta al centro, sin bandas.`);
        }
    }

    const finalDurationSec = mainSec && outroSec ? round3(mainSec + outroSec - transition.sec) : null;
    const outroStartSec = mainSec ? round3(mainSec - transition.sec) : null;

    return {
        ok: problems.length === 0,
        problems,
        warnings,
        transition,
        mainDurationSec: mainSec ? round3(mainSec) : null,
        outroDurationSec: outroSec ? round3(outroSec) : null,
        finalDurationSec,
        outroStartSec,
        width, height, fps,
        audio: { mode: audioMode, label: AUDIO_MODES[audioMode].label, mainHasAudio, outroHasAudio: outro.hasAudio === true, outroAudioUsed: outroHasAudio },
        // Composición, no generación: ningún crédito de ningún proveedor.
        credits: 0
    };
};

// El mismo formato de audio que el compositor de Reels: 48 kHz estéreo en
// coma flotante, que es lo que los filtros de cruce y de fundido esperan.
export const AFORMAT = 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo';

/**
 * El grafo de filtros. Entrada 0 = el video principal, entrada 1 = el outro.
 * Devuelve `{ filter, videoLabel, audioLabel }`; `audioLabel` es null cuando
 * la pieza sale sin pista.
 */
export const buildLibraryOutroGraph = (plan) => {
    if (!plan?.ok) throw new Error('No hay plan válido para componer.');
    const { width, height, fps, transition } = plan;
    const M = plan.mainDurationSec;
    const O = plan.outroDurationSec;
    const T = transition.sec;
    const total = plan.finalDurationSec;
    const parts = [];

    // Cada entrada se conforma primero (v4.671): escala cover, recorte al
    // centro, fps y formato de píxel. `setsar=1` para que un píxel no cuadrado
    // no desalinee el cruce.
    const conform = (i, dur) => `[${i}:v]trim=duration=${dur},setpts=PTS-STARTPTS,` +
        `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},` +
        `fps=${fps},setsar=1,format=yuv420p[v${i}]`;
    parts.push(conform(0, M), conform(1, O));

    if (transition.ffmpeg && T > 0) {
        parts.push(`[v0][v1]xfade=transition=${transition.ffmpeg}:duration=${T}:offset=${round3(M - T)}[vout]`);
    } else {
        parts.push(`[v0][v1]concat=n=2:v=1:a=0[vout]`);
    }

    let audioLabel = null;
    const mode = plan.audio.mode;
    // Cada pista se lleva primero a la duración EXACTA de su video (`apad` +
    // `atrim`): una pista más corta que su imagen —el desfase normal de un
    // AAC— adelantaría el cruce respecto del fundido de la imagen.
    const mainTrack = `[0:a]${AFORMAT},apad,atrim=0:${M},asetpts=PTS-STARTPTS`;
    const outroTrack = `[1:a]${AFORMAT},apad,atrim=0:${O},asetpts=PTS-STARTPTS`;
    const close = `apad,atrim=0:${total},asetpts=PTS-STARTPTS[aout]`;

    if (mode === 'crossfade') {
        // `tri`/`tri`: las dos rampas son lineales y suman una ganancia
        // constante durante el cruce — no hay hueco de nivel en el medio ni
        // saturación en la suma. Es el equivalente en audio del `xfade`.
        parts.push(`${mainTrack}[a0]`, `${outroTrack}[a1]`,
            `[a0][a1]acrossfade=d=${T}:c1=tri:c2=tri,${close}`);
        audioLabel = 'aout';
    } else if (mode === 'concat') {
        parts.push(`${mainTrack}[a0]`, `${outroTrack}[a1]`, `[a0][a1]concat=n=2:v=0:a=1,${close}`);
        audioLabel = 'aout';
    } else if (mode === 'main_fade_out') {
        // El principal se desvanece durante la transición; después, silencio
        // (`apad`) hasta el final de la pieza. No se le inventa audio al outro.
        const fade = T > 0 ? `afade=t=out:st=${round3(M - T)}:d=${T},` : '';
        parts.push(`${mainTrack},${fade}${close}`);
        audioLabel = 'aout';
    } else if (mode === 'outro_fade_in') {
        // La pista del outro entra con fundido del largo de la transición y se
        // desplaza a su segundo. `asetpts=N/SR/TB` DESPUÉS de `adelay`: `atrim`
        // recorta por marcas de tiempo y las marcas de una pista desplazada
        // sin renumerar dejan la cola fuera (medido en v4.1033).
        const delayMs = Math.round(round3(M - T) * 1000);
        const fade = T > 0 ? `afade=t=in:st=0:d=${T},` : '';
        parts.push(`${outroTrack},${fade}adelay=${delayMs}|${delayMs},asetpts=N/SR/TB,${close}`);
        audioLabel = 'aout';
    }

    return { filter: parts.join(';'), videoLabel: 'vout', audioLabel };
};

/**
 * Los argumentos de ffmpeg. Los mismos ajustes de códec del compositor de
 * Reels —x264 `veryfast`, perfil high, keyframe cada 2 s, AAC 192k,
 * `+faststart`— para que la versión con outro se publique igual que el
 * máster. SIN `-shortest`: la duración la sostiene el grafo (v4.674).
 */
export const buildLibraryOutroArgs = ({ mainPath, outroPath, outputPath, plan, graph, bitrate }) => {
    const br = bitrate || { v: '10M', max: '12M', buf: '20M' };
    const fps = plan.fps;
    return [
        '-y', '-i', mainPath, '-i', outroPath,
        '-filter_complex', graph.filter,
        '-map', `[${graph.videoLabel}]`,
        ...(graph.audioLabel ? ['-map', `[${graph.audioLabel}]`] : []),
        '-c:v', 'libx264', '-preset', 'veryfast',
        '-profile:v', 'high', '-level', '4.2',
        '-b:v', br.v, '-maxrate', br.max, '-bufsize', br.buf,
        '-pix_fmt', 'yuv420p',
        '-r', String(fps),
        '-g', String(Math.round(fps * 2)),
        ...(graph.audioLabel ? ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2'] : ['-an']),
        '-movflags', '+faststart',
        outputPath
    ];
};

/**
 * Qué cabe en /tmp. Los dos clips se bajan y el resultado se escribe ahí:
 * el presupuesto se comprueba ANTES de bajar nada, con lo que se sabe de los
 * archivos (su peso y su duración). Rechazar con el número es mejor que un
 * ENOSPC a mitad de proceso (la lección de v4.935).
 */
export const compositionBudget = ({ mainBytes, outroBytes, mainDurationSec, finalDurationSec, budgetBytes = TMP_BUDGET_BYTES } = {}) => {
    const mb = num(mainBytes) || 0;
    const ob = num(outroBytes) || 0;
    const mSec = num(mainDurationSec);
    const fSec = num(finalDurationSec) || mSec;
    const bps = mb > 0 && mSec > 0 ? (mb * 8) / mSec : FALLBACK_BITRATE_BPS;
    const outBytes = Math.ceil(((Math.max(bps, 1) * (fSec || 0)) / 8) * OUTPUT_FACTOR);
    const needBytes = mb + ob + outBytes;
    const ok = needBytes <= budgetBytes;
    const mbOf = (n) => Math.round(n / 1024 / 1024);
    return {
        ok, needBytes, outBytes, budgetBytes,
        reason: ok ? null : `Hacen falta ~${mbOf(needBytes)} MB de espacio temporal (video ${mbOf(mb)} MB + outro ${mbOf(ob)} MB + resultado ~${mbOf(outBytes)} MB) y el presupuesto es ${mbOf(budgetBytes)} MB.`
    };
};

/**
 * El archivo compuesto contra el plan. Lee el contenedor (lo que da
 * `probeMp4`); no decodifica. Problemas = no se entrega; avisos = se dice.
 */
export const validateComposedOutro = ({ probe, plan } = {}) => {
    const problems = [];
    const warnings = [];
    if (!probe || probe.parseError) problems.push(probe?.parseError || 'No se pudo leer el archivo compuesto.');
    else {
        if (!probe.hasMoov) problems.push('El archivo compuesto no tiene cabecera: salió incompleto.');
        if (probe.truncated) problems.push('El archivo compuesto está truncado.');
        const dur = num(probe.durationSec);
        if (!dur) problems.push('El archivo compuesto no declara duración.');
        else if (Math.abs(dur - plan.finalDurationSec) > DURATION_TOLERANCE_SEC) {
            problems.push(`La duración salió ${dur} s y se esperaban ${plan.finalDurationSec} s: el outro habría quedado cortado.`);
        }
        const wantsAudio = plan.audio.mode !== 'none';
        if (wantsAudio && !probe.hasAudio) problems.push('La pieza tenía que llevar audio y salió muda.');
        if (!wantsAudio && probe.hasAudio) warnings.push('La pieza salió con pista de audio aunque ninguna entrada la traía.');
        if (probe.width && plan.width && (probe.width !== plan.width || probe.height !== plan.height)) {
            problems.push(`La resolución salió ${probe.width}×${probe.height} y se esperaba ${plan.width}×${plan.height}.`);
        }
        if (probe.hasAudio && num(probe.audioDriftSec) > 0.5) warnings.push(`El audio dura ${probe.audioDriftSec} s distinto que la imagen.`);
    }
    return { ok: problems.length === 0, problems, warnings };
};

// ─── Nombres ─────────────────────────────────────────────────────────────

const stemOf = (name) => {
    const base = String(name || '').split('/').pop() || 'video';
    const dot = base.lastIndexOf('.');
    return dot > 0 ? base.slice(0, dot) : base;
};

/**
 * La clave de S3 de la versión: en una carpeta hermana `outro-versions/` del
 * original, con el id de la composición al final. Un id por versión = una
 * clave por versión: «Cambiar outro» sobrescribe ESA clave (la URL de la
 * versión no cambia) y nunca la del original.
 */
export const versionKeyFor = (originalKey, compositionId) => {
    if (!originalKey || !compositionId) return null;
    const parts = String(originalKey).split('/');
    const file = parts.pop();
    const dir = parts.join('/');
    const short = String(compositionId).replace(/-/g, '').slice(0, 10) || 'v';
    const stem = stemOf(file).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'video';
    return `${dir ? `${dir}/` : ''}outro-versions/${stem}-outro-${short}.mp4`;
};

/** «Reel – Entrega de 117 prendas» + «Outro Rotary» → «Reel – Entrega… + Outro Rotary.mp4». */
export const versionFilenameFor = (originalFilename, outroTitle) => {
    const stem = stemOf(originalFilename).trim() || 'Video';
    const title = String(outroTitle || '').trim().replace(/\.(mp4|mov|m4v|webm)$/i, '');
    const label = title ? `Outro ${title}` : 'Outro';
    return `${stem} + ${label}`.slice(0, 180) + '.mp4';
};

// ─── Qué se guarda y qué se pinta ─────────────────────────────────────────

/** Lo que llega del navegador, a la forma que se guarda. */
export const normalizeOutroRequest = (raw = {}) => {
    const outroId = typeof raw.outroId === 'string' && raw.outroId.trim() ? raw.outroId.trim() : null;
    const outroMediaId = typeof raw.outroMediaId === 'string' && raw.outroMediaId.trim() ? raw.outroMediaId.trim() : null;
    const t = normalizeTransition({ transitionType: raw.transitionType, transitionSec: raw.transitionSec });
    return {
        outroId, outroMediaId,
        transitionType: t.type,
        transitionSec: t.sec,
        outroAudio: raw.outroAudio === false ? false : true,
        problems: !outroId && !outroMediaId ? ['Falta el outro: elegí uno de los outros guardados.'] : []
    };
};

/**
 * La ficha de una composición, RESUELTA para la pantalla: la pantalla pinta,
 * no decide. `original` y `version` son las filas de `Media` (o null).
 */
export const compositionView = (row, { original = null, version = null } = {}) => {
    if (!row) return null;
    const status = COMPOSITION_STATUSES[row.status] ? row.status : 'failed';
    const plan = row.plan && typeof row.plan === 'object' ? row.plan : {};
    return {
        id: row.id,
        status,
        statusLabel: status === 'ready' ? 'Listo para publicar' : COMPOSITION_STATUSES[status].label,
        statusDetail: row.statusDetail || null,
        originalMediaId: row.originalMediaId,
        original: original ? { id: original.id, filename: original.filename, url: original.url, thumbUrl: original.thumbUrl || null } : null,
        versionMediaId: row.versionMediaId || null,
        version: version ? { id: version.id, filename: version.filename, url: version.url, size: version.size ?? null, folderId: version.folderId ?? null } : null,
        outro: {
            id: row.outroId || null,
            mediaId: row.outroMediaId || null,
            url: row.outroUrl || null,
            title: row.outroTitle || null,
            posterUrl: plan.outroPosterUrl || null,
            durationSec: num(row.outroDurationSec),
            hasAudio: plan.audio?.outroHasAudio === true
        },
        transitionType: row.transitionType || 'fade',
        transitionLabel: OUTRO_TRANSITIONS[row.transitionType]?.label || OUTRO_TRANSITIONS.fade.label,
        transitionSec: num(row.transitionSec) ?? 0,
        originalDurationSec: num(row.originalDurationSec),
        finalDurationSec: num(row.finalDurationSec),
        audioMode: plan.audio?.mode || null,
        audioLabel: AUDIO_MODES[plan.audio?.mode]?.label || null,
        warnings: Array.isArray(row.report?.warnings) ? row.report.warnings : [],
        credits: 0,
        composedAt: row.composedAt || null,
        createdAt: row.createdAt || null,
        updatedAt: row.updatedAt || null
    };
};

// El reclamo: una composición «procesando» de hace más de esto se da por
// muerta y deja pasar a la siguiente (la ventana de `Media.trim`).
export const PROCESSING_STALE_MS = 10 * 60 * 1000;
export const processingIsStale = (row, nowMs = Date.now()) => {
    if (!row || row.status !== 'processing') return true;
    const at = row.updatedAt ? new Date(row.updatedAt).getTime() : NaN;
    return !Number.isFinite(at) || nowMs - at > PROCESSING_STALE_MS;
};
