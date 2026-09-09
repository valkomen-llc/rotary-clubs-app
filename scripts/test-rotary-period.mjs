// ════════════════════════════════════════════════════════════════════
// El período rotario en el título — v4.1023
//
//   npm run test:rotary-period
//
// Tres capas:
//
//   1. EL CRITERIO — dónde cae la frontera del 1 de julio, qué pasa con un
//      título que ya nombra un período y qué pasa en los bordes.
//   2. LA PARIDAD por SALIDAS contra los DOS cálculos que el servidor ya
//      tiene (`designSpec.rotaryPeriod` y `anniversarySpec.rotaryPeriodFor`).
//      Con tres criterios sueltos, el título de una pantalla y la firma de
//      una pieza podrían nombrar períodos distintos.
//   3. EL CABLEADO, leyendo los archivos. Es lo único que ve que la página
//      siga calculando el año en vez de volver a escribirlo a mano, y que el
//      año vaya en un nodo que el traductor no toca.
//
// El criterio pide `esbuild`; si falta, ese bloque se salta solo.
// ════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const grupo = t => console.log(`\n${t}`);

/** El archivo sin comentarios: una regla no puede fallar contra su propia
 *  explicación (la lección de v4.991 y de v4.1005). */
const codigo = (ruta) => readFileSync(ruta, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const JUNTA = 'src/pages/NuestraJuntaDirectiva.tsx';
const PENDONES = 'src/pages/GeneradorPendones.tsx';
const CRITERIO = 'src/lib/rotaryPeriod.ts';

let build;
try { ({ build } = await import('esbuild')); }
catch { console.log('⚠ Se omite el criterio: falta esbuild.  npm i --no-save esbuild'); }

let spec = null;
if (build) {
    const out = await build({
        entryPoints: [CRITERIO],
        bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent',
    });
    spec = await import(`data:text/javascript,${encodeURIComponent(out.outputFiles[0].text)}`);
}

if (spec) {
    grupo('── La frontera es el 1 de julio ──────────────────────────');

    // Enero (0) a junio (5) pertenecen al período que ARRANCÓ el año anterior.
    for (let m = 0; m <= 5; m++) {
        check(`mes ${m} de 2026 → 2025-2026`, spec.rotaryPeriodFrom(2026, m) === '2025-2026');
    }
    // Julio (6) a diciembre (11) arrancan el período del propio año.
    for (let m = 6; m <= 11; m++) {
        check(`mes ${m} de 2026 → 2026-2027`, spec.rotaryPeriodFrom(2026, m) === '2026-2027');
    }
    check('el cambio de año no mueve el período (dic → ene)',
        spec.rotaryPeriodFrom(2026, 11) === '2026-2027' && spec.rotaryPeriodFrom(2027, 0) === '2026-2027');

    grupo('── Un dato ilegible no se pinta ──────────────────────────');

    // Antes que un título que diga «NaN-NaN».
    for (const [y, m] of [[NaN, 6], [2026, NaN], [undefined, 6], [2026, undefined], ['x', 'y']]) {
        check(`(${String(y)}, ${String(m)}) → null`, spec.rotaryPeriodFrom(y, m) === null);
    }
    check('una fecha inválida tampoco pinta nada',
        spec.rotaryPeriodLocal(new Date('no soy una fecha')) === null
        && spec.rotaryPeriodUTC(new Date('no soy una fecha')) === null);

    grupo('── La lectura LOCAL usa la zona de quien mira ────────────');

    // `new Date(y, m, d)` se construye en la zona local y `getMonth()` la lee
    // en la misma: la comprobación no depende del huso del proceso.
    check('30 de junio de 2027, local → 2026-2027',
        spec.rotaryPeriodLocal(new Date(2027, 5, 30, 23, 59)) === '2026-2027');
    check('1 de julio de 2027, local → 2027-2028',
        spec.rotaryPeriodLocal(new Date(2027, 6, 1, 0, 0)) === '2027-2028');
    check('hoy no es null', typeof spec.rotaryPeriodLocal() === 'string');

    grupo('── Un título que ya nombra su período no recibe otro ─────');

    const P = '2026-2027';
    check('el título por defecto sí lo recibe',
        spec.periodSuffixFor('Nuestra Junta Directiva', P) === P);
    for (const t of [
        'Nuestra Junta Directiva 2026-2027',
        'Junta Directiva 2026 - 2027',
        'Junta Directiva 2026 – 2027',
        'Junta 2026/2027',
        'Junta 2026-27',
        'Directiva 2025-2026',           // aunque el período que nombra sea OTRO
    ]) {
        check(`«${t}» no recibe nada`, spec.periodSuffixFor(t, P) === null);
    }
    check('un año suelto NO cuenta como período',
        spec.periodSuffixFor('Junta Directiva 2026', P) === P);
    check('sin período que añadir, no se añade nada',
        spec.periodSuffixFor('Nuestra Junta Directiva', null) === null
        && spec.periodSuffixFor('Nuestra Junta Directiva', '') === null);
    check('un título vacío recibe el período igual',
        spec.periodSuffixFor('', P) === P);

    grupo('── Paridad con los DOS criterios del servidor ────────────');

    const { rotaryPeriod } = await import('../server/lib/designSpec.js');
    const { rotaryPeriodFor } = await import('../server/lib/anniversarySpec.js');

    let iguales = 0, distintos = [];
    for (let y = 2024; y <= 2030; y++) {
        for (let m = 0; m < 12; m++) {
            for (const dia of [1, 15, 28]) {
                const d = new Date(Date.UTC(y, m, dia, 12, 0, 0));
                const mio = spec.rotaryPeriodUTC(d);
                if (mio === rotaryPeriod(d) && mio === rotaryPeriodFor(d)) iguales++;
                else distintos.push(`${d.toISOString()} → ${mio} / ${rotaryPeriod(d)} / ${rotaryPeriodFor(d)}`);
            }
        }
    }
    check(`las tres coinciden en ${iguales} fechas`, distintos.length === 0, distintos.slice(0, 3).join(' | '));

    // Los bordes exactos, que es donde un criterio se separa de otro.
    for (const iso of ['2027-06-30T23:59:59Z', '2027-07-01T00:00:00Z', '2026-12-31T23:59:59Z']) {
        const d = new Date(iso);
        check(`borde ${iso}`,
            spec.rotaryPeriodUTC(d) === rotaryPeriod(d) && spec.rotaryPeriodUTC(d) === rotaryPeriodFor(d));
    }
}

grupo('── Las dos lecturas leen las partes que dicen leer ───────');

const critico = codigo(CRITERIO);
check('`rotaryPeriodUTC` usa getUTCFullYear/getUTCMonth',
    /rotaryPeriodUTC[\s\S]{0,200}getUTCFullYear\(\)[\s\S]{0,60}getUTCMonth\(\)/.test(critico));
check('`rotaryPeriodLocal` usa getFullYear/getMonth, no las UTC',
    /rotaryPeriodLocal[\s\S]{0,200}\.getFullYear\(\)[\s\S]{0,60}\.getMonth\(\)/.test(critico)
    && !/rotaryPeriodLocal[\s\S]{0,200}getUTC/.test(critico));

grupo('── El cableado de la página de la Junta ──────────────────');

const junta = codigo(JUNTA);
check('importa el criterio, no lo reescribe',
    /import\s*\{[^}]*rotaryPeriodLocal[^}]*periodSuffixFor[^}]*\}\s*from\s*'\.\.\/lib\/rotaryPeriod'/.test(junta));
