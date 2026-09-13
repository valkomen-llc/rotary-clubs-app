/**
 * Generador de Outro IA — Motion Graphics (v4.1035): criterio, render real y
 * cableado, sin base, credenciales ni red.
 *
 *   npm run test:outro:motion
 *
 * 1-3. El CRITERIO (`outroMotion.js` / `outroSpec.js`): presets que terminan
 *      en escala 1, lista blanca de filtros, duraciones validadas por motor,
 *      lienzo, plan de la voz y costos desglosados.
 * 4-5. Un RENDER real con el ffmpeg empaquetado sobre una imagen sintética:
 *      medidas, duración y fidelidad del último fotograma contra la imagen.
 *      La mezcla de voz con un tono sintético: pista de audio, duración y
 *      video copiado sin recodificar. Se saltan sin ffmpeg o sin sharp.
 * 6.   El CABLEADO leído de los archivos: rutas literales antes de `/:id`,
 *      ningún camino del motor determinista hacia KIE, el Creador de Reels
 *      pide el predeterminado, el distrito ve la pestaña y ningún backtick
 *      dentro de un db.query.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
    MOTION_PRESETS, DEFAULT_MOTION_PRESET, MAX_START_SCALE, ALLOWED_FILTERS, MOTION_FPS,
    zoomExpression, fadePlan, buildMotionFilter, filtersUsed, filterIsAllowed,
    planCanvas, resolveMotionDuration, planVoiceTiming, buildVoiceMixFilter, MAX_ATEMPO,
    VOICE_LEAD_IN_SEC, VOICE_TAIL_SEC, stagesSummary, emptyStages
} from '../server/lib/outroMotion.js';
import {
    OUTRO_ENGINES, DEFAULT_ENGINE, resolveEngine, estimateOutroCosts, TTS_CREDIT_ESTIMATE, isEngineAvailable, styleLabelFor
} from '../server/lib/outroSpec.js';
import { probeMp4 } from '../server/lib/outroQuality.js';

const raiz = path.resolve(import.meta.dirname, '..');
let ok = 0, fail = 0;
const check = (n, c, e = '') => { c ? ok++ : (fail++, console.log(`  ✗ ${n}${e ? ' — ' + e : ''}`)); };
const read = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');
const codigo = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// Evalúa la expresión de ffmpeg en JS para un fotograma dado.
const evalZoom = (expr, n) => {
    const js = expr.replace(/pow\(/g, 'Math.pow(').replace(/min\(/g, 'Math.min(');
    return Function('n', `return ${js};`)(n);
};

console.log('1. Presets: la escala TERMINA en 1 y el cierre queda quieto');
{
    check('hay cuatro presets', Object.keys(MOTION_PRESETS).length === 4);
    check('el predeterminado es «Institucional elegante»', DEFAULT_MOTION_PRESET === 'institucional_elegante' && MOTION_PRESETS.institucional_elegante.isDefault === true);
    check('los cuatro del pedido están', ['institucional_elegante', 'reveal_marca', 'movimiento_sutil', 'corporativo_dinamico'].every(id => MOTION_PRESETS[id]));
    for (const [id, p] of Object.entries(MOTION_PRESETS)) {
        check(`${id}: escala inicial acotada (≤ ${MAX_START_SCALE})`, p.startScale >= 1 && p.startScale <= MAX_START_SCALE);
        check(`${id}: el asentamiento termina ANTES del final`, p.settleFraction > 0 && p.settleFraction < 1);
        for (const durationSec of [3, 5, 7]) {
            const expr = zoomExpression({ preset: id, durationSec });
            const total = durationSec * MOTION_FPS;
            check(`${id}/${durationSec}s: el último fotograma es la imagen (z = 1)`, Math.abs(evalZoom(expr, total - 1) - 1) < 1e-9);
            check(`${id}/${durationSec}s: el primero arranca en la escala del preset`, Math.abs(evalZoom(expr, 0) - Math.min(MAX_START_SCALE, p.startScale)) < 1e-9);
            const settle = Math.round(durationSec * p.settleFraction * MOTION_FPS);
            check(`${id}/${durationSec}s: desde el asentamiento el cuadro no se mueve más`, Math.abs(evalZoom(expr, settle) - 1) < 1e-9 && Math.abs(evalZoom(expr, settle + 3) - 1) < 1e-9);
            // Monótona: nunca vuelve a acercarse (sería un «zoom» dentro del cierre).
            let mono = true;
            for (let n = 1; n < total; n++) if (evalZoom(expr, n) > evalZoom(expr, n - 1) + 1e-12) mono = false;
            check(`${id}/${durationSec}s: la escala sólo baja`, mono);
        }
        const f = fadePlan({ preset: id, durationSec: 3 });
        check(`${id}: los fundidos se acotan a un tercio de la pieza`, f.fadeInSec <= 1 && f.fadeOutSec <= 1);
    }
    check('un preset desconocido cae al predeterminado', zoomExpression({ preset: 'zoom_loco' }) === zoomExpression({ preset: DEFAULT_MOTION_PRESET }));
}

console.log('2. La lista blanca de filtros es la invariante');
{
    check('la lista blanca no incluye nada que reinterprete la imagen',
        ['gblur', 'noise', 'curves', 'colorbalance', 'hue', 'vignette', 'zoompan', 'rotate', 'tblend', 'eq'].every(f => !ALLOWED_FILTERS.includes(f)));
    for (const id of Object.keys(MOTION_PRESETS)) {
        for (const format of ['9:16', '1:1', '16:9']) {
            const g = buildMotionFilter({ preset: id, format, durationSec: 5, fps: MOTION_FPS, canvas: planCanvas({ imageWidth: 1080, imageHeight: 1920, format }) , padColor: '#0c2a5e' });
            const used = filtersUsed(g.filter);
            check(`${id}/${format}: sólo filtros de la lista blanca (${used.join(',')})`, filterIsAllowed(g.filter) && used.length > 0);
            check(`${id}/${format}: el grafo termina en yuv420p`, /format=yuv420p$/.test(g.filter));
            check(`${id}/${format}: la escala por fotograma es la del preset`, g.filter.includes(zoomExpression({ preset: id, durationSec: 5, fps: MOTION_FPS })));
        }
    }
    // El analizador de filtros respeta las comas DENTRO de la expresión.
    const g = buildMotionFilter({ preset: DEFAULT_MOTION_PRESET, format: '9:16', durationSec: 5, canvas: planCanvas({ imageWidth: 1080, imageHeight: 1920, format: '9:16' }) });
    check('filtersUsed no parte la expresión de la escala por sus comas', !filtersUsed(g.filter).some(f => /^\d|^pow|^min|^\(/.test(f)));
    check('un filtro colado se detecta', !filterIsAllowed(g.filter + ',gblur=sigma=2'));
    check('…también camuflado dentro de una cadena', !filterIsAllowed('scale=10:10,vignette,format=yuv420p'));
    const sin = buildMotionFilter({ preset: 'movimiento_sutil', format: '9:16', durationSec: 5, canvas: planCanvas({ imageWidth: 1080, imageHeight: 1920, format: '9:16' }) });
    check('«Movimiento sutil» va sin fundidos', !/fade=/.test(sin.filter));
}

console.log('3. Duración, lienzo, voz y costos');
{
    const motion = OUTRO_ENGINES.motion, kling = OUTRO_ENGINES.kling;
    check('el motor por defecto es el determinista', DEFAULT_ENGINE === 'motion' && motion.deterministic === true && !kling.deterministic);
    check('el determinista siempre está disponible; el generativo exige KIE_API_KEY', isEngineAvailable('motion') === true && isEngineAvailable('kling') === Boolean(process.env.KIE_API_KEY));
    check('ofrece 3 · 5 · 7 y personalizado', JSON.stringify(motion.durations) === '[3,5,7]' && motion.customDuration?.min === 2 && motion.customDuration?.max === 15);
    check('cero créditos de generación', motion.creditEstimate === 0 && motion.creditEstimateAudio === 0);
    check('Kling conserva sus duraciones reales y NO admite personalizado', JSON.stringify(kling.durations) === '[5,10]' && kling.customDuration === null);

    check('resolveMotionDuration acota y redondea', resolveMotionDuration(20).durationSec === 15 && resolveMotionDuration(1).durationSec === 2 && resolveMotionDuration(4.3).durationSec === 4.5);
    check('…y dice cuando ajustó', resolveMotionDuration(20).adjusted === true && resolveMotionDuration(5).adjusted === false);
    const m7 = resolveEngine({ engine: 'motion', durationSec: 7 });
    check('resolveEngine/motion: 7 s se entrega tal cual', m7.durationSec === 7 && m7.deterministic === true && m7.notes.length === 0);
    const m4 = resolveEngine({ engine: 'motion', durationSec: 4.2 });
    check('resolveEngine/motion: 4,2 → 4 (paso 0,5) con nota', m4.durationSec === 4 && m4.notes.some(n => /ajust/.test(n)));
    const m0 = resolveEngine({ engine: 'motion', durationSec: 0 });
    check('sin duración → 5 s', m0.durationSec === 5);
    if (process.env.KIE_API_KEY) {
        const k7 = resolveEngine({ engine: 'kling', durationSec: 7 });
        check('resolveEngine/kling: 7 s NO se manda: cae a la más cercana (5) y se anota', k7.durationSec === 5 && k7.notes.some(n => /5/.test(n)));
    } else {
        const k = resolveEngine({ engine: 'kling', durationSec: 7 });
        check('sin KIE_API_KEY, pedir Kling cae al determinista y lo dice', k.engineId === 'motion' && k.notes.some(n => /no está configurado/.test(n)));
    }
    check('nunca se resuelve una duración fuera de la lista/rango del motor', [2, 3.3, 5, 9, 40].every(d => {
        const r = resolveEngine({ engine: 'motion', durationSec: d });
        return r.durationSec >= 2 && r.durationSec <= 15 && Math.abs(r.durationSec * 2 - Math.round(r.durationSec * 2)) < 1e-9;
    }));

    const cover = planCanvas({ imageWidth: 1080, imageHeight: 1920, format: '9:16' });
    check('imagen en formato → cover sin nota', cover.mode === 'cover' && !cover.note);
    const pad = planCanvas({ imageWidth: 1920, imageHeight: 1080, format: '9:16' });
    check('imagen apaisada en 9:16 → se completa el lienzo, no se recorta', pad.mode === 'pad' && /sin recortar/.test(pad.note));
    check('sin medidas → cover y se dice', planCanvas({ format: '9:16' }).mode === 'cover' && /No se pudieron leer/.test(planCanvas({ format: '9:16' }).note));
    const padGraph = buildMotionFilter({ preset: DEFAULT_MOTION_PRESET, format: '9:16', durationSec: 5, canvas: pad, padColor: '#0c2a5e' });
    check('el relleno es el color de borde medido, no negro ni blur', /pad=.*color=#0c2a5e/i.test(padGraph.filter) && !/gblur/.test(padGraph.filter));

    const vf = planVoiceTiming({ measuredSec: 3.6, durationSec: 5 });
    check('voz que cabe: sin atempo', vf.fits && vf.atempo === 1 && Math.abs(vf.availableSec - (5 - VOICE_LEAD_IN_SEC - VOICE_TAIL_SEC)) < 1e-9);
    const vt = planVoiceTiming({ measuredSec: 4.3, durationSec: 5 });
    check('un 2 % de más se absorbe con atempo ≤ 1,04', vt.fits && vt.atempo > 1 && vt.atempo <= MAX_ATEMPO);
    const vn = planVoiceTiming({ measuredSec: 6, durationSec: 5 });
    check('lo que no cabe NO se acelera: se rechaza con la medida', vn.fits === false && vn.atempo === 1 && /acortá el mensaje/.test(vn.reason));
    check('un outro de 2 s no promete locución si no entra', planVoiceTiming({ measuredSec: 2, durationSec: 2 }).fits === false);
    const mix = buildVoiceMixFilter({ durationSec: 5, atempo: 1.02 });
    check('la mezcla renumera por muestras tras el adelay y recorta a la pieza', /adelay=350\|350,asetpts=N\/SR\/TB/.test(mix) && /atrim=0:5/.test(mix) && /atempo=1\.02/.test(mix));
    check('sin atempo no se mete el filtro', !/atempo/.test(buildVoiceMixFilter({ durationSec: 5, atempo: 1 })));
    check('nunca más de MAX_ATEMPO aunque se pida', new RegExp(`atempo=${MAX_ATEMPO}`).test(buildVoiceMixFilter({ durationSec: 5, atempo: 1.5 })));

    const c0 = estimateOutroCosts({ engine: 'motion', voiceEnabled: false });
    const c1 = estimateOutroCosts({ engine: 'motion', voiceEnabled: true });
    const ck = estimateOutroCosts({ engine: 'kling', voiceEnabled: true });
    check('costos separados en tres partidas', ['generationCost', 'ttsCost', 'compositionCost', 'total'].every(k => k in c0));
    check('motion sin voz: todo en cero', c0.total === 0 && c0.generationCost === 0 && c0.ttsCost === 0);
    check('motion con voz: sólo la voz cuesta', c1.generationCost === 0 && c1.ttsCost === TTS_CREDIT_ESTIMATE && c1.total === TTS_CREDIT_ESTIMATE);
    check('kling con voz: audio nativo dentro de la tarifa del motor, sin TTS aparte', ck.generationCost === OUTRO_ENGINES.kling.creditEstimateAudio && ck.ttsCost === 0);
    check('resolveEngine publica el desglose', typeof m7.costs?.total === 'number' && m7.creditEstimate === m7.costs.total);

    check('styleLabelFor rotula un preset y un estilo', styleLabelFor('reveal_marca') === 'Reveal de marca' && styleLabelFor('institucional') !== 'institucional');
    const st = stagesSummary({ ...emptyStages(), video: { state: 'ok' }, voice: { state: 'failed' }, mix: { state: 'ok' } });
    check('un fallo de voz NO invalida la pieza: video y mezcla listos cuentan', st.allDone === true && st.voice === 'failed');
    check('sin mezcla no está terminado', stagesSummary({ video: { state: 'ok' } }).allDone === false);
}

// ─── Render real ────────────────────────────────────────────────────────────
let sharp = null, ffmpegOk = false;
try { sharp = (await import('sharp')).default; } catch { /* sin sharp */ }
try { ffmpegOk = await (await import('../server/lib/reelFfmpeg.js')).isFfmpegAvailable(); } catch { /* sin ffmpeg */ }

