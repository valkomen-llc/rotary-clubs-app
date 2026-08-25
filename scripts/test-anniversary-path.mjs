#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Aniversarios IA — EL CAMINO del servidor.  npm run test:anniversary:path
// v4.896.0
//
// POR QUÉ NO ALCANZA `test:anniversary`. Aquélla prueba el CRITERIO —qué prompt
// se arma, qué texto se acepta, qué pieza se aprueba— y es puro, así que no ve
// nada de lo que de verdad puede fallar acá:
//
//   · que la consulta lleve los parámetros que lleva y en el orden que van;
//   · que el nombre de una columna coincida con lo que el store escribe;
//   · que las cuatro etapas se encadenen y cada una deje la pieza donde la
//     siguiente la espera;
//   · que el reclamo sobre `attempts` impida DOS tareas para la misma pieza;
//   · que la corrección automática reintente UNA vez y después entregue;
//   · que el documento que llega al compositor tenga lo que el compositor lee;
//   · que la puerta del formulario público esté de verdad cerrada.
//
// Es la lección de v4.744 —el criterio era correcto y el defecto estaba en el
// camino— y la de v4.889 —un renombrado a medias que ninguna prueba veía—.
//
// No necesita Postgres, credenciales ni red: la base y los proveedores se
// sustituyen con un hook de resolución de módulos. **`sharp` NO se sustituye**:
// las mediciones de blanco y de franja se ejercitan de verdad sobre imágenes
// reales, que es la mitad que más importa comprobar.
//
// Lo que este doble NO demuestra es que el SQL sea válido para Postgres. Eso se
// comprueba al desplegar, y se dice para no afirmar de más.
// ════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// El motor se niega a componer sin credencial, y hace bien: es lo que evita
// que alguien publique el módulo y descubra el hueco al primer uso. Acá se
// finge, porque el proveedor está sustituido y no sale ninguna petición.
process.env.KIE_API_KEY = 'prueba-sin-red';

const HERE = pathToFileURL(`${process.cwd()}/`).href;
const DB = new URL('./scripts/fixtures/db-anniversary-stub.mjs', HERE).href;
const PROV = new URL('./scripts/fixtures/providers-anniversary-stub.mjs', HERE).href;

// ⚠️ El hook compara contra `/db.js`, no contra `/lib/db.js`: los módulos de
// `server/lib` se importan entre sí como `'./db.js'` y con el sufijo largo no
// casarían. Ese fallo no sería ruidoso — la prueba intentaría conectarse a un
// Postgres que no está.
register(
    `data:text/javascript,
     const DB=${JSON.stringify(DB)}, P=${JSON.stringify(PROV)};
     export async function resolve(s,c,n){
       if(/(^|\\/)db\\.js$/.test(s)) return {url:DB,shortCircuit:true};
       if(/kieService\\.js$|copywritingService\\.js$|designGuard\\.js$/.test(s)) return {url:P,shortCircuit:true};
       if(s==='@aws-sdk/client-s3') return {url:P,shortCircuit:true};
       return n(s,c);
     }`,
    HERE
);

const sharp = (await import('sharp')).default;
const db = await import(DB);
const prov = await import(PROV);
const store = await import('../server/lib/anniversaryStore.js');
const ctrl = await import('../server/controllers/anniversaryController.js');
const pub = await import('../server/controllers/anniversaryPublicController.js');
const S = await import('../server/lib/anniversarySpec.js');

