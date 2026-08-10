// ════════════════════════════════════════════════════════════════════
// Plantillas IA — el catálogo de clubes del portal público
// v4.756.0
//
// PURO: sin base, sin red, sin DOM. Decide qué clubes se pueden ofrecer en el
// portal público y cómo se llaman cuando se imprimen en una pieza.
//
// ── DE DÓNDE SALEN, Y POR QUÉ NO DE LA BASE ─────────────────────────
//
// El buscador del portal NO consulta el directorio de sitios de la plataforma.
// Sale de `rotaryClubs.js`, el catálogo curado de los distritos 4271 y 4281 que
// ya alimenta los formularios de Postulación de Proyectos y de Inscripción al
// evento de la Feria. Tres motivos, y el primero es el que manda:
//
//   · Es una lista PÚBLICA y curada. El directorio de sitios alojados incluye
//     organizaciones que no son clubes, sitios a medio configurar y datos que
//     nadie eligió publicar; abrirlo entero a un portal sin autenticación es
//     exponer más de lo que la función necesita.
//   · Es la MISMA lista que el rotario ya vio al postular su proyecto o al
//     inscribirse al evento. Dos listas distintas para lo mismo se separan en
//     silencio, que es la regla del sitio desde `rotaryClubs.js`.
//   · No cuesta una consulta por pulsación en una pantalla anónima.
//
// ── LA LISTA AYUDA A ESCRIBIR; NO CIERRA LOS VALORES ────────────────
//
// Misma regla que la postulación (v4.706) y el registro al evento (v4.708): un
// catálogo se queda viejo solo —clubes nuevos, fusiones, cambios de nombre— y
// acá además hay Rotaract, Interact y clubes de otros distritos. El campo sigue
// siendo texto libre; el buscador sólo ahorra escribirlo.
// ════════════════════════════════════════════════════════════════════

import { CLUBS_BY_DISTRICT_NUMBER } from './rotaryClubs.js';

/** Sin tildes, sin mayúsculas y sin dobles espacios: es lo que hace que
 *  «bogota» encuentre «Bogotá» y que «CALI  PANCE» encuentre «Cali Pance». */
export const norm = (s) => String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();

// ─── Cómo se llama el club cuando se IMPRIME ───────────────────────────
//
// El catálogo guarda el nombre corto —«Bogotá», «Cali Pance»— porque es lo que
// hace usable un desplegable de 74 entradas. Pero la pieza dice «Al {{club}}»,
// y «Al Bogotá» no es el nombre de nadie.
//
// La forma completa se construye, no se inventa: en español el nombre es «Club
// Rotario <nombre>». La excepción son los clubes electrónicos, que se llaman
// «Rotary E-Club <nombre>» — anteponerles «Club Rotario» daría «Club Rotario
// E-Club Origen». Al agregar un tipo de club con nombre propio, agregarlo acá.
//
// Y el campo queda EDITABLE después: si un club se llama de otra forma, quien
// genera la pieza lo corrige. Esto ahorra escribir, no decide.
export const clubDisplayName = (raw) => {
    const name = String(raw || '').trim();
    if (!name) return '';
    if (/^(club\s+rotario|rotary)\b/i.test(name)) return name;
    if (/^e-?club\b/i.test(name)) return `Rotary ${name}`;
    return `Club Rotario ${name}`;
};

/** Todos los clubes del catálogo, con su distrito y su nombre para imprimir. */
export const allPublicClubs = () =>
    Object.entries(CLUBS_BY_DISTRICT_NUMBER).flatMap(([district, clubs]) =>
        (clubs || []).map(name => ({ name, display: clubDisplayName(name), district })));

export const SEARCH_LIMIT = 12;

// ─── El buscador ───────────────────────────────────────────────────────
//
// Ordena por dónde CASA el término, no alfabéticamente: quien escribe «cali»
// espera «Cali» antes que «Mercado del Cali». Los que empiezan con el término
// van primero, después los que lo contienen, y a igualdad manda el alfabético
// para que el resultado sea reproducible.
//
// Sin término se devuelven los primeros, no todos: es un buscador, no un
// volcado de 133 entradas en una pantalla pública.
export const searchPublicClubs = (term, limit = SEARCH_LIMIT) => {
    const q = norm(term);
    const tope = Math.max(1, Math.min(50, Number(limit) || SEARCH_LIMIT));
    const todos = allPublicClubs();
    if (!q) return todos.slice(0, tope);

    return todos
        .map(c => {
            const n = norm(c.name);
            const i = n.indexOf(q);
            return i < 0 ? null : { c, rank: i === 0 ? 0 : 1, n };
        })
        .filter(Boolean)
        .sort((a, b) => (a.rank - b.rank) || a.n.localeCompare(b.n))
        .slice(0, tope)
        .map(x => x.c);
};

/** Si un nombre escrito a mano corresponde a un club del catálogo. Sirve para
 *  enriquecerlo —el logotipo, el distrito— sin obligar a elegir de la lista. */
export const findPublicClub = (raw) => {
    const q = norm(raw);
    if (!q) return null;
    return allPublicClubs().find(c => norm(c.name) === q || norm(c.display) === q) || null;
};

export default { norm, clubDisplayName, allPublicClubs, searchPublicClubs, findPublicClub, SEARCH_LIMIT };
