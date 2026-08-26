// ════════════════════════════════════════════════════════════════════
// Recorte de videos de la Biblioteca Multimedia — EL CRITERIO
// v4.934.0
//
// PURO a propósito: sin base, sin S3, sin ffmpeg, sin red. Acá vive todo lo
// que se puede decidir mirando números y nombres —qué rango es válido, qué
// contenedor se puede recortar, con qué argumentos se corta, qué archivo
// procesado se acepta y cómo queda anotada la auditoría—, separado de la
// orquestación por el mismo motivo que `mediaThumbs.js` y `seoRules.js`: lo
// que sólo se prueba contra un bucket y un binario reales termina sin pruebas.
//
// LA DECISIÓN DE LA QUE CUELGA TODO: el recorte NO crea un archivo nuevo con
// URL nueva. Se procesa a un temporal, se VALIDA, se guarda una copia del
// archivo vigente en la carpeta hermana `pretrim/` (mismo patrón que
// `thumbs/`) y recién entonces se sobrescribe el objeto de S3 EN SU MISMA
// CLAVE. La URL pública de un `Media` se deriva de esa clave, así que el
// enlace que ya circula en campañas, correos y páginas sigue funcionando y
// pasa a servir la versión recortada. Si cualquier paso previo falla, el
// original queda intacto: nunca puede quedar la fila apuntando a un archivo
// corrupto.
//
// NO contradice la regla #1 del sitio («no postprocesar el output del
// modelo»): aquélla prohíbe retocar lo que devuelve un motor GENERATIVO. Acá
// no hay modelo: es una edición DECLARADA que pide una persona sobre su
// propio archivo — la misma categoría que el montaje del Creador de Reels.
// ════════════════════════════════════════════════════════════════════

// El resultado no puede quedar más corto que esto: un video de menos de un
// segundo no es un video, es un error de dedo en los controles.
export const MIN_RESULT_SEC = 1;

// Cuánto tiene que quitar el recorte para ser un recorte. Sin este umbral,
// «Aplicar» con los controles sin tocar procesaría el archivo entero para
// dejarlo igual — gastando tiempo de función y una generación del historial.
export const CUT_EPSILON_SEC = 0.05;

// Tolerancias de la validación, POR MODO. El corte sin recomprimir (`copy`)
// termina en el límite de paquete/keyframe anterior al punto pedido, así que
// puede quedarse corto hasta un GOP (~2 s en un video típico); el recodificado
// corta en el fotograma exacto. Validar el copy con la tolerancia estricta
// rechazaría cortes perfectamente buenos; validar el reencode con la laxa
// dejaría pasar un corte errado.
export const COPY_TOLERANCE_SEC = 3;
export const REENCODE_TOLERANCE_SEC = 0.75;

/**
 * Qué se puede hacer con este archivo, decidido por su EXTENSIÓN.
 *
 * - `.mp4` / `.m4v` / `.mov` son la familia MP4/QuickTime: se recortan con
 *   corte limpio o recodificando, y `probeMp4` sabe leer su contenedor para
 *   validar el resultado antes de reemplazar nada.
 * - `.webm` se acepta SOLO para recortar el final con corte limpio: el binario
 *   empaquetado recodifica VP9 tan lento que no entra en el presupuesto de la
 *   función, y `probeMp4` no lee ese contenedor — la validación es más débil y
 *   se declara (`probeable: false`), no se finge.
 * - Cualquier otra cosa se rechaza con su motivo, en vez de dejar que ffmpeg
 *   falle con un mensaje que no explica qué hacer.
 */
export const trimSupport = (filename) => {
    const name = String(filename || '').toLowerCase();
    if (/\.(mp4|m4v)$/.test(name)) {
        return { ok: true, container: 'mp4', format: 'mp4', probeable: true, reencodable: true };
    }
    if (/\.mov$/.test(name)) {
        return { ok: true, container: 'mov', format: 'mov', probeable: true, reencodable: true };
    }
    if (/\.webm$/.test(name)) {
        return { ok: true, container: 'webm', format: 'webm', probeable: false, reencodable: false };
    }
    return {
        ok: false, container: null, format: null, probeable: false, reencodable: false,
        reason: 'Este formato de video no se puede recortar todavía. Los soportados son MP4, MOV y WebM.'
    };
};

