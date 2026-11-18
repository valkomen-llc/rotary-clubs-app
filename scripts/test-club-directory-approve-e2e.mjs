#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Aprobar una solicitud del Directorio de Clubes con datos REALES (v4.1336.0)
// CLUB_DIR_E2E_DATABASE_URL=postgres://…@127.0.0.1/…?sslmode=disable npm run test:club-directory:approve:e2e
//
// Reporte: «Revisar y Validar → Aprobar y Publicar» respondía
// «sintaxis de entrada inválida para el tipo entero: "NaN"». El campo «Año o
// Fecha de Fundación» es TEXTO LIBRE y la aprobación hacía
// `Number(payload.foundationYear)`: «15 de marzo de 1927» → NaN → la columna
// INT lo rechazaba y la solicitud no se podía aprobar NUNCA.
//
// Postgres REAL (las columnas INT son las de producción) y el controlador real.
// ⚠️ ESCRIBE EN LA BASE QUE SE LE DÉ: exige una base local y desechable.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const E2E_DB = process.env.CLUB_DIR_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) {
    console.log('[test:club-directory:approve:e2e] Sin CLUB_DIR_E2E_DATABASE_URL local: se omite (nunca corre contra una base remota).');
    process.exit(0);
}
process.env.DATABASE_URL = E2E_DB;

const { default: db } = await import(`${REPO}/server/lib/db.js`);
const ctrl = await import(`${REPO}/server/controllers/districtClubsController.js`);
const { ensureDistrictClubDirectorySchema } = await import(`${REPO}/server/lib/ensureDistrictClubDirectorySchema.js`);
await ensureDistrictClubDirectorySchema();

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); };
const call = async (handler, { params = {}, body = {}, user = { id: 'u-admin', email: 'admin@d4281.org', name: 'Comité D4281', role: 'administrator' }, portal = null } = {}) => {
    let status = 200; let data = null;
    const res = { status(s) { status = s; return this; }, json(d) { data = d; return this; } };
    await handler({ params, body, user, portal, query: {}, headers: {} }, res);
    return { status, data };
};
let seq = 0;
const solicitud = async (payload, extra = {}) => {
    seq += 1;
    const { rows } = await db.query(
        `INSERT INTO "DistrictClubSubmission" ("trackingNumber", "clubName", "applicantName", "applicantEmail", payload, status, "profileId")
         VALUES ($1, $2, 'Responsable', 'resp@club.org', $3::jsonb, 'recibida', $4) RETURNING id`,
        [`DIR-T-${Date.now()}-${seq}`, payload.officialName, JSON.stringify(payload), extra.profileId || null]);
    return rows[0].id;
};
const perfilDe = async (subId) => (await db.query(
    `SELECT p.* FROM "DistrictClubProfile" p JOIN "DistrictClubSubmission" s ON s."profileId" = p.id WHERE s.id = $1`, [subId])).rows[0];
const aprobar = (id) => call(ctrl.reviewSubmission, { params: { id }, body: { action: 'approve', feedback: '' } });

console.log('── El caso reportado (Club Rotario Pereira): fecha completa y texto en números');
let id = await solicitud({ officialName: 'Club Rotario Pereira Prueba', city: 'Pereira', state: 'Risaralda', motto: '“Se beneficia MÁS quien mejor sirve”', vision: '', foundationYear: '15 de marzo de 1927', memberCount: '35 socios', gallery: [] });
let r = await aprobar(id);
ok(r.status === 200 && r.data?.ok, `se aprueba (antes: ${'«sintaxis de entrada inválida para el tipo entero: "NaN"»'}) — respuesta ${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
let p = await perfilDe(id);
ok(p && p.status === 'published', 'el club queda publicado en el directorio');
ok(p.foundationYear === 1927, `el año sale de la fecha escrita (1927; fue ${p.foundationYear})`);
ok(p.memberCount === 35, `«35 socios» → 35 (fue ${p.memberCount})`);
const sub = (await db.query('SELECT status, payload FROM "DistrictClubSubmission" WHERE id = $1', [id])).rows[0];
ok(sub.status === 'aprobada', 'la solicitud queda «aprobada»');
ok(sub.payload.foundationYear === '15 de marzo de 1927', 'lo que escribió el club se conserva tal cual en la solicitud');

console.log('── Otras formas reales de escribir la fecha');
for (const [txt, year] of [['1927-03-15', 1927], ['15/03/1927', 1927], ['Fundado en 1954', 1954], ['1954', 1954], [' 1990 ', 1990]]) {
    id = await solicitud({ officialName: `Club ${txt}`, foundationYear: txt, memberCount: '28' });
    r = await aprobar(id);
    p = await perfilDe(id);
    ok(r.status === 200 && p.foundationYear === year && p.memberCount === 28, `«${txt}» → ${year}`);
}
id = await solicitud({ officialName: 'Club sin año claro', foundationYear: 'hace muchos años', memberCount: 'aprox. veinte' });
r = await aprobar(id);
p = await perfilDe(id);
ok(r.status === 200 && p.foundationYear === null && p.memberCount === null, 'sin un año ni un número reconocible: se aprueba igual y la columna queda vacía (no inventa)');
id = await solicitud({ officialName: 'Club año imposible', foundationYear: '3027', memberCount: '-5' });
r = await aprobar(id);
p = await perfilDe(id);
ok(r.status === 200 && p.foundationYear === null && p.memberCount === null, 'un año futuro o un número negativo no se guardan');

console.log('── Actualizar un perfil que ya existe (no pisa lo que había con vacío)');
const prev = (await db.query(`INSERT INTO "DistrictClubProfile" (id, "officialName", "shortName", slug, "foundationYear", "memberCount", status)
    VALUES (gen_random_uuid()::text, 'Club Existente', 'Existente', 'club-existente-t', 1960, 40, 'published') RETURNING id`)).rows[0].id;
id = await solicitud({ officialName: 'Club Existente', foundationYear: 'Fundado el 2 de mayo de 1961', memberCount: '' }, { profileId: prev });
r = await aprobar(id);
p = (await db.query('SELECT * FROM "DistrictClubProfile" WHERE id = $1', [prev])).rows[0];
ok(r.status === 200 && p.foundationYear === 1961 && p.memberCount === 40, 'actualiza el año (1961) y conserva los socios que ya tenía');
id = await solicitud({ officialName: 'Club Existente', foundationYear: 'sin dato', memberCount: 'n/a' }, { profileId: prev });
r = await aprobar(id);
p = (await db.query('SELECT * FROM "DistrictClubProfile" WHERE id = $1', [prev])).rows[0];
ok(r.status === 200 && p.foundationYear === 1961 && p.memberCount === 40, 'un texto no numérico no borra el dato bueno');

console.log('── Edición directa desde el panel');
r = await call(ctrl.updateClubProfileDirect, { params: { id: prev }, body: { officialName: 'Club Existente', foundationYear: '1962 (carta constitutiva)', memberCount: '41 activos' } });
p = (await db.query('SELECT * FROM "DistrictClubProfile" WHERE id = $1', [prev])).rows[0];
ok(r.status === 200 && p.foundationYear === 1962 && p.memberCount === 41, `editar desde el panel con texto libre (respuesta ${r.status} ${JSON.stringify(r.data).slice(0, 100)})`);

await db.pool.end();
console.log(`\n✅ test:club-directory:approve:e2e — ${n} comprobaciones contra Postgres real.`);
