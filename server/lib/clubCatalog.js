// ════════════════════════════════════════════════════════════════════
// Catálogo Maestro de Clubes — la base — v4.1269.0
//
// La fuente ÚNICA de clubes de la plataforma. Es la tabla del Directorio de
// Clubes (`DistrictClubProfile`), ampliada; no una tabla nueva. Lo que hace:
//
//   1. Amplía `DistrictClubProfile` con las columnas del catálogo (estado,
//      ID de Rotary International, tipo, alias, notas, fusión) y crea
//      `ClubCatalogChange`, la bitácora de cambios (quién, cuándo, qué campo,
//      de qué valor a cuál). Las dos están en el guardián de `db:push`.
//   2. RECONCILIA una sola vez la lista estática de `rotaryClubs.js` con la
//      base: los clubes que la lista tenía y el Directorio no (y todo el
//      Distrito 4271, que el Directorio nunca sembró) entran al catálogo. Así
//      nadie pierde un club que veía ayer en un formulario.
//   3. Mantiene el catálogo VIVO en memoria (`applyClubCatalogSnapshot`) para
//      que los módulos que leen `rotaryClubs.js` de forma síncrona —eventos,
//      postulación, Rotary en Acción, Plantillas IA, Aniversarios, CRM— vean lo
//      que el administrador guardó, sin tocar cada módulo.
//
// ── LA CACHÉ ─────────────────────────────────────────────────────────
// Por instancia, 60 s. La PRIMERA petición de una instancia espera la carga
// (con tope de 2,5 s: si la base no contesta, sigue la semilla y la lista no
// se queda vacía); las siguientes recargan DETRÁS, sin esperar. Guardar en el
// catálogo invalida y recarga la instancia que guardó en el acto; las demás
// instancias lo ven en ≤ 60 s.
// ════════════════════════════════════════════════════════════════════
import db from './db.js';
import { ensureDistrictClubDirectorySchema, slugifyClub } from './ensureDistrictClubDirectorySchema.js';
import { SEED_CLUBS_BY_DISTRICT, applyClubCatalogSnapshot, clubCatalogState } from './rotaryClubs.js';
import { withDeadline } from './resilience.js';
import {
    shapeClubInput, validateClubInput, diffClub, aliasesAfterRename, coreName, namesOf,
    findDuplicateCandidates, classifyImportRows, missingFromSource, catalogScopeAllows,
    summarizeCatalog, deriveOfficialName, DEFAULT_CATALOG_STATE, AUDITED_FIELDS, missingFields,
    publicClubShape, searchCatalog,
} from './clubCatalogSpec.js';

export const SEED_SOURCE_TAG = 'rotaryClubs.js v4.707';
const DISTRICT_IDS = { 4281: 'cb9fa007-a1aa-4555-94bb-23df5ef9d474' };

// ⚠️ TODO `ADD COLUMN` VA ENUMERADO ACÁ (la trampa de v4.908): el atajo mira
// estas columnas; un ALTER que no esté en la lista no correría NUNCA en
// producción. Lo fija `scripts/test-club-catalog.mjs`.
export const OWNED_COLUMNS = {
    DistrictClubProfile: [
        'rotaryInternationalId', 'catalogStatus', 'clubType', 'adminNotes', 'aliases',
        'catalogUpdatedBy', 'catalogUpdatedAt', 'catalogVerifiedAt', 'mergedIntoId',
        'notDuplicateOf', 'catalogSource',
    ],
    ClubCatalogChange: [],
};

let _ready = false;

