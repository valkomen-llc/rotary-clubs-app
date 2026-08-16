// ════════════════════════════════════════════════════════════════════
// Espejo en el navegador de `server/lib/campaignPostSpec.js` — v4.833
//
// Sólo lo que la pantalla necesita para AVISAR EN VIVO con el mismo criterio
// del servidor: qué objetivos hay, cuántos indicadores entran, cuáles se pueden
// publicar y qué le falta a la campaña.
//
// Está duplicado A PROPÓSITO, igual que `contributionSpec.ts` y
// `emergencyFeed.ts`, y por el mismo motivo: el servidor no puede importar del
// bundle ni al revés. `test:campaign-post` carga los dos y compara LAS SALIDAS
// de las funciones — si cambia uno, cambiar el otro.
//
// Lo que NO está acá es `buildCampaignBrief`: es el prompt, se arma en el
// servidor y el navegador no tiene por qué poder reconstruirlo.
// ════════════════════════════════════════════════════════════════════

import { groupCenters, normalizeCenters, type ContributionCenter } from './contributionSpec';

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export interface CampaignStatLike {
    id: string;
    label: string;
    value: string;
    source: string;
    updatedAt: string;
    active?: boolean;
    metricKey?: string;
}

export interface Objective {
    id: string;
    label: string;
    help: string;
    needs: string[];
    layout: string;
}

export const OBJECTIVES: Record<string, Objective> = {
    sensibilizacion: {
        id: 'sensibilizacion', label: 'Sensibilización',
        help: 'Contexto, impacto humano y un llamado a la acción.',
        needs: [], layout: 'emergencia_cta',
    },
    recaudacion: {
        id: 'recaudacion', label: 'Recaudación',
        help: 'El aporte económico manda; el resto acompaña.',
        needs: ['donationCta'], layout: 'emergencia_cta',
    },
    ayuda_humanitaria: {
        id: 'ayuda_humanitaria', label: 'Ayuda humanitaria',
        help: 'Qué elementos se necesitan, con su detalle.',
        needs: ['requiredItems'], layout: 'elementos_requeridos',
    },
    panorama: {
        id: 'panorama', label: 'Panorama de la emergencia',
        help: 'Las cifras con su fuente, en primer plano.',
        needs: ['stats'], layout: 'impacto_estadistico',
    },
    centros: {
        id: 'centros', label: 'Centros de acopio',
        help: 'Dónde llevar lo que se dona.',
        needs: ['centers'], layout: 'centros_acopio',
    },
    impacto: {
        id: 'impacto', label: 'Impacto de la campaña',
        help: 'Lo que ya se logró, con sus aliados.',
        needs: ['stats'], layout: 'resultados',
    },
};

export const DEFAULT_OBJECTIVE = 'sensibilizacion';
export const OBJECTIVE_IDS = Object.keys(OBJECTIVES);
export const objectiveCatalog = () => OBJECTIVE_IDS.map(id => ({
    id, label: OBJECTIVES[id].label, help: OBJECTIVES[id].help, needs: OBJECTIVES[id].needs,
}));

export const AUDIENCES: Record<string, { id: string; label: string; help: string }> = {
    local: { id: 'local', label: 'Comunidad local', help: 'Quien vive cerca y puede acercarse a un punto de acopio.' },
    internacional: { id: 'internacional', label: 'Comunidad rotaria internacional', help: 'Clubes, distritos, socios, fundaciones y aliados de otros países.' },
};
export const DEFAULT_AUDIENCE = 'local';
export const AUDIENCE_IDS = Object.keys(AUDIENCES);
export const audienceCatalog = () => AUDIENCE_IDS.map(id => ({ id, label: AUDIENCES[id].label, help: AUDIENCES[id].help }));

export const LANGUAGES: Record<string, { id: string; label: string }> = {
    es: { id: 'es', label: 'Español' },
    en: { id: 'en', label: 'Inglés' },
};
export const DEFAULT_LANGUAGE = 'es';
export const LANGUAGE_IDS = Object.keys(LANGUAGES);
export const languageCatalog = () => LANGUAGE_IDS.map(id => ({ id, label: LANGUAGES[id].label }));

export const FORMAT_IDS = ['post_1_1', 'post_4_5'];
export const DEFAULT_FORMAT_ID = 'post_1_1';
export const isCampaignFormat = (id: string) => FORMAT_IDS.includes(id);

export interface Layout {
    id: string;
    label: string;
    summary: string;
    maxStats: number | Record<string, number>;
    maxItems: number | Record<string, number>;
    maxCities: number | Record<string, number>;
    maxCenters?: number | Record<string, number>;
    maxPartners?: number | Record<string, number>;
    wantsImage: boolean;
}

