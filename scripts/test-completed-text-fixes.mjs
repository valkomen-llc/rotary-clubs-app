#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Ajustes puntuales de texto del formulario «Completar inscripción» — v4.1292
//
//   npm run test:completed:text-fixes
//   COMPLETED_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:completed:text-fixes
//
// Con una base LOCAL y desechable: reemplaza SÓLO si el campo aún tiene el
// texto viejo, no toca el resto de `settings` ni otro formulario, respeta un
// texto que alguien ya cambió desde el panel y no vuelve a escribir.
// ════════════════════════════════════════════════════════════════════
// La base de la prueba se fija ANTES de cualquier import: `db.js` crea su pool
// al cargarse. Sin una local, ni siquiera se intenta conectar.
const E2E_DB = process.env.COMPLETED_E2E_DATABASE_URL || '';
const LOCAL = /@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB);
process.env.DATABASE_URL = LOCAL ? E2E_DB : 'postgres://sin-base@127.0.0.1:1/ninguna';

let pasadas = 0;
const fallos = [];
const check = (nombre, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ✓ ${nombre}`); }
    else { fallos.push(nombre); console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};
const terminar = () => {
    console.log(`\n${pasadas} comprobaciones pasaron${fallos.length ? `, ${fallos.length} FALLARON` : '.'}`);
    process.exit(fallos.length ? 1 : 0);
};

const { COMPLETED_FORM_TEXT_FIXES } = await import('../server/lib/completedFormTextFixes.js?criterio');
console.log('\n1. Criterio');
for (const f of COMPLETED_FORM_TEXT_FIXES) {
    check(`«${f.id}»: tiene slug, campo, condición y valor`, Boolean(f.slug && f.field && f.ifStartsWith && f.value));
    check(`«${f.id}»: el valor nuevo NO cumple su propia condición (si no, reescribiría siempre)`, !f.value.startsWith(f.ifStartsWith));
    check(`«${f.id}»: cabe en el tope del campo (2000)`, f.value.length <= 2000);
}

if (!LOCAL) {
    console.log('\n[test:completed:text-fixes] Sin COMPLETED_E2E_DATABASE_URL local: se omite la parte con base.');
    terminar();
}
const { default: db } = await import('../server/lib/db.js');
const fix = COMPLETED_FORM_TEXT_FIXES[0];
const VIEJO = `${fix.ifStartsWith} y los datos completos del participante. Si un mismo comprobante corresponde a varias personas…`;

await db.query(`DROP TABLE IF EXISTS "EventEdition"`);
await db.query(`CREATE TABLE "EventEdition" (id TEXT PRIMARY KEY, "eventId" TEXT, settings JSONB NOT NULL DEFAULT '{}', "updatedAt" TIMESTAMPTZ)`);
const otrosAjustes = { buttons: [{ key: 'nacional' }], completedForm: { slug: fix.slug, enabled: true, title: 'Completar Inscripción', intro: VIEJO, paymentGuide: { enabled: true, url: 'https://pagos.example' } } };
await db.query(`INSERT INTO "EventEdition" VALUES ('ed-1','ev-xiii',$1,NULL), ('ed-2','ev-otro',$2,NULL)`, [
    JSON.stringify(otrosAjustes),
    JSON.stringify({ completedForm: { slug: 'otro-formulario', intro: VIEJO } }),
]);
const leer = async (id) => (await db.query(`SELECT settings FROM "EventEdition" WHERE id = $1`, [id])).rows[0].settings;

console.log('\n2. Con el texto viejo');
const mod = await import('../server/lib/completedFormTextFixes.js?run1');
await mod.applyCompletedFormTextFixes();
const s1 = await leer('ed-1');
check('el texto introductorio quedó con el nuevo', s1.completedForm.intro === fix.value, s1.completedForm.intro);
check('⚠️ el resto de la configuración intacto', s1.completedForm.title === 'Completar Inscripción' && s1.completedForm.enabled === true
    && s1.completedForm.paymentGuide?.url === 'https://pagos.example' && s1.buttons?.[0]?.key === 'nacional');
check('⚠️ otro formulario con el mismo texto NO se toca', (await leer('ed-2')).completedForm.intro === VIEJO);

console.log('\n3. Idempotente y respetuoso del panel');
const antes = (await db.query(`SELECT "updatedAt" FROM "EventEdition" WHERE id = 'ed-1'`)).rows[0].updatedAt;
const mod2 = await import('../server/lib/completedFormTextFixes.js?run2');
await mod2.applyCompletedFormTextFixes();
const despues = (await db.query(`SELECT "updatedAt" FROM "EventEdition" WHERE id = 'ed-1'`)).rows[0].updatedAt;
check('una segunda pasada no vuelve a escribir', String(antes) === String(despues));
await db.query(`UPDATE "EventEdition" SET settings = jsonb_set(settings, '{completedForm,intro}', '"Texto que puso el equipo"') WHERE id = 'ed-1'`);
const mod3 = await import('../server/lib/completedFormTextFixes.js?run3');
await mod3.applyCompletedFormTextFixes();
check('⚠️ un texto que el equipo cambió desde el panel se respeta', (await leer('ed-1')).completedForm.intro === 'Texto que puso el equipo');

await db.query(`DROP TABLE "EventEdition"`);
await db.pool.end();
terminar();
