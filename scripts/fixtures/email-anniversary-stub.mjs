// ════════════════════════════════════════════════════════════════════
// Aniversarios IA — EmailService sustituido (v4.929)
//
// Registra cada envío y contesta con la MISMA forma que el servicio real
// ({ success, error? }): un doble con otra forma es el defecto de v4.901.
// ════════════════════════════════════════════════════════════════════
export let correos = [];
export let emailConfig = { falla: null };
export const resetCorreos = (patch = {}) => { correos = []; emailConfig = { falla: null, ...patch }; };

const sendPlatformEmail = async (args) => {
    correos.push(args);
    if (emailConfig.falla && args.to === emailConfig.falla) {
        return { success: false, error: 'buzón rechazado (doble de prueba)' };
    }
    return { success: true, id: `mail-${correos.length}` };
};

// ── senderDomains (el mismo doble sirve a los dos módulos) ────────────
export let dominios = [];
export const setDominios = (lista) => { dominios = Array.isArray(lista) ? lista : []; };
export const verifiedDomains = async () => dominios;

export default { sendPlatformEmail };
