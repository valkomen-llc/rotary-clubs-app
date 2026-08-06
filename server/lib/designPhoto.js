// ════════════════════════════════════════════════════════════════════
// Plantillas IA — adaptación de la fotografía que sube el público
// v4.723.0
//
// El pedido dice que el usuario no tenga que editar la imagen: la sube y entra
// bien en el espacio de la plantilla. Esto decide CÓMO.
//
// ── QUÉ HACE Y QUÉ NO, DICHO CON PRECISIÓN ──────────────────────────
//
// Hace: mide la foto, la compara con el hueco, y si hace falta la recorta con
// la estrategia de ATENCIÓN de sharp —que elige la región de mayor entropía y
// contraste, o sea la parte «con contenido» en vez del centro geométrico—.
// Además corrige la orientación EXIF, acota la resolución y avisa si la foto es
// demasiado chica para el hueco.
//
// **NO detecta rostros.** El pedido lo pide y conviene ser exacto: no hay
// detector de rostros en la plataforma —sharp no lo trae y agregar uno son
// decenas de MB en una función que ya empaqueta FFmpeg dentro del tope de 250
// MB—. En la práctica el recorte por atención suele conservar a las personas,
// porque una cara tiene más detalle que un cielo o una pared; pero eso es una
// consecuencia, no una garantía, y no se enuncia como si lo fuera. Misma regla
// que el Creador de Reels con la legibilidad: no afirmar que se mide algo que
// no se mide.
//
// **NO hace outpainting en el portal público.** La expansión de lienzo existe y
// funciona (`canvasExpansion.js`, del Creador de Reels), pero engancharla a un
// portal SIN AUTENTICACIÓN significa gastar créditos por cada visita anónima y
// mandar la fotografía de un tercero a un proveedor externo. Las dos cosas
// necesitan una decisión del operador, no un valor por defecto. Cuando la foto
// es tan panorámica que el recorte se llevaría los bordes, se AVISA con el
// motivo y la consecuencia —igual que hace el Creador de Reels— en vez de
// recortar en silencio.
// ════════════════════════════════════════════════════════════════════

// ─── Criterio (puro) ───────────────────────────────────────────────────

// Por encima de esta diferencia de proporción, el recorte se lleva una parte
// grande de la foto. No se impide: se avisa. El usuario puede subir otra o
// aceptarlo, y quien decide es él, no nosotros en silencio.
export const CROP_WARN_RATIO = 1.6;
// Por debajo de esto la foto no tiene píxeles para el hueco y se va a ver
// blanda al imprimir o al mirarla en un móvil moderno.
export const MIN_COVERAGE = 0.72;
export const MAX_SIDE = 2400;

export const planPhoto = ({ width, height, targetWidth, targetHeight }) => {
    if (!width || !height || !targetWidth || !targetHeight) {
        return { ok: false, reason: 'No se pudieron leer las medidas de la imagen.' };
    }
    const source = width / height;
    const target = targetWidth / targetHeight;
    const ratio = source > target ? source / target : target / source;

    // Cuánto de la foto sobrevive al recorte: el recorte se lleva una banda del
    // lado largo, así que es el inverso de la desproporción.
    const kept = 1 / ratio;

    // La foto ya está en formato: NO se toca. Es lo más importante que hace
    // este paso, igual que en la expansión de lienzo del Creador de Reels —
    // recortar y recomprimir una imagen que ya entra sólo pierde calidad.
    const inFormat = ratio <= 1.02;

    // ¿Alcanza la resolución? Se compara el lado corto contra el hueco.
    const scale = Math.max(targetWidth / width, targetHeight / height);
    const coverage = 1 / Math.max(1, scale);

    const notes = [];
    if (!inFormat && ratio >= CROP_WARN_RATIO) {
        notes.push({
            level: 'warn',
            reason: source > target ? 'La fotografía es bastante más apaisada que el espacio de la plantilla.' : 'La fotografía es bastante más vertical que el espacio de la plantilla.',
            consequence: `Se va a recortar cerca del ${Math.round((1 - kept) * 100)} % de la imagen por los lados. Si hay personas en los extremos, van a quedar fuera.`,
        });
    }
    if (coverage < MIN_COVERAGE) {
        notes.push({
            level: 'warn',
            reason: `La fotografía mide ${width}×${height} y el espacio pide ${targetWidth}×${targetHeight}.`,
            consequence: 'Se va a ver algo borrosa. Una imagen más grande queda mejor.',
        });
    }

    return {
        ok: true,
        action: inFormat ? 'keep' : 'crop',
        source: { width, height, ratio: +source.toFixed(4) },
        target: { width: targetWidth, height: targetHeight, ratio: +target.toFixed(4) },
        ratio: +ratio.toFixed(3),
        keptFraction: +kept.toFixed(3),
        coverage: +coverage.toFixed(3),
        notes,
    };
};

