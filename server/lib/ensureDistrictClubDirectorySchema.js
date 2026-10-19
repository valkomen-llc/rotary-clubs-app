// ════════════════════════════════════════════════════════════════════════════
// Esquema de persistencia para el Directorio Distrital de Clubes
// Rotary, Rotaract e Interact — Distrito 4281 & Multidistrito
// Runtime idempotente y seguro sobre PostgreSQL.
// ════════════════════════════════════════════════════════════════════════════

import db from './db.js';
import { CLUBS_4281 } from './rotaryClubs.js';
import { norm } from './publicClubs.js';

let _ready = false;

/** Convierte un nombre en slug URL amigable y limpio */
export function slugifyClub(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^(club\s+rotario|rotary\s+club|rotary\s+e-club|rotary|club\s+rotaract|rotaract|club\s+interact|interact)\s+/gi, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'club';
}

/** Calcula el porcentaje de completitud institucional del perfil (0 a 100%) */
export function calculateProfileCompletion(data) {
  let score = 0;
  // 1. Identidad básica (25 pts)
  if (data.officialName || data.clubName) score += 5;
  if (data.description && data.description.length > 20) score += 5;
  if (data.history && data.history.length > 20) score += 5;
  if (data.logoUrl) score += 5;
  if (data.coverImageUrl) score += 5;

  // 2. Nuestro club y ubicación (20 pts)
  if (data.city) score += 5;
  if (data.foundationYear || data.foundationDate) score += 5;
  if (data.meetingAddress) score += 5;
  if (data.meetingSchedule) score += 5;

  // 3. Liderazgo y membresía (20 pts)
  if (data.currentPresident) score += 10;
  if (data.rotaryPeriod) score += 5;
  if (Array.isArray(data.boardMembers) && data.boardMembers.length > 0) score += 5;

  // 4. Proyectos e impacto (15 pts)
  if (Array.isArray(data.featuredProjects) && data.featuredProjects.length > 0) score += 10;
  if (Array.isArray(data.serviceAreas) && data.serviceAreas.length > 0) score += 5;

  // 5. Galería multimedia (10 pts)
  if (Array.isArray(data.gallery) && data.gallery.length > 0) score += 10;

  // 6. Contacto y canales (10 pts)
  if (data.contactEmail || data.contactPhone) score += 5;
  if (data.websiteUrl || (data.socialMedia && Object.keys(data.socialMedia).length > 0)) score += 5;

  return Math.min(100, Math.max(0, score));
}

