#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Visitas del Gobernador — v4.1260.0 (paso 1 simplificado: v4.1283.0 · Memoria por categorías: v4.1284.0)
// npm run test:visitas-gobernador
//
// Sin base ni red: el criterio puro, la paridad con el espejo del navegador,
// el atajo del ensure, el orden y las guardas de las rutas, y lo que ninguna
// otra barrera ve (una comilla invertida dentro de un SQL, la ruta pública).
// El recorrido completo contra Postgres y S3 se hizo a mano al entregar
// (ver docs/claude/visitas-del-gobernador.md, «Cómo se probó»).
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
    VISIT_STATES, VISIT_STATE_IDS, VISIT_MAX_PHOTOS, VISIT_MAX_VIDEOS, VISIT_MAX_LINKS, VISIT_CAPTION_MAX,
    canTransitionVisit, visitNeedsReason, canPublishVisit, nextVisitStates,
    shapeVisit, validateVisit, normalizeVisitLink, makeVisitRef, visitDateIso,
    visitToSubmissionData, visitFilesForSubmission, visitMemoryText,
    VISIT_DESCRIPTION_MIN, VISIT_DESCRIPTION_MAX, visitDescriptionError, visitTitleFor,
    VISIT_MEMORY_FIELDS, VISIT_MEMORY_LEGACY,
} from '../server/lib/governorVisitSpec.js';
import { DEFAULT_GOVERNOR, GOVERNOR_BY_PERIOD, rotaryPeriodOf, fallbackGovernorFor } from '../server/lib/districtGovernor.js';

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log(`  ✓ ${msg}`); };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const BASE = {
    // v4.1283: sin título ni motivo — el formulario ya no los pide.
    clubProfileId: 'club-1', visitDate: '2026-10-01', governorName: 'Gobernador X', venue: 'Sede social',
    description: 'x'.repeat(90),
    // v4.1284: Memoria institucional por categorías nuevas (opcionales).
    featuredActivities: 'Jornada de salud', alliances: '', works: '', permanentPrograms: '', projects: 'Agua potable', grants: '',
    media: [{ key: 'k1', filename: 'a.jpg', contentType: 'image/jpeg' }], links: [],
    responsibleName: 'Ana Pérez', responsibleRole: 'Secretaria', responsibleEmail: 'ana@club.org', responsiblePhone: '+57 300 123 4567',
    truthConfirmed: true, publicationConsent: true,
};
const today = '2026-10-29';
const errs = (raw, opts) => validateVisit(shapeVisit(raw), { today, ...opts }).errors;

console.log('── Estados');
ok(VISIT_STATE_IDS.join() === 'recibida,en_revision,correcciones,aprobada,rechazada,publicada', 'seis estados, en orden');
ok(!VISIT_STATE_IDS.some(s => canTransitionVisit(s, 'publicada')), '«Publicada» no se alcanza por transición: sólo publicando');
ok(nextVisitStates('publicada').length === 0, 'publicada es final para el registro');
ok(canTransitionVisit('rechazada', 'en_revision') && !canTransitionVisit('rechazada', 'aprobada'), 'rechazada se recupera sólo volviendo a revisión');
ok(canTransitionVisit('correcciones', 'en_revision'), 'la corrección del club vuelve a «En revisión»');
ok(visitNeedsReason('correcciones') && visitNeedsReason('rechazada') && !visitNeedsReason('aprobada'), 'correcciones y rechazo exigen motivo');
ok(canPublishVisit('aprobada') && !canPublishVisit('recibida') && !canPublishVisit('en_revision'), 'sólo se publica lo aprobado');

