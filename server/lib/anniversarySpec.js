// ════════════════════════════════════════════════════════════════════
// Aniversarios IA — EL CRITERIO
// v4.895.0
//
// PURO: sin base, sin red, sin IA, sin DOM. Todo lo que decide algo en este
// módulo vive acá y se prueba con `npm run test:anniversary`. La orquestación
// —hablar con KIE, con el modelo de visión, con S3 y con la base— vive en
// `anniversaryEngine.js` y no toma decisiones.
//
// ── QUÉ ES ESTE MÓDULO Y QUÉ NO ES ──────────────────────────────────
//
// NO es Plantillas IA. Aquél es un EDITOR: grafo de escena, capas,
// coordenadas, propiedades gráficas, y un administrador que compone. Sigue
// existiendo, no se toca y resuelve su propósito.
//
// Esto es un GENERADOR por instrucciones y resuelve otro: el administrador
// escribe en lenguaje natural cómo tiene que verse una pieza de aniversario;
// quien la necesita elige su club, dice cuántos años cumple, sube una foto y
// pulsa un botón. No hay nada que posicionar en ninguna de las dos puntas.
//
// De Plantillas IA no se importa NADA: ni `designSpec`, ni `designCompose`, ni
// `designTemplates`, ni el compilador de plantillas. Lo comprueba una prueba
// que lee este archivo — la independencia declarada en prosa no protege nada.
//
// ── LAS TRES CAPAS, Y POR QUÉ SON TRES ──────────────────────────────
//
//   Capa 1 — DISEÑO GENERADO. Fondo, decoración y la fotografía integrada.
//            La hace el modelo de imagen. Es lo único que la IA dibuja.
//   Capa 2 — CONTENIDO CONTROLADO. Nombre del club, años y mensaje. Los
//            escribimos NOSOTROS sobre la capa 1.
//   Capa 3 — BRANDING INSTITUCIONAL. Logotipos y pie, desde archivos REALES.
//
// El motivo de la capa 2 está medido en este repositorio y escrito en
// `designCompose.js`: **los modelos generativos no escriben texto de forma
// fiable**, y cuando sale mal no hay salida limpia —corregirlo encima es el
// composite que el equipo rechazó dos veces con las palabras «se ve overlay /
// montaje»—. Un aniversario lleva el nombre propio de un club y una cifra: son
// exactamente los dos textos que no pueden salir mal.
//
// El motivo de la capa 3 es más simple: el emblema de Rotary es marca
// registrada, con proporciones, colores y zona de resguardo propias. No se
// dibuja: se reproduce desde el archivo del Brand Center. Misma regla que
// `designElements.js`, que a propósito no tiene ninguna rueda.
//
// ── LA CONSECUENCIA QUE HAY QUE ENTENDER ANTES DE TOCAR EL PROMPT ───
//
// Como el texto lo imprimimos encima, el modelo TIENE QUE dejarle sitio. Si
// compone a ciegas, deja las caras justo donde va el título y la pieza sale
// inservible aunque la imagen sea preciosa. Por eso `textZoneFor` decide la
// franja limpia a partir del análisis de la fotografía, esa decisión entra al
// prompt en palabras (`clearZoneClause`) y el compositor del navegador lee
// **la misma** entrada de `TEXT_ZONES`. Son dos lados de un solo acuerdo: al
// mover una zona, se mueven los dos.
// ════════════════════════════════════════════════════════════════════

// ─── Qué genera este módulo ────────────────────────────────────────────
//
// `kind` existe para que replicar el enfoque —cumpleaños, nuevos socios,
// reconocimientos— sea una fila más y no una bifurcación del código. HOY hay
// uno solo y a propósito: el pedido dice que Aniversarios funcione
// excepcionalmente bien antes de abrir otro. Lo que se evita es hardcodear
// «aniversario» en la base, en las rutas y en el store, que es lo que
// obligaría a reescribirlos después.
export const GENERATOR_KIND = 'aniversario';
export const GENERATOR_LABEL = 'Aniversarios IA';

// ─── Formato de salida ─────────────────────────────────────────────────
//
// Catálogo CERRADO. Un formato arbitrario obligaría a rehacer la geometría de
// las zonas de texto, que está medida para el cuadrado. Los otros se declaran
// con `available:false` —como los motores del Generador de Publicaciones— para
// que la pantalla los muestre como «Próximamente» en vez de esconderlos y
// hacer creer que el sistema es sólo 1:1.
export const FORMATS = {
    square_1080: { id: 'square_1080', label: 'Cuadrado 1:1', aspect: '1:1', ratio: 1, available: true },
    portrait_4_5: { id: 'portrait_4_5', label: 'Vertical 4:5', aspect: '4:5', ratio: 0.8, available: false },
    story_9_16: { id: 'story_9_16', label: 'Historia 9:16', aspect: '9:16', ratio: 9 / 16, available: false },
};
export const FORMAT_IDS = Object.keys(FORMATS);
export const DEFAULT_FORMAT = 'square_1080';

/** El lado mayor de la exportación. No es el formato: es cuántos píxeles se
 *  descargan. 1080 es lo que piden las redes; 2160 sirve para imprimir. */
export const RESOLUTIONS = [1080, 1440, 2160];
export const DEFAULT_RESOLUTION = 1080;

export const formatById = (id) => FORMATS[id] || FORMATS[DEFAULT_FORMAT];

/** Medidas reales de la pieza, en píxeles, para una resolución dada. */
export const canvasSize = (formatId = DEFAULT_FORMAT, resolution = DEFAULT_RESOLUTION) => {
    const f = formatById(formatId);
    const res = RESOLUTIONS.includes(Number(resolution)) ? Number(resolution) : DEFAULT_RESOLUTION;
    // El lado mayor manda: en 1:1 los dos son iguales; en 4:5 y 9:16 el alto.
    if (f.ratio >= 1) return { width: res, height: Math.round(res / f.ratio) };
    return { width: Math.round(res * f.ratio), height: res };
};

