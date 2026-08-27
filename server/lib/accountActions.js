// ════════════════════════════════════════════════════════════════════
// ACCIONES SOBRE LAS CUENTAS DEL SITIO — v4.940.0
//
// El CRITERIO. **Puro**: sin base, sin red, sin `req`. Contesta qué se puede
// editar de una cuenta, si una contraseña sirve, quién puede fijársela a quién
// y qué pasa con cada fila de una acción en bloque.
//
// ⚠️ SON DOS CONTRASEÑAS DISTINTAS Y CONFUNDIRLAS ES EL DEFECTO. Una cuenta del
// sitio puede tener:
//
//   · la del BUZÓN   — `EmailAccount.password`, en texto plano porque es lo que
//                      el proveedor necesita para entregar y enviar. Es la que
//                      se escribe en un cliente de correo. TODA cuenta la tiene.
//   · la de ACCESO   — `User.password`, con bcrypt, para entrar al panel. SÓLO
//                      existe si la cuenta tiene propietario; una cuenta «sólo
//                      buzón» (contacto@, info@) no tiene ninguna persona detrás.
//
// Ofrecer la segunda en una cuenta sin dueño sería un campo que no hace nada
// (v4.650), y cambiar una creyendo que se cambia la otra deja a alguien fuera
// del panel o el correo sin entregar, en silencio.
//
// ⚠️ NUNCA SE DEVUELVE UNA CONTRASEÑA GUARDADA, ni recortada — la regla de
// v4.932 sigue entera. Lo que este módulo agrega es FIJAR una nueva, que es
// otra cosa: el administrador la escribe, así que ya la conoce. Leer la que
// hay pondría en circulación una credencial que su dueño cree suya.
// ════════════════════════════════════════════════════════════════════

import { PASSWORD_MIN, isPlatformOperator, isSiteAdministrator, INSTITUTIONAL_ROLE } from './institutionalAccess.js';

const str = (v, max = 200) => (v === null || v === undefined ? null : String(v).replace(/\s+/g, ' ').trim().slice(0, max) || null);
const lower = (v) => String(v || '').trim().toLowerCase();

// ── Qué se puede editar de un buzón ──────────────────────────────────

/**
 * EL CATÁLOGO ES CERRADO, y ésa es la frontera de seguridad.
 *
 * Lo que no está acá no se puede ni EXPRESAR en la petición — patrón
 * `stripProtected`, el mismo que cierra el portal de Plantillas IA y el `/me`
 * institucional. Esconder un campo en la pantalla no protege un endpoint de
 * quien lo conoce (v4.868).
 *
 * ⚠️ LA DIRECCIÓN NO SE EDITA, y no es un olvido. `EmailAccount.email` es la
 * llave por la que el perfil de su dueño encuentra su buzón (`mailbox`), por la
 * que la bandeja arma su `WHERE` y por la que el proveedor entrega: cambiarla
 * dejaría los correos ya recibidos apuntando a una dirección que no existe y a
 * su dueño sin bandeja. Una dirección nueva es una cuenta nueva.
 *
 * `isPrimary`, `clubId`, `verified` y `provider` tampoco: son estado del
 * sistema, no preferencias de quien administra.
 */
export const MAILBOX_EDITABLE = ['label', 'password'];

/** Las dos clases de contraseña, declaradas. */
export const PASSWORD_SCOPES = {
    mailbox: {
        key: 'mailbox',
        label: 'Contraseña del buzón',
        help: 'La que se escribe en un cliente de correo para leer y enviar desde esta dirección.',
        temporary: false,
    },
    access: {
        key: 'access',
        label: 'Contraseña de acceso al panel',
        help: 'Con la que su propietario entra a Club Platform. Sólo existe si la cuenta tiene propietario.',
        temporary: true,
    },
};
export const PASSWORD_SCOPE_KEYS = Object.keys(PASSWORD_SCOPES);

// ── ¿Sirve esta contraseña? ──────────────────────────────────────────

/**
 * Valida una contraseña que alguien acaba de escribir.
 *
 * ⚠️ Devuelve TODOS los errores, no el primero: «contraseña inválida» a secas
 * obliga a probar a ciegas. Misma regla que `validateAccountPayload`.
 *
 * La confirmación se EXIGE cuando viene y se AVISA cuando no: un cliente
 * anterior que mande sólo `password` sigue funcionando —regla aditiva— y quien
 * lo haga se entera de que nadie comprobó que no hubiera un dedazo.
 */
