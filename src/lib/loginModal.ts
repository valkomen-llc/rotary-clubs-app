// ════════════════════════════════════════════════════════════════════
// Acceso unificado — un solo formulario de ingreso en todo el sitio
// v4.627.0
//
// El formulario de inicio de sesión vive en el ícono del encabezado y no se
// duplica en ninguna pantalla. Cuando otra pantalla necesita que el usuario
// ingrese (por ejemplo /mi-proyecto sin sesión), no dibuja su propio
// formulario: pide que se abra el del encabezado.
//
// Se usa un evento del navegador en lugar de un contexto de React porque el
// `Navbar` se monta dentro de cada página, no por encima de ellas: no hay un
// proveedor común donde colgar el estado.
// ════════════════════════════════════════════════════════════════════

export const LOGIN_MODAL_EVENT = 'rotary:open-login';

export interface OpenLoginOptions {
    /** Correo con el que precargar el campo. */
    email?: string;
    /** Ruta a la que volver una vez dentro. Si se omite, decide el servidor. */
    next?: string;
    /** Mensaje que explica por qué se está pidiendo ingresar. */
    reason?: string;
    /** Abrir directamente en "olvidé mi contraseña". */
    mode?: 'login' | 'forgot';
}

/** Abre el formulario de ingreso del encabezado. */
export const openLoginModal = (options: OpenLoginOptions = {}) => {
    window.dispatchEvent(new CustomEvent<OpenLoginOptions>(LOGIN_MODAL_EVENT, { detail: options }));
};

/** Lo escucha el `Navbar`. Devuelve la función para dejar de escuchar. */
export const onOpenLoginModal = (handler: (options: OpenLoginOptions) => void) => {
    const listener = (event: Event) => handler((event as CustomEvent<OpenLoginOptions>).detail || {});
    window.addEventListener(LOGIN_MODAL_EVENT, listener);
    return () => window.removeEventListener(LOGIN_MODAL_EVENT, listener);
};

// ── Aviso de ingreso completado (v4.692) ─────────────────────────────
//
// El formulario de inscripción a un evento necesita enterarse: quien entra
// desde ahí con su cuenta de siempre debe ver, sin recargar, que ya se le
// reconoció y que no tiene que crear contraseña. Va por el mismo camino que
// la apertura del modal, y por el mismo motivo: el `Navbar` se monta dentro
// de cada página, así que no hay un proveedor común donde colgar el estado.

export const LOGIN_DONE_EVENT = 'rotary:login-done';

export interface LoginDoneDetail {
    /** Identidad con la que se entró: 'platform' | 'portal' | 'attendee'. */
    realm?: string;
}

/** Lo emite el `Navbar` en cuanto una sesión queda abierta. */
export const emitLoginSuccess = (detail: LoginDoneDetail = {}) => {
    window.dispatchEvent(new CustomEvent<LoginDoneDetail>(LOGIN_DONE_EVENT, { detail }));
};

/** Escucha el ingreso. Devuelve la función para dejar de escuchar. */
export const onLoginSuccess = (handler: (detail: LoginDoneDetail) => void) => {
    const listener = (event: Event) => handler((event as CustomEvent<LoginDoneDetail>).detail || {});
    window.addEventListener(LOGIN_DONE_EVENT, listener);
    return () => window.removeEventListener(LOGIN_DONE_EVENT, listener);
};
