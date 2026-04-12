const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const user = await prisma.user.findUnique({
    where: { email: 'admin@rotarylatir.org' },
    include: { club: true }
  });
  console.log(user);
  await prisma.$disconnect();
}
check();
