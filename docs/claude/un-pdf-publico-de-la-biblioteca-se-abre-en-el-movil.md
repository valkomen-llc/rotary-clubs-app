<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Un PDF público de la Biblioteca se abre en el móvil — v4.1016

Reporte con dos capturas: la Carta del Gobernador abría en el escritorio y en
el iPhone devolvía **`AccessDenied`**. La redirección
`/carta-del-gobernador-edicion-julio-agosto` apuntaba directo al objeto de S3.

| Archivo | Qué es |
|---|---|
| `server/lib/publicMedia.js` | El CRITERIO. **Puro**: prefijos privados, veredicto de servibilidad, nombre canónico de la clave, la ruta pública, `Content-Type` y `Content-Disposition` |
| `server/controllers/publicMediaController.js` | La orquestación: resolver por id, comprobar, firmar y redirigir |
| `GET`/`HEAD /api/public/media/:id[/:nombre]` | La dirección estable, sin sesión |
| `src/lib/publicMedia.ts` | Espejo MÍNIMO: componer la ruta. **Sin el criterio de acceso** |
| `resolveBucketTargets` en `linkRedirectStore.js` | La reparación al leer de las redirecciones que ya apuntan al bucket |

Pruebas: `npm run test:public-media` (49 casos: criterio, el CAMINO con la base
sustituida en memoria, invariantes sobre los archivos y paridad de espejos).
**Sin Postgres, credenciales ni red.** Verificadas a la inversa sobre las cinco
invariantes.

**Reglas durables:**

- **⚠️ NO ERA UN PERMISO: ERA UNA CLAVE QUE NO EXISTE, DISFRAZADA DE 403.**
  Medido contra el bucket real, la misma palabra en sus dos formas Unicode:
  `…Edicio%CC%81n…` → **200** (15.191.336 bytes, `application/pdf`) y
  `…Edici%C3%B3n…` → **403 AccessDenied**. La clave del objeto está en **NFD**
  —la `o` y su tilde por separado, que es como macOS escribe un nombre de
  archivo— y iOS/WebKit, igual que el navegador integrado de WhatsApp,
  **normaliza la dirección a NFC** al abrirla. Como el bucket no concede
  `s3:ListBucket` anónimo (comprobado: listar da 403), **S3 contesta el 404
  como 403**. De ahí que se leyera como un problema de permisos y que el
  escritorio funcionara: ahí la URL viaja tal cual se pegó. **Al diagnosticar
  un `AccessDenied` de S3, comprobar primero si la clave EXISTE con esos bytes
  exactos** — un 403 sobre un bucket sin listado no distingue una cosa de la
  otra.
- **⚠️ Y POR ESO NO SE ARREGLA CON PERMISOS.** El bucket ya sirve ese objeto a
  un anónimo; abrirlo más no habría cambiado nada y habría expuesto lo que hoy
  está bien cerrado. La comprobación que lo autoriza es que el listado del
  bucket sigue dando 403.
- **⚠️ LA CLAVE DE UN OBJETO NUEVO NO LLEVA NADA NORMALIZABLE**
  (`canonicalObjectName`, en los TRES caminos de subida). `.replace(/\s+/g,'_')`
  sólo quitaba los espacios, así que la clave heredaba las tildes, las comas y
  los paréntesis del nombre de archivo. Una clave `[A-Za-z0-9._-]` **no tiene
  forma compuesta ni descompuesta**: no hay variante que pedir. El acento no se
  pierde — `Media.filename` guarda el nombre original y es el que viaja en el
  `Content-Disposition` y el que se ve al descargar.
- **⚠️ LO QUE SE COMPARTE ES NUESTRA DIRECCIÓN, NO LA DE S3.**
  `/api/public/media/:id` sólo lleva el identificador: nada que normalizar, no
  caduca, no depende de una sesión del panel y sobrevive a que el objeto se
  mueva dentro del bucket — la clave se resuelve al leer. El nombre que va
  detrás es decorativo y **no se comprueba**: con el nombre dentro de la
  comprobación, renombrar un archivo rompería un enlace ya repartido.
- **⚠️ LA FIRMA NUNCA SE PERSISTE.** Lo que se guarda en el CMS y en la
  redirección es la dirección estable; la firma se genera al vuelo en cada
  visita y vive cinco minutos. Así el enlace repartido por WhatsApp sigue
  sirviendo dentro de un mes **y** el bucket podría cerrarse sin romper uno
  solo. Guardar un presigned como href es el defecto opuesto y no se hace.
- **NO SE PROXIAN LOS BYTES: SE REDIRIGE.** El archivo pesa 15,2 MB y la API
  corre en funciones serverless; pasarlo por la función gastaría su presupuesto
  y rompería el `Range` con que Safari dibuja un PDF grande por partes
  (comprobado: el objeto responde `206` y anuncia `Accept-Ranges: bytes`). Con
  el 302 el archivo va del bucket al teléfono directamente.
- **EL TIPO Y EL NOMBRE SE IMPONEN EN LA FIRMA** (`ResponseContentType`,
  `ResponseContentDisposition`), no se confían al objeto: casi todo lo subido
  antes de esto no tiene metadata, y un PDF servido como
  `application/octet-stream` se descarga en vez de abrirse.
