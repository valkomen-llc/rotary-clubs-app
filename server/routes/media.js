import express from 'express';
import db from '../lib/db.js';
import { authMiddleware } from '../middleware/auth.js';
import { ensureMediaFolderSchema } from '../lib/ensureMediaFolderSchema.js';
import { isHeicFile, jpegNameFor, jpegKeyFor, convertHeicToJpeg } from '../lib/heicImages.js';
import {
    validateFolderName, folderKey, canMoveFolder,
    buildFolderTree, withRollupCounts, breadcrumbOf,
} from '../lib/mediaFolders.js';

const router = express.Router();

// ─── Carpetas de la Librería de Medios ───────────────────────────────────────
//
// OJO CON EL NOMBRE: `GET /api/media/folders` ya existía y significa OTRA cosa
// —la lista de CLUBES que el operador de la plataforma recorre como si fueran
// carpetas—. Son dos ejes distintos: aquél es «de quién es el archivo» y éste
// es «cómo lo ordenó ese sitio por dentro». Por eso las rutas nuevas viven en
// `/library-folders` en vez de reutilizar la palabra: renombrar la vieja
// dejaría la pantalla del operador rota en cualquier navegador con el bundle
// anterior en caché.

/**
 * A qué sitio pertenece lo que el usuario está mirando.
 *
 * El aislamiento vive acá y en el WHERE de cada consulta, no en la pantalla:
 * un administrador de sitio sólo ve y toca las carpetas de SU sitio. El
 * operador de la plataforma puede pararse en cualquiera pasando `clubId`, que
 * es lo que ya hace la vista de clubes.
 */
const folderScopeOf = (req) => {
    const asked = req.query.clubId || req.body?.clubId || null;
    if (req.user.role === 'administrator') return asked || req.user.clubId || null;
    return req.user.clubId || null;
};

/** Todas las carpetas del sitio, en plano. Es la entrada del criterio. */
const listFolders = async (clubId) => {
    const { rows } = await db.query(
        `SELECT id, name, "clubId", "parentId", "createdAt"
           FROM "MediaFolder"
          WHERE "clubId" IS NOT DISTINCT FROM $1
          ORDER BY name ASC`,
        [clubId]
    );
    return rows;
};

// GET /api/media/library-folders — el árbol del sitio, con conteos.
router.get('/library-folders', authMiddleware, async (req, res) => {
    try {
        await ensureMediaFolderSchema();
        const clubId = folderScopeOf(req);
        const folders = await listFolders(clubId);

        // Un solo conteo agrupado en vez de una consulta por carpeta.
        const counts = await db.query(
            `SELECT "folderId", COUNT(*)::int AS c
               FROM "Media"
              WHERE "folderId" IS NOT NULL
                AND "clubId" IS NOT DISTINCT FROM $1
              GROUP BY "folderId"`,
            [clubId]
        );
        const byFolder = new Map(counts.rows.map(r => [r.folderId, r.c]));

        const rootCount = await db.query(
            `SELECT COUNT(*)::int AS c FROM "Media"
              WHERE "folderId" IS NULL AND "clubId" IS NOT DISTINCT FROM $1`,
            [clubId]
        );

        const tree = withRollupCounts(
            buildFolderTree(folders.map(f => ({ ...f, ownCount: byFolder.get(f.id) || 0 })))
        );

        res.json({ folders, tree, rootCount: rootCount.rows[0]?.c || 0 });
    } catch (error) {
        console.error('[Media] list folders error:', error);
        res.status(500).json({ error: 'Error al cargar las carpetas' });
    }
});

// POST /api/media/library-folders — crear.
router.post('/library-folders', authMiddleware, async (req, res) => {
    try {
        await ensureMediaFolderSchema();
        const clubId = folderScopeOf(req);
        const { ok, name, error } = validateFolderName(req.body?.name);
        if (!ok) return res.status(400).json({ error });

        const parentId = req.body?.parentId || null;
        const folders = await listFolders(clubId);

        if (parentId && !folders.some(f => f.id === parentId)) {
            return res.status(404).json({ error: 'La carpeta donde querés crearla no existe.' });
        }
        // La profundidad se comprueba como si la nueva carpeta ya colgara del
        // padre: `canMoveFolder` con una hoja recién nacida es exactamente eso.
        const depth = canMoveFolder([...folders, { id: '__nueva__', name, parentId: null }], '__nueva__', parentId);
        if (!depth.ok) return res.status(400).json({ error: depth.error });

        const key = folderKey(name);
        if (folders.some(f => f.parentId === parentId && folderKey(f.name) === key)) {
            return res.status(409).json({ error: `Ya hay una carpeta llamada «${name}» acá.` });
        }

        const { rows } = await db.query(
            `INSERT INTO "MediaFolder" (id, name, "clubId", "parentId", "createdBy")
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4) RETURNING *`,
            [name, clubId, parentId, req.user.id || req.user.email || null]
        );
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error('[Media] create folder error:', error);
        res.status(500).json({ error: 'Error al crear la carpeta' });
    }
});

// PATCH /api/media/library-folders/:id — renombrar y/o mover.
router.patch('/library-folders/:id', authMiddleware, async (req, res) => {
    try {
        await ensureMediaFolderSchema();
        const clubId = folderScopeOf(req);
        const folders = await listFolders(clubId);
        const current = folders.find(f => f.id === req.params.id);
        // El 404 se decide con la lista YA acotada al sitio: una carpeta de
        // otro sitio no existe para quien pregunta, que es la respuesta
        // correcta y además no revela que exista.
        if (!current) return res.status(404).json({ error: 'La carpeta no existe.' });

        let name = current.name;
        if (req.body?.name !== undefined) {
            const v = validateFolderName(req.body.name);
            if (!v.ok) return res.status(400).json({ error: v.error });
            name = v.name;
        }

        const parentId = req.body?.parentId !== undefined ? (req.body.parentId || null) : current.parentId;

        if (parentId !== current.parentId) {
            const move = canMoveFolder(folders, current.id, parentId);
            if (!move.ok) return res.status(400).json({ error: move.error });
        }

        const key = folderKey(name);
        if (folders.some(f => f.id !== current.id && f.parentId === parentId && folderKey(f.name) === key)) {
            return res.status(409).json({ error: `Ya hay una carpeta llamada «${name}» ahí.` });
        }

        const { rows } = await db.query(
            `UPDATE "MediaFolder"
                SET name = $1, "parentId" = $2, "updatedAt" = NOW()
              WHERE id = $3 AND "clubId" IS NOT DISTINCT FROM $4
              RETURNING *`,
            [name, parentId, current.id, clubId]
        );
        res.json(rows[0]);
    } catch (error) {
        console.error('[Media] update folder error:', error);
        res.status(500).json({ error: 'Error al actualizar la carpeta' });
    }
});

