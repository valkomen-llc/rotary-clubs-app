#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Programas — v4.1280.0
// npm run test:programas
//
// Sin base ni red: el criterio puro, la matriz de acceso, la paridad con el
// espejo del navegador, el atajo del ensure, las guardas de las rutas y lo que
// ninguna otra barrera ve (comilla invertida en un SQL, rutas públicas, RBAC
// en los dos archivos, las tablas en el guardián de db:push y en CLAUDE.md).
// El recorrido contra Postgres está en `test-programas-e2e.mjs`.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import * as S from '../server/lib/programSpec.js';
import { abilitiesFor, canSubmitScope, ABILITIES } from '../server/lib/programAccess.js';
import { OWNED_COLUMNS, PROGRAM_TABLES } from '../server/lib/ensureProgramSchema.js';

let n = 0; const malos = [];
const ok = (cond, msg) => { try { assert.ok(cond, msg); n++; console.log(`  ✓ ${msg}`); } catch (e) { malos.push(msg); console.log(`  ✗ ${msg}`); } };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

console.log('── Estados editoriales');
ok(S.EDITORIAL_STATE_IDS.join() === 'borrador,enviado,en_revision,ajustes,aprobado,publicado,archivado', 'siete estados, en orden');
ok(!S.EDITORIAL_STATE_IDS.some(s => S.canTransitionRequest(s, 'publicado')), '«Publicado» no se alcanza por transición: sólo publicando');
ok(S.canTransitionRequest('ajustes', 'enviado') && !S.canTransitionRequest('ajustes', 'aprobado'), 'tras ajustes se reenvía; no se aprueba directo');
ok(S.canTransitionRequest('aprobado', 'en_revision'), 'una aprobación se puede reabrir');
ok(S.requestNeedsReason('ajustes') && S.requestNeedsReason('archivado') && !S.requestNeedsReason('aprobado'), 'ajustes y archivo exigen motivo');
ok(S.canPublishRequest('aprobado') && !S.canPublishRequest('enviado'), 'sólo se publica lo aprobado');
ok(S.TRANSITION_ABILITY.aprobado === 'approve' && S.TRANSITION_ABILITY.ajustes === 'review', 'cada transición pide su acción');

console.log('── Solicitudes públicas: estados');
ok(S.REQUEST_STATE_IDS.join() === 'nueva,asignada,en_contacto,derivada,cerrada', 'cinco estados');
ok(S.canTransitionPublicRequest('nueva', 'cerrada') && S.canTransitionPublicRequest('cerrada', 'nueva') && !S.canTransitionPublicRequest('derivada', 'nueva'), 'transiciones autorizadas');
ok(S.marksFirstContact('en_contacto') && !S.marksFirstContact('asignada'), 'el primer contacto se marca al pasar a «En contacto»');

console.log('── Revisión médica por tipo');
ok(!S.requestNeedsMedicalReview({ kind: 'team', payload: { clinical: true } }), 'un integrante del equipo nunca pasa por revisión médica');
ok(!S.requestNeedsMedicalReview({ kind: 'correction', payload: { proposed: 'x' } }), 'una corrección administrativa no la recorre');
ok(S.requestNeedsMedicalReview({ kind: 'correction', payload: { proposed: 'x', clinical: true } }), 'una corrección de texto clínico sí');
ok(S.requestNeedsMedicalReview({ kind: 'info', payload: { care: { guidancePath: 'ruta' } } }) && !S.requestNeedsMedicalReview({ kind: 'info', payload: { identity: { name: 'x' } } }), 'info: sólo si toca ruta, condiciones o costos');
ok(S.requestNeedsMedicalReview({ kind: 'clinic', payload: { careConditions: 'texto' } }) && !S.requestNeedsMedicalReview({ kind: 'clinic', payload: { name: 'x' } }), 'clínica: sólo con condiciones de atención');
ok(S.requestNeedsMedicalReview({ kind: 'resource', payload: { clinical: true } }) && !S.requestNeedsMedicalReview({ kind: 'resource', payload: {} }), 'recurso: sólo si se clasifica como clínico');

