/**
 * Outro de un Reel — el CRITERIO (v4.1032)
 * =========================================
 *
 * Un Reel puede cerrar con un clip de outro: un video ya renderizado —subido a
 * la Biblioteca Multimedia, elegido de ella, o producido por el Generador de
 * Outros— que se engancha DESPUÉS de la última escena, con una transición
 * suave. Este archivo decide qué se guarda, cómo se acota y cómo entra al
 * montaje. Es PURO: sin base, sin red, sin ffmpeg.
 *
 * Reglas que sostiene:
 *
 * - EL OUTRO NUNCA PASA POR LA IA. Viaja en `config.outro`, aparte de las
 *   escenas, y entra al montaje como un clip más: el compositor lo escala,
 *   lo recorta y le fija los fps dentro del grafo (cover/crop, sin bandas).
 *   Cambiarlo, activarlo o quitarlo sólo relanza el MONTAJE; ninguna escena
 *   se regenera ni se consume un crédito de image-to-video.
 *
 * - LA TRANSICIÓN ES SUAVE POR CATÁLOGO. Sólo fundido y disolvencia (más el
 *   corte, para quien lo pida a propósito): un zoom, un giro o un barrido
 *   cambian la composición del cierre institucional. La duración se acota a
 *   [0,3, 1,2] s con 0,6 s por defecto — el rango en que un fundido se lee
 *   como continuidad y no como un efecto.
 *
 * - `audioEnabled` SÓLO PUEDE SER CIERTO SI EL ARCHIVO TRAE AUDIO (`hasAudio`
 *   medido con `probeMp4`). Pedirle a ffmpeg la pista `[i:a]` de un archivo
 *   mudo rompe el grafo entero, así que la puerta está en la normalización y
 *   no en la pantalla.
 *
 * - Un outro NO se guarda sin URL. Sin archivo no hay nada que montar, y una
 *   configuración con `enabled: true` y sin clip sería una promesa vacía.
 */

export const OUTRO_TRANSITIONS = {
    fade: { id: 'fade', label: 'Fundido suave', description: 'La última escena se funde en el outro.', provider: 'fade', isDefault: true },
    dissolve: { id: 'dissolve', label: 'Disolvencia', description: 'Cruce más largo entre las dos imágenes.', provider: 'dissolve' },
    cut: { id: 'cut', label: 'Corte directo', description: 'Sin transición. Sólo si el outro ya arranca en negro.', provider: 'none' }
};

export const OUTRO_TRANSITION_DEFAULT = 'fade';
export const OUTRO_TRANSITION_SEC = { min: 0.3, max: 1.2, default: 0.6 };
// Un outro es un cierre, no otra escena: por encima de esto la pieza deja de
// ser un Reel y el montaje —que tiene presupuesto de tiempo— lo paga.
export const OUTRO_MAX_SEC = 20;
export const OUTRO_MIN_SEC = 0.5;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Relación de aspecto legible («9:16», «16:9», «1:1») a partir de las medidas.
// Se calcula al leer, no se guarda: dos verdades sobre las mismas medidas se
// contradicen en cuanto alguien corrige una.
export const aspectLabel = (width, height) => {
    const w = num(width), h = num(height);
    if (!w || !h || w <= 0 || h <= 0) return null;
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    const g = gcd(Math.round(w), Math.round(h));
    return `${Math.round(w) / g}:${Math.round(h) / g}`;
};

// Cuánto se solapan dos clips en el montaje. Es el ÚNICO punto que lo decide:
// el grafo de ffmpeg, el spec de montaje y la línea de tiempo de los
// proveedores alojados lo consumen. Un clip puede declarar su propia duración
// (`transitionSec`, el outro); si no, manda el catálogo de transiciones.
export const clipOverlap = (clip, index, transitions) => {
    if (index === 0 || !clip) return 0;
    const id = clip.transitionIn;
    if (!id || id === 'cut') return 0;
    if (transitions?.[id]?.provider === 'none') return 0;
    const own = num(clip.transitionSec);
    if (own != null && own >= 0) return own;
    return transitions?.[id]?.overlap ?? 0;
};

/**
 * Normaliza lo que llega del navegador (o de una fila anterior) a la forma
 * que se guarda en `config.outro`. Devuelve `null` cuando no hay outro.
 *
 * `measured` es lo que `probeMp4` dijo del archivo —duración, medidas y si
 * trae audio— y MANDA sobre lo que declare el cuerpo: lo declarado es una
 * pista, lo medido es un hecho. Sin medición se conserva lo que se tenía.
 */
