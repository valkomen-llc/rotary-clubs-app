// ════════════════════════════════════════════════════════════════════════════
// Conciliación institucional CRM ↔ Directorio Oficial de Clubes
//
// PURO: sin base, sin red, sin DOM. Recibe contactos y el catálogo de perfiles
// y decide a qué club corresponde cada uno. Se puede probar sin tocar datos.
//
// Reglas de oro:
//   · Un contacto pertenece a UN club por vínculo, pero puede tener varios
//     cargos y varios períodos (una fila por cargo/período).
//   · El nombre del TENANT del CRM (`Club Platform for Rotary`) jamás es un
//     club de pertenencia. Se descarta explícitamente.
//   · Sólo se confirma una coincidencia EXACTA y ÚNICA. Todo lo demás queda
//     pendiente de validación administrativa. Es preferible un pendiente a un
//     vínculo equivocado.
//   · Un club del 4271 sin perfil en el Directorio NO se cruza contra el 4281:
//     se conserva el texto original y el distrito, y queda pendiente.
// ════════════════════════════════════════════════════════════════════════════

import { CLUBS_BY_DISTRICT_NUMBER } from './rotaryClubs.js';

export const ROLE_CATALOG = [
  { key: 'president', label: 'Presidente', patterns: [/president/i, /presidencia/i] },
  { key: 'secretary', label: 'Secretario/a', patterns: [/secretar/i] },
  { key: 'treasurer', label: 'Tesorero/a', patterns: [/tesor/i, /treasur/i] },
  { key: 'public_image', label: 'Imagen Pública', patterns: [/imagen\s+p[uú]blica/i, /public\s+image/i] },
  { key: 'communications', label: 'Comunicaciones', patterns: [/comunicaci/i, /communications/i] },
  { key: 'membership', label: 'Membresía', patterns: [/membres/i] },
  { key: 'foundation', label: 'Fundación Rotaria', patterns: [/fundaci[oó]n\s+rotaria/i, /rotary\s+foundation/i] },
  { key: 'youth_exchange', label: 'Intercambio Juvenil / YEO', patterns: [/\byeos?\b/i, /intercambio\s+juvenil/i, /youth\s+exchange/i] },
  { key: 'community_service', label: 'Servicio a la Comunidad', patterns: [/servicio\s+a\s+la\s+comunidad/i, /community\s+service/i] },
  { key: 'learning_facilitator', label: 'Facilitador de Aprendizaje', patterns: [/facilitador(a)?\s+de\s+aprendizaje/i, /learning\s+facilitator/i] },
  { key: 'governor_aide', label: 'Asistente de Gobernación', patterns: [/asistente(s)?\s+de\s+gobernaci/i, /governor\s+aide/i] },
  { key: 'technology', label: 'Tecnología', patterns: [/tecnolog/i, /technology/i] },
  { key: 'platform_admin', label: 'Administrador de Club Platform', patterns: [/club\s+platform/i, /administrador(a)?\s+de\s+la\s+plataforma/i] },
  { key: 'other', label: 'Otro cargo institucional', patterns: [] },
];

export const ROLE_KEYS = ROLE_CATALOG.map((r) => r.key);
const ROLE_BY_KEY = new Map(ROLE_CATALOG.map((r) => [r.key, r]));

export const roleLabel = (key) => ROLE_BY_KEY.get(key)?.label || 'Contacto institucional';
export const isRoleKey = (key) => ROLE_BY_KEY.has(key);

/** Roles que identifican a un dirigente del club (no un asistente a evento). */
const LEADERSHIP_ROLES = new Set([
  'president', 'secretary', 'treasurer', 'public_image', 'communications',
  'membership', 'foundation', 'youth_exchange', 'community_service',
  'learning_facilitator', 'governor_aide', 'technology', 'platform_admin',
]);

const TENANT_NAMES = new Set([
  'club platform for rotary',
  'plataforma de club para rotary',
  'club platform',
  'club principal',
]);

