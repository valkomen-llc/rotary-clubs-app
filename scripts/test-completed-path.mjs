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
    check('el formulario trae los cuatro pasos', r.body?.form?.steps?.length === 4);
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
        r.body?.form?.steps?.length === 4);
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

// ── Resultado ────────────────────────────────────────────────────────
console.log(`\n${pasadas} comprobaciones pasaron${fallos.length ? `, ${fallos.length} FALLARON:` : '.'}`);
for (const f of fallos) console.log(`  ✗ ${f}`);
process.exit(fallos.length ? 1 : 0);
