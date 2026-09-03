// La I/O de las conexiones de WhatsApp. El CRITERIO vive en
// `whatsappConnections.js`, que es puro; acá está lo que habla con la base.
//
// ═══════════════════════════════════════════════════════════════════════════
// LA MIGRACIÓN ES PEREZOSA Y OCURRE AL LEER
// ═══════════════════════════════════════════════════════════════════════════
//
// `resolveForInbound` es el corazón: cuando el webhook trae un
// `phone_number_id` que no tiene conexión, mira `WhatsAppConfig` —la tabla
// single-account de siempre— y crea la conexión equivalente ahí mismo. Así la
// línea que hoy recibe mensajes se migra sola con el primer mensaje que llegue,
// y NO HAY VENTANA en la que no exista en ninguna de las dos tablas.
//
// Un despliegue no escribe en la base (regla durable desde el 2026-07-13), así
// que esto no podía ser un script de migración. Mismo patrón que la migración
// de los grupos de distribución y que `bindLegacyEdition`.
//
// LA VUELTA ATRÁS: mientras `WhatsAppConfig` siga escrita y este respaldo siga
// en pie, revertir es un despliegue —el webhook vuelve a resolver por la tabla
// vieja y la cuenta activa no se enteró—. La tabla vieja no se retira hasta que
// el router lleve semanas sin un solo `unknown_phone_number_id`.
import crypto from 'crypto';
import db from './db.js';
import { encryptToken, decryptToken, isLegacyToken } from './tokenCrypto.js';
import { ensureWhatsAppConnectionSchema } from './ensureWhatsAppConnectionSchema.js';
import {
  DEFAULT_STATUS, DEFAULT_WEBHOOK_PROVIDER, STATUSES,
  resolveConnection, resolveAgent,
} from './whatsappConnections.js';

const COLS = `id,"clubId","siteId","siteType","campaignId","projectId","eventId",
  "displayName","phoneNumber","phoneNumberId","wabaId","appId","accessTokenEnc",
  "verifyToken","webhookProvider",status,"isDefault",notes,
  "lastVerifiedAt","lastInboundAt","lastOutboundAt","lastErrorAt","lastError",
  origin,"createdAt","updatedAt"`;

// ── El token ───────────────────────────────────────────────────────────────

/**
 * Cifra un token para guardarlo.
 *
 * ⚠️ `encryptToken` LANZA si falta `TOKEN_ENCRYPTION_KEY`, y eso no puede
 * tumbar el guardado de una línea de WhatsApp: sería cambiar un problema de
 * seguridad por uno de servicio, y la regla de la fase P0 es no romper lo que
 * hay. Sin la llave se guarda en claro —exactamente como lo hacía
 * `WhatsAppConfig` hasta hoy, así que no se empeora nada— y SE DICE, para que
 * la pantalla pueda pedir que se configure la variable.
 */
export function sealToken(plaintext) {
  if (!plaintext) return { value: null, encrypted: false, warning: null };
  try {
    return { value: encryptToken(plaintext), encrypted: true, warning: null };
  } catch (err) {
    return {
      value: plaintext,
      encrypted: false,
      warning:
        'El token se guardó SIN CIFRAR porque falta la variable de entorno ' +
        'TOKEN_ENCRYPTION_KEY. Funciona igual, pero un respaldo de la base se ' +
        'lleva las credenciales de todas las líneas. Generar la llave con ' +
        '`node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"` ' +
        'y volver a guardar la conexión para que se cifre.',
    };
  }
}

/**
 * Abre un token guardado. Devuelve `{ token, reason }`.
 *
 * `decryptToken` ya tolera el texto plano heredado (lo reconoce por no llevar
 * el prefijo `v1:`), así que la migración del cifrado es de LECTURA: un valor
 * viejo se usa tal cual y se reescribe cifrado en la siguiente escritura. Nada
 * que convertir en un despliegue.
 *
 * Lo que sí puede fallar es un `v1:` con la llave equivocada o alterado —el
 * GCM lo detecta—, y ahí no se devuelve nada: usar un token a medias contra
 * Meta gastaría una llamada para recibir un error que no explica la causa.
 */
