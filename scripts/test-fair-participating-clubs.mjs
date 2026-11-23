// ════════════════════════════════════════════════════════════════════
// test:fair:participating-clubs — «Clubes participantes» en la Formulación
// (v4.1346), sin base ni red. Corre en `prebuild`.
//
// Caso: Paula Cruz (Pereira del Café) formula su proyecto con Pereira,
// Pereira del Otún y Pereira Nuevo, y la ficha sólo nombraba a su club.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    DEFAULT_MASTER_FORM, PARTICIPATING_CLUBS_FIELD, ensureParticipatingClubsField, dropRetiredBudgetRows,
} from '../server/lib/projectFairMasterForm.js';
import { FIELD_TYPES, hasValue, validateAnswers, completionOf, MAX_CLUBS_PER_FIELD } from '../server/lib/projectFormEngine.js';
import D from '../server/lib/projectDossier.js';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const ident = (form) => form.sections.find(s => s.key === 'identificacion');

console.log('\n1. La plantilla');
ok('el tipo «clubs» existe en el motor', FIELD_TYPES.includes('clubs'));
const keys = ident(DEFAULT_MASTER_FORM).fields.map(f => f.key);
ok('«Clubes participantes» está en «Identificación del proyecto», después del distrito', keys.indexOf('participatingClubs') === keys.indexOf('district') + 1);
ok('es OPCIONAL (no cambia el avance de nadie)', PARTICIPATING_CLUBS_FIELD.required === false && PARTICIPATING_CLUBS_FIELD.type === 'clubs');

console.log('\n2. La copia guardada de la convocatoria (la trampa de v4.788, al revés)');
const vieja = { ...DEFAULT_MASTER_FORM, sections: DEFAULT_MASTER_FORM.sections.map(s => (s.key === 'identificacion' ? { ...s, fields: s.fields.filter(f => f.key !== 'participatingClubs') } : s)) };
const reparada = ensureParticipatingClubsField(vieja);
const rk = ident(reparada).fields.map(f => f.key);
ok('una copia guardada SIN el campo lo recibe al leer, en su lugar', rk.includes('participatingClubs') && rk.indexOf('participatingClubs') === rk.indexOf('district') + 1);
ok('las demás secciones no se tocan (misma referencia)', reparada.sections.filter(s => s.key !== 'identificacion').every((s, i) => vieja.sections.filter(x => x.key !== 'identificacion')[i] === s));
ok('con el campo ya presente devuelve la MISMA referencia', ensureParticipatingClubsField(DEFAULT_MASTER_FORM) === DEFAULT_MASTER_FORM);
ok('sin «identificacion» no inventa una sección', (() => { const f = { sections: [{ key: 'otra', fields: [] }] }; return ensureParticipatingClubsField(f) === f; })());
ok('sin distrito, va al final de la sección', (() => { const f = { sections: [{ key: 'identificacion', fields: [{ key: 'clubName' }] }] }; return ensureParticipatingClubsField(f).sections[0].fields.at(-1).key === 'participatingClubs'; })());
ok('convive con la limpieza del presupuesto', ensureParticipatingClubsField(dropRetiredBudgetRows(vieja)).sections.length === vieja.sections.length);
const fc = read('server/controllers/projectFairController.js');
ok('normalizeSavedConfig lo aplica al leer (sin escribir en la base)', /const conClubes = ensureParticipatingClubsField\(out\.masterForm\);/.test(fc));

console.log('\n3. Las respuestas');
const tpl = DEFAULT_MASTER_FORM;
const conClubes = (list) => ({ identificacion: { participatingClubs: list } });
const problems = (list) => validateAnswers(tpl, conClubes(list)).filter(p => p.key === 'participatingClubs');
ok('cuatro clubes de Pereira: válido', problems(['Pereira', 'Pereira del Otún', 'Pereira del Café', 'Pereira Nuevo']).length === 0);
ok('un club repetido se rechaza (sin importar mayúsculas)', problems(['Pereira', 'pereira']).length === 1);
ok(`más de ${MAX_CLUBS_PER_FIELD} se rechaza`, problems(Array.from({ length: 13 }, (_, i) => `Club ${i}`)).length === 1);
ok('un texto suelto (no lista) se rechaza', problems('Pereira').length === 1);
ok('lista vacía = sin responder', !hasValue([], 'clubs') && !hasValue(['  '], 'clubs') && hasValue(['Pereira'], 'clubs'));
ok('agregar clubes no cambia el avance (el campo es opcional)', completionOf(tpl, {}) === completionOf(tpl, conClubes(['Pereira'])));

