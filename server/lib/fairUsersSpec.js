// ════════════════════════════════════════════════════════════════════
// Usuarios de la Feria — el CRITERIO, sin base ni red (v4.1342.0)
//
// Lo usan el controlador (`projectFairUsersController.js`) y las pruebas.
// Decide: qué estado de acceso tiene una cuenta, si el comité le puede
// asignar una contraseña y si una contraseña propuesta sirve.
// ════════════════════════════════════════════════════════════════════

/** Las dos clases de cuenta de la Feria. */
export const USER_REALMS = ['project', 'attendee'];

const REALM_LABELS = {
    project: 'Gestor de proyecto',
    attendee: 'Asistente al evento',
};
export const realmLabel = (realm) => REALM_LABELS[realm] || 'Cuenta';

/** El mismo mínimo que el restablecimiento de ambos paneles. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/** Marcador de «sin contraseña utilizable» de ambas tablas. */
export const UNUSABLE_HASH = '!';

/**
 * ¿Sirve esta contraseña? Devuelve el problema en una frase, o null.
 * Nada de reglas de «una mayúscula y un símbolo»: largo mínimo, que no sea el
 * correo y que no sea una secuencia trivial.
 */
export const passwordProblem = (password, { email = '' } = {}) => {
    const p = String(password ?? '');
    if (p.length < PASSWORD_MIN) return `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`;
    if (p.length > PASSWORD_MAX) return `La contraseña no puede pasar de ${PASSWORD_MAX} caracteres.`;
    if (/^\s|\s$/.test(p)) return 'La contraseña no puede empezar ni terminar con un espacio.';
    const mail = String(email || '').trim().toLowerCase();
    if (mail && (p.toLowerCase() === mail || p.toLowerCase() === mail.split('@')[0])) return 'La contraseña no puede ser el correo de la cuenta.';
    if (/^(.)\1+$/.test(p) || ['12345678', '123456789', '1234567890', 'password', 'contraseña', 'qwertyui'].includes(p.toLowerCase())) {
        return 'Esa contraseña es demasiado fácil de adivinar.';
    }
    return null;
};

/**
 * El estado de acceso de una cuenta, para la persona del comité:
 *   active          tiene contraseña y puede entrar
 *   no_password     la cuenta existe pero nunca definió contraseña
 *   linked          asistente vinculado: entra con su cuenta de proyecto
 *   pending         asistente que todavía no activa su cuenta
 *   suspended       suspendida (reembolso u otra decisión)
 */
export const accessStateOf = (acc = {}) => {
    if (acc.realm === 'project') {
        if (acc.role === 'suspended') return 'suspended';
        return acc.hasPassword ? 'active' : 'no_password';
    }
    if (acc.status === 'suspended') return 'suspended';
    if (!acc.hasPassword && acc.linkedRealm) return 'linked';
    if (['pending_activation', 'invitation_sent', 'invitation_expired'].includes(acc.status)) return acc.hasPassword ? 'active' : 'pending';
    return acc.hasPassword ? 'active' : 'no_password';
};

const STATE_META = {
    active: { label: 'Con acceso', tone: 'emerald', description: 'Tiene contraseña y puede ingresar.' },
    no_password: { label: 'Sin contraseña', tone: 'amber', description: 'La cuenta existe, pero nunca definió una contraseña.' },
    linked: { label: 'Vinculada', tone: 'sky', description: 'Ingresa con la contraseña de su cuenta de proyecto.' },
    pending: { label: 'Por activar', tone: 'amber', description: 'Todavía no activa su cuenta.' },
    suspended: { label: 'Suspendida', tone: 'red', description: 'La cuenta está suspendida; cambiar la contraseña no la reactiva.' },
};
export const accessStateMeta = (key) => STATE_META[key] || { label: key || '—', tone: 'slate', description: '' };

/**
 * ¿Puede el comité asignarle una contraseña (o un enlace) a esta cuenta?
 * No a una VINCULADA: su contraseña es la de la identidad de origen.
 * No a una SUSPENDIDA: la suspensión es otra decisión y no se deshace por aquí.
 */
export const canSetPassword = (acc = {}) => {
    if (acc.realm === 'attendee' && acc.linkedRealm && !acc.hasPassword) {
        return { ok: false, code: 'linked_account', reason: 'Esta cuenta de asistente está vinculada a otra identidad y entra con esa contraseña. Cambia la contraseña de la cuenta de origen (por ejemplo, la del gestor del proyecto).' };
    }
    if ((acc.realm === 'attendee' && acc.status === 'suspended') || (acc.realm === 'project' && acc.role === 'suspended')) {
        return { ok: false, code: 'suspended', reason: 'La cuenta está suspendida. Cambiar la contraseña no la reactiva: primero hay que resolver la suspensión.' };
    }
    return { ok: true };
};

/** Dónde abre el enlace de restablecimiento cada clase de cuenta. */
export const resetLinkPath = (realm, cfg = {}) =>
    (realm === 'project' ? (cfg?.portal?.path || '/mi-proyecto') : '/mi-inscripcion');
