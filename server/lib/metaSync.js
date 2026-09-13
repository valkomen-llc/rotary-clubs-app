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
import {
    getMetaUserProfile,
    getUserPages,
    getInstagramBusinessForPage,
    META_SCOPES,
} from '../services/metaService.js';

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

    // 1) Lo que el token alcanza AHORA. Nunca una lista vieja.
    const pages = await getUserPages(userToken);

    const conectadas = [];
    const instagram = [];
    const avisos = [];
    const vistos = { facebook: new Set(), instagram: new Set() };

    // El token de usuario, cifrado, para poder resincronizar sin otro OAuth.
    const userTokenCifrado = encryptToken(userToken);
    const conectadoPor = { id: quien.id, name: quien.name };

    for (const page of pages) {
        vistos.facebook.add(page.id);

        const metaPagina = {
            category: page.category,
            tasks: page.tasks,
            connectedBy: conectadoPor,
            lastSyncAt: nowIso(),
        };

        const filaFb = {
            pageId: page.id,
            accountName: page.name,
            accessToken: encryptToken(page.accessToken),
            refreshToken: userTokenCifrado,
            avatar: page.avatar,
            status: 'active',
            permissions: META_SCOPES,
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
        };

        const filaIg = {
            pageId: page.id,
            accountName: ig.username,
            // IG publica con el token de SU Página: es lo que declara la API.
            accessToken: encryptToken(page.accessToken),
            refreshToken: userTokenCifrado,
            avatar: ig.avatar,
            status: 'active',
            permissions: META_SCOPES,
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
    const retiradas = [];
    if (deactivateMissing) {
        const existentes = await prisma.socialAccount.findMany({
            where: { clubId, platform: { in: ['facebook', 'instagram'] }, status: 'active' },
            select: { id: true, platform: true, platformId: true, accountName: true, metadata: true },
        });
        for (const fila of existentes) {
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

    return {
        clubId,
        connectedBy: conectadoPor,
        pages: conectadas,
        instagram,
        revoked: retiradas,
        notes: avisos,
        syncedAt: nowIso(),
        counts: { facebook: conectadas.length, instagram: instagram.length, revoked: retiradas.length },
    };
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
