<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## El dominio propio de un sitio — v4.743

`GET /clubs/by-domain` es lo que decide QUÉ sitio se pinta en cada visita. El
criterio de normalización vive en `server/lib/domains.js` (**puro**), y lo usan
las dos puntas: el alta y la edición al GUARDAR, y la resolución al BUSCAR.

Pruebas: `npm run test:domains` (34 casos). **Sin base, credenciales ni red.**

**Reglas durables:**

- **Un dominio sin asignar NO da error: da el sitio «Origen».** Es la decisión de
  diseño que hace que este fallo sea tan difícil de ver — el visitante recibe un
  sitio Rotary plausible, con «Nombre del club» y fotos de archivo, y concluye
  que está a medio configurar. No se cambió el comportamiento (servir algo es
  mejor que un 500), pero **la respuesta ahora dice cómo se resolvió**
  (`resolvedBy`) y el panel lo traduce a una frase.
- **Las dos puntas normalizan con la MISMA función.** Si el alta guarda una forma
  y la búsqueda espera otra, el sitio no resuelve y nadie se entera. Hasta v4.743
  `updateClub` normalizaba y `createClub` insertaba `domain || null` en crudo: un
  sitio creado pegando `https://ejemplo.org` nacía con un dominio imposible de
  casar.
- **Y aun así se comparan variantes contra lo GUARDADO** (`findByLooseDomain`).
  Normalizar al escribir no arregla las filas escritas antes, ni las que entran
  por otros caminos (registro público, importaciones). El segundo intento
  normaliza la columna dentro del SQL; sin él, arreglar el criterio no arregla
  los sitios que ya estaban mal.
- **`www.` se quita en la forma canónica**, no sólo al comparar: guardado y
  consultado tienen que reducirse a lo mismo.
- **El botón «Verificar» del panel comprueba de verdad.** Antes sólo mostraba
  «Validando configuración DNS…» y no consultaba nada, así que confirmaba una
  conexión que podía no existir — y eso es lo que dejó al Distrito 4281
  convencido de que su dominio estaba conectado. **No comprueba el DNS**: que la
  página cargue ya lo demuestra. Comprueba lo otro, que es lo que falla.
- **Distingue TRES resultados**, y los tres hacen falta: lleva a este sitio,
  lleva a otro (diciendo a cuál, para no tener que buscarlo) o no está asignado
  a ninguno (diciendo qué verá el visitante). Un booleano dejaría fuera el caso
  más confuso, que es el dominio que funciona pero apunta a otro sitio.
- **El campo del dominio es del OPERADOR de la plataforma** (`isSuperAdmin`), no
  del administrador del sitio. Al diagnosticar «no me carga el dominio», mirar
  primero con qué rol se está entrando: un administrador de sitio no ve ese
  campo y no puede corregirlo.

### El dominio propio de un DISTRITO — v4.744

Un distrito existe **dos veces** y cada fila hace una cosa distinta. La de
`District` es el registro administrativo —número, gobernador, países,
facturación y el **dominio propio**, que es lo que escribe `/admin/distritos` y
lo que se provisiona en Vercel—; la de `Club` de tipo distrito es el **sitio**:
ajustes, identidad, secciones, miembros, y es lo que edita el administrador del
distrito. El visitante llega por el dominio, que está en la primera; el
contenido está en la segunda.

El criterio vive en `server/lib/districtSite.js` (**puro**). Pruebas:
`npm run test:domains` (criterio) y `npm run test:district-site` (la ruta real,
con la base sustituida en memoria). **Sin Postgres, credenciales ni red.**

- **`by-domain` ATRAVIESA hasta el sitio.** Hasta v4.743, al encontrar la fila
  de `District` sintetizaba la entidad con `settings: []` —literalmente ningún
  ajuste—, así que el dominio propio servía un sitio en blanco mientras el mismo
  distrito, alcanzado por su subdominio de plataforma, se veía completo. Se
  reportó como «la configuración no se sincroniza»: no era una sincronización
  que faltara, era que se estaba sirviendo la fila equivocada.