// DELETE /api/media/library-folders/:id — borrar la carpeta, NUNCA los archivos.
router.delete('/library-folders/:id', authMiddleware, async (req, res) => {
    try {
        await ensureMediaFolderSchema();
        const clubId = folderScopeOf(req);
        const folders = await listFolders(clubId);
        const current = folders.find(f => f.id === req.params.id);
        if (!current) return res.status(404).json({ error: 'La carpeta no existe.' });

        // Borrar una carpeta NO borra lo que hay dentro. Un archivo puede estar
        // publicado en el sitio, ser el logo del club o el fondo de una
        // plantilla: perderlo por ordenar carpetas sería destructivo y no es lo
        // que nadie espera de «eliminar carpeta». Sus archivos y sus
        // subcarpetas SUBEN al padre, y la respuesta dice cuántos para que la
        // pantalla lo pueda contar.
        const moved = await db.query(
            `UPDATE "Media" SET "folderId" = $1
              WHERE "folderId" = $2 AND "clubId" IS NOT DISTINCT FROM $3`,
            [current.parentId, current.id, clubId]
        );
        const promoted = await db.query(
            `UPDATE "MediaFolder" SET "parentId" = $1, "updatedAt" = NOW()
              WHERE "parentId" = $2 AND "clubId" IS NOT DISTINCT FROM $3`,
            [current.parentId, current.id, clubId]
        );
        await db.query(
            `DELETE FROM "MediaFolder" WHERE id = $1 AND "clubId" IS NOT DISTINCT FROM $2`,
            [current.id, clubId]
        );

        res.json({
            deleted: current.id,
            movedFiles: moved.rowCount || 0,
            movedFolders: promoted.rowCount || 0,
            parentId: current.parentId,
        });
    } catch (error) {
        console.error('[Media] delete folder error:', error);
        res.status(500).json({ error: 'Error al eliminar la carpeta' });
    }
});

// POST /api/media/library-folders/move — mandar archivos a una carpeta.
// `folderId: null` los devuelve a la raíz.
router.post('/library-folders/move', authMiddleware, async (req, res) => {
    try {
        await ensureMediaFolderSchema();
        const clubId = folderScopeOf(req);
        const ids = Array.isArray(req.body?.mediaIds) ? req.body.mediaIds.filter(Boolean) : [];
        if (!ids.length) return res.status(400).json({ error: 'No se indicó ningún archivo.' });

        const folderId = req.body?.folderId || null;
        if (folderId) {
            // La carpeta de destino tiene que ser del MISMO sitio. Sin esta
            // comprobación, un id ajeno mandaría el archivo a una carpeta que
            // su dueño no ve: desaparecido de la raíz y en la carpeta de otro.
            const folders = await listFolders(clubId);
            if (!folders.some(f => f.id === folderId)) {
                return res.status(404).json({ error: 'La carpeta de destino no existe.' });
            }
        }

        // El WHERE lleva el sitio además de los ids: quien manda una lista de
        // ids ajenos no mueve nada, en vez de mover lo ajeno.
        const scope = req.user.role === 'administrator' && !clubId
            ? { clause: '', params: [folderId, ids] }
            : { clause: ' AND "clubId" IS NOT DISTINCT FROM $3', params: [folderId, ids, clubId] };

        const result = await db.query(
            `UPDATE "Media" SET "folderId" = $1 WHERE id = ANY($2::text[])${scope.clause}`,
            scope.params
        );
        res.json({ moved: result.rowCount || 0, folderId });
    } catch (error) {
        console.error('[Media] move media error:', error);
        res.status(500).json({ error: 'Error al mover los archivos' });
    }
});

/**
 * Resuelve la carpeta a la que debe entrar un archivo recién subido.
 *
 * Devuelve NULL —la raíz— si no se pidió ninguna o si la pedida no es de ese
 * sitio. No lanza a propósito: para cuando esto corre, el archivo YA está en
 * S3, y fallar acá dejaría el objeto subido y sin fila en la Biblioteca, que es
 * el peor de los dos resultados.
 */
const resolveTargetFolder = async (folderId, clubId) => {
    if (!folderId) return null;
    try {
        const { rows } = await db.query(
            `SELECT id FROM "MediaFolder"
              WHERE id = $1 AND "clubId" IS NOT DISTINCT FROM $2`,
            [folderId, clubId]
        );
        return rows[0]?.id || null;
    } catch {
        return null;
    }
};

// GET /api/media/library-folders/:id/breadcrumb — la ruta de una carpeta.
router.get('/library-folders/:id/breadcrumb', authMiddleware, async (req, res) => {
    try {
        await ensureMediaFolderSchema();
        const folders = await listFolders(folderScopeOf(req));
        res.json(breadcrumbOf(folders, req.params.id));
    } catch (error) {
        console.error('[Media] breadcrumb error:', error);
        res.status(500).json({ error: 'Error al resolver la ruta' });
    }
});

// ── Single lazy loader for ALL upload dependencies ──
// Creates a minimal S3 client directly — avoids loading storage.js
// which drags in multer-s3, s3-request-presigner, etc.
let _uploadDeps = null;
const getUploadDeps = async () => {
    if (!_uploadDeps) {
        const [multerMod, awsMod, presignerMod] = await Promise.all([
            import('multer'),
            import('@aws-sdk/client-s3'),
            import('@aws-sdk/s3-request-presigner')
        ]);
        
        const multer = multerMod.default || multerMod;
        const aws = awsMod.default || awsMod;
        
        // Create minimal S3 client (no storage.js needed)
        const s3 = new aws.S3Client({
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId: process.env.ROTARY_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.ROTARY_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
            },
            maxAttempts: 2,
        });

        _uploadDeps = {
            upload: multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }),
            s3,
            PutObjectCommand: aws.PutObjectCommand,
            DeleteObjectCommand: aws.DeleteObjectCommand,
            DeleteObjectsCommand: aws.DeleteObjectsCommand,
            GetObjectCommand: aws.GetObjectCommand,
            getSignedUrl: presignerMod.getSignedUrl
        };
    }
    return _uploadDeps;
};

