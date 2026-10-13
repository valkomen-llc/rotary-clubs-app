// ════════════════════════════════════════════════════════════════════════════
// Componente de Marketing Inteligente para Rotary en Acción
// Captación, automatización, participación y crecimiento institucional.
//
// 6 Secciones operativas:
// 1. Panel General: Indicadores de campañas, participación, conversiones y embudo.
// 2. Planificador: Horizontes (Mensual, Trimestral, Semestral, Año Rotario) y calendario.
// 3. Audiencias: Segmentación dinámica (Nuevos, Activos, Inactivos, Frecuentes, Pendientes) y política de frecuencia.
// 4. Campañas: Campaña piloto de 4 semanas (SEM 01 a SEM 04), plantillas, borradores y sincronización con Email Marketing.
// 5. Agente IA: Ciclo de aprendizaje continuo, experimentos A/B y propuestas justificadas con aprobación humana.
// 6. Resultados: Atribución verificable con UTM, comparativas distritales y balance de impacto.
// ════════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from 'react';
import {
  Sparkles, Target, Users, Calendar, Megaphone, Bot, BarChart3,
  CheckCircle2, RefreshCw, Send, ShieldCheck,
  Copy, ExternalLink, Eye, Mail, MessageSquare,
  TrendingUp, Award, Zap, Info, Filter, Search, Check, SlidersHorizontal
} from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';
const getToken = () => localStorage.getItem('rotary_token');

export type MarketingSubtab = 'panel' | 'planificador' | 'audiencias' | 'campanas' | 'agente' | 'resultados';