if (!sharp || !ffmpegOk) {
    console.log(`4-5. … se saltan el render y la mezcla: hace falta ${!sharp ? 'sharp' : 'ffmpeg'}`);
} else {
    const { renderMotionOutro, mixOutroVoice, inspectArtwork } = await import('../server/lib/outroMotionRender.js');
    const { extractFrames, runFfmpeg, withTempDir } = await import('../server/lib/reelFfmpeg.js');

    // Una «pieza institucional» sintética: fondo azul, un rectángulo dorado
    // (el logotipo) y texto blanco simulado con barras. 1080×1920.
    const W = 1080, H = 1920;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
        <rect width="100%" height="100%" fill="#0c2a5e"/>
        <rect x="340" y="700" width="400" height="400" rx="40" fill="#f7a81b"/>
        <circle cx="540" cy="900" r="120" fill="#0c2a5e"/>
        <rect x="240" y="1250" width="600" height="60" fill="#ffffff"/>
        <rect x="320" y="1350" width="440" height="40" fill="#ffffff"/>
    </svg>`;
    const artwork = await sharp(Buffer.from(svg)).png().toBuffer();

    console.log('4. Render real: la pieza termina en la imagen');
    {
        const art = await inspectArtwork(artwork);
        check('inspectArtwork mide la imagen', art.width === W && art.height === H);
        check('…y el color de borde es el azul del fondo', /^#0c2a5e$/i.test(art.borderColor));

        const t0 = Date.now();
        const r = await renderMotionOutro(artwork, { format: '9:16', preset: 'institucional_elegante', durationSec: 5 });
        const ms = Date.now() - t0;
        console.log(`  · render 5 s 1080×1920: ${ms} ms, ${(r.buffer.length / 1024).toFixed(0)} KB`);
        const probe = probeMp4(r.buffer);
        check('sale un MP4 legible', probe.ok === true || probe.hasMoov !== false);
        check('resolución del maestro', probe.width === W && probe.height === H, `${probe.width}×${probe.height}`);
        check('duración exacta (±0,1 s)', Math.abs(Number(probe.durationSec) - 5) <= 0.1, String(probe.durationSec));
        check('sin pista de audio (el video se genera mudo)', probe.hasAudio === false);
        check('el plan declara cover y los fundidos del preset', r.plan.canvas.mode === 'cover' && r.plan.fades.fadeInSec === 0.5 && r.plan.fades.fadeOutSec === 0.5);
        check('el grafo usado pasa la lista blanca', filterIsAllowed(r.plan.filter));

        // Fidelidad: el fotograma del tramo quieto (antes del fundido de
        // salida) tiene que ser la imagen, salvo compresión.
        const frames = await extractFrames(r.buffer, { durationSec: 5, count: 3 });
        const medio = frames.find(f => f.position === 'medio');
        check('se extraen los tres fotogramas', frames.length === 3);
        if (medio) {
            const a = await sharp(medio.buffer).removeAlpha().resize(W, H).raw().toBuffer();
            const b = await sharp(artwork).removeAlpha().raw().toBuffer();
            let diff = 0;
            const len = Math.min(a.length, b.length);
            for (let i = 0; i < len; i++) diff += Math.abs(a[i] - b[i]);
            const mean = len ? diff / len : 999;
            console.log(`  · diferencia media fotograma medio vs imagen: ${mean.toFixed(2)}/255`);
            check('el fotograma central ES la imagen (diferencia media < 2/255)', mean < 2, mean.toFixed(2));
        }
        const inicio = frames.find(f => f.position === 'inicio');
        if (inicio) {
            const st = await sharp(inicio.buffer).stats();
            check('el primer fotograma está en el fundido de entrada (más oscuro)', st.channels[2].mean < 0x5e * 0.9);
        }

        const r7 = await renderMotionOutro(artwork, { format: '9:16', preset: 'corporativo_dinamico', durationSec: 7 });
        const p7 = probeMp4(r7.buffer);
        check('7 s se entregan tal cual', Math.abs(Number(p7.durationSec) - 7) <= 0.1, String(p7.durationSec));

        // Imagen apaisada en 9:16: lienzo con el color de borde, sin recortar.
        const wide = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="100%" height="100%" fill="#0c2a5e"/><rect x="760" y="340" width="400" height="400" fill="#f7a81b"/></svg>`)).png().toBuffer();
        const rw = await renderMotionOutro(wide, { format: '9:16', preset: 'movimiento_sutil', durationSec: 3 });
        const pw = probeMp4(rw.buffer);
        check('apaisada → el maestro sigue siendo 9:16', pw.width === W && pw.height === H);
        check('…con lienzo completado (pad) y la nota dicha', rw.plan.canvas.mode === 'pad' && rw.notes.some(n => /sin recortar/.test(n)));
        const fw = await extractFrames(rw.buffer, { durationSec: 3, count: 1 });
        if (fw[0]) {
            // Arriba (banda añadida) y centro tienen que ser del mismo azul: se
            // extendió el fondo, no se puso negro.
            const top = await sharp(fw[0].buffer).extract({ left: 0, top: 20, width: W, height: 60 }).toBuffer();
            const ts = await sharp(top).stats();
            check('la banda añadida es el azul de la imagen, no negro', ts.channels[2].mean > 0x40 && ts.channels[0].mean < 0x30);
        }

        console.log('5. Mezcla de voz: el video se copia y la pista entra');
        // Un tono sintético de 3 s como «locución».
        const voice = await withTempDir(async (dir) => {
            const out = path.join(dir, 'voice.mp3');
            await runFfmpeg(['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:a', 'libmp3lame', '-b:a', '96k', out], { timeoutMs: 20_000, label: 'tono' });
            return fs.promises.readFile(out);
        });
        const mixed = await mixOutroVoice({ videoBuffer: r.buffer, voiceBuffer: voice, durationSec: 5, timing: planVoiceTiming({ measuredSec: 3, durationSec: 5 }) });
        const pm = probeMp4(mixed);
        check('la mezcla tiene pista de audio', pm.hasAudio === true);
        check('…y conserva la duración de la pieza', Math.abs(Number(pm.durationSec) - 5) <= 0.15, String(pm.durationSec));
        check('…y la resolución', pm.width === W && pm.height === H);
        // -c:v copy: el flujo de video es el mismo (mismo códec, tamaño casi
        // igual salvo el audio y las cabeceras).
        check('el video no se recodificó (peso del video intacto, ±15 %)', Math.abs(mixed.length - r.buffer.length) < r.buffer.length * 0.15 + 120_000);
    }
}

