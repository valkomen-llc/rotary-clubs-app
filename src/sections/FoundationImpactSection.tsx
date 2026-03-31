

const FoundationImpactSection = () => {
    return (
        <section className="w-full bg-rotary-geo py-20 md:py-24 font-sans">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                
                {/* 1. Sección de métricas / credibilidad */}
                <div className="flex flex-col md:flex-row items-center justify-center gap-16 md:gap-32 mb-16">
                    <img 
                        src="https://www.rotary.org/sites/default/files/styles/w_1200/public/Proof-Charity-Navigator_ES.png?itok=yNkwDJdS" 
                        alt="Charity Navigator 4 estrellas" 
                        className="max-w-[320px] md:max-w-[400px] h-auto object-contain drop-shadow-lg"
                    />
                    <img 
                        src="https://www.rotary.org/sites/default/files/styles/w_1200/public/TRF-percentage-spent_2024-es.png?itok=GDehJG8A" 
                        alt="Eficacia de las donaciones" 
                        className="max-w-[320px] md:max-w-[400px] h-auto object-contain drop-shadow-lg"
                    />
                </div>

                {/* 2. Footer del contenedor */}
                <div className="flex justify-center mt-12 md:mt-20">
                    <img 
                        src="https://www.rotary.org/sites/default/files/styles/w_800/public/TRF-Simple-REV_PMS-C.png?itok=Sw6Y67LM" 
                        alt="The Rotary Foundation" 
                        className="h-16 md:h-20 w-auto object-contain opacity-90"
                    />
                </div>

            </div>
        </section>
    );
};

export default FoundationImpactSection;
