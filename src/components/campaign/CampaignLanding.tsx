import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Share2, ArrowRight, MapPin, Phone, Clock, User, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { getBlockIcon } from '../../lib/paymentBlocks';
import { ctaTarget } from '../../lib/ctaLinks';
import { hexOrEmpty, groupCenters, heroSlides, sectionVideos, HERO_SLIDE_MS, type ContributionCenter } from '../../lib/contributionSpec';

// ════════════════════════════════════════════════════════════════════
// La landing de campaña — v4.804 (Fase 2)
//
// Pinta la campaña activa que devuelve /api/contribution-campaigns/active.
// TODO sale de la configuración: acá no hay un solo texto escrito — la regla
// del Bloque Destacado (v4.746): la página la comparten todos los sitios y un
// contenido en el código aparecería en cada club.
//
// Secciones de esta fase: hero, tarjeta de aporte y «¿cómo puedes ayudar?».
// Los elementos requeridos, los centros de acopio, los indicadores, los
// bloques informativos, el cierre y los aliados llegan en F3/F4 — cada
// sección se pinta sólo si su fase ya la implementó Y su contenido existe.
//
// Reglas de la casa que este archivo cumple:
// - Un CTA de acción `centers` NO se pinta hasta que exista la sección de
//   centros (F3): nunca un botón que no lleva a ninguna parte (v4.650).
// - Un enlace configurado pasa por ctaTarget (v4.657): interno en la misma
//   pestaña, externo en pestaña nueva — nunca la comprobación a mano.
// - Los iconos salen del registro BLOCK_ICONS de paymentBlocks: un catálogo
//   nuevo de iconos sería la copia que se queda atrás.
// - El color del tema viaja en HEXADECIMAL con style en línea (v4.719): una
//   clase Tailwind armada al vuelo no llega al CSS compilado.
// ════════════════════════════════════════════════════════════════════

interface Cta { label: string; url: string; action: 'donate' | 'centers' | 'link' | 'share'; }

// ── Métricas (F5) ───────────────────────────────────────────────────────────
//
// Se reporta con `sendBeacon`: no espera respuesta y sobrevive a que el
// visitante navegue —justo lo que pasa al pulsar «aportar», que redirige a
// Stripe—. Sin cookies, sin identificar a nadie: lo que se cuenta es cuántas
// veces pasó algo. Un fallo se ignora: contar es secundario y no puede
// romper una página que pide ayuda en una emergencia.
const API_BASE = import.meta.env.VITE_API_URL || '/api';

export const trackCampaign = (campaignId: string, clubId: string, type: string, preview: boolean) => {
    // En vista previa NO se cuenta: el operador mirando su borrador no es
    // tráfico de campaña, y contarlo ensuciaría la única medida que hay.
    if (preview || !campaignId || !clubId) return;
    try {
        const body = JSON.stringify({ clubId, type });
        const url = `${API_BASE}/contribution-campaigns/${encodeURIComponent(campaignId)}/track`;
        if (navigator.sendBeacon) {
            navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
        } else {
            fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
        }
    } catch { /* contar nunca rompe la página */ }
};

export interface CampaignData {
    id: string;
    slug: string;
    name: string;
    campaignType: string;
    content: any;
    stats: { id: string; label: string; value: string; source: string; updatedAt: string }[];
    statsUpdatedAt: string | null;
    local: any;
    centers?: ContributionCenter[];
}

// Qué secciones ya sabe pintar el navegador. `centers` entró en F3: un CTA de
// esa acción se pinta sólo si además ESTA campaña tiene centros publicados —
// la sección existe en el código, pero sin centros no existe en la página y
// el ancla no llevaría a ninguna parte. F4 completó las nueve.
export const IMPLEMENTED_SECTIONS = ['hero', 'donateCard', 'waysToHelp', 'requiredItems', 'centers', 'stats', 'infoBlocks', 'finalCta', 'partners'];

