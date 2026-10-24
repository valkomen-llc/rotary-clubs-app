#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// EL OUTRO SE PEGA SOBRE EL REEL MONTADO.  npm run test:reels:outro:append
// v4.1245.0
//
// Reporte: «Volver a montar con el outro» terminaba en «Ningún proveedor de
// montaje pudo completar el Reel — ffmpeg: montaje del Reel: se agotó el
// tiempo (224s)». Poner el outro rehacía el Reel entero desde las escenas.
// Ahora el video montado sin outro es la BASE y el outro se pega encima en
// una sola pasada (el compositor de `libraryOutro.js`).
//
// Prueba el criterio (`reelOutroAppend.js`, puro), una composición REAL con el
// ffmpeg empaquetado sobre clips sintéticos (se salta sin `ffmpeg-static`) y
// el cableado leído de los archivos. Sin base, credenciales ni red.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    baseMontageKey, baseTotalSec, pickMontagePath, baseRecord, appendOutroToBase, LEGACY_BASE_TOLERANCE_SEC,
} from '../server/lib/reelOutroAppend.js';
import { probeMp4 } from '../server/lib/outroQuality.js';

let total = 0, passed = 0;
const check = (d, ok, extra = '') => { total++; if (ok) { passed++; console.log(`  OK    ${d}`); } else { console.error(`  FAIL  ${d}${extra ? ` — ${extra}` : ''}`); process.exitCode = 1; } };
const leer = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

// ── El spec, como lo arma `buildEditSpec` ───────────────────────────
const escenas = [0, 1, 2, 3].map((i) => ({ src: `https://s3/escena-${i}.mp4`, startAt: 0, durationSec: 4.7, transitionIn: i ? 'fade' : null, transitionOut: 'fade' }));
const outroClip = { src: 'https://s3/outro.mp4', startAt: 0, durationSec: 5.2, transitionIn: 'fade', transitionSec: 0.6, transitionOut: 'fade', isOutro: true, hasAudio: true, audioEnabled: true };
const specSin = {
    width: 1080, height: 1920, fps: 30, clips: escenas, totalSec: 17.3,
    soundtrack: { src: 'https://s3/musica.mp3', volume: 0.85 },
    voice: { src: 'https://s3/voz.mp3', leadIn: 0.35, stretch: 1 },
    textOverlays: [{ startSec: 0.3, endSec: 4.0, text: 'Jaque Mate a la Polio', buffer: Buffer.from('png') }],
    outro: null,
};
const specCon = {
    ...specSin, clips: [...escenas, outroClip], totalSec: 21.9,
    outro: { src: outroClip.src, durationSec: 5.2, transitionIn: 'fade', transitionSec: 0.6, audioEnabled: true },
};
// La forma GUARDADA en la fila: los rótulos sin búfer.
const guardado = (spec) => ({ ...spec, textOverlays: spec.textOverlays.map((o) => ({ startSec: o.startSec, endSec: o.endSec, text: o.text })) });

console.log('\n▸ La huella de la base');
const k = baseMontageKey(specSin);
check('la huella existe', typeof k === 'string' && k.length > 20);
check('⚠️ el outro NO entra en la huella: con y sin outro, la misma base', baseMontageKey(specCon) === k);
check('⚠️ es la misma en el spec del montaje y en el guardado en la fila', baseMontageKey(guardado(specCon)) === k);
check('cambiar el outro (otro archivo, otra transición) no cambia la base',
    baseMontageKey({ ...specCon, clips: [...escenas, { ...outroClip, src: 'https://s3/otro.mp4', transitionSec: 1.0 }] }) === k);
check('una escena regenerada SÍ cambia la base', baseMontageKey({ ...specSin, clips: [{ ...escenas[0], src: 'https://s3/nueva.mp4' }, ...escenas.slice(1)] }) !== k);
check('otra duración de escena SÍ la cambia', baseMontageKey({ ...specSin, clips: [{ ...escenas[0], durationSec: 5 }, ...escenas.slice(1)] }) !== k);
check('otra música SÍ la cambia', baseMontageKey({ ...specSin, soundtrack: { src: 'https://s3/otra.mp3', volume: 0.85 } }) !== k);
check('otra locución SÍ la cambia', baseMontageKey({ ...specSin, voice: { ...specSin.voice, src: 'https://s3/voz2.mp3' } }) !== k);
check('otro rótulo SÍ la cambia', baseMontageKey({ ...specSin, textOverlays: [{ startSec: 0.3, endSec: 4, text: 'Otro texto' }] }) !== k);
check('sin escenas no hay huella', baseMontageKey({ clips: [] }) === null && baseMontageKey(null) === null);
check('la base dura el total menos lo que aporta el outro', baseTotalSec(specCon) === 17.3 && baseTotalSec(specSin) === 17.3);
check('con corte, el outro aporta entero', baseTotalSec({ totalSec: 23.2, outro: { src: 'x', durationSec: 5.2, transitionIn: 'cut', transitionSec: 0.6 } }) === 18);

