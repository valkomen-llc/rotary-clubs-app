#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Inscripciones completadas — EL CAMINO del servidor. npm run test:completed:path
// v4.944.0
//
// POR QUÉ NO ALCANZA `test:completed`: aquélla prueba el CRITERIO y es pura,
// así que no ve nada de lo que de verdad puede fallar acá —que la semilla ate
// el slug a SU evento y sólo a él, que el envío deje la fila con su código y
// su historial, que un duplicado se marque y se relacione sin borrar nada, que
// el registro aparezca en el panel DE SU EVENTO y en ningún otro, que validar
// deje auditoría con quién y cuándo, y que la acreditación lo encuentre—. Es
// la lección de v4.744: el criterio puede estar bien y el defecto vivir en el
// camino.
//
// No necesita Postgres, credenciales ni red: la base, el correo y el S3 de los
// comprobantes se sustituyen con un hook de resolución de módulos. El doble de
// la base INTERPRETA el SQL de los controladores (ver su cabecera): no
// reimplanta ninguna regla del módulo.
// ════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const HERE = pathToFileURL(`${process.cwd()}/`).href;
const DB = new URL('./scripts/fixtures/db-completed-stub.mjs', HERE).href;
const MAIL = new URL('./scripts/fixtures/email-completed-stub.mjs', HERE).href;
const RECEIPTS = new URL('./scripts/fixtures/receipts-completed-stub.mjs', HERE).href;

// ⚠️ El hook compara contra `/db.js`, no contra `/lib/db.js`: los módulos de
// `server/lib` se importan entre sí como `'./db.js'`. Y `completedReceipts.js`
// NO se sustituye cuando llega con `?real`: así el doble re-exporta el
// criterio verdadero en vez de copiarlo.
register(
    `data:text/javascript,
     const DB=${JSON.stringify(DB)}, M=${JSON.stringify(MAIL)}, R=${JSON.stringify(RECEIPTS)};
     export async function resolve(s,c,n){
       if(/(^|\\/)db\\.js$/.test(s)) return {url:DB,shortCircuit:true};
       if(/EmailService\\.js$/.test(s)) return {url:M,shortCircuit:true};
       if(/completedReceipts\\.js$/.test(s)) return {url:R,shortCircuit:true};
       return n(s,c);
     }`,
    HERE
);

const db = await import(DB);
const mail = await import(MAIL);
const receipts = await import(RECEIPTS);
const pub = await import('../server/controllers/completedRegistrationController.js');
const admin = await import('../server/controllers/completedRegistrationAdminController.js');
const legacyAdmin = await import('../server/controllers/eventRegistrationAdminController.js');

