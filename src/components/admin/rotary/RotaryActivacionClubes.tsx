// ════════════════════════════════════════════════════════════════════════════
// Componente de Gestión: Activación de Clubes — Rotary en Acción & Club Platform
// Panel de indicadores, CRM ligero de seguimiento, embudo visual y analítica omnicanal.
// ════════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Sparkles, Users, Globe, Megaphone, CreditCard, CheckCircle2,
  AlertTriangle, Filter, Search, RefreshCw, ExternalLink, Mail,
  MessageSquare, Phone, Calendar, Clock, ChevronRight, UserPlus,
  ArrowRight, ShieldCheck, Tag, X, Check, Copy, MoreHorizontal,
  TrendingUp, Award, Layers, Bot, Send, UserCheck, Eye, Compass
} from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';
const getToken = () => localStorage.getItem('rotary_token');

export interface ActivationLead {
  id: string;
  siteId: string | null;
  clubName: string;
  matchedClubId: string | null;
  district: string;
  city: string;
  responsibleName: string;
  role: string;
  email: string;
  phone: string;
  mainInterest: string;
  dataConsent: boolean;
  status: 'nuevo' | 'contactado' | 'interesado' | 'en_activacion' | 'activado' | 'descartado' | 'no_interesado';
  assignedTo: string | null;
  notes: string;
  history: Array<{ at: string; by: string; action: string; note?: string; prevStatus?: string; newStatus?: string }>;
  reminderDate: string | null;
  reminderNote: string | null;
  isEcosystemActive: boolean;
  ecosystemDomain?: string | null;
  activatedAt: string | null;
  activatedBy: string | null;
  campaignId: string | null;
  campaignName: string | null;
  channel: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  originHost: string;
  visitorId: string | null;
  linkedLeadId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const STATUS_MAP: Record<string, { label: string; bg: string; text: string; border: string }> = {
  nuevo: { label: 'Nuevo', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  contactado: { label: 'Contactado', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  interesado: { label: 'Interesado', bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-200' },
  en_activacion: { label: 'En Activación', bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-200' },
  activado: { label: 'Activado', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
  no_interesado: { label: 'No Interesado', bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' },
  descartado: { label: 'Descartado', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
};

export const RotaryActivacionClubes: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [leads, setLeads] = useState<ActivationLead[]>([]);
  const [kpis, setKpis] = useState<any>(null);

  // Filtros
  const [activeStatusTab, setActiveStatusTab] = useState<string>('todos');
  const [searchText, setSearchText] = useState<string>('');
  const [channelFilter, setChannelFilter] = useState<string>('todos');
  const [periodFilter, setPeriodFilter] = useState<string>('todos');

  // Modal / Drawer de detalle
  const [selectedLead, setSelectedLead] = useState<ActivationLead | null>(null);
  const [newNote, setNewNote] = useState<string>('');
  const [assigneeInput, setAssigneeInput] = useState<string>('');
  const [reminderDateInput, setReminderDateInput] = useState<string>('');
  const [reminderNoteInput, setReminderNoteInput] = useState<string>('');
  const [updatingLead, setUpdatingLead] = useState(false);

  const authHeaders = useMemo(() => ({
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'application/json'
  }), []);

  // Carga de leads y KPIs
  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const qParams = new URLSearchParams();
      if (activeStatusTab !== 'todos') qParams.set('status', activeStatusTab);
      if (channelFilter !== 'todos') qParams.set('channel', channelFilter);
      if (periodFilter !== 'todos') qParams.set('period', periodFilter);
      if (searchText.trim()) qParams.set('search', searchText.trim());

      const [resLeads, resKpis] = await Promise.all([
        fetch(`${API}/rotary-en-accion/activacion/leads?${qParams.toString()}`, { headers: authHeaders }).then(r => r.json()).catch(() => null),
        fetch(`${API}/rotary-en-accion/activacion/kpis?period=${periodFilter}`, { headers: authHeaders }).then(r => r.json()).catch(() => null),
      ]);

      if (resLeads?.ok) {
        setLeads(resLeads.leads || []);
      }
      if (resKpis?.ok) {
        setKpis(resKpis);
      }
    } catch (e: any) {
      console.warn('Error loading activation leads:', e);
      toast.error('No se pudieron cargar los datos de activación.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeStatusTab, channelFilter, periodFilter, searchText, authHeaders]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sincronizar lead seleccionado al refrescar
  useEffect(() => {
    if (selectedLead) {
      const updated = leads.find(l => l.id === selectedLead.id);
      if (updated) {
        setSelectedLead(updated);
        setAssigneeInput(updated.assignedTo || '');
        setReminderDateInput(updated.reminderDate ? updated.reminderDate.slice(0, 16) : '');
        setReminderNoteInput(updated.reminderNote || '');
      }
    }
  }, [leads]);

  // Actualizar estado de un lead
  const handleUpdateStatus = async (leadId: string, newStatus: string) => {
    try {
      const res = await fetch(`${API}/rotary-en-accion/activacion/leads/${leadId}/status`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar estado');

      toast.success(data.message || 'Estado actualizado.');
      loadData(true);
    } catch (e: any) {
      toast.error(e.message || 'Error al actualizar el estado.');
    }
  };

  // Guardar nota o recordatorio en el modal
  const handleSaveDetails = async () => {
    if (!selectedLead) return;
    setUpdatingLead(true);
    try {
      const res = await fetch(`${API}/rotary-en-accion/activacion/leads/${selectedLead.id}`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          noteToAdd: newNote.trim() || undefined,
          assignedTo: assigneeInput.trim() || null,
          reminderDate: reminderDateInput || null,
          reminderNote: reminderNoteInput.trim() || null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar detalles');

      toast.success('Detalles guardados exitosamente.');
      setNewNote('');
      loadData(true);
    } catch (e: any) {
      toast.error(e.message || 'Error al guardar los detalles.');
    } finally {
      setUpdatingLead(false);
    }
  };

  // Copiar enlace de activación con parámetros
  const handleCopyLandingLink = (source = 'directo') => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://rotary4281.org';
    const link = `${origin}/activar-mi-club?utm_source=${source}&utm_medium=crm&utm_campaign=embudo_activacion`;
    navigator.clipboard.writeText(link);
    toast.success('Enlace copiado al portapapeles con trazabilidad UTM.');
  };

  // Generar URL de WhatsApp prellenado para contactar al interesado
  const getWhatsAppLink = (lead: ActivationLead) => {
    const cleanPhone = lead.phone.replace(/[^\d]/g, '');
    const msg = `Hola ${lead.responsibleName}, te saluda el equipo de Transformación Digital de Club Platform y Rotary en Acción. Recibimos tu solicitud para activar el ecosistema digital del Club Rotario ${lead.clubName}. ¿Tienes unos minutos para coordinar los accesos y detalles?`;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
  };

  const fmtFecha = (v?: string | null) => {
    if (!v) return '—';
    try {
      return new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return v;
    }
  };

  const fmtHora = (v?: string | null) => {
    if (!v) return '—';
    try {
      return new Date(v).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* ── CABECERA Y ACCIONES SUPERIORES ───────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-blue-900 via-indigo-950 to-slate-900 p-6 sm:p-8 rounded-3xl text-white shadow-md">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-black uppercase tracking-wider bg-amber-400 text-blue-950 px-2.5 py-0.5 rounded-full shadow-xs">
              Embudo Inteligente
            </span>
            <span className="text-xs text-blue-200">
              Rotary en Acción &bull; Club Platform
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Activación de Clubes Rotarios
          </h2>
          <p className="text-sm text-blue-200 mt-1 max-w-2xl">
            Canal de captación y CRM ligero para motivar a los clubes a activar su ecosistema digital, con trazabilidad completa desde la campaña hasta la activación confirmada.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <a
            href="/activar-mi-club"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl border border-white/20 transition-all backdrop-blur-sm"
          >
            <Globe className="w-4 h-4 text-blue-300" />
            <span>Abrir Landing (/activar-mi-club)</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-70" />
          </a>

          <button
            type="button"
            onClick={() => handleCopyLandingLink('compartido')}
            className="inline-flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-blue-950 font-black text-xs sm:text-sm px-4 py-2.5 rounded-xl shadow-md transition-all"
          >
            <Copy className="w-4 h-4" />
            <span>Copiar Enlace UTM</span>
          </button>

          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all border border-white/20"
            title="Actualizar datos"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── PANEL DE INDICADORES (KPIS) ─────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-100 shadow-xs">
          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Total Interesados</div>
          <div className="text-2xl sm:text-3xl font-black text-gray-900 mt-1">
            {kpis?.kpis?.totalInteresados || leads.length}
          </div>
          <div className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-blue-500" />
            <span>{kpis?.kpis?.clubesUnicos || 0} clubes únicos</span>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-100 shadow-xs">
          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Nuevos</div>
          <div className="text-2xl sm:text-3xl font-black text-blue-600 mt-1">
            {kpis?.byStatus?.nuevo || leads.filter(l => l.status === 'nuevo').length}
          </div>
          <div className="text-[11px] text-blue-600/80 mt-1 font-medium">
            Pendientes por contactar
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-100 shadow-xs">
          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Contactados</div>
          <div className="text-2xl sm:text-3xl font-black text-amber-600 mt-1">
            {kpis?.byStatus?.contactado || leads.filter(l => l.status === 'contactado').length}
          </div>
          <div className="text-[11px] text-amber-600/80 mt-1 font-medium">
            En conversación inicial
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-100 shadow-xs">
          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">En Activación</div>
          <div className="text-2xl sm:text-3xl font-black text-purple-600 mt-1">
            {kpis?.byStatus?.en_activacion || leads.filter(l => l.status === 'en_activacion').length}
          </div>
          <div className="text-[11px] text-purple-600/80 mt-1 font-medium">
            Configurando ecosistema
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-100 shadow-xs bg-gradient-to-br from-emerald-50/50 to-white">
          <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Activados</div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-600 mt-1">
            {kpis?.kpis?.activadosConfirmados || leads.filter(l => l.status === 'activado' || l.isEcosystemActive).length}
          </div>
          <div className="text-[11px] text-emerald-700 mt-1 font-medium flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Confirmados en BD</span>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-100 shadow-xs">
          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Conversión Lead</div>
          <div className="text-2xl sm:text-3xl font-black text-rotary-blue mt-1">
            {kpis?.kpis?.tasaLeadAActivado || '0%'}
          </div>
          <div className="text-[11px] text-gray-400 mt-1">
            Interesados a activados
          </div>
        </div>
      </div>

      {/* ── EMBUDO VISUAL DE CONVERSIÓN ─────────────────────────────────── */}
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-black text-gray-900">
              Embudo de Adquisición y Conversión
            </h3>
            <p className="text-xs text-gray-500">
              Trazabilidad en tiempo real desde el clic en la campaña hasta la activación oficial del club.
            </p>
          </div>
          <div className="text-xs font-bold text-gray-500 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100">
            Conversión Global: <strong className="text-rotary-blue">{kpis?.kpis?.tasaConversionGlobal || '0%'}</strong>
          </div>
        </div>

        {/* Pasos del embudo */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center relative">
            <div className="text-[11px] font-bold text-gray-400 uppercase">1. Visitas Landing</div>
            <div className="text-2xl font-black text-gray-800 my-1">{kpis?.funnel?.visitas || 0}</div>
            <div className="text-[10px] text-gray-500">Tráfico total a /activar-mi-club</div>
          </div>

          <div className="bg-blue-50/60 p-4 rounded-2xl border border-blue-100 text-center relative">
            <div className="text-[11px] font-bold text-blue-700 uppercase">2. Formulario Iniciado</div>
            <div className="text-2xl font-black text-blue-900 my-1">{kpis?.funnel?.formulariosIniciados || 0}</div>
            <div className="text-[10px] text-blue-600 font-medium">
              {kpis?.conversionRates?.visitToFormPct || 0}% de visitas
            </div>
          </div>

          <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-100 text-center relative">
            <div className="text-[11px] font-bold text-amber-800 uppercase">3. Solicitudes (Leads)</div>
            <div className="text-2xl font-black text-amber-900 my-1">{kpis?.funnel?.solicitudes || leads.length}</div>
            <div className="text-[10px] text-amber-700 font-medium">
              {kpis?.conversionRates?.formToLeadPct || 0}% completaron
            </div>
          </div>

          <div className="bg-purple-50/60 p-4 rounded-2xl border border-purple-100 text-center relative">
            <div className="text-[11px] font-bold text-purple-800 uppercase">4. En Activación</div>
            <div className="text-2xl font-black text-purple-900 my-1">{kpis?.funnel?.enActivacion || 0}</div>
            <div className="text-[10px] text-purple-700 font-medium">
              {kpis?.conversionRates?.leadToContactedPct || 0}% calificados
            </div>
          </div>

          <div className="bg-emerald-50/80 p-4 rounded-2xl border border-emerald-200 text-center relative">
            <div className="text-[11px] font-bold text-emerald-800 uppercase">5. Activados Oficiales</div>
            <div className="text-2xl font-black text-emerald-900 my-1">{kpis?.funnel?.activadosConfirmados || 0}</div>
            <div className="text-[10px] text-emerald-700 font-bold">
              {kpis?.conversionRates?.leadToActivePct || 0}% conversión final
            </div>
          </div>
        </div>
      </div>

      {/* ── CRM LIGERO: BANDEJA DE SOLICITUDES ───────────────────────────── */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-xs overflow-hidden">
        {/* Barra superior de pestañas de estado */}
        <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3 bg-gray-50/50">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'todos', label: 'Todos' },
              { id: 'nuevo', label: 'Nuevos' },
              { id: 'contactado', label: 'Contactados' },
              { id: 'interesado', label: 'Interesados' },
              { id: 'en_activacion', label: 'En Activación' },
              { id: 'activado', label: 'Activados' },
              { id: 'descartado', label: 'Descartados / No interesado' },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveStatusTab(tab.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeStatusTab === tab.id
                    ? 'bg-rotary-blue text-white shadow-xs'
                    : 'text-gray-600 hover:bg-gray-200/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Filtros secundarios */}
          <div className="flex items-center gap-2">
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="text-xs font-bold px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-gray-700 outline-none"
            >
              <option value="todos">Todos los Canales</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="organico">Orgánico</option>
            </select>

            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="text-xs font-bold px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-gray-700 outline-none"
            >
              <option value="todos">Cualquier fecha</option>
              <option value="7d">Últimos 7 días</option>
              <option value="30d">Últimos 30 días</option>
              <option value="90d">Últimos 90 días</option>
            </select>
          </div>
        </div>

        {/* Buscador */}
        <div className="p-4 border-b border-gray-100 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por club, responsable, correo o WhatsApp..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-gray-200 focus:border-rotary-blue outline-none transition-colors"
            />
          </div>
          {searchText && (
            <button
              type="button"
              onClick={() => setSearchText('')}
              className="text-xs text-gray-400 hover:text-gray-600 font-bold"
            >
              Limpiar
            </button>
          )}
        </div>

        {/* Listado de Leads */}
        {loading ? (
          <div className="p-12 text-center text-gray-400 text-sm">
            Cargando solicitudes de activación...
          </div>
        ) : leads.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">
            <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="font-bold text-gray-700">No se encontraron solicitudes con los filtros actuales.</p>
            <p className="text-xs mt-1">Los interesados que completen /activar-mi-club aparecerán aquí inmediatamente.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {leads.map((lead) => {
              const statusCfg = STATUS_MAP[lead.status] || STATUS_MAP.nuevo;
              const hasReminder = !!lead.reminderDate;
              const isOverdue = hasReminder && new Date(lead.reminderDate!).getTime() < Date.now();

              return (
                <div
                  key={lead.id}
                  className="p-5 hover:bg-slate-50/60 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  {/* Columna Izquierda: Club y Responsable */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-bold text-gray-900 text-base">
                        Club Rotario {lead.clubName}
                      </h4>
                      {lead.isEcosystemActive && (
                        <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Ecosistema Activo</span>
                        </span>
                      )}
                      {lead.district && (
                        <span className="text-xs text-gray-400">
                          &bull; {lead.district}
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-gray-600 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="font-semibold text-gray-800">
                        {lead.responsibleName} ({lead.role})
                      </span>
                      <span className="text-gray-400">&bull;</span>
                      <span className="text-gray-500">{lead.email}</span>
                      <span className="text-gray-400">&bull;</span>
                      <span className="text-gray-500">{lead.phone}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-gray-400">
                      <span>Registrado: {fmtFecha(lead.createdAt)}</span>
                      <span>&bull;</span>
                      <span className="inline-flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded-md font-medium text-gray-600">
                        Canal: {lead.channel}
                      </span>
                      {lead.utmCampaign && (
                        <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-medium">
                          UTM: {lead.utmCampaign}
                        </span>
                      )}
                      {hasReminder && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold ${
                          isOverdue ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          <Clock className="w-3 h-3" />
                          <span>Recordatorio: {fmtFecha(lead.reminderDate)}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Columna Derecha: Acciones directas y Estado */}
                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    {/* Botón WhatsApp directo */}
                    <a
                      href={getWhatsAppLink(lead)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs border border-emerald-200 transition-colors"
                      title="Enviar mensaje de WhatsApp prellenado"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                      <span>WhatsApp</span>
                    </a>

                    {/* Botón Correo directo */}
                    <a
                      href={`mailto:${lead.email}?subject=${encodeURIComponent(`Activación Ecosistema Club Platform | Club Rotario ${lead.clubName}`)}`}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs border border-blue-200 transition-colors"
                      title="Enviar correo institucional"
                    >
                      <Mail className="w-3.5 h-3.5 text-blue-600" />
                      <span>Correo</span>
                    </a>

                    {/* Selector de Estado */}
                    <select
                      value={lead.status}
                      onChange={(e) => handleUpdateStatus(lead.id, e.target.value)}
                      className={`text-xs font-bold px-3 py-2 rounded-xl border transition-colors outline-none cursor-pointer ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}
                    >
                      <option value="nuevo">Nuevo</option>
                      <option value="contactado">Contactado</option>
                      <option value="interesado">Interesado</option>
                      <option value="en_activacion">En Activación</option>
                      <option value="activado">Activado</option>
                      <option value="no_interesado">No Interesado</option>
                      <option value="descartado">Descartado</option>
                    </select>

                    {/* Botón Detalles / Historial */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLead(lead);
                        setAssigneeInput(lead.assignedTo || '');
                        setReminderDateInput(lead.reminderDate ? lead.reminderDate.slice(0, 16) : '');
                        setReminderNoteInput(lead.reminderNote || '');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5 text-gray-500" />
                      <span>Detalle</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── MODAL / DRAWER DE DETALLE Y SEGUIMIENTO ──────────────────────── */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header del modal */}
            <div className="p-6 bg-slate-900 text-white flex items-start justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider bg-white/20 text-white px-2 py-0.5 rounded-full">
                  Ficha de Activación CRM
                </span>
                <h3 className="text-xl font-black text-white mt-2">
                  Club Rotario {selectedLead.clubName}
                </h3>
                <p className="text-xs text-blue-200">
                  Responsable: {selectedLead.responsibleName} ({selectedLead.role}) &bull; {selectedLead.district}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedLead(null)}
                className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Contenido scrolleable */}
            <div className="p-6 overflow-y-auto space-y-6 text-sm flex-1">
              {/* Información de contacto y origen */}
              <div className="grid grid-cols-2 gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-100 text-xs">
                <div>
                  <span className="text-gray-400 block font-bold uppercase tracking-wider text-[10px]">Correo Electrónico</span>
                  <span className="font-bold text-gray-800">{selectedLead.email}</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-bold uppercase tracking-wider text-[10px]">WhatsApp</span>
                  <span className="font-bold text-gray-800">{selectedLead.phone}</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-bold uppercase tracking-wider text-[10px]">Canal y Campaña</span>
                  <span className="font-bold text-gray-800">{selectedLead.channel} ({selectedLead.utmCampaign || 'Orgánico'})</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-bold uppercase tracking-wider text-[10px]">Interés Principal</span>
                  <span className="font-bold text-rotary-blue">{selectedLead.mainInterest}</span>
                </div>
              </div>

              {/* Verificación de Ecosistema en Club Platform */}
              <div className="p-4 rounded-2xl border bg-blue-50/50 border-blue-100 flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-bold text-gray-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-rotary-blue" />
                    <span>Verificación en Club Platform</span>
                  </h4>
                  <p className="text-xs text-gray-600 mt-1">
                    {selectedLead.isEcosystemActive
                      ? 'Este club ya tiene un portal institucional activo en la base de datos de la plataforma.'
                      : 'El club no tiene aún un portal activo en Club Platform. Pendiente por provisión.'}
                  </p>
                  {selectedLead.ecosystemDomain && (
                    <div className="text-xs font-bold text-blue-700 mt-1 flex items-center gap-1">
                      <span>Dominio: {selectedLead.ecosystemDomain}</span>
                    </div>
                  )}
                </div>

                {selectedLead.status !== 'activado' && (
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus(selectedLead.id, 'activado')}
                    className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-xs transition-colors"
                  >
                    Marcar como Activado
                  </button>
                )}
              </div>

              {/* Asignación y Recordatorio */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-black text-gray-400 uppercase tracking-wider mb-1">
                    Asignar Responsable
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Daniel Yazo / Soporte"
                    value={assigneeInput}
                    onChange={(e) => setAssigneeInput(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-xs focus:border-rotary-blue outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black text-gray-400 uppercase tracking-wider mb-1">
                    Programar Recordatorio
                  </label>
                  <input
                    type="datetime-local"
                    value={reminderDateInput}
                    onChange={(e) => setReminderDateInput(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-xs focus:border-rotary-blue outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-black text-gray-400 uppercase tracking-wider mb-1">
                    Nota del Recordatorio / Próxima Acción
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Enviar propuesta de activación de socios por WhatsApp..."
                    value={reminderNoteInput}
                    onChange={(e) => setReminderNoteInput(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-xs focus:border-rotary-blue outline-none"
                  />
                </div>
              </div>

              {/* Agregar Nota de Seguimiento */}
              <div>
                <label className="block text-[11px] font-black text-gray-400 uppercase tracking-wider mb-1">
                  Agregar Nueva Observación de Seguimiento
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ej. Se conversó con el presidente; enviará lista de socios el viernes..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    className="flex-1 px-3.5 py-2 rounded-xl border border-gray-200 text-xs focus:border-rotary-blue outline-none"
                  />
                </div>
              </div>

              {/* Historial de eventos y notas */}
              <div>
                <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2">
                  Historial de Seguimiento ({selectedLead.history?.length || 0})
                </h4>
                <div className="bg-gray-50 rounded-2xl p-3 max-h-48 overflow-y-auto space-y-2 border border-gray-100 divide-y divide-gray-100">
                  {(!selectedLead.history || selectedLead.history.length === 0) ? (
                    <div className="text-xs text-gray-400 text-center py-2">
                      Sin eventos registrados aún.
                    </div>
                  ) : (
                    selectedLead.history.map((h, i) => (
                      <div key={i} className="pt-2 first:pt-0 text-xs">
                        <div className="flex items-center justify-between text-gray-400 text-[10px]">
                          <span className="font-bold text-gray-700">{h.by} &bull; {h.action}</span>
                          <span>{fmtFecha(h.at)} {fmtHora(h.at)}</span>
                        </div>
                        {h.note && (
                          <p className="text-gray-600 mt-0.5">{h.note}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Footer del modal */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              {selectedLead.linkedLeadId ? (
                <a
                  href={`/admin/leads?search=${encodeURIComponent(selectedLead.email)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1"
                >
                  <span>Ver en Contactos &amp; Leads</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <span className="text-xs text-gray-400">Sin duplicar en Contactos</span>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedLead(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  Cerrar
                </button>

                <button
                  type="button"
                  disabled={updatingLead}
                  onClick={handleSaveDetails}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-rotary-blue hover:bg-[#002868] text-white shadow-xs transition-colors disabled:opacity-50"
                >
                  {updatingLead ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RotaryActivacionClubes;
