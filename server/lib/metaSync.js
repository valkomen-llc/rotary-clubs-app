// ════════════════════════════════════════════════════════════════════════════
// Meta → cuentas del sitio: EL motor de sincronización (v4.1043)
//
// ⚠️ HAY UN SOLO SINCRONIZADOR Y DE ESO CUELGA TODO LO DEMÁS. Lo llaman el
// callback de OAuth y el botón «Sincronizar cuentas»; con dos, el día que se
// corrija cómo se descubre Instagram —o cómo se retira una Página que ya no
// está autorizada— una mitad se queda atrás y el fallo es MUDO: las dos
// siguen guardando cuentas, y lo que se separa es EN QUÉ SITIO aparece cada
// Página.
//
// Lo que resuelve, en orden:
//
//   1. Enumera las Páginas que el token de usuario alcanza AHORA. No se
//      reutiliza ninguna lista guardada: lo que vale es lo que Meta acaba de
//      autorizar.
//   2. Por cada Página, pregunta por su cuenta de Instagram profesional y
//      GUARDA POR QUÉ no la hay cuando no la hay. «Instagram no conectado» a
//      secas manda a reconectar una cuenta que está bien: lo que suele faltar
//      es convertirla a profesional o vincularla en Meta Business.
//   3. Escribe todo acotado al TENANT que inició el flujo, nunca al sitio por
//      el que entró quien lo pulsó.
//   4. ⚠️ RETIRA LO QUE YA NO SE AUTORIZÓ. Sin este paso, una Página
//      concedida hace meses y NO vuelta a conceder se queda `active` para
//      siempre y el selector de «Publicar en redes sociales» la sigue
//      ofreciendo — que es exactamente cómo un sitio termina viendo Páginas
//      que no son las suyas.
//
// Y el token de usuario de larga duración se GUARDA cifrado (columna
// `refreshToken`, que existía sin consumidor): es lo único que permite volver
// a sincronizar sin mandar a nadie a repetir el OAuth (requisito 8).
// ════════════════════════════════════════════════════════════════════════════

import prisma from './prisma.js';
import { encryptToken, decryptToken } from './tokenCrypto.js';
import { saveSyncReport } from './metaSyncReport.js';
import {
    getMetaUserProfile,
    discoverUserPages,
    getInstagramBusinessForPage,
    META_SCOPES,
} from '../services/metaService.js';
// ⚠️ EL PERMISO DE ESTADÍSTICAS SE IMPORTA, NO SE ESCRIBE OTRA VEZ. Con la
// pareja plataforma→permiso escrita dos veces, el día que Meta la renombre
// una mitad se queda atrás y el fallo es MUDO: la cuenta se guardaría como
// «puede leer estadísticas» y la sincronización recibiría un rechazo.
import { INSIGHTS_SCOPES } from './socialMetricsSpec.js';

const TOKEN_VERSION_CURRENT = 1;

/** Qué se le dice a alguien cuando una Página no trae Instagram.
 *
 *  Meta devuelve `instagram_business_account` ÚNICAMENTE cuando la cuenta es
 *  Profesional (empresa o creador) Y está vinculada a la Página. Si falta
 *  cualquiera de las dos cosas, la respuesta viene vacía y no hay error que
 *  propagar: por eso el motivo se escribe acá y no se deduce después. */
export const IG_MISSING_REASON =
    'Meta no devolvió ninguna cuenta profesional de Instagram vinculada a esta Página.';
export const IG_MISSING_FIX =
    'La cuenta tiene que ser Profesional (empresa o creador) y estar vinculada a esta Página en Meta Business. Después, volvé a pulsar «Sincronizar cuentas».';

const nowIso = () => new Date().toISOString();

/**
 * Sincroniza las cuentas de Meta de UN tenant a partir de un token de usuario.
 *
 * @param {object}  p
 * @param {string}  p.clubId              El sitio al que se atribuyen las cuentas.
 * @param {string}  p.userToken           Token de usuario de larga duración.
 * @param {Date?}   p.userTokenExpiresAt  Cuándo vence ese token.
 * @param {object?} p.profile             Quién autorizó; se consulta si no viene.
 * @param {boolean} p.deactivateMissing   Retirar lo que este usuario ya no autoriza.
 * @returns {Promise<object>} informe: páginas, instagram, retiradas y avisos.
 */
