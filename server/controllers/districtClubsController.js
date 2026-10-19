// ════════════════════════════════════════════════════════════════════════════
// Controlador del Directorio Distrital de Clubes
// Rotary, Rotaract e Interact — Rotary Distrito 4281 & Multidistrito
// ════════════════════════════════════════════════════════════════════════════

import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../lib/db.js';
import {
  ensureDistrictClubDirectorySchema,
  slugifyClub,
  calculateProfileCompletion,
  calculateIGI
} from '../lib/ensureDistrictClubDirectorySchema.js';
import { CLUBS_4281, CLUBS_BY_DISTRICT_NUMBER, districtNumberOf } from '../lib/rotaryClubs.js';
import { norm, clubDisplayName } from '../lib/publicClubs.js';

console.log('[districtClubsController] v4.1214.0 cargado — Integración Rotary en Acción y Portal de Autogestión');

const JWT_SECRET = process.env.JWT_SECRET || 'rotary_secret_key_2026';
const PORTAL_AUDIENCE = 'rotary-club-portal';
const TOKEN_TTL = '30d';

export const signPortalToken = (account, profile, { remember = true } = {}) => jwt.sign(
  {
    sub: account.id,
    email: account.email,
    profileId: account.clubProfileId || profile?.id,
    clubName: account.clubName || profile?.officialName,
    role: account.role || 'club_manager',
    aud: PORTAL_AUDIENCE
  },
  JWT_SECRET,
  { expiresIn: remember ? TOKEN_TTL : '24h' }
);

/** Middleware para rutas del portal de autogestión de club */
export const portalAuth = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Inicia sesión para continuar en el portal del club.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET, { audience: PORTAL_AUDIENCE });
    req.portalUser = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Tu sesión en el portal expiró. Vuelve a ingresar.' });
  }
};

/** Manejador genérico de errores */
const fail = (res, e, status = 500) => {
  console.error('[districtClubsController]', e);
  res.status(status).json({ error: e.message || 'Error en el módulo de directorio de clubes' });
};

/** Genera un código de seguimiento legible y seguro */
function generateTrackingNumber(districtNumber, clubName) {
  const year = new Date().getFullYear();
  const slugPart = slugifyClub(clubName).split('-')[0].toUpperCase().slice(0, 6) || 'CLUB';
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `DIR-${districtNumber}-${year}-${slugPart}-${randomSuffix}`;
}

// ─── 1. GET /api/district-clubs/config ───────────────────────────────────────
export const getDirectoryConfig = async (req, res) => {
  try {
    await ensureDistrictClubDirectorySchema();
    const distNum = Number(req.query.district) || 4281;

    // Catálogo oficial curado
    const catalogNames = CLUBS_BY_DISTRICT_NUMBER[distNum] || CLUBS_4281;
    const officialCatalog = catalogNames.map(name => ({
      name,
      display: clubDisplayName(name),
      slug: slugifyClub(name),
      district: distNum
    }));

    // Métricas globales de perfiles para este distrito
    const { rows: statsRows } = await db.query(
      `SELECT 
        COUNT(*)::int as total,
        COUNT(CASE WHEN "organizationType" = 'rotary' THEN 1 END)::int as rotary,
        COUNT(CASE WHEN "organizationType" = 'rotaract' THEN 1 END)::int as rotaract,
        COUNT(CASE WHEN "organizationType" = 'interact' THEN 1 END)::int as interact,
        COUNT(CASE WHEN status = 'published' THEN 1 END)::int as published,
        COUNT(CASE WHEN status = 'draft' THEN 1 END)::int as drafts,
        ROUND(AVG("completionPercentage"))::int as "avgCompletion"
       FROM "DistrictClubProfile"
       WHERE "districtNumber" = $1`,
      [distNum]
    );

    const stats = statsRows[0] || {
      total: 0, rotary: 0, rotaract: 0, interact: 0, published: 0, drafts: 0, avgCompletion: 0
    };

    // Solicitudes pendientes de revisión
    const { rows: pendingRows } = await db.query(
      `SELECT COUNT(*)::int as pending 
       FROM "DistrictClubSubmission" 
       WHERE "districtNumber" = $1 AND status IN ('recibida', 'en_revision')`,
      [distNum]
    );
    const pendingSubmissions = pendingRows[0]?.pending || 0;

    res.json({
      ok: true,
      districtNumber: distNum,
      rotaryPeriod: '2026–2027',
      officialCatalog,
      stats,
      pendingSubmissions
    });
  } catch (e) {
    fail(res, e);
  }
};

// ─── 2. GET /api/district-clubs/public ───────────────────────────────────────
export const getPublicDirectory = async (req, res) => {
  try {
    await ensureDistrictClubDirectorySchema();
    const distNum = Number(req.query.district) || 4281;
    const type = req.query.type ? String(req.query.type).toLowerCase() : 'all';
    const q = req.query.q ? norm(req.query.q) : '';
    const city = req.query.city ? String(req.query.city).trim() : '';

    let whereClause = `WHERE "districtNumber" = $1 AND status = 'published'`;
    const params = [distNum];
    let pIdx = 2;

    if (type !== 'all' && ['rotary', 'rotaract', 'interact'].includes(type)) {
      whereClause += ` AND "organizationType" = $${pIdx}`;
      params.push(type);
      pIdx++;
    }

    if (city) {
      whereClause += ` AND LOWER(city) = LOWER($${pIdx})`;
      params.push(city);
      pIdx++;
    }

    const { rows: clubs } = await db.query(
      `SELECT 
        id, "clubId", "districtNumber", "organizationType", "officialName", "shortName",
        slug, city, state, country, "foundationYear", motto, description,
        "currentPresident", "rotaryPeriod", "completionPercentage", "lastUpdatedPeriod",
        "logoUrl", "coverImageUrl", "meetingAddress", "meetingSchedule", "meetingCity",
        "contactEmail", "contactPhone", "websiteUrl", "socialMedia", "serviceAreas",
        "publishedAt"
       FROM "DistrictClubProfile"
       ${whereClause}
       ORDER BY "officialName" ASC`,
      params
    );

    // Filtrar por término de búsqueda en memoria con algoritmo fonético/ortográfico `norm`
    let filteredClubs = clubs;
    if (q) {
      filteredClubs = clubs.filter(c => {
        const text = `${norm(c.officialName)} ${norm(c.shortName)} ${norm(c.city)} ${norm(c.state)} ${norm(c.currentPresident)} ${norm(c.description)}`;
        return text.includes(q);
      });
    }

    // Conteos globales para tabs
    const { rows: countRows } = await db.query(
      `SELECT 
        COUNT(*)::int as total,
        COUNT(CASE WHEN "organizationType" = 'rotary' THEN 1 END)::int as rotary,
        COUNT(CASE WHEN "organizationType" = 'rotaract' THEN 1 END)::int as rotaract,
        COUNT(CASE WHEN "organizationType" = 'interact' THEN 1 END)::int as interact
       FROM "DistrictClubProfile"
       WHERE "districtNumber" = $1 AND status = 'published'`,
      [distNum]
    );

    // Listado de ciudades únicas para selector
    const { rows: cityRows } = await db.query(
      `SELECT DISTINCT city FROM "DistrictClubProfile"
       WHERE "districtNumber" = $1 AND status = 'published' AND city IS NOT NULL AND city != ''
       ORDER BY city ASC`,
      [distNum]
    );

    res.json({
      ok: true,
      clubs: filteredClubs,
      total: filteredClubs.length,
      counts: countRows[0] || { total: 0, rotary: 0, rotaract: 0, interact: 0 },
      cities: cityRows.map(r => r.city)
    });
  } catch (e) {
    fail(res, e);
  }
};

