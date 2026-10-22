<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Botones configurables (CTA) — v4.657

Los botones que el administrador llena desde el panel —los dos del encabezado,
los de las secciones de la portada y el del panel de inscripción de un evento—
comparten un solo criterio para decidir cómo se abren: `ctaTarget` en
`src/lib/ctaLinks.ts`.

- **Externo = OTRO DOMINIO, no "empieza por http".** Hasta v4.656 cada pantalla
  repetía `/^https?:\/\//` y le ponía `target="_blank"` a todo enlace absoluto.
  Como lo natural al configurar un botón es pegar la dirección completa
  copiada del navegador, un botón que llevaba a otra página del MISMO sitio
  abría pestaña nueva. `ctaTarget` compara el dominio contra
  `window.location.host` (ignorando `www.`) y devuelve `{ external, to }`:
  interno → `<Link to={to}>` (misma pestaña, sin recargar); externo → `<a
  target="_blank">`.
- **No volver a escribir la comprobación a mano.** Al agregar un botón
  configurable nuevo, usar `ctaTarget`. Estaba duplicada en siete lugares y por
  eso el fallo apareció en todos a la vez.
- `ctaTarget` conserva query y ancla: `?categoria=…` es justamente lo que
  distingue el registro nacional del internacional.
- **Los enlaces del menú con bandera `external` NO pasan por aquí**: ahí el
  administrador eligió a propósito, y su decisión manda.

### El ASPECTO de esos botones (v4.719)

`src/lib/ctaStyles.ts` es la otra mitad: `ctaTarget` decide cómo se ABREN,
`CTA_SOLID` / `CTA_SOFT` cómo se VEN. Lo usan el encabezado (`Navbar.tsx`), la
ficha pública de un evento (`EventRegistrationCta.tsx`) y la vista previa del
panel (`EventCtaManager.tsx`).

- **Se comparte la PIEL, no la geometría.** Fondo, color de letra y hover salen
  del módulo; el alto y los márgenes los pone cada sitio, porque el botón del
  encabezado se ajusta a su texto y el de la ficha ocupa el ancho de la columna.
  Meter la geometría ahí obligaría a uno de los dos a pelearse con lo que hereda.
- **Dentro de la ficha, los dos botones MIDEN lo mismo** (v4.719.1: `text-[15px]
  py-3` para los dos, 46,5 px de alto medidos en el navegador). El secundario
  venía más bajo y con letra más chica, y esa diferencia no dice nada: los dos
  llevan a un formulario de inscripción y el CADRE es el registro de un rol del
  propio evento, no un trámite menor. Lo que distingue al principal es el COLOR,
  que ya basta. Esto es geometría DE LA FICHA y por eso vive ahí, no en
  `ctaStyles.ts`.
- **El motivo es que se separaban.** Hasta v4.718 «Registro CADRE» era un
  contorno azul marino escrito a mano en la ficha, y «Postular Proyecto» una
  píldora azul claro escrita a mano en el encabezado: la misma acción —entrar a
  un formulario de inscripción— se veía de dos maneras y nada obligaba a que se
  parecieran. Al agregar un botón de esta familia, tomar la piel de aquí.
- **La vista previa del panel lee la MISMA fuente.** Pintada aparte enseñaría un
  botón que no es el que ve el visitante, que es peor que no tener vista previa.
- **Un botón apagado se pinta SIN hover** (`ctaSkin(skin, false)`). Reaccionar al
  cursor es la promesa de que algo va a pasar al pulsarlo.
- **`bg-rotary-blue` NO admite el modificador de opacidad.** Es una clase escrita
  a mano en `index.css` (`@layer utilities`), no un color del tema, así que
  Tailwind no genera `hover:bg-rotary-blue/90` —ni `/10`— y la regla **no existe**:
  el botón se queda sin ese estilo en silencio, sin error ni aviso. Se comprobó
  sobre el CSS compilado. `CTA_SOLID` usa `hover:bg-rotary-navy`, que sí genera.
  **Quedan ~21 usos de las variantes muertas por el resto del panel** (14 de
  `/90` y 7 de `/10`); no se tocaron porque cambian el aspecto de muchas
  pantallas. Al escribir una clase de estas, buscarla en
  `dist/assets/index-*.css`: es la única forma de saber si llegó.
