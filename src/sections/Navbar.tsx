import { useState, useRef, useEffect } from 'react';
import { Search, ShoppingCart, ChevronDown, Menu, X, LogIn, Globe, ExternalLink } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useClub } from '../contexts/ClubContext';
import { useCart } from '../contexts/CartContext';
import { useLang, SUPPORTED_LANGUAGES, orderLanguages } from '../contexts/LanguageContext';
import { pickLocalizedAsset } from '../lib/audienceAssets';
import { T } from '../components/T';
import CartDrawer from '../components/ui/CartDrawer';
import { SPECIAL_CATEGORIES, memberHasCategory } from '../lib/memberCategories';
import { hasEditableHome } from '../lib/entityTypes';
import { headerCtaDefaults, resolveCtaUrl, isProjectFairCta, showProjectFairCta, ctaTarget, PROJECT_FAIR_PORTAL_PATH, PROJECT_FAIR_PORTAL_TOKEN_KEY as PORTAL_TOKEN_KEY } from '../lib/ctaLinks';
import { CTA_SOFT, CTA_SOLID, ctaSkin } from '../lib/ctaStyles';
// Tercera identidad del sitio: quien consulta su inscripción a un evento.
import { ATTENDEE_TOKEN_KEY } from '../pages/MiInscripcion';
// El mismo resolvedor que usa la ficha del evento: el idioma activo decide
// qué registro se ofrece (regla durable del módulo, v4.652).
import { useEventCta } from '../components/EventRegistrationCta';
import { useProjectFairLink } from '../lib/useProjectFairLink';
import { useAttendeeLink } from '../lib/useAttendeeLink';
import { onOpenLoginModal, emitLoginSuccess } from '../lib/loginModal';
// Las tres identidades del sitio, tal como las ve el encabezado (v4.693).
import { useSiteSessions, closeAllSessions, initialsOf } from '../lib/siteSession';
import { useVisitorCountry } from '../hooks/useVisitorCountry';

// El ingreso con Google todavía no tiene flujo: el botón no llevaba ningún
// manejador, así que no hacía nada. Se oculta hasta implementar el OAuth
// (/api/auth/google/start + callback que verifica el id_token en el servidor);
// entonces converge en la misma resolución de rol que el ingreso con
// contraseña y basta poner esto en true.
const GOOGLE_LOGIN_ENABLED = false;

// Map Navbar language list to SUPPORTED_LANGUAGES (already defined in LanguageContext)
// kept for reference — we now use SUPPORTED_LANGUAGES from context

