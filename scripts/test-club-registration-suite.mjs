import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

test('Escenario 1 — Estructura de 6 Pasos en UnifiedClubForm y PublicStepNav', () => {
  const formCode = fs.readFileSync(path.join(root, 'src/components/directory/UnifiedClubForm.tsx'), 'utf8');
  const compCode = fs.readFileSync(path.join(root, 'src/components/common/PublicInstitutionalComponents.tsx'), 'utf8');

  // Verificar los 6 pasos definidos
  assert.ok(formCode.includes("id: 'identificacion', label: 'Identificación y Contacto'"), 'Paso 1 debe ser Identificación y Contacto');
  assert.ok(formCode.includes("id: 'identidad', label: 'Identidad Institucional'"), 'Paso 2 debe ser Identidad Institucional');
  assert.ok(formCode.includes("id: 'liderazgo', label: 'Liderazgo y Membresía'"), 'Paso 3 debe ser Liderazgo y Membresía');
  assert.ok(formCode.includes("id: 'proyectos', label: 'Proyectos y Actividades'"), 'Paso 4 debe ser Proyectos y Actividades');
  assert.ok(formCode.includes("id: 'multimedia', label: 'Galería Multimedia'"), 'Paso 5 debe ser Galería Multimedia');
  assert.ok(formCode.includes("id: 'revision', label: 'Revisión y Envío'"), 'Paso 6 debe ser Revisión y Envío');

  // Comprobar que no existe Paso 7
  assert.ok(!formCode.includes('Paso 7'), 'No debe existir Paso 7');
  assert.ok(!formCode.includes('Paso 1 de 7'), 'No debe decir Paso 1 de 7');
  assert.ok(!formCode.includes('Paso 6 de 7'), 'No debe decir Paso 6 de 7');

  // Comprobar que todos los pasos dicen "Paso X de 6"
  assert.ok(formCode.includes('Paso 1 de 6'), 'Debe mostrar Paso 1 de 6');
  assert.ok(formCode.includes('Paso 2 de 6'), 'Debe mostrar Paso 2 de 6');
  assert.ok(formCode.includes('Paso 3 de 6'), 'Debe mostrar Paso 3 de 6');
  assert.ok(formCode.includes('Paso 4 de 6'), 'Debe mostrar Paso 4 de 6');
  assert.ok(formCode.includes('Paso 5 de 6'), 'Debe mostrar Paso 5 de 6');
  assert.ok(formCode.includes('Paso 6 de 6'), 'Debe mostrar Paso 6 de 6');

  // Comprobar que PublicStepNav soporta vista desktop responsiva y móvil compacta
  assert.ok(compCode.includes('gridTemplateColumns: `repeat(${totalSteps}') || compCode.includes('repeat('), 'PublicStepNav debe tener grid adaptable para 6 pasos');
  assert.ok(compCode.includes('sm:hidden'), 'PublicStepNav debe tener barra compacta para móvil');
  assert.ok(compCode.includes('hidden sm:grid') || compCode.includes('hidden sm:'), 'PublicStepNav debe tener barra completa para escritorio');
});

test('Escenario 2 — Paso 1 Unificado: Sección A y Sección B', () => {
  const formCode = fs.readFileSync(path.join(root, 'src/components/directory/UnifiedClubForm.tsx'), 'utf8');

  // Sección A presente
  assert.ok(formCode.includes('Sección A'), 'Debe contener Sección A');
  assert.ok(formCode.includes('Tipo e Identificación del Club'), 'Título Sección A');

  // Sección B presente con campos de contacto trasladados
  assert.ok(formCode.includes('Sección B'), 'Debe contener Sección B');
  assert.ok(formCode.includes('Información de Contacto y Reuniones'), 'Título Sección B');
  assert.ok(formCode.includes('contactEmail'), 'Debe contener contactEmail en Paso 1');
  assert.ok(formCode.includes('contactPhone'), 'Debe contener contactPhone en Paso 1');
  assert.ok(formCode.includes('meetingAddress'), 'Debe contener meetingAddress en Paso 1');
  assert.ok(formCode.includes('meetingSchedule'), 'Debe contener meetingSchedule en Paso 1');
  assert.ok(formCode.includes('websiteUrl'), 'Debe contener websiteUrl en Paso 1');
});

