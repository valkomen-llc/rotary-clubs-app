/**
 * v4.707 — El catálogo de clubes de los distritos 4271 y 4281.
 *
 * Lo que se comprueba: que la lista entregada por el Distrito llegó COMPLETA,
 * que la semilla no pisa lo que edite el administrador, y que la ortografía
 * quedó como se pidió (mayúscula inicial y tildes).
 */
process.env.DATABASE_URL = 'postgresql://postgres@localhost:55432/postgres?sslmode=disable&host=/home/pgtest/run';

const { CLUBS_4271, CLUBS_4281, seedDistrictClubs, districtNumberOf } = await import('../server/lib/rotaryClubs.js');
const mod = await import('../server/controllers/projectFairController.js');

let ok = 0, fail = 0;
const check = (nombre, cond, detalle = '') => {
    if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
    else { fail++; console.log(`  ✗ ${nombre}${detalle ? `\n      ${detalle}` : ''}`); }
};

console.log('\n── El catálogo llegó completo ──');
check('el 4271 tiene los 59 clubes entregados', CLUBS_4271.length === 59, `recibido: ${CLUBS_4271.length}`);
check('el 4281 tiene los 74 clubes entregados', CLUBS_4281.length === 74, `recibido: ${CLUBS_4281.length}`);
check('no hay duplicados en el 4271', new Set(CLUBS_4271).size === CLUBS_4271.length);
check('no hay duplicados en el 4281', new Set(CLUBS_4281).size === CLUBS_4281.length);
check('ningún nombre viene vacío ni con espacios de sobra',
    [...CLUBS_4271, ...CLUBS_4281].every(c => c && c === c.trim()));

console.log('\n── Ortografía: mayúscula inicial y tildes ──');
const sostenida = [...CLUBS_4271, ...CLUBS_4281].filter(c =>
    // Una palabra de 3+ LETRAS toda en mayúsculas que no sea número romano.
    // Se exige que tenga letras: «4281» son dígitos y coinciden con su propia
    // mayúscula, así que sin este filtro «Conexión Colombia Distrito 4281»
    // saldría acusado de estar en mayúsculas sostenidas.
    c.split(' ').some(p => /\p{L}{3}/u.test(p) && p === p.toUpperCase() && !/^[IVX]+$/.test(p)));
check('ningún club quedó en mayúsculas sostenidas', sostenida.length === 0, `quedaron: ${sostenida.join(', ')}`);

// Los nombres que DEBEN llevar tilde, con su forma correcta.
const CON_TILDE = [
    'Ciénaga', 'Cúcuta', 'Cúcuta Ciudad de Árboles', 'Cúcuta II', 'El Cerrejón',
    'Envigado Ayurá', 'Itagüí', 'Itagüí Santamaría', 'Magangué', 'Medellín',
    'Montería', 'Montería Ronda del Sinú', 'Nuevo Itagüí', 'Nuevo Medellín',
    'Ocaña Primaveral', 'San José de Cúcuta', 'San Luis de Sincé', 'Urabá',
];
const faltantes = CON_TILDE.filter(c => !CLUBS_4271.includes(c));
check('el 4271 lleva sus tildes', faltantes.length === 0, `faltan: ${faltantes.join(', ')}`);

const CON_TILDE_81 = [
    'Bogotá', 'Bogotá Chicó', 'Bogotá Santa Bárbara', 'Bogotá Usaquén',
    'Buenaventura Pacífico', 'Catedral de Sal de Zipaquirá', 'Conexión Colombia Distrito 4281',
    'Facatativá', 'Fusagasugá', 'Ibagué', 'Nuevo Ibagué', 'Pereira del Café',
    'Pereira Perla del Otún', 'Popayán', 'San Andrés Isla', 'Santa Fe de Bogotá',
    'Soatá', 'Supatá', 'Tuluá', 'Tuluá El Lago',
];
const faltantes81 = CON_TILDE_81.filter(c => !CLUBS_4281.includes(c));
check('el 4281 lleva sus tildes', faltantes81.length === 0, `faltan: ${faltantes81.join(', ')}`);

check('las preposiciones internas van en minúscula',
    CLUBS_4271.includes('Cartagena de Indias') && CLUBS_4271.includes('Villa del Rosario')
    && CLUBS_4281.includes('Villa de Leyva y el Alto Ricaurte'));
check('los números romanos se conservan en mayúsculas',
    CLUBS_4271.includes('Cúcuta II') && CLUBS_4271.includes('Cúcuta III') && CLUBS_4271.includes('Montería II'));
