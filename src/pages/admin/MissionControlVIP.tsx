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
  History,
  Clock,
  Phone,
  Mail,
  MessageSquare,
  Copy,
  Star,
  User,
  Paperclip,
  ChevronRight,
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

interface OperationalDeliverable {
  id: string;
  type: string;
  label: string;
  status: string;
  agent: string;
  completed: boolean;
  publicUrl?: string | null;
  videoUrl?: string | null;
  isOptimal?: boolean;
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
  column: 'entradas' | 'en_revision' | 'por_aprobar' | 'en_produccion' | 'listo_distribuir' | 'difusion' | 'completado';
  actualState: string;
  specialState?: 'requiere_ajustes' | 'bloqueado' | 'error_tecnico' | 'rechazado' | 'cancelado' | 'pausado' | null;
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
  deliverables?: OperationalDeliverable[];
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

export interface TaskDetailFile {
  id: string;
  submissionId: string;
  kind: string;
  s3Key: string;
  filename: string;
  contentType?: string;
  bytes: number;
  sortOrder: number;
  mediaId?: string | null;
  mediaUrl?: string | null;
  viewUrl?: string | null;
  isCover?: boolean;
  role?: string | null;
  score?: number | null;
  analysis?: any;
  coverNote?: string | null;
  excluded?: boolean;
  excludedReason?: string | null;
  createdAt: string;
}

export interface TaskDetailEvent {
  id: string;
  submissionId: string;
  campaignId: string;
  type: string;
  fromState?: string | null;
  toState?: string | null;
  detail?: string | null;
  reference?: string | null;
  channel?: string | null;
  actor?: string | null;
  actorName?: string | null;
  createdAt: string;
}

export interface TaskFullDetails {
  submission: any;
  column: string;
  specialState?: string | null;
  assignedAgent?: any;
  deliverables?: OperationalDeliverable[];
  files: TaskDetailFile[];
  article?: any;
  reel?: any;
  reelProject?: any;
  post?: any;
  destinations?: any;
  distributions?: any[];
  events: TaskDetailEvent[];
  reelAudit?: ReelAudit;
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
    entradas: 0,
    en_revision: 0,
    por_aprobar: 0,
    en_produccion: 0,
    listo_distribuir: 0,
    difusion: 0,
    completado: 0,
    errores: 0,
    requiere_ajustes: 0,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isRunningAutomations, setIsRunningAutomations] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<OperationalTask | null>(null);
  const [taskDetails, setTaskDetails] = useState<TaskFullDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'info' | 'files' | 'production' | 'distribution' | 'history'>('info');
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [historyNote, setHistoryNote] = useState("");
  const [selectedPriority, setSelectedPriority] = useState<string>("all");
  const [selectedClubFilter, setSelectedClubFilter] = useState<string>("all");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("all");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("all");
  const [selectedSpecialFilter, setSelectedSpecialFilter] = useState<string>("all");
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

  // Cargar detalles completos al seleccionar tarea (FASE 2)
  const fetchTaskDetails = useCallback(async (taskId: string) => {
    setIsLoadingDetails(true);
    try {
      const res = await fetch(`${API_BASE}/mission-control/tasks/${taskId}/details`, {
        headers: { Authorization: `Bearer ${token() || authToken}` },
      });
      if (res.ok) {
        const data = await safeJson(res);
        setTaskDetails(data);
      }
    } catch (e) {
      console.warn("Error cargando detalles:", e);
    } finally {
      setIsLoadingDetails(false);
    }
  }, [authToken]);

  useEffect(() => {
    if (selectedTask?.id) {
      fetchTaskDetails(selectedTask.id);
    } else {
      setTaskDetails(null);
    }
  }, [selectedTask?.id, fetchTaskDetails]);

