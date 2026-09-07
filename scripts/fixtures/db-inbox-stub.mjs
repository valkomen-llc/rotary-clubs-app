// ════════════════════════════════════════════════════════════════════════════
// La base en memoria de la bandeja de solicitudes — v4.999
//
// ⚠️ FILTRA LEYENDO EL SQL, NO REIMPLEMENTANDO EL CRITERIO. Es la lección de
// v4.896: un doble que escribe en JavaScript la regla que la prueba dice
// comprobar vuelve la comprobación VACUA y encima afirma lo contrario. Acá lo
// que se prueba es el AISLAMIENTO entre organizaciones, así que el doble busca
// en el texto de la consulta la cláusula que lo produce
// (`s."campaignId" = ANY($n::text[])`) y sólo filtra si de verdad está: si
// alguien la quita del `WHERE` real, este doble devuelve las filas de más y la
// prueba falla, que es exactamente lo que tiene que pasar.
//
// Y lee de MENOS también miente (v4.992): por eso reconoce además el `FALSE`
// que se fuerza cuando el alcance está vacío — sin él, una sesión sin ninguna
// campaña vería la bandeja entera y la prueba lo daría por bueno.
// ════════════════════════════════════════════════════════════════════════════

export const datos = {
    submissions: [],
    campaigns: [],
    clubs: [],
    consultas: [],
};

export const reset = () => {
    datos.submissions = [];
    datos.campaigns = [];
    datos.clubs = [];
    datos.consultas = [];
};

const norm = (sql) => String(sql).replace(/\s+/g, ' ').trim();

/** El parámetro que va en `= ANY($n::text[])` de la cláusula del alcance. */
const alcanceDeSQL = (sql, params) => {
    const m = norm(sql).match(/s\."campaignId" = ANY\(\$(\d+)::text\[\]\)/);
    if (!m) return { presente: false, ids: null };
    return { presente: true, ids: params[Number(m[1]) - 1] || [] };
};

const tieneFalse = (sql) => /\bWHERE\s+FALSE\b|\bFALSE\s+AND\b|\bAND\s+FALSE\b/i.test(norm(sql));

/** El `s.id = $n` de la ficha. */
const idDeSQL = (sql, params) => {
    const m = norm(sql).match(/s\.id = \$(\d+)/);
    return m ? params[Number(m[1]) - 1] : null;
};

const conCampana = (s) => {
    const c = datos.campaigns.find(c => String(c.id) === String(s.campaignId));
    const origen = datos.clubs.find(k => String(k.id) === String(s.originClubId || ''));
    return {
        ...s,
        campaignName: c?.name ?? null,
        campaignSlug: c?.slug ?? null,
        campaignOwnerClubId: c?.ownerClubId ?? null,
        originClubName: origen?.name ?? null,
        imageCount: s.imageCount ?? 0,
        videoCount: s.videoCount ?? 0,
        promotedCount: s.promotedCount ?? 0,
    };
};

/** Los filtros que la prueba necesita ejercitar, leídos del SQL igual que el
 *  alcance: si la cláusula no está escrita, acá tampoco se aplica. */
const aplicaFiltros = (filas, sql, params) => {
    const t = norm(sql);
    let out = filas;
    const val = (re) => { const m = t.match(re); return m ? params[Number(m[1]) - 1] : undefined; };

    const est = val(/s\.status = \$(\d+)/);
    if (est !== undefined) out = out.filter(s => s.status === est);

    const sitio = val(/s\."originClubId" = \$(\d+)/);
    if (sitio !== undefined) out = out.filter(s => String(s.originClubId || '') === String(sitio));

    const dist = val(/s\.district ILIKE \$(\d+)/);
    if (dist !== undefined) {
        const aguja = String(dist).replace(/%/g, '').toLowerCase();
        out = out.filter(s => String(s.district || '').toLowerCase().includes(aguja));
    }
    if (/s\.assignee IS NULL OR s\.assignee = ''/.test(t)) out = out.filter(s => !s.assignee);
    const resp = val(/s\.assignee = \$(\d+)/);
    if (resp !== undefined) out = out.filter(s => String(s.assignee || '') === String(resp));

    const q = val(/s\."senderName" ILIKE \$(\d+)/);
    if (q !== undefined) {
        const aguja = String(q).replace(/%/g, '').toLowerCase();
        out = out.filter(s => {
            const c = datos.campaigns.find(c => String(c.id) === String(s.campaignId));
            return [s.senderName, s.senderEmail, s.club, s.title, s.description, s.story, s.city, s.location, c?.name]
                .some(v => String(v || '').toLowerCase().includes(aguja));
        });
    }
    return out;
};

