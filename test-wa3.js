import 'dotenv/config';
import db from './server/lib/db.js';

async function main() {
  try {
    const res = await db.query('SELECT id, name, status, "headerType", "metaTemplateId" FROM "WhatsAppTemplate" ORDER BY "createdAt" DESC LIMIT 10');
    console.log("Templates sync status:");
    console.log(JSON.stringify(res.rows, null, 2));

    const creds = await db.query('SELECT "wabaId", "phoneNumberId", enabled FROM "WhatsAppConfig" LIMIT 1');
    console.log("Creds:");
    console.log(JSON.stringify(creds.rows, null, 2));
  } catch(e) {
    console.error(e);
  }
  process.exit();
}
main();
