#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// check:api-mounts (v4.1321.0) — toda ruta /api montada en el servidor LOCAL
// (server/server.js) tiene que estar montada también en el de PRODUCCIÓN
// (api/index.js, el único que Vercel ejecuta).
//
// Por qué: del v4.1302 al v4.1320 /api/cursos, /api/agent-center y los
// módulos de juventud sólo se montaron en server.js. Todo funcionaba en local
// y en producción respondían «Ruta de API no encontrada».
// ════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const local = readFileSync(`${REPO}/server/server.js`, 'utf8');
const prod = readFileSync(`${REPO}/api/index.js`, 'utf8');

const mounted = (src) => new Set([...src.matchAll(/app\.(?:use|get|post|put|patch|delete|all)\(\s*['"](\/api\/[^'"]+)['"]/g)].map(m => m[1].replace(/\/$/, '')));
const inLocal = mounted(local);
const inProd = mounted(prod);
// Prefijos que producción atiende con un montaje más general (el prefijo basta).
const covered = (p) => inProd.has(p) || [...inProd].some(q => p.startsWith(q + '/'));
const missing = [...inLocal].filter(p => !covered(p)).sort();

// 2) Ningún import() con la ruta en una variable o plantilla, en api/ ni en
//    server/: Vercel sólo empaqueta en la función lo que ve en un import('…')
//    LITERAL. v4.1321 montó los routers con `import(file)` y producción dijo
//    «No se puede encontrar el módulo '/var/task/server/routes/agentCenter.js'».
const walk = (dir) => readdirSync(dir).flatMap(f => {
    const p = `${dir}/${f}`;
    if (f === 'node_modules' || f.startsWith('.')) return [];
    return statSync(p).isDirectory() ? walk(p) : (p.endsWith('.js') || p.endsWith('.mjs') ? [p] : []);
});
const dynamic = [];
for (const file of [...walk(`${REPO}/api`), ...walk(`${REPO}/server`)]) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '');
        if (/^\s*\*/.test(line)) return;
        for (const m of code.matchAll(/\bimport\(\s*([^)\s])/g)) {
            if (m[1] !== "'" && m[1] !== '"') dynamic.push(`${file.slice(REPO.length + 1)}:${i + 1}: ${line.trim().slice(0, 120)}`);
        }
    });
}
if (dynamic.length) {
    console.error('✗ [check-api-mounts] import() con la ruta en una variable: Vercel no empaqueta ese archivo y en producción no existe:');
    for (const d of dynamic) console.error(`   · ${d}`);
    console.error("  Escribe la ruta literal: import('../server/routes/x.js').");
    process.exit(1);
}

if (missing.length) {
    console.error('✗ [check-api-mounts] Rutas montadas en server/server.js que NO existen en producción (api/index.js):');
    for (const p of missing) console.error(`   · ${p}`);
    console.error('  Producción arranca por api/index.js: móntalas ahí también (con el cargador perezoso).');
    process.exit(1);
}
console.log(`✓ [check-api-mounts] ${inLocal.size} prefijos de server.js, todos montados en api/index.js.`);
