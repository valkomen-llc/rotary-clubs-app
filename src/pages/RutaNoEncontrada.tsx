import { Link, useLocation } from 'react-router-dom';
import { Compass, ArrowLeft } from 'lucide-react';

/**
 * La pantalla de una dirección que no existe (v4.1044).
 *
 * ⚠️ HASTA v4.1043 NO HABÍA NINGUNA, y su ausencia no se veía como un hueco:
 * `<Routes>` sin una ruta comodín no pinta NADA, así que cualquier dirección
 * que no casara devolvía una página EN BLANCO —el defecto reportado con la
 * vuelta de Facebook—. Un blanco no distingue «esta dirección no existe» de
 * «la aplicación se rompió», y lo segundo es lo que se reporta.
 *
 * Va eager, no con `lazy`: es la red que atrapa lo que nada más atrapó, y
 * cargarla por red abriría la posibilidad de que la red también falle.
 */
const RutaNoEncontrada = () => {
    const { pathname } = useLocation();

    return (
        <div className="min-h-[60vh] flex items-center justify-center px-5 py-20 bg-rotary-concrete">
            <div className="max-w-lg w-full text-center">
                <div className="mx-auto w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center mb-6">
                    <Compass className="w-8 h-8 text-rotary-blue" />
                </div>
                <h1 className="text-3xl font-light text-gray-900 mb-3">
                    Esta dirección no existe
                </h1>
                <p className="text-gray-600 mb-2">
                    No encontramos nada en <span className="font-mono text-gray-800" data-no-translate>{pathname}</span>.
                </p>
                <p className="text-sm text-gray-500 mb-8">
                    Puede que el enlace esté incompleto o que la página se haya movido.
                </p>
                <Link
                    to="/"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-rotary-blue text-white hover:bg-rotary-navy transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Volver al inicio
                </Link>
            </div>
        </div>
    );
};

export default RutaNoEncontrada;