const Navbar = () => {
  const { club, bannerVisible } = useClub();
  const { itemCount, setCartOpen } = useCart();
  const { login, logout, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sobreNosotrosOpen, setSobreNosotrosOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const { lang, languageChosen, setLang, applyDefaultLanguage } = useLang();

  // El logo lleva texto rotulado, así que tiene idioma. Sigue al IDIOMA ACTIVO
  // del sitio —no al país—, igual que los botones de registro desde v4.652:
  // español de Colombia usa `logo`; los otros siete idiomas usan `logoIntl`.
  // Si no se ha cargado la versión internacional se usa el de siempre, de modo
  // que los sitios que no configuran esto no cambian en nada.
  const headerLogo = pickLocalizedAsset(club.logo, (club as any)?.logoIntl, lang);
  const currentLanguage = SUPPORTED_LANGUAGES.find(l => l.code === lang) || SUPPORTED_LANGUAGES[0];
  // Idioma por defecto configurado en la identidad del sitio: va SIEMPRE de primero en el
  // listado y se aplica a los visitantes que aún no eligieron idioma.
  const defaultLanguage = (club as any)?.defaultLanguage as string | undefined;
  const languageList = orderLanguages(defaultLanguage);
  useEffect(() => { applyDefaultLanguage(defaultLanguage); }, [defaultLanguage, applyDefaultLanguage]);

  // Botones CTA de la cabecera, configurables por sitio (texto + enlace, con variante en Español).
  // Los labels personalizados se muestran literales; los defaults pasan por <T> para traducirse.
  // Comportamiento por idioma: en Español se usan el texto y el enlace en español (si se
  // configuraron); en los demás idiomas, los internacionales. Si falta uno, cae al otro; si no
  // hay ninguno personalizado, se usan los botones por defecto (Contribuye / Únete a un club).
  // v4.602 — En las Ferias de Proyectos el segundo botón es el de registro y
  // lleva a /registro-feria, la página con el panel de inscripción (cuenta
  // regresiva, precios y fecha de cierre) desde la que se abre el formulario.
  // Forma de los botones del encabezado. Está EXTRAÍDA a una constante porque el
  // botón de ingreso tiene que verse igual que los CTA —mismo alto, mismo radio—
  // y hasta v4.697 repetía sus clases por su cuenta: era un círculo de 32 px con
  // sólo un ícono, y los rotarios no reconocían que ahí se iniciaba sesión.
  // Duplicar estas clases otra vez volvería a permitir que se separen.
  const CTA_SHAPE = 'items-center justify-center gap-2 font-bold text-sm px-5 py-2.5 rounded-full transition-colors';
  // Los colores salen de `ctaStyles.ts` (v4.719): la misma pareja la usa la
  // ficha de un evento, y escritos aquí a mano se separaban en silencio.
  const CTA_CLASSES = [ctaSkin(CTA_SOLID), ctaSkin(CTA_SOFT)];
  const HEADER_CTA_DEFAULTS = headerCtaDefaults((club as any)?.type)
    .map((def, i) => ({ ...def, cls: CTA_CLASSES[i] }));
  const headerCtasCfg = Array.isArray((club as any)?.headerCtas) ? (club as any).headerCtas : [];
  const isEs = lang === 'es';
  const headerCtas = HEADER_CTA_DEFAULTS.map((def, i) => {
    const cfg = headerCtasCfg[i] || {};
    const intlLabel = String(cfg.label || '').trim();   // internacional / otros idiomas
    const esLabel = String(cfg.labelEs || '').trim();   // Español
    const intlUrl = String(cfg.url || '').trim();
    const esUrl = String(cfg.urlEs || '').trim();
    const hasCustom = !!intlLabel || !!esLabel;
    const customLabel = isEs ? (esLabel || intlLabel) : (intlLabel || esLabel);
    const customUrl = isEs ? (esUrl || intlUrl) : (intlUrl || esUrl);
    // resolveCtaUrl: un enlace configurado hacia el formulario de inscripción
    // de una edición anterior se redirige al formulario interno.
    return {
      label: hasCustom ? customLabel : def.label,
      isCustomLabel: hasCustom,
      url: resolveCtaUrl(customUrl) || def.url,
      cls: def.cls,
      // ¿El administrador escribió texto / enlace para el idioma activo? Se
      // miran POR SEPARADO: quien pone sólo el texto en Español debe seguir
      // yendo al formulario que le toca por idioma, no al que quedó escrito.
      labelSetForLang: isEs ? !!esLabel : !!intlLabel,
      urlSetForLang: isEs ? !!esUrl : !!intlUrl,
      // Todas las variantes de texto: el filtro de audiencia reconoce el botón
      // de postulación por enlace O por texto (si el enlace fue personalizado).
      labels: [intlLabel, esLabel, def.label],
    };
  });

  // ── El botón de inscripción sigue al idioma (v4.660) ──────────────
  //
  // Un botón del encabezado configurado hacia el registro de un evento
  // —"/eventos/valledupar2027/registro?categoria=…"— llevaba el texto y la
  // categoría que el administrador escribió UNA vez, así que un visitante con
  // el sitio en Español veía "International Registration" y aterrizaba en el
  // formulario internacional. Contradecía la regla del módulo: manda el idioma
  // activo, no lo que se dejó escrito.
  //
  // Ahora, cuando el botón apunta al registro de un evento, su texto y su
  // destino los resuelve el servidor con el idioma activo, igual que en la
  // ficha. Si el administrador SÍ configuró el texto o el enlace para este
  // idioma, su decisión manda y no se toca nada.
  const eventRegistrationRef = (() => {
    for (const cta of headerCtas) {
      const m = /\/eventos\/([^/?#]+)\/registro/.exec(cta.url || '');
      if (m) return decodeURIComponent(m[1]);
    }
    return undefined;
  })();
  const { cta: headerEventCta } = useEventCta(
    eventRegistrationRef ? (club as any)?.id : undefined, eventRegistrationRef, lang);

  const withLanguageAwareRegistration = (cta: typeof headerCtas[number]) => {
    const primary = headerEventCta?.primary;
    if (!primary || !eventRegistrationRef) return cta;
    if (!/\/eventos\/[^/?#]+\/registro/.test(cta.url || '')) return cta;
    return {
      ...cta,
      // El texto escrito para ESTE idioma manda; si no hay, el del servidor,
      // que ya viene en el idioma activo (y por eso no se vuelve a traducir).
      label: cta.labelSetForLang ? cta.label : primary.label,
      isCustomLabel: cta.labelSetForLang ? cta.isCustomLabel : true,
      // Igual con el destino: sólo se respeta el escrito si es para este idioma.
      url: cta.urlSetForLang ? cta.url : `/eventos/${eventRegistrationRef}${primary.href}`,
    };
  };

  // v4.596 — Audiencia del botón que lleva al formulario de postulación:
  // visible en Español; oculto si el visitante ELIGIÓ otro idioma (su
  // preferencia manda sobre el país); y si no eligió idioma, decide la IP.
  // El país sólo se consulta cuando puede cambiar algo, y mientras se resuelve
  // el botón no se pinta para que no aparezca y desaparezca.
  const isFormCta = (cta: { url: string; labels: string[] }) => isProjectFairCta({ url: cta.url, labels: cta.labels });
  const hasProjectFairCta = headerCtas.some(isFormCta);
  const { country: visitorCountry, loading: countryLoading } =
    useVisitorCountry(hasProjectFairCta && !isEs && !languageChosen);
  const visibleHeaderCtas = headerCtas.filter(cta =>
    !isFormCta(cta) ||
    showProjectFairCta({ lang, languageChosen, country: countryLoading ? null : visitorCountry })
  );
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Un único formulario para las dos identidades del sitio. `mode` alterna
  // entre ingresar y recuperar la contraseña; `notice` explica por qué se
  // está pidiendo la sesión cuando la pide otra pantalla.
  const [loginMode, setLoginMode] = useState<'login' | 'forgot'>('login');
  const [loginNotice, setLoginNotice] = useState('');
  const [loginOk, setLoginOk] = useState('');
  const [afterLogin, setAfterLogin] = useState<string | null>(null);
  // Marcada, la sesión conserva la vigencia de siempre; desmarcada, el servidor
  // emite un token que vence el mismo día. Nace marcada porque eso es lo que ya
  // ocurría: la casilla sólo puede acortar la sesión, nunca alargarla.
  const [remember, setRemember] = useState(true);
  // ¿Este usuario también tiene un proyecto postulado? Se consulta al servidor
  // por el correo de su sesión, así el atajo aparece siempre que corresponda y
  // no sólo justo después de iniciar sesión.
  const [justLinked, setJustLinked] = useState(false);
  const projectLink = useProjectFairLink(isAuthenticated);
  // Un postulante que no administra el sitio no tiene nada que hacer en el
  // panel administrativo: su acceso es el panel de su proyecto.
  const canManageSite = ['administrator', 'club_admin', 'district_admin', 'editor'].includes((user as any)?.role);

  // ── Quién está dentro (v4.693) ────────────────────────────────────
  // El encabezado conocía sólo la sesión de la plataforma, así que un Gestor
  // de Proyectos que salía de su panel veía el ícono de "Ingresar" y creía que
  // el sitio lo había echado: su token seguía guardado, pero nada lo decía.
  // `useSiteSessions` lee las tres identidades y el avatar aparece con
  // cualquiera de ellas.
  const sessions = useSiteSessions();
  const portalSession = sessions.find(s => s.realm === 'portal') || null;
  // Quien ya tenía una sesión abierta de ANTES de v4.711 no pasó por el
  // ingreso que abre las dos identidades. Se le descubre la del evento por su
  // correo, sin pedirle que cierre sesión y vuelva a entrar.
  useAttendeeLink(sessions.length > 0 && !sessions.some(s => s.realm === 'attendee'));
  const attendeeSession = sessions.find(s => s.realm === 'attendee') || null;
  // La de la plataforma manda si existe; si no, la primera que haya.
  const primarySession = sessions[0] || null;
  const signedIn = isAuthenticated || sessions.length > 0;
  const hasProjectPanel = projectLink.hasProject || justLinked || !!portalSession;
  const avatarName = (user as any)?.name || primarySession?.name || null;
  const avatarEmail = user?.email || primarySession?.email || '';
  const avatarOrg = primarySession?.realm === 'platform' ? null : primarySession?.org || null;
  // Rótulo del rol: con varias identidades abiertas es la única forma de saber
  // con cuál se está mirando el sitio.
  const avatarRole = isAuthenticated ? null : primarySession?.role || null;

  /** Salir del sitio cierra las tres identidades, no una de las tres. */
  const signOut = () => {
    closeAllSessions();
    logout();
    setJustLinked(false);
    setUserMenuOpen(false);
    setMobileMenuOpen(false);
    navigate('/');
  };

  // Determine if it's a district site
  const currentHostname = window.location.hostname;
  const currentParams = window.location.search;
  const isDistrict = (club as any)?.type === 'district' || currentHostname.includes('4271') || currentParams.includes('4271') || currentHostname.toLowerCase().startsWith('rye');

  // Menú personalizable para sitios Evento/Convención: cada sección puede activarse/desactivarse.
  const isEventSite = hasEditableHome((club as any)?.type);
  const navMenu = ((club as any)?.eventNavMenu || {}) as Record<string, boolean>;
  const showNav = (key: string) => !isEventSite || navMenu[key] !== false;
  // Ítems de menú adicionales (Evento/Convención): creados o tomados de secciones del sistema.
  const extraNav = (isEventSite ? ((club as any)?.eventNavExtra || []) : []) as { label: string; href: string; external?: boolean }[];
  // Sitios con navbar propia (distrito, asociación, intercambio/RYE): conservan su menú fijo
  // y NO usan el menú configurable.
  const hasCustomNav = isDistrict
    || (club as any)?.type === 'association'
    || (club as any)?.type === 'Programa de Intercambio'
    || currentHostname.toLowerCase().startsWith('rye');
  // Orden unificado del menú configurable: fijos + personalizados en el orden elegido.
  // Disponible para Clubes y sitios Evento/Convención (todo sitio con navbar estándar).
  const orderedNav = (!hasCustomNav ? ((club as any)?.eventNavOrder || []) : []) as { kind: 'fixed' | 'custom'; key?: string; label?: string; href?: string; external?: boolean; enabled?: boolean }[];
  const useOrderedNav = Array.isArray(orderedNav) && orderedNav.length > 0;

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

  /**
   * Prueba las credenciales en el panel del club (v4.619). Sólo se usa como
   * complemento cuando quien entró es un administrador del sitio que ADEMÁS
   * postuló un proyecto con esas mismas credenciales, para ofrecerle el atajo
   * en su menú sin sacarlo de su panel de control.
   */
  const tryProjectFairLogin = async (): Promise<boolean> => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/project-fair/portal/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, remember }),
      });
      const data = await res.json();
      if (res.ok && data?.token) {
        localStorage.setItem(PORTAL_TOKEN_KEY, data.token);
        emitLoginSuccess({ realm: 'portal' });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  /** Cierra el formulario y deja los campos limpios para la próxima vez. */
  const closeLoginModal = () => {
    setLoginModalOpen(false);
    setPassword('');
    setError(''); setLoginOk(''); setLoginNotice('');
    setLoginMode('login');
    setAfterLogin(null);
  };

  /**
   * ACCESO UNIFICADO (v4.627). Un solo envío a /auth/session: el servidor
   * averigua si esas credenciales son de un administrador del sitio, de un
   * Gestor de Proyectos o de un Asistente al Evento, emite el token que
   * corresponda y devuelve la ruta de destino ya calculada. Aquí no se decide
   * a dónde va cada rol.
   */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoginOk('');
    setLoading(true);

    try {
      if (loginMode === 'forgot') {
        // El correo puede pertenecer al panel del club o al del asistente a un
        // evento, y quien lo escribe no tiene por qué saber cuál es el suyo. Se
        // pregunta a los dos: cada uno responde el mismo mensaje genérico y
        // sólo envía el enlace si de verdad tiene esa cuenta.
        const api = import.meta.env.VITE_API_URL || '/api';
        const ask = (path: string) => fetch(`${api}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        }).then(r => r.json()).catch(() => null);

        const [fair] = await Promise.all([
          ask('/project-fair/portal/forgot'),
          ask('/event-registrations/portal/forgot'),
        ]);
        setLoginOk(fair?.message || 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.');
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/auth/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, remember }),
      });
      const data = await response.json();

      // La cuenta existe pero nunca eligió contraseña: se pasa a la pantalla
      // de recuperación con el correo puesto, en vez de dejarlo probando
      // credenciales que no van a funcionar.
      if (!response.ok && data?.needsPassword) {
        setLoginMode('forgot');
        setLoginNotice(data.error);
        return;
      }
      if (!response.ok) throw new Error(data?.error || 'Correo o contraseña incorrectos.');

      const target = afterLogin || data.redirect || '/';

      // TODAS las identidades que abren esas credenciales (v4.711). Un mismo
      // rotario puede tener proyecto Y asistencia al evento: se guardan las dos
      // sesiones, cada una en su llave, y el encabezado ofrece los dos paneles.
      // `sessions` es aditivo — un servidor anterior no lo manda y entonces se
      // usa la identidad de primer nivel, que es lo que había.
      const abiertas: any[] = Array.isArray(data.sessions) && data.sessions.length
        ? data.sessions
        : [data];

      let entroEnPlataforma = false;
      for (const s of abiertas) {
        if (s.realm === 'portal') {
          localStorage.setItem(PORTAL_TOKEN_KEY, s.token);
          setJustLinked(true);
        } else if (s.realm === 'attendee') {
          localStorage.setItem(ATTENDEE_TOKEN_KEY, s.token);
        } else {
          login(s.token, s.user);
          entroEnPlataforma = true;
        }
        emitLoginSuccess({ realm: s.realm });
      }

      closeLoginModal();

      if (entroEnPlataforma) {
        // Un administrador del sitio puede además haber postulado un proyecto
        // con OTRAS credenciales. Se consulta por su correo, sin sacarlo de su
        // panel de control.
        void tryProjectFairLogin().then(ok => setJustLinked(prev => prev || ok));
        if (data.warning) { navigate('/'); return; }
      }
      navigate(target);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Otra pantalla pide la sesión (p. ej. /mi-proyecto sin token): se abre ESTE
  // formulario, el único del sitio, en vez de que cada pantalla dibuje el suyo.
  useEffect(() => onOpenLoginModal(opts => {
    setError(''); setLoginOk('');
    setLoginNotice(opts.reason || '');
    setLoginMode(opts.mode || 'login');
    setAfterLogin(opts.next || null);
    if (opts.email) setEmail(opts.email);
    setLoginModalOpen(true);
  }), []);

  // Categorías especiales de socios (Honorarios / Gobernadores / Autores): cada
  // enlace aparece en el desplegable solo si el club tiene miembros de esa
  // categoría, y no está ocultada explícitamente desde el panel.
  const clubMembers = (((club as any)?.members) || []) as any[];
  const specialLinks = SPECIAL_CATEGORIES
    .filter(c => clubMembers.some(m => memberHasCategory(m, c.key)) && (club as any)?.[c.visibleField] !== false)
    .map(c => ({ label: c.label, href: c.href }));

  const sobreNosotrosItems = [
    { label: 'Quienes Somos', href: '/quienes-somos' },
    { label: 'Nuestras Causas', href: '/nuestras-causas' },
    { label: 'Maneras de contribuir', href: '/maneras-de-contribuir' },
    { label: 'Nuestra Historia', href: '/nuestra-historia' },
    { label: 'Nuestros Socios', href: '/nuestros-socios' },
    { label: 'Nuestra Junta Directiva', href: '/nuestra-junta-directiva' },
    ...specialLinks,
    { label: 'Programa de Intercambios', href: '/intercambio-jovenes' },
    { label: 'Rotaract', href: '/rotaract' },
    { label: 'Interact', href: '/interact' },
    { label: 'La Fundación Rotaria', href: '/la-fundacion-rotaria' },
    { label: 'Estados Financieros', href: '/estados-financieros' }
  ];

  // Render de un ítem fijo del menú en escritorio (para el orden unificado).
  const renderFixedDesktop = (key: string) => {
    switch (key) {
      case 'inicio':
        return <Link key="inicio" to="/" className="text-rotary-blue font-medium text-sm hover:text-rotary-gold transition-colors"><T>Inicio</T></Link>;
      case 'sobreNosotros':
        return (
          <div key="sobreNosotros" className="relative" ref={sobreNosotrosRef}>
            <button onClick={() => setSobreNosotrosOpen(!sobreNosotrosOpen)} className="flex items-center text-gray-600 font-medium text-sm hover:text-rotary-blue transition-colors">
              <T>Sobre Nosotros</T> <ChevronDown className={`w-4 h-4 ml-1 transition-transform ${sobreNosotrosOpen ? 'rotate-180' : ''}`} />
            </button>
            {sobreNosotrosOpen && (
              <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-100 py-2 z-50">
                {sobreNosotrosItems.map((item, index) => (
                  <Link key={index} to={item.href} className="flex items-center justify-between px-4 py-2 text-sm text-gray-700 hover:bg-sky-50 hover:text-rotary-blue transition-colors" onClick={() => setSobreNosotrosOpen(false)}>
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      case 'proyectos':
        return <Link key="proyectos" to="/proyectos" className="text-gray-600 font-medium text-sm hover:text-rotary-blue transition-colors"><T>Proyectos</T></Link>;
      case 'noticias':
        return <Link key="noticias" to="/blog" className="text-gray-600 font-medium text-sm hover:text-rotary-blue transition-colors"><T>Noticias</T></Link>;
      case 'eventos':
        return <Link key="eventos" to="/eventos" className="text-gray-600 font-medium text-sm hover:text-rotary-blue transition-colors"><T>Eventos</T></Link>;
      case 'contacto':
        return <Link key="contacto" to="/contacto" className="text-gray-600 font-medium text-sm hover:text-rotary-blue transition-colors"><T>Contacto</T></Link>;
      default:
        return null;
    }
  };

  // Render de un ítem fijo del menú en móvil (para el orden unificado).
  const renderFixedMobile = (key: string) => {
    switch (key) {
      case 'inicio':
        return <Link key="inicio" to="/" className="text-rotary-blue" onClick={() => setMobileMenuOpen(false)}>Inicio</Link>;
      case 'sobreNosotros':
        return (
          <div key="sobreNosotros" className="pl-4 border-l-2 border-gray-200 space-y-2">
            <p className="text-xs text-gray-400 uppercase font-semibold">Sobre Nosotros</p>
            {sobreNosotrosItems.map((item, index) => (
              <Link key={index} to={item.href} className="block text-gray-600 text-sm" onClick={() => setMobileMenuOpen(false)}>{item.label}</Link>
            ))}
          </div>
        );
      case 'proyectos':
        return <Link key="proyectos" to="/proyectos" className="text-gray-600" onClick={() => setMobileMenuOpen(false)}>Proyectos</Link>;
      case 'noticias':
        return <Link key="noticias" to="/blog" className="text-gray-600" onClick={() => setMobileMenuOpen(false)}>Noticias</Link>;
      case 'eventos':
        return <Link key="eventos" to="/eventos" className="text-gray-600" onClick={() => setMobileMenuOpen(false)}>Eventos</Link>;
      case 'contacto':
        return <Link key="contacto" to="/contacto" className="text-gray-600" onClick={() => setMobileMenuOpen(false)}>Contacto</Link>;
      default:
        return null;
    }
  };

  const renderCustomDesktop = (item: { label?: string; href?: string; external?: boolean }, idx: number) => (
    item.external
      ? <a key={`c-${idx}`} href={item.href} target="_blank" rel="noopener noreferrer" className="text-gray-600 font-medium text-sm hover:text-rotary-blue transition-colors">{item.label}</a>
      : <Link key={`c-${idx}`} to={item.href || '/'} className="text-gray-600 font-medium text-sm hover:text-rotary-blue transition-colors">{item.label}</Link>
  );
  const renderCustomMobile = (item: { label?: string; href?: string; external?: boolean }, idx: number) => (
    item.external
      ? <a key={`cm-${idx}`} href={item.href} target="_blank" rel="noopener noreferrer" className="text-gray-600" onClick={() => setMobileMenuOpen(false)}>{item.label}</a>
      : <Link key={`cm-${idx}`} to={item.href || '/'} className="text-gray-600" onClick={() => setMobileMenuOpen(false)}>{item.label}</Link>
  );

  const showBannerOffset = club?.expirationBannerActive && bannerVisible;

  return (
    <>
    {/* Barra superior estilo Rotary.org: enlaces externos + selector de idioma */}
    <div className="bg-[#28354b] text-white relative z-[60]" data-no-translate>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-end gap-6 sm:gap-8 py-4 text-sm">
          <a
            href="https://www.endpolio.org"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 font-bold text-white hover:text-white/80 transition-colors"
          >
            Endpolio.org <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <a
            href="https://my.rotary.org"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 font-bold text-white hover:text-white/80 transition-colors"
          >
            My Rotary <ExternalLink className="w-3.5 h-3.5" />
          </a>

          {/* Selector de idioma */}
          <div className="relative" ref={languageRef}>
            <button
              onClick={() => setLanguageOpen(!languageOpen)}
              className="flex items-center gap-1.5 font-bold text-white hover:text-white/80 transition-colors"
            >
              <Globe className="w-4 h-4" />
              <span>{currentLanguage.name}</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${languageOpen ? 'rotate-180' : ''}`} />
            </button>

            {languageOpen && (
              <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 py-2 z-[70]">
                {languageList.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => { setLang(l.code); setLanguageOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-1.5 text-sm hover:bg-sky-50 transition-colors ${currentLanguage.code === l.code ? 'text-rotary-blue font-medium' : 'text-gray-700'}`}
                  >
                    <div className="w-5 h-3.5 overflow-hidden rounded-sm flex-shrink-0 shadow-sm border border-black/5">
                      <img
                        src={`https://flagcdn.com/w40/${l.flag}.png`}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span>{l.name}</span>
                    {currentLanguage.code === l.code && (
                      <span className="ml-auto w-2 h-2 bg-rotary-blue rounded-full"></span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

    <nav className={`bg-white shadow-sm sticky ${showBannerOffset ? 'top-11' : 'top-0'} z-50 transition-all duration-300`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between min-h-[4rem] py-2 cursor-default">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3">
            {headerLogo ? (
              <div className="relative flex items-center" style={{ width: `${club.logoHeaderSize ?? 200}px`, maxWidth: '100%' }}>
                <img src={headerLogo} alt={club.name} className="w-full h-auto max-h-[100px] object-contain object-left" />
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
            {useOrderedNav && (
              <>
                {orderedNav.filter(i => i.enabled !== false).map((item, idx) => item.kind === 'custom' ? renderCustomDesktop(item, idx) : renderFixedDesktop(item.key || ''))}
                {club.storeActive && <Link to="/shop" className="text-rotary-blue font-bold text-sm tracking-wide bg-rotary-blue/5 px-4 py-1.5 rounded-full hover:bg-rotary-blue/10 transition-colors">Tienda</Link>}
              </>
            )}
            {!useOrderedNav && (<>
            {showNav('inicio') && <Link to="/" className="text-rotary-blue font-medium text-sm hover:text-rotary-gold transition-colors"><T>Inicio</T></Link>}

            {((club as any)?.type === 'association' || (club as any)?.type === 'Programa de Intercambio' || currentHostname.toLowerCase().startsWith('rye')) ? (
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
                {showNav('sobreNosotros') && (
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
                )}

                {showNav('proyectos') && <Link to="/proyectos" className="text-gray-600 font-medium text-sm hover:text-rotary-blue transition-colors"><T>Proyectos</T></Link>}
                {showNav('noticias') && <Link to="/blog" className="text-gray-600 font-medium text-sm hover:text-rotary-blue transition-colors"><T>Noticias</T></Link>}

                {(showNav('eventos') && (isEventSite || (club.eventsCount && club.eventsCount > 0))) ? (
                  <Link to="/eventos" className="text-gray-600 font-medium text-sm hover:text-rotary-blue transition-colors"><T>Eventos</T></Link>
                ) : null}

                {club.storeActive ? (
                  <Link to="/shop" className="text-rotary-blue font-bold text-sm tracking-wide bg-rotary-blue/5 px-4 py-1.5 rounded-full hover:bg-rotary-blue/10 transition-colors">Tienda</Link>
                ) : null}
              </>
            )}


            {showNav('contacto') && <Link to="/contacto" className="text-gray-600 font-medium text-sm hover:text-rotary-blue transition-colors"><T>Contacto</T></Link>}

            {/* Ítems adicionales del menú (Evento/Convención) */}
            {extraNav.map((it, i) => (
              it.external ? (
                <a key={`x-${i}`} href={it.href} target="_blank" rel="noopener noreferrer" className="text-gray-600 font-medium text-sm hover:text-rotary-blue transition-colors">{it.label}</a>
              ) : (
                <Link key={`x-${i}`} to={it.href} className="text-gray-600 font-medium text-sm hover:text-rotary-blue transition-colors">{it.label}</Link>
              )
            ))}
            </>)}
          </div>

          {/* Right Side Icons */}
          <div className="flex items-center space-x-4">
            {/* CTAs del header (configurables por sitio): default Contribuye + Únete a un club */}
            {visibleHeaderCtas.map(withLanguageAwareRegistration).map((cta, i) => {
              const cls = `hidden lg:inline-flex ${CTA_SHAPE} ${cta.cls}`;
              const content = cta.isCustomLabel ? cta.label : <T>{cta.label}</T>;
              // Un enlace al PROPIO sitio se navega en la misma pestaña,
              // aunque esté configurado con la dirección completa.
              const target = ctaTarget(cta.url);
              return target.external
                ? <a key={i} href={target.to} target="_blank" rel="noopener noreferrer" className={cls}>{content}</a>
                : <Link key={i} to={target.to} className={cls}>{content}</Link>;
            })}

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
            {signedIn ? (
              <div
                className="relative"
                onMouseEnter={() => setUserMenuOpen(true)}
                onMouseLeave={() => setUserMenuOpen(false)}
              >
                {/* Avatar Button */}
                <button className="flex items-center justify-center w-8 h-8 rounded-full bg-rotary-blue text-white font-bold text-xs shadow-sm hover:bg-rotary-blue/90 transition-all ring-2 ring-white hover:ring-rotary-gold" title={avatarEmail ? `Conectado como ${avatarEmail}` : 'Perfil'}>
                  {initialsOf({ name: avatarName, email: avatarEmail })}
                </button>

                {/* Dropdown */}
                {userMenuOpen && (
                  <div className="absolute right-0 top-full pt-2 w-56 z-50">
                    <div className="bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden">
                      {/* User info header */}
                      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                        <p className="text-xs font-bold text-gray-800 truncate">{avatarName || 'Usuario'}</p>
                        <p className="text-[11px] text-gray-400 truncate">{avatarEmail}</p>
                        {avatarOrg && <p className="text-[11px] text-gray-400 truncate">{avatarOrg}</p>}
                        {avatarRole && (
                          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-rotary-blue">{avatarRole}</p>
                        )}
                      </div>
                      {/* Actions */}
                      <div className="py-1">
{/* Quien postuló un proyecto entra primero a formularlo. Si además
                            administra el sitio, conserva debajo su panel de control;
                            si sólo es postulante, ese acceso no aparece. */}
                        {hasProjectPanel && (
                          <Link
                            to={PROJECT_FAIR_PORTAL_PATH}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-sky-50 hover:text-rotary-blue transition-colors"
                            onClick={() => setUserMenuOpen(false)}
                          >
                            <span className="w-2 h-2 rounded-full bg-sky-400 flex-shrink-0"></span>
                            Mi Proyecto
                          </Link>
                        )}
                        {/* La misma persona puede llevar los dos roles: gestiona
                            su proyecto y además asiste al evento. */}
                        {attendeeSession && (
                          <Link
                            to={attendeeSession.path}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-sky-50 hover:text-rotary-blue transition-colors"
                            onClick={() => setUserMenuOpen(false)}
                          >
                            <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0"></span>
                            {attendeeSession.menu}
                          </Link>
                        )}
                        {canManageSite && (
                          <Link
                            to="/admin/dashboard"
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-sky-50 hover:text-rotary-blue transition-colors"
                            onClick={() => setUserMenuOpen(false)}
                          >
                            <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0"></span>
                            Panel de Control
                          </Link>
                        )}
                        <button
                          onClick={signOut}
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
                /* `sm` y no `lg` como los CTA: entre md y lg el menú móvil ya no
                   se muestra (`md:hidden`), así que esconderlo hasta lg dejaría
                   esa franja sin ninguna forma de iniciar sesión.
                   El contorno va con `ring-inset` y no con `border`: un borde
                   sumaría 2 px al alto y el botón dejaría de alinear con los CTA. */
                className={`hidden sm:inline-flex ${CTA_SHAPE} bg-white text-rotary-blue ring-1 ring-inset ring-rotary-blue/25 hover:bg-rotary-blue hover:text-white hover:ring-rotary-blue`}
              >
                <LogIn className="w-4 h-4" />
                <T>Iniciar sesión</T>
              </button>
            )}

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
              {useOrderedNav && (
                <>
                  {orderedNav.filter(i => i.enabled !== false).map((item, idx) => item.kind === 'custom' ? renderCustomMobile(item, idx) : renderFixedMobile(item.key || ''))}
                  {club.storeActive && <Link to="/shop" className="text-rotary-blue font-bold" onClick={() => setMobileMenuOpen(false)}>Tienda</Link>}
                </>
              )}
              {!useOrderedNav && (<>
              {showNav('inicio') && <Link to="/" className="text-rotary-blue" onClick={() => setMobileMenuOpen(false)}>Inicio</Link>}

              {((club as any)?.type === 'association' || (club as any)?.type === 'Programa de Intercambio' || currentHostname.toLowerCase().startsWith('rye')) ? (
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
                  {showNav('sobreNosotros') && (
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
                  )}

                  {showNav('proyectos') && <Link to="/proyectos" className="text-gray-600" onClick={() => setMobileMenuOpen(false)}>Proyectos</Link>}
                  {showNav('noticias') && <Link to="/blog" className="text-gray-600" onClick={() => setMobileMenuOpen(false)}>Noticias</Link>}

                  {(showNav('eventos') && (isEventSite || (club.eventsCount && club.eventsCount > 0))) ? (
                    <Link to="/eventos" className="text-gray-600" onClick={() => setMobileMenuOpen(false)}>Eventos</Link>
                  ) : null}

                  {club.storeActive ? (
                    <Link to="/shop" className="text-rotary-blue font-bold" onClick={() => setMobileMenuOpen(false)}>Tienda</Link>
                  ) : null}
                </>
              )}

              {showNav('contacto') && <Link to="/contacto" className="text-gray-600" onClick={() => setMobileMenuOpen(false)}>Contacto</Link>}

              {/* Ítems adicionales del menú (Evento/Convención) */}
              {extraNav.map((it, i) => (
                it.external ? (
                  <a key={`xm-${i}`} href={it.href} target="_blank" rel="noopener noreferrer" className="text-gray-600" onClick={() => setMobileMenuOpen(false)}>{it.label}</a>
                ) : (
                  <Link key={`xm-${i}`} to={it.href} className="text-gray-600" onClick={() => setMobileMenuOpen(false)}>{it.label}</Link>
                )
              ))}
              </>)}

              {/* CTAs del header en móvil (configurables por sitio) */}
              <div className="flex flex-col gap-2 pt-2">
                {visibleHeaderCtas.map(withLanguageAwareRegistration).map((cta, i) => {
                  const cls = `inline-flex items-center justify-center font-bold text-sm px-5 py-2.5 rounded-full transition-colors ${cta.cls}`;
                  const content = cta.isCustomLabel ? cta.label : <T>{cta.label}</T>;
                  const close = () => setMobileMenuOpen(false);
                  const target = ctaTarget(cta.url);
                  return target.external
                    ? <a key={i} href={target.to} target="_blank" rel="noopener noreferrer" onClick={close} className={cls}>{content}</a>
                    : <Link key={i} to={target.to} onClick={close} className={cls}>{content}</Link>;
                })}
              </div>

              {signedIn ? (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 truncate">{avatarEmail}</p>
                  {hasProjectPanel && (
                    <Link to={PROJECT_FAIR_PORTAL_PATH} className="font-semibold text-rotary-blue" onClick={() => setMobileMenuOpen(false)}>Mi Proyecto</Link>
                  )}
                  {attendeeSession && (
                    <Link to={attendeeSession.path} className="font-semibold text-rotary-blue" onClick={() => setMobileMenuOpen(false)}>{attendeeSession.menu}</Link>
                  )}
                  {canManageSite && (
                    <Link to="/admin/dashboard" className="text-rotary-blue" onClick={() => setMobileMenuOpen(false)}>Panel</Link>
                  )}
                  <button onClick={signOut} className="text-left text-red-500">Cerrar sesión</button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setLoginModalOpen(true);
                  }}
                  className="flex items-center gap-2 text-rotary-blue text-left"
                >
                  <LogIn className="w-4.5 h-4.5" /> <T>Iniciar sesión</T>
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
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-2xl font-bold text-rotary-blue">
                  {loginMode === 'login' ? 'Iniciar Sesión' : 'Recupera tu acceso'}
                </h2>
                <button onClick={closeLoginModal} className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Un solo acceso para las dos identidades del sitio: quien
                  ingresa no tiene por qué saber cuál le corresponde. */}
              <p className="mb-6 text-sm text-gray-500">
                {loginMode === 'login'
                  ? 'Este es el acceso a todo el sitio. Ingresa con el correo y la contraseña que creaste al registrarte y te llevamos a tu espacio.'
                  : 'Escribe tu correo y te enviaremos un enlace para crear una contraseña nueva.'}
              </p>

              {loginNotice && (
                <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">{loginNotice}</p>
              )}
              {loginOk && (
                <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">{loginOk}</p>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all"
                    placeholder="tucorreo@club.org"
                  />
                </div>
                {loginMode === 'login' && (
                  <div>
                    <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                    <input
                      id="login-password"
                      name="password"
                      type="password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all"
                      placeholder="••••••••"
                    />
                  </div>
                )}

                {loginMode === 'login' && (
                  <label htmlFor="login-remember" className="flex cursor-pointer items-center gap-2 pt-1 text-sm text-gray-600">
                    <input
                      id="login-remember"
                      name="remember"
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="h-4 w-4 cursor-pointer rounded border-gray-300 text-rotary-blue focus:ring-rotary-blue"
                    />
                    Mantener la sesión iniciada en este dispositivo
                  </label>
                )}

                {error && <p className="text-red-500 text-sm">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-rotary-blue hover:bg-rotary-blue/90 text-white font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2 mt-6"
                >
                  {loading
                    ? (loginMode === 'login' ? 'Ingresando...' : 'Enviando...')
                    : loginMode === 'login'
                      ? <>Iniciar sesión <LogIn className="w-5 h-5" /></>
                      : 'Enviar enlace'}
                </button>

                <div className="text-center text-[13px]">
                  {loginMode === 'login' ? (
                    <button type="button" onClick={() => { setLoginMode('forgot'); setError(''); setLoginOk(''); }}
                      className="font-semibold text-gray-500 hover:text-gray-800">
                      Olvidé mi contraseña
                    </button>
                  ) : (
                    <button type="button" onClick={() => { setLoginMode('login'); setError(''); setLoginOk(''); setLoginNotice(''); }}
                      className="font-semibold text-gray-500 hover:text-gray-800">
                      Volver a ingresar
                    </button>
                  )}
                </div>

                {GOOGLE_LOGIN_ENABLED && loginMode === 'login' && (
                <>
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
                </>
                )}
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
                              to={`/proyectos/${proj.slug || proj.id}`}
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
    </>
  );
};

export default Navbar;
