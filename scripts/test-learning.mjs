#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Cursos y capacitaciones (LMS) — criterio e invariantes (v4.1302.0)
// npm run test:learning — sin base ni red. Corre en `prebuild`.
//
// 1. El CRITERIO puro: estados y transiciones, preparación para enviar (lista
//    nominal), estado derivado, acceso por modalidad, archivos y enlaces,
//    saneado de PATCH, configuración.
// 2. INVARIANTES leídas de los archivos: todo ADD COLUMN enumerado, un solo
//    sitio escribe `status`, rutas y menú existen, la taxonomía se renombró
//    en los dos espejos, las tablas están en la lista del guardián y de
//    CLAUDE.md.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const read = (p) => readFileSync(`${REPO}/${p}`, 'utf8');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

const S = await import(`${REPO}/server/lib/learningSpec.js`);
const { OWNED_COLUMNS } = await import(`${REPO}/server/lib/ensureLearningSchema.js`);

// ─── 1. Estados y transiciones ────────────────────────────────────────
eq(Object.keys(S.COURSE_STATES), ['draft', 'in_review', 'changes_requested', 'approved', 'published', 'archived'], 'seis estados de flujo');
ok(S.canTransition(S.CLUB_TRANSITIONS, 'draft', 'in_review'), 'el club envía un borrador');
ok(S.canTransition(S.CLUB_TRANSITIONS, 'changes_requested', 'in_review'), 'el club reenvía tras correcciones');
ok(S.canTransition(S.CLUB_TRANSITIONS, 'in_review', 'draft'), 'el club retira de la revisión');
ok(!S.canTransition(S.CLUB_TRANSITIONS, 'draft', 'published'), 'el club NUNCA publica');
ok(!S.canTransition(S.CLUB_TRANSITIONS, 'draft', 'approved'), 'el club NUNCA aprueba');
ok(!S.canTransition(S.CLUB_TRANSITIONS, 'published', 'draft'), 'un curso publicado no vuelve a borrador por el club');
ok(S.canTransition(S.ADMIN_TRANSITIONS, 'in_review', 'approved') && S.canTransition(S.ADMIN_TRANSITIONS, 'in_review', 'changes_requested'), 'el comité aprueba o pide correcciones');
ok(S.canTransition(S.ADMIN_TRANSITIONS, 'approved', 'published'), 'publicar exige haber aprobado');
ok(!S.canTransition(S.ADMIN_TRANSITIONS, 'in_review', 'published'), 'NO se publica directo desde la revisión');
ok(!S.canTransition(S.ADMIN_TRANSITIONS, 'draft', 'published') && !S.canTransition(S.ADMIN_TRANSITIONS, 'draft', 'approved'), 'un borrador no se aprueba ni publica: el club decide cuándo enviar');
ok(S.canTransition(S.ADMIN_TRANSITIONS, 'published', 'approved'), 'despublicar vuelve a aprobado');
ok(S.NOTE_REQUIRED.has('changes_requested'), 'pedir correcciones exige motivo');
eq(S.CLUB_EDITABLE, ['draft', 'changes_requested'], 'el club edita en borrador y correcciones');
for (const st of Object.keys(S.COURSE_STATES)) { ok(Array.isArray(S.CLUB_TRANSITIONS[st]) && Array.isArray(S.ADMIN_TRANSITIONS[st]), `tablas completas para ${st}`); }

// ─── 2. Preparación para enviar ───────────────────────────────────────
const vacio = S.readinessOf({ title: '', accessMode: 'public' }, {});
ok(!vacio.ready && vacio.missing.length >= 3, 'un curso vacío no está listo');
ok(vacio.missing.every(m => m.key && m.label), 'lo que falta se dice con nombre');
ok(vacio.missing.some(m => m.key === 'rights'), 'la declaración de derechos se exige por omisión');
ok(vacio.total === vacio.requirements.length && vacio.done <= vacio.total, 'la cuenta de requisitos es honesta');
const listo = S.readinessOf(
    { title: 'Introducción a la seguridad alimentaria', shortDescription: 'Conceptos básicos para cultivar en casa.', accessMode: 'public', rightsAccepted: true },
    { lessons: [{ id: 'l1', videoFileId: 'f1' }], files: [{ id: 'f1', status: 'ready' }] });
