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

## Fase 2 — Runtime, Model Gateway, aprobaciones, pilotos y Consumo de IA (v4.1316.0)

**Consumo de IA (pedido del cliente: «un módulo de consumo para poder medir»).**
`server/lib/aiUsage.js`. Cada llamada que pasa por el enrutador (`ai-router.js`,
instrumentado con un `meter` que llena cada proveedor y que `callModel` registra
en éxito Y en falla) o por el gateway de agentes deja una fila en `AiUsageEvent`
y suma en `AiUsageDaily` (día de Bogotá × sitio × proveedor × modelo × función).
La ATRIBUCIÓN viaja en un AsyncLocalStorage: `withAiContext({feature, siteId,
installationId, runId})` o, para no reestructurar una ruta, `enterAiContext` al
inicio del manejador. El costo es ESTIMADO con `AiModelPrice` (editable en el
panel; `DEFAULT_PRICES` de referencia) y un modelo sin precio se marca, no se
inventa. **Medir nunca rompe lo medido**: `recordAiUsage` no lanza y tiene tope
de 1,5 s. Cobertura honesta: lo que llama al proveedor directamente (módulos
antiguos con `fetch` propio) todavía no se mide, y la pantalla lo dice.

**Model Gateway** (`agentGateway.js`): `chatWithTools` con herramientas para
Gemini, OpenAI (y compatibles) y Anthropic; las conversiones son puras y
probadas sin red. Reutiliza `ai_model_configs`, claves cifradas, la cadena de
respaldo y `describeProviderFailure`. Un modelo elegido a mano (`explicit`) no
cae a otro. El modelo de una ejecución: instalación → versión → ajuste → el del
enrutador.

**Runtime** (`agentRuntimeStore.js`, criterio en `agentRuntimeSpec.js`): cola
`AgentTask` con reclamo `FOR UPDATE SKIP LOCKED` + lease de 90 s, ejecución por
PASOS (máx. 12 pasos, 4 herramientas por paso) en el cron `agents-tick` (cada
minuto, 240 s de los 300) y en «Probar agente»; reintentos a 1, 4 y 16 min;
`AgentRun`/`AgentRunStep` guardan cada paso. Interruptor general y presupuesto
mensual por instalación (`monthSpendUsd`) se respetan ANTES de gastar.

**Herramientas** (`TOOL_CATALOG` + `agentToolExecutors.js`): N0 lectura, N1
borrador, N2 interna, N3 externa. Concesión por instalación (`AgentToolGrant`:
`read` / `draft` / `act_with_approval`); al instalar se conceden las que pide la
versión. **Ningún esquema tiene `siteId`/`clubId` y ningún ejecutor lo lee de
`args`**: el alcance es el de la instalación (la prueba de punta a punta pide un
evento de otro sitio pasando `siteId` y no obtiene nada). Lo prohibido
(`PROHIBITED`) no tiene herramienta.

**Aprobaciones** (`AgentApproval`): la carga se CONGELA con su huella
(`approvalHash`, independiente del orden de claves); al aprobar se recalcula y si
cambió NO se ejecuta; el reclamo es atómico (dos clics no ejecutan dos veces);
deciden la plataforma o quien administra ESE sitio; vencen a los 7 días.

**Los tres pilotos** (`WORKFLOWS`, definidos en código): los HALLAZGOS son
deterministas y citan su fila (`reviewRegistrations`: sin comprobante, posible
duplicado por correo o documento, pago y estado que no cuadran, pendientes hace
días, datos incompletos; `reviewSubmission`: requisitos e inconsistencias por
campo; `toneReview`: hablar en nombre de RI, garantías). La IA SÓLO redacta el
resumen, y sólo si el agente piloto está instalado y encendido en el sitio; sin
él, el informe sale completo y dice por qué no hay resumen. Comunicaciones crea
la noticia como BORRADOR y deja «publicar» como aprobación N3. «Crear agentes
piloto» siembra las tres plantillas como borrador.