export const LAYOUTS: Record<string, Layout> = {
    impacto_estadistico: {
        id: 'impacto_estadistico', label: 'Impacto estadístico',
        summary: 'Las cifras mandan, con su fuente debajo.',
        maxStats: { post_1_1: 3, post_4_5: 4 }, maxItems: 0, maxCities: 0, wantsImage: true,
    },
    emergencia_cta: {
        id: 'emergencia_cta', label: 'Emergencia + llamado',
        summary: 'Título fuerte, fotografía, dos cifras y el botón.',
        maxStats: { post_1_1: 2, post_4_5: 3 }, maxItems: 0, maxCities: 0, wantsImage: true,
    },
    elementos_requeridos: {
        id: 'elementos_requeridos', label: 'Elementos que se requieren',
        summary: 'La lista de lo que se necesita, con su detalle.',
        maxStats: { post_1_1: 0, post_4_5: 2 },
        maxItems: { post_1_1: 4, post_4_5: 6 }, maxCities: 0, wantsImage: false,
    },
    centros_acopio: {
        id: 'centros_acopio', label: 'Centros de acopio',
        summary: 'Dónde llevar la donación: por ciudad en 1:1, con dirección en 4:5.',
        maxStats: 0, maxItems: 0,
        maxCities: { post_1_1: 5, post_4_5: 3 },
        maxCenters: { post_1_1: 0, post_4_5: 6 },
        wantsImage: false,
    },
    resultados: {
        id: 'resultados', label: 'Impacto de la campaña',
        summary: 'Lo logrado, con la frase institucional y los aliados.',
        maxStats: { post_1_1: 3, post_4_5: 4 }, maxItems: 0, maxCities: 0,
        maxPartners: { post_1_1: 4, post_4_5: 5 },
        wantsImage: true,
    },
};

export const LAYOUT_IDS = Object.keys(LAYOUTS);
export const layoutCatalog = () => LAYOUT_IDS.map(id => ({ id, label: LAYOUTS[id].label, summary: LAYOUTS[id].summary }));

export type CapacityKey = 'maxStats' | 'maxItems' | 'maxCities' | 'maxCenters' | 'maxPartners';

export const capacityOf = (layoutId: string, formatId: string, key: CapacityKey = 'maxStats'): number => {
    const l = LAYOUTS[layoutId];
    if (!l) return 0;
    const v = l[key];
    if (typeof v === 'number') return v;
    return Number((v as Record<string, number>)?.[formatId] ?? 0);
};

export function pickLayout({ objective, requested = null, formatId = DEFAULT_FORMAT_ID, stats = [], items = [], cities = 0 }: {
    objective?: string; requested?: string | null; formatId?: string; stats?: unknown[]; items?: unknown[]; cities?: number;
} = {}): { id: string; notes: string[]; capacity: number } {
    const notes: string[] = [];
    const obj = OBJECTIVES[objective || ''] || OBJECTIVES[DEFAULT_OBJECTIVE];
    let id = requested && LAYOUTS[requested] ? requested : obj.layout;

    if (id === 'elementos_requeridos' && !items.length) {
        notes.push('La campaña no tiene elementos requeridos activos: se usa la composición de emergencia.');
        id = 'emergencia_cta';
    }
    if (id === 'impacto_estadistico' && !stats.length) {
        notes.push('No hay indicadores publicables: se usa la composición de emergencia.');
        id = 'emergencia_cta';
    }
    if (id === 'resultados' && !stats.length) {
        notes.push('No hay indicadores publicables: se usa la composición de emergencia.');
        id = 'emergencia_cta';
    }
    if (id === 'centros_acopio' && !cities) {
        notes.push('La campaña no tiene centros publicados: se usa la composición de emergencia.');
        id = 'emergencia_cta';
    }
    return { id, notes, capacity: capacityOf(id, formatId) };
}

export function publishableStats(rawStats: unknown): { stats: CampaignStatLike[]; skipped: { id: string; label: string; reason: string }[] } {
    const ok: CampaignStatLike[] = [];
    const skipped: { id: string; label: string; reason: string }[] = [];
    arr<any>(rawStats).slice(0, 24).forEach((raw, i) => {
        const s: CampaignStatLike = {
            id: String(raw?.id ?? '').trim().slice(0, 40) || `stat-${i}`,
            label: String(raw?.label ?? '').trim().slice(0, 120),
            value: String(raw?.value ?? '').trim().slice(0, 60),
            source: String(raw?.source ?? '').trim().slice(0, 200),
            updatedAt: String(raw?.updatedAt ?? '').trim().slice(0, 40),
            active: raw?.active !== false,
        };
        if (!s.active) return;
        if (!s.label || !s.value) { skipped.push({ id: s.id, label: s.label || s.id, reason: 'le falta etiqueta o valor' }); return; }
        if (!s.source) { skipped.push({ id: s.id, label: s.label, reason: 'no tiene fuente registrada' }); return; }
        if (!s.updatedAt || Number.isNaN(new Date(s.updatedAt).getTime())) {
            skipped.push({ id: s.id, label: s.label, reason: 'no tiene fecha de actualización válida' });
            return;
        }
        ok.push(s);
    });
    return { stats: ok, skipped };
}

export function chooseStats(publishable: CampaignStatLike[], selectedIds: unknown, capacity: number): CampaignStatLike[] {
    const wanted = arr<unknown>(selectedIds).map(id => String(id));
    const pool = wanted.length ? publishable.filter(s => wanted.includes(s.id)) : publishable;
    return pool.slice(0, Math.max(0, capacity));
}

