// Prisma en memoria, SOBRE LAS MISMAS TABLAS que el doble de pg.
//
// Es lo que hace fiel la prueba del camino: una fila que el webhook escribe con
// SQL crudo la tiene que ver el agente, que consulta con Prisma. En producción
// son dos vistas de una sola base; si acá fueran dos almacenes distintos, la
// prueba pasaría por los motivos equivocados —el agente no encontraría el
// mensaje que acaba de llegar y su ausencia se leería como «no había nada»—.
import { tablas } from './db-whatsapp-stub.mjs';

// Los nombres de Prisma no siempre son los de la tabla: `CrmContact` está
// mapeado a `WhatsAppContact` con @@map, y el doble guarda por nombre de TABLA.
const TABLA_DE = {
  crmContact: 'WhatsAppContact',
  whatsAppContact: 'WhatsAppContact',
};

const casa = (f, where = {}) => Object.entries(where).every(([k, v]) => {
  if (k === 'OR') return (v || []).some((o) => casa(f, o));
  if (k === 'AND') return (v || []).every((o) => casa(f, o));
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    if ('not' in v) return v.not === null ? (f[k] !== null && f[k] !== undefined) : f[k] !== v.not;
    if ('in' in v) return v.in.includes(f[k]);
    if ('gt' in v) return new Date(f[k]) > new Date(v.gt);
  }
  if (v === null) return f[k] === null || f[k] === undefined;
  return String(f[k] ?? '') === String(v);
});

const ordenar = (filas, orderBy) => {
  if (!orderBy) return filas;
  const claves = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...filas].sort((a, b) => {
    for (const o of claves) {
      const [campo, dir] = Object.entries(o)[0];
      const va = a[campo] ?? '', vb = b[campo] ?? '';
      if (va === vb) continue;
      return (va > vb ? 1 : -1) * (dir === 'desc' ? -1 : 1);
    }
    return 0;
  });
};

const prisma = new Proxy({}, {
  get(_, modelo) {
    if (typeof modelo !== 'string') return undefined;
    const nombre = TABLA_DE[modelo] || modelo.charAt(0).toUpperCase() + modelo.slice(1);
    const filas = () => (tablas[nombre] ||= []);
    return {
      findUnique: async ({ where }) => filas().find((f) => casa(f, where)) || null,
      findFirst: async ({ where, orderBy } = {}) =>
        ordenar(filas().filter((f) => casa(f, where || {})), orderBy)[0] || null,
      findMany: async ({ where, orderBy, take } = {}) => {
        const r = ordenar(filas().filter((f) => casa(f, where || {})), orderBy);
        return (take ? r.slice(0, take) : r).map((f) => ({ ...f }));
      },
      count: async ({ where } = {}) => filas().filter((f) => casa(f, where || {})).length,
      create: async ({ data }) => { const f = { ...data }; filas().push(f); return f; },
      update: async ({ where, data }) => {
        const f = filas().find((x) => casa(x, where));
        if (f) Object.assign(f, data);
        return f || null;
      },
      upsert: async ({ where, create, update }) => {
        const f = filas().find((x) => casa(x, where));
        if (f) { Object.assign(f, update); return f; }
        const nueva = { ...create }; filas().push(nueva); return nueva;
      },
    };
  },
});

export default prisma;