ok(listo.ready && listo.missing.length === 0, 'título + descripción + una lección con video + acceso + derechos = listo');
ok(listo.warnings.some(w => /portada/i.test(w)), 'sin portada se recomienda, no se bloquea');
const sinContenido = S.readinessOf({ title: 'Curso', shortDescription: 'Descripción suficientemente larga para pasar.', accessMode: 'public', rightsAccepted: true }, { lessons: [{ id: 'l1', body: 'corto' }], files: [] });
ok(!sinContenido.ready && sinContenido.missing.some(m => m.key === 'lesson'), 'una lección sin contenido real no cuenta');
const subiendo = S.readinessOf({ title: 'Curso', shortDescription: 'Descripción suficientemente larga para pasar.', accessMode: 'public', rightsAccepted: true }, { lessons: [{ id: 'l1', videoFileId: 'f1' }], files: [{ id: 'f1', status: 'uploading' }] });
ok(!subiendo.ready, 'un video todavía en carga no es contenido');
ok(S.lessonHasContent({ id: 'l', body: 'x'.repeat(40) }), 'texto de 40 caracteres es contenido');
ok(S.lessonHasContent({ id: 'l', videoUrl: 'https://youtu.be/abc123def' }), 'un enlace externo es contenido');
ok(S.lessonHasContent({ id: 'l' }, { f: { status: 'ready' } }, [{ lessonId: 'l', fileId: 'f' }]), 'un documento listo en la lección es contenido');
const sinDerechos = S.readinessOf({ title: 'Curso completo', shortDescription: 'Descripción suficientemente larga para pasar.', accessMode: 'public', rightsAccepted: false }, { lessons: [{ id: 'l1', body: 'x'.repeat(50) }] }, S.normalizeConfig({ requireRights: false }));
ok(sinDerechos.ready, 'con requireRights=false la declaración no se exige');

// ─── 3. Estado derivado y duración ────────────────────────────────────
eq(S.displayStatusOf({ status: 'draft', title: '' }, vacio), 'borrador', 'nada escrito = borrador');
eq(S.displayStatusOf({ status: 'draft', title: 'Curso' }, S.readinessOf({ title: 'Curso', accessMode: 'public' }, {})), 'borrador', 'sólo el título (y el acceso por omisión) sigue siendo borrador');
eq(S.displayStatusOf({ status: 'draft', title: 'Curso' }, S.readinessOf({ title: 'Curso', shortDescription: 'Una descripción suficientemente larga.', accessMode: 'public' }, {})), 'incompleto', 'con algo más escrito = incompleto');
eq(S.displayStatusOf({ status: 'draft', title: 'Curso' }, listo), 'listo', 'todo cumplido = listo para enviar');
ok(S.isUploadStale({ status: 'uploading', createdAt: new Date(Date.now() - 2 * 3600e3).toISOString() }) && !S.isUploadStale({ status: 'uploading', createdAt: new Date().toISOString() }), 'una carga de hace dos horas está abandonada; una reciente no');
eq(S.displayStatusOf({ status: 'published' }, vacio), 'published', 'fuera de borrador el estado es el del flujo');
eq(S.durationOf({ durationAuto: true }, [{ durationMinutes: 10 }, { durationMinutes: 25 }]), 35, 'duración automática = suma de lecciones');
eq(S.durationOf({ durationAuto: false, durationMinutes: 90 }, [{ durationMinutes: 10 }]), 90, 'duración manual manda');
eq(S.durationOf({ durationAuto: true, durationMinutes: 40 }, []), 40, 'sin lecciones con duración se usa la del curso');

