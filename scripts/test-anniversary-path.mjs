#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Aniversarios IA — EL CAMINO del servidor.  npm run test:anniversary:path
// v4.896.0 · flujo simple v4.907.0
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
//   · que el flujo simple (v4.907) entregue TAL CUAL, sin puertas ni reintento;
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
/** Una composición AL ESTILO DE LA REFERENCIA aprobada: fondo blanco, la
 *  fotografía oscura protagonista y globos dorados. El umbral viejo (205) la
 *  descartaba por su luminancia — es el reporte de v4.899. Tiene que
 *  ENTREGARSE. ⚠️ Hasta v4.921 esta imagen traía además la curva azul del pie
 *  ABAJO — que es exactamente lo que el contrato vigente PROHÍBE generar
 *  (v4.918) y lo que la banda inferior ahora MIDE (v4.922): el fixture se
 *  actualizó al contrato, la fotografía creció para conservar la oscuridad. */
const COMPO_REFERENCIA = await sharp(svg(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080">
    <rect width="1080" height="1080" fill="#ffffff"/>
    <rect x="460" y="150" width="540" height="480" fill="#3a3f4a"/>
    <circle cx="900" cy="90" r="70" fill="#b5a16b"/>
    <circle cx="180" cy="200" r="55" fill="#d8c9a3"/></svg>`)).png().toBuffer();
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
// El `fetch` global, POR URL: OpenAI contesta la generación síncrona, una URL
// de `backdrops` devuelve lo último que se subió ahí (el camino `sync:`), y
// cualquier otra cosa es la fotografía. `openaiLlamadas` captura el prompt y
// cuántas imágenes viajaron — es lo que las aserciones del proveedor miran.
const openaiLlamadas = [];
globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('api.openai.com')) {
        const fd = init?.body;
        openaiLlamadas.push({
            prompt: typeof fd?.get === 'function' ? String(fd.get('prompt') || '') : '',
            imagenes: typeof fd?.getAll === 'function' ? fd.getAll('image[]').length : 0,
            model: typeof fd?.get === 'function' ? String(fd.get('model') || '') : '',
        });
        return { ok: true, json: async () => ({ data: [{ b64_json: COMPO_REFERENCIA.toString('base64') }] }) };
    }
    if (u.includes('backdrops')) {
        const sub = [...prov.estado.subidas].reverse().find(x => String(x.Key || '').includes('backdrops'));
        const b = sub?.Body || COMPO_REFERENCIA;
        return { ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
    }
    return { ok: true, arrayBuffer: async () => FOTO.buffer.slice(FOTO.byteOffset, FOTO.byteOffset + FOTO.byteLength) };
};

const limpiar = (patch) => { db.reset(); prov.reset({ imagen: COMPO_BUENA, ...patch }); };

// ════════════════════════════════════════════════════════════════════
grupo('1 — La configuración se abre, se guarda y se publica');

limpiar();
let r = await llamar(ctrl.getConfig);
eq('la primera lectura crea la fila y responde 200', r.code, 200);
ok('trae el Prompt Maestro por defecto', r.body.config.masterPrompt === S.DEFAULT_MASTER_PROMPT);
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
    !!db.tablas.AnniversaryConfigVersion[0].config?.masterPrompt);

r = await llamar(ctrl.postPublish);
ok('volver a publicar sin cambios REUTILIZA la versión vigente', r.body.reused === true);
eq('y no crea una segunda', db.tablas.AnniversaryConfigVersion.length, 1);

const cfg = db.tablas.AnniversaryConfig[0].draft;
await llamar(ctrl.putConfig, { body: { config: { ...cfg, name: 'Otro nombre interno' } } });
r = await llamar(ctrl.postPublish);
ok('cambiar SÓLO el nombre interno tampoco crea una versión', r.body.reused === true);

await llamar(ctrl.putConfig, { body: { config: { ...cfg, masterPrompt: 'Una dirección de arte completamente distinta, con globos dorados y confeti muy discreto.' } } });
r = await llamar(ctrl.postPublish);
eq('cambiar el Prompt Maestro SÍ crea la versión 2', r.body.version.version, 2);

grupo('2 — Publicar exige validez; retirar no');
// El Prompt Maestro vacío cae al predeterminado; lo inválido es uno CORTO.
await llamar(ctrl.putConfig, { body: { config: { ...cfg, masterPrompt: 'corto' } } });
r = await llamar(ctrl.postPublish);
eq('con un Prompt Maestro demasiado corto, publicar responde 422', r.code, 422);
ok('y dice qué falta', Array.isArray(r.body.errors) && r.body.errors.length > 0);
r = await llamar(ctrl.postUnpublish);
eq('retirar del aire funciona igual', r.code, 200);
ok('sin borrar las versiones', db.tablas.AnniversaryConfigVersion.length === 2);

grupo('3 — Restaurar trae al borrador, NO publica');
const v1 = db.tablas.AnniversaryConfigVersion[0];
const publicadoAntes = db.tablas.AnniversaryConfig[0].published;
r = await llamar(ctrl.postRestoreVersion, { params: { id: v1.id } });
eq('restaurar responde 200', r.code, 200);
ok('el borrador quedó con esa versión', r.body.config.masterPrompt === v1.config.masterPrompt);
ok('y lo publicado NO se movió', db.tablas.AnniversaryConfig[0].published === publicadoAntes);

// ════════════════════════════════════════════════════════════════════
grupo('4 — El flujo simple: tres etapas reales, dos de compatibilidad');

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

// v4.907: `/analyze` y `/copy` se CONSERVAN como pasos baratos —un navegador
// con el bundle anterior todavía los llama (regla aditiva)— pero ya no llaman
// a ningún proveedor: el modelo mira las imágenes él mismo y escribe los
// textos dentro de la pieza, como en el ejemplo de ChatGPT del cliente.
r = await llamar(ctrl.postTestAnalyze, { body: { pieceId } });
eq('la etapa de análisis responde 200 (compatibilidad)', r.code, 200);
eq('pero YA NO analiza con visión', r.body.analyzed, false);
eq('la zona sale de la configuración, no de la foto', r.body.zoneId, 'left');
eq('la pieza avanzó a `analyzed`', db.tablas.AnniversaryPiece[0].status, 'analyzed');

r = await llamar(ctrl.postTestCopy, { body: { pieceId } });
eq('la etapa del texto responde 200 (compatibilidad)', r.code, 200);
eq('pero YA NO redacta nada: copy es null', r.body.copy, null);
eq('la pieza avanzó a `written`', db.tablas.AnniversaryPiece[0].status, 'written');
eq('ningún modelo de texto ni de visión se llamó', prov.estado.copyLlamadas, 0);

r = await llamar(ctrl.postTestCompose, { body: { pieceId } });
eq('componer responde 200', r.code, 200);
eq('se creó UNA tarea en el proveedor', prov.estado.tareas.length, 1);
eq('la pieza quedó reclamada con un intento', db.tablas.AnniversaryPiece[0].attempts, 1);

const tarea = prov.estado.tareas[0] || {};
// ⚠️ LA COMPROBACIÓN CENTRAL DEL v4.907: el prompt que recibe el proveedor es
// el prompt base con las variables sustituidas, BYTE A BYTE. Nada se agrega.
// v4.909: {VARIACION} la llena la plataforma, determinista por el id de la
// pieza — es la única parte del prompt que cambia entre piezas, y es visible.
ok('el prompt es el prompt base sustituido, VERBATIM (con su variación por pieza)',
    tarea.prompt === S.applyMasterVariables(S.DEFAULT_MASTER_PROMPT,
        { clubName: 'Club Rotario Cali', years: 40, variation: S.variationForSeed(pieceId), phrase: S.phraseForSeed(pieceId) }),
    (tarea.prompt || '').slice(0, 120));
ok('la variación de ESTA pieza viajó en el prompt',
    (tarea.prompt || '').includes('Decoración de esta pieza:'));
ok('ningún marcador viajó literal al modelo',
    !/\{(NOMBRE_CLUB|ANOS_CLUB|FOTO_CLUB)\}/.test(tarea.prompt || ''));
ok('ninguna cláusula vieja reaparece',
    !/clear zone|Master art direction|Decoration theme|lettering seen in the reference|no text anywhere/i.test(tarea.prompt || ''));
eq('el negativo son LAS RESTRICCIONES configuradas y nada más',
    tarea.negativePrompt, S.DEFAULT_RESTRICTIONS);
eq('pide la proporción del formato', tarea.aspectRatio, '1:1');
// Sin referencia configurada, a KIE le viaja UNA imagen (la fotografía) por
// el campo singular; con referencia son dos y van en `imageUrls` — eso lo
// fija el grupo 21.
ok('la fotografía viaja como imagen de entrada',
    !!tarea.imageUrl || (Array.isArray(tarea.imageUrls) && tarea.imageUrls.length >= 1));

// «Ver solicitud enviada al modelo»: EXACTAMENTE lo que viajó queda guardado.
const fila4 = db.tablas.AnniversaryPiece[0];
ok('la solicitud queda guardada en la pieza (request)',
    !!fila4.request && fila4.request.prompt === tarea.prompt,
    JSON.stringify(fila4.request || null).slice(0, 120));
ok('…con el modelo, el proveedor y el endpoint',
    !!fila4.request.model && fila4.request.provider === 'kie' && /createTask/.test(fila4.request.endpoint || ''),
    JSON.stringify({ model: fila4.request?.model, provider: fila4.request?.provider, endpoint: fila4.request?.endpoint }));
ok('…y con las imágenes que viajaron', 'referenceUrl' in fila4.request && !!fila4.request.photoUrl);

// v4.920: la frase conmemorativa la IMPRIME la plataforma. El despacho guarda
// la frase del catálogo con la pieza y el gate anti-doble: `printPhrase`
// sólo cuando el prompt final NO lleva la frase adentro.
ok('v4.920: el despacho guarda la frase del catálogo con la pieza',
    fila4.copy?.message === S.phraseForSeed(pieceId),
    JSON.stringify(fila4.copy || null));
ok('y el gate anti-doble queda ENCENDIDO — el prompt no lleva la frase',
    fila4.copy?.printPhrase === true && !(tarea.prompt || '').includes(S.phraseForSeed(pieceId)));

grupo('5 — El sondeo entrega TAL CUAL y el documento dice `simple`');
r = await llamar(ctrl.getTestPiece, { params: { id: pieceId } });
eq('el sondeo responde 200', r.code, 200);
eq('la pieza está lista', r.body.ready, true);
eq('y se usa la composición del modelo', r.body.document.renderMode, 'ai');
ok('el documento lleva la imagen generada', !!r.body.document.backdropUrl);
eq('y declara el flujo simple: el compositor NO imprime texto encima', r.body.document.simple, true);
// v4.920: salvo LA FRASE — el documento la trae con su gate para que el
// compositor la imprima con tipografía real.
eq('el documento trae la frase del catálogo', r.body.document.message, S.phraseForSeed(pieceId));
eq('y el gate phraseOverlay encendido', r.body.document.phraseOverlay, true);
// v4.920: el title sigue viniendo DENTRO de la imagen; el message ahora es
// LA FRASE del catálogo, que imprime el compositor con su gate.
ok('el título viene DENTRO de la imagen: title viaja vacío',
    r.body.document.title === '');
ok('…y el club y los años exactos', r.body.document.clubName === 'Club Rotario Cali' && r.body.document.years === 40);
ok('…y las medidas del lienzo', r.body.document.width === 1080 && r.body.document.height === 1080);
// v4.907: SIN PUERTAS — nada midió ni descartó, por decisión expresa del
// cliente. El juicio es del ojo de quien genera.
ok('no hay validación automática', r.body.validation === null, JSON.stringify(r.body.validation));
ok('y ningún reintento se gastó', prov.estado.tareas.length === 1 && !r.body.retrying);
ok('la solicitud viaja al panel («Ver solicitud enviada al modelo»)',
    !!r.body.request && !!r.body.request.prompt && !!r.body.request.model);

// ⚠️ El documento es el contrato con el compositor del navegador. Si a
// `pieceView` se le olvidara un campo, la pieza saldría sin él y NADA daría
// error — es la clase de fallo que este archivo documenta una y otra vez.
const CAMPOS = ['format', 'width', 'height', 'renderMode', 'simple', 'backdropUrl', 'photoUrl',
    'zoneId', 'clubName', 'years', 'title', 'message', 'branding'];
ok('el documento trae TODOS los campos que el compositor lee',
    CAMPOS.every(k => k in r.body.document),
    CAMPOS.filter(k => !(k in r.body.document)).join(', '));

// ════════════════════════════════════════════════════════════════════
grupo('6 — v4.910: la ÚNICA puerta es el PATRÓN VISUAL, y entrega con aviso');

// Directiva expresa del cliente (v4.910): un fondo café/oscuro/negro se
// regenera UNA vez con la instrucción reforzada; si insiste, SE ENTREGA con
// su aviso — nunca se descarta ni cae al modo plano (la lección de v4.899).
limpiar({ imagen: COMPO_OSCURA });
await llamar(ctrl.getConfig);
r = await llamar(ctrl.postTestPhoto, { body: { clubName: 'Cali', years: 40, photo: FOTO_URL } });
const oscura = r.body.pieceId;
await llamar(ctrl.postTestAnalyze, { body: { pieceId: oscura } });
await llamar(ctrl.postTestCopy, { body: { pieceId: oscura } });
await llamar(ctrl.postTestCompose, { body: { pieceId: oscura } });
r = await llamar(ctrl.getTestPiece, { params: { id: oscura } });
eq('con fondo oscuro, el primer sondeo REGENERA', r.body.retrying, true);
ok('y el motivo lleva la medición', /luminancia/.test(r.body.reason || ''), r.body.reason);
eq('se creó una segunda tarea', prov.estado.tareas.length, 2);
ok('el reintento lleva la instrucción reforzada del patrón',
    (prov.estado.tareas[1]?.prompt || '').includes(S.STYLE_RETRY_CLAUSE));
r = await llamar(ctrl.getTestPiece, { params: { id: oscura } });
ok('el segundo sondeo YA NO reintenta: no hay tercera tarea',
    !r.body.retrying && prov.estado.tareas.length === 2, JSON.stringify({ retrying: r.body.retrying, tareas: prov.estado.tareas.length }));
eq('la pieza SE ENTREGA igual, en modo ai — nunca al plano', r.body.document?.renderMode, 'ai');
eq('lista', r.body.ready, true);
ok('…pero CON su aviso: lo no conforme no se presenta como conforme',
    /fondo blanco/.test(r.body.statusDetail || ''), r.body.statusDetail);

// Con el patrón APAGADO, el fondo oscuro se entrega sin gastar nada extra.
limpiar({ imagen: COMPO_OSCURA });
r = await llamar(ctrl.getConfig);
await llamar(ctrl.putConfig, { body: { config: { ...r.body.config, styleGuard: false } } });
r = await llamar(ctrl.postTestPhoto, { body: { clubName: 'Cali', years: 40, photo: FOTO_URL } });
const sinGuardia = r.body.pieceId;
await llamar(ctrl.postTestAnalyze, { body: { pieceId: sinGuardia } });
await llamar(ctrl.postTestCopy, { body: { pieceId: sinGuardia } });
await llamar(ctrl.postTestCompose, { body: { pieceId: sinGuardia } });
r = await llamar(ctrl.getTestPiece, { params: { id: sinGuardia } });
ok('con styleGuard apagado no se regenera ni se avisa',
    r.body.ready === true && !r.body.retrying && prov.estado.tareas.length === 1 && !r.body.statusDetail,
    JSON.stringify({ ready: r.body.ready, tareas: prov.estado.tareas.length, det: r.body.statusDetail }));

// Lo que NO volvió: franja «ocupada» y preservación no descartan nada — el
// patrón mide SOLO el fondo, y el resto sigue siendo del ojo de quien genera.
for (const [nombre, patch] of [
    ['la franja del texto ocupada', { imagen: COMPO_FRANJA }],
    ['una preservación que ANTES descartaba', { imagen: COMPO_BUENA, preservation: { state: 'failed', use: false, reason: 'persona de más' } }],
]) {
    limpiar(patch);
    await llamar(ctrl.getConfig);
    r = await llamar(ctrl.postTestPhoto, { body: { clubName: 'Cali', years: 40, photo: FOTO_URL } });
    const id6 = r.body.pieceId;
    await llamar(ctrl.postTestAnalyze, { body: { pieceId: id6 } });
    await llamar(ctrl.postTestCopy, { body: { pieceId: id6 } });
    await llamar(ctrl.postTestCompose, { body: { pieceId: id6 } });
    r = await llamar(ctrl.getTestPiece, { params: { id: id6 } });
    ok(`con ${nombre}, la pieza SE ENTREGA igual y sin reintento`,
        r.body.ready === true && r.body.document?.renderMode === 'ai' && prov.estado.tareas.length === 1,
        JSON.stringify({ ready: r.body.ready, mode: r.body.document?.renderMode, tareas: prov.estado.tareas.length }));
    ok(`…y sin llamar a ningún modelo de texto ni visión`, prov.estado.copyLlamadas === 0, String(prov.estado.copyLlamadas));
}

grupo('6b — v4.922: la zona inferior reservada también es puerta, y comparte el reintento');

// El defecto del reporte: la cinta de años bajada a ~0.78, chocando con la
// franja donde la plataforma imprime la frase. Fondo impecablemente blanco a
// propósito — la imagen ejercita SÓLO esta puerta (la lección de COMPO_FRANJA:
// una imagen de prueba para un control deja el resto en verde).
const COMPO_CINTA_BAJA = await sharp(svg(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080">
    <rect width="1080" height="1080" fill="#ffffff"/>
    <circle cx="540" cy="790" r="55" fill="#8a6d1f"/>
    <rect x="390" y="820" width="300" height="60" fill="#8a6d1f"/></svg>`)).png().toBuffer();

