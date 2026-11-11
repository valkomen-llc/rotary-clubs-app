// ═══════════════════════════════════════════════════════════
// AI Agent Command Center — Registro de agentes: EL CRITERIO (v4.1315.0)
//
// PURO: sin base, sin red, sin IA. Define qué es una plantilla de agente, en
// qué estados vive, en qué equipos se agrupa, con qué TIPOS DE SITIO se integra
// la plataforma, cómo se lee un perfil en Markdown (The Agency y las
// habilidades del repositorio) y cómo se migran los agentes heredados de la
// tabla "Agent" sin perder ninguna personalización.
//
// La separación central: una PLANTILLA dice qué es un agente (identidad,
// instrucciones, herramientas que pide) y una INSTALACIÓN dice dónde trabaja
// (la plataforma o un sitio), encendida o no, con qué ajustes. Antes cada club
// tenía su propia COPIA de cada agente y una corrección había que repetirla en
// cada copia —o se perdía, que es lo que hacía la siembra—.
// ═══════════════════════════════════════════════════════════

import { ENTITY_TYPES } from './entityTypes.js';

// ── Equipos ────────────────────────────────────────────────────────────
// Los ocho equipos del plan. El orden es el de la pantalla.
export const TEAMS = [
    { key: 'direccion', label: 'Dirección y estrategia', short: 'Dirección', help: 'Planeación, coordinación y seguimiento de metas.' },
    { key: 'comunicaciones', label: 'Comunicaciones', short: 'Comunicaciones', help: 'Contenido, marca, redes, SEO y boletines.' },
    { key: 'proyectos', label: 'Proyectos sociales', short: 'Proyectos', help: 'Formulación, evaluación, seguimiento e informes de proyectos.' },
    { key: 'eventos', label: 'Eventos', short: 'Eventos', help: 'Inscripciones, validación administrativa y comunicaciones de eventos.' },
    { key: 'membresia', label: 'Membresía', short: 'Membresía', help: 'Participación, acompañamiento y seguimiento de socios.' },
    { key: 'finanzas', label: 'Administración y finanzas', short: 'Finanzas', help: 'Revisión, conciliación y control documental. Sólo lectura.' },
    { key: 'tecnologia', label: 'Tecnología', short: 'Tecnología', help: 'Soporte, auditoría web, UX, seguridad y automatización.' },
    { key: 'analitica', label: 'Analítica', short: 'Analítica', help: 'Informes, tendencias y recomendaciones con evidencia.' },
];
export const TEAM_KEYS = TEAMS.map(t => t.key);

// ── Tipos de sitio integrables ─────────────────────────────────────────
// Salen de `ENTITY_TYPES`, el catálogo de tipos de sitio de la plataforma: un
// tipo nuevo aparece aquí sin tocar este archivo. La administración decide en
// «Tipos de sitio» con cuáles se integran los agentes; un tipo apagado deja a
// sus instalaciones en «Deshabilitado» (no las borra).
//
// Encendidos por omisión sólo `club` y `district`: son donde ya viven copias de
// los agentes heredados, y apagarlos al migrar dejaría sin agentes a quien ya
// los tenía. Los demás nacen apagados y se encienden a propósito.
export const DEFAULT_ENABLED_SITE_TYPES = ['club', 'district'];

export const SITE_TYPE_HINTS = {
    club: 'Clubes rotarios: comunicaciones, eventos y apoyo a la secretaría.',
    district: 'Distritos: planeación, informes distritales, comunicaciones y analítica de sus clubes.',
    association: 'Asociaciones y agrupaciones rotarias.',
    colrotarios: 'Colrotarios (Fundación).',
    'Evento o Convención': 'Sitios de un evento: inscripciones, validación y comunicaciones.',
    'Feria de Proyectos': 'Ferias de proyectos: postulaciones, evaluación e inscripciones.',
    'Programa de Intercambio': 'Programas de intercambio de jóvenes.',
    Zona: 'Zonas rotarias.',
};

export function siteTypeCatalog() {
    return ENTITY_TYPES.map(e => ({
        type: e.type,
        label: e.label,
        organizationType: e.organizationType,
        hint: SITE_TYPE_HINTS[e.type] || '',
        defaultEnabled: DEFAULT_ENABLED_SITE_TYPES.includes(e.type),
    }));
}

const norm = (s) => (s == null ? '' : String(s).trim().toLowerCase());

