// ════════════════════════════════════════════════════════════════════
// Plantillas IA — el portal público
// v4.723.0
//
// Sirve una plantilla publicada a cualquiera con el enlace, SIN sesión. Es el
// mismo patrón del Generador de Pendones, y por eso conviene decir en qué se
// parece y en qué no.
//
// ── LO QUE EL PÚBLICO PUEDE MANDAR ES UN DICCIONARIO DE VALORES ─────
//
// Nada más. Ni un nodo, ni un color, ni una posición. `applyPublicValues` toma
// los nodos GUARDADOS y les sustituye texto e imágenes; el resto del documento
// no se puede ni nombrar en la petición. La lista de campos permitidos sale de
// la publicación, no de lo que llegue.
//
// Eso es lo que hace cumplible la lista de prohibiciones del pedido —no mover
// elementos, no quitar el logotipo, no cambiar colores ni tipografías—: no está
// «oculto en la interfaz», es que no existe la forma de pedirlo.
//
// ── UN ENDPOINT SIN AUTENTICACIÓN ES UNA SUPERFICIE ─────────────────
//
// Por eso: tope de tamaño en la subida, sólo imágenes, la IA acotada por
// plantilla publicada, y la respuesta nunca devuelve nada administrativo —ni
// clubId, ni quién publicó, ni el proyecto de origen—.
// ════════════════════════════════════════════════════════════════════

import db from '../lib/db.js';
import { ensureDesignSchema } from '../lib/ensureDesignSchema.js';
import { formatOf } from '../lib/designSpec.js';
import { sanitizeValues, applyPublicValues, bakeFrozen, isAcceptableImage } from '../lib/designPublish.js';
import { slotFor, adaptForField } from '../lib/designPhoto.js';
import { generateDesignCopy, improveMessage, TONES } from '../lib/designAI.js';
import { startComposition, syncComposition } from '../lib/designBackdrop.js';
import { normalizeComposition } from '../lib/designCompose.js';
import { searchPublicClubs, findPublicClub, norm as normClub } from '../lib/publicClubs.js';
import { checkPreservation } from '../lib/designGuard.js';

console.log('[designPublicController] v4.757.0 cargado — Portal público de Plantillas IA. La preservación de la fotografía se mide.');

const rowOrNull = async (slug) => {
    const { rows } = await db.query(
        `SELECT * FROM "DesignPublicTemplate" WHERE slug = $1 AND published = true LIMIT 1`,
        [String(slug || '').toLowerCase()]
    );
    return rows[0] || null;
};

// Lo que ve el público. Se enumera lo que SÍ va, no se filtra lo que no:
// una respuesta construida por lista blanca no se puede olvidar de esconder
// una columna nueva.
const publicShape = (row) => ({
    slug: row.slug,
    name: row.name,
    intro: row.intro || '',
    category: row.category,
    format: row.format,
    // Lo institucional va YA RESUELTO dentro de los nodos: el navegador sólo
    // sustituye los pocos marcadores del formulario, así que la vista previa es
    // instantánea y la firma de la pieza no viaja como dato manipulable.
    document: bakeFrozen(
        { format: row.document?.format || row.format, background: row.document?.background || '#FFFFFF', nodes: row.document?.nodes || [] },
        row.frozen || {}
    ),
    fields: row.fields || [],
    // El portal necesita saber si esta plantilla compone con IA y cuántas
    // variantes le tocan. No se manda el prompt maestro: es configuración.
    composition: (() => { const c = normalizeComposition(row.composition); return { enabled: c.enabled, variants: c.publicVariants }; })(),
});

// ── GET /api/public/design/:slug ──────────────────────────────────────
export const getPublicTemplate = async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        await ensureDesignSchema();
        const row = await rowOrNull(req.params.slug);
        if (!row) return res.status(404).json({ error: 'Esta plantilla no existe o no está publicada.' });
        res.json(publicShape(row));
    } catch (e) {
        console.error('[designPublic] get:', e);
        res.status(500).json({ error: 'No se pudo cargar la plantilla' });
    }
};

