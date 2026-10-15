// ════════════════════════════════════════════════════════════════════════════
// Módulo Administrativo Unificado: Rotary en Acción — v4.1180
//
// Consolidación integral de «Solicitudes de Contenido» y «Rotary en Acción»:
// 1. Resumen: Indicadores generales, actividad temporal y participación de clubes.
// 2. Solicitudes: Recepción, consulta, filtros, estados y administración completa.
// 3. Centro de Control: Acceso al Kanban transversal para revisión, aprobación, producción y distribución.
// 4. Taxonomías: Clasificación (tipos de actividad, áreas de interés, programas, temas).
// 5. Configuración: Reglas de fotografía, deduplicación, automatizaciones y formulario público.
// 6. Impacto: Estadísticas reportadas, comparativas distritales y mapa por ciudad.
//
// Única fuente de verdad: ContributionSubmission y endpoints certificados.
// ════════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import { useAuth } from '../../hooks/useAuth';
import { useSiteAccess } from '../../hooks/useSiteAccess';
import { useClub } from '../../contexts/ClubContext';
import {
  HeartHandshake, Inbox, Zap, BarChart3, Sliders, Settings, TrendingUp,
  Search, RefreshCw, ArrowLeft, AlertTriangle, Filter, X, ExternalLink,
  Image as ImageIcon, Film, Library, Users, Globe, ChevronLeft, ChevronRight,
  Copy, Check, CheckCircle2, Tag, Layers, Send, Eye, ShieldCheck, Sparkles,
  Maximize2, Minimize2
} from 'lucide-react';
import { toast } from 'sonner';
import SubmissionDetail from '../../components/admin/contribution/SubmissionDetail';
import { stateChip, stateLabel, activityDateLabel } from '../../lib/contentSubmissionSpec';
import { articleBadge } from '../../lib/submissionArticleSpec';
import {
  CONTENT_KINDS, UNASSIGNED, type InboxQuery,
  hasFilters, toSearchParams, fromSearchParams, describeInboxView, isPending,
  isContentSubmissionsAllowedSite,
} from '../../lib/submissionInbox';
import {
  Kpis, Serie, TipoBars, Ranking, SinReportar, Impacto, Macro, ClubDrawer,
  tipoIcon, tipoLabel
} from '../../components/admin/rotary/RotaryDashboard';
import RotaryMarketingInteligente from '../../components/admin/rotary/RotaryMarketingInteligente';
import RotaryActivacionClubes from '../../components/admin/rotary/RotaryActivacionClubes';

const API = import.meta.env.VITE_API_URL || '/api';
const getToken = () => localStorage.getItem('rotary_token');

const KINDS = [
  { id: 'tipo', label: 'Tipos de actividad', desc: 'Proyectos, eventos, jornadas y testimonios' },
  { id: 'area', label: 'Áreas de interés', desc: 'Las 7 áreas oficiales de Rotary International' },
  { id: 'programa', label: 'Programas', desc: 'Rotary, Rotaract, Interact, RYE, Polio Plus' },
  { id: 'tema', label: 'Temáticas', desc: 'Categorías y etiquetas temáticas transversales' },
];

export type RotaryEnAccionTab = 'resumen' | 'solicitudes' | 'control' | 'marketing' | 'activacion' | 'tax' | 'config' | 'impacto';


interface Fila {
  id: string; campaignId: string; campaignName?: string;
  status: string; assignee?: string | null;
  senderName: string; senderEmail: string; senderPhone?: string | null;
  club?: string | null; district?: string | null; city?: string | null;
  title?: string | null; description?: string | null;
  contentType?: string | null; areaFocus?: string | null; program?: string | null;
  topic?: string | null; priority?: string | null; impact?: any;
  activityDate?: string | null; createdAt: string;
  originClubId?: string | null; originClubName?: string | null;
  imageCount: number; videoCount: number; promotedCount: number;
  article?: { id: string; status: string; postId?: string | null; publicUrl?: string | null } | null;
}

interface Facets {
  campanas: { id: string; label: string }[];
  sitios: { id: string; label: string }[];
  distritos: string[];
  responsables: string[];
}

interface RespuestaSubmissions {
  scope: 'platform' | 'site'; siteScoped: boolean;
  submissions: Fila[]; total: number; page: number; perPage: number;
  resumen: { total: number; pendientes: number; abiertas: number; porEstado: Record<string, number> };
  tabs: { id: string; label: string; n: number; pending: boolean }[];
  facets: Facets;
  filtrada: boolean;
  descartados: { campo: string; motivo: string }[];
}

const fmtFecha = (v?: string) => v ? new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtHora = (v?: string) => v ? new Date(v).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

const campoClass = 'w-full px-3 py-2 rounded-xl border-2 border-gray-100 focus:border-rotary-blue outline-none text-sm bg-white min-w-0 transition-colors';
const rotuloClass = 'block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1';

interface RotaryEnAccionAdminProps {
  embedded?: boolean;
  initialTab?: RotaryEnAccionTab;
}

