#!/usr/bin/env node
/**
 * ⚠️ LA QUINTA CAUSA DE MÓDULO CAÍDO: UN IDENTIFICADOR QUE NO EXISTE (v4.890).
 *
 * El servidor es la única parte del proyecto que NO pasa por ningún
 * comprobador de identificadores:
 *
 *   · `npm run typecheck` mira `src` (`include: ["src"]`) y los archivos del
 *     servidor son `.js` fuera de ese alcance.
 *   · `npm run check:syntax` los da por buenos: PARSEAN perfectamente. Un
 *     identificador inexistente es un error de EJECUCIÓN, no de sintaxis.
 *   · `npm run check:hooks` corre ESLint sólo sobre `**\/*.{ts,tsx}`.
 *   · Las pruebas del sitio importan el CRITERIO —puro— y simulan la API, así
 *     que el cuerpo de un manejador puede no ejecutarse nunca.
 *
 * Por ese hueco entró el defecto de v4.888: `createBulkDisbursements` usaba
 * `destinatarios` sin declararlo —la línea que lo calcula se había quedado en
 * la función de al lado—, así que TODO desembolso en bloque contestaba 500 y no
 * registraba nada. Se reportó como «le doy completar y no aparece nada».
 *
 * Este guardián mira UNA sola regla, `no-undef`, por el mismo motivo que
 * `check:hooks` mira una sola: con el juego completo de reglas el aviso que
 * importa se perdería entre cientos heredados y el guardián se terminaría
 * desactivando.
 *
 * Degrada a AVISO si ESLint no se puede ejecutar: un despliegue no debe caerse
 * por una dependencia de desarrollo ausente.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = 'server';
const OBJETIVOS = [];

const recorrer = (dir) => {
    for (const nombre of readdirSync(dir)) {
        if (nombre === 'node_modules' || nombre === 'prisma') continue;
        const ruta = join(dir, nombre);
        if (statSync(ruta).isDirectory()) recorrer(ruta);
        else if (nombre.endsWith('.js')) OBJETIVOS.push(ruta);
    }
};

let ESLint, globals;
try {
    ({ ESLint } = await import('eslint'));
    globals = (await import('globals')).default;
} catch (e) {
    console.warn(`⚠️  check:server-undef — ESLint no disponible (${e.message}). Se salta.`);
    process.exit(0);
}

try {
    recorrer(RAIZ);
} catch (e) {
    console.warn(`⚠️  check:server-undef — no se pudo recorrer ${RAIZ}: ${e.message}`);
    process.exit(0);
}

const linter = new ESLint({
    overrideConfigFile: true,
    overrideConfig: {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            // `node` trae process, Buffer, console…; `es2021` los globales del
            // lenguaje. Sin ellos, `no-undef` marcaría medio archivo.
            globals: { ...globals.node, ...globals.es2021 },
        },
        // Se ignoran los comentarios `eslint-disable` del código: apuntan a
        // reglas del juego de TypeScript que acá no se cargan, y ESLint marca
        // como error una regla que no encuentra. Este guardián mira una sola
        // regla y no hay motivo para desactivarla en ninguna línea.
        linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: false },
        rules: { 'no-undef': 'error' },
    },
});

let resultados;
try {
    resultados = await linter.lintFiles(OBJETIVOS);
} catch (e) {
    console.warn(`⚠️  check:server-undef — ESLint falló (${e.message}). Se salta.`);
    process.exit(0);
}

const mensajes = resultados.flatMap(r =>
    r.messages.filter(m => m.ruleId === 'no-undef').map(m => ({ ...m, filePath: r.filePath })));
const fallos = mensajes.length;
if (!fallos) {
    console.log(`✅ check:server-undef — ${OBJETIVOS.length} archivos del servidor, ningún identificador inexistente.`);
    process.exit(0);
}

console.error('\n❌ IDENTIFICADORES INEXISTENTES EN EL SERVIDOR\n');
console.error('   Esto NO da un error de sintaxis: revienta al ejecutarse, así que');
console.error('   la ruta responde 500 y el módulo parece no hacer nada.\n');
for (const m of mensajes) {
    console.error(`   ${m.filePath}:${m.line}:${m.column}  ${m.message}`);
}
console.error('');
process.exit(1);
