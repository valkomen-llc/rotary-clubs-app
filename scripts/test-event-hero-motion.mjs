// ════════════════════════════════════════════════════════════════════
// Movimiento de la portada de un evento — pruebas del criterio — v4.1276.0
// Continuo y vivo con «Reducir movimiento» — v4.1277.0
//   npm run test:event-hero-motion
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const out = await build({ entryPoints: ['src/lib/eventHeroMotion.ts'], bundle: true, write: false, format: 'esm', platform: 'neutral' });
const { normalizeHeroMotion, planHeroMotion, HERO_MOTION_SCALE, DEFAULT_HERO_MOTION } = await import(`data:text/javascript,${encodeURIComponent(out.outputFiles[0].text)}`);

let ok = 0; const malos = [];
const check = (n, c, e = '') => { if (c) { ok++; console.log(`  ✓ ${n}`); } else { malos.push(n); console.log(`  ✗ ${n}${e ? ` — ${e}` : ''}`); } };

const def = normalizeHeroMotion(undefined);
check('sin configurar: encendido, CONTINUO, suave, 8 s, centro', def.enabled && def.mode === 'continuous' && def.intensity === 'subtle' && def.durationSec === 8 && def.focus === 'center');
check('predeterminado = DEFAULT_HERO_MOTION', JSON.stringify(def) === JSON.stringify(DEFAULT_HERO_MOTION));
check('el evento lo puede apagar', normalizeHeroMotion({ enabled: false }).enabled === false);
check('intensidad desconocida → sutil', normalizeHeroMotion({ intensity: 'loca' }).intensity === 'subtle');
check('duración acotada 4–20 s', normalizeHeroMotion({ durationSec: 99 }).durationSec === 20 && normalizeHeroMotion({ durationSec: 1 }).durationSec === 4);
check('foco desconocido → centro', normalizeHeroMotion({ focus: 'x' }).focus === 'center');
check('el acercamiento se percibe (≥ 8 %) sin pixelar (≤ 18 %)', Object.values(HERO_MOTION_SCALE).every(s => s >= 1.08 && s <= 1.18));
// v4.1277.0 — lo que guardó la v4.1276.0 (sin `mode`) pasa a ser continuo.
const viejo = normalizeHeroMotion({ enabled: true, intensity: 'subtle', durationSec: 5, focus: 'center' });
check('config de v4.1276.0 → continuo, 8 %', viejo.mode === 'continuous' && planHeroMotion(viejo, false).scale === 1.08 && planHeroMotion(viejo, false).iterations === 'infinite');
check('«Reducir movimiento»: se mueve MÁS SUAVE, no se apaga', (() => { const pl = planHeroMotion(viejo, true); return pl.state === 'gentle' && pl.scale > 1 && pl.scale < 1.08 && pl.dx === '0'; })());
check('respetarlo es opción del evento', planHeroMotion({ ...viejo, respectReducedMotion: true }, true).state === 'still-reduced');
check('respetarlo no afecta a quien no lo pidió', planHeroMotion({ ...viejo, respectReducedMotion: true }, false).state === 'running');
check('apagado → off', planHeroMotion({ ...viejo, enabled: false }, false).state === 'off');
check('modo una vez → 1 iteración', planHeroMotion({ ...viejo, mode: 'once' }, false).iterations === 1);
const css = readFileSync('src/index.css', 'utf8');
check('keyframes heroKenBurns FUERA de @layer (Tailwind no los purga)', /\n@keyframes heroKenBurns/.test(css));

const ficha = readFileSync('src/pages/EventoDetalle.tsx', 'utf8');
check('la portada de la ficha usa EventHeroImage con la metadata del evento', /<EventHeroImage[\s\S]*?motion=\{event\.metadata\?\.heroMotion\}/.test(ficha));
const comp = readFileSync('src/components/EventHeroImage.tsx', 'utf8');
check('lee «Reducir movimiento» y lo sigue en vivo', comp.includes('prefers-reduced-motion: reduce') && comp.includes("addEventListener?.('change'"));
check('arranca cuando la imagen cargó (onLoad + complete)', comp.includes('onLoad={() => setLoaded(true)}') && comp.includes('img.complete'));
check('animación CSS continua (alternate infinite) sin temporizadores', comp.includes('infinite alternate') && !/setInterval/.test(comp));
const rutas = readFileSync('server/routes/calendar.js', 'utf8');
check('heroMotion lo escribe la capacidad Multimedia', rutas.includes("media: ['video', 'hotels', 'heroMotion']"));
const panel = readFileSync('src/pages/admin/Events.tsx', 'utf8');
check('panel: editor en Multimedia guardando metadata.heroMotion', panel.includes('<EventHeroMotionEditor') && panel.includes('{ ...event.metadata, heroMotion }'));

console.log(`\n${ok} comprobaciones correctas, ${malos.length} con fallo.`);
if (malos.length) process.exit(1);
