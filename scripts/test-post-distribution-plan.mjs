#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// DÓNDE SE PUEDE PUBLICAR UNA NOTICIA.  npm run test:posts:distribution
// v4.1243.0
//
// Reporte: en app.clubplatform.org/admin/noticias, «Gestionar destinos de
// distribución» sobre «E-Club Origen apoyó campaña Jaque Mate a la Polio»
// (Origen: Propia, 0 réplicas) decía «Este artículo no tiene sitios de
// distribución asignados» y no ofrecía ninguno. Tenía que decir quién la
// publicó y desde qué distrito, mostrar el sitio activo del club, y ofrecer
// POR DEFECTO el sitio del distrito y COLROTARIOS.
//
// Prueba el criterio (`postDistributionPlan.js`, puro) con los sitios reales
// del reporte, la lectura con un doble de la consulta, y el cableado de la
// ruta, el modal y el editor. Sin base ni red.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    buildDistributionPlan, mergeTargetSelection, nextDistributionStatus, loadDistributionContext,
    isColrotariosSite, pickColrotarios, pickDistrictSite, isActiveSite, siteUrlOf,
} from '../server/lib/postDistributionPlan.js';

let total = 0, passed = 0;
const check = (d, ok) => { total++; if (ok) { passed++; console.log(`  OK    ${d}`); } else { console.error(`  FAIL  ${d}`); process.exitCode = 1; } };

const D4281 = { id: 'd-4281', number: 4281, name: 'Distrito 4281', domain: 'rotary4281.org', subdomain: null };
const D4271 = { id: 'd-4271', number: 4271, name: 'Distrito 4271', domain: null, subdomain: null };
const districts = [D4281, D4271];

const ORIGEN = { id: 'origen', name: 'Rotary E-Club Origen', type: 'club', organizationType: 'Club Rotario', status: 'active', domain: 'rotaryecluborigen.org', district: '4281', city: 'Cali' };
const DIST_SITE = { id: 'dist-4281', name: 'Distrito 4281', type: 'district', status: 'active', domain: 'rotary4281.org', districtId: 'd-4281' };
const COL_SIN_DOMINIO = { id: '899d2755', name: 'COLROTARIOS', type: 'club', status: 'active', domain: null };
const COL = { id: 'de6bd37d', name: 'COLROTARIOS', type: 'club', status: 'active', domain: 'colrotarios.org' };
const PASTO = { id: 'pasto', name: 'Rotary Club Pasto', type: 'club', status: 'active', district: '4281', subdomain: 'pasto', city: 'Pasto' };
const BOGOTA = { id: 'bogota', name: 'Rotary Club Bogotá', type: 'club', status: 'active', district: '4271' };
const BORRADOR = { id: 'borrador', name: 'Club Rotario Prueba Email', type: 'club', status: 'draft', district: '4281' };
const clubs = [ORIGEN, DIST_SITE, COL_SIN_DOMINIO, COL, PASTO, BOGOTA, BORRADOR];

const postOrigen = { id: 'p1', title: 'E-Club Origen apoyó campaña Jaque Mate a la Polio', clubId: 'origen', targetClubIds: [], published: true, distributionStatus: {} };
const operador = { role: 'administrator', clubId: null };
const adminOrigen = { role: 'club_admin', clubId: 'origen' };

console.log('\n▸ COLROTARIOS y los sitios');
check('COLROTARIOS se reconoce por el nombre', isColrotariosSite(COL_SIN_DOMINIO));
check('…por el tipo', isColrotariosSite({ name: 'Fundación', type: 'colrotarios' }));
check('…por el dominio', isColrotariosSite({ name: 'Fundación Colombiana', domain: 'colrotarios.org' }));
check('un club cualquiera no es COLROTARIOS', !isColrotariosSite(PASTO));
check('de las dos filas COLROTARIOS gana la que tiene dominio', pickColrotarios(clubs)?.id === 'de6bd37d');
check('una COLROTARIOS en borrador no se ofrece', pickColrotarios([{ ...COL, status: 'draft' }]) === null);
check('el sitio del distrito se encuentra por su distrito', pickDistrictSite(clubs, D4281)?.id === 'dist-4281');
check('un sitio sin estado (antiguo) cuenta como activo', isActiveSite({ status: null }));
check('un sitio en borrador no cuenta como activo', !isActiveSite(BORRADOR));
check('la dirección usa el dominio propio', siteUrlOf(COL) === 'https://colrotarios.org');
check('…o el subdominio de la plataforma', siteUrlOf(PASTO) === 'https://pasto.clubplatform.org');

