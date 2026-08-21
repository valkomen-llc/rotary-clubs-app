// ¿El sitio es público todavía? — espejo MÍNIMO del criterio del navegador.
//
// ⚠️ SE LLAMA `sitePublication`, NO `siteStatus`, Y EL NOMBRE IMPORTA.
// `server/lib/siteStatus.js` YA EXISTE desde v4.828 y es otra cosa: la
// validación de suscripción vigente del módulo de Capacitaciones
// (`evaluateSiteStatus`, `resolveSiteEntity`). En v4.883 este archivo se
// escribió encima de aquél y el resultado fue que `trainingPublicController`
// importaba símbolos inexistentes: **la función entera dejó de arrancar y
// TODA la plataforma respondió 500**, incluido el panel. Al crear un módulo,
// comprobar antes que el nombre esté libre.
//
// Acá vive SÓLO lo que el servidor necesita: saber si un sitio está en
// construcción, para no indexarlo. La decisión de qué se PINTA es del
// navegador (`src/lib/sitePublication.ts`), y este espejo se compara con
// aquél por SALIDAS en `npm run test:site-status`.

export function normalizeSiteStatus(raw) {
    const v = String(raw ?? '').trim().toLowerCase();
    if (v === 'draft' || v === 'construction' || v === 'under_construction') return 'draft';
    if (v === 'inactive' || v === 'suspended' || v === 'disabled') return 'inactive';
    // Ante la duda, ACTIVO: lo contrario convertiría un dato desconocido en un
    // sitio caído — y acá además en un sitio desindexado.
    return 'active';
}

export const isUnderConstruction = raw => normalizeSiteStatus(raw) === 'draft';

export default { normalizeSiteStatus, isUnderConstruction };