export async function ensureClubCatalogSchema() {
    if (_ready) return;
    await ensureDistrictClubDirectorySchema();
    const esperadas = OWNED_COLUMNS.DistrictClubProfile;
    const { rows } = await db.query(
        `SELECT to_regclass('public."ClubCatalogChange"') IS NOT NULL AS t,
                (SELECT COUNT(*) FROM information_schema.columns
                  WHERE table_name = 'DistrictClubProfile' AND column_name = ANY($1))::int AS columnas`,
        [esperadas]
    );
    if (!(rows[0]?.t && rows[0]?.columnas === esperadas.length)) {
        await db.query(`ALTER TABLE "DistrictClubProfile" ADD COLUMN IF NOT EXISTS "rotaryInternationalId" TEXT`);
        await db.query(`ALTER TABLE "DistrictClubProfile" ADD COLUMN IF NOT EXISTS "catalogStatus" TEXT NOT NULL DEFAULT 'activo'`);
        await db.query(`ALTER TABLE "DistrictClubProfile" ADD COLUMN IF NOT EXISTS "clubType" TEXT`);
        await db.query(`ALTER TABLE "DistrictClubProfile" ADD COLUMN IF NOT EXISTS "adminNotes" TEXT`);
        await db.query(`ALTER TABLE "DistrictClubProfile" ADD COLUMN IF NOT EXISTS aliases JSONB NOT NULL DEFAULT '[]'::jsonb`);
        await db.query(`ALTER TABLE "DistrictClubProfile" ADD COLUMN IF NOT EXISTS "catalogUpdatedBy" TEXT`);
        await db.query(`ALTER TABLE "DistrictClubProfile" ADD COLUMN IF NOT EXISTS "catalogUpdatedAt" TIMESTAMPTZ`);
        await db.query(`ALTER TABLE "DistrictClubProfile" ADD COLUMN IF NOT EXISTS "catalogVerifiedAt" TIMESTAMPTZ`);
        await db.query(`ALTER TABLE "DistrictClubProfile" ADD COLUMN IF NOT EXISTS "mergedIntoId" TEXT`);
        await db.query(`ALTER TABLE "DistrictClubProfile" ADD COLUMN IF NOT EXISTS "notDuplicateOf" JSONB NOT NULL DEFAULT '[]'::jsonb`);
        await db.query(`ALTER TABLE "DistrictClubProfile" ADD COLUMN IF NOT EXISTS "catalogSource" TEXT`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_dcp_catalog ON "DistrictClubProfile"("districtNumber", "organizationType", "catalogStatus")`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_dcp_riid ON "DistrictClubProfile"("rotaryInternationalId")`);

        // La bitácora. Sólo crece: ninguna ruta la edita ni la borra.
        await db.query(`CREATE TABLE IF NOT EXISTS "ClubCatalogChange" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "clubProfileId" TEXT,
            action TEXT NOT NULL,
            changes JSONB NOT NULL DEFAULT '[]'::jsonb,
            reason TEXT,
            "actorId" TEXT,
            "actorName" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_ccc_club ON "ClubCatalogChange"("clubProfileId", "createdAt" DESC)`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_ccc_action ON "ClubCatalogChange"(action)`);
    }
    await reconcileSeedOnce();
    _ready = true;
}

/**
 * Una sola vez por base: lo que la lista estática tenía y el catálogo no.
 *
 * Un club del Directorio se reconoce por su nombre (oficial, corto o alias)
 * dentro de su distrito. Lo que entra lleva `catalogSource` = la semilla y
 * queda ACTIVO —es la lista que entregó el Distrito, la misma que los
 * formularios ofrecían ayer—. Los del 4271 entran con la ficha del Directorio
 * en BORRADOR: existen para los formularios, pero el Directorio público del
 * 4281 no se llena de fichas vacías de otro distrito.
 *
 * La marca de «ya se hizo» es la propia bitácora (`action = 'seed_reconcile'`):
 * si un administrador inactiva o renombra después, un despliegue no lo deshace.
 */
async function reconcileSeedOnce() {
    const { rows: hecho } = await db.query(`SELECT 1 FROM "ClubCatalogChange" WHERE action = 'seed_reconcile' LIMIT 1`);
    if (hecho.length) return;
    const { rows: existentes } = await db.query(
        `SELECT id, "districtNumber", "officialName", "shortName", aliases, "organizationType" FROM "DistrictClubProfile"`
    );
    const conocidos = new Set(existentes
        .filter(e => (e.organizationType || 'rotary') === 'rotary')
        .flatMap(e => namesOf(e).map(n => `${e.districtNumber}|${n}`)));
    const agregados = [];
    for (const [num, clubs] of Object.entries(SEED_CLUBS_BY_DISTRICT)) {
        const n = Number(num);
        for (const shortName of clubs) {
            if (conocidos.has(`${n}|${coreName(shortName)}`)) continue;
            const officialName = deriveOfficialName(shortName);
            const { rows } = await db.query(
                `INSERT INTO "DistrictClubProfile" ("districtId", "districtNumber", "organizationType", "officialName", "shortName", slug,
                        country, status, "catalogStatus", "catalogSource", "catalogUpdatedAt", "catalogUpdatedBy")
                 VALUES ($1, $2, 'rotary', $3, $4, $5, 'Colombia', $6, 'activo', $7, NOW(), 'Reconciliación automática')
                 RETURNING id`,
                [DISTRICT_IDS[n] || null, n, officialName, shortName, slugifyClub(shortName), n === 4281 ? 'published' : 'draft', SEED_SOURCE_TAG]
            );
            agregados.push({ id: rows[0].id, districtNumber: n, officialName });
            conocidos.add(`${n}|${coreName(shortName)}`);
        }
    }
    await db.query(
        `INSERT INTO "ClubCatalogChange" (action, changes, reason, "actorName") VALUES ('seed_reconcile', $1::jsonb, $2, 'Sistema')`,
        [JSON.stringify(agregados), `Reconciliación de la lista estática (${SEED_SOURCE_TAG}) con el Directorio: ${agregados.length} clubes incorporados.`]
    );
    if (agregados.length) console.log(`[club-catalog] Reconciliación: ${agregados.length} clubes de la lista estática incorporados al Catálogo Maestro.`);
}

// ─── El catálogo vivo ─────────────────────────────────────────────────
const TTL_MS = 60_000;
const FIRST_LOAD_BUDGET_MS = 2_500;
let _loadedAt = 0;
let _inflight = null;

const CATALOG_COLUMNS = `id, "districtNumber", "organizationType", "officialName", "shortName", slug, city, state, country,
    "clubType", "rotaryInternationalId", "contactEmail", "websiteUrl", "catalogStatus", "adminNotes", aliases,
    "mergedIntoId", "notDuplicateOf", "catalogSource", "catalogUpdatedAt", "catalogUpdatedBy", "catalogVerifiedAt",
    status, "clubId", "updatedAt", "createdAt"`;

const normRow = (r) => ({
    ...r,
    districtNumber: Number(r.districtNumber) || null,
    catalogStatus: r.catalogStatus || DEFAULT_CATALOG_STATE,
    aliases: Array.isArray(r.aliases) ? r.aliases : [],
    notDuplicateOf: Array.isArray(r.notDuplicateOf) ? r.notDuplicateOf : [],
});

/** Arma el snapshot que consume `rotaryClubs.js`: sólo Rotary, sin fusionados. */
export function buildSnapshot(rows) {
    const districts = {};
    for (const r of rows) {
        if ((r.organizationType || 'rotary') !== 'rotary' || r.mergedIntoId || r.status === 'archived') continue;
        const n = Number(r.districtNumber);
        if (!n) continue;
        const d = districts[n] || (districts[n] = { active: [], known: [] });
        const status = r.catalogStatus || 'activo';
        if (status === 'activo') d.active.push(r.shortName || r.officialName);
        d.known.push({ id: r.id, name: r.shortName || r.officialName, status, names: [r.officialName, ...(r.aliases || [])] });
    }
    // Los fusionados reconocen su nombre como el del club que los absorbió.
    const porId = new Map(rows.map(r => [r.id, r]));
    for (const r of rows) {
        if (!r.mergedIntoId) continue;
        const destino = porId.get(r.mergedIntoId);
        if (!destino) continue;
        const d = districts[Number(destino.districtNumber)];
        const k = d?.known.find(x => x.id === destino.id);
        if (k) k.names.push(r.officialName, r.shortName, ...(r.aliases || []));
    }
    return { districts };
}

async function loadCatalog() {
    await ensureClubCatalogSchema();
    const { rows } = await db.query(`SELECT ${CATALOG_COLUMNS} FROM "DistrictClubProfile"`);
    applyClubCatalogSnapshot(buildSnapshot(rows.map(normRow)));
    _loadedAt = Date.now();
}

/** Recarga el catálogo vivo. `force` ignora la caché. Nunca lanza. */
export async function refreshClubCatalog({ force = false } = {}) {
    if (!force && Date.now() - _loadedAt < TTL_MS) return clubCatalogState();
    if (!_inflight) {
        _inflight = loadCatalog()
            .catch(e => { console.error('[club-catalog] No se pudo cargar el catálogo; sigue la última lista conocida:', e?.message || e); })
            .finally(() => { _inflight = null; });
    }
    await _inflight;
    return clubCatalogState();
}

export const invalidateClubCatalog = () => { _loadedAt = 0; return refreshClubCatalog({ force: true }); };

/**
 * Middleware: garantiza que el catálogo vivo esté cargado antes de que el
 * controlador lea `rotaryClubs.js`. Sólo la primera petición de la instancia
 * espera (con tope); después recarga detrás sin retener a nadie.
 */
export const clubCatalogFresh = async (req, res, next) => {
    try {
        if (!_loadedAt) await withDeadline(refreshClubCatalog(), FIRST_LOAD_BUDGET_MS, 'catálogo de clubes').catch(() => {});
        else if (Date.now() - _loadedAt >= TTL_MS) refreshClubCatalog().catch(() => {});
    } catch { /* la semilla responde */ }
    next();
};

/** Igual, pero NUNCA espera: para routers donde una carga fría no puede retener la respuesta (CRM, webhooks). */
export const clubCatalogWarm = (req, res, next) => {
    if (!_loadedAt || Date.now() - _loadedAt >= TTL_MS) refreshClubCatalog().catch(() => {});
    next();
};

// ─── Consultas ────────────────────────────────────────────────────────
export async function allCatalogRows() {
    await ensureClubCatalogSchema();
    const { rows } = await db.query(`SELECT ${CATALOG_COLUMNS} FROM "DistrictClubProfile" ORDER BY "districtNumber", "officialName"`);
    return rows.map(normRow);
}

/**
 * Lo que se le ofrece a un formulario: clubes ACTIVOS (por defecto Rotary)
 * de los distritos pedidos. `includeInactive` es para la administración.
 */
export async function catalogForForms({ districts = [], organizationType = 'rotary', includeInactive = false } = {}) {
    const rows = await allCatalogRows();
    const ds = districts.map(Number).filter(Boolean);
    return rows
        .filter(r => !r.mergedIntoId && r.status !== 'archived')
        .filter(r => !organizationType || (r.organizationType || 'rotary') === organizationType)
        .filter(r => !ds.length || ds.includes(Number(r.districtNumber)))
        .filter(r => includeInactive || r.catalogStatus === 'activo');
}

export async function searchForForms({ q = '', districts = [], limit = 20, organizationType = 'rotary' } = {}) {
    const lista = await catalogForForms({ districts, organizationType });
    return searchCatalog(lista, q, limit).map(publicClubShape);
}

export async function catalogDistricts() {
    await ensureClubCatalogSchema();
    const { rows } = await db.query(
        `SELECT "districtNumber" AS n, COUNT(*) FILTER (WHERE "catalogStatus" = 'activo' AND "mergedIntoId" IS NULL AND COALESCE(status,'') <> 'archived')::int AS activos
           FROM "DistrictClubProfile" WHERE "organizationType" = 'rotary' AND "districtNumber" IS NOT NULL
          GROUP BY 1 ORDER BY 1`
    );
    return rows.map(r => ({ number: Number(r.n), label: `Distrito ${r.n}`, active: r.activos }));
}

export async function clubRow(id) {
    await ensureClubCatalogSchema();
    const { rows } = await db.query(`SELECT ${CATALOG_COLUMNS} FROM "DistrictClubProfile" WHERE id = $1`, [String(id || '')]);
    return rows[0] ? normRow(rows[0]) : null;
}

/** Un club por su id, siguiendo la fusión: si se marcó como duplicado, devuelve el que lo absorbió. */
export async function resolveClubId(id) {
    let c = await clubRow(id);
    for (let i = 0; c?.mergedIntoId && i < 5; i++) c = await clubRow(c.mergedIntoId);
    return c;
}

export async function clubHistory(id, limit = 100) {
    await ensureClubCatalogSchema();
    const { rows } = await db.query(
        `SELECT id, action, changes, reason, "actorId", "actorName", "createdAt"
           FROM "ClubCatalogChange" WHERE "clubProfileId" = $1 ORDER BY "createdAt" DESC LIMIT $2`,
        [String(id), Math.min(500, Number(limit) || 100)]
    );
    return rows;
}

export async function recentChanges(limit = 50, districts = null) {
    await ensureClubCatalogSchema();
    const { rows } = await db.query(
        `SELECT c.id, c."clubProfileId", c.action, c.changes, c.reason, c."actorName", c."createdAt",
                p."officialName", p."districtNumber"
           FROM "ClubCatalogChange" c LEFT JOIN "DistrictClubProfile" p ON p.id = c."clubProfileId"
          WHERE ($2::int[] IS NULL OR p."districtNumber" = ANY($2::int[]) OR c."clubProfileId" IS NULL)
          ORDER BY c."createdAt" DESC LIMIT $1`,
        [Math.min(200, Number(limit) || 50), districts]
    );
    return rows;
}

const logChange = (client, { clubProfileId, action, changes = [], reason = null, actor = {} }) => client.query(
    `INSERT INTO "ClubCatalogChange" ("clubProfileId", action, changes, reason, "actorId", "actorName") VALUES ($1, $2, $3::jsonb, $4, $5, $6)`,
    [clubProfileId, action, JSON.stringify(changes), reason ? String(reason).slice(0, 1000) : null, actor.id || null, actor.name || null]
);

// ─── Escritura ────────────────────────────────────────────────────────
// Cada función recibe el ALCANCE del administrador (`{ all }` o
// `{ districts }`) y lo comprueba contra el distrito de la fila —el de antes
// y el de después—: mover un club a un distrito ajeno también está prohibido.

class CatalogError extends Error {
    constructor(message, status = 400, extra = {}) { super(message); this.status = status; Object.assign(this, extra); }
}
export { CatalogError };

async function withTx(fn) {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const out = await fn(client);
        await client.query('COMMIT');
        return out;
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
    } finally {
        client.release();
    }
}

/** Un club con el mismo nombre (o alias) en el mismo distrito, o el mismo ID oficial. */
async function conflictFor(c, exceptId = null) {
    const rows = await allCatalogRows();
    const nombres = namesOf(c);
    return rows.find(r => r.id !== exceptId && !r.mergedIntoId && (
        (c.rotaryInternationalId && r.rotaryInternationalId === c.rotaryInternationalId)
        || (Number(r.districtNumber) === Number(c.districtNumber)
            && (r.organizationType || 'rotary') === c.organizationType
            && namesOf(r).some(n => nombres.includes(n)))
    )) || null;
}

export async function createClub(body, { scope, actor, source = 'administracion', refresh = true } = {}) {
    await ensureClubCatalogSchema();
    const c = shapeClubInput(body);
    const v = validateClubInput(c);
    if (!v.ok) throw new CatalogError(v.errors[0].message, 400, { errors: v.errors });
    if (!catalogScopeAllows(scope, c.districtNumber)) throw new CatalogError(`No tienes permiso para administrar clubes del Distrito ${c.districtNumber}.`, 403);
    const dup = await conflictFor(c);
    if (dup) throw new CatalogError(`Ya existe «${dup.officialName}» en el Distrito ${dup.districtNumber}. Edita ese registro en lugar de crear otro.`, 409, { existingId: dup.id });

    const status = c.catalogStatus || DEFAULT_CATALOG_STATE;
    const row = await withTx(async (client) => {
        const { rows } = await client.query(
            `INSERT INTO "DistrictClubProfile" ("districtId", "districtNumber", "organizationType", "officialName", "shortName", slug,
                    city, state, country, "contactEmail", "websiteUrl", "rotaryInternationalId", "clubType", "adminNotes", aliases,
                    status, "catalogStatus", "catalogSource", "catalogUpdatedAt", "catalogUpdatedBy", "catalogVerifiedAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,'draft',$16,$17,NOW(),$18, CASE WHEN $16 = 'activo' THEN NOW() ELSE NULL END)
             RETURNING id`,
            [DISTRICT_IDS[c.districtNumber] || null, c.districtNumber, c.organizationType, c.officialName, c.shortName, slugifyClub(c.shortName),
                c.city || null, c.state || null, c.country || 'Colombia', c.contactEmail || null, c.websiteUrl || null, c.rotaryInternationalId || null,
                c.clubType || null, c.adminNotes || null, JSON.stringify(c.aliases || []), status, source, actor?.name || null]
        );
        await logChange(client, {
            clubProfileId: rows[0].id, action: 'create', actor,
            changes: diffClub({}, { ...c, catalogStatus: status }).filter(x => x.to !== '' && x.to !== null),
            reason: body?.reason || null,
        });
        return rows[0];
    });
    if (refresh) await invalidateClubCatalog();
    return clubRow(row.id);
}

export async function updateClub(id, body, { scope, actor, refresh = true } = {}) {
    await ensureClubCatalogSchema();
    const antes = await clubRow(id);
    if (!antes) throw new CatalogError('El club no existe en el catálogo.', 404);
    if (!catalogScopeAllows(scope, antes.districtNumber)) throw new CatalogError(`No tienes permiso para administrar clubes del Distrito ${antes.districtNumber}.`, 403);
    const c = shapeClubInput({ ...antes, ...body, aliases: Array.isArray(body?.aliases) ? body.aliases : antes.aliases });
    if (!body?.shortName && body?.officialName && body.officialName !== antes.officialName) c.shortName = shapeClubInput({ officialName: body.officialName }).shortName;
    const v = validateClubInput(c);
    if (!v.ok) throw new CatalogError(v.errors[0].message, 400, { errors: v.errors });
    if (!catalogScopeAllows(scope, c.districtNumber)) throw new CatalogError(`No tienes permiso para mover el club al Distrito ${c.districtNumber}.`, 403);
    const dup = await conflictFor(c, antes.id);
    if (dup) throw new CatalogError(`Ese nombre ya lo tiene «${dup.officialName}» (Distrito ${dup.districtNumber}).`, 409, { existingId: dup.id });

    // Renombrar conserva el nombre anterior como alias: los registros que lo
    // guardaron como texto siguen resolviendo a este club.
    c.aliases = aliasesAfterRename(antes, c);
    c.catalogStatus = c.catalogStatus || antes.catalogStatus;
    const changes = diffClub(antes, c, AUDITED_FIELDS.filter(f => f !== 'mergedIntoId'));
    if (!changes.length) return antes;

    await withTx(async (client) => {
        await client.query(
            `UPDATE "DistrictClubProfile" SET
                "officialName" = $2, "shortName" = $3, "organizationType" = $4, "districtNumber" = $5, city = $6, state = $7, country = $8,
                "contactEmail" = $9, "websiteUrl" = $10, "rotaryInternationalId" = $11, "clubType" = $12, "adminNotes" = $13,
                aliases = $14::jsonb, "catalogStatus" = $15, "catalogUpdatedAt" = NOW(), "catalogUpdatedBy" = $16,
                "catalogVerifiedAt" = CASE WHEN $15 = 'activo' AND "catalogStatus" <> 'activo' THEN NOW() ELSE "catalogVerifiedAt" END,
                "updatedAt" = NOW()
              WHERE id = $1`,
            [antes.id, c.officialName, c.shortName, c.organizationType, c.districtNumber, c.city || null, c.state || null, c.country || null,
                c.contactEmail || null, c.websiteUrl || null, c.rotaryInternationalId || null, c.clubType || null, c.adminNotes || null,
                JSON.stringify(c.aliases), c.catalogStatus, actor?.name || null]
        );
        const soloEstado = changes.length === 1 && changes[0].field === 'catalogStatus';
        await logChange(client, { clubProfileId: antes.id, action: soloEstado ? 'status' : 'update', changes, actor, reason: body?.reason || null });
    });
    if (refresh) await invalidateClubCatalog();
    return clubRow(antes.id);
}

/** Cambiar el estado nunca borra nada: sólo decide si el club se ofrece en formularios nuevos. */
export const setClubStatus = (id, catalogStatus, { scope, actor, reason } = {}) =>
    updateClub(id, { catalogStatus, reason }, { scope, actor });

// ─── Duplicados ───────────────────────────────────────────────────────
export async function duplicateCandidates({ districts = null } = {}) {
    const rows = await allCatalogRows();
    const ds = Array.isArray(districts) ? districts.map(Number) : null;
    const universo = ds ? rows.filter(r => ds.includes(Number(r.districtNumber))) : rows;
    const porId = new Map(rows.map(r => [r.id, r]));
    const pick = (r) => r && ({ id: r.id, officialName: r.officialName, shortName: r.shortName, districtNumber: r.districtNumber, city: r.city, state: r.state, rotaryInternationalId: r.rotaryInternationalId, catalogStatus: r.catalogStatus, catalogSource: r.catalogSource });
    return findDuplicateCandidates(universo).map(p => ({ ...p, a: pick(porId.get(p.a)), b: pick(porId.get(p.b)) }));
}

/**
 * Marcar como duplicado: `duplicateId` queda INACTIVO y apuntando a
 * `keepId`, y sus nombres pasan a ser alias del que se conserva. NO se
 * reescribe ninguna referencia en otras tablas (visitas, inscripciones,
 * cuentas): siguen apuntando al id de siempre y se resuelven a través de
 * `mergedIntoId`. Por eso es REVERSIBLE con `unmergeClub`.
 */
export async function mergeClubs(duplicateId, keepId, { scope, actor, reason } = {}) {
    await ensureClubCatalogSchema();
    if (!duplicateId || !keepId || duplicateId === keepId) throw new CatalogError('Elige dos clubes distintos.');
    const dup = await clubRow(duplicateId);
    const keep = await clubRow(keepId);
    if (!dup || !keep) throw new CatalogError('Uno de los clubes no existe.', 404);
    if (keep.mergedIntoId) throw new CatalogError('El club que se conserva ya está marcado como duplicado de otro.');
    if (!catalogScopeAllows(scope, dup.districtNumber) || !catalogScopeAllows(scope, keep.districtNumber)) throw new CatalogError('No tienes permiso sobre alguno de los dos distritos.', 403);
    if (dup.rotaryInternationalId && keep.rotaryInternationalId && dup.rotaryInternationalId !== keep.rotaryInternationalId) {
        throw new CatalogError('Los dos clubes tienen IDs de Rotary International distintos: no son el mismo club.');
    }
    const nuevosAlias = [...new Set([...(keep.aliases || []), dup.officialName, dup.shortName, ...(dup.aliases || [])])]
        .filter(a => a && !namesOf(keep).slice(0, 2).includes(coreName(a)));
    await withTx(async (client) => {
        await client.query(
            `UPDATE "DistrictClubProfile" SET "mergedIntoId" = $2, "catalogStatus" = 'inactivo', "catalogUpdatedAt" = NOW(), "catalogUpdatedBy" = $3, "updatedAt" = NOW() WHERE id = $1`,
            [dup.id, keep.id, actor?.name || null]
        );
        await client.query(
            `UPDATE "DistrictClubProfile" SET aliases = $2::jsonb, "rotaryInternationalId" = COALESCE("rotaryInternationalId", $3),
                    "catalogUpdatedAt" = NOW(), "catalogUpdatedBy" = $4, "updatedAt" = NOW() WHERE id = $1`,
            [keep.id, JSON.stringify(nuevosAlias.slice(0, 30)), dup.rotaryInternationalId || null, actor?.name || null]
        );
        await logChange(client, { clubProfileId: dup.id, action: 'merge', actor, reason, changes: [
            { field: 'mergedIntoId', from: null, to: keep.id }, { field: 'catalogStatus', from: dup.catalogStatus, to: 'inactivo' },
        ] });
        await logChange(client, { clubProfileId: keep.id, action: 'absorb', actor, reason, changes: [
            { field: 'aliases', from: keep.aliases, to: nuevosAlias }, { field: 'absorbed', from: null, to: dup.id },
        ] });
    });
    await invalidateClubCatalog();
    return { duplicate: await clubRow(dup.id), kept: await clubRow(keep.id) };
}

/** Deshace una fusión: devuelve el estado y los alias que había antes de marcarla. */
export async function unmergeClub(duplicateId, { scope, actor, reason } = {}) {
    await ensureClubCatalogSchema();
    const dup = await clubRow(duplicateId);
    if (!dup?.mergedIntoId) throw new CatalogError('Ese club no está marcado como duplicado.');
    const keep = await clubRow(dup.mergedIntoId);
    if (!catalogScopeAllows(scope, dup.districtNumber) || (keep && !catalogScopeAllows(scope, keep.districtNumber))) throw new CatalogError('No tienes permiso sobre alguno de los dos distritos.', 403);
    const { rows: log } = await db.query(
        `SELECT changes FROM "ClubCatalogChange" WHERE "clubProfileId" = $1 AND action = 'merge' ORDER BY "createdAt" DESC LIMIT 1`, [dup.id]
    );
    const estadoAntes = (log[0]?.changes || []).find(x => x.field === 'catalogStatus')?.from || 'activo';
    const { rows: absorb } = keep ? await db.query(
        `SELECT changes FROM "ClubCatalogChange" WHERE "clubProfileId" = $1 AND action = 'absorb' AND changes @> $2::jsonb ORDER BY "createdAt" DESC LIMIT 1`,
        [keep.id, JSON.stringify([{ field: 'absorbed', to: dup.id }])]
    ) : { rows: [] };
    const aliasAntes = (absorb[0]?.changes || []).find(x => x.field === 'aliases')?.from;
    await withTx(async (client) => {
        await client.query(
            `UPDATE "DistrictClubProfile" SET "mergedIntoId" = NULL, "catalogStatus" = $2, "catalogUpdatedAt" = NOW(), "catalogUpdatedBy" = $3, "updatedAt" = NOW() WHERE id = $1`,
            [dup.id, estadoAntes, actor?.name || null]
        );
        if (keep && Array.isArray(aliasAntes)) {
            await client.query(`UPDATE "DistrictClubProfile" SET aliases = $2::jsonb, "catalogUpdatedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1`, [keep.id, JSON.stringify(aliasAntes)]);
        }
        await logChange(client, { clubProfileId: dup.id, action: 'unmerge', actor, reason, changes: [
            { field: 'mergedIntoId', from: keep?.id || dup.mergedIntoId, to: null }, { field: 'catalogStatus', from: 'inactivo', to: estadoAntes },
        ] });
    });
    await invalidateClubCatalog();
    return clubRow(dup.id);
}

