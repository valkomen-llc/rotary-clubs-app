#!/usr/bin/env node
/**
 * Canal de Capacitaciones (v4.954) — el criterio y el camino
 * ==========================================================
 *
 * Dos mitades, como manda el sitio:
 *
 *  1) EL CRITERIO (trainingChannelSpec.js, puro): el veredicto de acceso, la
 *     herencia de la vista previa, el progreso y la completitud, los
 *     comentarios, el orden y los saneados. Sin base, sin red, sin IA.
 *
 *  2) EL CAMINO, leyendo los archivos: que las rutas existan y estén
 *     protegidas, que el alta de cuenta REUTILICE la identidad del Asistente
 *     al Evento (no un segundo sistema de usuarios), que la URL sólo viaje
 *     con veredicto favorable, que el ensure enumere sus tablas, que las
 *     tablas NO estén en schema.prisma, y que la pantalla tenga cableado el
 *     candado con reanudación sin recargar. El criterio puede estar bien y el
 *     defecto vivir en el camino (v4.744).
 *
 *   npm run test:training
 */

import { readFileSync } from 'node:fs';
import spec, {
    ACCESS_MODES, VIDEO_STATES, METRIC_TYPES, CLIENT_METRIC_TYPES,
    accessVerdict, resolvePreviewSec, resolveCommentsEnabled, rolesOf,
    viewerKeyOf, isAnonId, applyProgress, resumePosition, validateComment,
    buildCommentTree, compareVideos, matchesSearch, sanitizeVideoPatch,
    sanitizeChannelPatch, trainingSlug, videoCard, fmtDuration,
} from '../server/lib/trainingChannelSpec.js';

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  OK    ${name}`); }
    else { fail++; console.log(`  FALLA ${name}${extra ? ` — ${extra}` : ''}`); }
};
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// ════════════════════════════════════════════════════════════════════
console.log('\n▸ El veredicto de acceso');

const canal = { defaultPreviewSec: 60, completionPct: 90 };
const anon = { authenticated: false, roles: [], anonId: '11111111-2222-3333-4444-555555555555' };
const conCuenta = { authenticated: true, roles: ['registrado', 'asistente_evento'] };

check('publico + anónimo → completo',
    accessVerdict({ video: { accessMode: 'publico' }, channel: canal, viewer: anon }).allowed === 'full');
check('preview + anónimo → vista previa con los segundos del CANAL',
    (() => { const v = accessVerdict({ video: { accessMode: 'preview' }, channel: canal, viewer: anon }); return v.allowed === 'preview' && v.allowedSec === 60; })());
check('preview + anónimo con previewSec propio (30) → 30',
    accessVerdict({ video: { accessMode: 'preview', previewSec: 30 }, channel: canal, viewer: anon }).allowedSec === 30);
check('previewSec 0 EXPLÍCITO es «sin vista previa», no «hereda»',
    accessVerdict({ video: { accessMode: 'preview', previewSec: 0 }, channel: canal, viewer: anon }).allowed === 'none');
check('preview + con cuenta → completo',
    accessVerdict({ video: { accessMode: 'preview' }, channel: canal, viewer: conCuenta }).allowed === 'full');
check('autenticados + anónimo → candado con motivo auth',
    (() => { const v = accessVerdict({ video: { accessMode: 'autenticados' }, channel: canal, viewer: anon }); return v.allowed === 'none' && v.reason === 'auth'; })());
check('autenticados + con cuenta → completo',
    accessVerdict({ video: { accessMode: 'autenticados' }, channel: canal, viewer: conCuenta }).allowed === 'full');
check('roles + anónimo → primero la cuenta (auth)',
    accessVerdict({ video: { accessMode: 'roles', allowedRoles: ['admin_sitio'] }, channel: canal, viewer: anon }).reason === 'auth');
check('roles + con cuenta SIN el rol → sin_rol',
    accessVerdict({ video: { accessMode: 'roles', allowedRoles: ['admin_sitio'] }, channel: canal, viewer: conCuenta }).reason === 'sin_rol');
check('roles + con cuenta CON el rol → completo',
    accessVerdict({ video: { accessMode: 'roles', allowedRoles: ['asistente_evento'] }, channel: canal, viewer: conCuenta }).allowed === 'full');
check('roles con lista VACÍA equivale a autenticados (no deja el video inalcanzable)',
    accessVerdict({ video: { accessMode: 'roles', allowedRoles: [] }, channel: canal, viewer: conCuenta }).allowed === 'full');
check('privado → nadie, ni con cuenta',
    accessVerdict({ video: { accessMode: 'privado' }, channel: canal, viewer: conCuenta }).allowed === 'none');
check('un modo desconocido cae a publico (catálogo cerrado con respaldo declarado)',
    accessVerdict({ video: { accessMode: 'inventado' }, channel: canal, viewer: anon }).allowed === 'full');

// ════════════════════════════════════════════════════════════════════
console.log('\n▸ Herencia: vista previa y comentarios');

check('sin valor propio hereda del canal', resolvePreviewSec({}, canal) === 60);
check('null hereda; 0 manda (undefined vs valor, v4.877)',
    resolvePreviewSec({ previewSec: null }, canal) === 60 && resolvePreviewSec({ previewSec: 0 }, canal) === 0);
check('sin canal, el default del módulo (60)', resolvePreviewSec({}, null) === 60);
check('comentarios: null hereda del canal', resolveCommentsEnabled({ commentsEnabled: null }, { commentsEnabled: false }) === false);
check('comentarios: el video puede ENCENDER sobre un canal apagado', resolveCommentsEnabled({ commentsEnabled: true }, { commentsEnabled: false }) === true);

// ════════════════════════════════════════════════════════════════════
console.log('\n▸ El espectador: roles acumulados y su clave');

const acumulados = rolesOf(['platform', 'attendee']);
check('los roles se ACUMULAN entre identidades (v4.711)',
    acumulados.includes('admin_sitio') && acumulados.includes('asistente_evento') && acumulados.filter(r => r === 'registrado').length === 1);
check('con sesión, la clave es de la persona; sin ella, del navegador',
    viewerKeyOf({ realm: 'attendee', id: 'abc', anonId: anon.anonId }) === 'attendee:abc'
    && viewerKeyOf({ anonId: anon.anonId }) === `anon:${anon.anonId}`);
check('un anonId que no es UUID no genera clave', viewerKeyOf({ anonId: 'x"; DROP TABLE' }) === null);
check('isAnonId acepta el UUID y rechaza el resto', isAnonId(anon.anonId) && !isAnonId('123') && !isAnonId(''));

// ════════════════════════════════════════════════════════════════════
console.log('\n▸ Progreso y completitud');

const p1 = applyProgress({ row: null, positionSec: 55, deltaSec: 10, durationSec: 100, completionPct: 90 });
check('el primer latido escribe posición y segundos', p1.maxPositionSec === 55 && p1.secondsWatched === 10 && !p1.completedNow);
const p2 = applyProgress({ row: { secondsWatched: 10, maxPositionSec: 55 }, positionSec: 92, deltaSec: 500, durationSec: 100, completionPct: 90 });
check('un delta inflado se ACOTA (nunca regala completitud por reporte roto)', p2.secondsWatched === 70);
check('al cruzar el umbral se completa UNA vez', p2.completedNow && p2.pctWatched === 92);
const p3 = applyProgress({ row: { secondsWatched: 70, maxPositionSec: 92, completedAt: 'AYER' }, positionSec: 10, deltaSec: 5, durationSec: 100, completionPct: 90 });
check('lo completado no se des-completa ni retrocede', p3.completedAt === 'AYER' && !p3.completedNow && p3.maxPositionSec === 92);
check('un umbral imposible (anónimo) nunca completa',
    !applyProgress({ row: null, positionSec: 100, deltaSec: 30, durationSec: 100, completionPct: 1000 }).completedNow);
check('reanudar retrocede un pelo y al final vuelve al principio',
    resumePosition({ maxPositionSec: 50 }, 100) === 47 && resumePosition({ maxPositionSec: 97 }, 100) === 0);

// ════════════════════════════════════════════════════════════════════
console.log('\n▸ Comentarios');

check('vacío o pasado de largo se rechaza con motivo',
    !validateComment({ body: '  ' }).ok && !validateComment({ body: 'x'.repeat(2001) }).ok);
check('responder a una RESPUESTA cuelga del comentario raíz (un solo nivel)',
    validateComment({ body: 'hola', parent: { id: 'r1', parentId: 'root' } }).parentId === 'root');
const arbol = buildCommentTree([
    { id: 'a', parentId: null, status: 'visible', pinned: false, createdAt: '2026-01-01' },
    { id: 'b', parentId: null, status: 'visible', pinned: true, createdAt: '2025-01-01' },
    { id: 'c', parentId: 'a', status: 'visible', createdAt: '2026-01-02' },
    { id: 'd', parentId: null, status: 'borrado', createdAt: '2026-02-01' },
    { id: 'e', parentId: 'd', status: 'visible', createdAt: '2026-02-02' },
    { id: 'f', parentId: null, status: 'oculto', createdAt: '2026-03-01' },
    { id: 'g', parentId: null, status: 'borrado', createdAt: '2026-03-02' },
]);
check('fijado primero; oculto/spam fuera; borrado con respuestas queda como hueco; borrado solo desaparece',
    arbol[0].id === 'b' && arbol.some(r => r.id === 'd' && r.replies.length === 1)
    && !arbol.some(r => r.id === 'f') && !arbol.some(r => r.id === 'g'));

// ════════════════════════════════════════════════════════════════════
console.log('\n▸ Orden, búsqueda y tarjeta');

const ordenados = [
    { id: 'z', sortOrder: null, publishedAt: '2026-05-01' },
    { id: 'a', sortOrder: 2 },
    { id: 'b', sortOrder: 1 },
    { id: 'y', sortOrder: null, publishedAt: '2026-01-01' },
].sort(compareVideos);
check('el orden MANUAL manda; sin orden, lo más nuevo primero',
    ordenados.map(v => v.id).join(',') === 'b,a,z,y');
check('la búsqueda es Y de palabras sobre título/instructor/etiquetas',
    matchesSearch({ title: 'Subvenciones globales', instructor: 'Ana Pérez', tags: ['fondos'] }, 'ana fondos')
    && !matchesSearch({ title: 'Subvenciones' }, 'ana fondos'));
const card = videoCard({ slug: 's', title: 'T', accessMode: 'preview', mediaUrl: 'https://s3/x.mp4', mediaId: 'M1' }, canal, { views: 3 });
check('la tarjeta pública NO filtra el archivo ni el id interno',
    !('mediaUrl' in card) && !('mediaId' in card) && card.previewSec === 60 && card.views === 3);
check('fmtDuration: 65 → 1:05 y 3665 → 1:01:05', fmtDuration(65) === '1:05' && fmtDuration(3665) === '1:01:05');

// ════════════════════════════════════════════════════════════════════
console.log('\n▸ Los saneados (catálogo CERRADO de lo editable)');

const patch = sanitizeVideoPatch({
    title: 'Nuevo', mediaId: 'HACK', channelId: 'HACK', accessMode: 'roles',
    allowedRoles: ['asistente_evento', 'inventado'], previewSec: '', slug: 'Mi Título Ñoño',
});
check('mediaId y channelId no se pueden ni expresar (patrón stripProtected)',
    !('mediaId' in patch.fields) && !('channelId' in patch.fields) && patch.errors.length === 0);
check('los roles se filtran al catálogo', patch.fields.allowedRoles.join(',') === 'asistente_evento');
check('previewSec vacío es «hereda» (null)', patch.fields.previewSec === null);
check('el slug se normaliza con el slugify del sitio', patch.fields.slug === 'mi-titulo-nono');
check('un modo o estado desconocido es ERROR, no silencio',
    sanitizeVideoPatch({ accessMode: 'x' }).errors.length === 1 && sanitizeVideoPatch({ status: 'x' }).errors.length === 1);
check('el canal acota la completitud a 50-100 y la vista previa a 0-3600',
    sanitizeChannelPatch({ completionPct: 30 }).errors.length === 1
    && sanitizeChannelPatch({ defaultPreviewSec: 9999 }).errors.length === 1
    && sanitizeChannelPatch({ completionPct: 90, defaultPreviewSec: 120 }).errors.length === 0);
check('trainingSlug corta a 75 sin partir palabra', trainingSlug('Capacitación de Prueba') === 'capacitacion-de-prueba');
check('los catálogos son los declarados',
    ACCESS_MODES.length === 5 && VIDEO_STATES.length === 4
    && CLIENT_METRIC_TYPES.every(t => METRIC_TYPES.includes(t))
    && !CLIENT_METRIC_TYPES.includes('signup_from_lock') && !CLIENT_METRIC_TYPES.includes('completion'));

// ════════════════════════════════════════════════════════════════════
console.log('\n▸ El camino (leyendo los archivos)');

const rutas = src('server/routes/trainings.js');
check('TODA ruta /admin lleva authMiddleware + requireSiteAdmin',
    rutas.split('\n').filter(l => l.includes("'/admin/")).every(l => l.includes('authMiddleware') && l.includes('requireSiteAdmin'))
    && rutas.split('\n').filter(l => l.includes("'/admin/")).length >= 9);
check('las ocho rutas públicas existen',
    ['public/channel', 'public/video', 'public/watch', 'public/progress', 'public/track', 'public/comments', 'public/signup']
        .every(p => rutas.includes(`'/${p}'`)));

const api = src('api/index.js');
check('el router está montado en /api/trainings', api.includes("app.use('/api/trainings'") && api.includes('routes/trainings.js'));

const ctrl = src('server/controllers/trainingChannelController.js');
check('«Crear cuenta» REUTILIZA la identidad del Asistente al Evento (no hay segundo sistema de usuarios)',
    ctrl.includes('ensureAttendeeAccount({') && ctrl.includes('issueAttendeeSession(result.account)')
    && !ctrl.includes("from 'bcrypt"));
check('la URL del archivo sólo viaja con veredicto favorable',
    /allowed === 'none'\)\s*\{\s*return res\.json\(\{ allowed: 'none', reason: verdict\.reason \}\);/.test(ctrl));
check('el progreso del anónimo no puede completar (umbral imposible)',
    ctrl.includes('viewer.authenticated ? (channel.completionPct || 90) : 1000'));
check('el track del navegador pasa por el catálogo CERRADO y trae freno',
    ctrl.includes('CLIENT_METRIC_TYPES.includes(type)') && ctrl.includes('brakeOk('));
check('el aislamiento de la ficha va en el WHERE (join por clubId)',
    ctrl.includes('JOIN "MediaChannel" c ON c.id = v."channelId"') && ctrl.includes('c."clubId" = $2'));
check('el veredicto acota también la POSICIÓN reportada en vista previa',
    ctrl.includes('positionSec = Math.min(positionSec, verdict.allowedSec)'));
check('las conversiones del candado las escribe el SERVIDOR',
    ctrl.includes("type: 'signup_from_lock'") && ctrl.includes("type: 'completion'"));
check('la lectura pública del canal DEGRADA (nunca 500 al visitante)',
    ctrl.includes('return res.json({ channel: null });'));
check('un slug ocupado se libera con sufijo y se AVISA (regla v4.873)',
    ctrl.includes('freeVideoSlug') && ctrl.includes('slugChanged'));

const ensure = src('server/lib/ensureTrainingChannelSchema.js');
const creadas = [...ensure.matchAll(/CREATE TABLE IF NOT EXISTS "(\w+)"/g)].map(m => m[1]);
check('el atajo del ensure enumera TODAS las tablas que crea (la trampa de v4.908)',
    creadas.length === 5 && creadas.every(t => new RegExp(`OWNED_TABLES = \\[[^\\]]*'${t}'`, 's').test(ensure)),
    creadas.join(','));
check('el ensure jamás destruye', !/DROP TABLE|TRUNCATE/.test(ensure));
check('el índice de métricas NO es parcial: videoId es NOT NULL con \'\' (v4.648)',
    ensure.includes(`"videoId" TEXT NOT NULL DEFAULT ''`) && !ensure.includes('WHERE "videoId"'));

const prisma = src('server/prisma/schema.prisma');
check('las cinco tablas viven FUERA de Prisma (regla de logo_intl, v4.699)',
    creadas.every(t => !new RegExp(`model\\s+${t}\\b`).test(prisma)));

const seoServe = src('server/lib/seoServe.js');
check('el <head> del canal se resuelve en el SERVIDOR y un slug muerto es 404 real',
    seoServe.includes('trainingSeoFor') && seoServe.includes('trainingSeo?.notFound') && seoServe.includes('page.found = false'));

const appTsx = src('src/App.tsx');
check('las dos rutas públicas están registradas con lazyWithRetry',
    appTsx.includes(`path="/capacitaciones"`) && appTsx.includes(`path="/capacitaciones/:slug"`)
    && appTsx.includes("lazyWithRetry(() => import('./pages/Capacitaciones')")
    && appTsx.includes("lazyWithRetry(() => import('./pages/CapacitacionDetalle')"));

// v4.955 — el cromo del sitio se monta POR PÁGINA en esta aplicación (el
// Navbar vive dentro de cada página): sin estas dos comprobaciones, el canal
// volvió a salir «plano» — sin barra superior, sin menú y sin pie— y nada
// avisó. TODOS los returns pasan por el Shell que lo monta.
for (const [nombre, ruta] of [['el canal', 'src/pages/Capacitaciones.tsx'], ['la página del video', 'src/pages/CapacitacionDetalle.tsx']]) {
    const pagina = src(ruta);
    check(`${nombre} monta la barra del sitio y el pie (Navbar + Footer) en TODOS los returns`,
        pagina.includes("from '../sections/Navbar'") && pagina.includes("from '../sections/Footer'")
        && /<Navbar \/>/.test(pagina) && /<Footer \/>/.test(pagina)
        && !/return\s*\(\s*<div/.test(pagina) && !/return\s*<div/.test(pagina));
}

const detalle = src('src/pages/CapacitacionDetalle.tsx');
check('el candado ofrece las tres salidas: iniciar sesión, crear cuenta y volver',
    detalle.includes('openLoginModal') && detalle.includes('Crear cuenta') && detalle.includes('Volver a capacitaciones'));
check('tras el ingreso se reanuda SIN recargar (onLoginSuccess → re-veredicto → seek)',
    detalle.includes('onLoginSuccess(') && detalle.includes('lockedAtRef.current') && !detalle.includes('window.location.reload'));
check('el alta guarda el token en la llave de siempre y avisa al encabezado',
    detalle.includes('TOKEN_KEY.attendee') && detalle.includes('emitSessionChange()'));
check('el tope de la vista previa PAUSA en el cliente y reporta el candado',
    detalle.includes('v.currentTime >= playback.allowedSec') && detalle.includes("type: 'preview_lock'"));

const biblioteca = src('src/pages/admin/MediaLibrary.tsx');
check('«Administrar canal» vive DENTRO de la carpeta de la Biblioteca (sin CMS aparte)',
    biblioteca.includes('Administrar canal') && biblioteca.includes('ChannelAdminPanel'));
check('«Copiar enlace de capacitación» convive con el de la URL directa, que no se toca',
    biblioteca.includes('Copiar enlace de capacitación') && biblioteca.includes('copyToClipboard(item.url)'));

const specSrc = src('server/lib/trainingChannelSpec.js');
check('no hay un segundo slugify: se importa el de seoSpec (regla v4.873)',
    specSrc.includes("import { slugify } from './seoSpec.js'") && !/const slugify\s*=/.test(specSrc));

// ════════════════════════════════════════════════════════════════════
console.log(`\n${pass} OK, ${fail} FALLA(s)\n`);
process.exit(fail ? 1 : 0);