// ─── Planificación de un LOGOTIPO ──────────────────────────────────────
//
// Un logotipo no se recorta NUNCA, así que su plan no puede ser el de la
// fotografía. Lo que se mira es otra cosa: si tiene píxeles suficientes para el
// recuadro. Un escudo entra siempre —`contain` lo mete completo, con aire a los
// lados si hace falta—; lo que sí puede pasar es que llegue borroso.
//
// Y hay un caso que sólo pasa con los logotipos: un PNG del Brand Center llega
// con márgenes transparentes generosos. Sin recortarlos, el escudo ocupa la
// mitad de su recuadro y se ve chico sin que nadie entienda por qué. Es lo que
// el Generador de Pendones resuelve con `sharp.trim()` desde su primera
// versión, y es la razón de que `trim` esté en las reglas de la clase.
export const planLogo = ({ width, height, targetWidth, targetHeight }) => {
    if (!width || !height || !targetWidth || !targetHeight) {
        return { ok: false, reason: 'No se pudieron leer las medidas de la imagen.' };
    }
    // Con `contain` el factor es el MENOR de los dos: es el que hace entrar la
    // imagen completa. (Con `cover` sería el mayor — de ahí el recorte.)
    const scale = Math.min(targetWidth / width, targetHeight / height);
    const coverage = 1 / Math.max(1, scale);

    const notes = [];
    if (coverage < MIN_COVERAGE) {
        notes.push({
            level: 'warn',
            reason: `El logotipo mide ${width}×${height} y el espacio pide ${targetWidth}×${targetHeight}.`,
            consequence: 'Se va a ver algo borroso. Generalo en el Rotary Brand Center y descargalo en PNG, que sale más grande.',
        });
    }

    return {
        ok: true,
        // `keep` porque no se recorta: la imagen entra entera, se escale o no.
        action: 'keep',
        source: { width, height, ratio: +(width / height).toFixed(4) },
        target: { width: targetWidth, height: targetHeight, ratio: +(targetWidth / targetHeight).toFixed(4) },
        ratio: 1,
        keptFraction: 1,
        coverage: +coverage.toFixed(3),
        notes,
    };
};

/** El hueco de una VARIABLE dentro del documento, en píxeles del formato.
 *
 *  Generaliza lo que hacía `photoSlotOf`, que buscaba siempre el nodo de la
 *  fotografía. Ése era el defecto de fondo del logotipo en el portal público:
 *  se subía un escudo y se lo adaptaba al recuadro de la FOTO —otra proporción,
 *  encuadre `cover` y salida JPEG—, así que llegaba recortado y sin
 *  transparencia. El hueco tiene que salir del nodo que consume ESA clave.
 *
 *  Sale del propio nodo, así que una plantilla que ponga el logotipo en otro
 *  sitio o de otro tamaño no necesita ningún ajuste acá. */
export const slotFor = (document, key, formatWidth, formatHeight) => {
    const nodes = (document?.nodes || []).filter(n => n.type === 'image');
    const node = nodes.find(n => n.srcVar === key)
        // Respaldo por `role` para los documentos guardados antes de que la
        // clave viajara en `srcVar`: se publicaron con el rol puesto.
        || nodes.find(n => n.role === key)
        || (key === 'imagen' ? nodes.find(n => n.role === 'foto') : null);
    if (!node) return null;
    return {
        nodeId: node.id,
        width: Math.max(1, Math.round(node.w * formatWidth)),
        height: Math.max(1, Math.round(node.h * formatHeight)),
        fit: node.fit || 'cover',
    };
};

/** El hueco de la fotografía. Se conserva porque es lo que llaman los caminos
 *  que no saben de campos vinculados; hoy es `slotFor(doc, 'imagen', …)`. */
export const photoSlotOf = (document, formatWidth, formatHeight) =>
    slotFor(document, 'imagen', formatWidth, formatHeight);

// ─── Ejecución (sharp) ─────────────────────────────────────────────────

let _sharp = null;
const getSharp = async () => _sharp || (_sharp = (await import('sharp')).default);

/**
 * Deja la imagen lista para el hueco. Devuelve el buffer y el plan, para que
 * quien llame pueda enseñar los avisos en vez de tragárselos.
 *
 * `rotate()` sin argumentos aplica la orientación EXIF: sin eso, una foto de
 * móvil entra acostada y el usuario cree que el módulo la rotó.
 */
export const adaptPhoto = async (buffer, { targetWidth, targetHeight, fit = 'cover' } = {}) => {
    const sharp = await getSharp();
    const upright = sharp(buffer).rotate();
    const meta = await upright.metadata();

    const plan = planPhoto({ width: meta.width, height: meta.height, targetWidth, targetHeight });
    if (!plan.ok) throw new Error(plan.reason);

    // No se agranda más allá del propio original: estirar píxeles que no
    // existen es peor que entregar la foto como está y decirlo.
    const outW = Math.min(targetWidth, MAX_SIDE);
    const outH = Math.min(targetHeight, MAX_SIDE);

    const pipeline = upright.resize({
        width: outW,
        height: outH,
        fit: fit === 'contain' ? 'inside' : 'cover',
        // `attention` elige la región de mayor entropía y saturación en vez del
        // centro geométrico. NO es detección de rostros — ver la cabecera.
        position: fit === 'contain' ? undefined : sharp.strategy.attention,
        withoutEnlargement: false,
    });

    const out = await pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    const outMeta = await sharp(out).metadata();

    return {
        buffer: out,
        contentType: 'image/jpeg',
        plan,
        width: outMeta.width,
        height: outMeta.height,
        originalWidth: meta.width,
        originalHeight: meta.height,
    };
};

