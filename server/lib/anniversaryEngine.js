// ════════════════════════════════════════════════════════════════════
// Aniversarios IA — la ORQUESTACIÓN
// v4.895.0
//
// Habla con el modelo de visión, con el redactor, con KIE, con S3 y con sharp.
// NO decide nada: el criterio vive en `anniversarySpec.js`. Si acá aparece un
// umbral, un texto de prompt o una regla, va allá.
//
// ── QUÉ SE REUTILIZA Y QUÉ ES NUEVO ─────────────────────────────────
//
// SE REUTILIZA (servicios GLOBALES de la plataforma, no el editor de
// Plantillas IA):
//   · `kieService` — la pasarela de modelos de imagen. Es el ÚNICO cliente de
//     KIE del sitio y escribir un segundo daría dos caminos hacia el proveedor
//     que se separan en silencio, el problema que `sendCampaign` arrastra en
//     el CRM.
//   · `copywritingService.generateCopy` — la cadena de proveedores de texto y
//     visión, con su respaldo entre proveedores (v4.892).
//   · `designGuard.checkPreservation` — la comprobación de que la composición
//     no inventó ni borró personas. Copiar una medición es la forma segura de
//     que las dos mitades se separen en silencio.
//   · `designBranding` — club → identidad institucional real.
//
// ES NUEVO: el pipeline entero, las mediciones de fondo y de franja, la
// corrección automática y la decisión de qué se entrega.
//
// ── LAS ETAPAS SON LLAMADAS REALES ──────────────────────────────────
//
// `analyzePhoto`, `writeCopy` y `startComposition` son tres funciones y tres
// peticiones. No están juntas por comodidad: la pantalla muestra una etapa
// cuando esa etapa OCURRIÓ, no cuando cree que va por ahí. Una barra de
// progreso inventada hace esperar por nada.
// ════════════════════════════════════════════════════════════════════

import { createKieImageTask, getKieImageTask, fetchKieImageBuffer } from '../services/kieService.js';
import { generateCopy } from '../services/copywritingService.js';
import { checkPreservation } from './designGuard.js';
import { DEFAULT_MODEL_ID, modelById, providerOf } from './anniversaryEngineSpec.js';
import {
    ANALYSIS_SYSTEM, ANALYSIS_USER, readAnalysis, fallbackAnalysis,
    REFERENCE_SYSTEM, REFERENCE_USER, readReferenceAnalysis, referenceClauseFor,
    buildCopySystem, buildCopyUser, readCopy, validateCopy, repairCopy,
    buildImagePrompt, buildNegativePrompt, textZoneFor, zoneById,
    judgePiece, retryClauseFor, canvasSize, formatById, normalizeConfig,
} from './anniversarySpec.js';

// ─── El modelo de imagen ───────────────────────────────────────────────
//
// Desde v4.897 el modelo lo decide la CONFIGURACIÓN DEL MOTOR
// (`anniversaryEngineSpec.resolveProduction`): catálogo declarado, activación
// explícita tras benchmark y fallback de infraestructura. `ANNIVERSARY_MODEL`
// queda como la salida de emergencia sin desplegar —gana sobre el panel, y el
// panel lo dice— porque KIE renombra ids (regla de Outros y Reels).
export const COMPOSE_MODEL = () => process.env.ANNIVERSARY_MODEL || DEFAULT_MODEL_ID;

const bucket = () => process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';
const region = () => process.env.AWS_REGION || 'us-east-1';

let _sharp = null;
const getSharp = async () => _sharp || (_sharp = (await import('sharp')).default);

let _s3 = null;
const getS3 = async () => {
    if (_s3) return _s3;
    const aws = await import('@aws-sdk/client-s3');
    const mod = aws.default || aws;
    _s3 = {
        client: new mod.S3Client({
            region: region(),
            credentials: {
                accessKeyId: process.env.ROTARY_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.ROTARY_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
            },
        }),
        PutObjectCommand: mod.PutObjectCommand,
    };
    return _s3;
};