export async function ensureDistrictClubDirectorySchema() {
  if (_ready) return;

  // 1. Tabla de Perfiles Oficiales Distritales
  await db.query(`CREATE TABLE IF NOT EXISTS "DistrictClubProfile" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "clubId" TEXT,
    "districtId" TEXT,
    "districtNumber" INT DEFAULT 4281,
    "organizationType" TEXT NOT NULL DEFAULT 'rotary',
    "officialName" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    slug TEXT NOT NULL,
    city TEXT,
    state TEXT,
    country TEXT DEFAULT 'Colombia',
    "foundationYear" INT,
    "foundationDate" TIMESTAMPTZ,
    motto TEXT,
    description TEXT,
    history TEXT,
    mission TEXT,
    vision TEXT,
    "serviceAreas" JSONB DEFAULT '[]'::jsonb,
    "currentPresident" TEXT,
    "rotaryPeriod" TEXT DEFAULT '2026–2027',
    "boardMembers" JSONB DEFAULT '[]'::jsonb,
    "memberCount" INT,
    "joinInfo" TEXT,
    "featuredProjects" JSONB DEFAULT '[]'::jsonb,
    "logoUrl" TEXT,
    "coverImageUrl" TEXT,
    gallery JSONB DEFAULT '[]'::jsonb,
    "meetingAddress" TEXT,
    "meetingSchedule" TEXT,
    "meetingCity" TEXT,
    "geoLat" NUMERIC,
    "geoLng" NUMERIC,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "websiteUrl" TEXT,
    "socialMedia" JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'published',
    "completionPercentage" INT DEFAULT 0,
    "lastUpdatedPeriod" TEXT DEFAULT '2026–2027',
    "publishedAt" TIMESTAMPTZ DEFAULT NOW(),
    "publishedBy" TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
  )`);

  // Migraciones no destructivas
  await db.query(`ALTER TABLE "DistrictClubProfile" ADD COLUMN IF NOT EXISTS "districtNumber" INT DEFAULT 4281`).catch(() => {});
  await db.query(`ALTER TABLE "DistrictClubProfile" ADD COLUMN IF NOT EXISTS "completionPercentage" INT DEFAULT 0`).catch(() => {});
  await db.query(`ALTER TABLE "DistrictClubProfile" ADD COLUMN IF NOT EXISTS "lastUpdatedPeriod" TEXT DEFAULT '2026–2027'`).catch(() => {});
  await db.query(`ALTER TABLE "DistrictClubProfile" ADD COLUMN IF NOT EXISTS "serviceAreas" JSONB DEFAULT '[]'::jsonb`).catch(() => {});
  await db.query(`ALTER TABLE "DistrictClubProfile" ADD COLUMN IF NOT EXISTS "boardMembers" JSONB DEFAULT '[]'::jsonb`).catch(() => {});
  await db.query(`ALTER TABLE "DistrictClubProfile" ADD COLUMN IF NOT EXISTS "featuredProjects" JSONB DEFAULT '[]'::jsonb`).catch(() => {});
  await db.query(`ALTER TABLE "DistrictClubProfile" ADD COLUMN IF NOT EXISTS gallery JSONB DEFAULT '[]'::jsonb`).catch(() => {});
  await db.query(`ALTER TABLE "DistrictClubProfile" ADD COLUMN IF NOT EXISTS "socialMedia" JSONB DEFAULT '{}'::jsonb`).catch(() => {});

  // Índices
  await db.query(`CREATE INDEX IF NOT EXISTS idx_dcp_dist_org_stat ON "DistrictClubProfile"("districtNumber", "organizationType", status)`).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS idx_dcp_slug ON "DistrictClubProfile"("districtNumber", "organizationType", slug)`).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS idx_dcp_city ON "DistrictClubProfile"(city)`).catch(() => {});

  // 2. Tabla de Solicitudes y Revisiones de Contenido
  await db.query(`CREATE TABLE IF NOT EXISTS "DistrictClubSubmission" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "trackingNumber" TEXT UNIQUE NOT NULL,
    "profileId" TEXT,
    "districtNumber" INT DEFAULT 4281,
    "districtId" TEXT,
    "organizationType" TEXT NOT NULL DEFAULT 'rotary',
    "clubName" TEXT NOT NULL,
    "submissionType" TEXT NOT NULL DEFAULT 'create',
    "applicantName" TEXT NOT NULL,
    "applicantEmail" TEXT NOT NULL,
    "applicantPhone" TEXT,
    "applicantRole" TEXT,
    "dataConsent" BOOLEAN DEFAULT TRUE,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'recibida',
    "adminFeedback" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMPTZ,
    "draftToken" TEXT,
    history JSONB DEFAULT '[]'::jsonb,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
  )`);

  await db.query(`CREATE INDEX IF NOT EXISTS idx_dcs_tracking ON "DistrictClubSubmission"("trackingNumber")`).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS idx_dcs_status ON "DistrictClubSubmission"("districtNumber", status)`).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS idx_dcs_draft ON "DistrictClubSubmission"("draftToken")`).catch(() => {});

  // 3. Semilla inicial inteligente para Distrito 4281 (idempotente)
  // Si no hay perfiles creados para el Distrito 4281, sembramos los clubes oficiales de CLUBS_4281
  try {
    const { rows: countRows } = await db.query(
      `SELECT COUNT(*)::int as count FROM "DistrictClubProfile" WHERE "districtNumber" = 4281`
    );
    if (countRows[0]?.count === 0) {
      console.log('[ensureDistrictClubDirectorySchema] Sembrando catálogo base de clubes para Distrito 4281...');
      
      // Buscar información existente en la tabla Club para enriquecer
      const { rows: existingClubs } = await db.query(
        `SELECT id, name, city, logo, description, "districtId" FROM "Club" WHERE status != 'inactive'`
      );
      const existingMap = new Map();
      for (const ec of existingClubs) {
        existingMap.set(norm(ec.name), ec);
      }

      const defaultDistrictId = 'cb9fa007-a1aa-4555-94bb-23df5ef9d474'; // Distrito 4281
      for (const rawName of CLUBS_4281) {
        const cleanShort = rawName.trim();
        const officialName = cleanShort.toLowerCase().startsWith('e-club')
          ? `Rotary ${cleanShort}`
          : cleanShort.toLowerCase().startsWith('club rotario')
          ? cleanShort
          : `Club Rotario ${cleanShort}`;
        const slug = slugifyClub(cleanShort);

        // Intentar cruce con club en base de datos
        const match = existingMap.get(norm(officialName)) || existingMap.get(norm(cleanShort));
        const matchedCity = match?.city || (cleanShort.includes('Bogotá') ? 'Bogotá' : cleanShort.includes('Cali') ? 'Cali' : cleanShort.includes('Pasto') ? 'Pasto' : cleanShort.includes('Ibagué') ? 'Ibagué' : cleanShort.includes('Pereira') ? 'Pereira' : cleanShort.includes('Tuluá') ? 'Tuluá' : cleanShort.includes('Armenia') ? 'Armenia' : cleanShort);

        const initialData = {
          officialName,
          shortName: cleanShort,
          city: matchedCity,
          description: match?.description || `Comunidad de líderes y personas de acción comprometidas con el servicio y la transformación comunitaria en ${matchedCity}.`,
          logoUrl: match?.logo || null,
          rotaryPeriod: '2026–2027',
          status: 'published'
        };
        const completion = calculateProfileCompletion(initialData);

        await db.query(
          `INSERT INTO "DistrictClubProfile" (
            "clubId", "districtId", "districtNumber", "organizationType",
            "officialName", "shortName", slug, city, country,
            description, "logoUrl", "currentPresident", "rotaryPeriod",
            "completionPercentage", status, "lastUpdatedPeriod"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT DO NOTHING`,
          [
            match?.id || null,
            defaultDistrictId,
            4281,
            'rotary',
            officialName,
            cleanShort,
            slug,
            matchedCity,
            'Colombia',
            initialData.description,
            initialData.logoUrl,
            null,
            '2026–2027',
            completion,
            'published',
            '2026–2027'
          ]
        );
      }
      console.log(`[ensureDistrictClubDirectorySchema] ${CLUBS_4281.length} clubes sembrados exitosamente para Distrito 4281.`);
    }
  } catch (err) {
    console.error('[ensureDistrictClubDirectorySchema] Error al sembrar clubes base:', err.message);
  }

  _ready = true;
}
