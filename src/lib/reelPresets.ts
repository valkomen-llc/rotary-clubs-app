// ════════════════════════════════════════════════════════════════════
// Creador de Reels IA — presets, espejo en el navegador
// v4.783.0
//
// Espejo MÍNIMO de `server/lib/reelPresets.js`, con el mismo criterio que
// `src/lib/reelSpec.ts`: el catálogo completo lo sirve el servidor en
// `GET /api/content-studio/reels/options`, para que no puedan desfasarse.
//
// Lo que vive acá es lo que la pantalla necesita ANTES de la primera respuesta,
// o en cada movimiento del ratón sin poder pagar un viaje a la API: cuántas
// fotos admite un preset, cuánto va a durar la pieza y qué cuenta cada foto
// mientras se arrastran para reordenarlas.
//
// ESTÁ DUPLICADO A PROPÓSITO, igual que `ADMIN_ROLES` y `NATIONAL_LANGS`. Si
// cambia uno, cambiar el otro: lo comprueba `npm run test:reels:presets`
// cargando los dos y comparando LAS SALIDAS de las funciones, no sólo las
// constantes. El servidor valida siempre, aunque el navegador ya lo haya hecho.
// ════════════════════════════════════════════════════════════════════

export const MIN_SCENE_COUNT = 3;
export const MAX_SCENE_COUNT = 5;

// Los mismos límites por escena que declara `reelSpec.js`. Se repiten acá
// porque `targetTotalSecFor` los necesita y traerlos de `reelSpec.ts` ataría
// dos espejos entre sí.
const MIN_SCENE_SEC = 4;
const MAX_SCENE_SEC = 6;

export type NarrativeRoleId =
    | 'contexto' | 'impacto_humano' | 'necesidades' | 'respuesta'
    | 'cta' | 'cta_cierre' | 'accion_cta' | 'libre';

export interface NarrativeRole {
    index: number;
    id: NarrativeRoleId;
    label: string;
    brief: string;
}

export interface ReelPreset {
    id: string;
    label: string;
    description: string;
    sceneCounts: number[];
    defaultSceneCount: number;
    totalSec: Record<number, number>;
    contextSchema: string | null;
    motionStyle: string;
    motionIntensity: string;
    transition: string;
    musicStyle: string;
    onScreenText: boolean;
    closingCard: boolean;
    requireExpansion: boolean;
    hasNarrative: boolean;
    isDefault: boolean;
}

export const NARRATIVE_ROLES: Record<NarrativeRoleId, { id: NarrativeRoleId; label: string; brief: string }> = {
    contexto: {
        id: 'contexto',
        label: 'Contexto',
        brief: 'Presenta la situación: qué ocurrió y dónde. Es la escena que ubica a quien mira.'
    },
    impacto_humano: {
        id: 'impacto_humano',
        label: 'Impacto humano',
        brief: 'Muestra a las personas y comunidades afectadas, con dignidad y sin dramatismo.'
    },
    necesidades: {
        id: 'necesidades',
        label: 'Necesidades',
        brief: 'Nombra qué hace falta concretamente, sólo lo que el usuario haya indicado.'
    },
    respuesta: {
        id: 'respuesta',
        label: 'Rotarios en acción',
        brief: 'Introduce la movilización rotaria: la solidaridad convertida en trabajo concreto.'
    },
    cta: {
        id: 'cta',
        label: 'Llamado a la acción',
        brief: 'Pide una acción concreta y posible, la que el usuario haya elegido.'
    },
    cta_cierre: {
        id: 'cta_cierre',
        label: 'Llamado y cierre',
        brief: 'Une el llamado a la acción con el cierre institucional del club.'
    },
    accion_cta: {
        id: 'accion_cta',
        label: 'Acción y llamado',
        brief: 'Une la movilización rotaria con el llamado a la acción, porque no hay escena aparte para cada uno.'
    },
    libre: {
        id: 'libre',
        label: 'Libre',
        brief: 'Sin función asignada: el director decide qué cuenta esta escena.'
    }
};

// La estructura narrativa de los presets que la declaran. Sólo se repite lo que
// la pantalla necesita para rotular la línea de tiempo mientras se arrastra.
const NARRATIVE_BY_PRESET: Record<string, Record<number, NarrativeRoleId[]>> = {
    emergencia: {
        3: ['contexto', 'impacto_humano', 'accion_cta'],
        4: ['contexto', 'impacto_humano', 'respuesta', 'cta'],
        5: ['contexto', 'impacto_humano', 'necesidades', 'respuesta', 'cta_cierre']
    }
};