const CLUB_ALIASES = new Map(Object.entries({
  'santa fe bogota': 'bogota',
  'santa fe de bogota': 'bogota',
  'bogota d c': 'bogota',
  'bogota dc': 'bogota',
  'bogota colombia': 'bogota',
  'bogota colombia d c': 'bogota',
  'medellin colombia': 'medellin',
  'cali colombia': 'cali',
  'tulua el lago': 'tulua el lago',
  'monteria ii': 'monteria ii',
  'monteria 2': 'monteria ii',
  'cucuta ciudad de los arboles': 'cucuta ciudad de arboles',
}));

const COUNTRY_WORDS = new Set([
  'colombia', 'panama', 'chile', 'ecuador', 'peru', 'venezuela', 'mexico',
  'estados unidos', 'usa', 'canada', 'jamaica', 'kingston',
]);

/** Sin tildes, sin mayúsculas, sin puntuación y sin decoraciones de club. */
export function normalizeInstitutionalName(raw) {
  let s = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  // Números de club entre paréntesis: "Montería II (85207)" → "montería ii".
  s = s.replace(/\([^)]*\)/g, ' ');
  // "D-4281", "Distrito 4281", "Km 5" no forman parte del nombre del club.
  s = s.replace(/\b(d|distrito|district)\s*[-–]?\s*4\d{3}\b/gi, ' ');
  s = s.replace(/[^a-z0-9]+/g, ' ');

  // Prefijos y abreviaturas: CRBuga, CR Villavicencio, Club Rotario X…
  s = s.replace(/^\s*(club\s+rotario|club\s+rotaract|club\s+interact|rotary\s+club\s+of|rotary\s+club|rotaract\s+club|interact\s+club|rotary|rotaract|interact|club|cr)\b/gi, ' ');
  s = s.replace(/^cr(?=[a-z])/i, ' ');

  const stop = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'the', 'of', 'rotary', 'rotario', 'rotaria']);
  const tokens = s.split(/\s+/).filter((t) => t && !stop.has(t));
  // "Cucúta ciudad de las árboles Cucuta" repite el nombre al final.
  s = [...new Set(tokens)].join(' ').replace(/\s+/g, ' ').trim();

  if (CLUB_ALIASES.has(s)) s = CLUB_ALIASES.get(s);
  return s;
}

/**
 * Tipo de organización que declara el nombre. Rotaract e Interact NO son
 * clubes rotarios: comparten ciudad, pero no institución. Si el Directorio
 * sólo tiene perfiles `rotary`, un contacto de Rotaract debe quedar pendiente
 * y nunca confirmarse contra el club rotario de la misma ciudad.
 */
export function organizationTypeFromName(raw) {
  const s = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (/\brotaract\b/.test(s)) return 'rotaract';
  if (/\binteract\b/.test(s)) return 'interact';
  return 'rotary';
}

/** Limpia el valor original sin destruirlo: se guarda para auditoría. */
export function cleanRawClubName(raw) {
  const value = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!value) return '';
  if (TENANT_NAMES.has(value.toLowerCase())) return '';
  // El tenant de la plataforma no es un club de pertenencia, aunque venga en
  // el campo "Empresa" o en una lista.
  if (/^club platform( for rotary)?$/i.test(value)) return '';
  if (/^plataforma de club para rotary$/i.test(value)) return '';
  return value;
}

/** Compara un nombre crudo contra el catálogo curado y deduce el distrito. */
export function districtFromCatalog(rawClubName) {
  const n = normalizeInstitutionalName(rawClubName);
  if (!n) return null;
  const hits = [];
  for (const [district, clubs] of Object.entries(CLUBS_BY_DISTRICT_NUMBER || {})) {
    for (const name of clubs || []) {
      const normalized = normalizeInstitutionalName(name);
      if (normalized && normalized === n) hits.push(Number(district));
    }
  }
  const unique = [...new Set(hits)];
  return unique.length === 1 ? unique[0] : null;
}

/**
 * Devuelve el número de distrito que el texto DECLARA, aunque no tengamos su
 * catálogo de clubes. Es imprescindible para no cruzar un contacto del 7040
 * contra los perfiles del 4281: si el distrito se declara, se respeta.
 */
