// El CRITERIO de las conexiones de WhatsApp. **Puro**: sin base, sin red, sin
// Meta, sin DOM.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUÉ EXISTE ESTA ENTIDAD
// ═══════════════════════════════════════════════════════════════════════════
//
// Hasta v4.991 el módulo era single-WABA POR DISEÑO, no por descuido:
// `WhatsAppConfig.clubId` es `@unique` y `crmTenant.js` lo dice textual —«La
// plataforma es el único remitente… No hay un WABA por club»—. Abrir el módulo
// a varias líneas (Distrito, club, campaña, proyecto, Feria de Proyectos)
// invierte esa decisión, y por eso la conexión es una entidad nueva en vez de
// una columna más: lo que cambia no es un dato del sitio, es QUIÉN es el sujeto
// de una credencial, un agente y una conversación.
//
// LO QUE YA ESTABA BIEN Y NO SE TOCA: el webhook ya resolvía por
// `phone_number_id` con respaldo por `waba_id`, es decir por el NÚMERO
// EMPRESARIAL RECEPTOR y nunca por el número de quien escribe. Eso es lo
// correcto y lo que este archivo lleva un paso más allá: la resolución termina
// en una CONEXIÓN —con su token y su agente— en vez de terminar en un `clubId`.
//
// ═══════════════════════════════════════════════════════════════════════════
// LAS REGLAS QUE SOSTIENEN EL AISLAMIENTO
// ═══════════════════════════════════════════════════════════════════════════
//
// 1. La credencial de salida NO SE DEDUCE. `sendGuard` exige la conexión y
//    falla si no la tiene. Que no se pueda deducir es la garantía; que la
//    pantalla muestre «Enviar desde: …» es sólo la comodidad. El defecto que
//    esto cierra es el más caro del módulo: `sendWhatsAppTextMessage({ clubId })`
//    deducía el token del sitio, así que con dos líneas un mensaje de la Feria
//    podía salir por el número del Distrito — para quien lo recibe, es otra
//    organización escribiéndole.
//
// 2. El catálogo de lo editable es CERRADO (`EDITABLE_FIELDS`). Lo que no está
//    en la lista no se puede ni expresar en la petición: es el patrón
//    `stripProtected` del resto del sitio. `clubId`, `status` e `isDefault`
//    quedan fuera a propósito — mover una conexión de sitio arrastra
//    conversaciones, y activar o marcar como principal son actos con su propia
//    ruta y su propia auditoría.
//
// 3. El token NUNCA sale hacia el navegador (`publicConnection`). Ni recortado:
//    los 8 primeros y 4 últimos caracteres que devolvía `getConfig` son 12
//    caracteres de una credencial de cobro de mensajes. Lo que sale es
//    `hasToken`, que es lo único que la pantalla necesita saber.
//
// 4. La resolución es DETERMINISTA. Si dependiera del orden en que la base
//    devuelve las filas, el mismo mensaje se encaminaría distinto en dos
//    entregas del mismo webhook (Meta reintenta). El desempate está declarado y
//    termina en el id, que es lo único que no empata nunca.

// ── Catálogos CERRADOS ─────────────────────────────────────────────────────
//
// Cerrados a propósito: un estado inventado no se puede filtrar ni reportar, y
// un proveedor inventado no tiene adaptador de entrada.

export const STATUSES = {
  draft: {
    label: 'Borrador',
    // Nace acá: una conexión a medio configurar no puede recibir trabajo.
    canReceive: false,
    canSend: false,
    help: 'Se guardó pero todavía no se verificó contra Meta.',
  },
  active: {
    label: 'Activa',
    canReceive: true,
    canSend: true,
    help: 'Recibe mensajes y puede responder.',
  },
  paused: {
    label: 'Pausada',
    // Sigue RECIBIENDO: los mensajes se guardan y quedan en la bandeja para que
    // los atienda una persona. Lo que se detiene es la respuesta automática.
    // Descartar el entrante sería perder lo que alguien nos escribió por una
    // decisión administrativa nuestra.
    canReceive: true,
    canSend: false,
    help: 'Los mensajes se siguen guardando; no sale ninguna respuesta automática.',
  },
  error: {
    label: 'Con error',
    // También recibe. Un token vencido impide RESPONDER, no impide que Meta nos
    // entregue: tirar el entrante dejaría a la persona sin registro de haber
    // escrito, que es la peor de las dos consecuencias.
    canReceive: true,
    canSend: false,
    help: 'Meta rechazó la última operación. Revisa el diagnóstico de la conexión.',
  },
};

