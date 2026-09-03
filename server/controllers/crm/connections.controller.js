// La API de las cuentas de WhatsApp conectadas (v4.992, multi-WABA).
//
// El CRITERIO está en `whatsappConnections.js` (puro) y la I/O en
// `whatsappConnectionStore.js`. Acá está la orquestación: quién puede ver qué,
// qué se le pregunta a Meta y qué se le contesta al panel.
//
// ═══════════════════════════════════════════════════════════════════════════
// DOS REGLAS QUE NO SE NEGOCIAN
// ═══════════════════════════════════════════════════════════════════════════
//
// 1. EL TOKEN NUNCA VUELVE AL NAVEGADOR. Ni recortado. Todo lo que sale pasa
//    por `publicConnection`, que no tiene el campo — no es que lo omita, es que
//    no existe en su salida. Lo que la pantalla necesita saber es `hasToken`.
//
// 2. EL SITIO SALE DEL TOKEN, NUNCA DEL CUERPO. Si `clubId` viniera en la
//    petición, acotar las conexiones a un sitio no serviría de nada: bastaría
//    con mandar otro. Sólo el operador de la plataforma puede pedir otro sitio,
//    y por query, que es lo que su rol ya le permite en el resto del módulo.
import crypto from 'crypto';
import db from '../../lib/db.js';
import { resolveClubId } from '../crmController.js';
import {
  publicConnection, shapeConnection, validateConnection, diagnoseConnection,
  describeFailure, maskToken, STATUSES, STATUS_IDS,
} from '../../lib/whatsappConnections.js';
import {
  listConnections, getConnection, insertConnection, updateConnection,
  setDefaultConnection, setConnectionStatus, deleteConnection,
  getConnectionAgent, upsertConnectionAgent, resolveAgentForConnection,
  sealToken, openToken, markVerified, markError, adoptLegacyConfig,
} from '../../lib/whatsappConnectionStore.js';

const WA_API = `https://graph.facebook.com/${process.env.WA_API_VERSION || 'v21.0'}`;
const OPERATOR_ROLES = ['administrator', 'superadmin'];
const isOperator = (req) => OPERATOR_ROLES.includes(req.user?.role);

/**
 * El sitio en cuyo nombre se opera, y si hay que acotar por él.
 *
 * `scope` null significa «sin acotar» y sólo lo recibe el operador: es lo que
 * le permite ver las líneas de todo el ecosistema. Para cualquier otro rol,
 * `scope` es su sitio y entra en el `WHERE` de todas las consultas — el
 * aislamiento va en la consulta, no en una comprobación posterior.
 */
async function alcance(req) {
  const clubId = await resolveClubId(req);
  const todos = isOperator(req) && String(req.query?.todos || '') === '1';
  return { clubId, scope: todos ? null : clubId };
}

const fallo = (res, err, status = 400) => {
  console.error('[WA-Conn]', err?.message || err);
  res.status(err?.status || status).json({ error: err?.message || 'Error inesperado' });
};

// ── Una llamada a Meta, con el token enmascarado en el registro ────────────

async function metaGet(path, token) {
  const started = Date.now();
  try {
    const r = await fetch(`${WA_API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      // Ninguna espera sin tope: esto corre en una petición del panel y una
      // fuente lenta dejaría el botón girando sin fin (la regla de v4.875).
      signal: AbortSignal.timeout(12000),
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok && !data?.error, status: r.status, data, error: data?.error || null, ms: Date.now() - started };
  } catch (err) {
    return { ok: false, status: null, data: null, error: { message: err.message }, ms: Date.now() - started };
  }
}

async function metaPost(path, token, body = {}) {
  try {
    const r = await fetch(`${WA_API}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok && !data?.error, data, error: data?.error || null };
  } catch (err) {
    return { ok: false, data: null, error: { message: err.message } };
  }
}

// ── Listar ─────────────────────────────────────────────────────────────────