export function openToken(stored) {
  if (!stored) return { token: null, reason: 'sin_token' };
  try {
    return { token: decryptToken(stored), reason: null, legacy: isLegacyToken(stored) };
  } catch (err) {
    return {
      token: null,
      reason: 'token_ilegible',
      detail:
        'El token guardado no se pudo descifrar. Suele significar que ' +
        'TOKEN_ENCRYPTION_KEY cambió después de guardarlo. Hay que volver a ' +
        `cargar el token en esta conexión. (${err.message})`,
    };
  }
}

// ── Lectura ────────────────────────────────────────────────────────────────

export async function listConnections(clubId, { includeAllSites = false } = {}) {
  await ensureWhatsAppConnectionSchema();
  const r = includeAllSites
    ? await db.query(`SELECT ${COLS} FROM "WhatsAppConnection" ORDER BY "isDefault" DESC, "displayName" ASC`)
    : await db.query(
        `SELECT ${COLS} FROM "WhatsAppConnection" WHERE "clubId"=$1
         ORDER BY "isDefault" DESC, "displayName" ASC`,
        [clubId]
      );
  return r.rows;
}

/**
 * Una conexión, ACOTADA por sitio en el `WHERE`.
 *
 * El aislamiento va en la consulta y no en una comprobación posterior: para
 * quien pregunta por una conexión ajena, esa conexión NO EXISTE. Confirmar que
 * existe con un 403 ya es filtrar que existe, que es la mitad de lo que hace
 * falta para ir a buscarla. `clubId` null (operador de la plataforma) no acota.
 */
export async function getConnection(id, { clubId = null } = {}) {
  await ensureWhatsAppConnectionSchema();
  const params = clubId ? [id, clubId] : [id];
  const where = clubId ? `id=$1 AND "clubId"=$2` : `id=$1`;
  const r = await db.query(`SELECT ${COLS} FROM "WhatsAppConnection" WHERE ${where} LIMIT 1`, params);
  return r.rows[0] || null;
}

/** La conexión principal de un sitio. Es la que usan los caminos heredados. */
export async function getDefaultConnection(clubId) {
  await ensureWhatsAppConnectionSchema();
  const r = await db.query(
    `SELECT ${COLS} FROM "WhatsAppConnection" WHERE "clubId"=$1 AND "isDefault" LIMIT 1`,
    [clubId]
  );
  if (r.rows[0]) return r.rows[0];
  // Sin principal marcada: la que pueda enviar, la verificada más recientemente.
  // Determinista, terminando en el id — dos llamadas seguidas tienen que dar la
  // misma línea o el mismo mensaje saldría por números distintos.
  const any = await db.query(
    `SELECT ${COLS} FROM "WhatsAppConnection" WHERE "clubId"=$1
     ORDER BY (status='active') DESC, "lastVerifiedAt" DESC NULLS LAST, id ASC LIMIT 1`,
    [clubId]
  );
  return any.rows[0] || null;
}

// ── Resolución del entrante, con el respaldo perezoso ──────────────────────

/**
 * De un evento de Meta a una conexión.
 *
 * Devuelve `{ connection, resolvedBy, reason, migrated }`. `resolvedBy` viaja a
 * la bitácora del webhook: distinguir `phone_number_id` de `waba_id` es lo que
 * dice que hay un identificador guardado que se quedó viejo.
 */
export async function resolveForInbound({ phoneNumberId, wabaId }) {
  await ensureWhatsAppConnectionSchema();

  const r = await db.query(
    `SELECT ${COLS} FROM "WhatsAppConnection"
     WHERE ($1::text IS NOT NULL AND "phoneNumberId"=$1)
        OR ($2::text IS NOT NULL AND "wabaId"=$2)`,
    [phoneNumberId || null, wabaId || null]
  );

  let out = resolveConnection({ phoneNumberId, wabaId }, r.rows);
  if (out.connection) return { ...out, migrated: false };

  // ── El respaldo: la tabla single-account de siempre ──────────────────────
  //
  // Es LA migración. No se corre en un despliegue ni con un script: la primera
  // vez que llegue un mensaje de la línea que ya estaba configurada, se crea su
  // conexión y se atiende el mensaje. Si esto no encontrara nada, es que de
  // verdad no hay ninguna configuración para ese número.
  const migrated = await migrateFromLegacyConfig({ phoneNumberId, wabaId });
  if (migrated) {
    return {
      connection: migrated.row,
      resolvedBy: migrated.resolvedBy,
      reason: null,
      ambiguous: 0,
      migrated: true,
    };
  }

  return { ...out, migrated: false };
}

