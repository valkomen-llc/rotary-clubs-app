// ════════════════════════════════════════════════════════════════════
// La carpeta de una solicitud en la Biblioteca — pruebas — v4.1004
//
// SIN base, SIN credenciales y SIN red. Prueban `submissionFolders.js` —el
// criterio puro— y unas INVARIANTES leídas de los archivos, que ninguna otra
// comprobación ve:
//
//   · que la relación solicitud↔carpeta se persista por ID y NUNCA se deduzca
//     del nombre;
//   · que `promoteToLibrary` se siga llamando desde UN solo sitio;
//   · que el `folderId` viaje en el MISMO INSERT de `Media`;
//   · que sincronizar NO toque el texto, el SEO ni las etiquetas del Post;
//   · que la columna nueva esté enumerada en el atajo de cada ensure (la
//     trampa de v4.908);
//   · que el selector abra en la carpeta de la solicitud y deje volver a la
//     Biblioteca completa;
//   · que subir desde el selector use `uploadMediaFiles`, el camino de siempre.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { MAX_NAME } from '../server/lib/mediaFolders.js';
import {
    ROOT_FOLDER_NAME, FOLDER_SOURCES, sanitizeFolderText, trimToWords,
    submissionFolderName, freeFolderName, folderPathLabel, describeSync,
    pendingFiles, syncPlan,
} from '../server/lib/submissionFolders.js';

const leer = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// El caso REAL del reporte: 82 caracteres contra un tope de 60.
const TITULO_REAL = 'Entrega mercados, medicamentos, ropa, entrega a ayudas a cuerpo de bomberos Sevilla';

// ─── El nombre ─────────────────────────────────────────────────────────

test('la raíz se llama como el pedido y el catálogo de fuentes es cerrado', () => {
    assert.equal(ROOT_FOLDER_NAME, 'Solicitudes de contenido');
    assert.deepEqual(Object.keys(FOLDER_SOURCES).sort(), ['root', 'submission']);
    assert.equal(FOLDER_SOURCES.submission, 'content_submission');
});

test('⚠️ el título real del cliente se recorta SIN partir palabras', () => {
    assert.ok(TITULO_REAL.length > MAX_NAME, 'el caso tiene que ser más largo que el tope');
    const n = submissionFolderName({ title: TITULO_REAL });
    assert.ok(n.length <= MAX_NAME, `${n.length} > ${MAX_NAME}`);
    // Ni una palabra cortada por la mitad: cada palabra del nombre tiene que
    // existir entera en el título.
    const palabras = TITULO_REAL.replace(/,/g, '').split(/\s+/);
    for (const w of n.replace(/,/g, '').split(/\s+/)) assert.ok(palabras.includes(w), `«${w}» no está entero`);
    // Y no termina en coma ni en guion colgando.
    assert.ok(!/[\s,;:.\-–—]$/u.test(n), `termina mal: «${n}»`);
});

test('la barra no rechaza el nombre: se reemplaza, no se pierde la carpeta', () => {
    assert.equal(sanitizeFolderText('entrega 2026/2027'), 'entrega 2026-2027');
    assert.equal(sanitizeFolderText('a\\b'), 'a-b');
    // Un guion legítimo NO se toca.
    assert.equal(sanitizeFolderText('post-sismo'), 'post-sismo');
    // Espacios repetidos y de los extremos.
    assert.equal(sanitizeFolderText('  dos   espacios  '), 'dos espacios');
});

test('una palabra sola más larga que el tope se corta duro antes que quedar vacía', () => {
    const larga = 'A'.repeat(120);
    const n = trimToWords(larga, 20);
    assert.equal(n.length, 20);
});

test('sin título se baja a la descripción, al club y por último al id', () => {
    assert.equal(submissionFolderName({ description: 'Primera frase. Segunda frase.' }), 'Primera frase');
    assert.equal(submissionFolderName({ club: 'Sevilla', activityDate: '2026-08-14' }), 'Sevilla — 2026-08-14');
    assert.equal(submissionFolderName({ senderName: 'Ana Pérez' }), 'Ana Pérez');
    // El último escalón SIEMPRE devuelve algo: una solicitud sin nada tiene
    // que tener carpeta igual.
    assert.equal(submissionFolderName({ id: 'abcdef12-3456' }), 'Solicitud abcdef12');
    assert.ok(submissionFolderName({}).length > 0);
});