export const syncMetaAccountsForClub = async ({
    clubId,
    userToken,
    userTokenExpiresAt = null,
    profile = null,
    deactivateMissing = true,
}) => {
    if (!clubId) throw new Error('syncMetaAccountsForClub: clubId requerido');
    if (!userToken) throw new Error('syncMetaAccountsForClub: userToken requerido');

    const quien = profile || await getMetaUserProfile(userToken);

    // 1) Lo que el token alcanza AHORA, POR LAS TRES VÍAS. Nunca una lista
    //    vieja, y nunca sólo `/me/accounts`: una Página administrada desde un
    //    portafolio de Meta Business no aparece ahí, se marca igual en la
    //    pantalla de Facebook, y su ausencia no produce ningún error.
    const hallazgo = await discoverUserPages(userToken);
    const pages = hallazgo.pages;
    // Los avisos del descubrimiento viajan enteros: son lo único que explica
    // por qué una Página que se marcó en Facebook no está en la lista.
    const avisos = [...hallazgo.notes];

    // ── ⚠️ LO QUE SE GUARDA COMO «PERMISOS» ES LO CONCEDIDO ────────────────
    //
    // Hasta v4.1054 se guardaba `META_SCOPES`, o sea la lista PEDIDA. Es una
    // afirmación que no se puede sostener: Meta concede lo que la aplicación
    // tenga aprobado, y pedir un permiso no lo concede. La consecuencia
    // medida: la Analítica de Redes Sociales leía esa lista, encontraba
    // `read_insights` porque nosotros lo habíamos pedido, y daba la cuenta por
    // capaz; y al revés, reconectar hacía desaparecer el aviso sin que nada
    // hubiera cambiado en Meta. Ahora sale de `debug_token`.
    //
    // ⚠️ `null` NO ES UNA LISTA VACÍA. «No se pudo inspeccionar el token» y
    // «este token no lleva ningún permiso» se parecen en el código y son
    // opuestos: con la lista vacía guardada, TODA cuenta quedaría marcada como
    // incapaz de leer estadísticas por un tropiezo de red. Sin grant se
    // conserva lo pedido y se DECLARA que no está verificado, que es lo que
    // hace que la puerta de la analítica no decida sobre un dato que no se
    // midió.
    const grant = hallazgo.grant || null;
    const permisosConcedidos = grant?.scopes?.length ? grant.scopes : null;
    const permisosGuardados = permisosConcedidos || META_SCOPES;
    const permisosVerificados = !!permisosConcedidos;
    const faltantes = permisosVerificados
        ? META_SCOPES.filter((p) => !permisosConcedidos.includes(p))
        : [];
    const auditoriaPermisos = {
        permissionsSource: permisosVerificados ? 'debug_token' : 'requested',
        permissionsVerifiedAt: permisosVerificados ? grant.checkedAt : null,
        requestedScopes: META_SCOPES,
        missingScopes: faltantes,
        // Sólo con qué activos alcanza cada permiso granular; sin tokens.
        granularScopes: grant?.granularScopes || [],
        dataAccessExpiresAt: grant?.dataAccessExpiresAt
            ? grant.dataAccessExpiresAt.toISOString() : null,
    };

    if (!permisosVerificados) {
        avisos.push({
            code: 'permisos_sin_verificar',
            title: 'No se pudo comprobar qué permisos concedió Meta',
            reason: 'La inspección del token no respondió, así que se conservó la lista de permisos que esta plataforma solicita.',
            fix: 'Las cuentas se guardaron igual. El primer intento de leer estadísticas dirá el motivo real que devuelva Meta.',
        });
    }

    const conectadas = [];
    const instagram = [];
    const vistos = { facebook: new Set(), instagram: new Set() };

    // El token de usuario, cifrado, para poder resincronizar sin otro OAuth.
    const userTokenCifrado = encryptToken(userToken);
    const conectadoPor = { id: quien.id, name: quien.name };

    for (const page of pages) {
        vistos.facebook.add(page.id);

        // ⚠️ `tasks` NO ES DECORATIVO: Meta exige la tarea ANALYZE sobre la
        // Página para entregar sus estadísticas. Se guardaba desde siempre y
        // no lo leía nadie, así que «esta persona administra la Página pero no
        // es analista» salía como un error de permiso genérico que mandaba a
        // reautorizar una aplicación que estaba bien.
        const tareas = Array.isArray(page.tasks) ? page.tasks : [];
        const hasPublishTask = tareas.length === 0 || tareas.some(t => ['CREATE_CONTENT', 'MANAGE'].includes(String(t).toUpperCase()));
        const missingPublishScope = permisosVerificados && !permisosGuardados.includes('pages_manage_posts');
        const cannotPublish = !hasPublishTask || missingPublishScope;
        const permissionIssue = !hasPublishTask
            ? 'Tu usuario no tiene asignadas tareas de publicación en esta página (faltan tareas CREATE_CONTENT / MANAGE).'
            : (missingPublishScope ? 'La autorización de Meta no concedió permiso para crear publicaciones (pages_manage_posts).' : null);

        if (cannotPublish) {
            avisos.push({
                pageId: page.id,
                pageName: page.name,
                title: page.name,
                code: 'page_cannot_publish',
                reason: permissionIssue,
                fix: !hasPublishTask
                    ? 'Pedile a un administrador de la página en Meta Business que te asigne el rol de creación de contenido.'
                    : 'Volvé a conectar Meta y asegurate de conceder permisos de publicación en Facebook.',
            });
        }

        const metaPagina = {
            category: page.category,
            tasks: tareas,
            canAnalyze: tareas.includes('ANALYZE'),
            canPublish: !cannotPublish,
            cannotPublish,
            ...(permissionIssue ? { permissionIssue } : {}),
            connectedBy: conectadoPor,
            lastSyncAt: nowIso(),
            ...auditoriaPermisos,
            insightsScope: INSIGHTS_SCOPES.facebook,
            insightsScopeGranted: permisosVerificados
                ? permisosGuardados.includes(INSIGHTS_SCOPES.facebook) : null,
        };

        const filaFb = {
            pageId: page.id,
            accountName: page.name,
            accessToken: encryptToken(page.accessToken),
            refreshToken: userTokenCifrado,
            avatar: page.avatar,
            status: cannotPublish ? 'needs_permission' : 'active',
            permissions: permisosGuardados,
            lastVerifiedAt: new Date(),
            tokenVersion: TOKEN_VERSION_CURRENT,
            expiresAt: userTokenExpiresAt,
        };

        await prisma.socialAccount.upsert({
            where: { clubId_platform_platformId: { clubId, platform: 'facebook', platformId: page.id } },
            update: { ...filaFb, metadata: metaPagina, updatedAt: new Date() },
            create: { clubId, platform: 'facebook', platformId: page.id, ...filaFb, metadata: metaPagina },
        });
        conectadas.push({ pageId: page.id, name: page.name });

        // 2) Instagram profesional vinculado a ESA Página.
        const ig = await getInstagramBusinessForPage({
            pageId: page.id,
            pageAccessToken: page.accessToken,
        });

        if (!ig) {
            // No es un error: es una situación concreta con dos salidas, y se
            // dice con esas palabras en vez de dejar el hueco sin explicar.
            avisos.push({
                pageId: page.id,
                pageName: page.name,
                title: page.name,
                code: 'ig_not_linked',
                reason: IG_MISSING_REASON,
                fix: IG_MISSING_FIX,
            });
            continue;
        }

        vistos.instagram.add(ig.id);

        const metaIg = {
            igName: ig.name,
            igUsername: ig.username,
            followersCount: ig.followersCount,
            linkedPageId: page.id,
            linkedPageName: page.name,
            connectedBy: conectadoPor,
            lastSyncAt: nowIso(),
            ...auditoriaPermisos,
            insightsScope: INSIGHTS_SCOPES.instagram,
            insightsScopeGranted: permisosVerificados
                ? permisosGuardados.includes(INSIGHTS_SCOPES.instagram) : null,
        };

        const filaIg = {
            pageId: page.id,
            accountName: ig.username,
            // IG publica con el token de SU Página: es lo que declara la API.
            accessToken: encryptToken(page.accessToken),
            refreshToken: userTokenCifrado,
            avatar: ig.avatar,
            status: 'active',
            permissions: permisosGuardados,
            lastVerifiedAt: new Date(),
            tokenVersion: TOKEN_VERSION_CURRENT,
            expiresAt: userTokenExpiresAt,
        };

        await prisma.socialAccount.upsert({
            where: { clubId_platform_platformId: { clubId, platform: 'instagram', platformId: ig.id } },
            update: { ...filaIg, metadata: metaIg, updatedAt: new Date() },
            create: { clubId, platform: 'instagram', platformId: ig.id, ...filaIg, metadata: metaIg },
        });
        instagram.push({ igId: ig.id, username: ig.username, pageId: page.id, pageName: page.name });
    }

    // 3) ⚠️ LO QUE ESTE USUARIO YA NO AUTORIZA SE RETIRA — y sólo lo suyo.
    //
    // Se acota a las filas que ESTE mismo usuario de Meta conectó
    // (`metadata.connectedBy.id`). Dos personas pueden haber conectado
    // Páginas distintas para el mismo sitio: retirar por ausencia a secas
    // dejaría sin publicar a la otra, que no pidió nada. Una fila sin
    // `connectedBy` —las anteriores a que se guardara— tampoco se toca: no se
    // retira lo que no se puede atribuir.
    // ⚠️ Y NO SE RETIRA NADA CUANDO NO SE VIO NADA. «No pudimos ver ninguna
    // Página» y «ya no autorizaste ninguna» se parecen en el código y son
    // cosas opuestas: con las tres aristas devolviendo cero —un token que
    // dejó de alcanzar, una arista caída, un cambio de Meta— la retirada por
    // ausencia borra TODAS las cuentas del sitio de una vez. Es lo que dejó
    // este sitio en «0 activas» con la Página marcada en Facebook.
    const retiradas = [];
    const descubrimientoVacio = !pages.length;
    if (descubrimientoVacio && deactivateMissing) {
        avisos.push({
            code: 'retirada_omitida',
            title: 'No se retiró ninguna cuenta',
            reason: 'Esta sincronización no encontró ninguna Página, así que no se puede afirmar que las guardadas hayan dejado de estar autorizadas.',
            fix: 'Las cuentas que ya estaban se conservan tal como estaban. Volvé a pulsar «Conectar Meta» y marcá la Página en la pantalla de Facebook.',
        });
    }
    if (deactivateMissing && !descubrimientoVacio) {
        const existentes = await prisma.socialAccount.findMany({
            where: { clubId, platform: { in: ['facebook', 'instagram'] }, status: 'active' },
            select: { id: true, platform: true, platformId: true, accountName: true, metadata: true },
        });
        for (const fila of existentes) {
            // ⚠️ UNA CUENTA CONECTADA DIRECTAMENTE NO LA RETIRA UNA
            // SINCRONIZACIÓN DE FACEBOOK. El Instagram que se conectó por su
            // propio flujo (`Instagram Login API`) no viaja en `/me/accounts`
            // ni puede: es otro proveedor. Sin esta guarda, su ausencia en la
            // lista de Meta se leería como «ya no está autorizada». Hoy no
            // choca por casualidad —aquella fila guarda el id del usuario de
            // LA PLATAFORMA y esta comparación usa el de META—, y apoyarse en
            // que dos espacios de identificadores no colisionen es apoyarse
            // en la suerte.
            if (fila.metadata?.directConnect) continue;
            const duenio = fila.metadata?.connectedBy?.id;
            if (!duenio || String(duenio) !== String(quien.id)) continue;
            if (vistos[fila.platform]?.has(fila.platformId)) continue;
            await prisma.socialAccount.update({
                where: { id: fila.id },
                data: {
                    status: 'revoked',
                    metadata: {
                        ...(fila.metadata || {}),
                        revokedAt: nowIso(),
                        revokedReason: 'no_autorizada_en_la_ultima_sincronizacion',
                    },
                    updatedAt: new Date(),
                },
            });
            retiradas.push({ platform: fila.platform, platformId: fila.platformId, name: fila.accountName });
        }
    }

    // ── ⚠️ SI FALTA UN PERMISO DE ESTADÍSTICAS SE DICE ACÁ, CON SU CAUSA ───
    //
    // Y la causa importa: no es lo mismo que la persona lo haya desmarcado en
    // la pantalla de Facebook —se resuelve reautorizando— que la aplicación no
    // tenga ese permiso aprobado en App Review, donde reautorizar mil veces no
    // cambia nada. Se distinguen por qué concedió el resto: si el token trae
    // los demás permisos y sólo faltan los de estadísticas, la autorización
    // funcionó y lo que falta es del lado de la aplicación en Meta.
    if (permisosVerificados) {
        const faltaFb = !permisosGuardados.includes(INSIGHTS_SCOPES.facebook) && conectadas.length;
        const faltaIg = !permisosGuardados.includes(INSIGHTS_SCOPES.instagram) && instagram.length;
        const otrosLlegaron = permisosGuardados.includes('pages_show_list');
        for (const [falta, permiso, donde] of [
            [faltaFb, INSIGHTS_SCOPES.facebook, 'Facebook'],
            [faltaIg, INSIGHTS_SCOPES.instagram, 'Instagram'],
        ]) {
            if (!falta) continue;
            avisos.push({
                code: 'insights_scope_missing',
                title: `Estadísticas de ${donde}`,
                scope: permiso,
                reason: `Meta NO concedió «${permiso}». Se comprobó inspeccionando el token, no leyendo lo que esta plataforma pidió.`,
                fix: otrosLlegaron
                    ? `La autorización sí concedió el resto de los permisos, así que el bloqueo no está en la pantalla de Facebook: la aplicación de Meta necesita «${permiso}» con Acceso avanzado (App Review + verificación del negocio). Mientras tanto sólo responderá para quien sea administrador o tester de la aplicación.`
                    : `Volvé a pulsar «Conectar Meta» y concedé «${permiso}» en la pantalla de Facebook.`,
            });
        }
    }

    const informe = {
        clubId,
        connectedBy: conectadoPor,
        // Qué permisos concedió DE VERDAD esta autorización, y si se pudo
        // comprobar. Es lo que contesta «¿por qué no hay estadísticas?» sin
        // entrar a la cuenta de Meta de otra persona.
        permissions: {
            granted: permisosGuardados,
            verified: permisosVerificados,
            missing: faltantes,
            source: auditoriaPermisos.permissionsSource,
        },
        pages: conectadas,
        instagram,
        revoked: retiradas,
        notes: avisos,
        // De dónde salió cada Página. Es lo que contesta «¿por qué falta la
        // mía?» sin tener que entrar a la cuenta de Meta de otra persona.
        sources: hallazgo.sources,
        // Qué activos concedió esta autorización, por id, y cuáles de ellos
        // no resultaron ser una Página.
        granted: hallazgo.granted || [],
        unresolved: hallazgo.unresolved || [],
        syncedAt: nowIso(),
        counts: { facebook: conectadas.length, instagram: instagram.length, revoked: retiradas.length },
    };

    // ⚠️ EL INFORME SE GUARDA, y por eso esto no puede fallar hacia arriba: a
    // esta altura las cuentas ya están escritas. Sin él, «0 cuentas» sólo se
    // puede diagnosticar leyendo los registros de la función, que quien
    // reporta el problema no puede abrir.
    await saveSyncReport(clubId, informe);

    return informe;
};

/**
 * El token de usuario guardado para este sitio, si lo hay.
 *
 * Es lo que hace posible «Sincronizar cuentas» sin mandar a nadie a repetir
 * el OAuth: se toma el más reciente de las filas del tenant. Un token que ya
 * no sirve lo dirá la llamada a Meta con su motivo textual — no se adivina
 * acá (requisito: sólo pedir reconexión cuando de verdad haga falta).
 */
export const storedUserTokenFor = async (clubId) => {
    if (!clubId) return null;
    const fila = await prisma.socialAccount.findFirst({
        where: { clubId, refreshToken: { not: null }, tokenVersion: { gt: 0 } },
        orderBy: { updatedAt: 'desc' },
        select: { refreshToken: true, expiresAt: true, metadata: true },
    });
    if (!fila?.refreshToken) return null;
    try {
        const token = decryptToken(fila.refreshToken);
        if (!token) return null;
        return {
            token,
            expiresAt: fila.expiresAt || null,
            connectedBy: fila.metadata?.connectedBy || null,
        };
    } catch {
        return null;
    }
};

export default { syncMetaAccountsForClub, storedUserTokenFor, IG_MISSING_REASON, IG_MISSING_FIX };
