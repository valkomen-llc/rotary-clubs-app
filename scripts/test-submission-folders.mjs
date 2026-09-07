// ════════════════════════════════════════════════════════════════════════════
// La carpeta de una solicitud — v4.1004
//
// Prueba el CRITERIO (puro) y las INVARIANTES que sostienen el módulo, leídas
// de los archivos. Sin base, sin credenciales y sin red: `submissionFolderSpec`
// no importa nada que las necesite, y lo que sí las necesita se comprueba
// mirando el código —que es lo único que ve un renombrado a medias entre el
// servidor y la pantalla (la lección de v4.889/v4.890)—.
//
// Verificadas a la inversa: reintroduciendo la relación por nombre, el estado
// de trabajo en `runLibraryStage` o el `<input type=file>` incondicional del
// recuadro de portada, fallan.
// ════════════════════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '..');
const leer = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');

/**
 * El archivo SIN comentarios.
 *
 * ⚠️ HACE FALTA Y COSTÓ DOS FALSOS FALLOS. Los comentarios de este repo
 * explican POR QUÉ no se hace algo —«no se usa ON CONFLICT», «CREATE TABLE IF
 * NOT EXISTS no amplía nada»— así que una comprobación textual sobre el
 * archivo entero encuentra en la explicación justo lo que vino a prohibir. Es
 * la lección de v4.991 por la otra puerta: allá el comentario DEFENDÍA una
 * comprobación que no comprobaba; acá la rompe. Se mira el CÓDIGO.
 */
const codigo = (p) => leer(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*(\/\/|--)/.test(l)).join('\n');

const spec = await import('../server/lib/submissionFolderSpec.js');

// ─── El criterio ───────────────────────────────────────────────────────────

test('el nombre sale del título y entra en el tope de la Biblioteca', () => {
    // El caso REAL del Distrito, que mide 83 caracteres y no cabe en los 60
    // que admite `validateFolderName`. Si no se recortara, la carpeta no se
    // podría crear y el material quedaría suelto en la raíz.
    const real = 'Entrega mercados, medicamentos, ropa, entrega a ayudas a cuerpo de bomberos Sevilla';
    const n = spec.submissionFolderName({ title: real });
    assert.ok(n.length <= spec.FOLDER_NAME_MAX, `mide ${n.length}`);
    assert.equal(spec.checkDerivedName(n).ok, true, 'la Biblioteca lo acepta');
    // Y NO se parte a mitad de palabra: un nombre cortado así se lee como un
    // error del sistema sobre una carpeta que el equipo mira todos los días.
    assert.ok(!/\S$/.test(real.slice(n.length, n.length + 1)) || real.startsWith(n),
        'el corte cae en un límite de palabra');
    assert.ok(!n.endsWith(','), 'no queda un signo colgando');
});

test('sin título se identifica sin inventar nada', () => {
    assert.equal(
        spec.submissionFolderName({ club: 'Rotary Sevilla Capital Cafetera', activityDate: '2026-08-14' }),
        'Rotary Sevilla Capital Cafetera · 2026-08-14'
    );
    // Sin club ni fecha queda el id corto: feo y cierto. Nunca vacío — una
    // carpeta sin nombre no se puede crear.
    assert.equal(spec.submissionFolderName({ id: 'abc12345-6789' }), 'Solicitud abc12345');
    assert.ok(spec.submissionFolderName({}).length > 0);
});

test('una fecha que no es una fecha no se pinta como fecha', () => {
    // El campo admite texto libre desde v4.968 («la semana pasada»), y meterlo
    // en el nombre daría «Rotary X · la semana pas». Se ignora.
    const n = spec.submissionFolderName({ club: 'Rotary X', activityDate: 'la semana pasada' });
    assert.equal(n, 'Rotary X');
});

