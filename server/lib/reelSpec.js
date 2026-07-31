// ════════════════════════════════════════════════════════════════════
// Creador de Reels IA — especificación compartida
// v4.663.0
//
// Única fuente de verdad de: formatos y resoluciones, motores de video,
// estilos de animación, transiciones, estilos musicales, reparto de la duración
// entre escenas y construcción de los prompts. Su espejo mínimo en el navegador
// es `src/lib/reelSpec.ts`; el servidor valida siempre, aunque el navegador ya
// lo haya hecho.
//
// QUÉ CAMBIA RESPECTO DEL MÓDULO ANTERIOR
//
// El Creador de Video mandaba las tres imágenes juntas a UNA sola llamada de
// `kling-2.6/image-to-video`, que recibe UNA imagen. Nunca hubo tres clips.
// Acá cada imagen es una ESCENA independiente con su propia tarea, su propia
// duración y su propio prompt, y el montaje es un paso aparte.
//
// REGLA DURABLE HEREDADA (Generador de Publicaciones y de Outros): el archivo
// que devuelve un modelo NO se postprocesa. No se recorta para llegar a un
// formato, no se recomprime, no se le pega nada encima. Lo que el motor entrega
// es lo que se guarda.
//
// El MONTAJE no es una excepción a esa regla, es otra cosa: unir tres clips con
// fundidos y una pista musical es una operación de edición declarada de
// antemano, no un retoque del output. Se hace en un proveedor de render
// alojado (ver `reelRenderProviders.js`) porque esta infraestructura corre en
// Vercel sin ffmpeg. Lo que sigue prohibido es tocar el CONTENIDO de cada clip.
// ════════════════════════════════════════════════════════════════════

// ─── Formatos y resoluciones ───────────────────────────────────────────────
//
// `master` es el objetivo del archivo final. `tiers` son las calidades que se
// pueden pedir al render cuando el proveedor las soporta. Full HD es el piso,
// nunca menos: es lo que exige el pedido del cliente y lo que las redes
// verticales recomprimen sin destruir.
export const REEL_FORMATS = {
    '9:16': {
        id: '9:16',
        label: 'Vertical · Reels, TikTok y Shorts',
        master: { width: 1080, height: 1920 },
        minWidth: 1080,
        minHeight: 1920,
        isDefault: true,
        tiers: {
            fullhd: { id: 'fullhd', label: 'Full HD · 1080×1920', width: 1080, height: 1920 },
            '2k':   { id: '2k',     label: '2K · 1440×2560',      width: 1440, height: 2560 },
            '4k':   { id: '4k',     label: '4K · 2160×3840',      width: 2160, height: 3840 }
        }
    },
    '1:1': {
        id: '1:1', label: 'Cuadrado · Feed',
        master: { width: 1080, height: 1080 }, minWidth: 1080, minHeight: 1080,
        tiers: {
            fullhd: { id: 'fullhd', label: 'Full HD · 1080×1080', width: 1080, height: 1080 },
            '2k':   { id: '2k',     label: '2K · 1440×1440',      width: 1440, height: 1440 },
            '4k':   { id: '4k',     label: '4K · 2160×2160',      width: 2160, height: 2160 }
        }
    },
    '4:5': {
        id: '4:5', label: 'Vertical corto · Feed',
        master: { width: 1080, height: 1350 }, minWidth: 1080, minHeight: 1350,
        tiers: {
            fullhd: { id: 'fullhd', label: 'Full HD · 1080×1350', width: 1080, height: 1350 },
            '2k':   { id: '2k',     label: '2K · 1440×1800',      width: 1440, height: 1800 },
            '4k':   { id: '4k',     label: '4K · 2160×2700',      width: 2160, height: 2700 }
        }
    },
    '16:9': {
        id: '16:9', label: 'Horizontal · YouTube y web',
        master: { width: 1920, height: 1080 }, minWidth: 1920, minHeight: 1080,
        tiers: {
            fullhd: { id: 'fullhd', label: 'Full HD · 1920×1080', width: 1920, height: 1080 },
            '2k':   { id: '2k',     label: '2K · 2560×1440',      width: 2560, height: 1440 },
            '4k':   { id: '4k',     label: '4K · 3840×2160',      width: 3840, height: 2160 }
        }
    }
};
export const DEFAULT_FORMAT = '9:16';
export const DEFAULT_QUALITY_TIER = 'fullhd';

export const resolveTier = (format, tier) => {
    const spec = REEL_FORMATS[format] || REEL_FORMATS[DEFAULT_FORMAT];
    return spec.tiers[tier] || spec.tiers[DEFAULT_QUALITY_TIER];
};

// ─── Presupuesto de duración ───────────────────────────────────────────────
//
// Tres escenas y ~15 segundos, que es el pedido. Los límites por escena existen
// porque un motor image-to-video pierde estabilidad temporal cuanto más largo
// es el clip: por debajo de 4 s no da tiempo a leer la escena, y por encima de
// 6 s la deriva del modelo empieza a notarse en rostros y textos.
export const SCENE_COUNT = 3;
export const TARGET_TOTAL_SEC = 15;
export const MIN_SCENE_SEC = 4;
export const MAX_SCENE_SEC = 6;
export const DEFAULT_SCENE_SEC = 5;