console.log('\n▸ Qué camino se toma');
const base = baseRecord({ url: 'https://s3/base.mp4', s3Key: 'k/base.mp4', probe: { durationSec: 17.3, width: 1080, height: 1920, hasAudio: true }, key: k, stampedAt: '2026-10-24T10:00:00Z' });
const conBase = { videoUrl: 'https://s3/base.mp4', durationSec: 17.3, config: { base, master: { stampedAt: '2026-10-24T10:00:00Z', outro: null, baseKey: k } } };
let c = pickMontagePath({ spec: specCon, project: conBase });
check('con una base al día, el outro se PEGA encima', c.mode === 'append' && c.base.url === 'https://s3/base.mp4' && c.base.source === 'base');
const conOutroPuesto = { ...conBase, videoUrl: 'https://s3/con-outro.mp4', config: { ...conBase.config, master: { stampedAt: '2026-10-24T11:00:00Z', outro: specCon.outro, baseKey: k } } };
c = pickMontagePath({ spec: { ...specCon, clips: [...escenas, { ...outroClip, transitionSec: 1.0 }] }, project: conOutroPuesto });
check('⚠️ cambiar el outro de un Reel que YA lleva uno vuelve a la BASE, no al máster con outro', c.mode === 'append' && c.base.url === 'https://s3/base.mp4');
c = pickMontagePath({ spec: specSin, project: conOutroPuesto });
check('quitar el outro con la base al día la RESTAURA, sin codificar', c.mode === 'restore' && c.base.url === 'https://s3/base.mp4');
c = pickMontagePath({ spec: specSin, project: conBase });
check('sin outro y con el máster que ya es la base, se monta como siempre (nada que restaurar)', c.mode === 'full');
c = pickMontagePath({ spec: { ...specCon, clips: [{ ...escenas[0], src: 'https://s3/nueva.mp4' }, ...escenas.slice(1), outroClip] }, project: conOutroPuesto });
check('⚠️ si cambió una escena, la base no sirve: se monta entero', c.mode === 'full');

console.log('\n▸ El máster montado antes de v4.1245 (el del reporte)');
const legado = { videoUrl: 'https://s3/master-18s.mp4', s3Key: 'k/m.mp4', durationSec: 17.4, width: 1080, height: 1920, hasAudio: true, config: { master: { stampedAt: '2026-10-24T10:00:00Z', outro: null, totalSec: 17.3, durationSec: 17.4 } } };
c = pickMontagePath({ spec: specCon, project: legado, narration: { createdAt: '2026-10-24T09:00:00Z' } });
check('⚠️ un máster sin outro y con la duración de las escenas sirve de base', c.mode === 'append' && c.base.source === 'legacy' && c.base.url === 'https://s3/master-18s.mp4');
c = pickMontagePath({ spec: specCon, project: { ...legado, durationSec: 17.3 + LEGACY_BASE_TOLERANCE_SEC + 0.5 } });
check('…pero no si su duración no es la de las escenas', c.mode === 'full');
c = pickMontagePath({ spec: specCon, project: legado, narration: { createdAt: '2026-10-24T12:00:00Z' } });
check('…ni si la locución vigente es posterior al montaje', c.mode === 'full');
c = pickMontagePath({ spec: specCon, project: { ...legado, config: { master: { ...legado.config.master, outro: specCon.outro } } } });
check('…ni si el máster ya lleva un outro (pegaría dos cierres)', c.mode === 'full');
c = pickMontagePath({ spec: specCon, project: { ...legado, config: {} } });
check('…ni sin sello del máster', c.mode === 'full');
c = pickMontagePath({ spec: specCon, project: { ...legado, config: { master: { ...legado.config.master, baseKey: 'otra' } } } });
check('un máster con huella distinta no sirve', c.mode === 'full');