/**
 * Crea la conexión equivalente a una fila de `WhatsAppConfig`.
 *
 * Idempotente por el índice único de `phoneNumberId`: dos entregas
 * concurrentes del mismo webhook —Meta reintenta— no crean dos filas. El
 * `ON CONFLICT` va **a secas** porque ese índice NO es parcial.
 */
export async function migrateFromLegacyConfig({ phoneNumberId = null, wabaId = null } = {}) {
  let legacy = null;
  let resolvedBy = null;

  if (phoneNumberId) {
    const r = await db.query(
      `SELECT * FROM "WhatsAppConfig" WHERE "phoneNumberId"=$1
       ORDER BY "lastVerifiedAt" DESC NULLS LAST LIMIT 1`,
      [phoneNumberId]
    );
    if (r.rows[0]) { legacy = r.rows[0]; resolvedBy = 'phone_number_id'; }
  }
  if (!legacy && wabaId) {
    const r = await db.query(
      `SELECT * FROM "WhatsAppConfig" WHERE "wabaId"=$1
       ORDER BY "lastVerifiedAt" DESC NULLS LAST LIMIT 1`,
      [wabaId]
    );
    if (r.rows[0]) { legacy = r.rows[0]; resolvedBy = 'waba_id'; }
  }
  if (!legacy) return null;

  const row = await adoptLegacyConfig(legacy);
  return row ? { row, resolvedBy } : null;
}

/**
 * Adopta una fila de `WhatsAppConfig` como conexión. Reutilizable desde el
 * panel: al abrir la lista por primera vez, la cuenta activa ya aparece.
 */
export async function adoptLegacyConfig(legacy) {
  if (!legacy?.phoneNumberId) return null;
  await ensureWhatsAppConnectionSchema();

  // El nombre sale del sitio. Sin él, la lista mostraría una línea sin nombre
  // en el selector «Enviar desde: …», que es lo único que ese control dice.
  let name = 'WhatsApp';
  try {
    const c = await db.query(`SELECT name FROM "Club" WHERE id=$1 LIMIT 1`, [legacy.clubId]);
    if (c.rows[0]?.name) name = `WhatsApp ${c.rows[0].name}`;
  } catch { /* el nombre es un adorno: no puede impedir la migración */ }

  // El token se conserva TAL CUAL —ya viene de `WhatsAppConfig`, en claro— y se
  // cifra si hay llave. No se descifra ni se re-cifra a ciegas: `openToken`
  // tolera las dos formas al leer.
  const sealed = legacy.accessToken && !isLegacyToken(legacy.accessToken)
    ? { value: legacy.accessToken }              // ya venía cifrado
    : sealToken(legacy.accessToken || '');

  const id = crypto.randomUUID();
  const status = legacy.enabled === false ? 'paused' : 'active';

  const inserted = await insertConnection({
    id,
    clubId: legacy.clubId,
    siteId: legacy.clubId,
    siteType: null,
    displayName: name,
    phoneNumberId: legacy.phoneNumberId,
    wabaId: legacy.wabaId,
    appId: legacy.appId || null,
    accessTokenEnc: sealed.value || null,
    verifyToken: legacy.verifyToken || null,
    webhookProvider: DEFAULT_WEBHOOK_PROVIDER,
    status,
    lastVerifiedAt: legacy.lastVerifiedAt || null,
    origin: 'legacy_config',
  });

  if (inserted) {
    console.log(
      `[WA-Conn] Conexión creada desde WhatsAppConfig para el sitio ${legacy.clubId} ` +
      `(número ${legacy.phoneNumberId}). La línea que ya estaba configurada se migró sola.`
    );
    return inserted;
  }

  // Perdió la carrera contra otra entrega del webhook: la fila ya existe.
  const again = await db.query(
    `SELECT ${COLS} FROM "WhatsAppConnection" WHERE "phoneNumberId"=$1 LIMIT 1`,
    [legacy.phoneNumberId]
  );
  return again.rows[0] || null;
}

// ── Escritura ──────────────────────────────────────────────────────────────

