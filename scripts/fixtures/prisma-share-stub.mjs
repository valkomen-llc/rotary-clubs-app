// Prisma, sustituido. La auditoría social escribe con Prisma y esta prueba no
// tiene base: sin el doble, cada publicación imprimiría el error de conexión.
//
// ⚠️ Que la auditoría FALLE no puede costar la publicación —va en su propio
// `try`— y eso se comprueba a propósito más abajo, con el doble lanzando.
export let fallar = false;
export const registros = [];
export const setFallar = (v) => { fallar = v; };
export const reset = () => { registros.length = 0; fallar = false; };

const prisma = {
    socialAuditLog: {
        create: async ({ data }) => {
            if (fallar) throw new Error('la auditoría no está disponible');
            registros.push(data);
            return data;
        },
        findMany: async () => [],
    },
};
export default prisma;
