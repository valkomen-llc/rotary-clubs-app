import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, ShoppingCart, ChevronDown, Menu, X, LogIn } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useClub } from '../contexts/ClubContext';
import { useCart } from '../contexts/CartContext';
import { useLang, SUPPORTED_LANGUAGES } from '../contexts/LanguageContext';
import { T } from '../components/T';
import CartDrawer from '../components/ui/CartDrawer';

// Map Navbar language list to SUPPORTED_LANGUAGES (already defined in LanguageContext)
// kept for reference — we now use SUPPORTED_LANGUAGES from context

const Navbar = () => {
  const { club } = useClub();
  const { itemCount, setCartOpen } = useCart();
  const { login, logout, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sobreNosotrosOpen, setSobreNosotrosOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const { lang, setLang } = useLang();
  const currentLanguage = SUPPORTED_LANGUAGES.find(l => l.code === lang) || SUPPORTED_LANGUAGES[0];
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Determine if it's a district site
  const currentHostname = window.location.hostname;
  const currentParams = window.location.search;
  const isDistrict = (club as any)?.type === 'district' || currentHostname.includes('4271') || currentParams.includes('4271');

  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{posts: any[], projects: any[], events: any[]}>({ posts: [], projects: [], events: [] });
  const [searchLoading, setSearchLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  // Focus search input when overlay opens
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      setSearchQuery('');
      setSearchResults({ posts: [], projects: [], events: [] });
    }
  }, [searchOpen]);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults({ posts: [], projects: [], events: [] });
      return;
    }
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const API = import.meta.env.VITE_API_URL || '/api';
        const res = await fetch(`${API}/clubs/${club.id}/search?q=${encodeURIComponent(searchQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        }
      } catch {} finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, club.id]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/auth/login`, {
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
        <div className="flex items-center justify-between min-h-[4rem] py-2 cursor-default">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3">
            {club.logo ? (
              <div className="relative flex items-center" style={{ width: `${club.logoHeaderSize ?? 200}px`, maxWidth: '100%' }}>
                <img src={club.logo} alt={club.name} className="w-full h-auto max-h-[100px] object-contain object-left" />
              </div>
            ) : (
              <>
                <div className="w-10 h-10">
                  <svg viewBox="0 0 100 100" className="w-full h-full">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="hsl(210 100% 25%)" strokeWidth="3" />
                    <circle cx="50" cy="50" r="15" fill="hsl(210 100% 25%)" />
                    <path d="M50 5 L50 35 M50 65 L50 95 M5 50 L35 50 M65 50 L95 50" stroke="hsl(210 100% 25%)" strokeWidth="3" />
                    <path d="M22 22 L43 43 M57 57 L78 78 M78 22 L57 43 M43 57 L22 78" stroke="#F5A623" strokeWidth="3" />
                  </svg>
                </div>
                <div className="flex flex-col">
                  <span className="text-rotary-blue font-bold text-sm leading-tight">Rotary Club</span>
                  <span className="text-rotary-blue text-xs leading-tight">{club.name.replace(/^Rotary Club\s+/i, '')}</span>
                </div>
              </>
            )}
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6">
            <Link to="/" className="text-rotary-blue font-medium text-sm hover:text-rotary-gold transition-colors"><T>Inicio</T></Link>

            {(club as any)?.type === 'association' ? (
              <>
                <Link to="/quienes-somos" className="text-gray-600 font-medium text-sm hover:text-rotary-blue transition-colors"><T>Sobre Rotary</T></Link>
                <Link to="/intercambio-jovenes" className="text-gray-600 font-medium text-sm hover:text-rotary-blue transition-colors"><T>Intercambios</T></Link>
                <Link to="/rotex" className="text-gray-600 font-medium text-sm hover:text-rotary-blue transition-colors"><T>Rotex</T></Link>
                <Link to="/eventos" className="text-gray-600 font-medium text-sm hover:text-rotary-blue transition-colors"><T>Eventos</T></Link>
                <Link to="/blog" className="text-gray-600 font-medium text-sm hover:text-rotary-blue transition-colors"><T>Noticias</T></Link>
              </>
            ) : !isDistrict && (
              <>
                {/* Sobre Nosotros Dropdown */}
                <div className="relative" ref={sobreNosotrosRef}>
                  <button
                    onClick={() => setSobreNosotrosOpen(!sobreNosotrosOpen)}
                    className="flex items-center text-gray-600 font-medium text-sm hover:text-rotary-blue transition-colors"
                  >
                    <T>Sobre Nosotros</T> <ChevronDown className={`w-4 h-4 ml-1 transition-transform ${sobreNosotrosOpen ? 'rotate-180' : ''}`} />
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

                <Link to="/proyectos" className="text-gray-600 font-medium text-sm hover:text-rotary-blue transition-colors"><T>Proyectos</T></Link>
                <Link to="/blog" className="text-gray-600 font-medium text-sm hover:text-rotary-blue transition-colors"><T>Noticias</T></Link>

                {(club.eventsCount && club.eventsCount > 0) ? (
                  <Link to="/eventos" className="text-gray-600 font-medium text-sm hover:text-rotary-blue transition-colors"><T>Eventos</T></Link>
                ) : null}

                {club.storeActive ? (
                  <Link to="/shop" className="text-rotary-blue font-bold text-sm tracking-wide bg-rotary-blue/5 px-4 py-1.5 rounded-full hover:bg-rotary-blue/10 transition-colors">Tienda</Link>
                ) : null}
              </>
            )}


            <Link to="/contacto" className="text-gray-600 font-medium text-sm hover:text-rotary-blue transition-colors"><T>Contacto</T></Link>
          </div>

          {/* Right Side Icons */}
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setSearchOpen(true)}
              className="text-gray-600 hover:text-rotary-blue transition-colors"
            >
              <Search className="w-[18px] h-[18px]" strokeWidth={2} />
            </button>
            {club.storeActive && (
              <button
                onClick={() => setCartOpen(true)}
                className="text-gray-600 hover:text-rotary-blue transition-colors relative"
              >
                <ShoppingCart className="w-[18px] h-[18px]" strokeWidth={2} />
                {itemCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
                    {itemCount}
                  </span>
                )}
              </button>
            )}
            {isAuthenticated ? (
              <div
                className="relative"
                onMouseEnter={() => setUserMenuOpen(true)}
                onMouseLeave={() => setUserMenuOpen(false)}
              >
                {/* Avatar Button */}
                <button className="flex items-center justify-center w-8 h-8 rounded-full bg-rotary-blue text-white font-bold text-xs shadow-sm hover:bg-rotary-blue/90 transition-all ring-2 ring-white hover:ring-rotary-gold" title="Perfil">
                  {user?.name ? user.name.charAt(0).toUpperCase() : user?.email?.charAt(0).toUpperCase() ?? '?'}
                </button>

                {/* Dropdown */}
                {userMenuOpen && (
                  <div className="absolute right-0 top-full pt-2 w-52 z-50">
                    <div className="bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden">
                      {/* User info header */}
                      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                        <p className="text-xs font-bold text-gray-800 truncate">{user?.name || 'Usuario'}</p>
                        <p className="text-[11px] text-gray-400 truncate">{user?.email}</p>
                      </div>
                      {/* Actions */}
                      <div className="py-1">
                        <Link
                          to="/admin/dashboard"
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-sky-50 hover:text-rotary-blue transition-colors"
                          onClick={() => setUserMenuOpen(false)}
                        >
                          <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0"></span>
                          Panel de Control
                        </Link>
                        <button
                          onClick={() => { logout(); setUserMenuOpen(false); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0"></span>
                          Cerrar Sesión
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setLoginModalOpen(true)}
                className="hidden sm:flex items-center justify-center w-8 h-8 rounded-full bg-gray-50 text-rotary-blue border border-gray-200 hover:bg-rotary-blue hover:text-white transition-all"
                title="Iniciar sesión"
              >
                <LogIn className="w-4 h-4 ml-0.5" />
              </button>
            )}

            {/* Language Selector */}
            <div className="relative" ref={languageRef} data-no-translate>
              <button
                onClick={() => setLanguageOpen(!languageOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1 border border-rotary-blue rounded-full text-xs text-rotary-blue hover:bg-sky-50 transition-colors"
              >
                <span className="text-base leading-none">{currentLanguage.flag}</span>
                <span className="font-semibold tracking-wide">{currentLanguage.code.toUpperCase()}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${languageOpen ? 'rotate-180' : ''}`} />
              </button>

              {languageOpen && (
                <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 py-2 z-50">
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => { setLang(l.code); setLanguageOpen(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-sky-50 transition-colors ${currentLanguage.code === l.code ? 'text-rotary-blue font-medium' : 'text-gray-700'}`}
                    >
                      <span className="text-lg">{l.flag}</span>
                      <span>{l.name}</span>
                      {currentLanguage.code === l.code && (
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
            <div className="flex flex-col space-y-3 font-medium">
              <Link to="/" className="text-rotary-blue" onClick={() => setMobileMenuOpen(false)}>Inicio</Link>

              {(club as any)?.type === 'association' ? (
                <>
                  <Link to="/quienes-somos" className="text-gray-600" onClick={() => setMobileMenuOpen(false)}>Sobre Rotary</Link>
                  <Link to="/intercambio-jovenes" className="text-gray-600" onClick={() => setMobileMenuOpen(false)}>Intercambios</Link>
                  <Link to="/rotex" className="text-gray-600" onClick={() => setMobileMenuOpen(false)}>Rotex</Link>
                  <Link to="/eventos" className="text-gray-600" onClick={() => setMobileMenuOpen(false)}>Eventos</Link>
                  <Link to="/blog" className="text-gray-600" onClick={() => setMobileMenuOpen(false)}>Noticias</Link>
                </>
              ) : !isDistrict && (
                <>
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

                  {(club.eventsCount && club.eventsCount > 0) ? (
                    <Link to="/eventos" className="text-gray-600" onClick={() => setMobileMenuOpen(false)}>Eventos</Link>
                  ) : null}

                  {club.storeActive ? (
                    <Link to="/shop" className="text-rotary-blue font-bold" onClick={() => setMobileMenuOpen(false)}>Tienda</Link>
                  ) : null}
                </>
              )}

              <Link to="/contacto" className="text-gray-600" onClick={() => setMobileMenuOpen(false)}>Contacto</Link>
              {isAuthenticated ? (
                <Link to="/admin/dashboard" className="text-rotary-blue" onClick={() => setMobileMenuOpen(false)}>Panel</Link>
              ) : (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setLoginModalOpen(true);
                  }}
                  className="flex items-center gap-2 text-rotary-blue text-left"
                >
                  <LogIn className="w-4.5 h-4.5" /> Ingresar
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

      {/* Search Overlay */}
      {searchOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[10vh]" onClick={() => setSearchOpen(false)}>
          <div
            className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
              <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Buscar noticias, proyectos, eventos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setSearchOpen(false); }}
                className="flex-1 text-lg outline-none placeholder-gray-300"
                autoFocus
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              )}
              <kbd className="hidden sm:inline-block text-[10px] text-gray-300 border border-gray-200 rounded px-1.5 py-0.5 font-mono">ESC</kbd>
            </div>

            {/* Results */}
            <div className="max-h-[60vh] overflow-y-auto">
              {searchLoading && (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 border-2 border-gray-200 border-t-rotary-blue rounded-full animate-spin" />
                </div>
              )}

              {!searchLoading && searchQuery.trim().length >= 2 && (
                <>
                  {searchResults.posts.length === 0 && searchResults.projects.length === 0 && searchResults.events.length === 0 ? (
                    <div className="py-12 text-center">
                      <Search className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                      <p className="text-gray-400">No se encontraron resultados para "<strong>{searchQuery}</strong>"</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {/* Posts */}
                      {searchResults.posts.length > 0 && (
                        <div className="px-5 py-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Noticias</p>
                          {searchResults.posts.map((post: any) => (
                            <Link
                              key={post.id}
                              to={`/noticias/${post.id}`}
                              onClick={() => setSearchOpen(false)}
                              className="flex items-center gap-3 py-2.5 px-3 -mx-3 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              {post.coverImage && (
                                <img src={post.coverImage} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-800 truncate">{post.title}</p>
                                {post.excerpt && <p className="text-xs text-gray-400 truncate">{post.excerpt}</p>}
                              </div>
                            </Link>
                          ))}
                        </div>
                      )}
                      {/* Projects */}
                      {searchResults.projects.length > 0 && (
                        <div className="px-5 py-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Proyectos</p>
                          {searchResults.projects.map((proj: any) => (
                            <Link
                              key={proj.id}
                              to={`/proyectos/${proj.id}`}
                              onClick={() => setSearchOpen(false)}
                              className="flex items-center gap-3 py-2.5 px-3 -mx-3 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              {proj.coverImage && (
                                <img src={proj.coverImage} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-800 truncate">{proj.title}</p>
                                {proj.description && <p className="text-xs text-gray-400 truncate">{proj.description}</p>}
                              </div>
                            </Link>
                          ))}
                        </div>
                      )}
                      {/* Events */}
                      {searchResults.events.length > 0 && (
                        <div className="px-5 py-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Eventos</p>
                          {searchResults.events.map((ev: any) => (
                            <Link
                              key={ev.id}
                              to={`/calendario`}
                              onClick={() => setSearchOpen(false)}
                              className="flex items-center gap-3 py-2.5 px-3 -mx-3 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              <div className="w-10 h-10 rounded-lg bg-rotary-blue/10 flex items-center justify-center flex-shrink-0">
                                <span className="text-xs font-bold text-rotary-blue">
                                  {ev.startDate ? new Date(ev.startDate).getDate() : '?'}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-800 truncate">{ev.title}</p>
                                {ev.location && <p className="text-xs text-gray-400 truncate">{ev.location}</p>}
                              </div>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {!searchLoading && searchQuery.trim().length < 2 && (
                <div className="py-10 text-center">
                  <Search className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-300">Escribe al menos 2 caracteres para buscar</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <CartDrawer />
    </nav>
  );
};

export default Navbar;
