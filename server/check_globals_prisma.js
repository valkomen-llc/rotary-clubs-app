import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
    try {
        const posts = await prisma.post.findMany({ where: { clubId: null }, select: { id: true, title: true, published: true } });
        console.log('Global Posts (clubId null):', posts);
        const projects = await prisma.project.findMany({ where: { clubId: null }, select: { id: true, title: true } });
        console.log('Global Projects (clubId null):', projects);

        // Also check the "origen" club
        const origen = await prisma.club.findFirst({ where: { subdomain: 'origen' } });
        if (origen) {
            const origenPosts = await prisma.post.findMany({ where: { clubId: origen.id }, select: { id: true, title: true, published: true } });
            console.log('Origen Posts:', origenPosts);
            const origenProjects = await prisma.project.findMany({ where: { clubId: origen.id }, select: { id: true, title: true } });
            console.log('Origen Projects:', origenProjects);
        } else {
            console.log('No origen club found');
        }
    } catch (e) { console.error(e) }
    await prisma.$disconnect();
}
run();
