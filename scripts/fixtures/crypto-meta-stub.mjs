// Cifrado sustituido: sólo hace visible en la prueba QUÉ se guardó cifrado.
// El prefijo `enc:` es lo que permite comprobar que ningún token se escribe
// en claro sin tener que conocer la llave real.
export const encryptToken = (t) => `enc:${t}`;
export const decryptToken = (t) => String(t || '').replace(/^enc:/, '');
export const isLegacyToken = (t) => !String(t || '').startsWith('enc:');
