// ════════════════════════════════════════════════════════════════════════════
// Directorio Público Distrital de Clubes — Distrito 4281
// Rotary, Rotaract e Interact · Buscador, Filtros y Perfiles Oficiales
// ════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { PublicPageHeader } from '../components/common/PublicInstitutionalComponents';
import { useSEO } from '../hooks/useSEO';
import {
  Search, MapPin, Building2, Users, ArrowRight, Sparkles, Filter,
  Calendar, CheckCircle2, ChevronRight, Compass, Shield
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

interface ClubCardItem {
  id: string;
  organizationType: 'rotary' | 'rotaract' | 'interact';
  officialName: string;
  shortName: string;
  slug: string;
  city?: string;
  state?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  description?: string;
  motto?: string;
  currentPresident?: string;
  rotaryPeriod?: string;
  completionPercentage?: number;
}

export const DistrictDirectoryPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const [clubs, setClubs] = useState<ClubCardItem[]>([]);
  const [counts, setCounts] = useState({ total: 0, rotary: 0, rotaract: 0, interact: 0 });
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [activeTab, setActiveTab] = useState<'all' | 'rotary' | 'rotaract' | 'interact'>(
    (params.get('tipo') as any) || 'all'
  );
  const [searchQuery, setSearchQuery] = useState(params.get('q') || '');
  const [selectedCity, setSelectedCity] = useState(params.get('ciudad') || '');

  useSEO({
    title: 'Directorio Distrital de Clubes · Rotary Distrito 4281',
    description: 'Directorio oficial de clubes Rotary, Rotaract e Interact del Distrito 4281 en Colombia. Conoce sus proyectos, sedes, directivas y contacto.'
  });

  // Cargar directorio desde el backend
  useEffect(() => {
    let active = true;
    const fetchDirectory = async () => {
      setLoading(true);
      try {
        const queryParams = new URLSearchParams({
          district: '4281',
          type: activeTab,
          q: searchQuery,
          city: selectedCity
        });
        const res = await fetch(`${API}/district-clubs/public?${queryParams.toString()}`);
        if (!res.ok) throw new Error('Error al cargar directorio');
        const data = await res.json();
        if (active && data.ok) {
          setClubs(data.clubs || []);
          setCounts(data.counts || { total: 0, rotary: 0, rotaract: 0, interact: 0 });
          setCities(data.cities || []);
        }
      } catch (err) {
        console.warn('Directory fetch error:', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    const timeout = setTimeout(fetchDirectory, 200);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [activeTab, searchQuery, selectedCity]);

  // Actualizar URL search params
  const handleTabChange = (tab: 'all' | 'rotary' | 'rotaract' | 'interact') => {
    setActiveTab(tab);
    const next = new URLSearchParams(params);
    if (tab === 'all') next.delete('tipo');
    else next.set('tipo', tab);
    setParams(next, { replace: true });
  };

  const getBadgeStyle = (type: string) => {
    switch (type) {
      case 'rotaract':
        return 'bg-pink-50 text-[#D91B5C] border-pink-200';
      case 'interact':
        return 'bg-sky-50 text-[#005DAA] border-sky-200';
      case 'rotary':
      default:
        return 'bg-blue-50 text-rotary-blue border-blue-200';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'rotaract': return 'Club Rotaract';
      case 'interact': return 'Club Interact';
      case 'rotary': default: return 'Club Rotario';
    }
  };

  return (
    <div className="min-h-screen bg-rotary-concrete flex flex-col font-sans text-gray-800">
      <Navbar />

      {/* Cabecera institucional */}
      <PublicPageHeader
        badge="Rotary Distrito 4281 · Colombia"
        title="Directorio Distrital de Clubes"
        subtitle="Conecta con los clubes de servicio humanitario, liderazgo joven e impacto comunitario en todo el centro, sur y occidente del país."
      />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full space-y-8">

        {/* Barra de Filtros y Búsqueda */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-gray-100 space-y-4">
          <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">

            {/* Pestañas de Categoría */}
            <div className="flex items-center gap-1.5 p-1 bg-gray-100/80 rounded-2xl overflow-x-auto shrink-0">
              {[
                { id: 'all', label: 'Todos los Clubes', count: counts.total },
                { id: 'rotary', label: 'Rotary', count: counts.rotary },
                { id: 'rotaract', label: 'Rotaract', count: counts.rotaract },
                { id: 'interact', label: 'Interact', count: counts.interact }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => handleTabChange(t.id as any)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                    activeTab === t.id
                      ? 'bg-white text-rotary-blue shadow-sm font-black'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <span>{t.label}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    activeTab === t.id ? 'bg-blue-50 text-rotary-blue' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {t.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Buscador de texto */}
            <div className="flex-1 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por nombre de club o presidente..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 text-xs font-semibold outline-none focus:border-rotary-blue"
                />
              </div>

              {/* Selector de Ciudad */}
              {cities.length > 0 && (
                <div className="sm:w-56 shrink-0">
                  <select
                    aria-label="Filtrar por ciudad"
                    value={selectedCity}
                    onChange={(e) => setSelectedCity(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 text-xs font-semibold outline-none focus:border-rotary-blue"
                  >
                    <option value="">Todas las ciudades ({cities.length})</option>
                    {cities.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Cuadrícula de Clubes */}
        {loading ? (
          <div className="py-20 text-center">
            <div className="w-10 h-10 border-4 border-rotary-blue border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs font-bold text-gray-500">Consultando directorio distrital...</p>
          </div>
        ) : clubs.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-gray-100 shadow-sm max-w-xl mx-auto">
            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-gray-800 mb-1">No se encontraron clubes con los filtros seleccionados</h3>
            <p className="text-xs text-gray-500 mb-6">Prueba con otra palabra clave o limpia los filtros de búsqueda.</p>
            <button
              onClick={() => {
                setActiveTab('all');
                setSearchQuery('');
                setSelectedCity('');
              }}
              className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl"
            >
              Restablecer Filtros
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {clubs.map(club => {
              const profileUrl = `/clubes/${club.organizationType}/${club.slug}`;

              return (
                <div
                  key={club.id}
                  className="bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 flex flex-col justify-between group"
                >
                  <div>
                    {/* Banner superior con foto de portada o gradiente suave */}
                    <div className="h-32 w-full relative bg-gray-100 overflow-hidden">
                      {club.coverImageUrl ? (
                        <img
                          src={club.coverImageUrl}
                          alt=""
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-r from-blue-900 to-indigo-900 opacity-90" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

                      {/* Badge de tipo */}
                      <span className={`absolute top-3 left-3 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-sm ${getBadgeStyle(club.organizationType)}`}>
                        {getTypeLabel(club.organizationType)}
                      </span>

                      {/* Período */}
                      {club.rotaryPeriod && (
                        <span className="absolute top-3 right-3 px-2 py-0.5 bg-black/40 backdrop-blur-sm text-white rounded-full text-[10px] font-bold">
                          {club.rotaryPeriod}
                        </span>
                      )}
                    </div>

                    {/* Cuerpo de la tarjeta */}
                    <div className="p-6 pt-4 space-y-3">
                      {/* Logo flotante si existe */}
                      {club.logoUrl && (
                        <div className="-mt-10 mb-2 relative z-10">
                          <div className="w-14 h-14 bg-white rounded-xl shadow-md p-1.5 border border-gray-100 flex items-center justify-center">
                            <img src={club.logoUrl} alt="" className="max-h-full max-w-full object-contain" />
                          </div>
                        </div>
                      )}

                      <div>
                        <h4 className="text-lg font-extrabold text-gray-900 group-hover:text-rotary-blue transition-colors line-clamp-1">
                          {club.officialName}
                        </h4>
                        {club.city && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-500 font-semibold mt-0.5">
                            <MapPin className="w-3.5 h-3.5 text-rotary-blue shrink-0" />
                            <span>{club.city}{club.state ? `, ${club.state}` : ''}</span>
                          </div>
                        )}
                      </div>

                      {club.description && (
                        <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed font-light">
                          {club.description}
                        </p>
                      )}

                      {club.currentPresident && (
                        <div className="pt-2 border-t border-gray-100 text-xs text-gray-500 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-gray-400" />
                          <span>Presidente: <strong className="text-gray-700">{club.currentPresident}</strong></span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Botón de acción */}
                  <div className="p-6 pt-0">
                    <Link
                      to={profileUrl}
                      className="w-full py-2.5 px-4 bg-gray-50 hover:bg-rotary-blue group-hover:bg-rotary-blue hover:text-white group-hover:text-white text-rotary-blue font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 border border-gray-100 shadow-xs"
                    >
                      <span>Conocer el Club</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Banner de Invitación a Actualizar Perfil */}
        <div className="bg-gradient-to-r from-blue-900 to-indigo-950 rounded-3xl p-8 sm:p-10 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left max-w-2xl">
            <span className="text-xs font-black text-yellow-400 uppercase tracking-widest flex items-center justify-center md:justify-start gap-1.5">
              <Sparkles className="w-4 h-4" /> Ecosistema Distrital Centralizado
            </span>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-white">
              ¿Lideras un Club Rotary, Rotaract o Interact en el Distrito 4281?
            </h3>
            <p className="text-xs sm:text-sm text-white/80 leading-relaxed font-light">
              Registra o actualiza los datos institucionales de tu club, su directiva, causas y proyectos para que aparezcan destacados en el directorio oficial.
            </p>
          </div>

          <div className="shrink-0 w-full md:w-auto text-center">
            <Link
              to="/clubes/registro"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-yellow-400 hover:bg-yellow-300 text-rotary-blue font-black rounded-full shadow-lg transition-all text-sm w-full md:w-auto"
            >
              <span>Actualizar Perfil de mi Club</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

      </main>

      <Footer />
    </div>
  );
};

export default DistrictDirectoryPage;
