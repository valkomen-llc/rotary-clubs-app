// Espejo en el navegador del criterio de `server/lib/linkRedirects.js`.
//
// Está duplicado A PROPÓSITO, igual que `entityTypes.ts` o `designSpec.ts`: el
// panel tiene que poder decir «esta regla no sirve, y por qué» mientras se
// escribe, sin ir al servidor. Lo que NO puede es tener su propia idea de qué
// es válido — el servidor sanea igual al guardar, y dos criterios distintos
// dejarían al administrador guardando reglas que se descartan en silencio.
//
// Si cambia uno, cambiar el otro: lo comprueba `npm run test:redirects`
// cargando los dos y comparando LAS SALIDAS de las funciones.

export const RESERVED_PREFIXES = [
    '/admin', '/api', '/assets', '/media', '/static',
    '/login', '/registro', '/verify-email',
];

export interface RedirectRule { from: string; to: string; permanent: boolean }

export function normalizeFrom(value?: string): string {
    let p = String(value ?? '').trim();
    if (!p) return '';
    p = p.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '');
    p = p.split('#')[0].split('?')[0];
    p = p.trim().toLowerCase();
    if (!p) return '';
    if (!p.startsWith('/')) p = '/' + p;
    p = p.replace(/\/+/g, '/');
    if (p.length > 1) p = p.replace(/\/+$/, '');
    return p;
}

export function normalizeTo(value?: string): string {
    const t = String(value ?? '').trim();
    if (!t) return '';
    if (/^https?:\/\//i.test(t)) return t;
    if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return t;
    return t.startsWith('/') ? t : '/' + t;
}

export function isReserved(pathname?: string): boolean {
    const p = normalizeFrom(pathname);
    if (!p) return false;
    return RESERVED_PREFIXES.some(prefix => p === prefix || p.startsWith(prefix + '/'));
}

export function isAcceptableTarget(value?: string): boolean {
    const t = normalizeTo(value);
    if (!t) return false;
    if (t.startsWith('/')) return !t.startsWith('//');
    return /^https?:\/\/[^/\s]+/i.test(t);
}

export function normalizeRule(rule?: Partial<RedirectRule>): RedirectRule {
    return {
        from: normalizeFrom(rule?.from),
        to: normalizeTo(rule?.to),
        permanent: rule?.permanent === true,
    };
}

export function validateRule(
    rule: Partial<RedirectRule>,
    others: Array<Partial<RedirectRule>> = []
): { ok: boolean; error: string } {
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

export function sanitizeRules(rules?: Array<Partial<RedirectRule>>): RedirectRule[] {
    const out: RedirectRule[] = [];
    for (const raw of Array.isArray(rules) ? rules : []) {
        const r = normalizeRule(raw);
        if (validateRule(r, out).ok) out.push(r);
    }
    return out;
}

export function matchRule(pathname: string, rules?: Array<Partial<RedirectRule>>): RedirectRule | null {
    const p = normalizeFrom(pathname);
    if (!p || p === '/' || isReserved(p)) return null;
    return sanitizeRules(rules).find(r => r.from === p) || null;
}

export function buildTarget(
    rule: Partial<RedirectRule>,
    { search = '', hash = '' }: { search?: string; hash?: string } = {}
): string {
    const r = normalizeRule(rule);
    if (!r.to) return '';
    const sep = r.to.includes('?') ? '&' : '?';
    const q = search && search !== '?' ? (search.startsWith('?') ? search.slice(1) : search) : '';
    const h = hash && hash !== '#' ? (hash.startsWith('#') ? hash : '#' + hash) : '';
    return `${r.to}${q ? sep + q : ''}${h}`;
}
