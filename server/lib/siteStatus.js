// Validación centralizada de "sitio activo / suscripción vigente".
// No existía un helper compartido: el cron replicaba el predicado. Este es el
// único lugar del módulo de capacitaciones que decide si un sitio puede reservar
// gratis o debe pasar por el checkout de Stripe.
import prisma from './prisma.js';

// Resuelve la entidad reservante (Club o Distrito) a partir de ids.
// Prioriza clubId; si no hay, intenta districtId.
export async function resolveSiteEntity({ clubId, districtId }) {
  if (clubId) {
    const club = await prisma.club.findUnique({ where: { id: clubId } });
    if (club) return { entity: club, type: 'club' };
  }
  if (districtId) {
    const district = await prisma.district.findUnique({ where: { id: districtId } });
    if (district) return { entity: district, type: 'district' };
  }
  return { entity: null, type: null };
}

// ¿El sitio está activo y con suscripción vigente?
// Un sitio es elegible para reservar cuando:
//   - status !== 'inactive' (no suspendido), y
//   - subscriptionStatus !== 'expired', y
//   - si tiene expirationDate, que sea futura.
// Devuelve { active, reason }.
export function evaluateSiteStatus(entity) {
  if (!entity) return { active: false, reason: 'not_found' };

  const status = entity.status || 'active';
  const sub = entity.subscriptionStatus || 'active';
  const exp = entity.expirationDate ? new Date(entity.expirationDate) : null;

  if (status === 'inactive') return { active: false, reason: 'suspended' };
  if (sub === 'expired') return { active: false, reason: 'expired' };
  if (exp && exp.getTime() < Date.now()) return { active: false, reason: 'expired' };

  return { active: true, reason: 'active' };
}

// Combinación conveniente: resuelve entidad + evalúa estado.
export async function getSiteStatus({ clubId, districtId }) {
  const { entity, type } = await resolveSiteEntity({ clubId, districtId });
  const status = evaluateSiteStatus(entity);
  return { ...status, entity, type };
}