/**
 * Las cuentas conectadas del sitio, con su agente y su última señal.
 *
 * Adopta la configuración heredada si todavía no tiene conexión: así la línea
 * que ya está activa aparece en la lista la PRIMERA vez que alguien abre esta
 * pantalla, sin esperar a que llegue un mensaje. Es el mismo respaldo perezoso
 * del router, por la otra puerta.
 */
export const list = async (req, res) => {
  try {
    const { clubId, scope } = await alcance(req);
    if (!clubId) return res.status(400).json({ error: 'No se pudo determinar el sitio.' });

    let rows = await listConnections(scope, { includeAllSites: scope === null });

    if (!rows.length) {
      const legacy = await db.query(
        `SELECT * FROM "WhatsAppConfig" WHERE "clubId"=$1 LIMIT 1`, [clubId]
      ).catch(() => ({ rows: [] }));
      if (legacy.rows[0]) {
        await adoptLegacyConfig(legacy.rows[0]).catch((e) =>
          console.warn('[WA-Conn] No se pudo adoptar la configuración heredada:', e.message));
        rows = await listConnections(scope, { includeAllSites: scope === null });
      }
    }

    const conAgente = await Promise.all(rows.map(async (row) => {
      const resolved = await resolveAgentForConnection(row).catch(() => ({ agent: null, source: 'none' }));
      return publicConnection(row, {
        agent: resolved.agent
          ? {
            name: resolved.agent.name, enabled: !!resolved.agent.enabled,
            modelSlug: resolved.agent.modelSlug, source: resolved.source,
            inherited: !!resolved.inherited,
          }
          : { name: null, enabled: false, source: resolved.source, inherited: false },
      });
    }));

    res.json({
      connections: conAgente,
      scope: scope === null ? 'plataforma' : 'sitio',
      clubId,
      statuses: STATUS_IDS.map((k) => ({ key: k, ...STATUSES[k] })),
      // El webhook es UNO para todas las líneas de la misma aplicación de Meta.
      // Se dice acá para que nadie configure uno por cuenta: es la pregunta que
      // aparece siempre al agregar la segunda.
      webhook: {
        url: '/api/crm/webhook',
        shared: true,
        note:
          'Una aplicación de Meta tiene UNA sola URL de callback, así que todas ' +
          'las cuentas que cuelguen de la misma aplicación entran por acá. Lo que ' +
          'sí es por cuenta es la suscripción, y se hace desde el diagnóstico de ' +
          'cada conexión.',
      },
    });
  } catch (err) { fallo(res, err); }
};

// ── Crear y editar ─────────────────────────────────────────────────────────

export const create = async (req, res) => {
  try {
    const { clubId } = await alcance(req);
    if (!clubId) return res.status(400).json({ error: 'No se pudo determinar el sitio.' });

    // ⚠️ El sitio sale del token. Un operador puede crear en otro sitio pasando
    // `?todos=1&clubId=…`, que es lo que su rol ya le permite; cualquier otro
    // rol crea en el suyo, mande lo que mande.
    const destino = isOperator(req) && req.query?.clubId ? String(req.query.clubId) : clubId;

    const { data, dropped } = shapeConnection(req.body || {});
    const check = validateConnection(data);
    if (!check.ok) {
      return res.status(400).json({
        error: 'La conexión no se puede guardar todavía.',
        errors: check.errors, warnings: check.warnings, dropped,
      });
    }

    const sealed = sealToken(data.accessToken);
    const row = await insertConnection({
      id: crypto.randomUUID(),
      clubId: destino,
      siteId: data.siteId || destino,
      siteType: data.siteType || null,
      campaignId: data.campaignId, projectId: data.projectId, eventId: data.eventId,
      displayName: data.displayName, phoneNumber: data.phoneNumber,
      phoneNumberId: data.phoneNumberId, wabaId: data.wabaId, appId: data.appId,
      accessTokenEnc: sealed.value, verifyToken: data.verifyToken,
      webhookProvider: data.webhookProvider, notes: data.notes,
      status: 'draft', origin: 'manual',
    });

    if (!row) {
      // El índice único del número. Es una contradicción, no una preferencia:
      // un `phone_number_id` es único en Meta.
      return res.status(409).json({
        error:
          `El número con ID ${data.phoneNumberId} ya está conectado en esta plataforma. ` +
          'Un mismo número no puede pertenecer a dos cuentas: si lo estás moviendo de sitio, ' +
          'editá la conexión que ya existe en vez de crear otra.',
      });
    }

    const warnings = [...check.warnings];
    if (sealed.warning) warnings.push({ field: 'accessToken', message: sealed.warning });
    if (dropped.length) {
      warnings.push({
        field: null,
        message: `Se ignoraron campos que no se pueden escribir desde acá: ${dropped.join(', ')}.`,
      });
    }

    res.status(201).json({ connection: publicConnection(row), warnings });
  } catch (err) { fallo(res, err); }
};