limpiar({ imagen: COMPO_CINTA_BAJA });
await llamar(ctrl.getConfig);
r = await llamar(ctrl.postTestPhoto, { body: { clubName: 'Cali', years: 40, photo: FOTO_URL } });
const baja = r.body.pieceId;
await llamar(ctrl.postTestAnalyze, { body: { pieceId: baja } });
await llamar(ctrl.postTestCopy, { body: { pieceId: baja } });
await llamar(ctrl.postTestCompose, { body: { pieceId: baja } });
r = await llamar(ctrl.getTestPiece, { params: { id: baja } });
eq('con la cinta en el cuarto inferior, el primer sondeo REGENERA', r.body.retrying, true);
ok('y el motivo nombra el cuarto inferior con su medida', /cuarto inferior/.test(r.body.reason || ''), r.body.reason);
ok('el reintento lleva la instrucción CONCRETA de la zona',
    (prov.estado.tareas[1]?.prompt || '').includes(S.FOOTER_RETRY_CLAUSE));
r = await llamar(ctrl.getTestPiece, { params: { id: baja } });
ok('el segundo sondeo YA NO reintenta: las dos puertas COMPARTEN el único reintento',
    !r.body.retrying && prov.estado.tareas.length === 2,
    JSON.stringify({ retrying: r.body.retrying, tareas: prov.estado.tareas.length }));