/** El Content-Type con el que se vuelve a subir el archivo recortado. */
export const contentTypeFor = (filename) => {
    const name = String(filename || '').toLowerCase();
    if (name.endsWith('.mov')) return 'video/quicktime';
    if (name.endsWith('.webm')) return 'video/webm';
    return 'video/mp4';
};

/**
 * «02:47» → segundos. Acepta `SS`, `MM:SS` y `HH:MM:SS`, con decimales en el
 * último tramo. Devuelve null ante cualquier cosa que no sea un tiempo: null
 * y no 0, porque 0 es un tiempo válido y confundirlos movería el corte al
 * principio del video sin que nadie lo pidiera.
 */
export const parseTimecode = (input) => {
    const text = String(input ?? '').trim();
    if (!text) return null;
    if (!/^\d+(?::\d{1,2}){0,2}(?:[.,]\d+)?$/.test(text)) return null;
    const parts = text.replace(',', '.').split(':').map(Number);
    if (parts.some(n => !Number.isFinite(n) || n < 0)) return null;
    // Con dos puntos, los tramos que no van primeros tienen que ser < 60.
    if (parts.length > 1 && parts.slice(1).some(n => n >= 60)) return null;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
};

/** Segundos → «MM:SS» (u «H:MM:SS» pasada la hora), para pintar. */
export const formatTimecode = (sec) => {
    const s = Math.max(0, Number(sec) || 0);
    const whole = Math.floor(s);
    const hh = Math.floor(whole / 3600);
    const mm = Math.floor((whole % 3600) / 60);
    const ss = whole % 60;
    const two = (n) => String(n).padStart(2, '0');
    return hh > 0 ? `${hh}:${two(mm)}:${two(ss)}` : `${two(mm)}:${two(ss)}`;
};

/**
 * El rango que se quiere CONSERVAR, validado contra la duración real.
 *
 * La duración es OBLIGATORIA y viene del archivo (probeMp4) o, si el
 * contenedor no se sabe leer, de los metadatos que midió el reproductor.
 * Sin ella no se puede saber si el corte quita algo ni si el final pedido
 * existe. `end` que se pasa apenas de la duración se ACOTA en vez de
 * rechazarse: los metadatos redondean y «03:20» sobre un video de 199,96 s
 * no es un error de la persona.
 */
export const validateTrimRange = ({ startSec, endSec, durationSec } = {}) => {
    const start = Number(startSec);
    let end = Number(endSec);
    const duration = Number(durationSec);

    if (!Number.isFinite(duration) || duration <= 0) {
        return { ok: false, error: 'No se pudo determinar la duración del video.' };
    }
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
        return { ok: false, error: 'El inicio y el final tienen que ser tiempos válidos.' };
    }
    if (start < 0) return { ok: false, error: 'El inicio no puede ser negativo.' };
    if (end > duration + 0.5) {
        return { ok: false, error: `El final (${formatTimecode(end)}) queda después de que el video termina (${formatTimecode(duration)}).` };
    }
    end = Math.min(end, duration);
    if (end <= start) return { ok: false, error: 'El final tiene que quedar después del inicio.' };
    if (end - start < MIN_RESULT_SEC) {
        return { ok: false, error: `El fragmento a conservar tiene que durar al menos ${MIN_RESULT_SEC} segundo.` };
    }
    if (start <= CUT_EPSILON_SEC && end >= duration - CUT_EPSILON_SEC) {
        return { ok: false, error: 'El rango elegido es el video completo: no hay nada que recortar.' };
    }
    const r = (n) => Math.round(n * 1000) / 1000;
    return { ok: true, startSec: r(Math.max(0, start)), endSec: r(end), error: null };
};