console.log('\n▸ El caso del reporte (operador en Club Platform)');
const plan = buildDistributionPlan({ post: postOrigen, clubs, districts, user: operador });
check('dice quién la publicó: Rotary E-Club Origen', plan.publisher.name === 'Rotary E-Club Origen');
check('dice desde qué distrito: Distrito 4281', plan.publisher.districtName === 'Distrito 4281');
check('el sitio de origen aparece, fijo, con su dirección', plan.origin?.id === 'origen' && plan.origin.locked && plan.origin.url === 'https://rotaryecluborigen.org');
check('el distrito aparece por defecto', plan.featured.some((f) => f.id === 'dist-4281' && f.role === 'district' && f.isDefault));
check('COLROTARIOS aparece por defecto', plan.featured.some((f) => f.id === 'de6bd37d' && f.role === 'colrotarios' && f.isDefault));
check('sin destinos todavía, vienen preseleccionados el distrito y COLROTARIOS', JSON.stringify(plan.selected) === JSON.stringify(['dist-4281', 'de6bd37d']));
check('el operador ve los demás sitios activos del ecosistema', plan.others.some((o) => o.id === 'pasto') && plan.others.some((o) => o.id === 'bogota'));
check('los del distrito de la noticia van primero', plan.others.findIndex((o) => o.id === 'pasto') < plan.others.findIndex((o) => o.id === 'bogota'));
check('un sitio en borrador no se ofrece', !plan.others.some((o) => o.id === 'borrador'));
check('el sitio de origen no se repite como destino', !plan.others.some((o) => o.id === 'origen') && !plan.featured.some((f) => f.id === 'origen'));
check('ni el distrito ni COLROTARIOS se repiten abajo', !plan.others.some((o) => o.id === 'dist-4281' || o.id === 'de6bd37d'));
check('la otra fila COLROTARIOS (sin dominio) sí queda elegible pero no como la principal', plan.featured.filter((f) => f.role === 'colrotarios').length === 1);
check('se puede gestionar', plan.canManage && plan.notices.length === 0);

console.log('\n▸ El administrador del club dueño');
const planClub = buildDistributionPlan({ post: postOrigen, clubs, districts, user: adminOrigen });
check('puede elegir el distrito y COLROTARIOS', planClub.canManage && planClub.allowedIds.sort().join(',') === ['de6bd37d', 'dist-4281'].sort().join(','));
check('no reparte a otros clubes', planClub.others.length === 0);
check('ve igualmente quién la publicó y desde qué distrito', planClub.publisher.label === 'Rotary E-Club Origen · Distrito 4281');
const ajeno = buildDistributionPlan({ post: postOrigen, clubs, districts, user: { role: 'club_admin', clubId: 'pasto' } });
check('el admin de OTRO club no puede gestionarla, y se le dice por qué', !ajeno.canManage && !!ajeno.reason && ajeno.allowedIds.length === 0);

console.log('\n▸ El administrador de distrito');
const planDist = buildDistributionPlan({ post: postOrigen, clubs, districts, user: { role: 'district_admin', districtId: 'd-4281' } });
check('ve los sitios de su distrito', planDist.others.some((o) => o.id === 'pasto'));
check('no ve los de otro distrito', !planDist.others.some((o) => o.id === 'bogota'));
check('COLROTARIOS sigue por defecto aunque no sea del distrito', planDist.featured.some((f) => f.role === 'colrotarios'));

