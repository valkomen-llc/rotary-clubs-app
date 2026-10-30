#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Plantilla oficial de presentación (Recursos del proyecto) — v4.1264.0
// npm run test:fair:resources
//
// Sin base ni red: el criterio puro (formatos, tipo REAL por los bytes,
// tarjeta del club, adopción) y las invariantes que ninguna otra barrera ve:
// la entrega se registra ANTES de devolver el enlace, la descarga no toca el
// pago ni el proyecto, los permisos de cada ruta, el orden de la cuadrícula de
// «Mi proyecto» y el atajo del ensure. El recorrido completo contra Postgres y
// un S3 simulado se hizo al entregar (ver docs/claude/plantilla-de-presentacion.md).
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {
    RESOURCE_KEYS, RESOURCE_FORMATS, DEFAULT_MAX_MB, LIMIT_MAX_MB, clampMaxMb, scopeOf, checkUploadMeta, sniffFormat,
    judgeUploadedFile, downloadFileName, contentDisposition, cardStateOf, summarizeTracking, byDistrict,
    filterTracking, trackingCsv, normalizeTrackingFilter,
} from '../server/lib/projectFairResourceSpec.js';

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log(`  ✓ ${msg}`); };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

console.log('── Formatos y tope');
ok(RESOURCE_KEYS.join() === 'presentation_template', 'un recurso: la plantilla de presentación');
ok(Object.keys(RESOURCE_FORMATS).join() === 'pptx,pdf', 'sólo PPTX y PDF');
ok(clampMaxMb('x') === DEFAULT_MAX_MB && clampMaxMb(0) === 1 && clampMaxMb(9999) === LIMIT_MAX_MB, 'el tope se acota entre 1 y 200 MB');
ok(scopeOf('') === 'global' && scopeOf('evt-1') === 'evt-1', 'el ámbito es la edición, o global');
ok(checkUploadMeta({ filename: 'p.pptx', size: 10 }).ok, 'un PPTX con peso pasa la comprobación previa');
ok(!checkUploadMeta({ filename: 'p.key', size: 10 }).ok, 'Keynote no se admite');
ok(!checkUploadMeta({ filename: 'p.pdf', size: 0 }).ok, 'vacío: rechazado');
ok(!checkUploadMeta({ filename: 'p.pdf', size: 6 * 1024 * 1024, maxMb: 5 }).ok, 'más pesado que el tope configurado: rechazado');

console.log('── Tipo REAL por los bytes');
const zipOf = async (files) => {
    const z = new JSZip();
    for (const [name, body] of Object.entries(files)) z.file(name, body);
    return z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
};
const pptx = await zipOf({ '[Content_Types].xml': '<Types/>', 'ppt/presentation.xml': '<p:presentation/>', 'ppt/slides/slide1.xml': 'x'.repeat(9000) });
const docx = await zipOf({ '[Content_Types].xml': '<Types/>', 'word/document.xml': '<w:document/>' });
const pdf = Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n%%EOF');
const headTail = (b) => [b.subarray(0, 4096), b.length > 4096 ? b.subarray(-65536) : Buffer.alloc(0)];
ok(sniffFormat(...headTail(pdf)) === 'pdf', 'un PDF real se reconoce');
ok(sniffFormat(...headTail(pptx)) === 'pptx', 'un PPTX real (ZIP con ppt/presentation.xml) se reconoce');
ok(sniffFormat(...headTail(docx)) === 'zip', 'un DOCX es ZIP pero NO es presentación');
ok(sniffFormat(Buffer.from('MZ\x90\x00'), null) === null, 'un ejecutable no es nada admitido');
const judge = (filename, b, maxMb) => judgeUploadedFile({ filename, bytes: b.length, head: headTail(b)[0], tail: headTail(b)[1], maxMb });
ok(judge('plantilla.pptx', pptx).ok && judge('plantilla.pptx', pptx).format === 'pptx', 'PPTX con extensión correcta: aceptado');
ok(judge('Plantilla.PDF', pdf).ok, 'la extensión en mayúsculas también vale');
ok(!judge('plantilla.pptx', docx).ok, 'un DOCX renombrado a .pptx: rechazado');
ok(!judge('plantilla.pdf', pptx).ok && /PPTX/.test(judge('plantilla.pdf', pptx).error), 'un PPTX llamado .pdf: rechazado y se dice qué es');
ok(!judge('virus.pdf', Buffer.from('MZ\x90\x00' + 'x'.repeat(100))).ok, 'un binario cualquiera renombrado: rechazado');
ok(!judgeUploadedFile({ filename: 'a.pdf', bytes: 0, head: pdf, tail: null }).ok, 'el peso REAL manda: cero bytes es rechazo');
ok(!judgeUploadedFile({ filename: 'a.pdf', bytes: 3 * 1024 * 1024, head: pdf, tail: null, maxMb: 2 }).ok, 'el peso REAL por encima del tope: rechazo');

