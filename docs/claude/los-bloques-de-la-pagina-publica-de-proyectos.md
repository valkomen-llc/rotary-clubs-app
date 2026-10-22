<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Los bloques de la página pública de Proyectos — v4.750

`/proyectos` abría con dos bloques **escritos en el código**, iguales para todos
los sitios: la franja azul «Transformando Vidas…» con sus botones, y la banda de
cifras de impacto. Ahora cada sitio los enciende o los apaga.

| Archivo | Qué es |
|---|---|
| `src/lib/projectsPageLayout.ts` | El CRITERIO. **Puro**: qué se enciende, cómo se normaliza lo guardado y cómo se rotula cada interruptor |
| `src/pages/Proyectos.tsx` | Los dibuja —o no— |
| `src/pages/admin/Projects.tsx` | La tarjeta «Página pública de Proyectos» |

Pruebas: `npm run test:projects-page` (35 casos; la parte pura no necesita nada
y la de navegador pide `playwright` y `esbuild` y **se salta sola** si faltan).

**Reglas durables:**

- **Nacen APAGADOS**, y el motivo del segundo no es estético: las cifras
  —«150+ proyectos», «$12.5B recaudados», «50.000+ beneficiarios», «3.500+
  donantes»— están escritas a mano en `impactoStats` y **no salen de ninguna
  consulta**: no son ciertas para ningún club. Publicar cifras inventadas en el
  sitio de una institución no es una preferencia. Es la misma postura del Bloque
  Destacado (v4.746): un contenido escrito en el código no puede aparecer en
  todos los sitios por omisión.
- **El interruptor DICE que las cifras son de ejemplo.** Sin eso, alguien las
  enciende creyendo que salen de sus proyectos. Lo comprueba la prueba.
- **El criterio vive aparte porque lo consumen las DOS puntas.** Si la página y
  el panel decidieran cada uno su valor por defecto, el panel enseñaría un
  interruptor encendido sobre un bloque que la página no pinta. Ese desajuste no
  lo ve el typecheck y en la pantalla se lee como «el interruptor no funciona».
- **Sólo `true` enciende** (y la cadena `'true'`, porque el almacenamiento de
  secciones ha guardado booleanos como texto). Cualquier otra cosa deja apagado:
  ante la duda no se publica algo que el sitio no eligió publicar.
- **Apagado es NO DIBUJADO, no oculto por CSS.** Un bloque escondido con
  `hidden` sigue en el documento y lo leen el lector de pantalla y los
  buscadores. Lo comprueba la prueba de navegador contando nodos, no estilos.
- **Con los dos apagados no queda una sección vacía.** La condición envuelve al
  `<section>` entero, no sólo a su contenido: si no, quedaría la franja azul con
  su fondo y sin nada dentro.
- **Son DOS interruptores, no uno.** Un sitio puede querer la portada sin
  publicar cifras que no son suyas; es justo la combinación más probable.
- **La tarjeta va en el módulo de Proyectos, no en una pantalla nueva.** Mismo
  criterio que la «Sección pública de Eventos»: la decisión se toma donde ya se
  está trabajando, y las pantallas que se olvidan son siempre las del segundo
  lugar.
- **Un guardado fallido REVIERTE el interruptor.** Dejarlo donde el usuario lo
  puso, sabiendo que no se guardó, hace creer que el cambio quedó hecho.
