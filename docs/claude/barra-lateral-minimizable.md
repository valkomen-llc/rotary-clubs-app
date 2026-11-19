<!-- Léelo ANTES de tocar la barra lateral del panel (AdminLayout): menú, buscador, pie o ancho. -->

## Barra lateral minimizable del panel — v4.1333

Pedido del cliente (con la Feria de Proyectos como ejercicio, para TODOS los
sitios del ecosistema): minimizar y maximizar el menú izquierdo para ganar
espacio; minimizado se ven los íconos y, al pasar el cursor, el título de
cada uno.

| Archivo | Qué es |
|---|---|
| `src/components/admin/sidebarCollapse.tsx` | `useSidebarCollapse` (preferencia + escritorio), `useNavTooltip` y `SidebarTooltip` |
| `src/components/admin/AdminLayout.tsx` | La barra: botones, ancho, ítems, pie y el globo |

Pruebas: `npm run test:admin:sidebar-collapse` (estática, en `prebuild`) y
`npm run test:admin:sidebar-collapse:ui` (navegador, 1440 y 390 px; necesita
`dist/assets`).

**Reglas durables:**

- **Es el `AdminLayout` de todos los sitios**: club, distrito, Feria y el
  administrador central. No hay una versión por sitio.
- **Sólo en escritorio (≥ 1024 px).** En el teléfono el menú es un cajón que
  se abre entero; el botón de minimizar no se muestra y una preferencia
  guardada no lo afecta (`mini = collapsed && isDesktop`).
- **Minimizada: 80 px**, íconos centrados, títulos de sección como líneas,
  sin versión ni datos del perfil (sólo su avatar). Maximizada: 288 px, como
  siempre.
- **El logotipo, minimizada, va en el ENCABEZADO** (v4.1334), a la izquierda
  del título de la sección, enlazado al sitio: en 80 px un logotipo horizontal
  (Rotary | Feria…) quedaba ilegible entre los botones. Maximizada —y en el
  teléfono— vuelve a la barra. Nunca se pinta en los dos sitios a la vez
  (`data-logo-encabezado` sólo existe con `mini`). Sin logotipo cargado, el
  respaldo es el ícono «R» con el nombre del sitio.
- **⚠️ EL TÍTULO FLOTANTE VA FUERA DE LA BARRA, con posición fija.** La lista
  tiene `overflow-y: auto`, que también recorta en horizontal: un globo
  posicionado dentro quedaría cortado contra el borde de 80 px. Se mide el
  ícono y se pinta un único globo fijo; desaparece al desplazar la lista.
- **Accesible**: cada ícono conserva su nombre (`aria-label`), el globo es un
  `role="tooltip"` y aparece también con el teclado (foco). Los bloqueados
  dicen «· bloqueado».
- **⚠️ ARRANCA MINIMIZADA, SIEMPRE (v4.1341).** Pedido del cliente: «que
  siempre esté minimizado por defecto; maximizar, opcional». Maximizar se
  recuerda SÓLO en la pestaña (`sessionStorage`, clave
  `admin-sidebar-expanded` = «1»): sobrevive a navegar y recargar, y cada
  visita nueva vuelve minimizada. La preferencia de v4.1333
  (`admin-sidebar-collapsed` en `localStorage`) se ignora a propósito: quien
  la guardó en «0» quedaría maximizado para siempre. Con try/catch: si el
  almacenamiento falla arranca minimizada y el botón sigue funcionando en los
  dos sentidos. (Hasta v4.1340 arrancaba maximizada y recordaba la elección
  en `localStorage`.)
- **⌘K / Ctrl+K** con la barra minimizada la maximiza y enfoca el buscador; el
  ícono de lupa hace lo mismo.
- Un ítem nuevo del menú no necesita nada: hereda ícono, título flotante y
  nombre accesible del mismo `map`.
