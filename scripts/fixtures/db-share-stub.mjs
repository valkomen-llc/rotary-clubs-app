// ════════════════════════════════════════════════════════════════════
// La base, en memoria — para probar el CAMINO de la difusión en redes.
// v4.1013.0
//
// ⚠️ ESTE DOBLE NO IMPLEMENTA NINGUNA REGLA DEL MÓDULO. Un doble que reescribe
// en JavaScript la condición que la prueba dice comprobar no comprueba nada: la
// aserción pasaría con el candado real borrado. Es la lección de v4.896, y por
// eso acá:
//
//   · la IDEMPOTENCIA se aplica sólo si el INSERT trae su `ON CONFLICT
//     ("operationKey","accountId") DO NOTHING` — quitarlo del código real hace
//     que el doble inserte dos filas y la prueba falle, que es lo que tiene
//     que pasar;
//   · el AISLAMIENTO por tenant se aplica sólo si la consulta trae su
//     `"clubId" = $n`;
//   · el `RETURNING id` se respeta: sin él no habría reclamo que cerrar.
//
// Y leer de MENOS también miente (v4.992): las condiciones se reconocen tanto
// con comillas como sin ellas.
//
// Lo que este doble NO demuestra es que el SQL sea válido para Postgres. Eso se
// comprueba al desplegar, y se dice para no afirmar de más.
// ════════════════════════════════════════════════════════════════════

export const tablas = {
    Post: [],
    Club: [],
    District: [],
    SocialAccount: [],
    ContentDistribution: [],
    SocialAuditLog: [],
};

export const consultas = [];

export const reset = () => {
    for (const k of Object.keys(tablas)) tablas[k] = [];
    consultas.length = 0;
};

export const seed = ({ posts = [], clubs = [], districts = [], accounts = [], distributions = [] } = {}) => {
    reset();
    tablas.Post = posts.map(p => ({
        targetClubIds: [], published: false, clubId: null, slug: null,
        title: '', excerpt: '', image: null, seoImage: null, socialCopy: '',
        createdAt: new Date().toISOString(), ...p,
    }));
    tablas.Club = clubs.map(c => ({ domain: null, subdomain: null, type: 'club', districtId: null, district: null, ...c }));
    tablas.District = districts.map(d => ({ ...d }));
    tablas.SocialAccount = accounts.map(a => ({
        platform: 'facebook', pageId: null, accountName: null, avatar: null,
        status: 'active', permissions: [], metadata: null, tokenVersion: 1,
        expiresAt: null, lastVerifiedAt: null, accessToken: 'v1:cifrado',
        createdAt: new Date().toISOString(), ...a,
    }));
    tablas.ContentDistribution = distributions.map(d => ({ ...d }));
};

const norm = (sql) => String(sql).replace(/\s+/g, ' ').trim();
let seq = 0;

// ── Lo que se LEE del SQL, no se supone ─────────────────────────────
const tieneOnConflict = (q) =>
    /ON\s+CONFLICT\s*\(\s*"?operationKey"?\s*,\s*"?accountId"?\s*\)\s*DO\s+NOTHING/i.test(q);