/** «No son el mismo club»: el par deja de señalarse. */
export async function dismissDuplicate(aId, bId, { scope, actor, reason } = {}) {
    const a = await clubRow(aId); const b = await clubRow(bId);
    if (!a || !b) throw new CatalogError('Uno de los clubes no existe.', 404);
    if (!catalogScopeAllows(scope, a.districtNumber) && !catalogScopeAllows(scope, b.districtNumber)) throw new CatalogError('No tienes permiso sobre estos distritos.', 403);
    await withTx(async (client) => {
        await client.query(`UPDATE "DistrictClubProfile" SET "notDuplicateOf" = "notDuplicateOf" || $2::jsonb WHERE id = $1 AND NOT ("notDuplicateOf" @> $2::jsonb)`, [a.id, JSON.stringify([b.id])]);
        await client.query(`UPDATE "DistrictClubProfile" SET "notDuplicateOf" = "notDuplicateOf" || $2::jsonb WHERE id = $1 AND NOT ("notDuplicateOf" @> $2::jsonb)`, [b.id, JSON.stringify([a.id])]);
        await logChange(client, { clubProfileId: a.id, action: 'not_duplicate', actor, reason, changes: [{ field: 'notDuplicateOf', from: null, to: b.id }] });
    });
    return { ok: true };
}

