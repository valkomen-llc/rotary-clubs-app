import { useEffect } from 'react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useClub } from '../contexts/ClubContext';
import { useCMSContent } from '../hooks/useCMSContent';

const FundacionRotaria = () => {
    const { club } = useClub();
    const { sections } = useCMSContent('fundacion-rotaria', club.id);

    // Al llegar, hacer scroll al inicio
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            <Navbar />

            {/* Contenedores por definir */}
            <main className="flex-1 mt-[104px]">
                
            </main>

            <Footer />
        </div>
    );
};

export default FundacionRotaria;
