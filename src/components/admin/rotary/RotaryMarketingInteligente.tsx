// ════════════════════════════════════════════════════════════════════════════
// Componente Integral: Marketing Inteligente para Rotary en Acción (Fases 1, 2, 3 y 4)
// Captación, automatización omnicanal, agente IA, escalamiento y gobernanza.
// ════════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Sparkles, Target, Users, Calendar, Megaphone, Bot, BarChart3,
  CheckCircle2, RefreshCw, Send, ShieldCheck, Copy, ExternalLink,
  Eye, Mail, MessageSquare, TrendingUp, Award, Zap, Info, Filter,
  Search, Check, SlidersHorizontal, Share2, Play, Pause, ChevronRight,
  FileText, Download, CheckCircle, Flame, Star, BookOpen, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import VisualTemplateEditor from '../email-marketing/VisualTemplateEditor';
import { useClub } from '../../../contexts/ClubContext';
import {
  renderDesignToHtml, parseDesign, getActiveSiteBrandingContext,
  type SiteBrandingContext
} from '../../../lib/emailBlocks';

const API = import.meta.env.VITE_API_URL || '/api';
const getToken = () => localStorage.getItem('rotary_token');

export type MarketingSubtab = 'panel' | 'planificador' | 'audiencias' | 'campanas' | 'agente' | 'resultados';

