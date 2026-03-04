import { useState } from 'react';
import { Calendar, User, ArrowRight, Clock, Tag, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';

const categorias = [
  'Todas',
  'Proyectos',
  'Eventos',
  'Intercambio',
  'Fundación',
  'Socios'
];

const articulosDestacados = [
  {
    id: 1,
    titulo: 'Olayinka H. Babalola insta a los socios de Rotary a generar un impacto duradero',
    resumen: 'La presidenta de Rotary International 2025-26 comparte su visión sobre cómo los socios pueden crear cambios significativos en sus comunidades.',
    imagen: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=800&h=500&fit=crop',
    fecha: '15 de febrero, 2026',
    autor: 'Rotary International',
    categoria: 'Eventos',
    tiempoLectura: '5 min'
  },
  {
    id: 2,
    titulo: 'Entrevista con Bill Gates: El optimista',
    resumen: 'El filántropo habla sobre el papel de Rotary en la erradicación de la polio y la importancia de la colaboración global.',
    imagen: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=800&h=500&fit=crop',
    fecha: '10 de febrero, 2026',
    autor: 'Revista Rotary',
    categoria: 'Fundación',
    tiempoLectura: '8 min'
  }
];

const articulos = [
  {
    id: 3,
    titulo: 'Gente de Acción en todo el mundo',
    resumen: 'Conoce las historias inspiradoras de rotarios que están cambiando vidas en diferentes rincones del planeta.',
    imagen: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=600&h=400&fit=crop',
    fecha: '8 de febrero, 2026',
    autor: 'Equipo Editorial',
    categoria: 'Socios',
    tiempoLectura: '4 min'
  },
  {
    id: 4,
    titulo: 'Rotary celebra 10 años de impacto en comunidades rurales',
    resumen: 'Una década de proyectos sostenibles que han transformado la vida de miles de familias en zonas rurales de Colombia.',
    imagen: 'https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=600&h=400&fit=crop',
    fecha: '5 de febrero, 2026',
    autor: 'Comunicaciones Rotary',
    categoria: 'Proyectos',
    tiempoLectura: '6 min'
  },
  {
    id: 5,
    titulo: 'Nuevos proyectos de agua potable benefician a miles de familias',
    resumen: 'El programa Origen H2O expande su alcance con 5 nuevos puntos de agua en comunidades vulnerables.',
    imagen: 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=600&h=400&fit=crop',
    fecha: '1 de febrero, 2026',
    autor: 'Proyectos Rotary',
    categoria: 'Proyectos',
    tiempoLectura: '3 min'
  },
  {
    id: 6,
    titulo: 'Introcamp 2024: Recibimos a 63 estudiantes de intercambio',
    resumen: 'Una experiencia inolvidable donde jóvenes de diferentes países conocieron la cultura colombiana.',
    imagen: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=600&h=400&fit=crop',
    fecha: '28 de enero, 2026',
    autor: 'Intercambio Rotary',
    categoria: 'Intercambio',
    tiempoLectura: '7 min'
  },
  {
    id: 7,
    titulo: 'Campaña #TodoPorNuestrosHéroes supera expectativas',
    resumen: 'La iniciativa durante la pandemia logró recolectar más de 50,000 equipos de protección para personal de salud.',
    imagen: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=600&h=400&fit=crop',
    fecha: '25 de enero, 2026',
    autor: 'Fundación Rotaria',
    categoria: 'Fundación',
    tiempoLectura: '5 min'
  },
  {
    id: 8,
    titulo: 'Rotary Pinta Colombia embellece 10 ciudades',
    resumen: 'El proyecto de embellecimiento urbano deja su huella en barrios de todo el país.',
    imagen: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=600&h=400&fit=crop',
    fecha: '20 de enero, 2026',
    autor: 'Proyectos Comunitarios',
    categoria: 'Proyectos',
    tiempoLectura: '4 min'
  },
  {
    id: 9,
    titulo: 'Nuevos socios se unen a la familia Rotary Club',
    resumen: 'Damos la bienvenida a 5 nuevos miembros que se suman a nuestra misión de servicio.',
    imagen: 'https://images.unsplash.com/photo-1531206715517-5c0ba140b2b8?w=600&h=400&fit=crop',
    fecha: '15 de enero, 2026',
    autor: 'Membresía Rotary',
    categoria: 'Socios',
    tiempoLectura: '2 min'
  },
  {
    id: 10,
    titulo: 'Programa de becas para jóvenes líderes 2026',
    resumen: 'Rotary abre convocatoria para becas que apoyarán el desarrollo académico de 20 jóvenes.',
    imagen: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=600&h=400&fit=crop',
    fecha: '10 de enero, 2026',
    autor: 'Educación Rotary',
    categoria: 'Eventos',
    tiempoLectura: '6 min'
  }
];

const Blog = () => {
  const [categoriaActiva, setCategoriaActiva] = useState('Todas');
  const [paginaActual, setPaginaActual] = useState(1);
  const articulosPorPagina = 6;

  const articulosFiltrados = categoriaActiva === 'Todas'
    ? articulos
    : articulos.filter(art => art.categoria === categoriaActiva);

  const totalPaginas = Math.ceil(articulosFiltrados.length / articulosPorPagina);
  const articulosPagina = articulosFiltrados.slice(
    (paginaActual - 1) * articulosPorPagina,
    paginaActual * articulosPorPagina
  );

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero Section */}
      <section className="bg-rotary-blue py-16 md:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">Blog</h1>
          <p className="text-white/90 text-lg max-w-2xl mx-auto">
            Noticias, historias y actualizaciones del Rotary Club. Mantente informado sobre nuestros proyectos, eventos y actividades.
          </p>
        </div>
      </section>

      {/* Artículos Destacados */}
      <section className="py-12 md:py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">Artículos Destacados</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
            {articulosDestacados.map((articulo) => (
              <Link
                key={articulo.id}
                to={`/blog/${articulo.id}`}
                className="group relative bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  <img
                    src={articulo.imagen}
                    alt={articulo.titulo}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <span className="absolute top-4 left-4 bg-rotary-gold text-white text-xs font-semibold px-3 py-1 rounded-full">
                    {articulo.categoria}
                  </span>
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {articulo.fecha}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {articulo.tiempoLectura}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-rotary-blue transition-colors">
                    {articulo.titulo}
                  </h3>
                  <p className="text-gray-600 text-sm leading-relaxed mb-4">
                    {articulo.resumen}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-gray-500">
                      <User className="w-4 h-4" />
                      {articulo.autor}
                    </span>
                    <span className="flex items-center gap-1 text-rotary-blue font-semibold text-sm group-hover:underline">
                      Leer más
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Filtros y Grid de Artículos */}
      <section className="py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Filtros de Categoría */}
          <div className="flex flex-wrap gap-2 mb-10 justify-center">
            {categorias.map((categoria) => (
              <button
                key={categoria}
                onClick={() => {
                  setCategoriaActiva(categoria);
                  setPaginaActual(1);
                }}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${categoriaActiva === categoria
                    ? 'bg-rotary-blue text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                {categoria}
              </button>
            ))}
          </div>

          {/* Grid de Artículos */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {articulosPagina.map((articulo) => (
              <Link
                key={articulo.id}
                to={`/blog/${articulo.id}`}
                className="group bg-white rounded-xl overflow-hidden shadow-md hover:shadow-lg transition-all border border-gray-100"
              >
                <div className="relative aspect-[4/3] overflow-hidden">
                  <img
                    src={articulo.imagen}
                    alt={articulo.titulo}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  <span className="absolute top-3 left-3 bg-white/90 text-gray-800 text-xs font-semibold px-2 py-1 rounded flex items-center gap-1">
                    <Tag className="w-3 h-3" />
                    {articulo.categoria}
                  </span>
                </div>
                <div className="p-5">
                  <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {articulo.fecha}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {articulo.tiempoLectura}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2 group-hover:text-rotary-blue transition-colors">
                    {articulo.titulo}
                  </h3>
                  <p className="text-gray-600 text-sm line-clamp-3 mb-4">
                    {articulo.resumen}
                  </p>
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <span className="text-xs text-gray-500">{articulo.autor}</span>
                    <span className="flex items-center gap-1 text-rotary-blue text-sm font-medium group-hover:underline">
                      Leer
                      <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-1" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Paginación */}
          {totalPaginas > 1 && (
            <div className="flex justify-center items-center gap-2 mt-12">
              <button
                onClick={() => setPaginaActual(p => Math.max(1, p - 1))}
                disabled={paginaActual === 1}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((pagina) => (
                <button
                  key={pagina}
                  onClick={() => setPaginaActual(pagina)}
                  className={`w-10 h-10 flex items-center justify-center rounded-full font-medium transition-colors ${paginaActual === pagina
                      ? 'bg-rotary-blue text-white'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                >
                  {pagina}
                </button>
              ))}

              <button
                onClick={() => setPaginaActual(p => Math.min(totalPaginas, p + 1))}
                disabled={paginaActual === totalPaginas}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Blog;
