import React, { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
  Settings,
  Sliders,
  Cpu,
  Bot,
  CheckCircle2,
  Info,
  BookOpen,
  Video,
  Film,
  Share2,
  Play,
  FileText,
  Download,
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

export interface ReelAuditItem {
  fileId: string;
  filename: string;
  url?: string | null;
  isRealPhoto: boolean;
  classification: string;
  reason: string;
  isSelectedForReel: boolean;
  dimensions?: { width: number; height: number };
  aspectRatio?: number;
}

export interface ReelAudit {
  totalImages: number;
  realPhotoCount: number;
  graphicCount: number;
  isOptimal: boolean;
  minOptimalThreshold: number;
  status: 'optimo' | 'requiere_mapeo' | 'sin_fotografias';
  statusBadge: { label: string; color: string; type: string };
  statusDetail: string;
  items: ReelAuditItem[];
  selectedPhotoIds: string[];
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
  activationCampaignId?: string | null;
  contentType?: string | null;
  program?: string | null;
  areaFocus?: string | null;
  priority?: string | null;
  date: string;
  activityDate?: string;
  column: 'entradas' | 'en_proceso' | 'por_aprobar' | 'reels' | 'redes' | 'programado' | 'publicado';
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
  reelAudit?: ReelAudit;
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
  reel?: {
    id: string | null;
    versionNumber: number;
    status: string;
    statusDetail?: string;
    reelProjectId?: string | null;
    creditsEstimated?: number;
    generatedAt?: string | null;
    lastError?: string | null;
    videoUrl?: string | null;
    posterUrl?: string | null;
    durationSec?: number | null;
    projectStatus?: string | null;
    auditStatus?: string;
    isOptimal?: boolean;
    realPhotoCount?: number;
    graphicCount?: number;
    auditDetail?: string;
  } | null;
  social?: {
    distributions: Array<{
      network: string;
      status: string;
      externalUrl?: string;
      createdAt?: string;
      error?: string;
    }>;
    facebook?: { status: string; externalUrl?: string; createdAt?: string } | null;
    x?: { status: string; externalUrl?: string; createdAt?: string } | null;
    hasFacebook: boolean;
    hasX: boolean;
    isFullyShared: boolean;
  };
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
  publicationProgress?: number;
  productionProgress?: number;
  total: number;
  published: number;
  inProgress: number;
  readyApproval: number;
  assignedAgents: string[];
  isPermanent?: boolean;
  kind?: string;
  activationId?: string;
}

const AGENTS_LIST = [
  { id: "rafael", name: "Rafael", role: "Redacción & Copywriting", icon: "🤖", color: "bg-blue-600", status: "online" },
  { id: "mateo", name: "Mateo", role: "Edición & Calidad Editorial", icon: "🍷", color: "bg-rose-600", status: "online" },
  { id: "valentina", name: "Valentina", role: "Curaduría & Multimedia", icon: "🎨", color: "bg-amber-500", status: "busy" },
  { id: "camila", name: "Camila", role: "Video Vertical & Reels IA", icon: "🎬", color: "bg-rose-600", status: "online" },
  { id: "lucas", name: "Lucas", role: "Difusión Fanpage & X", icon: "📢", color: "bg-sky-600", status: "online" },
  { id: "sofia", name: "Sofía", role: "SEO & Posicionamiento", icon: "⚔️", color: "bg-indigo-600", status: "online" },
  { id: "andres", name: "Andrés", role: "Distribución Omnicanal", icon: "🐉", color: "bg-emerald-600", status: "online" },
  { id: "diego", name: "Diego", role: "Diagnóstico & Datos", icon: "🐺", color: "bg-slate-700", status: "idle" },
];

export const MissionControlVIP: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlSubmissionId = searchParams.get("submissionId") || searchParams.get("task");
  const { token: authToken } = useAuth();

  const [tasks, setTasks] = useState<OperationalTask[]>([]);
  const [campaigns, setCampaigns] = useState<OperationalCampaign[]>([]);
  const [counts, setCounts] = useState({
    total: 0,
    por_aprobar: 0,
    entradas: 0,
    en_proceso: 0,
    reels: 0,
    redes: 0,
    programado: 0,
    publicado: 0,
    errores: 0,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isRunningAutomations, setIsRunningAutomations] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<OperationalTask | null>(null);
  const [modalTab, setModalTab] = useState<'articulo' | 'reel' | 'redes'>('articulo');
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

  // Helper seguro para procesar JSON sin fallar si el servidor devuelve HTML o texto
  const safeJson = async (res: Response) => {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      return await res.json();
    }
    const text = await res.text();
    throw new Error(`Respuesta no válida del servidor (${res.status}): ${text.slice(0, 120)}`);
  };

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
        const data = await safeJson(res);
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
        const data = await safeJson(res);
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

  // Sincronización automática de tarea solicitada por URL (trazabilidad inter-módulo)
  useEffect(() => {
    if (urlSubmissionId && tasks.length > 0) {
      const match = tasks.find((t) => t.id === urlSubmissionId);
      if (match) {
        setSelectedTask(match);
      }
    }
  }, [urlSubmissionId, tasks]);

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
      const data = await safeJson(res);
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
      const data = await safeJson(res);
      toast.dismiss(loadingToast);
      if (res.ok) {
        toast.success("Etapa de IA ejecutada correctamente.");
        await fetchBoard(true);
        await fetchCampaigns();
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
      const data = await safeJson(res);
      toast.dismiss(loadingToast);
      if (res.ok) {
        toast.success("Etapa reiniciada.");
        await fetchBoard(true);
        await fetchCampaigns();
      } else {
        toast.error(data.error || "No se pudo reintentar");
      }
    } catch (e: any) {
      toast.dismiss(loadingToast);
      toast.error(`Error: ${e?.message}`);
    }
  };

  // Generar o avanzar Reel vertical 9:16
  const handleGenerateReel = async (task: OperationalTask, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const loadingToast = toast.loading(`Iniciando motor de Reels para «${task.title}»...`);
    try {
      const res = await fetch(`${API_BASE}/mission-control/tasks/${task.id}/generate-reel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token() || authToken}` },
      });
      const data = await safeJson(res);
      toast.dismiss(loadingToast);
      if (res.ok) {
        toast.success("🎬 Producción de Reel 9:16 en marcha (Kling/Luma con las fotografías adjuntas).");
        await fetchBoard(true);
        await fetchCampaigns();
      } else {
        toast.error(data.error || "No se pudo iniciar la generación del Reel");
      }
    } catch (e: any) {
      toast.dismiss(loadingToast);
      toast.error(`Error al generar Reel: ${e?.message}`);
    }
  };

  // Difundir artículo en redes (Facebook Fanpage & X)
  const handleShareSocial = async (task: OperationalTask, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const loadingToast = toast.loading(`Difundiendo «${task.title}» en Fanpage y X...`);
    try {
      const res = await fetch(`${API_BASE}/mission-control/tasks/${task.id}/share-social`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token() || authToken}`,
        },
        body: JSON.stringify({
          networks: ['facebook', 'x'],
        }),
      });
      const data = await safeJson(res);
      toast.dismiss(loadingToast);
      if (res.ok) {
        toast.success("📢 Artículo de blog difundido con éxito en las redes sociales conectadas.");
        await fetchBoard(true);
        await fetchCampaigns();
      } else {
        toast.error(data.error || "No se pudo completar la difusión en redes");
      }
    } catch (e: any) {
      toast.dismiss(loadingToast);
      toast.error(`Error al difundir en redes: ${e?.message}`);
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

      const data = await safeJson(res);
      if (res.ok) {
        toast.success(
          publishImmediate
            ? `¡Contenido aprobado y publicado! Se avanzó automáticamente a la etapa de Generación de Reels.`
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
      if (selectedCampaignId !== "all") {
        if (selectedCampaignId.startsWith("activation:")) {
          const actId = selectedCampaignId.replace("activation:", "");
          if (t.activationCampaignId !== actId) return false;
        } else if (t.campaignId !== selectedCampaignId) {
          return false;
        }
      }
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

  // Columnas Kanban - ¡POR APROBAR va de primero por máxima prioridad operacional ejecutiva!
  const boardCols = {
    por_aprobar: {
      id: "por_aprobar",
      title: "POR APROBAR",
      subtitle: "Borradores listos para revisión y publicación",
      icon: "👤",
      tasks: filteredTasks.filter((t) => t.column === "por_aprobar"),
      badgeColor: "bg-amber-100 text-amber-900 border-amber-300 ring-2 ring-amber-300/40",
      isPrimary: true,
    },
    entradas: {
      id: "entradas",
      title: "ENTRADAS",
      subtitle: "Nuevos aportes recibidos (mín. 5 fotos)",
      icon: "📥",
      tasks: filteredTasks.filter((t) => t.column === "entradas"),
      badgeColor: "bg-sky-50 text-sky-700 border-sky-200",
      isPrimary: false,
    },
    en_proceso: {
      id: "en_proceso",
      title: "EN PROCESO",
      subtitle: "IA analizando y redactando",
      icon: "🤖",
      tasks: filteredTasks.filter((t) => t.column === "en_proceso"),
      badgeColor: "bg-blue-50 text-[#013388] border-blue-200",
      isPrimary: false,
    },
    reels: {
      id: "reels",
      title: "GENERACIÓN DE REELS",
      subtitle: "Video vertical 9:16 (IG, TikTok, Shorts)",
      icon: "🎬",
      tasks: filteredTasks.filter((t) => t.column === "reels"),
      badgeColor: "bg-pink-50 text-pink-700 border-pink-200",
      isPrimary: false,
    },
    redes: {
      id: "redes",
      title: "DIFUSIÓN EN REDES",
      subtitle: "Facebook Fanpage y X",
      icon: "📢",
      tasks: filteredTasks.filter((t) => t.column === "redes"),
      badgeColor: "bg-indigo-50 text-indigo-700 border-indigo-200",
      isPrimary: false,
    },
    programado: {
      id: "programado",
      title: "PROGRAMADO",
      subtitle: "Emisión diferida",
      icon: "🕒",
      tasks: filteredTasks.filter((t) => t.column === "programado"),
      badgeColor: "bg-purple-50 text-purple-700 border-purple-200",
      isPrimary: false,
    },
    publicado: {
      id: "publicado",
      title: "PUBLICADO / COMPLETADO",
      subtitle: "Distribuido en sitios y redes",
      icon: "✅",
      tasks: filteredTasks.filter((t) => t.column === "publicado"),
      badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
      isPrimary: false,
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

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => setShowRulesModal(true)}
            className="bg-white/10 hover:bg-white/20 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs transition-all border border-white/15"
            title="Ajustes y reglas de las automatizaciones"
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden md:inline">REGLAS & AJUSTES</span>
          </button>

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

          {/* Por Aprobar prioritario en primer lugar */}
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold border transition-all ${
            counts.por_aprobar > 0
              ? "bg-amber-100/90 text-amber-900 border-amber-300 ring-2 ring-amber-300/40 shadow-xs"
              : "bg-amber-50 text-amber-900 border-amber-200"
          }`}>
            <span>👤 Por Aprobar:</span>
            <span className="font-black text-amber-800">{counts.por_aprobar}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-sky-50 text-sky-800 border border-sky-100">
            <span>📥 Entradas:</span>
            <span className="font-black">{counts.entradas}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-50 text-[#013388] border border-blue-100">
            <span>🤖 En Proceso:</span>
            <span className="font-black">{counts.en_proceso}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-pink-50 text-pink-800 border border-pink-100">
            <span>🎬 Reels IA:</span>
            <span className="font-black">{counts.reels}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-100">
            <span>📢 Redes:</span>
            <span className="font-black">{counts.redes}</span>
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
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-gray-900 leading-snug line-clamp-2">
                      {camp.title}
                    </h4>
                    {camp.isPermanent && (
                      <span className="inline-block mt-1 bg-[#013388] text-amber-300 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                        INSTITUCIONAL · PERMANENTE
                      </span>
                    )}
                    {camp.kind === 'subcampaign' && (
                      <span className="inline-block mt-1 bg-violet-100 text-violet-800 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                        SUBCAMPAÑA ACTIVA
                      </span>
                    )}
                  </div>
                  <span className="bg-emerald-50 text-emerald-700 text-[9px] font-black px-1.5 py-0.5 rounded uppercase shrink-0">
                    Activa
                  </span>
                </div>

                <div className="space-y-2 mt-2 pt-1 border-t border-gray-100">
                  {/* Progreso de Publicación Efectiva */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-gray-500 font-semibold mb-1">
                      <span>Progreso publicación</span>
                      <span className="font-bold text-gray-700">{camp.publicationProgress ?? camp.progress}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-700"
                        style={{ width: `${camp.publicationProgress ?? camp.progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Progreso de Producción y Redacción */}
                  {camp.productionProgress !== undefined && (
                    <div>
                      <div className="flex items-center justify-between text-[10px] text-gray-400 font-medium mb-1">
                        <span>Progreso producción</span>
                        <span className="font-semibold text-gray-600">{camp.productionProgress}%</span>
                      </div>
                      <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all duration-700"
                          style={{ width: `${camp.productionProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-gray-500 pt-0.5">
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
                <div className={`p-3.5 border-b rounded-t-2xl flex items-center justify-between ${
                  col.id === "por_aprobar"
                    ? "bg-amber-50/90 border-amber-200"
                    : "bg-white/60 border-gray-200"
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{col.icon}</span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className={`text-xs font-black tracking-wider ${
                          col.id === "por_aprobar" ? "text-amber-900" : "text-gray-800"
                        }`}>
                          {col.title}
                        </h3>
                        {col.id === "por_aprobar" && (
                          <span className="text-[9px] font-black uppercase tracking-wider bg-amber-500 text-white px-1.5 py-0.2 rounded shadow-2xs">
                            Prioridad
                          </span>
                        )}
                      </div>
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
                        onClick={() => {
                          setSelectedTask(task);
                          if (task.column === "reels") setModalTab("reel");
                          else if (task.column === "redes") setModalTab("redes");
                          else setModalTab("articulo");
                        }}
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
                          ) : task.column === "reels" ? (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-pink-50 text-pink-800 border border-pink-200 flex items-center gap-1 shrink-0">
                              🎬 Reel {task.reel?.status || "en cola"}
                            </span>
                          ) : task.column === "redes" ? (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 flex items-center gap-1 shrink-0">
                              📢 Difusión
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
                                onClick={() => {
                                  setSelectedTask(task);
                                  setModalTab("articulo");
                                }}
                                className="flex-1 py-1.5 bg-amber-500 hover:bg-amber-600 text-amber-950 font-black text-[10px] rounded-lg text-center transition-colors"
                              >
                                REVISAR Y APROBAR
                              </button>
                            </div>
                          )}

                          {task.column === "reels" && (
                            <div className="w-full flex items-center gap-1.5">
                              {task.reel?.videoUrl ? (
                                <button
                                  onClick={() => {
                                    setSelectedTask(task);
                                    setModalTab("reel");
                                  }}
                                  className="w-full py-1.5 bg-pink-600 hover:bg-pink-700 text-white text-[10px] font-black rounded-lg flex items-center justify-center gap-1 transition-colors shadow-xs"
                                >
                                  <Film className="w-3 h-3" /> VER REEL VERTICAL
                                </button>
                              ) : (
                                <button
                                  onClick={(e) => handleGenerateReel(task, e)}
                                  className="w-full py-1.5 bg-pink-600 hover:bg-pink-700 text-white text-[10px] font-black rounded-lg flex items-center justify-center gap-1 transition-colors shadow-xs"
                                >
                                  <Video className="w-3 h-3 text-pink-200" /> GENERAR REEL (5 FOTOS)
                                </button>
                              )}
                            </div>
                          )}

                          {task.column === "redes" && (
                            <button
                              onClick={(e) => handleShareSocial(task, e)}
                              className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black rounded-lg flex items-center justify-center gap-1 transition-colors shadow-xs"
                            >
                              <Share2 className="w-3 h-3 text-indigo-200" /> DIFUNDIR EN FANPAGE & X
                            </button>
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

              <div className="flex items-center gap-2">
                <a
                  href={`/admin/campanas-contribucion/solicitudes?q=${encodeURIComponent(selectedTask.id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Ver solicitud original en Solicitudes de Contenido"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-gray-300 text-gray-700 hover:bg-blue-50 hover:text-[#013388] hover:border-[#013388]/30 transition-colors shadow-xs"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
                  <span>Solicitud Original</span>
                </a>
                <button
                  onClick={() => setSelectedTask(null)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* TABS EDITORIALES / REELS / REDES */}
            <div className="flex items-center gap-1 px-6 pt-3 bg-gray-50 border-b border-gray-200 shrink-0">
              <button
                onClick={() => setModalTab("articulo")}
                className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-bold border-b-2 transition-all ${
                  modalTab === "articulo"
                    ? "border-[#013388] text-[#013388]"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Artículo Web</span>
              </button>

              <button
                onClick={() => setModalTab("reel")}
                className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-bold border-b-2 transition-all ${
                  modalTab === "reel"
                    ? "border-pink-600 text-pink-700"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <Video className="w-4 h-4" />
                <span>Reel Vertical (9:16)</span>
                {selectedTask.reel?.status && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold uppercase ${
                    selectedTask.reel.status === 'aprobada' || selectedTask.reel.status === 'publicada'
                      ? 'bg-emerald-100 text-emerald-800'
                      : selectedTask.reel.status === 'lista'
                      ? 'bg-pink-100 text-pink-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {selectedTask.reel.status}
                  </span>
                )}
              </button>

              <button
                onClick={() => setModalTab("redes")}
                className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-bold border-b-2 transition-all ${
                  modalTab === "redes"
                    ? "border-indigo-600 text-indigo-700"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <Share2 className="w-4 h-4" />
                <span>Difusión en Redes</span>
                {selectedTask.social?.isFullyShared ? (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold uppercase bg-emerald-100 text-emerald-800">
                    Completado
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold uppercase bg-gray-100 text-gray-600">
                    Fanpage & X
                  </span>
                )}
              </button>
            </div>

            {/* TAB 1: ARTÍCULO EDITORIAL */}
            {modalTab === "articulo" && (
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
            )}

            {/* TAB 2: REEL VERTICAL 9:16 */}
            {modalTab === "reel" && (
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Banner Camila */}
                <div className="p-4 rounded-xl bg-pink-50/70 border border-pink-200/80 flex items-start gap-3">
                  <span className="text-2xl">🎬</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-black text-pink-900 uppercase tracking-wider">
                        Camila · Directora de Video Vertical & Reels IA
                      </h4>
                      <span className="text-[10px] bg-pink-100 text-pink-800 font-bold px-2 py-0.5 rounded-full">
                        Instagram Reels · TikTok · YouTube Shorts
                      </span>
                    </div>
                    <p className="text-xs text-pink-950/80 mt-1 leading-relaxed">
                      Transformación de las fotografías de la actividad (mínimo 5 fotos requeridas en el aporte) en una pieza cinematográfica vertical 9:16 con dinamismo, subtítulos y locución IA optimizada para redes sociales de alta viralidad.
                    </p>
                  </div>
                </div>

                {/* Si ya hay video generado */}
                {selectedTask.reel?.videoUrl ? (
                  <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-xl flex flex-col md:flex-row gap-6 items-center">
                    <div className="relative w-60 aspect-[9/16] bg-black rounded-xl overflow-hidden shadow-2xl border border-white/10 shrink-0">
                      <video
                        src={selectedTask.reel.videoUrl}
                        poster={selectedTask.reel.posterUrl || selectedTask.media.coverUrl || undefined}
                        controls
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="flex-1 space-y-4">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-pink-400 block mb-1">
                          Reel Vertical 9:16 Generado
                        </span>
                        <h3 className="text-base font-bold text-white leading-snug">
                          {selectedTask.title}
                        </h3>
                        <p className="text-xs text-slate-300 mt-1">
                          {selectedTask.reel.durationSec ? `${selectedTask.reel.durationSec}s · ` : ""}
                          {selectedTask.reel.statusDetail || "Producción audiovisual completada."}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2">
                        <div className="bg-white/5 border border-white/10 p-2.5 rounded-xl">
                          <span className="text-[10px] text-slate-400 block font-semibold">Formato</span>
                          <span className="text-xs font-bold text-white">9:16 Vertical</span>
                        </div>
                        <div className="bg-white/5 border border-white/10 p-2.5 rounded-xl">
                          <span className="text-[10px] text-slate-400 block font-semibold">Motor IA</span>
                          <span className="text-xs font-bold text-white">Kling / Luma</span>
                        </div>
                        <div className="bg-white/5 border border-white/10 p-2.5 rounded-xl">
                          <span className="text-[10px] text-slate-400 block font-semibold">Destinos</span>
                          <span className="text-xs font-bold text-white">IG / TikTok / Shorts</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5 pt-2">
                        <a
                          href={selectedTask.reel.videoUrl}
                          target="_blank"
                          rel="noreferrer"
                          download
                          className="px-4 py-2.5 bg-pink-600 hover:bg-pink-700 text-white font-black text-xs rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
                        >
                          <Download className="w-3.5 h-3.5" /> Descargar MP4
                        </a>
                        <button
                          onClick={() => handleGenerateReel(selectedTask)}
                          className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors border border-white/10"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Regenerar Reel
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Si está pendiente de generar o en proceso */
                  <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xs space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-1">
                          Estado de Producción Audiovisual
                        </span>
                        <h3 className="text-sm font-bold text-gray-900">
                          {selectedTask.reel?.statusDetail || "En cola de producción de Reel"}
                        </h3>
                      </div>
                      <span className="px-3 py-1 rounded-full text-xs font-black uppercase bg-pink-100 text-pink-800">
                        {selectedTask.reel?.status || "Pendiente"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-gray-50 border border-gray-200 p-3.5 rounded-xl">
                        <span className="text-[10px] font-bold text-gray-500 block uppercase">Fotografías fuente</span>
                        <span className="text-sm font-black text-gray-900 mt-0.5 block">
                          {selectedTask.media.imageCount} fotos adjuntas
                        </span>
                        <span className="text-[10px] text-gray-500">Mínimo 5 fotos requeridas por la regla distrital</span>
                      </div>
                      <div className="bg-gray-50 border border-gray-200 p-3.5 rounded-xl">
                        <span className="text-[10px] font-bold text-gray-500 block uppercase">Créditos estimados</span>
                        <span className="text-sm font-black text-gray-900 mt-0.5 block">
                          {selectedTask.reel?.creditsEstimated || 40} créditos
                        </span>
                        <span className="text-[10px] text-gray-500">Kling AI Video Generator</span>
                      </div>
                      <div className="bg-gray-50 border border-gray-200 p-3.5 rounded-xl">
                        <span className="text-[10px] font-bold text-gray-500 block uppercase">Formato de Salida</span>
                        <span className="text-sm font-black text-gray-900 mt-0.5 block">
                          1080 × 1920 (9:16)
                        </span>
                        <span className="text-[10px] text-gray-500">Vertical cinematográfico</span>
                      </div>
                    </div>

                    {selectedTask.reel?.lastError && (
                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <b>Último error registrado:</b> {selectedTask.reel.lastError}
                        </div>
                      </div>
                    )}

                    <div className="pt-2">
                      <button
                        onClick={() => handleGenerateReel(selectedTask)}
                        className="w-full py-3 bg-pink-600 hover:bg-pink-700 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all"
                      >
                        <Zap className="w-4 h-4 text-pink-200" />
                        <span>GENERAR VIDEO REEL IA AHORA (5 FOTOS)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: DIFUSIÓN EN REDES SOCIALES */}
            {modalTab === "redes" && (
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Banner Lucas */}
                <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200/80 flex items-start gap-3">
                  <span className="text-2xl">📢</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-black text-indigo-900 uppercase tracking-wider">
                        Lucas · Especialista en Difusión Fanpage & X
                      </h4>
                      <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-full">
                        Publicación de Artículo de Blog
                      </span>
                    </div>
                    <p className="text-xs text-indigo-950/80 mt-1 leading-relaxed">
                      Publicación automatizada del artículo publicado como enlace con titular periodístico, extracto e imagen destacada en los perfiles y fanpages conectados.
                    </p>
                  </div>
                </div>

                {/* Tarjetas de canales conectados */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Facebook Fanpage */}
                  <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-sm">
                            f
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-gray-900">Facebook Fanpage</h4>
                            <p className="text-[10px] text-gray-500">Página oficial del club / distrito</p>
                          </div>
                        </div>
                        {selectedTask.social?.hasFacebook ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800">
                            Publicado
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-gray-100 text-gray-600">
                            Pendiente
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-gray-600 leading-relaxed mb-3">
                        {selectedTask.social?.hasFacebook
                          ? "Artículo compartido exitosamente en el muro de la Fanpage."
                          : "Pendiente de publicar en la Fanpage vinculada."}
                      </p>

                      {selectedTask.social?.facebook?.externalUrl && (
                        <a
                          href={selectedTask.social.facebook.externalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" /> Ver publicación en Facebook
                        </a>
                      )}
                    </div>
                  </div>

                  {/* X (Twitter) */}
                  <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-black text-white flex items-center justify-center font-black text-sm">
                            𝕏
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-gray-900">X (Twitter)</h4>
                            <p className="text-[10px] text-gray-500">Cuenta oficial conectada</p>
                          </div>
                        </div>
                        {selectedTask.social?.hasX ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800">
                            Publicado
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-gray-100 text-gray-600">
                            Pendiente
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-gray-600 leading-relaxed mb-3">
                        {selectedTask.social?.hasX
                          ? "Post emitido en la cuenta de X con enlace al blog."
                          : "Pendiente de publicar en la cuenta de X."}
                      </p>

                      {selectedTask.social?.x?.externalUrl && (
                        <a
                          href={selectedTask.social.x.externalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] font-bold text-gray-900 hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" /> Ver post en X
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Acciones de difusión */}
                <div className="bg-gray-50 rounded-2xl border border-gray-200 p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-xs text-gray-600">
                    <p className="font-bold text-gray-800">Difusión inmediata en redes</p>
                    <p className="text-[11px] text-gray-500">
                      Dispara la publicación del enlace en Fanpage y X reutilizando la arquitectura de distribución social.
                    </p>
                  </div>

                  <button
                    onClick={() => handleShareSocial(selectedTask)}
                    className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all shrink-0"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>DIFUNDIR EN FANPAGE & X</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL: REGLAS Y AJUSTES DE AUTOMATIZACIÓN ── */}
      {showRulesModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[10001] animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl border border-gray-200 flex flex-col max-h-[88vh]">
            {/* Encabezado */}
            <div className="px-6 py-4 bg-[#013388] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-white/10 text-white">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-black tracking-wide">Ajustes y Reglas del Motor de Automatizaciones</h2>
                  <p className="text-xs text-white/80">Supervisión operativa, pipelines de IA y distribución multi-tenant</p>
                </div>
              </div>
              <button
                onClick={() => setShowRulesModal(false)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Contenido scrolleable */}
            <div className="p-6 overflow-y-auto space-y-5 text-gray-700 text-xs">
              {/* Bloque 1: Pipeline Operativo */}
              <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4">
                <div className="flex items-center gap-2 font-black text-[#013388] text-sm mb-2">
                  <Bot className="w-4 h-4" />
                  <span>1. Flujo Autónomo: Solicitudes, Artículos Web, Reels 9:16 y Redes</span>
                </div>
                <p className="text-gray-600 mb-3 leading-relaxed">
                  Cuando un club rotario envía material a través de una <b>Campaña de Contribución</b>, el sistema activa automáticamente la cadena de producción:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="bg-white p-3 rounded-lg border border-blue-100 shadow-2xs">
                    <span className="font-bold text-[#013388] block mb-1">📸 Regla 5 Fotografías</span>
                    <p className="text-[11px] text-gray-500">Se exige un mínimo de 5 fotos de la actividad para garantizar material visual suficiente para el Reel.</p>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-blue-100 shadow-2xs">
                    <span className="font-bold text-amber-700 block mb-1">🤖 Redacción & Curaduría</span>
                    <p className="text-[11px] text-gray-500">Gemini 2.5 Flash redacta el artículo de noticias y prepara la portada para aprobación humana.</p>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-blue-100 shadow-2xs">
                    <span className="font-bold text-pink-700 block mb-1">🎬 Reels Verticales 9:16</span>
                    <p className="text-[11px] text-gray-500">Al publicarse la noticia, Camila orquesta el video vertical para Instagram Reels, TikTok y YouTube Shorts.</p>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-blue-100 shadow-2xs">
                    <span className="font-bold text-indigo-700 block mb-1">📢 Difusión en Redes</span>
                    <p className="text-[11px] text-gray-500">Lucas publica el artículo de blog como enlace en la Fanpage de Facebook y cuenta de X del club/distrito.</p>
                  </div>
                </div>
              </div>

              {/* Bloque 2: Frecuencia de Ejecución y Cron */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-2 font-black text-gray-900 text-sm mb-2">
                  <Cpu className="w-4 h-4 text-purple-600" />
                  <span>2. Frecuencia del Worker y Disparo Manual</span>
                </div>
                <div className="space-y-2 text-gray-600">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span><b>Cron en segundo plano:</b> El worker <code className="bg-gray-200 px-1 py-0.5 rounded text-[10px]">submission-articles-tick</code> corre en el servidor cada <b>60 segundos</b> procesando la cola.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span><b>Botón «Ejecutar Automatizaciones Ahora»:</b> Fuerza el barrido inmediato de todas las solicitudes pendientes, las encola y avanza su redacción sin esperar al ciclo del cron.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                    <span><b>Trazabilidad humana:</b> Los artículos generados nunca se publican solos a la web. Siempre se detienen en la columna prioritaria <b>«POR APROBAR»</b> para validación editorial.</span>
                  </div>
                </div>
              </div>

              {/* Bloque 3: Campañas Activas */}
              <div className="border border-gray-200 rounded-xl p-4 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 font-black text-gray-900 text-sm">
                    <Target className="w-4 h-4 text-[#013388]" />
                    <span>3. Campañas Operativas Configurales ({campaigns.length})</span>
                  </div>
                  <Link
                    to="/admin/campanas-contribucion"
                    target="_blank"
                    className="text-[11px] font-bold text-[#013388] hover:underline flex items-center gap-1"
                  >
                    <span>Configurar Campañas</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
                <p className="text-gray-500 mb-3 text-[11px]">
                  Para ajustar el formulario público de recepción de noticias de los clubes, las preguntas personalizadas o los clubes alcanzados, gestiona cada campaña en su módulo:
                </p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {campaigns.length === 0 ? (
                    <p className="text-gray-400 italic">No hay campañas de contribución activas registradas.</p>
                  ) : (
                    campaigns.map((c) => (
                      <div key={c.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-200">
                        <div>
                          <span className="font-bold text-gray-900 block">{c.title}</span>
                          <span className="text-[10px] text-gray-500">{c.total} aportes recibidos · {c.published} publicadas</span>
                        </div>
                        <Link
                          to={`/admin/campanas-contribucion?campana=${c.id}`}
                          className="px-2 py-1 bg-white hover:bg-gray-100 border border-gray-200 rounded text-[10px] font-bold text-gray-700"
                        >
                          Ver Campaña ↗
                        </Link>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Pie del modal */}
            <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
              <span className="text-[11px] text-gray-500 font-medium">
                Centro de Control Operacional · Club Platform
              </span>
              <button
                onClick={() => setShowRulesModal(false)}
                className="px-4 py-1.5 bg-[#013388] hover:bg-[#012566] text-white font-bold text-xs rounded-xl transition-all shadow-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MissionControlVIP;
