// ════════════════════════════════════════════════════════════════════
// Adjuntos del compositor de correo — espejo MÍNIMO del criterio — v4.953.0
//
// Espejo de `server/lib/mailAttachments.js`, duplicado A PROPÓSITO (como
// `ADMIN_ROLES` y los demás specs espejados): el navegador valida ANTES de
// subir y ANTES de enviar con los MISMOS números y las MISMAS frases que el
// servidor, para que la UI nunca prometa lo que el envío va a rechazar. Si
// cambia un límite o una frase allá, cambiarlo acá — la paridad la comprueba
// `npm run test:mail-attachments` comparando SALIDAS.
//
// Acá vive además lo que SÓLO necesita la pantalla: traducir un fallo HTTP
// del envío a un mensaje que diga qué hacer. Un «El servidor respondió 413»
// crudo manda a diagnosticar a ciegas (es exactamente lo que se reportó).
// ════════════════════════════════════════════════════════════════════

export const MAX_MAIL_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_MAIL_TOTAL_BYTES = 15 * 1024 * 1024;

const fmtMB = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

export interface MailAttachmentMeta { filename: string; size: number }

/** Misma validación (y mismas frases) que el servidor. */
export const checkMailAttachments = (list: MailAttachmentMeta[] | null | undefined) => {
    const errores: string[] = [];
    const items = Array.isArray(list) ? list : [];
    let total = 0;
    for (const a of items) {
        const name = String(a?.filename || '').trim();
        const size = Number(a?.size) || 0;
        if (!name) {
            errores.push('Un adjunto no tiene nombre de archivo.');
            continue;
        }
        if (size <= 0) {
            errores.push(`«${name}» llegó vacío.`);
            continue;
        }
        if (size > MAX_MAIL_FILE_BYTES) {
            errores.push(`«${name}» pesa ${fmtMB(size)} y el máximo por archivo es ${fmtMB(MAX_MAIL_FILE_BYTES)}.`);
            continue;
        }
        total += size;
    }
    if (total > MAX_MAIL_TOTAL_BYTES) {
        errores.push(`Los adjuntos suman ${fmtMB(total)} y el máximo del mensaje es ${fmtMB(MAX_MAIL_TOTAL_BYTES)}. Quita o comprime alguno.`);
    }
    return { ok: errores.length === 0, errores, totalBytes: total };
};

/**
 * Traduce el desenlace HTTP de `/api/communications/send` a un mensaje con
 * salida. El texto del SERVIDOR manda cuando existe —ya viene redactado con
 * su causa (v4.942)—; el mapeo cubre los fallos que no traen cuerpo, como el
 * 413 del borde de la plataforma, que responde HTML y no JSON.
 */
export const describeMailSendError = (status: number, serverError?: string | null): string => {
    if (serverError && String(serverError).trim()) return String(serverError);
    if (status === 413) {
        return 'El correo supera el tamaño máximo que acepta el servidor. Reduce el tamaño de los archivos adjuntos e inténtalo nuevamente.';
    }
    if (status === 401) return 'Tu sesión venció. Vuelve a ingresar — lo escrito sigue en pantalla.';
    if (status === 403) return 'Tu cuenta no tiene permiso para enviar desde esa dirección.';
    if (status >= 500) return 'No fue posible enviar el mensaje en este momento. Inténtalo nuevamente.';
    return `El servidor respondió ${status}.`;
};
