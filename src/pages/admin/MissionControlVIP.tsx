import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "../../hooks/useAuth";
import {
  LayoutDashboard,
  Zap,
  Target,
  History,
  CheckCircle2,
  X,
  MoreHorizontal,
  MessageSquare,
  Loader2,
  ShieldCheck,
  AlertCircle,
  Activity,
  Terminal,
  Settings,
  Plus,
  Search,
  ChevronRight,
  SearchCode,
  Filter,
  MessageCircle,
  ArrowRightCircle,
  ExternalLink,
  Database,
  Mail,
  Check,
  Edit2,
  PlayCircle,
  FileText,
  Settings2,
  Trash2,
  GripVertical,
  StopCircle,
  Clock,
  Image,
  Package,
  Minimize2,
  Square,
  Maximize2,
} from "lucide-react";

const getApiBase = () => {
  const envApi = import.meta.env.VITE_API_URL;
  if (envApi && envApi !== "/api") return envApi.replace(/\/$/, "");
  return `${window.location.origin}/api`;
};

const API_BASE = getApiBase();

// In production (Vercel), we must use /vps for the QR gateway to trigger vercel.json rewrites bypassing Vercel's strict /api/ lock.
const VITE_API_URL = import.meta.env.VITE_API_URL || "";
const QR_API = VITE_API_URL
  ? VITE_API_URL
  : import.meta.env.PROD
    ? "/vps"
    : "/api";

// --- DATA TYPES ---
interface Agent {
  id: string;
  name: string;
  icon: string;
  color: string;
  status: "online" | "busy" | "idle";
}

interface Goal {
  id: string;
  title: string;
  description: string;
  status: "active" | "completed" | "paused";
  progress: number;
  total: number;
  current: number;
  assignedAgents: string[];
}

interface Task {
  id: string;
  title: string;
  description: string;
  category: string;
  agentId: string;
  time: string;
  priority: "High" | "Medium" | "Low";
  status: "backlog" | "todo" | "in_progress" | "peer_review" | "done";
  details?: {
    gaps: string[];
    quality: string;
    source: string;
    link: string;
  };
}

interface ActivityLog {
  id: string;
  agentName: string;
  content: string;
  time: string;
  type: "peer_review" | "heartbeat" | "execution";
}

// --- MOCK DATA BASED ON SCREENSHOTS ---
const AGENTS: Agent[] = [
  {
    id: "rafael",
    name: "Rafael",
    icon: "🤖",
    color: "bg-blue-600",
    status: "online",
  },
  {
    id: "mateo",
    name: "Mateo",
    icon: "🍷",
    color: "bg-red-600",
    status: "busy",
  },
  {
    id: "sofia",
    name: "Sofía",
    icon: "⚔️",
    color: "bg-slate-700",
    status: "online",
  },
  {
    id: "valeria",
    name: "Valeria",
    icon: "🐉",
    color: "bg-emerald-600",
    status: "busy",
  },
  {
    id: "diego",
    name: "Diego",
    icon: "🐺",
    color: "bg-amber-600",
    status: "idle",
  },
];
import { IMPLEMENTATIONS } from "./DashboardOverview";

const getGoalsFromStorage = (): Goal[] => {
  try {
    const saved = localStorage.getItem("__impl_states");
    const src = saved ? JSON.parse(saved) : IMPLEMENTATIONS;
    return src
      .filter((i: any) => i.status === "active")
      .map((impl: any) => ({
        id: impl.id,
        title: impl.name,
        description: impl.description,
        status: "active",
        current: impl.load > 0 ? impl.load : 50,
        total: 100,
        progress: impl.load > 0 ? impl.load : 50,
        assignedAgents: ["rafael", "mateo", "valeria", "sofia", "diego"].slice(
          0,
          impl.agents || 2,
        ),
      }));
  } catch (e) {
    return [];
  }
};

const INITIAL_GOALS = getGoalsFromStorage();

