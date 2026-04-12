const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTulua() {
  const users = await prisma.user.findMany({
    where: { 
      club: { city: 'Tulua' }
    },
    include: { club: true }
  });
  console.log(users.map(u => ({ email: u.email, clubName: u.club.name, clubSubdomain: u.club.subdomain })));
  
  const allClubs = await prisma.club.findMany({
    where: { name: { contains: 'Tulua' } }
  });
  console.log("Clubs with Tulua:", allClubs.map(c => ({ name: c.name, subdomain: c.subdomain })));
  await prisma.$disconnect();
}
checkTulua();
