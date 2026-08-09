import { useSiteImages } from '../hooks/useSiteImages';
import { useClub } from '../contexts/ClubContext';
import { useCtaButton } from '../hooks/useCtaButton';
import { resolveCtaUrl, ctaTarget } from '../lib/ctaLinks';
import { Link } from 'react-router-dom';
import { resolveCtaEmoji, CtaStarIcon } from '../lib/ctaIcons';

/**
 * Bloque Destacado — el último contenedor de la portada, antes del pie.
 *
 * Una imagen de fondo a todo el ancho con un título, un texto y un botón, todo
 * cargado por el administrador del sitio. Sirve para la campaña que cada
 * organización quiera destacar (la erradicación de la polio, una convocatoria,
 * una conferencia) sin que nadie tenga que tocar el código.
 *
 * DOS REGLAS del sitio que sostienen este componente:
 *
 * 1. Nace VACÍO y entonces no pinta nada —ni el espacio—. La portada la
 *    comparten todos los sitios de la plataforma: un contenido escrito acá
 *    aparecería en cada club. Es la lección de v4.737, cuando la campaña de un
 *    distrito se convirtió en la portada de todos los distritos.
 * 2. El contenido es editable para CUALQUIER tipo de sitio, no sólo
 *    Evento/Convención. Las otras secciones con texto configurable
 *    (`actionContent`, `joinContent`, `foundationContent`) están acotadas con
 *    `hasEditableHome` por historia; ésta se pidió para un distrito, así que
 *    acotarla igual la habría dejado sin poder llenarse.
 */
const SpotlightSection = () => {
    const { club } = useClub();
    const siteImages = useSiteImages();
    const cta = useCtaButton();

    const content = ((club as any)?.spotlightContent || {}) as {
        title?: string; text?: string; buttonText?: string; buttonUrl?: string; icon?: string;
    };
    const imgUrl = siteImages.spotlight?.url?.trim() || '';
    const title = (content.title || '').trim();
    const text = (content.text || '').trim();

    // Sin imagen Y sin texto no hay bloque que mostrar. Se comprueban las dos
    // cosas —y no sólo la imagen— para que un sitio que escriba el texto antes
    // de subir la pieza vea lo que lleva escrito en vez de nada.
    if (!imgUrl && !title && !text) return null;

    const buttonText = (content.buttonText || '').trim();
    const buttonUrl = resolveCtaUrl(content.buttonUrl) || '';
    // Externo = OTRO DOMINIO, no «empieza por http»: un enlace al propio sitio
    // se abre en la misma pestaña (`ctaTarget`, regla de v4.657).
    const { external: isExternal, to: buttonHref } = ctaTarget(buttonUrl);
    // La MISMA piel y el MISMO icono que los demás botones de la portada
    // («Toma Acción con Nosotros», «Involúcrate en Rotary»): píldora con el
    // icono delante. Sin elección del sitio va la estrella dorada, que es el
    // respaldo de `ActionSection`.
    const btnClass = `inline-flex items-center gap-2 ${cta.className} font-medium px-8 py-3.5 rounded-full transition-all duration-300 shadow-lg`;
    const emoji = resolveCtaEmoji(content.icon);
    const btnInner = (
        <>
            {emoji ? <span className="text-xl leading-none">{emoji}</span> : <CtaStarIcon />}
            {buttonText}
        </>
    );

    return (
        <section className="relative w-full min-h-[420px] md:min-h-[560px] overflow-hidden">
            {imgUrl && (
                <div className="absolute inset-0">
                    <img
                        src={imgUrl}
                        alt={siteImages.spotlight?.alt || ''}
                        className="w-full h-full object-cover"
                        /* Cierra la portada: cargarla de forma diferida evita que
                           compita con el primer pintado (regla de v4.659). */
                        loading="lazy"
                        decoding="async"
                    />
                    {/*
                        El velo hace legible el texto sobre CUALQUIER fotografía,
                        que es lo que permite que el administrador suba la que
                        quiera sin tener que pensar en el contraste. Es más denso
                        a la izquierda, que es donde cae el texto.
                    */}
                    <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/10" />
                </div>
            )}
            {/* Sin imagen, el bloque se sostiene sobre el azul del sitio. */}
            {!imgUrl && <div className="absolute inset-0 bg-rotary-topbar" />}

            <div className="relative z-10 min-h-[420px] md:min-h-[560px] flex items-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
                <div className="max-w-xl">
                    {title && (
                        <h2 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight whitespace-pre-line">
                            {title}
                        </h2>
                    )}
                    {text && (
                        <p className="text-white/90 text-base md:text-lg leading-relaxed mb-8 whitespace-pre-line">
                            {text}
                        </p>
                    )}
                    {/* El botón sólo aparece si lleva destino: uno que no va a
                        ninguna parte es peor que no tenerlo. */}
                    {buttonText && buttonUrl && (
                        isExternal ? (
                            <a href={buttonHref} target="_blank" rel="noopener noreferrer" className={btnClass} style={cta.style}>{btnInner}</a>
                        ) : (
                            <Link to={buttonHref} className={btnClass} style={cta.style}>{btnInner}</Link>
                        )
                    )}
                </div>
            </div>
        </section>
    );
};

export default SpotlightSection;