let _sharp = null;
const getSharp = async () => {
    if (!_sharp) {
        const mod = await import('sharp');
        _sharp = mod.default || mod;
    }
    return _sharp;
};

const getMediaType = (mimetype, filename) => {
    // Un `.heic` es una IMAGEN aunque el navegador mande el tipo vacío o
    // `application/octet-stream`, que es lo que hacen varios al elegirlo. Sin
    // esta línea entraba a la Librería clasificado como «documento» y no
    // aparecía siquiera en el filtro de imágenes.
    if (isHeicFile({ filename, mimetype })) return 'image';
    if (String(mimetype || '').startsWith('image/')) return 'image';
    if (String(mimetype || '').startsWith('video/')) return 'video';
    return 'document';
};

/**
 * Deja el archivo listo para verse en la web.
 *
 * Devuelve `{ buffer, filename, s3Key, contentType, converted }`. Si no hacía
 * falta convertir —o si la conversión falla— devuelve lo que entró: perder el
 * archivo sería peor que no poder mostrarlo, y el original queda igualmente
 * guardado y descargable. El fallo se anota en consola y viaja al cliente en
 * `conversion`, para que la pantalla lo pueda decir.
 */
const toDisplayableImage = async ({ buffer, filename, s3Key, contentType }) => {
    if (!isHeicFile({ filename, mimetype: contentType })) {
        return { buffer, filename, s3Key, contentType, converted: false, error: null };
    }
    try {
        const { buffer: jpeg } = await convertHeicToJpeg(buffer);
        return {
            buffer: jpeg,
            filename: jpegNameFor(filename),
            s3Key: jpegKeyFor(s3Key),
            contentType: 'image/jpeg',
            converted: true,
            error: null,
        };
    } catch (err) {
        console.error('[Media] HEIC conversion failed:', err.message);
        return { buffer, filename, s3Key, contentType, converted: false, error: err.message };
    }
};

/**
 * La URL pública de un objeto de S3.
 *
 * Cada segmento se codifica por separado: `encodeURIComponent` sobre la clave
 * entera convertiría las barras en `%2F` y la dirección dejaría de resolver.
 */
const publicUrlFor = (bucket, key) => {
    const encoded = String(key).split('/').map(encodeURIComponent).join('/');
    return `https://${bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${encoded}`;
};

/** Baja un objeto de S3 a memoria. */
const fetchFromS3 = async (bucket, key) => {
    const { s3, GetObjectCommand } = await getUploadDeps();
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const chunks = [];
    for await (const chunk of obj.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
};

// ── Proxy Endpoint to Bypass CORS for Canvas Operations ──
router.get('/proxy', authMiddleware, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL is required' });
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch image');
        
        const buffer = await response.arrayBuffer();
        const contentType = response.headers.get('content-type');
        
        if (contentType) res.setHeader('Content-Type', contentType);
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        res.send(Buffer.from(buffer));
    } catch (error) {
        console.error('Proxy Error:', error);
        res.status(500).json({ error: 'Proxy failed' });
    }
});

// ── Diagnostic: test if upload deps can load ──
router.get('/test-deps', async (req, res) => {
    const steps = {};
    try {
        // Step 1: load multer
        const t1 = Date.now();
        const multerMod = await import('multer');
        steps.multer = { ok: true, ms: Date.now() - t1, type: typeof (multerMod.default || multerMod) };
        
        // Step 2: load AWS SDK
        const t2 = Date.now();
        const awsMod = await import('@aws-sdk/client-s3');
        const aws = awsMod.default || awsMod;
        steps.aws = { ok: true, ms: Date.now() - t2, hasS3Client: !!aws.S3Client, hasPut: !!aws.PutObjectCommand };
        
        // Step 3: create S3 client
        const t3 = Date.now();
        const s3 = new aws.S3Client({
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId: process.env.ROTARY_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || 'MISSING',
                secretAccessKey: process.env.ROTARY_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || 'MISSING',
            },
            maxAttempts: 2,
        });
        steps.s3Client = { ok: true, ms: Date.now() - t3 };
        
        // Step 4: test small S3 put (1 byte)
        const t4 = Date.now();
        const bucket = process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';
        await s3.send(new aws.PutObjectCommand({
            Bucket: bucket,
            Key: `_test/ping-${Date.now()}.txt`,
            Body: Buffer.from('ok'),
            ContentType: 'text/plain',
        }));
        steps.s3Upload = { ok: true, ms: Date.now() - t4, bucket };
        
        // Step 5: check env vars
        steps.env = {
            AWS_REGION: process.env.AWS_REGION || 'NOT SET',
            AWS_BUCKET: process.env.AWS_BUCKET_NAME || 'NOT SET',
            HAS_ACCESS_KEY: !!(process.env.ROTARY_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID),
            HAS_SECRET_KEY: !!(process.env.ROTARY_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY),
        };
        
        res.json({ success: true, steps });
    } catch (error) {
        steps.error = { message: error.message, name: error.name, code: error.code || error.$metadata?.httpStatusCode };
        res.status(500).json({ success: false, steps });
    }
});

// ── GET /api/media/presigned-url — Generate direct upload URL ──
router.get('/presigned-url', authMiddleware, async (req, res) => {
    try {
        const { fileName, fileType, clubId } = req.query;
        if (!fileName || !fileType) return res.status(400).json({ error: 'Faltan parámetros' });

        const targetClubIdRaw = (req.user.role === 'administrator') ? (clubId || req.user.clubId) : req.user.clubId;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const targetClubId = (targetClubIdRaw && uuidRegex.test(targetClubIdRaw)) ? targetClubIdRaw : null;

        const fileTypeLocal = getMediaType(fileType, fileName);
        const folderStr = fileTypeLocal === 'image' ? 'images' : fileTypeLocal === 'video' ? 'videos' : 'documents';

        const key = `clubs/${targetClubId || 'global'}/${folderStr}/${Date.now()}-${fileName.replace(/\s+/g, '_')}`;
        const bucket = process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';

        const { s3, PutObjectCommand, getSignedUrl } = await getUploadDeps();
        const command = new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            ContentType: fileType
        });

        const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        const encodedKey = key.split('/').map(segment => encodeURIComponent(segment)).join('/');
        const fileUrl = `https://${bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${encodedKey}`;

        res.json({ uploadUrl, fileUrl, key, fileTypeLocal });
    } catch (error) {
        console.error('[Media] Presigned URL error:', error);
        res.status(500).json({ error: 'Error al generar URL de subida' });
    }
});

