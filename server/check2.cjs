const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUsers() {
  const users = await prisma.user.findMany({
    where: { 
      clubId: '3c648ce7-3c47-41e2-9461-6e40a8615ae6'
    }
  });
  console.log(users.map(u => ({ email: u.email, role: u.role })));
  await prisma.$disconnect();
}
checkUsers();