export const STATUS_IDS = Object.keys(STATUSES);
export const DEFAULT_STATUS = 'draft';

/**
 * De dónde llega el evento. `meta_cloud` es el único implementado.
 *
 * El campo existe —en vez de asumir Meta— porque el módulo ya tiene una segunda
 * pasarela viva (`whatsappQrController.js`, contra Evolution API) y porque un
 * intermediario que reciba de Meta y nos reenvíe entraría como un adaptador de
 * ENTRADA sin tocar la resolución: lo que cambia en ese caso es cómo llega el
 * `phone_number_id` y cómo se valida la firma, no a quién pertenece el mensaje.
 *
 * NO se declara ningún proveedor que no tenga adaptador: sería una opción de la
 * pantalla que no hace nada.
 */
export const WEBHOOK_PROVIDERS = {
  meta_cloud: {
    label: 'Meta WhatsApp Cloud API',
    // Una App de Meta tiene UNA URL de callback, así que todas las WABAs bajo
    // la misma App entran por el mismo webhook. Eso es lo que hace viable el
    // router con un solo endpoint.
    sharedWebhook: true,
    // Lo que sí es por cuenta: `POST /{waba_id}/subscribed_apps`. Meta la da de
    // baja por su cuenta cuando el endpoint falla o tarda, y cuando pasa todo
    // parece normal salvo que no vuelve ningún estado.
    requiresPerWabaSubscription: true,
    verifiesSignature: true,
  },
};

export const WEBHOOK_PROVIDER_IDS = Object.keys(WEBHOOK_PROVIDERS);
export const DEFAULT_WEBHOOK_PROVIDER = 'meta_cloud';

/**
 * Lo que una petición del panel puede escribir. CERRADO.
 *
 * Fuera de la lista, y por qué:
 *   · `clubId`  — mover una conexión de sitio arrastra sus conversaciones y sus
 *                 mensajes. Es una operación de datos, no una edición.
 *   · `status`  — tiene su propia ruta (`/:id/status`) para que activar o
 *                 desactivar quede auditado como el acto que es.
 *   · `isDefault` — igual, con su propia ruta: sólo puede haber una por sitio.
 *   · `lastInboundAt` y compañía — las escriben el router y el emisor, que son
 *                 los que saben. Aceptarlas del cuerpo permitiría fabricar un
 *                 diagnóstico sano sobre una línea muerta.
 */
export const EDITABLE_FIELDS = [
  'displayName',
  'phoneNumber',
  'phoneNumberId',
  'wabaId',
  'appId',
  'accessToken',   // se cifra antes de guardarse; nunca vuelve al navegador
  'verifyToken',
  'webhookProvider',
  'siteId',
  'siteType',
  'campaignId',
  'projectId',
  'eventId',
  'notes',
];

/** Los tres vínculos OPCIONALES. Nulos en la conexión de un Distrito. */
export const SCOPE_FIELDS = ['campaignId', 'projectId', 'eventId'];

// ── Saneado ────────────────────────────────────────────────────────────────

const str = (v, max = 200) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
};

/**
 * Un identificador de Meta es una cadena de dígitos. Se comprueba la FORMA, no
 * la existencia: eso lo dice Meta y para eso está `verify`.
 *
 * Importa porque el error de Meta ante un identificador con un espacio pegado
 * —lo más común al copiarlo del panel— no menciona el espacio, y quien lo pegó
 * no tiene por dónde empezar.
 */
export const looksLikeMetaId = (v) => typeof v === 'string' && /^\d{6,25}$/.test(v.trim());

/**
 * Da FORMA a lo que llega del cuerpo. No decide si sirve —eso es
 * `validateConnection`— y no toca nada que no esté en `EDITABLE_FIELDS`.
 *
 * Devuelve además `dropped`: lo que se descartó, con su nombre. Un descarte
 * silencioso deja a quien mandó un campo de más creyendo que se guardó.
 */
