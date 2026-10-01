#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// test-content-studio-features.mjs (v4.1134.0)
//
// Prueba automatizada para el sistema de control de acceso y visibilidad
// de herramientas del Estudio de Contenido en Club Platform.
// ════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

const ROOT = process.cwd();
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

console.log('🧪 Iniciando pruebas de Control de Herramientas de Estudio de Contenido...');

let testsPassed = 0;
const check = (desc, condition) => {
    assert(condition, `FALLÓ: ${desc}`);
    console.log(`  ✅ ${desc}`);
    testsPassed++;
};

// 1. Verificar eliminación completa de la etiqueta visual DALL-E
const studioCode = read('src/pages/admin/ContentStudio.tsx');
check('Etiqueta visual "OpenAI DALL-E 3 HD Enabled" fue eliminada de ContentStudio.tsx', !studioCode.includes('OpenAI DALL-E 3 HD Enabled'));
check('Etiqueta visual "DALL-E 3 HD HABILITADO" no existe en ContentStudio.tsx', !studioCode.toLowerCase().includes('dall-e 3 hd habilitado'));
check('Generador de Post y motores de imagen siguen intactos en ContentStudio.tsx', studioCode.includes('PostGenerator') && studioCode.includes('VideoCreator'));

// 2. Metadatos y definición de herramientas en frontend y backend
const backendFeaturesCode = read('server/lib/contentStudioFeatures.js');
const frontendFeaturesCode = read('src/lib/contentStudioFeatures.ts');

const EXPECTED_TOOLS = [
    'video', 'post', 'outro', 'pendones', 'library', 'accounts', 'distribution', 'queue',
    'image_library', 'ai_reels', 'video_library', 'rotary_in_action'
];

for (const tool of EXPECTED_TOOLS) {
    check(`Backend define herramienta "${tool}"`, backendFeaturesCode.includes(`'${tool}'`) || backendFeaturesCode.includes(`"${tool}"`));
    check(`Frontend define herramienta "${tool}"`, frontendFeaturesCode.includes(`'${tool}'`) || frontendFeaturesCode.includes(`"${tool}"`));
}

// 3. Backend: funciones y middleware
check('Backend exporta getClubStudioFeatures', backendFeaturesCode.includes('export const getClubStudioFeatures'));
check('Backend exporta saveClubStudioFeatures', backendFeaturesCode.includes('export const saveClubStudioFeatures'));
check('Backend exporta requireStudioTool', backendFeaturesCode.includes('export const requireStudioTool'));
check('Backend exporta getStudioFeatures (controlador)', backendFeaturesCode.includes('export const getStudioFeatures'));
check('Backend exporta updateStudioFeatures (controlador)', backendFeaturesCode.includes('export const updateStudioFeatures'));
check('requireStudioTool otorga bypass total a isGlobalAdmin', backendFeaturesCode.includes('scope.isGlobalAdmin') && backendFeaturesCode.includes('return next();'));
check('requireStudioTool responde 403 STUDIO_TOOL_DISABLED cuando está inactivo', backendFeaturesCode.includes('STUDIO_TOOL_DISABLED'));

// 4. Rutas protegidas en contentStudio.js, banner.js y social.js
const routesStudio = read('server/routes/contentStudio.js');
check('Ruta /features registrada en contentStudio.js', routesStudio.includes("router.get('/features'"));
check('Ruta /features/all registrada en contentStudio.js', routesStudio.includes("router.get('/features/all'"));
check('Ruta PUT /features registrada en contentStudio.js', routesStudio.includes("router.put('/features'"));

check('Guardia requireStudioTool(video) en Creador de Video', routesStudio.includes("requireStudioTool('video')"));
check('Guardia requireStudioTool(post) en Generador de Post', routesStudio.includes("requireStudioTool('post')"));
check('Guardia requireStudioTool(outro) en Outros', routesStudio.includes("requireStudioTool('outro')"));
check('Guardia requireStudioTool(library) en Biblioteca', routesStudio.includes("requireStudioTool('library')"));
check('Guardia requireStudioTool(accounts) en Cuentas', routesStudio.includes("requireStudioTool('accounts')"));
check('Guardia requireStudioTool(queue) en Cola de Envío', routesStudio.includes("requireStudioTool('queue')"));

const routesBanner = read('server/routes/banner.js');
check('Guardia requireStudioTool(pendones) en Pendones', routesBanner.includes("requireStudioTool('pendones')"));

const routesSocial = read('server/routes/social.js');
check('Guardia requireStudioTool(distribution) en Distribución de Grupos', routesSocial.includes("requireStudioTool('distribution')"));