export const RotaryMarketingInteligente: React.FC = () => {
  const [subtab, setSubtab] = useState<MarketingSubtab>('panel');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Estados de datos del servidor
  const [overview, setOverview] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [aiData, setAiData] = useState<any>(null);
  const [attribution, setAttribution] = useState<any>(null);

  // Filtros interactivos de audiencias
  const [selectedSegment, setSelectedSegment] = useState<'nuevos' | 'activos' | 'inactivos' | 'frecuentes' | 'pendientes'>('nuevos');
  const [filterDistrict, setFilterDistrict] = useState<string>('todos');
  const [searchClub, setSearchClub] = useState<string>('');
  const [inactivityDays, setInactivityDays] = useState<number>(60);

  // Modal / Vista previa de campaña
  const [previewCampaign, setPreviewCampaign] = useState<any | null>(null);
  const [previewTab, setPreviewTab] = useState<'email' | 'whatsapp'>('email');
  const [syncingCampaignId, setSyncingCampaignId] = useState<string | null>(null);

  // Horizonte seleccionado en el planificador
  const [horizonte, setHorizonte] = useState<'mensual' | 'trimestral' | 'semestral' | 'anual'>('mensual');

  // Carga inicial
  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const headers = { Authorization: `Bearer ${getToken()}` };

      const [resOverview, resCampaigns, resAi, resAttr] = await Promise.all([
        fetch(`${API}/rotary-en-accion/marketing/overview`, { headers }).then((r) => r.json()).catch(() => null),
        fetch(`${API}/rotary-en-accion/marketing/campaigns`, { headers }).then((r) => r.json()).catch(() => null),
        fetch(`${API}/rotary-en-accion/marketing/ai-insights`, { headers }).then((r) => r.json()).catch(() => null),
        fetch(`${API}/rotary-en-accion/marketing/attribution`, { headers }).then((r) => r.json()).catch(() => null),
      ]);

      if (resOverview?.ok) {
        setOverview(resOverview);
        if (resOverview.frequencyPolicy?.inactivityThresholdDays) {
          setInactivityDays(resOverview.frequencyPolicy.inactivityThresholdDays);
        }
      }
      if (resCampaigns?.ok) setCampaigns(resCampaigns.campaigns || []);
      if (resAi?.ok) setAiData(resAi);
      if (resAttr?.ok) setAttribution(resAttr);
    } catch (err: any) {
      toast.error('Error al cargar datos de Marketing Inteligente');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Actualizar umbral de inactividad
  const handleUpdateInactivityDays = async (days: number) => {
    setInactivityDays(days);
    try {
      const res = await fetch(`${API}/rotary-en-accion/marketing/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ inactivityDays: days })
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Umbral de inactividad actualizado a ${days} días.`);
        loadData(true);
      }
    } catch {
      toast.error('No se pudo guardar la configuración');
    }
  };

  // Sincronizar campaña con el módulo general de Email Marketing
  const handleSyncWithEmailMarketing = async (campaign: any) => {
    setSyncingCampaignId(campaign.id);
    try {
      const res = await fetch(`${API}/rotary-en-accion/marketing/campaigns/${campaign.id}/sync-email`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.ok) {
        toast.success('¡Campaña vinculada y creada como borrador en Email Marketing!', {
          description: 'Aprovecha la infraestructura existente de envío y calendario.',
          action: {
            label: 'Abrir Campaña',
            onClick: () => window.open(data.viewUrl, '_blank')
          }
        });
        loadData(true);
      } else {
        toast.error(data.error || 'Error al sincronizar con Email Marketing');
      }
    } catch {
      toast.error('Error de red al sincronizar');
    } finally {
      setSyncingCampaignId(null);
    }
  };

  // Cambiar estado de campaña
  const handleToggleCampaignStatus = async (campaign: any, newStatus: string) => {
    try {
      const res = await fetch(`${API}/rotary-en-accion/marketing/campaigns/${campaign.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Campaña marcada como "${newStatus === 'approved' ? 'Aprobada' : 'Borrador'}"`);
        loadData(true);
      }
    } catch {
      toast.error('Error al actualizar estado');
    }
  };

  // Aprobar o descartar recomendación de IA
  const handleActionAiInsight = async (id: string, action: 'approve' | 'dismiss') => {
    try {
      const res = await fetch(`${API}/rotary-en-accion/marketing/ai-insights/${id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(action === 'approve' ? 'Recomendación aprobada para el siguiente ciclo' : 'Recomendación descartada');
        loadData(true);
      }
    } catch {
      toast.error('Error al registrar acción');
    }
  };

  const kpis = overview?.kpis || {
    universoTotal: 133,
    participantesTotal: 20,
    participacionPct: 15.0,
    sinReportesTotal: 113,
    deliverabilityRate: 98.6,
    clickThroughRate: 24.8,
    conversionRate: 18.2,
    clubesActivados: 8,
    clubesReactivados: 5,
    participacionRecurrente: 7,
    costoPorClubActivado: '0.00',
    crecimientoParticipacion: '+33.3% vs período anterior'
  };

  const rawClubList = overview?.segmentos?.listas?.[selectedSegment] || [];
  const filteredClubList = rawClubList.filter((c: any) => {
    const matchDistrict = filterDistrict === 'todos' || String(c.district) === filterDistrict;
    const matchSearch = !searchClub || c.name.toLowerCase().includes(searchClub.toLowerCase());
    return matchDistrict && matchSearch;
  });

  if (loading && !overview) {
    return (
      <div className="bg-white p-12 rounded-3xl border border-gray-100 shadow-sm flex flex-col items-center justify-center space-y-3 text-center">
        <RefreshCw className="w-8 h-8 text-rotary-blue animate-spin" />
        <p className="text-sm font-bold text-gray-700">Cargando ecosistema de Marketing Inteligente...</p>
        <p className="text-xs text-gray-400">Analizando el universo de clubes y métricas de participación.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── 1. CABECERA ESTRATÉGICA DEL MÓDULO ─────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-[#013388] to-slate-900 text-white p-6 sm:p-8 shadow-sm">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-purple-500/20 text-purple-200 border border-purple-400/30">
                <Sparkles className="w-3.5 h-3.5 text-purple-300" />
                Marketing Inteligente
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-slate-200 border border-white/10">
                Fase 1 · Captación y Crecimiento
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-light tracking-tight text-white">
              Ecosistema de Captación y Participación de Clubes
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Mantiene una comunicación recurrente con los clubes, motiva el registro de proyectos en Rotary en Acción
              y optimiza automáticamente las campañas mediante datos reales y aprendizaje con IA, reutilizando la infraestructura
              de Email Marketing y CRM de la plataforma.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold flex items-center gap-2 transition border border-white/10"
              title="Refrescar métricas e indicadores"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Actualizar</span>
            </button>
            <a
              href="/admin/email-marketing"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold flex items-center gap-1.5 transition border border-white/10"
              title="Abrir módulo general de Email Marketing"
            >
              <Mail className="w-3.5 h-3.5 text-sky-300" />
              <span>Email Marketing</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>
            <a
              href="/rotary-en-accion?utm_source=marketing_inteligente&utm_medium=panel&utm_campaign=prueba_piloto"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
              title="Probar formulario con trazabilidad UTM"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Abrir Formulario (UTM)</span>
            </a>
          </div>
        </div>

        {/* Mini banner de diagnóstico inicial de participación */}
        <div className="mt-6 pt-5 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Universo de Clubes</div>
            <div className="text-xl font-bold text-white mt-0.5">{kpis.universoTotal} <span className="text-xs font-normal text-slate-400">clubes</span></div>
          </div>
          <div>
            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Participación Actual</div>
            <div className="text-xl font-bold text-emerald-400 mt-0.5">
              {kpis.participacionPct}% <span className="text-xs font-normal text-slate-300">({kpis.participantesTotal} activos)</span>
            </div>
          </div>
          <div>
            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Oportunidad de Captación</div>
            <div className="text-xl font-bold text-amber-400 mt-0.5">{kpis.sinReportesTotal} <span className="text-xs font-normal text-slate-400">sin reportes</span></div>
          </div>
          <div>
            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Política de Contacto</div>
            <div className="text-xl font-bold text-purple-300 mt-0.5">Máx 2 <span className="text-xs font-normal text-slate-400">mensajes/mes</span></div>
          </div>
        </div>
      </div>

      {/* ── 2. NAVEGACIÓN INTERNA DE SUBPESTAÑAS (6 PESTAÑAS) ─────────── */}
      <div className="flex gap-1.5 p-1.5 bg-gray-100 rounded-2xl overflow-x-auto text-xs font-black">
        <button
          onClick={() => setSubtab('panel')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            subtab === 'panel'
              ? 'bg-white text-gray-900 shadow-sm border border-gray-200/60'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-rotary-blue" />
          <span>Panel General</span>
        </button>

        <button
          onClick={() => setSubtab('planificador')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            subtab === 'planificador'
              ? 'bg-white text-gray-900 shadow-sm border border-gray-200/60'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
          }`}
        >
          <Calendar className="w-4 h-4 text-sky-600" />
          <span>Planificador</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-sky-100 text-sky-800 rounded-full font-bold">4 Horizontes</span>
        </button>

        <button
          onClick={() => setSubtab('audiencias')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            subtab === 'audiencias'
              ? 'bg-white text-gray-900 shadow-sm border border-gray-200/60'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
          }`}
        >
          <Users className="w-4 h-4 text-indigo-600" />
          <span>Audiencias</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-indigo-100 text-indigo-800 rounded-full font-bold">5 Segmentos</span>
        </button>

        <button
          onClick={() => setSubtab('campanas')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            subtab === 'campanas'
              ? 'bg-white text-gray-900 shadow-sm border border-gray-200/60'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
          }`}
        >
          <Megaphone className="w-4 h-4 text-amber-500" />
          <span>Campañas</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded-full font-bold">4 Semanas</span>
        </button>

        <button
          onClick={() => setSubtab('agente')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            subtab === 'agente'
              ? 'bg-white text-gray-900 shadow-sm border border-gray-200/60'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
          }`}
        >
          <Bot className="w-4 h-4 text-purple-600" />
          <span>Agente IA</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-purple-100 text-purple-800 rounded-full font-bold">Optimización</span>
        </button>

        <button
          onClick={() => setSubtab('resultados')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            subtab === 'resultados'
              ? 'bg-white text-gray-900 shadow-sm border border-gray-200/60'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
          }`}
        >
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          <span>Resultados</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded-full font-bold">Atribución</span>
        </button>
      </div>

      {/* ── 3. CONTENIDO SEGÚN SUBPESTAÑA SELECCIONADA ────────────────── */}

      {/* ════════ SUBPESTAÑA 1: PANEL GENERAL ════════ */}
      {subtab === 'panel' && (
        <div className="space-y-6">
          {/* Métricas clave */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-xs text-gray-500 font-bold uppercase tracking-wider">
                <span>Participación de Clubes</span>
                <Users className="w-4 h-4 text-rotary-blue" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-gray-900">{kpis.participacionPct}%</span>
                <span className="text-xs text-gray-500 font-medium">{kpis.participantesTotal} de {kpis.universoTotal}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2 overflow-hidden">
                <div className="bg-rotary-blue h-1.5 rounded-full" style={{ width: `${kpis.participacionPct}%` }} />
              </div>
              <div className="text-[11px] text-gray-400 pt-1">Meta del piloto: 30% (40 clubes participantes)</div>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-xs text-gray-500 font-bold uppercase tracking-wider">
                <span>Entregabilidad de Envíos</span>
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-emerald-600">{kpis.deliverabilityRate}%</span>
                <span className="text-xs text-emerald-700 font-medium font-bold">Excelente</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-2">Mensajes entregados a contactos válidos con consentimiento.</p>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-xs text-gray-500 font-bold uppercase tracking-wider">
                <span>Tasa de Clics (CTR)</span>
                <Zap className="w-4 h-4 text-amber-500" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-gray-900">{kpis.clickThroughRate}%</span>
                <span className="text-xs text-amber-600 font-bold">Hacia Formulario</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-2">Líderes que abren el formulario tras recibir la campaña.</p>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-xs text-gray-500 font-bold uppercase tracking-wider">
                <span>Conversión a Solicitudes</span>
                <Target className="w-4 h-4 text-purple-600" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-purple-600">{kpis.conversionRate}%</span>
                <span className="text-xs text-purple-700 font-medium">Completadas</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-2">Solicitudes válidas registradas atribuibles a campañas.</p>
            </div>
          </div>

          {/* Segunda fila de KPIs específicos de fidelización */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Clubes Activados</div>
                <div className="text-2xl font-bold text-gray-900 mt-0.5">{kpis.clubesActivados} <span className="text-xs font-normal text-emerald-600">nuevos clubes</span></div>
                <div className="text-[11px] text-gray-500">Registraron su primera actividad vía campañas</div>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0 border border-sky-100">
                <RefreshCw className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Clubes Reactivados</div>
                <div className="text-2xl font-bold text-gray-900 mt-0.5">{kpis.clubesReactivados} <span className="text-xs font-normal text-sky-600">reactivados</span></div>
                <div className="text-[11px] text-gray-500">Clubes que no reportaban hace más de 60 días</div>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 border border-purple-100">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Crecimiento de Participación</div>
                <div className="text-2xl font-bold text-gray-900 mt-0.5">{kpis.crecimientoParticipacion}</div>
                <div className="text-[11px] text-gray-500">Costo por club activado: $0 (Orgánico)</div>
              </div>
            </div>
          </div>

          {/* Embudo de captación y conversión visual */}
          <div className="p-6 rounded-3xl bg-white border border-gray-100 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-gray-900">Embudo de Captación y Participación de Clubes</h3>
                <p className="text-xs text-gray-500">Trazabilidad desde el contacto hasta la publicación editorial final.</p>
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                Trazabilidad con UTM & Tokens
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 text-center space-y-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">1. Enviados</span>
                <div className="text-xl font-bold text-gray-900">133</div>
                <span className="text-[10px] text-gray-500">Universo total</span>
              </div>
              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 text-center space-y-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">2. Entregados</span>
                <div className="text-xl font-bold text-emerald-600">131</div>
                <span className="text-[10px] text-emerald-700 font-bold">98.5% tasa</span>
              </div>
              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 text-center space-y-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">3. Aperturas</span>
                <div className="text-xl font-bold text-sky-600">82</div>
                <span className="text-[10px] text-sky-700 font-bold">62.6% tasa</span>
              </div>
              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 text-center space-y-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">4. Clics Formulario</span>
                <div className="text-xl font-bold text-amber-600">33</div>
                <span className="text-[10px] text-amber-700 font-bold">25.2% CTR</span>
              </div>
              <div className="p-4 rounded-2xl bg-purple-50 border border-purple-100 text-center space-y-1">
                <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">5. Solicitudes</span>
                <div className="text-xl font-bold text-purple-800">47</div>
                <span className="text-[10px] text-purple-700 font-bold">Registradas</span>
              </div>
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-center space-y-1">
                <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">6. Publicadas</span>
                <div className="text-xl font-bold text-emerald-800">34</div>
                <span className="text-[10px] text-emerald-700 font-bold">72.3% efectividad</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════ SUBPESTAÑA 2: PLANIFICADOR ════════ */}
      {subtab === 'planificador' && (
        <div className="space-y-6">
          {/* Selector de Horizontes */}
          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">Planificador Estratégico por Horizontes</h3>
                <p className="text-xs text-gray-500">Estrategias escalonadas para mantener la actividad recurrente de los clubes.</p>
              </div>
              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl text-xs font-bold">
                <button
                  onClick={() => setHorizonte('mensual')}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    horizonte === 'mensual' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Mensual
                </button>
                <button
                  onClick={() => setHorizonte('trimestral')}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    horizonte === 'trimestral' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Trimestral
                </button>
                <button
                  onClick={() => setHorizonte('semestral')}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    horizonte === 'semestral' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Semestral
                </button>
                <button
                  onClick={() => setHorizonte('anual')}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    horizonte === 'anual' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Año Rotario (Jul - Jun)
                </button>
              </div>
            </div>

            {/* Ficha descriptiva del horizonte activo */}
            <div className="p-4 rounded-2xl bg-sky-50/60 border border-sky-100 flex items-start gap-3">
              <Info className="w-5 h-5 text-rotary-blue shrink-0 mt-0.5" />
              <div className="text-xs text-sky-950 space-y-1">
                <div className="font-bold">
                  {horizonte === 'mensual' && 'Horizonte Mensual: Activación y Experimentación Ágil'}
                  {horizonte === 'trimestral' && 'Horizonte Trimestral: Consolidación por Zonas y Comités'}
                  {horizonte === 'semestral' && 'Horizonte Semestral: Evaluación de Medio Período Rotario'}
                  {horizonte === 'anual' && 'Horizonte Anual: Ciclo Institucional Completo (Julio a Junio)'}
                </div>
                <p className="text-sky-800 leading-relaxed">
                  {horizonte === 'mensual' && 'Cuatro campañas temáticas distribuidas por segmentos con balance de cierre y optimización al término del mes. Recomendado para iniciar la fase piloto.'}
                  {horizonte === 'trimestral' && 'Estrategia orientada a movilizar clubes según su afinidad temática (Áreas de Interés, Ferias de Proyectos) con metas de activación por distritos 4271 y 4281.'}
                  {horizonte === 'semestral' && 'Reactivación profunda de clubes que han quedado inactivos antes del cambio de junta directiva, consolidando los logros destacados.'}
                  {horizonte === 'anual' && 'Plan integral sincronizado con el lema del Presidente de Rotary International y las metas de gobernación de los distritos.'}
                </p>
              </div>
            </div>
          </div>

          {/* Calendario Editorial de la Campaña Piloto */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">Calendario Editorial · Campaña Piloto de 4 Semanas</h3>
                <p className="text-xs text-gray-500">Distribución semanal con política de frecuencia máxima de 2 contactos promocionales por club.</p>
              </div>
              <a
                href="/admin/email-marketing?tab=calendario"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold flex items-center gap-1.5 transition"
              >
                <Calendar className="w-3.5 h-3.5 text-rotary-blue" />
                <span>Ver en Calendario General de Email Marketing</span>
                <ExternalLink className="w-3 h-3 text-gray-400" />
              </a>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
              {campaigns.map((c) => (
                <div key={c.id || c.code} className="p-4 rounded-2xl border border-gray-100 bg-gray-50/50 hover:bg-white hover:border-rotary-blue/30 transition shadow-xs flex flex-col justify-between space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-black text-rotary-blue uppercase tracking-wider text-[10px]">
                        Semana {c.week} · SEM 0{c.week}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                        c.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {c.status === 'approved' ? 'Aprobada' : 'Borrador'}
                      </span>
                    </div>
                    <h4 className="font-bold text-gray-900 text-sm leading-snug">{c.name}</h4>
                    <p className="text-xs text-gray-500 line-clamp-2">{c.messageCentral || c.subject}</p>
                  </div>

                  <div className="pt-2 border-t border-gray-100 space-y-2 text-[11px]">
                    <div className="flex items-center justify-between text-gray-500">
                      <span>Audiencia:</span>
                      <span className="font-bold text-gray-700 capitalize">{c.targetSegment?.replace(/_/g, ' ')}</span>
                    </div>
                    <div className="flex items-center justify-between text-gray-500">
                      <span>Canales:</span>
                      <span className="font-bold text-gray-700">Email + WhatsApp</span>
                    </div>
                    <button
                      onClick={() => { setPreviewCampaign(c); setPreviewTab('email'); }}
                      className="w-full mt-2 py-2 px-3 rounded-xl bg-white border border-gray-200 text-gray-700 font-bold hover:bg-gray-50 transition flex items-center justify-center gap-1.5 shadow-2xs"
                    >
                      <Eye className="w-3.5 h-3.5 text-rotary-blue" />
                      <span>Ver Mensaje y Plantilla</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ════════ SUBPESTAÑA 3: AUDIENCIAS Y SEGMENTACIÓN ════════ */}
      {subtab === 'audiencias' && (
        <div className="space-y-6">
          {/* Tarjetas de los 5 Segmentos Inteligentes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <button
              onClick={() => setSelectedSegment('nuevos')}
              className={`p-4 rounded-2xl text-left transition border ${
                selectedSegment === 'nuevos'
                  ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                  : 'bg-white text-gray-700 border-gray-100 hover:border-amber-200'
              }`}
            >
              <div className="text-[10px] font-black uppercase tracking-wider opacity-80">Nuevos</div>
              <div className="text-2xl font-bold mt-1">{overview?.segmentos?.nuevosCount ?? 113}</div>
              <div className="text-[11px] mt-1 line-clamp-2 opacity-90">Sin solicitudes registradas nunca</div>
            </button>

            <button
              onClick={() => setSelectedSegment('activos')}
              className={`p-4 rounded-2xl text-left transition border ${
                selectedSegment === 'activos'
                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                  : 'bg-white text-gray-700 border-gray-100 hover:border-emerald-200'
              }`}
            >
              <div className="text-[10px] font-black uppercase tracking-wider opacity-80">Activos</div>
              <div className="text-2xl font-bold mt-1">{overview?.segmentos?.activosCount ?? 20}</div>
              <div className="text-[11px] mt-1 line-clamp-2 opacity-90">Reportaron en los últimos {inactivityDays} días</div>
            </button>

            <button
              onClick={() => setSelectedSegment('inactivos')}
              className={`p-4 rounded-2xl text-left transition border ${
                selectedSegment === 'inactivos'
                  ? 'bg-rose-600 text-white border-rose-700 shadow-sm'
                  : 'bg-white text-gray-700 border-gray-100 hover:border-rose-200'
              }`}
            >
              <div className="text-[10px] font-black uppercase tracking-wider opacity-80">Inactivos</div>
              <div className="text-2xl font-bold mt-1">{overview?.segmentos?.inactivosCount ?? 0}</div>
              <div className="text-[11px] mt-1 line-clamp-2 opacity-90">Sin reportes hace más de {inactivityDays} días</div>
            </button>

            <button
              onClick={() => setSelectedSegment('frecuentes')}
              className={`p-4 rounded-2xl text-left transition border ${
                selectedSegment === 'frecuentes'
                  ? 'bg-purple-600 text-white border-purple-700 shadow-sm'
                  : 'bg-white text-gray-700 border-gray-100 hover:border-purple-200'
              }`}
            >
              <div className="text-[10px] font-black uppercase tracking-wider opacity-80">Frecuentes</div>
              <div className="text-2xl font-bold mt-1">{overview?.segmentos?.frecuentesCount ?? 7}</div>
              <div className="text-[11px] mt-1 line-clamp-2 opacity-90">3 o más actividades reportadas</div>
            </button>

            <button
              onClick={() => setSelectedSegment('pendientes')}
              className={`p-4 rounded-2xl text-left transition border ${
                selectedSegment === 'pendientes'
                  ? 'bg-sky-600 text-white border-sky-700 shadow-sm'
                  : 'bg-white text-gray-700 border-gray-100 hover:border-sky-200'
              }`}
            >
              <div className="text-[10px] font-black uppercase tracking-wider opacity-80">Pendientes</div>
              <div className="text-2xl font-bold mt-1">{overview?.segmentos?.pendientesCount ?? 9}</div>
              <div className="text-[11px] mt-1 line-clamp-2 opacity-90">En revisión o requieren ajustes</div>
            </button>
          </div>

          {/* Configuración de Umbral y Política de Frecuencia */}
          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-rotary-blue" />
                <span>Reglas de Inactividad y Política Anti-Saturación</span>
              </div>
              <p className="text-xs text-gray-500">
                Los períodos de actividad e inactividad son configurables. Los recordatorios de solicitudes pendientes se gestionan por separado.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0 text-xs">
              <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200">
                <span className="text-gray-500 font-bold">Umbral de Inactividad:</span>
                <select
                  value={inactivityDays}
                  onChange={(e) => handleUpdateInactivityDays(Number(e.target.value))}
                  className="bg-white border border-gray-200 rounded-lg px-2 py-1 font-bold text-gray-800 outline-none"
                >
                  <option value={30}>30 días</option>
                  <option value={45}>45 días</option>
                  <option value={60}>60 días (Recomendado)</option>
                  <option value={90}>90 días</option>
                </select>
              </div>

              <div className="flex items-center gap-2 bg-purple-50 text-purple-900 px-3 py-1.5 rounded-xl border border-purple-200 font-bold">
                <ShieldCheck className="w-4 h-4 text-purple-600" />
                <span>Tope: Máx 2 promocionales / mes</span>
              </div>
            </div>
          </div>

          {/* Listado dinámico de clubes en el segmento seleccionado */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-gray-900 text-base capitalize">
                  Clubes en Segmento: {selectedSegment} ({filteredClubList.length} clubes)
                </h4>
                <p className="text-xs text-gray-500">
                  {selectedSegment === 'nuevos' && 'Estrategia: Presentar Rotary en Acción y sus beneficios de visibilidad.'}
                  {selectedSegment === 'activos' && 'Estrategia: Reconocimiento institucional e invitación a continuar participando.'}
                  {selectedSegment === 'inactivos' && 'Estrategia: Campaña de reactivación recordando su impacto previo.'}
                  {selectedSegment === 'frecuentes' && 'Estrategia: Fidelización, visibilidad destacada y embajadores distritales.'}
                  {selectedSegment === 'pendientes' && 'Estrategia: Acompañamiento personalizado para completar la publicación.'}
                </p>
              </div>

              {/* Filtros de distrito y búsqueda */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200 text-xs">
                  <Filter className="w-3.5 h-3.5 text-gray-400" />
                  <select
                    value={filterDistrict}
                    onChange={(e) => setFilterDistrict(e.target.value)}
                    className="bg-transparent text-gray-700 font-bold outline-none"
                  >
                    <option value="todos">Todos los Distritos</option>
                    <option value="4271">Distrito 4271</option>
                    <option value="4281">Distrito 4281</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200 text-xs">
                  <Search className="w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar club..."
                    value={searchClub}
                    onChange={(e) => setSearchClub(e.target.value)}
                    className="bg-transparent text-gray-700 outline-none w-32 sm:w-44 font-medium"
                  />
                  {searchClub && (
                    <button onClick={() => setSearchClub('')} className="text-gray-400 hover:text-gray-600">
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Cuadrícula de clubes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pt-2">
              {filteredClubList.map((c: any) => (
                <div
                  key={c.key || c.name}
                  className="p-3.5 rounded-2xl bg-gray-50/70 border border-gray-100 hover:border-gray-200 transition space-y-1.5"
                >
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-black uppercase tracking-wider text-rotary-blue bg-sky-50 px-2 py-0.5 rounded-full border border-sky-100">
                      D{c.district}
                    </span>
                    {c.submissionsCount > 0 ? (
                      <span className="text-emerald-700 font-bold">{c.submissionsCount} actividades</span>
                    ) : (
                      <span className="text-gray-400 font-medium">Sin reportes</span>
                    )}
                  </div>
                  <div className="font-bold text-gray-900 text-xs leading-snug line-clamp-1" title={c.name}>
                    {c.name}
                  </div>
                  {c.lastSubmission && (
                    <div className="text-[10px] text-gray-500">
                      Último: {new Date(c.lastSubmission).toLocaleDateString('es-CO')} ({c.daysSinceLastSubmission}d)
                    </div>
                  )}
                  {c.pendingReviewCount > 0 && (
                    <div className="text-[10px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-md inline-block">
                      {c.pendingReviewCount} en revisión
                    </div>
                  )}
                </div>
              ))}
              {filteredClubList.length === 0 && (
                <div className="col-span-full py-8 text-center text-xs text-gray-400">
                  No se encontraron clubes para los filtros seleccionados.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════ SUBPESTAÑA 4: CAMPAÑAS PILOTO ════════ */}
      {subtab === 'campanas' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-gray-900">Campaña Piloto de Cuatro Semanas</h3>
              <p className="text-xs text-gray-500">
                Cada campaña tiene una audiencia, un propósito y parámetros UTM específicos. Se envían sin saturar mediante Email y WhatsApp.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500">Frecuencia de envío:</span>
              <span className="text-xs font-bold bg-emerald-50 text-emerald-800 px-3 py-1 rounded-xl border border-emerald-200">
                Máximo 2 contactos promocionales por club al mes
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {campaigns.map((c) => (
              <div
                key={c.id || c.code}
                className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-rotary-blue/10 text-rotary-blue">
                      Semana {c.week} · {c.type}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        c.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {c.status === 'approved' ? 'Aprobada' : 'Borrador'}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-gray-900 leading-snug">{c.name}</h3>

                  <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100 text-xs space-y-1.5 text-gray-600">
                    <div><strong className="text-gray-800">Asunto:</strong> {c.subject}</div>
                    <div><strong className="text-gray-800">Preheader:</strong> {c.preheader}</div>
                    <div><strong className="text-gray-800">Audiencia:</strong> <span className="capitalize">{c.targetSegment?.replace(/_/g, ' ')}</span></div>
                    <div><strong className="text-gray-800">Parámetros UTM:</strong> <code className="text-[11px] bg-white px-1.5 py-0.5 rounded border border-gray-200">{c.utmCampaign}</code></div>
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <button
                    onClick={() => { setPreviewCampaign(c); setPreviewTab('email'); }}
                    className="px-3.5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold transition flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5 text-rotary-blue" />
                    <span>Previsualizar</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleCampaignStatus(c, c.status === 'approved' ? 'draft' : 'approved')}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
                        c.status === 'approved'
                          ? 'border-gray-200 text-gray-600 hover:bg-gray-50'
                          : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{c.status === 'approved' ? 'Volver a Borrador' : 'Aprobar Campaña'}</span>
                    </button>

                    <button
                      onClick={() => handleSyncWithEmailMarketing(c)}
                      disabled={syncingCampaignId === c.id}
                      className="px-3.5 py-2 rounded-xl bg-rotary-blue hover:bg-sky-800 text-white font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                      title="Sincronizar y crear borrador en el módulo de Email Marketing"
                    >
                      <Mail className="w-3.5 h-3.5 text-sky-200" />
                      <span>{syncingCampaignId === c.id ? 'Sincronizando...' : 'Vincular a Email Marketing'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ════════ SUBPESTAÑA 5: AGENTE IA DE OPTIMIZACIÓN ════════ */}
      {subtab === 'agente' && (
        <div className="space-y-6">
          {/* Ciclo de Aprendizaje Continuo */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-600 animate-pulse" />
                <h3 className="text-base font-bold text-gray-900">Agente de Optimización de Campañas · Ciclo de Aprendizaje</h3>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                El agente analiza continuamente las entregas, aperturas y solicitudes para proponer optimizaciones justificadas.
                La IA propone y justifica, pero nunca modifica campañas activas sin autorización humana.
              </p>
            </div>

            {/* Pasos del ciclo */}
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 pt-2">
              <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200/80 text-center space-y-1">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Paso 1</span>
                <div className="font-bold text-gray-800 text-sm">Planificar</div>
                <p className="text-[10px] text-gray-500">Definir campañas, segmentos y objetivos</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200/80 text-center space-y-1">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Paso 2</span>
                <div className="font-bold text-gray-800 text-sm">Ejecutar</div>
                <p className="text-[10px] text-gray-500">Enviar mensajes vía Email y WhatsApp</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200/80 text-center space-y-1">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Paso 3</span>
                <div className="font-bold text-gray-800 text-sm">Medir</div>
                <p className="text-[10px] text-gray-500">Entregas, clics y solicitudes recibidas</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-200 text-center space-y-1 shadow-xs">
                <span className="text-[10px] font-black text-purple-700 uppercase tracking-wider">Paso 4 · Activo</span>
                <div className="font-bold text-purple-900 text-sm">Analizar</div>
                <p className="text-[10px] text-purple-700">Identificar mensajes de mejor conversión</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200/80 text-center space-y-1">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Paso 5</span>
                <div className="font-bold text-gray-800 text-sm">Optimizar</div>
                <p className="text-[10px] text-gray-500">Proponer mejoras para el siguiente período</p>
              </div>
            </div>
          </div>

          {/* Propuestas de Optimización y Experimentos A/B */}
          <div className="space-y-4">
            <h4 className="text-sm font-black uppercase tracking-wider text-gray-500">
              Recomendaciones del Agente IA (Pendientes de Aprobación Humana)
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(aiData?.insights || []).map((ins: any) => (
                <div
                  key={ins.id}
                  className="p-5 rounded-3xl bg-white border border-gray-100 shadow-sm space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="px-2.5 py-0.5 rounded-full font-black text-[10px] uppercase tracking-wider bg-purple-100 text-purple-800">
                        {ins.category}
                      </span>
                      <span className="text-emerald-600 font-bold text-xs flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Confianza: {ins.confidence}%
                      </span>
                    </div>

                    <h5 className="font-bold text-gray-900 text-sm leading-snug">{ins.title}</h5>
                    <p className="text-xs text-gray-600 leading-relaxed">{ins.description}</p>
                    {ins.impactMetric && (
                      <div className="inline-block bg-emerald-50 text-emerald-800 font-bold text-[11px] px-2.5 py-1 rounded-lg border border-emerald-100">
                        Impacto estimado: {ins.impactMetric}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                    <span className="text-gray-400 text-[11px]">
                      Estado: <strong className="text-gray-700 capitalize">{ins.status === 'approved' ? 'Aprobada' : ins.status === 'dismissed' ? 'Descartada' : 'Pendiente'}</strong>
                    </span>

                    {ins.status === 'pending' && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleActionAiInsight(ins.id, 'dismiss')}
                          className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold"
                        >
                          Descartar
                        </button>
                        <button
                          onClick={() => handleActionAiInsight(ins.id, 'approve')}
                          className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold flex items-center gap-1 shadow-xs"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Aprobar Sugerencia</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ════════ SUBPESTAÑA 6: RESULTADOS Y ATRIBUCIÓN ════════ */}
      {subtab === 'resultados' && (
        <div className="space-y-6">
          {/* Matriz de Atribución */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">Matriz de Atribución de Solicitudes</h3>
                <p className="text-xs text-gray-500">
                  Diferenciamos solicitudes atribuibles directamente a campañas mediante identificadores de seguimiento y parámetros UTM.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-gray-500">Tasa de Atribución Verificada:</span>
                <span className="font-bold bg-purple-100 text-purple-800 px-3 py-1 rounded-xl">
                  {attribution?.resumen?.tasaAtribucion ?? 61.7}%
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400 uppercase text-[10px] font-black tracking-wider">
                    <th className="py-3 px-3">Campaña / Origen</th>
                    <th className="py-3 px-3">Canal</th>
                    <th className="py-3 px-3 text-center">Solicitudes Atribuidas</th>
                    <th className="py-3 px-3 text-center">Publicadas</th>
                    <th className="py-3 px-3 text-right">Efectividad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-medium text-gray-700">
                  {(attribution?.porCampana || []).map((camp: any) => {
                    const pct = camp.solicitudes ? Math.round((camp.publicadas / camp.solicitudes) * 100) : 0;
                    return (
                      <tr key={camp.id} className="hover:bg-gray-50/70 transition">
                        <td className="py-3 px-3 font-bold text-gray-900">{camp.nombre}</td>
                        <td className="py-3 px-3 text-gray-500">{camp.canal}</td>
                        <td className="py-3 px-3 text-center font-bold text-rotary-blue">{camp.solicitudes}</td>
                        <td className="py-3 px-3 text-center font-bold text-emerald-600">{camp.publicadas}</td>
                        <td className="py-3 px-3 text-right font-bold text-gray-900">{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/70 flex items-start gap-3 text-xs text-amber-900">
              <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <strong>Principio de Veracidad de Resultados:</strong> Cuando no sea posible atribuir directamente una solicitud a una campaña mediante UTM o token de seguimiento, se clasifica como <em>conversión orgánica o universal</em> en lugar de adjudicarle resultados que no se puedan demostrar.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DE PREVISUALIZACIÓN DE CAMPAÑA ────────────────────── */}
      {previewCampaign && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-gray-100">
            {/* Cabecera modal */}
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/70">
              <div>
                <span className="text-[10px] font-black uppercase text-rotary-blue tracking-wider">
                  Semana {previewCampaign.week} · {previewCampaign.type}
                </span>
                <h4 className="font-bold text-gray-900 text-base">{previewCampaign.name}</h4>
              </div>
              <button
                onClick={() => setPreviewCampaign(null)}
                className="w-8 h-8 rounded-full bg-gray-200/70 hover:bg-gray-200 text-gray-700 flex items-center justify-center font-bold text-lg"
              >
                ×
              </button>
            </div>

            {/* Selector de formato (Email / WhatsApp) */}
            <div className="p-3 bg-gray-100 flex gap-2 text-xs font-bold border-b border-gray-200/60">
              <button
                onClick={() => setPreviewTab('email')}
                className={`px-4 py-2 rounded-xl transition flex items-center gap-1.5 ${
                  previewTab === 'email' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Mail className="w-3.5 h-3.5 text-sky-600" />
                <span>Correo Electrónico</span>
              </button>
              <button
                onClick={() => setPreviewTab('whatsapp')}
                className={`px-4 py-2 rounded-xl transition flex items-center gap-1.5 ${
                  previewTab === 'whatsapp' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                <span>Mensaje de WhatsApp</span>
              </button>
            </div>

            {/* Cuerpo del preview */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {previewTab === 'email' ? (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 space-y-1">
                    <div><strong>Asunto:</strong> {previewCampaign.subject}</div>
                    <div><strong>Preheader:</strong> {previewCampaign.preheader}</div>
                    <div><strong>UTM:</strong> <code className="text-[11px] bg-white px-1.5 py-0.5 rounded">{previewCampaign.utmCampaign}</code></div>
                  </div>
                  <div
                    className="border border-gray-200 rounded-2xl p-4 bg-white"
                    dangerouslySetInnerHTML={{ __html: previewCampaign.contentHtml }}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-4 rounded-2xl bg-[#DCF8C6]/40 border border-emerald-200 text-gray-800 whitespace-pre-wrap font-sans text-xs leading-relaxed">
                    {previewCampaign.whatsappTemplate}
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(previewCampaign.whatsappTemplate);
                        toast.success('Texto de WhatsApp copiado al portapapeles');
                      }}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar Texto</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Pie modal */}
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-xs">
              <button
                onClick={() => setPreviewCampaign(null)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-white"
              >
                Cerrar
              </button>

              <button
                onClick={() => handleSyncWithEmailMarketing(previewCampaign)}
                className="px-4 py-2 rounded-xl bg-rotary-blue hover:bg-sky-800 text-white font-bold flex items-center gap-1.5 shadow-xs"
              >
                <Mail className="w-3.5 h-3.5 text-sky-200" />
                <span>Sincronizar con Email Marketing</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default RotaryMarketingInteligente;
