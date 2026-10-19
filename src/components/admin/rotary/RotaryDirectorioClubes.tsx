// ════════════════════════════════════════════════════════════════════════════
// Módulo: Directorio de Clubes en Rotary en Acción
// Integración de captación, seguimiento, borradores, campañas y CRM
// para el Directorio Distrital de Clubes (Distrito 4281 & Multidistrito)
// ════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, Users, Search, Sparkles, Filter, ExternalLink,
  Mail, MessageSquare, ArrowRight, CheckCircle2, AlertCircle,
  Clock, TrendingUp, Send, Copy, Eye, Edit2, ShieldAlert,
  ChevronRight, RefreshCw, X, Check
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../hooks/useAuth';

const API = import.meta.env.VITE_API_URL || '/api';

interface ClubItem {
  id: string;
  officialName: string;
  shortName: string;
  slug: string;
  organizationType: 'rotary' | 'rotaract' | 'interact';
  districtNumber: number;
  city?: string;
  currentPresident?: string;
  rotaryPeriod?: string;
  completionPercentage: number;
  status: 'published' | 'draft' | 'archived';
  primaryManagerEmail?: string;
  primaryManagerName?: string;
  contactEmail?: string;
  contactPhone?: string;
  pendingProtectedChanges?: any;
  updatedAt?: string;
}

interface SubmissionItem {
  id: string;
  trackingNumber: string;
  clubName: string;
  organizationType: string;
  submissionType: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone?: string;
  applicantRole?: string;
  status: string;
  stepReached?: number;
  utmSource?: string;
  utmCampaign?: string;
  lastActiveAt?: string;
  createdAt: string;
}