/**
 * Sube un buffer y devuelve su URL pública.
 *
 * `public-tmp/` es el prefijo EFÍMERO, aparte de la Biblioteca Multimedia a
 * propósito: es contenido de un visitante anónimo y se puede vaciar con una
 * regla de ciclo de vida del bucket sin tocar los archivos de nadie. Mismo
 * criterio que el portal de Plantillas IA.
 *
 * ⚠️ La fotografía DEJA DE SER EFÍMERA en este módulo, y hay que decirlo: KIE
 * necesita una URL que pueda descargar, así que subirla no es un descuido, es
 * el precio de la composición generativa. El panel lo advierte.
 */
export const storeBuffer = async (buffer, { prefix = 'anniversaries', ext = 'png', mime = 'image/png' } = {}) => {
    const { client, PutObjectCommand } = await getS3();
    const key = `public-tmp/${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await client.send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: buffer, ContentType: mime }));
    const encoded = key.split('/').map(encodeURIComponent).join('/');
    return `https://${bucket()}.s3.${region()}.amazonaws.com/${encoded}`;
};

const DATA_URL = /^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/i;

export const decodeDataUrl = (dataUrl) => {
    const m = String(dataUrl || '').match(DATA_URL);
    if (!m) return null;
    return { mime: m[1], ext: m[1].split('/')[1].replace('jpeg', 'jpg'), buffer: Buffer.from(m[2], 'base64') };
};

// ─── Etapa 1 — la fotografía ───────────────────────────────────────────

export const MAX_PHOTO_SIDE = 2000;

/**
 * Recibe la fotografía, corrige su orientación, la acota y la sube.
 *
 * `rotate()` sin argumentos aplica la orientación EXIF. Sin eso, una foto de
 * móvil entra acostada y el usuario cree que el módulo la rotó. Lo aprendió el
 * portal de Plantillas IA y vale igual acá.
 *
 * Se acota el lado mayor porque una foto de 6000 px no aporta nada a una pieza
 * de 1080 y sí encarece cada viaje al proveedor.
 */
export const ingestPhoto = async (dataUrl, { prefix = 'anniversaries' } = {}) => {
    const decoded = decodeDataUrl(dataUrl);
    if (!decoded) throw new Error('La fotografía no tiene un formato reconocible. Se admiten JPG, PNG y WebP.');

    const sharp = await getSharp();
    const original = sharp(decoded.buffer).rotate();
    const meta = await original.metadata();
    if (!meta.width || !meta.height) throw new Error('No se pudieron leer las medidas de la fotografía.');

    const lado = Math.max(meta.width, meta.height);
    const salida = lado > MAX_PHOTO_SIDE
        ? await original.resize({ width: meta.width >= meta.height ? MAX_PHOTO_SIDE : null, height: meta.height > meta.width ? MAX_PHOTO_SIDE : null, fit: 'inside' }).jpeg({ quality: 92 }).toBuffer()
        : await original.jpeg({ quality: 94 }).toBuffer();

    const final = await sharp(salida).metadata();
    const url = await storeBuffer(salida, { prefix, ext: 'jpg', mime: 'image/jpeg' });

    const warnings = [];
    if (Math.min(final.width, final.height) < 700) {
        warnings.push('La fotografía es pequeña. Va a servir, pero se va a ver blanda si la pieza se imprime.');
    }
    return { url, buffer: salida, width: final.width, height: final.height, warnings };
};

