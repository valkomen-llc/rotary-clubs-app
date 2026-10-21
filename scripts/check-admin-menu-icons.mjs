#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Barrera 6 — Validación de Iconos e Identificadores en Menús Administrativos
// v4.1225.0
//
// Corre en `prebuild` y ROMPE EL DESPLIEGUE si algún icono referenciado
// en el menú lateral de AdminLayout (`icon: <Icono>`) no está importado
// desde 'lucide-react'.
//
// Contexto: en v4.1223.0 se agregó `icon: Landmark` a la opción de
// Conciliaciones y Desembolsos / Bóveda sin importarlo de lucide-react.
// Como Distrito 4281 tiene la bóveda activada por excepción fundacional,
// el administrador caía en «ReferenceError: Landmark is not defined»
// al cargar CUALQUIER sección del panel administrativo.
// ════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const adminLayoutPath = resolve(process.cwd(), 'src/components/admin/AdminLayout.tsx');

if (!existsSync(adminLayoutPath)) {
    console.error('[check-admin-menu-icons] No se encontró AdminLayout.tsx en:', adminLayoutPath);
    process.exit(1);
}

const content = readFileSync(adminLayoutPath, 'utf8');

// Extraer bloque de importación de lucide-react
const lucideMatch = content.match(/import\s*\{([^}]*)\}\s*from\s*['"]lucide-react['"]/);
if (!lucideMatch) {
    console.error('[check-admin-menu-icons] Error: No se encontró bloque de importación de lucide-react en AdminLayout.tsx');
    process.exit(1);
}

// Limpiar comentarios de una y varias líneas
const cleanBlock = lucideMatch[1].replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

const importedIcons = new Set(
    cleanBlock.split(',').map(s => {
        const trimmed = s.trim();
        if (!trimmed) return null;
        const parts = trimmed.split(/\s+as\s+/);
        return (parts[1] || parts[0]).trim();
    }).filter(Boolean)
);

// Extraer todos los 'icon: NombreIcono'
const iconUsages = [...content.matchAll(/icon:\s*([A-Za-z0-9_]+)/g)]
    .map(m => m[1])
    .filter(name => name !== 'any');

const missing = [];
for (const icon of iconUsages) {
    if (!importedIcons.has(icon)) {
        missing.push(icon);
    }
}

if (missing.length > 0) {
    console.error(`\n[check-admin-menu-icons] ❌ Error crítico: Se encontraron ${missing.length} icono(s) usados en el menú sin importar en AdminLayout.tsx:`);
    missing.forEach(icon => {
        console.error(`  - ${icon} (provoca ReferenceError al pintar el menú)`);
    });
    console.error('\nDespliegue detenido para evitar caídas en producción.\n');
    process.exit(1);
}

console.log(`✅ [check-admin-menu-icons] Los ${iconUsages.length} iconos del menú administrativo están correctamente importados (${importedIcons.size} importados). OK.`);