export const update = async (req, res) => {
  try {
    const { scope } = await alcance(req);
    const existing = await getConnection(req.params.id, { clubId: scope });
    // 404 y no 403: confirmar que existe es la mitad de lo que hace falta para
    // ir a buscarla.
    if (!existing) return res.status(404).json({ error: 'Esa conexión no existe.' });

    const { data, dropped } = shapeConnection(req.body || {});
    const check = validateConnection(data, { existing });
    if (!check.ok) {
      return res.status(400).json({
        error: 'Los cambios no se pueden guardar.',
        errors: check.errors, warnings: check.warnings, dropped,
      });
    }

    const patch = { ...data };
    delete patch.accessToken;
    const warnings = [...check.warnings];

    if (data.accessToken) {
      const sealed = sealToken(data.accessToken);
      patch.accessTokenEnc = sealed.value;
      if (sealed.warning) warnings.push({ field: 'accessToken', message: sealed.warning });
    }

    const row = await updateConnection(req.params.id, patch, { clubId: scope });
    if (dropped.length) {
      warnings.push({
        field: null,
        message: `Se ignoraron campos que no se pueden escribir desde acá: ${dropped.join(', ')}.`,
      });
    }
    res.json({ connection: publicConnection(row), warnings });
  } catch (err) {
    if (/WhatsAppConnection_pnid_key/.test(err?.message || '')) {
      return res.status(409).json({
        error: 'Ese ID de número ya pertenece a otra conexión de la plataforma.',
      });
    }
    fallo(res, err);
  }
};

export const remove = async (req, res) => {
  try {
    const { scope } = await alcance(req);
    const target = await getConnection(req.params.id, { clubId: scope });
    if (!target) return res.status(404).json({ error: 'Esa conexión no existe.' });

    const out = await deleteConnection(req.params.id, { clubId: scope });
    res.json({
      ok: out.ok,
      promoted: out.promoted,
      // Se dice con estas palabras: desconectar NO borra el historial, y a nadie
      // se le puede dejar creyendo que se llevó por delante sus conversaciones.
      note:
        'La cuenta se desconectó. Sus mensajes y conversaciones se conservan —son el ' +
        'registro de lo que ocurrió— y quedan marcados como de una línea desconectada. ' +
        (out.promoted
          ? 'Era la línea principal del sitio, así que se ascendió otra.'
          : ''),
    });
  } catch (err) { fallo(res, err); }
};

// ── Principal y estado: rutas propias, para que queden auditadas ───────────

export const makeDefault = async (req, res) => {
  try {
    const { clubId, scope } = await alcance(req);
    const target = await getConnection(req.params.id, { clubId: scope });
    if (!target) return res.status(404).json({ error: 'Esa conexión no existe.' });
    const row = await setDefaultConnection(req.params.id, target.clubId);
    res.json({
      connection: publicConnection(row),
      note:
        'Es la línea principal del sitio: la que usan los caminos que no eligen una ' +
        'a mano —una campaña, un recorrido, un mensaje nuevo desde el chat—. Las ' +
        'respuestas a un mensaje entrante siguen saliendo por la línea que lo recibió.',
    });
  } catch (err) { fallo(res, err); }
};

