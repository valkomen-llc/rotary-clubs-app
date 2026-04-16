import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const event = await prisma.event.findUnique({
    where: { id: '2038324a-0e04-497c-9328-fbaeb9ce2992' }
  });
  console.log(event?.htmlContent);
  await prisma.$disconnect();
}
run();