/**
 * Inserta una conexión. Devuelve la fila, o `null` si el número ya estaba.
 *
 * `isDefault` se resuelve acá y no en el cuerpo de la petición: la primera
 * conexión de un sitio es la principal —si no, quedaría un sitio con líneas y
 * sin ninguna por defecto, y los caminos heredados no sabrían por dónde
 * enviar—. El índice parcial `(clubId) WHERE "isDefault"` hace imposible que
 * haya dos; si dos altas concurrentes llegan a la vez, la que pierda se guarda
 * como no principal en vez de fallar (perder la carrera no puede costar el
 * alta).
 */
export async function insertConnection(data) {
  await ensureWhatsAppConnectionSchema();

  const wantsDefault = await (async () => {
    const r = await db.query(
      `SELECT 1 FROM "WhatsAppConnection" WHERE "clubId"=$1 AND "isDefault" LIMIT 1`,
      [data.clubId]
    );
    return r.rows.length === 0;
  })();

  const values = (isDefault) => [
    data.id, data.clubId, data.siteId || null, data.siteType || null,
    data.campaignId || null, data.projectId || null, data.eventId || null,
    data.displayName, data.phoneNumber || null, data.phoneNumberId, data.wabaId,
    data.appId || null, data.accessTokenEnc || null, data.verifyToken || null,
    data.webhookProvider || DEFAULT_WEBHOOK_PROVIDER,
    STATUSES[data.status] ? data.status : DEFAULT_STATUS,
    isDefault, data.notes || null, data.lastVerifiedAt || null,
    data.origin || 'manual',
  ];

  const sql = `
    INSERT INTO "WhatsAppConnection"
      (id,"clubId","siteId","siteType","campaignId","projectId","eventId",
       "displayName","phoneNumber","phoneNumberId","wabaId","appId",
       "accessTokenEnc","verifyToken","webhookProvider",status,"isDefault",
       notes,"lastVerifiedAt",origin,"createdAt","updatedAt")
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW(),NOW())
    ON CONFLICT ("phoneNumberId") DO NOTHING
    RETURNING ${COLS}`;

  try {
    const r = await db.query(sql, values(wantsDefault));
    return r.rows[0] || null;
  } catch (err) {
    // Choque contra el índice parcial de la principal: reintentar sin la marca.
    if (wantsDefault && /WhatsAppConnection_default_key/.test(err.message || '')) {
      const r = await db.query(sql, values(false));
      return r.rows[0] || null;
    }
    throw err;
  }
}

/** Actualiza sólo los campos presentes. `undefined` es «no lo toques». */
export async function updateConnection(id, patch, { clubId = null } = {}) {
  await ensureWhatsAppConnectionSchema();
  const sets = [];
  const params = [];
  let i = 1;

  const map = {
    displayName: 'displayName', phoneNumber: 'phoneNumber',
    phoneNumberId: 'phoneNumberId', wabaId: 'wabaId', appId: 'appId',
    accessTokenEnc: 'accessTokenEnc', verifyToken: 'verifyToken',
    webhookProvider: 'webhookProvider', siteId: 'siteId', siteType: 'siteType',
    campaignId: 'campaignId', projectId: 'projectId', eventId: 'eventId',
    notes: 'notes', status: 'status', lastVerifiedAt: 'lastVerifiedAt',
  };

  for (const [key, col] of Object.entries(map)) {
    if (patch[key] === undefined) continue;
    sets.push(`"${col}"=$${i++}`);
    params.push(patch[key]);
  }
  if (!sets.length) return getConnection(id, { clubId });

  sets.push(`"updatedAt"=NOW()`);
  params.push(id);
  let where = `id=$${i++}`;
  if (clubId) { where += ` AND "clubId"=$${i++}`; params.push(clubId); }

  const r = await db.query(
    `UPDATE "WhatsAppConnection" SET ${sets.join(',')} WHERE ${where} RETURNING ${COLS}`,
    params
  );
  return r.rows[0] || null;
}

/**
 * Marca una conexión como principal. En dos pasos y no con un upsert.
 *
 * El índice `(clubId) WHERE "isDefault"` es PARCIAL, así que un `ON CONFLICT`
 * contra él tendría que repetir el predicado o la sentencia falla entera (la
 * trampa de v4.648). Bajar la de todas y subir la elegida es más simple y no
 * depende de eso.
 */
