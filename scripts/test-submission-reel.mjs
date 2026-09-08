// ════════════════════════════════════════════════════════════════════════════
// Solicitud de contenido → Reel IA — v4.1010
//
// Prueba el CRITERIO (puro), la PARIDAD de los dos espejos comparada por
// SALIDAS, y las INVARIANTES que sostienen el módulo leídas de los archivos.
// Sin base, sin credenciales y sin red.
//
// ⚠️ LAS INVARIANTES DE ARCHIVO SON LA MITAD QUE IMPORTA. Lo que este módulo
// promete —«no hay un segundo motor de Reels»— es una propiedad del CABLEADO,
// no del criterio: el criterio puede quedar intacto mientras alguien escribe
// un `fetch` de creación dentro de la ficha, y ese fallo es MUDO (la lección de
// v4.889/v4.890). Se mira el código.
//
// Verificadas a la inversa: quitando la validación de alcance de `createReel`,
// la columna del atajo del ensure, o mandando la ficha a la pestaña equivocada,
// fallan.
// ════════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '..');
const leer = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');

/** El archivo SIN comentarios: los de este repo explican POR QUÉ no se hace
 *  algo, así que una comprobación textual encuentra en la explicación justo lo
 *  que vino a prohibir (v4.1005). */
const codigo = (p) => leer(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*(\/\/|--)/.test(l)).join('\n');