test('un título de dos letras no gana: se pasa al siguiente candidato', () => {
    // Menos de 3 caracteres no es un nombre reconocible.
    assert.equal(submissionFolderName({ title: 'ok', senderName: 'Ana Pérez' }), 'Ana Pérez');
});

test('⚠️ dos solicitudes con el MISMO título conviven: el nombre se desempata', () => {
    assert.equal(freeFolderName('Entrega de mercados', []), 'Entrega de mercados');
    assert.equal(freeFolderName('Entrega de mercados', ['Entrega de mercados']), 'Entrega de mercados (2)');
    // La comparación ignora la caja, igual que el índice único de la base
    // (`LOWER(name)`): si no, se elegiría un nombre «libre» que la base rechaza.
    assert.equal(freeFolderName('Entrega de mercados', ['ENTREGA DE MERCADOS']), 'Entrega de mercados (2)');
    assert.equal(freeFolderName('X', ['X', 'x (2)', 'X (3)']), 'X (4)');
});

test('el sufijo cabe: un nombre en el tope + «(2)» no pasa de MAX_NAME', () => {
    const n = freeFolderName(TITULO_REAL, [submissionFolderName({ title: TITULO_REAL })]);
    assert.ok(n.length <= MAX_NAME, `${n.length} > ${MAX_NAME}: «${n}»`);
    assert.ok(n.endsWith('(2)'));
});

test('la ruta que se le enseña a una persona lleva la raíz', () => {
    assert.equal(folderPathLabel('Entrega'), 'Solicitudes de contenido / Entrega');
    assert.equal(folderPathLabel('Entrega', 'Otra raíz'), 'Otra raíz / Entrega');
});

// ─── El desenlace ──────────────────────────────────────────────────────

test('⚠️ «9 de 10 archivos sincronizados» — el número, no un genérico', () => {
    const r = describeSync({ total: 10, promoted: 9, failed: 1 });
    assert.equal(r.tone, 'warn');
    assert.equal(r.headline, '9 de 10 archivos sincronizados.');
    assert.match(r.detail, /Reintentar archivo pendiente/);
    assert.equal(r.retryable, true);
});

test('todo bien no ofrece reintento; nada bien lo ofrece y NO dice que se perdió el artículo', () => {
    const ok = describeSync({ total: 3, promoted: 3 });
    assert.equal(ok.tone, 'ok');
    assert.equal(ok.retryable, false);
    assert.equal(ok.headline, '3 de 3 archivos sincronizados.');

    const mal = describeSync({ total: 3, failed: 3 });
    assert.equal(mal.tone, 'error');
    assert.equal(mal.retryable, true);
    assert.match(mal.detail, /El borrador se conserva/);
});

test('sin archivos NO es un error: es una solicitud que no trae fotos', () => {
    const r = describeSync({ total: 0 });
    assert.equal(r.tone, 'neutral');
    assert.equal(r.retryable, false);
});

test('lo que ya estaba cuenta como sincronizado', () => {
    const r = describeSync({ total: 4, promoted: 0, already: 4 });
    assert.equal(r.tone, 'ok');
    assert.equal(r.headline, '4 de 4 archivos sincronizados.');
    assert.match(r.detail, /Ya estaban/);
});

test('los pendientes se nombran POR ARCHIVO, con su motivo', () => {
    const p = pendingFiles([
        { id: 'a', filename: 'foto1.jpg', mediaId: 'm1' },
        { id: 'b', filename: 'foto2.jpg', mediaId: null, promoteError: 'AccessDenied' },
        { id: 'c', filename: null, mediaId: null },
    ]);
    assert.deepEqual(p, [
        { id: 'b', filename: 'foto2.jpg', error: 'AccessDenied' },
        { id: 'c', filename: 'archivo', error: null },
    ]);
});

