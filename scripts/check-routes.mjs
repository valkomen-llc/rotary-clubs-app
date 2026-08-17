#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// UNA RUTA LITERAL NO PUEDE QUEDAR DEBAJO DE SU PARAMÉTRICA.
// npm run check:routes — corre en `prebuild` y ROMPE el despliegue.
// v4.860.0
//
// Express casa las rutas en ORDEN DE DECLARACIÓN. Si `/admin/:id` se declara
// antes que `/admin/fee-rules`, la segunda es INALCANZABLE: la petición cae en
// el manejador de la primera con `id = 'fee-rules'`.
//
// ⚠️ ES LA CUARTA CAUSA DE MÓDULO ROTO QUE NO VE NINGUNA OTRA COMPROBACIÓN.
// El typecheck no la ve —los archivos del servidor son `.js` fuera de su
// alcance—, `check:syntax` tampoco —el archivo parsea perfectamente— y las
// pruebas de criterio menos —el criterio nunca estuvo mal—. Sólo se ve
// haciendo la petición, o leyendo el orden como hace esto.
//
// Y el fallo es MUDO Y ENGAÑOSO: no da 404, da la respuesta del manejador
// equivocado. Guardar la tarifa de la plataforma contestaba «Estado inválido.
// Los admitidos son: pending, processing, completed, rejected» — un mensaje que
// no menciona ni tarifas ni comisiones y manda a diagnosticar a otro sitio.
//
// El aviso ya estaba escrito EN PROSA dentro de `payouts.js` desde v4.847 y el
// defecto entró igual, por la otra puerta: el comentario hablaba de un GET y
// llegó un PUT. Un comentario que depende de que alguien lo lea no protege
// nada.
// ════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'server/routes';

/** Los segmentos de una ruta, sin los vacíos. */
const segmentos = (r) => r.split('/').filter(Boolean);

/**
 * ¿La ruta paramétrica captura a la literal?
 *
 * Express casa por SEGMENTO: hace falta la misma cantidad, y cada segmento de
 * la paramétrica tiene que ser igual al de la literal o un `:parametro`.
 *
 * ⚠️ Comparar por PREFIJO da falsos positivos a montones —`/` sería prefijo de
 * todo— y un guardián que grita en falso se termina desactivando, que es peor
 * que no tenerlo. Medido: por prefijo salían 48 casos y por segmentos son 3.
 */
const captura = (parametrica, literal) => {
    const a = segmentos(parametrica), b = segmentos(literal);
    if (a.length !== b.length) return false;
    return a.every((s, i) => s.startsWith(':') || s === b[i]);
};

const rutasDe = (archivo) => {
    const out = [];
    readFileSync(archivo, 'utf8').split('\n').forEach((linea, i) => {
        const m = linea.match(/router\.(get|put|post|delete|patch)\(\s*['"]([^'"]+)['"]/);
        if (m) out.push({ linea: i + 1, metodo: m[1], ruta: m[2] });
    });
    return out;
};

const problemas = [];
let archivos = 0, total = 0;

for (const nombre of readdirSync(DIR).filter(f => f.endsWith('.js')).sort()) {
    const archivo = join(DIR, nombre);
    const rutas = rutasDe(archivo);
    archivos++; total += rutas.length;
    for (const par of rutas) {
        if (!par.ruta.includes(':')) continue;
        for (const lit of rutas) {
            if (lit.metodo !== par.metodo || lit.ruta.includes(':')) continue;
            // Sólo importa lo declarado DESPUÉS: antes es inofensivo.
            if (lit.linea > par.linea && captura(par.ruta, lit.ruta)) {
                problemas.push(
                    `  ${archivo}\n` +
                    `    ${lit.metodo.toUpperCase()} ${lit.ruta} (línea ${lit.linea}) es INALCANZABLE:\n` +
                    `    la captura ${par.ruta} (línea ${par.linea}), declarada antes.\n` +
                    `    Mové la literal por ENCIMA de la paramétrica.`
                );
            }
        }
    }
}

if (problemas.length) {
    console.error(`\n[check-routes] ${problemas.length} ruta(s) inalcanzable(s):\n`);
    console.error(problemas.join('\n\n'));
    console.error('\nExpress casa en orden de declaración: la primera que coincide gana.');
    console.error('El fallo es MUDO — la petición recibe la respuesta del manejador equivocado.\n');
    process.exit(1);
}

console.log(`[check-routes] ${total} rutas en ${archivos} archivos, ninguna tapada. OK.`);
