#!/usr/bin/env node
/**
 * Recorte de videos de la Biblioteca Multimedia (v4.934)
 * ======================================================
 *
 * Ejercita el CRITERIO de `server/lib/videoTrim.js` —qué rango vale, qué
 * contenedor se recorta, con qué argumentos, qué resultado se acepta y cómo
 * queda la auditoría— separado de S3, de ffmpeg y de la base, por el motivo
 * de siempre: lo que sólo se prueba contra un bucket y un binario reales
 * termina sin pruebas.
 *
 * Además comprueba, LEYENDO LOS ARCHIVOS, lo que ninguna prueba pura ve:
 * que las rutas existan, que el borrado se lleve la copia de seguridad, que
 * el atajo del ensure enumere la columna nueva (la trampa de v4.908) y que
 * la pantalla mande el rango al servidor.
 *
 *   npm run test:video-trim
 */

import {
    MIN_RESULT_SEC, CUT_EPSILON_SEC, COPY_TOLERANCE_SEC, REENCODE_TOLERANCE_SEC,
    TRIM_LOG_MAX,
    trimSupport, contentTypeFor, parseTimecode, formatTimecode,
    validateTrimRange, planTrim, buildTrimArgs, validateTrimmedFile,
    backupKeyFor, appliedTrim, restoredTrim,
} from '../server/lib/videoTrim.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  OK    ${name}`); }
    else { fail++; console.log(`  FALLA ${name}${extra ? ` — ${extra}` : ''}`); }
};

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ Tiempos: leer y escribir');

check('«02:47» son 167 s', parseTimecode('02:47') === 167);
check('«1:02:03» son 3723 s', parseTimecode('1:02:03') === 3723);
check('«95» son 95 s (segundos sueltos)', parseTimecode('95') === 95);
check('decimales en el último tramo', parseTimecode('00:10.5') === 10.5 && parseTimecode('0:10,5') === 10.5);
// null y no 0: 0 es un tiempo válido y confundirlos movería el corte al
// principio sin que nadie lo pidiera.
check('lo ilegible da null, no 0',
    parseTimecode('') === null && parseTimecode('abc') === null
    && parseTimecode('1:99') === null && parseTimecode('-3') === null);
check('«0» es un tiempo válido', parseTimecode('0') === 0);
check('formatTimecode: 167 → 02:47', formatTimecode(167) === '02:47');
check('formatTimecode pasada la hora', formatTimecode(3723) === '1:02:03');
check('ida y vuelta', parseTimecode(formatTimecode(199)) === 199);

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ Qué contenedor se puede recortar');

check('mp4: corte limpio + recodificación + validable',
    (() => { const s = trimSupport('video.mp4'); return s.ok && s.reencodable && s.probeable && s.format === 'mp4'; })());
check('m4v cuenta como mp4', trimSupport('clip.M4V').ok && trimSupport('clip.M4V').format === 'mp4');
check('mov: familia QuickTime, validable',
    (() => { const s = trimSupport('toma.mov'); return s.ok && s.reencodable && s.probeable && s.format === 'mov'; })());
// WebM: sólo corte limpio, y su validación más débil se DECLARA, no se finge.
check('webm: sin recodificar y sin probe',
    (() => { const s = trimSupport('clip.webm'); return s.ok && !s.reencodable && !s.probeable; })());
check('otro formato se rechaza con motivo',
    (() => { const s = trimSupport('pelicula.avi'); return !s.ok && /MP4, MOV y WebM/.test(s.reason); })());
check('Content-Type por extensión',
    contentTypeFor('a.mp4') === 'video/mp4'
    && contentTypeFor('a.mov') === 'video/quicktime'
    && contentTypeFor('a.webm') === 'video/webm');

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ El rango que se conserva');

// El caso del pedido: video de 03:20 (200 s), conservar 00:00 → 02:47.
const caso = validateTrimRange({ startSec: 0, endSec: 167, durationSec: 200 });
check('el caso real del pedido pasa (00:00→02:47 de 03:20)',
    caso.ok && caso.startSec === 0 && caso.endSec === 167);

check('sin duración no se decide',
    !validateTrimRange({ startSec: 0, endSec: 10 }).ok);
check('inicio negativo se rechaza',
    !validateTrimRange({ startSec: -1, endSec: 10, durationSec: 20 }).ok);
check('final antes del inicio se rechaza',
    !validateTrimRange({ startSec: 10, endSec: 5, durationSec: 20 }).ok);
