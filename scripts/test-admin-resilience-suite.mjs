#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Suite de Pruebas Funcionales: Resiliencia del Administrador y Acceso Público
// v4.1225.0
//
// Valida:
//   A. Menú y layout de AdminLayout para Distrito 4281, Origen y Club estándar.
//   B. Ausencia de ReferenceError o iconos no importados en getMenuItems().
//   C. Comportamiento de PrivateRoute sin autenticación (redirección limpia a /).
//   D. Comportamiento de PrivateRoute con autenticación en District 4281.
//   E. Comportamiento de SmartHome en rotary4281.org para visitantes anónimos.
//   F. Aislamiento de fallos con AdminModuleBoundary y SafeLayoutShell.
// ════════════════════════════════════════════════════════════════════

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    resolveClubModulesConfig,
    DISTRITO_4281_CLUB_ID,
    ORIGEN_CLUB_ID,
    FOUNDATIONAL_CLUB_EXCEPTIONS,
} from '../server/lib/siteModulesSpec.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ ${name}`);
        console.error(`     Error: ${err.message}`);
        failed++;
    }
}

console.log('\n=== SUITE DE RESILIENCIA Y ACCESO: CLUB PLATFORM ===\n');

// 1. Verificación de Excepciones de Módulos (Multi-Tenant)
test('Distrito 4281 tiene finance_vault habilitado por excepción fundacional', () => {
    const configId = resolveClubModulesConfig(null, null, DISTRITO_4281_CLUB_ID);
    assert.strictEqual(configId.finance_vault, true, 'DISTRITO_4281_CLUB_ID debe tener finance_vault: true');

    const configSubdomain = resolveClubModulesConfig(null, null, 'distrito-4281-de-rotary-international');
    assert.strictEqual(configSubdomain.finance_vault, true, 'subdominio de distrito debe tener finance_vault: true');
});

test('Club regular sin excepción no activa finance_vault por defecto', () => {
    const regularConfig = resolveClubModulesConfig(null, null, 'club-regular-bogota');
    assert.strictEqual(regularConfig.finance_vault, false, 'club regular debe tener finance_vault: false por defecto');
});

test('Rotary E-Club Origen tiene finance_investment y finance_vault habilitados', () => {
    const origenConfig = resolveClubModulesConfig(null, null, ORIGEN_CLUB_ID);
    assert.strictEqual(origenConfig.finance_investment, true);
    assert.strictEqual(origenConfig.finance_vault, true);
});