- **El panel de inscripción de un evento es de esta MISMA familia** (v4.751,
  `RegistrationPanel.tsx`). Las cajas de la cuenta regresiva y el botón
  «Inscripciones» iban en un naranja (`#D57D2C`) escrito a mano que no salía de
  ninguna paleta del sitio y no se repetía en ningún otro lado. Ahora toman las
  pieles del módulo. Las cajas van con `ctaSkin(CTA_SOFT, false)` —**sin
  hover**— porque no se pulsan. `FAIR_THEME` en `RegistroFeria.tsx` **se
  conserva**: lo que se unifica es el tema POR DEFECTO, no toda personalización.
- **El principal y el secundario de la ficha son la PAREJA declarada** (v4.752):
  `CTA_SOLID` arriba y `CTA_SOFT` debajo. El principal también llevaba el
  naranja escrito a mano, en `EventRegistrationCta.tsx` y otra vez en su vista
  previa del panel. Se eligió la pareja y no dejar los dos en azul claro porque
  **el color es lo único que distingue cuál es el registro principal**: desde
  v4.719.1 los dos tienen el mismo alto y la misma letra a propósito.
- **El MISMO «Inscripciones» se pinta por dos caminos**, y tienen que verse
  igual: `RegistrationPanel` cuando el evento no tiene categorías configuradas y
  `EventRegistrationCta` cuando sí. Con pieles distintas, el botón cambiaría de
  color según una configuración que el visitante no conoce — que es exactamente
  el defecto que este módulo existe para no tener.
- **El panel admite un botón SECUNDARIO configurable** (v4.948,
  `metadata.latir.secondaryLabel`/`secondaryLink`, campos en la pestaña «Panel
  de inscripción» de `Events.tsx`): la vía alterna de inscripción — ej. quien
  pagó por COLROTARIOS y completa su información en el formulario de
  inscripciones completadas. Misma pareja declarada (piel `CTA_SOFT`, misma
  geometría), destino por `ctaTarget`, y sin enlace NO se pinta (v4.650). Los
  campos son aditivos: un evento sin ellos se ve igual que antes.
- La comprobación de «nadie las escribe a mano» busca la **CLASE**, no la
  mención: el comentario que explica de dónde se viene tiene que poder nombrar
  el valor viejo sin hacer fallar la prueba.
- Pruebas: `npm run test:cta` (32 casos). **Sin base, credenciales ni red.**
  Comprueban dos cosas que no se ven mirando una pantalla: que nadie repita las
  clases a mano y que cada clase **exista en el CSS compilado** (por eso el
  bloque final se salta si no hay `dist/`).
- **El botón del encabezado que apunta al registro de un evento sigue al
  IDIOMA ACTIVO** (v4.660), igual que los de la ficha. Antes llevaba el texto y
  la categoría que se escribieron una vez, así que en Español mostraba
  "International Registration" y aterrizaba en el formulario internacional —
  contradiciendo la regla de v4.652. `withLanguageAwareRegistration` en
  `Navbar.tsx` lo resuelve con `useEventCta`, el mismo hook de la ficha.
- **El texto y el enlace configurados se respetan POR SEPARADO**
  (`labelSetForLang` / `urlSetForLang`). Quien escriba sólo "Texto en Español"
  debe seguir yendo al formulario que le toca por idioma; si un solo indicador
  cubriera ambos, rellenar un campo congelaría el otro en el idioma contrario.
  Ese era el fallo. Los campos están en Configuración → Identidad → "Botones
  del menú principal".
