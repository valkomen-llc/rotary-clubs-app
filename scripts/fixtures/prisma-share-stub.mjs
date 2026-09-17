// Prisma, sustituido. La auditoría social escribe con Prisma y esta prueba no
// tiene base: sin el doble, cada publicación imprimiría el error de conexión.
//
// ⚠️ Que la auditoría FALLE no puede costar la publicación —va en su propio
// `try`— y eso se comprueba a propósito más abajo, con el doble lanzando.
export let fallar = false;
export const registros = [];
export const settings = [];
export const setFallar = (v) => { fallar = v; };
export const reset = () => { registros.length = 0; settings.length = 0; fallar = false; };

const prisma = {
    socialAuditLog: {
        create: async ({ data }) => {
            if (fallar) throw new Error('la auditoría no está disponible');
            registros.push(data);
            return data;
        },
        findMany: async () => [],
    },
    setting: {
        findFirst: async ({ where = {} }) => {
            const s = settings.find(x => (!where.key || x.key === where.key) && (!where.clubId || x.clubId === where.clubId));
            return s ? { ...s } : null;
        },
        findUnique: async ({ where = {} }) => {
            const s = settings.find(x => (!where.key_clubId || (x.key === where.key_clubId.key && x.clubId === where.key_clubId.clubId)));
            return s ? { ...s } : null;
        },
        upsert: async ({ where = {}, update = {}, create = {} }) => {
            const key = where.key_clubId?.key || create.key;
            const clubId = where.key_clubId?.clubId || create.clubId;
            let idx = settings.findIndex(x => x.key === key && x.clubId === clubId);
            if (idx >= 0) {
                settings[idx] = { ...settings[idx], ...update };
                return settings[idx];
            } else {
                const item = { id: `set-${Date.now()}`, key, clubId, ...create };
                settings.push(item);
                return item;
            }
        },
        update: async ({ where = {}, data = {} }) => {
            const key = where.key_clubId?.key;
            const clubId = where.key_clubId?.clubId;
            let item = settings.find(x => x.key === key && x.clubId === clubId);
            if (item) Object.assign(item, data);
            return item || null;
        },
    },
};
export default prisma;
