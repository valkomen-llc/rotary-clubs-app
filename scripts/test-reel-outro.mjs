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
import { buildFilterGraph } from '../server/lib/reelFfmpeg.js';
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

console.log(`\n${ok} ok, ${fail} fallos`);
process.exit(fail ? 1 : 0);
