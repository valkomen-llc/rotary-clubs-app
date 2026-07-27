// ════════════════════════════════════════════════════════════════════
// Enlaces de los botones de llamada a la acción (CTA)
// v4.593.0 — Conecta el botón "Postular Proyecto" con el formulario interno.
//
// Dos piezas:
//   1. `headerCtaDefaults` — los botones por defecto de la cabecera según el
//      tipo de sitio. En una Feria de Proyectos, el segundo botón apunta al
//      formulario público de postulación en vez de "Únete a un club".
//   2. `resolveCtaUrl` — normaliza los enlaces de postulación heredados
//      (formularios de ediciones anteriores alojados fuera de la plataforma)
//      para que lleven al formulario interno.
//
// El administrador sigue mandando: cualquier enlace que configure en
// Configuración → Identidad → "Botones del menú principal" se respeta tal
// cual, salvo que sea uno de los formularios viejos de inscripción.
// ════════════════════════════════════════════════════════════════════

/**
 * Ruta canónica del formulario público de postulación de proyectos.
 * v4.594 — el slug pasó a `/postular-proyecto` (antes `/feria-proyectos`) para
 * que coincida con el botón "Postular Proyecto". Las rutas anteriores siguen
 * funcionando: redirigen aquí conservando los parámetros de la URL.
 */
export const PROJECT_FAIR_FORM_PATH = '/postular-proyecto';

const norm = (s?: string) => (s == null ? '' : String(s).trim().toLowerCase());

export interface CtaDefault { label: string; url: string }

/** Botones por defecto de la cabecera para el tipo de sitio indicado. */
export const headerCtaDefaults = (type?: string): CtaDefault[] => {
    const contribute = { label: 'Contribuye', url: '/maneras-de-contribuir' };
    if (norm(type) === norm('Feria de Proyectos')) {
        return [contribute, { label: 'Postular Proyecto', url: PROJECT_FAIR_FORM_PATH }];
    }
    return [contribute, { label: 'Únete a un club', url: '/contacto?asunto=Quiero+ser+socio' }];
};

// Enlaces que deben terminar en el formulario interno: los de ediciones
// anteriores (WordPress/Fluent Forms) y los slugs antiguos de la plataforma.
const FORM_URL_PATTERNS = [
    /inscribir-proyecto/i,
    /inscripcion-de-proyecto/i,
    /inscripci[oó]n-proyecto/i,
    /postular-proyecto/i,
    /feria-proyectos/i,
];

/**
 * Devuelve el enlace que debe usar un botón. Si apunta al formulario de
 * postulación (por un slug antiguo o por el formulario de una edición
 * anterior), lo lleva a la ruta canónica; en cualquier otro caso lo deja
 * intacto.
 */
export const resolveCtaUrl = (url?: string): string => {
    const value = String(url || '').trim();
    if (!value) return value;
    return FORM_URL_PATTERNS.some(re => re.test(value)) ? PROJECT_FAIR_FORM_PATH : value;
};

// Un botón puede llevar al formulario aunque su enlace esté configurado a mano
// (por ejemplo, a la convocatoria de una edición anterior). Reconocerlo también
// por el texto evita que se escape del filtro de audiencia.
const PROJECT_FAIR_LABEL_PATTERNS = [
    /postul\w*\s+(un\s+|el\s+|tu\s+)?proyecto/i,
    /inscrib\w*\s+(un\s+|el\s+|tu\s+)?proyecto/i,
    /inscripci[oó]n\s+de\s+proyecto/i,
    /submit\s+(a\s+|your\s+|the\s+)?project/i,
    /apply\s+with\s+(a\s+|your\s+)?project/i,
];

export interface ProjectFairCtaProbe {
    /** Enlace ya resuelto por resolveCtaUrl. */
    url?: string;
    /** Textos del botón (todas las variantes de idioma configuradas). */
    labels?: (string | null | undefined)[];
}

/** ¿Este botón lleva al formulario de postulación, por enlace o por texto? */
export const isProjectFairCta = ({ url, labels = [] }: ProjectFairCtaProbe): boolean =>
    String(url || '').trim() === PROJECT_FAIR_FORM_PATH ||
    labels.some(label => !!label && PROJECT_FAIR_LABEL_PATTERNS.some(re => re.test(String(label))));

// ── Audiencia del botón "Postular Proyecto" (v4.596) ─────────────────
// La convocatoria es para clubes rotarios colombianos, así que el botón se
// limita a esa audiencia:
//
//   1. En Español (el idioma cuya bandera es la de Colombia) siempre se ve.
//   2. Si el visitante ELIGIÓ otro idioma, no se ve. Su preferencia manda,
//      incluso si navega desde Colombia — es justamente el caso que reportó
//      el equipo: sitio en inglés desde Bogotá y el botón seguía apareciendo.
//   3. Si no eligió idioma (ve el sitio en el idioma por defecto), decide el
//      país: se muestra a quien navega desde Colombia.
export const COLOMBIA_COUNTRY_CODE = 'CO';
export const PROJECT_FAIR_LANGUAGE = 'es';

export interface CtaAudience {
    /** Idioma activo del sitio ('es', 'en', …). */
    lang?: string;
    /** País del visitante en ISO-3166 alpha-2; null si aún no se conoce. */
    country?: string | null;
    /** true si el visitante eligió el idioma a mano en el selector. */
    languageChosen?: boolean;
}

export const showProjectFairCta = ({ lang, country, languageChosen }: CtaAudience): boolean => {
    if (norm(lang) === PROJECT_FAIR_LANGUAGE) return true;
    if (languageChosen) return false;
    return String(country || '').trim().toUpperCase() === COLOMBIA_COUNTRY_CODE;
};
