import { Landmark, HandCoins, BarChart3, Shield } from 'lucide-react';
import { useClub } from '../contexts/ClubContext';

const services = [
    {
        icon: <Landmark className="w-8 h-8" />,
        title: 'Gestión de Proyectos',
        desc: 'Administración integral de proyectos de servicio, obras y actividades de los clubes rotarios en Colombia.',
    },
    {
        icon: <HandCoins className="w-8 h-8" />,
        title: 'Recaudación de Fondos',
        desc: 'Coordinación de campañas de recaudación y actividades financieras para iniciativas rotarias.',
    },
    {
        icon: <BarChart3 className="w-8 h-8" />,
        title: 'Subvenciones',
        desc: 'Gestión y canalización de subvenciones de La Fundación Rotaria para proyectos locales y globales.',
    },
    {
        icon: <Shield className="w-8 h-8" />,
        title: 'Asesoría Financiera',
        desc: 'Acompañamiento contable y tributario para clubes en sus obligaciones como entidades ESAL.',
    },
];

const ServiciosSection = () => {
    const { club } = useClub();
    const isLatir = club?.subdomain === 'latir' || club?.name?.toLowerCase().includes('latir') || window.location.search.includes('latir');

    if (isLatir) return null;

    return (
        <section className="py-20 bg-white">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Section header */}
                <div className="text-center mb-14">
                    <span className="inline-block text-xs font-black uppercase tracking-[0.2em] text-[#E29C00] mb-3">
                        Nuestros Servicios
                    </span>
                    <h2 className="text-3xl md:text-4xl font-black text-gray-900 leading-tight">
                        Servicios Financieros para
                        <span className="text-[#0c3c7c]"> Clubes Rotarios</span>
                    </h2>
                    <p className="mt-4 text-gray-500 max-w-2xl mx-auto">
                        COLROTARIOS presta servicios especializados a los clubes rotarios de Colombia, 
                        facilitando la gestión financiera y administrativa de sus proyectos e iniciativas.
                    </p>
                </div>

                {/* Services grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {services.map((svc, i) => (
                        <div
                            key={i}
                            className="group relative bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-xl hover:border-[#0c3c7c]/10 transition-all duration-300"
                        >
                            <div className="w-14 h-14 rounded-xl bg-[#0c3c7c]/5 flex items-center justify-center text-[#0c3c7c] mb-5 group-hover:bg-[#0c3c7c] group-hover:text-white transition-all duration-300">
                                {svc.icon}
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">{svc.title}</h3>
                            <p className="text-sm text-gray-500 leading-relaxed">{svc.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default ServiciosSection;