// ─── 4. Acceso por modalidad ──────────────────────────────────────────
const d = (mode, viewer, invite, token = 'tok') => S.accessDecision({ accessMode: mode, inviteToken: token }, viewer, invite);
ok(d('public', {}).allowed, 'público: anónimo entra');
ok(!d('registered', {}).allowed && d('registered', {}).reason === 'login', 'registrados: anónimo no entra, se le pide sesión');
ok(d('registered', { attendee: true }).allowed, 'registrados: la cuenta del portal de eventos vale');
ok(d('registered', { platform: true }).allowed, 'registrados: la cuenta del panel vale');
ok(!d('rotarians', { attendee: true }).allowed, 'rotarios: la cuenta de asistente NO vale');
ok(d('rotarians', { platform: true }).allowed, 'rotarios: la cuenta del panel vale');
ok(!d('private', { platform: true }).allowed, 'privado: ni con sesión sin invitación');
ok(d('private', {}, 'tok').allowed && !d('private', {}, 'otro').allowed, 'privado: sólo con el token exacto');
ok(!d('private', {}, '', '').allowed, 'privado sin token definido: nadie entra');
ok(d('private', { owner: true }).allowed && d('private', { admin: true }).allowed, 'dueño y comité siempre entran');
ok(!d('desconocido', {}).allowed, 'una modalidad desconocida cierra');
for (const r of ['login', 'rotarian_login', 'invite', 'unknown']) ok(S.ACCESS_DENIED_TEXT[r], `texto de rechazo para ${r}`);