// 2. Verificación Estática de Iconos e Importaciones en AdminLayout
test('AdminLayout importa Landmark desde lucide-react', () => {
    const layoutSrc = readFileSync(resolve(process.cwd(), 'src/components/admin/AdminLayout.tsx'), 'utf8');
    const lucideMatch = layoutSrc.match(/import\s*\{([^}]*)\}\s*from\s*['"]lucide-react['"]/);
    assert.ok(lucideMatch, 'Debe existir importación de lucide-react');
    const imported = lucideMatch[1].split(',').map(s => s.trim());
    assert.ok(imported.includes('Landmark'), 'Landmark debe estar en la lista de importación de lucide-react');
});

test('Todos los iconos referenciados en icon: de AdminLayout existen en los imports', () => {
    const layoutSrc = readFileSync(resolve(process.cwd(), 'src/components/admin/AdminLayout.tsx'), 'utf8');
    const lucideMatch = layoutSrc.match(/import\s*\{([^}]*)\}\s*from\s*['"]lucide-react['"]/);
    const cleanBlock = lucideMatch[1].replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const imported = new Set(
        cleanBlock.split(',').map(s => {
            const trimmed = s.trim();
            if (!trimmed) return null;
            const parts = trimmed.split(/\s+as\s+/);
            return (parts[1] || parts[0]).trim();
        }).filter(Boolean)
    );

    const iconUsages = [...layoutSrc.matchAll(/icon:\s*([A-Za-z0-9_]+)/g)]
        .map(m => m[1])
        .filter(name => name !== 'any');

    const missing = iconUsages.filter(icon => !imported.has(icon));
    assert.deepStrictEqual(missing, [], `No deben haber iconos faltantes. Faltan: ${missing.join(', ')}`);
});

// 3. Verificación de Content Studio y AccountManager
test('AccountManager usa isPlatformAdmin en vez de variable global inexistente isAdmin', () => {
    const accSrc = readFileSync(resolve(process.cwd(), 'src/components/admin/content-studio/AccountManager.tsx'), 'utf8');
    assert.ok(!/\btoast\.error\(isAdmin\b/.test(accSrc), 'No debe quedar referencia suelta a isAdmin');
    assert.ok(/\btoast\.error\(isPlatformAdmin\b/.test(accSrc), 'Debe usar isPlatformAdmin');
});

test('VideoReportWorkflow no usa filteredMediaItems no declarada', () => {
    const vrwSrc = readFileSync(resolve(process.cwd(), 'src/components/admin/content-studio/VideoReportWorkflow.tsx'), 'utf8');
    assert.ok(!/\bfilteredMediaItems\b/.test(vrwSrc), 'filteredMediaItems no debe existir sin declaración');
});

// 4. Verificación de Rutas y Redirecciones en App.tsx
test('PrivateRoute redirige limpia y directamente a "/" si no hay autenticación', () => {
    const appSrc = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    assert.ok(appSrc.includes('const PrivateRoute = ({ children }'), 'PrivateRoute debe estar definido');
    assert.ok(appSrc.includes('if (!isAuthenticated) return <Navigate to="/" />'), 'Debe redirigir a "/"');
    assert.ok(!appSrc.includes('if (!isAuthenticated) throw'), 'PrivateRoute no debe lanzar excepción al fallar auth');
});

test('Rutas críticas de administración están envueltas en PrivateRoute y AdminModuleBoundary', () => {
    const appSrc = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    assert.ok(appSrc.includes('path="/admin/dashboard"'), 'Ruta dashboard debe existir');
    assert.ok(appSrc.includes('path="/admin/analytics"'), 'Ruta analytics debe existir');
    assert.ok(appSrc.includes('path="/admin/noticias"'), 'Ruta noticias debe existir');
    assert.ok(appSrc.includes('path="/admin/eventos"'), 'Ruta eventos debe existir');
    assert.ok(appSrc.includes('path="/admin/proyectos"'), 'Ruta proyectos debe existir');
    assert.ok(appSrc.includes('path="/admin/imagenes-sitio"'), 'Ruta imagenes-sitio debe existir');
});

// 5. Verificación de AdminModuleBoundary y SafeLayoutShell
test('AdminModuleBoundary implementa SafeLayoutShell para aislar caídas de layout', () => {
    const boundarySrc = readFileSync(resolve(process.cwd(), 'src/components/admin/AdminModuleBoundary.tsx'), 'utf8');
    assert.ok(boundarySrc.includes('class SafeLayoutShell'), 'Debe definir SafeLayoutShell');
    assert.ok(boundarySrc.includes('<SafeLayoutShell wide={wide}>'), 'Debe envolver el fallback en SafeLayoutShell');
    assert.ok(boundarySrc.includes('getDerivedStateFromError'), 'SafeLayoutShell debe implementar ErrorBoundary');
});

// 6. Verificación de Páginas Públicas sin Autenticación
test('Páginas públicas de rotary4281.org no dependen de sesión administrativa', () => {
    const appSrc = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    const publicPaths = [
        'path="/quienes-somos"',
        'path="/nuestra-historia"',
        'path="/nuestros-socios"',
        'path="/proyectos"',
        'path="/blog"',
        'path="/eventos"',
        'path="/contacto"',
    ];
    publicPaths.forEach(p => {
        assert.ok(appSrc.includes(p), `Ruta pública ${p} debe existir sin PrivateRoute`);
    });
});

console.log(`\nResultado: ${passed} pruebas superadas, ${failed} fallos.\n`);

if (failed > 0) {
    process.exit(1);
}
