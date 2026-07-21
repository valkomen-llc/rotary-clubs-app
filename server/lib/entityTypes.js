// Catálogo único de tipos de entidad / clasificación de sitios.
//
// El modelo Club tiene DOS campos de categoría que deben mantenerse en sincronía:
//   - `type`             → clave máquina que decide en qué sección del panel aparece
//                          el sitio (Clubes, Ferias, Zonas, Eventos, …) y el skin del footer.
//                          Es el valor por el que filtran las páginas del admin (?type=...).
//   - `organizationType` → etiqueta legible que selecciona el usuario en el registro.
//
// Históricamente el registro público solo guardaba `organizationType` y `type` caía al
// default "club", por lo que un sitio "Feria de Proyectos" quedaba clasificado como Club.
// Este catálogo es la fuente única de verdad para mapear entre ambos y evitar que las
// listas de opciones (registro, onboarding, edición admin) se desincronicen.
//
// NOTA: los valores de `type` con espacios ("Feria de Proyectos", "Zona", etc.) son los
// que las páginas de sección del admin usan tal cual en el filtro ?type=... — NO cambiarlos
// sin actualizar también esos filtros, o los sitios existentes dejarían de listarse.

export const ENTITY_TYPES = [
    { type: 'club',                    organizationType: 'Club Rotario',            label: 'Rotary Club (Socio)',      registerable: true },
    { type: 'district',                organizationType: 'Distrito Rotario',        label: 'Distrito Rotary',          registerable: true },
    { type: 'association',             organizationType: 'Asociación Rotaria',      label: 'Asociación / Agrupación',  registerable: true },
    { type: 'colrotarios',             organizationType: 'Colrotarios',             label: 'Colrotarios (Fundación)',  registerable: false },
    { type: 'Evento o Convención',     organizationType: 'Evento o Convención',     label: 'Evento o Convención',      registerable: true },
    { type: 'Feria de Proyectos',      organizationType: 'Feria de Proyectos',      label: 'Feria de Proyectos',       registerable: true },
    { type: 'Programa de Intercambio', organizationType: 'Programa de Intercambio', label: 'Programa de Intercambio',  registerable: true },
    { type: 'Zona',                    organizationType: 'Zona',                    label: 'Zona',                     registerable: true },
];

const norm = (s) => (s == null ? '' : String(s).trim().toLowerCase());

// Resuelve la clave máquina `type` a partir del `organizationType` seleccionado en el registro.
// Hace match por organizationType y, como respaldo, por el propio `type` (por si llega ya
// como clave). Fallback conservador a 'club' si no se reconoce.
export function resolveEntityType(organizationType) {
    const value = norm(organizationType);
    if (!value) return 'club';
    const byOrg = ENTITY_TYPES.find((e) => norm(e.organizationType) === value);
    if (byOrg) return byOrg.type;
    const byType = ENTITY_TYPES.find((e) => norm(e.type) === value);
    if (byType) return byType.type;
    return 'club';
}

// Etiqueta legible (organizationType) a partir de la clave máquina `type`.
export function organizationTypeFor(type) {
    const entry = ENTITY_TYPES.find((e) => norm(e.type) === norm(type));
    return entry ? entry.organizationType : 'Club Rotario';
}
