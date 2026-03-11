import express from 'express';
import db from '../lib/db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// ── Agent-to-area mapping ─────────────────────────────────────────────────
const AGENT_AREAS = [
    {
        name: 'Diana', area: 'Identidad Institucional',
        check: async (clubId) => {
            const club = await db.query(
                `SELECT name, logo, favicon, domain FROM "Club" WHERE id = $1`, [clubId]
            );
            const settings = await db.query(
                `SELECT key, value FROM "Setting" WHERE "clubId" = $1 AND key IN ('contact_email','contact_phone','contact_address','color_primary','color_secondary')`, [clubId]
            );
            const c = club.rows[0] || {};
            const s = {};
            settings.rows.forEach(r => { s[r.key] = r.value; });
            const fields = [c.name, c.logo, c.favicon, s.contact_email, s.contact_phone, s.contact_address, s.color_primary, s.color_secondary];
            const filled = fields.filter(Boolean).length;
            const total = fields.length;
            const missing = [];
            if (!c.logo) missing.push('logo del club');
            if (!c.favicon) missing.push('favicon');
            if (!s.contact_email) missing.push('email de contacto');
            if (!s.color_primary) missing.push('colores de marca');
            return { pct: Math.round((filled / total) * 100), missing };
        },
        messages: {
            low: 'Tu identidad institucional necesita atención. Puedo ayudarte a configurar logo, colores y datos de contacto.',
            mid: 'Vas bien con la identidad del club. Faltan algunos detalles por completar.',
            high: '¡Excelente! La identidad institucional de tu club está casi completa.',
        }
    },
    {
        name: 'Martín', area: 'Presencia Digital',
        check: async (clubId) => {
            const settings = await db.query(
                `SELECT key, value FROM "Setting" WHERE "clubId" = $1 AND key IN ('social_links','seo_title','seo_description','google_analytics')`, [clubId]
            );
            const s = {};
            settings.rows.forEach(r => { s[r.key] = r.value; });
            const socials = s.social_links ? JSON.parse(s.social_links) : [];
            const hasSocials = socials.length > 0;
            const fields = [hasSocials, s.seo_title, s.seo_description, s.google_analytics];
            const filled = fields.filter(Boolean).length;
            const missing = [];
            if (!hasSocials) missing.push('redes sociales');
            if (!s.seo_title) missing.push('título SEO');
            if (!s.seo_description) missing.push('descripción SEO');
            return { pct: Math.round((filled / fields.length) * 100), missing };
        },
        messages: {
            low: 'Tu presencia digital necesita trabajo. Configuremos redes sociales y SEO para atraer más visitantes.',
            mid: 'La presencia digital va mejorando. Aún podemos optimizar algunos aspectos.',
            high: '¡Bien hecho! Tu presencia digital está bien configurada.',
        }
    },
    {
        name: 'Camila', area: 'Galería y Medios',
        check: async (clubId) => {
            const media = await db.query(`SELECT COUNT(*) FROM "Media" WHERE "clubId" = $1`, [clubId]);
            const count = parseInt(media.rows[0].count);
            const pct = count >= 10 ? 100 : count >= 5 ? 70 : count >= 1 ? 40 : 0;
            const missing = [];
            if (count < 1) missing.push('fotos del club');
            if (count < 5) missing.push('más imágenes para la galería');
            return { pct, missing };
        },
        messages: {
            low: 'Tu galería está vacía. ¡Subamos fotos de proyectos y eventos para darle vida al sitio!',
            mid: 'Ya tienes imágenes. Agreguemos más fotos para una galería impactante.',
            high: '¡Galería completa! Tu contenido visual está listo para impresionar.',
        }
    },
    {
        name: 'Rafael', area: 'Contenido Editorial',
        check: async (clubId) => {
            const posts = await db.query(`SELECT COUNT(*) FROM "Post" WHERE "clubId" = $1`, [clubId]);
            const projects = await db.query(`SELECT COUNT(*) FROM "Project" WHERE "clubId" = $1`, [clubId]);
            const postCount = parseInt(posts.rows[0].count);
            const projCount = parseInt(projects.rows[0].count);
            const hasP = postCount > 0;
            const hasPj = projCount > 0;
            const pct = (hasP && hasPj) ? (postCount >= 3 && projCount >= 2 ? 100 : 70) : (hasP || hasPj) ? 40 : 0;
            const missing = [];
            if (!hasP) missing.push('noticias o artículos');
            if (!hasPj) missing.push('proyectos de servicio');
            return { pct, missing };
        },
        messages: {
            low: 'No hay contenido editorial aún. Puedo redactar noticias y describir proyectos de servicio.',
            mid: 'Buen inicio con el contenido. Sigamos creando más artículos e historias de impacto.',
            high: '¡El contenido editorial está genial! Historias y proyectos bien documentados.',
        }
    },
    {
        name: 'Valentina', area: 'Diseño Visual',
        check: async (clubId) => {
            const club = await db.query(`SELECT logo, favicon FROM "Club" WHERE id = $1`, [clubId]);
            const settings = await db.query(
                `SELECT key, value FROM "Setting" WHERE "clubId" = $1 AND key IN ('color_primary','color_secondary','hero_banner','logo_header_size')`, [clubId]
            );
            const c = club.rows[0] || {};
            const s = {};
            settings.rows.forEach(r => { s[r.key] = r.value; });
            const fields = [c.logo, c.favicon, s.color_primary, s.color_secondary, s.hero_banner];
            const filled = fields.filter(Boolean).length;
            const missing = [];
            if (!c.favicon) missing.push('favicon personalizado');
            if (!s.hero_banner) missing.push('banner principal');
            if (!s.color_primary) missing.push('paleta de colores');
            return { pct: Math.round((filled / fields.length) * 100), missing };
        },
        messages: {
            low: 'El diseño visual necesita personalización. Te ayudo con colores, banner y favicon.',
            mid: 'El diseño va tomando forma. Ajustemos los últimos detalles visuales.',
            high: '¡Diseño visual impecable! Tu sitio se ve profesional.',
        }
    },
    {
        name: 'Santiago', area: 'Configuración Web',
        check: async (clubId) => {
            const club = await db.query(`SELECT domain, subdomain FROM "Club" WHERE id = $1`, [clubId]);
            const c = club.rows[0] || {};
            const hasDomain = c.domain && c.domain !== c.subdomain + '.clubplatform.org';
            const sections = await db.query(`SELECT COUNT(*) FROM "Section" WHERE "clubId" = $1`, [clubId]);
            const secCount = parseInt(sections.rows[0].count);
            const fields = [c.subdomain, hasDomain, secCount > 0, secCount >= 3];
            const filled = fields.filter(Boolean).length;
            const missing = [];
            if (!hasDomain) missing.push('dominio personalizado');
            if (secCount < 3) missing.push('más secciones del sitio');
            return { pct: Math.round((filled / fields.length) * 100), missing };
        },
        messages: {
            low: 'La configuración web está pendiente. Configuremos dominio y secciones del sitio.',
            mid: 'La web va bien. Algunas configuraciones adicionales mejorarían la experiencia.',
            high: '¡Configuración web completa! Tu sitio está bien estructurado.',
        }
    },
    {
        name: 'Lucía', area: 'CRM y Datos',
        check: async (clubId) => {
            let leadCount = 0;
            try {
                const leads = await db.query(`SELECT COUNT(*) FROM "Lead" WHERE "clubId" = $1`, [clubId]);
                leadCount = parseInt(leads.rows[0].count);
            } catch (_) { }
            const settings = await db.query(
                `SELECT key FROM "Setting" WHERE "clubId" = $1 AND key IN ('newsletter_active','contact_form_active')`, [clubId]
            );
            const hasNewsletter = settings.rows.some(r => r.key === 'newsletter_active');
            const hasForm = settings.rows.some(r => r.key === 'contact_form_active');
            const fields = [leadCount > 0, leadCount >= 5, hasNewsletter, hasForm];
            const filled = fields.filter(Boolean).length;
            const missing = [];
            if (leadCount === 0) missing.push('contactos registrados');
            if (!hasNewsletter) missing.push('newsletter');
            return { pct: Math.round((filled / fields.length) * 100), missing };
        },
        messages: {
            low: 'El CRM está sin datos. Activemos formularios de contacto y captación de leads.',
            mid: 'Ya tienes algunos contactos. Sigamos creciendo la base de datos.',
            high: '¡Excelente gestión de contactos! El CRM está funcionando bien.',
        }
    },
    {
        name: 'Andrés', area: 'Comunidad y Eventos',
        check: async (clubId) => {
            const events = await db.query(`SELECT COUNT(*) FROM "CalendarEvent" WHERE "clubId" = $1`, [clubId]);
            let faqCount = 0;
            try {
                const faqs = await db.query(`SELECT COUNT(*) FROM "FAQ" WHERE "clubId" = $1`, [clubId]);
                faqCount = parseInt(faqs.rows[0].count);
            } catch (_) { }
            const evCount = parseInt(events.rows[0].count);
            const fields = [evCount > 0, evCount >= 3, faqCount > 0, faqCount >= 3];
            const filled = fields.filter(Boolean).length;
            const missing = [];
            if (evCount === 0) missing.push('eventos en el calendario');
            if (faqCount === 0) missing.push('preguntas frecuentes');
            return { pct: Math.round((filled / fields.length) * 100), missing };
        },
        messages: {
            low: 'No hay eventos ni FAQs. Creemos un calendario activo y resolvamos dudas frecuentes.',
            mid: 'La comunidad va creciendo. Más eventos y FAQs aumentarán el engagement.',
            high: '¡Comunidad activa! Eventos y FAQs bien configurados.',
        }
    },
    {
        name: 'Isabel', area: 'Relaciones Públicas',
        check: async (clubId) => {
            const posts = await db.query(`SELECT COUNT(*) FROM "Post" WHERE "clubId" = $1 AND type = 'press'`, [clubId]);
            const postCount = parseInt(posts.rows[0].count);
            const settings = await db.query(
                `SELECT key FROM "Setting" WHERE "clubId" = $1 AND key IN ('media_kit_url','press_contact_email')`, [clubId]
            );
            const hasKit = settings.rows.some(r => r.key === 'media_kit_url');
            const hasPress = settings.rows.some(r => r.key === 'press_contact_email');
            const fields = [postCount > 0, postCount >= 2, hasKit, hasPress];
            const filled = fields.filter(Boolean).length;
            const missing = [];
            if (postCount === 0) missing.push('comunicados de prensa');
            if (!hasKit) missing.push('media kit');
            return { pct: Math.round((filled / fields.length) * 100), missing };
        },
        messages: {
            low: 'Sin presencia mediática aún. Creemos comunicados de prensa y un media kit.',
            mid: 'Buen inicio con las relaciones públicas. Reforcemos la visibilidad.',
            high: '¡Excelente presencia mediática! Comunicados y materiales listos.',
        }
    },
];