// ─── Etapa 2 — el análisis ─────────────────────────────────────────────
//
// EL ANÁLISIS DEGRADA, NO BLOQUEA. Si el proveedor de visión no responde, se
// arma la pieza con criterio propio (`fallbackAnalysis`) y el texto va al
// tercio inferior, que es la zona que nunca compite con un rostro en una foto
// de grupo. Una foto sin analizar sigue siendo generable, y decir que no se
// pudo mirar es la verdad — lo contrario sería inventar un análisis.
export const analyzePhoto = async ({ photoUrl, width = null, height = null, provider = null } = {}) => {
    try {
        const raw = await generateCopy({
            provider: provider || undefined,
            system: ANALYSIS_SYSTEM,
            userText: ANALYSIS_USER,
            imageUrl: photoUrl,
            temperature: 0.1,
            maxTokens: 500,
            jsonMode: true,
        });
        const analysis = readAnalysis(raw?.text ?? raw);
        // La ORIENTACIÓN la sabemos con certeza por las medidas del archivo:
        // no hace falta creerle al modelo un dato que ya está medido.
        if (width && height) {
            analysis.orientation = width > height * 1.08 ? 'horizontal' : (height > width * 1.08 ? 'vertical' : 'cuadrada');
        }
        return analysis;
    } catch (e) {
        console.warn('[anniversary] el análisis de la fotografía no se pudo hacer:', e.message);
        return fallbackAnalysis({ width, height });
    }
};

// ─── Etapa 3 — el mensaje ──────────────────────────────────────────────
//
// EL MODELO ESCRIBE, EL CÓDIGO DECIDE. `validateCopy` comprueba y el bucle le
// devuelve LA REGLA CONCRETA que rompió, con su número. Pedirle «revisá el
// formato» no corrige nada: es la regla de `templateComposer.js` y de
// `seoAI.js`.
//
// Agotados los intentos el trabajo NO se tira: se ajusta lo ajustable por
// código y se entrega CON SUS AVISOS. Un titular dos caracteres largo es mejor
// que ninguna pieza, y quien la mira lo ve.
export const COPY_ATTEMPTS = 3;

export const writeCopy = async ({ config, clubName, years, analysis, provider = null } = {}) => {
    const c = normalizeConfig(config);
    const system = buildCopySystem(c);
    const base = buildCopyUser({ clubName, years, analysis });

    let mejor = null;
    let mejorErrores = Infinity;
    let ultimoFallo = null;

    for (let intento = 0; intento < COPY_ATTEMPTS; intento++) {
        const userText = intento === 0
            ? base
            : `${base}\n\nEl intento anterior no cumplió estas reglas. Corregilas exactamente:\n- ${ultimoFallo.join('\n- ')}`;
        let raw;
        try {
            raw = await generateCopy({
                provider: provider || undefined,
                system, userText, temperature: 0.7, maxTokens: 600, jsonMode: true,
            });
        } catch (e) {
            // El motivo del proveedor se propaga TEXTUAL: convertirlo en «no se
            // pudo» deja a quien corrige sin saber si falta la credencial, si
            // el modelo se retiró o si la cuenta tiene un pago pendiente.
            throw new Error(`No se pudo escribir el mensaje. ${e.message}`);
        }
        const copy = readCopy(raw?.text ?? raw);
        if (!copy) { ultimoFallo = ['La respuesta no era un JSON con "title" y "message".']; continue; }

        const check = validateCopy(copy, { clubName, years });
        // Se guarda el intento con MENOS reglas rotas, no el último por ser el
        // último: un segundo intento puede salir peor que el primero.
        if (check.errors.length < mejorErrores) { mejor = copy; mejorErrores = check.errors.length; }
        if (check.ok) return { copy, warnings: check.warnings, repaired: [], attempts: intento + 1 };
        ultimoFallo = check.errors;
    }

    const reparado = repairCopy(mejor, { clubName, years });
    // La CAUSA se dice: «falta el mensaje» a secas no distingue un redactor
    // que contestó basura de una validación que no se pudo cumplir, y se
    // corrigen en sitios distintos (regla de v4.859).
    const causa = mejor === null
        ? [`El redactor respondió pero ninguno de los ${COPY_ATTEMPTS} intentos devolvió un JSON utilizable. Volvé a probar, o mirá el proveedor de copy en Integraciones → Modelos IA.`]
        : [];
    return {
        copy: reparado.copy,
        warnings: [...causa, ...reparado.warnings, ...reparado.errors],
        // Lo reparado se DICE, no sólo se diagnostica: un titular que se
        // recorta en silencio se publica con puntos suspensivos y quien lo
        // escribió se entera al verlo (v4.891).
        repaired: reparado.repaired,
        attempts: COPY_ATTEMPTS,
    };
};

