#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Editar y eliminar inscripciones desde el listado.  npm run test:registration-bulk
// v4.1263.0
//
// Sin base, sin red. Fija el CRITERIO puro (`planRegistrationEdit`,
// `registrationDeleteBlock`), que el espejo del navegador diga lo mismo que el
// servidor, y las piezas del camino que no se pueden perder: rutas literales
// antes que `:id`, los ids de «seleccionar todo» con el MISMO `buildFilters`,
// confirmación explícita y que los pagos NO se borren.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    planRegistrationEdit, registrationDeleteBlock, REGISTRATION_BULK_EDITABLE,
    DELETE_BLOCK_LABELS, ANSWER_COLUMNS, buildFormSchema, SETTLED_STATUSES,
} from '../server/lib/eventRegistrationSpec.js';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };
const leer = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const fields = buildFormSchema({ key: 'registro_nacional', audience: 'national' }).steps.flatMap(s => s.fields);
const answers = {
    firstName: 'Paula', lastName: 'Cruz', email: 'paula@correo.com', clubName: 'ximena@hotmail.com',
    fairRole: 'expositor', dietary: 'ninguna', acceptTerms: true, legacyKey: 'viejo',
};

console.log('\n1. Editar una inscripción');
{
    const p = planRegistrationEdit({ fields, answers, patch: { clubName: 'Valledupar Sicarare', firstName: 'Paula Andrea' } });
    ok('acepta los cambios válidos', p.ok);
    ok('dice qué cambió, con el valor anterior',
        p.changed.clubName?.from === 'ximena@hotmail.com' && p.changed.clubName?.to === 'Valledupar Sicarare');
    ok('la columna acompaña a la respuesta', p.columns.clubName === 'Valledupar Sicarare' && p.columns.firstName === 'Paula Andrea');
    ok('lo que no se tocó no aparece como cambio', !('lastName' in p.changed) && !('lastName' in p.columns));
    ok('no pierde las respuestas que no se mandaron', p.answers.legacyKey === 'viejo' && p.answers.acceptTerms === true);
}
{
    const p = planRegistrationEdit({ fields, answers, patch: { firstName: 'Paula', email: 'paula@correo.com' } });
    ok('mandar lo mismo no es un cambio', p.ok && Object.keys(p.changed).length === 0);
}
{
    const p = planRegistrationEdit({ fields, answers, patch: { acceptTerms: false, inventada: 'x' } });
    ok('la aceptación de términos no la reescribe el equipo', !('acceptTerms' in p.changed));
    ok('una clave que no está en el formulario ni en la inscripción se ignora', !('inventada' in p.changed));
}
{
    const p = planRegistrationEdit({ fields, answers, patch: { legacyKey: 'corregido' } });
    ok('un campo retirado que la inscripción ya tenía se puede corregir', p.changed.legacyKey?.to === 'corregido');
}
{
    const p = planRegistrationEdit({ fields, answers, patch: { email: 'no-es-correo' } });
    ok('un correo inválido se rechaza', !p.ok && p.errors.email);
}
{
    const p = planRegistrationEdit({ fields, answers, patch: { email: 'Paula.Nueva@Correo.com' } });
    ok('el correo se guarda en minúsculas en su columna', p.ok && p.columns.email === 'paula.nueva@correo.com');
}
{
    const p = planRegistrationEdit({ fields, answers, patch: { firstName: '   ' } });
    ok('el nombre no puede quedar vacío', !p.ok && p.errors.firstName);
}
{
    const p = planRegistrationEdit({ fields, answers, patch: { fairRole: 'astronauta' } });
    ok('un select cambiado tiene que caer en sus opciones', !p.ok && p.errors.fairRole);
    const q = planRegistrationEdit({ fields, answers: { ...answers, fairRole: 'rol_viejo' }, patch: { fairRole: 'rol_viejo', city: 'Valledupar' } });
    ok('un valor viejo que ya no figura se respeta mientras nadie lo toque', q.ok && !('fairRole' in q.changed));
}
{
    const p = planRegistrationEdit({ fields, answers, patch: { accessibility: 'Silla de ruedas' } });
    ok('los comentarios viajan a su columna `notes`', p.columns.notes === 'Silla de ruedas');
    const d = planRegistrationEdit({ fields, answers, patch: { district: '4271-abcdefghijklmnopqrstuvwxyz-abcdefghijklmnopqrstuvwxyz' } });
    ok('el tope de la columna es el del envío del formulario', d.columns.district.length === ANSWER_COLUMNS.district.max);
}

console.log('\n2. Qué se conserva al eliminar');
ok('una inscripción sin pago se elimina', registrationDeleteBlock({ status: 'pending_payment' }) === null);
ok('una acreditada se conserva', registrationDeleteBlock({ status: 'paid', checkedInAt: '2027-01-28' }) === 'ya_acreditada');
ok('el estado «Asistió» también cuenta como acreditada', registrationDeleteBlock({ status: 'attended' }) === 'ya_acreditada');
ok('una incluida en un traslado se conserva', registrationDeleteBlock({ status: 'paid' }, { inTransfer: true }) === 'en_traslado');
ok('una pagada sin permiso de pagos se conserva',
    registrationDeleteBlock({ status: 'paid' }, { canPayments: false }) === 'sin_permiso_pagos');
ok('una pagada con permiso de pagos se elimina', registrationDeleteBlock({ status: 'paid' }, { canPayments: true }) === null);
ok('todo motivo tiene su rótulo', ['ya_acreditada', 'en_traslado', 'sin_permiso_pagos'].every(k => DELETE_BLOCK_LABELS[k]));