// ── POST /api/media/save — Save media record after direct S3 upload ──
router.post('/save', authMiddleware, async (req, res) => {
    try {
        const { clubId, fileName, fileUrl, s3Key, fileType, fileSize } = req.body;

        const targetClubIdRaw = (req.user.role === 'administrator') ? (clubId || req.user.clubId) : req.user.clubId;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const targetClubId = (targetClubIdRaw && uuidRegex.test(targetClubIdRaw)) ? targetClubIdRaw : null;

        const bucket = process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';
        const fileTypeLocal = getMediaType(fileType, fileName);

        // Subir estando dentro de una carpeta deja el archivo AHÍ, no en la
        // raíz: quien abrió «Logos» y pulsa «Subir Nuevo» espera que caiga en
        // Logos, no tener que moverlo después. Se comprueba que la carpeta sea
        // del mismo sitio; si no lo es se guarda en la raíz en vez de fallar
        // —la subida a S3 ya ocurrió y perder el registro sería peor—.
        await ensureMediaFolderSchema();
        const folderId = await resolveTargetFolder(req.body?.folderId, targetClubId);

        // Un HEIC ya está en S3 —el navegador lo subió con la URL prefirmada—,
        // así que acá se BAJA, se convierte y se sube el JPEG. Da una vuelta de
        // más, pero es lo que evita el tope de 4,5 MB del cuerpo de una función
        // en Vercel: una foto de iPhone pesa 2-5 MB y mandarla por el cuerpo
        // fallaría justo con las más grandes.
        let finalName = fileName, finalUrl = fileUrl, finalKey = s3Key, finalSize = fileSize;
        let conversion = null;
        let originalKey = null;

        if (isHeicFile({ filename: fileName, mimetype: fileType })) {
            try {
                const original = await fetchFromS3(bucket, s3Key);
                const converted = await toDisplayableImage({
                    buffer: original, filename: fileName, s3Key, contentType: fileType,
                });
                if (converted.converted) {
                    const { s3, PutObjectCommand } = await getUploadDeps();
                    await s3.send(new PutObjectCommand({
                        Bucket: bucket, Key: converted.s3Key,
                        Body: converted.buffer, ContentType: 'image/jpeg',
                    }));
                    finalName = converted.filename;
                    finalKey = converted.s3Key;
                    finalSize = converted.buffer.length;
                    finalUrl = publicUrlFor(bucket, converted.s3Key);
                    // El original SE CONSERVA (v4.741). Hasta v4.740 se borraba
                    // en cuanto el JPEG estaba arriba, y una conversión que
                    // salió mal se llevó por delante fotos irrecuperables. Su
                    // clave queda en `originalS3Key`, así que no es un objeto
                    // huérfano: al eliminar el archivo se borran los dos.
                    originalKey = s3Key;
                    conversion = { from: 'heic', to: 'jpeg' };
                } else {
                    conversion = { from: 'heic', to: null, error: converted.error };
                }
            } catch (err) {
                console.error('[Media] HEIC pipeline error:', err.message);
                conversion = { from: 'heic', to: null, error: err.message };
            }
        }

        const result = await db.query(
            `INSERT INTO "Media" (id, filename, url, type, size, bucket, region, "clubId", "s3Key", "folderId", "originalS3Key", "createdAt")
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW()) RETURNING *`,
            [finalName, finalUrl, fileTypeLocal, finalSize, bucket, process.env.AWS_REGION || 'us-east-1', targetClubId, finalKey, folderId, originalKey]
        );

        res.json({ ...result.rows[0], conversion });
    } catch (error) {
        console.error('[Media] Save error:', error);
        res.status(500).json({ error: 'Error al registrar en base de datos', details: error.message });
    }
});

