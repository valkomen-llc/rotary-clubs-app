// El CRITERIO del aislamiento por cuenta de WhatsApp. **Puro**: sin base, sin
// red, sin Meta, sin DOM.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUÉ EXISTE ESTE ARCHIVO Y NO UNA COLUMNA MÁS
// ═══════════════════════════════════════════════════════════════════════════
//
// v4.992 abrió el módulo a varias líneas y resolvió la mitad que más duele: el
// webhook encamina por `phone_number_id`, la conversación guarda su
// `connectionId` y `sendWhatsAppTextMessage` EXIGE la conexión en vez de
// deducirla. Lo que quedó fuera son las tres entidades que no nacen de un
// entrante —la PLANTILLA, la CAMPAÑA y el AGENTE—, y ahí el defecto es el mismo
// de siempre por la otra puerta: `getClubConfig(clubId)` devuelve la fila
// heredada de `WhatsAppConfig`, así que una campaña de la Feria de Proyectos
// sale por el número del Distrito. Para quien la recibe, es otra organización
// escribiéndole.
//
// El criterio vive aparte por la misma razón que `seoRules.js` vive aparte de
// `seoAudit.js`: un motor de aislamiento que sólo se ejercita contra una base
// real termina sin pruebas, y entonces nadie se entera de que una regla cambió
// de signo. Acá se puede preguntar «¿esta plantilla es de esta línea?» sin
// Postgres, sin token y sin red.
//
// ═══════════════════════════════════════════════════════════════════════════
// LAS CINCO REGLAS QUE SOSTIENEN EL AISLAMIENTO
// ═══════════════════════════════════════════════════════════════════════════
//
// 1. `connectionId` NULL ES «NO SE SABE», NUNCA «LA PRINCIPAL». Son dos
//    preguntas opuestas contestadas con un solo campo, que es la forma exacta
//    del defecto de v4.1009 (`excluded` significando a la vez «no sirve de
//    portada» y «no se publica»). Una fila heredada no declara línea porque
//    nadie se la escribió: rellenarla con la principal sería AFIRMAR que esa
//    plantilla vive en esa WABA, y si no vive, Meta rechaza el envío contacto
//    por contacto. Lo que no se sabe se DICE (`unassigned`) y se manda a
//    revisión, como pide el punto 11 del encargo.
//
// 2. UNA PLANTILLA SE IDENTIFICA POR (WABA, NOMBRE, IDIOMA), NO POR NOMBRE.
//    Es la trampa que este módulo tiene delante ahora mismo: el Distrito y la
//    Feria de Proyectos pueden tener las dos una plantilla `renovacion_26_27`,
//    y son plantillas DISTINTAS con su propio id de Meta y su propio estado de
//    revisión. Deduplicar por nombre —que es lo que hace hoy `saveTemplate` al
//    comprobar el choque— fundiría las dos y la segunda sincronización pisaría
//    a la primera. El `metaTemplateId` es único en Meta y es la llave fuerte;
//    la terna es la llave natural para lo que todavía no lo tiene.
//
// 3. LA CAMPAÑA PERSISTE SU EMISORA Y EL ENVÍO NO MIRA LA PANTALLA. Es el
//    punto 3 del encargo y la única forma de cumplirlo: si el envío leyera la
//    cuenta «activa» del panel, la misma campaña saldría por un número distinto
//    según quién pulse enviar y cuándo. La cuenta se congela al crear —como el
//    precio de una inscripción se congela al enviar el formulario (v4.648)— y
//    el envío la lee de la fila.
//
// 4. «PRINCIPAL» ES UN VALOR POR DEFECTO, NO UN RESPALDO. Sirve para que una
//    pantalla abra en alguna cuenta y para el camino heredado que todavía no
//    declara línea. NUNCA para completar la línea de una entidad que SÍ declara
//    la suya: eso convertiría «esta campaña es de la Feria» en «esta campaña
//    salió por donde estuviera marcado principal ese día».
//
// 5. UN FALLO DE UNA CUENTA NO ALCANZA A LAS DEMÁS. Cada resolución devuelve su
//    motivo y su salida (`blockedReason` / `fix`), y quien orquesta atiende las
//    cuentas de a una. Un token vencido en el Distrito deja al Distrito sin
//    responder y no toca a la Feria — es el punto 9, y se sostiene porque la
//    credencial se abre POR CONEXIÓN en el momento de usarla.

