#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Videos de proyectos (video PROPIO del club) — criterio e invariantes (v4.1298.0)
// npm run test:project-videos
//
// Sin base ni red: estados y transiciones, formatos por bytes (MP4, MOV,
// WebM), configuración normalizada, validación para enviar, advertencias que
// no rechazan, política de reemplazo, la tarjeta, y las invariantes que
// ninguna barrera ve: el estado se escribe en UN sitio, no hay Stripe ni
// cobro en el módulo, los permisos de las rutas, el atajo del ensure y las
// tablas protegidas. El recorrido completo: `npm run test:project-videos:e2e`.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
    STATUSES, STORED_STATUS_KEYS, canTransition, participantCanEdit, sniffVideo, normalizeConfig, DEFAULT_CONFIG, consentVersionOf,
    deadlinePassed, checkUploadMeta, judgeUploadedVideo, videoWarnings, normalizeMeta, validateForSubmit, canReplace, cardCopyOf, summarize, notificationFor, fmtDuration,
} from '../server/lib/projectVideoSpec.js';
import { OWNED_COLUMNS } from '../server/lib/ensureProjectVideoSchema.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

console.log('── Estados');
ok(STATUSES.length === 8 && STORED_STATUS_KEYS.length === 7, 'ocho estados visuales, siete guardados («Sin video» es virtual)');
ok(['draft', 'received', 'in_review', 'changes_requested', 'approved', 'rejected', 'withdrawn'].every(k => STORED_STATUS_KEYS.includes(k)), 'los estados del pedido existen');
ok(canTransition('draft', 'received', { actor: 'participant' }) && !canTransition('draft', 'approved', { actor: 'participant' }), 'el club envía; no aprueba');
ok(canTransition('received', 'approved') && canTransition('received', 'changes_requested') && canTransition('in_review', 'rejected'), 'el comité aprueba, pide correcciones o rechaza');
ok(canTransition('changes_requested', 'received', { actor: 'participant' }) && canTransition('received', 'withdrawn', { actor: 'participant' }) && !canTransition('approved', 'withdrawn', { actor: 'participant' }), 'tras correcciones el club reenvía; retira sólo lo que está en revisión');
ok(participantCanEdit('draft') && participantCanEdit('changes_requested') && participantCanEdit('withdrawn') && !participantCanEdit('in_review') && !participantCanEdit('approved'), 'edita en borrador, con correcciones o retirado');

console.log('── Formatos por bytes');
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(64, 1)]);
const mov = Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from('ftypqt  '), Buffer.alloc(64, 1)]);
const webm = Buffer.concat([Buffer.from([0x1A, 0x45, 0xDF, 0xA3]), Buffer.alloc(64, 1)]);
const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 32)]);
ok(sniffVideo(mp4) === 'mp4' && sniffVideo(mov) === 'mov' && sniffVideo(webm) === 'webm' && sniffVideo(pdf) === null, 'MP4, MOV y WebM se reconocen por sus bytes; un PDF no');
ok(judgeUploadedVideo({ filename: 'a.mp4', bytes: mp4.length, head: mp4 }).ok && judgeUploadedVideo({ filename: 'a.mov', bytes: mp4.length, head: mp4 }).ok, 'MP4 y MOV comparten contenedor: la extensión cruzada no se castiga');
ok(!judgeUploadedVideo({ filename: 'a.mp4', bytes: webm.length, head: webm }).ok && !judgeUploadedVideo({ filename: 'a.mp4', bytes: pdf.length, head: pdf }).ok, 'un WebM o un PDF llamados .mp4 se rechazan');
ok(!checkUploadMeta({ filename: 'a.avi', size: 10 }).ok && !checkUploadMeta({ filename: 'a.mp4', size: 0 }).ok && !checkUploadMeta({ filename: 'a.mp4', size: 600 * 1024 * 1024 }).ok, 'AVI, vacío y más de 500 MB: rechazados con el tope por defecto');
ok(checkUploadMeta({ filename: 'a.mp4', size: 600 * 1024 * 1024, cfg: { maxSizeMb: 1000 } }).ok && !checkUploadMeta({ filename: 'a.webm', size: 10, cfg: { allowedFormats: ['mp4'] } }).ok, 'el tope y los formatos son configurables');

