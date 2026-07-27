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

/** Ruta canónica del formulario público de postulación de proyectos. */
export const PROJECT_FAIR_FORM_PATH = '/feria-proyectos';

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

// Formularios de inscripción de ediciones anteriores (WordPress/Fluent Forms).
// Reconocerlos evita que un botón quede apuntando al formulario de la feria
// pasada cuando ya existe el módulo interno.
const LEGACY_FORM_PATTERNS = [
    /inscribir-proyecto/i,
    /inscripcion-de-proyecto/i,
    /inscripci[oó]n-proyecto/i,
    /postular-proyecto/i,
];

/**
 * Devuelve el enlace que debe usar un botón. Si apunta a un formulario de
 * postulación heredado, lo redirige al formulario interno; en cualquier otro
 * caso lo deja intacto.
 */
export const resolveCtaUrl = (url?: string): string => {
    const value = String(url || '').trim();
    if (!value) return value;
    return LEGACY_FORM_PATTERNS.some(re => re.test(value)) ? PROJECT_FAIR_FORM_PATH : value;
};
