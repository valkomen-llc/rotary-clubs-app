import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, Share2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { getBlockIcon } from '../../lib/paymentBlocks';
import { ctaTarget } from '../../lib/ctaLinks';
import { hexOrEmpty } from '../../lib/contributionSpec';

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

export interface CampaignData {
    id: string;
    slug: string;
    name: string;
    campaignType: string;
    content: any;
    stats: { id: string; label: string; value: string; source: string; updatedAt: string }[];
    statsUpdatedAt: string | null;
    local: any;
}

// Qué secciones ya sabe pintar el navegador. Cuando F3 entregue los centros,
// `centers` entra acá y los CTA de esa acción empiezan a pintarse solos.
export const IMPLEMENTED_SECTIONS = ['hero', 'donateCard', 'waysToHelp'];

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
}> = ({ cta, campaignName, onDonate, solid, accent }) => {
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
            <button onClick={() => shareCampaign(campaignName)} className={cls} style={style}>
                <Share2 className="w-5 h-5" /> {cta.label}
            </button>
        );
    }
    if (cta.action === 'centers') {
        // La sección de centros llega en F3; hasta entonces el botón no existe.
        if (!IMPLEMENTED_SECTIONS.includes('centers')) return null;
        return (
            <a href="#centros-de-acopio" className={cls} style={style}>{cta.label}</a>
        );
    }
    // Enlace configurado: el criterio de apertura es de ctaTarget, nunca a mano.
    if (!cta.url) return null;
    const t = ctaTarget(cta.url);
    return t.external
        ? <a href={cta.url} target="_blank" rel="noopener noreferrer" className={cls} style={style}>{cta.label} <ArrowRight className="w-4 h-4" /></a>
        : <Link to={t.to} className={cls} style={style}>{cta.label} <ArrowRight className="w-4 h-4" /></Link>;
};

const CampaignLanding: React.FC<{ campaign: CampaignData; onDonate: () => void }> = ({ campaign, onDonate }) => {
    const content = campaign.content || {};
    const hero = content.hero || {};
    const card = content.donateCard || {};
    const ways = (content.waysToHelp || []).filter((w: any) => w.active !== false && w.title);
    // El acento del tema, con el carmesí del botón APORTAR de siempre como
    // respaldo — el mismo color que la página genérica usa desde v4.409.
    const accent = hexOrEmpty(content.theme?.cta) || hexOrEmpty(content.theme?.primary) || '#9D2235';

    return (
        <>
            {/* ── Hero ── */}
            <section className="relative w-full min-h-[560px] md:min-h-[640px] overflow-hidden flex items-center">
                {hero.image ? (
                    <div className="absolute inset-0">
                        <img src={hero.image} alt={hero.imageAlt || ''} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/20" />
                    </div>
                ) : (
                    <div className="absolute inset-0 bg-rotary-topbar" />
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
                            <CampaignCta cta={hero.ctaPrimary} campaignName={campaign.name} onDonate={onDonate} solid accent={accent} />
                            <CampaignCta cta={hero.ctaSecondary} campaignName={campaign.name} onDonate={onDonate} solid={false} accent={accent} />
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
                                    onClick={onDonate}
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
                                            <CampaignWayCta cta={w.cta} campaignName={campaign.name} onDonate={onDonate} accent={accent} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </section>
            )}
        </>
    );
};

// La versión compacta del CTA para las tarjetas de «cómo ayudar».
const CampaignWayCta: React.FC<{ cta: Cta | undefined; campaignName: string; onDonate: () => void; accent: string }> =
    ({ cta, campaignName, onDonate, accent }) => {
        if (!cta?.label) return null;
        const cls = 'inline-flex items-center gap-1.5 text-sm font-bold hover:underline';
        const style = { color: accent };
        if (cta.action === 'donate') return <button onClick={onDonate} className={cls} style={style}>{cta.label} <ArrowRight className="w-4 h-4" /></button>;
        if (cta.action === 'share') return <button onClick={() => shareCampaign(campaignName)} className={cls} style={style}>{cta.label} <ArrowRight className="w-4 h-4" /></button>;
        if (cta.action === 'centers') {
            if (!IMPLEMENTED_SECTIONS.includes('centers')) return null;
            return <a href="#centros-de-acopio" className={cls} style={style}>{cta.label} <ArrowRight className="w-4 h-4" /></a>;
        }
        if (!cta.url) return null;
        const t = ctaTarget(cta.url);
        return t.external
            ? <a href={cta.url} target="_blank" rel="noopener noreferrer" className={cls} style={style}>{cta.label} <ArrowRight className="w-4 h-4" /></a>
            : <Link to={t.to} className={cls} style={style}>{cta.label} <ArrowRight className="w-4 h-4" /></Link>;
    };

export default CampaignLanding;
