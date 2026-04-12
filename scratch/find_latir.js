import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const club = await prisma.club.findFirst({
    where: {
      OR: [
        { name: { contains: 'LATIR', mode: 'insensitive' } },
        { subdomain: { contains: 'latir', mode: 'insensitive' } }
      ]
    }
  });

  if (!club) {
    console.error('Club not found');
    process.exit(1);
  }

  console.log(JSON.stringify(club, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
