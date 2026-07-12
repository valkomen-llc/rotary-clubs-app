import FoundationCredibility from '../components/FoundationCredibility';

const FoundationCertifications = () => {
    return (
        <section className="w-full bg-rotary-geo py-20 md:py-24 font-sans">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">

                {/* Métricas / credibilidad (autocontenida, sin imágenes externas) */}
                <FoundationCredibility percent={90.8} />

            </div>
        </section>
    );
};

export default FoundationCertifications;
