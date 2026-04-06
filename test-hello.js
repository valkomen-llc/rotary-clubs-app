import 'dotenv/config';
import db from './server/lib/db.js';
import jwt from 'jsonwebtoken';

async function main() {
  try {
    const userR = await db.query(`SELECT id, email, role, "clubId" FROM "User" WHERE role='administrator' LIMIT 1`);
    const user = userR.rows[0];
    const token = jwt.sign({ id: user.id, role: user.role, clubId: user.clubId }, process.env.JWT_SECRET || 'rotary_secret_2024', { expiresIn: '1h' });

    const contactR = await db.query(`SELECT id FROM "WhatsAppContact" LIMIT 1`);
    const contact = contactR.rows[0];

    const tmplR = await db.query(`SELECT id FROM "WhatsAppTemplate" WHERE name='hello_world' LIMIT 1`);
    const template = tmplR.rows[0];

    console.log("Sending to:", contact.id, "template:", template.id);

    const res = await fetch(`https://app.clubplatform.org/api/whatsapp/contacts/${contact.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ templateId: template.id, vars: {} }),
    });
    console.log("Status:", res.status, res.statusText);
    const text = await res.text();
    console.log("Response:", text.substring(0, 500));
  } catch(e) {
    console.error(e);
  }
  process.exit();
}
main();
