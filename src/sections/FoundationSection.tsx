import { Gift } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSiteImages } from '../hooks/useSiteImages';
import { useClub } from '../contexts/ClubContext';
import { useCtaButton } from '../hooks/useCtaButton';

const DEFAULT_FOUNDATION_IMG = 'https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=1600&h=800&fit=crop';

const ICON_EMOJI: Record<string, string> = {
  star: '⭐', heart: '❤️', handshake: '🤝', send: '✈️', sparkles: '✨',
  megaphone: '📣', flag: '🚩', gift: '🎁', users: '👥', calendar: '📅',
  award: '🏅', trophy: '🏆', rocket: '🚀',
};

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

const FoundationSection = () => {
  const { club } = useClub();
  const siteImages = useSiteImages();
  const cta = useCtaButton();
  const imgUrl = siteImages.foundation?.url || DEFAULT_FOUNDATION_IMG;
  const imgAlt = siteImages.foundation?.alt || 'Fundación Rotary - Trabajo comunitario';

  // Contenido editable (solo Evento/Convención).
  const isEventSite = (club as any)?.type === 'Evento o Convención';
  const content = (isEventSite && (club as any)?.foundationContent) ? (club as any).foundationContent : {};
  const buttonUrl = content.buttonUrl || '';
  const emoji = isEventSite ? (ICON_EMOJI[content.icon] || (content.icon && content.icon.length <= 4 ? content.icon : '🎁')) : '';
  const isExternal = /^https?:\/\//i.test(buttonUrl);

  const btnClass = `inline-flex items-center gap-2 ${cta.className} font-medium px-8 py-3.5 rounded-full transition-all duration-300 shadow-lg`;
  const btnInner = (
    <>
      {isEventSite ? (
        <span className="text-xl leading-none">{emoji}</span>
      ) : (
        <Gift className="w-5 h-5 text-rotary-gold" />
      )}
      {content.buttonText ? content.buttonText : 'Apoya la Fundación Rotaria'}
    </>
  );

  return (
    <section className="relative w-full min-h-[500px] md:min-h-[600px] overflow-hidden">
      {/* Imagen de fondo */}
      <div className="absolute inset-0">
        <img
          src={imgUrl}
          alt={imgAlt}
          className="w-full h-full object-cover"
        />
        {/* Overlay sutil */}
        <div className="absolute inset-0 bg-black/20" />
      </div>

      {/* Contenido - Caja de texto */}
      <div className="relative z-10 min-h-[500px] md:min-h-[600px] flex items-center justify-end max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="bg-white rounded-2xl md:rounded-3xl shadow-2xl px-8 md:px-12 py-10 md:py-12 max-w-lg w-full ml-auto">
          <h2 className="text-2xl md:text-3xl font-light text-gray-900 mb-6 whitespace-pre-line">
            {content.title ? renderTitle(content.title, content.titleHighlight, content.titleHighlightColor) : 'Nuestra Fundación'}
          </h2>
          <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-8 whitespace-pre-line">
            {content.text ? content.text : 'Contribuye a La Fundación Rotaria para financiar proyectos de servicio que mejoran las condiciones de vida de las personas tanto en las comunidades locales como en todo el mundo.'}
          </p>
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
      </div>
    </section>
  );
};

export default FoundationSection;
