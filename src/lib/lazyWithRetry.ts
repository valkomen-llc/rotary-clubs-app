// ════════════════════════════════════════════════════════════════════
// Cargar una página que vive en su propio archivo, sin dejar la pantalla
// en blanco si ese archivo no llega — v4.789.0
//
// El problema, y por qué aparecía «últimamente»
// ---------------------------------------------
// Desde v4.659 las páginas se cargan con `React.lazy`, así que cada una es un
// archivo aparte con un hash en el nombre (`ContentStudio-a1b2c3.js`). Ese hash
// cambia en CADA despliegue, y este sitio se despliega varias veces al día.
//
// Una pestaña que lleva un rato abierta tiene el documento del despliegue
// anterior, así que al entrar a una sección que todavía no había cargado pide
// un archivo que ya no existe. Y hasta v4.788 esa petición no daba 404: la
// reescritura de `vercel.json` la mandaba a la función, que devolvía el
// documento de la aplicación con estado 200 y `Content-Type: text/html`.
//
// El navegador intenta entonces interpretar HTML como un módulo y falla. Lo que
// convierte ese tropiezo en una pantalla en blanco permanente es que **React
// CACHEA la promesa rechazada**: ese componente ya no vuelve a intentarse en
// toda la sesión, por más que se navegue. Sólo lo arregla recargar — que es
// exactamente lo que se reportó.
//
// Qué hace esto
// -------------
// Reintenta una vez —un fallo de red se resuelve solo— y, si el archivo sigue
// sin llegar, RECARGA la página una sola vez para tomar el documento nuevo con
// los hashes nuevos. Es la única cura real cuando el archivo ya no existe: no
// hay nada que reintentar, hay que volver a preguntar qué archivos van.
//
// Por qué el recargar está CONTADO
// --------------------------------
// Porque si el archivo falta de verdad —un despliegue a medias, un fallo del
// CDN—, recargar sin freno deja al usuario en un bucle infinito de pantallas
// blancas, que es peor que el defecto que se está corrigiendo. Se permiten dos
// intentos por minuto; agotados, la promesa se RECHAZA y `ChunkErrorBoundary`
// pinta un mensaje con un botón. Un fallo que se ve y se explica es aceptable;
// uno mudo, no.
// ════════════════════════════════════════════════════════════════════

import React from 'react';

const CLAVE = 'app:chunk-reloads';
const VENTANA_MS = 60_000;
const MAX_RECARGAS = 2;
const ESPERA_REINTENTO_MS = 400;

/**
 * La POLÍTICA de recarga, aparte y pura para poder probarla: recargar es lo
 * único que cura un archivo que ya no existe, y pasarse de vueltas convierte la
 * cura en un bucle de pantallas blancas. Cuántas veces se permite es la
 * decisión que importa, y no se prueba con un navegador de verdad —haría falta
 * recargar para mirarlo—.
 *
 * Devuelve las marcas que siguen contando y si se puede recargar otra vez.
 */
export const permiteRecarga = (marcas: number[], ahora: number) => {
    const vigentes = (Array.isArray(marcas) ? marcas : [])
        .filter(t => typeof t === 'number' && Number.isFinite(t) && ahora - t < VENTANA_MS);
    return { vigentes, permitido: vigentes.length < MAX_RECARGAS };
};

/** Las recargas hechas por esta causa dentro del último minuto. */
const recargasRecientes = (): number[] => {
    try {
        const crudo = sessionStorage.getItem(CLAVE);
        const marcas: unknown = crudo ? JSON.parse(crudo) : [];
        if (!Array.isArray(marcas)) return [];
        return permiteRecarga(marcas as number[], Date.now()).vigentes;
    } catch {
        // Sin `sessionStorage` —modo privado, permisos— no se puede contar, y
        // sin cuenta no se recarga: un bucle es peor que un mensaje de error.
        return Array(MAX_RECARGAS).fill(0);
    }
};

/**
 * Recarga la página UNA vez para tomar el documento nuevo. Devuelve `false` si
 * ya se recargó demasiadas veces: entonces quien llama tiene que fallar a la
 * vista, no volver a intentarlo.
 */
export const recargarPorArchivoFaltante = (motivo: string): boolean => {
    const marcas = recargasRecientes();
    if (!permiteRecarga(marcas, Date.now()).permitido) {
        console.error(`[chunk] ${motivo}: ya se recargó ${marcas.length} veces en el último minuto; no se insiste.`);
        return false;
    }
    try {
        sessionStorage.setItem(CLAVE, JSON.stringify([...marcas, Date.now()]));
    } catch { /* si no se puede anotar, la comprobación de arriba ya devolvió el tope */ }

    console.warn(`[chunk] ${motivo}: falta un archivo de esta versión del sitio; se recarga para tomar la nueva.`);
    // `reload()` a secas: el documento ya se sirve con `no-store` desde v4.789,
    // así que una recarga normal trae los hashes nuevos. No hace falta pedirle
    // al usuario que la fuerce, que es justo lo que había que dejar de pedirle.
    window.location.reload();
    return true;
};

/**
 * Igual que `React.lazy`, pero se recupera de un archivo que no llegó.
 *
 * `nombre` sólo se usa para el registro en consola: cuando esto actúa, saber
 * QUÉ página faltó es la mitad del diagnóstico.
 */
export const lazyWithRetry = <T extends React.ComponentType<any>>(
    factory: () => Promise<{ default: T }>,
    nombre = 'página',
): React.LazyExoticComponent<T> =>
    React.lazy(async () => {
        try {
            return await factory();
        } catch (primerFallo) {
            // Un tropiezo de red se resuelve solo. Se espera un momento en vez
            // de reintentar en el acto: repetir contra una conexión que acaba
            // de fallar suele fallar igual.
            await new Promise(r => setTimeout(r, ESPERA_REINTENTO_MS));
            try {
                return await factory();
            } catch (segundoFallo) {
                if (recargarPorArchivoFaltante(`no se pudo cargar «${nombre}»`)) {
                    // La recarga ya está en marcha. Se devuelve una promesa que
                    // nunca resuelve para que el indicador de carga se quede
                    // como está: pintar un error que va a desaparecer en un
                    // instante es un parpadeo feo y confunde.
                    return new Promise<{ default: T }>(() => { });
                }
                throw segundoFallo;
            }
        }
    });

/**
 * Vite avisa cuando falla la PRECARGA de un módulo (`vite:preloadError`), que
 * es el mismo problema un instante antes de que el `import()` lo note. Se
 * atiende igual y se marca como manejado para que no llegue a la consola como
 * un error sin dueño.
 *
 * Se registra una sola vez, desde el arranque de la aplicación.
 */
export const escucharFallosDePrecarga = () => {
    window.addEventListener('vite:preloadError', (evento) => {
        evento.preventDefault();
        recargarPorArchivoFaltante('falló la precarga de un archivo');
    });
};
