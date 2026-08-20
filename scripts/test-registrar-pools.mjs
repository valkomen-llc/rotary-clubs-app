#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// EL POOL REGISTRADOR DE UN DOMINIO.  npm run test:registrar-pools
// v4.877.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED. La parte pura pide `esbuild` para leer
// el criterio en TypeScript y se salta sola si no está; el resto lee archivos.
//
// Lo que protege:
//
//   1. Que la opción EXISTA donde se pidió. Se reportó que un RYE no tenía por
//      dónde recibir su pool: el selector vivía sólo en la Gestión Global de
//      Clubes. Acá se comprueba que las seis pantallas de sitios usen el
//      MISMO componente y que ninguna vuelva a escribirlo a mano.
//
//   2. Que no se borre una activación de facturación sin que nadie lo pida.
//      Es la parte cara: `registrarPoolId` NO es columna de `Club` —se deriva
//      de la activación— y el listado nunca lo trae, así que tomar el valor
//      ausente por «sin asignar» convierte un detalle fallido en un borrado
//      silencioso. Lo que lo evita es `undefined`, y eso no lo ve el typecheck.
//
//   3. Que el campo sea del OPERADOR. La ruta que lo acepta la pueden usar
//      roles de sitio, y esconder el control en la pantalla no protege nada.
// ════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const eq = (n, a, b) => check(n, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const grupo = t => console.log(`\n${t}`);

const PANTALLAS = ['Programas', 'Asociaciones', 'Ferias', 'Zonas', 'Eventos'];
const TODAS = [...PANTALLAS, 'Clubs'];
const leer = f => readFileSync(f, 'utf8');

// ════════════════════════════════════════════════════════════════════
let spec = null;
try {
    const { build } = await import('esbuild');
    const out = await build({
        entryPoints: ['src/lib/registrarPools.ts'],
        bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent',
    });
    spec = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
} catch {
    console.log('⚠ Se omite el bloque del criterio: falta esbuild.  npm i --no-save esbuild');
}