  // Actualizar prioridad (FASE 2)
  const handleUpdatePriority = async (taskId: string, newPriority: string) => {
    const t = toast.loading(`Actualizando prioridad a «${newPriority}»...`);
    try {
      const res = await fetch(`${API_BASE}/mission-control/tasks/${taskId}/meta`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token() || authToken}`,
        },
        body: JSON.stringify({ priority: newPriority }),
      });
      const data = await safeJson(res);
      toast.dismiss(t);
      if (res.ok) {
        toast.success("Prioridad actualizada con éxito.");
        setSelectedTask((prev) => prev ? { ...prev, priority: newPriority } : null);
        await fetchBoard(true);
        await fetchTaskDetails(taskId);
      } else {
        toast.error(data.error || "No se pudo actualizar prioridad");
      }
    } catch (e: any) {
      toast.dismiss(t);
      toast.error(`Error: ${e?.message}`);
    }
  };

  // Fijar imagen como portada (FASE 2)
  const handleSetCover = async (taskId: string, fileId: string) => {
    const t = toast.loading("Definiendo foto de portada...");
    try {
      const res = await fetch(`${API_BASE}/mission-control/tasks/${taskId}/set-cover`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token() || authToken}`,
        },
        body: JSON.stringify({ fileId }),
      });
      const data = await safeJson(res);
      toast.dismiss(t);
      if (res.ok) {
        toast.success("Foto de portada establecida.");
        await fetchBoard(true);
        await fetchTaskDetails(taskId);
      } else {
        toast.error(data.error || "No se pudo definir portada");
      }
    } catch (e: any) {
      toast.dismiss(t);
      toast.error(`Error: ${e?.message}`);
    }
  };

  // Agregar nota interna al historial (FASE 2)
  const handleAddHistoryNote = async (taskId: string) => {
    if (!historyNote.trim()) return;
    const t = toast.loading("Guardando nota en el historial...");
    try {
      const res = await fetch(`${API_BASE}/mission-control/tasks/${taskId}/meta`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token() || authToken}`,
        },
        body: JSON.stringify({ note: historyNote.trim() }),
      });
      const data = await safeJson(res);
      toast.dismiss(t);
      if (res.ok) {
        toast.success("Nota registrada en el historial.");
        setHistoryNote("");
        await fetchTaskDetails(taskId);
      } else {
        toast.error(data.error || "No se pudo registrar la nota");
      }
    } catch (e: any) {
      toast.dismiss(t);
      toast.error(`Error: ${e?.message}`);
    }
  };

  // Clubes únicos para filtro (FASE 2)
  const uniqueClubs = useMemo(() => {
    const clubsSet = new Set<string>();
    tasks.forEach((t) => {
      if (t.club) clubsSet.add(t.club);
    });
    return Array.from(clubsSet).sort();
  }, [tasks]);

  // Copiar al portapapeles con notificación (FASE 2)
  const handleCopyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado al portapapeles`);
  };

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

  // Transicionar una tarea a otra columna o estado especial (FASE 1)
  const handleTransitionTask = async (task: OperationalTask, targetCol: string, specialState?: string | null, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const loadingToast = toast.loading(`Moviendo «${task.title}» a ${targetCol}...`);
    try {
      const res = await fetch(`${API_BASE}/mission-control/tasks/${task.id}/transition`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token() || authToken}`,
        },
        body: JSON.stringify({
          targetColumn: targetCol,
          specialState: specialState || null,
        }),
      });
      const data = await safeJson(res);
      toast.dismiss(loadingToast);
      if (res.ok) {
        toast.success(`Tarea movida a «${targetCol}».`);
        await fetchBoard(true);
        await fetchCampaigns();
      } else {
        toast.error(data.error || "No se pudo cambiar de etapa");
      }
    } catch (e: any) {
      toast.dismiss(loadingToast);
      toast.error(`Error: ${e?.message}`);
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

      if (selectedSpecialFilter !== "all") {
        if (selectedSpecialFilter === "errores" && !t.isError) return false;
        if (selectedSpecialFilter === "requiere_ajustes" && t.specialState !== "requiere_ajustes") return false;
        if (selectedSpecialFilter === "bloqueado" && t.specialState !== "bloqueado") return false;
        if (selectedSpecialFilter === "rechazado" && t.specialState !== "rechazado") return false;
      }

      if (selectedPriority !== "all" && (t.priority || "normal") !== selectedPriority) return false;
      if (selectedClubFilter !== "all" && t.club !== selectedClubFilter) return false;

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
  }, [tasks, selectedCampaignId, selectedAgentId, onlyErrors, selectedSpecialFilter, selectedPriority, selectedClubFilter, searchQuery]);

  // Columnas Kanban del Flujo Editorial Canónico (01 a 07 - FASE 1)
  const boardCols = {
    entradas: {
      id: "entradas",
      title: "01. ENTRADAS",
      subtitle: "Nuevas solicitudes recibidas",
      icon: "📥",
      tasks: filteredTasks.filter((t) => t.column === "entradas"),
      badgeColor: "bg-sky-50 text-sky-800 border-sky-200",
      isPrimary: false,
    },
    en_revision: {
      id: "en_revision",
      title: "02. EN REVISIÓN",
      subtitle: "Validación técnica y editorial",
      icon: "🔍",
      tasks: filteredTasks.filter((t) => t.column === "en_revision"),
      badgeColor: "bg-amber-50 text-amber-900 border-amber-200",
      isPrimary: false,
    },
    por_aprobar: {
      id: "por_aprobar",
      title: "03. POR APROBAR",
      subtitle: "Autorización y canales",
      icon: "👤",
      tasks: filteredTasks.filter((t) => t.column === "por_aprobar"),
      badgeColor: "bg-orange-50 text-orange-900 border-orange-300 ring-2 ring-orange-300/40",
      isPrimary: true,
    },
    en_produccion: {
      id: "en_produccion",
      title: "04. EN PRODUCCIÓN",
      subtitle: "Entregables (Reels, Copys, Piezas)",
      icon: "⚙️",
      tasks: filteredTasks.filter((t) => t.column === "en_produccion"),
      badgeColor: "bg-blue-50 text-[#013388] border-blue-200",
      isPrimary: false,
    },
    listo_distribuir: {
      id: "listo_distribuir",
      title: "05. LISTO PARA DISTRIBUIR",
      subtitle: "Entregables validados y listos",
      icon: "🚀",
      tasks: filteredTasks.filter((t) => t.column === "listo_distribuir"),
      badgeColor: "bg-teal-50 text-teal-800 border-teal-200",
      isPrimary: false,
    },
    difusion: {
      id: "difusion",
      title: "06. PROGRAMADO / EN DIFUSIÓN",
      subtitle: "Publicación multicanal",
      icon: "📢",
      tasks: filteredTasks.filter((t) => t.column === "difusion"),
      badgeColor: "bg-indigo-50 text-indigo-700 border-indigo-200",
      isPrimary: false,
    },
    completado: {
      id: "completado",
      title: "07. COMPLETADO",
      subtitle: "Publicado y cerrado",
      icon: "✅",
      tasks: filteredTasks.filter((t) => t.column === "completado"),
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

      {/* ── BARRA DE CONTADORES OPERACIONALES (FASE 1) ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-2.5 flex items-center justify-between shadow-xs shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide text-xs font-semibold">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gray-100 text-gray-700">
            <span>Total:</span>
            <span className="font-black text-gray-900">{counts.total}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-sky-50 text-sky-800 border border-sky-200">
            <span>📥 01. Entradas:</span>
            <span className="font-black">{counts.entradas}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-200">
            <span>🔍 02. En Revisión:</span>
            <span className="font-black">{counts.en_revision}</span>
          </div>

          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold border transition-all ${
            counts.por_aprobar > 0
              ? "bg-orange-100/90 text-orange-950 border-orange-300 ring-2 ring-orange-300/40 shadow-xs"
              : "bg-orange-50 text-orange-900 border-orange-200"
          }`}>
            <span>👤 03. Por Aprobar:</span>
            <span className="font-black text-orange-800">{counts.por_aprobar}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-50 text-[#013388] border border-blue-200">
            <span>⚙️ 04. Producción:</span>
            <span className="font-black">{counts.en_produccion}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-teal-50 text-teal-800 border border-teal-200">
            <span>🚀 05. Listas:</span>
            <span className="font-black">{counts.listo_distribuir}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200">
            <span>📢 06. Difusión:</span>
            <span className="font-black">{counts.difusion}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
            <span>✅ 07. Completadas:</span>
            <span className="font-black">{counts.completado}</span>
          </div>

          {counts.errores > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-50 text-rose-800 border border-rose-200">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              <span>Errores:</span>
              <span className="font-black text-rose-700">{counts.errores}</span>
            </div>
          )}

          {counts.requiere_ajustes > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
              <Info className="w-3.5 h-3.5 text-amber-600" />
              <span>Ajustes:</span>
              <span className="font-black text-amber-700">{counts.requiere_ajustes}</span>
            </div>
          )}
        </div>

        {/* CONTROLES DE VISTA */}
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 font-semibold text-gray-700 outline-none cursor-pointer"
          >
            <option value="all">Prioridad: Todas</option>
            <option value="urgente">🔥 Urgente</option>
            <option value="alta">⚡ Alta</option>
            <option value="normal">🔹 Normal</option>
            <option value="baja">◽ Baja</option>
          </select>

          {uniqueClubs.length > 1 && (
            <select
              value={selectedClubFilter}
              onChange={(e) => setSelectedClubFilter(e.target.value)}
              className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 font-semibold text-gray-700 outline-none max-w-[150px] truncate cursor-pointer"
            >
              <option value="all">Club: Todos ({uniqueClubs.length})</option>
              {uniqueClubs.map((club) => (
                <option key={club} value={club}>{club}</option>
              ))}
            </select>
          )}

          <select
            value={selectedSpecialFilter}
            onChange={(e) => setSelectedSpecialFilter(e.target.value)}
            className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 font-semibold text-gray-700 outline-none cursor-pointer"
          >
            <option value="all">Filtro: Todos</option>
            <option value="errores">⚠️ Solo errores técnicos</option>
            <option value="requiere_ajustes">✏️ Requiere ajustes</option>
            <option value="bloqueado">🔒 Bloqueados</option>
            <option value="rechazado">❌ Rechazados</option>
          </select>
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
                          if (task.column === "en_produccion") setDrawerTab("production");
                          else if (task.column === "listo_distribuir" || task.column === "difusion") setDrawerTab("distribution");
                          else if (task.column === "por_aprobar") setDrawerTab("production");
                          else setDrawerTab("info");
                        }}
                        className={`bg-white rounded-xl border p-3.5 shadow-xs hover:shadow-md transition-all cursor-pointer group ${
                          task.isError
                            ? "border-rose-300 ring-1 ring-rose-200"
                            : task.column === "por_aprobar"
                            ? "border-amber-300 hover:border-amber-400 hover:ring-2 hover:ring-amber-200/50"
                            : "border-gray-200 hover:border-[#013388]/40"
                        }`}
                      >
                        {/* PORTADA EN MINIATURA 16:9 (FASE 2) */}
                        {showCovers && task.media.coverUrl && (
                          <div className="w-full aspect-video mb-2.5 rounded-lg overflow-hidden bg-gray-100 border border-gray-100 relative group/thumb">
                            <img
                              src={task.media.coverUrl}
                              alt=""
                              className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform duration-300"
                            />
                          </div>
                        )}

                        {/* BADGES DE CLUB, PRIORIDAD Y ESTADOS ESPECIALES (FASE 2) */}
                        <div className="flex items-center justify-between gap-1.5 mb-2 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 truncate max-w-[120px]">
                              {task.club || "Club Rotario"}
                            </span>
                            {task.priority && (
                              <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${
                                task.priority === 'urgente'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : task.priority === 'alta'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : task.priority === 'baja'
                                  ? 'bg-gray-100 text-gray-600 border-gray-200'
                                  : 'bg-blue-50 text-blue-700 border-blue-200'
                              }`}>
                                {task.priority === 'urgente' ? '🔥 Urgente' : task.priority === 'alta' ? '⚡ Alta' : task.priority === 'baja' ? 'Baja' : 'Normal'}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {task.specialState === "error_tecnico" || task.isError ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1" title={task.lastError || task.stageLabel}>
                                <AlertCircle className="w-3 h-3 text-rose-600" /> Error técnico
                              </span>
                            ) : task.specialState === "requiere_ajustes" ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                                <Edit2 className="w-3 h-3 text-amber-600" /> Requiere ajustes
                              </span>
                            ) : task.specialState === "bloqueado" ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                🔒 Bloqueado
                              </span>
                            ) : task.specialState === "rechazado" ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                                ❌ Rechazado
                              </span>
                            ) : task.working ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-[#013388] border border-blue-200 flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin text-[#013388]" /> IA activa
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {/* TÍTULO */}
                        <h4 className="text-xs font-bold text-gray-900 leading-snug line-clamp-2 mb-1.5 group-hover:text-[#013388] transition-colors">
                          {task.title}
                        </h4>

                        {/* EXTRACTO O CAMPAÑA */}
                        <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed mb-2">
                          {task.article?.excerpt || task.subtitle}
                        </p>

                        {/* ENTREGABLES (MODELO MULTIFORMATO FASE 1) */}
                        <div className="flex items-center gap-1.5 mb-2.5">
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-bold border transition-colors ${
                              task.article?.status === "publicado" || task.post?.published
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : task.article?.status
                                ? "bg-blue-50 text-blue-800 border-blue-200"
                                : "bg-gray-50 text-gray-400 border-gray-200"
                            }`}
                            title={`Artículo Web (${task.article?.status || "pendiente"})`}
                          >
                            📰 Web
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-bold border transition-colors ${
                              task.reel?.status === "aprobada" || task.reel?.status === "publicada"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : task.reel?.videoUrl
                                ? "bg-pink-50 text-pink-800 border-pink-200"
                                : task.reelAudit?.isOptimal
                                ? "bg-pink-50/60 text-pink-700 border-pink-100"
                                : "bg-gray-50 text-gray-400 border-gray-200"
                            }`}
                            title={`Reel Audiovisual (${task.reel?.status || "en cola"})`}
                          >
                            🎬 Reel
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-bold border transition-colors ${
                              task.social?.hasFacebook || task.social?.hasX
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : "bg-gray-50 text-gray-400 border-gray-200"
                            }`}
                            title="Difusión en Redes"
                          >
                            📢 Redes
                          </span>
                        </div>

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

                        {/* SELECTOR DE ETAPA / TRANSICIÓN RÁPIDA (FASE 1) */}
                        <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between text-[10px]">
                          <span className="text-gray-400 font-medium">Mover etapa:</span>
                          <select
                            value={task.column}
                            onChange={(e) => handleTransitionTask(task, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-gray-50 hover:bg-white border border-gray-200 rounded px-1.5 py-0.5 text-[10px] font-bold text-gray-700 outline-none cursor-pointer"
                          >
                            <option value="entradas">01. Entradas</option>
                            <option value="en_revision">02. En Revisión</option>
                            <option value="por_aprobar">03. Por Aprobar</option>
                            <option value="en_produccion">04. Producción</option>
                            <option value="listo_distribuir">05. Listo Distribuir</option>
                            <option value="difusion">06. En Difusión</option>
                            <option value="completado">07. Completado</option>
                          </select>
                        </div>

                        {/* ACCIONES RÁPIDAS SEGÚN LA ETAPA (FASE 1) */}
                        <div className="mt-2 flex items-center justify-between gap-1.5">
                          {task.column === "entradas" && (
                            <button
                              onClick={(e) => handleAdvanceTask(task, e)}
                              className="w-full py-1.5 bg-[#013388] hover:bg-[#002266] text-white text-[10px] font-black rounded-lg flex items-center justify-center gap-1 transition-colors"
                            >
                              <Sparkles className="w-3 h-3 text-amber-400" /> INICIAR VALIDACIÓN IA
                            </button>
                          )}

                          {task.column === "en_revision" && (
                            <div className="w-full flex items-center gap-1.5">
                              <button
                                onClick={() => {
                                  setSelectedTask(task);
                                  setDrawerTab("info");
                                }}
                                className="flex-1 py-1.5 bg-amber-500 hover:bg-amber-600 text-amber-950 font-black text-[10px] rounded-lg text-center transition-colors flex items-center justify-center gap-1"
                              >
                                <Edit2 className="w-3 h-3" /> REVISAR Y VALIDAR
                              </button>
                              {task.isError && (
                                <button
                                  onClick={(e) => handleRetryTask(task, e)}
                                  className="px-2 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-black"
                                  title="Reintentar automatización fallida"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )}

                          {task.column === "por_aprobar" && (
                            <button
                              onClick={() => {
                                setSelectedTask(task);
                                setDrawerTab("production");
                              }}
                              className="w-full py-1.5 bg-orange-500 hover:bg-orange-600 text-white font-black text-[10px] rounded-lg text-center transition-colors shadow-xs flex items-center justify-center gap-1"
                            >
                              <CheckCircle2 className="w-3 h-3" /> REVISAR Y APROBAR
                            </button>
                          )}

                          {task.column === "en_produccion" && (
                            <div className="w-full flex items-center gap-1.5">
                              {task.reel?.videoUrl ? (
                                <button
                                  onClick={() => {
                                    setSelectedTask(task);
                                    setDrawerTab("production");
                                  }}
                                  className="w-full py-1.5 bg-pink-600 hover:bg-pink-700 text-white text-[10px] font-black rounded-lg flex items-center justify-center gap-1 transition-colors shadow-xs"
                                >
                                  <Film className="w-3 h-3" /> VER REEL VERTICAL
                                </button>
                              ) : task.reelAudit?.isOptimal ? (
                                <button
                                  onClick={(e) => handleGenerateReel(task, e)}
                                  className="w-full py-1.5 bg-pink-600 hover:bg-pink-700 text-white text-[10px] font-black rounded-lg flex items-center justify-center gap-1 transition-colors shadow-xs"
                                >
                                  <Video className="w-3 h-3 text-pink-200" /> PRODUCIR REEL 9:16
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    setSelectedTask(task);
                                    setDrawerTab("production");
                                  }}
                                  className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black rounded-lg flex items-center justify-center gap-1 transition-colors"
                                >
                                  <Sliders className="w-3 h-3" /> VER ENTREGABLES
                                </button>
                              )}
                            </div>
                          )}

                          {task.column === "listo_distribuir" && (
                            <button
                              onClick={() => {
                                setSelectedTask(task);
                                setDrawerTab("distribution");
                              }}
                              className="w-full py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-[10px] font-black rounded-lg flex items-center justify-center gap-1 transition-colors shadow-xs"
                            >
                              <Share2 className="w-3 h-3 text-teal-200" /> LANZAR DISTRIBUCIÓN
                            </button>
                          )}

                          {task.column === "difusion" && (
                            <button
                              onClick={(e) => handleShareSocial(task, e)}
                              className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black rounded-lg flex items-center justify-center gap-1 transition-colors shadow-xs"
                            >
                              <Share2 className="w-3 h-3 text-indigo-200" /> DIFUNDIR EN FANPAGE & X
                            </button>
                          )}

                          {task.column === "completado" && task.article?.publicUrl && (
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

      {/* ── SLIDE-OVER DRAWER LATERAL DE OPERACIONES (FASE 2) ── */}
      {selectedTask && (
        <div className="fixed inset-0 z-[10000] overflow-hidden">
          {/* Backdrop con blur sutil para mantener visible el tablero Kanban de fondo */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={() => setSelectedTask(null)}
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10">
            <div className="w-screen max-w-3xl bg-white shadow-2xl border-l border-gray-200 flex flex-col animate-in slide-in-from-right duration-300">
              {/* ENCABEZADO DRAWER */}
              <div className="p-4 bg-gray-50/90 border-b border-gray-200 shrink-0">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{selectedTask.assignedAgent?.icon}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black px-2 py-0.5 rounded bg-blue-100 text-[#013388] uppercase">
                          {selectedTask.campaignName}
                        </span>
                        <span className="text-xs font-semibold text-gray-700">
                          {selectedTask.club || "Club Rotario"}
                        </span>
                      </div>
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
                      <span className="hidden sm:inline">Solicitud Original</span>
                    </a>
                    <button
                      onClick={() => setSelectedTask(null)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
                      title="Cerrar panel lateral"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 mt-2">
                  <h3 className="text-sm font-black text-gray-900 leading-snug">
                    {selectedTask.title}
                  </h3>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200">
                      {selectedTask.stageLabel}
                    </span>
                    {selectedTask.specialState && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                        {selectedTask.specialState}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* BARRA DE 5 PESTAÑAS CANÓNICAS */}
              <div className="flex items-center border-b border-gray-200 bg-gray-50/50 px-4 shrink-0 overflow-x-auto no-scrollbar">
                <button
                  onClick={() => setDrawerTab("info")}
                  className={`flex items-center gap-1.5 py-3 px-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                    drawerTab === "info"
                      ? "border-[#013388] text-[#013388] bg-white rounded-t-lg shadow-2xs"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100/50"
                  }`}
                >
                  <Info className="w-4 h-4" />
                  <span>01. Información</span>
                </button>

                <button
                  onClick={() => setDrawerTab("files")}
                  className={`flex items-center gap-1.5 py-3 px-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                    drawerTab === "files"
                      ? "border-[#013388] text-[#013388] bg-white rounded-t-lg shadow-2xs"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100/50"
                  }`}
                >
                  <ImageIcon className="w-4 h-4" />
                  <span>02. Archivos</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-blue-100 text-[#013388]">
                    {taskDetails?.files?.length ?? selectedTask.media.imageCount}
                  </span>
                </button>

                <button
                  onClick={() => setDrawerTab("production")}
                  className={`flex items-center gap-1.5 py-3 px-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                    drawerTab === "production"
                      ? "border-[#013388] text-[#013388] bg-white rounded-t-lg shadow-2xs"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100/50"
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>03. Producción</span>
                  {selectedTask.reel?.status && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase bg-pink-100 text-pink-700">
                      Reel
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setDrawerTab("distribution")}
                  className={`flex items-center gap-1.5 py-3 px-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                    drawerTab === "distribution"
                      ? "border-[#013388] text-[#013388] bg-white rounded-t-lg shadow-2xs"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100/50"
                  }`}
                >
                  <Globe className="w-4 h-4 text-indigo-500" />
                  <span>04. Distribución</span>
                  {selectedTask.social?.isFullyShared && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase bg-emerald-100 text-emerald-700">
                      OK
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setDrawerTab("history")}
                  className={`flex items-center gap-1.5 py-3 px-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                    drawerTab === "history"
                      ? "border-[#013388] text-[#013388] bg-white rounded-t-lg shadow-2xs"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100/50"
                  }`}
                >
                  <History className="w-4 h-4 text-slate-500" />
                  <span>05. Historial</span>
                  {taskDetails?.events && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-slate-200 text-slate-700">
                      {taskDetails.events.length}
                    </span>
                  )}
                </button>
              </div>

              {/* CUERPO DEL DRAWER SCROLLEABLE */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {isLoadingDetails && !taskDetails && (
                  <div className="py-8 flex flex-col items-center justify-center text-gray-400 gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-[#013388]" />
                    <span className="text-xs">Cargando trazabilidad completa...</span>
                  </div>
                )}

                {/* ── TAB 1: INFORMACIÓN ── */}
                {drawerTab === "info" && (
                  <div className="space-y-5">
                    {/* Controles de Prioridad y Estado Especial */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
                      <div>
                        <label className="text-[10px] font-black uppercase text-gray-500 block mb-1">
                          Prioridad Operativa
                        </label>
                        <select
                          value={selectedTask.priority || "normal"}
                          onChange={(e) => handleUpdatePriority(selectedTask.id, e.target.value)}
                          className="w-full bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-800 outline-none focus:ring-2 focus:ring-[#013388]"
                        >
                          <option value="urgente">🔥 Urgente (Prioridad Máxima)</option>
                          <option value="alta">⚡ Alta</option>
                          <option value="normal">Normal</option>
                          <option value="baja">Baja</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-black uppercase text-gray-500 block mb-1">
                          Estado Especial / Excepción
                        </label>
                        <select
                          value={selectedTask.specialState || "normal"}
                          onChange={(e) =>
                            handleTransitionTask(
                              selectedTask,
                              selectedTask.column,
                              e.target.value === "normal" ? null : e.target.value
                            )
                          }
                          className="w-full bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-800 outline-none focus:ring-2 focus:ring-[#013388]"
                        >
                          <option value="normal">Operación Normal</option>
                          <option value="requiere_ajustes">⚠️ Requiere ajustes</option>
                          <option value="bloqueado">🔒 Bloqueado</option>
                          <option value="error_tecnico">🔴 Error técnico</option>
                          <option value="rechazado">❌ Rechazado</option>
                        </select>
                      </div>
                    </div>

                    {/* Datos de Contacto y Remitente con botones de acción directa */}
                    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs space-y-3">
                      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                        <span className="text-[11px] font-black uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-[#013388]" />
                          Contacto del Remitente
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {selectedTask.club || "Club Rotario"}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-gray-400 block text-[10px]">Nombre:</span>
                          <span className="font-bold text-gray-900">
                            {selectedTask.senderName || "No registrado"}
                          </span>
                        </div>

                        <div>
                          <span className="text-gray-400 block text-[10px]">Email:</span>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-800 truncate">
                              {selectedTask.senderEmail || "Sin email"}
                            </span>
                            {selectedTask.senderEmail && (
                              <a
                                href={`mailto:${selectedTask.senderEmail}`}
                                title="Enviar email"
                                className="p-1 rounded bg-blue-50 text-[#013388] hover:bg-blue-100 transition-colors"
                              >
                                <Mail className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        </div>

                        <div>
                          <span className="text-gray-400 block text-[10px]">Teléfono / WhatsApp:</span>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-800">
                              {selectedTask.senderPhone || "Sin teléfono"}
                            </span>
                            {selectedTask.senderPhone && (
                              <>
                                <a
                                  href={`tel:${selectedTask.senderPhone}`}
                                  title="Llamar"
                                  className="p-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                                >
                                  <Phone className="w-3.5 h-3.5" />
                                </a>
                                <a
                                  href={`https://wa.me/${selectedTask.senderPhone.replace(/\D/g, "")}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Abrir WhatsApp"
                                  className="p-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </a>
                              </>
                            )}
                          </div>
                        </div>

                        <div>
                          <span className="text-gray-400 block text-[10px]">Fecha de la actividad:</span>
                          <span className="font-semibold text-gray-800">
                            {selectedTask.activityDate || "No especificada"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Relato humano / Texto original enviado con copia rápida */}
                    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-black uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-[#013388]" />
                          Relato Original de la Solicitud
                        </span>
                        <button
                          onClick={() =>
                            handleCopyToClipboard(
                              taskDetails?.submission?.content || selectedTask.subtitle,
                              "Relato de la solicitud"
                            )
                          }
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10px] font-bold transition-colors"
                          title="Copiar texto original"
                        >
                          <Copy className="w-3 h-3" /> Copiar texto
                        </button>
                      </div>

                      <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-700 leading-relaxed max-h-60 overflow-y-auto whitespace-pre-line">
                        {taskDetails?.submission?.content || selectedTask.subtitle || "Sin contenido de relato registrado."}
                      </div>
                    </div>

                    {/* Metadatos adicionales */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-gray-500 bg-gray-50 p-3 rounded-xl border border-gray-200">
                      <div>
                        <span className="font-bold text-gray-700 block">ID Tarea:</span>
                        <span className="font-mono truncate block" title={selectedTask.id}>
                          {selectedTask.id.slice(0, 12)}...
                        </span>
                      </div>
                      <div>
                        <span className="font-bold text-gray-700 block">Fecha Recepción:</span>
                        <span>{new Date(selectedTask.date).toLocaleDateString("es-CO")}</span>
                      </div>
                      <div>
                        <span className="font-bold text-gray-700 block">Agente IA:</span>
                        <span>{selectedTask.assignedAgent?.name || "Victoria"}</span>
                      </div>
                      <div>
                        <span className="font-bold text-gray-700 block">Destinos:</span>
                        <span>{selectedTask.destinations?.suggested?.length || 1} vinculados</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── TAB 2: ARCHIVOS Y FOTOGRAFÍAS ── */}
                {drawerTab === "files" && (
                  <div className="space-y-4">
                    {/* Resumen fotográfico y auditoría para Reels */}
                    <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-black text-[#013388] uppercase tracking-wider">
                            Galería de Evidencias y Recursos Adjuntos
                          </h4>
                          <span className="text-[10px] bg-blue-100 text-[#013388] font-bold px-2 py-0.5 rounded-full">
                            {(taskDetails?.files?.length ?? selectedTask.media.imageCount)} fotografías
                          </span>
                        </div>
                        <p className="text-xs text-blue-900/80 mt-1">
                          Selecciona la fotografía principal que encabezará el artículo periodístico. Clic en cualquier foto para expandir a pantalla completa.
                        </p>
                      </div>

                      {/* Pill de aptitud para Reel */}
                      <div className="shrink-0 text-right">
                        {(taskDetails?.files?.length ?? selectedTask.media.imageCount) >= 5 ? (
                          <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                            <Check className="w-3 h-3" /> Apto para Reel (5+ fotos)
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Faltan {5 - (taskDetails?.files?.length ?? selectedTask.media.imageCount)} fotos para Reel
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Cuadrícula de fotos */}
                    {taskDetails?.files && taskDetails.files.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {taskDetails.files.map((file) => {
                          const isCurrentCover =
                            file.isCover ||
                            file.url === selectedTask.media.coverUrl ||
                            file.viewUrl === selectedTask.media.coverUrl;

                          const imgUrl = file.url || file.viewUrl || file.mediaUrl || "";

                          return (
                            <div
                              key={file.id}
                              className={`group relative rounded-xl overflow-hidden border bg-gray-50 flex flex-col transition-all shadow-2xs hover:shadow-md ${
                                isCurrentCover
                                  ? "border-amber-400 ring-2 ring-amber-300/50"
                                  : "border-gray-200 hover:border-[#013388]/50"
                              }`}
                            >
                              {/* Imagen con aspect ratio 4:3 y Lightbox al hacer clic */}
                              <div
                                onClick={() => setLightboxImage(imgUrl)}
                                className="w-full aspect-[4/3] bg-gray-100 overflow-hidden cursor-zoom-in relative"
                              >
                                {imgUrl ? (
                                  <img
                                    src={imgUrl}
                                    alt={file.filename}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                                    Sin vista previa
                                  </div>
                                )}

                                {/* Badges superpuestos */}
                                <div className="absolute top-2 left-2 flex items-center gap-1">
                                  {isCurrentCover && (
                                    <span className="px-2 py-0.5 rounded-md bg-amber-500 text-white font-black text-[9px] shadow-sm flex items-center gap-0.5">
                                      <Star className="w-2.5 h-2.5 fill-current" /> Portada
                                    </span>
                                  )}
                                  {file.role && file.role !== "cover" && (
                                    <span className="px-1.5 py-0.5 rounded-md bg-black/60 text-white font-semibold text-[9px]">
                                      {file.role}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Pie de foto con metadatos y acción fijar portada */}
                              <div className="p-2 bg-white flex items-center justify-between gap-1 text-[10px]">
                                <span className="text-gray-500 truncate max-w-[90px]" title={file.filename}>
                                  {file.filename || "Imagen"}
                                </span>

                                {!isCurrentCover && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSetCover(selectedTask.id, file.id);
                                    }}
                                    className="px-2 py-1 rounded bg-gray-100 hover:bg-amber-100 text-gray-700 hover:text-amber-900 font-bold text-[9px] transition-colors flex items-center gap-1"
                                    title="Fijar como foto de portada"
                                  >
                                    <Star className="w-3 h-3 text-amber-500" /> Fijar portada
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="py-12 text-center text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                        <ImageIcon className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                        <p className="text-xs font-semibold">No se encontraron archivos multimedia adjuntos</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── TAB 3: PRODUCCIÓN MULTIFORMATO ── */}
                {drawerTab === "production" && (
                  <div className="space-y-6">
                    {/* ENTREGABLE 1: ARTÍCULO WEB PERIODÍSTICO */}
                    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs space-y-3">
                      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-[#013388]" />
                          <h4 className="text-xs font-black uppercase text-gray-900 tracking-wider">
                            Artículo Web Generado por IA
                          </h4>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase ${
                          selectedTask.article?.status === "publicado" || selectedTask.post?.published
                            ? "bg-emerald-100 text-emerald-800"
                            : selectedTask.article?.status
                            ? "bg-blue-100 text-blue-800"
                            : "bg-gray-100 text-gray-600"
                        }`}>
                          {selectedTask.article?.status || "Borrador"}
                        </span>
                      </div>

                      {/* Portada actual */}
                      {selectedTask.media.coverUrl && (
                        <div className="w-full h-40 rounded-lg overflow-hidden bg-gray-100 relative group">
                          <img
                            src={selectedTask.media.coverUrl}
                            alt="Portada"
                            className="w-full h-full object-cover"
                          />
                          <button
                            onClick={() => setLightboxImage(selectedTask.media.coverUrl || null)}
                            className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/60 text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                          >
                            <Maximize2 className="w-3 h-3" /> Ver completa
                          </button>
                        </div>
                      )}

                      <div>
                        <h3 className="text-sm font-bold text-gray-900 leading-snug">
                          {selectedTask.article?.title || selectedTask.title}
                        </h3>
                        {selectedTask.article?.excerpt && (
                          <p className="text-xs text-gray-600 italic bg-gray-50 p-2.5 rounded-lg border border-gray-100 mt-2">
                            {selectedTask.article.excerpt}
                          </p>
                        )}
                      </div>

                      {/* Alertas periodísticas / veracidad */}
                      {(selectedTask.article?.missingInfo?.length || selectedTask.article?.copyIssues?.length) ? (
                        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 space-y-1">
                          <div className="flex items-center gap-1.5 font-bold text-amber-800">
                            <ShieldCheck className="w-4 h-4 text-amber-600" />
                            <span>Control Editorial & Veracidad</span>
                          </div>
                          {selectedTask.article?.missingInfo && selectedTask.article.missingInfo.length > 0 && (
                            <p className="text-[11px]">
                              <b>Datos faltantes:</b> {selectedTask.article.missingInfo.map((m) => m.label).join(", ")}.
                            </p>
                          )}
                          {selectedTask.article?.copyIssues && selectedTask.article.copyIssues.length > 0 && (
                            <p className="text-[11px]">
                              <b>Aviso:</b> {selectedTask.article.copyIssues.join(" ")}
                            </p>
                          )}
                        </div>
                      ) : null}

                      {/* Acciones de publicación de artículo */}
                      <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
                        <button
                          onClick={() => handleApproveAndPublish(true)}
                          disabled={isPublishing}
                          className="w-full sm:flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
                        >
                          {isPublishing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                          <span>APROBAR Y PUBLICAR ARTÍCULO</span>
                        </button>

                        <button
                          onClick={() => handleApproveAndPublish(false)}
                          disabled={isPublishing}
                          className="w-full sm:w-auto px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-all"
                        >
                          Guardar borrador
                        </button>

                        {selectedTask.article?.postId && (
                          <Link
                            to={`/admin/noticias?post=${selectedTask.article.postId}`}
                            className="w-full sm:w-auto px-3 py-2.5 bg-blue-50 text-[#013388] hover:bg-blue-100 font-bold text-xs rounded-xl flex items-center justify-center gap-1 transition-all"
                          >
                            <Edit2 className="w-3.5 h-3.5" /> Editar
                          </Link>
                        )}
                      </div>
                    </div>

                    {/* ENTREGABLE 2: REEL VERTICAL 9:16 */}
                    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs space-y-3">
                      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                        <div className="flex items-center gap-2">
                          <Film className="w-4 h-4 text-pink-600" />
                          <h4 className="text-xs font-black uppercase text-pink-900 tracking-wider">
                            Reel Audiovisual Vertical (9:16)
                          </h4>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase ${
                          selectedTask.reel?.status === 'aprobada' || selectedTask.reel?.status === 'publicada'
                            ? 'bg-emerald-100 text-emerald-800'
                            : selectedTask.reel?.status === 'lista'
                            ? 'bg-pink-100 text-pink-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {selectedTask.reel?.status || "En cola"}
                        </span>
                      </div>

                      {selectedTask.reel?.videoUrl ? (
                        <div className="bg-slate-900 text-white rounded-xl p-4 border border-slate-800 flex flex-col sm:flex-row gap-4 items-center">
                          <div className="relative w-44 aspect-[9/16] bg-black rounded-lg overflow-hidden shadow-xl shrink-0">
                            <video
                              src={selectedTask.reel.videoUrl}
                              poster={selectedTask.reel.posterUrl || selectedTask.media.coverUrl || undefined}
                              controls
                              className="w-full h-full object-cover"
                            />
                          </div>

                          <div className="flex-1 space-y-3 text-xs">
                            <div>
                              <span className="text-[10px] font-black uppercase tracking-wider text-pink-400 block mb-0.5">
                                Video Vertical Listo
                              </span>
                              <h5 className="font-bold text-white leading-snug">
                                {selectedTask.title}
                              </h5>
                              <p className="text-[11px] text-slate-300 mt-1">
                                {selectedTask.reel.durationSec ? `${selectedTask.reel.durationSec}s · ` : ""}
                                Formato 1080 × 1920 (9:16)
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <a
                                href={selectedTask.reel.videoUrl}
                                target="_blank"
                                rel="noreferrer"
                                download
                                className="px-3 py-2 bg-pink-600 hover:bg-pink-700 text-white font-black text-xs rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
                              >
                                <Download className="w-3.5 h-3.5" /> Descargar MP4
                              </a>
                              <button
                                onClick={() => handleGenerateReel(selectedTask)}
                                className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors"
                              >
                                <RefreshCw className="w-3.5 h-3.5" /> Regenerar
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="p-3 rounded-lg bg-pink-50/70 border border-pink-200 text-xs text-pink-950 flex items-start gap-2.5">
                            <span className="text-xl">🎬</span>
                            <div className="leading-relaxed">
                              <b>Camila (Video IA):</b> Genera una pieza cinematográfica vertical 9:16 a partir de las fotografías adjuntas utilizando Kling/Luma.
                              <span className="block text-[11px] text-pink-800 mt-0.5">
                                Fotografías adjuntas: {selectedTask.media.imageCount} (requiere al menos 5 para resultado cinematográfico óptimo).
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={() => handleGenerateReel(selectedTask)}
                            className="w-full py-2.5 bg-pink-600 hover:bg-pink-700 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs transition-all"
                          >
                            <Zap className="w-4 h-4 text-pink-200" />
                            <span>PRODUCIR REEL VERTICAL IA AHORA</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* ENTREGABLE 3: COPYS PARA REDES SOCIALES CON COPIA RÁPIDA */}
                    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs space-y-3">
                      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                        <div className="flex items-center gap-2">
                          <Share2 className="w-4 h-4 text-indigo-600" />
                          <h4 className="text-xs font-black uppercase text-indigo-900 tracking-wider">
                            Copys Redactados para Redes Sociales
                          </h4>
                        </div>
                        <span className="text-[10px] text-gray-400">Lucas · Difusión</span>
                      </div>

                      {/* Copy Facebook */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-blue-700 uppercase flex items-center gap-1">
                            Facebook Post
                          </span>
                          <button
                            onClick={() =>
                              handleCopyToClipboard(
                                `${selectedTask.title}\n\n${selectedTask.article?.excerpt || selectedTask.subtitle}\n\nDescubre más en nuestro portal distrital.`,
                                "Copy de Facebook"
                              )
                            }
                            className="text-[10px] font-bold text-gray-500 hover:text-gray-800 flex items-center gap-1"
                          >
                            <Copy className="w-3 h-3" /> Copiar
                          </button>
                        </div>
                        <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-700 leading-relaxed">
                          {selectedTask.title} — {selectedTask.article?.excerpt || selectedTask.subtitle}
                        </div>
                      </div>

                      {/* Copy X */}
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-gray-800 uppercase flex items-center gap-1">
                            𝕏 (Twitter) Post
                          </span>
                          <button
                            onClick={() =>
                              handleCopyToClipboard(
                                `${selectedTask.title.slice(0, 160)}... #Rotary #Distrito4281`,
                                "Copy de X"
                              )
                            }
                            className="text-[10px] font-bold text-gray-500 hover:text-gray-800 flex items-center gap-1"
                          >
                            <Copy className="w-3 h-3" /> Copiar
                          </button>
                        </div>
                        <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-700 leading-relaxed font-mono">
                          {selectedTask.title.slice(0, 200)} #Rotary #Distrito4281
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── TAB 4: DISTRIBUCIÓN MULTI-TENANT & REDES ── */}
                {drawerTab === "distribution" && (
                  <div className="space-y-5">
                    {/* MATRIZ DE DESTINOS */}
                    <div className="rounded-xl border border-gray-200 p-4 bg-white shadow-xs">
                      <div className="flex items-center gap-1.5 text-xs font-black text-gray-900 uppercase tracking-wider mb-2">
                        <Globe className="w-4 h-4 text-[#013388]" />
                        <span>Matriz de Destinos Multi-Tenant</span>
                      </div>

                      <p className="text-[11px] text-gray-500 mb-3">
                        Activa los portales web donde se difundirá este contenido:
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
                            Difundir en sede central del Distrito
                          </span>
                        </label>
                      </div>
                    </div>

                    {/* REDES SOCIALES CONECTADAS */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Facebook */}
                      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-black text-gray-900 flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded bg-blue-600 text-white flex items-center justify-center text-[10px]">f</span>
                              Facebook Fanpage
                            </span>
                            {selectedTask.social?.hasFacebook ? (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-100 text-emerald-800">
                                Publicado
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-gray-100 text-gray-600">
                                Pendiente
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-500 mb-2">
                            {selectedTask.social?.hasFacebook
                              ? "Post publicado en el muro oficial de la Fanpage."
                              : "Pendiente de emitir en la Fanpage vinculada."}
                          </p>
                        </div>
                        {selectedTask.social?.facebook?.externalUrl && (
                          <a
                            href={selectedTask.social.facebook.externalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" /> Ver post en Facebook
                          </a>
                        )}
                      </div>

                      {/* X */}
                      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-black text-gray-900 flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded bg-black text-white flex items-center justify-center text-[10px]">𝕏</span>
                              X (Twitter)
                            </span>
                            {selectedTask.social?.hasX ? (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-100 text-emerald-800">
                                Publicado
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-gray-100 text-gray-600">
                                Pendiente
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-500 mb-2">
                            {selectedTask.social?.hasX
                              ? "Post emitido en la cuenta de X con enlace al blog."
                              : "Pendiente de publicar en la cuenta de X."}
                          </p>
                        </div>
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

                    {/* BOTÓN DE DIFUSIÓN INMEDIATA */}
                    <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="text-xs text-gray-600">
                        <p className="font-bold text-gray-800">Difusión inmediata en redes</p>
                        <p className="text-[11px] text-gray-500">
                          Dispara la publicación del enlace en Fanpage y X reutilizando la arquitectura social.
                        </p>
                      </div>

                      <button
                        onClick={() => handleShareSocial(selectedTask)}
                        className="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs transition-all shrink-0"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        <span>DIFUNDIR EN FANPAGE & X</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* ── TAB 5: HISTORIAL Y BITÁCORA INALTERABLE ── */}
                {drawerTab === "history" && (
                  <div className="space-y-5">
                    {/* Formulario de Nueva Nota Interna */}
                    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs space-y-3">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-[#013388]" />
                        <h4 className="text-xs font-black uppercase text-gray-900 tracking-wider">
                          Registrar Nota Interna en Bitácora
                        </h4>
                      </div>

                      <textarea
                        value={historyNote}
                        onChange={(e) => setHistoryNote(e.target.value)}
                        placeholder="Escribe una observación, instrucción operativa o apunte sobre esta solicitud..."
                        rows={3}
                        className="w-full p-2.5 border border-gray-300 rounded-lg text-xs text-gray-800 focus:ring-2 focus:ring-[#013388] outline-none"
                      />

                      <div className="flex justify-end">
                        <button
                          onClick={() => handleAddHistoryNote(selectedTask.id)}
                          disabled={!historyNote.trim()}
                          className="px-4 py-2 bg-[#013388] hover:bg-[#002266] text-white font-bold text-xs rounded-lg transition-colors disabled:opacity-40"
                        >
                          Guardar en bitácora
                        </button>
                      </div>
                    </div>

                    {/* Timeline de Eventos */}
                    <div className="space-y-3">
                      <span className="text-[11px] font-black uppercase tracking-wider text-gray-500 block">
                        Línea de Tiempo Operativa ({taskDetails?.events?.length ?? 0} eventos)
                      </span>

                      {taskDetails?.events && taskDetails.events.length > 0 ? (
                        <div className="relative pl-6 space-y-4 before:absolute before:top-2 before:bottom-2 before:left-2.5 before:w-0.5 before:bg-gray-200">
                          {taskDetails.events.map((evt) => {
                            let iconBg = "bg-blue-100 text-[#013388]";
                            let icon = <Clock className="w-3 h-3" />;

                            if (evt.type.includes("status") || evt.type.includes("transition")) {
                              iconBg = "bg-emerald-100 text-emerald-800";
                              icon = <ChevronRight className="w-3 h-3" />;
                            } else if (evt.type.includes("cover")) {
                              iconBg = "bg-amber-100 text-amber-800";
                              icon = <Star className="w-3 h-3" />;
                            } else if (evt.type.includes("note")) {
                              iconBg = "bg-purple-100 text-purple-800";
                              icon = <MessageSquare className="w-3 h-3" />;
                            } else if (evt.type.includes("share")) {
                              iconBg = "bg-indigo-100 text-indigo-800";
                              icon = <Share2 className="w-3 h-3" />;
                            }

                            return (
                              <div key={evt.id} className="relative group">
                                <div
                                  className={`absolute -left-6 top-1 w-5 h-5 rounded-full flex items-center justify-center ring-4 ring-white ${iconBg}`}
                                >
                                  {icon}
                                </div>

                                <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-2xs space-y-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-bold text-gray-900">
                                      {evt.type.replace(/_/g, " ").toUpperCase()}
                                    </span>
                                    <span className="text-[10px] text-gray-400">
                                      {new Date(evt.createdAt).toLocaleString("es-CO", {
                                        day: "numeric",
                                        month: "short",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                  </div>

                                  <div className="text-xs text-gray-600">
                                    {evt.detail || evt.reference || "Evento registrado por el sistema"}
                                  </div>

                                  {(evt.actorName || evt.actor) && (
                                    <div className="text-[10px] text-gray-400 pt-1 flex items-center gap-1">
                                      <User className="w-3 h-3" />
                                      <span>Por: {evt.actorName || evt.actor}</span>
                                      {evt.channel && <span>· Canal: {evt.channel}</span>}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="py-8 text-center text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-xs">
                          Sin eventos registrados para esta solicitud
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── LIGHTBOX MODAL PARA VISTA PREVIA DE IMÁGENES (FASE 2) ── */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[10020] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-5xl max-h-[92vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxImage}
              alt="Vista previa ampliada"
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
            <div className="mt-3 flex items-center gap-3">
              <a
                href={lightboxImage}
                target="_blank"
                rel="noreferrer"
                download
                className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition-colors flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Descargar original
              </a>
              <button
                onClick={() => setLightboxImage(null)}
                className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition-colors flex items-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" /> Cerrar
              </button>
            </div>
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
