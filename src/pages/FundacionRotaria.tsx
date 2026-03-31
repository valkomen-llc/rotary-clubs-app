import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useCMSContent } from '../hooks/useCMSContent';
import { useClub } from '../contexts/ClubContext';
import { Shrub, Landmark, ShieldCheck, HeartHandshake, ArrowRight, Award, Globe, Users, DollarSign, Lightbulb } from 'lucide-react';

const FundacionRotaria = () => {
    const { club } = useClub();
    const { sections } = useCMSContent('fundacion-rotaria', club.id);

    // Helper para mantener coherencia con el CMS local
    const getC = (section: string, field: string, fallback: string) => {
        return sections[section]?.[field] || fallback;
    }

    // Al llegar, hacer scroll al inicio
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            <Navbar />

            {/* ════════════ HERO SECTION ════════════ */}
            <section className="relative w-full h-[75vh] min-h-[600px] flex items-center overflow-hidden bg-rotary-blue mt-[104px]">
                {/* Background Overlay */}
                <div className="absolute inset-0 z-0">
                    <img
                        src={getC('hero', 'image', "https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?w=1600&h=800&fit=crop")}
                        alt="La Fundación Rotaria"
                        className="w-full h-full object-cover scale-105"
                        loading="eager"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-[#0C3C7C] via-[#0C3C7C]/80 to-transparent" />
                </div>

                <div className="relative z-10 max-w-7xl mx-auto px-6 w-full">
                    <div className="max-w-3xl">
                        <div className="inline-flex items-center gap-3 bg-rotary-gold text-rotary-blue px-5 py-2 rounded-full text-xs font-black uppercase tracking-[0.1em] mb-6 shadow-lg">
                            <Award className="w-4 h-4" /> Entidad Humanitaria Premium
                        </div>
                        <h1 className="text-5xl md:text-7xl font-black text-white mb-6 leading-tight tracking-tight">
                            La Fundación <br className="hidden md:block"/> Rotaria
                        </h1>
                        <p className="text-xl md:text-2xl text-white/90 font-light leading-relaxed mb-10 max-w-2xl">
                            {getC('intro', 'text', "Transformamos tus contribuciones en proyectos de servicio que cambian vidas de forma sostenible y medible en todo el mundo.")}
                        </p>
                        
                        <div className="flex flex-col sm:flex-row gap-4">
                            <Link 
                                to="/aportes"
                                className="group inline-flex items-center justify-center gap-3 bg-rotary-gold text-rotary-blue font-black px-8 py-4 rounded-xl hover:bg-yellow-400 transition-all shadow-lg text-lg uppercase tracking-wide"
                            >
                                Haz una donación
                                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                            </Link>
                            <Link
                                to="/contacto"
                                className="inline-flex items-center justify-center gap-3 bg-black/30 backdrop-blur-md border border-white/20 text-white font-bold px-8 py-4 rounded-xl hover:bg-white/20 transition-all text-lg"
                            >
                                Contactar Comité
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* ════════════ ESTADÍSTICAS UNIFICADAS ════════════ */}
            <section className="relative z-20 -mt-16 mb-24 max-w-7xl mx-auto px-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Stat 1 */}
                    <div className="bg-white rounded-lg shadow-md p-8 text-center hover:shadow-lg transition-shadow border-t-4 border-rotary-gold group cursor-default">
                        <div className="flex justify-center mb-4">
                            <DollarSign className="w-10 h-10 text-rotary-blue group-hover:scale-110 transition-transform duration-300" />
                        </div>
                        <h3 className="text-4xl font-black text-rotary-blue mb-2">$4,000M+</h3>
                        <p className="text-gray-600 text-[13px] leading-relaxed font-bold uppercase tracking-wider">
                            Invertidos
                        </p>
                    </div>

                    {/* Stat 2 */}
                    <div className="bg-white rounded-lg shadow-md p-8 text-center hover:shadow-lg transition-shadow border-t-4 border-rotary-blue group cursor-default">
                        <div className="flex justify-center mb-4">
                            <Landmark className="w-10 h-10 text-rotary-blue group-hover:scale-110 transition-transform duration-300" />
                        </div>
                        <h3 className="text-4xl font-black text-rotary-blue mb-2">100+</h3>
                        <p className="text-gray-600 text-[13px] leading-relaxed font-bold uppercase tracking-wider">
                            Años de Historia
                        </p>
                    </div>

                    {/* Stat 3 */}
                    <div className="bg-white rounded-lg shadow-md p-8 text-center hover:shadow-lg transition-shadow border-t-4 border-rotary-gold group cursor-default">
                        <div className="flex justify-center mb-4">
                            <Award className="w-10 h-10 text-rotary-blue group-hover:scale-110 transition-transform duration-300" />
                        </div>
                        <h3 className="text-4xl font-black text-rotary-blue mb-2">4 Estrellas</h3>
                        <p className="text-gray-600 text-[13px] leading-relaxed font-bold uppercase tracking-wider">
                            Charity Navigator
                        </p>
                    </div>

                    {/* Stat 4 */}
                    <div className="bg-white rounded-lg shadow-md p-8 text-center hover:shadow-lg transition-shadow border-t-4 border-rotary-blue group cursor-default">
                        <div className="flex justify-center mb-4">
                            <HeartHandshake className="w-10 h-10 text-rotary-blue group-hover:scale-110 transition-transform duration-300" />
                        </div>
                        <h3 className="text-4xl font-black text-rotary-blue mb-2">1.4M</h3>
                        <p className="text-gray-600 text-[13px] leading-relaxed font-bold uppercase tracking-wider">
                            Socios Activos
                        </p>
                    </div>
                </div>
            </section>

            {/* ════════════ MENSAJE CENTRAL (HACER EL BIEN) ════════════ */}
            <section className="py-16 md:py-24 bg-white">
                <div className="max-w-5xl mx-auto px-6 text-center">
                    <h2 className="text-rotary-blue text-sm font-black uppercase tracking-[0.3em] mb-4">
                        Nuestra Misión Global
                    </h2>
                    <h3 className="text-4xl md:text-5xl lg:text-6xl font-black text-gray-900 mb-8 leading-tight tracking-tight">
                        {getC('section1', 'title', "Hacer el bien en el mundo")}
                    </h3>
                    <div className="w-24 h-1.5 bg-rotary-gold mx-auto mb-10 rounded-full" />
                    <p className="text-xl md:text-2xl text-gray-600 leading-relaxed font-light mx-auto">
                        {getC('section1', 'content', "La misión de La Fundación Rotaria es permitir que los rotarios promuevan la comprensión mundial, la buena voluntad y la paz a través del mejoramiento de la salud, el apoyo a la educación y la mitigación de la pobreza.")}
                    </p>
                </div>
            </section>

            {/* ════════════ PILARES (SOSTENIBILIDAD Y TRANSPARENCIA) ════════════ */}
            <section className="py-20 bg-gray-50 border-y border-gray-200">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-4">¿Por qué confiar en nosotros?</h2>
                        <p className="text-lg text-gray-600 max-w-2xl mx-auto">Nuestra estructura está diseñada para maximizar el impacto de cada centavo invertido.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {/* Pilar 1 */}
                        <div className="bg-white p-10 rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl transition-shadow duration-300">
                            <div className="w-14 h-14 bg-[#0C3C7C]/10 rounded-xl flex items-center justify-center mb-6">
                                <Shrub className="w-7 h-7 text-[#0C3C7C]" />
                            </div>
                            <h4 className="text-2xl font-black text-gray-900 mb-3">Sostenibilidad</h4>
                            <p className="text-gray-600 leading-relaxed">
                                Diseñamos proyectos que continúan funcionando independientemente tras agotar los fondos originales.
                            </p>
                        </div>
                        {/* Pilar 2 */}
                        <div className="bg-white p-10 rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl transition-shadow duration-300">
                            <div className="w-14 h-14 bg-[#0C3C7C]/10 rounded-xl flex items-center justify-center mb-6">
                                <ShieldCheck className="w-7 h-7 text-[#0C3C7C]" />
                            </div>
                            <h4 className="text-2xl font-black text-gray-900 mb-3">Transparencia</h4>
                            <p className="text-gray-600 leading-relaxed">
                                Galardonados ininterrumpidamente con la máxima calificación (4 estrellas) en eficiencia financiera por Charity Navigator.
                            </p>
                        </div>
                        {/* Pilar 3 */}
                        <div className="bg-white p-10 rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl transition-shadow duration-300 lg:col-span-1 md:col-span-2">
                            <div className="w-14 h-14 bg-[#0C3C7C]/10 rounded-xl flex items-center justify-center mb-6">
                                <Lightbulb className="w-7 h-7 text-[#0C3C7C]" />
                            </div>
                            <h4 className="text-2xl font-black text-gray-900 mb-3">Ingenio Local</h4>
                            <p className="text-gray-600 leading-relaxed">
                                Aprovechamos la red mundial de rotarios para identificar y dar respuesta a las necesidades específicas de la propia comunidad.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ════════════ PROGRAMAS DE SUBVENCIONES ════════════ */}
            <section className="py-24 bg-white">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
                        <div className="max-w-2xl">
                            <h3 className="text-rotary-blue text-sm font-black uppercase tracking-[0.3em] mb-4">
                                Vías de Acción
                            </h3>
                            <h2 className="text-4xl md:text-5xl font-black text-gray-900 leading-tight">
                                Transformamos el capital <br/> en programas escalables.
                            </h2>
                        </div>
                        <Link to="/proyectos" className="text-rotary-blue font-bold hover:text-blue-800 transition-colors inline-flex items-center gap-2">
                            Ver nuestros Proyectos <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {/* Global Grants */}
                        <div className="group relative rounded-2xl overflow-hidden aspect-[4/5] bg-gray-900 shadow-xl">
                            <img
                                src="https://images.unsplash.com/photo-1593113565694-c8c3639d67fb?w=800&fit=crop"
                                alt="Subvenciones Globales"
                                className="w-full h-full object-cover opacity-60 group-hover:scale-105 group-hover:opacity-40 transition-all duration-700"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent p-8 flex flex-col justify-end">
                                <Globe className="w-8 h-8 text-rotary-gold mb-4" />
                                <h4 className="text-2xl font-black text-white mb-2">Subvenciones Globales</h4>
                                <p className="text-white/80 text-sm leading-relaxed mb-6">
                                    Financian actividades internacionales en nuestras áreas de interés que originan resultados sostenibles y de gran impacto.
                                </p>
                            </div>
                        </div>

                        {/* District Grants */}
                        <div className="group relative rounded-2xl overflow-hidden aspect-[4/5] bg-gray-900 shadow-xl">
                            <img
                                src="https://images.unsplash.com/photo-1542810634-71277d95dcbb?w=800&fit=crop"
                                alt="Subvenciones Distritales"
                                className="w-full h-full object-cover opacity-60 group-hover:scale-105 group-hover:opacity-40 transition-all duration-700"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent p-8 flex flex-col justify-end">
                                <Users className="w-8 h-8 text-rotary-gold mb-4" />
                                <h4 className="text-2xl font-black text-white mb-2">Subvenciones Distritales</h4>
                                <p className="text-white/80 text-sm leading-relaxed mb-6">
                                    Permiten a los distritos rotarios la flexibilidad para responder a las necesidades pormenorizadas de las comunidades locales.
                                </p>
                            </div>
                        </div>

                        {/* Peace Fellowships */}
                        <div className="group relative rounded-2xl overflow-hidden aspect-[4/5] bg-gray-900 shadow-xl">
                            <img
                                src="https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=800&fit=crop"
                                alt="Becas Pro-Paz"
                                className="w-full h-full object-cover opacity-60 group-hover:scale-105 group-hover:opacity-40 transition-all duration-700"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent p-8 flex flex-col justify-end">
                                <HeartHandshake className="w-8 h-8 text-rotary-gold mb-4" />
                                <h4 className="text-2xl font-black text-white mb-2">Centros de Paz</h4>
                                <p className="text-white/80 text-sm leading-relaxed mb-6">
                                    Cada año seleccionamos a líderes cívicos para obtener becas financiadas en diplomacia y resolución de conflictos.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ════════════ CTA FINAL ════════════ */}
            <section className="py-24 bg-rotary-blue relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
                <div className="relative max-w-4xl mx-auto px-6 text-center">
                    <h2 className="text-4xl md:text-5xl font-black text-white mb-6">Únete a nuestro impacto.</h2>
                    <p className="text-xl text-blue-100 mb-10 max-w-2xl mx-auto font-light">
                        Una donación a La Fundación Rotaria no solo cambia vidas, brinda una solución persistente a las carencias comunitarias.
                    </p>
                    <Link
                        to="/aportes"
                         className="inline-flex items-center justify-center gap-3 bg-rotary-gold text-rotary-blue font-black px-10 py-5 rounded-xl hover:bg-yellow-400 transition-all shadow-2xl text-lg uppercase tracking-wide"
                    >
                        Donar Ahora <ArrowRight className="w-5 h-5" />
                    </Link>
                </div>
            </section>

            <Footer />
        </div>
    );
};

export default FundacionRotaria;
