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

import { articulosDestacados, articulos } from '../data/news';

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
      <section
        className="py-16 md:py-20"
        style={{
          backgroundColor: '#263b4c',
          backgroundImage: "url('/geo-darkblue.png')",
          backgroundPosition: '50% 0',
          backgroundRepeat: 'repeat',
          backgroundSize: '71px 85px'
        }}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">Blog</h1>
          <p className="text-white/90 text-lg max-w-2xl mx-auto">
            Noticias, historias y actualizaciones del Rotary Club. Mantente informado sobre nuestros proyectos, eventos y actividades.
          </p>
        </div>
      </section>

      {/* Artículos Destacados */}
      <section className="py-12 md:py-16 bg-rotary-concrete">
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