/** El tipo canónico de un sitio a partir de `Club.type` (tolera mayúsculas). */
export function canonicalSiteType(type) {
    const v = norm(type);
    if (!v) return 'club';
    const hit = ENTITY_TYPES.find(e => norm(e.type) === v || norm(e.organizationType) === v);
    return hit ? hit.type : String(type);
}

/**
 * La política efectiva de un tipo de sitio: la guardada, o la de omisión.
 * `allowedTeams` vacío = todos los equipos.
 */
export function effectiveSiteTypePolicy(saved, siteType) {
    const type = canonicalSiteType(siteType);
    if (saved) {
        return {
            siteType: type,
            enabled: Boolean(saved.enabled),
            allowedTeams: Array.isArray(saved.allowedTeams) ? saved.allowedTeams.filter(t => TEAM_KEYS.includes(t)) : [],
            notes: saved.notes || '',
            saved: true,
        };
    }
    return { siteType: type, enabled: DEFAULT_ENABLED_SITE_TYPES.includes(type), allowedTeams: [], notes: '', saved: false };
}

/** ¿Puede trabajar en un sitio de este tipo un agente de este equipo? */
export function siteTypeAllows(policy, team) {
    if (!policy || !policy.enabled) return false;
    if (!policy.allowedTeams || policy.allowedTeams.length === 0) return true;
    return policy.allowedTeams.includes(team);
}

// ── Plantillas ─────────────────────────────────────────────────────────
export const ORIGINS = {
    legacy: 'Agente heredado de Club Platform',
    agency: 'The Agency (importado y adaptado)',
    skill: 'Habilidad del repositorio (.agent/skills)',
    institutional: 'Institucional (Rotary / Club Platform)',
    custom: 'Personalizado',
};

/** Dónde puede instalarse: sólo en la plataforma, sólo en sitios o en ambos. */
export const LEVELS = {
    platform: 'Sólo administración central',
    site: 'Sitios (clubes, distritos y demás tipos habilitados)',
    any: 'Plataforma y sitios',
};

export const TEMPLATE_STATES = {
    draft: 'Borrador',
    review: 'En revisión',
    published: 'Publicada',
    retired: 'Retirada',
};

const TRANSITIONS = {
    draft: ['review', 'published'],
    review: ['draft', 'published'],
    published: ['retired'],
    retired: ['published', 'draft'],
};
export function canTransitionTemplate(from, to) {
    return (TRANSITIONS[from] || []).includes(to);
}

/** Lo que se puede escribir en el borrador de una plantilla. Lista CERRADA. */
export const DRAFT_FIELDS = ['name', 'role', 'description', 'systemPrompt', 'greeting', 'capabilities', 'skills', 'toolRequests', 'modelPolicy', 'approvalPolicy'];