// ─── Importación ──────────────────────────────────────────────────────
export async function previewImport(rows, { scope, defaultDistrict = null, compare = false } = {}) {
    if (!Array.isArray(rows) || !rows.length) throw new CatalogError('El archivo no trae filas.');
    if (rows.length > 2000) throw new CatalogError('Máximo 2.000 filas por importación.');
    const existing = await allCatalogRows();
    const classified = classifyImportRows(rows, existing, { defaultDistrict, scope });
    const distritos = [...new Set(classified.map(r => r.data?.districtNumber).filter(Boolean))];
    const resumen = classified.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
    return {
        rows: classified,
        summary: resumen,
        missingFromSource: compare ? missingFromSource(classified, existing, distritos) : [],
    };
}

/**
 * Incorpora las filas que la persona APROBÓ en la revisión (`rows` con su
 * número de fila). Re-clasifica en el servidor: lo que diga el navegador no
 * obliga. Los nuevos entran como `pendiente_verificacion` salvo que la fila
 * diga otro estado —«No importar registros sin verificar»—; las
 * actualizaciones SÓLO completan campos vacíos.
 */
export async function commitImport(rows, approvedRowNumbers, { scope, actor, defaultDistrict = null, sourceLabel = 'importacion' } = {}) {
    const preview = await previewImport(rows, { scope, defaultDistrict });
    const aprobadas = new Set((approvedRowNumbers || []).map(Number));
    const resultado = { created: [], updated: [], skipped: [] };
    for (const r of preview.rows) {
        if (!aprobadas.has(r.row)) continue;
        try {
            if (r.status === 'nuevo') {
                const c = await createClub({ ...r.data, catalogStatus: r.data.catalogStatus || 'pendiente_verificacion', reason: `Importación (${sourceLabel}), fila ${r.row}` }, { scope, actor, source: sourceLabel, refresh: false });
                resultado.created.push({ row: r.row, id: c.id, officialName: c.officialName });
            } else if (r.status === 'actualiza') {
                const patch = Object.fromEntries(r.changes.map(ch => [ch.field, ch.to]));
                const c = await updateClub(r.match.id, { ...patch, reason: `Importación (${sourceLabel}), fila ${r.row}` }, { scope, actor, refresh: false });
                resultado.updated.push({ row: r.row, id: c.id, officialName: c.officialName, fields: Object.keys(patch) });
            } else {
                resultado.skipped.push({ row: r.row, status: r.status });
            }
        } catch (e) {
            resultado.skipped.push({ row: r.row, status: 'error', error: e.message });
        }
    }
    await db.query(
        `INSERT INTO "ClubCatalogChange" (action, changes, reason, "actorId", "actorName") VALUES ('import', $1::jsonb, $2, $3, $4)`,
        [JSON.stringify({ created: resultado.created.length, updated: resultado.updated.length, skipped: resultado.skipped.length }),
            `Importación «${sourceLabel}»`, actor?.id || null, actor?.name || null]
    ).catch(() => {});
    await invalidateClubCatalog();
    return resultado;
}

