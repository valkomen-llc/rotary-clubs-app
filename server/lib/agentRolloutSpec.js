// ═══════════════════════════════════════════════════════════
// AI Agent Command Center — despliegues y mapa: EL CRITERIO (v4.1317.0)
//
// PURO. Reemplaza «Desplegar a todos los clubes» (que copiaba 17 agentes a cada
// club activo de una vez, sin reversión) por un DESPLIEGUE con nombre, destino
// por tipo de sitio, oleadas, confirmación explícita, compuerta de salud y
// reversión. Y arma el grafo del mapa de agentes SÓLO con datos reales.
// ═══════════════════════════════════════════════════════════

import crypto from 'node:crypto';

// ── Plantillas de equipo (plan §15) ────────────────────────────────────
// Claves de plantilla. Las que no existan o no estén publicadas se informan
// como faltantes al planear: un equipo no promete un agente que no hay.
export const TEAM_PRESETS = {
    club_basico: { label: 'Equipo básico de club', siteTypes: ['club'], templates: ['pilot-comunicaciones', 'pilot-validacion-inscripciones', 'legacy-diana', 'legacy-sofia'], help: 'Comunicaciones, eventos y apoyo administrativo.' },
    gestion_distrital: { label: 'Equipo de gestión distrital', siteTypes: ['district'], templates: ['pilot-informes-distritales', 'pilot-comunicaciones', 'pilot-validacion-inscripciones', 'legacy-elena', 'legacy-diana'], help: 'Planeación, informes distritales, comunicaciones y analítica.' },
    proyectos: { label: 'Equipo de proyectos', siteTypes: ['Feria de Proyectos', 'district', 'club'], templates: ['pilot-evaluacion-postulaciones', 'pilot-formulacion-proyectos', 'pilot-validacion-inscripciones'], help: 'Formulación, evaluación, seguimiento e informes.' },
    eventos: { label: 'Equipo de eventos', siteTypes: ['Evento o Convención'], templates: ['pilot-validacion-inscripciones', 'pilot-comunicaciones'], help: 'Inscripciones, validación y comunicaciones del evento.' },
    administracion_central: { label: 'Equipo de administración central', siteTypes: [], platform: true, templates: ['legacy-antigravity-ai', 'pilot-auditoria-web', 'legacy-martin'], help: 'Soporte, auditoría web y SEO, analítica del ecosistema. Sólo nivel central.' },
};

export const ROLLOUT_STATES = {
    draft: 'Borrador', running: 'En oleadas', paused: 'Pausado', completed: 'Completado', rolled_back: 'Revertido',
};

/** Oleadas por omisión: 1 sitio piloto → 25 % → 100 %. */
export const DEFAULT_WAVES = [{ count: 1 }, { percent: 25 }, { percent: 100 }];
export const HEALTH_MAX_FAILURE_RATIO = 0.2;

const hashOf = (s) => crypto.createHash('sha1').update(String(s)).digest('hex');

/**
 * Reparte los sitios en oleadas ACUMULATIVAS y DETERMINISTAS (el mismo
 * despliegue elige los mismos sitios: se puede explicar y repetir).
 * `waves` = [{ count } | { percent }]. Toda oleada tiene al menos 1 sitio
 * nuevo mientras queden; la última siempre llega al 100 %.
 */
export function planWaves(siteIds = [], waves = DEFAULT_WAVES) {
    const ordered = [...new Set(siteIds.map(String))].sort((a, b) => hashOf(a).localeCompare(hashOf(b)));
    const total = ordered.length;
    const out = [];
    let taken = 0;
    const list = (Array.isArray(waves) && waves.length ? waves : DEFAULT_WAVES).slice(0, 6);
    list.forEach((w, i) => {
        const last = i === list.length - 1;
        let upTo = last ? total : (w.count != null ? taken + Math.max(1, Math.floor(w.count)) : Math.ceil(total * Math.min(100, Math.max(1, Number(w.percent) || 100)) / 100));
        upTo = Math.min(total, Math.max(upTo, taken + (taken < total ? 1 : 0)));
        out.push(ordered.slice(taken, upTo));
        taken = upTo;
    });
    return out.filter((w, i) => w.length > 0 || i === 0);
}

/** ¿Se puede pasar a la oleada siguiente? Mira las ejecuciones de lo ya desplegado. */
export function healthGate({ runs = 0, failed = 0 } = {}) {
    if (runs < 5) return { ok: true, reason: `Pocas ejecuciones todavía (${runs}); se puede avanzar con criterio.` };
    const ratio = failed / runs;
    if (ratio > HEALTH_MAX_FAILURE_RATIO) return { ok: false, reason: `El ${Math.round(ratio * 100)} % de las ejecuciones de lo desplegado falló (tope ${HEALTH_MAX_FAILURE_RATIO * 100} %). Revisa antes de seguir.` };
    return { ok: true, reason: `${Math.round(ratio * 100)} % de fallas en ${runs} ejecuciones.` };
}

