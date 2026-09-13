// ════════════════════════════════════════════════════════════════════════════
// La Página y el Instagram PREDETERMINADOS de un sitio (v4.1043)
//
// Un sitio puede tener varias Páginas conectadas —las de su distrito, las de
// una campaña, la de la plataforma— y aun así hay una que es LA suya. Sin
// declararla, «Publicar en redes sociales» abre con todo marcado o con lo
// primero que devuelva la consulta, y publicar en la cuenta equivocada es algo
// que después hay que ir a borrar a mano en Facebook.
//
// ⚠️ VIVE EN `Setting`, NO EN UNA COLUMNA DE `SocialAccount`. Es un ajuste
// DEL SITIO —«cuál de las mías es la principal»—, no una propiedad de la
// cuenta, y una columna nueva en un modelo de Prisma que todavía no exista en
// la base deja en 500 a todo consumidor (regla de `logo_intl`, v4.699). Es el
// mismo patrón que `default_outro` (v4.1035): único por `(key, clubId)`.
//
// ⚠️ Y SE GUARDA EL ID DE LA CUENTA, NUNCA EL NOMBRE. Un nombre se repite
// entre sitios y se renombra en Meta sin avisar; el id de la Página y el de la
// cuenta de Instagram son la identidad primaria.
// ════════════════════════════════════════════════════════════════════════════

import prisma from './prisma.js';

export const DEFAULTS_KEY = 'social_default_accounts';

const str = (v) => (typeof v === 'string' ? v.trim() : '');

/** Lo guardado, saneado. `{}` cuando no hay nada o no se puede leer: quedarse
 *  sin predeterminado es una molestia, y un fallo leyéndolo no puede dejar sin
 *  modal a quien entró a publicar. */
export const getDefaultAccounts = async (clubId) => {
    if (!str(clubId)) return {};
    try {
        const fila = await prisma.setting.findFirst({ where: { key: DEFAULTS_KEY, clubId } });
        if (!fila?.value) return {};
        const parsed = JSON.parse(fila.value);
        return {
            facebook: str(parsed?.facebook) || null,
            instagram: str(parsed?.instagram) || null,
        };
    } catch {
        return {};
    }
};

/**
 * Fija (o suelta) los predeterminados de un sitio.
 *
 * ⚠️ EL ID SE COMPRUEBA CONTRA LAS CUENTAS DEL PROPIO SITIO. Si se aceptara
 * el que llegue en el cuerpo, un sitio podría declarar como principal la
 * Página de otro — y lo que se separaría es en la cuenta de qué organización
 * aparece una publicación. `null` suelta el ajuste.
 */
export const setDefaultAccounts = async ({ clubId, facebook, instagram }) => {
    if (!str(clubId)) throw new Error('clubId requerido');

    const comprobar = async (id, platform) => {
        if (id === null || id === undefined || str(id) === '') return null;
        const acc = await prisma.socialAccount.findFirst({
            where: { id: str(id), clubId, platform },
            select: { id: true },
        });
        if (!acc) throw new Error(`La cuenta de ${platform} indicada no existe en este sitio.`);
        return acc.id;
    };

    const actual = await getDefaultAccounts(clubId);
    const valor = {
        facebook: facebook === undefined ? (actual.facebook || null) : await comprobar(facebook, 'facebook'),
        instagram: instagram === undefined ? (actual.instagram || null) : await comprobar(instagram, 'instagram'),
    };

    const fila = await prisma.setting.findFirst({ where: { key: DEFAULTS_KEY, clubId } });
    if (fila) {
        await prisma.setting.update({ where: { id: fila.id }, data: { value: JSON.stringify(valor) } });
    } else {
        await prisma.setting.create({ data: { key: DEFAULTS_KEY, clubId, value: JSON.stringify(valor) } });
    }
    return valor;
};

/**
 * Un predeterminado que apunta a una cuenta borrada, o que ya no puede
 * publicar, NO se conserva: se suelta al leer.
 *
 * Sin esto, el modal abriría con una cuenta marcada que el servidor va a
 * rechazar — y eso se lee como que el módulo está roto. Se resuelve contra la
 * lista que el propio modal va a pintar, así que no puede discrepar de ella.
 */
export const resolveDefaults = (defaults = {}, targets = []) => {
    const vivo = (id, network) => {
        if (!str(id)) return null;
        const t = targets.find(x => x.id === id && x.network === network);
        return t && t.ready ? t.id : null;
    };
    return {
        facebook: vivo(defaults.facebook, 'facebook'),
        instagram: vivo(defaults.instagram, 'instagram'),
    };
};

export default { DEFAULTS_KEY, getDefaultAccounts, setDefaultAccounts, resolveDefaults };
