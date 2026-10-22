<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Tipo de sitio y portada — v4.737

`SmartHome` (`src/App.tsx`) decide qué se pinta en `/` según el tipo de sitio, y
`ENTITY_TYPES` (`src/lib/entityTypes.ts`, espejado en `server/lib/entityTypes.js`)
es el catálogo de tipos con sus capacidades: `editableHome`, `customTheme` y
—desde v4.737— `fixedNav`.

**Reglas durables:**

- **Un DISTRITO es un sitio normal.** Se arma con su configuración, como un club:
  su portada son las secciones estándar y su menú sale del panel. No tiene rama
  propia en `SmartHome` y no está en `fixedNav`.
- **Una campaña NO se pone como portada de un tipo de sitio.** Hasta v4.736
  `SmartHome` devolvía `<DistrictMultimediaGallery />` —el formulario de la
  Conferencia Bidistrital Medellín 2026— para todo sitio de tipo distrito. El
  comentario decía «e.g. 4271.org» y la intención era ese distrito, pero la
  condición miraba `club.type === 'district'`: atrapó al 4281 y habría atrapado a
  cualquier distrito futuro, dejándolos **sin portada y sin ningún ajuste del
  panel que lo apagara**. Una campaña con fecha —una conferencia, una
  convocatoria— es una PÁGINA con su ruta, que el sitio enlaza desde su menú; hoy
  `/galeria-multimedia`. Al condicionar por tipo, preguntarse a cuántos sitios
  alcanza además del que se tenía en mente.
- **El orden de la portada estándar vive en `SmartHome` y NO es configurable
  por sitio.** Desde v4.745.5 es: hero → «Somos gente de acción» → «Noticias y
  artículos» → banda → «Únete» → cifras → Fundación → causas → Bloque
  Destacado. Noticias subió al
  tercer puesto (pedido del Distrito): cerrando la portada, lo más nuevo del
  sitio quedaba donde casi nadie llega. Y las cifras pasaron DEBAJO de «Únete»
  (v4.745.8): la invitación a sumarse va primero y los números la respaldan. Al mover una sección, **la condición
  que la enciende se mueve con ella** —la de Evento/Convención que apaga
  noticias vive junto al `<NewsSection />`— y hay que recordar que el cambio
  alcanza a TODOS los sitios estándar, no sólo al que lo pidió. Lo comprueba
  `test:nav` sobre el archivo; el puesto real se verifica en el navegador.
- **El Bloque Destacado cierra la portada y es CONFIGURABLE** (v4.746,
  `SpotlightSection.tsx`): imagen de fondo a todo el ancho, título, texto y
  botón, entre las áreas de interés y el pie. Tres reglas lo sostienen:
  - **Nace vacío y entonces no pinta nada** —ni el espacio—. Es la lección de
    v4.737: la portada la comparten todos los sitios, así que un contenido
    escrito en el código aparecería en cada club.
  - **NO se acota con `hasEditableHome`.** Los otros bloques de contenido
    (`actionContent`, `joinContent`, `foundationContent`, `causesContent`)
    nacieron para Evento/Convención y llevan esa condición; éste se pidió para
    un DISTRITO, y acotarlo igual lo habría dejado sin poder llenarse. Al
    agregar un bloque de contenido, preguntarse para qué tipo de sitio es.
  - **El botón toma la piel de `useCtaButton` y el icono de `ctaIcons.tsx`**,
    igual que «Toma Acción con Nosotros» y «Involúcrate en Rotary». Ese
    catálogo de emojis estaba escrito TRES veces —idéntico— y éste iba a ser la
    cuarta: una copia que se queda atrás hace que el panel ofrezca un icono que
    la portada no sabe dibujar. Mismo criterio que `ctaStyles.ts`.
  - **La imagen y el texto viven en sitios distintos y eso hay que DECIRLO en
    la pantalla.** La imagen es un hueco de `useSiteImages` (Distribución de
    Imágenes, con las dos vías de v4.700); el texto y el botón son un ajuste
    (`spotlight_section_content`, Configuración → Identidad). El texto de ayuda
    del panel nombra la otra pantalla, o el administrador llena la mitad y no
    encuentra el resto.
- **Una imagen de la portada es un HUECO CONFIGURABLE, no una URL en el código**
  (v4.742, `homeBanner` en `useSiteImages` + `HomeBannerSection`). La portada la
  comparten todos los sitios: una imagen escrita en el código aparecería en cada
  club. Nace VACÍA y la sección devuelve `null`, así que quien no la usa ve su
  portada igual que antes —ni siquiera queda una sección vacía—. Es la misma
  lección de la campaña que secuestró la portada de los distritos.
- **El azul de la barra superior es un color del TEMA, no un literal** (v4.745,
  `rotary-topbar` en `tailwind.config.js`). Lo llevan la barra superior
  (`Navbar.tsx`), su versión pública (`PublicTopBar.tsx`) y la banda de la
  portada: estaba escrito a mano como `bg-[#28354b]` en los dos primeros y, al
  necesitarlo un tercero, tres copias se separan en cuanto alguien cambie una.
  Va en el TEMA y no en `index.css` a propósito: una clase escrita a mano en
  `@layer utilities` —como `bg-rotary-blue`— **no genera los modificadores de
  opacidad** y la regla no existe, en silencio (v4.719). Lo comprueba
  `test:nav`, incluido que la clase llegue al CSS compilado.