console.log('── Nombre de la descarga');
ok(downloadFileName('Plantilla de presentación del proyecto', 2, 'pptx') === 'Plantilla de presentación del proyecto - v2.pptx', 'título + versión + extensión');
ok(!/[\\/:*?"<>|]/.test(downloadFileName('a/b:c*d?"e<f>g|h', 1, 'pdf')), 'sin caracteres prohibidos en un nombre de archivo');
const cd = contentDisposition('Presentación - v1.pdf');
ok(cd.startsWith('attachment;') && cd.includes('filename="Presentacion - v1.pdf"') && cd.includes("filename*=UTF-8''Presentaci%C3%B3n"), 'Content-Disposition: attachment, respaldo ASCII y UTF-8');

console.log('── La tarjeta del club');
const v1 = { versionNumber: 1, format: 'pptx', sizeBytes: 2_500_000, publishedAt: '2026-10-01T10:00:00Z' };
const v2 = { ...v1, versionNumber: 2 };
const sinNada = cardStateOf({ resource: null, version: null, myLastDelivered: null });
ok(!sinNada.available && sinNada.message === 'La plantilla oficial estará disponible próximamente.', 'sin configurar: «disponible próximamente» y sin botón');
ok(sinNada.title === 'Plantilla de presentación del proyecto' && /XII Feria de Proyectos Rotary Colombia 2027/.test(sinNada.description), 'título y descripción del pedido por defecto');
ok(!cardStateOf({ resource: { key: 'presentation_template', active: false }, version: v1 }).available, 'desactivada: no disponible aunque haya archivo');
const pub = cardStateOf({ resource: { key: 'presentation_template', active: true, title: 'T', description: 'D' }, version: v1 });
ok(pub.available && !pub.updated && !pub.downloaded && pub.version.formatLabel === 'PPTX' && pub.version.sizeLabel === '2,4 MB', 'publicada v1: disponible, formato y tamaño');
const upd = cardStateOf({ resource: { key: 'presentation_template', active: true }, version: v2, myLastDelivered: { at: '2026-10-05', versionNumber: 1 } });
ok(upd.updated && upd.downloaded && upd.newerSinceDownload, 'v2: «actualizada», ya descargada y con versión más reciente que la bajada');
const same = cardStateOf({ resource: { key: 'presentation_template', active: true }, version: v2, myLastDelivered: { at: '2026-10-06', versionNumber: 2 } });
ok(same.downloaded && !same.newerSinceDownload && same.available, 'ya descargada NO bloquea: sigue disponible');

console.log('── Adopción y seguimiento');
const row = (o) => ({ submissionId: o.id, accountId: o.acc ?? `acc-${o.id}`, clubName: o.club || 'Club A', district: o.d || '4271', projectName: `P ${o.id}`, responsible: `R ${o.id}`, email: `${o.id}@x.org`, publicRef: `FP-${o.id}`, eligible: o.eligible ?? true, deliveredCount: o.del || 0, failedCount: o.fail || 0, lastDeliveredAt: o.last || null, projectStateLabel: 'Postulado' });
const rows = [
    row({ id: '1', del: 3, last: '2026-10-03T00:00:00Z' }),
    row({ id: '2', del: 1, club: 'Club B', d: '4281', last: '2026-10-09T00:00:00Z' }),
    row({ id: '3', fail: 2, club: 'Club C' }),                      // sólo intentos fallidos
    row({ id: '4', club: 'Club C' }),                               // nunca lo intentó
    row({ id: '5', del: 1, eligible: false, club: 'Club D' }),      // borrador que descargó
];
const k = summarizeTracking(rows);
ok(k.eligibleProjects === 4 && k.projectsWithDownload === 2 && k.pendingProjects === 2, 'pendientes = elegibles sin entrega (incluye a quien nunca lo intentó)');
ok(k.totalDelivered === 5 && k.totalFailed === 2, 'los fallidos se cuentan aparte, nunca como descargas');
ok(k.uniqueUsers === 3, 'usuarios únicos ≠ total de descargas');
ok(k.adoptionPct === 50, 'adopción = 2 de 4 elegibles = 50 %; el borrador no entra en el denominador');
ok(k.clubsWithDownload === 2 && k.clubsPending === 1, 'clubes con descarga y pendientes');
ok(k.lastDeliveredAt === '2026-10-09T00:00:00Z', 'última descarga registrada');
const dist = byDistrict(rows);
ok(dist.find(d => d.district === '4271').eligible === 3 && dist.find(d => d.district === '4281').adoptionPct === 100, 'por distrito, sobre los elegibles');
ok(filterTracking(rows, { estado: 'pending' }).map(r => r.submissionId).join() === '3,4', '«No han descargado»: 3 y 4 (no el borrador)');
ok(filterTracking(rows, { estado: 'downloaded' }).length === 3, '«Ya descargaron» incluye al borrador que descargó');
ok(filterTracking(rows, { q: 'club b' }).length === 1 && filterTracking(rows, { district: '4281' }).length === 1, 'búsqueda y distrito');
ok(normalizeTrackingFilter('x') === 'all', 'un filtro desconocido no filtra');
const csv = trackingCsv(rows);
ok(csv.startsWith('﻿Responsable;Correo;Club Rotario;Distrito;Proyecto') && csv.split('\n').length === 6, 'CSV con BOM, «;» y una fila por proyecto');

console.log('── Invariantes del controlador');
const ctrl = read('server/controllers/projectFairResourceController.js');
const dl = ctrl.slice(ctrl.indexOf('export const portalDownload'));
ok(dl.indexOf("SET status = 'delivered'") > 0 && dl.indexOf("SET status = 'delivered'") < dl.indexOf('res.json({ url'), 'la ENTREGA se registra antes de devolver el enlace');
ok(dl.indexOf('DOWNLOAD_STATUS.REQUESTED') < dl.indexOf('resourceObjectExists'), 'la SOLICITUD se registra antes de tocar el almacenamiento');
ok(dl.indexOf('resourceObjectExists') < dl.indexOf('signedResourceDownload'), 'se comprueba que el archivo exista antes de firmar');
ok(/WHERE id = \$1 AND status = 'requested'/.test(dl), 'una entrega sólo sale de una solicitud abierta');
ok(dl.includes("req.portal.submissionId") || ctrl.includes('req.portal.submissionId'), 'la postulación sale del token');
ok(ctrl.includes('"submissionId" = $2') && ctrl.includes('WHERE id = $1 AND "submissionId" = $2'), 'la cuenta del token tiene que ser de esa postulación');
ok(!/UPDATE "ProjectFairSubmission"|UPDATE "ProjectFairMasterForm"|UPDATE "ProjectFairProjectForm"|beginCheckout|workflowStatus" =/.test(ctrl), 'descargar no toca pago, estado del proyecto ni formularios');
ok(!/amazonaws\.com/.test(ctrl) && !/amazonaws\.com/.test(read('src/components/project-forms/ProjectResourceCards.tsx')), 'ninguna URL fija de almacenamiento');
const cap = (name) => ctrl.match(new RegExp(`export const ${name} = [\\s\\S]*?\\}, '(\\w+)'\\);`))?.[1];
ok(['adminUpdateResource', 'adminPresignUpload', 'adminRegisterVersion'].every(h => cap(h) === 'config'), 'subir, publicar, reemplazar y editar exigen «config»');
ok(cap('adminAnalyticsCsv') === 'export' && cap('adminAnalytics') === 'view', 'exportar exige «export»; consultar, «view»');
ok(ctrl.trimEnd().endsWith('};') && ctrl.lastIndexOf('export default {') > ctrl.lastIndexOf('export const'), '`export default` al final del archivo');

console.log('── Rutas');
const routes = read('server/routes/project-fair.js');
const line = (frag) => routes.split('\n').find(l => l.includes(frag)) || '';
ok(line("'/portal/resources'").includes('portal.portalAuth') && line("'/portal/resources/:key/download'").includes('portal.portalAuth'), 'las rutas del club exigen la sesión del panel');
for (const p of ["router.put('/admin/recursos/:key'", "'/admin/recursos/:key/presign'", "'/admin/recursos/:key/versions',"]) {
    ok(line(p).includes('authMiddleware') && line(p).includes('fairManage'), `${p.replace(/router\.\w+\(/, '')} exige sesión y gestión del módulo`);
}
ok(['/admin/recursos\'', '/admin/recursos/:key/analytics\'', '/admin/recursos/:key/analytics.csv\''].every(p => line(p).includes('authMiddleware') && line(p).includes('fairRead')), 'las de lectura exigen sesión y acceso al módulo');

console.log('── «Mi proyecto»');
const mp = read('src/pages/MiProyecto.tsx');
const grid = mp.slice(mp.indexOf('Formularios y recursos del proyecto'));
const iForms = grid.indexOf('forms.map(form => <FormCardTile');
const iTpl = grid.indexOf('<PresentationTemplateCard');
const iNext = grid.indexOf('<NextStepCard');
const iClose = grid.indexOf('</div>', iForms);
ok(iForms > 0 && iForms < iTpl && iTpl < iNext && iNext < iClose, 'misma cuadrícula: formularios, luego plantilla (bajo la Formulación) y 31A (bajo el FDD)');
ok(grid.slice(0, iClose).includes('grid gap-4 sm:grid-cols-2'), 'dos columnas en escritorio, una en el móvil');
ok(!mp.includes('rounded-2xl border border-slate-200 bg-white p-6 text-center'), 'la banda de ancho completo de 31A ya no existe');
const card = read('src/components/project-forms/ProjectResourceCards.tsx');
ok(card.includes("'No fue posible descargar la plantilla. Inténtalo nuevamente.'"), 'mensaje de error del pedido');
ok(card.includes('/project-fair/portal/resources/presentation_template/download') && card.includes("method: 'POST'"), 'el botón pide la descarga al servidor con la sesión');
ok(card.includes('Ya descargaste esta plantilla') && card.includes('Plantilla actualizada') && card.includes('Preparando descarga'), 'estados: ya descargada, actualizada y preparando');
ok(read('src/pages/admin/PostulacionesPagos.tsx').includes("['resources', 'Recursos y plantillas'"), 'pestaña «Recursos y plantillas» en Postulación de Proyectos');

console.log('── Esquema');
const ensure = read('server/lib/ensureProjectFairResourceSchema.js');
const { OWNED_COLUMNS } = await import('../server/lib/ensureProjectFairResourceSchema.js');
const addCols = [...ensure.matchAll(/ALTER TABLE "(\w+)" ADD COLUMN IF NOT EXISTS "?(\w+)"?/g)];
ok(addCols.every(([, t, c]) => (OWNED_COLUMNS[t] || []).includes(c)), `todo ADD COLUMN va enumerado en el atajo (${addCols.length})`);
for (const f of ['server/lib/ensureProjectFairResourceSchema.js', 'server/controllers/projectFairResourceController.js']) {
    const src = read(f);
    const closed = [...src.matchAll(/db\.query\(\s*`([^`]*)`/g)].length;
    const opened = (src.match(/db\.query\(\s*`/g) || []).length;
    ok(closed === opened, `${f}: ningún SQL con una comilla invertida dentro`);
}
for (const t of Object.keys(OWNED_COLUMNS)) {
    ok(read('scripts/db-push-guard.mjs').includes(t) && read('CLAUDE.md').includes(t), `${t}: en la lista del guardián de db:push y de CLAUDE.md`);
}

console.log(`\n✅ ${n} comprobaciones, todas en verde.`);
