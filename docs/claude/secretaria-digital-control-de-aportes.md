<!-- Módulo propio. Léelo ANTES de tocar el acceso a la Bóveda o la vigencia de una membresía. -->

## Secretaría Digital — Control de Aportes (v4.1265)

Pedido del Distrito 4281: que `secretaria@rotary4281.org` (Janet Solano,
Secretaría Digital 2026-2027) siga los aportes en la Bóveda existente
—identificar aportantes, verificar estados, descargar soportes, exportar— sin
poder mover dinero, y que el acceso dure el período.

| Pieza | Qué es |
|---|---|
| `digital_secretary` en `ROLE_PRESETS` (`server/lib/rbacSpec.js` + espejo `src/lib/rbacSpec.ts`) | El rol: `finance.view`, `finance.export`, `email_inbox.use_own`. `landing: '/admin/boveda'` |
| `rotaryPeriodEnd` · `normalizeValidUntil` · `isMembershipExpired` (`rbacSpec.js`) | La VIGENCIA. Puro |
| `SiteMembership."validUntil"` (`ensureRbacSchema.js`) · `setMembershipValidity` (`rbacStore.js`) | Dónde vive la fecha. NULL = sin vencimiento |
| `PUT /api/rbac/users/:userId/validity` (`putUserValidity`) | Fijarla o quitarla. `users.manage`, auditado |
| `server/lib/vaultAudit.js` · `POST /api/financial/wallet/access-log` | La traza de quién consulta la Bóveda |
| `src/lib/contributionControl.ts` (puro) · `contributionControlExport.ts` | El criterio de «Control y Justificación» y su exportación |
| `src/components/admin/wallet/ContributionControlView.tsx` | La pestaña dentro de la Bóveda |

Pruebas: `npm run test:digital-secretary` (125 casos, **sin base, credenciales
ni red**; el espejo y la vista se compilan con esbuild). Verificadas a la
inversa: la ficha devuelta a `requireSiteAdmin` → 1 fallo; registrar un
traslado abierto a `finance.view` → 1; el `return` del vencido quitado → 3;
`finance.manage` en el preset → 4; el traslado siempre «completo» → 1; volver a
`acceso.can` → 1.

**Reglas durables:**

- **⚠️ NO HAY UNA BÓVEDA PARALELA NI UN SEGUNDO SISTEMA DE PERMISOS.** El rol es
  un preset más del RBAC de v4.937, la puerta es la misma
  `requireRoleOrPermission(SITE_ADMIN_ROLES, …)` de siempre, y la vista de
  control lee la MISMA respuesta de `/financial/donations` que «Aportes
  recibidos». Nada de esto compara un correo: la cuenta recibe el rol desde
  «Usuarios y permisos», como cualquier otra.
- **⚠️ MIRAR Y MOVER SE SEPARAN EN EL SERVIDOR.** Lectura → `finance.view`
  (aportes, saldos, ficha/ciclo de vida, lotes y su historial, auditoría del
  ciclo). Todo lo que SALE como archivo → `finance.export` (comprobante del
  traslado, conciliación del lote o de una selección, documento archivado), y
  queda auditado. **Ninguna ruta que escribe cambió**: registrar/reversar un
  traslado, reintentar un aviso, reenviar conciliaciones o confirmaciones,
  sincronizar con Stripe, barrer estados, beneficiarios, pedir un retiro y las
  credenciales de pago siguen en `requireSiteAdmin`, `finance.manage` o el
  operador. La prueba lo enumera ruta por ruta.
- **⚠️ ESTO AMPLÍA LO QUE VE QUIEN YA TENÍA `finance.view`, y se dice.** La
  ficha del aporte (ciclo de vida) y los lotes pedían administrador aunque la
  pantalla se los mostraba a todo acceso de «ver»: el usuario institucional, «Solo
  lectura» y la Fundación Rotaria abrían la ficha y leían un 403. Ahora la
  leen. **No ganan descargas**: los comprobantes piden `finance.export`, que el
  menú base institucional no trae. (La entrada de v4.1206 en `SystemUpdates`
  afirmaba que la ficha ya estaba abierta a `finance.view`; no lo estaba.)
