#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Barrera 2 — avisa qué se perdería antes de sincronizar el schema
// v4.624.0
//
// Corre antes de `npm run db:push`. Compara las tablas que hay en la base
// con los modelos declarados en schema.prisma y ABORTA si alguna tabla con
// datos fuera a desaparecer, diciendo cuál y cuántas filas tiene.
//
// La aplicación crea 45 tablas en tiempo de ejecución que no están en el
// schema (las once ProjectFair*, BannerTemplate, DesignProject,
// DesignPublicTemplate, EcosystemClone, FAQ, MediaFolder, OutroProject,
// las dos de la auditoría del CRM: CrmWebhookEvent y CrmOutboundLog, las seis del módulo
// de SEO Inteligente: SeoSiteConfig, SeoPageMeta, SeoAudit, SeoIssue,
// SeoKeyword y SeoMetric, las seis
// del módulo de inscripciones a eventos: EventRegistration, EventEdition,
// EventRegistrationCategory, EventRegistrationCompanion,
// EventRegistrationPayment, EventRegistrationHistory y
// EventRegistrationMessage, las dos del módulo de traducción: Translation y
// TranslationEvent, las cinco del Creador de Reels: ReelProject, ReelScene,
// ReelCopy, ReelNarration y ReelUsage, y las seis de Campañas de
// Contribución: ContributionCampaign, ContributionCenter,
// ContributionCampaignOverride, ContributionCampaignHistory,
// ContributionCampaignMetric y ContributionCampaignReading, y las dos del
// Director Creativo IA: CreativeProfile y CreativeReference).
// Sin esta barrera, un `db push` las borra sin preguntar.
//
// La lista de arriba es DOCUMENTACIÓN: el guardián no la lee, deriva los
// modelos declarados del propio `schema.prisma`. Se mantiene al día igual,
// porque es donde alguien mira para saber qué hay fuera de Prisma.
//
// Perder "Translation" no destruye contenido del cliente —se regenera sola
// llamando al proveedor—, pero sí borra las traducciones CORREGIDAS A MANO y
// aprobadas desde el panel, que son trabajo humano y no se recuperan.
//
// La comparación es DINÁMICA —lo que hay en la base contra lo que declara el
// schema—, así que una tabla nueva creada en runtime queda protegida sola: esta
// lista es documentación, no configuración.
//
// Para sincronizar de todos modos, a sabiendas:  npm run db:push:force
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('[db-push-guard] Falta DATABASE_URL.');
    process.exit(1);
}

const schema = readFileSync(new URL('../server/prisma/schema.prisma', import.meta.url), 'utf8');

// Nombre real de cada modelo: el de @@map si lo tiene, si no el del modelo.
const declared = new Set();
for (const block of schema.split(/\nmodel\s+/).slice(1)) {
    const name = block.match(/^(\w+)/)?.[1];
    const mapped = block.match(/@@map\("([^"]+)"\)/)?.[1];
    if (name) declared.add(mapped || name);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows } = await client.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      -- Las que empiezan con "_" son de Prisma: su registro de migraciones y
      -- las tablas puente de las relaciones muchos-a-muchos implícitas.
      AND tablename NOT LIKE '\\_%'
    ORDER BY 1
`);

const atRisk = [];
for (const { tablename } of rows) {
    if (declared.has(tablename)) continue;
    const { rows: [c] } = await client.query(`SELECT count(*)::int AS n FROM "${tablename}"`);
    atRisk.push({ tabla: tablename, filas: c.n });
}
await client.end();

if (!atRisk.length) {
    console.log('[db-push-guard] Ninguna tabla quedaría fuera del schema. Adelante.');
    process.exit(0);
}

const conDatos = atRisk.filter(t => t.filas > 0);

console.error(`
╔════════════════════════════════════════════════════════════════════╗
║  SINCRONIZACIÓN DETENIDA — "prisma db push" borraría estas tablas  ║
╚════════════════════════════════════════════════════════════════════╝

Existen en la base pero no están en server/prisma/schema.prisma:
`);
for (const t of atRisk) {
    console.error(`  ${t.filas > 0 ? '⚠️ ' : '   '}${t.tabla.padEnd(28)} ${t.filas} fila(s)`);
}

if (conDatos.length) {
    console.error(`
${conDatos.length} de ellas TIENEN DATOS. Son tablas que la aplicación crea sola
(inscripciones y pagos de la feria, plantilla de pendones, inscripciones a
eventos, preguntas frecuentes). Sincronizar ahora las elimina.

Si el cambio de schema es urgente, respalde primero esas tablas y luego:
    npm run db:push:force
`);
    process.exit(1);
}

console.error(`
Ninguna tiene datos, así que no se perdería nada — pero se van a borrar y la
aplicación las volverá a crear vacías. Para continuar:
    npm run db:push:force
`);
process.exit(1);
