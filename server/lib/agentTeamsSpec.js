// ═══════════════════════════════════════════════════════════════════════
// Centro de Equipos de IA — EL CRITERIO (v4.1331.0)
//
// PURO: sin base, sin red, sin IA. Decide:
//   · el PERFIL de cada uno de los ocho equipos institucionales (misión,
//     capacidades, límites, icono) — las CLAVES siguen siendo las de `TEAMS`;
//   · qué se puede CONFIGURAR de un equipo (lista cerrada) y cómo se sanea;
//   · a qué equipos PERTENECE un agente: su equipo principal
//     (`AgentTemplate.team`), los que se le asocian a mano (`AgentTeamMember`)
//     y los que le llegan por su categoría de origen (la división de The
//     Agency) — sin copiar el agente;
//   · el ESTADO OPERATIVO de un equipo, derivado de sus instalaciones.
//
// ⚠️ PERTENECER A UN EQUIPO NO DA PERMISOS. La política del tipo de sitio
// (`siteTypeAllows`) y `checkInstallable` siguen evaluando el equipo
// PRINCIPAL; asociar un agente a otro equipo sólo cambia dónde aparece y quién
// puede redactar un resumen de ese equipo (sin herramientas). Las herramientas
// las da la concesión de cada instalación, nunca el equipo.
//
// ⚠️ UN EQUIPO SIN AGENTES ACTIVOS NUNCA SE PINTA «OPERATIVO». Publicado en el
// catálogo ≠ instalado ≠ activo.
// ═══════════════════════════════════════════════════════════════════════

import { TEAMS, TEAM_KEYS, AGENCY_DIVISION_TEAM, AGENCY_DIVISIONS } from './agentRegistrySpec.js';

// ── Iconos ─────────────────────────────────────────────────────────────
// Lista CERRADA: el panel los traduce a íconos de lucide. Un valor fuera de la
// lista no se guarda.
export const TEAM_ICONS = {
    compass: 'Brújula', megaphone: 'Megáfono', handshake: 'Manos', calendar: 'Calendario', users: 'Personas',
    wallet: 'Billetera', cpu: 'Procesador', chart: 'Gráfico', target: 'Diana', globe: 'Mundo', book: 'Libro', shield: 'Escudo',
};

