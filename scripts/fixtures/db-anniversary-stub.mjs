// ════════════════════════════════════════════════════════════════════
// Aniversarios IA — la base y los proveedores, en memoria
// v4.896.0
//
// NO es un Postgres: es un doble que reconoce las sentencias que emiten
// `anniversaryStore.js`, `ensureAnniversarySchema.js` y el controlador
// público, y guarda las filas en arrays.
//
// Lo que se prueba con él es el CAMINO —qué parámetros lleva cada consulta, en
// qué orden ocurren las escrituras, que el reclamo sobre `attempts` funcione de
// verdad, que las cuatro etapas se encadenen y que el documento que llega al
// compositor tenga lo que el compositor espera—, que es exactamente lo que una
// prueba de criterio no puede ver. Es la lección de v4.744.
//
// **Lo que este doble NO demuestra es que el SQL sea válido para Postgres.**
// Eso exige una base y se comprueba al desplegar; se dice acá para no afirmar
// de más.
// ════════════════════════════════════════════════════════════════════

export let tablas = { AnniversaryConfig: [], AnniversaryConfigVersion: [], AnniversaryPiece: [], Club: [] };
export let log = [];
let seq = 0;
const id = (p) => `${p}-${++seq}`;

export const reset = () => {
    tablas = { AnniversaryConfig: [], AnniversaryConfigVersion: [], AnniversaryPiece: [], Club: [] };
    log = [];
    seq = 0;
};
export const sembrarClub = (fila) => { tablas.Club.push(fila); };

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const clon = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

