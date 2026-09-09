import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useClub } from '../contexts/ClubContext';
import { ctaTarget } from '../lib/ctaLinks';
import {
    normalizeFloatingButton,
    floatingButtonVisible,
    floatingButtonLabel,
    opensExternalApp,
} from '../lib/floatingButton';

/**
 * El botón flotante del sitio — v4.1021.
 *
 * Un círculo fijo en la esquina INFERIOR IZQUIERDA de las páginas públicas,
 * espejo del que abre el chatbot a la derecha: misma forma, mismo tamaño y
 * misma sombra, para que los dos se lean como una pareja y no como dos cosas
 * que llegaron por separado. Lo llena el administrador de cada sitio desde
 * Configuración → Identidad: una imagen y a dónde lleva.
 *
 * ⚠️ NACE VACÍO Y NO PINTA NADA. Se monta en TODAS las páginas públicas de
 * TODOS los sitios de la plataforma, así que una imagen o un enlace escritos
 * acá aparecerían en cada club: es la lección de v4.737. Un sitio que no lo
 * use no puede notar que existe.
 *
 * ⚠️ LA IZQUIERDA ES SUYA Y LA DERECHA ES DEL CHATBOT, a propósito. Los dos
 * son `fixed bottom-6` y del mismo tamaño: puestos del mismo lado se taparían
 * el uno al otro justo en el móvil, que es donde menos sitio hay.
 *
 * Lo que se configura es la IMAGEN y el ENLACE; la forma del botón no. Es la
 * misma regla del Bloque Destacado (v4.746): quien publica elige el contenido
 * y el sistema garantiza que se vea —tamaño alcanzable con el dedo, contraste
 * contra cualquier fondo y un nombre accesible—, porque eso no es una decisión
 * editorial.
 */
const FloatingSiteButton = () => {
    const { club } = useClub();
    const { pathname } = useLocation();

    const config = useMemo(
        () => normalizeFloatingButton((club as any)?.floatingButton),
        [club],
    );

    // Todos los hooks ARRIBA, antes de cualquier return: React identifica cada
    // hook por su orden de llamada, y un render que llame menos que el anterior
    // aborta el árbol entero (`npm run check:hooks`, v4.689).
    if (!floatingButtonVisible(config, { path: pathname })) return null;

    const label = floatingButtonLabel(config);
    const destino = ctaTarget(config.url);
    // Un `mailto:`/`tel:` en pestaña nueva deja una pestaña en blanco detrás
    // en varios navegadores: abre una aplicación, no una página.
    const enPestanaNueva = destino.external && !opensExternalApp(config.url);

    // El aro y la imagen son los mismos en las dos ramas: el enlace interno va
    // por `<Link>` para no recargar el sitio, y sólo eso los distingue.
    const contenido = (
        <img
            src={config.imageUrl}
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover rounded-full"
            loading="lazy"
            decoding="async"
        />
    );

    // `w-[70px] h-[70px]` es el tamaño del botón del chatbot. No es capricho:
    // es la pareja visual, y además el mínimo cómodo para el dedo en un móvil.
    const piel =
        'relative block w-[70px] h-[70px] p-1 rounded-full bg-white border-2 border-rotary-blue ' +
        'shadow-2xl overflow-hidden transition-transform duration-300 hover:scale-[1.05] active:scale-95 ' +
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rotary-blue/40';

    return (
        <div className="fixed bottom-6 left-4 sm:left-8 z-50">
            {enPestanaNueva || destino.external ? (
                <a
                    href={destino.to}
                    title={label}
                    aria-label={label}
                    className={piel}
                    {...(enPestanaNueva ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                    {contenido}
                </a>
            ) : (
                <Link to={destino.to} title={label} aria-label={label} className={piel}>
                    {contenido}
                </Link>
            )}
        </div>
    );
};

export default FloatingSiteButton;
