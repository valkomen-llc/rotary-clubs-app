// ════════════════════════════════════════════════════════════════════════════
// SEO Inteligente — AUDITORÍA (orquestación)
//
// Recorre el sitio, resuelve cada página y le pasa el resultado a las reglas.
// **El criterio no vive acá**: vive en `seoRules.js`, que es puro y se puede
// probar sin base de datos. Este archivo sólo sabe leer.
//
// La separación no es estética. Un motor de auditoría que sólo se puede
// ejercitar contra una base real termina sin pruebas, y entonces nadie se entera
// de que una regla cambió de signo hasta que un sitio aparece con nota 100 y
// cuarenta problemas.
// ════════════════════════════════════════════════════════════════════════════

import { SCORE_WEIGHTS } from './seoSpec.js';
import { listSitePages, resolvePage, siteOrigin } from './seoEntities.js';
import { buildMetaSet } from './seoRender.js';
import { readSiteConfig, listPageMeta } from './seoStore.js';
import {
    auditPage, auditDuplicates, auditSiteLevel, scoreByAxis, countBy,
} from './seoRules.js';

/**
 * Audita un sitio. Devuelve hallazgos, la nota por eje y el inventario.
 *
 * `maxPages` acota el trabajo a lo que cabe en los 120 s de la función. Cuando
 * se recorta se DICE en `notes`: un recorte callado se lee como "se revisó todo"
 * cuando no fue así. Misma regla que el barrido de Reels.
 */
export async function auditSite(club, { host, maxPages = 250 } = {}) {
    const origin = siteOrigin(club, host);
    const notes = [];
    const config = club?.id ? await readSiteConfig(club.id) : {};
    const overrides = club?.id ? await listPageMeta(club.id) : [];
    const overrideByPath = new Map(overrides.map(o => [o.path, o]));

    const { pages: inventory, notes: invNotes, truncated } = await listSitePages(club, { limit: maxPages * 2 });
    notes.push(...invNotes);

    const selected = inventory.slice(0, maxPages);
    if (inventory.length > maxPages) {
        notes.push(`Se auditaron ${maxPages} de ${inventory.length} páginas; el resto entra en la próxima pasada.`);
    }
    if (truncated) notes.push('El sitio tiene más contenido del que cabe en un inventario; se priorizó lo más reciente.');

    const entries = [];
    const issues = [];

    for (const item of selected) {
        const page = await resolvePage({ club, pathname: item.path, host });
        if (!page.indexable) continue; // una página privada no se audita como pública
        const override = overrideByPath.get(page.path) || null;
        const meta = buildMetaSet({
            page, club, origin, config,
            overrides: override ? {
                title: override.title || undefined,
                description: override.description || undefined,
                image: override.image || undefined,
                canonical: override.canonical || undefined,
                keywords: override.keywords?.length ? override.keywords : undefined,
                indexable: override.indexable ?? undefined,
            } : {},
        });
        const { issues: pageIssues, body } = auditPage({ page, meta, override, config });
        issues.push(...pageIssues);
        entries.push({ page, meta, body, override });
    }

    issues.push(...auditDuplicates(entries));
    issues.push(...auditSiteLevel({ club, config, pages: selected }));

    const axisScores = scoreByAxis(issues, entries.length);
    const score = Math.round(
        Object.entries(SCORE_WEIGHTS).reduce((acc, [axis, w]) => acc + (axisScores[axis] / 100) * w, 0),
    );

    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    // La "salud" responde a otra pregunta que la nota: no «qué tan optimizado
    // está» sino «qué tan roto está». Un sitio puede tener nota media por
    // descripciones cortas —cosmético— y salud perfecta; o nota media por
    // canonicals rotas, y entonces la salud se desploma. Mezclarlas en un solo
    // número escondería justo lo que urge.
    const healthScore = Math.max(0, 100 - criticalCount * 25 - issues.filter(i => i.severity === 'high').length * 8);

    return {
        origin,
        pagesScanned: entries.length,
        inventory: selected,
        entries,
        issues,
        axisScores,
        score,
        healthScore: Math.round(healthScore),
        criticalCount,
        notes,
        summary: {
            byAxis: countBy(issues, 'axis'),
            bySeverity: countBy(issues, 'severity'),
            autoFixable: issues.filter(i => i.autoFixable).length,
            totalWords: entries.reduce((a, e) => a + (e.body?.wordCount || 0), 0),
            pagesWithBody: entries.filter(e => e.body?.hasBody).length,
        },
    };
}

// Se reexportan para que quien ya importaba de acá no tenga que cambiar, y
// porque son parte de la superficie natural del módulo de auditoría.
export { analyzeBody, scoreByAxis } from './seoRules.js';

export default { auditSite };