const query = async (text, params = []) => {
    const sql = norm(text);
    log.push(sql.slice(0, 70));

    // El esquema: acá las tablas ya están. Crearlas es cosa de Postgres.
    if (/to_regclass/.test(sql)) {
        return { rows: [{ cfg: true, ver: true, pza: true, render_col: true, brand_col: true, pubver_col: true }] };
    }
    if (/^(CREATE TABLE|CREATE UNIQUE INDEX|CREATE INDEX|ALTER TABLE)/i.test(sql)) return { rows: [] };

    // ── AnniversaryConfig ───────────────────────────────────────────
    if (/^SELECT \* FROM "AnniversaryConfig"/.test(sql)) {
        const [kind, clubId] = params;
        const f = tablas.AnniversaryConfig.find(c => c.kind === kind && (c.clubId ?? null) === (clubId ?? null));
        return { rows: f ? [clon(f)] : [] };
    }
    if (/^INSERT INTO "AnniversaryConfig"/.test(sql)) {
        const [kind, clubId, name, draft] = params;
        const fila = {
            id: id('cfg'), kind, clubId: clubId ?? null, name, enabled: false,
            draft: JSON.parse(draft), published: null, publishedVersionId: null,
            publishedAt: null, publishedBy: null,
        };
        tablas.AnniversaryConfig.push(fila);
        return { rows: [clon(fila)] };
    }
    if (/^UPDATE "AnniversaryConfig" SET draft/.test(sql)) {
        const [draft, name, enabled, rowId] = params;
        const f = tablas.AnniversaryConfig.find(c => c.id === rowId);
        Object.assign(f, { draft: JSON.parse(draft), name, enabled });
        return { rows: [clon(f)] };
    }
    if (/^UPDATE "AnniversaryConfig" SET published = \$1/.test(sql)) {
        const [published, versionId, by, rowId] = params;
        const f = tablas.AnniversaryConfig.find(c => c.id === rowId);
        Object.assign(f, { published: JSON.parse(published), publishedVersionId: versionId, publishedAt: new Date(), publishedBy: by });
        return { rows: [clon(f)] };
    }
    if (/^UPDATE "AnniversaryConfig" SET published = NULL/.test(sql)) {
        const f = tablas.AnniversaryConfig.find(c => c.id === params[0]);
        f.published = null;
        return { rows: [clon(f)] };
    }

    // ── AnniversaryConfigVersion ────────────────────────────────────
    if (/COALESCE\(MAX\(version\), 0\) \+ 1/.test(sql)) {
        const [configId] = params;
        const n = tablas.AnniversaryConfigVersion.filter(v => v.configId === configId)
            .reduce((a, v) => Math.max(a, v.version), 0);
        return { rows: [{ siguiente: n + 1 }] };
    }
    if (/^INSERT INTO "AnniversaryConfigVersion"/.test(sql)) {
        const [configId, version, label, config, fingerprint, by, byEmail] = params;
        const fila = {
            id: id('ver'), configId, version, label, config: JSON.parse(config),
            fingerprint, publishedBy: by, publishedByEmail: byEmail, createdAt: new Date(),
        };
        tablas.AnniversaryConfigVersion.push(fila);
        return { rows: [clon(fila)] };
    }
    if (/^SELECT \* FROM "AnniversaryConfigVersion" WHERE id = \$1 AND "configId"/.test(sql)) {
        const [vid, configId] = params;
        const f = tablas.AnniversaryConfigVersion.find(v => v.id === vid && v.configId === configId);
        return { rows: f ? [clon(f)] : [] };
    }
    if (/^SELECT \* FROM "AnniversaryConfigVersion" WHERE id = \$1/.test(sql)) {
        const f = tablas.AnniversaryConfigVersion.find(v => v.id === params[0]);
        return { rows: f ? [clon(f)] : [] };
    }
    if (/^SELECT id, version, label/.test(sql)) {
        const [configId, limit] = params;
        return {
            rows: tablas.AnniversaryConfigVersion
                .filter(v => v.configId === configId)
                .sort((a, b) => b.version - a.version).slice(0, limit)
                .map(v => ({
                    id: v.id, version: v.version, label: v.label, fingerprint: v.fingerprint,
                    publishedByEmail: v.publishedByEmail, createdAt: v.createdAt,
                    designInstruction: v.config?.designInstruction || '',
                })),
        };
    }

    // ── AnniversaryPiece ────────────────────────────────────────────
    if (/^INSERT INTO "AnniversaryPiece"/.test(sql)) {
        const [configId, versionId, versionNumber, mode, clubId, subjectClubId,
            clubName, years, photoUrl, photoWidth, photoHeight] = params;
        const fila = {
            id: id('pza'), configId, versionId, versionNumber, mode, clubId, subjectClubId,
            clubName, years, photoUrl, photoWidth, photoHeight,
            analysis: null, copy: null, branding: null, taskId: null, attempts: 0,
            backdropUrl: null, zoneId: null, renderMode: null,
            status: 'draft', statusDetail: null, validation: null,
        };
        tablas.AnniversaryPiece.push(fila);
        return { rows: [clon(fila)] };
    }
    if (/^SELECT \* FROM "AnniversaryPiece" WHERE id = \$1/.test(sql)) {
        const f = tablas.AnniversaryPiece.find(p => p.id === params[0]);
        return { rows: f ? [clon(f)] : [] };
    }
    // El reclamo: `attempts = attempts + 1 ... AND attempts = $2`. Es lo que
    // impide que dos pulsaciones creen dos tareas para la misma pieza.
    //
    // ⚠️ LA CONDICIÓN SE LEE DEL SQL, NO SE IMPLEMENTA ACÁ. La primera versión
    // de este doble la escribía a mano en JavaScript, y entonces la prueba era
    // VACUA: quitar el `AND attempts = $2` de la consulta real no cambiaba
    // nada, porque el candado seguía viviendo en el doble. Lo destapó la
    // verificación a la inversa. Un doble que implementa la regla que la prueba
    // dice comprobar no comprueba nada.
    if (/^UPDATE "AnniversaryPiece" SET attempts = attempts \+ 1/.test(sql)) {
        const [pid] = params;
        const f = tablas.AnniversaryPiece.find(p => p.id === pid);
        if (!f) return { rows: [] };
        const guardia = sql.match(/AND attempts = \$(\d+)/);
        if (guardia && f.attempts !== params[Number(guardia[1]) - 1]) return { rows: [] };
        f.attempts += 1; f.status = 'composing'; f.statusDetail = null;
        return { rows: [clon(f)] };
    }
    // La escritura parcial: los pares `"campo" = $n` se leen del propio SQL.
    if (/^UPDATE "AnniversaryPiece" SET /.test(sql)) {
        const pid = params[params.length - 1];
        const f = tablas.AnniversaryPiece.find(p => p.id === pid);
        if (!f) return { rows: [] };
        for (const m of sql.matchAll(/"(\w+)" = \$(\d+)(::jsonb)?/g)) {
            const valor = params[Number(m[2]) - 1];
            f[m[1]] = m[3] ? JSON.parse(valor) : valor;
        }
        return { rows: [clon(f)] };
    }
    if (/^SELECT id, mode, "clubName"/.test(sql)) {
        const configId = params[0];
        return { rows: tablas.AnniversaryPiece.filter(p => p.configId === configId).map(clon) };
    }

    // ── Club (el sitio y el club al que se felicita) ────────────────
    if (/FROM "Club" WHERE lower\(domain\)/.test(sql)) {
        const f = tablas.Club.find(c => String(c.domain || '').toLowerCase() === params[0]);
        return { rows: f ? [{ id: f.id }] : [] };
    }
    if (/FROM "Club" WHERE lower\(name\)/.test(sql)) {
        const [uno, dos] = params.map(s => String(s).toLowerCase());
        const f = tablas.Club.find(c => [uno, dos].includes(String(c.name).toLowerCase()));
        return { rows: f ? [{ id: f.id }] : [] };
    }

    throw new Error(`[db-anniversary-stub] sentencia no reconocida: ${sql.slice(0, 120)}`);
};

export default { query };
