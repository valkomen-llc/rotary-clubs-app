#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Formulario institucional de programas — prueba pura — v4.1286.0
// npm run test:programas:formulario
//
// Sin base ni red: el esquema y su adaptación por programa, la forma y la
// validación de cada sección, el envío parcial, la identidad pública de las
// historias, los ítems de revisión, el plan que convierte un ítem aprobado
// en solicitudes del flujo editorial, la fusión SIN borrados, la vista
// pública (sin internos, canales autorizados), los archivos (formato real y
// topes) y las barreras del repo.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import * as F from '../server/lib/programIntakeSpec.js';
import * as S from '../server/lib/programSpec.js';

let n = 0; const malos = [];
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { malos.push(m); console.log(`  ✗ ${m}`); } };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const cats = S.PROGRAM_CATEGORIES.map(c => ({ id: c.id, label: c.label }));

console.log('── El formulario se adapta al programa (sin un formulario por iniciativa)');
const ponseti = { name: 'Clínicas Ponseti', category: 'salud', intakeConfig: {} };
const corazon = { name: 'Fundación Pequeño Corazón', category: 'comunidad', intakeConfig: {} };
const fs = F.resolveIntakeForm(ponseti, ponseti.intakeConfig, { categories: cats });
const fg = F.resolveIntakeForm(corazon, corazon.intakeConfig, { categories: cats });
const field = (form, sec, k) => form.sections.find(s => s.k === sec)?.fields.find(f => f.k === k);
ok(fs.health === true && fg.health === false, 'salud por la categoría; un programa comunitario no es de salud');
ok(field(fs, 'atencion', 'audience').l === 'Público al que se dirige' && field(fg, 'atencion', 'audience').l === 'Beneficiarios o participantes', 'etiquetas adaptadas: beneficiarios o participantes fuera de salud');
ok(Boolean(field(fs, 'equipo', 'medicalName')) && !field(fg, 'equipo', 'medicalName'), 'el revisor médico sólo se pide en programas de salud');
ok(!field(fg, 'historias', 'stories').fields.some(f => f.k === 'careProcess') && field(fs, 'historias', 'stories').fields.some(f => f.k === 'careProcess'), 'sin preguntas clínicas innecesarias en programas no médicos');
ok(fs.sections.length === F.INTAKE_SECTIONS.length && fs.sections[0].k === 'remitente', 'las 14 secciones más el remitente, en orden');
ok(field(fs, 'identidad', 'category').opt.length === cats.length, 'la categoría usa las categorías existentes del programa');
const cfg = { vocabulary: 'general', sections: { impacto: { enabled: false }, remitente: { enabled: false } }, fields: { 'identidad.history': { hidden: true }, 'identidad.mission': { required: true, help: 'La misión aprobada por la junta.' }, 'remitente.email': { hidden: true } } };
const fc = F.resolveIntakeForm(ponseti, cfg, { categories: cats });
ok(fc.health === false && !fc.sections.some(s => s.k === 'impacto') && fc.sections.some(s => s.k === 'remitente'), 'configurable: vocabulario forzado y secciones aplicables (el remitente no se puede apagar)');
ok(!field(fc, 'identidad', 'history') && field(fc, 'identidad', 'mission').required === true && field(fc, 'identidad', 'mission').h === 'La misión aprobada por la junta.', 'configurable: campos ocultos, obligatorios y ayudas propias');
ok(Boolean(field(fc, 'remitente', 'email')), 'lo indispensable para identificar un envío no se puede ocultar');

console.log('── Forma de los valores');
const sh = F.shapeIntakeSection('identidad', { name: '  Clínicas   Ponseti ', inventado: 'x', mission: { status: 'no_aplica', text: 'ignorado' }, vision: { status: 'texto', text: '' }, website: 'clinicas.org', startYear: '2015', milestones: [{ _id: 'h1', title: 'Primera clínica', year: 2016 }, { _id: '<script>', title: 'x' }] });
ok(sh.name === 'Clínicas Ponseti' && !('inventado' in sh), 'sólo los campos de la sección; espacios normalizados');
ok(sh.mission.status === 'no_aplica' && sh.mission.text === '' && !('vision' in sh), '«No aplica» se guarda sin texto; un texto vacío no viaja');
ok(sh.website === 'https://clinicas.org/' && sh.startYear === 2015, 'enlace normalizado y año numérico');
ok(sh.milestones.length === 1 && sh.milestones[0]._id === 'h1', 'un registro sin id válido se descarta');
const files = F.shapeIntakeSection('visual', { officialLogo: [{ id: 'f_12345678', description: 'Versión a color', usage: 'Fondos claros', alt: 'no-va' }, { id: 'f_otro0000' }] });
ok(files.officialLogo.length === 1 && files.officialLogo[0].usage === 'Fondos claros' && !('alt' in files.officialLogo[0]), 'archivos: tope por campo y sólo sus metadatos (descripción e indicaciones de uso)');
ok(F.shapeIntakeSection('contacto', { facebook: 'javascript:alert(1)' }).facebook.startsWith('invalid'), 'un enlace no http(s) queda marcado para avisar, nunca se guarda como enlace');

