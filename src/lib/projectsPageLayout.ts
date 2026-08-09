// ════════════════════════════════════════════════════════════════════
// Qué bloques se ven en la página pública de Proyectos — v4.750
//
// PURO a propósito: sin red y sin DOM. Lo consumen las DOS puntas —la página
// que los dibuja y el panel que los enciende— y por eso vive aparte: si cada
// una decidiera su propio valor por defecto, el panel enseñaría un interruptor
// encendido sobre un bloque que la página no pinta, o al revés. Ese desajuste
// no lo ve el typecheck y en la pantalla se lee como «el interruptor no
// funciona».
//
// ── POR QUÉ NACEN APAGADOS ──────────────────────────────────────────
//
// Los dos bloques venían ESCRITOS EN EL CÓDIGO, iguales para todos los sitios,
// y el de las cifras publica números inventados —«150+ proyectos», «$12.5B
// recaudados», «50.000+ beneficiarios», «3.500+ donantes»— que no salen de
// ninguna consulta y no son ciertos para ningún club. Publicar cifras
// inventadas en el sitio de una institución no es una preferencia estética.
//
// Por eso el valor por defecto es APAGADO, y encenderlos es una decisión
// explícita de cada sitio. Es la misma postura del Bloque Destacado (v4.746):
// la portada la comparten todos los sitios, así que un contenido escrito en el
// código no puede aparecer en todos por omisión.
// ════════════════════════════════════════════════════════════════════

export interface ProjectsLayout {
    /** La portada azul: «Transformando Vidas…», su texto y sus dos botones. */
    hero: boolean;
    /** La banda de cifras de impacto que va debajo de la portada. */
    stats: boolean;
}

/** Apagados. Encenderlos es una decisión de cada sitio. */
export const PROJECTS_LAYOUT_DEFAULTS: ProjectsLayout = {
    hero: false,
    stats: false,
};

/**
 * Da forma a lo que venga guardado.
 *
 * Sólo `true` enciende. Un valor ausente, nulo o basura deja el bloque apagado:
 * ante la duda, no se publica algo que el sitio no eligió publicar. La cadena
 * `'true'` se acepta porque el almacenamiento de secciones ha guardado
 * booleanos como texto en versiones anteriores.
 */
export function normalizeProjectsLayout(raw: unknown): ProjectsLayout {
    const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const on = (value: unknown) => value === true || value === 'true';
    return {
        hero: on(source.hero),
        stats: on(source.stats),
    };
}

/** Los bloques, con su nombre, para pintar los interruptores del panel. */
export const PROJECTS_LAYOUT_BLOCKS: Array<{
    key: keyof ProjectsLayout;
    label: string;
    help: string;
}> = [
    {
        key: 'hero',
        label: 'Portada de impacto',
        help: 'La franja azul con «Transformando Vidas, Un Proyecto a la Vez» y los botones Donar Ahora y Conoce Más.',
    },
    {
        key: 'stats',
        label: 'Cifras de impacto',
        help: 'La banda con proyectos completados, pesos recaudados, beneficiarios y donantes. Son cifras de ejemplo escritas en el código, no salen de tus proyectos.',
    },
];