- **⚠️ UN ROL ACOTADO NO ACOTA A UN ADMINISTRADOR POR ROL DE `User`.**
  `requireRoleOrPermission` deja pasar `SITE_ADMIN_ROLES` ANTES de mirar
  permisos. Si la cuenta tuviera `club_admin`/`district_admin`/`editor`, el
  rol «Secretaría Digital» le recortaría el menú y no le cerraría ni una ruta.
  `putUserRole` lo DICE en `warnings`. Lo correcto es que la cuenta sea
  `institutional_user` —lo es toda cuenta creada desde Correo Institucional o
  desde «+ Crear usuario»—.
- **⚠️ LA VIGENCIA VIVE EN LA MEMBRESÍA, NO EN `User` NI EN EL ROL.** `User` no
  gana columnas (v4.932) y el rol es de todos los que lo tienen. Una fecha en
  `SiteMembership` es por persona y por sitio, que es lo que es un cargo.
- **⚠️ VENCER NO BORRA NADA.** `resolveGrant` devuelve `source: 'expired'` con
  cero permisos y CONSERVA rol, alcance y traza; renovar es mover la fecha. El
  historial de aportes es del sitio, no de quien lo mira.
- **⚠️ Y EL VENCIDO NO CAE AL RESPALDO.** Sin el `return` temprano, una
  institucional vencida seguiría entrando por `legacy_permissions` o por el
  menú base, y la vigencia no vencería nada. Lo fija una prueba.
- **UNA FECHA SIN HORA ES EL DÍA ENTERO EN HORA DE COLOMBIA** (`VALIDITY_DAY_END`,
  −05:00). «Hasta el 30 de junio» vence al terminar el 30, no al empezar. El
  período rotario (1-jul → 30-jun) lo resuelve el SERVIDOR (`rotaryPeriod` en
  `/rbac/catalog`); la pantalla no rehace la aritmética (regla de v4.849).
- **Una fecha ilegible en la fila NO vence a nadie**: ante un dato roto no se
  quita un acceso en silencio. Una ilegible en el FORMULARIO se rechaza con su
  motivo.
- **`expired` no recorta el menú**, como `suspended` (v4.939): el servidor
  contesta `access_expired` con la fecha y la salida (renovar), que se lee como
  un motivo y no como una avería.
- **No se le pone fecha al único administrador** (`orphanCheck`), ni nadie a sí
  mismo — mismas puertas que el estado.
- **⚠️ LA AUDITORÍA ES LA MISMA TABLA** (`InstitutionalAccessEvent`), con cinco
  hechos nuevos en `RBAC_AUDIT_EVENTS`: `membership_validity_changed`,
  `vault_opened`, `vault_report_exported`, `vault_receipt_downloaded`,
  `vault_document_downloaded`. `GET /rbac/audit` manda ahora el NOMBRE del
  evento (`label`) y la pantalla lo pinta en vez de la clave cruda.
- **Las descargas las anota el SERVIDOR, y sólo si salieron** (`auditarBoveda`,
  `res.on('finish')` con código < 400): un 404 sobre un comprobante ajeno no es
  una descarga.
- **Abrir y exportar los DECLARA la pantalla**, porque ocurren en el navegador
  (la exportación se compone ahí, v4.850). Catálogo CERRADO
  (`describirDeclarado`): ni un evento inventado ni texto libre llegan a la
  auditoría, y declarar una exportación exige `finance.export`. **Límite dicho
  para no descubrirlo después:** el Excel/CSV/PDF del navegador sale de datos
  que `finance.view` ya puede leer, así que esconder el botón es lo único que
  separa «ver» de «exportar» para esos tres; los comprobantes y documentos sí
  los niega el servidor.