// ── GET /api/public/design/clubs?q= ───────────────────────────────────
//
// El buscador de clubes del portal. Sale del catálogo curado de la Feria, no
// del directorio de sitios de la plataforma — ver la cabecera de
// `publicClubs.js`.
//
// Lo ÚNICO que se enriquece desde la base es el logotipo, y sólo para un club
// que ya está en el catálogo: es lo que evita pedirle su escudo a quien ya lo
// tiene cargado en su sitio. No se devuelve nada más de la fila; un buscador
// público no es una ventana al directorio.
export const publicClubs = async (req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    try {
        const hits = searchPublicClubs(req.query.q, req.query.limit);
        if (!hits.length) return res.json([]);

        // Una sola consulta para todos los resultados, no una por club.
        let logos = new Map();
        try {
            const { rows } = await db.query(
                `SELECT name, logo FROM "Club" WHERE logo IS NOT NULL AND logo <> '' LIMIT 2000`
            );
            logos = new Map(rows.map(r => [normClub(r.name), r.logo]));
        } catch (e) {
            // El logotipo es una comodidad: sin él el buscador sigue sirviendo.
            console.warn('[designPublic] logos de clubes:', e.message);
        }

        res.json(hits.map(c => ({
            name: c.name,
            display: c.display,
            district: c.district,
            logo: logos.get(normClub(c.name)) || logos.get(normClub(c.display)) || null,
        })));
    } catch (e) {
        console.error('[designPublic] clubs:', e);
        res.status(500).json({ error: 'No se pudo buscar el club' });
    }
};

// ── POST /api/public/design/:slug/render ──────────────────────────────
// Devuelve el documento con los valores aplicados. El navegador lo dibuja y lo
// exporta —igual que en el módulo administrativo, y por el mismo motivo: el
// dibujo está escrito una sola vez y componer en el servidor obligaría a
// escribirlo de nuevo.
export const renderPublic = async (req, res) => {
    try {
        await ensureDesignSchema();
        const row = await rowOrNull(req.params.slug);
        if (!row) return res.status(404).json({ error: 'Esta plantilla no existe o no está publicada.' });

        const fields = row.fields || [];
        const { values, rejected, errors } = sanitizeValues(req.body?.values, fields);
        if (rejected.length) console.warn(`[designPublic] ${row.slug}: se descartaron campos no declarados: ${rejected.join(', ')}`);

        const doc = applyPublicValues(row.document, values, row.frozen || {});
        res.json({
            document: { format: doc.format, background: doc.background, nodes: doc.nodes },
            missing: doc.missing,
            // Los errores viajan pero NO bloquean el dibujo: la vista previa en
            // vivo tiene que seguir pintándose mientras la persona escribe, o
            // el formulario se siente roto a mitad de completar.
            errors,
        });
    } catch (e) {
        console.error('[designPublic] render:', e);
        res.status(500).json({ error: 'No se pudo componer la pieza' });
    }
};

// ── POST /api/public/design/:slug/message ─────────────────────────────
// Escribe o reescribe el mensaje. El contexto sale de lo que la persona ya
// escribió en el formulario, no de la base: acá no hay club identificado.
export const publicMessage = async (req, res) => {
    try {
        await ensureDesignSchema();
        const row = await rowOrNull(req.params.slug);
        if (!row) return res.status(404).json({ error: 'Esta plantilla no existe o no está publicada.' });

        const fields = row.fields || [];
        const { values } = sanitizeValues(req.body?.values, fields);
        const tone = typeof req.body?.tone === 'string' && TONES[req.body.tone] ? req.body.tone : null;
        const messageField = fields.find(f => f.key === 'mensaje');
        const limit = messageField?.maxChars || 320;

        const context = {
            clubName: values.club || row.frozen?.club || '',
            city: values.ciudad || row.frozen?.ciudad || '',
            district: row.frozen?.distrito || '',
            governor: row.frozen?.gobernador || '',
            period: row.frozen?.periodo || '',
            years: values.anios || '',
            dateHuman: values.fecha || null,
        };

        // Reescribir lo que ya hay es distinto de escribir de cero: si la
        // persona ya tiene un texto y pide un tono, no se le tira lo suyo.
        if (tone && String(req.body?.text || '').trim()) {
            const r = await improveMessage({ text: req.body.text, tone, context, maxChars: limit });
            return res.json({ mensaje: r.mensaje, degraded: !!r.degraded, note: r.note || null });
        }

        // El texto de referencia sale de la fila publicada: es configuración de
        // la plantilla, no un dato que el navegador pueda mandar.
        const copy = await generateDesignCopy({
            purpose: row.category, tone, context, maxChars: limit,
            referenceText: normalizeComposition(row.composition).referenceText,
        });
        res.json({ mensaje: copy.mensaje, degraded: !!copy.degraded, note: copy.note || null });
    } catch (e) {
        console.error('[designPublic] message:', e);
        res.status(500).json({ error: 'No se pudo escribir el mensaje. Podés escribirlo a mano.' });
    }
};

