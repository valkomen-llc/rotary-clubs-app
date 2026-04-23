import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => {
  return new PrismaClient();
};

const globalForPrisma = global;
const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default {
  query: async (text, params) => {
    // Fallback for legacy raw queries if needed, but Prisma should be used
    return prisma.$queryRawUnsafe(text.replace(/\$\d/g, '?'), ...(params || []))
      .then(rows => ({ rows }));
  },
  prisma
};
