// El estado de un sitio — espejo MÍNIMO del criterio del navegador.
//
// Acá vive SÓLO lo que el servidor necesita: saber si un sitio está en
// construcción, para no indexarlo. La decisión de qué se PINTA es del
// navegador (`src/lib/siteStatus.ts`), y este espejo se compara con aquél por
// SALIDAS en `npm run test:site-status` — si divergen, un sitio podría estar
// tapado para los visitantes y a la vez ofrecido a Google.
//
// Al tocar `normalizeSiteStatus` en un lado, tocarlo en el otro.

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
