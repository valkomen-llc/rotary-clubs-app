
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const globalSettings = await prisma.setting.findMany({
    where: { clubId: null }
  });
  console.log('Global Settings (clubId IS NULL):', globalSettings);
  
  const masterClub = await prisma.club.findFirst({ where: { subdomain: 'origen' } });
  if (masterClub) {
     const masterSettings = await prisma.setting.findMany({ where: { clubId: masterClub.id } });
     console.log('Master Club Settings:', masterSettings.filter(s => s.key === 'logo_header_size'));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
