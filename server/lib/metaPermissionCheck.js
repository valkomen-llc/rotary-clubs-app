// ════════════════════════════════════════════════════════════════════════════
// ¿Esta cuenta puede leer estadísticas DE VERDAD? (v4.1055)
//
// ⚠️ ESTO NO LEE NUESTROS REGISTROS: LE PREGUNTA A META. Es la diferencia
// entera con `insightsReadiness`, que es puro y decide con lo guardado. Acá se
// hacen dos llamadas y se cree lo que contesten:
//
//   1. `debug_token` sobre el token de usuario → qué permisos lleva el token.
//      No lo que esta plataforma pidió: lo que Meta concedió.
//   2. UNA consulta real a la arista de estadísticas → si responde, el permiso
//      sirve; si no, el motivo exacto de Meta, con su código y su subcódigo.
//
// La segunda no sobra teniendo la primera, y es lo que este módulo aporta: un
// permiso puede figurar como concedido y la arista responder igual que no —por
// la tarea sobre la Página, por el tipo de cuenta o porque la aplicación está
// en Acceso estándar—. Un permiso concedido es una condición necesaria; la
// única prueba es la respuesta del endpoint.
//
// ⚠️ Y LO QUE SE APRENDE SE GUARDA. Sin eso, el panel volvería a decidir con
// la lista vieja en cuanto se cierre la pantalla, y habría que reautorizar
// para corregir un dato que esta comprobación ya midió.
//
// ⚠️ NO PUBLICA NI ESCRIBE NADA EN META: dos llamadas de lectura y nada más.
// ════════════════════════════════════════════════════════════════════════════

import prisma from './prisma.js';
import { decryptToken } from './tokenCrypto.js';
import { readTokenGrant, META_SCOPES } from '../services/metaService.js';
import { graphGet } from './metaInsights.js';
import {
    graphBase, INSIGHTS_SCOPES, utcToDay, addDays,
} from './socialMetricsSpec.js';

const str = (v) => (typeof v === 'string' ? v.trim() : '');

/** Por qué una cuenta no puede leer estadísticas, con la salida de CADA caso.
 *
 *  ⚠️ CATÁLOGO CERRADO. Un bloqueo que no esté acá no se disfraza de uno que
 *  sí: cae en `unknown` y se propaga el texto de Meta. Presentar un motivo
 *  desconocido como uno conocido manda a corregir donde no está el problema —
 *  que es exactamente el reporte que originó esta versión. */
export const BLOCKERS = {
    app_review: {
        label: 'La aplicación de Meta no tiene el permiso aprobado',
        fix: 'La aplicación necesita este permiso con ACCESO AVANZADO: App Review + verificación del negocio en el panel de Meta for Developers. Mientras esté en Acceso estándar sólo responde para quien sea administrador, desarrollador o tester de la aplicación. Reautorizar no lo cambia.',
    },
    user_declined: {
        label: 'La autorización no concedió el permiso',
        fix: 'Volvé a pulsar «Conectar Meta» y dejá marcado el permiso de estadísticas en la pantalla de Facebook.',
    },
    page_task: {
        label: 'Falta el rol de análisis sobre la Página',
        fix: 'Un administrador de la Página tiene que conceder el acceso de «Información y estadísticas» (tarea ANALYZE) a quien conectó, en Meta Business. Después, reconectar.',
    },
    account_type: {
        label: 'La cuenta no es profesional',
        fix: 'Instagram sólo entrega estadísticas de cuentas Profesionales (empresa o creador) vinculadas a una Página. Convertí la cuenta y volvé a conectar.',
    },
    token_expired: {
        label: 'La credencial venció',
        fix: 'Volvé a pulsar «Conectar Meta»: el token de Meta caduca y hay que renovarlo.',
    },
    rate_limited: {
        label: 'Meta limitó las consultas',
        fix: 'No hay nada que corregir: se reintenta solo más tarde.',
    },
    provider_down: {
        label: 'Meta no respondió',
        fix: 'No hay nada que corregir: se reintenta solo más tarde.',
    },
    no_token: {
        label: 'No hay credencial guardada',
        fix: 'Volvé a pulsar «Conectar Meta» para esta cuenta.',
    },
    unknown: {
        label: 'Meta rechazó la consulta',
        fix: 'El motivo textual de Meta queda en el registro de la comprobación.',
    },
};