// ─── El análisis de la referencia visual ───────────────────────────────
//
// UNA vez por referencia, al guardarla en el panel — no por generación: el
// resultado se cachea dentro de la propia referencia (`references[].analysis`)
// y de ahí sale la cláusula de estilo del prompt. Nunca lanza: sin análisis la
// generación sigue igual que antes, con la referencia viajando sólo como
// imagen (degrada, no bloquea).
export const analyzeReference = async (url) => {
    try {
        const raw = await generateCopy({
            system: REFERENCE_SYSTEM,
            userText: REFERENCE_USER,
            imageUrl: url,
            temperature: 0.1,
            maxTokens: 500,
            jsonMode: true,
        });
        return readReferenceAnalysis(raw?.text ?? raw);
    } catch (e) {
        console.warn('[anniversary] el análisis de la referencia no se pudo hacer:', e.message);
        return null;
    }
};

// ─── Etapa 4 — la composición ──────────────────────────────────────────

/** Descarga una imagen a buffer. Para el adaptador síncrono: OpenAI recibe
 *  archivos, no URLs. */
const fetchImageBuffer = async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`No se pudo descargar la imagen (${r.status}).`);
    return Buffer.from(await r.arrayBuffer());
};

/**
 * El adaptador de OpenAI (GPT Image, el motor de ChatGPT). SÍNCRONO: la
 * generación ocurre en esta misma llamada (~20-60 s, holgado en los 300 s de
 * `vercel.json`). Mismos parámetros que el camino ya probado del Generador de
 * Publicaciones (`input_fidelity: high`, `quality: high`); acá además viajan
 * VARIAS imágenes — la referencia de estilo primero y la fotografía después,
 * que es el orden del que habla el prompt.
 */
const editImageOpenAI = async ({ model, prompt, buffers, size }) => {
    const formData = new FormData();
    formData.append('model', model);
    for (const b of buffers) formData.append('image[]', new Blob([b], { type: 'image/png' }), 'image.png');
    formData.append('prompt', prompt);
    formData.append('size', size);
    formData.append('quality', 'high');
    formData.append('input_fidelity', 'high');
    formData.append('n', '1');
    const resp = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: formData,
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok || !data?.data?.[0]?.b64_json) {
        // El motivo del proveedor se propaga TEXTUAL (regla del sitio).
        throw new Error(`OpenAI rechazó la generación: ${data?.error?.message || `HTTP ${resp.status}`}`);
    }
    return Buffer.from(data.data[0].b64_json, 'base64');
};

/** El marcador de una tarea SÍNCRONA: la imagen ya está generada y subida, y
 *  el «taskId» lleva su URL. El sondeo la encuentra lista en el primer viaje,
 *  y TODO el camino de después —medición, validación, reintento, fallback— es
 *  exactamente el mismo que con una tarea de KIE. */
const SYNC_TASK = 'sync:';