console.log('── Validación: sólo lo indispensable, sección por sección');
const sender = { firstName: 'Ana', lastName: 'Ruiz', email: 'ana@ponseti.org', role: 'Coordinadora', relation: 'coordinacion', clubMode: 'sin_club' };
ok(F.validateIntakeSection(fs, 'remitente', F.shapeIntakeSection('remitente', sender)).length === 0, 'un médico o aliado externo no tiene que elegir club');
ok(F.validateIntakeSection(fs, 'remitente', F.shapeIntakeSection('remitente', { ...sender, clubMode: 'club' })).some(e => e.field === 'clubProfileId'), 'si dice pertenecer a un club, se pide el club del catálogo');
ok(F.validateIntakeSection(fs, 'remitente', {}).length >= 5, 'el remitente siempre se valida (nombres, apellidos, correo, cargo, relación)');
ok(F.validateIntakeSection(fs, 'identidad', {}).length === 0, 'una sección vacía no bloquea nada');
ok(F.validateIntakeSection(fc, 'identidad', { tagline: 'Hola' }).some(e => e.field === 'mission'), 'lo obligatorio configurado se pide cuando la sección trae datos');
const sedes = F.shapeIntakeSection('sedes', { clinics: [{ _id: 'c1', name: 'Hospital X' }, { _id: 'c2', _action: 'actualizar', name: 'Y', city: 'Pasto' }] });
const es = F.validateIntakeSection(fs, 'sedes', sedes);
ok(es.some(e => e.field === 'clinics.c1.city') && es.some(e => e.field === 'clinics.c2._ref'), 'cada registro pide lo mínimo para revisarlo, y una actualización exige elegir el registro (sin duplicados)');
ok(F.validateIntakeSection(fs, 'contacto', F.shapeIntakeSection('contacto', { publicEmail: 'no-es-correo' })).some(e => e.field === 'publicEmail'), 'formato: correo público inválido');

console.log('── Envío parcial');
const intakeVacio = { submissionType: 'carga_inicial', sections: [], sender: F.shapeIntakeSection('remitente', sender), data: {}, consents: { data: true } };
ok(F.validateIntakeSubmit(fs, intakeVacio).some(e => e.section === 'resumen' && /no tiene información/.test(e.message)), 'no se envía un formulario vacío');
const parcial = { ...intakeVacio, data: { identidad: F.shapeIntakeSection('identidad', { summary: 'Programa que acompaña a familias con pie equino varo en el Distrito.' }) } };
ok(F.validateIntakeSubmit(fs, parcial).length === 0, 'una carga inicial con UNA sección se envía: no exige todo en una sesión');
ok(F.validateIntakeSubmit(fs, { ...parcial, consents: {} }).some(e => e.field === 'consents.data'), 'el tratamiento de datos es obligatorio');
const conArchivo = { ...parcial, data: { ...parcial.data, visual: { officialLogo: [{ id: 'f_12345678' }] } } };
ok(F.validateIntakeSubmit(fs, conArchivo).some(e => e.field === 'consents.rights') && F.validateIntakeSubmit(fs, { ...conArchivo, consents: { data: true, rights: true } }).length === 0, 'derechos de uso: sólo si se adjuntan materiales, y aparte del tratamiento de datos');
const act = { ...parcial, submissionType: 'actualizacion', sections: ['identidad', 'sedes'] };
ok(F.validateIntakeSubmit(fs, act).some(e => e.section === 'sedes'), 'en una actualización, una sección elegida y vacía se avisa');
ok(!F.validateIntakeSubmit(fs, { ...act, sections: ['identidad'] }).length, 'lo que no se eligió no bloquea');