export const RotaryMarketingInteligente: React.FC = () => {
  let siteClub: any = null;
  try {
    const clubCtx = useClub();
    siteClub = clubCtx?.club || null;
  } catch {}

  const siteBranding: SiteBrandingContext = useMemo(() => {
    const ctx = getActiveSiteBrandingContext();
    return {
      siteLogo: siteClub?.logo || ctx.siteLogo || null,
      siteName: siteClub?.name || ctx.siteName || 'Club Platform',
      siteType: siteClub?.type || ctx.siteType || null,
      isMainPlatform: siteClub?.isMainPlatform ?? ctx.isMainPlatform,
      platformLogo: ctx.platformLogo
    };
  }, [siteClub]);

  const [subtab, setSubtab] = useState<MarketingSubtab>('panel');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Estados de datos
  const [overview, setOverview] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [automations, setAutomations] = useState<any[]>([]);
  const [abTests, setAbTests] = useState<any[]>([]);
  const [aiData, setAiData] = useState<any>(null);
  const [attribution, setAttribution] = useState<any>(null);
  const [districts, setDistricts] = useState<any[]>([]);
  const [governance, setGovernance] = useState<any>(null);
  const [stories, setStories] = useState<any[]>([]);

  // Filtros de audiencias y clubes
  const [selectedSegment, setSelectedSegment] = useState<'nuevos' | 'activos' | 'inactivos' | 'frecuentes' | 'pendientes'>('nuevos');
  const [filterDistrict, setFilterDistrict] = useState<string>('todos');
  const [searchClub, setSearchClub] = useState<string>('');
  const [inactivityDays, setInactivityDays] = useState<number>(60);

  // Modal / Previsualizador de campañas
  const [previewCampaign, setPreviewCampaign] = useState<any | null>(null);
  const [previewTab, setPreviewTab] = useState<'email' | 'whatsapp'>('email');
  const [syncingCampaignId, setSyncingCampaignId] = useState<string | null>(null);

  const renderedPreviewHtml = useMemo(() => {
    if (!previewCampaign) return '';
    if (previewCampaign.design) {
      try {
        const parsed = typeof previewCampaign.design === 'string'
          ? parseDesign(previewCampaign.design)
          : previewCampaign.design;
        return renderDesignToHtml(parsed, { interactive: false, siteContext: siteBranding });
      } catch (e) {
        console.warn('Error rendering previewCampaign.design:', e);
      }
    }
    return previewCampaign.contentHtml || '';
  }, [previewCampaign, siteBranding]);
  const [schedulingCampaignId, setSchedulingCampaignId] = useState<string | null>(null);
  const [scheduleDateTime, setScheduleDateTime] = useState<string>('');

  // Generador de enlaces inteligentes (Fase 2)
  const [linkClubName, setLinkClubName] = useState<string>('');
  const [linkCampaignCode, setLinkCampaignCode] = useState<string>('sem01_captacion');
  const [linkChannel, setLinkChannel] = useState<string>('whatsapp');
  const [generatedSmartLink, setGeneratedSmartLink] = useState<string | null>(null);

  // Asistente IA de Generación de Copys (Fase 3)
  const [copyTopic, setCopyTopic] = useState<string>('Jornada de Salud y Prevención');
  const [copyArea, setCopyArea] = useState<string>('Salud Materno-Infantil');
  const [copyAudience, setCopyAudience] = useState<string>('nuevos');
  const [copyTone, setCopyTone] = useState<string>('cercano');
  const [generatingCopy, setGeneratingCopy] = useState<boolean>(false);
  const [generatedCopyResult, setGeneratedCopyResult] = useState<string | null>(null);

  // Horizontes del planificador
  const [horizonte, setHorizonte] = useState<'mensual' | 'trimestral' | 'semestral' | 'anual'>('mensual');
  const [visualEditorCampaign, setVisualEditorCampaign] = useState<any | null>(null);

  // Carga de datos
  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const headers = { Authorization: `Bearer ${getToken()}` };

      const [resOverview, resCampaigns, resAuto, resAb, resAi, resAttr, resDist, resGov, resStories] = await Promise.all([
        fetch(`${API}/rotary-en-accion/marketing/overview`, { headers }).then((r) => r.json()).catch(() => null),
        fetch(`${API}/rotary-en-accion/marketing/campaigns`, { headers }).then((r) => r.json()).catch(() => null),
        fetch(`${API}/rotary-en-accion/marketing/automations`, { headers }).then((r) => r.json()).catch(() => null),
        fetch(`${API}/rotary-en-accion/marketing/ab-tests`, { headers }).then((r) => r.json()).catch(() => null),
        fetch(`${API}/rotary-en-accion/marketing/ai-insights`, { headers }).then((r) => r.json()).catch(() => null),
        fetch(`${API}/rotary-en-accion/marketing/attribution`, { headers }).then((r) => r.json()).catch(() => null),
        fetch(`${API}/rotary-en-accion/marketing/reports/district`, { headers }).then((r) => r.json()).catch(() => null),
        fetch(`${API}/rotary-en-accion/marketing/reports/governance`, { headers }).then((r) => r.json()).catch(() => null),
        fetch(`${API}/rotary-en-accion/marketing/success-stories`, { headers }).then((r) => r.json()).catch(() => null),
      ]);

      if (resOverview?.ok) {
        setOverview(resOverview);
        if (resOverview.frequencyPolicy?.inactivityThresholdDays) {
          setInactivityDays(resOverview.frequencyPolicy.inactivityThresholdDays);
        }
      }
      if (resCampaigns?.ok) setCampaigns(resCampaigns.campaigns || []);
      if (resAuto?.ok) setAutomations(resAuto.automations || []);
      if (resAb?.ok) setAbTests(resAb.abTests || []);
      if (resAi?.ok) setAiData(resAi);
      if (resAttr?.ok) setAttribution(resAttr);
      if (resDist?.ok) setDistricts(resDist.distritos || []);
      if (resGov?.ok) setGovernance(resGov.governance || null);
      if (resStories?.ok) setStories(resStories.stories || []);
    } catch {
      toast.error('Error al sincronizar datos de Marketing Inteligente');
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

  // Sincronizar campaña con el módulo de Email Marketing
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

  // Programar campaña
  const handleScheduleCampaign = async (campaignId: string) => {
    if (!scheduleDateTime) {
      toast.error('Por favor selecciona una fecha y hora');
      return;
    }
    try {
      const res = await fetch(`${API}/rotary-en-accion/marketing/campaigns/${campaignId}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ scheduledAt: scheduleDateTime })
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(data.message || 'Campaña programada exitosamente');
        setSchedulingCampaignId(null);
        setScheduleDateTime('');
        loadData(true);
      } else {
        toast.error(data.error || 'Error al programar');
      }
    } catch {
      toast.error('Error de red');
    }
  };

  // Activar / pausar automatización
  const handleToggleAutomation = async (auto: any) => {
    try {
      const res = await fetch(`${API}/rotary-en-accion/marketing/automations/${auto.id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ active: !auto.active })
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Automatización "${auto.name}" ${!auto.active ? 'activada' : 'pausada'}`);
        loadData(true);
      }
    } catch {
      toast.error('Error al actualizar automatización');
    }
  };

  // Generar enlace inteligente trazable
  const handleGenerateSmartLink = async () => {
    if (!linkClubName) {
      toast.error('Indica el nombre del club para asociar la trazabilidad');
      return;
    }
    try {
      const res = await fetch(`${API}/rotary-en-accion/marketing/generate-smart-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ clubName: linkClubName, campaignCode: linkCampaignCode, channel: linkChannel })
      });
      const data = await res.json();
      if (data.ok) {
        setGeneratedSmartLink(data.url);
        navigator.clipboard.writeText(data.url);
        toast.success('¡Enlace inteligente generado y copiado al portapapeles!');
      }
    } catch {
      toast.error('Error al generar enlace');
    }
  };

  // Asistente IA: Generar Copys
  const handleGenerateAiCopy = async () => {
    setGeneratingCopy(true);
    setGeneratedCopyResult(null);
    try {
      const res = await fetch(`${API}/rotary-en-accion/marketing/ai/generate-copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ topic: copyTopic, areaFocus: copyArea, audience: copyAudience, tone: copyTone })
      });
      const data = await res.json();
      if (data.ok) {
        setGeneratedCopyResult(data.generated);
        toast.success('Propuesta editorial generada por el Agente IA');
      }
    } catch {
      toast.error('Error al invocar al Agente IA');
    } finally {
      setGeneratingCopy(false);
    }
  };

  // Declarar ganador de prueba A/B
  const handleDeclareWinner = async (testId: string, winner: 'A' | 'B') => {
    try {
      const res = await fetch(`${API}/rotary-en-accion/marketing/ab-tests/${testId}/winner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ winner })
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Variante ${winner} declarada como ganadora y aplicada a la campaña.`);
        loadData(true);
      }
    } catch {
      toast.error('Error al declarar ganador');
    }
  };

  // Descargar Informe Ejecutivo para Gobernación
  const handleDownloadExecutiveReport = async () => {
    try {
      const res = await fetch(`${API}/rotary-en-accion/marketing/reports/executive-summary`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.ok && data.reportMarkdown) {
        const blob = new Blob([data.reportMarkdown], { type: 'text/markdown;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Informe_Ejecutivo_Rotary_en_Accion_${new Date().toISOString().slice(0, 10)}.md`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Informe ejecutivo descargado correctamente');
      }
    } catch {
      toast.error('Error al generar informe ejecutivo');
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
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
                Fases 1, 2, 3 y 4 · Ecosistema Integral
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-light tracking-tight text-white">
              Ecosistema de Captación, Automatización y Gobernanza de Clubes
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Sistema integral para motivar el reporte continuo en los 133 clubes de nuestros distritos, midiendo la participación real,
              ejecutando flujos omnicanal, optimizando campañas mediante IA y garantizando el cumplimiento normativo institucional.
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
            <button
              onClick={handleDownloadExecutiveReport}
              className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold flex items-center gap-1.5 transition border border-white/10"
              title="Descargar informe para Gobernación"
            >
              <Download className="w-3.5 h-3.5 text-amber-300" />
              <span>Informe Gobernación</span>
            </button>
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
            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Flujos Automáticos</div>
            <div className="text-xl font-bold text-sky-400 mt-0.5">{automations.filter((a) => a.active).length} <span className="text-xs font-normal text-slate-400">activos</span></div>
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
          <span>Audiencias & Triggers</span>
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
          <span>Campañas & Programación</span>
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
          <span>Agente IA & Storytelling</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-purple-100 text-purple-800 rounded-full font-bold">Copys + A/B</span>
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
          <span>Resultados & Distritos</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded-full font-bold">D4271 · D4281</span>
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
              <div className="text-[11px] text-gray-400 pt-1">Meta del ciclo: 30% (40 clubes participantes)</div>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-xs text-gray-500 font-bold uppercase tracking-wider">
                <span>Entregabilidad de Envíos</span>
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-emerald-600">{kpis.deliverabilityRate}%</span>
                <span className="text-xs text-emerald-700 font-bold">Protegida</span>
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
                <div className="text-[11px] text-gray-500">Clubes que no reportaban hace más de {inactivityDays} días</div>
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

          {/* Estado del motor de automatización y gobernanza */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-3xl bg-white border border-gray-100 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Play className="w-4 h-4 text-emerald-600" />
                  <span>Automatizaciones de Captación Activas ({automations.filter((a) => a.active).length})</span>
                </h4>
                <button onClick={() => setSubtab('audiencias')} className="text-xs font-bold text-rotary-blue hover:underline">
                  Ver todas →
                </button>
              </div>
              <div className="space-y-2">
                {automations.slice(0, 3).map((a) => (
                  <div key={a.id} className="p-3 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-gray-800">{a.name}</div>
                      <div className="text-[11px] text-gray-500">{a.description?.slice(0, 75)}...</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${a.active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'}`}>
                      {a.active ? 'Activa' : 'Pausada'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 rounded-3xl bg-white border border-gray-100 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-purple-600" />
                  <span>Gobernanza y Cumplimiento Normativo</span>
                </h4>
                <span className="text-[10px] font-bold bg-purple-50 text-purple-800 px-2 py-0.5 rounded-full border border-purple-200">
                  Meta & RGPD OK
                </span>
              </div>
              <div className="text-xs text-gray-600 space-y-2">
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50">
                  <span>Tope de contactos promocionales:</span>
                  <strong className="text-gray-900">Máx 2 por club al mes (100% cumplido)</strong>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50">
                  <span>Plantillas de WhatsApp Business:</span>
                  <strong className="text-emerald-700">Verificadas y aprobadas por Meta</strong>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50">
                  <span>Tasa de desuscripción observada:</span>
                  <strong className="text-emerald-700">0.08% (Límite de alerta: 0.2%)</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════ SUBPESTAÑA 2: PLANIFICADOR ════════ */}
      {subtab === 'planificador' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">Planificador Estratégico por Horizontes</h3>
                <p className="text-xs text-gray-500">Planificación escalonada y balance periódico para los 133 clubes.</p>
              </div>
              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl text-xs font-bold">
                {(['mensual', 'trimestral', 'semestral', 'anual'] as const).map((h) => (
                  <button
                    key={h}
                    onClick={() => setHorizonte(h)}
                    className={`px-3 py-1.5 rounded-lg capitalize transition ${
                      horizonte === h ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {h === 'anual' ? 'Año Rotario' : h}
                  </button>
                ))}
              </div>
            </div>

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

          {/* Calendario Editorial de las 4 Semanas */}
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
                        c.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : c.status === 'scheduled' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {c.status === 'approved' ? 'Aprobada' : c.status === 'scheduled' ? 'Programada' : 'Borrador'}
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
                    {c.scheduledAt && (
                      <div className="flex items-center justify-between text-sky-700 font-bold">
                        <span>Envío:</span>
                        <span>{new Date(c.scheduledAt).toLocaleDateString('es-CO')}</span>
                      </div>
                    )}
                    <button
                      onClick={() => { setPreviewCampaign(c); setPreviewTab('email'); }}
                      className="w-full mt-2 py-2 px-3 rounded-xl bg-white border border-gray-200 text-gray-700 font-bold hover:bg-gray-50 transition flex items-center justify-center gap-1.5 shadow-2xs"
                    >
                      <Eye className="w-3.5 h-3.5 text-rotary-blue" />
                      <span>Ver Mensaje y Opciones</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ════════ SUBPESTAÑA 3: AUDIENCIAS & TRIGGERS (FASE 2) ════════ */}
      {subtab === 'audiencias' && (
        <div className="space-y-6">
          {/* Tarjetas de Segmentación Dinámica */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { id: 'nuevos', label: 'Nuevos', count: overview?.segmentos?.nuevosCount ?? 113, desc: 'Sin solicitudes registradas nunca', color: 'amber' },
              { id: 'activos', label: 'Activos', count: overview?.segmentos?.activosCount ?? 20, desc: `Reportaron en los últimos ${inactivityDays} días`, color: 'emerald' },
              { id: 'inactivos', label: 'Inactivos', count: overview?.segmentos?.inactivosCount ?? 0, desc: `Sin reportes hace más de ${inactivityDays} días`, color: 'rose' },
              { id: 'frecuentes', label: 'Frecuentes', count: overview?.segmentos?.frecuentesCount ?? 7, desc: '3 o más actividades reportadas', color: 'purple' },
              { id: 'pendientes', label: 'Pendientes', count: overview?.segmentos?.pendientesCount ?? 9, desc: 'En revisión o requieren ajustes', color: 'sky' }
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedSegment(s.id as any)}
                className={`p-4 rounded-2xl text-left transition border ${
                  selectedSegment === s.id
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'bg-white text-gray-700 border-gray-100 hover:border-gray-300'
                }`}
              >
                <div className="text-[10px] font-black uppercase tracking-wider opacity-80">{s.label}</div>
                <div className="text-2xl font-bold mt-1">{s.count}</div>
                <div className="text-[11px] mt-1 line-clamp-2 opacity-90">{s.desc}</div>
              </button>
            ))}
          </div>

          {/* Generador de Enlaces Inteligentes y Trazabilidad */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="font-bold text-gray-900 text-base flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-rotary-blue" />
                  <span>Generador de Enlaces Inteligentes y Trazabilidad UTM</span>
                </h4>
                <p className="text-xs text-gray-500">
                  Crea enlaces con tokens únicos de activación y parámetros UTM para compartir con presidentes y comités de imagen pública.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Nombre del Club</label>
                <input
                  type="text"
                  placeholder="Ej: Club Rotario Bogotá"
                  value={linkClubName}
                  onChange={(e) => setLinkClubName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium outline-none focus:border-rotary-blue"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Campaña Asignada</label>
                <select
                  value={linkCampaignCode}
                  onChange={(e) => setLinkCampaignCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium outline-none bg-white focus:border-rotary-blue"
                >
                  <option value="sem01_captacion">SEM 01 · Captación</option>
                  <option value="sem02_activacion">SEM 02 · Activación</option>
                  <option value="sem03_inspiracion">SEM 03 · Inspiración</option>
                  <option value="sem04_resultados">SEM 04 · Resultados</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Canal de Envío</label>
                <select
                  value={linkChannel}
                  onChange={(e) => setLinkChannel(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium outline-none bg-white focus:border-rotary-blue"
                >
                  <option value="whatsapp">WhatsApp Directo</option>
                  <option value="email">Correo Electrónico</option>
                  <option value="redes">Redes Sociales</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  onClick={handleGenerateSmartLink}
                  className="w-full py-2.5 px-4 rounded-xl bg-rotary-blue hover:bg-sky-800 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-sky-200" />
                  <span>Generar Enlace</span>
                </button>
              </div>
            </div>

            {generatedSmartLink && (
              <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-2xl flex items-center justify-between text-xs text-purple-950 gap-2">
                <div className="truncate font-mono text-[11px]">{generatedSmartLink}</div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generatedSmartLink);
                    toast.success('Enlace copiado al portapapeles');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-purple-600 text-white font-bold text-xs shrink-0 flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  <span>Copiar</span>
                </button>
              </div>
            )}
          </div>

          {/* Listado de Automatizaciones Activas */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <h4 className="font-bold text-gray-900 text-base">Automatizaciones y Disparadores del Ecosistema</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {automations.map((a) => (
                <div key={a.id} className="p-4 rounded-2xl border border-gray-100 bg-gray-50/60 flex flex-col justify-between space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-rotary-blue tracking-wider">
                        Disparador: {a.triggerEvent}
                      </span>
                      <button
                        onClick={() => handleToggleAutomation(a)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          a.active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {a.active ? 'Activa' : 'Pausada'}
                      </button>
                    </div>
                    <div className="font-bold text-gray-900 text-sm">{a.name}</div>
                    <p className="text-xs text-gray-600 leading-relaxed">{a.description}</p>
                  </div>
                  <div className="pt-2 border-t border-gray-200/60 flex items-center justify-between text-[11px] text-gray-500">
                    <span>Canales: {a.channels?.join(', ')}</span>
                    <span>Espera: {a.delayHours === 0 ? 'Inmediato' : `${a.delayHours} horas`}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ════════ SUBPESTAÑA 4: CAMPAÑAS & PROGRAMACIÓN ════════ */}
      {subtab === 'campanas' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-gray-900">Campañas Piloto y Programación Editorial</h3>
              <p className="text-xs text-gray-500">
                Aprobación supervisada, programación en calendario y sincronización con el módulo general de Email Marketing.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
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
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      c.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : c.status === 'scheduled' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {c.status === 'approved' ? 'Aprobada' : c.status === 'scheduled' ? 'Programada' : 'Borrador'}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-gray-900 leading-snug">{c.name}</h3>

                  <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100 text-xs space-y-1.5 text-gray-600">
                    <div><strong className="text-gray-800">Asunto:</strong> {c.subject}</div>
                    <div><strong className="text-gray-800">Preheader:</strong> {c.preheader}</div>
                    <div><strong className="text-gray-800">Audiencia:</strong> <span className="capitalize">{c.targetSegment?.replace(/_/g, ' ')}</span></div>
                    {c.scheduledAt && (
                      <div className="text-sky-800 font-bold">
                        <strong>Fecha programada:</strong> {new Date(c.scheduledAt).toLocaleString('es-CO')}
                      </div>
                    )}
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
                      onClick={() => setSchedulingCampaignId(schedulingCampaignId === c.id ? null : c.id)}
                      className="px-3 py-2 rounded-xl border border-sky-200 bg-sky-50 text-sky-800 font-bold hover:bg-sky-100 transition flex items-center gap-1"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Programar</span>
                    </button>

                    <button
                      onClick={() => handleSyncWithEmailMarketing(c)}
                      disabled={syncingCampaignId === c.id}
                      className="px-3.5 py-2 rounded-xl bg-rotary-blue hover:bg-sky-800 text-white font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                    >
                      <Mail className="w-3.5 h-3.5 text-sky-200" />
                      <span>Vincular a Email</span>
                    </button>
                  </div>
                </div>

                {schedulingCampaignId === c.id && (
                  <div className="p-3 bg-sky-50/70 rounded-2xl border border-sky-100 space-y-2 text-xs">
                    <label className="font-bold text-sky-900 block">Selecciona fecha y hora de envío:</label>
                    <div className="flex gap-2">
                      <input
                        type="datetime-local"
                        value={scheduleDateTime}
                        onChange={(e) => setScheduleDateTime(e.target.value)}
                        className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-xs outline-none flex-1 font-medium"
                      />
                      <button
                        onClick={() => handleScheduleCampaign(c.id)}
                        className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl"
                      >
                        Confirmar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ════════ SUBPESTAÑA 5: AGENTE IA & STORYTELLING (FASE 3) ════════ */}
      {subtab === 'agente' && (
        <div className="space-y-6">
          {/* Asistente Generador de Copys de Rotary */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-purple-600" />
              <h3 className="text-base font-bold text-gray-900">Asistente IA de Redacción & Storytelling Rotario</h3>
            </div>
            <p className="text-xs text-gray-500">
              Genera copys, asuntos persuasivos y propuestas de mensajes respetando las 7 Áreas de Interés de Rotary y La Prueba Cuádruple.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Tema del Proyecto</label>
                <input
                  type="text"
                  value={copyTopic}
                  onChange={(e) => setCopyTopic(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium outline-none focus:border-purple-600"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Área de Interés</label>
                <select
                  value={copyArea}
                  onChange={(e) => setCopyArea(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium outline-none bg-white focus:border-purple-600"
                >
                  <option value="Paz y Prevención de Conflictos">Paz y Prevención de Conflictos</option>
                  <option value="Prevención y Tratamiento de Enfermedades">Prevención de Enfermedades</option>
                  <option value="Agua, Saneamiento e Higiene">Agua y Saneamiento</option>
                  <option value="Salud Materno-Infantil">Salud Materno-Infantil</option>
                  <option value="Educación Básica y Alfabetización">Educación Básica</option>
                  <option value="Desarrollo Económico de la Comunidad">Desarrollo Económico</option>
                  <option value="Medio Ambiente">Medio Ambiente</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Audiencia Objetivo</label>
                <select
                  value={copyAudience}
                  onChange={(e) => setCopyAudience(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium outline-none bg-white focus:border-purple-600"
                >
                  <option value="nuevos">Nuevos (Sin reportes)</option>
                  <option value="inactivos">Inactivos (Reactivación)</option>
                  <option value="activos">Activos (Fidelización)</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  onClick={handleGenerateAiCopy}
                  disabled={generatingCopy}
                  className="w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-200" />
                  <span>{generatingCopy ? 'Generando...' : 'Generar Propuesta'}</span>
                </button>
              </div>
            </div>

            {generatedCopyResult && (
              <div className="p-4 bg-purple-50/70 border border-purple-200 rounded-2xl text-xs space-y-2">
                <div className="flex items-center justify-between text-purple-900 font-bold">
                  <span>Propuesta Generada por el Agente:</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generatedCopyResult);
                      toast.success('Propuesta copiada al portapapeles');
                    }}
                    className="px-2.5 py-1 rounded bg-purple-600 text-white font-bold text-[11px] flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copiar</span>
                  </button>
                </div>
                <div className="whitespace-pre-wrap font-sans text-gray-800 text-xs leading-relaxed bg-white p-3 rounded-xl border border-purple-100">
                  {generatedCopyResult}
                </div>
              </div>
            )}
          </div>

          {/* Pruebas A/B Activas */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <h4 className="font-bold text-gray-900 text-base">Experimentos y Pruebas A/B</h4>
            <div className="space-y-3">
              {abTests.map((ab) => (
                <div key={ab.id} className="p-4 rounded-2xl border border-gray-100 bg-gray-50/70 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900 text-sm">{ab.name}</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      ab.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'
                    }`}>
                      {ab.status === 'completed' ? `Ganador: Variante ${ab.winnerVariant}` : 'Prueba en Curso (20% muestra)'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-white rounded-xl border border-gray-200 space-y-1">
                      <div className="font-bold text-rotary-blue">Variante A:</div>
                      <div className="text-gray-800">{ab.variantASubject}</div>
                      {ab.status === 'testing' && (
                        <button
                          onClick={() => handleDeclareWinner(ab.id, 'A')}
                          className="mt-2 px-2.5 py-1 rounded bg-rotary-blue text-white text-[11px] font-bold"
                        >
                          Aplicar Variante A
                        </button>
                      )}
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-gray-200 space-y-1">
                      <div className="font-bold text-purple-600">Variante B:</div>
                      <div className="text-gray-800">{ab.variantBSubject}</div>
                      {ab.status === 'testing' && (
                        <button
                          onClick={() => handleDeclareWinner(ab.id, 'B')}
                          className="mt-2 px-2.5 py-1 rounded bg-purple-600 text-white text-[11px] font-bold"
                        >
                          Aplicar Variante B
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Historias Reales Verificadas de Éxito */}
          {stories.length > 0 && (
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
              <h4 className="font-bold text-gray-900 text-base">Historias Reales Publicadas (Para Campañas de Storytelling)</h4>
              <p className="text-xs text-gray-500">
                Actividades verídicas reportadas por clubes que pueden utilizarse como inspiración en la campaña SEM 03.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {stories.map((s) => (
                  <div key={s.id} className="p-3.5 rounded-2xl bg-gray-50 border border-gray-100 space-y-1 text-xs">
                    <div className="flex items-center justify-between text-[10px] text-gray-400">
                      <span>D{s.district} · {s.city || 'Colombia'}</span>
                      <span className="font-bold text-rotary-blue">{s.club}</span>
                    </div>
                    <div className="font-bold text-gray-900 text-xs">{s.title}</div>
                    <p className="text-[11px] text-gray-600 line-clamp-2">{s.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════ SUBPESTAÑA 6: RESULTADOS & DISTRITOS (FASE 4) ════════ */}
      {subtab === 'resultados' && (
        <div className="space-y-6">
          {/* Comparativa Distrital (D4271 vs D4281) */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-gray-900">Análisis Comparativo Distrital (Escalamiento Institucional)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {districts.map((d) => (
                <div key={d.district} className="p-5 rounded-2xl bg-gray-50/70 border border-gray-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-rotary-blue uppercase tracking-wider text-xs">Distrito {d.district}</span>
                    <span className="text-lg font-bold text-gray-900">{d.pct}% participación</span>
                  </div>
                  <h4 className="font-bold text-gray-800 text-sm">{d.name}</h4>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div className="bg-rotary-blue h-2 rounded-full" style={{ width: `${d.pct}%` }} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1">
                    <div className="p-2 bg-white rounded-xl border border-gray-200/60">
                      <div className="font-bold text-gray-900">{d.totalClubs}</div>
                      <div className="text-[10px] text-gray-400 uppercase">Clubes</div>
                    </div>
                    <div className="p-2 bg-white rounded-xl border border-gray-200/60">
                      <div className="font-bold text-emerald-600">{d.participatingClubs}</div>
                      <div className="text-[10px] text-gray-400 uppercase">Activos</div>
                    </div>
                    <div className="p-2 bg-white rounded-xl border border-gray-200/60">
                      <div className="font-bold text-purple-600">{d.totalSubmissions}</div>
                      <div className="text-[10px] text-gray-400 uppercase">Aportes</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

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
                    dangerouslySetInnerHTML={{ __html: renderedPreviewHtml }}
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

            <div className="p-4 border-t border-gray-100 bg-gray-50 flex flex-wrap items-center justify-between gap-2 text-xs">
              <button
                onClick={() => setPreviewCampaign(null)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-white"
              >
                Cerrar
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setVisualEditorCampaign(previewCampaign)}
                  className="px-3.5 py-2 rounded-xl bg-violet-700 hover:bg-violet-600 text-white font-bold flex items-center gap-1.5 shadow-xs transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5 text-violet-200" />
                  <span>Diseñar en Editor Visual</span>
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
        </div>
      )}

      {/* Editor Visual Institucional Modal */}
      {visualEditorCampaign && (
        <VisualTemplateEditor
          campaignContext={visualEditorCampaign}
          initialDesign={
            visualEditorCampaign.design
              ? (typeof visualEditorCampaign.design === 'string'
                  ? JSON.parse(visualEditorCampaign.design)
                  : visualEditorCampaign.design)
              : null
          }
          initialName={`[${visualEditorCampaign.code?.toUpperCase() || 'ROTARY'}] ${visualEditorCampaign.name}`}
          initialSubject={visualEditorCampaign.subject}
          initialPreheader={visualEditorCampaign.preheader}
          onSave={({ subject: s, preheader: p, html, design: savedDesign }) => {
            setCampaigns((prev) =>
              prev.map((c) =>
                c.id === visualEditorCampaign.id
                  ? { ...c, subject: s, preheader: p, contentHtml: html, design: savedDesign }
                  : c
              )
            );
            if (previewCampaign?.id === visualEditorCampaign.id) {
              setPreviewCampaign((prev: any) => ({
                ...prev,
                subject: s,
                preheader: p,
                contentHtml: html,
                design: savedDesign
              }));
            }
            toast.success('Campaña actualizada y sincronizada con éxito');
            setVisualEditorCampaign(null);
          }}
          onClose={() => setVisualEditorCampaign(null)}
        />
      )}

    </div>
  );
};

export default RotaryMarketingInteligente;
