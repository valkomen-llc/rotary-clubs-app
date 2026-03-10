import { useState, useEffect } from 'react';
import { Calendar, User, ArrowRight, Tag, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useClub } from '../contexts/ClubContext';
import { useCMSContent } from '../hooks/useCMSContent';

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
  const { club } = useClub();
  const { sections } = useCMSContent('blog', club.id);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoriaActiva, setCategoriaActiva] = useState('Todas');
  const [paginaActual, setPaginaActual] = useState(1);
  const articulosPorPagina = 6;

  const getC = (section: string, field: string, fallback: string) => {
    return sections[section]?.[field] || fallback;
  }

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/clubs/${club.id}/posts`);
        const staticMapped = [...articulosDestacados, ...articulos].map(art => ({
          id: `static-${art.id}`,
          title: art.titulo,
          summary: art.resumen,
          content: art.resumen,
          image: art.imagen,
          published: true,
          createdAt: art.fecha,
          category: art.categoria,
          author: { name: art.autor },
          isStatic: true
        }));

        if (response.ok) {
          const data = await response.json();
          // The API returns 'content' containing HTML, frontend uses 'summary' for preview
          const dbMapped = data.map((p: any) => ({
            ...p,
            summary: p.summary || p.content?.replace(/<[^>]*>?/gm, '').substring(0, 150) + '...'
          }));
          setPosts([...dbMapped, ...staticMapped]);
        } else {
          setPosts(staticMapped);
        }
      } catch (error) {
        console.error('Error fetching posts:', error);
        const staticMapped = [...articulosDestacados, ...articulos].map(art => ({
          id: `static-${art.id}`,
          title: art.titulo,
          summary: art.resumen,
          content: art.resumen,
          image: art.imagen,
          published: true,
          createdAt: art.fecha,
          category: art.categoria,
          author: { name: art.autor },
          isStatic: true
        }));
        setPosts(staticMapped);
      } finally {
        setLoading(false);
      }
    };

    if (club?.id) fetchPosts();
  }, [club?.id]);

  const articulosFiltrados = categoriaActiva === 'Todas'
    ? posts
    : posts.filter(art => art.category === categoriaActiva);

  const totalPaginas = Math.ceil(articulosFiltrados.length / articulosPorPagina);
  const articulosPagina = articulosFiltrados.slice(
    (paginaActual - 1) * articulosPorPagina,
    paginaActual * articulosPorPagina
  );

  const destacados = posts.filter(p => p.isFeatured).slice(0, 2);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero Section */}
      <section
        className="py-16 md:py-20"
        style={{
          backgroundColor: '#0c3c7c',
          backgroundImage: "url('/geo-darkblue.png')",
          backgroundPosition: '50% 0',
          backgroundRepeat: 'repeat',
          backgroundSize: '71px 85px'
        }}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
            {getC('header', 'title', "Noticias y Blog")}
          </h1>
          <p className="text-white/90 text-lg max-w-2xl mx-auto">
            {getC('header', 'description', "Actualizaciones del Rotary Club. Mantente informado sobre nuestros proyectos.")}
          </p>
        </div>
      </section>

      {/* Artículos Destacados */}
      {destacados.length > 0 && (
        <section className="py-12 md:py-16 bg-rotary-concrete">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">Artículos Destacados</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
              {destacados.map((articulo) => (
                <Link
                  key={articulo.id}
                  to={`/blog/${articulo.id}`}
                  className="group relative bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow"
                >
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <img
                      src={articulo.image}
                      alt={articulo.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    <span className="absolute top-4 left-4 bg-rotary-gold text-white text-xs font-semibold px-3 py-1 rounded-full">
                      {articulo.category}
                    </span>
                  </div>
                  <div className="p-6">
                    <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {new Date(articulo.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-rotary-blue transition-colors line-clamp-2">
                      {articulo.title}
                    </h3>
                    <p className="text-gray-600 text-sm leading-relaxed mb-4 line-clamp-2">
                      {articulo.summary}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm text-gray-500">
                        <User className="w-4 h-4" />
                        {articulo.author?.name || 'Rotary Club'}
                      </span>
                      <span className="flex items-center gap-1 text-rotary-blue font-bold text-sm group-hover:underline">
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
      )}

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
                className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${categoriaActiva === categoria
                  ? 'bg-rotary-blue text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                {categoria}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rotary-blue" />
            </div>
          ) : articulosPagina.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-gray-500 text-lg">No hay noticias disponibles en esta categoría.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {articulosPagina.map((articulo) => (
                <Link
                  key={articulo.id}
                  to={`/blog/${articulo.id}`}
                  className="group bg-white rounded-xl overflow-hidden shadow-md hover:shadow-lg transition-all border border-gray-100 h-full flex flex-col"
                >
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <img
                      src={articulo.image}
                      alt={articulo.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    <span className="absolute top-3 left-3 bg-white/90 text-gray-800 text-xs font-semibold px-2 py-1 rounded flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      {articulo.category}
                    </span>
                  </div>
                  <div className="p-5 flex-grow flex flex-col">
                    <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(articulo.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2 group-hover:text-rotary-blue transition-colors">
                      {articulo.title}
                    </h3>
                    <p className="text-gray-600 text-sm line-clamp-3 mb-4 flex-grow">
                      {articulo.summary}
                    </p>
                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                      <span className="text-xs text-gray-500">{articulo.author?.name || 'Rotary'}</span>
                      <span className="flex items-center gap-1 text-rotary-blue text-sm font-bold group-hover:underline">
                        Leer
                        <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-1" />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

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