export const startComposition = async ({ config, photoUrl, clubName = '', years, analysis, extraClause = '', model = null, engineConfig = null } = {}) => {
    if (!photoUrl) throw new Error('Hace falta la fotografía: el modelo compone la pieza ALREDEDOR de ella.');

    const c = normalizeConfig(config);
    // La referencia visual tiene su interruptor: apagarla manda sólo la
    // fotografía, sin perder la configuración de las referencias cargadas.
    const referencia = c.promptOptions.useReference
        ? (c.references.find(r => r.primary) || c.references[0] || null)
        : null;

    // El modelo: el explícito (benchmark, fallback) > la configuración del
    // motor no viaja hasta acá —la resuelve el controlador— > la emergencia
    // del entorno > el default del catálogo.
    const modeloElegido = model || COMPOSE_MODEL();
    const ficha = modelById(modeloElegido, engineConfig || {});
    const proveedor = providerOf(ficha);

    // Se NOMBRA la variable que falta, LA DEL PROVEEDOR DE ESTE MODELO. Un
    // «no se pudo generar» a secas manda a diagnosticar a ciegas.
    if (!process.env[proveedor.envKey]) {
        throw new Error(`Falta la credencial del generador de imágenes (${proveedor.envKey}). Cargala en Integraciones antes de usar este modelo.`);
    }

    const { prompt, zoneId, dropped } = buildImagePrompt({
        config: c, clubName, years, analysis, hasReference: !!referencia,
        // La otra mitad del análisis de la referencia: su descripción EN
        // PALABRAS, hecha una vez al guardarla y cacheada en ella.
        referenceClause: referencia?.analysis ? referenceClauseFor(referencia.analysis) : '',
        maxChars: ficha?.capabilities?.promptMaxChars || null,
    });
    if (dropped.length) {
        // Lo que se deja fuera se ANOTA. Un recorte silencioso convierte
        // «se lo pedimos al modelo» en una afirmación falsa.
        console.warn(`[anniversary] prompt recortado: se dejó fuera ${dropped.join(', ')}`);
    }

    const promptFinal = extraClause ? `${prompt}\n${extraClause}` : prompt;

    if (proveedor.id === 'openai') {
        const buffers = [];
        if (referencia?.url) buffers.push(await fetchImageBuffer(referencia.url));
        buffers.push(await fetchImageBuffer(photoUrl));
        const generado = await editImageOpenAI({
            model: modeloElegido,
            prompt: promptFinal,
            buffers,
            // GPT Image no recibe proporción libre: la pieza cuadrada sale en
            // su tamaño nativo. El compositor dibuja por fracciones, así que
            // 1024 contra 1080 no cambia la maquetación.
            size: formatById(c.format).aspect === '1:1' ? '1024x1024' : 'auto',
        });
        const url = await storeBuffer(generado, { prefix: 'anniversaries/backdrops', ext: 'png', mime: 'image/png' });
        return { taskId: `${SYNC_TASK}${url}`, zoneId, prompt: promptFinal, dropped, model: modeloElegido, usedReference: !!referencia };
    }

    // El ORDEN importa: la referencia primero y la fotografía después, porque
    // el prompt habla de «la primera» y «la última» imagen.
    const imageUrls = [referencia?.url, photoUrl].filter(Boolean);

    const taskId = await createKieImageTask({
        model: modeloElegido,
        prompt: promptFinal,
        imageUrl: imageUrls[0],
        imageUrls: imageUrls.length > 1 ? imageUrls : null,
        // Un modelo SIN campo de prompt negativo declarado no lo recibe:
        // mandar campos que el modelo no declara es lo que rompió Outros en
        // v4.645. Sus restricciones sólo viajan dentro del positivo, y la
        // elegibilidad ya lo AVISÓ al elegirlo.
        negativePrompt: ficha && ficha.capabilities?.negativePrompt === false ? null : buildNegativePrompt(c),
        aspectRatio: formatById(c.format).aspect,
        outputFormat: 'png',
    });
    return { taskId, zoneId, prompt: promptFinal, dropped, model: modeloElegido, usedReference: !!referencia };
};

/** Sondea la tarea. Devuelve `pending` mientras el proveedor trabaja; cuando
 *  termina, descarga la imagen y la sube a NUESTRO almacenamiento — la URL de
 *  KIE es efímera y un segundo viaje llegaría tarde. */
export const syncComposition = async (taskId) => {
    // Una tarea síncrona ya terminó al crearse: su imagen está en NUESTRO
    // almacenamiento y el marcador lleva la URL. Se descarga para medirla por
    // el MISMO camino que una de KIE — la validación no distingue proveedores.
    if (String(taskId || '').startsWith(SYNC_TASK)) {
        const url = String(taskId).slice(SYNC_TASK.length);
        const buffer = await fetchImageBuffer(url);
        const sharp = await getSharp();
        const meta = await sharp(buffer).metadata();
        return { status: 'ready', url, buffer, width: meta.width, height: meta.height };
    }
    const estado = await getKieImageTask(taskId);
    if (estado.state !== 'success' && estado.state !== 'failed') return { status: 'pending' };
    if (estado.state === 'failed') return { status: 'failed', error: estado.failMsg || 'El generador de imágenes no pudo componer la pieza.' };
    if (!estado.imageUrl) return { status: 'failed', error: 'El generador terminó sin devolver una imagen.' };

    const buffer = await fetchKieImageBuffer(estado.imageUrl);
    const url = await storeBuffer(buffer, { prefix: 'anniversaries/backdrops', ext: 'png', mime: 'image/png' });
    const sharp = await getSharp();
    const meta = await sharp(buffer).metadata();
    return { status: 'ready', url, buffer, width: meta.width, height: meta.height };
};