console.log('── Validación por paso');
ok(errs(BASE).length === 0, 'una visita completa es válida');
ok(errs({ ...BASE, clubProfileId: '' }).some(e => e.step === 1), 'sin club: paso 1');
ok(errs({ ...BASE, visitDate: '2026-11-01' }).some(e => e.step === 1 && e.field === 'visitDate'), 'fecha futura: paso 1 (club y visita)');
ok(errs({ ...BASE, visitDate: '2026-02-31' }).some(e => e.field === 'visitDate'), 'fecha imposible (31 de febrero) rechazada');
ok(errs({ ...BASE, governorName: '' }).some(e => e.field === 'governorName'), 'sin gobernador: rechazado');
ok(errs({ ...BASE, description: 'corta' }).some(e => e.step === 1 && e.field === 'description'), 'descripción corta: paso 1 (club y visita), v4.1283');
ok(!errs({ ...BASE, description: 'corta' }).some(e => e.step === 2), 'la descripción ya no es un error del paso 2');
ok(!errs(BASE).some(e => e.field === 'title' || e.field === 'reason'), 'título y motivo ya no se exigen');
ok(errs({ ...BASE, description: 'x'.repeat(VISIT_DESCRIPTION_MIN - 1) }).some(e => e.field === 'description') && errs({ ...BASE, description: 'x'.repeat(VISIT_DESCRIPTION_MIN) }).length === 0, `mínimo exacto: ${VISIT_DESCRIPTION_MIN} caracteres`);
ok(errs({ ...BASE, description: 'x'.repeat(VISIT_DESCRIPTION_MAX) }).length === 0 && errs({ ...BASE, description: 'x'.repeat(VISIT_DESCRIPTION_MAX + 1) }).some(e => e.step === 1 && e.field === 'description'), `máximo exacto: ${VISIT_DESCRIPTION_MAX} caracteres`);
ok(errs({ ...BASE, description: `   ${'x'.repeat(VISIT_DESCRIPTION_MAX)}   ` }).length === 0, 'se cuenta el texto recortado (espacios de los extremos no suman)');
ok(errs({ ...BASE, description: ' '.repeat(120) }).some(e => e.field === 'description'), 'sólo espacios no es una descripción');
ok(visitDescriptionError('x'.repeat(10)).startsWith('La descripción debe tener al menos 80 caracteres') && visitDescriptionError('x'.repeat(701)).includes('700'), 'avisos claros de mínimo y máximo');
const larga = 'y'.repeat(1200);
ok(errs({ ...BASE, description: larga }, { admin: true, storedDescription: larga }).length === 0, 'edición administrativa: una descripción histórica más larga, sin tocar, no bloquea');
ok(errs({ ...BASE, description: larga + '!' }, { admin: true, storedDescription: larga }).some(e => e.field === 'description'), 'edición administrativa: si se modifica, vale el rango 80–700');
ok(errs({ ...BASE, description: 'corta' }, { admin: true, storedDescription: 'otra' }).some(e => e.field === 'description'), 'edición administrativa: una descripción nueva corta se rechaza');
ok(shapeVisit({ ...BASE, description: larga }).description.length === 1200, 'shapeVisit no corta en silencio una descripción histórica');
ok(errs({ ...BASE, media: [], links: [] }).some(e => e.step === 2), 'sin evidencias: paso 2 (memoria y galería)');
ok(errs({ ...BASE, media: [], links: ['https://youtu.be/x'] }).length === 0, 'un enlace basta como evidencia');
ok(errs({ ...BASE, media: Array.from({ length: VISIT_MAX_PHOTOS + 1 }, (_, i) => ({ key: `k${i}`, filename: `${i}.jpg`, contentType: 'image/jpeg' })) }).some(e => e.step === 2), `más de ${VISIT_MAX_PHOTOS} fotos: rechazado`);
ok(errs({ ...BASE, media: Array.from({ length: VISIT_MAX_VIDEOS + 1 }, (_, i) => ({ key: `v${i}`, filename: `${i}.mp4`, contentType: 'video/mp4' })) }).some(e => e.step === 2), `más de ${VISIT_MAX_VIDEOS} videos: rechazado`);
ok(errs({ ...BASE, media: [{ key: 'p', filename: 'a.pdf', contentType: 'application/pdf' }] }).some(e => e.step === 2), 'un PDF no es evidencia admitida');
ok(errs({ ...BASE, media: [BASE.media[0], BASE.media[0]] }).some(e => e.step === 2), 'el mismo archivo dos veces: rechazado');
ok(errs({ ...BASE, responsibleEmail: 'no-es-correo' }).some(e => e.field === 'responsibleEmail'), 'correo inválido: rechazado');
ok(errs({ ...BASE, responsiblePhone: '123' }).some(e => e.field === 'responsiblePhone'), 'WhatsApp inválido: rechazado');
ok(errs({ ...BASE, truthConfirmed: false }).some(e => e.field === 'truthConfirmed'), 'sin confirmar veracidad: rechazado');
ok(errs({ ...BASE, publicationConsent: 'true' }).some(e => e.field === 'publicationConsent'), 'el consentimiento debe ser un true real, no un texto');
ok(errs({ ...BASE, media: [], truthConfirmed: false, publicationConsent: false }, { admin: true }).length === 0, 'la edición administrativa no re-exige galería ni consentimiento');

