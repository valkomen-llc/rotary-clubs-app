import { Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useCMSContent } from '../hooks/useCMSContent';
import { useClub } from '../contexts/ClubContext';
import { useSEO } from '../hooks/useSEO';
import { useSiteImages } from '../hooks/useSiteImages';
import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const NuestrasCausas = () => {
    const { club } = useClub();
    const { sections } = useCMSContent('nuestras-causas', club.id);

    useSEO({
        title: 'Nuestras Causas',
        description: 'Las 7 áreas de interés de Rotary: paz, enfermedades, agua potable, salud materno-infantil, educación, economía local y medio ambiente.',
        path: '/nuestras-causas',
    });

    const getC = (section: string, field: string, fallback: string) => {
        return sections[section]?.[field] || fallback;
    }

    const defaultCausas = [
        {
            id: 'paz',
            title: 'Fomento de la paz',
            image: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=600&h=400&fit=crop",
            description: "Rotary fomenta el diálogo para promover la comprensión internacional entre los pueblos y culturas."
        },
        {
            id: 'enfermedades',
            title: 'Prevención y tratamiento de enfermedades',
            image: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=600&h=400&fit=crop",
            description: "Sensibilizamos y equipamos a las comunidades para contener la propagación de enfermedades mortales."
        },
        {
            id: 'agua',
            title: 'Suministro de agua potable',
            image: "https://images.unsplash.com/photo-1593113598332-cd288d649433?w=600&h=400&fit=crop",
            description: "Apoyamos iniciativas locales mediante las cuales más personas tienen acceso al agua salubre."
        },
        {
            id: 'materno',
            title: 'Salud materno-infantil',
            image: "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=600&h=400&fit=crop",
            description: "Al ampliar el acceso a mejores servicios de salud, madres e hijos viven sanos y fuertes."
        },
        {
            id: 'educacion',
            title: 'Promoción de la educación',
            image: "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=600&h=400&fit=crop",
            description: "Nuestra meta es alentar a las comunidades para que apoyen programas de alfabetización."
        },
        {
            id: 'economia',
            title: 'Desarrollo de las economías locales',
            image: "https://images.unsplash.com/photo-1531206715517-5c0ba140b2b8?w=600&h=400&fit=crop",
            description: "Proyectos diseñados para fomentar el desarrollo integral y económico de las comunidades."
        },
        {
            id: 'ambiente',
            title: 'Protección del medioambiente',
            image: "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=600&h=400&fit=crop",
            description: "Tomamos medidas para encontrar soluciones innovadoras y desarrollar proyectos sostenibles."
        }
    ];

    const siteImages = useSiteImages();

    const causas = sections['grid']?.items || defaultCausas.map((causa, i) => {
        const custom = siteImages.causes?.[i];
        return custom?.url ? { ...causa, image: custom.url } : causa;
    });

    const heroImg = siteImages.causesHero?.url || getC('hero', 'image', "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=1600&h=600&fit=crop");
    const polioImg = siteImages.polio?.url || getC('polio', 'image', "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=800&h=600&fit=crop");

    const [currentImage, setCurrentImage] = useState(0);

    const galleryImages = [
        siteImages.historyTimeline?.[0]?.url || siteImages?.history?.[2]?.url || 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&h=500&fit=crop',
        siteImages.historyTimeline?.[1]?.url || siteImages?.history?.[3]?.url || 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=800&h=500&fit=crop',
        siteImages.historyTimeline?.[2]?.url || siteImages?.history?.[4]?.url || 'https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?w=800&h=500&fit=crop',
        ...(siteImages.historyTimeline?.slice(3).map(img => img.url) || [])
    ];

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentImage(p => (p + 1) % galleryImages.length);
        }, 4000);
        return () => clearInterval(timer);
    }, [galleryImages.length]);

    return (
        <div className="min-h-screen bg-white">
            <Navbar />

            {/* Hero Section */}
            <section className="relative w-full h-[300px] md:h-[400px] overflow-hidden">
                <div className="absolute inset-0">
                    <img
                        src={heroImg}
                        alt="Nuestras Causas"
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/30" />
                </div>
            </section>

            {/* Title Section */}
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
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <h1 className="text-white" style={{ fontSize: '35px' }}>
                        {getC('header', 'title', "Nuestras Causas")}
                    </h1>
                </div>
            </section>

            {/* Intro + Causes Section */}
            <section className="bg-rotary-concrete" style={{ paddingTop: '48px', paddingBottom: '64px' }}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <p className="text-xl md:text-2xl text-gray-700 leading-relaxed font-light text-center max-w-4xl mx-auto" style={{ marginBottom: '48px' }}>
                        {getC('intro', 'text', "Rotary se concentra en causas para fortalecer las relaciones internacionales, mejorar vidas, y crear un mundo más propicio para fomentar nuestras iniciativas pro paz.")}
                    </p>

                    <div className="relative aspect-video rounded-2xl overflow-hidden shadow-2xl ring-1 ring-gray-200 bg-black max-w-4xl mx-auto">
                        <video
                            className="w-full h-full"
                            src="https://cdn1-originals.webdamdb.com/13799_162776313?cache=1751402723&response-content-disposition=inline;filename=2024_050_OVERVIEW_60_16x9_ES_SUB.mp4&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cCo6Ly9jZG4xLW9yaWdpbmFscy53ZWJkYW1kYi5jb20vMTM3OTlfMTYyNzc2MzEzP2NhY2hlPTE3NTE0MDI3MjMmcmVzcG9uc2UtY29udGVudC1kaXNwb3NpdGlvbj1pbmxpbmU7ZmlsZW5hbWU9MjAyNF8wNTBfT1ZFUlZJRVdfNjBfMTZ4OV9FU19TVUIubXA0IiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoyMTQ3NDE0NDAwfX19XX0_&Signature=kZIoi4xa6z1Gdubae5Hpet4iws1KJIKW0EhxiyWdfUpxUFyYb7opE2TJWp19EBdPcCBaBZ9kmW1WrGTO2k~E5qqfl1KvST8kq54TqNx~FYUE-LXBf-gncwjXL1vNemJNfzhqVXlLqI0d~Yb0oMLnAqzsueHjPWrlCirymfliDQURudYxvFc1VsEFtFqpwKgB9BKkz-RHzYykMXMzidViNnRzJzh3uzv0F6xQaeZYYLQ4SCdQ7j3~1scDm-Wsjia2mc20QLIVscUDSUExU55aJIlqHznDa6fCsrq8~ckDanCgDQgseYJnU4371FXHSkBtNnWlzQZE1tskEGHuKogqCA__&Key-Pair-Id=APKAI2ASI2IOLRFF2RHA"
                            controls
                            playsInline
                            preload="metadata"
                        />
                    </div>

                    {/* Causes Grid - 80px below video */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12" style={{ marginTop: '80px' }}>
                        {causas.map((causa: any, i: number) => (
                            <div key={i} className={`flex flex-col bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 transition-hover duration-300 hover:shadow-md ${i === 6 ? 'lg:col-start-2' : ''}`}>
                                <div className="h-48 overflow-hidden">
                                    <img src={causa.image} alt={causa.title} className="w-full h-full object-cover" />
                                </div>
                                <div className="p-6 flex-grow">
                                    <h3 className="text-xl font-bold text-gray-900 mb-3">{causa.title}</h3>
                                    <p className="text-gray-600 text-sm leading-relaxed mb-4">
                                        {causa.description}
                                    </p>
                                    <a href="#" className="text-rotary-blue hover:text-sky-700 font-bold text-sm inline-flex items-center gap-1">
                                        Más información ›
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Polio - 80px below causes grid */}
                    <div className="flex flex-col lg:flex-row rounded-3xl overflow-hidden shadow-xl ring-1 ring-gray-100" style={{ marginTop: '80px' }}>
                        <div className="lg:w-1/2 h-[300px] lg:h-auto">
                            <img src={polioImg} alt="Erradicación de la polio" className="w-full h-full object-cover" />
                        </div>
                        <div className="lg:w-1/2 bg-[#A32036] p-8 md:p-12 flex flex-col justify-center text-white">
                            <h2 className="text-3xl md:text-4xl font-bold mb-6">
                                {getC('polio', 'title', "Erradicación de la polio")}
                            </h2>
                            <p className="text-lg leading-relaxed mb-8 opacity-90">
                                {getC('polio', 'text', "Durante los últimos 35 años, Rotary ha desplegado esfuerzos para eliminar esta enfermedad de la faz de la Tierra.")}
                            </p>
                            <div>
                                <a
                                    href="https://www.endpolio.org/es"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-block border-2 border-white/30 hover:bg-white hover:text-[#A32036] px-8 py-3 rounded-full font-bold transition-all duration-300"
                                >
                                    {getC('polio', 'buttonText', "Ayúdanos a acabar con la polio")}
                                </a>
                        </div>
                    </div>
                </div>

                {/* Section Gap */}
                <div className="h-24 md:h-32" />

                {/* Galería de Momentos (History Sync) */}
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
                    <h2 className="text-3xl font-medium text-gray-800 mb-10 text-center">Momentos Históricos</h2>
                    <div className="relative aspect-[16/7] md:aspect-[16/6] rounded-[40px] overflow-hidden shadow-2xl ring-1 ring-gray-200 bg-black group max-w-5xl mx-auto">
                        <div className="absolute inset-0 w-full h-full">
                            {galleryImages.map((img, i) => (
                                <div
                                    key={i}
                                    className={`absolute inset-0 transition-all duration-1000 ease-in-out ${
                                        i === currentImage 
                                            ? 'opacity-100 scale-100' 
                                            : 'opacity-0 scale-110 pointer-events-none'
                                    }`}
                                >
                                    <img
                                        src={img}
                                        alt={`Momento ${i + 1}`}
                                        className={`w-full h-full object-cover ${
                                            i === currentImage ? 'scale-110' : 'scale-100'
                                        }`}
                                        style={{ 
                                            transition: i === currentImage ? 'transform 4000ms linear, opacity 1000ms ease-in-out' : 'opacity 1000ms ease-in-out'
                                        }}
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/20" />
                                </div>
                            ))}
                        </div>

                        {/* Navigation Arrows */}
                        <button
                            onClick={() => setCurrentImage(p => (p - 1 + galleryImages.length) % galleryImages.length)}
                            className="absolute left-6 top-1/2 -translate-y-1/2 w-14 h-14 bg-white/20 hover:bg-white/90 backdrop-blur-md rounded-full shadow-lg flex items-center justify-center transition-all duration-300 z-20 group-hover:left-8 opacity-0 group-hover:opacity-100"
                        >
                            <ChevronLeft className="w-7 h-7 text-gray-800" />
                        </button>
                        <button
                            onClick={() => setCurrentImage(p => (p + 1) % galleryImages.length)}
                            className="absolute right-6 top-1/2 -translate-y-1/2 w-14 h-14 bg-white/20 hover:bg-white/90 backdrop-blur-md rounded-full shadow-lg flex items-center justify-center transition-all duration-300 z-20 group-hover:right-8 opacity-0 group-hover:opacity-100"
                        >
                            <ChevronRight className="w-7 h-7 text-gray-800" />
                        </button>

                        {/* Indicators */}
                        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-3 z-20">
                            {galleryImages.map((_, i) => (
                                <button
                                    key={i}
                                    onClick={() => setCurrentImage(i)}
                                    className={`h-1.5 rounded-full transition-all duration-500 ${
                                        i === currentImage ? 'w-10 bg-rotary-gold' : 'w-3 bg-white/50 hover:bg-white'
                                    }`}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section (Synchronized with QuienesSomos) */}
            <section className="py-12 md:py-16 bg-gray-50">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <h2 className="text-2xl md:text-3xl mb-6" style={{ color: '#39424a' }}>
                        {getC('cta', 'title', "¿Quieres escribir la historia con nosotros?")}
                    </h2>
                    <Link
                        to="/involucrate"
                        className="inline-flex items-center gap-2 bg-sky-100 hover:bg-sky-200 text-rotary-blue font-medium px-8 py-3.5 rounded-full transition-all duration-300 shadow-lg"
                    >
                        <Star className="w-5 h-5 text-rotary-gold fill-rotary-gold" />
                        <span>{getC('cta', 'button', "Involúcrate en Rotary")}</span>
                    </Link>
                </div>
            </section>

            <Footer />
        </div>
    );
};

export default NuestrasCausas;