test('la barra no cuesta la carpeta; el guion y las tildes se conservan', () => {
    // El título lo escribe alguien en un formulario PÚBLICO: una barra no
    // puede impedir que su material se ordene. Se reemplaza, no se rechaza.
    assert.equal(spec.sanitizeFolderName('Ropa/calzado y agua'), 'Ropa calzado y agua');
    assert.equal(spec.sanitizeFolderName('Post-emergencia — Sevilla'), 'Post-emergencia — Sevilla');
    assert.equal(spec.sanitizeFolderName('Donación a niños'), 'Donación a niños');
});

test('el nombre repetido se libera con el id corto, y es ESTABLE', () => {
    const taken = new Set(['entrega de mercados']);
    const a = spec.freeFolderName('Entrega de mercados', { taken, id: 'f7a91c22-1111' });
    const b = spec.freeFolderName('Entrega de mercados', { taken, id: 'f7a91c22-1111' });
    assert.notEqual(a, 'Entrega de mercados');
    // ⚠️ ESTABLE ENTRE REPROCESOS: con un contador, cada reintento del workflow
    // daría «(2)», «(3)», «(4)»… y el material quedaría repartido.
    assert.equal(a, b);
    assert.ok(a.length <= spec.FOLDER_NAME_MAX);
    // Sin choque, el nombre no se toca.
    assert.equal(spec.freeFolderName('Otra cosa', { taken, id: 'x' }), 'Otra cosa');
});

test('la ruta se COMPONE, no se guarda', () => {
    assert.equal(spec.folderPathLabel('Solicitudes de contenido', 'Entrega'), 'Solicitudes de contenido › Entrega');
    // Sin raíz —la carpeta cuelga de la raíz de la Biblioteca— no queda un
    // separador colgando.
    assert.equal(spec.folderPathLabel('', 'Entrega'), 'Entrega');
});

// ─── Las invariantes ───────────────────────────────────────────────────────

test('⚠️ la relación va por ID, nunca por nombre', () => {
    const io = leer('server/lib/submissionFolders.js');
    // La carpeta se busca por origen. Buscarla por nombre encontraría la de
    // otra solicitud —dos títulos iguales son normales— o ninguna, y el fallo
    // sería mudo: una carpeta nueva por reproceso.
    assert.match(io, /"sourceType" = \$2 AND "sourceId" = \$3/);
    assert.doesNotMatch(io, /WHERE .*LOWER\(name\) = LOWER\(\$1\)/,
        'la resolución no busca por nombre');
    // El índice único es lo que hace idempotente al workflow.
    const ensure = leer('server/lib/ensureMediaFolderSchema.js');
    assert.match(ensure, /MediaFolder_source_key/);
    assert.match(ensure, /WHERE "sourceId" IS NOT NULL/);
});

test('⚠️ las columnas nuevas están en el atajo del ensure (trampa de v4.908)', () => {
    const ensure = codigo('server/lib/ensureMediaFolderSchema.js');
    // `CREATE TABLE IF NOT EXISTS` no amplía nada: con el atajo mirando sólo
    // tablas, el ALTER no correría NUNCA en una base que ya tiene MediaFolder
    // —que son todas—, y el INSERT fallaría con «column does not exist».
    // El atajo es lo que va ANTES del primer CREATE del código.
    const atajo = ensure.slice(0, ensure.indexOf('CREATE TABLE IF NOT EXISTS'));
    assert.match(atajo, /column_name = 'sourceId'/, 'el atajo comprueba la columna nueva');
    assert.match(atajo, /has_source/);
    // Y las tres se agregan de verdad.
    for (const col of ['"sourceType"', '"sourceId"', '"campaignId"']) {
        assert.ok(ensure.includes(`ADD COLUMN IF NOT EXISTS ${col}`), `falta ${col}`);
    }
});

