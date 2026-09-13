/**
 * Outro IA — modo MP4 importado (v4.1036): criterio, mezcla real y cableado,
 * sin base, credenciales ni red.
 *
 *   npm run test:outro:import
 *
 * 1-3. El CRITERIO (`outroImport.js`): validación del archivo, los cuatro
 *      escenarios de audio, costos (generación SIEMPRE 0), lista blanca de
 *      filtros de audio y el grafo de mezcla con ducking.
 * 4.   Una MEZCLA real con el ffmpeg empaquetado: un MP4 sintético con pista
 *      original + tono de «voz» + tono de «música» → el video se copia
 *      (-c:v copy), la duración se conserva y la pista sale. Se salta sin
 *      ffmpeg o sin sharp.
 * 5.   El CABLEADO leído de los archivos: el motor importado nunca llama a
 *      KIE ni al render de Motion Graphics, las rutas literales van antes de
 *      /outros/:id, la pantalla ofrece los dos modos y los cuatro rubros.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
    IMPORT_ENGINE_ID, ORIGINS, IMPORT_MAX_BYTES, IMPORT_MIN_SEC, IMPORT_MAX_SEC, detectFormat,
    validateImportedVideo, MUSIC_MODES, normalizeMusicConfig, estimateImportCosts, planImportAudio,
    voiceWindowFor, planVoiceTiming, planOutroDuration, ALLOWED_AUDIO_FILTERS, buildImportMixFilter, audioFiltersUsed,
    audioFilterIsAllowed, validateImportedOutput, emptyImportStages, importStagesSummary, voiceVolumeGainDb
} from '../server/lib/outroImport.js';
import { OUTRO_ENGINES, resolveEngine, estimateOutroCosts, TTS_CREDIT_ESTIMATE, MUSIC_CREDIT_ESTIMATE } from '../server/lib/outroSpec.js';
import { probeMp4 } from '../server/lib/outroQuality.js';

const raiz = path.resolve(import.meta.dirname, '..');
let ok = 0, fail = 0;
const check = (n, c, e = '') => { c ? ok++ : (fail++, console.log(`  ✗ ${n}${e ? ' — ' + e : ''}`)); };
const read = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');
const codigo = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const probeOk = (over = {}) => ({
    ok: true, hasMoov: true, hasMdat: true, truncated: false, parseError: null,
    width: 1080, height: 1920, durationSec: 5.0, hasAudio: true, videoCodec: 'avc1', audioCodec: 'mp4a',
    fps: 30, constantFrameRate: true, ...over
});

console.log('1. Validación del archivo: se acepta lo que sirve y se explica lo demás');
{
    const r = validateImportedVideo(probeOk(), { sizeBytes: 5_000_000, filename: 'outro.mp4' });
    check('un MP4 9:16 de 5 s pasa limpio', r.ok && r.failures.length === 0 && r.warnings.length === 0);
    check('detecta 9:16', r.format === '9:16' && r.formatDetected === '9:16');
    check('no necesita normalización', r.normalization.needed === false);
    check('reporta el audio original', r.hasAudio === true);
    check('detectFormat tolera un 3 %', detectFormat(1080, 1900) === '9:16' && detectFormat(1080, 1080) === '1:1' && detectFormat(1920, 1080) === '16:9' && detectFormat(1080, 1350) === '4:5');
    check('una proporción rara no se rechaza: se avisa', (() => { const x = validateImportedVideo(probeOk({ width: 1000, height: 1400 }), { filename: 'a.mp4' }); return x.ok && x.formatDetected === null && x.warnings.some(w => /catálogo/.test(w)); })());
    check('16:9 se acepta con aviso de recorte', (() => { const x = validateImportedVideo(probeOk({ width: 1920, height: 1080 }), { filename: 'a.mp4' }); return x.ok && x.warnings.some(w => /16:9/.test(w)); })());
    check('resolución baja: aviso, no rechazo', (() => { const x = validateImportedVideo(probeOk({ width: 540, height: 960 }), { filename: 'a.mp4' }); return x.ok && x.warnings.some(w => /Resolución baja/.test(w)); })());
    check('demasiado largo se rechaza con motivo', (() => { const x = validateImportedVideo(probeOk({ durationSec: IMPORT_MAX_SEC + 5 }), { filename: 'a.mp4' }); return !x.ok && x.failures.some(f => /no puede pasar/.test(f)); })());
    check('demasiado corto se rechaza', !validateImportedVideo(probeOk({ durationSec: IMPORT_MIN_SEC / 2 }), { filename: 'a.mp4' }).ok);
    check('demasiado pesado se rechaza', !validateImportedVideo(probeOk(), { sizeBytes: IMPORT_MAX_BYTES + 1, filename: 'a.mp4' }).ok);
    check('una extensión ajena se rechaza', !validateImportedVideo(probeOk(), { filename: 'a.avi' }).ok);
    check('.mov y .m4v se admiten', validateImportedVideo(probeOk(), { filename: 'a.mov' }).ok && validateImportedVideo(probeOk(), { filename: 'a.M4V' }).ok);
    check('un contenedor truncado se rechaza', !validateImportedVideo(probeOk({ truncated: true }), { filename: 'a.mp4' }).ok);
    check('un códec no reproducible NORMALIZA, no rechaza', (() => { const x = validateImportedVideo(probeOk({ videoCodec: 'hvc1' }), { filename: 'a.mp4' }); return x.ok && x.normalization.needed && /H\.264/.test(x.normalization.reasons[0]); })());
    check('fps variable normaliza', validateImportedVideo(probeOk({ constantFrameRate: false }), { filename: 'a.mp4' }).normalization.needed);
    check('sin pista de audio no es un fallo', validateImportedVideo(probeOk({ hasAudio: false }), { filename: 'a.mp4' }).ok);
}

console.log('2. Motor, costos y escenarios de audio');
{
    check('el motor `imported` está en el catálogo, marcado', OUTRO_ENGINES.imported?.imported === true && OUTRO_ENGINES.imported.id === IMPORT_ENGINE_ID);
    check('…cuesta 0 de generación, con y sin voz', OUTRO_ENGINES.imported.creditEstimate === 0 && OUTRO_ENGINES.imported.creditEstimateAudio === 0);
    check('…no se elige jamás como motor de generación', resolveEngine({ engine: 'imported', durationSec: 5 }).engine.id !== 'imported');
    check('…ni como respaldo de voz de otro motor', !Object.values(OUTRO_ENGINES).some(e => e.imported && resolveEngine({ engine: 'kling26', voiceEnabled: true, durationSec: 5 }).engine.id === e.id));
    check('los orígenes son dos y se llaman así', ORIGINS.imported === 'importado' && ORIGINS.generated === 'generado');
    const c0 = estimateImportCosts({});
    check('sin voz ni música: todo en 0', c0.total === 0 && c0.generationCost === 0 && c0.musicCost === 0 && c0.compositionCost === 0);
    const c1 = estimateImportCosts({ voiceEnabled: true, music: normalizeMusicConfig({ mode: 'generate', style: 'calido' }) });
    check('voz + música generada: voz + música, generación 0', c1.generationCost === 0 && c1.ttsCost === TTS_CREDIT_ESTIMATE && c1.musicCost === MUSIC_CREDIT_ESTIMATE && c1.total === TTS_CREDIT_ESTIMATE + MUSIC_CREDIT_ESTIMATE);
    check('música de la Biblioteca no cuesta', estimateImportCosts({ music: normalizeMusicConfig({ mode: 'library', url: 'https://x/y.mp3' }) }).musicCost === 0);
    check('estimateOutroCosts (motion) ahora desglosa musicCost = 0', estimateOutroCosts({ engine: 'motion', voiceEnabled: true }).musicCost === 0);
    check('normalizeMusicConfig: library sin url cae a none', normalizeMusicConfig({ mode: 'library' }).mode === 'none');
    check('normalizeMusicConfig: un modo desconocido cae a none', normalizeMusicConfig({ mode: 'suno' }).mode === 'none');
    check('los tres modos del catálogo', ['none', 'library', 'generate'].every(m => MUSIC_MODES[m]));

    const A = planImportAudio({ hasOriginalAudio: false, voiceEnabled: false, musicMode: 'library' });
    const B = planImportAudio({ hasOriginalAudio: false, voiceEnabled: true, musicMode: 'generate' });
    const C = planImportAudio({ hasOriginalAudio: true, voiceEnabled: true, musicMode: 'library' });
    const D = planImportAudio({ hasOriginalAudio: true, voiceEnabled: false, musicMode: 'none' });
    check('escenario A: sólo música', A.scenario === 'A' && A.music && !A.voice && !A.original && !A.ducking);
    check('escenario B: voz + música con ducking', B.scenario === 'B' && B.ducking && B.needsMix);
    check('escenario C: original + voz + música con ducking', C.scenario === 'C' && C.original && C.ducking);
    check('escenario D: sólo el original → passthrough (byte a byte)', D.scenario === 'D' && D.passthrough && !D.needsMix && !D.dropped);
    const drop = planImportAudio({ hasOriginalAudio: true, keepOriginalAudio: false, voiceEnabled: false, musicMode: 'none' });
    check('descartar el original a pedido SE DICE y obliga a mezclar', drop.dropped && drop.needsMix && /descarta a pedido tuyo/.test(drop.note));
    check('el original nunca se descarta en silencio (sin pedirlo, se conserva)', planImportAudio({ hasOriginalAudio: true, voiceEnabled: true, musicMode: 'none' }).original === true);
    const w = voiceWindowFor(5);
    check('la ventana de la voz descuenta entrada y cola', w.availableSec > 3.5 && w.availableSec < 5);
    // v4.1038: la locución no se rechaza ni se acelera — la PIEZA se alarga.
    const t = planVoiceTiming({ measuredSec: 7.2, durationSec: 5 });
    check('una locución de 7,2 s sobre 5 s NO se rechaza ni se acelera: la pieza pasa a 8 s', t.ok === true && t.atempo === 1 && t.extended && Math.abs(t.finalDurationSec - 8) < 1e-9);
    check('una de 3 s sobre 5 s conserva los 5 s del MP4', planOutroDuration({ sourceDurationSec: 5, voiceMeasuredSec: 3 }).finalDurationSec === 5);
    check('la lista blanca de audio ya no admite atempo (la voz nunca se acelera)', !ALLOWED_AUDIO_FILTERS.includes('atempo'));
    check('el volumen de la voz mapea a dB acotados', voiceVolumeGainDb('soft') < 0 && voiceVolumeGainDb('normal') === 0 && voiceVolumeGainDb('strong') > 0 && voiceVolumeGainDb('zzz') === 0);
}

console.log('3. El grafo de audio: lista blanca y ducking');
{
    check('la lista blanca sólo trae filtros de AUDIO', !ALLOWED_AUDIO_FILTERS.some(f => ['scale', 'crop', 'zoompan', 'gblur', 'overlay', 'drawtext', 'eq'].includes(f)));
    const g = buildImportMixFilter({ durationSec: 5, inputs: { original: 0, voice: 1, music: 2 }, voice: planVoiceTiming({ measuredSec: 3, durationSec: 5 }), music: { loopSamples: 48000 * 3 } });
    check('escenario C: ducking con la voz como cadena lateral', /sidechaincompress/.test(g.filter) && /asplit=2/.test(g.filter));
    check('…las tres pistas entran', /\[0:a\]/.test(g.filter) && /\[1:a\]/.test(g.filter) && /\[2:a\]/.test(g.filter));
    check('…el limitador cierra la mezcla', /alimiter=limit=0\.95/.test(g.filter) && g.output === '[mix]');
    check('…amix con normalize=0 (no baja la cama por existir)', /amix=inputs=2:normalize=0/.test(g.filter) && !/normalize=1/.test(g.filter));
    check('…la música da la vuelta si es corta (aloop) y se recorta a la pieza', /aloop=loop=-1:size=144000/.test(g.filter) && /atrim=0:5/.test(g.filter));
    check('…con fundido de entrada y de salida', /afade=t=in/.test(g.filter) && /afade=t=out/.test(g.filter));
    check('…sólo filtros de la lista blanca', audioFilterIsAllowed(g.filter), audioFiltersUsed(g.filter).filter(f => !ALLOWED_AUDIO_FILTERS.includes(f)).join(','));
    const a = buildImportMixFilter({ durationSec: 4, inputs: { music: 1 } });
    check('escenario A: sin voz no hay ducking', !/sidechaincompress/.test(a.filter) && /\[1:a\]/.test(a.filter) && audioFilterIsAllowed(a.filter));
    const v = buildImportMixFilter({ durationSec: 5, inputs: { voice: 1 }, voice: planVoiceTiming({ measuredSec: 2, durationSec: 5 }) });
    check('sólo voz: la cadena de Motion Graphics (loudnorm → adelay → asetpts → apad → atrim)', /loudnorm/.test(v.filter) && /adelay/.test(v.filter) && /asetpts=N\/SR\/TB/.test(v.filter) && !/sidechaincompress/.test(v.filter));
    let threw = false;
    try { buildImportMixFilter({ durationSec: 5, inputs: {} }); } catch { threw = true; }
    check('sin ninguna pista, el grafo se niega en vez de mezclar nada', threw);
    const out = validateImportedOutput(probeOk({ durationSec: 5.02 }), { expectedDurationSec: 5, expectAudio: true });
    check('el maestro se valida contra la duración del origen', out.verdict === 'ready');
    check('…y una pista ausente cuando se esperaba lo reprueba', validateImportedOutput(probeOk({ hasAudio: false }), { expectedDurationSec: 5, expectAudio: true }).verdict !== 'ready');
    const st = importStagesSummary({ ...emptyImportStages(), source: { state: 'ok' }, voice: { state: 'skipped' }, music: { state: 'ok' }, mix: { state: 'ok' } });
    check('las etapas del importado son source/voice/music/mix y se resumen', st.source === 'ok' && st.video === 'ok' && st.music === 'ok' && st.allDone === true);
}

let sharp = null, ffmpegOk = false;
try { sharp = (await import('sharp')).default; } catch { /* sin sharp */ }
try { const { runFfmpeg } = await import('../server/lib/reelFfmpeg.js'); await runFfmpeg(['-version'], { timeoutMs: 10_000, label: 'version' }); ffmpegOk = true; } catch { /* sin ffmpeg */ }

