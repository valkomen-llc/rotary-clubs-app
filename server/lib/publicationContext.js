// ════════════════════════════════════════════════════════════════════
// Contexto de publicación — Tipo y Enfoque Rotary
// v4.667.0
//
// Los dos catálogos que dan CONTEXTO ESTRATÉGICO a la generación: qué clase de
// publicación es y a qué área de enfoque de Rotary pertenece.
//
// Vivían como literales dentro de `generatePost`, y las etiquetas estaban
// duplicadas otra vez en `PostGenerator.tsx`. Desde v4.667 hay una sola fuente,
// que además consume el Creador de Reels: el mismo "Evento" o "End Polio Now"
// tiene que significar lo mismo en un post y en un Reel, o el cliente ve dos
// personalidades distintas de la misma plataforma.
//
// `tone` y `focus` son lo que se le dice al modelo. `label` es lo que ve el
// usuario y no existía acá — estaba sólo en el frontend, que es exactamente por
// qué las dos listas podían desincronizarse sin que nadie lo notara.
// ════════════════════════════════════════════════════════════════════

export const TYPE_PROMPTS = {
    standard: { tone: 'profesional, claro y directo', focus: 'el impacto de la actividad rotaria' },
    storytelling: { tone: 'narrativo, emotivo, cercano', focus: 'la historia humana detrás de la imagen' },
    fundraising: { tone: 'inspirador y persuasivo con un llamado claro a la acción', focus: 'la urgencia de la causa y cómo donar transforma vidas' },
    event: { tone: 'energético y convocante', focus: 'invitar a participar del evento, fecha y lugar' },
    project: { tone: 'profesional y orientado a resultados', focus: 'avances medibles y beneficio comunitario del proyecto' },
    membership: { tone: 'aspiracional y comunitario', focus: 'invitar a sumarse al club, valores de servicio y pertenencia' },
    networking: { tone: 'cercano, profesional y de comunidad', focus: 'fortalecer vínculos entre rotarios, conexiones inter-clubes/distritos, encuentros y oportunidades de colaboración' },
    endpolio: { tone: 'esperanzador, comprometido y de impacto global', focus: 'la campaña End Polio Now: erradicación de la polio, hito histórico de Rotary International, aporte de cada club al objetivo mundial. Hashtags obligatorios incluyen #EndPolioNow y #RotaryInternational' },
    crowdfunding: { tone: 'movilizador, transparente y con sentido de urgencia colectiva', focus: 'campaña de financiamiento colectivo con meta pública y plazo; explica qué se va a lograr con los aportes, hace el call-to-action al link de la campaña, suma sensación de comunidad aportando juntos' }
};

export const INTEREST_AREAS = {
    general: 'Servir para Cambiar Vidas — impacto general de Rotary',
    peace: 'Promoción de la Paz y Prevención de Conflictos',
    disease: 'Lucha contra Enfermedades y salud comunitaria',
    water: 'Agua Limpia, Saneamiento e Higiene',
    environment: 'Protección del Medio Ambiente y sostenibilidad'
};

// Etiquetas visibles. Se sirven al navegador desde el servidor para que agregar
// un tipo nuevo no exija tocar dos archivos.
export const TYPE_LABELS = {
    standard: 'Estándar',
    storytelling: 'Narración de historias',
    fundraising: 'Recaudación de fondos',
    event: 'Evento',
    project: 'Proyecto',
    membership: 'Membresía',
    networking: 'Establecimiento de contactos',
    endpolio: 'End Polio Now',
    crowdfunding: 'Financiación colectiva'
};

export const AREA_LABELS = {
    general: 'Impacto General',
    peace: 'Paz y Prevención de Conflictos',
    disease: 'Lucha contra Enfermedades',
    water: 'Agua y Saneamiento',
    environment: 'Medio Ambiente'
};

export const DEFAULT_TYPE = 'standard';
export const DEFAULT_AREA = 'general';

export const publicationTypes = () => Object.keys(TYPE_PROMPTS).map(id => ({
    id,
    label: TYPE_LABELS[id] || id,
    tone: TYPE_PROMPTS[id].tone,
    focus: TYPE_PROMPTS[id].focus,
    isDefault: id === DEFAULT_TYPE
}));

export const interestAreas = () => Object.keys(INTEREST_AREAS).map(id => ({
    id,
    label: AREA_LABELS[id] || id,
    description: INTEREST_AREAS[id],
    isDefault: id === DEFAULT_AREA
}));

// Normaliza lo que llega del navegador. Nunca se confía en el cliente: un tipo
// o un área inventados caen al default en vez de romper el prompt.
export const resolveContext = ({ type, interestArea } = {}) => {
    const t = TYPE_PROMPTS[type] ? type : DEFAULT_TYPE;
    const a = INTEREST_AREAS[interestArea] ? interestArea : DEFAULT_AREA;
    return {
        type: t,
        typeLabel: TYPE_LABELS[t] || t,
        tone: TYPE_PROMPTS[t].tone,
        focus: TYPE_PROMPTS[t].focus,
        interestArea: a,
        areaLabel: AREA_LABELS[a] || a,
        areaDescription: INTEREST_AREAS[a]
    };
};
