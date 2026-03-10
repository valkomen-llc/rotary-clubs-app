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

// In-memory multer for image processing (auto-crop) before S3 upload
export const uploadMemory = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype || extname) return cb(null, true);
        cb(new Error("Error: Solo se permiten imágenes (jpg, png, webp)."));
    },
    limits: { fileSize: 5 * 1024 * 1024 }
});

export default { s3, upload, uploadMemory };
