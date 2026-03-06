import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';

const NuestrasCausas = () => {
    return (
        <div className="min-h-screen bg-white">
            <Navbar />

            {/* Hero Section - Impact Image */}
            <section className="relative w-full h-[350px] md:h-[450px] overflow-hidden">
                <div className="absolute inset-0">
                    <img
                        src="https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=1600&h=600&fit=crop"
                        alt="Nuestras Causas"
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/30" />
                </div>
            </section>

            {/* Title Section - Blue Background */}
            <section
                className="py-12 md:py-16"
                style={{
                    backgroundColor: '#263b4c',
                    backgroundImage: "url('/geo-darkblue.png')",
                    backgroundPosition: '50% 0',
                    backgroundRepeat: 'repeat',
                    backgroundSize: '71px 85px'
                }}
            >
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <h1 className="text-3xl md:text-4xl font-bold text-white tracking-wider">Nuestras Causas</h1>
                </div>
            </section>            {/* Intro Content & Video Section */}
            <section className="py-12 md:py-20 bg-rotary-concrete">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <p className="text-xl md:text-2xl text-gray-700 leading-relaxed mb-12 font-light">
                        Rotary se concentra en causas para fortalecer las relaciones internacionales, mejorar vidas, y crear un mundo más propicio para fomentar nuestras iniciativas pro paz y nuestra campaña para erradicar la polio.
                    </p>

                    <div className="relative aspect-video rounded-2xl overflow-hidden shadow-2xl mb-16 ring-1 ring-gray-200">
                        <video
                            controls
                            className="w-full h-full object-cover"
                            poster="https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=1200&h=675&fit=crop"
                        >
                            <source src="https://cdn1-originals.webdamdb.com/13799_162776313?cache=1751402723&response-content-disposition=inline;filename=2024_050_OVERVIEW_60_16x9_ES_SUB.mp4&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cCo6Ly9jZG4xLW9yaWdpbmFscy53ZWJkYW1kYi5jb20vMTM3OTlfMTYyNzc2MzEzP2NhY2hlPTE3NTE0MDI3MjMmcmVzcG9uc2UtY29udGVudC1kaXNwb3NpdGlvbj1pbmxpbmU7ZmlsZW5hbWU9MjAyNF8wNTBfT1ZFUlZJRVdfNjBfMTZ4OV9FU19TVUIubXA0IiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoyMTQ3NDE0NDAwfX19XX0_&Signature=kZIoi4xa6z1Gdubae5Hpet4iws1KJIKW0EhxiyWdfUpxUFyYb7opE2TJWp19EBdPcCBaBZ9kmW1WrGTO2k~E5qqfl1KvST8kq54TqNx~FYUE-LXBf-gncwjXL1vNemJNfzhqVXlLqI0d~Yb0oMLnAqzsueHjPWrlCirymfliDQURudYxvFc1VsEFtFqpwKgB9BKkz-RHzYykMXMzidViNnRzJzh3uzv0F6xQaeZYYLQ4SCdQ7j3~1scDm-Wsjia2mc20QLIVscUDSUExU55aJIlqHznDa6fCsrq8~ckDanCgDQgseYJnU4371FXHSkBtNnWlzQZE1tskEGHuKogqCA__&Key-Pair-Id=APKAI2ASI2IOLRFF2RHA" type="video/mp4" />
                            Tu navegador no soporta el elemento de video.
                        </video>
                    </div>
                </div>
            </section>

            {/* Causes Grid Section */}
            <section className="py-16 md:py-24 bg-rotary-concrete">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
                        {/* Area 1: Fomento de la paz */}
                        <div className="flex flex-col bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 transition-hover duration-300 hover:shadow-md">
                            <div className="h-48 overflow-hidden">
                                <img src="https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=600&h=400&fit=crop" alt="Fomento de la paz" className="w-full h-full object-cover" />
                            </div>
                            <div className="p-6 flex-grow">
                                <h3 className="text-xl font-bold text-gray-900 mb-3">Fomento de la paz</h3>
                                <p className="text-gray-600 text-sm leading-relaxed mb-4">
                                    Rotary fomenta el diálogo para promover la comprensión internacional entre los pueblos y culturas. Ayudamos en la formación de líderes adultos y jóvenes para que sean actores en la prevención y mediación de conflictos y brinden apoyo a refugiados que huyen de situaciones de peligro.
                                </p>
                                <a href="#" className="text-rotary-blue hover:text-sky-700 font-rotary-condensed font-bold text-sm inline-flex items-center gap-1">
                                    Más información ›
                                </a>
                            </div>
                        </div>

                        {/* Area 2: Prevención y tratamiento de enfermedades */}
                        <div className="flex flex-col bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 transition-hover duration-300 hover:shadow-md">
                            <div className="h-48 overflow-hidden">
                                <img src="https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=600&h=400&fit=crop" alt="Prevención y tratamiento de enfermedades" className="w-full h-full object-cover" />
                            </div>
                            <div className="p-6 flex-grow">
                                <h3 className="text-xl font-bold text-gray-900 mb-3">Prevención y tratamiento de enfermedades</h3>
                                <p className="text-gray-600 text-sm leading-relaxed mb-4">
                                    Sensibilizamos y equipamos a las comunidades para contener la propagación de enfermedades mortales como la polio, el VIH/SIDA y el paludismo. Nuestra meta es mejorar y ampliar el acceso a la atención de la salud, de bajo costo o gratuita, en las regiones en desarrollo.
                                </p>
                                <a href="#" className="text-rotary-blue hover:text-sky-700 font-rotary-condensed font-bold text-sm inline-flex items-center gap-1">
                                    Más información ›
                                </a>
                            </div>
                        </div>

                        {/* Area 3: Suministro de agua potable */}
                        <div className="flex flex-col bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 transition-hover duration-300 hover:shadow-md">
                            <div className="h-48 overflow-hidden">
                                <img src="https://images.unsplash.com/photo-1593113598332-cd288d649433?w=600&h=400&fit=crop" alt="Suministro de agua potable" className="w-full h-full object-cover" />
                            </div>
                            <div className="p-6 flex-grow">
                                <h3 className="text-xl font-bold text-gray-900 mb-3">Suministro de agua potable</h3>
                                <p className="text-gray-600 text-sm leading-relaxed mb-4">
                                    Apoyamos iniciativas locales mediante las cuales más personas tienen acceso al agua salubre, saneamiento e higiene. Nuestro propósito no es simplemente construir pozos sino compartir nuestras experiencias con los líderes y docentes de la comunidad para que nuestros proyectos sean sostenibles.
                                </p>
                                <a href="#" className="text-rotary-blue hover:text-sky-700 font-rotary-condensed font-bold text-sm inline-flex items-center gap-1">
                                    Más información ›
                                </a>
                            </div>
                        </div>

                        {/* Area 4: Mejorando al salud materno-infantil */}
                        <div className="flex flex-col bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 transition-hover duration-300 hover:shadow-md">
                            <div className="h-48 overflow-hidden">
                                <img src="https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=600&h=400&fit=crop" alt="Mejorando al salud materno-infantil" className="w-full h-full object-cover" />
                            </div>
                            <div className="p-6 flex-grow">
                                <h3 className="text-xl font-bold text-gray-900 mb-3">Mejorando al salud materno-infantil</h3>
                                <p className="text-gray-600 text-sm leading-relaxed mb-4">
                                    Anualmente alrededor de seis millones de niños menores de cinco años fallecen víctimas de la desnutrición, falta de atención de la salud y saneamiento insalubre. Al ampliar el acceso a mejores servicios de salud, madres e hijos viven sanos y fuertes.
                                </p>
                                <a href="#" className="text-rotary-blue hover:text-sky-700 font-rotary-condensed font-bold text-sm inline-flex items-center gap-1">
                                    Más información ›
                                </a>
                            </div>
                        </div>

                        {/* Area 5: Promoción de la educación */}
                        <div className="flex flex-col bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 transition-hover duration-300 hover:shadow-md">
                            <div className="h-48 overflow-hidden">
                                <img src="https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=600&h=400&fit=crop" alt="Promoción de la educación" className="w-full h-full object-cover" />
                            </div>
                            <div className="p-6 flex-grow">
                                <h3 className="text-xl font-bold text-gray-900 mb-3">Promoción de la educación</h3>
                                <p className="text-gray-600 text-sm leading-relaxed mb-4">
                                    El analfabetismo afecta a más de 775 millones de personas mayores de 15 años. Nuestra meta es alentar a las comunidades para que apoyen programas de alfabetización y educación básica, reduzcan la disparidad de género en la educación y aumenten la tasa de alfabetismo entre los adultos.
                                </p>
                                <a href="#" className="text-rotary-blue hover:text-sky-700 font-rotary-condensed font-bold text-sm inline-flex items-center gap-1">
                                    Más información ›
                                </a>
                            </div>
                        </div>

                        {/* Area 6: Desarrollo de las economías locales */}
                        <div className="flex flex-col bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 transition-hover duration-300 hover:shadow-md">
                            <div className="h-48 overflow-hidden">
                                <img src="https://images.unsplash.com/photo-1531206715517-5c0ba140b2b8?w=600&h=400&fit=crop" alt="Desarrollo de las economías locales" className="w-full h-full object-cover" />
                            </div>
                            <div className="p-6 flex-grow">
                                <h3 className="text-xl font-bold text-gray-900 mb-3">Desarrollo de las economías locales</h3>
                                <p className="text-gray-600 text-sm leading-relaxed mb-4">
                                    Nuestros proyectos de servicio están diseñados para fomentar el desarrollo integral y económico de las comunidades y crear oportunidades de trabajo productivo y remunerado para personas de todas las edades. Trabajamos también con emprendedores y líderes locales.
                                </p>
                                <a href="#" className="text-rotary-blue hover:text-sky-700 font-rotary-condensed font-bold text-sm inline-flex items-center gap-1">
                                    Más información ›
                                </a>
                            </div>
                        </div>

                        {/* Area 7: Protección del medioambiente */}
                        <div className="flex flex-col bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 lg:col-start-2 transition-hover duration-300 hover:shadow-md">
                            <div className="h-48 overflow-hidden">
                                <img src="https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=600&h=400&fit=crop" alt="Protección del medioambiente" className="w-full h-full object-cover" />
                            </div>
                            <div className="p-6 flex-grow">
                                <h3 className="text-xl font-bold text-gray-900 mb-3">Protección del medioambiente</h3>
                                <p className="text-gray-600 text-sm leading-relaxed mb-4">
                                    Tomamos medidas para encontrar soluciones innovadoras y desarrollar proyectos de servicio sostenibles que fortalezcan nuestros ecosistemas locales y nuestro planeta.
                                </p>
                                <a href="#" className="text-rotary-blue hover:text-sky-700 font-rotary-condensed font-bold text-sm inline-flex items-center gap-1">
                                    Más información ›
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Polio Section - Full Width Banner */}
            <section className="bg-rotary-concrete">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
                    <div className="flex flex-col lg:flex-row rounded-3xl overflow-hidden shadow-xl ring-1 ring-gray-100">
                        <div className="lg:w-1/2 h-[300px] lg:h-auto">
                            <img src="https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=800&h=600&fit=crop" alt="Erradicación de la polio" className="w-full h-full object-cover" />
                        </div>
                        <div className="lg:w-1/2 bg-[#A32036] p-8 md:p-12 flex flex-col justify-center text-white">
                            <h2 className="text-3xl md:text-4xl font-bold mb-6">Erradicación de la polio</h2>
                            <p className="text-lg leading-relaxed mb-8 opacity-90">
                                Durante los últimos 35 años, Rotary ha desplegado esfuerzos para eliminar esta enfermedad de la faz de la Tierra, meta que ya se vislumbra en el horizonte. En 1979, iniciamos nuestra misión con una campaña para vacunar a seis millones de niños filipinos. En la actualidad Afganistán y Pakistán son los únicos países donde la polio sigue siendo endémica.
                            </p>
                            <div>
                                <a
                                    href="https://www.endpolio.org/es"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-block border-2 border-white/30 hover:bg-white hover:text-[#A32036] px-8 py-3 rounded-full font-rotary-condensed font-bold transition-all duration-300"
                                >
                                    Ayúdanos a acabar con la polio para siempre
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            <Footer />
        </div>
    );
};

export default NuestrasCausas;
