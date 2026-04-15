import multer from 'multer';
import multerS3 from 'multer-s3';
import pkg from '@aws-sdk/client-s3';
const { S3Client, GetObjectCommand } = pkg;
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import path from 'path';

console.log(`Initializing S3 for bucket: ${process.env.AWS_BUCKET_NAME} in region: ${process.env.AWS_REGION}`);

export const s3 = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.ROTARY_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.ROTARY_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
    },
});

export const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.AWS_BUCKET_NAME || 'rotary-platform-assets',
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: function (req, file, cb) {
            cb(null, { fieldName: file.fieldname });
        },
        key: function (req, file, cb) {
            // Priority for clubId:
            const clubId = req.query.clubId || req.body.clubId || req.user?.clubId || 'global';
            const folder = req.query.folder || req.body.folder || 'images';
            const fileName = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;

            // Path structure: clubs/{club_id}/{folder}/{filename}
            const fullPath = `clubs/${clubId}/${folder}/${fileName}`;
            cb(null, fullPath);
        }
    }),
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp|svg|pdf|doc|docx/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

        if (mimetype || extname) {
            return cb(null, true);
        }
        cb(new Error("Error: El formato de archivo no es compatible."));
    },
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

export const uploadMemory = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp|pdf|doc|docx|csv|xlsx|xls/;
        const mimetype = filetypes.test(file.mimetype) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('application/') || file.mimetype.startsWith('video/');
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype || extname) return cb(null, true);
        cb(new Error("Error: Archivo no admitido (Formatos permitidos: imágenes, PDF, doc, videos pequeños)."));
    },
    limits: { fileSize: 15 * 1024 * 1024 }
});

export const uploadDocuments = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.AWS_BUCKET_NAME || 'rotary-platform-assets',
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: function (req, file, cb) {
            cb(null, { fieldName: file.fieldname });
        },
        key: function (req, file, cb) {
            const clubId = req.query.clubId || req.body.clubId || req.user?.clubId || 'global';
            const fileName = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
            cb(null, `clubs/${clubId}/documents/${fileName}`);
        }
    }),
    fileFilter: (req, file, cb) => {
        const filetypes = /pdf|doc|docx|txt|rtf|md|csv|xlsx|xls/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetypes = /application\/pdf|application\/msword|application\/vnd|text\/|application\/rtf/;
        const mimetype = mimetypes.test(file.mimetype);
        if (mimetype || extname) return cb(null, true);
        cb(new Error("Error: Formato no admitido. Acepta PDF, Word, TXT, CSV, Excel."));
    },
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// WA Media for CRM (Images, Videos, Documents, Audios)
export const uploadWAMedia = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.AWS_BUCKET_NAME || 'rotary-platform-assets',
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: function (req, file, cb) {
            cb(null, { fieldName: file.fieldname });
        },
        key: function (req, file, cb) {
            const clubId = req.query.clubId || req.body.clubId || req.user?.clubId || 'global';
            const fileName = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
            cb(null, `clubs/${clubId}/wa-media/${fileName}`);
        }
    }),
    fileFilter: (req, file, cb) => {
        // Allow all reasonably typical formats for WhatsApp Media
        const allowedExtensions = /jpeg|jpg|png|webp|webp|mp4|avi|mov|mp3|ogg|wav|pdf|doc|docx|txt|xls|xlsx|csv/;
        const ext = path.extname(file.originalname).toLowerCase();
        
        if (allowedExtensions.test(ext) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/') || file.mimetype.startsWith('application/')) {
            return cb(null, true);
        }
        cb(new Error("Error: Formato multimedia no admitido."));
    },
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

export default { s3, upload, uploadMemory, uploadDocuments, uploadWAMedia };
