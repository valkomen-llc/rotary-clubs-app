import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const posts = await prisma.post.findMany();
  
  for (const post of posts) {
    if (post.content.includes('&nbsp;') || post.content.includes('\u00A0')) {
      console.log(`Cleaning post: ${post.id}`);
      const cleanContent = post.content
        .replace(/&nbsp;/g, ' ')
        .replace(/\u00A0/g, ' ');
        
      await prisma.post.update({
        where: { id: post.id },
        data: { content: cleanContent }
      });
    }
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