export function declaredDistrictNumber(...values) {
  for (const value of values) {
    const text = String(value || '');
    const labelled = text.match(/\b(?:distrito|district|d)\s*[-–]?\s*(\d{4})\b/i);
    if (labelled) {
      const n = Number(labelled[1]);
      if (n >= 1000) return n;
    }
    const bare = text.match(/\b(\d{4})\b/);
    if (bare) {
      const n = Number(bare[1]);
      // Un año (2026) o un teléfono no son distritos rotarios. Los distritos
      // reales de Rotary son números de cuatro cifras entre 1000 y 9999, pero
      // en la práctica el rango útil empieza en 4000.
      if (n >= 4000 && n <= 9999) return n;
    }
  }
  return null;
}

/** Sólo devuelve distritos cuyo catálogo de clubes conocemos. */
export function districtFromText(...values) {
  const n = declaredDistrictNumber(...values);
  return n && CLUBS_BY_DISTRICT_NUMBER?.[n] ? n : null;
}

export function inferRoles({ titles = [], listNames = [], tagNames = [], cargo = '' } = {}) {
  const texts = [
    ...(Array.isArray(titles) ? titles : [titles]),
    ...(Array.isArray(listNames) ? listNames : [listNames]),
    ...(Array.isArray(tagNames) ? tagNames : [tagNames]),
    cargo,
  ].filter(Boolean).map(String);

  const found = [];
  for (const text of texts) {
    for (const role of ROLE_CATALOG) {
      if (!role.patterns.length) continue;
      if (role.patterns.some((re) => re.test(text)) && !found.includes(role.key)) {
        found.push(role.key);
      }
    }
  }

  // Si sólo aparece una lista de evento ("Preinscrito", "Capacitación"), no se
  // inventa un cargo de dirigente: se registra como contacto institucional.
  if (!found.length) return [{ key: 'member', label: 'Contacto institucional' }];
  return found.map((key) => ({ key, label: roleLabel(key) }));
}

