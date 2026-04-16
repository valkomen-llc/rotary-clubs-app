
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const masterClub = await prisma.club.findFirst({
    where: { subdomain: 'origen' }
  });
  console.log('Master Club:', masterClub);
  
  const allClubs = await prisma.club.findMany({
    select: { id: true, name: true, subdomain: true, type: true }
  });
  console.log('All Clubs:', allClubs);
}

main().catch(console.error).finally(() => prisma.$disconnect());
