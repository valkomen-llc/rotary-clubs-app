import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();
const STRIPE_PAYMENT_LINK = 'https://buy.stripe.com/4gMfZh6RVdxS0NG5BS2cg03';

// Vercel Cron endpoint: /api/cron/process-expirations
router.get('/process-expirations', async (req, res) => {
    try {
        // Validación de seguridad de Vercel Cron
        const authHeader = req.headers.authorization;
        if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            console.warn('[CRON] Intento de acceso no autorizado');
            return res.status(401).json({ error: 'Unauthorized cron trigger' });
        }

        console.log('[CRON] Iniciando procesamiento de expiraciones de suscripción...');

        // 1. Obtener clubes vencidos o por vencer
        // Filtramos para NO enviar notificaciones duplicadas en las últimas 24 horas
        const clubsToProcess = await prisma.club.findMany({
            where: {
                OR: [
                    { subscriptionStatus: 'pending_renewal' },
                    { subscriptionStatus: 'expired' }
                ],
                OR: [
                    { lastNotificationSent: null },
                    { lastNotificationSent: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
                ]
            }
        });

        console.log(`[CRON] Se encontraron ${clubsToProcess.length} clubes para evaluar.`);
        let processed = 0;

        for (const club of clubsToProcess) {
            console.log(`- Evaluando club: ${club.name} (${club.subscriptionStatus})`);
            
            if (!club.billingContactPhone) {
                console.log(`⚠️ El club ${club.name} no tiene billingContactPhone. Omitiendo.`);
                continue;
            }

            // 2. Lógica de IA para redactar el mensaje persuasivo
            let messageBody = '';
            try {
                // Inyectamos el ID del club en la URL para que el webhook lo detecte automáticamente
                const dynamicPaymentLink = `${STRIPE_PAYMENT_LINK}?client_reference_id=${club.id}`;
                
                const prompt = `Eres el Account Manager Ejecutivo de Rotary ClubPlatform. Debes redactar un mensaje corto, persuasivo y muy diplomático por WhatsApp para recordar la renovación de la plataforma tecnológica del club "${club.name}". 
Estado actual de la plataforma: ${club.subscriptionStatus === 'expired' ? 'VENCIDA (requiere pago urgente)' : 'POR VENCER (aviso preventivo)'}.
Tono: Institucional, amable, agradeciendo su continua labor rotaria.
El enlace para realizar el pago de renovación es este: ${dynamicPaymentLink}
Instrucciones críticas: NO uses comillas al principio ni al final. Genera SOLO el mensaje directo que le llegará por WhatsApp a la junta directiva. Usa emojis profesionales sin exagerar.`;

                const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
                    body: JSON.stringify({
                        model: 'gpt-4-turbo-preview',
                        messages: [{ role: 'system', content: prompt }],
                        max_tokens: 300,
                        temperature: 0.7
                    })
                });
                
                if (!aiRes.ok) throw new Error('OpenAI API falló en la respuesta');
                const aiData = await aiRes.json();
                messageBody = aiData.choices?.[0]?.message?.content?.trim();
            } catch (err) {
                console.error(`Error generando IA para ${club.name}:`, err.message);
                // Fallback estático en caso de que OpenAI falle
                messageBody = `Estimados directivos de ${club.name},\n\nLe recordamos amablemente que la infraestructura en la nube de su sitio web Rotary ClubPlatform se encuentra en proceso de renovación.\n\nPuede asegurar el funcionamiento ininterrumpido de su ecosistema digital realizando el aporte correspondiente en el siguiente enlace seguro:\n${STRIPE_PAYMENT_LINK}\n\nGracias por su compromiso y por seguir creando esperanza en el mundo. ⚙️🌐`;
            }

            // 3. Lógica de envío de WhatsApp (Meta Graph API)
            try {
                // NOTA: Para notificaciones del sistema de la plataforma maestra hacia los clubes,
                // usamos las credenciales maestras de Valkomen.
                const masterPhoneId = process.env.WA_MASTER_PHONE_ID; 
                const masterToken = process.env.WA_MASTER_ACCESS_TOKEN; 
                
                if (masterPhoneId && masterToken && messageBody) {
                    const waResponse = await fetch(`https://graph.facebook.com/v21.0/${masterPhoneId}/messages`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${masterToken}`,
                        },
                        body: JSON.stringify({
                            messaging_product: 'whatsapp',
                            to: club.billingContactPhone,
                            type: 'text',
                            text: { body: messageBody },
                        }),
                    });

                    if (waResponse.ok) {
                        console.log(`✅ WhatsApp enviado a ${club.name}`);
                        
                        // Actualizamos la base de datos para no volver a notificar hoy
                        await prisma.club.update({
                            where: { id: club.id },
                            data: { lastNotificationSent: new Date() }
                        });
                        processed++;
                    } else {
                        const errText = await waResponse.text();
                        console.error(`❌ Error Meta API enviando a ${club.name}:`, errText);
                    }
                } else {
                    console.log(`⚠️ Faltan credenciales maestras de WhatsApp (WA_MASTER_PHONE_ID) para notificar a ${club.name}`);
                }
            } catch (waErr) {
                console.error(`❌ Error en fetch WhatsApp para ${club.name}:`, waErr.message);
            }
        }

        res.json({ success: true, processedCount: processed, message: 'Cron Job finalizado' });
    } catch (error) {
        console.error('[CRON] Error procesando expiraciones:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
