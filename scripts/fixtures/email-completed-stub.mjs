// El correo, capturado en memoria. La prueba mira QUÉ salió y hacia dónde.
//
// ⚠️ El doble devuelve LA MISMA FORMA que el servicio real (lección v4.901):
// `sendPlatformEmail` NUNCA lanza — contesta `{ success, messageId }` o
// `{ success: false, error }`. Un stub que lanzara en el fallo dejaría en
// verde un controlador que no comprueba `success`, que es exactamente el
// defecto que la v4.945 corrige.
export const enviados = [];

// Fallos inyectables DE UN SOLO USO: el siguiente envío contesta
// `{ success: false, error }` con este texto, como hace el servicio real.
export const fallas = [];

export const resetEnviados = () => {
    enviados.length = 0;
    fallas.length = 0;
};

let consecutivo = 0;
const enviar = async (args) => {
    enviados.push(args);
    if (fallas.length) return { success: false, error: fallas.shift() };
    consecutivo += 1;
    return { success: true, messageId: `msg-${consecutivo}` };
};

export default {
    sendPlatformEmail: enviar,
    sendEmail: enviar,
};
