

const FoundationImpactSection = () => {
    return (
        <section className="w-full bg-gradient-to-br from-[#0c182b] via-[#0b2444] to-[#09305c] py-24 font-sans border-t border-[#09305c]/20">
            <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
                
                {/* 1. Título principal */}
                <h2 className="text-white text-[32px] md:text-[40px] font-light text-center mb-10 leading-tight max-w-4xl mx-auto">
                    Con tu ayuda, podemos mejorar las condiciones de vida en tu comunidad y alrededor del mundo.
                </h2>

                {/* 2. Tres cajas de contenido (cards) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
                    {/* Card 1 */}
                    <div className="bg-white rounded-md shadow-lg overflow-hidden flex flex-col">
                        <div className="bg-[#009EDB] p-6 min-h-[140px] flex items-center justify-center text-center">
                            <h3 className="text-white text-lg font-semibold leading-snug">
                                ¿Por qué donar a la Fundación Rotaria?
                            </h3>
                        </div>
                        <div className="p-8 flex-grow">
                            <p className="text-gray-700 text-[15px] leading-relaxed">
                                Las contribuciones funcionan porque Rotary funciona. Nos enorgullecemos de nuestra eficacia porque 90,8 por ciento de las donaciones se destinan directamente a nuestros proyectos de servicio.
                            </p>
                        </div>
                    </div>

                    {/* Card 2 */}
                    <div className="bg-white rounded-md shadow-lg overflow-hidden flex flex-col">
                        <div className="bg-[#018d8d] p-6 min-h-[140px] flex items-center justify-center text-center">
                            <h3 className="text-white text-lg font-semibold leading-snug">
                                ¿Cómo utiliza las donaciones La Fundación Rotaria?
                            </h3>
                        </div>
                        <div className="p-8 flex-grow">
                            <p className="text-gray-700 text-[15px] leading-relaxed">
                                Nuestros 35.000 clubes llevan a cabo proyectos humanitarios sostenibles. Gracias a donaciones como la tuya, hemos eliminado el 99 por ciento de los casos de polio. Con tus contribuciones podemos formar a los futuros agentes de la paz, suministrar agua salubre y fortalecer las economías locales.
                            </p>
                        </div>
                    </div>

                    {/* Card 3 */}
                    <div className="bg-white rounded-md shadow-lg overflow-hidden flex flex-col">
                        <div className="bg-[#9b1f69] p-6 min-h-[140px] flex items-center justify-center text-center">
                            <h3 className="text-white text-lg font-semibold leading-snug">
                                ¿Qué impacto puede tener una donación en el mundo?
                            </h3>
                        </div>
                        <div className="p-8 flex-grow">
                            <p className="text-gray-700 text-[15px] leading-relaxed">
                                Puede salvar una vida. Proteger a un niño contra una enfermedad con tan solo 60 céntimos. Nuestros socios colaboradores multiplican el valor de tus donaciones. Por cada dólar que Rotary destine a la erradicación de la polio, la Fundación Bill y Melinda Gates donará $2.
                            </p>
                        </div>
                    </div>
                </div>

                {/* 3. Sección de métricas / credibilidad */}
                <div className="flex flex-col md:flex-row items-center justify-center gap-12 md:gap-24 mb-16">
                    <img 
                        src="https://www.rotary.org/sites/default/files/styles/w_1000/public/Proof-Charity-Navigator_ES.png" 
                        alt="Charity Navigator 4 estrellas" 
                        className="max-w-[300px] md:max-w-[400px] h-auto object-contain"
                    />
                    <img 
                        src="https://www.rotary.org/sites/default/files/styles/w_1000/public/TRF-percentage-spent_ES.png" 
                        alt="92% de los fondos se destinan a la concesión y ejecución de los programas" 
                        className="max-w-[300px] md:max-w-[400px] h-auto object-contain"
                    />
                </div>

                {/* 4. Footer del contenedor */}
                <div className="flex justify-center mt-10">
                    <img 
                        src="https://www.rotary.org/sites/default/files/styles/w_800/public/TRF-R_LOGO_REVERSED.png" 
                        alt="The Rotary Foundation" 
                        className="h-20 md:h-24 w-auto object-contain"
                    />
                </div>

            </div>
        </section>
    );
};

export default FoundationImpactSection;