if (spec) {
    const { SIN_ASIGNAR, normalizePools, poolCapacity, poolLabel, buildPoolOptions, shouldSendPool, poolNotice } = spec;

    // ── 1. «No lo toques» y «quitar la asignación» ───────────────────
    grupo('1. ⚠️ undefined y \'\' significan cosas distintas');

    check('undefined NO viaja: el servidor no toca la activación', shouldSendPool(undefined) === false);
    check('null tampoco', shouldSendPool(null) === false);
    check('\'\' SÍ viaja: es «quitar la asignación»', shouldSendPool(SIN_ASIGNAR) === true);
    check('un id SÍ viaja', shouldSendPool('pool-1') === true);
    eq('«sin asignar» es la cadena vacía, que es lo que el servidor lee como falsy', SIN_ASIGNAR, '');

    // Es la razón de ser de la distinción: JSON.stringify omite las claves
    // `undefined`, así que dejarlo sin definir es lo que hace que la petición
    // ni mencione el campo.
    check('JSON.stringify omite la clave cuando es undefined',
        JSON.stringify({ registrarPoolId: undefined, otro: 1 }) === '{"otro":1}');
    check('y la incluye cuando es cadena vacía',
        JSON.stringify({ registrarPoolId: '' }) === '{"registrarPoolId":""}');

    // ── 2. El catálogo que llega del endpoint ────────────────────────
    grupo('2. Lo que devuelva el endpoint no puede tumbar el formulario');

    const CRUDO = { pools: [
        { id: 'p1', registrarName: 'Club Origen', totalUnits: 3, activeUnits: 1, costPerUnit: 12, currency: 'USD' },
        { id: 'p2', registrarName: 'Club Pasto', totalUnits: 2, activeUnits: 2 },
    ] };

    eq('lee la forma { pools: [...] }', normalizePools(CRUDO).map(p => p.id), ['p1', 'p2']);
    eq('y también un array pelado', normalizePools(CRUDO.pools).map(p => p.id), ['p1', 'p2']);
    eq('una respuesta que no es lista da vacío', normalizePools({ error: 'nope' }), []);
    eq('null da vacío', normalizePools(null), []);
    eq('undefined da vacío', normalizePools(undefined), []);
    eq('una fila sin id se descarta', normalizePools([{ registrarName: 'x' }]), []);
    eq('un id repetido entra una vez', normalizePools([{ id: 'p1' }, { id: 'p1' }]).length, 1);
    eq('un total que no es número cae en 0', poolCapacity(normalizePools([{ id: 'p1', totalUnits: 'tres' }])[0]).total, 0);

    // ── 3. El cupo se DERIVA ─────────────────────────────────────────
    grupo('3. El cupo sale de las dos cifras primitivas, no de un tercer campo');

    const [p1, p2] = normalizePools(CRUDO);
    eq('quedan 2 de 3', poolCapacity(p1), { total: 3, active: 1, available: 2, full: false });
    eq('2 de 2 es sin cupo', poolCapacity(p2), { total: 2, active: 2, available: 0, full: true });

    // ⚠️ Se ignora `availableUnits` del servidor a propósito: con dos fuentes,
    // el número del aviso podría contradecir al «2/3» del propio rótulo.
    const mentiroso = normalizePools([{ id: 'p3', totalUnits: 3, activeUnits: 3, availableUnits: 99 }])[0];
    eq('un availableUnits incoherente no manda', poolCapacity(mentiroso).available, 0);
    check('y sigue marcado sin cupo', poolCapacity(mentiroso).full === true);

    // Por encima de la capacidad no se devuelve un disponible negativo.
    eq('4 de 3 no da disponible negativo', poolCapacity(normalizePools([{ id: 'x', totalUnits: 3, activeUnits: 4 }])[0]).available, 0);

    eq('el rótulo lleva el nombre y el cupo', poolLabel(p1), 'POOL #p1 · Club Origen (1/3 dominios)');
    check('un pool sin club se nombra igual', poolLabel(normalizePools([{ id: 'zzz' }])[0]).includes('Pool sin club'));

    // ── 4. El valor actual siempre es una opción ─────────────────────
    grupo('4. El pool asignado siempre se puede representar');

    const pools = normalizePools(CRUDO);

    const sinNada = buildPoolOptions(pools, '');
    eq('sin asignación, las opciones son las del catálogo', sinNada.map(o => o.id), ['p1', 'p2']);
    check('ninguna marcada como actual', sinNada.every(o => !o.current));

    const conP2 = buildPoolOptions(pools, 'p2');
    check('el asignado queda marcado', conP2.find(o => o.id === 'p2').current === true);
    check('aunque esté sin cupo, sigue en la lista', conP2.some(o => o.id === 'p2' && o.full));

    // ⚠️ Sin esto el `select` se pintaría vacío y el primer guardado movería la
    // asignación sin que nadie lo pidiera.
    const huerfano = buildPoolOptions(pools, 'p-borrado');
    check('un pool que ya no está en el catálogo entra igual', huerfano.some(o => o.id === 'p-borrado'));
    check('y se marca como ausente', huerfano.find(o => o.id === 'p-borrado').missing === true);
    eq('no se duplica el catálogo', huerfano.length, 3);

    check('con undefined no se inventa una opción', buildPoolOptions(pools, undefined).length === 2);
    check('con espacios en blanco tampoco', buildPoolOptions(pools, '   ').length === 2);

    // ── 5. Se avisa; no se bloquea ───────────────────────────────────
    grupo('5. Sin cupo se avisa, y se puede asignar igual');

    eq('sin elección no hay aviso', poolNotice(conP2, '', 'rye4281.org'), null);
    eq('un pool con cupo y con dominio no avisa nada', poolNotice(conP2, 'p1', 'rye4281.org'), null);
    eq('un pool lleno avisa', poolNotice(conP2, 'p2', 'rye4281.org').kind, 'full');
    check('y el aviso dice el cupo concreto', poolNotice(conP2, 'p2', 'x.org').text.includes('2/2'));
    eq('un pool ausente avisa', poolNotice(huerfano, 'p-borrado', 'x.org').kind, 'missing');
    eq('sin dominio propio se dice', poolNotice(conP2, 'p1', '').kind, 'sin_dominio');
    eq('y con el dominio en blanco también', poolNotice(conP2, 'p1', '   ').kind, 'sin_dominio');

    // El aviso del pool ausente pesa más que el de «sin dominio»: es el que
    // puede hacer perder la asignación.
    eq('lo ausente manda sobre lo del dominio', poolNotice(huerfano, 'p-borrado', '').kind, 'missing');

    check('ningún aviso declara que bloquea',
        ['full', 'missing'].every(k => {
            const t = (k === 'full' ? poolNotice(conP2, 'p2', 'x.org') : poolNotice(huerfano, 'p-borrado', 'x.org')).text;
            return !/no se puede asignar|bloquead|prohibid/i.test(t);
        }));
}

