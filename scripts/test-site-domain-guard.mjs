#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// El dominio y el slug de un sitio.              npm run test:site-domain-guard
// v4.1359.0 — caso «Club Rotario Tuluá El Lago» (creado con rotary4281.org).
//
// 1 sin base: el slug que sale del nombre y quién puede compartir un dominio.
// 2 invariantes leídas de los archivos.
// 3 con SITE_DOMAIN_TEST_DATABASE_URL (Postgres LOCAL desechable): las
//   consultas reales, el alta y la edición por los manejadores reales, y el
//   listado que marca los dominios ajenos.
// ════════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';

const URL_DB = process.env.SITE_DOMAIN_TEST_DATABASE_URL || '';
if (URL_DB) {
    if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(URL_DB)) { console.error('Sólo contra una base LOCAL y desechable.'); process.exit(1); }
    process.env.DATABASE_URL = URL_DB;
}
let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); } };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const G = (await import('../server/lib/siteDomainGuard.js')).default;

console.log('\n1. El slug y quién comparte un dominio');
ok('«Club Rotario Tuluá El Lago» → «tulua-el-lago»', G.slugFromName('Club Rotario Tuluá El Lago') === 'tulua-el-lago');
ok('«Rotary Club of Cali» → «cali»; «C.R. Fusagasugá» → «fusagasuga»', G.slugFromName('Rotary Club of Cali') === 'cali' && G.slugFromName('C.R. Fusagasugá') === 'fusagasuga');
ok('un nombre sin prefijo queda entero; vacío → vacío', G.slugFromName('Feria de Proyectos 2027') === 'feria-de-proyectos-2027' && G.slugFromName('') === '');
const D4281 = { id: 'd-4281', number: 4281 };
ok('el sitio-club del Distrito SÍ comparte su dominio', G.isDistrictSiteOf({ type: 'district', districtId: 'd-4281' }, D4281) && G.isDistrictSiteOf({ type: 'district', district: '4281' }, D4281));
ok('un club común NO (aunque sea del mismo distrito)', !G.isDistrictSiteOf({ type: 'club', districtId: 'd-4281', district: '4281' }, D4281));
ok('el mensaje explica qué hacer', /ya pertenece a el sitio del Distrito 4281/.test(G.domainConflictMessage('www.rotary4281.org', { kind: 'district', name: 'Distrito 4281' })) && /Déjalo vacío/.test(G.domainConflictMessage('x.org', { kind: 'club', name: 'Otro' })));

