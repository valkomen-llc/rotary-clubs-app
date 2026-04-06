import db from '../lib/db.js';

export const getRobotsTxt = async (req, res) => {
    try {
        const host = req.headers.host || '';
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
        const domainUrl = `${protocol}://${host}`;

        // Return standard robots.txt with absolute sitemap URL
        const txt = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /#/admin/
Disallow: /#/login
Disallow: /#/registro

User-agent: AhrefsBot
Crawl-delay: 10

User-agent: SemrushBot
Crawl-delay: 10

Sitemap: ${domainUrl}/api/public/seo/sitemap.xml`;

        res.setHeader('Content-Type', 'text/plain');
        res.status(200).send(txt);
    } catch (e) {
        res.status(500).send('User-agent: *\nDisallow: /');
    }
};

export const getSitemap = async (req, res) => {
    try {
        const host = req.headers.host || '';
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
        const domainUrl = `${protocol}://${host}`;

        const originParts = host.split('.');
        const isDefaultDomain = host.includes('rotaryplatform.com') || host.includes('clubplatform.org');
        const subdomain = isDefaultDomain ? originParts[0] : null;

        let clubQuery;
        let queryParams = [];
        if (subdomain && subdomain !== 'www' && subdomain !== 'app') {
            clubQuery = `SELECT id FROM "Club" WHERE subdomain=$1 LIMIT 1`;
            queryParams = [subdomain];
        } else {
            clubQuery = `SELECT id FROM "Club" WHERE domain=$1 LIMIT 1`;
            queryParams = [host];
        }

        const clubRes = await db.query(clubQuery, queryParams);
        
        let urls = [
            { loc: '/', changefreq: 'daily', priority: '1.0' },
            { loc: '/#/quienes-somos', changefreq: 'monthly', priority: '0.8' },
            { loc: '/#/nuestras-causas', changefreq: 'monthly', priority: '0.8' },
            { loc: '/#/proyectos', changefreq: 'weekly', priority: '0.9' },
            { loc: '/#/blog', changefreq: 'daily', priority: '0.9' },
            { loc: '/#/eventos', changefreq: 'daily', priority: '0.9' },
            { loc: '/#/contacto', changefreq: 'yearly', priority: '0.7' },
            { loc: '/#/rotaract', changefreq: 'monthly', priority: '0.8' },
            { loc: '/#/interact', changefreq: 'monthly', priority: '0.8' },
            { loc: '/#/intercambio-jovenes', changefreq: 'monthly', priority: '0.8' }
        ];

        if (clubRes.rows.length > 0) {
            const clubId = clubRes.rows[0].id;
            
            // Fetch active projects
            const projectsRes = await db.query(`SELECT id, "updatedAt" FROM "Project" WHERE "clubId"=$1 AND status IN ('active', 'activa')`, [clubId]);
            projectsRes.rows.forEach(p => {
                urls.push({
                    loc: `/#/proyectos/${p.id}`,
                    lastmod: new Date(p.updatedAt).toISOString().split('T')[0],
                    changefreq: 'weekly',
                    priority: '0.8'
                });
            });

            // Fetch published posts
            const postsRes = await db.query(`SELECT id, "updatedAt" FROM "Post" WHERE "clubId"=$1 AND published=true`, [clubId]);
            postsRes.rows.forEach(p => {
                urls.push({
                    loc: `/#/blog/${p.id}`,
                    lastmod: new Date(p.updatedAt).toISOString().split('T')[0],
                    changefreq: 'monthly',
                    priority: '0.7'
                });
            });
        }

        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
        urls.forEach(u => {
            xml += `  <url>\n`;
            xml += `    <loc>${domainUrl}${u.loc}</loc>\n`;
            if (u.lastmod) xml += `    <lastmod>${u.lastmod}</lastmod>\n`;
            xml += `    <changefreq>${u.changefreq}</changefreq>\n`;
            xml += `    <priority>${u.priority}</priority>\n`;
            xml += `  </url>\n`;
        });
        xml += `</urlset>`;

        res.setHeader('Content-Type', 'application/xml');
        res.status(200).send(xml);

    } catch (e) {
        console.error('Sitemap generation error:', e);
        res.status(500).send('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
    }
};