console.log('\n▸ Una noticia del propio distrito');
const planDelDistrito = buildDistributionPlan({ post: { ...postOrigen, clubId: 'dist-4281' }, clubs, districts, user: operador });
check('el distrito no se ofrece como destino de sí mismo', !planDelDistrito.featured.some((f) => f.role === 'district'));
check('COLROTARIOS sí, por defecto', planDelDistrito.featured.some((f) => f.role === 'colrotarios') && planDelDistrito.selected.includes('de6bd37d'));

console.log('\n▸ Una central de Club Platform');
const central = { id: 'p2', title: 'Central', clubId: null, targetClubIds: ['pasto'], sourceDistrictId: 'd-4281', published: true };
const planCentral = buildDistributionPlan({ post: central, clubs, districts, user: operador });
check('la publicó Club Platform, desde el Distrito 4281', planCentral.publisher.name === 'Club Platform' && planCentral.publisher.districtName === 'Distrito 4281');
check('con destinos ya guardados, se respetan (no se imponen los por defecto)', JSON.stringify(planCentral.selected) === '["pasto"]' && planCentral.defaults.length === 0);
const vaciar = mergeTargetSelection(planCentral, central, []);
check('quitarle todos los destinos se rechaza: pasaría a verse en TODOS los sitios', !vaciar.ok && vaciar.status === 409);

console.log('\n▸ Guardar');
const g1 = mergeTargetSelection(plan, postOrigen, ['dist-4281', 'de6bd37d', 'origen']);
check('guarda el distrito y COLROTARIOS', g1.ok && g1.targets.join(',') === 'dist-4281,de6bd37d');
check('el sitio de origen nunca se guarda como destino', !g1.targets.includes('origen'));
check('dice qué se añadió', g1.added.length === 2 && g1.removed.length === 0);
const conPasto = { ...postOrigen, targetClubIds: ['pasto'] };
const planClubConPasto = buildDistributionPlan({ post: conPasto, clubs, districts, user: adminOrigen });
const g2 = mergeTargetSelection(planClubConPasto, conPasto, ['de6bd37d']);
check('el club no borra en silencio un destino que puso el distrito', g2.ok && g2.targets.includes('pasto') && g2.kept.includes('pasto'));
check('y añade COLROTARIOS', g2.targets.includes('de6bd37d'));
const g3 = mergeTargetSelection(planClub, postOrigen, ['bogota']);
check('un sitio que la sesión no puede elegir se rechaza y se dice', g3.rejected.includes('bogota') && !g3.targets.includes('bogota'));
const g4 = mergeTargetSelection(plan, { ...postOrigen, targetClubIds: ['pasto', 'de6bd37d'] }, ['de6bd37d']);
check('el operador sí puede quitar un destino', g4.ok && g4.removed.includes('pasto') && g4.targets.join(',') === 'de6bd37d');

console.log('\n▸ El estado por destino');
const prev = { id: 'p', published: true, distributionStatus: { pasto: { status: 'pending_approval', syncMode: 'synced' }, viejo: { status: 'published' } } };
const st = nextDistributionStatus(prev, ['pasto', 'de6bd37d'], '2026-10-24T00:00:00.000Z');
check('conserva el estado de un destino que sigue', st.pasto.status === 'pending_approval');
check('abre el de uno nuevo como publicado', st.de6bd37d.status === 'published' && st.de6bd37d.distributedAt === '2026-10-24T00:00:00.000Z');
check('quita el de uno que ya no está', !('viejo' in st));
check('una noticia en borrador abre sus destinos en borrador', nextDistributionStatus({ published: false }, ['x']).x.status === 'draft');