export const normalizeOutroConfig = (raw, { previous = null, measured = null } = {}) => {
    if (!raw || typeof raw !== 'object') return null;
    const prev = previous && typeof previous === 'object' ? previous : {};
    const url = typeof raw.url === 'string' && raw.url.trim() ? raw.url.trim() : (prev.url || null);
    if (!url) return null;

    const sameAsset = url === prev.url;
    const durationSec = num(measured?.durationSec) ?? (sameAsset ? num(prev.durationSec) : num(raw.durationSec));
    const width = num(measured?.width) ?? (sameAsset ? num(prev.width) : num(raw.width));
    const height = num(measured?.height) ?? (sameAsset ? num(prev.height) : num(raw.height));
    const hasAudio = measured
        ? Boolean(measured.hasAudio)
        : (sameAsset && typeof prev.hasAudio === 'boolean' ? prev.hasAudio
            : (typeof raw.hasAudio === 'boolean' ? raw.hasAudio : null));

    const transitionType = OUTRO_TRANSITIONS[raw.transitionType] ? raw.transitionType
        : (OUTRO_TRANSITIONS[prev.transitionType] ? prev.transitionType : OUTRO_TRANSITION_DEFAULT);
    const requestedSec = num(raw.transitionSec) ?? num(prev.transitionSec) ?? OUTRO_TRANSITION_SEC.default;
    const transitionSec = transitionType === 'cut'
        ? 0
        : Number(clamp(requestedSec, OUTRO_TRANSITION_SEC.min, OUTRO_TRANSITION_SEC.max).toFixed(2));

    const enabled = typeof raw.enabled === 'boolean' ? raw.enabled
        : (typeof prev.enabled === 'boolean' && sameAsset ? prev.enabled : true);
    const wantsAudio = typeof raw.audioEnabled === 'boolean' ? raw.audioEnabled
        : (sameAsset && typeof prev.audioEnabled === 'boolean' ? prev.audioEnabled : true);

    return {
        enabled,
        url,
        assetId: typeof raw.assetId === 'string' && raw.assetId ? raw.assetId
            : (typeof raw.mediaId === 'string' && raw.mediaId ? raw.mediaId : (sameAsset ? prev.assetId || null : null)),
        source: typeof raw.source === 'string' && raw.source ? raw.source : (sameAsset ? prev.source || 'library' : 'library'),
        // De qué outro del Generador salió, cuando salió de uno (v4.1040). Va
        // ENUMERADO acá a propósito: este normalizador RECONSTRUYE la
        // configuración, así que lo que no se enumere se pierde al guardar —y
        // sin él la ficha no puede decir cuál es ni preseleccionarlo al
        // cambiarlo (la lección de `normalizeNode` en Plantillas IA).
        outroId: typeof raw.outroId === 'string' && raw.outroId ? raw.outroId : (sameAsset ? prev.outroId || null : null),
        title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim().slice(0, 200)
            : (sameAsset ? prev.title || null : null),
        posterUrl: typeof raw.posterUrl === 'string' && raw.posterUrl ? raw.posterUrl : (sameAsset ? prev.posterUrl || null : null),
        durationSec: durationSec != null && durationSec > 0 ? Number(durationSec.toFixed(2)) : null,
        width: width && width > 0 ? Math.round(width) : null,
        height: height && height > 0 ? Math.round(height) : null,
        hasAudio,
        // La puerta: sin audio medido no se puede pedir la pista.
        audioEnabled: Boolean(wantsAudio && hasAudio === true),
        transitionType,
        transitionSec,
        measuredAt: measured ? new Date().toISOString() : (sameAsset ? prev.measuredAt || null : null)
    };
};

// Lo que impide montar con este outro, con su motivo. Vacío = se puede.
export const outroProblems = (outro) => {
    const problems = [];
    if (!outro?.url) problems.push('El outro no tiene archivo.');
    const dur = num(outro?.durationSec);
    if (dur != null && dur > OUTRO_MAX_SEC) problems.push(`El outro dura ${dur} s y el máximo es ${OUTRO_MAX_SEC} s.`);
    if (dur != null && dur < OUTRO_MIN_SEC) problems.push(`El outro dura ${dur} s: demasiado corto para un cierre.`);
    return problems;
};

/**
 * El clip que entra al montaje, o `null` si el outro está apagado o no sirve.
 * `fallbackDurationSec` se usa cuando el archivo no se pudo medir: es mejor
 * montar con una duración declarada que dejar la pieza sin su cierre.
 */