check('final más allá del video se rechaza y lo dice con tiempos',
    (() => { const r = validateTrimRange({ startSec: 0, endSec: 300, durationSec: 200 }); return !r.ok && /03:20/.test(r.error); })());
// Los metadatos redondean: «el final es la duración declarada» no es un error
// de la persona — se ACOTA en vez de rechazarse.
check('un final apenas pasado se acota a la duración',
    (() => { const r = validateTrimRange({ startSec: 5, endSec: 200.3, durationSec: 199.96 }); return r.ok && r.endSec === 199.96; })());
check(`resultado menor a ${MIN_RESULT_SEC}s se rechaza`,
    !validateTrimRange({ startSec: 10, endSec: 10.5, durationSec: 20 }).ok);
// Sin este rechazo, «Aplicar» sin tocar los controles procesaría el archivo
// entero para dejarlo igual.
check('el video completo no es un recorte',
    !validateTrimRange({ startSec: 0, endSec: 200, durationSec: 200 }).ok);
check('recortar sólo el inicio también vale',
    validateTrimRange({ startSec: 30, endSec: 200, durationSec: 200 }).ok);

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ El plan: corte limpio primero, recodificación de respaldo');

const mp4 = trimSupport('v.mp4');
check('inicio 0 → copy primero, reencode de respaldo',
    JSON.stringify(planTrim({ startSec: 0, support: mp4 }).attempts) === '["copy","reencode"]');
// Con copy, el corte de entrada salta al keyframe anterior: el video
// arrancaría donde no se pidió.
check('inicio > 0 → sólo reencode',
    JSON.stringify(planTrim({ startSec: 12, support: mp4 }).attempts) === '["reencode"]');
const webm = trimSupport('v.webm');
check('webm con inicio 0 → sólo copy',
    JSON.stringify(planTrim({ startSec: 0, support: webm }).attempts) === '["copy"]');
check('webm con inicio > 0 → ningún intento, con motivo',
    (() => { const p = planTrim({ startSec: 5, support: webm }); return !p.attempts.length && /WebM/.test(p.reason); })());
check('formato no soportado → ningún intento',
    !planTrim({ startSec: 0, support: trimSupport('x.avi') }).attempts.length);

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ Los argumentos de ffmpeg');

const copyArgs = buildTrimArgs({ mode: 'copy', format: 'mp4', input: 'in.mp4', output: 'out.mp4', startSec: 0, endSec: 167 });
check('copy: -c copy, sin recomprimir',
    copyArgs.join(' ').includes('-c copy') && !copyArgs.includes('libx264'));
check('copy: corta con -t en el punto pedido', copyArgs[copyArgs.indexOf('-t') + 1] === '167');
// faststart es lo que hace que un enlace compartido arranque sin descargarse
// entero.
check('copy mp4 lleva +faststart', copyArgs.join(' ').includes('-movflags +faststart'));

const reArgs = buildTrimArgs({ mode: 'reencode', format: 'mp4', input: 'in.mp4', output: 'out.mp4', startSec: 33, endSec: 167 });
check('reencode: -ss ANTES de -i (corte exacto)',
    reArgs.indexOf('-ss') !== -1 && reArgs.indexOf('-ss') < reArgs.indexOf('-i'));
check('reencode: duración = final − inicio', reArgs[reArgs.indexOf('-t') + 1] === '134');
check('reencode: H.264 + AAC + yuv420p (navegadores y móviles)',
    reArgs.includes('libx264') && reArgs.includes('aac') && reArgs.includes('yuv420p'));
// Sin filtros de escala: la resolución, la orientación y el fps quedan los
// del original.
check('reencode no escala ni filtra', !reArgs.includes('-vf') && !reArgs.includes('-filter_complex'));

const webmArgs = buildTrimArgs({ mode: 'copy', format: 'webm', input: 'i', output: 'o', startSec: 0, endSec: 10 });
check('webm no lleva movflags (es de MP4)', !webmArgs.includes('-movflags'));
check('ningún argumento pasa por shell (son arrays)', Array.isArray(copyArgs) && Array.isArray(reArgs));

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ La puerta: qué resultado reemplaza al original');

const goodProbe = { hasMoov: true, truncated: false, videoCodec: 'avc1', durationSec: 167.02, parseError: null };
check('un resultado sano pasa',
    validateTrimmedFile({ probe: goodProbe, expectedSec: 167, mode: 'reencode', probeable: true, sizeBytes: 1000 }).ok);
check('un archivo vacío no pasa nunca',
    !validateTrimmedFile({ probe: goodProbe, expectedSec: 167, mode: 'reencode', probeable: true, sizeBytes: 0 }).ok);
