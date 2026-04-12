import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const media = await prisma.media.findMany({ select: { filename: true, clubId: true }, take: 10, orderBy: { createdAt: 'desc' } });
  console.log(media);
}
run();
