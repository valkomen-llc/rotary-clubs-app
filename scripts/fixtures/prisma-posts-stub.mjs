// Prisma, en memoria. Sólo lo que el camino de las publicaciones toca.
// El listado, el borrado y el retiro van por `db.query`; esto existe para que
// importar el controlador no arrastre un cliente real.
export const prisma = {
    post: {
        create: async ({ data }) => ({ id: `post-${Math.random().toString(36).slice(2, 8)}`, ...data }),
        update: async ({ where, data }) => ({ ...where, ...data }),
        deleteMany: async () => ({ count: 0 }),
        findMany: async () => [],
    },
};
export default prisma;
