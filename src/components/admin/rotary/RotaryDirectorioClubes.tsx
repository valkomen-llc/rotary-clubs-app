// ════════════════════════════════════════════════════════════════════════════
// Módulo: Rotary en Acción — Gestión Operativa de Solicitudes de Clubes
// Rotary, Rotaract e Interact — Distrito 4281 & Multidistrito
//
// MÓDULO B — GESTIÓN OPERATIVA Y ACTIVIDAD REAL:
// 1. Pestaña 1: Solicitudes y Actualizaciones recibidas por revisar.
// 2. Pestaña 2: Gestión en Curso (Borradores iniciados y seguimiento de abandono).
// 3. Pestaña 3: Historial de Solicitudes (Aprobadas, rechazadas y finalizadas).
// 4. Pestaña 4: Automatización y Plantillas CRM multicanal (Email & WhatsApp).
// 5. Trazabilidad bidireccional vinculada al Catálogo Maestro en /admin/directorio-clubes.
// ════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, Users, Search, Sparkles, Filter, ExternalLink,
  Mail, MessageSquare, ArrowRight, CheckCircle2, AlertCircle,
  Clock, TrendingUp, Send, Copy, Eye, Edit2, ShieldAlert,
  ChevronRight, RefreshCw, X, Check, Layers, AlertTriangle,
  Compass, ArrowUpRight, ShieldCheck, History
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../hooks/useAuth';

const API = import.meta.env.VITE_API_URL || '/api';
const getAuthToken = () => localStorage.getItem('rotary_token') || localStorage.getItem('token') || '';

interface SubmissionItem {
  id: string;
  trackingNumber: string;
  profileId?: string;
  districtNumber: number;
  organizationType: string;
  clubName: string;
  submissionType: string;
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
  utmMedium?: string;
  formStartedAt?: string;
  lastActiveAt?: string;
  createdAt: string;
  updatedAt?: string;
  profileSlug?: string;
  profileCity?: string;
  profileCompletionPercentage?: number;
  profileStatus?: string;
  primaryManagerEmail?: string;
  primaryManagerName?: string;
}

