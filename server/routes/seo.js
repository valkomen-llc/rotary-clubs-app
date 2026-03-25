import express from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = express.Router();

// ═══════════════════════════════════════════════════════════
// DYNAMIC SITEMAP.XML — Agente SEO Sitemap
// Generates XML sitemap pulling all public content from DB
// ═══════════════════════════════════════════════════════════
router.get('/sitemap.xml', async (req, res) => {
    try {
        const host = req.headers.host || 'clubplatform.org';
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const baseUrl = `${protocol}://${host}`;

        // Fetch dynamic data from the database
        const [clubs, projects, news] = await Promise.all([
            prisma.club.findMany({
                where: { status: 'active' },
                select: { subdomain: true, updatedAt: true, name: true }
            }),
            prisma.project.findMany({
                where: { status: 'published' },
                select: { id: true, updatedAt: true }
            }),
            prisma.news.findMany({
                where: { published: true },
                select: { id: true, updatedAt: true }
            })
        ]);

        // Static pages
        const staticPages = [
            { loc: '/', priority: '1.0', changefreq: 'daily' },
            { loc: '/#/quienes-somos', priority: '0.8', changefreq: 'monthly' },
            { loc: '/#/nuestra-historia', priority: '0.7', changefreq: 'monthly' },
            { loc: '/#/nuestras-causas', priority: '0.8', changefreq: 'weekly' },
            { loc: '/#/proyectos', priority: '0.9', changefreq: 'weekly' },
            { loc: '/#/blog', priority: '0.9', changefreq: 'daily' },
            { loc: '/#/eventos', priority: '0.8', changefreq: 'weekly' },
            { loc: '/#/contacto', priority: '0.6', changefreq: 'monthly' },
            { loc: '/#/rotaract', priority: '0.7', changefreq: 'monthly' },
            { loc: '/#/interact', priority: '0.7', changefreq: 'monthly' },
            { loc: '/#/intercambio-jovenes', priority: '0.7', changefreq: 'monthly' },
            { loc: '/#/la-fundacion-rotaria', priority: '0.7', changefreq: 'monthly' },
            { loc: '/#/involucrate', priority: '0.8', changefreq: 'monthly' },
            { loc: '/#/maneras-de-contribuir', priority: '0.8', changefreq: 'monthly' },
            { loc: '/#/estados-financieros', priority: '0.6', changefreq: 'yearly' },
            { loc: '/#/shop', priority: '0.8', changefreq: 'weekly' },
        ];

        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

        // Static pages
        for (const page of staticPages) {
            xml += `  <url>
    <loc>${baseUrl}${page.loc}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>
`;
        }

        // Dynamic: Projects
        for (const project of projects) {
            xml += `  <url>
    <loc>${baseUrl}/#/proyectos/${project.id}</loc>
    <lastmod>${project.updatedAt.toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
`;
        }

        // Dynamic: News/Blog
        for (const article of news) {
            xml += `  <url>
    <loc>${baseUrl}/#/blog/${article.id}</loc>
    <lastmod>${article.updatedAt.toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
`;
        }

        // Dynamic: Active Clubs (for the SaaS landing / club preview)
        for (const club of clubs) {
            if (club.subdomain) {
                xml += `  <url>
    <loc>${protocol}://${club.subdomain}.clubplatform.org/</loc>
    <lastmod>${club.updatedAt.toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
`;
            }
        }

        xml += `</urlset>`;

        res.set('Content-Type', 'application/xml');
        res.set('Cache-Control', 'public, max-age=3600'); // Cache 1 hour
        res.send(xml);

    } catch (error) {
        console.error('[SEO] Sitemap generation error:', error);
        res.status(500).send('Error generating sitemap');
    }
});

// ═══════════════════════════════════════════════════════════
// ROBOTS.TXT — Agente SEO Technical
// Controls crawler access and points to sitemap
// ═══════════════════════════════════════════════════════════
router.get('/robots.txt', (req, res) => {
    const host = req.headers.host || 'clubplatform.org';
    const protocol = req.headers['x-forwarded-proto'] || 'https';

    const robotsTxt = `# Rotary ClubPlatform — Directivas de Rastreo
# Generado por Agente SEO Technical

User-agent: *
Allow: /
Disallow: /api/
Disallow: /#/admin/
Disallow: /#/login
Disallow: /#/registro

# Sitemap dinámico
Sitemap: ${protocol}://${host}/api/seo/sitemap.xml

# Crawl-delay para bots agresivos
User-agent: AhrefsBot
Crawl-delay: 10

User-agent: SemrushBot
Crawl-delay: 10
`;

    res.set('Content-Type', 'text/plain');
    res.set('Cache-Control', 'public, max-age=86400'); // Cache 24h
    res.send(robotsTxt);
});

// ═══════════════════════════════════════════════════════════
// OPEN GRAPH METADATA API — Agente Programmatic SEO
// Returns OG data for projects, news, and clubs
// ═══════════════════════════════════════════════════════════
router.get('/og/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;
        let ogData = {
            title: 'Rotary ClubPlatform',
            description: 'Plataforma digital para clubes Rotarios — Servicio por encima del interés propio.',
            image: '',
            url: '',
            type: 'website'
        };

        const host = req.headers.host || 'clubplatform.org';
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const baseUrl = `${protocol}://${host}`;

        switch (type) {
            case 'project': {
                const project = await prisma.project.findUnique({
                    where: { id },
                    include: { club: { select: { name: true, logo: true } } }
                });
                if (project) {
                    ogData.title = `${project.title} | ${project.club?.name || 'Rotary'}`;
                    ogData.description = project.description?.substring(0, 160) || 'Proyecto de impacto social comunitario de Rotary International.';
                    ogData.image = project.image || project.club?.logo || '';
                    ogData.url = `${baseUrl}/#/proyectos/${project.id}`;
                    ogData.type = 'article';
                }
                break;
            }
            case 'news': {
                const article = await prisma.news.findUnique({
                    where: { id },
                    include: { club: { select: { name: true, logo: true } } }
                });
                if (article) {
                    ogData.title = `${article.title} | ${article.club?.name || 'Rotary'}`;
                    ogData.description = article.excerpt?.substring(0, 160) || article.content?.substring(0, 160) || '';
                    ogData.image = article.image || article.club?.logo || '';
                    ogData.url = `${baseUrl}/#/blog/${article.id}`;
                    ogData.type = 'article';
                }
                break;
            }
            case 'club': {
                const club = await prisma.club.findFirst({
                    where: { OR: [{ id }, { subdomain: id }] }
                });
                if (club) {
                    ogData.title = `${club.name} — Rotary International`;
                    ogData.description = club.description?.substring(0, 160) || `Conoce a ${club.name}, club miembro de Rotary International.`;
                    ogData.image = club.logo || '';
                    ogData.url = club.subdomain ? `${protocol}://${club.subdomain}.clubplatform.org/` : `${baseUrl}/#/preview/${club.subdomain}`;
                    ogData.type = 'profile';
                }
                break;
            }
        }

        res.json(ogData);
    } catch (error) {
        console.error('[SEO] OG metadata error:', error);
        res.status(500).json({ error: 'Error fetching OG data' });
    }
});

export default router;
