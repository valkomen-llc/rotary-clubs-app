// Quiénes ya aportaron — el CRITERIO. v4.862
//
// Debajo del botón «Aportar ahora» de la landing de campaña va una sola línea:
// cuántos aportes se han recibido y, al lado, el nombre de quien aportó,
// pasando de uno al siguiente. Este archivo decide QUÉ se puede decir; quién
// lo pinta es `ContributorRoll.tsx` y quién lo consulta es el controlador.
//
// PURO: sin base, sin red, sin DOM. Recibe filas ya leídas.
//
// ── La regla de la que cuelga todo ────────────────────────────────────────
//
// UN APORTE ANÓNIMO NO PUBLICA NINGÚN NOMBRE, y eso se decide ACÁ —en el
// servidor, antes de armar la respuesta—, no en la pantalla. La diferencia no
// es de estilo: si el nombre viajara en el JSON y la pantalla lo escondiera,
// bastaría abrir la consola del navegador para leerlo. Es la misma decisión
// que tomó la exportación de la Bóveda con el correo de un aportante anónimo
// (v4.850): el dato sigue guardado y deja de SALIR.
//
// Y va más lejos que la casilla: un aporte no anónimo cuyo nombre esté vacío
// tampoco publica nada. No hay nada que mostrar y un renglón en blanco en
// medio del carrusel se lee como un error del sitio.
//
// ── Por qué el total y los nombres salen de la MISMA consulta ─────────────
//
// El total podría salir de `ContributionCampaignMetric` —que ya cuenta
// `donation_completed` por campaña y está indexado—, y sería más barato. No se
// hace, por dos motivos: ese contador NO baja cuando un aporte se reembolsa
// (v4.859 marca `Donation.status = 'refunded'` y el contador diario se queda
// donde estaba), así que diría de más; y sobre todo, los nombres tienen que
// salir de `Donation` de todos modos. Con dos fuentes, la línea podría decir
// «3 aportes» y saber sólo dos nombres de tres aportantes que dieron su
// nombre — y nadie podría explicar la diferencia.

/** Cuántos nombres viajan al navegador. El carrusel los recorre en bucle, así
 *  que más allá de unas decenas nadie los llega a ver: lo que sí crece es el
 *  peso de una respuesta que se pide en cada visita de la página. */
export const ROLL_MAX_NAMES = 30;

/** Tope de un nombre. La línea es UNA y comparte espacio con el total; un
 *  nombre larguísimo la partiría en dos. Se recorta SIN partir palabras — un
 *  nombre cortado a mitad de palabra se lee como un error del sistema, que es
 *  la misma regla que sigue el recorte de un copy (v4.669). */
export const NAME_MAX_CHARS = 42;

/** Los estados de un aporte que CUENTAN. Sólo `success`: un aporte reembolsado
 *  dejó de ser un ingreso (v4.859) y seguir contándolo sería decir que se
 *  recibió un dinero que se devolvió. Y un aporte que nunca se completó no
 *  existe como fila, así que no hay nada que excluir por ese lado. */
export const COUNTED_STATUS = 'success';

const collapse = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * El nombre TAL CUAL lo escribió quien aportó, sólo con los espacios
 * normalizados y acotado para que quepa en la línea.
 *
 * No se recorta a «nombre y apellido» contando palabras, y es deliberado:
 * quien firma «María Fernanda Restrepo» no se llama «María Fernanda». Un
 * nombre compuesto es de esa persona entero, y decidir por ella cuál de sus
 * dos apellidos sobra es exactamente el tipo de cosa que no se hace con el
 * nombre de nadie.
 *
 * @returns {string} el nombre listo para pintar, o '' si no hay nada.
 */
export const cleanDonorName = (raw, max = NAME_MAX_CHARS) => {
    const limpio = collapse(raw);
    if (!limpio) return '';
    if (limpio.length <= max) return limpio;
    const corte = limpio.slice(0, max);
    const espacio = corte.lastIndexOf(' ');
    // Si la primera palabra ya se pasa del tope no hay dónde cortar sin
    // partirla: se prefiere la palabra entera antes que un nombre mutilado.
    return (espacio > 0 ? corte.slice(0, espacio) : limpio.split(' ')[0]).trim();
};

/**
 * El nombre PUBLICABLE de un aporte, o `null`.
 *
 * Es el único punto que decide si un nombre sale. Devuelve `null` cuando el
 * aporte es anónimo, cuando no tiene nombre y cuando el aporte no cuenta.
 */
export const publicDonorName = (donation) => {
    if (!donation || !countsInRoll(donation)) return null;
    if (donation.isAnonymous === true) return null;
    const nombre = cleanDonorName(donation.donorName);
    return nombre || null;
};

/** Si un aporte entra en el total. */
export const countsInRoll = (donation) =>
    !!donation && String(donation.status || '').toLowerCase() === COUNTED_STATUS;

const time = (v) => {
    const t = new Date(v || 0).getTime();
    return Number.isFinite(t) ? t : 0;
};

/**
 * La línea completa, a partir de los aportes de la campaña.
 *
 * - `total` cuenta TODOS los aportes válidos, anónimos incluidos: la
 *   anonimidad esconde el nombre, no el hecho. Un aporte anónimo que no
 *   sumara al total le restaría a quien aportó el reconocimiento de que su
 *   aporte existió, que es justamente lo que este contador celebra.
 * - `names` va del más reciente al más antiguo: el aporte de hace un momento
 *   es el que mueve a quien está mirando la página ahora.
 * - Los nombres se DEDUPLICAN sin distinguir mayúsculas ni tildes de espacios:
 *   quien aportó dos veces aparece una, o el carrusel mostraría «Ana · Ana» y
 *   se leería como un fallo. El total sí cuenta sus dos aportes.
 *
 * @returns {{ total: number, names: string[], named: number, anonymous: number }}
 */
export const buildContributorRoll = (donations, { maxNames = ROLL_MAX_NAMES } = {}) => {
    const validos = (donations || []).filter(countsInRoll);
    const total = validos.length;

    const ordenados = [...validos].sort((a, b) => time(b.date) - time(a.date));

    const vistos = new Set();
    const names = [];
    let named = 0;
    for (const d of ordenados) {
        const nombre = publicDonorName(d);
        if (!nombre) continue;
        named += 1;
        const llave = nombre.toLocaleLowerCase('es');
        if (vistos.has(llave)) continue;
        vistos.add(llave);
        if (names.length < maxNames) names.push(nombre);
    }

    return { total, names, named, anonymous: total - named };
};

export default { ROLL_MAX_NAMES, NAME_MAX_CHARS, COUNTED_STATUS, cleanDonorName, publicDonorName, countsInRoll, buildContributorRoll };