console.log('── El programa: borrador y publicación');
const base = S.shapeProgram({ name: 'Clínicas Ponseti', summary: 'x'.repeat(50), description: 'y'.repeat(130), category: 'salud', heroImageUrl: 'https://cdn.x/h.jpg', heroImageAlt: 'alt',
    governance: { coordinator: { name: 'Ana', email: 'ana@x.org' }, institutionalEmail: 'info@x.org', lastVerifiedAt: '2026-11-01' } });
ok(base.slug === 'clinicas-ponseti' && base.status === 'borrador', 'slug sin acentos y nace en borrador');
ok(S.validateProgramDraft(S.shapeProgram({ name: 'Solo nombre' })).ok, 'para guardar basta el nombre');
ok(!S.validateProgramDraft(S.shapeProgram({ name: 'X' })).ok, 'sin nombre real no se guarda');
ok(!S.validateProgramDraft(S.shapeProgram({ name: 'Admin', slug: 'admin' })).ok, 'un slug reservado se rechaza');
ok(S.validateProgramForPublish(base).ok, 'un programa completo cumple los requisitos de publicación');
ok(!S.validateProgramForPublish(S.shapeProgram({ ...base, pendingValidation: ['¿Cuántas clínicas hay?'] })).ok, 'con pendientes de validación no se publica');
ok(!S.validateProgramForPublish(S.shapeProgram({ ...base, care: { costsText: 'Es gratis' } })).ok, 'un texto de costos sin aprobar impide publicar');
ok(!S.validateProgramForPublish(S.shapeProgram({ ...base, partners: [{ name: 'F', logoUrl: 'https://x.org/l.png', logoAuthorized: false }] })).ok, 'un logo de aliado sin autorización impide publicar');
ok(S.shapeProgram({ ...base, social: { facebook: 'javascript:alert(1)', instagram: 'instagram.com/x' } }).social.facebook === undefined, 'una red con esquema peligroso se descarta');
const secs = S.shapeSections([{ key: 'impacto', enabled: false }, { key: 'impacto' }, { key: 'nada' }]);
ok(secs.length === S.SECTION_KEYS.length && secs[0].key === 'impacto' && secs[0].enabled === false && secs.filter(s => s.key === 'impacto').length === 1, 'secciones: cada clave una vez, en orden, con las que faltan al final');

console.log('── Vista pública del programa');
const pv = S.publicProgramView({ ...base, governance: { ...base.governance, institutionalPhone: '300', institutionalEmailPublic: false, coordinator: { name: 'Ana', email: 'ana@x.org', public: false } }, requestRouting: { orientacion: { assigneeUserId: 'u1' } }, pendingValidation: ['x'], care: { ...base.care, costsText: 'gratis', costsApproved: false }, partners: [{ name: 'F', logoUrl: 'https://x.org/l.png', logoAuthorized: false }] });
ok(pv.contact.email === '' && pv.contact.phone === '' && pv.contact.coordinatorName === '', 'correos y teléfonos no públicos no salen');
ok(pv.requestRouting === undefined && pv.pendingValidation === undefined, 'el enrutamiento y los pendientes no salen');
ok(pv.care.costsText === '', 'un texto de costos sin aprobar no sale');
ok(pv.partners[0].logoUrl === '', 'un logo sin autorización no sale');

console.log('── Secciones que se pintan');
const rs = S.renderableSections({ ...base, sections: S.defaultSections() }, { counts: { clinic: 2 }, hasPartners: false });
ok(rs.map(s => s.key).includes('clinicas') && !rs.map(s => s.key).includes('historias') && !rs.map(s => s.key).includes('aliados'), 'una sección sin contenido no se pinta');
ok(S.renderableSections({ ...base, description: '' }, {}).every(s => s.key !== 'programa'), 'sin descripción no hay sección «El programa»');