export async function setDefaultConnection(id, clubId) {
  await ensureWhatsAppConnectionSchema();
  const target = await getConnection(id, { clubId });
  if (!target) return null;
  await db.query(
    `UPDATE "WhatsAppConnection" SET "isDefault"=false,"updatedAt"=NOW()
     WHERE "clubId"=$1 AND "isDefault"`,
    [target.clubId]
  );
  const r = await db.query(
    `UPDATE "WhatsAppConnection" SET "isDefault"=true,"updatedAt"=NOW()
     WHERE id=$1 RETURNING ${COLS}`,
    [id]
  );
  return r.rows[0] || null;
}

export async function setConnectionStatus(id, status, { clubId = null } = {}) {
  if (!STATUSES[status]) return null;
  return updateConnection(id, { status }, { clubId });
}

/**
 * Desconecta una conexión. **NO borra sus mensajes ni sus conversaciones**: son
 * el registro de lo que ocurrió, y borrarlos dejaría sin explicación los
 * mensajes que esa línea envió. La fila se retira y el historial se queda
 * apuntando a un id que ya no está — la pantalla lo dice como «línea
 * desconectada» en vez de atribuirlo a otra.
 */
export async function deleteConnection(id, { clubId = null } = {}) {
  await ensureWhatsAppConnectionSchema();
  const target = await getConnection(id, { clubId });
  if (!target) return { ok: false, reason: 'no_existe' };

  await db.query(`DELETE FROM "WhatsAppConnectionAgent" WHERE "connectionId"=$1`, [id]);
  await db.query(`DELETE FROM "WhatsAppConnection" WHERE id=$1`, [id]);

  // Si era la principal, el sitio se queda sin ninguna: se asciende otra, o los
  // caminos heredados no sabrían por dónde enviar.
  if (target.isDefault) {
    const next = await db.query(
      `SELECT id FROM "WhatsAppConnection" WHERE "clubId"=$1
       ORDER BY (status='active') DESC, "lastVerifiedAt" DESC NULLS LAST, id ASC LIMIT 1`,
      [target.clubId]
    );
    if (next.rows[0]) await setDefaultConnection(next.rows[0].id, target.clubId);
  }
  return { ok: true, promoted: target.isDefault };
}

// ── Señales. Las escribe quien sabe, nunca el cuerpo de una petición ───────

export async function markInbound(connectionId, at = new Date()) {
  if (!connectionId) return;
  await db.query(
    `UPDATE "WhatsAppConnection" SET "lastInboundAt"=$2,"updatedAt"=NOW() WHERE id=$1`,
    [connectionId, at]
  ).catch(() => {});
}

export async function markOutbound(connectionId, at = new Date()) {
  if (!connectionId) return;
  await db.query(
    `UPDATE "WhatsAppConnection" SET "lastOutboundAt"=$2,"updatedAt"=NOW() WHERE id=$1`,
    [connectionId, at]
  ).catch(() => {});
}

/**
 * Anota un error de Meta y pasa la conexión a `error`.
 *
 * Sólo pasa a `error` desde `active`: una línea que alguien pausó a propósito
 * no puede cambiar de estado porque falló una llamada —sería desobedecer la
 * decisión— y una en `draft` todavía no prometía funcionar.
 */
export async function markError(connectionId, message, { degrade = true } = {}) {
  if (!connectionId) return;
  const txt = typeof message === 'string' ? message.slice(0, 1000) : String(message || '').slice(0, 1000);
  await db.query(
    `UPDATE "WhatsAppConnection"
     SET "lastError"=$2,"lastErrorAt"=NOW(),
         status = CASE WHEN $3 AND status='active' THEN 'error' ELSE status END,
         "updatedAt"=NOW()
     WHERE id=$1`,
    [connectionId, txt, !!degrade]
  ).catch(() => {});
}

/** Una verificación exitosa limpia el error y recupera el estado. */
export async function markVerified(connectionId, { phoneNumber = null } = {}) {
  if (!connectionId) return;
  await db.query(
    `UPDATE "WhatsAppConnection"
     SET "lastVerifiedAt"=NOW(),"lastError"=NULL,"lastErrorAt"=NULL,
         "phoneNumber"=COALESCE($2,"phoneNumber"),
         status = CASE WHEN status IN ('draft','error') THEN 'active' ELSE status END,
         "updatedAt"=NOW()
     WHERE id=$1`,
    [connectionId, phoneNumber]
  ).catch(() => {});
}

