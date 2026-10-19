// ════════════════════════════════════════════════════════════════════════════
// Módulo Administrativo: Directorio Distrital de Clubes
// Rotary, Rotaract e Interact — Rotary Distrito 4281
// Gestión de perfiles, indicador de completitud (%), aprobación de solicitudes
// y control de publicación distrital.
// ════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import {
  Building2, Users, Search, CheckCircle2, Clock, AlertTriangle, ExternalLink,
  Edit2, Globe, Eye, EyeOff, Check, X, MessageSquare, ArrowUpRight, Filter,
  Sparkles, RefreshCw, ChevronRight, MapPin, Award, Calendar, Layers, Sliders
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../hooks/useAuth';

const API = import.meta.env.VITE_API_URL || '/api';

interface AdminClubProfile {
  id: string;
  clubId?: string;
  districtNumber: number;
  organizationType: 'rotary' | 'rotaract' | 'interact';
  officialName: string;
  shortName: string;
  slug: string;
  city?: string;
  state?: string;
  currentPresident?: string;
  rotaryPeriod?: string;
  completionPercentage: number;
  status: 'published' | 'draft' | 'archived';
  lastUpdatedPeriod?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  publishedAt?: string;
  updatedAt?: string;
}

interface AdminSubmission {
  id: string;
  trackingNumber: string;
  profileId?: string;
  districtNumber: number;
  organizationType: 'rotary' | 'rotaract' | 'interact';
  clubName: string;
  submissionType: 'create' | 'update';
  applicantName: string;
  applicantEmail: string;
  applicantPhone?: string;
  applicantRole?: string;
  status: 'recibida' | 'en_revision' | 'correcciones_solicitadas' | 'aprobada' | 'rechazada';
  payload: any;
  adminFeedback?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  history?: any[];
  createdAt: string;
}

