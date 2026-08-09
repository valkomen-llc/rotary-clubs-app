// ════════════════════════════════════════════════════════════════════
// Traer eventos del ecosistema del distrito — pruebas del CRITERIO — v4.747
//
//   npm run test:ecosystem
//
// Qué se comprueba: qué se copia y qué NO cuando un distrito trae el evento de
// otro sitio, cómo se rotula cada organización, a dónde apunta el enlace al
// original, y cuándo se considera que la copia se separó de su origen.
//
// Por qué existe: la parte cara de este módulo no es la consulta, es el
// criterio —copiar `metadata.registration` le pone al clon un botón
// «Inscribirme» que lleva a un formulario vacío, porque la inscripción cuelga
// del id del evento ORIGINAL—. Eso no se ve mirando la pantalla: se ve el botón
// y parece que funciona. Por eso el criterio vive aparte de la orquestación,
// igual que `seoRules.js` vive aparte de `seoAudit.js`.
//
// No necesita base, credenciales ni red. Pide `esbuild` para compilar el
// espejo del navegador (se instala aparte: npm i --no-save esbuild).
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const srv = await import('../server/lib/districtEcosystem.js');
const { isDistrictSiteType: srvIsDistrictSiteType } = await import('../server/lib/districtSite.js');

const out = await build({
    entryPoints: ['src/lib/districtEcosystem.ts'],
    bundle: true, write: false, format: 'esm', platform: 'neutral',
});
const web = await import(`data:text/javascript,${encodeURIComponent(out.outputFiles[0].text)}`);