// ── El agente de la conexión ───────────────────────────────────────────────

export async function getConnectionAgent(connectionId) {
  if (!connectionId) return null;
  await ensureWhatsAppConnectionSchema();
  const r = await db.query(
    `SELECT * FROM "WhatsAppConnectionAgent" WHERE "connectionId"=$1 LIMIT 1`,
    [connectionId]
  );
  return r.rows[0] || null;
}

export async function upsertConnectionAgent(connectionId, clubId, patch = {}) {
  await ensureWhatsAppConnectionSchema();
  const existing = await getConnectionAgent(connectionId);
  const v = (k, d) => (patch[k] !== undefined ? patch[k] : existing ? existing[k] : d);

  if (existing) {
    const r = await db.query(
      `UPDATE "WhatsAppConnectionAgent" SET
         enabled=$2,name=$3,"systemPrompt"=$4,"modelSlug"=$5,"useKnowledge"=$6,
         "brainId"=$7,temperature=$8,"maxTokens"=$9,"historyLimit"=$10,
         "humanPauseMinutes"=$11,"fallbackMessage"=$12,"quietHoursStart"=$13,
         "quietHoursEnd"=$14,timezone=$15,"escalateTeam"=$16,"updatedAt"=NOW()
       WHERE "connectionId"=$1 RETURNING *`,
      [
        connectionId, !!v('enabled', false), v('name', 'Asistente'),
        v('systemPrompt', ''), v('modelSlug', 'gemini-2.5-flash'),
        v('useKnowledge', true) !== false, v('brainId', null),
        Number(v('temperature', 0.6)), Number(v('maxTokens', 600)),
        Number(v('historyLimit', 12)), Number(v('humanPauseMinutes', 120)),
        v('fallbackMessage', null), v('quietHoursStart', null),
        v('quietHoursEnd', null), v('timezone', null), v('escalateTeam', null),
      ]
    );
    return r.rows[0];
  }

  // `connectionId` es NOT NULL y su índice único NO es parcial, así que el
  // ON CONFLICT va a secas.
  const r = await db.query(
    `INSERT INTO "WhatsAppConnectionAgent"
       (id,"connectionId","clubId",enabled,name,"systemPrompt","modelSlug",
        "useKnowledge","brainId",temperature,"maxTokens","historyLimit",
        "humanPauseMinutes","fallbackMessage","quietHoursStart","quietHoursEnd",
        timezone,"escalateTeam","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW(),NOW())
     ON CONFLICT ("connectionId") DO UPDATE SET
       enabled=EXCLUDED.enabled,name=EXCLUDED.name,
       "systemPrompt"=EXCLUDED."systemPrompt","modelSlug"=EXCLUDED."modelSlug",
       "useKnowledge"=EXCLUDED."useKnowledge","brainId"=EXCLUDED."brainId",
       temperature=EXCLUDED.temperature,"maxTokens"=EXCLUDED."maxTokens",
       "historyLimit"=EXCLUDED."historyLimit",
       "humanPauseMinutes"=EXCLUDED."humanPauseMinutes",
       "fallbackMessage"=EXCLUDED."fallbackMessage","updatedAt"=NOW()
     RETURNING *`,
    [
      crypto.randomUUID(), connectionId, clubId, !!patch.enabled,
      patch.name || 'Asistente', patch.systemPrompt || '',
      patch.modelSlug || 'gemini-2.5-flash', patch.useKnowledge !== false,
      patch.brainId || null, Number(patch.temperature ?? 0.6),
      Number(patch.maxTokens ?? 600), Number(patch.historyLimit ?? 12),
      Number(patch.humanPauseMinutes ?? 120), patch.fallbackMessage || null,
      patch.quietHoursStart ?? null, patch.quietHoursEnd ?? null,
      patch.timezone || null, patch.escalateTeam || null,
    ]
  );
  return r.rows[0];
}

