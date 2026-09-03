// Crea en runtime, de forma perezosa e idempotente, las tablas de las
// conexiones de WhatsApp (multi-WABA).
//
// POR QUÉ EN RUNTIME: tras el incidente del 2026-07-13 el build ya NO ejecuta
// `prisma db push`, así que una tabla nueva del schema no aparece sola en
// producción. Mismo patrón que `ensureAutomationSchema` y las `ProjectFair*`.
// Acá pesa el doble: lo que está en juego es la línea de WhatsApp que hoy
// recibe mensajes, y un despliegue que escriba en la base es exactamente lo que
// la regla durable prohíbe.
//
// ⚠️ LAS TRES TABLAS VAN EN LA LISTA DEL GUARDIÁN DE `db:push`
// (`scripts/db-push-guard.mjs`). Sin eso, el primer `npm run db:push` las
// borraría con las credenciales de todas las líneas adentro.
//
// ⚠️ `WhatsAppMessageLog.connectionId` y `CrmConversation.connectionId` están
// declaradas ADEMÁS en `schema.prisma` cuando la tabla es de Prisma. El guardián
// compara TABLAS, no columnas: una columna que exista sólo acá la borraría el
// primer `db:push` sin que nada avise.
import db from './db.js';
import { ensureAutomationSchema } from './ensureAutomationSchema.js';

let _ready = false;

// Lo que este archivo crea. La comprobación previa los cuenta contra el
// catálogo para no gastar viajes a la base en cada arranque en frío.
//
// NO ES UN NÚMERO DE VERSIÓN: es la lista real de lo que hay abajo, y hay que
// ampliarla al agregar algo o la comprobación lo dará por presente. La trampa
// se pagó en v4.908 con `AnniversaryPiece.request`, y una prueba de este módulo
// recorre los `ADD COLUMN` del archivo y exige cada uno en la lista de abajo.
const EXPECTED_TABLES = [
  'WhatsAppConnection',
  'WhatsAppConnectionAgent',
  'ContactChannel',
];

const EXPECTED_COLUMNS = [
  ['WhatsAppMessageLog', 'connectionId'],
  ['CrmConversation', 'connectionId'],
];