// ── Perfiles ───────────────────────────────────────────────────────────
// Lo que el equipo HACE (capacidades) y lo que NUNCA hace sin una persona
// (límites). Son textos de presentación: lo que el sistema permite de verdad lo
// deciden las herramientas concedidas y las aprobaciones.
export const TEAM_PROFILES = {
    direccion: {
        icon: 'compass',
        summary: 'Planeación, coordinación y seguimiento estratégico.',
        mission: 'Apoyar la planeación institucional, la coordinación de iniciativas y el seguimiento estratégico.',
        capabilities: ['Planeación de actividades', 'Seguimiento de objetivos', 'Coordinación de equipos', 'Priorización de iniciativas', 'Preparación de informes ejecutivos', 'Análisis de indicadores institucionales'],
        guardrails: ['Propone y coordina: las decisiones las toman personas.', 'Trabaja de la mano del Director de Inteligencia y Operaciones Institucionales (Dirección IA), dentro de UNA organización.'],
        director: true,
    },
    comunicaciones: {
        icon: 'megaphone',
        summary: 'Contenido y comunicación institucional.',
        mission: 'Apoyar la comunicación institucional de clubes, distritos y eventos.',
        capabilities: ['Noticias institucionales', 'Boletines', 'Redes sociales', 'Campañas de comunicación', 'Comunicados', 'Contenido web', 'SEO', 'Preparación de mensajes y notificaciones'],
        guardrails: ['Deja BORRADORES: publicar o enviar pasa por las aprobaciones existentes.', 'No habla en nombre de Rotary International.'],
    },
    proyectos: {
        icon: 'handshake',
        summary: 'Formulación, revisión y seguimiento de proyectos.',
        mission: 'Apoyar la formulación, revisión, seguimiento y presentación de proyectos de servicio.',
        capabilities: ['Análisis de postulaciones', 'Revisión de formularios', 'Detección de información faltante', 'Preparación de resúmenes', 'Seguimiento de proyectos', 'Análisis de presupuestos', 'Traducción asistida', 'Preparación de informes'],
        guardrails: ['Consulta la Feria de Proyectos sólo si el sitio tiene la integración y los permisos.', 'Nunca aprueba, rechaza ni puntúa proyectos, ni cambia su estado o su pago.'],
    },
    eventos: {
        icon: 'calendar',
        summary: 'Inscripciones y gestión de eventos.',
        mission: 'Apoyar la organización y administración de eventos institucionales.',
        capabilities: ['Análisis de inscripciones', 'Gestión de asistentes', 'Seguimiento de estados administrativos', 'Preparación de comunicaciones', 'Validación documental asistida', 'Elaboración de informes', 'Identificación de registros incompletos', 'Apoyo a procesos de acreditación'],
        guardrails: ['No modifica inscripciones, pagos ni validaciones sin autorización.', 'Los avisos a inscritos no se envían sin aprobación.'],
    },
    membresia: {
        icon: 'users',
        summary: 'Socios, clubes y participación.',
        mission: 'Apoyar la gestión de socios, clubes y participación institucional.',
        capabilities: ['Análisis de participación', 'Seguimiento de membresía', 'Preparación de reportes', 'Identificación de oportunidades de acompañamiento', 'Organización de información institucional', 'Apoyo a programas de incorporación y retención'],
        guardrails: ['Sólo cifras AGREGADAS: nunca perfila, puntúa ni contacta a una persona.', 'Respeta estrictamente la privacidad de los datos personales.'],
    },
    finanzas: {
        icon: 'wallet',
        summary: 'Control y revisión administrativa.',
        mission: 'Apoyar procesos administrativos, documentales y financieros.',
        capabilities: ['Revisión de información', 'Conciliación asistida', 'Preparación de informes', 'Análisis de registros', 'Detección de inconsistencias', 'Seguimiento de procesos administrativos'],
        guardrails: ['SÓLO LECTURA: no mueve dinero, no confirma pagos ni toca el libro mayor.', 'Las operaciones financieras siguen sujetas a controles y aprobaciones.'],
    },
    tecnologia: {
        icon: 'cpu',
        summary: 'Ingeniería, seguridad y automatización.',
        mission: 'Apoyar el mantenimiento, la calidad y la evolución técnica de Club Platform.',
        capabilities: ['Auditoría técnica', 'Accesibilidad', 'Seguridad', 'Rendimiento', 'Experiencia de usuario', 'Revisión de integraciones', 'Pruebas', 'Propuestas de automatización'],
        guardrails: ['Sin acceso a credenciales, infraestructura ni bases de datos sin autorización específica.', 'Propone tareas técnicas; no despliega cambios.'],
    },
    analitica: {
        icon: 'chart',
        summary: 'Indicadores e informes.',
        mission: 'Transformar datos institucionales autorizados en indicadores y recomendaciones.',
        capabilities: ['Análisis de participación', 'Reportes de eventos', 'Seguimiento de proyectos', 'Indicadores de membresía', 'Análisis de tendencias', 'Preparación de tableros', 'Informes ejecutivos'],
        guardrails: ['Sólo datos autorizados de la organización, cada cifra con su evidencia.', 'Nada de otras organizaciones.'],
    },
};

/** Las divisiones de The Agency que caen en un equipo por omisión (su equipo PRINCIPAL). */
export function originDivisions(teamKey) {
    return Object.entries(AGENCY_DIVISION_TEAM).filter(([, t]) => t === teamKey).map(([d]) => d);
}

// ── Configuración ──────────────────────────────────────────────────────
// Lo que la plataforma puede cambiar de un equipo. Lista CERRADA. La CLAVE no
// se cambia nunca: la usan las políticas por tipo de sitio, las plantillas,
// los workflows y los planes del Director.
export const TEAM_CONFIG_FIELDS = ['label', 'summary', 'icon', 'sortOrder', 'visible', 'responsibilities', 'divisions'];
export const TEAM_CONFIG_LIMITS = { label: [2, 60], summary: 240, responsibilities: 12, responsibility: 200, sortOrder: [0, 99] };

const str = (v) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();

/**
 * Sanea la configuración de UN equipo. Devuelve `{ value, errors }`; `value`
 * sólo trae los campos que llegaron (un PATCH), ya saneados.
 */
