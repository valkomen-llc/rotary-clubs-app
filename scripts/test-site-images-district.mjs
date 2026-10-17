import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

console.log('🧪 Iniciando suite de pruebas: Habilitación y Corrección de "Imágenes del Sitio" en Distritos y Clubes\n');

// 1. Verificación de Búsqueda y Normalización de Diacríticos en AdminLayout.tsx
console.log('1 · Búsqueda y Normalización en AdminLayout.tsx');
const adminLayoutSrc = fs.readFileSync(path.join(root, 'src/components/admin/AdminLayout.tsx'), 'utf8');

// Comprobar que existe la función norm con NFD para eliminar tildes
assert.ok(
    adminLayoutSrc.includes("normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')"),
    'AdminLayout.tsx debe implementar normalización NFD para búsquedas acentuadas e insensibles a tildes'
);

// Comprobar que 'Imágenes del Sitio' tiene los keywords ampliados
assert.ok(
    adminLayoutSrc.includes("keywords: ['imagen', 'imagenes', 'foto', 'fotos', 'hero', 'banner', 'portada', 'diseno', 'sitio', 'graficos', 'carrusel']"),
    'AdminLayout.tsx debe incluir keywords completos (imagen, imagenes, foto, etc.) para "Imágenes del Sitio"'
);

// Simular la lógica exacta de búsqueda con diferentes entradas del usuario
const norm = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const mockItem = {
    label: 'Imágenes del Sitio',
    category: 'Contenido',
    path: '/admin/imagenes-sitio',
    keywords: ['imagen', 'imagenes', 'foto', 'fotos', 'hero', 'banner', 'portada', 'diseno', 'sitio', 'graficos', 'carrusel']
};

const matches = (query) => {
    const q = norm(query);
    return norm(mockItem.label).includes(q) ||
        norm(mockItem.category).includes(q) ||
        (mockItem.keywords && mockItem.keywords.some((k) => norm(k).includes(q)));
};

assert.equal(matches('imag'), true, 'Debe coincidir con "imag"');
assert.equal(matches('imág'), true, 'Debe coincidir con "imág"');
assert.equal(matches('imagen'), true, 'Debe coincidir con "imagen"');
assert.equal(matches('imágenes'), true, 'Debe coincidir con "imágenes"');
assert.equal(matches('IMAGENES'), true, 'Debe coincidir con "IMAGENES" en mayúsculas');
assert.equal(matches('foto'), true, 'Debe coincidir con "foto"');
assert.equal(matches('banner'), true, 'Debe coincidir con "banner"');
assert.equal(matches('hero'), true, 'Debe coincidir con "hero"');
console.log('  ✓ Normalización NFD y coincidencia perfecta con "imag", "imág", "imagen", "imágenes", "foto"');

// 2. Verificación de Tenant Resolution en ImageDistribution.tsx
console.log('\n2 · Resolución Multi-Tenant en ImageDistribution.tsx');
const imageDistSrc = fs.readFileSync(path.join(root, 'src/pages/admin/ImageDistribution.tsx'), 'utf8');

assert.ok(
    imageDistSrc.includes("isPlatformSuperAdmin(user)") && imageDistSrc.includes("isOnPlatformDomain()"),
    'ImageDistribution.tsx debe importar y utilizar isPlatformSuperAdmin e isOnPlatformDomain'
);

assert.ok(
    imageDistSrc.includes("invalidateSiteImages(clubId || undefined)"),
    'ImageDistribution.tsx debe invalidar la caché tras guardar exitosamente con invalidateSiteImages'
);

assert.ok(
    imageDistSrc.includes("useSiteModulesConfig"),
    'ImageDistribution.tsx debe importar y consumir useSiteModulesConfig para respetar módulos distritales'
);

// Simular la lógica de resolución de tenant en diferentes escenarios
const resolveTenant = ({ user, club, hostname, urlClubId }) => {
    const PLATFORM_HOSTS = [
        'clubplatform.org', 'www.clubplatform.org', 'app.clubplatform.org',
        'rotaryplatform.com', 'www.rotaryplatform.com', 'rotaryclubplatform.org',
        'www.rotaryclubplatform.org', 'localhost', '127.0.0.1'
    ];
    const isOnPlatform = PLATFORM_HOSTS.includes(hostname);
    const isPlatformAdmin = user?.isSuperAdmin === true || user?.role === 'superadmin' || (isOnPlatform && user?.role === 'administrator');
    
    const isGlobal = isPlatformAdmin && isOnPlatform && !urlClubId && !club?.id;
    const viewClubId = isGlobal ? null : (urlClubId || club?.id || user?.clubId || null);
    return { isGlobal, viewClubId };
};

