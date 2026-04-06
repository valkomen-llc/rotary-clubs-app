import 'dotenv/config';
import db from './server/lib/db.js';

async function main() {
  try {
    const res = await db.query('SELECT status, direction, "errorCode", "errorMessage", "failedAt", "templateName", "sentAt", "createdAt" FROM "WhatsAppMessageLog" ORDER BY "createdAt" DESC LIMIT 20');
    console.log(JSON.stringify(res.rows, null, 2));
  } catch(e) {
    console.error(e);
  }
  process.exit();
}
main();
