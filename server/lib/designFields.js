// ════════════════════════════════════════════════════════════════════
// Plantillas IA — CAMPOS VINCULADOS
// v4.723.0
//
// PURO: sin base, sin red, sin IA, sin DOM. Define qué es un campo vinculado,
// cómo se declara, cómo se normaliza y —lo que de verdad decide el resultado—
// cómo se adapta la imagen que sube el público según QUÉ CLASE de campo es.
//
// ── LA CLAVE NO SE GUARDA DOS VECES ─────────────────────────────────
//
// Un campo vinculado NO tiene su propio `key`. La clave sigue donde ya estaba:
// `srcVar` en una imagen y el `{{marcador}}` de `srcText` en un texto. Lo que
// este archivo agrega es la CONFIGURACIÓN de ese campo —etiqueta, ayuda,
// obligatorio, visible, valor por defecto, cómo se adapta la imagen— y vive en
// `node.field`.
//
// Guardar la clave también dentro de `node.field` habría sido lo cómodo y es
// exactamente la trampa que el módulo ya evitó una vez (ver `publicKeyOf` en
// `DesignInspector.tsx`): dos verdades sobre lo mismo se contradicen en cuanto
// alguien edita el texto de un nodo, y entonces el formulario público ofrece un
// campo que ningún nodo consume. La clave se DERIVA del nodo, siempre.
//
// ── DOS FAMILIAS DE CLAVE, Y LA REGLA DEL CATÁLOGO CERRADO SIGUE ────
//
// `VARIABLES` en `designSpec.js` es un catálogo CERRADO y tiene que seguir
// siéndolo: son las variables que la PLATAFORMA resuelve sola —el club, el
// distrito, el gobernador, el periodo— y una clave inventada ahí no la resuelve
// nadie y termina impresa como `{{loQueSea}}`.
//
// Un campo vinculado declarado por el diseñador es otra cosa: lo resuelve la
// PERSONA que llena el formulario. No hay «nadie que lo resuelva» posible. Por
// eso acá sí se admiten claves nuevas (`presidente_entrante`, `sede`, `codigo`)
// siempre que estén DECLARADAS en el nodo — la declaración es lo que las hace
// resolubles, igual que la entrada del catálogo lo hace con las otras. Una
// clave sin declaración y sin catálogo se sigue descartando.
//
// Es lo que hace cierta la promesa de escalabilidad del pedido: agregar un
// campo nuevo es marcarlo en la pantalla, no tocar este archivo.
//
// ── POR QUÉ EL `kind` NO ES DECORATIVO ──────────────────────────────
//
// Un logotipo y una fotografía son las dos «una imagen» y NO se pueden tratar
// igual. Con las reglas de la fotografía —recorte por atención, encuadre
// `cover`, salida JPEG— un escudo de club entra recortado por los bordes y con
// la transparencia sustituida por un fondo sólido. Eso es exactamente lo que el
// pedido prohíbe («nunca deberá deformar, estirar, pixelar, recortar
// información importante») y es lo que pasaba hasta v4.722: el portal público
// mandaba TODA imagen por el camino de la fotografía.
//
// El `kind` es lo que separa esas dos recetas, y por eso está declarado y no
// deducido del nombre del campo.
// ════════════════════════════════════════════════════════════════════