export function shapeConnection(raw = {}) {
  const out = {};
  const dropped = [];

  for (const key of Object.keys(raw)) {
    if (!EDITABLE_FIELDS.includes(key)) { dropped.push(key); continue; }
    const v = raw[key];

    if (key === 'webhookProvider') {
      const p = str(v, 40);
      out[key] = p && WEBHOOK_PROVIDER_IDS.includes(p) ? p : DEFAULT_WEBHOOK_PROVIDER;
      continue;
    }
    if (key === 'siteType') {
      const t = str(v, 20);
      out[key] = t === 'district' ? 'district' : t === 'club' ? 'club' : null;
      continue;
    }
    if (key === 'accessToken' || key === 'verifyToken') {
      // Sin tope de longitud útil: un token de usuario del sistema de Meta pasa
      // holgado los 200 caracteres y recortarlo lo rompería en silencio.
      out[key] = str(v, 4000);
      continue;
    }
    if (key === 'displayName') { out[key] = str(v, 120); continue; }
    if (key === 'notes') { out[key] = str(v, 2000); continue; }
    out[key] = str(v, 200);
  }

  return { data: out, dropped };
}

/**
 * ¿Sirve para guardarse?
 *
 * `errors` impide guardar; `warnings` se guarda y se dice. Tratarlos igual
 * convierte cualquier observación en un bloqueo y se dejan de leer —regla del
 * panel de tarifas—.
 *
 * `existing` es la fila guardada cuando se está editando: es lo que permite que
 * un `PUT` parcial no exija reenviar el token.
 */
export function validateConnection(data = {}, { existing = null } = {}) {
  const errors = [];
  const warnings = [];
  const val = (k) => (data[k] !== undefined ? data[k] : existing?.[k] ?? null);

  if (!val('displayName')) {
    // Obligatorio porque es lo que se lee en el selector «Enviar desde: …».
    // Una línea sin nombre convierte ese control en una lista de números.
    errors.push({ field: 'displayName', message: 'La conexión necesita un nombre. Es lo que se lee al elegir desde qué línea se responde (ej. «WhatsApp Feria de Proyectos»).' });
  }

  const pnid = val('phoneNumberId');
  if (!pnid) {
    errors.push({ field: 'phoneNumberId', message: 'Falta el ID del número de teléfono. Es la llave con la que el webhook sabe que un mensaje es de esta línea: sin él no se puede encaminar nada.' });
  } else if (!looksLikeMetaId(pnid)) {
    errors.push({ field: 'phoneNumberId', message: `«${pnid}» no tiene la forma de un ID de Meta (sólo dígitos). Revisa que no se haya copiado con espacios o con el número de teléfono en vez del identificador.` });
  }

  const waba = val('wabaId');
  if (!waba) {
    errors.push({ field: 'wabaId', message: 'Falta el ID de la cuenta de WhatsApp Business (WABA). Es el respaldo del enrutamiento cuando el número se migra en el panel de Meta.' });
  } else if (!looksLikeMetaId(waba)) {
    errors.push({ field: 'wabaId', message: `«${waba}» no tiene la forma de un ID de Meta (sólo dígitos).` });
  }

  // El token: obligatorio al crear, opcional al editar.
  const hasStoredToken = !!existing?.accessTokenEnc;
  if (!val('accessToken') && !hasStoredToken) {
    errors.push({ field: 'accessToken', message: 'Falta el token de acceso. Sin él no se puede enviar ni verificar nada contra Meta.' });
  }

  const appId = val('appId');
  if (appId && !looksLikeMetaId(appId)) {
    warnings.push({ field: 'appId', message: `«${appId}» no tiene la forma de un ID de aplicación de Meta. Es opcional, así que se guarda igual.` });
  }

  if (!val('verifyToken') && !existing?.verifyToken) {
    // AVISO y no error: con una sola App de Meta el `verify_token` es de la App
    // y ya está configurado allá, así que la conexión nueva no necesita el suyo.
    warnings.push({ field: 'verifyToken', message: 'Sin token de verificación propio. Con una sola aplicación de Meta esto es normal: la verificación del webhook la resuelve la configuración de la aplicación.' });
  }

  const declaredScopes = SCOPE_FIELDS.filter((f) => val(f));
  if (declaredScopes.length > 1) {
    warnings.push({
      field: declaredScopes[1],
      message: `Esta conexión declara ${declaredScopes.length} vínculos a la vez (${declaredScopes.join(', ')}). Se guarda, pero conviene que una línea represente UNA cosa: es lo que se muestra en la tarjeta y en la bandeja.`,
    });
  }

  return { ok: errors.length === 0, errors, warnings };
}

