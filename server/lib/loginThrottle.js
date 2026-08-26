// ════════════════════════════════════════════════════════════════════
// Freno de intentos de ingreso — v4.932.0
//
// ⚠️ ES UN FRENO, NO UNA GARANTÍA, y hay que decirlo así.
//
// El mapa vive EN MEMORIA de la instancia y se reinicia con ella. En Vercel hay
// varias instancias y se reciclan solas, así que un atacante repartido entre
// ellas ve un contador más flojo que el que este archivo declara. Alcanza para
// que un bucle contra un correo concreto se pare y quede anotado; un límite de
// verdad exige un almacén compartido (Redis, o una tabla con su propio
// barrido), que la plataforma no tiene. Es la misma cautela declarada del
// contador público de campañas en v4.808, y se dice acá para que nadie lo lea
// como algo que no es.
//
// Lo que SÍ es sólido es lo otro que hace: cada intento fallido queda en
// `InstitutionalAccessEvent`. Un ataque no se frena del todo, pero se VE.
// ════════════════════════════════════════════════════════════════════

/** Intentos fallidos permitidos antes de bloquear. */
export const MAX_ATTEMPTS = 8;

/** Cuánto dura el bloqueo, y cuánto se recuerda un intento fallido. */
export const WINDOW_MS = 15 * 60 * 1000;

/**
 * Tope del mapa. Sin él, un atacante que pruebe un correo distinto cada vez
 * haría crecer la memoria de la función sin límite: el freno se convertiría en
 * la vulnerabilidad. Al llenarse se descarta lo más viejo.
 */
const MAX_ENTRIES = 5000;

const intentos = new Map();

const podar = (ahora) => {
    for (const [clave, dato] of intentos) {
        if (ahora - dato.first > WINDOW_MS) intentos.delete(clave);
    }
    if (intentos.size <= MAX_ENTRIES) return;
    // Map conserva el orden de inserción: los primeros son los más viejos.
    const sobran = intentos.size - MAX_ENTRIES;
    let n = 0;
    for (const clave of intentos.keys()) {
        intentos.delete(clave);
        if (++n >= sobran) break;
    }
};

/**
 * La clave del contador: correo + IP.
 *
 * Sólo por IP castigaría a toda una oficina que comparte salida cuando uno se
 * equivoca; sólo por correo dejaría que cualquiera bloqueara la cuenta ajena
 * fallando ocho veces a propósito —una denegación de servicio de un renglón—.
 * Juntos, el bloqueo alcanza al par que de verdad está fallando.
 */
const claveDe = (email, ip) => `${String(email || '').toLowerCase()}|${String(ip || '')}`;

/**
 * ¿Se le permite intentar? Devuelve el motivo cuando no.
 *
 * `now` entra como parámetro para poder probarlo sin esperar quince minutos.
 */
export const checkLogin = (email, ip, now = Date.now()) => {
    podar(now);
    const dato = intentos.get(claveDe(email, ip));
    if (!dato) return { allowed: true, remaining: MAX_ATTEMPTS };
    if (now - dato.first > WINDOW_MS) return { allowed: true, remaining: MAX_ATTEMPTS };
    if (dato.count < MAX_ATTEMPTS) {
        return { allowed: true, remaining: MAX_ATTEMPTS - dato.count };
    }
    const restanMs = WINDOW_MS - (now - dato.first);
    return {
        allowed: false,
        remaining: 0,
        retryInMinutes: Math.max(1, Math.ceil(restanMs / 60000)),
    };
};

/** Anota un fallo. */
export const recordFailure = (email, ip, now = Date.now()) => {
    const clave = claveDe(email, ip);
    const dato = intentos.get(clave);
    if (!dato || now - dato.first > WINDOW_MS) {
        intentos.set(clave, { first: now, count: 1 });
        return 1;
    }
    dato.count += 1;
    return dato.count;
};

/** Un ingreso correcto limpia el contador de ese par. */
export const recordSuccess = (email, ip) => {
    intentos.delete(claveDe(email, ip));
};

/** Sólo para las pruebas: deja el mapa como recién arrancado. */
export const resetThrottle = () => intentos.clear();

export default { checkLogin, recordFailure, recordSuccess, resetThrottle, MAX_ATTEMPTS, WINDOW_MS };
