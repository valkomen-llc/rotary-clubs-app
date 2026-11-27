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


## Un club no puede quedar con el dominio de otro sitio — v4.1359

Caso «Club Rotario Tuluá El Lago»: se creó con `rotary4281.org` (el dominio
del Distrito 4281) en «Dominio Propio». La resolución pública prefiere el
Distrito, así que el club nunca se mostraba en ese dominio; pero el panel
confía en `Club.domain`: «Abrir Sitio» (`verMiSitioUrl` en `AdminLayout`) iba
a la página del Distrito y Analíticas (catálogo `/analytics/sites`, filtrado
por hostname) medía el tráfico del Distrito como si fuera del club.

- `server/lib/siteDomainGuard.js`: `findDomainConflict` (¿el dominio, con sus
  variantes `www.`, ya es de OTRO club o de un Distrito? La única excepción es
  el sitio-club del propio Distrito, `isDistrictSiteOf`), `uniqueSlug` y
  `slugFromName` («Club Rotario Tuluá El Lago» → `tulua-el-lago`).
- `createClub` y `updateClub` responden **409 `DOMAIN_TAKEN`** con la
  explicación. La edición sólo revisa si el dominio CAMBIA: un club que ya lo
  tiene mal se puede seguir editando y corregir dejándolo vacío.
- Un club sin `subdomain` recibe uno al crearse o al guardarse: sin slug,
  «Abrir Sitio» no tiene a dónde ir (`app.clubplatform.org/?club=<slug>`).
- `getAllClubs` devuelve `domainConflict` (`'club'` | `'district'` | null) y la
  lista de Super Admin lo pinta en rojo. El dueño legítimo (el sitio del
  Distrito) no se marca.
- Quitar el dominio de un club NO lo quita de Vercel (`updateClub` sólo
  agrega dominios), así que corregir un club no tumba el sitio del Distrito.
- El campo lleva `autoComplete="off"`: el navegador ofrecía dominios usados
  antes, como el del Distrito.
- Prueba: `npm run test:site-domain-guard` (en `prebuild`); con
  `SITE_DOMAIN_TEST_DATABASE_URL` corre las consultas y los manejadores reales
  (25 comprobaciones, incluida la corrección del caso Tuluá).


## «Abrir Sitio» y Analíticas de un club nuevo — v4.1360

La v4.1359 sólo impedía GUARDAR un dominio ajeno; el club Tuluá El Lago seguía
viendo las cifras del Distrito y «Abrir Sitio» lo llevaba a rotary4281.org.
Eran cuatro causas encadenadas, y se corrigen AL LEER (sin editar datos):

1. **El panel tomaba el sitio del navegador, no el del usuario.** En
   app.clubplatform.org, `ClubContext` pide `lsUser.club.subdomain`; sin slug,
   pedía el host y recibía el sitio de la plataforma (de ahí «Nombre del club»
   en la barra lateral) con su dominio. Ahora:
   - `GET /admin/my-site` (`getMySite`): la dirección del club del usuario,
     decidida por el servidor: dominio propio (`ownDomainOf`: no cuenta el de
     un Distrito u otro club; el sitio del Distrito conserva el suyo) o
     `app.clubplatform.org/?club=<slug>` (`siteUrlOf`). Si falta el slug, lo
     genera y lo guarda (`uniqueSlug`).
   - `AdminLayout`: «Abrir Sitio» y los contadores GA4 de la cabecera usan ese
     resultado; el dominio del contexto sólo vale si el contexto ES el club del
     usuario. Guarda el slug en `rotary_user` para la próxima carga.
   - `ClubContext.siteQuery`: sin slug, pide por el ID del club, y
     `/clubs/by-domain` acepta un UUID de club.
2. **Analíticas sumaba el dominio del Distrito a cualquier club del distrito.**
   En el respaldo de `/traffic` (cuando el club no estaba en el catálogo por no
   estar `active`), `if (c.type === 'district' || c.district)` añadía
   rotary4281.org a TODO club con número de distrito. Ahora sólo al sitio del
   Distrito, y el club del usuario entra al catálogo aunque esté en
   desarrollo (sus cifras: 0).
3. **Con un perfil ligado al distrito**, el catálogo empezaba por el Distrito y
   la pantalla lo elegía (`fetchedSites[0]`). Ahora elige primero el club del
   usuario (`user.clubId`).
4. **Un dominio de Distrito guardado en un club común** no se usa para medir
   (`isForeignDistrictDomain`) ni para resolver el sitio público:
   `/clubs/by-domain` descarta el club que casó por ese dominio
   (`stealsDistrictDomain`, también por la vía «suelta») y sirve el Distrito.

Prueba: `test:site-domain-guard` (26 sin base en `prebuild`, 42 con Postgres,
incluido `/admin/my-site` con el club mal guardado y sin slug).

## La cabecera y «Abrir Sitio» de un club: sólo su sitio, por la sesión — v4.1361

Tras v4.1360 el panel de Tuluá El Lago seguía con las cifras GA4 del Distrito
en la cabecera (1.5k / 6.6k), «3 visitantes activos» y «Abrir Sitio» hacia
rotary4281.org. Tres huecos:

1. **El alcance de Analíticas obedecía al pedido, no a la sesión.**
   `resolveAnalyticsScope` aceptaba `?hostname=` de CUALQUIER usuario, y la
   cabecera lo mandaba con el dominio del sitio que había cargado el navegador
   (era además una fuga: cualquiera leía las cifras de otro sitio). También
   resolvía por el host/Origin antes que por la sesión, y un club con
   `districtId` recibía el alcance del Distrito (el «tiempo real» filtraba por
   «4281»). Ahora:
   - `?hostname=` sólo vale para el administrador de la PLATAFORMA (sin
     `clubId`).
   - Un usuario con `clubId` cuyo club NO es el sitio de un Distrito recibe su
     club, PRIMERO, antes de mirar host, Origin o `districtId`. Sólo el sitio de
     un Distrito suma a sus clubes.
   - La cabecera de cualquier usuario que no sea superadmin pide
     `/analytics/traffic?days=30` SIN `hostname`.
2. **«Abrir Sitio» caía al dominio guardado si `/admin/my-site` tardaba o
   fallaba** (la fila de Tuluá tiene rotary4281.org). Para un usuario de club
   (`isClubUser`) sólo vale `mySite.url`; mientras no llega, el botón no se
   muestra. Si el panel cargó otro sitio (`club.id ≠ user.clubId`), se guarda
   el club con su slug en `rotary_user` y se llama `refreshClub()`.
3. **El dueño del dominio no se detectaba si estaba guardado de otra forma.**
   `findDomainConflict`/`ownDomainOf` comparaban `lower(domain)` con
   `rotary4281.org`/`www.…`: un Distrito guardado como `https://rotary4281.org/`
   no casaba y el club lo usaba como propio. Ahora `normDomainSql(col)` normaliza
   lo GUARDADO con el mismo criterio que `canonicalDomain`, y si nadie tiene el
   dominio, la primera etiqueta (`rotary4281`) contra el subdominio de un
   Distrito u otro club —la misma regla con la que resuelve el sitio público—.
   Lo usan también el aviso del listado (`getAllClubs`), `stealsDistrictDomain`
   y `isForeignDistrictDomain` (`districtDomainsOf` trae el subdominio).

Pruebas: `test:site-domain-guard` (en `prebuild`; 51 con Postgres) y
`test:admin:open-site:ui` (AdminLayout real en Chromium: el navegador carga el
sitio con rotary4281.org y el servidor sabe que el usuario es de Tuluá;
verificado a la inversa: con el AdminLayout anterior fallan 2 de 6).