console.log('── Contenidos: forma, validación y visibilidad');
const clinic = S.shapeContent('clinic', { name: 'Hospital X', city: 'Cali', region: 'Valle', verifiedAt: '2026-10-01', verifiedBy: 'Ana', internal: { phone: '300', notes: 'interno' }, url: 'hospital.org' });
ok(S.validateContent('clinic', clinic).ok && clinic.url === 'https://hospital.org/', 'una clínica válida y su enlace normalizado');
ok(!S.validateContent('clinic', S.shapeContent('clinic', { name: 'H', city: 'Cali', region: 'Valle' })).ok, 'sin verificación no se guarda una clínica');
const pcv = S.publicContentView({ id: 'c1', kind: 'clinic', data: clinic });
ok(pcv.internal === undefined && !JSON.stringify(pcv).includes('interno'), 'los datos internos de una clínica nunca salen al público');
ok(!S.isPubliclyVisible('clinic', { ...clinic, active: false }), 'una clínica inactiva no se ve');
const team = S.shapeContent('team', { name: 'Dra. X', role: 'Ortopedista', publishAuthorized: false });
ok(S.validateContent('team', team).ok && !S.validateContent('team', team, { publish: true }).ok, 'sin autorización se guarda pero no se publica');
ok(!S.isPubliclyVisible('team', team) && S.isPubliclyVisible('team', { ...team, publishAuthorized: true }), 'visibilidad pública sólo con autorización');
const story = S.shapeContent('story', { title: 'Historia', summary: 'x'.repeat(25), usagePermission: true, media: [{ url: 'https://x.org/a.jpg', alt: 'a', permissionGranted: false, authorizationFileId: 'f1' }, { embedUrl: 'https://youtu.be/abcdefgh', permissionGranted: true }] });
ok(story.media.length === 2 && story.media[1].kind === 'embed' && story.media[1].embed.provider === 'youtube', 'una historia admite imagen y embebido');
ok(!S.validateContent('story', story, { publish: true }).ok, 'una pieza sin permiso impide publicar la historia');
const spv = S.publicContentView({ id: 's1', kind: 'story', data: story });
ok(spv.media.length === 1 && !JSON.stringify(spv).includes('authorizationFileId'), 'al público sólo salen las piezas con permiso, sin comprobantes');
const res = S.shapeContent('resource', { title: 'Guía', type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', source: 'Fundación', clinical: true });
ok(res.embed?.provider === 'youtube' && !S.validateContent('resource', res, { publish: true }).ok && S.validateContent('resource', { ...res, medicalApprovedBy: 'Dr', medicalApprovedAt: '2026-10-01' }, { publish: true }).ok, 'un recurso clínico se publica sólo con aprobación médica');
ok(!S.isPubliclyVisible('resource', res) && S.isPubliclyVisible('resource', { ...res, medicalApprovedAt: '2026-10-01' }), 'visibilidad de un recurso clínico');
const ind = S.shapeContent('indicator', { name: 'Niños atendidos', definition: 'Conteo', value: '120', unit: 'niños', mode: 'periodo', period: '2025', source: 'Registro', validatedBy: 'Ana', updatedOn: '2026-10-01' });
ok(S.validateContent('indicator', ind).ok && ind.mode === 'periodo', 'un indicador por período');
ok(!S.validateContent('indicator', S.shapeContent('indicator', { ...ind, definition: 'El niño Juan Pérez fue atendido' })).ok, 'nombres de menores junto a contadores: rechazado');
const don = S.shapeContent('donation', { buttonLabel: 'Donar', url: 'https://fund.org/donar', receiver: 'Fundación X', purpose: 'Pasajes', disclaimer: 'Deducible de impuestos' });
ok(!S.validateContent('donation', don).ok, 'afirmar beneficios tributarios sin texto aprobado: rechazado');
ok(S.validateContent('donation', { ...don, disclaimer: 'Texto aprobado por la fundación' }).ok && !S.validateContent('donation', { ...don, disclaimer: '' }, { publish: true }).ok, 'para publicar una donación hace falta verificación');

console.log('── Embebidos seguros');
ok(S.resolveEmbed('https://youtu.be/dQw4w9WgXcQ?t=5').src.startsWith('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'), 'youtu.be → nocookie');
ok(S.resolveEmbed('https://www.youtube.com/shorts/dQw4w9WgXcQ').id === 'dQw4w9WgXcQ', 'shorts');
ok(S.resolveEmbed('https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk?si=x').src === 'https://open.spotify.com/embed/episode/4rOoJ6Egrf8K2IrywzwOMk', 'spotify episodio');
ok(S.resolveEmbed('https://open.spotify.com/intl-es/show/4rOoJ6Egrf8K2IrywzwOMk').type === 'show', 'spotify show con prefijo de idioma');
ok(S.resolveEmbed('https://vimeo.com/123456789').provider === 'vimeo', 'vimeo');
ok(S.resolveEmbed('<iframe src="https://evil.com"></iframe>') === null && S.resolveEmbed('https://evil.com/embed/x') === null && S.resolveEmbed('javascript:alert(1)') === null, 'HTML, hosts desconocidos y esquemas peligrosos: nada');

console.log('── Solicitud de cambio');
const cr = S.shapeChangeRequest({ kind: 'team', operation: 'crear', scopeType: 'club', clubActivationId: 'a1', title: 'Nueva voluntaria', payload: { name: 'Luisa', role: 'Voluntaria' }, responsibleName: 'Pedro', responsibleEmail: 'p@x.org', authorizations: { imageRights: true } });
ok(S.validateChangeRequest(cr).ok, 'un club propone un integrante local');
ok(!S.validateChangeRequest({ ...cr, kind: 'clinic', payload: S.shapeContent('clinic', {}) }).ok, 'un club no propone clínicas como contenido local');
ok(!S.validateChangeRequest({ ...cr, kind: 'info', payload: { identity: {} } }).ok, 'un club no modifica la información institucional');
ok(S.validateChangeRequest({ ...cr, title: '' }, { submit: false }).errors[0].step === 2 && !S.validateChangeRequest({ ...cr, title: '' }, { submit: false }).ok, 'un borrador sólo pide tipo y título');
ok(!S.validateChangeRequest({ ...cr, operation: 'actualizar', contentId: null }).ok, 'actualizar sin registro: paso 1');
ok(S.validateChangeRequest(S.shapeChangeRequest({ ...cr, operation: 'retirar', contentId: 'c1', payload: { reason: 'Ya no participa en el programa' } })).ok, 'retirar con motivo');
ok(!S.validateChangeRequest({ ...cr, authorizations: { imageRights: false } }).ok, 'equipo sin derechos de imagen: paso 3');
ok(S.payloadChanged({ a: 1 }, { a: 2 }) && !S.payloadChanged({ a: 1 }, { a: 1 }), 'detecta cambio de payload');
const inf = S.shapeChangeRequest({ kind: 'info', operation: 'actualizar', scopeType: 'central', title: 'Costos', payload: { care: { costsText: 'Gratis' }, identity: { name: 'Nuevo nombre' }, basura: 1 }, responsibleName: 'Ana', responsibleEmail: 'a@x.org' });
ok(inf.payload.care && inf.payload.identity && inf.payload.basura === undefined && S.validateChangeRequest(inf).ok, 'info: sólo los bloques conocidos');

console.log('── Formularios públicos: sólo sus campos');
const ori = S.shapePublicRequest('orientacion', { adultName: 'María', city: 'Cali', contactMeans: 'whatsapp', phone: '+57 300 123 4567', reason: 'Mi hijo nació con pie equino', historiaClinica: 'detalle', documento: '123', fotos: ['x'] });
ok(ori.historiaClinica === undefined && ori.documento === undefined && ori.fotos === undefined, 'historia clínica, documentos y fotos se descartan');
ok(S.validatePublicRequest('orientacion', { ...ori, dataConsent: true }).ok, 'orientación válida con consentimiento');
ok(!S.validatePublicRequest('orientacion', ori).ok, 'sin consentimiento no se envía');
ok(!S.validatePublicRequest('orientacion', { ...ori, dataConsent: true, contactMeans: 'correo', email: 'malo' }).ok, 'correo inválido cuando el medio es correo');
const apo = S.shapePublicRequest('apoyo', { entityKind: 'empresa', organization: 'ACME', contactName: 'Luis', email: 'l@acme.com', supportType: 'empresa', dataConsent: true });
ok(S.validatePublicRequest('apoyo', apo).ok && !S.validatePublicRequest('apoyo', { ...apo, organization: '' }).ok, 'apoyo de empresa exige el nombre de la empresa');
const clu = S.shapePublicRequest('club', { clubName: 'Rotary Cali', districtNumber: '4281', responsibleName: 'Ana', email: 'a@x.org', participationType: 'activar', dataConsent: true });
ok(S.validatePublicRequest('club', clu).ok && clu.districtNumber === 4281, 'club válido');
ok(S.shapePublicRequest('novedades', {}) === null, '«novedades» no es una solicitud: es una suscripción aparte');
ok(!S.validateSubscriber(S.shapeSubscriber({ name: 'Ana', email: 'a@x.org' })).ok && S.validateSubscriber(S.shapeSubscriber({ name: 'Ana', email: 'a@x.org', newsletterConsent: true })).ok, 'la suscripción exige su propio consentimiento');
ok(S.PUBLIC_REQUEST_TYPE_IDS.every(t => S.PUBLIC_REQUEST_TYPES[t].subscribes === false), 'ningún formulario de solicitud suscribe a nadie');
const ocv = S.originClubRequestView({ publicRef: 'SP-1', type: 'orientacion', status: 'nueva', createdAt: 'x', data: { adultName: 'María', phone: '300' } });
ok(ocv.data === undefined && !JSON.stringify(ocv).includes('María'), 'el club de origen no ve los datos de la familia');

console.log('── Archivos privados');
ok(S.checkPrivateFileMeta({ filename: 'a.pdf', size: 1000, kind: 'autorizacion' }).ok && !S.checkPrivateFileMeta({ filename: 'a.exe', size: 1000, kind: 'autorizacion' }).ok && !S.checkPrivateFileMeta({ filename: 'a.pdf', size: 1000, kind: 'foto' }).ok, 'formato y clase cerrados');
ok(S.sniffPrivateFile(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]), 'pdf') === 'pdf' && S.sniffPrivateFile(Buffer.from([0x00, 0x01]), 'pdf') === null, 'el tipo real se juzga por los bytes');