// ── Lo que sale hacia el navegador ─────────────────────────────────────────

/**
 * La forma pública de una conexión. **NUNCA lleva el token, ni recortado.**
 *
 * `hasToken` es lo único que la pantalla necesita: sirve para pintar «falta la
 * credencial» sin filtrar 12 caracteres de la credencial.
 */
export function publicConnection(row, { agent = null } = {}) {
  if (!row) return null;
  const status = STATUSES[row.status] ? row.status : DEFAULT_STATUS;
  return {
    id: row.id,
    clubId: row.clubId,
    displayName: row.displayName,
    phoneNumber: row.phoneNumber || null,
    phoneNumberId: row.phoneNumberId,
    wabaId: row.wabaId,
    appId: row.appId || null,
    webhookProvider: row.webhookProvider || DEFAULT_WEBHOOK_PROVIDER,
    status,
    statusLabel: STATUSES[status].label,
    isDefault: !!row.isDefault,
    siteId: row.siteId || null,
    siteType: row.siteType || null,
    campaignId: row.campaignId || null,
    projectId: row.projectId || null,
    eventId: row.eventId || null,
    notes: row.notes || null,
    hasToken: !!row.accessTokenEnc,
    hasVerifyToken: !!row.verifyToken,
    lastVerifiedAt: row.lastVerifiedAt || null,
    lastInboundAt: row.lastInboundAt || null,
    lastOutboundAt: row.lastOutboundAt || null,
    lastErrorAt: row.lastErrorAt || null,
    lastError: row.lastError || null,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
    agent: agent || null,
  };
}

/** Enmascara un token para un log. Nunca el valor, nunca un prefijo útil. */
export function maskToken(token) {
  if (typeof token !== 'string' || !token) return '(sin token)';
  return `(token de ${token.length} caracteres)`;
}

// ── Resolución: de un evento a una conexión ────────────────────────────────

/**
 * Elige la conexión a la que pertenece un evento entrante.
 *
 * `candidates` son las filas que la consulta trajo para ese `phoneNumberId` o
 * ese `wabaId`; quién gana lo decide ACÁ, que es puro y está probado. Poner el
 * desempate en el SQL lo dejaría fuera de las pruebas.
 *
 * EL ORDEN IMPORTA Y ESTÁ DECLARADO:
 *   1. Coincidencia exacta de `phoneNumberId`. Es el dato del número que
 *      RECIBIÓ el mensaje y es único en Meta.
 *   2. Respaldo por `wabaId`, y SE DICE (`resolvedBy: 'waba_id'`): significa que
 *      el número se migró en el panel de Meta y el `phoneNumberId` guardado se
 *      quedó viejo. Sin este respaldo, migrar un número descartaba TODO
 *      —mensajes y estados— en silencio.
 *   3. Sin coincidencia: `null` con motivo. Nunca «la primera fila»: encaminar
 *      un mensaje a una organización porque su fila salió primero es peor que
 *      no encaminarlo, porque no deja rastro de la equivocación.
 *
 * El desempate dentro de cada grupo —que sólo se da con datos heredados, porque
 * `phoneNumberId` lleva índice único— es: puede recibir, luego principal, luego
 * verificada más recientemente, luego el id menor. Termina en el id a propósito:
 * es lo único que no empata nunca, y dos entregas del mismo webhook tienen que
 * resolver igual.
 */