console.log('── Forma de los datos');
const s = shapeVisit({ ...BASE, responsibleEmail: ' ANA@Club.ORG ', responsiblePhone: '+57 (300) 123-4567', links: ['javascript:alert(1)', 'https://user:pw@x.com', 'youtube.com/watch?v=1', { url: 'ftp://x.org' }] });
ok(s.responsibleEmail === 'ana@club.org' && s.responsiblePhone === '+573001234567', 'correo en minúsculas y teléfono sin adornos');
ok(s.links.length === 1 && s.links[0].url === 'https://youtube.com/watch?v=1' && s.links[0].host === 'youtube.com', 'sólo enlaces http(s) sin credenciales');
ok(normalizeVisitLink('localhost') === null, 'un host sin dominio no es un enlace');
ok(shapeVisit({ ...BASE, media: [{ key: 'a', caption: 'x'.repeat(999) }] }).media[0].caption.length === VISIT_CAPTION_MAX, 'la descripción de un archivo se recorta al tope');

console.log('── Identificador y fecha');
ok(/^VG-2026-[A-Z2-9]{6}$/.test(makeVisitRef(new Date('2026-10-29T12:00:00Z'))), 'referencia VG-AAAA-XXXXXX');
ok(!/[01OI]/.test(makeVisitRef(new Date(), () => 0.999).slice(8)) && !/[01OI]/.test(makeVisitRef(new Date(), () => 0).slice(8)), 'sin caracteres ambiguos (0/O, 1/I)');
ok(visitDateIso(new Date(2026, 9, 29)) === '2026-10-29', 'un Date de pg se formatea sin «Thu Oct 29»');
ok(visitDateIso('2026-10-29') === '2026-10-29' && visitDateIso('29/10/2026') === '', 'una cadena ISO pasa; otro formato no');

console.log('── Hacia Rotary en Acción');
const visit = { ...shapeVisit(BASE), publicRef: 'VG-2026-ABCDEF', clubName: 'Club Rotario X', clubCity: 'Cali', districtNumber: 4281, visitDate: new Date(2026, 9, 1),
    media: [{ key: 'k1', kind: 'image', filename: 'a.jpg', contentType: 'image/jpeg', bytes: 10 }, { key: 'k2', kind: 'video', filename: 'b.mp4', contentType: 'video/mp4', bytes: 20 }, { key: 'k3', kind: 'otro' }] };
const d = visitToSubmissionData(visit);
ok(d.title === 'Visita oficial del Gobernador al Club Rotario X' && d.club === 'Club Rotario X' && d.activityDate === '2026-10-01' && d.district === '4281', 'título, club, fecha y distrito reutilizados');
ok(d.story.startsWith('Descripción de la visita:') && d.story.includes('Actividades destacadas:') && d.story.includes('Proyectos:') && !d.story.includes('Alianzas'), 'la memoria va por secciones y sin las vacías');
ok(d.story.indexOf('Actividades destacadas:') < d.story.indexOf('Proyectos:'), 'la memoria publicada sigue el orden alfabético');
const conAnterior = visitToSubmissionData({ ...visit, highlights: 'Logro histórico', agreements: 'Acuerdo histórico' });
ok(conAnterior.story.includes('Resultados destacados:\nLogro histórico') && conAnterior.story.includes('Acuerdos:\nAcuerdo histórico'), 'una visita histórica publica también su memoria del formato anterior');
ok(d.submissionType === 'governor_visit' && d.contentType === 'evento' && d.tags.includes('visita-del-gobernador'), 'se distingue por tipo de solicitud y etiqueta, sin tipo nuevo en el formulario general');
ok(d.extra.includes('VG-2026-ABCDEF'), 'la referencia de la visita viaja con la solicitud');
ok(d.description.startsWith(BASE.description) && d.description.includes('Lugar: Sede social'), 'visita nueva: la descripción del paso 1 resume la solicitud');
const historica = visitToSubmissionData({ ...visit, title: 'Título del club', reason: 'Motivo anterior' });
ok(historica.title === 'Título del club' && historica.description.startsWith('Motivo anterior'), 'visita anterior: conserva su título y su motivo al publicarse');
ok(visitTitleFor({ clubName: 'Club Rotario Armenia' }) === 'Visita oficial del Gobernador al Club Rotario Armenia' && visitTitleFor({}).length > 10, 'el título se compone con el club');

