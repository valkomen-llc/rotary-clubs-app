/**
 * Outro sobre un video de la Biblioteca (v4.1039) — criterio, composición
 * REAL con el ffmpeg empaquetado y cableado leído de los archivos.
 *
 *   npm run test:library:outro
 *
 * Sin base, credenciales ni red. La parte de composición se salta sola si no
 * hay binario de ffmpeg (`ffmpeg-static`).
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
    planLibraryOutro, normalizeTransition, buildLibraryOutroGraph, buildLibraryOutroArgs,
    compositionBudget, validateComposedOutro, versionKeyFor, versionFilenameFor,
    normalizeOutroRequest, compositionView, processingIsStale, transitionOptions,
    MAX_MAIN_SEC, MAX_OUTRO_SEC, DURATION_TOLERANCE_SEC, PROCESSING_STALE_MS, LIBRARY_OUTRO_VERSION
} from '../server/lib/libraryOutro.js';
import { probeMp4 } from '../server/lib/outroQuality.js';
import { OUTRO_TRANSITION_SEC } from '../server/lib/reelOutro.js';

const run = promisify(execFile);
const raiz = path.resolve(import.meta.dirname, '..');
let ok = 0, fail = 0;
const check = (n, c, e = '') => { c ? ok++ : (fail++, console.log(`  ✗ ${n}${e ? ' — ' + e : ''}`)); };
const read = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');
const codigo = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');

const MAIN = { durationSec: 14.02, width: 1080, height: 1920, fps: 30, hasAudio: true };
const OUTRO = { durationSec: 5, width: 1080, height: 1920, fps: 30, hasAudio: true };

console.log('1. Criterio: transición y plan');
{
    const t = normalizeTransition({ transitionType: 'fade', transitionSec: 0.6 });
    check('fade 0.6 → xfade fade', t.type === 'fade' && t.sec === 0.6 && t.ffmpeg === 'fade');
    check('sin tipo → fade por defecto', normalizeTransition({}).type === 'fade' && normalizeTransition({}).sec === OUTRO_TRANSITION_SEC.default);
    check('zoom → cae al fundido (catálogo cerrado)', normalizeTransition({ transitionType: 'zoom' }).type === 'fade');
    check('cut → 0 s sin xfade', normalizeTransition({ transitionType: 'cut', transitionSec: 5 }).sec === 0 && normalizeTransition({ transitionType: 'cut' }).ffmpeg === null);
    check('se acota al rango del catálogo', normalizeTransition({ transitionSec: 9 }).sec === OUTRO_TRANSITION_SEC.max && normalizeTransition({ transitionSec: 0.01 }).sec === OUTRO_TRANSITION_SEC.min);
    check('el catálogo de opciones son las tres transiciones suaves', transitionOptions().map(o => o.id).sort().join() === 'cut,dissolve,fade');

    const p = planLibraryOutro({ main: MAIN, outro: OUTRO, transitionType: 'fade', transitionSec: 0.6 });
    check('plan válido', p.ok && p.problems.length === 0);
    check('duración final = principal + outro − transición', p.finalDurationSec === 18.42, String(p.finalDurationSec));
    check('el outro arranca al final del principal menos la transición', p.outroStartSec === 13.42);
    check('geometría del máster', p.width === 1080 && p.height === 1920 && p.fps === 30);
    check('audio: cruce cuando los dos traen pista', p.audio.mode === 'crossfade' && p.audio.outroAudioUsed === true);
    check('créditos: 0', p.credits === 0);

    const corte = planLibraryOutro({ main: MAIN, outro: OUTRO, transitionType: 'cut' });
    check('con corte la duración es la suma exacta', corte.finalDurationSec === 19.02 && corte.audio.mode === 'concat');

    const soloMain = planLibraryOutro({ main: MAIN, outro: { ...OUTRO, hasAudio: false } });
    check('outro mudo → el principal se desvanece, no se inventa audio', soloMain.audio.mode === 'main_fade_out');
    const soloOutro = planLibraryOutro({ main: { ...MAIN, hasAudio: false }, outro: OUTRO });
    check('principal mudo → el outro entra con fundido', soloOutro.audio.mode === 'outro_fade_in');
    const mudos = planLibraryOutro({ main: { ...MAIN, hasAudio: false }, outro: { ...OUTRO, hasAudio: false } });
    check('los dos mudos → sin pista', mudos.audio.mode === 'none');
    const apagado = planLibraryOutro({ main: MAIN, outro: OUTRO, outroAudio: false });
    check('pedir el outro mudo es expreso y se anota', apagado.audio.mode === 'main_fade_out' && apagado.audio.outroHasAudio === true && apagado.warnings.some(w => /mudo/.test(w)));

    const corto = planLibraryOutro({ main: { ...MAIN, durationSec: 1 }, outro: { ...OUTRO, durationSec: 0.8 }, transitionSec: 1.2 });
    check('la transición no supera la mitad del clip más corto', corto.transition.sec === 0.4 && corto.warnings.some(w => /acotó/.test(w)));

    const largo = planLibraryOutro({ main: { ...MAIN, durationSec: MAX_MAIN_SEC + 1 }, outro: OUTRO });
    check('un principal demasiado largo se rechaza con el motivo', !largo.ok && largo.problems.some(p => /máximo/.test(p)));
    const outroLargo = planLibraryOutro({ main: MAIN, outro: { ...OUTRO, durationSec: MAX_OUTRO_SEC + 1 } });
    check('un outro demasiado largo se rechaza', !outroLargo.ok);
    const sinMedida = planLibraryOutro({ main: { ...MAIN, durationSec: null }, outro: OUTRO });
    check('sin duración medida no hay plan', !sinMedida.ok);

    const apaisado = planLibraryOutro({ main: MAIN, outro: { ...OUTRO, width: 1920, height: 1080 } });
    check('un outro con otra proporción avisa y no bloquea', apaisado.ok && apaisado.warnings.some(w => /proporción/.test(w)));
    check('fps fraccionario se conserva', planLibraryOutro({ main: { ...MAIN, fps: 29.97 }, outro: OUTRO }).fps === 29.97);
}

console.log('2. Criterio: grafo y argumentos');
{
    const p = planLibraryOutro({ main: MAIN, outro: OUTRO, transitionType: 'fade', transitionSec: 0.6 });
    const g = buildLibraryOutroGraph(p);
    check('xfade con el offset = principal − transición', g.filter.includes('xfade=transition=fade:duration=0.6:offset=13.42'));
    check('cada entrada se conforma a la geometría del máster', (g.filter.match(/scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920/g) || []).length === 2);
    check('setsar=1 y yuv420p en las dos entradas', (g.filter.match(/setsar=1,format=yuv420p/g) || []).length === 2);
    check('acrossfade lineal con la misma duración', g.filter.includes('acrossfade=d=0.6:c1=tri:c2=tri'));
    check('cada pista se lleva a la duración de su video', g.filter.includes('apad,atrim=0:14.02') && g.filter.includes('apad,atrim=0:5,'));
    check('la pieza cierra a la duración final', g.filter.includes(`atrim=0:${p.finalDurationSec}`) && g.audioLabel === 'aout');
    check('sin atempo ni -shortest: nada acelera ni recorta', !g.filter.includes('atempo'));

    const args = buildLibraryOutroArgs({ mainPath: 'a.mp4', outroPath: 'b.mp4', outputPath: 'o.mp4', plan: p, graph: g });
    check('args mapean video y audio', args.includes('[vout]') && args.includes('[aout]') && !args.includes('-shortest'));
    check('códec como el compositor de Reels', args.includes('libx264') && args.includes('+faststart') && args.includes('aac'));

    const gCut = buildLibraryOutroGraph(planLibraryOutro({ main: MAIN, outro: OUTRO, transitionType: 'cut' }));
    check('corte → concat de video y audio', gCut.filter.includes('concat=n=2:v=1:a=0') && gCut.filter.includes('concat=n=2:v=0:a=1'));

    const gIn = buildLibraryOutroGraph(planLibraryOutro({ main: { ...MAIN, hasAudio: false }, outro: OUTRO, transitionSec: 0.6 }));
    check('outro_fade_in desplaza y renumera por muestras (v4.1033)', gIn.filter.includes('adelay=13420|13420,asetpts=N/SR/TB') && gIn.filter.includes('afade=t=in:st=0:d=0.6'));
    const gOut = buildLibraryOutroGraph(planLibraryOutro({ main: MAIN, outro: { ...OUTRO, hasAudio: false }, transitionSec: 0.6 }));
    check('main_fade_out desvanece en la transición', gOut.filter.includes('afade=t=out:st=13.42:d=0.6'));
    const gNone = buildLibraryOutroGraph(planLibraryOutro({ main: { ...MAIN, hasAudio: false }, outro: { ...OUTRO, hasAudio: false } }));
    const argsNone = buildLibraryOutroArgs({ mainPath: 'a', outroPath: 'b', outputPath: 'o', plan: planLibraryOutro({ main: { ...MAIN, hasAudio: false }, outro: { ...OUTRO, hasAudio: false } }), graph: gNone });
    check('sin pista → -an', gNone.audioLabel === null && argsNone.includes('-an'));
    let lanzo = false;
    try { buildLibraryOutroGraph({ ok: false }); } catch { lanzo = true; }
    check('un plan inválido no produce grafo', lanzo);
}

console.log('3. Criterio: presupuesto, validación, nombres y DTO');
{
    const b = compositionBudget({ mainBytes: 50e6, outroBytes: 5e6, mainDurationSec: 14, finalDurationSec: 18.4 });
    check('presupuesto normal entra', b.ok && b.needBytes > 55e6);
    const grande = compositionBudget({ mainBytes: 300e6, outroBytes: 50e6, mainDurationSec: 60, finalDurationSec: 65 });
    check('lo que no entra se dice con los números', !grande.ok && /MB/.test(grande.reason));
    check('sin duración se estima con la tasa de respaldo', compositionBudget({ mainBytes: 10e6, outroBytes: 1e6 }).ok);

    const plan = planLibraryOutro({ main: MAIN, outro: OUTRO, transitionSec: 0.6 });
    const bueno = { hasMoov: true, truncated: false, durationSec: 18.5, hasAudio: true, width: 1080, height: 1920, audioDriftSec: 0.05 };
    check('archivo dentro de tolerancia valida', validateComposedOutro({ probe: bueno, plan }).ok);
    check('duración corta = outro cortado → se rechaza', !validateComposedOutro({ probe: { ...bueno, durationSec: 15 }, plan }).ok);
    check('mudo cuando tenía que sonar → se rechaza', !validateComposedOutro({ probe: { ...bueno, hasAudio: false }, plan }).ok);
    check('otra resolución → se rechaza', !validateComposedOutro({ probe: { ...bueno, width: 720, height: 1280 }, plan }).ok);
    check('truncado → se rechaza', !validateComposedOutro({ probe: { ...bueno, truncated: true }, plan }).ok);
    check('sin probe → se rechaza', !validateComposedOutro({ probe: null, plan }).ok);
    check('tolerancia declarada', DURATION_TOLERANCE_SEC === 0.35);

    const key = versionKeyFor('clubs/c1/media/Reel - Entrega de 117 prendas.mp4', 'a1b2c3d4-e5f6-7890');
    check('la versión vive en carpeta hermana con id propio', key === 'clubs/c1/media/outro-versions/Reel_-_Entrega_de_117_prendas-outro-a1b2c3d4e5.mp4', key);
    check('la clave de la versión nunca es la del original', key !== 'clubs/c1/media/Reel - Entrega de 117 prendas.mp4');
    check('sin id no hay clave', versionKeyFor('x/y.mp4', null) === null);
    check('nombre: «<video> + Outro <título>.mp4»', versionFilenameFor('Reel – Entrega de 117 prendas.mp4', 'Rotary') === 'Reel – Entrega de 117 prendas + Outro Rotary.mp4');
    check('título con extensión se limpia', versionFilenameFor('v.mp4', 'cierre.mp4') === 'v + Outro cierre.mp4');

    const req = normalizeOutroRequest({ outroId: ' o1 ', transitionType: 'dissolve', transitionSec: '0.8', outroAudio: false });
    check('petición normalizada', req.outroId === 'o1' && req.transitionType === 'dissolve' && req.transitionSec === 0.8 && req.outroAudio === false && req.problems.length === 0);
    check('sin outro es un problema con salida', normalizeOutroRequest({}).problems.length === 1);

    const row = { id: 'c1', status: 'ready', originalMediaId: 'm1', versionMediaId: 'm2', outroId: 'o1', outroUrl: 'https://x/o.mp4', outroTitle: 'Rotary', transitionType: 'fade', transitionSec: 0.6, originalDurationSec: 14, outroDurationSec: 5, finalDurationSec: 18.4, plan: { audio: { mode: 'crossfade', outroHasAudio: true }, outroPosterUrl: 'https://x/p.jpg' }, report: { warnings: ['w'] }, composedAt: '2026-09-13T00:00:00Z' };
    const v = compositionView(row, { original: { id: 'm1', filename: 'a.mp4', url: 'u' }, version: { id: 'm2', filename: 'b.mp4', url: 'v', size: 5 } });
    check('DTO: «Listo para publicar» cuando está ready', v.statusLabel === 'Listo para publicar');
    check('DTO: outro, transición, duración, audio y créditos resueltos', v.outro.title === 'Rotary' && v.outro.posterUrl && v.transitionLabel && v.finalDurationSec === 18.4 && v.audioLabel && v.credits === 0 && v.warnings.length === 1);
    check('DTO: un estado desconocido cae a fallido', compositionView({ ...row, status: 'zzz' }).status === 'failed');
    check('DTO nulo con fila nula', compositionView(null) === null);

    const ahora = Date.now();
    check('un procesando reciente no está vencido', !processingIsStale({ status: 'processing', updatedAt: new Date(ahora - 1000).toISOString() }, ahora));
    check('un procesando viejo se da por muerto', processingIsStale({ status: 'processing', updatedAt: new Date(ahora - PROCESSING_STALE_MS - 1).toISOString() }, ahora));
    check('lo que no está procesando no bloquea', processingIsStale({ status: 'ready' }, ahora));
}

console.log('4. Composición REAL con ffmpeg');
{
    let ffmpeg = null;
    try { ffmpeg = (await import('ffmpeg-static')).default; } catch { /* sin binario */ }
    if (!ffmpeg || !fs.existsSync(ffmpeg)) {
        console.log('  (sin ffmpeg-static: se salta la composición real)');
    } else {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-outro-'));
        const clip = async (name, { sec, w, h, hz, color }) => {
            const out = path.join(dir, name);
            const args = ['-y', '-f', 'lavfi', '-i', `color=c=${color}:s=${w}x${h}:r=30:d=${sec}`];
            if (hz) args.push('-f', 'lavfi', '-i', `sine=frequency=${hz}:sample_rate=48000:duration=${sec}`);
            args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p');
            if (hz) args.push('-c:a', 'aac', '-b:a', '128k'); else args.push('-an');
            args.push('-shortest', out);
            await run(ffmpeg, args, { maxBuffer: 64 * 1024 * 1024 });
            return out;
        };
        const meanVolume = async (file, from, len) => {
            const { stderr } = await run(ffmpeg, ['-ss', String(from), '-t', String(len), '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { maxBuffer: 64 * 1024 * 1024 });
            const m = stderr.match(/mean_volume:\s*(-?[\d.]+|-inf)/);
            return m ? (m[1] === '-inf' ? -Infinity : Number(m[1])) : null;
        };
        const compose = async (mainFile, outroFile, opts, name) => {
            const [mb, ob] = [fs.readFileSync(mainFile), fs.readFileSync(outroFile)];
            const main = probeMp4(mb), outro = probeMp4(ob);
            const plan = planLibraryOutro({ main, outro, ...opts });
            const graph = buildLibraryOutroGraph(plan);
            const out = path.join(dir, name);
            await run(ffmpeg, buildLibraryOutroArgs({ mainPath: mainFile, outroPath: outroFile, outputPath: out, plan, graph, bitrate: { v: '1M', max: '1.5M', buf: '2M' } }), { maxBuffer: 64 * 1024 * 1024 });
            const probe = probeMp4(fs.readFileSync(out));
            return { plan, probe, out, validation: validateComposedOutro({ probe, plan }) };
        };

        const main = await clip('main.mp4', { sec: 4, w: 640, h: 360, hz: 440, color: 'blue' });
        const outro = await clip('outro.mp4', { sec: 3, w: 640, h: 360, hz: 880, color: 'red' });
        const mainMudo = await clip('main-mudo.mp4', { sec: 4, w: 640, h: 360, hz: 0, color: 'blue' });
        const outroMudo = await clip('outro-mudo.mp4', { sec: 3, w: 640, h: 360, hz: 0, color: 'red' });
        const outroVertical = await clip('outro-v.mp4', { sec: 3, w: 360, h: 640, hz: 880, color: 'green' });

        // A) los dos con audio, fundido 0.6
        const a = await compose(main, outro, { transitionType: 'fade', transitionSec: 0.6 }, 'a.mp4');
        check('A: duración = 4 + 3 − 0.6', Math.abs(a.probe.durationSec - 6.4) <= DURATION_TOLERANCE_SEC, String(a.probe.durationSec));
        check('A: el plan dice lo mismo', a.plan.finalDurationSec === 6.4);
        check('A: sale con audio y valida', a.probe.hasAudio && a.validation.ok, a.validation.problems.join(' | '));
        check('A: 640×360 a 30 fps', a.probe.width === 640 && a.probe.height === 360);
        const finalA = await meanVolume(a.out, 5.6, 0.7);
        const inicioA = await meanVolume(a.out, 0.2, 1);
        check('A: el outro suena hasta el final (su audio no se corta)', finalA !== null && finalA > -30, String(finalA));
        check('A: el principal suena al inicio', inicioA !== null && inicioA > -30, String(inicioA));
        const cruceA = await meanVolume(a.out, 3.4, 0.6);
        check('A: en el cruce no hay hueco de nivel', cruceA !== null && cruceA > -30, String(cruceA));

        // B) corte seco
        const b = await compose(main, outro, { transitionType: 'cut' }, 'b.mp4');
        check('B: corte → 7 s exactos', Math.abs(b.probe.durationSec - 7) <= DURATION_TOLERANCE_SEC, String(b.probe.durationSec));
        check('B: valida', b.validation.ok, b.validation.problems.join(' | '));

        // C) principal mudo, outro con voz: la voz del outro se conserva
        const c = await compose(mainMudo, outro, { transitionType: 'fade', transitionSec: 0.6 }, 'c.mp4');
        check('C: modo outro_fade_in', c.plan.audio.mode === 'outro_fade_in');
        check('C: sale con audio y dura 6.4', c.probe.hasAudio && Math.abs(c.probe.durationSec - 6.4) <= DURATION_TOLERANCE_SEC);
        const silencioC = await meanVolume(c.out, 0.5, 2);
        const finalC = await meanVolume(c.out, 5.6, 0.7);
        check('C: el principal queda en silencio', silencioC === -Infinity || silencioC < -60, String(silencioC));
        check('C: el outro suena hasta el final', finalC !== null && finalC > -30, String(finalC));

        // D) outro mudo: el principal se desvanece y no se inventa audio
        const d = await compose(main, outroMudo, { transitionType: 'fade', transitionSec: 0.6 }, 'd.mp4');
        check('D: modo main_fade_out y dura 6.4', d.plan.audio.mode === 'main_fade_out' && Math.abs(d.probe.durationSec - 6.4) <= DURATION_TOLERANCE_SEC);
        const finalD = await meanVolume(d.out, 4.5, 1.5);
        check('D: durante el outro hay silencio', finalD === -Infinity || finalD < -60, String(finalD));

        // E) outro con otra proporción → se adapta al máster sin bandas
        const e = await compose(main, outroVertical, { transitionType: 'dissolve', transitionSec: 0.5 }, 'e.mp4');
        check('E: la geometría es la del máster', e.probe.width === 640 && e.probe.height === 360 && e.plan.warnings.some(w => /proporción/.test(w)));
        check('E: valida', e.validation.ok, e.validation.problems.join(' | '));

        // F) los dos mudos → sin pista, y valida
        const f = await compose(mainMudo, outroMudo, { transitionType: 'fade', transitionSec: 0.6 }, 'f.mp4');
        check('F: sin pista', !f.probe.hasAudio && f.validation.ok);

        fs.rmSync(dir, { recursive: true, force: true });
    }
}

console.log('5. Cableado leído de los archivos');
{
    const ctrl = codigo(read('server/controllers/libraryOutroController.js'));
    check('el controlador no importa ningún motor generativo ni de voz ni de música', !/kieService|reelNarration|reelMusic|copywritingService|createKieVideoTask|synthesize/.test(ctrl));
    check('ningún crédito: creditsUsed = 0 literal', /"creditsUsed" = 0/.test(ctrl));
    check('la clave de la versión sale de versionKeyFor, nunca es la del original', /versionKeyFor\(original\.s3Key/.test(ctrl) && !/Key: original\.s3Key, Body/.test(ctrl));
    check('el UPDATE de Media apunta a la VERSIÓN', /UPDATE "Media" SET filename[^]*?\[existing\.versionMediaId/.test(ctrl));
    check('el DELETE de Media está guardado contra el original', /version\.id !== original\?\.id[^]*?DELETE FROM "Media" WHERE id = \$1/.test(ctrl));
    check('quitar no reprocesa: no hay ffmpeg en removeMediaOutro', !/export const removeMediaOutro[^]*?runFfmpeg/.test(ctrl));
    check('la composición se reclama con status processing', /status = 'processing'/.test(ctrl));
    check('el original nunca se sobrescribe en S3 (sólo PutObject sobre la clave de la versión)', (ctrl.match(/PutObjectCommand\(/g) || []).length === 1);
    check('log de arranque con la versión del criterio', /\[libraryOutroController\] v\$\{LIBRARY_OUTRO_VERSION\} cargado/.test(read('server/controllers/libraryOutroController.js')) && /^\d+\.\d+\.\d+$/.test(LIBRARY_OUTRO_VERSION));

    const rutas = read('server/routes/media.js');
    check('rutas GET/POST/DELETE /:id/outro con auth', /router\.get\('\/:id\/outro', authMiddleware, getMediaOutro\)/.test(rutas) && /router\.post\('\/:id\/outro', authMiddleware, applyMediaOutro\)/.test(rutas) && /router\.delete\('\/:id\/outro', authMiddleware, removeMediaOutro\)/.test(rutas));

    const ensure = read('server/lib/ensureLibraryOutroSchema.js');
    check('CREATE TABLE IF NOT EXISTS, sin DROP ni TRUNCATE', /CREATE TABLE IF NOT EXISTS "MediaOutroComposition"/.test(ensure) && !/DROP|TRUNCATE/.test(codigo(ensure)));
    const sqls = [...ensure.matchAll(/db\.query\(`([\s\S]*?)`\s*[,)]/g)].map(m => m[1]);
    check('ninguna comilla invertida dentro del SQL', sqls.length >= 2 && sqls.every(s => !s.includes('`')));
    const columnas = [...ensure.matchAll(/ADD COLUMN IF NOT EXISTS "([^"]+)"/g)].map(m => m[1]);
    check('todo ADD COLUMN está enumerado en el atajo (hoy ninguno)', columnas.every(c => ensure.includes(`'${c}'`)));

    const lib = codigo(read('server/lib/libraryOutro.js'));
    check('el criterio es puro: no importa db, fetch ni ffmpeg', !/from '\.\/db\.js'|node-fetch|runFfmpeg|@aws-sdk/.test(lib));
    check('atempo no existe en el grafo (la voz nunca se acelera)', !/atempo/.test(lib));

    const ui = read('src/pages/admin/MediaLibrary.tsx');
    check('la Biblioteca ofrece «Agregar outro»', /Agregar outro/.test(ui));
    check('el modal vive en el ámbito del módulo', /^const LibraryOutroModal: React\.FC/m.test(ui));
    check('la ficha muestra los cinco datos', /Video original/.test(ui) && /Outro aplicado/.test(ui) && /Duración final/.test(ui) && /Fecha de composición/.test(ui) && /Listo para publicar|statusLabel/.test(ui));
    check('acciones Cambiar / Quitar / Previsualizar / Descargar / Publicar', /Cambiar outro/.test(ui) && /Quitar outro/.test(ui) && /Previsualizar/.test(ui) && /Descargar/.test(ui) && /Publicar/.test(ui));
    check('el selector lista sólo outros guardados (readyOnly)', /content-studio\/outros\?readyOnly=true/.test(ui));
    check('publicar entra por la Distribución con la URL del archivo', /tab=distribution&kind=video&mediaUrl=/.test(ui));

    const studio = read('src/pages/admin/ContentStudio.tsx');
    check('el Estudio lee mediaUrl y kind de la URL y se los pasa a Distribución', /mediaUrl/.test(studio) && /<DistributionPanel prefill=\{distributionPrefill\}/.test(studio));
    const dist = read('src/components/admin/content-studio/DistributionPanel.tsx');
    check('DistributionPanel acepta prefill', /export interface DistributionPrefill/.test(dist) && /prefill\?: DistributionPrefill/.test(dist));

    const guard = read('scripts/db-push-guard.mjs');
    check('la tabla está en la lista documentada del guardián', /MediaOutroComposition/.test(guard));
    const claude = read('CLAUDE.md');
    check('CLAUDE.md documenta el módulo y la tabla', /MediaOutroComposition/.test(claude));
}

console.log(`\n${ok} ok, ${fail} fallos`);
process.exit(fail ? 1 : 0);
