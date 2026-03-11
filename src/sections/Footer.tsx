import { Facebook, Twitter, Instagram, Youtube } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useClub } from '../contexts/ClubContext';

const Footer = () => {
  const { club } = useClub();
  return (
    <footer className="text-white" style={{ backgroundColor: '#0c3c7c' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Logo & End Polio */}
          <div>
            {/* Footer logo is always institutional — only the header logo is customizable per club */}
            <div className="flex items-center mb-4">
              <div className="relative" style={{ width: '158px' }}>
                <img
                  src={club.footerLogo || "https://rotary-platform-assets.s3.amazonaws.com/logos/rotary-logo-white-main.png"}
                  alt="Rotary International"
                  className="w-full h-auto object-contain"
                  onError={(e) => {
                    // Fallback: show institutional if specific image fails
                    (e.target as HTMLImageElement).src = 'https://rotary-platform-assets.s3.amazonaws.com/logos/rotary-logo-white-main.png';
                  }}
                />
              </div>
            </div>
            <div className="mt-[14px]">
              {/* End Polio Now emblem */}
              {club.endPolioLogo ? (
                <img src={club.endPolioLogo} alt="End Polio Now" className="h-[68px] w-auto object-contain" />
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 204.79 204.79"
                  className="h-[68px] w-auto"
                >
                  <path fill="white" d="M126.434 80.938h16.655c19.155 0 23.522-12.462 23.522-22.303 0-12.403-7.744-21.72-22.418-21.72h-17.76v44.023zm12.578-35.64h3.96c7.745 0 10.364 6.523 10.364 13.278 0 10.307-5.066 13.976-11.007 13.976h-3.318V45.3zm-57.3 35.64h9.666V56.015h.115l17.937 24.923h9.432V36.915h-9.666v23.35h-.117l-15.664-23.35H81.71v44.023zm-39.482 0h33.774v-9.435H54.81V63.06h13.16v-9.083H54.81V46h20.555v-9.085H42.23v44.023zm89.054 86.124h10.772l6.23-23.467h.117l6.23 23.467h10.772l11.705-44.023h-9.898l-6.174 23.524h-.114l-5.998-23.525h-10.483l-6.23 23.524h-.116l-5.998-23.525h-10.483l-6.23 23.524h-.116l-6.056-23.525H119.58l11.706 44.022zm-98.586 0h9.666V142.14h.117l17.936 24.922h9.434V123.04h-9.667v23.35h-.116l-15.664-23.35H32.698v44.022z" />
                  <path fill="white" d="M191.652 102.078c0-13.462-7.597-21.896-20.165-21.896s-20.165 8.434-20.165 21.896c0 13.462 7.597 21.897 20.165 21.897s20.165-8.435 20.165-21.897M171.487 88.56c4.692 0 7.428 2.794 7.428 13.518 0 11.34-3.35 13.518-7.428 13.518-4.134 0-7.43-2.18-7.43-13.518.002-10.22 2.57-13.517 7.43-13.517m-38.596 34.632h12.064v-42.23H132.89v42.23zm-35.637 0h29.714v-9.05h-17.65v-33.18H97.254v42.23zm-4.916-21.114c0-13.462-7.597-21.896-20.165-21.896-12.568 0-20.164 8.434-20.164 21.896 0 13.462 7.596 21.897 20.164 21.897 12.568 0 20.165-8.435 20.165-21.897M72.172 88.56c4.693 0 7.43 2.794 7.43 13.518 0 11.34-3.352 13.518-7.43 13.518-4.133 0-7.43-2.18-7.43-13.518 0-10.22 2.57-13.517 7.43-13.517m-58.705 34.632h12.065v-16.31h6.76c13.684 0 17.37-6.48 17.37-12.904 0-4.077-1.62-13.016-15.137-13.016H13.467v42.23zm12.065-34.185h5.53c3.128 0 5.865 1.006 5.865 5.027 0 3.24-2.402 4.916-6.2 4.804h-5.195v-9.83z" />
                  <path fill="white" d="M117.6 145.05c0-14.034-7.92-22.827-21.022-22.827s-21.02 8.793-21.02 22.827 7.918 22.827 21.02 22.827 21.02-8.793 21.02-22.827m-21.02-14.092c4.893 0 7.745 2.912 7.745 14.092 0 11.82-3.494 14.092-7.745 14.092-4.31 0-7.744-2.27-7.744-14.092 0-10.656 2.678-14.092 7.744-14.092" />
                </svg>
              )}
            </div>
          </div>

          {/* Links de Interés */}
          <div>
            <h3 className="font-semibold text-lg mb-4">Links de Interés</h3>
            <ul className="space-y-2 text-sm text-white/80">
              <li><a href="#" className="hover:text-rotary-gold transition-colors">Acerca de Rotary</a></li>
              <li><a href="#" className="hover:text-rotary-gold transition-colors">Historia de Rotary</a></li>
              <li><a href="#" className="hover:text-rotary-gold transition-colors">Nuestra Estructura</a></li>
              <li><a href="#" className="hover:text-rotary-gold transition-colors">Nuestras Causas</a></li>
              <li><a href="#" className="hover:text-rotary-gold transition-colors">La Fundación Rotaria</a></li>
              <li><a href="#" className="hover:text-rotary-gold transition-colors">Proyectos</a></li>
              <li><a href="#" className="hover:text-rotary-gold transition-colors">My Rotary</a></li>
              <li><a href="#" className="hover:text-rotary-gold transition-colors">Novedades</a></li>
              <li><a href="#" className="hover:text-rotary-gold transition-colors">Rotary Brand Center</a></li>
              <li><a href="#" className="hover:text-rotary-gold transition-colors">Rotary Club Central</a></li>
              <li><a href="#" className="hover:text-rotary-gold transition-colors">Contacto</a></li>
            </ul>
          </div>

          {/* Realiza una Acción */}
          <div>
            <h3 className="font-semibold text-lg mb-4">Realiza una Acción</h3>
            <ul className="space-y-2 text-sm text-white/80">
              <li><a href="#" className="hover:text-rotary-gold transition-colors flex items-center gap-2">
                <span className="w-1 h-1 bg-rotary-gold rounded-full"></span>
                Aporte Voluntario
              </a></li>
              <li><a href="#" className="hover:text-rotary-gold transition-colors flex items-center gap-2">
                <span className="w-1 h-1 bg-rotary-gold rounded-full"></span>
                Comunícate con nosotros
              </a></li>
              <li><a href="#" className="hover:text-rotary-gold transition-colors flex items-center gap-2">
                <span className="w-1 h-1 bg-rotary-gold rounded-full"></span>
                Rotary.org
              </a></li>
              <li><a href="#" className="hover:text-rotary-gold transition-colors flex items-center gap-2">
                <span className="w-1 h-1 bg-rotary-gold rounded-full"></span>
                Pongamos Fin a la Polio
              </a></li>
            </ul>
          </div>

          {/* Newsletter */}
          <div>
            <h3 className="font-semibold text-lg mb-4">Suscríbete a nuestro Newsletter</h3>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="Dirección de email"
                className="bg-white/10 border-white/20 text-white placeholder:text-white/50 flex-1"
              />
              <Button className="bg-rotary-gold hover:bg-yellow-500 text-rotary-blue font-semibold px-4">
                →
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-xs text-white/60 text-center md:text-left">
              © {new Date().getFullYear()} {club.name}. Todos los derechos reservados. | Powered by{' '}
              <a href="https://valkomen.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors font-medium">Valkomen LLC</a>
              {' · '}
              <a href="https://my.rotary.org/privacy-policy" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Política de privacidad</a>
              {' · '}
              <a href="https://my.rotary.org/terms-of-use" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Condiciones de uso</a>
            </div>
            <div className="flex items-center gap-4">
              {club.social.map((link, idx) => {
                let Icon = null;
                const platform = link.platform.toLowerCase();

                if (platform.includes('facebook')) Icon = Facebook;
                else if (platform.includes('twitter') || platform.includes('x')) Icon = Twitter;
                else if (platform.includes('instagram')) Icon = Instagram;
                else if (platform.includes('youtube')) Icon = Youtube;

                return (
                  <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-white transition-colors" title={link.platform}>
                    {Icon ? <Icon className="w-5 h-5" /> : <span className="text-xs border border-white/60 rounded px-1">{link.platform}</span>}
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