const query = async (sql, params = []) => {
    const t = norm(sql);
    datos.consultas.push({ sql: t, params });

    // El ensure y cualquier DDL: no hacen nada.
    if (/^(CREATE|ALTER|DROP|COMMENT)/i.test(t)) return { rows: [] };
    // El atajo del ensure: se declara todo presente para no correr la ráfaga.
    if (/to_regclass/.test(t)) {
        return { rows: [{ solicitud: true, archivo: true, evento: true, club: true, post: true, columnas: 7 }] };
    }

    if (/FROM "ContributionSubmission" s/.test(t)) {
        const alcance = alcanceDeSQL(sql, params);
        let filas = datos.submissions;

        if (tieneFalse(sql)) filas = [];
        else if (alcance.presente) filas = filas.filter(s => alcance.ids.map(String).includes(String(s.campaignId)));
        // Sin cláusula de alcance NO se filtra: es lo que hace que quitarla del
        // WHERE real haga fallar la prueba de aislamiento.

        filas = aplicaFiltros(filas, sql, params);

        const unId = idDeSQL(sql, params);
        if (unId) filas = filas.filter(s => String(s.id) === String(unId));

        if (/COUNT\(\*\)::int AS n[\s\S]*GROUP BY s\.status/.test(t)) {
            const porEstado = {};
            for (const s of filas) porEstado[s.status] = (porEstado[s.status] || 0) + 1;
            return { rows: Object.entries(porEstado).map(([status, n]) => ({ status, n })) };
        }
        if (/SELECT COUNT\(\*\)::int AS n/.test(t)) return { rows: [{ n: filas.length }] };
        if (/SELECT DISTINCT/.test(t)) {
            return { rows: filas.map(s => conCampana(s)) };
        }

        // El listado, con su LIMIT/OFFSET.
        const lim = t.match(/LIMIT \$(\d+) OFFSET \$(\d+)/);
        let out = filas.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
        if (lim) {
            const perPage = Number(params[Number(lim[1]) - 1]) || 50;
            const offset = Number(params[Number(lim[2]) - 1]) || 0;
            out = out.slice(offset, offset + perPage);
        }
        return { rows: out.map(conCampana) };
    }

    if (/FROM "ContributionSubmissionFile"/.test(t)) return { rows: [] };
    if (/FROM "ContributionSubmissionEvent"/.test(t)) return { rows: [] };
    if (/FROM "ContributionSubmissionClub"/.test(t)) return { rows: [] };
    if (/FROM "ContributionSubmissionPost"/.test(t)) return { rows: [] };

    if (/FROM "ContributionCampaign"/.test(t)) {
        const id = params[0];
        const fila = datos.campaigns.find(c => String(c.id) === String(id));
        if (/WHERE id = \$1/.test(t)) return { rows: fila ? [fila] : [] };
        return { rows: datos.campaigns };
    }
    if (/UPDATE "ContributionSubmission"/.test(t)) {
        const s = datos.submissions.find(x => String(x.id) === String(params[0]));
        if (s) s.assignee = params[1];
        return { rows: s ? [s] : [] };
    }
    if (/INSERT INTO "ContributionSubmissionEvent"/.test(t)) return { rows: [] };
    if (/FROM "Club"/.test(t)) {
        const fila = datos.clubs.find(c => String(c.id) === String(params[0]));
        return { rows: fila ? [fila] : [] };
    }
    return { rows: [] };
};

export default { query };
export { query };
