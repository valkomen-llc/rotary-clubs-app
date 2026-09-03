// ════════════════════════════════════════════════════════════════════
// La base, en memoria — para probar el CAMINO del router multi-WABA.
// v4.992.0
//
// ⚠️ ESTE DOBLE NO IMPLEMENTA NINGUNA REGLA DEL MÓDULO.
//
// Un doble que reescribe en JavaScript la condición que la prueba dice
// comprobar no comprueba NADA: la aserción pasaría con el `WHERE` real borrado.
// Es la lección de v4.896, donde el doble de la base implementaba el candado
// del reclamo y quitar el `AND attempts = $2` del SQL real no hacía fallar
// nada — la comprobación era vacua y decía lo contrario.
//
// Por eso acá:
//
//   · Los ÍNDICES ÚNICOS se hacen cumplir LEYENDO las columnas del
//     `ON CONFLICT` que el módulo escribió. Si alguien quita `"connectionId"`
//     de la cláusula de `openConversation`, este doble vuelve a colapsar los
//     dos hilos en uno y la prueba del aislamiento falla, que es justo lo que
//     tiene que pasar.
//   · El filtrado de las consultas se hace por las columnas que el SQL
//     NOMBRA, no por lo que el módulo debería querer.
//
// LO QUE ESTE DOBLE NO DEMUESTRA es que el SQL sea válido para Postgres. Eso se
// comprueba al desplegar, y se dice para no afirmar de más.
// ════════════════════════════════════════════════════════════════════

export const tablas = {
  WhatsAppConnection: [],
  WhatsAppConnectionAgent: [],
  WhatsAppAgentConfig: [],
  WhatsAppConfig: [],
  WhatsAppContact: [],
  WhatsAppMessageLog: [],
  WhatsAppAutoReplyRule: [],
  CrmConversation: [],
  CrmConversationEvent: [],
  ContactChannel: [],
  CrmWebhookEvent: [],
  CrmOutboundLog: [],
  CrmSuppression: [],
  Club: [],
};

/** Todo lo que se ejecutó, para poder mirarlo desde la prueba. */
export const consultas = [];

export const reset = () => {
  for (const k of Object.keys(tablas)) tablas[k] = [];
  consultas.length = 0;
};

export const seed = (datos = {}) => {
  for (const [k, v] of Object.entries(datos)) {
    if (!(k in tablas)) throw new Error(`El doble no conoce la tabla ${k}`);
    tablas[k] = v.map((r) => ({ ...r }));
  }
};

const norm = (sql) => String(sql).replace(/\s+/g, ' ').trim();
const tabla = (sql) => {
  const m = norm(sql).match(/(?:FROM|INTO|UPDATE)\s+"(\w+)"/i);
  return m ? m[1] : null;
};

/**
 * Qué columnas nombra el WHERE, en orden, con el número de parámetro de cada
 * una. Se LEE del SQL: es lo que hace que quitar una condición del módulo
 * cambie lo que este doble devuelve.
 */
const condiciones = (sql) => {
  const where = norm(sql).split(/\bWHERE\b/i)[1];
  if (!where) return [];
  const corte = where.split(/\b(?:ORDER BY|LIMIT|RETURNING|GROUP BY)\b/i)[0];
  // ⚠️ LEE LOS IDENTIFICADORES CON Y SIN COMILLAS.
  //
  // La primera versión sólo miraba `"col"=$n` y el módulo escribe `id=$1` sin
  // comillas —`id` no necesita entrecomillarse en Postgres—, así que esa
  // condición se ignoraba y el filtrado quedaba DEMASIADO PERMISIVO: un
  // `UPDATE … WHERE id=$1 AND "clubId"=$2` tocaba todas las filas del sitio, y
  // `getConnection` de una conexión ajena devolvía la primera del sitio propio
  // en vez de nada. Un doble que lee de menos afirma cosas que el módulo no
  // hace: es la otra cara de la lección de v4.896.
  return [...corte.matchAll(/(?:"(\w+)"|\b([a-zA-Z_]\w*))\s*=\s*\$(\d+)/g)]
    .map((m) => ({ col: m[1] || m[2], p: Number(m[3]) }));
};

/** ¿El WHERE exige que una columna sea NULL? (p. ej. `"closedAt" IS NULL`) */
const exigeNulo = (sql, col) =>
  new RegExp(`"${col}"\\s+IS\\s+NULL`, 'i').test(norm(sql));

