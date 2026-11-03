// ════════════════════════════════════════════════════════════════════
// Movimiento de la portada de un evento — pruebas del criterio — v4.1276.0
//   npm run test:event-hero-motion
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const out = await build({ entryPoints: ['src/lib/eventHeroMotion.ts'], bundle: true, write: false, format: 'esm', platform: 'neutral' });
const { normalizeHeroMotion, HERO_MOTION_SCALE, DEFAULT_HERO_MOTION } = await import(`data:text/javascript,${encodeURIComponent(out.outputFiles[0].text)}`);

let ok = 0; const malos = [];
const check = (n, c, e = '') => { if (c) { ok++; console.log(`  ✓ ${n}`); } else { malos.push(n); console.log(`  ✗ ${n}${e ? ` — ${e}` : ''}`); } };

const def = normalizeHeroMotion(undefined);
check('sin configurar: encendido, sutil, 5 s, centro', def.enabled && def.intensity === 'subtle' && def.durationSec === 5 && def.focus === 'center');
check('predeterminado = DEFAULT_HERO_MOTION', JSON.stringify(def) === JSON.stringify(DEFAULT_HERO_MOTION));
check('el evento lo puede apagar', normalizeHeroMotion({ enabled: false }).enabled === false);
check('intensidad desconocida → sutil', normalizeHeroMotion({ intensity: 'loca' }).intensity === 'subtle');
check('duración acotada 3–12 s', normalizeHeroMotion({ durationSec: 99 }).durationSec === 12 && normalizeHeroMotion({ durationSec: 1 }).durationSec === 3);
check('foco desconocido → centro', normalizeHeroMotion({ focus: 'x' }).focus === 'center');
check('el acercamiento es leve (≤ 12 %)', Object.values(HERO_MOTION_SCALE).every(s => s > 1 && s <= 1.12));

const ficha = readFileSync('src/pages/EventoDetalle.tsx', 'utf8');
check('la portada de la ficha usa EventHeroImage con la metadata del evento', /<EventHeroImage[\s\S]*?motion=\{event\.metadata\?\.heroMotion\}/.test(ficha));
const comp = readFileSync('src/components/EventHeroImage.tsx', 'utf8');
check('respeta «Reducir movimiento»', comp.includes('prefers-reduced-motion: reduce'));
check('arranca cuando la imagen cargó (onLoad + complete)', comp.includes('onLoad={() => setLoaded(true)}') && comp.includes('img.complete'));
check('sólo anima transform y opacity (sin bucle)', !/infinite|setInterval/.test(comp));
const rutas = readFileSync('server/routes/calendar.js', 'utf8');
check('heroMotion lo escribe la capacidad Multimedia', rutas.includes("media: ['video', 'hotels', 'heroMotion']"));
const panel = readFileSync('src/pages/admin/Events.tsx', 'utf8');
check('panel: editor en Multimedia guardando metadata.heroMotion', panel.includes('<EventHeroMotionEditor') && panel.includes('{ ...event.metadata, heroMotion }'));

console.log(`\n${ok} comprobaciones correctas, ${malos.length} con fallo.`);
if (malos.length) process.exit(1);