- **⚠️ TRES ESTADOS QUE NO SE FUNDEN** (`contributionControl.ts`): PAGO (la
  cubeta de Stripe), TRASLADO (desembolsos no reversados contra el NETO) y
  COMPROBANTE (todos los traslados con soporte). Confirmado no es trasladado,
  trasladado no es justificado, y un aporte sin traslado es «Sin traslado», NO
  «Comprobante pendiente». No se fabrica ningún comprobante ni se completa un
  dato ausente.
- **Ningún importe cruza monedas**: indicadores, contexto del archivo y totales
  son por moneda. Los conteos (aportes) sí se suman: no son dinero.
- **La vista de control no tiene período ni destino propios**: usa los de la
  barra de la Bóveda, que ya llegan aplicados por el servidor. Dos selectores
  de fechas podrían decir cosas distintas. Muestra TODAS las monedas a la vez
  (la pestaña de aportes muestra la activa).
- **El anónimo no lleva nombre ni correo al archivo** (regla de v4.850).
- **La ficha de siempre, en sólo lectura.** `DisbursementSection` y
  `DisbursementBatchModal` ganan `soloLectura` (sin «Registrar desembolso»,
  «Reintentar aviso» ni «Ver el correo») y `puedeDescargar`; `DonorCard`
  esconde «Reenviar confirmación» y «Ver traslado y conciliación» (que abre el
  REENVÍO). Un traslado sin soporte dice «Comprobante pendiente».
- **⚠️ `useSiteAccess` NO TIENE `can`.** `WalletManagement` llamaba
  `acceso.can('finance.manage')` desde v4.1216: con cualquier acceso acotado
  (`restricted`) eso era «acceso.can is not a function» y la Bóveda no se
  pintaba. Es `has`. El typecheck lo marcaba entre los cientos de errores
  heredados — lo pagó otra vez la regla de «dejar sin errores PROPIOS lo que se
  toque».
- **La tarjeta de supervisión nombra el rol REAL** (`grant.roleLabel`) y dice
  hasta cuándo vale. Decía «Fundación Rotaria» a toda cuenta sin
  `finance.manage` (regla de v4.939: una pantalla no afirma un rol que no es).

**Cómo se habilita a Janet (no lo hace un despliegue):** «Usuarios y permisos»
→ editar `secretaria@rotary4281.org` (o «+ Crear usuario» si no existe) → rol
«Secretaría Digital — Control de Aportes» → Vigencia «Hasta el fin del período
2026-2027» → Guardar. Si aparece el aviso del rol de plataforma, la cuenta es
administradora por `User.role` y hay que corregir eso primero. Queda en la
auditoría con quién lo hizo.

**v4.1271 — Directorio de Clubes y Catálogo Maestro.** El preset suma
`clubs.view` y `clubs.manage`. Para que eso fuera concedible se creó el módulo
de SITIO `clubs` («Directorio de Clubes», ruta `/admin/directorio-clubes`) en
`rbacSpec.js` + espejo; la ruta salió de `platform_sites`. Las rutas del
servidor ya pedían `clubs.view`/`clubs.manage` desde v4.1212 pero el permiso no
existía en el registro: ninguna cuenta acotada podía pasar. Escribir en el
catálogo exige además ser del sitio del distrito (`catalogScopeFromRecords`,
incluye `institutional_user`). Sigue SIN `finance.manage`.

**Pendientes conocidos:** el listado de `/financial/donations` trae hasta 200
aportes por consulta (suficiente hoy; paginar si un sitio lo supera); el club y
el distrito del aportante no existen como dato en `Donation` (se ven cuando el
aportante los escribió en su nombre) y no se deducen; la exportación del
navegador no se puede negar desde el servidor (ver arriba); y el vencimiento no
avisa por correo antes de ocurrir.