// ── POST /api/public/design/:slug/photo ───────────────────────────────
// Recibe la fotografía, la endereza y la adapta al hueco de ESA plantilla.
//
// Devuelve un DATA URL, no una URL de S3. Mismo criterio que la subida pública
// del Generador de Pendones: guardar en nuestro almacenamiento lo que sube
// cualquier persona sin identificar convierte el bucket en un depósito abierto
// y nos deja alojando contenido de terceros. La imagen vive en la sesión del
// navegador y viaja al canvas al exportar.
// ── QUÉ CAMPO ES DECIDE CÓMO SE ADAPTA ────────────────────────────────
//
// Hasta v4.722 este endpoint atendía a TODA imagen con la receta de la
// fotografía: el hueco de la foto, encuadre `cover` con recorte por atención y
// salida JPEG. Con un solo campo de imagen por plantilla no se notaba; en
// cuanto el logotipo pasó a ser un campo público (v4.722.3) el resultado fue
// exactamente lo que el pedido prohíbe — el escudo llegaba recortado por los
// bordes, deformado respecto de su recuadro y con la transparencia rellena de
// negro por el JPEG.
//
// El `key` que manda el formulario es lo que arregla eso: con él se resuelve el
// hueco de ESE nodo y la receta de ESA clase de campo. Sin `key` se conserva el
// comportamiento anterior, para que un navegador con el bundle viejo siga
// subiendo su fotografía.
export const publicPhoto = async (req, res) => {
    try {
        await ensureDesignSchema();
        const row = await rowOrNull(req.params.slug);
        if (!row) return res.status(404).json({ error: 'Esta plantilla no existe o no está publicada.' });
        if (!req.file) return res.status(400).json({ error: 'No llegó ninguna imagen.' });
        if (!/^image\//.test(req.file.mimetype || '')) return res.status(400).json({ error: 'Ese archivo no es una imagen.' });

        const fmt = formatOf(row.format);
        const fields = row.fields || [];
        // Sólo se atiende un campo DECLARADO en la publicación. Es el mismo
        // cierre que `sanitizeValues`: lo que no está en el formulario no
        // existe, y una clave inventada no puede elegir a qué nodo apunta.
        const key = String(req.body?.key || '').slice(0, 32);
        const field = fields.find(f => f.key === key && f.type === 'image') || null;
        if (key && !field) return res.status(400).json({ error: 'Esa plantilla no tiene un campo de imagen con ese nombre.' });

        const slotKey = field?.key || 'imagen';
        const slot = slotFor(row.document, slotKey, fmt.width, fmt.height)
            || { width: fmt.width, height: fmt.height, fit: 'cover' };

        const rules = field?.image || { fit: slot.fit, crop: true, transparent: false, trim: false, safeArea: 0 };
        const out = await adaptForField(req.file.buffer, {
            targetWidth: slot.width, targetHeight: slot.height,
            rules: { ...rules, fit: rules.fit || slot.fit },
        });

        res.json({
            dataUrl: `data:${out.contentType};base64,${out.buffer.toString('base64')}`,
            key: slotKey,
            width: out.width,
            height: out.height,
            // Los avisos se DEVUELVEN, no se guardan para nosotros: si el
            // recorte se va a llevar a las personas de los bordes, quien sube
            // la foto es el único que puede decidir subir otra.
            notes: out.plan.notes,
            action: out.plan.action,
        });
    } catch (e) {
        console.error('[designPublic] photo:', e);
        res.status(500).json({ error: 'No se pudo procesar la imagen. Probá con otra.' });
    }
};

// ── POST /api/public/design/:slug/backdrop ────────────────────────────
//
// Composición con IA en el portal público. Sólo existe si el operador la
// encendió para ESA plantilla, y conviene entender qué implica encenderla:
//
//   **La fotografía anónima deja de ser efímera.** KIE necesita una URL que
//   pueda descargar, así que la foto hay que subirla a nuestro almacenamiento
//   antes de mandarla. Es lo contrario de lo que hace `/photo`, que devuelve un
//   data URL justamente para no alojar contenido de terceros. No es un descuido
//   de este endpoint: es el precio de la composición generativa, y por eso está
//   apagada por defecto y el panel lo advierte al encenderla.
//
// Se sube a un prefijo aparte (`public-tmp/`) para que se pueda vaciar con una
// regla de ciclo de vida del bucket sin tocar la Biblioteca Multimedia.
export const publicBackdrop = async (req, res) => {
    try {
        await ensureDesignSchema();
        const row = await rowOrNull(req.params.slug);
        if (!row) return res.status(404).json({ error: 'Esta plantilla no existe o no está publicada.' });

        const comp = normalizeComposition(row.composition);
        if (!comp.enabled) return res.status(400).json({ error: 'Esta plantilla no tiene la composición con IA activada.' });

        const dataUrl = String(req.body?.photo || '');
        if (!dataUrl.startsWith('data:image/')) return res.status(400).json({ error: 'Hace falta la fotografía para componer.' });

        const photoUrl = await storeTempPhoto(dataUrl, row.slug);
        const r = await startComposition({
            composition: comp,
            format: row.format,
            photoUrl,
            palette: row.frozen?.palette || {},
            // En el portal manda `publicVariants`, no `variants`: el panel puede
            // explorar cuatro; una visita anónima gasta lo que el operador dijo.
            variants: comp.publicVariants,
            // El documento publicado: es lo que dice dónde va el texto que
            // imprimimos encima. Sale de la fila, no del navegador.
            document: { format: row.format, nodes: row.document?.nodes || [] },
        });
        if (!r.variants.some(v => v.taskId)) {
            return res.status(502).json({ error: r.variants[0]?.error || 'No se pudo iniciar la composición.' });
        }
        res.json({ variants: r.variants.map(v => ({ planId: v.planId, label: v.label, summary: v.summary, taskId: v.taskId, error: v.error })) });
    } catch (e) {
        console.error('[designPublic] backdrop:', e);
        res.status(500).json({ error: e.message || 'No se pudo componer la pieza' });
    }
};

// ── GET /api/public/design/:slug/backdrop/:taskId ─────────────────────
export const publicBackdropSync = async (req, res) => {
    try {
        const row = await rowOrNull(req.params.slug);
        if (!row) return res.status(404).json({ error: 'Esta plantilla no existe o no está publicada.' });
        res.json(await syncComposition({ taskId: req.params.taskId, format: row.format, clubId: row.clubId }));
    } catch (e) {
        console.error('[designPublic] backdropSync:', e);
        res.status(500).json({ error: e.message || 'No se pudo consultar la composición' });
    }
};

// ── POST /api/public/design/:slug/verify ──────────────────────────────
//
// LA PRESERVACIÓN SE MIDE, NO SE PROMETE.
//
// El prompt le pide al modelo que conserve a las personas de la fotografía.
// Pedirlo es necesario y no alcanza: puede desobedecer, y la pieza sale igual
// —con alguien de más, o con una cara que no es la de nadie— en una publicación
// institucional. Acá se comprueba.
//
// Cuando la comprobación no da, NO se retoca la imagen: se descarta la
// composición y la pieza sale con la fotografía en su recuadro, intacta. Pegar
// la original encima sería el composite que el equipo rechazó dos veces.
//
// Va en su propio paso y no dentro del sondeo porque necesita la fotografía
// ORIGINAL, que vive en el navegador de quien la subió: mandarla en cada sondeo
// sería mandarla cinco veces para usarla una.
export const publicVerify = async (req, res) => {
    try {
        const row = await rowOrNull(req.params.slug);
        if (!row) return res.status(404).json({ error: 'Esta plantilla no existe o no está publicada.' });

        const dataUrl = String(req.body?.photo || '');
        const composedUrl = String(req.body?.composed || '');
        if (!dataUrl.startsWith('data:image/') || !isAcceptableImage(composedUrl)) {
            return res.status(400).json({ error: 'Hacen falta la fotografía y la composición para comprobarla.' });
        }

        const m = dataUrl.match(/^data:image\/[a-z+]+;base64,(.+)$/i);
        if (!m) return res.status(400).json({ error: 'La fotografía no tiene un formato reconocible.' });
        const original = Buffer.from(m[1], 'base64');

        const composed = Buffer.from(await (await fetch(composedUrl)).arrayBuffer());
        const veredicto = await checkPreservation(original, composed, {
            // Qué hacer cuando el encuadre se lleva a alguien del borde. Lo
            // declara la plantilla: hay piezas donde recortar es diseño y otras
            // donde aparecer es el punto.
            edgeCrop: normalizeComposition(row.composition).photo.edgeCrop,
            // La composición lado a lado se sube al mismo prefijo efímero que la
            // fotografía: la cadena de proveedores acepta una imagen POR URL.
            publish: (buf) => storeTempBuffer(buf, row.slug, 'jpg'),
        });

        res.json({
            state: veredicto.state,
            use: veredicto.use,
            reason: veredicto.reason,
            consequence: veredicto.consequence,
            // Se usó, pero el encuadre se llevó a alguien de los bordes. No es
            // un fallo —por eso viaja aparte de `reason`— y tampoco se calla:
            // quien descarga la pieza tiene que saber que puede no salir todo
            // el mundo, y el módulo ya ofrece volver a la foto en su recuadro.
            cropped: !!veredicto.cropped,
            notice: veredicto.notice || null,
        });
    } catch (e) {
        console.error('[designPublic] verify:', e);
        // Un control de calidad que tumba la generación es peor que no tenerlo.
        res.json({ state: 'unavailable', use: true, reason: 'No se pudo comprobar la fotografía.', consequence: 'La pieza se generó igual; conviene mirarla antes de publicarla.' });
    }
};

// Sube un buffer al prefijo EFÍMERO. Está aparte de la Biblioteca Multimedia a
// propósito: es contenido de un visitante anónimo y el prefijo se puede vaciar
// con una regla de ciclo de vida sin tocar los archivos de nadie.
const storeTempBuffer = async (buffer, slug, ext = 'jpg', mime = 'image/jpeg') => {
    const aws = await import('@aws-sdk/client-s3');
    const mod = aws.default || aws;
    const bucket = process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';
    const client = new mod.S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
            accessKeyId: process.env.ROTARY_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.ROTARY_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
        },
    });
    const key = `public-tmp/designs/${slug}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await client.send(new mod.PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: mime }));
    const encoded = key.split('/').map(encodeURIComponent).join('/');
    return `https://${bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${encoded}`;
};

const storeTempPhoto = async (dataUrl, slug) => {
    const m = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
    if (!m) throw new Error('La fotografía no tiene un formato reconocible.');
    const ext = m[1].split('/')[1].replace('jpeg', 'jpg');
    return storeTempBuffer(Buffer.from(m[2], 'base64'), slug, ext, m[1]);
};

// ── POST /api/public/design/:slug/used ────────────────────────────────
// Contador de uso. Es lo único que el portal escribe, y a propósito no guarda
// nada de quien lo usó: es un número para saber si el enlace sirve, no
// analítica de personas anónimas.
export const markUsed = async (req, res) => {
    try {
        await db.query(`UPDATE "DesignPublicTemplate" SET uses = uses + 1 WHERE slug = $1 AND published = true`,
            [String(req.params.slug || '').toLowerCase()]);
        res.json({ ok: true });
    } catch {
        res.json({ ok: true }); // no puede romper una descarga
    }
};

export default { getPublicTemplate, publicClubs, renderPublic, publicMessage, publicPhoto, publicBackdrop, publicBackdropSync, publicVerify, markUsed };
