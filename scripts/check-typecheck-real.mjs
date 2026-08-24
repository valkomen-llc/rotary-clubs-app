#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Barrera — que el typecheck de verdad COMPRUEBE los archivos
// v4.889.0
//
// ⚠️ UN TYPECHECK QUE NO MIRA NADA Y SALE EN VERDE ES PEOR QUE NO CORRERLO.
//
// Sin `node_modules`, `tsc -p tsconfig.app.json` falla al resolver
// `vite/client`, ABORTA antes de mirar `src` y sale con **exit 0** y dos
// errores de configuración. Parece que pasó. No comprobó ni un archivo.
//
// Eso ocurrió de verdad: en v4.885-v4.888 se dio por «cero errores propios» un
// typecheck que no había leído ningún `.tsx`, y así llegó a producción un
// identificador renombrado a medias (`correo` → `correos`) que reventaba el
// botón de confirmar un desembolso. Es exactamente el fallo que CLAUDE.md ya
// documentaba para v4.687 —«se corrió el comando desnudo, no revisó nada»— por
// otra puerta: acá el comando era el correcto y lo que faltaba eran las
// dependencias.
//
// La comprobación es simple y no cuesta nada: si `tsc` no reporta NINGÚN error
// en un proyecto que arrastra cientos, o no encuentra sus tipos base, es que no
// miró. Se avisa y se sale con error para que nadie lo lea como una
// verificación.
// ════════════════════════════════════════════════════════════════════
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const raiz = new URL('..', import.meta.url).pathname;

if (!existsSync(`${raiz}node_modules/typescript`)) {
    console.error(
        '[check-typecheck] ❌ No hay `node_modules`. `tsc` abortaría antes de mirar\n'
        + '                     los archivos y saldría en VERDE sin comprobar nada.\n'
        + '                     Corré `npm ci` antes de dar por verificado un cambio.'
    );
    process.exit(1);
}

let salida = '';
try {
    salida = execFileSync('npx', ['tsc', '--noEmit', '-p', 'tsconfig.app.json'], {
        cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
} catch (e) {
    // `tsc` sale con código ≠ 0 cuando hay errores, que es lo NORMAL en este
    // proyecto: arrastra cientos heredados. La salida es lo que interesa.
    salida = `${e.stdout || ''}${e.stderr || ''}`;
}

// La señal de que no resolvió sus tipos base. Con esto, todo lo demás que
// diga no significa nada.
if (/TS2688: Cannot find type definition file/.test(salida)) {
    console.error(
        '[check-typecheck] ❌ `tsc` no encontró sus definiciones de tipos base, así que\n'
        + '                     ABORTÓ sin comprobar `src`. Su salida no verifica nada.\n'
        + '                     Corré `npm ci` y volvé a intentarlo.'
    );
    process.exit(1);
}

const errores = (salida.match(/^src\/.*error TS/gm) || []).length;
const archivos = new Set((salida.match(/^src\/[^(]+/gm) || [])).size;

// El proyecto arrastra cientos de errores heredados (CLAUDE.md). Cero es
// imposible y significa que no se miró — no que esté impecable. Si algún día
// se limpian de verdad, este número se baja A SABIENDAS.
const MINIMO_ESPERADO = 50;

if (errores < MINIMO_ESPERADO) {
    console.error(
        `[check-typecheck] ❌ Sólo ${errores} error(es) en \`src\`, y este proyecto arrastra\n`
        + `                     cientos de heredados. Es la firma de un typecheck que no\n`
        + `                     comprobó los archivos, no de un proyecto limpio.\n`
        + `                     Si de verdad se limpiaron, bajá MINIMO_ESPERADO a sabiendas.`
    );
    process.exit(1);
}

console.log(
    `[check-typecheck] OK. Comprobó de verdad: ${errores} errores heredados en ${archivos} archivos.\n`
    + `                     Lo que importa es que ninguno esté en los archivos que tocaste.`
);
