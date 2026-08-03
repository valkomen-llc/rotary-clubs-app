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

// ─── Intensidad del movimiento (v4.677) ───────────────────────────────────
//
// Cuánta ACTIVIDAD se le pide al motor. Es distinto del estilo y es el mando
// real de la velocidad aparente del clip.
//
// Nació de un defecto medido en producción: v4.672 congeló las escenas pidiendo
// que todo se quedara quieto, y v4.673 corrigió de más — enumeraba SIETE
// acciones («respiran, parpadean, cambian el peso, giran la cabeza, se miran,
// sonríen, terminan el gesto») para un clip de cinco segundos. Un modelo
// generativo al que se le dan siete acciones y cinco segundos las COMPRIME, y
// el resultado se ve acelerado, como un time-lapse.
//
// Menos acciones = más tiempo para cada una = cadencia humana. Por eso el
// control que ve el usuario es de intensidad, no de velocidad: la velocidad no
// se puede pedir, se obtiene no pidiendo demasiado.
export const MOTION_INTENSITY = {
    sutil: {
        id: 'sutil',
        label: 'Muy sutil',
        description: 'Apenas respiración y algún parpadeo. El menor riesgo de que el motor reinterprete un rostro.',
        clause: 'Their movement is minimal: they breathe, and now and then one of them blinks or settles their weight a little.'
    },
    natural: {
        id: 'natural',
        label: 'Natural',
        description: 'Respiran, parpadean, y alguno gira la cabeza o termina un gesto.',
        isDefault: true,
        clause: 'They breathe and blink, and over these seconds one or two of them turn their head a little, glance towards someone beside them, or finish the gesture their hands had already begun.'
    },
    expresivo: {
        id: 'expresivo',
        label: 'Expresivo moderado',
        description: 'Más interacción entre las personas. Más vida, y algo más de riesgo de deriva.',
        clause: 'They breathe and blink, they shift their weight, heads turn towards one another, glances pass between them and small smiles come and go, and whoever had begun a gesture carries it through.'
    }
};
export const DEFAULT_MOTION_INTENSITY = 'natural';

// Orden de menor a mayor actividad. Se usa para ACOTAR: nunca para subir.
const INTENSITY_ORDER = ['sutil', 'natural', 'expresivo'];

// ─── Preservación estricta de personas (v4.705) ────────────────────────────
//
// El defecto que motiva esto: en un clip generado a partir de una foto de
// grupo aparecía un rostro parcial que no está en la fotografía. El motor
// «completa» lo que la foto oculta —una cara detrás de un hombro, un cuerpo
// tapado por otro— y lo dibuja como una persona más.
//
// Es un defecto que hasta ahora NO SE MEDÍA. La comprobación de fidelidad
// preguntaba por deformación, deriva de identidad, marca y texto; una persona
// inventada no es ninguna de esas cosas, así que el modelo de visión podía
// contestar «todo bien» con honestidad mientras el clip tenía un sujeto de
// más. Por eso una escena con una cara fantasma pasaba con 8/10.
//
// El modo actúa en tres sitios y los tres hacen falta:
//   1. PROMPT — fija el número de personas y la oclusión, en positivo.
//   2. INTENSIDAD — un grupo denso o con caras tapadas se anima menos: cuanto
//      más movimiento se pide, más ocasiones tiene el motor de redibujar lo
//      que no ve.
//   3. MEDICIÓN — `reelQuality.js` cuenta personas en las dos mitades de la
//      comparación y una que aparece descalifica la escena.
export const isGroupSubject = (analysis) => {
    if (!analysis?.hasPeople) return false;
    return true;
};

// Cuándo la preservación estricta se enciende sola. El pedido enumera
// fotografías «grupales, institucionales, sociales, rotarias, corporativas,
// médicas, comunitarias o de eventos»: todas ellas tienen en común que hay
// PERSONAS RECONOCIBLES y que la pieza es institucional, que es exactamente
// para lo que existe este módulo. Por eso la condición es «hay personas», y no
// una clasificación de escenarios que el análisis no puede hacer con
// fiabilidad.
export const DEFAULT_STRICT_PEOPLE = true;
export const strictPeopleFor = (analysis, requested = null) => {
    if (requested === false) return false;
    if (requested === true) return Boolean(analysis?.hasPeople);
    return DEFAULT_STRICT_PEOPLE && Boolean(analysis?.hasPeople);
};