eq('la pieza SE ENTREGA igual, en modo ai', r.body.document?.renderMode, 'ai');
ok('…con su aviso del cuarto inferior', /cuarto inferior/.test(r.body.statusDetail || ''), r.body.statusDetail);

// Con el fondo OSCURO fallan LAS DOS puertas — y sigue habiendo UNA sola
// regeneración, con las dos instrucciones concretas en el mismo reintento.
limpiar({ imagen: COMPO_OSCURA });
await llamar(ctrl.getConfig);
r = await llamar(ctrl.postTestPhoto, { body: { clubName: 'Cali', years: 40, photo: FOTO_URL } });
const ambas = r.body.pieceId;
await llamar(ctrl.postTestAnalyze, { body: { pieceId: ambas } });
await llamar(ctrl.postTestCopy, { body: { pieceId: ambas } });
await llamar(ctrl.postTestCompose, { body: { pieceId: ambas } });
r = await llamar(ctrl.getTestPiece, { params: { id: ambas } });
ok('las dos puertas caídas = UN reintento con las DOS instrucciones',
    r.body.retrying === true
    && (prov.estado.tareas[1]?.prompt || '').includes(S.STYLE_RETRY_CLAUSE)
    && (prov.estado.tareas[1]?.prompt || '').includes(S.FOOTER_RETRY_CLAUSE));