export const validateNewPassword = (input = {}, { scope = 'mailbox', currentEmail = '' } = {}) => {
    const errors = [];
    const warnings = [];

    const password = String(input.password ?? '');
    const confirm = String(input.passwordConfirm ?? input.confirmPassword ?? '');

    if (!PASSWORD_SCOPE_KEYS.includes(scope)) errors.push('Esa clase de contraseña no existe.');

    if (!password) {
        errors.push('Escribe la contraseña nueva.');
    } else if (password.length < PASSWORD_MIN) {
        errors.push(`La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`);
    }

    if (confirm) {
        if (password !== confirm) errors.push('Las dos contraseñas no coinciden.');
    } else if (password) {
        warnings.push('Se guardó sin confirmar la contraseña: comprueba que sea la que querías.');
    }

    // No es una política de complejidad —imponerla aquí sería inventar una
    // regla que el resto de la plataforma no aplica—, pero la dirección como
    // contraseña es el caso que de verdad se ve y se avisa.
    const correo = lower(currentEmail);
    if (password && correo && (lower(password) === correo || lower(password) === correo.split('@')[0])) {
        warnings.push('Esa contraseña es la propia dirección: es la primera que prueba cualquiera.');
    }

    return {
        ok: errors.length === 0,
        errors,
        warnings,
        value: {
            password,
            scope,
            // Una contraseña de ACCESO que escribió el administrador es
            // TEMPORAL por omisión (v4.932): la conoce alguien que no es su
            // dueño, así que el primer ingreso pide cambiarla. La del BUZÓN no
            // tiene «primer ingreso» que interceptar, así que no aplica.
            temporary: scope === 'access' ? input.temporary !== false : false,
        },
    };
};

/**
 * Qué campos de un buzón trae esta petición, ya saneados.
 *
 * `undefined` es «no lo toques» y `''` es «déjalo vacío» — la distinción que
 * costó el borrado silencioso del pool registrador (v4.877). La contraseña es
 * la excepción declarada: vacía significa «no la cambies», porque no existe una
 * cuenta de correo sin contraseña y borrarla dejaría el buzón sin entregar.
 */
export const mailboxPatch = (body = {}) => {
    const patch = {};
    const descartados = [];

    for (const key of Object.keys(body || {})) {
        if (key === 'passwordConfirm' || key === 'confirmPassword') continue;
        if (!MAILBOX_EDITABLE.includes(key)) descartados.push(key);
    }

    if (body?.label !== undefined) patch.label = str(body.label, 120);
    if (body?.password !== undefined && String(body.password) !== '') patch.password = String(body.password);

    return { patch, descartados, campos: Object.keys(patch) };
};

// ── ¿Quién puede fijarle la contraseña de acceso a quién? ────────────

/**
 * ⚠️ FIJARLE LA CONTRASEÑA DE ACCESO A ALGUIEN ES TOMAR SU CUENTA. No es editar
 * un dato suyo: es poder entrar como él. Por eso se decide con el mismo
 * criterio con el que se reparten los roles —«un administrador de sitio nunca
 * puede asignar roles superiores a su propio alcance»—: se puede sobre quien
 * uno podría haber nombrado, y sobre nadie más.
 *
 * En la práctica: el operador de la plataforma puede sobre cualquiera de sus
 * sitios; un administrador de sitio puede sobre los usuarios institucionales de
 * SU sitio y NO sobre otro administrador ni sobre el operador — si pudiera,
 * una credencial de administrador robada se convertiría en todas las demás.
 *
 * ⚠️ Y NADIE SOBRE SÍ MISMO. Para lo propio está `/institutional/me/password`,
 * que EXIGE la contraseña actual: tener la sesión abierta no demuestra que la
 * cuenta sea tuya, y sin ese paso quien encuentre una sesión en un equipo
 * prestado se queda con ella (v4.932).
 *
 * Devuelve el motivo Y LA SALIDA: un bloqueo sin salida se lee como una avería.
 */
export const canResetAccessPassword = (actor, target) => {
    if (!actor || !target) return { ok: false, reason: 'sin_datos', message: 'No sabemos sobre quién se está actuando.' };

    if (String(actor.id) === String(target.id)) {
        return {
            ok: false,
            reason: 'uno_mismo',
            message: 'No puedes restablecerte tu propia contraseña desde acá.',
            way: 'Cámbiala en Mi perfil, donde se te pide la actual.',
        };
    }

    if (isPlatformOperator(target) && !isPlatformOperator(actor)) {
        return {
            ok: false,
            reason: 'operador',
            message: 'Esa cuenta es del equipo de Club Platform.',
            way: 'Usa «Enviar acceso»: le llega un enlace a su propio buzón y la credencial no pasa por nadie más.',
        };
    }

    if (isSiteAdministrator(target) && !isPlatformOperator(actor)) {
        return {
            ok: false,
            reason: 'administrador',
            message: 'Sólo el administrador de Club Platform puede restablecer la contraseña de otro administrador del sitio.',
            way: 'Usa «Enviar acceso»: le llega un enlace a su propio buzón y la credencial no pasa por nadie más.',
        };
    }

    if (!isPlatformOperator(actor) && !isSiteAdministrator(actor)) {
        return {
            ok: false,
            reason: 'sin_permiso',
            message: 'No tienes permiso para restablecer contraseñas.',
            way: 'Pídeselo a un administrador del sitio.',
        };
    }

    return { ok: true, reason: 'ok', role: str(target.role, 40) || INSTITUTIONAL_ROLE };
};

// ── Acciones en bloque ───────────────────────────────────────────────