const HQDashboard: React.FC = () => {
  const { token } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewDensity, setViewDensity] = useState<'compact' | 'normal' | 'expanded'>('normal');
  const [showCovers, setShowCovers] = useState(true);
  const [missionControlLogo, setMissionControlLogo] = useState<string | null>(null);
  const [crmPulse, setCrmPulse] = useState<any>(null);

  useEffect(() => {
    fetch(`${API_BASE}/analytics/crm-pulse`)
      .then(res => res.ok ? res.json() : null)
      .then(data => setCrmPulse(data))
      .catch(console.error);
  }, []);

  useEffect(() => {
    // Fetch Global Setup Images
    fetch(`${API_BASE}/clubs/_global/site-images`)
      .then((r) => r.ok ? r.json() : {})
      .then((d) => {
        if (d.missionControl?.url && d.missionControl.url !== 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&h=100&fit=crop') {
          setMissionControlLogo(d.missionControl.url);
        }
      })
      .catch(() => {});

    const fetchTasks = () => {
      fetch(`${API_BASE}/scout-grants`)
        .then((res) => res.json())
        .then((data) => {
          const mappedTasks: Task[] = data.map((g: any) => {
            let parsedMeta = g.metadata;
            if (typeof parsedMeta === "string") {
              try {
                parsedMeta = JSON.parse(parsedMeta);
              } catch (e) {}
            }
            return {
              id: g.id,
              title: g.title,
              description: g.description,
              category: g.matchCategory || "Oportunidad",
              agentId: g.agentId || "rafael",
              time: new Date(g.createdAt).toLocaleString(),
              priority: g.priority || "High",
              status: g.status || "backlog",
              details: parsedMeta || { link: g.sourceUrl || "" },
            };
          });

          // Deduplicate tasks by title to hide repetitive executions from N8N
          const uniqueTasks = mappedTasks.filter(
            (task, index, self) =>
              index === self.findIndex((t) => t.title === task.title),
          );

          setTasks(uniqueTasks);
          setIsLoadingTasks(false);
        })
        .catch(() => {
          setTasks([]);
          setIsLoadingTasks(false);
        });
    };

    // Fetch immediately
    fetchTasks();

    // Start real-time polling every 5 seconds to simulate liveliness of subagents
    const intervalId = setInterval(fetchTasks, 5000);

    return () => clearInterval(intervalId);
  }, []);

  // --- WHATSAPP BROADCAST MODAL (PREVIOUS FEATURE) ---
  const [showPublish, setShowPublish] = useState<any>(null);
  const [chats, setChats] = useState<any[]>([]);
  const [selectedChats, setSelectedChats] = useState<string[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(false);

  // Filter tasks by searchQuery and columns matching the new visual structure
  const filteredTasks = tasks.filter((t) => 
    searchQuery === "" || 
    t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase())) || 
    (t.category && t.category.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const boardCols = {
    "Oportunidades": filteredTasks.filter((t) => ["backlog", "todo"].includes(t.status)),
    "En Progreso": filteredTasks.filter((t) => t.status === "in_progress"),
    "En Revisión": filteredTasks.filter((t) => t.status === "done"),
    "Compartidos": filteredTasks.filter((t) => t.status === "verified"),
  };

  const fetchChats = async () => {
    setIsLoadingChats(true);
    try {
      const res = await fetch(`${QR_API}/whatsapp-qr/chats?_t=${Date.now()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      });
      const data = await res.json();
      if (data.success) {
        setChats(data.chats || []);
      } else {
        toast.error("Error cargando chats de WhatsApp Web");
      }
    } catch (e) {
      toast.error("Grave: Sin conexión con WhatsApp Web QR");
    } finally {
      setIsLoadingChats(false);
    }
  };

  useEffect(() => {
    if (showPublish) fetchChats();
  }, [showPublish]);

  const handleShareGrant = async (
    network: "whatsapp" | "email",
    task: Task,
  ) => {
    if (network === "whatsapp") {
      setShowPublish(task);
      setSelectedChats([]);
    } else {
      alert(`Plantilla de Email preparada para: ${task.title}`);
    }
  };

  const handleBroadcastWhatsApp = async () => {
    if (!selectedChats.length)
      return toast.error("Selecciona al menos un chat destino");
    const rawText =
      (showPublish.details as any)?.final_whatsapp_message ||
      showPublish.description;
    const sourceLink =
      (showPublish.details as any)?.link || showPublish.sourceUrl || "";

    let parsed = rawText;
    parsed = parsed.replace(/^.*?:\s*\n+/ims, "").trim();
    parsed = parsed.replace(
      /([?!]\s*(?:[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])?)\s+([A-Z¿¡])/u,
      "$1\n\n$2",
    );
    parsed = parsed.replace(
      /\s*(Descubre más|Más info|Aplica aquí|Haz clic)/gi,
      "\n\n$1",
    );
    parsed = parsed.replace(/\[URL\]/gi, sourceLink).replace(/\*\*/g, "*");

    const loadingToast = toast.loading(
      `Disparando agente: enviando oportunidad a ${selectedChats.length} ecosistemas...`,
    );
    let succeses = 0;

    let mediaData: string | null = null;
    let mimetype = "image/jpeg";
    let filename = "subvencion.jpg";

    try {
      const prompt =
        showPublish.title +
        " " +
        showPublish.category +
        ", hyper-realistic, documentary photography, Rotary International style, natural lighting, perfect anatomy, high-end camera, masterpiece, cinematic, completely natural faces";
      const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1080&height=720&nologo=true&seed=${String(showPublish.id).charCodeAt(0)}`;
      const imRes = await fetch(imageUrl);
      if (imRes.ok) {
        const blob = await imRes.blob();
        mimetype = blob.type || "image/jpeg";
        const reader = new FileReader();
        mediaData = await new Promise<string>((resolve) => {
          reader.onloadend = () => {
            const b64 = reader.result as string;
            resolve(b64.split(",")[1]);
          };
          reader.readAsDataURL(blob);
        });
      }
    } catch (e) {
      console.error("Error fetching AI image:", e);
    }

    const n8nWebhook = "https://n8n-n8n.urnhq7.easypanel.host/webhook/grant-distribution";
    
    try {
      const response = await fetch(n8nWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          network: "whatsapp",
          chats: selectedChats,
          message: parsed,
          mediaData,
          mimetype,
          filename,
          grant: {
            id: showPublish.id,
            title: showPublish.title,
            category: showPublish.category,
            link: sourceLink
          }
        }),
      });

      if (response.ok) {
        succeses = selectedChats.length;
      } else {
        throw new Error("Falla en la señal de despacho n8n");
      }
    } catch (e: any) {
      console.error("n8n Dispatch Error:", e);
      toast.error(`Error de conexión con el motor de despacho: ${e.message}`);
      toast.dismiss(loadingToast);
      return;
    }

    try {
      await fetch(`${API_BASE}/scout-grants/${showPublish.id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "verified" }),
      });
      setTasks((prev) =>
        prev.map((t) =>
          t.id === showPublish.id ? { ...t, status: "verified" } : t,
        ),
      );
    } catch (e) {
      console.error(e);
    }

    toast.dismiss(loadingToast);
    toast.success(
      `Publicación enviada exitosamente a ${succeses} plataformas.`,
    );
    setShowPublish(null);
    setSelectedChats([]);
  };

  const handleDrop = async (
    e: React.DragEvent<HTMLDivElement>,
    newStatus: string,
  ) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain");
    if (!taskId) return;

    // Optimistic UI update
    const taskToUpdate = tasks.find((t) => t.id === taskId);
    const updatedTasks = tasks.map((t) => {
      if (t.id === taskId) {
        return { ...t, status: newStatus as Task["status"] };
      }
      return t;
    });
    setTasks(updatedTasks);

    try {
      await fetch(`${API_BASE}/scout-grants/${taskId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      // Si se movió a IN PROGRESS, mandamos la petición a n8n
      if (newStatus === "in_progress" && taskToUpdate) {
        const webhookUrl =
          "https://n8n-n8n.urnhq7.easypanel.host/webhook/whatsapp-copy-generator";
        fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: taskId,
            title: taskToUpdate.title,
            description: taskToUpdate.description,
            url: taskToUpdate.details?.link || "",
          }),
        }).catch(console.error);
      }
    } catch (error) {
      console.error("Error updating priority via API", error);
    }
  };

  const handleDeleteTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("¿Estás seguro de que deseas eliminar esta publicación?"))
      return;

    // Optimistic delete
    setTasks((prev) => prev.filter((t) => t.id !== taskId));

    try {
      await fetch(`${API_BASE}/scout-grants/${taskId}`, {
        method: "DELETE",
      });
      // toast.success('Publicación eliminada');
    } catch (error) {
      console.error("Error deleting task:", error);
      // toast.error('No se pudo eliminar la publicación');
    }
  };

  const handleTriggerAI = async () => {
    try {
      // Reemplaza con la URL correcta del Trigger N8N (Webhook Run Now UI)
      const n8nWebhook =
        "https://n8n-n8n.urnhq7.easypanel.host/webhook/trigger-orchestrator";
      await fetch(n8nWebhook, { method: "POST", mode: "no-cors" });
      alert(
        "¡Señal enviada a N8N!\n\nPerplexity e IA han despertado. Observa el tablero, las nuevas tarjetas empezarán a fluir entre columnas pronto.",
      );
    } catch (error) {
      console.error("Error triggering AI pipeline manually", error);
      alert("Error de conexión con el motor IA.");
    }
  };

  return (
    <div className="fixed inset-0 bg-[#F1F5F9] text-gray-800 font-sans z-[9999] overflow-hidden flex flex-col">
      {/* AGENT BAR (TOP) */}
      <div className="h-14 bg-[#013388] px-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide py-2">
          {missionControlLogo ? (
            <img src={missionControlLogo} alt="Mission Control VIP" className="h-8 w-auto object-contain mr-3 shrink-0" />
          ) : (
            <span className="text-[10px] font-black text-white/50 uppercase tracking-widest mr-3 shrink-0">
              Mission Control
            </span>
          )}
          <div className="h-4 w-[1px] bg-white/20 mx-2 hidden sm:block shrink-0" />
          <span className="text-[10px] font-black text-white/50 uppercase tracking-widest mr-3 shrink-0">
            Agentes
          </span>
          {AGENTS.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center gap-2 bg-black/20 hover:bg-black/30 px-3 py-1.5 rounded-lg border border-white/10 transition-all cursor-pointer"
            >
              <div className="relative">
                <span className="text-sm">{agent.icon}</span>
                <div
                  className={`absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-[#013388] ${agent.status === "online" ? "bg-emerald-500" : "bg-red-500"}`}
                />
              </div>
              <span className="text-[11px] font-bold text-white pr-1">
                {agent.name}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleTriggerAI}
            className="bg-amber-500 hover:bg-amber-400 text-amber-950 font-bold px-4 py-1.5 rounded-lg flex items-center gap-2 text-xs transition-all shadow-lg animate-pulse"
          >
            <Zap className="w-4 h-4" />
            EJECUTAR PIPELINE IA ⚡
          </button>
          <button
            onClick={() => window.close()}
            className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex overflow-hidden">
        {/* COLUMN 1: GOALS (LEFT) */}
        <div className="w-[300px] border-r border-gray-200 bg-white/50 flex flex-col">
          <div className="p-4 flex items-center justify-between border-b border-gray-100 uppercase">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-[#013388]" />
              <span className="text-[11px] font-black text-gray-400 tracking-widest">
                Objetivos
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-gray-400">
                {INITIAL_GOALS.length}
              </span>
              <Plus className="w-3.5 h-3.5 text-gray-400" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {INITIAL_GOALS.map((goal) => (
              <div
                key={goal.id}
                onClick={() => setSelectedGoal(goal)}
                className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer hover:border-[#013388]/30"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-xs font-bold text-gray-800 leading-tight">
                    {goal.title}
                  </h4>
                  <div className="bg-blue-50 text-[#013388] text-[9px] font-black px-1.5 py-0.5 rounded uppercase shrink-0 ml-2">
                    Activo
                  </div>
                </div>
                <p className="text-[10px] text-gray-500 mb-3 leading-tight line-clamp-2">
                  {goal.description}
                </p>
                <div className="space-y-2">
                  <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-1000"
                      style={{ width: `${goal.progress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex -space-x-1">
                      {goal.assignedAgents.map((aid) => (
                        <div
                          key={aid}
                          className="w-5 h-5 rounded-md bg-gray-100 border border-white flex items-center justify-center text-[9px] shadow-sm"
                        >
                          {AGENTS.find((a) => a.id === aid)?.icon}
                        </div>
                      ))}
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 tracking-tighter">
                      {goal.current}/{goal.total} ({goal.progress}%)
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* KANBAN BOARD (REPLACES ACTIVITY FEED AND PREVIOUS BOARD) */}
        <div className="flex-1 bg-[#F8FAFC] flex flex-col overflow-hidden">
          
          {/* KANBAN TOOLBAR */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-white/50 backdrop-blur-sm z-10 shrink-0">
            {/* Search Bar Component */}
            <div className="relative group">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 group-hover:text-[#013388] transition-colors" />
              <input 
                type="text" 
                placeholder="Buscar oportunidad o contenido por palabra clave..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-12 py-2 bg-white border border-gray-200 rounded-xl text-[11px] font-bold text-gray-700 w-[300px] focus:outline-none focus:ring-2 focus:ring-[#013388]/20 focus:border-[#013388] transition-all shadow-sm"
              />
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 px-1.5 py-0.5 bg-gray-50 border border-gray-200 rounded text-[9px] font-black text-gray-400">/</div>
            </div>

            {/* Right Tools Group Component */}
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowCovers(!showCovers)}
                className={`p-2 flex items-center justify-center border rounded-lg shadow-sm transition-all ${showCovers ? 'bg-blue-50 border-[#013388] text-[#013388]' : 'bg-white border-gray-200 text-gray-400 hover:border-[#013388] hover:bg-blue-50/30'}`}>
                <Image className="w-4 h-4" />
              </button>
              <button className="p-2 bg-white flex items-center justify-center border border-gray-200 rounded-lg shadow-sm hover:border-[#013388] hover:bg-blue-50/30 hover:text-[#013388] text-gray-400 transition-all">
                <Package className="w-4 h-4" />
              </button>
              
              <div className="flex rounded-lg shadow-sm ml-2 bg-white border border-gray-200 overflow-hidden">
                <button 
                  onClick={() => setViewDensity('compact')}
                  className={`p-2 flex items-center justify-center transition-all ${viewDensity === 'compact' ? 'bg-blue-50 text-[#013388]' : 'text-gray-400 hover:text-[#013388] hover:bg-blue-50/30'}`}>
                  <Minimize2 className="w-4 h-4" />
                </button>
                <div className="w-[1px] bg-gray-100" />
                <button 
                  onClick={() => setViewDensity('normal')}
                  className={`p-2 flex items-center justify-center transition-all ${viewDensity === 'normal' ? 'bg-blue-50 text-[#013388]' : 'text-gray-400 hover:text-[#013388] hover:bg-blue-50/30'}`}>
                  <Square className="w-4 h-4" />
                </button>
                <div className="w-[1px] bg-gray-100" />
                <button 
                  onClick={() => setViewDensity('expanded')}
                  className={`p-2 flex items-center justify-center transition-all ${viewDensity === 'expanded' ? 'bg-blue-50 text-[#013388]' : 'text-gray-400 hover:text-[#013388] hover:bg-blue-50/30'}`}>
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* COLUMNS AREA */}
          <div className="flex-1 flex overflow-x-auto p-4 gap-4 custom-scrollbar">
            {Object.entries(boardCols).map(([colName, colTasks]) => (
              <div
                key={colName}
                className="w-[320px] shrink-0 flex flex-col bg-gray-50/80 rounded-2xl border border-gray-200 overflow-hidden shadow-sm"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add("bg-blue-50/50");
                }}
                onDragLeave={(e) => {
                  e.currentTarget.classList.remove("bg-blue-50/50");
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove("bg-blue-50/50");
                  // Determine structural drop (this part requires mapping string to code-level logic, kept passive)
                }}
              >
              {/* Column Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-white">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${colName === "Oportunidades" ? "bg-gray-400" : colName === "En Progreso" ? "bg-amber-500" : colName === "En Revisión" ? "bg-orange-500" : "bg-emerald-500"}`}
                  />
                  <span className="text-[12px] font-black text-slate-800 uppercase tracking-wide">
                    {colName}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-gray-100 text-gray-500 font-bold px-2 py-0.5 rounded-full">
                    {colTasks.length}
                  </span>
                </div>
              </div>

              {/* Column Cards */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                {colTasks.map((t) => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData("text/plain", t.id)
                    }
                    onClick={() => setSelectedTask(t)}
                    className="bg-white border border-gray-200 rounded-[14px] shadow-sm hover:shadow-md hover:border-[#013388]/30 transition-all cursor-move group flex flex-col overflow-hidden"
                  >
                    {/* Card Top Icons */}
                    <div className="flex justify-between items-center p-3 pb-0">
                      <GripVertical className="w-4 h-4 text-gray-300" />
                      <div className="flex items-center gap-0.5 opacity-50 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTask(t);
                          }}
                          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-[#013388] transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTask(t);
                          }}
                          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-[#013388] transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteTask(t.id, e)}
                          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Optional Cover Image */}
                    {showCovers && viewDensity !== 'compact' && (
                      <div className="px-3">
                        <div className={`w-full rounded-lg bg-gradient-to-tr from-blue-50 to-indigo-50/30 border border-blue-100/50 flex items-center justify-center ${viewDensity === 'expanded' ? 'h-32' : 'h-24'}`}>
                          <Image className="w-6 h-6 text-blue-200" />
                        </div>
                      </div>
                    )}

                    {/* Content */}
                    <div className={`px-5 ${viewDensity === 'compact' ? 'py-1 pb-3' : 'py-2'}`}>
                      <h5 className={`font-bold text-gray-800 leading-snug mb-1.5 ${viewDensity === 'expanded' ? 'text-[14px]' : 'text-[12px] line-clamp-2'}`}>
                        {t.title}
                      </h5>
                      {viewDensity !== 'compact' && (
                        <p className="text-[10px] text-gray-400 leading-tight block">
                          ({t.category})
                        </p>
                      )}
                      
                      {viewDensity === 'expanded' && t.description && (
                        <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                          {t.description}
                        </p>
                      )}
                    </div>

                    {/* Agent Status */}
                    {viewDensity !== 'compact' && (
                      <div className="px-5 py-2 flex items-center justify-between mt-auto">
                        <div className="flex items-center gap-1.5 opacity-90">
                          <span className="text-[14px] leading-none">
                            {AGENTS.find((a) => a.id === t.agentId)?.icon || "🤖"}
                          </span>
                          <span className="text-[10px] font-bold text-[#013388]">
                            Agente{" "}
                            {AGENTS.find((a) => a.id === t.agentId)?.name ||
                              "Opus 4.5"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[9px] font-bold text-gray-400">
                          <Clock className="w-3 h-3" />{" "}
                          {t.time.split(",")[1]?.substring(0, 6).trim() || ""}
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    {viewDensity !== 'compact' && (
                      <div className="p-3 pt-2 mt-auto">
                        {colName === "Oportunidades" && (
                          <div className="flex gap-2">
                            <button className="flex-1 py-2 rounded-xl bg-gray-50 border border-gray-200 text-gray-600 text-[10px] font-black uppercase tracking-wide hover:bg-gray-100 flex items-center justify-center gap-1.5 transition-colors">
                              <Edit2 className="w-3 h-3" /> Editar
                            </button>
                            <button className="flex-1 py-2 rounded-xl bg-blue-50 border border-blue-100 text-[#013388] text-[10px] font-black uppercase tracking-wide hover:bg-blue-100 flex items-center justify-center gap-1.5 transition-colors">
                              <PlayCircle className="w-3 h-3" /> Ejecutar
                            </button>
                          </div>
                        )}
                        {colName === "En Progreso" && (
                          <div className="flex gap-2">
                            <button className="flex-1 py-2 rounded-xl bg-blue-50 border border-blue-100 text-[#013388] text-[10px] font-black uppercase tracking-wide hover:bg-blue-100 flex items-center justify-center gap-1.5 transition-colors">
                              <FileText className="w-3 h-3" /> Logs{" "}
                              <span className="bg-blue-200/50 text-[#013388] px-1.5 rounded text-[9px] ml-0.5">
                                1
                              </span>
                            </button>
                            <button className="w-10 rounded-xl bg-red-50 border border-red-100 text-red-500 hover:bg-red-100 flex items-center justify-center transition-colors">
                              <StopCircle className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        {colName === "En Revisión" && (
                          <div className="flex gap-2">
                            <button className="flex-1 py-2 rounded-xl bg-gray-50 border border-gray-200 text-gray-600 text-[10px] font-black uppercase tracking-wide hover:bg-gray-100 flex items-center justify-center gap-1.5 transition-colors">
                              <Settings2 className="w-3 h-3" /> Refinar
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleShareGrant("whatsapp", t);
                              }}
                              className="flex-[1.5] py-2 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 text-[10px] font-black uppercase tracking-wide hover:bg-emerald-100 flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                            >
                              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                            </button>
                          </div>
                        )}
                        {colName === "Compartidos" && (
                          <div className="flex gap-2">
                            <button className="flex-1 py-2 rounded-xl bg-gray-50 border border-gray-200 text-gray-600 text-[10px] font-black uppercase tracking-wide hover:bg-gray-100 flex items-center justify-center gap-1.5 transition-colors">
                              <FileText className="w-3 h-3" /> Logs
                            </button>
                            <button className="flex-1 py-2 rounded-xl bg-[#013388] text-white text-[10px] font-black uppercase tracking-wide hover:bg-blue-800 flex items-center justify-center gap-1.5 shadow-[0_2px_10px_rgba(1,51,136,0.2)] transition-colors border border-transparent">
                              <CheckCircle2 className="w-3 h-3" /> Completar
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* TASK DETAIL MODAL (PEER REVIEW STYLE) */}
      {selectedTask && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[32px] border border-gray-100 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex items-center gap-3 bg-gray-50/50">
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`text-[9px] font-black px-2 py-0.5 rounded-full text-white uppercase ${selectedTask.priority === "High" ? "bg-red-600" : "bg-slate-400"}`}
                >
                  Alta
                </span>
                <span className="bg-blue-50 text-[#013388] border border-blue-100 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter">
                  {selectedTask.category}
                </span>
                <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[9px] font-black px-2 py-0.5 rounded-full uppercase">
                  Revisión de Pares
                </span>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="ml-auto p-2 hover:bg-gray-100 hover:text-gray-600 rounded-xl transition-all"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-8 text-slate-600">
              <h2 className="text-xl font-black text-slate-800 mb-8 border-b border-gray-100 pb-4 tracking-tight">
                {selectedTask.title}
              </h2>

              <div className="space-y-8">
                {/* Base Information (Always Visible) */}
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-[#F7A81B] uppercase tracking-[0.2em] flex items-center gap-2">
                    <SearchCode className="w-4 h-4" /> Búsqueda en{" "}
                    {selectedTask.details?.source || "Fuentes Globales"}
                  </label>
                  <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100 text-sm leading-relaxed text-slate-600">
                    {selectedTask.description}
                  </div>
                  {((selectedTask.details as any)?.link ||
                    (selectedTask.details as any)?.sourceUrl) && (
                    <div className="pt-2">
                      <a
                        href={
                          (selectedTask.details as any)?.link ||
                          (selectedTask.details as any)?.sourceUrl
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-bold text-[#013388] hover:text-blue-700 transition-colors flex items-center gap-1"
                      >
                        Visualizar Fuente Original{" "}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>

                {/* Conditional Render based on Status */}
                {["backlog", "todo"].includes(selectedTask.status) && (
                  <div className="p-6 bg-emerald-50/50 border border-emerald-100 rounded-3xl flex items-start gap-4 animate-pulse">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center shadow-sm">
                      🌿
                    </div>
                    <div>
                      <p className="text-[11px] font-black text-slate-800 uppercase leading-none mb-1">
                        Valeria{" "}
                        <span className="text-slate-500 not-italic font-medium lowercase">
                          Analizando...
                        </span>
                      </p>
                      <p className="text-xs text-slate-600 font-medium">
                        Extrayendo criterios de elegibilidad y verificando
                        compatibilidad con las Áreas de Interés de Rotary.
                      </p>
                    </div>
                  </div>
                )}

                {selectedTask.status === "in_progress" && (
                  <div className="p-6 bg-red-50/50 border border-red-100 rounded-3xl flex items-start gap-4 animate-pulse">
                    <div className="w-8 h-8 rounded-lg bg-red-100 border border-red-200 flex items-center justify-center shadow-sm">
                      🍷
                    </div>
                    <div>
                      <p className="text-[11px] font-black text-slate-800 uppercase leading-none mb-1">
                        Mateo{" "}
                        <span className="text-slate-500 not-italic font-medium lowercase">
                          Redactando...
                        </span>
                      </p>
                      <p className="text-xs text-slate-600 font-medium">
                        Construyendo el texto persuasivo para distribución
                        masiva por WhatsApp basado en los lineamientos del
                        distrito.
                      </p>
                    </div>
                  </div>
                )}

                {selectedTask.status === "done" && (
                  <div className="p-6 bg-blue-50/30 border border-blue-100 rounded-3xl">
                    <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
                      <div className="w-8 h-8 rounded-lg bg-red-100 border border-red-200 flex items-center justify-center shadow-sm">
                        🍷
                      </div>
                      <div>
                        <p className="text-[11px] font-black text-slate-800 uppercase leading-none">
                          Mateo{" "}
                          <span className="text-emerald-500 not-italic font-medium lowercase">
                            Subvención Lista (Resolución Exitosa)
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-center">
                      <div className="w-full max-w-[420px] bg-[#EFEAE2] rounded-xl overflow-hidden shadow-sm border border-gray-200 mx-auto transition-transform hover:scale-[1.01]">
                        <div className="relative h-[400px] bg-slate-900 overflow-hidden flex items-center justify-center">
                          {((selectedTask.details as any)?.image_url) ? (
                            <img
                              src={(selectedTask.details as any).image_url}
                              alt="Infografía Nano-Banana 2"
                              className="w-full h-full object-contain object-center scale-105"
                            />
                          ) : (
                            <img
                              src={`https://image.pollinations.ai/prompt/${encodeURIComponent(selectedTask.title + " " + selectedTask.category + ", hyper-realistic, documentary photography, Rotary International style, natural lighting, perfect anatomy, high-end camera, masterpiece, cinematic, completely natural faces")}?width=1080&height=720&nologo=true&seed=${String(selectedTask.id).charCodeAt(0)}`}
                              alt="AI Generated Grant Image"
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                        <div className="p-4 bg-white m-3 rounded-lg shadow-sm border border-gray-100">
                          <div className="text-[#111B21] text-[14.5px] leading-relaxed whitespace-pre-wrap font-sans">
                            {(() => {
                              const rawText = (selectedTask.details as any)
                                ?.final_whatsapp_message as string;
                              if (!rawText)
                                return "No se detectó texto. Asegúrate de ejecutar el nuevo pipeline de N8N.";

                              const sourceLink =
                                (selectedTask.details as any)?.link ||
                                selectedTask.sourceUrl ||
                                "";

                              let parsed = rawText;
                              // 1. Remove introductory AI text like "¡Claro que sí! Aquí tienes..."
                              parsed = parsed
                                .replace(/^.*?:\s*\n+/ims, "")
                                .trim();
                              // 2. Add line break after Hook (sentence ending in ? or ! optionally followed by an emoji) if no linebreak exists
                              parsed = parsed.replace(
                                /([?!]\s*(?:[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])?)\s+([A-Z¿¡])/u,
                                "$1\n\n$2",
                              );
                              // 3. Add line break before CTA
                              parsed = parsed.replace(
                                /\s*(Descubre más|Más info|Aplica aquí|Haz clic)/gi,
                                "\n\n$1",
                              );
                              // 4. Inject URL and fix bold
                              parsed = parsed
                                .replace(/\[URL\]/gi, sourceLink)
                                .replace(/\*\*/g, "*");

                              return parsed;
                            })()}
                          </div>
                        </div>
                        <div className="h-2 bg-[#EFEAE2]"></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Interactive Chat Input */}
            <div className="p-6 bg-gray-50 border-t border-gray-100 flex items-center gap-4">
              <div className="flex-1 relative group">
                <input
                  type="text"
                  placeholder="Instrucción adicional para el agente..."
                  className="w-full bg-white border border-gray-200 p-4 pl-6 pr-14 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[#013388]/30 transition-all placeholder:text-gray-400 shadow-sm"
                />
                <button className="absolute right-3 top-1/2 -translate-y-1/2 bg-[#013388] hover:bg-blue-800 text-white p-2 rounded-xl transition-colors">
                  <ArrowRightCircle className="w-5 h-5" />
                </button>
              </div>
              <button className="p-3 bg-red-50 text-red-600 border border-red-100 rounded-2xl hover:bg-red-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GOAL DETAIL MODAL */}
      {selectedGoal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <div className="bg-[#0F172A] w-full max-w-2xl rounded-[32px] border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-white/10 flex items-center gap-3 bg-black/20">
              <div className="flex items-center gap-2 shrink-0">
                <Target className="w-5 h-5 text-[#F7A81B]" />
                <span className="bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest">
                  Objetivo Maestro
                </span>
              </div>
              <button
                onClick={() => setSelectedGoal(null)}
                className="ml-auto p-2 hover:bg-white/10 rounded-xl transition-all"
              >
                <X className="w-5 h-5 text-white/50" />
              </button>
            </div>

            <div className="p-8 text-slate-300 space-y-8">
              <div>
                <h2 className="text-2xl font-black text-white tracking-tight mb-2">
                  {selectedGoal.title}
                </h2>
                <p className="text-sm font-medium leading-relaxed text-slate-400">
                  {selectedGoal.description}
                </p>
              </div>

              {/* CRM PULSE DATA INTEGRATION */}
              {selectedGoal.id === 'crm-pulse' && crmPulse && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 p-6 rounded-[24px]">
                    <div className="flex items-center gap-3 text-emerald-400 mb-2">
                      <Target className="w-4 h-4" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Conversion Rate</span>
                    </div>
                    <p className="text-3xl font-black text-white">{crmPulse.leads.conversionRate}%</p>
                    <p className="text-[10px] text-emerald-400/60 font-bold mt-1 uppercase tracking-tight">Leads convertidos hoy</p>
                  </div>
                  <div className="bg-blue-500/10 border border-blue-500/20 p-6 rounded-[24px]">
                    <div className="flex items-center gap-3 text-blue-400 mb-2">
                      <Users className="w-4 h-4" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Active Members</span>
                    </div>
                    <p className="text-3xl font-black text-white">{crmPulse.membership.total}</p>
                    <p className="text-[10px] text-blue-400/60 font-bold mt-1 uppercase tracking-tight">Total base de datos</p>
                  </div>
                </div>
              )}

              <div className="p-6 bg-slate-900 border border-white/5 rounded-3xl">
                <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-4">
                  Progreso de Motores Estocásticos ({selectedGoal.progress}%)
                </h3>
                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden mb-6">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-1000"
                    style={{ width: `${selectedGoal.progress}%` }}
                  />
                </div>

                <div className="space-y-4">
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Agentes Asignados y Operatividad
                  </h3>
                  {selectedGoal.assignedAgents.map((aid) => {
                    const agent = AGENTS.find((a) => a.id === aid);
                    return agent ? (
                      <div
                        key={aid}
                        className="flex items-center gap-4 bg-white/5 p-3 rounded-2xl border border-white/5"
                      >
                        <div className="w-10 h-10 rounded-xl bg-black/30 border border-white/10 flex items-center justify-center text-lg shadow-inner">
                          {agent.icon}
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-bold text-white mb-0.5">
                            {agent.name}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            Ejecutando Workflows en Perplexity Pro para{" "}
                            {selectedGoal.title.substring(0, 15)}...
                          </p>
                        </div>
                        <div className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-black rounded-lg border border-emerald-500/20 uppercase tracking-widest">
                          Activo
                        </div>
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WHATSAPP PUBLISH MODAL */}
      {showPublish && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[10001] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-xl rounded-[32px] border border-gray-100 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 max-h-[85vh]">
            <div className="p-6 border-b border-gray-100 flex items-center gap-3 bg-gray-50/50">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-800 tracking-tight">
                  Publicar Subvención
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  Asigna y dispersa usando WhatsApp Autónomo
                </p>
              </div>
              <button
                onClick={() => {
                  setShowPublish(null);
                  setSelectedChats([]);
                }}
                className="ml-auto p-2 hover:bg-gray-100 hover:text-gray-600 rounded-xl transition-all"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-white">
              <h3 className="text-[10px] font-black text-slate-400 tracking-widest uppercase mb-4">
                Destinos Disponibles (Sesión QR Autónoma)
              </h3>
              {isLoadingChats ? (
                <div className="flex flex-col items-center justify-center py-12 opacity-60">
                  <Loader2 className="w-8 h-8 text-[#013388] animate-spin mb-4" />
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                    Sincronizando chats en tiempo real...
                  </p>
                </div>
              ) : chats.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                  <p className="text-sm font-bold text-slate-500 mb-2">
                    No hay conectividad con Nodo de Meta
                  </p>
                  <p className="text-xs text-slate-400">
                    Verifica que tu sesión QR de SuperAdmin esté enlazada.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {chats.map((chat) => {
                    const isSelected = selectedChats.includes(chat.id);
                    return (
                      <div
                        key={chat.id}
                        onClick={() =>
                          setSelectedChats((prev) =>
                            isSelected
                              ? prev.filter((c) => c !== chat.id)
                              : [...prev, chat.id],
                          )
                        }
                        className={`p-3.5 rounded-[20px] border cursor-pointer transition-all flex items-center gap-3 ${isSelected ? "border-emerald-500 bg-emerald-50 scale-[1.02] shadow-sm" : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"}`}
                      >
                        <div
                          className={`w-5 h-5 flex items-center justify-center shrink-0 transition-colors ${isSelected ? "bg-emerald-500 text-white rounded-full" : "bg-transparent border-2 border-gray-200 rounded-full"}`}
                        >
                          {isSelected && (
                            <svg
                              className="w-3 h-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={3}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm font-black tracking-tight truncate ${isSelected ? "text-emerald-900" : "text-slate-700"}`}
                          >
                            {chat.name}
                          </p>
                          <p
                            className={`text-[9px] mt-0.5 uppercase tracking-widest font-black ${chat.isGroup ? "text-[#013388]" : "text-slate-400"}`}
                          >
                            {chat.isGroup ? "Grupo" : "Contacto Directo"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <span className="text-[10px] font-black tracking-wider text-slate-500 uppercase">
                {selectedChats.length} seleccionados
              </span>
              <button
                onClick={handleBroadcastWhatsApp}
                disabled={selectedChats.length === 0}
                className="px-6 py-3.5 bg-[#013388] text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-blue-800 transition-all shadow-[0_8px_20px_-6px_rgba(1,51,136,0.5)] disabled:opacity-50 disabled:shadow-none flex items-center gap-2 hover:scale-105 active:scale-95"
              >
                Disparar Flujo
              </button>
            </div>
          </div>
        </div>
      )}

      <style
        dangerouslySetInnerHTML={{
          __html: `
                .custom-scrollbar::-webkit-scrollbar { width: 5px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.05); border-radius: 10px; }
                .scrollbar-hide::-webkit-scrollbar { display: none; }
                @keyframes pulse-ring { 0% { transform: scale(0.9); opacity: 0.5; } 50% { opacity: 0.3; } 100% { transform: scale(1.3); opacity: 0; } }
            `,
        }}
      />
    </div>
  );
};

export default HQDashboard;
