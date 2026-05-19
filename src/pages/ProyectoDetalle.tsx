import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Heart, Users, MapPin, Calendar, Target,
  CheckCircle2, Facebook, Twitter, Linkedin, X, Loader2,
  Tag, FileText, BarChart2, ShieldCheck
} from 'lucide-react';
import { useState, useEffect } from 'react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useClub } from '../contexts/ClubContext';
import { motion, AnimatePresence } from 'framer-motion';

const API = import.meta.env.VITE_API_URL || '/api';

const formatShort = (value: number) => {
  if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(1) + 'B';
  if (value >= 1_000_000)     return (value / 1_000_000).toFixed(1) + 'M';
  if (value >= 1_000)         return (value / 1_000).toFixed(0) + 'K';
  return value.toString();
};

/** Limpia HTML y entidades para texto plano en resúmenes */
const stripHtml = (html: string) => {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
};

/** Convierte saltos de línea \n\n en párrafos HTML */
const textToHtml = (text: string) => {
  if (!text) return '';
  // Si ya tiene etiquetas HTML, devuelve tal cual
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  return text.split(/\n\n+/).map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('');
};

const ProyectoDetalle = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { club } = useClub();

  const [proyecto, setProyecto] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // v4.416 — Donación cableada al motor Stripe centralizado. Montos en USD para
  // consistency con Maneras de Contribuir (mezcla USD/COP rompería el cálculo
  // del balance unificado en la Bóveda).
  const [montoDonacion, setMontoDonacion] = useState<number>(50);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [donorEmail, setDonorEmail] = useState('');
  const [donorName, setDonorName] = useState('');
  const [donorMessage, setDonorMessage] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [donateSubmitting, setDonateSubmitting] = useState(false);
  const [donateError, setDonateError] = useState<string | null>(null);
  const [activeImg, setActiveImg] = useState(0);

  useEffect(() => { window.scrollTo(0, 0); }, [id]);

  useEffect(() => {
    if (!club?.id || !id) return;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API}/clubs/${club.id}/projects/${id}?_t=${Date.now()}`, {
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (!res.ok) { setError('Proyecto no encontrado'); return; }
        const data = await res.json();
        setProyecto(data);
      } catch {
        setError('Error al cargar el proyecto');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [club?.id, id]);

  // v4.420 — Redirect a URL amigable: si el proyecto tiene slug pero la URL
  // actual usa el UUID, navegamos al slug (replace para no romper back button).
  useEffect(() => {
    if (proyecto?.slug && id && proyecto.slug !== id && proyecto.id === id) {
      navigate(`/proyectos/${proyecto.slug}`, { replace: true });
    }
  }, [proyecto, id, navigate]);

  // v4.417 — Inyección de meta tags SEO. Reutiliza los campos seoTitle,
  // seoDescription, seoKeywords, seoImage del modelo Project. Fallback a los
  // genéricos (title, description, image) si no hay específicos.
  useEffect(() => {
    if (!proyecto) return;

    const seoTitle = proyecto.seoTitle || `${proyecto.title} | ${club?.name || 'Rotary'}`;
    const seoDescription = proyecto.seoDescription
      || (proyecto.description ? stripHtml(proyecto.description).slice(0, 160) : '');
    const seoImage = proyecto.seoImage || proyecto.image || club?.logo || '';
    const seoKeywords = proyecto.seoKeywords || proyecto.category || '';
    const canonicalPath = proyecto.slug ? `/proyectos/${proyecto.slug}` : `/proyectos/${proyecto.id}`;
    const canonicalUrl = `${window.location.origin}${canonicalPath}`;
    const noIndex = proyecto.indexable === false;

    document.title = seoTitle;

    const upsertMeta = (selector: string, attrs: Record<string, string>) => {
      let tag = document.querySelector(selector) as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement('meta');
        Object.entries(attrs).forEach(([k, v]) => k !== 'content' && tag!.setAttribute(k, v));
        document.head.appendChild(tag);
      }
      if (attrs.content !== undefined) tag.setAttribute('content', attrs.content);
    };

    upsertMeta('meta[name="description"]', { name: 'description', content: seoDescription });
    if (seoKeywords) upsertMeta('meta[name="keywords"]', { name: 'keywords', content: seoKeywords });
    upsertMeta('meta[name="robots"]', { name: 'robots', content: noIndex ? 'noindex, nofollow' : 'index, follow' });

    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: seoTitle });
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: seoDescription });
    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'article' });
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonicalUrl });
    if (seoImage) upsertMeta('meta[property="og:image"]', { property: 'og:image', content: seoImage });

    upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: seoTitle });
    upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: seoDescription });
    if (seoImage) upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: seoImage });

    let linkCanonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!linkCanonical) {
      linkCanonical = document.createElement('link');
      linkCanonical.setAttribute('rel', 'canonical');
      document.head.appendChild(linkCanonical);
    }
    linkCanonical.setAttribute('href', canonicalUrl);
  }, [proyecto, club]);

  const handleDonate = async () => {
    setDonateError(null);
    if (!montoDonacion || montoDonacion < 1) {
      setDonateError('Selecciona un monto válido (mínimo $1 USD).');
      return;
    }
    if (!donorEmail || !/^\S+@\S+\.\S+$/.test(donorEmail)) {
      setDonateError('Tu email es obligatorio para enviarte el recibo.');
      return;
    }
    if (!club?.id || !proyecto?.id) {
      setDonateError('No pudimos identificar el proyecto o el club.');
      return;
    }

    setDonateSubmitting(true);
    try {
      const res = await fetch(`${API}/financial/donate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clubId: club.id,
          // v4.420 — mandamos el UUID real del proyecto cargado (no el slug del URL)
          projectId: proyecto.id,
          amount: montoDonacion,
          currency: 'USD',
          frequency: 'one-time',
          donorEmail,
          donorName: isAnonymous ? '' : donorName,
          message: donorMessage,
          isAnonymous,
          returnUrl: window.location.origin,
        })
      });
      const data = await res.json();
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || 'No pudimos iniciar el pago. Intenta de nuevo.');
      }
      window.location.href = data.url;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error inesperado iniciando el pago.';
      setDonateError(message);
      setDonateSubmitting(false);
    }
  };

  const SkeletonLoader = () => (
    <div className="animate-in fade-in duration-500">
      <section className="relative">
        <div className="relative h-[380px] md:h-[480px] bg-gray-100 animate-pulse overflow-hidden" />
        <div className="absolute bottom-0 left-0 right-0 pb-8 md:pb-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="h-4 w-32 bg-gray-200 rounded mb-4 animate-pulse" />
            <div className="h-6 w-24 bg-gray-200 rounded-full mb-4 animate-pulse" />
            <div className="h-10 md:h-14 w-3/4 bg-gray-200 rounded-xl mb-4 animate-pulse" />
            <div className="flex gap-4">
              <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-10">
              <div className="space-y-4">
                <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
                <div className="space-y-2">
                  <div className="h-4 w-full bg-gray-50 rounded animate-pulse" />
                  <div className="h-4 w-full bg-gray-50 rounded animate-pulse" />
                  <div className="h-4 w-5/6 bg-gray-50 rounded animate-pulse" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="aspect-[4/3] bg-gray-50 rounded-xl animate-pulse" />
                <div className="aspect-[4/3] bg-gray-50 rounded-xl animate-pulse" />
                <div className="aspect-[4/3] bg-gray-50 rounded-xl animate-pulse" />
              </div>
            </div>
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100 h-[400px] animate-pulse" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );

  // Normalizar campos (la BD usa title/description/image, el proyecto usa title/description/image)
  const titulo      = proyecto?.title       || proyecto?.titulo       || 'Sin título';
  const descripcion = proyecto?.description || proyecto?.descripcion  || '';
  const imagen      = proyecto?.image       || proyecto?.imagen       || '';
  const categoria   = proyecto?.category    || proyecto?.categoria    || 'Servicio';
  const meta        = Number(proyecto?.meta)        || 0;
  const recaudado   = Number(proyecto?.realRecaudado ?? proyecto?.recaudado) || 0;
  const donantes    = Number(proyecto?.realDonantes  ?? proyecto?.donantes)  || 0;
  const beneficiarios = Number(proyecto?.beneficiarios) || 0;
  const ubicacion   = proyecto?.ubicacion   || '';
  const impacto     = proyecto?.impacto     || '';
  const actualizaciones = proyecto?.actualizaciones || '';
  const galeria: string[] = Array.isArray(proyecto?.images) ? proyecto?.images : [];
  const porcentaje  = meta > 0 ? Math.min(Math.round((recaudado / meta) * 100), 100) : 0;

  // Fecha legible
  const fecha = proyecto?.fechaEstimada
    ? new Date(proyecto.fechaEstimada).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  // Contenido HTML de la descripción
  const descripcionHtml = textToHtml(stripHtml(descripcion) === descripcion ? descripcion : stripHtml(descripcion));
  const impactoHtml     = textToHtml(impacto);
  const actualizacionesHtml = textToHtml(actualizaciones);

  // Todas las imágenes del proyecto (principal + galería)
  const todasImagenes = [imagen, ...galeria].filter(Boolean);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <SkeletonLoader />
          </motion.div>
        ) : error || !proyecto ? (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="py-20 text-center px-4"
          >
            <h1 className="text-2xl font-bold text-gray-900 mb-4 font-rotary">{error || 'Proyecto no encontrado'}</h1>
            <Link to="/proyectos" className="inline-flex items-center gap-2 text-rotary-blue font-bold hover:underline">
              <ArrowLeft className="w-4 h-4" />
              Volver a proyectos
            </Link>
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
          >
            {/* Hero */}
            <section className="relative">
              <div className="relative h-[380px] md:h-[480px] overflow-hidden bg-gray-900">
                {todasImagenes.length > 0 ? (
                  <img
                    src={todasImagenes[activeImg]}
                    alt={titulo}
                    className="w-full h-full object-cover opacity-80 transition-opacity duration-500"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-rotary-blue to-rotary-gold" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

                {/* Miniaturas si hay varias imágenes */}
                {todasImagenes.length > 1 && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                    {todasImagenes.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveImg(i)}
                        className={`w-2.5 h-2.5 rounded-full transition-all ${i === activeImg ? 'bg-white scale-125' : 'bg-white/50'}`}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="absolute bottom-0 left-0 right-0 pb-8 md:pb-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                  <button
                    onClick={() => navigate('/proyectos')}
                    className="flex items-center gap-2 text-white/80 hover:text-white mb-4 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" /> Volver a proyectos
                  </button>
                  <span className="inline-flex items-center gap-2 bg-rotary-gold text-white text-sm font-semibold px-4 py-1 rounded-full mb-4">
                    <Tag className="w-4 h-4" /> {categoria}
                  </span>
                  <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4 max-w-4xl">{titulo}</h1>
                  <div className="flex flex-wrap items-center gap-4 text-white/80 text-sm">
                    {ubicacion && <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{ubicacion}</span>}
                    {beneficiarios > 0 && <span className="flex items-center gap-1"><Users className="w-4 h-4" />{beneficiarios.toLocaleString()} beneficiarios</span>}
                    {fecha && <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />Meta: {fecha}</span>}
                  </div>
                </div>
              </div>
            </section>

            {/* Contenido */}
            <section className="py-12 md:py-16">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                  {/* Columna Principal */}
                  <div className="lg:col-span-2 space-y-10">

                    {/* Descripción */}
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-rotary-blue" /> Sobre el Proyecto
                      </h2>
                      <div
                        className="prose prose-lg max-w-none text-gray-700 leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: descripcionHtml || '<p>Sin descripción disponible.</p>' }}
                      />
                    </div>

                    {/* Galería */}
                    {galeria.length > 0 && (
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-4">Galería del Proyecto</h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {galeria.map((img, i) => (
                            <div
                              key={i}
                              className="aspect-[4/3] rounded-xl overflow-hidden cursor-pointer"
                              onClick={() => setActiveImg(todasImagenes.indexOf(img))}
                            >
                              <img src={img} alt={`Galería ${i + 1}`} className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Impacto */}
                    {impacto && (
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                          <BarChart2 className="w-5 h-5 text-rotary-blue" /> Impacto Esperado
                        </h2>
                        <div
                          className="prose prose-lg max-w-none text-gray-700 bg-rotary-blue/5 rounded-2xl p-6"
                          dangerouslySetInnerHTML={{ __html: impactoHtml }}
                        />
                      </div>
                    )}

                    {/* Actualizaciones */}
                    {actualizaciones && (
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-green-600" /> Plan de Ejecución
                        </h2>
                        <div
                          className="prose prose-lg max-w-none text-gray-700 border-l-4 border-rotary-gold pl-6"
                          dangerouslySetInnerHTML={{ __html: actualizacionesHtml }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Sidebar */}
                  <div className="lg:col-span-1">
                    <div className="bg-white rounded-2xl shadow-xl p-6 sticky top-24 border border-gray-100">
                      {/* Progreso */}
                      <div className="mb-6">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-3xl font-bold text-rotary-blue">{porcentaje}%</span>
                          <span className="text-gray-500 text-sm">de la meta</span>
                        </div>
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-4">
                          <div
                            className="h-full bg-gradient-to-r from-rotary-blue to-rotary-gold rounded-full transition-all duration-700"
                            style={{ width: `${porcentaje}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-sm">
                          <div>
                            <div className="text-xl font-bold text-gray-900">{formatShort(recaudado)}</div>
                            <div className="text-gray-500 text-xs">recaudado</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xl font-bold text-gray-900">{formatShort(meta)}</div>
                            <div className="text-gray-500 text-xs">meta</div>
                          </div>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-2 gap-4 mb-6 py-4 border-t border-b border-gray-100">
                        <div className="text-center">
                          <Users className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                          <div className="text-lg font-bold text-gray-900">{donantes}</div>
                          <div className="text-xs text-gray-500">donantes</div>
                        </div>
                        <div className="text-center">
                          <Target className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                          <div className="text-lg font-bold text-gray-900">{beneficiarios || '—'}</div>
                          <div className="text-xs text-gray-500">beneficiarios</div>
                        </div>
                      </div>

                      {/* CTA Donar */}
                      <button
                        onClick={() => setMostrarModal(true)}
                        className="w-full bg-rotary-gold text-white py-4 rounded-full font-bold text-lg hover:bg-[#c9a020] transition-colors flex items-center justify-center gap-2 mb-4 shadow-md"
                      >
                        <Heart className="w-5 h-5" /> Realizar Aporte
                      </button>

                      {/* Compartir */}
                      <div className="flex justify-center gap-3">
                        <a
                          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`}
                          target="_blank" rel="noopener noreferrer"
                          className="w-10 h-10 flex items-center justify-center bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
                        >
                          <Facebook className="w-5 h-5" />
                        </a>
                        <a
                          href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(titulo)}`}
                          target="_blank" rel="noopener noreferrer"
                          className="w-10 h-10 flex items-center justify-center bg-sky-500 text-white rounded-full hover:bg-sky-600 transition-colors"
                        >
                          <Twitter className="w-5 h-5" />
                        </a>
                        <a
                          href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}`}
                          target="_blank" rel="noopener noreferrer"
                          className="w-10 h-10 flex items-center justify-center bg-blue-700 text-white rounded-full hover:bg-blue-800 transition-colors"
                        >
                          <Linkedin className="w-5 h-5" />
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Modal de Donación — v4.416 cableado a Stripe Checkout */}
            {mostrarModal && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
                <div className="bg-white rounded-2xl max-w-md w-full p-6 relative shadow-2xl my-8">
                  <button
                    onClick={() => !donateSubmitting && setMostrarModal(false)}
                    disabled={donateSubmitting}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                  >
                    <X className="w-6 h-6" />
                  </button>
                  <div className="text-center mb-5">
                    <div className="w-16 h-16 bg-rotary-blue/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Heart className="w-8 h-8 text-rotary-blue" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-1">Haz tu Donación</h3>
                    <p className="text-gray-600 text-sm">Apoya el proyecto "{titulo}"</p>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Selecciona el monto (USD)</label>
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        {[10, 25, 50, 100, 250, 500].map(monto => (
                          <button
                            key={monto}
                            onClick={() => setMontoDonacion(monto)}
                            className={`py-2 px-3 rounded-lg text-sm font-bold transition-colors border-2 ${
                              montoDonacion === monto
                                ? 'border-rotary-blue bg-rotary-blue text-white'
                                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                            }`}
                          >
                            ${monto}
                          </button>
                        ))}
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">$</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          placeholder="Otro monto"
                          value={[10, 25, 50, 100, 250, 500].includes(montoDonacion) ? '' : montoDonacion}
                          onChange={(e) => setMontoDonacion(Number(e.target.value))}
                          className="w-full pl-7 pr-3 py-2 border-2 border-gray-200 rounded-lg focus:border-rotary-blue outline-none text-sm font-semibold"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Tu email (para el recibo)</label>
                      <input
                        type="email"
                        placeholder="tu@correo.com"
                        value={donorEmail}
                        onChange={(e) => setDonorEmail(e.target.value)}
                        required
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-rotary-blue outline-none text-sm"
                      />
                    </div>

                    {!isAnonymous && (
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Nombre (opcional)</label>
                        <input
                          type="text"
                          placeholder="Tu nombre"
                          value={donorName}
                          onChange={(e) => setDonorName(e.target.value)}
                          className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-rotary-blue outline-none text-sm"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Mensaje al club (opcional)</label>
                      <textarea
                        placeholder="¿Quieres dejar un mensaje?"
                        value={donorMessage}
                        onChange={(e) => setDonorMessage(e.target.value)}
                        rows={2}
                        maxLength={500}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-rotary-blue outline-none text-sm resize-none"
                      />
                    </div>

                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isAnonymous}
                        onChange={(e) => setIsAnonymous(e.target.checked)}
                        className="w-4 h-4 accent-rotary-blue"
                      />
                      Quiero donar como anónimo
                    </label>

                    <div className="bg-gray-50 p-3 rounded-lg flex justify-between items-center">
                      <span className="text-gray-600 text-sm">Monto a donar:</span>
                      <span className="text-xl font-bold text-rotary-blue">${montoDonacion} USD</span>
                    </div>

                    {donateError && (
                      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                        {donateError}
                      </div>
                    )}

                    <button
                      onClick={handleDonate}
                      disabled={donateSubmitting}
                      className="w-full bg-rotary-gold text-white py-3 rounded-full font-semibold hover:bg-[#c9a020] disabled:bg-gray-400 disabled:cursor-wait transition-colors flex items-center justify-center gap-2"
                    >
                      {donateSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Conectando con Stripe…
                        </>
                      ) : (
                        <>Continuar con la Donación</>
                      )}
                    </button>

                    <div className="flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Pago seguro procesado por Stripe
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <Footer />
    </div>
  );
};

export default ProyectoDetalle;