/** Marca un club como verificado contra la fuente institucional (validación periódica). */
export async function markVerified(id, { scope, actor, reason } = {}) {
    const c = await clubRow(id);
    if (!c) throw new CatalogError('El club no existe.', 404);
    if (!catalogScopeAllows(scope, c.districtNumber)) throw new CatalogError('No tienes permiso sobre este distrito.', 403);
    await withTx(async (client) => {
        await client.query(`UPDATE "DistrictClubProfile" SET "catalogVerifiedAt" = NOW(), "catalogUpdatedAt" = NOW(), "catalogUpdatedBy" = $2 WHERE id = $1`, [c.id, actor?.name || null]);
        await logChange(client, { clubProfileId: c.id, action: 'verify', actor, reason, changes: [{ field: 'catalogVerifiedAt', from: c.catalogVerifiedAt, to: new Date().toISOString() }] });
    });
    return clubRow(c.id);
}

/** El listado administrativo, con los indicadores. */
export async function adminCatalog({ districts = null } = {}) {
    const rows = await allCatalogRows();
    const ds = Array.isArray(districts) ? districts.map(Number) : null;
    const lista = ds ? rows.filter(r => ds.includes(Number(r.districtNumber))) : rows;
    return {
        clubs: lista.map(r => ({ ...r, missing: missingFields(r) })),
        summary: summarizeCatalog(lista),
        districts: [...new Set(rows.map(r => Number(r.districtNumber)).filter(Boolean))].sort((a, b) => a - b),
        liveSource: clubCatalogState(),
    };
}

export default {
    ensureClubCatalogSchema, refreshClubCatalog, invalidateClubCatalog, clubCatalogFresh,
    allCatalogRows, catalogForForms, searchForForms, catalogDistricts, clubRow, resolveClubId, clubHistory, recentChanges,
    createClub, updateClub, setClubStatus, duplicateCandidates, mergeClubs, unmergeClub, dismissDuplicate,
    previewImport, commitImport, markVerified, adminCatalog, buildSnapshot,
};
