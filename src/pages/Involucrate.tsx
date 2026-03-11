import { Star, Users, Heart, Globe, ArrowRight, CheckCircle2 } from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useClub } from '../contexts/ClubContext';
import { Link } from 'react-router-dom';

const Involucrate = () => {
    const { club } = useClub();

    const formasInvolucrar = [
        {
            icon: Users,
            title: 'Hazte socio',
            desc: 'Únete a nuestro club y sé parte de una red global de personas comprometidas con el cambio.',
            color: 'bg-blue-600',
            lightBg: 'bg-blue-50',
            lightText: 'text-blue-600',
        },
        {
            icon: Heart,
            title: 'Voluntariado',
            desc: 'Participa en nuestros proyectos de servicio y contribuye directamente a las comunidades.',
            color: 'bg-rose-500',
            lightBg: 'bg-rose-50',
            lightText: 'text-rose-500',
        },
        {
            icon: Globe,
            title: 'Dona',
            desc: 'Tu donación ayuda a financiar proyectos que cambian vidas en tu comunidad y en el mundo.',
            color: 'bg-emerald-500',
            lightBg: 'bg-emerald-50',
            lightText: 'text-emerald-500',
        },
    ];

    const beneficios = [
        'Conecta con líderes y profesionales de tu comunidad',
        'Desarrolla habilidades de liderazgo y oratoria',
        'Participa en proyectos de impacto social local y global',
        'Accede a becas y programas de intercambio internacional',
        'Forma parte de una red de más de 46.000 clubes en el mundo',
        'Genera un cambio positivo y duradero en tu comunidad',
    ];

    return (
        <div className="min-h-screen bg-white">
            <Navbar />

            {/* Hero Section — same style as QuienesSomos */}
            <section className="relative w-full h-[300px] md:h-[400px] overflow-hidden">
                <div className="absolute inset-0">
                    <img
                        src="https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=1600&h=500&fit=crop"
                        alt="Involúcrate con Rotary"
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/30" />
                </div>
                <div className="relative h-full flex items-center justify-center">
                    <h1 className="text-4xl md:text-5xl font-bold text-white">
                        Involúcrate
                    </h1>
                </div>
            </section>

            {/* Intro Section — Blue patterned bg */}
            <section
                className="py-12 md:py-16"
                style={{
                    backgroundColor: '#0c3c7c',
                    backgroundImage: "url('/geo-darkblue.png')",
                    backgroundPosition: '50% 0',
                    backgroundRepeat: 'repeat',
                    backgroundSize: '71px 85px'
                }}
            >
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
                    <p className="text-white leading-relaxed font-light" style={{ fontSize: '30px' }}>
                        Únete a los más de 1,2 millones de vecinos, amigos, líderes y solucionadores de problemas de Rotary los cuales ven un planeta en que las personas se unen y toman acción para generar un cambio perdurable en el mundo, sus comunidades y en sí mismos.
                    </p>
                    <p className="text-white/85 text-base md:text-lg leading-relaxed">
                        Con su energía y compromiso, los socios de Rotary, que suman más de 1,2 millones en más de 46.000 clubes, son el motor que impulsa a nuestra organización a crear un cambio positivo. Juntos transformamos vidas en nuestras comunidades y el mundo entero. La afiliación a los clubes rotarios o Rotaract es solo por invitación.
                    </p>
                </div>
            </section>

            {/* Ways to get involved */}
            <section className="py-16 md:py-24 bg-gray-50">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                            ¿Cómo puedes involucrarte?
                        </h2>
                        <p className="text-gray-600 max-w-2xl mx-auto">
                            Hay muchas formas de ser parte del cambio con {club?.name || 'Rotary'}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {formasInvolucrar.map((forma, i) => (
                            <div key={i} className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-xl transition-all duration-300 group border border-gray-100">
                                <div className={`w-16 h-16 ${forma.color} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-lg`}>
                                    <forma.icon className="w-8 h-8 text-white" />
                                </div>
                                <h3 className="text-xl font-bold text-gray-900 mb-3">{forma.title}</h3>
                                <p className="text-gray-600 leading-relaxed mb-6">{forma.desc}</p>
                                <Link
                                    to="/contacto"
                                    className={`inline-flex items-center gap-2 ${forma.lightText} font-bold text-sm hover:gap-3 transition-all`}
                                >
                                    Más información <ArrowRight className="w-4 h-4" />
                                </Link>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Benefits Section */}
            <section className="py-16 md:py-24 bg-white">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                        <div>
                            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
                                Beneficios de ser parte de {club?.name || 'Rotary'}
                            </h2>
                            <p className="text-gray-600 mb-8 leading-relaxed">
                                Como socio de Rotary, no solo contribuyes al bienestar de tu comunidad, sino que también creces personal y profesionalmente.
                            </p>
                            <ul className="space-y-4">
                                {beneficios.map((b, i) => (
                                    <li key={i} className="flex items-start gap-3">
                                        <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                                        <span className="text-gray-700">{b}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="relative">
                            <img
                                src="https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?w=600&h=600&fit=crop"
                                alt="Comunidad Rotary"
                                className="w-full rounded-2xl shadow-xl"
                            />
                            <div className="absolute -bottom-4 -right-4 bg-rotary-blue text-white p-6 rounded-2xl shadow-lg hidden md:block">
                                <p className="text-2xl font-black">46.000+</p>
                                <p className="text-sm text-white/80">Clubes en el mundo</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
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
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
                        ¿Listo para tomar acción?
                    </h2>
                    <p className="text-white/80 text-lg mb-8 max-w-2xl mx-auto">
                        Contáctanos y descubre cómo puedes ser parte de la familia de {club?.name || 'Rotary'}.
                    </p>
                    <Link
                        to="/contacto"
                        className="inline-flex items-center gap-2 bg-sky-100 hover:bg-sky-200 text-rotary-blue font-bold px-8 py-3.5 rounded-full transition-all duration-300 shadow-lg"
                    >
                        <Star className="w-5 h-5 text-rotary-gold fill-rotary-gold" />
                        Contáctanos
                    </Link>
                </div>
            </section>

            <Footer />
        </div>
    );
};

export default Involucrate;