export const setStatus = async (req, res) => {
  try {
    const { scope } = await alcance(req);
    const status = String(req.body?.status || '');
    if (!STATUSES[status]) {
      return res.status(400).json({
        error: `Estado inválido. Los admitidos son: ${STATUS_IDS.join(', ')}.`,
      });
    }
    const target = await getConnection(req.params.id, { clubId: scope });
    if (!target) return res.status(404).json({ error: 'Esa conexión no existe.' });

    const row = await setConnectionStatus(req.params.id, status, { clubId: scope });
    res.json({
      connection: publicConnection(row),
      // La consecuencia, no sólo el nombre del estado: pausar una línea NO deja
      // de recibir, y quien la pausa tiene que saberlo.
      note: STATUSES[status].help,
    });
  } catch (err) { fallo(res, err); }
};

// ── Verificar: una comprobación REAL contra Meta ───────────────────────────

/**
 * Pregunta a Meta por el número. Es de SÓLO LECTURA: no manda ningún mensaje.
 *
 * Un 200 acá confirma que Meta acepta la credencial y reconoce el número — no
 * confirma que se pueda entregar: fuera de la ventana de 24 horas, Meta acepta
 * un envío y no lo entrega. No se afirma de más.
 */
export const verify = async (req, res) => {
  try {
    const { scope } = await alcance(req);
    const conn = await getConnection(req.params.id, { clubId: scope });
    if (!conn) return res.status(404).json({ error: 'Esa conexión no existe.' });

    const opened = openToken(conn.accessTokenEnc);
    if (!opened.token) {
      return res.status(409).json({
        error: opened.detail || 'Esta conexión no tiene token de acceso guardado.',
        cause: describeFailure({ code: 'token_expirado' }),
      });
    }

    const r = await metaGet(
      `/${conn.phoneNumberId}?fields=verified_name,display_phone_number,quality_rating,messaging_limit_tier`,
      opened.token
    );

    if (!r.ok) {
      const cause = describeFailure({ metaCode: r.error?.code, message: r.error?.message });
      await markError(conn.id, `${cause.title}: ${r.error?.message || 'sin detalle'}`);
      return res.status(502).json({
        error: cause.title,
        cause,
        // El texto de Meta, TEXTUAL: es lo que se busca en su soporte.
        providerMessage: r.error?.message || null,
        providerCode: r.error?.code ?? null,
      });
    }

    await markVerified(conn.id, { phoneNumber: r.data?.display_phone_number || null });
    const fresh = await getConnection(req.params.id, { clubId: scope });

    res.json({
      ok: true,
      account: {
        verifiedName: r.data?.verified_name || null,
        phoneNumber: r.data?.display_phone_number || null,
        qualityRating: r.data?.quality_rating || null,
        messagingTier: r.data?.messaging_limit_tier || null,
      },
      connection: publicConnection(fresh),
      note:
        'Meta acepta la credencial y reconoce el número. Eso no garantiza la entrega: ' +
        'fuera de la ventana de 24 horas un mensaje libre se rechaza y hay que usar ' +
        'una plantilla.',
      ms: r.ms,
    });
  } catch (err) { fallo(res, err); }
};

// ── Diagnóstico por conexión ───────────────────────────────────────────────

/**
 * Recoge los hechos y los juzga con `diagnoseConnection`, que es puro.
 *
 * Lo que no se pudo preguntar queda en `unknown`, y `unknown` NO es un tipo de
 * «bien»: presentarlo como verde manda a buscar el problema donde no está.
 */