- **La banda va sobre ese azul, no sobre blanco.** Estas piezas suelen ser
  azules de borde a borde: sobre blanco quedaban como una tarjeta recortada.
- **La banda ocupa el ancho de la pantalla menos 20 px por lado** (v4.745.3,
  `px-5`), NO el contenedor centrado del resto de la portada: la imagen ES la
  sección, no un bloque de contenido dentro de ella. Y **no lleva sombra, halo
  ni filtro** — sobre un fondo del mismo tono, cualquier resplandor se lee como
  un marco pegado alrededor de la pieza. No reintroducir `shadow-*`, `ring-*`
  ni `drop-shadow-*`; lo comprueba `test:nav`.
- **La barra de copyright lleva el mismo azul** (v4.745.1). Era `bg-black/10`,
  un velo sobre el fondo del pie: su color dependía del fondo de cada sitio y no
  coincidía con nada. Un sitio Evento/Convención conserva su `copyrightBg`
  configurado — ahí el operador ya eligió y pisarlo sería desobedecerlo.
- **El fondo del pie sale de `src/lib/siteChrome.ts`** (`SITE_FOOTER_BG`,
  `#212C3F` desde v4.745.2). Lo consumen el pie de verdad (`Footer.tsx`) y la
  vista previa del panel (`FooterSystem.tsx`): escrito a mano en los dos, el
  panel acaba enseñando un pie que no es el que ve el visitante. Un sitio
  Evento/Convención conserva su `colors.footerBg` configurado.
- **«Club Platform for Rotary» es una MARCA y va con `data-no-translate`.** El
  traductor de DOM la pasaba a «Plataforma de Club para Rotary», un nombre que
  no existe. Es la distinción de v4.662 entre LENGUAJE —se traduce— e IDENTIDAD
  —no se toca—; «Powered by» sí es lenguaje y se sigue traduciendo. Al escribir
  el nombre de la plataforma en una pantalla pública, marcarlo.
- **Ninguna imagen de la portada lleva resplandor ni se recorta a una
  proporción fija** (v4.745.4, `JoinSection.tsx`). Esa imagen tenía detrás un
  degradado dorado desenfocado más un `shadow-2xl` —sobre el fondo azul de la
  sección se leía como un halo pegado— y un `aspect-[4/3]` con `object-cover`
  que recortaba toda pieza que no fuera 4:3. Estas piezas traen el texto DENTRO
  —nombres, cargos, el logotipo del distrito— y el recorte se llevaba
  justamente eso. El contenedor sigue a la imagen, no al revés. Lo comprueba
  `test:nav`.
- **Al diagnosticar «la imagen de la portada tiene sombra», mirar QUÉ hueco
  está usando el sitio.** Hay varios —`homeBanner`, `join`, `foundation`— y
  cada uno lo pinta un componente distinto; corregir el equivocado se ve
  exactamente igual que no haber hecho nada.
- **Al agregar un hueco de imagen hay que tocar DOS listas de `useSiteImages`**:
  `DEFAULTS` (de donde sale la mezcla inicial) y el array `allKeys` del efecto
  (que decide qué se lee de la respuesta del servidor). Una clave que esté en
  una y no en la otra se queda con su valor por omisión para siempre, sin que
  nada avise.
- **La banda se muestra ENTERA, sin recortar** (`object-contain`, proporción
  natural) y por eso no está en la lista de `needsCrop` del editor. Estas piezas
  suelen traer el texto dentro de la imagen —nombres, cargos, el logotipo— y un
  recorte panorámico se lleva justamente eso.
- **El criterio de qué sitios llevan menú propio vive en `entityTypes.ts`**
  (`hasFixedNav`), no en cada pantalla. Estaba escrito a mano en `Navbar.tsx` y
  otra vez en `ClubSettings.tsx`, y las dos copias **ya se habían separado** —el
  `Navbar` contemplaba además los sitios RYE y el panel no—. Acepta la clave
  máquina (`district`) y la etiqueta legible (`Distrito Rotario`) porque el panel
  guarda una u otra según por dónde se creó el sitio.
- **El menú y su editor son la MISMA decisión.** El `Navbar` saltea el bloque
  estándar y el panel esconde el editor: si las dos condiciones no salen de la
  misma función, un sitio termina con un menú que nadie puede cambiar. Es lo que
  le pasaba al distrito, con «Inicio | Contacto» y ninguna vía para tocarlo.
- **Un sitio RYE se reconoce por el dominio Y por el subdominio.** En una vista
  previa (`app.clubplatform.org/?distrito=rye…`) el dominio es el de la
  plataforma. `ClubContext` ya fuerza `type = 'Programa de Intercambio'` para
  esos sitios; el `Navbar` lo comprueba igual porque no depende de ese orden.
- Pruebas: `npm run test:nav` (34 casos). **Sin base, credenciales ni red.**
  Comprueban el criterio, que los dos catálogos coincidan y —leyendo los
  archivos— que la portada no vuelva a quedar secuestrada ni reaparezca un número
  de distrito escrito a mano. Esto último no lo ve el typecheck: el código era
  válido y estaba bien tipado.
- **Verificar la PORTADA en un navegador, no sólo el criterio.** El defecto vivió
  versiones porque nadie abrió el sitio de un distrito. Comprobado con Chromium
  sobre el `dist/` real y la API interceptada: la portada pinta sus secciones y
  el menú da «Inicio · Sobre Nosotros · Proyectos · Noticias · Eventos ·
  Contacto», y `/galeria-multimedia` sigue mostrando la galería.