// Solapamiento de las transiciones. Cada fundido consume tiempo de las DOS
// escenas que une, así que la suma de los clips es mayor que el Reel final:
// tres clips de 5 s con dos fundidos de 0.5 s dan 14 s de pieza, no 15.
// `distributeDurations` lo compensa para que el resultado caiga en los 15 s.
export const TRANSITION_OVERLAP_SEC = 0.5;

// ─── Motores de video ──────────────────────────────────────────────────────
//
// Registro desacoplado, mismo criterio que el de Outros y el del Generador de
// Publicaciones: agregar un motor es una entrada acá más su `model`, sin tocar
// la lógica del módulo. El id del modelo es configurable por variable de
// entorno porque las pasarelas los renombran: si el default deja de existir se
// corrige el entorno y no se despliega.
//
// `provider` dice por qué servicio se despacha. Hoy sólo `kie` está
// implementado (es la pasarela que ya usa la plataforma y da acceso a Kling,
// Veo, Seedance y otros con el mismo endpoint). Los motores con `provider`
// distinto quedan declarados y `available:false` hasta que exista su adaptador,
// y la UI los muestra como "Próximamente" — igual que los placeholders del
// Generador de Publicaciones.
//
// `fidelity` es la nota de conservación de la imagen de origen, de 1 a 5. Es lo
// que decide el default: para una pieza institucional con logotipos y productos
// importa más no redibujar la marca que tener el movimiento más vistoso.
export const VIDEO_ENGINES = {
    kling26: {
        id: 'kling26',
        label: 'Kling 2.6 — máxima fidelidad a la imagen',
        provider: 'kie',
        model: process.env.REEL_MODEL_KLING26 || 'kling-2.6/image-to-video',
        durations: [5, 10],
        resolutions: ['1080p'],
        nativeAudio: true,
        fidelity: 5,
        creditEstimate: 20,
        available: true,
        isDefault: true,
        note: 'Conserva la composición y la marca mejor que ningún otro. Clips de 5 s exactos.'
    },
    kling21: {
        id: 'kling21',
        label: 'Kling 2.1 — movimiento amplio',
        provider: 'kie',
        model: process.env.REEL_MODEL_KLING21 || 'kling-2.1/image-to-video',
        durations: [5, 10],
        resolutions: ['1080p'],
        nativeAudio: false,
        fidelity: 4,
        creditEstimate: 14,
        available: true,
        note: 'Más movimiento de cámara, algo menos de fidelidad. Útil en paisaje y ambiente.'
    },
    seedance: {
        id: 'seedance',
        label: 'Seedance 1.0 Pro — cinematográfico',
        provider: 'kie',
        model: process.env.REEL_MODEL_SEEDANCE || 'bytedance/seedance-v1-pro-i2v',
        durations: [5, 10],
        resolutions: ['1080p'],
        nativeAudio: false,
        fidelity: 4,
        creditEstimate: 18,
        available: true,
        note: 'Movimiento de cámara con profundidad de campo marcada.'
    },
    veo3: {
        id: 'veo3',
        label: 'Google Veo 3 — audio nativo',
        provider: 'kie',
        model: process.env.REEL_MODEL_VEO3 || 'google/veo-3-fast-image-to-video',
        durations: [8],
        resolutions: ['1080p'],
        nativeAudio: true,
        fidelity: 4,
        creditEstimate: 60,
        // Se habilita por entorno: el id del modelo de Veo a través de la
        // pasarela cambió más de una vez y una ruta equivocada ya rompió el
        // Generador de Outros en v4.645. Se enciende cuando está verificado.
        available: process.env.REEL_ENGINE_VEO3_ENABLED === 'true',
        note: 'Clips de 8 s con audio generado. Verificar el id del modelo antes de habilitarlo.'
    },
    runway_gen4: {
        id: 'runway_gen4',
        label: 'Runway Gen-4',
        provider: 'runway',
        model: process.env.REEL_MODEL_RUNWAY || 'gen4_turbo',
        durations: [5, 10],
        resolutions: ['1080p'],
        nativeAudio: false,
        fidelity: 5,
        creditEstimate: 25,
        available: false,
        note: 'Próximamente — requiere adaptador propio de Runway.'
    },
    luma_ray2: {
        id: 'luma_ray2',
        label: 'Luma Ray 2',
        provider: 'luma',
        model: process.env.REEL_MODEL_LUMA || 'ray-2',
        durations: [5, 9],
        resolutions: ['1080p', '4k'],
        nativeAudio: false,
        fidelity: 4,
        creditEstimate: 22,
        available: false,
        note: 'Próximamente — requiere adaptador propio de Luma.'
    },
    minimax: {
        id: 'minimax',
        label: 'MiniMax Hailuo',
        provider: 'kie',
        model: process.env.REEL_MODEL_MINIMAX || 'minimax/hailuo-02-i2v',
        durations: [6, 10],
        resolutions: ['1080p'],
        nativeAudio: false,
        fidelity: 4,
        creditEstimate: 16,
        available: process.env.REEL_ENGINE_MINIMAX_ENABLED === 'true',
        note: 'Movimiento humano expresivo. Verificar el id del modelo antes de habilitarlo.'
    }
};