r = await llamar(ctrl.getTestPiece, { params: { id: ambas } });
ok('y nunca una tercera tarea', prov.estado.tareas.length === 2 && r.body.ready === true);

// ⚠️ EL PIE DEL ADMINISTRADOR NO VIAJA AL MODELO (pedido expreso del cliente:
// «si existe algún proceso que envía la imagen del footer como referencia al
// modelo generativo, elimínalo»). No existía — y esta comprobación impide que
// exista: al modelo van la FOTO y la REFERENCIA, nada más.
limpiar();
r = await llamar(ctrl.getConfig);
await llamar(ctrl.putConfig, { body: { config: { ...r.body.config, branding: { ...r.body.config.branding, footerImage: 'https://cdn.x/pie-institucional.png' } } } });
r = await llamar(ctrl.postTestPhoto, { body: { clubName: 'Cali', years: 40, photo: FOTO_URL } });
const conPie = r.body.pieceId;
await llamar(ctrl.postTestAnalyze, { body: { pieceId: conPie } });
await llamar(ctrl.postTestCopy, { body: { pieceId: conPie } });
await llamar(ctrl.postTestCompose, { body: { pieceId: conPie } });
{
    const t = prov.estado.tareas[0] || {};
    const urls = [t.imageUrl, ...(t.imageUrls || [])].filter(Boolean);
    ok('el pie institucional NO viaja al modelo por ninguna vía',
        urls.length > 0 && urls.every(u => !String(u).includes('pie-institucional')),
        JSON.stringify(urls));
}