router.post('/upload', authMiddleware, async (req, res) => {
    const { upload, s3, PutObjectCommand } = await getUploadDeps();
    upload.single('file')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No se seleccionó ningún archivo' });

        try {
            const targetClubIdRaw = (req.user.role === 'administrator') ? (req.query.clubId || req.body.clubId || req.user.clubId) : req.user.clubId;
            
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            const targetClubId = (targetClubIdRaw && uuidRegex.test(targetClubIdRaw)) ? targetClubIdRaw : null;

            const fileTypeLocal = getMediaType(req.file.mimetype, req.file.originalname);
            const folderStr = fileTypeLocal === 'image' ? 'images' : fileTypeLocal === 'video' ? 'videos' : 'documents';
            const baseName = `${Date.now()}-${req.file.originalname.replace(/\s+/g, '_')}`;
            const bucket = process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';

            // Acá el servidor SÍ tiene los bytes, así que el HEIC se convierte
            // antes de subir nada: se guarda una sola vez y no hay que retirar
            // un original. Es el mismo trato que en `/save`, por la regla de
            // que los dos caminos de subida tienen que dar el mismo resultado.
            const display = await toDisplayableImage({
                buffer: req.file.buffer,
                filename: baseName,
                s3Key: `clubs/${targetClubId || 'global'}/${folderStr}/${baseName}`,
                contentType: req.file.mimetype,
            });
            const s3Key = display.s3Key;

            try {
                await s3.send(new PutObjectCommand({
                    Bucket: bucket,
                    Key: s3Key,
                    Body: display.buffer,
                    ContentType: display.contentType,
                }));
            } catch (s3Error) {
                console.error('S3 Upload Error:', s3Error);
                return res.status(500).json({ error: 'Error al subir archivo a S3', details: s3Error.message });
            }

            const fileUrl = publicUrlFor(bucket, s3Key);

            try {
                // Resolve source tagging from upload context. Frontend can override
                // by sending explicit sourceType/sourceId; otherwise we infer from
                // the most specific entity in scope (clubId beats districtId beats
                // platform-wide).
                let sourceType = req.body.sourceType || null;
                let sourceId = req.body.sourceId || null;
                let sourceLabel = req.body.sourceLabel || null;
                if (!sourceType) {
                    if (targetClubId) {
                        sourceType = 'club';
                        sourceId = targetClubId;
                        try {
                            const c = await db.query('SELECT name FROM "Club" WHERE id = $1', [targetClubId]);
                            sourceLabel = c.rows[0]?.name || null;
                        } catch { /* ignore */ }
                    } else {
                        sourceType = 'platform';
                    }
                } else if (sourceType !== 'platform' && sourceId && !sourceLabel) {
                    // Caller gave us the source type+id but no label — try to resolve it.
                    try {
                        const tableMap = { club: 'Club', district: 'District', project: 'Project' };
                        const tbl = tableMap[sourceType];
                        if (tbl) {
                            const labelColumn = sourceType === 'project' ? 'title' : 'name';
                            const r = await db.query(`SELECT "${labelColumn}" AS label FROM "${tbl}" WHERE id = $1`, [sourceId]);
                            sourceLabel = r.rows[0]?.label || null;
                        }
                    } catch { /* ignore */ }
                }

                // Igual que en `/save`: hay DOS caminos de subida y los dos
                // tienen que respetar la carpeta abierta, o subir desde una
                // pantalla u otra daría resultados distintos.
                await ensureMediaFolderSchema();
                const folderId = await resolveTargetFolder(req.query.folderId || req.body.folderId, targetClubId);

                const result = await db.query(
                    `INSERT INTO "Media" (id, filename, url, type, size, bucket, region, "clubId", "s3Key", "sourceType", "sourceId", "sourceLabel", "folderId", "createdAt")
                     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()) RETURNING *`,
                    // El nombre y el tamaño son los del archivo GUARDADO, no los
                    // del que llegó: si se convirtió, la ficha diría «.heic» y
                    // el peso del original sobre un archivo que ya es un JPEG.
                    [display.converted ? jpegNameFor(req.file.originalname) : req.file.originalname,
                    fileUrl, fileTypeLocal, display.buffer.length, bucket, process.env.AWS_REGION || 'us-east-1', targetClubId, s3Key, sourceType, sourceId, sourceLabel, folderId]
                );
                res.json(result.rows[0]);
            } catch (dbError) {
                console.error('Database Media Error:', dbError);
                res.status(500).json({ error: 'Error al registrar en base de datos', details: dbError.message });
            }
        } catch (error) {
            console.error('General Media upload error:', error);
            res.status(500).json({ error: 'Error interno en el servidor de medios' });
        }
    });
});

// ── Auto-Crop Logo Upload ──────────────────────────────────────
// Receives image in memory, trims whitespace/transparent margins
// using sharp, then uploads the clean result to S3.
router.post('/upload-logo', authMiddleware, async (req, res) => {
    const { upload, s3, PutObjectCommand } = await getUploadDeps();
    const sharp = await getSharp();
    upload.single('file')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No se seleccionó ningún archivo' });

        try {
            const targetClubId = (req.user.role === 'administrator')
                ? (req.query.clubId || req.body.clubId || req.user.clubId)
                : req.user.clubId;
            const folder = req.query.folder || req.body.folder || 'logos';

            // Un logo puede llegar en HEIC igual que cualquier otra imagen —de
            // hecho es lo normal si alguien lo pasó por su iPhone—. sharp no
            // sabe decodificarlo, así que sin este paso el `trim` fallaba, se
            // subía el HEIC tal cual y el logo quedaba roto en el encabezado.
            let sourceBuffer = req.file.buffer;
            if (isHeicFile({ filename: req.file.originalname, mimetype: req.file.mimetype })) {
                try {
                    sourceBuffer = (await convertHeicToJpeg(req.file.buffer)).buffer;
                } catch (e) {
                    console.error('[Media] HEIC logo conversion failed:', e.message);
                }
            }

            let trimmedBuffer;
            let finalContentType = 'image/png';
            try {
                trimmedBuffer = await sharp(sourceBuffer)
                    .trim(30)
                    .png()
                    .toBuffer();
                console.log('✅ Logo auto-trimmed successfully via Sharp');
            } catch (trimError) {
                console.warn('⚠️ Auto-trim failed, uploading original image:', trimError.message);
                trimmedBuffer = sourceBuffer;
                finalContentType = req.file.mimetype;
            }

            const fileName = `${Date.now()}-${req.file.originalname.replace(/\s+/g, '_')}`;
            const s3Key = `clubs/${targetClubId}/${folder}/${fileName}`;
            const bucket = process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';

            await s3.send(new PutObjectCommand({
                Bucket: bucket,
                Key: s3Key,
                Body: trimmedBuffer,
                ContentType: finalContentType,
            }));

            const encodedKey = s3Key.split('/').map(segment => encodeURIComponent(segment)).join('/');
            const fileUrl = `https://${bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${encodedKey}`;

            const result = await db.query(
                `INSERT INTO "Media" (id, filename, url, type, size, bucket, region, "clubId", "s3Key", "createdAt")
                 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *`,
                [req.file.originalname, fileUrl, 'image', trimmedBuffer.length, bucket, process.env.AWS_REGION || 'us-east-1', targetClubId, s3Key]
            );

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Auto-crop logo upload error:', error);
            res.status(500).json({ error: 'Error al procesar y subir el logo' });
        }
    });
});