// El motor principal lo elige el administrador por entorno. Sin esa variable
// manda el que declara `isDefault`, que es el de mayor fidelidad.
export const DEFAULT_ENGINE =
    (process.env.REEL_DEFAULT_ENGINE && VIDEO_ENGINES[process.env.REEL_DEFAULT_ENGINE]?.available)
        ? process.env.REEL_DEFAULT_ENGINE
        : (Object.values(VIDEO_ENGINES).find(e => e.isDefault && e.available)?.id
            || Object.values(VIDEO_ENGINES).find(e => e.available)?.id
            || 'kling26');

export const isEngineAvailable = (engineId) => {
    const engine = VIDEO_ENGINES[engineId];
    if (!engine || !engine.available) return false;
    if (engine.provider === 'kie') return Boolean(process.env.KIE_API_KEY);
    return false; // proveedores sin adaptador todavía
};

// ─── Estilos de animación ──────────────────────────────────────────────────
//
// Los descriptores van en inglés porque son la entrada del modelo; las
// etiquetas en español porque son lo que ve el usuario. Mismo criterio que
// OUTRO_STYLES.
//
// `camera` describe el movimiento y `intensity` cuánto se permite (0-1). A
// diferencia del Generador de Outros —donde la cámara está fija por criterio de
// dirección de arte del Distrito— acá SÍ se mueve: el pedido es explícito
// (dolly, orbit, slider, push in, pull out, paneo). La contención va por otro
// lado: `preserve`, que es lo que se le dice al modelo que no puede cambiar, y
// se refuerza cuando el análisis detecta marca, texto o producto.
// ── La CÁMARA está fija; lo que se mueve es la ESCENA (v4.674) ──
//
// Hasta v4.673 cada estilo pedía un desplazamiento de cámara —dolly, push-in,
// orbit, slider— y eso es exactamente lo que el módulo NO debe hacer: el
// movimiento de cámara sustituía a la animación en vez de acompañarla, y el
// resultado se veía como una foto con paneo.
//
// Ahora `camera` describe una cámara quieta en todos los estilos, y lo que
// distingue a uno de otro es el CARÁCTER de la vida dentro del cuadro: qué se
// mueve, con cuánta amplitud y a qué ritmo. `motion` es esa descripción.
//
// `intensity` deja de ser «cuánto se mueve la cámara» y pasa a ser «cuánta
// actividad hay en la escena».
export const MOTION_STYLES = {
    cinematografico: {
        label: 'Cinematográfico',
        description: 'Luz suave y ritmo pausado. La escena respira despacio.',
        camera: 'The camera is locked off on a tripod: the framing does not move at all',
        motion: 'the movement is unhurried — slow breaths, unhurried glances, gestures that take their time',
        intensity: 0.5,
        pacing: 'unhurried and deliberate'
    },
    documental: {
        label: 'Documental',
        description: 'Registro real: la gente sigue a lo suyo, la cámara observa.',
        camera: 'The camera is locked off and observes without moving',
        motion: 'everyone simply carries on with what they were doing, unaware of being filmed',
        intensity: 0.55,
        pacing: 'natural and observational',
        isDefault: true
    },
    publicitario: {
        label: 'Publicitario',
        description: 'El motivo principal cobra vida y el resto lo acompaña.',
        camera: 'The camera is locked off; the framing stays exactly as photographed',
        motion: 'the main subject is the one that comes alive most clearly, while the rest of the scene moves more quietly behind',
        intensity: 0.6,
        pacing: 'assured and clear'
    },
    conversacion: {
        label: 'Conversación',
        description: 'Las personas se miran, asienten y hablan entre ellas.',
        camera: 'The camera is locked off and does not move',
        motion: 'the people talk quietly among themselves: heads turn towards one another, they nod, they answer, small laughs pass between them',
        intensity: 0.7,
        pacing: 'social and warm'
    },
    ceremonial: {
        label: 'Ceremonial',
        description: 'Actos y entregas: gestos contenidos y atención al centro.',
        camera: 'The camera is locked off, framing the moment as it was photographed',
        motion: 'the movement is composed and attentive — measured gestures, glances towards what is being presented, quiet acknowledgement between the people',
        intensity: 0.45,
        pacing: 'formal and composed'
    },
    intimo: {
        label: 'Íntimo',
        description: 'Cercanía: gestos pequeños, miradas, atención a una persona.',
        camera: 'The camera is locked off and stays close, exactly as framed',
        motion: 'the movement is small and human — a soft blink, a breath, a hand that shifts, an unhurried look',
        intensity: 0.35,
        pacing: 'close and human'
    },
    energico: {
        label: 'Enérgico',
        description: 'Actividad viva: varias personas moviéndose a la vez.',
        camera: 'The camera is locked off while the scene stays busy in front of it',
        motion: 'several people are active at once, each doing their own thing, hands and bodies busy with the task',
        intensity: 0.8,
        pacing: 'lively and busy'
    },
    sereno: {
        label: 'Sereno',
        description: 'Casi quieto. Sólo respiración y el aire del lugar.',
        camera: 'The camera is locked off completely',
        motion: 'almost nothing moves beyond breathing, a blink, and the air stirring fabric and hair',
        intensity: 0.2,
        pacing: 'still and quiet'
    },
    // ── Sin IA (v4.672) ──
    //
    // No va a ningún motor generativo: la fotografía se anima con un
    // desplazamiento lento de la ventana de encuadre (`renderStillMotion`). Los
    // píxeles son los de la foto, así que rostros, manos, insignias y textos son
    // los originales, no una reinterpretación.
    //
    // Es el estilo indicado para una foto de grupo institucional, que es donde
    // más se nota que un modelo redibuja las caras. Cuesta cero créditos y
    // segundos en vez de minutos.
    fotografico: {
        label: 'Fotográfico — sin IA, identidad garantizada',
        description: 'La fotografía se mueve, no se regenera. Rostros, insignias y textos quedan intactos.',
        camera: null,
        intensity: 0.15,
        pacing: 'still and documentary',
        // Marca que esta escena NO se despacha a un motor de video.
        engineless: true,
        drift: 'up'
    }
};
// Documental por defecto (v4.672): «cinematográfico» empujaba al motor hacia su
// propia idea de cine —luz dramática, destellos, partículas— y eso llegó a
// aparecer en piezas del Distrito. El registro institucional es el documental.
export const DEFAULT_MOTION_STYLE = 'documental';

