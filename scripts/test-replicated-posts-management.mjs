/**
 * scripts/test-replicated-posts-management.mjs
 *
 * Valida la gestión completa de artículos replicados y distribuidos:
 * 1. canEditPost habilita edición en sitios destino según visibilidad y roles.
 * 2. canEditPost no permite edición si el artículo no pertenece ni está dirigido al sitio.
 * 3. decoratePost marca canEdit: true para réplicas visibles, preservando origen y badges.
 * 4. removalIntent mantiene 'retire' en réplicas para que borrar no destruya la publicación en otros sitios.
 * 5. canRetireFromSite y retirePlan mantienen la trazabilidad y la integridad multi-sitio.
 */

import assert from 'node:assert/strict';
import {
    canEditPost,
    decoratePost,
    removalIntent,
    retirePlan,
    originOf,
    isVisibleTo
} from '../server/lib/postScope.js';

console.log('🧪 Iniciando pruebas de gestión de artículos replicados (v4.1069)...');

const districtId = 'distrito-4281';
const clubA = 'club-bogota';
const clubB = 'club-quimbaya';

// Caso 1: Artículo originado en Club Platform o centralizado, distribuido a Distrito 4281 y Club B
const replicatedPost = {
    id: 'post-100',
    title: 'Unidos por Colombia: ayuda humanitaria en Bogotá',
    clubId: null,
    targetClubIds: [districtId, clubB],
    published: true,
    slug: 'unidos-por-colombia-ayuda-humanitaria-bogota'
};

// Caso 2: Artículo originado en Club A, replicado en Distrito 4281
const sharedFromClubPost = {
    id: 'post-101',
    title: 'Rotary Quimbaya entrega carpas y lámparas solares',
    clubId: clubB,
    targetClubIds: [districtId],
    published: true,
    slug: 'rotary-quimbaya-entrega-carpas-lamparas-solares'
};

// Caso 3: Artículo propio del Distrito 4281
const ownDistrictPost = {
    id: 'post-102',
    title: 'Filtros de agua para El Hormiguero y Cascajal',
    clubId: districtId,
    targetClubIds: [],
    published: true,
    slug: 'filtros-de-agua-el-hormiguero'
};

// Caso 4: Artículo de Club A no distribuido al Distrito 4281
const foreignClubPost = {
    id: 'post-103',
    title: 'Evento interno de Club Bogotá',
    clubId: clubA,
    targetClubIds: [],
    published: true,
    slug: 'evento-interno-club-bogota'
};

// Usuarios
const adminDistrict = { id: 'u1', role: 'district_admin', clubId: districtId };
const editorDistrict = { id: 'u2', role: 'editor', clubId: districtId };
const superAdmin = { id: 'u3', role: 'superadmin', clubId: null };
const memberDistrict = { id: 'u4', role: 'member', clubId: districtId };
const adminClubA = { id: 'u5', role: 'club_admin', clubId: clubA };

// --- 1. Verificación de canEditPost ---
console.log('1. Probando canEditPost...');

// Superadmin edita todo
assert.equal(canEditPost(superAdmin, replicatedPost, districtId), true, 'Superadmin debe poder editar replicatedPost');
assert.equal(canEditPost(superAdmin, foreignClubPost, districtId), true, 'Superadmin debe poder editar cualquier post');

// District Admin en Distrito 4281 debe poder editar replicatedPost y sharedFromClubPost
assert.equal(canEditPost(adminDistrict, replicatedPost, districtId), true, 'District Admin debe poder editar artículo replicado visible en su distrito');
assert.equal(canEditPost(adminDistrict, sharedFromClubPost, districtId), true, 'District Admin debe poder editar artículo compartido desde otro club visible en su distrito');
assert.equal(canEditPost(adminDistrict, ownDistrictPost, districtId), true, 'District Admin debe poder editar artículo propio');

// District Editor en Distrito 4281 debe poder editar
assert.equal(canEditPost(editorDistrict, replicatedPost, districtId), true, 'Editor del distrito debe poder editar artículo replicado');

// No debe poder editar si el post NO es visible para su sitio
assert.equal(canEditPost(adminDistrict, foreignClubPost, districtId), false, 'District Admin NO debe poder editar artículo no dirigido a su sitio');
assert.equal(canEditPost(adminClubA, ownDistrictPost, clubA), false, 'Admin de Club A NO debe poder editar post propio de Distrito 4281');

// Roles sin permisos de edición (como miembro) no deben poder editar
assert.equal(canEditPost(memberDistrict, replicatedPost, districtId), false, 'Miembro NO debe poder editar');

console.log('✅ canEditPost validado con éxito.');

// --- 2. Verificación de decoratePost ---
console.log('2. Probando decoratePost y trazabilidad de procedencia...');

const decorated = decoratePost(replicatedPost, { siteId: districtId, user: adminDistrict });
assert.equal(decorated.origin, 'replicated', 'El origen debe seguir siendo replicated para la insignia UI');
assert.equal(decorated.canEdit, true, 'canEdit debe ser true para que la UI habilite el botón de edición');
assert.equal(decorated.targetCount, 2, 'targetCount debe mantenerse');
assert.equal(decorated.removal?.action, 'retire', 'La acción de eliminación debe ser retirar para no borrar en otros sitios');

console.log('✅ decoratePost validado con éxito.');

// --- 3. Verificación de removalIntent y retirePlan ---
console.log('3. Probando removalIntent y retirePlan para réplicas...');

const removal = removalIntent(adminDistrict, replicatedPost, districtId);
assert.equal(removal.action, 'retire', 'Eliminar desde el sitio destino debe ser retiro');

const plan = retirePlan(replicatedPost, districtId);
assert.deepEqual(plan.targets, [clubB], 'El plan de retiro debe conservar los demás destinos (clubB)');
assert.equal(plan.unpublish, false, 'El artículo debe permanecer publicado al no ser el último destino');

console.log('✅ removalIntent y retirePlan validados con éxito.');

console.log('🎉 Todas las pruebas de gestión de artículos replicados pasaron correctamente.');
