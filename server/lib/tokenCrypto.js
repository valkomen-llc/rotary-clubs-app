/**
 * Token encryption for social media access tokens.
 *
 * Algorithm: AES-256-GCM (authenticated encryption). Each ciphertext includes
 * a fresh random IV and a 16-byte auth tag, so tampering is detected at decrypt
 * time.
 *
 * Storage format (string, base64-segments separated by ':'):
 *
 *     v1:<iv_b64>:<authTag_b64>:<ciphertext_b64>
 *
 * The `v1` prefix lets us migrate to v2/v3 later (key rotation, different
 * algorithm) without breaking already-stored values. A token without the prefix
 * is treated as a legacy plaintext (only happens for rows written before this
 * module was introduced).
 *
 * Key: TOKEN_ENCRYPTION_KEY must be 64 hex chars (= 32 bytes). Generate via
 *
 *     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * and set it as a Vercel environment variable. NEVER commit it.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;          // GCM standard
const AUTH_TAG_LENGTH = 16;
const VERSION_PREFIX = 'v1:';

const getKey = () => {
    const hex = process.env.TOKEN_ENCRYPTION_KEY;
    if (!hex) {
        throw new Error('TOKEN_ENCRYPTION_KEY no configurada. Generar con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    }
    if (hex.length !== 64) {
        throw new Error(`TOKEN_ENCRYPTION_KEY debe tener 64 caracteres hex (32 bytes); recibida ${hex.length}.`);
    }
    return Buffer.from(hex, 'hex');
};

export const encryptToken = (plaintext) => {
    if (typeof plaintext !== 'string' || plaintext.length === 0) {
        throw new Error('encryptToken: plaintext debe ser un string no vacío');
    }
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${VERSION_PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
};

export const decryptToken = (stored) => {
    if (typeof stored !== 'string' || stored.length === 0) {
        throw new Error('decryptToken: valor almacenado vacío');
    }
    if (!stored.startsWith(VERSION_PREFIX)) {
        // Legacy plaintext (pre-encryption). Return as-is and let the caller decide
        // whether to re-encrypt on next write.
        return stored;
    }
    const parts = stored.slice(VERSION_PREFIX.length).split(':');
    if (parts.length !== 3) {
        throw new Error(`decryptToken: formato inválido (esperaba 3 segmentos, encontró ${parts.length})`);
    }
    const [ivB64, tagB64, ctB64] = parts;
    const key = getKey();
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const ciphertext = Buffer.from(ctB64, 'base64');
    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
        throw new Error('decryptToken: IV o auth tag de tamaño incorrecto');
    }
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
};

// Helper for the controller: returns { value, version } so callers can know if a
// stored token is legacy (and trigger re-encryption on next refresh).
export const isLegacyToken = (stored) => typeof stored === 'string' && !stored.startsWith(VERSION_PREFIX);