export function resolveConnection({ phoneNumberId, wabaId } = {}, candidates = []) {
  const rows = Array.isArray(candidates) ? candidates.filter(Boolean) : [];

  const rank = (a, b) => {
    const ra = STATUSES[a.status]?.canReceive ? 0 : 1;
    const rb = STATUSES[b.status]?.canReceive ? 0 : 1;
    if (ra !== rb) return ra - rb;
    if (!!a.isDefault !== !!b.isDefault) return a.isDefault ? -1 : 1;
    const ta = a.lastVerifiedAt ? new Date(a.lastVerifiedAt).getTime() : 0;
    const tb = b.lastVerifiedAt ? new Date(b.lastVerifiedAt).getTime() : 0;
    if (ta !== tb) return tb - ta;
    return String(a.id) < String(b.id) ? -1 : 1;
  };

  if (phoneNumberId) {
    const exact = rows.filter((r) => r.phoneNumberId === phoneNumberId).sort(rank);
    if (exact.length) {
      return {
        connection: exact[0],
        resolvedBy: 'phone_number_id',
        ambiguous: exact.length > 1 ? exact.length : 0,
        reason: null,
      };
    }
  }

  if (wabaId) {
    const byWaba = rows.filter((r) => r.wabaId === wabaId).sort(rank);
    if (byWaba.length) {
      return {
        connection: byWaba[0],
        resolvedBy: 'waba_id',
        ambiguous: byWaba.length > 1 ? byWaba.length : 0,
        // El motivo viaja para que quede en la bitácora: es la señal de que hay
        // un `phoneNumberId` guardado que ya no corresponde.
        reason: `El número ${phoneNumberId || 'sin identificar'} no coincide con ninguna conexión guardada; se encaminó por la cuenta ${wabaId}. Conviene corregir el ID del número en esa conexión.`,
      };
    }
  }

  return {
    connection: null,
    resolvedBy: 'unknown_phone_number_id',
    ambiguous: 0,
    reason: `Meta entregó un evento del número ${phoneNumberId || 'sin identificar'} (cuenta ${wabaId || 'sin identificar'}) y ninguna conexión guardada coincide. Mientras siga así, ni los mensajes entrantes ni los estados de entrega de esa línea se registran.`,
  };
}

// ── El agente: de la conexión, del sitio, o ninguno ────────────────────────

/**
 * Qué agente atiende esta línea.
 *
 * LA HERENCIA ES LO QUE HACE QUE DESPLEGAR ESTO NO CAMBIE NADA: una conexión
 * sin agente propio cae en el del sitio, que es exactamente lo que hay hoy
 * (`WhatsAppAgentConfig.clubId @unique`). El «Asistente Feria de Proyectos»
 * existe al lado del asistente del Distrito, no en su lugar.
 *
 * `source` viaja a la pantalla porque «el agente de esta línea» y «el agente
 * del sitio, heredado» se ven idénticos y se corrigen en sitios distintos.
 */
export function resolveAgent({ connectionAgent = null, siteAgent = null } = {}) {
  if (connectionAgent && connectionAgent.enabled !== false) {
    return { agent: connectionAgent, source: 'connection', inherited: false };
  }
  // Un agente de conexión APAGADO no cae al del sitio: apagarlo es una decisión
  // sobre esta línea, y heredar el del sitio la desobedecería.
  if (connectionAgent && connectionAgent.enabled === false) {
    return { agent: null, source: 'connection_disabled', inherited: false };
  }
  if (siteAgent && siteAgent.enabled !== false) {
    return { agent: siteAgent, source: 'site', inherited: true };
  }
  return { agent: null, source: 'none', inherited: false };
}

// ── La puerta de salida ────────────────────────────────────────────────────

/**
 * ¿Se puede enviar por esta conexión?
 *
 * Es la puerta que cierra el riesgo más caro del módulo. Devuelve el motivo
 * SIEMPRE que diga que no: «no se pudo enviar» a secas obliga a diagnosticar a
 * ciegas, y acá las causas se corrigen en cuatro sitios distintos.
 */
export function sendGuard(connection, { requireAgent = false, agentSource = null } = {}) {
  if (!connection) {
    return {
      ok: false,
      code: 'sin_conexion',
      message: 'No se indicó desde qué línea de WhatsApp enviar. La credencial no se deduce del sitio a propósito: con varias líneas, deducirla es responder desde el número equivocado.',
    };
  }
  if (!connection.accessTokenEnc && !connection.accessToken) {
    return {
      ok: false,
      code: 'sin_credencial',
      message: `«${connection.displayName || connection.id}» no tiene token de acceso guardado. Cárgalo en Configuración → WhatsApp → esa cuenta.`,
    };
  }
  const st = STATUSES[connection.status] || STATUSES[DEFAULT_STATUS];
  if (!st.canSend) {
    return {
      ok: false,
      code: `estado_${connection.status}`,
      message: `«${connection.displayName || connection.id}» está en estado «${st.label}»: ${st.help}`,
    };
  }
  if (requireAgent && (!agentSource || agentSource === 'none' || agentSource === 'connection_disabled')) {
    return {
      ok: false,
      code: 'sin_agente',
      message: `«${connection.displayName || connection.id}» no tiene agente asignado ni hereda el del sitio, así que no hay quién redacte la respuesta automática. Los mensajes se siguen guardando en la bandeja.`,
    };
  }
  return { ok: true, code: null, message: null };
}