if (!sharp || !ffmpegOk) {
    console.log(`4. … se salta la mezcla real: hace falta ${!sharp ? 'sharp' : 'ffmpeg'}`);
} else {
    console.log('4. Mezcla real: el MP4 se copia, la pista se rehace');
    const { mixImportedOutro, extractPosterFrame, measureMusic } = await import('../server/lib/outroMotionRender.js');
    const { runFfmpeg, withTempDir } = await import('../server/lib/reelFfmpeg.js');
    const W = 1080, H = 1920;

    // Un «outro terminado» sintético de 5 s con audio propio (tono de 220 Hz).
    const source = await withTempDir(async (dir) => {
        const out = path.join(dir, 'src.mp4');
        await runFfmpeg(['-y', '-f', 'lavfi', '-i', `color=c=#0c2a5e:s=${W}x${H}:d=5:r=30`, '-f', 'lavfi', '-i', 'sine=frequency=220:duration=5',
            '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out], { timeoutMs: 60_000, label: 'src' });
        return fs.promises.readFile(out);
    });
    const tone = async (hz, sec, name) => withTempDir(async (dir) => {
        const out = path.join(dir, name);
        await runFfmpeg(['-y', '-f', 'lavfi', '-i', `sine=frequency=${hz}:duration=${sec}`, '-c:a', 'libmp3lame', '-b:a', '96k', out], { timeoutMs: 20_000, label: name });
        return fs.promises.readFile(out);
    });
    const voice = await tone(440, 2.5, 'voice.mp3');
    const musicBuf = await tone(660, 2, 'music.mp3');

    const ps = probeMp4(source);
    const report = validateImportedVideo(ps, { sizeBytes: source.length, filename: 'src.mp4' });
    check('el origen sintético pasa la validación', report.ok, report.failures.join(' · '));
    check('…con audio original y 9:16', report.hasAudio === true && report.format === '9:16');

    const poster = await extractPosterFrame(source, { durationSec: 5 });
    check('se extrae un fotograma para la miniatura', Boolean(poster && poster.length > 500));
    const md = await measureMusic(musicBuf);
    check('la música se mide (≈2 s)', md != null && Math.abs(md - 2) < 0.2, String(md));

    const t0 = Date.now();
    const timing = planVoiceTiming({ measuredSec: 2.5, durationSec: 5 });
    const r = await mixImportedOutro({
        videoBuffer: source, durationSec: 5, normalize: false, hasOriginalAudio: true, keepOriginalAudio: true,
        voiceBuffer: voice, voiceTiming: timing, voiceGainDb: 0, musicBuffer: musicBuf, musicDurationSec: md, musicGainDb: null
    });
    console.log(`  · mezcla escenario C (original + voz + música): ${Date.now() - t0} ms, ${(r.buffer.length / 1024).toFixed(0)} KB`);
    const pm = probeMp4(r.buffer);
    check('sale un MP4 legible con pista de audio', pm.hasAudio === true);
    check('…la resolución es la del origen', pm.width === W && pm.height === H, `${pm.width}×${pm.height}`);
    check('…y la duración también (±0,15 s)', Math.abs(Number(pm.durationSec) - 5) <= 0.15, String(pm.durationSec));
    check('…el video NO se recodificó (-c:v copy)', r.normalized === false && /'-c:v',\s*'copy'/.test(codigo('server/lib/outroMotionRender.js')));
    check('…el grafo usado lleva ducking y pasa la lista blanca', /sidechaincompress/.test(r.filter) && audioFilterIsAllowed(r.filter));
    check('…entraron las tres pistas', r.inputs?.original === 0 && r.inputs?.voice != null && r.inputs?.music != null, JSON.stringify(r.inputs));
    const v = validateImportedOutput(pm, { expectedDurationSec: 5, expectAudio: true, expectVoice: true });
    check('el maestro valida como listo', v.verdict === 'ready', v.failures.join(' · '));

    // Escenario A sobre el mismo origen SIN conservar el original.
    const rA = await mixImportedOutro({ videoBuffer: source, durationSec: 5, hasOriginalAudio: true, keepOriginalAudio: false, musicBuffer: musicBuf, musicDurationSec: md });
    const pA = probeMp4(rA.buffer);
    check('descartar el original a pedido: sale sólo la música, misma duración', pA.hasAudio === true && Math.abs(Number(pA.durationSec) - 5) <= 0.15 && rA.inputs?.original == null && rA.inputs?.music != null && !/sidechaincompress/.test(rA.filter));

    console.log('4b. Duración dinámica (v4.1038): la locución manda y el MP4 mantiene su último fotograma');
    const { measureAudioDuration, extractFrames } = await import('../server/lib/reelFfmpeg.js');
    const { VOICE_LEAD_IN_SEC, VOICE_TAIL_SEC } = await import('../server/lib/outroMotion.js');
    const mudo = await withTempDir(async (dir) => {
        const out = path.join(dir, 'mudo.mp4');
        await runFfmpeg(['-y', '-f', 'lavfi', '-i', `color=c=#0c2a5e:s=${W}x${H}:d=5:r=30`, '-vf', 'drawbox=x=340:y=700:w=400:h=400:color=#f7a81b:t=fill',
            '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-an', out], { timeoutMs: 60_000, label: 'mudo' });
        return fs.promises.readFile(out);
    });
    check('el segundo origen sintético no trae audio', probeMp4(mudo).hasAudio === false);
    const casos = [
        { nombre: 'voz más corta que el MP4 (2,5 s)', sec: 2.5 },
        { nombre: 'voz igual a la ventana del MP4 (4,2 s)', sec: 4.2 },
        { nombre: 'voz más larga que el MP4 (7,4 s)', sec: 7.4 },
        { nombre: 'texto considerablemente más largo (18 s)', sec: 18 }
    ];
    for (const caso of casos) {
        const vb = caso.sec === 2.5 ? voice : await tone(440, caso.sec, `voice-${caso.sec}.mp3`);
        const measured = await measureAudioDuration(vb);
        const tl = planOutroDuration({ sourceDurationSec: 5, voiceMeasuredSec: measured });
        const esperado = Math.max(5, measured + VOICE_LEAD_IN_SEC + VOICE_TAIL_SEC);
        check(`${caso.nombre}: la duración final sale de la MEDIDA del MP3 (${tl.finalDurationSec} s)`, Math.abs(tl.finalDurationSec - esperado) < 0.05, `${measured} → ${tl.finalDurationSec}`);
        // Con y sin audio original, con música.
        for (const [origen, tieneAudio] of [[source, true], [mudo, false]]) {
            const t0b = Date.now();
            const r2 = await mixImportedOutro({
                videoBuffer: origen, durationSec: tl.finalDurationSec, extendSec: tl.extendSec,
                hasOriginalAudio: tieneAudio, keepOriginalAudio: true,
                voiceBuffer: vb, voiceTiming: { leadInSec: VOICE_LEAD_IN_SEC }, voiceGainDb: 0,
                musicBuffer: musicBuf, musicDurationSec: md, musicGainDb: null
            });
            const p2 = probeMp4(r2.buffer);
            const tag = `${caso.nombre} · ${tieneAudio ? 'con' : 'sin'} audio original`;
            check(`${tag}: el MP4 final dura la duración final (±0,15 s) y tiene audio`, p2.hasAudio === true && Math.abs(Number(p2.durationSec) - tl.finalDurationSec) <= 0.15, `${p2.durationSec} s (${Date.now() - t0b} ms)`);
            check(`${tag}: misma resolución del maestro`, p2.width === W && p2.height === H);
            const fadeOutStart = Number((r2.filter.match(/afade=t=out:st=([\d.]+)/) || [])[1]);
            check(`${tag}: ducking y música con fundido de salida que cae al final REAL`, /sidechaincompress/.test(r2.filter) && Number.isFinite(fadeOutStart) && fadeOutStart > tl.finalDurationSec - 3 && fadeOutStart < tl.finalDurationSec, `fade-out en ${fadeOutStart}`);
            check(`${tag}: la voz NO se acelera (sin atempo) ni se recorta antes de la duración final`, !/atempo/.test(r2.filter) && new RegExp(`atrim=0:${String(tl.finalDurationSec).replace('.', '\\.')}`).test(r2.filter));
            if (tl.extended) {
                check(`${tag}: se extendió manteniendo el último fotograma (tpad clone), sin loop`, r2.extended === true && /tpad=stop_mode=clone/.test(r2.videoFilter) && !/loop=/.test(r2.videoFilter));
                const fr = await extractFrames(r2.buffer, { durationSec: tl.finalDurationSec, count: 3 });
                const last = fr[fr.length - 1];
                if (last) {
                    const st = await sharp(last.buffer).stats();
                    check(`${tag}: el fotograma final es el del MP4 (azul institucional, no negro ni otra cosa)`, st.channels[2].mean > 0x40 && st.channels[0].mean < 0x40, JSON.stringify(st.channels.map(c => Math.round(c.mean))));
                }
            } else {
                check(`${tag}: sin extensión el video se copia (-c:v copy)`, r2.extended === false && r2.videoFilter === null);
            }
        }
    }
}

console.log('5. Cableado (leído de los archivos)');
{
    const ctrl = codigo('server/controllers/outroController.js');
    const seg = (from, to) => { const i = ctrl.indexOf(from); return i < 0 ? '' : ctrl.slice(i, to ? ctrl.indexOf(to, i + 1) : undefined); };
    const advanceImport = seg('const advanceImport = async', 'export const remixOutro');
    check('advanceImport existe', advanceImport.length > 500);
    check('advanceImport NUNCA llama a KIE (ni imagen ni video)', !/createKie|getKie|fetchKieVideoBuffer|kieService/.test(advanceImport));
    check('advanceImport NUNCA renderiza Motion Graphics ni redibuja', !/renderMotionOutro|inspectArtwork|zoomExpression/.test(advanceImport));
    check('…el video se copia tal cual cuando no hay nada que mezclar (passthrough)', /passthrough/.test(advanceImport));
    check('…la voz reutiliza el sintetizador de siempre', /synthesizeOutroVoice/.test(advanceImport));
    check('…la música reutiliza el motor de Reels (startSoundtrack / fetchAudioBuffer)', /startSoundtrack/.test(advanceImport) && /fetchAudioBuffer/.test(advanceImport));
    check('…los intermedios se guardan y se reutilizan (voz y música)', /intermediate\.voiceUrl/.test(advanceImport) && /intermediate\.musicUrl/.test(advanceImport));
    check('…el reclamo es el UPDATE condicional de siempre', /WHERE id = \$1\s*AND \(status = 'pending'/.test(advanceImport));
    check('…un fallo de voz o música deja el video y lo dice', /needs_review/.test(advanceImport));
    const insertRow = seg('const createImportedRow', 'export const importOutro');
    check('la fila del importado nace con engine imported y origin importado', /IMPORT_ENGINE_ID, OUTRO_ENGINES\.imported\.model/.test(insertRow) && /ORIGINS\.imported/.test(insertRow));
    check('…y creditsEstimated 0 (nunca aparece como generado por Kling)', /'pending',0,/.test(insertRow));
    // v4.1038: sin presupuesto de palabras. Ni el alta, ni la variante, ni el
    // preflight rechazan por longitud; la duración final sale de la locución medida.
    check('importOutro NO rechaza el texto por longitud (sin needsSummary)', !/needsSummary/.test(seg('export const importOutro', 'const advanceImport')));
    check('remixOutro (variante importada) tampoco', !/needsSummary/.test(seg('if (source.engine === IMPORT_ENGINE_ID)', 'const usage = await creditUsage(req.user)')));
    check('el preflight informa sin bloquear (blocking:false, mayExtend)', /blocking: false/.test(ctrl) && /mayExtend/.test(ctrl));
    check('advanceImport calcula la duración FINAL con la locución MEDIDA (planOutroDuration sobre stages.voice.measuredSec)', /planOutroDuration\(\{ sourceDurationSec: durationSec, voiceMeasuredSec: hasVoice \? stages\.voice\.measuredSec : null \}\)/.test(advanceImport));
    check('…la música se pide para la duración final y la mezcla recibe extendSec', /startSoundtrack\(\{[^}]*durationSec: finalDurationSec/.test(advanceImport) && /extendSec: timeline\.extendSec/.test(advanceImport));
    check('…el maestro se valida contra la duración final, no la del origen', /expectedDurationSec: finalDurationSec/.test(advanceImport));
    check('…la extensión se declara con créditos 0 y sin motor generativo', /method: timeline\.extended \? 'hold_last_frame' : null, credits: 0/.test(advanceImport));
    check('…con extensión no hay passthrough (el video tiene que alargarse)', /plan\.passthrough && !report\.normalization\.needed && !timeline\.extended/.test(advanceImport));
    check('la voz sólo se marca fallida cuando no se pudo medir (timing.ok), nunca por larga', /!synth\.timing\.ok/.test(advanceImport) && !/synth\.timing\.fits/.test(advanceImport));
    check('remixOutro sólo toca la etapa de mezcla (mix pending), no el video', /mix: \{ state: 'pending' \}/.test(seg('export const remixOutro', 'export const listOutroMusic')));
    check('advance() despacha el motor importado a advanceImport', /IMPORT_ENGINE_ID[\s\S]{0,40}advanceImport/.test(seg('const advance = async (row)', 'const relaunch')));
    check('el DTO publica origin, imported y audioPlan', /origin:/.test(seg('const rowToDto', 'const creditUsage')) && /imported:/.test(seg('const rowToDto', 'const creditUsage')) && /audioPlan/.test(seg('const rowToDto', 'const creditUsage')));
    check('la pista de música se resuelve por sitio (scoped)', /scopeClause/.test(seg('export const listOutroMusic', undefined)));
    const raw = read('server/controllers/outroController.js');
    let bad = false;
    for (const m of raw.matchAll(/db\.query\(\s*`([^`]*)`/g)) if (/`/.test(m[1])) bad = true;
    check('ningún backtick dentro de un db.query', !bad);

    const ensure = read('server/lib/ensureOutroSchema.js');
    check('las columnas nuevas son ADD COLUMN IF NOT EXISTS (aditivas)', /ADD COLUMN IF NOT EXISTS origin/.test(ensure) && /ADD COLUMN IF NOT EXISTS "sourceVideoUrl"/.test(ensure) && /ADD COLUMN IF NOT EXISTS music/.test(ensure));
    check('el ensure no recrea ni borra la tabla', !/DROP TABLE/.test(codigo('server/lib/ensureOutroSchema.js')) && !/TRUNCATE/.test(codigo('server/lib/ensureOutroSchema.js')));

    const routes = codigo('server/routes/contentStudio.js');
    const at = (re) => routes.search(re);
    check('/outros/import/preflight y /outros/import van ANTES de /outros/:id', at(/router\.post\('\/outros\/import\/preflight'/) > -1 && at(/router\.post\('\/outros\/import'/) < at(/router\.get\('\/outros\/:id'/));
    check('/outros/music/library va ANTES de /outros/:id', at(/router\.get\('\/outros\/music\/library'/) > -1 && at(/router\.get\('\/outros\/music\/library'/) < at(/router\.get\('\/outros\/:id'/));
    check('remix existe por outro', /router\.post\('\/outros\/:id\/remix', authMiddleware, remixOutro\)/.test(routes));

    const render = codigo('server/lib/outroMotionRender.js');
    check('mixImportedOutro usa el runner de ffmpeg de Reels', /mixImportedOutro/.test(render) && !/spawn\(/.test(render) && !/kieService/.test(render));
    check('…y el grafo lo arma outroImport (un solo criterio)', /buildImportMixFilter/.test(render));

    const spec = codigo('server/lib/outroSpec.js');
    check('resolveEngine nunca elige el motor importado como generación', /generative\(/.test(spec) && /!e\.imported/.test(spec));

    const ui = codigo('src/components/admin/content-studio/OutroGenerator.tsx');
    check('la pantalla ofrece los dos modos', /¿Cómo quieres crear tu outro\?/.test(ui) && /Generar con Motion Graphics/.test(ui) && /Importar video MP4/.test(ui));
    check('…el MP4 entra por arrastre, archivo o Biblioteca', /onDrop=/.test(ui) && /accept=\{VIDEO_ACCEPT\}/.test(ui) && /mediaType="video"/.test(ui));
    check('…sube por uploadMediaFiles (el camino de siempre)', /uploadMediaFiles\(\[file\]\)/.test(ui));
    check('…la vista previa dice nombre, resolución, proporción, duración, peso y audio', /Audio original: \{importPreflight\.source\.hasAudio \? 'Sí' : 'No'\}/.test(ui));
    check('…procesa por POST /outros/import', /content-studio\/outros\/import`/.test(ui));
    check('…el preflight del importado pasa por el servidor', /content-studio\/outros\/import\/preflight/.test(ui));
    check('…las cuatro opciones de música', /'Sin música'/.test(ui) && /'Seleccionar de la Biblioteca'/.test(ui) && /'Subir archivo'/.test(ui) && /'Generar'/.test(ui));
    check('…los cuatro rubros del desglose (Generación IA · Voz · Música · Composición)', /\['Generación IA', costs\.generationCost\]/.test(ui) && /\['Música', costs\.musicCost \?\? 0\]/.test(ui) && /\['Composición', costs\.compositionCost\]/.test(ui));
    check('…el historial distingue Importado / Generado', /'Importado' : 'Generado'/.test(ui));
    check('…los niveles se cambian por /remix sin regenerar', /'\/remix', 'POST'/.test(ui));
    check('…el motor importado no se ofrece en el selector de motores', /filter\(e => !e\.imported\)/.test(ui));
    check('…en modo importado se esconden motor, preset y duración', (ui.match(/\{!isImport && \(/g) || []).length >= 3);

    // ── v4.1037: el preflight manda TODO lo que la pantalla lee ──────────
    // El espejo tipado prometía `report` y el servidor no lo mandaba: la
    // pantalla hacía `importPreflight.report.failures.map(...)` y reventaba
    // al primer render tras subir el video («Esta pantalla no se pudo
    // mostrar»). El typecheck no lo ve —la interfaz decía que estaba— y una
    // prueba de criterio tampoco: hay que leer las DOS puntas.
    const preflightBody = seg('export const preflightImport', 'const createImportedRow');
    const jsonStart = preflightBody.indexOf('res.json({');
    const respuesta = preflightBody.slice(jsonStart, preflightBody.indexOf('});', jsonStart));
    const clavesRespuesta = new Set(
        [...respuesta.matchAll(/^\s{12}([a-zA-Z]+)\s*(?:[:,]|$)/gm)].map(m => m[1])
    );
    const clavesLeidas = new Set(
        [...ui.matchAll(/importPreflight\??\.([a-zA-Z]+)/g)].map(m => m[1])
    );
    const faltan = [...clavesLeidas].filter(k => !clavesRespuesta.has(k));
    check(`toda clave que la pantalla lee del preflight viaja en la respuesta (${[...clavesLeidas].sort().join(', ')})`, clavesLeidas.size >= 8 && faltan.length === 0, faltan.length ? `faltan: ${faltan.join(', ')}` : '');
    check('…y el veredicto viaja ENTERO como `report` (ok, failures, warnings, normalization)', clavesRespuesta.has('report') && /importPreflight\.report\.ok/.test(ui) && /importPreflight\.report\.failures/.test(ui));
    const mirror = codigo('src/lib/outroSpec.ts');
    const mirrorBlock = mirror.slice(mirror.indexOf('export interface OutroImportPreflight'), mirror.indexOf('export type OutroStageState'));
    const clavesEspejo = new Set([...mirrorBlock.matchAll(/^\s{4}([a-zA-Z]+)\??:/gm)].map(m => m[1]));
    const prometidasSinMandar = [...clavesEspejo].filter(k => !clavesRespuesta.has(k));
    check('…y el espejo tipado no promete ninguna clave que el servidor no mande', prometidasSinMandar.length === 0, prometidasSinMandar.length ? `promete sin mandar: ${prometidasSinMandar.join(', ')}` : '');

    const ts = read('src/lib/outroSpec.ts');
    check('el espejo declara importing, origin, imported, music, importReport y audioPlan', /importing\?:/.test(ts) && /origin\?:/.test(ts) && /imported\?:/.test(ts) && /audioPlan\?:/.test(ts) && /musicCost\?:/.test(ts));
    check('…y NO copia el criterio (validateImportedVideo, planImportAudio)', !/validateImportedVideo|planImportAudio|buildImportMixFilter/.test(ts));

    // Reels: el outro importado entra por el mismo config.outro y nunca vuelve a la IA.
    const reelOutro = codigo('server/lib/reelOutro.js');
    check('el Reel consume el outro por URL/mediaId, sin distinguir su origen (misma vía)', /url/.test(reelOutro) && !/imported|origin/.test(reelOutro));
}

console.log(`\n${ok} correctas, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
