#!/usr/bin/env node
/**
 * Barrera 6 — las rutas se REGISTRAN de verdad, y eso no puede fallar.
 *
 * ⚠️ ESTA ES LA QUINTA CAUSA DE MÓDULO CAÍDO, y hasta v4.1027 no la veía
 * ninguna barrera. Un `router.post('/x', ctrl.handler)` donde `ctrl.handler`
 * llega `undefined` hace que Express LANCE **al cargar el módulo de rutas**, no
 * al atender la petición: como las rutas se importan de forma perezosa en
 * tiempo de ejecución, el error viaja intacto a producción y tumba el router
 * ENTERO —todos sus endpoints, no sólo el roto— en el primer arranque en frío.
 *
 * Caso real (v4.1026 → v4.1027): `resolveTransfers` se declaró DEBAJO del
 * `export default {…}` de `projectFairAdminController.js`, así que no entró en
 * el objeto que consumen las rutas. `/admin/postulaciones-pagos` quedó en «Tu
 * perfil no tiene acceso a este módulo» —la pantalla cae a su return temprano
 * cuando su configuración no carga— con un aviso rojo que no nombraba ninguna
 * capa: el mensaje de Express traducido al español por el propio traductor del
 * sitio, irreconocible al buscarlo (misma trampa que v4.721.1).
 *
 * Por qué las otras barreras no lo ven:
 *   · `npm run typecheck`          → sólo mira `src`; el servidor es `.js`.
 *   · `npm run check:syntax`       → el archivo PARSEA perfectamente. Es un
 *                                    error de ejecución, no de sintaxis.
 *   · `npm run check:hooks`        → ESLint acotado a los archivos .ts y .tsx.
 *   · `npm run check:server-undef` → `no-undef` mira IDENTIFICADORES sueltos;
 *                                    `fair.resolveTransfers` es una PROPIEDAD
 *                                    de un identificador que sí está definido.
 *   · `npm run check:routes`       → sólo compara el ORDEN de las literales
 *                                    contra sus paramétricas.
 *   · `check-imports.mjs` (v4.884) → mira los SÍMBOLOS de un `import`, y
 *                                    `fair.resolveTransfers` no es un símbolo
 *                                    importado: es una PROPIEDAD del objeto
 *                                    que se importó por defecto. Ése es el
 *                                    hueco exacto que quedaba, y es por donde
 *                                    entró v4.1026.
 *
 * ⚠️ SE CARGAN LOS MÓDULOS DE VERDAD, NO SE ANALIZA EL TEXTO. Es la decisión
 * de la que cuelga todo lo demás. Dos intentos de resolverlo leyendo los
 * archivos se estrellaron antes de llegar acá —el primero comprobaba CERO
 * manejadores y pasaba en verde con el defecto delante; el segundo denunciaba
 * en falso decenas de manejadores que sí existen, porque emparejar comillas y
 * literales de expresión regular con expresiones regulares no funciona—. Un
 * guardián que grita en falso se termina desactivando, y eso cuesta la
 * comprobación que de verdad importa. Cargar el módulo es EXACTAMENTE lo que
 * hace Express en producción: ni un falso positivo ni un falso negativo.
 *
 * ⚠️ Y SE CARGAN CON LA BASE DE DATOS NEUTRALIZADA. `prebuild` corre en el
 * despliegue, donde `DATABASE_URL` SÍ está: sin esta precaución, un módulo con
 * efectos al importarse podría escribir en la base de producción durante un
 * build — que es exactamente lo que este repositorio prohíbe desde el incidente
 * del 2026-07-13. Se vacía la variable antes de importar nada, así que
 * cualquier intento de conexión falla sin llegar a ninguna parte y el módulo se
 * carga igual (medido: el ECONNREFUSED se registra y el registro de rutas
 * ocurre completo).
 */
process.env.DATABASE_URL = '';
process.env.DIRECT_URL = '';
process.env.POSTGRES_URL = '';

import { readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DIR = 'server/routes';

/**
 * Fallos que son un DEFECTO DEL CÓDIGO y no dependen del entorno. Son los
 * únicos que rompen el despliegue.
 */
const DEFECTOS = [
    {
        prueba: /requires a callback function but got/i,
        que: 'un manejador de ruta llega undefined',
        como: 'Comprobá que el controlador EXPORTE ese nombre. Si el módulo se '
            + 'consume por defecto (`import ctrl from …`), el nombre tiene que '
            + 'estar dentro de su «export default {…}», no sólo declarado.',
    },
    {
        prueba: /does not provide an export named/i,
        que: 'se importa un nombre que el módulo no exporta',
        como: 'Revisá el nombre en las dos puntas: suele ser un renombrado a medias.',
    },
    {
        prueba: /Cannot access '.+' before initialization/i,
        que: 'se usa una declaración antes de inicializarla',
        como: 'Si es un «export default {…}» que enumera algo declarado más '
            + 'abajo, mové el objeto al FINAL del archivo.',
    },
    {
        prueba: /is not a function/i,
        que: 'se llama a algo que no es una función',
        como: 'Suele ser un import que resolvió a undefined.',
    },
];

/**
 * Fallos de ENTORNO: una dependencia que este equipo no tiene instalada o una
 * credencial ausente. No son un defecto del código y no rompen el despliegue —
 * pero se DICEN, porque un módulo que no se pudo cargar tampoco se comprobó, y
 * callarlo convertiría «todo bien» en una afirmación que no se sostiene.
 */
const ENTORNO = /Cannot find package|Cannot find module|apiKey|api_key|credential|ECONNREFUSED|ENOTFOUND/i;

const archivos = readdirSync(DIR).filter((f) => f.endsWith('.js')).sort();
const defectos = [];
const saltados = [];
let cargados = 0;

for (const archivo of archivos) {
    try {
        await import(pathToFileURL(`${DIR}/${archivo}`).href);
        cargados++;
    } catch (e) {
        const mensaje = String(e && e.message ? e.message : e).split('\n')[0];
        const defecto = DEFECTOS.find((d) => d.prueba.test(mensaje));
        if (defecto) defectos.push({ archivo, mensaje, ...defecto });
        else if (ENTORNO.test(mensaje)) saltados.push({ archivo, mensaje });
        else defectos.push({ archivo, mensaje, que: 'el módulo de rutas no se pudo cargar', como: 'Revisá qué se ejecuta al importarlo.' });
    }
}

if (defectos.length) {
    console.error('\n❌ Hay módulos de rutas que no se pueden registrar.\n');
    console.error('   Express lanza al REGISTRAR la ruta, no al atender la petición: esto');
    console.error('   tumba el router entero —todos sus endpoints— en el primer arranque');
    console.error('   en frío, y en la pantalla se ve como «no tenés acceso a este módulo».\n');
    for (const d of defectos) {
        console.error(`   · ${DIR}/${d.archivo} — ${d.que}`);
        console.error(`     ${d.mensaje}`);
        console.error(`     → ${d.como}\n`);
    }
    process.exit(1);
}

console.log(`✅ check:route-handlers — ${cargados} de ${archivos.length} módulos de rutas registran sus rutas sin error.`);
for (const s of saltados) {
    console.log(`   ⚠️  ${s.archivo} no se pudo cargar en este entorno y NO se comprobó: ${s.mensaje}`);
}
