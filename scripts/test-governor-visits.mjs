#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Visitas del Gobernador — v4.1260.0
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
} from '../server/lib/governorVisitSpec.js';

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log(`  ✓ ${msg}`); };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const BASE = {
    clubProfileId: 'club-1', visitDate: '2026-10-01', governorName: 'Gobernador X', venue: 'Sede social',
    title: 'Visita oficial', reason: 'Visita oficial del período rotario',
    description: 'x'.repeat(90), activities: 'Reunión', topics: '', recognitions: '', agreements: '', commitments: '', highlights: 'Logro',
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
ok(errs({ ...BASE, visitDate: '2026-11-01' }).some(e => e.step === 2 && e.field === 'visitDate'), 'fecha futura: paso 2');
ok(errs({ ...BASE, visitDate: '2026-02-31' }).some(e => e.field === 'visitDate'), 'fecha imposible (31 de febrero) rechazada');
ok(errs({ ...BASE, governorName: '' }).some(e => e.field === 'governorName'), 'sin gobernador: paso 2');
ok(errs({ ...BASE, description: 'corta' }).some(e => e.step === 3), 'descripción corta: paso 3');
ok(errs({ ...BASE, media: [], links: [] }).some(e => e.step === 4), 'sin evidencias: paso 4');
ok(errs({ ...BASE, media: [], links: ['https://youtu.be/x'] }).length === 0, 'un enlace basta como evidencia');
ok(errs({ ...BASE, media: Array.from({ length: VISIT_MAX_PHOTOS + 1 }, (_, i) => ({ key: `k${i}`, filename: `${i}.jpg`, contentType: 'image/jpeg' })) }).some(e => e.step === 4), `más de ${VISIT_MAX_PHOTOS} fotos: rechazado`);
ok(errs({ ...BASE, media: Array.from({ length: VISIT_MAX_VIDEOS + 1 }, (_, i) => ({ key: `v${i}`, filename: `${i}.mp4`, contentType: 'video/mp4' })) }).some(e => e.step === 4), `más de ${VISIT_MAX_VIDEOS} videos: rechazado`);
ok(errs({ ...BASE, media: [{ key: 'p', filename: 'a.pdf', contentType: 'application/pdf' }] }).some(e => e.step === 4), 'un PDF no es evidencia admitida');
ok(errs({ ...BASE, media: [BASE.media[0], BASE.media[0]] }).some(e => e.step === 4), 'el mismo archivo dos veces: rechazado');
ok(errs({ ...BASE, responsibleEmail: 'no-es-correo' }).some(e => e.field === 'responsibleEmail'), 'correo inválido: paso 5');
ok(errs({ ...BASE, responsiblePhone: '123' }).some(e => e.field === 'responsiblePhone'), 'WhatsApp inválido: paso 5');
ok(errs({ ...BASE, truthConfirmed: false }).some(e => e.field === 'truthConfirmed'), 'sin confirmar veracidad: paso 5');
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
ok(d.title === 'Visita oficial' && d.club === 'Club Rotario X' && d.activityDate === '2026-10-01' && d.district === '4281', 'título, club, fecha y distrito reutilizados');
ok(d.story.startsWith('Descripción de la visita:') && d.story.includes('Resultados destacados:') && !d.story.includes('Temas abordados'), 'la memoria va por secciones y sin las vacías');
ok(d.submissionType === 'governor_visit' && d.contentType === 'evento' && d.tags.includes('visita-del-gobernador'), 'se distingue por tipo de solicitud y etiqueta, sin tipo nuevo en el formulario general');
ok(d.extra.includes('VG-2026-ABCDEF'), 'la referencia de la visita viaja con la solicitud');
const files = visitFilesForSubmission(visit);
ok(files.length === 2 && files[0].key === 'k1' && files[1].kind === 'video', 'los MISMOS objetos de S3, sin lo que no es foto ni video');
ok(visitMemoryText({}) === '', 'memoria vacía sin secciones fantasma');

console.log('── Paridad con el espejo del navegador');
const ts = read('src/lib/governorVisitSpec.ts');
const num = (name) => Number(ts.match(new RegExp(`export const ${name} = (\\d+)`))?.[1]);
ok(num('VISIT_MAX_PHOTOS') === VISIT_MAX_PHOTOS && num('VISIT_MAX_VIDEOS') === VISIT_MAX_VIDEOS && num('VISIT_MAX_LINKS') === VISIT_MAX_LINKS && num('VISIT_CAPTION_MAX') === VISIT_CAPTION_MAX, 'mismos topes en servidor y navegador');
for (const st of Object.values(VISIT_STATES)) ok(ts.includes(`${st.id}: { label: '${st.label}'`), `estado «${st.label}» con la misma etiqueta`);
ok((ts.match(/VISIT_STEPS = \[([\s\S]*?)\]/)?.[1].match(/'/g) || []).length === 10, 'cinco pasos en el formulario');

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
ok(read('src/App.tsx').includes('path="/rotary-en-accion/visitas-del-gobernador"'), 'la ruta pública existe en el SPA');

console.log(`\n✅ ${n} comprobaciones, todas en verde.`);