// Estilos que se resuelven sin llamar a un motor generativo.
export const isEngineless = (styleId) => Boolean(MOTION_STYLES[styleId]?.engineless);

// `auto` deja que el director elija el estilo por escena a partir del análisis.
// Es el default de la UI: el pedido es que el usuario sólo elija tres fotos.
export const AUTO_MOTION_STYLE = 'auto';

// ─── Transiciones ──────────────────────────────────────────────────────────
//
// Sólo transiciones que un montaje profesional usaría. No hay estrellas,
// persianas ni giros de cubo a propósito: el pedido excluye explícitamente los
// efectos exagerados.
//
// `provider` es el nombre que entiende la capa de render; cada adaptador lo
// traduce al suyo. `overlap` es cuánto se solapan las dos escenas.
export const TRANSITIONS = {
    fade: {
        label: 'Fundido suave',
        description: 'Disolvencia limpia entre escenas. La más neutra y la más segura.',
        provider: 'fade', overlap: 0.5, isDefault: true
    },
    dissolve: {
        label: 'Disolvencia larga',
        description: 'Fundido extendido: las dos escenas conviven un instante.',
        provider: 'dissolve', overlap: 0.8
    },
    slide: {
        label: 'Desplazamiento',
        description: 'Una escena empuja a la otra con movimiento continuo.',
        provider: 'slideLeft', overlap: 0.5
    },
    blur: {
        label: 'Desenfoque',
        description: 'La escena pierde foco y la siguiente lo recupera.',
        provider: 'blur', overlap: 0.6
    },
    zoom: {
        label: 'Acercamiento',
        description: 'Continuidad por escala: la salida se acerca y la entrada retrocede.',
        provider: 'zoom', overlap: 0.55
    },
    cut: {
        label: 'Corte directo',
        description: 'Sin transición. Sólo cuando el ritmo lo pide.',
        provider: 'none', overlap: 0
    }
};
export const DEFAULT_TRANSITION = 'fade';
export const AUTO_TRANSITION = 'auto';

// ─── Música ────────────────────────────────────────────────────────────────
//
// El estilo lo elige el director a partir de lo que detecta en las fotos. El
// usuario puede reemplazarlo después desde la previsualización.
//
// `prompt` es lo que se le manda al modelo generativo de música; `mood` viaja
// también a la biblioteca licenciada cuando esa es la fuente.
export const MUSIC_STYLES = {
    institucional: {
        label: 'Institucional',
        prompt: 'warm corporate instrumental, soft piano and strings, hopeful and dignified, no vocals',
        mood: 'hopeful', bpm: 90
    },
    inspirador: {
        label: 'Inspirador',
        prompt: 'uplifting cinematic instrumental, rising strings and light percussion, emotional build, no vocals',
        mood: 'uplifting', bpm: 100
    },
    energico: {
        label: 'Enérgico',
        prompt: 'upbeat modern instrumental, driving drums and bright synths, confident and current, no vocals',
        mood: 'energetic', bpm: 124
    },
    calido: {
        label: 'Cálido',
        prompt: 'warm acoustic instrumental, soft guitar and gentle percussion, homely and close, no vocals',
        mood: 'warm', bpm: 84
    },
    elegante: {
        label: 'Elegante',
        prompt: 'refined minimal instrumental, sparse piano and subtle pads, premium and unhurried, no vocals',
        mood: 'refined', bpm: 76
    },
    gastronomico: {
        label: 'Gastronómico',
        prompt: 'playful light instrumental, marimba and soft claps, appetising and fresh, no vocals',
        mood: 'playful', bpm: 110
    },
    deportivo: {
        label: 'Deportivo',
        prompt: 'high-energy instrumental, punchy drums and bold bass, athletic and determined, no vocals',
        mood: 'driving', bpm: 132
    },
    natural: {
        label: 'Natural',
        prompt: 'ambient organic instrumental, airy pads and soft textures, open and calm, no vocals',
        mood: 'calm', bpm: 70
    },
    ceremonial: {
        label: 'Ceremonial',
        prompt: 'solemn orchestral instrumental, sustained strings and restrained brass, dignified, no vocals',
        mood: 'solemn', bpm: 72
    }
};
export const DEFAULT_MUSIC_STYLE = 'institucional';
export const AUTO_MUSIC_STYLE = 'auto';