// ── Diagnóstico: la causa técnica, no «no funciona» ────────────────────────

/**
 * Catálogo de fallos con su causa y su salida.
 *
 * Es la exigencia expresa del pedido y la regla del sitio: un diagnóstico que
 * dice «no funciona» obliga a reproducir la avería a ciegas. Cada entrada dice
 * QUÉ pasó y DÓNDE se corrige.
 *
 * Cerrado: un código que no esté acá cae en `describeFailure` con el texto
 * TEXTUAL del proveedor, que es más específico que cualquier traducción nuestra.
 */
export const FAILURE_CAUSES = {
  token_expirado: {
    title: 'El token de acceso está vencido o fue revocado',
    detail: 'Meta rechazó la llamada con el código 190. Un token de usuario del sistema no vence solo, pero se revoca al cambiar la contraseña de la cuenta, al quitar el permiso o al rotarlo en el panel.',
    fix: 'Generar un token nuevo en Meta Business y volver a guardarlo en esta conexión.',
    metaCodes: [190, 102, 463, 467],
  },
  numero_ajeno_a_la_waba: {
    title: 'El ID del número no pertenece a esta cuenta de WhatsApp',
    detail: 'El `phone_number_id` y el `waba_id` guardados no son de la misma cuenta. Suele pasar al copiar los dos identificadores de pantallas distintas del panel de Meta, o al reutilizar la configuración de otra línea.',
    fix: 'Comprobar los dos identificadores en Meta Business → Cuentas de WhatsApp → ese número.',
    metaCodes: [100, 33],
  },
  permiso_ausente: {
    title: 'Al token le falta un permiso de mensajería',
    detail: 'La credencial es válida pero no tiene `whatsapp_business_messaging` (enviar) o `whatsapp_business_management` (administrar la cuenta). Con el primero ausente no sale ningún mensaje; con el segundo, la suscripción y el diagnóstico fallan aunque el envío funcione.',
    fix: 'Agregar los permisos al usuario del sistema en Meta Business y generar el token otra vez.',
    metaCodes: [200, 3, 10],
  },
  webhook_sin_suscripcion: {
    title: 'La cuenta no está suscrita al webhook',
    detail: 'Meta da de baja la suscripción por su cuenta cuando el endpoint falla o tarda. Cuando pasa, todo parece normal —los envíos salen y se entregan— y lo que no vuelve es la respuesta de Meta: ni mensajes entrantes ni estados de entrega.',
    fix: 'Volver a suscribir la cuenta desde el diagnóstico de esta conexión.',
    metaCodes: [],
  },
  webhook_sin_resolver: {
    title: 'Llegan eventos y no se puede saber de qué línea son',
    detail: 'El webhook recibió eventos cuyo `phone_number_id` no coincide con ninguna conexión guardada. El payload quedó registrado, pero el mensaje no se atribuyó a nadie.',
    fix: 'Revisar el ID del número de las conexiones, o crear la que falta. El identificador exacto está en la bitácora del webhook.',
    metaCodes: [],
  },
  sin_agente: {
    title: 'No hay agente asignado a esta línea',
    detail: 'Los mensajes se reciben y se guardan en la bandeja, pero no sale ninguna respuesta automática porque no hay agente propio ni se hereda el del sitio.',
    fix: 'Asignar un agente a esta conexión, o encender el del sitio para que lo herede.',
    metaCodes: [],
  },
  cuenta_desactivada: {
    title: 'La conexión está desactivada',
    detail: 'Alguien la pausó a propósito. Los mensajes entrantes se siguen guardando; lo que está detenido es la respuesta.',
    fix: 'Activarla desde la lista de cuentas conectadas.',
    metaCodes: [],
  },
  limite_de_mensajes: {
    title: 'La cuenta llegó a su límite de mensajería',
    detail: 'Meta acota cuántos destinatarios nuevos por día admite un número según su nivel de calidad. No es un error de configuración.',
    fix: 'Esperar la ventana siguiente o subir el nivel del número en Meta Business.',
    metaCodes: [130429, 131048, 131056],
  },
};

