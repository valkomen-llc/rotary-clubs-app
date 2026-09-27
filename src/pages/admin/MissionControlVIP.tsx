import React, { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import {
  Zap,
  Target,
  X,
  Loader2,
  AlertCircle,
  Search,
  ExternalLink,
  Check,
  Edit2,
  Image as ImageIcon,
  Minimize2,
  Maximize2,
  RefreshCw,
  Sparkles,
  Globe,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";

const getApiBase = () => {
  const envApi = import.meta.env.VITE_API_URL;
  if (envApi && envApi !== "/api") return envApi.replace(/\/$/, "");
  return `${window.location.origin}/api`;
};

const API_BASE = getApiBase();
const token = () => localStorage.getItem("rotary_token");

// --- INTERFACES OPERACIONALES ---
interface DestinationItem {
  id: string;
  name: string;
  type: string;
  typeLabel: string;
  domain?: string | null;
  subdomain?: string | null;
  isActive: boolean;
  isPreselected: boolean;
  reason: string;
}

interface OperationalTask {
  id: string;
  type: 'content_submission' | 'grant_scout' | 'campaign_reading';
  title: string;
  subtitle: string;
  campaignId: string;
  campaignName: string;
  senderName?: string;
  senderEmail?: string;
  senderPhone?: string;
  club?: string;
  district?: string;
  date: string;
  activityDate?: string;
  column: 'entradas' | 'en_proceso' | 'por_aprobar' | 'programado' | 'publicado';
  actualState: string;
  isError: boolean;
  working: boolean;
  stageLabel: string;
  assignedAgent: {
    id: string;
    name: string;
    role: string;
    icon: string;
    color: string;
  };
  media: {
    imageCount: number;
    videoCount: number;
    coverUrl?: string | null;
    filesPreview: Array<{ filename: string; kind: string }>;
  };
  article?: {
    id: string;
    postId?: string;
    status: string;
    title?: string;
    excerpt?: string;
    category?: string;
    tags?: string[];
    publicUrl?: string;
    missingInfo?: Array<{ key: string; label: string }>;
    copyIssues?: string[];
    lastError?: string;
  } | null;
  post?: {
    id: string;
    title: string;
    slug?: string;
    published: boolean;
    scheduledAt?: string;
  } | null;
  destinations: {
    suggested: DestinationItem[];
    selectedClubIds: string[];
    publishToDistrict: boolean;
  };
  lastError?: string | null;
}

interface OperationalCampaign {
  id: string;
  title: string;
  slug: string;
  status: string;
  progress: number;
  total: number;
  published: number;
  inProgress: number;
  readyApproval: number;
  assignedAgents: string[];
}

const AGENTS_LIST = [
  { id: "rafael", name: "Rafael", role: "Redacción & Copywriting", icon: "🤖", color: "bg-blue-600", status: "online" },
  { id: "mateo", name: "Mateo", role: "Edición & Calidad Editorial", icon: "🍷", color: "bg-rose-600", status: "online" },
  { id: "valentina", name: "Valentina", role: "Curaduría & Multimedia", icon: "🎨", color: "bg-amber-500", status: "busy" },
  { id: "sofia", name: "Sofía", role: "SEO & Posicionamiento", icon: "⚔️", color: "bg-indigo-600", status: "online" },
  { id: "andres", name: "Andrés", role: "Distribución Omnicanal", icon: "🐉", color: "bg-emerald-600", status: "online" },
  { id: "diego", name: "Diego", role: "Diagnóstico & Datos", icon: "🐺", color: "bg-slate-700", status: "idle" },
];

export const MissionControlVIP: React.FC = () => {
  const navigate = useNavigate();
  const { token: authToken } = useAuth();

  const [tasks, setTasks] = useState<OperationalTask[]>([]);
  const [campaigns, setCampaigns] = useState<OperationalCampaign[]>([]);
  const [counts, setCounts] = useState({
    total: 0,
    entradas: 0,
    en_proceso: 0,
    por_aprobar: 0,
    programado: 0,
    publicado: 0,
    errores: 0,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isRunningAutomations, setIsRunningAutomations] = useState(false);
  const [selectedTask, setSelectedTask] = useState<OperationalTask | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("all");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("all");
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewDensity, setViewDensity] = useState<'compact' | 'normal' | 'expanded'>('normal');
  const [showCovers, setShowCovers] = useState(true);
  const [missionControlLogo, setMissionControlLogo] = useState<string | null>(null);

  // Aprobación y destinos locales en modal
  const [targetClubIds, setTargetClubIds] = useState<string[]>([]);
  const [publishToDistrict, setPublishToDistrict] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);

  // Carga de logotipo y configuración
  useEffect(() => {
    fetch(`${API_BASE}/clubs/_global/site-images`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => {
        if (d.missionControl?.url && !d.missionControl.url.includes("images.unsplash.com")) {
          setMissionControlLogo(d.missionControl.url);
        }
      })
      .catch(() => {});
  }, []);

  // Cargar tablero operacional
  const fetchBoard = useCallback(async (silencioso = false) => {
    if (!silencioso) setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/mission-control/operational-board`, {
        headers: { Authorization: `Bearer ${token() || authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
        if (data.counts) setCounts(data.counts);
      }
    } catch (e) {
      console.error("Error cargando tablero operacional:", e);
    } finally {
      if (!silencioso) setIsLoading(false);
    }
  }, [authToken]);

  // Cargar campañas operativas
  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/mission-control/operational-campaigns`, {
        headers: { Authorization: `Bearer ${token() || authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (e) {
      console.error("Error cargando campañas operacionales:", e);
    }
  }, [authToken]);

  useEffect(() => {
    fetchBoard();
    fetchCampaigns();

    // Polling inteligente cada 4.5 segundos para reflejar avances en tiempo real
    const interval = setInterval(() => {
      fetchBoard(true);
      fetchCampaigns();
    }, 4500);

    return () => clearInterval(interval);
  }, [fetchBoard, fetchCampaigns]);

  // Sincronizar selección de destinos al abrir tarjeta
  useEffect(() => {
    if (selectedTask) {
      setTargetClubIds(selectedTask.destinations?.selectedClubIds || []);
      setPublishToDistrict(selectedTask.destinations?.publishToDistrict ?? true);
    }
  }, [selectedTask]);

  // Disparar automatizaciones pendientes
  const handleRunAutomations = async () => {
    setIsRunningAutomations(true);
    try {
      const res = await fetch(`${API_BASE}/mission-control/run-automations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token() || authToken}`,
        },
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "Automatizaciones ejecutadas con éxito.");
        await fetchBoard(true);
        await fetchCampaigns();
      } else {
        toast.error(data.error || "No se pudieron ejecutar las automatizaciones");
      }
    } catch (e: any) {
      toast.error(`Error de conexión: ${e?.message}`);
    } finally {
      setIsRunningAutomations(false);
    }
  };

  // Avanzar una tarea individual
  const handleAdvanceTask = async (task: OperationalTask, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const loadingToast = toast.loading(`Iniciando IA para «${task.title}»...`);
    try {
      const res = await fetch(`${API_BASE}/mission-control/tasks/${task.id}/advance`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token() || authToken}` },
      });
      const data = await res.json();
      toast.dismiss(loadingToast);
      if (res.ok) {
        toast.success("Etapa de IA iniciada correctamente.");
        await fetchBoard(true);
      } else {
        toast.error(data.error || "No se pudo avanzar la tarea");
      }
    } catch (e: any) {
      toast.dismiss(loadingToast);
      toast.error(`Error: ${e?.message}`);
    }
  };

  // Reintentar tarea con error
  const handleRetryTask = async (task: OperationalTask, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const loadingToast = toast.loading(`Reintentando etapa para «${task.title}»...`);
    try {
      const res = await fetch(`${API_BASE}/mission-control/tasks/${task.id}/retry`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token() || authToken}` },
      });
      const data = await res.json();
      toast.dismiss(loadingToast);
      if (res.ok) {
        toast.success("Etapa reiniciada.");
        await fetchBoard(true);
      } else {
        toast.error(data.error || "No se pudo reintentar");
      }
    } catch (e: any) {
      toast.dismiss(loadingToast);
      toast.error(`Error: ${e?.message}`);
    }
  };

  // Aprobar y publicar
  const handleApproveAndPublish = async (publishImmediate = true) => {
    if (!selectedTask) return;
    setIsPublishing(true);

    try {
      const res = await fetch(`${API_BASE}/mission-control/tasks/${selectedTask.id}/approve-publish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token() || authToken}`,
        },
        body: JSON.stringify({
          campaignId: selectedTask.campaignId,
          targetClubIds,
          publishToDistrict,
          publish: publishImmediate,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(
          publishImmediate
            ? `¡Contenido aprobado y publicado con éxito!`
            : "Contenido guardado como borrador aprobado."
        );
        setSelectedTask(null);
        await fetchBoard(true);
        await fetchCampaigns();
      } else {
        toast.error(data.error || "Error al procesar la aprobación");
      }
    } catch (e: any) {
      toast.error(`Error de red: ${e?.message}`);
    } finally {
      setIsPublishing(false);
    }
  };

  // Filtrado de tareas
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (selectedCampaignId !== "all" && t.campaignId !== selectedCampaignId) return false;
      if (selectedAgentId !== "all" && t.assignedAgent?.id !== selectedAgentId) return false;
      if (onlyErrors && !t.isError) return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchTitle = t.title?.toLowerCase().includes(query);
        const matchClub = t.club?.toLowerCase().includes(query);
        const matchCampaign = t.campaignName?.toLowerCase().includes(query);
        const matchSender = t.senderName?.toLowerCase().includes(query);
        if (!matchTitle && !matchClub && !matchCampaign && !matchSender) return false;
      }

      return true;
    });
  }, [tasks, selectedCampaignId, selectedAgentId, onlyErrors, searchQuery]);

  // Columnas Kanban
  const boardCols = {
    entradas: {
      id: "entradas",
      title: "ENTRADAS",
      subtitle: "Nuevos aportes recibidos",
      icon: "📥",
      tasks: filteredTasks.filter((t) => t.column === "entradas"),
      badgeColor: "bg-sky-50 text-sky-700 border-sky-200",
    },
    en_proceso: {
      id: "en_proceso",
      title: "EN PROCESO",
      subtitle: "IA analizando y redactando",
      icon: "🤖",
      tasks: filteredTasks.filter((t) => t.column === "en_proceso"),
      badgeColor: "bg-blue-50 text-[#013388] border-blue-200",
    },
    por_aprobar: {
      id: "por_aprobar",
      title: "POR APROBAR",
      subtitle: "Borradores listos para revisión",
      icon: "👤",
      tasks: filteredTasks.filter((t) => t.column === "por_aprobar"),
      badgeColor: "bg-amber-50 text-amber-800 border-amber-300 ring-2 ring-amber-200/50",
    },
    programado: {
      id: "programado",
      title: "PROGRAMADO",
      subtitle: "Emisión diferida",
      icon: "🕒",
      tasks: filteredTasks.filter((t) => t.column === "programado"),
      badgeColor: "bg-purple-50 text-purple-700 border-purple-200",
    },
    publicado: {
      id: "publicado",
      title: "PUBLICADO / COMPLETADO",
      subtitle: "Distribuido en sitios",
      icon: "✅",
      tasks: filteredTasks.filter((t) => t.column === "publicado"),
      badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
  };

  return (
    <div className="fixed inset-0 bg-[#F1F5F9] text-gray-800 font-sans z-[9999] overflow-hidden flex flex-col">
      {/* ── BARRA SUPERIOR INSTITUCIONAL ── */}
      <div className="h-14 bg-[#013388] px-4 flex items-center justify-between shadow-md shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-2">
          {missionControlLogo ? (
            <img
              src={missionControlLogo}
              alt="Club Platform"
              className="h-8 w-auto object-contain mr-3 shrink-0"
            />
          ) : (
            <span className="text-[11px] font-black text-white/90 uppercase tracking-widest mr-3 shrink-0 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" /> Centro de Control
            </span>
          )}

          <div className="h-4 w-[1px] bg-white/20 mx-2 hidden sm:block shrink-0" />
          <span className="text-[10px] font-black text-white/50 uppercase tracking-widest mr-2 shrink-0">
            Escuadrón IA:
          </span>

          {AGENTS_LIST.map((agent) => (
            <button
              key={agent.id}
              onClick={() => setSelectedAgentId(selectedAgentId === agent.id ? "all" : agent.id)}
              className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border transition-all shrink-0 ${
                selectedAgentId === agent.id
                  ? "bg-white text-gray-900 border-white shadow-sm"
                  : "bg-black/20 hover:bg-black/30 border-white/10 text-white"
              }`}
              title={`${agent.name} — ${agent.role}`}
            >
              <span className="text-xs">{agent.icon}</span>
              <span className="text-[11px] font-bold">{agent.name}</span>
              <span
                className={`w-2 h-2 rounded-full ${
                  agent.status === "online" ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleRunAutomations}
            disabled={isRunningAutomations}
            className="bg-amber-500 hover:bg-amber-400 text-amber-950 font-black px-3.5 py-1.5 rounded-lg flex items-center gap-2 text-xs transition-all shadow-md disabled:opacity-50"
          >
            {isRunningAutomations ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            <span>EJECUTAR AUTOMATIZACIONES ⚡</span>
          </button>

          <button
            onClick={() => navigate(-1)}
            className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-all"
            title="Cerrar Centro de Control"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── BARRA DE CONTADORES OPERACIONALES ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-2.5 flex items-center justify-between shadow-xs shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide text-xs font-semibold">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gray-100 text-gray-700">
            <span>Total procesos:</span>
            <span className="font-black text-gray-900">{counts.total}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-sky-50 text-sky-800 border border-sky-100">
            <span>📥 Entradas:</span>
            <span className="font-black">{counts.entradas}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-50 text-[#013388] border border-blue-100">
            <span>🤖 En Proceso:</span>
            <span className="font-black">{counts.en_proceso}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 font-bold">
            <span>👤 Por Aprobar:</span>
            <span className="font-black text-amber-700">{counts.por_aprobar}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-purple-50 text-purple-800 border border-purple-100">
            <span>🕒 Programadas:</span>
            <span className="font-black">{counts.programado}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-100">
            <span>✅ Publicadas:</span>
            <span className="font-black">{counts.publicado}</span>
          </div>

          {counts.errores > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-50 text-rose-800 border border-rose-200">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              <span>Errores:</span>
              <span className="font-black text-rose-700">{counts.errores}</span>
            </div>
          )}
        </div>

        {/* CONTROLES DE VISTA */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setOnlyErrors((v) => !v)}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
              onlyErrors
                ? "bg-rose-100 text-rose-800 border-rose-300"
                : "bg-gray-50 hover:bg-gray-100 text-gray-600 border-gray-200"
            }`}
          >
            {onlyErrors ? "Mostrando solo errores" : "Filtrar errores"}
          </button>

          <button
            onClick={() => setShowCovers((v) => !v)}
            className={`p-1.5 rounded-lg border text-xs font-bold transition-all ${
              showCovers ? "bg-blue-50 text-rotary-blue border-blue-200" : "bg-white text-gray-400 border-gray-200"
            }`}
            title={showCovers ? "Ocultar portadas" : "Mostrar portadas"}
          >
            <ImageIcon className="w-4 h-4" />
          </button>

          <div className="flex items-center bg-gray-100 p-0.5 rounded-lg border border-gray-200">
            <button
              onClick={() => setViewDensity("compact")}
              className={`p-1 rounded ${viewDensity === "compact" ? "bg-white shadow-xs text-[#013388]" : "text-gray-400"}`}
              title="Vista compacta"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewDensity("normal")}
              className={`p-1 rounded ${viewDensity === "normal" ? "bg-white shadow-xs text-[#013388]" : "text-gray-400"}`}
              title="Vista estándar"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={() => fetchBoard()}
            className="p-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200"
            title="Actualizar tablero"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── CUERPO PRINCIPAL ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* PANEL LATERAL: CAMPAÑAS & OBJETIVOS OPERATIVOS */}
        <div className="w-[300px] border-r border-gray-200 bg-white flex flex-col shrink-0">
          <div className="p-3.5 flex items-center justify-between border-b border-gray-100 uppercase">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-[#013388]" />
              <span className="text-[11px] font-black text-gray-500 tracking-wider">
                Campañas Activas
              </span>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#013388]">
              {campaigns.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            <div
              onClick={() => setSelectedCampaignId("all")}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                selectedCampaignId === "all"
                  ? "bg-blue-50/70 border-[#013388] shadow-xs ring-1 ring-[#013388]/20"
                  : "bg-white border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-900">Todas las campañas</span>
                <span className="text-[10px] font-semibold text-gray-500">{tasks.length} tareas</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">Supervisión transversal global</p>
            </div>

            {campaigns.map((camp) => (
              <div
                key={camp.id}
                onClick={() => setSelectedCampaignId(selectedCampaignId === camp.id ? "all" : camp.id)}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  selectedCampaignId === camp.id
                    ? "bg-blue-50/80 border-[#013388] shadow-xs ring-2 ring-[#013388]/10"
                    : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-xs"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <h4 className="text-xs font-bold text-gray-900 leading-snug line-clamp-2">
                    {camp.title}
                  </h4>
                  <span className="bg-emerald-50 text-emerald-700 text-[9px] font-black px-1.5 py-0.5 rounded uppercase shrink-0">
                    Activa
                  </span>
                </div>

                <div className="space-y-1.5 mt-2">
                  <div className="flex items-center justify-between text-[10px] text-gray-500 font-semibold">
                    <span>Progreso publicación</span>
                    <span className="font-bold text-gray-700">{camp.progress}%</span>
                  </div>

                  <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-700"
                      style={{ width: `${camp.progress}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-gray-500 pt-1">
                    <span>{camp.total} recibidas</span>
                    <span>{camp.published} publicadas</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* KANBAN BOARD A ANCHO COMPLETO */}
        <div className="flex-1 bg-[#F8FAFC] flex flex-col overflow-hidden">
          {/* BUSCADOR */}
          <div className="p-3 border-b border-gray-200 bg-white/80 backdrop-blur-xs flex items-center justify-between gap-4 shrink-0">
            <div className="relative flex-1 max-w-lg">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por club, remitente, campaña o título..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg outline-none focus:bg-white focus:border-[#013388]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>Mostrando <b>{filteredTasks.length}</b> de {tasks.length} procesos</span>
            </div>
          </div>

          {/* TABLERO KANBAN DE 5 COLUMNAS */}
          <div className="flex-1 overflow-x-auto p-4 flex gap-4 items-start">
            {Object.values(boardCols).map((col) => (
              <div
                key={col.id}
                className="w-80 shrink-0 bg-gray-100/70 rounded-2xl border border-gray-200/80 flex flex-col max-h-full shadow-xs"
              >
                {/* ENCABEZADO DE COLUMNA */}
                <div className="p-3.5 border-b border-gray-200 bg-white/60 rounded-t-2xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{col.icon}</span>
                    <div>
                      <h3 className="text-xs font-black text-gray-800 tracking-wider">
                        {col.title}
                      </h3>
                      <p className="text-[10px] text-gray-500">{col.subtitle}</p>
                    </div>
                  </div>

                  <span className={`text-[11px] font-black px-2 py-0.5 rounded-full border ${col.badgeColor}`}>
                    {col.tasks.length}
                  </span>
                </div>

                {/* LISTA DE TARJETAS */}
                <div className="p-2.5 overflow-y-auto space-y-2.5 flex-1 min-h-[150px]">
                  {col.tasks.length === 0 ? (
                    <div className="h-32 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center text-gray-400 text-xs">
                      <span>Sin procesos en cola</span>
                    </div>
                  ) : (
                    col.tasks.map((task) => (
                      <div
                        key={task.id}
                        onClick={() => setSelectedTask(task)}
                        className={`bg-white rounded-xl border p-3.5 shadow-xs hover:shadow-md transition-all cursor-pointer group ${
                          task.isError
                            ? "border-rose-300 ring-1 ring-rose-200"
                            : task.column === "por_aprobar"
                            ? "border-amber-300 hover:border-amber-400 hover:ring-2 hover:ring-amber-200/50"
                            : "border-gray-200 hover:border-[#013388]/40"
                        }`}
                      >
                        {/* PORTADA EN MINIATURA */}
                        {showCovers && task.media.coverUrl && (
                          <div className="w-full h-24 mb-2.5 rounded-lg overflow-hidden bg-gray-100 border border-gray-100">
                            <img
                              src={task.media.coverUrl}
                              alt=""
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          </div>
                        )}

                        {/* BADGES SUPERIORES */}
                        <div className="flex items-center justify-between gap-1.5 mb-2">
                          <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 truncate">
                            {task.club || "Club Rotario"}
                          </span>

                          {task.isError ? (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 shrink-0">
                              <AlertCircle className="w-3 h-3 text-rose-600" /> Error
                            </span>
                          ) : task.working ? (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-[#013388] border border-blue-200 flex items-center gap-1 shrink-0">
                              <Loader2 className="w-3 h-3 animate-spin text-[#013388]" /> IA activa
                            </span>
                          ) : task.column === "por_aprobar" ? (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1 shrink-0">
                              👤 Por aprobar
                            </span>
                          ) : task.column === "publicado" ? (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1 shrink-0">
                              ✅ En línea
                            </span>
                          ) : null}
                        </div>

                        {/* TÍTULO */}
                        <h4 className="text-xs font-bold text-gray-900 leading-snug line-clamp-2 mb-1.5 group-hover:text-[#013388] transition-colors">
                          {task.title}
                        </h4>

                        {/* EXTRACTO O CAMPAÑA */}
                        <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed mb-3">
                          {task.article?.excerpt || task.subtitle}
                        </p>

                        {/* METADATOS Y DESTINOS */}
                        <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-500">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs">{task.assignedAgent?.icon}</span>
                            <span className="font-semibold">{task.assignedAgent?.name}</span>
                          </div>

                          <div className="flex items-center gap-2 font-medium">
                            {task.media.imageCount > 0 && (
                              <span className="flex items-center gap-0.5">
                                <ImageIcon className="w-3 h-3 text-gray-400" /> {task.media.imageCount}
                              </span>
                            )}
                            <span className="text-gray-400">·</span>
                            <span>{new Date(task.date).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</span>
                          </div>
                        </div>

                        {/* RESUMEN DE DESTINOS */}
                        {task.destinations?.suggested?.length > 0 && (
                          <div className="mt-2 text-[10px] text-gray-500 bg-gray-50 p-1.5 rounded-lg flex items-center gap-1">
                            <Globe className="w-3 h-3 text-[#013388] shrink-0" />
                            <span className="truncate">
                              {task.destinations.suggested.length} destino(s) de difusión
                            </span>
                          </div>
                        )}

                        {/* ACCIONES RÁPIDAS EN LA TARJETA */}
                        <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
                          {task.column === "entradas" && (
                            <button
                              onClick={(e) => handleAdvanceTask(task, e)}
                              className="w-full py-1.5 bg-[#013388] hover:bg-[#002266] text-white text-[10px] font-black rounded-lg flex items-center justify-center gap-1 transition-colors"
                            >
                              <Sparkles className="w-3 h-3 text-amber-400" /> GENERAR ARTÍCULO IA
                            </button>
                          )}

                          {task.column === "en_proceso" && (
                            <div className="w-full py-1 text-center text-[10px] text-[#013388] font-bold flex items-center justify-center gap-1.5 bg-blue-50 rounded-lg">
                              <Loader2 className="w-3 h-3 animate-spin" /> Procesando etapas...
                            </div>
                          )}

                          {task.column === "por_aprobar" && (
                            <div className="w-full flex items-center gap-1.5">
                              <button
                                onClick={() => setSelectedTask(task)}
                                className="flex-1 py-1.5 bg-amber-500 hover:bg-amber-600 text-amber-950 font-black text-[10px] rounded-lg text-center transition-colors"
                              >
                                REVISAR Y APROBAR
                              </button>
                            </div>
                          )}

                          {task.column === "publicado" && task.article?.publicUrl && (
                            <a
                              href={task.article.publicUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="w-full py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[10px] font-black rounded-lg flex items-center justify-center gap-1 transition-colors border border-emerald-200"
                            >
                              <ExternalLink className="w-3 h-3" /> VER PUBLICACIÓN
                            </a>
                          )}

                          {task.isError && (
                            <button
                              onClick={(e) => handleRetryTask(task, e)}
                              className="w-full py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black rounded-lg flex items-center justify-center gap-1 transition-colors"
                            >
                              <RefreshCw className="w-3 h-3" /> REINTENTAR ETAPA
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── MODAL / DRAWER DE REVISIÓN Y APROBACIÓN EDITORIAL ── */}
      {selectedTask && (
        <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* ENCABEZADO MODAL */}
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-xl">{selectedTask.assignedAgent?.icon}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-blue-100 text-[#013388] uppercase">
                      {selectedTask.campaignName}
                    </span>
                    <span className="text-xs text-gray-500">
                      {selectedTask.club || "Club Rotario"}
                    </span>
                  </div>
                  <h3 className="text-sm font-black text-gray-900 mt-0.5">
                    {selectedTask.title}
                  </h3>
                </div>
              </div>

              <button
                onClick={() => setSelectedTask(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* CONTENIDO MODAL EN 2 COLUMNAS */}
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* COLUMNA 1 & 2: CONTENIDO EDITORIAL & ORIGINAL */}
              <div className="md:col-span-2 space-y-5">
                {/* PORTADA Y TITULAR GENERADO */}
                <div className="rounded-xl border border-gray-200 p-4 bg-white shadow-xs">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-2">
                    Artículo Generado por IA (Borrador)
                  </span>

                  {selectedTask.media.coverUrl && (
                    <div className="w-full h-44 rounded-lg overflow-hidden mb-3 bg-gray-100">
                      <img
                        src={selectedTask.media.coverUrl}
                        alt="Portada"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  <h2 className="text-base font-bold text-gray-900 mb-2">
                    {selectedTask.article?.title || selectedTask.title}
                  </h2>

                  {selectedTask.article?.excerpt && (
                    <p className="text-xs text-gray-600 italic bg-gray-50 p-2.5 rounded-lg border border-gray-100 mb-3">
                      {selectedTask.article.excerpt}
                    </p>
                  )}

                  {selectedTask.article?.category && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="font-bold text-gray-700">Categoría:</span>
                      <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-semibold">
                        {selectedTask.article.category}
                      </span>
                    </div>
                  )}
                </div>

                {/* INFORMACIÓN NO SUMINISTRADA O VERACIDAD */}
                {(selectedTask.article?.missingInfo?.length || selectedTask.article?.copyIssues?.length) ? (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-900 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-amber-800 mb-1">
                      <ShieldCheck className="w-4 h-4 text-amber-600" />
                      <span>Evaluación de Veracidad & Datos</span>
                    </div>
                    {selectedTask.article?.missingInfo && selectedTask.article.missingInfo.length > 0 && (
                      <p>
                        <b>Datos no suministrados:</b>{" "}
                        {selectedTask.article.missingInfo.map((m) => m.label).join(", ")}.
                      </p>
                    )}
                    {selectedTask.article?.copyIssues && selectedTask.article.copyIssues.length > 0 && (
                      <p>
                        <b>Aviso de redacción:</b> {selectedTask.article.copyIssues.join(" ")}
                      </p>
                    )}
                  </div>
                ) : null}

                {/* MATERIAL ORIGINAL DEL FORMULARIO */}
                <div className="rounded-xl border border-gray-200 p-4 bg-gray-50">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-2">
                    Material Original Enviado
                  </span>

                  <div className="text-xs text-gray-600 space-y-1.5 mb-3">
                    <p>
                      <b>Remitente:</b> {selectedTask.senderName || "No registrado"} (
                      {selectedTask.senderEmail})
                    </p>
                    {selectedTask.senderPhone && (
                      <p>
                        <b>Teléfono:</b> {selectedTask.senderPhone}
                      </p>
                    )}
                    {selectedTask.activityDate && (
                      <p>
                        <b>Fecha de la actividad:</b> {selectedTask.activityDate}
                      </p>
                    )}
                  </div>

                  <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed bg-white p-3 rounded-lg border border-gray-200">
                    {selectedTask.subtitle}
                  </p>
                </div>
              </div>

              {/* COLUMNA 3: DESTINOS DE DISTRIBUCIÓN & ACCIONES */}
              <div className="space-y-5">
                {/* MATRIZ DE DESTINOS */}
                <div className="rounded-xl border border-gray-200 p-4 bg-white shadow-xs">
                  <div className="flex items-center gap-1.5 text-xs font-black text-gray-900 uppercase tracking-wider mb-2">
                    <Globe className="w-4 h-4 text-[#013388]" />
                    <span>Publicar en los destinos:</span>
                  </div>

                  <p className="text-[11px] text-gray-500 mb-3">
                    Selecciona los sitios donde este contenido estará visible al aprobar:
                  </p>

                  <div className="space-y-2">
                    {selectedTask.destinations?.suggested?.map((dest) => {
                      const isChecked = targetClubIds.includes(dest.id);
                      return (
                        <label
                          key={dest.id}
                          className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                            isChecked
                              ? "bg-blue-50/70 border-[#013388]"
                              : "bg-gray-50 border-gray-200 opacity-60"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setTargetClubIds([...targetClubIds, dest.id]);
                              } else {
                                setTargetClubIds(targetClubIds.filter((id) => id !== dest.id));
                              }
                            }}
                            className="mt-0.5 rounded text-[#013388] focus:ring-[#013388]"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="text-xs font-bold text-gray-900 block truncate">
                              {dest.name}
                            </span>
                            <span className="text-[10px] text-gray-500 block">
                              {dest.typeLabel} {dest.domain ? `· ${dest.domain}` : ""}
                            </span>
                          </div>
                        </label>
                      );
                    })}

                    <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-gray-200 bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={publishToDistrict}
                        onChange={(e) => setPublishToDistrict(e.target.checked)}
                        className="rounded text-[#013388] focus:ring-[#013388]"
                      />
                      <span className="text-xs font-bold text-gray-800">
                        Difundir en sede del Distrito
                      </span>
                    </label>
                  </div>
                </div>

                {/* ACCIONES EDITORIALES */}
                <div className="space-y-2.5 pt-2">
                  <button
                    onClick={() => handleApproveAndPublish(true)}
                    disabled={isPublishing}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
                  >
                    {isPublishing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    <span>APROBAR Y PUBLICAR</span>
                  </button>

                  <button
                    onClick={() => handleApproveAndPublish(false)}
                    disabled={isPublishing}
                    className="w-full py-2 bg-white hover:bg-gray-50 text-gray-700 font-bold text-xs rounded-xl border border-gray-300 transition-all"
                  >
                    Guardar como borrador aprobado
                  </button>

                  {selectedTask.article?.postId && (
                    <Link
                      to={`/admin/noticias?post=${selectedTask.article.postId}`}
                      className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Editar en Noticias
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MissionControlVIP;
