// ════════════════════════════════════════════════════════════════════
// FDD y FAP en el listado de proyectos postulados — v4.1304.0
//
// Pedido del comité (XII Feria, Valledupar 2027): ver en el listado lo que
// cada club pide al Distrito sin abrir proyecto por proyecto.
//
// ⚠️ NO HAY CAMPO NUEVO. Los dos valores son los que el club ya escribe en
// la «Solicitud de Aportes del FDD 2026-2027», paso «Solicitud del FDD»:
//
//   tabla   "ProjectFairProjectForm"   (una fila por proyecto y formulario,
//                                       índice único ("submissionId","formKey"))
//   formKey 'fdd_2026_2027'            (FDD_FORM_KEY)
//   FDD     answers.fdd.requestedUsd   «Cantidad solicitada al Distrito del FDD 2026-2027 (US$)»
//   FAP     answers.fdd.fapGoalUsd     «Meta de aportes al FAP 2026-2027 (US$)»
//
// Cada fila de "ProjectFairSubmission" es UN proyecto (v4.1299), y el
// formulario cuelga de su `id`: un club con dos proyectos tiene dos filas FDD
// y cada fila del listado lee SÓLO la suya.
//
// ⚠️ UNA SOLA LECTURA: la expresión SQL de este archivo. La misma sirve para
// mostrar, ordenar, filtrar por rango y exportar, así que lo que se ve, el
// orden y la exportación no pueden discrepar. No hay un segundo parser en el
// navegador. Nada aquí ESCRIBE: lo guardado por el club no se toca.
//
// Cómo se lee un valor guardado (texto de un <input type="number">, casi
// siempre «5000» o «5000.5»), en este orden:
//   vacío / ausente / sin formulario         → null      («—»)
//   «0»                                      → 0         («USD 0»)
//   entero                                   → tal cual
//   «5.000» · «5,000» · «1.234.567»          → miles     (un importe en USD no
//                                                         lleva tres decimales)
//   «5000.5» · «.5»                          → decimal con punto
//   «5000,5»                                 → decimal con coma
//   «5,000.50» · «5.000,50»                  → miles + decimales
//   «1e3»                                    → notación que `Number()` aceptó
//   «US$», «USD», «$» y espacios se ignoran.
//   Cualquier otra cosa (negativos, letras)  → null, y se marca «ilegible».
// Los tramos de dígitos están acotados (15 enteros, 6 decimales, exponente de
// 2 cifras): ningún texto guardado puede hacer fallar la consulta del listado.
// ════════════════════════════════════════════════════════════════════
import { FDD_FORM_KEY } from './projectFairFddForm.js';

/** Dónde vive cada valor dentro de las respuestas del formulario FDD. */
export const FDD_LIST_FIELDS = {
    fdd: {
        section: 'fdd', field: 'requestedUsd', column: 'fddRequestedUsd', rawColumn: 'fddRequestedRaw',
        header: 'FDD',
        description: 'Cantidad solicitada al Distrito del Fondo Distrital Designado para el periodo 2026-2027 (USD).',
    },
    fap: {
        section: 'fdd', field: 'fapGoalUsd', column: 'fapGoalUsd', rawColumn: 'fapGoalRaw',
        header: 'FAP',
        description: 'Meta de aportes al Fondo Anual de Programas para el periodo 2026-2027 (USD).',
    },
};

// Identificadores literales: sólo letras (nunca vienen del usuario).
const ident = (s) => {
    if (!/^[A-Za-z_]+$/.test(s)) throw new Error(`Identificador inválido: ${s}`);
    return s;
};
const formKeyLiteral = () => {
    if (!/^[a-z0-9_]+$/.test(FDD_FORM_KEY)) throw new Error('FDD_FORM_KEY inválida');
    return FDD_FORM_KEY;
};

/**
 * El texto guardado por el club para un valor, leído de la fila FDD del
 * MISMO proyecto. Va calificado con la tabla externa, así funciona dentro de
 * `buildFilters` (consultas sin alias) y en el listado.
 */
export const sqlRawAmount = (key) => {
    const f = FDD_LIST_FIELDS[key];
    if (!f) throw new Error(`Valor desconocido: ${key}`);
    return `(SELECT ff.answers->'${ident(f.section)}'->>'${ident(f.field)}'
              FROM "ProjectFairProjectForm" ff
             WHERE ff."submissionId" = "ProjectFairSubmission".id AND ff."formKey" = '${formKeyLiteral()}'
             LIMIT 1)`;
};

/**
 * Convierte una expresión de texto en el importe numérico (o NULL), con las
 * reglas de la cabecera. El texto se evalúa UNA vez (subconsulta `n`).
 */