check('el período sale del criterio con el título que se va a pintar',
    /periodSuffixFor\(\s*tituloJunta\s*,\s*rotaryPeriodLocal\(\)\s*\)/.test(junta));
check('el h1 pinta el título y su período',
    /<h1[^>]*>[\s\S]{0,400}\{tituloJunta\}[\s\S]{0,400}\{periodoJunta[\s\S]{0,200}<\/h1>/.test(junta));
check('el año va en un nodo que el traductor NO toca',
    /\{periodoJunta[^}]*&&\s*<span data-no-translate>/.test(junta));

// El defecto que este cambio existe para no tener: un año escrito a mano se
// queda viejo el 1 de julio y nadie lo nota. Se mira la CABECERA, no el
// archivo entero: los datos de ejemplo de la junta traen «Past RDR 2008-2009»,
// que es el cargo de una persona y no el período del sitio — un guardián que
// grita en falso se termina desactivando (v4.972).
const cabeceraJunta = (junta.match(/<h1[\s\S]{0,600}?<\/h1>/) || [''])[0];
check('el h1 no lleva ningún período escrito a mano',
    cabeceraJunta.length > 0 && !/\b20\d{2}\s*[-–—/]\s*20\d{2}\b/.test(cabeceraJunta));
check('el fallback del título sigue sin el año',
    /'title',\s*"Nuestra Junta Directiva"\)/.test(junta));

grupo('── Y el Generador de Pendones tampoco lo escribe a mano ──');

const pendones = codigo(PENDONES);
check('el título del pendón calcula su período',
    /Periodo Rotario \{rotaryPeriodLocal\(\)\}/.test(pendones));
// Incluido el ejemplo del campo del período de cada persona: un ejemplo que
// nombra un período vencido invita a escribir mal.
check('ningún período escrito a mano en el generador, tampoco de ejemplo',
    !/\b20\d{2}\s*[-–—/]\s*20\d{2}\b/.test(pendones));
check('el ejemplo del campo de período también se calcula',
    /placeholder=\{`\(Periodo Rotario \$\{rotaryPeriodLocal\(\)\}\)`\}/.test(pendones));

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`✗ ${malos.length} de ${ok + malos.length} fallaron:\n`);
    for (const m of malos) console.log(`   · ${m}`);
    process.exit(1);
}
console.log(`✓ ${ok} comprobaciones, todas bien.\n`);
