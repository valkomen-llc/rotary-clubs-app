// ═══════════════════════════════════════════════════════════
// Alcance de los agentes y de los cerebros — EL CRITERIO (v4.1314.0)
//
// PURO: sin base, sin red, sin IA. Decide quién lee o modifica un agente, qué
// memorias de un cerebro ve cada quien y cuándo una petición pública puede
// actuar a nombre de un sitio. Las rutas lo consultan; ninguna repite la regla
// a mano, que es como la regla número once se escribe mal.
//
// Por qué existe (Fase 0 del plan del AI Agent Command Center):
//   · `PUT/DELETE /api/agents/:id` no revisaban ni rol ni club: cualquier
//     sesión podía reescribir el prompt de un agente global.
//   · El cerebro maestro recibe copia de las memorias de TODOS los clubes y
//     `userCanReadBrain` lo abría a cualquier sesión.
//   · `/api/agents/orchestrate` y `/api/ai/chat` tomaban el `clubId` del cuerpo
//     de una petición sin sesión.
// ═══════════════════════════════════════════════════════════

/** Roles que administran TODA la plataforma. */
export const PLATFORM_ROLES = ['administrator', 'superadmin'];

/** Roles que administran un sitio (mismo criterio que `SITE_ADMIN_ROLES`). */
export const SITE_MANAGER_ROLES = ['administrator', 'superadmin', 'district_admin', 'club_admin', 'editor'];

export function isPlatformAdmin(user) {
    return Boolean(user) && PLATFORM_ROLES.includes(String(user.role || ''));
}

export function isSiteManager(user) {
    return Boolean(user) && SITE_MANAGER_ROLES.includes(String(user.role || ''));
}

const same = (a, b) => Boolean(a) && Boolean(b) && String(a) === String(b);

/**
 * ¿Puede ver este agente? Los globales (`clubId` nulo) son plantillas que todos
 * los sitios usan: se ven. Los de un club, sólo su club y la plataforma.
 */
export function canReadAgent(user, agent) {
    if (!user || !agent) return false;
    if (isPlatformAdmin(user)) return true;
    if (!agent.clubId) return true;
    return same(agent.clubId, user.clubId);
}

/**
 * ¿Puede cambiarlo o borrarlo? Un global sólo la plataforma. Uno de club, quien
 * administra ESE club. Un socio o un autor nunca.
 */
export function canManageAgent(user, agent) {
    if (!user || !agent) return false;
    if (isPlatformAdmin(user)) return true;
    if (!agent.clubId) return false;
    return isSiteManager(user) && same(agent.clubId, user.clubId);
}

/** ¿Puede crear un agente? Sólo quien administra un sitio. */
export function canCreateAgent(user) {
    return isSiteManager(user);
}

// ── Cerebros ───────────────────────────────────────────────────────────

/**
 * ¿Puede abrir este cerebro? El maestro se abre a todos, pero lo que se ve
 * DENTRO lo recorta `masterMemoryWhere`: el maestro sigue siendo útil (lo
 * global y lo propio) sin ser una ventana a los demás clubes.
 */
export function canReadBrain(user, brain, scope = {}) {
    if (!user || !brain) return false;
    if (isPlatformAdmin(user)) return true;
    if (brain.isMaster) return true;
    if (same(brain.clubId, scope.clubId)) return true;
    if (same(brain.districtId, scope.districtId)) return true;
    return false;
}

/**
 * ¿Puede ESCRIBIR en este cerebro (identidad, documentos, notas, dossier)?
 * El maestro sólo la plataforma. Los demás, quien administra ese club o
 * distrito — y el alcance tiene que venir de la sesión, nunca del dominio por
 * el que entró la petición (`scope.fromHost`).
 */
export function canWriteBrain(user, brain, scope = {}) {
    if (!user || !brain) return false;
    if (isPlatformAdmin(user)) return true;
    if (brain.isMaster) return false;
    if (!isSiteManager(user)) return false;
    if (scope.fromHost) return false;
    if (same(brain.clubId, scope.clubId)) return true;
    if (same(brain.districtId, scope.districtId)) return true;
    return false;
}

