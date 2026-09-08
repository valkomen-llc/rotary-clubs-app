// El descifrado de tokens, sustituido: la prueba no necesita una llave real y
// no debe depender de `TOKEN_ENCRYPTION_KEY` estando o no en el entorno.
export const encryptToken = (t) => `v1:${t}`;
export const decryptToken = (stored) => String(stored || '').replace(/^v1:/, '');
export const isLegacyToken = (stored) => typeof stored === 'string' && !stored.startsWith('v1:');
export default { encryptToken, decryptToken, isLegacyToken };
