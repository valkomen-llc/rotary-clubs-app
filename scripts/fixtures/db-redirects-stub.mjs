// Base en memoria para `npm run test:redirects` y `npm run test:links`.
//
// Cubre los dos caminos de resolución —un club con su propio dominio y un
// DISTRITO, cuyo dominio vive en su fila de `District` y cuyo contenido vive en
// la fila de `Club` de tipo distrito— y las cinco tablas del módulo.
//
// ⚠️ LEE EL SQL; NO REIMPLEMENTA LAS REGLAS. Los filtros salen de las
// condiciones que la consulta escribe, así que quitar un `"clubId" = $2` del
// módulo hace que el doble deje de filtrar y la prueba FALLE — que es lo que
// tiene que pasar. Un doble que reescribe en JavaScript la regla que la prueba
// dice comprobar la vuelve vacua (la lección de v4.896), y uno que lee de menos
// afirma cosas que el módulo no hace (la otra cara, v4.992).
//
// LO QUE ESTE DOBLE NO DEMUESTRA es que el SQL sea válido para Postgres. Eso se
// comprueba al desplegar, y se dice para no afirmar de más.

const SEED = () => ({
    clubs: [
        { id: 'cali', name: 'Rotary Club Cali', domain: 'rotaryclubcali.org', subdomain: 'cali', type: 'club' },
        {
            id: 'sitio-4281', name: 'Distrito 4281 de Rotary International', domain: null,
            subdomain: 'distrito-4281', type: 'district', district: '4281', districtId: 'dist-4281',
            updatedAt: '2026-08-01T00:00:00Z',
        },
    ],
    districts: [
        { id: 'dist-4281', number: 4281, name: 'Distrito 4281', domain: 'rotary4281.org', subdomain: null },
    ],
    settings: [
        { clubId: 'cali', key: 'link_redirects', value: JSON.stringify([{ from: '/donar', to: 'https://donar.org' }]) },
        {
            clubId: 'sitio-4281', key: 'link_redirects',
            value: JSON.stringify([{ from: '/conferencia', to: 'https://inscripciones.org', permanent: true }]),
        },
    ],
    links: [],
    events: [],
    daily: [],
    visitors: [],
    audit: [],
    // Con `true`, el atajo de `ensureLinkRedirectSchema` da las tablas por
    // presentes: así las pruebas no ejecutan la ráfaga de DDL en cada llamada.
    schemaReady: true,
});

export let DATA = SEED();
export const reset = () => { DATA = SEED(); };

let FAIL = false;
export const setFail = (v) => { FAIL = v; };

/** Las sentencias que el módulo ejecutó, para poder mirarlas desde la prueba. */
export let SQL_LOG = [];
export const clearLog = () => { SQL_LOG = []; };

const lc = (v) => String(v ?? '').toLowerCase();

/**
 * Las condiciones de un fragmento de SQL.
 *
 * La columna se acepta entre comillas y sin ellas: el módulo escribe `id = $1`
 * sin comillas y `"clubId" = $2` con ellas, y un doble que sólo mire una de las
 * dos formas ignora la mitad de las condiciones — o sea, filtra de MENOS y da
 * por buenos accesos que el módulo no permite.
 */
function condiciones(fragmento) {
    const out = [];
    const col = '(?:"(\\w+)"|\\b([a-zA-Z_]\\w*))';

    // `columna = $n` y `columna <> $n`. El `<>` hace falta de verdad: la
    // consulta que busca los slugs del sitio EXCLUYE el enlace que se está
    // editando (`id <> $2`), y un doble que no lo lea devuelve también ese
    // enlace — con lo que editarlo choca consigo mismo y la prueba culpa al
    // módulo, que está bien.
    const conParam = new RegExp(`${col}\\s*(=|<>)\\s*\\$(\\d+)`, 'g');
    let m;
    while ((m = conParam.exec(fragmento))) {
        out.push({ col: m[1] || m[2], op: m[3], idx: Number(m[4]) - 1 });
    }

    // `columna = 'literal'`. Igual de importante: `status = 'active'` es lo que
    // hace que un enlace PAUSADO deje de resolver, y no lleva parámetro.
    const conLiteral = new RegExp(`${col}\\s*=\\s*'([^']*)'`, 'g');
    while ((m = conLiteral.exec(fragmento))) {
        out.push({ col: m[1] || m[2], op: '=', valor: m[3] });
    }
    return out;
}

