/**
 * La versión de la plataforma, para PINTARLA.
 *
 * ⚠️ EXISTE PARA NO ARRASTRAR EL CHANGELOG ENTERO. Hasta v4.879 la barra
 * lateral del panel sacaba el número de `SYSTEM_UPDATES[0].version`, y como
 * ese array vive en `src/pages/SystemUpdates.tsx` —el historial completo de la
 * plataforma— importarlo obligaba a descargar **1,1 MB** en CADA pantalla del
 * panel, sólo para escribir «Release 4.879.0» en dos sitios.
 *
 * Lo peor no era el tamaño: era que CRECÍA SOLO. Cada versión publicada suma
 * su entrada al changelog, así que el coste de abrir cualquier pantalla del
 * panel aumentaba con cada despliegue, sin que nada avisara. Se reportó como
 * «el panel se demora mucho en cargar».
 *
 * Medido sobre el `dist` real: abrir Configuración pasó de 2.481 kB a 1.385 kB.
 *
 * NO SE SEPARA EN SILENCIO: `npm run test:version` comprueba que este número,
 * el de `package.json` y el de la primera entrada de `SYSTEM_UPDATES` sean el
 * mismo. Al bumpear la versión hay que tocar los tres — que es lo que ya
 * manda CLAUDE.md— y la prueba lo hace cumplir.
 */
export const APP_VERSION = '4.923.0';