export async function deleteConnectionAgent(connectionId) {
  await ensureWhatsAppConnectionSchema();
  await db.query(`DELETE FROM "WhatsAppConnectionAgent" WHERE "connectionId"=$1`, [connectionId]);
}

/**
 * Qué agente atiende esta línea: el propio, el del sitio, o ninguno.
 *
 * El del sitio es `WhatsAppAgentConfig`, la tabla de siempre. Esa herencia es
 * lo que hace que desplegar multi-WABA no cambie el comportamiento de la cuenta
 * activa: sin agente por conexión, se comporta exactamente como hoy.
 */
export async function resolveAgentForConnection(connection) {
  if (!connection) return { agent: null, source: 'none', inherited: false };
  const [connectionAgent, siteAgentR] = await Promise.all([
    getConnectionAgent(connection.id),
    db.query(`SELECT * FROM "WhatsAppAgentConfig" WHERE "clubId"=$1 LIMIT 1`, [connection.clubId])
      .catch(() => ({ rows: [] })),
  ]);
  return resolveAgent({ connectionAgent, siteAgent: siteAgentR.rows[0] || null });
}

// ── El canal del contacto ──────────────────────────────────────────────────

/**
 * Registra que esta persona escribió por esta línea, sin duplicar su ficha.
 *
 * Es la pieza que responde al pedido de «no duplicar toda la ficha de
 * persona»: `WhatsAppContact` tiene `@@unique([phone, clubId])`, así que la
 * ficha es una por sitio y lo que se guarda por línea es el CANAL.
 *
 * `ON CONFLICT` a secas: las tres columnas del índice son NOT NULL.
 */
export async function touchContactChannel({
  contactId, clubId, connectionId, address, channel = 'whatsapp',
  inboundAt = null, outboundAt = null,
}) {
  if (!contactId || !address) return null;
  await ensureWhatsAppConnectionSchema();
  const r = await db.query(
    `INSERT INTO "ContactChannel"
       (id,"contactId","clubId",channel,address,"connectionId",
        "firstInboundAt","lastInboundAt","lastOutboundAt","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,NOW(),NOW())
     ON CONFLICT (channel,address,"connectionId") DO UPDATE SET
       "lastInboundAt"=COALESCE(EXCLUDED."lastInboundAt","ContactChannel"."lastInboundAt"),
       "lastOutboundAt"=COALESCE(EXCLUDED."lastOutboundAt","ContactChannel"."lastOutboundAt"),
       -- El PRIMER entrante no se pisa: es la fecha en que esa persona escribió
       -- por esta línea por primera vez, y sobrescribirla la perdería.
       "firstInboundAt"=COALESCE("ContactChannel"."firstInboundAt",EXCLUDED."firstInboundAt"),
       "updatedAt"=NOW()
     RETURNING *`,
    [
      crypto.randomUUID(), contactId, clubId, channel, address,
      connectionId || '', inboundAt, outboundAt,
    ]
  ).catch((err) => {
    // El canal es trazabilidad: no puede costar el mensaje que acaba de llegar.
    console.warn('[WA-Conn] No se pudo registrar el canal del contacto:', err.message);
    return { rows: [] };
  });
  return r.rows[0] || null;
}

/** Las líneas por las que se ha alcanzado a un contacto. Para su ficha. */
export async function channelsOfContact(contactId) {
  if (!contactId) return [];
  await ensureWhatsAppConnectionSchema();
  const r = await db.query(
    `SELECT ch.*, c."displayName", c."phoneNumber" AS "connectionPhone"
     FROM "ContactChannel" ch
     LEFT JOIN "WhatsAppConnection" c ON c.id = ch."connectionId"
     WHERE ch."contactId"=$1
     ORDER BY ch."lastInboundAt" DESC NULLS LAST`,
    [contactId]
  ).catch(() => ({ rows: [] }));
  return r.rows;
}

export default {
  sealToken, openToken,
  listConnections, getConnection, getDefaultConnection,
  resolveForInbound, migrateFromLegacyConfig, adoptLegacyConfig,
  insertConnection, updateConnection, setDefaultConnection,
  setConnectionStatus, deleteConnection,
  markInbound, markOutbound, markError, markVerified,
  getConnectionAgent, upsertConnectionAgent, deleteConnectionAgent,
  resolveAgentForConnection,
  touchContactChannel, channelsOfContact,
};