export const blockerOf = (k) => BLOCKERS[str(k)] || null;

/** El token de USUARIO guardado en esta misma fila (cifrado en `refreshToken`).
 *
 *  Se toma el de la fila y no el más reciente del sitio: dos personas pueden
 *  haber conectado cuentas distintas, y comprobar una con el token de la otra
 *  daría un veredicto sobre una autorización que no es la suya. */
const userTokenOfRow = (row) => {
    if (!row?.refreshToken) return null;
    try { return decryptToken(row.refreshToken) || null; } catch { return null; }
};

const pageTokenOfRow = (row) => {
    if (!row?.accessToken) return null;
    try { return decryptToken(row.accessToken) || null; } catch { return null; }
};

/** UNA consulta real a la arista de estadísticas. La más barata que existe:
 *  un solo día y una sola métrica. No se piden todas — lo que se está
 *  comprobando es si la arista RESPONDE, no qué devuelve. */
const probeInsightsEdge = async ({ platform, platformId, token, today = null }) => {
    const hoy = utcToDay(today || new Date());
    const desde = addDays(hoy, -2);
    const base = graphBase();
    const tok = encodeURIComponent(token);
    const url = platform === 'facebook'
        ? `${base}/${platformId}/insights?metric=page_post_engagements&period=day`
          + `&since=${desde}&until=${hoy}&access_token=${tok}`
        : `${base}/${platformId}/insights?metric=reach&period=day`
          + `&since=${desde}&until=${hoy}&access_token=${tok}`;
    // Sin reintentos: acá se quiere el veredicto, no insistir. Un límite de
    // consultas se dice como tal y se vuelve a comprobar después.
    const r = await graphGet(url, { retries: 0 });
    return r;
};

/**
 * Comprueba CONTRA META qué puede leer una cuenta, y guarda lo que aprende.
 *
 * @returns {Promise<object>} veredicto con permisos reales, respuesta de la
 *   arista, bloqueo (si lo hay) y el registro técnico del intento.
 */
