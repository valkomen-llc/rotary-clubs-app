import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
    const cfg = await prisma.platformConfig.findMany();
    console.log(cfg);
}
run();