// Este archivo NO importa nada, y conviene que siga así: `designSpec.js` lo
// importa a él para normalizar el nodo, así que una importación de vuelta
// cerraría un ciclo entre los dos módulos que sostienen todo el criterio.
//
// ─── Clases de campo ───────────────────────────────────────────────────
//
// `input` es qué control dibuja el formulario. `image` agrupa las clases que
// reciben un archivo, y cada una trae su receta de adaptación.
//
// `trim` (recortar los bordes vacíos) es lo que hace el Generador de Pendones
// con el logo del club desde su primera versión, y es lo que permite que un PNG
// del Brand Center —que viene con márgenes generosos— ocupe el recuadro. En un
// código QR sería un error: su margen blanco es la ZONA DE SILENCIO que los
// lectores necesitan, y recortarlo deja un código que no escanea.
export const FIELD_KINDS = {
    logo: {
        label: 'Logotipo',
        input: 'image',
        help: 'El escudo de tu club. Un PNG con fondo transparente queda mejor.',
        accept: 'image/png,image/svg+xml,image/jpeg,image/webp',
        image: { fit: 'contain', trim: true, transparent: true, crop: false, safeArea: 0.02 },
    },
    foto: {
        label: 'Fotografía',
        input: 'image',
        help: 'Se adapta sola al espacio de la plantilla.',
        accept: 'image/*',
        image: { fit: 'cover', trim: false, transparent: false, crop: true, safeArea: 0 },
    },
    firma: {
        label: 'Firma',
        input: 'image',
        help: 'Una firma escaneada sobre fondo transparente o blanco.',
        accept: 'image/png,image/jpeg,image/webp',
        image: { fit: 'contain', trim: true, transparent: true, crop: false, safeArea: 0.02 },
    },
    sello: {
        label: 'Sello',
        input: 'image',
        help: 'El sello institucional, preferiblemente en PNG con fondo transparente.',
        accept: 'image/png,image/svg+xml,image/webp',
        image: { fit: 'contain', trim: true, transparent: true, crop: false, safeArea: 0.02 },
    },
    qr: {
        label: 'Código QR',
        input: 'image',
        help: 'Subí el QR ya generado. No se recorta su margen: es lo que necesitan los lectores para leerlo.',
        accept: 'image/png,image/svg+xml',
        // `trim: false` a propósito: el margen blanco de un QR es su zona de
        // silencio. Recortarlo deja un código que no escanea.
        image: { fit: 'contain', trim: false, transparent: true, crop: false, safeArea: 0.04 },
    },
    texto: { label: 'Texto', input: 'text', maxChars: 90 },
    texto_largo: { label: 'Texto largo', input: 'textarea', maxChars: 600 },
    numero: { label: 'Número', input: 'number', maxChars: 4 },
    fecha: { label: 'Fecha', input: 'text', maxChars: 40 },
};

export const KIND_IDS = Object.keys(FIELD_KINDS);
export const isImageKind = (kind) => FIELD_KINDS[kind]?.input === 'image';

// Qué clase le toca a una clave del catálogo cuando nadie la declara. Es sólo
// un valor por defecto: lo que manda es lo que diga el nodo.
const KIND_BY_KEY = {
    logo: 'logo',
    imagen: 'foto',
    mensaje: 'texto_largo',
    anios: 'numero',
    fecha: 'fecha',
};

export const defaultKindFor = (key, nodeType = 'text') => {
    if (KIND_BY_KEY[key]) return KIND_BY_KEY[key];
    // Para una clave declarada por el diseñador manda el TIPO DEL NODO, que es
    // lo único que se sabe de ella: una imagen recibe archivos, un texto recibe
    // texto. Afinar la clase es cosa de quien la declara.
    return nodeType === 'image' ? 'foto' : 'texto';
};

// ─── La clave ──────────────────────────────────────────────────────────
//
// Se normaliza duro porque termina dentro de un `{{marcador}}` que se busca con
// una expresión regular: un espacio o un guion la volverían irreconocible y el
// campo quedaría declarado y sin nodo que lo consuma.
export const normalizeKey = (raw) => String(raw || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);

export const validateKey = (raw) => {
    const key = normalizeKey(raw);
    if (!key) return { ok: false, key: '', error: 'El nombre interno tiene que empezar por una letra.' };
    if (key.length < 3) return { ok: false, key, error: 'El nombre interno necesita al menos 3 caracteres.' };
    return { ok: true, key, error: null };
};

// ─── La declaración ────────────────────────────────────────────────────
//
// Todo opcional: un nodo que sólo declara su clave —lo que hacen las plantillas
// del catálogo— sigue funcionando exactamente igual que antes de que esto
// existiera. La declaración AGREGA control, no lo exige.
export const FIELD_LIMITS = { label: 60, help: 160, placeholder: 60, value: 600 };