router.get('/folders', authMiddleware, async (req, res) => {
    if (req.user.role !== 'administrator') return res.status(403).json({ error: 'No autorizado' });
    try {
        const result = await db.query(
            `SELECT c.id, c.name, COUNT(m.id) as count FROM "Club" c LEFT JOIN "Media" m ON m."clubId" = c.id GROUP BY c.id, c.name`
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching folders' });
    }
});

router.get('/', authMiddleware, async (req, res) => {
    try {
        const { role, clubId: userClubId, districtId } = req.user;
        const { sourceType, sourceId, search, type } = req.query;

        const where = [];
        const params = [];
        let p = 1;

        // Role-based visibility (kept identical to previous behaviour).
        if (role === 'administrator') {
            // System Admin sees EVERYTHING across all clubs — no clause.
        } else if (role === 'district_admin') {
            const dId = districtId || userClubId;
            where.push(`("clubId" = $${p} OR "clubId" IN (SELECT id FROM "Club" WHERE "districtId" = $${p + 1}) OR "clubId" IS NULL)`);
            params.push(userClubId, dId);
            p += 2;
        } else if (userClubId) {
            where.push(`"clubId" = $${p}`);
            params.push(userClubId);
            p += 1;
        } else {
            where.push(`"clubId" IS NULL`);
        }

        // New source-tagging filters (v4.339+). sourceType drives the category
        // chip. v4.342 expanded the vocabulary: 'club' plus its sub-types
        // (association, exchange_program, event, conference, project_fair,
        // foundation) all live in the Club table — they differ only by
        // Club.category. For any of these we narrow Media to those whose
        // owner club has the matching category.
        const CLUB_SUBCATEGORIES = ['club', 'association', 'exchange_program', 'event', 'conference', 'project_fair', 'foundation'];
        if (sourceType) {
            if (CLUB_SUBCATEGORIES.includes(sourceType)) {
                where.push(`(
                    EXISTS (
                        SELECT 1 FROM "Club" c
                        WHERE c."category" = $${p}
                          AND (c."id" = "Media"."sourceId"
                               OR c."id" = "Media"."clubId"
                               OR c."id" = SPLIT_PART("Media"."s3Key", '/', 2))
                    )
                )`);
                params.push(sourceType);
                p += 1;
            } else {
                where.push(`"sourceType" = $${p}`);
                params.push(sourceType);
                p += 1;
            }
        }
        if (sourceId) {
            // Match new sourceId, OR legacy clubId, OR the second segment of s3Key
            // ("clubs/<uuid>/..."). Three-way fallback covers rows in different
            // stages of the v4.339→v4.341 backfill.
            where.push(`("sourceId" = $${p} OR "clubId" = $${p} OR SPLIT_PART("s3Key", '/', 2) = $${p})`);
            params.push(sourceId);
            p += 1;
        }
        if (type) {
            where.push(`"type" = $${p}`);
            params.push(type);
            p += 1;
        }
        // Carpeta (v4.738). Tres estados y los tres significan cosas distintas:
        // sin el parámetro no se filtra —es lo que hacían todos los
        // consumidores hasta ahora y lo que tienen que seguir haciendo—;
        // `root` es la raíz del sitio, que NO es lo mismo que «todas»; y un id
        // es esa carpeta. Un solo parámetro con dos sentidos («vacío = raíz»)
        // dejaría al selector de imágenes mostrando sólo lo suelto.
        const { folderId } = req.query;
        if (folderId === 'root') {
            where.push(`"folderId" IS NULL`);
        } else if (folderId) {
            where.push(`"folderId" = $${p}`);
            params.push(folderId);
            p += 1;
        }
        if (search) {
            where.push(`("filename" ILIKE $${p} OR "sourceLabel" ILIKE $${p})`);
            params.push(`%${search}%`);
            p += 1;
        }

        let query = 'SELECT * FROM "Media"';
        if (where.length) query += ' WHERE ' + where.join(' AND ');
        query += ' ORDER BY "createdAt" DESC';

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Fetch media error:', error);
        res.status(500).json({ error: 'Error fetching media library' });
    }
});

// GET /api/media/sources?type=club
// Returns the universe of "destinations" the caller can pick to drill into:
// every entity from the corresponding table (Club / District / Project) PLUS
// the image count for each. Entities with zero images are still returned so
// the user can see the full structure of the platform and tag new uploads
// to any of them.
//
// v4.342: Club rows are sub-typed by Club.category (club / association /
// exchange_program / event / conference / project_fair / foundation). When
// `type` matches one of those sub-types we filter Club WHERE category=type.
router.get('/sources', authMiddleware, async (req, res) => {
    try {
        const { role, clubId: userClubId, districtId } = req.user;
        const requestedType = req.query.type || null;

        // Sub-types of Club. They all live in the Club table; what
        // differentiates them is the `category` column.
        const CLUB_SUBCATEGORIES = ['club', 'association', 'exchange_program', 'event', 'conference', 'project_fair', 'foundation'];
        const types = requestedType
            ? [requestedType]
            : [...CLUB_SUBCATEGORIES, 'district', 'project', 'platform'];
        const results = [];

        // ----- CLUB SUB-CATEGORIES -----
        for (const subcat of CLUB_SUBCATEGORIES) {
            if (!types.includes(subcat)) continue;
            // The image-count fallback still queries by id (sourceId / clubId /
            // s3Key path) — independent of how the Club is sub-categorised.
            const countSubquery = `(
                SELECT COUNT(*)::int FROM "Media" m
                WHERE (
                    (m."sourceType" = 'club' AND m."sourceId" = c."id")
                    OR (m."clubId" = c."id")
                    OR SPLIT_PART(m."s3Key", '/', 2) = c."id"
                )
            ) AS "imageCount"`;
            let cQ, cParams;
            if (role === 'administrator') {
                cQ = `SELECT c."id", c."name", ${countSubquery}
                      FROM "Club" c
                      WHERE c."category" = $1
                      ORDER BY c."name" ASC`;
                cParams = [subcat];
            } else if (role === 'district_admin') {
                const dId = districtId || userClubId;
                cQ = `SELECT c."id", c."name", ${countSubquery}
                      FROM "Club" c
                      WHERE c."category" = $1
                        AND (c."id" = $2 OR c."districtId" = $3)
                      ORDER BY c."name" ASC`;
                cParams = [subcat, userClubId, dId];
            } else if (userClubId) {
                cQ = `SELECT c."id", c."name", ${countSubquery}
                      FROM "Club" c
                      WHERE c."category" = $1 AND c."id" = $2`;
                cParams = [subcat, userClubId];
            } else {
                cQ = null;
            }
            if (cQ) {
                const r = await db.query(cQ, cParams);
                for (const row of r.rows) {
                    results.push({ sourceType: subcat, sourceId: row.id, sourceLabel: row.name || 'Sin nombre', imageCount: row.imageCount });
                }
            }
        }

        // ----- DISTRICTS -----
        if (types.includes('district')) {
            const dQ = `SELECT d."id", d."name",
                          (SELECT COUNT(*)::int FROM "Media" m
                           WHERE m."sourceType" = 'district' AND m."sourceId" = d."id") AS "imageCount"
                        FROM "District" d ORDER BY d."name" ASC`;
            const r = await db.query(dQ);
            for (const row of r.rows) {
                results.push({ sourceType: 'district', sourceId: row.id, sourceLabel: row.name || 'Sin nombre', imageCount: row.imageCount });
            }
        }

        // ----- PROJECTS (uses `title`, not `name`) -----
        if (types.includes('project')) {
            const pQ = `SELECT p."id", p."title",
                          (SELECT COUNT(*)::int FROM "Media" m
                           WHERE m."sourceType" = 'project' AND m."sourceId" = p."id") AS "imageCount"
                        FROM "Project" p ORDER BY p."title" ASC`;
            const r = await db.query(pQ);
            for (const row of r.rows) {
                results.push({ sourceType: 'project', sourceId: row.id, sourceLabel: row.title || 'Sin título', imageCount: row.imageCount });
            }
        }

        // ----- PLATFORM (synthetic single entry) -----
        // Solo las que NO pueden atribuirse a ningún club (path 'global' o sin
        // segundo segmento UUID, y sin clubId ni sourceId hacia un club real).
        if (types.includes('platform')) {
            const pfQ = `SELECT COUNT(*)::int AS c FROM "Media" m
                         WHERE m."sourceType" = 'platform'
                           AND m."clubId" IS NULL
                           AND NOT EXISTS (
                               SELECT 1 FROM "Club" c
                               WHERE c."id" = SPLIT_PART(m."s3Key", '/', 2)
                           )`;
            const r = await db.query(pfQ);
            results.push({ sourceType: 'platform', sourceId: null, sourceLabel: 'Plataforma', imageCount: r.rows[0]?.c || 0 });
        }

        res.json(results);
    } catch (error) {
        console.error('Fetch media sources error:', error);
        res.status(500).json({ error: 'Error fetching media sources' });
    }
});

router.get('/debug-me', authMiddleware, async (req, res) => {
    try {
        const { role, clubId, districtId, email } = req.user;
        const mediaCount = await db.query('SELECT COUNT(*) FROM \"Media\" WHERE \"clubId\" = $1', [clubId]);
        const club = await db.query('SELECT name, domain FROM \"Club\" WHERE id = $1', [clubId]);
        
        res.json({
            user: { role, clubId, districtId, email },
            club: club.rows[0],
            mediaInDb: mediaCount.rows[0].count,
            paramsUsed: [clubId]
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── Acciones sobre VARIOS archivos ──────────────────────────────────────────
//
// Van por su propia ruta y no repitiendo la de a uno desde el navegador: con
// cien archivos serían cien peticiones, cien conexiones a la base y cien
// oportunidades de que una falle a medias sin que nadie sepa cuáles quedaron.

/**
 * Las filas de `Media` que el usuario puede tocar, de una lista de ids.
 *
 * El aislamiento va en el WHERE, no en la pantalla: quien manda ids ajenos
 * recibe menos filas de las que pidió, en vez de operar sobre lo ajeno. La
 * diferencia entre lo pedido y lo devuelto es lo que se le informa.
 */
const ownedMedia = async (ids, user) => {
    const unique = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean))];
    if (!unique.length) return [];
    const params = [unique];
    let where = 'id = ANY($1::text[])';
    if (user.role !== 'administrator') {
        where += ' AND "clubId" IS NOT DISTINCT FROM $2';
        params.push(user.clubId || null);
    }
    const { rows } = await db.query(`SELECT * FROM "Media" WHERE ${where}`, params);
    return rows;
};

/** Cuánto puede tardar un lote antes de devolver lo hecho y lo que falta. */
const BULK_TIME_BUDGET_MS = 90_000;

// POST /api/media/bulk-convert — convierte a JPEG los HEIC de una selección.
//
// Tiene PRESUPUESTO DE TIEMPO, igual que el barrido del Creador de Reels: la
// función corta a los 120 s (`vercel.json`) y cada foto tarda entre 0,3 y 1 s,
// así que una selección grande no entra en una sola petición. Se convierte lo
// que quepa y se devuelve lo que falta, para que la pantalla siga pidiendo y
// pueda mostrar el avance. Cortar en silencio dejaría al usuario creyendo que
// terminó.
router.post('/bulk-convert', authMiddleware, async (req, res) => {
    try {
        const items = await ownedMedia(req.body?.mediaIds, req.user);
        const targets = items.filter(m => isHeicFile({ filename: m.filename, mimetype: null }));

        const started = Date.now();
        const converted = [];
        const failed = [];
        const pending = [];

        for (const item of targets) {
            if (Date.now() - started > BULK_TIME_BUDGET_MS) { pending.push(item.id); continue; }
            if (!item.s3Key || !item.bucket) {
                failed.push({ id: item.id, filename: item.filename, error: 'No se sabe dónde está guardado.' });
                continue;
            }
            try {
                const original = await fetchFromS3(item.bucket, item.s3Key);
                const { buffer } = await convertHeicToJpeg(original);
                const newKey = jpegKeyFor(item.s3Key);

                const { s3, PutObjectCommand } = await getUploadDeps();
                await s3.send(new PutObjectCommand({
                    Bucket: item.bucket, Key: newKey, Body: buffer, ContentType: 'image/jpeg',
                }));
                // El original SE CONSERVA y su clave queda anotada, igual que en
                // la conversión de a una. `COALESCE` para no pisarla si el
                // archivo ya se había convertido antes.
                await db.query(
                    `UPDATE "Media" SET filename = $1, url = $2, "s3Key" = $3, size = $4, type = 'image',
                            "originalS3Key" = COALESCE("originalS3Key", $6)
                      WHERE id = $5`,
                    [jpegNameFor(item.filename), publicUrlFor(item.bucket, newKey), newKey, buffer.length, item.id, item.s3Key]
                );
                converted.push(item.id);
            } catch (err) {
                console.error('[Media] bulk convert failed for', item.id, err.message);
                // Un fallo no detiene el lote: los demás archivos no tienen la
                // culpa, y el que falló se informa con su nombre y su motivo.
                failed.push({ id: item.id, filename: item.filename, error: err.message });
            }
        }

        res.json({
            converted: converted.length,
            failed,
            pending,
            // Lo que se pidió y no era HEIC no es un error: se cuenta aparte
            // para que el resumen cuadre con lo que el usuario seleccionó.
            skipped: items.length - targets.length,
        });
    } catch (error) {
        console.error('[Media] bulk convert error:', error);
        res.status(500).json({ error: 'No se pudieron convertir los archivos', details: error.message });
    }
});

// POST /api/media/bulk-delete — elimina varios archivos.
router.post('/bulk-delete', authMiddleware, async (req, res) => {
    try {
        const asked = [...new Set((Array.isArray(req.body?.mediaIds) ? req.body.mediaIds : []).filter(Boolean))];
        if (!asked.length) return res.status(400).json({ error: 'No se indicó ningún archivo.' });

        const items = await ownedMedia(asked, req.user);
        if (!items.length) return res.status(404).json({ error: 'No se encontró ninguno de esos archivos.' });

        // Primero S3 y después la base, igual que el borrado de a uno. Al revés
        // —fila borrada y objeto en pie— dejaría archivos que nadie puede ver ni
        // volver a borrar desde el panel.
        const { s3, DeleteObjectsCommand } = await getUploadDeps();
        const byBucket = new Map();
        for (const m of items) {
            if (!m.bucket) continue;
            if (!byBucket.has(m.bucket)) byBucket.set(m.bucket, []);
            // El archivo y, si lo hubo, el original conservado al convertirlo.
            for (const key of [m.s3Key, m.originalS3Key].filter(Boolean)) {
                byBucket.get(m.bucket).push({ Key: key });
            }
        }
        for (const [bucket, objects] of byBucket) {
            // `DeleteObjects` acepta 1000 por llamada: se manda por lotes en vez
            // de una petición por archivo.
            for (let i = 0; i < objects.length; i += 1000) {
                try {
                    await s3.send(new DeleteObjectsCommand({
                        Bucket: bucket, Delete: { Objects: objects.slice(i, i + 1000), Quiet: true },
                    }));
                } catch (e) {
                    // Que no se pueda borrar de S3 no impide quitarlo de la
                    // Librería: el usuario pidió que desaparezca de su panel.
                    console.error('[Media] S3 bulk delete error:', e.message);
                }
            }
        }

        const ids = items.map(m => m.id);
        await db.query('DELETE FROM "Media" WHERE id = ANY($1::text[])', [ids]);

        res.json({
            deleted: ids.length,
            // Lo pedido que no apareció es de otro sitio o ya no existe. Se
            // informa en vez de callarlo: un número que no cuadra con lo que se
            // seleccionó necesita explicación.
            notFound: asked.length - ids.length,
        });
    } catch (error) {
        console.error('[Media] bulk delete error:', error);
        res.status(500).json({ error: 'No se pudieron eliminar los archivos', details: error.message });
    }
});

// POST /api/media/:id/convert — arregla un HEIC que YA está en la Librería.
//
// La conversión al subir sólo alcanza a lo que venga de ahora en adelante, y el
// defecto que se reportó es sobre archivos que ya están cargados. Sin esta vía
// habría que borrarlos y volver a subirlos uno por uno.
router.post('/:id/convert', authMiddleware, async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM "Media" WHERE id = $1', [req.params.id]);
        const item = rows[0];
        if (!item) return res.status(404).json({ error: 'Archivo no encontrado' });
        if (req.user.role !== 'administrator' && item.clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'No autorizado' });
        }
        if (!isHeicFile({ filename: item.filename, mimetype: null })) {
            return res.status(400).json({ error: 'Este archivo no es HEIC: no hay nada que convertir.' });
        }
        if (!item.s3Key || !item.bucket) {
            return res.status(400).json({ error: 'No se sabe dónde está guardado el archivo original.' });
        }

        const original = await fetchFromS3(item.bucket, item.s3Key);
        const { buffer } = await convertHeicToJpeg(original);

        const newKey = jpegKeyFor(item.s3Key);
        const { s3, PutObjectCommand } = await getUploadDeps();
        await s3.send(new PutObjectCommand({
            Bucket: item.bucket, Key: newKey, Body: buffer, ContentType: 'image/jpeg',
        }));

        // El original SE CONSERVA y su clave queda anotada. `COALESCE` para no
        // pisarla si el archivo ya se había convertido antes: la primera es la
        // que apunta al que subió el usuario.
        const updated = await db.query(
            `UPDATE "Media"
                SET filename = $1, url = $2, "s3Key" = $3, size = $4, type = 'image',
                    "originalS3Key" = COALESCE("originalS3Key", $6)
              WHERE id = $5 RETURNING *`,
            [jpegNameFor(item.filename), publicUrlFor(item.bucket, newKey), newKey, buffer.length, item.id, item.s3Key]
        );

        res.json(updated.rows[0]);
    } catch (error) {
        console.error('[Media] convert error:', error);
        // El motivo se propaga TEXTUAL: «no se pudo convertir» a secas obliga a
        // reproducir el fallo a ciegas.
        res.status(500).json({ error: 'No se pudo convertir el archivo', details: error.message });
    }
});