export function sanitizeTeamConfig(input = {}) {
    const value = {};
    const errors = [];
    const src = input && typeof input === 'object' ? input : {};
    if ('label' in src) {
        const v = str(src.label);
        const [min, max] = TEAM_CONFIG_LIMITS.label;
        if (v.length < min || v.length > max) errors.push(`El nombre del equipo debe tener entre ${min} y ${max} caracteres.`);
        else value.label = v;
    }
    if ('summary' in src) {
        const v = str(src.summary);
        if (v.length > TEAM_CONFIG_LIMITS.summary) errors.push(`La descripción no puede pasar de ${TEAM_CONFIG_LIMITS.summary} caracteres.`);
        else value.summary = v;
    }
    if ('icon' in src) {
        if (!TEAM_ICONS[src.icon]) errors.push('Ícono no válido.');
        else value.icon = src.icon;
    }
    if ('sortOrder' in src) {
        const n = Number(src.sortOrder);
        const [min, max] = TEAM_CONFIG_LIMITS.sortOrder;
        if (!Number.isInteger(n) || n < min || n > max) errors.push(`El orden debe ser un número entero entre ${min} y ${max}.`);
        else value.sortOrder = n;
    }
    if ('visible' in src) value.visible = src.visible !== false && src.visible !== 'false';
    if ('responsibilities' in src) {
        const list = (Array.isArray(src.responsibilities) ? src.responsibilities : String(src.responsibilities || '').split('\n'))
            .map(str).filter(Boolean);
        if (list.length > TEAM_CONFIG_LIMITS.responsibilities) errors.push(`Máximo ${TEAM_CONFIG_LIMITS.responsibilities} responsabilidades.`);
        else if (list.some(r => r.length > TEAM_CONFIG_LIMITS.responsibility)) errors.push(`Cada responsabilidad admite hasta ${TEAM_CONFIG_LIMITS.responsibility} caracteres.`);
        else value.responsibilities = [...new Set(list)];
    }
    if ('divisions' in src) {
        const list = Array.isArray(src.divisions) ? src.divisions.map(String) : [];
        const bad = list.filter(d => !AGENCY_DIVISIONS[d]);
        if (bad.length) errors.push(`Categorías desconocidas: ${bad.join(', ')}.`);
        else value.divisions = [...new Set(list)];
    }
    return { value, errors };
}

/** Une lo guardado con un cambio, sin campos ajenos. */
export function mergeTeamConfig(saved = {}, patch = {}) {
    const out = {};
    for (const f of TEAM_CONFIG_FIELDS) {
        if (f in patch) out[f] = patch[f];
        else if (saved && f in saved) out[f] = saved[f];
    }
    return out;
}

/**
 * Los ocho equipos EFECTIVOS: lo fijo (clave, perfil) + lo configurado.
 * `saved` = { [teamKey]: config } (de `AgentSetting`, clave `teams`). Se
 * ignoran claves que no sean equipos y campos fuera de la lista.
 */
export function effectiveTeams(saved = {}) {
    const cfgAll = saved && typeof saved === 'object' ? saved : {};
    return TEAMS.map((t, i) => {
        const profile = TEAM_PROFILES[t.key] || {};
        const raw = cfgAll[t.key] && typeof cfgAll[t.key] === 'object' ? cfgAll[t.key] : {};
        const { value: cfg } = sanitizeTeamConfig(raw);
        return {
            key: t.key,
            label: cfg.label || t.label,
            short: t.short,
            help: cfg.summary || t.help,
            summary: cfg.summary || profile.summary || t.help,
            icon: cfg.icon || profile.icon || 'compass',
            // De 10 en 10 (10…80): siempre cabe uno antes o entre dos.
            sortOrder: cfg.sortOrder ?? (i + 1) * 10,
            visible: cfg.visible !== false,
            mission: profile.mission || '',
            responsibilities: cfg.responsibilities?.length ? cfg.responsibilities : (profile.capabilities || []),
            capabilities: profile.capabilities || [],
            guardrails: profile.guardrails || [],
            director: Boolean(profile.director),
            originDivisions: originDivisions(t.key),
            // Las divisiones de otros equipos que se ASOCIAN a éste (sin
            // cambiar el equipo principal de sus agentes).
            divisions: (cfg.divisions || []).filter(d => AGENCY_DIVISION_TEAM[d] !== t.key),
            configured: Object.keys(cfg).length > 0,
            defaultIndex: i,
        };
    }).sort((a, b) => a.sortOrder - b.sortOrder || a.defaultIndex - b.defaultIndex);
}

