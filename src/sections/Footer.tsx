import { Facebook, Twitter, Instagram, Youtube, MessageCircle } from 'lucide-react';
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
            <div className="flex items-center mb-4">
              <div className="relative" style={{ width: '108px' }}>
                <img
                  src={club.footerLogo || 'https://rotary-platform-assets.s3.amazonaws.com/logos/rotary-logo-white-main.png'}
                  alt="Rotary logo"
                  className="w-full h-auto object-contain"
                />
              </div>
              {!club.footerLogo && !club.logo && (
                <div className="ml-3">
                  <span className="font-bold text-lg leading-tight block">Rotary Club</span>
                  <span className="font-light text-sm opacity-80">{club.name.replace(/^Rotary Club\s+/i, '')}</span>
                </div>
              )}
            </div>
            <div className="bg-red-600 text-white text-xs font-bold px-3 py-2 rounded inline-block">
              END<br />POLIO<br />NOW
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
              © {new Date().getFullYear()} - {club.name}.{' '}
              <a href="#" className="hover:text-white transition-colors">Política de privacidad</a>{' '}
              <a href="#" className="hover:text-white transition-colors">Condiciones de uso</a>
            </div>
            <div className="flex items-center gap-4">
              {club.social.facebook && (
                <a href={club.social.facebook} target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-white transition-colors">
                  <Facebook className="w-5 h-5" />
                </a>
              )}
              {club.social.twitter && (
                <a href={club.social.twitter} target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-white transition-colors">
                  <Twitter className="w-5 h-5" />
                </a>
              )}
              {club.social.instagram && (
                <a href={club.social.instagram} target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-white transition-colors">
                  <Instagram className="w-5 h-5" />
                </a>
              )}
              {club.social.youtube && (
                <a href={club.social.youtube} target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-white transition-colors">
                  <Youtube className="w-5 h-5" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* WhatsApp Float */}
      <a
        href="#"
        className="fixed bottom-6 right-6 bg-green-500 hover:bg-green-600 text-white p-3 rounded-full shadow-lg transition-colors z-50"
      >
        <MessageCircle className="w-6 h-6" />
      </a>
    </footer>
  );
};

export default Footer;
