// Prisma, en memoria. Sólo `emailAccount`, que es lo que el camino toca.
// Honra el `where` que le pasan —eso es plomería, no criterio—: quién puede
// borrar qué lo decide `bulkPlan` en el controlador.
export const state = { accounts: [] };
export const reset = () => { state.accounts = []; };

const casa = (row, where = {}) =>
    Object.entries(where).every(([k, v]) => (v && typeof v === 'object' && 'in' in v ? v.in.includes(row[k]) : row[k] === v));

const pick = (row, select) => {
    if (!select) return { ...row };
    const out = {};
    for (const k of Object.keys(select)) if (select[k]) out[k] = row[k];
    return out;
};

export const prisma = {
    emailAccount: {
        findUnique: async ({ where }) => state.accounts.find(a => a.id === where.id) || null,
        findMany: async ({ where, select } = {}) => state.accounts.filter(a => casa(a, where)).map(a => pick(a, select)),
        update: async ({ where, data }) => {
            const a = state.accounts.find(x => x.id === where.id);
            if (!a) throw new Error('no existe');
            Object.assign(a, data);
            return { ...a };
        },
        delete: async ({ where }) => {
            const i = state.accounts.findIndex(x => x.id === where.id);
            if (i < 0) throw new Error('no existe');
            return state.accounts.splice(i, 1)[0];
        },
        create: async ({ data }) => { const a = { id: `acc-${state.accounts.length + 1}`, ...data }; state.accounts.push(a); return a; },
    },
};
export default prisma;
