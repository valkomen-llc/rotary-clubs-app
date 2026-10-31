// ════════════════════════════════════════════════════════════════════════════
// Módulo Administrativo: Directorio Distrital de Clubes — v4.1214.0
// Rotary, Rotaract e Interact — Rotary Distrito 4281 & Multidistrito
//
// MÓDULO A — FUENTE MAESTRA DE INFORMACIÓN INSTITUCIONAL:
// 1. Catálogo Oficial completo de los 74 clubes del Distrito 4281.
// 2. Trazabilidad 360°: Identidad, Liderazgo, Completitud, Historial y Auditoría.
// 3. Estado de participación en Rotary en Acción (Sin iniciar, Borrador, Solicitud, Actualizado).
// 4. Aprobación y aislamiento de cambios institucionales protegidos.
// 5. Herramientas directas de CRM y contacto multicanal (Email / WhatsApp).
// ════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import {
  Building2, Users, Search, CheckCircle2, Clock, ExternalLink,
  Edit2, Eye, X, Sparkles, AlertCircle, ShieldAlert, Send, Phone,
  Mail, ChevronRight, FileText, Check, AlertTriangle, Layers,
  Compass, MapPin, Globe, Calendar, Award, RefreshCw, MessageSquare,
  Copy, ShieldCheck, ArrowRight, Shield
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../hooks/useAuth';
import { RotaryMarketingInteligente } from '../../components/admin/rotary/RotaryMarketingInteligente';
import ClubInstitutionalPanel from '../../components/admin/rotary/ClubInstitutionalPanel';
import ClubGovernorVisitsPanel from '../../components/admin/rotary/ClubGovernorVisitsPanel';
import ClubCatalogMaster from '../../components/admin/clubs/ClubCatalogMaster';

const API = import.meta.env.VITE_API_URL || '/api';
const getAuthToken = () => localStorage.getItem('rotary_token') || localStorage.getItem('token') || '';

export interface AdminClubProfile {
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
  sponsorClubId?: string;
  sponsorClubName?: string;
  currentPresident?: string;
  rotaryPeriod?: string;
  foundationYear?: number;
  completionPercentage: number;
  status: 'published' | 'draft' | 'archived';
  lastUpdatedPeriod?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  websiteUrl?: string;
  primaryManagerEmail?: string;
  primaryManagerName?: string;
  primaryManagerPhone?: string;
  pendingProtectedChanges?: any;
  submissionsCount?: number;
  pendingSubmissionsCount?: number;
  draftsCount?: number;
  lastSubmissionActivity?: string;
  rotaryActivityStatus?: 'sin_iniciar' | 'borrador_en_curso' | 'solicitud_pendiente' | 'actualizado';
  auditLog?: any[];
  publishedAt?: string;
  updatedAt?: string;
  igi?: number;
  igiLevel?: 'lider' | 'activo' | 'en_seguimiento' | 'critico';
  igiLevelLabel?: string;
  igiBadgeColor?: string;
  igiData?: any;
}

export interface AdminSubmission {
  id: string;
  trackingNumber: string;
  profileId?: string;
  districtNumber: number;
  organizationType: 'rotary' | 'rotaract' | 'interact';
  clubName: string;
  sponsorClubId?: string;
  sponsorClubName?: string;
  submissionType: 'create' | 'update';
  applicantName: string;
  applicantEmail: string;
  applicantPhone?: string;
  applicantRole?: string;
  status: 'recibida' | 'en_revision' | 'correcciones_solicitadas' | 'aprobada' | 'rechazada' | 'borrador';
  stepReached?: number;
  payload: any;
  adminFeedback?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  history?: any[];
  utmSource?: string;
  utmCampaign?: string;
  lastActiveAt?: string;
  createdAt: string;
  clubIgi?: number;
  clubIgiLevel?: string;
  clubIgiLabel?: string;
  clubIgiBadgeColor?: string;
}