// ─── Dónde cae el texto ────────────────────────────────────────────────
//
// ESTA TABLA LA LEEN DOS LADOS: el prompt, para pedirle al modelo que deje esa
// franja tranquila, y el compositor del navegador, para escribir ahí. Con dos
// tablas, el modelo despeja un lado y el texto se imprime en el otro — y eso
// no da ningún error: da una pieza con el título encima de una cara.
//
// Las medidas son FRACCIONES del lienzo (0-1), no píxeles, porque la pieza se
// compone a la resolución que se descargue.
export const TEXT_ZONES = {
    left: { id: 'left', x: 0.070, y: 0.180, w: 0.400, h: 0.560, align: 'left', words: 'la mitad izquierda' },
    right: { id: 'right', x: 0.530, y: 0.180, w: 0.400, h: 0.560, align: 'left', words: 'la mitad derecha' },
    bottom: { id: 'bottom', x: 0.090, y: 0.520, w: 0.820, h: 0.330, align: 'center', words: 'el tercio inferior' },
};
export const TEXT_ZONE_IDS = Object.keys(TEXT_ZONES);
export const DEFAULT_TEXT_ZONE = 'bottom';

/** La banda del pie institucional. Va SIEMPRE en el mismo sitio y por eso las
 *  zonas de texto terminan por encima: el branding no compite con el mensaje. */
export const FOOTER_BAND = { y: 0.880, h: 0.120 };

export const zoneById = (id) => TEXT_ZONES[id] || TEXT_ZONES[DEFAULT_TEXT_ZONE];

// ─── El estilo base, que NO se negocia ─────────────────────────────────
//
// El pedido lo dice con claridad: la IA puede variar la composición, pero
// todas las piezas tienen que pertenecer a la misma familia visual. Estas
// frases son esa familia y van SIEMPRE, delante de lo que escriba el
// administrador —que modula, no sustituye—.
//
// Están en inglés porque es el idioma en el que responden mejor los motores de
// imagen; el administrador escribe en español y su texto viaja tal cual. Misma
// decisión que `stylePrompt` en el Director Creativo (v4.839).
export const BASE_STYLE = [
    'a clean, elegant institutional celebration poster',
    'the background is predominantly white, bright and uncluttered, with generous negative space',
    'celebration elements are present but restrained: a few white and gold balloons, soft confetti, thin golden accents',
    'the palette is white, warm gold and, sparingly, deep Rotary blue',
    'the photograph is the protagonist of the composition',
    'the finish is polished and printable, like corporate stationery, never a collage',
];

/** La regla que hace posible la capa 2. Va siempre y no se recorta nunca. */
export const NO_TEXT_CLAUSE =
    'The image contains NO written text of any kind: no words, no letters, no numbers, no dates, no signatures, '
    + 'no watermark and no logos or emblems. All of that is printed on top of this image afterwards by the platform.';

/** La regla que hace posible que la fotografía siga siendo la de ese club. */
export const PRESERVE_CLAUSE =
    'The people in the supplied photograph are preserved exactly: the same faces, the same number of people, '
    + 'the same clothing and the same expressions. Nobody is added and nobody is removed. Faces are never distorted, '
    + 'never redrawn and never cropped out of the frame.';

/** Cómo se integra la fotografía. «Colocala en el lienzo» da una foto pegada:
 *  lo que produce una pieza de papelería es NOMBRAR el mecanismo. Es la misma
 *  lección que dejó escrita `designCompose.js` y se repite acá a propósito —
 *  este módulo no importa aquél, así que la frase tiene que existir en los dos
 *  sitios; lo que no puede haber es dos criterios que decidan distinto. */
export const INTEGRATION_CLAUSE =
    'The photograph is integrated into the layout, not pasted on it: it sits inside a large soft-edged shape whose '
    + 'curve follows the composition, with clean margin around it, its border blending into the white surface, and its '
    + 'light matched to the rest of the piece.';

/** Lo que el modelo no debe dibujar. Viaja en `negative_prompt`, NUNCA pegado
 *  al positivo: dentro de la descripción de la escena el modelo se obsesiona
 *  con lo prohibido, y en su propio campo lo lee como lo que es. Es la regla
 *  del sitio desde v4.705 y acá además libera presupuesto del positivo. */
export const BASE_NEGATIVE = [
    'text', 'letters', 'words', 'numbers', 'typography', 'caption', 'watermark', 'signature',
    'logo', 'emblem', 'wheel emblem', 'badge',
    'extra people', 'duplicated person', 'missing person', 'deformed face', 'distorted hands',
    'dark background', 'black background', 'busy background', 'cluttered', 'heavy texture',
    'collage', 'sticker cutout', 'harsh drop shadow', 'blurry', 'low quality',
];

// ─── Las instrucciones por defecto ─────────────────────────────────────
//
// Son un PUNTO DE PARTIDA editable, no una configuración escondida. Están
// redactadas como las escribiría el administrador —en español, sin
// tecnicismos— porque es exactamente lo que va a ver en el campo y lo que va a
// corregir. Salen textuales del pedido.
export const DEFAULT_DESIGN_INSTRUCTION =
    'Genera una pieza institucional para celebrar el aniversario de un club Rotary. '
    + 'Utiliza fondo predominantemente blanco, globos blancos y dorados, detalles de confeti discretos, '
    + 'fotografía protagonista y una composición elegante. '
    + 'El nombre del club y los años deben destacar claramente.';

export const DEFAULT_MESSAGE_INSTRUCTION =
    'Genera un mensaje corto, institucional, humano e inspirador. Máximo dos frases. '
    + 'Habla de servicio, trayectoria, amistad, comunidad e impacto.';

export const DEFAULT_RESTRICTIONS =
    'No generar logos. No inventar personas. No deformar rostros. No colocar textos sobre caras. '
    + 'No generar bloques grandes de texto. No saturar con elementos decorativos.';

// ─── Límites del texto que imprimimos ──────────────────────────────────
//
// El pedido pide explícitamente que el mensaje sea CORTO —«no generar textos
// extensos como los que actualmente aparecen en algunas plantillas»—. Estos
// números son ese pedido hecho aritmética, y son lo que el código comprueba
// después de que el modelo escribe: el modelo redacta, el código decide.
export const LIMITS = {
    title: { min: 8, max: 60 },
    message: { min: 30, max: 190 },
    // Dos o tres frases breves. Cuatro ya es un párrafo.
    messageSentences: { max: 3 },
    clubName: { max: 60 },
    years: { min: 1, max: 130 },
};

// ─── Configuración ─────────────────────────────────────────────────────

export const MAX_REFERENCES = 6;

/** Qué puede llevar la capa 3. Catálogo CERRADO: sin él, el pie aceptaría
 *  cualquier cosa y nadie sabría de dónde salió lo que se imprimió. */