export const outroClipFor = (outro, { fallbackDurationSec = 5 } = {}) => {
    if (!outro || !outro.enabled || !outro.url) return null;
    if (outroProblems(outro).length) return null;
    const durationSec = num(outro.durationSec) || fallbackDurationSec;
    return {
        videoUrl: outro.url,
        durationSec: Number(durationSec.toFixed(2)),
        // La transición de ENTRADA del outro es la que se configuró; la de
        // salida no importa: es el último clip.
        transitionIn: outro.transitionType === 'cut' ? 'cut' : (outro.transitionType || OUTRO_TRANSITION_DEFAULT),
        transitionSec: outro.transitionType === 'cut' ? 0 : num(outro.transitionSec) ?? OUTRO_TRANSITION_SEC.default,
        isOutro: true,
        hasAudio: outro.hasAudio === true,
        audioEnabled: Boolean(outro.audioEnabled && outro.hasAudio === true)
    };
};

// Lo que la pantalla necesita, RESUELTO acá: la pantalla pinta, no decide.
export const outroView = (outro) => {
    if (!outro || !outro.url) return null;
    return {
        enabled: Boolean(outro.enabled),
        url: outro.url,
        assetId: outro.assetId || null,
        // v4.1040: de qué outro del Generador salió. Es lo que permite decirlo
        // en la ficha y preseleccionarlo al cambiarlo; `null` significa que el
        // clip se eligió de la Biblioteca Multimedia o se subió a mano.
        outroId: outro.outroId || null,
        source: outro.source || 'library',
        title: outro.title || null,
        posterUrl: outro.posterUrl || null,
        durationSec: num(outro.durationSec),
        width: num(outro.width),
        height: num(outro.height),
        aspectRatio: aspectLabel(outro.width, outro.height),
        hasAudio: outro.hasAudio === true ? true : (outro.hasAudio === false ? false : null),
        audioEnabled: Boolean(outro.audioEnabled),
        transitionType: outro.transitionType || OUTRO_TRANSITION_DEFAULT,
        transitionLabel: OUTRO_TRANSITIONS[outro.transitionType]?.label || OUTRO_TRANSITIONS[OUTRO_TRANSITION_DEFAULT].label,
        transitionSec: num(outro.transitionSec) ?? OUTRO_TRANSITION_SEC.default,
        problems: outroProblems(outro),
        measuredAt: outro.measuredAt || null
    };
};

/**
 * ─── El MASTER y lo que el outro dice que debería ser (v4.1047) ────────────
 *
 * Un Reel tiene DOS cosas que pueden hablar del outro y decir cosas distintas:
 * la CONFIGURACIÓN (`config.outro`, lo que alguien eligió) y el MASTER (el
 * archivo montado, cuyo `renderSpec.outro` dice con qué se montó de verdad).
 * Guardar la configuración no toca el archivo, así que entre las dos cabe una
 * ventana en la que la ficha muestra un outro y `videoUrl` sigue siendo el
 * montaje anterior — y ahí es donde se reportó el defecto: la pantalla de
 * publicar leía ese `videoUrl` y mandaba a Facebook e Instagram la pieza sin
 * cierre.
 *
 * `outroMontageKey` es la huella de lo que el outro aporta AL ARCHIVO: el
 * clip, su duración, su transición y si su audio se mezcla. Lo que no está en
 * esa lista —el título, la miniatura, de qué outro del Generador salió— no
 * cambia un solo fotograma, así que no obliga a volver a montar.
 *
 * ⚠️ SE COMPARA LA CONFIGURACIÓN CONTRA EL SPEC DEL MASTER, no contra la
 * configuración anterior. Comparar dos configuraciones contesta «¿cambió algo
 * desde la última vez que se guardó?», que no es la pregunta: un montaje que
 * falló, o que no llegó a lanzarse, deja el archivo desactualizado sin que la
 * configuración vuelva a moverse, y entonces el Reel se queda desincronizado
 * para siempre sin que nada lo diga.
 */

const montageKeyOf = ({ src, durationSec, transitionIn, transitionSec, audioEnabled }) => [
    src,
    Number(durationSec ?? 0).toFixed(2),
    transitionIn || OUTRO_TRANSITION_DEFAULT,
    Number(transitionSec ?? 0).toFixed(2),
    audioEnabled ? 'audio' : 'mudo'
].join('|');

export const OUTRO_MONTAGE_NONE = 'sin-outro';