export const verifyAccountInsights = async ({ accountId, today = null }) => {
    const row = await prisma.socialAccount.findUnique({ where: { id: accountId } });
    if (!row) return { ok: false, state: 'error', reason: 'La cuenta no existe.' };

    const scope = INSIGHTS_SCOPES[row.platform];
    const meta = (row.metadata && typeof row.metadata === 'object') ? row.metadata : {};
    const checkedAt = new Date().toISOString();

    // El registro técnico del intento. ⚠️ NUNCA LLEVA EL TOKEN, ni recortado:
    // lo que se guarda es de qué CLASE era y qué contestó Meta (requisito 6).
    const audit = {
        accountId, platform: row.platform, platformId: row.platformId,
        checkedAt, scope,
        tokenKind: null, httpStatus: null, metaCode: null, metaSubcode: null,
        metaMessage: null, endpoint: null,
    };

    if (!scope) {
        return { ok: false, state: 'error', reason: 'Plataforma sin adaptador de estadísticas.', audit };
    }

    // ── 1) Qué concedió Meta DE VERDAD ─────────────────────────────────────
    let grant = null;
    let grantError = null;
    const userToken = userTokenOfRow(row);
    if (userToken) {
        audit.tokenKind = 'user_long_lived';
        try {
            grant = await readTokenGrant(userToken);
        } catch (e) {
            grantError = e?.message || 'no se pudo inspeccionar el token';
        }
    } else {
        grantError = 'esta cuenta no guardó el token de usuario con el que se autorizó';
    }

    const concedidos = grant?.scopes || null;
    const tienePermiso = concedidos ? concedidos.includes(scope) : null;

    // ── 2) ¿La arista responde? ────────────────────────────────────────────
    const pageToken = pageTokenOfRow(row);
    let edge = null;
    if (pageToken) {
        audit.endpoint = `/${row.platformId}/insights`;
        edge = await probeInsightsEdge({
            platform: row.platform, platformId: row.platformId, token: pageToken, today,
        });
        audit.httpStatus = edge.httpStatus ?? null;
        if (!edge.ok) {
            audit.metaCode = edge.code ?? null;
            audit.metaSubcode = edge.subcode ?? null;
            audit.metaMessage = str(edge.error) || null;
        }
    }

    // ── 3) El veredicto ────────────────────────────────────────────────────
    //
    // ⚠️ MANDA LA ARISTA. Si responde, la cuenta puede leer estadísticas
    // aunque la inspección del token no se haya podido hacer: la prueba es la
    // respuesta, no el inventario de permisos. Y al revés, un permiso que
    // figura concedido no alcanza si la arista lo rechaza.
    let ok = false;
    let state = 'error';
    let blocker = null;
    let reason = null;

    if (!pageToken) {
        state = 'error'; blocker = 'no_token';
        reason = 'No hay una credencial guardada para esta cuenta.';
    } else if (edge?.ok) {
        ok = true; state = 'ok';
        reason = 'Meta entregó estadísticas para esta cuenta.';
    } else {
        state = edge?.state || 'error';
        reason = str(edge?.error) || 'Meta rechazó la consulta de estadísticas.';
        if (state === 'token_expired') blocker = 'token_expired';
        else if (state === 'rate_limited') blocker = 'rate_limited';
        else if (state === 'provider_down') blocker = 'provider_down';
        else if (state === 'no_permission') {
            // La causa PRECISA, en orden de lo que se puede demostrar.
            const tareas = Array.isArray(meta.tasks) ? meta.tasks : [];
            if (tienePermiso === false) {
                // El token no lleva el permiso. Que el resto haya llegado es
                // lo que distingue «lo desmarcaron» de «la aplicación no lo
                // tiene aprobado»: con una autorización sana y este permiso
                // ausente, el bloqueo está del lado de la aplicación en Meta.
                blocker = concedidos.includes('pages_show_list') ? 'app_review' : 'user_declined';
            } else if (row.platform === 'facebook' && tareas.length && !tareas.includes('ANALYZE')) {
                blocker = 'page_task';
            } else if (row.platform === 'instagram' && !meta.linkedPageId) {
                blocker = 'account_type';
            } else {
                // El permiso figura concedido y la arista lo rechaza igual:
                // es el caso del Acceso estándar —la aplicación puede pedirlo
                // y Meta sólo lo sirve a su propio equipo—.
                blocker = tienePermiso === true ? 'app_review' : 'unknown';
            }
        } else blocker = 'unknown';
    }

    // ── 4) Lo aprendido se GUARDA ──────────────────────────────────────────
    //
    // ⚠️ SÓLO SE PISA `permissions` CUANDO SE PUDO MEDIR. Escribir la lista
    // vacía de un `debug_token` que no respondió dejaría a la cuenta marcada
    // como incapaz por un tropiezo de red — y esa marca sobreviviría a la
    // pantalla, que es lo que la vuelve cara.
    const nuevaMeta = {
        ...meta,
        insightsCheck: {
            at: checkedAt, ok, state, blocker,
            reason,
            metaCode: audit.metaCode, metaSubcode: audit.metaSubcode,
            scope, scopeGranted: tienePermiso,
            grantError: grantError || null,
        },
    };
    if (concedidos) {
        nuevaMeta.permissionsSource = 'debug_token';
        nuevaMeta.permissionsVerifiedAt = grant.checkedAt;
        nuevaMeta.requestedScopes = META_SCOPES;
        nuevaMeta.missingScopes = META_SCOPES.filter((p) => !concedidos.includes(p));
        nuevaMeta.granularScopes = grant.granularScopes || [];
        nuevaMeta.insightsScopeGranted = tienePermiso;
    }

    // ⚠️ GUARDAR NO PUEDE COSTAR EL VEREDICTO. A esta altura la comprobación
    // ya se hizo y es lo que se vino a buscar: un fallo escribiendo se anota y
    // se devuelve igual.
    try {
        await prisma.socialAccount.update({
            where: { id: accountId },
            data: {
                metadata: nuevaMeta,
                ...(concedidos ? { permissions: concedidos } : {}),
                lastVerifiedAt: new Date(),
                updatedAt: new Date(),
            },
        });
    } catch (e) {
        audit.saveError = e?.message || 'no se pudo guardar la comprobación';
    }

    const ficha = blockerOf(blocker);
    return {
        ok, state, blocker,
        blockerLabel: ficha?.label || null,
        fix: ficha?.fix || null,
        reason,
        scope,
        scopeGranted: tienePermiso,
        grantedScopes: concedidos,
        grantChecked: !!concedidos,
        grantError: grantError || null,
        checkedAt,
        audit,
    };
};

export default { verifyAccountInsights, BLOCKERS, blockerOf };