console.log('── Historias: identidad pública y autorizaciones');
ok(F.storyIdentityErrors({ identityMode: 'anonima', personName: 'Mateo Rojas', body: 'Mateo llegó a la clínica con tres meses.' }).length === 1, 'una historia anónima no puede nombrar a la persona en el relato');
ok(F.storyIdentityErrors({ identityMode: 'solo_nombre', personName: 'Mateo Rojas', publicName: 'Mateo', body: 'Mateo llegó…' }).length === 0, '«solo el nombre» permite el nombre pero no los apellidos');
ok(F.storyIdentityErrors({ identityMode: 'solo_nombre', personName: 'Mateo Rojas', publicName: 'Mateo', photos: [{ id: 'f_1', caption: 'Mateo Rojas en su control' }] }).length === 1, 'la elección se aplica también a los pies de foto');
ok(F.storyIdentityErrors({ isMinor: true, authStory: true }).some(m => /representante/.test(m)), 'un menor necesita la autorización de su representante');

console.log('── Revisión por ítem y plan hacia el flujo editorial');
const intake = {
    data: {
        identidad: F.shapeIntakeSection('identidad', { name: 'Clínicas Ponseti Colombia', tagline: 'Pasos firmes', mission: { status: 'pendiente' }, summary: 'Resumen suficiente para el catálogo del programa en el distrito.' }),
        sedes: F.shapeIntakeSection('sedes', { clinics: [{ _id: 'c1', name: 'Hospital Infantil', city: 'Pasto', region: 'Nariño', careConditions: 'Sin costo para menores de 2 años', internalName: 'Enfermera jefe', internalPhone: '+57 300 1112233' }, { _id: 'c2', _action: 'actualizar', _ref: 'cont_1', name: 'Clínica Norte', city: 'Cali', verifiedAt: '2026-10-01' }] }),
        historias: F.shapeIntakeSection('historias', { stories: [{ _id: 's1', title: 'Los pasos de Sofía', summary: 'Una historia de acompañamiento y familia.', identityMode: 'seudonimo', publicName: 'Sofía', personName: 'Laura Pérez', authStory: true, authImage: false, photos: [{ id: 'f_foto0001', caption: 'En el parque' }], channels: ['programa', 'distrito'], careProcess: 'Tratamiento con yesos semanales.' }] }),
        testimonios: F.shapeIntakeSection('testimonios', { testimonies: [{ _id: 't1', firstName: 'Carlos', lastName: 'Gómez', mode: 'familiar', text: 'El programa nos devolvió la tranquilidad como familia.', display: 'iniciales', publishAuthorized: true }] }),
        visual: F.shapeIntakeSection('visual', { sponsors: [{ _id: 'p1', name: 'Fundación Amiga', relationType: 'patrocinio', logo: [{ id: 'f_logo0001' }] }] }),
        participacion: F.shapeIntakeSection('participacion', { donations: [{ _id: 'd1', receiver: 'Fundación Ponseti', url: 'https://dona.org', taxClaim: true, purpose: 'Yesos' }] }),
        recursos: F.shapeIntakeSection('recursos', { resources: [{ _id: 'r1', category: 'jornada', title: 'Jornada en Pasto', date: '2026-12-01', location: 'Pasto' }] }),
        contacto: F.shapeIntakeSection('contacto', { instagram: 'instagram.com/ponseti', publicEmail: 'info@ponseti.org', publicHours: 'L-V 8-5' }),
        atencion: F.shapeIntakeSection('atencion', { costsText: 'Gratuito para afiliados', faqs: [{ _id: 'q1', question: '¿Duele?', answer: 'No', clinical: true }] }),
    },
};
const items = F.intakeItems(intake);
const key = (k) => items.find(i => i.key === k);
ok(['identidad', 'sedes:clinics:c1', 'sedes:clinics:c2', 'historias:stories:s1', 'testimonios:testimonies:t1', 'visual:sponsors:p1'].every(k => key(k)), 'un ítem por bloque de campos y uno por registro, con clave estable');
ok(JSON.stringify(F.intakeItems(intake).map(i => i.key)) === JSON.stringify(items.map(i => i.key)), 'las claves no cambian al recalcular (las decisiones se conservan)');
const program = { name: 'Clínicas Ponseti', slug: 'clinicas-ponseti', category: 'salud', partners: [] };
const pid = F.planForItem(key('identidad'), { program });
ok(pid.requests[0].kind === 'info' && pid.requests[0].payload.identity.name === 'Clínicas Ponseti Colombia' && !('slug' in pid.requests[0].payload.identity) && pid.notes.some(x => /slug/.test(x)), 'un cambio de nombre se propone sin tocar la dirección pública');
ok(pid.requests[0].payload.identity.profile.mission.status === 'pendiente', '«Pendiente de suministrar» viaja como tal: nadie inventa una misión');
const pc1 = F.planForItem(key('sedes:clinics:c1'), { program, reviewerFlags: { sourceVerified: true } });
ok(pc1.requests[0].kind === 'clinic' && pc1.requests[0].payload.internal.phone && pc1.requests[0].authorizations.sourceVerified === true, 'la sede nueva lleva su contacto INTERNO aparte y la fuente verificada por quien revisa');
const crc = S.shapeChangeRequest({ ...pc1.requests[0], scopeType: 'central', title: 'Hospital Infantil', responsibleName: 'Ana Ruiz', responsibleEmail: 'ana@ponseti.org' });
ok(S.requestNeedsMedicalReview(crc), 'condiciones de atención → revisión médica (requisito editorial existente)');
ok(S.validateChangeRequest(crc).ok === false, 'sin fecha de verificación la solicitud no se envía: queda como borrador para completarla');
const pc2 = F.planForItem(key('sedes:clinics:c2'), { program, reviewerFlags: { sourceVerified: true } });
ok(pc2.requests[0].operation === 'actualizar' && pc2.requests[0].contentId === 'cont_1', 'la actualización de una sede apunta al registro existente (sin duplicar)');
const ps = F.planForItem(key('historias:stories:s1'), { program, urlOf: () => 'https://cdn.example.org/x.webp', fileIdOf: () => 'pf1' });
const story = S.shapeContent('story', ps.requests[0].payload);
ok(story.format === 'historia' && story.identityMode === 'seudonimo' && story.internal.personName === 'Laura Pérez' && story.usagePermissionScope === 'distrito', 'la historia guarda su identidad pública, el nombre real como interno y sus canales');
ok(story.media[0].permissionGranted === false, 'sin autorización de imagen, la foto no queda autorizada');
ok(S.requestNeedsMedicalReview({ kind: 'story', payload: ps.requests[0].payload }), 'el proceso asistencial de una historia pasa por revisión médica');
const pub = S.publicContentView({ id: 'x', kind: 'story', data: story });
ok(!JSON.stringify(pub).includes('Laura') && pub.personLabel === 'Sofía' && pub.media.length === 0, 'la vista pública aplica el seudónimo, no lleva el nombre real ni la foto sin autorización');
const pt = F.planForItem(key('testimonios:testimonies:t1'), { program });
const tst = S.shapeContent('story', pt.requests[0].payload);
const tpub = S.publicContentView({ id: 't', kind: 'story', data: tst });
ok(tst.format === 'testimonio' && tpub.displayName === 'C. G.' && !JSON.stringify(tpub).includes('Gómez'), 'el testimonio es un registro propio y aparece como se autorizó (iniciales, sin apellido)');
ok(S.visibleOnSite('story', story, 'district') === true && S.visibleOnSite('story', story, 'club') === false && S.visibleOnSite('story', story, 'owner') === true, 'una historia autorizada para programa y distrito no se distribuye a los sitios de clubes');
const pp = F.planForItem(key('visual:sponsors:p1'), { program, urlOf: () => '' });
ok(pp.requests[0].payload.identity.partnersUpsert[0].relationType === 'patrocinio' && pp.requests[0].payload.identity.partnersUpsert[0].logoAuthorized === false && pp.notes.length, 'el patrocinador entra como patrocinio, y su logo sin autorización no se muestra');
const pd = F.planForItem(key('participacion:donations:d1'), { program });
const don = S.shapeContent('donation', pd.requests[0].payload);
ok(don.taxClaimPending === true && !S.validateContent('donation', { ...don, verifiedBy: 'A', verifiedAt: '2026-11-01' }, { publish: true }).ok, 'una afirmación tributaria queda pendiente y bloquea la publicación hasta tener texto aprobado');
const pr = F.planForItem(key('recursos:resources:r1'), { program });
ok(pr.requests[0].kind === 'news' && pr.requests[0].payload.type === 'evento', 'una jornada se aplica a la colección existente de noticias y eventos');
const pco = F.planForItem(key('contacto'), { program });
ok(pco.requests[0].payload.identity.social.instagram && pco.requests[0].payload.governance.institutionalEmailPublic === true, 'redes y contacto público van a la ficha, aparte de los datos del remitente');
const pat = F.planForItem(key('atencion'), { program });
ok(S.requestNeedsMedicalReview(S.shapeChangeRequest({ kind: 'info', payload: pat.requests[0].payload })) && pat.notes.some(x => /SIN aprobar/.test(x)), 'costos o gratuidad: revisión correspondiente; quien envía no se otorga la aprobación');
const pfaq = F.planForItem(key('atencion:faqs:q1'), { program });
ok(S.requestNeedsMedicalReview(S.shapeChangeRequest({ kind: 'info', payload: pfaq.requests[0].payload })), 'una pregunta frecuente clínica pasa por revisión médica');

