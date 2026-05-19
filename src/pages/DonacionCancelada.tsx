import { Link } from 'react-router-dom';
import { XCircle, ArrowLeft, Heart } from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useClub } from '../contexts/ClubContext';

const DonacionCancelada = () => {
    const { club } = useClub();

    return (
        <div className="min-h-screen bg-gradient-to-b from-rotary-concrete to-white flex flex-col">
            <Navbar />
            <main className="flex-1 flex items-center justify-center px-4 py-20">
                <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-10 text-center border border-gray-100">
                    <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-5">
                        <XCircle className="w-12 h-12 text-amber-500" />
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-3">Donación cancelada</h1>
                    <p className="text-gray-600 mb-2">
                        No procesamos ningún cobro. Puedes intentarlo de nuevo cuando quieras.
                    </p>
                    <p className="text-gray-500 text-sm mb-8">
                        Cada aporte ayuda a sostener las iniciativas de <strong>{club.name}</strong>.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <Link
                            to="/maneras-de-contribuir"
                            className="inline-flex items-center justify-center gap-2 bg-[#9D2235] hover:bg-[#8B1E2F] text-white font-bold py-3 px-6 rounded-lg transition-colors"
                        >
                            <Heart className="w-4 h-4 fill-current" /> Intentar de nuevo
                        </Link>
                        <Link
                            to="/"
                            className="inline-flex items-center justify-center gap-2 border-2 border-gray-200 hover:border-gray-300 text-gray-700 font-semibold py-3 px-6 rounded-lg transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" /> Volver al inicio
                        </Link>
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
};

export default DonacionCancelada;