grupo('6c — v4.923: el marco es FIJO — la foto se estandariza a 16:9 ANTES del modelo');

// El modelo hereda la proporción de la imagen que recibe: una foto vertical
// producía un marco ALTO, la cinta bajaba y chocaba con la frase. La
// plataforma decide la geometría antes del modelo: `ingestPhoto` recorta al
// marco estándar (cover + atención). sharp corre DE VERDAD acá.
const eng = await import('../server/lib/anniversaryEngine.js');
const aDataUrl = (b) => `data:image/jpeg;base64,${b.toString('base64')}`;
const fotoDe = async (w, h) => sharp(svg(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#7a8aa0"/><circle cx="${Math.round(w/2)}" cy="${Math.round(h/2)}" r="${Math.round(Math.min(w,h)/4)}" fill="#31506b"/></svg>`)).jpeg().toBuffer();

{
    const vertical = await eng.ingestPhoto(aDataUrl(await fotoDe(800, 1200)));
    ok('una foto VERTICAL sale recortada al marco 16:9 exacto',
        vertical.frameCropped === true && vertical.width === 800 && vertical.height === 450,
        JSON.stringify({ w: vertical.width, h: vertical.height }));
    ok('…y el recorte fuerte se DICE con su consecuencia',
        vertical.warnings.some(w => /recortó al marco horizontal/.test(w)), JSON.stringify(vertical.warnings));

    const exacta = await eng.ingestPhoto(aDataUrl(await fotoDe(1600, 900)));
    ok('una foto que YA es 16:9 no se toca — no arriesgar sin motivo',
        exacta.frameCropped === false && exacta.width === 1600 && exacta.height === 900,
        JSON.stringify({ w: exacta.width, h: exacta.height }));

    const panoramica = await eng.ingestPhoto(aDataUrl(await fotoDe(2400, 800)));
    ok('una panorámica se recorta a lo ancho, conservando el alto',
        panoramica.frameCropped === true && panoramica.height === 800 && Math.abs(panoramica.width / panoramica.height - 16 / 9) < 0.01,
        JSON.stringify({ w: panoramica.width, h: panoramica.height }));
}

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
grupo('15 — El redactor aparte YA NO EXISTE en el flujo');

// Se plantan respuestas de redacción a propósito: si alguien reconectara el
// redactor, se consumirían y esta comprobación lo delataría.
limpiar({ copyRespuestas: [{ title: 'No debería usarse', message: 'Nunca.' }] });
await llamar(ctrl.getConfig);
r = await llamar(ctrl.postTestPhoto, { body: { clubName: 'Cali', years: 40, photo: FOTO_URL } });
const sinRedactor = r.body.pieceId;
await llamar(ctrl.postTestAnalyze, { body: { pieceId: sinRedactor } });
r = await llamar(ctrl.postTestCopy, { body: { pieceId: sinRedactor } });
eq('la etapa del texto responde 200', r.code, 200);
eq('y devuelve copy null: el texto lo dibuja el modelo dentro de la imagen', r.body.copy, null);
eq('la respuesta plantada NO se consumió', prov.estado.copyRespuestas.length, 1);
eq('cero llamadas al modelo de texto', prov.estado.copyLlamadas, 0);


// ════════════════════════════════════════════════════════════════════
grupo('15b — El prompt base del administrador viaja sustituido y EXACTO');

// De punta a punta: se escribe un prompt base PROPIO con las tres variables,
// se genera, y lo que llega al proveedor es ESE texto con los datos reales —
// nada delante, nada detrás. Es la promesa del flujo simple.
limpiar();
r = await llamar(ctrl.getConfig);
const maestroPropio = 'Pieza sobria para {NOMBRE_CLUB}, que cumple {ANOS_CLUB} años, alrededor de {FOTO_CLUB}, con globos dorados.';
await llamar(ctrl.putConfig, { body: { config: { ...r.body.config, masterPrompt: maestroPropio } } });
r = await llamar(ctrl.postTestPhoto, { body: { clubName: 'Cali', years: 40, photo: FOTO_URL } });
const piezaMaster = r.body.pieceId;
await llamar(ctrl.postTestAnalyze, { body: { pieceId: piezaMaster } });
await llamar(ctrl.postTestCopy, { body: { pieceId: piezaMaster } });
await llamar(ctrl.postTestCompose, { body: { pieceId: piezaMaster } });
{
    const t = prov.estado.tareas[prov.estado.tareas.length - 1] || {};
    eq('el prompt base propio llegó EXACTO, con las variables sustituidas',
        t.prompt, S.applyMasterVariables(maestroPropio, { clubName: 'Club Rotario Cali', years: 40 }));
    ok('con el nombre real donde decía {NOMBRE_CLUB}', !!t.prompt?.includes('Club Rotario Cali'));
    ok('con la cifra real donde decía {ANOS_CLUB}', !!t.prompt?.includes('cumple 40 años'));
    ok('sin ningún marcador literal', !/\{(NOMBRE_CLUB|ANOS_CLUB|FOTO_CLUB)\}/.test(t.prompt || ''));
}

grupo('15c — La zona configurada queda en la pieza (para el modo `plain`)');

// La zona sólo importa cuando NO hay imagen del modelo (`plain`): ahí el
// compositor conserva la estructura de texto propia. Sin visión, `auto` cae
// al tercio inferior — el respaldo declarado del criterio.
limpiar();
r = await llamar(ctrl.getConfig);
await llamar(ctrl.putConfig, { body: { config: { ...r.body.config, textZone: 'bottom' } } });
r = await llamar(ctrl.postTestPhoto, { body: { clubName: 'Cali', years: 40, photo: FOTO_URL } });
r = await llamar(ctrl.postTestAnalyze, { body: { pieceId: r.body.pieceId } });
eq('con la zona fijada en `bottom`, queda `bottom`', r.body.zoneId, 'bottom');
await llamar(ctrl.putConfig, { body: { config: { ...(await llamar(ctrl.getConfig)).body.config, textZone: 'auto' } } });
r = await llamar(ctrl.postTestPhoto, { body: { clubName: 'Cali', years: 40, photo: FOTO_URL } });
r = await llamar(ctrl.postTestAnalyze, { body: { pieceId: r.body.pieceId } });
eq('con `auto` y sin visión, cae al tercio inferior', r.body.zoneId, 'bottom');

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

grupo('20b — GPT Image (OpenAI): el proveedor síncrono, de punta a punta');

// El motor de ChatGPT como modelo activo, elegido a mano desde el panel. La
// generación es SÍNCRONA: no hay tarea de KIE, la llamada va a OpenAI con la
// referencia y la fotografía, y el primer sondeo la encuentra lista.
limpiar();
process.env.OPENAI_API_KEY = 'prueba-openai';
openaiLlamadas.length = 0;
r = await llamar(ctrl.getConfig);
await llamar(ctrl.putConfig, { body: { config: { ...r.body.config, references: [{ url: FOTO_URL, primary: true }] } } });
const refGuardada = db.tablas.AnniversaryConfig[0].draft.references[0];
ok('la referencia guardada queda primaria', refGuardada.primary === true);
// v4.907: guardar la referencia YA NO la analiza con visión — viaja como
// IMAGEN, que es lo que el flujo simple promete.
eq('y guardarla no llamó a ningún modelo', prov.estado.copyLlamadas, 0);
await llamar(ctrl.putEngine, { body: { engine: { mode: 'manual', active: 'gpt-image-1', fallback: null } } });
r = await llamar(ctrl.postTestPhoto, { body: { clubName: 'Cali', years: 40, photo: FOTO_URL } });
const gptPieza = r.body.pieceId;
await llamar(ctrl.postTestAnalyze, { body: { pieceId: gptPieza } });
await llamar(ctrl.postTestCopy, { body: { pieceId: gptPieza } });
r = await llamar(ctrl.postTestCompose, { body: { pieceId: gptPieza } });
eq('componer con GPT Image responde 200', r.code, 200);
eq('NO se creó ninguna tarea en KIE', prov.estado.tareas.length, 0);
ok('la llamada fue a OpenAI, con la referencia Y la fotografía',
    openaiLlamadas.length === 1 && openaiLlamadas[0].imagenes === 2 && openaiLlamadas[0].model === 'gpt-image-1',
    JSON.stringify(openaiLlamadas.map(x => ({ imagenes: x.imagenes, model: x.model }))));
eq('el prompt fue el prompt base sustituido, VERBATIM también en OpenAI',
    openaiLlamadas[0]?.prompt,
    S.applyMasterVariables(S.DEFAULT_MASTER_PROMPT, { clubName: 'Club Rotario Cali', years: 40, variation: S.variationForSeed(gptPieza), phrase: S.phraseForSeed(gptPieza) }));
r = await llamar(ctrl.getTestPiece, { params: { id: gptPieza } });
eq('el PRIMER sondeo la encuentra lista', r.body.ready, true);
eq('el sello de auditoría dice el proveedor REAL', db.tablas.AnniversaryPiece[0].engine.provider, 'openai');
delete process.env.OPENAI_API_KEY;

grupo('20c — Sin la credencial de OpenAI, el error NOMBRA la variable correcta');
limpiar();
await llamar(ctrl.getConfig);
await llamar(ctrl.putEngine, { body: { engine: { mode: 'manual', active: 'gpt-image-1', fallback: null } } });
r = await llamar(ctrl.postTestPhoto, { body: { clubName: 'Cali', years: 40, photo: FOTO_URL } });
const sinCred = r.body.pieceId;
await llamar(ctrl.postTestAnalyze, { body: { pieceId: sinCred } });
await llamar(ctrl.postTestCopy, { body: { pieceId: sinCred } });
r = await llamar(ctrl.postTestCompose, { body: { pieceId: sinCred } });
ok('el fallo nombra OPENAI_API_KEY, no la credencial de KIE',
    r.code >= 400 && /OPENAI_API_KEY/.test(r.body.error || ''), `${r.code}: ${r.body.error}`);

grupo('20 — El motor es del operador de la plataforma');
for (const [nombre, fn] of [['getEngine', ctrl.getEngine], ['putEngine', ctrl.putEngine],
    ['postEngineActivate', ctrl.postEngineActivate], ['postBenchmarkRun', ctrl.postBenchmarkRun]]) {
    const rr = res();
    await fn(req({ user: { id: 'u2', email: 'club@x.org', role: 'club_admin' } }), rr);
    ok(`${nombre} rechaza a un administrador de sitio`, rr.code === 403, `dio ${rr.code}`);
}

// ════════════════════════════════════════════════════════════════════
grupo('21 — v4.909: la foto es la BASE, la referencia el EJEMPLO, y el debug dice la verdad');
//
// La queja original del cliente fue «ni con la referencia adjunta lo toma
// como referencia». La auditoría mostró que la referencia SIEMPRE viajó como
// imagen; lo que desviaba el resultado eran nuestras cláusulas y puertas, hoy
// eliminadas. Esto fija las dos mitades: el ORDEN de las imágenes (referencia
// primero, foto después) y que «Ver solicitud enviada al modelo» guarda
// EXACTAMENTE lo que viajó.
{
    limpiar();
    let rr = await llamar(ctrl.getConfig);
    const REF_URL = 'https://cdn.example/referencia-aniversario.png';
    await llamar(ctrl.putConfig, { body: { config: { ...rr.body.config, references: [{ url: REF_URL, primary: true }] } } });
    rr = await llamar(ctrl.postTestPhoto, { body: { clubName: 'Cali', years: 11, photo: FOTO_URL } });
    const conRef = rr.body.pieceId;
    await llamar(ctrl.postTestAnalyze, { body: { pieceId: conRef } });
    await llamar(ctrl.postTestCopy, { body: { pieceId: conRef } });
    await llamar(ctrl.postTestCompose, { body: { pieceId: conRef } });

    const t21 = prov.estado.tareas[0] || {};
    ok('viajan DOS imágenes: la fotografía y la referencia',
        Array.isArray(t21.imageUrls) && t21.imageUrls.length === 2, JSON.stringify(t21.imageUrls));
    // v4.909 — el ORDEN es la corrección del reporte con capturas: los modelos
    // de edición toman la PRIMERA imagen como base, y con la referencia
    // primera la salida era la referencia editada — con SU foto interna y SUS
    // textos («Cuatro décadas» en un club de 10 años).
    ok('la FOTOGRAFÍA va PRIMERA — es la base que el modelo edita',
        String(t21.imageUrls?.[0] || '').length > 0 && t21.imageUrls?.[0] !== REF_URL, JSON.stringify(t21.imageUrls));
    eq('y la referencia va SEGUNDA — el ejemplo de estilo', t21.imageUrls?.[1], REF_URL);

    const fila21 = db.tablas.AnniversaryPiece.find(p => p.id === conRef);
    eq('el debug guarda la referencia que viajó', fila21.request?.referenceUrl, REF_URL);
    eq('…el prompt que viajó', fila21.request?.prompt, t21.prompt);
    ok('…y el tamaño pedido', !!fila21.request?.size, JSON.stringify(fila21.request?.size));

    rr = await llamar(ctrl.getTestPiece, { params: { id: conRef } });
    ok('el sondeo la entrega y el panel recibe la solicitud completa',
        rr.body.ready === true && rr.body.request?.referenceUrl === REF_URL,
        JSON.stringify(rr.body.request || null).slice(0, 160));
    eq('los años del pedido real («11 años», el caso del cliente) van en el prompt',
        /11 años/.test(rr.body.request?.prompt || ''), true);
}

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`❌ ${malos.length} de ${pass + malos.length} comprobaciones fallaron:`);
    for (const m of malos) console.log(`   · ${m}`);
    process.exit(1);
}
console.log(`✅ ${pass} comprobaciones. El camino del servidor se comporta.`);