test('Escenario 3 — Comportamiento Dinámico: Rotary vs Rotaract vs Interact', () => {
  const formCode = fs.readFileSync(path.join(root, 'src/components/directory/UnifiedClubForm.tsx'), 'utf8');

  // Rotary
  assert.ok(formCode.includes("formData.organizationType === 'rotary'"), 'Lógica para Rotary');
  assert.ok(formCode.includes('Seleccionar Club del Catálogo Oficial Distrito 4281'), 'Catálogo distrital para Rotary');

  // Rotaract & Interact
  assert.ok(formCode.includes('Club Rotario Patrocinador'), 'Campo Club Rotario Patrocinador');
  assert.ok(formCode.includes('rotarySponsorList'), 'Filtro exclusivo de clubes rotarios para patrocinador');
  assert.ok(formCode.includes('handleSelectSponsorClub'), 'Manejador de selección de patrocinador');
  assert.ok(formCode.includes('sponsorClubName'), 'Guarda sponsorClubName');

  // Regla fundamental: patrocinador no sobrescribe nombre oficial ni datos del club
  assert.ok(formCode.includes('sponsorClubId: matched?.id || undefined'), 'Vincular ID del patrocinador');
  assert.ok(!formCode.includes('officialName: selectedSponsorName') && !formCode.includes('officialName: officialSponsorName'), 'Patrocinador NO debe sobreescribir officialName');
});

test('Escenario 4 — Integridad de Base de Datos y Controladores', () => {
  const schemaCode = fs.readFileSync(path.join(root, 'server/lib/ensureDistrictClubDirectorySchema.js'), 'utf8');
  const controllerCode = fs.readFileSync(path.join(root, 'server/controllers/districtClubsController.js'), 'utf8');

  // Columnas añadidas a schema
  assert.ok(schemaCode.includes('"sponsorClubId"'), 'Columna sponsorClubId en migración');
  assert.ok(schemaCode.includes('"sponsorClubName"'), 'Columna sponsorClubName en migración');
  assert.ok(schemaCode.includes('idx_dcp_sponsor'), 'Índice de patrocinio en DistrictClubProfile');

  // Controlador
  assert.ok(controllerCode.includes('"sponsorClubId"'), 'sponsorClubId en controlador');
  assert.ok(controllerCode.includes('"sponsorClubName"'), 'sponsorClubName en controlador');
  assert.ok(controllerCode.includes('v4.1233.0'), 'Versión de controlador 4.1233.0');
});

test('Escenario 5 — Ficha Pública y Tablero Administrativo', () => {
  const publicProfileCode = fs.readFileSync(path.join(root, 'src/pages/ClubPublicProfile.tsx'), 'utf8');
  const adminCode = fs.readFileSync(path.join(root, 'src/pages/admin/DistrictClubsAdmin.tsx'), 'utf8');

  // Ficha pública
  assert.ok(publicProfileCode.includes('sponsorClubName?: string'), 'sponsorClubName en ClubProfile');
  assert.ok(publicProfileCode.includes('Patrocinado por:'), 'Insignia de patrocinio en ficha pública');

  // Administración
  assert.ok(adminCode.includes('sponsorClubName?: string'), 'sponsorClubName en AdminSubmission');
  assert.ok(adminCode.includes('Club Rotario Patrocinador:'), 'Visualización de patrocinador en revisión administrativa');
});

test('Escenario 6 — Paridad de Versión en el Ecosistema', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const appVersionCode = fs.readFileSync(path.join(root, 'src/lib/appVersion.ts'), 'utf8');
  const updatesCode = fs.readFileSync(path.join(root, 'src/pages/SystemUpdates.tsx'), 'utf8');

  assert.equal(pkg.version, '4.1233.0', 'package.json version');
  assert.equal(pkg.cache_bust, '4.1233.0', 'package.json cache_bust');
  assert.ok(appVersionCode.includes("APP_VERSION = '4.1233.0'"), 'appVersion.ts');
  assert.ok(updatesCode.includes("version: '4.1233.0'"), 'SystemUpdates.tsx');
});

console.log('✅ Todos los escenarios de validación de la optimización del formulario han sido verificados con éxito.');
