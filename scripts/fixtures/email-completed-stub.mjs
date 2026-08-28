// El correo, capturado en memoria. La prueba mira QUÉ salió y hacia dónde.
export const enviados = [];
export const resetEnviados = () => { enviados.length = 0; };

export default {
    sendPlatformEmail: async (args) => { enviados.push(args); return { sent: true }; },
    sendEmail: async (args) => { enviados.push(args); return { sent: true }; },
};
