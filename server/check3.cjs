const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkLatir() {
  const user = await prisma.user.findUnique({
    where: { email: 'admin@rotarylatir.org' },
    include: { club: true }
  });
  console.log('LATIR User:', { email: user?.email, role: user?.role, clubId: user?.clubId, clubSubdomain: user?.club?.subdomain, clubType: user?.club?.type, clubName: user?.club?.name });
  
  await prisma.$disconnect();
}
checkLatir();
