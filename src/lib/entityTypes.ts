// Catálogo único de tipos de entidad / clasificación de sitios (frontend).
//
// Fuente única de verdad para las listas de opciones del registro público, el onboarding
// y el modal "Editar Club" del admin, de modo que no se desincronicen.
//
// El modelo Club tiene DOS campos de categoría:
//   - `type`             → clave máquina que decide en qué sección del panel aparece el sitio
//                          (Clubes, Ferias, Zonas, Eventos, …). Es el valor que filtran las
//                          páginas del admin con ?type=...
//   - `organizationType` → etiqueta legible que el usuario elige en el registro.
//
// Mantener ambos alineados evita el bug donde una "Feria de Proyectos" quedaba con
// type="club" (y por tanto listada como Club e imposible de reclasificar).
//
// Debe mantenerse en paralelo con server/lib/entityTypes.js.

export interface EntityTypeEntry {
    /** Clave máquina almacenada en Club.type y usada por los filtros ?type=... del admin. */
    type: string;
    /** Etiqueta legible almacenada en Club.organizationType y mostrada en el registro. */
    organizationType: string;
    /** Texto mostrado en el selector del admin. */
    label: string;
    /** Si aparece en el formulario público de registro / onboarding. */
    registerable: boolean;
}

export const ENTITY_TYPES: EntityTypeEntry[] = [
    { type: 'club',                    organizationType: 'Club Rotario',            label: 'Rotary Club (Socio)',      registerable: true },
    { type: 'district',                organizationType: 'Distrito Rotario',        label: 'Distrito Rotary',          registerable: true },
    { type: 'association',             organizationType: 'Asociación Rotaria',      label: 'Asociación / Agrupación',  registerable: true },
    { type: 'colrotarios',             organizationType: 'Colrotarios',             label: 'Colrotarios (Fundación)',  registerable: false },
    { type: 'Evento o Convención',     organizationType: 'Evento o Convención',     label: 'Evento o Convención',      registerable: true },
    { type: 'Feria de Proyectos',      organizationType: 'Feria de Proyectos',      label: 'Feria de Proyectos',       registerable: true },
    { type: 'Programa de Intercambio', organizationType: 'Programa de Intercambio', label: 'Programa de Intercambio',  registerable: true },
    { type: 'Zona',                    organizationType: 'Zona',                    label: 'Zona',                     registerable: true },
];

/** Entradas visibles en el registro público / onboarding. */
export const REGISTERABLE_ENTITY_TYPES = ENTITY_TYPES.filter((e) => e.registerable);

const norm = (s?: string) => (s == null ? '' : String(s).trim().toLowerCase());

/** Resuelve la clave máquina `type` a partir del `organizationType`. Fallback: 'club'. */
export function resolveEntityType(organizationType?: string): string {
    const value = norm(organizationType);
    if (!value) return 'club';
    const byOrg = ENTITY_TYPES.find((e) => norm(e.organizationType) === value);
    if (byOrg) return byOrg.type;
    const byType = ENTITY_TYPES.find((e) => norm(e.type) === value);
    if (byType) return byType.type;
    return 'club';
}

/** Etiqueta legible (organizationType) a partir de la clave máquina `type`. */
export function organizationTypeFor(type?: string): string {
    const entry = ENTITY_TYPES.find((e) => norm(e.type) === norm(type));
    return entry ? entry.organizationType : 'Club Rotario';
}