/** `{ team: [división, …] }` para la consulta de pertenencia. */
export function divisionsByTeam(teams) {
    const out = {};
    for (const t of teams || []) if (t.divisions?.length) out[t.key] = [...t.divisions];
    return out;
}

// ── Pertenencia ────────────────────────────────────────────────────────
export const MEMBERSHIP_KINDS = {
    primary: 'Equipo principal',
    manual: 'Asociado al equipo',
    division: 'Por su categoría de origen',
};

/**
 * Los equipos de un agente, el principal primero. `manualTeams` = filas de
 * `AgentTeamMember`; `divisionTeams` = `divisionsByTeam(...)`.
 */
export function teamsOfTemplate({ team, division = null, manualTeams = [], divisionTeams = {} } = {}) {
    const out = [];
    const add = (k) => { if (TEAM_KEYS.includes(k) && !out.includes(k)) out.push(k); };
    add(team);
    for (const k of manualTeams) add(k);
    if (division) for (const [k, divs] of Object.entries(divisionTeams || {})) if ((divs || []).includes(division)) add(k);
    return out;
}

/** Cómo pertenece un agente a un equipo: principal > a mano > por categoría. */
export function membershipKind({ team, division = null, manualTeams = [], divisionTeams = {} } = {}, teamKey) {
    if (team === teamKey) return 'primary';
    if ((manualTeams || []).includes(teamKey)) return 'manual';
    if (division && (divisionTeams?.[teamKey] || []).includes(division)) return 'division';
    return null;
}

/** Los equipos de una instalación (la lista si viene; si no, el principal). */
export const installationTeams = (i) => (Array.isArray(i?.teams) && i.teams.length ? i.teams : (i?.team ? [i.team] : []));

// ── Estado operativo ───────────────────────────────────────────────────
export const TEAM_STATUS = {
    not_allowed: { label: 'No habilitado', tone: 'muted', help: 'El tipo de sitio de esta organización no trabaja con este equipo.' },
    empty: { label: 'Sin plantillas', tone: 'muted', help: 'No hay agentes publicados en este equipo.' },
    not_installed: { label: 'Sin instalaciones', tone: 'neutral', help: 'Hay plantillas disponibles, pero ningún agente instalado.' },
    installed_off: { label: 'Instalado, sin activar', tone: 'amber', help: 'Tiene agentes instalados, pero ninguno activo: falta encenderlos, elegir un responsable o publicar una versión.' },
    disabled: { label: 'Deshabilitado', tone: 'muted', help: 'Sus instalaciones están apagadas por una persona o por una política.' },
    profile_only: { label: 'Solo perfil', tone: 'slate', help: 'Encendidos sin herramientas: conversan, no ejecutan.' },
    error: { label: 'Con error', tone: 'red', help: 'La última ejecución de sus agentes falló.' },
    degraded: { label: 'Operativo con errores', tone: 'amber', help: 'Tiene agentes activos y otros cuya última ejecución falló.' },
    operational: { label: 'Operativo', tone: 'green', help: 'Al menos un agente activo acepta tareas.' },
};

/** Estados de instalación que cuentan como «activo» (aceptan tareas). */
export const ACTIVE_STATES = ['active', 'running'];

/**
 * El estado de un equipo. Nunca «operativo» sin un agente ACTIVO: publicado
 * en el catálogo no es estar trabajando.
 */
export function teamOperationalStatus({ allowed = true, templates = 0, installed = 0, enabled = 0, active = 0, profileOnly = 0, errors = 0, disabled = 0 } = {}) {
    let key;
    if (!allowed) key = 'not_allowed';
    else if (!installed) key = templates > 0 ? 'not_installed' : 'empty';
    else if (active > 0) key = errors > 0 ? 'degraded' : 'operational';
    else if (errors > 0) key = 'error';
    else if (profileOnly > 0) key = 'profile_only';
    else if (disabled >= installed) key = 'disabled';
    else key = 'installed_off';
    return { key, ...TEAM_STATUS[key] };
}