/**
 * El filtro de memorias que cada quien ve de un cerebro. `null` = sin filtro.
 * En el maestro, quien no es la plataforma ve lo GLOBAL (sin club ni distrito)
 * y lo de su propio club o distrito; nada más.
 */
export function masterMemoryWhere(user, brain, scope = {}) {
    if (isPlatformAdmin(user)) return null;
    if (!brain?.isMaster) return null;
    const or = [{ clubId: null, districtId: null }];
    if (scope.clubId) or.push({ clubId: String(scope.clubId) });
    if (scope.districtId) or.push({ districtId: String(scope.districtId) });
    return { OR: or };
}

/** La misma regla aplicada a una memoria ya leída (para listas en memoria). */
export function memoryVisible(user, brain, memory, scope = {}) {
    if (isPlatformAdmin(user)) return true;
    if (!brain?.isMaster) return true;
    if (!memory) return false;
    if (!memory.clubId && !memory.districtId) return true;
    if (same(memory.clubId, scope.clubId)) return true;
    if (same(memory.districtId, scope.districtId)) return true;
    return false;
}

// ── Peticiones públicas ────────────────────────────────────────────────

/**
 * ¿Puede una petición SIN sesión actuar a nombre de `requestedClubId`?
 *   · Si el dominio de la petición resuelve a un sitio, manda el dominio: el
 *     `clubId` del cuerpo tiene que coincidir (o faltar), salvo un club del
 *     mismo distrito que el sitio del dominio (`requestedRelatedToHost`).
 *   · Si el dominio no resuelve (la plataforma, un entorno de prueba), se
 *     acepta el del cuerpo sólo si el sitio existe y está activo.
 * Devuelve `{ ok, clubId, reason }`.
 */
export function resolvePublicClub({ hostSiteId, requestedClubId, requestedSiteExists, requestedRelatedToHost = false }) {
    if (hostSiteId) {
        if (requestedClubId && !same(requestedClubId, hostSiteId)) {
            // Un club que se muestra DENTRO del sitio de su distrito (mismo
            // `districtId`) es legítimo: la página del club vive en ese dominio.
            if (requestedRelatedToHost) return { ok: true, clubId: String(requestedClubId), reason: 'club_del_mismo_distrito' };
            return { ok: false, clubId: null, reason: 'club_no_coincide_con_dominio' };
        }
        return { ok: true, clubId: String(hostSiteId), reason: 'dominio' };
    }
    if (!requestedClubId) return { ok: false, clubId: null, reason: 'sin_club' };
    if (!requestedSiteExists) return { ok: false, clubId: null, reason: 'club_inexistente' };
    return { ok: true, clubId: String(requestedClubId), reason: 'cuerpo_verificado' };
}

/** Eventos que una página pública puede disparar sin sesión. Lista CERRADA. */
export const PUBLIC_ORCHESTRATION_EVENTS = ['new_contact_lead'];

/**
 * Límite en memoria por ventana deslizante. Por instancia (serverless): corta
 * ráfagas, no sustituye un WAF. Es puro salvo por el reloj, que se inyecta.
 */
export function createRateLimiter({ windowMs = 60_000, max = 10, maxKeys = 5000 } = {}) {
    const hits = new Map();
    return function take(key, now = Date.now()) {
        const k = String(key || 'anon').slice(0, 200);
        const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
        if (arr.length >= max) { hits.set(k, arr); return false; }
        arr.push(now);
        hits.set(k, arr);
        if (hits.size > maxKeys) { for (const key0 of hits.keys()) { hits.delete(key0); break; } }
        return true;
    };
}

/** La IP del visitante detrás del proxy de Vercel. */
export function clientIp(req) {
    return String(req?.headers?.['x-forwarded-for']?.split(',')[0] || req?.ip || 'x').trim().slice(0, 80);
}

/** El dominio por el que entró la petición. */
export function requestHost(req) {
    return String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim().slice(0, 200);
}

/** SQL: ¿el club pedido comparte distrito con el sitio del dominio? */
export const RELATED_TO_HOST_SQL = `SELECT 1 FROM "Club" a JOIN "Club" b ON b.id::text = $2
  WHERE a.id::text = $1 AND a."districtId" IS NOT NULL AND a."districtId" = b."districtId" LIMIT 1`;