console.log('── Referencias');
ok(/^PC-2026-[A-Z2-9]{6}$/.test(S.makeRef('PC', new Date('2026-10-29T12:00:00Z'))), 'PC-AAAA-XXXXXX');
ok(S.dateIso(new Date(2026, 9, 29)) === '2026-10-29' && S.dateIso('29/10/2026') === '', 'fechas sin «Thu Oct 29»');

console.log('── Matriz de acceso (programAccess)');
const prog = { id: 'p1', ownerClubId: 'site-d4281', ownerDistrictNumber: 4281, status: 'activo' };
const links = [{ id: 'l1', districtNumber: 4281, status: 'activa', allowClubActivation: true }, { id: 'l2', districtNumber: 4271, status: 'activa', allowClubActivation: true }];
const op = { userId: 'op', email: 'op@x', role: 'superadmin', operator: true, siteAdmin: true, siteId: null, siteIsDistrict: false, districtNumbers: [] };
const d4281 = { userId: 'd', email: 'd@x', role: 'district_admin', operator: false, siteAdmin: true, siteId: 'site-d4281', siteIsDistrict: true, districtNumbers: [4281] };
const d4290 = { ...d4281, userId: 'd2', siteId: 'site-d4290', districtNumbers: [4290] };
const club = { userId: 'c', email: 'c@x', role: 'club_admin', operator: false, siteAdmin: true, siteId: 'site-club1', siteIsDistrict: false, districtNumbers: [4281] };
const clubOtro = { ...club, userId: 'c2', siteId: 'site-club2', districtNumbers: [4290] };
const act = { id: 'a1', clubId: 'site-club1', status: 'activa', districtNumber: 4281 };
const g = (scope, ctx = {}) => abilitiesFor(scope, prog, { links, members: [], ...ctx });
ok(g(op).all && g(op).abilities.length === ABILITIES.length, 'el operador puede todo');
ok(g(d4281).can('editProgram') && g(d4281).can('publish') && g(d4281).can('manageRequests') && !g(d4281).can('medicalApprove'), 'el administrador distrital administra, aprueba y publica; no aprueba lo clínico');
ok(g(d4290).abilities.length === 0, 'el administrador de OTRO distrito no ve nada');
ok(g({ ...d4281, siteIsDistrict: false }).can('activateClub') === true && !g({ ...d4281, siteIsDistrict: false }).can('editProgram'), 'el sitio de un club del distrito sólo activa');
const gc = g(club, { activation: act });
ok(gc.can('activateClub') && gc.can('localSubmit') && gc.can('viewRequestsSummary') && !gc.can('editProgram') && !gc.can('manageRequests') && !gc.can('publish'), 'el club con activación: local, sin datos de solicitudes, sin publicar');
ok(canSubmitScope(gc, { scopeType: 'club', clubActivationId: 'a1', kind: 'team' }) && !canSubmitScope(gc, { scopeType: 'club', clubActivationId: 'a1', kind: 'clinic' }) && !canSubmitScope(gc, { scopeType: 'club', clubActivationId: 'a1', kind: 'info' }), 'el club propone equipo local; no clínicas ni información institucional');
ok(!canSubmitScope(gc, { scopeType: 'club', clubActivationId: 'a2', kind: 'team' }) && !canSubmitScope(gc, { scopeType: 'central', kind: 'team' }), 'el club no propone para otra activación ni para lo central');
ok(g(clubOtro).abilities.length === 0, 'un club de un distrito sin vinculación no ve el programa');
ok(g(club, { activation: null }).can('activateClub') && !g(club, { activation: null }).can('localSubmit'), 'sin activación el club puede activar pero no proponer');
ok(g({ ...club }, { activation: { ...act, status: 'inactiva' } }).can('activateClub') && g(club, { activation: { ...act, status: 'inactiva' } }).clubActivationIds.length === 0, 'una activación inactiva no habilita contenido local');
const miembro = (roles, extra = {}) => g({ userId: 'm', email: 'm@x', role: 'institutional_user', operator: false, siteAdmin: false, siteId: null, siteIsDistrict: false, districtNumbers: [] }, { members: [{ userId: 'm', email: 'm@x', roles, active: true, scopeType: 'central', ...extra }] });
ok(miembro(['coordinador']).can('approve') && miembro(['coordinador']).can('publish') && miembro(['coordinador']).can('manageMembers') && !miembro(['coordinador']).can('medicalApprove'), 'coordinador: aprueba, publica, gestiona responsables; no es revisor médico');
ok(miembro(['revisor_medico']).can('medicalApprove') && !miembro(['revisor_medico']).can('approve') && !miembro(['revisor_medico']).can('submit'), 'revisor médico: sólo lo médico');
ok(miembro(['gestor_solicitudes']).can('manageRequests') && !miembro(['gestor_solicitudes']).can('submit'), 'gestor de solicitudes: sólo solicitudes');
ok(miembro(['colaborador']).can('submit') && !miembro(['colaborador']).can('review') && !miembro(['colaborador']).can('publish'), 'colaborador: propone, no aprueba ni publica');
ok(miembro(['comunicaciones', 'revisor_medico']).can('publish') && miembro(['comunicaciones', 'revisor_medico']).can('medicalApprove'), 'una persona puede asumir varios perfiles');
ok(miembro(['coordinador'], { active: false }).abilities.length === 0, 'un perfil retirado no abre nada');
ok(abilitiesFor(d4281, { ...prog, ownerClubId: null, ownerDistrictNumber: null }, { links: [{ id: 'l2', districtNumber: 4271, status: 'activa' }], members: [] }).abilities.length === 0, 'sin vinculación con su distrito, el administrador distrital no entra');

