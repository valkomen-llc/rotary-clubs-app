// ════════════════════════════════════════════════════════════════════
// Cuál es el SITIO de un distrito — v4.744
//
// PURO a propósito: sin base y sin red, igual que `domains.js` y por el mismo
// motivo — este criterio decide qué ve un visitante y tiene que poder probarse.
//
// EL PROBLEMA QUE RESUELVE
// -----------------------
// Un distrito existe DOS VECES en la plataforma y las dos filas hacen cosas
// distintas:
//
//   - La fila de `District` es el REGISTRO administrativo: número, gobernador,
//     países, facturación… y el DOMINIO PROPIO, que es lo que se escribe en
//     /admin/distritos y lo que se provisiona en Vercel.
//   - La fila de `Club` (tipo `district`) es el SITIO: su configuración, sus
//     ajustes, su identidad visual, sus secciones, sus miembros. Es lo que el
//     administrador del distrito edita desde su panel.
//
// El visitante llega por el DOMINIO, que vive en la primera; el contenido vive
// en la segunda. Hasta v4.743 `by-domain`, al encontrar la fila de `District`,
// sintetizaba la entidad con `settings: []` — literalmente ningún ajuste—, así
// que el dominio propio de un distrito servía un sitio VACÍO mientras el mismo
// distrito, alcanzado por su subdominio de plataforma, se veía completo. Es lo
// que se reportó con el Distrito 4281: «entro por app.clubplatform.org y está
// todo; entro por rotary4281.org y no aparece nada».
//
// LA DECISIÓN
// -----------
// No se DUPLICA el dominio en las dos filas: se RESUELVE al leer. El dominio
// sigue teniendo una sola verdad —la fila de `District`, que es donde lo
// escribe el panel y donde lo lee la provisión en Vercel— y la resolución
// atraviesa hasta el sitio. Copiarlo a la fila de `Club` daría dos valores que
// se contradicen en cuanto alguien edite uno de los dos, y `Club.domain` es
// ÚNICO: la copia fallaría o pisaría el dominio de otro sitio.
// ════════════════════════════════════════════════════════════════════

const norm = (s) => (s == null ? '' : String(s).trim().toLowerCase());

// Los valores con los que un `Club` declara que es el sitio de un distrito. Son
// dos porque el alta automática de /admin/distritos escribe la clave máquina
// (`district`) y el formulario de sitios guarda la etiqueta legible.
export const DISTRICT_SITE_TYPES = ['district', 'distrito rotario'];

/** ¿Este `Club.type` es el sitio de un distrito? */
export function isDistrictSiteType(type) {
    return DISTRICT_SITE_TYPES.includes(norm(type));
}

/**
 * Qué tan fuerte es el vínculo entre un club candidato y un distrito.
 *
 * Se puntúa en vez de elegir por una sola condición porque los vínculos son de
 * calidad muy distinta y ninguno está garantizado: `districtId` es el bueno
 * pero puede no estar puesto —el alta de v4.743 creaba el club espejo SIN
 * él—, el número es fiable pero débil, y el subdominio sólo sirve si el
 * distrito declaró uno.
 *
 * Devuelve 0 cuando NO hay ningún vínculo: un club sin relación con el
 * distrito no es su sitio por mucho que sea el único que quede.
 */
export function districtLinkScore(district, club) {
    if (!district || !club) return 0;
    let score = 0;

    // El vínculo explícito. Es el único que alguien declaró a propósito.
    if (district.id && club.districtId && club.districtId === district.id) score += 8;

    // El club espejo que crea /admin/distritos: tipo `district` y el número del
    // distrito en la columna `district`.
    const number = district.number == null ? '' : String(district.number).trim();
    if (number && norm(club.district) === norm(number) && isDistrictSiteType(club.type)) score += 4;

    // El subdominio declarado en la ficha del distrito.
    const sub = norm(district.subdomain);
    if (sub && norm(club.subdomain) === sub) score += 3;

    // Ser del tipo correcto no vincula por sí solo —hay un sitio de tipo
    // distrito por cada distrito— pero desempata entre dos filas vinculadas.
    if (score > 0 && isDistrictSiteType(club.type)) score += 1;

    return score;
}

/**
 * De entre los clubes candidatos, cuál es EL sitio del distrito.
 *
 * Puede haber más de uno, y no es un caso raro: al crear un distrito se inserta
 * un club espejo («Distrito 4281», vacío) y el operador suele crear después el
 * sitio de verdad desde el panel de sitios («Distrito 4281 de Rotary
 * International», con toda su configuración). Elegir mal entre esos dos da
 * exactamente el sitio vacío que este módulo existe para evitar, así que el
 * desempate es por CANTIDAD DE AJUSTES: el sitio configurado es el que tiene
 * configuración. A igualdad, el más recientemente actualizado; y a igualdad de
 * todo, el id menor, para que la respuesta no dependa del orden en que la base
 * devuelva las filas.
 *
 * @param {object} district  fila de `District`
 * @param {Array}  clubs     candidatos con al menos { id, type, districtId,
 *                           district, subdomain, settingsCount, updatedAt }
 * @returns {object|null}    el club elegido, o null si ninguno está vinculado
 */
export function pickDistrictSite(district, clubs) {
    const scored = (Array.isArray(clubs) ? clubs : [])
        .map((club) => ({ club, score: districtLinkScore(district, club) }))
        .filter((c) => c.score > 0);

    if (scored.length === 0) return null;

    scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const sa = Number(a.club.settingsCount) || 0;
        const sb = Number(b.club.settingsCount) || 0;
        if (sb !== sa) return sb - sa;
        const ua = new Date(a.club.updatedAt || 0).getTime() || 0;
        const ub = new Date(b.club.updatedAt || 0).getTime() || 0;
        if (ub !== ua) return ub - ua;
        return String(a.club.id).localeCompare(String(b.club.id));
    });

    return scored[0].club;
}

/**
 * La identidad visual con la que se sirve el sitio de un distrito.
 *
 * MANDA EL SITIO; el registro del distrito es RESPALDO. Los dos tienen campos
 * de marca —la ficha de /admin/distritos deja cargar logo, favicon y colores—
 * y un distrito puede tener puesto uno y no el otro. Tomar sólo el del sitio
 * haría desaparecer un logo que alguien cargó en la ficha; tomar sólo el del
 * distrito ignoraría lo que el administrador configuró en su panel, que es
 * justamente lo que se está corrigiendo.
 *
 * Devuelve únicamente los campos que hay que pisar, para que el resto de la
 * cadena de herencia (club maestro, valores por defecto) siga funcionando.
 */
export function districtBranding(club, district) {
    const out = {};
    if (!district) return out;
    for (const key of ['logo', 'footerLogo', 'favicon']) {
        if (!club?.[key] && district[key]) out[key] = district[key];
    }
    if (!club?.colors && district.colors) out.colors = district.colors;
    if (!club?.logoHeaderSize && district.logoHeaderSize) out.logoHeaderSize = district.logoHeaderSize;
    return out;
}

export default { DISTRICT_SITE_TYPES, isDistrictSiteType, districtLinkScore, pickDistrictSite, districtBranding };
