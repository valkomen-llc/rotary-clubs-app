import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import VercelService from '../services/VercelService.js';

const prisma = new PrismaClient();

export const autoRegisterClub = async (req, res) => {
    const { clubName, country, district, adminName, adminEmail, adminPassword, subdomain } = req.body;

    try {
        // Validate required fields
        if (!clubName || !country || !district || !adminName || !adminEmail || !adminPassword || !subdomain) {
            return res.status(400).json({ error: 'Todos los campos son obligatorios' });
        }

        // Validate subdomain uniqueness
        const existingSubdomain = await prisma.club.findFirst({
            where: { subdomain: subdomain.toLowerCase() }
        });

        if (existingSubdomain) {
            return res.status(400).json({ error: 'El subdominio ya está en uso' });
        }

        // Validate email uniqueness
        const existingUser = await prisma.user.findUnique({
            where: { email: adminEmail.toLowerCase() }
        });

        if (existingUser) {
            return res.status(400).json({ error: 'El correo electrónico ya está registrado' });
        }

        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        // 1. Validaciones
        const cleanSubdomain = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '');
        const fullDomain = `${cleanSubdomain}.clubplatform.org`;

        // Create Club and Admin User in a single transaction
        const result = await prisma.$transaction(async (tx) => {
            // 1. Create Club
            const newClub = await tx.club.create({
                data: {
                    name: clubName,
                    country,
                    district,
                    domain: fullDomain,
                    subdomain: subdomain.toLowerCase(),
                    description: `Página oficial del club rotario ${clubName}`,
                    status: 'draft'       // Private until admin publishes
                }
            });

            // 2. Create Admin User connected to this club
            const newAdmin = await tx.user.create({
                data: {
                    name: adminName,
                    email: adminEmail.toLowerCase(),
                    password: hashedPassword,
                    role: 'administrator',
                    clubId: newClub.id
                }
            });

            // 3. Create default settings
            const defaultSettings = [
                { key: 'color_primary', value: '#013388', clubId: newClub.id },
                { key: 'color_secondary', value: '#E29C00', clubId: newClub.id },
                { key: 'contact_email', value: adminEmail.toLowerCase(), clubId: newClub.id },
                { key: 'onboarding_completed', value: 'false', clubId: newClub.id },
                { key: 'onboarding_step', value: '1', clubId: newClub.id },
            ];

            await tx.setting.createMany({
                data: defaultSettings
            });

            return { club: newClub, admin: newAdmin };
        });

        // Try Vercel auto-provision in the background (non-blocking)
        try {
            if (!fullDomain.includes('clubplatform.org')) {
                await VercelService.addDomain(fullDomain);
            } else {
                console.log('Skipping Vercel provisioning for production domain:', fullDomain);
            }
        } catch (vercelError) {
            console.error('Initial Vercel Domain Setup Failed (Soft Warning):', vercelError);
        }

        res.status(201).json({
            message: 'Club creado exitosamente',
            club: result.club
        });

    } catch (error) {
        console.error('Error auto-registering club:', error);
        res.status(500).json({ error: 'Error del servidor al registrar el club' });
    }
};