/**
 * Traduce un fallo a su causa, conservando el texto del proveedor.
 *
 * El original va SIEMPRE: «Lightning dunning decision is deny» no le dice a
 * nadie que su cuenta tiene un pago rechazado, pero es lo que se busca en el
 * soporte de Meta. El diagnóstico va delante y el original entre paréntesis
 * —regla del sitio desde `describeProviderFailure`—.
 */
export function describeFailure({ code = null, metaCode = null, message = null } = {}) {
  if (code && FAILURE_CAUSES[code]) {
    return { ...FAILURE_CAUSES[code], code, providerMessage: message || null };
  }
  if (metaCode !== null && metaCode !== undefined) {
    const n = Number(metaCode);
    const hit = Object.entries(FAILURE_CAUSES).find(([, c]) => c.metaCodes.includes(n));
    if (hit) return { ...hit[1], code: hit[0], providerMessage: message || null };
  }
  return {
    code: code || 'desconocido',
    title: 'Meta rechazó la operación',
    detail: message
      ? `El proveedor contestó: «${message}»${metaCode ? ` (código ${metaCode})` : ''}.`
      : 'No se recibió ningún detalle del proveedor.',
    fix: 'El texto de arriba es el de Meta, sin traducir: es lo que hay que buscar en su documentación.',
    metaCodes: [],
    providerMessage: message || null,
  };
}

/**
 * Juzga la salud de una conexión sobre hechos YA RECOGIDOS.
 *
 * Puro a propósito: quien habla con Meta es el controlador, y así el criterio
 * —qué cuenta como sano, qué como aviso— se prueba sin red.
 *
 * TRES estados y `unknown` NO es un tipo de «bien»: presentar «no se pudo
 * comprobar» como verde manda a buscar el problema donde no está. Es la regla
 * que el panel de diagnóstico del CRM ya aplica.
 */