// 5. Componente ContentStudioToolsConfigModal.tsx
const modalCode = read('src/components/admin/content-studio/ContentStudioToolsConfigModal.tsx');
check('Modal incluye acción "Aplicar configuración predeterminada"', modalCode.includes('Aplicar configuración predeterminada'));
check('Modal incluye interruptores interactivos Activo / Inactivo', modalCode.includes('Activo') && modalCode.includes('Inactivo'));
check('Modal incluye selector de sitio con dropdown', modalCode.includes('Sitio a Configurar'));
check('Modal invoca PUT /api/content-studio/features para persistir', modalCode.includes('/api/content-studio/features') && modalCode.includes("'PUT'"));

// 6. Integración en ContentStudio.tsx
check('ContentStudio.tsx usa hook useContentStudioFeatures', studioCode.includes('useContentStudioFeatures'));
check('ContentStudio.tsx cuenta con botón "Herramientas por Sitio" para el Admin General', studioCode.includes('Herramientas por Sitio'));
check('ContentStudio.tsx condiciona tabs con isTabAllowed', studioCode.includes('isTabAllowed'));
check('ContentStudio.tsx condiciona contenidos con isTabAllowed', studioCode.includes("isTabAllowed('create')") && studioCode.includes("isTabAllowed('pendones')"));

// 7. Integración en Clubs.tsx
const clubsCode = read('src/pages/admin/Clubs.tsx');
check('Clubs.tsx importa ContentStudioToolsConfigModal', clubsCode.includes('ContentStudioToolsConfigModal'));
check('Clubs.tsx incluye botón de Herramientas Estudio de Contenido en cada fila', clubsCode.includes('Herramientas Estudio de Contenido'));

// 8. Soporte de Configuración General Global (v4.1135.0)
check('Backend exporta getGlobalStudioFeatures', backendFeaturesCode.includes('export const getGlobalStudioFeatures'));
check('Backend exporta hasClubCustomFeatures', backendFeaturesCode.includes('export const hasClubCustomFeatures'));
check('Backend saveClubStudioFeatures soporta ámbito global', backendFeaturesCode.includes("clubId === 'global'") || backendFeaturesCode.includes('isGlobal'));
check('Backend updateStudioFeatures procesa resetToGlobal', backendFeaturesCode.includes('resetToGlobal'));
check('getAllClubsStudioFeatures incluye globalFeatures en respuesta', backendFeaturesCode.includes('globalFeatures'));

// 9. Resolución de Tokens y Ámbito por Defecto en Frontend
check('Frontend exporta getStudioAuthToken que prioriza rotary_token', frontendFeaturesCode.includes('export function getStudioAuthToken') && frontendFeaturesCode.includes('rotary_token'));
check('useContentStudioFeatures usa getStudioAuthToken', frontendFeaturesCode.includes('getStudioAuthToken()'));
check('Modal importa y usa getStudioAuthToken', modalCode.includes('getStudioAuthToken'));
check('Modal incluye opción de Configuración General por defecto', modalCode.includes('Configuración General') && modalCode.includes('global'));
// 10. Soporte y Gobernanza de Distritos y Resolución Multi-Tenant
check('Backend exporta getDistrictStudioFeatures', backendFeaturesCode.includes('export const getDistrictStudioFeatures'));
check('getDistrictStudioFeatures habilita ai_reels e image_library', backendFeaturesCode.includes('image_library: true') && backendFeaturesCode.includes('ai_reels: true'));
check('Backend exporta resolveTenantScope para aislamiento multi-tenant', backendFeaturesCode.includes('export const resolveTenantScope'));
check('resolveTenantScope aísla tenants no autorizados', backendFeaturesCode.includes('__UNAUTHORIZED_TENANT__'));

// 11. Biblioteca Unificada y Módulo Rotary en Acción
check('ContentStudio.tsx integra UnifiedContentLibrary', studioCode.includes('UnifiedContentLibrary'));
check('ContentStudio.tsx no oculta videos con isPlatformAdmin hardcodeado', !studioCode.includes('{isPlatformAdmin && (\n                                <>\n                                    {/* Video Informes IA'));
check('ContentStudio.tsx define tab rotary_in_action', studioCode.includes("'rotary_in_action'"));
check('ContentStudio.tsx renderiza RotaryEnAccionAdmin embedded', studioCode.includes('<RotaryEnAccionAdmin embedded={true}'));

const unifiedCode = read('src/components/admin/content-studio/UnifiedContentLibrary.tsx');
check('UnifiedContentLibrary soporta pestañas Todos | Imágenes | Reels IA | Videos', 
    unifiedCode.includes("'all'") && unifiedCode.includes("'images'") && unifiedCode.includes("'reels'") && unifiedCode.includes("'videos'"));
check('UnifiedContentLibrary respeta feature flags de activos', 
    unifiedCode.includes('features.image_library') && unifiedCode.includes('features.ai_reels') && unifiedCode.includes('features.video_library'));

console.log(`\n🎉 Todas las ${testsPassed} pruebas pasaron satisfactoriamente.\n`);
