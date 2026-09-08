// ════════════════════════════════════════════════════════════════════
// Meta, en memoria — el adaptador de la Graph API sustituido.
// v4.1013.0
//
// ⚠️ DEVUELVE LA MISMA FORMA QUE EL SERVICIO REAL. Un doble que devolviera
// otra cosa dejaría en verde un código que en producción no sabe leer la
// respuesta — es la lección de v4.901 (`generateCopy` devuelve `{content}` y
// tres lecturas del sitio buscaban `.text`, cayendo al respaldo EN SILENCIO).
// La forma real de `publishContentToTarget` es:
//     { ok: true,  externalId, externalUrl }
//     { ok: false, error }
// ════════════════════════════════════════════════════════════════════

export const llamadas = [];
let guion = [];
let seq = 0;

export const reset = () => { llamadas.length = 0; guion = []; seq = 0; };

/** Qué va a contestar Meta, en orden. Sin guion, todo sale bien. */
export const responder = (respuestas) => { guion = [...respuestas]; };

export const publishContentToTarget = async ({ account, decryptedToken, content = {} }) => {
    llamadas.push({
        accountId: account?.id,
        platform: account?.platform,
        pageId: account?.platformId,
        // Se guarda para poder comprobar que el token LLEGÓ descifrado y que no
        // viajó a ninguna respuesta.
        token: decryptedToken,
        kind: content.kind,
        message: content.message,
        link: content.link,
        mediaUrl: content.mediaUrl,
    });
    if (guion.length) return guion.shift();
    return { ok: true, externalId: `fb-post-${++seq}`, externalUrl: `https://facebook.com/123/posts/${seq}` };
};

/** Lo demás del módulo real, para que los otros consumidores no se rompan. */
export const publishToAccount = async () => ({ ok: true, externalId: 'x', externalUrl: null });
export const listPagePosts = async () => [];

export default { publishContentToTarget, publishToAccount, listPagePosts };
