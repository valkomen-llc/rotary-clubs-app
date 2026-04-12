const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getClub() {
  const domain = 'app.clubplatform.org';
  const cleanDomain = domain.replace(/^www\./, '');

  let club = await prisma.club.findFirst({
      where: {
          OR: [
              { domain: cleanDomain },
              { subdomain: cleanDomain.split('.')[0] }
          ]
      }
  });
  console.log(club);
  await prisma.$disconnect();
}
getClub();
