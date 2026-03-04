const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

// Cargar variables de entorno desde el servidor
dotenv.config({ path: path.join(__dirname, 'server', '.env') });

const prisma = new PrismaClient();

async function main() {
    const adminEmail = 'admin@rotary-platform.org';
    const adminPassword = 'RotaryAdmin2026!';

    console.log('--- Iniciando creación de usuario admin en Neon ---');
    console.log(`Email: ${adminEmail}`);

    try {
        const existingAdmin = await prisma.user.findUnique({
            where: { email: adminEmail },
        });

        if (existingAdmin) {
            console.log('✅ El usuario ya existe en la base de datos.');
            return;
        }

        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        await prisma.user.create({
            data: {
                email: adminEmail,
                password: hashedPassword,
                role: 'administrator',
            },
        });

        console.log('🚀 ¡Usuario administrador creado con éxito en Neon!');
    } catch (error) {
        console.error('❌ Error al crear el usuario:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