/**
 * En qué orden se intenta el corte. Cada intento se procesa, se mide y sólo
 * el primero que VALIDA reemplaza el archivo; el siguiente es el respaldo.
 *
 * - Inicio en 0 → primero `copy` (sin recomprimir: cero pérdida de
 *   generación y segundos en vez de minutos) y `reencode` de respaldo.
 * - Inicio > 0 → directamente `reencode`: con `copy`, el corte de entrada
 *   salta al keyframe anterior y el video arranca donde no se pidió.
 * - Un `.webm` no es recodificable acá, así que con inicio > 0 no hay ningún
 *   intento posible y se dice por qué.
 */
export const planTrim = ({ startSec, support } = {}) => {
    const s = support || {};
    if (!s.ok) return { attempts: [], reason: s.reason || 'Formato no soportado.' };
    const fromStart = Number(startSec) <= CUT_EPSILON_SEC;
    const attempts = [];
    if (fromStart) attempts.push('copy');
    if (s.reencodable) attempts.push('reencode');
    if (!attempts.length) {
        return {
            attempts: [],
            reason: 'Un WebM sólo se puede recortar desde el principio (quitar el final). Para mover el inicio, convertí el video a MP4 primero.'
        };
    }
    return { attempts, reason: null };
};

/**
 * Los argumentos de ffmpeg de un intento. Siempre en array —nunca shell—,
 * como todo ffmpeg del sitio.
 *
 * `copy`: `-t` corta la salida en el punto pedido sin decodificar nada; los
 * bytes del video viajan intactos (resolución, fps, audio y calidad quedan
 * EXACTOS porque son los mismos bytes). Sólo se usa con inicio 0.
 *
 * `reencode`: `-ss` va ANTES de `-i` y con recodificación es EXACTO — ffmpeg
 * decodifica desde el keyframe y descarta hasta el punto pedido—. H.264 +
 * AAC + `yuv420p` es el trío que reproducen Chrome, Safari, Firefox y los
 * móviles; sin filtros de escala, así la resolución, la orientación y el
 * frame rate quedan los del original.
 *
 * `+faststart` en la familia MP4 mueve la cabecera al principio: es lo que
 * hace que el video arranque sin descargarse entero, que es como se consume
 * un enlace compartido en una campaña.
 */
export const buildTrimArgs = ({ mode, format, input, output, startSec, endSec }) => {
    const dur = String(Math.round((endSec - startSec) * 1000) / 1000);
    const fast = (format === 'mp4' || format === 'mov') ? ['-movflags', '+faststart'] : [];
    if (mode === 'copy') {
        return ['-y', '-i', input, '-t', dur, '-c', 'copy', ...fast, '-f', format, output];
    }
    return [
        '-y', '-ss', String(startSec), '-i', input, '-t', dur,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '160k',
        ...fast, '-f', format, output
    ];
};

/**
 * Si el archivo procesado se puede aceptar. ESTA es la puerta que hace que el
 * original nunca se reemplace por algo corrupto: se mira el contenedor del
 * resultado (probeMp4 — cabecera, truncamiento, pista de video y duración)
 * ANTES de tocar S3.
 *
 * Un contenedor que no se sabe leer (`probeable: false`, hoy WebM) sólo se
 * comprueba por tamaño, y eso se DECLARA en `weak` en vez de fingirse una
 * validación que no ocurrió.
 */