export const RotaryDirectorioClubes: React.FC = () => {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [clubs, setClubs] = useState<ClubItem[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [activeSubtab, setActiveSubtab] = useState<'catalogo' | 'solicitudes' | 'borradores' | 'comunicaciones'>('catalogo');

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'rotary' | 'rotaract' | 'interact'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'in_progress' | 'incomplete' | 'with_manager' | 'without_manager'>('all');

  // Modal de Comunicaciones
  const [commModalOpen, setCommModalOpen] = useState(false);
  const [selectedClubForComm, setSelectedClubForComm] = useState<ClubItem | null>(null);
  const [commChannel, setCommChannel] = useState<'email' | 'whatsapp'>('whatsapp');
  const [commTemplateId, setCommTemplateId] = useState<string>('invitacion');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');

  // Cargar datos consolidados
  const loadData = async () => {
    setLoading(true);
    try {
      const authToken = token || localStorage.getItem('token') || '';
      const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};

      const [listRes, subsRes] = await Promise.all([
        fetch(`${API}/district-clubs/admin/list?district=4281`, { headers }),
        fetch(`${API}/district-clubs/admin/submissions?district=4281`, { headers })
      ]);

      if (listRes.ok) {
        const d = await listRes.json();
        setClubs(d.clubs || []);
      }
      if (subsRes.ok) {
        const d = await subsRes.json();
        setSubmissions(d.submissions || []);
      }
    } catch (err) {
      console.warn('Error al cargar datos de directorio en Rotary en Acción:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  // Métricas y KPIs de Embudo
  const metrics = useMemo(() => {
    const total = clubs.length || 74;
    const completed = clubs.filter(c => (c.completionPercentage || 0) >= 80).length;
    const inProgress = clubs.filter(c => (c.completionPercentage || 0) >= 30 && (c.completionPercentage || 0) < 80).length;
    const incomplete = clubs.filter(c => (c.completionPercentage || 0) < 30).length;
    const withManager = clubs.filter(c => !!c.primaryManagerEmail).length;
    const pendingSubs = submissions.filter(s => ['recibida', 'en_revision'].includes(s.status)).length;
    const drafts = submissions.filter(s => s.status === 'borrador').length;

    return {
      total,
      completed,
      inProgress,
      incomplete,
      withManager,
      pendingSubs,
      drafts,
      pctCompleted: Math.round((completed / (total || 1)) * 100),
      pctStarted: Math.round(((completed + inProgress) / (total || 1)) * 100)
    };
  }, [clubs, submissions]);

  // Filtrado de clubes
  const filteredClubs = useMemo(() => {
    return clubs.filter(c => {
      if (typeFilter !== 'all' && c.organizationType !== typeFilter) return false;
      const pct = c.completionPercentage || 0;
      if (statusFilter === 'completed' && pct < 80) return false;
      if (statusFilter === 'in_progress' && (pct < 30 || pct >= 80)) return false;
      if (statusFilter === 'incomplete' && pct >= 30) return false;
      if (statusFilter === 'with_manager' && !c.primaryManagerEmail) return false;
      if (statusFilter === 'without_manager' && c.primaryManagerEmail) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const text = `${c.officialName} ${c.shortName} ${c.city || ''} ${c.currentPresident || ''} ${c.primaryManagerEmail || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [clubs, typeFilter, statusFilter, searchQuery]);

  // Borradores pendientes
  const draftsList = useMemo(() => {
    return submissions.filter(s => s.status === 'borrador');
  }, [submissions]);

  // Plantillas de Comunicación
  const plantillas = [
    {
      id: 'invitacion',
      titulo: 'Invitación Oficial al Directorio Distrital 2026–2027',
      asunto: 'Actualiza el perfil oficial de tu club en el Directorio Distrital 4281',
      texto: (club: ClubItem | null) =>
        `Estimado(a) líder de ${club?.officialName || 'su club rotario'},\n\nLe invitamos cordialmente a registrar o actualizar el perfil institucional de su club en el Directorio Distrital Oficial de Rotary Distrito 4281 para el período 2026–2027.\n\nPuede acceder directamente al formulario institucional aquí:\nhttps://rotary4281.org/clubes/registro?club=${club?.slug || ''}&utm_source=rotary_en_accion&utm_campaign=directorio_invitacion\n\nEl proceso toma solo unos minutos y asegura que la comunidad conozca sus proyectos, junta directiva y canales de contacto.\n\nAtentamente,\nComité Distrital de Imagen Pública · Rotary Distrito 4281`
    },
    {
      id: 'borrador_recordatorio',
      titulo: 'Recordatorio: Formulario Incompleto / Borrador Pendiente',
      asunto: 'Continúa el registro de tu club en el Directorio Distrital',
      texto: (club: ClubItem | null) =>
        `Hola, te recordamos que tienes un borrador pendiente de registro para ${club?.officialName || 'tu club'}.\n\nPuedes continuar exactamente donde lo dejaste ingresando al formulario distrital:\nhttps://rotary4281.org/clubes/registro?club=${club?.slug || ''}&utm_source=rotary_en_accion&utm_campaign=borrador_recordatorio\n\n¡Falta muy poco para publicar el perfil oficial de tu club!\n\nRotary en Acción · Distrito 4281`
    },
    {
      id: 'informacion_faltante',
      titulo: 'Completar Información Institucional (< 60% avance)',
      asunto: 'Mejora la visibilidad del perfil de tu club en Rotary Distrito 4281',
      texto: (club: ClubItem | null) =>
        `Apreciado(a) presidente y directiva de ${club?.officialName || 'su club'},\n\nEl perfil de su club cuenta actualmente con un ${club?.completionPercentage || 0}% de completitud. Le invitamos a ingresar al Portal de Autogestión para incorporar sus proyectos destacados, fotografías de obras y junta directiva completa:\n\nAcceso al portal:\nhttps://rotary4281.org/clubes/portal\n\nLos perfiles completos reciben mayor exposición ante la comunidad rotaria internacional.\n\nDistrito 4281 de Rotary International`
    },
    {
      id: 'felicitacion_publicacion',
      titulo: 'Confirmación y Publicación de Perfil Institucional',
      asunto: '¡Tu club ya está publicado en el Directorio Distrital 4281!',
      texto: (club: ClubItem | null) =>
        `¡Felicitaciones! El perfil institucional de ${club?.officialName || 'su club'} ha sido verificado y ya se encuentra publicado en el Directorio Distrital de Rotary.\n\nPueden compartir el enlace público oficial con su comunidad:\nhttps://rotary4281.org/clubes/${club?.organizationType || 'rotary'}/${club?.slug || ''}\n\nPodrán actualizar información en cualquier momento desde el Portal de Autogestión:\nhttps://rotary4281.org/clubes/portal\n\n¡Personas de Acción transformando comunidades!`
    },
    {
      id: 'actualizacion_periodo',
      titulo: 'Renovación de Junta Directiva (Período Rotario)',
      asunto: 'Actualización de Junta Directiva para el nuevo período rotario',
      texto: (club: ClubItem | null) =>
        `Estimados socios de ${club?.officialName || 'su club'},\n\nCon motivo del inicio del nuevo período rotario 2026–2027, les solicitamos actualizar los datos de la junta directiva entrante y presidente electo en el portal de autogestión:\nhttps://rotary4281.org/clubes/portal\n\nEsto permitirá mantener la continuidad institucional y la comunicación directa con la gobernación distrital.\n\nGobernación Rotary Distrito 4281`
    }
  ];

  const currentTemplate = plantillas.find(p => p.id === commTemplateId) || plantillas[0];

  const handleOpenComm = (club: ClubItem) => {
    setSelectedClubForComm(club);
    setRecipientPhone(club.contactPhone || '');
    setRecipientEmail(club.primaryManagerEmail || club.contactEmail || '');
    setCommModalOpen(true);
  };

  const handleSendWhatsApp = () => {
    if (!recipientPhone) {
      toast.error('Por favor ingresa un número de teléfono de destino.');
      return;
    }
    const cleanPhone = recipientPhone.replace(/\D/g, '');
    const message = currentTemplate.texto(selectedClubForComm);
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
    toast.success('Abriendo WhatsApp...');
    setCommModalOpen(false);
  };

  const handleSendEmail = () => {
    if (!recipientEmail) {
      toast.error('Por favor ingresa un correo electrónico de destino.');
      return;
    }
    const subject = encodeURIComponent(currentTemplate.asunto);
    const body = encodeURIComponent(currentTemplate.texto(selectedClubForComm));
    window.location.href = `mailto:${recipientEmail}?subject=${subject}&body=${body}`;
    toast.success('Abriendo cliente de correo...');
    setCommModalOpen(false);
  };

  const handleCopyMessage = () => {
    const text = currentTemplate.texto(selectedClubForComm);
    navigator.clipboard.writeText(text);
    toast.success('Mensaje copiado al portapapeles');
  };

  const handleCopyRegistrationLink = (club: ClubItem) => {
    const url = `https://rotary4281.org/clubes/registro?club=${club.slug}&utm_source=rotary_en_accion&utm_campaign=directorio_clubes`;
    navigator.clipboard.writeText(url);
    toast.success(`Enlace con UTM copiado para ${club.shortName}`);
  };

  return (
    <div className="space-y-6">

      {/* ── 1. CABECERA Y ACCIONES RÁPIDAS ──────────────────────────── */}
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-rotary-blue/10 text-rotary-blue rounded-full text-[11px] font-black uppercase tracking-wider mb-2">
            <Building2 className="w-3.5 h-3.5" /> Ecosistema Distrital de Clubes
          </div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">
            Directorio de Clubes · Rotary en Acción
          </h2>
          <p className="text-xs text-gray-500 mt-1 max-w-2xl leading-relaxed">
            Captación, automatización de recordatorios, embudo de completitud y trazabilidad de los 74 clubes del Distrito 4281.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/admin/directorio-clubes"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100 text-xs font-bold transition-all"
          >
            <Eye className="w-3.5 h-3.5 text-rotary-blue" />
            Panel Directorio Distrital
          </Link>
          <Link
            to="/clubes/registro?utm_source=rotary_en_accion&utm_campaign=admin_button"
            target="_blank"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rotary-blue hover:bg-blue-900 text-white text-xs font-black shadow-sm transition-all"
          >
            <Building2 className="w-3.5 h-3.5" />
            Abrir Formulario Oficial
          </Link>
        </div>
      </div>

      {/* ── 2. EMBUDO DE CONVERSIÓN Y KPIS ───────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
          <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Total Oficial</p>
          <h3 className="text-2xl font-black text-gray-900 mt-0.5">{metrics.total}</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">Catálogo Distrito 4281</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Completos (&gt;80%)</p>
          <h3 className="text-2xl font-black text-emerald-600 mt-0.5">{metrics.completed}</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">{metrics.pctCompleted}% del distrito</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
          <p className="text-[10px] font-black uppercase tracking-wider text-amber-600">En Progreso (30-80%)</p>
          <h3 className="text-2xl font-black text-amber-600 mt-0.5">{metrics.inProgress}</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">Faltan proyectos o fotos</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
          <p className="text-[10px] font-black uppercase tracking-wider text-rose-600">Incompletos (&lt;30%)</p>
          <h3 className="text-2xl font-black text-rose-600 mt-0.5">{metrics.incomplete}</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">Requieren contacto</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
          <p className="text-[10px] font-black uppercase tracking-wider text-purple-600">Con Responsable</p>
          <h3 className="text-2xl font-black text-purple-600 mt-0.5">{metrics.withManager}</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">Cuenta de autogestión</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
          <p className="text-[10px] font-black uppercase tracking-wider text-sky-600">Borradores en Curso</p>
          <h3 className="text-2xl font-black text-sky-600 mt-0.5">{metrics.drafts}</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">Iniciaron y no enviaron</p>
        </div>
      </div>

      {/* ── 3. SUB-PESTAÑAS DE NAVEGACIÓN ─────────────────────────────── */}
      <div className="flex border-b border-gray-200 gap-2 text-xs font-black overflow-x-auto pb-1">
        <button
          onClick={() => setActiveSubtab('catalogo')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            activeSubtab === 'catalogo'
              ? 'bg-rotary-blue text-white shadow-xs'
              : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-200'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Fichas Institucionales ({filteredClubs.length})</span>
        </button>

        <button
          onClick={() => setActiveSubtab('solicitudes')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            activeSubtab === 'solicitudes'
              ? 'bg-rotary-blue text-white shadow-xs'
              : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Solicitudes y Actualizaciones ({submissions.length})</span>
        </button>

        <button
          onClick={() => setActiveSubtab('borradores')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            activeSubtab === 'borradores'
              ? 'bg-rotary-blue text-white shadow-xs'
              : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Borradores y Abandono ({draftsList.length})</span>
        </button>

        <button
          onClick={() => setActiveSubtab('comunicaciones')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            activeSubtab === 'comunicaciones'
              ? 'bg-rotary-blue text-white shadow-xs'
              : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-200'
          }`}
        >
          <Send className="w-4 h-4" />
          <span>Automatización y Plantillas</span>
        </button>
      </div>

      {/* ── 4. SUB-TAB 1: CATÁLOGO DE CLUBES ──────────────────────────── */}
      {activeSubtab === 'catalogo' && (
        <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4">
          {/* Barra de Filtros y Búsqueda */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex p-1 bg-gray-100 rounded-xl">
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

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold bg-white text-gray-700 outline-none"
              >
                <option value="all">Todos los Estados</option>
                <option value="completed">Completos (&gt;80%)</option>
                <option value="in_progress">En Progreso (30–80%)</option>
                <option value="incomplete">Incompletos (&lt;30%)</option>
                <option value="with_manager">Con Responsable Asignado</option>
                <option value="without_manager">Sin Responsable</option>
              </select>
            </div>

            <div className="relative w-full lg:w-72">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por club, ciudad o responsable..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold outline-none focus:border-rotary-blue bg-gray-50/50"
              />
            </div>
          </div>

          {/* Tabla de Clubes */}
          {loading ? (
            <div className="py-16 text-center text-gray-400 text-xs">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-rotary-blue" />
              Cargando directorio de clubes...
            </div>
          ) : filteredClubs.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-xs">
              No se encontraron clubes con los filtros seleccionados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 text-[10px] font-black uppercase text-gray-400 tracking-wider">
                    <th className="py-3 px-3">Club y Tipo</th>
                    <th className="py-3 px-3">Ciudad Sede</th>
                    <th className="py-3 px-3">Responsable Institucional</th>
                    <th className="py-3 px-3 text-center">Avance</th>
                    <th className="py-3 px-3 text-right">Acciones de Captación / CRM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredClubs.map(club => {
                    const pct = club.completionPercentage || 0;
                    const isCompleted = pct >= 80;
                    return (
                      <tr key={club.id} className="hover:bg-gray-50/70 transition-colors">
                        <td className="py-3 px-3">
                          <div className="font-extrabold text-gray-900 text-sm">
                            {club.officialName}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-gray-100 text-gray-600">
                              {club.organizationType}
                            </span>
                            {club.currentPresident && (
                              <span className="text-[11px] text-gray-400">
                                Pres: <strong className="text-gray-700">{club.currentPresident}</strong>
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-gray-600 font-medium">
                          {club.city || 'Distrito 4281'}
                        </td>

                        <td className="py-3 px-3">
                          {club.primaryManagerEmail ? (
                            <div>
                              <div className="font-bold text-gray-800">{club.primaryManagerName || 'Responsable'}</div>
                              <div className="text-[11px] text-rotary-blue font-mono">{club.primaryManagerEmail}</div>
                              {club.contactPhone && (
                                <div className="text-[10px] text-gray-400">{club.contactPhone}</div>
                              )}
                            </div>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              Sin asignar
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-center">
                          <div className="inline-flex flex-col items-center gap-1">
                            <span className={`font-mono font-black text-xs ${isCompleted ? 'text-emerald-600' : pct >= 40 ? 'text-amber-600' : 'text-rose-600'}`}>
                              {pct}%
                            </span>
                            <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${isCompleted ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleCopyRegistrationLink(club)}
                              title="Copiar enlace con UTM para el club"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-rotary-blue hover:bg-gray-100 transition-colors"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => handleOpenComm(club)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rotary-blue/10 hover:bg-rotary-blue hover:text-white text-rotary-blue text-[11px] font-black transition-all"
                            >
                              <Send className="w-3 h-3" />
                              Contactar
                            </button>

                            <Link
                              to={`/clubes/${club.organizationType}/${club.slug}`}
                              target="_blank"
                              title="Ver ficha pública"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── 5. SUB-TAB 2: BANDEJA DE SOLICITUDES ───────────────────────── */}
      {activeSubtab === 'solicitudes' && (
        <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4">
          <div className="border-b border-gray-100 pb-3">
            <h3 className="text-base font-extrabold text-gray-900">Solicitudes Institucionales Recibidas</h3>
            <p className="text-xs text-gray-500">Registros y actualizaciones de perfil remitidos por los clubes.</p>
          </div>

          {submissions.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-xs">
              No hay solicitudes registradas aún.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 text-[10px] font-black uppercase text-gray-400 tracking-wider">
                    <th className="py-3 px-3">Radicado / Club</th>
                    <th className="py-3 px-3">Tipo Solicitud</th>
                    <th className="py-3 px-3">Responsable Solicitante</th>
                    <th className="py-3 px-3">Campaña / UTM</th>
                    <th className="py-3 px-3 text-center">Estado</th>
                    <th className="py-3 px-3 text-right">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {submissions.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50/70">
                      <td className="py-3 px-3">
                        <span className="font-mono font-bold text-rotary-blue">{s.trackingNumber}</span>
                        <div className="font-bold text-gray-900 mt-0.5">{s.clubName}</div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-gray-100 text-gray-700">
                          {s.submissionType === 'update' ? 'Actualización' : 'Registro Inicial'}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-gray-800">{s.applicantName}</div>
                        <div className="text-[11px] text-gray-500 font-mono">{s.applicantEmail}</div>
                      </td>
                      <td className="py-3 px-3 text-[11px] text-gray-500">
                        {s.utmCampaign || s.utmSource ? (
                          <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-bold border border-purple-200">
                            {s.utmCampaign || s.utmSource}
                          </span>
                        ) : (
                          'Directo / Orgánico'
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          s.status === 'aprobada'
                            ? 'bg-emerald-100 text-emerald-800'
                            : s.status === 'borrador'
                            ? 'bg-zinc-100 text-zinc-600'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right text-gray-400 text-[11px]">
                        {new Date(s.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── 6. SUB-TAB 3: BORRADORES Y ABANDONO ───────────────────────── */}
      {activeSubtab === 'borradores' && (
        <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4">
          <div className="border-b border-gray-100 pb-3">
            <h3 className="text-base font-extrabold text-gray-900">Borradores en Curso y Trazabilidad de Abandono</h3>
            <p className="text-xs text-gray-500">
              Identifica los clubes que iniciaron el formulario y en qué paso se detuvieron para re-engancharlos con recordatorios automáticos.
            </p>
          </div>

          {draftsList.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-xs">
              No hay borradores incompletos pendientes de envío en este momento.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 text-[10px] font-black uppercase text-gray-400 tracking-wider">
                    <th className="py-3 px-3">Club</th>
                    <th className="py-3 px-3">Contacto / Solicitante</th>
                    <th className="py-3 px-3 text-center">Paso Alcanzado</th>
                    <th className="py-3 px-3">Última Actividad</th>
                    <th className="py-3 px-3 text-right">Acción de Recuperación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {draftsList.map(draft => (
                    <tr key={draft.id} className="hover:bg-gray-50/70">
                      <td className="py-3 px-3">
                        <div className="font-extrabold text-gray-900">{draft.clubName}</div>
                        <div className="text-[10px] font-mono text-gray-400">{draft.trackingNumber}</div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-bold text-gray-800">{draft.applicantName || 'Sin registrar'}</div>
                        <div className="text-[11px] text-gray-500 font-mono">{draft.applicantEmail}</div>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span className="inline-block px-2.5 py-1 rounded-full text-xs font-black bg-sky-50 text-sky-700 border border-sky-200">
                          Paso {draft.stepReached || 1} de 7
                        </span>
                      </td>

                      <td className="py-3 px-3 text-gray-500 text-[11px]">
                        {draft.lastActiveAt ? new Date(draft.lastActiveAt).toLocaleString() : 'Reciente'}
                      </td>

                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => {
                            const clubMatch = clubs.find(c => c.officialName.toLowerCase().includes(draft.clubName.toLowerCase()));
                            if (clubMatch) {
                              setSelectedClubForComm(clubMatch);
                              setCommTemplateId('borrador_recordatorio');
                              setCommModalOpen(true);
                            } else {
                              toast.info('Iniciando recordatorio...');
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-black text-[11px] font-black shadow-xs transition-all"
                        >
                          <Send className="w-3 h-3" />
                          Enviar Recordatorio
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── 7. SUB-TAB 4: COMUNICACIONES Y PLANTILLAS ─────────────────── */}
      {activeSubtab === 'comunicaciones' && (
        <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-6">
          <div className="border-b border-gray-100 pb-3">
            <h3 className="text-base font-extrabold text-gray-900">Plantillas y Automatizaciones del Directorio</h3>
            <p className="text-xs text-gray-500">
              Comunicaciones institucionales prediseñadas para captación, recordatorios y seguimiento con WhatsApp y Email CRM.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {plantillas.map(p => (
              <div key={p.id} className="p-5 rounded-2xl border border-gray-200 bg-gray-50/60 hover:border-rotary-blue transition-all space-y-3 flex flex-col justify-between">
                <div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-rotary-blue/10 text-rotary-blue">
                    Plantilla Oficial
                  </span>
                  <h4 className="text-sm font-extrabold text-gray-900 mt-1">{p.titulo}</h4>
                  <p className="text-[11px] font-semibold text-gray-600 mt-1">Asunto: "{p.asunto}"</p>
                  <p className="text-xs text-gray-500 mt-2 line-clamp-3 italic">
                    "{p.texto(clubs[0] || null)}"
                  </p>
                </div>

                <div className="pt-3 border-t border-gray-200 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-gray-400">Canal: WhatsApp & Email</span>
                  <button
                    onClick={() => {
                      setCommTemplateId(p.id);
                      setSelectedClubForComm(clubs[0] || null);
                      setCommModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rotary-blue hover:bg-blue-900 text-white text-xs font-bold shadow-xs transition-all"
                  >
                    <Send className="w-3.5 h-3.5" /> Probar / Enviar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MODAL DE ENVÍO DE COMUNICACIONES (EMAIL / WHATSAPP) ────────── */}
      {commModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase text-rotary-blue bg-blue-50 px-2 py-0.5 rounded-full">
                  Rotary en Acción · CRM
                </span>
                <h3 className="text-lg font-black text-gray-900 mt-1">
                  Enviar Comunicación: {selectedClubForComm?.shortName || 'Club'}
                </h3>
              </div>
              <button
                onClick={() => setCommModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Selector de Canal: WhatsApp vs Email */}
            <div className="flex border-b border-gray-100 pb-2 gap-2">
              <button
                onClick={() => setCommChannel('whatsapp')}
                className={`flex-1 py-2 text-xs font-black uppercase rounded-xl transition-all ${
                  commChannel === 'whatsapp' ? 'bg-emerald-600 text-white shadow-xs' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                WhatsApp CRM
              </button>
              <button
                onClick={() => setCommChannel('email')}
                className={`flex-1 py-2 text-xs font-black uppercase rounded-xl transition-all ${
                  commChannel === 'email' ? 'bg-rotary-blue text-white shadow-xs' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                Correo Electrónico
              </button>
            </div>

            {/* Selector de Plantilla */}
            <div>
              <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                Plantilla Seleccionada
              </label>
              <select
                value={commTemplateId}
                onChange={(e) => setCommTemplateId(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-bold outline-none bg-white"
              >
                {plantillas.map(p => (
                  <option key={p.id} value={p.id}>{p.titulo}</option>
                ))}
              </select>
            </div>

            {/* Destinatario */}
            {commChannel === 'whatsapp' ? (
              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                  Número de Teléfono / WhatsApp Destino
                </label>
                <input
                  type="tel"
                  placeholder="+57 312 456 7890"
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-bold outline-none"
                />
              </div>
            ) : (
              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                  Correo Electrónico Destino
                </label>
                <input
                  type="email"
                  placeholder="presidente@club.org"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-bold outline-none"
                />
              </div>
            )}

            {/* Vista Previa del Mensaje */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-gray-700 uppercase">
                  Vista Previa con Variables
                </label>
                <button
                  type="button"
                  onClick={handleCopyMessage}
                  className="text-[10px] text-rotary-blue font-bold hover:underline inline-flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" /> Copiar Texto
                </button>
              </div>
              <textarea
                readOnly
                rows={5}
                value={currentTemplate.texto(selectedClubForComm)}
                className="w-full p-3 rounded-xl border border-gray-200 bg-gray-50 text-xs font-mono text-gray-700 outline-none"
              />
            </div>

            {/* Botonera de Envío */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={() => setCommModalOpen(false)}
                className="px-4 py-2 rounded-xl text-gray-600 hover:bg-gray-100 text-xs font-bold"
              >
                Cancelar
              </button>
              {commChannel === 'whatsapp' ? (
                <button
                  onClick={handleSendWhatsApp}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md inline-flex items-center gap-1.5"
                >
                  <MessageSquare className="w-4 h-4" /> Enviar por WhatsApp
                </button>
              ) : (
                <button
                  onClick={handleSendEmail}
                  className="px-5 py-2.5 rounded-xl bg-rotary-blue hover:bg-blue-900 text-white text-xs font-black shadow-md inline-flex items-center gap-1.5"
                >
                  <Mail className="w-4 h-4" /> Enviar por Correo
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default RotaryDirectorioClubes;