export const sqlUsdAmount = (textExpr) => `(SELECT CASE
        WHEN n.c ~ '^[0-9]{1,15}$' THEN n.c::numeric
        WHEN n.c ~ '^[0-9]{1,3}([.][0-9]{3}){1,4}$' THEN replace(n.c, '.', '')::numeric
        WHEN n.c ~ '^[0-9]{1,3}(,[0-9]{3}){1,4}$' THEN replace(n.c, ',', '')::numeric
        WHEN n.c ~ '^[0-9]{0,15}[.][0-9]{1,6}$' THEN n.c::numeric
        WHEN n.c ~ '^[0-9]{1,15},[0-9]{1,2}$' THEN replace(n.c, ',', '.')::numeric
        WHEN n.c ~ '^[0-9]{1,3}(,[0-9]{3}){1,4}[.][0-9]{1,2}$' THEN replace(n.c, ',', '')::numeric
        WHEN n.c ~ '^[0-9]{1,3}([.][0-9]{3}){1,4},[0-9]{1,2}$' THEN replace(replace(n.c, '.', ''), ',', '.')::numeric
        WHEN n.c ~ '^[0-9]{1,15}([.][0-9]{1,6})?[eE][+]?[0-9]{1,2}$' THEN n.c::numeric
        ELSE NULL END
      FROM (SELECT regexp_replace(upper(COALESCE(${textExpr}, '')), '(US[$]|U[$]S|USD|[$]|[[:space:]])', '', 'g') AS c) n)`;

/** El importe de un valor del proyecto: lo que se muestra, se ordena y se exporta. */
export const sqlAmount = (key) => sqlUsdAmount(sqlRawAmount(key));

/** Columnas que el listado y la exportación agregan a `SELECT *`. */
export const SQL_FDD_COLUMNS = Object.entries(FDD_LIST_FIELDS)
    .map(([key, f]) => `${sqlRawAmount(key)} AS "${f.rawColumn}", ${sqlAmount(key)} AS "${f.column}"`)
    .join(',\n       ');

/** Orden por columna: el alias de la salida (la expresión ya está en el SELECT). */
export const FDD_SORTABLE = {
    fddRequestedUsd: '"fddRequestedUsd"',
    fapGoalUsd: '"fapGoalUsd"',
};

/** Filtros por rango: `fddMin`, `fddMax`, `fapMin`, `fapMax` (USD). */
export const FDD_RANGE_FILTERS = [
    { param: 'fddMin', key: 'fdd', op: '>=' },
    { param: 'fddMax', key: 'fdd', op: '<=' },
    { param: 'fapMin', key: 'fap', op: '>=' },
    { param: 'fapMax', key: 'fap', op: '<=' },
];

/** Un límite de rango del panel: número finito ≥ 0, o nada (no filtra). */
export const rangeBound = (v) => {
    if (v === undefined || v === null) return null;
    const text = String(v).trim();
    if (!text || !/^[0-9]{1,15}([.][0-9]{1,6})?$/.test(text)) return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
};

/**
 * Cómo se leyó lo que escribió el club:
 *   'empty'       no hay valor (o no hay formulario)
 *   'ok'          escrito como lo deja el campo del formulario
 *   'normalized'  otro formato (miles, coma decimal, «US$»…): se interpretó
 *   'unreadable'  no es un importe (negativo, texto): no se inventa nada
 */
export const amountReading = (raw, value) => {
    const text = raw === null || raw === undefined ? '' : String(raw).trim();
    if (!text) return 'empty';
    if (value === null || value === undefined) return 'unreadable';
    if (/^[0-9]{1,15}([.][0-9]{1,2})?$/.test(text) && Number(text) === Number(value)) return 'ok';
    return 'normalized';
};

/**
 * Los campos que viajan con cada fila del listado. Sólo si la consulta los
 * trajo (otras consultas usan el mismo `mapRow` sin ellos). El texto original
 * viaja sólo cuando NO es el canónico, para explicarlo en la celda.
 */
export const fddAmountsOf = (row) => {
    if (!row || !(FDD_LIST_FIELDS.fdd.rawColumn in row)) return {};
    const out = {};
    for (const f of Object.values(FDD_LIST_FIELDS)) {
        const value = row[f.column] === null || row[f.column] === undefined ? null : Number(row[f.column]);
        const reading = amountReading(row[f.rawColumn], value);
        out[f.column] = value;
        out[`${f.column.replace(/Usd$/, '')}Reading`] = reading;
        if (reading === 'normalized' || reading === 'unreadable') out[f.rawColumn] = String(row[f.rawColumn]).trim().slice(0, 60);
    }
    return out;
};
