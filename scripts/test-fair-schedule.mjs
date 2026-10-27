#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// LAS FECHAS IMPORTANTES DE LA POSTULACIÓN.  npm run test:fair-schedule
// v4.1252.0
//
// Protege dos cosas: que quitar una fecha del valor por defecto la quite del
// sitio aunque la fila guardada traiga una copia, y que lo editado en el
// panel mande —incluida la lista vacía—.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';

const { DEFAULT_CONFIG, normalizeSavedConfig } = await import('../server/controllers/projectFairController.js');

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };
const eq = (n, a, b) => ok(n, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const labels = (list) => (list || []).map(i => i.label);
const defecto = DEFAULT_CONFIG.content.schedule;

console.log('\n1. Las fechas cumplidas ya no están');
ok('sin «Global Grants» (1-sep-2026)', !labels(defecto).some(l => /Global Grants/.test(l)));
ok('sin «comunicación con los CADRES» (15-oct-2026)', !labels(defecto).some(l => /CADRES/.test(l)));
eq('quedan las tres siguientes', defecto.map(i => i.date), ['2026-11-09', '2026-11-25', '2027-01-10']);

console.log('\n2. Una copia guardada sin el editor cede al valor por defecto');
const copiaVieja = {
    content: {
        title: 'X',
        schedule: [
            { date: '2026-09-01', label: 'Plazo para subir proyectos a Global Grants' },
            { date: '2026-10-15', label: 'Comunicación de los clubes con los padres' },
            { date: '2026-11-09', label: 'Fecha máxima para enviar el formato', prefix: 'Hasta el' },
        ],
    },
};
const n1 = normalizeSavedConfig(copiaVieja);
ok('la lista copiada se descarta', !('schedule' in n1.content));
eq('y el resto del contenido se conserva', n1.content.title, 'X');

console.log('\n3. Lo editado en el panel manda');
const editada = normalizeSavedConfig({
    content: {
        scheduleEdited: true,
        schedule: [
            { date: '2027-02-01', label: '  Evento nuevo  ', prefix: ' ' },
            { date: '2027-03-01', label: '' },
            { date: '2027-04-01', label: 'Con prefijo', prefix: 'Hasta el' },
        ],
    },
});
eq('se respeta, limpia y sin filas vacías', editada.content.schedule, [
    { date: '2027-02-01', label: 'Evento nuevo' },
    { date: '2027-04-01', label: 'Con prefijo', prefix: 'Hasta el' },
]);
const vacia = normalizeSavedConfig({ content: { scheduleEdited: true, schedule: [] } });
eq('la lista vacía también es una decisión', vacia.content.schedule, []);

console.log('\n4. El panel tiene el editor');
const panel = read('src/components/admin/feria/ConvocatoriaConfig.tsx');
ok('existe el bloque «Fechas importantes del proceso»', panel.includes('title="Fechas importantes del proceso"'));
ok('y al editar marca la lista como decidida', panel.includes("patch('content.scheduleEdited', true)"));
ok('el editor está declarado fuera de la pantalla', /^const ScheduleEditor = /m.test(panel));

console.log(`\n${pass} pasadas, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