check('«E-Club» se escribe así, no «E-CLUB» ni «E-club»',
    CLUBS_4271.includes('E-Club Colombia Innova') && CLUBS_4281.includes('E-Club Origen'));

console.log('\n── Se reconoce el distrito por su número ──');
check('«Rotary Distrito 4271»', districtNumberOf('Rotary Distrito 4271') === 4271);
check('«Distrito 4281», sin la palabra Rotary', districtNumberOf('Distrito 4281') === 4281);
check('«D-4271»', districtNumberOf('D-4271') === 4271);
check('un distrito sin catálogo devuelve null', districtNumberOf('Rotary Distrito 4400') === null);
check('un texto sin número devuelve null', districtNumberOf('Rotary Distrito Norte') === null);

console.log('\n── La semilla NO pisa lo que edite el administrador ──');
const sinCampo = seedDistrictClubs([{ value: 'Rotary Distrito 4271', label: 'Rotary Distrito 4271' }]);
check('un distrito que nunca tuvo lista recibe el catálogo', sinCampo[0].clubs.length === 59);

const vaciada = seedDistrictClubs([{ value: 'Rotary Distrito 4271', label: 'Rotary Distrito 4271', clubs: [] }]);
check('una lista VACIADA a propósito se respeta: no se refilla', vaciada[0].clubs.length === 0);

const propia = seedDistrictClubs([{ value: 'Rotary Distrito 4281', label: 'Rotary Distrito 4281', clubs: ['Solo Este'] }]);
check('una lista editada a mano se respeta',
    JSON.stringify(propia[0].clubs) === JSON.stringify(['Solo Este']));

const ajeno = seedDistrictClubs([{ value: 'Rotary Distrito 4400', label: 'Rotary Distrito 4400' }]);
check('un distrito sin catálogo se queda sin lista → club a mano', ajeno[0].clubs === undefined);

console.log('\n── De punta a punta, leyendo la convocatoria de la base ──');
const db = (await import('../server/lib/db.js')).default;
await mod.ensureTables();
const EVT = 'evt-catalogo-test';
await db.query('DELETE FROM "ProjectFairConfig" WHERE "eventId" = $1', [EVT]);
// Una convocatoria como la de producción: distritos SIN el campo `clubs`.
await db.query(
    `INSERT INTO "ProjectFairConfig" (key, "eventId", config) VALUES ('edition:'||$1, $1, $2::jsonb)`,
    [EVT, JSON.stringify({ districts: [
        { value: 'Rotary Distrito 4271', label: 'Rotary Distrito 4271' },
        { value: 'Rotary Distrito 4281', label: 'Rotary Distrito 4281' },
    ] })],
);
const cfg = await mod.readConfigForSubmission(EVT);
check('el formulario recibe los 59 del 4271 sin que nadie los cargue a mano',
    mod.clubsOfDistrict(cfg, 'Rotary Distrito 4271').length === 59,
    `recibido: ${mod.clubsOfDistrict(cfg, 'Rotary Distrito 4271').length}`);
check('y los 74 del 4281',
    mod.clubsOfDistrict(cfg, 'Rotary Distrito 4281').length === 74,
    `recibido: ${mod.clubsOfDistrict(cfg, 'Rotary Distrito 4281').length}`);
check('con las tildes puestas', mod.clubsOfDistrict(cfg, 'Rotary Distrito 4281').includes('Bogotá Usaquén'));

// Y ahora el administrador guarda su propia versión: la semilla se retira.
await db.query('UPDATE "ProjectFairConfig" SET config = $2::jsonb WHERE "eventId" = $1', [EVT,
    JSON.stringify({ districts: [{ value: 'Rotary Distrito 4271', label: 'Rotary Distrito 4271', clubs: ['Barranquilla'] }] })]);
const editada = await mod.readConfigForSubmission(EVT);
check('guardada la lista del administrador, la semilla ya no entra',
    JSON.stringify(mod.clubsOfDistrict(editada, 'Rotary Distrito 4271')) === JSON.stringify(['Barranquilla']),
    `recibido: ${JSON.stringify(mod.clubsOfDistrict(editada, 'Rotary Distrito 4271'))}`);

await db.query('DELETE FROM "ProjectFairConfig" WHERE "eventId" = $1', [EVT]);
console.log(`\n${fail ? '✗' : '✓'} ${ok} pasaron, ${fail} fallaron`);
process.exit(fail ? 1 : 0);