const RotaryEnAccionAdmin: React.FC<RotaryEnAccionAdminProps> = ({
  embedded = false,
  initialTab,
}) => {
  const { user, token } = useAuth();
  const { club } = useClub();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const siteAccess = useSiteAccess();

  const isRotaryFoundation = (user as any)?.role === 'rotary_foundation' ||
    siteAccess.grant?.roleKey === 'rotary_foundation';

  const isPlatformOp = user?.role === 'administrator' || user?.role === 'superadmin';
  const isSiteAdmin = isPlatformOp || user?.role === 'club_admin' || user?.role === 'district_admin';

  const canManage = isSiteAdmin || siteAccess.has('rotary_en_accion.manage');
  const canPublish = isSiteAdmin || siteAccess.has('rotary_en_accion.publish');
  const canEdit = isSiteAdmin || siteAccess.has('rotary_en_accion.edit');

  const isAllowed = useMemo(() => isContentSubmissionsAllowedSite({
    user,
    club,
    hostname: typeof window !== 'undefined' ? window.location.hostname : undefined,
  }), [user, club]);

  useEffect(() => {
    if (!isAllowed && !embedded) {
      toast.error('El módulo de Rotary en Acción está reservado a las entidades centrales de la plataforma (Club Platform, Rotary 4281, Feria de Proyectos y Colrotarios).');
      navigate('/admin/analytics', { replace: true });
    }
  }, [isAllowed, embedded, navigate]);

  // Resolución reactiva de pestaña activa (por URL ?tab= o contexto)
  const tabParam = params.get('tab');
  const activeTab = useMemo<RotaryEnAccionTab>(() => {
    if (tabParam === 'resumen') return 'resumen';
    if (tabParam === 'solicitudes') return 'solicitudes';
    if (tabParam === 'control') return 'control';
    if (tabParam === 'marketing' || tabParam === 'marketing-inteligente') return 'marketing';
    if (tabParam === 'activacion' || tabParam === 'activaciones' || tabParam === 'activar-club') return 'activacion';
    if ((tabParam === 'tax' || tabParam === 'taxonomias') && canManage) return 'tax';
    if ((tabParam === 'config' || tabParam === 'configuracion') && canManage) return 'config';
    if (tabParam === 'impacto') return 'impacto';
    // Si viene con parámetros específicos de búsqueda/solicitud, priorizar Solicitudes
    if (params.get('abrir') || params.get('q') || params.get('campana') || params.get('campaign') || params.get('estado') || params.get('status')) {
      return 'solicitudes';
    }
    return initialTab || 'resumen';
  }, [tabParam, params, initialTab, canManage]);

  const cambiarTab = (nueva: RotaryEnAccionTab) => {
    const next = new URLSearchParams(params);
    next.set('tab', nueva);
    setParams(next, { replace: true });
  };

  // ── ESTADO DE BANDEJA DE SOLICITUDES ─────────────────────────────────────
  const q = useMemo<InboxQuery>(() => fromSearchParams(params), [params]);
  const [dataSubmissions, setDataSubmissions] = useState<RespuestaSubmissions | null>(null);
  const [cargandoSubmissions, setCargandoSubmissions] = useState(false);
  const [errorSubmissions, setErrorSubmissions] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<{ id: string; campaignId: string } | null>(null);
  const [busqueda, setBusqueda] = useState(q.q);
  const [verFiltros, setVerFiltros] = useState(false);

  // ── ESTADO DE TABLERO Y ESTADÍSTICAS ─────────────────────────────────────
  const [dash, setDash] = useState<any>(null);
  const [gran, setGran] = useState('');
  const [clubSel, setClubSel] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);

  // ── ESTADO DE TAXONOMÍAS Y CONFIGURACIÓN ─────────────────────────────────
  const [kind, setKind] = useState('tipo');
  const [taxItems, setTaxItems] = useState<any[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [taxForm, setTaxForm] = useState({ slug: '', name: '', icon: '', color: '', order: 0 });
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [copiadoUrl, setCopiadoUrl] = useState(false);
  const [kanbanEmbebido, setKanbanEmbebido] = useState(false);

  const authHeaders = useMemo(() => ({
    Authorization: `Bearer ${token || getToken()}`,
    'Content-Type': 'application/json',
  }), [token]);

  // Carga del listado de solicitudes
  const cargarSubmissions = useCallback(async () => {
    if (!isAllowed) return;
    setCargandoSubmissions(true);
    setErrorSubmissions(null);
    try {
      const r = await fetch(`${API}/contribution-campaigns/submissions/inbox?${toSearchParams(q)}`, {
        headers: { Authorization: `Bearer ${token || getToken()}` },
      });
      const texto = await r.text();
      let json: any;
      try { json = JSON.parse(texto); } catch {
        throw new Error(`El servidor respondió ${r.status} en vez de JSON.`);
      }
      if (!r.ok) {
        if (r.status === 401) throw new Error('Tu sesión venció. Vuelve a iniciar sesión.');
        if (r.status === 403) throw new Error('Sin permiso para ver solicitudes de contenido.');
        throw new Error(json?.error || `Error ${r.status}`);
      }
      setDataSubmissions(json);
      for (const d of json.descartados || []) toast.warning(`Filtro ignorado — ${d.motivo}`);
    } catch (e: any) {
      setErrorSubmissions(e?.message || 'No se pudieron cargar las solicitudes.');
    } finally {
      setCargandoSubmissions(false);
    }
  }, [isAllowed, q, token]);

  // Carga del tablero analítico (KPIs, Serie, Tipos, Ranking, Distritos)
  const cargarDash = useCallback(async (qq: InboxQuery, g: string) => {
    if (!isAllowed) return;
    try {
      const p = toSearchParams({ ...qq, page: 1 });
      if (g) p.set('gran', g);
      const r = await fetch(`${API}/rotary-en-accion/dashboard?${p}`, {
        headers: { Authorization: `Bearer ${token || getToken()}` },
      });
      if (r.ok) setDash(await r.json());
    } catch { /* degradación silenciosa */ }
  }, [isAllowed, token]);

  // Carga de taxonomías
  const loadTax = useCallback(async (k = kind) => {
    if (!isAllowed) return;
    try {
      const r = await fetch(`${API}/rotary-en-accion/taxonomies?kind=${k}`, {
        headers: { Authorization: `Bearer ${token || getToken()}` },
      });
      if (r.ok) {
        const d = await r.json();
        setTaxItems(d.taxonomies || []);
      }
    } catch { /* noop */ }
  }, [isAllowed, kind, token]);

  // Carga de estadísticas generales y configuración administrativa
  const loadGlobal = useCallback(async () => {
    if (!isAllowed) return;
    try {
      const [s, c] = await Promise.all([
        fetch(`${API}/rotary-en-accion/stats`, { headers: { Authorization: `Bearer ${token || getToken()}` } }).then(r => r.json()).catch(() => null),
        fetch(`${API}/rotary-en-accion/config-admin`, { headers: { Authorization: `Bearer ${token || getToken()}` } }).then(r => r.json()).catch(() => null),
      ]);
      if (s) setStats(s);
      if (c?.config) setConfig(c.config);
    } catch { /* noop */ }
  }, [isAllowed, token]);

  // Disparadores de carga
  useEffect(() => {
    if (isAllowed) {
      loadGlobal();
      loadTax(kind);
    }
  }, [isAllowed, loadGlobal, loadTax, kind]);

  useEffect(() => {
    if (isAllowed) {
      cargarSubmissions();
    }
  }, [isAllowed, cargarSubmissions]);

  useEffect(() => {
    if (isAllowed) {
      cargarDash(q, gran);
    }
  }, [isAllowed, cargarDash, q, gran]);

  useEffect(() => {
    setBusqueda(q.q);
  }, [q.q]);

  // Manejo de ?abrir=<id> para desplegar la ficha de solicitud directamente
  const abrirParam = params.get('abrir');
  useEffect(() => {
    if (!abrirParam || !isAllowed) return;
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`${API}/contribution-campaigns/submissions/inbox/${encodeURIComponent(abrirParam)}`, {
          headers: { Authorization: `Bearer ${token || getToken()}` },
        });
        const texto = await r.text();
        let json: any = null;
        try { json = JSON.parse(texto); } catch { json = null; }
        if (!vivo) return;
        if (!r.ok || !json?.campaignId) {
          toast.error(r.status === 404 ? 'Esa solicitud no existe o no llega a tu sitio.' : (json?.error || 'No se pudo abrir la solicitud.'));
        } else {
          setAbierta({ id: abrirParam, campaignId: json.campaignId });
        }
      } catch {
        if (vivo) toast.error('No se pudo abrir la solicitud.');
      } finally {
        if (vivo) {
          const siguiente = new URLSearchParams(params);
          siguiente.delete('abrir');
          setParams(siguiente, { replace: true });
        }
      }
    })();
    return () => { vivo = false; };
  }, [abrirParam, isAllowed, params, setParams, token]);

  // Actualizar filtros de consulta de bandeja
  const aplicar = useCallback((patch: Partial<InboxQuery>) => {
    const siguiente = { ...q, ...patch, page: patch.page ?? 1 };
    const p = toSearchParams(siguiente);
    p.set('tab', 'solicitudes');
    setParams(p, { replace: true });
  }, [q, setParams]);

  const limpiarFiltros = () => {
    const p = new URLSearchParams();
    p.set('tab', 'solicitudes');
    setParams(p, { replace: true });
  };

  // Acciones sobre taxonomías
  const saveTax = async () => {
    if (!taxForm.slug || !taxForm.name) {
      toast.error('Slug y nombre son obligatorios');
      return;
    }
    const r = await fetch(`${API}/rotary-en-accion/taxonomies`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ kind, ...taxForm }),
    });
    if (!r.ok) {
      toast.error('No se pudo guardar la taxonomía');
      return;
    }
    toast.success('Taxonomía guardada con éxito');
    setTaxForm({ slug: '', name: '', icon: '', color: '', order: 0 });
    loadTax(kind);
  };

  const toggleTax = async (id: string, active: boolean) => {
    await fetch(`${API}/rotary-en-accion/taxonomies/${id}/active`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ active: !active }),
    });
    loadTax(kind);
  };

  // Acciones sobre configuración
  const saveConfig = async () => {
    setGuardandoConfig(true);
    try {
      const r = await fetch(`${API}/rotary-en-accion/config-admin`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify(config),
      });
      if (r.ok) {
        toast.success('Configuración de Rotary en Acción guardada correctamente');
      } else {
        toast.error('Error al guardar la configuración');
      }
    } catch {
      toast.error('Error de red al guardar la configuración');
    } finally {
      setGuardandoConfig(false);
    }
  };

  const copiarEnlacePublico = () => {
    const url = `${window.location.origin}/rotary-en-accion`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiadoUrl(true);
      toast.success('Enlace universal copiado al portapapeles');
      setTimeout(() => setCopiadoUrl(false), 2500);
    }).catch(() => {
      toast.error('No se pudo copiar el enlace');
    });
  };

  // Refrescar todos los datos
  const refrescarTodo = () => {
    cargarSubmissions();
    cargarDash(q, gran);
    loadGlobal();
    loadTax(kind);
    toast.info('Actualizando datos de Rotary en Acción...');
  };

  const facets = dataSubmissions?.facets || { campanas: [], sitios: [], distritos: [], responsables: [] };
  const filtrada = hasFilters(q);
  const totalPaginas = dataSubmissions ? Math.max(1, Math.ceil(dataSubmissions.total / (dataSubmissions.perPage || 50))) : 1;
  const pendientesCount = dataSubmissions?.resumen?.pendientes || 0;

  // Render para sitios sin permisos
  if (!isAllowed) {
    const errorBlock = (
      <div className="p-8 max-w-xl mx-auto text-center space-y-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-200 shadow-sm">
          <HeartHandshake className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-gray-800">Módulo no disponible</h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          El módulo de Rotary en Acción está reservado exclusivamente a las entidades centrales de la plataforma (Club Platform, Rotary 4281, Feria de Proyectos y Colrotarios).
        </p>
        <button
          type="button"
          onClick={() => navigate('/admin/analytics')}
          className="px-4 py-2 bg-rotary-blue text-white rounded-xl text-sm font-semibold hover:bg-sky-800 transition"
        >
          Volver al panel
        </button>
      </div>
    );
    if (embedded) return errorBlock;
    return <AdminLayout wide>{errorBlock}</AdminLayout>;
  }

  // Contenido principal del módulo
  const content = (
    <div className="space-y-6">

      {/* ── 1. CABECERA PRINCIPAL UNIFICADA ─────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4 bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="w-12 h-12 rounded-2xl bg-[#013388]/10 text-rotary-blue flex items-center justify-center shrink-0 border border-sky-100 shadow-xs">
              <HeartHandshake className="w-6 h-6 text-rotary-blue" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-light text-gray-900 tracking-tight">
                  Rotary en Acción
                </h1>
                {isRotaryFoundation ? (
                  <span className="text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-500 to-amber-600 text-white px-2.5 py-0.5 rounded-full shadow-xs border border-amber-400 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-white" />
                    Fundación Rotaria · D4281
                  </span>
                ) : (
                  <span className="text-[10px] font-black uppercase tracking-wider bg-rotary-blue/10 text-rotary-blue px-2.5 py-0.5 rounded-full border border-rotary-blue/20">
                    Módulo Unificado
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1 max-w-2xl">
                {isRotaryFoundation
                  ? 'Seguimiento, supervisión y trazabilidad de campañas, solicitudes de contenido y reportes de impacto para la Fundación Rotaria.'
                  : 'Captación universal · Las campañas activan · Las solicitudes gestionan · El Centro de Control opera.'}
                {dataSubmissions?.siteScoped && ' Ves las solicitudes asociadas al alcance de tu sitio.'}
              </p>
            </div>
          </div>
        </div>

        {/* Acciones rápidas transversales */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            onClick={refrescarTodo}
            disabled={cargandoSubmissions}
            className="px-3.5 py-2.5 rounded-xl border-2 border-gray-100 hover:border-gray-200 text-gray-600 font-bold flex items-center gap-2 bg-white transition hover:bg-gray-50 disabled:opacity-50"
            title="Actualizar datos y métricas"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${cargandoSubmissions ? 'animate-spin text-rotary-blue' : ''}`} />
            <span>Actualizar</span>
          </button>
          <button
            onClick={() => navigate('/admin/activacion-contenido')}
            className="px-3.5 py-2.5 rounded-xl border-2 border-gray-100 hover:border-gray-200 text-gray-700 font-bold transition hover:bg-gray-50"
          >
            Campañas
          </button>
          <a
            href="/admin/mission-control-vip"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-900 hover:bg-[#013388] text-white font-bold flex items-center gap-1.5 transition shadow-xs"
            title="Abrir Centro de Control VIP transversal"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Centro de Control VIP</span>
            <ExternalLink className="w-3 h-3 text-slate-400 ml-0.5" />
          </a>
          <a
            href="/rotary-en-accion"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2.5 rounded-xl bg-rotary-blue hover:bg-sky-700 text-white font-bold flex items-center gap-1.5 transition shadow-sm"
            title="Abrir formulario público de captura universal"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Abrir Formulario</span>
          </a>
        </div>
      </div>

      {/* ── 2. BARRA DE NAVEGACIÓN POR SECCIONES (TABS) ─────────────── */}
      <div className="flex gap-1.5 p-1.5 bg-gray-100/80 rounded-2xl overflow-x-auto scroll-x-visible text-xs font-black">
        <button
          onClick={() => cambiarTab('resumen')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            activeTab === 'resumen'
              ? 'bg-white text-gray-900 shadow-sm border border-gray-200/60'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-rotary-blue" />
          <span>Resumen</span>
        </button>

        <button
          onClick={() => cambiarTab('solicitudes')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            activeTab === 'solicitudes'
              ? 'bg-white text-gray-900 shadow-sm border border-gray-200/60'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
          }`}
        >
          <Inbox className="w-4 h-4 text-sky-600" />
          <span>Solicitudes</span>
          {pendientesCount > 0 && (
            <span className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded-full font-black border border-amber-200">
              {pendientesCount}
            </span>
          )}
        </button>

        <button
          onClick={() => cambiarTab('control')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            activeTab === 'control'
              ? 'bg-white text-gray-900 shadow-sm border border-gray-200/60'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
          }`}
        >
          <Zap className="w-4 h-4 text-amber-500" />
          <span>Centro de Control</span>
        </button>

        <button
          onClick={() => cambiarTab('marketing')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            activeTab === 'marketing'
              ? 'bg-white text-gray-900 shadow-sm border border-gray-200/60'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
          }`}
        >
          <Sparkles className="w-4 h-4 text-purple-600" />
          <span>Marketing Inteligente</span>
          <span className="text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full border border-purple-200">
            IA
          </span>
        </button>

        <button
          onClick={() => cambiarTab('activacion')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            activeTab === 'activacion'
              ? 'bg-white text-gray-900 shadow-sm border border-gray-200/60'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
          }`}
        >
          <Users className="w-4 h-4 text-emerald-600" />
          <span>Activación de Clubes</span>
          <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
            Embudo
          </span>
        </button>

        {canManage && (
          <button
            onClick={() => cambiarTab('tax')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
              activeTab === 'tax'
                ? 'bg-white text-gray-900 shadow-sm border border-gray-200/60'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
            }`}
          >
            <Tag className="w-4 h-4 text-indigo-500" />
            <span>Taxonomías</span>
          </button>
        )}

        {canManage && (
          <button
            onClick={() => cambiarTab('config')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
              activeTab === 'config'
                ? 'bg-white text-gray-900 shadow-sm border border-gray-200/60'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
            }`}
          >
            <Settings className="w-4 h-4 text-slate-600" />
            <span>Configuración</span>
          </button>
        )}

        <button
          onClick={() => cambiarTab('impacto')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            activeTab === 'impacto'
              ? 'bg-white text-gray-900 shadow-sm border border-gray-200/60'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
          }`}
        >
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          <span>Impacto</span>
        </button>
      </div>

      {/* ── 3. SECCIÓN: RESUMEN ───────────────────────────────────────── */}
      {activeTab === 'resumen' && (
        <div className="space-y-6">
          {/* Controles de período y temporalidad */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Período:</span>
              {[
                { l: '30 días', d: 30 },
                { l: '90 días', d: 90 },
                { l: '12 meses', d: 365 },
              ].map((p) => (
                <button
                  key={p.l}
                  onClick={() => {
                    const to = new Date();
                    const from = new Date(to.getTime() - p.d * 86400000);
                    aplicar({ from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) });
                  }}
                  className="px-3 py-1.5 rounded-xl text-[11px] font-black border-2 border-gray-100 text-gray-600 hover:border-gray-200 bg-white"
                >
                  {p.l}
                </button>
              ))}
              <button
                onClick={() => aplicar({ from: '', to: '' })}
                className="px-3 py-1.5 rounded-xl text-[11px] font-black border-2 border-gray-100 text-gray-600 hover:border-gray-200 bg-white"
              >
                Todo
              </button>
              <select
                value={gran}
                onChange={(e) => setGran(e.target.value)}
                aria-label="Agrupación temporal"
                className="px-3 py-1.5 rounded-xl text-[11px] font-black border-2 border-gray-100 text-gray-600 bg-white"
              >
                <option value="">Auto</option>
                <option value="semana">Semanal</option>
                <option value="mes">Mensual</option>
                <option value="trimestre">Trimestral</option>
                <option value="ano">Anual</option>
              </select>
              {dash?.periodo && (
                <span className="text-[11px] text-gray-400 ml-2">
                  {dash.periodo.from} → {dash.periodo.to}{dash?.alcance ? ` · ${dash.alcance}` : ''}
                </span>
              )}
            </div>

            {(q.from || q.to || q.club) && (
              <button
                onClick={() => aplicar({ from: '', to: '', club: '' })}
                className="px-3 py-1.5 rounded-xl text-[11px] font-black text-gray-500 border-2 border-gray-100 hover:border-gray-200 bg-white"
              >
                Limpiar filtros
              </button>
            )}
          </div>

          {/* Tarjetas KPI de Rotary en Acción */}
          {dash && (
            <Kpis
              dash={dash}
              on={(a) => {
                if (a === 'pub') aplicar({ status: 'publicado' });
                else if (a === 'sin') document.getElementById('rea-sin')?.scrollIntoView({ behavior: 'smooth' });
                else if (a === 'clubes' || a === 'pct') document.getElementById('rea-ranking')?.scrollIntoView({ behavior: 'smooth' });
                else cambiarTab('solicitudes');
              }}
            />
          )}

          {/* Serie temporal y distribución por tipo */}
          {dash && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Serie dash={dash} />
              <TipoBars
                dash={dash}
                activo={(q as any).contentType}
                onTipo={(k) => {
                  aplicar({ contentType: (q as any).contentType === k ? '' : k } as any);
                  cambiarTab('solicitudes');
                }}
              />
            </div>
          )}

          {/* Resumen ejecutivo de captación */}
          <div className="grid md:grid-cols-3 gap-4 text-xs">
            <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-black text-gray-800 uppercase tracking-wider text-[11px]">Funnel de Estados</span>
                <span className="text-gray-400 text-[10px]">Total general</span>
              </div>
              {stats?.funnel && stats.funnel.length > 0 ? (
                <div className="space-y-1.5">
                  {stats.funnel.map((f: any) => (
                    <button
                      key={f.status}
                      onClick={() => { aplicar({ status: f.status }); cambiarTab('solicitudes'); }}
                      className="w-full flex justify-between py-1.5 px-2 rounded-lg hover:bg-sky-50 text-left transition"
                    >
                      <span className="capitalize text-gray-700 font-bold">{stateLabel(f.status)}</span>
                      <b className="text-gray-900">{f.n}</b>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-gray-400 py-3">Sin datos registrados aún.</div>
              )}
            </div>

            <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-black text-gray-800 uppercase tracking-wider text-[11px]">Actividad por Mes</span>
                <span className="text-gray-400 text-[10px]">Histórico</span>
              </div>
              {stats?.porMes && stats.porMes.length > 0 ? (
                <div className="space-y-1.5">
                  {stats.porMes.slice(0, 6).map((f: any) => (
                    <div key={f.k} className="flex justify-between py-1.5 px-2 border-b border-gray-50 last:border-0 text-gray-700">
                      <span>{f.k}</span>
                      <b className="text-gray-900">{f.n} aportes</b>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-400 py-3">Sin datos registrados aún.</div>
              )}
            </div>

            <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4 flex flex-col justify-between">
              <div>
                <span className="font-black text-gray-800 uppercase tracking-wider text-[11px] block mb-2">Canales de Captación</span>
                <p className="text-gray-500 text-xs mb-3">
                  Rotary en Acción capta tanto de forma universal desde la web pública como a través de campañas de contribución activadas.
                </p>
                <div className="p-3 bg-sky-50/60 rounded-xl border border-sky-100 text-sky-900">
                  <div className="text-[10px] font-black uppercase text-sky-600">Aportes Universales</div>
                  <div className="text-2xl font-black mt-0.5">{stats?.universal ?? '—'}</div>
                  <div className="text-[11px] text-sky-700 mt-1">Recibidas sin campaña específica vinculada.</div>
                </div>
              </div>
              <button
                onClick={() => cambiarTab('solicitudes')}
                className="mt-4 w-full py-2 bg-rotary-blue text-white rounded-xl font-bold text-xs hover:bg-sky-700 transition"
              >
                Ver todas las solicitudes →
              </button>
            </div>
          </div>

          {/* Ranking y clubes sin reportar */}
          {dash && (
            <div className="grid gap-4 lg:grid-cols-2" id="rea-ranking">
              <Ranking dash={dash} onClub={setClubSel} />
              <div id="rea-sin">
                <SinReportar dash={dash} onClub={setClubSel} />
              </div>
            </div>
          )}

          {/* Modal de información del club */}
          <ClubDrawer
            club={clubSel}
            onClose={() => setClubSel(null)}
            onVerAportes={(name) => {
              setClubSel(null);
              aplicar({ q: name });
              cambiarTab('solicitudes');
            }}
          />
        </div>
      )}

      {/* ── 4. SECCIÓN: SOLICITUDES (BANDEJA COMPLETA) ─────────────── */}
      {activeTab === 'solicitudes' && (
        <div className="space-y-5">
          {errorSubmissions && (
            <div className="rounded-2xl bg-red-50 border border-red-100 p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-900">No se pudieron cargar las solicitudes</p>
                <p className="text-xs text-red-700 mt-0.5">{errorSubmissions}</p>
                <button onClick={cargarSubmissions} className="mt-2 text-xs font-black text-red-700 underline">
                  Reintentar
                </button>
              </div>
            </div>
          )}

          {/* Pestañas de estado */}
          {dataSubmissions && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => aplicar({ status: '' })}
                className={`px-3.5 py-2 rounded-xl text-xs font-black border-2 transition ${
                  !q.status
                    ? 'border-rotary-blue bg-rotary-blue/5 text-rotary-blue'
                    : 'border-gray-100 text-gray-500 hover:border-gray-200 bg-white'
                }`}
              >
                TODAS <span className="ml-1 text-gray-400">{dataSubmissions.resumen.total}</span>
              </button>
              {dataSubmissions.tabs.filter(t => t.n > 0 || t.id === q.status).map(t => (
                <button
                  key={t.id}
                  onClick={() => aplicar({ status: q.status === t.id ? '' : t.id })}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black border-2 transition ${
                    q.status === t.id
                      ? 'border-rotary-blue bg-rotary-blue/5 text-rotary-blue'
                      : t.pending && t.n > 0
                        ? 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300'
                        : 'border-gray-100 text-gray-500 hover:border-gray-200 bg-white'
                  }`}
                >
                  {t.label.toUpperCase()} <span className="ml-1 opacity-60">{t.n}</span>
                </button>
              ))}
            </div>
          )}

          {/* Barra de búsqueda y filtros */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <form
                className="relative flex-1 min-w-[200px]"
                onSubmit={(e) => { e.preventDefault(); aplicar({ q: busqueda }); }}
              >
                <Search className="w-4 h-4 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre, correo, club, campaña o texto de la solicitud…"
                  className={`${campoClass} pl-9`}
                />
              </form>
              <button
                type="button"
                onClick={() => setVerFiltros(v => !v)}
                className={`px-4 py-2 rounded-xl text-xs font-black border-2 flex items-center gap-2 shrink-0 transition ${
                  verFiltros || filtrada ? 'border-rotary-blue text-rotary-blue bg-rotary-blue/5' : 'border-gray-100 text-gray-500 bg-white'
                }`}
              >
                <Filter className="w-4 h-4" /> FILTROS
              </button>
              {filtrada && (
                <button
                  type="button"
                  onClick={limpiarFiltros}
                  className="px-4 py-2 rounded-xl text-xs font-black text-gray-500 border-2 border-gray-100 hover:border-gray-200 flex items-center gap-2 shrink-0 bg-white"
                >
                  <X className="w-4 h-4" /> QUITAR FILTROS
                </button>
              )}
            </div>

            {/* Panel de filtros avanzados */}
            {verFiltros && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-2 border-t border-gray-50">
                <div className="min-w-0">
                  <label className={rotuloClass}>Campaña</label>
                  <select className={campoClass} value={q.campaign} onChange={e => aplicar({ campaign: e.target.value })}>
                    <option value="">Todas las campañas</option>
                    {facets.campanas.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>

                {facets.sitios.length > 0 && (
                  <div className="min-w-0">
                    <label className={rotuloClass}>Sitio de origen</label>
                    <select className={campoClass} value={q.site} onChange={e => aplicar({ site: e.target.value })}>
                      <option value="">Todos los sitios</option>
                      {facets.sitios.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                )}

                {!dataSubmissions?.siteScoped && (
                  <div className="min-w-0">
                    <label className={rotuloClass}>Distrito</label>
                    <select className={campoClass} value={q.district} onChange={e => aplicar({ district: e.target.value })}>
                      <option value="">Todos los distritos</option>
                      {facets.distritos.map(d => <option key={d} value={d}>Distrito {d}</option>)}
                    </select>
                  </div>
                )}

                <div className="min-w-0">
                  <label className={rotuloClass}>Club</label>
                  <input
                    className={campoClass}
                    value={(q as any).club || ''}
                    onChange={e => aplicar({ club: e.target.value } as any)}
                    placeholder="Nombre del club…"
                  />
                </div>

                <div className="min-w-0">
                  <label className={rotuloClass}>Responsable</label>
                  <select className={campoClass} value={q.assignee} onChange={e => aplicar({ assignee: e.target.value })}>
                    <option value="">Cualquiera</option>
                    <option value={UNASSIGNED}>Sin asignar</option>
                    {facets.responsables.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>

                <div className="min-w-0">
                  <label className={rotuloClass}>Tipo de contenido</label>
                  <select className={campoClass} value={q.kind} onChange={e => aplicar({ kind: e.target.value })}>
                    <option value="">Cualquiera</option>
                    {Object.values(CONTENT_KINDS).map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
                  </select>
                </div>

                <div className="min-w-0">
                  <label className={rotuloClass}>Tipo de actividad</label>
                  <select className={campoClass} value={(q as any).contentType || ''} onChange={e => aplicar({ contentType: e.target.value } as any)}>
                    <option value="">Cualquiera</option>
                    <option value="proyecto">Proyecto u obra</option>
                    <option value="actividad">Actividad o jornada</option>
                    <option value="evento">Evento</option>
                    <option value="historia-servicio">Historia de servicio</option>
                    <option value="emergencia">Emergencia</option>
                    <option value="campana">Campaña</option>
                    <option value="reconocimiento">Reconocimiento</option>
                    <option value="alianza">Alianza</option>
                    <option value="juventud">Actividad juvenil</option>
                    <option value="capacitacion">Capacitación</option>
                    <option value="recaudacion">Recaudación</option>
                    <option value="testimonio">Testimonio</option>
                    <option value="convocatoria">Convocatoria</option>
                    <option value="proyecto-internacional">Proyecto internacional</option>
                    <option value="otra">Otra acción</option>
                  </select>
                </div>

                <div className="min-w-0">
                  <label className={rotuloClass}>Programa</label>
                  <select className={campoClass} value={(q as any).program || ''} onChange={e => aplicar({ program: e.target.value } as any)}>
                    <option value="">Cualquiera</option>
                    <option value="rotary">Rotary</option>
                    <option value="rotaract">Rotaract</option>
                    <option value="interact">Interact</option>
                    <option value="rye">Intercambio (RYE)</option>
                    <option value="ryla">RYLA</option>
                    <option value="polio">End Polio Now</option>
                    <option value="fundacion">Fundación Rotaria</option>
                    <option value="subvenciones">Subvenciones</option>
                  </select>
                </div>

                <div className="min-w-0">
                  <label className={rotuloClass}>Prioridad IA</label>
                  <select className={campoClass} value={(q as any).priority || ''} onChange={e => aplicar({ priority: e.target.value } as any)}>
                    <option value="">Cualquiera</option>
                    <option value="alta">Alta</option>
                    <option value="media">Media</option>
                    <option value="baja">Baja</option>
                  </select>
                </div>

                <div className="min-w-0">
                  <label className={rotuloClass}>Desde</label>
                  <input type="date" className={campoClass} value={q.from} onChange={e => aplicar({ from: e.target.value })} />
                </div>

                <div className="min-w-0">
                  <label className={rotuloClass}>Hasta</label>
                  <input type="date" className={campoClass} value={q.to} onChange={e => aplicar({ to: e.target.value })} />
                </div>
              </div>
            )}

            {dataSubmissions && (
              <p className="text-[11px] text-gray-400">
                {describeInboxView({
                  mostradas: dataSubmissions.submissions.length,
                  total: dataSubmissions.total,
                  pendientes: dataSubmissions.resumen.pendientes,
                  filtrada,
                })}
              </p>
            )}
          </div>

          {/* Listado de Solicitudes */}
          {cargandoSubmissions && !dataSubmissions ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} className="h-20 bg-white rounded-2xl border border-gray-100 animate-pulse" />
              ))}
            </div>
          ) : !dataSubmissions || dataSubmissions.submissions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <Inbox className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-bold text-gray-600">
                {filtrada ? 'Ninguna solicitud coincide con los filtros' : 'Todavía no ha llegado ninguna solicitud'}
              </p>
              <p className="text-xs text-gray-400 mt-1.5 max-w-md mx-auto">
                {filtrada
                  ? 'Prueba ajustando o quitando los filtros para ver otras solicitudes.'
                  : 'Cuando los clubes envíen material por Rotary en Acción o por el formulario de una campaña, aparecerán aquí.'}
              </p>
              {filtrada && (
                <button onClick={limpiarFiltros} className="mt-4 px-4 py-2.5 rounded-xl bg-rotary-blue text-white text-xs font-black shadow-xs">
                  VER TODAS LAS SOLICITUDES
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Tabla para desktop */}
              <div className="hidden lg:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto scroll-x-visible">
                <table className="min-w-max w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] bg-gray-50/50">
                      <th className="text-left px-4 py-3">Quién y qué</th>
                      <th className="text-left px-4 py-3">Tipo y Campaña</th>
                      <th className="text-left px-4 py-3">Origen</th>
                      <th className="text-left px-4 py-3">Material</th>
                      <th className="text-left px-4 py-3">Estado</th>
                      <th className="text-left px-4 py-3">Artículo</th>
                      <th className="text-left px-4 py-3">Responsable</th>
                      <th className="text-left px-4 py-3">Llegó</th>
                      <th className="text-right px-4 py-3">Control VIP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataSubmissions.submissions.map(s => (
                      <tr
                        key={s.id}
                        onClick={() => setAbierta({ id: s.id, campaignId: s.campaignId })}
                        className={`border-b border-gray-50 last:border-0 cursor-pointer hover:bg-sky-50/40 transition-colors ${
                          isPending(s.status) ? 'bg-amber-50/30' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <p className="font-bold text-gray-900" data-no-translate>{s.senderName}</p>
                          <p className="text-xs text-gray-500 truncate max-w-[280px]">
                            {s.title || s.description || 'Sin título'}
                          </p>
                          {s.club && <p className="text-[11px] text-gray-400" data-no-translate>{s.club}</p>}
                          {(s.contentType || s.program || s.priority) && (
                            <p className="flex flex-wrap gap-1 mt-1">
                              {s.contentType && <span className="text-[10px] font-bold bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded-full">{s.contentType}</span>}
                              {s.program && <span className="text-[10px] font-bold bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded-full">{s.program}</span>}
                              {s.priority === 'alta' && <span className="text-[10px] font-bold bg-red-50 text-red-700 px-1.5 py-0.5 rounded-full">Prioridad alta</span>}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 max-w-[200px]">
                          {(s as any).contentType
                            ? (
                              <span className="inline-flex items-center gap-1 font-bold" title={(s as any).program || ''}>
                                <span aria-hidden>{tipoIcon((s as any).contentType)}</span>
                                {tipoLabel((s as any).contentType)}
                              </span>
                            )
                            : <span className="text-gray-300">Sin clasificar</span>}
                          {s.campaignName && (
                            <span className="block text-[11px] text-gray-400 truncate" title={s.campaignName}>
                              {s.campaignName}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {s.originClubName
                            ? <span className="inline-flex items-center gap-1"><Globe className="w-3 h-3 text-gray-300" />{s.originClubName}</span>
                            : <span className="text-gray-300" title="Universal">—</span>}
                          {s.district && <span className="block text-[11px] text-gray-400">Distrito {s.district}</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-2 text-xs text-gray-500">
                            {s.imageCount > 0 && <span className="inline-flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5 text-gray-300" />{s.imageCount}</span>}
                            {s.videoCount > 0 && <span className="inline-flex items-center gap-1"><Film className="w-3.5 h-3.5 text-gray-300" />{s.videoCount}</span>}
                            {s.promotedCount > 0 && <span className="inline-flex items-center gap-1 text-emerald-600" title="En Biblioteca"><Library className="w-3.5 h-3.5" />{s.promotedCount}</span>}
                            {s.imageCount + s.videoCount === 0 && <span className="text-gray-300">Sin archivos</span>}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${stateChip(s.status)}`}>
                            {stateLabel(s.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {(() => {
                            const b = articleBadge(s.article?.status);
                            return (
                              <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${b.chip}`}>
                                {b.label}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {s.assignee
                            ? <span className="text-gray-700 font-bold" data-no-translate>{s.assignee}</span>
                            : <span className="text-amber-600 font-bold">Sin asignar</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {fmtHora(s.createdAt)}
                          {s.activityDate && (
                            <span className="block text-[11px] text-gray-400">
                              Actividad: {activityDateLabel(s.activityDate)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <a
                            href={`/admin/mission-control-vip?submissionId=${encodeURIComponent(s.id)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Operar en Centro de Control VIP"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-slate-100 hover:bg-[#013388] text-slate-700 hover:text-white transition-colors"
                          >
                            <Zap className="w-3 h-3 text-amber-500" />
                            <span>VIP</span>
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Tarjetas en móvil */}
              <div className="lg:hidden space-y-2">
                {dataSubmissions.submissions.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setAbierta({ id: s.id, campaignId: s.campaignId })}
                    className={`w-full text-left bg-white rounded-2xl border p-4 hover:border-sky-200 transition-colors shadow-xs ${
                      isPending(s.status) ? 'border-amber-200 bg-amber-50/10' : 'border-gray-100'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 truncate" data-no-translate>{s.senderName}</p>
                        <p className="text-xs text-gray-500 line-clamp-2">{s.title || s.description || 'Sin título'}</p>
                      </div>
                      <span className="shrink-0 flex flex-col items-end gap-1">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${stateChip(s.status)}`}>
                          {stateLabel(s.status)}
                        </span>
                        {s.article && (() => {
                          const b = articleBadge(s.article.status);
                          return (
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${b.chip}`}>
                              Artículo: {b.label}
                            </span>
                          );
                        })()}
                      </span>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between border-t border-gray-50 pt-2 text-[11px] text-gray-400">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{s.club || 'Sin club'}</span>
                        {(s as any).contentType && <span>{tipoIcon((s as any).contentType)} {tipoLabel((s as any).contentType)}</span>}
                        {s.imageCount > 0 && <span className="inline-flex items-center gap-1"><ImageIcon className="w-3 h-3" />{s.imageCount}</span>}
                        {s.videoCount > 0 && <span className="inline-flex items-center gap-1"><Film className="w-3 h-3" />{s.videoCount}</span>}
                        <span>{fmtFecha(s.createdAt)}</span>
                      </div>
                      <a
                        href={`/admin/mission-control-vip?submissionId=${encodeURIComponent(s.id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title="Abrir en Centro de Control VIP"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black bg-slate-100 hover:bg-[#013388] text-slate-700 hover:text-white transition-colors shrink-0"
                      >
                        <Zap className="w-3 h-3 text-amber-500" />
                        <span>VIP</span>
                      </a>
                    </div>
                  </button>
                ))}
              </div>

              {/* Paginación */}
              {totalPaginas > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                  <button
                    disabled={q.page <= 1}
                    onClick={() => aplicar({ page: q.page - 1 })}
                    className="px-3 py-2 rounded-xl border-2 border-gray-100 text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed bg-white"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-bold text-gray-600">Página {q.page} de {totalPaginas}</span>
                  <button
                    disabled={q.page >= totalPaginas}
                    onClick={() => aplicar({ page: q.page + 1 })}
                    className="px-3 py-2 rounded-xl border-2 border-gray-100 text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed bg-white"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}

          {/* Ficha modal detallada de la solicitud */}
          {abierta && (
            <SubmissionDetail
              campaignId={abierta.campaignId}
              submissionId={abierta.id}
              onClose={() => setAbierta(null)}
              onChanged={cargarSubmissions}
            />
          )}
        </div>
      )}

      {/* ── 5. SECCIÓN: CENTRO DE CONTROL (KANBAN TRANSVERSAL) ────── */}
      {activeTab === 'control' && (
        <div className="space-y-6">
          {/* Banner de conexión operativa */}
          <div className="bg-gradient-to-br from-slate-900 via-[#012258] to-[#013388] rounded-3xl p-6 sm:p-8 text-white shadow-md relative overflow-hidden">
            <div className="relative z-10 max-w-3xl space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-amber-300 text-xs font-black border border-white/10">
                <Zap className="w-3.5 h-3.5" />
                <span>Herramienta Operativa Transversal</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-light tracking-tight">
                Centro de Control <span className="font-bold">Mission Control VIP</span>
              </h2>
              <p className="text-sm text-slate-200 leading-relaxed">
                El Centro de Control opera como el motor Kanban transversal donde el equipo de redacción, producción audiovisual y directores de imagen transforman las solicitudes recibidas en contenidos editoriales, Reels y difusiones omnicanal.
              </p>
              <div className="pt-3 flex flex-wrap gap-3">
                <a
                  href="/admin/mission-control-vip"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-3 rounded-2xl bg-white hover:bg-slate-100 text-[#013388] font-black text-xs flex items-center gap-2 shadow-lg transition-transform hover:-translate-y-0.5"
                >
                  <Zap className="w-4 h-4 text-amber-500" />
                  <span>Abrir Tablero Kanban a Pantalla Completa</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  onClick={() => setKanbanEmbebido(!kanbanEmbebido)}
                  className="px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-2 border border-white/20 backdrop-blur-sm transition"
                >
                  {kanbanEmbebido ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  <span>{kanbanEmbebido ? 'Ocultar visor embebido' : 'Previsualizar en este panel'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Pipeline operativo de 5 etapas */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              {
                etapa: '1. Triaje & Recepción',
                icono: '📥',
                color: 'bg-sky-50 border-sky-100 text-sky-900',
                desc: 'Recepción automática desde el formulario universal y verificación de evidencia gráfica.',
                actionText: 'Ver en Triaje',
                url: '/admin/mission-control-vip?status=recibido',
              },
              {
                etapa: '2. Revisión Editorial',
                icono: '📝',
                color: 'bg-indigo-50 border-indigo-100 text-indigo-900',
                desc: 'Generación de artículos IA, asignación de redactor y curaduría institucional.',
                actionText: 'Ver en Revisión',
                url: '/admin/mission-control-vip?status=en_revision',
              },
              {
                etapa: '3. Aprobación de Club',
                icono: '🤝',
                color: 'bg-amber-50 border-amber-100 text-amber-900',
                desc: 'Consentimientos del club, validación de presidentes y confirmación de datos.',
                actionText: 'Ver Pendientes',
                url: '/admin/mission-control-vip?status=aprobado',
              },
              {
                etapa: '4. Producción Multimedia',
                icono: '🎬',
                color: 'bg-purple-50 border-purple-100 text-purple-900',
                desc: 'Creación de Reels 9:16, carruseles fotográficos y guardado en Biblioteca.',
                actionText: 'Ver Producción',
                url: '/admin/mission-control-vip?status=listo_difusion',
              },
              {
                etapa: '5. Distribución Omnicanal',
                icono: '📢',
                color: 'bg-emerald-50 border-emerald-100 text-emerald-900',
                desc: 'Publicación en portales de noticias, redes sociales, boletines y WhatsApp.',
                actionText: 'Ver Publicadas',
                url: '/admin/mission-control-vip?status=publicado',
              },
            ].map((st) => (
              <div key={st.etapa} className={`rounded-2xl border p-4 flex flex-col justify-between ${st.color} shadow-xs`}>
                <div>
                  <div className="text-xl mb-1">{st.icono}</div>
                  <div className="font-black text-xs">{st.etapa}</div>
                  <p className="text-[11px] opacity-80 mt-1 leading-snug">{st.desc}</p>
                </div>
                <a
                  href={st.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 text-[11px] font-black underline flex items-center justify-between"
                >
                  <span>{st.actionText}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </a>
              </div>
            ))}
          </div>

          {/* Visor embebido opcional */}
          {kanbanEmbebido && (
            <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-xl">
              <div className="bg-gray-100 px-4 py-2 border-b flex items-center justify-between text-xs font-bold text-gray-600">
                <span className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  Centro de Control Operativo
                </span>
                <button onClick={() => setKanbanEmbebido(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <iframe
                src="/admin/mission-control-vip"
                title="Centro de Control VIP"
                className="w-full h-[750px] border-0"
              />
            </div>
          )}
        </div>
      )}

      {/* ── 6. SECCIÓN: MARKETING INTELIGENTE ───────────────────────── */}
      {activeTab === 'marketing' && (
        <RotaryMarketingInteligente />
      )}

      {/* ── SECCIÓN: ACTIVACIÓN DE CLUBES (EMBUDO & CRM) ─────────────── */}
      {activeTab === 'activacion' && (
        <RotaryActivacionClubes />
      )}

      {/* ── 7. SECCIÓN: TAXONOMÍAS ───────────────────────────────────── */}
      {activeTab === 'tax' && (
        <div className="bg-white border border-gray-100 shadow-sm rounded-3xl p-5 sm:p-6 space-y-6">
          <div>
            <h3 className="text-base font-black text-gray-900">Taxonomías y Clasificación</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Administra las dimensiones independientes que categorizan las historias y actividades en Rotary en Acción.
            </p>
          </div>

          {/* Selector de tipo de taxonomía */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {KINDS.map((k) => (
              <button
                key={k.id}
                onClick={() => setKind(k.id)}
                className={`p-3 rounded-2xl border text-left transition ${
                  kind === k.id
                    ? 'border-rotary-blue bg-rotary-blue/5 shadow-xs'
                    : 'border-gray-100 hover:border-gray-200 bg-white'
                }`}
              >
                <div className="font-black text-xs text-gray-800">{k.label}</div>
                <div className="text-[10px] text-gray-400 mt-0.5 leading-snug">{k.desc}</div>
              </button>
            ))}
          </div>

          {/* Formulario de agregar taxonomía */}
          <div className="p-4 bg-gray-50/60 rounded-2xl border border-gray-100 space-y-3">
            <div className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
              Agregar a {KINDS.find(k => k.id === kind)?.label}
            </div>
            <div className="grid sm:grid-cols-5 gap-2 text-xs">
              <input
                className={campoClass}
                placeholder="slug (ej: salud-materna)"
                value={taxForm.slug}
                onChange={(e) => setTaxForm({ ...taxForm, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
              />
              <input
                className={campoClass}
                placeholder="Nombre visible"
                value={taxForm.name}
                onChange={(e) => setTaxForm({ ...taxForm, name: e.target.value })}
              />
              <input
                className={campoClass}
                placeholder="Emoji icono (ej: 🩺)"
                value={taxForm.icon}
                onChange={(e) => setTaxForm({ ...taxForm, icon: e.target.value })}
              />
              <input
                className={campoClass}
                placeholder="Color hex (ej: #013388)"
                value={taxForm.color}
                onChange={(e) => setTaxForm({ ...taxForm, color: e.target.value })}
              />
              <button
                onClick={saveTax}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-4 py-2 font-bold transition flex items-center justify-center gap-1.5 shadow-xs"
              >
                <span>Agregar</span>
              </button>
            </div>
          </div>

          {/* Listado de elementos */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-black uppercase text-gray-400 tracking-wider mb-2">
              Elementos Registrados ({taxItems.length})
            </div>
            {taxItems.map((t: any) => (
              <div
                key={t.id}
                className={`flex items-center justify-between gap-3 border rounded-2xl px-4 py-2.5 transition ${
                  t.active ? 'bg-white border-gray-100' : 'bg-gray-50/50 border-gray-100 opacity-50'
                }`}
              >
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-lg">{t.icon || '🏷️'}</span>
                  <div>
                    <span className="font-bold text-gray-900 block">{t.name}</span>
                    <code className="text-[10px] text-gray-400">{t.slug}</code>
                  </div>
                  {t.color && (
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-gray-200 shrink-0"
                      style={{ backgroundColor: t.color }}
                      title={`Color: ${t.color}`}
                    />
                  )}
                </div>
                <button
                  onClick={() => toggleTax(t.id, t.active)}
                  className={`border rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    t.active
                      ? 'border-gray-200 hover:bg-red-50 hover:text-red-700 text-gray-600'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {t.active ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            ))}
            {taxItems.length === 0 && (
              <div className="text-gray-400 text-xs py-6 text-center border-2 border-dashed rounded-2xl">
                No hay elementos registrados en esta categoría.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 7. SECCIÓN: CONFIGURACIÓN ───────────────────────────────── */}
      {activeTab === 'config' && config && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-100 shadow-sm rounded-3xl p-5 sm:p-6 space-y-6 max-w-3xl">
            <div>
              <h3 className="text-base font-black text-gray-900">Reglas de Fotografía y Captura</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Configura los requisitos mínimos y las reglas de producción para historias que los clubes envían.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className={rotuloClass}>Mínimo de fotos para enviar</label>
                <input
                  type="number"
                  min={1}
                  className={campoClass}
                  value={config.photoRules?.minToSubmit ?? 1}
                  onChange={(e) => setConfig({ ...config, photoRules: { ...config.photoRules, minToSubmit: Number(e.target.value) } })}
                />
                <span className="text-[10px] text-gray-400 mt-1 block">Fotos requeridas para permitir el envío del formulario.</span>
              </div>

              <div>
                <label className={rotuloClass}>Cantidad recomendada</label>
                <input
                  type="number"
                  className={campoClass}
                  value={config.photoRules?.recommended ?? 3}
                  onChange={(e) => setConfig({ ...config, photoRules: { ...config.photoRules, recommended: Number(e.target.value) } })}
                />
                <span className="text-[10px] text-gray-400 mt-1 block">Sugerida en el formulario para una cobertura óptima.</span>
              </div>

              <div>
                <label className={rotuloClass}>Mínimo para generación de Reel</label>
                <input
                  type="number"
                  className={campoClass}
                  value={config.photoRules?.reelMin ?? 5}
                  onChange={(e) => setConfig({ ...config, photoRules: { ...config.photoRules, reelMin: Number(e.target.value) } })}
                />
                <span className="text-[10px] text-gray-400 mt-1 block">Fotos necesarias para generar un Reel de 5 escenas.</span>
              </div>

              <div>
                <label className={rotuloClass}>Ventana de detección de duplicados (días)</label>
                <input
                  type="number"
                  className={campoClass}
                  value={config.duplicateWindowDays ?? 90}
                  onChange={(e) => setConfig({ ...config, duplicateWindowDays: Number(e.target.value) })}
                />
                <span className="text-[10px] text-gray-400 mt-1 block">Ventana temporal para detectar historias similares de un mismo club.</span>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-50 space-y-3">
              <label className="flex items-center gap-3 text-xs text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded text-rotary-blue focus:ring-rotary-blue w-4 h-4"
                  checked={!!config.notifyOnPublish}
                  onChange={(e) => setConfig({ ...config, notifyOnPublish: e.target.checked })}
                />
                <span className="font-bold">Avisar por correo al remitente cuando se publique su historia en el portal distrital</span>
              </label>
            </div>

            <button
              onClick={saveConfig}
              disabled={guardandoConfig}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-5 py-2.5 text-xs font-black shadow-xs transition flex items-center gap-2 disabled:opacity-50"
            >
              {guardandoConfig ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>{guardandoConfig ? 'Guardando...' : 'Guardar Configuración'}</span>
            </button>
          </div>

          {/* Formulario público y enlaces universales */}
          <div className="bg-white border border-gray-100 shadow-sm rounded-3xl p-5 sm:p-6 space-y-4 max-w-3xl">
            <div>
              <h3 className="text-base font-black text-gray-900">Enlace Público de Rotary en Acción</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Enlace universal listo para compartir en grupos de WhatsApp, correos institucionales o códigos QR para captar material de todos los clubes.
              </p>
            </div>

            <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between gap-3">
              <code className="text-xs font-mono text-gray-700 truncate">
                {window.location.origin}/rotary-en-accion
              </code>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={copiarEnlacePublico}
                  className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-xs font-bold text-gray-700 flex items-center gap-1.5 transition"
                >
                  {copiadoUrl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiadoUrl ? 'Copiado' : 'Copiar'}</span>
                </button>
                <a
                  href="/rotary-en-accion"
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-slate-900 text-white hover:bg-[#013388] text-xs font-bold flex items-center gap-1.5 transition"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Probar</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 8. SECCIÓN: IMPACTO ───────────────────────────────────────── */}
      {activeTab === 'impacto' && (
        <div className="space-y-6">
          {/* Métricas de impacto reportado */}
          {dash && <Impacto dash={dash} />}

          {/* Comparativa entre distritos */}
          {dash && <Macro dash={dash} />}

          {/* Actividad por ciudades */}
          <div className="bg-white border border-gray-100 shadow-sm rounded-3xl p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-black text-gray-900">Actividad por Ciudad</h3>
                <p className="text-xs text-gray-400 mt-0.5">Base geográfica para el mapa distrital de Rotary en Acción.</p>
              </div>
              <span className="text-xs font-black bg-sky-50 text-sky-700 px-3 py-1 rounded-full">
                {stats?.ciudades?.length || 0} ciudades activas
              </span>
            </div>

            {stats?.ciudades && stats.ciudades.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                {stats.ciudades.map((c: any) => (
                  <div key={c.k} className="p-3 rounded-2xl border border-gray-50 bg-gray-50/40 hover:bg-sky-50/50 transition flex items-center justify-between">
                    <span className="font-bold text-xs text-gray-700 truncate">{c.k}</span>
                    <b className="text-rotary-blue font-black text-xs ml-2">{c.n}</b>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-400 text-xs py-8 text-center">
                Aún no hay registros con ciudad documentada en el período.
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <AdminLayout wide>
      {content}
    </AdminLayout>
  );
};

export default RotaryEnAccionAdmin;
