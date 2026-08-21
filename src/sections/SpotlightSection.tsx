import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSiteImages } from '../hooks/useSiteImages';
import { useClub } from '../contexts/ClubContext';
import { useCtaButton } from '../hooks/useCtaButton';
import { resolveCtaUrl, ctaTarget } from '../lib/ctaLinks';
import { Link } from 'react-router-dom';
import { resolveCtaEmoji, CtaStarIcon } from '../lib/ctaIcons';
import {
    normalizeSlide, withLocalSlide, SLIDE_FADE_MS, SWIPE_THRESHOLD_PX,
    DEFAULT_AUTOPLAY_MS, type RenderableSlide,
} from '../lib/spotlightSpec';

/**
 * Bloque Destacado — el último contenedor de la portada, antes del pie.
 *
 * Una imagen de fondo a todo el ancho con un título, un texto y un botón.
 * Desde v4.879 el contenido puede venir de DOS sitios y el contenedor es el
 * mismo: no hay una segunda sección.
 *
 *   · GLOBAL — un slide publicado UNA vez en Club Platform que alcanza a los
 *     sitios que se elijan (`/api/spotlight-slides/active`). Una emergencia,
 *     una convocatoria, End Polio Now.
 *   · LOCAL — el «Bloque Destacado» de siempre: `club.spotlightContent` más
 *     la imagen `spotlight` de Distribución de Imágenes. No se tocó nada de
 *     cómo se carga ni de cómo se ve.
 *
 * CON UN SOLO SLIDE SE PINTA EXACTAMENTE COMO ANTES —sin flechas, sin puntos
 * y sin nada que se mueva—. El carrusel aparece sólo cuando de verdad hay
 * varios: unos controles que no controlan nada son peor que no tenerlos
 * (v4.650), y un sitio que no use el módulo nuevo no puede notar que existe.
 *
 * TRES REGLAS del sitio que sostienen este componente:
 *
 * 1. Nace VACÍO y entonces no pinta nada —ni el espacio—. La portada la
 *    comparten todos los sitios de la plataforma: un contenido escrito acá
 *    aparecería en cada club. Es la lección de v4.737, cuando la campaña de
 *    un distrito se convirtió en la portada de todos los distritos.
 * 2. El contenido es editable para CUALQUIER tipo de sitio, no sólo
 *    Evento/Convención. Las otras secciones con texto configurable
 *    (`actionContent`, `joinContent`, `foundationContent`) están acotadas con
 *    `hasEditableHome` por historia; ésta se pidió para un distrito, así que
 *    acotarla igual la habría dejado sin poder llenarse.
 * 3. LAS REGLAS VISUALES SON DEL SISTEMA, NO DEL ADMINISTRADOR. El velo, los
 *    márgenes, el ancho de la columna de texto y la piel del botón no se
 *    configuran: son lo que garantiza que el título se lea sobre CUALQUIER
 *    fotografía que alguien suba. Quien publica elige la imagen y el texto;
 *    el contraste no es una decisión editorial.
 */

const API = import.meta.env.VITE_API_URL || '/api';

// ─── Los slides globales ────────────────────────────────────────────────
//
// Una sola petición por visita, y sólo si hay sitio. DEGRADA SIEMPRE: sin
// respuesta, con la tabla todavía sin crear o con la red caída, la lista
// queda vacía y la portada se ve como antes de este módulo. Una portada no
// puede quedarse a medias porque falle un carrusel.
function useGlobalSlides(clubId?: string): RenderableSlide[] {
    const [slides, setSlides] = useState<RenderableSlide[]>([]);

    useEffect(() => {
        if (!clubId) { setSlides([]); return; }
        let vivo = true;
        fetch(`${API}/spotlight-slides/active?clubId=${encodeURIComponent(clubId)}`)
            .then(r => (r.ok ? r.json() : { slides: [] }))
            .then(d => { if (vivo) setSlides((d?.slides || []).map((s: any) => normalizeSlide(s))); })
            .catch(() => { if (vivo) setSlides([]); });
        return () => { vivo = false; };
    }, [clubId]);

    return slides;
}

interface SpotlightSectionProps {
    /**
     * Vista previa del panel: pinta ESTOS slides en vez de consultar. Es el
     * mismo componente y por tanto la misma maquetación — un previsualizador
     * aparte se separaría del real y la diferencia se vería como «la vista
     * previa no es lo que se publicó» (la regla de Plantillas IA).
     */
    previewSlides?: RenderableSlide[];
    /**
     * Fuerza qué imagen se usa en la vista previa. En el sitio real la elige
     * `<picture>`, que es lo correcto —el navegador decide ANTES de
     * descargar—, pero `media` se evalúa contra el ancho de la VENTANA y no
     * del contenedor: dentro del marco angosto del panel seguiría eligiendo
     * la de escritorio. Sólo para la vista previa.
     */
    previewViewport?: 'desktop' | 'mobile';
}

