// ════════════════════════════════════════════════════════════════════════════
// CRM institucional — vínculo entre contactos del CRM y el Directorio Oficial
//
// Qué es y qué NO es:
//   · `CrmContact.clubId` es el TENANT del CRM (la organización que administra
//     la lista). NO es el club rotario al que pertenece la persona. Este módulo
//     nunca usa ese campo como club de pertenencia.
//   · El club de pertenencia se lee de los campos institucionales del contacto
//     («Nombre del Club», «Distrito», «Cargo Club») y de las listas de cargos.
//   · El Directorio Oficial (`DistrictClubProfile`) es la fuente de identidad,
//     completitud y estado del club. Sus porcentajes NO se recalculan acá.
//   · El estado Club Platform se lee de `Club` y `RotaryClubActivation`, nunca
//     de etiquetas del CRM.
//
// Escritura: este módulo SÓLO escribe en sus tres tablas aditivas de vínculo,
// auditoría y ejecuciones. No toca contactos, perfiles ni tenants existentes.
// Toda conciliación tiene preview, apply y rollback auditado.
// ════════════════════════════════════════════════════════════════════════════

import { randomUUID } from 'crypto';
import db from './db.js';
import {
  ensureDistrictClubDirectorySchema,
  calculateIGI,
} from './ensureDistrictClubDirectorySchema.js';
import { describeProfileCompletion } from './profileCompletion.js';
import {
  ROLE_CATALOG,
  buildReconciliationPlan,
  matchContactInstitutionally,
  rankClubCandidates,
  normalizeInstitutionalName,
  roleLabel,
} from './institutionalMatching.js';
import { CLUBS_BY_DISTRICT_NUMBER } from './rotaryClubs.js';

const OPEN_ACTIVATION_STATUSES = new Set(['nuevo', 'contactado', 'interesado', 'en_activacion']);
const CACHE_TTL_MS = 20000;
const PROFILE_CACHE_TTL_MS = 60000;

const contextCache = new Map(); // clubId -> { at, context }
let profileCache = { at: 0, profiles: [] };
let _schemaPromise = null;

export const INSTITUTIONAL_STATUSES = [
  {
    key: 'confirmed',
    label: 'Club confirmado',
    shortLabel: 'Confirmado',
    color: 'emerald',
    description: 'El contacto está vinculado a un club del Directorio Oficial por coincidencia exacta y única o por validación administrativa.',
  },
  {
    key: 'ambiguous',
    label: 'Por validar',
    shortLabel: 'Por validar',
    color: 'amber',
    description: 'Hay una coincidencia aproximada. Se conserva el candidato, pero nadie la confirma todavía.',
  },
  {
    key: 'pending',
    label: 'Pendiente en el Directorio',
    shortLabel: 'Pendiente',
    color: 'orange',
    description: 'El club declarado no existe todavía en el Directorio (o el contacto sólo declara distrito). Se conserva para no perder el dato.',
  },
  {
    key: 'unreconciled',
    label: 'Sin conciliar',
    shortLabel: 'Sin conciliar',
    color: 'sky',
    description: 'Hay una sugerencia calculada, pero todavía no se guardó como vínculo. No cuenta como relación confirmada.',
  },
  {
    key: 'unlinked',
    label: 'Sin club declarado',
    shortLabel: 'Sin club',
    color: 'gray',
    description: 'El contacto no tiene un club ni un distrito en sus campos institucionales.',
  },
  {
    key: 'rejected',
    label: 'Vínculo descartado',
    shortLabel: 'Descartado',
    color: 'rose',
    description: 'Un administrador revisó la sugerencia y decidió no vincularla.',
  },
];

export const PLATFORM_STATUSES = [
  { key: 'active', label: 'Activo en Club Platform', color: 'emerald', description: 'El club tiene un sitio activo o un dominio propio.' },
  { key: 'pending', label: 'Activación en curso', color: 'amber', description: 'Existe una solicitud de activación abierta, pero el sitio todavía no está activo.' },
  { key: 'inactive', label: 'Sitio inactivo', color: 'gray', description: 'Existe un tenant del club, pero su sitio no está activo.' },
  { key: 'unverified', label: 'Sin presencia verificada', color: 'slate', description: 'No hay sitio ni solicitud de activación. No se deduce nada más.' },
];

const STATUS_BY_KEY = new Map(INSTITUTIONAL_STATUSES.map((s) => [s.key, s]));
const PLATFORM_BY_KEY = new Map(PLATFORM_STATUSES.map((s) => [s.key, s]));

export function statusMeta(key) {
  return STATUS_BY_KEY.get(key) || STATUS_BY_KEY.get('unlinked');
}

export function platformMeta(key) {
  return PLATFORM_BY_KEY.get(key) || PLATFORM_BY_KEY.get('unverified');
}

/** Invalida la foto en memoria después de escribir vínculos o cambiar el directorio. */
export function invalidateInstitutionalCache(clubId = null) {
  if (clubId) contextCache.delete(String(clubId));
  else contextCache.clear();
}

// ── Esquema aditivo ─────────────────────────────────────────────────────────

