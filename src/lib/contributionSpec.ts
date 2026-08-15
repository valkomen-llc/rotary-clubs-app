// ════════════════════════════════════════════════════════════════════
// Campañas de Contribución — espejo mínimo en el navegador
// v4.803.0
//
// Duplicado A PROPÓSITO de server/lib/contributionSpec.js, igual que
// designSpec.ts y ADMIN_ROLES: el servidor decide qué se guarda y qué se
// sirve; este espejo decide qué se PINTA (catálogos del editor, estado
// efectivo en el listado, avisos de validación mientras se escribe).
// Si cambia uno, cambiar el otro — lo comprueba `npm run test:contribution`
// comparando las SALIDAS de las funciones, no sólo las constantes.
//
// Lo que NO está acá, a propósito: `targetsSite` y `resolveForSite` (el
// alcance y la mezcla los resuelve el servidor — la pantalla no debe poder
// razonar sobre sitios ajenos) y `sanitizeOverride` (la whitelist la impone
// el endpoint).
// ════════════════════════════════════════════════════════════════════

export interface CampaignType { id: string; label: string; emergency: boolean; }

// Los desastres son la lista de emergencySpec.js (Creador de Reels); los
// institucionales, propios del módulo. El espejo lleva la lista APLANADA
// porque el navegador no importa módulos del servidor.
export const CAMPAIGN_TYPES: Record<string, CampaignType> = {
    terremoto: { id: 'terremoto', label: 'Terremoto', emergency: true },
    tsunami: { id: 'tsunami', label: 'Tsunami o maremoto', emergency: true },
    inundacion: { id: 'inundacion', label: 'Inundación', emergency: true },
    huracan: { id: 'huracan', label: 'Huracán o ciclón', emergency: true },
    tornado: { id: 'tornado', label: 'Tornado', emergency: true },
    incendio: { id: 'incendio', label: 'Incendio forestal', emergency: true },
    deslizamiento: { id: 'deslizamiento', label: 'Deslizamiento de tierra', emergency: true },
    erupcion: { id: 'erupcion', label: 'Erupción volcánica', emergency: true },
    sequia: { id: 'sequia', label: 'Sequía', emergency: true },
    avalancha: { id: 'avalancha', label: 'Avalancha', emergency: true },
    tormenta: { id: 'tormenta', label: 'Tormenta severa o granizada', emergency: true },
    humanitaria: { id: 'humanitaria', label: 'Emergencia humanitaria', emergency: false },
    social: { id: 'social', label: 'Proyecto social', emergency: false },
    salud: { id: 'salud', label: 'Campaña de salud', emergency: false },
    agua: { id: 'agua', label: 'Agua y saneamiento', emergency: false },
    educacion: { id: 'educacion', label: 'Educación', emergency: false },
    alimentacion: { id: 'alimentacion', label: 'Alimentación', emergency: false },
    reconstruccion: { id: 'reconstruccion', label: 'Reconstrucción', emergency: false },
    fondo: { id: 'fondo', label: 'Fondo especial', emergency: false },
    internacional: { id: 'internacional', label: 'Campaña internacional', emergency: false },
    otro: { id: 'otro', label: 'Otra campaña', emergency: false },
};

export const DEFAULT_CAMPAIGN_TYPE = 'otro';
export const campaignTypeCatalog = (): CampaignType[] => Object.values(CAMPAIGN_TYPES);

export type CampaignStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'finished' | 'archived';
export const CAMPAIGN_STATUSES: CampaignStatus[] = ['draft', 'scheduled', 'active', 'paused', 'finished', 'archived'];

export const STATUS_LABELS: Record<CampaignStatus, string> = {
    draft: 'Borrador',
    scheduled: 'Programada',
    active: 'Activa',
    paused: 'Pausada',
    finished: 'Finalizada',
    archived: 'Archivada',
};

const STATUS_FLOW: Record<CampaignStatus, CampaignStatus[]> = {
    draft: ['scheduled', 'active', 'archived'],
    scheduled: ['draft', 'active', 'paused', 'archived'],
    active: ['paused', 'finished', 'archived'],
    paused: ['active', 'finished', 'archived'],
    finished: ['archived', 'draft'],
    archived: ['draft'],
};

export const canTransition = (from: string, to: string): boolean =>
    Array.isArray(STATUS_FLOW[from as CampaignStatus]) && STATUS_FLOW[from as CampaignStatus].includes(to as CampaignStatus);

export interface CampaignLike {
    status?: string;
    startAt?: string | null;
    endAt?: string | null;
}

/** El estado EFECTIVO — misma aritmética que el servidor. */
export function effectiveStatus(campaign: CampaignLike | null | undefined, now: Date): string {
    const status = String(campaign?.status || 'draft');
    if (!CAMPAIGN_STATUSES.includes(status as CampaignStatus)) return 'draft';
    if (status !== 'scheduled' && status !== 'active') return status;

    const startAt = campaign?.startAt ? new Date(campaign.startAt) : null;
    const endAt = campaign?.endAt ? new Date(campaign.endAt) : null;

    if (endAt && !Number.isNaN(endAt.getTime()) && now >= endAt) return 'finished';
    if (startAt && !Number.isNaN(startAt.getTime()) && now < startAt) return 'scheduled';
    return 'active';
}

export type TargetingMode = 'all' | 'districts' | 'clubs';
export const TARGETING_MODES: TargetingMode[] = ['all', 'districts', 'clubs'];

export const TARGETING_LABELS: Record<TargetingMode, string> = {
    all: 'Todos los sitios',
    districts: 'Sitios de distritos',
    clubs: 'Sitios específicos',
};

export interface CampaignStat {
    id: string; label: string; value: string; source: string; updatedAt: string; active: boolean;
}

/** Aviso en vivo del editor — el mismo criterio Y los mismos mensajes que el
 *  servidor, incluido el id de respaldo `stat-N` para un indicador sin
 *  etiqueta. Si los mensajes divergen, el editor avisa una cosa y publicar
 *  rechaza otra. */
export function validateStats(stats: Partial<CampaignStat>[] | undefined): string[] {
    const errors: string[] = [];
    const list = Array.isArray(stats) ? stats : [];
    for (let i = 0; i < list.length; i++) {
        const s = list[i] || {};
        if (s.active === false) continue;
        const label = String(s.label || '');
        const value = String(s.value || '');
        if (!label || !value) {
            errors.push(`El indicador «${label || String(s.id || '') || `stat-${i}`}» necesita etiqueta y valor.`);
            continue;
        }
        if (!String(s.source || '')) errors.push(`El indicador «${label}» no tiene fuente: sin fuente no se publica.`);
        if (!s.updatedAt || Number.isNaN(new Date(s.updatedAt).getTime())) {
            errors.push(`El indicador «${label}» necesita fecha de actualización válida.`);
        }
    }
    return errors;
}

export function acceptableCtaUrl(url: string | undefined): boolean {
    const s = String(url ?? '').trim();
    if (!s) return false;
    if (/^https?:\/\//i.test(s)) return true;
    if (s.startsWith('//')) return false;
    if (s.startsWith('/')) return true;
    return false;
}

export function hexOrEmpty(v: string | undefined): string {
    const s = String(v ?? '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(s) ? s : '';
}

export function slugify(name: string): string {
    return String(name || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'campana';
}
