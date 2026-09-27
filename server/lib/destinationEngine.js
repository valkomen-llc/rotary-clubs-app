// ════════════════════════════════════════════════════════════════════════════
// Motor de Reglas Inteligentes de Distribución Editorial Multi-Destino
//
// Determina y valida los destinos donde un artículo debe publicarse:
//   1. Club de origen (si tiene sitio activo dentro de Club Platform)
//   2. Sede del Distrito (si la campaña incluye al distrito en su alcance)
//   3. Clubes participantes (declarados en la actividad)
//   4. Clubes objetivo adicionales configurados en la campaña
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';
import { normalizeTargeting } from './contributionSpec.js';

const parseDistrictNumber = (val) => {
    if (!val) return null;
    const match = String(val).match(/\b(42[78]1|\d{4,5})\b/);
    return match ? match[1] : null;
};

/**
 * Calcula los destinos sugeridos y el estado de distribución para una solicitud.
 */
export async function resolveSuggestedDestinations({ submission, campaign, article = null, post = null }) {
    if (!submission) return { suggested: [], selectedClubIds: [], publishToDistrict: true };

    const suggested = [];
    const seenClubIds = new Set();

    const addDestination = (dest) => {
        if (!dest || !dest.id || seenClubIds.has(String(dest.id))) return;
        seenClubIds.add(String(dest.id));
        suggested.push(dest);
    };

    // 1. Club de Origen
    let originClub = null;
    if (submission.originClubId) {
        const { rows } = await db.query(
            `SELECT id, name, domain, subdomain, status, type, "organizationType", "districtId", district FROM "Club" WHERE id = $1`,
            [submission.originClubId]
        );
        originClub = rows[0] || null;
    }

    if (!originClub && submission.club) {
        const cleanName = submission.club.trim();
        const { rows } = await db.query(
            `SELECT id, name, domain, subdomain, status, type, "organizationType", "districtId", district 
             FROM "Club" 
             WHERE name ILIKE $1 OR name ILIKE $2 
             ORDER BY (CASE WHEN status = 'active' THEN 1 ELSE 2 END)
             LIMIT 1`,
            [cleanName, `%${cleanName}%`]
        );
        originClub = rows[0] || null;
    }

    if (originClub) {
        const isActive = originClub.status === 'active';
        addDestination({
            id: originClub.id,
            name: originClub.name,
            type: 'club_origen',
            typeLabel: 'Club de Origen',
            domain: originClub.domain || null,
            subdomain: originClub.subdomain || null,
            isActive,
            isPreselected: true,
            reason: isActive ? 'Sitio activo del club emisor' : 'Club emisor (sitio aún no activado)',
        });
    }

    // 2. Distrito Sede
    const districtNum = parseDistrictNumber(submission.district) || 
                        parseDistrictNumber(originClub?.district) || 
                        parseDistrictNumber(originClub?.districtId) || '4281';

    if (districtNum) {
        const { rows } = await db.query(
            `SELECT id, name, domain, subdomain, status, type, "organizationType", "districtId", district 
             FROM "Club" 
             WHERE (type = 'district' OR "organizationType" = 'district' OR name ILIKE '%distrito%') 
               AND (district LIKE $1 OR name LIKE $1)
             ORDER BY (CASE WHEN type = 'district' THEN 1 ELSE 2 END)
             LIMIT 1`,
            [`%${districtNum}%`]
        );
        const distClub = rows[0];
        if (distClub) {
            addDestination({
                id: distClub.id,
                name: distClub.name,
                type: 'distrito',
                typeLabel: 'Sede Distrital',
                domain: distClub.domain || null,
                subdomain: distClub.subdomain || null,
                isActive: distClub.status === 'active',
                isPreselected: true,
                reason: `Sede distrital de la campaña (Distrito ${districtNum})`,
            });
        }
    }

    // 3. Clubes Participantes en la Actividad
    const participatingNames = [];
    if (submission.participatingClubs) {
        const split = String(submission.participatingClubs).split(/[,;•\n]+/).map(s => s.trim()).filter(s => s.length > 2);
        participatingNames.push(...split);
    }

    if (Array.isArray(submission.clubs)) {
        for (const c of submission.clubs) {
            if (c.clubName && !participatingNames.includes(c.clubName.trim())) {
                participatingNames.push(c.clubName.trim());
            }
        }
    }

    for (const name of participatingNames) {
        // Ignorar si coincide con el de origen o el distrito
        if (originClub && name.toLowerCase() === originClub.name.toLowerCase()) continue;
        if (/distrito\s*\d+/i.test(name)) continue;

        const { rows } = await db.query(
            `SELECT id, name, domain, subdomain, status, type, "organizationType", "districtId", district 
             FROM "Club" 
             WHERE name ILIKE $1 OR name ILIKE $2
             ORDER BY (CASE WHEN status = 'active' THEN 1 ELSE 2 END)
             LIMIT 1`,
            [name, `%${name}%`]
        );
        const partClub = rows[0];
        if (partClub) {
            addDestination({
                id: partClub.id,
                name: partClub.name,
                type: 'club_colaborador',
                typeLabel: 'Club Participante',
                domain: partClub.domain || null,
                subdomain: partClub.subdomain || null,
                isActive: partClub.status === 'active',
                isPreselected: true,
                reason: 'Club participante en la actividad',
            });
        }
    }

    // 4. Clubes configurados en targeting de la campaña
    if (campaign?.targeting) {
        const t = normalizeTargeting(campaign.targeting);
        if (t.mode === 'clubs' && t.clubIds.length > 0) {
            const { rows } = await db.query(
                `SELECT id, name, domain, subdomain, status, type, "organizationType" FROM "Club" WHERE id = ANY($1::text[])`,
                [t.clubIds]
            );
            for (const c of rows) {
                addDestination({
                    id: c.id,
                    name: c.name,
                    type: 'campana_target',
                    typeLabel: 'Alcance de Campaña',
                    domain: c.domain || null,
                    subdomain: c.subdomain || null,
                    isActive: c.status === 'active',
                    isPreselected: true,
                    reason: 'Club incluido en el alcance de la campaña',
                });
            }
        }
    }

    // 5. Determinar seleccionados
    const postTargets = Array.isArray(post?.targetClubIds) ? post.targetClubIds.filter(Boolean).map(String) : [];
    const selectedClubIds = postTargets.length > 0
        ? postTargets
        : suggested.filter(s => s.isPreselected).map(s => s.id);

    const publishToDistrict = post?.publishToDistrict !== undefined 
        ? Boolean(post.publishToDistrict) 
        : true;

    return {
        suggested,
        selectedClubIds,
        publishToDistrict,
    };
}
