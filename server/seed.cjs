const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function seed() {
    try {
        // 1. Crear Club Origen si no existe
        let club = await prisma.club.findFirst({
            where: { name: 'Rotary Club Origen' }
        });

        if (!club) {
            club = await prisma.club.create({
                data: {
                    name: 'Rotary Club Origen',
                    city: 'Bogotá',
                    country: 'Colombia',
                    district: '4281',
                    domain: 'localhost',
                    subdomain: 'origen',
                    description: 'Club fundacional del proyecto.',
                    status: 'active'
                }
            });
            console.log('Club Origen creado');
        }

        // 2. Crear Super Admin
        const superAdminEmail = 'admin@rotary-platform.org';
        const superAdminPassword = 'RotaryAdmin2026!';
        const hashedSuperPassword = await bcrypt.hash(superAdminPassword, 10);

        await prisma.user.upsert({
            where: { email: superAdminEmail },
            update: {
                role: 'administrator',
                password: hashedSuperPassword
            },
            create: {
                email: superAdminEmail,
                password: hashedSuperPassword,
                role: 'administrator'
            }
        });
        console.log('Super Admin asegurado');

        // 3. Crear Admin de Club para pruebas
        const clubAdminEmail = 'admin@rotary-origen.org';
        const clubAdminPassword = 'ClubAdmin2026!';
        const hashedClubPassword = await bcrypt.hash(clubAdminPassword, 10);

        await prisma.user.upsert({
            where: { email: clubAdminEmail },
            update: {
                role: 'club_admin',
                password: hashedClubPassword,
                clubId: club.id
            },
            create: {
                email: clubAdminEmail,
                password: hashedClubPassword,
                role: 'club_admin',
                clubId: club.id
            }
        });
        console.log('Admin de Club creado para Origen');

        // 4. Register new clubs requested by user
        const clubsData = [
            { name: "Rotary Pasto", subdomain: "pasto", city: "Pasto", country: "Colombia", district: "4281", status: "active" },
            { name: "Rotary Bogotá Usaquén", subdomain: "usaquen", city: "Bogotá", country: "Colombia", district: "4281", status: "active" },
            { name: "Rotary Armenia International", subdomain: "armenia", city: "Armenia", country: "Colombia", district: "4281", status: "active" },
            { name: "Rotary Buenaventura Pacífico", subdomain: "buenaventura", city: "Buenaventura", country: "Colombia", district: "4281", status: "active" },
            { name: "Rotary Nuevo Cali", subdomain: "nuevocali", city: "Cali", country: "Colombia", district: "4281", status: "active" }
        ];

        for (const data of clubsData) {
            await prisma.club.upsert({
                where: { subdomain: data.subdomain },
                update: data,
                create: data
            });
            console.log(`Club ${data.name} asegurado.`);
        }

    } catch (error) {
        console.error('Error seeding:', error);
    } finally {
        await prisma.$disconnect();
    }
}

seed();
