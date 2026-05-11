import express from 'express';
import { PrismaClient } from '@prisma/client';
import { routeToModel } from '../lib/ai-router.js';
import WhatsAppService from '../services/WhatsAppService.js';
import EmailService from '../services/EmailService.js';
import { executePost } from '../controllers/contentStudioController.js';

const router = express.Router();
const prisma = new PrismaClient();

// Vercel Cron: /api/cron/process-scheduled-posts
// Publica los ScheduledPost cuyo scheduledFor ya llegó.
router.get('/process-scheduled-posts', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return res.status(401).json({ error: 'Unauthorized cron trigger' });
        }

        const due = await prisma.scheduledPost.findMany({
            where: {
                status: 'scheduled',
                scheduledFor: { lte: new Date() }
            },
            take: 25
        });

        const results = [];
        for (const post of due) {
            try {
                const result = await executePost(post.id);
                results.push({ id: post.id, success: result?.success ?? true });
            } catch (err) {
                results.push({ id: post.id, success: false, error: err.message });
            }
        }

        res.json({ processed: results.length, results });
    } catch (error) {
        console.error('[CRON scheduled-posts] error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Vercel Cron endpoint: /api/cron/process-expirations
// Se ejecuta diariamente para alertar sobre renovaciones de SaaS
router.get('/process-expirations', async (req, res) => {
    try {
        // 1. Validación de seguridad de Vercel Cron
        const authHeader = req.headers.authorization;
        if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            console.warn('[CRON] Intento de acceso no autorizado');
            return res.status(401).json({ error: 'Unauthorized cron trigger' });
        }

        console.log('[CRON] 🚀 Iniciando procesamiento de expiraciones de suscripción...');
        
        const gracePeriodDays = 5;
        const suspensionDate = new Date();
        suspensionDate.setDate(suspensionDate.getDate() - gracePeriodDays);

        // 1.5 SUSPENSIÓN AUTOMÁTICA (Clubs y Distritos)
        const [suspensionClubs, suspensionDistricts] = await Promise.all([
            prisma.club.updateMany({
                where: { status: 'active', expirationDate: { not: null, lt: suspensionDate } },
                data: { status: 'inactive', subscriptionStatus: 'expired' }
            }),
            prisma.district.updateMany({
                where: { status: 'active', expirationDate: { not: null, lt: suspensionDate } },
                data: { status: 'inactive', subscriptionStatus: 'expired' }
            })
        ]);

        if (suspensionClubs.count > 0 || suspensionDistricts.count > 0) {
            console.log(`[CRON] 🚨 SUSPENSIÓN AUTOMÁTICA: ${suspensionClubs.count} clubes y ${suspensionDistricts.count} distritos pasados a inactivos.`);
        }

        // 2. Obtener Entidades (Clubs y Distritos) para evaluar
        const [clubs, districts] = await Promise.all([
            prisma.club.findMany({
                where: {
                    expirationDate: { not: null },
                    OR: [ { subscriptionStatus: 'expired' }, { subscriptionStatus: 'active', expirationDate: { lt: new Date(Date.now() + 16 * 24 * 60 * 60 * 1000) } } ],
                    OR: [ { lastNotificationSent: null }, { lastNotificationSent: { lt: new Date(Date.now() - 23 * 60 * 60 * 1000) } } ]
                }
            }),
            prisma.district.findMany({
                where: {
                    expirationDate: { not: null },
                    OR: [ { subscriptionStatus: 'expired' }, { subscriptionStatus: 'active', expirationDate: { lt: new Date(Date.now() + 16 * 24 * 60 * 60 * 1000) } } ],
                    OR: [ { lastNotificationSent: null }, { lastNotificationSent: { lt: new Date(Date.now() - 23 * 60 * 60 * 1000) } } ]
                }
            })
        ]);

        const allEntities = [
            ...clubs.map(c => ({ ...c, entityType: 'club' })),
            ...districts.map(d => ({ ...d, entityType: 'district', name: d.name || `Distrito ${d.number}` }))
        ];

        console.log(`[CRON] Se encontraron ${allEntities.length} entidades para evaluar (${clubs.length} clubes, ${districts.length} distritos).`);
        let processedCount = 0;

        for (const entity of allEntities) {
            const today = new Date();
            const expDate = new Date(entity.expirationDate);
            const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
            
            let shouldNotify = false;
            let urgencyLevel = '';

            if (diffDays <= 0) {
                shouldNotify = true;
                urgencyLevel = 'CRÍTICA: PLATAFORMA VENCIDA';
            } else if (diffDays === 1) {
                shouldNotify = true;
                urgencyLevel = 'URGENTE: VENCE MAÑANA';
            } else if (diffDays === 7) {
                shouldNotify = true;
                urgencyLevel = 'PREVENTIVA: 1 SEMANA';
            } else if (diffDays === 15) {
                shouldNotify = true;
                urgencyLevel = 'AVISO: 15 DÍAS';
            }

            if (!shouldNotify && entity.subscriptionStatus !== 'expired') continue;
            if (entity.subscriptionStatus === 'expired') urgencyLevel = 'CRÍTICA: PLATAFORMA SUSPENDIDA';

            console.log(`[CRON] Notificando a ${entity.entityType === 'club' ? 'Club' : 'Distrito'} ${entity.name} (Días: ${diffDays}, Nivel: ${urgencyLevel})`);

            // 3. Generar mensaje con IA
            let messageContent = '';
            try {
                const isDistrict = entity.entityType === 'district';
                const systemPrompt = `Eres el "Concierge de Renovaciones" de Rotary ClubPlatform. Tu misión es redactar mensajes diplomáticos, persuasivos y cálidos para que los ${isDistrict ? 'distritos' : 'clubes'} rotarios renueven su infraestructura digital.
Tono: Institucional, agradecido, resaltando el impacto que su ${isDistrict ? 'distrito' : 'club'} tiene en la comunidad a través de su sitio web.
Instrucciones: Genera un texto para WhatsApp (con emojis profesionales) y un párrafo para Email. 
NO uses comillas. NO menciones precios específicos.`;

                const userPrompt = `${isDistrict ? 'Distrito' : 'Club'}: ${entity.name}
Estado: ${urgencyLevel}
Días restantes: ${diffDays < 0 ? 'Vencido hace ' + Math.abs(diffDays) : diffDays}
Link de Pago Seguro: https://${entity.domain || entity.subdomain + (isDistrict ? '.distrito.rotarylatir.org' : '.rotarylatir.org')}/admin/configuracion
Estructura de respuesta:
WHATSAPP: [Mensaje aquí]
EMAIL: [Mensaje aquí]`;

                const aiOutput = await routeToModel('gemini-2.5-flash', systemPrompt, userPrompt);
                messageContent = aiOutput;
            } catch (err) {
                messageContent = `WHATSAPP: Estimados directivos de ${entity.name}, les recordamos la renovación de su plataforma digital (${urgencyLevel}).\nEMAIL: Les informamos que su suscripción requiere atención para asegurar la continuidad.`;
            }

            const waMatch = messageContent.match(/WHATSAPP:\s*([\s\S]*?)(?=EMAIL:|$)/i);
            const emailMatch = messageContent.match(/EMAIL:\s*([\s\S]*)/i);
            const waMessage = waMatch ? waMatch[1].trim() : '';
            const emailBody = emailMatch ? emailMatch[1].trim() : '';

            // 4. WhatsApp
            if (entity.billingContactPhone && waMessage) {
                const waRes = await WhatsAppService.sendPlatformMessage({
                    to: entity.billingContactPhone,
                    message: waMessage
                });
                if (waRes.success) {
                    await EmailService.logCommunication({
                        clubId: entity.entityType === 'club' ? entity.id : null,
                        districtId: entity.entityType === 'district' ? entity.id : null,
                        type: 'whatsapp',
                        recipient: entity.billingContactPhone,
                        content: waMessage,
                        status: 'sent',
                        subject: 'Recordatorio de Renovación (SaaS)'
                    });
                }
            }

            // 5. Email
            if (entity.billingContactEmail && emailBody) {
                const subject = `📌 Acción Requerida: Renovación de Plataforma - ${entity.name}`;
                const html = `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 15px; overflow: hidden;">
                        <div style="background: #013388; color: white; padding: 30px; text-align: center;">
                            <h2 style="margin:0;">Rotary ClubPlatform</h2>
                        </div>
                        <div style="padding: 30px; color: #333; line-height: 1.6;">
                            <h3 style="color: #013388;">${urgencyLevel}</h3>
                            <p>${emailBody.replace(/\n/g, '<br>')}</p>
                            <div style="text-align: center; margin: 40px 0;">
                                <a href="https://${entity.domain || entity.subdomain + (entity.entityType === 'district' ? '.distrito.rotarylatir.org' : '.rotarylatir.org')}/admin/configuracion" 
                                   style="background: #E29C00; color: white; padding: 15px 30px; text-decoration: none; border-radius: 10px; font-weight: bold;">
                                   Renovar Ahora en mi Panel
                                </a>
                            </div>
                            <p style="font-size: 12px; color: #999;">Este es un mensaje automático del sistema de facturación centralizado de Valkomen LLC.</p>
                        </div>
                    </div>
                `;
                await EmailService.sendPlatformEmail({ to: entity.billingContactEmail, subject, html });
            }

            // 6. Actualizar registro
            if (entity.entityType === 'club') {
                await prisma.club.update({ where: { id: entity.id }, data: { lastNotificationSent: new Date() } });
            } else {
                await prisma.district.update({ where: { id: entity.id }, data: { lastNotificationSent: new Date() } });
            }

            processedCount++;
        }

        res.json({ success: true, processed: processedCount, message: `Completado. ${processedCount} entidades notificadas.` });

    } catch (error) {
        console.error('[CRON] Error fatal:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