export async function ensureWhatsAppConnectionSchema() {
  if (_ready) return;

  // `CrmConversation` la crea el otro ensure. Se llama PRIMERO porque
  // `ALTER TABLE … ADD COLUMN IF NOT EXISTS` falla si la TABLA no existe —el
  // `IF NOT EXISTS` es de la columna, no de la tabla—.
  await ensureAutomationSchema();

  const [tablesR, colsR] = await Promise.all([
    db.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name = ANY($1)`,
      [EXPECTED_TABLES]
    ),
    db.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = ANY($1)`,
      [[...new Set(EXPECTED_COLUMNS.map(([t]) => t))]]
    ),
  ]);
  const haveTables = new Set(tablesR.rows.map((r) => r.table_name));
  const haveCols = new Set(colsR.rows.map((r) => `${r.table_name}.${r.column_name}`));
  const tablesOk = EXPECTED_TABLES.every((t) => haveTables.has(t));
  const colsOk = EXPECTED_COLUMNS.every(([t, c]) => haveCols.has(`${t}.${c}`));
  if (tablesOk && colsOk) { _ready = true; return; }

  await db.query(`
    -- ═══════════════════════════════════════════════════════════════════════
    -- La CONEXIÓN: una línea de WhatsApp con su identidad y su credencial.
    -- ═══════════════════════════════════════════════════════════════════════
    --
    -- Sin claves foráneas, igual que el resto de los módulos fuera de Prisma:
    -- las relaciones se resuelven por columna y así no importa el orden de
    -- creación ni se arriesgan cascadas de borrado entre módulos. Acá además
    -- "clubId" apunta a un Club o a un District indistintamente, como
    -- WhatsAppContact.siteId.
    CREATE TABLE IF NOT EXISTS "WhatsAppConnection" (
      id TEXT PRIMARY KEY,
      "clubId" TEXT NOT NULL,

      -- El sitio, por si difiere del dueño de la fila (un distrito administra
      -- la línea de una de sus ferias). "siteType": club | district.
      "siteId" TEXT,
      "siteType" TEXT,

      -- Los TRES vínculos son OPCIONALES y los tres son nulos en la conexión
      -- de un Distrito. Una conexión puede colgar solamente de un sitio.
      "campaignId" TEXT,
      "projectId" TEXT,
      "eventId" TEXT,

      -- Obligatorio: es lo que se lee en «Enviar desde: …». Una línea sin
      -- nombre convierte ese selector en una lista de números.
      "displayName" TEXT NOT NULL,

      "phoneNumber" TEXT,
      "phoneNumberId" TEXT NOT NULL,
      "wabaId" TEXT NOT NULL,
      "appId" TEXT,

      -- Cifrado con tokenCrypto.js (AES-256-GCM versionado). El nombre lleva
      -- "Enc" a propósito: una columna llamada "accessToken" invita a leerla y
      -- usarla tal cual, que es justamente el defecto que arrastra
      -- WhatsAppConfig.
      "accessTokenEnc" TEXT,
      -- Es de la APP, no del número: con una sola aplicación de Meta es el
      -- mismo para todas las líneas. Se guarda por conexión para no atarse a
      -- esa suposición.
      "verifyToken" TEXT,

      "webhookProvider" TEXT NOT NULL DEFAULT 'meta_cloud',
      -- Catálogo CERRADO: draft | active | paused | error.
      status TEXT NOT NULL DEFAULT 'draft',
      "isDefault" BOOLEAN NOT NULL DEFAULT false,
      notes TEXT,

      -- Señales que pinta la tarjeta sin pedir un diagnóstico. Las escriben el
      -- router y el emisor, que son los que saben; NO se aceptan del cuerpo de
      -- una petición (aceptarlas permitiría fabricar un diagnóstico sano sobre
      -- una línea muerta).
      "lastVerifiedAt" TIMESTAMP(3),
      "lastInboundAt" TIMESTAMP(3),
      "lastOutboundAt" TIMESTAMP(3),
      "lastErrorAt" TIMESTAMP(3),
      "lastError" TEXT,

      -- De dónde salió la fila: 'manual' o 'legacy_config' cuando la creó el
      -- respaldo perezoso a partir de WhatsAppConfig. Es lo único que contesta
      -- «¿esta conexión la creó alguien o se migró sola?» dentro de un año.
      origin TEXT NOT NULL DEFAULT 'manual',

      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- ⚠️ EL ÍNDICE QUE SOSTIENE EL ROUTER. Un phone_number_id es único en Meta,
    -- así que dos filas con el mismo número son una contradicción, no una
    -- preferencia: sin este índice, el desempate de 'resolveConnection' tendría
    -- que decidir a cuál organización pertenece un mensaje, y equivocarse ahí
    -- es entregarle a un tercero una conversación que no es suya.
    CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppConnection_pnid_key"
      ON "WhatsAppConnection"("phoneNumberId");

    -- Respaldo del enrutamiento cuando el número se migró en el panel de Meta.
    -- NO es único: una WABA tiene varios números.
    CREATE INDEX IF NOT EXISTS "WhatsAppConnection_waba_idx"
      ON "WhatsAppConnection"("wabaId");

    CREATE INDEX IF NOT EXISTS "WhatsAppConnection_club_idx"
      ON "WhatsAppConnection"("clubId", status);

    -- ⚠️ ÍNDICE PARCIAL: hace IMPOSIBLE que un sitio tenga dos líneas
    -- principales. Por ser parcial, ningún ON CONFLICT contra él puede omitir
    -- el predicado o la sentencia falla entera (la trampa que costó una
    -- corrección en v4.648) — por eso el store marca la principal con un UPDATE
    -- en dos pasos y no con un upsert.
    CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppConnection_default_key"
      ON "WhatsAppConnection"("clubId") WHERE "isDefault";

    -- Para las pantallas que listan por vínculo. Parciales: la enorme mayoría
    -- de las filas los tiene nulos y un índice completo sería casi todo NULL.
    CREATE INDEX IF NOT EXISTS "WhatsAppConnection_project_idx"
      ON "WhatsAppConnection"("projectId") WHERE "projectId" IS NOT NULL;
    CREATE INDEX IF NOT EXISTS "WhatsAppConnection_event_idx"
      ON "WhatsAppConnection"("eventId") WHERE "eventId" IS NOT NULL;
    CREATE INDEX IF NOT EXISTS "WhatsAppConnection_campaign_idx"
      ON "WhatsAppConnection"("campaignId") WHERE "campaignId" IS NOT NULL;

    -- ═══════════════════════════════════════════════════════════════════════
    -- El AGENTE de una conexión.
    -- ═══════════════════════════════════════════════════════════════════════
    --
    -- Tabla aparte de la conexión por dos motivos: cambiar el agente no debe
    -- tocar la fila que lleva las credenciales, y un agente puede reutilizarse
    -- —el mismo prompt en dos líneas— sin duplicar la conexión.
    --
    -- Los campos son los MISMOS de WhatsAppAgentConfig a propósito: es el
    -- agente del sitio, con dueño. Así 'resolveAgent' puede heredar uno del
    -- otro sin traducir nada, y una conexión sin fila acá se comporta
    -- exactamente como el módulo antes de multi-WABA.
    CREATE TABLE IF NOT EXISTS "WhatsAppConnectionAgent" (
      id TEXT PRIMARY KEY,
      "connectionId" TEXT NOT NULL,
      "clubId" TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT false,
      name TEXT NOT NULL DEFAULT 'Asistente',
      "systemPrompt" TEXT NOT NULL DEFAULT '',
      "modelSlug" TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
      "useKnowledge" BOOLEAN NOT NULL DEFAULT true,
      -- Apunta a un brain concreto. Es la parte que el pedido necesita: la base
      -- de conocimiento de la Feria de Proyectos —inscripciones, formularios,
      -- fechas, pagos, postulaciones, agenda, sede, reglamento— no es la del
      -- Distrito, y 'getOrCreateBrainForClub(clubId)' ata el cerebro al sitio.
      -- NULL = el del sitio, que es el comportamiento de siempre.
      "brainId" TEXT,
      temperature DOUBLE PRECISION NOT NULL DEFAULT 0.6,
      "maxTokens" INTEGER NOT NULL DEFAULT 600,
      "historyLimit" INTEGER NOT NULL DEFAULT 12,
      "humanPauseMinutes" INTEGER NOT NULL DEFAULT 120,
      "fallbackMessage" TEXT,
      -- Ventana horaria y escalamiento por línea. Se evalúan con las guardias
      -- que ya existen en crmGuardrails.js; lo que cambia es de quién son.
      "quietHoursStart" INTEGER,
      "quietHoursEnd" INTEGER,
      timezone TEXT,
      "escalateTeam" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Un agente por conexión. NO es parcial —"connectionId" es NOT NULL— así
    -- que un ON CONFLICT contra él va a secas, sin repetir predicado.
    CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppConnectionAgent_conn_key"
      ON "WhatsAppConnectionAgent"("connectionId");
    CREATE INDEX IF NOT EXISTS "WhatsAppConnectionAgent_club_idx"
      ON "WhatsAppConnectionAgent"("clubId");

    -- ═══════════════════════════════════════════════════════════════════════
    -- El CANAL de un contacto: una ficha, varias líneas por las que se la
    -- alcanza.
    -- ═══════════════════════════════════════════════════════════════════════
    --
    -- ES LA PIEZA QUE EVITA DUPLICAR LA PERSONA. 'WhatsAppContact' tiene
    -- '@@unique([phone, clubId])', así que la misma persona escribiendo a dos
    -- líneas de sitios distintos serían DOS fichas —justo lo que el pedido
    -- descarta—. Con esta tabla la ficha es una y lo que se guarda por línea es
    -- el canal: cuándo escribió por ahí la primera vez y cuándo la última.
    --
    -- No reemplaza a 'WhatsAppContact.phone': aquél sigue siendo el teléfono
    -- principal de la ficha y lo consumen media docena de pantallas. Esto se
    -- SUMA (regla aditiva).
    CREATE TABLE IF NOT EXISTS "ContactChannel" (
      id TEXT PRIMARY KEY,
      "contactId" TEXT NOT NULL,
      "clubId" TEXT NOT NULL,
      -- 'whatsapp' hoy. El campo existe para que el correo y la pasarela QR
      -- entren sin otra tabla.
      channel TEXT NOT NULL DEFAULT 'whatsapp',
      -- El teléfono en E.164, tal como lo normaliza el webhook.
      address TEXT NOT NULL,
      -- Por qué línea. NOT NULL con DEFAULT '' y no nullable: en Postgres NULL
      -- nunca es igual a NULL, así que con la columna nullable dos filas del
      -- mismo canal sin conexión no chocarían JAMÁS y la tabla se llenaría de
      -- duplicados. Es la misma trampa que documenta el índice de uso de los
      -- aportes de contenido.
      "connectionId" TEXT NOT NULL DEFAULT '',
      "firstInboundAt" TIMESTAMP(3),
      "lastInboundAt" TIMESTAMP(3),
      "lastOutboundAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Un canal por dirección y por línea. Las tres columnas son NOT NULL, así
    -- que el índice NO es parcial y su ON CONFLICT va a secas.
    CREATE UNIQUE INDEX IF NOT EXISTS "ContactChannel_addr_key"
      ON "ContactChannel"(channel, address, "connectionId");
    CREATE INDEX IF NOT EXISTS "ContactChannel_contact_idx"
      ON "ContactChannel"("contactId");
    CREATE INDEX IF NOT EXISTS "ContactChannel_conn_idx"
      ON "ContactChannel"("connectionId", "lastInboundAt");

    -- ═══════════════════════════════════════════════════════════════════════
    -- Trazabilidad: por qué línea entró o salió cada mensaje.
    -- ═══════════════════════════════════════════════════════════════════════
    --
    -- NULLABLE a propósito. Lo anterior a esta versión no tiene línea conocida,
    -- y rellenarlo con la conexión por defecto sería AFIRMAR algo que no se
    -- sabe: un cero es una afirmación, un hueco es la verdad. La pantalla lo
    -- dice como «anterior a multi-cuenta» en vez de atribuirlo.
    ALTER TABLE "WhatsAppMessageLog" ADD COLUMN IF NOT EXISTS "connectionId" TEXT;
    CREATE INDEX IF NOT EXISTS "WhatsAppMessageLog_conn_idx"
      ON "WhatsAppMessageLog"("connectionId", "createdAt");

    -- ═══════════════════════════════════════════════════════════════════════
    -- ⚠️ EL CAMBIO QUE DE VERDAD AÍSLA LOS HILOS.
    -- ═══════════════════════════════════════════════════════════════════════
    --
    -- El índice de v4.696 era (clubId, contactId) WHERE "closedAt" IS NULL: UN
    -- hilo abierto por contacto y por SITIO. Con dos líneas del mismo sitio,
    -- quien escriba a las dos cae en el MISMO hilo, con el agente de una
    -- leyendo el contexto de la otra.
    --
    -- ⚠️ NOT NULL DEFAULT '' Y NO NULLABLE, y es lo que hace que esta migración
    -- sea de un solo paso y segura: con la columna nullable, las filas
    -- heredadas quedarían con NULL, y como en Postgres NULL nunca es igual a
    -- NULL el índice nuevo NO las restringiría — dos mensajes del mismo
    -- contacto abrirían dos hilos justo en las conversaciones que ya existen.
    -- Con la cadena vacía, las heredadas siguen compartiendo un único hilo
    -- entre ellas (que es lo correcto: son de la línea que no se sabe cuál es)
    -- y cada línea real tiene el suyo.
    ALTER TABLE "CrmConversation" ADD COLUMN IF NOT EXISTS "connectionId" TEXT NOT NULL DEFAULT '';

    CREATE UNIQUE INDEX IF NOT EXISTS "CrmConversation_open_conn_key"
      ON "CrmConversation"("clubId", "connectionId", "contactId") WHERE "closedAt" IS NULL;
    CREATE INDEX IF NOT EXISTS "CrmConversation_conn_idx"
      ON "CrmConversation"("connectionId", "lastInboundAt");
  `);

  // El índice viejo se retira DESPUÉS y en su propia sentencia, no dentro del
  // bloque de arriba.
  //
  // POR QUÉ DESPUÉS: mientras exista, impide abrir el segundo hilo legítimo de
  // un contacto que escribe a dos líneas del mismo sitio. Y por qué no antes:
  // entre soltarlo y crear el nuevo habría una ventana sin ninguna restricción,
  // y dos entregas del mismo webhook abrirían dos hilos.
  //
  // En su PROPIO try porque es lo único de este archivo que puede fallar por un
  // motivo legítimo —una versión de Postgres que no admita el DROP concurrente,
  // un permiso— y quedarse con los dos índices es un estado correcto: el nuevo
  // ya restringe, el viejo sólo sobra. Fallar acá dejaría sin crear nada de lo
  // de arriba si estuviera en el mismo bloque.
  try {
    await db.query(`DROP INDEX IF EXISTS "CrmConversation_open_key"`);
  } catch (err) {
    console.warn(
      '[WA-Conn] No se pudo retirar el índice viejo de conversaciones ' +
      '(CrmConversation_open_key). El nuevo ya está creado, así que el ' +
      'aislamiento por línea funciona; lo que puede pasar es que un contacto ' +
      'que escriba a DOS líneas del mismo sitio no abra el segundo hilo. ' +
      `Motivo: ${err.message}`
    );
  }

  _ready = true;
}

export default { ensureWhatsAppConnectionSchema };
