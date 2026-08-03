// Diagnóstico en vivo de la conexión con Meta.
//
// Contesta, contra la API de Meta y contra nuestra propia base, las preguntas
// que hay que responder cuando el módulo «no refleja» lo que debería: si el
// token sirve, si el número es el que creemos, si Meta sigue suscrito a nuestro
// webhook y si las plantillas existen allá.
//
// Ninguna comprobación se DEDUCE. Cada una dice de dónde salió su respuesta
// —Meta o nuestra base— y, cuando no se pudo comprobar, lo dice en vez de dar
// un veredicto. Un «no se pudo comprobar» presentado como «bien» es peor que no
// tener el panel: manda a buscar el problema a otra parte.
import db from './db.js';

const WA_API_BASE = `https://graph.facebook.com/${process.env.WA_API_VERSION || 'v21.0'}`;

/** ok | warn | error | unknown — `unknown` es «no se pudo comprobar», no «bien». */
const check = (id, label, state, detail, evidence = null) =>
  ({ id, label, state, detail, evidence });

async function metaGet(path, token) {
  const started = Date.now();
  try {
    const res = await fetch(`${WA_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && !data.error, status: res.status, data, ms: Date.now() - started };
  } catch (err) {
    return { ok: false, status: null, data: { error: { message: err.message } }, ms: Date.now() - started };
  }
}

/**
 * Diagnóstico completo de un sitio.
 *
 * Las llamadas a Meta van en serie a propósito: son cinco, tardan poco y en
 * paralelo un token inválido produce cinco errores idénticos que ocultan cuál
 * fue el primero que falló.
 */
export async function diagnoseClub(clubId) {
  const checks = [];
  const now = new Date();

  // ── 1. Configuración guardada ────────────────────────────────────────────
  const cfgR = await db.query(`SELECT * FROM "WhatsAppConfig" WHERE "clubId"=$1 LIMIT 1`, [clubId]);
  const cfg = cfgR.rows[0] || null;

  if (!cfg) {
    checks.push(check('config', 'Configuración de WhatsApp', 'error',
      'No hay credenciales guardadas para este sitio. Sin ellas no se envía ni se recibe nada.'));
    return { clubId, checkedAt: now, checks, config: null };
  }

  const missing = ['phoneNumberId', 'wabaId', 'accessToken', 'verifyToken'].filter(k => !cfg[k]);
  checks.push(missing.length
    ? check('config', 'Configuración de WhatsApp', 'error',
        `Faltan campos obligatorios: ${missing.join(', ')}.`)
    : check('config', 'Configuración de WhatsApp', 'ok',
        `Número ${cfg.phoneNumberId}, cuenta ${cfg.wabaId}.`,
        { lastVerifiedAt: cfg.lastVerifiedAt, enabled: cfg.enabled }));

  if (cfg.enabled === false) {
    checks.push(check('enabled', 'Integración habilitada', 'warn',
      'La integración está deshabilitada en el panel: no sale ningún mensaje.'));
  }

  // ── 2. El token sirve, y el número es el que creemos ─────────────────────
  const phone = await metaGet(
    `/${cfg.phoneNumberId}?fields=verified_name,display_phone_number,quality_rating,code_verification_status,platform_type,throughput`,
    cfg.accessToken
  );
  if (phone.ok) {
    const q = phone.data.quality_rating;
    checks.push(check('token', 'Token de acceso', 'ok', 'Meta aceptó el token.', { ms: phone.ms }));
    checks.push(check('phone_number', 'Número emisor',
      q && String(q).toUpperCase() !== 'GREEN' ? 'warn' : 'ok',
      `${phone.data.verified_name || 'sin nombre verificado'} — ${phone.data.display_phone_number || 's/d'}. Calidad: ${q || 'sin dato'}.`,
      phone.data));
  } else {
    const e = phone.data?.error || {};
    // 190 es «token inválido o vencido». Se distingue del resto porque es el
    // único que se corrige rotando la credencial, y confundirlo con un permiso
    // faltante manda a revisar la app de Meta sin motivo.
    checks.push(check('token', 'Token de acceso',
      'error',
      e.code === 190
        ? 'Meta rechazó el token (código 190): está vencido o fue revocado. Hay que generar uno nuevo y guardarlo en el panel.'
        : `Meta rechazó la consulta del número: ${e.message || `HTTP ${phone.status}`}${e.code ? ` (código ${e.code})` : ''}.`,
      e));
    checks.push(check('phone_number', 'Número emisor', 'unknown',
      'No se pudo comprobar: la consulta del número falló antes de responder.'));
  }

  // ── 3. El phoneNumberId guardado está entre los de la cuenta ─────────────
  //
  // Es la comprobación decisiva cuando el webhook «no llega»: Meta manda el
  // evento con el phoneNumberId que le corresponde, y si el que tenemos
  // guardado no es ese, el webhook llega y se descarta. Desde fuera se ve
  // idéntico a que Meta no lo mandara.
  const numbers = await metaGet(`/${cfg.wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`, cfg.accessToken);
  if (numbers.ok && Array.isArray(numbers.data?.data)) {
    const ids = numbers.data.data.map(n => n.id);
    checks.push(ids.includes(cfg.phoneNumberId)
      ? check('phone_id_match', 'El identificador del número coincide', 'ok',
          'El número guardado es uno de los de la cuenta.', { ids })
      : check('phone_id_match', 'El identificador del número coincide', 'error',
          `El identificador guardado (${cfg.phoneNumberId}) NO está entre los de la cuenta (${ids.join(', ') || 'ninguno'}). Mientras siga así, los webhooks llegan y se descartan: ni los mensajes entrantes ni los estados de entrega se registran.`,
          { guardado: cfg.phoneNumberId, enMeta: numbers.data.data }));
  } else {
    checks.push(check('phone_id_match', 'El identificador del número coincide', 'unknown',
      `No se pudo listar los números de la cuenta: ${numbers.data?.error?.message || `HTTP ${numbers.status}`}.`));
  }

  // ── 4. Meta sigue suscrito a nuestro webhook ─────────────────────────────
  //
  // Meta da de baja la suscripción por su cuenta cuando el endpoint falla o
  // tarda de forma sostenida. Cuando eso pasa, todo sigue pareciendo normal
  // —los envíos salen y se entregan— pero no vuelve ningún estado.
  const subs = await metaGet(`/${cfg.wabaId}/subscribed_apps`, cfg.accessToken);
  if (subs.ok) {
    const apps = subs.data?.data || [];
    checks.push(apps.length
      ? check('webhook_subscription', 'Suscripción al webhook', 'ok',
          `Meta tiene ${apps.length} app suscrita a esta cuenta.`, apps)
      : check('webhook_subscription', 'Suscripción al webhook', 'error',
          'Ninguna app está suscrita a esta cuenta de WhatsApp. Meta no va a mandar ni mensajes entrantes ni estados de entrega. Hay que volver a suscribir la app en el panel de Meta.', apps));
  } else {
    checks.push(check('webhook_subscription', 'Suscripción al webhook', 'unknown',
      `No se pudo consultar: ${subs.data?.error?.message || `HTTP ${subs.status}`}. Suele ser un permiso que le falta al token (whatsapp_business_management).`));
  }

  // ── 5. La firma del webhook se puede comprobar ───────────────────────────
  const hasSecret = !!(process.env.META_APP_SECRET || process.env.WA_APP_SECRET);
  checks.push(hasSecret
    ? check('signature', 'Firma del webhook', 'ok',
        'Hay App Secret configurado: cada webhook se comprueba contra la firma de Meta.')
    : check('signature', 'Firma del webhook', 'warn',
        'No hay META_APP_SECRET en el entorno. El webhook funciona, pero no se puede comprobar que quien lo manda sea Meta.'));

  // ── 6. Qué nos ha llegado de verdad ──────────────────────────────────────
  const evidence = await localEvidence(clubId, now);
  checks.push(...evidence.checks);

  return {
    clubId,
    checkedAt: now,
    config: {
      phoneNumberId: cfg.phoneNumberId,
      wabaId: cfg.wabaId,
      enabled: cfg.enabled,
      lastVerifiedAt: cfg.lastVerifiedAt,
      hasAppId: !!cfg.appId,
    },
    checks,
    stats: evidence.stats,
  };
}

/**
 * Lo que dice NUESTRA base. Es la otra mitad del diagnóstico: Meta puede estar
 * perfecta y el problema estar de este lado.
 */
async function localEvidence(clubId, now) {
  const checks = [];
  const stats = {};

  // Webhooks recibidos. La tabla es de v4.702: antes de esa fecha no hay filas
  // y eso NO significa que no llegara nada. Se dice, en vez de concluir.
  let webhookRows = null;
  try {
    const r = await db.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE outcome <> 'ok')::int AS problemas,
              MAX("receivedAt") AS ultimo
         FROM "CrmWebhookEvent"
        WHERE ("clubId"=$1 OR "clubId" IS NULL) AND "receivedAt" > NOW() - INTERVAL '7 days'`,
      [clubId]
    );
    webhookRows = r.rows[0];
  } catch {
    // La tabla todavía no existe (primer arranque tras el despliegue).
  }

  if (!webhookRows) {
    checks.push(check('webhook_traffic', 'Webhooks recibidos', 'unknown',
      'El registro de webhooks todavía no existe en esta base. Se crea con el primer evento que llegue.'));
  } else {
    stats.webhooks7d = webhookRows.total;
    const ultimo = webhookRows.ultimo ? new Date(webhookRows.ultimo) : null;
    const horas = ultimo ? (now - ultimo) / 3600000 : null;
    checks.push(
      !ultimo
        ? check('webhook_traffic', 'Webhooks recibidos', 'warn',
            'No ha llegado ningún webhook desde que se empezó a registrar. Si ya pasaron horas con envíos, revisar la suscripción.')
        : horas > 48
          ? check('webhook_traffic', 'Webhooks recibidos', 'warn',
              `El último webhook llegó hace ${Math.round(horas)} horas (${webhookRows.total} en 7 días, ${webhookRows.problemas} con problemas).`,
              webhookRows)
          : check('webhook_traffic', 'Webhooks recibidos', 'ok',
              `${webhookRows.total} en 7 días, el último hace ${horas < 1 ? 'menos de una hora' : `${Math.round(horas)} horas`}. ${webhookRows.problemas} con problemas.`,
              webhookRows)
    );
  }

  // Envíos y sus estados. Es la señal que motivó la auditoría: mensajes que
  // salen y se quedan en «enviado» para siempre.
  const msg = await db.query(
    `SELECT COUNT(*)::int AS enviados,
            COUNT(*) FILTER (WHERE "deliveredAt" IS NOT NULL)::int AS entregados,
            COUNT(*) FILTER (WHERE "readAt" IS NOT NULL)::int AS leidos,
            COUNT(*) FILTER (WHERE status='failed')::int AS fallidos,
            MAX("sentAt") AS ultimo
       FROM "WhatsAppMessageLog"
      WHERE "clubId"=$1 AND direction='outgoing' AND "sentAt" > NOW() - INTERVAL '7 days'`,
    [clubId]
  );
  const m = msg.rows[0];
  stats.outbound7d = m;

  if (!m.enviados) {
    checks.push(check('delivery_feedback', 'Confirmaciones de entrega', 'unknown',
      'No hubo envíos en los últimos 7 días: no hay nada de lo que esperar confirmación.'));
  } else if (m.entregados === 0 && m.fallidos === 0) {
    // Ninguna confirmación de ningún tipo sobre envíos reales. Es el síntoma
    // exacto de un webhook que no vuelve, no de un problema de entrega.
    checks.push(check('delivery_feedback', 'Confirmaciones de entrega', 'error',
      `Salieron ${m.enviados} mensajes en 7 días y no volvió NINGUNA confirmación (ni entregado, ni leído, ni fallido). Los mensajes probablemente sí llegaron: lo que no llega es la respuesta de Meta. Revisar la suscripción al webhook y el identificador del número.`,
      m));
  } else {
    const pct = Math.round((m.entregados / m.enviados) * 100);
    checks.push(check('delivery_feedback', 'Confirmaciones de entrega',
      pct < 50 ? 'warn' : 'ok',
      `${m.entregados} de ${m.enviados} entregados (${pct} %), ${m.leidos} leídos, ${m.fallidos} fallidos.`,
      m));
  }

  // Errores de salida registrados (v4.702).
  try {
    const out = await db.query(
      `SELECT operation, "errorCode", "errorMessage", COUNT(*)::int AS n, MAX("createdAt") AS ultimo
         FROM "CrmOutboundLog"
        WHERE "clubId"=$1 AND ok = false AND "createdAt" > NOW() - INTERVAL '7 days'
        GROUP BY operation, "errorCode", "errorMessage"
        ORDER BY n DESC LIMIT 10`,
      [clubId]
    );
    stats.outboundErrors = out.rows;
    if (out.rows.length) {
      const top = out.rows[0];
      checks.push(check('outbound_errors', 'Errores de salida hacia Meta', 'warn',
        `${out.rows.reduce((a, r) => a + r.n, 0)} llamadas fallidas en 7 días. La más repetida: ${top.errorMessage || top.errorCode} (${top.n} veces).`,
        out.rows));
    } else {
      checks.push(check('outbound_errors', 'Errores de salida hacia Meta', 'ok',
        'Ninguna llamada a Meta falló en los últimos 7 días.'));
    }
  } catch {
    checks.push(check('outbound_errors', 'Errores de salida hacia Meta', 'unknown',
      'El registro de salidas todavía no existe en esta base.'));
  }

  return { checks, stats };
}

/**
 * Compara las plantillas locales con las de Meta.
 *
 * Una plantilla que existe acá y no allá es la avería que rompe un recorrido
 * entero: el envío falla con «template name does not exist» contacto por
 * contacto, y en el panel se ve como una plantilla normal.
 */
export async function auditTemplates(clubId) {
  const cfgR = await db.query(`SELECT * FROM "WhatsAppConfig" WHERE "clubId"=$1 LIMIT 1`, [clubId]);
  const cfg = cfgR.rows[0];
  if (!cfg?.wabaId || !cfg?.accessToken) {
    return { ok: false, reason: 'Sin configuración de WhatsApp para este sitio.' };
  }

  const remote = await metaGet(`/${cfg.wabaId}/message_templates?fields=name,language,status,category&limit=200`, cfg.accessToken);
  if (!remote.ok) {
    return { ok: false, reason: `Meta no devolvió las plantillas: ${remote.data?.error?.message || `HTTP ${remote.status}`}` };
  }

  const metaList = remote.data?.data || [];
  const metaByName = new Map(metaList.map(t => [`${t.name}|${t.language}`, t]));

  const localR = await db.query(
    `SELECT name, language, status, folder FROM "WhatsAppTemplate" WHERE "clubId"=$1`,
    [clubId]
  );

  const rows = localR.rows.map(l => {
    const remoteT = metaByName.get(`${l.name}|${l.language}`)
      || metaList.find(t => t.name === l.name) || null;
    return {
      name: l.name,
      language: l.language,
      folder: l.folder,
      localStatus: l.status,
      metaStatus: remoteT?.status || null,
      // Tres diagnósticos distintos y no intercambiables: la que no existe
      // allá romperá el envío; la que difiere muestra un estado desactualizado
      // en el panel; la que coincide está bien.
      issue: !remoteT ? 'no_existe_en_meta'
        : String(remoteT.status).toUpperCase() !== String(l.status || '').toUpperCase() ? 'estado_desactualizado'
        : null,
    };
  });

  const onlyInMeta = metaList
    .filter(t => !localR.rows.some(l => l.name === t.name))
    .map(t => ({ name: t.name, language: t.language, status: t.status, category: t.category }));

  return {
    ok: true,
    total: rows.length,
    missingInMeta: rows.filter(r => r.issue === 'no_existe_en_meta'),
    outOfSync: rows.filter(r => r.issue === 'estado_desactualizado'),
    onlyInMeta,
    rows,
  };
}

export default { diagnoseClub, auditTemplates };