const shareCampaign = async (name: string) => {
    const url = window.location.href;
    try {
        if (navigator.share) {
            await navigator.share({ title: name, url });
            return;
        }
    } catch {
        return; // el usuario canceló el diálogo de compartir: no es un error
    }
    try {
        await navigator.clipboard.writeText(url);
        toast.success('Enlace copiado — compártelo donde quieras');
    } catch {
        toast.error('No se pudo copiar el enlace');
    }
};

// Un CTA configurado, resuelto a su gesto. Devuelve null cuando el botón no
// tendría a dónde llevar (acción de una sección que aún no existe, o enlace
// vacío): mejor ningún botón que uno muerto.
const CampaignCta: React.FC<{
    cta: Cta | undefined;
    campaignName: string;
    onDonate: () => void;
    solid: boolean;
    accent: string;
    hasCenters: boolean;
    onTrack: (type: string) => void;
}> = ({ cta, campaignName, onDonate, solid, accent, hasCenters, onTrack }) => {
    if (!cta?.label) return null;

    const cls = solid
        ? 'inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-bold text-[15px] text-white shadow-lg hover:brightness-90 transition-all uppercase tracking-wider'
        : 'inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-bold text-[15px] border-2 bg-white/90 hover:bg-white transition-all uppercase tracking-wider';
    const style = solid ? { backgroundColor: accent } : { borderColor: accent, color: accent };

    if (cta.action === 'donate') {
        return (
            <button onClick={onDonate} className={cls} style={style}>
                <Heart className="w-5 h-5 fill-current" /> {cta.label}
            </button>
        );
    }
    if (cta.action === 'share') {
        return (
            <button onClick={() => { onTrack('share_click'); shareCampaign(campaignName); }} className={cls} style={style}>
                <Share2 className="w-5 h-5" /> {cta.label}
            </button>
        );
    }
    if (cta.action === 'centers') {
        // El botón sólo existe si la sección de centros va a estar en ESTA
        // página: sin centros publicados, el ancla no lleva a ninguna parte.
        if (!IMPLEMENTED_SECTIONS.includes('centers') || !hasCenters) return null;
        return (
            <a href="#centros-de-acopio" onClick={() => onTrack('cta_centers_click')} className={cls} style={style}>{cta.label}</a>
        );
    }
    // Enlace configurado: el criterio de apertura es de ctaTarget, nunca a mano.
    if (!cta.url) return null;
    const t = ctaTarget(cta.url);
    return t.external
        ? <a href={cta.url} target="_blank" rel="noopener noreferrer" className={cls} style={style}>{cta.label} <ArrowRight className="w-4 h-4" /></a>
        : <Link to={t.to} className={cls} style={style}>{cta.label} <ArrowRight className="w-4 h-4" /></Link>;
};

