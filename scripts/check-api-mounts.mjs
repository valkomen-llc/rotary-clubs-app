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
import { readFileSync } from 'node:fs';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const local = readFileSync(`${REPO}/server/server.js`, 'utf8');
const prod = readFileSync(`${REPO}/api/index.js`, 'utf8');

const mounted = (src) => new Set([...src.matchAll(/app\.(?:use|get|post|put|patch|delete|all)\(\s*['"](\/api\/[^'"]+)['"]/g)].map(m => m[1].replace(/\/$/, '')));
const inLocal = mounted(local);
const inProd = mounted(prod);
// Prefijos que producción atiende con un montaje más general (el prefijo basta).
const covered = (p) => inProd.has(p) || [...inProd].some(q => p.startsWith(q + '/'));
const missing = [...inLocal].filter(p => !covered(p)).sort();

if (missing.length) {
    console.error('✗ [check-api-mounts] Rutas montadas en server/server.js que NO existen en producción (api/index.js):');
    for (const p of missing) console.error(`   · ${p}`);
    console.error('  Producción arranca por api/index.js: móntalas ahí también (con el cargador perezoso).');
    process.exit(1);
}
console.log(`✓ [check-api-mounts] ${inLocal.size} prefijos de server.js, todos montados en api/index.js.`);