console.log('── El atajo del ensure enumera todo ADD COLUMN');
const ensure = read('server/lib/ensureProgramSchema.js');
const adds = [...ensure.matchAll(/ALTER TABLE "(\w+)" ADD COLUMN IF NOT EXISTS "?(\w+)"?/g)].map(m => [m[1], m[2]]);
ok(adds.every(([t, c]) => (OWNED_COLUMNS[t] || []).includes(c)), `los ${adds.length} ADD COLUMN del ensure están en OWNED_COLUMNS`);
ok(PROGRAM_TABLES.length === 13 && [...ensure.matchAll(/CREATE TABLE IF NOT EXISTS "(\w+)"/g)].map(m => m[1]).every(t => PROGRAM_TABLES.includes(t)), 'las trece tablas están en OWNED_COLUMNS');

console.log('── Lo que ninguna otra barrera ve');
for (const f of ['server/lib/programStore.js', 'server/controllers/programController.js', 'server/lib/ensureProgramSchema.js', 'server/lib/programAccess.js']) {
    const src = read(f);
    const sqls = [...src.matchAll(/db\.query\(\s*`([\s\S]*?)`/g)].map(m => m[1]);
    ok(sqls.every(q => !q.includes('`')), `${f}: ninguna comilla invertida dentro de un SQL (${sqls.length} sentencias)`);
}
const routes = read('server/routes/programs.js');
ok(routes.indexOf("'/public/catalogo'") < routes.indexOf("'/public/:slug'") && routes.indexOf("'/admin/list'") < routes.indexOf("'/admin/:id'"), 'literales antes que paramétricas');
ok(/router\.use\(authMiddleware\)/.test(routes) && routes.split('router.use(authMiddleware)')[0].split('\n').filter(l => /router\.(get|post)/.test(l)).every(l => l.includes('lightPublicLimit')), 'todo lo público lleva lightPublicLimit; lo admin va tras authMiddleware');
ok(routes.split('router.use(authMiddleware)')[1].split('\n').filter(l => /router\.(get|post|put|delete)/.test(l)).every(l => /\b(ver|crear|editar|publicar|administrar)\b/.test(l)), 'toda ruta admin pide un permiso programs.*');
const app = read('src/App.tsx');
ok(app.includes('path="/programas"') && app.includes('path="/programas/:slug"') && app.includes('path="/admin/programas"') && app.includes('path="/admin/programas/:id"'), 'las cuatro rutas están en App.tsx');
ok(app.indexOf('path="/programas"') < app.indexOf('path="*"'), 'antes del comodín');
ok(read('server/lib/rbacSpec.js').includes("key: 'programs'") && read('src/lib/rbacSpec.ts').includes('"key": "programs"'), 'el módulo programs está en el RBAC del servidor y en su espejo');
ok(read('server/lib/seoSpec.js').includes("return 'program'") && read('server/lib/seoEntities.js').includes('programMeta'), 'SEO: la página del programa tiene su clase y su ficha');
const guard = read('scripts/db-push-guard.mjs'); const claude = read('CLAUDE.md');
ok(PROGRAM_TABLES.every(t => guard.includes(t)), 'las trece tablas están en el comentario del guardián de db:push');
ok(PROGRAM_TABLES.every(t => claude.includes(`\`${t}\``)), 'las trece tablas están en CLAUDE.md');
ok(read('src/sections/Navbar.tsx').includes('programsNav') && read('server/routes/clubs.js').includes('programsNav'), 'el menú público lee programsNav y by-domain lo sirve');
const api = read('api/index.js');
ok(api.includes("'/api/programas'") && read('server/server.js').includes("'/api/programas'"), 'el router está montado en los dos entrypoints');
const ctrl = read('server/controllers/programController.js');
ok(!/console\.log\([^)]*(adultName|responsibleEmail|\.data\b)/.test(ctrl), 'el controlador no imprime datos personales');

console.log('── Paridad con el espejo del navegador');
try {
    const esbuild = await import('esbuild');
    const out = await esbuild.build({ entryPoints: [new URL('../src/lib/programSpec.ts', import.meta.url).pathname], bundle: true, format: 'esm', write: false, platform: 'neutral', logLevel: 'silent' });
    const M = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    ok(same(Object.keys(M.EDITORIAL_STATES), S.EDITORIAL_STATE_IDS) && same(Object.keys(M.REQUEST_STATES), S.REQUEST_STATE_IDS) && same(Object.keys(M.PROGRAM_STATES), S.PROGRAM_STATE_IDS), 'mismos estados');
    ok(same(M.SECTIONS, S.SECTIONS) && same(M.CONTENT_KINDS, S.CONTENT_KINDS) && same(M.CHANGE_KINDS, S.CHANGE_KINDS) && same(M.OPERATIONS, S.OPERATIONS) && same(M.SCOPE_TYPES, S.SCOPE_TYPES), 'mismas secciones, tipos, operaciones y alcances');
    ok(same(M.PROGRAM_CATEGORIES, S.PROGRAM_CATEGORIES) && same(M.RELATION_TYPES, S.RELATION_TYPES) && same(M.PROGRAM_ROLES, S.PROGRAM_ROLES) && same(M.SUPPORT_TYPES, S.SUPPORT_TYPES) && same(M.CLUB_PARTICIPATION_TYPES, S.CLUB_PARTICIPATION_TYPES) && same(M.CONTACT_MEANS, S.CONTACT_MEANS) && same(M.RESOURCE_TYPES, S.RESOURCE_TYPES), 'mismos catálogos');
    ok(M.DATA_CONSENT_TEXT === S.DATA_CONSENT_TEXT && M.NEWSLETTER_CONSENT_TEXT === S.NEWSLETTER_CONSENT_TEXT, 'mismos textos de consentimiento');
    for (const [from, to] of [['borrador', 'enviado'], ['enviado', 'publicado'], ['ajustes', 'aprobado'], ['aprobado', 'en_revision'], ['archivado', 'borrador']]) ok(M.canTransitionRequest(from, to) === S.canTransitionRequest(from, to), `misma transición ${from} → ${to}`);
    for (const u of ['https://youtu.be/dQw4w9WgXcQ', 'https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk', 'https://evil.com/x', 'https://vimeo.com/123456789']) ok(same(M.resolveEmbed(u), S.resolveEmbed(u)), `mismo embebido para ${u}`);
    const casos = [
        ['orientacion', { adultName: 'María', city: 'Cali', contactMeans: 'correo', email: 'malo', reason: 'x'.repeat(12), dataConsent: true }],
        ['orientacion', { adultName: 'María', city: 'Cali', contactMeans: 'whatsapp', phone: '+573001234567', reason: 'x'.repeat(12), dataConsent: true }],
        ['apoyo', { entityKind: 'empresa', contactName: 'Luis', email: 'l@acme.com', supportType: 'empresa', dataConsent: true }],
        ['club', { clubName: 'Rotary Cali', districtNumber: '4281', responsibleName: 'Ana', phone: '3001234567', participationType: 'activar', dataConsent: false }],
    ];
    for (const [t, raw] of casos) {
        const srv = S.validatePublicRequest(t, S.shapePublicRequest(t, raw)).errors.map(e => e.field).sort();
        const nav = M.validatePublicRequest(t, raw).map(e => e.field).sort();
        ok(same(srv, nav), `misma validación pública (${t}: ${srv.join(',') || 'válida'})`);
    }
    const crCasos = [cr, { ...cr, kind: 'clinic', payload: S.shapeContent('clinic', { name: 'H' }) }, { ...cr, authorizations: {} }, S.shapeChangeRequest({ kind: 'indicator', operation: 'crear', scopeType: 'central', title: 'Ind', payload: { name: 'X' }, responsibleName: 'A', responsibleEmail: 'a@x.org' })];
    for (const c of crCasos) {
        const srv = S.validateChangeRequest(c).errors.map(e => `${e.step}:${e.field}`).sort();
        const nav = M.validateChangeRequestStep(c).map(e => `${e.step}:${e.field}`).sort();
        ok(same(srv, nav), `misma validación por paso de la solicitud (${c.kind}: ${srv.join(',') || 'válida'})`);
    }
} catch (e) {
    console.log(`  (espejo no comparado: ${e.message})`);
}

console.log(`\n${malos.length ? '❌' : '✅'} test:programas — ${n} comprobaciones OK${malos.length ? `, ${malos.length} fallidas:\n   · ${malos.join('\n   · ')}` : ''}`);
process.exit(malos.length ? 1 : 0);
