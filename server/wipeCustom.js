import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({ where: { email: 'test@valkomen.com' } });
  if (!user) { console.log('User not found'); return; }
  
  const club = await prisma.club.findFirst({ where: { ownerId: user.id } });
  if (!club || !club.settings) { console.log('Club or settings not found'); return; }
  
  let settings = club.settings;
  if (typeof settings === 'string') settings = JSON.parse(settings);
  
  if (settings.siteImages) {
    if (settings.siteImages.hero) {
      delete settings.siteImages.hero;
    }
    if (settings.siteImages.causes) {
      delete settings.siteImages.causes;
    }
    
    await prisma.club.update({
      where: { id: club.id },
      data: { settings }
    });
    console.log('✅ Custom hero and causes deleted for test@valkomen.com. Defaults will now show!');
  } else {
    console.log('No siteImages saved for this club.');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