// ════════════════════════════════════════════════════════════════════
grupo('6. La opción existe donde se pidió');

for (const p of TODAS) {
    const src = leer(`src/pages/admin/${p}.tsx`);
    check(`${p} usa el selector de pool`, src.includes('<RegistrarPoolPicker'), 'no lo monta');
    check(`${p} lo importa del componente compartido`,
        src.includes("from '../../components/admin/RegistrarPoolPicker'"));
}

// ⚠️ La casilla de distritos ya pasó por esto: escrita cinco veces, las copias
// se separaron en silencio y hubo que unificarlas (v4.748). Acá el precio de
// que se separen es una activación de facturación.
for (const p of TODAS) {
    const src = leer(`src/pages/admin/${p}.tsx`);
    check(`${p} no reescribe el selector a mano`,
        !src.includes('Pool Registrador del Dominio'),
        'volvió a aparecer el rótulo escrito a mano en la pantalla');
}

const picker = leer('src/components/admin/RegistrarPoolPicker.tsx');
check('el componente es el único que consulta el catálogo de pools',
    picker.includes('/admin/crowdfund/pools'));
check('y ninguna pantalla lo consulta por su cuenta',
    TODAS.every(p => !leer(`src/pages/admin/${p}.tsx`).includes('crowdfund/pools')));

// ════════════════════════════════════════════════════════════════════
grupo('7. ⚠️ No se borra una activación sin que nadie lo pida');

for (const p of TODAS) {
    const src = leer(`src/pages/admin/${p}.tsx`);
    // Al abrir la ficha de un sitio existente, el pool NO se sabe todavía.
    check(`${p} abre la edición sin dar el pool por conocido`,
        /registrarPoolId: undefined/.test(src),
        'debería quedar `undefined` hasta que llegue el detalle');
    // El listado no trae el dato: leerlo de la fila y caer en '' es el borrado.
    check(`${p} no lo lee de la fila del listado`,
        !/registrarPoolId: club\.registrarPoolId/.test(src),
        '`GET /admin/clubs` nunca lo devuelve: siempre caería en «sin asignar»');
    // Del detalle sí.
    check(`${p} lo toma del detalle`,
        /registrarPoolId: fullData\.registrarPoolId/.test(src));
}

// ════════════════════════════════════════════════════════════════════
grupo('8. Asignar un pool es del operador de la plataforma');

const ctrl = leer('server/controllers/clubController.js');
check('la asignación exige rol de operador',
    /puedeAsignarPool\s*=\s*req\.user\.role === 'administrator'/.test(ctrl));
check('y la escritura de la activación va condicionada a eso',
    /registrarPoolId !== undefined && puedeAsignarPool/.test(ctrl));
check('el servidor sigue distinguiendo «no lo toques» de «quitar»',
    ctrl.includes('registrarPoolId !== undefined'),
    'sin esa comprobación, no mandar el campo borraría la activación');

// ════════════════════════════════════════════════════════════════════
grupo('9. El distrito se ve al abrir la ficha');

// Se reportó con la ficha delante: los distritos aparecían todos sin marcar en
// un sitio que sí los tiene. `district` estaba en el estado inicial y en el
// JSX, pero faltaba en los dos `setFormData` de `handleOpenModal`.
for (const p of PANTALLAS) {
    const src = leer(`src/pages/admin/${p}.tsx`);
    check(`${p} carga el distrito guardado al editar`,
        /district: club\.district \|\| ''/.test(src),
        'el DistrictPicker se pintaría vacío aunque el sitio tenga distritos');
    check(`${p} monta el selector de distritos`, src.includes('<DistrictPicker'));
}

// ════════════════════════════════════════════════════════════════════
console.log(`\n${ok} comprobaciones pasaron.`);
if (malos.length) {
    console.log(`${malos.length} fallaron:`);
    for (const m of malos) console.log(`  · ${m}`);
    process.exit(1);
}
if (!spec) console.log('  (el bloque del criterio no corrió: instalá esbuild con `npm i --no-save esbuild`)');
console.log('Un sitio puede recibir su pool desde su propia ficha, y nada se borra solo.');