console.log('\n3. El espejo del navegador dice lo mismo');
const espejo = leer('src/lib/eventRegistrationSpec.ts');
const bulkKeys = [...(espejo.match(/REGISTRATION_BULK_FIELDS[\s\S]*?\];/)?.[0] || '').matchAll(/key: '(\w+)'/g)].map(m => m[1]);
ok('los campos en bloque son los del servidor', JSON.stringify(bulkKeys) === JSON.stringify(REGISTRATION_BULK_EDITABLE));
ok('la identidad NO se edita en bloque',
    !REGISTRATION_BULK_EDITABLE.some(k => ['firstName', 'lastName', 'email', 'phone', 'documentNumber'].includes(k)));
for (const [k, v] of Object.entries(DELETE_BLOCK_LABELS)) {
    ok(`rótulo «${k}» igual en los dos lados`, espejo.includes(`${k}: '${v}'`));
}
const settledEspejo = espejo.match(/SETTLED_STATUSES = \[([^\]]*)\]/)?.[1].match(/'(\w+)'/g)?.map(x => x.slice(1, -1));
ok('los estados liquidados del espejo son los del servidor', JSON.stringify(settledEspejo) === JSON.stringify(SETTLED_STATUSES));

console.log('\n4. El camino del servidor');
const rutas = leer('server/routes/event-registrations.js');
const iSelect = rutas.indexOf("'/admin/registrations/select-all'");
const iId = rutas.indexOf("router.get('/admin/registrations/:id'");
ok('select-all se declara ANTES de /admin/registrations/:id', iSelect > 0 && iSelect < iId);
for (const r of ['bulk-status', 'bulk-edit', 'bulk-delete']) {
    ok(`ruta ${r}`, rutas.includes(`router.post('/admin/registrations/${r}'`));
}
ok('ruta de edición de una inscripción', rutas.includes("router.patch('/admin/registrations/:id', authMiddleware, json, admin.updateRegistration)"));

const ctrl = leer('server/controllers/eventRegistrationAdminController.js');
const selectAll = ctrl.slice(ctrl.indexOf('export const selectAllRegistrations'), ctrl.indexOf('const bulkScopeFor'));
ok('«seleccionar todo» usa el MISMO buildFilters del listado', /buildFilters\(event\.id, req\.query\)/.test(selectAll));
ok('lo que no cabe se anuncia (truncated)', /SELECT_ALL_MAX \+ 1/.test(selectAll) && /truncated/.test(selectAll));
ok('confirmación explícita (428)', /req\.body\?\.confirm !== true/.test(ctrl) && /status\(428\)/.test(ctrl));
ok('tope por petición', /ids\.length > BULK_MAX/.test(ctrl));
const borrar = ctrl.slice(ctrl.indexOf('export const bulkDelete'), ctrl.indexOf('// ── Acreditación'));
ok('el borrado pregunta a registrationDeleteBlock', /registrationDeleteBlock\(row/.test(borrar));
ok('consulta los traslados del evento', /"EventFundsAllocation"/.test(borrar));
ok('NO borra los pagos (el dinero sí entró)', !/DELETE FROM "EventRegistrationPayment"/.test(borrar));
ok('NO borra el historial', !/DELETE FROM "EventRegistrationHistory"/.test(borrar));
ok('deja rastro registration_deleted', /type: 'registration_deleted'/.test(borrar));
ok('el DELETE va acotado al evento', /DELETE FROM "EventRegistration" WHERE id = \$1 AND "eventId" = \$2/.test(borrar));
const editar = ctrl.slice(ctrl.indexOf('export const updateRegistration'), ctrl.indexOf('// ── Selección y acciones en bloque'));
ok('la edición pasa por planRegistrationEdit y deja historial',
    /planRegistrationEdit\(/.test(editar) && /type: 'edited'/.test(editar));
const enBloque = ctrl.slice(ctrl.indexOf('export const bulkEdit'), ctrl.indexOf('export const bulkDelete'));
ok('la edición en bloque rechaza lo que no es compartido', /REGISTRATION_BULK_EDITABLE\.includes\(field\)/.test(enBloque));
const estado = ctrl.slice(ctrl.indexOf('export const bulkStatus'), ctrl.indexOf('export const bulkEdit'));
ok('el cambio de estado en bloque respeta el permiso de pagos', /canManagePayments/.test(estado) && /sin_permiso_pagos/.test(estado));

console.log('\n5. La pantalla');
const ui = leer('src/components/admin/events/EventRegistrationsManager.tsx');
ok('casilla por fila con el nombre en la etiqueta accesible', /aria-label=\{`Seleccionar: \$\{r\.firstName\}/.test(ui));
ok('la casilla no abre la ficha', /onClick=\{e => e\.stopPropagation\(\)\}/.test(ui));
ok('la cabecera marca SÓLO lo visible', /Seleccionar todas las inscripciones visibles/.test(ui));
ok('las acciones se mandan en tandas', /chunkIds\(ids, BULK_MAX\)/.test(ui));
ok('con UNA marcada, «Editar» abre sus datos completos', /if \(picked\.size === 1\) \{ setEditing\(/.test(ui));
ok('el modal de edición vive en el ámbito del módulo', /^const EditRegistrationModal = /m.test(ui));
ok('la confirmación advierte acreditadas y pagadas ANTES', /acreditadosEnSeleccion > 0/.test(ui) && /pagadosEnSeleccion > 0/.test(ui));

console.log(`\n${pass} correctas, ${fail} fallidas\n`);
process.exit(fail ? 1 : 0);
