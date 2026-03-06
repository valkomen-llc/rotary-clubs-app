const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');

const s3 = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.AWS_BUCKET_NAME || 'rotary-platform-assets',
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
            cb(null, fullPath);
        }
    }),
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp|pdf|doc|docx/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error("Error: File upload only supports the following filetypes - " + filetypes));
    },
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

module.exports = { s3, upload };
