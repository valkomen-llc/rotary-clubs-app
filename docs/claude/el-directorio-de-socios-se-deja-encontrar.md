<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## El directorio de socios se deja encontrar — v4.985

Reporte con la pantalla delante (`/admin/miembros`, Rotary Bogotá Occidente,
«45 socios» en la cabecera): «sólo puedo visualizar los que tienen un rol —
honorario, gobernador, autor o junta—; deberían aparecer los 45».

| Archivo | Qué es |
|---|---|
| `src/lib/memberDirectory.ts` | El CRITERIO. **Puro**: texto comparable sin tildes, qué socio coincide con la búsqueda y con la pestaña, cuántos quedan fuera y la frase que lo dice |
| `src/pages/admin/MembersPage.tsx` | Consume el criterio: resumen «Mostrando N de 45», conteo en cada pestaña, «Ver los 45» y el final del directorio |

Pruebas: `npm run test:members` (39 casos: 27 de criterio con `esbuild` y 12 en
un navegador con la pantalla REAL, 45 socios simulados y el CSS compilado;
cada bloque se salta solo si le falta su herramienta). Verificadas a la
inversa: sin quitar las tildes fallan 8.

- **⚠️ ANTES DE TOCAR NADA SE MIDIÓ, Y LA PANTALLA PINTABA LOS 45.** Montada
  en Chromium con 18 socios con categoría y 27 sin ella, bajo TODOS salen 45
  tarjetas y la 45 se alcanza desplazando. El criterio (`filter === 'all'`)
  no dejaba fuera a nadie y la cabecera, los KPI y la rejilla salen del MISMO
  array. Corregir «el filtro» habría sido corregir lo que no estaba roto — la
  lección de v4.744 al revés: el criterio puede estar bien y el defecto vivir
  en cómo se deja usar.
- **⚠️ LO QUE FALLABA ERA ENCONTRARLOS: el buscador era sensible a las
  tildes.** `name.toLowerCase().includes(q.toLowerCase())` no encuentra a
  «Pérez» escribiendo «Perez» ni a «Ramírez» escribiendo «ramirez», y un
  directorio de socios colombianos está lleno de tildes que nadie escribe
  igual dos veces. Un socio que no se encuentra se reporta como un socio que
  no está. `normalizeText` (NFD sin marcas diacríticas, minúsculas, espacios
  colapsados) es el ÚNICO punto de comparación, y cada palabra de la consulta
  tiene que estar, en cualquier orden. Busca también en el cargo de junta:
  «tesorero» tiene que encontrar al tesorero.
- **⚠️ Y NADA DECÍA CUÁNTOS SE ESTABAN MOSTRANDO.** Los socios con categoría
  se agregan «al inicio de la lista» (posición negativa) y ocupan las
  primeras pantallas; el contenido del panel vive en un contenedor con la
  barra de desplazamiento OCULTA (`scrollbar-hide` en `AdminLayout`), así que
  un directorio de once mil píxeles no da ninguna señal de que siga. Es la
  regla de v4.964 (en macOS la barra se esconde y una tabla ancha no parece
  desplazable) en vertical. Se resuelve DICIÉNDOLO donde se mira: «Mostrando
  los 45 socios del directorio» arriba, el conteo en cada pestaña, y «Fin del
  directorio · 45 de 45» debajo de la última tarjeta. **No se tocó
  `AdminLayout`**: es de todas las pantallas del panel y no lo pidió nadie.
- **Un vacío con filtro NOMBRA el total y ofrece la salida** («Ninguno de los
  45 socios coincide con «x» … pulsa «Ver los 45»»). Antes decía «Prueba con
  otro término», que no distingue «no existe» de «lo filtraste» (v4.938: un
  vacío sin explicación es indistinguible de «no hay nada»). Y el botón de
  «Agregar primer miembro» sólo sale con el directorio VACÍO de verdad: con
  45 socios y una búsqueda sin coincidencias invitaba a duplicar.
- **`describeDirectoryView` recibe NÚMEROS, no el array.** La primera versión
  le pasaba la vista entera y el typecheck lo habría atrapado; lo atrapó antes
  la prueba de navegador, que lee la frase pintada. Al cablear un criterio
  puro en una pantalla, correr la prueba de pantalla — el criterio en verde no
  dice nada sobre el cableado.
- **La prueba de navegador apunta al buscador del DIRECTORIO por su
  placeholder completo.** `input[placeholder^="Buscar"]` casaba PRIMERO con el
  buscador global del panel (`AdminLayout`), y la primera corrida «demostró»
  que la búsqueda no filtraba nada. Dos campos que empiezan igual en la misma
  pantalla: al probar, elegir el selector que no pueda confundirlos.