console.log('── Configuración');
const c = normalizeConfig({ maxSizeMb: '9999', recommendedMinSec: 300, recommendedMaxSec: 60, maxActiveVideos: 50, deadline: 'ayer', recommendations: 'a\n\nb', replacementPolicy: 'raro', consentText: '', allowedFormats: ['mp4', 'avi'] });
ok(c.maxSizeMb === 5000 && c.recommendedMinSec === 60 && c.recommendedMaxSec === 300 && c.maxActiveVideos === 10 && c.deadline === '' && c.recommendations.join() === 'a,b' && c.replacementPolicy === 'until_approved' && c.consentText === DEFAULT_CONFIG.consentText && c.allowedFormats.join() === 'mp4', 'la configuración se acota, ordena y rellena con los valores por defecto');
ok(normalizeConfig({}).recommendations.length === 6 && normalizeConfig({}).requireConsent === true && normalizeConfig({}).publicVisibility === false, 'por defecto: seis recomendaciones, autorización exigida y nada público');
ok(consentVersionOf('a') !== consentVersionOf('b') && consentVersionOf('a') === consentVersionOf('a'), 'la versión del texto de autorización identifica el texto aceptado');
ok(deadlinePassed({ deadline: '2000-01-01' }) && !deadlinePassed({ deadline: '2099-01-01' }) && !deadlinePassed({ deadline: '' }), 'la fecha límite se evalúa al cierre del día; vacía no limita');

console.log('── Ficha, envío y reemplazo');
const m = normalizeMeta({ title: ' Agua ', productionYear: '2026', language: 'es', notes: 'x' });
ok(m.title === 'Agua' && m.productionYear === 2026 && normalizeMeta({ productionYear: 1800 }).productionYear === null && normalizeMeta({ language: 'klingon' }).language === '', 'la ficha se normaliza');
ok(!validateForSubmit({ meta: {}, hasVersion: false, consentAccepted: false }).ok && validateForSubmit({ meta: {}, hasVersion: false, consentAccepted: false }).errors.length === 3, 'enviar sin título, sin archivo y sin autorización: tres errores');
ok(validateForSubmit({ meta: { title: 'T' }, hasVersion: true, consentAccepted: true }).ok && validateForSubmit({ meta: { title: 'T' }, hasVersion: true, consentAccepted: false, cfg: { requireConsent: false } }).ok, 'con título, archivo y autorización (o sin exigirla) se envía');
ok(!validateForSubmit({ meta: { title: 'T' }, hasVersion: true, consentAccepted: true, cfg: { deadline: '2000-01-01' } }).ok && !validateForSubmit({ meta: { title: 'T' }, hasVersion: true, consentAccepted: true, cfg: { enabled: false } }).ok, 'fecha vencida o recepción apagada bloquean el envío');
ok(canReplace({ status: 'draft' }) && canReplace({ status: 'changes_requested' }) && !canReplace({ status: 'received' }) && !canReplace({ status: 'in_review' }) && !canReplace({ status: 'approved' }) && canReplace({ status: 'approved', cfg: { replacementPolicy: 'always' } }) && !canReplace({ status: 'rejected', cfg: { replacementPolicy: 'always' } }), 'reemplazo según la política: nunca en manos del comité ni rechazado; aprobado sólo con «siempre»');
ok(videoWarnings({ width: 1080, height: 1920, durationSec: 100 }).some(w => /vertical/.test(w)) && videoWarnings({ width: 1920, height: 1080, durationSec: 400 }).some(w => /más de lo sugerido/.test(w)) && videoWarnings({ width: 1920, height: 1080, durationSec: 400, cfg: { maxDurationSec: 300 } }).some(w => /reglamento/.test(w)) && videoWarnings({ width: 1920, height: 1080, durationSec: 120 }).length === 0, 'advertencias: vertical, más largo de lo sugerido, por encima del reglamento; Full HD de 2 min sin avisos');
ok(fmtDuration(148) === '2:28', 'duración legible');