// Cuánto suena la música bajo el video. Es una decisión de mezcla del montaje,
// no un retoque del clip.
export const MUSIC_VOLUME_DEFAULT = 0.85;
// Cola de entrada y salida de la música, en segundos.
export const MUSIC_FADE_SEC = 1.0;

// ─── Estados del proyecto ──────────────────────────────────────────────────
//
// Son las etapas que muestra la barra de progreso, en orden. `weight` es la
// fracción de la barra que ocupa cada una — reparto medido sobre lo que tarda
// de verdad: generar los tres clips es la mayor parte del tiempo.
export const REEL_STATUSES = {
    draft:       { label: 'Borrador',              terminal: false, weight: 0,    order: 0 },
    // El Reel existe en la Biblioteca desde este estado, antes de que se haya
    // llamado a ningún proveedor. Es lo que permite que la tarjeta aparezca en
    // el instante en que se pulsa «Renderizar», y no 20 s después.
    queued:      { label: 'En cola',               terminal: false, weight: 0.02, order: 1 },
    analyzing:   { label: 'Analizando imágenes',   terminal: false, weight: 0.06, order: 2 },
    directing:   { label: 'Construyendo narrativa', terminal: false, weight: 0.04, order: 3 },
    // Adaptación del lienzo al formato del Reel. Sólo actúa sobre las fotos que
    // no vienen ya en la proporción pedida; con las tres verticales, la etapa
    // se atraviesa sin gastar nada.
    expanding:   { label: 'Adaptando imágenes',    terminal: false, weight: 0.14, order: 4 },
    generating:  { label: 'Animando las fotos',    terminal: false, weight: 0.40, order: 5 },
    scoring:     { label: 'Componiendo la banda sonora', terminal: false, weight: 0.09, order: 6 },
    assembling:  { label: 'Uniendo las escenas',   terminal: false, weight: 0.18, order: 7 },
    validating:  { label: 'Codificando el video',  terminal: false, weight: 0.07, order: 8 },
    ready:       { label: 'Reel listo',            terminal: true,  weight: 0,    order: 9 },
    needs_review:{ label: 'Requiere revisión',     terminal: true,  weight: 0,    order: 9 },
    error:       { label: 'No se pudo completar',  terminal: true,  weight: 0,    order: 9 },
    // Cancelado por el usuario. Terminal, pero distinto de `error`: no hubo un
    // fallo que reintentar, y la ficha conserva sus fotos y su configuración.
    cancelled:   { label: 'Cancelado',             terminal: true,  weight: 0,    order: 9 }
};

// ─── Tiempo restante estimado ──────────────────────────────────────────────
//
// Segundos que suele tardar cada etapa, medidos sobre el caso real (tres fotos,
// Kling 2.6, montaje local). Es una ESTIMACIÓN y así se nombra en la interfaz:
// depende de la cola del proveedor, que no controlamos y que varía por hora.
//
// No se calcula a partir del histórico del club porque con tres o cuatro Reels
// generados la media diría más del azar que del proceso. Cuando haya volumen
// suficiente valdrá la pena; hoy sería precisión fingida.
export const STAGE_ETA_SEC = {
    queued: 20,
    analyzing: 18,
    directing: 8,
    expanding: 55,
    generating: 150,
    scoring: 25,
    assembling: 20,
    validating: 10
};

/**
 * Segundos que faltan, aproximadamente, para que el Reel esté listo.
 *
 * Sumar las etapas que quedan es lo único honesto que se puede hacer sin saber
 * la cola del proveedor. Dentro de una etapa por escena se descuenta la parte
 * ya cumplida, para que la cifra baje mientras los clips van llegando.
 *
 * Devuelve `null` en los estados terminales: ahí no queda nada que esperar y
 * mostrar un «0 s» sería ruido.
 */
export const estimateRemainingSec = (status, { scenesReady = 0, scenesTotal = SCENE_COUNT } = {}) => {
    const current = REEL_STATUSES[status];
    if (!current || current.terminal) return null;

    let remaining = 0;
    for (const [id, st] of Object.entries(REEL_STATUSES)) {
        if (st.terminal || st.order < current.order) continue;
        const full = STAGE_ETA_SEC[id] || 0;
        // La etapa en curso cuenta a prorrata de las escenas que ya terminaron.
        if (id === status && (status === 'generating' || status === 'expanding') && scenesTotal > 0) {
            remaining += full * Math.max(0, 1 - scenesReady / scenesTotal);
        } else {
            remaining += full;
        }
    }
    return Math.round(remaining);
};

// Estados de una escena individual. Una escena puede regenerarse sola sin
// tocar las otras dos — es el pedido explícito de la previsualización.
// Los estados que ve el usuario nombran lo que está pasando de verdad, no una
// etapa genérica: «Validando fidelidad» y «Clip listo» son cosas distintas y
// confundirlas es lo que hacía parecer que el módulo estaba parado.
export const SCENE_STATUSES = {
    pending:    { label: 'Pendiente',            terminal: false },
    expanding:  { label: 'Adaptando al formato', terminal: false },
    generating: { label: 'Generando',            terminal: false },
    rendering:  { label: 'Renderizando',         terminal: false },
    validating: { label: 'Validando fidelidad',  terminal: false },
    ready:      { label: 'Fidelidad verificada', terminal: true },
    needs_review:{ label: 'Requiere revisión',   terminal: true },
    error:      { label: 'Error',                terminal: true }
};

