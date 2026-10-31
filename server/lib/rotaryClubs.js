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

/**
 * La SEMILLA, congelada: los clubes tal como los entregó el Distrito (v4.707).
 *
 * ⚠️ DESDE v4.1269 ESTO YA NO ES LA FUENTE DE VERDAD. La fuente es el Catálogo
 * Maestro de Clubes (`DistrictClubProfile`, ver `clubCatalog.js` y
 * `docs/claude/catalogo-maestro-de-clubes.md`). Esta lista sólo sirve para dos
 * cosas: sembrar el catálogo la primera vez, y responder si la base no
 * contesta (un formulario nunca se queda sin lista por una base fría).
 */
export const SEED_CLUBS_BY_DISTRICT = Object.freeze({
    4271: Object.freeze([...CLUBS_4271]),
    4281: Object.freeze([...CLUBS_4281]),
});

/**
 * El catálogo VIVO, indexado por el NÚMERO del distrito.
 *
 * Arranca con la semilla y `applyClubCatalogSnapshot` lo reemplaza EN SITIO con
 * lo que diga el Catálogo Maestro: los mismos arrays, el mismo objeto. Por eso
 * los módulos que ya lo importaban —inscripción a eventos, postulación de
 * proyectos, Rotary en Acción, Plantillas IA, Aniversarios, el CRM— leen el
 * catálogo administrable sin cambiar una línea: `CLUBS_4281` sigue siendo el
 * array del 4281, sólo que ahora lo llena la base.
 */
export const CLUBS_BY_DISTRICT_NUMBER = {
    4271: CLUBS_4271,
    4281: CLUBS_4281,
};

/**
 * El catálogo tal como lo consume un formulario: distrito con sus clubes
 * dentro (v4.708). Los clubes viven DENTRO de cada distrito y no en un mapa
 * aparte con el nombre como llave, por la misma razón que en la convocatoria:
 * renombrar un distrito no puede dejar su lista huérfana.
 *
 * Lo consume la inscripción a eventos. La convocatoria de proyectos sigue
 * usando `seedDistrictClubs` sobre SUS distritos, que el administrador edita.
 * También es VIVO (v4.1269): se actualiza en sitio con el Catálogo Maestro.
 */
export const DISTRICT_CATALOG = Object.keys(CLUBS_BY_DISTRICT_NUMBER)
    .map(Number)
    .sort((a, b) => a - b)
    .map(numero => ({
        value: String(numero),
        label: `Distrito ${numero}`,
        clubs: [...CLUBS_BY_DISTRICT_NUMBER[numero]],
    }));

const normKey = (s) => String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^(club\s+rotario|rotary\s+club(\s+de)?|rotary)\s+/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const byName = (a, b) => normKey(a).localeCompare(normKey(b));

// Índice de reconocimiento: `${distrito}|${nombre normalizado}` → club. Incluye
// los INACTIVOS y los ALIAS (nombres anteriores), para que un texto histórico
// siga resolviendo al club aunque hoy se llame distinto o ya no se ofrezca.
let _index = new Map();
let _state = { source: 'semilla', loadedAt: null, total: 0 };

const indexFromSeed = () => {
    const idx = new Map();
    for (const [n, clubs] of Object.entries(SEED_CLUBS_BY_DISTRICT)) {
        for (const name of clubs) idx.set(`${n}|${normKey(name)}`, { id: null, name, status: 'activo', districtNumber: Number(n) });
    }
    return idx;
};
_index = indexFromSeed();

/**
 * Reemplaza EN SITIO el catálogo vivo con el del Catálogo Maestro.
 *
 * `snapshot.districts[numero] = { active: [nombres], known: [{ id, name, status, names: [...] }] }`.
 * Un distrito que la base no trae conserva lo que tenía (la semilla): mejor
 * una lista conocida que ninguna. Un distrito que la base SÍ trae, aunque sin
 * clubes activos, queda con lo que la base dice.
 */