export const DistrictClubsAdmin: React.FC = () => {
  const { user, token } = useAuth();
  const [params, setParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<'directorio' | 'catalogo' | 'solicitudes' | 'marketing'>('directorio');
  const [clubs, setClubs] = useState<AdminClubProfile[]>([]);
  const [submissions, setSubmissions] = useState<AdminSubmission[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    published: 0,
    drafts: 0,
    incomplete: 0,
    completed: 0,
    inProgress: 0,
    withManager: 0,
    pendingUpdates: 0,
    activeInRotary: 0,
    avgCompletion: 0,
    avgIGI: 0,
    igiLideres: 0,
    igiActivos: 0,
    igiSeguimiento: 0,
    igiCriticos: 0
  });
  const [loading, setLoading] = useState(true);

  // Filtros del Catálogo
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'rotary' | 'rotaract' | 'interact'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft' | 'incomplete' | 'completed' | 'in_progress'>('all');
  const [activityFilter, setActivityFilter] = useState<'all' | 'sin_iniciar' | 'borrador_en_curso' | 'solicitud_pendiente' | 'actualizado'>('all');
  const [managerFilter, setManagerFilter] = useState<'all' | 'with_manager' | 'without_manager'>('all');
  const [igiFilter, setIgiFilter] = useState<'all' | 'lider' | 'activo' | 'en_seguimiento' | 'critico'>('all');

  // Filtros de Solicitudes
  const [submissionStatusFilter, setSubmissionStatusFilter] = useState<string>('all');

  // Modales
  const [detailClub, setDetailClub] = useState<AdminClubProfile | null>(null);
  const [detailFullData, setDetailFullData] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailTab, setDetailTab] = useState<'identidad' | 'liderazgo' | 'completitud' | 'igi' | 'rotary_accion' | 'visitas' | 'crm' | 'auditoria'>('identidad');

  const [selectedSubmission, setSelectedSubmission] = useState<AdminSubmission | null>(null);
  const [editingProfile, setEditingProfile] = useState<AdminClubProfile | null>(null);
  const [reviewingProtectedClub, setReviewingProtectedClub] = useState<AdminClubProfile | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState<any>({});
  const [reviewFeedback, setReviewFeedback] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);

  // Modal de Comunicaciones CRM
  const [commModalOpen, setCommModalOpen] = useState(false);
  const [selectedClubForComm, setSelectedClubForComm] = useState<AdminClubProfile | null>(null);
  const [commChannel, setCommChannel] = useState<'email' | 'whatsapp'>('whatsapp');
  const [commTemplateId, setCommTemplateId] = useState<string>('invitacion');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');

  // Cargar datos consolidados
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const authToken = token || getAuthToken();
      const authHeaders: Record<string, string> = {};
      if (authToken) {
        authHeaders['Authorization'] = `Bearer ${authToken}`;
      }

      const [listRes, subsRes] = await Promise.all([
        fetch(`${API}/district-clubs/admin/list?district=4281`, { headers: authHeaders }),
        fetch(`${API}/district-clubs/admin/submissions?district=4281&includeDrafts=true`, { headers: authHeaders })
      ]);

      if (listRes.ok) {
        const listData = await listRes.json();
        const loadedClubs: AdminClubProfile[] = listData.clubs || [];
        setClubs(loadedClubs);

        if (listData.stats) {
          setStats(listData.stats);
        } else {
          // Fallback cálculo en frontend si no viene en payload
          const total = loadedClubs.length;
          const published = loadedClubs.filter(c => c.status === 'published').length;
          const incomplete = loadedClubs.filter(c => (c.completionPercentage || 0) < 30).length;
          const completed = loadedClubs.filter(c => (c.completionPercentage || 0) >= 80).length;
          const inProgress = loadedClubs.filter(c => (c.completionPercentage || 0) >= 30 && (c.completionPercentage || 0) < 80).length;
          const withManager = loadedClubs.filter(c => !!c.primaryManagerEmail).length;
          const pendingUpdates = loadedClubs.filter(c => (c.pendingSubmissionsCount || 0) > 0 || !!c.pendingProtectedChanges).length;
          const activeInRotary = loadedClubs.filter(c => c.rotaryActivityStatus !== 'sin_iniciar').length;
          const avgCompletion = total > 0 ? Math.round(loadedClubs.reduce((acc, c) => acc + (c.completionPercentage || 0), 0) / total) : 0;

          setStats({
            total,
            published,
            drafts: total - published,
            incomplete,
            completed,
            inProgress,
            withManager,
            pendingUpdates,
            activeInRotary,
            avgCompletion
          });
        }
      }

      if (subsRes.ok) {
        const subsData = await subsRes.json();
        setSubmissions(subsData.submissions || []);
      }
    } catch (err) {
      console.warn('Error loading district clubs admin data:', err);
      toast.error('No se pudo conectar con el catálogo de clubes.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Si viene con parámetro ?clubId=<id>, abrir el drawer 360° automáticamente
  useEffect(() => {
    const clubIdParam = params.get('clubId');
    if (clubIdParam && clubs.length > 0) {
      const match = clubs.find(c => c.id === clubIdParam);
      if (match) {
        handleOpenClubDetail(match);
      }
    }
    const tabParam = params.get('tab');
    if (tabParam === 'solicitudes') {
      setActiveTab('solicitudes');
    } else if (tabParam === 'catalogo' || tabParam === 'catalogo-maestro') {
      setActiveTab('catalogo');
    } else if (tabParam === 'marketing') {
      setActiveTab('marketing');
    }
  }, [params, clubs]);

  // Abrir Ficha Detallada 360°
  const handleOpenClubDetail = async (club: AdminClubProfile) => {
    setDetailClub(club);
    setDetailTab('identidad');
    setLoadingDetail(true);
    try {
      const authToken = token || getAuthToken();
      const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
      const res = await fetch(`${API}/district-clubs/admin/club/${club.id}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setDetailFullData(data);
      } else {
        setDetailFullData({ club, submissions: [], accounts: [] });
      }
    } catch {
      setDetailFullData({ club, submissions: [], accounts: [] });
    } finally {
      setLoadingDetail(false);
    }
  };

  // Filtrado de clubes del Catálogo Maestro
  const filteredClubs = useMemo(() => {
    return clubs.filter(c => {
      if (typeFilter !== 'all' && c.organizationType !== typeFilter) return false;

      const pct = c.completionPercentage || 0;
      if (statusFilter === 'published' && c.status !== 'published') return false;
      if (statusFilter === 'draft' && c.status !== 'draft') return false;
      if (statusFilter === 'incomplete' && pct >= 30) return false;
      if (statusFilter === 'in_progress' && (pct < 30 || pct >= 80)) return false;
      if (statusFilter === 'completed' && pct < 80) return false;

      if (activityFilter !== 'all' && c.rotaryActivityStatus !== activityFilter) return false;

      if (managerFilter === 'with_manager' && !c.primaryManagerEmail) return false;
      if (managerFilter === 'without_manager' && c.primaryManagerEmail) return false;

      if (igiFilter !== 'all' && c.igiLevel !== igiFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const text = `${c.officialName} ${c.shortName} ${c.city || ''} ${c.state || ''} ${c.currentPresident || ''} ${c.primaryManagerName || ''} ${c.primaryManagerEmail || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [clubs, typeFilter, statusFilter, activityFilter, managerFilter, igiFilter, searchQuery]);

  // Filtrado de Solicitudes
  const filteredSubmissions = useMemo(() => {
    return submissions.filter(s => {
      if (s.status === 'borrador') return false; // En esta pestaña van solicitudes reales
      if (submissionStatusFilter !== 'all' && s.status !== submissionStatusFilter) return false;
      return true;
    });
  }, [submissions, submissionStatusFilter]);

  // Acción de Aprobación / Rechazo de Solicitud
  const handleReviewSubmission = async (id: string, action: 'approve' | 'request_changes' | 'reject') => {
    setIsReviewing(true);
    try {
      const authToken = token || getAuthToken();
      const res = await fetch(`${API}/district-clubs/admin/submissions/${id}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          action,
          feedback: reviewFeedback,
          reviewedBy: user?.name || user?.email || 'Administración Distrital 4281'
        })
      });

      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error al procesar solicitud');

      toast.success(
        action === 'approve'
          ? '¡Solicitud aprobada y ficha institucional actualizada!'
          : action === 'request_changes'
          ? 'Se solicitaron correcciones al responsable del club.'
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

  // Acción de Publicar / Pausar ficha
  const handleToggleStatus = async (club: AdminClubProfile) => {
    const nextStatus = club.status === 'published' ? 'draft' : 'published';
    try {
      const authToken = token || getAuthToken();
      const res = await fetch(`${API}/district-clubs/admin/profile/${club.id}/toggle-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ status: nextStatus })
      });
      if (!res.ok) throw new Error('Error al cambiar estado');

      setClubs(prev => prev.map(c => c.id === club.id ? { ...c, status: nextStatus } : c));
      toast.success(nextStatus === 'published' ? 'Ficha publicada en el directorio' : 'Ficha pausada (guardada en borrador)');
    } catch {
      toast.error('No se pudo cambiar el estado de publicación');
    }
  };

  // Guardar edición manual rápida
  const handleSaveProfileEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile) return;

    try {
      const authToken = token || getAuthToken();
      const res = await fetch(`${API}/district-clubs/admin/profile/${editingProfile.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
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

  // Aprobar cambios protegidos
  const handleApproveProtected = async (clubId: string) => {
    try {
      const authToken = token || getAuthToken();
      const res = await fetch(`${API}/district-clubs/admin/profile/${clubId}/approve-protected`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        }
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast.success('Cambios institucionales protegidos aprobados exitosamente');
        setReviewingProtectedClub(null);
        loadData();
      } else {
        toast.error(data.error || 'Error al aprobar cambios');
      }
    } catch {
      toast.error('Error de conexión');
    }
  };

  // Rechazar cambios protegidos
  const handleRejectProtected = async (clubId: string) => {
    try {
      const authToken = token || getAuthToken();
      const res = await fetch(`${API}/district-clubs/admin/profile/${clubId}/reject-protected`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ reason: 'Rechazado por gobernación distrital' })
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast.success('Cambios protegidos rechazados');
        setReviewingProtectedClub(null);
        loadData();
      } else {
        toast.error(data.error || 'Error al rechazar');
      }
    } catch {
      toast.error('Error de conexión');
    }
  };

  // Colores de avance
  const getProgressColor = (pct: number) => {
    if (pct >= 80) return 'bg-emerald-500';
    if (pct >= 30) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  // Plantillas de Comunicación CRM
  const plantillas = [
    {
      id: 'invitacion',
      titulo: 'Invitación a completar Ficha Institucional',
      canal: 'both',
      asunto: 'Actualización Ficha Oficial del Club en el Directorio Distrital 4281',
      mensaje: (club: AdminClubProfile) =>
        `Estimados amigos de ${club.officialName}:\n\n` +
        `Desde la Gobernación del Distrito 4281 los invitamos a completar y actualizar su Ficha Institucional en el nuevo Directorio Oficial de Clubes.\n\n` +
        `Actualmente el perfil de su club tiene un ${club.completionPercentage || 0}% de completitud. Al completarlo, su club contará con presencia web oficial, visibilidad de sus proyectos de impacto y acceso directo a la comunidad.\n\n` +
        `Pueden diligenciar la información o acceder a su portal aquí:\n` +
        `https://app.clubplatform.org/clubes/registro?club=${club.slug}&utm_source=directorio_admin&utm_campaign=invitacion\n\n` +
        `Saludos rotarios,\nComité Distrital de Comunicaciones · Distrito 4281`
    },
    {
      id: 'borrador',
      titulo: 'Recordatorio de Borrador en Curso',
      canal: 'both',
      asunto: 'Tu solicitud de actualización de Club está lista para finalizar',
      mensaje: (club: AdminClubProfile) =>
        `Hola amigos de ${club.officialName},\n\n` +
        `Notamos que iniciaron el diligenciamiento de la información de su club en el Directorio Distrital 4281 pero aún no han completado el envío.\n\n` +
        `Solo faltan pocos pasos para publicar su junta directiva y proyectos. Pueden retomar su avance directamente ingresando aquí:\n` +
        `https://app.clubplatform.org/clubes/registro?club=${club.slug}&utm_source=directorio_admin&utm_campaign=recordatorio_borrador\n\n` +
        `¡Sigamos marcando la diferencia!\nDistrito 4281`
    },
    {
      id: 'portal',
      titulo: 'Acceso al Portal de Autogestión del Club',
      canal: 'both',
      asunto: 'Acceso habilitado al Portal de Autogestión de Clubes Rotary',
      mensaje: (club: AdminClubProfile) =>
        `Estimado(a) representante de ${club.officialName},\n\n` +
        `Le confirmamos que su club tiene habilitado el Portal de Autogestión en Club Platform. Desde allí pueden editar en cualquier momento su lema, junta directiva, proyectos de servicio y galería fotográfica.\n\n` +
        `Ingresa al portal aquí:\n` +
        `https://app.clubplatform.org/clubes/portal\n\n` +
        `Si aún no has creado tu contraseña institucional, puedes solicitar la recuperación con este correo electrónico.\n\n` +
        `Comité Distrital de Tecnología · Distrito 4281`
    },
    {
      id: 'proyectos',
      titulo: 'Actualización de Proyectos de Impacto',
      canal: 'both',
      asunto: 'Visibiliza las obras de tu club en Rotary en Acción',
      mensaje: (club: AdminClubProfile) =>
        `Estimados socios de ${club.officialName},\n\n` +
        `Queremos que todo el distrito conozca los proyectos de servicio de su club. Los invitamos a actualizar sus causas y proyectos destacados en su ficha oficial para compartirlos en las campañas de Rotary en Acción:\n\n` +
        `https://app.clubplatform.org/clubes/${club.organizationType}/${club.slug}\n\n` +
        `Comité de Imagen Pública · Distrito 4281`
    }
  ];

  const handleOpenCommModal = (club: AdminClubProfile) => {
    setSelectedClubForComm(club);
    setRecipientEmail(club.primaryManagerEmail || club.contactEmail || '');
    setRecipientPhone(club.primaryManagerPhone || club.contactPhone || '');
    setCommTemplateId('invitacion');
    setCommModalOpen(true);
  };

  const currentTemplate = plantillas.find(p => p.id === commTemplateId) || plantillas[0];
  const renderedMessage = selectedClubForComm ? currentTemplate.mensaje(selectedClubForComm) : '';

  const handleSendWhatsApp = () => {
    if (!recipientPhone) {
      toast.error('Ingresa un número telefónico válido');
      return;
    }
    const cleanPhone = recipientPhone.replace(/[^\d+]/g, '');
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(renderedMessage)}`;
    window.open(url, '_blank');
    toast.success('Abriendo WhatsApp...');
  };

  const handleSendEmail = () => {
    if (!recipientEmail) {
      toast.error('Ingresa un correo destinatario');
      return;
    }
    const mailto = `mailto:${recipientEmail}?subject=${encodeURIComponent(currentTemplate.asunto)}&body=${encodeURIComponent(renderedMessage)}`;
    window.open(mailto, '_blank');
    toast.success('Abriendo cliente de correo...');
  };

  return (
    <AdminLayout wide>
      <div className="space-y-6 pb-20">

        {/* ── 1. CABECERA PRINCIPAL Y ACCIONES GLOBALES ──────────────────── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-gray-100 pb-5">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-rotary-blue/10 text-rotary-blue rounded-full text-xs font-black uppercase tracking-wider mb-2">
              <Sparkles className="w-3.5 h-3.5" /> Rotary Distrito 4281 · Catálogo Maestro
            </div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Directorio de Clubes</h1>
            <p className="text-sm text-gray-500 max-w-2xl mt-0.5">
              Administración institucional centralizada: Fichas oficiales de Rotary, Rotaract e Interact, directivas, % de completitud y trazabilidad de actualizaciones.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              to="/admin/rotary-en-accion?tab=directorio"
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold transition-all shadow-xs"
            >
              <Layers className="w-3.5 h-3.5 text-purple-600" /> Bandeja Operativa Rotary en Acción
            </Link>
            <Link
              to="/clubes"
              target="_blank"
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold transition-all shadow-xs"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Ver Directorio Público
            </Link>
            <Link
              to="/clubes/registro"
              target="_blank"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rotary-blue hover:bg-blue-900 text-white text-xs font-black shadow-sm transition-all"
            >
              <Building2 className="w-3.5 h-3.5" /> Nuevo Registro / Formulario
            </Link>
          </div>
        </div>

        {/* ── 1b. CENTRO DE INTELIGENCIA INSTITUCIONAL DEL DISTRITO 4281 (IGI) ── */}
        <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white rounded-3xl p-5 sm:p-6 shadow-lg border border-blue-900/40 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-1.5 max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-black uppercase tracking-wider border border-blue-400/30">
                <Sparkles className="w-3 h-3 text-amber-400" />
                Centro de Inteligencia Institucional · Distrito 4281
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Índice de Gestión Institucional (IGI)
              </h2>
              <p className="text-xs text-blue-200/80 leading-relaxed">
                Diferencia la completitud estática de la participación activa y gobernanza periódica. El Directorio es la fuente de verdad institucional y Rotary en Acción el motor de seguimiento.
              </p>
            </div>

            {/* Score Promedio Distrital */}
            <div className="flex items-center gap-4 bg-white/5 backdrop-blur-md px-5 py-3.5 rounded-2xl border border-white/10 shrink-0">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-300 block">IGI Promedio Distrital</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-3xl font-black text-white">{stats.avgIGI || 0}</span>
                  <span className="text-xs text-blue-300 font-bold">/ 100 pts</span>
                </div>
                <p className="text-[10px] text-blue-200/70">{stats.total || clubs.length} Clubes Evaluados</p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-400/30 flex items-center justify-center">
                <Award className="w-7 h-7 text-amber-400" />
              </div>
            </div>
          </div>

          {/* Pilares y Filtros rápidos de Nivel IGI */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-5 pt-5 border-t border-white/10 relative z-10">
            <button
              onClick={() => setIgiFilter(igiFilter === 'lider' ? 'all' : 'lider')}
              className={`p-3 rounded-2xl border text-left transition-all ${
                igiFilter === 'lider'
                  ? 'bg-emerald-500/20 border-emerald-400 shadow-md ring-1 ring-emerald-400'
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">Líder Institucional</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-300 text-[10px] font-black">&ge;80 pts</span>
              </div>
              <p className="text-xl font-black text-white mt-1">{stats.igiLideres || 0} <span className="text-xs font-normal text-emerald-300">clubes</span></p>
              <p className="text-[10px] text-emerald-200/60 mt-0.5">Perfil completo y al día</p>
            </button>

            <button
              onClick={() => setIgiFilter(igiFilter === 'activo' ? 'all' : 'activo')}
              className={`p-3 rounded-2xl border text-left transition-all ${
                igiFilter === 'activo'
                  ? 'bg-blue-500/20 border-blue-400 shadow-md ring-1 ring-blue-400'
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-400">Gestión Activa</span>
                <span className="px-2 py-0.5 rounded-full bg-blue-500/30 text-blue-300 text-[10px] font-black">60–79 pts</span>
              </div>
              <p className="text-xl font-black text-white mt-1">{stats.igiActivos || 0} <span className="text-xs font-normal text-blue-300">clubes</span></p>
              <p className="text-[10px] text-blue-200/60 mt-0.5">Participación recurrente</p>
            </button>

            <button
              onClick={() => setIgiFilter(igiFilter === 'en_seguimiento' ? 'all' : 'en_seguimiento')}
              className={`p-3 rounded-2xl border text-left transition-all ${
                igiFilter === 'en_seguimiento'
                  ? 'bg-amber-500/20 border-amber-400 shadow-md ring-1 ring-amber-400'
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">En Seguimiento</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/30 text-amber-300 text-[10px] font-black">40–59 pts</span>
              </div>
              <p className="text-xl font-black text-white mt-1">{stats.igiSeguimiento || 0} <span className="text-xs font-normal text-amber-300">clubes</span></p>
              <p className="text-[10px] text-amber-200/60 mt-0.5">Requiere recordatorios</p>
            </button>

            <button
              onClick={() => setIgiFilter(igiFilter === 'critico' ? 'all' : 'critico')}
              className={`p-3 rounded-2xl border text-left transition-all ${
                igiFilter === 'critico'
                  ? 'bg-rose-500/20 border-rose-400 shadow-md ring-1 ring-rose-400'
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-rose-400">Requiere Acompañamiento</span>
                <span className="px-2 py-0.5 rounded-full bg-rose-500/30 text-rose-300 text-[10px] font-black">&lt;40 pts</span>
              </div>
              <p className="text-xl font-black text-white mt-1">{stats.igiCriticos || 0} <span className="text-xs font-normal text-rose-300">clubes</span></p>
              <p className="text-[10px] text-rose-200/60 mt-0.5">Sin responsable o inactivo</p>
            </button>
          </div>
        </div>

        {/* ── 2. SEIS TARJETAS KPIS CON DATOS REALES (OBJETIVO 1) ────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
            <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Total Clubes</p>
            <h3 className="text-2xl font-black text-gray-900 mt-0.5">{stats.total || clubs.length}</h3>
            <p className="text-[10px] text-gray-400 mt-0.5">Distrito 4281 oficial</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Publicados</p>
            <h3 className="text-2xl font-black text-emerald-600 mt-0.5">{stats.published}</h3>
            <p className="text-[10px] text-gray-400 mt-0.5">Visibles en la web</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
            <p className="text-[10px] font-black uppercase tracking-wider text-rose-600">Incompletos (&lt;30%)</p>
            <h3 className="text-2xl font-black text-rose-600 mt-0.5">{stats.incomplete}</h3>
            <p className="text-[10px] text-gray-400 mt-0.5">Requieren acompañamiento</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-600">Actualizaciones Pendientes</p>
            <h3 className="text-2xl font-black text-amber-600 mt-0.5">{stats.pendingUpdates}</h3>
            <p className="text-[10px] text-gray-400 mt-0.5">Por revisar o aprobar</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
            <p className="text-[10px] font-black uppercase tracking-wider text-rotary-blue">Promedio Avance</p>
            <h3 className="text-2xl font-black text-rotary-blue mt-0.5">{stats.avgCompletion}%</h3>
            <p className="text-[10px] text-gray-400 mt-0.5">Completitud distrital</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
            <p className="text-[10px] font-black uppercase tracking-wider text-purple-600">Gestión Activa en Rotary</p>
            <h3 className="text-2xl font-black text-purple-600 mt-0.5">{stats.activeInRotary}</h3>
            <p className="text-[10px] text-gray-400 mt-0.5">Con solicitud o borrador</p>
          </div>
        </div>

        {/* ── 3. PESTAÑAS PRINCIPALES DEL MÓDULO ─────────────────────────── */}
        <div className="flex border-b border-gray-200 overflow-x-auto">
          <button
            onClick={() => setActiveTab('directorio')}
            className={`px-6 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'directorio'
                ? 'border-rotary-blue text-rotary-blue'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Fichas del Directorio ({clubs.length})</span>
          </button>

          {/* v4.1269 — La administración de la fuente única de clubes. */}
          <button
            onClick={() => setActiveTab('catalogo')}
            className={`px-6 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'catalogo'
                ? 'border-rotary-blue text-rotary-blue'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Catálogo Maestro</span>
          </button>

          <button
            onClick={() => setActiveTab('solicitudes')}
            className={`px-6 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'solicitudes'
                ? 'border-rotary-blue text-rotary-blue'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Bandeja de Solicitudes ({filteredSubmissions.length})</span>
            {submissions.filter(s => s.status === 'recibida').length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('marketing')}
            className={`px-6 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'marketing'
                ? 'border-purple-600 text-purple-700'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Sparkles className="w-4 h-4 text-purple-600" />
            <span>Marketing Inteligente IA</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-extrabold uppercase">
              Directorio
            </span>
          </button>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            PESTAÑA 1: CATÁLOGO MAESTRO (74 CLUBES - ENTERPRISE TABLE)
           ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'directorio' && (
          <div className="space-y-4">

            {/* Barra de Filtros Multifactorial */}
            <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex flex-col lg:flex-row gap-3 items-center justify-between">
              <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                {/* Tipo de Club */}
                <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
                  {[
                    { id: 'all', label: 'Todos' },
                    { id: 'rotary', label: 'Rotary' },
                    { id: 'rotaract', label: 'Rotaract' },
                    { id: 'interact', label: 'Interact' }
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTypeFilter(t.id as any)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                        typeFilter === t.id ? 'bg-white text-rotary-blue shadow-xs' : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Filtro de Estado / Completitud */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 bg-white outline-none focus:border-rotary-blue"
                >
                  <option value="all">Completitud: Todos</option>
                  <option value="completed">Completos (&gt;=80%)</option>
                  <option value="in_progress">En progreso (30–79%)</option>
                  <option value="incomplete">Incompletos (&lt;30%)</option>
                  <option value="published">Estado: Publicados</option>
                  <option value="draft">Estado: Borradores</option>
                </select>

                {/* Filtro de Participación en Rotary en Acción */}
                <select
                  value={activityFilter}
                  onChange={(e) => setActivityFilter(e.target.value as any)}
                  className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 bg-white outline-none focus:border-rotary-blue"
                >
                  <option value="all">Rotary en Acción: Todas</option>
                  <option value="sin_iniciar">Sin iniciar</option>
                  <option value="borrador_en_curso">Borrador en curso</option>
                  <option value="solicitud_pendiente">Solicitud pendiente</option>
                  <option value="actualizado">Actualizado</option>
                </select>

                {/* Filtro de Responsable */}
                <select
                  value={managerFilter}
                  onChange={(e) => setManagerFilter(e.target.value as any)}
                  className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 bg-white outline-none focus:border-rotary-blue"
                >
                  <option value="all">Responsable: Todos</option>
                  <option value="with_manager">Con responsable asignado</option>
                  <option value="without_manager">Sin asignar</option>
                </select>

                {/* Filtro IGI */}
                <select
                  value={igiFilter}
                  onChange={(e) => setIgiFilter(e.target.value as any)}
                  className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 bg-white outline-none focus:border-rotary-blue"
                >
                  <option value="all">Índice IGI: Todos</option>
                  <option value="lider">Líder Institucional (&ge;80)</option>
                  <option value="activo">Gestión Activa (60–79)</option>
                  <option value="en_seguimiento">En Seguimiento (40–59)</option>
                  <option value="critico">Requiere Acompañamiento (&lt;40)</option>
                </select>
              </div>

              {/* Buscador en Vivo */}
              <div className="relative w-full lg:w-72">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por club, ciudad, responsable..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold outline-none focus:border-rotary-blue bg-gray-50/50"
                />
              </div>
            </div>

            {/* TABLA INSTITUCIONAL DEL CATÁLOGO (DISEÑO CLEAN ENTERPRISE) */}
            {loading ? (
              <div className="bg-white rounded-3xl p-16 text-center border border-gray-100 shadow-sm">
                <RefreshCw className="w-8 h-8 text-rotary-blue animate-spin mx-auto mb-3" />
                <p className="text-sm font-bold text-gray-800">Cargando catálogo maestro de clubes...</p>
                <p className="text-xs text-gray-400 mt-1">Conectando con el Distrito 4281 y estados de actividad</p>
              </div>
            ) : filteredClubs.length === 0 ? (
              <div className="bg-white rounded-3xl p-16 text-center border border-gray-100 shadow-sm">
                <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-bold text-gray-700">No se encontraron clubes con los filtros aplicados</p>
                <p className="text-xs text-gray-400 mt-1">Intenta restablecer los filtros para ver el catálogo completo de 74 clubes.</p>
                <button
                  onClick={() => {
                    setTypeFilter('all');
                    setStatusFilter('all');
                    setActivityFilter('all');
                    setManagerFilter('all');
                    setIgiFilter('all');
                    setSearchQuery('');
                  }}
                  className="mt-4 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-bold transition-all"
                >
                  Restablecer Filtros
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/60 text-[10px] font-black uppercase tracking-wider text-gray-400">
                        <th className="py-3.5 px-4">Club y Tipo</th>
                        <th className="py-3.5 px-4">Ciudad Sede</th>
                        <th className="py-3.5 px-4">Responsable Institucional</th>
                        <th className="py-3.5 px-4">Completitud</th>
                        <th className="py-3.5 px-4">Índice IGI</th>
                        <th className="py-3.5 px-4">Estado</th>
                        <th className="py-3.5 px-4">Rotary en Acción</th>
                        <th className="py-3.5 px-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-xs">
                      {filteredClubs.map((club) => {
                        const pct = club.completionPercentage || 0;
                        const isPublished = club.status === 'published';
                        const profileUrl = `/clubes/${club.organizationType}/${club.slug}`;

                        const badgeColor =
                          club.organizationType === 'rotary'
                            ? 'bg-blue-50 text-rotary-blue border-blue-200'
                            : club.organizationType === 'rotaract'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-cyan-50 text-cyan-700 border-cyan-200';

                        return (
                          <tr key={club.id} className="hover:bg-gray-50/60 transition-colors">
                            {/* Club y Tipo */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-3">
                                {club.logoUrl ? (
                                  <img
                                    src={club.logoUrl}
                                    alt={club.shortName}
                                    className="w-9 h-9 rounded-xl object-contain bg-gray-50 border border-gray-100 p-1 shrink-0"
                                  />
                                ) : (
                                  <div className="w-9 h-9 rounded-xl bg-gray-100 text-gray-700 font-black text-xs flex items-center justify-center shrink-0 border border-gray-200">
                                    {club.shortName.substring(0, 2).toUpperCase()}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => handleOpenClubDetail(club)}
                                      className="font-extrabold text-gray-900 hover:text-rotary-blue transition-colors truncate text-left"
                                    >
                                      {club.officialName}
                                    </button>
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${badgeColor}`}>
                                      {club.organizationType}
                                    </span>
                                    <span className="text-[11px] text-gray-400">
                                      Período {club.lastUpdatedPeriod || club.rotaryPeriod || '2026–2027'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Ciudad */}
                            <td className="py-3.5 px-4 text-gray-600 font-medium">
                              <div>{club.city || 'Colombia'}</div>
                              {club.state && <div className="text-[10px] text-gray-400">{club.state}</div>}
                            </td>

                            {/* Responsable Institucional */}
                            <td className="py-3.5 px-4">
                              {club.primaryManagerEmail ? (
                                <div className="space-y-0.5">
                                  <p className="font-bold text-gray-900">{club.primaryManagerName || 'Gestor Registrado'}</p>
                                  <p className="text-[11px] text-gray-500 font-mono">{club.primaryManagerEmail}</p>
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-[10px] font-bold">
                                  <AlertCircle className="w-3 h-3 text-amber-500" /> Sin asignar
                                </span>
                              )}
                            </td>

                            {/* Completitud */}
                            <td className="py-3.5 px-4">
                              <div className="w-28 space-y-1">
                                <div className="flex justify-between items-center text-[10px] font-bold">
                                  <span className="text-gray-500">Avance</span>
                                  <span className={pct >= 80 ? 'text-emerald-600' : pct >= 30 ? 'text-amber-600' : 'text-rose-600'}>
                                    {pct}%
                                  </span>
                                </div>
                                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-300 ${getProgressColor(pct)}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            </td>

                            {/* Índice IGI */}
                            <td className="py-3.5 px-4">
                              <button
                                onClick={() => {
                                  handleOpenClubDetail(club);
                                  setDetailTab('igi');
                                }}
                                title="Clic para ver desglose de puntos IGI"
                                className="group text-left"
                              >
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span className="font-black text-xs text-gray-950 group-hover:text-rotary-blue transition-colors">
                                    {club.igi ?? 0}
                                  </span>
                                  <span className="text-[10px] text-gray-400">/ 100</span>
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${
                                    club.igiLevel === 'lider'
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      : club.igiLevel === 'activo'
                                      ? 'bg-blue-50 text-blue-800 border-blue-200'
                                      : club.igiLevel === 'en_seguimiento'
                                      ? 'bg-amber-50 text-amber-900 border-amber-200'
                                      : 'bg-rose-50 text-rose-800 border-rose-200'
                                  }`}>
                                    {club.igiLevelLabel || ((club.igi || 0) >= 80 ? 'Líder Institucional' : (club.igi || 0) >= 60 ? 'Gestión Activa' : (club.igi || 0) >= 40 ? 'En Seguimiento' : 'Requiere Acompañamiento')}
                                  </span>
                                </div>
                                <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      (club.igi || 0) >= 80
                                        ? 'bg-emerald-500'
                                        : (club.igi || 0) >= 60
                                        ? 'bg-blue-500'
                                        : (club.igi || 0) >= 40
                                        ? 'bg-amber-500'
                                        : 'bg-rose-500'
                                    }`}
                                    style={{ width: `${Math.min(100, club.igi || 0)}%` }}
                                  />
                                </div>
                              </button>
                            </td>

                            {/* Estado Institucional */}
                            <td className="py-3.5 px-4">
                              <button
                                onClick={() => handleToggleStatus(club)}
                                title="Clic para alternar estado de publicación"
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase transition-all ${
                                  isPublished
                                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                              >
                                {isPublished ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-600" /> Publicado
                                  </>
                                ) : (
                                  'Borrador'
                                )}
                              </button>
                            </td>

                            {/* Gestión Rotary en Acción */}
                            <td className="py-3.5 px-4">
                              {club.rotaryActivityStatus === 'solicitud_pendiente' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-900 rounded-full text-[10px] font-black uppercase border border-amber-200 animate-pulse">
                                  <Clock className="w-3 h-3 text-amber-600" /> Solicitud pendiente
                                </span>
                              ) : club.rotaryActivityStatus === 'borrador_en_curso' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-800 rounded-full text-[10px] font-bold border border-indigo-200">
                                  <Edit2 className="w-3 h-3 text-indigo-600" /> Borrador en curso
                                </span>
                              ) : club.rotaryActivityStatus === 'actualizado' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-800 rounded-full text-[10px] font-bold border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Actualizado
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-500 rounded-full text-[10px] font-medium">
                                  Sin iniciar
                                </span>
                              )}

                              {club.pendingProtectedChanges && (
                                <button
                                  onClick={() => setReviewingProtectedClub(club)}
                                  className="block mt-1 text-[9px] font-black uppercase text-amber-700 bg-amber-100 px-2 py-0.5 rounded border border-amber-300 hover:bg-amber-200"
                                >
                                  Validar Cambios
                                </button>
                              )}
                            </td>

                            {/* Acciones */}
                            <td className="py-3.5 px-4 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  onClick={() => handleOpenClubDetail(club)}
                                  title="Ver Ficha Institucional 360°"
                                  className="p-1.5 rounded-lg bg-gray-100 hover:bg-rotary-blue hover:text-white text-gray-700 transition-all"
                                >
                                  <Layers className="w-4 h-4" />
                                </button>

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
                                  title="Edición rápida"
                                  className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-all"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>

                                <button
                                  onClick={() => handleOpenCommModal(club)}
                                  title="Contactar (Email / WhatsApp)"
                                  className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-all"
                                >
                                  <Send className="w-4 h-4" />
                                </button>

                                <Link
                                  to={profileUrl}
                                  target="_blank"
                                  title="Ver perfil web público"
                                  className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-all"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 bg-gray-50/70 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-500 gap-2">
                  <span>Mostrando {filteredClubs.length} de {clubs.length} clubes del Distrito 4281</span>
                  <span>Período Oficial: 2026–2027 · Datos sincronizados en tiempo real</span>
                </div>
              </div>
            )}
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
                { id: 'all', label: 'Todas las Solicitudes' },
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
              <div className="bg-white rounded-3xl p-16 text-center border border-gray-100 shadow-sm">
                <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-bold text-gray-800">No hay solicitudes en este estado</p>
                <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
                  Las solicitudes de actualización o registro enviadas por los clubes aparecerán aquí para revisión del comité distrital.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-100">
                {filteredSubmissions.map(sub => {
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
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            PESTAÑA 3: MARKETING INTELIGENTE IA · DIRECTORIO DE CLUBES
           ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'catalogo' && (
          <ClubCatalogMaster defaultDistrict={4281} />
        )}

        {activeTab === 'marketing' && (
          <div className="space-y-4">
            <RotaryMarketingInteligente initialInitiative="directorio_clubes" />
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            DRAWER / MODAL 360° DE TRAZABILIDAD INSTITUCIONAL (OBJETIVO 2)
           ════════════════════════════════════════════════════════════════ */}
        {detailClub && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
            <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-gray-100 overflow-hidden">
              {/* Cabecera del Drawer */}
              <div className="p-6 border-b border-gray-100 flex items-start justify-between bg-gradient-to-r from-gray-50 via-white to-gray-50">
                <div className="flex items-center gap-4">
                  {detailClub.logoUrl ? (
                    <img src={detailClub.logoUrl} alt={detailClub.officialName} className="w-14 h-14 rounded-2xl object-contain bg-white border border-gray-200 p-1" />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-rotary-blue text-white font-black text-xl flex items-center justify-center shadow-sm">
                      {detailClub.shortName.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider bg-rotary-blue text-white px-2 py-0.5 rounded-full">
                        {detailClub.organizationType}
                      </span>
                      <span className="text-xs font-semibold text-gray-500">
                        Distrito {detailClub.districtNumber} · {detailClub.city}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                        detailClub.igiLevel === 'lider'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : detailClub.igiLevel === 'activo'
                          ? 'bg-blue-50 text-blue-800 border-blue-200'
                          : detailClub.igiLevel === 'en_seguimiento'
                          ? 'bg-amber-50 text-amber-900 border-amber-200'
                          : 'bg-rose-50 text-rose-800 border-rose-200'
                      }`}>
                        IGI: {detailClub.igi || 0} pts · {detailClub.igiLevelLabel || 'En seguimiento'}
                      </span>
                    </div>
                    <h2 className="text-xl font-black text-gray-900 mt-1">{detailClub.officialName}</h2>
                    <p className="text-xs text-gray-400">
                      Período {detailClub.rotaryPeriod || '2026–2027'} · Actualizado:{' '}
                      {detailClub.updatedAt ? new Date(detailClub.updatedAt).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setDetailClub(null);
                    setDetailFullData(null);
                  }}
                  className="p-2 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Barra de Sub-Pestañas 360° */}
              <div className="flex border-b border-gray-200 px-6 gap-4 text-xs font-bold overflow-x-auto bg-white">
                <button
                  onClick={() => setDetailTab('identidad')}
                  className={`py-3 border-b-2 uppercase tracking-wider transition-all whitespace-nowrap ${
                    detailTab === 'identidad' ? 'border-rotary-blue text-rotary-blue' : 'border-transparent text-gray-400 hover:text-gray-700'
                  }`}
                >
                  Ficha e Identidad
                </button>
                <button
                  onClick={() => setDetailTab('liderazgo')}
                  className={`py-3 border-b-2 uppercase tracking-wider transition-all whitespace-nowrap ${
                    detailTab === 'liderazgo' ? 'border-rotary-blue text-rotary-blue' : 'border-transparent text-gray-400 hover:text-gray-700'
                  }`}
                >
                  Liderazgo y Responsables
                </button>
                <button
                  onClick={() => setDetailTab('completitud')}
                  className={`py-3 border-b-2 uppercase tracking-wider transition-all whitespace-nowrap ${
                    detailTab === 'completitud' ? 'border-rotary-blue text-rotary-blue' : 'border-transparent text-gray-400 hover:text-gray-700'
                  }`}
                >
                  Completitud ({detailClub.completionPercentage || 0}%)
                </button>
                <button
                  onClick={() => setDetailTab('igi')}
                  className={`py-3 border-b-2 uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5 ${
                    detailTab === 'igi' ? 'border-amber-500 text-amber-600' : 'border-transparent text-gray-400 hover:text-gray-700'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Índice IGI ({detailClub.igi || 0} pts)</span>
                </button>
                <button
                  onClick={() => setDetailTab('rotary_accion')}
                  className={`py-3 border-b-2 uppercase tracking-wider transition-all whitespace-nowrap ${
                    detailTab === 'rotary_accion' ? 'border-rotary-blue text-rotary-blue' : 'border-transparent text-gray-400 hover:text-gray-700'
                  }`}
                >
                  Rotary en Acción ({detailFullData?.submissions?.length || 0})
                </button>
                <button
                  onClick={() => setDetailTab('visitas')}
                  className={`py-3 border-b-2 uppercase tracking-wider transition-all whitespace-nowrap ${
                    detailTab === 'visitas' ? 'border-rotary-blue text-rotary-blue' : 'border-transparent text-gray-400 hover:text-gray-700'
                  }`}
                >
                  Visitas del Gobernador
                </button>
                <button
                  onClick={() => setDetailTab('crm')}
                  className={`py-3 border-b-2 uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5 ${
                    detailTab === 'crm' ? 'border-violet-500 text-violet-700' : 'border-transparent text-gray-400 hover:text-gray-700'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                  CRM institucional
                </button>
                <button
                  onClick={() => setDetailTab('auditoria')}
                  className={`py-3 border-b-2 uppercase tracking-wider transition-all whitespace-nowrap ${
                    detailTab === 'auditoria' ? 'border-rotary-blue text-rotary-blue' : 'border-transparent text-gray-400 hover:text-gray-700'
                  }`}
                >
                  Historial y Auditoría
                </button>
              </div>

              {/* Contenido Dinámico del Drawer */}
              <div className="p-6 overflow-y-auto flex-1 space-y-5">
                {loadingDetail ? (
                  <div className="py-12 text-center text-gray-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-rotary-blue" />
                    Cargando expediente 360° del club...
                  </div>
                ) : (
                  <>
                    {/* PESTAÑA: IDENTIDAD */}
                    {detailTab === 'identidad' && (
                      <div className="space-y-4">
                        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                          <span className="text-[10px] font-black uppercase text-gray-400">Lema / Motto</span>
                          <p className="text-sm font-bold text-gray-800 mt-0.5">
                            {detailFullData?.club?.motto || 'Lema institucional no configurado aún'}
                          </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                            <span className="text-[10px] font-black uppercase text-gray-400">Sede y Ciudad</span>
                            <p className="text-xs font-bold text-gray-800 mt-0.5">
                              {detailFullData?.club?.meetingAddress || 'Sede no especificada'}
                            </p>
                            <p className="text-[11px] text-gray-500 mt-0.5">
                              {detailFullData?.club?.city}, {detailFullData?.club?.state || 'Colombia'}
                            </p>
                          </div>

                          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                            <span className="text-[10px] font-black uppercase text-gray-400">Horario de Reuniones</span>
                            <p className="text-xs font-bold text-gray-800 mt-0.5">
                              {detailFullData?.club?.meetingSchedule || 'Horario no registrado'}
                            </p>
                          </div>
                        </div>

                        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                          <span className="text-[10px] font-black uppercase text-gray-400">Historia y Misión</span>
                          <p className="text-xs text-gray-700 leading-relaxed mt-1">
                            {detailFullData?.club?.history || detailFullData?.club?.description || 'Sin descripción histórica registrada.'}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* PESTAÑA: LIDERAZGO Y RESPONSABLES */}
                    {detailTab === 'liderazgo' && (
                      <div className="space-y-4">
                        <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-[10px] font-black uppercase text-rotary-blue">Presidente Actual</span>
                              <h4 className="text-sm font-extrabold text-gray-900 mt-0.5">
                                {detailFullData?.club?.currentPresident || 'Presidente no registrado'}
                              </h4>
                              <p className="text-[11px] text-gray-500">Período {detailFullData?.club?.rotaryPeriod || '2026–2027'}</p>
                            </div>
                            <Award className="w-8 h-8 text-rotary-blue/40" />
                          </div>
                        </div>

                        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                          <span className="text-[10px] font-black uppercase text-gray-400">Responsable de Autogestión</span>
                          {detailFullData?.club?.primaryManagerEmail ? (
                            <div className="mt-2 space-y-1">
                              <p className="text-xs font-extrabold text-gray-900">{detailFullData.club.primaryManagerName}</p>
                              <p className="text-xs text-gray-600 font-mono">{detailFullData.club.primaryManagerEmail}</p>
                              {detailFullData.club.primaryManagerPhone && (
                                <p className="text-xs text-gray-500">{detailFullData.club.primaryManagerPhone}</p>
                              )}
                            </div>
                          ) : (
                            <div className="mt-2 text-xs text-amber-700 bg-amber-50 p-3 rounded-xl border border-amber-200">
                              Este club aún no tiene un responsable de autogestión vinculado. Puedes invitarlo con el botón &quot;Contactar&quot;.
                            </div>
                          )}
                        </div>

                        {/* Cuentas vinculadas */}
                        <div>
                          <span className="text-[10px] font-black uppercase text-gray-400 block mb-2">Cuentas del Portal de Autogestión</span>
                          {detailFullData?.accounts?.length > 0 ? (
                            <div className="space-y-2">
                              {detailFullData.accounts.map((acc: any) => (
                                <div key={acc.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between text-xs">
                                  <div>
                                    <p className="font-bold text-gray-900">{acc.fullName || acc.email}</p>
                                    <p className="text-[11px] text-gray-400 font-mono">{acc.email}</p>
                                  </div>
                                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold">
                                    Verificado
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400 italic">No hay cuentas del portal activas para este club.</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* PESTAÑA: COMPLETITUD */}
                    {detailTab === 'completitud' && (
                      <div className="space-y-4">
                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-black uppercase text-gray-500">Completitud Global</span>
                            <span className="text-sm font-black text-rotary-blue">{detailClub.completionPercentage || 0}%</span>
                          </div>
                          <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${getProgressColor(detailClub.completionPercentage || 0)}`}
                              style={{ width: `${detailClub.completionPercentage || 0}%` }}
                            />
                          </div>
                        </div>

                        {/* Checklist de Requisitos */}
                        <div className="space-y-2 text-xs">
                          {[
                            { label: 'Identidad Básica (Nombre, Lema, Historia, Logo, Portada)', points: '25%', done: (detailClub.completionPercentage || 0) >= 25 },
                            { label: 'Ubicación y Sede (Ciudad, Año Fundación, Horarios)', points: '20%', done: (detailClub.completionPercentage || 0) >= 45 },
                            { label: 'Liderazgo y Directiva (Presidente, Junta Directiva)', points: '20%', done: (detailClub.completionPercentage || 0) >= 65 },
                            { label: 'Proyectos de Impacto y Causas', points: '15%', done: (detailClub.completionPercentage || 0) >= 80 },
                            { label: 'Galería Fotográfica y Multimedia', points: '10%', done: (detailClub.completionPercentage || 0) >= 90 },
                            { label: 'Canales de Contacto (Email, WhatsApp, Redes)', points: '10%', done: (detailClub.completionPercentage || 0) >= 100 }
                          ].map((req, idx) => (
                            <div key={idx} className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between">
                              <span className="text-gray-700 font-medium">{req.label}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-400 font-bold">{req.points}</span>
                                {req.done ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                ) : (
                                  <AlertCircle className="w-4 h-4 text-gray-300 shrink-0" />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* PESTAÑA: ÍNDICE DE GESTIÓN INSTITUCIONAL (IGI) */}
                    {detailTab === 'igi' && (
                      <div className="space-y-5">
                        {/* ── CARD CONCEPTUAL DE SEGUIMIENTO POR CLUB (DISEÑO OFICIAL) ── */}
                        <div className="bg-gray-950 text-white p-6 rounded-3xl border border-gray-800 shadow-xl space-y-4">
                          <div className="flex items-center justify-between pb-3 border-b border-gray-800/80">
                            <div>
                              <h3 className="text-sm font-extrabold text-white tracking-tight">
                                Ejemplo conceptual de seguimiento por club
                              </h3>
                              <p className="text-[11px] text-gray-400 mt-0.5">
                                Índice de Gestión Institucional (IGI) · Gobernanza Distrital 4281
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="text-2xl font-black text-amber-400">
                                {detailFullData?.club?.igi ?? detailClub.igi ?? 0}
                              </span>
                              <span className="text-xs text-gray-400 font-medium"> / 100 pts</span>
                            </div>
                          </div>

                          <div className="space-y-3.5 text-xs">
                            <div className="flex items-center justify-between py-1.5 border-b border-gray-800/60">
                              <span className="text-gray-300 font-medium">Completitud institucional</span>
                              <span className="font-extrabold text-white text-sm">
                                {detailClub.completionPercentage || 0}%
                              </span>
                            </div>

                            <div className="flex items-center justify-between py-1.5 border-b border-gray-800/60">
                              <span className="text-gray-300 font-medium">Actualización reciente</span>
                              <span className={`font-extrabold text-sm ${
                                (detailFullData?.club?.igiData?.breakdown?.recency?.isRecent ?? true)
                                  ? 'text-emerald-400'
                                  : 'text-gray-400'
                              }`}>
                                {(detailFullData?.club?.igiData?.breakdown?.recency?.isRecent ?? true) ? 'Sí' : 'No'}
                              </span>
                            </div>

                            <div className="flex items-center justify-between py-1.5 border-b border-gray-800/60">
                              <span className="text-gray-300 font-medium">Responsable identificado</span>
                              <span className={`font-extrabold text-sm ${
                                detailClub.primaryManagerEmail ? 'text-emerald-400' : 'text-rose-400'
                              }`}>
                                {detailClub.primaryManagerEmail ? 'Sí' : 'No'}
                              </span>
                            </div>

                            <div className="flex items-center justify-between py-1.5 border-b border-gray-800/60">
                              <span className="text-gray-300 font-medium">Solicitudes pendientes</span>
                              <span className="font-extrabold text-white text-sm">
                                {detailClub.pendingSubmissionsCount || 0}
                              </span>
                            </div>

                            <div className="flex items-center justify-between pt-1">
                              <span className="text-gray-300 font-medium">Estado de gestión</span>
                              <span className={`px-3 py-1 rounded-full text-xs font-black uppercase border ${
                                (detailClub.igiLevel || 'critico') === 'lider'
                                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                                  : (detailClub.igiLevel || 'critico') === 'activo'
                                  ? 'bg-blue-950/80 text-blue-300 border-blue-500/40'
                                  : (detailClub.igiLevel || 'critico') === 'en_seguimiento'
                                  ? 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                                  : 'bg-rose-950/80 text-rose-300 border-rose-500/40'
                              }`}>
                                {detailClub.igiLevelLabel || ((detailClub.igi || 0) >= 80 ? 'Líder Institucional' : (detailClub.igi || 0) >= 60 ? 'Gestión Activa' : (detailClub.igi || 0) >= 40 ? 'En Seguimiento' : 'Requiere Acompañamiento')}
                              </span>
                            </div>
                          </div>

                          <p className="text-[10px] text-gray-500 italic pt-2 border-t border-gray-800/40">
                            Cálculo dinámico basado en la fuente maestra del Directorio y la actividad de Rotary en Acción.
                          </p>
                        </div>

                        {/* ── DESGLOSE METODOLÓGICO DE LOS 4 PILARES ── */}
                        <div className="space-y-3">
                          <h4 className="text-xs font-black uppercase tracking-wider text-gray-500">
                            Desglose de Puntos por Pilar Institucional (Máx 100 pts)
                          </h4>

                          <div className="space-y-2 text-xs">
                            {/* Pilar 1 */}
                            <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                              <div>
                                <p className="font-bold text-gray-900">1. Completitud de la Ficha Institucional (40%)</p>
                                <p className="text-[11px] text-gray-500">Información básica, directiva, sedes y causas ({detailClub.completionPercentage || 0}%)</p>
                              </div>
                              <span className="font-black text-sm text-rotary-blue">
                                {detailFullData?.club?.igiData?.breakdown?.completion?.points ?? Math.round(((detailClub.completionPercentage || 0) / 100) * 40)} / 40 pts
                              </span>
                            </div>

                            {/* Pilar 2 */}
                            <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                              <div>
                                <p className="font-bold text-gray-900">2. Vigencia y Actualización Reciente (25%)</p>
                                <p className="text-[11px] text-gray-500">Período 2026–2027 y fecha reciente de sincronización</p>
                              </div>
                              <span className="font-black text-sm text-rotary-blue">
                                {detailFullData?.club?.igiData?.breakdown?.recency?.points ?? (detailClub.rotaryPeriod?.includes('2026') ? 15 : 0)} / 25 pts
                              </span>
                            </div>

                            {/* Pilar 3 */}
                            <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                              <div>
                                <p className="font-bold text-gray-900">3. Responsable Identificado y Canales (20%)</p>
                                <p className="text-[11px] text-gray-500">Gestor registrado con correo verificado y teléfono activo</p>
                              </div>
                              <span className="font-black text-sm text-rotary-blue">
                                {detailFullData?.club?.igiData?.breakdown?.manager?.points ?? (detailClub.primaryManagerEmail ? 16 : 0)} / 20 pts
                              </span>
                            </div>

                            {/* Pilar 4 */}
                            <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                              <div>
                                <p className="font-bold text-gray-900">4. Participación Operativa en Rotary en Acción (15%)</p>
                                <p className="text-[11px] text-gray-500">Solicitudes enviadas, borradores en curso y cambios protegidos</p>
                              </div>
                              <span className="font-black text-sm text-rotary-blue">
                                {detailFullData?.club?.igiData?.breakdown?.participation?.points ?? ((detailClub.submissionsCount || 0) > 0 ? 10 : (detailClub.draftsCount || 0) > 0 ? 7 : 0)} / 15 pts
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* PESTAÑA: ROTARY EN ACCIÓN (SOLICITUDES ASOCIADAS) */}
                    {detailTab === 'rotary_accion' && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black uppercase text-gray-500">Solicitudes y Actualizaciones del Club</span>
                          <Link
                            to={`/admin/rotary-en-accion?tab=directorio&q=${encodeURIComponent(detailClub.shortName)}`}
                            className="text-xs font-bold text-rotary-blue hover:underline inline-flex items-center gap-1"
                          >
                            Ver en Rotary en Acción <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>

                        {detailFullData?.submissions?.length > 0 ? (
                          <div className="space-y-2">
                            {detailFullData.submissions.map((sub: any) => (
                              <div key={sub.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between text-xs">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-rotary-blue">{sub.trackingNumber}</span>
                                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-gray-200 text-gray-700">
                                      {sub.status}
                                    </span>
                                  </div>
                                  <p className="text-gray-700 font-medium mt-1">
                                    {sub.applicantName} ({sub.applicantEmail})
                                  </p>
                                  <p className="text-[10px] text-gray-400 mt-0.5">
                                    {new Date(sub.createdAt).toLocaleString()}
                                  </p>
                                </div>
                                <button
                                  onClick={() => setSelectedSubmission(sub)}
                                  className="px-3 py-1.5 bg-rotary-blue text-white rounded-xl text-xs font-bold hover:bg-blue-900 transition-all"
                                >
                                  Revisar
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8 bg-gray-50 rounded-2xl border border-gray-100 text-gray-400 text-xs">
                            <Layers className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                            Este club no tiene solicitudes registradas en Rotary en Acción.
                          </div>
                        )}
                      </div>
                    )}

                    {/* PESTAÑA: VISITAS DEL GOBERNADOR (v4.1260) */}
                    {detailTab === 'visitas' && (
                      <ClubGovernorVisitsPanel
                        profileId={detailClub.id}
                        token={token || getAuthToken()}
                      />
                    )}

                    {/* PESTAÑA: CRM INSTITUCIONAL / CONTACTOS VINCULADOS */}
                    {detailTab === 'crm' && (
                      <ClubInstitutionalPanel
                        profileId={detailClub.id}
                        token={token || getAuthToken()}
                      />
                    )}

                    {/* PESTAÑA: AUDITORÍA E HISTORIAL */}
                    {detailTab === 'auditoria' && (
                      <div className="space-y-3">
                        <span className="text-xs font-black uppercase text-gray-500 block">Registro de Auditoría Institucional</span>
                        {Array.isArray(detailClub.auditLog) && detailClub.auditLog.length > 0 ? (
                          <div className="space-y-2">
                            {detailClub.auditLog.map((log: any, idx: number) => (
                              <div key={idx} className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-gray-900">{log.action || 'Modificación'}</span>
                                  <span className="text-[10px] text-gray-400">{log.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A'}</span>
                                </div>
                                <p className="text-gray-600">{log.details || JSON.stringify(log)}</p>
                                <p className="text-[10px] text-gray-400">Por: {log.user || 'Administrador'}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8 bg-gray-50 rounded-2xl border border-gray-100 text-gray-400 text-xs">
                            <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                            No hay eventos de auditoría previos registrados para este club.
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Pie del Drawer con Acciones Contextuales */}
              <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <Link
                  to={`/clubes/${detailClub.organizationType}/${detailClub.slug}`}
                  target="_blank"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-rotary-blue transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Ver Ficha Pública
                </Link>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenCommModal(detailClub)}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" /> Contactar
                  </button>
                  <button
                    onClick={() => {
                      setEditingProfile(detailClub);
                      setEditFormData({
                        officialName: detailClub.officialName,
                        shortName: detailClub.shortName,
                        city: detailClub.city || '',
                        currentPresident: detailClub.currentPresident || '',
                        rotaryPeriod: detailClub.rotaryPeriod || '2026–2027',
                        contactEmail: detailClub.contactEmail || '',
                        contactPhone: detailClub.contactPhone || ''
                      });
                      setIsEditModalOpen(true);
                    }}
                    className="px-3.5 py-2 bg-rotary-blue hover:bg-blue-900 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5"
                  >
                    <Edit2 className="w-3.5 h-3.5" /> Editar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            MODAL DE COMUNICACIONES CRM (EMAIL & WHATSAPP)
           ════════════════════════════════════════════════════════════════ */}
        {commModalOpen && selectedClubForComm && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-gray-100 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div>
                  <span className="text-[10px] font-black uppercase text-rotary-blue">CRM Distrital · Comunicaciones</span>
                  <h3 className="text-lg font-black text-gray-900 mt-0.5">Contactar: {selectedClubForComm.officialName}</h3>
                </div>
                <button onClick={() => setCommModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Selector de Canal */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCommChannel('whatsapp')}
                  className={`py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                    commChannel === 'whatsapp' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  <Phone className="w-3.5 h-3.5" /> WhatsApp Directo
                </button>
                <button
                  type="button"
                  onClick={() => setCommChannel('email')}
                  className={`py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                    commChannel === 'email' ? 'bg-rotary-blue text-white shadow-xs' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" /> Correo Institucional
                </button>
              </div>

              {/* Selector de Plantilla */}
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Plantilla de Mensaje</label>
                <select
                  value={commTemplateId}
                  onChange={(e) => setCommTemplateId(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-800 outline-none focus:border-rotary-blue"
                >
                  {plantillas.map(p => (
                    <option key={p.id} value={p.id}>{p.titulo}</option>
                  ))}
                </select>
              </div>

              {/* Destinatario */}
              {commChannel === 'whatsapp' ? (
                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Número de WhatsApp (con código de país ej: +57300...)</label>
                  <input
                    type="text"
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                    placeholder="+573001234567"
                    className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Correo Electrónico Destino</label>
                  <input
                    type="email"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    placeholder="club@rotary4281.org"
                    className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
              )}

              {/* Vista Previa del Mensaje */}
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Vista Previa del Mensaje</label>
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs text-gray-700 whitespace-pre-line max-h-48 overflow-y-auto leading-relaxed">
                  {renderedMessage}
                </div>
              </div>

              {/* Botón de Envío */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(renderedMessage);
                    toast.success('Mensaje copiado al portapapeles');
                  }}
                  className="px-3.5 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-bold hover:bg-gray-50 transition-all flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" /> Copiar Texto
                </button>

                {commChannel === 'whatsapp' ? (
                  <button
                    type="button"
                    onClick={handleSendWhatsApp}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md transition-all flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" /> Abrir WhatsApp
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSendEmail}
                    className="px-5 py-2 rounded-xl bg-rotary-blue hover:bg-blue-900 text-white text-xs font-black shadow-md transition-all flex items-center gap-1.5"
                  >
                    <Mail className="w-3.5 h-3.5" /> Abrir Correo
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            MODAL DE EDICIÓN RÁPIDA DE PERFIL
           ════════════════════════════════════════════════════════════════ */}
        {isEditModalOpen && editingProfile && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
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
                    className="w-full p-2.5 rounded-xl border border-gray-200 outline-none focus:border-rotary-blue font-semibold"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-black text-gray-700 uppercase mb-1">Nombre Corto</label>
                    <input
                      type="text"
                      value={editFormData.shortName}
                      onChange={(e) => setEditFormData({ ...editFormData, shortName: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-gray-200 outline-none focus:border-rotary-blue font-semibold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-black text-gray-700 uppercase mb-1">Ciudad</label>
                    <input
                      type="text"
                      value={editFormData.city}
                      onChange={(e) => setEditFormData({ ...editFormData, city: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-gray-200 outline-none focus:border-rotary-blue font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-black text-gray-700 uppercase mb-1">Presidente</label>
                    <input
                      type="text"
                      value={editFormData.currentPresident}
                      onChange={(e) => setEditFormData({ ...editFormData, currentPresident: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-gray-200 outline-none focus:border-rotary-blue font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block font-black text-gray-700 uppercase mb-1">Período Rotario</label>
                    <input
                      type="text"
                      value={editFormData.rotaryPeriod}
                      onChange={(e) => setEditFormData({ ...editFormData, rotaryPeriod: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-gray-200 outline-none focus:border-rotary-blue font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-black text-gray-700 uppercase mb-1">Email de Contacto</label>
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
                    className="px-4 py-2 bg-gray-100 text-gray-700 font-bold rounded-xl text-xs hover:bg-gray-200 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-rotary-blue hover:bg-blue-900 text-white font-black rounded-xl text-xs shadow-md transition-all"
                  >
                    Guardar Cambios
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            MODAL DE VALIDACIÓN DE CAMBIOS PROTEGIDOS
           ════════════════════════════════════════════════════════════════ */}
        {reviewingProtectedClub && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div>
                  <span className="text-[10px] font-black uppercase text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full">
                    Gobernación Distrital · Validación
                  </span>
                  <h3 className="text-lg font-black text-gray-900 mt-1">
                    Cambios Protegidos: {reviewingProtectedClub.officialName}
                  </h3>
                </div>
                <button
                  onClick={() => setReviewingProtectedClub(null)}
                  className="text-gray-400 hover:text-gray-600 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900 space-y-2">
                <p className="font-bold">
                  El responsable del club solicitó cambios en campos institucionales protegidos:
                </p>
                <div className="bg-white/80 p-3 rounded-xl border border-amber-200/60 font-mono text-[11px] overflow-x-auto space-y-1">
                  {Object.entries(reviewingProtectedClub.pendingProtectedChanges).map(([k, v]) => (
                    <div key={k}>
                      <span className="text-gray-500">{k}:</span> <strong className="text-gray-900">{String(v)}</strong>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-amber-800">
                  Al aprobar, estos cambios se aplicarán inmediatamente a la base de datos institucional y al perfil público.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleRejectProtected(reviewingProtectedClub.id)}
                  className="px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-xs font-bold hover:bg-gray-50 transition-all"
                >
                  Rechazar
                </button>
                <button
                  type="button"
                  onClick={() => handleApproveProtected(reviewingProtectedClub.id)}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md transition-all"
                >
                  Aprobar y Aplicar al Directorio
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            DRAWER / MODAL DE REVISIÓN Y APROBACIÓN DE SOLICITUD
           ════════════════════════════════════════════════════════════════ */}
        {selectedSubmission && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
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

              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <div>
                    <span className="text-gray-400 uppercase font-black text-[10px]">Solicitante</span>
                    <p className="font-bold text-gray-900 mt-0.5">{selectedSubmission.applicantName}</p>
                    <p className="text-gray-500">{selectedSubmission.applicantEmail}</p>
                  </div>
                  <div>
                    <span className="text-gray-400 uppercase font-black text-[10px]">Rol / Teléfono</span>
                    <p className="font-bold text-gray-900 mt-0.5">{selectedSubmission.applicantRole || 'Representante'}</p>
                    <p className="text-gray-500">{selectedSubmission.applicantPhone || 'Sin teléfono'}</p>
                  </div>
                </div>

                {(selectedSubmission.sponsorClubName || selectedSubmission.payload?.sponsorClubName) && (
                  <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-200/70 text-xs text-amber-900 flex items-center justify-between">
                    <span className="font-bold">Club Rotario Patrocinador:</span>
                    <strong className="font-extrabold text-rotary-blue">
                      {selectedSubmission.sponsorClubName || selectedSubmission.payload?.sponsorClubName}
                    </strong>
                  </div>
                )}

                <div>
                  <span className="text-gray-400 uppercase font-black text-[10px] block mb-2">Datos Enviados en la Solicitud</span>
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 max-h-56 overflow-y-auto font-mono text-[11px] text-gray-700">
                    <pre className="whitespace-pre-wrap">{JSON.stringify(selectedSubmission.payload, null, 2)}</pre>
                  </div>
                </div>

                <div>
                  <label className="block text-gray-700 font-bold mb-1">Comentarios / Observaciones para el Club</label>
                  <textarea
                    rows={3}
                    value={reviewFeedback}
                    onChange={(e) => setReviewFeedback(e.target.value)}
                    placeholder="Instrucciones o motivos de la aprobación / solicitud de corrección..."
                    className="w-full p-3 rounded-2xl border border-gray-200 text-xs outline-none focus:border-rotary-blue"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  onClick={() => setSelectedSubmission(null)}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-xs font-bold hover:bg-gray-50 transition-all"
                >
                  Cerrar
                </button>
                <button
                  disabled={isReviewing}
                  onClick={() => handleReviewSubmission(selectedSubmission.id, 'reject')}
                  className="px-4 py-2.5 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold transition-all disabled:opacity-50"
                >
                  Rechazar
                </button>
                <button
                  disabled={isReviewing}
                  onClick={() => handleReviewSubmission(selectedSubmission.id, 'request_changes')}
                  className="px-4 py-2.5 rounded-xl bg-amber-50 text-amber-800 hover:bg-amber-100 text-xs font-bold transition-all disabled:opacity-50"
                >
                  Solicitar Correcciones
                </button>
                <button
                  disabled={isReviewing}
                  onClick={() => handleReviewSubmission(selectedSubmission.id, 'approve')}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md transition-all disabled:opacity-50"
                >
                  {isReviewing ? 'Aprobando...' : 'Aprobar y Publicar'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </AdminLayout>
  );
};

export default DistrictClubsAdmin;
