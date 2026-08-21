#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Barrera 5 — un import que pide un símbolo que el módulo NO exporta
// v4.884
//
// Corre en `prebuild` y ROMPE EL DESPLIEGUE. Es la QUINTA causa de módulo
// caído y la única que quedaba sin cubrir; `CLAUDE.md` ya la daba por
// descubierta y sin barrera:
//
//   «Sigue sin cubrirse el error de importación en tiempo de ejecución
//    —importar un símbolo que el módulo no exporta— porque comprobarlo
//    exigiría ejecutar los módulos, y eso arrastra la base de datos.»
//
// Se cobró en v4.883: `server/lib/siteStatus.js` YA EXISTÍA —la validación de
// suscripción del módulo de Capacitaciones— y se escribió un archivo nuevo
// encima. `trainingPublicController.js` siguió importando `evaluateSiteStatus`,
// que dejó de existir, y **la función entera dejó de arrancar: TODA la
// plataforma respondió 500**, incluido el panel.
//
// Ninguna de las otras barreras lo ve:
//   · el typecheck sólo mira `src`, y esto fue en `server`;
//   · `check-syntax` da el archivo por bueno — parsea perfectamente;
//   · `check-routes` mira el orden de las rutas, no los símbolos;
//   · las pruebas del módulo importan el criterio, no los controladores.
//
// NO se ejecutan los módulos —eso arrastraría la base—: se leen los `import`
// nombrados y se comparan contra los `export` del archivo apuntado. Es
// análisis estático, así que no hace falta ninguna credencial.
// ════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const RAICES = ['server', 'api'];
const archivos = [];
const recorrer = d => {
    if (!existsSync(d)) return;
    for (const f of readdirSync(d)) {
        if (f === 'node_modules' || f === 'prisma') continue;
        const p = join(d, f);
        if (statSync(p).isDirectory()) recorrer(p);
        else if (p.endsWith('.js') || p.endsWith('.mjs')) archivos.push(p);
    }
};
RAICES.forEach(recorrer);

/** Los nombres que un archivo EXPORTA. Estático, sin ejecutarlo. */
const exportsDe = src => {
    const out = new Set();
    // export const/let/var/function/class NOMBRE
    for (const m of src.matchAll(/^\s*export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/gm)) out.add(m[1]);
    // export { a, b as c }
    for (const m of src.matchAll(/^\s*export\s*\{([^}]*)\}/gm)) {
        m[1].split(',').forEach(x => {
            const partes = x.trim().split(/\s+as\s+/);
            const n = (partes[1] || partes[0] || '').trim();
            if (n) out.add(n);
        });
    }
    if (/^\s*export\s+default\b/m.test(src)) out.add('default');
    // `export * from '…'` re-exporta lo que no podemos resolver acá: se marca
    // para no acusar en falso.
    if (/^\s*export\s+\*/m.test(src)) out.add('*');
    return out;
};

let revisados = 0;
const problemas = [];

for (const archivo of archivos) {
    const src = readFileSync(archivo, 'utf8');
    // Sólo los imports NOMBRADOS de rutas relativas: los de node_modules no se
    // pueden resolver así, y un default no puede faltar.
    for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/g)) {
        const destino = resolve(dirname(archivo), m[2]);
        if (!existsSync(destino)) {
            problemas.push({ archivo, destino: m[2], símbolo: '(el archivo no existe)' });
            continue;
        }
        const exportados = exportsDe(readFileSync(destino, 'utf8'));
        if (exportados.has('*')) continue;   // re-exporta: no se puede decidir
        revisados++;
        for (const bruto of m[1].split(',')) {
            const nombre = bruto.trim().split(/\s+as\s+/)[0].trim();
            if (!nombre || nombre.startsWith('type ')) continue;
            if (!exportados.has(nombre)) {
                problemas.push({ archivo, destino: m[2], símbolo: nombre });
            }
        }
    }
}

if (problemas.length) {
    console.error(`\n[check-imports] ${problemas.length} importación(es) piden un símbolo que no existe:\n`);
    problemas.forEach(p => {
        console.error(`  ${p.archivo}`);
        console.error(`     importa  ${p.símbolo}  de  ${p.destino}  — que no lo exporta\n`);
    });
    console.error('  Esto NO da un error al compilar: la función revienta al arrancar');
    console.error('  y TODA la plataforma responde 500 (lo que pasó en v4.883).\n');
    process.exit(1);
}

console.log(`[check-imports] ${revisados} importaciones nombradas, todas resuelven. OK.`);
