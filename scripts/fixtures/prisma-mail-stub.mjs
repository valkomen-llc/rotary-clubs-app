// Prisma, en memoria. Sólo lo que el camino del envío toca.
export const state = { accounts: [], clubs: [], platformConfig: [], notif: [], logs: [] };
export const reset = () => { state.accounts = []; state.clubs = []; state.platformConfig = []; state.notif = []; state.logs = []; };

const casa = (row, where = {}) => Object.entries(where).every(([k, v]) =>
    (v && typeof v === 'object' && 'in' in v) ? v.in.includes(row[k])
        : (v && typeof v === 'object') ? Object.entries(v).every(([kk, vv]) => row[k] && row[k][kk] === vv)
            : row[k] === v);

export const prisma = {
    emailAccount: {
        findUnique: async ({ where }) => state.accounts.find(a => casa(a, where)) || null,
        findMany: async ({ where } = {}) => state.accounts.filter(a => casa(a, where || {})),
    },
    club: { findUnique: async ({ where }) => state.clubs.find(c => casa(c, where)) || null },
    platformConfig: {
        findUnique: async ({ where }) => state.platformConfig.find(c => casa(c, where)) || null,
        findMany: async ({ where }) => state.platformConfig.filter(c => (where?.key?.in || []).includes(c.key)),
    },
    notificationConfig: {
        findUnique: async ({ where }) => state.notif.find(n => n.clubId === where?.type_clubId?.clubId) || null,
        findFirst: async () => state.notif[0] || null,
    },
    communicationLog: { create: async ({ data }) => { state.logs.push(data); return data; } },
    district: { findUnique: async () => null },
};
export default prisma;