// ── GET /api/site-progress ────────────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
    try {
        let clubId = req.user.clubId;

        // If no clubId in JWT (super admin), resolve from hostname
        if (!clubId) {
            const hostname = req.query.hostname;
            if (hostname && hostname !== 'app.clubplatform.org' && hostname !== 'clubplatform.org' && hostname !== 'localhost') {
                // Try to find club by custom domain or subdomain
                const clubResult = await db.query(
                    `SELECT id FROM "Club" WHERE domain = $1 OR subdomain = $2 LIMIT 1`,
                    [hostname, hostname.replace('.clubplatform.org', '')]
                );
                if (clubResult.rows.length > 0) {
                    clubId = clubResult.rows[0].id;
                }
            }
        }

        if (!clubId) {
            // Truly super admin with no club context
            return res.json({
                progress: AGENT_AREAS.map(a => ({
                    agentName: a.name, area: a.area, pct: 100,
                    message: '¡Todos los sistemas están operativos como super administrador!',
                    missing: [],
                })), overall: 100
            });
        }

        const progress = [];
        let totalPct = 0;

        for (const agent of AGENT_AREAS) {
            try {
                const { pct, missing } = await agent.check(clubId);
                const msgKey = pct < 40 ? 'low' : pct < 80 ? 'mid' : 'high';
                progress.push({
                    agentName: agent.name,
                    area: agent.area,
                    pct,
                    message: agent.messages[msgKey],
                    missing,
                });
                totalPct += pct;
            } catch (err) {
                // If a table doesn't exist, skip gracefully
                progress.push({
                    agentName: agent.name, area: agent.area, pct: 0,
                    message: agent.messages.low, missing: ['datos aún no configurados'],
                });
            }
        }

        const overall = Math.round(totalPct / AGENT_AREAS.length);
        res.json({ progress, overall });
    } catch (error) {
        console.error('Site progress error:', error);
        res.status(500).json({ error: 'Error calculating progress' });
    }
});

export default router;
