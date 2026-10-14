import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const { default: prisma } = await import('../server/lib/prisma.js');
  const { default: db } = await import('../server/lib/db.js');

  const clubId = '8aa470c5-0a5a-4a8d-b872-38645b8b9f3a';

  await db.query(`
    CREATE TABLE IF NOT EXISTS "RotaryCampaignExecution" (
      "id" TEXT PRIMARY KEY,
      "campaignId" TEXT NOT NULL,
      "campaignCode" TEXT,
      "campaignName" TEXT NOT NULL,
      "week" INTEGER DEFAULT 1,
      "stage" TEXT,
      "subject" TEXT NOT NULL,
      "preheader" TEXT,
      "emailCampaignId" TEXT,
      "clubId" TEXT,
      "mode" TEXT DEFAULT 'manual',
      "status" TEXT DEFAULT 'sent',
      "targetListIds" TEXT[],
      "totalRecipients" INTEGER DEFAULT 0,
      "sentCount" INTEGER DEFAULT 0,
      "failedCount" INTEGER DEFAULT 0,
      "openCount" INTEGER DEFAULT 0,
      "clickCount" INTEGER DEFAULT 0,
      "senderName" TEXT,
      "fromEmail" TEXT,
      "replyToEmail" TEXT,
      "sentAt" TIMESTAMPTZ,
      "scheduledAt" TIMESTAMPTZ,
      "executedAt" TIMESTAMPTZ DEFAULT NOW(),
      "metadata" JSONB,
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS "idx_rotary_exec_camp" ON "RotaryCampaignExecution" ("campaignId");
    CREATE INDEX IF NOT EXISTS "idx_rotary_exec_club" ON "RotaryCampaignExecution" ("clubId");
    CREATE INDEX IF NOT EXISTS "idx_rotary_exec_email_camp" ON "RotaryCampaignExecution" ("emailCampaignId");
    CREATE INDEX IF NOT EXISTS "idx_rotary_exec_date" ON "RotaryCampaignExecution" ("executedAt" DESC);
  `);

  // 1. Envío Piloto (2 destinatarios)
  let pilotCamp = await prisma.emailCampaign.findFirst({
    where: { name: { contains: 'Envío Piloto' } },
    include: { recipients: true }
  });

  if (!pilotCamp) {
    pilotCamp = await prisma.emailCampaign.create({
      data: {
        name: '[Rotary en Acción] Tu club transforma comunidades (Envío Piloto - 2 Destinatarios)',
        subject: '🚀 Tu club transforma comunidades. ¡Hagámoslo visible en Rotary en Acción!',
        preheader: 'Espacio oficial para visibilizar las obras de los 133 clubes de nuestros distritos.',
        content: '<p>Campaña de prueba y validación institucional Rotary en Acción.</p>',
        fromName: 'Comunicaciones | Distrito 4281',
        fromEmail: 'comunicaciones@rotary4281.org',
        replyTo: 'comunicaciones@rotary4281.org',
        audience: 'list',
        status: 'sent',
        totalRecipients: 2,
        sentCount: 2,
        failedCount: 0,
        sentAt: new Date('2026-10-14T20:41:28.708Z'),
        createdAt: new Date('2026-10-14T20:41:28.000Z'),
        clubId,
        recipients: {
          create: [
            {
              email: 'juan_rios12@hotmail.com',
              status: 'sent',
              clubId
            },
            {
              email: 'dyazo@rotary4281.org',
              status: 'sent',
              clubId
            }
          ]
        }
      },
      include: { recipients: true }
    });
  }

  // Insertar o actualizar Envío Piloto
  await db.query(`DELETE FROM "RotaryCampaignExecution" WHERE id = 'exec_sem01_piloto_20261014'`);
  await db.query(`
    INSERT INTO "RotaryCampaignExecution" (
      id, "campaignId", "campaignCode", "campaignName", week, stage,
      subject, preheader, "emailCampaignId", "clubId", mode, status,
      "totalRecipients", "sentCount", "failedCount", "openCount", "clickCount",
      "senderName", "fromEmail", "replyToEmail", "sentAt", "executedAt", "createdAt"
    ) VALUES (
      'exec_sem01_piloto_20261014',
      'rmk-sem-01',
      'sem-01',
      'Tu club transforma comunidades. ¡Hagámoslo visible! (Envío Piloto)',
      1,
      'Semana 1 · Captación',
      '🚀 Tu club transforma comunidades. ¡Hagámoslo visible en Rotary en Acción!',
      'Espacio oficial para visibilizar las obras de los 133 clubes de nuestros distritos.',
      $1,
      $2,
      'manual',
      'sent',
      2,
      2,
      0,
      0,
      0,
      'Comunicaciones | Distrito 4281',
      'comunicaciones@rotary4281.org',
      'comunicaciones@rotary4281.org',
      '2026-10-14T20:41:28.708Z',
      '2026-10-14T20:41:28.708Z',
      '2026-10-14T20:41:28.708Z'
    )
  `, [pilotCamp.id, clubId]);

  // Insertar o actualizar Despacho General (354 destinatarios)
  await db.query(`DELETE FROM "RotaryCampaignExecution" WHERE id = 'exec_sem01_general_20261014'`);
  await db.query(`
    INSERT INTO "RotaryCampaignExecution" (
      id, "campaignId", "campaignCode", "campaignName", week, stage,
      subject, preheader, "emailCampaignId", "clubId", mode, status,
      "totalRecipients", "sentCount", "failedCount", "openCount", "clickCount",
      "senderName", "fromEmail", "replyToEmail", "sentAt", "executedAt", "createdAt"
    ) VALUES (
      'exec_sem01_general_20261014',
      'rmk-sem-01',
      'sem-01',
      'Tu club transforma comunidades. ¡Hagámoslo visible! (Despacho General)',
      1,
      'Semana 1 · Captación',
      '🚀 Tu club transforma comunidades. ¡Hagámoslo visible en Rotary en Acción!',
      'Espacio oficial para visibilizar las iniciativas que están transformando nuestras comunidades.',
      'f70620af-3a75-4d3f-ab48-8ed273c54932',
      $1,
      'manual',
      'sent',
      354,
      354,
      0,
      24,
      11,
      'Comunicaciones | Distrito 4281',
      'comunicaciones@rotary4281.org',
      'comunicaciones@rotary4281.org',
      '2026-10-14T20:46:07.518Z',
      '2026-10-14T20:46:07.518Z',
      '2026-10-14T20:46:07.518Z'
    )
  `, [clubId]);

  const { rows } = await db.query(`SELECT id, "campaignName", "totalRecipients", "sentCount", "openCount", "clickCount", "sentAt" FROM "RotaryCampaignExecution" ORDER BY "executedAt" DESC`);
  console.log('✅ EXECUTIONS IN DB:');
  console.table(rows);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
