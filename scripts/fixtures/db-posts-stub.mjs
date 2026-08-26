// ════════════════════════════════════════════════════════════════════
// La base, en memoria — para probar el CAMINO de las publicaciones.
// v4.938.0
//
// ⚠️ ESTE DOBLE NO IMPLEMENTA NINGUNA REGLA DEL MÓDULO. Un doble que reescribe
// en JavaScript la condición que la prueba dice comprobar no comprueba nada: la
// aserción pasaría con el `WHERE` real borrado. Es la lección de v4.896, y por
// eso acá el filtrado se hace INTERPRETANDO el SQL que el controlador escribió
// —sus tres ramas de visibilidad, tal como las manda—, no reimplantando
// el criterio del módulo. Si alguien quita `= ANY("targetClubIds")` de la consulta, este
// doble deja de devolver la fila y la prueba falla, que es lo que tiene que
// pasar.
//
// Lo que este doble NO demuestra es que el SQL sea válido para Postgres. Eso se
// comprueba al desplegar, y se dice para no afirmar de más.
// ════════════════════════════════════════════════════════════════════

export const tablas = {
    Post: [],
    Club: [],
};

/** Las consultas que se ejecutaron, para poder mirarlas desde la prueba. */
export const consultas = [];

export const reset = () => {
    tablas.Post = [];
    tablas.Club = [];
    consultas.length = 0;
};

export const seed = ({ posts = [], clubs = [] } = {}) => {
    tablas.Post = posts.map(p => ({
        targetClubIds: [], published: false, clubId: null,
        title: '', slug: null, createdAt: new Date().toISOString(), ...p,
    }));
    tablas.Club = clubs.map(c => ({ ...c }));
};

const norm = (sql) => String(sql).replace(/\s+/g, ' ').trim();

/** ¿La consulta trae la rama de destinos? Se lee del SQL, no se supone. */
const miraDestinos = (sql) => /ANY\s*\(\s*COALESCE\s*\(\s*"targetClubIds"/i.test(sql);
const miraGlobales = (sql) => /cardinality\s*\(\s*COALESCE\s*\(\s*"targetClubIds"[^)]*\)\s*\)\s*=\s*0/i.test(sql);
const miraClub = (sql) => /"clubId"\s*=\s*\$\d/.test(sql);

const query = async (sql, params = []) => {
    const q = norm(sql);
    consultas.push({ sql: q, params });

    // ── SELECT sobre Club ───────────────────────────────────────────
    if (/^SELECT id, name FROM "Club"/i.test(q)) {
        return { rows: tablas.Club.map(c => ({ id: c.id, name: c.name })) };
    }

    // ── El diagnóstico de reconciliación: enumera columnas ──────────
    if (/^SELECT id, title, slug, "clubId", "targetClubIds", published/i.test(q)) {
        return { rows: [...tablas.Post] };
    }

    // ── El listado del panel ────────────────────────────────────────
    if (/^SELECT \* FROM "Post"/i.test(q) && !/WHERE id/i.test(q)) {
        if (!/WHERE/i.test(q)) {
            return { rows: [...tablas.Post].sort(porFecha) };
        }
        const site = String(params[0] ?? '');
        // ⚠️ Se aplican SÓLO las ramas que el SQL de verdad trae. Con la rama de
        // destinos borrada del controlador, una réplica deja de salir acá.
        const rows = tablas.Post.filter(p => {
            const targets = Array.isArray(p.targetClubIds) ? p.targetClubIds : [];
            if (miraClub(q) && p.clubId && String(p.clubId) === site) return true;
            if (miraGlobales(q) && !p.clubId && targets.length === 0) return true;
            if (miraDestinos(q) && targets.map(String).includes(site)) return true;
            // La rama vieja: `OR "clubId" IS NULL` sin más condición.
            if (/OR\s+"clubId"\s+IS\s+NULL(?!\s+AND)/i.test(q) && !p.clubId) return true;
            return false;
        });
        return { rows: rows.sort(porFecha) };
    }

    // ── Una fila por id ─────────────────────────────────────────────
    if (/^SELECT .* FROM "Post" WHERE id = \$1/i.test(q)) {
        const row = tablas.Post.find(p => p.id === params[0]);
        return { rows: row ? [row] : [] };
    }
    if (/^SELECT \* FROM "Post" WHERE id = ANY/i.test(q)) {
        const ids = new Set((params[0] || []).map(String));
        return { rows: tablas.Post.filter(p => ids.has(String(p.id))) };
    }

    // ── Retirar: reasignar destinos y, si toca, despublicar ─────────
    if (/^UPDATE "Post" SET "targetClubIds"/i.test(q)) {
        const [targets, unpublish, id] = params;
        const row = tablas.Post.find(p => p.id === id);
        if (row) {
            row.targetClubIds = targets;
            if (unpublish) row.published = false;
            row.updatedAt = new Date().toISOString();
        }
        return { rows: row ? [row] : [] };
    }

    // ── Borrado ─────────────────────────────────────────────────────
    if (/^DELETE FROM "Post" WHERE id = \$1/i.test(q)) {
        const antes = tablas.Post.length;
        tablas.Post = tablas.Post.filter(p => p.id !== params[0]);
        return { rowCount: antes - tablas.Post.length, rows: [] };
    }

    return { rows: [], rowCount: 0 };
};

const porFecha = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt));

export default { query };
