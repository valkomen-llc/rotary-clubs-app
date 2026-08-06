// ════════════════════════════════════════════════════════════════════
// Plantillas IA — adaptación de la fotografía que sube el público
// v4.721.0
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

/** El hueco de la fotografía dentro del documento, en píxeles del formato.
 *  Sale del propio nodo, así que una plantilla con la foto en otro sitio o de
 *  otra forma no necesita ningún ajuste acá. */
export const photoSlotOf = (document, formatWidth, formatHeight) => {
    const node = (document?.nodes || []).find(n => n.type === 'image' && (n.srcVar === 'imagen' || n.role === 'foto'));
    if (!node) return null;
    return {
        nodeId: node.id,
        width: Math.max(1, Math.round(node.w * formatWidth)),
        height: Math.max(1, Math.round(node.h * formatHeight)),
        fit: node.fit || 'cover',
    };
};

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

export default { planPhoto, photoSlotOf, adaptPhoto, CROP_WARN_RATIO, MIN_COVERAGE, MAX_SIDE };