// ── La composición REAL ─────────────────────────────────────────────
console.log('\n▸ La composición, con ffmpeg de verdad');
let FF = null;
try { FF = (await import('ffmpeg-static')).default; } catch { /* sin binario */ }
if (!FF) {
    console.log('  (se salta: no hay ffmpeg-static)');
} else {
    const dir = mkdtempSync(path.join(tmpdir(), 'outro-append-'));
    try {
        const gen = (args) => execFileSync(FF, ['-v', 'error', '-y', ...args]);
        // Base: 8 s, 360×640, con audio; outro: 3 s con audio; outro mudo.
        gen(['-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=30:d=8', '-f', 'lavfi', '-i', 'sine=f=300:d=8', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-g', '60', '-c:a', 'aac', '-shortest', path.join(dir, 'base.mp4')]);
        gen(['-f', 'lavfi', '-i', 'color=c=blue:s=360x640:r=30:d=3', '-f', 'lavfi', '-i', 'sine=f=600:d=3', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(dir, 'outro.mp4')]);
        gen(['-f', 'lavfi', '-i', 'color=c=red:s=720x1280:r=25:d=3', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', path.join(dir, 'mudo.mp4')]);
        const archivos = { 'https://s3/base.mp4': 'base.mp4', 'https://s3/outro.mp4': 'outro.mp4', 'https://s3/mudo.mp4': 'mudo.mp4' };
        const descargas = [];
        const fetchBuffer = async (url, what) => { descargas.push(what); return readFileSync(path.join(dir, archivos[url])); };

        const t0 = Date.now();
        const r = await appendOutroToBase({ baseUrl: 'https://s3/base.mp4', outro: { src: 'https://s3/outro.mp4', durationSec: 3, transitionIn: 'fade', transitionSec: 0.6, audioEnabled: true }, fetchBuffer });
        const p = probeMp4(r.buffer);
        check('la pieza dura base + outro − transición (8 + 3 − 0,6 = 10,4 s)', Math.abs(p.durationSec - 10.4) <= 0.35, `midió ${p.durationSec}`);
        check('…con la resolución de la base', p.width === 360 && p.height === 640);
        check('…y con audio (cruce de las dos pistas)', p.hasAudio === true && r.plan.audio.mode === 'crossfade');
        check('declara la duración que espera la ingesta', r.expectedDurationSec === 10.4);
        check('trae miniatura', Buffer.isBuffer(r.posterBuffer) && r.posterBuffer.length > 0);
        check('dice que no se volvió a montar ninguna escena', r.notes.some((n) => /no se volvió a montar ninguna escena/.test(n)));
        check('bajó sólo la base y el outro', descargas.length === 2);
        console.log(`        (compuesto en ${((Date.now() - t0) / 1000).toFixed(1)} s)`);

        const m = await appendOutroToBase({ baseUrl: 'https://s3/base.mp4', outro: { src: 'https://s3/mudo.mp4', durationSec: 3, transitionIn: 'dissolve', transitionSec: 0.8, audioEnabled: false }, fetchBuffer });
        const pm = probeMp4(m.buffer);
        check('un outro mudo de otra medida y otro fps se conforma a la base', pm.width === 360 && pm.height === 640 && Math.abs(pm.durationSec - 10.2) <= 0.35, `${pm.width}×${pm.height} ${pm.durationSec}s`);
        check('…la música se desvanece en la transición y se dice', m.plan.audio.mode === 'main_fade_out' && m.notes.some((n) => /se desvanece/.test(n)));

        const cut = await appendOutroToBase({ baseUrl: 'https://s3/base.mp4', outro: { src: 'https://s3/outro.mp4', durationSec: 3, transitionIn: 'cut', transitionSec: 0, audioEnabled: true }, fetchBuffer });
        check('con corte directo, la pieza dura base + outro', Math.abs(probeMp4(cut.buffer).durationSec - 11) <= 0.35);

        let error = null;
        try { await appendOutroToBase({ baseUrl: 'https://s3/base.mp4', outro: { src: 'https://s3/outro.mp4' }, fetchBuffer: async () => Buffer.from('no es un video') }); } catch (e) { error = e.message; }
        check('una base ilegible falla con su motivo, no con un archivo roto', /No se pudo leer el video base/.test(error || ''));
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

// ── El cableado ─────────────────────────────────────────────────────
console.log('\n▸ El cableado');
const ctl = leer('server/controllers/reelController.js');
const lib = leer('server/lib/reelOutroAppend.js');
check('⚠️ el atajo va ANTES del montaje completo, y sin él se monta como siempre',
    /submitted = await montarAtajoDelOutro\(project, spec, narration\)\s*\|\| await submitRender\(spec/.test(ctl));
const cuerpo = ctl.slice(ctl.indexOf('const montarAtajoDelOutro'), ctl.indexOf('const submitAssembly'));
check('⚠️ el atajo no regenera escenas ni llama a ningún motor de video',
    cuerpo.length > 100 && !/createKieVideoTask|dispatchScene|kieService|generateScene/.test(cuerpo));
check('si falla rápido, se monta entero y se anota', /OUTRO_SHORTCUT_FALLBACK_MS/.test(cuerpo) && /appendNote\(project\.id/.test(cuerpo) && /return null/.test(cuerpo));
check('⚠️ NO hay un segundo grafo de outro: se usa el compositor de la Biblioteca',
    /buildLibraryOutroGraph/.test(lib) && /planLibraryOutro/.test(lib) && !/xfade=/.test(lib));
check('ninguna descarga sin tope de tiempo', /AbortSignal\.timeout/.test(lib));
const sello = ctl.slice(ctl.indexOf('const masterStamp'), ctl.indexOf('const ingestLocalReel'));
check('⚠️ el sello del máster guarda la huella de la base', /baseKey/.test(sello) && /baseMontageKey\(renderSpec\)/.test(sello));
check('…y un máster sin outro queda guardado como base', /sinOutro/.test(sello) && /base: nuevaBase/.test(sello));
check('las dos ingestas pasan la subida al sello', (ctl.match(/masterStamp\(project\.renderSpec, probe, \{ upload/g) || []).length === 2);
check('el máster usado como base queda guardado como base', /output\.baseStamp/.test(ctl));

console.log(`\n${passed}/${total} comprobaciones`);
if (passed !== total) process.exitCode = 1;