/** "Presidentes, Rotary 4281 (2026-27)" → "2026-2027". */
export function inferPeriod({ listNames = [], fallback = null, now = new Date() } = {}) {
  const texts = (Array.isArray(listNames) ? listNames : [listNames]).filter(Boolean).map(String);
  for (const text of texts) {
    const m = text.match(/\b(20\d{2})\s*[-–—/]\s*(\d{2,4})\b/);
    if (!m) continue;
    const start = Number(m[1]);
    let end = Number(m[2]);
    if (end < 100) end = Math.floor(start / 100) * 100 + end;
    if (end > start && end - start <= 2) return `${start}-${end}`;
  }
  if (fallback) {
    const normalized = String(fallback).replace(/[–—]/g, '-').replace(/\s/g, '');
    if (/^20\d{2}-20\d{2}$/.test(normalized)) return normalized;
  }
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1–12
  const start = month >= 7 ? year : year - 1;
  return `${start}-${start + 1}`;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

function ratio(a, b) {
  const max = Math.max(a.length, b.length) || 1;
  return 1 - levenshtein(a, b) / max;
}

function tokenDice(a, b) {
  const A = new Set(a.split(' ').filter(Boolean));
  const B = new Set(b.split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return (2 * inter) / (A.size + B.size);
}

function withoutCountry(normalized) {
  const tokens = normalized.split(' ').filter((t) => !COUNTRY_WORDS.has(t));
  return tokens.join(' ').trim();
}

/** Puntúa un nombre crudo contra un perfil oficial. 0–100. */
export function scoreProfile(rawClubName, profile) {
  const raw = withoutCountry(normalizeInstitutionalName(rawClubName));
  const short = withoutCountry(normalizeInstitutionalName(profile.shortName));
  const official = withoutCountry(normalizeInstitutionalName(profile.officialName));
  if (!raw) return 0;
  if (raw === short || raw === official) return 100;

  const rawTokens = raw.split(' ').filter(Boolean);
  const shortTokens = short.split(' ').filter(Boolean);

  // "Bogotá" contra "Bogotá Capital" es una coincidencia parcial: puede ser el
  // club Bogotá o el Bogotá Capital. Se deja como ambigua, nunca confirmada.
  if (raw.length >= 4 && (short.startsWith(raw + ' ') || raw.startsWith(short + ' '))) {
    return 90;
  }
  if (raw.length >= 4 && (official.startsWith(raw + ' ') || raw.startsWith(official + ' '))) {
    return 88;
  }

  const dice = tokenDice(raw, short);
  if (dice >= 0.88) return Math.round(75 + dice * 20); // 93–100 aprox.
  if (dice >= 0.72) return Math.round(70 + dice * 15); // 81–80 aprox.

  // Nombres largos con una errata ("Cucúta ciudad de las árboles").
  if (rawTokens.length >= 2 && shortTokens.length >= 2) {
    const r = ratio(raw, short);
    if (r >= 0.90) return 84;
    if (r >= 0.82) return 76;
  }

  return Math.round(dice * 60);
}

/**
 * Devuelve candidatos ordenados. `profiles` debe traer districtNumber,
 * organizationType, officialName, shortName e id.
 */
export function rankClubCandidates(rawClubName, profiles, { districtNumber = null, organizationType = null } = {}) {
  let pool = Array.isArray(profiles) ? profiles : [];
  if (organizationType) {
    pool = pool.filter((p) => (p.organizationType || 'rotary') === organizationType);
  }
  if (districtNumber) {
    pool = pool.filter((p) => Number(p.districtNumber) === Number(districtNumber));
  }
  return pool
    .map((profile) => ({ profile, score: scoreProfile(rawClubName, profile) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || String(a.profile.officialName).localeCompare(String(b.profile.officialName)));
}

function pickCustom(customValues, keys) {
  if (!customValues || typeof customValues !== 'object') return '';
  const wanted = new Set(keys.map((k) => normalizeInstitutionalName(k)));
  for (const [key, value] of Object.entries(customValues)) {
    if (value == null || value === '') continue;
    if (wanted.has(normalizeInstitutionalName(key))) return String(value).trim();
  }
  return '';
}

function buildLink({ profileId, candidateProfileId, rawClubName, districtNumber, role, period, status, confidence, matchMethod, sourceValue, reason }) {
  const subject = profileId || candidateProfileId || `raw:${normalizeInstitutionalName(rawClubName).slice(0, 180)}`;
  return {
    profileId: profileId || null,
    candidateProfileId: candidateProfileId || null,
    rawClubName: rawClubName || null,
    districtNumber: districtNumber == null ? null : Number(districtNumber),
    role: role.key,
    roleLabel: role.label,
    period,
    linkStatus: status,
    confidence,
    matchMethod,
    sourceValue: sourceValue || rawClubName || null,
    reason: reason || '',
    dedupeKey: `${subject}|${role.key}|${period}`.slice(0, 500),
  };
}

/**
 * Concilia UN contacto.
 * `input`: { id, title, company, district, tags, listNames, customValues, siteClubName }
 * `directory`: { profiles, now }
 */
export function matchContactInstitutionally(input = {}, directory = {}) {
  const profiles = Array.isArray(directory.profiles) ? directory.profiles : [];
  const listNames = Array.isArray(input.listNames) ? input.listNames : [];
  const tags = Array.isArray(input.tags) ? input.tags : [];

  const customClub = pickCustom(input.customValues, ['Nombre del Club', 'Nombre club', 'club_name', 'Club', 'Club de pertenencia']);
  const companyClub = cleanRawClubName(input.company);
  const rawFromCustom = cleanRawClubName(customClub);
  const rawClubName = rawFromCustom || companyClub || cleanRawClubName(input.siteClubName) || '';
  const clubSource = rawFromCustom ? 'custom_field' : (companyClub ? 'company' : (input.siteClubName ? 'site' : 'none'));

  const customDistrict = pickCustom(input.customValues, ['Distrito', 'District', 'Número de distrito']);
  const cargo = pickCustom(input.customValues, ['Cargo Club', 'Cargo', 'Rol', 'Puesto']);
  const roles = inferRoles({
    titles: [input.title].filter(Boolean),
    listNames,
    tagNames: tags,
    cargo,
  });
  const primaryRole = roles[0] || { key: 'member', label: 'Contacto institucional' };

  // Prioridad del distrito:
  //   1. el campo explícito del contacto/custom field;
  //   2. el catálogo curado por el nombre del club (lo más fiable);
  //   3. una lista que nombre un CARGO (Presidentes 4271, Secretarios 4281…);
  //   4. cualquier otra lista o etiqueta que mencione el distrito.
  // Nunca al revés: una lista de evento del 4281 no puede arrastrar al 4281 a
  // un club que el catálogo ubica en el 4271.
  const roleListNames = listNames.filter((name) => {
    const inferred = inferRoles({ listNames: [name] });
    return inferred.some((role) => role.key !== 'member');
  });
  const explicitDistrict = declaredDistrictNumber(input.district, customDistrict);
  const districtNumber =
    explicitDistrict ||
    districtFromCatalog(rawClubName) ||
    declaredDistrictNumber(...roleListNames) ||
    declaredDistrictNumber(...listNames, ...tags) ||
    null;

  const period = inferPeriod({ listNames, fallback: null, now: directory.now || new Date() });

  if (!rawClubName) {
    // Sin club declarado, pero con distrito conocido: no es «sin vínculo», es
    // un contacto que pertenece al distrito y aún no tiene club identificado.
    const hasDistrict = districtNumber != null;
    return {
      contactId: input.id,
      status: hasDistrict ? 'pending' : 'unlinked',
      rawClubName: null,
      districtNumber,
      sourceValue: null,
      matchMethod: 'none',
      role: primaryRole.key,
      roleLabel: primaryRole.label,
      period,
      confidence: 0,
      profileId: null,
      profileName: null,
      candidateProfileId: null,
      candidateProfileName: null,
      links: hasDistrict ? [buildLink({
        profileId: null,
        candidateProfileId: null,
        rawClubName: null,
        districtNumber,
        role: primaryRole,
        period,
        status: 'pending',
        confidence: 0,
        matchMethod: 'none',
        sourceValue: null,
        reason: `El contacto pertenece al Distrito ${districtNumber}, pero no declara un club.`,
      })] : [],
      reason: hasDistrict
        ? `El contacto pertenece al Distrito ${districtNumber}, pero no declara un club.`
        : 'El contacto no tiene un club declarado en un campo institucional.',
    };
  }

  // Con distrito conocido se busca SÓLO en ese distrito. Si no hay perfiles
  // (caso 4271), no se cae al 4281: se conserva como pendiente.
  // Rotaract/Interact se buscan sólo contra perfiles de su mismo tipo.
  const organizationType = organizationTypeFromName(rawClubName);
  const candidates = rankClubCandidates(rawClubName, profiles, { districtNumber, organizationType });
  const top = candidates[0];
  const second = candidates[1];
  const margin = top ? top.score - (second?.score || 0) : 0;
  const tied = top && second && top.score === second.score;

  let status = 'pending';
  let profileId = null;
  let candidateProfileId = null;
  let confidence = 0;
  let reason = '';

  if (top && top.score === 100 && !tied) {
    status = 'confirmed';
    profileId = top.profile.id;
    confidence = 100;
    reason = 'Coincidencia exacta con el nombre oficial del Directorio.';
  } else if (top && top.score >= 75) {
    status = 'ambiguous';
    candidateProfileId = top.profile.id;
    confidence = top.score;
    reason = tied
      ? 'Hay más de un club con coincidencia equivalente; requiere validación.'
      : `Coincidencia aproximada (${top.score}%) con ${top.profile.officialName || top.profile.shortName}; requiere validación.`;
  } else {
    status = 'pending';
    confidence = top?.score || 0;
    if (organizationType !== 'rotary') {
      reason = `Es un club ${organizationType === 'rotaract' ? 'Rotaract' : 'Interact'}; el Directorio sólo contiene clubes rotarios. Se conserva para vinculación posterior, sin asociarlo a un club rotario.`;
    } else {
      reason = districtNumber
        ? `El club declarado no existe todavía en el Directorio del Distrito ${districtNumber}. Se conserva para vinculación posterior.`
        : 'El club declarado no coincide con el Directorio. Se conserva para validación administrativa.';
    }
  }

  const profile = profiles.find((p) => p.id === (profileId || candidateProfileId)) || null;
  const effectiveDistrict = districtNumber || (profile?.districtNumber != null ? Number(profile.districtNumber) : null);

  const links = (status === 'confirmed' ? roles : [primaryRole]).map((role, index) => buildLink({
    profileId,
    candidateProfileId,
    rawClubName,
    districtNumber: effectiveDistrict,
    role,
    period,
    status,
    confidence,
    matchMethod: clubSource,
    sourceValue: rawClubName,
    reason,
  }));
  if (links[0]) links[0].isPrimary = true;
  // La clave de deduplicación SIEMPRE lleva el contacto: dos personas distintas
  // del mismo club y cargo no son la misma fila.
  for (const link of links) {
    link.dedupeKey = `${input.id}|${link.role}|${link.period || ''}`.slice(0, 500);
  }

  return {
    contactId: input.id,
    status,
    rawClubName,
    districtNumber: effectiveDistrict,
    sourceValue: rawClubName,
    matchMethod: clubSource,
    role: primaryRole.key,
    roleLabel: primaryRole.label,
    period,
    confidence,
    profileId,
    profileName: profile ? (profile.officialName || profile.shortName) : null,
    candidateProfileId,
    candidateProfileName: candidateProfileId ? (profile?.officialName || profile?.shortName || null) : null,
    links,
    reason,
  };
}

/** Construye el plan completo de conciliación (sin escribir nada). */
export function buildReconciliationPlan(contacts = [], directory = {}) {
  const items = contacts.map((contact) => matchContactInstitutionally(contact, directory));
  const summary = {
    contactsProcessed: items.length,
    contactsWithClubData: items.filter((i) => i.rawClubName).length,
    confirmedContacts: items.filter((i) => i.status === 'confirmed').length,
    ambiguousContacts: items.filter((i) => i.status === 'ambiguous').length,
    pendingContacts: items.filter((i) => i.status === 'pending').length,
    unlinkedContacts: items.filter((i) => i.status === 'unlinked').length,
    linksPlanned: items.reduce((acc, i) => acc + i.links.length, 0),
  };

  const byDistrict = {};
  const byRole = {};
  const unmatched = new Map();

  for (const item of items) {
    if (item.districtNumber) {
      byDistrict[item.districtNumber] = (byDistrict[item.districtNumber] || 0) + 1;
    }
    byRole[item.roleLabel] = (byRole[item.roleLabel] || 0) + 1;
    if (item.rawClubName && item.status !== 'confirmed') {
      const key = `${normalizeInstitutionalName(item.rawClubName)}|${item.districtNumber || ''}`;
      const current = unmatched.get(key) || {
        rawClubName: item.rawClubName,
        districtNumber: item.districtNumber,
        candidateName: item.candidateProfileName || null,
        count: 0,
        statuses: {},
      };
      current.count++;
      current.statuses[item.status] = (current.statuses[item.status] || 0) + 1;
      unmatched.set(key, current);
    }
  }

  summary.byDistrict = byDistrict;
  summary.byRole = byRole;
  summary.unmatchedClubs = [...unmatched.values()].sort((a, b) => b.count - a.count);

  return { summary, items };
}

export default {
  ROLE_CATALOG,
  ROLE_KEYS,
  normalizeInstitutionalName,
  organizationTypeFromName,
  cleanRawClubName,
  districtFromCatalog,
  districtFromText,
  inferRoles,
  inferPeriod,
  scoreProfile,
  rankClubCandidates,
  matchContactInstitutionally,
  buildReconciliationPlan,
  roleLabel,
};
