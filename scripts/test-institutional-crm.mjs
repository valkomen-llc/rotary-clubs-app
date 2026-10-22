// Pruebas PURAS del motor de conciliación institucional.
// No abren base de datos, no escriben y no dependen de la red:
//
//   node scripts/test-institutional-crm.mjs
import assert from 'node:assert/strict';
import {
  buildReconciliationPlan,
  inferPeriod,
  matchContactInstitutionally,
  normalizeInstitutionalName,
  roleLabel,
} from '../server/lib/institutionalMatching.js';

const directory = {
  profiles: [
    {
      id: 'profile-bogota',
      officialName: 'Club Rotario Bogotá',
      shortName: 'Bogotá',
      districtNumber: 4281,
      organizationType: 'rotary',
    },
    {
      id: 'profile-bogota-capital',
      officialName: 'Club Rotario Bogotá Capital',
      shortName: 'Bogotá Capital',
      districtNumber: 4281,
      organizationType: 'rotary',
    },
    {
      id: 'profile-medellin',
      officialName: 'Club Rotario Medellín',
      shortName: 'Medellín',
      districtNumber: 4281,
      organizationType: 'rotary',
    },
    {
      id: 'profile-duitama',
      officialName: 'Club Rotario Duitama',
      shortName: 'Duitama',
      districtNumber: 4281,
      organizationType: 'rotary',
    },
  ],
  now: new Date('2026-10-22T12:00:00Z'),
};

const contact = (id, extra = {}) => ({
  id,
  title: '',
  company: '',
  district: '',
  tags: [],
  listNames: [],
  customValues: {},
  ...extra,
});

// 1. Coincidencia exacta y única: se confirma.
const exact = matchContactInstitutionally(contact('c-exact', {
  customValues: { 'Nombre del Club': 'Club Rotario Bogotá' },
}), directory);
assert.equal(exact.status, 'confirmed');
assert.equal(exact.profileId, 'profile-bogota');
assert.equal(exact.confidence, 100);

// 2. Varios cargos en listas distintas: un vínculo por cargo, no sólo el primario.
const multiRole = matchContactInstitutionally(contact('c-multi', {
  customValues: { 'Nombre del Club': 'Club Rotario Bogotá' },
  listNames: [
    'Presidentes, Rotary 4281 (2026-27)',
    'Secretarios, Rotary 4281 (2026-27)',
  ],
}), directory);
assert.equal(multiRole.status, 'confirmed');
assert.deepEqual(
  multiRole.links.map((link) => link.role).sort(),
  ['president', 'secretary'],
);
assert.ok(multiRole.links.some((link) => link.isPrimary));

// 3. Un contacto del 4271 sin perfil NO se cruza contra el 4281.
const district4271 = matchContactInstitutionally(contact('c-4271', {
  customValues: { 'Nombre del Club': 'Club Rotario Bogotá', 'Distrito': '4271' },
}), directory);
assert.equal(district4271.status, 'pending');
assert.equal(district4271.profileId, null);
assert.equal(district4271.candidateProfileId, null);
assert.equal(district4271.districtNumber, 4271);
assert.equal(district4271.links[0].linkStatus, 'pending');

// 4. Sólo distrito declarado: pendiente, conserva el dato y no inventa club.
const onlyDistrict = matchContactInstitutionally(contact('c-only-district', {
  customValues: { 'Distrito': '4271' },
}), directory);
assert.equal(onlyDistrict.status, 'pending');
assert.equal(onlyDistrict.rawClubName, null);
assert.equal(onlyDistrict.districtNumber, 4271);
assert.equal(onlyDistrict.links.length, 1);
assert.equal(onlyDistrict.links[0].districtNumber, 4271);

// 5. Coincidencia aproximada: se guarda como candidata, nunca confirmada.
const ambiguous = matchContactInstitutionally(contact('c-ambiguous', {
  customValues: { 'Nombre del Club': 'Bogotá', 'Distrito': '4281' },
}), {
  profiles: [directory.profiles[1]],
  now: directory.now,
});
assert.equal(ambiguous.status, 'ambiguous');
assert.equal(ambiguous.profileId, null);
assert.equal(ambiguous.candidateProfileId, 'profile-bogota-capital');
assert.ok(ambiguous.confidence >= 75 && ambiguous.confidence < 100);

// 6. El tenant de la plataforma no es club de pertenencia.
const tenantAsClub = matchContactInstitutionally(contact('c-tenant', {
  company: 'Club Platform for Rotary',
}), directory);
assert.equal(tenantAsClub.status, 'unlinked');
assert.equal(tenantAsClub.rawClubName, null);

// 7. La clave de deduplicación incluye el contacto: dos personas del mismo
//    club y cargo no comparten fila.
const one = matchContactInstitutionally(contact('c-one', {
  customValues: { 'Nombre del Club': 'Club Rotario Bogotá' },
}), directory);
const two = matchContactInstitutionally(contact('c-two', {
  customValues: { 'Nombre del Club': 'Club Rotario Bogotá' },
}), directory);
assert.notEqual(one.links[0].dedupeKey, two.links[0].dedupeKey);
assert.equal(one.links[0].dedupeKey, 'c-one|member|2026-2027');

// 8. El plan completo cuenta contactos y vínculos planificados.
const plan = buildReconciliationPlan([
  contact('c-exact', { customValues: { 'Nombre del Club': 'Club Rotario Bogotá' } }),
  contact('c-4271', { customValues: { 'Nombre del Club': 'Club Rotario Bogotá', 'Distrito': '4271' } }),
  contact('c-unlinked', {}),
], directory);
assert.equal(plan.summary.contactsProcessed, 3);
assert.equal(plan.summary.confirmedContacts, 1);
assert.equal(plan.summary.pendingContacts, 1);
assert.equal(plan.summary.unlinkedContacts, 1);
assert.equal(plan.summary.linksPlanned, 2);

// 9. Normalización y período.
assert.equal(normalizeInstitutionalName('Club Rotario Bogotá (12345)'), 'bogota');
assert.equal(inferPeriod({ listNames: ['Presidentes, Rotary 4281 (2026-27)'] }), '2026-2027');
assert.equal(roleLabel('president'), 'Presidente');
assert.equal(roleLabel('no-existe'), 'Contacto institucional');

// 10. Rotaract/Interact no se confunden con el club rotario de la misma ciudad.
const rotaract = matchContactInstitutionally(contact('c-rotaract', {
  customValues: { 'Nombre del Club': 'Rotaract Duitama', 'Distrito': '4281' },
}), directory);
assert.equal(rotaract.status, 'pending');
assert.equal(rotaract.profileId, null);
assert.equal(rotaract.candidateProfileId, null);
assert.match(rotaract.reason, /Rotaract/);

const interact = matchContactInstitutionally(contact('c-interact', {
  customValues: { 'Nombre del Club': 'Club Interact Duitama', 'Distrito': '4281' },
}), directory);
assert.equal(interact.status, 'pending');
assert.equal(interact.profileId, null);
assert.match(interact.reason, /Interact/);

console.log('✅ test-institutional-crm: 10 grupos de reglas verificados sin tocar la base.');
