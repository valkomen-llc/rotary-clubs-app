// ════════════════════════════════════════════════════════════════════
// Plantillas IA — Motor de Composición (la ORQUESTACIÓN)
// v4.722.0
//
// Habla con KIE, sondea, descarga y sube a S3. El CRITERIO —qué prompt, qué
// variantes, qué se acepta— vive en `designCompose.js`, que es puro y tiene
// pruebas. Acá no hay decisiones: si aparece una, va allá.
//
// ── ES ASÍNCRONO A PROPÓSITO ────────────────────────────────────────
//
// Una composición de `nano-banana` tarda 20-60 s y la función corta a los 120 s
// (`vercel.json`). Igual que el Generador de Outros: se crea la tarea y se
// devuelve el id; el navegador sondea. Esperar dentro de la petición hace que
// el primer usuario con red lenta se lleve el tiempo agotado.
//
// ── LA IMAGEN GENERADA SE COPIA A NUESTRO ALMACENAMIENTO ────────────
//
// La URL de KIE es efímera —misma advertencia que en Outros y Reels—, así que
// en cuanto está lista se sube a S3. Si no, el enlace muere y la pieza queda
// con un hueco donde estaba el fondo.
// ════════════════════════════════════════════════════════════════════

import { createKieImageTask, getKieImageTask, fetchKieImageBuffer } from '../services/kieService.js';
import {
    COMPOSE_MODEL, NEGATIVE_PROMPT, buildBackdropPrompt, plansFor, planById,
    normalizeComposition, validateBackdrop, aspectFor,
} from './designCompose.js';

const bucket = () => process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';

let _s3 = null;
const getS3 = async () => {
    if (_s3) return _s3;
    const aws = await import('@aws-sdk/client-s3');
    const mod = aws.default || aws;
    _s3 = {
        client: new mod.S3Client({
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId: process.env.ROTARY_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.ROTARY_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
            },
        }),
        PutObjectCommand: mod.PutObjectCommand,
    };
    return _s3;
};

let _sharp = null;
const getSharp = async () => _sharp || (_sharp = (await import('sharp')).default);

// ─── Lanzar las variantes ──────────────────────────────────────────────
//
// Una tarea POR VARIANTE. Se lanzan en paralelo porque son independientes y en
// serie el usuario esperaría la suma; y se devuelven los ids aunque alguna
// falle: con tres de cuatro también se puede elegir.
export const startComposition = async ({
    composition, format = 'post_1_1', photoUrl = null, palette = {}, variants = null,
    // El documento de la pieza. Con él, la composición sabe DÓNDE va a caer el
    // texto que imprimimos encima y deja esa franja tranquila; sin él, el
    // modelo compone a ciegas y puede dejar las caras justo debajo del título.
    // Es opcional a propósito: quien no lo tenga sigue componiendo igual.
    document = null,
}) => {
    const c = normalizeComposition(composition);
    if (!c.enabled) throw new Error('Esta plantilla no tiene la composición con IA activada.');
    if (!photoUrl && !c.baseImageUrl) throw new Error('Hace falta al menos una imagen: la base de la plantilla o la fotografía del club.');

    const planes = plansFor(variants ?? c.variants, document);
    const aspect = aspectFor(format);
    const model = COMPOSE_MODEL();

    // El ORDEN importa: la base primero y la fotografía después, porque el
    // prompt habla de «la primera» y «la segunda» imagen.
    const imageUrls = [c.baseImageUrl, photoUrl].filter(Boolean);

    const tareas = await Promise.all(planes.map(async (plan) => {
        const { prompt, dropped } = buildBackdropPrompt({
            composition: c, plan, palette, document,
            photo: photoUrl ? { url: photoUrl } : null,
            hasBase: !!c.baseImageUrl,
        });
        if (dropped.length) console.warn(`[designBackdrop] prompt recortado (${plan.id}): se dejó fuera ${dropped.join(', ')}`);
        try {
            const taskId = await createKieImageTask({
                model, prompt,
                imageUrl: imageUrls[0],
                imageUrls: imageUrls.length > 1 ? imageUrls : null,
                negativePrompt: NEGATIVE_PROMPT,
                aspectRatio: aspect,
                outputFormat: 'png',
            });
            return { planId: plan.id, label: plan.label, summary: plan.summary, taskId, error: null };
        } catch (e) {
            // El error de KIE se propaga TEXTUAL: convertirlo en «no se pudo»
            // deja a quien corrige sin saber cuál modelo falló ni por qué.
            console.error(`[designBackdrop] createTask ${plan.id}:`, e.message);
            return { planId: plan.id, label: plan.label, summary: plan.summary, taskId: null, error: e.message };
        }
    }));

    return { model, aspect, variants: tareas };
};

// ─── Sondear una variante ──────────────────────────────────────────────
//
// Devuelve `pending` mientras KIE trabaja. Cuando termina, descarga la imagen,
// la mide, la valida y la sube a S3 — todo en el mismo sondeo, porque la URL de
// KIE caduca y un segundo viaje podría llegar tarde.
export const syncComposition = async ({ taskId, format = 'post_1_1', clubId = null }) => {
    if (!taskId) throw new Error('Falta el identificador de la tarea.');
    // El contrato de `getKieImageTask` es `{ state, imageUrl, failMsg }` —no
    // `{ status, url }`—. Conviene leerlo antes de escribir contra él: es la
    // clase de error que ningún typecheck ve en un archivo .js del servidor.
    const estado = await getKieImageTask(taskId);

    if (estado.state !== 'success' && estado.state !== 'failed') return { status: 'pending' };
    if (estado.state === 'failed') return { status: 'failed', error: estado.failMsg || 'KIE no pudo generar la composición.' };
    if (!estado.imageUrl) return { status: 'failed', error: 'KIE terminó sin devolver una imagen.' };

    const buffer = await fetchKieImageBuffer(estado.imageUrl);
    const sharp = await getSharp();
    const meta = await sharp(buffer).metadata();

    const check = validateBackdrop({ width: meta.width, height: meta.height, format });

    const key = `clubs/${clubId || 'global'}/designs/backdrops/${Date.now()}-${taskId.slice(-8)}.png`;
    const { client, PutObjectCommand } = await getS3();
    await client.send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: buffer, ContentType: 'image/png' }));
    const encoded = key.split('/').map(encodeURIComponent).join('/');
    const url = `https://${bucket()}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${encoded}`;

    return {
        status: 'ready',
        url,
        width: meta.width,
        height: meta.height,
        // Los avisos VIAJAN: si el modelo devolvió otra proporción, quien mira
        // la variante tiene que saber que se va a encuadrar.
        notes: check.problemas,
    };
};

export const planLabel = (id) => planById(id).label;

export default { startComposition, syncComposition, planLabel };