console.log('── Aplicar fusiona SIN borrar');
const cur = S.shapeProgram({
    name: 'Clínicas Ponseti', slug: 'clinicas-ponseti', summary: 'Resumen vigente', website: 'https://ponseti.org',
    social: { facebook: 'https://facebook.com/ponseti' }, partners: [{ name: 'Fundación Amiga', url: 'https://amiga.org', logoAuthorized: true, logoUrl: 'https://x.org/l.png' }],
    governance: { coordinator: { name: 'Dra. Uno', email: 'uno@p.org' } }, care: { audience: 'Familias', faqs: [{ id: 'q0', question: '¿Cuánto dura?', answer: 'Meses' }] },
    profile: { tagline: 'Antes', mission: { status: 'texto', text: 'Misión vigente' }, milestones: [{ id: 'm1', title: 'Inicio', year: 2015 }] },
});
const merged = S.shapeProgram(S.mergeInfoPayload({ ...cur, id: 'p' }, {
    identity: { name: 'Nuevo nombre', slug: 'otro-slug', profile: { tagline: 'Pasos firmes', milestonesUpsert: [{ id: 'm2', title: 'Clínica en Pasto', year: 2020 }] }, social: { instagram: 'https://instagram.com/p' }, partnersUpsert: [{ name: 'fundación amiga', relationType: 'patrocinio' }] },
    governance: { coordinator: { role: 'Coordinadora' } }, care: { coverage: 'Nariño', faqsUpsert: [{ id: 'q1', question: '¿Duele?', answer: 'No' }] },
}));
ok(merged.slug === 'clinicas-ponseti' && merged.name === 'Nuevo nombre', 'el nombre cambia; la dirección (slug) no');
ok(merged.summary === 'Resumen vigente' && merged.website === 'https://ponseti.org/' && merged.care.audience === 'Familias', 'lo que no viene conserva su valor (un campo omitido no es una orden de borrado)');
ok(merged.social.facebook && merged.social.instagram, 'las redes se fusionan');
ok(merged.partners.length === 1 && merged.partners[0].relationType === 'patrocinio' && merged.partners[0].logoUrl === 'https://x.org/l.png', 'el aliado se actualiza por nombre, sin duplicarse ni perder su logo');
ok(merged.governance.coordinator.name === 'Dra. Uno' && merged.governance.coordinator.role === 'Coordinadora', 'las personas se fusionan campo a campo');
ok(merged.profile.milestones.length === 2 && merged.profile.mission.text === 'Misión vigente' && merged.profile.tagline === 'Pasos firmes', 'hitos por id; la misión vigente se conserva');
ok(merged.care.faqs.length === 2 && merged.care.coverage === 'Nariño', 'preguntas frecuentes por id; cobertura nueva');
const pv = S.publicProgramView({ ...merged, profile: { ...merged.profile, vision: { status: 'no_aplica' }, brand: { privateFiles: [{ fileId: 'pf9' }] } } });
ok(pv.profile.vision === '' && pv.profile.mission === 'Misión vigente' && !JSON.stringify(pv).includes('pf9'), 'la ficha pública no pinta «No aplica» ni expone archivos privados');

