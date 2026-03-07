const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');

console.log(`Initializing S3 for bucket: ${process.env.AWS_BUCKET_NAME} in region: ${process.env.AWS_REGION}`);

const s3 = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.ROTARY_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.ROTARY_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
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
            // Priority for clubId:
            // 1. Explicitly passed in query (for superadmin managing another club)
            // 2. Explicitly passed in body (though body might not be parsed yet)
            // 3. User's own clubId from token
            const clubId = req.query.clubId || req.body.clubId || req.user?.clubId || 'global';

            // Priority for folder:
            // 1. Query param
            // 2. Body param
            const folder = req.query.folder || req.body.folder || 'images';

            const fileName = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;

            // Path structure: clubs/{club_id}/{folder}/{filename}
            const fullPath = `clubs/${clubId}/${folder}/${fileName}`;
            console.log(`[S3 Upload] Key: ${fullPath} (User Club: ${req.user?.clubId})`);
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
