const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');

console.log(`Initializing S3 for bucket: ${process.env.AWS_BUCKET_NAME} in region: ${process.env.AWS_REGION}`);

const s3 = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.ROTARY_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.ROTARY_AWS_SECRET_ACCESS_KEY,
    },
});

const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.AWS_BUCKET_NAME || 'rotary-platform-assets',
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: function (req, file, cb) {
            cb(null, { fieldName: file.fieldname });
        },
        key: function (req, file, cb) {
            // Get clubId from user session (req.user is populated by authMiddleware)
            const clubId = req.user?.clubId || 'global';
            const folder = req.body.folder || 'images';
            const fileName = `${Date.now()}-${file.originalname}`;

            // Path structure: clubs/{club_id}/{folder}/{filename}
            const fullPath = `clubs/${clubId}/${folder}/${fileName}`;
            console.log(`Uploading to S3: ${fullPath}`);
            cb(null, fullPath);
        }
    }),
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp|svg|pdf|doc|docx/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

        console.log(`Filtering file: ${file.originalname} (${file.mimetype}) - Allowed: ${mimetype && extname}`);

        if (mimetype || extname) {
            return cb(null, true);
        }
        cb(new Error("Error: El formato de archivo no es compatible. Use JPG, PNG, WEBP o SVG."));
    },
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

module.exports = { s3, upload };