// ─── 3. GET /api/district-clubs/profile/:type/:slug ──────────────────────────
export const getPublicClubProfile = async (req, res) => {
  try {
    await ensureDistrictClubDirectorySchema();
    const { type, slug } = req.params;
    const distNum = Number(req.query.district) || 4281;

    const cleanType = String(type || 'rotary').toLowerCase();
    const cleanSlug = String(slug || '').toLowerCase().trim();

    // 1. Buscar en DistrictClubProfile por tipo y slug
    let { rows } = await db.query(
      `SELECT * FROM "DistrictClubProfile"
       WHERE "districtNumber" = $1 
         AND "organizationType" = $2 
         AND slug = $3 
         AND status = 'published'`,
      [distNum, cleanType, cleanSlug]
    );

    // 2. Si no se encontró por slug exacto, intentar por coincidencia parcial de slug o nombre
    if (rows.length === 0) {
      const fallback = await db.query(
        `SELECT * FROM "DistrictClubProfile"
         WHERE "districtNumber" = $1 
           AND "organizationType" = $2 
           AND (slug LIKE $3 OR LOWER("shortName") = LOWER($4) OR LOWER("officialName") LIKE LOWER($5))
           AND status = 'published'
         LIMIT 1`,
        [distNum, cleanType, `%${cleanSlug}%`, cleanSlug.replace(/-/g, ' '), `%${cleanSlug.replace(/-/g, ' ')}%`]
      );
      rows = fallback.rows;
    }

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Club no encontrado en el directorio distrital' });
    }

    const club = rows[0];

    // Buscar clubes cercanos o del mismo distrito para recomendación "Otros clubes del distrito"
    const { rows: related } = await db.query(
      `SELECT id, "organizationType", "officialName", "shortName", slug, city, "logoUrl"
       FROM "DistrictClubProfile"
       WHERE "districtNumber" = $1 AND id != $2 AND status = 'published'
       ORDER BY RANDOM()
       LIMIT 3`,
      [distNum, club.id]
    );

    res.json({
      ok: true,
      club,
      related
    });
  } catch (e) {
    fail(res, e);
  }
};

// ─── 4. POST /api/district-clubs/submit (PÚBLICO) ────────────────────────────
export const submitClubDirectoryRequest = async (req, res) => {
  try {
    await ensureDistrictClubDirectorySchema();
    const data = req.body || {};

    const distNum = Number(data.districtNumber) || 4281;
    const orgType = ['rotary', 'rotaract', 'interact'].includes(data.organizationType)
      ? data.organizationType
      : 'rotary';
    const clubName = String(data.officialName || data.clubName || '').trim();

    if (!clubName) {
      return res.status(400).json({ error: 'El nombre del club es obligatorio.' });
    }

    const applicantName = String(data.applicantName || '').trim();
    const applicantEmail = String(data.applicantEmail || '').trim().toLowerCase();
    const applicantPhone = String(data.applicantPhone || '').trim();
    const applicantRole = String(data.applicantRole || 'Socio / Representante').trim();

    if (!applicantName || !applicantEmail) {
      return res.status(400).json({ error: 'El nombre y correo del solicitante son obligatorios.' });
    }

    const utmSource = data.utmSource || data.utm_source || null;
    const utmMedium = data.utmMedium || data.utm_medium || null;
    const utmCampaign = data.utmCampaign || data.utm_campaign || null;
    const utmContent = data.utmContent || data.utm_content || null;

    const trackingNumber = generateTrackingNumber(distNum, clubName);
    const submissionId = randomUUID();

    // Si es una solicitud de actualización, buscar profileId correspondiente
    let targetProfileId = data.profileId || null;
    if (!targetProfileId) {
      const { rows: match } = await db.query(
        `SELECT id FROM "DistrictClubProfile" 
         WHERE "districtNumber" = $1 AND "organizationType" = $2 AND (LOWER("officialName") = LOWER($3) OR LOWER("shortName") = LOWER($3))
         LIMIT 1`,
        [distNum, orgType, clubName]
      );
      if (match.length > 0) targetProfileId = match[0].id;
    }

    // Vincular manager en el perfil si no tiene asignado
    if (targetProfileId) {
      await db.query(
        `UPDATE "DistrictClubProfile" SET
          "primaryManagerEmail" = COALESCE("primaryManagerEmail", $1),
          "primaryManagerName" = COALESCE("primaryManagerName", $2),
          "primaryManagerPhone" = COALESCE("primaryManagerPhone", $3)
         WHERE id = $4`,
        [applicantEmail, applicantName, applicantPhone || null, targetProfileId]
      );
    }

    // Creación opcional de cuenta de autogestión durante el envío
    let portalToken = null;
    if (data.password && String(data.password).length >= 8) {
      try {
        const passwordHash = await bcrypt.hash(String(data.password), 10);
        const { rows: existingAcc } = await db.query(
          `SELECT id FROM "DistrictClubAccount" WHERE lower(email) = lower($1) LIMIT 1`,
          [applicantEmail]
        );
        let accountObj;
        if (existingAcc.length > 0) {
          const { rows: upRows } = await db.query(
            `UPDATE "DistrictClubAccount" SET
              "passwordHash" = $1,
              "clubProfileId" = COALESCE($2, "clubProfileId"),
              "clubName" = COALESCE($3, "clubName"),
              "updatedAt" = NOW()
             WHERE id = $4 RETURNING *`,
            [passwordHash, targetProfileId, clubName, existingAcc[0].id]
          );
          accountObj = upRows[0];
        } else {
          const { rows: inRows } = await db.query(
            `INSERT INTO "DistrictClubAccount" (
              id, email, "passwordHash", "fullName", phone, "clubProfileId", "clubName", role, "isVerified"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'club_manager', TRUE)
            RETURNING *`,
            [randomUUID(), applicantEmail, passwordHash, applicantName, applicantPhone || null, targetProfileId, clubName]
          );
          accountObj = inRows[0];
        }
        if (accountObj) {
          portalToken = signPortalToken(accountObj, { id: targetProfileId, officialName: clubName });
        }
      } catch (accErr) {
        console.warn('[districtClubsController] No se pudo crear cuenta automática:', accErr.message);
      }
    }

    const initialHistory = [{
      event: 'solicitud_recibida',
      date: new Date().toISOString(),
      by: `${applicantName} (${applicantEmail})`,
      role: applicantRole,
      utmCampaign: utmCampaign || 'organico',
      note: data.submissionType === 'update' ? 'Solicitud de actualización de perfil' : 'Solicitud de registro inicial de club'
    }];

    await db.query(
      `INSERT INTO "DistrictClubSubmission" (
        id, "trackingNumber", "profileId", "districtNumber", "organizationType",
        "clubName", "submissionType", "applicantName", "applicantEmail", "applicantPhone",
        "applicantRole", "dataConsent", payload, status, history, "draftToken",
        "utmSource", "utmMedium", "utmCampaign", "utmContent", "stepReached",
        "formStartedAt", "lastActiveAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, 7, NOW(), NOW())`,
      [
        submissionId,
        trackingNumber,
        targetProfileId,
        distNum,
        orgType,
        clubName,
        data.submissionType === 'update' ? 'update' : 'create',
        applicantName,
        applicantEmail,
        applicantPhone,
        applicantRole,
        data.dataConsent !== false,
        JSON.stringify(data),
        'recibida',
        JSON.stringify(initialHistory),
        data.draftToken || null,
        utmSource,
        utmMedium,
        utmCampaign,
        utmContent
      ]
    );

    res.json({
      ok: true,
      trackingNumber,
      submissionId,
      portalToken,
      portalPath: portalToken ? '/clubes/portal' : null,
      message: 'Solicitud recibida exitosamente. Nuestro equipo distrital la revisará pronto.'
    });
  } catch (e) {
    fail(res, e);
  }
};

