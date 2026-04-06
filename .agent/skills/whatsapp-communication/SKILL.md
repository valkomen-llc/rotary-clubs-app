---
name: "WhatsApp Communication"
description: "Gestión de comunicación directa con socios y comunidad vía WhatsApp Business API."
capabilities: ["whatsapp_send", "whatsapp_campaigns", "whatsapp_import"]
---

# WhatsApp Communication — Rotary ClubPlatform

## Objective
Mantener comunicación fluida, directa y personalizada con socios, leads y comunidad de cada club Rotary a través de WhatsApp Business API. Agente Camila ejecuta estas acciones.

## Arquitectura WhatsApp del Sistema

### Modelos de Datos (Prisma)

| Modelo | Función |
|--------|---------|
| `WhatsAppConfig` | Credenciales Meta por club (phoneNumberId, accessToken, wabaId) |
| `WhatsAppContact` | Contactos con stats (enviados, entregados, leídos, fallidos) |
| `WhatsAppContactList` | Listas de segmentación (Socios Activos, Leads Web, etc.) |
| `ContactListMember` | Relación N:N entre contactos y listas |
| `WhatsAppTemplate` | Templates aprobados por Meta (MARKETING, UTILITY) |
| `WhatsAppCampaign` | Campañas masivas con tracking de envío |
| `WhatsAppMessageLog` | Log de cada mensaje (status, timestamps, dirección) |
| `WhatsAppCustomField` | Campos personalizados por club |

### Endpoints del CRM (server/routes/whatsapp-crm.js)

**Webhook público (sin auth):**
- `GET /whatsapp/webhook` — Verificación de Meta
- `POST /whatsapp/webhook` — Recepción de mensajes entrantes

**Contactos:**
- CRUD completo + importación CSV + importación desde Leads
- `POST /contacts/:id/send` — Envío directo
- `POST /fix-phones` — Corrección de indicativos

**Campañas:**
- CRUD + `POST /campaigns/:id/send` — Envío masivo
- `GET /campaigns/:id/logs` — Logs de entrega

**Analytics:**
- `GET /analytics` — Métricas de rendimiento

## Agent Tools Disponibles

### `send_whatsapp_message`
Envía un mensaje directo a un contacto. Auto-crea el contacto si no existe.
```
Capabilities requeridas: whatsapp_send, whatsapp_campaigns
Params: phone (obligatorio), message (obligatorio), contactName (opcional)
```

### `create_whatsapp_campaign`
Crea una campaña de envío masivo con lista y template.
```
Capabilities requeridas: whatsapp_campaigns
Params: name, listName (obligatorio), templateName, templateVars, description, scheduledAt
```

### `import_leads_to_whatsapp`
Importa contactos desde CommunicationLog y User a WhatsApp.
```
Capabilities requeridas: whatsapp_import, whatsapp_campaigns
Params: tags (opcional), listName (opcional, default: "Leads Web")
```

## Mejores Prácticas — WhatsApp Business API

### Templates de Meta
- **MARKETING**: Promociones, eventos, noticias del club. Requiere opt-in del usuario.
- **UTILITY**: Confirmaciones, recordatorios, notificaciones de servicio. Menor restricción.
- **AUTHENTICATION**: OTP y verificación. No aplica para clubes.

### Compliance Anti-Spam
1. **Opt-in obligatorio**: Solo enviar a contactos que consintieron recibir mensajes
2. **Ventana de 24 horas**: Mensajes libres solo durante las 24h después del último mensaje del usuario
3. **Fuera de ventana**: Solo templates aprobados por Meta
4. **Rate limits**: Respetar los límites de envío de la cuenta WABA
5. **Opt-out**: Siempre incluir opción de desuscripción

### Segmentación Recomendada

| Lista | Descripción | Frecuencia sugerida |
|-------|-------------|-------------------|
| Socios Activos | Miembros del club con membresía vigente | 2-3 mensajes/semana máx |
| Leads Web | Visitantes que completaron formulario de contacto | 1 mensaje de bienvenida + seguimiento |
| Donantes | Personas que han realizado donaciones | Agradecimiento + actualizaciones de proyecto |
| Jóvenes (Rotaract/Interact) | Miembros de clubes juveniles | Eventos y actividades juveniles |
| Ex-alumnos Intercambio | Participantes de Youth Exchange / ROTEX | Reuniones anuales, novedades |

### Flujos de Conversión

```
Lead Web → Importar a WhatsApp → Template Bienvenida → Seguimiento 48h → Invitación a reunión
Nuevo Socio → Mensaje personalizado → Info de primera reunión → Recordatorio semanal
Evento Creado → Campaña a "Socios Activos" → Recordatorio 24h antes → Agradecimiento post-evento
Proyecto Publicado → Notificación a "Donantes" → Link directo al proyecto → CTA de donación
```

## Rules & Constraints
- NUNCA enviar mensajes sin verificar que WhatsAppConfig esté activa para el club
- Siempre usar templates aprobados para mensajes fuera de la ventana de 24h
- Respetar la privacidad: no compartir datos de contactos entre clubes
- Registrar cada mensaje en WhatsAppMessageLog para auditoría
- Responder en español
- Antes de enviar campañas masivas, confirmar con el administrador del club