/**
 * Acota la intensidad según lo que el análisis vio en la foto.
 *
 * NUNCA sube: si el usuario pidió «Muy sutil», sale «Muy sutil». Lo que hace es
 * bajar cuando el riesgo de que el motor invente un sujeto es alto:
 *
 *   · caras u cuerpos parcialmente tapados → `sutil`. Es el caso exacto del
 *     defecto: lo que está oculto es lo que el motor completa.
 *   · grupo denso (hombros superpuestos, o seis personas o más) → `sutil`.
 *   · tres a cinco personas → como mucho `natural`.
 *
 * Devuelve la intensidad y el motivo, porque el motivo se le muestra al usuario:
 * una escena que se mueve menos que las otras sin explicación se lee como un
 * fallo.
 */
export const resolveSceneIntensity = ({
    analysis = null,
    requested = DEFAULT_MOTION_INTENSITY,
    strictPeople = null
} = {}) => {
    const asked = MOTION_INTENSITY[requested] ? requested : DEFAULT_MOTION_INTENSITY;
    const strict = strictPeopleFor(analysis, strictPeople);
    if (!strict) return { intensity: asked, requested: asked, strictPeople: false, reason: null };

    const count = Number.isFinite(Number(analysis?.personCount)) ? Number(analysis.personCount) : null;
    const dense = analysis?.peopleDensity === 'dense' || (count != null && count >= 6);
    const occluded = analysis?.occludedPeople === true;

    let cap = null;
    let reason = null;
    if (occluded) {
        cap = 'sutil';
        reason = 'Hay personas parcialmente tapadas: se anima con el movimiento mínimo para que el motor no complete lo que la foto no muestra.';
    } else if (dense) {
        cap = 'sutil';
        reason = 'El grupo está muy junto: se anima con el movimiento mínimo para que no se mezclen dos personas en una.';
    } else if (count != null && count >= 3) {
        cap = 'natural';
        reason = 'Hay un grupo de personas: la intensidad se limita a «Natural» para conservar cada rostro.';
    }

    if (!cap) return { intensity: asked, requested: asked, strictPeople: true, reason: null };

    const capped = INTENSITY_ORDER.indexOf(asked) > INTENSITY_ORDER.indexOf(cap) ? cap : asked;
    return {
        intensity: capped,
        requested: asked,
        strictPeople: true,
        reason: capped === asked ? null : reason
    };
};

