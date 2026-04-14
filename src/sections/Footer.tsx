import { Facebook, Twitter, Instagram, Youtube } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useClub } from '../contexts/ClubContext';

const Footer = () => {
  const { club } = useClub();
  
  // Confirmed working URLs on app.clubplatform.org
  const rotaryLogo = "https://app.clubplatform.org/rotary-logo-white.png";
  const endPolioLogo = "https://app.clubplatform.org/logo-end-polio.svg";

  return (
    <footer className="text-white w-full" style={{ backgroundColor: '#0C3C7C', background: '#0C3C7C' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Logo & End Polio */}
          <div className="space-y-8">
            <div className="flex items-center">
              <img
                src={club.footerLogo || rotaryLogo}
                alt="Rotary"
                className="h-14 w-auto object-contain"
                onError={(e) => { (e.target as HTMLImageElement).src = rotaryLogo; }}
              />
            </div>
            <div>
              <img 
                src={club.endPolioLogo || endPolioLogo} 
                alt="End Polio Now" 
                className="h-16 w-auto object-contain"
                style={{ filter: 'brightness(1.1)' }}
                onError={(e) => { (e.target as HTMLImageElement).src = endPolioLogo; }}
              />
            </div>
            {/* Redes Sociales */}
            <div className="pt-4">
               <div className="flex items-center gap-4">
                  <a href="#" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all border border-white/5">
                    <Twitter className="w-5 h-5 fill-white" />
                  </a>
                  {/* Keep other icons hidden if not set, or show placeholders if version requires it */}
               </div>
            </div>
          </div>

          {/* Links de Interés */}
          <div className="md:pl-6">
            <h3 className="font-bold text-lg mb-6 tracking-tight">Links de Interés</h3>
            <ul className="space-y-3 text-[13px] font-medium text-white/80">
              <li><a href="#/quienes-somos" className="hover:text-yellow-400 transition-colors">Acerca de Rotary</a></li>
              <li><a href="#/nuestra-historia" className="hover:text-yellow-400 transition-colors">Historia de Rotary LATIR</a></li>
              <li><a href="#/la-fundacion-rotaria" className="hover:text-yellow-400 transition-colors">La Fundación Rotaria</a></li>
              <li><a href="#/intercambio-jovenes" className="hover:text-yellow-400 transition-colors">Programa de Intercambios de Rotary</a></li>
              <li><a href="https://my.rotary.org" target="_blank" rel="noopener noreferrer" className="hover:text-yellow-400 transition-colors">My Rotary</a></li>
              <li><a href="#/eventos" className="hover:text-yellow-400 transition-colors">Nuestros Eventos</a></li>
              <li><a href="#/blog" className="hover:text-yellow-400 transition-colors">Novedades</a></li>
              <li><a href="#/descargas" className="hover:text-yellow-400 transition-colors font-bold text-yellow-500">Centro de Descargas</a></li>
              <li><a href="#/contacto" className="hover:text-yellow-400 transition-colors">Contacto</a></li>
            </ul>
          </div>

          {/* Realiza una Acción */}
          <div>
            <h3 className="font-bold text-lg mb-6 tracking-tight">Realiza una Acción</h3>
            <ul className="space-y-4 text-[13px] font-medium text-white/80">
              <li className="flex items-center gap-2">
                <span className="text-yellow-500 text-lg select-none">•</span>
                <a href="#" className="hover:text-yellow-400 transition-colors">Aporte Voluntario</a>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-yellow-500 text-lg select-none">•</span>
                <a href="#" className="hover:text-yellow-400 transition-colors">Comunícate con nosotros</a>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-yellow-500 text-lg select-none">•</span>
                <a href="https://rotary.org" target="_blank" rel="noopener noreferrer" className="hover:text-yellow-400 transition-colors">Rotary.org</a>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-yellow-500 text-lg select-none">•</span>
                <a href="https://endpolio.org" target="_blank" rel="noopener noreferrer" className="hover:text-yellow-400 transition-colors">Pongamos Fin a la Polio</a>
              </li>
            </ul>
          </div>

          {/* Newsletter */}
          <div>
            <h3 className="font-bold text-lg mb-6 tracking-tight">Suscríbete a nuestro Newsletter</h3>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="Dirección de email"
                className="bg-white/10 border-transparent text-white placeholder:text-white/50 flex-1 h-12"
              />
              <Button className="bg-[#FAA51A] hover:bg-[#ffb732] text-[#0C3C7C] font-black h-12 px-5 text-xl">
                →
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-white/50 text-[11px] leading-loose no-uppercase">
              © {new Date().getFullYear()} {club.name}. Texto de prueba en minúsculas. | Powered by{' '}
              <a href="https://valkomen.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Valkomen</a>
              {' · '}
              <a href="https://my.rotary.org/privacy-policy" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Privacidad</a>
              {' · '}
              <a href="https://my.rotary.org/terms-of-use" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Términos</a>
            </div>
            <div className="flex items-center gap-4">
                <Twitter className="w-4 h-4 text-white/30 hover:text-white transition-colors" />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