export const normalizeField = (raw, { key = null, nodeType = 'text' } = {}) => {
    if (!raw || typeof raw !== 'object') return null;
    const kind = KIND_IDS.includes(raw.kind) ? raw.kind : defaultKindFor(key, nodeType);
    const spec = FIELD_KINDS[kind];

    const text = (v, max) => {
        const s = typeof v === 'string' ? v.trim() : '';
        return s ? s.slice(0, max) : '';
    };

    const field = {
        kind,
        label: text(raw.label, FIELD_LIMITS.label),
        help: text(raw.help, FIELD_LIMITS.help),
        placeholder: text(raw.placeholder, FIELD_LIMITS.placeholder),
        required: !!raw.required,
        // Visible por omisión: un campo marcado existe para que alguien lo
        // llene. Apagarlo es la excepción y hay que pedirla.
        visible: raw.visible !== false,
        defaultValue: text(raw.defaultValue, FIELD_LIMITS.value),
    };

    if (spec.input === 'image') {
        const img = raw.image && typeof raw.image === 'object' ? raw.image : {};
        field.image = {
            fit: ['cover', 'contain'].includes(img.fit) ? img.fit : spec.image.fit,
            trim: img.trim === undefined ? spec.image.trim : !!img.trim,
            transparent: img.transparent === undefined ? spec.image.transparent : !!img.transparent,
            crop: img.crop === undefined ? spec.image.crop : !!img.crop,
            // El «margen interno» del pedido: una franja libre DENTRO del
            // recuadro, para que el logotipo no llegue a tocar el borde. Se
            // aplica al adaptar la imagen, no al dibujarla, y por eso no hay que
            // tocar los dos renderizadores —el DOM y el canvas— para sostenerlo.
            safeArea: Math.min(0.25, Math.max(0, Number.isFinite(+img.safeArea) ? +img.safeArea : spec.image.safeArea)),
        };
    } else {
        field.maxChars = Math.min(2000, Math.max(1, Number.isFinite(+raw.maxChars) ? +raw.maxChars : spec.maxChars || 90));
    }

    return field;
};

/** La receta de adaptación de una imagen para una clase de campo. Es lo único
 *  que `designPhoto.js` necesita saber, y por eso vive acá —en el criterio— y
 *  no allá, donde vive sharp. */
export const imageRulesFor = (kind, override = null) => {
    const base = FIELD_KINDS[kind]?.image || FIELD_KINDS.foto.image;
    return { ...base, ...(override && typeof override === 'object' ? override : {}) };
};

// ─── Leer la declaración de un documento ───────────────────────────────
//
// La clave se DERIVA del nodo. Un texto sólo declara campo cuando la variable
// ocupa TODO su contenido: `Al {{club}}` es una frase con un dato adentro, no
// un campo — dejar que el público reescriba «Al Rotary Club X» entero rompería
// la redacción de la pieza. Es la misma condición que ya usaba el editor.
const SOLE_VARIABLE = /^\s*\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}\s*$/;

export const fieldKeyOf = (node) => {
    if (!node) return null;
    if (node.type === 'image') return node.srcVar || null;
    if (node.type === 'text') return SOLE_VARIABLE.exec(node.srcText || '')?.[1] || null;
    return null;
};

/** Todas las declaraciones del documento, indexadas por clave.
 *
 *  Si dos nodos declaran la misma clave —el logotipo repetido arriba y en el
 *  pie— gana el PRIMERO y se ignora el resto en silencio: un formulario con dos
 *  campos «Logotipo» pidiendo lo mismo es peor que uno solo, y cuál gana no
 *  cambia nada porque los dos nodos reciben el mismo valor. */
export const declarationsOf = (document) => {
    const out = new Map();
    for (const node of document?.nodes || []) {
        const key = fieldKeyOf(node);
        if (!key || out.has(key)) continue;
        const field = normalizeField(node.field, { key, nodeType: node.type });
        if (field) out.set(key, field);
    }
    return out;
};

/** Una clave es RESOLUBLE si está en el catálogo cerrado o si algún nodo la
 *  declara. Es la puerta que sustituye al viejo `FIELD_SPECS[key]`, y es lo que
 *  permite claves nuevas sin abrir el catálogo de las variables que resuelve la
 *  plataforma. */
export const isDeclared = (key, declarations) => !!declarations?.get(key);

export default {
    FIELD_KINDS, KIND_IDS, isImageKind, defaultKindFor,
    normalizeKey, validateKey, normalizeField, imageRulesFor,
    fieldKeyOf, declarationsOf, isDeclared, FIELD_LIMITS,
};
