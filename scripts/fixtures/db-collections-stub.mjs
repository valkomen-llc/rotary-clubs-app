// ════════════════════════════════════════════════════════════════════
// La base, en memoria, para probar el CAMINO de la reconstrucción de cobros.
// v4.1025.0
//
// ⚠️ ESTE DOBLE NO IMPLEMENTA LAS REGLAS QUE LA PRUEBA DICE COMPROBAR (la
// lección de v4.896). En particular NO reimplanta la idempotencia: el
// `ON CONFLICT (provider, "providerRef") DO NOTHING` se LEE del propio SQL, así
// que si alguien lo borra, este doble inserta el segundo Payment y la prueba
// detecta el cobro contado dos veces.
//
// Y lee las condiciones del `WHERE` en vez de filtrar por su cuenta: leer de
// MENOS también miente (v4.992) — sin mirar `p.id IS NULL`, un cobro ya
// registrado seguiría saliendo como candidato y la prueba no vería nada.
//
// Lo que este doble NO demuestra es que el SQL sea válido para Postgres: eso se
// comprueba al desplegar, y no se afirma de más.
// ════════════════════════════════════════════════════════════════════
let seq = 0;

export const tablas = {
    ProjectFairSubmission: [],
    Payment: [],
    CalendarEvent: [],
};
export const consultas = [];

export const reset = () => {
    seq = 0;
    for (const k of Object.keys(tablas)) tablas[k] = [];
    consultas.length = 0;
};

const norm = (sql) => String(sql).replace(/\s+/g, ' ').trim();

export const query = async (sql, params = []) => {
    const q = norm(sql);
    consultas.push({ sql: q, params });

    // ── El sitio del evento de una edición ──────────────────────────
    if (/SELECT "clubId" FROM "CalendarEvent"/i.test(q)) {
        const fila = tablas.CalendarEvent.find(e => e.id === params[0]);
        return { rows: fila ? [{ clubId: fila.clubId }] : [] };
    }

    // ── Las inscripciones pagadas SIN movimiento ────────────────────
    if (/FROM "ProjectFairSubmission"/i.test(q) && /LEFT JOIN "Payment"/i.test(q)) {
        const refDe = (s) => s.stripePaymentIntentId || s.stripeSessionId || null;
        let filas = tablas.ProjectFairSubmission.slice();

        // Las condiciones se LEEN del SQL. Quitarlas del módulo tiene que
        // hacer fallar la prueba, no pasar desapercibido.
        if (/s\.status = 'paid'/.test(q)) filas = filas.filter(s => s.status === 'paid');
        if (/COALESCE\(s\."stripePaymentIntentId", s\."stripeSessionId"\) IS NOT NULL/.test(q)) {
            filas = filas.filter(s => !!refDe(s));
        }
        if (/p\.id IS NULL/.test(q)) {
            filas = filas.filter(s => !tablas.Payment.some(
                p => p.provider === 'stripe' && p.providerRef === refDe(s)));
        }
        const limite = Number(params[0]) || filas.length;
        return { rows: filas.slice(0, limite) };
    }

    // ── El INSERT del movimiento ────────────────────────────────────
    if (/INSERT INTO "Payment"/i.test(q)) {
        const [provider, providerRef, status, amount, applicationFee, netAmount,
            currency, clubId, rawPayload, paidAt] = params;
        // El `ON CONFLICT` sale del SQL, no de una regla escrita acá.
        const hayCandado = /ON CONFLICT \(provider, "providerRef"\) DO NOTHING/i.test(q);
        const repetido = tablas.Payment.some(p => p.provider === provider && p.providerRef === providerRef);
        if (repetido && hayCandado) return { rows: [] };
        const fila = {
            id: `pay_${++seq}`, provider, providerRef, status,
            amount, applicationFee, netAmount, currency,
            isPlatformCollection: true, clubId,
            rawPayload, createdAt: paidAt || new Date().toISOString(),
        };
        tablas.Payment.push(fila);
        return { rows: [{ id: fila.id }] };
    }

    return { rows: [] };
};

export default { query };