export const validateTrimmedFile = ({ probe, expectedSec, mode, probeable, sizeBytes } = {}) => {
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
        return { ok: false, weak: false, reason: 'El archivo procesado quedó vacío.' };
    }
    if (!probeable) return { ok: true, weak: true, reason: null };
    if (!probe || probe.parseError) {
        return { ok: false, weak: false, reason: probe?.parseError || 'No se pudo leer el archivo procesado.' };
    }
    if (!probe.hasMoov || probe.truncated) {
        return { ok: false, weak: false, reason: 'El archivo procesado quedó incompleto.' };
    }
    if (!probe.videoCodec) {
        return { ok: false, weak: false, reason: 'El archivo procesado no tiene pista de video.' };
    }
    if (!Number.isFinite(probe.durationSec) || probe.durationSec <= 0) {
        return { ok: false, weak: false, reason: 'El archivo procesado no declara duración.' };
    }
    const tolerance = mode === 'copy' ? COPY_TOLERANCE_SEC : REENCODE_TOLERANCE_SEC;
    const diff = Math.abs(probe.durationSec - expectedSec);
    if (diff > tolerance) {
        return {
            ok: false, weak: false,
            reason: `La duración del resultado (${formatTimecode(probe.durationSec)}) no coincide con la pedida (${formatTimecode(expectedSec)}).`
        };
    }
    return { ok: true, weak: false, reason: null };
};

/**
 * Dónde se guarda la copia de seguridad: carpeta hermana `pretrim/`, con el
 * mismo nombre y extensión. Como `thumbs/`: se puede vaciar con una regla de
 * ciclo de vida sin tocar los originales, y la clave es DETERMINISTA — un
 * segundo recorte sobrescribe la copia con la versión inmediatamente
 * anterior, que es la única que se promete conservar.
 */
export const backupKeyFor = (s3Key) => {
    const key = String(s3Key || '').replace(/^\/+/, '');
    if (!key) return null;
    const slash = key.lastIndexOf('/');
    const dir = slash === -1 ? '' : key.slice(0, slash + 1);
    const base = slash === -1 ? key : key.slice(slash + 1);
    return `${dir}pretrim/${base}`;
};

// La auditoría no crece sin tope: veinte entradas alcanzan para contestar
// «¿quién recortó esto y cuándo?» sin engordar una fila que se lee en cada
// listado de la Biblioteca.
export const TRIM_LOG_MAX = 20;

/**
 * El estado `trim` de la fila DESPUÉS de aplicar un recorte.
 *
 * `current` es lo restaurable (la copia anterior y sus números); `log` es la
 * auditoría que pide el módulo: quién, cuándo, rango elegido, duraciones y
 * tamaños antes y después. Un segundo recorte REEMPLAZA `current` —la copia
 * de seguridad ahora es la versión previa a ESTE corte— y AGREGA al log:
 * corregir la auditoría es escribir otra entrada, nunca editar una.
 */
export const appliedTrim = (prev, {
    by, at, startSec, endSec, mode,
    prevDurationSec, newDurationSec, prevSize, newSize, backupKey
} = {}) => {
    const log = Array.isArray(prev?.log) ? prev.log : [];
    const entry = {
        action: 'trim', by: by || null, at: at || null,
        startSec, endSec, mode,
        prevDurationSec: prevDurationSec ?? null,
        newDurationSec: newDurationSec ?? null,
        prevSize: prevSize ?? null,
        newSize: newSize ?? null
    };
    return {
        current: {
            backupKey: backupKey || null,
            appliedAt: at || null,
            by: by || null,
            startSec, endSec, mode,
            prevDurationSec: prevDurationSec ?? null,
            newDurationSec: newDurationSec ?? null,
            prevSize: prevSize ?? null,
            newSize: newSize ?? null
        },
        log: [...log, entry].slice(-TRIM_LOG_MAX)
    };
};

/**
 * El estado `trim` DESPUÉS de restaurar la versión anterior. `current` queda
 * en null —ya no hay nada que restaurar: la copia volvió a ser el archivo— y
 * la restauración queda en el log, como todo lo demás.
 */
export const restoredTrim = (prev, { by, at } = {}) => {
    const log = Array.isArray(prev?.log) ? prev.log : [];
    const c = prev?.current || {};
    return {
        current: null,
        log: [...log, {
            action: 'restore', by: by || null, at: at || null,
            restoredDurationSec: c.prevDurationSec ?? null,
            restoredSize: c.prevSize ?? null
        }].slice(-TRIM_LOG_MAX)
    };
};