console.log('── Archivos: tipo real y topes configurables');
const lim = F.intakeLimits();
ok(F.checkIntakeFile({ filename: 'foto.JPG', size: 5e6, purpose: 'photo' }).ok, 'una foto JPG se admite');
ok(!F.checkIntakeFile({ filename: 'virus.exe', size: 10, purpose: 'media' }).ok && !F.checkIntakeFile({ filename: 'logo.svg', size: 10, purpose: 'photo' }).ok, 'formatos fuera del uso se rechazan antes de subir');
ok(!F.checkIntakeFile({ filename: 'a.jpg', size: lim.image + 1, purpose: 'photo' }).ok && /enlace/.test(F.checkIntakeFile({ filename: 'v.mp4', size: lim.video + 1, purpose: 'media' }).errores[0]), 'el tope se explica y ofrece el enlace externo para videos grandes');
ok(F.checkIntakeFile({ filename: 'v.mp4', size: 300e6, purpose: 'media' }).multipart === true && F.checkIntakeFile({ filename: 'a.jpg', size: 3e6, purpose: 'photo' }).multipart === false, 'archivos grandes → carga multiparte reanudable');
process.env.PROGRAM_INTAKE_IMAGE_MB = '5';
ok(F.intakeLimits().image === 5 * 1024 * 1024, 'los topes se configuran por entorno');
delete process.env.PROGRAM_INTAKE_IMAGE_MB;
ok(F.sniffIntakeFile(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]), 'jpg') === 'jpg' && F.sniffIntakeFile(Buffer.from('%PDF-1.7 xxx'), 'jpg') === null, 'el contenido real manda: un PDF renombrado .jpg no pasa');
ok(F.sniffIntakeFile(Buffer.from('\0\0\0\x18ftypheic\0\0'), 'heic') === 'heic' && F.sniffIntakeFile(Buffer.from('\0\0\0\x18ftypisom\0\0'), 'mp4') === 'mp4', 'HEIC del móvil y MP4 se reconocen por su caja ftyp');
ok(F.sniffIntakeFile(Buffer.from('<?xml version="1.0"?><svg xmlns="x"></svg>'), 'svg') === 'svg' && F.sniffIntakeFile(Buffer.from('<html>'), 'svg') === null, 'SVG reconocido (y queda privado: nunca se publica como tal)');