const TOTAL_SEC_BY_PRESET: Record<string, Record<number, number>> = {
    estandar: { 3: 15 },
    emergencia: { 3: 15, 4: 20, 5: 26 }
};

const SCENE_COUNTS_BY_PRESET: Record<string, number[]> = {
    estandar: [3],
    emergencia: [3, 4, 5]
};

const DEFAULT_SCENE_COUNT_BY_PRESET: Record<string, number> = {
    estandar: 3,
    emergencia: 3
};

export const DEFAULT_PRESET = 'estandar';

const sceneCountsOf = (presetId: string): number[] =>
    SCENE_COUNTS_BY_PRESET[presetId] || SCENE_COUNTS_BY_PRESET[DEFAULT_PRESET];

const defaultSceneCountOf = (presetId: string): number =>
    DEFAULT_SCENE_COUNT_BY_PRESET[presetId] ?? DEFAULT_SCENE_COUNT_BY_PRESET[DEFAULT_PRESET];

/**
 * Cuántas escenas va a tener la pieza, y si hubo que corregir lo pedido.
 *
 * La corrección no es silenciosa ni acá ni en el servidor: la pantalla la
 * muestra para que nadie pida cinco fotos y reciba tres sin enterarse.
 */
export const resolveSceneCount = (
    presetId: string,
    requested: number | null | undefined
): { sceneCount: number; requested: number | null; adjusted: boolean; note: string | null } => {
    const allowed = sceneCountsOf(presetId);
    const fallback = defaultSceneCountOf(presetId);
    const n = Number(requested);

    if (!Number.isFinite(n) || !Number.isInteger(n)) {
        return { sceneCount: fallback, requested: null, adjusted: false, note: null };
    }
    if (allowed.includes(n)) {
        return { sceneCount: n, requested: n, adjusted: false, note: null };
    }
    return {
        sceneCount: fallback,
        requested: n,
        adjusted: true,
        note: `«${presetLabel(presetId)}» se arma con ${allowed.join(', ')} ${allowed.length === 1 ? 'fotografía' : 'fotografías'}: se usaron ${fallback}.`
    };
};

const LABELS: Record<string, string> = {
    estandar: 'Reel estándar',
    emergencia: 'Campaña de Emergencia'
};
const presetLabel = (presetId: string): string => LABELS[presetId] || LABELS[DEFAULT_PRESET];

/** Duración objetivo de la pieza para esa cantidad de escenas. */
export const targetTotalSecFor = (presetId: string, sceneCount: number): number => {
    const table = TOTAL_SEC_BY_PRESET[presetId] || TOTAL_SEC_BY_PRESET[DEFAULT_PRESET];
    const declared = table?.[sceneCount];
    if (Number.isFinite(declared)) return declared as number;

    const entries = Object.entries(table || {});
    if (!entries.length) return sceneCount * 5;
    const [n, sec] = entries[0];
    const perScene = sec / Number(n);
    const clamped = Math.min(MAX_SCENE_SEC, Math.max(MIN_SCENE_SEC, perScene));
    return Number((clamped * sceneCount).toFixed(2));
};

/**
 * Los roles narrativos de cada escena, en orden. Sin estructura declarada
 * devuelve `libre` para todas, que es lo que hace que `estandar` se comporte
 * exactamente como antes de que existieran los presets.
 */
export const narrativeRolesFor = (presetId: string, sceneCount: number): NarrativeRole[] => {
    const declared = NARRATIVE_BY_PRESET[presetId]?.[sceneCount];
    const ids: NarrativeRoleId[] = Array.isArray(declared) && declared.length === sceneCount
        ? declared
        : (Array.from({ length: sceneCount }, () => 'libre') as NarrativeRoleId[]);

    return ids.map((id, index) => {
        const role = NARRATIVE_ROLES[id] || NARRATIVE_ROLES.libre;
        return { index, id: role.id, label: role.label, brief: role.brief };
    });
};

/** Si el preset admite esa cantidad de fotos. El que manda es el servidor. */
export const presetAllowsSceneCount = (presetId: string, n: number): boolean =>
    sceneCountsOf(presetId).includes(Number(n));

/**
 * Etiqueta legible de un rol. Devuelve `null` si no se conoce, para que la
 * pantalla no pinte la clave cruda como si fuera el nombre.
 */
export const narrativeRoleLabel = (roleId: string): string | null =>
    NARRATIVE_ROLES[roleId as NarrativeRoleId]?.label || null;
