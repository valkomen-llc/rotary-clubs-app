// Prisma en memoria para `test:meta:oauth`. Sólo los modelos que el
// sincronizador toca, con la MISMA forma que devuelve Prisma.
//
// ⚠️ Un doble que reimplemente la regla que la prueba dice comprobar la
// vuelve VACUA (la lección de v4.896): acá el doble sólo guarda y devuelve
// filas — quién se retira y quién no lo decide `metaSync.js`.

let store = {};
let seq = 0;

export const reset = (inicial = {}) => {
    store = {
        socialAccount: (inicial.socialAccount || []).map(r => ({ ...r })),
        clubs: (inicial.clubs || []).map(r => ({ ...r })),
        districts: (inicial.districts || []).map(r => ({ ...r })),
        settings: (inicial.settings || []).map(r => ({ ...r })),
    };
    seq = 0;
};
export const rows = (modelo) => store[modelo] || [];
reset({});

const casa = (fila, where = {}) => Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
        if ('in' in v) return v.in.includes(fila[k]);
        if ('not' in v) return v.not === null ? fila[k] != null : fila[k] !== v.not;
        if ('gt' in v) return Number(fila[k] || 0) > v.gt;
        return false;
    }
    return fila[k] === v;
});

const orClause = (fila, where = {}) => {
    if (!where.OR) return casa(fila, where);
    const resto = { ...where }; delete resto.OR;
    return casa(fila, resto) && where.OR.some(c => casa(fila, c));
};

const prisma = {
    socialAccount: {
        upsert: async ({ where, update, create }) => {
            const llave = where.clubId_platform_platformId;
            const i = store.socialAccount.findIndex(f =>
                f.clubId === llave.clubId && f.platform === llave.platform && f.platformId === llave.platformId);
            if (i >= 0) {
                store.socialAccount[i] = { ...store.socialAccount[i], ...update };
                return store.socialAccount[i];
            }
            const fila = { id: `gen-${++seq}`, ...create };
            store.socialAccount.push(fila);
            return fila;
        },
        findMany: async ({ where = {}, select } = {}) => store.socialAccount
            .filter(f => casa(f, where))
            .map(f => (select ? Object.fromEntries(Object.keys(select).map(k => [k, f[k]])) : { ...f })),
        findFirst: async ({ where = {} } = {}) => store.socialAccount.find(f => casa(f, where)) || null,
        update: async ({ where, data }) => {
            const i = store.socialAccount.findIndex(f => f.id === where.id);
            if (i < 0) throw new Error('fila no encontrada');
            store.socialAccount[i] = { ...store.socialAccount[i], ...data };
            return store.socialAccount[i];
        },
    },
    club:     { findFirst: async ({ where = {} } = {}) => store.clubs.find(f => orClause(f, where)) || null },
    district: { findFirst: async ({ where = {} } = {}) => store.districts.find(f => orClause(f, where)) || null },
    setting: {
        findFirst: async ({ where = {} } = {}) => store.settings.find(f => casa(f, where)) || null,
        create: async ({ data }) => { const f = { id: `s-${++seq}`, ...data }; store.settings.push(f); return f; },
        update: async ({ where, data }) => {
            const i = store.settings.findIndex(f => f.id === where.id);
            store.settings[i] = { ...store.settings[i], ...data };
            return store.settings[i];
        },
    },
};

export default prisma;