export const MAX_AUTO_RETRIES = 2;

// ─── Reparto de la duración ────────────────────────────────────────────────
//
// Distribuye los ~15 segundos entre las escenas respetando el rango 4-6 s y los
// pesos que propone el director (una escena con más que contar dura más).
//
// El solapamiento de las transiciones se compensa acá: se reparte el tiempo del
// Reel MÁS lo que se van a comer los fundidos, para que la pieza final caiga en
// los 15 s y no en 14.
//
// Después cada duración se ajusta a lo que el motor sabe entregar
// (`engineDurations`), porque un modelo que sólo hace clips de 5 s no va a
// entregar 4.3 s por mucho que lo pida el reparto. Lo que sobra lo recorta el
// montaje, que es una decisión de edición declarada, no un retoque del clip.
export const distributeDurations = ({
    weights = null,
    totalSec = TARGET_TOTAL_SEC,
    count = SCENE_COUNT,
    transitions = [],
    engineDurations = null
} = {}) => {
    const overlapTotal = transitions.reduce(
        (sum, t) => sum + (TRANSITIONS[t]?.overlap ?? TRANSITION_OVERLAP_SEC), 0
    );
    const budget = totalSec + overlapTotal;

    // Techo REAL por escena. No es MAX_SCENE_SEC a secas: pedirle 5.33 s a un
    // motor que sólo entrega 5 o 10 obliga a generar un clip de 10 para usar la
    // mitad — el doble de créditos y de espera para tirar 4.67 s.
    //
    // Así que el techo es la mayor duración que el motor entrega DENTRO del
    // rango permitido. Con [5, 10] el techo es 5 y las tres escenas salen de
    // clips de 5 s. Si ninguna de las que ofrece el motor entra en el rango
    // —un motor que sólo hiciera clips de 8 s—, se conserva MAX_SCENE_SEC y el
    // sobrante lo descarta el montaje: ahí el desperdicio es del proveedor, no
    // una decisión nuestra.
    const inRange = Array.isArray(engineDurations)
        ? engineDurations.filter(d => d >= MIN_SCENE_SEC && d <= MAX_SCENE_SEC)
        : [];
    const ceiling = Math.max(MIN_SCENE_SEC, inRange.length ? Math.max(...inRange) : MAX_SCENE_SEC);

    // Pesos normalizados. Sin propuesta del director, reparto parejo.
    const raw = Array.from({ length: count }, (_, i) => {
        const w = Number(weights?.[i]);
        return Number.isFinite(w) && w > 0 ? w : 1;
    });
    const sum = raw.reduce((a, b) => a + b, 0);

    // Primer reparto proporcional, ya recortado al rango permitido.
    let durations = raw.map(w => clamp(budget * (w / sum), MIN_SCENE_SEC, ceiling));

    // El recorte al rango rompe el total. Se reparte la diferencia entre las
    // escenas que todavía tienen margen, hasta agotarlo. Puede quedar corto: si
    // el motor tope a 5 s por escena, la pieza dura 14 s y no 15. Es la
    // "duración aproximada" del pedido, y `finalDurationSec` la dice exacta.
    for (let pass = 0; pass < 4; pass++) {
        const current = durations.reduce((a, b) => a + b, 0);
        const diff = budget - current;
        if (Math.abs(diff) < 0.05) break;
        const movable = durations
            .map((d, i) => ({ i, room: diff > 0 ? ceiling - d : d - MIN_SCENE_SEC }))
            .filter(x => x.room > 0.01);
        if (!movable.length) break;
        const roomTotal = movable.reduce((a, b) => a + b.room, 0);
        for (const { i, room } of movable) {
            durations[i] = clamp(durations[i] + diff * (room / roomTotal), MIN_SCENE_SEC, ceiling);
        }
    }

    const requested = durations.map(d => Number(d.toFixed(2)));

    // Lo que el motor sabe entregar: la duración soportada más cercana por
    // arriba, para que nunca falte metraje (sobrar lo resuelve el montaje;
    // faltar dejaría un hueco negro).
    const generated = requested.map(d => nearestEngineDuration(d, engineDurations));

    return {
        requested,
        generated,
        totalRequested: Number(requested.reduce((a, b) => a + b, 0).toFixed(2)),
        totalGenerated: Number(generated.reduce((a, b) => a + b, 0).toFixed(2)),
        overlapTotal: Number(overlapTotal.toFixed(2)),
        // Lo que va a durar la pieza montada: la suma de los tramos usados menos
        // lo que se solapan los fundidos.
        finalDurationSec: Number((requested.reduce((a, b) => a + b, 0) - overlapTotal).toFixed(2))
    };
};

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const nearestEngineDuration = (want, engineDurations) => {
    if (!Array.isArray(engineDurations) || !engineDurations.length) return Number(want.toFixed(2));
    const atLeast = engineDurations.filter(d => d >= want - 0.01).sort((a, b) => a - b);
    if (atLeast.length) return atLeast[0];
    return Math.max(...engineDurations);
};

