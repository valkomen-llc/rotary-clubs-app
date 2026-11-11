# AI Agent Command Center — Agentes IA de Club Platform

El módulo `/admin/agentes` evoluciona por fases desde un CRUD de perfiles hacia
un centro de agentes que trabajan con herramientas autorizadas, aislamiento por
organización y aprobación humana. El plan completo (diagnóstico, arquitectura,
permisos, workflows, panel y riesgos) se publicó como documento aparte; aquí
vive lo que ya está en el código y las reglas que lo sostienen.

**Regla de oro: el alcance NUNCA lo decide el modelo ni el cuerpo de una
petición.** El club, el distrito o la plataforma sobre los que actúa algo salen
de la sesión o de la instalación del agente.

## Diagnóstico de partida (v4.1313, verificado en el código)

| Pieza | Estado antes del programa |
|---|---|
| `/admin/agentes` (Agents.tsx + `server/routes/agents.js`) | CRUD real de la tabla `"Agent"` |
| «Task Queue», «Schedule», «Activity Logs», «Vector Memory» (`MissionControlLayout.tsx`) | Botones deshabilitados, sin nada detrás. La UI estaba en inglés; el español de las capturas era la traducción del navegador |
| `DEFAULT_AGENTS` | 17 agentes en el código. **Elena NO está en el código**: existe en producción porque alguien la creó a mano |
| `seedAgents` | Reescribía prompt, rol, descripción, saludo y capacidades en CADA `GET /api/agents` → las ediciones se perdían |
| `deploy-all` | Copiaba los 17 del código a cada club activo, pisando lo personalizado; el modal decía «9» |
| Chat (`/api/ai/agent-chat`) | Responde con el modelo por defecto del enrutador (Gemini), SIN herramientas; `Agent.aiModel` se ignora |
| `agent-tools.js` | 13 herramientas, varias con escritura real, ninguna con aprobación |
| `delegate_task` | Escribe filas que nadie procesa |
| Cerebros (`/api/brains`) | Embeddings Gemini `text-embedding-004` en `Float[]`, coseno en JS; el maestro recibe copia de todo |
| Agente de WhatsApp (`whatsappAgent.js`) | El runtime más maduro, con traza; no enlazado a `"Agent"` |
| Mission Control VIP | Tablero REAL de solicitudes de contenido (motores de artículo y Reel); sus «agentes» son personajes fijos |

## Fase 0 — Contención (v4.1314.0)

Sin funciones nuevas. Cierra los hallazgos S1–S8 del diagnóstico.

**El criterio único: `server/lib/agentScope.js`** (puro). Las rutas lo consultan
y no repiten la regla a mano.

| Hallazgo | Corrección |
|---|---|
| S1 `POST /api/agents/orchestrate` sin sesión, `clubId` del cuerpo | Con sesión: el club de la sesión (la plataforma puede indicar otro). Sin sesión: sólo `PUBLIC_ORCHESTRATION_EVENTS` (`new_contact_lead`), club resuelto por el DOMINIO (`resolveSiteId`) con `resolvePublicClub`, límite 5/min por IP y 60/h por sitio. El asistente de onboarding ahora manda su token |
| S2 `GET/PUT/DELETE /api/agents/:id` sin rol ni club | `canReadAgent` / `canManageAgent` (`loadManageable`): un global sólo lo cambia la plataforma; uno de club, quien administra ese club. 404 cuando ni siquiera lo puede ver |
| S3 el maestro abierto a cualquier sesión | `canReadBrain` abre el maestro, pero `masterMemoryWhere` recorta DENTRO de la consulta: lo global (sin club ni distrito) y lo propio. Aplica a detalle, memorias, búsqueda, `master/query`, `graph/full` y `export/payload` |
| S4 notas con permiso de lectura, `/migrate` sin rol, escritura con alcance deducido del dominio | `canWriteBrain`: rol de administración del sitio, nunca en el maestro (salvo la plataforma) y nunca con `scope.fromHost`. `/migrate` sólo la plataforma |
| S5 `POST /api/ai/chat` con `clubId` del cuerpo | Mismo criterio del dominio + 20/min por IP |
| S6 Mission Control VIP sin alcance | `requireSubmissionInScope` en las nueve rutas `/tasks/:submissionId/*`; `runAutomations` de un sitio sólo sus campañas y sin barridos globales |
| S7 herramientas con efecto externo sin aprobación | `create_news_post` siempre borrador; `AGENT_DISABLED_TOOLS` (envío de WhatsApp, campañas, importación de contactos) ni se ofrecen ni se ejecutan para agentes |
| S8 `agent-chat` busca por nombre en todos los clubes | Por id: `canReadAgent`; por nombre: sólo globales o del propio club. Elegir club por `hostname` es sólo de la plataforma. `assistant-chat` sólo ofrece herramientas a quien administra el sitio |
| Siembra destructiva | `seedAgents` y `deploy-all` sólo INSERTAN lo que falta. `GET /api/agents` devuelve `defaultAgentsCount` y el modal lo usa |

**Un club dentro del sitio de su distrito.** Si el dominio resuelve al sitio del
distrito y el cuerpo pide un club del MISMO `districtId`, se acepta
(`RELATED_TO_HOST_SQL` → `requestedRelatedToHost`): la página del club vive en
ese dominio.

Pruebas: `npm run test:agents:security` (75, sin base ni red, en `prebuild`).
Verificadas a la inversa: quitar `requireSubmissionInScope` de una ruta, abrir
los globales a cualquier club o devolver `true` para el maestro hacen fallar la
batería.