export function activeItems(content: any): { title: string; description: string }[] {
    return arr<any>(content?.requiredItems)
        .filter(it => it?.active !== false && it?.title)
        .map(it => ({ title: String(it.title), description: String(it.description || '') }));
}

export function centerSummary(centers: unknown, capacity: number): { cities: { city: string; count: number }[]; total: number; hidden: number } {
    const cities = groupCenters(normalizeCenters(centers).centers as ContributionCenter[]);
    const countOf = (g: any) => arr<any>(g.groups).reduce((n, grp) => n + arr<any>(grp.centers).length, 0);
    const total = cities.reduce((n, g) => n + countOf(g), 0);
    const shown = cities.slice(0, Math.max(0, capacity));
    return {
        cities: shown.map(g => ({ city: g.city, count: countOf(g) })),
        total,
        hidden: Math.max(0, cities.length - shown.length),
    };
}

export function validateBeforeGenerate({ campaign, objective, formatId, layoutId, imageUrl, stats, centerCount = null }: {
    campaign?: any; objective?: string; formatId?: string; layoutId?: string | null; imageUrl?: string; stats?: unknown[]; centerCount?: number | null;
} = {}): { ok: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!campaign?.id) errors.push('No hay campaña seleccionada.');
    const content = campaign?.content || {};
    const obj = OBJECTIVES[objective || ''] || OBJECTIVES[DEFAULT_OBJECTIVE];

    if (!isCampaignFormat(formatId || '')) {
        errors.push('El formato no es uno de los dos de este preset (1080×1080 o 1080×1350).');
    }
    if (layoutId && !LAYOUTS[layoutId]) errors.push('La composición elegida no existe.');

    if (!String(content?.hero?.title || '').trim()) errors.push('La campaña no tiene título: es lo que encabeza la pieza.');

    const { stats: publishable, skipped } = publishableStats(campaign?.stats);
    const chosen = arr<unknown>(stats).length ? arr<unknown>(stats) : publishable;

    for (const need of obj.needs) {
        if (need === 'stats' && !publishable.length) {
            errors.push('Este objetivo muestra cifras y la campaña no tiene ningún indicador publicable (con etiqueta, valor, fuente y fecha).');
        }
        if (need === 'requiredItems' && !activeItems(content).length) {
            errors.push('Este objetivo muestra los elementos que se requieren y la campaña no tiene ninguno activo.');
        }
        if (need === 'donationCta' && !content?.hero?.ctaPrimary?.label && !content?.donateCard?.buttonText) {
            warnings.push('La campaña no declara un botón de aporte: la pieza va a usar el llamado genérico.');
        }
        if (need === 'centers' && Number.isFinite(centerCount as number) && (centerCount as number) <= 0) {
            errors.push('Este objetivo muestra los centros de acopio y la campaña no tiene ninguno publicado.');
        }
    }

    for (const s of skipped) warnings.push(`El indicador «${s.label}» no se puede publicar porque ${s.reason}.`);

    const effective = layoutId || obj.layout;
    if (!imageUrl && LAYOUTS[effective]?.wantsImage) {
        warnings.push('Sin fotografía, la composición deja ese espacio al color de la campaña.');
    }
    if (chosen.length > capacityOf(effective, formatId || DEFAULT_FORMAT_ID)) {
        warnings.push(`Esta composición muestra ${capacityOf(effective, formatId || DEFAULT_FORMAT_ID)} indicadores; el resto no entra y no se dibuja.`);
    }

    return { ok: errors.length === 0, errors, warnings };
}

export function latestCut(stats: unknown): string {
    let best: number | null = null;
    for (const s of arr<any>(stats)) {
        const t = new Date(s?.updatedAt).getTime();
        if (Number.isNaN(t)) continue;
        if (best === null || t > best) best = t;
    }
    if (best === null) return '';
    const d = new Date(best);
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

export function campaignUrl(campaign: any, siteUrl: string): string {
    const base = String(siteUrl || '').trim().slice(0, 200).replace(/\/+$/, '');
    const slug = String(campaign?.slug || '').trim().slice(0, 120);
    if (!base) return '';
    return slug ? `${base}/maneras-de-contribuir?c=${encodeURIComponent(slug)}` : `${base}/maneras-de-contribuir`;
}

export default {
    OBJECTIVES, DEFAULT_OBJECTIVE, OBJECTIVE_IDS, objectiveCatalog,
    AUDIENCES, DEFAULT_AUDIENCE, AUDIENCE_IDS, audienceCatalog,
    LANGUAGES, DEFAULT_LANGUAGE, LANGUAGE_IDS, languageCatalog,
    FORMAT_IDS, DEFAULT_FORMAT_ID, isCampaignFormat,
    LAYOUTS, LAYOUT_IDS, layoutCatalog, capacityOf, pickLayout,
    publishableStats, chooseStats, activeItems, centerSummary,
    validateBeforeGenerate, latestCut, campaignUrl,
};
