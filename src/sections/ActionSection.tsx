import { T } from '../components/T';
import { Link } from 'react-router-dom';
import { useClub } from '../contexts/ClubContext';
import { useCtaButton } from '../hooks/useCtaButton';
import { Star, Heart, Send, Sparkles, Megaphone, Flag, Gift, Users, Calendar, Award, Trophy, Rocket, Handshake } from 'lucide-react';

// Iconos disponibles para el botón de la sección (configurable en sitios Evento/Convención).
const ICONS: Record<string, any> = {
  star: Star, heart: Heart, handshake: Handshake, send: Send, sparkles: Sparkles,
  megaphone: Megaphone, flag: Flag, gift: Gift, users: Users, calendar: Calendar,
  award: Award, trophy: Trophy, rocket: Rocket,
};

// El color de fondo personalizable + textura overlay aplica SOLO a sitios de tipo
// "Evento o Convención". Los demás sitios conservan el render original (textura opaca azul).
const ActionSection = () => {
  const { club } = useClub();
  const isEventSite = (club as any)?.type === 'Evento o Convención';
  const bgColor = club?.colors?.actionBg || '#0c3c7c';
  const cta = useCtaButton();

  // Contenido configurable (solo Evento/Convención). Si no hay valor, se usa el texto por defecto.
  const content = (isEventSite && (club as any)?.actionContent) ? (club as any).actionContent : {};
  const buttonUrl = content.buttonUrl || '/involucrate';
  const iconColor = content.iconColor || '#F5A623';
  const IconComp = content.icon && ICONS[content.icon] ? ICONS[content.icon] : null;
  const isExternal = /^https?:\/\//i.test(buttonUrl);

  const btnClass = `inline-flex items-center gap-2 ${cta.className} font-medium px-8 py-3.5 rounded-full transition-all duration-300 shadow-lg`;
  const btnInner = (
    <>
      {IconComp ? (
        <IconComp className="w-5 h-5" style={{ color: iconColor }} />
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill={iconColor} />
        </svg>
      )}
      {content.buttonText ? content.buttonText : <T>Toma Acción con Nosotros</T>}
    </>
  );

  return (
    <section
      className="relative overflow-hidden py-16 md:py-20"
      style={isEventSite
        ? { backgroundColor: bgColor }
        : { backgroundColor: '#0c3c7c', backgroundImage: "url('/geo-darkblue.png')", backgroundPosition: '50% 0', backgroundRepeat: 'repeat', backgroundSize: '71px 85px' }}
    >
      {/* Textura geométrica sobrepuesta al color (overlay 0.85) — solo Evento/Convención. */}
      {isEventSite && (
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "url('/geo-darkblue.png')", backgroundPosition: '50% 0', backgroundRepeat: 'repeat', backgroundSize: '71px 85px', mixBlendMode: 'overlay', opacity: 0.85 }} />
      )}
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl md:text-4xl font-light text-white mb-6">
          {content.title ? content.title : <T>Somos gente de acción</T>}
        </h2>
        <p className="text-white/90 text-base md:text-lg mb-8 max-w-3xl mx-auto leading-relaxed whitespace-pre-line">
          {content.text ? content.text : <T>Nuestra red mundial de 1,4 millones de vecinos, amigos y líderes voluntarios ofrecen sus conocimientos y recursos para resolver problemas y abordar las necesidades de las comunidades.</T>}
        </p>
        {isExternal ? (
          <a href={buttonUrl} target="_blank" rel="noopener noreferrer" className={btnClass} style={cta.style}>
            {btnInner}
          </a>
        ) : (
          <Link to={buttonUrl} className={btnClass} style={cta.style}>
            {btnInner}
          </Link>
        )}
      </div>
    </section>
  );
};

export default ActionSection;
