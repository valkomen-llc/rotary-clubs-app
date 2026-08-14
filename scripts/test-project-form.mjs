#!/usr/bin/env node
/**
 * Formularios del proyecto — retirar un campo sin perder lo diligenciado
 * ======================================================================
 *
 * El comité pidió quitar del paso 5 (Presupuesto) de la Formulación los tres
 * conceptos internacionales. Quitar una fila de una plantilla parece un cambio
 * de una línea y tiene dos trampas que este archivo vigila:
 *
 *   1. LO GUARDADO MANDA. `templateFor` mezcla la plantilla del código con la
 *      copia que la convocatoria tenga guardada, y el merge REEMPLAZA los
 *      arrays enteros: si la fila de `ProjectFairConfig` trae su propio
 *      `masterForm.sections`, editar el código no cambia nada en producción.
 *      Es la trampa que ya documentaron el catálogo de clubes (v4.707) y el
 *      Generador de Pendones.
 *   2. LO YA ESCRITO DESAPARECE. La ficha administrativa, el PDF y el Word
 *      dibujan la tabla recorriendo `rows`. Un club pudo diligenciar un
 *      concepto antes de que se retirara: seguiría en la base, invisible.
 *
 * Se prueba el CRITERIO —plantilla, saneo de lo guardado y filas a dibujar—,
 * sin base, sin credenciales y sin red.
 *
 *   npm run test:project-form
 */

import {
    DEFAULT_MASTER_FORM, RETIRED_BUDGET_ROWS, RETIRED_BUDGET_ROW_KEYS,
    dropRetiredBudgetRows,
} from '../server/lib/projectFairMasterForm.js';
import { matrixRowsToShow, hasValue, completionOf } from '../server/lib/projectFormEngine.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  OK    ${name}`); }
    else { fail++; console.log(`  FALLA ${name}${extra ? ` — ${extra}` : ''}`); }
};

const budgetField = (form) => (form.sections || [])
    .find(s => s.key === 'presupuesto')?.fields
    .find(f => f.key === 'budgetTable');

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ La plantilla ya no pide los tres conceptos internacionales');