// ─── Resolución del motor ──────────────────────────────────────────────────
//
// Devuelve el motor efectivo y la lista de ajustes aplicados. Los ajustes NO
// son silenciosos: viajan a la UI y quedan en la metadata del proyecto, para
// que nadie descubra después que pidió 4K y recibió Full HD.
export const resolveEngine = ({ engine, format = DEFAULT_FORMAT, qualityTier = DEFAULT_QUALITY_TIER } = {}) => {
    const notes = [];

    let chosenId = engine && isEngineAvailable(engine) ? engine : null;
    if (engine && !chosenId) {
        const wanted = VIDEO_ENGINES[engine];
        notes.push(
            wanted
                ? `${wanted.label} no está disponible en este entorno: se usó el motor principal.`
                : `El motor "${engine}" no existe: se usó el motor principal.`
        );
    }
    if (!chosenId) chosenId = isEngineAvailable(DEFAULT_ENGINE) ? DEFAULT_ENGINE : null;
    if (!chosenId) {
        const fallback = Object.keys(VIDEO_ENGINES).find(isEngineAvailable);
        if (!fallback) {
            const err = new Error('No hay ningún motor de video disponible. Revisar KIE_API_KEY.');
            err.code = 'NO_ENGINE';
            throw err;
        }
        chosenId = fallback;
    }

    const selected = VIDEO_ENGINES[chosenId];
    const resolvedFormat = REEL_FORMATS[format] ? format : DEFAULT_FORMAT;

    // La calidad del MONTAJE la fija el proveedor de render, no el motor de
    // video: los clips llegan en 1080p y el render los compone a la resolución
    // pedida. Pedir 4K con clips de 1080p amplía, y eso se avisa.
    let tier = resolveTier(resolvedFormat, qualityTier).id;
    const engineMaxHeight = selected.resolutions.includes('4k') ? 2160 : 1080;
    const wanted = resolveTier(resolvedFormat, tier);
    const wantedShortSide = Math.min(wanted.width, wanted.height);
    if (wantedShortSide > engineMaxHeight) {
        notes.push(
            `${selected.label} genera hasta ${engineMaxHeight}p: el montaje se compone en ${wanted.label} ampliando los clips. Para 2K/4K nativo hace falta un motor que lo entregue.`
        );
    }

    return {
        engine: selected,
        engineId: chosenId,
        model: selected.model,
        provider: selected.provider,
        format: resolvedFormat,
        qualityTier: tier,
        tier: resolveTier(resolvedFormat, tier),
        durations: selected.durations,
        nativeAudio: selected.nativeAudio,
        creditEstimatePerScene: selected.creditEstimate,
        notes
    };
};

