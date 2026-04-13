import { CheckCircle2, ArrowRight, DollarSign, Globe, Award } from 'lucide-react';
import { useClub } from '../contexts/ClubContext';

const grantTypes = [
    {
        icon: <DollarSign className="w-6 h-6" />,
        title: 'Subvenciones Distritales',
        desc: 'Financiamiento para proyectos locales ejecutados por clubes dentro de cada distrito.',
        amount: 'Hasta $30,000 USD',
    },
    {
        icon: <Globe className="w-6 h-6" />,
        title: 'Subvenciones Globales',
        desc: 'Proyectos de gran escala con impacto internacional, financiados por La Fundación Rotaria.',
        amount: 'Desde $30,000 USD',
    },
    {
        icon: <Award className="w-6 h-6" />,
        title: 'Fondo Anual',
        desc: 'Contribuciones voluntarias de los clubes al Fondo Anual de La Fundación Rotaria.',
        amount: 'Per cápita anual',
    },
];

const steps = [
    'Identificar la necesidad comunitaria',
    'Presentar propuesta a COLROTARIOS',
    'Evaluación y aprobación del proyecto',
    'Ejecución con acompañamiento financiero',
    'Informe final y rendición de cuentas',
];

const SubvencionesSection = () => {
    const { club } = useClub();
    const isLatir = club?.subdomain === 'latir' || club?.name?.toLowerCase().includes('latir') || window.location.search.includes('latir');

    if (isLatir) return null;

    return (
        <section className="py-20 bg-white">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Section header */}
                <div className="text-center mb-14">
                    <span className="inline-block text-xs font-black uppercase tracking-[0.2em] text-[#E29C00] mb-3">
                        Subvenciones
                    </span>
                    <h2 className="text-3xl md:text-4xl font-black text-gray-900 leading-tight">
                        Financiando Proyectos de
                        <span className="text-[#0c3c7c]"> Impacto Social</span>
                    </h2>
                    <p className="mt-4 text-gray-500 max-w-2xl mx-auto">
                        Canalizamos los recursos de La Fundación Rotaria para que los clubes colombianos 
                        ejecuten proyectos transformadores en sus comunidades.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
                    {/* Grant types */}
                    <div className="space-y-5">
                        <h3 className="text-lg font-black text-gray-900 mb-2">Tipos de Subvenciones</h3>
                        {grantTypes.map((g, i) => (
                            <div
                                key={i}
                                className="flex gap-4 p-5 bg-gray-50 rounded-2xl border border-gray-100 hover:bg-white hover:shadow-lg hover:border-[#0c3c7c]/10 transition-all duration-300"
                            >
                                <div className="w-12 h-12 rounded-xl bg-[#0c3c7c]/5 flex items-center justify-center text-[#0c3c7c] flex-shrink-0">
                                    {g.icon}
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-bold text-gray-900">{g.title}</h4>
                                    <p className="text-sm text-gray-500 mt-1">{g.desc}</p>
                                    <span className="inline-block mt-2 text-xs font-bold text-[#E29C00] bg-[#E29C00]/10 px-2.5 py-1 rounded-full">
                                        {g.amount}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Process steps */}
                    <div className="bg-[#0c3c7c] rounded-2xl p-8 text-white">
                        <h3 className="text-lg font-black mb-6 flex items-center gap-2">
                            <ArrowRight className="w-5 h-5 text-[#E29C00]" />
                            Proceso de Solicitud
                        </h3>
                        <div className="space-y-4">
                            {steps.map((step, i) => (
                                <div key={i} className="flex items-start gap-3">
                                    <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 text-sm font-bold text-[#E29C00]">
                                        {i + 1}
                                    </div>
                                    <div className="flex-1 pt-0.5">
                                        <p className="text-white/90 text-sm font-medium flex items-center gap-2">
                                            <CheckCircle2 className="w-4 h-4 text-[#E29C00]/60" />
                                            {step}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-8 pt-6 border-t border-white/10">
                            <p className="text-xs text-white/50">
                                ¿Tienes un proyecto? Contáctanos para iniciar el proceso de solicitud de subvención.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default SubvencionesSection;
