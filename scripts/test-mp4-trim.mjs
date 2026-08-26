#!/usr/bin/env node
/**
 * Cirugía de MP4: recortar el final sin mover los bytes del video (v4.936)
 * ========================================================================
 *
 * Ejercita `planMp4EndTrim` de punta a punta contra MP4s REALES generados con
 * el propio ffmpeg empaquetado — con la cabecera al frente (faststart) y al
 * final (el layout por defecto)—: se planifica el corte leyendo por rangos,
 * se ensambla el archivo nuevo concatenando los segmentos (que es exactamente
 * lo que hace S3 con UploadPartCopy) y el resultado se valida DOS veces: con
 * `probeMp4` (contenedor) y DECODIFICÁNDOLO entero con ffmpeg (que es lo que
 * hace un reproductor). Si ffmpeg no está disponible, se salta con aviso.
 *
 *   npm run test:mp4-trim
 */

import { planMp4EndTrim, readTopBoxes } from '../server/lib/mp4Trim.js';
import { probeMp4 } from '../server/lib/outroQuality.js';
import { validateTrimmedFile } from '../server/lib/videoTrim.js';
import { runFfmpeg, withTempDir, isFfmpegAvailable } from '../server/lib/reelFfmpeg.js';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  OK    ${name}`); }
    else { fail++; console.log(`  FALLA ${name}${extra ? ` — ${extra}` : ''}`); }
};

if (!(await isFfmpegAvailable())) {
    console.log('\n⚠ ffmpeg-static no está instalado: esta batería necesita MP4s reales. Se salta.');
    process.exit(0);
}

const readRangeOf = (buf) => async (a, b) => buf.subarray(a, b);
const assemble = (plan, srcBuf) => Buffer.concat(
    plan.segments.map(s => (s.bytes ? s.bytes : srcBuf.subarray(s.copy[0], s.copy[1])))
);
const ffDuration = (stderr) => {
    const m = /Duration:\s*(\d+):(\d\d):(\d\d(?:\.\d+)?)/.exec(stderr || '');
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
};

await withTempDir(async (dir) => {
    // Un video real de 60 s con imagen y audio.
    const make = async (name, extraFlags = []) => {
        const p = path.join(dir, name);
        await runFfmpeg(['-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=60',
            '-f', 'lavfi', '-i', 'sine=frequency=440:duration=60',
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
            ...extraFlags, '-f', 'mp4', p],
            { timeoutMs: 120_000, label: `generar ${name}` });
        return readFile(p);
    };

    for (const [label, flags] of [
        ['moov al FINAL (layout por defecto)', []],
        ['moov al FRENTE (faststart)', ['-movflags', '+faststart']],
    ]) {
        console.log(`\n▸ ${label}`);
        const src = await make(`src-${flags.length ? 'front' : 'end'}.mp4`, flags);
        const srcProbe = probeMp4(src);
        check('el original mide ~60 s', Math.abs(srcProbe.durationSec - 60) < 1.5);

        const plan = await planMp4EndTrim({ readRange: readRangeOf(src), fileSize: src.length, endSec: 40 });
        check('el plan sale', plan.ok, plan.reason);
        if (!plan.ok) continue;

        // La forma del plan ES la arquitectura: bytes chicos reescritos acá y
        // UN rango grande del original que S3 copia de su lado.
        const copySeg = plan.segments.find(s => s.copy);
        check('hay un único rango de copia y es la mayor parte del archivo',
            plan.segments.filter(s => s.copy).length === 1
            && (copySeg.copy[1] - copySeg.copy[0]) > src.length * 0.5);
        const bytesLen = plan.segments.filter(s => s.bytes).reduce((a, s) => a + s.bytes.length, 0);
        check('lo que pasa por la función son sólo cabeceras (<10% del archivo)',
            bytesLen < src.length * 0.1, `${bytesLen} de ${src.length}`);

        const out = assemble(plan, src);
        check('el tamaño ensamblado es EXACTAMENTE el declarado', out.length === plan.newSize);
        check('el resultado es más chico que el original', out.length < src.length);

        // Validación 1: el contenedor, con la misma puerta del recorte ffmpeg.
        const probe = probeMp4(out);
        const verdict = validateTrimmedFile({ probe, expectedSec: 40, mode: 'copy', probeable: true, sizeBytes: out.length });
        check('probeMp4 lo da por sano y con la duración pedida', verdict.ok, verdict.reason || probe.parseError);
        check('conserva video y audio', Boolean(probe.videoCodec) && probe.hasAudio);
        check('la duración declarada es ~40 s', Math.abs(probe.durationSec - 40) < 0.5, String(probe.durationSec));
        check('el plan declara la misma duración', Math.abs(plan.newDurationSec - probe.durationSec) < 0.5);

        // Validación 2: DECODIFICARLO ENTERO, que es lo que hace un reproductor.
        const outFile = path.join(dir, `out-${flags.length ? 'front' : 'end'}.mp4`);
        await writeFile(outFile, out);
        let decoded = true, stderr = '';
        try { ({ stderr } = await runFfmpeg(['-i', outFile, '-f', 'null', '-'], { timeoutMs: 120_000, label: 'decodificar resultado' })); }
        catch (e) { decoded = false; stderr = e.message; }
        check('ffmpeg decodifica el resultado ENTERO sin error', decoded, stderr.slice(0, 200));
        const dur = ffDuration(stderr);
        check('ffmpeg reporta ~40 s', dur !== null && Math.abs(dur - 40) < 0.5, String(dur));
        check('el layout del plan coincide con el archivo', plan.moovAtFront === flags.includes('+faststart'));
    }

    // ── Lo que se NIEGA, se niega con motivo ─────────────────────────────
    console.log('\n▸ Los bails');

    const frag = await make('frag.mp4', ['-movflags', 'empty_moov+frag_keyframe']);
    const fragPlan = await planMp4EndTrim({ readRange: readRangeOf(frag), fileSize: frag.length, endSec: 10 });
    check('un MP4 fragmentado se niega con motivo',
        !fragPlan.ok && /fragmentado|mdat/.test(fragPlan.reason), fragPlan.reason);

    const garbage = Buffer.from('esto no es un mp4, es un texto cualquiera de relleno..');
    const gPlan = await planMp4EndTrim({ readRange: readRangeOf(garbage), fileSize: garbage.length, endSec: 5 });
    check('un archivo que no es MP4 se niega', !gPlan.ok);

    const top = await readTopBoxes(readRangeOf(garbage), garbage.length);
    check('readTopBoxes tampoco lo acepta', !top.ok);

    // ── El caso degenerado: cortar más allá del final no inventa nada ────
    const src = await readFile(path.join(dir, 'src-end.mp4'));
    const over = await planMp4EndTrim({ readRange: readRangeOf(src), fileSize: src.length, endSec: 500 });
    check('un corte más allá del final conserva todo sin inventar duración',
        over.ok && Math.abs(over.newDurationSec - 60) < 1.5, over.reason || String(over.newDurationSec));
});

console.log(`\n${pass} OK, ${fail} FALLA(s)\n`);
process.exit(fail ? 1 : 0);