/**
 * Deja un LOGOTIPO listo para su recuadro. Es otra receta, no un parámetro de
 * la anterior, y las tres diferencias importan:
 *
 *   · **Sale en PNG.** La fotografía sale en JPEG porque pesa menos y no tiene
 *     transparencia que perder; un escudo sí la tiene, y en JPEG el fondo
 *     transparente se rellena de negro. Era lo que pasaba hasta v4.722.
 *   · **No se recorta.** `contain` mete la imagen completa. Un logotipo
 *     recortado no es un encuadre discutible: es la marca del club rota.
 *   · **Se le quitan los bordes vacíos** (`trim`), como en el Generador de
 *     Pendones. Sin eso, un PNG del Brand Center —que trae márgenes— ocupa la
 *     mitad de su recuadro.
 *
 * `trim` puede fallar con una imagen sin borde uniforme (sharp lanza cuando no
 * queda nada que conservar), así que se reintenta sin él en vez de devolver un
 * error: el logotipo sin recortar sirve; ningún logotipo, no.
 */
export const adaptLogo = async (buffer, { targetWidth, targetHeight, rules = {} } = {}) => {
    const sharp = await getSharp();
    const meta0 = await sharp(buffer).metadata();

    // El margen interno («área segura» del pedido) se descuenta del recuadro
    // ANTES de escalar y se devuelve como borde transparente. Así el logotipo
    // no llega a tocar el filo sin que haya que tocar los dos renderizadores.
    const safe = Math.min(0.25, Math.max(0, Number(rules.safeArea) || 0));
    const innerW = Math.max(1, Math.round(targetWidth * (1 - safe * 2)));
    const innerH = Math.max(1, Math.round(targetHeight * (1 - safe * 2)));

    const compose = async (withTrim) => {
        let p = sharp(buffer).rotate();
        if (withTrim) p = p.trim(10);
        p = p.resize({
            width: Math.min(innerW, MAX_SIDE),
            height: Math.min(innerH, MAX_SIDE),
            fit: 'inside',
            // No se agranda: estirar píxeles que no existen deja el logotipo
            // blando y no agrega nada. Si queda chico, se dice.
            withoutEnlargement: true,
        });
        if (safe > 0) {
            // El margen se calcula sobre la PROPIA imagen ya escalada, no sobre
            // el recuadro. Medido: con el recuadro (302×104) un escudo cuadrado
            // salía de 112×104 —proporción 1,08 en vez de 1,00—, porque el
            // margen horizontal y el vertical eran distintos. Los píxeles no se
            // estiraban, pero el nodo dibuja la imagen con `contain` sobre su
            // propia proporción, así que el margen visible quedaba desparejo.
            // Proporcional, la proporción se conserva y el margen se ve igual
            // por los cuatro lados.
            const meta = await p.toBuffer({ resolveWithObject: true });
            const k = safe / (1 - safe * 2);
            const padX = Math.max(0, Math.round(meta.info.width * k));
            const padY = Math.max(0, Math.round(meta.info.height * k));
            return sharp(meta.data)
                .extend({ top: padY, bottom: padY, left: padX, right: padX, background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .png({ compressionLevel: 9 }).toBuffer();
        }
        return p.png({ compressionLevel: 9 }).toBuffer();
    };

    let out;
    try { out = await compose(rules.trim !== false); }
    catch { out = await compose(false); }

    const outMeta = await sharp(out).metadata();
    const plan = planLogo({
        width: meta0.width, height: meta0.height,
        targetWidth: innerW, targetHeight: innerH,
    });

    return {
        buffer: out,
        contentType: 'image/png',
        plan,
        width: outMeta.width,
        height: outMeta.height,
        originalWidth: meta0.width,
        originalHeight: meta0.height,
    };
};

/**
 * El despacho por CLASE de campo. Es el único sitio donde se decide qué receta
 * le toca a un archivo, y por eso el portal público no tiene que saber nada de
 * sharp ni de recortes: manda la clave del campo y recibe la imagen adaptada.
 *
 * Sin recorte (`crop: false`) va por el camino del logotipo aunque la clase se
 * llame de otro modo —una firma, un sello, un QR—: lo que define la receta es
 * qué se le puede hacer a la imagen, no cómo se llama el campo.
 */
export const adaptForField = async (buffer, { targetWidth, targetHeight, rules = {} } = {}) => {
    if (rules.crop === false || rules.transparent === true) {
        return adaptLogo(buffer, { targetWidth, targetHeight, rules });
    }
    return adaptPhoto(buffer, { targetWidth, targetHeight, fit: rules.fit || 'cover' });
};

export default {
    planPhoto, planLogo, photoSlotOf, slotFor,
    adaptPhoto, adaptLogo, adaptForField,
    CROP_WARN_RATIO, MIN_COVERAGE, MAX_SIDE,
};