console.log('── El enlace para continuar');
const t = F.newIntakeToken();
ok(F.isTokenShape(t) && F.newIntakeToken() !== t, 'secreto de 32 bytes, distinto cada vez');
ok(F.hashIntakeToken(t) === F.hashIntakeToken(t) && F.hashIntakeToken(t) !== t && F.hashIntakeToken(t).length === 64, 'sólo se guarda el hash');
ok(!F.isTokenShape('FP-2026-ABC123') && !F.isTokenShape('1'), 'una referencia pública NO abre un borrador (nada de enlaces predecibles)');

console.log('── Barreras del repo');
for (const f of ['server/lib/programIntakeStore.js', 'server/controllers/programIntakeController.js', 'server/lib/ensureProgramSchema.js', 'server/lib/programStore.js']) {
    const src = read(f);
    const sqls = [...src.matchAll(/db\.query\(\s*`([\s\S]*?)`/g)].map(m => m[1]);
    ok(sqls.every(q => !q.includes('`')), `${f}: ninguna comilla invertida dentro de un SQL (${sqls.length})`);
}
const routes = read('server/routes/programs.js');
ok(routes.indexOf("'/public/intake/programas'") < routes.indexOf("'/public/:slug'") && routes.indexOf("'/admin/:id/intake-config'") > routes.indexOf('router.use(authMiddleware)'), 'rutas literales del formulario antes de las paramétricas; las de administración tras la sesión');
ok(routes.split('router.use(authMiddleware)')[0].split('\n').filter(l => /router\.(get|post|put|delete)\('\/public\/intake/.test(l)).every(l => l.includes('lightPublicLimit')), 'todo lo público del formulario lleva lightPublicLimit');
ok(read('src/App.tsx').includes('path="/formulario-programas"'), 'la ruta pública está en App.tsx');
ok(read('src/components/rotary/GovernorVisitForm.tsx').includes("from '../common/InstitutionalFormKit'") && read('src/components/programas/intake/ProgramIntakeForm.tsx').includes("from '../../common/InstitutionalFormKit'"), 'Visitas del Gobernador y el formulario de programas usan las MISMAS piezas visuales');
ok(!/console\.log\([^)]*(sender|email|phone)/.test(read('server/controllers/programIntakeController.js')), 'el controlador no imprime datos del remitente');
ok(!/ProgramMember/.test(read('server/controllers/programIntakeController.js').replace(/\/\/.*$/gm, '').replace(/crea `ProgramMember`/g, '')), 'el formulario no concede perfiles por programa');

console.log(`\n${malos.length ? '❌' : '✅'} test:programas:formulario — ${n} comprobaciones${malos.length ? `, ${malos.length} fallidas:\n   · ${malos.join('\n   · ')}` : ' OK'}`);
process.exit(malos.length ? 1 : 0);
