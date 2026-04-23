const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debug() {
    console.log('--- DIAGNÓSTICO DE LEADS (Distrito 4271) ---');
    
    // 1. Ver qué clubes pertenecen al distrito 4271
    const district = await prisma.district.findFirst({
        where: { OR: [{ number: 4271 }, { name: { contains: '4271' } }] }
    });
    
    if (!district) {
        console.log('❌ Error: No se encontró el distrito 4271');
        return;
    }
    console.log(`✅ Distrito localizado: ${district.name} (ID: ${district.id})`);

    const clubs = await prisma.club.findMany({
        where: { districtId: district.id },
        select: { id: true, name: true }
    });
    const clubIds = clubs.map(c => c.id);
    console.log(`📍 El distrito tiene ${clubs.length} clubes asociados.`);

    // 2. Ver cuántos Leads hay en total en la tabla
    const leadCount = await prisma.$queryRaw`SELECT COUNT(*) FROM "Lead"`;
    console.log(`📊 Total de Leads en la tabla "Lead":`, leadCount);

    // 3. Ver Leads sin ClubId
    const nullLeads = await prisma.$queryRaw`SELECT COUNT(*) FROM "Lead" WHERE "clubId" IS NULL`;
    console.log(`❓ Leads sin clubId (huérfanos):`, nullLeads);

    // 4. Ver Leads asociados a los clubes del distrito
    if (clubIds.length > 0) {
        const districtLeads = await prisma.$queryRaw`SELECT COUNT(*) FROM "Lead" WHERE "clubId" = ANY(${clubIds})`;
        console.log(`🎯 Leads asociados a los clubes de este distrito:`, districtLeads);
    }

    // 5. Ver una muestra de los últimos 5 leads para ver su estructura
    const sample = await prisma.$queryRaw`SELECT id, name, email, "clubId", source FROM "Lead" ORDER BY "createdAt" DESC LIMIT 5`;
    console.log('📝 Muestra de los últimos 5 Leads:', sample);
}

debug().catch(console.error).finally(() => prisma.$disconnect());
