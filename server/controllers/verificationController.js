import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Lazy load EmailService to avoid loading nodemailer on cold start
let _emailService = null;
const getEmailService = async () => {
    if (!_emailService) {
        const mod = await import('../services/EmailService.js');
        _emailService = mod.default;
    }
    return _emailService;
};

/**
 * Generates a random 6-digit verification code
 */
function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Builds the HTML email template for verification
 */
function buildVerificationEmail(code, clubName) {
    return `
    <div style="font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <div style="text-align: center; margin-bottom: 32px;">
            <div style="display: inline-block; background: #013388; border-radius: 16px; padding: 12px; margin-bottom: 12px;">
                <span style="color: white; font-size: 24px;">✦</span>
            </div>
            <h1 style="color: #111827; font-size: 24px; font-weight: 900; margin: 0;">ClubPlatform</h1>
        </div>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; text-align: center;">
            <h2 style="color: #111827; font-size: 20px; font-weight: 800; margin: 0 0 8px;">Verifica tu correo electrónico</h2>
            <p style="color: #6b7280; font-size: 14px; margin: 0 0 24px;">
                ${clubName ? `Registro del club <strong>${clubName}</strong>` : 'Ingresa este código para completar tu registro'}
            </p>

            <div style="background: white; border: 2px solid #013388; border-radius: 12px; padding: 20px; margin: 0 0 24px;">
                <span style="font-size: 36px; font-weight: 900; letter-spacing: 12px; color: #013388;">${code}</span>
            </div>

            <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                Este código expira en <strong>15 minutos</strong>.<br/>
                Si no solicitaste este código, ignora este correo.
            </p>
        </div>

        <p style="text-align: center; color: #9ca3af; font-size: 11px; margin-top: 24px;">
            © ${new Date().getFullYear()} ClubPlatform — Plataforma digital para Rotary · Por Valkomen LLC
        </p>
    </div>`;
}

/**
 * POST /api/auth/verify-email
 * Body: { email, code }
 */