export function applyClubCatalogSnapshot(snapshot) {
    const districts = snapshot?.districts || {};
    const idx = indexFromSeed();
    let total = 0;
    for (const [num, d] of Object.entries(districts)) {
        const n = Number(num);
        if (!Number.isInteger(n) || n < 1000 || n > 9999) continue;
        const names = [...new Set((d?.active || []).map(x => String(x || '').trim()).filter(Boolean))].sort(byName);
        let arr = CLUBS_BY_DISTRICT_NUMBER[n];
        if (!arr) { arr = []; CLUBS_BY_DISTRICT_NUMBER[n] = arr; }
        arr.splice(0, arr.length, ...names);
        let item = DISTRICT_CATALOG.find(x => Number(x.value) === n);
        if (!item) {
            item = { value: String(n), label: `Distrito ${n}`, clubs: [] };
            DISTRICT_CATALOG.push(item);
            DISTRICT_CATALOG.sort((a, b) => Number(a.value) - Number(b.value));
        }
        item.clubs.splice(0, item.clubs.length, ...names);
        // Los nombres de la semilla de un distrito que la base trae dejan de
        // valer por sí solos: sólo reconocen si la base los conoce (alias).
        for (const k of [...idx.keys()]) if (k.startsWith(`${n}|`)) idx.delete(k);
        for (const k of d?.known || []) {
            const entry = { id: k.id || null, name: k.name, status: k.status || 'activo', districtNumber: n };
            for (const nm of [k.name, ...(k.names || [])]) {
                const key = `${n}|${normKey(nm)}`;
                // Un nombre activo gana sobre uno inactivo que se llame igual.
                if (!idx.has(key) || (idx.get(key).status !== 'activo' && entry.status === 'activo')) idx.set(key, entry);
            }
        }
        total += names.length;
    }
    _index = idx;
    _state = { source: 'catalogo-maestro', loadedAt: new Date().toISOString(), total };
    return _state;
}

/** De dónde sale hoy la lista (para diagnóstico): 'semilla' o 'catalogo-maestro'. */
export const clubCatalogState = () => ({ ..._state });

/**
 * El club del catálogo que corresponde a un nombre escrito, en ese distrito (o
 * en cualquiera, sin distrito). Reconoce alias y clubes inactivos.
 */
export function resolveCatalogClub(name, district = null) {
    const k = normKey(name);
    if (!k) return null;
    const n = district ? (String(district).match(/\b(\d{4})\b/) || [])[1] : null;
    if (n) return _index.get(`${n}|${k}`) || null;
    for (const [key, v] of _index) if (key.endsWith(`|${k}`)) return v;
    return null;
}

/**
 * El número de distrito que nombra un texto, o null. Cuatro dígitos: es lo
 * único estable entre «Rotary Distrito 4271», «Distrito 4271» y «D-4271».
 */
export const districtNumberOf = (value) => {
    const m = String(value || '').match(/\b(\d{4})\b/);
    const n = m ? Number(m[1]) : null;
    return n && CLUBS_BY_DISTRICT_NUMBER[n] ? n : null;
};

/** ¿La lista guardada es la COPIA de la semilla (con o sin agregados)? */
const isSeedCopy = (clubs, numero) => {
    const seed = SEED_CLUBS_BY_DISTRICT[numero];
    if (!seed || !Array.isArray(clubs) || clubs.length < seed.length) return false;
    const guardados = new Set(clubs.map(normKey));
    return seed.every(s => guardados.has(normKey(s)));
};

/**
 * La lista de clubes de cada distrito de una convocatoria.
 *
 *   · Sin `clubs` (nunca se tocó) → el catálogo vivo.
 *   · `clubs: []` → se respeta: el administrador decidió «el club se escribe a mano».
 *   · `clubsSource: 'custom'` o una lista CURADA (un subconjunto elegido a mano)
 *     → se respeta tal cual.
 *   · ⚠️ v4.1269: una lista que es la COPIA de la semilla —lo que quedaba
 *     guardado en cuanto alguien pulsaba «Guardar» en la convocatoria— ya NO
 *     congela el catálogo. Era la razón por la que un club agregado después no
 *     aparecía en la postulación. Se reemplaza por el catálogo vivo, más los
 *     nombres que el administrador agregó y el catálogo no conoce (nada de lo
 *     que escribió desaparece). `clubsSource: 'catalog'` fuerza lo mismo.
 */
export const seedDistrictClubs = (districts) => {
    if (!Array.isArray(districts)) return districts;
    return districts.map(d => {
        if (!d) return d;
        const numero = districtNumberOf(d.value ?? d.label);
        if (!numero) return d;
        if (d.clubsSource === 'custom') return d;
        if (!Array.isArray(d.clubs)) return { ...d, clubs: [...CLUBS_BY_DISTRICT_NUMBER[numero]] };
        if (d.clubs.length === 0 && d.clubsSource !== 'catalog') return d;
        if (d.clubsSource !== 'catalog' && !isSeedCopy(d.clubs, numero)) return d;
        const vivos = CLUBS_BY_DISTRICT_NUMBER[numero];
        const semilla = new Set(SEED_CLUBS_BY_DISTRICT[numero].map(normKey));
        // Lo AGREGADO a mano: ni de la semilla, ni conocido por el catálogo
        // (activo, inactivo o alias). Un club que el catálogo inactivó no vuelve.
        const extras = d.clubs
            .map(c => String(c || '').trim())
            .filter(c => c && !semilla.has(normKey(c)) && !resolveCatalogClub(c, numero) && !vivos.some(v => normKey(v) === normKey(c)));
        return { ...d, clubs: [...vivos, ...extras].sort(byName) };
    });
};