test('⚠️ el plan es idempotente: lo que ya está en la Biblioteca no se vuelve a copiar', () => {
    const plan = syncPlan([
        { id: 'a', mediaId: 'm1' },
        { id: 'b', mediaId: null },
        { id: 'c', mediaId: 'm3' },
    ]);
    assert.deepEqual(plan.promote, ['b']);
    assert.deepEqual(plan.inLibrary, ['m1', 'm3']);
    assert.equal(plan.nothingToPromote, false);
    assert.equal(plan.total, 3);

    const nada = syncPlan([{ id: 'a', mediaId: 'm1' }]);
    assert.equal(nada.nothingToPromote, true);
    assert.deepEqual(nada.promote, []);
});

// ─── Invariantes leídas de los archivos ────────────────────────────────

test('⚠️ el vínculo se persiste por ID en las DOS puntas', () => {
    const ensureSub = leer('server/lib/ensureContentSubmissionSchema.js');
    const ensureFolder = leer('server/lib/ensureMediaFolderSchema.js');
    const ensureArt = leer('server/lib/ensureSubmissionArticleSchema.js');

    assert.match(ensureSub, /"mediaFolderId" TEXT/, 'la solicitud guarda su carpeta');
    assert.match(ensureFolder, /ADD COLUMN IF NOT EXISTS "sourceId"/, 'la carpeta guarda de qué es');
    assert.match(ensureArt, /"mediaFolderId" TEXT/, 'el artículo guarda su carpeta');

    // Y la carrera la cierra un índice ÚNICO, no una lectura previa.
    assert.match(ensureFolder, /CREATE UNIQUE INDEX IF NOT EXISTS "MediaFolder_source_key"/);
});