**Programaciones y eventos**: `AgentSchedule` con `daily@HH:MM`,
`weekly@D@HH:MM`, `every@N` (≥ 15) y `event@tipo`, en hora de Bogotá; el tick
reprograma ANTES de ejecutar. Los módulos emiten con `emitAgentEvent`
(`agentEvents.js`, liviano, nunca lanza): `event_registration.created`,
`event_registration.completed`, `fair_submission.created`,
`content_submission.received`. Idempotencia por programación+hora y por
evento+programación.

Pantallas nuevas: Workflows, Tareas (detalle paso a paso), Aprobaciones,
Consumo de IA; en cada instalación, herramientas concedidas, presupuesto y
«Probar el agente».

Pruebas: `test:agents:runtime` (112, sin base ni red, en `prebuild`) y
`test:agents:runtime:e2e` (41, Postgres LOCAL y modelo simulado).

## Fase 3 — Despliegues por oleadas, mapa, vista por sitio y workflows 1/7/8 (v4.1317.0)

**Despliegues** (`agentRolloutSpec.js` puro + `agentRolloutStore.js`; tablas
`AgentRollout` y `AgentRolloutTarget`) REEMPLAZAN `POST /api/agents/deploy-all`
(ahora responde 410). Un despliegue: plantillas sueltas o una PLANTILLA DE
EQUIPO (`TEAM_PRESETS`: club básico, gestión distrital, proyectos, eventos,
administración central) × destino por TIPOS DE SITIO (sólo cuentan los
integrados) o sitios × oleadas (`planWaves`, acumulativas y DETERMINISTAS: el
mismo despliegue elige los mismos sitios; por omisión 1 piloto → 25 % → 100 %).
La primera oleada exige ESCRIBIR el número de sitios (`confirmationOk`).
Avanzar pasa por la compuerta de salud (`healthGate`: con ≥ 5 ejecuciones y
> 20 % fallidas, PAUSA; una persona puede reanudar a sabiendas). Llega APAGADO y
cada sitio elige su responsable, salvo «encender con el primer administrador
del sitio». Lo que el sitio ya tenía se informa, no se duplica. Revertir APAGA
lo instalado por ese despliegue con su porqué; no borra historial. Lo que la
plantilla de equipo pide y no está publicado se INFORMA y no se despliega.

**Vista por sitio.** `/api/agent-center` tiene dos alcances (`resolveScope`): la
plataforma ve todo; quien administra un sitio (`isSiteManager` con `clubId`) ve
SÓLO el suyo — `siteOf(req, pedido)` ignora el sitio pedido y usa el de la
sesión, y `ownOr404` devuelve 404 para lo ajeno. Un sitio enciende sus agentes,
elige responsable (que tiene que administrar ESE sitio), ajusta nombre e
instrucciones, prueba, decide sus aprobaciones, ejecuta y programa workflows y
ve su consumo; NO cambia herramientas concedidas, presupuesto, plantillas,
tipos de sitio ni despliegues (`platformOnly`). Verificado por HTTP con un
token de club. El menú muestra «Agentes IA» a `district_admin` y `club_admin`
(el RBAC `agents` decide además).

**Mapa de agentes** (`buildNetwork`, puro): columnas equipo → agente →
herramienta → módulo; una arista agente→herramienta existe SÓLO si hay una
concesión real, con estilo activo / inactivo / con error según el estado de las
instalaciones que la tienen. Una plantilla sin instalar no aparece.

**Workflows 1, 7 y 8**: formulación de proyectos (`reviewProjectIdea` +
borrador estructurado con IA; lo que falta va a preguntas, no se inventa),
auditoría de sitios (`reviewSiteHealth`: identidad, contenido, eventos y SEO
Inteligente, cada hallazgo con su tarea) e informe distrital (indicadores de
los clubes del distrito por `districtId`/`district`, clubes sin actividad
publicada, BORRADOR hasta que el distrito lo VALIDA —`validateWorkflowRun`,
una vez, sólo el distrito o la plataforma—). Tres plantillas nuevas:
`pilot-formulacion-proyectos`, `pilot-auditoria-web`, `pilot-informes-distritales`.

Pruebas: `test:agents:rollout` (58, sin base, en `prebuild`) y
`test:agents:runtime:e2e` ampliada a 65.
