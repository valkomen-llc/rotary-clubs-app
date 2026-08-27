// La base, en memoria. Sólo lo que el camino de las cuentas del sitio toca.
//
// ⚠️ NO REIMPLEMENTA NINGUNA REGLA QUE LA PRUEBA DIGA COMPROBAR. Es plomería:
// guarda filas y contesta consultas. Quién puede sobre quién, qué se puede
// editar y qué se salta en un bloque lo deciden `accountActions.js` y los
// controladores — que es lo que se está probando. Un doble que implementa la
// regla la vuelve vacua y dice lo contrario (la lección de v4.896).
export const state = {
    users: [],
    profiles: [],
    memberships: [],
    audit: [],
    queries: [],
};

export const reset = () => {
    state.users = []; state.profiles = []; state.memberships = [];
    state.audit = []; state.queries = [];
};

const norm = (sql) => String(sql).replace(/\s+/g, ' ').trim();

const db = {
    query: async (sql, params = []) => {
        const q = norm(sql);
        state.queries.push({ sql: q, params });

        // Los `ensure*Schema` y todo lo que crea o altera: se aceptan sin hacer nada.
        if (/^(CREATE|ALTER|DO |DROP|COMMENT)/i.test(q)) return { rows: [], rowCount: 0 };
        if (/information_schema|pg_catalog|to_regclass/i.test(q)) return { rows: [{ ok: true, exists: true }], rowCount: 1 };

        // ── User ──
        if (/^SELECT .*FROM "User" WHERE id = \$1/i.test(q)) {
            const u = state.users.find(x => x.id === params[0]);
            return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
        }
        if (/^SELECT .*FROM "User" WHERE lower\(email\)/i.test(q)) {
            const u = state.users.find(x => x.email.toLowerCase() === String(params[0]).toLowerCase());
            return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
        }
        if (/^UPDATE "User" SET password = \$1/i.test(q)) {
            const u = state.users.find(x => x.id === params[1]);
            if (u) u.password = params[0];
            return { rows: [], rowCount: u ? 1 : 0 };
        }
        if (/^UPDATE "User"/i.test(q)) return { rows: [], rowCount: 0 };

        // ── InstitutionalProfile ──
        if (/FROM "InstitutionalProfile"/i.test(q)) {
            const p = state.profiles.find(x => x.userId === params[0] || x.clubId === params[0]);
            const todos = state.profiles.filter(x => x.clubId === params[0]);
            if (/WHERE "userId" = \$1/i.test(q)) return { rows: p && p.userId === params[0] ? [p] : [], rowCount: 0 };
            return { rows: todos, rowCount: todos.length };
        }
        if (/^UPDATE "InstitutionalProfile"/i.test(q)) {
            const p = state.profiles.find(x => x.userId === params[params.length - 1]);
            if (p && /"mustChangePassword" = \$1/i.test(q)) p.mustChangePassword = !!params[0];
            if (p && /"resetToken" = NULL/i.test(q)) p.resetToken = null;
            return { rows: [], rowCount: p ? 1 : 0 };
        }
        if (/INSERT INTO "InstitutionalProfile"/i.test(q)) return { rows: [], rowCount: 1 };

        // ── SiteMembership: el cierre de sesiones ──
        if (/^UPDATE "SiteMembership" SET "sessionsRevokedAt"/i.test(q)) {
            const m = state.memberships.find(x => x.userId === params[0] && x.clubId === params[1]);
            if (m) m.sessionsRevokedAt = new Date().toISOString();
            return { rows: m ? [{ sessionsRevokedAt: m.sessionsRevokedAt }] : [], rowCount: m ? 1 : 0 };
        }

        // ── La bitácora ──
        if (/INSERT INTO "InstitutionalAccessEvent"/i.test(q)) {
            state.audit.push({ sql: q, params });
            return { rows: [], rowCount: 1 };
        }
        if (/FROM "InstitutionalAccessEvent"/i.test(q)) return { rows: state.audit, rowCount: state.audit.length };

        return { rows: [], rowCount: 0 };
    },
    getClient: async () => ({ query: db.query, release: () => {} }),
};

export default db;