// ─── Etapa 5 — la verificación ─────────────────────────────────────────

/**
 * Cuánto blanco tiene la imagen.
 *
 * Dos señales y no una: la MEDIA de luminancia dice si la página es clara, y
 * la PROPORCIÓN de píxeles casi blancos dice si hay superficie limpia. Una sola
 * no alcanza — una imagen gris uniforme tiene media alta y ni un píxel blanco.
 */
export const measureWhiteness = async (buffer) => {
    const sharp = await getSharp();
    // Se reduce antes de contar: sobre 1080×1080 son un millón de píxeles por
    // pieza y la respuesta no cambia.
    const { data, info } = await sharp(buffer).resize(256, 256, { fit: 'fill' })
        .greyscale().raw().toBuffer({ resolveWithObject: true });
    let suma = 0, claros = 0;
    for (let i = 0; i < data.length; i++) {
        suma += data[i];
        if (data[i] >= 235) claros++;
    }
    const total = info.width * info.height;
    return { meanLuma: suma / total, whiteShare: claros / total };
};

/**
 * Cómo está la franja donde va el texto.
 *
 * ⚠️ SE MIDE LA REGIÓN, NO LA IMAGEN ENTERA, y ésa es toda la diferencia. Es
 * la lección de v4.715 con los logotipos: sobre la escena completa la señal se
 * diluye —la franja es una fracción de los píxeles— y ningún umbral la
 * distingue del ruido. Recortada, la franja es el 100 % de lo que se mide.
 *
 * ⚠️ `sharp.stats()` IGNORA el `extract()` encadenado y devolvería la
 * estadística de la imagen entera, idéntica para cualquier franja. El recorte
 * se MATERIALIZA a buffer antes de medir (v4.799).
 */
export const measureTextZone = async (buffer, zoneId) => {
    const sharp = await getSharp();
    const meta = await sharp(buffer).metadata();
    if (!meta.width || !meta.height) return { zoneLuma: null, zoneStdDev: null };
    const z = zoneById(zoneId);

    const left = Math.max(0, Math.round(z.x * meta.width));
    const top = Math.max(0, Math.round(z.y * meta.height));
    const width = Math.max(8, Math.min(meta.width - left, Math.round(z.w * meta.width)));
    const height = Math.max(8, Math.min(meta.height - top, Math.round(z.h * meta.height)));

    const recorte = await sharp(buffer).extract({ left, top, width, height }).greyscale().toBuffer();
    const stats = await sharp(recorte).stats();
    const canal = stats.channels[0];
    return { zoneLuma: canal.mean, zoneStdDev: canal.stdev };
};

/**
 * La verificación completa de una composición.
 *
 * `preservation` reutiliza `designGuard.checkPreservation`, que es el control
 * de personas inventadas / desaparecidas / rostros que ya existe y está
 * probado. Nunca tumba la generación: un fallo suyo devuelve `unavailable`, y
 * «no se pudo comprobar» NO es un tipo de «bien» — se dice distinto.
 */
