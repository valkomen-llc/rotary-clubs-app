#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Programas — semilla del piloto «Clínicas Ponseti» (Distrito 4281) — v4.1280.0
// DATABASE_URL=… npm run seed:programa-ponseti
//
// Crea el programa EN BORRADOR, vinculado al Distrito 4281 como respaldo
// institucional, con la lista de datos PENDIENTES DE VALIDACIÓN que impide
// publicarlo hasta que el equipo los confirme. No asume como confirmados el
// número de clínicas, los responsables, la gratuidad, los aliados, los
// enlaces de donación ni las cifras: todo eso queda vacío o pendiente.
//
// Idempotente: si el slug ya existe, no toca nada y lo dice. Nunca publica.
// ════════════════════════════════════════════════════════════════════
if (!process.env.DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }

const { default: db } = await import('../server/lib/db.js');
const S = await import('../server/lib/programStore.js');
const { shapeProgram, shapeLink, validateProgramDraft, validateProgramForPublish } = await import('../server/lib/programSpec.js');

const SLUG = 'clinicas-ponseti';
const existente = await S.getProgram(SLUG);
if (existente) {
    console.log(`El programa «${existente.name}» ya existe (${existente.status}, id ${existente.id}). No se toca nada.`);
    await db.pool.end();
    process.exit(0);
}

const programa = shapeProgram({
    name: 'Clínicas Ponseti',
    slug: SLUG,
    category: 'salud',
    summary: 'Programa de atención del pie equinovaro (pie zambo) con el método Ponseti, respaldado por el Distrito 4281. Información pendiente de validación.',
    description: 'Borrador inicial del piloto. La descripción institucional, la ruta de orientación, las condiciones de acceso y el texto sobre costos deben ser escritos y aprobados por el equipo del programa antes de publicar.',
    sections: undefined,
    ctas: [
        { label: 'Necesito orientación', target: 'orientacion', enabled: true },
        { label: 'Encuentra una clínica', target: 'clinicas', enabled: true },
        { label: 'Mi club quiere participar', target: 'club', enabled: true },
    ],
    participation: { donationsEnabled: false },
    pendingValidation: [
        'Confirmar el número actual de clínicas o centros y sus datos públicos (nombre, ciudad, dirección, teléfono, condiciones de atención).',
        'Confirmar la identidad completa del coordinador, del responsable de comunicaciones, del revisor médico y del responsable de solicitudes (y su alterno).',
        'Redactar y aprobar el texto sobre costos, gratuidad o aseguramiento (no se publica sin aprobación).',
        'Confirmar las organizaciones aliadas y la autorización de uso de cada logo.',
        'Confirmar los enlaces oficiales de donación: entidad receptora, finalidad y responsable de verificación.',
        'Validar las cifras de impacto con su definición, fuente, período y responsable.',
        'Redactar y aprobar médicamente la ruta de orientación y las condiciones de acceso.',
        'Definir el correo institucional que recibe las solicitudes y la fecha de verificación de la información.',
    ],
});
const juicio = validateProgramDraft(programa);
if (!juicio.ok) { console.error('La semilla no pasa la validación de borrador:', juicio.errors); await db.pool.end(); process.exit(1); }

const ownerClubId = await S.districtSiteIdFor(4281);
const actor = { id: null, name: 'Semilla del piloto (scripts/seed-programa-ponseti.mjs)' };
const row = await S.createProgram(programa, { actor, ownerClubId, ownerDistrictNumber: 4281 });
await S.upsertLink(row.id, shapeLink({
    districtNumber: 4281, relationType: 'respaldo_institucional', status: 'activa',
    relationDescription: 'El Distrito 4281 respalda y difunde el programa. La atención clínica la prestan las instituciones de salud; el distrito no opera el servicio ni recibe donaciones por este medio.',
    showInMenu: true, showInCatalog: true, allowClubActivation: true,
}), { actor });

const faltan = validateProgramForPublish(shapeProgram(row)).errors;
console.log(`✅ «${row.name}» creado en BORRADOR (id ${row.id}, slug ${row.slug})${ownerClubId ? `, dueño: sitio ${ownerClubId}` : ', sin sitio del distrito detectado (se asigna al operador)'}.`);
console.log(`   Vinculado al Distrito 4281 como respaldo institucional. Para publicarlo faltan ${faltan.length} requisitos:`);
for (const e of faltan) console.log(`   · ${e.message}`);
console.log('   Abre /admin/programas en el sitio del distrito para completarlo. Fundación Pequeño Corazón u otro programa se crean desde el panel, sin tocar código.');
await db.pool.end();
