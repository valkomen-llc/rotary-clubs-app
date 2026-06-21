import { Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSiteImages } from '../hooks/useSiteImages';
import { useClub } from '../contexts/ClubContext';
import { useCtaButton } from '../hooks/useCtaButton';

const DEFAULT_JOIN_IMG = 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=600&h=500&fit=crop';

const ICON_EMOJI: Record<string, string> = {
  star: '⭐', heart: '❤️', handshake: '🤝', send: '✈️', sparkles: '✨',
  megaphone: '📣', flag: '🚩', gift: '🎁', users: '👥', calendar: '📅',
  award: '🏅', trophy: '🏆', rocket: '🚀',
};

// Resalta (en color) la primera aparición de `highlight` en el título.
const renderTitle = (title: string, highlight?: string, color?: string) => {
  if (!highlight || !highlight.trim()) return title;
  const idx = title.toLowerCase().indexOf(highlight.trim().toLowerCase());
  if (idx === -1) return title;
  const len = highlight.trim().length;
  return (
    <>
      {title.slice(0, idx)}
      <span style={{ color: color || '#f6a40a' }}>{title.slice(idx, idx + len)}</span>
      {title.slice(idx + len)}
    </>
  );
};

const JoinSection = () => {
  const { club } = useClub();
  const siteImages = useSiteImages();
  const currentHostname = window.location.hostname;
  const isLatir = club?.subdomain?.toLowerCase().includes('latir') || club?.name?.toLowerCase().includes('latir') || currentHostname.toLowerCase().startsWith('rye');

  const imgUrl = siteImages.join?.url || DEFAULT_JOIN_IMG;
  const imgAlt = siteImages.join?.alt || 'Rotary Members';
  // Color de fondo personalizable solo para sitios Evento/Convención; el resto usa el azul original.
  const isEventSite = (club as any)?.type === 'Evento o Convención';
  const bgColor = isEventSite ? (club?.colors?.joinBg || '#0C3C7C') : '#0C3C7C';
  const cta = useCtaButton();

  // Contenido editable (solo Evento/Convención).
  const content = (isEventSite && (club as any)?.joinContent) ? (club as any).joinContent : {};
  const buttonUrl = content.buttonUrl || '';
  const emoji = isEventSite ? (ICON_EMOJI[content.icon] || (content.icon && content.icon.length <= 4 ? content.icon : '⭐')) : '';
  const isExternal = /^https?:\/\//i.test(buttonUrl);

  const btnClass = `mt-6 inline-flex items-center gap-2 ${cta.className} font-medium px-8 py-3.5 rounded-full transition-all duration-300 shadow-lg`;
  const btnInner = (
    <>
      {isEventSite ? (
        <span className="text-xl leading-none">{emoji}</span>
      ) : (
        <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
      )}
      {content.buttonText ? content.buttonText : 'Involúcrate en Rotary'}
    </>
  );

  return (
    <section className="relative overflow-hidden py-20" style={{ backgroundColor: bgColor }}>
      {isEventSite && (
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "url('/geo-darkblue.png')", backgroundPosition: '50% 0', backgroundRepeat: 'repeat', backgroundSize: '71px 85px', mixBlendMode: 'overlay', opacity: 0.85 }} />
      )}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Text Content */}
          <div className="text-white space-y-8">
            {isLatir ? (
              <>
                <h2 className="text-4xl md:text-5xl font-light mb-6 leading-[1.15] tracking-tight">
                  ¡Únete a {club?.name || 'nuestra red'} y transforma el mundo, un intercambio a la vez!
                </h2>
                <div className="space-y-6">
                  <p className="text-lg text-white/80 leading-relaxed font-normal">
                    Construyamos juntos un futuro de servicio, liderazgo y amistad, donde la juventud es protagonista del cambio y la diversidad nuestra mayor fortaleza. Resolver los desafíos más urgentes de nuestra región y del mundo requiere visión, acción y unión. En {club?.name || 'nuestra red'}, creemos que cada joven tiene el poder de generar impacto a través del entendimiento cultural y el servicio voluntario.
                  </p>
                  <p className="text-xl text-white/90 leading-relaxed pt-4 font-normal">
                    Conectamos a 44 distritos de 14 países, inspirando a más de 175 participantes a trabajar juntos por un futuro de paz y cooperación.
                  </p>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-3xl md:text-4xl font-light mb-6 leading-tight whitespace-pre-line">
                  {content.title ? renderTitle(content.title, content.titleHighlight, content.titleHighlightColor) : 'Únete a Rotary y construyamos juntos un futuro de servicio y amistad, impulsando el cambio y la solidaridad en el mundo'}
                </h2>
                <p className="text-white/80 mb-8 leading-relaxed font-normal whitespace-pre-line">
                  {content.text ? content.text : 'Resolver algunos de los problemas más complejos y acuciantes del mundo requiere compromiso y visión. Los socios de Rotary creen que compartimos la responsabilidad de tomar acción para mejorar nuestras comunidades. Únete a nosotros, para que juntos podamos tener un impacto aún mayor.'}
                </p>
              </>
            )}

            {isEventSite && buttonUrl ? (
              isExternal ? (
                <a href={buttonUrl} target="_blank" rel="noopener noreferrer" className={btnClass} style={cta.style}>{btnInner}</a>
              ) : (
                <Link to={buttonUrl} className={btnClass} style={cta.style}>{btnInner}</Link>
              )
            ) : (
              <button className={btnClass} style={cta.style}>{btnInner}</button>
            )}
          </div>

          {/* Image */}
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-yellow-400 to-[#FAA51A] rounded-[40px] blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
            <img
              src={imgUrl}
              alt={imgAlt}
              className="relative rounded-[40px] shadow-2xl w-full h-auto object-cover aspect-[4/3]"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default JoinSection;
