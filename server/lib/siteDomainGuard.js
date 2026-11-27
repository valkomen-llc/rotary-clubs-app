// ════════════════════════════════════════════════════════════════════════════
// El dominio y el slug de un sitio — v4.1359.0
//
// Caso «Club Rotario Tuluá El Lago»: el club se creó con el dominio del
// Distrito (rotary4281.org) en «Dominio Propio». Como el sitio del Distrito se
// resuelve PRIMERO por ese dominio, el club nunca podía mostrarse ahí; pero el
// panel sí confiaba en el campo: «Abrir Sitio» llevaba a la página del
// Distrito y Analíticas medía el tráfico del Distrito como si fuera del club.
// Nada impedía guardar un dominio que ya es de otro sitio.
//
//   · findDomainConflict: ¿ese dominio ya pertenece a OTRO club o a un
//     Distrito? (La única excepción: el sitio-club del propio Distrito, que
//     comparte su dominio a propósito.)
//   · slugFromName / uniqueSlug: el slug (subdominio) del club a partir de su
//     nombre, si se creó sin él —«Club Rotario Tuluá El Lago» → «tulua-el-lago»—,
//     para que «Abrir Sitio» tenga a dónde ir: app.clubplatform.org/?club=…
// ════════════════════════════════════════════════════════════════════════════
import { canonicalDomain, domainCandidates } from './domains.js';

const PREFIXES = /^(club\s+rotario|rotary\s+club(\s+de|\s+of)?|club\s+rotaract|rotaract\s+club|c\s*\.?\s*r\s*\.?)\s+/i;

/** «Club Rotario Tuluá El Lago» → «tulua-el-lago» (sin tildes, sin «Club Rotario»). */
export const slugFromName = (name) => {
    const base = String(name || '').trim().replace(PREFIXES, '');
    return base.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/g, '');
};

/** El primer slug libre: «tulua-el-lago», «tulua-el-lago-2», … */
export const uniqueSlug = async (q, name, { excludeId = null } = {}) => {
    const base = slugFromName(name);
    if (!base) return null;
    for (let i = 1; i < 50; i++) {
        const candidate = i === 1 ? base : `${base}-${i}`;
        const { rows } = await q.query(
            `SELECT 1 FROM "Club" WHERE lower(subdomain) = $1 AND ($2::text IS NULL OR id <> $2)
             UNION ALL SELECT 1 FROM "District" WHERE lower(subdomain) = $1 LIMIT 1`,
            [candidate, excludeId]);
        if (!rows.length) return candidate;
    }
    return null;
};

/** ¿Este club es el sitio del Distrito dueño del dominio? (lo único que puede compartirlo). */
export const isDistrictSiteOf = (club, district) => {
    if (!club || !district) return false;
    const isDistrictSite = club.type === 'district' || club.category === 'district';
    if (!isDistrictSite) return false;
    return (club.districtId && club.districtId === district.id)
        || (club.district != null && district.number != null && String(club.district).replace(/\D/g, '') === String(district.number));
};

/**
 * ¿El dominio ya pertenece a OTRO sitio? Devuelve null o
 * { kind: 'club' | 'district', id, name, domain }.
 *
 * @param q     db (o un cliente de transacción)
 * @param club  el club que se guarda ({ id, type, category, districtId, district }); id null al crear
 */
export const findDomainConflict = async (q, domain, club = {}) => {
    const clean = canonicalDomain(domain);
    if (!clean) return null;
    const candidates = domainCandidates(clean).map(d => d.toLowerCase());
    const otherClub = await q.query(
        `SELECT id, name, domain FROM "Club" WHERE lower(domain) = ANY($1::text[]) AND ($2::text IS NULL OR id <> $2) LIMIT 1`,
        [candidates, club.id || null]).catch(() => ({ rows: [] }));
    if (otherClub.rows[0]) return { kind: 'club', ...otherClub.rows[0] };
    const district = await q.query(
        `SELECT id, name, number, domain FROM "District" WHERE lower(domain) = ANY($1::text[]) LIMIT 1`,
        [candidates]).catch(() => ({ rows: [] }));
    const d = district.rows[0];
    if (d && !isDistrictSiteOf(club, d)) return { kind: 'district', id: d.id, name: d.name || `Distrito ${d.number}`, domain: d.domain };
    return null;
};

export const domainConflictMessage = (domain, conflict) =>
    `El dominio ${canonicalDomain(domain)} ya pertenece a ${conflict.kind === 'district' ? 'el sitio del' : 'otro sitio:'} ${conflict.name}. `
    + 'Un club no puede usar el dominio de otro sitio: «Abrir Sitio» y Analíticas mostrarían ese otro sitio. '
    + 'Déjalo vacío para usar su dirección app.clubplatform.org/?club=<slug>, o escribe el dominio propio del club.';

/**
 * v4.1360 — El dominio que de verdad es de este club, o null.
 *
 * Un club común con el dominio de un Distrito (o de otro club) NO lo usa:
 * ni «Abrir Sitio», ni Analíticas, ni la resolución pública. Así el caso
 * Tuluá El Lago se corrige al leer, aunque la fila siga mal guardada.
 */
export const ownDomainOf = async (q, club) => {
    if (!club?.domain) return null;
    const clean = canonicalDomain(club.domain);
    // El sitio del Distrito dueño del dominio lo conserva aunque un club
    // intruso lo tenga copiado.
    const owner = await q.query(`SELECT id, number FROM "District" WHERE lower(domain) = ANY($1::text[]) LIMIT 1`,
        [domainCandidates(clean).map(d => d.toLowerCase())]).catch(() => ({ rows: [] }));
    if (owner.rows[0]) return isDistrictSiteOf(club, owner.rows[0]) ? clean : null;
    const conflict = await findDomainConflict(q, club.domain, club);
    return conflict ? null : canonicalDomain(club.domain);
};

/** El parámetro de la dirección de plataforma según el tipo de sitio. */
export const siteParamKey = (club) => (
    club?.type === 'association' || club?.type === 'Programa de Intercambio' ? 'asociacion'
        : (club?.type === 'district' ? 'distrito' : 'club'));

/** La dirección pública del sitio: su dominio propio o app.clubplatform.org/?club=<slug>. */
export const siteUrlOf = ({ club, ownDomain, slug }) => {
    if (ownDomain && !/clubplatform\.org$|localhost/.test(ownDomain)) return `https://${ownDomain}`;
    if (slug) return `https://app.clubplatform.org/?${siteParamKey(club)}=${encodeURIComponent(slug)}`;
    return null;
};

/** Los dominios de los Distritos (para no medir ni abrir el de otro sitio). */
export const districtDomainsOf = async (q) => {
    const { rows } = await q.query(`SELECT id, number, domain FROM "District" WHERE COALESCE(domain, '') <> ''`).catch(() => ({ rows: [] }));
    return rows.map(r => ({ ...r, clean: canonicalDomain(r.domain) })).filter(r => r.clean);
};

/** ¿El dominio de este club (común) es el de un Distrito? Puro, con la lista ya leída. */
export const isForeignDistrictDomain = (club, districts = []) => {
    const clean = canonicalDomain(club?.domain);
    if (!clean) return false;
    const d = districts.find(x => x.clean === clean);
    return !!d && !isDistrictSiteOf(club, d);
};

export default {
    slugFromName, uniqueSlug, isDistrictSiteOf, findDomainConflict, domainConflictMessage,
    ownDomainOf, siteParamKey, siteUrlOf, districtDomainsOf, isForeignDistrictDomain,
};
