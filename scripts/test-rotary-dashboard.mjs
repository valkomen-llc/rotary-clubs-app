// Analítica de Rotary en Acción (pura + universo, sin DB).
import { universe, normClub } from '../server/lib/rotaryDashboard.js';

let fails = 0;
const assert = (c, m) => { if (!c) { fails++; console.error('FAIL:', m); } else { console.log('ok:', m); } };

const u4281 = universe('4281');
assert(u4281.length > 0, `universo 4281 desde catálogo (${u4281.length} clubes, sin número a mano)`);
assert(universe(null).length >= u4281.length, 'universo global incluye distritos');
assert(universe('9999').length === 0, 'distrito inexistente da universo vacío, no todo');

assert(normClub('Club Rotario Nuevo Cali') === normClub('Nuevo Cali'), 'prefijos no duplican clubes');
assert(normClub('ROTARY CLUB CALI') === normClub('Cali'), 'mayúsculas e inglés colapsan');
assert(normClub('  Cali  ') === 'cali', 'espacios recortados');

if (fails) { console.error(`${fails} fallos`); process.exit(1); }
console.log('rotary-dashboard: criterio OK');