router.delete('/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        const media = await db.query('SELECT * FROM "Media" WHERE id = $1', [id]);
        if (!media.rows[0]) return res.status(404).json({ error: 'Archivo no encontrado' });
        if (req.user.role !== 'administrator' && media.rows[0].clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'No autorizado' });
        }
        if (media.rows[0].s3Key && media.rows[0].bucket) {
            try {
                const { s3, DeleteObjectCommand } = await getUploadDeps();
                // Se borran los DOS: el archivo y, si lo hubo, el original que
                // se conservó al convertirlo. Dejar el original sería un objeto
                // que nadie puede ver ni volver a borrar desde el panel.
                for (const key of [media.rows[0].s3Key, media.rows[0].originalS3Key].filter(Boolean)) {
                    await s3.send(new DeleteObjectCommand({ Bucket: media.rows[0].bucket, Key: key }));
                }
            } catch (s3Err) {
                console.error('S3 delete error:', s3Err);
            }
        }
        await db.query('DELETE FROM "Media" WHERE id = $1', [id]);
        res.json({ message: 'Archivo eliminado correctamente' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar el archivo' });
    }
});

// GET /api/media/proxy — proxy same-origin para canvas (evita CORS)
router.get('/proxy', authMiddleware, async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'URL requerida' });
    try {
        const response = await fetch(url);
        if (!response.ok) return res.status(502).json({ error: 'No se pudo obtener la imagen' });
        const buffer = Buffer.from(await response.arrayBuffer());
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=3600');
        res.set('Access-Control-Allow-Origin', '*');
        res.send(buffer);
    } catch (err) {
        console.error('Image proxy error:', err);
        res.status(500).json({ error: 'Error al obtener la imagen' });
    }
});


export default router;
