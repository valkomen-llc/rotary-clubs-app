# Los módulos del panel ocupan el ancho completo — v4.1307

## El problema

`AdminLayout` es de ancho completo desde v4.1111 (`wide = true` por defecto):
el área de contenido sólo pone `px-4 sm:px-6 py-6`. Aun así, en un monitor
ancho varios módulos se veían como una columna centrada con dos franjas vacías
a los lados. La causa no era el layout: **cada módulo se volvía a encerrar en
su propio contenedor** `max-w-7xl mx-auto` (o `max-w-6xl`, `max-w-[1400px]`…),
y algunos sumaban además su propio `p-6` / `p-8` al relleno del panel.

Caso reportado: el Centro de Gestión del Evento de la Feria
(`/admin/dashboard?panel=proyectos`, `ProjectFairDashboard.tsx`), con la tabla
de «Proyectos postulados» recortada a la derecha.

## Qué se cambió

El contenedor raíz de estos módulos pasó a `w-full` (sin `mx-auto`, sin tope y
sin relleno propio):

- `src/pages/admin/`: `ProjectFairDashboard`, `TechnicalRequests`, `SocialHub`,
  `MembersPage`, `AnniversaryStudio`, `Translations`, `Perfil`, `AIAssistant`,
  `PaymentBlocksManager`, `StoreManagement` (pestaña de configuración),
  `ImageDistribution` (pestaña de configuración).
- `src/components/admin/`: `DownloadsAdmin`, `FinancialAdmin`, `NgseAdmin`,
  `RotexAdmin`, `SponsoredClubAdmin`, `YouthExchangeAdmin`.

## Regla durable

- **Un módulo del panel NO se encierra en `max-w-* mx-auto`.** El ancho y el
  relleno lateral los pone `AdminLayout`. El contenedor raíz usa `w-full`.
- Topes chicos siguen siendo correctos donde tienen sentido: modales
  (`max-w-md … max-w-5xl` dentro de un `fixed`), tarjetas centradas, textos de
  lectura, asistentes paso a paso (`max-w-2xl/3xl`) y la columna de mensajes de
  un chat.
- Si una pantalla necesita a propósito el contenedor acotado, se escribe el
  comentario `ancho-acotado-ok` con el motivo en esa línea o la anterior
  (ejemplos: `SuperAssistantChat.tsx`, `Agents.tsx`, que vive en
  `MissionControlLayout`). Para el layout entero existe `wide={false}`.

## La barrera

`scripts/check-admin-full-width.mjs` (`npm run check:admin-width`, en
`prebuild`) revisa `src/pages/admin` y `src/components/admin` y rompe el
despliegue si una línea combina `mx-auto` con `max-w-5xl` o mayor,
`max-w-screen-*` o `max-w-[≥1000px]`, salvo `AdminLayout.tsx` y las líneas
marcadas con `ancho-acotado-ok`.

No mira `max-w-4xl` porque ese tope se usa legítimamente en tarjetas y textos;
los contenedores raíz que lo usaban (`Perfil`, `AIAssistant`,
`PaymentBlocksManager`, `StoreManagement`) se corrigieron a mano. El de
`WhatsAppQR` se conserva: sólo acota la pantalla de vinculación por QR, y al
conectar ya pasa a `w-full`.