console.log('── Memoria institucional por categorías (v4.1284)');
const NUEVAS = ['featuredActivities', 'alliances', 'works', 'permanentPrograms', 'projects', 'grants'];
const ETIQUETAS = ['Actividades destacadas', 'Alianzas', 'Obras', 'Programas permanentes', 'Proyectos', 'Subvenciones'];
ok(VISIT_MEMORY_FIELDS.map(([k]) => k).join() === NUEVAS.join() && VISIT_MEMORY_FIELDS.map(([, l]) => l).join() === ETIQUETAS.join(), 'las seis categorías nuevas, con su etiqueta');
ok(ETIQUETAS.join('|') === [...ETIQUETAS].sort((a, b) => a.localeCompare(b, 'es')).join('|'), 'en orden alfabético');
ok(VISIT_MEMORY_LEGACY.map(([k]) => k).join() === 'activities,topics,recognitions,agreements,commitments,highlights', 'las seis anteriores se conservan para lo histórico');
ok(errs({ ...BASE, ...Object.fromEntries(NUEVAS.map(k => [k, ''])) }).length === 0, 'todas las categorías son opcionales');
const forma = shapeVisit({ ...BASE, alliances: 'Alcaldía\r\nCámara de comercio', grants: 'z'.repeat(5000) });
ok(forma.alliances === 'Alcaldía\nCámara de comercio' && forma.grants.length === 3000, 'multilínea conservada y tope de 3000 por categoría');
ok(NUEVAS.every(k => k in shapeVisit(BASE)), 'shapeVisit conoce las seis categorías nuevas');
const ctrl = read('server/controllers/governorVisitController.js');
const insert = ctrl.slice(ctrl.indexOf('export const submitVisit'), ctrl.indexOf('async function visitByToken'));
ok(insert.includes(`'"featuredActivities"', 'alliances', 'works', '"permanentPrograms"', 'projects', 'grants'`) && !/'activities', 'topics'/.test(insert), 'una visita nueva guarda las categorías nuevas y no escribe las anteriores');
const correccion = ctrl.slice(ctrl.indexOf('export const submitVisitCorrection'), ctrl.indexOf('// ADMINISTRACIÓN'));
ok(correccion.includes('"featuredActivities" = $14') && !/\bactivities = \$/.test(correccion) && !/\bhighlights = \$/.test(correccion), 'la corrección del club no borra las categorías anteriores');
const edicion = ctrl.slice(ctrl.indexOf('export const adminUpdateVisit'), ctrl.indexOf('const correctionUrl'));
ok(edicion.includes('"featuredActivities" = $29') && edicion.includes('grants = $34') && edicion.includes('activities = $14'), 'la edición administrativa guarda las nuevas y conserva las anteriores');
const editable = ctrl.match(/const EDITABLE = \[([^\]]+)\]/)[1];
ok([...NUEVAS, 'activities', 'highlights'].every(k => editable.includes(`'${k}'`)), 'el panel puede editar categorías nuevas y anteriores');
const { MEMORY_COLUMNS } = await import('../server/lib/ensureGovernorVisitSchema.js');
ok(MEMORY_COLUMNS.join() === NUEVAS.join(), 'una columna por categoría nueva, sin renombrar ni borrar las anteriores');
ok(!/DROP COLUMN|RENAME/.test(read('server/lib/ensureGovernorVisitSchema.js')), 'ningún DROP ni RENAME: lo histórico no se pierde');

