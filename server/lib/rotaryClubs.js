// ════════════════════════════════════════════════════════════════════
// Catálogo de clubes rotarios por distrito — v4.707.0
//
// Los clubes de los distritos 4271 y 4281, tal como los entregó el Distrito.
// Alimentan el desplegable de "Club Rotario" del formulario de postulación
// (v4.706), que se ofrece en cuanto el distrito elegido tiene lista.
//
// ── POR QUÉ ES UNA SEMILLA Y NO UN VALOR POR DEFECTO ────────────────
// `deepMerge` REEMPLAZA los arrays enteros, no los fusiona elemento a
// elemento. La convocatoria guardada ya trae su propio array `districts`, así
// que un catálogo escrito en `DEFAULT_CONFIG` nunca llegaría a producción: lo
// taparía la fila guardada. Por eso esto se siembra al leer la convocatoria.
//
// ── CÓMO SE RESPETA LO QUE EDITE EL ADMINISTRADOR ───────────────────
// La semilla sólo se aplica cuando el distrito NO tiene el campo `clubs`
// —nunca se tocó—. En cuanto el administrador guarda desde la pestaña
// Convocatoria, ese distrito pasa a tener su array y la semilla no vuelve a
// entrar, ni siquiera si lo dejó VACÍO: una lista vacía es una decisión
// («que el club se escriba a mano»), y refillarla sería desobedecerla. Es la
// distinción entre `undefined` y `[]`, y es lo que hace innecesario un flag
// en la base y una escritura al arrancar.
//
// Es la misma regla del Generador de Pendones y de los recorridos del CRM:
// la siembra es aditiva e idempotente, y una vez que el operador tocó algo,
// un despliegue no vuelve a tocarlo.
//
// ── CÓMO SE RECONOCE UN DISTRITO ────────────────────────────────────
// Por su NÚMERO, no por el texto completo. El nombre guardado puede ser
// «Rotary Distrito 4271», «Distrito 4271» o «D-4271»; el número de cuatro
// dígitos es lo único estable, y es inequívoco. Un distrito renombrado a algo
// sin número no recibe semilla — es lo correcto: mejor sin lista que con la
// lista de otro.
//
// ── ORTOGRAFÍA ──────────────────────────────────────────────────────
// Los nombres llegaron en mayúsculas sostenidas y sin tildes. Se pasaron a
// mayúscula inicial con las tildes que les corresponden (Cúcuta, Medellín,
// Itagüí, Bogotá, Tuluá…), porque es como se leen en una lista y como se
// escriben de verdad. Las preposiciones y artículos internos van en minúscula
// («Cartagena de Indias», «Montería Ronda del Sinú») y los números romanos se
// conservan en mayúsculas («Cúcuta II»).
// ════════════════════════════════════════════════════════════════════

/** Clubes del Distrito 4271 — Costa Caribe, Santanderes y Antioquia. */
export const CLUBS_4271 = [
    'Barrancabermeja',
    'Barranquilla',
    'Barranquilla Centro',
    'Barranquilla Norte',
    'Barranquilla Oriente',
    'Bello',
    'Bucaramanga',
    'Bucaramanga Chicamocha',
    'Bucaramanga Ciudad de los Parques',
    'Bucaramanga Ruitoque',
    'Bucaramanga Sotomayor',
    'Bucaramanga Sur',
    'Caldas',
    'Cañasgordas',
    'Cartagena',
    'Cartagena Caribe',
    'Cartagena de Indias',
    'Cartagena Empresarial',
    'Ciénaga',
    'Cúcuta',
    'Cúcuta Ciudad de Árboles',
    'Cúcuta Ciudad de los Patios',
    'Cúcuta Ciudad de Todos',
    'Cúcuta II',
    'Cúcuta III',
    'E-Club Colombia Innova',
    'El Carmen de Viboral',
    'El Cerrejón',
    'El Retiro',
    'Envigado',
    'Envigado Ayurá',
    'Fonseca',
    'Itagüí',
    'Itagüí Santamaría',
    'Lorica',
    'Magangué',
    'Medellín',
    'Medellín Bolivariana',
    'Medellín El Poblado',
    'Medellín Nutibara',
    'Montería',
    'Montería II',
    'Montería Ronda del Sinú',
    'Nuevo Itagüí',
    'Nuevo Medellín',
    'Ocaña Primaveral',
    'Pamplona',
    'Pamplona Fundadora de Ciudades',
    'Rionegro',
    'Sabaneta',
    'San Gil',
    'San José de Cúcuta',
    'San Luis de Sincé',
    'Santa Marta',
    'Sincelejo',
    'Socorro Huella Comunera',
    'Urabá',
    'Valledupar Cacique de Eupari',
    'Villa del Rosario',
];