// ── Cómo se scopea cada entidad ────────────────────────────────────────────
//
// Catálogo CERRADO. Una entidad que no esté acá no se puede acotar, y eso es a
// propósito: el día que aparezca una cuarta —una lista de difusión propia de la
// línea, un horario de atención— entra como una fila más y el resto del motor
// no cambia. Es lo que pide el punto 12 del encargo: una tercera cuenta no debe
// exigir tocar la arquitectura otra vez.

export const SCOPED_ENTITIES = {
  template: {
    label: 'Plantilla',
    table: 'WhatsAppTemplate',
    // Las plantillas viven en la WABA, no en el número: dos líneas de la MISMA
    // WABA comparten su catálogo, y por eso la identidad lleva `wabaId` además
    // de la conexión. Sincronizar desde cualquiera de las dos trae lo mismo.
    identity: 'waba',
  },
  campaign: {
    label: 'Campaña',
    table: 'WhatsAppCampaign',
    // Una campaña SALE por un número concreto: su identidad es la conexión, no
    // la WABA. Dos líneas de la misma WABA son dos remitentes distintos para
    // quien recibe el mensaje.
    identity: 'connection',
  },
  conversation: {
    label: 'Conversación',
    table: 'CrmConversation',
    identity: 'connection',
  },
};

export const SCOPED_ENTITY_IDS = Object.keys(SCOPED_ENTITIES);

/**
 * Por qué una entidad no se puede usar con una línea. Catálogo CERRADO: un
 * motivo inventado no se puede reportar ni traducir, y —lo que importa— no
 * tiene SALIDA escrita. Un bloqueo cuya única respuesta es «no se puede» se lee
 * como una avería y se reporta como tal (v4.1008).
 */
export const BLOCKERS = {
  no_connection: {
    label: 'Sin cuenta de WhatsApp',
    fix: 'Conecta una cuenta en Configuración → Cuentas de WhatsApp conectadas.',
  },
  connection_missing: {
    label: 'La cuenta ya no existe',
    fix: 'La línea se desconectó. Elige otra cuenta para esta operación.',
  },
  connection_foreign: {
    label: 'La cuenta es de otro sitio',
    fix: 'Elige una de las cuentas de este sitio.',
  },
  connection_cannot_send: {
    label: 'La cuenta no puede enviar',
    fix: 'Revisa el diagnóstico de esa conexión: puede estar pausada, con el token vencido o sin verificar.',
  },
  no_token: {
    label: 'La cuenta no tiene un token utilizable',
    fix: 'Vuelve a guardar el token de esa conexión en Configuración.',
  },
  template_foreign: {
    label: 'La plantilla es de otra cuenta',
    fix: 'Elige una plantilla de la misma cuenta desde la que vas a enviar, o sincronízala desde Meta con esa cuenta seleccionada.',
  },
  template_unassigned: {
    label: 'La plantilla no tiene cuenta asignada',
    fix: 'Sincroniza desde Meta con la cuenta correcta seleccionada para que la plantilla quede asociada a su WABA.',
  },
};

export const BLOCKER_IDS = Object.keys(BLOCKERS);

/** El bloqueo con su rótulo y su salida, listo para pintar. Nunca a secas. */
export function describeBlocker(code, detail = null) {
  const spec = BLOCKERS[code];
  if (!spec) {
    // Un código que no reconocemos no se disfraza de uno conocido (regla del
    // catálogo cerrado de estados de v4.1056): se dice tal cual.
    return { code: code || 'unknown', label: detail || 'No se puede usar esta cuenta', fix: null };
  }
  return { code, label: spec.label, fix: spec.fix, detail: detail || null };
}

// ── Cuál es la cuenta activa ───────────────────────────────────────────────

const str = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