export const verifyComposition = async ({ photoBuffer, composedBuffer, zoneId, format }) => {
    const [blanco, franja] = await Promise.all([
        measureWhiteness(composedBuffer).catch(() => ({ meanLuma: null, whiteShare: null })),
        measureTextZone(composedBuffer, zoneId).catch(() => ({ zoneLuma: null, zoneStdDev: null })),
    ]);

    let preservation = null;
    if (photoBuffer) {
        try {
            preservation = await checkPreservation(photoBuffer, composedBuffer, {
                publish: (buf) => storeBuffer(buf, { prefix: 'anniversaries/checks', ext: 'jpg', mime: 'image/jpeg' }),
            });
        } catch (e) {
            console.warn('[anniversary] no se pudo comprobar la preservación:', e.message);
            preservation = { state: 'unavailable', use: true, reason: 'No se pudo comprobar la fotografía.' };
        }
    }

    const sharp = await getSharp();
    const meta = await sharp(composedBuffer).metadata().catch(() => ({}));

    return {
        ...judgePiece({
            width: meta.width || 0, height: meta.height || 0, format,
            meanLuma: blanco.meanLuma, whiteShare: blanco.whiteShare,
            zoneLuma: franja.zoneLuma, zoneStdDev: franja.zoneStdDev,
            preservation,
        }),
        // Los números viajan a la ficha: un veredicto sin su medida obliga a
        // reproducir el fallo a ciegas.
        measurements: {
            meanLuma: blanco.meanLuma, whiteShare: blanco.whiteShare,
            zoneLuma: franja.zoneLuma, zoneStdDev: franja.zoneStdDev,
            width: meta.width || null, height: meta.height || null,
        },
        preservation: preservation ? {
            state: preservation.state, use: preservation.use,
            reason: preservation.reason || null, cropped: !!preservation.cropped,
        } : null,
    };
};

/** Lo que se le agrega al prompt en el reintento. Se le dice el problema
 *  CONCRETO, no «hacelo mejor». */
export const retryClause = retryClauseFor;

// ─── El branding, desde archivos REALES ────────────────────────────────
//
// LA MARCA NO LA GENERA LA IA. Estos valores salen de la base —el logotipo del
// club, el número del distrito, el gobernador— o de un archivo que subió el
// administrador. Ninguno se dibuja y ninguno se inventa: un club sin logotipo
// cargado no muestra logotipo, y eso es la verdad.
export const resolveBranding = async ({ config, subjectClubId = null, clubName = '', period = null } = {}) => {
    const c = normalizeConfig(config);
    const out = {
        clubLogo: null, districtLine: null, period: period || null,
        footerImage: c.branding.footerImage, watermark: c.branding.watermark,
        missing: [],
    };

    if (!subjectClubId) {
        if (c.branding.clubLogo) out.missing.push('El club no está registrado como sitio en la plataforma, así que no hay logotipo que imprimir.');
        return out;
    }

    try {
        const { brandingForClub, rotaryPeriod } = await import('./designBranding.js');
        const b = await brandingForClub(subjectClubId);
        if (!b) return out;
        out.period = out.period || b.period || rotaryPeriod();
        if (c.branding.clubLogo) {
            if (b.logo) out.clubLogo = b.logo;
            else out.missing.push(`${clubName || b.clubName} no tiene logotipo cargado en la plataforma.`);
        }
        if (c.branding.districtLine) {
            const partes = [];
            if (b.district) partes.push(`Distrito ${b.district}`);
            if (b.governor) partes.push(b.governor);
            if (out.period) partes.push(out.period);
            out.districtLine = partes.join(' · ') || null;
            if (!out.districtLine) out.missing.push('El distrito de este club no tiene número ni gobernador registrados.');
        }
    } catch (e) {
        // El branding es una capa, no un requisito: sin él la pieza sale con su
        // diseño y su texto, que es una pieza correcta.
        console.warn('[anniversary] no se pudo resolver el branding:', e.message);
        out.missing.push('No se pudo leer la identidad institucional del club.');
    }
    return out;
};

export default {
    COMPOSE_MODEL, storeBuffer, decodeDataUrl, ingestPhoto,
    analyzePhoto, analyzeReference, writeCopy, startComposition, syncComposition,
    measureWhiteness, measureTextZone, verifyComposition, retryClause, resolveBranding,
    canvasSize, textZoneFor,
};