check('sin cabecera moov no pasa',
    !validateTrimmedFile({ probe: { ...goodProbe, hasMoov: false }, expectedSec: 167, mode: 'reencode', probeable: true, sizeBytes: 9 }).ok);
check('truncado no pasa',
    !validateTrimmedFile({ probe: { ...goodProbe, truncated: true }, expectedSec: 167, mode: 'reencode', probeable: true, sizeBytes: 9 }).ok);
check('sin pista de video no pasa',
    !validateTrimmedFile({ probe: { ...goodProbe, videoCodec: null }, expectedSec: 167, mode: 'reencode', probeable: true, sizeBytes: 9 }).ok);
// El copy corta en el límite de paquete anterior: hasta un GOP de tolerancia.
// El reencode corta exacto: tolerancia estricta. Validar cada uno con la del
// otro rechazaría cortes buenos o dejaría pasar cortes errados.
check('la tolerancia del copy es más ancha que la del reencode',
    COPY_TOLERANCE_SEC > REENCODE_TOLERANCE_SEC);
check('reencode 2s corrido no pasa; copy 2s corrido sí',
    !validateTrimmedFile({ probe: { ...goodProbe, durationSec: 165 }, expectedSec: 167, mode: 'reencode', probeable: true, sizeBytes: 9 }).ok
    && validateTrimmedFile({ probe: { ...goodProbe, durationSec: 165 }, expectedSec: 167, mode: 'copy', probeable: true, sizeBytes: 9 }).ok);
check('duración fuera de tolerancia lo dice con los dos tiempos',
    (() => { const v = validateTrimmedFile({ probe: { ...goodProbe, durationSec: 100 }, expectedSec: 167, mode: 'copy', probeable: true, sizeBytes: 9 }); return !v.ok && /01:40/.test(v.reason) && /02:47/.test(v.reason); })());
// La validación débil (WebM) se DECLARA, no se finge una que no ocurrió.
check('no-probeable pasa por tamaño y queda marcado weak',
    (() => { const v = validateTrimmedFile({ probe: null, expectedSec: 10, mode: 'copy', probeable: false, sizeBytes: 9 }); return v.ok && v.weak; })());

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ La copia de seguridad y la auditoría');

check('la copia vive en la carpeta hermana pretrim/, con su extensión',
    backupKeyFor('clubs/x/videos/123-clip.mp4') === 'clubs/x/videos/pretrim/123-clip.mp4');
check('clave vacía → null', backupKeyFor('') === null);

const t1 = appliedTrim(null, {
    by: 'admin@feria.org', at: '2026-08-26T10:00:00Z', startSec: 0, endSec: 167, mode: 'copy',
    prevDurationSec: 200, newDurationSec: 167, prevSize: 9_000_000, newSize: 7_500_000,
    backupKey: 'clubs/x/videos/pretrim/123-clip.mp4',
});
check('el recorte guarda quién, cuándo, rango, duraciones y tamaños',
    t1.current.by === 'admin@feria.org' && t1.current.startSec === 0 && t1.current.endSec === 167
    && t1.current.prevDurationSec === 200 && t1.current.newDurationSec === 167
    && t1.current.prevSize === 9_000_000 && t1.current.newSize === 7_500_000
    && t1.log.length === 1 && t1.log[0].action === 'trim');

// Un segundo recorte REEMPLAZA current (la copia ahora es la versión previa a
// ESTE corte) y AGREGA al log — la auditoría nunca se edita.
const t2 = appliedTrim(t1, {
    by: 'otra@persona.org', at: '2026-08-27T10:00:00Z', startSec: 0, endSec: 100, mode: 'copy',
    prevDurationSec: 167, newDurationSec: 100, prevSize: 7_500_000, newSize: 5_000_000,
    backupKey: 'clubs/x/videos/pretrim/123-clip.mp4',
});
check('un segundo recorte reemplaza current y conserva el log',
    t2.current.prevDurationSec === 167 && t2.log.length === 2 && t2.log[0].action === 'trim');

const r1 = restoredTrim(t2, { by: 'admin@feria.org', at: '2026-08-28T10:00:00Z' });
check('restaurar deja current en null y queda en el log',
    r1.current === null && r1.log.length === 3 && r1.log[2].action === 'restore'
    && r1.log[2].restoredDurationSec === 167);

