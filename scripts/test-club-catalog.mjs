// ════════════════════════════════════════════════════════════════════
// Catálogo Maestro de Clubes — pruebas (v4.1269.0)
//
//   npm run test:club-catalog
//
// Parte 1 (siempre): el criterio puro (`clubCatalogSpec.js`) y el catálogo
// vivo (`rotaryClubs.js`), sin base ni red.
// Parte 2 (con `TEST_DATABASE_URL`): integración contra un Postgres real —
// las doce pruebas obligatorias del pedido—. Ejemplo:
//   TEST_DATABASE_URL='postgresql://postgres@localhost:5433/rot?sslmode=disable&host=/tmp' npm run test:club-catalog
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';

let ok = 0, fail = 0;
const check = (name, cond, detail = '') => {
    if (cond) { ok++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const S = await import('../server/lib/clubCatalogSpec.js');
const RC = await import('../server/lib/rotaryClubs.js');

console.log('\n── Nombres: el mismo texto se reconoce, la decisión es humana ──');
check('«Club Rotario Armenia International» ≡ «Rotary Club Armenia International»',
    S.coreName('Club Rotario Armenia International') === S.coreName('Rotary Club Armenia International'));
check('≡ «Armenia International» y «Armenia Internacional»',
    S.coreName('Armenia International') === S.coreName('Club Rotario Armenia Internacional'));
check('el E-Club no recibe «Club Rotario» delante', S.deriveOfficialName('E-Club Origen') === 'Rotary E-Club Origen');
check('nombre corto desde el oficial', S.deriveShortName('Club Rotario Bogotá Chicó') === 'Bogotá Chicó');

console.log('\n── Validación: lo opcional no bloquea ──');
const minimo = S.shapeClubInput({ officialName: 'Club Rotario Nuevo Prueba', districtNumber: '4281' });
check('un club con sólo nombre y distrito es válido', S.validateClubInput(minimo).ok);
check('queda marcado como incompleto', S.isIncomplete(minimo) && S.missingFields(minimo).length === 5);
check('sin distrito no se guarda', !S.validateClubInput(S.shapeClubInput({ officialName: 'Club Rotario X' })).ok);
check('un correo mal escrito se rechaza', !S.validateClubInput(S.shapeClubInput({ officialName: 'Club Rotario X', districtNumber: 4281, contactEmail: 'no-es-correo' })).ok);
check('el estado desconocido no se acepta', S.shapeClubInput({ catalogStatus: 'borrado' }).catalogStatus === '');

console.log('\n── Renombrar conserva el nombre anterior como alias ──');
const alias = S.aliasesAfterRename({ officialName: 'Club Rotario Pereira Nuevo', shortName: 'Pereira Nuevo', aliases: [] },
    { officialName: 'Club Rotario Pereira Renacer', shortName: 'Pereira Renacer' });
check('el nombre viejo queda como alias', alias.some(a => S.coreName(a) === 'pereira nuevo'), JSON.stringify(alias));

console.log('\n── Duplicados: se SEÑALAN, nunca se fusionan solos ──');
const pares = S.findDuplicateCandidates([
    { id: 'a', districtNumber: 4281, officialName: 'Club Rotario Armenia International', shortName: 'Armenia International' },
    { id: 'b', districtNumber: 4281, officialName: 'Rotary Club Armenia International', shortName: 'Armenia International' },
    { id: 'c', districtNumber: 4271, officialName: 'Club Rotario Caldas', shortName: 'Caldas' },
    { id: 'd', districtNumber: 4281, officialName: 'Club Rotario Caldas', shortName: 'Caldas' },
    { id: 'e', districtNumber: 4281, officialName: 'Club Rotario Ibague', shortName: 'Ibague', rotaryInternationalId: '111' },
    { id: 'f', districtNumber: 4281, officialName: 'Club Rotario Ibagué', shortName: 'Ibagué', rotaryInternationalId: '222' },
]);
check('mismo nombre y distrito → confianza alta', pares.some(p => p.a === 'a' && p.b === 'b' && p.confidence === 'alta'));
check('homónimos de distritos distintos → confianza baja', pares.some(p => [p.a, p.b].sort().join() === 'c,d' && p.confidence === 'baja'));
check('IDs oficiales distintos → NO es duplicado', !pares.some(p => [p.a, p.b].sort().join() === 'e,f'));
check('un par descartado no vuelve a aparecer', S.findDuplicateCandidates([
    { id: 'a', districtNumber: 4281, officialName: 'Club Rotario Cali', notDuplicateOf: ['b'] },
    { id: 'b', districtNumber: 4281, officialName: 'Rotary Club Cali' },
]).length === 0);

console.log('\n── Importación: nada se incorpora sin revisión ──');
const existentes = [
    { id: 'x1', districtNumber: 4281, organizationType: 'rotary', officialName: 'Club Rotario Pasto', shortName: 'Pasto', city: 'Pasto', catalogStatus: 'activo' },
    { id: 'x2', districtNumber: 4281, organizationType: 'rotary', officialName: 'Club Rotario Neiva', shortName: 'Neiva', city: '', catalogStatus: 'activo' },
    { id: 'x3', districtNumber: 4281, organizationType: 'rotary', officialName: 'Club Rotario Bogotá Chapinero', shortName: 'Bogotá Chapinero', catalogStatus: 'activo' },
    { id: 'x4', districtNumber: 4281, organizationType: 'rotary', officialName: 'Club Rotario Tunja', shortName: 'Tunja', catalogStatus: 'activo' },
];
const filas = S.classifyImportRows([
    { 'Nombre oficial': 'Club Rotario Pasto', Ciudad: 'Pasto' },
    { 'Nombre oficial': 'Rotary Club Neiva', Ciudad: 'Neiva', Distrito: '4281' },
    { 'Nombre oficial': 'Club Rotario Mocoa', Departamento: 'Putumayo' },
    { 'Nombre oficial': 'Club Rotario Bogota Chapinerro' },
    { Ciudad: 'Sin nombre' },
    { 'Nombre oficial': 'Club Rotario Mocoa' },
    { 'Nombre oficial': 'Club Rotario Barranquilla Norte', Distrito: '4271' },
], existentes, { defaultDistrict: 4281, scope: { districts: [4281] } });
const st = filas.map(f => f.status);
check('existente sin cambios', st[0] === 'existente', st[0]);
check('existente que COMPLETA un campo vacío', st[1] === 'actualiza' && filas[1].changes[0].field === 'city', st[1]);
check('nuevo', st[2] === 'nuevo', st[2]);
check('parecido → revisión manual (posible duplicado)', st[3] === 'posible_duplicado', st[3]);
check('sin nombre → inválido', st[4] === 'invalido', st[4]);
check('repetido en el archivo → inválido', st[5] === 'invalido', st[5]);
check('otro distrito sin permiso → fuera de alcance', st[6] === 'fuera_de_alcance', st[6]);
check('comparar con la fuente oficial lista lo que FALTA en el archivo',
    S.missingFromSource(filas, existentes, [4281]).map(x => x.id).join() === 'x4');

console.log('\n── Alcance de escritura ──');
check('sin alcance no se escribe', !S.catalogScopeAllows(null, 4281));
check('el alcance de un distrito no alcanza a otro', S.catalogScopeAllows({ districts: [4281] }, 4281) && !S.catalogScopeAllows({ districts: [4281] }, 4271));
check('el operador de la plataforma alcanza a todos', S.catalogScopeAllows({ all: true }, 5000));

console.log('\n── Alcance: el equipo del SITIO distrital administra; un club no (v4.1270) ──');
const D4281 = { id: 'd4281', number: 4281, name: 'Distrito 4281', subdomain: 'rotary4281', domain: 'rotary4281.org' };
const sc = (user, site, districts = [D4281]) => S.catalogScopeFromRecords({ user, site, districts }).scope?.districts?.join() || null;
check('sitio tipo district enlazado sólo por el número en Club.district (sin districtId)',
    sc({ role: 'club_admin', clubId: 's1' }, { id: 's1', name: 'Rotary 4281', type: 'district', districtId: null, district: '4281' }) === '4281');
check('sitio «Distrito Rotario» enlazado por subdominio, District sin número',
    sc({ role: 'club_admin', clubId: 's1' }, { id: 's1', type: 'Distrito Rotario', subdomain: 'rotary4281' }, [{ ...D4281, number: null }]) === '4281');
check('sitio tipo district con los dígitos sólo en el subdominio («rotary4281»)',
    sc({ role: 'editor', clubId: 's1' }, { id: 's1', type: 'district', subdomain: 'rotary4281' }, [{ ...D4281, subdomain: 'd4281' }]) === '4281');
check('sitio de tipo «club» que lleva el subdominio del distrito', sc({ role: 'club_admin', clubId: 's1' }, { id: 's1', type: 'club', subdomain: 'rotary4281' }) === '4281');
check('sitio donde está asignado el district_admin del distrito', sc({ role: 'club_admin', clubId: 's1' }, { id: 's1', type: 'club', districtId: 'd4281' }, [{ ...D4281, isAdminSite: true }]) === '4281');
check('el sitio de un CLUB que sólo pertenece al distrito NO administra', sc({ role: 'club_admin', clubId: 'pasto' }, { id: 'pasto', name: 'Club Rotario Pasto', type: 'club', districtId: 'd4281', district: '4281', subdomain: 'pasto' }) === null);
check('district_admin sin sitio: su distrito', sc({ role: 'district_admin', districtId: 'd4281' }, null) === '4281');
check('un socio (member) sólo consulta', sc({ role: 'member', clubId: 's1' }, { id: 's1', type: 'district', district: '4281' }) === null);
check('administrator / superadmin: todos', S.catalogScopeFromRecords({ user: { role: 'administrator' } }).scope?.all === true);
check('sin alcance se explica el motivo', /no es el sitio de un distrito/.test(S.catalogScopeFromRecords({ user: { role: 'club_admin' }, site: { name: 'Club Rotario Pasto', type: 'club' }, districts: [D4281] }).reason));

console.log('\n── Buscador: por nombre, ciudad o departamento ──');
const lista = [
    { id: '1', officialName: 'Club Rotario Ibagué', shortName: 'Ibagué', city: 'Ibagué', state: 'Tolima' },
    { id: '2', officialName: 'Club Rotario Honda Ciudad de los Puentes', shortName: 'Honda Ciudad de los Puentes', city: 'Honda', state: 'Tolima' },
    { id: '3', officialName: 'Club Rotario Armenia International', shortName: 'Armenia International', city: 'Armenia', state: 'Quindío', aliases: ['Armenia Internacional'] },
];
check('por departamento («tolima» sin tilde)', S.searchCatalog(lista, 'tolima').length === 2);
check('por ciudad', S.searchCatalog(lista, 'honda')[0].id === '2');
check('por alias', S.searchCatalog(lista, 'armenia internacional')[0]?.id === '3');
check('sin nombre exacto («puentes»)', S.searchCatalog(lista, 'puentes')[0]?.id === '2');

console.log('\n── El catálogo vivo de rotaryClubs.js ──');
const antes4281 = RC.CLUBS_4281;
RC.applyClubCatalogSnapshot({ districts: { 4281: { active: ['Zeta Nuevo', 'Amazonas'], known: [
    { id: 'id-z', name: 'Zeta Nuevo', status: 'activo', names: ['Club Rotario Zeta Nuevo', 'Zeta Viejo'] },
    { id: 'id-a', name: 'Amazonas', status: 'activo', names: [] },
    { id: 'id-i', name: 'Inactivo Uno', status: 'inactivo', names: [] },
] } } });
check('el array del 4281 es el MISMO objeto, reemplazado en sitio', RC.CLUBS_4281 === antes4281 && RC.CLUBS_4281.join() === 'Amazonas,Zeta Nuevo');
check('DISTRICT_CATALOG se actualiza en sitio', RC.DISTRICT_CATALOG.find(d => d.value === '4281').clubs.join() === 'Amazonas,Zeta Nuevo');
check('el 4271, que la base no trajo, conserva la semilla', RC.CLUBS_4271.length === RC.SEED_CLUBS_BY_DISTRICT[4271].length);
check('un alias resuelve al club', RC.resolveCatalogClub('Zeta Viejo', 4281)?.id === 'id-z');
check('un inactivo se reconoce pero no se ofrece', RC.resolveCatalogClub('Inactivo Uno', 4281)?.status === 'inactivo' && !RC.CLUBS_4281.includes('Inactivo Uno'));
const copia = RC.seedDistrictClubs([{ value: '4281', label: 'Distrito 4281', clubs: [...RC.SEED_CLUBS_BY_DISTRICT[4281], 'Agregado A Mano'] }]);
check('la COPIA guardada de la semilla ya no congela: catálogo vivo + lo agregado a mano',
    copia[0].clubs.includes('Zeta Nuevo') && copia[0].clubs.includes('Agregado A Mano') && !copia[0].clubs.includes('Bogotá Chicó'), copia[0].clubs.join(' | '));
check('una lista curada se respeta', RC.seedDistrictClubs([{ value: '4281', label: 'D 4281', clubs: ['Solo Este'] }])[0].clubs.join() === 'Solo Este');
check('una lista vaciada se respeta', RC.seedDistrictClubs([{ value: '4281', label: 'D 4281', clubs: [] }])[0].clubs.length === 0);
check('«clubsSource: custom» se respeta aunque sea copia', RC.seedDistrictClubs([{ value: '4281', label: 'D', clubsSource: 'custom', clubs: [...RC.SEED_CLUBS_BY_DISTRICT[4281]] }])[0].clubs.length === 74);
RC.applyClubCatalogSnapshot({ districts: { 4281: { active: [...RC.SEED_CLUBS_BY_DISTRICT[4281]], known: [] } } });

console.log('\n── El esquema: todo ADD COLUMN está en el atajo ──');
const src = readFileSync(new URL('../server/lib/clubCatalog.js', import.meta.url), 'utf8');
const { OWNED_COLUMNS } = await import('../server/lib/clubCatalog.js');
const addCols = [...src.matchAll(/ADD COLUMN IF NOT EXISTS "?([A-Za-z]+)"?/g)].map(m => m[1]);
check('cada ADD COLUMN figura en OWNED_COLUMNS', addCols.every(c => OWNED_COLUMNS.DistrictClubProfile.includes(c)), addCols.join(','));
check('ningún db.query lleva comilla invertida dentro', !/db\.query\(`[^`]*\\`/.test(src));
const guard = readFileSync(new URL('./db-push-guard.mjs', import.meta.url), 'utf8');
check('ClubCatalogChange está en el guardián de db:push', guard.includes('ClubCatalogChange'));

// ════════════════════════════════════════════════════════════════════
if (!process.env.TEST_DATABASE_URL) {
    console.log('\n(Sin TEST_DATABASE_URL: se omite la integración con la base.)');
} else {
    console.log('\n══ Integración con Postgres ══');
    const db = (await import('../server/lib/db.js')).default;
    await db.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`).catch(() => {});
    await db.query(`DROP TABLE IF EXISTS "DistrictClubProfile", "DistrictClubSubmission", "DistrictClubAccount", "ClubCatalogChange", "GovernorVisit", "Club", "District" CASCADE`);
    await db.query(`DROP TABLE IF EXISTS "User"`);
    await db.query(`CREATE TABLE "District" (id TEXT PRIMARY KEY, number INT, name TEXT, subdomain TEXT, domain TEXT)`);
    await db.query(`CREATE TABLE "Club" (id TEXT PRIMARY KEY, name TEXT, city TEXT, logo TEXT, description TEXT, "districtId" TEXT, district TEXT, subdomain TEXT, domain TEXT, status TEXT DEFAULT 'active', type TEXT DEFAULT 'club')`);
    await db.query(`CREATE TABLE "User" (id TEXT PRIMARY KEY, role TEXT, "clubId" TEXT, "districtId" TEXT)`);
    await db.query(`INSERT INTO "District" VALUES ('d4281', 4281, 'Distrito 4281', 'rotary4281', 'rotary4281.org'), ('d4271', 4271, 'Distrito 4271', 'd4271', NULL)`);
    // Como en producción: el sitio del 4281 SIN districtId, enlazado por el número en Club.district (v4.1270).
    await db.query(`INSERT INTO "Club" (id, name, "districtId", district, subdomain, type) VALUES ('site-4281', 'Rotary Distrito 4281', NULL, '4281', 'rotary4281', 'district'), ('site-pasto', 'Club Rotario Pasto', 'd4281', '4281', 'pasto', 'club')`);

    const CAT = await import('../server/lib/clubCatalog.js');
    const CTRL = await import('../server/controllers/clubCatalogController.js');
    const ERS = await import('../server/lib/eventRegistrationSpec.js');
    const PC = await import('../server/lib/publicClubs.js');
    await CAT.ensureClubCatalogSchema();
    await CAT.refreshClubCatalog({ force: true });

    const { rows: [n0] } = await db.query(`SELECT COUNT(*)::int AS n FROM "DistrictClubProfile"`);
    check('la siembra + reconciliación trae los 74 del 4281 y los 59 del 4271', n0.n === 133, `filas: ${n0.n}`);
    const { rows: [r1] } = await db.query(`SELECT COUNT(*)::int AS n FROM "ClubCatalogChange" WHERE action = 'seed_reconcile'`);
    await CAT.refreshClubCatalog({ force: true });
    check('la reconciliación corre UNA sola vez', r1.n === 1);
    check('el catálogo vivo viene de la base', RC.clubCatalogState().source === 'catalogo-maestro');

    const mockRes = () => { const r = { code: 200, body: null, headers: {} }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.set = (k, v) => { r.headers[k] = v; return r; }; return r; };
    const call = async (fn, req) => { const res = mockRes(); await fn({ query: {}, params: {}, body: {}, headers: {}, ...req }, res); return res; };

    const scope4281 = await CTRL.catalogScopeFor({ role: 'club_admin', clubId: 'site-4281' });
    const scopeClub = await CTRL.catalogScopeFor({ role: 'club_admin', clubId: 'site-pasto' });
    const actor = { id: 'u1', name: 'Admin Distrital' };
    check('el equipo del sitio del 4281 (sin districtId, como en producción) puede escribir', scope4281?.districts?.join() === '4281', JSON.stringify(scope4281));
    const listaAdm = await call(CTRL.adminList, { user: { role: 'club_admin', clubId: 'site-4281' }, query: { district: '4281' } });
    check('…y el panel le habilita «Agregar club»', listaAdm.body?.permissions?.canWrite === true);
    const listaClub = await call(CTRL.adminList, { user: { role: 'club_admin', clubId: 'site-pasto' }, query: { district: '4281' } });
    check('el sitio de un club ve «Sólo consulta» con el motivo', listaClub.body?.permissions?.canWrite === false && /no es el sitio de un distrito/.test(listaClub.body?.permissions?.reason || ''));

    console.log('\n 1. Crear un club desde el administrador');
    const creado = await CAT.createClub({ officialName: 'Club Rotario Mocoa Andino', districtNumber: 4281, city: 'Mocoa', state: 'Putumayo' }, { scope: scope4281, actor });
    check('se crea, con id interno, activo', creado?.id && creado.catalogStatus === 'activo');
    const hist = await CAT.clubHistory(creado.id);
    check('la bitácora registra quién lo creó', hist[0]?.action === 'create' && hist[0]?.actorName === 'Admin Distrital');

    console.log('\n 2. Aparece en Visitas del Gobernador');
    const GV = await import('../server/controllers/governorVisitController.js').catch(e => ({ _err: e }));
    if (GV._err) check('el controlador de visitas carga', false, GV._err.message);
    else {
        await db.query(`CREATE TABLE IF NOT EXISTS "GovernorVisit" (id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, "clubProfileId" TEXT, "clubName" TEXT, "governorName" TEXT, "visitDate" DATE, status TEXT)`);
        const r = await call(GV.getVisitConfig, {});
        check('el selector de la visita lo ofrece', r.body?.clubs?.some(c => c.id === creado.id), `${r.code} ${JSON.stringify(r.body).slice(0, 200)}`);
    }

    console.log('\n 3. Aparece en los formularios de eventos');
    const cat = ERS.rotaryCatalogFor({});
    check('inscripción a eventos (catálogo del sitio)', cat.find(d => d.value === '4281')?.clubs.includes('Mocoa Andino'));
    const override = ERS.rotaryCatalogFor({ rotaryCatalog: { districts: [{ value: '4281', label: 'Distrito 4281', clubs: [...RC.SEED_CLUBS_BY_DISTRICT[4281]] }] } });
    check('…también en un evento que guardó su COPIA de la lista', override[0].clubs.includes('Mocoa Andino'));
    check('Plantillas IA / Aniversarios (publicClubs)', PC.searchPublicClubs('mocoa', 10, '4281').some(c => c.name === 'Mocoa Andino'));

    console.log('\n 4. Puede relacionarse con una cuenta');
    const DC = await import('../server/controllers/districtClubsController.js');
    const cfgDir = await call(DC.getDirectoryConfig, { query: { district: '4281' } });
    check('el catálogo del portal de clubes trae el id del catálogo', cfgDir.body?.officialCatalog?.find(c => c.name === 'Mocoa Andino')?.id === creado.id);

    console.log('\n 5. Proyectos y postulaciones');
    check('convocatoria sin lista propia', RC.seedDistrictClubs([{ value: 'Rotary Distrito 4281', label: 'Rotary Distrito 4281' }])[0].clubs.includes('Mocoa Andino'));
    check('convocatoria con la copia guardada', RC.seedDistrictClubs([{ value: '4281', label: 'D 4281', clubs: [...RC.SEED_CLUBS_BY_DISTRICT[4281]] }])[0].clubs.includes('Mocoa Andino'));

    console.log('\n 6. Cambiar el nombre no rompe los registros anteriores');
    await db.query(`INSERT INTO "GovernorVisit" ("clubProfileId", "clubName", "governorName", "visitDate", status) VALUES ($1, $2, 'Gob', '2026-10-01', 'recibida')`, [creado.id, creado.officialName]);
    const renombrado = await CAT.updateClub(creado.id, { officialName: 'Club Rotario Mocoa Amazónico' }, { scope: scope4281, actor });
    check('mismo id, nombre nuevo', renombrado.id === creado.id && renombrado.shortName === 'Mocoa Amazónico');
    check('el nombre anterior queda como alias', renombrado.aliases.some(a => S.coreName(a) === 'mocoa andino'), JSON.stringify(renombrado.aliases));
    check('un texto histórico («Mocoa Andino») resuelve al mismo club', RC.resolveCatalogClub('Mocoa Andino', 4281)?.id === creado.id);
    const { rows: vis } = await db.query(`SELECT "clubProfileId" FROM "GovernorVisit"`);
    check('la visita sigue apuntando al club', vis[0].clubProfileId === creado.id);
    check('los formularios ya ofrecen el nombre nuevo', RC.CLUBS_4281.includes('Mocoa Amazónico') && !RC.CLUBS_4281.includes('Mocoa Andino'));

    console.log('\n 7. Cambiar el estado no elimina relaciones');
    await CAT.setClubStatus(creado.id, 'inactivo', { scope: scope4281, actor, reason: 'Club disuelto' });
    check('un inactivo deja de ofrecerse', !RC.CLUBS_4281.includes('Mocoa Amazónico'));
    check('pero la fila y la visita siguen ahí', !!(await CAT.clubRow(creado.id)) && (await db.query(`SELECT 1 FROM "GovernorVisit" WHERE "clubProfileId" = $1`, [creado.id])).rows.length === 1);
    if (!GV._err) {
        const r = await call(GV.getVisitConfig, {});
        check('Visitas del Gobernador no lo ofrece para una visita nueva', !r.body.clubs.some(c => c.id === creado.id));
    }
    const det = await call(CTRL.adminDetail, { params: { id: creado.id }, user: { role: 'superadmin' } });
    check('la ficha administrativa cuenta sus referencias', det.body?.references?.governorVisits === 1);
    await CAT.setClubStatus(creado.id, 'activo', { scope: scope4281, actor });
    check('reactivarlo lo vuelve a ofrecer', RC.CLUBS_4281.includes('Mocoa Amazónico'));

    const { rows: [buga] } = await db.query(`SELECT id FROM "DistrictClubProfile" WHERE "shortName" = 'Buga' AND "districtNumber" = 4281`);
    const enDir = async () => (await call(DC.getPublicDirectory, { query: { district: '4281', type: 'rotary' } })).body.clubs.some(c => c.id === buga.id);
    check('el Directorio público muestra un club activo publicado', await enDir());
    await CAT.setClubStatus(buga.id, 'inactivo', { scope: scope4281, actor });
    check('…y lo oculta cuando se inactiva en el catálogo', !(await enDir()));
    await CAT.setClubStatus(buga.id, 'activo', { scope: scope4281, actor });

    console.log('\n 8. Clubes de otros distritos se filtran');
    const pub = await call(CTRL.publicClubs, { query: { district: '4281' } });
    check('el 4281 no trae clubes del 4271', pub.body.clubs.length > 70 && pub.body.clubs.every(c => c.districtNumber === 4281));
    const pub2 = await call(CTRL.publicClubs, { query: { district: '4281,4271' } });
    check('ampliar el filtro trae los dos', pub2.body.clubs.some(c => c.districtNumber === 4271) && pub2.body.clubs.some(c => c.districtNumber === 4281));
    const pubQ = await call(CTRL.publicClubs, { query: { district: '4281', q: 'putumayo' } });
    check('la búsqueda pública encuentra por departamento', pubQ.body.clubs[0]?.id === creado.id);
    check('la respuesta pública no expone notas ni correos', !('adminNotes' in pub.body.clubs[0]) && !('contactEmail' in pub.body.clubs[0]));

    console.log('\n 9. Sin permisos no se modifica el catálogo');
    check('el administrador del sitio de un CLUB sólo consulta', scopeClub === null);
    const intento = await call(CTRL.adminCreate, { user: { role: 'club_admin', clubId: 'site-pasto' }, body: { officialName: 'Club Rotario Pirata', districtNumber: 4281 } });
    check('…y el servidor lo rechaza con 403', intento.code === 403);
    let cruzado = null; try { await CAT.createClub({ officialName: 'Club Rotario Ajeno', districtNumber: 4271 }, { scope: scope4281, actor }); } catch (e) { cruzado = e; }
    check('un administrador del 4281 no crea clubes en el 4271', cruzado?.status === 403);
    const dl = await CTRL.catalogScopeFor({ role: 'district_admin', districtId: 'd4271' });
    check('el administrador del 4271 tiene alcance sólo sobre el 4271', dl?.districts?.join() === '4271');
    let dupNombre = null; try { await CAT.createClub({ officialName: 'Rotary Club Pasto', districtNumber: 4281 }, { scope: scope4281, actor }); } catch (e) { dupNombre = e; }
    check('no se crea un segundo «Pasto» en el mismo distrito (409)', dupNombre?.status === 409);

    console.log('\n10. Búsqueda (también la del móvil: es la misma API)');
    const bq = await call(CTRL.publicClubs, { query: { district: '4281', q: 'ibague' } });
    check('«ibague» sin tilde encuentra los de Ibagué', bq.body.clubs.length >= 4);

    console.log('\n11. Duplicados detectados, no fusionados');
    const dupA = await CAT.createClub({ officialName: 'Club Rotario Pitalito Sur', districtNumber: 4281 }, { scope: scope4281, actor });
    await db.query(`INSERT INTO "DistrictClubProfile" ("districtNumber", "organizationType", "officialName", "shortName", slug) VALUES (4281, 'rotary', 'Rotary Club Pitalito  Sur', 'Pitalito  Sur', 'pitalito-sur-2')`);
    const pares2 = await CAT.duplicateCandidates({ districts: [4281] });
    const par = pares2.find(p => [p.a.officialName, p.b.officialName].includes('Club Rotario Pitalito Sur'));
    check('el par se señala con confianza alta', par?.confidence === 'alta');
    const { rows: siguen } = await db.query(`SELECT COUNT(*)::int AS n FROM "DistrictClubProfile" WHERE "officialName" ILIKE '%pitalito%sur%' AND "mergedIntoId" IS NULL`);
    check('y NADA se fusionó solo', siguen[0].n === 2);
    const otro = par.a.id === dupA.id ? par.b.id : par.a.id;
    await CAT.mergeClubs(otro, dupA.id, { scope: scope4281, actor, reason: 'Misma entidad, confirmado con la secretaría' });
    check('al marcarlo, el duplicado queda inactivo y apuntando al conservado', (await CAT.clubRow(otro)).mergedIntoId === dupA.id);
    check('el id viejo se resuelve al club vigente', (await CAT.resolveClubId(otro)).id === dupA.id);
    await CAT.unmergeClub(otro, { scope: scope4281, actor, reason: 'Error' });
    const deshecho = await CAT.clubRow(otro);
    check('la fusión es reversible', !deshecho.mergedIntoId && deshecho.catalogStatus === 'activo');
    await CAT.dismissDuplicate(otro, dupA.id, { scope: scope4281, actor });
    check('«no son el mismo club» deja de señalarlo', !(await CAT.duplicateCandidates({ districts: [4281] })).some(p => [p.a.id, p.b.id].includes(otro) && [p.a.id, p.b.id].includes(dupA.id)));

    console.log('\n   Importación con revisión');
    const filasImp = [{ 'Nombre oficial': 'Club Rotario Leticia Selva' }, { 'Nombre oficial': 'Club Rotario Neiva', 'ID Rotary': '12345' }];
    const prev = await CAT.previewImport(filasImp, { scope: scope4281, defaultDistrict: 4281, compare: true });
    check('vista previa: uno nuevo y uno que completa el ID', prev.rows[0].status === 'nuevo' && prev.rows[1].status === 'actualiza');
    check('comparación: lista los activos que no vienen en el archivo', prev.missingFromSource.length > 60);
    const com = await CAT.commitImport(filasImp, [1], { scope: scope4281, actor, defaultDistrict: 4281, sourceLabel: 'prueba' });
    const leticia = await CAT.clubRow(com.created[0]?.id);
    check('sólo entra la fila aprobada, como pendiente de verificación', com.created.length === 1 && com.updated.length === 0 && leticia.catalogStatus === 'pendiente_verificacion');
    check('un pendiente no se ofrece en formularios', !RC.CLUBS_4281.includes('Leticia Selva'));

    console.log('\n12. Los formularios existentes siguen funcionando');
    check('el 4271 sigue completo (59)', RC.CLUBS_4271.length === 59, `${RC.CLUBS_4271.length}`);
    check('el 4281 conserva los 74 de siempre + los nuevos activos', RC.SEED_CLUBS_BY_DISTRICT[4281].every(n => RC.CLUBS_4281.includes(n)));
    const cfg = await call(CTRL.adminList, { user: { role: 'superadmin' }, query: { district: '4281' } });
    check('el panel resume el catálogo', cfg.body.summary.total >= 77 && cfg.body.summary.pendientes === 1 && cfg.body.permissions.canWrite);

    await db.pool.end();
}

console.log(`\n${fail ? '✗' : '✓'} ${ok} pasaron, ${fail} fallaron`);
process.exit(fail ? 1 : 0);