let ok = 0; const malos = [];
const check = (n, c, e = '') => {
    if (c) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${e ? ` — ${e}` : ''}`); }
};
const grupo = t => console.log(`\n${t}`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── Datos de referencia ─────────────────────────────────────────────
const CLUB = { id: 'c1', name: 'RC Cali Norte', type: 'club', domain: 'calinorte.org', subdomain: 'calinorte' };
const FERIA = { id: 'c2', name: 'Feria de Proyectos', type: 'Feria de Proyectos', subdomain: 'feria' };
const RYE = { id: 'c3', name: 'Programa RYE', type: 'Programa de Intercambio' };
const DIST = { id: 'c4', name: 'Distrito 4281', type: 'district' };

const EVENTO = {
    id: 'e1', slug: '70-anos', title: '70 años del Club Cali Norte',
    description: 'Celebración de aniversario.', htmlContent: '<p>Hola</p>',
    startDate: '2026-08-17T19:00:00.000Z', endDate: '2026-08-17T23:00:00.000Z',
    location: 'Club Campestre, Cali', type: 'Institucional',
    image: 'https://s3/img.jpg', images: ['https://s3/a.jpg'],
    metadata: {
        venue: { name: 'Club Campestre' },
        registration: { enabled: true },
        latir: { enabled: true, price: '100' },
    },
};

// ════════════════════════════════════════════════════════════════════
grupo('── Cómo se rotula cada organización ───────────────────');

check('un club es «Club»', srv.orgBadgeOf(CLUB).label === 'Club');
check('la feria es «Feria»', srv.orgBadgeOf(FERIA).label === 'Feria');
check('el programa de intercambio es «RYE»', srv.orgBadgeOf(RYE).label === 'RYE');
check('el distrito es «Distrito»', srv.orgBadgeOf(DIST).label === 'Distrito');
check('colrotarios es «Fundación»', srv.orgBadgeOf({ type: 'colrotarios' }).label === 'Fundación');
check('un tipo desconocido no rompe: cae en «Organización»',
    srv.orgBadgeOf({ type: 'lo-que-sea' }).label === 'Organización');
check('sin club tampoco rompe', srv.orgBadgeOf(null).label === 'Organización');
check('el color viaja en hexadecimal, no como clase de Tailwind',
    /^#[0-9A-Fa-f]{6}$/.test(srv.orgBadgeOf(CLUB).color));

// `type` cae a 'club' por defecto en el modelo, así que un sitio creado desde
// el registro público lleva la verdad en `organizationType`. Si sólo se mirara
// `type`, media plataforma se rotularía «Club».
check('con `type` por defecto, manda `organizationType`',
    srv.orgBadgeOf({ type: 'club', organizationType: 'Club Rotario' }).key === 'club');
check('se reconoce por `organizationType` cuando `type` no dice nada',
    srv.orgBadgeOf({ type: '', organizationType: 'Feria de Proyectos' }).key === 'fair');
check('se reconoce por `category` como último recurso',
    srv.orgBadgeOf({ type: '', organizationType: '', category: 'foundation' }).key === 'foundation');

// ════════════════════════════════════════════════════════════════════
grupo('── La dirección del evento en el sitio de su dueño ─────');

check('con dominio propio se usa el dominio',
    srv.publicUrlOf(CLUB, EVENTO) === 'https://calinorte.org/eventos/70-anos');
check('sin dominio propio, el subdominio de plataforma',
    srv.publicUrlOf(FERIA, EVENTO) === 'https://feria.clubplatform.org/eventos/70-anos');
check('se prefiere el SLUG sobre el id (v4.658)',
    srv.publicUrlOf(CLUB, EVENTO).endsWith('/70-anos'));
check('sin slug se cae al id, que siempre existe',
    srv.publicUrlOf(CLUB, { id: 'e9' }) === 'https://calinorte.org/eventos/e9');
check('un dominio guardado con protocolo se limpia',
    srv.publicUrlOf({ domain: 'https://calinorte.org/' }, EVENTO) === 'https://calinorte.org/eventos/70-anos');
check('sin dominio ni subdominio se devuelve vacío, no una URL rota',
    srv.publicUrlOf(RYE, EVENTO) === '');
check('sin evento no hay dirección', srv.publicUrlOf(CLUB, {}) === '');

// ════════════════════════════════════════════════════════════════════
grupo('── La huella del origen ───────────────────────────────');

const traza = srv.buildSourceTrace({ event: EVENTO, club: CLUB, clonedAt: '2026-08-09T12:00:00.000Z' });
check('guarda el id del evento original', traza.eventId === 'e1');
check('guarda el sitio de origen', traza.clubId === 'c1' && traza.clubName === 'RC Cali Norte');
check('guarda la dirección pública del original',
    traza.url === 'https://calinorte.org/eventos/70-anos');
check('la fecha entra como PARÁMETRO, no se lee del reloj',
    traza.clonedAt === '2026-08-09T12:00:00.000Z');
check('sin evento o sin club no se inventa una huella',
    srv.buildSourceTrace({ event: null, club: CLUB }) === null
    && srv.buildSourceTrace({ event: EVENTO, club: null }) === null);

check('se lee la huella de un evento clonado',
    srv.sourceTraceOf({ metadata: { source: { eventId: 'e1' } } })?.eventId === 'e1');
check('un evento normal no tiene huella',
    srv.sourceTraceOf({ metadata: { venue: {} } }) === null);
check('sin metadata tampoco', srv.sourceTraceOf({}) === null);
check('metadata como TEXTO se parsea: así vuelve de algunas consultas',
    srv.sourceTraceOf({ metadata: '{"source":{"eventId":"e7"}}' })?.eventId === 'e7');
check('metadata con JSON inválido no revienta',
    srv.sourceTraceOf({ metadata: '{roto' }) === null);
check('un `source` sin eventId no cuenta como huella',
    srv.sourceTraceOf({ metadata: { source: { clubName: 'X' } } }) === null);
check('isClone responde lo mismo',
    srv.isClone({ metadata: { source: { eventId: 'e1' } } }) === true
    && srv.isClone(EVENTO) === false);

// ════════════════════════════════════════════════════════════════════
grupo('── Qué se copia y qué NO ──────────────────────────────');

const copia = srv.buildClonePayload({
    event: EVENTO, club: CLUB, clonedAt: '2026-08-09T12:00:00.000Z', slug: '70-anos',
});

check('se copia el título', copia.title === EVENTO.title);
check('se copian las fechas', copia.startDate === EVENTO.startDate && copia.endDate === EVENTO.endDate);
check('se copian la ubicación y el tipo',
    copia.location === EVENTO.location && copia.type === EVENTO.type);
check('se copian la portada y la galería',
    copia.image === EVENTO.image && eq(copia.images, EVENTO.images));

// EL PUNTO DE TODO ESTE ARCHIVO. `EventEdition."eventId"` es UNIQUE y las
// categorías, inscripciones y pagos cuelgan de `eventId`: el clon tiene un id
// nuevo, así que no hay formulario detrás. Copiar estas dos llaves le pondría
// un botón «Inscribirme» que no lleva a ninguna parte.
check('NO se copia `registration`: la inscripción vive en el evento original',
    copia.metadata.registration === undefined);
check('NO se copia `latir`: es la otra llave del panel de inscripción',
    copia.metadata.latir === undefined);
check('SÍ se copia `venue`: la sede es un dato del lugar, no del cobro',
    eq(copia.metadata.venue, EVENTO.metadata.venue));
check('la copia lleva su huella', copia.metadata.source.eventId === 'e1');
check('el original no se toca al construir la copia',
    EVENTO.metadata.registration?.enabled === true);

const copiaDeCopia = srv.buildClonePayload({
    event: { id: 'e2', title: 'X', metadata: { source: { eventId: 'viejo' } } },
    club: CLUB, clonedAt: 'z', slug: null,
});
check('la huella vieja no se arrastra: se reescribe con el origen real',
    copiaDeCopia.metadata.source.eventId === 'e2');

check('metadata en texto también se maneja al copiar',
    srv.buildClonePayload({
        event: { id: 'e3', title: 'Y', metadata: '{"registration":{"enabled":true},"venue":{"name":"Z"}}' },
        club: CLUB, clonedAt: 'z', slug: null,
    }).metadata.registration === undefined);

check('un evento sin metadata da una copia con sólo su huella',
    srv.buildClonePayload({ event: { id: 'e4', title: 'Z' }, club: CLUB, clonedAt: 'z', slug: null })
        .metadata.source.eventId === 'e4');

// ════════════════════════════════════════════════════════════════════
grupo('── Cuándo la copia se separó del original ─────────────');

check('sin cambios no hay divergencia',
    eq(srv.divergenceOf(EVENTO, EVENTO), { missing: false, changed: [] }));

const conFecha = srv.divergenceOf(EVENTO, { ...EVENTO, startDate: '2026-08-18T19:00:00.000Z' });
check('cambiar la fecha de inicio se detecta',
    conFecha.changed.length === 1 && conFecha.changed[0].field === 'startDate');

check('la misma fecha en otro formato NO es un cambio',
    srv.divergenceOf({ startDate: '2026-08-17T19:00:00.000Z' },
        { startDate: new Date('2026-08-17T19:00:00.000Z') }).changed.length === 0);

check('null y undefined en la fecha de fin son lo mismo',
    srv.divergenceOf({ endDate: null }, { endDate: undefined }).changed.length === 0);

check('los espacios alrededor de la ubicación no cuentan',
    srv.divergenceOf({ location: ' Cali ' }, { location: 'Cali' }).changed.length === 0);

check('cambiar el título y el lugar da DOS cambios',
    srv.divergenceOf({ title: 'A', location: 'X' }, { title: 'B', location: 'Y' }).changed.length === 2);

// La descripción y el HTML cambian por correcciones de redacción; avisar de
// todo sería avisar de nada, y el aviso que salta siempre se deja de leer.
check('la descripción NO se vigila: cambia por correcciones de estilo',
    srv.divergenceOf({ description: 'a' }, { description: 'b' }).changed.length === 0);

check('«el original ya no existe» es DISTINTO de «no cambió nada»',
    srv.divergenceOf(EVENTO, null).missing === true);

grupo('── Cómo se dice ───────────────────────────────────────');
check('sin cambios no se dice nada',
    srv.divergenceMessage({ missing: false, changed: [] }) === '');
check('un cambio se enumera',
    srv.divergenceMessage(srv.divergenceOf({ title: 'A' }, { title: 'B' }))
        === 'En el sitio de origen cambió el título.');
check('dos cambios se unen con «y»',
    srv.divergenceMessage(srv.divergenceOf({ title: 'A', location: 'X' }, { title: 'B', location: 'Y' }))
        === 'En el sitio de origen cambió el título y la ubicación.');
check('tres cambios llevan comas y una «y» final',
    srv.divergenceMessage(srv.divergenceOf(
        { title: 'A', location: 'X', startDate: '2026-01-01' },
        { title: 'B', location: 'Y', startDate: '2027-01-01' },
    )) === 'En el sitio de origen cambió el título, la fecha de inicio y la ubicación.');
check('el original borrado se dice con esas palabras',
    srv.divergenceMessage({ missing: true, changed: [] })
        === 'El evento original ya no existe en su sitio.');
check('sin divergencia no revienta', srv.divergenceMessage(null) === '');

// ════════════════════════════════════════════════════════════════════
grupo('── El slug del clon no puede chocar ───────────────────');

check('un slug libre se usa tal cual', srv.freeSlug('70-anos', []) === '70-anos');
check('un slug tomado recibe sufijo', srv.freeSlug('70-anos', ['70-anos']) === '70-anos-2');
check('se sigue subiendo mientras esté tomado',
    srv.freeSlug('70-anos', ['70-anos', '70-anos-2']) === '70-anos-3');
check('la comparación no distingue mayúsculas',
    srv.freeSlug('70-Anos', ['70-anos']) === '70-anos-2');
check('un título con tildes y signos se normaliza',
    srv.freeSlug('70 Años del Club ¡Cali Norte!', []) === '70-anos-del-club-cali-norte');
check('un título sin letras ni números no da slug: se entra por el id',
    srv.freeSlug('¡!¿?', []) === null);
check('sin base tampoco', srv.freeSlug('', []) === null);
check('una lista con huecos no rompe', srv.freeSlug('x', [null, undefined, '']) === 'x');

// ════════════════════════════════════════════════════════════════════
grupo('── Qué se copia de un PROYECTO ────────────────────────');

const PROYECTO = {
    id: 'p1', slug: 'agua-potable', title: 'Agua potable para La Ladera',
    description: 'Pozo y filtros.', image: 'https://s3/p.jpg', status: 'active',
    category: 'Servicio', meta: 20000, recaudado: 7500, donantes: 34, beneficiarios: 900,
    ubicacion: 'Cali', fechaEstimada: '2026-12-01T00:00:00.000Z',
    videoUrl: 'https://youtu.be/x', images: ['https://s3/1.jpg'],
    impacto: 'Impacto', actualizaciones: 'Avances', socialCopy: 'copy',
    clubId: 'c1',
};

const copiaP = srv.buildProjectClonePayload({ project: PROYECTO, slug: 'agua-potable-2' });

check('se copia el título y la descripción',
    copiaP.title === PROYECTO.title && copiaP.description === PROYECTO.description);
check('se copian las cifras: son lo que hace que la ficha se vea completa',
    copiaP.meta === 20000 && copiaP.recaudado === 7500
    && copiaP.donantes === 34 && copiaP.beneficiarios === 900);
check('se copian la ubicación, la fecha estimada y el estado',
    copiaP.ubicacion === 'Cali' && copiaP.fechaEstimada === PROYECTO.fechaEstimada
    && copiaP.status === 'active');
check('se copia la galería', eq(copiaP.images, PROYECTO.images));
check('se usa el slug liberado, no el del original', copiaP.slug === 'agua-potable-2');

// La copia ya está publicada e indexada en el sitio de su club: dos direcciones
// con el mismo contenido se compiten en Google. `indexable` lo respeta
// `seoEntities.js`, así que la copia se ve en el sitio y no entra al sitemap.
check('la copia NACE sin indexar, para no competir con el original en Google',
    copiaP.indexable === false);

// Es el equivalente de la inscripción en un evento, y es peor: es dinero.
check('no se arrastran campos de SEO del original',
    copiaP.seoTitle === undefined && copiaP.seoDescription === undefined);

check('un proyecto sin datos no revienta al copiarse',
    srv.buildProjectClonePayload({ project: null, slug: null }).title === ''
    && srv.buildProjectClonePayload({}).images.length === 0);

grupo('── Qué se vigila de un proyecto ───────────────────────');
const trackedP = srv.PROJECT_TRACKED_FIELDS.map(f => f.key);
check('se vigilan el título, el estado, la ubicación, la fecha y la meta',
    eq(trackedP, ['title', 'status', 'ubicacion', 'fechaEstimada', 'meta']));

// Se mueven con cada aporte: vigilarlos dejaría la copia marcada como «cambió»
// para siempre, y el aviso que salta siempre se deja de leer.
check('NO se vigila `recaudado`: se mueve solo con cada aporte',
    !trackedP.includes('recaudado'));
check('NI `donantes`, por lo mismo', !trackedP.includes('donantes'));

check('un aporte nuevo en el origen NO marca la copia como divergente',
    srv.divergenceOf({ ...PROYECTO, recaudado: 7500 }, { ...PROYECTO, recaudado: 9000 },
        srv.PROJECT_TRACKED_FIELDS).changed.length === 0);
check('pero cambiar la META sí se avisa',
    srv.divergenceOf(PROYECTO, { ...PROYECTO, meta: 30000 }, srv.PROJECT_TRACKED_FIELDS)
        .changed[0]?.field === 'meta');
check('y cambiar el estado también',
    srv.divergenceOf(PROYECTO, { ...PROYECTO, status: 'completed' }, srv.PROJECT_TRACKED_FIELDS)
        .changed[0]?.field === 'status');
check('sin pasar campos se usan los del EVENTO, como siempre',
    eq(srv.divergenceOf(EVENTO, EVENTO), { missing: false, changed: [] }));

grupo('── La dirección de un proyecto en su sitio ────────────');
check('un proyecto vive bajo /proyectos, no bajo /eventos',
    srv.publicProjectUrlOf(CLUB, PROYECTO) === 'https://calinorte.org/proyectos/agua-potable');
check('sin dominio propio, el subdominio de plataforma',
    srv.publicProjectUrlOf(FERIA, PROYECTO) === 'https://feria.clubplatform.org/proyectos/agua-potable');
check('la ruta de eventos no cambió', srv.publicUrlOf(CLUB, EVENTO).includes('/eventos/'));

// ════════════════════════════════════════════════════════════════════
grupo('── `Club.district` es una LISTA, no un valor ──────────');
// El fallo de v4.747: se comparaba por igualdad exacta, así que un sitio con
// «4271, 4281» no lo reconocía NINGUNO de los dos distritos. Se reportó con la
// Feria de Proyectos, que pertenece a los dos distritos de Colombia.

check('un solo distrito', eq(srv.parseDistrictTags('4281'), ['4281']));
check('dos distritos separados por coma',
    eq(srv.parseDistrictTags('4271, 4281'), ['4271', '4281']));
check('sin espacios', eq(srv.parseDistrictTags('4271,4281'), ['4271', '4281']));
check('con el prefijo escrito', eq(srv.parseDistrictTags('Distrito 4281'), ['4281']));
check('con guion', eq(srv.parseDistrictTags('D-4281'), ['4281']));
check('varios con texto alrededor',
    eq(srv.parseDistrictTags('Distritos 4271 y 4281 de Colombia'), ['4271', '4281']));
check('se quitan los repetidos', eq(srv.parseDistrictTags('4281, 4281'), ['4281']));
check('vacío da lista vacía', eq(srv.parseDistrictTags(''), []));
check('nulo también', eq(srv.parseDistrictTags(null), []));
check('un texto sin números da lista vacía', eq(srv.parseDistrictTags('Distrito Rotario'), []));

// «42811» es OTRO número, no el 4281. Partir por lo que no es dígito lo
// resuelve solo; buscar el patrón «4281» dentro del texto no lo resolvería.
check('un número más largo NO cuenta como el corto',
    srv.districtTagsMatch('42811', '4281') === false);
check('el sitio del 4281 lo reconoce su distrito',
    srv.districtTagsMatch('4271, 4281', '4281') === true);
check('y también el otro', srv.districtTagsMatch('4271, 4281', '4271') === true);
check('un tercero no lo reconoce', srv.districtTagsMatch('4271, 4281', '4290') === false);
check('sin número no hay coincidencia', srv.districtTagsMatch('4281', '') === false);
check('el número puede llegar como entero', srv.districtTagsMatch('4281', 4281) === true);

check('se guarda separado por coma y espacio',
    srv.formatDistrictTags(['4271', '4281']) === '4271, 4281');
check('una lista vacía se guarda vacía', srv.formatDistrictTags([]) === '');
check('los huecos no dejan comas sueltas',
    srv.formatDistrictTags(['4281', '', null]) === '4281');

// El SQL del controlador tiene que aplicar el MISMO criterio. No se puede
// ejecutar sin una base, así que se comprueba sobre el archivo: que use el
// reparto por no-dígitos y que NO haya vuelto la igualdad exacta.
{
    const ctrl = readFileSync('server/controllers/districtEcosystemController.js', 'utf8');
    check('el SQL parte por lo que no es dígito, como `parseDistrictTags`',
        ctrl.includes("regexp_split_to_table(coalesce(district, ''), '[^0-9]+')"));
    check('no reaparece la comparación por igualdad exacta que causó el fallo',
        !/btrim\(coalesce\(district[^)]*\)\)\s*=\s*\$/.test(ctrl));
}

grupo('── El selector de distritos está en las cinco pantallas ');
// Esta casilla estaba escrita CINCO veces, idéntica. Arreglar una y dejar
// cuatro es la copia que se queda atrás: el panel se comportaría distinto según
// por dónde se entre.
for (const page of ['Ferias', 'Zonas', 'Programas', 'Eventos', 'Asociaciones']) {
    const src = readFileSync(`src/pages/admin/${page}.tsx`, 'utf8');
    check(`${page} usa el selector compartido`,
        src.includes('<DistrictPicker') && src.includes("from '../../components/admin/DistrictPicker'"));
    check(`${page} ya no tiene la casilla de texto libre`,
        !src.includes('placeholder="Ej: 4271, 4281, 4290..."'));
}

// ════════════════════════════════════════════════════════════════════
grupo('── Qué sitio es el de un distrito ─────────────────────');

check('la clave máquina cuenta', web.isDistrictSiteType('district') === true);
check('la etiqueta legible también', web.isDistrictSiteType('Distrito Rotario') === true);
check('un club no', web.isDistrictSiteType('club') === false);
check('nulo no', web.isDistrictSiteType(null) === false);

// Si las dos listas se separan, el botón aparece donde no debe o falta donde sí.
for (const v of ['district', 'Distrito Rotario', 'DISTRICT', ' distrito rotario ', 'club', '', null, undefined, 'Feria de Proyectos']) {
    check(`el criterio de «sitio de distrito» coincide con districtSite.js — ${JSON.stringify(v)}`,
        web.isDistrictSiteType(v) === srvIsDistrictSiteType(v));
}

// ════════════════════════════════════════════════════════════════════
grupo('── Los dos espejos dan lo MISMO ───────────────────────');
// Se comparan las SALIDAS de las funciones, no sólo las constantes: que las
// listas coincidan no demuestra que el criterio coincida.

check('ORG_BADGES es la misma lista',
    eq(srv.ORG_BADGES, web.ORG_BADGES));
check('TRACKED_FIELDS vigila los mismos campos',
    eq(srv.TRACKED_FIELDS.map(f => f.key), web.TRACKED_FIELDS.map(f => f.key)));

const CLUBES = [CLUB, FERIA, RYE, DIST, { type: 'colrotarios' }, { type: 'lo-que-sea' }, null,
    { type: 'club', organizationType: 'Feria de Proyectos' }, { category: 'project_fair' }];
for (const c of CLUBES) {
    check(`orgBadgeOf coincide — ${c ? (c.name || c.type || c.category) : 'null'}`,
        eq(srv.orgBadgeOf(c), web.orgBadgeOf(c)));
    check(`publicUrlOf coincide — ${c ? (c.name || c.type || c.category) : 'null'}`,
        srv.publicUrlOf(c, EVENTO) === web.publicUrlOf(c, EVENTO));
}

check('buildSourceTrace coincide',
    eq(srv.buildSourceTrace({ event: EVENTO, club: CLUB, clonedAt: 'z' }),
        web.buildSourceTrace({ event: EVENTO, club: CLUB, clonedAt: 'z' })));

const HUELLAS = [
    { metadata: { source: { eventId: 'e1' } } },
    { metadata: '{"source":{"eventId":"e7"}}' },
    { metadata: '{roto' },
    { metadata: { source: {} } },
    {},
];
for (const [i, h] of HUELLAS.entries()) {
    check(`sourceTraceOf coincide — caso ${i + 1}`, eq(srv.sourceTraceOf(h), web.sourceTraceOf(h)));
    check(`isClone coincide — caso ${i + 1}`, srv.isClone(h) === web.isClone(h));
}

const PARES = [
    [EVENTO, EVENTO],
    [EVENTO, { ...EVENTO, startDate: '2027-01-01' }],
    [EVENTO, null],
    [{ title: 'A', location: 'X' }, { title: 'B', location: 'Y' }],
    [{ endDate: null }, { endDate: undefined }],
];
for (const [i, [a, b]] of PARES.entries()) {
    check(`divergenceOf coincide — caso ${i + 1}`, eq(srv.divergenceOf(a, b), web.divergenceOf(a, b)));
    check(`divergenceMessage coincide — caso ${i + 1}`,
        srv.divergenceMessage(srv.divergenceOf(a, b)) === web.divergenceMessage(web.divergenceOf(a, b)));
}

const SLUGS = [['70-anos', []], ['70-anos', ['70-anos']], ['70 Años ¡Cali!', []], ['¡!', []], ['x', [null, '']]];
for (const [base, taken] of SLUGS) {
    check(`freeSlug coincide — ${JSON.stringify(base)}`,
        srv.freeSlug(base, taken) === web.freeSlug(base, taken));
}

const TAGS = ['4281', '4271, 4281', 'Distrito 4281', 'D-4281', '42811', '', null, '4281, 4281'];
for (const t of TAGS) {
    check(`parseDistrictTags coincide — ${JSON.stringify(t)}`,
        eq(srv.parseDistrictTags(t), web.parseDistrictTags(t)));
    check(`districtTagsMatch coincide — ${JSON.stringify(t)}`,
        srv.districtTagsMatch(t, '4281') === web.districtTagsMatch(t, '4281'));
}
check('formatDistrictTags coincide',
    srv.formatDistrictTags(['4271', '4281']) === web.formatDistrictTags(['4271', '4281']));
check('publicProjectUrlOf coincide',
    srv.publicProjectUrlOf(CLUB, PROYECTO) === web.publicProjectUrlOf(CLUB, PROYECTO));
check('PROJECT_TRACKED_FIELDS vigila los mismos campos',
    eq(srv.PROJECT_TRACKED_FIELDS.map(f => f.key), web.PROJECT_TRACKED_FIELDS.map(f => f.key)));
check('divergenceOf con campos de proyecto coincide',
    eq(srv.divergenceOf(PROYECTO, { ...PROYECTO, meta: 30000 }, srv.PROJECT_TRACKED_FIELDS),
        web.divergenceOf(PROYECTO, { ...PROYECTO, meta: 30000 }, web.PROJECT_TRACKED_FIELDS)));

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(56)}`);
if (malos.length) {
    console.log(`✗ ${malos.length} de ${ok + malos.length} fallaron:\n`);
    for (const m of malos) console.log(`   · ${m}`);
    process.exit(1);
}
console.log(`✓ ${ok} comprobaciones, todas bien.\n`);