export const BRANDING_FIELDS = {
    clubLogo: { id: 'clubLogo', label: 'Logotipo del club', help: 'Sale del sitio del club en la plataforma. Si el club no tiene logotipo cargado, no se dibuja nada.' },
    districtLine: { id: 'districtLine', label: 'Distrito y periodo', help: 'Distrito, gobernador y periodo rotario, tomados del registro del distrito.' },
    footerImage: { id: 'footerImage', label: 'Pie institucional', help: 'Una imagen que subas vos y se imprime abajo. Es el sitio de los emblemas oficiales.' },
    watermark: { id: 'watermark', label: 'Marca de agua', help: 'Una imagen tenue en una esquina.' },
};
export const BRANDING_IDS = Object.keys(BRANDING_FIELDS);

export const DEFAULT_CONFIG = Object.freeze({
    name: 'Aniversarios IA',
    enabled: false,
    format: DEFAULT_FORMAT,
    resolution: DEFAULT_RESOLUTION,
    // Alcance. `all` es lo razonable para un generador institucional; `clubs`
    // permite acotarlo mientras se prueba.
    scope: { mode: 'all', clubIds: [] },
    references: [],
    designInstruction: DEFAULT_DESIGN_INSTRUCTION,
    messageInstruction: DEFAULT_MESSAGE_INSTRUCTION,
    restrictions: DEFAULT_RESTRICTIONS,
    branding: {
        clubLogo: true,
        districtLine: true,
        footerImage: null,   // URL de un archivo real, o null
        watermark: null,
    },
    // El nombre del club se escribe en la pieza. `Club Rotario X` es la forma
    // completa y la ofrece `publicClubs.clubDisplayName`; acá sólo se declara
    // si se usa esa forma o el nombre tal cual lo escribió la persona.
    useFullClubName: true,
});

const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
const bool = (v, fallback = false) => (typeof v === 'boolean' ? v : fallback);
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** Una URL que se puede dibujar en una pieza. Se admite `https` y el data URL
 *  de una imagen; nada más. Estas direcciones terminan en un `<img>` de una
 *  página pública, así que aceptar cualquier esquema convertiría un campo del
 *  panel en un hueco por donde meter cualquier cosa — misma cautela que
 *  `normalizeMapUrl` con el mapa de una sede (v4.717). */
