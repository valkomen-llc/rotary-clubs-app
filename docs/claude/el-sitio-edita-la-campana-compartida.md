<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## El sitio edita la campaña compartida — v4.988 (matiza v4.987)

Con v4.987 desplegada, el Distrito 4281 abrió «Emergencia Terremoto Colombia
2026» y encontró el panel local —contacto, nota, QR, centros— sin poder tocar
el contenido. Pedido textual: *«la idea es poder hacer uso de las herramientas
completas para editar el contenido de la campaña desde el sitio de Rotary
4281»*. Se hizo así.

- **⚠️ UN SITIO EDITA EL CONTENIDO DE TODA CAMPAÑA QUE LO ALCANZA**, también
  la de la plataforma. `scopedCampaign(req, id, { write })` ya NO exige
  propiedad: lo que exige es ALCANCE (`preparableForSite`), y lo que no
  alcanza sigue sin existir (404). El contenido es compartido y la pantalla lo
  DICE («lo que edites acá lo verán todos ellos»): la decisión es del cliente
  con el argumento en contra delante — supersede «una campaña ajena se abre en
  su panel local, no en el editor» y «escribir lo ajeno responde 404» de
  v4.987 en lo que contradigan esto.
- **⚠️ EL CONTROL ES DEL DUEÑO** (`{ control: true }` en `transitionCampaign`
  y `deleteCampaign`). Publicar, pausar, archivar o borrar una campaña
  compartida cambia lo que ven TODOS los sitios a los que alcanza, así que se
  decide desde donde se publicó; la pantalla esconde esos botones para `!own`
  y dice por qué. Y el ALCANCE de una campaña de la plataforma sólo lo mueve
  el operador (`puedeApuntar`): lo que un sitio mande en `targeting` se ignora
  — la regla de v4.987 sobre el alcance de una campaña de un sitio sigue
  entera.
- **NO hay segunda pantalla.** La campaña ajena se abre en el MISMO editor
  (`if (!own)` ya no existe en la pantalla, y una prueba lo fija) y lo local
  del sitio es una `Card` más (`id="local"`, en `CARD_IDS`) sólo para la
  ajena. Alcance, Notificaciones y Solicitudes siguen siendo del operador.
- **`getCampaign` manda la ficha ENTERA a todos** —historial, bloqueos de
  publicación— más `local` cuando hay sitio y `own` para que la pantalla sepa
  de quién es el control.
- **Del mismo reporte, el Generador de Publicaciones** lleva
  `PHYSICAL_COHERENCE_CLAUSE` en `buildSimplePrompt`: una bolsa de maíz
  generada mostraba el producto saliendo por un BORDE sellado. Un empaque se
  abre por ARRIBA y lo que se vierte sale por esa abertura; los sellos de los
  costados y del fondo quedan cerrados. Va en POSITIVO —cómo se comportan las
  cosas—, nunca como lista de prohibiciones (regla #1 del sitio).