export function ensureInstitutionalSchema() {
  if (_schemaPromise) return _schemaPromise;
  _schemaPromise = (async () => {
    await ensureDistrictClubDirectorySchema();

    await db.query(`CREATE TABLE IF NOT EXISTS "CrmInstitutionalLink" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "clubId" TEXT NOT NULL,
      "contactId" TEXT NOT NULL REFERENCES "WhatsAppContact"(id) ON DELETE CASCADE,
      "profileId" TEXT,
      "candidateProfileId" TEXT,
      "districtNumber" INT,
      "rawClubName" TEXT,
      role TEXT NOT NULL DEFAULT 'member',
      "roleLabel" TEXT,
      period TEXT,
      "linkStatus" TEXT NOT NULL DEFAULT 'pending',
      confidence INT DEFAULT 0,
      "matchMethod" TEXT,
      "sourceValue" TEXT,
      "isPrimary" BOOLEAN DEFAULT FALSE,
      reason TEXT,
      "dedupeKey" TEXT NOT NULL,
      "reviewedBy" TEXT,
      "reviewedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE ("dedupeKey")
    )`);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_cil_club_status ON "CrmInstitutionalLink"("clubId", "linkStatus")`).catch(() => {});
    await db.query(`CREATE INDEX IF NOT EXISTS idx_cil_contact ON "CrmInstitutionalLink"("contactId")`).catch(() => {});
    await db.query(`CREATE INDEX IF NOT EXISTS idx_cil_profile ON "CrmInstitutionalLink"("profileId")`).catch(() => {});
    await db.query(`CREATE INDEX IF NOT EXISTS idx_cil_candidate ON "CrmInstitutionalLink"("candidateProfileId")`).catch(() => {});
    await db.query(`CREATE INDEX IF NOT EXISTS idx_cil_district ON "CrmInstitutionalLink"("districtNumber")`).catch(() => {});
    await db.query(`CREATE INDEX IF NOT EXISTS idx_cil_role ON "CrmInstitutionalLink"(role)`).catch(() => {});

    await db.query(`CREATE TABLE IF NOT EXISTS "CrmInstitutionalAudit" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "clubId" TEXT NOT NULL,
      "contactId" TEXT,
      "linkId" TEXT,
      "runId" TEXT,
      action TEXT NOT NULL,
      actor TEXT,
      before JSONB,
      after JSONB,
      reason TEXT,
      "createdAt" TIMESTAMPTZ DEFAULT NOW()
    )`);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_cia_contact ON "CrmInstitutionalAudit"("contactId", "createdAt" DESC)`).catch(() => {});
    await db.query(`CREATE INDEX IF NOT EXISTS idx_cia_run ON "CrmInstitutionalAudit"("runId")`).catch(() => {});
    await db.query(`CREATE INDEX IF NOT EXISTS idx_cia_club ON "CrmInstitutionalAudit"("clubId", "createdAt" DESC)`).catch(() => {});

    await db.query(`CREATE TABLE IF NOT EXISTS "CrmInstitutionalRun" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "clubId" TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'apply',
      status TEXT NOT NULL DEFAULT 'running',
      summary JSONB DEFAULT '{}'::jsonb,
      actor TEXT,
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "finishedAt" TIMESTAMPTZ,
      "rolledBackAt" TIMESTAMPTZ,
      "rolledBackBy" TEXT
    )`);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_cir_club ON "CrmInstitutionalRun"("clubId", "createdAt" DESC)`).catch(() => {});

    // La audiencia institucional de Email Marketing necesita guardar QUÉ
    // segmento eligió la campaña. Es una columna aditiva y opcional; las
    // campañas existentes siguen funcionando con `segmentTag`.
    await db.query(`ALTER TABLE "EmailCampaign" ADD COLUMN IF NOT EXISTS "institutionalSegment" TEXT`).catch(() => {});
  })().catch((error) => {
    _schemaPromise = null;
    throw error;
  });
  return _schemaPromise;
}

// ── Directorio Oficial ──────────────────────────────────────────────────────

function normalizeForIndex(value) {
  return normalizeInstitutionalName(value);
}

/**
 * Carga los perfiles del Directorio y resuelve, SIN inventar, el tenant real
 * del club y su estado de Club Platform.
 */
export async function loadDirectoryProfiles({ force = false } = {}) {
  if (!force && profileCache.profiles.length && Date.now() - profileCache.at < PROFILE_CACHE_TTL_MS) {
    return profileCache.profiles;
  }

  const [{ rows: profiles }, { rows: clubs }, activations] = await Promise.all([
    db.query(`SELECT * FROM "DistrictClubProfile" ORDER BY "districtNumber" ASC, "officialName" ASC`),
    db.query(`SELECT id, name, category, type, status, domain, subdomain, city, district, logo FROM "Club"`),
    db.query(`SELECT id, "clubName", "matchedClubId", status, "isEcosystemActive", "createdAt" FROM "RotaryClubActivation" ORDER BY "createdAt" DESC`).catch(() => ({ rows: [] })),
  ]);

  const clubsById = new Map(clubs.map((c) => [c.id, c]));
  const clubsByName = new Map();
  for (const club of clubs) {
    if (club.type === 'district') continue;
    const key = normalizeForIndex(club.name);
    if (key && !clubsByName.has(key)) clubsByName.set(key, club);
  }

  const activationsByClubId = new Map();
  const activationsByName = new Map();
  for (const activation of activations.rows || []) {
    if (activation.matchedClubId && !activationsByClubId.has(activation.matchedClubId)) {
      activationsByClubId.set(activation.matchedClubId, activation);
    }
    const key = normalizeForIndex(activation.clubName);
    if (key && !activationsByName.has(key)) activationsByName.set(key, activation);
  }

  const mapped = profiles.map((profile) => {
    const byId = profile.clubId ? clubsById.get(profile.clubId) : null;
    const byName = clubsByName.get(normalizeForIndex(profile.officialName))
      || clubsByName.get(normalizeForIndex(profile.shortName));
    const tenant = byId || byName || null;
    const activation = (tenant && activationsByClubId.get(tenant.id))
      || activationsByName.get(normalizeForIndex(profile.officialName))
      || activationsByName.get(normalizeForIndex(profile.shortName))
      || null;

    let platformStatus = 'unverified';
    if (tenant && (tenant.status === 'active' || tenant.domain || tenant.subdomain)) platformStatus = 'active';
    else if (activation && OPEN_ACTIVATION_STATUSES.has(activation.status)) platformStatus = 'pending';
    else if (tenant) platformStatus = 'inactive';

    const completionPercentage = Number(profile.completionPercentage) || 0;
    const igi = calculateIGI(profile);

    return {
      ...profile,
      completionPercentage,
      completion: describeProfileCompletion(profile, completionPercentage),
      platformStatus,
      platformStatusLabel: platformMeta(platformStatus).label,
      platformStatusColor: platformMeta(platformStatus).color,
      activationStatus: activation?.status || null,
      activationId: activation?.id || null,
      hasPlatformData: !!tenant || !!activation,
      tenantClubId: tenant?.id || null,
      tenantClubName: tenant?.name || null,
      tenantStatus: tenant?.status || null,
      tenantDomain: tenant?.domain || tenant?.subdomain || null,
      igiScore: igi.score,
      igiLevel: igi.level,
      igiLevelLabel: igi.levelLabel,
      igiBadgeColor: igi.badgeColor,
    };
  });

  profileCache = { at: Date.now(), profiles: mapped };
  return mapped;
}

function profileSummary(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    officialName: profile.officialName,
    shortName: profile.shortName,
    slug: profile.slug,
    districtNumber: Number(profile.districtNumber) || null,
    organizationType: profile.organizationType || 'rotary',
    city: profile.city || null,
    country: profile.country || null,
    directoryStatus: profile.status || 'published',
    logoUrl: profile.logoUrl || null,
    completionPercentage: Number(profile.completionPercentage) || 0,
    platformStatus: profile.platformStatus || 'unverified',
    platformStatusLabel: profile.platformStatusLabel || platformMeta('unverified').label,
    platformStatusColor: profile.platformStatusColor || platformMeta('unverified').color,
    tenantClubId: profile.tenantClubId || null,
    tenantClubName: profile.tenantClubName || null,
    tenantDomain: profile.tenantDomain || null,
    activationStatus: profile.activationStatus || null,
    hasPlatformData: !!profile.hasPlatformData,
    igiScore: profile.igiScore ?? 0,
    igiLevel: profile.igiLevel || 'critico',
    igiLevelLabel: profile.igiLevelLabel || 'Requiere Acompañamiento',
    igiBadgeColor: profile.igiBadgeColor || 'rose',
    currentPresident: profile.currentPresident || null,
    rotaryPeriod: profile.rotaryPeriod || null,
    contactEmail: profile.contactEmail || null,
    contactPhone: profile.contactPhone || null,
    primaryManagerEmail: profile.primaryManagerEmail || null,
    primaryManagerName: profile.primaryManagerName || null,
  };
}

// ── Contactos y vínculos ────────────────────────────────────────────────────

const contactInclude = {
  club: { select: { id: true, name: true } },
  listMemberships: {
    include: {
      list: { select: { id: true, name: true, color: true, siteIds: true } },
    },
  },
  customFieldValues: {
    include: {
      field: { select: { id: true, label: true, key: true } },
    },
  },
};

export async function loadInstitutionalContacts(clubId) {
  return db.prisma.crmContact.findMany({
    where: { clubId },
    include: contactInclude,
    orderBy: { createdAt: 'desc' },
  });
}

function customValuesOf(contact) {
  const values = {};
  for (const item of contact.customFieldValues || []) {
    const label = item.field?.label;
    const key = item.field?.key;
    const value = item.value;
    if (!value) continue;
    if (label) values[label] = value;
    if (key) values[key] = value;
  }
  return values;
}

function listNamesOf(contact) {
  return (contact.listMemberships || [])
    .map((membership) => membership.list?.name)
    .filter(Boolean);
}

export function contactToMatchInput(contact) {
  return {
    id: contact.id,
    title: contact.title || '',
    company: contact.company || '',
    district: contact.district || '',
    tags: contact.tags || [],
    listNames: listNamesOf(contact),
    customValues: customValuesOf(contact),
  };
}

export async function loadInstitutionalLinks(clubId, contactIds = null) {
  const params = [clubId];
  let sql = `SELECT * FROM "CrmInstitutionalLink" WHERE "clubId" = $1`;
  if (Array.isArray(contactIds) && contactIds.length) {
    sql += ` AND "contactId" = ANY($2)`;
    params.push(contactIds);
  }
  sql += ` ORDER BY "isPrimary" DESC, confidence DESC, "createdAt" ASC`;
  const { rows } = await db.query(sql, params);
  return rows;
}

function groupLinks(links) {
  const map = new Map();
  for (const link of links) {
    const key = link.contactId;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(link);
  }
  return map;
}

function linkSummary(link, profilesById) {
  const profile = link.profileId ? profilesById.get(link.profileId) : null;
  const candidate = link.candidateProfileId ? profilesById.get(link.candidateProfileId) : null;
  return {
    id: link.id,
    profileId: link.profileId || null,
    profileName: profile?.officialName || null,
    candidateProfileId: link.candidateProfileId || null,
    candidateProfileName: candidate?.officialName || null,
    districtNumber: link.districtNumber == null ? null : Number(link.districtNumber),
    rawClubName: link.rawClubName || null,
    role: link.role,
    roleLabel: link.roleLabel || roleLabel(link.role),
    period: link.period || null,
    linkStatus: link.linkStatus,
    statusLabel: statusMeta(link.linkStatus).label,
    statusColor: statusMeta(link.linkStatus).color,
    confidence: Number(link.confidence) || 0,
    matchMethod: link.matchMethod || null,
    sourceValue: link.sourceValue || null,
    isPrimary: !!link.isPrimary,
    reason: link.reason || null,
    reviewedBy: link.reviewedBy || null,
    reviewedAt: link.reviewedAt || null,
    createdAt: link.createdAt || null,
    updatedAt: link.updatedAt || null,
  };
}

/**
 * Enriquece un contacto. Si no hay vínculo persistido, la sugerencia se marca
 * como `unreconciled`: se muestra, pero NO se hace pasar por relación real.
 */
export function enrichInstitutionalContact(contact, { profilesById, links = [], now = new Date(), includeCompletion = false } = {}) {
  const match = matchContactInstitutionally(contactToMatchInput(contact), {
    profiles: [...profilesById.values()],
    now,
  });

  const persisted = [...links].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    if (a.linkStatus === 'confirmed' && b.linkStatus !== 'confirmed') return -1;
    if (b.linkStatus === 'confirmed' && a.linkStatus !== 'confirmed') return 1;
    return (Number(b.confidence) || 0) - (Number(a.confidence) || 0);
  });
  const active = persisted.filter((link) => link.linkStatus !== 'rejected');
  const confirmed = active.filter((link) => link.linkStatus === 'confirmed' && link.profileId);
  const primaryLink = confirmed.find((link) => link.isPrimary) || confirmed[0] || active[0] || null;

  // Sólo un vínculo CONFIRMADO puede aportar club, completitud o estado de
  // plataforma. Una sugerencia (aunque sea exacta) no es una relación real.
  const profile = confirmed.length ? profilesById.get(confirmed[0].profileId) : null;
  const effectiveProfileId = profile?.id || null;
  const candidateProfileId = !confirmed.length
    ? (primaryLink?.candidateProfileId || match.candidateProfileId || null)
    : null;
  const candidate = candidateProfileId ? profilesById.get(candidateProfileId) : null;

  let status;
  let isReconciled = false;
  if (confirmed.length) {
    status = 'confirmed';
    isReconciled = true;
  } else if (active.length) {
    status = active[0].linkStatus === 'confirmed' ? 'pending' : active[0].linkStatus;
    isReconciled = true;
  } else if (persisted.some((link) => link.linkStatus === 'rejected')) {
    status = 'rejected';
    isReconciled = true;
  } else {
    status = ['confirmed', 'ambiguous', 'pending'].includes(match.status) ? 'unreconciled' : 'unlinked';
  }

  const meta = statusMeta(status);
  const role = primaryLink?.role || match.role || 'member';
  const period = primaryLink?.period || match.period || null;
  const districtNumber = primaryLink?.districtNumber != null
    ? Number(primaryLink.districtNumber)
    : (match.districtNumber == null ? null : Number(match.districtNumber));
  const rawClubName = primaryLink?.rawClubName || match.rawClubName || null;

  let statusLabel = meta.label;
  if (status === 'unreconciled') {
    if (match.status === 'confirmed') statusLabel = 'Coincidencia exacta sin aplicar';
    else if (match.status === 'ambiguous') statusLabel = 'Coincidencia aproximada sin aplicar';
    else statusLabel = 'Pendiente sin registrar';
  }

  const confirmedLinks = confirmed.map((link) => linkSummary(link, profilesById));
  const suggestion = {
    status: match.status,
    statusLabel: statusMeta(match.status === 'confirmed' ? 'confirmed' : match.status === 'ambiguous' ? 'ambiguous' : match.status === 'pending' ? 'pending' : 'unlinked').label,
    profileId: match.profileId,
    profileName: match.profileName,
    candidateProfileId: match.candidateProfileId,
    candidateProfileName: match.candidateProfileName,
    confidence: match.confidence,
    reason: match.reason,
  };

  return {
    ...contact,
    // El tenant de origen se devuelve aparte, con un nombre que no se puede
    // confundir con el club de pertenencia.
    origin: contact.club?.name ? { id: contact.clubId, name: contact.club.name } : null,
    lists: (contact.listMemberships || []).map((membership) => membership.list).filter(Boolean),
    customFields: (contact.customFieldValues || []).map((item) => ({
      fieldId: item.fieldId,
      value: item.value,
      label: item.field?.label || null,
      key: item.field?.key || null,
    })),
    institutional: {
      status,
      statusLabel,
      statusColor: meta.color,
      statusDescription: meta.description,
      isReconciled,
      rawClubName,
      districtNumber,
      role,
      roleLabel: primaryLink?.roleLabel || match.roleLabel || roleLabel(role),
      roles: [...new Set([...confirmedLinks.map((link) => link.role), ...(status === 'confirmed' ? [] : [role])])],
      period,
      confidence: primaryLink ? Number(primaryLink.confidence) || 0 : match.confidence || 0,
      profileId: effectiveProfileId,
      profileName: profile?.officialName || null,
      candidateProfileId,
      candidateProfileName: candidate?.officialName || match.candidateProfileName || null,
      profile: profile ? profileSummary(profile) : null,
      candidateProfile: candidate ? profileSummary(candidate) : null,
      platformStatus: profile?.platformStatus || 'unverified',
      platformStatusLabel: profile?.platformStatusLabel || platformMeta('unverified').label,
      platformStatusColor: profile?.platformStatusColor || platformMeta('unverified').color,
      completionPercentage: profile?.completionPercentage ?? null,
      completion: includeCompletion && profile ? profile.completion : null,
      directoryGaps: includeCompletion && profile ? profile.completion?.pending || [] : [],
      reason: primaryLink?.reason || match.reason || null,
      matchMethod: primaryLink?.matchMethod || match.matchMethod || null,
      sourceValue: primaryLink?.sourceValue || match.sourceValue || null,
      suggestion,
      links: persisted.map((link) => linkSummary(link, profilesById)),
      confirmedLinks,
    },
  };
}

/**
 * Enriquece sólo la página pedida. Es el camino normal del listado: no carga
 * los 1.400 contactos cuando se están mostrando 50.
 */
export async function enrichContactPage(clubId, contacts) {
  const profiles = await loadDirectoryProfiles();
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const links = await loadInstitutionalLinks(clubId, contacts.map((contact) => contact.id));
  const linksByContact = groupLinks(links);
  const now = new Date();
  return contacts.map((contact) => enrichInstitutionalContact(contact, {
    profilesById,
    links: linksByContact.get(contact.id) || [],
    now,
  }));
}

// ── Contexto completo (para filtros, analítica y segmentos) ─────────────────

export async function getInstitutionalContext(clubId, { force = false } = {}) {
  await ensureInstitutionalSchema();
  const key = String(clubId);
  const cached = contextCache.get(key);
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.context;

  const [profiles, contacts] = await Promise.all([
    loadDirectoryProfiles({ force }),
    loadInstitutionalContacts(clubId),
  ]);
  const links = await loadInstitutionalLinks(clubId);
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const linksByContact = groupLinks(links);
  const now = new Date();

  const enriched = contacts.map((contact) => enrichInstitutionalContact(contact, {
    profilesById,
    links: linksByContact.get(contact.id) || [],
    now,
  }));

  const context = {
    clubId,
    generatedAt: new Date().toISOString(),
    profiles,
    profilesById,
    contacts: enriched,
    contactsById: new Map(enriched.map((contact) => [contact.id, contact])),
    links,
    linksByContact,
  };
  contextCache.set(key, { at: Date.now(), context });
  return context;
}

// ── Filtros ─────────────────────────────────────────────────────────────────

function splitList(value) {
  if (value == null || value === '') return [];
  return [...new Set((Array.isArray(value) ? value : String(value).split(','))
    .map((item) => String(item).trim())
    .filter(Boolean))];
}

function hasConfirmedRole(contact, role) {
  return (contact.institutional?.confirmedLinks || []).some((link) => link.role === role);
}

function matchesInstitutionalFilters(contact, filters = {}) {
  const institutional = contact.institutional || {};

  const statuses = splitList(filters.institutionalStatus);
  if (statuses.length && !statuses.includes(institutional.status)) return false;

  const districts = splitList(filters.districtNumber || filters.district).map(Number).filter(Number.isFinite);
  if (districts.length && !districts.includes(Number(institutional.districtNumber))) return false;

  const platforms = splitList(filters.platformStatus);
  if (platforms.length && !platforms.includes(institutional.platformStatus)) return false;

  const roles = splitList(filters.role || filters.institutionalRole);
  if (roles.length && !roles.some((role) => hasConfirmedRole(contact, role) || institutional.role === role)) return false;

  if (filters.profileId && ![institutional.profileId, institutional.candidateProfileId].includes(filters.profileId)) return false;

  const minCompletion = Number(filters.completionMin);
  if (Number.isFinite(minCompletion) && minCompletion > 0) {
    if (institutional.completionPercentage == null || institutional.completionPercentage < minCompletion) return false;
  }
  const maxCompletion = Number(filters.completionMax);
  if (Number.isFinite(maxCompletion) && maxCompletion > 0) {
    if (institutional.completionPercentage == null || institutional.completionPercentage > maxCompletion) return false;
  }

  if (String(filters.hasEmail) === 'true' && !contact.email) return false;
  if (String(filters.hasPhone) === 'true' && !contact.phone) return false;

  const consents = splitList(filters.consentState);
  if (consents.length && !consents.includes(contact.consentState || 'unknown')) return false;

  if (filters.period && institutional.period !== filters.period) return false;

  const minConfidence = Number(filters.minConfidence);
  if (Number.isFinite(minConfidence) && minConfidence > 0 && Number(institutional.confidence) < minConfidence) return false;

  return true;
}

/**
 * Devuelve los IDs que cumplen filtros institucionales. El controlador de
 * contactos los combina con la búsqueda y las listas que ya existían.
 */
export async function filterInstitutionalContactIds(clubId, filters = {}) {
  const context = await getInstitutionalContext(clubId);
  const ids = context.contacts
    .filter((contact) => matchesInstitutionalFilters(contact, filters))
    .map((contact) => contact.id);
  return { ids, total: ids.length };
}

export function hasInstitutionalFilters(query = {}) {
  return [
    'institutionalStatus', 'institutionalRole', 'role', 'district', 'districtNumber',
    'platformStatus', 'profileId', 'completionMin', 'completionMax', 'hasEmail',
    'hasPhone', 'consentState', 'period', 'minConfidence', 'institutionalSegment',
  ].some((key) => query[key] != null && query[key] !== '');
}

// ── Segmentos dinámicos ─────────────────────────────────────────────────────

const SEGMENTS = [
  {
    key: 'confirmados',
    label: 'Contactos con club confirmado',
    description: 'Personas vinculadas a un club del Directorio Oficial.',
    predicate: (c) => c.institutional.status === 'confirmed',
  },
  {
    key: 'presidentes',
    label: 'Presidentes de club',
    description: 'Cargo Presidente confirmado en el período.',
    predicate: (c) => hasConfirmedRole(c, 'president'),
  },
  {
    key: 'secretarios',
    label: 'Secretarios de club',
    description: 'Cargo Secretario/a confirmado en el período.',
    predicate: (c) => hasConfirmedRole(c, 'secretary'),
  },
  {
    key: 'tesoreros',
    label: 'Tesoreros de club',
    description: 'Cargo Tesorero/a confirmado en el período.',
    predicate: (c) => hasConfirmedRole(c, 'treasurer'),
  },
  {
    key: 'imagen_publica',
    label: 'Responsables de Imagen Pública',
    description: 'Cargo Imagen Pública confirmado en el período.',
    predicate: (c) => hasConfirmedRole(c, 'public_image'),
  },
  {
    key: 'comunicaciones',
    label: 'Responsables de Comunicaciones',
    description: 'Cargo Comunicaciones confirmado en el período.',
    predicate: (c) => hasConfirmedRole(c, 'communications'),
  },
  {
    key: 'membresia',
    label: 'Responsables de Membresía',
    description: 'Cargo Membresía confirmado en el período.',
    predicate: (c) => hasConfirmedRole(c, 'membership'),
  },
  {
    key: 'fundacion',
    label: 'Enlaces de Fundación Rotaria',
    description: 'Cargo Fundación Rotaria confirmado en el período.',
    predicate: (c) => hasConfirmedRole(c, 'foundation'),
  },
  {
    key: 'yeos',
    label: 'YEOs / Intercambio Juvenil',
    description: 'Cargo de intercambio juvenil confirmado en el período.',
    predicate: (c) => hasConfirmedRole(c, 'youth_exchange'),
  },
  {
    key: 'gobernacion',
    label: 'Asistentes de Gobernación',
    description: 'Cargo Asistente de Gobernación confirmado.',
    predicate: (c) => hasConfirmedRole(c, 'governor_aide'),
  },
  {
    key: 'tecnologia',
    label: 'Responsables de Tecnología',
    description: 'Cargo Tecnología confirmado en el período.',
    predicate: (c) => hasConfirmedRole(c, 'technology'),
  },
  {
    key: 'distrito_4271',
    label: 'Distrito 4271',
    description: 'Contactos cuyo club o distrito declarado es el 4271.',
    predicate: (c) => Number(c.institutional.districtNumber) === 4271,
  },
  {
    key: 'distrito_4281',
    label: 'Distrito 4281',
    description: 'Contactos cuyo club o distrito declarado es el 4281.',
    predicate: (c) => Number(c.institutional.districtNumber) === 4281,
  },
  {
    key: 'distrito_sin_directorio',
    label: 'Distritos sin Directorio cargado',
    description: 'Contactos de distritos distintos de 4271/4281. Se conservan, pero no se cruzan contra otro distrito.',
    predicate: (c) => c.institutional.districtNumber != null && ![4271, 4281].includes(Number(c.institutional.districtNumber)),
  },
  {
    key: 'por_validar',
    label: 'Vínculos por validar',
    description: 'Coincidencias aproximadas o pendientes de revisión administrativa.',
    predicate: (c) => ['ambiguous', 'pending', 'rejected'].includes(c.institutional.status),
  },
  {
    key: 'sin_confirmar',
    label: 'Sin club confirmado',
    description: 'Contactos que todavía no tienen un vínculo confirmado con el Directorio.',
    predicate: (c) => c.institutional.status !== 'confirmed',
  },
  {
    key: 'sin_conciliar',
    label: 'Sin conciliar',
    description: 'Contactos con sugerencia calculada o sin club declarado; no cuentan como relación.',
    predicate: (c) => ['unreconciled', 'unlinked'].includes(c.institutional.status),
  },
  {
    key: 'club_plataforma_activo',
    label: 'Clubes activos en Club Platform',
    description: 'Contactos cuyo club tiene sitio activo o dominio propio.',
    predicate: (c) => c.institutional.platformStatus === 'active',
  },
  {
    key: 'club_sin_plataforma',
    label: 'Clubes sin Club Platform activo',
    description: 'Contactos cuyo club no tiene sitio activo: activación en curso, inactivo o sin verificar.',
    predicate: (c) => ['pending', 'inactive', 'unverified'].includes(c.institutional.platformStatus),
  },
  {
    key: 'completitud_baja',
    label: 'Clubes con completitud menor a 30%',
    description: 'Contactos vinculados a perfiles del Directorio con datos incompletos.',
    predicate: (c) => c.institutional.completionPercentage != null && c.institutional.completionPercentage < 30,
  },
  {
    key: 'completitud_media',
    label: 'Clubes con completitud 30–59%',
    description: 'Contactos vinculados a perfiles en progreso.',
    predicate: (c) => c.institutional.completionPercentage != null && c.institutional.completionPercentage >= 30 && c.institutional.completionPercentage < 60,
  },
  {
    key: 'completitud_alta',
    label: 'Clubes con completitud 60% o más',
    description: 'Contactos vinculados a perfiles con buena completitud.',
    predicate: (c) => c.institutional.completionPercentage != null && c.institutional.completionPercentage >= 60,
  },
  {
    key: 'sin_email',
    label: 'Contactos sin correo',
    description: 'No se pueden usar en Email Marketing hasta completar el correo.',
    predicate: (c) => !c.email,
  },
  {
    key: 'sin_telefono',
    label: 'Contactos sin teléfono',
    description: 'No se pueden usar en WhatsApp hasta completar el teléfono.',
    predicate: (c) => !c.phone,
  },
  {
    key: 'consentimiento_otorgado',
    label: 'Con consentimiento otorgado',
    description: 'Contactos con consentimiento registrado como otorgado.',
    predicate: (c) => (c.consentState || 'unknown') === 'granted',
  },
];

export const INSTITUTIONAL_SEGMENTS = SEGMENTS.map(({ key, label, description }) => ({ key, label, description }));

export function evaluateInstitutionalSegments(context) {
  return SEGMENTS.map((segment) => {
    const matching = context.contacts.filter(segment.predicate);
    return {
      key: segment.key,
      label: segment.label,
      description: segment.description,
      count: matching.length,
      emailReady: matching.filter((c) => c.email && c.status !== 'unsubscribed' && c.status !== 'blocked' && !c.optedOutAt && !c.archivedAt).length,
      sample: matching.slice(0, 3).map((c) => ({
        id: c.id,
        name: [c.name, c.lastName].filter(Boolean).join(' '),
        club: c.institutional.profileName || c.institutional.rawClubName || null,
        district: c.institutional.districtNumber,
      })),
    };
  });
}

export async function resolveInstitutionalSegment(clubId, segmentKey) {
  const context = await getInstitutionalContext(clubId);
  const segment = SEGMENTS.find((item) => item.key === segmentKey);
  if (!segment) {
    return { contacts: [], segment: null, error: `Segmento institucional desconocido: ${segmentKey}` };
  }
  const contacts = context.contacts.filter(segment.predicate);
  return {
    contacts,
    segment: { key: segment.key, label: segment.label, description: segment.description },
    error: null,
  };
}

// ── Vista 360° por contacto ─────────────────────────────────────────────────

export async function getInstitutionalContactDetail(clubId, contactId) {
  await ensureInstitutionalSchema();
  const [profiles, contact, links] = await Promise.all([
    loadDirectoryProfiles(),
    db.prisma.crmContact.findFirst({
      where: { id: contactId, clubId },
      include: contactInclude,
    }),
    loadInstitutionalLinks(clubId, [contactId]),
  ]);

  if (!contact) return null;
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const enriched = enrichInstitutionalContact(contact, {
    profilesById,
    links,
    includeCompletion: true,
  });

  const districtNumber = enriched.institutional.districtNumber;
  const rawClubName = enriched.institutional.rawClubName;
  const candidates = rawClubName
    ? rankClubCandidates(rawClubName, profiles, { districtNumber }).slice(0, 5).map((candidate) => ({
      score: candidate.score,
      profile: profileSummary(candidate.profile),
    }))
    : [];

  const { rows: audit } = await db.query(
    `SELECT * FROM "CrmInstitutionalAudit"
     WHERE "clubId" = $1 AND "contactId" = $2
     ORDER BY "createdAt" DESC LIMIT 20`,
    [clubId, contactId]
  );

  const profile = enriched.institutional.profileId
    ? profilesById.get(enriched.institutional.profileId)
    : null;
  const candidateProfile = enriched.institutional.candidateProfileId
    ? profilesById.get(enriched.institutional.candidateProfileId)
    : null;

  return {
    contact: enriched,
    candidates,
    audit,
    profile: profile ? profileSummary(profile) : null,
    candidateProfile: candidateProfile ? profileSummary(candidateProfile) : null,
    completion: profile ? profile.completion : null,
    platformStatus: profile?.platformStatus || 'unverified',
    alerts: buildContactAlerts(enriched),
  };
}

function buildContactAlerts(contact) {
  const alerts = [];
  if (contact.institutional.status === 'unreconciled') {
    alerts.push({
      severity: 'info',
      title: 'Hay una coincidencia sin aplicar',
      detail: 'La sugerencia no cuenta como vínculo. Revísala y confírmala para que el club quede asociado.',
    });
  }
  if (contact.institutional.status === 'ambiguous') {
    alerts.push({
      severity: 'warning',
      title: 'Coincidencia aproximada',
      detail: 'El club declarado no coincide exactamente con un perfil. La validación administrativa evita un vínculo equivocado.',
    });
  }
  if (contact.institutional.status === 'pending') {
    alerts.push({
      severity: 'warning',
      title: 'Club fuera del Directorio',
      detail: contact.institutional.districtNumber
        ? `No hay un perfil del club en el Directorio del Distrito ${contact.institutional.districtNumber}. El dato se conserva.`
        : 'El club declarado no está en el Directorio. El dato se conserva.',
    });
  }
  if (contact.institutional.status === 'unlinked') {
    alerts.push({
      severity: 'info',
      title: 'Sin club declarado',
      detail: 'Completa el campo institucional «Nombre del Club» para poder vincularlo al Directorio.',
    });
  }
  if (!contact.email) {
    alerts.push({ severity: 'warning', title: 'Sin correo electrónico', detail: 'No puede recibir campañas de Email Marketing.' });
  }
  if (!contact.phone) {
    alerts.push({ severity: 'warning', title: 'Sin teléfono', detail: 'No puede recibir mensajes de WhatsApp.' });
  }
  if (contact.institutional.profile?.completionPercentage != null && contact.institutional.profile.completionPercentage < 30) {
    alerts.push({
      severity: 'warning',
      title: 'Perfil del club incompleto',
      detail: `El Directorio reporta ${contact.institutional.profile.completionPercentage}% de completitud. El CRM no recalcula ese indicador.`,
    });
  }
  return alerts;
}

// ── Vista 360° por club ─────────────────────────────────────────────────────

export async function getInstitutionalClubDetail(clubId, profileId) {
  const context = await getInstitutionalContext(clubId, { force: true });
  const profile = context.profilesById.get(profileId);
  if (!profile) return null;

  const linked = context.contacts.filter((contact) =>
    (contact.institutional.confirmedLinks || []).some((link) => link.profileId === profileId)
  );
  const candidates = context.contacts.filter((contact) =>
    contact.institutional.candidateProfileId === profileId
    || contact.institutional.suggestion?.profileId === profileId
    || contact.institutional.suggestion?.candidateProfileId === profileId
  );

  const byRole = {};
  for (const contact of linked) {
    for (const link of contact.institutional.confirmedLinks || []) {
      if (link.profileId !== profileId) continue;
      byRole[link.role] = byRole[link.role] || { role: link.role, label: link.roleLabel, count: 0 };
      byRole[link.role].count++;
    }
  }

  const contactIds = linked.map((contact) => contact.id);
  let campaignActivity = [];
  if (contactIds.length) {
    const { rows } = await db.query(
      `SELECT r."contactId", r.email, r.status, r."openedAt", r."clickedAt", r."openCount", r."clickCount",
              r."createdAt", c.name AS "campaignName", c."sentAt"
       FROM "EmailCampaignRecipient" r
       JOIN "EmailCampaign" c ON c.id = r."campaignId"
       WHERE r."contactId" = ANY($1)
       ORDER BY r."createdAt" DESC LIMIT 12`,
      [contactIds]
    ).catch(() => ({ rows: [] }));
    campaignActivity = rows;
  }

  const { rows: linkedLists } = await db.query(
    `SELECT id, name, color, "siteIds"
     FROM "WhatsAppContactList"
     WHERE $1 = ANY("siteIds") OR "clubId" = $2
     ORDER BY name ASC`,
    [profile.clubId || profile.tenantClubId || '', clubId]
  ).catch(() => ({ rows: [] }));

  const igi = calculateIGI(profile);
  const nextActions = buildClubNextActions(profile, linked, candidates, byRole);

  return {
    profile: profileSummary(profile),
    club: {
      ...profileSummary(profile),
      description: profile.description || null,
      history: profile.history || null,
      meetingAddress: profile.meetingAddress || null,
      meetingSchedule: profile.meetingSchedule || null,
      websiteUrl: profile.websiteUrl || null,
      socialMedia: profile.socialMedia || {},
      primaryManagerEmail: profile.primaryManagerEmail || null,
      primaryManagerName: profile.primaryManagerName || null,
    },
    completion: profile.completion,
    igi,
    contacts: linked,
    candidates,
    contactsByRole: Object.values(byRole).sort((a, b) => b.count - a.count),
    campaignActivity,
    linkedLists,
    nextActions,
    stats: {
      contacts: linked.length,
      contactsWithEmail: linked.filter((c) => !!c.email).length,
      contactsWithPhone: linked.filter((c) => !!c.phone).length,
      contactsWithConsent: linked.filter((c) => (c.consentState || 'unknown') === 'granted').length,
      candidates: candidates.length,
      rolesCovered: Object.keys(byRole).length,
      platformStatus: profile.platformStatus,
      completionPercentage: profile.completionPercentage,
      igiScore: igi.score,
    },
  };
}

function buildClubNextActions(profile, linked, candidates, byRole) {
  const actions = [];
  if (profile.platformStatus !== 'active') {
    actions.push({
      key: 'activar_plataforma',
      title: 'Acompañar la activación en Club Platform',
      detail: profile.platformStatus === 'pending'
        ? 'Hay una solicitud abierta. El club todavía no tiene sitio activo.'
        : 'No hay sitio activo verificable. No se deduce inactividad de una etiqueta del CRM.',
    });
  }
  if (!linked.length) {
    actions.push({
      key: 'vincular_contactos',
      title: 'Vincular contactos del club',
      detail: candidates.length
        ? `Hay ${candidates.length} contacto(s) candidato(s) para este club.`
        : 'No hay contactos confirmados. Revisa los campos «Nombre del Club» del CRM.',
    });
  }
  if (!byRole.president) {
    actions.push({
      key: 'presidente',
      title: 'Identificar al presidente del período',
      detail: 'El Directorio no tiene un contacto vinculado con cargo Presidente.',
    });
  }
  if (!byRole.secretary) {
    actions.push({
      key: 'secretario',
      title: 'Identificar al secretario del club',
      detail: 'Sin secretario confirmado no hay un canal institucional claro.',
    });
  }
  if (profile.completionPercentage < 30) {
    actions.push({
      key: 'completar_directorio',
      title: 'Completar el perfil del Directorio',
      detail: `Completitud actual: ${profile.completionPercentage}%. Faltan ${profile.completion?.pending?.length || 0} ítem(s) del Directorio.`,
    });
  }
  if (!profile.primaryManagerEmail) {
    actions.push({
      key: 'responsable',
      title: 'Asignar responsable de autogestión',
      detail: 'El perfil no tiene un correo de responsable. El Directorio lo usa para el portal del club.',
    });
  }
  if (profile.contactEmail || profile.contactPhone) {
    actions.push({
      key: 'canal',
      title: 'Canal institucional disponible',
      detail: `El Directorio publica ${profile.contactEmail || profile.contactPhone}. Úsalo para contacto directo, no para inferir activación.`,
    });
  }
  return actions;
}

// ── Conciliación: preview / apply / rollback ────────────────────────────────

function linkDedupeKey(contactId, role, period) {
  return `${contactId}|${role}|${period || ''}`.slice(0, 500);
}

/**
 * Convierte un vínculo planificado en la fila que se persiste. El plan trae
 * `item.links` con TODOS los cargos detectados; el `item` de nivel superior es
 * sólo el resumen del contacto.
 */
function plannedItemToRow(item, link = null) {
  const role = link?.role || item.role || 'member';
  const period = link?.period ?? item.period ?? null;
  const rawClubName = link?.rawClubName ?? item.rawClubName ?? null;
  return {
    contactId: item.contactId,
    profileId: link ? (link.profileId ?? null) : (item.profileId ?? null),
    candidateProfileId: link ? (link.candidateProfileId ?? null) : (item.candidateProfileId ?? null),
    districtNumber: (link?.districtNumber ?? item.districtNumber) == null
      ? null
      : Number(link?.districtNumber ?? item.districtNumber),
    rawClubName,
    role,
    roleLabel: link?.roleLabel || item.roleLabel || roleLabel(role),
    period,
    linkStatus: link?.linkStatus || item.status,
    confidence: Number(link?.confidence ?? item.confidence) || 0,
    matchMethod: link?.matchMethod || item.matchMethod || null,
    sourceValue: link?.sourceValue || item.sourceValue || rawClubName,
    isPrimary: link ? !!link.isPrimary : true,
    reason: link?.reason || item.reason || null,
    dedupeKey: linkDedupeKey(item.contactId, role, period),
  };
}

/**
 * Plan de conciliación. No escribe: cruza contactos contra el Directorio y
 * devuelve qué se haría, incluyendo los que ya están vinculados.
 */
export async function previewInstitutionalReconciliation(clubId, { limit = 200, contactIds = null } = {}) {
  const context = await getInstitutionalContext(clubId, { force: true });
  const wanted = Array.isArray(contactIds) && contactIds.length ? new Set(contactIds) : null;
  const contacts = wanted ? context.contacts.filter((c) => wanted.has(c.id)) : context.contacts;
  const plan = buildReconciliationPlan(
    contacts.map((contact) => contactToMatchInput(contact)),
    { profiles: context.profiles }
  );

  const byId = new Map(contacts.map((contact) => [contact.id, contact]));
  const items = plan.items.map((item) => {
    const contact = byId.get(item.contactId);
    const existing = (context.linksByContact.get(item.contactId) || []);
    const confirmed = existing.find((link) => link.linkStatus === 'confirmed');
    const rejected = existing.find((link) => link.linkStatus === 'rejected');
    let action = 'create';
    if (item.status === 'unlinked') action = 'skip';
    else if (confirmed) action = 'skip';
    else if (rejected) action = 'skip';
    return {
      ...item,
      contact: contact ? {
        id: contact.id,
        name: [contact.name, contact.lastName].filter(Boolean).join(' '),
        email: contact.email || null,
        phone: contact.phone || null,
        tags: contact.tags || [],
        lists: (contact.lists || []).map((list) => list.name),
      } : null,
      existingLinkStatus: confirmed ? 'confirmed' : (rejected ? 'rejected' : (existing[0]?.linkStatus || null)),
      action,
    };
  });

  const actionable = items.filter((item) => item.action === 'create');
  const byDistrict = {};
  const byRole = {};
  const unmatched = new Map();
  for (const item of actionable) {
    if (item.districtNumber) byDistrict[item.districtNumber] = (byDistrict[item.districtNumber] || 0) + 1;
    byRole[item.roleLabel] = (byRole[item.roleLabel] || 0) + 1;
    if (item.rawClubName && item.status !== 'confirmed') {
      const key = `${normalizeInstitutionalName(item.rawClubName)}|${item.districtNumber || ''}`;
      const current = unmatched.get(key) || {
        rawClubName: item.rawClubName,
        districtNumber: item.districtNumber || null,
        candidateName: item.candidateProfileName || null,
        count: 0,
        statuses: {},
      };
      current.count++;
      current.statuses[item.status] = (current.statuses[item.status] || 0) + 1;
      unmatched.set(key, current);
    }
  }

  const summary = {
    ...plan.summary,
    alreadyConfirmed: items.filter((item) => item.existingLinkStatus === 'confirmed' || item.action === 'skip' && item.status === 'confirmed').length,
    rejectedSkipped: items.filter((item) => item.existingLinkStatus === 'rejected').length,
    linksToWrite: actionable.reduce((acc, item) => acc + (item.links?.length || 0), 0),
    contactsToWrite: new Set(actionable.map((item) => item.contactId)).size,
    byDistrict,
    byRole,
    unmatchedClubs: [...unmatched.values()].sort((a, b) => b.count - a.count).slice(0, 40),
  };

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    directoryProfiles: context.profiles.length,
    directoryByDistrict: countBy(context.profiles, (profile) => profile.districtNumber),
    summary,
    items: actionable.slice(0, Math.max(1, Math.min(Number(limit) || 200, 1000))),
    skipped: items.filter((item) => item.action === 'skip').slice(0, 50),
  };
}

function countBy(items, fn) {
  const out = {};
  for (const item of items) {
    const key = fn(item);
    if (key == null) continue;
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

/**
 * Aplica un plan recalculado en el servidor. Sólo escribe en las tablas
 * aditivas de vínculo/auditoría/ejecución. No toca contactos ni perfiles.
 *
 * `confirmAmbiguous=false` guarda las aproximadas como `ambiguous` con
 * `candidateProfileId`, sin confirmarlas. Ese es el comportamiento por defecto.
 */
export async function applyInstitutionalReconciliation(clubId, {
  actor = 'sistema',
  confirmAmbiguous = false,
  contactIds = null,
  force = false,
} = {}) {
  await ensureInstitutionalSchema();
  const context = await getInstitutionalContext(clubId, { force: true });
  const wanted = Array.isArray(contactIds) && contactIds.length ? new Set(contactIds) : null;
  const contacts = wanted ? context.contacts.filter((c) => wanted.has(c.id)) : context.contacts;
  const plan = buildReconciliationPlan(
    contacts.map((contact) => contactToMatchInput(contact)),
    { profiles: context.profiles }
  );

  const runId = randomUUID();
  await db.query(
    `INSERT INTO "CrmInstitutionalRun" (id, "clubId", mode, status, summary, actor)
     VALUES ($1, $2, 'apply', 'running', '{}'::jsonb, $3)`,
    [runId, clubId, actor]
  );

  const summary = {
    contactsProcessed: plan.items.length,
    contactsWithClubData: plan.summary.contactsWithClubData,
    contactsConfirmed: 0,
    contactsAmbiguous: 0,
    contactsPending: 0,
    confirmed: 0,
    ambiguous: 0,
    pending: 0,
    unlinked: plan.summary.unlinkedContacts,
    linksInserted: 0,
    linksUpdated: 0,
    linksSkipped: 0,
    skipped: 0,
    skippedRejected: 0,
    byDistrict: {},
    byRole: {},
    unmatchedClubs: plan.summary.unmatchedClubs || [],
  };

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    for (const item of plan.items) {
      if (item.status === 'unlinked') { summary.skipped++; continue; }

      // Un contacto confirmado puede tener varios cargos (presidente,
      // secretario…). Se escriben TODOS los vínculos planificados, no sólo el
      // primario; cada uno tiene su propia clave contacto+cargo+período.
      const existing = (context.linksByContact.get(item.contactId) || []);
      const plannedLinks = Array.isArray(item.links) && item.links.length ? item.links : [null];
      const seenKeys = new Set();
      let itemStatus = null;
      let wroteForItem = false;

      for (const plannedLink of plannedLinks) {
        const row = plannedItemToRow(item, plannedLink);
        if (seenKeys.has(row.dedupeKey)) continue;
        seenKeys.add(row.dedupeKey);

        if (row.linkStatus === 'ambiguous' && confirmAmbiguous) {
          row.linkStatus = 'confirmed';
          row.profileId = row.candidateProfileId;
          row.candidateProfileId = null;
          row.confidence = 100;
          row.reason = 'Coincidencia aproximada confirmada por un administrador.';
        }

        const before = existing.find((link) => link.dedupeKey === row.dedupeKey) || null;
        // Un vínculo descartado por un administrador no se resucita solo.
        if (before?.linkStatus === 'rejected' && !force) {
          summary.linksSkipped++;
          summary.skippedRejected++;
          continue;
        }
        if (before?.linkStatus === 'confirmed' && row.linkStatus !== 'confirmed') {
          summary.linksSkipped++;
          continue;
        }

        const linkId = before?.id || randomUUID();
        if (before) {
          await client.query(
            `UPDATE "CrmInstitutionalLink" SET
              "profileId" = $1, "candidateProfileId" = $2, "districtNumber" = $3,
              "rawClubName" = $4, role = $5, "roleLabel" = $6, period = $7,
              "linkStatus" = $8, confidence = $9, "matchMethod" = $10, "sourceValue" = $11,
              "isPrimary" = $12, reason = $13, "dedupeKey" = $14, "updatedAt" = NOW()
             WHERE id = $15`,
            [
              row.profileId, row.candidateProfileId, row.districtNumber, row.rawClubName,
              row.role, row.roleLabel, row.period, row.linkStatus, row.confidence,
              row.matchMethod, row.sourceValue, row.isPrimary, row.reason, row.dedupeKey, linkId,
            ]
          );
          summary.linksUpdated++;
        } else {
          await client.query(
            `INSERT INTO "CrmInstitutionalLink" (
              id, "clubId", "contactId", "profileId", "candidateProfileId", "districtNumber",
              "rawClubName", role, "roleLabel", period, "linkStatus", confidence,
              "matchMethod", "sourceValue", "isPrimary", reason, "dedupeKey"
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
            [
              linkId, clubId, row.contactId, row.profileId, row.candidateProfileId, row.districtNumber,
              row.rawClubName, row.role, row.roleLabel, row.period, row.linkStatus, row.confidence,
              row.matchMethod, row.sourceValue, row.isPrimary, row.reason, row.dedupeKey,
            ]
          );
          summary.linksInserted++;
        }

        const after = await client.query(`SELECT * FROM "CrmInstitutionalLink" WHERE id = $1`, [linkId]);
        await client.query(
          `INSERT INTO "CrmInstitutionalAudit" (
            id, "clubId", "contactId", "linkId", "runId", action, actor, before, after, reason
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10)`,
          [
            randomUUID(), clubId, row.contactId, linkId, runId, before ? 'reconcile_update' : 'reconcile_create',
            actor, before ? JSON.stringify(before) : null, JSON.stringify(after.rows[0]), row.reason,
          ]
        );

        wroteForItem = true;
        itemStatus = row.linkStatus;
        if (row.linkStatus === 'confirmed') summary.confirmed++;
        else if (row.linkStatus === 'ambiguous') summary.ambiguous++;
        else if (row.linkStatus === 'pending') summary.pending++;
        if (row.districtNumber) summary.byDistrict[row.districtNumber] = (summary.byDistrict[row.districtNumber] || 0) + 1;
        summary.byRole[row.roleLabel] = (summary.byRole[row.roleLabel] || 0) + 1;
      }

      if (!wroteForItem) {
        summary.skipped++;
        continue;
      }
      if (itemStatus === 'confirmed') summary.contactsConfirmed++;
      else if (itemStatus === 'ambiguous') summary.contactsAmbiguous++;
      else if (itemStatus === 'pending') summary.contactsPending++;
    }

    await client.query(
      `UPDATE "CrmInstitutionalRun"
       SET status = 'completed', summary = $1::jsonb, "finishedAt" = NOW()
       WHERE id = $2`,
      [JSON.stringify(summary), runId]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    await db.query(
      `UPDATE "CrmInstitutionalRun" SET status = 'failed', summary = $1::jsonb, "finishedAt" = NOW() WHERE id = $2`,
      [JSON.stringify({ ...summary, error: error.message }), runId]
    ).catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  invalidateInstitutionalCache(clubId);
  const run = await getInstitutionalRun(clubId, runId);
  return { ok: true, run, summary };
}