console.log('── Gobernador del período');
ok(DEFAULT_GOVERNOR === 'Fabio Enrique Véjar Montañez' && GOVERNOR_BY_PERIOD['2026-2027'] === DEFAULT_GOVERNOR, 'Gobernador 2026-2027: Fabio Enrique Véjar Montañez');
ok(rotaryPeriodOf('2026-07-01') === '2026-2027' && rotaryPeriodOf('2026-06-30') === '2025-2026' && rotaryPeriodOf(new Date(Date.UTC(2026, 10, 5))) === '2026-2027', 'el período cambia el 1 de julio');
ok(fallbackGovernorFor('2025-2026') === '' && fallbackGovernorFor('2026-2027') === DEFAULT_GOVERNOR, 'el respaldo no inventa Gobernador para otro período');
const { DEFAULT_GOVERNOR: deAniversarios } = await import('../server/lib/anniversarySpec.js');
ok(deAniversarios === DEFAULT_GOVERNOR, 'Aniversarios IA usa el mismo nombre (escrito en un solo lugar)');
const formulario = read('src/components/rotary/GovernorVisitForm.tsx');
ok(!formulario.includes('Véjar') && formulario.includes('currentGovernor'), 'el formulario no escribe el nombre: lo recibe de la configuración');
ok(read('server/controllers/governorVisitController.js').includes('currentDistrictGovernor(GOVERNOR_VISIT_DISTRICT)'), 'la configuración pública entrega el Gobernador vigente del distrito');
const files = visitFilesForSubmission(visit);
ok(files.length === 2 && files[0].key === 'k1' && files[1].kind === 'video', 'los MISMOS objetos de S3, sin lo que no es foto ni video');
ok(visitMemoryText({}) === '', 'memoria vacía sin secciones fantasma');

console.log('── Paridad con el espejo del navegador');
const ts = read('src/lib/governorVisitSpec.ts');
const num = (name) => Number(ts.match(new RegExp(`export const ${name} = (\\d+)`))?.[1]);
ok(num('VISIT_DESCRIPTION_MIN') === VISIT_DESCRIPTION_MIN && num('VISIT_DESCRIPTION_MAX') === VISIT_DESCRIPTION_MAX, 'mismo rango de la descripción en servidor y navegador');
ok(num('VISIT_MAX_PHOTOS') === VISIT_MAX_PHOTOS && num('VISIT_MAX_VIDEOS') === VISIT_MAX_VIDEOS && num('VISIT_MAX_LINKS') === VISIT_MAX_LINKS && num('VISIT_CAPTION_MAX') === VISIT_CAPTION_MAX, 'mismos topes en servidor y navegador');
for (const st of Object.values(VISIT_STATES)) ok(ts.includes(`${st.id}: { label: '${st.label}'`), `estado «${st.label}» con la misma etiqueta`);
const mirror = await import('../src/lib/governorVisitSpec.ts');
ok(mirror.VISIT_STEPS.join(' · ') === 'Club y visita · Memoria y galería · Responsable y envío', 'tres pasos en el formulario (v4.1262)');
ok(!('title' in mirror.EMPTY_VISIT) && !('reason' in mirror.EMPTY_VISIT), 'el borrador del navegador ya no tiene título ni motivo');
ok(mirror.VISIT_MEMORY_FIELDS.map(([k, l]) => `${k}:${l}`).join() === VISIT_MEMORY_FIELDS.map(([k, l]) => `${k}:${l}`).join(), 'mismas categorías y etiquetas en servidor y navegador');
ok(mirror.VISIT_MEMORY_FIELDS.every(([k, , ph]) => k in mirror.EMPTY_VISIT && ph.length > 20), 'cada categoría está en el borrador y tiene su texto orientativo');
ok(['activities', 'topics', 'recognitions', 'agreements', 'commitments', 'highlights'].every(k => !(k in mirror.EMPTY_VISIT)), 'las categorías anteriores ya no están en el formulario público');
ok([1, 2, 3].every(n => !mirror.VISIT_MEMORY_FIELDS.some(([k]) => k in mirror.validateVisitStep(n, mirror.EMPTY_VISIT))), 'ninguna categoría bloquea el avance');
ok(formulario.includes('Comparte los proyectos, programas, alianzas, obras y actividades más representativas de tu club rotario. Completa únicamente los campos que correspondan.'), 'el texto introductorio nuevo');
ok(!/Actividades desarrolladas|Temas abordados|Resultados destacados/.test(formulario), 'el formulario público no muestra las categorías anteriores');
for (const t of ['corta', 'z'.repeat(80), 'z'.repeat(700), 'z'.repeat(701)]) ok(mirror.visitDescriptionError(t) === visitDescriptionError(t), `mismo aviso para ${t.length} caracteres`);
ok('description' in mirror.validateVisitStep(1, mirror.EMPTY_VISIT) && !('description' in mirror.validateVisitStep(2, mirror.EMPTY_VISIT)), 'el navegador pide la descripción en el paso 1, no en el 2');
ok(!/id="gv-titulo"|id="gv-motivo"/.test(formulario) && (formulario.match(/id="gv-desc"/g) || []).length === 1, 'el formulario no tiene Título ni Motivo y la descripción aparece una sola vez');
ok(formulario.indexOf('id="gv-desc"') < formulario.indexOf('PASO 2 — Memoria y galería') || formulario.indexOf('<CampoDescripcion') < formulario.indexOf('PASO 2 — Memoria y galería'), 'la descripción se pinta en el paso 1');
// Cada error del servidor lleva al MISMO paso en el que el navegador pinta ese campo.
const vacio = shapeVisit({ media: [{ key: 'p', filename: 'a.pdf', contentType: 'application/pdf' }], responsiblePhone: '1' });
const delServidor = validateVisit(vacio, { today }).errors;
const pasoCliente = (campo) => [1, 2, 3].find(n => campo in mirror.validateVisitStep(n, { ...mirror.EMPTY_VISIT, responsiblePhone: '1' }, { photos: 0, videos: 0, pending: 0, failed: 0 }));
for (const e of delServidor) ok(pasoCliente(e.field) === e.step, `«${e.field}»: paso ${e.step} en servidor y navegador`);
ok(delServidor.every(e => e.step >= 1 && e.step <= mirror.VISIT_STEPS.length), 'ningún error del servidor apunta a un paso que no existe');

