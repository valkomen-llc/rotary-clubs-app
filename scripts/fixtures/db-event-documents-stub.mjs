// Base en memoria para `npm run test:event-documents` (v4.1279.0).
//
// Cubre `CalendarEvent` (lo que lee `loadEvent`) y las cinco tablas de las
// estadísticas de descarga. Reproduce la SEMÁNTICA de cada sentencia del
// módulo a partir de sus parámetros —la ventana de repetición, el visitante
// nuevo, los contadores— para que la prueba pueda afirmar qué se cuenta y qué
// no. Lo que este doble NO demuestra es que el SQL sea válido para Postgres:
// eso lo comprueba `test:event-documents:e2e` con una base real, y se dice
// para no afirmar de más.

const SEED = () => ({
    events: [],
    documents: [],
    versions: [],
    downloads: [],
    daily: [],
    visitors: [],
    schemaReady: true,
});

export let DATA = SEED();
export const reset = () => { DATA = SEED(); };

let FAIL = false;
export const setFail = (v) => { FAIL = v; };

export let SQL_LOG = [];
export const clearLog = () => { SQL_LOG = []; };

const ts = (v) => (v instanceof Date ? v : new Date(v));

const db = {
    prisma: {},
    query: async (sql, params = []) => {
        if (FAIL) throw new Error('base caída (a propósito, en la prueba)');
        const s = String(sql).replace(/\s+/g, ' ').trim();
        SQL_LOG.push({ sql: s, params });

        if (s.includes('information_schema.tables')) {
            return { rows: DATA.schemaReady ? (params[0] || []).map(t => ({ table_name: t })) : [] };
        }
        if (s.includes('information_schema.columns')) return { rows: [] };
        if (s.startsWith('CREATE') || s.startsWith('--')) return { rows: [] };

        // ── loadEvent ──
        if (s.includes('FROM "CalendarEvent"')) {
            const [ref, clubId] = params;
            const hit = DATA.events.find(e => (e.id === ref || e.slug === ref) && (params.length < 2 || e.clubId === clubId));
            return { rows: hit ? [{ ...hit }] : [] };
        }

        // ── ensureDocumentVersion ──
        if (s.startsWith('WITH d AS ( INSERT INTO "EventDocument"')) {
            const [id, eventId, clubId, resourceKey, title, now, verId, url, sizeBytes, uploadedAt] = params;
            let doc = DATA.documents.find(d => d.eventId === eventId && d.resourceKey === resourceKey);
            if (!doc) {
                doc = { id, eventId, clubId, resourceKey, title, currentVersionId: null, totalDownloads: 0, uniqueVisitors: 0, botHits: 0, repeatHits: 0, lastDownloadAt: null, createdAt: ts(now) };
                DATA.documents.push(doc);
            } else {
                doc.title = title;
                doc.clubId = doc.clubId ?? clubId;
            }
            let ver = DATA.versions.find(v => v.documentId === doc.id && v.url === url);
            if (!ver) {
                const max = Math.max(0, ...DATA.versions.filter(v => v.documentId === doc.id).map(v => v.versionNumber));
                ver = { id: verId, documentId: doc.id, versionNumber: max + 1, url, fileName: title, sizeBytes, uploadedAt: uploadedAt ? ts(uploadedAt) : null, firstSeenAt: ts(now), downloads: 0, lastDownloadAt: null };
                DATA.versions.push(ver);
            } else {
                ver.fileName = title;
                ver.sizeBytes = sizeBytes ?? ver.sizeBytes;
            }
            return { rows: [{ versionId: ver.id, documentId: doc.id, currentVersionId: doc.currentVersionId }] };
        }
        if (s.startsWith('UPDATE "EventDocument" SET "currentVersionId"')) {
            const [docId, verId] = params;
            const doc = DATA.documents.find(d => d.id === docId);
            if (doc) doc.currentVersionId = verId;
            return { rows: [] };
        }

        // ── recordDownload: bot ──
        if (s.includes('"botHits" = "botHits" + 1')) {
            const [docId, eventId, clubId, day] = params;
            let d = DATA.daily.find(x => x.documentId === docId && x.day === day);
            if (!d) { d = { documentId: docId, eventId, clubId, day, downloads: 0, uniques: 0, bots: 0, repeats: 0 }; DATA.daily.push(d); }
            d.bots++;
            const doc = DATA.documents.find(x => x.id === docId);
            if (doc) doc.botHits++;
            return { rows: [] };
        }

        // ── recordDownload: humano (una sentencia) ──
        if (s.startsWith('WITH v AS ( INSERT INTO "EventDocumentVisitor"')) {
            const [docId, vk, now, windowSec, id, versionId, eventId, clubId, source, referrerHost, sourceKind, sourceLabel, device, browser, os, country, city, day] = params;
            const at = ts(now);
            let nuevo = false; let cuenta = true;
            if (vk) {
                const prev = DATA.visitors.find(v => v.documentId === docId && v.visitorKey === vk);
                if (!prev) {
                    DATA.visitors.push({ documentId: docId, visitorKey: vk, firstSeenAt: at, lastSeenAt: at, prevSeenAt: null, downloads: 1 });
                    nuevo = true; cuenta = true;
                } else {
                    cuenta = prev.lastSeenAt.getTime() < at.getTime() - windowSec * 1000;
                    prev.prevSeenAt = prev.lastSeenAt;
                    prev.lastSeenAt = at;
                    if (cuenta) prev.downloads++;
                }
            }
            if (cuenta) {
                DATA.downloads.push({ id, documentId: docId, versionId, eventId, clubId, createdAt: at, visitorKey: vk, isNewVisitor: nuevo, source, referrerHost, sourceKind, sourceLabel, device, browser, os, country, city });
            }
            let d = DATA.daily.find(x => x.documentId === docId && x.day === day);
            if (!d) { d = { documentId: docId, eventId, clubId, day, downloads: 0, uniques: 0, bots: 0, repeats: 0 }; DATA.daily.push(d); }
            if (cuenta) { d.downloads++; if (nuevo) d.uniques++; } else d.repeats++;
            const ver = DATA.versions.find(v => v.id === versionId);
            if (ver && cuenta) { ver.downloads++; ver.lastDownloadAt = at; }
            const doc = DATA.documents.find(x => x.id === docId);
            if (!doc) return { rows: [] };
            if (cuenta) { doc.totalDownloads++; if (nuevo) doc.uniqueVisitors++; doc.lastDownloadAt = at; } else doc.repeatHits++;
            return { rows: [{ counted: cuenta, newVisitor: nuevo }] };
        }

        // ── lecturas del panel ──
        if (s.includes('FROM "EventDocument" WHERE "eventId" = $1 AND "resourceKey" = $2')) {
            const [eventId, key] = params;
            const doc = DATA.documents.find(d => d.eventId === eventId && d.resourceKey === key);
            return { rows: doc ? [{ ...doc }] : [] };
        }
        if (s.includes('FROM "EventDocumentVersion" WHERE "documentId" = $1 ORDER BY')) {
            const rows = DATA.versions.filter(v => v.documentId === params[0]).sort((a, b) => b.versionNumber - a.versionNumber).map(v => ({ ...v }));
            return { rows };
        }
        if (s.includes('FROM "EventDocumentVersion" WHERE id = $1 AND "documentId" = $2')) {
            const v = DATA.versions.find(x => x.id === params[0] && x.documentId === params[1]);
            return { rows: v ? [{ ...v }] : [] };
        }
        if (s.includes('FILTER (WHERE day = $2::date)')) {
            const [docId, hoy, d7, d30] = params;
            const filas = DATA.daily.filter(x => x.documentId === docId);
            const sum = (pred) => filas.filter(pred).reduce((a, f) => a + f.downloads, 0);
            return { rows: [{ hoy: sum(f => f.day === hoy), d7: sum(f => f.day >= d7), d30: sum(f => f.day >= d30), repeats: filas.reduce((a, f) => a + f.repeats, 0) }] };
        }
        if (s.includes("to_char(day, 'YYYY-MM-DD')")) {
            const [docId, from, to] = params;
            const rows = DATA.daily
                .filter(x => x.documentId === docId && (params.length < 3 || (x.day >= from && x.day <= to)))
                .sort((a, b) => (a.day < b.day ? -1 : 1))
                .map(x => ({ day: x.day, downloads: x.downloads, uniques: x.uniques, bots: x.bots, repeats: x.repeats }));
            return { rows };
        }
        if (s.includes('FROM "EventDocumentDownload"')) {
            const [docId, desde, hasta] = params;
            const filas = DATA.downloads.filter(x => x.documentId === docId
                && (params.length < 3 || (x.createdAt.getTime() >= ts(desde).getTime() && x.createdAt.getTime() < ts(hasta).getTime())));
            const agrupar = (campo, extra) => {
                const m = new Map();
                for (const f of filas) {
                    if (campo === 'country' && !f.country) continue;
                    const k = f[campo];
                    const e = m.get(k) || { k, n: 0, label: extra ? f[extra] : undefined };
                    e.n++; m.set(k, e);
                }
                return [...m.values()].sort((a, b) => b.n - a.n);
            };
            if (s.includes('GROUP BY source')) return { rows: agrupar('source') };
            if (s.includes('GROUP BY device')) return { rows: agrupar('device') };
            if (s.includes('GROUP BY country')) return { rows: agrupar('country') };
            if (s.includes('GROUP BY "sourceKind"')) return { rows: agrupar('sourceKind', 'sourceLabel') };
            if (s.includes('COUNT(DISTINCT "visitorKey")')) {
                return { rows: [{ n: new Set(filas.filter(f => f.visitorKey).map(f => f.visitorKey)).size, total: filas.length }] };
            }
            if (s.includes('ORDER BY "createdAt" DESC LIMIT 20')) {
                return { rows: filas.sort((a, b) => b.createdAt - a.createdAt).slice(0, 20).map(f => ({ ...f })) };
            }
        }

        // Lo que el RBAC consulte al resolver el grant: vacío (degrada a los roles de siempre).
        return { rows: [] };
    },
};

export default db;