const filtrar = (filas, sql, params) => {
  const conds = condiciones(sql);
  return filas.filter((f) => conds.every((c) => {
    const esperado = params[c.p - 1];
    if (esperado === null || esperado === undefined) return true;
    return String(f[c.col] ?? '') === String(esperado);
  }));
};

/**
 * Las columnas del `ON CONFLICT (...)`. Es lo que hace cumplir el índice único.
 *
 * Si el módulo deja de nombrar `"connectionId"` acá, dos líneas vuelven a
 * compartir hilo y la prueba del aislamiento falla.
 */
const columnasDelConflicto = (sql) => {
  const m = norm(sql).match(/ON CONFLICT\s*\(([^)]*)\)/i);
  if (!m) return null;
  return [...m[1].matchAll(/"?(\w+)"?/g)].map((x) => x[1]).filter((x) => x.length > 1);
};

/** Los valores de un INSERT, mapeados por su nombre de columna. */
const filaDelInsert = (sql, params) => {
  const q = norm(sql);
  const cols = [...(q.match(/INTO\s+"\w+"\s*\(([^)]*)\)/i)?.[1] || '').matchAll(/"?(\w+)"?/g)]
    .map((m) => m[1]).filter(Boolean);
  const vals = [...(q.match(/VALUES\s*\(([^)]*)\)/i)?.[1] || '').split(',')].map((v) => v.trim());
  const fila = {};
  cols.forEach((col, i) => {
    const v = vals[i];
    if (v === undefined) return;
    const pm = v.match(/^\$(\d+)$/);
    if (pm) fila[col] = params[Number(pm[1]) - 1];
    else if (/^NOW\(\)|CURRENT_TIMESTAMP$/i.test(v)) fila[col] = new Date().toISOString();
    else if (/^'(.*)'$/.test(v)) fila[col] = v.slice(1, -1);
    else if (/^(true|false)$/i.test(v)) fila[col] = v.toLowerCase() === 'true';
    else if (/^NULL$/i.test(v)) fila[col] = null;
    else fila[col] = v;
  });
  return fila;
};