export const isDrawableImage = (raw) => {
    const s = String(raw || '').trim();
    if (!s) return false;
    if (/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/i.test(s)) return true;
    return /^https:\/\/[^\s"'<>]+$/i.test(s);
};

export const normalizeReference = (raw) => {
    const url = typeof raw === 'string' ? raw : str(raw?.url);
    if (!isDrawableImage(url)) return null;
    return {
        url,
        note: clean(typeof raw === 'string' ? '' : raw?.note).slice(0, 160),
        primary: typeof raw === 'object' && raw !== null ? bool(raw.primary) : false,
    };
};

export const normalizeConfig = (raw) => {
    const c = raw && typeof raw === 'object' ? raw : {};
    const format = FORMAT_IDS.includes(c.format) && FORMATS[c.format].available ? c.format : DEFAULT_FORMAT;
    const scopeMode = c?.scope?.mode === 'clubs' ? 'clubs' : 'all';

    const references = (Array.isArray(c.references) ? c.references : [])
        .map(normalizeReference).filter(Boolean).slice(0, MAX_REFERENCES);
    // Una sola referencia PRINCIPAL: es la que viaja al modelo como imagen de
    // dirección creativa. Con dos, «la primera imagen» del prompt deja de
    // significar algo. Si nadie la marcó, manda la primera.
    let vistaPrincipal = false;
    for (const r of references) {
        if (r.primary && !vistaPrincipal) { vistaPrincipal = true; continue; }
        r.primary = false;
    }
    if (!vistaPrincipal && references.length) references[0].primary = true;

    const b = c.branding && typeof c.branding === 'object' ? c.branding : {};
    return {
        name: clean(c.name) || DEFAULT_CONFIG.name,
        enabled: bool(c.enabled, DEFAULT_CONFIG.enabled),
        format,
        resolution: RESOLUTIONS.includes(Number(c.resolution)) ? Number(c.resolution) : DEFAULT_RESOLUTION,
        scope: {
            mode: scopeMode,
            clubIds: scopeMode === 'clubs'
                ? [...new Set((Array.isArray(c.scope?.clubIds) ? c.scope.clubIds : []).map(v => String(v || '').trim()).filter(Boolean))]
                : [],
        },
        references,
        designInstruction: str(c.designInstruction, DEFAULT_DESIGN_INSTRUCTION).trim().slice(0, 2000),
        messageInstruction: str(c.messageInstruction, DEFAULT_MESSAGE_INSTRUCTION).trim().slice(0, 1200),
        restrictions: str(c.restrictions, DEFAULT_RESTRICTIONS).trim().slice(0, 1200),
        branding: {
            clubLogo: bool(b.clubLogo, true),
            districtLine: bool(b.districtLine, true),
            footerImage: isDrawableImage(b.footerImage) ? String(b.footerImage).trim() : null,
            watermark: isDrawableImage(b.watermark) ? String(b.watermark).trim() : null,
        },
        useFullClubName: bool(c.useFullClubName, true),
    };
};

/** ¿A qué sitios alcanza? El alcance lo resuelve el SERVIDOR, nunca la
 *  pantalla: con la comprobación en el navegador, quien conozca el endpoint
 *  genera igual. */
export const scopeReaches = (config, clubId) => {
    const c = normalizeConfig(config);
    if (c.scope.mode === 'all') return true;
    return !!clubId && c.scope.clubIds.includes(String(clubId));
};

// ─── Validación de la configuración ────────────────────────────────────
//
// `errors` impide PUBLICAR; `warnings` se publica y se dice. Tratarlos igual
// convierte cualquier observación en un bloqueo y se dejan de leer — la regla
// del panel de tarifas (v4.854).
export const validateConfig = (raw) => {
    const c = normalizeConfig(raw);
    const errors = [];
    const warnings = [];

    if (!c.designInstruction || c.designInstruction.length < 40) {
        errors.push('La instrucción de generación está vacía o es demasiado corta: es lo único que le dice al modelo cómo tiene que verse la pieza.');
    }
    if (!c.messageInstruction || c.messageInstruction.length < 20) {
        errors.push('Falta la instrucción del mensaje: sin ella, el texto que se imprime en la pieza no tiene criterio.');
    }
    if (!c.references.length) {
        warnings.push('No hay ninguna referencia visual. La pieza se va a generar igual, pero sin una imagen de estilo el resultado se parece menos entre una generación y la siguiente.');
    }
    if (!c.restrictions) {
        warnings.push('No hay restricciones escritas. Las reglas del sistema —sin texto, sin logos, sin inventar personas— se aplican igual; esto es lo que agregarías vos.');
    }
    if (c.scope.mode === 'clubs' && !c.scope.clubIds.length) {
        errors.push('Elegiste habilitarlo sólo en algunos sitios y no seleccionaste ninguno: así no estaría disponible en ninguna parte.');
    }
    if (c.branding.clubLogo && c.branding.footerImage === null && !c.branding.districtLine) {
        warnings.push('El pie institucional va a quedar sólo con el logotipo del club, y los clubes que no lo tengan cargado no van a mostrar ninguna marca.');
    }
    return { ok: errors.length === 0, errors, warnings, config: c };
};

// ─── Huella y versionado ───────────────────────────────────────────────
//
// El pedido pide trazabilidad, no un control de versiones. La huella cubre
// SÓLO lo que cambia el resultado: las tres instrucciones, las referencias, el
// formato y el branding. El nombre interno o el interruptor de activo no
// entran — renombrar la configuración no es una versión nueva de la pieza.
export const fingerprintOf = (raw) => {
    const c = normalizeConfig(raw);
    const material = JSON.stringify([
        c.format, c.resolution,
        c.designInstruction, c.messageInstruction, c.restrictions,
        c.references.map(r => [r.url, r.primary]),
        [c.branding.clubLogo, c.branding.districtLine, c.branding.footerImage, c.branding.watermark],
        c.useFullClubName,
    ]);
    // FNV-1a de 32 bits en hexadecimal. No es criptografía: es una etiqueta
    // estable para saber si dos configuraciones son la misma. Determinista a
    // propósito — con `Math.random` la misma configuración daría dos versiones.
    let h = 0x811c9dc5;
    for (let i = 0; i < material.length; i++) {
        h ^= material.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
};

/** ¿El cambio merece una versión nueva? Sólo si cambia lo que se imprime. */
export const isSignificantChange = (before, after) => fingerprintOf(before) !== fingerprintOf(after);

// ─── El análisis de la fotografía ──────────────────────────────────────
//
// Lo hace un modelo de VISIÓN, y lo que devuelve pasa por acá antes de decidir
// nada. Es la regla del sitio: el modelo describe, el código decide. Una
// respuesta que no se entiende no bloquea —`fallbackAnalysis` arma la pieza con
// criterio propio— porque una foto sin analizar sigue siendo generable.

export const ANALYSIS_SYSTEM = `Sos un director de arte que prepara una fotografía para una pieza gráfica de aniversario. Mirás UNA fotografía y devolvés SIEMPRE un JSON válido, sin texto alrededor y sin explicaciones.

Devolvés exactamente esta forma:
{
  "people": <entero: cuántas personas se ven; 0 si no hay ninguna>,
  "faces": <entero: cuántos rostros se distinguen>,
  "group": <true si es una foto de grupo (3 o más personas), false si no>,
  "orientation": "horizontal" | "vertical" | "cuadrada",
  "subjectSide": "izquierda" | "derecha" | "centro",
  "freeSide": "izquierda" | "derecha" | "abajo" | "arriba" | "ninguno",
  "scene": "<una frase corta, en español, de qué se ve; sin inventar nombres, lugares ni fechas>",
  "dominantLight": "clara" | "media" | "oscura",
  "hasText": <true si en la fotografía hay carteles, pendones o textos legibles>,
  "quality": "alta" | "media" | "baja"
}

Reglas:
- "subjectSide" es dónde se concentran las personas o el motivo principal.
- "freeSide" es el lado con MENOS contenido importante, donde se podría escribir sin tapar a nadie. Si no hay ninguno claro, respondé "ninguno".
- No inventes datos que no se vean. Si dudás de una cifra, dá la más baja.
- No describas ropa, etnia ni rasgos de las personas.`;

export const ANALYSIS_USER = 'Analizá esta fotografía y devolvé únicamente el JSON.';

const SIDES = ['izquierda', 'derecha', 'centro'];
const FREE = ['izquierda', 'derecha', 'abajo', 'arriba', 'ninguno'];

const intOr = (v, fallback, min, max) => {
    const n = Number.parseInt(v, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
};

/** Convierte lo que contestó el modelo en un análisis utilizable. Nunca lanza:
 *  devuelve el respaldo si no hay nada legible. */
export const readAnalysis = (raw) => {
    let obj = raw;
    if (typeof raw === 'string') {
        const m = raw.match(/\{[\s\S]*\}/);
        try { obj = JSON.parse(m ? m[0] : raw); } catch { obj = null; }
    }
    if (!obj || typeof obj !== 'object') return { ...fallbackAnalysis(), read: false };

    const people = intOr(obj.people, 0, 0, 400);
    return {
        read: true,
        people,
        faces: intOr(obj.faces, Math.min(people, 8), 0, 400),
        group: typeof obj.group === 'boolean' ? obj.group : people >= 3,
        orientation: ['horizontal', 'vertical', 'cuadrada'].includes(obj.orientation) ? obj.orientation : 'horizontal',
        subjectSide: SIDES.includes(obj.subjectSide) ? obj.subjectSide : 'centro',
        freeSide: FREE.includes(obj.freeSide) ? obj.freeSide : 'ninguno',
        scene: clean(obj.scene).slice(0, 180),
        dominantLight: ['clara', 'media', 'oscura'].includes(obj.dominantLight) ? obj.dominantLight : 'media',
        hasText: typeof obj.hasText === 'boolean' ? obj.hasText : false,
        quality: ['alta', 'media', 'baja'].includes(obj.quality) ? obj.quality : 'media',
    };
};

/** Cuando el modelo de visión no contesta. No adivina nada sobre las personas
 *  —`read:false` viaja hasta la pantalla— y manda el texto al tercio inferior,
 *  que es la zona que nunca compite con un rostro en una foto de grupo. */
export const fallbackAnalysis = (dimensions = null) => {
    const w = Number(dimensions?.width) || 0;
    const h = Number(dimensions?.height) || 0;
    const orientation = !w || !h ? 'horizontal' : (w > h * 1.08 ? 'horizontal' : (h > w * 1.08 ? 'vertical' : 'cuadrada'));
    return {
        read: false, people: 0, faces: 0, group: false,
        orientation, subjectSide: 'centro', freeSide: 'ninguno',
        scene: '', dominantLight: 'media', hasText: false, quality: 'media',
    };
};

// ─── Dónde va el texto ─────────────────────────────────────────────────
//
// La regla del pedido, literal: «si las personas se concentran a la derecha,
// utilizar preferentemente el área izquierda para textos; si se concentran a la
// izquierda, invertir la composición».
//
// El lado LIBRE que declaró el modelo manda sobre el lado del sujeto, porque
// responde la pregunta directamente. `centro` cae abajo: en una foto de grupo
// centrada no hay costado libre, y escribir sobre el centro es escribir sobre
// las caras.
export const textZoneFor = (analysis) => {
    const a = analysis && typeof analysis === 'object' ? analysis : {};
    if (a.freeSide === 'izquierda') return 'left';
    if (a.freeSide === 'derecha') return 'right';
    if (a.freeSide === 'abajo') return 'bottom';
    if (a.subjectSide === 'derecha') return 'left';
    if (a.subjectSide === 'izquierda') return 'right';
    return DEFAULT_TEXT_ZONE;
};

// ─── El prompt de la imagen ────────────────────────────────────────────

/** La franja que el modelo tiene que dejar tranquila, dicha en PALABRAS. En
 *  coordenadas no se cumple; en palabras, sí. Y se dice el PORQUÉ, que es lo
 *  que hace que el modelo lo respete. */
export const clearZoneClause = (zoneId) => {
    const z = zoneById(zoneId);
    return `Leave ${z.words} of the canvas visually calm — mostly plain white surface, no faces and no busy decoration there — `
        + `because a headline and a short paragraph will be printed on top of that area afterwards.`;
};

/**
 * El presupuesto del prompt. 2500 es el tope que declara la familia de modelos
 * que usa la pasarela, y NO es un número puesto a ojo: con la instrucción por
 * defecto el prompt completo mide **2.148** caracteres —núcleo 1.108,
 * dirección de arte 357, estilo 461, ambiente 219—, así que en el caso normal
 * no se sacrifica nada. Lo que puede desbordarlo es una instrucción del
 * administrador muy larga, y entonces se recorta por el final.
 *
 * **Al agregar una frase al prompt, medir.** Es la regla del Creador de Reels,
 * donde el peor caso llegó a 4.362 sin que nada avisara.
 */
export const PROMPT_MAX_CHARS = Number(process.env.ANNIVERSARY_PROMPT_MAX_CHARS) || 2500;

/**
 * Arma el prompt positivo.
 *
 * EL ORDEN ES EL ORDEN DE SACRIFICIO, y está elegido a propósito:
 *
 *   1. Lo que sostiene la arquitectura —sin texto, sin logos, preservar a las
 *      personas, dejar libre la franja— NO se recorta nunca. Sin eso la pieza
 *      no es publicable, por bonita que salga.
 *   2. La INSTRUCCIÓN DEL ADMINISTRADOR va antes que el estilo genérico. Es su
 *      dirección de arte: que sobreviva un adjetivo escrito por nosotros
 *      mientras se cae lo que él escribió sería al revés. Es la lección de
 *      v4.754 en el Director Creativo.
 *   3. El estilo base y el ambiente se sacrifican primero.
 */
export const buildImagePrompt = ({ config, years = null, analysis = null, zoneId = null, hasReference = false } = {}) => {
    const c = normalizeConfig(config);
    const zona = zoneId || textZoneFor(analysis);
    const a = analysis || fallbackAnalysis();

    const nucleo = [
        hasReference
            ? 'Using the first image as the STYLE REFERENCE for palette, decoration and layout, and the second image as the PHOTOGRAPH, build a single new square piece.'
            : 'Build a single new square piece around the supplied photograph.',
        INTEGRATION_CLAUSE,
        clearZoneClause(zona),
        PRESERVE_CLAUSE,
        NO_TEXT_CLAUSE,
    ];

    // Lo que aporta el administrador. Va en español tal cual lo escribió: los
    // motores actuales lo entienden, y traducirlo sería reescribir su
    // dirección de arte con nuestras palabras.
    const direccion = c.designInstruction
        ? [`Art direction from the client, follow it closely (written in Spanish): «${c.designInstruction}»`]
        : [];

    const ambiente = [];
    if (a.people === 0) {
        // La lección del censo universal (v4.785): una frase escrita para «la
        // foto típica» sobre una foto vacía es una invitación a poblarla.
        ambiente.push('The photograph has no people in it and none are added: the celebration is expressed only through the decoration around it.');
    } else if (a.group) {
        ambiente.push('The photograph is a group portrait; the whole group stays visible and complete inside the shape.');
    }
    if (a.dominantLight === 'oscura') {
        ambiente.push('The photograph is darker than the page; the surrounding white surface stays bright and the transition between them is soft.');
    }
    if (years) {
        // El número NO se dibuja —lo imprimimos nosotros—, pero decirle al
        // modelo que es una efeméride redonda cambia el tono de la decoración.
        ambiente.push(`The piece celebrates a milestone anniversary of ${years} years, so the decoration feels commemorative rather than festive-party.`);
    }

    const nucleoTexto = nucleo.join(' ');
    const direccionTexto = direccion.join(' ');
    const estiloTexto = BASE_STYLE.join('; ') + '.';
    const ambienteTexto = ambiente.join(' ');

    const dropped = [];
    const armar = (partes) => partes.filter(Boolean).join('\n');

    // El ORDEN DE SACRIFICIO, de lo primero que se cae a lo último:
    // ambiente → estilo → (recortar la dirección de arte). El núcleo no se
    // toca nunca: sin él la pieza no es publicable.
    let partes = [nucleoTexto, direccionTexto, estiloTexto, ambienteTexto];
    if (armar(partes).length > PROMPT_MAX_CHARS && ambienteTexto) {
        dropped.push('ambiente'); partes = [nucleoTexto, direccionTexto, estiloTexto];
    }
    if (armar(partes).length > PROMPT_MAX_CHARS && estiloTexto) {
        dropped.push('estilo'); partes = [nucleoTexto, direccionTexto];
    }

    // ⚠️ LA DIRECCIÓN DE ARTE SE RECORTA, NUNCA SE ELIMINA. Es lo ÚNICO del
    // prompt que es específico de ESTA configuración: todo lo demás lo
    // escribimos nosotros y es igual en todas las piezas. Tirarla entera
    // dejaría al administrador editando un campo que no llega al modelo, y el
    // fallo sería mudo. Misma decisión que `motionHint` en el Creador de Reels.
    let recorte = direccionTexto;
    if (armar(partes).length > PROMPT_MAX_CHARS && recorte) {
        const sitio = Math.max(0, PROMPT_MAX_CHARS - nucleoTexto.length - 2);
        recorte = trimWords(recorte, sitio);
        dropped.push('direccion(recortada)');
        partes = [nucleoTexto, recorte];
    }

    let prompt = armar(partes);
    // Sólo si ni siquiera el núcleo entra —un tope de entorno absurdamente
    // bajo— se recorta él, y se DICE: a esa altura ya se está perdiendo una
    // regla que sostiene la arquitectura.
    if (prompt.length > PROMPT_MAX_CHARS) {
        dropped.push('nucleo(recortado)');
        prompt = prompt.slice(0, PROMPT_MAX_CHARS);
    }
    return { prompt, zoneId: zona, dropped };
};

export const buildNegativePrompt = (config) => {
    const c = normalizeConfig(config);
    // Las restricciones del administrador están escritas en negativo y en
    // español («No generar logos»). Es su idioma natural para prohibir y por
    // eso el campo existe; se manda tal cual, en el campo de negativos, que es
    // donde un modelo lee una prohibición sin obsesionarse con ella.
    const suyas = c.restrictions ? [c.restrictions] : [];
    return [...BASE_NEGATIVE, ...suyas].join(', ').slice(0, 2000);
};

// ─── El texto de la pieza ──────────────────────────────────────────────
//
// Dos campos y nada más: TÍTULO y MENSAJE. El modelo los escribe; el código
// comprueba que sirvan y, si no, le devuelve LA REGLA CONCRETA que rompió —
// pedirle «revisá el formato» no corrige nada (regla de `templateComposer.js`
// y de `seoAI.js`).

export const buildCopySystem = (config) => {
    const c = normalizeConfig(config);
    return `Sos redactor institucional de Rotary. Escribís en español neutro, con voz humana, sin clichés y sin signos de exclamación de más. Devolvés SIEMPRE un JSON válido, sin texto alrededor.

Forma exacta:
{ "title": "<titular>", "message": "<mensaje>" }

Instrucción del cliente para el mensaje (respetala): «${c.messageInstruction}»

Reglas que no se negocian:
- El titular tiene entre ${LIMITS.title.min} y ${LIMITS.title.max} caracteres. Es un titular, no una frase larga.
- El mensaje tiene entre ${LIMITS.message.min} y ${LIMITS.message.max} caracteres y como máximo ${LIMITS.messageSentences.max} frases.
- Escribís el nombre del club EXACTAMENTE como se te da. No lo abrevies, no lo traduzcas y no lo cambies.
- Si mencionás los años, usá EXACTAMENTE el número que se te da.
- PROHIBIDO inventar fechas, días de la semana, horarios, lugares, cifras de personas, montos y nombres propios que no estén en el contexto.
- Sin hashtags, sin emojis, sin enlaces, sin «link en la bio»: esto se imprime dentro de una imagen, no se publica como pie de foto.
- Sin marcadores del tipo {{algo}}.`;
};

export const buildCopyUser = ({ clubName, years, analysis = null } = {}) => {
    const a = analysis || {};
    const lineas = [
        `Club: ${clubName}`,
        years ? `Años que cumple: ${years}` : 'No se conoce cuántos años cumple: no menciones ninguna cifra de años.',
    ];
    if (a.scene) lineas.push(`Lo que se ve en la fotografía: ${a.scene}`);
    if (a.people > 0) lineas.push(`Hay personas en la fotografía (${a.people}).`);
    else if (a.read) lineas.push('La fotografía no muestra personas.');
    lineas.push('Devolvé únicamente el JSON con el titular y el mensaje.');
    return lineas.join('\n');
};

const countSentences = (text) => String(text || '').split(/[.!?…]+/).map(s => s.trim()).filter(Boolean).length;

/** Lee la respuesta del modelo. Nunca lanza. */
export const readCopy = (raw) => {
    let obj = raw;
    if (typeof raw === 'string') {
        const m = raw.match(/\{[\s\S]*\}/);
        try { obj = JSON.parse(m ? m[0] : raw); } catch { obj = null; }
    }
    if (!obj || typeof obj !== 'object') return null;
    const title = clean(obj.title ?? obj.titulo);
    const message = clean(obj.message ?? obj.mensaje);
    if (!title && !message) return null;
    return { title, message };
};

/**
 * El CÓDIGO decide si el texto sirve. Devuelve las reglas rotas con su número,
 * que es lo que se le devuelve al modelo en el reintento.
 */
export const validateCopy = (copy, { clubName = '', years = null } = {}) => {
    const c = copy || { title: '', message: '' };
    const errors = [];
    const warnings = [];
    const t = clean(c.title);
    const m = clean(c.message);

    if (!t) errors.push('Falta el titular.');
    else if (t.length > LIMITS.title.max) errors.push(`El titular tiene ${t.length} caracteres y el máximo es ${LIMITS.title.max}.`);
    else if (t.length < LIMITS.title.min) errors.push(`El titular tiene ${t.length} caracteres y el mínimo es ${LIMITS.title.min}.`);

    if (!m) errors.push('Falta el mensaje.');
    else {
        if (m.length > LIMITS.message.max) errors.push(`El mensaje tiene ${m.length} caracteres y el máximo es ${LIMITS.message.max}.`);
        if (m.length < LIMITS.message.min) errors.push(`El mensaje tiene ${m.length} caracteres y el mínimo es ${LIMITS.message.min}.`);
        const frases = countSentences(m);
        if (frases > LIMITS.messageSentences.max) errors.push(`El mensaje tiene ${frases} frases y el máximo es ${LIMITS.messageSentences.max}.`);
    }

    const todo = `${t} ${m}`;
    if (/\{\{[^}]*\}\}/.test(todo)) errors.push('Quedó un marcador sin resolver del tipo {{algo}}.');
    if (/#\w/.test(todo)) errors.push('No se admiten hashtags: esto se imprime dentro de la imagen.');
    if (/https?:\/\//i.test(todo)) errors.push('No se admiten enlaces.');
    // Los emojis se comprueban por rango, no por lista: una lista se queda
    // corta con el primer emoji que no está en ella.
    if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(todo)) errors.push('No se admiten emojis.');

    // Los años se IMPRIMEN aparte; que el mensaje diga otro número es una
    // contradicción visible en la misma pieza.
    if (years) {
        const otros = [...todo.matchAll(/\b(\d{1,3})\s*(?:años|aniversario)/gi)].map(x => Number(x[1]));
        if (otros.some(n => n !== Number(years))) {
            errors.push(`El texto menciona una cantidad de años distinta de ${years}.`);
        }
    }
    if (clubName && t && m && !todo.toLowerCase().includes(String(clubName).toLowerCase().slice(0, 12))) {
        warnings.push('El texto no nombra al club. Se imprime igual, porque el nombre va en su propia línea de la pieza.');
    }
    return { ok: errors.length === 0, errors, warnings };
};

/** Recorta sin partir palabras. Un texto cortado a mitad de palabra se lee como
 *  un error del sistema. */
export const trimWords = (text, max) => {
    const s = clean(text);
    if (s.length <= max) return s;
    const corte = s.slice(0, max);
    const espacio = corte.lastIndexOf(' ');
    return (espacio > max * 0.6 ? corte.slice(0, espacio) : corte).replace(/[,;:.\s]+$/, '');
};

/**
 * Agotados los reintentos, el trabajo NO se tira: se ajusta lo ajustable por
 * código y se entrega CON SUS AVISOS. Un titular dos caracteres largo es mejor
 * que ninguna pieza, y quien la mira lo ve. Mismo criterio que `composeMeta`
 * en el SEO y que el asistente de redacción de Noticias (v4.891).
 *
 * REPARAR NO INVENTA CONTENIDO: un mensaje corto sigue siendo corto y la
 * validación lo sigue diciendo. Alargarlo para pasar el umbral sería
 * exactamente lo que la regla de veracidad prohíbe.
 */
export const repairCopy = (copy, { clubName = '', years = null } = {}) => {
    const c = copy || {};
    const repaired = [];
    let title = clean(c.title);
    let message = clean(c.message);

    if (title.length > LIMITS.title.max) { title = trimWords(title, LIMITS.title.max); repaired.push('Se recortó el titular.'); }
    if (message.length > LIMITS.message.max) { message = trimWords(message, LIMITS.message.max); repaired.push('Se recortó el mensaje.'); }

    // Un titular ausente se DERIVA de datos que ya tenemos; no se inventa nada
    // que no esté en el formulario.
    if (!title && clubName) {
        title = years ? `${years} años del ${clubName}` : `¡Feliz aniversario, ${clubName}!`;
        title = trimWords(title, LIMITS.title.max);
        repaired.push('El titular se compuso con el nombre del club y los años.');
    }
    const check = validateCopy({ title, message }, { clubName, years });
    return { copy: { title, message }, repaired, ...check };
};

// ─── Cómo se llama el club en la pieza ─────────────────────────────────
//
// La forma completa la construye `publicClubs.clubDisplayName`, que ya la usa
// el portal de Plantillas IA y los formularios de la Feria. Acá sólo se decide
// SI se usa. Duplicar esa función daría dos formas de nombrar al mismo club.
export const printableClubName = (raw, { useFullClubName = true, displayName = null } = {}) => {
    const escrito = clean(raw);
    if (!escrito) return '';
    const nombre = useFullClubName && displayName ? clean(displayName) : escrito;
    return nombre.slice(0, LIMITS.clubName.max);
};

export const normalizeYears = (raw) => {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return null;
    if (n < LIMITS.years.min || n > LIMITS.years.max) return null;
    return n;
};

// ─── La validación de la pieza ─────────────────────────────────────────
//
// ⚠️ ACÁ SE DICE EXACTAMENTE QUÉ SE MIDE Y QUÉ NO, y la distinción importa más
// que la lista: un control que afirma comprobar algo que no comprueba manda a
// confiar donde no hay que confiar. Es la lección de v4.705 y de v4.790.
//
// SE GARANTIZA POR CONSTRUCCIÓN (no hace falta medirlo — lo escribimos
// nosotros en la capa 2 y la capa 3):
//   · el nombre del club, · los años, · el mensaje corto, · el branding,
//   · que ningún texto crítico caiga fuera de su zona.
//
// SE MIDE:
//   · el formato del archivo entregado (ancho y alto),
//   · cuánto blanco tiene el fondo (media de luminancia + proporción de
//     píxeles casi blancos, con sharp),
//   · si la franja del texto está tranquila (luminancia y desviación típica de
//     ESA región, no de la imagen entera — la lección de v4.715: sobre la
//     escena completa la señal se diluye 23 veces),
//   · si la fotografía se conservó: personas inventadas, personas que
//     desaparecen y consistencia de rostros (`designGuard.checkPreservation`,
//     reutilizado — copiar una medición es la forma segura de que las dos
//     mitades se separen en silencio).
//
// NO SE MIDE, y por eso no se afirma en ninguna pantalla:
//   · «estética de aniversario». No hay forma de medir si una pieza se ve
//     festiva. Se PIDE en el prompt y se MUESTRA al usuario, que decide.
//   · que la imagen no traiga texto dibujado. Detectarlo exige OCR, que son
//     decenas de MB en una función que ya empaqueta FFmpeg dentro del tope de
//     250 MB, y sería poco fiable. Se pide por `negative_prompt` y la decisión
//     queda a la vista: el usuario ve la pieza antes de descargarla.

export const PIECE_CHECKS = {
    // Por debajo de esta media de luminancia (0-255) el fondo no es blanco.
    whiteMinLuma: 205,
    // Qué proporción de la imagen tiene que ser casi blanca para llamarla
    // «fondo predominantemente blanco».
    whiteMinShare: 0.35,
    // La franja del texto: cuanto más baja la desviación típica, más lisa.
    // Medido sobre composiciones reales, una franja utilizable queda por
    // debajo de 58; una foto a página completa pasa de 70.
    zoneMaxStdDev: 58,
    zoneMinLuma: 175,
    // Cuánto puede desviarse la proporción entregada de la pedida.
    aspectTolerance: 0.04,
};

/**
 * Junta las mediciones y decide. `critical` es lo que impide entregar la
 * composición —y dispara la corrección automática—; `notes` se entrega y se
 * dice. Es PURA: recibe las mediciones ya hechas.
 */
export const judgePiece = ({
    width = 0, height = 0, format = DEFAULT_FORMAT,
    meanLuma = null, whiteShare = null,
    zoneLuma = null, zoneStdDev = null,
    preservation = null,
} = {}) => {
    const esperado = formatById(format).ratio;
    const critical = [];
    const notes = [];
    const measured = [];

    if (width && height) {
        measured.push('formato');
        const real = width / height;
        if (Math.abs(real - esperado) / esperado > PIECE_CHECKS.aspectTolerance) {
            // No se recorta para corregirlo: se dice. Recortar la salida de un
            // modelo es exactamente lo que la regla #1 del sitio prohíbe.
            notes.push(`La imagen volvió en ${width}×${height}, que no es la proporción ${formatById(format).aspect} pedida. Se encuadra al componer.`);
        }
    }

    if (meanLuma !== null && whiteShare !== null) {
        measured.push('fondo blanco');
        if (meanLuma < PIECE_CHECKS.whiteMinLuma || whiteShare < PIECE_CHECKS.whiteMinShare) {
            critical.push({
                id: 'fondo_no_blanco',
                reason: `El fondo no quedó predominantemente blanco (luminancia media ${Math.round(meanLuma)} y ${Math.round(whiteShare * 100)} % de píxeles claros).`,
                consequence: 'Sobre un fondo oscuro el texto que imprimimos encima se vuelve difícil de leer.',
            });
        }
    }

    if (zoneLuma !== null && zoneStdDev !== null) {
        measured.push('franja del texto');
        if (zoneStdDev > PIECE_CHECKS.zoneMaxStdDev || zoneLuma < PIECE_CHECKS.zoneMinLuma) {
            critical.push({
                id: 'franja_ocupada',
                reason: `La franja donde va el texto quedó ocupada (luminancia ${Math.round(zoneLuma)}, variación ${Math.round(zoneStdDev)}).`,
                consequence: 'El titular y el mensaje caerían encima del contenido de la fotografía.',
            });
        }
    }

    if (preservation && preservation.state) {
        if (preservation.state === 'unavailable') {
            // «No se pudo comprobar» NO es un tipo de «bien» y se dice distinto.
            // Misma regla que `unknown` en el diagnóstico del CRM.
            notes.push('No se pudo comprobar si la fotografía se conservó. La pieza se generó igual; conviene mirarla antes de publicarla.');
        } else {
            measured.push('fotografía conservada');
            if (!preservation.use) {
                critical.push({
                    id: 'fotografia_alterada',
                    reason: preservation.reason || 'La composición alteró a las personas de la fotografía.',
                    consequence: preservation.consequence || 'Una pieza institucional no puede mostrar a alguien que no estuvo ahí.',
                });
            } else if (preservation.cropped) {
                notes.push('El encuadre se llevó a alguien de los bordes de la fotografía.');
            }
        }
    }

    return { ok: critical.length === 0, critical, notes, measured };
};

/** Qué se le pide de más al modelo cuando hay que reintentar. Se le dice el
 *  problema CONCRETO, no «hacelo mejor»: es la misma regla que el reintento
 *  del copy. */
export const retryClauseFor = (critical) => {
    const ids = new Set((critical || []).map(c => c.id));
    const frases = [];
    if (ids.has('fondo_no_blanco')) frases.push('The background must be a bright, almost pure white page; keep colour only in the decorative accents.');
    if (ids.has('franja_ocupada')) frases.push('The area reserved for the headline must be left as plain white surface, with nothing on it at all.');
    if (ids.has('fotografia_alterada')) frases.push('Keep the supplied photograph untouched: same people, same faces, same count. Change only what surrounds it.');
    return frases.join(' ');
};

// ─── Las etapas que ve quien genera ────────────────────────────────────
//
// Están acá y no en la pantalla porque son el CONTRATO del pipeline: cada una
// corresponde a una llamada real que ocurre. Una barra de progreso inventada
// hace esperar por nada — la regla del portal de Plantillas IA (v4.756).
export const STAGES = [
    { id: 'prepare', label: 'Preparando los datos', icon: '✨' },
    { id: 'analyze', label: 'Analizando la fotografía', icon: '🖼' },
    { id: 'write', label: 'Creando el mensaje', icon: '✍️' },
    { id: 'compose', label: 'Diseñando la pieza', icon: '🎨' },
    { id: 'verify', label: 'Verificando el resultado', icon: '🔍' },
    { id: 'done', label: 'Aniversario listo', icon: '✓' },
];
export const STAGE_IDS = STAGES.map(s => s.id);

// ─── Estados de una pieza ──────────────────────────────────────────────
export const PIECE_STATES = ['draft', 'analyzed', 'written', 'composing', 'ready', 'failed'];

/** Cómo se compone la pieza. `ai` es el camino normal; `plain` es la salida
 *  honesta cuando la composición no se pudo usar: la fotografía intacta sobre
 *  fondo blanco. NO es un segundo sistema de diseño — es el MISMO compositor
 *  con la capa 1 vacía— y se DICE en la pantalla. */
export const RENDER_MODES = ['ai', 'plain'];

export default {
    GENERATOR_KIND, GENERATOR_LABEL,
    FORMATS, FORMAT_IDS, DEFAULT_FORMAT, RESOLUTIONS, DEFAULT_RESOLUTION, formatById, canvasSize,
    TEXT_ZONES, TEXT_ZONE_IDS, DEFAULT_TEXT_ZONE, FOOTER_BAND, zoneById,
    BASE_STYLE, NO_TEXT_CLAUSE, PRESERVE_CLAUSE, INTEGRATION_CLAUSE, BASE_NEGATIVE,
    DEFAULT_DESIGN_INSTRUCTION, DEFAULT_MESSAGE_INSTRUCTION, DEFAULT_RESTRICTIONS,
    LIMITS, MAX_REFERENCES, BRANDING_FIELDS, BRANDING_IDS, DEFAULT_CONFIG,
    isDrawableImage, normalizeReference, normalizeConfig, scopeReaches, validateConfig,
    fingerprintOf, isSignificantChange,
    ANALYSIS_SYSTEM, ANALYSIS_USER, readAnalysis, fallbackAnalysis, textZoneFor,
    clearZoneClause, PROMPT_MAX_CHARS, buildImagePrompt, buildNegativePrompt,
    buildCopySystem, buildCopyUser, readCopy, validateCopy, trimWords, repairCopy,
    printableClubName, normalizeYears,
    PIECE_CHECKS, judgePiece, retryClauseFor, STAGES, STAGE_IDS, PIECE_STATES, RENDER_MODES,
};
