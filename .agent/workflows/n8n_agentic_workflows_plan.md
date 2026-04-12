---
description: Plan de Implementación de Workflows (Ecosistema n8n de Agentes)
---
# Plan de Implementación de Workflows (Ecosistema n8n)

Para que el Mission Control deje de requerir interacción humana (arrastrar la tarjeta manualmente) y opere como un engranaje autómata puro, necesitamos construir los siguientes 3 workflows en tu instancia de n8n. Cada uno representa a un "Subagente".

## Orden Sugerido de Montaje

### 1. El Revisor y Redactor B2B (Content Engine - Agentes: Valeria/Mateo)
Este es el robot que procesa el crudo y lo vuelve digerible para tus Presidentes de Club.
- **Trigger:** Nudo *Schedule* (cada 30 min) o un *Webhook* que hace una petición `GET` a tu base de datos de Vercel (filtrando las subvenciones que tienen `status: 'backlog'`).
- **Paso 1:** Extrae la subvención del Backlog.
- **Paso 2 (Llamado de IA - Gemini/ChatGPT):** Manda el "Description" completo a la Inteligencia Artificial con el prompt: *"Eres un redactor B2B. Resume esta subvención en una plantilla estricta de WhatsApp de 4 líneas usando tácticas de copywriting persuasivo."*
- **Paso 3 (Actualización Vercel):** Realiza un `PUT` a `/api/scout-grants/:id` para guardar el texto redactado y cambiar el estatus en la base de datos a **`in_progress`**.

### 2. El Perito de Calidad (Quality Control - Agente: Sofía)
Para evitar que se compartan mensajes con alucinaciones o errores ortográficos por la plataforma.
- **Trigger:** Nudo que filtra las tarjetas de la BD que están en el estatus `in_progress`.
- **Paso 1:** Compara el texto de WhatsApp previamente generado con las directrices de la marca Rotary (tono diplomático e institucional).
- **Paso 2:** Si el texto aprueba los filtros, la mueve mediante un `PUT` al estatus **`done`** (lista para repartir). Si es malo, devuelve el `status` a `backlog` para re-redacción.

### 3. El Despachador (Distribution Engine - El Botón Verde en UI)
Este es el único Workflow que es "Event-Driven", reacciona inmediatamente a los botones verdes y azules que ya colocamos en tu interfaz.
- **Trigger (Webhook):** Escucha en la URL `https://n8n-n8n.urnhq7.easypanel.host/webhook/grant-distribution` (la cual ya programamos en tu código de React).
- **Paso 1 (Recepción):** Recibe el payload JSON cuando das "clic" en el Dashboard, verificando si presionaste "Email" o "WhatsApp".
- **Paso 2 (Outreach Directo):** 
  - Si es WhatsApp: Usa el nodo de *Meta WhatsApp Business API* para disparar el mensaje de alerta a la lista de teléfonos de tu Base de Datos (los Gobernadores/Presidentes).
  - Si es Email: Conecta con el nodo de Gmail o SendGrid para despachar el correo oficial.

---

## Próximos Pasos (Nuestro Punto de Partida Hoy)

Para comenzar hoy mismo y lograr "quick-wins" (victorias tempranas), mi sugerencia táctica es que **construyamos primero "El Despachador" (Workflow #3)**. 
Como en la interfaz de React ya tienes la tarjeta esperando en la columna `Done` y los botones ya disparan la data, si montamos este workflow hoy podemos conectar el botón directamente con tu celular (WhatsApp) cerrando el ciclo visual para tu demostración.