export function diagnoseConnection(facts = {}) {
  const checks = [];
  const add = (key, label, state, detail, cause = null) =>
    checks.push({ key, label, state, detail, cause });

  // 1. Credenciales presentes — se comprueba sin salir a la red.
  if (facts.hasToken) add('credenciales', 'Credenciales guardadas', 'ok', 'Token de acceso presente.');
  else add('credenciales', 'Credenciales guardadas', 'fail', 'No hay token de acceso guardado.', FAILURE_CAUSES.token_expirado);

  // 2. Token válido — lo dice Meta.
  if (facts.tokenValid === true) add('token', 'Token aceptado por Meta', 'ok', facts.verifiedName ? `Meta respondió: ${facts.verifiedName}.` : 'Meta aceptó la credencial.');
  else if (facts.tokenValid === false) add('token', 'Token aceptado por Meta', 'fail', facts.tokenError || 'Meta rechazó la credencial.', describeFailure({ metaCode: facts.tokenMetaCode, message: facts.tokenError }));
  else add('token', 'Token aceptado por Meta', 'unknown', 'No se pudo preguntar a Meta.');

  // 3. El número pertenece a la WABA.
  if (facts.phoneMatchesWaba === true) add('numero', 'El número pertenece a esta cuenta', 'ok', facts.displayPhoneNumber ? `Número verificado: ${facts.displayPhoneNumber}.` : 'Coincide.');
  else if (facts.phoneMatchesWaba === false) add('numero', 'El número pertenece a esta cuenta', 'fail', 'El ID del número no aparece entre los de esta WABA.', FAILURE_CAUSES.numero_ajeno_a_la_waba);
  else add('numero', 'El número pertenece a esta cuenta', 'unknown', 'No se pudo listar los números de la cuenta.');

  // 4. Suscripción al webhook — la avería que se ve como «todo normal».
  if (facts.subscribed === true) add('suscripcion', 'Cuenta suscrita al webhook', 'ok', 'Meta entregará los eventos de esta cuenta.');
  else if (facts.subscribed === false) add('suscripcion', 'Cuenta suscrita al webhook', 'fail', 'La cuenta no figura suscrita a ninguna aplicación.', FAILURE_CAUSES.webhook_sin_suscripcion);
  else add('suscripcion', 'Cuenta suscrita al webhook', 'unknown', 'No se pudo consultar la suscripción (suele faltar el permiso de administración).');

  // 5. Último webhook recibido. Es una MEDIDA, no una opinión.
  if (facts.lastInboundAt) add('entrada', 'Último evento recibido', 'ok', `Se recibió algo por esta línea el ${facts.lastInboundAt}.`);
  else add('entrada', 'Último evento recibido', 'unknown', 'Todavía no llegó ningún evento por esta línea. En una conexión nueva es lo normal.');

  // 6. Último mensaje enviado.
  if (facts.lastOutboundAt) add('salida', 'Último mensaje enviado', 'ok', `El último salió el ${facts.lastOutboundAt}.`);
  else add('salida', 'Último mensaje enviado', 'unknown', 'Todavía no salió ningún mensaje por esta línea.');

  // 7. Último error.
  if (facts.lastError) add('error', 'Último error', 'warn', facts.lastError, describeFailure({ message: facts.lastError, metaCode: facts.lastErrorCode }));
  else add('error', 'Último error', 'ok', 'Sin errores registrados.');

  // 8. Agente.
  if (facts.agentSource === 'connection') add('agente', 'Agente asignado', 'ok', `Agente propio de esta línea: ${facts.agentName || 'sin nombre'}.`);
  else if (facts.agentSource === 'site') add('agente', 'Agente asignado', 'ok', `Hereda el agente del sitio: ${facts.agentName || 'sin nombre'}.`);
  else if (facts.agentSource === 'connection_disabled') add('agente', 'Agente asignado', 'warn', 'Esta línea tiene agente propio y está apagado, así que no hereda el del sitio.', FAILURE_CAUSES.sin_agente);
  else add('agente', 'Agente asignado', 'warn', 'Sin agente propio ni heredado.', FAILURE_CAUSES.sin_agente);

  // 9. Base de conocimiento — sólo si el agente la pide.
  if (facts.agentSource === 'none' || facts.agentSource === 'connection_disabled') {
    add('conocimiento', 'Base de conocimiento', 'unknown', 'No aplica: no hay agente que la consulte.');
  } else if (facts.useKnowledge === false) {
    add('conocimiento', 'Base de conocimiento', 'ok', 'El agente responde sin base de conocimiento, por configuración.');
  } else if (facts.knowledgeReady === true) {
    add('conocimiento', 'Base de conocimiento', 'ok', facts.knowledgeName ? `Consulta «${facts.knowledgeName}».` : 'Disponible.');
  } else if (facts.knowledgeReady === false) {
    add('conocimiento', 'Base de conocimiento', 'warn', 'El agente la tiene encendida y no se pudo resolver: responderá sin datos del sitio.');
  } else {
    add('conocimiento', 'Base de conocimiento', 'unknown', 'No se pudo comprobar.');
  }

  // 10. Estado de la automatización.
  const st = STATUSES[facts.status] || STATUSES[DEFAULT_STATUS];
  if (facts.status === 'active') add('automatizacion', 'Estado de la conexión', 'ok', st.help);
  else if (facts.status === 'error') add('automatizacion', 'Estado de la conexión', 'fail', st.help, describeFailure({ message: facts.lastError, metaCode: facts.lastErrorCode }));
  else add('automatizacion', 'Estado de la conexión', 'warn', st.help, facts.status === 'paused' ? FAILURE_CAUSES.cuenta_desactivada : null);

  const fails = checks.filter((c) => c.state === 'fail').length;
  const warns = checks.filter((c) => c.state === 'warn').length;
  const unknowns = checks.filter((c) => c.state === 'unknown').length;

  return {
    // El veredicto sigue al peor hallazgo. Pintar «sana» con un fallo debajo es
    // la contradicción que este proyecto ya prohibió dos veces.
    verdict: fails ? 'fail' : warns ? 'warn' : unknowns === checks.length ? 'unknown' : 'ok',
    checks,
    counts: { fail: fails, warn: warns, unknown: unknowns, ok: checks.length - fails - warns - unknowns },
  };
}

export default {
  STATUSES, STATUS_IDS, DEFAULT_STATUS,
  WEBHOOK_PROVIDERS, WEBHOOK_PROVIDER_IDS, DEFAULT_WEBHOOK_PROVIDER,
  EDITABLE_FIELDS, SCOPE_FIELDS,
  looksLikeMetaId, shapeConnection, validateConnection,
  publicConnection, maskToken,
  resolveConnection, resolveAgent, sendGuard,
  FAILURE_CAUSES, describeFailure, diagnoseConnection,
};