test('⚠️ TODO `ADD COLUMN` está enumerado en el atajo de su ensure (trampa de v4.908)', () => {
    for (const archivo of [
        'server/lib/ensureContentSubmissionSchema.js',
        'server/lib/ensureMediaFolderSchema.js',
        'server/lib/ensureSubmissionArticleSchema.js',
        // `ensureDisbursementSchema` NO entra: no tiene atajo por columnas —
        // corre sus ALTER en la rama de «la tabla ya existe», así que la
        // trampa no aplica ahí.
    ]) {
        const src = leer(archivo);
        const atajo = src.slice(0, src.indexOf('_ready = true; return;') > 0
            ? src.indexOf('_ready = true; return;') + 40
            : Math.min(src.length, 4000));
        for (const m of src.matchAll(/ADD COLUMN IF NOT EXISTS "([A-Za-z0-9_]+)"/g)) {
            assert.ok(atajo.includes(m[1]), `${archivo}: «${m[1]}» no está en la comprobación rápida`);
        }
        for (const m of src.matchAll(/'"([A-Za-z0-9_]+)" (?:TEXT|JSONB|BOOLEAN|INTEGER)/g)) {
            assert.ok(atajo.includes(m[1]), `${archivo}: «${m[1]}» no está en la comprobación rápida`);
        }
    }
});

test('⚠️ la carpeta se busca por FUENTE, nunca comparando el nombre', () => {
    const io = leer('server/lib/submissionMediaFolder.js');
    // La resolución de la carpeta de una solicitud pasa por `bySource`.
    assert.match(io, /const yaEsta = await bySource\(FOLDER_SOURCES\.submission, submission\.id, clubId\)/);
    // La ÚNICA comparación por nombre es la adopción de una raíz homónima
    // creada a mano, y sólo llena `sourceId` si estaba vacío.
    const porNombre = [...io.matchAll(/LOWER\(name\) = LOWER/g)].length;
    assert.equal(porNombre, 1, 'sólo la adopción de la raíz compara nombres');
    assert.match(io, /WHERE id = \$1 AND "sourceId" IS NULL/);
});

test('⚠️ `promoteToLibrary` se sigue llamando desde UN solo sitio', () => {
    const archivos = [
        'server/lib/submissionArticleEngine.js',
        'server/controllers/contentSubmissionController.js',
        'server/controllers/submissionArticleController.js',
        'server/lib/submissionMediaFolder.js',
    ];
    let llamadas = 0;
    for (const f of archivos) llamadas += [...leer(f).matchAll(/await promoteToLibrary\(/g)].length;
    assert.equal(llamadas, 1, 'un segundo camino de promoción se separa del primero en silencio');
});

test('⚠️ el `folderId` viaja en el MISMO INSERT de `Media`', () => {
    const store = leer('server/lib/contentSubmissionStore.js');
    const insert = store.slice(store.indexOf('INSERT INTO "Media"'), store.indexOf('INSERT INTO "Media"') + 400);
    assert.match(insert, /"folderId"/, 'sin esto queda una ventana con el archivo suelto en la raíz');
    // Y NO se escribe con un UPDATE posterior.
    assert.ok(!/UPDATE "Media" SET "folderId"/.test(store), 'la carpeta no se parcha después');
});

test('⚠️ acomodar SÓLO llena el hueco: nunca pisa una carpeta elegida a mano', () => {
    const io = leer('server/lib/submissionMediaFolder.js');
    assert.match(io, /UPDATE "Media" SET "folderId" = \$1 WHERE id = ANY\(\$2::text\[\]\) AND "folderId" IS NULL/);
});

test('⚠️ sincronizar NO toca el texto, el SEO ni las etiquetas del Post', () => {
    const eng = leer('server/lib/submissionArticleEngine.js');
    const desde = eng.indexOf('export async function syncArticleMedia');
    const hasta = eng.indexOf('export async function updateArticleMedia');
    const cuerpo = eng.slice(desde, hasta);
    for (const campo of ['title', 'content', 'category', 'tags', 'keywords', 'seoTitle', 'seoDescription', 'slug']) {
        assert.ok(!new RegExp(`SET[\\s\\S]*\\b${campo}\\b\\s*=`).test(cuerpo), `syncArticleMedia escribe ${campo}`);
    }
    // Lo que sí toca, y la portada bajo su guardia.
    assert.match(cuerpo, /SET images = \$2, "videoGallery" = \$3/);
    assert.match(cuerpo, /pisarPortada/);
});

test('⚠️ la sincronización no regenera el artículo', () => {
    const eng = leer('server/lib/submissionArticleEngine.js');
    const desde = eng.indexOf('export async function syncSubmissionLibrary');
    const hasta = eng.indexOf('export async function articleFolder');
    const cuerpo = eng.slice(desde, hasta);
    assert.ok(desde > 0 && hasta > desde);
    for (const f of ['generateArticleFromContext', 'advanceArticle', 'retryArticleStage', 'regenerateSection']) {
        assert.ok(!cuerpo.includes(f), `syncSubmissionLibrary llama a ${f}`);
    }
});

test('⚠️ un archivo que falla NO cancela el artículo', () => {
    const ctrl = leer('server/controllers/submissionArticleController.js');
    // El 409 se reserva para lo que impide empezar; una promoción a medias
    // contesta 200 con su número y la lista de pendientes.
    assert.match(ctrl, /if \(!r\.ok && r\.reason !== 'biblioteca'\)/);
    const eng = leer('server/lib/submissionArticleEngine.js');
    assert.match(eng, /if \(promotion\.fallidos && !promotion\.promovidos && !plan\.inLibrary\.length\)/);
});

test('⚠️ el artículo sigue naciendo SIN publicar', () => {
    const eng = leer('server/lib/submissionArticleEngine.js');
    const insert = eng.slice(eng.indexOf('INSERT INTO "Post"'), eng.indexOf('INSERT INTO "Post"') + 900);
    assert.match(insert, /FALSE/, 'el borrador nace sin publicar');
    const publica = [...eng.matchAll(/UPDATE "Post" SET published = TRUE/g)].length;
    assert.equal(publica, 1, 'el único punto que publica vive en publishArticle');
    const desde = eng.indexOf('export async function publishArticle');
    assert.ok(eng.indexOf('UPDATE "Post" SET published = TRUE') > desde);
});

test('⚠️ `Post` y `Media` no ganan una columna de solicitud en Prisma', () => {
    const schema = leer('server/prisma/schema.prisma');
    const post = schema.slice(schema.indexOf('model Post {'), schema.indexOf('model Post {') + 3000);
    for (const c of ['submissionId', 'contentRequestId', 'mediaFolderId']) {
        assert.ok(!post.includes(c), `Post declara ${c}`);
    }
    // `Media.folderId` SÍ está declarada, que es la otra mitad de la regla:
    // el guardián de db:push compara TABLAS, no columnas.
    const media = schema.slice(schema.indexOf('model Media {'), schema.indexOf('model Media {') + 2500);
    assert.match(media, /folderId\s+String\?/);
});

test('⚠️ `Media.sourceType` NO se reescribe con la solicitud', () => {
    // Esas columnas dicen de qué SITIO es el archivo y gobiernan los chips de
    // categoría del selector (v4.339). Escribirles la solicitud sacaría estas
    // fotos de su categoría sin que nadie lo pidiera.
    const store = leer('server/lib/contentSubmissionStore.js');
    const insert = store.slice(store.indexOf('INSERT INTO "Media"'), store.indexOf('INSERT INTO "Media"') + 400);
    assert.ok(!insert.includes('sourceType'), 'la promoción no escribe sourceType');
});

test('⚠️ la carpeta vive en el espacio del TENANT', () => {
    const io = leer('server/lib/submissionMediaFolder.js');
    // Toda consulta que RESUELVE o CREA una carpeta acota por sitio: es lo
    // que impide que una solicitud de un sitio toque la Biblioteca de otro.
    //
    // ⚠️ `folderById` es la excepción DECLARADA y no es un hueco: lee por
    // clave primaria un id que sale de una fila YA acotada
    // (`submission.mediaFolderId`, `row.mediaFolderId`) o del `parentId` de
    // una carpeta recién leída. Ningún id de la petición llega ahí — si algún
    // día llegara, esta prueba tiene que dejar de eximirla.
    // Se mira la parte que RESUELVE y CREA (todo lo anterior a `folderById`):
    // `bySource`, `createFolder`, `siblingNames`, `ensureRootFolder` y
    // `ensureSubmissionFolder`. Lo de después —`folderById` y `folderUsage`—
    // lee por ids que salen de filas YA acotadas, y por eso se exime.
    const cuerpo = io.slice(0, io.indexOf('export async function folderById'));
    assert.ok(!/req\.(body|params|query)/.test(io), 'el módulo lee la petición');
    const selects = [...cuerpo.matchAll(/(?:FROM|INTO|UPDATE) "MediaFolder"[\s\S]{0,260}/g)].map(m => m[0]);
    assert.ok(selects.length >= 4, `sólo ${selects.length} consultas de carpeta`);
    for (const q of selects) {
        assert.ok(
            /"clubId" IS NOT DISTINCT FROM/.test(q) || /"clubId", "parentId"/.test(q) || /WHERE id = \$1 AND "sourceId" IS NULL/.test(q),
            `consulta sin acotar por sitio: ${q.slice(0, 90)}`
        );
    }
});

test('⚠️ ningún `ON CONFLICT` apunta por columnas a un índice PARCIAL', () => {
    // Los tres índices únicos de `MediaFolder` son parciales: nombrarlos por
    // columnas exigiría repetir su predicado o la sentencia falla entera
    // (v4.648). A secas cubre los tres.
    const io = leer('server/lib/submissionMediaFolder.js');
    for (const m of io.matchAll(/ON CONFLICT([^\n]*)/g)) {
        assert.match(m[1].trim(), /^DO NOTHING/, `ON CONFLICT con inferencia: ${m[0]}`);
    }
});

test('⚠️ el selector abre en la carpeta y DEJA volver a la Biblioteca completa', () => {
    const picker = leer('src/components/admin/content-studio/MediaPicker.tsx');
    assert.match(picker, /initialFolderId\?: string \| null;/);
    assert.match(picker, /useState<string \| null>\(initialFolderId\)/);
    // El chip «TODAS» sigue estando: la carpeta es el punto de partida, no una
    // jaula (requisito 15).
    // Se busca el BOTÓN, no la palabra: «TODAS» aparece además en el
    // comentario de la prop y en el aviso de la carpeta, y contra la primera
    // aparición esta comprobación pasaría por el motivo equivocado.
    const boton = picker.indexOf('>\n                            TODAS\n');
    assert.ok(boton > 0, 'el chip «TODAS» desapareció');
    assert.match(picker.slice(Math.max(0, boton - 700), boton), /setCurrentFolder\(null\)/, 'el chip «TODAS» ya no vuelve a la Biblioteca completa');
});

test('⚠️ subir desde el selector usa `uploadMediaFiles`, el camino de siempre', () => {
    const picker = leer('src/components/admin/content-studio/MediaPicker.tsx');
    assert.match(picker, /import \{ uploadMediaFiles/, 'sin esto son tres pasos escritos otra vez');
    // Ni un `presigned-url` a mano: un segundo camino de subida se separa del
    // primero en silencio (v4.784).
    assert.ok(!/fetch\([^)]*presigned-url/.test(picker), 'el selector prefirma por su cuenta');
    // Y lo subido cae en la carpeta que se está mirando, nunca en la raíz.
    assert.match(picker, /const destino = currentFolder \|\| uploadFolderId \|\| null;/);
});

test('⚠️ Noticias abre el selector en la carpeta de la solicitud', () => {
    const news = leer('src/pages/admin/News.tsx');
    assert.match(news, /initialFolderId=\{editingPost\?\.submissionOrigin\?\.mediaFolderId \|\| null\}/);
    assert.match(news, /uploadFolderId=\{editingPost\?\.submissionOrigin\?\.mediaFolderId \|\| null\}/);
    assert.match(news, /mediaFolderId\?: string \| null;/);
    // Y el origen la trae del servidor, no la deduce.
    const eng = leer('server/lib/submissionArticleEngine.js');
    assert.match(eng, /mediaFolderId: r\.mediaFolderId \|\| null,/);
});

test('⚠️ «Abrir la carpeta» lleva de verdad a esa carpeta', () => {
    const lib = leer('src/pages/admin/MediaLibrary.tsx');
    assert.match(lib, /useState<string \| null>\(searchParams\.get\('folder'\) \|\| null\)/);
    for (const f of [
        'src/components/admin/contribution/ArticleMediaPicker.tsx',
        'src/components/admin/contribution/SubmissionDetail.tsx',
    ]) {
        assert.match(leer(f), /\/admin\/media\?folder=\$\{encodeURIComponent\(/, `${f} no enlaza la carpeta`);
    }
});

test('⚠️ «Usado en»: de la carpeta se llega a la solicitud y al artículo', () => {
    const io = leer('server/lib/submissionMediaFolder.js');
    assert.match(io, /export async function folderUsage/);
    assert.match(io, /"articleId"/);
    const rutas = leer('server/routes/media.js');
    assert.match(rutas, /const usage = await folderUsage\(/);
    // En UNA consulta agregada, nunca una por carpeta.
    const cuerpo = io.slice(io.indexOf('export async function folderUsage'));
    assert.equal([...cuerpo.matchAll(/await db\.query\(/g)].length, 1);
});

test('⚠️ la vía del artículo y la de la bandeja son la MISMA función', () => {
    for (const f of [
        'server/controllers/contentSubmissionController.js',
        'server/controllers/submissionArticleController.js',
    ]) {
        assert.match(leer(f), /await syncSubmissionLibrary\(/, `${f} no pasa por el camino único`);
    }
});

test('⚠️ nada de esto escribe en la base durante un despliegue', () => {
    // La carpeta de una solicitud vieja se crea AL SINCRONIZAR, no en el
    // arranque: un despliegue no escribe (regla durable del 2026-07-13).
    const ensure = leer('server/lib/ensureMediaFolderSchema.js');
    assert.ok(!/INSERT INTO "MediaFolder"/.test(ensure), 'el ensure siembra carpetas');
    assert.ok(!/UPDATE "ContributionSubmission"/.test(ensure));
    const build = JSON.parse(leer('package.json')).scripts.build || '';
    assert.ok(!/db push/.test(build), 'el build volvió a ejecutar db push');
});