const SpotlightSection = ({ previewSlides, previewViewport }: SpotlightSectionProps = {}) => {
    const { club } = useClub();
    const siteImages = useSiteImages();
    const cta = useCtaButton();

    const esPrevia = Array.isArray(previewSlides);
    // En vista previa no se consulta nada: el panel ya sabe qué quiere ver.
    const globales = useGlobalSlides(esPrevia ? undefined : (club as any)?.id);

    // El slide LOCAL, armado con lo que ya está cargado en el navegador. No
    // se pide al servidor: `spotlightContent` viaja con el club desde
    // `by-domain` y la imagen desde `useSiteImages`, así que pedirlo otra vez
    // sería una consulta más por visita para algo que ya se tiene.
    const local = useMemo<RenderableSlide | null>(() => {
        const c = ((club as any)?.spotlightContent || {}) as {
            title?: string; text?: string; buttonText?: string; buttonUrl?: string; icon?: string;
        };
        const image = siteImages.spotlight?.url?.trim() || '';
        const title = (c.title || '').trim();
        const text = (c.text || '').trim();
        if (!image && !title && !text) return null;
        return normalizeSlide({
            id: '__local__',
            name: 'Bloque Destacado del sitio',
            title, text, image,
            imageAlt: siteImages.spotlight?.alt || '',
            buttonText: (c.buttonText || '').trim(),
            buttonUrl: (c.buttonUrl || '').trim(),
            buttonIcon: c.icon || 'star',
            active: true,
        });
    }, [club, siteImages.spotlight?.url, siteImages.spotlight?.alt]);

    // La lista final. El local va AL FINAL: los globales son campañas de la
    // red con vigencia acotada y el local es la pieza permanente del sitio,
    // así que el llamado urgente va primero.
    const slides = useMemo<RenderableSlide[]>(
        () => (esPrevia ? (previewSlides as RenderableSlide[]) : withLocalSlide(globales, local)),
        [esPrevia, previewSlides, globales, local]
    );

    const total = slides.length;
    const [idx, setIdx] = useState(0);
    // DOS frenos, y cada uno con su forma de soltarse (regla de v4.832: un
    // freno sin salida no se lee como un freno, se lee como que la función
    // dejó de funcionar).
    //   · `quieto` — el cursor está encima o el foco está dentro. Se suelta
    //     al salir. Reversible.
    //   · `tomado` — alguien pulsó una flecha, un punto o arrastró. NO se
    //     suelta, y es deliberado: es un gesto explícito de elegir una
    //     diapositiva, y volver a moverla bajo sus ojos sería desobedecerlo.
    //     Es además lo que recomienda el patrón de carrusel de WAI-ARIA. La
    //     excepción a v4.832 se sostiene porque aquello era un VIDEO, donde
    //     no hay forma de saber cuándo alguien dejó de mirarlo; acá el gesto
    //     es puntual y su intención es inequívoca.
    const [quieto, setQuieto] = useState(false);
    const [tomado, setTomado] = useState(false);
    const arrastre = useRef<{ x: number; y: number } | null>(null);

    // Quien pidió menos movimiento no recibe una rotación automática. Se lee
    // una vez y se escucha el cambio: la preferencia se puede activar con la
    // página abierta.
    const [menosMovimiento, setMenosMovimiento] = useState(false);
    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        const leer = () => setMenosMovimiento(mq.matches);
        leer();
        mq.addEventListener?.('change', leer);
        return () => mq.removeEventListener?.('change', leer);
    }, []);

    // Si la lista se acorta —se retiró una campaña mientras alguien miraba—
    // el índice se acota AL LEER, sin otro efecto que lo persiga.
    const activo = total ? Math.min(idx, total - 1) : 0;

    const ir = useCallback((n: number) => {
        setTomado(true);
        setIdx(((n % total) + total) % total);
    }, [total]);
    const siguiente = useCallback(() => ir(activo + 1), [ir, activo]);
    const anterior = useCallback(() => ir(activo - 1), [ir, activo]);

    // Autoplay. Es un `setTimeout` con la duración del slide ACTUAL, no un
    // intervalo fijo: así cada pieza puede quedarse lo que necesite —un
    // párrafo largo pide más tiempo que un titular— sin un segundo mando.
    useEffect(() => {
        if (total < 2 || quieto || tomado || menosMovimiento) return;
        const ms = slides[activo]?.autoplayMs || DEFAULT_AUTOPLAY_MS;
        const t = setTimeout(() => setIdx(p => (p + 1) % total), ms);
        return () => clearTimeout(t);
    }, [total, quieto, tomado, menosMovimiento, activo, slides]);

    // Teclado: ← y → mientras el foco está dentro del carrusel. Las flechas y
    // los puntos son botones de verdad, así que el recorrido con Tab ya
    // funciona; esto es el atajo que espera quien reconoce un carrusel.
    const alTeclear = useCallback((e: React.KeyboardEvent) => {
        if (total < 2) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); siguiente(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); anterior(); }
    }, [total, siguiente, anterior]);

    // Swipe. Con Pointer Events, que cubre dedo, lápiz y ratón sin tres
    // manejadores. Se compara con el desplazamiento VERTICAL: sin eso, un
    // gesto de bajar por la página con el dedo torcido pasaría de slide.
    const alBajar = (e: React.PointerEvent) => { arrastre.current = { x: e.clientX, y: e.clientY }; };
    const alSoltar = (e: React.PointerEvent) => {
        const ini = arrastre.current;
        arrastre.current = null;
        if (!ini || total < 2) return;
        const dx = e.clientX - ini.x;
        const dy = e.clientY - ini.y;
        if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) return;
        dx < 0 ? siguiente() : anterior();
    };

    // ⚠️ El corte va DESPUÉS de todos los hooks. React identifica cada hook
    // por su ORDEN de llamada: uno escrito debajo de un `return` temprano no
    // se ejecuta en el primer render y sí en el segundo, y el árbol entero se
    // cae sin pintar nada (`npm run check:hooks`, la lección de v4.689).
    if (total === 0) return null;

    const esCarrusel = total > 1;

    return (
        <section
            className="relative w-full overflow-hidden select-none"
            {...(esCarrusel ? {
                role: 'region',
                'aria-roledescription': 'carrusel',
                'aria-label': 'Llamados a la acción',
                onKeyDown: alTeclear,
                onMouseEnter: () => setQuieto(true),
                onMouseLeave: () => setQuieto(false),
                onFocus: () => setQuieto(true),
                onBlur: () => setQuieto(false),
                onPointerDown: alBajar,
                onPointerUp: alSoltar,
                onPointerCancel: () => { arrastre.current = null; },
            } : {})}
        >
            {/*
                Las diapositivas se APILAN en una celda de rejilla en vez de ir
                absolutas: así el contenedor mide lo que mide la MÁS ALTA y un
                slide con un párrafo largo no se desborda sobre el pie.
                Todas montadas y cruzándose por opacidad, como el hero de la
                portada: montarlas y desmontarlas haría que cada cambio pidiera
                la imagen otra vez y se viera el hueco mientras carga.

                `aria-live` sigue al autoplay, como pide el patrón de carrusel:
                con la rotación en marcha, anunciar cada cambio interrumpiría a
                quien está leyendo otra cosa; detenida, el cambio lo pidió esa
                persona y sí quiere oírlo.
            */}
            <div className="grid" aria-live={esCarrusel && (quieto || tomado || menosMovimiento) ? 'polite' : 'off'}>
                {slides.map((s, i) => {
                    const visible = i === activo;
                    const buttonUrl = resolveCtaUrl(s.buttonUrl) || '';
                    // Externo = OTRO DOMINIO, no «empieza por http» (v4.657).
                    // `blank` sólo puede FORZAR pestaña nueva; nunca traer a
                    // la misma un dominio ajeno.
                    const t = ctaTarget(buttonUrl);
                    const external = t.external || s.openMode === 'blank';
                    const href = t.to;
                    const emoji = resolveCtaEmoji(s.buttonIcon);
                    // La MISMA piel que los demás botones de la portada
                    // («Toma Acción con Nosotros», «Involúcrate en Rotary»).
                    const btnClass = `inline-flex items-center gap-2 ${cta.className} font-medium px-8 py-3.5 rounded-full transition-all duration-300 shadow-lg`;
                    const btnInner = (
                        <>
                            {emoji ? <span className="text-xl leading-none">{emoji}</span> : <CtaStarIcon />}
                            {s.buttonText}
                        </>
                    );
                    // Un slide que no manda queda fuera del recorrido con Tab
                    // y del lector de pantalla: sigue en el DOM para que el
                    // cruce de opacidad funcione, pero su botón no puede
                    // recibir foco — un enlace invisible que se enfoca es de
                    // los defectos de accesibilidad más desconcertantes.
                    const oculto = !visible;

                    return (
                        <div
                            key={s.id || i}
                            className={`col-start-1 row-start-1 relative min-h-[420px] md:min-h-[560px] transition-opacity ease-in-out ${visible ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}
                            style={{ transitionDuration: `${SLIDE_FADE_MS}ms` }}
                            aria-hidden={oculto || undefined}
                            {...(esCarrusel ? {
                                role: 'group',
                                'aria-roledescription': 'diapositiva',
                                'aria-label': `${i + 1} de ${total}${s.name ? `: ${s.name}` : ''}`,
                            } : {})}
                        >
                            {s.image ? (
                                <div className="absolute inset-0">
                                    {/*
                                        La imagen de móvil la elige `<picture>`
                                        y no un `useState` de ancho: el
                                        navegador decide ANTES de descargar,
                                        así que un teléfono nunca se baja la
                                        panorámica de escritorio para
                                        descartarla. Sin pieza de móvil
                                        cargada se usa la de siempre, que es
                                        lo que hace hoy el bloque y se ve
                                        correctamente.
                                    */}
                                    {previewViewport ? (
                                        <img
                                            src={previewViewport === 'mobile' && s.imageMobile ? s.imageMobile : s.image}
                                            alt={(previewViewport === 'mobile' && s.imageMobile ? s.imageMobileAlt : s.imageAlt) || ''}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <picture>
                                            {s.imageMobile && <source media="(max-width: 767px)" srcSet={s.imageMobile} />}
                                            <img
                                                src={s.image}
                                                alt={s.imageAlt || ''}
                                                className="w-full h-full object-cover"
                                                /* Cierra la portada: cargarla de forma diferida evita
                                                   que compita con el primer pintado (regla de v4.659). */
                                                loading="lazy"
                                                decoding="async"
                                                draggable={false}
                                            />
                                        </picture>
                                    )}
                                    {/*
                                        El velo hace legible el texto sobre
                                        CUALQUIER fotografía, que es lo que
                                        permite que quien publica suba la que
                                        quiera sin tener que pensar en el
                                        contraste. Es más denso a la izquierda,
                                        que es donde cae el texto. NO es
                                        configurable a propósito: el contraste
                                        no es una decisión editorial.
                                    */}
                                    <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/10" />
                                </div>
                            ) : (
                                /* Sin imagen, el slide se sostiene sobre el azul del sitio. */
                                <div className="absolute inset-0 bg-rotary-topbar" />
                            )}

                            <div className="relative z-10 min-h-[420px] md:min-h-[560px] flex items-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
                                <div className="max-w-xl">
                                    {s.title && (
                                        <h2 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight whitespace-pre-line">
                                            {s.title}
                                        </h2>
                                    )}
                                    {s.text && (
                                        <p className="text-white/90 text-base md:text-lg leading-relaxed mb-8 whitespace-pre-line">
                                            {s.text}
                                        </p>
                                    )}
                                    {/* El botón sólo aparece si lleva destino: uno que
                                        no va a ninguna parte es peor que no tenerlo. */}
                                    {s.buttonText && buttonUrl && (
                                        external ? (
                                            <a href={href} target="_blank" rel="noopener noreferrer"
                                                className={btnClass} style={cta.style}
                                                tabIndex={oculto ? -1 : undefined}>{btnInner}</a>
                                        ) : (
                                            <Link to={href} className={btnClass} style={cta.style}
                                                tabIndex={oculto ? -1 : undefined}>{btnInner}</Link>
                                        )
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {esCarrusel && (
                <>
                    {/* Las flechas van a los costados, verticalmente centradas,
                        y por debajo de `md` desaparecen: ahí no hay ancho
                        lateral libre y se comerían el texto — para eso está el
                        swipe, que es el gesto natural en un teléfono. */}
                    <button
                        type="button" onClick={anterior} aria-label="Llamado anterior"
                        className="hidden md:flex absolute left-4 lg:left-8 top-1/2 -translate-y-1/2 z-20 h-12 w-12 items-center justify-center rounded-full bg-black/35 hover:bg-black/60 text-white backdrop-blur-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
                    </button>
                    <button
                        type="button" onClick={siguiente} aria-label="Llamado siguiente"
                        className="hidden md:flex absolute right-4 lg:right-8 top-1/2 -translate-y-1/2 z-20 h-12 w-12 items-center justify-center rounded-full bg-black/35 hover:bg-black/60 text-white backdrop-blur-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
                    </button>

                    {/* Los puntos, alineados con la columna de texto y no
                        centrados en la pantalla: el texto vive a la izquierda,
                        y unos puntos en el medio quedarían huérfanos sobre la
                        fotografía. */}
                    <div className="absolute bottom-6 md:bottom-10 left-0 right-0 z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex gap-2.5">
                            {slides.map((s, i) => (
                                <button
                                    key={s.id || i} type="button" onClick={() => ir(i)}
                                    aria-label={`Ver el llamado ${i + 1} de ${total}${s.name ? `: ${s.name}` : ''}`}
                                    aria-current={i === activo}
                                    className={`h-2.5 rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/40 ${i === activo ? 'w-9 bg-white' : 'w-2.5 bg-white/50 hover:bg-white/80'}`}
                                />
                            ))}
                        </div>
                    </div>
                </>
            )}
        </section>
    );
};

export default SpotlightSection;
