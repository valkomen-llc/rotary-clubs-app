import { useState, useRef, useEffect } from 'react';
import { Search, ShoppingCart, ChevronDown, Menu, X, LogIn } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const languages = [
  { code: 'DE', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'EN', name: 'English', flag: '🇺🇸' },
  { code: 'ES', name: 'Español', flag: '🇪🇸' },
  { code: 'FR', name: 'Français', flag: '🇫🇷' },
  { code: 'IT', name: 'Italiano', flag: '🇮🇹' },
  { code: 'JA', name: '日本語', flag: '🇯🇵' },
  { code: 'KO', name: '한국어', flag: '🇰🇷' },
  { code: 'PT', name: 'Português', flag: '🇧🇷' },
];

const Navbar = () => {
  const { login, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sobreNosotrosOpen, setSobreNosotrosOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState(languages[2]); // Español por defecto
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const sobreNosotrosRef = useRef<HTMLDivElement>(null);
  const languageRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sobreNosotrosRef.current && !sobreNosotrosRef.current.contains(event.target as Node)) {
        setSobreNosotrosOpen(false);
      }
      if (languageRef.current && !languageRef.current.contains(event.target as Node)) {
        setLanguageOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001/api'}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Login failed');

      login(data.token, data.user);
      setLoginModalOpen(false);
      if (data.user.role === 'administrator') {
        navigate('/admin/dashboard');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const sobreNosotrosItems = [
    { label: 'Quienes Somos', href: '/quienes-somos' },
    { label: 'Nuestras Causas', href: '/nuestras-causas' },
    { label: 'Maneras de contribuir', href: '/maneras-de-contribuir' },
    { label: 'Nuestra Historia', href: '/nuestra-historia' },
    { label: 'Nuestros Socios', href: '/nuestros-socios' },
    { label: 'Nuestra Junta Directiva', href: '/nuestra-junta-directiva' },
    { label: 'Programa de Intercambios', href: '/intercambio-jovenes' },
    { label: 'Rotaract', href: '/rotaract' },
    { label: 'Interact', href: '/interact' },
    { label: 'La Fundación Rotaria', href: '/la-fundacion-rotaria' },
    { label: 'Estados Financieros', href: '/estados-financieros' }
  ];

  return (
    <nav className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="relative w-10 h-10">
              <svg viewBox="0 0 100 100" className="w-full h-full">
                <circle cx="50" cy="50" r="45" fill="none" stroke="hsl(210 100% 25%)" strokeWidth="3" />
                <circle cx="50" cy="50" r="15" fill="hsl(210 100% 25%)" />
                <path d="M50 5 L50 35 M50 65 L50 95 M5 50 L35 50 M65 50 L95 50" stroke="hsl(210 100% 25%)" strokeWidth="3" />
                <path d="M22 22 L43 43 M57 57 L78 78 M78 22 L57 43 M43 57 L22 78" stroke="#F5A623" strokeWidth="3" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-rotary-blue font-bold text-sm leading-tight">Rotary</span>
              <span className="text-rotary-blue text-xs leading-tight">Club</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6">
            <Link to="/" className="text-rotary-blue font-bold text-sm hover:text-rotary-gold transition-colors">Inicio</Link>



            {/* Sobre Nosotros Dropdown */}
            <div className="relative" ref={sobreNosotrosRef}>
              <button
                onClick={() => setSobreNosotrosOpen(!sobreNosotrosOpen)}
                className="flex items-center text-gray-600 font-bold text-sm hover:text-rotary-blue transition-colors"
              >
                Sobre Nosotros <ChevronDown className={`w-4 h-4 ml-1 transition-transform ${sobreNosotrosOpen ? 'rotate-180' : ''}`} />
              </button>
              {sobreNosotrosOpen && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-100 py-2 z-50">
                  {sobreNosotrosItems.map((item, index) => (
                    <Link
                      key={index}
                      to={item.href}
                      className="flex items-center justify-between px-4 py-2 text-sm text-gray-700 hover:bg-sky-50 hover:text-rotary-blue transition-colors"
                      onClick={() => setSobreNosotrosOpen(false)}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <Link to="/proyectos" className="text-gray-600 font-bold text-sm hover:text-rotary-blue transition-colors">Proyectos</Link>
            <Link to="/blog" className="text-gray-600 font-bold text-sm hover:text-rotary-blue transition-colors">Noticias</Link>
            <Link to="/contacto" className="text-gray-600 font-bold text-sm hover:text-rotary-blue transition-colors">Contacto</Link>
          </div>

          {/* Right Side Icons */}
          <div className="flex items-center space-x-4">
            <button className="text-gray-600 hover:text-rotary-blue transition-colors">
              <Search className="w-5 h-5" />
            </button>
            <button className="text-gray-600 hover:text-rotary-blue transition-colors">
              <ShoppingCart className="w-5 h-5" />
            </button>
            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                <Link to="/admin/dashboard" className="text-rotary-blue font-medium text-sm hover:text-rotary-gold transition-colors">
                  Panel
                </Link>
                <button onClick={logout} className="text-gray-600 hover:text-red-500 transition-colors text-sm">Salir</button>
              </div>
            ) : (
              <button
                onClick={() => setLoginModalOpen(true)}
                className="hidden sm:block text-rotary-blue font-bold text-sm hover:text-rotary-gold transition-colors"
              >
                Ingresar
              </button>
            )}

            {/* Language Selector */}
            <div className="relative" ref={languageRef}>
              <button
                onClick={() => setLanguageOpen(!languageOpen)}
                className="flex items-center gap-2 px-3 py-1.5 border border-rotary-blue rounded-full text-sm text-rotary-blue hover:bg-sky-50 transition-colors"
              >
                <span className="text-lg">{currentLanguage.flag}</span>
                <span className="font-medium">{currentLanguage.code}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${languageOpen ? 'rotate-180' : ''}`} />
              </button>

              {languageOpen && (
                <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 py-2 z-50">
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => {
                        setCurrentLanguage(lang);
                        setLanguageOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-sky-50 transition-colors ${currentLanguage.code === lang.code ? 'text-rotary-blue font-medium' : 'text-gray-700'
                        }`}
                    >
                      <span className="text-lg">{lang.flag}</span>
                      <span>{lang.name}</span>
                      {currentLanguage.code === lang.code && (
                        <span className="ml-auto w-2 h-2 bg-rotary-blue rounded-full"></span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden text-gray-600"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t">
            <div className="flex flex-col space-y-3 font-bold">
              <Link to="/" className="text-rotary-blue" onClick={() => setMobileMenuOpen(false)}>Inicio</Link>


              {/* Sobre Nosotros en móvil */}
              <div className="pl-4 border-l-2 border-gray-200 space-y-2">
                <p className="text-xs text-gray-400 uppercase font-semibold">Sobre Nosotros</p>
                {sobreNosotrosItems.map((item, index) => (
                  <Link
                    key={index}
                    to={item.href}
                    className="block text-gray-600 text-sm"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>

              <Link to="/proyectos" className="text-gray-600" onClick={() => setMobileMenuOpen(false)}>Proyectos</Link>
              <Link to="/blog" className="text-gray-600" onClick={() => setMobileMenuOpen(false)}>Noticias</Link>
              <Link to="/contacto" className="text-gray-600" onClick={() => setMobileMenuOpen(false)}>Contacto</Link>
              {isAuthenticated ? (
                <Link to="/admin/dashboard" className="text-rotary-blue" onClick={() => setMobileMenuOpen(false)}>Panel</Link>
              ) : (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setLoginModalOpen(true);
                  }}
                  className="text-rotary-blue text-left"
                >
                  Ingresar
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Login Modal */}
      {loginModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-300">
            <div className="p-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-rotary-blue">Iniciar Sesión</h2>
                <button onClick={() => setLoginModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all"
                    placeholder="admin@rotary-platform.org"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all"
                    placeholder="••••••••"
                  />
                </div>

                {error && <p className="text-red-500 text-sm">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-rotary-blue hover:bg-rotary-blue/90 text-white font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2 mt-6"
                >
                  {loading ? 'Ingresando...' : <>Iniciar sesión <LogIn className="w-5 h-5" /></>}
                </button>

                <div className="relative my-8">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-100"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-400 font-medium italic">O continúa con</span>
                  </div>
                </div>

                <button
                  type="button"
                  className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors font-medium text-gray-700"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Google
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