console.log('── Esquema');
const ensure = read('server/lib/ensureGovernorVisitSchema.js');
const { OWNED_COLUMNS } = await import('../server/lib/ensureGovernorVisitSchema.js');
const addCols = [...ensure.matchAll(/ADD COLUMN IF NOT EXISTS "?(\w+)"?/g)].map(m => m[1]);
ok(addCols.every(c => OWNED_COLUMNS.GovernorVisit.includes(c)), `todo ADD COLUMN va enumerado en el atajo (${addCols.length})`);
for (const f of ['server/lib/ensureGovernorVisitSchema.js', 'server/controllers/governorVisitController.js']) {
    const src = read(f);
    const sql = [...src.matchAll(/db\.query\(\s*`([^`]*)`/g)].length;
    const opened = (src.match(/db\.query\(\s*`/g) || []).length;
    ok(sql === opened, `${f}: ningún SQL con una comilla invertida dentro`);
}
ok(read('scripts/db-push-guard.mjs').includes('GovernorVisit'), 'la tabla está en la lista del guardián de db:push');
ok(read('CLAUDE.md').includes('GovernorVisit'), 'la tabla está en la lista de CLAUDE.md');

console.log('── Rutas');
const routes = read('server/routes/rotary-en-accion.js');
const authAt = routes.indexOf('router.use(authMiddleware)');
for (const p of ["'/visitas-gobernador/config'", "'/visitas-gobernador/presign'", "'/visitas-gobernador/submit'", "'/visitas-gobernador/correccion/:token'"]) {
    const i = routes.indexOf(p);
    ok(i > 0 && i < authAt, `${p} es pública (antes del authMiddleware)`);
}
const admin = routes.split('\n').filter(l => l.includes('/visitas-gobernador/admin'));
ok(admin.length === 7 && admin.every(l => routes.indexOf(l) > authAt && l.includes('requireSubmissionInboxAccess') && l.includes("'rotary_en_accion.")), 'las siete rutas de administración llevan sesión, puerta del módulo y permiso');
ok(admin.find(l => l.includes('/publish')).includes('rotary_en_accion.publish') && admin.find(l => l.includes('/status')).includes('rotary_en_accion.manage') && admin.find(l => l.includes('router.put')).includes('rotary_en_accion.edit'), 'publicar, cambiar estado y editar piden su permiso propio');
ok(read('src/App.tsx').includes('path="/visitas-del-gobernador" element={<VisitasGobernador />}'), 'la ruta canónica es dominio.org/visitas-del-gobernador');
ok(read('src/App.tsx').includes('path="/rotary-en-accion/visitas-del-gobernador" element={<VisitasGobernadorRedirect />}'), 'la dirección anterior redirige');
ok(/\/visitas-del-gobernador\$\{search\}/.test(read('src/pages/VisitasGobernadorRedirect.tsx')), 'la redirección conserva ?corregir=');
ok(read('server/controllers/governorVisitController.js').includes('/visitas-del-gobernador?corregir='), 'el enlace de corrección usa la dirección canónica');
ok(read('src/components/admin/rotary/RotaryVisitasGobernador.tsx').includes("PUBLIC_PATH = '/visitas-del-gobernador'"), 'el panel comparte la dirección canónica');

console.log(`\n✅ ${n} comprobaciones, todas en verde.`);