// ─── 5. BORRADORES TEMPORALES (DRAFTS) ───────────────────────────────────────
export const saveFormDraft = async (req, res) => {
  try {
    await ensureDistrictClubDirectorySchema();
    const { draftToken, payload, stepReached, utmSource, utmMedium, utmCampaign, utmContent } = req.body || {};
    const token = draftToken || `draft_${randomUUID()}`;

    const applicantName = payload?.applicantName || null;
    const applicantEmail = payload?.applicantEmail || null;
    const applicantPhone = payload?.applicantPhone || null;
    const clubName = payload?.officialName || 'Borrador sin nombre';
    const step = Number(stepReached) || Number(payload?.currentStep) || 1;

    // Upsert borrador en submission con status 'borrador'
    const { rows: existing } = await db.query(
      `SELECT id FROM "DistrictClubSubmission" WHERE "draftToken" = $1 LIMIT 1`,
      [token]
    );

    if (existing.length > 0) {
      await db.query(
        `UPDATE "DistrictClubSubmission" SET
          payload = $1,
          "clubName" = COALESCE($2, "clubName"),
          "applicantName" = COALESCE($3, "applicantName"),
          "applicantEmail" = COALESCE($4, "applicantEmail"),
          "applicantPhone" = COALESCE($5, "applicantPhone"),
          "stepReached" = GREATEST("stepReached", $6),
          "utmSource" = COALESCE($7, "utmSource"),
          "utmCampaign" = COALESCE($8, "utmCampaign"),
          "lastActiveAt" = NOW(),
          "updatedAt" = NOW()
         WHERE "draftToken" = $9`,
        [
          JSON.stringify(payload),
          clubName,
          applicantName,
          applicantEmail,
          applicantPhone,
          step,
          utmSource || null,
          utmCampaign || null,
          token
        ]
      );
    } else {
      const trackingNumber = `BORR-${Date.now().toString(36).toUpperCase()}`;
      await db.query(
        `INSERT INTO "DistrictClubSubmission" (
          id, "trackingNumber", "districtNumber", "organizationType", "clubName",
          "applicantName", "applicantEmail", "applicantPhone", payload, status, "draftToken",
          "utmSource", "utmMedium", "utmCampaign", "utmContent", "stepReached",
          "formStartedAt", "lastActiveAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())`,
        [
          randomUUID(),
          trackingNumber,
          Number(payload?.districtNumber) || 4281,
          payload?.organizationType || 'rotary',
          clubName,
          applicantName || 'Borrador en curso',
          applicantEmail || 'borrador@clubplatform.org',
          applicantPhone || null,
          JSON.stringify(payload),
          'borrador',
          token,
          utmSource || null,
          utmMedium || null,
          utmCampaign || null,
          utmContent || null,
          step
        ]
      );
    }

    res.json({ ok: true, draftToken: token });
  } catch (e) {
    fail(res, e);
  }
};