{
    const campo = budgetField(DEFAULT_MASTER_FORM);
    check('el paso 5 sigue existiendo con su tabla', !!campo);
    const claves = (campo.rows || []).map(r => r.key);
    check('quedan los tres conceptos vigentes, en su orden',
        JSON.stringify(claves) === JSON.stringify(['projectCost', 'localClub', 'colombianDistrict']),
        JSON.stringify(claves));
    for (const k of RETIRED_BUDGET_ROW_KEYS) {
        check(`«${k}» ya no se pide`, !claves.includes(k));
    }
    check('las retiradas quedan DECLARADAS en el campo, no borradas',
        (campo.retiredRows || []).length === 3);
    check('y conservan su etiqueta original para poder rotularlas',
        RETIRED_BUDGET_ROWS.every(r => typeof r.label === 'string' && r.label.length > 3));
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ Una copia guardada de la plantilla también se limpia');

{
    // Lo que habría en `ProjectFairConfig.masterForm` si el administrador
    // guardó la plantilla alguna vez: el array de secciones ENTERO, que es
    // justo lo que taparía el cambio del código.
    const guardada = {
        version: 2,
        sections: [
            { key: 'presupuesto', title: 'Presupuesto', fields: [{
                key: 'budgetTable', type: 'matrix',
                columns: [{ key: 'pesos', label: 'Valor en pesos', type: 'currency' }],
                rows: [
                    { key: 'projectCost', label: 'Costo del Proyecto' },
                    { key: 'localClub', label: 'Aporte Club local' },
                    { key: 'internationalClubs', label: 'Aporte clubes internacionales' },
                    { key: 'colombianDistrict', label: 'Distrito Colombiano' },
                    { key: 'internationalDistrict', label: 'Distrito Internacional' },
                    { key: 'rotaryFoundation', label: 'Fundación Rotaria' },
                ],
            }] },
            { key: 'contacto', title: 'Datos de contacto', fields: [{ key: 'contactName', type: 'text' }] },
        ],
    };

    const limpia = dropRetiredBudgetRows(guardada);
    const claves = budgetField(limpia).rows.map(r => r.key);
    check('la copia guardada pierde las tres filas retiradas',
        !RETIRED_BUDGET_ROW_KEYS.some(k => claves.includes(k)), JSON.stringify(claves));
    check('...y conserva las vigentes en su orden',
        JSON.stringify(claves) === JSON.stringify(['projectCost', 'localClub', 'colombianDistrict']));
    check('...y no toca las demás secciones',
        limpia.sections[1] === guardada.sections[1]);
    check('...ni pisa lo que el administrador personalizó fuera de esas filas',
        limpia.version === 2 && limpia.sections.length === 2);

    // Idempotencia: la limpieza corre en CADA lectura de la configuración.
    check('correrla dos veces no cambia nada',
        dropRetiredBudgetRows(limpia) === limpia);
    check('una plantilla que ya está limpia se devuelve TAL CUAL (misma referencia)',
        dropRetiredBudgetRows(DEFAULT_MASTER_FORM) === DEFAULT_MASTER_FORM);
    check('una configuración sin plantilla guardada no revienta',
        dropRetiredBudgetRows(undefined) === undefined && dropRetiredBudgetRows({}) !== null);

    // La corrección tiene que estar ENCHUFADA en la lectura, no sólo escrita.
    const ctrl = readFileSync(path.join(root, 'server/controllers/projectFairController.js'), 'utf8');
    check('`normalizeSavedConfig` la aplica al leer la convocatoria',
        /normalizeSavedConfig[\s\S]*dropRetiredBudgetRows\(out\.masterForm\)/.test(ctrl));
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ Lo que un club ya escribió NO desaparece de las vistas');

{
    const campo = budgetField(DEFAULT_MASTER_FORM);

    // Una postulación anterior al cambio, con un concepto ya retirado lleno.
    const conHistoria = {
        projectCost: { pesos: '10000000', usd: '2500' },
        localClub: { pesos: '2000000', usd: '500' },
        rotaryFoundation: { pesos: '5000000', usd: '1250' },
    };
    const filas = matrixRowsToShow(campo, conHistoria);
    check('la fila retirada CON valor se sigue dibujando',
        filas.some(r => r.key === 'rotaryFoundation'), filas.map(r => r.key).join(','));
    check('...marcada como retirada, para no leerse como algo que aún se pide',
        filas.find(r => r.key === 'rotaryFoundation')?.label.includes('retirado'));
    check('...y al final, después de las vigentes',
        filas[filas.length - 1].key === 'rotaryFoundation');
    check('las retiradas VACÍAS no se dibujan: nadie necesita un concepto muerto y en blanco',
        !filas.some(r => r.key === 'internationalClubs' || r.key === 'internationalDistrict'));

    // Una postulación nueva ve exactamente los tres conceptos vigentes.
    const nueva = { projectCost: { pesos: '1000', usd: '1' } };
    check('una postulación nueva ve sólo las tres filas vigentes',
        matrixRowsToShow(campo, nueva).length === 3);
    check('sin `retiredRows` la función devuelve las filas tal cual (compatibilidad)',
        matrixRowsToShow({ rows: [{ key: 'a' }] }, {}).length === 1);

    // Las TRES vistas administrativas tienen que usarla, o cada una mostraría
    // una tabla distinta de la misma postulación.
    const vistas = [
        ['server/lib/projectFairDocx.js', 'el Word'],
        ['src/pages/admin/PostulacionesPagos.tsx', 'el PDF de la ficha'],
        ['src/components/admin/feria/ProjectFormApproval.tsx', 'la ficha de aprobación'],
    ];
    for (const [f, nombre] of vistas) {
        check(`${nombre} dibuja la tabla con matrixRowsToShow`,
            /matrixRowsToShow\(field, value\)/.test(readFileSync(path.join(root, f), 'utf8')));
    }

    // El espejo del navegador tiene que decir lo MISMO que el del servidor.
    const espejo = readFileSync(path.join(root, 'src/lib/projectForms.ts'), 'utf8');
    check('el espejo del navegador declara la misma función',
        /export const matrixRowsToShow/.test(espejo));
    check('...con la misma regla de «retirada con valor»',
        /retired: true/.test(espejo) && /retirado del formulario/.test(espejo));
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ Quitar filas no rompe el avance ni el envío');

{
    const campo = budgetField(DEFAULT_MASTER_FORM);
    check('la tabla sigue siendo obligatoria', campo.required === true);
    // Una tabla se da por diligenciada con CUALQUIER celda llena, así que
    // quitar filas no puede dejar a nadie sin poder completar el paso.
    check('basta una celda para darla por diligenciada',
        hasValue({ projectCost: { pesos: '100' } }, 'matrix'));
    check('vacía sigue sin contar', !hasValue({}, 'matrix'));

    // Una postulación que sólo había llenado conceptos ya retirados sigue
    // contando como diligenciada: no se le baja el avance a nadie por un
    // cambio del formulario.
    check('una respuesta vieja en una fila retirada sigue contando para el avance',
        hasValue({ rotaryFoundation: { usd: '1250' } }, 'matrix'));
    check('el avance de la plantilla se sigue pudiendo calcular',
        typeof completionOf(DEFAULT_MASTER_FORM, {}) === 'number');
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} pruebas pasan, ${fail} fallan\n`);
process.exit(fail === 0 ? 0 : 1);