- **⚠️ `Media` NO TIENE COLUMNA DE MIME.** Sus tipos son `image`/`video`/
  `document`, que no sirven como `Content-Type`. Se deduce de la extensión;
  leer un `row.mimeType` que no existe habría dado `undefined` en silencio y
  **todo PDF se habría descargado en vez de abrirse** (la trampa del SELECT
  corto, v4.886).
- **EL PDF VA INLINE; LO QUE NO SE PUEDE DIBUJAR SE BAJA.** Un `.docx` servido
  inline abre una pestaña en blanco. `?descargar=1` fuerza `attachment`. El
  `Content-Disposition` lleva las DOS formas del nombre —`filename=` en ASCII
  para el cliente viejo y `filename*=UTF-8''…` con las tildes—: sólo la segunda
  deja sin nombre a algún cliente, sólo la primera se lo quita a todos.
- **⚠️ UN ARCHIVO PRIVADO RESPONDE 404, NUNCA 403.** Confirmar que existe es la
  mitad de lo que hace falta para ir a buscarlo, y con 403 este endpoint sería
  además un censo: probar identificadores hasta que uno conteste distinto. Los
  prefijos privados son un catálogo CERRADO (`private/`), y `public-tmp/` se
  distingue como **efímero** —no es secreto, pero se borra solo, así que un
  enlace estable hacia ahí prometería un archivo que va a desaparecer—.
- **⚠️ LAS REDIRECCIONES QUE YA APUNTAN AL BUCKET SE REPARAN AL LEER, SIN
  MIGRAR UNA FILA.** Un despliegue no escribe en la base (regla durable desde
  el 2026-07-13) y la fila sigue siendo lo que el administrador escribió: lo
  que cambia es a dónde se salta. Va DENTRO de la lectura cacheada (60 s) y no
  en el salto: por clic sería una consulta de más en cada visita. Mismo patrón
  que los grupos de distribución (v4.876) y `migrateLegacySetting` (v4.993).
- **⚠️ NI AHÍ NI EN NINGÚN SITIO SE NORMALIZA LA CLAVE.** `keyFromBucketUrl`
  decodifica y devuelve los BYTES que venían; normalizar reintroduciría el
  mismo `AccessDenied` por la otra puerta. Lo fija una prueba.
- **UNA FILA SIN `s3Key` SE RESUELVE DESDE SU `url`.** Hay filas anteriores a
  esa columna: derivar la clave de la URL es lo que hace que esta vía sirva
  también los archivos viejos, sin migrar nada.
- **SIN PODER FIRMAR, DEGRADA.** El objeto puede seguir siendo legible por la
  política del bucket, y dejar sin abrir un PDF público por no poder firmarlo
  sería cambiar un problema de configuración por uno de servicio. El respaldo
  codifica segmento a segmento **desde los bytes guardados**.
- **UN DOCUMENTO SE COPIA POR LA VÍA ESTABLE; UNA IMAGEN NO.** El botón de la
  Biblioteca copiaba la URL cruda de S3 — el href que se pegaba en la
  redirección. Ahora un documento da el enlace estable; una imagen o un video
  conservan su dirección directa a propósito: se pintan decenas por pantalla y
  hacerlas pasar por la función sería una invocación por miniatura, y su clave
  ya nace saneada.
- **⚠️ EL ESPEJO DEL NAVEGADOR NO TRAE EL CRITERIO DE ACCESO.** No están
  `servability`, `isPrivateKey` ni `PRIVATE_PREFIXES`, y lo comprueba una
  prueba que verifica su AUSENCIA: con dos criterios, la pantalla ofrecería el
  enlace público de un documento que la API contesta con 404, y lo que se
  separaría en silencio es qué archivos quedan al alcance de cualquiera.
- **⚠️ LOS FIXTURES NFD/NFC SE DERIVAN CON `.normalize()`, no con dos literales
  que se ven iguales.** Un editor o un formateador puede normalizar el archivo
  y dejarlos idénticos, y entonces la prueba compararía una cosa consigo misma.
  Pasó al escribir el arnés de punta a punta: el literal salió en NFC, el
  destino apuntó a una clave inexistente y S3 contestó 403 — o sea que
  reprodujo el defecto reportado sin querer.
- **Las rutas van de la MÁS específica a la más general** (`/media/:id/:nombre`
  antes que `/media/:id`), o la segunda taparía a la primera (`check:routes`).

**Comprobado de punta a punta contra producción** (302 → 200,
`Content-Type: application/pdf`, `Accept-Ranges: bytes`, 15.191.336 bytes y los
primeros bytes `%PDF-`).

**Pendientes conocidos:** el enlace estable **no se ofrece todavía desde el
selector de la Biblioteca** cuando se elige un documento para un enlace del
menú o de un botón — hay que copiarlo desde Multimedia; **no hay CloudFront**,
así que cada apertura paga el 302 de nuestra función (barato: no pasan los
bytes) y una caché de borde sería la vuelta siguiente; y **los objetos ya
subidos conservan su clave con tildes** — no se renombran, porque copiar y
borrar 15 MB por archivo es una operación destructiva sobre datos de
producción y la vía estable los sirve bien tal como están.