const CampaignLanding: React.FC<{ campaign: CampaignData; onDonate: () => void; clubId: string; preview?: boolean }> = ({ campaign, onDonate, clubId, preview = false }) => {
    // Una vista por carga, no una por render: sin el guardia, cualquier
    // repintado (abrir el modal, cambiar de idioma) contaría otra visita.
    const viewSent = useRef(false);
    useEffect(() => {
        if (viewSent.current) return;
        viewSent.current = true;
        trackCampaign(campaign.id, clubId, 'view', preview);
    }, [campaign.id, clubId, preview]);

    // ── Las imágenes del hero se turnan, igual que en la portada ──
    //
    // Los dos hooks van ACÁ ARRIBA, antes de cualquier `return`: es la regla
    // de `check:hooks` y el defecto que dejó en blanco la portada de un sitio
    // de Evento (v4.689). `slides` se calcula más abajo con el resto del
    // contenido, así que el efecto lee su largo desde el estado del render.
    const [slide, setSlide] = useState(0);
    const slideCount = heroSlides(campaign.content?.hero).length;
    useEffect(() => {
        // Con una sola imagen no hay nada que turnar: un intervalo que
        // siempre vuelve al mismo índice es trabajo que no se ve.
        if (slideCount < 2) { setSlide(0); return; }
        const t = setInterval(() => setSlide(p => (p + 1) % slideCount), HERO_SLIDE_MS);
        return () => clearInterval(t);
    }, [slideCount]);

    // El video que se está viendo. Va ACÁ ARRIBA con el resto de los hooks,
    // antes de cualquier `return` (check:hooks). No hay intervalo: los videos
    // NO rotan solos — uno que se cambia mientras alguien lo mira es un
    // defecto, no una animación.
    const [videoIdx, setVideoIdx] = useState(0);

    const track = (type: string) => trackCampaign(campaign.id, clubId, type, preview);
    const handleDonate = () => { track('cta_donate_click'); onDonate(); };

    const content = campaign.content || {};
    const hero = content.hero || {};
    // El ÚNICO punto que decide si mandan las varias imágenes o la de
    // siempre: es criterio compartido con el servidor (espejo probado).
    const slides = heroSlides(hero);
    const card = content.donateCard || {};
    const ways = (content.waysToHelp || []).filter((w: any) => w.active !== false && w.title);
    const requiredItems = (content.requiredItems || []).filter((it: any) => it.active !== false && it.title);
    // Qué video es —y si se puede pintar— lo decide el criterio compartido,
    // no esta pantalla: es lo mismo que mira el editor para avisar en vivo.
    // Qué videos hay —y si se pueden pintar— lo decide el criterio compartido,
    // no esta pantalla: es lo mismo que mira el editor para avisar en vivo.
    const videos = sectionVideos(content.requiredItemsVideos, content.requiredItemsVideo);
    // Si se quitan videos desde el panel, el índice guardado puede quedar
    // fuera de rango: se acota al leer en vez de con otro efecto.
    const videoActual = videos[Math.min(videoIdx, videos.length - 1)] || null;
    const partners = (content.partners || []).filter((p: any) => p.active !== false && p.logo);
    // La agrupación por ciudad es el MISMO criterio del servidor (espejo).
    const centerGroups = groupCenters(campaign.centers);
    const hasCenters = centerGroups.length > 0;
    // El acento del tema, con el carmesí del botón APORTAR de siempre como
    // respaldo — el mismo color que la página genérica usa desde v4.409.
    const accent = hexOrEmpty(content.theme?.cta) || hexOrEmpty(content.theme?.primary) || '#9D2235';

    return (
        <>
            {/* ── Hero ── */}
            <section className="relative w-full min-h-[560px] md:min-h-[640px] overflow-hidden flex items-center">
                {slides.length > 0 ? (
                    // El `z-0` no es decorativo: convierte este contenedor en
                    // su propio contexto de apilamiento, así el z-10/z-20 de
                    // las imágenes y el velo se quedan DENTRO y no tapan el
                    // texto del hero, que va después y sin z-index.
                    <div className="absolute inset-0 z-0">
                        {/* Todas las imágenes están montadas y se cruzan por
                            opacidad, como en la portada: montar y desmontar
                            haría que cada cambio pidiera la imagen otra vez y
                            se viera el hueco mientras carga. */}
                        {slides.map((s, i) => (
                            <div key={`${s.url}-${i}`}
                                className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${i === slide ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
                                {/* El acercamiento lento es el MISMO del hero
                                    de la portada: sale del tema, no de un
                                    `<style>` propio (ver tailwind.config.js).
                                    Va sólo en la que manda — animar las que
                                    no se ven es trabajo invisible, y así el
                                    acercamiento se reinicia cuando le vuelve
                                    a tocar. */}
                                <img src={s.url} alt={s.alt || ''}
                                    className={`w-full h-full object-cover ${i === slide ? 'animate-hero-zoom' : ''}`} />
                            </div>
                        ))}
                        <div className="absolute inset-0 z-20 bg-gradient-to-r from-black/70 via-black/50 to-black/20" />
                    </div>
                ) : (
                    <div className="absolute inset-0 bg-rotary-topbar" />
                )}

                {/* Los puntos sólo con más de una imagen: con una sola serían
                    un control que no controla nada. */}
                {slides.length > 1 && (
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex gap-2">
                        {slides.map((_, i) => (
                            <button key={i} type="button" onClick={() => setSlide(i)}
                                aria-label={`Ver imagen ${i + 1} de ${slides.length}`}
                                aria-current={i === slide}
                                className={`h-3 rounded-full transition-all duration-300 ${i === slide ? 'w-8 bg-white' : 'w-3 bg-white/50 hover:bg-white/70'}`} />
                        ))}
                    </div>
                )}

                <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full py-20 grid lg:grid-cols-2 gap-10 items-center">
                    <div className="text-white">
                        {hero.badge && (
                            <span className="inline-block px-4 py-1.5 rounded-full text-[12px] font-black uppercase tracking-widest text-white mb-6" style={{ backgroundColor: accent }}>
                                {hero.badge}
                            </span>
                        )}
                        {hero.title && (
                            <h1 className="text-4xl md:text-6xl font-black leading-[1.05] tracking-tight mb-4">{hero.title}</h1>
                        )}
                        {hero.subtitle && (
                            <p className="text-xl md:text-2xl font-light text-white/90 mb-5">{hero.subtitle}</p>
                        )}
                        {hero.text && (
                            <p className="text-[15px] md:text-base text-white/80 leading-relaxed max-w-xl mb-6">{hero.text}</p>
                        )}
                        {hero.highlight && (
                            <p className="text-lg font-bold mb-8">{hero.highlight}</p>
                        )}
                        <div className="flex flex-col sm:flex-row gap-3">
                            <CampaignCta cta={hero.ctaPrimary} campaignName={campaign.name} onDonate={handleDonate} solid accent={accent} hasCenters={hasCenters} onTrack={track} />
                            <CampaignCta cta={hero.ctaSecondary} campaignName={campaign.name} onDonate={handleDonate} solid={false} accent={accent} hasCenters={hasCenters} onTrack={track} />
                        </div>
                    </div>

                    {/* ── Tarjeta de aporte ── */}
                    {(card.title || card.buttonText) && (
                        <div className="lg:justify-self-end w-full max-w-md">
                            <div className="bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.25)] p-8 md:p-10">
                                {card.badge && (
                                    <span className="inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-4" style={{ backgroundColor: `${accent}14`, color: accent }}>
                                        {card.badge}
                                    </span>
                                )}
                                {card.title && (
                                    <h2 className="text-[26px] font-normal text-gray-800 leading-tight mb-3">{card.title}</h2>
                                )}
                                {card.description && (
                                    <p className="text-gray-600 text-[15px] leading-relaxed mb-8">{card.description}</p>
                                )}
                                <button
                                    onClick={handleDonate}
                                    className="w-full text-white font-bold py-[18px] rounded-lg flex items-center justify-center gap-3 transition-all uppercase tracking-widest text-[13px] hover:brightness-90 shadow-lg"
                                    style={{ backgroundColor: accent }}
                                >
                                    <Heart className="w-5 h-5 fill-current" />
                                    {card.buttonText || 'APORTAR'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* ── ¿Cómo puedes ayudar? ── */}
            {ways.length > 0 && (
                <section id="como-ayudar" className="py-20 md:py-24 bg-rotary-concrete">
                    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            {ways.map((w: any) => {
                                const Icon = getBlockIcon(w.icon);
                                return (
                                    <div key={w.id} className="bg-white rounded-3xl p-7 border border-gray-100 flex flex-col">
                                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5" style={{ backgroundColor: `${accent}14` }}>
                                            <Icon className="w-7 h-7" style={{ color: accent }} />
                                        </div>
                                        <h3 className="text-lg font-bold text-gray-900 mb-2">{w.title}</h3>
                                        {w.description && (
                                            <p className="text-gray-500 text-sm leading-relaxed mb-5 flex-1">{w.description}</p>
                                        )}
                                        <div className="mt-auto">
                                            <CampaignWayCta cta={w.cta} campaignName={campaign.name} onDonate={handleDonate} accent={accent} hasCenters={hasCenters} onTrack={track} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </section>
            )}

            {/* ── Elementos que se requieren ── */}
            {requiredItems.length > 0 && (
                <section id="elementos-requeridos" className="py-20 md:py-24 bg-white">
                    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8">
                        <h2 className="text-3xl md:text-4xl font-light text-gray-900 tracking-tight text-center mb-12">
                            Elementos que se requieren
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            {requiredItems.map((it: any) => {
                                const Icon = getBlockIcon(it.icon);
                                return (
                                    <div key={it.id} className="rounded-2xl border border-gray-100 p-6 text-center bg-gray-50/60">
                                        <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center mb-4" style={{ backgroundColor: `${accent}14` }}>
                                            <Icon className="w-7 h-7" style={{ color: accent }} />
                                        </div>
                                        <h3 className="font-bold text-gray-900 leading-snug">{it.title}</h3>
                                        {it.description && <p className="text-sm text-gray-500 mt-2 leading-relaxed">{it.description}</p>}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Los videos van DEBAJO de las cajas y se recorren con
                            las flechas. Sólo entran los que se reconocen
                            (`sectionVideos` descarta el resto): la flecha
                            «siguiente» no puede llevar a un recuadro vacío.

                            NO rotan solas, al revés que el hero: un video que
                            se cambia solo mientras alguien lo está viendo es
                            un defecto, no una animación. */}
                        {videoActual && (
                            <div className="mt-14 max-w-3xl mx-auto">
                                <div className="relative w-full rounded-2xl overflow-hidden bg-gray-900 shadow-lg" style={{ aspectRatio: '16 / 9' }}>
                                    {videoActual.video.kind === 'file' ? (
                                        // Un archivo propio se reproduce con el
                                        // reproductor del navegador: no hace
                                        // falta librería ninguna.
                                        //
                                        // Se dibuja SÓLO el que manda —al revés
                                        // que las imágenes del hero, que están
                                        // todas montadas—: montar los demás
                                        // descargaría varios videos de una vez,
                                        // y `key` fuerza el remontaje para que
                                        // el anterior deje de sonar al cambiar.
                                        <video
                                            key={videoActual.url}
                                            src={videoActual.video.src}
                                            poster={videoActual.poster || undefined}
                                            controls
                                            playsInline
                                            preload="metadata"
                                            className="absolute inset-0 w-full h-full"
                                        />
                                    ) : (
                                        <iframe
                                            key={videoActual.url}
                                            src={videoActual.video.src}
                                            title={videoActual.title || 'Video de la campaña'}
                                            className="absolute inset-0 w-full h-full"
                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                            referrerPolicy="strict-origin-when-cross-origin"
                                            allowFullScreen
                                        />
                                    )}

                                    {/* Las flechas sólo con más de un video: una
                                        flecha que vuelve al mismo sitio es un
                                        control que no controla (v4.650).
                                        Van FUERA del área de los controles del
                                        reproductor —arriba y a los costados—
                                        para no taparle el botón de reproducir. */}
                                    {videos.length > 1 && (
                                        <>
                                            <button type="button" onClick={() => setVideoIdx(i => (i - 1 + videos.length) % videos.length)}
                                                aria-label="Video anterior"
                                                className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/45 hover:bg-black/70 text-white flex items-center justify-center transition-colors backdrop-blur-sm">
                                                <ChevronLeft className="w-6 h-6" />
                                            </button>
                                            <button type="button" onClick={() => setVideoIdx(i => (i + 1) % videos.length)}
                                                aria-label="Video siguiente"
                                                className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/45 hover:bg-black/70 text-white flex items-center justify-center transition-colors backdrop-blur-sm">
                                                <ChevronRight className="w-6 h-6" />
                                            </button>
                                            <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/45 text-white text-xs font-bold backdrop-blur-sm" data-no-translate>
                                                {videoIdx + 1}/{videos.length}
                                            </span>
                                        </>
                                    )}
                                </div>
                                {videoActual.title && (
                                    <p className="text-center text-sm text-gray-500 mt-4">{videoActual.title}</p>
                                )}
                                {videos.length > 1 && (
                                    <div className="flex justify-center gap-2 mt-4">
                                        {videos.map((_, i) => (
                                            <button key={i} type="button" onClick={() => setVideoIdx(i)}
                                                aria-label={`Ver video ${i + 1} de ${videos.length}`}
                                                aria-current={i === videoIdx}
                                                className={`h-2.5 rounded-full transition-all duration-300 ${i === videoIdx ? 'w-7' : 'w-2.5 bg-gray-300 hover:bg-gray-400'}`}
                                                style={i === videoIdx ? { backgroundColor: accent } : undefined} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {hasCenters && (
                            <div className="text-center mt-10">
                                <a href="#centros-de-acopio" onClick={() => track('cta_centers_click')}
                                    className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-[14px] text-white shadow-lg hover:brightness-90 transition-all uppercase tracking-wider"
                                    style={{ backgroundColor: accent }}>
                                    <MapPin className="w-5 h-5" /> Ver centros de acopio
                                </a>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* ── Centros de acopio ── */}
            {hasCenters && (
                <section id="centros-de-acopio" className="py-20 md:py-24 bg-rotary-concrete scroll-mt-24">
                    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8">
                        <h2 className="text-3xl md:text-4xl font-light text-gray-900 tracking-tight text-center mb-3">
                            Centros de acopio
                        </h2>
                        {content.centersNote && (
                            <p className="text-center text-gray-500 max-w-2xl mx-auto mb-12">{content.centersNote}</p>
                        )}
                        {!content.centersNote && <div className="mb-12" />}
                        {/* MAMPOSTERÍA, no rejilla. Con `grid`, todas las
                            tarjetas de una fila se estiran hasta la más alta:
                            una ciudad con un solo punto quedaba tan alta como
                            Cali con ocho, con media tarjeta en blanco. Con
                            columnas cada tarjeta mide lo que mide su contenido
                            y la siguiente empieza justo debajo.

                            Consecuencia aceptada: se lee hacia abajo por
                            columna y no de izquierda a derecha — que es como
                            se lee un directorio de ciudades, y es el precio de
                            no tener huecos.

                            `break-inside-avoid` es lo que impide que una
                            ciudad se parta entre dos columnas; sin él, la
                            mitad de las direcciones de Bogotá saltarían al
                            otro lado. El margen inferior lo pone la tarjeta:
                            `gap` en columnas separa columnas, no filas. */}
                        <div className="columns-1 md:columns-2 gap-6">
                            {centerGroups.map(cityGroup => (
                                <div key={cityGroup.city} className="break-inside-avoid mb-6 bg-white rounded-3xl border border-gray-100 p-7">
                                    <h3 className="flex items-center gap-2 text-xl font-black text-gray-900 mb-5">
                                        <MapPin className="w-5 h-5" style={{ color: accent }} />
                                        {cityGroup.city}
                                    </h3>
                                    <div className="space-y-5">
                                        {cityGroup.groups.map(g => (
                                            <div key={g.label || 'principal'}>
                                                {g.label && (
                                                    <p className="text-xs font-black uppercase tracking-wider mb-2" style={{ color: accent }}>{g.label}</p>
                                                )}
                                                <ul className="space-y-3">
                                                    {g.centers.map(c => (
                                                        <li key={c.id} className="text-sm leading-relaxed border-l-2 pl-3" style={{ borderColor: `${accent}33` }}>
                                                            {c.name && <p className="font-bold text-gray-900">{c.name}</p>}
                                                            {/* La dirección es un DATO, no lenguaje: no se traduce. */}
                                                            <p className="text-gray-700" data-no-translate>{c.address}</p>
                                                            {c.complement && <p className="text-gray-500" data-no-translate>{c.complement}</p>}
                                                            {c.schedule && (
                                                                <p className="text-gray-500 flex items-center gap-1.5 mt-1"><Clock className="w-3.5 h-3.5" /> {c.schedule}</p>
                                                            )}
                                                            {c.contactName && (
                                                                <p className="text-gray-500 flex items-center gap-1.5 mt-1"><User className="w-3.5 h-3.5" /> <span data-no-translate>{c.contactName}</span></p>
                                                            )}
                                                            {c.phone && (
                                                                <p className="flex items-center gap-1.5 mt-1">
                                                                    <Phone className="w-3.5 h-3.5 text-gray-400" />
                                                                    <a href={`tel:${c.phone.replace(/[^+\d]/g, '')}`} className="font-bold hover:underline" style={{ color: accent }} data-no-translate>{c.phone}</a>
                                                                </p>
                                                            )}
                                                            {c.notes && <p className="text-gray-400 text-xs mt-1">{c.notes}</p>}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                        {content.centersAlliance && (
                            <p className="text-center text-sm font-bold text-gray-600 mt-10">{content.centersAlliance}</p>
                        )}
                    </div>
                </section>
            )}

            {/* ── Panorama de la emergencia ── */}
            {campaign.stats.length > 0 && (
                <section id="panorama" className="py-20 md:py-24 bg-white">
                    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8">
                        <h2 className="text-3xl md:text-4xl font-light text-gray-900 tracking-tight text-center mb-12">
                            Panorama de la emergencia
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                            {campaign.stats.map(s => (
                                <div key={s.id} className="rounded-2xl border border-gray-100 bg-gray-50/60 p-6 text-center">
                                    {/* La cifra es un DATO: no se traduce ni se reescribe. */}
                                    <p className="text-3xl md:text-4xl font-black tracking-tight" style={{ color: accent }} data-no-translate>{s.value}</p>
                                    <p className="text-sm font-bold text-gray-700 mt-1">{s.label}</p>
                                    {/* La fuente es lo que hace publicable la cifra: siempre visible. */}
                                    <p className="text-[11px] text-gray-400 mt-2" data-no-translate>{s.source}</p>
                                </div>
                            ))}
                        </div>
                        {campaign.statsUpdatedAt && (
                            <p className="text-center text-xs text-gray-400 mt-8">
                                Última actualización: <span data-no-translate>{new Date(campaign.statsUpdatedAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                            </p>
                        )}
                    </div>
                </section>
            )}

            {/* ── Bloques informativos ── */}
            {(content.infoBlocks || []).filter((b: any) => b.active !== false && b.title).length > 0 && (
                <section className="py-20 md:py-24 bg-rotary-concrete">
                    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {(content.infoBlocks || []).filter((b: any) => b.active !== false && b.title).map((b: any) => (
                                <div key={b.id} className="bg-white rounded-md shadow-lg overflow-hidden flex flex-col">
                                    <div className="p-6 min-h-[110px] flex items-center justify-center text-center" style={{ backgroundColor: accent }}>
                                        <h3 className="text-white text-lg font-semibold leading-snug">{b.title}</h3>
                                    </div>
                                    <div className="p-8 flex-grow">
                                        <p className="text-gray-700 text-[15px] leading-relaxed">{b.text}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* ── Información del club (sobrescritura local, F4) ── */}
            {(campaign.local?.contact?.name || campaign.local?.contact?.phone || campaign.local?.contact?.email || campaign.local?.localNote || campaign.local?.qrImage) && (
                <section className="py-16 bg-white border-t border-gray-100">
                    <div className="max-w-[700px] mx-auto px-4 sm:px-6 lg:px-8 text-center">
                        <h2 className="text-xl font-light text-gray-900 mb-4">Información de contacto local</h2>
                        {campaign.local.localNote && (
                            <p className="text-gray-600 leading-relaxed mb-5">{campaign.local.localNote}</p>
                        )}
                        <div className="flex flex-col items-center gap-2 text-sm">
                            {campaign.local.contact?.name && (
                                <p className="font-bold text-gray-800 flex items-center gap-2"><User className="w-4 h-4 text-gray-400" /> <span data-no-translate>{campaign.local.contact.name}</span></p>
                            )}
                            {campaign.local.contact?.phone && (
                                <a href={`tel:${campaign.local.contact.phone.replace(/[^+\d]/g, '')}`} className="font-bold hover:underline flex items-center gap-2" style={{ color: accent }} data-no-translate>
                                    <Phone className="w-4 h-4" /> {campaign.local.contact.phone}
                                </a>
                            )}
                            {campaign.local.contact?.email && (
                                <a href={`mailto:${campaign.local.contact.email}`} className="font-bold hover:underline" style={{ color: accent }} data-no-translate>
                                    {campaign.local.contact.email}
                                </a>
                            )}
                        </div>
                        {campaign.local.qrImage && (
                            <img src={campaign.local.qrImage} alt="Código QR de aporte local" className="w-40 h-40 object-contain mx-auto mt-6 border border-gray-100 rounded-xl p-2" />
                        )}
                    </div>
                </section>
            )}

            {/* ── Cierre final ── */}
            {(content.finalCta?.title || content.finalCta?.text) && (
                <section className="relative py-24 md:py-28 overflow-hidden" style={{ backgroundColor: '#1C2B3A' }}>
                    <div className="absolute inset-0 opacity-20" style={{ background: `radial-gradient(circle at 30% 50%, ${accent}, transparent 60%)` }} />
                    <div className="relative max-w-[850px] mx-auto px-4 sm:px-6 lg:px-8 text-center text-white">
                        {content.finalCta.title && (
                            <h2 className="text-3xl md:text-5xl font-light tracking-tight leading-[1.1] mb-6">{content.finalCta.title}</h2>
                        )}
                        {content.finalCta.text && (
                            <p className="text-white/80 text-lg leading-relaxed max-w-2xl mx-auto mb-6">{content.finalCta.text}</p>
                        )}
                        {content.finalCta.quote && (
                            <p className="italic text-white/70 mb-10">«{content.finalCta.quote}»</p>
                        )}
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <CampaignCta cta={content.finalCta.ctaPrimary} campaignName={campaign.name} onDonate={handleDonate} solid accent={accent} hasCenters={hasCenters} onTrack={track} />
                            <CampaignCta cta={content.finalCta.ctaSecondary} campaignName={campaign.name} onDonate={handleDonate} solid={false} accent={accent} hasCenters={hasCenters} onTrack={track} />
                        </div>
                    </div>
                </section>
            )}

            {/* ── Aliados ── */}
            {partners.length > 0 && (
                <section className="py-14 bg-white border-t border-gray-100">
                    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-8">
                            {partners.map((p: any) => {
                                const img = (
                                    <img src={p.logo} alt={p.name || 'Aliado'} data-no-translate
                                        className="h-12 md:h-14 w-auto object-contain grayscale hover:grayscale-0 opacity-70 hover:opacity-100 transition-all" />
                                );
                                if (!p.url) return <span key={p.id}>{img}</span>;
                                const t = ctaTarget(p.url);
                                return t.external
                                    ? <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" aria-label={p.name || 'Aliado'}>{img}</a>
                                    : <Link key={p.id} to={t.to} aria-label={p.name || 'Aliado'}>{img}</Link>;
                            })}
                        </div>
                    </div>
                </section>
            )}
        </>
    );
};

// La versión compacta del CTA para las tarjetas de «cómo ayudar».
const CampaignWayCta: React.FC<{ cta: Cta | undefined; campaignName: string; onDonate: () => void; accent: string; hasCenters: boolean; onTrack: (type: string) => void }> =
    ({ cta, campaignName, onDonate, accent, hasCenters, onTrack }) => {
        if (!cta?.label) return null;
        const cls = 'inline-flex items-center gap-1.5 text-sm font-bold hover:underline';
        const style = { color: accent };
        if (cta.action === 'donate') return <button onClick={onDonate} className={cls} style={style}>{cta.label} <ArrowRight className="w-4 h-4" /></button>;
        if (cta.action === 'share') return <button onClick={() => { onTrack('share_click'); shareCampaign(campaignName); }} className={cls} style={style}>{cta.label} <ArrowRight className="w-4 h-4" /></button>;
        if (cta.action === 'centers') {
            if (!IMPLEMENTED_SECTIONS.includes('centers') || !hasCenters) return null;
            return <a href="#centros-de-acopio" onClick={() => onTrack('cta_centers_click')} className={cls} style={style}>{cta.label} <ArrowRight className="w-4 h-4" /></a>;
        }
        if (!cta.url) return null;
        const t = ctaTarget(cta.url);
        return t.external
            ? <a href={cta.url} target="_blank" rel="noopener noreferrer" className={cls} style={style}>{cta.label} <ArrowRight className="w-4 h-4" /></a>
            : <Link to={t.to} className={cls} style={style}>{cta.label} <ArrowRight className="w-4 h-4" /></Link>;
    };

export default CampaignLanding;
