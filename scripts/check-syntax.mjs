// ════════════════════════════════════════════════════════════════════
// Que todo el código del servidor PARSEE — v4.721.1
//
// Corre en `prebuild` y **rompe el despliegue** si algún archivo del servidor
// tiene un error de sintaxis.
//
// ── POR QUÉ HACE FALTA ──────────────────────────────────────────────
//
// El frontend lo compila Vite: un archivo que no parsea rompe el build y se
// ve. El SERVIDOR no pasa por ningún compilador — las rutas se importan de
// forma perezosa en tiempo de ejecución—, así que un error de sintaxis viaja
// intacto a producción y sólo aparece cuando alguien usa esa pantalla. Y
// aparece mal: el módulo entero devuelve 500 con el mensaje del parser, que
// para quien lo ve es incomprensible.
//
// Pasó en v4.721.0 con `ensureDesignSchema.js`: un comentario dentro de una
// sentencia SQL llevaba una palabra entre COMILLAS INVERTIDAS, y como el SQL
// vive dentro de un template literal, esa comilla lo cerró a mitad. El
// controlador lo importa, así que toda la API de Plantillas IA respondía
// «missing ) after argument list» —traducido al español por el propio
// traductor del sitio, lo que lo volvía aún más difícil de ubicar—.
//
//   **Nunca uses comillas invertidas dentro de un `db.query(\`…\`)`.**
//
// El typecheck no ve esto (son archivos .js fuera de `include`), `check:hooks`
// tampoco, y las pruebas del módulo no lo vieron porque ninguna importaba ese
// archivo — las puras importan el criterio, y las de navegador simulan la API.
//
// La comprobación va EN PARALELO: en serie son ~7 s sobre 225 archivos, y un
// paso de prebuild que cuesta siete segundos termina desactivándose.
// ════════════════════════════════════════════════════════════════════

import { execFile } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cpus } from 'node:os';

const RAICES = ['server', 'api', 'scripts'];
const OMITIR = new Set(['node_modules', 'dist', '.git', 'prisma']);

const archivos = [];
const recorrer = (dir) => {
    let entradas;
    try { entradas = readdirSync(dir); } catch { return; }
    for (const nombre of entradas) {
        if (OMITIR.has(nombre)) continue;
        const ruta = join(dir, nombre);
        let st;
        try { st = statSync(ruta); } catch { continue; }
        if (st.isDirectory()) recorrer(ruta);
        else if (/\.(js|mjs|cjs)$/.test(nombre)) archivos.push(ruta);
    }
};
RAICES.forEach(recorrer);

const comprobar = (ruta) => new Promise(resolve => {
    execFile(process.execPath, ['--check', ruta], (err, _out, stderr) => {
        resolve(err ? { ruta, error: String(stderr || err.message).split('\n').slice(0, 4).join('\n') } : null);
    });
});

// Tantos a la vez como núcleos: el cuello es arrancar procesos, no parsear.
const CONCURRENCIA = Math.max(4, Math.min(16, cpus().length));
const fallos = [];
let siguiente = 0;

await Promise.all(Array.from({ length: CONCURRENCIA }, async () => {
    while (siguiente < archivos.length) {
        const r = await comprobar(archivos[siguiente++]);
        if (r) fallos.push(r);
    }
}));

if (fallos.length) {
    console.error(`\n[check-syntax] ${fallos.length} archivo(s) del servidor NO parsean:\n`);
    for (const f of fallos) console.error(`  ✗ ${f.ruta}\n${f.error.split('\n').map(l => `      ${l}`).join('\n')}\n`);
    console.error('  Un error de sintaxis en el servidor no rompe el build: viaja a producción y');
    console.error('  hace que TODO el módulo que lo importe responda 500.');
    console.error('  Causa más común: una comilla invertida dentro de un template literal de SQL.\n');
    process.exit(1);
}

console.log(`[check-syntax] ${archivos.length} archivos del servidor parsean. OK.`);