console.log('── Tarjeta y bandeja');
ok(cardCopyOf({ status: 'none', available: true }).actions[0].label === 'Subir video del proyecto' && cardCopyOf({ status: 'changes_requested', available: true }).actions.map(a => a.key).join() === 'open,replace' && cardCopyOf({ status: 'approved', available: true }).actions[0].label === 'Ver video' && cardCopyOf({ status: 'none', available: false }).actions.length === 0, 'la tarjeta ofrece subir, ver, consultar observaciones o reemplazar según el estado');
const k = summarize([{ status: 'received' }, { status: 'in_review' }, { status: 'approved' }, { status: 'changes_requested' }, { status: 'draft' }]);
ok(k.total === 4 && k.received === 1 && k.pending === 2 && k.approved === 1 && k.observed === 1, 'indicadores: el borrador no cuenta');
ok(notificationFor('received').kind === 'received' && notificationFor('in_review') === null && notificationFor('changes_requested').kind === 'changes_requested', 'avisos sólo en recibido, aprobado, correcciones y rechazo');

console.log('── Invariantes');
const ctrl = read('server/controllers/projectVideoController.js');
const updates = ctrl.match(/UPDATE "ProjectVideo" SET [^;]*?WHERE/g) || [];
ok(updates.every(u => !/\bstatus\s*=/.test(u)) && (ctrl.match(/'status = \$2'/g) || []).length === 1 && ctrl.indexOf("'status = $2'") > ctrl.indexOf('const applyStatus'), 'el estado del video se escribe en UN solo sitio: applyStatus');
ok(!/stripe|Stripe|checkout|priceAmount|VideoPitchOrder/.test(ctrl), 'el módulo de videos propios no conoce Stripe, planes ni órdenes: no hay cobro posible');
ok(!/UPDATE "VideoPitchRequest"|UPDATE "ProjectFairSubmission"|UPDATE "VideoPitchOrder"/.test(ctrl), 'no toca el Video Pitch ni la postulación: sólo dos entradas en el historial de la postulación');
ok(ctrl.includes('video.submissionId !== submission.id') && ctrl.includes('portalIdentity(req)'), 'cada video se comprueba contra la postulación del token');
ok(ctrl.indexOf('inspectProjectVideoObject(') < ctrl.indexOf('judgeUploadedVideo(') && ctrl.includes('deleteProjectVideoObject(storageKey)'), 'el archivo se juzga por el objeto real y el rechazado se borra');
ok(/ON CONFLICT \("videoId", "dedupeKey"\) DO NOTHING/.test(ctrl), 'un aviso por cambio');
ok(ctrl.includes('"consentVersion" = $2, "consentText" = $3'), 'la autorización guarda el texto aceptado y su versión como evidencia');
ok(!/publicVisibility/.test(ctrl.replace(/\/\/.*$/gm, '')) || !/isPublic|public = true/.test(ctrl), 'nada se publica solo');
const cap = (name) => ctrl.match(new RegExp(`export const ${name} = withSchema\\([\\s\\S]*?\\}, '(\\w+)'\\);`))?.[1];
ok(cap('adminList') === 'view' && cap('adminGet') === 'view' && cap('adminUrl') === 'view' && cap('adminGetConfig') === 'view', 'consultar exige «view»');
ok(cap('adminSetStatus') === 'changeStatus' && cap('adminUpdate') === 'changeStatus' && cap('adminComment') === 'comment' && cap('adminSaveConfig') === 'config', 'revisar exige «changeStatus»; comentar, «comment»; configurar, «config»');
ok(ctrl.trimEnd().endsWith('};') && ctrl.lastIndexOf('export default {') > ctrl.lastIndexOf('export const'), '`export default` al final del archivo');
const routes = read('server/routes/project-fair.js');
const line = (f) => routes.split('\n').find(l => l.includes(f)) || '';
ok(["'/portal/project-video'", "'/portal/project-video/:id/presign'", "'/portal/project-video/:id/versions'", "'/portal/project-video/:id/submit'", "'/portal/project-video/:id/url'"].every(p => line(p).includes('portal.portalAuth')), 'las rutas del club exigen la sesión del panel');
ok(routes.indexOf("'/admin/project-videos/config'") < routes.indexOf("'/admin/project-videos/:id'") && line("router.put('/admin/project-videos/config'").includes('fairManage') && line("'/admin/project-videos/:id/status'").includes('fairEdit'), 'la configuración es literal antes de /:id; guardar exige gestión y revisar exige edición');
const ensure = read('server/lib/ensureProjectVideoSchema.js');
const adds = [...ensure.matchAll(/ALTER TABLE "(\w+)" ADD COLUMN IF NOT EXISTS "?(\w+)"?/g)].map(x => `${x[1]}.${x[2]}`);
const owned = Object.entries(OWNED_COLUMNS).flatMap(([t, cs]) => cs.map(x => `${t}.${x}`));
ok(adds.every(a => owned.includes(a)) && owned.every(o => adds.includes(o)), 'todo ADD COLUMN está en OWNED_COLUMNS (y viceversa)');
const claude = read('CLAUDE.md'); const guard = read('scripts/db-push-guard.mjs');
for (const t of Object.keys(OWNED_COLUMNS)) ok(claude.includes(`\`${t}\``) && guard.includes(t), `${t}: en la lista del guardián de db:push y de CLAUDE.md`);
ok(claude.includes('docs/claude/videos-de-proyectos.md') && read('docs/claude/videos-de-proyectos.md').length > 1500, 'el módulo tiene su archivo en docs/claude y está en la tabla');

