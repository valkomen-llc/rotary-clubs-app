// El servicio de correo, sin red, con LA MISMA FORMA que el real.
//
// ⚠️ `sendPlatformEmail` contesta `{ success, messageId }` o
// `{ success: false, error }` y NUNCA lanza (v4.901, v4.945). Un doble que
// devolviera `{ ok: true }` dejaría en verde justo el defecto que hace que un
// envío rechazado se registre como enviado.
export const sent = [];
/** Cuando está en `true`, el proveedor rechaza: para probar el reintento. */
export const control = { fallar: false };
export const reset = () => { sent.length = 0; control.fallar = false; };

const EmailService = {
    sendPlatformEmail: async (opts) => {
        sent.push(opts);
        if (control.fallar) return { success: false, error: 'El proveedor rechazó el envío (simulado).' };
        return { success: true, messageId: `msg-${sent.length}` };
    },
    sendEmail: async (opts) => { sent.push(opts); return { success: true, messageId: `msg-${sent.length}` }; },
};
export default EmailService;
