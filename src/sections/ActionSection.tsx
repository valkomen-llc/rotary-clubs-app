import { T } from '../components/T';
import { Link } from 'react-router-dom';
import { useClub } from '../contexts/ClubContext';

// El patrón geográfico (geo-darkblue.png) es una imagen de PALETA OPACA azul (sin canal
// alfa), así que al pintarse como background-image tapaba por completo el background-color
// elegido. Por eso el color personalizado no se veía en vivo aunque el dato sí llegaba.
// Solución: superponer una capa translúcida del color elegido SOBRE el patrón, de modo que
// el color domine y la textura quede sutil. Para el azul por defecto el resultado es idéntico.
const hexToRgba = (hex: string, alpha: number): string => {
  let h = (hex || '').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return `rgba(12,60,124,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

const ActionSection = () => {
  const { club } = useClub();
  const bgColor = club?.colors?.actionBg || '#0c3c7c';
  const wash = hexToRgba(bgColor, 0.88);

  return (
    <section
      className="py-16 md:py-20"
      style={{
        backgroundColor: bgColor,
        backgroundImage: `linear-gradient(${wash}, ${wash}), url('/geo-darkblue.png')`,
        backgroundPosition: 'center, 50% 0',
        backgroundRepeat: 'no-repeat, repeat',
        backgroundSize: 'cover, 71px 85px'
      }}
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl md:text-4xl font-light text-white mb-6">
          <T>Somos gente de acción</T>
        </h2>
        <p className="text-white/90 text-base md:text-lg mb-8 max-w-3xl mx-auto leading-relaxed">
          <T>Nuestra red mundial de 1,4 millones de vecinos, amigos y líderes voluntarios ofrecen sus conocimientos y recursos para resolver problemas y abordar las necesidades de las comunidades.</T>
        </p>
        <Link
          to="/involucrate"
          className="inline-flex items-center gap-2 bg-sky-100 hover:bg-sky-200 text-rotary-blue font-medium px-8 py-3.5 rounded-full transition-all duration-300 shadow-lg"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="#F5A623" />
          </svg>
          <T>Toma Acción con Nosotros</T>
        </Link>
      </div>
    </section>
  );
};

export default ActionSection;