console.log('\n4. Expediente, Word y PDF');
const field = { ...PARTICIPATING_CLUBS_FIELD, path: 'master.identificacion.participatingClubs' };
const { coerceValue } = await import('../server/lib/projectDossier.js');
const coerce = coerceValue(field, ['Pereira', ' Pereira ', 'Pereira del Otún']);
ok('la edición del comité guarda la lista sin repetidos', coerce.ok && JSON.stringify(coerce.value) === JSON.stringify(['Pereira', 'Pereira del Otún']));
ok('la ficha no la manda a traducir (son nombres)', !D.isTranslatableField(PARTICIPATING_CLUBS_FIELD));
ok('el Word la escribe separada por comas', /field\?\.type === 'multiselect' \|\| field\?\.type === 'clubs'/.test(read('server/lib/projectFairDocx.js')));
const pdf = read('src/lib/projectDossierPdf.ts');
ok('la portada de las fichas nombra a los clubes participantes', (pdf.match(/const who = coverIdentityOf\(p\)/g) || []).length === 2 && (pdf.match(/Clubes participantes/g) || []).length >= 2);
const ff = read('src/components/project-forms/FormFields.tsx');
ok('el formulario lo dibuja con el selector del Catálogo Maestro', /field\.type === 'clubs' \? \(\s*<ClubsField/.test(ff) && /ClubSelector/.test(read('src/components/project-forms/ClubsField.tsx')));
ok('la pantalla y el servidor usan el mismo tope', /MAX_CLUBS_PER_FIELD = 12/.test(read('src/lib/projectForms.ts')) && MAX_CLUBS_PER_FIELD === 12);

// v4.1353 — El módulo real del PDF, empaquetado con esbuild (el de Vite),
// para probar su comportamiento y no sólo su texto.
console.log('\n5. La ficha en PDF (v4.1353, caso Paula Cruz: «aún no salen los 4 clubes» y «me sale el doble»)');
const { build } = await import('esbuild');
const bundle = await build({ entryPoints: [new URL('../src/lib/projectDossierPdf.ts', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', logLevel: 'silent' });
const P = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const fichaDe = (fields) => ({ clubName: 'Pereira del Café', es: { groups: [{ sections: [{ fields }] }] } });
ok('con el campo de la lista: esos clubes, sin repetir el que postula',
    JSON.stringify(P.participatingClubsOf(fichaDe([{ path: 'master.identificacion.participatingClubs', value: ['Pereira', 'Pereira del Café', 'Pereira Nuevo'] }]))) === JSON.stringify(['Pereira', 'Pereira Nuevo']));
// v4.1354 — En un texto con varios clubes, el PRIMERO es el principal; el
// club del registro y los demás van a los participantes.
const enTexto = P.coverIdentityOf(fichaDe([
    { path: 'master.identificacion.participatingClubs', value: [] },
    { path: 'master.identificacion.clubName', value: 'Pereira Perla del Otún, Pereira, Club Rotario Pereira del Café y Pereira Nuevo' },
]));
ok('los clubes escritos en el texto «Club Rotario» de la Formulación también van a la portada (el primero, como principal)',
    enTexto.clubName === 'Pereira Perla del Otún' && JSON.stringify(enTexto.participating) === JSON.stringify(['Pereira del Café', 'Pereira', 'Pereira Nuevo']));
ok('«C.R.», «Club Rotario» y las tildes no duplican un club', P.participatingClubsOf(fichaDe([
    { path: 'master.identificacion.participatingClubs', value: ['Pereira del Otún'] },
    { path: 'master.identificacion.clubName', value: 'Club Rotario Pereira del Cafe' },
    { path: 'fdd_2026_2027.club.clubName', value: 'C.R. Pereira del Otun' },
])).length === 1);
ok('un solo club en el texto (el que postula) no agrega nada', P.participatingClubsOf(fichaDe([{ path: 'master.identificacion.clubName', value: 'Rotary Club Pereira del Café' }])).length === 0);
const esTotal = (s) => P.TOTAL_ROW_RE.test(String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9$]+/g, ' ').trim());
ok('una fila «total» / «TOTAL:» / «Total (USD)» / «Subtotal» / «Total general» se reconoce', ['total', 'TOTAL:', 'Total (USD)', 'Subtotal', 'Total general', 'Gran total'].every(esTotal));
ok('un rubro de verdad NO es un total', !['Operations (Unforeseen)', 'Equipment', 'Total equipment purchase', 'Totalizadores'].some(esTotal));
ok('la fila «total» no se numera ni se suma y el desglose que supera el presupuesto se dice así', /const items = filled\.filter\(\(_, i\) => !totalIdx\.has\(i\)\)/.test(pdf) && /Total escrito por el club/.test(pdf) && /El desglose lo supera en/.test(pdf));

console.log('\n6. v4.1354 — Lo que DILIGENCIÓ el club manda en la portada (Paula: el título nuevo, «el principal es Pereira Perla del Otún» y «borré el total pero aún me sale»)');
const id = P.coverIdentityOf({ projectName: '"Cuna de Vida": Dotación de unidades neonatales', clubName: 'Pereira del Café', es: { groups: [{ sections: [{ fields: [
    { path: 'master.identificacion.projectName', value: 'Cuna de Vida: Recuperando la atención neonatal en Pereira tras el terremoto' },
    { path: 'master.identificacion.clubName', value: 'Pereira Perla del Otún' },
    { path: 'master.identificacion.participatingClubs', value: ['Pereira', 'Pereira Perla del Otún', 'Pereira Nuevo'] },
] }] }] } });
ok('el título es el de la Formulación, no el del registro', id.projectName === 'Cuna de Vida: Recuperando la atención neonatal en Pereira tras el terremoto');
ok('el club principal es el escrito en «Club Rotario» de la Formulación', id.clubName === 'Pereira Perla del Otún');
ok('el club del registro pasa a los participantes; el principal no se repite', JSON.stringify(id.participating) === JSON.stringify(['Pereira', 'Pereira Nuevo', 'Pereira del Café']));
const igual = P.coverIdentityOf({ projectName: 'Registro', clubName: 'Pereira del Café', es: { groups: [{ sections: [{ fields: [{ path: 'master.identificacion.clubName', value: 'Club Rotario Pereira del Cafe' }] }] }] } });
ok('el mismo club con otra escritura se muestra como quedó registrado', igual.clubName === 'Pereira del Café' && igual.participating.length === 0);
ok('sin Formulación: el del FDD, y sin FDD: el del registro', P.coverIdentityOf({ projectName: 'R', clubName: 'X', es: { groups: [{ sections: [{ fields: [{ path: 'fdd_2026_2027.proyecto.projectName', value: 'Del FDD' }] }] }] } }).projectName === 'Del FDD'
    && P.coverIdentityOf({ projectName: 'R', clubName: 'X', es: { groups: [] } }).projectName === 'R');
ok('el nombre del archivo usa el título de la Formulación', /^FP-1-Cuna-de-Vida-Recuperando/.test(P.clubFichaFileName({ publicRef: 'FP-1', projectName: 'Viejo', es: { groups: [{ sections: [{ fields: [{ path: 'master.identificacion.projectName', value: 'Cuna de Vida: Recuperando la atención' }] }] }] } })));
const B = await import('data:text/javascript;base64,' + Buffer.from((await build({ entryPoints: [new URL('../src/lib/budgetRows.ts', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' })).outputFiles[0].text).toString('base64'));
const paula = [{ concept: 'Equipment', amountUsd: '132727' }, { concept: 'Monitoring/evaluation', amountUsd: '441' }, { concept: 'Project management', amountUsd: '735' }, { concept: 'Operations', amountUsd: '2655' }];
const idx = (rows) => [...B.totalRowIndexes(rows, 'concept', 'amountUsd')].join();
ok('la fila «total» con su monto es un total', idx([...paula, { concept: 'total', amountUsd: '136558' }]) === '4');
ok('la fila SIN concepto cuyo monto es la suma de las demás también (le borró la palabra)', idx([...paula, { concept: '', amountUsd: '136558' }]) === '4');
ok('una fila sin concepto con otro monto NO es un total (es un rubro sin nombre)', idx([...paula, { concept: '', amountUsd: '500' }]) === '');
ok('con sólo dos filas no se adivina', idx([{ concept: 'A', amountUsd: '100' }, { concept: '', amountUsd: '100' }]) === '');
ok('el desglose real de Paula no tiene totales', idx(paula) === '');
const ff2 = read('src/components/project-forms/FormFields.tsx');
ok('el formulario muestra la suma de los rubros y avisa de la fila que parece el total', /data-desglose-suma/.test(ff2) && /data-desglose-total-aviso/.test(ff2) && /totalRowIndexes\(rows, labelKey, moneyKey\)/.test(ff2));

console.log('\n7. v4.1355 — El «Registro inicial» dice lo mismo que la portada (Paula: «el club postulante es Pereira Perla del Otún y sigue saliendo Pereira del Café»)');
const dossierPaula = { groups: [
    { key: 'submission', sections: [{ key: 'club', fields: [{ path: 'submission.clubName', value: 'Pereira del Café' }] }, { key: 'proyecto', fields: [{ path: 'submission.projectName', value: '"Cuna de Vida": Dotación de unidades neonatales', valueEn: '"Cuna de Vida": Neonatal units' }] }] },
    { key: 'master', sections: [{ key: 'identificacion', fields: [
        { path: 'master.identificacion.projectName', value: 'Cuna de Vida: Recuperando la atención neonatal en Pereira tras el terremoto', valueEn: 'Cuna de Vida: Restoring neonatal care in Pereira after the earthquake' },
        { path: 'master.identificacion.clubName', value: 'Pereira Perla del Otún' },
    ] }] },
] };
const ov = P.registrationOverridesOf(dossierPaula, 'es');
ok('«Club postulante → Club Rotario» muestra el club principal (Pereira Perla del Otún)', ov.get('submission.clubName')?.value === 'Pereira Perla del Otún');
ok('y debajo, con qué cuenta se inscribió (no se pierde)', ov.get('submission.clubName')?.note === 'Inscrita con la cuenta del club: Pereira del Café');
ok('«Nombre del proyecto» del registro muestra el título de la Formulación, con el inicial debajo', ov.get('submission.projectName')?.value.startsWith('Cuna de Vida: Recuperando') && /Nombre en el registro inicial: "Cuna de Vida": Dotación/.test(ov.get('submission.projectName')?.note));
const ovEn = P.registrationOverridesOf(dossierPaula, 'en');
ok('en inglés: el club igual y el título TRADUCIDO de la Formulación', ovEn.get('submission.clubName')?.value === 'Pereira Perla del Otún' && ovEn.get('submission.projectName')?.value === 'Cuna de Vida: Restoring neonatal care in Pereira after the earthquake' && /Name at initial registration: "Cuna de Vida": Neonatal units/.test(ovEn.get('submission.projectName')?.note));
const sinCambio = { groups: [{ key: 'submission', sections: [{ key: 'c', fields: [{ path: 'submission.clubName', value: 'Pereira del Café' }, { path: 'submission.projectName', value: 'Cuna' }] }] }, { key: 'master', sections: [{ key: 'identificacion', fields: [{ path: 'master.identificacion.clubName', value: 'Club Rotario Pereira del Cafe' }, { path: 'master.identificacion.projectName', value: 'Cuna' }] }] }] };
ok('si el club y el título no cambiaron, el registro se muestra tal cual (sin notas)', P.registrationOverridesOf(sinCambio, 'es').size === 0);
ok('la ficha aplica el reemplazo al dibujar el registro', /const overrides = registrationOverridesOf\(dossier, lang\)/.test(read('src/lib/projectDossierPdf.ts')));

console.log(`\n${fail ? '❌' : '✅'} test:fair:participating-clubs — ${pass} pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