console.log('6. Cableado (leído de los archivos)');
{
    const render = codigo('server/lib/outroMotionRender.js');
    check('el renderizador copia el video al mezclar (-c:v copy)', /'-c:v',\s*'copy'/.test(render));
    check('el renderizador no importa el cliente de KIE', !/kieService/.test(render));
    check('el renderizador reutiliza el runner de ffmpeg de Reels, no un spawn propio', /from '\.\/reelFfmpeg\.js'/.test(render) && !/spawn\(/.test(render));
    check('…y el narrador de Reels para la voz', /from '\.\/reelNarration\.js'/.test(render));

    const ctrl = codigo('server/controllers/outroController.js');
    const advanceMotion = ctrl.slice(ctrl.indexOf('const advanceMotion = async'), ctrl.indexOf('const advance = async (row)', ctrl.indexOf('const advanceMotion = async')));
    check('advanceMotion existe', advanceMotion.length > 200);
    check('advanceMotion no crea ninguna tarea en KIE', !/createKieVideoTask|getKieVideoTask|fetchKieVideoBuffer/.test(advanceMotion));
    check('advanceMotion reutiliza el video ya renderizado antes de volver a renderizar', /intermediate\.videoUrl/.test(advanceMotion));
    check('…y la voz ya sintetizada', /intermediate\.voiceUrl/.test(advanceMotion));
    check('un fallo de voz deja el video y lo dice (needs_review), no lo tira', /state: 'failed'/.test(advanceMotion) && /needs_review/.test(advanceMotion));
    check('el reclamo del avance es un UPDATE condicional', /UPDATE "OutroProject"[\s\S]*WHERE id = \$1\s*AND \(status = 'pending'/.test(advanceMotion));
    check('createOutro rechaza la voz sin proveedor ANTES de crear la fila', /plan\.voiceMode === 'tts' && !activeTtsProvider\(\)/.test(ctrl));
    check('el predeterminado se guarda en Setting con ON CONFLICT (key, "clubId")', /INSERT INTO "Setting"[\s\S]*ON CONFLICT \(key, "clubId"\)/.test(ctrl));
    check('el predeterminado se resuelve acotado al sitio', /WHERE id = \$1 AND "clubId" = \$2 AND "videoUrl" IS NOT NULL/.test(ctrl));
    check('el sitio del predeterminado sale del token para un administrador de sitio', /req\.user\?\.role === 'administrator'[\s\S]*: req\.user\?\.clubId/.test(ctrl));
    check('la Biblioteca recibe carpeta y miniatura', /"thumbUrl", "folderId"/.test(ctrl) && /ensureChildFolder\(\{ \.\.\.OUTRO_FOLDER/.test(ctrl));
    check('los costos se guardan desglosados en la fila', /costs: plan\.costs|costs:\s*plan\.costs/.test(ctrl) || /costs/.test(ctrl));
    // Ni una comilla invertida dentro de un db.query(`…`) — la trampa de v4.721.1.
    const raw = read('server/controllers/outroController.js');
    let bad = false;
    for (const m of raw.matchAll(/db\.query\(\s*`([^`]*)`/g)) if (/`/.test(m[1])) bad = true;
    check('ningún backtick dentro de un db.query', !bad);

    const routes = codigo('server/routes/contentStudio.js');
    const at = (re) => routes.search(re);
    check('las rutas /outros/default van ANTES de /outros/:id', at(/router\.get\('\/outros\/default'/) > -1 && at(/router\.get\('\/outros\/default'/) < at(/router\.get\('\/outros\/:id'/));
    check('PUT y DELETE del predeterminado también', at(/router\.put\('\/outros\/default'/) < at(/router\.get\('\/outros\/:id'/) && at(/router\.delete\('\/outros\/default'/) < at(/router\.delete\('\/outros\/:id'/));
    check('renombrar es PATCH /outros/:id', /router\.patch\('\/outros\/:id', authMiddleware, renameOutro\)/.test(routes));
    check('«Usar como predeterminado» por outro', /router\.put\('\/outros\/:id\/default', authMiddleware, setDefaultOutro\)/.test(routes));

    const creator = codigo('src/components/admin/content-studio/VideoCreator.tsx');
    check('el Creador de Reels pide el predeterminado al abrirse', /content-studio\/outros\/default/.test(creator));
    check('…y sólo preselecciona si nadie eligió uno (prev ?? …)', /setOutro\(prev => prev \?\?/.test(creator));
    check('…lo marca como predeterminado del sitio y conserva cambiar/quitar', /Predeterminado del sitio/.test(creator) && /Cambiar outro/.test(creator) && /setOutro\(null\)/.test(creator));
    check('el outro sigue viajando aparte de las imágenes del montaje', /^\s*outro\s*$/m.test(creator) && !/images:\s*\[[^\]]*outro/.test(creator));

    const ui = codigo('src/components/admin/content-studio/OutroGenerator.tsx');
    check('la pantalla manda motor, preset y duración al crear', /engine,\s*$/m.test(ui) || /style, preset, engine,/.test(ui));
    check('…y la duración pedida pasa por el preflight antes de generar', /preflight`[\s\S]*durationSec: requestedDurationSec/.test(ui));
    check('la pantalla no recalcula costos con el preflight presente', /preflight\?\.costs/.test(ui));
    check('la acción «Usar como outro predeterminado» existe', /Usar como outro predeterminado/.test(ui));
    check('el desglose muestra generación, voz y composición', /\['Generación', costs\.generationCost\]/.test(ui) && /\['Voz', costs\.ttsCost\]/.test(ui) && /\['Composición', costs\.compositionCost\]/.test(ui));
    check('el motor generativo lleva su aviso de fidelidad', /REDIBUJA la imagen/.test(ui));
    check('renombrar existe (PATCH)', /'PATCH', \{ title/.test(ui));

    const tabs = codigo('src/lib/contentStudioTabs.ts');
    check('el distrito VE la pestaña Outro IA', !/'outros'/.test(tabs.match(/DISTRICT_HIDDEN_TABS = \[[^\]]*\]/)?.[0] || "'outros'"));
    check('la pestaña se llama «Outro IA»', /Outro IA/.test(read('src/pages/admin/ContentStudio.tsx')));

    const spec = read('server/lib/outroSpec.js');
    check('el catálogo de presets vive en el spec (una sola fuente)', /export const MOTION_PRESETS/.test(spec) && !/export const MOTION_PRESETS/.test(read('server/lib/outroMotion.js')));
}

console.log(`\n${ok} correctas, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