// ─── Prompt negativo permanente para escenas con personas ──────────────────
//
// La lista es literalmente la que pidió el equipo. Se conserva palabra por
// palabra a propósito: es su criterio, no una interpretación nuestra.
//
// TENSIÓN DECLARADA, no resuelta en silencio. La regla del sitio —heredada del
// Generador de Publicaciones— es que las listas de prohibiciones son
// contraproducentes porque el modelo se obsesiona con lo prohibido, y por eso
// TODO el resto del prompt está escrito en positivo. Esto es la excepción, y
// va acotada de tres maneras para que la excepción no contamine la regla:
//
//   · va SÓLO en escenas con personas y con preservación estricta encendida;
//   · va al FINAL y en un bloque `Negative prompt:` claramente delimitado, que
//     es la convención que los modelos de video leen como exclusión — no
//     mezclada dentro de la descripción positiva, que es lo que provoca la
//     fijación;
//   · se puede apagar sin desplegar con `REEL_PEOPLE_NEGATIVE_PROMPT=off`, por
//     si la medición muestra que empeora las escenas en vez de mejorarlas.
//
// Y se puede MEDIR si sirve: el recuento de personas de `reelQuality.js` dice
// si la lista está evitando sujetos nuevos o no.
export const PEOPLE_NEGATIVE_TERMS = [
    'no new people', 'no extra person', 'no hidden person emerging', 'no ghost figure',
    'no duplicated face', 'no duplicated body', 'no disappearing person', 'no identity swap',
    'no morphing faces', 'no merging bodies', 'no splitting subjects',
    'no invented background characters', 'no transient silhouettes',
    'no reconstructed hidden body', 'no hallucinated limbs', 'no crowd expansion',
    'no face replacement', 'no body replacement', 'no flickering person',
    'no temporal inconsistency'
];
export const PEOPLE_NEGATIVE_PROMPT = PEOPLE_NEGATIVE_TERMS.join(', ');
export const peopleNegativeEnabled = () =>
    String(process.env.REEL_PEOPLE_NEGATIVE_PROMPT || '').toLowerCase() !== 'off';

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
    musicStyle = DEFAULT_MUSIC_STYLE,
    intensity = DEFAULT_MOTION_INTENSITY,
    strictPeople = null
} = {}) => {
    const s = MOTION_STYLES[style] || MOTION_STYLES[DEFAULT_MOTION_STYLE];
    const strict = strictPeopleFor(analysis, strictPeople);
    // Las tres frases del mapa de sujetos se arman abajo y se ensamblan al
    // final, porque son las que se sacrifican primero si el prompt no cabe.
    let census = null, subjectMap = null, occlusion = null;
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
        `A ${Math.round(durationSec)}-second documentary video: this is the moment the photograph was taken, filmed as it happened.`,
        // La cadencia se declara aparte y en positivo. No basta con decir «N
        // segundos de tiempo real» junto a la duración: hay que afirmar que lo
        // que se ve OCUPA esos segundos, o el modelo entrega un resumen
        // comprimido de un momento más largo — que es el time-lapse reportado.
        `Everything happens at the speed it happens in life: ${Math.round(durationSec)} unhurried seconds of that moment, at natural human cadence, evenly paced from the first frame to the last.`,
        // La identidad es lo que NO cambia. Ojo con el alcance: se enumeran
        // atributos y encuadre, NO el movimiento. Confundir las dos cosas fue
        // el error de v4.672: pedir que «todo lo demás se quede quieto»
        // congelaba la escena entera.
        'Everyone and everything in the frame stays exactly who and what they are: the same faces, ages, hair, glasses, hats, clothing, vests, badges and lanyards, the same logos and wordmarks, the same room, furniture, colours and light. The camera keeps the same framing and composition as the photograph.',
        // Sobriedad institucional, dicha EN POSITIVO. La regla del sitio es no
        // enumerar prohibiciones —el modelo se obsesiona con lo prohibido—, así
        // que en vez de «sin humo ni chispas» se afirma qué luz y qué aire hay:
        // los del original, y ninguno más.
        'The only light in the shot is the light already present in the photograph, the air stays clear, and the scene is exactly the room that was photographed, with nothing added to it.'
    ];

    // Refuerzo específico según lo que trae la escena. Cada rama nombra lo que
    // se conserva y, cuando corresponde, a qué se le permite moverse.
    if (analysis?.hasBrand || analysis?.hasText) {
        // Sin la última frase esto contradecía la rama de personas: «sólo la
        // cámara se mueve» le dice al modelo que congele a la gente. Lo que hay
        // que fijar es el DIBUJO de la marca, no la escena a su alrededor.
        parts.push('Logos, wordmarks, badges and any text stay pixel-exact and perfectly legible, keeping their typography, colours and proportions, and never redrawing themselves — even while the person wearing them moves.');
    }
    if (analysis?.hasPeople) {
        // La cantidad de acciones la fija la INTENSIDAD, no el prompt fijo.
        // Enumerar de más es lo que produce el efecto de cámara rápida: el
        // modelo comprime todo lo que se le pide en los segundos que tiene.
        const level = MOTION_INTENSITY[intensity] || MOTION_INTENSITY[DEFAULT_MOTION_INTENSITY];
        parts.push(`The people behave as they did in that moment. ${level.clause}`);
        parts.push(
            'Whoever was holding something keeps holding it, and whoever was mid-step continues it. ' +
            'Each moves on their own timing, never all together, so the group looks alive rather than posed.'
        );
        // El límite va aparte y es sobre la IDENTIDAD, no sobre el movimiento.
        parts.push('Through all of it their faces remain the same faces, with the same features and the same age, and their hands keep five fingers and their natural shape.');

        // ── Mapa de sujetos (v4.705) ──
        //
        // Fija el CENSO de la escena. Es la pieza que faltaba: el prompt decía
        // que cada persona conserva su identidad, pero no decía CUÁNTAS
        // personas hay, así que añadir una no contradecía nada de lo pedido.
        //
        // Se dice en positivo —«hay exactamente N y son esas N»— y se enumeran
        // los sujetos con su descripción para que el modelo tenga un anclaje
        // por persona a lo largo del clip, que es lo que pide un identificador
        // temporal estable en un motor que no expone ninguno.
        if (strict) {
            const n = Number(analysis?.personCount);
            census = Number.isFinite(n) && n > 0
                ? `Exactly ${n} ${n === 1 ? 'person is' : 'people are'} in this photograph, and exactly ` +
                  `${n === 1 ? 'that same person is' : `those same ${n} people are`} in every frame of the clip, first to last: the count stays ${n}, and each keeps their own place and their own face.`
                : 'The clip holds exactly the people who are in the photograph, the same ones from the first frame to the last: the count stays as it is.';

            const list = Array.isArray(analysis?.subjects)
                ? analysis.subjects.filter(t => typeof t === 'string' && t.trim()).slice(0, 5)
                : [];
            if (list.length) {
                subjectMap = `They are: ${list.map(t => t.trim().slice(0, 80)).join('; ')}. Each stays that same person in that same place.`;
            }

            // Oclusión. Es el mecanismo concreto del defecto reportado: lo que
            // la foto tapa es lo que el motor completa e inventa. Se pide en
            // positivo —lo oculto SIGUE oculto—, que además es lo que hay que
            // conservar para que el plano se lea igual.
            occlusion = 'What the photograph hides stays hidden: a face behind a shoulder stays behind that shoulder, and whatever the frame cuts off stays cut off. What cannot be seen simply stays out of view.';
        }
    }
    // Ambiente. Es sabor: da vida al fondo, pero es lo primero que sobra si el
    // prompt no cabe.
    const ambience = analysis?.hasNature
        ? 'The air moves through the scene: leaves and branches sway, flags and fabric ripple, loose hair drifts, water carries small ripples, and clouds slide slowly across the sky.'
        // Interior: también hay vida, sólo que menos. Sin esta rama, una escena
        // de salón quedaba con las personas moviéndose sobre un fondo muerto.
        : 'Indoors the scene still lives: fabric and lanyards settle, loose hair moves, and anyone in the background carries on with what they were doing.';

    // Lo que hace ESTA foto en concreto, según lo que vio el análisis. Va antes
    // que la cámara porque es la instrucción principal: sin ella, las tres
    // escenas reciben la misma descripción genérica y se mueven igual.
    const hint = analysis?.motionHint ? String(analysis.motionHint) : null;

    // Un estilo sin motor no tiene descripción de cámara: su movimiento lo hace
    // FFmpeg sobre la foto, no un modelo. El prompt no llega a usarse, pero
    // escribir «Camera: null» sería basura guardada en la fila de la escena.
    //
    // La cámara se declara QUIETA y el movimiento se atribuye a la escena. Es el
    // punto del módulo: un desplazamiento de cámara sustituyendo a la animación
    // da una fotografía con paneo, que es justo lo que no se quiere. Se dice en
    // la misma frase para que no queden como dos ideas sueltas que el modelo
    // pueda promediar.
    const camera = s.camera
        ? `${s.camera}, so every bit of movement in the shot comes from the people and the room themselves, never from the lens: ${s.motion}, ${s.pacing}. ` +
          'The movement runs smoothly and continuously, with stable, consistent detail throughout.'
        : null;

    // El audio nativo sólo se pide si el motor lo tiene Y no vamos a poner
    // música encima: dos pistas compitiendo es peor que ninguna. Cuando hay
    // banda sonora del montaje, los clips se piden mudos a propósito.
    const audio = withAudio
        ? `Audio: a quiet ambient bed matching the scene, ${MUSIC_STYLES[musicStyle]?.mood || 'calm'}, with no speech.`
        : 'The clip itself carries no speech and no music; the soundtrack is added in the edit.';

    // ── Presupuesto de longitud (v4.705) ──
    //
    // Kling declara un tope de 2500 caracteres para el prompt. Con el mapa de
    // sujetos y la oclusión, el peor caso medido —ocho personas descritas,
    // marca, texto y naturaleza— se pasa, y un prompt rechazado es un Reel que
    // no se genera. Mandarle a un modelo algo que no acepta es exactamente lo
    // que rompió el módulo en v4.645, así que se acota acá en vez de
    // descubrirlo en producción. `REEL_PROMPT_MAX_CHARS` corrige el tope por
    // entorno si resulta ser otro, sin desplegar.
    //
    // El recorte tiene ORDEN y sacrifica primero lo menos cargante:
    //   1. la frase de ambiente — da vida al fondo, pero es sabor;
    //   2. el mapa de sujetos — refuerza el censo, que va aparte y se conserva;
    //   3. el `motionHint`, RECORTADO por la última palabra entera y nunca
    //      eliminado: es la instrucción de ESTA foto, y sin ella las tres
    //      escenas se mueven igual.
    //
    // El censo y la oclusión no se tocan: son lo que se añadió para resolver el
    // defecto, y recortarlos sería dejar de hacer lo que se dice que se hace.
    // Lo que se deja fuera queda anotado en consola — un recorte silencioso
    // convierte «lo pedimos» en una afirmación falsa.
    //
    // El bloque negativo NO entra en este presupuesto: viaja en su propio campo
    // (`buildSceneNegativePrompt`), que en Kling tiene su propio tope de 2500.
    // Inline consumía 640 de los 2500 del positivo —el 26 %— y empujaba fuera
    // frases afinadas a lo largo de treinta versiones.
    const limit = Number(process.env.REEL_PROMPT_MAX_CHARS) || 2500;
    const trimWords = (t, n) => {
        if (t.length <= n) return t;
        const cut = t.slice(0, n);
        const sp = cut.lastIndexOf(' ');
        return (sp > n * 0.6 ? cut.slice(0, sp) : cut).trimEnd();
    };

    const build = ({ withSubjects = true, withAmbience = true, hintChars = Infinity } = {}) => [
        ...parts,
        withAmbience ? ambience : null,
        hint ? (hintChars === Infinity ? hint : trimWords(hint, hintChars)) : null,
        camera,
        audio,
        census,
        withSubjects ? subjectMap : null,
        occlusion
    ].filter(Boolean).join(' ');

    const steps = [
        {},
        { withAmbience: false },
        { withAmbience: false, withSubjects: false },
        { withAmbience: false, withSubjects: false, hintChars: 90 }
    ];
    let prompt = build();
    for (let i = 1; i < steps.length && prompt.length > limit; i++) {
        console.warn(`[REEL] prompt de ${prompt.length} caracteres sobre el tope de ${limit}: se recorta (paso ${i}).`);
        prompt = build(steps[i]);
    }
    if (prompt.length > limit) {
        // Última red. Se recorta la descripción fija y se vuelven a pegar el
        // censo y la oclusión, que van al final y no se sacrifican.
        const keep = [census, occlusion].filter(Boolean).join(' ');
        console.warn(`[REEL] prompt de ${prompt.length} caracteres aún sobre el tope de ${limit}: se recorta la descripción fija.`);
        prompt = `${trimWords(prompt, Math.max(0, limit - keep.length - 1))} ${keep}`.trim();
    }
    return prompt;
};

/**
 * El prompt negativo de la escena, para el campo `negative_prompt` del motor.
 *
 * Va SEPARADO del positivo por dos motivos y los dos importan:
 *
 *   · Presupuesto. Kling da 2500 caracteres al prompt y otros 2500 al negativo.
 *     Inline, esta lista se comía 640 del positivo —el 26 %— y expulsaba frases
 *     afinadas durante treinta versiones. En su campo no cuesta nada.
 *   · Regla del sitio. Los prompts se escriben en POSITIVO porque el modelo se
 *     obsesiona con lo prohibido; mezclar una lista de veinte negaciones dentro
 *     de la descripción de la escena es exactamente lo que produce esa
 *     fijación. En un campo aparte el modelo la lee como lo que es.
 *
 * Devuelve `null` cuando no aplica —sin personas, sin preservación estricta, o
 * apagado por entorno— y entonces el campo no se manda.
 */
export const buildSceneNegativePrompt = ({ analysis = null, strictPeople = null } = {}) => {
    if (!strictPeopleFor(analysis, strictPeople)) return null;
    if (!peopleNegativeEnabled()) return null;
    return PEOPLE_NEGATIVE_PROMPT;
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
