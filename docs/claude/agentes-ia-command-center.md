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

## Fase 1 — El registro: plantillas, instalaciones y tipos de sitio (v4.1315.0)

`/admin/agentes` es ahora el **AI Agent Command Center** (`src/pages/admin/agentCenter/`),
dentro de `AdminLayout`. Se borraron `Agents.tsx` y `MissionControlLayout.tsx`
(el menú de botones deshabilitados). Secciones: Resumen, Agentes, Instalaciones,
Tipos de sitio, Importar, Auditoría y Ajustes; cada fase suma las suyas cuando su
fuente de datos existe.

**Plantilla + instalación, no copias.** `AgentTemplate` es QUÉ es un agente
(borrador de trabajo en `draft`); publicar crea una `AgentTemplateVersion`
INMUTABLE. `AgentInstallation` es DÓNDE trabaja (`scopeType` `platform` o
`site` + `siteId`), fijada a una versión; las no fijadas (`overrides.pinned`)
pasan solas a cada versión nueva. Una plantilla se instala UNA vez por ámbito
(índice único con `COALESCE("siteId", '')`).

**Tipos de sitio integrables (pedido del cliente).** `AgentSiteTypePolicy`:
la plataforma elige con qué tipos de sitio se integran los agentes —clubes,
distritos, ferias de proyectos, programas de intercambio, eventos, zonas,
asociaciones, Colrotarios— y qué EQUIPOS trabajan en cada uno. El catálogo SALE
de `ENTITY_TYPES` (`server/lib/entityTypes.js`): un tipo nuevo aparece solo. Por
omisión sólo `club` y `district` (donde ya había copias heredadas). Un tipo
apagado no recibe instalaciones nuevas y las que tiene quedan «Deshabilitado»
(no se borran).

**Estados que se pintan, derivados** (`installationState`): Disponible,
Instalado, Configurado, **Solo perfil** (encendido sin herramientas ni motor:
el estado honesto de los heredados), Activo, Ejecutando, Con error,
Deshabilitado. Un agente de SITIO no se enciende sin responsable.

**Migración de los heredados** (`planLegacyMigration`, puro; `migrateLegacy`,
idempotente por `legacyAgentId`; corre sola la primera vez que se abre el
registro): una plantilla por agente global (Elena incluida, aunque sólo existe
en la base) con su versión 1 = LO QUE HAY EN LA BASE; una por agente propio de
un club; una instalación por fila, y la copia de un club que difiere del global
guarda su diferencia en `overrides` (`legacyOverrides`). Antigravity, Santiago,
Sebastián, Carlos, Mateo y Diego quedan sólo para la administración central.

**Espejo a "Agent"** (`mirrorToLegacy`): publicar actualiza la fila global
heredada y, en cada copia de club, los campos que ESE club no personalizó. Así
el chat de siempre responde con lo publicado durante la transición. Encender o
apagar una instalación también actualiza `active`.

**Importador.** The Agency fijada al commit `8ae6164602c95ca78828b148b9052460ee426885`
(MIT, atribución en `sourceRef`), sólo de la lista CURADA de 22 perfiles
(`AGENCY_SOURCE.curated`), descarga con `AbortSignal.timeout`, tope de tamaño y
siempre como BORRADOR marcado «por adaptar». Las 48 habilidades de
`.agent/skills` viajan en `server/lib/agentSkillsBundle.js` (la función de
Vercel no lleva `.agent`): `npm run bundle:agent-skills` lo regenera y
`test:agents:registry` falla si se desincroniza.

**Permisos.** Nuevo módulo RBAC `agents` (ver, editar, publicar, administrar),
espejado en `src/lib/rbacSpec.ts`; `/admin/agentes` salió de `integrations` con
el mismo puente `site_settings`. La API `/api/agent-center` es sólo de la
plataforma en esta fase.

| Archivo | Qué es |
|---|---|
| `server/lib/agentRegistrySpec.js` | El CRITERIO puro: equipos, tipos de sitio, estados, borradores, Markdown, The Agency, migración |
| `server/lib/ensureAgentCenterSchema.js` | Las tablas, por fases, con `OWNED_COLUMNS` |
| `server/lib/agentRegistryStore.js` | La base: plantillas, versiones, espejo, instalaciones, políticas, habilidades, importador, auditoría |
| `server/routes/agentCenter.js` | `/api/agent-center` |

Pruebas: `test:agents:registry` (95, sin base, en `prebuild`) y
`test:agents:registry:e2e` (45, contra un Postgres LOCAL vacío: migración,
espejo que conserva lo personalizado, tipos de sitio, instalación, importador).
