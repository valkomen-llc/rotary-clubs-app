import express from 'express';
import { PrismaClient } from '@prisma/client';
import { routeToModel } from '../lib/ai-router.js';
import WhatsAppService from '../services/WhatsAppService.js';
import EmailService from '../services/EmailService.js';

const router = express.Router();
const prisma = new PrismaClient();

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

        // 2. Obtener clubes que necesitan notificación
        // Notificamos si:
        // - El estado es 'active' pero la fecha de expiración está cerca (15, 7, 1 días)
        // - El estado es 'expired' (vencido)
        // - Y no se ha notificado hoy
        const clubs = await prisma.club.findMany({
            where: {
                expirationDate: { not: null },
                OR: [
                    { subscriptionStatus: 'expired' },
                    { 
                        subscriptionStatus: 'active',
                        expirationDate: { lt: new Date(Date.now() + 16 * 24 * 60 * 60 * 1000) } // Menos de 16 días
                    }
                ],
                OR: [
                    { lastNotificationSent: null },
                    { lastNotificationSent: { lt: new Date(Date.now() - 23 * 60 * 60 * 1000) } }
                ]
            }
        });

        console.log(`[CRON] Se encontraron ${clubs.length} clubes para evaluar.`);
        let processedCount = 0;

        for (const club of clubs) {
            const today = new Date();
            const expDate = new Date(club.expirationDate);
            const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
            
            // Determinar si corresponde notificar hoy según el nivel de urgencia
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

            if (!shouldNotify && club.subscriptionStatus !== 'expired') continue;
            if (club.subscriptionStatus === 'expired') urgencyLevel = 'CRÍTICA: PLATAFORMA SUSPENDIDA';

            console.log(`[CRON] Notificando a ${club.name} (Días: ${diffDays}, Nivel: ${urgencyLevel})`);

            // 3. Generar mensaje con IA (Gemini 2.5 Flash)
            let messageContent = '';
            try {
                const systemPrompt = `Eres el "Concierge de Renovaciones" de Rotary ClubPlatform. Tu misión es redactar mensajes diplomáticos, persuasivos y cálidos para que los clubes rotarios renueven su infraestructura digital.
Tono: Institucional, agradecido, resaltando el impacto que su club tiene en la comunidad a través de su sitio web.
Instrucciones: Genera un texto para WhatsApp (con emojis profesionales) y un párrafo para Email. 
NO uses comillas. NO menciones precios específicos (se gestionan en el portal).`;

                const userPrompt = `Club: ${club.name}
Estado: ${urgencyLevel}
Días restantes: ${diffDays < 0 ? 'Vencido hace ' + Math.abs(diffDays) : diffDays}
Link de Pago Seguro: https://${club.domain || club.subdomain + '.rotarylatir.org'}/admin/configuracion
Estructura de respuesta:
WHATSAPP: [Mensaje aquí]
EMAIL: [Mensaje aquí]`;

                const aiOutput = await routeToModel('gemini-2.5-flash', systemPrompt, userPrompt);
                messageContent = aiOutput;
            } catch (err) {
                console.error(`[CRON] Error IA para ${club.name}:`, err.message);
                messageContent = `WHATSAPP: Estimados directivos de ${club.name}, les recordamos amablemente la renovación de su ecosistema digital Rotary ClubPlatform (${urgencyLevel}).\nEMAIL: Les informamos que su suscripción requiere atención inmediata para asegurar la continuidad del servicio.`;
            }

            // Parsear salida de IA
            const waMatch = messageContent.match(/WHATSAPP:\s*([\s\S]*?)(?=EMAIL:|$)/i);
            const emailMatch = messageContent.match(/EMAIL:\s*([\s\S]*)/i);
            
            const waMessage = waMatch ? waMatch[1].trim() : '';
            const emailBody = emailMatch ? emailMatch[1].trim() : '';

            // 4. Rama WhatsApp
            if (club.billingContactPhone && waMessage) {
                const waRes = await WhatsAppService.sendPlatformMessage({
                    to: club.billingContactPhone,
                    message: waMessage
                });
                if (waRes.success) {
                    console.log(`[CRON] WhatsApp enviado a ${club.name}`);
                    await EmailService.logCommunication({
                        clubId: club.id,
                        type: 'whatsapp',
                        recipient: club.billingContactPhone,
                        content: waMessage,
                        status: 'sent',
                        subject: 'Recordatorio de Renovación (SaaS)'
                    });
                }
            }

            // 5. Rama Email
            if (club.billingContactEmail && emailBody) {
                const subject = `📌 Acción Requerida: Renovación de Plataforma - ${club.name}`;
                const html = `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 15px; overflow: hidden;">
                        <div style="background: #013388; color: white; padding: 30px; text-align: center;">
                            <h2 style="margin:0;">Rotary ClubPlatform</h2>
                        </div>
                        <div style="padding: 30px; color: #333; line-height: 1.6;">
                            <h3 style="color: #013388;">${urgencyLevel}</h3>
                            <p>${emailBody.replace(/\n/g, '<br>')}</p>
                            <div style="text-align: center; margin: 40px 0;">
                                <a href="https://${club.domain || club.subdomain + '.rotarylatir.org'}/admin/configuracion" 
                                   style="background: #E29C00; color: white; padding: 15px 30px; text-decoration: none; border-radius: 10px; font-weight: bold;">
                                   Renovar Ahora en mi Panel
                                </a>
                            </div>
                            <p style="font-size: 12px; color: #999;">Este es un mensaje automático del sistema de facturación centralizado de Valkomen LLC para la red rotaria.</p>
                        </div>
                    </div>
                `;
                const emailRes = await EmailService.sendPlatformEmail({
                    to: club.billingContactEmail,
                    subject,
                    html
                });
                if (emailRes.success) {
                    console.log(`[CRON] Email enviado a ${club.name}`);
                }
            }

            // 6. Actualizar registro de notificación
            await prisma.club.update({
                where: { id: club.id },
                data: { lastNotificationSent: new Date() }
            });

            processedCount++;
        }

        res.json({ 
            success: true, 
            processed: processedCount, 
            message: `Procesamiento completado. ${processedCount} clubes notificados.` 
        });

    } catch (error) {
        console.error('[CRON] Error fatal:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