let pasadas = 0;
const fallos = [];
const check = (nombre, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ✓ ${nombre}`); }
    else { fallos.push(nombre); console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};
const grupo = (t) => console.log(`\n${t}`);

// ── Dobles de Express ────────────────────────────────────────────────
const req = (over = {}) => ({
    user: { id: 'u-admin', name: 'Equipo Registro', email: 'registro@rotary4281.org', role: 'administrator' },
    body: {}, params: {}, query: {}, headers: {}, ...over,
});
const res = () => {
    const r = { statusCode: 200, body: null, headers: {} };
    r.status = (c) => { r.statusCode = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    r.send = (b) => { r.body = b; return r; };
    r.setHeader = (k, v) => { r.headers[k] = v; };
    return r;
};

// ── Datos de partida ─────────────────────────────────────────────────
const SLUG = 'inscripcion-conferencia-distrital-villavicencio-2027';
const EVENTO = {
    id: 'ev-xiii', slug: 'xiii-conferencia-rotaria',
    title: 'XIII Conferencia Rotaria del Distrito 4281 – Villavicencio 2027',
    clubId: 'club-4281', startDate: '2027-05-28', endDate: '2027-05-30',
    location: 'Villavicencio, Meta, Colombia', metadata: '{}',
};
const OTRO_EVENTO = {
    id: 'ev-feria', slug: 'xii-feria', title: 'XII Feria de Proyectos Valledupar 2027',
    clubId: 'club-4281', startDate: '2027-03-01', endDate: null, location: 'Valledupar', metadata: '{}',
};
const edicionDe = (evento, settings = {}) => ({
    id: `ed-${evento.id}`, eventId: evento.id, clubId: evento.clubId,
    editionNumber: 13, editionLabel: evento.title, venue: '', city: '', region: '', country: '',
    timezone: 'America/Bogota', codePrefix: 'CR13', registrationOpen: true,
    opensAt: null, closesAt: null, fx: '{}', settings: JSON.stringify(settings),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});

const sembrar = () => {
    db.reset();
    mail.resetEnviados();
    receipts.resetObjetos();
    db.tablas.CalendarEvent = [{ ...EVENTO }, { ...OTRO_EVENTO }];
    db.tablas.EventEdition = [edicionDe(EVENTO), edicionDe(OTRO_EVENTO)];
    // La marca del pie del correo (v4.945): archivos REALES del sitio organizador.
    db.tablas.Club = [{ id: 'club-4281', name: 'Distrito 4281 de Rotary International',
        logo: 'https://cdn.example.org/logo.png', footerLogo: 'https://cdn.example.org/pie.png' }];
    // Una inscripción NORMAL ya pagada del mismo correo: el duplicado real.
    db.tablas.EventRegistration = [{
        id: 'reg-online', eventId: EVENTO.id, publicRef: 'EV-AAAAAA', registrationCode: 'RPF13-AAAAA',
        firstName: 'Yaneth', lastName: 'Solano', email: 'yaneth.solano@gmail.com',
        documentNumber: '52111222', status: 'paid', categoryLabel: 'Inscripción - Etapa 1',
        clubName: 'Bogotá Multicentro', district: '4281', country: 'Colombia',
        companionsCount: 0, tags: '[]', answers: '{}', pricing: '{}',
        createdAt: new Date().toISOString(),
    }];
};

const RESPUESTAS = {
    firstName: 'Yaneth', lastName: 'Solano', documentNumber: '52111222',
    email: 'yaneth.solano@gmail.com', phone: '+57 3001234567',
    district: '4281', clubName: 'Bogotá Multicentro', membershipType: 'socio_activo',
    clubRole: 'presidente_electo',
    eps: 'Sanitas', foodAllergy: 'Ninguno',
    emergencyName: 'Pedro Solano', emergencyPhone: '+57 3007654321',
    paymentMethod: 'transferencia', comments: 'Llego el viernes.',
};

// ════════════════════════════════════════════════════════════════════
grupo('0. La lectura pública no muere con el esquema, y un fallo real dice su causa (v4.944)');
sembrar();
{
    // El ensure tropieza ENTERO —el catálogo no contesta y el DDL revienta— y
    // el formulario carga igual: la lectura sólo necesita tablas que existen
    // desde v4.648. Es el 500 que se reportó con la captura («No se pudo
    // cargar el formulario») el día del estreno, con la función arrancando en
    // frío contra la base. Este bloque tiene que correr PRIMERO: es la única
    // invocación en la que `_ready` del ensure todavía está apagado.
    db.fallas.push(/information_schema\.tables/i);                    // alreadyApplied → false
    db.fallas.push(/CREATE TABLE IF NOT EXISTS "EventEdition"/i);     // el DDL lanza
    const r = res();
    await pub.getPublicCompletedConfig(req({ params: { slug: SLUG } }), r);
    check('con el ensure roto, el GET público responde 200 igual',
        r.statusCode === 200 && r.body?.enabled === true, JSON.stringify(r.body).slice(0, 200));
    check('las dos fallas inyectadas se consumieron (el ensure tropezó de verdad)',
        db.fallas.length === 0);
}
{
    // Un fallo REAL de la consulta no se esconde detrás del genérico: el 500
    // lleva el motivo TEXTUAL en `detail` (patrón del proxy de imágenes,
    // v4.912) — es lo que convierte la próxima captura en un diagnóstico.
    db.fallas.push(/FROM "EventEdition" WHERE settings->'completedForm'/i);
    const r = res();
    await pub.getPublicCompletedConfig(req({ params: { slug: SLUG } }), r);
    check('un fallo real responde 500 con el motivo textual en `detail`',
        r.statusCode === 500 && /falla inyectada/.test(String(r.body?.detail || '')),
        JSON.stringify(r.body).slice(0, 200));
}

grupo('1. La URL pedida resuelve a SU evento (siembra perezosa, sin desplegar escrituras)');
sembrar();
{
    const r = res();
    await pub.getPublicCompletedConfig(req({ params: { slug: SLUG } }), r);
    check('el slug pedido responde 200 y encendido', r.statusCode === 200 && r.body?.enabled === true,
        JSON.stringify(r.body).slice(0, 200));
    check('quedó atado al evento de la XIII Conferencia', r.body?.event?.id === 'ev-xiii');
    // v4.958 — CINCO pasos declarados: `cargo` e `invitado` son las dos ramas
    // del mismo lugar y el navegador recorre cuatro, según el vínculo.
    check('el formulario trae sus cinco pasos, con las dos ramas declaradas',
        r.body?.form?.steps?.length === 5
        && JSON.stringify((r.body?.form?.steps || []).map(x => x.key))
           === JSON.stringify(['participante', 'cargo', 'invitado', 'evento', 'pago']));
    check('cada rama declara su condición sobre el vínculo con el club',
        JSON.stringify(r.body.form.steps[1].showIf) === JSON.stringify({ key: 'membershipType', notIn: ['invitado'] })
        && JSON.stringify(r.body.form.steps[2].showIf) === JSON.stringify({ key: 'membershipType', in: ['invitado'] }));
    check('los catálogos distrito → club viajan en la respuesta',
        (r.body?.catalogs?.districts || []).length >= 2);

    const settings = JSON.parse(db.tablas.EventEdition.find(e => e.eventId === 'ev-xiii').settings);
    check('la semilla ESCRIBIÓ la configuración en la edición, con su prefijo CR4281-2027',
        settings.completedForm?.slug === SLUG && settings.completedForm?.codePrefix === 'CR4281-2027');

    const r2 = res();
    await pub.getPublicCompletedConfig(req({ params: { slug: SLUG } }), r2);
    check('la segunda visita resuelve por la configuración, no vuelve a sembrar',
        r2.statusCode === 200 && r2.body?.event?.id === 'ev-xiii');
}
{
    const r = res();
    await pub.getPublicCompletedConfig(req({ params: { slug: 'formulario-inexistente' } }), r);
    check('un slug sin evento responde 404', r.statusCode === 404);
}

grupo('2. La ambigüedad NO se adivina');
{
    db.reset();
    mail.resetEnviados();
    db.tablas.CalendarEvent = [{ ...EVENTO }, { ...EVENTO, id: 'ev-clon', title: 'Pre Conferencia Villavicencio 2027' }];
    db.tablas.EventEdition = [edicionDe(EVENTO)];
    const r = res();
    await pub.getPublicCompletedConfig(req({ params: { slug: SLUG } }), r);
    check('con DOS eventos candidatos, la semilla no ata ninguno (404)', r.statusCode === 404);
}

grupo('3. El envío: comprobante verificado, duplicado marcado, código y auditoría');
sembrar();
// La primera visita ata la semilla.
await pub.getPublicCompletedConfig(req({ params: { slug: SLUG } }), res());
{
    const r = res();
    await pub.submitCompleted(req({ params: { slug: SLUG }, body: { answers: RESPUESTAS } }), r);
    check('sin comprobante el envío se rechaza (422) con su campo marcado',
        r.statusCode === 422 && Boolean(r.body?.fieldErrors?.receipt));
}
{
    receipts.objetos.set('private/event-receipts/ev-feria/ajeno.pdf', { bytes: 5000, mime: 'application/pdf' });
    const r = res();
    await pub.submitCompleted(req({
        params: { slug: SLUG },
        body: { answers: RESPUESTAS, receipt: { key: 'private/event-receipts/ev-feria/ajeno.pdf', name: 'ajeno.pdf' } },
    }), r);
    check('un comprobante de OTRO evento se rechaza', r.statusCode === 422);
}
{
    const r = res();
    await pub.submitCompleted(req({
        params: { slug: SLUG },
        body: { answers: RESPUESTAS, receipt: { key: 'private/event-receipts/ev-xiii/perdido.pdf', name: 'x.pdf' } },
    }), r);
    check('una clave que no existe en S3 se rechaza: el objeto REAL es el que vale',
        r.statusCode === 422);
}
let idRegistro = null;
{
    receipts.objetos.set('private/event-receipts/ev-xiii/r1.pdf', { bytes: 480000, mime: 'application/pdf' });
    const r = res();
    await pub.submitCompleted(req({
        params: { slug: SLUG },
        body: { answers: RESPUESTAS, receipt: { key: 'private/event-receipts/ev-xiii/r1.pdf', name: 'transferencia.pdf' } },
    }), r);
    idRegistro = r.body?.id;
    check('el envío válido responde 201 con su código CR4281-2027-XXXXX',
        r.statusCode === 201 && /^CR4281-2027-[A-Z2-9]{5}$/.test(r.body?.registrationCode || ''),
        JSON.stringify(r.body).slice(0, 200));
    check('nace «Pendiente de validación», nunca confirmado',
        r.body?.status === 'submitted' && r.body?.statusLabel === 'Pendiente de validación');
    check('la respuesta pública NO lleva las alertas de duplicado',
        !('flags' in (r.body || {})) && !('duplicates' in (r.body || {})));

    const fila = db.tablas.EventCompletedRegistration[0];
    check('la fila quedó atada al eventId del evento (nada en tablas genéricas)',
        db.tablas.EventCompletedRegistration.length === 1 && fila.eventId === 'ev-xiii');
    check('la fuente quedó declarada', fila.registrationSource === 'manual_completed_registration');
    const flags = JSON.parse(fila.flags);
    check('el duplicado con la inscripción en línea quedó MARCADO y RELACIONADO',
        flags.hasDuplicates === true && fila.linkedRegistrationId === 'reg-online');
    check('…sin borrar ni tocar la inscripción original',
        db.tablas.EventRegistration.length === 1 && db.tablas.EventRegistration[0].status === 'paid');
    const historial = db.tablas.EventRegistrationHistory.filter(h => h.registrationId === fila.id);
    check('el historial registra el envío Y la alerta de duplicado',
        historial.some(h => h.type === 'completed_submitted') && historial.some(h => h.type === 'duplicate_flagged'));
    check('la confirmación salió al correo del participante, con el asunto nuevo',
        mail.enviados.some(m => String(m.to).includes('yaneth.solano@gmail.com')
            && String(m.subject).includes('¡Tu inscripción está completa!')));
}

grupo('4. El panel: el registro aparece en SU evento y en ningún otro');
{
    const r = res();
    await admin.default.list(req({ query: { eventRef: 'ev-xiii' } }), r);
    check('la pestaña del evento lista el registro recién enviado',
        r.body?.total === 1 && r.body?.registrations?.[0]?.registrationCode?.startsWith('CR4281-2027-'));
    check('la clave de S3 no viaja: sólo hasReceipt y el nombre',
        r.body?.registrations?.[0]?.hasReceipt === true
        && !('receiptKey' in (r.body?.registrations?.[0] || {})));

    const r2 = res();
    await admin.default.list(req({ query: { eventRef: 'ev-feria' } }), r2);
    check('el otro evento no ve NADA (aislamiento por eventId)', r2.body?.total === 0);

    const r3 = res();
    await admin.default.list(req({
        user: { id: 'u2', role: 'club_admin', clubId: 'club-ajeno' },
        query: { eventRef: 'ev-xiii' },
    }), r3);
    check('un administrador de otro sitio recibe 404: el evento no existe para él', r3.statusCode === 404);
}
{
    const r = res();
    await admin.default.getSummary(req({ query: { eventRef: 'ev-xiii' } }), r);
    check('los KPIs cuentan lo que hay: 1 recibido, 1 pendiente, 1 transferencia, 1 duplicado',
        r.body?.totals?.total === 1 && r.body?.totals?.submitted === 1
        && r.body?.totals?.transfers === 1 && r.body?.totals?.duplicates === 1,
        JSON.stringify(r.body?.totals));
}

grupo('5. La ficha, la validación y la auditoría');
{
    const r = res();
    await admin.default.detail(req({ params: { id: idRegistro } }), r);
    check('la ficha trae los datos, el duplicado vivo y la inscripción relacionada',
        r.body?.registration?.email === 'yaneth.solano@gmail.com'
        && r.body?.duplicates?.hasDuplicates === true
        && r.body?.linked?.code === 'RPF13-AAAAA');
    check('el formulario viaja con la ficha para rotular cada respuesta',
        r.body?.form?.steps?.length === 5);
}
{
    const r = res();
    await admin.default.changeStatus(req({ params: { id: idRegistro }, body: { status: 'rejected' } }), r);
    check('rechazar SIN motivo se rechaza (400)', r.statusCode === 400);

    const r2 = res();
    await admin.default.changeStatus(req({ params: { id: idRegistro }, body: { status: 'estado_inventado' } }), r2);
    check('un estado fuera del catálogo se rechaza', r2.statusCode === 400);

    const r3 = res();
    await admin.default.changeStatus(req({
        params: { id: idRegistro }, body: { status: 'validated', comment: 'Comprobante verificado contra el extracto.' },
    }), r3);
    check('validar deja el registro en «Validado»', r3.body?.registration?.status === 'validated');
    const auditoria = db.tablas.EventRegistrationHistory.find(h => h.type === 'completed_status_changed');
    check('la auditoría guarda quién, estado anterior y estado nuevo',
        auditoria?.fromStatus === 'submitted' && auditoria?.toStatus === 'validated'
        && auditoria?.actorName === 'Equipo Registro');
}
{
    const r = res();
    await admin.default.update(req({ params: { id: idRegistro }, body: { clubName: 'Bogotá Teusaquillo' } }), r);
    check('editar guarda el cambio y actualiza la foto de respuestas',
        r.body?.registration?.clubName === 'Bogotá Teusaquillo'
        && r.body?.registration?.answers?.clubName === 'Bogotá Teusaquillo');
    const editHist = db.tablas.EventRegistrationHistory.find(h => h.type === 'completed_edited');
    check('…con el valor anterior y el nuevo en el historial',
        JSON.parse(editHist?.payload || '{}')?.changed?.clubName?.from === 'Bogotá Multicentro');
}
{
    const antes = mail.enviados.length;
    const r = res();
    await admin.default.resend(req({ params: { id: idRegistro }, body: {} }), r);
    check('reenviar la confirmación vuelve a salir y queda registrado',
        r.body?.sent === true && mail.enviados.length === antes + 1);
}
{
    const r = res();
    await admin.default.receiptUrl(req({ params: { id: idRegistro } }), r);
    check('el comprobante se abre con un enlace FIRMADO, nunca la clave cruda',
        r.statusCode === 200 && String(r.body?.url).includes('lectura-firmada'));
}

grupo('6. Acreditación: el validado aparece sin volver a digitar nada');
{
    const r = res();
    await legacyAdmin.default.lookupForCheckIn(req({ query: { eventRef: 'ev-xiii', q: 'Solano' } }), r);
    check('la búsqueda del mostrador trae la inscripción normal Y la completada',
        (r.body?.results || []).length === 1 && (r.body?.completed || []).length === 1);
    check('la completada llega con su código y su fuente',
        r.body?.completed?.[0]?.registrationCode?.startsWith('CR4281-2027-')
        && r.body?.completed?.[0]?.registrationSource === 'manual_completed_registration');
}
{
    const r = res();
    await admin.default.checkIn(req({ params: { id: idRegistro }, body: {} }), r);
    check('el check-in queda con fecha y con quién acreditó',
        Boolean(r.body?.registration?.checkedInAt) && r.body?.registration?.checkedInBy === 'Equipo Registro');

    const r2 = res();
    await admin.default.checkIn(req({ params: { id: idRegistro }, body: { undo: true } }), r2);
    check('y se puede deshacer', r2.body?.registration?.checkedInAt === null);
}
{
    // Un registro que NO está validado no se acredita.
    receipts.objetos.set('private/event-receipts/ev-xiii/r2.pdf', { bytes: 1000, mime: 'application/pdf' });
    const r = res();
    await pub.submitCompleted(req({
        params: { slug: SLUG },
        body: {
            answers: { ...RESPUESTAS, email: 'otro@example.com', documentNumber: '999888', firstName: 'Carlos', lastName: 'Prieto' },
            receipt: { key: 'private/event-receipts/ev-xiii/r2.pdf', name: 'r2.pdf' },
        },
    }), r);
    const r2 = res();
    await admin.default.checkIn(req({ params: { id: r.body.id }, body: {} }), r2);
    check('un «Pendiente de validación» NO se puede acreditar (409)', r2.statusCode === 409);
}

grupo('7. La configuración: slug único y formulario apagable');
{
    const r = res();
    await admin.default.saveConfig(req({
        query: { eventRef: 'ev-feria' },
        body: { eventRef: 'ev-feria', config: { enabled: true, slug: SLUG } },
    }), r);
    check('otro evento NO puede quedarse con el mismo slug (409)', r.statusCode === 409);

    const r2 = res();
    await admin.default.saveConfig(req({
        query: { eventRef: 'ev-feria' },
        body: { eventRef: 'ev-feria', config: { enabled: true, slug: '' } },
    }), r2);
    check('activar sin slug se rechaza con su motivo', r2.statusCode === 400);

    const r3 = res();
    await admin.default.saveConfig(req({
        query: { eventRef: 'ev-feria' },
        body: { eventRef: 'ev-feria', config: { enabled: true, slug: 'admin' } },
    }), r3);
    check('una ruta del sitio no puede ser un slug', r3.statusCode === 400);
}
{
    // Apagar el formulario de la XIII: el público deja de poder enviar.
    const edicion = db.tablas.EventEdition.find(e => e.eventId === 'ev-xiii');
    const settings = JSON.parse(edicion.settings);
    const r0 = res();
    await admin.default.saveConfig(req({
        query: { eventRef: 'ev-xiii' },
        body: { eventRef: 'ev-xiii', config: { ...settings.completedForm, enabled: false } },
    }), r0);
    check('apagar el formulario guarda sin exigir nada más', r0.statusCode === 200);

    const r = res();
    await pub.submitCompleted(req({ params: { slug: SLUG }, body: { answers: RESPUESTAS } }), r);
    check('con el formulario apagado, el envío responde 409', r.statusCode === 409);

    const r2 = res();
    await pub.getPublicCompletedConfig(req({ params: { slug: SLUG } }), r2);
    check('la página pública lo dice (enabled: false), sin romperse',
        r2.statusCode === 200 && r2.body?.enabled === false);
}

grupo('8. La notificación de confirmación: plantilla del evento, fallo visible y reenvío (v4.945)');
const RECIBO_OK = { key: 'private/event-receipts/ev-xiii/notif.pdf', name: 'transferencia.pdf' };
const sembrarConNotif = (completedForm = {}) => {
    sembrar();
    db.tablas.EventEdition = [
        edicionDe(EVENTO, {
            completedForm: {
                enabled: true, slug: SLUG, codePrefix: 'CR4281-2027', rolePeriod: '2026-2027',
                headerImageUrl: 'https://cdn.example.org/cabecera-xiii.jpg',
                ...completedForm,
            },
        }),
        edicionDe(OTRO_EVENTO),
    ];
    receipts.objetos.set(RECIBO_OK.key, { bytes: 480000, mime: 'application/pdf' });
};
{
    // El envío feliz: el correo sale con la PLANTILLA DEL EVENTO — cabecera
    // configurada, nombre, código, fechas en español y el pie con la marca
    // real del organizador — y la bitácora guarda el message ID del proveedor.
    sembrarConNotif();
    const r = res();
    await pub.submitCompleted(req({ params: { slug: SLUG }, body: { answers: RESPUESTAS, receipt: RECIBO_OK } }), r);
    const fila = db.tablas.EventCompletedRegistration[0];
    const correo = mail.enviados.find(m => String(m.to).includes('yaneth.solano@gmail.com'));
    check('el correo salió DESPUÉS de guardar: lleva el código REAL asignado',
        r.statusCode === 201 && Boolean(correo) && String(correo.html).includes(fila.registrationCode),
        correo ? correo.subject : 'sin correo');
    check('usa la imagen de cabecera CONFIGURADA del formulario',
        String(correo?.html || '').includes('https://cdn.example.org/cabecera-xiii.jpg'));
    check('saluda por su nombre y dice las fechas del evento en español',
        String(correo?.html || '').includes('Yaneth Solano')
        && String(correo?.html || '').includes('del 28 al 30 de mayo de 2027'));
    // v4.947: el pie prefiere el logo del ENCABEZADO del sitio (columna
    // `logo`); `footerLogo` (pie.png en la semilla) queda de respaldo.
    check('el pie lleva el logotipo del ENCABEZADO del sitio y su nombre',
        String(correo?.html || '').includes('https://cdn.example.org/logo.png')
        && !String(correo?.html || '').includes('https://cdn.example.org/pie.png')
        && String(correo?.html || '').includes('Distrito 4281 de Rotary International'));
    check('no promete la validación del pago: FORM_COMPLETED confirma el registro, no el pago',
        !/pago (validado|confirmado)/i.test(String(correo?.html || '')));
    check('lleva versión en texto plano con el código',
        String(correo?.text || '').includes(fila.registrationCode));
    const msg = db.tablas.EventRegistrationMessage.find(m => m.registrationId === fila.id);
    check('la bitácora guarda el message ID del proveedor',
        msg?.status === 'sent' && /^msg-\d+$/.test(String(msg?.providerId || '')), JSON.stringify(msg).slice(0, 160));

    // Idempotencia: el envío AUTOMÁTICO no repite; el reenvío MANUAL sí.
    const antes = mail.enviados.length;
    const evento = db.tablas.CalendarEvent.find(e => e.id === 'ev-xiii');
    const config = { enabled: true, notifyEnabled: true };
    const auto = await pub.sendCompletedConfirmation(fila, evento, config, { auto: true });
    check('un segundo disparo automático se SALTEA: ya hay una confirmación enviada',
        auto.sent === false && auto.skipped === 'already_sent' && mail.enviados.length === antes);
    const manual = await pub.sendCompletedConfirmation(fila, evento, config, {});
    check('el reenvío manual sí sale: quien pulsa «Reenviar» pide exactamente eso',
        manual.sent === true && mail.enviados.length === antes + 1);
}
{
    // El fallo del proveedor: la inscripción SE CONSERVA, el error queda
    // visible con su motivo textual, y «Reenviar confirmación» lo resuelve.
    sembrarConNotif();
    mail.fallas.push('el proveedor de correo está caído');
    const r = res();
    await pub.submitCompleted(req({ params: { slug: SLUG }, body: { answers: RESPUESTAS, receipt: RECIBO_OK } }), r);
    const fila = db.tablas.EventCompletedRegistration[0];
    check('el correo falló y la inscripción quedó guardada igual (desacoplados)',
        r.statusCode === 201 && Boolean(fila?.registrationCode));
    const fallido = db.tablas.EventRegistrationMessage.find(m => m.registrationId === fila.id);
    check('el intento quedó `failed` con el motivo TEXTUAL del proveedor',
        fallido?.status === 'failed' && String(fallido?.error || '').includes('proveedor de correo está caído'));

    const r2 = res();
    await admin.default.resend(req({ params: { id: fila.id } }), r2);
    const reenvio = db.tablas.EventRegistrationMessage.filter(m => m.registrationId === fila.id && m.status === 'sent');
    check('«Reenviar confirmación» sale y queda registrado', r2.statusCode === 200 && reenvio.length === 1);
    const hist = db.tablas.EventRegistrationHistory.filter(h => h.registrationId === fila.id);
    check('el reenvío manual queda en el historial con quién lo pidió',
        hist.some(h => h.type === 'message_sent' && String(h.actorName || '').includes('Equipo Registro')));
}
{
    // El interruptor: apagada la notificación, el registro entra igual y NO
    // sale ningún correo al participante.
    sembrarConNotif({ notifyEnabled: false });
    const r = res();
    await pub.submitCompleted(req({ params: { slug: SLUG }, body: { answers: RESPUESTAS, receipt: RECIBO_OK } }), r);
    check('con la notificación apagada, el registro entra y no sale correo al participante',
        r.statusCode === 201 && !mail.enviados.some(m => String(m.to).includes('yaneth.solano@gmail.com')));
}
{
    // La vista previa y la prueba corren por la MISMA plantilla del envío real.
    sembrarConNotif({ notifySubject: 'Asunto guardado | {{nombre_evento}}' });
    const r = res();
    await admin.default.notificationPreview(req({ body: { eventRef: 'ev-xiii' } }), r);
    check('la vista previa compone con datos de ejemplo y dice el remitente',
        r.statusCode === 200 && String(r.body?.html || '').includes('María Rodríguez')
        && String(r.body?.html || '').includes('CR4281-2027-4K9ZQ')
        && String(r.body?.from || '').includes('noreply@clubplatform.org'));
    check('la vista previa resuelve el asunto GUARDADO con sus variables',
        String(r.body?.subject || '') === `Asunto guardado | ${EVENTO.title}`);
    const r1 = res();
    await admin.default.notificationPreview(req({ body: { eventRef: 'ev-xiii', subject: 'En pantalla {{codigo_registro}}' } }), r1);
    check('un override del panel (lo que está EN PANTALLA) manda sobre lo guardado',
        String(r1.body?.subject || '') === 'En pantalla CR4281-2027-4K9ZQ');

    const r2 = res();
    await admin.default.notificationTest(req({ body: { eventRef: 'ev-xiii', to: 'no-es-un-correo' } }), r2);
    check('la prueba exige un correo de destino válido (422)', r2.statusCode === 422);

    const r3 = res();
    await admin.default.notificationTest(req({ body: { eventRef: 'ev-xiii', to: 'equipo@rotary4281.org' } }), r3);
    const prueba = mail.enviados[mail.enviados.length - 1];
    check('el correo de prueba sale al destino pedido, marcado «[Prueba]»',
        r3.statusCode === 200 && String(prueba?.to).includes('equipo@rotary4281.org')
        && String(prueba?.subject).startsWith('[Prueba] '));

    mail.fallas.push('credencial inválida');
    const r4 = res();
    await admin.default.notificationTest(req({ body: { eventRef: 'ev-xiii', to: 'equipo@rotary4281.org' } }), r4);
    check('un rechazo del proveedor en la prueba responde 502 con el motivo textual',
        r4.statusCode === 502 && String(r4.body?.error || '').includes('credencial inválida'));
}

grupo('9. El motor de importación histórica: inspeccionar, validar, importar, revertir (v4.950)');
{
    sembrar();
    // Un registro COMPLETADO ya existente con la EPS vacía: el objetivo de
    // «completar el registro existente» (rellenar SÓLO vacíos).
    db.tablas.EventCompletedRegistration = [{
        id: 'comp-previa', eventId: EVENTO.id, clubId: 'club-4281',
        registrationCode: 'CR13-PREVIA', status: 'submitted',
        registrationSource: 'manual_completed_registration',
        firstName: 'Carlos', lastName: 'Mendez', documentNumber: '80111222',
        email: 'carlos.mendez@gmail.com', phone: '3009998877',
        district: '4281', clubName: 'Bogotá Multicentro', membershipType: 'socio_activo',
        clubRole: 'sin_cargo', eps: '', foodAllergy: 'Ninguno',
        emergencyName: 'Ana', emergencyPhone: '3001112233', paymentMethod: 'transferencia',
        answers: '{}', flags: '{}', createdAt: new Date().toISOString(),
    }];

    // El archivo pegado desde Excel (tab): 4 filas de datos —
    //   f1 nueva y válida · f2 duplicado confirmado de la inscripción EN LÍNEA
    //   (Yaneth, mismo correo) · f3 inválida (correo malo) · f4 duplicado del
    //   COMPLETADO existente (Carlos), trae la EPS que a aquél le falta.
    // v4.951: la última columna es la del reporte con captura — «Sí es
    // invitado, seleccione una opción:» — y la fila 1 es una invitada.
    const texto = [
        'NOMBRE\tAPELLIDO\tCEDULA\tCORREO ELECTRONICO\tCELULAR\tDISTRITO\tCLUB ROTARIO\tCONDICION\tCARGO\tEPS\tALERGIAS\tCONTACTO DE EMERGENCIA\tTELEFONO DE EMERGENCIA\tFORMA DE PAGO\tCOMPROBANTE\tSí es invitado, seleccione una opción:',
        'Daniel\tYazo\t101010\tdaniel@correo.com\t3001112244\tDistrito 4281\tBogotá Multicentro\tInvitado\tPresidente electo\tSura\tNinguna\tLuisa Yazo\t3005556677\tConsignación\thttps://viejo.example.org/comp/101.pdf\tSoy cónyuge de socio activo',
        'Yaneth\tSolano\t52111222\tyaneth.solano@gmail.com\t3001234567\t4281\tBogotá Multicentro\tSocio activo\tPresidente electo\tSanitas\tNinguno\tPedro\t3007654321\tTransferencia\t\t',
        'Rosa\tPerez\t\tcorreo-malo\t123\t4281\tBogotá Multicentro\tSocio activo\tSin cargo\tSanitas\tNinguno\tLuis\t3000000000\tTransferencia\t\t',
        'Carlos\tMendez\t80111222\tcarlos.mendez@gmail.com\t3009998877\t4281\tBogotá Multicentro\tSocio activo\tSin cargo\tCompensar\tNinguno\tAna\t3001112233\tTransferencia\t\t',
    ].join('\n');

    // El commit EXIGE la confirmación explícita (patrón v4.885).
    let r = res();
    await admin.default.importCommit(req({ body: { eventRef: EVENTO.id, text: texto } }), r);
    check('importar sin `confirm: true` responde 428: nada se crea por accidente',
        r.statusCode === 428 && db.tablas.EventImportBatch.length === 0);

    // Paso 1: inspección — cuenta, columnas y mapeo automático. No importa nada.
    r = res();
    await admin.default.importInspect(req({ body: { eventRef: EVENTO.id, text: texto } }), r);
    check('la inspección detecta filas, columnas y encabezados',
        r.statusCode === 200 && r.body.rowCount === 4 && r.body.columnCount === 16 && r.body.headerDetected === true,
        JSON.stringify({ st: r.statusCode, rc: r.body?.rowCount, cc: r.body?.columnCount }));
    check('el mapeo automático reconoce los sinónimos del archivo histórico',
        r.body.autoMapping[3] === 'email' && r.body.autoMapping[4] === 'phone'
        && r.body.autoMapping[6] === 'clubName' && r.body.autoMapping[13] === 'paymentMethod'
        && r.body.autoMapping[14] === 'receiptUrl' && r.body.autoMapping[15] === 'guestType');
    check('los destinos del mapeo salen del ESQUEMA REAL del formulario',
        (r.body.fields || []).some(f => f.key === 'eps') && (r.body.fields || []).some(f => f.key === 'emergencyPhone'));
    check('la inspección no importa nada', db.tablas.EventCompletedRegistration.length === 1);
    const autoMapping = r.body.autoMapping;

    // Pasos 3-5: la validación clasifica sin crear nada.
    r = res();
    await admin.default.importPreflight(req({ body: { eventRef: EVENTO.id, text: texto, mapping: autoMapping } }), r);
    check('el preflight clasifica: 1 lista, 2 duplicados confirmados, 1 con errores',
        r.statusCode === 200 && r.body.summary.listas === 1
        && r.body.summary.duplicadosConfirmados === 2 && r.body.summary.conErrores === 1,
        JSON.stringify(r.body?.summary));
    const fila1 = r.body.rows.find(x => x.n === 1);
    check('la normalización se ANOTA: distrito, cargo y método de pago',
        fila1.answers.district === '4281' && fila1.answers.paymentMethod === 'transferencia'
        && fila1.answers.clubRole === 'presidente_electo' && fila1.notes.length > 0);
    check('la fila inválida dice SUS errores con los mismos textos del formulario',
        /correo electrónico válido/.test(r.body.rows.find(x => x.n === 3)?.errors?.email || ''));
    check('el duplicado nombra su coincidencia y su código',
        (r.body.rows.find(x => x.n === 2)?.duplicate?.matches || []).some(m => /documento|correo/.test(m.reason)));

    // Paso 6: el commit con las decisiones — la fila 4 COMPLETA a Carlos.
    r = res();
    await admin.default.importCommit(req({
        body: {
            eventRef: EVENTO.id, text: texto, mapping: autoMapping, confirm: true,
            fileName: 'registros_conferencia_legacy.csv', initialStatus: 'submitted',
            decisions: { 4: 'completar' },
        },
    }), r);
    check('el commit crea 1, completa 1 y omite 2 (duplicado + errores)',
        r.statusCode === 201 && r.body.totals.importadas === 1 && r.body.totals.completadas === 1
        && r.body.totals.errores === 1, JSON.stringify(r.body?.totals));
    const creada = db.tablas.EventCompletedRegistration.find(x => x.email === 'daniel@correo.com');
    check('el registro importado es una fila NORMAL con origen historical_import y su lote',
        Boolean(creada) && creada.registrationSource === 'historical_import'
        && Boolean(creada.importBatchId) && /^CR13-/.test(creada.registrationCode || ''));
    // v4.958 — el archivo trae el RÓTULO del sistema anterior y la columna
    // guarda la CLAVE del catálogo: el importador lo casa y lo anota.
    check('el tipo de invitado del archivo se normaliza al catálogo (v4.958)',
        creada.membershipType === 'invitado' && creada.guestType === 'conyuge_socio_activo',
        JSON.stringify({ m: creada.membershipType, g: creada.guestType }));
    const meta = JSON.parse(creada.importMeta || '{}');
    check('los metadatos de trazabilidad viajan: archivo, fila, usuario y URL del comprobante',
        meta.fileName === 'registros_conferencia_legacy.csv' && meta.sourceRow === 1
        && meta.importedBy === 'Equipo Registro' && meta.receiptUrl === 'https://viejo.example.org/comp/101.pdf');
    check('«completar» rellenó SÓLO el vacío: la EPS entró y nada más cambió',
        db.tablas.EventCompletedRegistration.find(x => x.id === 'comp-previa').eps === 'Compensar'
        && db.tablas.EventCompletedRegistration.find(x => x.id === 'comp-previa').phone === '3009998877');
    check('cada acto queda en el historial (imported + import_filled)',
        db.tablas.EventRegistrationHistory.some(h => h.type === 'imported' && h.registrationId === creada.id)
        && db.tablas.EventRegistrationHistory.some(h => h.type === 'import_filled' && h.registrationId === 'comp-previa'));
    check('no sale NINGÚN correo por una importación histórica', mail.enviados.length === 0);

    // El registro importado aparece en el listado normal del panel.
    r = res();
    await admin.default.list(req({ query: { eventRef: EVENTO.id } }), r);
    check('el importado aparece en Inscripciones COLROTARIOS con su origen dicho',
        (r.body?.registrations || []).some(x => x.email === 'daniel@correo.com' && x.registrationSource === 'historical_import'));

    // El historial de lotes y su detalle.
    r = res();
    await admin.default.importBatches(req({ query: { eventRef: EVENTO.id } }), r);
    const batch = (r.body?.batches || [])[0];
    // En Postgres `totals` es jsonb y llega como objeto; el doble guarda lo
    // que el UPDATE escribió (el string) — se acepta cualquiera de las dos.
    const totalsDe = (b) => (typeof b?.totals === 'object' && b.totals ? b.totals : JSON.parse(b?.totals || '{}'));
    check('el lote queda en el historial con sus totales',
        Boolean(batch) && totalsDe(batch).importadas === 1 && batch.status === 'done');

    // La reversión: la fila acreditada SE CONSERVA y se nombra; la intacta se borra.
    db.tablas.EventCompletedRegistration.find(x => x.id === creada.id).checkedInAt = null;
    r = res();
    // Primero sin confirmar:
    await admin.default.importRevert(req({ params: { batchId: batch.id }, body: { eventRef: EVENTO.id } }), r);
    check('revertir sin confirmación responde 428', r.statusCode === 428);
    // Ahora una fila del lote queda acreditada: no se puede borrar.
    db.tablas.EventCompletedRegistration.find(x => x.id === creada.id).checkedInAt = new Date().toISOString();
    r = res();
    await admin.default.importRevert(req({ params: { batchId: batch.id }, body: { eventRef: EVENTO.id, confirm: true } }), r);
    check('la reversión CONSERVA la fila acreditada y lo dice con su motivo',
        r.statusCode === 200 && r.body.borradas === 0
        && r.body.conservadas.some(c => c.motivo === 'ya_acreditada')
        && db.tablas.EventCompletedRegistration.some(x => x.id === creada.id));
    check('el lote queda marcado revertido y un segundo revert responde 409',
        db.tablas.EventImportBatch[0].status === 'reverted');
    r = res();
    await admin.default.importRevert(req({ params: { batchId: batch.id }, body: { eventRef: EVENTO.id, confirm: true } }), r);
    check('…y de verdad responde 409', r.statusCode === 409);

    // Un segundo lote cuya fila sigue INTACTA sí se revierte del todo.
    r = res();
    await admin.default.importCommit(req({
        body: {
            eventRef: EVENTO.id,
            text: 'NOMBRE\tAPELLIDO\tCORREO ELECTRONICO\tCELULAR\tCEDULA\tDISTRITO\tCLUB ROTARIO\tCONDICION\tCARGO\tEPS\tALERGIAS\tCONTACTO DE EMERGENCIA\tTELEFONO DE EMERGENCIA\tFORMA DE PAGO\nLina\tRios\tlina@correo.com\t3002223344\t202020\t4281\tBogotá Multicentro\tSocio activo\tSin cargo\tSura\tNinguna\tEva\t3009990000\tTransferencia',
            confirm: true, initialStatus: 'validated',
        },
    }), r);
    check('el estado inicial del lote se respeta (validated, del catálogo acotado)',
        r.statusCode === 201 && db.tablas.EventCompletedRegistration.find(x => x.email === 'lina@correo.com')?.status === 'validated');
    const lote2 = db.tablas.EventImportBatch.find(b => b.status === 'done');
    r = res();
    await admin.default.importRevert(req({ params: { batchId: lote2.id }, body: { eventRef: EVENTO.id, confirm: true } }), r);
    check('la reversión de un lote intacto borra sus filas',
        r.statusCode === 200 && r.body.borradas === 1
        && !db.tablas.EventCompletedRegistration.some(x => x.email === 'lina@correo.com'));

    // El acceso: un administrador de OTRO sitio no alcanza el motor.
    r = res();
    await admin.default.importInspect(req({
        user: { id: 'u-ajeno', name: 'Otro', role: 'club_admin', clubId: 'club-ajeno' },
        body: { eventRef: EVENTO.id, text: 'a\tb' },
    }), r);
    check('el motor respeta el mismo gate del panel: evento ajeno = 404', r.statusCode === 404);
}

grupo('10. Acciones en bloque: cambiar estado, editar campo y eliminar (v4.952)');
{
    sembrar();
    const fila = (id, extra = {}) => ({
        id, eventId: EVENTO.id, clubId: 'club-4281',
        registrationCode: `CR13-${id.toUpperCase()}`, status: 'submitted',
        registrationSource: 'manual_completed_registration',
        firstName: id.toUpperCase(), lastName: 'Prueba', documentNumber: `9${id}`,
        email: `${id}@x.co`, phone: '3000000000',
        district: '4281', clubName: 'Bogotá Multicentro', membershipType: 'socio_activo',
        clubRole: 'sin_cargo', eps: 'Sanitas', foodAllergy: 'Ninguno',
        emergencyName: 'Ana', emergencyPhone: '3001112233', paymentMethod: 'transferencia',
        answers: '{}', flags: '{}', createdAt: new Date().toISOString(), ...extra,
    });
    receipts.resetObjetos();
    receipts.objetos.set(`private/event-receipts/${EVENTO.id}/d.pdf`, { bytes: 100, mime: 'application/pdf' });
    db.tablas.EventCompletedRegistration = [
        fila('a'), fila('b'),
        fila('c', { status: 'validated', checkedInAt: new Date().toISOString() }),
        fila('d', { receiptKey: `private/event-receipts/${EVENTO.id}/d.pdf` }),
    ];

    // La confirmación explícita (patrón v4.885): sin confirm, nada cambia.
    let r = res();
    await admin.default.bulkStatus(req({ body: { eventRef: EVENTO.id, ids: ['a', 'b'], status: 'validated' } }), r);
    check('una acción en bloque sin `confirm: true` responde 428 y no toca nada',
        r.statusCode === 428
        && db.tablas.EventCompletedRegistration.find(x => x.id === 'a').status === 'submitted');

    // Pedir corrección en bloque exige el motivo, como el cambio de a uno.
    r = res();
    await admin.default.bulkStatus(req({ body: { eventRef: EVENTO.id, ids: ['a'], status: 'needs_correction', confirm: true } }), r);
    check('corrección/rechazo en bloque sin motivo responde 400', r.statusCode === 400);

    // El cambio de estado: dos cambian, una no existe — y el desglose lo dice.
    r = res();
    await admin.default.bulkStatus(req({ body: { eventRef: EVENTO.id, ids: ['a', 'b', 'zz'], status: 'validated', confirm: true } }), r);
    check('el bloque cambia lo que existe y NOMBRA lo que no (no es atómico y se dice)',
        r.statusCode === 200 && r.body.totals.cambiadas === 2 && r.body.totals.noEncontradas === 1
        && db.tablas.EventCompletedRegistration.find(x => x.id === 'a').status === 'validated',
        JSON.stringify(r.body?.totals));
    check('cada cambio deja su fila de historial',
        db.tablas.EventRegistrationHistory.filter(h => h.type === 'completed_status_changed' && ['a', 'b'].includes(h.registrationId)).length === 2);

    // La edición en bloque: la identidad NO se puede tocar (dos puertas: la
    // pantalla no la ofrece y el servidor la rechaza — v4.868).
    r = res();
    await admin.default.bulkEdit(req({ body: { eventRef: EVENTO.id, ids: ['a'], field: 'firstName', value: 'Igual', confirm: true } }), r);
    check('un campo de IDENTIDAD se rechaza en el servidor (400)', r.statusCode === 400);
    r = res();
    await admin.default.bulkEdit(req({ body: { eventRef: EVENTO.id, ids: ['a', 'b'], field: 'clubName', value: 'Club Rotario Villavicencio', confirm: true } }), r);
    const filaA = db.tablas.EventCompletedRegistration.find(x => x.id === 'a');
    check('el campo compartido se escribe en la columna Y en la foto de answers',
        r.statusCode === 200 && r.body.totals.editadas === 2
        && filaA.clubName === 'Club Rotario Villavicencio'
        && JSON.parse(filaA.answers || '{}').clubName === 'Club Rotario Villavicencio');

    // El borrado: la acreditada SE CONSERVA y se nombra; el comprobante de la
    // borrada sale de S3; el rastro queda en el historial.
    r = res();
    await admin.default.bulkDelete(req({ body: { eventRef: EVENTO.id, ids: ['b', 'c', 'd'], confirm: true } }), r);
    check('el borrado en bloque borra 2, conserva la acreditada y lo dice con su motivo',
        r.statusCode === 200 && r.body.totals.borradas === 2
        && r.body.conservadas.some(x => x.motivo === 'ya_acreditada')
        && db.tablas.EventCompletedRegistration.some(x => x.id === 'c')
        && !db.tablas.EventCompletedRegistration.some(x => x.id === 'b' || x.id === 'd'),
        JSON.stringify(r.body?.totals));
    check('el comprobante de la fila borrada se quitó del bucket',
        receipts.eliminados.includes(`private/event-receipts/${EVENTO.id}/d.pdf`));
    check('el borrado deja su rastro en el historial (la traza sobrevive a la fila)',
        db.tablas.EventRegistrationHistory.some(h => h.type === 'completed_deleted' && h.registrationId === 'b'));

    // El gate: un administrador de otro sitio no alcanza las acciones en bloque.
    r = res();
    await admin.default.bulkDelete(req({
        user: { id: 'u-ajeno', name: 'Otro', role: 'club_admin', clubId: 'club-ajeno' },
        body: { eventRef: EVENTO.id, ids: ['a'], confirm: true },
    }), r);
    check('el bloque respeta el mismo gate del panel: evento ajeno = 404',
        r.statusCode === 404 && db.tablas.EventCompletedRegistration.some(x => x.id === 'a'));
}

// ── Resultado ────────────────────────────────────────────────────────
console.log(`\n${pasadas} comprobaciones pasaron${fallos.length ? `, ${fallos.length} FALLARON:` : '.'}`);
for (const f of fallos) console.log(`  ✗ ${f}`);
process.exit(fallos.length ? 1 : 0);