export const verifyEmail = async (req, res) => {
    const { email, code } = req.body;

    if (!email || !code) {
        return res.status(400).json({ error: 'Email y código son obligatorios' });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
            select: { id: true, verificationCode: true, verificationExpiry: true, emailVerified: true, clubId: true }
        });

        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        if (user.emailVerified) {
            return res.status(200).json({ message: 'El correo ya fue verificado', alreadyVerified: true });
        }

        if (!user.verificationCode || user.verificationCode !== code) {
            return res.status(400).json({ error: 'Código incorrecto' });
        }

        if (user.verificationExpiry && new Date() > new Date(user.verificationExpiry)) {
            return res.status(400).json({ error: 'El código ha expirado. Solicita uno nuevo.' });
        }

        // Mark as verified
        await prisma.user.update({
            where: { id: user.id },
            data: {
                emailVerified: true,
                verificationCode: null,
                verificationExpiry: null,
            }
        });

        // Generate JWT token so user can proceed to onboarding
        const jwtLib = (await import('jsonwebtoken')).default;
        const fullUser = await prisma.user.findUnique({
            where: { id: user.id },
            include: { club: { select: { id: true, name: true, subdomain: true } } }
        });

        const token = jwtLib.sign(
            { id: fullUser.id, email: fullUser.email, role: fullUser.role, clubId: fullUser.clubId },
            process.env.JWT_SECRET || 'rotary_secret_key',
            { expiresIn: '1d' }
        );

        res.json({
            message: 'Correo verificado exitosamente',
            token,
            user: {
                id: fullUser.id,
                email: fullUser.email,
                role: fullUser.role,
                club: fullUser.club
            }
        });

    } catch (error) {
        console.error('[Verify] Error:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
};

/**
 * POST /api/auth/resend-code
 * Body: { email }
 */
export const resendCode = async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email es obligatorio' });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
            select: { id: true, emailVerified: true, clubId: true }
        });

        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        if (user.emailVerified) {
            return res.status(200).json({ message: 'El correo ya fue verificado', alreadyVerified: true });
        }

        // Generate new code
        const code = generateCode();
        const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        await prisma.user.update({
            where: { id: user.id },
            data: { verificationCode: code, verificationExpiry: expiry }
        });

        // Respond first, then send email in background
        res.json({ message: 'Código reenviado exitosamente' });

        // Get club name and send email (fire-and-forget)
        (async () => {
            try {
                let clubName = null;
                if (user.clubId) {
                    const club = await prisma.club.findUnique({ where: { id: user.clubId }, select: { name: true } });
                    clubName = club?.name;
                }

                const EmailSvc = await getEmailService();
                await EmailSvc.sendPlatformEmail({
                    to: email.toLowerCase(),
                    subject: `${code} — Código de verificación | ClubPlatform`,
                    html: buildVerificationEmail(code, clubName),
                });
            } catch (e) {
                console.error('[Verify] Background email send failed:', e);
            }
        })();

    } catch (error) {
        console.error('[Verify] Resend error:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
};

/**
 * Utility: sends verification email for a given user
 * Called from saasController after registration
 */
export const sendVerificationEmail = async (userId) => {
    const code = generateCode();
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    const user = await prisma.user.update({
        where: { id: userId },
        data: { verificationCode: code, verificationExpiry: expiry },
        include: { club: { select: { name: true } } }
    });

    const EmailSvc = await getEmailService();
    const result = await EmailSvc.sendPlatformEmail({
        to: user.email,
        subject: `${code} — Código de verificación | ClubPlatform`,
        html: buildVerificationEmail(code, user.club?.name),
    });

    return result;
};

/**
 * GET /api/platform-config/email  (super admin only)
 * POST /api/platform-config/email (super admin only)
 */
export const getEmailConfig = async (_req, res) => {
    try {
        const keys = ['email_provider', 'email_from', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_from_name', 'smtp_from_email'];
        const configs = await prisma.platformConfig.findMany({ where: { key: { in: keys } } });

        const result = {};
        configs.forEach(c => { result[c.key] = c.value; });

        // Mask password
        if (result.smtp_password) {
            result.smtp_password = '••••••••';
        }

        res.json(result);
    } catch (error) {
        console.error('[PlatformConfig] Get error:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
};

export const updateEmailConfig = async (req, res) => {
    try {
        const allowed = ['email_provider', 'email_from', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_from_name', 'smtp_from_email'];
        const updates = req.body;

        for (const key of Object.keys(updates)) {
            if (!allowed.includes(key)) continue;

            // Skip masked password
            if (key === 'smtp_password' && updates[key] === '••••••••') continue;

            await prisma.platformConfig.upsert({
                where: { key },
                update: { value: updates[key] },
                create: { key, value: updates[key] },
            });
        }

        res.json({ message: 'Configuración actualizada' });
    } catch (error) {
        console.error('[PlatformConfig] Update error:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
};

/**
 * POST /api/platform-config/email/test
 * Sends a test email to verify configuration
 */
export const sendTestEmail = async (req, res) => {
    const { to } = req.body;

    if (!to) {
        return res.status(400).json({ error: 'Dirección de correo es obligatoria' });
    }

    try {
        const EmailSvc = await getEmailService();
        const result = await EmailSvc.sendPlatformEmail({
            to,
            subject: '✅ Email de prueba — ClubPlatform',
            html: `
                <div style="font-family: sans-serif; padding: 24px; text-align: center;">
                    <h2 style="color: #013388;">¡Configuración exitosa!</h2>
                    <p>Este es un correo de prueba desde ClubPlatform.</p>
                    <p style="color: #9ca3af; font-size: 12px;">Enviado: ${new Date().toLocaleString('es-CO')}</p>
                </div>
            `,
        });

        if (!result.success) {
            return res.status(500).json({ error: result.error || 'Error al enviar' });
        }

        res.json({ message: 'Email de prueba enviado' });
    } catch (error) {
        console.error('[PlatformConfig] Test email error:', error);
        res.status(500).json({ error: error.message });
    }
};