export async function getInstitutionalRun(clubId, runId) {
  const { rows } = await db.query(
    `SELECT * FROM "CrmInstitutionalRun" WHERE id = $1 AND "clubId" = $2 LIMIT 1`,
    [runId, clubId]
  );
  return rows[0] || null;
}

export async function listInstitutionalRuns(clubId, limit = 10) {
  const { rows } = await db.query(
    `SELECT * FROM "CrmInstitutionalRun" WHERE "clubId" = $1 ORDER BY "createdAt" DESC LIMIT $2`,
    [clubId, Math.max(1, Math.min(Number(limit) || 10, 50))]
  );
  return rows;
}

/**
 * Revierte una ejecución: las filas creadas se borran y las actualizadas
 * vuelven a su contenido anterior. No toca nada más.
 */
export async function rollbackInstitutionalRun(clubId, runId, actor = 'sistema') {
  await ensureInstitutionalSchema();
  const run = await getInstitutionalRun(clubId, runId);
  if (!run) throw new Error('Ejecución no encontrada.');
  if (run.status === 'rolled_back') throw new Error('Esta ejecución ya fue revertida.');
  if (run.status !== 'completed') throw new Error('Sólo se puede revertir una ejecución completada.');

  const { rows: changes } = await db.query(
    `SELECT * FROM "CrmInstitutionalAudit"
     WHERE "runId" = $1 AND "clubId" = $2 AND action IN ('reconcile_create', 'reconcile_update')
     ORDER BY "createdAt" ASC`,
    [runId, clubId]
  );

  const summary = { linksDeleted: 0, linksRestored: 0, audits: changes.length };
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    for (const change of changes) {
      if (!change.before) {
        await client.query(`DELETE FROM "CrmInstitutionalLink" WHERE id = $1`, [change.linkId]);
        summary.linksDeleted++;
      } else {
        const before = typeof change.before === 'string' ? JSON.parse(change.before) : change.before;
        await client.query(
          `UPDATE "CrmInstitutionalLink" SET
            "profileId" = $1, "candidateProfileId" = $2, "districtNumber" = $3,
            "rawClubName" = $4, role = $5, "roleLabel" = $6, period = $7,
            "linkStatus" = $8, confidence = $9, "matchMethod" = $10, "sourceValue" = $11,
            "isPrimary" = $12, reason = $13, "updatedAt" = NOW()
           WHERE id = $14`,
          [
            before.profileId, before.candidateProfileId, before.districtNumber, before.rawClubName,
            before.role, before.roleLabel, before.period, before.linkStatus, before.confidence,
            before.matchMethod, before.sourceValue, before.isPrimary, before.reason, change.linkId,
          ]
        );
        summary.linksRestored++;
      }
      await client.query(
        `INSERT INTO "CrmInstitutionalAudit" (
          id, "clubId", "contactId", "linkId", "runId", action, actor, before, after, reason
        ) VALUES ($1,$2,$3,$4,$5,'rollback',$6,$7::jsonb,$8::jsonb,$9)`,
        [
          randomUUID(), clubId, change.contactId, change.linkId, runId, actor,
          change.after ? JSON.stringify(change.after) : null,
          change.before ? JSON.stringify(change.before) : null,
          'Rollback de la conciliación institucional.',
        ]
      );
    }
    await client.query(
      `UPDATE "CrmInstitutionalRun"
       SET status = 'rolled_back', "rolledBackAt" = NOW(), "rolledBackBy" = $1
       WHERE id = $2`,
      [actor, runId]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  invalidateInstitutionalCache(clubId);
  return { ok: true, runId, summary };
}

// ── Vínculos manuales ───────────────────────────────────────────────────────

export async function upsertInstitutionalLink(clubId, payload = {}, actor = 'sistema') {
  await ensureInstitutionalSchema();
  const contactId = String(payload.contactId || '').trim();
  if (!contactId) throw new Error('Falta el contacto.');

  const contact = await db.prisma.crmContact.findFirst({ where: { id: contactId, clubId } });
  if (!contact) throw new Error('El contacto no pertenece a este sitio.');

  const linkStatus = ['confirmed', 'ambiguous', 'pending', 'rejected'].includes(payload.linkStatus)
    ? payload.linkStatus
    : (payload.action === 'confirm' ? 'confirmed' : payload.action === 'reject' ? 'rejected' : 'pending');

  const profileId = payload.profileId || null;
  const candidateProfileId = payload.candidateProfileId || null;
  if (linkStatus === 'confirmed') {
    if (!profileId) throw new Error('Para confirmar un vínculo hace falta un perfil del Directorio.');
    const { rows } = await db.query(`SELECT id FROM "DistrictClubProfile" WHERE id = $1 LIMIT 1`, [profileId]);
    if (!rows.length) throw new Error('El perfil del Directorio no existe.');
  }

  const role = payload.role || 'member';
  const period = payload.period || null;
  const dedupeKey = linkDedupeKey(contactId, role, period);
  const { rows: existingRows } = await db.query(
    `SELECT * FROM "CrmInstitutionalLink" WHERE "clubId" = $1 AND "dedupeKey" = $2 LIMIT 1`,
    [clubId, dedupeKey]
  );
  const before = existingRows[0] || null;
  const linkId = before?.id || randomUUID();

  const values = [
    profileId,
    candidateProfileId,
    payload.districtNumber == null ? null : Number(payload.districtNumber),
    payload.rawClubName || null,
    role,
    roleLabel(role),
    period,
    linkStatus,
    Number(payload.confidence) || (linkStatus === 'confirmed' ? 100 : 0),
    payload.matchMethod || 'manual',
    payload.sourceValue || payload.rawClubName || null,
    !!payload.isPrimary,
    payload.reason || (linkStatus === 'confirmed' ? 'Vínculo confirmado por un administrador.' : null),
    actor,
  ];

  if (before) {
    await db.query(
      `UPDATE "CrmInstitutionalLink" SET
        "profileId"=$1, "candidateProfileId"=$2, "districtNumber"=$3, "rawClubName"=$4,
        role=$5, "roleLabel"=$6, period=$7, "linkStatus"=$8, confidence=$9,
        "matchMethod"=$10, "sourceValue"=$11, "isPrimary"=$12, reason=$13,
        "reviewedBy"=$14, "reviewedAt"=NOW(), "updatedAt"=NOW()
       WHERE id=$15`,
      [...values, linkId]
    );
  } else {
    await db.query(
      `INSERT INTO "CrmInstitutionalLink" (
        id, "clubId", "contactId", "profileId", "candidateProfileId", "districtNumber",
        "rawClubName", role, "roleLabel", period, "linkStatus", confidence, "matchMethod",
        "sourceValue", "isPrimary", reason, "reviewedBy", "reviewedAt", "dedupeKey"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW(),$18)`,
      [linkId, clubId, contactId, ...values, dedupeKey]
    );
  }

  const { rows: afterRows } = await db.query(`SELECT * FROM "CrmInstitutionalLink" WHERE id = $1`, [linkId]);
  await db.query(
    `INSERT INTO "CrmInstitutionalAudit" (
      id, "clubId", "contactId", "linkId", action, actor, before, after, reason
    ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)`,
    [
      randomUUID(), clubId, contactId, linkId,
      before ? 'manual_update' : 'manual_create', actor,
      before ? JSON.stringify(before) : null, JSON.stringify(afterRows[0]), payload.reason || null,
    ]
  );

  invalidateInstitutionalCache(clubId);
  return afterRows[0];
}

export async function updateInstitutionalLink(clubId, linkId, payload = {}, actor = 'sistema') {
  await ensureInstitutionalSchema();
  const { rows } = await db.query(
    `SELECT * FROM "CrmInstitutionalLink" WHERE id = $1 AND "clubId" = $2 LIMIT 1`,
    [linkId, clubId]
  );
  const before = rows[0];
  if (!before) throw new Error('Vínculo no encontrado.');

  const action = payload.action || null;
  const linkStatus = ['confirmed', 'ambiguous', 'pending', 'rejected'].includes(payload.linkStatus)
    ? payload.linkStatus
    : (action === 'confirm' ? 'confirmed' : action === 'reject' ? 'rejected' : before.linkStatus);

  let profileId = payload.profileId !== undefined ? payload.profileId : before.profileId;
  let candidateProfileId = payload.candidateProfileId !== undefined
    ? payload.candidateProfileId
    : before.candidateProfileId;

  // Confirmar un candidato no exige que la UI mande dos veces el mismo id.
  if (linkStatus === 'confirmed' && !profileId && candidateProfileId) {
    profileId = candidateProfileId;
    candidateProfileId = null;
  }
  if (linkStatus === 'confirmed') {
    if (!profileId) throw new Error('Para confirmar un vínculo hace falta un perfil del Directorio.');
    const { rows: profileRows } = await db.query(
      `SELECT id FROM "DistrictClubProfile" WHERE id = $1 LIMIT 1`,
      [profileId]
    );
    if (!profileRows.length) throw new Error('El perfil del Directorio no existe.');
    candidateProfileId = null;
  }

  const role = payload.role || before.role || 'member';
  const period = payload.period !== undefined ? (payload.period || null) : (before.period || null);
  const dedupeKey = linkDedupeKey(before.contactId, role, period);

  // Actualizar un vínculo no puede chocar con otro del mismo contacto, cargo y
  // período. Antes se delegaba en un upsert por clave y podía crear una fila
  // nueva en lugar de modificar la existente.
  const { rows: collision } = await db.query(
    `SELECT id FROM "CrmInstitutionalLink"
     WHERE "clubId" = $1 AND "dedupeKey" = $2 AND id <> $3
     LIMIT 1`,
    [clubId, dedupeKey, linkId]
  );
  if (collision.length) {
    throw new Error('Ya existe otro vínculo para ese contacto con el mismo cargo y período.');
  }

  const confidence = payload.confidence !== undefined
    ? (Number(payload.confidence) || 0)
    : (action === 'confirm' ? 100 : (Number(before.confidence) || 0));

  const values = [
    profileId || null,
    candidateProfileId || null,
    payload.districtNumber !== undefined
      ? (payload.districtNumber == null ? null : Number(payload.districtNumber))
      : before.districtNumber,
    payload.rawClubName !== undefined ? (payload.rawClubName || null) : before.rawClubName,
    role,
    roleLabel(role),
    period,
    linkStatus,
    confidence,
    payload.matchMethod || before.matchMethod || 'manual',
    payload.sourceValue !== undefined ? (payload.sourceValue || null) : before.sourceValue,
    payload.isPrimary !== undefined ? !!payload.isPrimary : !!before.isPrimary,
    payload.reason !== undefined ? (payload.reason || null) : before.reason,
    dedupeKey,
    actor,
  ];

  await db.query(
    `UPDATE "CrmInstitutionalLink" SET
      "profileId" = $1, "candidateProfileId" = $2, "districtNumber" = $3, "rawClubName" = $4,
      role = $5, "roleLabel" = $6, period = $7, "linkStatus" = $8, confidence = $9,
      "matchMethod" = $10, "sourceValue" = $11, "isPrimary" = $12, reason = $13,
      "dedupeKey" = $14, "reviewedBy" = $15, "reviewedAt" = NOW(), "updatedAt" = NOW()
     WHERE id = $16 AND "clubId" = $17`,
    [...values, linkId, clubId]
  );

  const { rows: afterRows } = await db.query(
    `SELECT * FROM "CrmInstitutionalLink" WHERE id = $1 AND "clubId" = $2 LIMIT 1`,
    [linkId, clubId]
  );

  const auditAction = action === 'confirm'
    ? 'manual_confirm'
    : action === 'reject'
      ? 'manual_reject'
      : 'manual_update';

  await db.query(
    `INSERT INTO "CrmInstitutionalAudit" (
      id, "clubId", "contactId", "linkId", action, actor, before, after, reason
    ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)`,
    [
      randomUUID(), clubId, before.contactId, linkId, auditAction, actor,
      JSON.stringify(before), JSON.stringify(afterRows[0]),
      payload.reason || (action === 'confirm' ? 'Vínculo confirmado por un administrador.' : null),
    ]
  );

  invalidateInstitutionalCache(clubId);
  return afterRows[0];
}

// ── Analítica institucional ─────────────────────────────────────────────────

export async function getInstitutionalOverview(clubId) {
  const context = await getInstitutionalContext(clubId);
  const segments = evaluateInstitutionalSegments(context);

  const statusCounts = Object.fromEntries(INSTITUTIONAL_STATUSES.map((status) => [status.key, 0]));
  const statusContacts = Object.fromEntries(INSTITUTIONAL_STATUSES.map((status) => [status.key, 0]));
  for (const contact of context.contacts) {
    statusContacts[contact.institutional.status] = (statusContacts[contact.institutional.status] || 0) + 1;
  }
  for (const link of context.links) {
    statusCounts[link.linkStatus] = (statusCounts[link.linkStatus] || 0) + 1;
  }

  const withClubData = context.contacts.filter((contact) =>
    contact.institutional.rawClubName || contact.institutional.districtNumber != null
  ).length;
  const withClubName = context.contacts.filter((contact) => !!contact.institutional.rawClubName).length;
  const withDistrictOnly = withClubData - withClubName;
  const confirmed = context.contacts.filter((contact) => contact.institutional.status === 'confirmed').length;
  const linkedContactIds = new Set(context.links.filter((link) => link.linkStatus === 'confirmed').map((link) => link.contactId));

  const byDistrict = {};
  const byRole = {};
  const byPlatform = {};
  for (const contact of context.contacts) {
    const district = contact.institutional.districtNumber;
    if (district) byDistrict[district] = (byDistrict[district] || 0) + 1;
    if (contact.institutional.status === 'confirmed') {
      for (const link of contact.institutional.confirmedLinks || []) {
        byRole[link.roleLabel] = (byRole[link.roleLabel] || 0) + 1;
      }
    }
    const platform = contact.institutional.platformStatus || 'unverified';
    byPlatform[platform] = (byPlatform[platform] || 0) + 1;
  }

  const completionBuckets = { '0-29': 0, '30-59': 0, '60-79': 0, '80-100': 0 };
  const platformProfiles = { active: 0, pending: 0, inactive: 0, unverified: 0 };
  for (const profile of context.profiles) {
    const pct = Number(profile.completionPercentage) || 0;
    if (pct < 30) completionBuckets['0-29']++;
    else if (pct < 60) completionBuckets['30-59']++;
    else if (pct < 80) completionBuckets['60-79']++;
    else completionBuckets['80-100']++;
    platformProfiles[profile.platformStatus] = (platformProfiles[profile.platformStatus] || 0) + 1;
  }

  const unmatched = new Map();
  for (const contact of context.contacts) {
    const inst = contact.institutional;
    if (inst.status === 'confirmed' || !inst.rawClubName) continue;
    const key = `${normalizeInstitutionalName(inst.rawClubName)}|${inst.districtNumber || ''}`;
    const current = unmatched.get(key) || {
      rawClubName: inst.rawClubName,
      districtNumber: inst.districtNumber,
      candidateName: inst.candidateProfileName,
      count: 0,
      statuses: {},
    };
    current.count++;
    current.statuses[inst.status] = (current.statuses[inst.status] || 0) + 1;
    unmatched.set(key, current);
  }

  const clubsWithContacts = new Set();
  for (const link of context.links) {
    if (link.linkStatus === 'confirmed' && link.profileId) clubsWithContacts.add(link.profileId);
  }

  const clubsWithoutContacts = context.profiles
    .filter((profile) => !clubsWithContacts.has(profile.id))
    .sort((a, b) => (a.completionPercentage || 0) - (b.completionPercentage || 0))
    .slice(0, 12)
    .map((profile) => ({
      ...profileSummary(profile),
      segment: profile.districtNumber ? `Distrito ${profile.districtNumber}` : 'Sin distrito',
    }));

  const runs = await listInstitutionalRuns(clubId, 5);
  const lastCompleted = runs.find((run) => run.status === 'completed') || null;

  const contactEmails = context.contacts.filter((contact) => !!contact.email).length;
  const contactPhones = context.contacts.filter((contact) => !!contact.phone).length;
  const consentGranted = context.contacts.filter((contact) => (contact.consentState || 'unknown') === 'granted').length;
  const consentUnknown = context.contacts.filter((contact) => !contact.consentState || contact.consentState === 'unknown').length;

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    totals: {
      contacts: context.contacts.length,
      contactsWithClubData: withClubData,
      contactsWithClubName: withClubName,
      contactsWithDistrictOnly: withDistrictOnly,
      contactsWithoutClubData: context.contacts.length - withClubData,
      confirmedContacts: confirmed,
      linkedContacts: linkedContactIds.size,
      profileCoverage: withClubName ? Math.round((confirmed / withClubName) * 100) : 0,
      directoryProfiles: context.profiles.length,
      directoryDistricts: [...new Set(context.profiles.map((profile) => Number(profile.districtNumber)).filter(Boolean))],
      clubsWithContacts: clubsWithContacts.size,
      clubsWithoutContacts: Math.max(0, context.profiles.length - clubsWithContacts.size),
    },
    statusContacts,
    linkStatusCounts: statusCounts,
    byDistrict,
    byRole,
    byPlatform,
    platformProfiles,
    completionBuckets,
    dataQuality: {
      contactEmails,
      contactPhones,
      consentGranted,
      consentUnknown,
    },
    unmatchedClubs: [...unmatched.values()].sort((a, b) => b.count - a.count).slice(0, 25),
    clubsWithoutContacts,
    segments,
    runs,
    lastRun: lastCompleted,
    notes: [
      'El porcentaje de completitud se lee del Directorio Oficial; el CRM no lo recalcula.',
      'El estado Club Platform se lee de Club.status/dominio y de RotaryClubActivation; nunca de etiquetas del CRM.',
      'Los contactos del Distrito 4271 sin perfil en el Directorio quedan pendientes y NO se cruzan contra el 4281.',
      'Una coincidencia exacta sin aplicar se muestra como sugerencia y no cuenta como relación confirmada.',
    ],
  };
}

