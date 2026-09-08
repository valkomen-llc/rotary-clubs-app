/**
 * La vía PÚBLICA a un archivo de la Biblioteca de Medios.
 *
 *      dominio propio  →  /api/public/media/:id/:nombre  →  ¿es público?  →  S3
 *
 * Es la dirección que se comparte por WhatsApp, se imprime en un pendón o se
 * pone detrás de una redirección: no lleva Unicode que ningún cliente pueda
 * normalizar, no caduca, no depende de una sesión y sobrevive a que el objeto
 * se mueva dentro del bucket — el id manda, la clave se resuelve al leer.
 *
 * ⚠️ NO SE PROXIAN LOS BYTES: se firma y se REDIRIGE. La Carta del Gobernador
 * pesa 15,2 MB y la API corre en funciones serverless; pasar el archivo por la
 * función gastaría su presupuesto entero y rompería el `Range` que Safari usa
 * para dibujar un PDF grande por partes. Con el 302 el archivo va del bucket
 * al teléfono directamente, con sus `Accept-Ranges` intactos.
 *
 * ⚠️ Y LA FIRMA NO SE GUARDA EN NINGUNA PARTE. Es la distinción que pedía el
 * encargo: lo que se persiste en el CMS y en la redirección es NUESTRA
 * dirección, estable; la firma se genera al vuelo en cada visita y vive cinco
 * minutos, que es lo que tarda un navegador en empezar la descarga. Así el
 * enlace repartido sigue sirviendo mañana y dentro de un mes, y el bucket
 * puede cerrarse sin romper un solo enlace.
 */
import db from '../lib/db.js';
import {
    servability, contentDispositionFor, contentTypeFor, canonicalObjectName,
} from '../lib/publicMedia.js';

/** Cuánto vive la firma. Corta a propósito: el enlace estable es el nuestro. */
const FIRMA_SEGUNDOS = 300;

/** El bucket de la plataforma. */
const bucketPorDefecto = () => process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';

/**
 * Un archivo de la Biblioteca, por id.
 *
 * Se consulta con SQL y columnas NOMBRADAS, no con `findMany` de Prisma: esa
 * tabla se lee sin `select` en media plataforma y una columna declarada y
 * todavía inexistente dejaría en 500 a todos sus consumidores (la regla de
 * `logo_intl`, v4.699). Acá el precio de repetirlo sería tumbar una página
 * pública.
 */
async function mediaById(id) {
    const { rows } = await db.query(
        `SELECT id, filename, url, type, bucket, region, "s3Key"
           FROM "Media" WHERE id = $1 LIMIT 1`,
        [id]
    );
    return rows[0] || null;
}

/**
 * GET /api/public/media/:id            → el archivo
 * GET /api/public/media/:id/:nombre    → lo mismo, con el nombre a la vista
 *
 * `?descargar=1` fuerza `attachment`. Sin eso, un PDF o una imagen se abren
 * DENTRO del navegador, que es lo que espera quien pulsa el enlace; lo que no
 * se puede dibujar se baja, en vez de dejar una pestaña en blanco.
 */
export const servePublicMedia = async (req, res) => {
    const { id } = req.params;
    try {
        const row = await mediaById(id);
        const veredicto = servability(row);

        if (!veredicto.ok) {
            // Un archivo privado responde 404, NO 403. Confirmar que existe es
            // la mitad de lo que hace falta para ir a buscarlo, y con 403 este
            // endpoint sería además un censo de los documentos privados de
            // todos los sitios: probar ids hasta que uno conteste distinto.
            return res.status(404).json({
                error: 'Archivo no disponible',
                detail: veredicto.reason,
            });
        }

        const bucket = row.bucket || bucketPorDefecto();
        // ⚠️ `Media` NO tiene columna de MIME: sus tipos son `image`/`video`/
        // `document`, que no sirven como `Content-Type`. Se deduce de la
        // extensión. Leer un `row.mimeType` que no existe habría dado
        // `undefined` en silencio y todo se habría servido como
        // `application/octet-stream` — o sea, todo PDF se descargaría en vez
        // de abrirse (la trampa del SELECT corto, v4.886).
        const contentType = contentTypeFor({ filename: row.filename, key: veredicto.key });
        const disposition = contentDispositionFor(row.filename, {
            download: req.query.descargar === '1' || req.query.download === '1',
            contentType,
        });

        // El 302 NO se cachea: apunta a una firma que caduca, y un `Location`
        // guardado por el navegador llevaría a un 403 dentro de cinco minutos.
        // Lo que sí puede cachear el cliente es el archivo, y de eso se ocupan
        // las cabeceras que devuelve S3.
        res.setHeader('Cache-Control', 'no-store');

        let destino = null;
        try {
            const { getUploadDeps } = await import('../routes/media.js');
            const { s3, GetObjectCommand, getSignedUrl } = await getUploadDeps();
            destino = await getSignedUrl(
                s3,
                new GetObjectCommand({
                    Bucket: bucket,
                    Key: veredicto.key,
                    // El tipo y el nombre se imponen ACÁ: así el archivo se
                    // sirve bien aunque el objeto se haya subido en su día sin
                    // metadata, que es el caso de casi todo lo anterior a esto.
                    ResponseContentType: contentType,
                    ResponseContentDisposition: disposition,
                }),
                { expiresIn: FIRMA_SEGUNDOS }
            );
        } catch (e) {
            // Sin credenciales no se puede firmar. Degradar es lo correcto: el
            // objeto puede seguir siendo legible por la política del bucket, y
            // dejar sin abrir un PDF público por no poder firmarlo sería
            // cambiar un problema de configuración por uno de servicio.
            //
            // La clave se codifica segmento a segmento **desde los bytes
            // guardados**, sin normalizar: normalizarla acá reintroduciría
            // exactamente el `AccessDenied` que abrió este módulo.
            console.warn('[publicMedia] sin firma para', id, '—', e.message);
            const encoded = veredicto.key.split('/').map(encodeURIComponent).join('/');
            destino = `https://${bucket}.s3.${row.region || process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${encoded}`;
        }

        return res.redirect(302, destino);
    } catch (error) {
        console.error('[publicMedia]', error);
        // El motivo va TEXTUAL: un «no se pudo» a secas no distingue una base
        // caída de un archivo que no está, y son dos arreglos distintos.
        return res.status(500).json({
            error: 'No se pudo servir el archivo',
            detail: error.message,
        });
    }
};

/**
 * HEAD sobre la misma dirección.
 *
 * Un HEAD que redirige no le dice a nadie qué hay al otro lado, así que acá se
 * contesta con el tipo y el nombre ya resueltos: es lo que consulta un
 * comprobador de enlaces, y lo que hace verificable «responde PDF» sin
 * descargar 15 MB.
 */
export const headPublicMedia = async (req, res) => {
    try {
        const row = await mediaById(req.params.id);
        const veredicto = servability(row);
        if (!veredicto.ok) return res.status(404).end();

        const contentType = contentTypeFor({ filename: row.filename, key: veredicto.key });
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', contentDispositionFor(row.filename, { contentType }));
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).end();
    } catch (error) {
        console.error('[publicMedia:head]', error);
        return res.status(500).end();
    }
};

export default { servePublicMedia, headPublicMedia, canonicalObjectName };