console.log('\n2. Invariantes');
const ctrl = read('server/controllers/clubController.js');
ok('el alta revisa el dominio y genera el slug', /findDomainConflict\(db, domain/.test(ctrl) && /uniqueSlug\(db, name\)/.test(ctrl));
ok('la edición revisa sólo si el dominio CAMBIA (un club mal guardado se puede corregir)', /normalizedDomain !== canonicalDomain\(entity\.domain\)/.test(ctrl));
ok('responde 409 DOMAIN_TAKEN', (ctrl.match(/code: 'DOMAIN_TAKEN'/g) || []).length === 2);
ok('el listado marca los dominios ajenos', /AS "domainConflict"/.test(ctrl));
ok('ninguna comilla invertida dentro de un SQL nuevo', !/db\.query\(`[^`]*\\`/.test(ctrl));
const ui = read('src/pages/admin/Clubs.tsx');
ok('el formulario apaga el autocompletado del dominio y lo explica', /autoComplete="off"/.test(ui) && /Nunca el del Distrito/.test(ui));
ok('el listado muestra el aviso', /club\.domainConflict &&/.test(ui));

if (!URL_DB) {
    console.log('\n3. Postgres real: OMITIDO (define SITE_DOMAIN_TEST_DATABASE_URL con una base LOCAL desechable)');
} else {
    console.log('\n3. Contra Postgres');
    const db = (await import('../server/lib/db.js')).default;
    try {
        await db.query('DROP TABLE IF EXISTS "Club", "District", "User", "Project", "Post"');
        await db.query(`CREATE TABLE "District" (id TEXT PRIMARY KEY, name TEXT, number INT, domain TEXT, subdomain TEXT, status TEXT DEFAULT 'active')`);
        await db.query(`CREATE TABLE "Club" (id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, name TEXT, city TEXT, country TEXT, district TEXT, "districtId" TEXT, domain TEXT, subdomain TEXT,
            description TEXT, status TEXT, type TEXT, category TEXT, "subscriptionStatus" TEXT, "expirationDate" TIMESTAMPTZ, "billingContactEmail" TEXT, "billingContactPhone" TEXT,
            "expirationBannerActive" BOOLEAN, "expirationBannerMessage" TEXT, "developmentBannerActive" BOOLEAN, "developmentBannerMessage" TEXT, "createdAt" TIMESTAMPTZ, "updatedAt" TIMESTAMPTZ)`);
        await db.query(`CREATE TABLE "User" (id TEXT PRIMARY KEY, "clubId" TEXT)`);
        await db.query(`CREATE TABLE "Project" (id TEXT PRIMARY KEY, "clubId" TEXT)`);
        await db.query(`CREATE TABLE "Post" (id TEXT PRIMARY KEY, "clubId" TEXT)`);
        await db.query(`INSERT INTO "District" VALUES ('d-4281', 'Distrito 4281', 4281, 'rotary4281.org', 'distrito4281', 'active')`);
        await db.query(`INSERT INTO "Club" (id, name, type, district, "districtId", domain, subdomain, status, "createdAt") VALUES
            ('c-dist', 'Rotary Distrito 4281', 'district', '4281', 'd-4281', 'rotary4281.org', 'rotary4281', 'active', NOW()),
            ('c-cali', 'Club Rotario Nuevo Cali', 'club', '4281', 'd-4281', 'rotarynuevocali.org', 'nuevocali', 'active', NOW()),
            ('c-tulua', 'Club Rotario Tuluá El Lago', 'club', '4281', 'd-4281', 'rotary4281.org', NULL, 'active', NOW())`);

        ok('el dominio del Distrito NO es libre para un club', (await G.findDomainConflict(db, 'www.rotary4281.org', { id: null, type: 'club' }))?.kind === 'club'
            || (await G.findDomainConflict(db, 'rotary4281.org', { id: 'c-dist', type: 'district', districtId: 'd-4281' })) === null);
        const distConf = await G.findDomainConflict(db, 'https://rotary4281.org/', { id: 'c-dist', type: 'district', districtId: 'd-4281' });
        ok('el sitio-club del Distrito sí puede tener el dominio del Distrito', distConf === null || distConf.kind === 'club', JSON.stringify(distConf));
        ok('el dominio de otro club tampoco', (await G.findDomainConflict(db, 'rotarynuevocali.org', { id: 'c-otro', type: 'club' }))?.name === 'Club Rotario Nuevo Cali');
        ok('un dominio nuevo sí es libre', (await G.findDomainConflict(db, 'rotarytuluaellago.org', { id: 'c-tulua', type: 'club' })) === null);
        ok('slug único: «tulua-el-lago», y si existe, «-2»', await G.uniqueSlug(db, 'Club Rotario Tuluá El Lago') === 'tulua-el-lago'
            && (await db.query(`UPDATE "Club" SET subdomain = 'tulua-el-lago' WHERE id = 'c-cali' RETURNING 1`)) && await G.uniqueSlug(db, 'Club Rotario Tuluá El Lago') === 'tulua-el-lago-2');
        await db.query(`UPDATE "Club" SET subdomain = 'nuevocali' WHERE id = 'c-cali'`);

        const ctl = await import('../server/controllers/clubController.js');
        const call = (h, { params = {}, body = {}, query = {}, user = { id: 'u-adm', role: 'administrator' } }) => new Promise((resolve, reject) => {
            const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); return this; } };
            Promise.resolve(h({ params, body, query, user }, res)).catch(reject);
        });
        const mal = await call(ctl.createClub, { body: { name: 'Club Rotario Otro', domain: 'rotary4281.org', district: '4281' } });
        ok('crear un club con el dominio del Distrito → 409 con la explicación', mal.status === 409 && mal.body.code === 'DOMAIN_TAKEN' && /rotary4281\.org/.test(mal.body.error), JSON.stringify(mal.body).slice(0, 200));
        const bien = await call(ctl.createClub, { body: { name: 'Club Rotario Buga Señorial', district: '4281' } });
        ok('crear sin dominio ni slug → el slug sale del nombre', bien.status === 201 && bien.body.subdomain === 'buga-senorial' && !bien.body.domain, JSON.stringify(bien.body).slice(0, 200));

        const list = await call(ctl.getAllClubs, {});
        const fila = (id) => list.body.find(c => c.id === id);
        ok('el listado marca al club con el dominio del Distrito', fila('c-tulua')?.domainConflict === 'club' || fila('c-tulua')?.domainConflict === 'district', JSON.stringify(fila('c-tulua')?.domainConflict));
        ok('… y no al sitio del Distrito ni a un club con su propio dominio', !fila('c-cali')?.domainConflict && !fila('c-dist')?.domainConflict, JSON.stringify([fila('c-cali')?.domainConflict, fila('c-dist')?.domainConflict]));

        // La corrección: editar Tuluá y dejar el dominio vacío.
        const otraVez = await call(ctl.updateClub, { params: { id: 'c-tulua' }, body: { domain: 'rotarynuevocali.org' } });
        ok('editar poniendo el dominio de otro club → 409', otraVez.status === 409);
        const arreglo = await call(ctl.updateClub, { params: { id: 'c-tulua' }, body: { domain: '' } });
        const tulua = (await db.query(`SELECT domain, subdomain FROM "Club" WHERE id = 'c-tulua'`)).rows[0];
        ok('dejar el dominio vacío corrige el club y le da su slug', arreglo.status === 200 && tulua.domain === null && tulua.subdomain === 'tulua-el-lago', JSON.stringify([arreglo.status, arreglo.body?.error, tulua]));
        const list2 = await call(ctl.getAllClubs, {});
        ok('… y el listado deja de marcarlo', !list2.body.find(c => c.id === 'c-tulua')?.domainConflict);
    } catch (err) {
        fail++; console.log(`  ✗ excepción: ${err?.stack || err}`);
    } finally {
        await db.pool?.end?.().catch(() => {});
    }
}

console.log(`\n${fail ? '❌' : '✅'} test:site-domain-guard — ${pass} pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
