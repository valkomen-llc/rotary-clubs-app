// ════════════════════════════════════════════════════════════════════
// Redirecciones de enlaces por sitio — el CRITERIO
//
// PURO a propósito: sin base y sin red, igual que `domains.js` y por el mismo
// motivo — decide a dónde va a parar un visitante y tiene que poder probarse.
//
// QUÉ RESUELVE. Un sitio necesita direcciones cortas y propias que lleven a
// otra parte: `rotary4281.org/conferencia` → la página de inscripción,
// `rotary4281.org/polio` → endpolio.org. Se comparten por WhatsApp, se imprimen
// en un pendón y se dicen en voz alta, así que tienen que sobrevivir a que el
// destino cambie.
//
// LA REDIRECCIÓN ES DEL SERVIDOR, NO DE LA PANTALLA. Un `<Navigate>` de React
// sólo actúa después de que cargue el JavaScript: un rastreador, la vista
// previa de WhatsApp y `curl` verían la aplicación vacía en vez de seguir el
// salto. Es la misma razón por la que el `<head>` se resuelve en el servidor
// (v4.702). Por eso esto se consume en el catch-all de `api/index.js`.
// ════════════════════════════════════════════════════════════════════

/**
 * Prefijos que NO se pueden redirigir.
 *
 * `/admin` es el que importa de verdad: una redirección ahí deja al
 * administrador sin panel y sin forma de entrar a quitarla — se cerraría la
 * puerta con la llave adentro. Los demás son la API, los archivos servidos y
 * las rutas de sesión.
 */
export const RESERVED_PREFIXES = [
    '/admin', '/api', '/assets', '/media', '/static',
    '/login', '/registro', '/verify-email',
];

/** ¿Esta dirección es de las que no se pueden tocar? */
export function isReserved(pathname) {
    const p = normalizeFrom(pathname);
    if (!p) return false;
    return RESERVED_PREFIXES.some(prefix => p === prefix || p.startsWith(prefix + '/'));
}

/**
 * La forma canónica de la dirección de ORIGEN: siempre con barra inicial, en
 * minúsculas, sin barra final, sin query y sin ancla.
 *
 * Se canoniza al GUARDAR y al BUSCAR con la misma función —igual que en
 * `domains.js`— porque si las dos puntas no se reducen a lo mismo, la
 * redirección no dispara y el visitante ve un 404 sin ninguna pista.
 *
 * El ancla se descarta porque NUNCA llega al servidor: el navegador no la
 * envía. Aceptarla en el formulario daría una regla que no puede funcionar.
 */
export function normalizeFrom(value) {
    let p = String(value ?? '').trim();
    if (!p) return '';
    // Alguien pega la dirección completa copiada del navegador.
    p = p.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '');
    p = p.split('#')[0].split('?')[0];
    p = p.trim().toLowerCase();
    if (!p) return '';
    if (!p.startsWith('/')) p = '/' + p;
    p = p.replace(/\/+/g, '/');
    if (p.length > 1) p = p.replace(/\/+$/, '');
    return p;
}

/**
 * El DESTINO. Puede ser una dirección externa completa o una ruta del propio
 * sitio; no se canoniza a minúsculas porque una URL externa puede distinguir
 * mayúsculas en su ruta.
 *
 * Sólo se admiten `http` y `https`: un destino `javascript:` convertiría un
 * campo del panel en un hueco por donde inyectar código en el sitio, que es la
 * misma razón por la que el mapa de la sede sólo acepta Google (v4.717).
 */