export const RotaryDirectorioClubes: React.FC = () => {
  const { user, token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [activeSubtab, setActiveSubtab] = useState<'solicitudes' | 'gestion_en_curso' | 'historial' | 'automatizacion'>('solicitudes');

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modales
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionItem | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);

  // Modal de Comunicaciones CRM
  const [commModalOpen, setCommModalOpen] = useState(false);
  const [commRecipientName, setCommRecipientName] = useState('');
  const [commRecipientClub, setCommRecipientClub] = useState('');
  const [commRecipientSlug, setCommRecipientSlug] = useState('');
  const [commRecipientPhone, setCommRecipientPhone] = useState('');
  const [commRecipientEmail, setCommRecipientEmail] = useState('');
  const [commChannel, setCommChannel] = useState<'email' | 'whatsapp'>('whatsapp');
  const [commTemplateId, setCommTemplateId] = useState<string>('recordatorio');

  // Cargar datos consolidados
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const authToken = token || getAuthToken();
      const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};

      const subsRes = await fetch(`${API}/district-clubs/admin/submissions?district=4281&includeDrafts=true`, { headers });
      if (subsRes.ok) {
        const d = await subsRes.json();
        setSubmissions(d.submissions || []);
      }
    } catch (err) {
      console.warn('Error loading rotary submissions data:', err);
      toast.error('No se pudo conectar con el servidor de solicitudes.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Métricas y KPIs de Gestión Operativa (Objetivo 5)
  const metrics = useMemo(() => {
    // Clubes únicos con actividad
    const uniqueClubs = new Set(submissions.map(s => s.clubName.toLowerCase().trim()));
    const totalActiveClubs = uniqueClubs.size;

    const pending = submissions.filter(s => ['recibida', 'en_revision'].includes(s.status)).length;
    const corrections = submissions.filter(s => s.status === 'correcciones_solicitadas').length;
    const drafts = submissions.filter(s => s.status === 'borrador').length;
    const approved = submissions.filter(s => s.status === 'aprobada').length;
    const rejected = submissions.filter(s => s.status === 'rechazada').length;
    const totalSubmissions = submissions.filter(s => s.status !== 'borrador').length;

    const conversionRate = (drafts + totalSubmissions) > 0
      ? Math.round((totalSubmissions / (drafts + totalSubmissions)) * 100)
      : 0;

    return {
      totalActiveClubs,
      pending,
      corrections,
      drafts,
      approved,
      rejected,
      totalSubmissions,
      conversionRate
    };
  }, [submissions]);

  // Pestaña 1: Solicitudes Recibidas y En Revisión
  const pendingSubmissionsList = useMemo(() => {
    return submissions.filter(s => {
      if (s.status === 'borrador') return false;
      if (!['recibida', 'en_revision', 'correcciones_solicitadas'].includes(s.status)) return false;
      if (typeFilter !== 'all' && s.organizationType !== typeFilter) return false;
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const text = `${s.clubName} ${s.applicantName} ${s.applicantEmail} ${s.trackingNumber}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [submissions, typeFilter, statusFilter, searchQuery]);

  // Pestaña 2: Gestión en Curso (Borradores y Procesos Activos)
  const draftsAndActiveList = useMemo(() => {
    return submissions.filter(s => {
      if (s.status !== 'borrador') return false;
      if (typeFilter !== 'all' && s.organizationType !== typeFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const text = `${s.clubName} ${s.applicantName} ${s.applicantEmail} ${s.trackingNumber}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [submissions, typeFilter, searchQuery]);

  // Pestaña 3: Historial de Solicitudes (Aprobadas, Rechazadas, Finalizadas)
  const historyList = useMemo(() => {
    return submissions.filter(s => {
      if (s.status === 'borrador') return false;
      if (!['aprobada', 'rechazada'].includes(s.status)) return false;
      if (typeFilter !== 'all' && s.organizationType !== typeFilter) return false;
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const text = `${s.clubName} ${s.applicantName} ${s.applicantEmail} ${s.trackingNumber}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [submissions, typeFilter, statusFilter, searchQuery]);

  // Acción de Aprobación / Rechazo
  const handleReview = async (id: string, action: 'approve' | 'request_changes' | 'reject') => {
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
          reviewedBy: user?.name || user?.email || 'Comité Rotary en Acción D4281'
        })
      });

      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error al procesar solicitud');

      toast.success(
        action === 'approve'
          ? '¡Solicitud aprobada e integrada al Directorio de Clubes!'
          : action === 'request_changes'
          ? 'Se han solicitado correcciones al responsable.'
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

  // Plantillas de Comunicación CRM
  const plantillas = [
    {
      id: 'recordatorio',
      titulo: 'Recordatorio de Borrador en Curso (Reactivación)',
      asunto: 'Continúa la postulación de tu Club en Rotary en Acción',
      mensaje: (clubName: string, slug: string) =>
        `Estimados socios de ${clubName}:\n\n` +
        `Notamos que comenzaron el registro de su club en la plataforma distrital pero no han finalizado el envío.\n\n` +
        `Completar la ficha oficial permitirá visibilizar sus proyectos de servicio ante todo el Distrito 4281 y la comunidad internacional.\n\n` +
        `Puedes retomar directamente aquí:\n` +
        `https://app.clubplatform.org/clubes/registro?club=${slug}&utm_source=rotary_en_accion&utm_campaign=reactivacion_borrador\n\n` +
        `¡Quedamos atentos a apoyarlos en lo que necesiten!\nComité Rotary en Acción · Distrito 4281`
    },
    {
      id: 'aprobado',
      titulo: 'Notificación de Solicitud Aprobada',
      asunto: '¡Felicitaciones! La Ficha Institucional de su Club ha sido Aprobada',
      mensaje: (clubName: string, slug: string) =>
        `Estimados amigos de ${clubName}:\n\n` +
        `Nos alegra comunicarles que la solicitud de su club ha sido revisada y APROBADA satisfactoriamente por la Gobernación Distrital.\n\n` +
        `Su perfil oficial ya se encuentra publicado y visible para toda la comunidad en:\n` +
        `https://app.clubplatform.org/clubes/rotary/${slug}\n\n` +
        `Además, pueden autogestionar su contenido en el Portal del Club:\n` +
        `https://app.clubplatform.org/clubes/portal\n\n` +
        `¡Gracias por su liderazgo e impacto!\nRotary en Acción · Distrito 4281`
    },
    {
      id: 'correcciones',
      titulo: 'Solicitud de Ajustes en Información',
      asunto: 'Observaciones para la publicación de su Ficha en el Directorio',
      mensaje: (clubName: string, slug: string) =>
        `Estimado(a) representante de ${clubName}:\n\n` +
        `Hemos revisado la información enviada para su ficha institucional en Rotary en Acción. Para proceder con la aprobación, requerimos un breve ajuste en los datos ingresados.\n\n` +
        `Por favor ingresa al formulario para actualizar la solicitud:\n` +
        `https://app.clubplatform.org/clubes/registro?club=${slug}&utm_source=rotary_en_accion&utm_campaign=ajuste_solicitud\n\n` +
        `Comité Distrital de Certificación · Distrito 4281`
    }
  ];

  const currentTemplate = plantillas.find(p => p.id === commTemplateId) || plantillas[0];
  const renderedMessage = currentTemplate.mensaje(commRecipientClub || 'su club', commRecipientSlug || '');

  const openCommModalForSub = (sub: SubmissionItem) => {
    setCommRecipientName(sub.applicantName);
    setCommRecipientClub(sub.clubName);
    setCommRecipientSlug(sub.profileSlug || sub.payload?.slug || '');
    setCommRecipientEmail(sub.applicantEmail);
    setCommRecipientPhone(sub.applicantPhone || '');
    setCommTemplateId(sub.status === 'borrador' ? 'recordatorio' : sub.status === 'aprobada' ? 'aprobado' : 'correcciones');
    setCommModalOpen(true);
  };

  const handleSendWhatsApp = () => {
    if (!commRecipientPhone) {
      toast.error('Ingresa un número telefónico válido');
      return;
    }
    const cleanPhone = commRecipientPhone.replace(/[^\d+]/g, '');
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(renderedMessage)}`;
    window.open(url, '_blank');
    toast.success('Abriendo WhatsApp...');
  };

  const handleSendEmail = () => {
    if (!commRecipientEmail) {
      toast.error('Ingresa un correo destinatario');
      return;
    }
    const mailto = `mailto:${commRecipientEmail}?subject=${encodeURIComponent(currentTemplate.asunto)}&body=${encodeURIComponent(renderedMessage)}`;
    window.open(mailto, '_blank');
    toast.success('Abriendo cliente de correo...');
  };

  return (
    <div className="space-y-6">

      {/* ── 1. CABECERA OPERATIVA CON ENLACE AL DIRECTORIO MAESTRO ──────── */}
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-[11px] font-black uppercase tracking-wider mb-2">
            <Layers className="w-3.5 h-3.5" /> Rotary en Acción · Gestión Operativa de Solicitudes
          </div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">
            Bandeja de Solicitudes y Participación Activa
          </h2>
          <p className="text-xs text-gray-500 mt-1 max-w-2xl leading-relaxed">
            Recepción, validación, seguimiento de borradores y trazabilidad de los clubes que están realizando gestiones activas de actualización.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/admin/directorio-clubes"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rotary-blue hover:bg-blue-900 text-white text-xs font-black shadow-sm transition-all"
          >
            <Building2 className="w-3.5 h-3.5" />
            Catálogo Maestro (74 Clubes) ↗
          </Link>
          <Link
            to="/clubes/registro?utm_source=rotary_en_accion&utm_campaign=boton_operativo"
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 text-xs font-bold transition-all"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Abrir Formulario Oficial
          </Link>
        </div>
      </div>

      {/* ── BANNER EXPLICATIVO DE SEPARACIÓN ARQUITECTÓNICA ───────────── */}
      <div className="p-4 bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-purple-50/50 rounded-2xl border border-blue-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 text-blue-900">
          <Compass className="w-4 h-4 text-rotary-blue shrink-0" />
          <span>
            <strong>Separación Arquitectónica:</strong> El catálogo oficial de los 74 clubes se administra en el{' '}
            <Link to="/admin/directorio-clubes" className="font-extrabold underline hover:text-rotary-blue">Directorio de Clubes</Link>.
            Aquí se gestionan exclusivamente las solicitudes activas, procesos en curso y herramientas de comunicación.
          </span>
        </div>
      </div>

      {/* ── 2. KPIS DE GESTIÓN OPERATIVA REAL (OBJETIVO 5) ────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
          <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Clubes con Actividad</p>
          <h3 className="text-2xl font-black text-gray-900 mt-0.5">{metrics.totalActiveClubs}</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">Con solicitud o borrador</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
          <p className="text-[10px] font-black uppercase tracking-wider text-amber-600">Por Revisar</p>
          <h3 className="text-2xl font-black text-amber-600 mt-0.5">{metrics.pending}</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">Recibidas / En revisión</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
          <p className="text-[10px] font-black uppercase tracking-wider text-indigo-600">Borradores en Curso</p>
          <h3 className="text-2xl font-black text-indigo-600 mt-0.5">{metrics.drafts}</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">Formularios sin enviar</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Aprobadas</p>
          <h3 className="text-2xl font-black text-emerald-600 mt-0.5">{metrics.approved}</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">Publicadas en directorio</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
          <p className="text-[10px] font-black uppercase tracking-wider text-orange-600">Correcciones</p>
          <h3 className="text-2xl font-black text-orange-600 mt-0.5">{metrics.corrections}</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">Ajustes requeridos</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
          <p className="text-[10px] font-black uppercase tracking-wider text-purple-600">Conversión</p>
          <h3 className="text-2xl font-black text-purple-600 mt-0.5">{metrics.conversionRate}%</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">Envío vs Borradores</p>
        </div>
      </div>

      {/* ── 3. CUATRO SUB-PESTAÑAS OPERATIVAS (OBJETIVO 3) ─────────────── */}
      <div className="flex border-b border-gray-200 gap-2 text-xs font-black overflow-x-auto pb-1">
        <button
          onClick={() => setActiveSubtab('solicitudes')}
          className={`pb-3 px-3.5 border-b-2 uppercase tracking-wider transition-all flex items-center gap-1.5 whitespace-nowrap ${
            activeSubtab === 'solicitudes'
              ? 'border-rotary-blue text-rotary-blue'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Solicitudes y Actualizaciones ({pendingSubmissionsList.length})</span>
          {metrics.pending > 0 && (
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          )}
        </button>

        <button
          onClick={() => setActiveSubtab('gestion_en_curso')}
          className={`pb-3 px-3.5 border-b-2 uppercase tracking-wider transition-all flex items-center gap-1.5 whitespace-nowrap ${
            activeSubtab === 'gestion_en_curso'
              ? 'border-rotary-blue text-rotary-blue'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Edit2 className="w-4 h-4 text-indigo-500" />
          <span>Gestión en Curso ({draftsAndActiveList.length})</span>
        </button>

        <button
          onClick={() => setActiveSubtab('historial')}
          className={`pb-3 px-3.5 border-b-2 uppercase tracking-wider transition-all flex items-center gap-1.5 whitespace-nowrap ${
            activeSubtab === 'historial'
              ? 'border-rotary-blue text-rotary-blue'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <History className="w-4 h-4 text-emerald-600" />
          <span>Historial de Solicitudes ({historyList.length})</span>
        </button>

        <button
          onClick={() => setActiveSubtab('automatizacion')}
          className={`pb-3 px-3.5 border-b-2 uppercase tracking-wider transition-all flex items-center gap-1.5 whitespace-nowrap ${
            activeSubtab === 'automatizacion'
              ? 'border-rotary-blue text-rotary-blue'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <MessageSquare className="w-4 h-4 text-emerald-600" />
          <span>Automatización y Plantillas</span>
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          PESTAÑA 1: SOLICITUDES Y ACTUALIZACIONES PENDIENTES
         ════════════════════════════════════════════════════════════════ */}
      {activeSubtab === 'solicitudes' && (
        <div className="space-y-4">
          {/* Barra de Filtro y Búsqueda */}
          <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 bg-white outline-none focus:border-rotary-blue"
              >
                <option value="all">Todos los Programas</option>
                <option value="rotary">Rotary</option>
                <option value="rotaract">Rotaract</option>
                <option value="interact">Interact</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 bg-white outline-none focus:border-rotary-blue"
              >
                <option value="all">Todos los Estados</option>
                <option value="recibida">Recibida</option>
                <option value="en_revision">En Revisión</option>
                <option value="correcciones_solicitadas">Correcciones Solicitadas</option>
              </select>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por club, solicitante o código..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold outline-none focus:border-rotary-blue bg-gray-50/50"
              />
            </div>
          </div>

          {loading ? (
            <div className="bg-white rounded-3xl p-16 text-center border border-gray-100 shadow-sm">
              <RefreshCw className="w-8 h-8 text-rotary-blue animate-spin mx-auto mb-3" />
              <p className="text-sm font-bold text-gray-800">Cargando solicitudes activas...</p>
            </div>
          ) : pendingSubmissionsList.length === 0 ? (
            <div className="bg-white rounded-3xl p-16 text-center border border-gray-100 shadow-sm">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <h3 className="text-base font-extrabold text-gray-900">Bandeja al día: No hay solicitudes pendientes</h3>
              <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
                Todos los formularios y solicitudes enviadas por los clubes han sido procesados o no hay solicitudes nuevas en este estado.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60 text-[10px] font-black uppercase tracking-wider text-gray-400">
                      <th className="py-3.5 px-4">Club Solicitante</th>
                      <th className="py-3.5 px-4">Responsable / Solicitante</th>
                      <th className="py-3.5 px-4">Tipo</th>
                      <th className="py-3.5 px-4">Fecha de Recepción</th>
                      <th className="py-3.5 px-4">Estado</th>
                      <th className="py-3.5 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-xs">
                    {pendingSubmissionsList.map(sub => (
                      <tr key={sub.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-3.5 px-4">
                          <div>
                            <span className="font-extrabold text-gray-900 block">{sub.clubName}</span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono text-[10px] text-rotary-blue bg-blue-50 px-1.5 py-0.5 rounded">
                                {sub.trackingNumber}
                              </span>
                              <span className="text-[10px] font-bold text-gray-400 uppercase">
                                {sub.organizationType}
                              </span>
                              {sub.profileId && (
                                <Link
                                  to={`/admin/directorio-clubes?clubId=${sub.profileId}`}
                                  className="text-[10px] font-bold text-purple-600 hover:underline inline-flex items-center gap-0.5"
                                >
                                  Ver en Directorio <ArrowUpRight className="w-3 h-3" />
                                </Link>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <p className="font-bold text-gray-900">{sub.applicantName}</p>
                          <p className="text-[11px] text-gray-500 font-mono">{sub.applicantEmail}</p>
                          {sub.applicantPhone && <p className="text-[10px] text-gray-400">{sub.applicantPhone}</p>}
                        </td>

                        <td className="py-3.5 px-4 text-gray-700 font-medium">
                          {sub.submissionType === 'create' ? 'Registro inicial' : 'Actualización de datos'}
                        </td>

                        <td className="py-3.5 px-4 text-gray-500 text-[11px]">
                          {new Date(sub.createdAt).toLocaleDateString()}
                          <div className="text-[10px] text-gray-400">{new Date(sub.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                            sub.status === 'recibida' ? 'bg-amber-100 text-amber-900 border border-amber-200' :
                            sub.status === 'en_revision' ? 'bg-blue-100 text-blue-900 border border-blue-200' :
                            'bg-orange-100 text-orange-900 border border-orange-200'
                          }`}>
                            <Clock className="w-3 h-3" /> {sub.status.replace('_', ' ')}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              onClick={() => openCommModalForSub(sub)}
                              title="Contactar al Solicitante"
                              className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-all"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setSelectedSubmission(sub)}
                              className="px-3.5 py-1.5 bg-rotary-blue hover:bg-blue-900 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
                            >
                              Revisar y Validar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          PESTAÑA 2: GESTIÓN EN CURSO (BORRADORES ACTIVOS Y ABANDONO)
         ════════════════════════════════════════════════════════════════ */}
      {activeSubtab === 'gestion_en_curso' && (
        <div className="space-y-4">
          <div className="bg-indigo-50/60 p-4 rounded-2xl border border-indigo-100 flex items-center justify-between text-xs text-indigo-900">
            <div>
              <strong>Clubes con Proceso en Curso:</strong> Responsables que iniciaron el formulario unificado de 7 pasos y tienen un borrador activo pendiente de envío.
            </div>
          </div>

          {draftsAndActiveList.length === 0 ? (
            <div className="bg-white rounded-3xl p-16 text-center border border-gray-100 shadow-sm">
              <CheckCircle2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-base font-extrabold text-gray-900">No hay borradores en curso</h3>
              <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
                No hay formularios abandonados en este momento. Todos los procesos iniciados fueron enviados o completados.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60 text-[10px] font-black uppercase tracking-wider text-gray-400">
                      <th className="py-3.5 px-4">Club</th>
                      <th className="py-3.5 px-4">Responsable</th>
                      <th className="py-3.5 px-4">Paso Alcanzado</th>
                      <th className="py-3.5 px-4">Última Actividad</th>
                      <th className="py-3.5 px-4">Campaña / Origen</th>
                      <th className="py-3.5 px-4 text-right">Acción de Reactivación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-xs">
                    {draftsAndActiveList.map(draft => {
                      const step = draft.stepReached || 1;
                      const stepPct = Math.round((step / 7) * 100);

                      return (
                        <tr key={draft.id} className="hover:bg-gray-50/60 transition-colors">
                          <td className="py-3.5 px-4">
                            <span className="font-extrabold text-gray-900 block">{draft.clubName}</span>
                            <span className="text-[10px] font-mono text-gray-400">{draft.trackingNumber}</span>
                          </td>

                          <td className="py-3.5 px-4">
                            <p className="font-bold text-gray-900">{draft.applicantName || 'Responsable en proceso'}</p>
                            <p className="text-[11px] text-gray-500 font-mono">{draft.applicantEmail}</p>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="w-32 space-y-1">
                              <div className="flex justify-between items-center text-[10px] font-bold">
                                <span className="text-gray-500">Paso {step} de 7</span>
                                <span className="text-indigo-600">{stepPct}%</span>
                              </div>
                              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${stepPct}%` }} />
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-gray-500 text-[11px]">
                            {draft.lastActiveAt ? new Date(draft.lastActiveAt).toLocaleString() : new Date(draft.createdAt).toLocaleDateString()}
                          </td>

                          <td className="py-3.5 px-4 text-gray-600">
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-gray-100 text-gray-700">
                              {draft.utmSource || 'directo'}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => openCommModalForSub(draft)}
                              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs inline-flex items-center gap-1.5"
                            >
                              <Send className="w-3.5 h-3.5" /> Enviar Recordatorio
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          PESTAÑA 3: HISTORIAL DE SOLICITUDES (APROBADAS / RECHAZADAS)
         ════════════════════════════════════════════════════════════════ */}
      {activeSubtab === 'historial' && (
        <div className="space-y-4">
          {historyList.length === 0 ? (
            <div className="bg-white rounded-3xl p-16 text-center border border-gray-100 shadow-sm">
              <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-base font-extrabold text-gray-900">No hay solicitudes en el historial</h3>
              <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
                Las solicitudes que hayan sido aprobadas o rechazadas se archivan aquí con trazabilidad completa.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60 text-[10px] font-black uppercase tracking-wider text-gray-400">
                      <th className="py-3.5 px-4">Club</th>
                      <th className="py-3.5 px-4">Solicitante</th>
                      <th className="py-3.5 px-4">Fecha Resolución</th>
                      <th className="py-3.5 px-4">Revisor</th>
                      <th className="py-3.5 px-4">Estado Final</th>
                      <th className="py-3.5 px-4 text-right">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-xs">
                    {historyList.map(item => (
                      <tr key={item.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-3.5 px-4">
                          <span className="font-extrabold text-gray-900 block">{item.clubName}</span>
                          <span className="text-[10px] font-mono text-gray-400">{item.trackingNumber}</span>
                        </td>

                        <td className="py-3.5 px-4">
                          <p className="font-bold text-gray-900">{item.applicantName}</p>
                          <p className="text-[11px] text-gray-500 font-mono">{item.applicantEmail}</p>
                        </td>

                        <td className="py-3.5 px-4 text-gray-500 text-[11px]">
                          {item.reviewedAt ? new Date(item.reviewedAt).toLocaleString() : new Date(item.createdAt).toLocaleDateString()}
                        </td>

                        <td className="py-3.5 px-4 text-gray-700">
                          {item.reviewedBy || 'Comité Distrital'}
                        </td>

                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                            item.status === 'aprobada' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {item.status === 'aprobada' ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                            {item.status}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => setSelectedSubmission(item)}
                            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all"
                          >
                            Ver Datos
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          PESTAÑA 4: AUTOMATIZACIÓN Y PLANTILLAS
         ════════════════════════════════════════════════════════════════ */}
      {activeSubtab === 'automatizacion' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plantillas.map(p => (
              <div key={p.id} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between space-y-4">
                <div>
                  <span className="text-[10px] font-black uppercase text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                    Plantilla Multicanal
                  </span>
                  <h4 className="text-base font-extrabold text-gray-900 mt-2">{p.titulo}</h4>
                  <p className="text-xs text-gray-500 mt-1">{p.asunto}</p>
                </div>

                <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100 text-xs text-gray-600 line-clamp-4 leading-relaxed font-mono text-[11px]">
                  {p.mensaje('Club Rotario Ejemplo', 'club-rotario-ejemplo')}
                </div>

                <button
                  onClick={() => {
                    setCommRecipientClub('Club Rotario');
                    setCommRecipientSlug('club-rotario');
                    setCommTemplateId(p.id);
                    setCommModalOpen(true);
                  }}
                  className="w-full py-2 bg-rotary-blue hover:bg-blue-900 text-white font-bold rounded-xl text-xs shadow-xs transition-all flex items-center justify-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" /> Usar esta Plantilla
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODAL DE REVISIÓN Y APROBACIÓN DE SOLICITUD
         ════════════════════════════════════════════════════════════════ */}
      {selectedSubmission && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-100 p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <span className="text-xs font-mono font-bold text-rotary-blue">{selectedSubmission.trackingNumber}</span>
                <h3 className="text-xl font-extrabold text-gray-900">{selectedSubmission.clubName}</h3>
              </div>
              <button onClick={() => setSelectedSubmission(null)} className="p-2 text-gray-400 hover:text-gray-700 rounded-full">
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
                  <span className="text-gray-400 uppercase font-black text-[10px]">Teléfono / Rol</span>
                  <p className="font-bold text-gray-900 mt-0.5">{selectedSubmission.applicantRole || 'Representante'}</p>
                  <p className="text-gray-500">{selectedSubmission.applicantPhone || 'Sin teléfono'}</p>
                </div>
              </div>

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
                  placeholder="Instrucciones o motivos de la aprobación / corrección..."
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
              {selectedSubmission.status !== 'rechazada' && (
                <button
                  disabled={isReviewing}
                  onClick={() => handleReview(selectedSubmission.id, 'reject')}
                  className="px-4 py-2.5 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold transition-all disabled:opacity-50"
                >
                  Rechazar
                </button>
              )}
              {selectedSubmission.status !== 'correcciones_solicitadas' && (
                <button
                  disabled={isReviewing}
                  onClick={() => handleReview(selectedSubmission.id, 'request_changes')}
                  className="px-4 py-2.5 rounded-xl bg-amber-50 text-amber-800 hover:bg-amber-100 text-xs font-bold transition-all disabled:opacity-50"
                >
                  Solicitar Correcciones
                </button>
              )}
              {selectedSubmission.status !== 'aprobada' && (
                <button
                  disabled={isReviewing}
                  onClick={() => handleReview(selectedSubmission.id, 'approve')}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md transition-all disabled:opacity-50"
                >
                  {isReviewing ? 'Aprobando...' : 'Aprobar y Publicar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODAL DE COMUNICACIONES CRM
         ════════════════════════════════════════════════════════════════ */}
      {commModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase text-purple-700">Rotary en Acción · CRM</span>
                <h3 className="text-lg font-black text-gray-900 mt-0.5">Contactar a: {commRecipientClub}</h3>
              </div>
              <button onClick={() => setCommModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCommChannel('whatsapp')}
                className={`py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                  commChannel === 'whatsapp' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-gray-100 text-gray-600'
                }`}
              >
                WhatsApp Directo
              </button>
              <button
                type="button"
                onClick={() => setCommChannel('email')}
                className={`py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                  commChannel === 'email' ? 'bg-rotary-blue text-white shadow-xs' : 'bg-gray-100 text-gray-600'
                }`}
              >
                Correo Institucional
              </button>
            </div>

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

            {commChannel === 'whatsapp' ? (
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Teléfono WhatsApp</label>
                <input
                  type="text"
                  value={commRecipientPhone}
                  onChange={(e) => setCommRecipientPhone(e.target.value)}
                  placeholder="+57300..."
                  className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-semibold outline-none focus:border-rotary-blue"
                />
              </div>
            ) : (
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  value={commRecipientEmail}
                  onChange={(e) => setCommRecipientEmail(e.target.value)}
                  placeholder="socio@rotary4281.org"
                  className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-semibold outline-none focus:border-rotary-blue"
                />
              </div>
            )}

            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Vista Previa</label>
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs text-gray-700 whitespace-pre-line max-h-48 overflow-y-auto leading-relaxed">
                {renderedMessage}
              </div>
            </div>

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

    </div>
  );
};

export default RotaryDirectorioClubes;
