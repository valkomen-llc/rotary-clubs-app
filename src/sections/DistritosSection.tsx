import { MapPin, Users, Globe } from 'lucide-react';

const districts = [
    {
        number: '4271',
        name: 'Distrito 4271',
        region: 'Región Norte y Occidente',
        description: 'Comprende los clubes rotarios de la zona norte y occidental de Colombia, incluyendo la costa Caribe y el Pacífico.',
        clubCount: 75,
        color: '#0c3c7c',
    },
    {
        number: '4281',
        name: 'Distrito 4281',
        region: 'Región Centro y Sur',
        description: 'Agrupa los clubes rotarios de la zona central, sur y oriental de Colombia, incluyendo Bogotá y los Llanos.',
        clubCount: 80,
        color: '#E29C00',
    },
];

const DistritosSection = () => {
    return (
        <section className="py-20 bg-gray-50">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Section header */}
                <div className="text-center mb-14">
                    <span className="inline-block text-xs font-black uppercase tracking-[0.2em] text-[#E29C00] mb-3">
                        Distritos
                    </span>
                    <h2 className="text-3xl md:text-4xl font-black text-gray-900 leading-tight">
                        Unificando los Distritos de
                        <span className="text-[#0c3c7c]"> Colombia</span>
                    </h2>
                    <p className="mt-4 text-gray-500 max-w-2xl mx-auto">
                        COLROTARIOS coordina y unifica los dos distritos rotarios de Colombia, 
                        brindando servicios centralizados para más de 150 clubes.
                    </p>
                </div>

                {/* Districts cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {districts.map((d, i) => (
                        <div
                            key={i}
                            className="relative bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300 group"
                        >
                            {/* Top accent bar */}
                            <div className="h-1.5" style={{ backgroundColor: d.color }} />

                            <div className="p-8">
                                {/* District number badge */}
                                <div className="flex items-center gap-4 mb-6">
                                    <div
                                        className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-black text-lg"
                                        style={{ backgroundColor: d.color }}
                                    >
                                        {d.number}
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-gray-900">{d.name}</h3>
                                        <p className="text-sm text-gray-400 font-medium flex items-center gap-1">
                                            <MapPin className="w-3.5 h-3.5" />
                                            {d.region}
                                        </p>
                                    </div>
                                </div>

                                <p className="text-gray-500 text-sm leading-relaxed mb-6">
                                    {d.description}
                                </p>

                                {/* Stats */}
                                <div className="flex gap-6">
                                    <div className="flex items-center gap-2 text-sm">
                                        <Users className="w-4 h-4 text-gray-400" />
                                        <span className="font-bold text-gray-700">{d.clubCount}+</span>
                                        <span className="text-gray-400">Clubes</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm">
                                        <Globe className="w-4 h-4 text-gray-400" />
                                        <span className="font-bold text-gray-700">Activo</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default DistritosSection;