export const diagnose = async (req, res) => {
  try {
    const { scope } = await alcance(req);
    const conn = await getConnection(req.params.id, { clubId: scope });
    if (!conn) return res.status(404).json({ error: 'Esa conexión no existe.' });

    const opened = openToken(conn.accessTokenEnc);
    const resolvedAgent = await resolveAgentForConnection(conn).catch(() => ({ agent: null, source: 'none' }));

    const facts = {
      hasToken: !!conn.accessTokenEnc,
      status: conn.status,
      lastInboundAt: conn.lastInboundAt, lastOutboundAt: conn.lastOutboundAt,
      lastError: conn.lastError,
      agentSource: resolvedAgent.source,
      agentName: resolvedAgent.agent?.name || null,
      useKnowledge: resolvedAgent.agent ? resolvedAgent.agent.useKnowledge !== false : null,
      // Con `brainId` nulo el agente usa el cerebro del sitio, que
      // `getOrCreateBrainForClub` crea si hace falta: por eso «disponible».
      knowledgeReady: resolvedAgent.agent ? true : null,
      knowledgeName: resolvedAgent.agent?.brainId ? 'base propia de esta línea' : 'base del sitio',
      tokenValid: null, phoneMatchesWaba: null, subscribed: null,
    };

    if (opened.token) {
      const [numero, suscripcion] = await Promise.all([
        metaGet(`/${conn.phoneNumberId}?fields=verified_name,display_phone_number`, opened.token),
        metaGet(`/${conn.wabaId}/subscribed_apps`, opened.token),
      ]);

      facts.tokenValid = numero.ok || (numero.error?.code !== 190 && numero.status !== 401);
      if (!numero.ok) {
        facts.tokenError = numero.error?.message || null;
        facts.tokenMetaCode = numero.error?.code ?? null;
        // Un 100 sobre el número suele ser justamente el número que no
        // pertenece a esta cuenta.
        if (numero.error?.code === 100) facts.phoneMatchesWaba = false;
      } else {
        facts.tokenValid = true;
        facts.verifiedName = numero.data?.verified_name || null;
        facts.displayPhoneNumber = numero.data?.display_phone_number || null;
        facts.phoneMatchesWaba = true;
      }

      if (suscripcion.ok) {
        facts.subscribed = Array.isArray(suscripcion.data?.data) && suscripcion.data.data.length > 0;
      }
      // Si la consulta de la suscripción falla por permiso, se queda en
      // `unknown` y el diagnóstico lo dice: es distinto de «no está suscrita».
    }

    const out = diagnoseConnection(facts);
    res.json({
      connection: publicConnection(conn, {
        agent: resolvedAgent.agent
          ? { name: resolvedAgent.agent.name, enabled: !!resolvedAgent.agent.enabled, source: resolvedAgent.source }
          : { name: null, enabled: false, source: resolvedAgent.source },
      }),
      ...out,
      tokenNote: opened.reason === 'token_ilegible' ? opened.detail : null,
    });
  } catch (err) { fallo(res, err); }
};

/**
 * Suscribe la cuenta al webhook.
 *
 * Es la parte que Meta exige POR WABA y que se puede automatizar: la URL de
 * callback es de la aplicación y se configura una vez, pero cada cuenta hay que
 * suscribirla. Meta la da de baja por su cuenta cuando el endpoint falla, y
 * cuando pasa todo parece normal salvo que no vuelve ningún estado.
 */
export const subscribe = async (req, res) => {
  try {
    const { scope } = await alcance(req);
    const conn = await getConnection(req.params.id, { clubId: scope });
    if (!conn) return res.status(404).json({ error: 'Esa conexión no existe.' });

    const opened = openToken(conn.accessTokenEnc);
    if (!opened.token) {
      return res.status(409).json({ error: 'Esta conexión no tiene token de acceso utilizable.' });
    }

    const r = await metaPost(`/${conn.wabaId}/subscribed_apps`, opened.token);
    if (!r.ok) {
      const cause = describeFailure({ metaCode: r.error?.code, message: r.error?.message });
      await markError(conn.id, `No se pudo suscribir la cuenta: ${r.error?.message || 'sin detalle'}`);
      return res.status(502).json({
        error: cause.title, cause,
        providerMessage: r.error?.message || null,
        providerCode: r.error?.code ?? null,
        hint:
          'Suscribir una cuenta exige el permiso whatsapp_business_management en el ' +
          'token, que es distinto del de mensajería.',
      });
    }
    res.json({
      ok: true,
      note:
        'La cuenta quedó suscrita a la aplicación. Los mensajes entrantes y los estados ' +
        'de entrega de esta línea entran por el webhook central.',
    });
  } catch (err) { fallo(res, err); }
};