console.log('── «Mi proyecto» y el panel');
const mp = read('src/pages/MiProyecto.tsx');
const grid = mp.slice(mp.indexOf('Formularios y recursos del proyecto'));
ok(grid.indexOf('<ProjectVideoCard') > 0 && grid.indexOf('<ProjectVideoCard') < grid.indexOf('<VideoPitchCard') && grid.indexOf('<NextStepCard') < grid.indexOf('<ProjectVideoCard'), 'los dos caminos van lado a lado tras la plantilla y 31A: video propio a la izquierda, Video Pitch a la derecha');
ok(!read('src/components/project-forms/VideoPitchCard.tsx').includes('sm:col-span-2') && read('src/components/project-forms/VideoPitchCard.tsx').includes('Producción profesional · Servicio de pago') && read('src/components/project-forms/ProjectVideoCard.tsx').includes('Video propio · Sin costo'), 'cada tarjeta dice qué es: «Video propio · Sin costo» y «Producción profesional · Servicio de pago»');
const view = read('src/components/project-forms/ProjectVideoView.tsx');
ok(!/^\s+const [A-Z]\w* = \(\{[^)]*\}\) => \(?\s*</m.test(view.slice(view.indexOf('const ProjectVideoView'))), 'ningún componente declarado dentro de la vista');
ok(view.includes("'confirming'") && view.includes('Confirmando con el servidor') && !/>\s*Subido correctamente/.test(view), '«recibido» sólo se dice cuando el servidor registró la versión');
ok(!/stripe|Stripe|checkout|Pagar/.test(view), 'la vista del video propio no tiene pago');
const admin = read('src/components/admin/feria/ProjectVideosAdmin.tsx');
ok(admin.includes("['own', 'Videos propios', UploadCloud]") && admin.includes("['pitch', 'Video Pitch Profesional', Clapperboard]") && admin.includes('<VideoPitchAdmin eventId={eventId} />'), 'el módulo unificado tiene las dos pestañas y reutiliza la administración del Video Pitch');
ok(!/^\s+const [A-Z]\w* = \(\{[^)]*\}\) => \(?\s*</m.test(admin.slice(admin.indexOf('const ProjectVideosHub'))), 'ningún componente declarado dentro del hub');
ok(read('src/pages/admin/PostulacionesPagos.tsx').includes("['videopitch', 'Videos de proyectos', Clapperboard]") && read('src/components/admin/AdminLayout.tsx').includes("label: 'Videos de proyectos'"), 'la pestaña y el menú se llaman «Videos de proyectos»');

console.log(`\n✅ ${n} comprobaciones, todas en verde.`);
