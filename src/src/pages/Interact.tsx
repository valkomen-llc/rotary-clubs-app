import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useCMSContent } from '../hooks/useCMSContent';
import { useClub } from '../contexts/ClubContext';
import { Users, Globe, Zap, Sparkles } from 'lucide-react';

const Interact = () => {
    const { club } = useClub();
    const { sections } = useCMSContent('interact', club.id);

    const getC = (section: string, field: string, fallback: string) => {
        return sections[section]?.[field] || fallback;
    }

    return (
        <div className="min-h-screen bg-white">
            <Navbar />

            {/* Hero Section — Premium Glassmorphism & High-Impact Typography */}
            <section className="relative w-full h-[60vh] min-h-[500px] flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0">
                    <img
                        src={getC('hero', 'image', "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1600&h=600&fit=crop")}
                        alt="Interact banner"
                        className="w-full h-full object-cover scale-105 animate-subtle-zoom"
                        loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/60" />
                </div>

                <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
                    <div className="inline-flex items-center gap-2 bg-interact/20 backdrop-blur-md border border-interact/30 px-4 py-1.5 rounded-full text-white text-xs font-bold tracking-[0.2em] uppercase mb-6 animate-fade-in-down">
                        <Sparkles className="w-4 h-4 text-interact" /> Liderazgo y Servicio Joven
                    </div>
                    <h1 className="text-center mb-6 drop-shadow-2xl animate-fade-in leading-tight">
                        {club.settings?.interact_logo ? (
                            <div className="flex justify-center items-center mb-6">
                                <img src={club.settings.interact_logo} alt="Interact Logo" className="h-[100px] md:h-[160px] w-auto object-contain" />
                            </div>
                        ) : (
                            <span className="block text-5xl md:text-7xl font-extrabold text-white mb-2">
                                Interact
                            </span>
                        )}
                        <span className="block text-4xl md:text-6xl font-extrabold text-interact">
                            {club.name.replace(/Rotary Club de |Rotary Club |Rotary /gi, '')}
                        </span>
                    </h1>
                    <p className="text-xl md:text-2xl text-white/90 max-w-2xl mx-auto font-light leading-relaxed animate-fade-in-up">
                        {getC('hero', 'subtitle', "Conectando a jóvenes entusiastas con el poder del servicio.")}
                    </p>
                </div>
            </section>

            {/* Main Content & Stats Wrapper */}
            <section className="bg-rotary-concrete relative flex flex-col">
                {/* Intro Stats Bar */}
                <div className="relative z-20 -mt-20 max-w-5xl mx-auto px-4 w-full">
                    <div 
                        className="grid grid-cols-1 md:grid-cols-3 gap-0 rounded-3xl overflow-hidden shadow-2xl border border-white/10"
                        style={{ backgroundColor: '#005DAA' }}
                    >
                        <div className="p-8 text-center border-b md:border-b-0 md:border-r border-white/10">
                            <Users className="w-8 h-8 text-white mx-auto mb-3" />
                            <h3 className="text-3xl font-bold text-white tracking-tight">12-18</h3>
                            <p className="text-xs font-bold text-white/70 uppercase tracking-widest">Años de Edad</p>
                        </div>
                        <div className="p-8 text-center border-b md:border-b-0 md:border-r border-white/10">
                            <Globe className="w-8 h-8 text-white mx-auto mb-3" />
                            <h3 className="text-3xl font-bold text-white tracking-tight">Global</h3>
                            <p className="text-xs font-bold text-white/70 uppercase tracking-widest">Comprensión Internacional</p>
                        </div>
                        <div className="p-8 text-center">
                            <Zap className="w-8 h-8 text-white mx-auto mb-3" />
                            <h3 className="text-3xl font-bold text-white tracking-tight">Acción</h3>
                            <p className="text-xs font-bold text-white/70 uppercase tracking-widest">2 Proyectos al Año</p>
                        </div>
                    </div>
                </div>

                <div className="py-16 md:py-24 max-w-5xl mx-auto px-6">
                    {/* Intro Hero Text */}
                    <div className="text-center mb-10">
                        <h2 className="text-[40px] font-normal text-rotary-navy leading-tight max-w-4xl mx-auto text-left md:text-center">
                            Toma acción, promueve la comprensión internacional y gana nuevos amigos en todo el mundo.
                        </h2>
                    </div>

                    {/* Description Paragraph */}
                    <div className="text-xl text-gray-700 font-light leading-relaxed mb-16 max-w-4xl mx-auto text-left">
                        <p>
                            Los clubes Interact ofrecen a jóvenes de 12 a 18 años la oportunidad de adquirir habilidades de 
                            liderazgo y descubrir la fuerza de Dar de Sí antes de Pensar en Sí. Entérate cómo puedes ser un 
                            líder y divertirte a la vez.
                        </p>
                    </div>

                    {/* Video Player */}
                    <div className="relative rounded-3xl overflow-hidden shadow-2xl mb-16 group bg-black max-w-4xl mx-auto">
                        <video 
                            controls
                            className="w-full aspect-video object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-500"
                            poster="https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1200&h=675&fit=crop"
                        >
                            <source src="https://cdn1-originals.webdamdb.com/13799_163692035?cache=1753396207&response-content-disposition=inline;filename=2025_092_Interact_Promo_ES_Subs.mp4&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cCo6Ly9jZG4xLW9yaWdpbmFscy53ZWJkYW1kYi5jb20vMTM3OTlfMTYzNjkyMDM1P2NhY2hlPTE3NTMzOTYyMDcmcmVzcG9uc2UtY29udGVudC1kaXNwb3NpdGlvbj1pbmxpbmU7ZmlsZW5hbWU9MjAyNV8wOTJfSW50ZXJhY3RfUHJvbW9fRVNfU3Vicy5tcDQiLCJDb25kaXRpb24iOnsiRGF0ZUxlc3NUaGFuIjp7IkFXUzpFcG9jaFRpbWUiOjIxNDc0MTQ0MDB9fX1dfQ__&Signature=m5S7TTDhzmSZKnwoJogLXdovn0My2CinJesVkqiHSDKeQfY4xFEX8hNmjwcduZdtwKseK~Cmv0bv9wyvkclsUxbPnJAUy6t0ywM-k9X43bNzoNoTlgZOB5WWv4e~qBoe2VvZXOK1L-C1RPlH3Rufi9uQJoyOswvNf77tqmTlUXKbETZyEtmnb-AeSsKnrqecGvx8F0f4U~GW4s~cXk04~9VepR2NG07crz1sSBZ7GAJ9VbzYdTbXegmhjsIYjFTrFpamct-H0uECvHZrzSurgQuxEPFG5~ZKFKWE9Owt5aDDxxVcLgO7mUJYo2Qmtzp3fhryfbN3IHZmsQ3wGLrxjQ__&Key-Pair-Id=APKAI2ASI2IOLRFF2RHA" type="video/mp4" />
                            Tu navegador no soporta la etiqueta de video.
                        </video>
                    </div>

                    {/* Features Sections */}
                    <div className="max-w-4xl mx-auto space-y-12 text-left mb-16">
                        
                        <div>
                            <h3 className="text-[25px] font-bold text-gray-900 mb-4">¿Cuáles son las ventajas?</h3>
                            <p className="text-lg text-gray-700 font-light mb-4">Conéctate con líderes de tu comunidad y el mundo entero para:</p>
                            <ul className="list-disc pl-6 space-y-3 text-lg text-gray-700 font-light">
                                <li>Tomar acción y marcar la diferencia en tu escuela o comunidad</li>
                                <li>Descubrir nuevas culturas y promover la comprensión internacional</li>
                                <li>Ser un líder en tu escuela y comunidad</li>
                                <li>Divertirte y ganar amigos alrededor del mundo</li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="text-[25px] font-bold text-gray-900 mb-4">¿Qué actividades ofrecen los clubes?</h3>
                            <p className="text-lg text-gray-700 font-light mb-4">
                                Los clubes Interact llevan a cabo por lo menos dos proyectos al año: uno para beneficiar la 
                                escuela o comunidad y otro para fomentar la comprensión internacional. Los interactianos 
                                realizan sus actividades y desarrollan habilidades de liderazgo con la mentoría y orientación de 
                                los socios del club rotario patrocinador.
                            </p>
                            <p className="text-lg text-gray-700 font-light mb-4">Celebra la diferencia que Interact marca en el mundo, participando en:</p>
                            <ul className="list-disc pl-6 space-y-3 text-lg text-gray-700 font-light">
                                <li>la Semana Mundial de Interact</li>
                                <li>el Concurso de video de Interact</li>
                                <li>el Día de Rotary en las Naciones Unidas</li>
                                <li>el Día Mundial del Voluntariado Juvenil</li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="text-[25px] font-bold text-gray-900 mb-4">¿Qué hago para ingresar a un club?</h3>
                            <p className="text-lg text-gray-700 font-light mb-4">
                                Averigua primero si hay un club en tu escuela o <a href="#/contacto" className="text-interact font-bold hover:underline">contacta con el club rotario de tu localidad</a> para ver si hay uno en la comunidad. Luego comunícate con el club Interact para participar en su próxima reunión, proyecto de servicio o evento social.
                            </p>
                            <p className="text-lg text-gray-700 font-light">
                                Sigue a Interact en <a href="https://www.facebook.com/interactofficial/" target="_blank" rel="noopener noreferrer" className="text-interact font-bold hover:underline">Facebook</a> y descubre cómo los interactianos se divierten y sirven a la vez.
                            </p>
                        </div>

                    </div>

                    {/* Infographic Stats Layout */}
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-24 mb-16">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            
                            {/* Card 1 - Clubes */}
                            <div className="bg-white rounded-lg shadow-md p-8 text-center hover:shadow-lg transition-shadow">
                                <div className="flex justify-center mb-4">
                                    <Users className="w-10 h-10 text-[#9D2235]" />
                                </div>
                                <h3 className="text-4xl font-bold text-[#9D2235] mb-4">
                                    14,911
                                </h3>
                                <p className="text-gray-600 text-sm leading-relaxed">
                                    clubes Interact
                                </p>
                            </div>

                            {/* Card 2 - Interactianos */}
                            <div className="bg-white rounded-lg shadow-md p-8 text-center hover:shadow-lg transition-shadow">
                                <div className="flex justify-center mb-4">
                                    <Zap className="w-10 h-10 text-[#009382]" />
                                </div>
                                <h3 className="text-4xl font-bold text-[#009382] mb-4">
                                    342,953
                                </h3>
                                <p className="text-gray-600 text-sm leading-relaxed">
                                    interactianos
                                </p>
                            </div>

                            {/* Card 3 - Países */}
                            <div className="bg-white rounded-lg shadow-md p-8 text-center hover:shadow-lg transition-shadow">
                                <div className="flex justify-center mb-4">
                                    <Globe className="w-10 h-10 text-[#0C3C7C]" />
                                </div>
                                <h3 className="text-4xl font-bold text-[#0C3C7C] mb-4">
                                    145
                                </h3>
                                <p className="text-gray-600 text-sm leading-relaxed">
                                    países con clubes Interact
                                </p>
                            </div>

                        </div>
                    </div>
                </div>
            </section>

            {/* Premium CTA Section */}
            <section
                className="py-16 md:py-20"
                style={{
                    backgroundColor: '#0c3c7c',
                    backgroundImage: "url('/geo-darkblue.png')",
                    backgroundPosition: '50% 0',
                    backgroundRepeat: 'repeat',
                    backgroundSize: '71px 85px'
                }}
            >
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
                    <h2 className="text-[36px] font-light text-white mb-6">
                        ¿Qué hago para ingresar a un club?
                    </h2>
                    <a
                        href="#/contacto?asunto=Quiero+ser+socio"
                        className="inline-flex items-center gap-2 bg-sky-100 hover:bg-sky-200 text-rotary-blue font-medium px-8 py-3.5 rounded-full transition-all duration-300 shadow-lg"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="#F5A623" />
                        </svg>
                        EMPIEZA
                    </a>
                </div>
            </section>

            <Footer />

            <style>{`
                @keyframes subtle-zoom {
                    from { transform: scale(1.05); }
                    to { transform: scale(1.15); }
                }
                .animate-subtle-zoom {
                    animation: subtle-zoom 20s ease-out alternate infinite;
                }
                @keyframes fade-in-down {
                    from { opacity: 0; transform: translateY(-20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in-down {
                    animation: fade-in-down 0.8s ease-out forwards;
                }
                @keyframes fade-in-up {
                    from { opacity: 0; transform: translateY(30px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in-up {
                    animation: fade-in-up 0.8s ease-out 0.4s forwards;
                    opacity: 0;
                }
                @keyframes fade-in {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .animate-fade-in {
                    animation: fade-in 1.2s ease-out 0.2s forwards;
                    opacity: 0;
                }

            `}</style>
        </div>
    );
};

export default Interact;
