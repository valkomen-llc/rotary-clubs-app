import type { CSSProperties } from 'react';
import { Globe, Users, DollarSign, Heart, Award, Trophy, Calendar, Star, Flag, Gift, Sparkles, Rocket, Megaphone, HandHeart } from 'lucide-react';
import { useClub } from '../contexts/ClubContext';

// Iconos disponibles para las cajas de estadísticas (configurable en sitios Evento/Convención).
const STAT_ICONS: Record<string, any> = {
  globe: Globe, users: Users, dollar: DollarSign, heart: Heart, handheart: HandHeart,
  award: Award, trophy: Trophy, calendar: Calendar, star: Star, flag: Flag,
  gift: Gift, sparkles: Sparkles, rocket: Rocket, megaphone: Megaphone,
};

const defaultStats = [
  {
    icon: Globe,
    value: '+1.2M',
    title: 'Somos más de 1.2 millones de rotarios en el mundo, dedicados a servir, mejorar y transformar nuestras comunidades.',
    color: 'text-rotary-blue'
  },
  {
    icon: Users,
    value: '+47M',
    title: 'Con más de aproximadamente 47 millones de horas de trabajo voluntario cada año. Somos Resiliencia y Continuidad.',
    color: 'text-purple-600'
  },
  {
    icon: DollarSign,
    value: '$291M',
    title: 'Hemos destinado 291 millones de dólares a iniciativas de servicio en el mundo y proyectos sostenibles.',
    color: 'text-rotary-gold'
  }
];

const latirStats = [
  {
    icon: Globe,
    value: '44',
    title: 'Cuarenta y cuatro distritos rotarios se dan cita en Cali para LATIR al unísono, compartiendo experiencias, estrategias y compromiso por el intercambio juvenil.',
    color: 'text-rotary-blue'
  },
  {
    icon: Users,
    value: '+175',
    title: 'Delegaciones de toda Latinoamérica construyendo puentes culturales, derribando fronteras y celebrando la diversidad que nos fortalece.',
    color: 'text-purple-600'
  },
  {
    icon: Heart,
    value: '14',
    title: 'Jóvenes, líderes y voluntarios de 14 paises reunidos por una causa común: transformar vidas a través del Programa de Intercambio de Jóvenes de Rotary.',
    color: 'text-rotary-gold'
  }
];

const StatsSection = () => {

  const { club } = useClub();
  const currentHostname = window.location.hostname;
  
  const isSpecial = club?.name?.toLowerCase().includes('latir') || 
                  club?.subdomain?.toLowerCase().includes('latir') || 
                  currentHostname.toLowerCase().startsWith('rye');
  
  const clubName = club?.name || 'nuestra red';
  
  const stats = isSpecial ? [
    {
      icon: Globe,
      value: '44',
      title: `Cuarenta y cuatro distritos rotarios se dan cita en ${clubName === 'Rotary LATIR' ? 'Cali' : 'nuestra región'} para trabajar al unísono, compartiendo experiencias, estrategias y compromiso por el intercambio juvenil.`,
      color: 'text-rotary-blue'
    },
    {
      icon: Users,
      value: '+175',
      title: 'Delegaciones construyendo puentes culturales, derribando fronteras y celebrando la diversidad que nos fortalece.',
      color: 'text-purple-600'
    },
    {
      icon: Heart,
      value: '14',
      title: `Jóvenes, líderes y voluntarios de 14 paises reunidos por una causa común: transformar vidas a través del Programa de Intercambio de Jóvenes de Rotary.`,
      color: 'text-rotary-gold'
    }
  ] : defaultStats;

  // Contenido editable de las cajas (solo Evento/Convención). Cada caja: icono (nombre),
  // color (hex, para icono y valor), value y text.
  const isEventSite = (club as any)?.type === 'Evento o Convención';
  const statsContent = (club as any)?.statsContent;
  const cards = (isEventSite && Array.isArray(statsContent) && statsContent.length > 0)
    ? statsContent.slice(0, 3).map((c: any) => ({
        Icon: STAT_ICONS[c.icon] || Globe,
        value: c.value || '',
        title: c.text || '',
        colorClass: '',
        colorStyle: { color: c.color || '#004080' } as CSSProperties,
      }))
    : stats.map((s) => ({ Icon: s.icon, value: s.value, title: s.title, colorClass: s.color, colorStyle: undefined as CSSProperties | undefined }));

  return (
    <section className="py-16 md:py-20 bg-rotary-concrete">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {cards.map((card, index) => (
            <div
              key={index}
              className="bg-gray-50 rounded-3xl border border-gray-100 p-8 text-center hover:bg-white hover:shadow-xl hover:border-[#0c3c7c]/10 transition-all duration-300"
            >
              <div className="flex justify-center mb-4">
                <card.Icon className={`w-10 h-10 ${card.colorClass}`} style={card.colorStyle} />
              </div>
              <h3 className={`text-4xl font-bold ${card.colorClass} mb-4`} style={card.colorStyle}>
                {card.value}
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">
                {card.title}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default StatsSection;