/** Lo que se puede pedir sobre varias cuentas a la vez. Catálogo CERRADO. */
export const BULK_ACTIONS = {
    delete: {
        key: 'delete',
        label: 'Eliminar',
        /**
         * ⚠️ NO HAY UNA ACCIÓN DE CONTRASEÑA EN BLOQUE, y su ausencia es
         * deliberada: poner la MISMA credencial en varias cuentas convierte una
         * sola filtración en todas ellas. Se dice en la pantalla en vez de
         * dejar el hueco para que alguien lo lea como algo pendiente.
         */
        destructive: true,
    },
};
export const BULK_ACTION_KEYS = Object.keys(BULK_ACTIONS);
export const BULK_MAX = 50;

/** Por qué una fila se quedó fuera. Se NOMBRA: un descarte mudo miente. */
export const SKIP_REASONS = {
    no_existe: 'no existe o ya se eliminó',
    otro_sitio: 'es de otro sitio',
    principal: 'es la cuenta principal del sitio',
    propia: 'es tu propia cuenta',
};

/**
 * EL PLAN DE UNA ACCIÓN EN BLOQUE, fila por fila.
 *
 * ⚠️ NO ES ATÓMICA Y HAY QUE DECIRLO. Cada cuenta se resuelve por su cuenta;
 * envolverlo en una transacción sería peor —un fallo tiraría abajo borrados que
 * sí ocurrieron—. Lo que no puede pasar es que un descarte sea SILENCIOSO: se
 * marcan cinco, se anuncian cinco y se tocaron tres. Es la lección del borrado
 * en bloque de publicaciones (v4.938) y de los desembolsos (v4.886).
 *
 * ⚠️ LA CUENTA PRINCIPAL NO SE BORRA NI EN BLOQUE, y la puerta va acá y no en
 * la pantalla: una selección de «todas» la incluye siempre, y esconder su
 * casilla no protegería el endpoint de quien lo conoce.
 */
export const bulkPlan = (ids = [], accounts = [], { clubId = null, actorMailbox = null, action = 'delete' } = {}) => {
    const porId = new Map((accounts || []).filter(Boolean).map(a => [String(a.id), a]));
    const vistos = new Set();
    const permitidas = [];
    const saltadas = [];

    for (const raw of Array.isArray(ids) ? ids : []) {
        const id = str(raw, 80);
        if (!id || vistos.has(id)) continue;
        vistos.add(id);

        const cuenta = porId.get(id);
        if (!cuenta) { saltadas.push({ id, email: null, reason: 'no_existe' }); continue; }
        const email = lower(cuenta.email);

        if (clubId && cuenta.clubId && String(cuenta.clubId) !== String(clubId)) {
            saltadas.push({ id, email, reason: 'otro_sitio' }); continue;
        }
        if (action === 'delete' && cuenta.isPrimary) {
            saltadas.push({ id, email, reason: 'principal' }); continue;
        }
        if (action === 'delete' && actorMailbox && email && email === lower(actorMailbox)) {
            // Borrar el buzón por el que uno entra deja a su dueño sin bandeja
            // en la vuelta siguiente y sin forma de deshacerlo desde acá.
            saltadas.push({ id, email, reason: 'propia' }); continue;
        }

        permitidas.push({ id, email });
    }

    return {
        action: BULK_ACTION_KEYS.includes(action) ? action : null,
        allowed: permitidas,
        skipped: saltadas.map(s => ({ ...s, motivo: SKIP_REASONS[s.reason] || s.reason })),
        total: vistos.size,
        overLimit: vistos.size > BULK_MAX,
    };
};

/**
 * El resultado, en una frase honesta.
 *
 * «Se eliminaron 5» cuando se tocaron 3 es exactamente el defecto que el plan
 * existe para no tener, así que lo omitido se NOMBRA y lo fallido también.
 */
export const describeBulk = ({ done = [], skipped = [], failed = [] } = {}) => {
    const partes = [];
    partes.push(done.length === 1 ? 'Se eliminó 1 cuenta' : `Se eliminaron ${done.length} cuentas`);
    if (skipped.length) {
        const detalle = skipped.slice(0, 3).map(s => `${s.email || s.id} (${s.motivo || SKIP_REASONS[s.reason] || s.reason})`).join(', ');
        partes.push(`${skipped.length} quedaron fuera: ${detalle}${skipped.length > 3 ? '…' : ''}`);
    }
    if (failed.length) {
        const detalle = failed.slice(0, 3).map(f => `${f.email || f.id}`).join(', ');
        partes.push(`${failed.length} no se pudieron eliminar: ${detalle}${failed.length > 3 ? '…' : ''}`);
    }
    return `${partes.join('. ')}.`;
};

export default {
    MAILBOX_EDITABLE, PASSWORD_SCOPES, PASSWORD_SCOPE_KEYS,
    validateNewPassword, mailboxPatch, canResetAccessPassword,
    BULK_ACTIONS, BULK_ACTION_KEYS, BULK_MAX, SKIP_REASONS, bulkPlan, describeBulk,
};
