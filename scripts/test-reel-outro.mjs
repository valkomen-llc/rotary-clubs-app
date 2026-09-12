/**
 * Outro de un Reel (v4.1032) — criterio y grafo, sin base ni red.
 *
 *   npm run test:reels:outro
 *
 * Comprueba el CRITERIO (`reelOutro.js`), que el spec de montaje enganche el
 * outro como último clip con SU transición, que el grafo de ffmpeg respete esa
 * duración y mezcle el audio del outro sólo cuando está habilitado, y —leyendo
 * los archivos— que el cableado exista: cambiar el outro NO regenera escenas.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
    normalizeOutroConfig, outroClipFor, outroView, clipOverlap, aspectLabel, OUTRO_TRANSITION_SEC
} from '../server/lib/reelOutro.js';
import { buildEditSpec } from '../server/lib/reelRenderProviders.js';
import { buildFilterGraph, planAudioTimeline, composeReel, measureAudioDuration } from '../server/lib/reelFfmpeg.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import { TRANSITIONS } from '../server/lib/reelSpec.js';

const raiz = path.resolve(import.meta.dirname, '..');
let ok = 0, fail = 0;
const check = (n, c, e = '') => { c ? ok++ : (fail++, console.log(`  ✗ ${n}${e ? ' — ' + e : ''}`)); };
const read = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');

console.log('1. Criterio: normalización');
{
    const m = { durationSec: 5.04, width: 1080, height: 1920, hasAudio: true };
    const o = normalizeOutroConfig({ url: 'https://x/o.mp4', mediaId: 'm1', title: 'Cierre' }, { measured: m });
    check('se guarda con url', o?.url === 'https://x/o.mp4');
    check('nace activado', o.enabled === true);
    check('assetId desde mediaId', o.assetId === 'm1');
    check('lo medido manda', o.durationSec === 5.04 && o.width === 1080 && o.height === 1920 && o.hasAudio === true);
    check('audioEnabled por defecto con audio', o.audioEnabled === true);
    check('transición por defecto fade 0.6', o.transitionType === 'fade' && o.transitionSec === OUTRO_TRANSITION_SEC.default);
    check('sin url → null', normalizeOutroConfig({ enabled: true }) === null);

    const mudo = normalizeOutroConfig({ url: 'https://x/m.mp4', audioEnabled: true }, { measured: { durationSec: 4, width: 1920, height: 1080, hasAudio: false } });
    check('audioEnabled no puede ser cierto sin audio medido', mudo.audioEnabled === false);
    check('sin medición, hasAudio queda null', normalizeOutroConfig({ url: 'https://x/n.mp4' }).hasAudio === null);
    check('y entonces audioEnabled es false', normalizeOutroConfig({ url: 'https://x/n.mp4' }).audioEnabled === false);

    const clamped = normalizeOutroConfig({ url: 'https://x/o.mp4', transitionSec: 5, transitionType: 'zoom' });
    check('la duración se acota al máximo', clamped.transitionSec === OUTRO_TRANSITION_SEC.max);
    check('una transición agresiva cae al fundido', clamped.transitionType === 'fade');
    const corto = normalizeOutroConfig({ url: 'https://x/o.mp4', transitionSec: 0.05 });
    check('y al mínimo', corto.transitionSec === OUTRO_TRANSITION_SEC.min);
    const cut = normalizeOutroConfig({ url: 'https://x/o.mp4', transitionType: 'cut', transitionSec: 0.8 });
    check('corte directo → 0 s', cut.transitionType === 'cut' && cut.transitionSec === 0);

    // Ajustar sin cambiar de archivo conserva la medición previa.
    const prev = o;
    const adj = normalizeOutroConfig({ url: o.url, enabled: false, transitionSec: 0.4 }, { previous: prev });
    check('ajustar conserva lo medido', adj.durationSec === 5.04 && adj.hasAudio === true && adj.measuredAt === prev.measuredAt);
    check('ajustar cambia sólo lo pedido', adj.enabled === false && adj.transitionSec === 0.4 && adj.audioEnabled === true);
    const otro = normalizeOutroConfig({ url: 'https://x/otro.mp4' }, { previous: prev });
    check('otro archivo NO hereda la medición', otro.durationSec === null && otro.hasAudio === null && otro.measuredAt === null);
}

console.log('2. Criterio: clip y vista');
{
    const o = normalizeOutroConfig({ url: 'https://x/o.mp4', transitionSec: 0.8 }, { measured: { durationSec: 6, width: 1080, height: 1920, hasAudio: true } });
    const clip = outroClipFor(o);
    check('clip con la transición configurada', clip.transitionIn === 'fade' && clip.transitionSec === 0.8 && clip.isOutro === true);
    check('apagado → sin clip', outroClipFor({ ...o, enabled: false }) === null);
    check('demasiado largo → sin clip y con motivo', outroClipFor({ ...o, durationSec: 60 }) === null && outroView({ ...o, durationSec: 60 }).problems.length === 1);
    check('vista trae relación de aspecto', outroView(o).aspectRatio === '9:16');
    check('aspectLabel 1920×1080 = 16:9', aspectLabel(1920, 1080) === '16:9');
    check('aspectLabel sin medidas = null', aspectLabel(null, 1080) === null);
    check('clipOverlap respeta transitionSec', clipOverlap({ transitionIn: 'fade', transitionSec: 0.8 }, 1, TRANSITIONS) === 0.8);
    check('clipOverlap cae al catálogo', clipOverlap({ transitionIn: 'fade' }, 1, TRANSITIONS) === TRANSITIONS.fade.overlap);
    check('clipOverlap del primer clip es 0', clipOverlap({ transitionIn: 'fade', transitionSec: 0.8 }, 0, TRANSITIONS) === 0);
    check('clipOverlap con corte es 0', clipOverlap({ transitionIn: 'cut', transitionSec: 0.8 }, 1, TRANSITIONS) === 0);
}

console.log('3. Spec de montaje');
{
    const scenes = [
        { videoUrl: 'https://x/1.mp4', durationSec: 5, transitionOut: 'fade' },
        { videoUrl: 'https://x/2.mp4', durationSec: 5, transitionOut: 'fade' },
        { videoUrl: 'https://x/3.mp4', durationSec: 5, transitionOut: 'fade' }
    ];
    const tier = { width: 1080, height: 1920 };
    const sin = buildEditSpec({ scenes, tier });
    const outro = { videoUrl: 'https://x/o.mp4', durationSec: 4, transitionIn: 'fade', transitionSec: 0.6, hasAudio: true, audioEnabled: true };
    const con = buildEditSpec({ scenes, tier, outro });
    check('sin outro: 3 clips, spec.outro null', sin.clips.length === 3 && sin.outro === null);
    check('con outro: 4 clips y el último es el outro', con.clips.length === 4 && con.clips[3].isOutro === true && con.clips[3].src === 'https://x/o.mp4');
    check('el outro entra con SU transición', con.clips[3].transitionIn === 'fade' && con.clips[3].transitionSec === 0.6);
    check('duración total suma el outro menos su fundido', Math.abs(con.totalSec - (sin.totalSec + 4 - 0.6)) < 0.01);
    check('el spec guarda el outro resuelto', con.outro?.src === 'https://x/o.mp4' && con.outro.audioEnabled === true);
    check('las escenas no cambian por el outro', JSON.stringify(con.clips.slice(0, 3)) === JSON.stringify(sin.clips));
}

console.log('4. Grafo de ffmpeg');
{
    const base = [
        { startAt: 0, durationSec: 5, transitionIn: null },
        { startAt: 0, durationSec: 5, transitionIn: 'fade' }
    ];
    const outroMudo = { startAt: 0, durationSec: 4, transitionIn: 'fade', transitionSec: 0.8, isOutro: true, hasAudio: false, audioEnabled: false };
    const outroSon = { ...outroMudo, hasAudio: true, audioEnabled: true };
    const common = { width: 1080, height: 1920, fps: 30, hasMusic: true, totalSec: 12.7 };

    const g1 = buildFilterGraph({ clips: [...base, outroMudo], ...common });
    check('el outro se conforma como todo clip (cover/crop)', g1.filter.includes('[2:v]trim=duration=4,setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30'));
    check('xfade del outro dura 0.8 (no el 0.5 del catálogo)', g1.filter.includes('xfade=transition=fade:duration=0.8:offset='));
    check('computedSec descuenta el fundido del outro', Math.abs(g1.computedSec - (5 + 5 - 0.5 + 4 - 0.8)) < 0.001);
    check('outro mudo: no se pide [2:a]', !g1.filter.includes('[2:a]'));
    check('outro mudo: la música cierra al final de la pieza', g1.filter.includes('afade=t=out:st=10.7:d=2'));
    check('outro mudo: la música dura toda la pieza', g1.filter.includes('atrim=0:12.7'));

    const g2 = buildFilterGraph({ clips: [...base, outroSon], ...common });
    check('outro con audio: se toma [2:a]', g2.filter.includes('[2:a]atrim=0:4,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.8'));
    check('outro con audio: se desplaza a su segundo (8.7 s)', g2.filter.includes('adelay=8700|8700'));
    check('outro con audio: se mezcla sin bajar la cama', g2.filter.includes('[abed][outroa]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0'));
    check('outro con audio: la música se retira durante la transición', /afade=t=out:st=7\.5/.test(g2.filter));
    check('la salida sigue siendo aout', g2.audioLabel === 'aout' && g2.filter.includes('[aout]'));

    const g3 = buildFilterGraph({ clips: [...base, outroSon], ...common, hasMusic: false });
    check('outro con audio y sin música: aout es el outro', g3.audioLabel === 'aout' && g3.filter.includes('[outroa]anull[aout]'));

    const g4 = buildFilterGraph({ clips: base, ...common, totalSec: 9.5 });
    check('sin outro el grafo no cambia de forma', !g4.filter.includes('abed') && !g4.filter.includes('outroa') && g4.filter.includes('[music]anull[aout]'));
}

console.log('5. Cableado (leído de los archivos)');
{
    const ctrl = read('server/controllers/reelController.js');
    const routes = read('server/routes/contentStudio.js');
    const ui = read('src/components/admin/content-studio/ReelLibrary.tsx');
    check('el montaje pasa el outro al spec', /outro: outroClip,/.test(ctrl));
    check('la creación persiste config.outro', /outro: outroConfigAtCreation,/.test(ctrl));
    check('el DTO expone outro y outroRendered', ctrl.includes('outro: outroView(row.config?.outro)') && ctrl.includes('outroRendered:'));
    check('rutas PUT/DELETE del outro', routes.includes("router.put('/reels/:id/outro'") && routes.includes("router.delete('/reels/:id/outro'"));
    const setBody = ctrl.slice(ctrl.indexOf('export const setReelOutro'), ctrl.indexOf('export const removeReelOutro'));
    check('setReelOutro no crea tareas de video ni toca escenas', !/createKieVideoTask|dispatchScene|relaunchScene|ReelScene/.test(setBody));
    check('setReelOutro comprueba el asset contra el alcance del sitio', setBody.includes('fetchOutroMedia(body.mediaId, req.user)') && /scopeClause\(user, 2\)/.test(ctrl.slice(ctrl.indexOf('const fetchOutroMedia'), ctrl.indexOf('export const setReelOutro'))));
    check('la pantalla monta OutroSection en la ficha', ui.includes('<OutroSection reel={reel} onChanged={onChanged} />'));
    check('OutroSection vive en el ámbito del módulo', /\nconst OutroSection: React\.FC/.test(ui));
    check('la pantalla relanza sólo el montaje (/render), no la creación', ui.includes('/render`') && !/OutroSection[\s\S]*?\/content-studio\/reels`,\s*\{\s*method: 'POST'/.test(ui.slice(ui.indexOf('const OutroSection'), ui.indexOf('const ReelDetail'))));
    check('la subida va por uploadMediaFiles (Biblioteca)', ui.includes("uploadMediaFiles([file], { clubId: reel.clubId })"));
    check('el selector de Biblioteca pide videos', ui.includes('mediaType="video"'));
}

console.log('6. Sincronía del audio con la duración REAL (v4.1033)');
{
    const base = [
        { startAt: 0, durationSec: 5, transitionIn: null },
        { startAt: 0, durationSec: 5, transitionIn: 'fade' },
        { startAt: 0, durationSec: 5, transitionIn: 'fade' }
    ]; // 14 s reales
    const outroMudo = { startAt: 0, durationSec: 4, transitionIn: 'fade', transitionSec: 0.6, isOutro: true, hasAudio: false, audioEnabled: false };
    const outroSon = { ...outroMudo, hasAudio: true, audioEnabled: true };
    const common = { width: 1080, height: 1920, fps: 30, hasMusic: true, totalSec: 14 };

    // A. música más corta que las escenas → loop, nunca silencio
    const a = buildFilterGraph({ clips: base, ...common, musicDurationSec: 6 });
    check('A: la música corta da la vuelta (aloop) antes del recorte', /\[3:a\]aformat=[^;]*aloop=loop=-1:size=288000,atrim=0:14/.test(a.filter));
    check('A: el grafo lo declara', a.musicLooped === true);
    const pa = planAudioTimeline({ totalSec: 14, clips: base, musicSec: 6, hasMusic: true });
    check('A: el plan dice loop con 3 vueltas y sin avisos', pa.music.action === 'loop' && pa.music.loops === 3 && pa.warnings.length === 0);
    check('A: escenas 14 / final 14 / audio 14', pa.videoScenesDuration === 14 && pa.finalVideoDuration === 14 && pa.audioDuration === 14);

    // B. música más larga → se recorta exacto y cierra con fundido
    const b = buildFilterGraph({ clips: base, ...common, musicDurationSec: 40 });
    check('B: sin aloop', !b.filter.includes('aloop') && b.musicLooped === false);
    check('B: se recorta a la pieza y cierra con fundido de 2 s', b.filter.includes('atrim=0:14,asetpts=PTS-STARTPTS,loudnorm') && b.filter.includes('afade=t=out:st=12:d=2'));
    check('B: el plan dice trim', planAudioTimeline({ totalSec: 14, clips: base, musicSec: 40, hasMusic: true }).music.action === 'trim');
    check('sin medida de la música NO hay loop y se avisa', !buildFilterGraph({ clips: base, ...common, musicDurationSec: null }).filter.includes('aloop')
        && /no se pudo medir/i.test(planAudioTimeline({ totalSec: 14, clips: base, musicSec: null, hasMusic: true }).warnings[0] || ''));

    // C. voz más corta que el Reel → la cadena lateral dura la pieza entera
    const c = buildFilterGraph({ clips: base, ...common, musicDurationSec: 6, hasVoice: true, voiceIndex: 4, voiceLeadIn: 0.5 });
    check('C: la voz se rellena a la duración de la pieza ANTES de partirse', /LRA=7,aformat=[^;]*,apad,atrim=0:14,asetpts=PTS-STARTPTS\[voice\]/.test(c.filter) && c.filter.includes('[voice]asplit=2[voice_out][voice_sc]'));
    check('C: la voz no se estira (sin atempo si stretch=1)', !c.filter.includes('atempo'));
    const pc = planAudioTimeline({ totalSec: 14, clips: base, musicSec: 6, voiceSec: 4, voiceLeadIn: 0.5, hasMusic: true, hasVoice: true });
    check('C: el plan conserva la voz tal cual y la música cubre el resto', pc.voice.action === 'as-is' && pc.voice.endsAt === 4.5 && pc.music.action === 'loop' && pc.warnings.length === 0);
    check('C: voz corta SIN música → aviso de tramo sin audio', /sin audio/.test(planAudioTimeline({ totalSec: 14, clips: base, voiceSec: 4, hasVoice: true }).warnings[0] || ''));

    // D. outro con audio → crossfade: la música se retira en la transición y el outro entra
    const d = buildFilterGraph({ clips: [...base, outroSon], ...common, totalSec: 17.4, musicDurationSec: 6 });
    check('D: la música se retira hasta el final de la transición (13.4+0.6)', /afade=t=out:st=12:d=2/.test(d.filter) && d.outroAudio?.startSec === 13.4 && d.outroAudio.fadeSec === 0.6);
    check('D: el outro entra con fundido del largo de la transición', d.filter.includes('afade=t=in:st=0:d=0.6'));
    check('D: el desplazamiento del outro renumera por muestras (asetpts=N/SR/TB) tras adelay', /adelay=13400\|13400,asetpts=N\/SR\/TB,apad,atrim=0:17\.4\[outroa\]/.test(d.filter));
    check('D: el aformat va ANTES de adelay', /loudnorm=I=-16:TP=-1\.5:LRA=11,aformat=[^,]*,adelay=13400/.test(d.filter));
    const pd = planAudioTimeline({ totalSec: 17.4, clips: [...base, outroSon], musicSec: 6, hasMusic: true });
    check('D: el plan separa escenas (14) de outro (4) y suma al final (17.4)', pd.videoScenesDuration === 14 && pd.outroDuration === 4 && pd.finalVideoDuration === 17.4 && pd.outroHasAudio === true);

    // E. outro sin audio → la música sigue sobre el outro y cierra al final
    const e = buildFilterGraph({ clips: [...base, outroMudo], ...common, totalSec: 17.4, musicDurationSec: 6 });
    check('E: la música cubre el outro y cierra al final del video', e.filter.includes('afade=t=out:st=15.4:d=2') && e.filter.includes('atrim=0:17.4') && !e.filter.includes('outroa'));
    check('E: la pieza corta también da la vuelta', e.filter.includes('aloop=loop=-1:size=288000'));
    const pe = planAudioTimeline({ totalSec: 17.4, clips: [...base, outroMudo], musicSec: 6, hasMusic: true });
    check('E: el plan: 3 vueltas, outro mudo, audio dura la pieza', pe.music.loops === 3 && pe.outroHasAudio === false && pe.audioDuration === 17.4);

    // Nada asume 20 s: la duración sale de los clips
    const largo = [...base, { startAt: 0, durationSec: 10, transitionIn: 'fade' }, { startAt: 0, durationSec: 10, transitionIn: 'fade' }, { startAt: 0, durationSec: 10, transitionIn: 'fade' }];
    const t = 5 + 5 - 0.5 + 5 - 0.5 + 10 - 0.5 + 10 - 0.5 + 10 - 0.5;
    const l = buildFilterGraph({ clips: largo, ...common, totalSec: t, musicDurationSec: 6 });
    check('un Reel de 42.5 s se sostiene igual: loop de 8 vueltas y cierre en 40.5', Math.abs(l.computedSec - t) < 0.001
        && planAudioTimeline({ totalSec: t, clips: largo, musicSec: 6, hasMusic: true }).music.loops === 8 && l.filter.includes(`afade=t=out:st=${t - 2}:d=2`));

    // F. cambiar el outro NO regenera escenas (cableado)
    const ffm = read('server/lib/reelFfmpeg.js');
    const prov = read('server/lib/reelRenderProviders.js');
    check('F: el compositor no importa el cliente de KIE', !/kieService|createKieVideoTask/.test(ffm) && !/kieService|createKieVideoTask/.test(prov));
    check('F: composeReel mide y planifica las pistas antes de montar', ffm.includes('measure(musicBuffer') && ffm.includes('planAudioTimeline({') && ffm.indexOf('planAudioTimeline({') < ffm.indexOf('const graph = buildFilterGraph'));
    check('F: los avisos del plan viajan en las notas del montaje', prov.includes("result.audioPlan?.warnings"));
}

console.log('7. Montaje REAL con ffmpeg: el final no queda mudo');
{
    const run = promisify(execFile);
    let ffmpegPath = process.env.FFMPEG_PATH || null;
    if (!ffmpegPath) { try { ffmpegPath = (await import('ffmpeg-static')).default; } catch { ffmpegPath = null; } }
    if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
        console.log('  (sin binario de ffmpeg — se salta)');
    } else {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-sync-'));
        const ff = (args) => run(ffmpegPath, ['-y', ...args], { maxBuffer: 1e8 });
        const clip = async (name, sec, audio = false) => {
            const f = path.join(dir, name);
            const a = audio ? ['-f', 'lavfi', '-i', `sine=frequency=440:duration=${sec}`, '-c:a', 'aac', '-shortest'] : ['-an'];
            await ff(['-f', 'lavfi', '-i', `color=c=blue:s=320x568:r=30:d=${sec}`, ...a, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', f]);
            return fs.readFileSync(f);
        };
        const tone = async (name, sec) => { const f = path.join(dir, name); await ff(['-f', 'lavfi', '-i', `sine=frequency=220:duration=${sec}`, '-c:a', 'aac', f]); return fs.readFileSync(f); };
        // nivel medio (dB) de una ventana; -ss/-to de ENTRADA, o volumedetect mide el archivo entero
        const level = async (buf, from, to) => {
            const f = path.join(dir, 'm.mp4'); fs.writeFileSync(f, buf);
            const { stderr } = await run(ffmpegPath, ['-ss', String(from), '-to', String(to), '-i', f, '-af', 'volumedetect', '-f', 'null', '-'], { maxBuffer: 1e8 });
            const m = stderr.match(/mean_volume:\s*(-?[\d.]+) dB/); return m ? Number(m[1]) : -91;
        };
        const scenes = [
            { startAt: 0, durationSec: 5, transitionIn: null, buffer: await clip('c0.mp4', 5) },
            { startAt: 0, durationSec: 5, transitionIn: 'fade', buffer: await clip('c1.mp4', 5) },
            { startAt: 0, durationSec: 5, transitionIn: 'fade', buffer: await clip('c2.mp4', 5) }
        ];
        const outroMudo = { startAt: 0, durationSec: 4, transitionIn: 'fade', transitionSec: 0.6, isOutro: true, hasAudio: false, audioEnabled: false, buffer: await clip('o0.mp4', 4) };
        const outroSon = { ...outroMudo, hasAudio: true, audioEnabled: true, buffer: await clip('o1.mp4', 4, true) };
        const music6 = await tone('m6.m4a', 6);
        const music40 = await tone('m40.m4a', 40);
        const voice4 = await tone('v4.m4a', 4);
        const common = { width: 320, height: 568, fps: 30, timeoutMs: 120_000 };
        const AUDIBLE = -30;

        const rA = await composeReel({ clips: scenes, musicBuffer: music6, ...common });
        check('A real: duración 14 s medida', Math.abs((await measureAudioDuration(rA.buffer)) - 14) < 0.1);
        check('A real: hay música a los 7 s y a los 11.5 s (después de la pista de 6 s)', (await level(rA.buffer, 7, 8)) > AUDIBLE && (await level(rA.buffer, 11.4, 12)) > AUDIBLE);
        check('A real: el último tramo se desvanece (no se corta)', (await level(rA.buffer, 13.7, 14)) < -35);
        check('A real: el plan del resultado dice loop', rA.audioPlan?.music?.action === 'loop');

        const rB = await composeReel({ clips: scenes, musicBuffer: music40, ...common });
        check('B real: 14 s exactos, sin exceder el video', Math.abs((await measureAudioDuration(rB.buffer)) - 14) < 0.1 && rB.audioPlan?.music?.action === 'trim');

        const rC = await composeReel({ clips: scenes, musicBuffer: music6, voiceBuffer: voice4, voiceLeadIn: 0.5, ...common });
        check('C real: la música sigue después de que la voz calla (7-8 s y 11.4-12 s)', (await level(rC.buffer, 7, 8)) > AUDIBLE && (await level(rC.buffer, 11.4, 12)) > AUDIBLE);

        const rD = await composeReel({ clips: [...scenes, outroSon], musicBuffer: music6, ...common });
        check('D real: 17.4 s', Math.abs((await measureAudioDuration(rD.buffer)) - 17.4) < 0.1);
        check('D real: el audio del outro suena (15-17 s)', (await level(rD.buffer, 15, 17)) > AUDIBLE);
        check('D real: sin hueco mudo en la transición (13.2-14.2 s)', (await level(rD.buffer, 13.2, 14.2)) > AUDIBLE);

        const rE = await composeReel({ clips: [...scenes, outroMudo], musicBuffer: music6, ...common });
        check('E real: la música cubre el outro mudo (14.5-16.5 s)', (await level(rE.buffer, 14.5, 16.5)) > AUDIBLE);
        check('E real: y cierra con fundido al final', (await level(rE.buffer, 17.1, 17.4)) < -35);
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

console.log(`\n${ok} ok, ${fail} fallos`);
process.exit(fail ? 1 : 0);