const many = Array.from({ length: 30 }).reduce((acc) => appliedTrim(acc, { by: 'x', at: 'y', startSec: 0, endSec: 5, mode: 'copy' }), null);
check(`el log no crece sin tope (máx ${TRIM_LOG_MAX})`, many.log.length === TRIM_LOG_MAX);

check('el umbral de «no recorta nada» es chico y compartido',
    CUT_EPSILON_SEC > 0 && CUT_EPSILON_SEC < 0.5);

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ El camino, leyendo los archivos (lo que la prueba pura no ve)');

const mediaRoutes = readFileSync(path.join(root, 'server/routes/media.js'), 'utf8');
check('la ruta POST /:id/trim existe', mediaRoutes.includes(`router.post('/:id/trim'`));
check('la ruta POST /:id/restore-trim existe', mediaRoutes.includes(`router.post('/:id/restore-trim'`));
check('el recorte importa el criterio, no lo reescribe',
    mediaRoutes.includes(`from '../lib/videoTrim.js'`));
// La sobrescritura tiene que ir a la MISMA clave: es lo que conserva la URL.
check('el reemplazo sube a item.s3Key (misma clave ⇒ misma URL)',
    /PutObjectCommand\(\{\s*\n?\s*Bucket: item\.bucket, Key: item\.s3Key,\s*\n?\s*Body: trimmed,/.test(mediaRoutes));
// La copia va ANTES del reemplazo — si copiar falla, no se reemplaza nada.
// Ojo con la búsqueda: «Body: trimmed» a secas casa con el `trimmedBuffer`
// del upload de logos, que vive mucho antes en el archivo.
check('la copia de seguridad se hace antes del reemplazo',
    (() => {
        const copyAt = mediaRoutes.indexOf('Key: backupKey');
        const putAt = mediaRoutes.indexOf('Body: trimmed,');
        return copyAt !== -1 && putAt !== -1 && copyAt < putAt;
    })());
// El borrado se lleva también la copia pretrim, en los DOS caminos: dejarla
// sería un objeto que nadie puede ver ni volver a borrar desde el panel.
check('el borrado individual limpia la copia pretrim',
    mediaRoutes.includes('media.rows[0].trim?.current?.backupKey].filter(Boolean)'));
check('el borrado en bloque limpia la copia pretrim',
    mediaRoutes.includes('m.trim?.current?.backupKey].filter(Boolean)'));

// La trampa de v4.908: una columna con su ADD COLUMN pero fuera del atajo del
// ensure no se crea NUNCA en una base donde todo lo demás ya existía.
const ensure = readFileSync(path.join(root, 'server/lib/ensureMediaFolderSchema.js'), 'utf8');
check('el ensure agrega la columna trim',
    ensure.includes(`ADD COLUMN IF NOT EXISTS "trim" JSONB`));
check('el atajo del ensure ENUMERA la columna trim (trampa v4.908)',
    ensure.includes(`column_name = 'trim'`) && /has_trim/.test(ensure)
    && /rows\[0\]\?\.has_trim/.test(ensure));

const schema = readFileSync(path.join(root, 'server/prisma/schema.prisma'), 'utf8');
check('schema.prisma declara Media.trim (regla de folderId: el guardián compara tablas)',
    /model Media \{[\s\S]*?trim Json\?/.test(schema));

const reelFfmpeg = readFileSync(path.join(root, 'server/lib/reelFfmpeg.js'), 'utf8');
check('el runner de ffmpeg se REUTILIZA (runFfmpeg y withTempDir exportados)',
    reelFfmpeg.includes('export const runFfmpeg') && reelFfmpeg.includes('export const withTempDir'));
check('la ruta no escribe un segundo spawn de ffmpeg',
    !/spawn\(/.test(mediaRoutes));

const screen = readFileSync(path.join(root, 'src/pages/admin/MediaLibrary.tsx'), 'utf8');
check('la pantalla ofrece «Recortar video» y «Restaurar versión original»',
    screen.includes('Recortar video') && screen.includes('Restaurar versión original'));
check('la pantalla manda startSec, endSec y durationSec al servidor',
    screen.includes('startSec: start, endSec: end, durationSec: duration'));
check('la pantalla dice que el enlace se conserva',
    screen.includes('El enlace original se conserva'));
// La URL guardada no se toca: el bust es sólo para la VISTA PREVIA.
check('el bust de caché es de la vista previa, no de la URL copiable',
    screen.includes('videoPreviewSrc') && screen.includes('value={selectedItem.url}'));

// ───────────────────────────────────────────────────────────────────────────
console.log(`\n${pass} OK, ${fail} FALLA(s)\n`);
process.exit(fail ? 1 : 0);