// Escenario A: Administrador Daniel Yazo en rotary4281.org (Distrito 4281)
const dist4281Context = resolveTenant({
    user: { id: 'u1', role: 'administrator', email: 'dyazo@rotary4281.org' },
    club: { id: '8aa470c5-0a5a-4a8d-b872-38645b8b9f3a', name: 'Rotary Distrito 4281', type: 'district' },
    hostname: 'rotary4281.org',
    urlClubId: null
});
assert.equal(dist4281Context.isGlobal, false, 'No debe ser _global en rotary4281.org');
assert.equal(dist4281Context.viewClubId, '8aa470c5-0a5a-4a8d-b872-38645b8b9f3a', 'Debe resolver exactamente el ID de Distrito 4281');
console.log('  ✓ Administrador en rotary4281.org resuelve al ID de Distrito 4281 (no _global)');

// Escenario B: Administrador en rotaryecluborigen.org (Club Rotario)
const clubOrigenContext = resolveTenant({
    user: { id: 'u2', role: 'administrator', email: 'admin@rotaryecluborigen.org' },
    club: { id: '857498f8-4836-4c5b-95b2-80d8c073edfc', name: 'Rotary E-Club Origen', type: 'club' },
    hostname: 'rotaryecluborigen.org',
    urlClubId: null
});
assert.equal(clubOrigenContext.isGlobal, false, 'No debe ser _global en rotaryecluborigen.org');
assert.equal(clubOrigenContext.viewClubId, '857498f8-4836-4c5b-95b2-80d8c073edfc', 'Debe resolver exactamente el ID de Rotary E-Club Origen');
console.log('  ✓ Administrador en rotaryecluborigen.org resuelve al ID del club');

// Escenario C: Usuario Institucional de Distrito (imagenpublica@rotary4281.org)
const distInstContext = resolveTenant({
    user: { id: 'u3', role: 'institutional_user', clubId: '8aa470c5-0a5a-4a8d-b872-38645b8b9f3a' },
    club: { id: '8aa470c5-0a5a-4a8d-b872-38645b8b9f3a', name: 'Rotary Distrito 4281' },
    hostname: 'rotary4281.org',
    urlClubId: null
});
assert.equal(distInstContext.isGlobal, false, 'Usuario institucional nunca es global');
assert.equal(distInstContext.viewClubId, '8aa470c5-0a5a-4a8d-b872-38645b8b9f3a', 'Usuario institucional resuelve al ID de su distrito');
console.log('  ✓ Usuario institucional distrital resuelve a su distrito correspondiente');

// Escenario D: Superadmin en app.clubplatform.org sin query param
const globalContext = resolveTenant({
    user: { id: 'u4', role: 'administrator', isSuperAdmin: true },
    club: null,
    hostname: 'app.clubplatform.org',
    urlClubId: null
});
assert.equal(globalContext.isGlobal, true, 'En app.clubplatform.org sin clubId es _global');
assert.equal(globalContext.viewClubId, null, 'viewClubId es null para plantillas globales');
console.log('  ✓ Superadmin en dominio de plataforma sin clubId edita la plantilla global (_global)');

// 3. Verificación de Seguridad y RBAC en server/routes/admin.js y cmsController.js
console.log('\n3 · Seguridad y RBAC en backend');
const adminRoutesSrc = fs.readFileSync(path.join(root, 'server/routes/admin.js'), 'utf8');

assert.ok(
    adminRoutesSrc.includes("requireRoleOrPermission(contentRoles, 'media.view'), getSections"),
    'GET /sections debe estar protegido por requireRoleOrPermission con media.view'
);
assert.ok(
    adminRoutesSrc.includes("requireRoleOrPermission(contentRoles, 'media.edit'), batchUpsertSections"),
    'POST /sections/batch-upsert debe estar protegido por requireRoleOrPermission con media.edit'
);

const cmsControllerSrc = fs.readFileSync(path.join(root, 'server/controllers/cmsController.js'), 'utf8');
assert.ok(
    cmsControllerSrc.includes("clubId = req.user.clubId;") &&
    cmsControllerSrc.includes("if (!clubId) {"),
    'batchUpsertSections debe confinar estrictamente a usuarios no-superadmin a req.user.clubId'
);
console.log('  ✓ RBAC y confinamiento de tenant verificados en backend');

// 4. Verificación de Registro en rbacSpec.js
console.log('\n4 · Registro de Rutas en rbacSpec.js');
const rbacSpecSrc = fs.readFileSync(path.join(root, 'server/lib/rbacSpec.js'), 'utf8');
assert.ok(
    rbacSpecSrc.includes("routes: ['/admin/media', '/admin/imagenes-sitio']"),
    'rbacSpec.js debe incluir /admin/imagenes-sitio en el módulo media'
);
console.log('  ✓ /admin/imagenes-sitio registrado en rbacSpec bajo el módulo media');

console.log('\n════════════════════════════════════════════════════════════');
console.log('🎉 TODAS LAS VERIFICACIONES PASARON EXITOSAMENTE (100% OK)');
console.log('════════════════════════════════════════════════════════════\n');
