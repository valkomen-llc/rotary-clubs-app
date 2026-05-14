import { useState, useEffect, useMemo } from 'react';
import { Calendar, User, ArrowRight, Tag, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useClub } from '../contexts/ClubContext';
import { useCMSContent } from '../hooks/useCMSContent';
import { useSEO } from '../hooks/useSEO';
import { motion, AnimatePresence } from 'framer-motion';

import { articulosDestacados, articulos } from '../data/news';

const Blog = () => {
  const { club } = useClub();
  const { sections } = useCMSContent('blog', club.id);

  useSEO({
    title: 'Noticias y Blog',
    description: `Últimas noticias, eventos y actividades de ${(club as any)?.name || 'nuestro club Rotary'}.`,
    path: '/blog',
  });

  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoriaActiva, setCategoriaActiva] = useState('Todas');
  const [paginaActual, setPaginaActual] = useState(1);
  const articulosPorPagina = 6;

  // Derivar categorías de forma dinámica (Top 5 más frecuentes + Todas)
  const categorias = useMemo(() => {
    const counts: { [key: string]: number } = {};
    posts.forEach(post => {
      if (post.category) {
        counts[post.category] = (counts[post.category] || 0) + 1;
      }
    });

    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);

    return ['Todas', ...sorted.slice(0, 5)];
  }, [posts]);

  const getC = (section: string, field: string, fallback: string) => {
    return sections[section]?.[field] || fallback;
  }

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/clubs/${club.id}/posts`);
        const hideSamples = (club as any)?.settings?.hide_sample_news === true;
        const staticMapped = hideSamples ? [] : [...articulosDestacados, ...articulos].map(art => ({
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
          const dbMapped = data.map((p: any) => {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = p.content || '';
            const textContent = tempDiv.textContent || tempDiv.innerText || '';
            return {
              ...p,
              summary: p.summary || textContent.substring(0, 150) + '...'
            };
          });
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

  const SkeletonCard = () => (
    <div className="bg-white rounded-xl overflow-hidden border border-gray-100 h-full flex flex-col animate-pulse">
      <div className="relative aspect-[4/3] bg-gray-100" />
      <div className="p-5 flex-grow flex flex-col">
        <div className="h-3 w-24 bg-gray-100 rounded mb-3" />
        <div className="h-5 w-full bg-gray-100 rounded mb-2" />
        <div className="h-5 w-3/4 bg-gray-100 rounded mb-4" />
        <div className="space-y-2 mb-4">
          <div className="h-3 w-full bg-gray-50 rounded" />
          <div className="h-3 w-full bg-gray-50 rounded" />
          <div className="h-3 w-5/6 bg-gray-50 rounded" />
        </div>
        <div className="flex justify-between items-center pt-3 border-t border-gray-50">
          <div className="h-3 w-20 bg-gray-50 rounded" />
          <div className="h-3 w-12 bg-gray-50 rounded" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero Section */}
      <section
        className="relative overflow-hidden"
        style={{
          backgroundColor: '#0c3c7c',
          backgroundImage: "url('/geo-darkblue.png')",
          backgroundPosition: '50% 0',
          backgroundRepeat: 'repeat',
          backgroundSize: '71px 85px'
        }}
      >
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-3xl md:text-5xl text-white mb-6 font-rotary">
              {getC('header', 'title', "Noticias y Blog")}
            </h1>
            <p className="text-white/80 text-lg md:text-xl">
              {getC('header', 'description', "Actualizaciones del Rotary Club. Mantente informado sobre nuestros proyectos.")}
            </p>
          </div>
        </div>
      </section>

      {/* Artículos Destacados */}
      {!loading && destacados.length > 0 && (
        <section className="py-12 md:py-16 bg-rotary-concrete">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8 font-rotary">Artículos Destacados</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
              {destacados.map((articulo) => (
                <Link
                  key={articulo.id}
                  to={`/blog/${articulo.slug || articulo.id}`}
                  className="group relative bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all hover:-translate-y-1"
                >
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <img
                      src={articulo.image}
                      alt={articulo.title}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    <span className="absolute top-4 left-4 bg-rotary-gold text-white text-xs font-semibold px-3 py-1 rounded-full shadow-lg shadow-rotary-gold/20">
                      {articulo.category}
                    </span>
                  </div>
                  <div className="p-6">
                    <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                      <span className="flex items-center gap-1 font-medium">
                        <Calendar className="w-4 h-4 text-rotary-gold" />
                        {new Date(articulo.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-rotary-blue transition-colors line-clamp-2 font-rotary">
                      {articulo.title}
                    </h3>
                    <p className="text-gray-600 text-sm leading-relaxed mb-4 line-clamp-2">
                      {articulo.summary}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm text-gray-500 font-medium">
                        <User className="w-4 h-4 text-rotary-gold" />
                        {articulo.author?.name || 'Rotary Club'}
                      </span>
                      <span className="flex items-center gap-1 text-rotary-blue font-black text-xs uppercase tracking-widest group-hover:underline">
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
          <div className="flex flex-wrap gap-2 mb-12 justify-center">
            {categorias.map((categoria) => (
              <button
                key={categoria}
                onClick={() => {
                  setCategoriaActiva(categoria);
                  setPaginaActual(1);
                }}
                className={`px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all shadow-sm ${categoriaActiva === categoria
                  ? 'bg-rotary-blue text-white shadow-rotary-blue/20'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
              >
                {categoria}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[...Array(6)].map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : articulosPagina.length === 0 ? (
            <div className="text-center py-24 bg-gray-50 rounded-3xl border border-dashed border-gray-200">
              <Tag className="w-12 h-12 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">No hay noticias disponibles en esta categoría.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {articulosPagina.map((articulo) => (
                <Link
                  key={articulo.id}
                  to={`/blog/${articulo.slug || articulo.id}`}
                  className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-2xl transition-all border border-gray-100 h-full flex flex-col hover:-translate-y-1 hover:border-rotary-blue/20"
                >
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <img
                      src={articulo.image}
                      alt={articulo.title}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    <span className="absolute top-4 left-4 bg-white/90 backdrop-blur-md text-gray-900 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg flex items-center gap-2 shadow-sm">
                      <Tag className="w-3 h-3 text-rotary-gold" />
                      {articulo.category}
                    </span>
                  </div>
                  <div className="p-6 flex-grow flex flex-col">
                    <div className="flex items-center gap-3 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-rotary-gold" />
                        {new Date(articulo.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-3 line-clamp-2 group-hover:text-rotary-blue transition-colors font-rotary leading-tight">
                      {articulo.title}
                    </h3>
                    <p className="text-gray-600 text-sm line-clamp-3 mb-6 flex-grow leading-relaxed">
                      {articulo.summary}
                    </p>
                    <div className="flex items-center justify-between pt-5 border-t border-gray-50">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{articulo.author?.name || 'Rotary'}</span>
                      <span className="flex items-center gap-2 text-rotary-blue text-[10px] font-black uppercase tracking-widest group-hover:underline group-hover:gap-3 transition-all">
                        Leer más
                        <ArrowRight className="w-3 h-3" />
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
