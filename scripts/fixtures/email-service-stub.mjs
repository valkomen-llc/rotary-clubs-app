// El servicio de correo, sin salir a la red. Registra lo que se le pidió.
export const sent = [];
export const reset = () => { sent.length = 0; };
const EmailService = {
    sendPlatformEmail: async (opts) => { sent.push(opts); return { ok: true, id: 'stub' }; },
    sendEmail: async (opts) => { sent.push(opts); return { ok: true, id: 'stub' }; },
};
export default EmailService;
