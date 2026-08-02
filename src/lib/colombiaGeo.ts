// ════════════════════════════════════════════════════════════════════
// División político-administrativa de Colombia
// v4.678.0
//
// Los 32 departamentos más Bogotá, D.C. Se usan como lista desplegable en los
// formularios cuando el país elegido es Colombia; para cualquier otro país el
// campo es de texto libre, porque no tenemos —ni tendría sentido cargar— el
// catálogo de divisiones de todos los países.
//
// POR QUÉ UN `select` Y NO UN `datalist`: en v4.656 el cliente rechazó un
// `datalist` de sugerencias en el formulario de inscripción a eventos, porque
// el navegador lo desplegaba encima del formulario y parecía un catálogo
// obligatorio corto cuando en realidad admitía cualquier valor. La conclusión
// que quedó escrita fue: si hay que restringir de verdad, se hace con un
// `select`. Esto es un `select`, con el valor guardado tal cual se elige.
//
// LOS MUNICIPIOS NO ESTÁN AQUÍ, a propósito. Son 1.100 y pico y la fuente
// autorizada es el DANE (datos.gov.co), que este entorno no puede consultar.
// Escribirlos de memoria metería errores invisibles y permanentes en un
// formulario de producción. La ciudad se escribe a mano; el departamento
// —que es el eje por el que de verdad se segmenta— sí queda normalizado.
// Si más adelante se quiere la lista completa, se descarga el archivo del
// DANE y se agrega aquí como `MUNICIPIOS_POR_DEPARTAMENTO`.
// ════════════════════════════════════════════════════════════════════

/** País cuyo catálogo de divisiones conocemos. Se compara con `country`. */
export const COLOMBIA = 'Colombia';

export const DEPARTAMENTOS_COLOMBIA: string[] = [
    'Amazonas',
    'Antioquia',
    'Arauca',
    'Archipiélago de San Andrés, Providencia y Santa Catalina',
    'Atlántico',
    'Bogotá, D.C.',
    'Bolívar',
    'Boyacá',
    'Caldas',
    'Caquetá',
    'Casanare',
    'Cauca',
    'Cesar',
    'Chocó',
    'Córdoba',
    'Cundinamarca',
    'Guainía',
    'Guaviare',
    'Huila',
    'La Guajira',
    'Magdalena',
    'Meta',
    'Nariño',
    'Norte de Santander',
    'Putumayo',
    'Quindío',
    'Risaralda',
    'Santander',
    'Sucre',
    'Tolima',
    'Valle del Cauca',
    'Vaupés',
    'Vichada',
];

/** ¿Para este país tenemos lista de departamentos? */
export const hasDepartmentList = (country?: string | null): boolean =>
    String(country || '').trim().toLowerCase() === COLOMBIA.toLowerCase();

/**
 * Etiqueta del campo según el país. Fuera de Colombia la división de primer
 * nivel se llama de otra forma y no todos los países la tienen igual, así que
 * se nombran las tres formas usuales en vez de imponer la colombiana.
 */
export const departmentLabel = (country?: string | null): string =>
    (hasDepartmentList(country) ? 'Departamento' : 'Departamento, estado o provincia');

export const DEPARTMENT_OPTIONS = DEPARTAMENTOS_COLOMBIA.map(d => ({ value: d, label: d }));
