import postgres from 'postgres';
const sql = postgres("postgresql://neondb_owner:npg_WIOzsp6BKEw4@ep-frosty-wildflower-aizkdw2f-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require");

async function run() {
    const domain = 'rotaryarmeniainternational.org';
    try {
        const masterResult = await sql`SELECT logo, "footerLogo", "endPolioLogo", favicon FROM "Club" WHERE subdomain = 'origen'`;
        const masterLogos = masterResult[0] || {};

        console.log("Master Logos:", masterLogos);

        let result = await sql`
      SELECT c.id, c.name, c.logo, c."footerLogo", c."endPolioLogo", c.favicon, c.domain, c.subdomain, c.status,
             s.key, s.value,
             (SELECT COUNT(*) FROM "Product" p WHERE p."clubId" = c.id AND p.status = 'active') as "productsCount",
             (SELECT COUNT(*) FROM "CalendarEvent" ce WHERE ce."clubId" = c.id) as "eventsCount"
      FROM "Club" c 
      LEFT JOIN "Setting" s ON s."clubId" = c.id
      WHERE (c.domain = ${domain} OR c.subdomain = ${domain.split('.')[0]}) AND c.status = 'active'
    `;

        console.log("Club Result Length:", result.length);

        // Group settings
        const clubDataRaw = {};
        const settings = {};
        result.forEach(r => {
            if (!clubDataRaw.id) {
                const { key, value, ...clubInfo } = r;
                Object.assign(clubDataRaw, clubInfo);
            }
            if (r.key) settings[r.key] = r.value;
        });

        console.log("Raw Club Data:", clubDataRaw);

        const defaultFooter = "https://rotary-platform-assets.s3.amazonaws.com/logos/rotary-logo-white-main.png";
        const mappedClub = {
            ...clubDataRaw,
            logo: clubDataRaw.logo || masterLogos.logo,
            footerLogo: clubDataRaw.footerLogo || masterLogos.footerLogo || defaultFooter,
            endPolioLogo: clubDataRaw.endPolioLogo || masterLogos.endPolioLogo,
            favicon: clubDataRaw.favicon || masterLogos.favicon,
        };

        console.log("Final Mapped Logos:");
        console.log("logo:", mappedClub.logo);
        console.log("footerLogo:", mappedClub.footerLogo);
        console.log("endPolioLogo:", mappedClub.endPolioLogo);
        console.log("favicon:", mappedClub.favicon);
    } catch (e) {
        console.error("Error:", e);
    } finally {
        await sql.end();
    }
}
run();
