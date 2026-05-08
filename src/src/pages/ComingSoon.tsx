import { Globe, Mail, Clock } from 'lucide-react';

interface ComingSoonProps {
    clubName?: string;
    logo?: string;
    primaryColor?: string;
}

export default function ComingSoon({ clubName = 'Rotary Club', logo, primaryColor = '#013388' }: ComingSoonProps) {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center"
            style={{ background: `linear-gradient(135deg, ${primaryColor}15 0%, white 100%)` }}>

            {/* Logo or icon */}
            <div className="mb-8">
                {logo
                    ? <img src={logo} alt={clubName} className="h-24 w-auto object-contain mx-auto" />
                    : (
                        <div className="w-24 h-24 rounded-3xl flex items-center justify-center mx-auto shadow-xl"
                            style={{ backgroundColor: primaryColor }}>
                            <Globe className="w-12 h-12 text-white" />
                        </div>
                    )
                }
            </div>

            {/* Content */}
            <div className="max-w-lg">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold mb-6 border"
                    style={{ color: primaryColor, borderColor: `${primaryColor}30`, backgroundColor: `${primaryColor}10` }}>
                    <Clock className="w-4 h-4" />
                    Próximamente
                </div>

                <h1 className="text-4xl font-black text-gray-900 mb-4">{clubName}</h1>
                <p className="text-gray-500 text-lg leading-relaxed mb-8">
                    Estamos preparando nuestro sitio web oficial. Pronto podrás conocer más sobre nuestros proyectos, socios y eventos.
                </p>

                <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
                    <Mail className="w-4 h-4" />
                    <span>¿Preguntas? Contáctanos pronto.</span>
                </div>
            </div>

            {/* Powered by */}
            <div className="absolute bottom-6 flex items-center gap-2 opacity-40">
                <span className="text-xs text-gray-400">Powered by</span>
                <span className="text-xs font-black text-gray-500">ClubPlatform</span>
            </div>
        </div>
    );
}