/**
 * Qué cuenta se está mirando, y POR QUÉ ésa.
 *
 * El orden no es negociable y es el mismo de `resolveArticleSite` (v4.1006): lo
 * que la ENTIDAD declara manda sobre lo que pida la pantalla, y lo que pida la
 * pantalla manda sobre el valor por defecto. Al revés, abrir una campaña de la
 * Feria con el Distrito seleccionado la mostraría —y la enviaría— como del
 * Distrito.
 *
 * `source` viaja SIEMPRE: sin él, «¿por qué esta campaña salió por este número?»
 * no se puede contestar dos semanas después, que es el vacío que el CRM ya pagó
 * una vez antes de `CrmWebhookEvent` (v4.702).
 *
 * @param {object} p
 * @param {string|null} p.entityConnectionId Lo que la entidad ya declara.
 * @param {string|null} p.requested          Lo que pide la pantalla.
 * @param {Array}       p.connections        Las conexiones del sitio.
 * @returns {{connection: object|null, source: string, requestedMissing: boolean}}
 */
export function resolveActiveConnection({
  entityConnectionId = null,
  requested = null,
  connections = [],
} = {}) {
  const list = Array.isArray(connections) ? connections.filter(Boolean) : [];
  const byId = (id) => (id ? list.find((c) => str(c.id) === str(id)) || null : null);

  const declared = byId(entityConnectionId);
  if (declared) return { connection: declared, source: 'entidad', requestedMissing: false };

  // Declarada y ausente: la entidad SÍ dice de qué línea es y esa línea ya no
  // está. No se cae a la principal —sería atribuirle a otra cuenta el trabajo
  // de una desconectada—: se dice que falta.
  if (str(entityConnectionId)) {
    return { connection: null, source: 'entidad_ausente', requestedMissing: false };
  }

  const asked = byId(requested);
  if (asked) return { connection: asked, source: 'seleccion', requestedMissing: false };
  // Pidieron una cuenta que no está en el alcance: NO se sustituye en silencio
  // por la principal. Sustituirla mostraría los datos de otra cuenta bajo el
  // rótulo de la pedida, que es contaminación con otro nombre.
  if (str(requested)) {
    return { connection: null, source: 'seleccion_invalida', requestedMissing: true };
  }

  const principal = list.find((c) => c.isDefault) || null;
  if (principal) return { connection: principal, source: 'principal', requestedMissing: false };

  // Sin principal marcada, la única del sitio. Con varias y ninguna marcada no
  // se elige por orden de la base: sería servir una cuenta distinta en dos
  // visitas del mismo panel (la lección de `pickDistrictSite`, v4.744).
  if (list.length === 1) return { connection: list[0], source: 'unica', requestedMissing: false };

  return { connection: null, source: 'sin_cuenta', requestedMissing: false };
}

/**
 * Lo que la pantalla escribe encima de la sección: «Configurando: Feria de
 * Proyectos Rotary Colombia · +57 321 6937317».
 *
 * Es el punto 10 del encargo y vive acá —no suelto en el JSX— porque lo pintan
 * cinco pantallas: escrito cinco veces se separa en silencio, que es lo que ya
 * costó la casilla de distritos (v4.748).
 */
export function describeConnection(connection) {
  if (!connection) return null;
  const nombre = str(connection.displayName) || 'Cuenta sin nombre';
  const tel = str(connection.phoneNumber);
  return {
    id: connection.id,
    label: tel ? `${nombre} · ${tel}` : nombre,
    name: nombre,
    phone: tel || null,
    wabaId: connection.wabaId || null,
    phoneNumberId: connection.phoneNumberId || null,
    status: connection.status || null,
    isDefault: !!connection.isDefault,
  };
}

// ── Identidad de una plantilla ─────────────────────────────────────────────

/**
 * La llave natural de una plantilla: WABA + nombre + idioma.
 *
 * ⚠️ NO es el nombre. Meta permite el mismo `name` en dos WABAs distintas y son
 * plantillas distintas —distinto id, distinto estado de revisión, distinto
 * cuerpo—. Con la llave por nombre, sincronizar la Feria pisaría la plantilla
 * homónima del Distrito y la campaña del Distrito pasaría a mandar el texto de
 * la Feria, sin ningún error.
 *
 * El idioma entra porque una misma plantilla existe por idioma en Meta y cada
 * versión se aprueba por separado.
 */
