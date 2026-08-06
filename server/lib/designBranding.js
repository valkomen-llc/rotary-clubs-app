// ════════════════════════════════════════════════════════════════════
// Plantillas IA — motor de identidad visual
// v4.720.0
//
// Resuelve un club a la identidad con la que se pinta su pieza: nombre oficial,
// ciudad, distrito, logotipo, colores y el contexto real que alimenta a la IA.
//
// ── LA FECHA DE FUNDACIÓN NO ESTÁ EN `Club`, Y NO SE DEDUCE ─────────
//
// `Club.createdAt` es cuándo se creó el SITIO en la plataforma, no cuándo se
// fundó el club. Usarlo para calcular los años daría «¡Felices 1 años!» a un
// club de 1974 — un error que además sale firmado por el Gobernador. No hay
// columna de fundación en el modelo y no se agrega una: una columna nueva en
// `schema.prisma` que todavía no exista en la base rompe con 500 todo lo que
// consulte esa tabla desde el primer despliegue hasta que alguien la cree
// (v4.699, `logo_intl`).
//
// La fecha vive en `Setting` con la llave `club_foundation_date`, que es donde
// ya viven los logos de Rotaract/Interact y el tamaño del encabezado. Si no
// está, el módulo NO adivina: pide el dato en la pantalla y lo guarda ahí para
// la próxima. Un hueco es la verdad; un número inventado es una afirmación.
// ════════════════════════════════════════════════════════════════════

import db from '../lib/db.js';
// El criterio de fechas vive en `designSpec.js`, con el resto de lo puro: acá
// se usa, no se decide. Se re-exporta para que quien ya importaba desde este
// archivo no tenga que cambiar.
import { PALETTE, parseFoundation, yearsSince, rotaryPeriod } from './designSpec.js';

export { parseFoundation, yearsSince, rotaryPeriod };

export const FOUNDATION_SETTING = 'club_foundation_date';

// ─── Buscador de clubes ────────────────────────────────────────────────
//
// Busca por nombre, ciudad y distrito a la vez, que es como la gente busca
// («Pasto», «4281», «San Fernando»). El término se pasa como PARÁMETRO, nunca
// interpolado: esto lo escribe un usuario.
export const searchClubs = async ({ term = '', limit = 20, districtId = null } = {}) => {
    const q = String(term || '').trim();
    const params = [`%${q}%`];
    let where = `(c.name ILIKE $1 OR COALESCE(c.city,'') ILIKE $1 OR COALESCE(c.district,'') ILIKE $1)`;
    if (districtId) { params.push(districtId); where += ` AND c."districtId" = $${params.length}`; }
    params.push(Math.min(50, Math.max(1, +limit || 20)));

    const { rows } = await db.query(
        `SELECT c.id, c.name, c.city, c.country, c.district, c.logo, c."avatarUrl",
                c.type, c.category, c."organizationType", c."districtId",
                d.name AS "districtName", d.number AS "districtNumber", d.governor, d.colors AS "districtColors"
           FROM "Club" c
           LEFT JOIN "District" d ON d.id = c."districtId"
          WHERE ${where}
          ORDER BY (c.name ILIKE $1) DESC, c.name ASC
          LIMIT $${params.length}`,
        params
    );
    return rows.map(r => ({
        id: r.id, name: r.name, city: r.city, country: r.country,
        district: districtLabel(r), logo: r.logo || r.avatarUrl || null,
        type: r.type, category: r.category,
    }));
};

const districtLabel = (r) => {
    if (r?.districtNumber) return String(r.districtNumber);
    const raw = r?.district || r?.districtName || '';
    const m = String(raw).match(/\b(\d{4})\b/);
    return m ? m[1] : (raw || '');
};

// ─── Identidad de un club ──────────────────────────────────────────────
export const brandingForClub = async (clubId) => {
    const { rows } = await db.query(
        `SELECT c.*, d.name AS "districtName", d.number AS "districtNumber",
                d.governor, d.colors AS "districtColors", d.logo AS "districtLogo"
           FROM "Club" c LEFT JOIN "District" d ON d.id = c."districtId"
          WHERE c.id = $1`, [clubId]
    );
    const club = rows[0];
    if (!club) return null;

    const [settings, president, projects] = await Promise.all([
        db.query(`SELECT key, value FROM "Setting" WHERE "clubId" = $1 AND key = ANY($2)`,
            [clubId, [FOUNDATION_SETTING, 'primary_color', 'secondary_color']]),
        db.query(
            `SELECT name, "boardRole" FROM "ClubMember"
              WHERE "clubId" = $1 AND "isActive" = true AND "isBoard" = true
                AND "boardRole" ILIKE '%presidente%'
              ORDER BY position ASC LIMIT 1`, [clubId]).catch(() => ({ rows: [] })),
        db.query(
            `SELECT title FROM "Project" WHERE "clubId" = $1 ORDER BY "createdAt" DESC LIMIT 5`,
            [clubId]).catch(() => ({ rows: [] })),
    ]);

    const setting = Object.fromEntries(settings.rows.map(r => [r.key, r.value]));
    const colors = parseColors(club.districtColors);

    const foundation = parseFoundation(setting[FOUNDATION_SETTING]);

    return {
        clubId: club.id,
        clubName: club.name,
        entityKind: club.organizationType || 'Club Rotario',
        city: club.city || '',
        country: club.country || '',
        district: districtLabel(club),
        governor: club.governor || '',
        president: president.rows[0]?.name || '',
        period: rotaryPeriod(),
        logo: club.logo || club.avatarUrl || null,
        districtLogo: club.districtLogo || null,
        // Los colores del club se OFRECEN, no se imponen: la plantilla decide
        // qué nodos los adoptan (`brand: 'primary'`). Ver `applyBranding`.
        primary: setting.primary_color || colors.primary || PALETTE.royal,
        accent: setting.secondary_color || colors.secondary || PALETTE.gold,
        ink: PALETTE.ink,
        foundationDate: foundation.iso,
        foundedYear: foundation.year,
        years: foundation.year ? yearsSince(foundation.year) : null,
        projects: projects.rows.map(p => p.title).filter(Boolean),
    };
};

const parseColors = (raw) => {
    if (!raw) return {};
    try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return {}; }
};

export const saveFoundationDate = async (clubId, value) => {
    const parsed = parseFoundation(value);
    if (!parsed.year) throw new Error('Fecha de fundación no reconocida. Usá un año (1974) o una fecha (1974-08-04).');
    const stored = parsed.iso || String(parsed.year);
    await db.query(
        `INSERT INTO "Setting" (id, key, value, "clubId", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, NOW())
         ON CONFLICT (key, "clubId") DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()`,
        [FOUNDATION_SETTING, stored, clubId]
    );
    return { ...parsed, stored, years: yearsSince(parsed.year) };
};

export default { searchClubs, brandingForClub, saveFoundationDate, parseFoundation, yearsSince, rotaryPeriod, FOUNDATION_SETTING };