/** Clubes del Distrito 4281 — centro, sur y occidente del país. */
export const CLUBS_4281 = [
    'Amazonas',
    'Armenia International',
    'Armenia Palma de Cera',
    'Armero',
    'Bogotá',
    'Bogotá Capital',
    'Bogotá Centenario',
    'Bogotá Chapinero',
    'Bogotá Chicó',
    'Bogotá El Dorado',
    'Bogotá Laureles',
    'Bogotá Multicentro',
    'Bogotá Occidente',
    'Bogotá Santa Bárbara',
    'Bogotá Suba',
    'Bogotá Usaquén',
    'Buenaventura Pacífico',
    'Buga',
    'Cali',
    'Cali Norte',
    'Cali Pance',
    'Cali San Fernando',
    'Cartago',
    'Catedral de Sal de Zipaquirá',
    'Conexión Colombia Distrito 4281',
    'Duitama',
    'E-Club Origen',
    'E-Club Sogamoso Global',
    'Facatativá',
    'Fusagasugá',
    'Garagoa',
    'Honda Ciudad de los Puentes',
    'Ibagué',
    'Ibagué Ciudad Musical',
    'Ibagué Ocobos',
    'Ibagué Valle de las Lanzas',
    'Ipiales',
    'La Plata',
    'La Vega',
    'Manizales',
    'Neiva',
    'Neiva Las Ceibas',
    'Nuevo Cali',
    'Nuevo Ibagué',
    'Paipa',
    'Palmira',
    'Pasto',
    'Pasto Ciudad Sorpresa',
    'Pasto Valle de Atriz',
    'Pereira',
    'Pereira del Café',
    'Pereira Nuevo',
    'Pereira Perla del Otún',
    'Perla de Tumaco',
    'Pitalito',
    'Popayán',
    'Quimbaya',
    'San Andrés Isla',
    'Santa Fe de Bogotá',
    'Santa Rosa de Cabal',
    'Sevilla Capital Cafetera',
    'Soatá',
    'Sogamoso',
    'Sol Naciente Villavicencio',
    'Subachoque',
    'Supatá',
    'Tuluá',
    'Tuluá El Lago',
    'Tunja',
    'Tunja Hunza',
    'Villa de Leyva y el Alto Ricaurte',
    'Villavicencio',
    'Yopal',
    'Yumbo Arroyohondo',
];

/** El catálogo, indexado por el NÚMERO del distrito. */
export const CLUBS_BY_DISTRICT_NUMBER = {
    4271: CLUBS_4271,
    4281: CLUBS_4281,
};

/**
 * El número de distrito que nombra un texto, o null. Cuatro dígitos: es lo
 * único estable entre «Rotary Distrito 4271», «Distrito 4271» y «D-4271».
 */
export const districtNumberOf = (value) => {
    const m = String(value || '').match(/\b(\d{4})\b/);
    const n = m ? Number(m[1]) : null;
    return n && CLUBS_BY_DISTRICT_NUMBER[n] ? n : null;
};

/**
 * Completa `clubs` en los distritos que NUNCA lo han tenido.
 *
 * Un distrito con `clubs` ya definido —aunque sea una lista vacía— se
 * devuelve intacto: esa lista la puso el administrador y manda.
 */
export const seedDistrictClubs = (districts) => {
    if (!Array.isArray(districts)) return districts;
    return districts.map(d => {
        if (!d || Array.isArray(d.clubs)) return d;
        const numero = districtNumberOf(d.value ?? d.label);
        return numero ? { ...d, clubs: [...CLUBS_BY_DISTRICT_NUMBER[numero]] } : d;
    });
};