export const getFormDraft = async (req, res) => {
  try {
    await ensureDistrictClubDirectorySchema();
    const { token } = req.params;
    const { rows } = await db.query(
      `SELECT payload, status, "updatedAt" FROM "DistrictClubSubmission" WHERE "draftToken" = $1 LIMIT 1`,
      [token]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Borrador no encontrado' });
    res.json({ ok: true, payload: rows[0].payload, updatedAt: rows[0].updatedAt });
  } catch (e) {
    fail(res, e);
  }
};

// ─── 6. GET /api/district-clubs/admin/list (ADMIN) ──────────────────────────
export const getAdminClubList = async (req, res) => {
  try {
    await ensureDistrictClubDirectorySchema();
    const distNum = Number(req.query.district) || 4281;
    const type = req.query.type || 'all';
    const status = req.query.status || 'all';
    const activity = req.query.activity || 'all';
    const q = req.query.q ? norm(req.query.q) : '';

    let where = `WHERE p."districtNumber" = $1`;
    const params = [distNum];
    let pIdx = 2;

    if (type !== 'all') {
      where += ` AND p."organizationType" = $${pIdx}`;
      params.push(type);
      pIdx++;
    }

    if (status !== 'all') {
      where += ` AND p.status = $${pIdx}`;
      params.push(status);
      pIdx++;
    }

    const { rows: clubs } = await db.query(
      `SELECT 
        p.id, p."clubId", p."districtNumber", p."organizationType", p."officialName", p."shortName",
        p.slug, p.city, p.state, p.country, p."foundationYear", p."currentPresident", p."rotaryPeriod",
        p."completionPercentage", p.status, p."lastUpdatedPeriod", p."logoUrl", p."coverImageUrl",
        p."contactEmail", p."contactPhone", p."websiteUrl", p."primaryManagerEmail", p."primaryManagerName",
        p."primaryManagerPhone", p."pendingProtectedChanges", p."publishedAt", p."updatedAt",
        COALESCE(SUM(CASE WHEN s.status != 'borrador' THEN 1 ELSE 0 END), 0)::int as "submissionsCount",
        COALESCE(SUM(CASE WHEN s.status IN ('recibida', 'en_revision', 'correcciones_solicitadas') THEN 1 ELSE 0 END), 0)::int as "pendingSubmissionsCount",
        COALESCE(SUM(CASE WHEN s.status = 'borrador' THEN 1 ELSE 0 END), 0)::int as "draftsCount",
        MAX(s."lastActiveAt") as "lastSubmissionActivity"
       FROM "DistrictClubProfile" p
       LEFT JOIN "DistrictClubSubmission" s ON s."profileId" = p.id OR lower(s."clubName") = lower(p."officialName")
       ${where}
       GROUP BY p.id
       ORDER BY p."officialName" ASC`,
      params
    );

    const enriched = clubs.map(c => {
      let rotaryActivityStatus = 'sin_iniciar';
      if (c.pendingSubmissionsCount > 0) rotaryActivityStatus = 'solicitud_pendiente';
      else if (c.draftsCount > 0) rotaryActivityStatus = 'borrador_en_curso';
      else if (c.submissionsCount > 0) rotaryActivityStatus = 'actualizado';

      const igi = calculateIGI(c);

      return {
        ...c,
        rotaryActivityStatus,
        igi: igi.score,
        igiLevel: igi.level,
        igiLevelLabel: igi.levelLabel,
        igiBadgeColor: igi.badgeColor,
        igiData: igi
      };
    });

    let filtered = enriched;
    if (activity !== 'all') {
      filtered = filtered.filter(c => c.rotaryActivityStatus === activity);
    }
    if (q) {
      filtered = filtered.filter(c => {
        const text = `${norm(c.officialName)} ${norm(c.shortName)} ${norm(c.city)} ${norm(c.state)} ${norm(c.currentPresident)} ${norm(c.primaryManagerName || '')}`;
        return text.includes(q);
      });
    }

    const total = enriched.length;
    const published = enriched.filter(c => c.status === 'published').length;
    const drafts = enriched.filter(c => c.status === 'draft').length;
    const incomplete = enriched.filter(c => (c.completionPercentage || 0) < 30).length;
    const completed = enriched.filter(c => (c.completionPercentage || 0) >= 80).length;
    const inProgress = enriched.filter(c => (c.completionPercentage || 0) >= 30 && (c.completionPercentage || 0) < 80).length;
    const withManager = enriched.filter(c => !!c.primaryManagerEmail).length;
    const pendingUpdates = enriched.filter(c => c.pendingSubmissionsCount > 0 || !!c.pendingProtectedChanges).length;
    const activeInRotary = enriched.filter(c => c.rotaryActivityStatus !== 'sin_iniciar').length;
    const avgCompletion = total > 0 ? Math.round(enriched.reduce((acc, c) => acc + (c.completionPercentage || 0), 0) / total) : 0;
    const avgIGI = total > 0 ? Math.round(enriched.reduce((acc, c) => acc + (c.igi || 0), 0) / total) : 0;
    const igiLideres = enriched.filter(c => (c.igi || 0) >= 80).length;
    const igiActivos = enriched.filter(c => (c.igi || 0) >= 60 && (c.igi || 0) < 80).length;
    const igiSeguimiento = enriched.filter(c => (c.igi || 0) >= 40 && (c.igi || 0) < 60).length;
    const igiCriticos = enriched.filter(c => (c.igi || 0) < 40).length;

    res.json({
      ok: true,
      clubs: filtered,
      total: filtered.length,
      stats: {
        total,
        published,
        drafts,
        incomplete,
        completed,
        inProgress,
        withManager,
        pendingUpdates,
        activeInRotary,
        avgCompletion,
        avgIGI,
        igiLideres,
        igiActivos,
        igiSeguimiento,
        igiCriticos
      }
    });
  } catch (e) {
    fail(res, e);
  }
};

// ─── 7. GET /api/district-clubs/admin/submissions (ADMIN) ───────────────────
export const getAdminSubmissions = async (req, res) => {
  try {
    await ensureDistrictClubDirectorySchema();
    const distNum = Number(req.query.district) || 4281;
    const status = req.query.status || 'all';
    const includeDrafts = req.query.includeDrafts === 'true';

    let where = `WHERE s."districtNumber" = $1`;
    const params = [distNum];
    let pIdx = 2;

    if (status === 'borrador') {
      where += ` AND s.status = 'borrador'`;
    } else if (status !== 'all') {
      where += ` AND s.status = $${pIdx}`;
      params.push(status);
      pIdx++;
    } else if (!includeDrafts) {
      where += ` AND s.status != 'borrador'`;
    }

    const { rows: submissions } = await db.query(
      `SELECT s.*, 
              p.slug as "profileSlug", 
              p.city as "profileCity", 
              p."completionPercentage" as "profileCompletionPercentage",
              p.status as "profileStatus",
              p."primaryManagerEmail",
              p."primaryManagerName",
              p."primaryManagerPhone",
              p."contactPhone",
              p."rotaryPeriod" as "profileRotaryPeriod",
              p."lastUpdatedPeriod" as "profileLastUpdatedPeriod",
              p."updatedAt" as "profileUpdatedAt",
              p."pendingProtectedChanges" as "profilePendingProtectedChanges"
       FROM "DistrictClubSubmission" s
       LEFT JOIN "DistrictClubProfile" p ON p.id = s."profileId" OR lower(p."officialName") = lower(s."clubName")
       ${where}
       ORDER BY s."updatedAt" DESC, s."createdAt" DESC`,
      params
    );

    const enriched = submissions.map(s => {
      const pseudoClub = {
        completionPercentage: s.profileCompletionPercentage,
        rotaryPeriod: s.profileRotaryPeriod,
        lastUpdatedPeriod: s.profileLastUpdatedPeriod,
        updatedAt: s.profileUpdatedAt,
        primaryManagerEmail: s.primaryManagerEmail,
        primaryManagerName: s.primaryManagerName,
        primaryManagerPhone: s.primaryManagerPhone,
        contactPhone: s.contactPhone,
        submissionsCount: 1,
        pendingProtectedChanges: s.profilePendingProtectedChanges
      };
      const igi = calculateIGI(pseudoClub);
      return {
        ...s,
        clubIgi: igi.score,
        clubIgiLevel: igi.level,
        clubIgiLabel: igi.levelLabel,
        clubIgiBadgeColor: igi.badgeColor
      };
    });

    res.json({
      ok: true,
      submissions: enriched,
      total: enriched.length
    });
  } catch (e) {
    fail(res, e);
  }
};

// ─── 7b. GET /api/district-clubs/admin/club/:id (ADMIN) ──────────────────────
export const getAdminClubDetail = async (req, res) => {
  try {
    await ensureDistrictClubDirectorySchema();
    const { id } = req.params;

    const { rows: profiles } = await db.query(
      `SELECT * FROM "DistrictClubProfile" WHERE id = $1 LIMIT 1`,
      [id]
    );

    if (profiles.length === 0) {
      return res.status(404).json({ error: 'Club no encontrado' });
    }

    const club = profiles[0];

    const { rows: submissions } = await db.query(
      `SELECT * FROM "DistrictClubSubmission" 
       WHERE "profileId" = $1 OR lower("clubName") = lower($2)
       ORDER BY "updatedAt" DESC`,
      [club.id, club.officialName]
    );

    const { rows: accounts } = await db.query(
      `SELECT id, email, "fullName", phone, role, "isVerified", "lastLoginAt", "createdAt" 
       FROM "DistrictClubAccount" 
       WHERE "clubProfileId" = $1 OR lower(email) = lower($2)
       ORDER BY "createdAt" DESC`,
      [club.id, club.primaryManagerEmail || '']
    );

    const igi = calculateIGI(club, submissions);

    res.json({
      ok: true,
      club: {
        ...club,
        igi: igi.score,
        igiLevel: igi.level,
        igiLevelLabel: igi.levelLabel,
        igiBadgeColor: igi.badgeColor,
        igiData: igi
      },
      submissions,
      accounts
    });
  } catch (e) {
    fail(res, e);
  }
};

// ─── 8. POST /api/district-clubs/admin/submissions/:id/review (ADMIN) ───────
export const reviewSubmission = async (req, res) => {
  try {
    await ensureDistrictClubDirectorySchema();
    const { id } = req.params;
    const { action, feedback } = req.body; // action: 'approve' | 'request_changes' | 'reject' | 'in_review'
    const reviewerName = req.user?.name || req.user?.email || 'Administrador Distrital';

    const { rows: subRows } = await db.query(
      `SELECT * FROM "DistrictClubSubmission" WHERE id = $1 LIMIT 1`,
      [id]
    );

    if (subRows.length === 0) {
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }

    const sub = subRows[0];
    const payload = typeof sub.payload === 'string' ? JSON.parse(sub.payload) : sub.payload;
    const currentHistory = Array.isArray(sub.history) ? sub.history : [];

    let newStatus = sub.status;
    let historyNote = '';

    if (action === 'approve') {
      newStatus = 'aprobada';
      historyNote = 'Solicitud aprobada y publicada automáticamente en el directorio distrital';

      // Actualizar o crear DistrictClubProfile con los datos del payload
      const completion = calculateProfileCompletion(payload);
      const cleanSlug = payload.slug || slugifyClub(payload.officialName || sub.clubName);
      const rotaryPeriod = payload.rotaryPeriod || '2026–2027';

      if (sub.profileId) {
        // Actualización de perfil existente
        await db.query(
          `UPDATE "DistrictClubProfile" SET
            "officialName" = COALESCE($1, "officialName"),
            "shortName" = COALESCE($2, "shortName"),
            slug = COALESCE($3, slug),
            city = COALESCE($4, city),
            state = COALESCE($5, state),
            "foundationYear" = COALESCE($6, "foundationYear"),
            motto = COALESCE($7, motto),
            description = COALESCE($8, description),
            history = COALESCE($9, history),
            mission = COALESCE($10, mission),
            vision = COALESCE($11, vision),
            "serviceAreas" = COALESCE($12, "serviceAreas"),
            "currentPresident" = COALESCE($13, "currentPresident"),
            "rotaryPeriod" = $14,
            "boardMembers" = COALESCE($15, "boardMembers"),
            "memberCount" = COALESCE($16, "memberCount"),
            "joinInfo" = COALESCE($17, "joinInfo"),
            "featuredProjects" = COALESCE($18, "featuredProjects"),
            "logoUrl" = COALESCE($19, "logoUrl"),
            "coverImageUrl" = COALESCE($20, "coverImageUrl"),
            gallery = COALESCE($21, gallery),
            "meetingAddress" = COALESCE($22, "meetingAddress"),
            "meetingSchedule" = COALESCE($23, "meetingSchedule"),
            "meetingCity" = COALESCE($24, "meetingCity"),
            "contactEmail" = COALESCE($25, "contactEmail"),
            "contactPhone" = COALESCE($26, "contactPhone"),
            "websiteUrl" = COALESCE($27, "websiteUrl"),
            "socialMedia" = COALESCE($28, "socialMedia"),
            status = 'published',
            "completionPercentage" = $29,
            "lastUpdatedPeriod" = $14,
            "publishedAt" = NOW(),
            "publishedBy" = $30,
            "updatedAt" = NOW()
          WHERE id = $31`,
          [
            payload.officialName || sub.clubName,
            payload.shortName || sub.clubName,
            cleanSlug,
            payload.city || null,
            payload.state || null,
            payload.foundationYear ? Number(payload.foundationYear) : null,
            payload.motto || null,
            payload.description || null,
            payload.history || null,
            payload.mission || null,
            payload.vision || null,
            JSON.stringify(payload.serviceAreas || []),
            payload.currentPresident || null,
            rotaryPeriod,
            JSON.stringify(payload.boardMembers || []),
            payload.memberCount ? Number(payload.memberCount) : null,
            payload.joinInfo || null,
            JSON.stringify(payload.featuredProjects || []),
            payload.logoUrl || null,
            payload.coverImageUrl || null,
            JSON.stringify(payload.gallery || []),
            payload.meetingAddress || null,
            payload.meetingSchedule || null,
            payload.meetingCity || payload.city || null,
            payload.contactEmail || null,
            payload.contactPhone || null,
            payload.websiteUrl || null,
            JSON.stringify(payload.socialMedia || {}),
            completion,
            reviewerName,
            sub.profileId
          ]
        );
      } else {
        // Creación de nuevo perfil
        const newProfileId = randomUUID();
        await db.query(
          `INSERT INTO "DistrictClubProfile" (
            id, "districtNumber", "organizationType", "officialName", "shortName",
            slug, city, state, country, "foundationYear", motto, description, history,
            mission, vision, "serviceAreas", "currentPresident", "rotaryPeriod",
            "boardMembers", "memberCount", "joinInfo", "featuredProjects", "logoUrl",
            "coverImageUrl", gallery, "meetingAddress", "meetingSchedule", "meetingCity",
            "contactEmail", "contactPhone", "websiteUrl", "socialMedia", status,
            "completionPercentage", "lastUpdatedPeriod", "publishedAt", "publishedBy"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, 'published', $33, $34, NOW(), $35)`,
          [
            newProfileId,
            sub.districtNumber,
            sub.organizationType,
            payload.officialName || sub.clubName,
            payload.shortName || sub.clubName,
            cleanSlug,
            payload.city || null,
            payload.state || null,
            payload.country || 'Colombia',
            payload.foundationYear ? Number(payload.foundationYear) : null,
            payload.motto || null,
            payload.description || null,
            payload.history || null,
            payload.mission || null,
            payload.vision || null,
            JSON.stringify(payload.serviceAreas || []),
            payload.currentPresident || null,
            rotaryPeriod,
            JSON.stringify(payload.boardMembers || []),
            payload.memberCount ? Number(payload.memberCount) : null,
            payload.joinInfo || null,
            JSON.stringify(payload.featuredProjects || []),
            payload.logoUrl || null,
            payload.coverImageUrl || null,
            JSON.stringify(payload.gallery || []),
            payload.meetingAddress || null,
            payload.meetingSchedule || null,
            payload.meetingCity || payload.city || null,
            payload.contactEmail || null,
            payload.contactPhone || null,
            payload.websiteUrl || null,
            JSON.stringify(payload.socialMedia || {}),
            completion,
            rotaryPeriod,
            reviewerName
          ]
        );
        // Asociar la solicitud al perfil creado
        await db.query(
          `UPDATE "DistrictClubSubmission" SET "profileId" = $1 WHERE id = $2`,
          [newProfileId, id]
        );
      }
    } else if (action === 'request_changes') {
      newStatus = 'correcciones_solicitadas';
      historyNote = `Correcciones solicitadas: ${feedback || 'Revisar información enviada'}`;
    } else if (action === 'reject') {
      newStatus = 'rechazada';
      historyNote = `Solicitud rechazada: ${feedback || 'No cumple requisitos institucionales'}`;
    } else if (action === 'in_review') {
      newStatus = 'en_revision';
      historyNote = 'Solicitud puesta en revisión por el equipo distrital';
    }

    currentHistory.push({
      event: newStatus,
      date: new Date().toISOString(),
      by: reviewerName,
      feedback: feedback || null,
      note: historyNote
    });

    await db.query(
      `UPDATE "DistrictClubSubmission" SET
        status = $1,
        "adminFeedback" = $2,
        "reviewedBy" = $3,
        "reviewedAt" = NOW(),
        history = $4,
        "updatedAt" = NOW()
       WHERE id = $5`,
      [newStatus, feedback || null, reviewerName, JSON.stringify(currentHistory), id]
    );

    res.json({
      ok: true,
      status: newStatus,
      message: `Solicitud marcada como ${newStatus} exitosamente.`
    });
  } catch (e) {
    fail(res, e);
  }
};

// ─── 9. PUT /api/district-clubs/admin/profile/:id (ADMIN) ───────────────────
export const updateClubProfileDirect = async (req, res) => {
  try {
    await ensureDistrictClubDirectorySchema();
    const { id } = req.params;
    const body = req.body || {};
    const reviewerName = req.user?.name || req.user?.email || 'Administrador Distrital';

    const completion = calculateProfileCompletion(body);
    const rotaryPeriod = body.rotaryPeriod || '2026–2027';

    await db.query(
      `UPDATE "DistrictClubProfile" SET
        "officialName" = COALESCE($1, "officialName"),
        "shortName" = COALESCE($2, "shortName"),
        slug = COALESCE($3, slug),
        city = COALESCE($4, city),
        state = COALESCE($5, state),
        "foundationYear" = COALESCE($6, "foundationYear"),
        motto = COALESCE($7, motto),
        description = COALESCE($8, description),
        history = COALESCE($9, history),
        mission = COALESCE($10, mission),
        vision = COALESCE($11, vision),
        "serviceAreas" = COALESCE($12, "serviceAreas"),
        "currentPresident" = COALESCE($13, "currentPresident"),
        "rotaryPeriod" = $14,
        "boardMembers" = COALESCE($15, "boardMembers"),
        "memberCount" = COALESCE($16, "memberCount"),
        "joinInfo" = COALESCE($17, "joinInfo"),
        "featuredProjects" = COALESCE($18, "featuredProjects"),
        "logoUrl" = COALESCE($19, "logoUrl"),
        "coverImageUrl" = COALESCE($20, "coverImageUrl"),
        gallery = COALESCE($21, gallery),
        "meetingAddress" = COALESCE($22, "meetingAddress"),
        "meetingSchedule" = COALESCE($23, "meetingSchedule"),
        "meetingCity" = COALESCE($24, "meetingCity"),
        "contactEmail" = COALESCE($25, "contactEmail"),
        "contactPhone" = COALESCE($26, "contactPhone"),
        "websiteUrl" = COALESCE($27, "websiteUrl"),
        "socialMedia" = COALESCE($28, "socialMedia"),
        status = COALESCE($29, status),
        "completionPercentage" = $30,
        "lastUpdatedPeriod" = $14,
        "publishedBy" = $31,
        "updatedAt" = NOW()
      WHERE id = $32`,
      [
        body.officialName || null,
        body.shortName || null,
        body.slug || null,
        body.city || null,
        body.state || null,
        body.foundationYear ? Number(body.foundationYear) : null,
        body.motto || null,
        body.description || null,
        body.history || null,
        body.mission || null,
        body.vision || null,
        body.serviceAreas ? JSON.stringify(body.serviceAreas) : null,
        body.currentPresident || null,
        rotaryPeriod,
        body.boardMembers ? JSON.stringify(body.boardMembers) : null,
        body.memberCount ? Number(body.memberCount) : null,
        body.joinInfo || null,
        body.featuredProjects ? JSON.stringify(body.featuredProjects) : null,
        body.logoUrl || null,
        body.coverImageUrl || null,
        body.gallery ? JSON.stringify(body.gallery) : null,
        body.meetingAddress || null,
        body.meetingSchedule || null,
        body.meetingCity || body.city || null,
        body.contactEmail || null,
        body.contactPhone || null,
        body.websiteUrl || null,
        body.socialMedia ? JSON.stringify(body.socialMedia) : null,
        body.status || null,
        completion,
        reviewerName,
        id
      ]
    );

    res.json({ ok: true, message: 'Perfil institucional actualizado exitosamente' });
  } catch (e) {
    fail(res, e);
  }
};

// ─── 10. POST /api/district-clubs/admin/profile/:id/toggle-status (ADMIN) ───
export const toggleProfileStatus = async (req, res) => {
  try {
    await ensureDistrictClubDirectorySchema();
    const { id } = req.params;
    const { status } = req.body; // 'published' | 'draft' | 'archived'

    await db.query(
      `UPDATE "DistrictClubProfile" SET
        status = $1,
        "updatedAt" = NOW()
       WHERE id = $2`,
      [status || 'published', id]
    );

    res.json({ ok: true, status });
  } catch (e) {
    fail(res, e);
  }
};

// ─── 11. PORTAL DE AUTOGESTIÓN DEL CLUB ──────────────────────────────────────

/** POST /api/district-clubs/portal/register */
export const portalRegister = async (req, res) => {
  try {
    await ensureDistrictClubDirectorySchema();
    const { email, password, fullName, phone, profileId, clubName } = req.body || {};
    const mail = String(email || '').trim().toLowerCase();
    if (!mail || !password || String(password).length < 8) {
      return res.status(400).json({ error: 'Correo válido y contraseña de al menos 8 caracteres son obligatorios.' });
    }

    const { rows: existing } = await db.query(
      `SELECT * FROM "DistrictClubAccount" WHERE lower(email) = lower($1) LIMIT 1`,
      [mail]
    );

    let account;
    const passwordHash = await bcrypt.hash(String(password), 10);

    if (existing.length > 0) {
      const matches = await bcrypt.compare(String(password), existing[0].passwordHash).catch(() => false);
      if (!matches) {
        return res.status(400).json({ error: 'Este correo ya tiene una cuenta registrada con otra contraseña. Por favor inicia sesión.' });
      }
      account = existing[0];
      if (profileId && !account.clubProfileId) {
        await db.query(`UPDATE "DistrictClubAccount" SET "clubProfileId" = $1, "clubName" = COALESCE($2, "clubName"), "updatedAt" = NOW() WHERE id = $3`, [profileId, clubName || null, account.id]);
        account.clubProfileId = profileId;
      }
    } else {
      const newId = randomUUID();
      const { rows: created } = await db.query(
        `INSERT INTO "DistrictClubAccount" (
          id, email, "passwordHash", "fullName", phone, "clubProfileId", "clubName", role, "isVerified"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'club_manager', TRUE)
        RETURNING *`,
        [newId, mail, passwordHash, fullName || null, phone || null, profileId || null, clubName || null]
      );
      account = created[0];
    }

    let profile = null;
    if (account.clubProfileId) {
      const { rows: profRows } = await db.query(`SELECT * FROM "DistrictClubProfile" WHERE id = $1 LIMIT 1`, [account.clubProfileId]);
      profile = profRows[0] || null;
      if (profile && !profile.primaryManagerEmail) {
        await db.query(`UPDATE "DistrictClubProfile" SET "primaryManagerEmail" = $1, "primaryManagerName" = $2, "primaryManagerPhone" = $3 WHERE id = $4`, [mail, fullName || null, phone || null, profile.id]);
      }
    }

    const token = signPortalToken(account, profile);
    res.json({
      ok: true,
      token,
      account: { id: account.id, email: account.email, fullName: account.fullName, role: account.role },
      profile,
      message: 'Cuenta creada exitosamente para autogestión de club.'
    });
  } catch (e) {
    fail(res, e);
  }
};

/** POST /api/district-clubs/portal/login */
export const portalLogin = async (req, res) => {
  try {
    await ensureDistrictClubDirectorySchema();
    const { email, password, remember } = req.body || {};
    const mail = String(email || '').trim().toLowerCase();

    if (!mail || !password) {
      return res.status(400).json({ error: 'Ingresa correo y contraseña.' });
    }

    const { rows: accRows } = await db.query(
      `SELECT * FROM "DistrictClubAccount" WHERE lower(email) = lower($1) LIMIT 1`,
      [mail]
    );

    let account = accRows[0];
    let isPlatformUser = false;

    // Si no está en DistrictClubAccount, verificar si es usuario de la plataforma principal (User)
    if (!account) {
      const { rows: userRows } = await db.query(
        `SELECT id, email, password, name, phone, "clubId", role FROM "User" WHERE lower(email) = lower($1) LIMIT 1`,
        [mail]
      );
      if (userRows.length > 0) {
        const u = userRows[0];
        const match = await bcrypt.compare(String(password), u.password).catch(() => false);
        if (match) {
          isPlatformUser = true;
          let clubProfileId = null;
          let clubName = null;
          if (u.clubId) {
            const { rows: pRows } = await db.query(`SELECT id, "officialName" FROM "DistrictClubProfile" WHERE "clubId" = $1 LIMIT 1`, [u.clubId]);
            if (pRows[0]) {
              clubProfileId = pRows[0].id;
              clubName = pRows[0].officialName;
            }
          }
          if (!clubProfileId) {
            const { rows: pRows } = await db.query(`SELECT id, "officialName" FROM "DistrictClubProfile" WHERE lower("primaryManagerEmail") = lower($1) LIMIT 1`, [mail]);
            if (pRows[0]) {
              clubProfileId = pRows[0].id;
              clubName = pRows[0].officialName;
            }
          }
          const newId = randomUUID();
          const { rows: bridgeRows } = await db.query(
            `INSERT INTO "DistrictClubAccount" (id, email, "passwordHash", "fullName", phone, "clubProfileId", "clubName", role)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'club_manager')
             RETURNING *`,
            [newId, mail, u.password, u.name, u.phone, clubProfileId, clubName]
          );
          account = bridgeRows[0];
        }
      }
    }

    if (!account) {
      return res.status(401).json({ error: 'Credenciales inválidas. Verifica tu correo y contraseña.' });
    }

    if (!isPlatformUser) {
      const match = await bcrypt.compare(String(password), account.passwordHash).catch(() => false);
      if (!match) {
        return res.status(401).json({ error: 'Credenciales inválidas. Verifica tu correo y contraseña.' });
      }
    }

    await db.query(`UPDATE "DistrictClubAccount" SET "lastLoginAt" = NOW() WHERE id = $1`, [account.id]);

    let profile = null;
    if (account.clubProfileId) {
      const { rows: pRows } = await db.query(`SELECT * FROM "DistrictClubProfile" WHERE id = $1 LIMIT 1`, [account.clubProfileId]);
      profile = pRows[0] || null;
    } else {
      const { rows: pRows } = await db.query(`SELECT * FROM "DistrictClubProfile" WHERE lower("primaryManagerEmail") = lower($1) LIMIT 1`, [mail]);
      if (pRows[0]) {
        profile = pRows[0];
        await db.query(`UPDATE "DistrictClubAccount" SET "clubProfileId" = $1, "clubName" = $2 WHERE id = $3`, [profile.id, profile.officialName, account.id]);
      }
    }

    const token = signPortalToken(account, profile, { remember });
    res.json({
      ok: true,
      token,
      account: { id: account.id, email: account.email, fullName: account.fullName, role: account.role },
      profile
    });
  } catch (e) {
    fail(res, e);
  }
};

/** GET /api/district-clubs/portal/link (Requiere token de sesión Club Platform) */
export const linkPlatformUser = async (req, res) => {
  try {
    await ensureDistrictClubDirectorySchema();
    const mail = String(req.user?.email || '').trim().toLowerCase();
    if (!mail) return res.json({ hasClub: false, email: null });

    let profile = null;
    const { rows: pByEmail } = await db.query(
      `SELECT * FROM "DistrictClubProfile" WHERE lower("primaryManagerEmail") = lower($1) LIMIT 1`,
      [mail]
    );
    if (pByEmail[0]) profile = pByEmail[0];

    if (!profile && req.user?.clubId) {
      const { rows: pByClub } = await db.query(
        `SELECT * FROM "DistrictClubProfile" WHERE "clubId" = $1 LIMIT 1`,
        [req.user.clubId]
      );
      if (pByClub[0]) profile = pByClub[0];
    }

    const { rows: accRows } = await db.query(
      `SELECT * FROM "DistrictClubAccount" WHERE lower(email) = lower($1) LIMIT 1`,
      [mail]
    );
    let account = accRows[0];

    if (!account && profile) {
      const newId = randomUUID();
      const dummyHash = await bcrypt.hash(randomUUID(), 10);
      const { rows: created } = await db.query(
        `INSERT INTO "DistrictClubAccount" (id, email, "passwordHash", "fullName", "clubProfileId", "clubName", role)
         VALUES ($1, $2, $3, $4, $5, $6, 'club_manager')
         RETURNING *`,
        [newId, mail, dummyHash, req.user?.name || null, profile.id, profile.officialName]
      );
      account = created[0];
    }

    if (!profile && !account) {
      return res.json({ hasClub: false, email: mail });
    }

    const token = signPortalToken(account || { id: req.user.id, email: mail, role: 'club_manager' }, profile);
    res.json({
      hasClub: true,
      token,
      portalPath: '/clubes/portal',
      profile: profile ? {
        id: profile.id,
        officialName: profile.officialName,
        shortName: profile.shortName,
        organizationType: profile.organizationType,
        slug: profile.slug,
        completionPercentage: profile.completionPercentage,
        status: profile.status
      } : null
    });
  } catch (e) {
    console.error('[districtClubsController] linkPlatformUser:', e);
    res.json({ hasClub: false });
  }
};

/** GET /api/district-clubs/portal/me (Requiere token portal) */
export const getPortalMe = async (req, res) => {
  try {
    await ensureDistrictClubDirectorySchema();
    const portalUser = req.portalUser;
    if (!portalUser) return res.status(401).json({ error: 'No autenticado' });

    const { rows: accRows } = await db.query(
      `SELECT id, email, "fullName", phone, "clubProfileId", "clubName", role FROM "DistrictClubAccount" WHERE id = $1 LIMIT 1`,
      [portalUser.sub]
    );
    const account = accRows[0] || portalUser;

    let profile = null;
    const targetProfileId = account.clubProfileId || portalUser.profileId;
    if (targetProfileId) {
      const { rows: pRows } = await db.query(
        `SELECT * FROM "DistrictClubProfile" WHERE id = $1 LIMIT 1`,
        [targetProfileId]
      );
      profile = pRows[0] || null;
    }

    res.json({
      ok: true,
      account,
      profile,
      completionPercentage: profile?.completionPercentage || 0
    });
  } catch (e) {
    fail(res, e);
  }
};

/** PUT /api/district-clubs/portal/profile (Requiere token portal) */
export const updatePortalProfile = async (req, res) => {
  try {
    await ensureDistrictClubDirectorySchema();
    const portalUser = req.portalUser;
    const profileId = portalUser.profileId;
    if (!profileId) return res.status(400).json({ error: 'No tienes un club asignado para gestionar.' });

    const { rows: currentRows } = await db.query(
      `SELECT * FROM "DistrictClubProfile" WHERE id = $1 LIMIT 1`,
      [profileId]
    );
    if (currentRows.length === 0) return res.status(404).json({ error: 'Club no encontrado' });
    const current = currentRows[0];

    const body = req.body || {};
    const auditLog = Array.isArray(current.auditLog) ? current.auditLog : [];

    // Validar si intentó cambiar campos institucionales protegidos
    let hasProtectedChanges = false;
    const protectedRequested = {};

    if (body.officialName && body.officialName.trim() !== current.officialName) {
      hasProtectedChanges = true;
      protectedRequested.officialName = body.officialName.trim();
    }
    if (body.districtNumber && Number(body.districtNumber) !== Number(current.districtNumber)) {
      hasProtectedChanges = true;
      protectedRequested.districtNumber = Number(body.districtNumber);
    }
    if (body.organizationType && body.organizationType !== current.organizationType) {
      hasProtectedChanges = true;
      protectedRequested.organizationType = body.organizationType;
    }

    let pendingProtectedObj = current.pendingProtectedChanges;
    if (hasProtectedChanges) {
      pendingProtectedObj = {
        requestedAt: new Date().toISOString(),
        requestedBy: portalUser.email,
        changes: protectedRequested
      };
      auditLog.push({
        date: new Date().toISOString(),
        by: portalUser.email,
        event: 'solicitud_cambios_protegidos',
        details: protectedRequested
      });
    }

    // Campos ordinarios que se actualizan automáticamente en tiempo real
    const mergedData = {
      ...current,
      ...body,
      officialName: current.officialName,
      districtNumber: current.districtNumber,
      organizationType: current.organizationType
    };

    const completion = calculateProfileCompletion(mergedData);
    const rotaryPeriod = body.rotaryPeriod || current.rotaryPeriod || '2026–2027';

    auditLog.push({
      date: new Date().toISOString(),
      by: portalUser.email,
      event: 'actualizacion_portal_autogestion',
      completion
    });

    const { rows: updatedRows } = await db.query(
      `UPDATE "DistrictClubProfile" SET
        "shortName" = COALESCE($1, "shortName"),
        city = COALESCE($2, city),
        state = COALESCE($3, state),
        "foundationYear" = COALESCE($4, "foundationYear"),
        motto = COALESCE($5, motto),
        description = COALESCE($6, description),
        history = COALESCE($7, history),
        mission = COALESCE($8, mission),
        vision = COALESCE($9, vision),
        "serviceAreas" = COALESCE($10, "serviceAreas"),
        "currentPresident" = COALESCE($11, "currentPresident"),
        "rotaryPeriod" = $12,
        "boardMembers" = COALESCE($13, "boardMembers"),
        "memberCount" = COALESCE($14, "memberCount"),
        "joinInfo" = COALESCE($15, "joinInfo"),
        "featuredProjects" = COALESCE($16, "featuredProjects"),
        "logoUrl" = COALESCE($17, "logoUrl"),
        "coverImageUrl" = COALESCE($18, "coverImageUrl"),
        gallery = COALESCE($19, gallery),
        "meetingAddress" = COALESCE($20, "meetingAddress"),
        "meetingSchedule" = COALESCE($21, "meetingSchedule"),
        "meetingCity" = COALESCE($22, "meetingCity"),
        "contactEmail" = COALESCE($23, "contactEmail"),
        "contactPhone" = COALESCE($24, "contactPhone"),
        "websiteUrl" = COALESCE($25, "websiteUrl"),
        "socialMedia" = COALESCE($26, "socialMedia"),
        "completionPercentage" = $27,
        "lastUpdatedPeriod" = $12,
        "pendingProtectedChanges" = $28,
        "auditLog" = $29,
        "updatedAt" = NOW()
       WHERE id = $30
       RETURNING *`,
      [
        body.shortName || null,
        body.city || null,
        body.state || null,
        body.foundationYear ? Number(body.foundationYear) : null,
        body.motto || null,
        body.description || null,
        body.history || null,
        body.mission || null,
        body.vision || null,
        body.serviceAreas ? JSON.stringify(body.serviceAreas) : null,
        body.currentPresident || null,
        rotaryPeriod,
        body.boardMembers ? JSON.stringify(body.boardMembers) : null,
        body.memberCount ? Number(body.memberCount) : null,
        body.joinInfo || null,
        body.featuredProjects ? JSON.stringify(body.featuredProjects) : null,
        body.logoUrl || null,
        body.coverImageUrl || null,
        body.gallery ? JSON.stringify(body.gallery) : null,
        body.meetingAddress || null,
        body.meetingSchedule || null,
        body.meetingCity || body.city || null,
        body.contactEmail || null,
        body.contactPhone || null,
        body.websiteUrl || null,
        body.socialMedia ? JSON.stringify(body.socialMedia) : null,
        completion,
        pendingProtectedObj ? JSON.stringify(pendingProtectedObj) : null,
        JSON.stringify(auditLog),
        profileId
      ]
    );

    res.json({
      ok: true,
      profile: updatedRows[0],
      hasProtectedChanges,
      message: hasProtectedChanges
        ? 'Información institucional actualizada en tiempo real. Los cambios protegidos (nombre oficial, distrito o tipo de club) están pendientes de validación por la gobernación distrital.'
        : '¡Perfil institucional actualizado y publicado en el directorio distrital con éxito!'
    });
  } catch (e) {
    fail(res, e);
  }
};

/** POST /api/district-clubs/admin/profile/:id/approve-protected (ADMIN) */
export const approveProtectedChanges = async (req, res) => {
  try {
    await ensureDistrictClubDirectorySchema();
    const { id } = req.params;
    const reviewerName = req.user?.name || req.user?.email || 'Administrador Distrital';

    const { rows } = await db.query(`SELECT * FROM "DistrictClubProfile" WHERE id = $1 LIMIT 1`, [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Club no encontrado' });
    const profile = rows[0];

    if (!profile.pendingProtectedChanges) {
      return res.status(400).json({ error: 'No hay cambios protegidos pendientes para este club.' });
    }

    const pending = typeof profile.pendingProtectedChanges === 'string'
      ? JSON.parse(profile.pendingProtectedChanges)
      : profile.pendingProtectedChanges;
    const changes = pending.changes || {};

    const auditLog = Array.isArray(profile.auditLog) ? profile.auditLog : [];
    auditLog.push({
      date: new Date().toISOString(),
      by: reviewerName,
      event: 'aprobacion_cambios_protegidos',
      approvedChanges: changes
    });

    let newSlug = profile.slug;
    if (changes.officialName) {
      newSlug = slugifyClub(changes.officialName);
    }

    await db.query(
      `UPDATE "DistrictClubProfile" SET
        "officialName" = COALESCE($1, "officialName"),
        "districtNumber" = COALESCE($2, "districtNumber"),
        "organizationType" = COALESCE($3, "organizationType"),
        slug = $4,
        "pendingProtectedChanges" = NULL,
        "auditLog" = $5,
        "updatedAt" = NOW()
       WHERE id = $6`,
      [
        changes.officialName || null,
        changes.districtNumber ? Number(changes.districtNumber) : null,
        changes.organizationType || null,
        newSlug,
        JSON.stringify(auditLog),
        id
      ]
    );

    res.json({ ok: true, message: 'Cambios institucionales protegidos aprobados exitosamente.' });
  } catch (e) {
    fail(res, e);
  }
};

/** POST /api/district-clubs/admin/profile/:id/reject-protected (ADMIN) */
export const rejectProtectedChanges = async (req, res) => {
  try {
    await ensureDistrictClubDirectorySchema();
    const { id } = req.params;
    const { reason } = req.body || {};
    const reviewerName = req.user?.name || req.user?.email || 'Administrador Distrital';

    const { rows } = await db.query(`SELECT * FROM "DistrictClubProfile" WHERE id = $1 LIMIT 1`, [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Club no encontrado' });
    const profile = rows[0];

    const auditLog = Array.isArray(profile.auditLog) ? profile.auditLog : [];
    auditLog.push({
      date: new Date().toISOString(),
      by: reviewerName,
      event: 'rechazo_cambios_protegidos',
      reason: reason || 'No cumple requisitos institucionales'
    });

    await db.query(
      `UPDATE "DistrictClubProfile" SET
        "pendingProtectedChanges" = NULL,
        "auditLog" = $1,
        "updatedAt" = NOW()
       WHERE id = $2`,
      [JSON.stringify(auditLog), id]
    );

    res.json({ ok: true, message: 'Cambios protegidos rechazados.' });
  } catch (e) {
    fail(res, e);
  }
};

/** POST /api/district-clubs/portal/forgot-password */
export const portalForgotPassword = async (req, res) => {
  try {
    await ensureDistrictClubDirectorySchema();
    const { email } = req.body || {};
    const mail = String(email || '').trim().toLowerCase();
    if (!mail) return res.status(400).json({ error: 'Ingresa tu correo electrónico.' });

    const token = randomUUID();
    const expires = new Date(Date.now() + 3600000 * 24); // 24 horas

    await db.query(
      `UPDATE "DistrictClubAccount" SET
        "resetPasswordToken" = $1,
        "resetPasswordExpires" = $2
       WHERE lower(email) = lower($3)`,
      [token, expires, mail]
    );

    res.json({
      ok: true,
      message: 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.',
      resetToken: token // Útil para entornos de prueba
    });
  } catch (e) {
    fail(res, e);
  }
};

/** POST /api/district-clubs/portal/reset-password */
export const portalResetPassword = async (req, res) => {
  try {
    await ensureDistrictClubDirectorySchema();
    const { token, newPassword } = req.body || {};
    if (!token || !newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ error: 'Token válido y contraseña de mínimo 8 caracteres requeridos.' });
    }

    const { rows } = await db.query(
      `SELECT id FROM "DistrictClubAccount"
       WHERE "resetPasswordToken" = $1 AND "resetPasswordExpires" > NOW()
       LIMIT 1`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: 'El enlace de recuperación es inválido o ha expirado.' });
    }

    const passwordHash = await bcrypt.hash(String(newPassword), 10);
    await db.query(
      `UPDATE "DistrictClubAccount" SET
        "passwordHash" = $1,
        "resetPasswordToken" = NULL,
        "resetPasswordExpires" = NULL,
        "updatedAt" = NOW()
       WHERE id = $2`,
      [passwordHash, rows[0].id]
    );

    res.json({ ok: true, message: 'Contraseña restablecida exitosamente. Ya puedes iniciar sesión.' });
  } catch (e) {
    fail(res, e);
  }
};