// ─── Prompts ───────────────────────────────────────────────────────────────
//
// Cortos y en positivo, igual que en el resto del sitio. Aprendizaje del
// Generador de Publicaciones (ver CLAUDE.md): las listas de prohibiciones son
// contraproducentes — el modelo se obsesiona con lo prohibido.
//
// Por eso "que no deforme el logo" se escribe como "el logotipo se mantiene
// exactamente como está". Es la misma indicación, dicha como cualidad.
//
// `analysis` es lo que devolvió el director para esta escena. Cuando detecta
// marca, texto o producto, la frase de conservación se vuelve más específica:
// es el único momento en que el prompt crece, y crece nombrando lo que se
// conserva, no lo que se prohíbe.
export const buildScenePrompt = ({
    style = DEFAULT_MOTION_STYLE,
    durationSec = DEFAULT_SCENE_SEC,
    analysis = null,
    withAudio = false,
    musicStyle = DEFAULT_MUSIC_STYLE
} = {}) => {
    const s = MOTION_STYLES[style] || MOTION_STYLES[DEFAULT_MOTION_STYLE];
    const parts = [
        // «documentary», no «cinematic» (v4.672). La palabra importa: pedirle a
        // un modelo generativo un plano «cinematográfico» es invitarlo a añadir
        // lo que él entiende por cine —destellos, halos, partículas, luz
        // dramática—, y eso apareció de verdad en piezas institucionales. El
        // registro que se busca acá es el de un documental.
        // «This is the moment the photograph was taken, filmed» dice en una
        // frase lo que se pide: que la escena TRANSCURRA. La versión anterior
        // decía «animated from the provided photograph», que un modelo puede
        // satisfacer moviendo sólo la cámara — y eso es lo que salía.
        `A ${Math.round(durationSec)}-second documentary video: this is the moment the photograph was taken, filmed as it happened, ${Math.round(durationSec)} seconds of real time passing in the scene.`,
        // La identidad es lo que NO cambia. Ojo con el alcance: se enumeran
        // atributos y encuadre, NO el movimiento. Confundir las dos cosas fue
        // el error de v4.672: pedir que «todo lo demás se quede quieto»
        // congelaba la escena entera.
        'Everyone and everything in the frame stays exactly who and what they are: the same faces, the same ages, the same hair, the same glasses and hats, the same clothing, vests, badges and lanyards, the same logos and wordmarks, the same room and furniture, the same colours and the same light. The camera keeps the same framing and composition as the photograph.',
        // Sobriedad institucional, dicha EN POSITIVO. La regla del sitio es no
        // enumerar prohibiciones —el modelo se obsesiona con lo prohibido—, así
        // que en vez de «sin humo ni chispas» se afirma qué luz y qué aire hay:
        // los del original, y ninguno más.
        'The only light in the shot is the light already present in the photograph, and the air stays clear. The scene is exactly the room that was photographed, with nothing added to it.'
    ];

    // Refuerzo específico según lo que trae la escena. Cada rama nombra lo que
    // se conserva y, cuando corresponde, a qué se le permite moverse.
    if (analysis?.hasBrand || analysis?.hasText) {
        // Sin la última frase esto contradecía la rama de personas: «sólo la
        // cámara se mueve» le dice al modelo que congele a la gente. Lo que hay
        // que fijar es el DIBUJO de la marca, no la escena a su alrededor.
        parts.push('Logos, wordmarks, badges and any text stay pixel-exact and perfectly legible: they keep their typography, their colours and their proportions, and they never redraw themselves — even while the person wearing them moves.');
    }
    if (analysis?.hasPeople) {
        // El movimiento se describe con VERBOS y se pide que sea INDEPENDIENTE
        // por persona. Un modelo al que sólo se le concede «un pequeño
        // movimiento natural» entrega un grupo congelado, o peor, a todos
        // haciendo lo mismo a la vez, que se lee como un error.
        parts.push(
            'The people behave as they did in that moment: they breathe, they blink, they shift their weight, ' +
            'their heads turn a little, their glances move between one another, small smiles come and go, ' +
            'and hands finish the gesture they had started. Whoever was holding something keeps holding it. ' +
            'Whoever was mid-step continues the step. Each person moves on their own timing and in their own way, ' +
            'never all together, so the group looks alive rather than posed.'
        );
        // El límite va aparte y es sobre la IDENTIDAD, no sobre el movimiento.
        parts.push('Through all of it their faces remain the same faces, with the same features and the same age, and their hands keep five fingers and their natural shape.');
    }
    if (analysis?.hasNature) {
        parts.push('The air moves through the scene: leaves and branches sway, flags and fabric ripple, loose hair drifts, water carries small ripples, and clouds slide slowly across the sky.');
    } else {
        // Interior: también hay vida, sólo que menos. Sin esta rama, una escena
        // de salón quedaba con las personas moviéndose sobre un fondo muerto.
        parts.push('Indoors the scene still lives: fabric and lanyards settle, loose hair moves, and anyone in the background carries on with what they were doing.');
    }

    // Lo que hace ESTA foto en concreto, según lo que vio el análisis. Va antes
    // que la cámara porque es la instrucción principal: sin ella, las tres
    // escenas reciben la misma descripción genérica y se mueven igual.
    if (analysis?.motionHint) parts.push(String(analysis.motionHint));

    // Un estilo sin motor no tiene descripción de cámara: su movimiento lo hace
    // FFmpeg sobre la foto, no un modelo. El prompt no llega a usarse, pero
    // escribir «Camera: null» sería basura guardada en la fila de la escena.
    if (s.camera) {
        // La cámara se declara QUIETA y el movimiento se atribuye a la escena.
        // Es el punto del módulo: un desplazamiento de cámara sustituyendo a la
        // animación da una fotografía con paneo, que es justo lo que no se
        // quiere. Se dice en la misma frase para que no queden como dos ideas
        // sueltas que el modelo pueda promediar.
        parts.push(
            `${s.camera}, so every bit of movement in the shot comes from the people and the room themselves, never from the lens: ${s.motion}, ${s.pacing}. ` +
            'The movement runs smoothly and continuously from the first frame to the last, with stable, consistent detail throughout.'
        );
    }

    // El audio nativo sólo se pide si el motor lo tiene Y no vamos a poner
    // música encima: dos pistas compitiendo es peor que ninguna. Cuando hay
    // banda sonora del montaje, los clips se piden mudos a propósito.
    parts.push(
        withAudio
            ? `Audio: a quiet ambient bed matching the scene, ${MUSIC_STYLES[musicStyle]?.mood || 'calm'}, with no speech.`
            : 'The clip itself carries no speech and no music; the soundtrack is added in the edit.'
    );

    return parts.join(' ');
};

export const buildReelTitle = ({ organizationName, motionStyle, format }) => {
    const org = String(organizationName || '').trim();
    const styleLabel = (MOTION_STYLES[motionStyle] || MOTION_STYLES[DEFAULT_MOTION_STYLE]).label;
    return `${org ? `${org} · ` : ''}Reel ${styleLabel} ${format}`;
};

// Progreso 0-1 del proyecto, a partir del estado y de cuántas escenas van.
// Vive acá y no en la pantalla para que el número sea el mismo en los dos lados.
export const computeProgress = (status, { scenesReady = 0, scenesTotal = SCENE_COUNT } = {}) => {
    const order = REEL_STATUSES[status]?.order ?? 0;
    if (REEL_STATUSES[status]?.terminal) return 1;

    let progress = 0;
    for (const st of Object.values(REEL_STATUSES)) {
        if (st.order < order) progress += st.weight;
    }
    // Dentro de las etapas por escena, el avance es cuántas terminaron.
    if ((status === 'generating' || status === 'expanding') && scenesTotal > 0) {
        progress += REEL_STATUSES[status].weight * (scenesReady / scenesTotal);
    }
    return Number(Math.min(0.99, progress).toFixed(3));
};
