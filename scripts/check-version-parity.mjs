#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// El número de versión no se separa en silencio — npm run test:version
//
// ⚠️ POR QUÉ EXISTE. `src/lib/appVersion.ts` afirma desde v4.879 que «`npm run
// test:version` comprueba que este número, el de `package.json` y el de la
// primera entrada de `SYSTEM_UPDATES` sean el mismo»: ESE GUION NO EXISTÍA.
// Era una guardia declarada en prosa, y una guardia que depende de que alguien
// lea un comentario no protege nada (la lección de `check:routes`, v4.859).
//
// Lo que costó: de v4.954 a v4.957 se bumpeó `package.json` y el changelog y no
// este archivo, así que la barra del panel y el banner del sitio se quedaron
// clavados en «Lanzamiento 4.953.0» mientras corría la 4.957. No falla
// ruidosamente: muestra un número viejo con total aplomo, y el cliente lo
// reporta como «¿en qué versión estamos?».
//
// Corre en `prebuild`: un bump a medias rompe el despliegue, que es la única
// forma de que no vuelva a pasar.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';

const leer = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const fallos = [];

const pkg = JSON.parse(leer('package.json'));
const version = pkg.version;

if (pkg.cache_bust !== version) {
    fallos.push(`package.json: "cache_bust" dice ${pkg.cache_bust} y "version" dice ${version}.`);
}

const app = leer('src/lib/appVersion.ts').match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
if (!app) fallos.push('src/lib/appVersion.ts: no se pudo leer APP_VERSION.');
else if (app !== version) {
    fallos.push(`src/lib/appVersion.ts: APP_VERSION dice ${app} y package.json dice ${version}.\n`
        + '     Es EL NÚMERO QUE SE PINTA en la barra del panel y en el banner del sitio:\n'
        + '     sin bumpearlo, el despliegue sale mostrando la versión anterior.');
}

// La primera entrada del changelog: `SYSTEM_UPDATES` está partido en tramos
// (TS2590), así que se busca el primer literal anotado que abra con `version:`.
const updates = leer('src/pages/SystemUpdates.tsx')
    .match(/UpdateItem\[\]\s*=\s*\[\s*\{\s*version:\s*['"]([^'"]+)['"]/)?.[1];
if (!updates) fallos.push('src/pages/SystemUpdates.tsx: no se pudo leer la primera entrada.');
else if (updates !== version) {
    fallos.push(`src/pages/SystemUpdates.tsx: la primera entrada dice ${updates} y package.json dice ${version}.`);
}

if (fallos.length) {
    console.error('\n❌ check:version — el número de versión NO coincide en los tres sitios:\n');
    for (const f of fallos) console.error(`  ✗ ${f}`);
    console.error('\n  Los tres se tocan JUNTOS al publicar (regla de versionado de CLAUDE.md):');
    console.error('    package.json (version + cache_bust) · src/lib/appVersion.ts · src/pages/SystemUpdates.tsx\n');
    process.exit(1);
}

console.log(`✅ check:version — ${version} en package.json, appVersion.ts y la primera entrada del changelog.`);
