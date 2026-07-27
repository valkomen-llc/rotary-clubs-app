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

/** ¿Este enlace (ya resuelto) lleva al formulario de postulación? */
export const isProjectFairCta = (url?: string): boolean =>
    String(url || '').trim() === PROJECT_FAIR_FORM_PATH;

// ── Audiencia del botón "Postular Proyecto" (v4.595) ─────────────────
// La convocatoria es para clubes rotarios colombianos, así que el botón sólo
// se muestra a quien ve el sitio en Español (la bandera del selector es la de
// Colombia) o a quien navega desde una IP colombiana. Un visitante que elige
// inglés u otro idioma, y no está en Colombia, no lo ve.
export const COLOMBIA_COUNTRY_CODE = 'CO';
export const PROJECT_FAIR_LANGUAGE = 'es';

export interface CtaAudience {
    /** Idioma activo del sitio ('es', 'en', …). */
    lang?: string;
    /** País del visitante en ISO-3166 alpha-2; null si aún no se conoce. */
    country?: string | null;
}

export const showProjectFairCta = ({ lang, country }: CtaAudience): boolean =>
    norm(lang) === PROJECT_FAIR_LANGUAGE ||
    String(country || '').trim().toUpperCase() === COLOMBIA_COUNTRY_CODE;