- **El dominio NO se duplica en las dos filas: se resuelve al leer.** Copiarlo a
  la fila de `Club` es lo cómodo y es la trampa: las dos columnas son ÚNICAS, y
  con el valor en los dos lados cambiarlo en uno deja el otro resolviendo al
  viejo. Por eso el alta de un distrito ya **no** le pasa el dominio a su club
  espejo; sí le pone `districtId`, que es el vínculo explícito.
- **PERTENECER al distrito no es SER su sitio, y confundirlo sirve el sitio de
  otro club** (v4.744.1). `Club.districtId` es `affiliatedDistrict`: la
  afiliación, exactamente igual que `Club.district`. v4.744 lo tomó por un
  vínculo explícito —«este club es el sitio»— y `rotary4281.org` acabó sirviendo
  el **Rotary Club Pasto**, que está afiliado al 4281 y tenía su sitio completo,
  así que además ganaba el desempate por cantidad de ajustes. Es el mismo error
  que ya estaba escrito para `Club.district`, colado por la otra puerta: la
  clave foránea. Hacen falta **las dos** condiciones: que pertenezca (`districtId`
  o el número) **y** que se declare su sitio (tipo distrito, el subdominio que
  declaró el distrito, o ser el club al que están asignados sus
  administradores). Si falta cualquiera, se sirve la ficha del distrito y se
  dice que no hay sitio — antes eso que el sitio de otra organización.
- **La consulta de candidatos es de más A PROPÓSITO y el filtro lo hace el
  criterio.** `DISTRICT_SITE_SQL` trae también los clubes que sólo pertenecen;
  quién es el sitio lo decide `pickDistrictSite`, que es puro y está probado.
  Poner el filtro en el SQL lo dejaría fuera de las pruebas.
- **El panel usa la MISMA consulta y el MISMO criterio que la visita.** Con una
  copia propia, `/admin/distritos` afirmaría de un sitio distinto del que se
  sirve, que es lo peor que puede hacer una pantalla de diagnóstico.
- **Puede haber DOS clubes vinculados, y elegir mal da la página en blanco.** Al
  crear el distrito se inserta un club espejo vacío y el operador suele crear
  después el sitio de verdad desde el panel de sitios. El desempate es por
  **cantidad de ajustes**: el sitio configurado es el que tiene configuración.
  A igualdad, el más recientemente actualizado; y a igualdad de todo, el id
  menor — si dependiera del orden en que la base devuelve las filas, el mismo
  dominio serviría un sitio distinto en cada visita.
- **El número por sí solo NO vincula.** `Club.district` la lleva TODO club: es
  el distrito al que pertenece. Un club rotario del 4281 tiene «4281» ahí y no
  es el sitio del distrito. Sólo cuenta junto con el tipo de sitio distrito
  (`district` o `Distrito Rotario` — dos valores porque el alta escribe la clave
  máquina y el formulario de sitios la etiqueta legible).
- **En la marca manda el sitio; la ficha del distrito es RESPALDO.** Las dos
  tienen logo, favicon y colores, y un distrito puede tener puesto uno y no el
  otro. Tomar sólo el del sitio haría desaparecer un logotipo cargado en la
  ficha; tomar sólo el de la ficha ignoraría lo que el administrador configuró.
- **Sin sitio vinculado se sirve la ficha del distrito, no el «Origen».** Es
  peor un sitio genérico de otra organización que uno propio sin contenido, y
  `resolvedBy` (`district` frente a `district_site`) deja dicha la diferencia.
- **El DNS y el CONTENIDO son dos preguntas y se responden por separado.** La
  pestaña «Dominio» del distrito decía «✅ Dominio verificado y activo» mirando
  sólo Vercel, y eso convive perfectamente con un sitio en blanco: es lo que
  convenció al Distrito 4281 de que todo estaba bien. Ahora `domain-status`
  devuelve además `site` y `siteMessage`.
- **La prueba ejecuta la RUTA, no sólo el criterio.** `pickDistrictSite` es puro
  y estaba bien; el defecto estaba en el camino. `test:district-site` sustituye
  `server/lib/db.js` por una base en memoria con un hook de resolución de
  módulos y consulta el endpoint de verdad. Al tocar la resolución por dominio,
  correrla: es lo único que ve este tipo de fallo.