// ── Catálogo para la UI ─────────────────────────────────────────────────────

export function getInstitutionalCatalog() {
  return {
    statuses: INSTITUTIONAL_STATUSES,
    platformStatuses: PLATFORM_STATUSES,
    roles: ROLE_CATALOG.filter((role) => role.key !== 'other'),
    districts: Object.entries(CLUBS_BY_DISTRICT_NUMBER).map(([number, clubs]) => ({
      number: Number(number),
      label: `Distrito ${number}`,
      clubs: clubs.length,
      hasDirectory: false,
    })),
    segments: INSTITUTIONAL_SEGMENTS,
    periods: (() => {
      const now = new Date();
      const start = now.getMonth() + 1 >= 7 ? now.getFullYear() : now.getFullYear() - 1;
      return [`${start}-${start + 1}`, `${start - 1}-${start}`];
    })(),
  };
}

export default {
  ensureInstitutionalSchema,
  loadDirectoryProfiles,
  enrichContactPage,
  getInstitutionalContext,
  filterInstitutionalContactIds,
  hasInstitutionalFilters,
  resolveInstitutionalSegment,
  evaluateInstitutionalSegments,
  getInstitutionalContactDetail,
  getInstitutionalClubDetail,
  previewInstitutionalReconciliation,
  applyInstitutionalReconciliation,
  rollbackInstitutionalRun,
  listInstitutionalRuns,
  upsertInstitutionalLink,
  updateInstitutionalLink,
  getInstitutionalOverview,
  getInstitutionalCatalog,
  invalidateInstitutionalCache,
  INSTITUTIONAL_STATUSES,
  PLATFORM_STATUSES,
  INSTITUTIONAL_SEGMENTS,
  statusMeta,
  platformMeta,
};