let pass = 0; const malos = [];
const ok = (n, c, d = '') => {
    if (c) { pass++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); }
};
const eq = (n, a, b) => ok(n, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const grupo = t => console.log(`\n${t}`);

// ── Dobles de Express ──────────────────────────────────────────────────
const req = (over = {}) => ({
    user: { id: 'u1', email: 'operador@clubplatform.org', role: 'administrator' },
    body: {}, params: {}, query: {}, headers: { host: 'rotary4281.org' }, ...over,
});
const res = () => {
    const r = { code: 200, body: null };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    return r;
};
const llamar = async (fn, over) => { const r = res(); await fn(req(over), r); return r; };

// ── Imágenes reales para las mediciones ────────────────────────────────
const svg = (s) => Buffer.from(s);
/** Una composición «buena»: casi todo blanco, con la fotografía a la derecha
 *  y la mitad izquierda limpia — que es lo que el prompt pide. */
const COMPO_BUENA = await sharp(svg(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080">
    <rect width="1080" height="1080" fill="#ffffff"/>
    <circle cx="800" cy="420" r="230" fill="#31506b"/></svg>`)).png().toBuffer();
/** Una composición que el control tiene que RECHAZAR: fondo oscuro. */
const COMPO_OSCURA = await sharp(svg(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080">
    <rect width="1080" height="1080" fill="#20242c"/></svg>`)).png().toBuffer();
/** Otra que hay que rechazar: la franja del texto OCUPADA, pero con el fondo
 *  igual de blanco. Aísla el control: la primera versión de esta imagen tenía
 *  además una banda gris a la derecha y bajaba la luminancia media a 198, así
 *  que saltaban los DOS controles y se reportaba el otro. Al escribir una
 *  imagen de prueba para un control, dejar el resto en verde. */
const COMPO_FRANJA = await sharp(svg(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080">
    <rect width="1080" height="1080" fill="#ffffff"/>
    <rect x="120" y="280" width="300" height="420" fill="#243447"/></svg>`)).png().toBuffer();

const FOTO = await sharp(svg(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
    <rect width="1200" height="800" fill="#b8542f"/></svg>`)).jpeg().toBuffer();
const FOTO_URL = `data:image/jpeg;base64,${FOTO.toString('base64')}`;

// El sondeo baja la fotografía original con `fetch` para el control de
// preservación. Se sustituye por una que devuelve el buffer real.
globalThis.fetch = async () => ({ arrayBuffer: async () => FOTO.buffer.slice(FOTO.byteOffset, FOTO.byteOffset + FOTO.byteLength) });

const limpiar = (patch) => { db.reset(); prov.reset({ imagen: COMPO_BUENA, ...patch }); };

// ════════════════════════════════════════════════════════════════════
grupo('1 — La configuración se abre, se guarda y se publica');

limpiar();
let r = await llamar(ctrl.getConfig);
eq('la primera lectura crea la fila y responde 200', r.code, 200);
ok('trae las instrucciones por defecto', r.body.config.designInstruction === S.DEFAULT_DESIGN_INSTRUCTION);
ok('y NO está publicada todavía', r.body.published === null && r.body.dirty === true);
eq('la fila quedó en la base', db.tablas.AnniversaryConfig.length, 1);
ok('con `clubId` en NULL: es la configuración de la plataforma',
    db.tablas.AnniversaryConfig[0].clubId === null);

r = await llamar(ctrl.getConfig);
eq('volver a abrirla NO crea una segunda fila', db.tablas.AnniversaryConfig.length, 1);

r = await llamar(ctrl.putConfig, { body: { config: { ...r.body.config, enabled: true, name: 'Aniversarios del Distrito' } } });
eq('se guarda el borrador', r.code, 200);
ok('y el nombre llegó a la columna', db.tablas.AnniversaryConfig[0].name === 'Aniversarios del Distrito');
ok('sigue marcado como pendiente de publicar', r.body.dirty === true);

r = await llamar(ctrl.postPublish);
eq('publicar responde 200', r.code, 200);
eq('creó la versión 1', r.body.version.version, 1);
ok('la fila quedó publicada', !!db.tablas.AnniversaryConfig[0].published);
ok('la versión guarda la configuración COMPLETA, no una referencia',
    !!db.tablas.AnniversaryConfigVersion[0].config?.designInstruction);

r = await llamar(ctrl.postPublish);
ok('volver a publicar sin cambios REUTILIZA la versión vigente', r.body.reused === true);
eq('y no crea una segunda', db.tablas.AnniversaryConfigVersion.length, 1);

const cfg = db.tablas.AnniversaryConfig[0].draft;
await llamar(ctrl.putConfig, { body: { config: { ...cfg, name: 'Otro nombre interno' } } });
r = await llamar(ctrl.postPublish);
ok('cambiar SÓLO el nombre interno tampoco crea una versión', r.body.reused === true);

await llamar(ctrl.putConfig, { body: { config: { ...cfg, designInstruction: 'Una dirección de arte completamente distinta, con globos dorados y confeti muy discreto.' } } });
r = await llamar(ctrl.postPublish);
eq('cambiar la instrucción SÍ crea la versión 2', r.body.version.version, 2);

grupo('2 — Publicar exige validez; retirar no');
await llamar(ctrl.putConfig, { body: { config: { ...cfg, designInstruction: '' } } });
r = await llamar(ctrl.postPublish);
eq('con la instrucción vacía, publicar responde 422', r.code, 422);
ok('y dice qué falta', Array.isArray(r.body.errors) && r.body.errors.length > 0);
r = await llamar(ctrl.postUnpublish);
eq('retirar del aire funciona igual', r.code, 200);
ok('sin borrar las versiones', db.tablas.AnniversaryConfigVersion.length === 2);

grupo('3 — Restaurar trae al borrador, NO publica');
const v1 = db.tablas.AnniversaryConfigVersion[0];
const publicadoAntes = db.tablas.AnniversaryConfig[0].published;
r = await llamar(ctrl.postRestoreVersion, { params: { id: v1.id } });
eq('restaurar responde 200', r.code, 200);
ok('el borrador quedó con esa versión', r.body.config.designInstruction === v1.config.designInstruction);
ok('y lo publicado NO se movió', db.tablas.AnniversaryConfig[0].published === publicadoAntes);

// ════════════════════════════════════════════════════════════════════
grupo('4 — Las cuatro etapas, encadenadas');

limpiar();
await llamar(ctrl.getConfig);
r = await llamar(ctrl.postTestPhoto, { body: { clubName: 'Cali', years: 40, photo: FOTO_URL } });
eq('la etapa 1 responde 200', r.code, 200);
const pieceId = r.body.pieceId;
ok('creó la fila ANTES de llamar a ningún proveedor',
    db.tablas.AnniversaryPiece.length === 1 && prov.estado.tareas.length === 0);
eq('la pieza nace en `draft`', db.tablas.AnniversaryPiece[0].status, 'draft');
ok('el nombre del club se imprime en su forma completa',
    db.tablas.AnniversaryPiece[0].clubName === 'Club Rotario Cali', db.tablas.AnniversaryPiece[0].clubName);
ok('la fotografía se subió a `public-tmp/`',
    prov.estado.subidas.length === 1 && prov.estado.subidas[0].Key.startsWith('public-tmp/'),
    prov.estado.subidas[0]?.Key);

r = await llamar(ctrl.postTestAnalyze, { body: { pieceId } });
eq('la etapa 2 responde 200', r.code, 200);
eq('el análisis se leyó', r.body.analyzed, true);
eq('las personas están a la derecha, así que el texto va a la izquierda', r.body.zoneId, 'left');
eq('y quedó guardado en la fila', db.tablas.AnniversaryPiece[0].zoneId, 'left');
eq('la pieza avanzó a `analyzed`', db.tablas.AnniversaryPiece[0].status, 'analyzed');

r = await llamar(ctrl.postTestCopy, { body: { pieceId } });
eq('la etapa 3 responde 200', r.code, 200);
ok('escribió titular y mensaje', !!r.body.copy.title && !!r.body.copy.message);
eq('la pieza avanzó a `written`', db.tablas.AnniversaryPiece[0].status, 'written');

r = await llamar(ctrl.postTestCompose, { body: { pieceId } });
eq('la etapa 4 responde 200', r.code, 200);
eq('se creó UNA tarea en el proveedor', prov.estado.tareas.length, 1);
eq('la pieza quedó reclamada con un intento', db.tablas.AnniversaryPiece[0].attempts, 1);

const tarea = prov.estado.tareas[0] || {};
ok('el prompt le pide al modelo que no dibuje texto', !!tarea.prompt?.includes(S.NO_TEXT_CLAUSE));
ok('le nombra la franja que tiene que dejar libre', !!tarea.prompt?.includes(S.zoneById('left').words));
ok('lo prohibido viaja en `negative_prompt`, no en el positivo',
    !!tarea.negativePrompt && !tarea.prompt?.includes(tarea.negativePrompt));
eq('pide la proporción del formato', tarea.aspectRatio, '1:1');
ok('la fotografía viaja como imagen de entrada', Array.isArray(tarea.imageUrls) || !!tarea.imageUrl);

grupo('5 — El sondeo, la verificación y el documento');
r = await llamar(ctrl.getTestPiece, { params: { id: pieceId } });
eq('el sondeo responde 200', r.code, 200);
eq('la pieza está lista', r.body.ready, true);
eq('y se usa la composición del modelo', r.body.document.renderMode, 'ai');
ok('el documento lleva el fondo generado', !!r.body.document.backdropUrl);
ok('…y la zona que decidió el análisis', r.body.document.zoneId === 'left');
ok('…y el club y los años exactos', r.body.document.clubName === 'Club Rotario Cali' && r.body.document.years === 40);
ok('…y el titular y el mensaje', !!r.body.document.title && !!r.body.document.message);
ok('…y las medidas del lienzo', r.body.document.width === 1080 && r.body.document.height === 1080);
ok('la validación dice QUÉ se midió',
    Array.isArray(r.body.validation.measured) && r.body.validation.measured.includes('fondo blanco'),
    JSON.stringify(r.body.validation?.measured));
ok('el fondo blanco se midió de verdad sobre la imagen',
    r.body.validation.measurements.meanLuma > 200, JSON.stringify(r.body.validation.measurements));

// ⚠️ El documento es el contrato con el compositor del navegador. Si a
// `pieceView` se le olvidara un campo, la pieza saldría sin él y NADA daría
// error — es la clase de fallo que este archivo documenta una y otra vez.
const CAMPOS = ['format', 'width', 'height', 'renderMode', 'backdropUrl', 'photoUrl',
    'zoneId', 'clubName', 'years', 'title', 'message', 'branding'];
ok('el documento trae TODOS los campos que el compositor lee',
    CAMPOS.every(k => k in r.body.document),
    CAMPOS.filter(k => !(k in r.body.document)).join(', '));

// ════════════════════════════════════════════════════════════════════
grupo('6 — La corrección automática: UNA vez, y después se entrega');

limpiar({ imagen: COMPO_OSCURA });
await llamar(ctrl.getConfig);
r = await llamar(ctrl.postTestPhoto, { body: { clubName: 'Cali', years: 40, photo: FOTO_URL } });
const oscura = r.body.pieceId;
await llamar(ctrl.postTestAnalyze, { body: { pieceId: oscura } });
await llamar(ctrl.postTestCopy, { body: { pieceId: oscura } });
await llamar(ctrl.postTestCompose, { body: { pieceId: oscura } });

r = await llamar(ctrl.getTestPiece, { params: { id: oscura } });
eq('con el fondo oscuro, el primer sondeo REINTENTA', r.body.retrying, true);
ok('y dice el motivo concreto', /fondo/i.test(r.body.reason || ''), r.body.reason);
eq('se creó una segunda tarea', prov.estado.tareas.length, 2);
ok('el reintento le dice al modelo el problema, no «hacelo mejor»',
    /white/i.test(prov.estado.tareas[1].prompt));

r = await llamar(ctrl.getTestPiece, { params: { id: oscura } });
ok('el segundo sondeo YA NO reintenta', !r.body.retrying);
eq('no se creó una tercera tarea', prov.estado.tareas.length, 2);
eq('la pieza se entrega igual', r.body.ready, true);
// Con `?.`: si el reintento no parara, no habría documento y esto tiene que
// FALLAR con su nombre, no reventar con un TypeError que esconde cuál era.
eq('…pero en modo `plain`: la composición se descartó', r.body.document?.renderMode, 'plain');
ok('el documento NO lleva el fondo descartado', r.body.document?.backdropUrl === null);
ok('la fotografía sí viaja, para componerla intacta', !!r.body.document?.photoUrl);
ok('y se dice el motivo', !!r.body.statusDetail, r.body.statusDetail);
ok('la imagen del modelo NO se retocó: se guardó tal cual y se descartó su uso',
    !!db.tablas.AnniversaryPiece.find(p => p.id === oscura).backdropUrl);

grupo('7 — La franja ocupada también se detecta');
limpiar({ imagen: COMPO_FRANJA });
await llamar(ctrl.getConfig);
r = await llamar(ctrl.postTestPhoto, { body: { clubName: 'Cali', years: 40, photo: FOTO_URL } });
const franja = r.body.pieceId;
await llamar(ctrl.postTestAnalyze, { body: { pieceId: franja } });
await llamar(ctrl.postTestCopy, { body: { pieceId: franja } });
await llamar(ctrl.postTestCompose, { body: { pieceId: franja } });
r = await llamar(ctrl.getTestPiece, { params: { id: franja } });
ok('con la mitad izquierda ocupada, se reintenta', r.body.retrying === true, JSON.stringify(r.body).slice(0, 200));
// Se afirma sobre los identificadores GUARDADOS, no sobre el primer texto: dos
// controles pueden saltar a la vez y `reason` sólo trae el primero.
const criticos = (db.tablas.AnniversaryPiece.find(p => p.id === franja).validation?.critical || []).map(c => c.id);
ok('y el control que saltó es el de la franja', criticos.includes('franja_ocupada'), criticos.join(','));
ok('el fondo blanco NO saltó: la imagen sí era blanca', !criticos.includes('fondo_no_blanco'), criticos.join(','));

grupo('8 — La fotografía alterada descarta la composición');
limpiar({ imagen: COMPO_BUENA, preservation: { state: 'failed', use: false, reason: 'Hay una persona que no está en la fotografía.' } });
await llamar(ctrl.getConfig);
r = await llamar(ctrl.postTestPhoto, { body: { clubName: 'Cali', years: 40, photo: FOTO_URL } });
const alterada = r.body.pieceId;
await llamar(ctrl.postTestAnalyze, { body: { pieceId: alterada } });
await llamar(ctrl.postTestCopy, { body: { pieceId: alterada } });
await llamar(ctrl.postTestCompose, { body: { pieceId: alterada } });
await llamar(ctrl.getTestPiece, { params: { id: alterada } });   // reintenta
r = await llamar(ctrl.getTestPiece, { params: { id: alterada } });
eq('agotado el reintento, se entrega con la foto intacta', r.body.document?.renderMode, 'plain');
ok('y el motivo es el de la preservación', /persona/i.test(r.body.statusDetail || ''), r.body.statusDetail);

// ════════════════════════════════════════════════════════════════════
grupo('9 — El reclamo impide dos tareas para la misma pieza');

limpiar();
await llamar(ctrl.getConfig);
r = await llamar(ctrl.postTestPhoto, { body: { clubName: 'Cali', years: 40, photo: FOTO_URL } });
const doble = r.body.pieceId;
await llamar(ctrl.postTestAnalyze, { body: { pieceId: doble } });
await llamar(ctrl.postTestCopy, { body: { pieceId: doble } });

// Dos despachos a la vez, como dos pulsaciones seguidas de «Regenerar».
const [a, b] = await Promise.all([
    llamar(ctrl.postTestCompose, { body: { pieceId: doble } }),
    llamar(ctrl.postTestCompose, { body: { pieceId: doble } }),
]);
const codigos = [a.code, b.code].sort();
eq('uno gana y el otro recibe 409', codigos, [200, 409]);
eq('se creó UNA sola tarea, no dos', prov.estado.tareas.length, 1);

grupo('10 — El error del proveedor se propaga TEXTUAL');
limpiar({ fallarCreateTask: 'KIE createTask: modelo no encontrado' });
await llamar(ctrl.getConfig);
r = await llamar(ctrl.postTestPhoto, { body: { clubName: 'Cali', years: 40, photo: FOTO_URL } });
const rota = r.body.pieceId;
await llamar(ctrl.postTestAnalyze, { body: { pieceId: rota } });
await llamar(ctrl.postTestCopy, { body: { pieceId: rota } });
r = await llamar(ctrl.postTestCompose, { body: { pieceId: rota } });
eq('responde 502', r.code, 502);
ok('con el mensaje del proveedor, no un «no se pudo»', /modelo no encontrado/.test(r.body.error), r.body.error);
eq('y la pieza queda en `failed` CON su motivo', db.tablas.AnniversaryPiece.find(p => p.id === rota).status, 'failed');

// ════════════════════════════════════════════════════════════════════
grupo('11 — El formulario público');

limpiar();
db.sembrarClub({ id: 'club-4281', name: 'Distrito 4281', domain: 'rotary4281.org' });
await llamar(ctrl.getConfig);

r = await llamar(pub.getPublicConfig);
eq('sin publicar, el generador NO está disponible', r.body.available, false);
ok('y se dice por qué, en vez de un 404 mudo', !!r.body.reason);
eq('y responde 200: no es un error', r.code, 200);

r = await llamar(pub.postPublicPhoto, { body: { clubName: 'Cali', years: 40, photo: FOTO_URL } });
eq('con el generador sin publicar, la etapa 1 se rechaza', r.code, 404);

// Se publica, activado.
let borrador = db.tablas.AnniversaryConfig[0].draft;
await llamar(ctrl.putConfig, { body: { config: { ...borrador, enabled: true } } });
await llamar(ctrl.postPublish);

r = await llamar(pub.getPublicConfig);
eq('publicado y activo, ya está disponible', r.body.available, true);
ok('trae las etapas para el progreso', Array.isArray(r.body.stages) && r.body.stages.length === S.STAGES.length);
ok('NO devuelve las instrucciones', !JSON.stringify(r.body).includes('designInstruction'));

r = await llamar(pub.postPublicPhoto, { body: { clubName: 'Cali', years: 40, photo: FOTO_URL } });
eq('la etapa 1 pública responde 200', r.code, 200);
const publica = r.body.pieceId;
const filaPublica = db.tablas.AnniversaryPiece.find(p => p.id === publica);
eq('la pieza queda marcada como pública', filaPublica.mode, 'public');
ok('y atada a la VERSIÓN publicada', !!filaPublica.versionId);
eq('el sitio se resolvió por el dominio', filaPublica.clubId, 'club-4281');

grupo('12 — Validaciones del formulario público');
r = await llamar(pub.postPublicPhoto, { body: { clubName: '', years: 40, photo: FOTO_URL } });
eq('sin club, 400', r.code, 400);
r = await llamar(pub.postPublicPhoto, { body: { clubName: 'Cali', years: 0, photo: FOTO_URL } });
eq('con años fuera de rango, 400', r.code, 400);
ok('y el mensaje dice el rango', /\b1\b[\s\S]*\b130\b/.test(r.body.error), r.body.error);
r = await llamar(pub.postPublicPhoto, { body: { clubName: 'Cali', years: 40, photo: 'no-es-una-imagen' } });
eq('sin fotografía, 400', r.code, 400);

grupo('13 — La puerta del formulario público está cerrada');
// Una pieza del PANEL DE PRUEBAS no se puede hacer avanzar desde el endpoint
// abierto: sin esta comprobación, quien conozca la dirección movería piezas
// que no son suyas.
r = await llamar(ctrl.postTestPhoto, { body: { clubName: 'Cali', years: 40, photo: FOTO_URL } });
const deprueba = r.body.pieceId;
r = await llamar(pub.postPublicAnalyze, { body: { pieceId: deprueba } });
eq('una pieza `test` no avanza por la vía pública', r.code, 404);

// El alcance: con la configuración acotada a otros sitios, este dominio queda
// fuera — y lo decide el SERVIDOR, no la pantalla.
borrador = db.tablas.AnniversaryConfig[0].draft;
await llamar(ctrl.putConfig, { body: { config: { ...borrador, enabled: true, scope: { mode: 'clubs', clubIds: ['otro-sitio'] } } } });
await llamar(ctrl.postPublish);
r = await llamar(pub.getPublicConfig);
eq('fuera del alcance, no está disponible', r.body.available, false);
r = await llamar(pub.postPublicPhoto, { body: { clubName: 'Cali', years: 40, photo: FOTO_URL } });
eq('y la etapa 1 se rechaza aunque se conozca la dirección', r.code, 404);

grupo('14 — El panel es del operador de la plataforma');
for (const [nombre, fn] of [['getConfig', ctrl.getConfig], ['putConfig', ctrl.putConfig],
    ['postPublish', ctrl.postPublish], ['getVersions', ctrl.getVersions], ['postTestPhoto', ctrl.postTestPhoto]]) {
    const rr = res();
    await fn(req({ user: { id: 'u2', email: 'club@x.org', role: 'club_admin' } }), rr);
    ok(`${nombre} rechaza a un administrador de sitio`, rr.code === 403, `dio ${rr.code}`);
}

// ════════════════════════════════════════════════════════════════════
grupo('15 — El texto: el bucle de reintento corre de verdad');

limpiar({
    copyRespuestas: [
        // 1) un titular demasiado largo
        { title: 'x'.repeat(90), message: 'Cuatro décadas de servicio y amistad junto a nuestra comunidad querida.' },
        // 2) corregido
        { title: 'Cuarenta años de servicio', message: 'Cuatro décadas de servicio y amistad junto a nuestra comunidad querida.' },
    ],
});
await llamar(ctrl.getConfig);
r = await llamar(ctrl.postTestPhoto, { body: { clubName: 'Cali', years: 40, photo: FOTO_URL } });
const conBucle = r.body.pieceId;
await llamar(ctrl.postTestAnalyze, { body: { pieceId: conBucle } });
r = await llamar(ctrl.postTestCopy, { body: { pieceId: conBucle } });
eq('el segundo intento se acepta', r.body.copy.title, 'Cuarenta años de servicio');
eq('y no hizo falta reparar nada', r.body.repaired.length, 0);

limpiar({ copyRespuestas: [{ title: 'x'.repeat(90), message: 'Corto.' }, { title: 'x'.repeat(90), message: 'Corto.' }, { title: 'x'.repeat(90), message: 'Corto.' }] });
await llamar(ctrl.getConfig);
r = await llamar(ctrl.postTestPhoto, { body: { clubName: 'Cali', years: 40, photo: FOTO_URL } });
const sinArreglo = r.body.pieceId;
await llamar(ctrl.postTestAnalyze, { body: { pieceId: sinArreglo } });
r = await llamar(ctrl.postTestCopy, { body: { pieceId: sinArreglo } });
eq('agotados los intentos, el trabajo NO se tira', r.code, 200);
ok('el titular se recortó', r.body.copy.title.length <= S.LIMITS.title.max);
ok('lo reparado se DICE', r.body.repaired.length > 0, JSON.stringify(r.body.repaired));
ok('y el mensaje corto SIGUE corto: reparar no inventa', r.body.copy.message === 'Corto.');
ok('y eso se avisa', r.body.warnings.some(w => /mensaje/i.test(w)), JSON.stringify(r.body.warnings));


// ════════════════════════════════════════════════════════════════════
grupo('16 — El motor: modelo configurable, sello y fallback');

const models = await import('../server/lib/anniversaryModels.js');
const ENG = await import('../server/lib/anniversaryEngineSpec.js');
const OTRO = ENG.MODEL_CATALOG[1].id;

const generar = async (etiqueta = 'Cali') => {
    let x = await llamar(ctrl.postTestPhoto, { body: { clubName: etiqueta, years: 40, photo: FOTO_URL } });
    const pid = x.body.pieceId;
    await llamar(ctrl.postTestAnalyze, { body: { pieceId: pid } });
    await llamar(ctrl.postTestCopy, { body: { pieceId: pid } });
    x = await llamar(ctrl.postTestCompose, { body: { pieceId: pid } });
    return { pid, res: x };
};

// El modelo por defecto y el sello.
limpiar();
await llamar(ctrl.getConfig);
let g = await generar();
eq('sin configurar nada se despacha el default del catálogo',
    prov.estado.tareas[0].model, ENG.DEFAULT_MODEL_ID);
let sello = db.tablas.AnniversaryPiece.find(p => p.id === g.pid).engine;
ok('la pieza lleva su sello de auditoría',
    sello && sello.provider === 'kie' && sello.model === ENG.DEFAULT_MODEL_ID
    && !!sello.promptVersion && !!sello.presetVersion, JSON.stringify(sello));
ok('y la marca de despacho, de donde sale la latencia', !!sello.dispatchedAt);
eq('todavía sin fallback usado', sello.fallbackUsed, false);

// Cambiar el modelo desde el PANEL cambia lo que se despacha, sin tocar código.
limpiar();
await llamar(ctrl.getConfig);
r = await llamar(ctrl.postEngineActivate, { body: { model: OTRO } });
eq('activar un modelo elegible responde 200', r.code, 200);
eq('y producción pasa a ese modelo', r.body.production.primary, OTRO);
ok('la activación queda con su procedencia', !!db.tablas.AnniversaryConfig[0].engine?.activatedFrom?.at);
g = await generar();
eq('la generación siguiente sale con el modelo activado', prov.estado.tareas[0].model, OTRO);

// Un modelo no elegible NO se puede activar.
r = await llamar(ctrl.postEngineActivate, { body: { model: 'no/existe' } });
eq('un modelo desconocido se rechaza con 422', r.code, 422);
ok('y dice por qué', Array.isArray(r.body.errors) && r.body.errors.length > 0);

// El FALLBACK: fallo de infraestructura del primario.
limpiar({ fallarModelo: { model: ENG.DEFAULT_MODEL_ID, error: 'KIE createTask: 503 service unavailable' } });
await llamar(ctrl.getConfig);
await llamar(ctrl.putEngine, { body: { engine: { mode: 'manual', active: null, fallback: OTRO } } });
g = await generar();
eq('con el primario caído, el despacho responde 200 igual', g.res.code, 200);
eq('y el modelo que quedó es el de respaldo', g.res.body.model, OTRO);
eq('la respuesta lo DICE', g.res.body.fallbackUsed, true);
sello = db.tablas.AnniversaryPiece.find(p => p.id === g.pid).engine;
eq('el sello registra que se usó el respaldo', sello.fallbackUsed, true);
eq('se intentaron los dos modelos, en orden', prov.estado.tareas.map(t => t.model), [ENG.DEFAULT_MODEL_ID, OTRO]);

// Un fallo que NO es de infraestructura no gasta el segundo modelo.
limpiar({ fallarModelo: { model: ENG.DEFAULT_MODEL_ID, error: 'content policy violation' } });
await llamar(ctrl.getConfig);
await llamar(ctrl.putEngine, { body: { engine: { mode: 'manual', active: null, fallback: OTRO } } });
g = await generar();
eq('un fallo de política NO dispara el fallback', g.res.code, 502);
eq('y NO se gastó una segunda tarea', prov.estado.tareas.filter(t => !t.rechazada).length, 0);

// Los dos caídos: se propaga el motivo de CADA uno.
limpiar({ fallarCreateTask: 'KIE createTask: 504 gateway timeout' });
await llamar(ctrl.getConfig);
await llamar(ctrl.putEngine, { body: { engine: { mode: 'manual', active: null, fallback: OTRO } } });
g = await generar();
eq('agotada la cadena, 502', g.res.code, 502);
ok('con el motivo de los DOS modelos',
    g.res.body.error.includes(ENG.DEFAULT_MODEL_ID) && g.res.body.error.includes(OTRO), g.res.body.error);

// El reintento de CALIDAD no cambia de modelo.
limpiar({ imagen: COMPO_OSCURA });
await llamar(ctrl.getConfig);
await llamar(ctrl.putEngine, { body: { engine: { mode: 'manual', active: OTRO, fallback: ENG.DEFAULT_MODEL_ID } } });
g = await generar();
await llamar(ctrl.getTestPiece, { params: { id: g.pid } });   // reintenta por calidad
eq('el reintento por calidad se queda en el MISMO modelo',
    [...new Set(prov.estado.tareas.map(t => t.model))], [OTRO]);

grupo('17 — El benchmark corre por la misma cadena');
limpiar();
await llamar(ctrl.getConfig);
// ⚠️ SE CAPTURA ANTES DE CORRER. La primera versión de la comprobación de la
// regla 20 leía el activo DESPUÉS del benchmark y sólo miraba un sondeo más:
// un cambio automático durante la corrida caía FUERA de la ventana y la
// aserción pasaba por el motivo equivocado. Lo destapó la verificación a la
// inversa. Al comprobar que algo NO cambió, capturar el estado antes del
// primer acto que podría cambiarlo.
const activoAntesDelBenchmark = db.tablas.AnniversaryConfig[0].engine?.active ?? null;
r = await llamar(ctrl.postBenchmarkRun, {
    body: { models: [ENG.DEFAULT_MODEL_ID, OTRO], photos: [FOTO_URL, FOTO_URL] },
});
eq('la corrida responde 200', r.code, 200);
eq('despachó una celda por modelo × fotografía', r.body.dispatched, 4);
eq('y las cuatro filas quedaron en la base', db.tablas.AnniversaryBenchmarkResult.length, 4);
// ⚠️ «Cuántos prompts distintos hay» NO comprueba nada: las dos fotos de
// prueba son la misma imagen, así que un solo prompt distinto es el
// resultado correcto y la aserción pasaba por el motivo equivocado. Lo que
// hay que comprobar es que CADA MODELO haya recibido exactamente el mismo
// juego de prompts — es lo que hace comparables sus resultados (req. 5).
const promptsPorModelo = new Map();
for (const t of prov.estado.tareas) {
    if (!promptsPorModelo.has(t.model)) promptsPorModelo.set(t.model, []);
    promptsPorModelo.get(t.model).push(t.prompt);
}
const juegos = [...promptsPorModelo.values()].map(ps => JSON.stringify(ps.slice().sort()));
ok('cada modelo recibió exactamente el mismo juego de prompts',
    promptsPorModelo.size === 2 && new Set(juegos).size === 1,
    `${promptsPorModelo.size} modelos, ${new Set(juegos).size} juegos distintos`);
ok('y cada uno corrió sobre las dos fotografías',
    [...promptsPorModelo.values()].every(ps => ps.length === 2));

const benchId = r.body.benchmarkId;
// El sondeo tiene presupuesto: hacen falta varias pasadas para cerrar 4 celdas.
for (let i = 0; i < 4; i++) r = await llamar(ctrl.getBenchmarkRun, { params: { id: benchId } });
eq('el sondeo responde 200', r.code, 200);
eq('no queda ninguna celda pendiente', r.body.pending, 0);
ok('cada resultado trae su imagen y su latencia',
    r.body.results.every(x => x.status === 'ready' && !!x.imageUrl && Number.isFinite(x.latencyMs)));
ok('y su nota, calculada con las MISMAS mediciones de producción',
    r.body.results.every(x => x.total && x.total.total !== null));
ok('lo no medido se NOMBRA en vez de contarse como cero',
    r.body.results[0].total.unmeasured.includes('photoIntegration'));
ok('hay un recomendado con evidencia', !!r.body.recommendation.recommended);
ok('y la tabla trae latencia media y tasa de error por modelo',
    r.body.recommendation.table.every(t => 'avgLatencyMs' in t && 'errorRate' in t));

// El voto humano.
const primerResultado = r.body.results[0];
r = await llamar(ctrl.postBenchmarkVote, { body: { resultId: primerResultado.id, vote: 'star' } });
eq('votar responde 200', r.code, 200);
r = await llamar(ctrl.getBenchmarkRun, { params: { id: benchId } });
const votado = r.body.results.find(x => x.id === primerResultado.id);
eq('el voto quedó guardado', votado.vote, 'star');
ok('y ahora integración y composición SÍ están medidas',
    !votado.total.unmeasured.includes('photoIntegration'), JSON.stringify(votado.total.unmeasured));
r = await llamar(ctrl.postBenchmarkVote, { body: { resultId: primerResultado.id, vote: 'meh' } });
eq('un voto desconocido se rechaza', r.code, 400);

grupo('18 — El benchmark no cambia producción solo (regla 20)');
r = await llamar(ctrl.getBenchmarkRun, { params: { id: benchId } });
eq('correr y sondear el benchmark entero NO tocó el modelo activo',
    db.tablas.AnniversaryConfig[0].engine?.active ?? null, activoAntesDelBenchmark);
ok('hay un recomendado, y es sólo eso: una recomendación',
    !!r.body.recommendation.recommended
    && (db.tablas.AnniversaryConfig[0].engine?.active ?? null) === activoAntesDelBenchmark,
    `recomendado ${r.body.recommendation.recommended}, activo ${db.tablas.AnniversaryConfig[0].engine?.active ?? 'ninguno'}`);
// Y el camino que SÍ cambia producción es explícito y humano.
r = await llamar(ctrl.postEngineActivate, { body: { model: r.body.recommendation.recommended, benchmarkId: benchId } });
eq('activarlo a mano sí lo cambia', r.code, 200);
eq('y queda registrado de qué benchmark salió',
    db.tablas.AnniversaryConfig[0].engine.activatedFrom.benchmarkId, benchId);

grupo('19 — Un benchmark de un solo modelo no compara nada');
r = await llamar(ctrl.postBenchmarkRun, { body: { models: [ENG.DEFAULT_MODEL_ID], photos: [FOTO_URL] } });
eq('se rechaza con 400', r.code, 400);
r = await llamar(ctrl.postBenchmarkRun, { body: { models: [ENG.DEFAULT_MODEL_ID, OTRO], photos: [] } });
eq('y sin fotografías también', r.code, 400);

grupo('20 — El motor es del operador de la plataforma');
for (const [nombre, fn] of [['getEngine', ctrl.getEngine], ['putEngine', ctrl.putEngine],
    ['postEngineActivate', ctrl.postEngineActivate], ['postBenchmarkRun', ctrl.postBenchmarkRun]]) {
    const rr = res();
    await fn(req({ user: { id: 'u2', email: 'club@x.org', role: 'club_admin' } }), rr);
    ok(`${nombre} rechaza a un administrador de sitio`, rr.code === 403, `dio ${rr.code}`);
}

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`❌ ${malos.length} de ${pass + malos.length} comprobaciones fallaron:`);
    for (const m of malos) console.log(`   · ${m}`);
    process.exit(1);
}
console.log(`✅ ${pass} comprobaciones. El camino del servidor se comporta.`);
