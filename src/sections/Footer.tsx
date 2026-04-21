import React, { useState, useEffect } from 'react';
import { Facebook, Twitter, Instagram, Youtube, Twitter as TwitterIcon, ArrowRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useClub } from '../contexts/ClubContext';

const Footer = () => {
    const { club } = useClub();
    const type = (club as any)?.type || 'club';
    
    const [config, setConfig] = useState<any>(null);

    useEffect(() => {
        // Fetch global skin config for this type
        fetch(`${import.meta.env.VITE_API_URL || '/api'}/public/footer-skin?type=${type}`)
            .then(res => res.json())
            .then(data => {
                if (data && !data.error) setConfig(data);
            })
            .catch(() => { /* fallback to defaults */ });
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

    const activeConfig = config || getLocalDefaults();

    return (
        <footer className="text-white w-full border-t border-white/5" style={{ backgroundColor: '#0C3C7C', background: '#0C3C7C' }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
                    {/* Logo & End Polio */}
                    <div className="space-y-8">
                        <div className="flex items-center">
                            <img
                                src={activeConfig.logoTop}
                                alt="Rotary"
                                className="h-14 w-auto object-contain"
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
                                        <TwitterIcon className="w-5 h-5 fill-white" />
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
                             </div>
                        </div>
                    </div>

                    {/* Links de Interés */}
                    <div className="md:pl-6">
                        <h3 className="font-black text-lg mb-6 tracking-tight flex items-center gap-2">
                             <div className="w-1 h-5 bg-yellow-500 rounded-full" />
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
                        <h3 className="font-black text-lg mb-6 tracking-tight flex items-center gap-2">
                             <div className="w-1 h-5 bg-yellow-500 rounded-full" />
                             {activeConfig.menu2Title}
                        </h3>
                        <ul className="space-y-4 text-[14px] font-medium text-white/80">
                             {activeConfig.menu2Items?.map((link: any, idx: number) => (
                                <li key={idx} className="flex items-center gap-2">
                                    <span className="text-yellow-500 text-lg select-none">•</span>
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
                        <h3 className="font-black text-lg mb-6 tracking-tight">Newsletter</h3>
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

            {/* Bottom Bar */}
            <div className="border-t border-white/5 bg-black/10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="text-white/50 text-[11px] leading-loose no-uppercase text-center md:text-left">
                            © {new Date().getFullYear()} {club.name}. Todos los derechos reservados. <br className="md:hidden" />
                            Plataforma oficial impulsada por{' '}
                            <a href="https://valkomen.com" target="_blank" rel="noopener noreferrer" className="text-white/80 font-bold hover:text-white transition-colors">Valkomen Labs</a>
                            {' | '}
                            <a href="https://my.rotary.org/privacy-policy" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Privacidad</a>
                            {' · '}
                            <a href="https://my.rotary.org/terms-of-use" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Términos del Servicio</a>
                        </div>
                        <div className="flex items-center gap-6">
                                {club.settings?.twitter_url && <TwitterIcon className="w-4 h-4 text-white/30 hover:text-white cursor-pointer transition-colors" />}
                                {club.settings?.facebook_url && <Facebook className="w-4 h-4 text-white/30 hover:text-white cursor-pointer transition-colors" />}
                                {club.settings?.instagram_url && <Instagram className="w-4 h-4 text-white/30 hover:text-white cursor-pointer transition-colors" />}
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