const devuelveId = (q) => /RETURNING\s+id/i.test(q);
const filtraClub = (q) => /"?clubId"?\s*=\s*\$\d/i.test(q);
const filtraEntidad = (q) => /"?entityType"?\s*=\s*\$\d/i.test(q) && /"?entityId"?\s*=\s*\$\d/i.test(q);
const filtraEntidadesEnLote = (q) => /"?entityId"?\s*=\s*ANY\s*\(\s*\$\d/i.test(q);

export const query = async (sql, params = []) => {
    const q = norm(sql);
    consultas.push({ sql: q, params });

    // ── El ensure ───────────────────────────────────────────────────
    if (/^SELECT\s+to_regclass/i.test(q)) {
        return { rows: [{ t: true, columnas: 0 }] };
    }
    if (/^\s*CREATE TABLE|^\s*ALTER TABLE|^\s*CREATE UNIQUE INDEX|^\s*CREATE INDEX/i.test(q)) {
        return { rows: [] };
    }

    // ── Post ────────────────────────────────────────────────────────
    if (/FROM "Post" WHERE id = \$1/i.test(q)) {
        const p = tablas.Post.find(x => x.id === params[0]);
        return { rows: p ? [{ ...p }] : [] };
    }

    // ── Club ────────────────────────────────────────────────────────
    if (/FROM "Club" WHERE id = \$1/i.test(q)) {
        const c = tablas.Club.find(x => x.id === params[0]);
        return { rows: c ? [{ ...c }] : [] };
    }
    if (/FROM "Club" WHERE id = ANY/i.test(q)) {
        const ids = params[0] || [];
        return { rows: tablas.Club.filter(c => ids.includes(c.id)).map(c => ({ ...c })) };
    }

    // ── District (el dominio propio de un distrito, v4.744) ─────────
    if (/FROM "District"/i.test(q)) {
        const d = tablas.District.find(x => x.id === params[0] || (params[1] != null && x.number === params[1]));
        return { rows: d ? [{ domain: d.domain || null, subdomain: d.subdomain || null }] : [] };
    }

    // ── SocialAccount ───────────────────────────────────────────────
    if (/SELECT "accessToken" FROM "SocialAccount"/i.test(q)) {
        const a = tablas.SocialAccount.find(x => x.id === params[0]);
        return { rows: a ? [{ accessToken: a.accessToken }] : [] };
    }
    if (/FROM "SocialAccount"/i.test(q) && /^SELECT/i.test(q)) {
        // El aislamiento se aplica SOLO si la consulta lo trae.
        const filas = filtraClub(q)
            ? tablas.SocialAccount.filter(a => a.clubId === params[0])
            : [...tablas.SocialAccount];
        return { rows: filas.map(a => ({ ...a })) };
    }
    if (/^UPDATE "SocialAccount"/i.test(q)) {
        const a = tablas.SocialAccount.find(x => x.id === params[0]);
        if (a) { a.lastVerifiedAt = new Date().toISOString(); a.status = 'active'; }
        return { rows: [] };
    }

    // ── ContentDistribution ─────────────────────────────────────────
    if (/^INSERT INTO "ContentDistribution"/i.test(q)) {
        const [clubId, entityType, entityId, network, accountId, accountName, pageId,
               message, link, userId, userName, operationKey] = params;
        // ⚠️ El candado se aplica SOLO si el SQL lo declara. Sin esta lectura,
        // la prueba pasaría con el `ON CONFLICT` quitado del código real.
        if (tieneOnConflict(q)) {
            const choca = tablas.ContentDistribution.some(
                r => r.operationKey === operationKey && r.accountId === accountId
            );
            if (choca) return { rows: [] };
        }
        const fila = {
            id: `cd-${++seq}`, clubId, entityType, entityId, network, accountId,
            accountName, pageId, status: 'pending', message, link,
            externalId: null, externalUrl: null, errorCode: null, error: null,
            userId, userName, operationKey,
            createdAt: new Date(Date.now() + seq).toISOString(),
        };
        tablas.ContentDistribution.push(fila);
        return { rows: devuelveId(q) ? [{ id: fila.id }] : [] };
    }
    if (/^UPDATE "ContentDistribution"/i.test(q)) {
        const f = tablas.ContentDistribution.find(x => x.id === params[0]);
        if (f) {
            f.status = params[1]; f.externalId = params[2]; f.externalUrl = params[3];
            f.errorCode = params[4]; f.error = params[5];
        }
        return { rows: [] };
    }
    if (/FROM "ContentDistribution"/i.test(q)) {
        let filas = [...tablas.ContentDistribution];
        if (/"?operationKey"?\s*=\s*\$\d/i.test(q)) {
            filas = filas.filter(r => r.operationKey === params[0] && r.accountId === params[1]);
        } else if (filtraEntidadesEnLote(q)) {
            const ids = params[1] || [];
            filas = filas.filter(r => r.entityType === params[0] && ids.includes(r.entityId));
            if (filtraClub(q)) filas = filas.filter(r => r.clubId === params[2]);
        } else if (filtraEntidad(q)) {
            filas = filas.filter(r => r.entityType === params[0] && r.entityId === params[1]);
            if (filtraClub(q)) filas = filas.filter(r => r.clubId === params[2]);
        }
        filas.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
        return { rows: filas.map(r => ({ ...r })) };
    }

    // ── Auditoría ───────────────────────────────────────────────────
    if (/"SocialAuditLog"/i.test(q)) {
        tablas.SocialAuditLog.push({ sql: q, params });
        return { rows: [] };
    }

    return { rows: [] };
};

export default { query };