export function slugify(s) {
    return String(s || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'agente';
}

const clip = (v, max) => (v == null ? '' : String(v)).slice(0, max);
const strList = (v, max = 40, len = 80) => (Array.isArray(v) ? v : [])
    .map(x => String(x || '').trim()).filter(Boolean).slice(0, max).map(x => x.slice(0, len));

/** Sanea un borrador. Devuelve `{ draft, errors }`; nada fuera de DRAFT_FIELDS. */
export function sanitizeDraft(input = {}, base = {}) {
    const d = { ...base };
    const errors = [];
    if ('name' in input) d.name = clip(input.name, 100).trim();
    if ('role' in input) d.role = clip(input.role, 200).trim();
    if ('description' in input) d.description = clip(input.description, 2000);
    if ('systemPrompt' in input) d.systemPrompt = clip(input.systemPrompt, 60000);
    if ('greeting' in input) d.greeting = clip(input.greeting, 1000);
    if ('capabilities' in input) d.capabilities = strList(input.capabilities);
    if ('skills' in input) d.skills = strList(input.skills, 30, 80);
    if ('toolRequests' in input) {
        d.toolRequests = (Array.isArray(input.toolRequests) ? input.toolRequests : [])
            .filter(t => t && typeof t.tool === 'string')
            .slice(0, 40)
            .map(t => ({ tool: String(t.tool).slice(0, 80), mode: ['read', 'draft', 'act_with_approval'].includes(t.mode) ? t.mode : 'read' }));
    }
    if ('modelPolicy' in input) {
        const m = input.modelPolicy || {};
        d.modelPolicy = { preferred: m.preferred ? String(m.preferred).slice(0, 80) : null, allowFallback: m.allowFallback !== false };
    }
    if ('approvalPolicy' in input) {
        const a = input.approvalPolicy || {};
        d.approvalPolicy = { autoApproveN2: Boolean(a.autoApproveN2) };
    }
    if (!d.name) errors.push('El nombre es obligatorio.');
    if (!d.role) errors.push('El rol es obligatorio.');
    return { draft: d, errors };
}

/** ¿Está lista para publicarse? Lo que falta, con nombre. */
export function templateReadiness(t = {}) {
    const d = t.draft || {};
    const missing = [];
    if (!d.name) missing.push('nombre');
    if (!d.role) missing.push('rol');
    if (!d.systemPrompt || String(d.systemPrompt).trim().length < 40) missing.push('instrucciones (mínimo 40 caracteres)');
    if (!t.team || !TEAM_KEYS.includes(t.team)) missing.push('equipo');
    return { ready: missing.length === 0, missing };
}

// ── Estados de una instalación ─────────────────────────────────────────
export const INSTALLATION_STATES = {
    available: { label: 'Disponible', help: 'Publicada en el catálogo y sin instalar en este ámbito.' },
    installed: { label: 'Instalado', help: 'Tiene instalación, pero le falta un responsable o una versión publicada.' },
    configured: { label: 'Configurado', help: 'La instalación está completa y apagada.' },
    profile_only: { label: 'Solo perfil', help: 'Encendido, pero sin herramientas ni ejecución: sólo conversa.' },
    active: { label: 'Activo', help: 'Encendido y aceptando tareas.' },
    running: { label: 'Ejecutando', help: 'Tiene una ejecución en curso.' },
    error: { label: 'Con error', help: 'Su última ejecución falló o se rompió un requisito.' },
    disabled: { label: 'Deshabilitado', help: 'Apagado por una persona o por una política.' },
};

/**
 * El estado que se PINTA. Se deriva, no se guarda: guardado se desactualizaría
 * en cuanto cambie la política del tipo de sitio o se retire la plantilla.
 * `runtime` = { running, lastError } (Fase 2); sin runtime, nunca «Activo».
 */
export function installationState({ installation, template, policy, toolCount = 0, runtime = null }) {
    if (!installation) return { state: 'available', reason: '' };
    if (template?.status === 'retired') return { state: 'disabled', reason: 'La plantilla fue retirada.' };
    if (policy && installation.scopeType === 'site' && !policy.enabled) return { state: 'disabled', reason: 'Su tipo de sitio no está integrado con los agentes.' };
    if (policy && installation.scopeType === 'site' && !siteTypeAllows(policy, template?.team)) return { state: 'disabled', reason: 'Su equipo no está permitido para este tipo de sitio.' };
    if (installation.disabledReason) return { state: 'disabled', reason: installation.disabledReason };
    if (!installation.versionId) return { state: 'installed', reason: 'La plantilla no tiene una versión publicada.' };
    if (!installation.enabled) return { state: installation.responsibleUserId || installation.scopeType === 'platform' ? 'configured' : 'installed', reason: installation.responsibleUserId || installation.scopeType === 'platform' ? '' : 'Falta elegir un responsable.' };
    if (runtime?.running) return { state: 'running', reason: '' };
    if (runtime?.lastError) return { state: 'error', reason: String(runtime.lastError).slice(0, 300) };
    if (!runtime?.available || toolCount === 0) return { state: 'profile_only', reason: toolCount === 0 ? 'Sin herramientas concedidas.' : 'El motor de ejecución todavía no está activo.' };
    return { state: 'active', reason: '' };
}

// ── Markdown con frontmatter (The Agency y .agent/skills) ──────────────
const MAX_MD = 120_000;

/** Lee `---\nclave: valor\n---\ncuerpo`. Tolera comillas. Nunca ejecuta nada. */
export function parseAgentMarkdown(text) {
    const src = String(text || '').replace(/\r\n/g, '\n').slice(0, MAX_MD);
    const meta = {};
    let body = src;
    const m = /^---\n([\s\S]*?)\n---\n?/.exec(src);
    if (m) {
        body = src.slice(m[0].length);
        for (const line of m[1].split('\n')) {
            const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
            if (!kv) continue;
            let v = kv[2].trim();
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
            if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map(x => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
            meta[kv[1].toLowerCase()] = v;
        }
    }
    return { meta, body: body.trim() };
}

// ── The Agency (msitarzewski/agency-agents) ────────────────────────────
// FIJADA a un commit: lo que se importa hoy es lo mismo que se importa mañana.
// MIT: la atribución viaja en `sourceRef` y se muestra en la plantilla.
// Lista CURADA (plan §3): lo que aporta a clubes y distritos. Desarrollo de
// juegos, computación espacial, plataformas chinas y ventas B2B quedan fuera.
export const AGENCY_SOURCE = {
    owner: 'msitarzewski',
    repo: 'agency-agents',
    ref: '8ae6164602c95ca78828b148b9052460ee426885',
    license: 'MIT',
    curated: [
        { path: 'specialized/agents-orchestrator.md', team: 'direccion', fits: 'Elena (coordinación de workflows)' },
        { path: 'design/design-brand-guardian.md', team: 'comunicaciones', fits: 'Diana (identidad institucional)' },
        { path: 'marketing/marketing-seo-specialist.md', team: 'comunicaciones', fits: 'Martín (SEO)' },
        { path: 'marketing/marketing-ai-citation-strategist.md', team: 'comunicaciones', fits: 'Martín (visibilidad en buscadores con IA)' },
        { path: 'marketing/marketing-social-media-strategist.md', team: 'comunicaciones', fits: 'Andrés (redes)' },
        { path: 'marketing/marketing-content-creator.md', team: 'comunicaciones', fits: 'Rafael (redacción)' },
        { path: 'engineering/engineering-technical-writer.md', team: 'comunicaciones', fits: 'Documentación y guías' },
        { path: 'marketing/marketing-email-strategist.md', team: 'comunicaciones', fits: 'Isabel (boletines)' },
        { path: 'paid-media/paid-media-auditor.md', team: 'analitica', fits: 'Lucía (pauta)' },
        { path: 'support/support-support-responder.md', team: 'tecnologia', fits: 'Diego y Antigravity (soporte)' },
        { path: 'support/support-analytics-reporter.md', team: 'analitica', fits: 'Reportes' },
        { path: 'support/support-executive-summary-generator.md', team: 'analitica', fits: 'Resúmenes ejecutivos' },
        { path: 'support/support-finance-tracker.md', team: 'finanzas', fits: 'Revisión financiera (lectura)' },
        { path: 'finance/finance-bookkeeper-controller.md', team: 'finanzas', fits: 'Conciliación (lectura)' },
        { path: 'testing/testing-evidence-collector.md', team: 'analitica', fits: 'Verificador de evidencias' },
        { path: 'testing/testing-reality-checker.md', team: 'analitica', fits: 'Verificador de afirmaciones' },
        { path: 'project-management/project-management-project-shepherd.md', team: 'proyectos', fits: 'Seguimiento de proyectos' },
        { path: 'product/product-feedback-synthesizer.md', team: 'proyectos', fits: 'Síntesis de observaciones' },
        { path: 'testing/testing-accessibility-auditor.md', team: 'tecnologia', fits: 'Valentina (accesibilidad)' },
        { path: 'design/design-ux-researcher.md', team: 'tecnologia', fits: 'Valentina (UX)' },
        { path: 'security/security-compliance-auditor.md', team: 'tecnologia', fits: 'Cumplimiento' },
        { path: 'engineering/engineering-privacy-engineer.md', team: 'tecnologia', fits: 'Protección de datos' },
    ],
};

export function agencyRawUrl(path) {
    const p = String(path || '');
    if (!/^[a-z0-9-]+\/[a-z0-9-]+\.md$/.test(p)) return null;
    return `https://raw.githubusercontent.com/${AGENCY_SOURCE.owner}/${AGENCY_SOURCE.repo}/${AGENCY_SOURCE.ref}/${p}`;
}

/** ¿Está en la lista curada? El importador SÓLO importa de la lista. */
export function agencyCuratedEntry(path) {
    return AGENCY_SOURCE.curated.find(c => c.path === path) || null;
}

/** Un perfil de The Agency → borrador de plantilla (en inglés hasta adaptarlo). */
export function draftFromAgencyMarkdown(path, text) {
    const entry = agencyCuratedEntry(path);
    const { meta, body } = parseAgentMarkdown(text);
    const name = String(meta.name || path.split('/').pop().replace(/\.md$/, '')).slice(0, 100);
    return {
        key: 'agency-' + slugify(path.replace(/\.md$/, '').split('/').pop()),
        team: entry?.team || 'tecnologia',
        level: 'any',
        origin: 'agency',
        sourceRef: { kind: 'agency', owner: AGENCY_SOURCE.owner, repo: AGENCY_SOURCE.repo, ref: AGENCY_SOURCE.ref, path, license: AGENCY_SOURCE.license, fits: entry?.fits || null },
        avatarColor: typeof meta.color === 'string' && /^#?[0-9a-f]{6}$/i.test(meta.color) ? (meta.color.startsWith('#') ? meta.color : '#' + meta.color) : null,
        draft: {
            name,
            role: String(meta.description || name).slice(0, 200),
            description: String(meta.description || '').slice(0, 2000),
            systemPrompt: body.slice(0, 60000),
            greeting: '',
            capabilities: [],
            skills: [],
            toolRequests: [],
            modelPolicy: { preferred: null, allowFallback: true },
            approvalPolicy: { autoApproveN2: false },
            needsAdaptation: true,
        },
    };
}

// ── Migración de los agentes heredados ─────────────────────────────────
// El equipo de cada agente heredado. Por nombre primero (el plan los ubicó uno
// por uno); si no está, por su categoría vieja.
export const LEGACY_TEAM_BY_NAME = {
    'antigravity ai': 'tecnologia', 'daniel peña': 'direccion', diana: 'comunicaciones', elena: 'direccion',
    'andrés': 'comunicaciones', 'martín': 'comunicaciones', 'lucía': 'analitica', isabel: 'comunicaciones',
    rafael: 'comunicaciones', santiago: 'tecnologia', valentina: 'tecnologia', 'sebastián': 'tecnologia',
    carlos: 'tecnologia', camila: 'comunicaciones', mateo: 'direccion', 'sofía': 'comunicaciones',
    diego: 'tecnologia', valeria: 'comunicaciones',
};
export const LEGACY_TEAM_BY_CATEGORY = {
    'dirección': 'direccion', direccion: 'direccion', 'producción': 'comunicaciones', produccion: 'comunicaciones',
    'difusión': 'comunicaciones', difusion: 'comunicaciones', 'tecnología': 'tecnologia', tecnologia: 'tecnologia',
    premium_b2b: 'direccion',
};
/** Los que sólo tienen sentido en la administración central (plan §5b). */
export const LEGACY_PLATFORM_ONLY = ['antigravity ai', 'santiago', 'sebastián', 'carlos', 'mateo', 'diego'];

export function legacyTeam(row) {
    return LEGACY_TEAM_BY_NAME[norm(row?.name)] || LEGACY_TEAM_BY_CATEGORY[norm(row?.category)] || 'comunicaciones';
}

export function legacyTemplateKey(name) {
    return 'legacy-' + slugify(name);
}

const LEGACY_FIELDS = ['role', 'description', 'systemPrompt', 'greeting', 'capabilities', 'aiModel'];
const sameVal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Lo que una copia de club cambió respecto del agente global del mismo nombre. */
export function legacyOverrides(clubRow, globalRow) {
    const o = {};
    for (const f of LEGACY_FIELDS) {
        const a = f === 'capabilities' ? (clubRow?.[f] || []) : (clubRow?.[f] ?? null);
        const b = f === 'capabilities' ? (globalRow?.[f] || []) : (globalRow?.[f] ?? null);
        if (!sameVal(a, b)) o[f] = a;
    }
    return o;
}

/**
 * El PLAN de migración, puro. Entrada: las filas de "Agent". Salida: plantillas
 * a crear (una por nombre global, una por agente propio de un club) e
 * instalaciones (una por fila), con los ajustes de cada copia de club.
 * Idempotente por `legacyAgentId`: quien lo ejecuta salta lo ya migrado.
 */
export function planLegacyMigration(rows = []) {
    const globals = rows.filter(r => !r.clubId);
    const clubs = rows.filter(r => r.clubId);
    const byName = new Map(globals.map(g => [norm(g.name), g]));
    const templates = [];
    const installations = [];

    for (const g of globals) {
        const platformOnly = LEGACY_PLATFORM_ONLY.includes(norm(g.name));
        templates.push({
            key: legacyTemplateKey(g.name),
            team: legacyTeam(g),
            level: platformOnly ? 'platform' : 'any',
            origin: 'legacy',
            legacyAgentId: String(g.id),
            ownerSiteId: null,
            avatarSeed: g.avatarSeed || g.name,
            avatarColor: g.avatarColor || null,
            sourceRef: { kind: 'legacy', category: g.category || null, order: g.order ?? 0 },
            draft: {
                name: g.name, role: g.role || '', description: g.description || '', systemPrompt: g.systemPrompt || '',
                greeting: g.greeting || '', capabilities: g.capabilities || [], skills: [], toolRequests: [],
                modelPolicy: { preferred: g.aiModel || null, allowFallback: true }, approvalPolicy: { autoApproveN2: false },
            },
        });
        installations.push({ templateKey: legacyTemplateKey(g.name), scopeType: 'platform', siteId: null, enabled: g.active !== false, legacyAgentId: String(g.id), overrides: {} });
    }

    const ownKeys = new Set();
    for (const c of clubs) {
        const g = byName.get(norm(c.name));
        if (g) {
            installations.push({ templateKey: legacyTemplateKey(g.name), scopeType: 'site', siteId: String(c.clubId), enabled: c.active !== false, legacyAgentId: String(c.id), overrides: legacyOverrides(c, g) });
            continue;
        }
        // Un agente PROPIO del club (no hay global con su nombre): plantilla de
        // ese club, sólo instalable allí.
        const key = `custom-${slugify(c.name)}-${String(c.clubId).slice(0, 8)}`;
        if (!ownKeys.has(key)) {
            ownKeys.add(key);
            templates.push({
                key, team: legacyTeam(c), level: 'site', origin: 'custom', legacyAgentId: String(c.id), ownerSiteId: String(c.clubId),
                avatarSeed: c.avatarSeed || c.name, avatarColor: c.avatarColor || null,
                sourceRef: { kind: 'legacy-club', category: c.category || null },
                draft: {
                    name: c.name, role: c.role || '', description: c.description || '', systemPrompt: c.systemPrompt || '',
                    greeting: c.greeting || '', capabilities: c.capabilities || [], skills: [], toolRequests: [],
                    modelPolicy: { preferred: c.aiModel || null, allowFallback: true }, approvalPolicy: { autoApproveN2: false },
                },
            });
        }
        installations.push({ templateKey: key, scopeType: 'site', siteId: String(c.clubId), enabled: c.active !== false, legacyAgentId: String(c.id), overrides: {} });
    }
    return { templates, installations };
}

// ── Auditoría ──────────────────────────────────────────────────────────
export const AUDIT_ACTIONS = {
    template_created: 'Plantilla creada',
    template_draft_saved: 'Borrador guardado',
    template_status: 'Estado de la plantilla cambiado',
    template_published: 'Versión publicada',
    template_imported: 'Plantilla importada',
    installation_created: 'Instalación creada',
    installation_updated: 'Instalación actualizada',
    installation_removed: 'Instalación retirada',
    site_type_policy: 'Integración por tipo de sitio cambiada',
    setting_changed: 'Ajuste cambiado',
    legacy_migrated: 'Agentes heredados migrados',
    tool_grant: 'Herramienta concedida',
    tool_revoke: 'Herramienta retirada',
    approval_executed: 'Aprobación ejecutada',
    approval_rejected: 'Aprobación rechazada',
    task_cancelled: 'Tarea cancelada',
    task_retried: 'Tarea reintentada',
    workflow_run: 'Workflow ejecutado',
    schedule_saved: 'Programación guardada',
    schedule_deleted: 'Programación eliminada',
    report_validated: 'Informe validado',
    rollout_created: 'Despliegue creado',
    rollout_wave: 'Oleada desplegada',
    rollout_paused: 'Despliegue pausado',
    rollout_rolled_back: 'Despliegue revertido',
};

// ── Ajustes de la plataforma ───────────────────────────────────────────
export const SETTINGS_DEFAULTS = {
    killSwitch: false,          // apaga TODA ejecución de agentes en la plataforma
    defaultModel: null,         // slug de ai_model_configs; null = el del enrutador
    allowAgencyImport: true,
};
export function sanitizeSettings(input = {}, base = SETTINGS_DEFAULTS) {
    const s = { ...SETTINGS_DEFAULTS, ...base };
    if ('killSwitch' in input) s.killSwitch = Boolean(input.killSwitch);
    if ('defaultModel' in input) s.defaultModel = input.defaultModel ? String(input.defaultModel).slice(0, 80) : null;
    if ('allowAgencyImport' in input) s.allowAgencyImport = Boolean(input.allowAgencyImport);
    return s;
}
