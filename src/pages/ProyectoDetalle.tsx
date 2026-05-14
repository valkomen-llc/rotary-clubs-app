import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Heart, Users, MapPin, Calendar, Target,
  CheckCircle2, Facebook, Twitter, Linkedin, X, Loader2,
  Tag, FileText, BarChart2
} from 'lucide-react';
import { useState, useEffect } from 'react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useClub } from '../contexts/ClubContext';

const API = import.meta.env.VITE_API_URL || '/api';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value);

const formatShort = (value: number) => {
  if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(1) + 'B';
  if (value >= 1_000_000)     return (value / 1_000_000).toFixed(1) + 'M';
  if (value >= 1_000)         return (value / 1_000).toFixed(0) + 'K';
  return value.toString();
};

/** Limpia HTML y entidades para texto plano en resúmenes */
const stripHtml = (html: string) =>
  html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

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
  const [montoDonacion, setMontoDonacion] = useState(50000);
  const [mostrarModal, setMostrarModal] = useState(false);
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

  // Normalizar campos (la BD usa title/description/image, el proyecto usa title/description/image)
  const titulo      = proyecto.title       || proyecto.titulo       || 'Sin título';
  const descripcion = proyecto.description || proyecto.descripcion  || '';
  const imagen      = proyecto.image       || proyecto.imagen       || '';
  const categoria   = proyecto.category    || proyecto.categoria    || 'Servicio';
  const meta        = Number(proyecto.meta)        || 0;
  const recaudado   = Number(proyecto.realRecaudado ?? proyecto.recaudado) || 0;
  const donantes    = Number(proyecto.realDonantes  ?? proyecto.donantes)  || 0;
  const beneficiarios = Number(proyecto.beneficiarios) || 0;
  const ubicacion   = proyecto.ubicacion   || '';
  const impacto     = proyecto.impacto     || '';
  const actualizaciones = proyecto.actualizaciones || '';
  const galeria: string[] = Array.isArray(proyecto.images) ? proyecto.images : [];
  const porcentaje  = meta > 0 ? Math.min(Math.round((recaudado / meta) * 100), 100) : 0;

  // Fecha legible
  const fecha = proyecto.fechaEstimada
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
                  <Heart className="w-5 h-5" /> Donar Ahora
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

      {/* Modal de Donación */}
      {mostrarModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 relative shadow-2xl">
            <button
              onClick={() => setMostrarModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-rotary-blue/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Heart className="w-8 h-8 text-rotary-blue" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Haz tu Donación</h3>
              <p className="text-gray-600 text-sm">Apoya el proyecto "{titulo}"</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Selecciona un monto</label>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[25000, 50000, 100000, 200000, 500000, 1000000].map(monto => (
                    <button
                      key={monto}
                      onClick={() => setMontoDonacion(monto)}
                      className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                        montoDonacion === monto ? 'bg-rotary-blue text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {formatCurrency(monto)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Monto a donar:</span>
                  <span className="text-xl font-bold text-rotary-blue">{formatCurrency(montoDonacion)}</span>
                </div>
              </div>
              <button
                onClick={() => setMostrarModal(false)}
                className="w-full bg-rotary-gold text-white py-3 rounded-full font-semibold hover:bg-[#c9a020] transition-colors"
              >
                Continuar con la Donación
              </button>
              <p className="text-center text-xs text-gray-500">Tu donación es segura y encriptada. Recibirás un recibo por email.</p>
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
