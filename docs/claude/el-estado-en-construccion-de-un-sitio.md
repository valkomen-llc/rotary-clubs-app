<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## El estado «En construcción» de un sitio — v4.883

Un sitio se arma entero dentro de Club Platform antes de ser público. El caso
que lo pidió es el **Programa de Intercambios**.

| Archivo | Qué es |
|---|---|
| `src/lib/siteStatus.ts` | El CRITERIO. **Puro**: los tres estados, la normalización y quién ve el sitio |
| `server/lib/siteStatus.js` | Espejo MÍNIMO: sólo lo que el SEO necesita, comparado por salidas |
| `ConstructionGate` en `src/App.tsx` | La puerta, en UN solo sitio |
| `src/pages/SiteUnderConstruction.tsx` | La pantalla pública |
| `src/components/admin/SiteStatusPicker.tsx` | El selector, compartido por seis pantallas |

Pruebas: `npm run test:site-status` (54 casos, **sin base, credenciales ni
red**; el bloque del espejo pide `esbuild`) y `npm run test:site-status:ui`
(18 en un navegador con la aplicación real; pide `playwright` y `dist/`).

**Reglas durables:**

- **⚠️ «EN CONSTRUCCIÓN» NO ES «INACTIVO CON OTRO NOMBRE».** Un sitio inactivo
  está dado de baja; uno en construcción está VIVO y se está armando. Por eso
  la sesión pasa y ve el sitio COMPLETO —no una vista previa—: el equipo carga
  contenido y mira cómo va a quedar en el sitio de verdad.
- **⚠️ TAMPOCO ES EL «BANNER DE DESARROLLO».** Ese banner es un AVISO que se
  pinta encima y **no restringe nada**; sigue existiendo y es independiente.
  Confundirlos es lo que hace creer que un sitio está protegido cuando lo único
  que tiene es un cartel. Fue exigencia expresa del pedido no reutilizarlo.
- **El valor guardado es `draft`, el que YA existía** en la base y en
  `ClubContext` (`isDraft`). Inventar `under_construction` habría dejado dos
  verdades sobre lo mismo y un sitio ya marcado `draft` se habría quedado sin
  estado reconocible. `normalizeSiteStatus` acepta los alias por si aparecen.
- **⚠️ ANTE LA DUDA, ACTIVO.** Un valor desconocido, vacío o nulo se lee como
  activo: lo contrario convertiría un dato que nadie reconoce —o una columna
  sin llenar— en un sitio caído, y en el SEO además en un sitio desindexado.
- **⚠️ LA PUERTA VA EN UN SOLO SITIO**, envolviendo a `<Routes>`. El sitio pasa
  de cien rutas: protegerlas de a una significa que la ciento uno se olvida, y
  el fallo es MUDO —esa página quedaría pública sin que nada avise—. Con la
  puerta central, una ruta nueva nace protegida sola. Lo comprueba una prueba
  contando los `<ConstructionGate>`.
- **El corte anterior vivía SÓLO en la portada** (`if (isDraft) return
  <ComingSoon/>` dentro de `SmartHome`), así que entrar directo a `/proyectos`
  se lo saltaba entero. Ese es el defecto concreto que esto corrige, y hay una
  prueba de navegador que abre una página interna por URL.
- **⚠️ SIN `/login` LA PUERTA SE CIERRA CON LA LLAVE ADENTRO.** El inicio de
  sesión y el panel se sirven pase lo que pase (`ALWAYS_PUBLIC_PREFIXES`); si
  no, un sitio en construcción no se puede desbloquear desde el navegador. Los
  prefijos se comparan por SEGMENTO: `/login` cubre `/login/recuperar` pero no
  `/loginfalso`, que sería otra página.
- **«Con sesión» son las TRES identidades**, no sólo la del panel. El pedido
  dice «usuarios autenticados y administradores», y quién sabe leerlas es
  `siteSession.ts` desde v4.693 — escribir una cuarta forma de preguntarlo las
  dejaría separarse.
- **Mientras el sitio no ha cargado NO se decide.** Dar por «en construcción»
  un sitio cuyo estado todavía no llegó lo taparía un instante en cada visita,
  y eso se ve como un parpadeo en un sitio publicado.
- **⚠️ ESTO RESTRINGE LO QUE SE PINTA, NO LO QUE SE SIRVE.** La API sigue
  respondiendo a quien la llame directamente: es una puerta de PUBLICACIÓN
  —«este sitio todavía no se anuncia»— y no un control de acceso a los datos.
  Decirlo importa: creer que protege más de lo que protege es peor que saber
  exactamente qué hace. Un control real exigiría filtrar cada endpoint público.
- **La pantalla NO monta la navegación del sitio**, y no es una omisión
  estética: el menú es un mapa de lo que hay dentro, y cada enlace sería además
  un camino de vuelta a la misma pantalla —que se lee como un sitio roto—.
- **El contacto se ofrece SÓLO si el sitio tiene a dónde escribir.** Un botón
  que no lleva a ninguna parte es peor que ninguno (v4.650), y mandar a alguien
  a un formulario de un sitio sin correo configurado es mandarlo a un buzón que
  nadie lee.
- **⚠️ UN SITIO EN CONSTRUCCIÓN NO SE INDEXA, y son TRES señales.** `robots.txt`
  pasa a `Disallow: /`, el sitemap se publica VACÍO —no un 404: `robots.txt` lo
  referencia y un 404 ahí es un error de configuración— y el `<head>` sale con
  `noindex`. Las tres hacen falta: robots pide no rastrear, `noindex` es lo que
  impide indexar una dirección enlazada desde fuera.
- **En el SEO el ESTADO manda sobre lo escrito a mano**, al revés que todo lo
  demás de `seoServe`. No son la misma clase de decisión: marcar una página
  como indexable es una preferencia; «este sitio todavía no es público» es un
  hecho sobre el sitio entero.
- **Un fallo de base NO produce `Disallow: /`.** El robots permisivo sigue
  siendo el respaldo: un error transitorio no puede sacar un sitio de los
  buscadores, que guardan ese archivo en caché durante horas.
- **El selector es UN componente compartido por seis pantallas**
  (`SiteStatusPicker`). Escribirlo a mano en cada una es el defecto que ya se
  pagó con la casilla de distritos (v4.748): agregar un estado en una y
  olvidarlo en otra dejaría sitios que no se pueden poner en construcción.
- **`Districts.tsx` queda FUERA a propósito.** Esa pantalla edita el registro
  administrativo del distrito, no el sitio que se sirve —el sitio es un `Club`
  de tipo distrito (v4.744)—, así que ofrecer ahí «En construcción» sería un
  control que no controla nada.
- **Volver a «Activo» publica en el acto**, sin migraciones ni pasos extra: el
  estado es una columna que se lee en cada visita. Es exigencia expresa del
  pedido y lo comprueba la prueba de navegador.

**Consecuencia conocida:** un sitio que YA tuviera `status = 'draft'` en la base
pasa a tener también sus páginas internas restringidas, no sólo la portada. Es
lo que el estado significa —y esa portada ya estaba tapada—, pero es un cambio
de comportamiento sobre filas existentes.

**Pendiente conocido:** `src/pages/ComingSoon.tsx` se quedó sin consumidor
—`SiteUnderConstruction` lo reemplaza— y no se borró: no estaba en el encargo.
