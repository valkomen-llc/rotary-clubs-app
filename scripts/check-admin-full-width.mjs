#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Barrera — Los módulos del panel usan el ANCHO COMPLETO (v4.1307.0)
//
// `AdminLayout` es de ancho completo desde v4.1111: el área de contenido
// sólo pone un relleno lateral (px-4 / sm:px-6). Pero cada módulo puede
// volver a encerrarse en su propio contenedor `max-w-7xl mx-auto` (o 6xl,
// 5xl, max-w-[1400px]…) y en un monitor ancho aparecen otra vez dos franjas
// vacías a los lados. Eso es lo que se vio en el Centro de Gestión del
// Evento de la Feria (v4.1306) y en otros catorce módulos.
//
// Esta barrera revisa `src/pages/admin` y `src/components/admin` y ROMPE EL
// DESPLIEGUE si un `className` combina `mx-auto` con un tope de ancho de
// página (max-w-5xl o mayor, max-w-screen-*, o max-w-[≥1000px]).
//
// Los modales, las tarjetas centradas y los textos legibles usan topes
// chicos (max-w-md … max-w-4xl) y no se tocan. Si una pantalla necesita a
// propósito el contenedor acotado, se marca la línea con el comentario
// `ancho-acotado-ok` explicando por qué.
// ════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAICES = ['src/pages/admin', 'src/components/admin'];
// AdminLayout conserva la rama `wide={false}` como escape documentado.
const PERMITIDOS = new Set(['src/components/admin/AdminLayout.tsx']);

const TOPE_DE_PAGINA = /\bmax-w-(?:5xl|6xl|7xl|screen-[a-z0-9]+|\[(\d{4,})px\])/;

function archivos(dir) {
    const out = [];
    for (const nombre of readdirSync(dir)) {
        const p = join(dir, nombre);
        if (statSync(p).isDirectory()) out.push(...archivos(p));
        else if (/\.(tsx|jsx)$/.test(nombre)) out.push(p);
    }
    return out;
}

const fallos = [];
for (const raiz of RAICES) {
    for (const f of archivos(raiz)) {
        const rel = relative(process.cwd(), f).replace(/\\/g, '/');
        if (PERMITIDOS.has(rel)) continue;
        const lineas = readFileSync(f, 'utf8').split('\n');
        lineas.forEach((linea, i) => {
            if (!/\bmx-auto\b/.test(linea)) return;
            const m = linea.match(TOPE_DE_PAGINA);
            if (!m) return;
            if (m[1] && Number(m[1]) < 1000) return;
            if (linea.includes('ancho-acotado-ok') || (lineas[i - 1] || '').includes('ancho-acotado-ok')) return;
            fallos.push(`  ${rel}:${i + 1}  →  ${linea.trim().slice(0, 140)}`);
        });
    }
}

if (fallos.length) {
    console.error('\n✖ [check-admin-full-width] Hay módulos del panel encerrados en un contenedor angosto centrado:\n');
    console.error(fallos.join('\n'));
    console.error('\n  El panel es de ancho completo (AdminLayout ya pone el relleno lateral).');
    console.error('  Quitar `max-w-* mx-auto` del contenedor raíz del módulo (usar `w-full`).');
    console.error('  Si es deliberado, marcar la línea con el comentario `ancho-acotado-ok` y el motivo.\n');
    process.exit(1);
}
console.log('✓ [check-admin-full-width] Los módulos del panel usan el ancho completo.');