test('⚠️ el índice parcial NO se usa con ON CONFLICT (trampa de v4.648)', () => {
    const io = codigo('server/lib/submissionFolders.js');
    // Tendría que repetir su predicado exacto o la sentencia falla entera. La
    // idempotencia se resuelve leyendo tras el choque, que además cubre la
    // carrera entre el cron, el sondeo y el botón.
    assert.doesNotMatch(io, /ON CONFLICT/);
    assert.match(io, /e\?\.code !== '23505'/, 'el choque se atrapa y se vuelve a leer');
});

test('⚠️ la carpeta se escribe en la MISMA fila de Media, sin registro paralelo', () => {
    const store = leer('server/lib/contentSubmissionStore.js');
    const insert = store.slice(store.indexOf('INSERT INTO "Media"'), store.indexOf('RETURNING id, url'));
    assert.match(insert, /"folderId"/, 'el archivo nace en su carpeta');
    // Y la carpeta se resuelve UNA vez, antes del bucle: una por archivo serían
    // diez resoluciones para la misma carpeta.
    const cuerpo = store.slice(store.indexOf('export async function promoteToLibrary'), store.indexOf('export async function ensureLibraryFiling'));
    assert.equal((cuerpo.match(/ensureSubmissionFolder\(/g) || []).length, 1);
    assert.ok(cuerpo.indexOf('ensureSubmissionFolder(') < cuerpo.indexOf('for (const f of archivos)'));
});

test('⚠️ no poder ordenar NO puede costar el material', () => {
    const store = leer('server/lib/contentSubmissionStore.js');
    const cuerpo = store.slice(store.indexOf('export async function promoteToLibrary'), store.indexOf('export async function ensureLibraryFiling'));
    // Con la carpeta sin resolver, `folderId` es null y la promoción sigue: el
    // archivo queda en la raíz, que es donde quedaba hasta v4.1003.
    assert.match(cuerpo, /const folderId = carpeta\.ok \? carpeta\.folder\.id : null/);
    assert.doesNotMatch(cuerpo, /if \(!carpeta\.ok\) return/);
    // Y el motivo viaja, no se traga.
    assert.match(cuerpo, /folderNote/);
});

test('⚠️ lo ya promovido se recoge sin mover un byte y sin pisar una elección', () => {
    const io = leer('server/lib/submissionFolders.js');
    const fn = io.slice(io.indexOf('export async function fileFolderBackfill'), io.indexOf('export async function submissionFolderView'));
    assert.match(fn, /UPDATE "Media" SET "folderId"/);
    // ⚠️ `WHERE "folderId" IS NULL`: si alguien movió esa foto a otra carpeta
    // desde la Librería, ésa es su decisión y volver a traerla acá sería
    // desobedecerla en cada sincronización.
    assert.match(fn, /AND "folderId" IS NULL/);
    assert.doesNotMatch(fn, /CopyObject|copyToLibrary/, 'no se copia nada');
});

test('⚠️ el camino de lo VIEJO existe: todo promovido también resuelve carpeta', () => {
    const engine = leer('server/lib/submissionArticleEngine.js');
    const fn = engine.slice(engine.indexOf('export async function sendMediaToLibrary'), engine.indexOf('export async function publishArticle'));
    // Sin esto, una solicitud promovida antes de v4.1004 nunca crearía su
    // carpeta: `promoteToLibrary` no llega a correr porque no queda ningún
    // archivo por copiar, y la rama sale temprano.
    const temprano = fn.slice(0, fn.indexOf("reason: 'ya_estaban'"));
    assert.match(temprano, /ensureLibraryFiling\(/);
});

test('⚠️ un artículo YA cerrado puede recibir su material sin volver a trabajar', () => {
    const engine = leer('server/lib/submissionArticleEngine.js');
    const fn = engine.slice(engine.indexOf('export async function runLibraryStage'), engine.indexOf('export async function sweepArticleLibrary'));
    // ÉSTE es el defecto de fondo del reporte: `advanceArticle` arranca con
    // `if (!isWorkingState(...)) return done`, así que un artículo de antes de
    // v4.1002 —cerrado en «borrador listo»— no corría la etapa nunca.
    assert.match(fn, /if \(isWorkingState\(row\.status\)\) return/, 'no pisa un artículo en curso');
    // ⚠️ Y NO TOCA EL ESTADO EDITORIAL: el UPDATE escribe stages y statusDetail
    // y NADA más. Devolverlo a «generando» dejaría que el motor le pisara el
    // trabajo a quien lo está revisando.
    const update = fn.slice(fn.indexOf('UPDATE "SubmissionArticle"'), fn.indexOf('RETURNING *'));
    assert.doesNotMatch(update, /status = /, 'el estado no se toca');
    assert.match(update, /stages = \$2::jsonb/);
});

test('⚠️ el reintento está topado: un fallo no se repite en cada sondeo', () => {
    const engine = leer('server/lib/submissionArticleEngine.js');
    const fn = engine.slice(engine.indexOf('export const needsLibraryStage'), engine.indexOf('export async function runLibraryStage'));
    assert.match(fn, /STAGE_MAX_TRIES/);
    // Y una etapa ya cumplida deja de ser candidata: correrlo diez veces hace
    // trabajo la primera (el patrón de `walletSweep`).
    assert.match(fn, /status === 'ok'\) return false/);
});

test('⚠️ el barrido no toca lo descartado ni lo que ya está completo', () => {
    const engine = leer('server/lib/submissionArticleEngine.js');
    const fn = engine.slice(engine.indexOf('export async function sweepArticleLibrary'), engine.indexOf('/** Corre etapas hasta terminar'));
    // Promover el material de un artículo descartado aprobaría una solicitud
    // que alguien decidió no usar.
    assert.doesNotMatch(fn, /'descartado'/);
    // Sólo entra lo que de verdad tiene algo pendiente: archivos sin promover
    // o archivos promovidos sin carpeta.
    assert.match(fn, /f\."mediaId" IS NULL/);
    assert.match(fn, /m\."folderId" IS NOT NULL/);
    assert.match(fn, /budgetMs/, 'con presupuesto de tiempo');
});

test('⚠️ la carpeta del artículo se DERIVA, no se guarda en una segunda columna', () => {
    const ensure = leer('server/lib/ensureSubmissionArticleSchema.js');
    // Una columna `mediaFolderId` en `SubmissionArticle` sería una segunda
    // verdad sobre lo mismo y se contradiría en cuanto alguien borrara la
    // carpeta desde la Librería.
    assert.doesNotMatch(ensure, /mediaFolderId|folderId/);
    const ctrl = leer('server/controllers/submissionArticleController.js');
    assert.match(ctrl, /submissionFolderView\(\{ clubId: row\.clubId, submissionId: row\.submissionId \}\)/);
    // Y `Post` tampoco gana columnas (regla de `logo_intl`, v4.699).
    const prisma = leer('server/prisma/schema.prisma');
    const post = prisma.slice(prisma.indexOf('\nmodel Post '), prisma.indexOf('\nmodel ', prisma.indexOf('\nmodel Post ') + 10));
    assert.doesNotMatch(post, /mediaFolderId|sourceContentRequestId/);
});

test('⚠️ el aislamiento por sitio no se afloja', () => {
    const io = leer('server/lib/submissionFolders.js');
    // Toda consulta de carpetas acota por sitio. Una solicitud del 4281 no
    // puede resolver a una carpeta de otro tenant.
    const consultas = io.match(/FROM "MediaFolder"[\s\S]{0,240}?\[/g) || [];
    assert.ok(consultas.length >= 2);
    for (const q of consultas) {
        if (!q.includes('WHERE id = $1')) {
            assert.match(q, /"clubId" IS NOT DISTINCT FROM \$1/, `sin acotar por sitio: ${q.slice(0, 80)}`);
        }
    }
    // El endpoint «Usado en» decide el 404 sobre la lista YA acotada.
    const media = leer('server/routes/media.js');
    const origen = media.slice(media.indexOf("router.get('/library-folders/:id/origin'"), media.indexOf("// POST /api/media/library-folders"));
    assert.match(origen, /folders\.find\(f => f\.id === req\.params\.id\)/);
    assert.match(origen, /404/);
});

test('⚠️ el selector abre en la carpeta y NO encierra a nadie', () => {
    const picker = leer('src/components/admin/content-studio/MediaPicker.tsx');
    assert.match(picker, /initialFolderId/);
    // Reabrir vuelve al material de la solicitud: el selector queda montado
    // con isOpen en falso (la lección del centinela remontado, v4.903).
    assert.match(picker, /setCurrentFolder\(initialFolderId\)/);
    // Es un punto de partida, no un encierro.
    assert.match(picker, /TODA LA BIBLIOTECA/);
    assert.match(picker, /VOLVER AL MATERIAL DE LA SOLICITUD/);
    // Lo que se sube desde acá cae en la carpeta ABIERTA.
    assert.match(picker, /uploadMediaFiles\(lista, \{ folderId: currentFolder \}\)/);
    // Y por el camino de siempre: un segundo camino de subida se separaría.
    assert.doesNotMatch(picker, /presigned-url/);
    // El input se limpia o volver a elegir el MISMO archivo no dispara change.
    assert.match(picker, /inputSubida\.current\.value = ''/);
});

test('⚠️ sin carpeta, el selector se comporta EXACTAMENTE como antes', () => {
    const picker = leer('src/components/admin/content-studio/MediaPicker.tsx');
    // `null` sigue significando «sin filtrar»: las diez pantallas que ya lo
    // usaban ven todas las imágenes del sitio, sueltas o en carpetas.
    assert.match(picker, /initialFolderId = null/);
    assert.match(picker, /allowUpload = false/, 'subir es opt-in');
    const news = leer('src/pages/admin/News.tsx');
    // Un artículo escrito a mano no tiene carpeta y su recuadro sigue siendo
    // el `<input type=file>` de siempre.
    assert.match(news, /carpetaDeSolicitud \? \(/);
    assert.match(news, /o\?\.folderId \? \{ id: o\.folderId/);
});

test('⚠️ la trazabilidad va en los TRES sentidos', () => {
    const news = leer('src/pages/admin/News.tsx');
    // artículo → solicitud (ya existía) y artículo → carpeta (v4.1004).
    assert.match(news, /VER SOLICITUD ORIGINAL/);
    assert.match(news, /ARCHIVOS RELACIONADOS/);
    assert.match(news, /\/admin\/media\?folder=/);
    // carpeta → solicitud y carpeta → artículo.
    const lib = leer('src/pages/admin/MediaLibrary.tsx');
    assert.match(lib, /origenCarpeta\?\.submissionId/);
    assert.match(lib, /VER SOLICITUD/);
    assert.match(lib, /VER ARTÍCULO/);
    // Y el enlace de verdad para en esa carpeta: sin esta mitad abriría en la
    // raíz y habría que buscarla a mano.
    assert.match(lib, /useState<string \| null>\(params\.get\('folder'\)\)/);
});

test('⚠️ la ficha de la solicitud dice DÓNDE quedó el material', () => {
    const picker = leer('src/components/admin/contribution/ArticleMediaPicker.tsx');
    assert.match(picker, /ABRIR CARPETA/);
    // La carpeta se toma SIEMPRE, controlado o no: es un dato del servidor y
    // nace justo al promover. Dentro del `if (!controlado)` no aparecería en
    // Noticias hasta recargar.
    const aplicar = picker.slice(picker.indexOf('const aplicar = '), picker.indexOf('const media = borrador'));
    const dentro = aplicar.slice(aplicar.indexOf('if (!controlado) {'), aplicar.indexOf('}', aplicar.indexOf('if (!controlado) {')));
    assert.doesNotMatch(dentro, /setCarpeta/);
    assert.match(aplicar, /setCarpeta\(data\?\.folder \|\| null\)/);
});