const query = async (sql, params = []) => {
  const q = norm(sql);
  consultas.push({ sql: q, params });

  // ── El atajo de los ensure: se contesta que todo existe ya, para que el
  //    DDL no corra. Lo que el DDL crea lo comprueba `test:whatsapp:connections`
  //    leyendo el archivo; acá interesa el CAMINO.
  if (/information_schema\.tables/i.test(q)) {
    return { rows: (params[0] || []).map((t) => ({ table_name: t })) };
  }
  if (/information_schema\.columns/i.test(q)) {
    const pares = [
      ['WhatsAppMessageLog', 'connectionId'], ['CrmConversation', 'connectionId'],
      ['WhatsAppContact', 'siteId'], ['WhatsAppContact', 'siteType'],
      ['WhatsAppContact', 'orgRole'], ['WhatsAppContact', 'language'],
      ['WhatsAppContact', 'consentState'], ['WhatsAppContact', 'consentSource'],
      ['WhatsAppContact', 'consentAt'], ['WhatsAppContact', 'consentCategories'],
      ['WhatsAppContact', 'lastInboundAt'], ['WhatsAppMessageLog', 'journeyId'],
      ['WhatsAppMessageLog', 'journeyRunId'], ['WhatsAppCampaign', 'listIds'],
      ['WhatsAppTemplate', 'folder'], ['WhatsAppTemplate', 'variableTokens'],
      ['WhatsAppTemplate', 'variableSamples'], ['WhatsAppTemplate', 'rejectionReason'],
      ['WhatsAppTemplate', 'submittedAt'],
    ];
    return { rows: pares.map(([t, c]) => ({ table_name: t, column_name: c })) };
  }
  if (/^(CREATE|ALTER|DROP|DO |BEGIN|COMMIT)/i.test(q)) return { rows: [] };

  const t = tabla(q);
  if (!t || !(t in tablas)) return { rows: [] };
  const filas = tablas[t];

  // ── INSERT ──────────────────────────────────────────────────────────
  if (/^INSERT/i.test(q)) {
    const nueva = filaDelInsert(q, params);
    const claves = columnasDelConflicto(q);

    // El índice único, hecho cumplir con las columnas que el SQL nombra.
    if (claves) {
      const parcial = exigeNulo(q, 'closedAt');
      const choca = filas.find((f) =>
        claves.every((c) => String(f[c] ?? '') === String(nueva[c] ?? '')) &&
        (!parcial || (f.closedAt === null || f.closedAt === undefined))
      );
      if (choca) {
        if (/DO UPDATE/i.test(q)) {
          Object.assign(choca, { ...nueva, id: choca.id });
          return { rows: /RETURNING/i.test(q) ? [{ ...choca }] : [] };
        }
        return { rows: [] };   // DO NOTHING
      }
    }
    // `ON CONFLICT DO NOTHING` sin columnas: la clave primaria.
    if (!claves && /ON CONFLICT DO NOTHING/i.test(q) && filas.some((f) => f.id === nueva.id)) {
      return { rows: [] };
    }

    filas.push(nueva);
    return { rows: /RETURNING/i.test(q) ? [{ ...nueva }] : [] };
  }

  // ── UPDATE ──────────────────────────────────────────────────────────
  if (/^UPDATE/i.test(q)) {
    const objetivo = filtrar(filas, q, params);
    const sets = q.split(/\bSET\b/i)[1]?.split(/\bWHERE\b/i)[0] || '';
    for (const f of objetivo) {
      for (const m of sets.matchAll(/(?:"(\w+)"|\b([a-zA-Z_]\w*))\s*=\s*\$(\d+)/g)) {
        f[m[1] || m[2]] = params[Number(m[3]) - 1];
      }
      for (const m of sets.matchAll(/"(\w+)"\s*=\s*(NOW\(\)|true|false|NULL)/gi)) {
        f[m[1]] = /NOW/i.test(m[2]) ? new Date().toISOString()
          : /NULL/i.test(m[2]) ? null : m[2].toLowerCase() === 'true';
      }
      // `col = col + 1`
      for (const m of sets.matchAll(/"(\w+)"\s*=\s*"?\w+"?\s*\+\s*1/g)) {
        f[m[1]] = Number(f[m[1]] || 0) + 1;
      }
      // `col = CASE WHEN … THEN 'x' ELSE col END` — se deja el valor actual: el
      // doble no interpreta CASE, y afirmar un resultado sería inventarlo.
    }
    return { rows: /RETURNING/i.test(q) ? objetivo.map((f) => ({ ...f })) : [] };
  }

  // ── DELETE ──────────────────────────────────────────────────────────
  if (/^DELETE/i.test(q)) {
    const fuera = filtrar(filas, q, params);
    tablas[t] = filas.filter((f) => !fuera.includes(f));
    return { rows: [] };
  }

  // ── SELECT ──────────────────────────────────────────────────────────
  let rows = filtrar(filas, q, params);

  // El OR de la resolución: `($1 IS NOT NULL AND "phoneNumberId"=$1) OR
  // ($2 IS NOT NULL AND "wabaId"=$2)`. `filtrar` lo trataría como un AND, así
  // que se atiende leyendo las columnas que el SQL nombra.
  if (/\bOR\b/i.test(q.split(/\bWHERE\b/i)[1] || '')) {
    const conds = condiciones(q);
    rows = filas.filter((f) => conds.some((c) => {
      const esperado = params[c.p - 1];
      if (esperado === null || esperado === undefined) return false;
      return String(f[c.col] ?? '') === String(esperado);
    }));
  }

  if (exigeNulo(q, 'closedAt')) rows = rows.filter((f) => f.closedAt === null || f.closedAt === undefined);
  if (/"isDefault"(?!\s*=)/.test(q) && /WHERE[\s\S]*"isDefault"\s*(?:AND|$|LIMIT|ORDER)/i.test(q)) {
    rows = rows.filter((f) => f.isDefault === true);
  }
  if (/direction\s*=\s*'incoming'/i.test(q)) rows = rows.filter((f) => f.direction === 'incoming');
  if (/direction\s*=\s*'outgoing'/i.test(q)) rows = rows.filter((f) => f.direction === 'outgoing');
  if (/active\s*=\s*true/i.test(q)) rows = rows.filter((f) => f.active === true);

  if (/ORDER BY .*"lastVerifiedAt" DESC/i.test(q)) {
    rows = [...rows].sort((a, b) =>
      new Date(b.lastVerifiedAt || 0) - new Date(a.lastVerifiedAt || 0) || String(a.id).localeCompare(String(b.id)));
  }
  const lim = q.match(/LIMIT\s+(\d+)/i);
  if (lim) rows = rows.slice(0, Number(lim[1]));

  // `SELECT 1 …` sólo necesita saber si hay algo.
  if (/^SELECT\s+1\b/i.test(q)) return { rows: rows.map(() => ({ '?column?': 1 })) };

  return { rows: rows.map((f) => ({ ...f })) };
};

export default { query, tablas, consultas, reset, seed };
export { query };