let ok = 0, fail = 0;
const check = (nombre, cond, extra = '') => {
    if (cond) { ok++; }
    else { fail++; console.log(`  ✗ ${nombre}${extra ? ' — ' + extra : ''}`); }
};
const eq = (nombre, a, b) => check(nombre, JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

const S = await import('../server/lib/submissionReel.js');

// Fotos de prueba: `lib` = ya promovida a la Biblioteca (URL pública).
const fotos = (n, lib = true) => Array.from({ length: n }, (_, i) => ({
    id: `f${i}`, kind: 'image', url: `https://cdn/${i}.jpg`,
    mediaId: lib ? `m${i}` : null, inLibrary: lib,
}));

// ─── El criterio ───────────────────────────────────────────────────────────
console.log('\n· El criterio');

check('sin fotografías no se ofrece', S.reelReadiness([]).ready === false);
eq('y el motivo lo dice', S.reelReadiness([]).reason, 'sin_imagenes');

{
    // El caso REAL de la captura: la solicitud trae ocho archivos y ninguno se
    // aprobó todavía. El motor no puede descargarlos —el prefijo es privado—
    // así que la acción no se ofrece, y el motivo trae la SALIDA.
    const v = S.reelReadiness(fotos(8, false));
    check('material sin aprobar: no se ofrece', v.ready === false);
    eq('con su motivo', v.reason, 'sin_aprobar');
    check('el mensaje dice cuántas hay', /8 fotografías/.test(v.message));
    check('la consecuencia nombra la salida', /Bibliotec/i.test(v.consequence));
}

check('con 3 aprobadas se ofrece', S.reelReadiness(fotos(3)).ready === true);
check('con 2 aprobadas no alcanza', S.reelReadiness(fotos(2)).ready === false);

{
    // Mezcla: 2 aprobadas + 3 privadas. Sólo cuentan las que el motor puede
    // descargar — contar las privadas ofrecería un Reel que falla al generar.
    const mix = [...fotos(2, true), ...fotos(3, false)];
    check('las privadas NO cuentan para el mínimo', S.reelReadiness(mix).ready === false);
    eq('y se dice cuántas sí sirven', S.reelReadiness(mix).usable, 2);
}

check('un VIDEO no es material de escena', S.reelReadiness(
    [...fotos(3), { id: 'v', kind: 'video', url: 'https://cdn/v.mp4', mediaId: 'mv', inLibrary: true }]
).usable === 3);

check('una foto sin URL no se propone', S.reelReadiness(
    [...fotos(2), { id: 'x', kind: 'image', url: '', mediaId: 'mx', inLibrary: true }]
).ready === false);

// ─── El tope del motor ─────────────────────────────────────────────────────
console.log('\n· El tope del motor');

{
    const propuestas = S.reelImagesFor(fotos(9));
    eq('se propone el máximo del motor, no todas', propuestas.length, S.REEL_MAX_IMAGES);
    check('y en el ORDEN de la solicitud', propuestas[0].url === 'https://cdn/0.jpg');
    check('con el mediaId, que es lo que la Biblioteca conoce', propuestas[0].mediaId === 'm0');
}

{
    // Los topes son los del MOTOR, importados. Con un segundo par de números,
    // el botón ofrecería un Reel que `createReel` rechaza.
    const presets = await import('../server/lib/reelPresets.js');
    eq('el mínimo es el del motor', S.REEL_MIN_IMAGES, presets.MIN_SCENE_COUNT);
    eq('el máximo es el del motor', S.REEL_MAX_IMAGES, presets.MAX_SCENE_COUNT);
}

// ─── El contexto que viaja ─────────────────────────────────────────────────
console.log('\n· El contexto');

{
    const ctx = S.reelContextOf(
        { id: 's1', title: 'Unidos por Colombia', story: 'Se entregaron 500 mercados.', club: 'Bogotá Usaquén' },
        fotos(4),
        [{ clubName: 'Rotaract Bogotá Usaquén' }, { clubName: 'Rotary Bogotá' }]
    );
    eq('el título no se vuelve a pedir', ctx.title, 'Unidos por Colombia');
    eq('la organización es el club de la ACTIVIDAD, no el del remitente',
        ctx.organizationName, 'Rotaract Bogotá Usaquén');
    eq('los participantes viajan enteros', ctx.participatingClubs.length, 2);
    eq('las fotos vienen resueltas', ctx.images.length, 4);
}

{
    // Sin relato NO se rellena con nada: un hueco en silencio es una invitación
    // a que el modelo lo complete (la lección de la Campaña de Emergencia).
    const ctx = S.reelContextOf({ id: 's2' }, fotos(3), []);
    eq('lo que no se sabe queda en null', ctx.story, null);
    eq('y el título también', ctx.title, null);
}

// ─── NO HAY UN SEGUNDO MOTOR ───────────────────────────────────────────────
console.log('\n· No hay un segundo motor');

{
    const ficha = codigo('src/components/admin/contribution/SubmissionDetail.tsx');
    check('la ficha NO crea reels: no hay POST a /reels',
        !/fetch\([^)]*content-studio\/reels/.test(ficha));
    check('la ficha NO monta un creador propio',
        !/VideoCreator|reelSpec|canvasExpansion/.test(ficha));
    check('la acción NAVEGA al Estudio', /content-studio\?\$\{qs\}/.test(ficha));
    check('y va con la marca del reel', /reel:\s*'1'/.test(ficha));
    check('el botón está junto a las acciones principales, no en un submenú',
        /GENERAR REEL IA/.test(ficha) && ficha.indexOf('GENERAR REEL IA') > ficha.indexOf('PROMOCIONAR EN REDES'));
    check('sólo se pinta cuando puede llevar a alguna parte (v4.650)',
        /reelListo\?\.ready\s*&&/.test(ficha));
}

// ─── La pestaña correcta ───────────────────────────────────────────────────
console.log('\n· La pestaña correcta');

{
    const ficha = codigo('src/components/admin/contribution/SubmissionDetail.tsx');
    const estudio = codigo('src/pages/admin/ContentStudio.tsx');
    // `create` es el Creador de Video y `post` el Generador de Publicaciones.
    // Hasta v4.1009 «Promocionar» mandaba a `create`: aterrizaba en el creador
    // de Reels —vacío— mientras su prefill esperaba en la otra pestaña.
    const promo = ficha.slice(ficha.indexOf('const promocionar'), ficha.indexOf('const generarReel'));
    check('«Promocionar» va al Generador de Publicaciones', /tab:\s*'post'/.test(promo));
    check('y NO al Creador de Video', !/tab:\s*'create'/.test(promo));
    const reel = ficha.slice(ficha.indexOf('const generarReel'));
    check('«Generar Reel IA» va al Creador de Video', /tab:\s*'create'/.test(reel.slice(0, 600)));
    check('el Estudio distingue las dos puertas', /quiereReel/.test(estudio));
    check('y sin la marca sigue rellenando el post, como antes',
        /if \(!quiereReel\)/.test(estudio));
}

// ─── La atribución se COMPRUEBA ────────────────────────────────────────────
console.log('\n· La atribución');

{
    const ctrl = codigo('server/controllers/reelController.js');
    check('createReel acepta submissionId', /submissionId:\s*submissionInput/.test(ctrl));
    check('y lo contrasta contra el ALCANCE del servidor',
        /campaignIdsInScope\(req\)/.test(ctrl));
    check('el aislamiento va en el WHERE',
        /campaignId"\s*=\s*ANY\(\$2::text\[\]\)/.test(ctrl));
    check('una solicitud fuera de alcance NO tumba el Reel: se anota',
        /no está al alcance[\s\S]{0,80}sin atribuir/.test(ctrl));
    check('se persiste en su columna', /"submissionId", "createdAt", "updatedAt"/.test(ctrl));
}

{
    const store = codigo('server/lib/submissionReelStore.js');
    check('la lectura NUNCA lanza', /catch\s*\{\s*return \{\};\s*\}/.test(store));
    check('y es por LOTE, no una consulta por fila',
        /submissionId"\s*=\s*ANY\(\$1::text\[\]\)/.test(store));
    check('`working` se DERIVA del estado, no se guarda',
        /working:\s*!TERMINALES\.has/.test(store));
}

// ─── El atajo del ensure (trampa de v4.908) ────────────────────────────────
console.log('\n· El atajo del ensure');

{
    const ensure = leer('server/lib/ensureReelSchema.js');
    const alters = [...ensure.matchAll(/ALTER TABLE "(\w+)" ADD COLUMN IF NOT EXISTS "?(\w+)"?/g)]
        .map(m => `${m[1]}.${m[2]}`);
    const atajo = [...ensure.matchAll(/\['(\w+)', '(\w+)'\]/g)].map(m => `${m[1]}.${m[2]}`);
    const faltan = alters.filter(a => !atajo.includes(a));
    check('TODO ADD COLUMN está enumerado en el atajo', faltan.length === 0, faltan.join(', '));
    check('submissionId entre ellas', atajo.includes('ReelProject.submissionId'));
    check('con su índice parcial', /ReelProject_submissionId_idx/.test(ensure));
}

// ─── El espejo del navegador ───────────────────────────────────────────────
console.log('\n· El espejo, comparado por SALIDAS');

let esbuild = null;
try { esbuild = (await import('esbuild')).default ?? await import('esbuild'); } catch { /* opcional */ }
if (!esbuild) {
    console.log('  … se salta: falta esbuild (npm i --no-save esbuild)');
} else {
    const out = esbuild.buildSync({
        entryPoints: ['src/lib/submissionReel.ts'],
        bundle: true, write: false, format: 'esm', platform: 'neutral',
    });
    const M = await import(`data:text/javascript,${encodeURIComponent(out.outputFiles[0].text)}`);

    eq('el mínimo coincide', M.REEL_MIN_IMAGES, S.REEL_MIN_IMAGES);
    eq('el máximo coincide', M.REEL_MAX_IMAGES, S.REEL_MAX_IMAGES);

    // Por SALIDAS sobre una matriz de casos, no por claves: es lo que sostiene
    // que el botón y el servidor digan lo mismo de la misma solicitud.
    const casos = [
        [], fotos(1), fotos(2), fotos(3), fotos(5), fotos(9),
        fotos(3, false), fotos(8, false),
        [...fotos(2), ...fotos(3, false)],
        [...fotos(3), { id: 'v', kind: 'video', url: 'https://cdn/v.mp4', mediaId: 'mv', inLibrary: true }],
        [{ id: 'x', kind: 'image', url: '', mediaId: 'mx', inLibrary: true }],
    ];
    check('reelReadiness da lo mismo en los dos, caso por caso',
        casos.every(c => JSON.stringify(M.reelReadiness(c)) === JSON.stringify(S.reelReadiness(c))));
    check('reelImagesFor da lo mismo en los dos, caso por caso',
        casos.every(c => JSON.stringify(M.reelImagesFor(c)) === JSON.stringify(S.reelImagesFor(c))));

    // El espejo es MÍNIMO: lo que arma el contexto vive sólo en el servidor.
    check('el espejo NO trae reelContextOf', M.reelContextOf === undefined);
}

console.log(`\n${fail ? '✗' : '✓'} ${ok} comprobaciones, ${fail} fallos\n`);
process.exit(fail ? 1 : 0);