// ── El agente de la conexión ───────────────────────────────────────────────

export const getAgent = async (req, res) => {
  try {
    const { scope } = await alcance(req);
    const conn = await getConnection(req.params.id, { clubId: scope });
    if (!conn) return res.status(404).json({ error: 'Esa conexión no existe.' });

    const own = await getConnectionAgent(conn.id);
    const resolved = await resolveAgentForConnection(conn);
    const site = await db.query(
      `SELECT name,enabled,"modelSlug" FROM "WhatsAppAgentConfig" WHERE "clubId"=$1 LIMIT 1`,
      [conn.clubId]
    ).catch(() => ({ rows: [] }));

    res.json({
      agent: own || null,
      // `source` es lo que distingue «el agente de esta línea» de «el del sitio,
      // heredado». Se ven idénticos en la pantalla y se corrigen en sitios
      // distintos.
      source: resolved.source,
      inherited: !!resolved.inherited,
      siteAgent: site.rows[0] || null,
      connection: publicConnection(conn),
    });
  } catch (err) { fallo(res, err); }
};

export const putAgent = async (req, res) => {
  try {
    const { scope } = await alcance(req);
    const conn = await getConnection(req.params.id, { clubId: scope });
    if (!conn) return res.status(404).json({ error: 'Esa conexión no existe.' });

    const body = req.body || {};
    if (body.enabled && !String(body.systemPrompt || '').trim()) {
      return res.status(400).json({
        error:
          'Un agente encendido sin instrucción no sabe qué responder. Escribí qué debe ' +
          'hacer, o dejalo apagado para que los mensajes queden en la bandeja.',
      });
    }

    const agent = await upsertConnectionAgent(conn.id, conn.clubId, body);
    res.json({
      agent,
      note:
        'Este agente atiende SÓLO esta línea. Las demás conexiones del sitio no cambian, ' +
        'y las que no tengan agente propio siguen usando el del sitio.',
    });
  } catch (err) { fallo(res, err); }
};

/**
 * Prueba de conversación. NO manda nada por WhatsApp y lo dice.
 *
 * Corre por `previewAgentReply`, que es el mismo generador del camino real: una
 * prueba que no ejercita el camino que se va a usar no prueba nada.
 */
export const testAgent = async (req, res) => {
  try {
    const { scope } = await alcance(req);
    const conn = await getConnection(req.params.id, { clubId: scope });
    if (!conn) return res.status(404).json({ error: 'Esa conexión no existe.' });

    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Escribí un mensaje de prueba.' });

    const resolved = await resolveAgentForConnection(conn);
    if (!resolved.agent) {
      return res.status(409).json({
        error:
          'Esta línea no tiene agente propio ni hereda el del sitio, así que no hay quién ' +
          'redacte una respuesta. Los mensajes que lleguen se guardan en la bandeja.',
        cause: describeFailure({ code: 'sin_agente' }),
      });
    }

    const { previewAgentReply } = await import('../../services/whatsappAgent.js');
    const reply = await previewAgentReply({
      clubId: conn.clubId, agent: resolved.agent, messageText: message,
    });

    res.json({
      reply,
      agentName: resolved.agent.name,
      source: resolved.source,
      inherited: !!resolved.inherited,
      note: 'Acá no se envió nada por WhatsApp: es una prueba del agente de esta línea.',
    });
  } catch (err) { fallo(res, err); }
};

export default {
  list, create, update, remove, makeDefault, setStatus,
  verify, diagnose, subscribe, getAgent, putAgent, testAgent,
};
