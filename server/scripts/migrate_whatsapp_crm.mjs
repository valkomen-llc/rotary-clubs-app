/**
 * migrate_whatsapp_crm.mjs
 * Migración manual — Crear tablas del CRM WhatsApp
 * NOTA: La tabla Club usa TEXT para id (no UUID), las FK deben ser TEXT también
 * Ejecutar desde el directorio server/:
 *   node scripts/migrate_whatsapp_crm.mjs
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const { default: pg } = await import('pg');
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const run = async (label, sql) => {
    try {
        await pool.query(sql);
        console.log(`✅ ${label}`);
    } catch (err) {
        if (err.message.includes('already exists')) {
            console.log(`⚠️  ${label} (ya existe, sin cambios)`);
        } else {
            console.error(`❌ ${label}:`, err.message);
        }
    }
};

console.log('\n🚀 Iniciando migración CRM WhatsApp...\n');

await run('WhatsAppConfig', `
    CREATE TABLE IF NOT EXISTS "WhatsAppConfig" (
        id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "clubId"         TEXT NOT NULL UNIQUE REFERENCES "Club"(id) ON DELETE CASCADE,
        "phoneNumberId"  VARCHAR(100) NOT NULL DEFAULT '',
        "wabaId"         VARCHAR(100) NOT NULL DEFAULT '',
        "accessToken"    TEXT NOT NULL DEFAULT '',
        "verifyToken"    VARCHAR(255) NOT NULL DEFAULT '',
        "appId"          VARCHAR(100),
        enabled          BOOLEAN NOT NULL DEFAULT TRUE,
        "lastVerifiedAt" TIMESTAMPTZ,
        "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
`);

await run('WhatsAppContact', `
    CREATE TABLE IF NOT EXISTS "WhatsAppContact" (
        id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "clubId"         TEXT NOT NULL REFERENCES "Club"(id) ON DELETE CASCADE,
        name             VARCHAR(255) NOT NULL,
        phone            VARCHAR(30) NOT NULL,
        email            VARCHAR(255),
        tags             TEXT[] DEFAULT '{}',
        source           VARCHAR(50) NOT NULL DEFAULT 'manual',
        status           VARCHAR(30) NOT NULL DEFAULT 'active',
        metadata         JSONB DEFAULT '{}',
        "totalSent"      INT NOT NULL DEFAULT 0,
        "totalDelivered" INT NOT NULL DEFAULT 0,
        "totalRead"      INT NOT NULL DEFAULT 0,
        "totalFailed"    INT NOT NULL DEFAULT 0,
        "optedOutAt"     TIMESTAMPTZ,
        "leadId"         TEXT,
        "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(phone, "clubId")
    )
`);

await run('Índices WhatsAppContact', `
    CREATE INDEX IF NOT EXISTS idx_wa_contact_club   ON "WhatsAppContact" ("clubId");
    CREATE INDEX IF NOT EXISTS idx_wa_contact_status ON "WhatsAppContact" (status);
    CREATE INDEX IF NOT EXISTS idx_wa_contact_phone  ON "WhatsAppContact" (phone);
`);

await run('WhatsAppContactList', `
    CREATE TABLE IF NOT EXISTS "WhatsAppContactList" (
        id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "clubId"     TEXT NOT NULL REFERENCES "Club"(id) ON DELETE CASCADE,
        name         VARCHAR(255) NOT NULL,
        description  TEXT,
        color        VARCHAR(20) NOT NULL DEFAULT '#3B82F6',
        "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
`);

await run('ContactListMember', `
    CREATE TABLE IF NOT EXISTS "ContactListMember" (
        id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "listId"     TEXT NOT NULL REFERENCES "WhatsAppContactList"(id) ON DELETE CASCADE,
        "contactId"  TEXT NOT NULL REFERENCES "WhatsAppContact"(id) ON DELETE CASCADE,
        "addedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE("listId", "contactId")
    )
`);

await run('WhatsAppTemplate', `
    CREATE TABLE IF NOT EXISTS "WhatsAppTemplate" (
        id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "clubId"         TEXT NOT NULL REFERENCES "Club"(id) ON DELETE CASCADE,
        name             VARCHAR(255) NOT NULL,
        "displayName"    VARCHAR(255) NOT NULL,
        category         VARCHAR(50) NOT NULL DEFAULT 'MARKETING',
        language         VARCHAR(10) NOT NULL DEFAULT 'es',
        status           VARCHAR(30) NOT NULL DEFAULT 'pending',
        "headerType"     VARCHAR(20),
        "headerContent"  TEXT,
        "bodyText"       TEXT NOT NULL,
        "footerText"     VARCHAR(255),
        buttons          JSONB DEFAULT '[]',
        "metaTemplateId" VARCHAR(100),
        "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
`);

await run('WhatsAppCampaign', `
    CREATE TABLE IF NOT EXISTS "WhatsAppCampaign" (
        id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "clubId"         TEXT NOT NULL REFERENCES "Club"(id) ON DELETE CASCADE,
        name             VARCHAR(255) NOT NULL,
        description      TEXT,
        "listId"         TEXT REFERENCES "WhatsAppContactList"(id),
        "templateId"     TEXT REFERENCES "WhatsAppTemplate"(id),
        "templateVars"   JSONB DEFAULT '{}',
        status           VARCHAR(30) NOT NULL DEFAULT 'draft',
        "scheduledAt"    TIMESTAMPTZ,
        "sentAt"         TIMESTAMPTZ,
        "totalContacts"  INT NOT NULL DEFAULT 0,
        sent             INT NOT NULL DEFAULT 0,
        delivered        INT NOT NULL DEFAULT 0,
        "read"           INT NOT NULL DEFAULT 0,
        failed           INT NOT NULL DEFAULT 0,
        "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
`);

await run('WhatsAppMessageLog', `
    CREATE TABLE IF NOT EXISTS "WhatsAppMessageLog" (
        id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "clubId"        TEXT NOT NULL,
        "campaignId"    TEXT REFERENCES "WhatsAppCampaign"(id) ON DELETE SET NULL,
        "contactId"     TEXT REFERENCES "WhatsAppContact"(id) ON DELETE SET NULL,
        phone           VARCHAR(30) NOT NULL,
        "messageId"     VARCHAR(255),
        "templateName"  VARCHAR(255),
        "bodyText"      TEXT,
        status          VARCHAR(20) NOT NULL DEFAULT 'pending',
        "errorCode"     VARCHAR(50),
        "errorMessage"  TEXT,
        "sentAt"        TIMESTAMPTZ,
        "deliveredAt"   TIMESTAMPTZ,
        "readAt"        TIMESTAMPTZ,
        "failedAt"      TIMESTAMPTZ,
        "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
`);

await run('Índices WhatsAppMessageLog', `
    CREATE INDEX IF NOT EXISTS idx_wa_msglog_messageid ON "WhatsAppMessageLog" ("messageId");
    CREATE INDEX IF NOT EXISTS idx_wa_msglog_campaign  ON "WhatsAppMessageLog" ("campaignId", status);
    CREATE INDEX IF NOT EXISTS idx_wa_msglog_club      ON "WhatsAppMessageLog" ("clubId");
`);

console.log('\n🎉 Migración completada! Todas las tablas del CRM WhatsApp están listas.\n');
await pool.end();
