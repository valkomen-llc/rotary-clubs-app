// ════════════════════════════════════════════════════════════════════════════
// El artefacto «_=_» de Facebook (v4.1044)
//
// Al terminar un flujo de Facebook, Meta añade `#_=_` a la dirección de
// vuelta. Es un resto conocido de su implementación —ya está documentado en
// este repositorio desde v4.331— y normalmente es inofensivo: un fragmento
// que nadie lee. Pero llega también como SEGMENTO DE RUTA (`/_=_`), y ahí
// deja de ser inofensivo: ninguna ruta de la aplicación casa con eso, así que
// la pantalla se queda EN BLANCO. Es la página vacía reportada.
//
// ⚠️ SE LIMPIA ANTES DE MONTAR REACT, no dentro de un componente: para cuando
// un componente se monta, el enrutador ya decidió que no hay ruta y ya no hay
// nada que pintar. Es el mismo motivo por el que `escucharFallosDePrecarga`
// se registra en `main.tsx`.
//
// El criterio va aparte y es PURO para poder probarlo sin navegador.
// ════════════════════════════════════════════════════════════════════════════

/** El resto que Facebook pega al volver, en sus dos formas. */
const RUTA_ARTEFACTO = /\/_=_\/?$/;
const HASH_ARTEFACTO = '#_=_';

/**
 * La dirección ya limpia, o `null` si no había artefacto que quitar.
 *
 * Devolver `null` —y no la misma dirección— es lo que permite que quien
 * llama no reescriba el historial en cada visita: sólo se toca la barra de
 * direcciones cuando de verdad hay algo que corregir.
 */
export const limpiarArtefactoDeFacebook = (href: string): string | null => {
    let url: URL;
    try {
        url = new URL(href);
    } catch {
        return null;
    }

    let tocado = false;

    if (url.hash === HASH_ARTEFACTO) {
        url.hash = '';
        tocado = true;
    }

    const rutaLimpia = url.pathname.replace(RUTA_ARTEFACTO, '');
    if (rutaLimpia !== url.pathname) {
        // Sin ruta no se deja la cadena vacía: `/` es la portada.
        url.pathname = rutaLimpia || '/';
        tocado = true;
    }

    return tocado ? url.toString() : null;
};

/**
 * Corrige la barra de direcciones si Facebook dejó su resto. Devuelve si
 * hubo algo que corregir.
 *
 * `replaceState` y no una navegación: la dirección con el artefacto no tiene
 * que quedar en el historial —volver atrás la traería de vuelta— y a esta
 * altura React todavía no montó, así que el enrutador leerá ya la corregida.
 */
export const normalizarVueltaDeFacebook = (win: Window = window): boolean => {
    try {
        const limpia = limpiarArtefactoDeFacebook(win.location.href);
        if (!limpia) return false;
        win.history.replaceState(win.history.state, '', limpia);
        return true;
    } catch {
        // Nunca puede impedir que la aplicación arranque.
        return false;
    }
};

export default { limpiarArtefactoDeFacebook, normalizarVueltaDeFacebook };