/** Contadores vacíos de un equipo. */
const emptyCounts = () => ({ installed: 0, enabled: 0, active: 0, profileOnly: 0, errors: 0, disabled: 0, sites: 0 });

/**
 * Agrega las instalaciones (con su `state` ya derivado) por equipo. Una
 * instalación cuenta en CADA equipo al que pertenece su agente.
 */
export function aggregateInstallations(installations = []) {
    const acc = {};
    const sites = {};
    for (const i of installations) {
        for (const team of installationTeams(i)) {
            const c = (acc[team] ||= emptyCounts());
            c.installed += 1;
            if (i.enabled) c.enabled += 1;
            if (ACTIVE_STATES.includes(i.state)) c.active += 1;
            if (i.state === 'profile_only') c.profileOnly += 1;
            if (i.state === 'error') c.errors += 1;
            if (i.state === 'disabled') c.disabled += 1;
            if (i.scopeType === 'site' && i.siteId) (sites[team] ||= new Set()).add(String(i.siteId));
        }
    }
    for (const [team, set] of Object.entries(sites)) acc[team].sites = set.size;
    return acc;
}

/**
 * Las tarjetas del Resumen. Todo lo que recibe ya fue leído para el alcance de
 * la sesión (la plataforma o UN sitio); esta función sólo arma.
 *
 * @param teams        effectiveTeams(...)
 * @param templates    { [team]: { available, published } } plantillas por equipo
 * @param installations instalaciones del alcance, con `state` y `teams`
 * @param activity     { [team]: { pendingTasks, runs30d, failedRuns30d, lastRunAt } }
 * @param allowsTeam   (team) => bool — la política del tipo de sitio (sitio) o siempre true
 * @param platform     ¿la vista es de la plataforma? (un sitio no ve equipos ocultos ni no habilitados)
 */
export function buildTeamCards({ teams = [], templates = {}, installations = [], activity = {}, allowsTeam = () => true, platform = true } = {}) {
    const inst = aggregateInstallations(installations);
    return teams
        .filter(t => platform || (t.visible && allowsTeam(t.key)))
        .map(t => {
            const c = inst[t.key] || emptyCounts();
            const tp = templates[t.key] || { available: 0, published: 0 };
            const a = activity[t.key] || {};
            const allowed = allowsTeam(t.key);
            return {
                key: t.key, label: t.label, summary: t.summary, icon: t.icon, visible: t.visible, director: t.director,
                templates: tp.available, published: tp.published,
                installed: c.installed, enabled: c.enabled, active: c.active, profileOnly: c.profileOnly, errors: c.errors, sites: c.sites,
                pendingTasks: a.pendingTasks || 0, runs30d: a.runs30d || 0, failedRuns30d: a.failedRuns30d || 0, lastRunAt: a.lastRunAt || null,
                status: teamOperationalStatus({ allowed, templates: tp.available, ...c }),
            };
        });
}

// ── Listado paginado ───────────────────────────────────────────────────
export const TEAM_AGENT_VIEWS = {
    all: 'Todos',
    installed: 'Instalados',
    not_installed: 'Sin instalar',
};
export const TEAM_PAGE_SIZE = { default: 24, max: 60 };

export function pageParams({ page, pageSize } = {}) {
    const size = Math.min(TEAM_PAGE_SIZE.max, Math.max(1, Number.parseInt(pageSize, 10) || TEAM_PAGE_SIZE.default));
    const p = Math.max(1, Number.parseInt(page, 10) || 1);
    return { page: p, pageSize: size, offset: (p - 1) * size };
}

/** El estado más «vivo» de varias instalaciones del mismo agente (para la fila). */
const STATE_RANK = ['running', 'active', 'error', 'profile_only', 'configured', 'installed', 'disabled', 'available'];
export function bestState(states = []) {
    for (const s of STATE_RANK) if (states.includes(s)) return s;
    return 'available';
}

export default {
    TEAM_ICONS, TEAM_PROFILES, TEAM_CONFIG_FIELDS, TEAM_STATUS, MEMBERSHIP_KINDS, TEAM_AGENT_VIEWS,
    sanitizeTeamConfig, mergeTeamConfig, effectiveTeams, divisionsByTeam, teamsOfTemplate, membershipKind,
    installationTeams, teamOperationalStatus, aggregateInstallations, buildTeamCards, pageParams, bestState, originDivisions,
};