export const DistrictClubsAdmin: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'directorio' | 'solicitudes' | 'auditoria'>('directorio');
  const [clubs, setClubs] = useState<AdminClubProfile[]>([]);
  const [submissions, setSubmissions] = useState<AdminSubmission[]>([]);
  const [stats, setStats] = useState({
    total: 0, rotary: 0, rotaract: 0, interact: 0, published: 0, drafts: 0, avgCompletion: 0
  });
  const [loading, setLoading] = useState(true);

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'rotary' | 'rotaract' | 'interact'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft' | 'needs_update'>('all');
  const [submissionStatusFilter, setSubmissionStatusFilter] = useState<string>('all');

  // Modales
  const [selectedSubmission, setSelectedSubmission] = useState<AdminSubmission | null>(null);
  const [editingProfile, setEditingProfile] = useState<AdminClubProfile | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState<any>({});
  const [reviewFeedback, setReviewFeedback] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);

  // Cargar datos
  const loadData = async () => {
    setLoading(true);
    try {
      const [configRes, listRes, subsRes] = await Promise.all([
        fetch(`${API}/district-clubs/config?district=4281`),
        fetch(`${API}/district-clubs/admin/list?district=4281`),
        fetch(`${API}/district-clubs/admin/submissions?district=4281`)
      ]);

      if (configRes.ok) {
        const confData = await configRes.json();
        if (confData.stats) setStats(confData.stats);
      }
      if (listRes.ok) {
        const listData = await listRes.json();
        setClubs(listData.clubs || []);
      }
      if (subsRes.ok) {
        const subsData = await subsRes.json();
        setSubmissions(subsData.submissions || []);
      }
    } catch (err) {
      console.warn('Error loading district clubs admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtrado de clubes
  const filteredClubs = useMemo(() => {
    return clubs.filter(c => {
      if (typeFilter !== 'all' && c.organizationType !== typeFilter) return false;
      if (statusFilter === 'published' && c.status !== 'published') return false;
      if (statusFilter === 'draft' && c.status !== 'draft') return false;
      if (statusFilter === 'needs_update' && (c.completionPercentage || 0) >= 60) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const text = `${c.officialName} ${c.shortName} ${c.city || ''} ${c.currentPresident || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [clubs, typeFilter, statusFilter, searchQuery]);

  // Filtrado de solicitudes
  const filteredSubmissions = useMemo(() => {
    return submissions.filter(s => {
      if (submissionStatusFilter !== 'all' && s.status !== submissionStatusFilter) return false;
      return true;
    });
  }, [submissions, submissionStatusFilter]);

  // Acción de Aprobación / Rechazo de Solicitud
  const handleReviewSubmission = async (id: string, action: 'approve' | 'request_changes' | 'reject') => {
    setIsReviewing(true);
    try {
      const res = await fetch(`${API}/district-clubs/admin/submissions/${id}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({
          action,
          feedback: reviewFeedback
        })
      });

      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error al procesar solicitud');

      toast.success(
        action === 'approve'
          ? '¡Solicitud aprobada y perfil publicado exitosamente!'
          : action === 'request_changes'
          ? 'Se han solicitado correcciones al club.'
          : 'Solicitud rechazada.'
      );
      setSelectedSubmission(null);
      setReviewFeedback('');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error al revisar solicitud');
    } finally {
      setIsReviewing(false);
    }
  };

  // Acción de Publicar / Despublicar perfil
  const handleToggleStatus = async (club: AdminClubProfile) => {
    const nextStatus = club.status === 'published' ? 'draft' : 'published';
    try {
      const res = await fetch(`${API}/district-clubs/admin/profile/${club.id}/toggle-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({ status: nextStatus })
      });
      if (!res.ok) throw new Error('Error al cambiar estado');

      setClubs(prev => prev.map(c => c.id === club.id ? { ...c, status: nextStatus } : c));
      toast.success(nextStatus === 'published' ? 'Perfil publicado' : 'Perfil despublicado (guardado en borrador)');
    } catch {
      toast.error('No se pudo cambiar el estado de publicación');
    }
  };

  // Guardar edición manual
  const handleSaveProfileEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile) return;

    try {
      const res = await fetch(`${API}/district-clubs/admin/profile/${editingProfile.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify(editFormData)
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error al guardar');

      toast.success('Perfil actualizado correctamente');
      setIsEditModalOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar cambios');
    }
  };

  const getProgressColor = (pct: number) => {
    if (pct >= 80) return 'bg-emerald-500';
    if (pct >= 50) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <AdminLayout wide>
      <div className="space-y-6 pb-20">

        {/* Encabezado del Módulo */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-gray-100 pb-5">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-rotary-blue/10 text-rotary-blue rounded-full text-xs font-black uppercase tracking-wider mb-2">
              <Sparkles className="w-3.5 h-3.5" /> Rotary Distrito 4281
            </div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Directorio de Clubes</h1>
            <p className="text-sm text-gray-500">
              Administración centralizada de identidades públicas, directivas, % de completitud y flujo de aprobación.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/clubes"
              target="_blank"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-bold transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Ver Directorio Público
            </Link>
            <Link
              to="/clubes/registro"
              target="_blank"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rotary-blue hover:bg-blue-900 text-white text-xs font-bold shadow-sm transition-all"
            >
              <Building2 className="w-3.5 h-3.5" /> Nuevo Registro / Formulario
            </Link>
          </div>
        </div>

        {/* Tarjetas KPI de Estado Distrital */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs">
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Total Clubes</p>
            <h3 className="text-3xl font-black text-gray-900 mt-1">{stats.total || clubs.length}</h3>
            <p className="text-[11px] text-gray-400 mt-1">Distrito 4281 oficial</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs">
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Publicados</p>
            <h3 className="text-3xl font-black text-emerald-600 mt-1">
              {clubs.filter(c => c.status === 'published').length}
            </h3>
            <p className="text-[11px] text-gray-400 mt-1">Visibles en la web</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs">
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Solicitudes Pendientes</p>
            <h3 className="text-3xl font-black text-amber-600 mt-1">
              {submissions.filter(s => ['recibida', 'en_revision'].includes(s.status)).length}
            </h3>
            <p className="text-[11px] text-gray-400 mt-1">Por revisar o aprobar</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs">
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Promedio Avance</p>
            <h3 className="text-3xl font-black text-rotary-blue mt-1">
              {stats.avgCompletion || Math.round(clubs.reduce((acc, c) => acc + (c.completionPercentage || 0), 0) / (clubs.length || 1))}%
            </h3>
            <p className="text-[11px] text-gray-400 mt-1">Información completada</p>
          </div>
        </div>

        {/* Pestañas de Navegación del Módulo */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('directorio')}
            className={`px-6 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'directorio'
                ? 'border-rotary-blue text-rotary-blue'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Fichas de Clubes ({clubs.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('solicitudes')}
            className={`px-6 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'solicitudes'
                ? 'border-rotary-blue text-rotary-blue'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Bandeja de Solicitudes ({submissions.length})</span>
            {submissions.filter(s => s.status === 'recibida').length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </button>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            PESTAÑA 1: DIRECTORIO DE CLUBES (FICHAS CON INDICADOR %)
           ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'directorio' && (
          <div className="space-y-6">
            {/* Barra de Filtros */}
            <div className="bg-white p-4 rounded-2xl border border-gray-100 flex flex-col sm:flex-row gap-3 items-center justify-between">
              {/* Filtro de Tipo */}
              <div className="flex items-center gap-1.5 p-1 bg-gray-100 rounded-xl w-full sm:w-auto overflow-x-auto">
                {[
                  { id: 'all', label: 'Todos' },
                  { id: 'rotary', label: 'Rotary' },
                  { id: 'rotaract', label: 'Rotaract' },
                  { id: 'interact', label: 'Interact' }
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTypeFilter(t.id as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      typeFilter === t.id ? 'bg-white text-rotary-blue shadow-xs' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Buscador */}
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por club, ciudad o presidente..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold outline-none focus:border-rotary-blue bg-gray-50/50"
                />
              </div>
            </div>

            {/* Listado de Fichas Administrativas (Diseño exacto de la Imagen 2) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredClubs.map(club => {
                const pct = club.completionPercentage || 0;
                const isPublished = club.status === 'published';
                const profileUrl = `/clubes/${club.organizationType}/${club.slug}`;

                return (
                  <div
                    key={club.id}
                    className="bg-[#121316] text-white p-6 rounded-3xl border border-gray-800 shadow-md hover:border-gray-700 transition-all flex flex-col justify-between"
                  >
                    <div className="space-y-4">
                      {/* Cabecera de la ficha */}
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                            Ficha Administrativa
                          </p>
                          <h4 className="text-xl font-extrabold text-white mt-1">
                            {club.officialName}
                          </h4>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Distrito {club.districtNumber || 4281} · {club.city || 'Colombia'} · Perfil institucional
                          </p>
                        </div>

                        {/* Badge de Publicación */}
                        <span className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 ${
                          isPublished
                            ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                            : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                        }`}>
                          {isPublished ? 'Publicado' : 'Borrador'}
                        </span>
                      </div>

                      {/* Barra de Progreso e Indicador de Completitud */}
                      <div className="space-y-1.5 pt-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-gray-300 font-bold">Información completada</span>
                          <span className={`font-mono font-bold ${pct >= 70 ? 'text-emerald-400' : pct >= 40 ? 'text-amber-400' : 'text-rose-400'}`}>
                            {pct}%
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 rounded-full ${getProgressColor(pct)}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex justify-between items-center text-[11px] text-gray-400 pt-1">
                          <span>
                            {club.updatedAt ? `Última actualización: ${new Date(club.updatedAt).toLocaleDateString()}` : 'Sin actualizar'}
                          </span>
                          <span className="font-semibold text-gray-300">
                            Período {club.lastUpdatedPeriod || club.rotaryPeriod || '2026–2027'}
                          </span>
                        </div>
                      </div>

                      {/* Presidente / Contacto */}
                      {club.currentPresident && (
                        <div className="text-xs text-gray-400 flex items-center gap-1.5 pt-2 border-t border-zinc-800">
                          <Users className="w-3.5 h-3.5 text-zinc-500" />
                          <span>Presidente: <strong className="text-gray-200">{club.currentPresident}</strong></span>
                        </div>
                      )}
                    </div>

                    {/* Botonera de la Ficha */}
                    <div className="pt-5 mt-4 border-t border-zinc-800 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Link
                          to={profileUrl}
                          target="_blank"
                          className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-gray-200 text-xs font-bold transition-all inline-flex items-center gap-1.5"
                        >
                          <Eye className="w-3.5 h-3.5" /> Ver Perfil
                        </Link>
                        <button
                          onClick={() => {
                            setEditingProfile(club);
                            setEditFormData({
                              officialName: club.officialName,
                              shortName: club.shortName,
                              city: club.city || '',
                              currentPresident: club.currentPresident || '',
                              rotaryPeriod: club.rotaryPeriod || '2026–2027',
                              contactEmail: club.contactEmail || '',
                              contactPhone: club.contactPhone || ''
                            });
                            setIsEditModalOpen(true);
                          }}
                          className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-gray-200 text-xs font-bold transition-all inline-flex items-center gap-1.5"
                        >
                          <Edit2 className="w-3.5 h-3.5" /> Editar
                        </button>
                      </div>

                      <button
                        onClick={() => handleToggleStatus(club)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all ${
                          isPublished
                            ? 'text-zinc-400 hover:text-white'
                            : 'text-emerald-400 hover:text-emerald-300'
                        }`}
                      >
                        {isPublished ? 'Despublicar' : 'Publicar Ahora'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            PESTAÑA 2: BANDEJA DE SOLICITUDES Y REVISIÓN
           ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'solicitudes' && (
          <div className="space-y-4">
            {/* Filtros de Solicitudes */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {[
                { id: 'all', label: 'Todas' },
                { id: 'recibida', label: 'Recibidas' },
                { id: 'en_revision', label: 'En Revisión' },
                { id: 'correcciones_solicitadas', label: 'Correcciones Solicitadas' },
                { id: 'aprobada', label: 'Aprobadas' },
                { id: 'rechazada', label: 'Rechazadas' }
              ].map(st => (
                <button
                  key={st.id}
                  onClick={() => setSubmissionStatusFilter(st.id)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    submissionStatusFilter === st.id
                      ? 'bg-rotary-blue text-white shadow-xs'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            {filteredSubmissions.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center border border-gray-100">
                <Clock className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm font-bold text-gray-700">No hay solicitudes en este estado</p>
                <p className="text-xs text-gray-400">Las solicitudes enviadas a través del formulario público aparecerán aquí.</p>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="divide-y divide-gray-100">
                  {filteredSubmissions.map(sub => {
                    const payload = typeof sub.payload === 'string' ? JSON.parse(sub.payload) : sub.payload;

                    return (
                      <div key={sub.id} className="p-5 sm:p-6 hover:bg-gray-50/50 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-rotary-blue bg-blue-50 px-2 py-0.5 rounded">
                              {sub.trackingNumber}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-gray-100 text-gray-700">
                              {sub.organizationType}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                              sub.status === 'aprobada' ? 'bg-emerald-100 text-emerald-800' :
                              sub.status === 'recibida' ? 'bg-amber-100 text-amber-800' :
                              sub.status === 'correcciones_solicitadas' ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-700'
                            }`}>
                              {sub.status.replace('_', ' ')}
                            </span>
                          </div>

                          <h4 className="text-base font-bold text-gray-900">{sub.clubName}</h4>
                          <p className="text-xs text-gray-500">
                            Solicitante: <strong>{sub.applicantName}</strong> ({sub.applicantEmail}) · {sub.applicantRole || 'Representante'}
                          </p>
                          <p className="text-[11px] text-gray-400">
                            Recibida el {new Date(sub.createdAt).toLocaleString()}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedSubmission(sub)}
                            className="px-4 py-2 bg-rotary-blue hover:bg-blue-900 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
                          >
                            Revisar y Validar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            DRAWER / MODAL DE REVISIÓN Y APROBACIÓN DE SOLICITUD
           ════════════════════════════════════════════════════════════════ */}
        {selectedSubmission && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-100 p-6 sm:p-8 space-y-6">
              <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                <div>
                  <span className="text-xs font-mono font-bold text-rotary-blue">{selectedSubmission.trackingNumber}</span>
                  <h3 className="text-xl font-extrabold text-gray-900">{selectedSubmission.clubName}</h3>
                </div>
                <button
                  onClick={() => setSelectedSubmission(null)}
                  className="p-2 text-gray-400 hover:text-gray-700 rounded-full"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Datos de la solicitud */}
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 text-xs space-y-2">
                <p><strong>Solicitante:</strong> {selectedSubmission.applicantName} ({selectedSubmission.applicantEmail})</p>
                <p><strong>Teléfono:</strong> {selectedSubmission.applicantPhone || 'No indicado'}</p>
                <p><strong>Cargo:</strong> {selectedSubmission.applicantRole || 'Representante'}</p>
                <p><strong>Tipo de Solicitud:</strong> {selectedSubmission.submissionType === 'update' ? 'Actualización' : 'Nuevo Registro'}</p>
              </div>

              {/* Resumen del Payload */}
              {selectedSubmission.payload && (
                <div className="space-y-3 text-xs">
                  <h4 className="font-bold text-gray-800 uppercase tracking-wider text-[11px]">Datos Suministrados por el Club:</h4>
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                    <p><strong>Presidente:</strong> {selectedSubmission.payload.currentPresident} ({selectedSubmission.payload.rotaryPeriod || '2026–2027'})</p>
                    <p><strong>Ciudad:</strong> {selectedSubmission.payload.city}, {selectedSubmission.payload.state}</p>
                    <p><strong>Descripción:</strong> {selectedSubmission.payload.description}</p>
                    {selectedSubmission.payload.history && <p><strong>Historia:</strong> {selectedSubmission.payload.history}</p>}
                    {selectedSubmission.payload.meetingSchedule && <p><strong>Reunión:</strong> {selectedSubmission.payload.meetingSchedule} ({selectedSubmission.payload.meetingAddress})</p>}
                    {selectedSubmission.payload.contactEmail && <p><strong>Email contacto:</strong> {selectedSubmission.payload.contactEmail}</p>}
                  </div>
                </div>
              )}

              {/* Mensaje de retroalimentación / feedback administrativo */}
              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                  Observaciones / Retroalimentación al Club (Opcional si se solicita corrección)
                </label>
                <textarea
                  rows={3}
                  placeholder="Ej. Por favor sube una imagen de logotipo en mayor resolución o completa el nombre del presidente electo..."
                  value={reviewFeedback}
                  onChange={(e) => setReviewFeedback(e.target.value)}
                  className="w-full p-3 rounded-xl border border-gray-200 text-xs outline-none focus:border-rotary-blue resize-none"
                />
              </div>

              {/* Botonera de Aprobación */}
              <div className="border-t border-gray-100 pt-4 flex flex-col sm:flex-row items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={isReviewing}
                  onClick={() => handleReviewSubmission(selectedSubmission.id, 'request_changes')}
                  className="w-full sm:w-auto px-4 py-2.5 bg-amber-50 text-amber-700 hover:bg-amber-100 font-bold rounded-xl text-xs transition-all"
                >
                  Solicitar Correcciones
                </button>
                <button
                  type="button"
                  disabled={isReviewing}
                  onClick={() => handleReviewSubmission(selectedSubmission.id, 'reject')}
                  className="w-full sm:w-auto px-4 py-2.5 bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold rounded-xl text-xs transition-all"
                >
                  Rechazar
                </button>
                <button
                  type="button"
                  disabled={isReviewing}
                  onClick={() => handleReviewSubmission(selectedSubmission.id, 'approve')}
                  className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs transition-all shadow-md inline-flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" /> Aprobar y Publicar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            MODAL DE EDICIÓN RÁPIDA DE PERFIL
           ════════════════════════════════════════════════════════════════ */}
        {isEditModalOpen && editingProfile && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-gray-100 p-6 sm:p-8 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <h3 className="text-lg font-extrabold text-gray-900">Editar Perfil Institucional</h3>
                <button onClick={() => setIsEditModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-700">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveProfileEdit} className="space-y-4 text-xs">
                <div>
                  <label className="block font-black text-gray-700 uppercase mb-1">Nombre Oficial</label>
                  <input
                    type="text"
                    value={editFormData.officialName}
                    onChange={(e) => setEditFormData({ ...editFormData, officialName: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-gray-200 outline-none focus:border-rotary-blue"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-black text-gray-700 uppercase mb-1">Ciudad</label>
                    <input
                      type="text"
                      value={editFormData.city}
                      onChange={(e) => setEditFormData({ ...editFormData, city: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-gray-200 outline-none focus:border-rotary-blue"
                    />
                  </div>
                  <div>
                    <label className="block font-black text-gray-700 uppercase mb-1">Período Rotario</label>
                    <input
                      type="text"
                      value={editFormData.rotaryPeriod}
                      onChange={(e) => setEditFormData({ ...editFormData, rotaryPeriod: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-gray-200 outline-none focus:border-rotary-blue"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-black text-gray-700 uppercase mb-1">Presidente Actual</label>
                  <input
                    type="text"
                    value={editFormData.currentPresident}
                    onChange={(e) => setEditFormData({ ...editFormData, currentPresident: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-gray-200 outline-none focus:border-rotary-blue"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-black text-gray-700 uppercase mb-1">Correo Electrónico</label>
                    <input
                      type="email"
                      value={editFormData.contactEmail}
                      onChange={(e) => setEditFormData({ ...editFormData, contactEmail: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-gray-200 outline-none focus:border-rotary-blue"
                    />
                  </div>
                  <div>
                    <label className="block font-black text-gray-700 uppercase mb-1">Teléfono</label>
                    <input
                      type="text"
                      value={editFormData.contactPhone}
                      onChange={(e) => setEditFormData({ ...editFormData, contactPhone: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-gray-200 outline-none focus:border-rotary-blue"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 font-bold rounded-xl text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-rotary-blue hover:bg-blue-900 text-white font-black rounded-xl text-xs shadow-md"
                  >
                    Guardar Cambios
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </AdminLayout>
  );
};

export default DistrictClubsAdmin;