/**
 * Valida un despliegue. Devuelve { ok, errors, normalized }.
 * Confirmar exige ESCRIBIR el número de sitios cuando son más de uno.
 */
export function validateRollout(input = {}, { knownTemplateKeys = [], knownSiteTypes = [] } = {}) {
    const errors = [];
    const name = String(input.name || '').trim().slice(0, 120);
    if (name.length < 3) errors.push('Ponle un nombre al despliegue.');
    const preset = input.preset && TEAM_PRESETS[input.preset] ? input.preset : null;
    const templateKeys = [...new Set([...(preset ? TEAM_PRESETS[preset].templates : []), ...(Array.isArray(input.templateKeys) ? input.templateKeys : [])].map(String))];
    if (!templateKeys.length) errors.push('Elige al menos un agente o una plantilla de equipo.');
    const missing = templateKeys.filter(k => !knownTemplateKeys.includes(k));
    const siteTypes = (Array.isArray(input.siteTypes) ? input.siteTypes : []).filter(t => knownSiteTypes.includes(t));
    const siteIds = (Array.isArray(input.siteIds) ? input.siteIds : []).map(String).filter(Boolean).slice(0, 2000);
    const platform = Boolean(input.platform || (preset && TEAM_PRESETS[preset].platform));
    if (!platform && !siteTypes.length && !siteIds.length) errors.push('Elige el destino: tipos de sitio o sitios concretos.');
    const waves = Array.isArray(input.waves) && input.waves.length ? input.waves.slice(0, 6) : DEFAULT_WAVES;
    return {
        ok: errors.length === 0,
        errors,
        normalized: {
            name, preset, templateKeys: templateKeys.filter(k => knownTemplateKeys.includes(k)), missingTemplates: missing,
            siteTypes, siteIds, platform, waves, autoActivate: Boolean(input.autoActivate),
        },
    };
}

export function confirmationOk({ targets, confirmCount }) {
    if (targets <= 1) return true;
    return Number(confirmCount) === targets;
}

// ── Mapa de agentes (Agent Network) ────────────────────────────────────
/**
 * El grafo SALE DE LOS DATOS: una arista agente→herramienta existe sólo si hay
 * una concesión real; herramienta→módulo, por el catálogo. Estilos:
 *   'active'  la concesión existe y alguna instalación que la tiene está activa
 *   'idle'    existe, pero ninguna de sus instalaciones está activa
 *   'broken'  la instalación está «Con error»
 */
export function buildNetwork({ teams = [], templates = [], installations = [], grants = [], catalog = [], moduleLabels = {} } = {}) {
    const nodes = [{ id: 'core', type: 'core', label: 'Command Center' }];
    const edges = [];
    const instByTemplate = new Map();
    for (const i of installations) {
        if (!instByTemplate.has(i.templateId)) instByTemplate.set(i.templateId, []);
        instByTemplate.get(i.templateId).push(i);
    }
    const usedTeams = new Set(templates.filter(t => instByTemplate.has(t.id)).map(t => t.team));
    for (const t of teams.filter(t => usedTeams.has(t.key))) {
        nodes.push({ id: `team:${t.key}`, type: 'team', label: t.short || t.label });
        edges.push({ from: 'core', to: `team:${t.key}`, style: 'structure' });
    }
    const toolUse = new Map();
    for (const t of templates) {
        const insts = instByTemplate.get(t.id);
        if (!insts) continue;
        const states = insts.map(i => i.state);
        nodes.push({ id: `agent:${t.id}`, type: 'agent', label: t.name, team: t.team, installations: insts.length, active: states.filter(s => s === 'active' || s === 'running').length, error: states.includes('error') });
        edges.push({ from: `team:${t.team}`, to: `agent:${t.id}`, style: 'structure' });
        const ids = new Set(insts.map(i => i.id));
        const tg = grants.filter(g => ids.has(g.installationId));
        const byTool = new Map();
        for (const g of tg) {
            const inst = insts.find(i => i.id === g.installationId);
            const prev = byTool.get(g.tool) || { modes: new Set(), active: false, broken: false };
            prev.modes.add(g.mode);
            if (inst && (inst.state === 'active' || inst.state === 'running')) prev.active = true;
            if (inst && inst.state === 'error') prev.broken = true;
            byTool.set(g.tool, prev);
        }
        for (const [tool, info] of byTool) {
            edges.push({ from: `agent:${t.id}`, to: `tool:${tool}`, style: info.broken ? 'broken' : info.active ? 'active' : 'idle', modes: [...info.modes] });
            toolUse.set(tool, true);
        }
    }
    const modulesUsed = new Set();
    for (const c of catalog.filter(c => toolUse.has(c.key))) {
        nodes.push({ id: `tool:${c.key}`, type: 'tool', label: c.key, risk: c.risk });
        edges.push({ from: `tool:${c.key}`, to: `module:${c.module}`, style: 'structure' });
        modulesUsed.add(c.module);
    }
    for (const m of modulesUsed) nodes.push({ id: `module:${m}`, type: 'module', label: moduleLabels[m] || m });
    return { nodes, edges };
}