export function templateIdentity(row = {}) {
  const waba = str(row.wabaId);
  const name = str(row.name).toLowerCase();
  const lang = str(row.language).toLowerCase() || 'es';
  if (!name) return null;
  return `${waba || 'sin-waba'}::${name}::${lang}`;
}

/**
 * Si dos filas de plantilla son la MISMA plantilla.
 *
 * El `metaTemplateId` manda cuando los dos lo tienen: es único en Meta y no
 * depende de cómo hayamos normalizado nada. La terna es el respaldo para lo que
 * todavía no se sincronizó.
 */
export function sameTemplate(a = {}, b = {}) {
  const ida = str(a.metaTemplateId);
  const idb = str(b.metaTemplateId);
  if (ida && idb) return ida === idb;
  const ka = templateIdentity(a);
  const kb = templateIdentity(b);
  return !!ka && ka === kb;
}

// ── Qué ve una cuenta ──────────────────────────────────────────────────────

/**
 * Si una fila le corresponde a una conexión.
 *
 * `includeUnassigned` existe para las filas heredadas: lo que no declara línea
 * se le muestra a la PRINCIPAL —que es de donde con toda probabilidad salió, ya
 * que hasta v4.992 había una sola— y se marca. A una cuenta que no es la
 * principal NO se le muestra: atribuirle plantillas de otra WABA es justo la
 * contaminación que este módulo existe para impedir.
 */
export function belongsToConnection(row, connection, { includeUnassigned = false } = {}) {
  if (!connection) return false;
  const rowConn = str(row?.connectionId);
  if (rowConn) return rowConn === str(connection.id);

  // Sin línea declarada: sólo la comparación por WABA puede resolverlo, y sólo
  // cuando la fila la trae.
  const rowWaba = str(row?.wabaId);
  if (rowWaba) return rowWaba === str(connection.wabaId);

  return includeUnassigned;
}

/**
 * Cómo se clasifica una fila respecto de la cuenta que se está mirando. Es lo
 * que la pantalla pinta como insignia.
 */
export function rowScope(row, connection) {
  const rowConn = str(row?.connectionId);
  const rowWaba = str(row?.wabaId);
  if (!rowConn && !rowWaba) return 'sin_asignar';
  if (!connection) return 'otra_cuenta';
  if (rowConn && rowConn === str(connection.id)) return 'propia';
  if (rowWaba && rowWaba === str(connection.wabaId)) return 'misma_waba';
  return 'otra_cuenta';
}

// ── Puerta de envío ────────────────────────────────────────────────────────

/**
 * Si una campaña puede salir por una conexión, con esta plantilla.
 *
 * Es la puerta que hace verdadero el punto 3 del encargo, y va en el SERVIDOR:
 * esconder el botón no protege un endpoint de quien lo conoce (v4.868).
 *
 * `canSend` lo decide la conexión —`sendGuard` de `whatsappConnections.js`— y
 * acá sólo se recibe ya resuelto: dos criterios sobre si una línea puede enviar
 * se separarían, y lo que se separaría es si un mensaje sale o no.
 *
 * ⚠️ UNA PLANTILLA SIN CUENTA ASIGNADA NO BLOQUEA EL ENVÍO DESDE LA PRINCIPAL,
 * y es deliberado: hasta hoy TODAS las plantillas son así y todas las campañas
 * que funcionan salen por esa línea. Bloquearlas sería romper lo que hoy anda
 * para corregir un dato que la migración perezosa resuelve sola. Desde
 * cualquier OTRA cuenta sí bloquea: ahí no sabemos si la plantilla existe en esa
 * WABA, y descubrirlo sería un rechazo de Meta por cada contacto.
 */
