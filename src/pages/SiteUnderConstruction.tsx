import { Link } from 'react-router-dom';
import { Construction, LogIn, Mail } from 'lucide-react';
import { useClub } from '../contexts/ClubContext';

/**
 * La pantalla que ve un visitante SIN sesión cuando el sitio está en
 * construcción.
 *
 * Toma la identidad del sitio —logotipo, nombre y color— de la misma
 * configuración que usa el sitio publicado: es la portada de esa organización
 * el día antes de existir, no una página de sistema. Sin logotipo cargado se
 * dibuja el icono sobre el color de marca, que es lo que hacía la pantalla
 * anterior (`ComingSoon`) y sigue siendo el respaldo correcto.
 *
 * ⚠️ NO SE DIBUJA LA NAVEGACIÓN DEL SITIO, y no es una omisión estética: el
 * menú es un mapa de lo que hay dentro. Un visitante que no puede entrar
 * tampoco tiene por qué enterarse de qué páginas existen — y cada enlace sería
 * además un camino de vuelta a esta misma pantalla, que se lee como un sitio
 * roto.
 *
 * Sólo hay dos acciones, y las dos están justificadas:
 *   · Iniciar sesión — es lo que permite al equipo entrar a seguir armándolo.
 *     Va SIEMPRE: sin ella, un sitio en construcción no se puede desbloquear
 *     desde el navegador.
 *   · Contacto — SÓLO si el sitio tiene a dónde escribir configurado. Un botón
 *     que no lleva a ninguna parte es peor que ninguno (regla de v4.650).
 */
const SiteUnderConstruction = () => {
    const { club } = useClub();

    const nombre = (club?.name || '').trim();
    const logo = (club?.logo || '').trim();
    const color = (club?.colors?.primary || '').trim() || '#17458F';

    // El botón de contacto se ofrece si hay ALGO a dónde escribir: la página
    // de contacto del sitio existe siempre, pero mandar a alguien a un
    // formulario de un sitio que no tiene correo ni teléfono configurados es
    // mandarlo a un buzón que nadie lee.
    const correo = (club?.contact?.email || '').trim();
    const telefono = (club?.contact?.phone || '').trim();
    const hayContacto = !!(correo || telefono);

    const año = new Date().getFullYear();

    return (
        <div className="min-h-screen flex flex-col"
            style={{ background: `linear-gradient(160deg, ${color}12 0%, #ffffff 55%)` }}>

            <main className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
                <div className="mb-10">
                    {logo ? (
                        <img src={logo} alt={nombre} className="h-24 w-auto object-contain mx-auto" />
                    ) : (
                        <div className="w-24 h-24 rounded-3xl flex items-center justify-center mx-auto shadow-xl"
                            style={{ backgroundColor: color }}>
                            <Construction className="w-12 h-12 text-white" />
                        </div>
                    )}
                </div>

                <div className="max-w-2xl">
                    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold mb-8 border"
                        style={{ color, borderColor: `${color}33`, backgroundColor: `${color}12` }}>
                        <Construction className="w-4 h-4" />
                        Sitio en construcción
                    </span>

                    <h1 className="text-3xl md:text-5xl font-bold text-gray-900 leading-tight mb-6">
                        Estamos preparando algo especial
                    </h1>

                    {/* El nombre del sitio es un DATO, no lenguaje: el traductor
                        del sitio no puede convertirlo en otra cosa (v4.662). */}
                    {nombre && (
                        <p className="text-lg font-semibold text-gray-700 mb-4" data-no-translate>{nombre}</p>
                    )}

                    <p className="text-gray-500 text-base md:text-lg leading-relaxed mb-3">
                        Este sitio se encuentra actualmente en construcción. Estamos trabajando para
                        ofrecerte muy pronto toda la información y los servicios disponibles en nuestra
                        plataforma.
                    </p>
                    <p className="text-gray-400 text-base mb-10">Próximamente estaremos en línea.</p>

                    <div className="flex flex-wrap items-center justify-center gap-3">
                        <Link to="/login"
                            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full font-medium text-white shadow-lg transition-all duration-300 hover:opacity-90"
                            style={{ backgroundColor: color }}>
                            <LogIn className="w-5 h-5" />
                            Iniciar sesión
                        </Link>
                        {hayContacto && (
                            <a href={correo ? `mailto:${correo}` : `tel:${telefono}`}
                                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full font-medium border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-all duration-300">
                                <Mail className="w-5 h-5" />
                                Contacto
                            </a>
                        )}
                    </div>
                </div>
            </main>

            {/* Pie institucional simplificado: identifica de quién es el sitio y
                nada más. Ningún enlace a las páginas internas. */}
            <footer className="border-t border-gray-100 py-6 px-6">
                <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
                    {nombre && (
                        <span className="text-sm text-gray-400" data-no-translate>© {año} {nombre}</span>
                    )}
                    <span className="text-xs text-gray-300">
                        Powered by <span className="font-bold" data-no-translate>Club Platform for Rotary</span>
                    </span>
                </div>
            </footer>
        </div>
    );
};

export default SiteUnderConstruction;
