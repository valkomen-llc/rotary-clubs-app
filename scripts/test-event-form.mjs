// ════════════════════════════════════════════════════════════════════
// Formulario de inscripción a un evento — pruebas del CRITERIO — v4.708
//
// No necesitan base, credenciales ni red: prueban las decisiones —qué campos
// se piden, de dónde salen las listas, qué se valida y con qué nace el
// formulario—, separadas de la orquestación, por el mismo motivo que
// `seoRules.js` vive aparte de `seoAudit.js` y que `test:reels:people` prueba
// `buildPeopleReport` y no el controlador.
//
//   npm run test:event-form
// ════════════════════════════════════════════════════════════════════
import {
    buildFormSchema, flattenFields, validateAnswers, defaultAnswersFor,
    optionsForField, rotaryCatalogFor, clubContradictsDistrict,
    FAIR_ROLES, COUNTRY_WITH_DIVISIONS, normalizeCategory,
} from '../server/lib/eventRegistrationSpec.js';
import { DISTRICT_CATALOG } from '../server/lib/rotaryClubs.js';

let pasadas = 0;
const fallos = [];
const check = (nombre, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ✓ ${nombre}`); }
    else { fallos.push(nombre); console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};
const grupo = (t) => console.log(`\n${t}`);

const categoria = (key, extra = {}) => normalizeCategory({
    key, name: key, price: 100, currency: 'USD', ...extra,
});
const NACIONAL = categoria('registro_nacional', { audience: 'national' });
const INTERNACIONAL = categoria('registro_internacional', { audience: 'international' });
const CADRE = categoria('registro_cadres', { audience: 'cadre' });
const CATALOGOS = { districts: rotaryCatalogFor({}) };

const claves = (cat) => flattenFields(cat).map(f => f.key);
const paso1 = (cat) => buildFormSchema(cat).steps.find(s => s.key === 'personal');

// ── 1. Los campos nuevos están en el paso 1, en las tres categorías ──
grupo('Los seis campos nuevos, en el paso de Datos personales');
for (const [nombre, cat] of [['nacional', NACIONAL], ['internacional', INTERNACIONAL], ['CADRE', CADRE]]) {
    const enPaso1 = paso1(cat).fields.map(f => f.key);
    check(`${nombre}: país, departamento y ciudad`,
        ['country', 'department', 'city'].every(k => enPaso1.includes(k)),
        enPaso1.join(', '));
    check(`${nombre}: distrito, club y rol en la feria`,
        ['district', 'clubName', 'fairRole'].every(k => enPaso1.includes(k)));
    check(`${nombre}: el distrito va ANTES que el club`,
        enPaso1.indexOf('district') < enPaso1.indexOf('clubName'));
    check(`${nombre}: los seis son obligatorios`,
        ['country', 'department', 'city', 'district', 'clubName', 'fairRole']
            .every(k => paso1(cat).fields.find(f => f.key === k)?.required === true));
}

grupo('Los grupos del paso 1');
const grupos = paso1(NACIONAL).groups.map(g => g.key);
check('hay tres bloques: básicos, ubicación y club',
    JSON.stringify(grupos) === JSON.stringify(['basic', 'location', 'rotary']), grupos.join(', '));
check('`fields` sigue trayendo todo aplanado, para un navegador anterior',
    paso1(NACIONAL).fields.length === paso1(NACIONAL).groups.reduce((n, g) => n + g.fields.length, 0));
check('y en el mismo orden que los grupos',
    paso1(NACIONAL).fields[0].key === 'firstName'
    && paso1(NACIONAL).fields.at(-1).key === 'fairRoleOther');

// ── 2. El rol de feria reemplaza al cargo en Rotary ──────────────────
grupo('Rol dentro de la feria');
check('el cargo dentro de Rotary ya no se pide', !claves(NACIONAL).includes('rotaryRole'));
check('el rol en la feria sí', claves(NACIONAL).includes('fairRole'));
check('con las quince opciones del catálogo', FAIR_ROLES.length === 15);
check('«Otro» va de última', FAIR_ROLES.at(-1).value === 'otro');
check('«Otro» pide escribir cuál',
    validateAnswers(NACIONAL, { ...completo(), fairRole: 'otro', fairRoleOther: '' }).errors.fairRoleOther !== undefined);
check('y con cualquier otro rol no se pregunta',
    validateAnswers(NACIONAL, { ...completo(), fairRole: 'expositor', fairRoleOther: '' }).ok === true);

// ── 3. Escenario nacional ────────────────────────────────────────────
grupo('Escenario nacional (Colombia)');
check('el formulario nace con Colombia puesta',
    defaultAnswersFor(NACIONAL).country === COUNTRY_WITH_DIVISIONS);
const campoDep = flattenFields(NACIONAL).find(f => f.key === 'department');
const conColombia = { country: 'Colombia' };
check('el departamento se ofrece como lista',
    (optionsForField(campoDep, conColombia, { ...CATALOGOS, departments: ['Cesar', 'Antioquia'] }) || []).length === 2);
const campoDist = flattenFields(NACIONAL).find(f => f.key === 'district');
const distritos = optionsForField(campoDist, conColombia, CATALOGOS) || [];
check('el distrito se ofrece como lista de dos', distritos.length === 2,
    distritos.map(d => d.value).join(', '));
check('con los distritos 4271 y 4281',
    distritos.map(d => d.value).join(',') === '4271,4281');

const campoClub = flattenFields(NACIONAL).find(f => f.key === 'clubName');
check('sin distrito elegido, el club se escribe a mano',
    optionsForField(campoClub, {}, CATALOGOS) === null);
const clubes4271 = optionsForField(campoClub, { district: '4271' }, CATALOGOS) || [];
const clubes4281 = optionsForField(campoClub, { district: '4281' }, CATALOGOS) || [];
check('elegido el 4271 se ofrecen SÓLO sus clubes',
    clubes4271.length === DISTRICT_CATALOG[0].clubs.length && clubes4271.length > 0,
    String(clubes4271.length));
check('elegido el 4281 se ofrecen SÓLO los suyos',
    clubes4281.length === DISTRICT_CATALOG[1].clubs.length && clubes4281.length > 0,
    String(clubes4281.length));
check('y las dos listas son distintas',
    clubes4271[0].value !== clubes4281[0].value);

// ── 4. Escenario internacional ───────────────────────────────────────
grupo('Escenario internacional');
check('no se presume ningún país', Object.keys(defaultAnswersFor(INTERNACIONAL)).length === 0);
check('ni para CADRES', Object.keys(defaultAnswersFor(CADRE)).length === 0);
const fuera = { country: 'Italia' };
check('fuera de Colombia el departamento es texto libre',
    optionsForField(campoDep, fuera, { ...CATALOGOS, departments: ['Cesar'] }) === null);
check('el distrito también, aunque el catálogo colombiano exista',
    optionsForField(campoDist, fuera, CATALOGOS) === null);
check('y sin país declarado tampoco se presume la lista colombiana',
    optionsForField(campoDist, {}, CATALOGOS) === null);
check('y el club también',
    optionsForField(campoClub, { ...fuera, district: 'District 6960' }, CATALOGOS) === null);
check('un internacional que SÍ vive en Colombia recupera la lista',
    (optionsForField(campoDist, { country: 'Colombia' }, CATALOGOS) || []).length === 2);
check('«District 6960» se acepta tal cual',
    validateAnswers(INTERNACIONAL, { ...completoIntl(), district: 'District 6960', clubName: 'Rotary Club of Miami' }).ok === true);
check('el país de residencia ya no se pregunta dos veces',
    !claves(INTERNACIONAL).includes('residenceCountry'));

// ── 5. Coherencia distrito ↔ club ────────────────────────────────────
grupo('Coherencia entre distrito y club');
const unClub4271 = DISTRICT_CATALOG[0].clubs[0];
const unClub4281 = DISTRICT_CATALOG[1].clubs[0];
check('un club de su propio distrito pasa',
    clubContradictsDistrict('4271', unClub4271, CATALOGOS) === false);
check('un club del OTRO distrito se rechaza',
    clubContradictsDistrict('4271', unClub4281, CATALOGOS) === true);
check('un club que no figura en ningún catálogo se acepta',
    clubContradictsDistrict('4271', 'Rotary Club de Marte', CATALOGOS) === false);
check('un club internacional con distrito escrito a mano se acepta',
    clubContradictsDistrict('District 6960', 'Rotary Club of Miami', CATALOGOS) === false);
check('sin distrito no se juzga nada',
    clubContradictsDistrict('', unClub4281, CATALOGOS) === false);
check('la validación completa lo reporta en el campo del club',
    validateAnswers(NACIONAL, { ...completo(), district: '4271', clubName: unClub4281 })
        .errors.clubName !== undefined);

// ── 6. La lista NO cierra los valores aceptados ──────────────────────
grupo('Las listas ayudan a escribir; no cierran');
check('un departamento fuera de la lista se acepta',
    validateAnswers(NACIONAL, { ...completo(), department: 'Provincia de Cádiz' }).ok === true);
check('un club nuevo, que aún no está en el catálogo, se acepta',
    validateAnswers(NACIONAL, { ...completo(), clubName: 'Rotary Club Valledupar Norte' }).ok === true);
check('pero un rol de feria inventado NO: esa lista sí es cerrada',
    validateAnswers(NACIONAL, { ...completo(), fairRole: 'astronauta' }).ok === false);

// ── 7. Obligatoriedad ────────────────────────────────────────────────
grupo('Obligatoriedad');
for (const campo of ['country', 'department', 'city', 'district', 'clubName', 'fairRole']) {
    const respuestas = { ...completo(), [campo]: '' };
    check(`falta ${campo} → no se avanza`, validateAnswers(NACIONAL, respuestas).errors[campo] !== undefined);
}
check('una categoría que no exige club no obliga a distrito ni club',
    validateAnswers(categoria('x', { audience: 'general', requireClub: false }),
        { ...completo(), district: '', clubName: '' }).ok === true);

// ── 8. Pasos ─────────────────────────────────────────────────────────
grupo('Pasos del asistente');
const pasosNac = buildFormSchema(NACIONAL).steps.map(s => s.key);
check('el nacional ya no tiene un paso rotario vacío',
    !pasosNac.includes('rotary'), pasosNac.join(', '));
check('el internacional conserva el suyo, rotulado por lo que pide',
    buildFormSchema(INTERNACIONAL).steps.find(s => s.key === 'rotary')?.label === 'Viaje y estadía');
check('y CADRES el suyo',
    buildFormSchema(CADRE).steps.find(s => s.key === 'rotary')?.label === 'Experiencia técnica');
check('todos terminan en necesidades', pasosNac.at(-1) === 'needs');

// ── 9. El catálogo se puede fijar por evento ─────────────────────────
grupo('Catálogo por edición');
const propio = rotaryCatalogFor({
    rotaryCatalog: { districts: [{ value: '9999', label: 'Distrito 9999', clubs: ['Rotary Club Prueba'] }] },
});
check('una edición puede traer sus propios distritos', propio.length === 1 && propio[0].value === '9999');
check('una lista vacía se respeta: se escribe a mano',
    rotaryCatalogFor({ rotaryCatalog: { districts: [] } }).length === 0);
check('sin configuración se usa el catálogo del sitio',
    rotaryCatalogFor({}).length === DISTRICT_CATALOG.length);

// ── Respuestas completas de referencia ───────────────────────────────
function completo() {
    return {
        firstName: 'Ana', lastName: 'Ríos', email: 'ana@correo.com', phone: '+573001112233',
        documentType: 'cedula', documentNumber: '52123456',
        country: 'Colombia', department: 'Cesar', city: 'Valledupar',
        district: '4281', clubName: DISTRICT_CATALOG[1].clubs[0], fairRole: 'visitante_rotario',
        dietary: 'ninguna', acceptTerms: true,
    };
}
function completoIntl() {
    return {
        ...completo(),
        country: 'Estados Unidos', department: 'Florida', city: 'Miami',
        arrivalDate: '2027-03-11', departureDate: '2027-03-14',
        lodging: 'sede', preferredLanguage: 'en', needsVisa: 'no',
        emergencyName: 'John Doe', emergencyPhone: '+13050000000',
    };
}

console.log(`\n${pasadas}/${pasadas + fallos.length} comprobaciones OK`);
if (fallos.length) {
    console.log(`\nFallaron:\n${fallos.map(f => `  - ${f}`).join('\n')}`);
    process.exit(1);
}