/** La huella de la CONFIGURACIÓN: qué outro habría que montar. */
export const outroMontageKey = (outro) => {
    const clip = outroClipFor(outro);
    if (!clip) return OUTRO_MONTAGE_NONE;
    return montageKeyOf({
        src: clip.videoUrl,
        durationSec: clip.durationSec,
        transitionIn: clip.transitionIn,
        transitionSec: clip.transitionSec,
        audioEnabled: clip.audioEnabled
    });
};

/** La huella del MASTER: con qué outro se montó el archivo que hay. */
export const renderedOutroKey = (renderSpec) => {
    const o = renderSpec?.outro;
    if (!o?.src) return OUTRO_MONTAGE_NONE;
    return montageKeyOf(o);
};

/**
 * ¿El archivo publicable refleja el outro configurado?
 *
 * Es el ÚNICO punto que lo decide. Lo consumen la ficha del Reel (para decir
 * que falta montar), el montaje automático (para saber si hay algo que hacer)
 * y la PUBLICACIÓN (para no mandar a Meta la pieza anterior). Con el criterio
 * escrito en cada uno, el día que cambie uno la pantalla diría una cosa y el
 * archivo que sale a la red sería otra — que es exactamente el defecto que
 * esta función existe para cerrar.
 *
 * Sin master no hay nada que contradecir: un Reel sin montar ya está bloqueado
 * para publicar por no tener archivo, y decir además que «está desactualizado»
 * mandaría a diagnosticar lo que no está roto.
 */
export const outroSyncState = ({ outro = null, renderSpec = null, hasMaster = false } = {}) => {
    const wanted = outroMontageKey(outro);
    const rendered = renderedOutroKey(renderSpec);

    // ── QUÉ HAY, QUÉ ENTRA AL MONTAJE Y QUÉ LLEVA EL ARCHIVO (v4.1048) ──
    //
    // `stale` contesta «¿el archivo contradice a la configuración?» y de eso
    // cuelga el bloqueo de publicación. Pero hay un estado en el que NO hay
    // contradicción y el video igual no lleva el cierre: el outro está puesto
    // y DESACTIVADO. Ahí las dos huellas son «sin-outro», así que el veredicto
    // es —correctamente— «al día», no se monta nada y publicar se permite.
    //
    // Eso está bien y era invisible: la ficha pintaba el outro con su
    // duración, su transición y su audio exactamente igual que uno activo, así
    // que un outro apagado se lee como un outro puesto y quien mira concluye
    // que el video debería llevarlo. Es el reporte de «lo activé y el video
    // sigue en 20 s». Estos tres campos son lo que permite DECIRLO, y son
    // aditivos: `stale` no cambia, así que no se bloquea una publicación
    // legítima por una decisión que alguien tomó a propósito.
    const configured = Boolean(outro?.url);
    const active = wanted !== OUTRO_MONTAGE_NONE;
    const inMaster = Boolean(hasMaster) && rendered !== OUTRO_MONTAGE_NONE;
    // Apagado es DISTINTO de inservible: un outro con el archivo fuera de
    // rango también deja de entrar al montaje, pero eso ya lo dicen sus
    // `problems` y su salida es otra. Nombrar mal el motivo manda a
    // diagnosticar donde no está el problema.
    const disabled = configured && outro?.enabled === false;
    const note = disabled
        ? (hasMaster
            ? 'El outro está guardado pero DESACTIVADO, así que el video montado no lo lleva.'
            : 'El outro está guardado pero DESACTIVADO, así que no entrará al video cuando se monte.')
        : null;
    const noteFix = disabled ? 'Activá el outro para integrarlo al video.' : null;

    const base = {
        wanted, rendered, configured, active, inMaster, disabled, note, noteFix,
        stale: false, reason: null, fix: null
    };
    if (!hasMaster) return base;
    if (wanted === rendered) return base;

    const salida = 'Volvé a montar el Reel: usa las escenas que ya existen, no regenera ninguna y no consume créditos de video.';
    if (rendered === OUTRO_MONTAGE_NONE) {
        return { ...base, stale: true, reason: 'El video montado todavía no lleva el outro configurado.', fix: salida };
    }
    if (wanted === OUTRO_MONTAGE_NONE) {
        return {
            ...base, stale: true,
            reason: 'El video montado todavía lleva el outro que se quitó o se desactivó.',
            fix: salida
        };
    }
    const [srcWanted] = wanted.split('|');
    const [srcRendered] = rendered.split('|');
    return {
        ...base, stale: true,
        reason: srcWanted === srcRendered
            ? 'El video montado lleva este outro con otra transición o con otro audio.'
            : 'El video montado lleva un outro distinto del configurado.',
        fix: salida
    };
};