// ─── 5. Archivos y enlaces ────────────────────────────────────────────
const mp4 = S.checkLearningFile({ filename: 'clase.mp4', size: 50 * 1024 * 1024, purpose: 'lesson_video' });
ok(mp4.ok && mp4.kind === 'video' && mp4.visibility === 'private' && !mp4.multipart, 'MP4 de 50 MB: privado, un solo PUT');
ok(S.checkLearningFile({ filename: 'clase.mp4', size: 200 * 1024 * 1024, purpose: 'lesson_video' }).multipart, 'más de 64 MB va multiparte');
ok(!S.checkLearningFile({ filename: 'clase.exe', size: 1000, purpose: 'lesson_video' }).ok, 'un ejecutable no es video');
ok(!S.checkLearningFile({ filename: 'portada.mp4', size: 1000, purpose: 'cover' }).ok, 'una portada no admite video');
ok(S.checkLearningFile({ filename: 'portada.jpg', size: 1000, purpose: 'cover' }).visibility === 'public', 'la portada es pública');
ok(!S.checkLearningFile({ filename: 'portada.jpg', size: 0, purpose: 'cover' }).ok, 'un archivo vacío se rechaza');
ok(S.checkLearningFile({ filename: 'guia.pdf', size: 1000, purpose: 'document' }).ok, 'PDF como documento');
ok(S.checkLearningFile({ filename: 'anexos.zip', size: 1000, purpose: 'resource' }).ok, 'ZIP como recurso');
ok(!S.checkLearningFile({ filename: 'guia.pdf', size: 1000, purpose: 'nada' }).ok, 'un uso desconocido se rechaza');
eq(S.PUBLIC_PURPOSES.sort(), ['collection_cover', 'cover', 'instructor', 'thumbnail'], 'sólo las imágenes de presentación son públicas');
ok(S.sniffLearningFile(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(600)]), 'mp4') === 'mp4', 'ftyp = MP4');
ok(S.sniffLearningFile(Buffer.from('%PDF-1.7 ........................'), 'mp4') === null, 'un PDF renombrado .mp4 no pasa');
ok(S.checkExternalUrl('https://youtu.be/abc').ok && !S.checkExternalUrl('javascript:alert(1)').ok && !S.checkExternalUrl('https://u:p@x.com/').ok, 'enlaces: http(s) sin credenciales');
eq(S.embedFor('https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.embedUrl, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'YouTube embebido sin cookies');
eq(S.embedFor('https://vimeo.com/123456')?.provider, 'vimeo', 'Vimeo embebido');
eq(S.embedFor('https://drive.google.com/x'), null, 'otros enlaces no se embeben');

// ─── 6. Saneado de PATCH ──────────────────────────────────────────────
const p1 = S.sanitizePatch({ title: 'x'.repeat(500), level: 'experto', audience: ['rotarios', 'marcianos', 'rotarios'], durationMinutes: '45', rightsAccepted: 'sí', status: 'published', inviteToken: 'robado' }, S.COURSE_FIELDS);
ok(p1.values.title.length === 160, 'el título se recorta a 160');
ok(p1.errors.some(e => e.field === 'level'), 'un nivel fuera del catálogo es error');
eq(p1.values.audience, ['rotarios'], 'públicos: sólo los del catálogo, sin repetir');
eq(p1.values.durationMinutes, 45, 'entero saneado');
eq(p1.values.rightsAccepted, true, 'booleano');
ok(!('status' in p1.values) && !('inviteToken' in p1.values), 'status e inviteToken NO se aceptan por PATCH');
const p2 = S.sanitizePatch({ introVideoUrl: 'ftp://x' }, S.COURSE_FIELDS);
ok(p2.errors.some(e => e.field === 'introVideoUrl'), 'un enlace no http(s) es error');
eq(S.sanitizePatch({ moduleId: '' }, S.LESSON_FIELDS).values.moduleId, null, 'moduleId vacío = sin módulo');
eq(S.sanitizePatch({ features: { progress: true, hack: true } }, S.COURSE_FIELDS).values.features, { progress: true, hack: true }, 'features llega como objeto (el controlador lo acota al catálogo)');
eq(S.slugify('Introducción a la Seguridad Alimentaria — GG2349313'), 'introduccion-a-la-seguridad-alimentaria-gg2349313', 'slug sin tildes ni símbolos');

// ─── 7. Configuración ─────────────────────────────────────────────────
const cfg = S.normalizeConfig({ maxCoursesPerCollection: '-3', autoPublishOnApprove: 'yes', notifyEmails: ['Comite@D4281.org', 'malo'], categories: ['', 'Salud'] });
eq(cfg.maxCoursesPerCollection, 0, 'tope negativo = sin tope');
eq(cfg.autoPublishOnApprove, false, 'publicar al aprobar sólo con true explícito');
eq(cfg.notifyEmails, ['comite@d4281.org'], 'correos válidos y en minúscula');
eq(cfg.categories, ['Salud'], 'categorías sin vacíos');
ok(S.normalizeConfig().requireRights && S.normalizeConfig().enabled, 'por omisión: activo y con derechos exigidos');
ok(!S.LMS_FEATURES.certificate.available && !S.LMS_FEATURES.assessment.available && !S.LMS_FEATURES.progress.available, 'ninguna función de Fase 2/3 se declara disponible');

// ─── 8. Invariantes de los archivos ───────────────────────────────────
const ensure = read('server/lib/ensureLearningSchema.js');
const addCols = [...ensure.matchAll(/ADD COLUMN IF NOT EXISTS "(\w+)"/g)].map(m => m[1]);
eq(addCols.length, Object.values(OWNED_COLUMNS).flat().length, 'todo ADD COLUMN del ensure está enumerado en OWNED_COLUMNS');
const tablas = [...ensure.matchAll(/CREATE TABLE IF NOT EXISTS "(\w+)"/g)].map(m => m[1]);
eq(tablas.sort(), Object.keys(OWNED_COLUMNS).sort(), 'las tablas creadas son las de OWNED_COLUMNS');

const ctrl = read('server/controllers/learningController.js');
const store = read('server/lib/learningStore.js');
eq((ctrl.match(/writeCourseStatus\(/g) || []).length, 1, 'el controlador llama writeCourseStatus UNA sola vez (en applyStatus)');
eq((store.match(/SET status=/g) || []).length, 0, 'el store no escribe status por fuera del update genérico');
ok(!/updateCourse\([^)]*status:/.test(ctrl), 'ningún updateCourse del controlador toca status');
ok(/const applyStatus = async/.test(ctrl) && /canTransition\(table, course\.status, to\)/.test(ctrl), 'applyStatus valida la transición contra la tabla');
ok(/NOTE_REQUIRED\.has\(to\)/.test(ctrl), 'applyStatus exige motivo cuando la tabla lo pide');
ok(/autoPublishOnApprove/.test(ctrl), 'aprobar publica sólo si la configuración lo pide');
ok(!/import .*stripe/i.test(ctrl), 'sin Stripe: el módulo no cobra');
ok(/k\.status === 'published' \? k : null/.test(ctrl), 'lo público sólo lee cursos publicados');
ok(/accessMode !== 'private'/.test(ctrl), 'el catálogo excluye los privados');

const rutas = read('server/routes/learning.js');
for (const r of ["'/public/catalogo'", "'/public/cursos/:slug/aprender'", "'/public/cursos/:slug'", "'/resumen'", "'/cursos/:id/enviar'", "'/cursos/:id/archivos/presign'", "'/cursos/:id/estado'", "'/config'"]) ok(rutas.includes(r), `ruta ${r} declarada`);
ok(rutas.indexOf("'/public/cursos/:slug/aprender'") < rutas.indexOf("'/public/cursos/:slug'"), 'aprender (más específica) antes que la ficha');
ok(rutas.trim().endsWith('export default router;'), 'export default al final');
ok(/requireRoleOrPermission\(SITE_ADMIN_ROLES, 'rotary_en_accion\.view'\)/.test(rutas) && /'rotary_en_accion\.manage'/.test(rutas), 'admin: ver y gestionar con el permiso de Rotary en Acción');
ok(read('server/server.js').includes("app.use('/api/cursos', learningRoutes)"), 'montado en /api/cursos');

// Espejos y renombre de la taxonomía
ok(read('server/lib/rotaryTaxonomySpec.js').includes("'capacitacion', 'Cursos y capacitaciones'"), 'taxonomía del servidor renombrada');
ok(read('src/lib/rotaryEnAccionSpec.ts').includes("name: 'Cursos y capacitaciones'"), 'taxonomía del navegador renombrada');
ok(!read('server/lib/rotaryTaxonomySpec.js').includes("'capacitacion', 'Capacitación'"), 'no queda el nombre viejo en el servidor');
const form = read('src/components/rotary/RotaryEnAccionForm.tsx');
ok(form.includes("modalidadCap") && form.includes("Crear cursos digitales") && form.includes("Publicar una capacitación o actividad educativa"), 'el formulario ofrece las dos modalidades');
ok(form.includes('to="/mis-cursos"'), 'la modalidad B lleva a Mis cursos');
ok(form.includes("tipo === 'capacitacion' && modalidadCap !== 'actividad'"), 'continuar exige elegir la modalidad A');

const app = read('src/App.tsx');
for (const r of ['path="/cursos"', 'path="/cursos/colecciones/:slug"', 'path="/cursos/:slug/aprender"', 'path="/cursos/:slug"', 'path="/mis-cursos"', 'path="/mis-cursos/colecciones/:id"', 'path="/mis-cursos/cursos/:id"', 'path="/admin/gestion-educativa"']) ok(app.includes(r), `ruta del navegador ${r}`);
ok(app.indexOf('path="/cursos/:slug/aprender"') < app.indexOf('path="/cursos/:slug"'), 'aprender antes que la ficha también en el navegador');
const menu = read('src/components/admin/AdminLayout.tsx');
eq((menu.match(/path: '\/admin\/gestion-educativa'/g) || []).length, 2, 'Gestión educativa en el menú del distrito y del sitio');
ok(read('src/pages/admin/RotaryEnAccionAdmin.tsx').includes('to="/admin/gestion-educativa"'), 'Rotary en Acción enlaza a Gestión educativa');

// Guardián y CLAUDE.md
const guard = read('scripts/db-push-guard.mjs');
const claude = read('CLAUDE.md');
for (const t of Object.keys(OWNED_COLUMNS)) { ok(guard.includes(t), `db-push-guard menciona ${t}`); ok(claude.includes(t), `CLAUDE.md enumera ${t}`); }
ok(claude.includes('docs/claude/cursos-y-capacitaciones.md'), 'CLAUDE.md indexa el archivo del módulo');
ok(read('docs/claude/cursos-y-capacitaciones.md').length > 2000, 'el archivo del módulo existe y no está vacío');

// Cliente: guardado automático y subida confirmada por el servidor
const client = read('src/lib/learningClient.ts');
ok(/class Autosaver/.test(client) && /window\.addEventListener\('online'/.test(client), 'Autosaver reintenta al volver la conexión');
ok(/archivos\/completar/.test(client) && /onProgress\?\.\(99, 'confirming'\)/.test(client), 'la subida nunca dice listo antes de confirmar con el servidor');
ok(/Todos los cambios guardados/.test(client) && /Guardando cambios/.test(client), 'los textos del indicador de guardado');

console.log(`\n✅ test:learning — ${n} comprobaciones en verde.`);