console.log('\n▸ La lectura');
const consultas = [];
const fakeQuery = async (sql, params) => {
    consultas.push(sql);
    if (/FROM "Post"/.test(sql)) return { rows: params[0] === 'p1' ? [postOrigen] : [] };
    if (/FROM "Club"/.test(sql)) return { rows: clubs };
    if (/FROM "District"/.test(sql)) return { rows: districts };
    return { rows: [] };
};
const ctx = await loadDistributionContext(fakeQuery, 'p1');
check('lee la noticia, los sitios y los distritos', ctx.post?.id === 'p1' && ctx.clubs.length === clubs.length && ctx.districts.length === 2);
const vacio = await loadDistributionContext(fakeQuery, 'no-existe');
check('una noticia inexistente devuelve post null sin consultar más', vacio.post === null && vacio.clubs.length === 0);
check('ninguna consulta lleva comillas invertidas', consultas.every((q) => !q.includes('`')));

console.log('\n▸ El cableado');
const routes = readFileSync(new URL('../server/routes/admin.js', import.meta.url), 'utf8');
check('GET /posts/:id/distribution está registrada', /router\.get\('\/posts\/:id\/distribution', roleMiddleware\(contentRoles\), getPostDistributionPlan\)/.test(routes));
check('PUT /posts/:id/distribution está registrada', /router\.put\('\/posts\/:id\/distribution', roleMiddleware\(contentRoles\), savePostDistribution\)/.test(routes));
const ctrl = readFileSync(new URL('../server/controllers/contentController.js', import.meta.url), 'utf8');
check('el guardado decide con el mismo plan que se muestra', /savePostDistribution[\s\S]*buildDistributionPlan[\s\S]*mergeTargetSelection/.test(ctrl));
check('el guardado no toca el clubId (el origen sigue siéndolo)', !/savePostDistribution[\s\S]{0,2500}"clubId" =/.test(ctrl.slice(ctrl.indexOf('export const savePostDistribution'))));
check('el editor del distrito acepta COLROTARIOS como destino', /resolveAllowedTargets[\s\S]*isColrotariosSite\(c\)[\s\S]*allowedIds\.push/.test(ctrl));
check('la lista de destinos del editor dice cuál es COLROTARIOS', /colrotariosId: colrotarios\?\.id \|\| null/.test(ctrl));
const modal = readFileSync(new URL('../src/components/admin/news/DistributionTraceabilityModal.tsx', import.meta.url), 'utf8');
check('el modal pide el plan de la noticia', /\/admin\/posts\/\$\{post\.id\}\/distribution`/.test(modal));
check('el modal guarda con PUT', /method: 'PUT'/.test(modal));
check('el modal dice quién la publicó y desde qué distrito', /Publicado por:/.test(modal) && /publisher\.districtName/.test(modal));
check('el modal ya no manda a otro sitio a elegir los destinos', !/no tiene sitios de distribución asignados/.test(modal));
check('el modal lee las respuestas sin .json() a ciegas', /leerJson/.test(modal) && !/\.json\(\)/.test(modal));
check('«Retirar» quita el sitio de los destinos (antes sólo marcaba un estado que el público no mira)', /handleRetire[\s\S]{0,900}\/distribution`[\s\S]{0,200}method: 'PUT'/.test(modal) && !/distribution\/target-status/.test(modal));
check('SiteRow está declarado fuera del modal', modal.indexOf('const SiteRow') < modal.indexOf('export const DistributionTraceabilityModal'));
const news = readFileSync(new URL('../src/pages/admin/News.tsx', import.meta.url), 'utf8');
check('el club dueño también ve el botón de distribución', /canDistribute \|\| \(post\.origin === 'own'/.test(news));
check('una noticia nueva desde un sitio trae COLROTARIOS marcado', /targetClubIds: \(canDistribute && colrotariosId && club\?\.id/.test(news));
const tab = readFileSync(new URL('../src/components/admin/news/DistributionTab.tsx', import.meta.url), 'utf8');
check('el editor ofrece COLROTARIOS junto al distrito, «Por defecto»', /Publicar también en \{colrotariosTarget\.name\}/.test(tab));

console.log(`\n${passed}/${total} comprobaciones`);
if (passed !== total) process.exitCode = 1;
