// ════════════════════════════════════════════════════════════════════
// Plantillas IA — el portal público
// v4.721.0
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
import { sanitizeValues, applyPublicValues, bakeFrozen } from '../lib/designPublish.js';
import { photoSlotOf, adaptPhoto } from '../lib/designPhoto.js';
import { generateDesignCopy, improveMessage, TONES } from '../lib/designAI.js';

console.log('[designPublicController] v4.721.0 cargado — Portal público de Plantillas IA (sin autenticación).');

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

        const copy = await generateDesignCopy({ purpose: row.category, tone, context, maxChars: limit });
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
export const publicPhoto = async (req, res) => {
    try {
        await ensureDesignSchema();
        const row = await rowOrNull(req.params.slug);
        if (!row) return res.status(404).json({ error: 'Esta plantilla no existe o no está publicada.' });
        if (!req.file) return res.status(400).json({ error: 'No llegó ninguna imagen.' });
        if (!/^image\//.test(req.file.mimetype || '')) return res.status(400).json({ error: 'Ese archivo no es una imagen.' });

        const fmt = formatOf(row.format);
        const slot = photoSlotOf(row.document, fmt.width, fmt.height)
            || { width: fmt.width, height: fmt.height, fit: 'cover' };

        const out = await adaptPhoto(req.file.buffer, {
            targetWidth: slot.width, targetHeight: slot.height, fit: slot.fit,
        });

        res.json({
            dataUrl: `data:${out.contentType};base64,${out.buffer.toString('base64')}`,
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

export default { getPublicTemplate, renderPublic, publicMessage, publicPhoto, markUsed };
