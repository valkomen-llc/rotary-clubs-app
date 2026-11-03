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
    // v4.1278 — los códigos QR y su medición aparte.
    qrs: [],
    qrDaily: [],
    qrVisitors: [],
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
        fila = { linkId, clubId, day, clicks: 0, uniques: 0, bots: 0, qrScans: 0 };
        DATA.daily.push(fila);
    }
    return fila;
}

function diaQrDe(qrId, linkId, clubId, day) {
    let fila = DATA.qrDaily.find(d => d.qrId === qrId && d.day === day);
    if (!fila) {
        fila = { qrId, linkId, clubId, day, scans: 0, uniques: 0, bots: 0, blocked: 0 };
        DATA.qrDaily.push(fila);
    }
    return fila;
}

/** Suma de columnas numéricas sobre un conjunto de filas, con los alias que pida el SQL. */
function sumar(filas, columnas) {
    const out = {};
    for (const c of columnas) out[c] = filas.reduce((a, f) => a + Number(f[c] || 0), 0);
    return out;
}

function nuevoEnlace(x) {
    return {
        id: x.id, clubId: x.clubId, slug: x.slug, target: x.target,
        permanent: x.permanent === true, forwardQuery: x.forwardQuery !== false,
        status: 'active', notes: x.notes || '', name: x.name || '', deletedAt: null, deletedBy: null,
        totalClicks: 0, uniqueVisitors: 0, botHits: 0, lastClickAt: null, qrScans: 0,
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
            const [linkId, clubId, dia, qrId] = params;
            const link = DATA.links.find(l => l.id === linkId);
            if (link) link.botHits += 1;
            diaDe(linkId, clubId, dia).bots += 1;
            if (qrId) {
                const qr = DATA.qrs.find(q => q.id === qrId);
                if (qr) qr.botHits += 1;
                diaQrDe(qrId, linkId, clubId, dia).bots += 1;
            }
            return { rows: [] };
        }

        // ── El escaneo BLOQUEADO (vencido, pausado, deshabilitado) ──────
        if (s.startsWith('WITH e AS') && s.includes('"blockedScans"')) {
            const [eventId, linkId, clubId, now, visitorKey] = params;
            const qrId = params[22], outcome = params[23], dia = params[24];
            DATA.events.push({
                id: eventId, linkId, clubId, createdAt: now, visitorKey, isNewVisitor: false,
                referrer: params[5], referrerHost: params[6],
                sourceKind: params[7], sourceLabel: params[8], sourceEvidence: params[9],
                utmSource: params[10], utmMedium: params[11], utmCampaign: params[12],
                utmContent: params[13], utmTerm: params[14],
                device: params[15], browser: params[16], os: params[17],
                country: params[18], region: params[19], city: params[20],
                userAgent: params[21], qrId, accessKind: 'qr', outcome,
            });
            diaQrDe(qrId, linkId, clubId, dia).blocked += 1;
            const qr = DATA.qrs.find(q => q.id === qrId);
            if (qr) qr.blockedScans += 1;
            return { rows: [] };
        }

        if (s.startsWith('WITH v AS') && s.includes('LinkRedirectEvent')) {
            const [linkId, visitorKey, now, eventId, clubId] = params;
            // Desde v4.1278 el día va en $23 y el QR (vacío = enlace directo)
            // en $24. Leer «el último» era leer el QR.
            const dia = params[22];
            const qrId = params[23] || '';

            let nuevo = false;
            if (visitorKey) {
                const v = DATA.visitors.find(x => x.linkId === linkId && x.visitorKey === visitorKey);
                if (v) { v.lastSeenAt = now; v.clicks += 1; }
                else {
                    DATA.visitors.push({ linkId, visitorKey, firstSeenAt: now, lastSeenAt: now, clicks: 1 });
                    nuevo = true;
                }
            }
            let nuevoQr = false;
            if (visitorKey && qrId) {
                const v = DATA.qrVisitors.find(x => x.qrId === qrId && x.visitorKey === visitorKey);
                if (v) { v.lastSeenAt = now; v.scans += 1; }
                else {
                    DATA.qrVisitors.push({ qrId, visitorKey, firstSeenAt: now, lastSeenAt: now, scans: 1 });
                    nuevoQr = true;
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
                qrId, accessKind: qrId ? 'qr' : 'link', outcome: 'redirected',
            });

            const fila = diaDe(linkId, clubId, dia);
            fila.clicks += 1;
            if (qrId && s.includes('"qrScans"')) fila.qrScans += 1;

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
                if (qrId && s.includes('"qrScans" = "qrScans" +')) link.qrScans += 1;
            }

            if (qrId && s.includes('"LinkRedirectQr"')) {
                const qr = DATA.qrs.find(q => q.id === qrId);
                if (qr) {
                    qr.totalScans += 1;
                    if (nuevoQr) qr.uniqueVisitors += 1;
                    qr.lastScanAt = now;
                }
                const fq = diaQrDe(qrId, linkId, clubId, dia);
                fq.scans += 1;
                if (nuevoQr) fq.uniques += 1;
            }
            return { rows: [] };
        }

        // ── LinkRedirectQr ───────────────────────────────────────────────
        if (s.includes('INSERT INTO "LinkRedirectQr" ')) {
            const [id, linkId, clubId, code, name, campaign, medium, label, design, validityPreset, expiresAt, createdBy, createdByName] = params;
            if (DATA.qrs.some(q => q.code === code)) {
                throw new Error('duplicate key value violates unique constraint "LinkRedirectQr_code_key"');
            }
            const fila = {
                id, linkId, clubId, code, name, campaign, medium, label, design,
                status: 'active', validityPreset, expiresAt: expiresAt || null,
                totalScans: 0, uniqueVisitors: 0, botHits: 0, blockedScans: 0, lastScanAt: null,
                deletedAt: null, deletedBy: null,
                createdBy, createdByName, createdAt: new Date(), updatedBy: null, updatedByName: '', updatedAt: new Date(),
            };
            DATA.qrs.push(fila);
            return { rows: [{ ...fila }] };
        }

        if (s.startsWith('UPDATE "LinkRedirectQr"')) {
            const where = s.slice(s.indexOf(' WHERE '));
            const conds = condiciones(where);
            const vivas = where.includes('"deletedAt" IS NULL');
            const hits = DATA.qrs.filter(q => casa(q, conds, params) && (!vivas || !q.deletedAt));
            for (const q of hits) {
                if (s.includes('SET name = $4')) {
                    Object.assign(q, {
                        name: params[3], campaign: params[4], medium: params[5], label: params[6],
                        design: params[7], validityPreset: params[8], expiresAt: params[9] || null,
                        updatedBy: params[10], updatedByName: params[11], updatedAt: new Date(),
                    });
                } else if (s.includes('SET status = $4')) {
                    Object.assign(q, { status: params[3], updatedBy: params[4], updatedByName: params[5], updatedAt: new Date() });
                } else if (s.includes('"deletedAt" = NOW()')) {
                    Object.assign(q, { deletedAt: new Date(), deletedBy: params[3] });
                } else {
                    DATA.qrs.splice(DATA.qrs.indexOf(q), 1);
                }
            }
            return { rows: hits.map(q => ({ ...q })) };
        }

        if (s.includes('FROM "LinkRedirectQr"') && s.includes('COUNT(*)') && s.includes('GROUP BY "linkId"')) {
            const [clubId] = params;
            const mapa = new Map();
            for (const q of DATA.qrs) {
                if (q.clubId !== clubId || q.deletedAt) continue;
                mapa.set(q.linkId, (mapa.get(q.linkId) || 0) + 1);
            }
            return { rows: [...mapa].map(([linkId, n]) => ({ linkId, n })) };
        }

        if (s.includes('FROM "LinkRedirectQr"')) {
            const where = s.includes(' WHERE ') ? s.slice(s.indexOf(' WHERE ')) : '';
            const conds = condiciones(where);
            let rows = DATA.qrs.filter(q => casa(q, conds, params));
            if (where.includes('"deletedAt" IS NULL')) rows = rows.filter(q => !q.deletedAt);
            return { rows: rows.map(q => ({ ...q })) };
        }

        // ── Agregado diario del QR ───────────────────────────────────────
        if (s.includes('FROM "LinkRedirectQrDaily"')) {
            const where = s.slice(s.indexOf(' WHERE '));
            const porQr = where.includes('"qrId" = $1');
            const porEnlace = where.includes('"linkId" = $1');
            const filas = DATA.qrDaily.filter(d =>
                porQr ? d.qrId === params[0] : porEnlace ? d.linkId === params[0] : d.clubId === params[0]);
            if (s.includes('FILTER (WHERE')) {
                const [, hoy, d7, d30] = params;
                const suma = (p) => filas.filter(p).reduce((a, f) => a + f.scans, 0);
                return {
                    rows: [{
                        hoy: suma(f => f.day === hoy), d7: suma(f => f.day >= d7), d30: suma(f => f.day >= d30),
                        bots: filas.reduce((a, f) => a + f.bots, 0),
                        blocked: filas.reduce((a, f) => a + f.blocked, 0),
                    }],
                };
            }
            const desde = params[1], hasta = params[2];
            const enRango = filas.filter(f => (!desde || f.day >= desde) && (!hasta || f.day <= hasta));
            if (s.includes('GROUP BY "qrId"')) {
                const mapa = new Map();
                for (const f of enRango) {
                    const acc = mapa.get(f.qrId) || { qrId: f.qrId, scans: 0, uniques: 0, blocked: 0 };
                    acc.scans += f.scans; acc.uniques += f.uniques; acc.blocked += f.blocked;
                    mapa.set(f.qrId, acc);
                }
                return { rows: [...mapa.values()] };
            }
            return {
                rows: enRango.sort((a, b) => a.day.localeCompare(b.day))
                    .map(f => ({ day: f.day, clicks: f.scans, uniques: f.uniques, bots: f.bots, blocked: f.blocked })),
            };
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
                notes: params[6], createdBy: params[7], createdByName: params[8], name: params[9] || '',
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
                        name: params[9] !== undefined ? params[9] : l.name,
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
            const porSitio = s.includes('"clubId" = $1');
            const filas = DATA.daily.filter(d => porSitio ? d.clubId === params[0] : d.linkId === params[0]);
            if (porSitio) {
                const [, desde, hasta] = params;
                const mapa = new Map();
                for (const f of filas) {
                    if ((desde && f.day < desde) || (hasta && f.day > hasta)) continue;
                    const acc = mapa.get(f.day) || { day: f.day, clicks: 0, uniques: 0, bots: 0, qrScans: 0 };
                    acc.clicks += f.clicks; acc.uniques += f.uniques; acc.bots += f.bots; acc.qrScans += f.qrScans || 0;
                    mapa.set(f.day, acc);
                }
                return { rows: [...mapa.values()].sort((a, b) => a.day.localeCompare(b.day)) };
            }
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
            return { rows: sel.map(f => ({ day: f.day, clicks: f.clicks, uniques: f.uniques, bots: f.bots, qrScans: f.qrScans || 0 })) };
        }

        if (s.includes('FROM "LinkRedirectEvent"')) {
            const porQr = s.includes('"qrId" = $1');
            const desde = params[1] ? new Date(params[1]) : null;
            let evs = DATA.events.filter(e =>
                (porQr ? e.qrId === params[0] : e.linkId === params[0])
                && (!desde || new Date(e.createdAt) >= desde));
            // Los desgloses sólo cuentan los que SALTARON; la actividad
            // reciente muestra también los bloqueados.
            if (s.includes("outcome = 'redirected'")) evs = evs.filter(e => (e.outcome || 'redirected') === 'redirected');

            if (s.includes('AS n')) {
                return { rows: [{ n: new Set(evs.map(e => e.visitorKey).filter(Boolean)).size }] };
            }

            if (!s.includes('GROUP BY')) {
                return {
                    rows: [...evs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 25)
                        .map(e => ({
                            createdAt: e.createdAt, accessKind: e.accessKind || 'link', qrId: e.qrId || '',
                            outcome: e.outcome || 'redirected', sourceKind: e.sourceKind, sourceLabel: e.sourceLabel,
                            device: e.device, browser: e.browser, country: e.country, isNewVisitor: e.isNewVisitor,
                        })),
                };
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
                fromStatus: params[8], toStatus: params[9], detail: params[10], qrId: params[11] || '',
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
