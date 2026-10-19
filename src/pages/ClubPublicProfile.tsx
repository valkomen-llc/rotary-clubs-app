// ════════════════════════════════════════════════════════════════════════════
// Plantilla Maestra del Perfil Público Institucional de Clubes
// Rotary, Rotaract e Interact — Rotary Distrito 4281 & Multidistrito
// Estructura modular reutilizable con renderizado condicional inteligente.
// ════════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useSEO } from '../hooks/useSEO';
import {
  Users, MapPin, Calendar, Globe, Mail, Phone, Clock, Sparkles, ChevronLeft,
  ChevronRight, ExternalLink, Heart, Award, Building2
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

interface ClubProfileData {
  id: string;
  clubId?: string;
  districtNumber: number;
  organizationType: 'rotary' | 'rotaract' | 'interact';
  officialName: string;
  shortName: string;
  slug: string;
  city?: string;
  state?: string;
  country?: string;
  foundationYear?: number;
  motto?: string;
  description?: string;
  history?: string;
  mission?: string;
  vision?: string;
  serviceAreas?: string[];
  currentPresident?: string;
  rotaryPeriod?: string;
  boardMembers?: Array<{ name: string; role: string; photoUrl?: string }>;
  memberCount?: number;
  joinInfo?: string;
  featuredProjects?: Array<{ title: string; description: string; impact?: string; year?: string }>;
  logoUrl?: string;
  coverImageUrl?: string;
  gallery?: Array<{ url: string; caption?: string }>;
  meetingAddress?: string;
  meetingSchedule?: string;
  meetingCity?: string;
  contactEmail?: string;
  contactPhone?: string;
  websiteUrl?: string;
  socialMedia?: {
    facebook?: string;
    instagram?: string;
    linkedin?: string;
    youtube?: string;
    tiktok?: string;
  };
  completionPercentage?: number;
  lastUpdatedPeriod?: string;
  publishedAt?: string;
}

export const ClubPublicProfile: React.FC = () => {
  const { type = 'rotary', slug = '' } = useParams<{ type: string; slug: string }>();
  const [club, setClub] = useState<ClubProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentGalleryIdx, setCurrentGalleryIdx] = useState(0);

  useEffect(() => {
    let active = true;
    const fetchClub = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API}/district-clubs/profile/${type}/${slug}?district=4281`);
        if (!res.ok) throw new Error('Club no encontrado');
        const data = await res.json();
        if (active && data.ok) {
          setClub(data.club);
        }
      } catch (err) {
        console.warn('Error fetching club profile:', err);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchClub();
    return () => { active = false; };
  }, [type, slug]);

  const orgType = club?.organizationType || (type as 'rotary' | 'rotaract' | 'interact');

  // Paleta dinámica según el tipo de club
  const theme = {
    rotary: {
      accentColor: '#013388',
      accentBg: 'bg-rotary-blue',
      accentText: 'text-rotary-blue',
      badgeBg: 'bg-blue-500/20 text-blue-100 border-blue-400/30',
      heroBarBg: '#013388',
      typeLabel: 'Club Rotario',
      defaultHero: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1600&h=700&fit=crop'
    },
    rotaract: {
      accentColor: '#D91B5C',
      accentBg: 'bg-[#D91B5C]',
      accentText: 'text-[#D91B5C]',
      badgeBg: 'bg-pink-500/20 text-pink-100 border-pink-400/30',
      heroBarBg: '#D91B5C',
      typeLabel: 'Club Rotaract',
      defaultHero: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1600&h=700&fit=crop'
    },
    interact: {
      accentColor: '#005DAA',
      accentBg: 'bg-[#005DAA]',
      accentText: 'text-[#005DAA]',
      badgeBg: 'bg-sky-500/20 text-sky-100 border-sky-400/30',
      heroBarBg: '#005DAA',
      typeLabel: 'Club Interact',
      defaultHero: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1600&h=700&fit=crop'
    }
  }[orgType] || {
    accentColor: '#013388',
    accentBg: 'bg-rotary-blue',
    accentText: 'text-rotary-blue',
    badgeBg: 'bg-blue-500/20 text-white border-blue-400/30',
    heroBarBg: '#013388',
    typeLabel: 'Club Rotario',
    defaultHero: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1600&h=700&fit=crop'
  };

  useSEO({
    title: club ? `${club.officialName} · Rotary Distrito ${club.districtNumber || 4281}` : 'Directorio de Clubes · Rotary Distrito 4281',
    description: club?.description || `Perfil institucional oficial de ${club?.officialName || 'Club'} en Rotary Distrito 4281.`
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-rotary-concrete flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center py-32">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-rotary-blue border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm font-bold text-gray-500">Cargando perfil institucional...</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!club) {
    return (
      <div className="min-h-screen bg-rotary-concrete flex flex-col">
        <Navbar />
        <div className="flex-1 max-w-xl mx-auto px-6 py-24 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-100">
            <Building2 className="w-8 h-8 text-rotary-blue" />
          </div>
          <h2 className="text-2xl font-black text-gray-900 mb-2">Club No Encontrado</h2>
          <p className="text-sm text-gray-600 mb-6">
            El perfil solicitado no existe o aún se encuentra en proceso de revisión administrativa.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/clubes" className="px-6 py-2.5 bg-rotary-blue text-white font-bold rounded-xl text-xs">
              Ver Todos los Clubes
            </Link>
            <Link to="/clubes/registro" className="px-6 py-2.5 bg-gray-100 text-gray-700 font-bold rounded-xl text-xs">
              Registrar Perfil del Club
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const galleryItems = Array.isArray(club.gallery) ? club.gallery : [];

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* ─── 1. HERO SECTION INSTITUCIONAL ───────────────────────────────── */}
      <section className="relative w-full min-h-[520px] md:min-h-[580px] flex items-center justify-center overflow-hidden">
        {/* Portada con overlay */}
        <div className="absolute inset-0">
          <img
            src={club.coverImageUrl || theme.defaultHero}
            alt={club.officialName}
            className="w-full h-full object-cover scale-105 animate-subtle-zoom"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/80" />
        </div>

        {/* Contenido Hero */}
        <div className="relative z-10 max-w-5xl mx-auto px-6 py-20 text-center">
          {/* Badge de Categoría y Distrito */}
          <div className="inline-flex items-center gap-2 backdrop-blur-md px-4 py-1.5 rounded-full text-xs font-black tracking-widest uppercase mb-6 border shadow-sm animate-fade-in-down" style={{ backgroundColor: `${theme.accentColor}33`, borderColor: `${theme.accentColor}66`, color: '#ffffff' }}>
            <Sparkles className="w-3.5 h-3.5" />
            <span>{theme.typeLabel} · Distrito {club.districtNumber || 4281}</span>
          </div>

          {/* Logotipo del Club */}
          {club.logoUrl && (
            <div className="flex justify-center mb-6">
              <div className="p-3 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-white/20 inline-block">
                <img src={club.logoUrl} alt={club.officialName} className="h-16 md:h-20 w-auto object-contain" />
              </div>
            </div>
          )}

          {/* Nombre Oficial */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white mb-4 drop-shadow-lg tracking-tight">
            {club.officialName}
          </h1>

          {/* Lema o Subtítulo */}
          {club.motto && (
            <p className="text-lg md:text-xl text-white/90 max-w-2xl mx-auto font-light italic mb-4">
              "{club.motto}"
            </p>
          )}

          {/* Metadatos Rápidos */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-bold text-white/80">
            {club.city && (
              <span className="inline-flex items-center gap-1.5 bg-black/30 backdrop-blur-sm px-3 py-1 rounded-full border border-white/10">
                <MapPin className="w-3.5 h-3.5 text-yellow-400" /> {club.city}{club.state ? `, ${club.state}` : ''}
              </span>
            )}
            {club.foundationYear && (
              <span className="inline-flex items-center gap-1.5 bg-black/30 backdrop-blur-sm px-3 py-1 rounded-full border border-white/10">
                <Calendar className="w-3.5 h-3.5 text-yellow-400" /> Fundado en {club.foundationYear}
              </span>
            )}
            {club.rotaryPeriod && (
              <span className="inline-flex items-center gap-1.5 bg-black/30 backdrop-blur-sm px-3 py-1 rounded-full border border-white/10">
                <Award className="w-3.5 h-3.5 text-yellow-400" /> Período {club.rotaryPeriod}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* ─── 2. BARRA DE ESTADÍSTICAS FLOTANTE ──────────────────────────── */}
      <section className="bg-rotary-concrete relative flex flex-col">
        <div className="relative z-20 -mt-14 sm:-mt-16 max-w-5xl mx-auto px-4 w-full">
          <div
            className="grid grid-cols-1 md:grid-cols-3 gap-0 rounded-3xl overflow-hidden shadow-2xl border border-white/10 text-white"
            style={{ backgroundColor: theme.heroBarBg }}
          >
            <div className="p-6 sm:p-8 text-center border-b md:border-b-0 md:border-r border-white/10">
              <Users className="w-7 h-7 mx-auto mb-2 opacity-90" />
              <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                {club.currentPresident || 'Presidente en Ejercicio'}
              </h3>
              <p className="text-[11px] font-bold text-white/70 uppercase tracking-widest mt-1">Liderazgo {club.rotaryPeriod || '2026–2027'}</p>
            </div>
            <div className="p-6 sm:p-8 text-center border-b md:border-b-0 md:border-r border-white/10">
              <MapPin className="w-7 h-7 mx-auto mb-2 opacity-90" />
              <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                {club.city || 'Sede Distrital'}
              </h3>
              <p className="text-[11px] font-bold text-white/70 uppercase tracking-widest mt-1">{club.state || 'Colombia'}</p>
            </div>
            <div className="p-6 sm:p-8 text-center">
              <Clock className="w-7 h-7 mx-auto mb-2 opacity-90" />
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight truncate">
                {club.meetingSchedule || 'Reunión Periódica'}
              </h3>
              <p className="text-[11px] font-bold text-white/70 uppercase tracking-widest mt-1">Sesiones de Club</p>
            </div>
          </div>
        </div>

        {/* ─── 3. PRESENTACIÓN E HISTORIA ───────────────────────────────── */}
        <div className="py-14 md:py-20 max-w-5xl mx-auto px-6 w-full space-y-12">
          {/* Descripción / Propósito */}
          {club.description && (
            <div className="text-center max-w-4xl mx-auto">
              <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight mb-6">
                Nuestro Club y Compromiso con la Comunidad
              </h2>
              <p className="text-lg md:text-xl text-gray-700 font-light leading-relaxed">
                {club.description}
              </p>
            </div>
          )}

          {/* Historia si está disponible */}
          {club.history && (
            <div className="bg-white p-8 md:p-12 rounded-3xl shadow-sm border border-gray-100">
              <span className="text-xs font-black text-rotary-blue uppercase tracking-widest block mb-2">Trayectoria y Servicio</span>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Historia y Orígenes</h3>
              <p className="text-base text-gray-700 leading-relaxed font-light whitespace-pre-line">
                {club.history}
              </p>
            </div>
          )}

          {/* Áreas de Interés / Enfoque */}
          {Array.isArray(club.serviceAreas) && club.serviceAreas.length > 0 && (
            <div>
              <div className="text-center mb-6">
                <span className="text-xs font-black text-rotary-blue uppercase tracking-widest">Compromiso Global</span>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">Áreas de Enfoque y Servicio</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {club.serviceAreas.map(area => (
                  <div key={area} className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm text-center flex flex-col items-center justify-center">
                    <Heart className="w-5 h-5 text-rotary-blue mb-2" />
                    <span className="text-xs font-bold text-gray-800">{area}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── 4. PROYECTOS Y ACTIVIDADES DESTACADAS ────────────────────── */}
          {Array.isArray(club.featuredProjects) && club.featuredProjects.length > 0 && (
            <div>
              <div className="text-center mb-8">
                <span className="text-xs font-black text-rotary-blue uppercase tracking-widest">Impacto en la Comunidad</span>
                <h3 className="text-3xl font-extrabold text-gray-900 mt-1">Proyectos e Iniciativas de Servicio</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {club.featuredProjects.map((p, idx) => (
                  <div key={idx} className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-between">
                    <div>
                      {p.impact && (
                        <span className="inline-block px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold mb-3 border border-emerald-100">
                          {p.impact}
                        </span>
                      )}
                      <h4 className="text-xl font-bold text-gray-900 mb-2">{p.title}</h4>
                      <p className="text-sm text-gray-600 leading-relaxed font-light">{p.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── 5. GALERÍA MULTIMEDIA ───────────────────────────────────── */}
          {galleryItems.length > 0 && (
            <div>
              <div className="text-center mb-6">
                <span className="text-xs font-black text-rotary-blue uppercase tracking-widest">Registro Fotográfico</span>
                <h3 className="text-3xl font-extrabold text-gray-900 mt-1">Nuestra Comunidad en Acción</h3>
              </div>

              {/* Visor Principal */}
              <div className="relative aspect-video rounded-3xl overflow-hidden shadow-xl ring-1 ring-gray-200 bg-black mb-4">
                <img
                  src={galleryItems[currentGalleryIdx]?.url}
                  alt={galleryItems[currentGalleryIdx]?.caption || `Foto ${currentGalleryIdx + 1}`}
                  className="w-full h-full object-cover transition-all duration-300"
                />

                {galleryItems.length > 1 && (
                  <>
                    <button
                      onClick={() => setCurrentGalleryIdx(prev => (prev - 1 + galleryItems.length) % galleryItems.length)}
                      className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/90 hover:bg-white rounded-full shadow-lg flex items-center justify-center transition-colors text-gray-800"
                      aria-label="Foto anterior"
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </button>
                    <button
                      onClick={() => setCurrentGalleryIdx(prev => (prev + 1) % galleryItems.length)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/90 hover:bg-white rounded-full shadow-lg flex items-center justify-center transition-colors text-gray-800"
                      aria-label="Foto siguiente"
                    >
                      <ChevronRight className="w-6 h-6" />
                    </button>
                  </>
                )}
              </div>

              {/* Tiras de miniaturas */}
              {galleryItems.length > 1 && (
                <div className="flex justify-center gap-2 overflow-x-auto py-2">
                  {galleryItems.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentGalleryIdx(idx)}
                      className={`relative w-16 h-12 rounded-xl overflow-hidden border-2 transition-all ${
                        currentGalleryIdx === idx ? 'border-rotary-blue scale-105' : 'border-transparent opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={item.url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── 6. LIDERAZGO Y JUNTA DIRECTIVA ─────────────────────────── */}
          {Array.isArray(club.boardMembers) && club.boardMembers.length > 0 && (
            <div>
              <div className="text-center mb-6">
                <span className="text-xs font-black text-rotary-blue uppercase tracking-widest">Cuadro Directivo</span>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">Junta Directiva {club.rotaryPeriod || '2026–2027'}</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {club.boardMembers.map((m, idx) => (
                  <div key={idx} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-rotary-blue flex items-center justify-center font-bold text-sm shrink-0">
                      {m.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{m.name}</p>
                      <p className="text-xs text-gray-500 font-semibold">{m.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── 7. CONTACTO, REUNIONES Y REDES ──────────────────────────── */}
          <div className="bg-white p-8 md:p-12 rounded-3xl shadow-sm border border-gray-100">
            <div className="text-center mb-8">
              <span className="text-xs font-black text-rotary-blue uppercase tracking-widest">Conexión Directa</span>
              <h3 className="text-3xl font-extrabold text-gray-900 mt-1">Contacto y Reuniones</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Sede y Horario */}
              <div className="space-y-4">
                <h4 className="text-sm font-black text-gray-800 uppercase tracking-wider">Lugar y Horario de Sesión</h4>
                {club.meetingAddress && (
                  <div className="flex items-start gap-3 text-sm text-gray-700">
                    <MapPin className="w-5 h-5 text-rotary-blue shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Lugar habitual:</p>
                      <p>{club.meetingAddress}</p>
                      <p className="text-xs text-gray-500">{club.city}, {club.state || 'Colombia'}</p>
                    </div>
                  </div>
                )}
                {club.meetingSchedule && (
                  <div className="flex items-start gap-3 text-sm text-gray-700">
                    <Clock className="w-5 h-5 text-rotary-blue shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Día y Hora:</p>
                      <p>{club.meetingSchedule}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Canales Oficiales */}
              <div className="space-y-4">
                <h4 className="text-sm font-black text-gray-800 uppercase tracking-wider">Canales de Comunicación</h4>
                {club.contactEmail && (
                  <div className="flex items-center gap-3 text-sm text-gray-700">
                    <Mail className="w-5 h-5 text-rotary-blue shrink-0" />
                    <a href={`mailto:${club.contactEmail}`} className="hover:underline font-semibold">{club.contactEmail}</a>
                  </div>
                )}
                {club.contactPhone && (
                  <div className="flex items-center gap-3 text-sm text-gray-700">
                    <Phone className="w-5 h-5 text-rotary-blue shrink-0" />
                    <span className="font-semibold">{club.contactPhone}</span>
                  </div>
                )}
                {club.websiteUrl && (
                  <div className="flex items-center gap-3 text-sm text-gray-700">
                    <Globe className="w-5 h-5 text-rotary-blue shrink-0" />
                    <a href={club.websiteUrl} target="_blank" rel="noopener noreferrer" className="hover:underline font-semibold flex items-center gap-1">
                      Sitio Web Oficial <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Oportunidad de Vinculación */}
            {club.joinInfo && (
              <div className="mt-8 pt-8 border-t border-gray-100 bg-blue-50/50 p-6 rounded-2xl border border-blue-100">
                <h4 className="text-base font-bold text-rotary-blue mb-2">¿Cómo unirte o participar con nuestro club?</h4>
                <p className="text-sm text-gray-700 leading-relaxed font-light">{club.joinInfo}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ─── 8. CTA DE CIERRE CON TEXTURA GEO ───────────────────────────── */}
      <section
        className="py-16 md:py-20 text-white"
        style={{
          backgroundColor: '#0c3c7c',
          backgroundImage: "url('/geo-darkblue.png')",
          backgroundPosition: '50% 0',
          backgroundRepeat: 'repeat',
          backgroundSize: '71px 85px'
        }}
      >
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <h2 className="text-3xl md:text-4xl font-extrabold mb-4">
            ¿Representas a {club.officialName}?
          </h2>
          <p className="text-white/80 text-base md:text-lg mb-8 max-w-2xl mx-auto font-light leading-relaxed">
            Mantén actualizada la directiva, proyectos y canales de tu club en el Directorio Distrital Oficial 4281.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to={`/clubes/registro?draft=&club=${encodeURIComponent(club.shortName)}`}
              className="px-8 py-3.5 bg-yellow-400 hover:bg-yellow-300 text-rotary-blue font-black rounded-full shadow-lg transition-all text-sm inline-flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" /> Solicitar Actualización del Perfil
            </Link>
            <Link
              to="/clubes"
              className="px-8 py-3.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-full border border-white/20 transition-all text-sm"
            >
              Explorar Otros Clubes del Distrito
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default ClubPublicProfile;
