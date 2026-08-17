// ════════════════════════════════════════════════════════════════════
// Notificaciones de Contribuciones — qué dominios están verificados
// v4.857.0 (Fase 2)
//
// La orquestación de la comprobación. El CRITERIO —qué dirección le toca a un
// correo dada la lista de dominios verificados— vive en `notificationSpec.js`
// (`resolveSenderPlan`), que es puro y tiene pruebas.
//
// ── POR QUÉ HAY CACHÉ ───────────────────────────────────────────────
//
// La verificación NO está en nuestra base: hasta hoy se consultaba en vivo a
// Resend (`GET /domains`) desde el panel de diagnóstico. Eso está bien para un
// panel y es inaceptable dentro del webhook de Stripe: sería una llamada de red
// a un tercero en el camino crítico de un cobro, y Stripe da de baja los
// endpoints que tardan. Por eso se guarda con vencimiento.
//
// ── LA CACHÉ SE QUEDA VIEJA, Y ESO SE ASUME ─────────────────────────
//
// Un dominio puede dejar de estar verificado entre dos comprobaciones. El
// riesgo está acotado por el TTL y por lo que pasa después: el proveedor
// rechaza el envío, el fallo queda escrito con su motivo textual y el correo se
// puede reenviar. Lo contrario —consultar siempre— cambia un riesgo raro por
// una latencia segura.
// ════════════════════════════════════════════════════════════════════
import db from './db.js';
import ensureNotificationSchema from './ensureNotificationSchema.js';
import { normalizeDomain } from './notificationSpec.js';

/** Cuánto vale una comprobación. Doce horas: un dominio no se verifica ni se
 *  cae varias veces al día, y con esto la consulta a Resend ocurre un par de
 *  veces por jornada en vez de una por aporte. */
export const DOMAIN_TTL_MIN = Number(process.env.NOTIFICATION_DOMAIN_TTL_MIN) || 720;

/** Caché en MEMORIA, además de la de base. En Vercel la función se congela
 *  entre invocaciones, así que esto sólo ahorra dentro de una misma
 *  invocación —el barrido de varias notificaciones seguidas—; la de base es la
 *  que de verdad evita la llamada de red. */
let _memoria = null;
let _memoriaAt = 0;
const MEMORIA_MS = 60_000;

const ahora = () => Date.now();

/**
 * Los dominios verificados, de la caché o del proveedor.
 *
 * NUNCA lanza: esto corre dentro del webhook de Stripe. Si no se puede saber,
 * devuelve lo último que se supo —aunque esté vencido— y, en última instancia,
 * una lista vacía. Una lista vacía no rompe nada: `resolveSenderPlan` cae al
 * respaldo, que es exactamente el comportamiento de antes de esta fase.
 */
export const verifiedDomains = async ({ force = false } = {}) => {
    if (!force && _memoria && ahora() - _memoriaAt < MEMORIA_MS) return _memoria;

    let guardados = [];
    try {
        await ensureNotificationSchema();
        const { rows } = await db.query(
            `SELECT domain, verified, "checkedAt" FROM "NotificationDomain"`
        );
        guardados = rows;
    } catch (e) {
        console.warn('[SENDER-DOMAINS] no se pudo leer la caché:', e?.message);
    }

    const vencida = !guardados.length || guardados.every(r =>
        !r.checkedAt || (ahora() - new Date(r.checkedAt).getTime()) > DOMAIN_TTL_MIN * 60_000
    );

    if (!force && !vencida) {
        _memoria = guardados.filter(r => r.verified).map(r => r.domain);
        _memoriaAt = ahora();
        return _memoria;
    }

    const frescos = await consultarProveedor();
    if (frescos === null) {
        // No se pudo preguntar. Se usa lo último que se supo, aunque esté
        // vencido: un dominio que estaba verificado hace trece horas casi
        // seguro lo sigue estando, y caer al respaldo por un fallo de red
        // cambiaría la identidad del correo sin motivo.
        _memoria = guardados.filter(r => r.verified).map(r => r.domain);
        _memoriaAt = ahora();
        return _memoria;
    }

    await guardar(frescos);
    _memoria = frescos.filter(d => d.verified).map(d => d.domain);
    _memoriaAt = ahora();
    return _memoria;
};

/**
 * Le pregunta a Resend. Devuelve `null` —no `[]`— cuando no se pudo preguntar:
 * son cosas distintas y confundirlas borraría la caché guardada con una lista
 * vacía, dejando a todos los sitios en el respaldo hasta la siguiente consulta
 * exitosa.
 *
 * Se usa la key de LECTURA si existe: una key de sólo-envío no puede listar
 * dominios y devuelve `restricted`, que es el mismo detalle que el panel de
 * diagnóstico ya documenta.
 */
const consultarProveedor = async () => {
    const key = process.env.RESEND_INBOUND_API_KEY || process.env.RESEND_API_KEY;
    if (!key) return null;
    try {
        const resp = await fetch('https://api.resend.com/domains', {
            headers: { Authorization: `Bearer ${key}` },
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            console.warn(`[SENDER-DOMAINS] Resend respondió ${resp.status}: ${data?.message || 'sin detalle'}`);
            return null;
        }
        return (data.data || [])
            .map(d => ({ domain: normalizeDomain(d.name), verified: d.status === 'verified', status: String(d.status || '') }))
            .filter(d => d.domain);
    } catch (e) {
        console.warn('[SENDER-DOMAINS] no se pudo consultar Resend:', e?.message);
        return null;
    }
};

const guardar = async (lista) => {
    try {
        await ensureNotificationSchema();
        for (const d of lista) {
            await db.query(
                `INSERT INTO "NotificationDomain" (domain, verified, status, "checkedAt")
                 VALUES ($1,$2,$3,NOW())
                 ON CONFLICT (domain) DO UPDATE
                    SET verified = EXCLUDED.verified, status = EXCLUDED.status, "checkedAt" = NOW()`,
                [d.domain, d.verified, d.status]
            );
        }
    } catch (e) {
        console.warn('[SENDER-DOMAINS] no se pudo guardar la caché:', e?.message);
    }
};

/** Lo que el panel necesita para EXPLICAR por qué un sitio no envía desde lo
 *  suyo. Trae el estado crudo del proveedor, no sólo el booleano: «pending» y
 *  «no está en Resend» se corrigen en sitios distintos. */
export const domainReport = async () => {
    try {
        await ensureNotificationSchema();
        await verifiedDomains();
        const { rows } = await db.query(
            `SELECT domain, verified, status, "checkedAt" FROM "NotificationDomain" ORDER BY domain ASC`
        );
        return rows;
    } catch {
        return [];
    }
};

/** Descarta la memoria. La usa el panel al pedir una comprobación a mano: sin
 *  esto, «Volver a comprobar» devolvería lo mismo durante un minuto y parecería
 *  que el botón no hace nada. */
export const forgetDomains = () => { _memoria = null; _memoriaAt = 0; };

export default { DOMAIN_TTL_MIN, verifiedDomains, domainReport, forgetDomains };