export function normalizeTo(value) {
    const t = String(value ?? '').trim();
    if (!t) return '';
    if (/^https?:\/\//i.test(t)) return t;
    // Un esquema que no sea http(s) se rechaza en la validación; acá sólo se
    // deja pasar tal cual para que el mensaje de error lo pueda mostrar.
    if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return t;
    return t.startsWith('/') ? t : '/' + t;
}

/** ¿El destino es aceptable? Sólo http(s) o una ruta interna. */
export function isAcceptableTarget(value) {
    const t = normalizeTo(value);
    if (!t) return false;
    if (t.startsWith('/')) return !t.startsWith('//');   // `//host` es externo disfrazado
    return /^https?:\/\/[^/\s]+/i.test(t);
}

/**
 * Da forma a una regla suelta. Devuelve siempre la misma estructura para que
 * el resto del módulo no tenga que defenderse de campos ausentes.
 */
export function normalizeRule(rule) {
    return {
        from: normalizeFrom(rule?.from),
        to: normalizeTo(rule?.to),
        // Temporal por DEFECTO, y es la decisión importante de este módulo: un
        // 301 lo cachea el navegador durante meses, así que una redirección
        // equivocada sigue actuando para quien ya la visitó AUNQUE se corrija.
        // Lo permanente se elige a propósito, sabiendo eso.
        permanent: rule?.permanent === true,
    };
}

/**
 * ¿Sirve esta regla? Devuelve `{ ok, error }` con el motivo redactado, porque
 * el panel lo muestra tal cual.
 *
 * @param rule      la regla a comprobar
 * @param others    las demás reglas ya guardadas, para detectar el duplicado
 */
export function validateRule(rule, others = []) {
    const r = normalizeRule(rule);

    if (!r.from) return { ok: false, error: 'Escribí la dirección corta, por ejemplo /conferencia.' };
    if (r.from === '/') return { ok: false, error: 'La portada no se puede redirigir: el sitio quedaría inaccesible.' };
    if (isReserved(r.from)) {
        return { ok: false, error: `«${r.from}» es una dirección del sistema y no se puede redirigir.` };
    }
    if (/\s/.test(r.from)) return { ok: false, error: 'La dirección corta no puede llevar espacios.' };

    if (!r.to) return { ok: false, error: 'Escribí a dónde debe llevar.' };
    if (!isAcceptableTarget(r.to)) {
        return { ok: false, error: 'El destino tiene que ser una dirección http(s) o una ruta de este sitio.' };
    }
    if (normalizeFrom(r.to) === r.from && !/^https?:/i.test(r.to)) {
        return { ok: false, error: 'El origen y el destino son la misma dirección: daría un bucle.' };
    }

    const dup = others.map(normalizeRule).find(o => o.from === r.from);
    if (dup) return { ok: false, error: `Ya hay una redirección para «${r.from}».` };

    return { ok: true, error: '' };
}

/**
 * Limpia una lista guardada: descarta lo inservible y deja una sola regla por
 * origen. Se aplica al GUARDAR y al LEER — al leer también, porque en la base
 * puede haber filas escritas antes de que existiera una validación, y una regla
 * rota no puede tumbar la resolución de una página.
 */
export function sanitizeRules(rules) {
    const out = [];
    for (const raw of Array.isArray(rules) ? rules : []) {
        const r = normalizeRule(raw);
        if (validateRule(r, out).ok) out.push(r);
    }
    return out;
}

/**
 * La regla que corresponde a esta dirección, o `null`.
 *
 * La comparación es EXACTA sobre la forma canónica: nada de prefijos ni
 * comodines. Un comodín es cómodo de escribir y muy difícil de razonar cuando
 * hay varios —¿cuál gana, el más largo, el primero?— y acá el precio de
 * equivocarse es que una página real del sitio deje de ser alcanzable.
 */
export function matchRule(pathname, rules) {
    const p = normalizeFrom(pathname);
    if (!p || p === '/' || isReserved(p)) return null;
    return sanitizeRules(rules).find(r => r.from === p) || null;
}

/**
 * El ENLACE que corresponde a esta dirección, con su fila entera.
 *
 * `matchRule` devuelve la regla saneada —`{from,to,permanent}`— y eso alcanzaba
 * mientras una redirección era una entrada de un array JSON. Desde v4.993 cada
 * una es una fila con IDENTIDAD, y el id es lo que hace falta para registrar el
 * clic: sanear la lista antes de emparejar tiraba justamente ese campo. Por eso
 * ésta empareja sobre las filas y las devuelve tal cual.
 *
 * Mismo criterio de comparación: exacto, sobre la forma canónica, sin comodines.
 */
export function matchLink(pathname, links) {
    const p = normalizeFrom(pathname);
    if (!p || p === '/' || isReserved(p)) return null;
    for (const link of Array.isArray(links) ? links : []) {
        if (!link) continue;
        if (normalizeFrom(link.slug ?? link.from) !== p) continue;
        if (!isAcceptableTarget(link.target ?? link.to)) continue;
        return link;
    }
    return null;
}

/**
 * El destino final, conservando la query y el ancla con los que llegó la
 * visita. Es la misma regla que `ctaTarget` (v4.657): `?utm_source=…` es
 * justamente lo que distingue de dónde viene quien hizo clic, y perderlo en el
 * salto deja la campaña sin medir.
 */
export function buildTarget(rule, { search = '', hash = '' } = {}) {
    const r = normalizeRule(rule);
    if (!r.to) return '';
    // Un destino que ya trae query recibe la de la visita con `&`.
    const sep = r.to.includes('?') ? '&' : '?';
    const q = search && search !== '?' ? (search.startsWith('?') ? search.slice(1) : search) : '';
    const h = hash && hash !== '#' ? (hash.startsWith('#') ? hash : '#' + hash) : '';
    return `${r.to}${q ? sep + q : ''}${h}`;
}

export default {
    RESERVED_PREFIXES, isReserved, normalizeFrom, normalizeTo, isAcceptableTarget,
    normalizeRule, validateRule, sanitizeRules, matchRule, matchLink, buildTarget,
};