export function canCampaignSend({
  connection = null,
  connectionExists = true,
  canSend = false,
  canSendReason = null,
  hasToken = false,
  template = null,
} = {}) {
  if (!connection) {
    return {
      ok: false,
      ...describeBlocker(connectionExists ? 'no_connection' : 'connection_missing'),
    };
  }
  if (!canSend) return { ok: false, ...describeBlocker('connection_cannot_send', canSendReason) };
  if (!hasToken) return { ok: false, ...describeBlocker('no_token') };

  if (template) {
    const scope = rowScope(template, connection);
    if (scope === 'otra_cuenta') return { ok: false, ...describeBlocker('template_foreign') };
    if (scope === 'sin_asignar' && !connection.isDefault) {
      return { ok: false, ...describeBlocker('template_unassigned') };
    }
  }
  return { ok: true, code: null, label: null, fix: null };
}

// ── Migración perezosa ─────────────────────────────────────────────────────

/**
 * A qué conexión pertenece una fila heredada, MIRANDO, no adivinando.
 *
 * Es el punto 11 del encargo: «si no puede determinarse con seguridad, no
 * inventes la asociación». La única señal segura es la WABA —o el id de Meta de
 * la plantilla, que sólo existe dentro de una WABA—; el resto son conjeturas.
 *
 * Y ocurre AL LEER, no en un script de despliegue: un despliegue no escribe en
 * la base (regla durable desde el 2026-07-13). Mismo patrón que
 * `migrateFromLegacyConfig` (v4.992) y los grupos de distribución (v4.876).
 *
 * @returns {{connectionId: string|null, wabaId: string|null, reason: string}}
 */
export function attributeLegacyRow(row, { connections = [], legacyWabaId = null } = {}) {
  const list = Array.isArray(connections) ? connections.filter(Boolean) : [];

  // Ya resuelta: no se pisa. Otro administrador pudo atarla a propósito.
  if (str(row?.connectionId)) {
    return { connectionId: str(row.connectionId), wabaId: str(row?.wabaId) || null, reason: 'ya_asignada' };
  }

  // La fila trae su WABA (viene de una sincronización) y hay una conexión con
  // esa WABA: es la misma cuenta, sin lugar a duda.
  const rowWaba = str(row?.wabaId);
  if (rowWaba) {
    const match = list.find((c) => str(c.wabaId) === rowWaba);
    if (match) return { connectionId: match.id, wabaId: rowWaba, reason: 'waba_coincide' };
    return { connectionId: null, wabaId: rowWaba, reason: 'waba_desconocida' };
  }

  // Sin WABA propia. Lo que había hasta v4.991 era UNA línea —la de
  // `WhatsAppConfig`—, así que una fila anterior salió de ahí. Se atribuye sólo
  // si esa WABA heredada casa con exactamente UNA conexión.
  const legacy = str(legacyWabaId);
  if (legacy) {
    const iguales = list.filter((c) => str(c.wabaId) === legacy);
    if (iguales.length === 1) {
      return { connectionId: iguales[0].id, wabaId: legacy, reason: 'linea_heredada' };
    }
    if (iguales.length > 1) {
      return { connectionId: null, wabaId: null, reason: 'ambigua' };
    }
  }

  // Una sola conexión en el sitio: no hay otra de dónde pueda venir.
  if (list.length === 1) {
    return { connectionId: list[0].id, wabaId: str(list[0].wabaId) || null, reason: 'unica_cuenta' };
  }

  // Varias cuentas y ninguna señal. NO se adivina — se manda a revisión.
  return { connectionId: null, wabaId: null, reason: 'sin_senal' };
}

/** Si una atribución alcanza para escribirla en la base. */
export function attributionIsSafe(reason) {
  return ['waba_coincide', 'linea_heredada', 'unica_cuenta'].includes(reason);
}

/**
 * El resumen de una migración, para que la pantalla diga qué quedó sin resolver
 * en vez de dejar filas mudas. Un descarte silencioso deja al administrador
 * mirando una lista sin saber qué falta (la regla de `skipped`).
 */
export function summarizeAttribution(results = []) {
  const porMotivo = {};
  let asignadas = 0;
  let pendientes = 0;
  for (const r of results) {
    const motivo = r?.reason || 'sin_senal';
    porMotivo[motivo] = (porMotivo[motivo] || 0) + 1;
    if (r?.connectionId) asignadas += 1;
    else pendientes += 1;
  }
  return { total: results.length, asignadas, pendientes, porMotivo };
}