const casa = (fila, conds, params) => conds.every(c => {
    const v = c.valor !== undefined ? c.valor : params[c.idx];
    if (v === null || v === undefined) return true;   // `$2::text IS NULL OR …`
    const igual = String(fila[c.col] ?? '') === String(v);
    return c.op === '<>' ? !igual : igual;
});

function diaDe(linkId, clubId, day) {
    let fila = DATA.daily.find(d => d.linkId === linkId && d.day === day);
    if (!fila) {
        fila = { linkId, clubId, day, clicks: 0, uniques: 0, bots: 0 };
        DATA.daily.push(fila);
    }
    return fila;
}

function nuevoEnlace(x) {
    return {
        id: x.id, clubId: x.clubId, slug: x.slug, target: x.target,
        permanent: x.permanent === true, forwardQuery: x.forwardQuery !== false,
        status: 'active', notes: x.notes || '', deletedAt: null, deletedBy: null,
        totalClicks: 0, uniqueVisitors: 0, botHits: 0, lastClickAt: null,
        createdBy: x.createdBy || null, createdByName: x.createdByName || '',
        createdAt: new Date(), updatedBy: null, updatedByName: '', updatedAt: new Date(),
    };
}

const db = {
    prisma: {},
    query: async (sql, params = []) => {
        if (FAIL) throw new Error('base caída (a propósito, en la prueba)');
        const s = String(sql).replace(/\s+/g, ' ').trim();
        SQL_LOG.push(s);

        // ── El atajo del ensure ──────────────────────────────────────────
        if (s.includes('information_schema.tables')) {
            return {
                rows: DATA.schemaReady ? (params[0] || []).map(t => ({ table_name: t })) : [],
            };
        }
        if (s.includes('information_schema.columns')) return { rows: [] };
        if (s.startsWith('CREATE') || s.startsWith('--')) return { rows: [] };

        // ── Resolución del sitio ─────────────────────────────────────────
        if (s.includes('FROM "Club"') && s.includes('domain') && !s.includes('settingsCount')) {
            const [candidates, label] = params;
            const hit = DATA.clubs.find(c =>
                (c.domain && candidates.includes(lc(c.domain))) ||
                (label && lc(c.subdomain) === label));
            return { rows: hit ? [{ id: hit.id }] : [] };
        }

        if (s.includes('FROM "District"')) {
            const [candidates, label] = params;
            const hit = DATA.districts.find(d =>
                (d.domain && candidates.includes(lc(d.domain))) ||
                (label && lc(d.subdomain) === label));
            return { rows: hit ? [{ id: hit.id, number: hit.number, subdomain: hit.subdomain }] : [] };
        }

        if (s.includes('FROM "Club" c') && s.includes('settingsCount')) {
            const [districtId, number, subdomain] = params;
            const rows = DATA.clubs
                .filter(c =>
                    (districtId && c.districtId === districtId) ||
                    (c.district && String(c.district).trim() === number) ||
                    (subdomain && lc(c.subdomain) === subdomain))
                .map(c => ({
                    id: c.id, name: c.name, type: c.type, districtId: c.districtId, district: c.district,
                    subdomain: c.subdomain, updatedAt: c.updatedAt,
                    settingsCount: DATA.settings.filter(x => x.clubId === c.id).length,
                    isDistrictAdminSite: false,
                }));
            return { rows };
        }

        // ── El ajuste viejo ──────────────────────────────────────────────
        if (s.includes('FROM "Setting"')) {
            const [clubId, key] = params;
            const hit = DATA.settings.find(x => x.clubId === clubId && x.key === key);
            return { rows: hit ? [{ value: hit.value }] : [] };
        }
        if (s.includes('UPDATE "Setting"')) {
            const [clubId, key] = params;
            const hit = DATA.settings.find(x => x.clubId === clubId && x.key === key);
            if (hit) hit.value = '[]';
            return { rows: [] };
        }

        // ── El registro del clic (las dos sentencias con CTE) ────────────
        if (s.startsWith('WITH d AS') && s.includes('"botHits"')) {
            const [linkId, clubId, dia] = params;
            const link = DATA.links.find(l => l.id === linkId);
            if (link) link.botHits += 1;
            diaDe(linkId, clubId, dia).bots += 1;
            return { rows: [] };
        }

        if (s.startsWith('WITH v AS') && s.includes('LinkRedirectEvent')) {
            const [linkId, visitorKey, now, eventId, clubId] = params;
            const dia = params[params.length - 1];

            let nuevo = false;
            if (visitorKey) {
                const v = DATA.visitors.find(x => x.linkId === linkId && x.visitorKey === visitorKey);
                if (v) { v.lastSeenAt = now; v.clicks += 1; }
                else {
                    DATA.visitors.push({ linkId, visitorKey, firstSeenAt: now, lastSeenAt: now, clicks: 1 });
                    nuevo = true;
                }
            }

            DATA.events.push({
                id: eventId, linkId, clubId, createdAt: now, visitorKey, isNewVisitor: nuevo,
                referrer: params[5], referrerHost: params[6],
                sourceKind: params[7], sourceLabel: params[8], sourceEvidence: params[9],
                utmSource: params[10], utmMedium: params[11], utmCampaign: params[12],
                utmContent: params[13], utmTerm: params[14],
                device: params[15], browser: params[16], os: params[17],
                country: params[18], region: params[19], city: params[20],
                userAgent: params[21],
            });

            const fila = diaDe(linkId, clubId, dia);
            fila.clicks += 1;

            // El incremento de únicos NO se decide acá: sale del `CASE WHEN` de
            // la propia sentencia. Si el módulo dejara de distinguir al que
            // vuelve, el doble suma igual que él y la prueba lo ve por SALIDA.
            const distingueDiario = s.includes('CASE WHEN n.nuevo THEN 1 ELSE 0 END');
            if (!distingueDiario || nuevo) fila.uniques += 1;

            const link = DATA.links.find(l => l.id === linkId);
            if (link) {
                link.totalClicks += 1;
                const distingueTotal = s.includes('CASE WHEN nuevo THEN 1 ELSE 0 END');
                if (!distingueTotal || nuevo) link.uniqueVisitors += 1;
                link.lastClickAt = now;
            }
            return { rows: [] };
        }

        // ── LinkRedirect ─────────────────────────────────────────────────
        if (s.includes('INSERT INTO "LinkRedirect" ')) {
            const migrando = s.includes('WHERE NOT EXISTS');
            const [id, clubId, slug, target, permanent] = params;
            const choca = DATA.links.some(l => l.clubId === clubId && l.slug === slug && !l.deletedAt);
            if (migrando) {
                if (choca) return { rows: [] };
                DATA.links.push(nuevoEnlace({ id, clubId, slug, target, permanent, forwardQuery: true }));
                return { rows: [{ id }] };
            }
            if (choca) throw new Error('duplicate key value violates unique constraint "LinkRedirect_slug_key"');
            const fila = nuevoEnlace({
                id, clubId, slug, target, permanent, forwardQuery: params[5],
                notes: params[6], createdBy: params[7], createdByName: params[8],
            });
            DATA.links.push(fila);
            return { rows: [{ ...fila }] };
        }

        if (s.startsWith('UPDATE "LinkRedirect"')) {
            const where = s.slice(s.indexOf(' WHERE '));
            const conds = condiciones(where);
            const vivas = where.includes('"deletedAt" IS NULL');
            const hits = DATA.links.filter(l => casa(l, conds, params) && (!vivas || !l.deletedAt));

            for (const l of hits) {
                if (s.includes('SET slug = $3')) {
                    Object.assign(l, {
                        slug: params[2], target: params[3], permanent: params[4],
                        forwardQuery: params[5], notes: params[6],
                        updatedBy: params[7], updatedByName: params[8], updatedAt: new Date(),
                    });
                } else if (s.includes('SET status = $3')) {
                    Object.assign(l, {
                        status: params[2], updatedBy: params[3], updatedByName: params[4], updatedAt: new Date(),
                    });
                } else if (s.includes('"deletedAt" = NOW()')) {
                    Object.assign(l, { deletedAt: new Date(), deletedBy: params[2] });
                } else {
                    // El módulo dejó de marcar el borrado suave: la fila se va,
                    // con su historial, que es justo lo que no debe pasar.
                    DATA.links.splice(DATA.links.indexOf(l), 1);
                }
            }
            return { rows: hits.map(l => ({ ...l })) };
        }

        if (s.includes('FROM "LinkRedirect"') && s.startsWith('SELECT COUNT')) {
            const conds = condiciones(s.slice(s.indexOf(' WHERE ')));
            return { rows: [{ n: DATA.links.filter(l => casa(l, conds, params) && !l.deletedAt).length }] };
        }

        if (s.includes('FROM "LinkRedirect"')) {
            const where = s.slice(s.indexOf(' WHERE '));
            const conds = condiciones(where);
            let rows = DATA.links.filter(l => casa(l, conds, params));
            if (where.includes('"deletedAt" IS NULL')) rows = rows.filter(l => !l.deletedAt);
            if (s.includes('slug FROM "LinkRedirect"')) return { rows: rows.map(l => ({ slug: l.slug })) };
            return { rows: rows.map(l => ({ ...l })) };
        }

        // ── Agregado diario y eventos ────────────────────────────────────
        if (s.includes('FROM "LinkRedirectDaily"')) {
            const linkId = params[0];
            const filas = DATA.daily.filter(d => d.linkId === linkId);
            if (s.includes('FILTER (WHERE')) {
                const [, hoy, d7, d30] = params;
                const suma = (p) => filas.filter(p).reduce((a, f) => a + f.clicks, 0);
                return {
                    rows: [{
                        hoy: suma(f => f.day === hoy),
                        d7: suma(f => f.day >= d7),
                        d30: suma(f => f.day >= d30),
                        bots: filas.reduce((a, f) => a + f.bots, 0),
                    }],
                };
            }
            const [, desde, hasta] = params;
            const sel = filas
                .filter(f => (!desde || f.day >= desde) && (!hasta || f.day <= hasta))
                .sort((a, b) => a.day.localeCompare(b.day));
            return { rows: sel.map(f => ({ day: f.day, clicks: f.clicks, uniques: f.uniques, bots: f.bots })) };
        }

        if (s.includes('FROM "LinkRedirectEvent"')) {
            const linkId = params[0];
            const desde = params[1] ? new Date(params[1]) : null;
            const evs = DATA.events.filter(e =>
                e.linkId === linkId && (!desde || new Date(e.createdAt) >= desde));

            if (s.includes('AS n')) {
                return { rows: [{ n: new Set(evs.map(e => e.visitorKey).filter(Boolean)).size }] };
            }

            const grupo = /GROUP BY (.+?) ORDER BY/.exec(s)?.[1] || '';
            const cols = grupo.split(',').map(c => c.replace(/"/g, '').trim()).filter(Boolean);
            const mapa = new Map();
            for (const e of evs) {
                if (s.includes("\"utmSource\" <> ''") && !e.utmSource) continue;
                const clave = cols.map(c => e[c] ?? '').join(' ');
                const acc = mapa.get(clave) || { clicks: 0, visitantes: new Set(), fila: e };
                acc.clicks += 1;
                if (e.visitorKey) acc.visitantes.add(e.visitorKey);
                mapa.set(clave, acc);
            }
            const rows = [...mapa.values()].map(acc => {
                const salida = { clicks: acc.clicks, uniques: acc.visitantes.size };
                for (const c of cols) salida[c] = acc.fila[c] ?? '';
                if (s.includes('AS kind')) salida.kind = acc.fila.sourceKind;
                if (s.includes('MAX("sourceLabel")')) salida.label = acc.fila.sourceLabel;
                return salida;
            }).sort((a, b) => b.clicks - a.clicks);
            return { rows };
        }

        // ── Auditoría ────────────────────────────────────────────────────
        if (s.includes('INSERT INTO "LinkRedirectAudit"')) {
            DATA.audit.push({
                id: params[0], linkId: params[1], clubId: params[2], action: params[3],
                actorId: params[4], actorName: params[5],
                fromTarget: params[6], toTarget: params[7],
                fromStatus: params[8], toStatus: params[9], detail: params[10],
                createdAt: new Date(),
            });
            return { rows: [] };
        }
        if (s.includes('FROM "LinkRedirectAudit"')) {
            const conds = condiciones(s.slice(s.indexOf(' WHERE ')));
            return { rows: DATA.audit.filter(a => casa(a, conds, params)).reverse() };
        }

        return { rows: [] };
    },
};

export default db;
