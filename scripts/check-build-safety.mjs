#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Barrera 1 — el build no puede volver a sincronizar la base
// v4.624.0
//
// Corre como `prebuild`, así que se ejecuta en CADA despliegue y no
// necesita conexión a la base: es una comprobación de texto.
//
// Contexto: hasta v4.622 el `build` ejecutaba `prisma db push
// --accept-data-loss`. Ese comando deja la base idéntica al schema, así que
// BORRABA todas las tablas que la aplicación crea en tiempo de ejecución
// (las once ProjectFair*, BannerTemplate, EventRegistration, FAQ…). Cada
// despliegue vaciaba los datos del cliente: se perdió una inscripción pagada
// el 2026-07-28 y la plantilla de pendones el 2026-07-13.
//
// Si alguien vuelve a poner `db push` en el build, este script rompe el
// despliegue en vez de dejar que borre datos en silencio.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// Sólo se vigilan los scripts que corren solos al desplegar. `db:push` es
// deliberado y se ejecuta a mano, así que queda fuera.
const AUTOMATIC_SCRIPTS = ['build', 'vercel-build', 'postinstall', 'prebuild', 'start'];
const FORBIDDEN = /prisma\s+db\s+push|prisma\s+migrate\s+reset/;

const offenders = AUTOMATIC_SCRIPTS
    .filter(name => FORBIDDEN.test(String(pkg.scripts?.[name] || '')))
    .map(name => `  ${name}: ${pkg.scripts[name]}`);

if (offenders.length) {
    console.error(`
╔════════════════════════════════════════════════════════════════════╗
║  DESPLIEGUE DETENIDO — riesgo de pérdida de datos                  ║
╚════════════════════════════════════════════════════════════════════╝

Un script que corre solo al desplegar sincroniza la base con Prisma:

${offenders.join('\n')}

"prisma db push" deja la base IDÉNTICA al schema: borra toda tabla que
exista en la base y no esté en server/prisma/schema.prisma. La aplicación
crea 14 tablas en tiempo de ejecución que no están ahí — entre ellas las
inscripciones y pagos de la Feria de Proyectos y la plantilla de pendones.

Quítelo del script. Si de verdad necesita sincronizar el schema, hágalo a
propósito con:  npm run db:push
`);
    process.exit(1);
}

console.log('[check-build-safety] El despliegue no toca la base. OK.');
