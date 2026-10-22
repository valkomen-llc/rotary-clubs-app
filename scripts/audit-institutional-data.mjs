// Auditoría READ-ONLY de los datos que alimentan el CRM institucional.
// No escribe nada. Sirve para comprobar la fuente real antes de conciliar:
//
//   node scripts/audit-institutional-data.mjs
//
// Sale con código 1 si la base no responde, para que no pase por bueno un
// informe vacío.
import db from '../server/lib/db.js';

const PLATFORM_CLUB_ID = '3c648ce7-3c47-41e2-9461-6e40a8615ae6';

const q = async (sql, params = []) => (await db.query(sql, params)).rows;

const hasTable = async (name) => {
  const rows = await q(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [name]
  );
  return rows.length > 0;
};

async function main() {
  const out = { generatedAt: new Date().toISOString() };

  out.tables = {};
  for (const t of ['DistrictClubProfile', 'CrmInstitutionalLink', 'RotaryClubActivation', 'CrmCustomFieldValue', 'WhatsAppCustomField']) {
    out.tables[t] = await hasTable(t);
  }

  out.contacts = {
    total: (await q(
      `SELECT COUNT(*)::int AS n FROM "WhatsAppContact" WHERE "clubId" = $1`,
      [PLATFORM_CLUB_ID]
    ))[0]?.n || 0,
    withClubCustomField: (await q(
      `SELECT COUNT(*)::int AS n FROM "WhatsAppContact" c
       WHERE c."clubId" = $1
         AND EXISTS (
           SELECT 1 FROM "CrmCustomFieldValue" v
           JOIN "WhatsAppCustomField" f ON f.id = v."fieldId"
           WHERE v."contactId" = c.id
             AND f.label IN ('Nombre del Club', 'Nombre club', 'Club', 'Club de pertenencia')
             AND COALESCE(TRIM(v.value), '') <> ''
         )`,
      [PLATFORM_CLUB_ID]
    ))[0]?.n || 0,
    withCompanyOnly: (await q(
      `SELECT COUNT(*)::int AS n FROM "WhatsAppContact" c
       WHERE c."clubId" = $1
         AND COALESCE(TRIM(c.company), '') <> ''
         AND NOT EXISTS (
           SELECT 1 FROM "CrmCustomFieldValue" v
           JOIN "WhatsAppCustomField" f ON f.id = v."fieldId"
           WHERE v."contactId" = c.id
             AND f.label IN ('Nombre del Club', 'Nombre club', 'Club', 'Club de pertenencia')
             AND COALESCE(TRIM(v.value), '') <> ''
         )`,
      [PLATFORM_CLUB_ID]
    ))[0]?.n || 0,
    withSiteId: (await q(
      `SELECT COUNT(*)::int AS n FROM "WhatsAppContact" WHERE "clubId" = $1 AND "siteId" IS NOT NULL`,
      [PLATFORM_CLUB_ID]
    ))[0]?.n || 0,
  };

  out.customFieldLabels = await q(
    `SELECT f.label, COUNT(*)::int AS n
     FROM "CrmCustomFieldValue" v
     JOIN "WhatsAppCustomField" f ON f.id = v."fieldId"
     JOIN "WhatsAppContact" c ON c.id = v."contactId"
     WHERE c."clubId" = $1
     GROUP BY f.label
     ORDER BY n DESC`,
    [PLATFORM_CLUB_ID]
  );

  out.topCompanies = await q(
    `SELECT company, COUNT(*)::int AS n
     FROM "WhatsAppContact"
     WHERE "clubId" = $1 AND COALESCE(TRIM(company), '') <> ''
     GROUP BY company ORDER BY n DESC LIMIT 25`,
    [PLATFORM_CLUB_ID]
  );

  out.topDeclaredClubs = await q(
    `SELECT v.value AS club, COUNT(*)::int AS n
     FROM "CrmCustomFieldValue" v
     JOIN "WhatsAppCustomField" f ON f.id = v."fieldId"
     JOIN "WhatsAppContact" c ON c.id = v."contactId"
     WHERE c."clubId" = $1
       AND f.label IN ('Nombre del Club', 'Nombre club', 'Club', 'Club de pertenencia')
       AND COALESCE(TRIM(v.value), '') <> ''
     GROUP BY v.value ORDER BY n DESC LIMIT 40`,
    [PLATFORM_CLUB_ID]
  );

  out.districts = await q(
    `SELECT v.value AS district, COUNT(*)::int AS n
     FROM "CrmCustomFieldValue" v
     JOIN "WhatsAppCustomField" f ON f.id = v."fieldId"
     JOIN "WhatsAppContact" c ON c.id = v."contactId"
     WHERE c."clubId" = $1 AND f.label ILIKE '%distrito%'
     GROUP BY v.value ORDER BY n DESC`,
    [PLATFORM_CLUB_ID]
  );

  if (out.tables.DistrictClubProfile) {
    out.directory = {
      total: (await q(`SELECT COUNT(*)::int AS n FROM "DistrictClubProfile"`))[0]?.n || 0,
      byDistrict: await q(
        `SELECT "districtNumber", COUNT(*)::int AS n, ROUND(AVG("completionPercentage"))::int AS avg_completion
         FROM "DistrictClubProfile" GROUP BY "districtNumber" ORDER BY "districtNumber"`
      ),
      withoutTenant: (await q(
        `SELECT COUNT(*)::int AS n FROM "DistrictClubProfile" WHERE "clubId" IS NULL`
      ))[0]?.n || 0,
    };
  }

  if (out.tables.CrmInstitutionalLink) {
    out.links = await q(
      `SELECT "linkStatus", COUNT(*)::int AS n, COUNT(DISTINCT "contactId")::int AS contacts
       FROM "CrmInstitutionalLink" WHERE "clubId" = $1 GROUP BY "linkStatus" ORDER BY n DESC`,
      [PLATFORM_CLUB_ID]
    );
  }

  if (out.tables.RotaryClubActivation) {
    out.activations = await q(
      `SELECT status, COUNT(*)::int AS n FROM "RotaryClubActivation" GROUP BY status ORDER BY n DESC`
    );
  }

  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((error) => {
    console.error('[audit-institutional-data]', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.pool.end().catch(() => {});
  });
