import React, { useState, useEffect } from 'react';
import { Facebook, Twitter, Instagram, Youtube, Linkedin, Music, ArrowRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useClub } from '../contexts/ClubContext';
import { hasCustomTheme } from '../lib/entityTypes';
import { SITE_FOOTER_BG } from '../lib/siteChrome';

// ── Skin del pie de página, compartido (v4.659) ──────────────────────
//
// El `type` del club llega vacío en el primer render y con su valor real en
// cuanto responde `/clubs/by-domain`, así que el efecto se disparaba dos veces
// por página. Y al navegar volvía a pedirse, aunque el skin no cambia durante
// la visita. Se guarda por tipo y se comparte la petición en vuelo.

const footerSkins = new Map<string, Promise<any>>();

const loadFooterSkin = (type: string): Promise<any> => {
    const cached = footerSkins.get(type);
    if (cached) return cached;
    const promise = fetch(`${import.meta.env.VITE_API_URL || '/api'}/public/footer-skin?type=${type}`)
        .then(res => res.json())
        .catch(() => null);
    footerSkins.set(type, promise);
    return promise;
};

const Footer = () => {
    const { club } = useClub();
    const currentHostname = window.location.hostname;
    const typeRaw = (club as any)?.type || 'club';
    // Slug del skin de footer: los RYE/Programa de Intercambio usan el de asociación y
    // 'Feria de Proyectos' se mapea a 'projectfair' (clave con la que guarda el Footer System).
    const type = (typeRaw === 'district' && currentHostname.toLowerCase().startsWith('rye')) || typeRaw === 'Programa de Intercambio'
        ? 'association'
        : typeRaw === 'Feria de Proyectos' ? 'projectfair' : typeRaw;
    
    const [config, setConfig] = useState<any>(null);

    useEffect(() => {
        let vivo = true;
        loadFooterSkin(type).then(data => {
            if (vivo && data && !data.error) setConfig(data);
        });
        return () => { vivo = false; };
    }, [type]);

    // PREDEFINED DEFAULTS (Old skins acting as fallbacks)
    const getLocalDefaults = () => {
        const baseMenu2 = [
            { label: 'Aporte Voluntario', href: '#/maneras-de-contribuir' },
            { label: 'Comunícate con nosotros', href: '#/contacto' },
            { label: 'Rotary.org', href: 'https://rotary.org', external: true },
            { label: 'Pongamos Fin a la Polio', href: 'https://endpolio.org', external: true }
        ];

        switch(type) {
            case 'association':
                return {
                    logoTop: club.footerLogo || "https://app.clubplatform.org/rotary-logo-white.png",
                    logoBottom: club.settings?.youth_exchange_logo || club.endPolioLogo || "https://app.clubplatform.org/logo-end-polio.svg",
                    menu1Title: "Nuestra Red",
                    menu1Items: [
                        { label: 'Acerca de Rotary', href: '#/quienes-somos' },
                        { label: `Historia de ${club.name}`, href: '#/nuestra-historia' },
                        { label: 'Junta Directiva', href: '#/nuestra-junta-directiva' },
                        { label: 'Programa de Intercambios', href: '#/intercambio-jovenes' },
                        { label: 'My Rotary', href: 'https://my.rotary.org', external: true },
                        { label: 'Nuestros Eventos', href: '#/eventos' },
                        { label: 'Novedades', href: '#/blog' },
                        { label: 'Centro de Descargas', href: '#/descargas' },
                        { label: 'Contacto', href: '#/contacto' }
                    ],
                    menu2Title: "Realiza una Acción",
                    menu2Items: baseMenu2
                };
            case 'district':
                return {
                    logoTop: club.footerLogo || "https://app.clubplatform.org/rotary-logo-white.png",
                    logoBottom: club.settings?.youth_exchange_logo || club.endPolioLogo || "https://app.clubplatform.org/logo-end-polio.svg",
                    menu1Title: "El Distrito",
                    menu1Items: [
                        { label: 'Gobernación', href: '#/gobernacion' },
                        { label: 'Clubes del Distrito', href: '#/clubes' },
                        { label: 'Historia del Distrito', href: '#/historia' },
                        { label: 'La Fundación Rotaria', href: '#/la-fundacion-rotaria' },
                        { label: 'Intercambio de Jóvenes (RYE)', href: '#/intercambio-jovenes' },
                        { label: 'My Rotary', href: 'https://my.rotary.org', external: true },
                        { label: 'Eventos Distritales', href: '#/eventos' },
                        { label: 'Noticias', href: '#/blog' },
                        { label: 'Contacto', href: '#/contacto' }
                    ],
                    menu2Title: "Realiza una Acción",
                    menu2Items: baseMenu2
                };
            case 'colrotarios':
                return {
                    logoTop: club.footerLogo || "https://app.clubplatform.org/rotary-logo-white.png",
                    logoBottom: club.settings?.youth_exchange_logo || club.endPolioLogo || "https://app.clubplatform.org/logo-end-polio.svg",
                    menu1Title: "La Fundación",
                    menu1Items: [
                        { label: 'Quiénes Somos', href: '#/quienes-somos' },
                        { label: 'Historia Institucional', href: '#/nuestra-historia' },
                        { label: 'Transparencia', href: '#/estados-financieros' },
                        { label: 'Programas', href: '#/proyectos' },
                        { label: 'My Rotary', href: 'https://my.rotary.org', external: true },
                        { label: 'Contacto', href: '#/contacto' }
                    ],
                    menu2Title: "Acción Social",
                    menu2Items: baseMenu2
                };
            case 'club':
            default:
                return {
                    logoTop: club.footerLogo || "https://app.clubplatform.org/rotary-logo-white.png",
                    logoBottom: club.settings?.youth_exchange_logo || club.endPolioLogo || "https://app.clubplatform.org/logo-end-polio.svg",
                    menu1Title: "El Club",
                    menu1Items: [
                        { label: 'Quiénes Somos', href: '#/quienes-somos' },
                        { label: 'Nuestra Historia', href: '#/nuestra-historia' },
                        { label: 'Junta Directiva local', href: '#/nuestra-junta-directiva' },
                        { label: 'La Fundación Rotaria', href: '#/la-fundacion-rotaria' },
                        { label: 'Hazte Socio', href: '#/contacto' },
                        { label: 'Proyectos Locales', href: '#/proyectos' },
                        { label: 'My Rotary', href: 'https://my.rotary.org', external: true },
                        { label: 'Eventos del Club', href: '#/eventos' },
                        { label: 'Blog de Noticias', href: '#/blog' },
                        { label: 'Contacto', href: '#/contacto' }
                    ],
                    menu2Title: "Realiza una Acción",
                    menu2Items: baseMenu2
                };
        }
    };

    // Colores/textura + footer configurable: solo sitios con tema visual propio (Evento/Convención).
    // Las Ferias de Proyectos conservan el footer estándar de club.
    const isEventSite = hasCustomTheme((club as any)?.type);

    // Footer configurable por sitio (solo Evento/Convención): logos + columnas de menú.
    // Cualquier campo no definido cae al valor por defecto, para no romper sitios sin configurar.
    const fc = isEventSite ? ((club as any)?.footerConfig || {}) : {};
    const localDefaults = getLocalDefaults();
    const activeConfig = isEventSite
        ? {
            logoTop: fc.logoTop || localDefaults.logoTop,
            logoBottom: fc.logoBottom || localDefaults.logoBottom,
            menu1Title: fc.menu1Title || localDefaults.menu1Title,
            menu1Items: (fc.menu1Items && fc.menu1Items.length) ? fc.menu1Items : localDefaults.menu1Items,
            menu2Title: fc.menu2Title || localDefaults.menu2Title,
            menu2Items: (fc.menu2Items && fc.menu2Items.length) ? fc.menu2Items : localDefaults.menu2Items,
        }
        : (config || localDefaults);
    // Un sitio Evento/Convención tiene su propio color configurable y conserva
    // el suyo; el resto usa el del sitio, que sale de `siteChrome.ts` para que
    // la vista previa del panel no se separe del pie de verdad.
    const footerBg = isEventSite ? ((club as any)?.colors?.footerBg || '#013E7D') : SITE_FOOTER_BG;
    const copyrightBg = isEventSite ? ((club as any)?.colors?.copyrightBg || '#013871') : null;
    const copyrightText = isEventSite ? ((club as any)?.colors?.copyrightText || '#FFFFFF') : null;
    // Clases de los enlaces del copyright: en Evento/Convención heredan el color elegido; el resto, como siempre.
    const cpLinkClass = isEventSite ? 'underline underline-offset-2 hover:opacity-70 transition-opacity' : 'hover:text-white transition-colors';

    return (
        <footer className="relative text-white w-full border-t border-white/5" style={{ backgroundColor: footerBg, background: footerBg }}>
            <div className="relative">
                {/* Textura del footer principal (overlay 0.85) — solo Evento/Convención. La barra de copyright NO lleva textura. */}
                {isEventSite && <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "url('/geo-darkblue.png')", backgroundPosition: '50% 0', backgroundRepeat: 'repeat', backgroundSize: '71px 85px', mixBlendMode: 'overlay', opacity: 0.85 }} />}
            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-[60px]">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
                    {/* Logo & End Polio */}
                    <div className="space-y-8">
                        <div className="flex items-center">
                            <img
                                src={activeConfig.logoTop}
                                alt="Rotary"
                                className="h-[66px] w-auto object-contain"
                                onError={(e) => { (e.target as HTMLImageElement).src = "https://app.clubplatform.org/rotary-logo-white.png"; }}
                            />
                        </div>
                        <div>
                            <img 
                                src={activeConfig.logoBottom} 
                                alt={type === 'district' ? "Rotary Youth Exchange" : "End Polio Now"} 
                                className="h-16 w-auto object-contain"
                                style={{ filter: 'brightness(1.1)' }}
                                onError={(e) => { (e.target as HTMLImageElement).src = "https://app.clubplatform.org/logo-end-polio.svg"; }}
                            />
                        </div>
                        {/* Redes Sociales */}
                        <div className="pt-4">
                             <div className="flex items-center gap-4">
                                {club.settings?.twitter_url && (
                                    <a href={club.settings.twitter_url} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all border border-white/5">
                                        <Twitter className="w-5 h-5 fill-white" />
                                    </a>
                                )}
                                {club.settings?.facebook_url && (
                                    <a href={club.settings.facebook_url} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all border border-white/5">
                                        <Facebook className="w-5 h-5 fill-white" />
                                    </a>
                                )}
                                {club.settings?.instagram_url && (
                                    <a href={club.settings.instagram_url} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all border border-white/5">
                                        <Instagram className="w-5 h-5 text-white" />
                                    </a>
                                )}
                                {club.settings?.youtube_url && (
                                    <a href={club.settings.youtube_url} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all border border-white/5">
                                        <Youtube className="w-5 h-5 text-white fill-white" />
                                    </a>
                                )}
                                {club.settings?.linkedin_url && (
                                    <a href={club.settings.linkedin_url} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all border border-white/5">
                                        <Linkedin className="w-5 h-5 text-white fill-white" />
                                    </a>
                                )}
                                {club.settings?.tiktok_url && (
                                    <a href={club.settings.tiktok_url} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all border border-white/5">
                                        <Music className="w-5 h-5 text-white" />
                                    </a>
                                )}
                             </div>
                        </div>
                    </div>

                    {/* Links de Interés */}
                    <div className="md:pl-6">
                        <h3 className="font-medium text-lg mb-6 tracking-tight">
                             {activeConfig.menu1Title}
                        </h3>
                        <ul className="space-y-3 text-[14px] font-medium text-white/80">
                            {activeConfig.menu1Items?.map((link: any, idx: number) => (
                                <li key={idx}>
                                    <a 
                                        href={link.href} 
                                        target={link.external ? "_blank" : undefined}
                                        rel={link.external ? "noopener noreferrer" : undefined}
                                        className="hover:text-yellow-400 transition-colors flex items-center gap-1 group"
                                    >
                                        <span className="opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all duration-300">→</span>
                                        {link.label}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Realiza una Acción / Columna 3 */}
                    <div>
                        <h3 className="font-medium text-lg mb-6 tracking-tight">
                             {activeConfig.menu2Title}
                        </h3>
                        <ul className="space-y-3 text-[14px] font-medium text-white/80">
                             {activeConfig.menu2Items?.map((link: any, idx: number) => (
                                <li key={idx} className="flex items-center gap-3">
                                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(250,165,26,0.4)] flex-shrink-0" />
                                    <a 
                                        href={link.href} 
                                        target={link.external ? "_blank" : undefined}
                                        className="hover:text-yellow-400 transition-colors"
                                    >
                                        {link.label}
                                    </a>
                                </li>
                             ))}
                        </ul>
                    </div>

                    {/* Newsletter / Columna 4 */}
                    <div>
                        <h3 className="font-medium text-lg mb-6 tracking-tight">Newsletter</h3>
                        <p className="text-white/50 text-xs mb-4 leading-relaxed">Suscríbete para recibir noticias y actualizaciones de nuestra comunidad.</p>
                        <div className="flex gap-2">
                            <Input
                                type="email"
                                placeholder="Tu correo aquí"
                                className="bg-white/10 border-transparent text-white placeholder:text-white/50 flex-1 h-12"
                            />
                            <Button className="bg-[#FAA51A] hover:bg-[#ffb732] text-[#0C3C7C] font-black h-12 px-5 text-xl">
                                →
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
            </div>

            {/*
                Bottom Bar

                Lleva el MISMO azul que la barra superior del sitio, tomado del
                token del tema (`rotary-topbar`): son las dos bandas que cierran
                la página por arriba y por abajo. Hasta v4.745 era `bg-black/10`
                —un velo sobre el fondo del pie—, así que su color dependía del
                fondo que tuviera cada sitio y no coincidía con nada.

                Un sitio Evento/Convención conserva SU color configurado
                (`copyrightBg`): ahí el operador ya eligió a propósito y pisarlo
                sería desobedecerlo.
            */}
            <div className={`relative overflow-hidden border-t border-white/5 ${isEventSite ? '' : 'bg-rotary-topbar'}`} style={isEventSite ? { backgroundColor: copyrightBg as string } : undefined}>
                <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className={`text-[11px] leading-loose no-uppercase text-center md:text-left ${isEventSite ? '' : 'text-white/50'}`} style={isEventSite ? { color: copyrightText as string } : undefined}>
                            © {new Date().getFullYear()} {club.name}. Todos los derechos reservados. <br className="md:hidden" />
                            {/*
                                El nombre de la plataforma es una MARCA, no una
                                frase: `data-no-translate` lo deja literal en los
                                ocho idiomas. Sin esa marca, el traductor de DOM
                                lo pasaba a «Plataforma de Club para Rotary», que
                                es un nombre que no existe. Es la distinción de
                                v4.662 entre LENGUAJE —se traduce— e IDENTIDAD
                                —no se toca—. «Powered by» sí es lenguaje y se
                                sigue traduciendo.
                            */}
                            Powered by <a href="https://app.clubplatform.org/" target="_blank" rel="noopener noreferrer" data-no-translate className={isEventSite ? cpLinkClass : 'text-white/80 hover:text-white transition-colors'}>Club Platform for Rotary</a>
                            {' | '}
                            <a href="https://my.rotary.org/privacy-policy" target="_blank" rel="noopener noreferrer" className={cpLinkClass}>Privacidad</a>
                            {' · '}
                            <a href="https://my.rotary.org/terms-of-use" target="_blank" rel="noopener noreferrer" className={cpLinkClass}>Términos del Servicio</a>
                        </div>
                        <div className="flex items-center gap-6">
                                {club.settings?.twitter_url && <Twitter className="w-4 h-4 text-white/30 hover:text-white cursor-pointer transition-colors" />}
                                {club.settings?.facebook_url && <Facebook className="w-4 h-4 text-white/30 hover:text-white cursor-pointer transition-colors" />}
                                {club.settings?.instagram_url && <Instagram className="w-4 h-4 text-white/30 hover:text-white cursor-pointer transition-colors" />}
                                {club.settings?.youtube_url && <Youtube className="w-4 h-4 text-white/30 hover:text-white cursor-pointer transition-colors" />}
                                {club.settings?.linkedin_url && <Linkedin className="w-4 h-4 text-white/30 hover:text-white cursor-pointer transition-colors" />}
                                {club.settings?.tiktok_url && <Music className="w-4 h-4 text-white/30 hover:text-white cursor-pointer transition-colors" />}
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
