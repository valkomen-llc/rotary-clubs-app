/**
 * La última red: ninguna pantalla se queda en blanco sin decir por qué
 * ====================================================================
 * v4.789.0
 *
 * `React.lazy` sin límite de error es una pantalla en blanco garantizada: si el
 * archivo de una página no llega, el error sube hasta la raíz y React desmonta
 * el árbol entero. No queda nada pintado y no se dice nada.
 *
 * `lazyWithRetry` ya reintenta y, si hace falta, recarga —de eso se recupera
 * solo—. Esto atiende lo que queda: el caso en que recargar tampoco sirvió
 * (dos veces en un minuto) y el de cualquier otro error de render dentro de una
 * página. Un fallo que se ve y se explica es aceptable; uno mudo, no.
 *
 * Va DENTRO del enrutador y por fuera del `<Suspense>`, así que conserva la
 * barra de navegación: quien vea esto puede irse a otra sección sin recargar.
 */

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props { children: React.ReactNode }
interface State { error: Error | null }

class ChunkErrorBoundary extends React.Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        // Al registro del navegador con la traza de componentes: sin ella, un
        // error de render se diagnostica a ciegas.
        console.error('[app] La pantalla no se pudo pintar:', error, info.componentStack);
    }

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;

        // Un archivo que no llegó se explica distinto de un error del código:
        // el primero lo arregla el propio usuario recargando, el segundo no.
        const esArchivoFaltante = /dynamically imported module|Importing a module script failed|Failed to fetch/i
            .test(error.message || '');

        return (
            <div className="min-h-[60vh] flex items-center justify-center p-6">
                <div className="max-w-md w-full rounded-2xl border border-amber-200 bg-amber-50/70 p-6 text-center">
                    <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto" />
                    <h1 className="mt-3 text-base font-black text-amber-900">
                        {esArchivoFaltante ? 'Esta pantalla no terminó de cargar' : 'Esta pantalla no se pudo mostrar'}
                    </h1>
                    <p className="mt-2 text-sm text-amber-800 leading-snug">
                        {esArchivoFaltante
                            ? 'El sitio se actualizó mientras esta pestaña estaba abierta y falta un archivo de la versión anterior. Al recargar se toma la versión nueva.'
                            : 'Ocurrió un error al dibujar esta sección. El resto del panel sigue funcionando.'}
                    </p>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-black text-white hover:bg-amber-700"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Recargar la página
                    </button>
                    {/* El mensaje técnico va a la vista, plegado: sin él, quien
                        reporta el fallo no tiene nada que copiar. */}
                    <details className="mt-3 text-left">
                        <summary className="text-[11px] font-bold text-amber-700 cursor-pointer">Detalle técnico</summary>
                        <pre className="mt-1 text-[10px] text-amber-900/80 whitespace-pre-wrap break-words">
                            {error.message || String(error)}
                        </pre>
                    </details>
                </div>
            </div>
        );
    }
}

export default ChunkErrorBoundary;
