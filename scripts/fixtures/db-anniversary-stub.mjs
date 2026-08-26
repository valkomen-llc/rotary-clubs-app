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

export let tablas = { AnniversaryConfig: [], AnniversaryConfigVersion: [], AnniversaryPiece: [], Club: [], District: [], Media: [], AnniversaryBenchmark: [], AnniversaryBenchmarkResult: [] };
export let log = [];
let seq = 0;
const id = (p) => `${p}-${++seq}`;

export const reset = () => {
    tablas = { AnniversaryConfig: [], AnniversaryConfigVersion: [], AnniversaryPiece: [], Club: [], District: [], Media: [], AnniversaryBenchmark: [], AnniversaryBenchmarkResult: [] };
    log = [];
    seq = 0;
};
export const sembrarClub = (fila) => { tablas.Club.push(fila); };
export const sembrarDistrict = (fila) => { tablas.District.push(fila); };
export const sembrarMedia = (fila) => { tablas.Media.push(fila); };

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const clon = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

const query = async (text, params = []) => {
    const sql = norm(text);
    log.push(sql.slice(0, 70));

    // El esquema: acá las tablas ya están. Crearlas es cosa de Postgres.
    if (/to_regclass/.test(sql)) {
        return { rows: [{ cfg: true, ver: true, pza: true, bench: true, benchres: true, render_col: true, brand_col: true, pubver_col: true, engine_pza_col: true, engine_cfg_col: true }] };
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
            publishedAt: null, publishedBy: null, engine: null,
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
    if (/^UPDATE "AnniversaryConfig" SET engine = \$1/.test(sql)) {
        const [engine, rowId] = params;
        const f = tablas.AnniversaryConfig.find(c => c.id === rowId);
        f.engine = JSON.parse(engine);
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
            analysis: null, copy: null, branding: null, engine: null, taskId: null, attempts: 0,
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

    // ── Benchmark ───────────────────────────────────────────────────
    if (/^INSERT INTO "AnniversaryBenchmark"/.test(sql)) {
        const [configId, models, photos, weights, createdBy] = params;
        const fila = {
            id: id('bmk'), configId, status: 'running', models: JSON.parse(models),
            photos: JSON.parse(photos), weights: weights ? JSON.parse(weights) : null,
            notes: null, createdBy, createdAt: new Date(), finishedAt: null,
        };
        tablas.AnniversaryBenchmark.push(fila);
        return { rows: [clon(fila)] };
    }
    if (/^SELECT \* FROM "AnniversaryBenchmark" WHERE id = \$1/.test(sql)) {
        const f = tablas.AnniversaryBenchmark.find(b => b.id === params[0]);
        return { rows: f ? [clon(f)] : [] };
    }
    if (/FROM "AnniversaryBenchmark"[\s\S]*ORDER BY "createdAt" DESC/.test(sql)) {
        return { rows: tablas.AnniversaryBenchmark.map(clon) };
    }
    if (/^UPDATE "AnniversaryBenchmark" SET status/.test(sql)) {
        const [status, bid] = params;
        const f = tablas.AnniversaryBenchmark.find(b => b.id === bid);
        if (f) { f.status = status; f.finishedAt = new Date(); }
        return { rows: f ? [clon(f)] : [] };
    }
    if (/^INSERT INTO "AnniversaryBenchmarkResult"/.test(sql)) {
        const [benchmarkId, model, photoIndex, taskId, status, error] = params;
        const fila = {
            id: id('res'), benchmarkId, model, photoIndex, taskId, status, error,
            imageUrl: null, latencyMs: null, auto: null, vote: null,
            dispatchedAt: new Date(), createdAt: new Date(),
        };
        tablas.AnniversaryBenchmarkResult.push(fila);
        return { rows: [clon(fila)] };
    }
    if (/^SELECT \* FROM "AnniversaryBenchmarkResult"/.test(sql)) {
        return {
            rows: tablas.AnniversaryBenchmarkResult
                .filter(r => r.benchmarkId === params[0])
                .sort((a, b) => a.photoIndex - b.photoIndex || a.model.localeCompare(b.model))
                .map(clon),
        };
    }
    if (/^UPDATE "AnniversaryBenchmarkResult" SET /.test(sql)) {
        const rid = params[params.length - 1];
        const f = tablas.AnniversaryBenchmarkResult.find(r => r.id === rid);
        if (!f) return { rows: [] };
        // El candado del cierre se lee del SQL, no se implementa acá: un doble
        // que escribe la regla que la prueba comprueba no comprueba nada
        // (lección de v4.896).
        if (/AND status = 'pending'/.test(sql) && f.status !== 'pending') return { rows: [] };
        for (const m of sql.matchAll(/"(\w+)" = \$(\d+)(::jsonb)?/g)) {
            const valor = params[Number(m[2]) - 1];
            f[m[1]] = m[3] ? JSON.parse(valor) : valor;
        }
        return { rows: [clon(f)] };
    }

    // ── Club (el sitio y el club al que se felicita) ────────────────
    if (/FROM "Club" WHERE lower\(domain\)/.test(sql)) {
        const f = tablas.Club.find(c => String(c.domain || '').toLowerCase() === params[0]);
        return { rows: f ? [{ id: f.id }] : [] };
    }
    if (/FROM "Club" WHERE lower\(name\)/.test(sql)) {
        const [uno, dos] = params.map(s => String(s).toLowerCase());
        const f = tablas.Club.find(c => [uno, dos].includes(String(c.name).toLowerCase()));
        // Devuelve también name y status: la resolución de la biblioteca
        // (v4.928) los lee; los consumidores anteriores sólo miran `id`.
        return { rows: f ? [{ id: f.id, name: f.name, status: f.status ?? null }] : [] };
    }

    // ── District + el sitio del distrito (v4.928, fallback de la biblioteca) ──
    if (/FROM "District" WHERE number/.test(sql)) {
        const f = tablas.District.find(d => Number(d.number) === Number(params[0]));
        return { rows: f ? [{ id: f.id, number: f.number, subdomain: f.subdomain ?? null }] : [] };
    }
    if (/FROM "Club" c WHERE c\."districtId" = \$1/.test(sql)) {
        // DISTRICT_SITE_SQL: los candidatos a sitio del distrito (v4.744).
        const [dId, numero, sub] = params;
        const rows = tablas.Club
            .filter(c => (dId && c.districtId === dId)
                || (String(numero || '') !== '' && String(c.district || '').trim() === String(numero))
                || (String(sub || '') !== '' && String(c.subdomain || '').toLowerCase() === String(sub)))
            .map(c => ({
                id: c.id, name: c.name, type: c.type ?? null, districtId: c.districtId ?? null,
                district: c.district ?? null, subdomain: c.subdomain ?? null,
                updatedAt: c.updatedAt ?? null, settingsCount: c.settingsCount ?? 0,
                isDistrictAdminSite: !!c.isDistrictAdminSite,
            }));
        return { rows };
    }

    // ── Media (v4.928, la biblioteca del sitio resuelto) ────────────
    if (/FROM "Media" WHERE "clubId" = \$1 AND type = 'image'/.test(sql)) {
        const rows = tablas.Media
            .filter(m => m.clubId === params[0] && m.type === 'image')
            .sort((a2, b2) => String(b2.createdAt || '').localeCompare(String(a2.createdAt || '')))
            .slice(0, 60)
            .map(m => ({ id: m.id, filename: m.filename ?? null, url: m.url, thumbUrl: m.thumbUrl ?? null }));
        return { rows };
    }

    throw new Error(`[db-anniversary-stub] sentencia no reconocida: ${sql.slice(0, 120)}`);
};

export default { query };
