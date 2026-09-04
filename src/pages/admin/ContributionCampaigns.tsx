import React, { useEffect, useMemo, useRef, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import SubmissionsPanel from '../../components/admin/contribution/SubmissionsPanel';
import SiteLocalPanel, { type SiteLocalData } from '../../components/admin/contribution/SiteLocalPanel';
import { DEFAULT_CONSENT_TEXT_HINT } from '../../lib/contentSubmissionSpec';
import MediaPicker from '../../components/admin/content-studio/MediaPicker';
import IconPicker from '../../components/admin/IconPicker';
import { toast } from 'sonner';
import {
    Megaphone, Plus, Save, ArrowLeft, Eye, Trash2, Clock, History,
    AlertTriangle, Image as ImageIcon, Upload, ChevronUp, ChevronDown, X,
    BarChart3, RefreshCw, Check, Link2, ChevronsUpDown, ChevronsDownUp, ClipboardPaste,
} from 'lucide-react';
import {
    CAMPAIGN_TYPES, campaignTypeCatalog, DEFAULT_CAMPAIGN_TYPE,
    STATUS_LABELS, canTransition, effectiveStatus, TARGETING_LABELS,
    validateStats, normalizeCenters, heroSlides, HERO_MAX_SLIDES, resolveCampaignVideo, MAX_SECTION_VIDEOS,
    MAX_GALLERY_ITEMS,
    type CampaignStatus, type TargetingMode, type ContributionCenter,
} from '../../lib/contributionSpec';
import {
    FEED_METRICS, METRIC_KEYS, SOURCE_KINDS, SOURCE_FORMATS,
    normalizeFeed, validateFeed, formatFigure,
    DEFAULT_MAX_JUMP_PCT, MAX_SOURCES, INTERVAL_OPTIONS, FEED_PRESETS,
    type FeedSource,
} from '../../lib/emergencyFeed';
import { uploadMediaFiles, IMAGE_ACCEPT, VIDEO_ACCEPT } from '../../lib/mediaUpload';
import CampaignBoard, { CampaignIndicators, type BoardData } from '../../components/admin/contribution/CampaignBoard';

const API = import.meta.env.VITE_API_URL || '/api';

// ─── Tipos de la pantalla ────────────────────────────────────────────────────
interface Cta { label: string; url: string; action: 'donate' | 'centers' | 'link' | 'share'; }
interface WayItem { id: string; icon: string; title: string; description: string; cta: Cta; active: boolean; }
interface ReqItem { id: string; icon: string; title: string; description: string; active: boolean; }
interface InfoBlock { id: string; title: string; text: string; active: boolean; }
interface Partner { id: string; name: string; logo: string; url: string; active: boolean; }
interface Stat { id: string; label: string; value: string; source: string; updatedAt: string; active: boolean; metricKey?: string; }

interface CampaignRow {
    id: string; slug: string; name: string; campaignType: string;
    status: string; effectiveStatus?: string;
    startAt: string | null; endAt: string | null; priority: number;
    content: any; stats: Stat[]; targeting: any; feed?: any; feedRunAt?: string | null;
    recipientClubId: string | null; publishedAt: string | null; updatedAt: string;
    /** v4.987 — el DUEÑO. NULL es la campaña de la plataforma. */
    ownerClubId?: string | null;
    /** ¿La administra quien está mirando, o sólo le alcanza? */
    own?: boolean;
    /** ¿Es la que el visitante ve HOY en la página pública de este sitio? */
    showing?: boolean;
    /** v4.858 — El perfil de notificación elegido EXPRESAMENTE. `null` es
     *  «heredar», que es el valor de todas las campañas anteriores. */
    notificationProfileId?: string | null;
}

/** Los perfiles disponibles, para elegir. Se leen del módulo de
 *  Notificaciones: duplicar el catálogo daría dos listas que se separan. */
interface PerfilNotif { id: string; name: string; active: boolean }

/** Una propuesta de la lectura automatizada (v4.825). */
interface Reading {
    id: string; sourceId: string; sourceName: string | null; url: string | null;
    metric: string; label: string;
    before: number | null; after: number;
    cutoff: string | null; cutoffLabel: string; quote: string | null;
    warnings: string[]; state: string; autoPublished: boolean;
    decidedBy: string | null; createdAt: string;
}

interface ClubOption { id: string; name: string; type?: string; district?: string; }

const emptyCta = (): Cta => ({ label: '', url: '', action: 'link' });

const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('rotary_token')}`,
});

// datetime-local ↔ ISO. El input trabaja en hora local; se guarda ISO.
const toLocalInput = (iso: string | null): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string): string | null => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

// ─── Piezas visuales (a nivel de módulo: nada de hooks en .map) ─────────────
const field = 'mt-1.5 w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white outline-none transition-all font-medium text-sm';
const lbl = 'text-xs font-bold text-gray-400 uppercase tracking-wider';

// El contenedor de cada sección, PLEGABLE (v4.826).
//
// Nace CERRADO y ésa es la decisión: con catorce secciones abiertas a la vez,
// llegar a la que se quiere tocar eran varias pantallas de desplazamiento.
// Cerradas, el editor entero es un índice de una pantalla y se abre sólo lo
// que se va a editar. La preferencia se recuerda entre visitas.
//
// El contenido se DESMONTA al cerrar, no se esconde con CSS: todo el estado
// del formulario vive en `c`, no en el DOM, así que no se pierde nada — y un
// campo escondido con `hidden` lo siguen encontrando el buscador del
// navegador y el lector de pantalla.
//
// `warn` es lo que impide que plegar esconda un problema: una sección cerrada
// con avisos los DICE en su cabecera. Es la regla de v4.790 — el diagnóstico
// va donde se mira primero.
//
// Sin hooks a propósito: el estado abierto/cerrado vive en el padre, que es
// lo que permite «Expandir todo» y lo que evita un hook dentro de un `.map`.
// ─── Pegar centros desde una hoja de cálculo (v4.994) ─────────────────────
//
// Va en el ÁMBITO DEL MÓDULO, no dentro de la pantalla: un componente
// declarado dentro de otro es un tipo NUEVO en cada render y el textarea
// perdería el foco tras una letra (v4.971).
//
// El parseo y la detección de repetidos los hace el SERVIDOR (un solo
// criterio); esto pinta la vista previa y deja ELEGIR: lo repetido exacto nace
// desmarcado, lo probable marcado y con su aviso, y nada se guarda hasta
// pulsar «Guardar centros» — el mismo botón de siempre.
type PastePreviewRow = Partial<ContributionCenter> & {
    _row?: number; _deductions?: string[];
    duplicate?: 'exact' | 'probable' | null; duplicateOf?: string | null;
};
interface PastePreview {
    headerDetected: boolean; columns: string[];
    centers: PastePreviewRow[];
    skipped: { row: number; reason: string }[];
    exact: { row: number; center: string; matches: string }[];
    probable: { row: number; center: string; matches: string }[];
}

const CentersPastePanel: React.FC<{
    campaignId: string;
    existing: Partial<ContributionCenter>[];
    onAdd: (rows: Partial<ContributionCenter>[]) => void;
}> = ({ campaignId, existing, onAdd }) => {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [preview, setPreview] = useState<PastePreview | null>(null);
    const [picked, setPicked] = useState<Record<number, boolean>>({});

    const analizar = async () => {
        setBusy(true);
        try {
            const r = await fetch(`${API}/contribution-campaigns/${campaignId}/centers/preview`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ text, existing }),
            });
            const raw = await r.text();
            let d: any = null;
            try { d = JSON.parse(raw); } catch { /* HTML de error: se dice abajo */ }
            if (!r.ok || !d) throw new Error(d?.error || `El servidor respondió ${r.status} sin JSON`);
            const p = d as PastePreview;
            setPreview(p);
            const sel: Record<number, boolean> = {};
            for (const c of p.centers) sel[c._row as number] = c.duplicate !== 'exact';
            setPicked(sel);
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo leer lo pegado');
        } finally {
            setBusy(false);
        }
    };

    const elegidos = preview ? preview.centers.filter(c => picked[c._row as number]) : [];

    const agregar = () => {
        onAdd(elegidos.map(({ _row, _deductions, duplicate, duplicateOf, ...c }) => ({
            ...c, id: `center-${Date.now()}-${_row}`, active: true,
        })));
        toast.success(`${elegidos.length} centro(s) agregados a la lista — falta «Guardar centros»`);
        setPreview(null); setText(''); setOpen(false);
    };

    if (!open) {
        return (
            <button type="button" onClick={() => setOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-rotary-blue bg-rotary-blue/5 hover:bg-rotary-blue/10 transition">
                <ClipboardPaste className="w-4 h-4" /> Pegar desde Excel
            </button>
        );
    }

    return (
        <div className="border-2 border-dashed border-sky-200 rounded-2xl p-4 space-y-3 bg-sky-50/40">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="font-bold text-gray-900 text-sm">Pegar desde una hoja de cálculo</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Copiá las filas del Excel (con o sin encabezado) y pegalas acá. Columnas que se reconocen:
                        Ciudad · Punto de acopio · Dirección · Nombre de contacto · Teléfono (y, si están, Sector, Horario, Notas).
                        Una dirección de dos renglones pone el segundo en el complemento; «Norte 1» se lee como el sector «Norte».
                        Los que ya existan se marcan como repetidos.
                    </p>
                </div>
                <button type="button" onClick={() => { setOpen(false); setPreview(null); }} className="p-1.5 rounded-lg hover:bg-white text-gray-400" aria-label="Cerrar">
                    <X className="w-4 h-4" />
                </button>
            </div>
            {!preview && (
                <>
                    <textarea className={`${field} font-mono text-xs min-h-[140px]`} value={text} onChange={e => setText(e.target.value)}
                        placeholder={'Ciudad\tPunto de acopio\tDirección\tNombre de contacto\tTeléfono\nBogotá\tQuinta Paredes\tCra 44 #24A - 57\tNubia Sarmiento\t3102393037'} />
                    <button type="button" onClick={analizar} disabled={busy || !text.trim()}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-rotary-blue text-white hover:bg-sky-800 disabled:bg-gray-200 disabled:text-gray-400 transition">
                        {busy ? 'Leyendo…' : 'Analizar lo pegado'}
                    </button>
                </>
            )}
            {preview && (
                <div className="space-y-3">
                    <p className="text-sm text-gray-700">
                        Se leyeron <strong>{preview.centers.length}</strong> centro(s){preview.headerDetected ? ' (con encabezado)' : ' (sin encabezado: se asumió el orden Ciudad · Punto · Dirección · Contacto · Teléfono)'}.
                        {preview.exact.length > 0 && <> <strong className="text-red-600">{preview.exact.length} repetido(s)</strong> con lo que ya hay — desmarcados.</>}
                        {preview.probable.length > 0 && <> <strong className="text-amber-600">{preview.probable.length} posible(s) repetido(s)</strong> — marcados, revisalos.</>}
                        {preview.skipped.length > 0 && <> <strong className="text-amber-600">{preview.skipped.length} fila(s) descartada(s)</strong>: {preview.skipped.map(s => `fila ${s.row} ${s.reason}`).join(', ')}.</>}
                    </p>
                    <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                        {preview.centers.map(c => {
                            const row = c._row as number;
                            const tone = c.duplicate === 'exact' ? 'border-red-200 bg-red-50/60' : c.duplicate === 'probable' ? 'border-amber-200 bg-amber-50/60' : 'border-gray-100 bg-white';
                            return (
                                <li key={row} className={`border rounded-xl p-3 flex gap-3 ${tone}`}>
                                    <input type="checkbox" className="w-4 h-4 mt-1 accent-rotary-blue flex-shrink-0" checked={!!picked[row]}
                                        aria-label={`Agregar: ${c.city} ${c.address}`}
                                        onChange={e => setPicked({ ...picked, [row]: e.target.checked })} />
                                    <div className="text-sm min-w-0">
                                        <p className="font-bold text-gray-900">
                                            {c.city}{c.groupLabel ? ` · ${c.groupLabel}` : ''}{c.name ? ` · ${c.name}` : ''}
                                            <span className="text-gray-400 font-normal text-xs ml-2">fila {row}</span>
                                        </p>
                                        <p className="text-gray-700" data-no-translate>{c.address}{c.complement ? ` — ${c.complement}` : ''}</p>
                                        {(c.contactName || c.phone) && (
                                            <p className="text-gray-500 text-xs" data-no-translate>{[c.contactName, c.phone].filter(Boolean).join(' · ')}</p>
                                        )}
                                        {c.duplicate === 'exact' && <p className="text-red-600 text-xs mt-1">Repetido: ya existe «{c.duplicateOf}».</p>}
                                        {c.duplicate === 'probable' && <p className="text-amber-700 text-xs mt-1">Posible repetido de «{c.duplicateOf}» — misma placa; comprobá antes de guardar.</p>}
                                        {(c._deductions || []).length > 0 && <p className="text-gray-400 text-xs mt-1">{(c._deductions || []).join(' · ')}</p>}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={agregar} disabled={!elegidos.length}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-rotary-blue text-white hover:bg-sky-800 disabled:bg-gray-200 disabled:text-gray-400 transition">
                            <Plus className="w-4 h-4" /> Agregar {elegidos.length} centro(s) a la lista
                        </button>
                        <button type="button" onClick={() => setPreview(null)} className="px-4 py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:bg-white transition">
                            Volver a pegar
                        </button>
                    </div>
                    <p className="text-xs text-gray-400">Agregar sólo los pone en la lista de arriba: quedan guardados al pulsar «Guardar centros».</p>
                </div>
            )}
        </div>
    );
};

const Card: React.FC<{
    id: string; title: string; hint?: string;
    open: boolean; onToggle: (id: string) => void;
    icon?: React.ReactNode; action?: React.ReactNode; warn?: number;
    children: React.ReactNode;
}> = ({ id, title, hint, open, onToggle, icon, action, warn = 0, children }) => (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 md:px-8">
            <button type="button" onClick={() => onToggle(id)}
                aria-expanded={open} aria-controls={`card-${id}`}
                className="flex-1 flex items-center gap-3 py-5 md:py-6 text-left group">
                <ChevronDown className={`w-5 h-5 flex-shrink-0 text-gray-400 group-hover:text-rotary-blue transition-transform ${open ? '' : '-rotate-90'}`} />
                {icon}
                <span className="flex-1 min-w-0">
                    <span className="block text-lg font-bold text-gray-800 group-hover:text-rotary-blue transition-colors">{title}</span>
                    {/* La ayuda sólo con la sección abierta: cerrada, el
                        título tiene que caber en una línea para que la lista
                        se pueda recorrer de un vistazo. */}
                    {hint && open && <span className="block text-xs text-gray-400 mt-1">{hint}</span>}
                </span>
                {warn > 0 && (
                    <span className="flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700"
                        title={`${warn} aviso(s) en esta sección`}>
                        {warn} aviso{warn > 1 ? 's' : ''}
                    </span>
                )}
            </button>
            {action}
        </div>
        {open && <div id={`card-${id}`} className="px-6 md:px-8 pb-6 md:pb-8">{children}</div>}
    </div>
);

// Los ids de las secciones plegables. En UN solo sitio porque los consume
// «Expandir todo»: con la lista escrita dos veces, una sección nueva se
// quedaría fuera del botón sin que nada avisara.
// Sin comentarios DENTRO del array: test:contribution lo lee con JSON.parse.
const CARD_IDS = [
    'identidad', 'alcance', 'notificaciones', 'solicitudes', 'hero', 'aporte', 'ayudar', 'requeridos',
    'galeria', 'centros', 'panorama', 'lectura', 'bloques', 'cierre',
    'aliados', 'seo', 'resultados', 'historial',
    'local',
];

const STATUS_CHIP: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    scheduled: 'bg-sky-50 text-sky-700',
    active: 'bg-emerald-50 text-emerald-700',
    paused: 'bg-amber-50 text-amber-700',
    finished: 'bg-slate-100 text-slate-500',
    archived: 'bg-gray-100 text-gray-400',
};

const StatusChip: React.FC<{ status: string }> = ({ status }) => (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ${STATUS_CHIP[status] || STATUS_CHIP.draft}`}>
        {STATUS_LABELS[status as CampaignStatus] || status}
    </span>
);

const CtaEditor: React.FC<{ value: Cta; onChange: (c: Cta) => void; label: string }> = ({ value, onChange, label }) => (
    <div className="border border-gray-100 rounded-2xl p-4">
        <p className={lbl}>{label}</p>
        <div className="grid sm:grid-cols-3 gap-3 mt-1">
            <input className={field} placeholder="Texto del botón" value={value.label}
                onChange={e => onChange({ ...value, label: e.target.value })} />
            <select className={field} value={value.action}
                onChange={e => onChange({ ...value, action: e.target.value as Cta['action'] })}>
                <option value="donate">Abrir formulario de aporte</option>
                <option value="centers">Ir a centros de acopio</option>
                <option value="share">Compartir la campaña</option>
                <option value="link">Enlace</option>
            </select>
            {value.action === 'link' && (
                <input className={field} placeholder="https://… o /ruta" value={value.url}
                    onChange={e => onChange({ ...value, url: e.target.value })} />
            )}
        </div>
    </div>
);

// Controles de una fila de lista: subir / bajar / quitar.
const RowTools: React.FC<{ onUp: () => void; onDown: () => void; onRemove: () => void }> = ({ onUp, onDown, onRemove }) => (
    <div className="flex items-center gap-1">
        <button type="button" onClick={onUp} aria-label="Subir" className="p-1.5 rounded-lg text-gray-400 hover:text-rotary-blue hover:bg-gray-50"><ChevronUp className="w-4 h-4" /></button>
        <button type="button" onClick={onDown} aria-label="Bajar" className="p-1.5 rounded-lg text-gray-400 hover:text-rotary-blue hover:bg-gray-50"><ChevronDown className="w-4 h-4" /></button>
        <button type="button" onClick={onRemove} aria-label="Quitar" className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50"><X className="w-4 h-4" /></button>
    </div>
);

// ─── La pantalla ─────────────────────────────────────────────────────────────
const ContributionCampaigns: React.FC = () => {
    // Listado
    const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
    // v4.990 — El tablero. Va APARTE del listado a propósito: es más caro de
    // calcular y no puede retrasar —ni tumbar— la lista de campañas, que es
    // para lo que se entra a esta pantalla.
    const [board, setBoard] = useState<BoardData | null>(null);
    const [cargandoBoard, setCargandoBoard] = useState(true);
    const [loading, setLoading] = useState(true);
    // ⚠️ EL ALCANCE LO DICE EL SERVIDOR, NO EL DOMINIO (v4.987). Es la MISMA
    // pantalla para el operador y para un sitio: lo que cambia es qué
    // campañas entran y qué se puede tocar de cada una. Deducirlo acá sería
    // un segundo criterio sobre lo mismo, y se separaría en silencio.
    const [scope, setScope] = useState<'platform' | 'site'>('platform');
    const esOperador = scope === 'platform';
    // La campaña abierta: ¿es suya (se administra entera) o sólo le alcanza
    // (se administra su información local)?
    const [own, setOwn] = useState(true);
    const [local, setLocal] = useState<SiteLocalData | null>(null);
    const [clubs, setClubs] = useState<ClubOption[]>([]);
    const [perfilesNotif, setPerfilesNotif] = useState<PerfilNotif[]>([]);

    // Alta
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState('');
    const [newType, setNewType] = useState(DEFAULT_CAMPAIGN_TYPE);
    const [creating, setCreating] = useState(false);

    // Qué secciones están abiertas. Vive acá y no en cada Card: es lo que
    // permite «Expandir todo» y lo que evita un hook dentro de un `.map`.
    // Se recuerda entre visitas — quien trabaja sobre una sección vuelve a
    // ella, y volver a plegarlo todo en cada carga sería trabajo repetido.
    const [openCards, setOpenCards] = useState<Record<string, boolean>>(() => {
        try { return JSON.parse(localStorage.getItem('contrib_cards_open') || '{}'); } catch { return {}; }
    });
    const isOpen = (id: string) => openCards[id] === true;
    const toggleCard = (id: string) => setOpenCards(prev => {
        const next = { ...prev, [id]: !prev[id] };
        try { localStorage.setItem('contrib_cards_open', JSON.stringify(next)); } catch { /* modo privado */ }
        return next;
    });
    const todasAbiertas = CARD_IDS.every(id => openCards[id] === true);
    const setAllCards = (open: boolean) => setOpenCards(() => {
        const next = open ? Object.fromEntries(CARD_IDS.map(id => [id, true])) : {};
        try { localStorage.setItem('contrib_cards_open', JSON.stringify(next)); } catch { /* modo privado */ }
        return next;
    });

    // Editor
    const [c, setC] = useState<CampaignRow | null>(null);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [publishErrors, setPublishErrors] = useState<string[]>([]);
    const [history, setHistory] = useState<{ action: string; actor: string | null; createdAt: string }[]>([]);
    const [showHistory, setShowHistory] = useState(false);

    // Centros de acopio (F3): tabla propia, guardado aparte del documento de
    // la campaña — el editor trabaja sobre la lista entera, como los bloques
    // de pago. Sólo edita los CENTRALES; los locales de cada club son de F4.
    // Lectura automatizada del panorama (v4.825). Las propuestas viven en su
    // propia tabla y se cargan aparte: un fallo acá no puede impedir editar
    // el resto de la campaña.
    const [readings, setReadings] = useState<Reading[]>([]);
    const [reading, setReading] = useState(false);

    const [centers, setCenters] = useState<Partial<ContributionCenter>[]>([]);
    const [centersDirty, setCentersDirty] = useState(false);
    const [savingCenters, setSavingCenters] = useState(false);

    // Métricas (F5): contadores agregados de la campaña abierta.
    const [metrics, setMetrics] = useState<{ type: string; count: number; amountSum: number; currency: string | null }[] | null>(null);

    // Imágenes: UN MediaPicker por pantalla, con pickerField diciendo a dónde
    // va lo elegido (regla v4.700). La subida comparte el mismo destino.
    const [pickerField, setPickerField] = useState<string | null>(null);
    const uploadFieldRef = useRef<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const mixedInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    const now = new Date();

    // El tablero se pide en paralelo con el listado y NO lo bloquea: si falla,
    // las campañas se listan igual y arriba no se pinta nada (v4.650 — antes
    // ningún indicador que un cero inventado).
    useEffect(() => {
        (async () => {
            try {
                const r = await fetch(`${API}/contribution-campaigns/board`, { headers: authHeaders() });
                if (r.ok) setBoard(await r.json());
            } catch { /* el listado no depende de esto */ }
            finally { setCargandoBoard(false); }
        })();
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const rc = await fetch(`${API}/contribution-campaigns`, { headers: authHeaders() });
                const dc = rc.ok ? await rc.json() : { campaigns: [] };
                setCampaigns(Array.isArray(dc?.campaigns) ? dc.campaigns : []);
                const operador = dc?.scope !== 'site';
                setScope(operador ? 'platform' : 'site');

                // El catálogo de sitios y los perfiles de notificación son del
                // OPERADOR: pedirlos desde un sitio sería un 403 garantizado.
                if (operador) {
                    const rClubs = await fetch(`${API}/admin/clubs`, { headers: authHeaders() });
                    const dClubs = rClubs.ok ? await rClubs.json() : [];
                    setClubs((Array.isArray(dClubs) ? dClubs : []).map((x: any) => ({
                        id: x.id, name: x.name, type: x.type, district: x.district,
                    })));
                    // Los perfiles NO tumban la carga si fallan: la campaña se
                    // configura igual y el selector queda vacío con su aviso.
                    fetch(`${API}/notification-profiles`, { headers: authHeaders() })
                        .then(r => (r.ok ? r.json() : []))
                        .then(d => setPerfilesNotif(Array.isArray(d) ? d.map((p: any) => ({ id: p.id, name: p.name, active: p.active })) : []))
                        .catch(() => { /* se configura igual sin el selector */ });
                }
            } catch {
                toast.error('No se pudieron cargar las campañas');
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const openCampaign = async (id: string) => {
        try {
            const r = await fetch(`${API}/contribution-campaigns/${id}`, { headers: authHeaders() });
            if (!r.ok) throw new Error();
            const d = await r.json();
            setC(d.campaign);
            // `own` viene del SERVIDOR: es la frontera entre administrar la
            // campaña entera y administrar lo que este sitio le agrega.
            const esPropia = d.own !== false;
            setOwn(esPropia);
            setLocal(d.local || null);
            setPublishErrors(Array.isArray(d.publishErrors) ? d.publishErrors : []);
            setHistory(Array.isArray(d.history) ? d.history : []);
            setDirty(false);
            // Los centros viven en su tabla: se cargan aparte y un fallo acá
            // no impide editar el resto de la campaña.
            setCenters([]); setCentersDirty(false); setMetrics(null); setReadings([]);
            // v4.988 — una campaña AJENA se edita en el mismo editor: se piden
            // también sus centros, sus lecturas y sus métricas.
            try {
                const rr = await fetch(`${API}/contribution-campaigns/${id}/readings?state=pendiente`, { headers: authHeaders() });
                const dr = rr.ok ? await rr.json() : null;
                if (Array.isArray(dr?.readings)) setReadings(dr.readings);
            } catch { /* la bandeja aparece vacía; lo demás sigue */ }
            try {
                const rc = await fetch(`${API}/contribution-campaigns/${id}/centers`, { headers: authHeaders() });
                const dc = rc.ok ? await rc.json() : null;
                if (Array.isArray(dc?.centers)) setCenters(dc.centers);
            } catch { /* la card avisa vacía; guardar sigue funcionando */ }
            try {
                const rm = await fetch(`${API}/contribution-campaigns/${id}/metrics`, { headers: authHeaders() });
                const dm = rm.ok ? await rm.json() : null;
                if (Array.isArray(dm?.totals)) setMetrics(dm.totals);
            } catch { /* sin métricas, la tarjeta lo dice */ }
        } catch {
            toast.error('No se pudo abrir la campaña');
        }
    };

    const saveCenters = async () => {
        if (!c) return;
        setSavingCenters(true);
        try {
            const r = await fetch(`${API}/contribution-campaigns/${c.id}/centers`, {
                method: 'PUT', headers: authHeaders(), body: JSON.stringify({ centers }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.error);
            setCenters(Array.isArray(d.centers) ? d.centers : []);
            setCentersDirty(false);
            if (Array.isArray(d.skipped) && d.skipped.length > 0) {
                toast.warning(`Centros guardados; ${d.skipped.length} descartado(s) por datos incompletos`);
            } else {
                toast.success('Centros de acopio guardados');
            }
        } catch (e: any) {
            toast.error(e?.message || 'No se pudieron guardar los centros');
        } finally {
            setSavingCenters(false);
        }
    };

    const patch = (updates: Partial<CampaignRow>) => {
        setC(prev => (prev ? { ...prev, ...updates } : prev));
        setDirty(true);
    };
    // Cuántas solicitudes hay, para el rótulo de la cabecera. Lo reporta el
    // propio panel al cargarlas: una segunda consulta daría dos números que
    // pueden discrepar.
    const [solicitudes, setSolicitudes] = useState(0);
    const sub = (c?.content?.submissions) || {};
    const patchSubmissions = (updates: any) => {
        setC(prev => (prev ? {
            ...prev,
            content: { ...prev.content, submissions: { ...(prev.content?.submissions || {}), ...updates } },
        } : prev));
        setDirty(true);
    };

    const patchContent = (updates: any) => {
        setC(prev => (prev ? { ...prev, content: { ...prev.content, ...updates } } : prev));
        setDirty(true);
    };

    const create = async () => {
        if (!newName.trim()) return;
        setCreating(true);
        try {
            const r = await fetch(`${API}/contribution-campaigns`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ name: newName.trim(), campaignType: newType }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.error);
            setShowCreate(false); setNewName('');
            setCampaigns(prev => [{ ...d.campaign, effectiveStatus: 'draft' }, ...prev]);
            await openCampaign(d.campaign.id);
            toast.success('Campaña creada como borrador');
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo crear la campaña');
        } finally {
            setCreating(false);
        }
    };

    const save = async () => {
        if (!c) return;
        setSaving(true);
        try {
            const r = await fetch(`${API}/contribution-campaigns/${c.id}`, {
                method: 'PUT', headers: authHeaders(),
                body: JSON.stringify({
                    name: c.name, campaignType: c.campaignType,
                    startAt: c.startAt, endAt: c.endAt, priority: c.priority,
                    content: c.content, stats: c.stats, targeting: c.targeting,
                    feed: c.feed, recipientClubId: c.recipientClubId,
                }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.error);
            setC(prev => (prev ? { ...prev, ...d.campaign } : prev));
            setPublishErrors(Array.isArray(d.publishErrors) ? d.publishErrors : []);
            setCampaigns(prev => prev.map(x => (x.id === d.campaign.id ? { ...x, ...d.campaign } : x)));
            setDirty(false);
            toast.success('Campaña guardada');
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo guardar');
        } finally {
            setSaving(false);
        }
    };

    const transition = async (to: string) => {
        if (!c) return;
        if (dirty) { toast.error('Guardá los cambios antes de cambiar el estado'); return; }
        try {
            const r = await fetch(`${API}/contribution-campaigns/${c.id}/status`, {
                method: 'POST', headers: authHeaders(), body: JSON.stringify({ status: to }),
            });
            const d = await r.json();
            if (r.status === 422 && Array.isArray(d?.errors)) {
                setPublishErrors(d.errors);
                toast.error('La campaña no está lista para publicarse — mirá los motivos');
                return;
            }
            if (!r.ok) throw new Error(d?.error);
            setC(prev => (prev ? { ...prev, ...d.campaign } : prev));
            setCampaigns(prev => prev.map(x => (x.id === d.campaign.id ? { ...x, ...d.campaign } : x)));
            toast.success(`Estado: ${STATUS_LABELS[to as CampaignStatus] || to}`);
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo cambiar el estado');
        }
    };

    // «Ver página sin obligar a publicar»: token firmado de una hora que abre
    // la página pública en modo vista previa, con el borrador tal como está
    // GUARDADO — por eso avisa si hay cambios sin guardar.
    const openPreview = async () => {
        if (!c) return;
        if (dirty) { toast.error('Guardá los cambios: la vista previa muestra lo guardado'); return; }
        try {
            const r = await fetch(`${API}/contribution-campaigns/${c.id}/preview-token`, {
                method: 'POST', headers: authHeaders(),
            });
            const d = await r.json();
            if (!r.ok || !d?.token) throw new Error(d?.error);
            window.open(`/maneras-de-contribuir?campaignPreview=${encodeURIComponent(c.id)}&t=${encodeURIComponent(d.token)}`, '_blank', 'noopener');
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo abrir la vista previa');
        }
    };

    const removeDraft = async () => {
        if (!c) return;
        if (!window.confirm('¿Eliminar este borrador? Sólo se puede porque nunca se publicó.')) return;
        try {
            const r = await fetch(`${API}/contribution-campaigns/${c.id}`, { method: 'DELETE', headers: authHeaders() });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.error);
            setCampaigns(prev => prev.filter(x => x.id !== c.id));
            setC(null);
            toast.success('Borrador eliminado');
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo eliminar');
        }
    };

    // ── Imágenes: destino compartido de la Biblioteca y la subida ──
    // Varias imágenes de golpe: es lo que hace útil el carrusel del hero —
    // elegir cinco de la Biblioteca de a una es cinco veces el mismo gesto.
    const addHeroImages = (urls: string[]) => {
        if (!c || !urls.length) return;
        const prev = (c.content?.hero?.images || []) as { url: string; alt?: string }[];
        const next = [...prev, ...urls.map(url => ({ url, alt: '' }))].slice(0, HERO_MAX_SLIDES);
        patchContent({ hero: { ...c.content?.hero, images: next } });
    };

    // Varias piezas de galería de golpe. Fotos y videos conviven en la misma
    // lista: el tipo lo deriva la página de la propia dirección.
    const addGalleryItems = (urls: string[]) => {
        if (!c || !urls.length) return;
        const prev = (c.content?.gallery?.items || []) as any[];
        const next = [...prev, ...urls.map(url => ({ url, caption: '', credit: '', alt: '' }))].slice(0, MAX_GALLERY_ITEMS);
        patchContent({ gallery: { ...c.content?.gallery, items: next } });
    };

    // Varios videos de golpe, igual que las imágenes del hero.
    const addItemsVideos = (urls: string[]) => {
        if (!c || !urls.length) return;
        const prev = (c.content?.requiredItemsVideos?.length ? c.content.requiredItemsVideos
            : (c.content?.requiredItemsVideo?.url ? [c.content.requiredItemsVideo] : [])) as any[];
        const next = [...prev, ...urls.map(url => ({ url, title: '', poster: '' }))].slice(0, MAX_SECTION_VIDEOS);
        patchContent({ requiredItemsVideos: next });
    };

    const setImage = (target: string, url: string) => {
        if (!c) return;
        if (target === 'galleryAdd') addGalleryItems([url]);
        else if (target.startsWith('gallery:')) {
            const idx = Number(target.split(':')[1]);
            const items = [...((c.content?.gallery?.items || []) as any[])];
            if (items[idx]) { items[idx] = { ...items[idx], url }; patchContent({ gallery: { ...c.content?.gallery, items } }); }
        }
        else if (target === 'itemsVideoAdd') addItemsVideos([url]);
        else if (target.startsWith('itemsVideo:')) {
            const idx = Number(target.split(':')[1]);
            const vids = [...((c.content?.requiredItemsVideos?.length ? c.content.requiredItemsVideos
                : (c.content?.requiredItemsVideo?.url ? [c.content.requiredItemsVideo] : [])) as any[])];
            if (vids[idx]) { vids[idx] = { ...vids[idx], url }; patchContent({ requiredItemsVideos: vids }); }
        }
        else if (target === 'heroAdd') addHeroImages([url]);
        else if (target.startsWith('hero:')) {
            const idx = Number(target.split(':')[1]);
            const imgs = [...((c.content?.hero?.images || []) as any[])];
            if (imgs[idx]) { imgs[idx] = { ...imgs[idx], url }; patchContent({ hero: { ...c.content?.hero, images: imgs } }); }
        }
        else if (target === 'og') patchContent({ seo: { ...c.content?.seo, ogImage: url } });
        else if (target.startsWith('partner:')) {
            const idx = Number(target.split(':')[1]);
            const partners = [...(c.content?.partners || [])];
            if (partners[idx]) { partners[idx] = { ...partners[idx], logo: url }; patchContent({ partners }); }
        }
    };

    const onPicked = (items: { url: string }[]) => {
        // Con el hero, TODO lo elegido entra; en el resto de las casillas hay
        // un solo hueco, así que manda la primera.
        if (pickerField === 'heroAdd') addHeroImages(items.map(i => i.url).filter(Boolean));
        else if (pickerField === 'itemsVideoAdd') addItemsVideos(items.map(i => i.url).filter(Boolean));
        else if (pickerField === 'galleryAdd') addGalleryItems(items.map(i => i.url).filter(Boolean));
        else if (pickerField && items[0]?.url) setImage(pickerField, items[0].url);
        setPickerField(null);
    };

    const startUpload = (target: string) => {
        uploadFieldRef.current = target;
        // Cada destino abre el diálogo con SU tipo de archivo: ofrecerle fotos
        // a quien va a subir un video es ofrecerle lo que no sirve.
        // La galería admite las dos cosas, así que su diálogo no filtra.
        (target === 'galleryAdd' ? mixedInputRef
            : target.startsWith('itemsVideo') ? videoInputRef
                : fileInputRef).current?.click();
    };

    const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        // Limpiar el input: volver a elegir el MISMO archivo debe disparar change.
        e.target.value = '';
        const target = uploadFieldRef.current;
        if (!files.length || !target) return;
        // Sólo el hero admite varias; el resto de las casillas tiene un hueco.
        const lote = (target === 'heroAdd' || target === 'itemsVideoAdd' || target === 'galleryAdd') ? files : files.slice(0, 1);
        setUploading(true);
        try {
            const { uploaded, failed } = await uploadMediaFiles(lote);
            // Un fallo no cancela la tanda y se dice CON EL NOMBRE del archivo
            // (v4.700): «falló una de tres» obliga a adivinar cuál reintentar.
            if (failed.length) toast.error(`${failed[0].name}: ${failed[0].reason}`);
            const urls = uploaded.map(u => u.url).filter(Boolean);
            if (!urls.length) return;
            if (target === 'heroAdd') addHeroImages(urls);
            else if (target === 'itemsVideoAdd') addItemsVideos(urls);
            else if (target === 'galleryAdd') addGalleryItems(urls);
            else setImage(target, urls[0]);
            toast.success(urls.length > 1 ? `${urls.length} imágenes subidas` : 'Imagen subida');
        } catch (err: any) {
            toast.error(err?.message || 'No se pudo subir la imagen');
        } finally {
            setUploading(false);
        }
    };

    // Avisos en vivo de los indicadores (mismo criterio que el servidor).
    const statWarnings = useMemo(() => validateStats(c?.stats), [c?.stats]);
    // Lectura automatizada: el MISMO criterio y los MISMOS mensajes que el
    // servidor, para que el editor no pueda avisar una cosa y el guardado
    // rechazar otra.
    const feed = useMemo(() => normalizeFeed(c?.feed), [c?.feed]);
    const feedWarnings = useMemo(() => validateFeed(c?.feed), [c?.feed]);
    const patchFeed = (updates: Partial<ReturnType<typeof normalizeFeed>>) =>
        patch({ feed: { ...feed, ...updates } });
    const patchSources = (sources: FeedSource[]) => patchFeed({ sources });
    /** Agrega una fuente a partir de una plantilla: nombre, autoridad y
     *  formato ya puestos, que es la parte que no se puede deducir mirando
     *  una página. La dirección la pega el usuario. */
    const addSourceFromPreset = (presetId: string) => {
        const p = FEED_PRESETS.find(x => x.id === presetId);
        if (!p) return;
        patchSources([...feed.sources, {
            id: `src-${Date.now()}`, name: p.name, url: p.url,
            kind: p.kind, format: p.format, active: true,
        }]);
    };

    /** «Leer ahora»: la misma pasada que hace el cron, a pedido. */
    const runFeed = async () => {
        if (!c) return;
        if (dirty) { toast.error('Guardá los cambios antes de leer las fuentes'); return; }
        setReading(true);
        try {
            const r = await fetch(`${API}/contribution-campaigns/${c.id}/readings/run`, {
                method: 'POST', headers: authHeaders(),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.error);
            const rr = await fetch(`${API}/contribution-campaigns/${c.id}/readings?state=pendiente`, { headers: authHeaders() });
            const dr = rr.ok ? await rr.json() : null;
            if (Array.isArray(dr?.readings)) setReadings(dr.readings);
            // Cero propuestas es el resultado NORMAL —la página no cambió— y
            // se dice así: un aviso de error haría buscar una avería
            // inexistente.
            // Decir QUÉ falta, no «nada nuevo»: sin fuentes configuradas el
            // mensaje genérico hace creer que se consultó algo.
            if (d.skipped === 'sin_fuentes') toast.error('Todavía no hay ninguna fuente activa con dirección válida: agregá una abajo.');
            else if (d.skipped === 'apagada') toast.error('La lectura automática está apagada.');
            else {
                const errores = (d.fuentes || []).filter((f: any) => f.error);
                if (errores.length) toast.error(`${errores[0].name || 'Una fuente'}: ${errores[0].error}`);
                else if (d.propuestas || d.aplicadas) toast.success(`${d.propuestas} propuesta(s), ${d.aplicadas} aplicada(s) sola(s)`);
                else toast.success('Se consultaron las fuentes: nada nuevo desde la última lectura');
            }
            if (c) setC(prev => (prev ? { ...prev, feedRunAt: new Date().toISOString() } : prev));
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo consultar las fuentes');
        } finally { setReading(false); }
    };

    const decideReading = async (id: string, decision: 'aplicar' | 'descartar') => {
        if (!c) return;
        try {
            const r = await fetch(`${API}/contribution-campaigns/${c.id}/readings/${id}`, {
                method: 'POST', headers: authHeaders(), body: JSON.stringify({ decision }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.error);
            setReadings(prev => prev.filter(x => x.id !== id));
            // Aplicar reescribe los indicadores en el SERVIDOR: se toma lo que
            // devuelve, no se recalcula acá. Con dos verdades sobre los mismos
            // stats, la de la pantalla se pisa al siguiente guardado.
            if (d.campaign) setC(prev => (prev ? { ...prev, ...d.campaign } : prev));
            toast.success(decision === 'aplicar' ? 'Cifra aplicada al panorama' : 'Propuesta descartada');
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo aplicar la decisión');
        }
    };
    // Aviso en vivo de los centros: qué filas NO se van a guardar y por qué.
    const centerSkipped = useMemo(() => normalizeCenters(centers).skipped, [centers]);

    const content = c?.content || {};
    const hero = content.hero || {};
    // La lista que EDITA la pantalla. Sale de `heroSlides`, así que una
    // campaña guardada con una sola `image` aparece acá como su primera fila
    // en vez de verse vacía — y en cuanto se toque queda escrita en `images`.
    const heroImgs: { url: string; alt?: string }[] = hero.images?.length ? hero.images : heroSlides(hero);
    const patchHeroImages = (images: { url: string; alt?: string }[]) =>
        patchContent({ hero: { ...hero, images } });
    const itemsVideo = content.requiredItemsVideo || {};
    // La lista que EDITA la pantalla. Una campaña guardada con UN video
    // (v4.815) aparece acá como su primera fila en vez de verse vacía — y en
    // cuanto se toque queda escrita en `requiredItemsVideos`. Misma regla
    // aditiva que las imágenes del hero.
    const itemsVideos: { url: string; title?: string; poster?: string }[] =
        content.requiredItemsVideos?.length ? content.requiredItemsVideos
            : (itemsVideo.url ? [itemsVideo] : []);
    const patchItemsVideos = (requiredItemsVideos: any[]) => patchContent({ requiredItemsVideos });
    const gallery = content.gallery || {};
    const galleryList: any[] = gallery.items || [];
    const patchGallery = (items: any[]) => patchContent({ gallery: { ...gallery, items } });
    const donateCard = content.donateCard || {};
    const finalCta = content.finalCta || {};
    const seo = content.seo || {};
    const targeting = c?.targeting || { mode: 'clubs', districts: [], clubIds: [] };

    const moveIn = <T,>(list: T[], i: number, dir: -1 | 1): T[] => {
        const j = i + dir;
        if (j < 0 || j >= list.length) return list;
        const out = [...list];
        [out[i], out[j]] = [out[j], out[i]];
        return out;
    };

    if (loading) {
        return <AdminLayout><div className="p-12 text-center text-gray-400 italic">Cargando…</div></AdminLayout>;
    }

    // ═══ LISTADO ═══
    if (!c) {
        return (
            <AdminLayout>
                <div className="space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center">
                                <Megaphone className="w-6 h-6 text-rose-500" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Campañas de Contribución</h1>
                                <p className="text-sm text-gray-500 mt-1">
                                    {esOperador
                                        ? 'Configura una campaña y publícala en los sitios que corresponda. Sin campaña activa, cada sitio muestra su página de aportes de siempre.'
                                        : 'Crea y publica las campañas de tu sitio, y administra lo que tu sitio aporta a las que llegan del Distrito. Sin ninguna al aire, tu página de aportes se ve como siempre.'}
                                </p>
                            </div>
                        </div>
                        <button onClick={() => setShowCreate(true)}
                            className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm bg-rotary-blue text-white hover:bg-sky-800 transition-all shadow-lg active:scale-95">
                            <Plus className="w-4 h-4" /> Nueva campaña
                        </button>
                    </div>

                    {showCreate && (
                        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                            <div className="grid md:grid-cols-3 gap-4">
                                <div className="md:col-span-2">
                                    <label className={lbl}>Nombre de la campaña</label>
                                    <input className={field} autoFocus value={newName} placeholder="Ej: Emergencia terremoto Colombia 2026"
                                        onChange={e => setNewName(e.target.value)} />
                                </div>
                                <div>
                                    <label className={lbl}>Tipo</label>
                                    <select className={field} value={newType} onChange={e => setNewType(e.target.value)}>
                                        <optgroup label="Emergencias">
                                            {campaignTypeCatalog().filter(t => t.emergency).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                        </optgroup>
                                        <optgroup label="Institucionales">
                                            {campaignTypeCatalog().filter(t => !t.emergency).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                        </optgroup>
                                    </select>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 mt-4">
                                <button onClick={create} disabled={creating || !newName.trim()}
                                    className="px-5 py-2.5 rounded-xl font-bold text-sm bg-rotary-blue text-white hover:bg-sky-800 disabled:opacity-50">
                                    {creating ? 'Creando…' : 'Crear borrador'}
                                </button>
                                <button onClick={() => setShowCreate(false)} className="px-4 py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-50">Cancelar</button>
                            </div>
                        </div>
                    )}

                    {/* ═══ TABLERO ═══ Los indicadores van ENCIMA y las campañas
                        debajo, que es lo que se pidió y lo que hacen el tablero
                        de inscripciones de un evento y el Centro de Inteligencia
                        de la Feria. */}
                    <CampaignBoard board={board} cargando={cargandoBoard} />

                    {campaigns.length === 0 ? (
                        <div className="bg-white rounded-3xl p-12 border border-gray-100 text-center text-gray-400">
                            {esOperador
                                ? 'Todavía no hay campañas. Crea el borrador y configúralo sección por sección.'
                                : 'Todavía no hay ninguna campaña acá: ni propia, ni llegada del Distrito. Crea la primera con «Nueva campaña».'}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {/* La fila es un DIV con un botón adentro, no un botón
                                entero: las cifras enlazan a la Bóveda y un enlace
                                dentro de un botón no se puede pulsar por separado
                                —es la misma regla que sacó la casilla de selección
                                de dentro del botón de editar en la Biblioteca. */}
                            {campaigns.map(row => (
                                <div key={row.id}
                                    className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:border-rotary-blue/30 transition-all">
                                <button onClick={() => openCampaign(row.id)}
                                    className="w-full text-left p-5 flex flex-wrap items-center gap-3">
                                    <div className="flex-1 min-w-[220px]">
                                        <p className="font-bold text-gray-900">{row.name}</p>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            {CAMPAIGN_TYPES[row.campaignType]?.label || row.campaignType}
                                            {esOperador && <>{' · '}{TARGETING_LABELS[(row.targeting?.mode || 'clubs') as TargetingMode]}</>}
                                            {row.startAt && ` · desde ${new Date(row.startAt).toLocaleDateString('es-CO')}`}
                                            {row.endAt && ` hasta ${new Date(row.endAt).toLocaleDateString('es-CO')}`}
                                        </p>
                                    </div>
                                    {/* Quién la administra y si el visitante la está viendo
                                        HOY. Sin decirlo, una campaña propia y una que llega
                                        del Distrito se ven idénticas y no hay forma de
                                        entender por qué una se edita entera y la otra no. */}
                                    {row.showing && (
                                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-600">
                                            Se está mostrando
                                        </span>
                                    )}
                                    {!esOperador && row.own === false && (
                                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-sky-50 text-sky-600">
                                            Llega del Distrito
                                        </span>
                                    )}
                                    <StatusChip status={row.status} />
                                    {row.effectiveStatus && row.effectiveStatus !== row.status && (
                                        <span className="text-[11px] text-gray-400 flex items-center gap-1">
                                            <Clock className="w-3 h-3" /> hoy: {STATUS_LABELS[row.effectiveStatus as CampaignStatus] || row.effectiveStatus}
                                        </span>
                                    )}
                                </button>
                                {board?.filas?.some(f => f.id === row.id) && (
                                    <div className="px-5 pb-4 pt-3 border-t border-gray-50">
                                        <CampaignIndicators
                                            fila={board.filas.find(f => f.id === row.id)}
                                            nombre={row.name}
                                            medido={board.medido} />
                                    </div>
                                )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </AdminLayout>
        );
    }

    // ═══ EDITOR ═══
    const eff = effectiveStatus(c, now);
    const ways: WayItem[] = content.waysToHelp || [];
    const reqItems: ReqItem[] = content.requiredItems || [];
    const infoBlocks: InfoBlock[] = content.infoBlocks || [];
    const partners: Partner[] = content.partners || [];
    const stats: Stat[] = c.stats || [];

    return (
        <AdminLayout>
            <input ref={fileInputRef} type="file" multiple accept={IMAGE_ACCEPT} className="hidden" onChange={onFileChosen} />
            <input ref={videoInputRef} type="file" multiple accept={VIDEO_ACCEPT} className="hidden" onChange={onFileChosen} />
            <input ref={mixedInputRef} type="file" multiple accept={`${IMAGE_ACCEPT},${VIDEO_ACCEPT}`} className="hidden" onChange={onFileChosen} />
            <MediaPicker isOpen={pickerField !== null} onClose={() => setPickerField(null)} onSelect={onPicked}
                mediaType={pickerField?.startsWith('itemsVideo') ? 'video' : pickerField?.startsWith('gallery') ? 'all' : 'image'}
                maxSelection={pickerField === 'heroAdd' ? HERO_MAX_SLIDES : pickerField === 'itemsVideoAdd' ? MAX_SECTION_VIDEOS : pickerField === 'galleryAdd' ? MAX_GALLERY_ITEMS : 1} />

            <div className="space-y-6">
                {/* Cabecera */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <button onClick={() => setC(null)} aria-label="Volver al listado"
                            className="p-2.5 rounded-xl text-gray-400 hover:text-rotary-blue hover:bg-gray-50 transition">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div className="min-w-0">
                            <h1 className="text-xl font-semibold text-gray-900 tracking-tight truncate">{c.name}</h1>
                            <div className="flex items-center gap-2 mt-1">
                                <StatusChip status={c.status} />
                                {eff !== c.status && (
                                    <span className="text-[11px] text-gray-400 flex items-center gap-1">
                                        <Clock className="w-3 h-3" /> hoy se sirve como: {STATUS_LABELS[eff as CampaignStatus] || eff}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Con todas las secciones plegadas el editor entra en
                            una pantalla; abrirlas todas es para buscar algo de
                            un vistazo con el buscador del navegador. */}
                        <button onClick={() => setAllCards(!todasAbiertas)}
                            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:text-rotary-blue hover:bg-gray-50 transition">
                            {todasAbiertas
                                ? <><ChevronsDownUp className="w-4 h-4" /> Contraer todo</>
                                : <><ChevronsUpDown className="w-4 h-4" /> Expandir todo</>}
                        </button>
                        <button onClick={openPreview}
                            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:text-rotary-blue hover:bg-gray-50 transition">
                            <Eye className="w-4 h-4" /> Ver página
                        </button>
                        <button onClick={() => setShowHistory(v => !v)}
                            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:text-rotary-blue hover:bg-gray-50 transition">
                            <History className="w-4 h-4" /> Historial
                        </button>
                        <button onClick={save} disabled={saving || !dirty}
                            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all shadow-lg active:scale-95 ${dirty ? 'bg-rotary-blue text-white hover:bg-sky-800' : 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'}`}>
                            <Save className="w-4 h-4" /> {saving ? 'Guardando…' : 'Guardar'}
                        </button>
                    </div>
                </div>

                {dirty && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-center gap-2 font-medium">
                        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" /> Tienes cambios sin guardar.
                    </div>
                )}

                {/* ═══ UNA CAMPAÑA QUE LLEGA DE OTRO — v4.988 ═══
                    Se abre en ESTE editor, con las herramientas completas
                    (pedido expreso del Distrito 4281). Lo que no es de este
                    sitio es el CONTROL: publicarla, pausarla, archivarla o
                    borrarla cambia lo que ven todos los sitios a los que
                    alcanza, y eso se decide desde donde se publicó. La puerta
                    está en el servidor (`scopedCampaign`, `control`); esto
                    es lo que se pinta, y se dice por qué falta. */}
                {!own && (
                    <div className="bg-sky-50/60 rounded-2xl px-5 py-4 border border-sky-100">
                        <p className="text-sm font-bold text-gray-700">Esta campaña la publicó el Administrador del Sistema</p>
                        <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                            Alcanza a varios sitios y su contenido es compartido: lo que edites acá lo verán todos ellos.
                            {' '}{c.showing
                                ? 'Hoy es la que muestra tu página de aportes.'
                                : 'Todavía no está al aire en tu sitio.'}
                            {' '}Publicarla, pausarla o archivarla se decide desde donde se publicó; lo que tu sitio le agrega —contacto, nota, QR y centros de acopio— va en «Información local de tu sitio».
                        </p>
                    </div>
                )}

                {/* Estados */}
                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`${lbl} mr-2`}>Estado</span>
                        {!own && (
                            <span className="text-sm text-gray-500">
                                <StatusChip status={c.status} /> · el estado de una campaña compartida lo maneja el Administrador del Sistema.
                            </span>
                        )}
                        {own && ([
                            ['active', 'Publicar ahora'],
                            ['scheduled', 'Programar por fechas'],
                            ['paused', 'Pausar'],
                            ['finished', 'Finalizar'],
                            ['archived', 'Archivar'],
                            ['draft', 'Volver a borrador'],
                        ] as [string, string][]).filter(([to]) => canTransition(c.status, to)).map(([to, label]) => (
                            <button key={to} onClick={() => transition(to)}
                                className={`px-4 py-2 rounded-xl text-sm font-bold transition ${to === 'active' ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
                                {label}
                            </button>
                        ))}
                        {own && c.status === 'draft' && !c.publishedAt && (
                            <button onClick={removeDraft}
                                className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold text-red-400 hover:text-red-600 hover:bg-red-50 transition">
                                <Trash2 className="w-4 h-4" /> Eliminar borrador
                            </button>
                        )}
                    </div>
                    {own && (
                        <p className="text-xs text-gray-400 mt-3">
                            «Programar» respeta las fechas de inicio y fin; «Publicar ahora» también las respeta si están puestas.
                            Al publicar, la página de aportes de los sitios alcanzados pasa a mostrar la campaña; al despublicar, vuelven a su página de siempre.
                        </p>
                    )}
                    {publishErrors.length > 0 && (
                        <div className="mt-4 bg-red-50 border border-red-100 rounded-xl p-4">
                            <p className="text-sm font-bold text-red-700 flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4" /> Para poder publicarse falta:</p>
                            <ul className="text-sm text-red-600 space-y-1 list-disc pl-5">
                                {publishErrors.map((e, i) => <li key={i}>{e}</li>)}
                            </ul>
                        </div>
                    )}
                </div>

                {!own && (
                    <Card id="local" open={isOpen('local')} onToggle={toggleCard} title="Información local de tu sitio"
                        hint="Lo que TU sitio le agrega a esta campaña: contacto, nota, QR y centros de acopio. Se suma al contenido compartido; no lo reemplaza.">
                        <SiteLocalPanel campaignId={c.id} initial={local} />
                    </Card>
                )}

                {showHistory && (
                    <Card id="historial" open={isOpen('historial')} onToggle={toggleCard} title="Historial" hint="Quién hizo qué y cuándo. Cada cambio de estado queda registrado.">
                        {history.length === 0 ? <p className="text-sm text-gray-400 italic">Sin movimientos todavía.</p> : (
                            <ul className="space-y-2">
                                {history.map((h, i) => (
                                    <li key={i} className="text-sm text-gray-600 flex items-center gap-3">
                                        <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap">{new Date(h.createdAt).toLocaleString('es-CO')}</span>
                                        <span className="font-bold">{h.action}</span>
                                        {h.actor && <span className="text-gray-400">— {h.actor}</span>}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>
                )}

                {/* Métricas (F5) — plegable como el resto (v4.826): escrita a
                    mano quedaba fuera de «Expandir todo» y se comportaría
                    distinto que sus vecinas. */}
                <Card id="resultados" open={isOpen('resultados')} onToggle={toggleCard}
                    title="Resultados de la campaña"
                    icon={<BarChart3 className="w-5 h-5 flex-shrink-0 text-rotary-blue" />}
                    hint="Contadores propios, sin cookies ni datos personales. El monto es lo que Stripe cobró de verdad. Son cifras de ATRIBUCIÓN, no de causalidad: dicen cuántos de los que vieron esta campaña aportaron después, no que la campaña sea la causa.">
                    {!metrics || metrics.length === 0 ? (
                        <p className="text-sm text-gray-400 italic">Todavía no hay actividad registrada para esta campaña.</p>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                            {([
                                ['view', 'Vistas de la página'],
                                ['cta_donate_click', 'Abrieron el aporte'],
                                ['checkout_started', 'Iniciaron el pago'],
                                ['donation_completed', 'Aportes completados'],
                                ['cta_centers_click', 'Fueron a los centros'],
                                ['share_click', 'Compartieron'],
                            ] as [string, string][]).map(([type, label]) => {
                                const m = metrics.find(x => x.type === type);
                                const amount = type === 'donation_completed' && m?.amountSum
                                    ? new Intl.NumberFormat(m.currency === 'COP' ? 'es-CO' : 'en-US', {
                                        style: 'currency', currency: m.currency || 'USD',
                                        maximumFractionDigits: m.currency === 'COP' ? 0 : 2,
                                    }).format(Number(m.amountSum))
                                    : null;
                                return (
                                    <div key={type} className="rounded-2xl bg-gray-50/70 p-5">
                                        <p className="text-2xl font-black text-gray-900 tabular-nums">{m?.count ?? 0}</p>
                                        <p className="text-xs font-bold text-gray-500 mt-0.5">{label}</p>
                                        {amount && <p className="text-sm font-bold text-emerald-600 mt-1 tabular-nums">{amount}</p>}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Card>

                {/* Identidad */}
                <Card id="identidad" open={isOpen('identidad')} onToggle={toggleCard} title="Identidad y vigencia">
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className={lbl}>Nombre</label>
                            <input className={field} value={c.name} onChange={e => patch({ name: e.target.value })} />
                        </div>
                        <div>
                            <label className={lbl}>Tipo de campaña</label>
                            <select className={field} value={c.campaignType} onChange={e => patch({ campaignType: e.target.value })}>
                                <optgroup label="Emergencias">
                                    {campaignTypeCatalog().filter(t => t.emergency).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                </optgroup>
                                <optgroup label="Institucionales">
                                    {campaignTypeCatalog().filter(t => !t.emergency).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                </optgroup>
                            </select>
                        </div>
                        <div>
                            <label className={lbl}>Prioridad (si dos campañas alcanzan un sitio, gana la mayor)</label>
                            <input type="number" className={field} value={c.priority}
                                onChange={e => patch({ priority: Math.trunc(Number(e.target.value) || 0) })} />
                        </div>
                        <div>
                            <label className={lbl}>Inicio (opcional)</label>
                            <input type="datetime-local" className={field} value={toLocalInput(c.startAt)}
                                onChange={e => patch({ startAt: fromLocalInput(e.target.value) })} />
                        </div>
                        <div>
                            <label className={lbl}>Fin (opcional)</label>
                            <input type="datetime-local" className={field} value={toLocalInput(c.endAt)}
                                onChange={e => patch({ endAt: fromLocalInput(e.target.value) })} />
                        </div>
                    </div>
                </Card>

                {/* ⚠️ TRES SECCIONES SON DEL OPERADOR, y no por gusto:
                    · Alcance — una campaña de un sitio alcanza a SU sitio y a
                      ninguno más; el servidor lo fija al crearla y al guardar,
                      así que ofrecer el selector prometería algo que no pasa.
                    · Notificaciones — los perfiles son de la plataforma.
                    · Solicitudes — la bandeja de aportes de contenido sigue
                      siendo del operador (su ruta no se abrió), y una bandeja
                      que no se puede abrir es peor que ninguna (v4.650). */}
                {esOperador && <>
                {/* Alcance */}
                <Card id="alcance" open={isOpen('alcance')} onToggle={toggleCard} title="Alcance (targeting)" hint="En qué sitios se muestra la campaña. Los sitios no alcanzados siguen con su página de siempre.">
                    <div className="space-y-4">
                        <div className="flex gap-2 flex-wrap">
                            {(['all', 'districts', 'clubs'] as TargetingMode[]).map(m => (
                                <button key={m} type="button"
                                    onClick={() => patch({ targeting: { ...targeting, mode: m } })}
                                    className={`px-4 py-2.5 rounded-xl text-sm font-bold border-2 transition ${targeting.mode === m ? 'border-rotary-blue bg-rotary-blue/5 text-rotary-blue' : 'border-gray-100 text-gray-500 hover:border-gray-200'}`}>
                                    {TARGETING_LABELS[m]}
                                </button>
                            ))}
                        </div>
                        {targeting.mode === 'districts' && (
                            <div>
                                <label className={lbl}>Números de distrito (separados por coma)</label>
                                <input className={field} placeholder="4281, 4271"
                                    value={(targeting.districts || []).join(', ')}
                                    onChange={e => patch({
                                        targeting: {
                                            ...targeting,
                                            districts: e.target.value.split(/[^0-9]+/).filter(Boolean),
                                        },
                                    })} />
                                <p className="text-xs text-gray-400 mt-1.5">Alcanza a los sitios vinculados a esos distritos, por su vínculo o por su número — «4271, 4281» cuenta para los dos.</p>
                            </div>
                        )}
                        {targeting.mode === 'clubs' && (
                            <div>
                                <label className={lbl}>Sitios ({(targeting.clubIds || []).length} seleccionados)</label>
                                <div className="mt-1.5 max-h-64 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                                    {clubs.map(cl => {
                                        const checked = (targeting.clubIds || []).includes(cl.id);
                                        return (
                                            <label key={cl.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50">
                                                <input type="checkbox" checked={checked}
                                                    onChange={() => patch({
                                                        targeting: {
                                                            ...targeting,
                                                            clubIds: checked
                                                                ? (targeting.clubIds || []).filter((x: string) => x !== cl.id)
                                                                : [...(targeting.clubIds || []), cl.id],
                                                        },
                                                    })} className="w-4 h-4 accent-rotary-blue" />
                                                <span className="text-sm font-medium text-gray-700">{cl.name}</span>
                                                {cl.district && <span className="text-xs text-gray-400">D. {cl.district}</span>}
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </Card>

                {/* ── NOTIFICACIONES (v4.858) ─────────────────────────
                    Con qué identidad se confirma un aporte a ESTA campaña. La
                    decisión se toma donde ya se está trabajando la campaña, no
                    en una pantalla nueva: las pantallas que se olvidan son
                    siempre las del segundo lugar. */}
                <Card id="notificaciones" open={isOpen('notificaciones')} onToggle={toggleCard}
                    title="Notificaciones"
                    hint="Con qué identidad se le confirma el aporte a quien contribuye.">
                    <div className="space-y-3">
                        <label className="block">
                            <span className={lbl}>Perfil de notificación</span>
                            <select className={field} value={c.notificationProfileId || ''}
                                onChange={e => setC({ ...c, notificationProfileId: e.target.value || null })}>
                                <option value="">Heredar — el que alcance al sitio de origen</option>
                                {perfilesNotif.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}{p.active ? '' : ' (apagado)'}</option>
                                ))}
                            </select>
                        </label>
                        <p className="text-xs text-gray-500">
                            {c.notificationProfileId
                                ? 'Esta campaña usa un perfil fijo: el aporte se confirma con esa identidad venga del sitio que venga.'
                                : 'Sin elegir uno, cada aporte se confirma con el perfil que alcance al sitio desde el que se hizo. Es lo que corresponde en casi todos los casos.'}
                        </p>
                        {perfilesNotif.length === 0 && (
                            <p className="text-xs text-amber-700 flex gap-2">
                                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                                Todavía no hay ningún perfil. Se crean en «Notificaciones de Aportes»; mientras tanto,
                                los aportes se confirman con el recibo de siempre.
                            </p>
                        )}
                    </div>
                </Card>

                {/* Hero */}
                {/* ── Solicitudes de contenido (v4.968) ──────────────────
                    La recepción de material de los clubes. Va junto al resto de
                    la configuración de la campaña porque es una capacidad DE la
                    campaña, no un módulo aparte — y el contador va en la
                    cabecera para que se vea sin desplegar: plegar no puede
                    esconder que hay trabajo esperando (regla de v4.826). */}
                <Card id="solicitudes" open={isOpen('solicitudes')} onToggle={toggleCard}
                    title={`Solicitudes de contenido${solicitudes > 0 ? ` (${solicitudes})` : ''}`}
                    hint="Un formulario público para que los clubes manden fotos, videos y la historia de lo que hicieron. Nada se publica solo: todo pasa por revisión.">
                    <div className="space-y-6">
                        <div className="rounded-2xl border-2 border-gray-100 p-5">
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input type="checkbox" className="mt-1 w-5 h-5 accent-rotary-blue"
                                    checked={sub.enabled === true}
                                    onChange={e => patchSubmissions({ enabled: e.target.checked })} />
                                <span>
                                    <span className="block text-sm font-bold text-gray-800">Recibir contenido</span>
                                    <span className="block text-xs text-gray-500 mt-1 leading-relaxed">
                                        Abre el formulario público. Los archivos que lleguen quedan en un almacenamiento
                                        privado y sin dirección compartible hasta que alguien los apruebe.
                                    </span>
                                </span>
                            </label>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <label className="block">
                                <span className={lbl}>Título del formulario</span>
                                <input className={field} value={sub.headline || ''}
                                    placeholder={`Comparte lo que tu club está haciendo por ${c.name}`}
                                    onChange={e => patchSubmissions({ headline: e.target.value })} />
                            </label>
                            <label className="block">
                                <span className={lbl}>Avisar a estos correos</span>
                                <input className={field} value={(sub.notifyEmails || []).join(', ')}
                                    placeholder="comunicaciones@…, prensa@…"
                                    onChange={e => patchSubmissions({ notifyEmails: e.target.value.split(',').map((x: string) => x.trim()).filter(Boolean) })} />
                            </label>
                        </div>
                        {(!sub.notifyEmails || sub.notifyEmails.length === 0) && (
                            <p className="text-xs text-amber-700 flex gap-2">
                                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                                Sin ningún correo, el formulario recibe y no avisa a nadie: hay que acordarse de entrar a mirar.
                            </p>
                        )}

                        <label className="block">
                            <span className={lbl}>Texto de presentación</span>
                            <textarea className={`${field} min-h-[90px]`} value={sub.intro || ''}
                                placeholder="Qué se está pidiendo y para qué se va a usar."
                                onChange={e => patchSubmissions({ intro: e.target.value })} />
                        </label>

                        <label className="block">
                            <span className={lbl}>Consentimiento que se acepta al enviar</span>
                            <textarea className={`${field} min-h-[110px]`} value={sub.consentText || ''}
                                placeholder={DEFAULT_CONSENT_TEXT_HINT}
                                onChange={e => patchSubmissions({ consentText: e.target.value })} />
                        </label>
                        {/* ⚠️ NO SE INVENTAN TÉRMINOS LEGALES. La plataforma no
                            tiene hoy una política de uso de imagen que reutilizar,
                            así que el texto por defecto es un marcador y se DICE
                            que hay que reemplazarlo. */}
                        {!sub.consentText && (
                            <p className="text-xs text-amber-700 flex gap-2">
                                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                                Mientras esto esté vacío se usa un texto PROVISIONAL y el formulario público lo advierte.
                                La organización tiene que poner acá su política de uso de imagen — no la redacta la plataforma.
                            </p>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <label className="block">
                                <span className={lbl}>Mensaje de invitación para compartir</span>
                                <textarea className={`${field} min-h-[90px]`} value={sub.inviteMessage || ''}
                                    placeholder="Si lo dejás vacío se arma solo con el nombre de la campaña."
                                    onChange={e => patchSubmissions({ inviteMessage: e.target.value })} />
                            </label>
                            <label className="block">
                                <span className={lbl}>Mensaje de agradecimiento</span>
                                <textarea className={`${field} min-h-[90px]`} value={sub.thanksMessage || ''}
                                    placeholder="Lo que se ve después de enviar."
                                    onChange={e => patchSubmissions({ thanksMessage: e.target.value })} />
                            </label>
                        </div>

                        <div className="border-t border-gray-100 pt-6">
                            <SubmissionsPanel campaignId={c.id} campaignName={c.name} onCountChange={setSolicitudes} />
                        </div>
                    </div>
                </Card>

                </>}

                <Card id="hero" open={isOpen('hero')} onToggle={toggleCard} title="Hero" hint="La apertura de la campaña: título, mensaje y los dos botones.">
                    <div className="space-y-4">
                        <div><label className={lbl}>Título</label>
                            <input className={field} placeholder="COLOMBIA NOS NECESITA" value={hero.title || ''}
                                onChange={e => patchContent({ hero: { ...hero, title: e.target.value } })} /></div>
                        <div><label className={lbl}>Subtítulo</label>
                            <input className={field} value={hero.subtitle || ''}
                                onChange={e => patchContent({ hero: { ...hero, subtitle: e.target.value } })} /></div>
                        <div><label className={lbl}>Texto</label>
                            <textarea rows={3} className={`${field} resize-none`} value={hero.text || ''}
                                onChange={e => patchContent({ hero: { ...hero, text: e.target.value } })} /></div>
                        <div className="grid md:grid-cols-2 gap-4">
                            <div><label className={lbl}>Mensaje destacado</label>
                                <input className={field} placeholder="Tu ayuda hace la diferencia." value={hero.highlight || ''}
                                    onChange={e => patchContent({ hero: { ...hero, highlight: e.target.value } })} /></div>
                            <div><label className={lbl}>Etiqueta de emergencia</label>
                                <input className={field} placeholder="EMERGENCIA · TERREMOTO COLOMBIA" value={hero.badge || ''}
                                    onChange={e => patchContent({ hero: { ...hero, badge: e.target.value } })} /></div>
                        </div>
                        {/* ── Dónde y cuándo ocurrió ──
                            Campos propios desde v4.833. Hasta entonces el lugar
                            vivía dentro del título o de la etiqueta y la fecha
                            no existía en ninguna parte —la vigencia de la
                            campaña no es cuándo ocurrió el hecho—.
                            El Generador de Publicaciones los necesita para
                            poder nombrarlos: sin ellos NO los deduce del texto,
                            porque adivinar una ciudad o una fecha en una pieza
                            institucional es inventar. */}
                        <div className="grid md:grid-cols-2 gap-4">
                            <div><label className={lbl}>Lugar del hecho</label>
                                <input className={field} placeholder="San José del Palmar, Chocó — Colombia" value={content.location || ''}
                                    onChange={e => patchContent({ location: e.target.value })} />
                                <p className="text-[11px] text-gray-400 mt-1">Sin este dato, las piezas generadas no nombran el lugar.</p></div>
                            <div><label className={lbl}>Fecha del hecho</label>
                                <input className={field} placeholder="14 de agosto de 2026" value={content.eventDate || ''}
                                    onChange={e => patchContent({ eventDate: e.target.value })} />
                                <p className="text-[11px] text-gray-400 mt-1">No es la vigencia de la campaña: es cuándo ocurrió.</p></div>
                        </div>
                        {/* ── Imágenes del hero ──
                            Varias, y se van turnando cada 5 s como en la
                            portada del sitio. La `image` de una sola —de las
                            campañas guardadas antes— se sigue respetando: la
                            resuelve `heroSlides`, no esta pantalla. */}
                        <div>
                            <div className="flex items-center justify-between gap-2">
                                <label className={lbl}>Imágenes del hero</label>
                                <span className="text-[11px] text-gray-400">{heroImgs.length}/{HERO_MAX_SLIDES}</span>
                            </div>
                            <p className="text-[11px] text-gray-400 mt-1">
                                {heroImgs.length > 1
                                    ? 'Se van turnando cada 5 segundos, igual que el hero de la portada.'
                                    : 'Agregá dos o más para que se vayan turnando, igual que el hero de la portada.'}
                            </p>

                            {heroImgs.length > 0 && (
                                <div className="space-y-2 mt-2.5">
                                    {heroImgs.map((im: any, i: number) => (
                                        <div key={i} className="flex items-center gap-2 border border-gray-100 rounded-2xl p-2.5">
                                            <img src={im.url} alt={im.alt || ''} className="w-20 h-14 rounded-lg object-cover border border-gray-100 flex-shrink-0" />
                                            <div className="flex-1 min-w-0 space-y-1.5">
                                                <input className={`${field} mt-0 py-2 text-[13px]`} placeholder="URL de la imagen" value={im.url || ''}
                                                    onChange={e => patchHeroImages(heroImgs.map((x: any, j: number) => j === i ? { ...x, url: e.target.value } : x))} />
                                                <input className={`${field} mt-0 py-2 text-[13px]`} placeholder="Texto alternativo (accesibilidad)" value={im.alt || ''}
                                                    onChange={e => patchHeroImages(heroImgs.map((x: any, j: number) => j === i ? { ...x, alt: e.target.value } : x))} />
                                            </div>
                                            <div className="flex-shrink-0 flex flex-col gap-1">
                                                <RowTools
                                                    onUp={() => patchHeroImages(moveIn(heroImgs, i, -1))}
                                                    onDown={() => patchHeroImages(moveIn(heroImgs, i, 1))}
                                                    onRemove={() => patchHeroImages(heroImgs.filter((_: any, j: number) => j !== i))} />
                                                <button type="button" onClick={() => setPickerField(`hero:${i}`)}
                                                    title="Reemplazar desde la Biblioteca"
                                                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50">
                                                    <ImageIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Las DOS vías, siempre (v4.700): subir o elegir de
                                la Biblioteca. Con una sola, reutilizar una foto
                                ya cargada obligaría a descargarla y resubirla. */}
                            {heroImgs.length < HERO_MAX_SLIDES && (
                                <div className="flex items-center gap-2 mt-2.5">
                                    <button type="button" onClick={() => startUpload('heroAdd')} disabled={uploading}
                                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 disabled:opacity-50">
                                        <Upload className="w-4 h-4" /> Subir imágenes
                                    </button>
                                    <button type="button" onClick={() => setPickerField('heroAdd')}
                                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-bold text-gray-600 bg-gray-50 hover:bg-gray-100">
                                        <ImageIcon className="w-4 h-4" /> Elegir de la Biblioteca
                                    </button>
                                </div>
                            )}
                        </div>
                        <CtaEditor label="CTA primario" value={hero.ctaPrimary || { ...emptyCta(), action: 'donate' }}
                            onChange={v => patchContent({ hero: { ...hero, ctaPrimary: v } })} />
                        <CtaEditor label="CTA secundario" value={hero.ctaSecondary || { ...emptyCta(), action: 'centers' }}
                            onChange={v => patchContent({ hero: { ...hero, ctaSecondary: v } })} />
                    </div>
                </Card>

                {/* Tarjeta de aporte */}
                <Card id="aporte" open={isOpen('aporte')} onToggle={toggleCard} title="Tarjeta de aporte" hint="La tarjeta que abre el formulario de pago. Usa la pasarela de siempre: nada nuevo que configurar.">
                    <div className="space-y-4">
                        <div><label className={lbl}>Título</label>
                            <input className={field} placeholder="Aporte para la emergencia" value={donateCard.title || ''}
                                onChange={e => patchContent({ donateCard: { ...donateCard, title: e.target.value } })} /></div>
                        <div><label className={lbl}>Descripción</label>
                            <textarea rows={2} className={`${field} resize-none`} value={donateCard.description || ''}
                                onChange={e => patchContent({ donateCard: { ...donateCard, description: e.target.value } })} /></div>
                        <div className="grid md:grid-cols-2 gap-4">
                            <div><label className={lbl}>Etiqueta</label>
                                <input className={field} placeholder="EMERGENCIA · TERREMOTO COLOMBIA" value={donateCard.badge || ''}
                                    onChange={e => patchContent({ donateCard: { ...donateCard, badge: e.target.value } })} /></div>
                            <div><label className={lbl}>Texto del botón</label>
                                <input className={field} placeholder="APORTAR AHORA" value={donateCard.buttonText || ''}
                                    onChange={e => patchContent({ donateCard: { ...donateCard, buttonText: e.target.value } })} /></div>
                        </div>
                    </div>
                </Card>

                {/* Cómo ayudar */}
                <Card id="ayudar" open={isOpen('ayudar')} onToggle={toggleCard} title="¿Cómo puedes ayudar?" hint="Hasta ocho opciones con su icono, texto y botón.">
                    <div className="space-y-3">
                        {ways.map((w, i) => (
                            <div key={w.id} className="border border-gray-100 rounded-2xl p-4 space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <label className="flex items-center gap-2 text-xs font-bold text-gray-500 cursor-pointer">
                                        <input type="checkbox" checked={w.active !== false} className="w-4 h-4 accent-rotary-blue"
                                            onChange={e => patchContent({ waysToHelp: ways.map((x, j) => j === i ? { ...x, active: e.target.checked } : x) })} />
                                        Visible
                                    </label>
                                    <RowTools
                                        onUp={() => patchContent({ waysToHelp: moveIn(ways, i, -1) })}
                                        onDown={() => patchContent({ waysToHelp: moveIn(ways, i, 1) })}
                                        onRemove={() => patchContent({ waysToHelp: ways.filter((_, j) => j !== i) })} />
                                </div>
                                <input className={field} placeholder="Título" value={w.title}
                                    onChange={e => patchContent({ waysToHelp: ways.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} />
                                <IconPicker value={w.icon}
                                    suggestFrom={{ title: w.title, description: w.description }}
                                    onChange={key => patchContent({ waysToHelp: ways.map((x, j) => j === i ? { ...x, icon: key } : x) })} />
                                <textarea rows={2} className={`${field} resize-none`} placeholder="Descripción" value={w.description}
                                    onChange={e => patchContent({ waysToHelp: ways.map((x, j) => j === i ? { ...x, description: e.target.value } : x) })} />
                                <CtaEditor label="Botón" value={w.cta || emptyCta()}
                                    onChange={v => patchContent({ waysToHelp: ways.map((x, j) => j === i ? { ...x, cta: v } : x) })} />
                            </div>
                        ))}
                        <button type="button"
                            onClick={() => patchContent({ waysToHelp: [...ways, { id: `way-${Date.now()}`, icon: 'heart', title: '', description: '', cta: emptyCta(), active: true }] })}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-rotary-blue bg-rotary-blue/5 hover:bg-rotary-blue/10 transition">
                            <Plus className="w-4 h-4" /> Agregar opción
                        </button>
                    </div>
                </Card>

                {/* Elementos requeridos */}
                <Card id="requeridos" open={isOpen('requeridos')} onToggle={toggleCard} title="Elementos que se requieren" hint="La lista de suministros prioritarios.">
                    <div className="space-y-3">
                        {reqItems.map((it, i) => (
                            <div key={it.id} className="border border-gray-100 rounded-2xl p-4 space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <label className="flex items-center gap-2 text-xs font-bold text-gray-500 cursor-pointer">
                                        <input type="checkbox" checked={it.active !== false} className="w-4 h-4 accent-rotary-blue"
                                            onChange={e => patchContent({ requiredItems: reqItems.map((x, j) => j === i ? { ...x, active: e.target.checked } : x) })} />
                                        Visible
                                    </label>
                                    <RowTools
                                        onUp={() => patchContent({ requiredItems: moveIn(reqItems, i, -1) })}
                                        onDown={() => patchContent({ requiredItems: moveIn(reqItems, i, 1) })}
                                        onRemove={() => patchContent({ requiredItems: reqItems.filter((_, j) => j !== i) })} />
                                </div>
                                <input className={field} placeholder="Título (ej: Alimentos no perecederos)" value={it.title}
                                    onChange={e => patchContent({ requiredItems: reqItems.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} />
                                <IconPicker value={it.icon}
                                    suggestFrom={{ title: it.title, description: it.description }}
                                    onChange={key => patchContent({ requiredItems: reqItems.map((x, j) => j === i ? { ...x, icon: key } : x) })} />
                                <input className={field} placeholder="Descripción (opcional)" value={it.description}
                                    onChange={e => patchContent({ requiredItems: reqItems.map((x, j) => j === i ? { ...x, description: e.target.value } : x) })} />
                            </div>
                        ))}
                        <button type="button"
                            onClick={() => patchContent({ requiredItems: [...reqItems, { id: `item-${Date.now()}`, icon: 'gift', title: '', description: '', active: true }] })}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-rotary-blue bg-rotary-blue/5 hover:bg-rotary-blue/10 transition">
                            <Plus className="w-4 h-4" /> Agregar elemento
                        </button>

                        {/* ── Los videos que van DEBAJO de las cajas ──
                            Se acepta YouTube, Vimeo o un archivo de video. Lo
                            que decide si sirve es el MISMO criterio que usa la
                            página (`resolveCampaignVideo`), así que el aviso de
                            acá no puede contradecir lo que se va a pintar. */}
                        <div className="border-t border-gray-100 pt-5 mt-2">
                            <div className="flex items-center justify-between gap-2">
                                <label className={lbl}>Videos debajo de los elementos (opcional)</label>
                                <span className="text-[11px] text-gray-400">{itemsVideos.length}/{MAX_SECTION_VIDEOS}</span>
                            </div>
                            <p className="text-[11px] text-gray-400 mt-1">
                                {itemsVideos.length > 1
                                    ? 'Se recorren con las flechas, en este orden. No se cambian solos: los pasa quien mira.'
                                    : 'Agregá más de uno y se recorren con flechas, en el mismo lugar de la página.'}
                            </p>

                            {itemsVideos.length > 0 && (
                                <div className="space-y-3 mt-3">
                                    {itemsVideos.map((v: any, i: number) => {
                                        // El MISMO criterio que la página, por fila.
                                        const kind = resolveCampaignVideo(v.url);
                                        return (
                                            <div key={i} className="border border-gray-100 rounded-2xl p-4 space-y-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Video {i + 1}</span>
                                                    <RowTools
                                                        onUp={() => patchItemsVideos(moveIn(itemsVideos, i, -1))}
                                                        onDown={() => patchItemsVideos(moveIn(itemsVideos, i, 1))}
                                                        onRemove={() => patchItemsVideos(itemsVideos.filter((_: any, j: number) => j !== i))} />
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <input className={`${field} mt-0 flex-1`}
                                                        placeholder="Enlace de YouTube o Vimeo, o la URL de un video (.mp4)"
                                                        value={v.url || ''}
                                                        onChange={e => patchItemsVideos(itemsVideos.map((x: any, j: number) => j === i ? { ...x, url: e.target.value } : x))} />
                                                    <button type="button" onClick={() => setPickerField(`itemsVideo:${i}`)}
                                                        title="Elegir de la Biblioteca"
                                                        className="flex items-center gap-1.5 px-3 py-3 rounded-xl text-sm font-bold text-gray-600 bg-gray-50 hover:bg-gray-100">
                                                        <ImageIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                {/* Un enlace que no se reconoce se DICE acá,
                                                    no se descubre publicando: la página no
                                                    pinta nada y eso se lee como que falla. */}
                                                {v.url && !kind && (
                                                    <p className="text-xs text-amber-600 flex items-start gap-1.5">
                                                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                                        No se reconoce ese enlace, así que este video no se va a mostrar. Se admiten YouTube, Vimeo o un archivo .mp4/.webm servido por https.
                                                    </p>
                                                )}
                                                {kind && (
                                                    <p className="text-xs text-gray-400">
                                                        Se mostrará como {kind.kind === 'file' ? 'video propio con controles' : `video de ${kind.kind === 'youtube' ? 'YouTube' : 'Vimeo'}`}.
                                                    </p>
                                                )}
                                                <input className={`${field} mt-0 py-2 text-[13px]`} placeholder="Pie del video (opcional)"
                                                    value={v.title || ''}
                                                    onChange={e => patchItemsVideos(itemsVideos.map((x: any, j: number) => j === i ? { ...x, title: e.target.value } : x))} />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Las DOS vías, siempre (v4.700). */}
                            {itemsVideos.length < MAX_SECTION_VIDEOS && (
                                <div className="flex items-center gap-2 mt-3">
                                    <button type="button" onClick={() => startUpload('itemsVideoAdd')} disabled={uploading}
                                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 disabled:opacity-50">
                                        <Upload className="w-4 h-4" /> Subir video
                                    </button>
                                    <button type="button" onClick={() => setPickerField('itemsVideoAdd')}
                                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-bold text-gray-600 bg-gray-50 hover:bg-gray-100">
                                        <ImageIcon className="w-4 h-4" /> Elegir de la Biblioteca
                                    </button>
                                    <button type="button" onClick={() => patchItemsVideos([...itemsVideos, { url: '', title: '', poster: '' }])}
                                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-bold text-rotary-blue bg-rotary-blue/5 hover:bg-rotary-blue/10">
                                        <Plus className="w-4 h-4" /> Pegar un enlace
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* El botón que cierra la sección. Es el MISMO editor
                            que el resto de los botones de la campaña: escrito
                            aparte se separaría en silencio. */}
                        <div className="border-t border-gray-100 pt-5 mt-2">
                            <CtaEditor label="Botón al final de la sección"
                                value={content.requiredItemsCta || emptyCta()}
                                onChange={v => patchContent({ requiredItemsCta: v })} />
                            {!content.requiredItemsCta?.label && (
                                <p className="text-[11px] text-gray-400 mt-2">
                                    Sin texto se conserva el botón «Ver centros de acopio», que aparece cuando la campaña tiene centros publicados.
                                </p>
                            )}
                        </div>
                    </div>
                </Card>

                {/* Galería «Rotarios en acción» (v4.821) */}
                <Card id="galeria" open={isOpen('galeria')} onToggle={toggleCard} title="Rotarios en acción" hint="Fotos y videos que mandan los clubes. Se pintan en un carrusel entre los centros de acopio y el panorama.">
                    <div className="space-y-3">
                        <div className="grid sm:grid-cols-2 gap-3">
                            <div><label className={lbl}>Título de la sección</label>
                                <input className={field} placeholder="Rotarios en acción" value={gallery.title || ''}
                                    onChange={e => patchContent({ gallery: { ...gallery, title: e.target.value } })} /></div>
                            <div><label className={lbl}>Subtítulo (opcional)</label>
                                <input className={field} placeholder="Lo que están haciendo los clubes con tu aporte" value={gallery.subtitle || ''}
                                    onChange={e => patchContent({ gallery: { ...gallery, subtitle: e.target.value } })} /></div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1">
                            <label className={lbl}>Piezas</label>
                            <span className="text-[11px] text-gray-400">{galleryList.length}/{MAX_GALLERY_ITEMS}</span>
                        </div>
                        <p className="text-[11px] text-gray-400 -mt-2">
                            Las fotos pasan solas cada 6 segundos; sobre un video el carrusel espera — un video que se cambia mientras alguien lo está viendo es una molestia.
                        </p>

                        {galleryList.length > 0 && (
                            <div className="space-y-2">
                                {galleryList.map((it: any, i: number) => {
                                    // El MISMO criterio que la página: acá se ve
                                    // qué va a ser cada fila antes de publicar.
                                    const esVideo = !!resolveCampaignVideo(it.url);
                                    return (
                                        <div key={i} className="flex items-start gap-2 border border-gray-100 rounded-2xl p-2.5">
                                            {esVideo ? (
                                                <div className="w-20 h-14 rounded-lg bg-gray-900 text-white flex items-center justify-center flex-shrink-0 text-[10px] font-bold uppercase tracking-wider">Video</div>
                                            ) : (
                                                <img src={it.url} alt={it.alt || ''} className="w-20 h-14 rounded-lg object-cover border border-gray-100 flex-shrink-0" />
                                            )}
                                            <div className="flex-1 min-w-0 space-y-1.5">
                                                <input className={`${field} mt-0 py-2 text-[13px]`} placeholder="URL de la foto, o enlace de YouTube/Vimeo/.mp4"
                                                    value={it.url || ''}
                                                    onChange={e => patchGallery(galleryList.map((x: any, j: number) => j === i ? { ...x, url: e.target.value } : x))} />
                                                <div className="grid sm:grid-cols-2 gap-1.5">
                                                    <input className={`${field} mt-0 py-2 text-[13px]`} placeholder="Pie (opcional)" value={it.caption || ''}
                                                        onChange={e => patchGallery(galleryList.map((x: any, j: number) => j === i ? { ...x, caption: e.target.value } : x))} />
                                                    <input className={`${field} mt-0 py-2 text-[13px]`} placeholder="Crédito: qué club la mandó" value={it.credit || ''}
                                                        onChange={e => patchGallery(galleryList.map((x: any, j: number) => j === i ? { ...x, credit: e.target.value } : x))} />
                                                </div>
                                                {!esVideo && (
                                                    <input className={`${field} mt-0 py-2 text-[13px]`} placeholder="Texto alternativo (accesibilidad)" value={it.alt || ''}
                                                        onChange={e => patchGallery(galleryList.map((x: any, j: number) => j === i ? { ...x, alt: e.target.value } : x))} />
                                                )}
                                            </div>
                                            <div className="flex-shrink-0 flex flex-col gap-1">
                                                <RowTools
                                                    onUp={() => patchGallery(moveIn(galleryList, i, -1))}
                                                    onDown={() => patchGallery(moveIn(galleryList, i, 1))}
                                                    onRemove={() => patchGallery(galleryList.filter((_: any, j: number) => j !== i))} />
                                                <button type="button" onClick={() => setPickerField(`gallery:${i}`)}
                                                    title="Reemplazar desde la Biblioteca"
                                                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50">
                                                    <ImageIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Las DOS vías, siempre (v4.700). La Biblioteca se abre
                            SIN filtrar por tipo: acá conviven fotos y videos. */}
                        {galleryList.length < MAX_GALLERY_ITEMS && (
                            <div className="flex items-center gap-2">
                                <button type="button" onClick={() => startUpload('galleryAdd')} disabled={uploading}
                                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 disabled:opacity-50">
                                    <Upload className="w-4 h-4" /> Subir fotos o videos
                                </button>
                                <button type="button" onClick={() => setPickerField('galleryAdd')}
                                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-bold text-gray-600 bg-gray-50 hover:bg-gray-100">
                                    <ImageIcon className="w-4 h-4" /> Elegir de la Biblioteca
                                </button>
                                <button type="button" onClick={() => patchGallery([...galleryList, { url: '', caption: '', credit: '', alt: '' }])}
                                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-bold text-rotary-blue bg-rotary-blue/5 hover:bg-rotary-blue/10">
                                    <Plus className="w-4 h-4" /> Pegar un enlace
                                </button>
                            </div>
                        )}
                    </div>
                </Card>

                {/* Centros de acopio (F3). El botón de guardar va en la
                    CABECERA, fuera del pliegue: si el guardado quedara dentro,
                    plegar la sección con cambios sin guardar los escondería
                    junto con su única forma de guardarlos. */}
                <Card id="centros" open={isOpen('centros')} onToggle={toggleCard}
                    title="Centros de acopio"
                    warn={centerSkipped.length}
                    action={(
                        <button onClick={saveCenters} disabled={savingCenters || !centersDirty}
                            className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${centersDirty ? 'bg-rotary-blue text-white hover:bg-sky-800 shadow-lg' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                            <Save className="w-4 h-4" /> {savingCenters ? 'Guardando…' : 'Guardar centros'}
                        </button>
                    )}
                    hint="Estructurados por ciudad y sector — se guardan con su propio botón, aparte del resto de la campaña. Ciudad y dirección son obligatorias: una fila sin ellas no se publica y se avisa. El orden de la lista es el orden en la página.">
                    <div className="space-y-3">
                        {centers.map((ct, i) => (
                            <div key={ct.id || i} className="border border-gray-100 rounded-2xl p-4 space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <label className="flex items-center gap-2 text-xs font-bold text-gray-500 cursor-pointer">
                                        <input type="checkbox" checked={ct.active !== false} className="w-4 h-4 accent-rotary-blue"
                                            onChange={e => { setCenters(centers.map((x, j) => j === i ? { ...x, active: e.target.checked } : x)); setCentersDirty(true); }} />
                                        Activo
                                    </label>
                                    <RowTools
                                        onUp={() => { setCenters(moveIn(centers, i, -1)); setCentersDirty(true); }}
                                        onDown={() => { setCenters(moveIn(centers, i, 1)); setCentersDirty(true); }}
                                        onRemove={() => { setCenters(centers.filter((_, j) => j !== i)); setCentersDirty(true); }} />
                                </div>
                                <div className="grid md:grid-cols-3 gap-3">
                                    <input className={field} placeholder="Ciudad *" value={ct.city || ''}
                                        onChange={e => { setCenters(centers.map((x, j) => j === i ? { ...x, city: e.target.value } : x)); setCentersDirty(true); }} />
                                    <input className={field} placeholder="Sector (ej: Norte, Centro, Sur)" value={ct.groupLabel || ''}
                                        onChange={e => { setCenters(centers.map((x, j) => j === i ? { ...x, groupLabel: e.target.value } : x)); setCentersDirty(true); }} />
                                    <input className={field} placeholder="Nombre del punto (opcional)" value={ct.name || ''}
                                        onChange={e => { setCenters(centers.map((x, j) => j === i ? { ...x, name: e.target.value } : x)); setCentersDirty(true); }} />
                                </div>
                                <div className="grid md:grid-cols-2 gap-3">
                                    <input className={field} placeholder="Dirección *" value={ct.address || ''}
                                        onChange={e => { setCenters(centers.map((x, j) => j === i ? { ...x, address: e.target.value } : x)); setCentersDirty(true); }} />
                                    <input className={field} placeholder="Complemento (torre, apto, referencia)" value={ct.complement || ''}
                                        onChange={e => { setCenters(centers.map((x, j) => j === i ? { ...x, complement: e.target.value } : x)); setCentersDirty(true); }} />
                                </div>
                                <div className="grid md:grid-cols-3 gap-3">
                                    <input className={field} placeholder="Horario (ej: 9 am a 3 pm)" value={ct.schedule || ''}
                                        onChange={e => { setCenters(centers.map((x, j) => j === i ? { ...x, schedule: e.target.value } : x)); setCentersDirty(true); }} />
                                    <input className={field} placeholder="Recibe (persona de contacto)" value={ct.contactName || ''}
                                        onChange={e => { setCenters(centers.map((x, j) => j === i ? { ...x, contactName: e.target.value } : x)); setCentersDirty(true); }} />
                                    <input className={field} placeholder="Teléfono" value={ct.phone || ''}
                                        onChange={e => { setCenters(centers.map((x, j) => j === i ? { ...x, phone: e.target.value } : x)); setCentersDirty(true); }} />
                                </div>
                                <input className={field} placeholder="Notas (opcional)" value={ct.notes || ''}
                                    onChange={e => { setCenters(centers.map((x, j) => j === i ? { ...x, notes: e.target.value } : x)); setCentersDirty(true); }} />
                            </div>
                        ))}
                        <button type="button"
                            onClick={() => { setCenters([...centers, { id: `center-${Date.now()}`, city: '', groupLabel: '', name: '', address: '', complement: '', schedule: '', contactName: '', phone: '', notes: '', active: true }]); setCentersDirty(true); }}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-rotary-blue bg-rotary-blue/5 hover:bg-rotary-blue/10 transition">
                            <Plus className="w-4 h-4" /> Agregar centro
                        </button>
                        {c?.id && (
                            <CentersPastePanel campaignId={c.id} existing={centers}
                                onAdd={rows => { setCenters([...centers, ...rows]); setCentersDirty(true); }} />
                        )}
                        {centerSkipped.length > 0 && (
                            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-700">
                                {centerSkipped.length} centro(s) no se guardarán: {centerSkipped.map(s => `fila ${s.index + 1} ${s.reason}`).join(', ')}.
                            </div>
                        )}
                        <div className="grid md:grid-cols-2 gap-4 pt-2 border-t border-gray-50">
                            <div>
                                <label className={lbl}>Nota bajo el título (se guarda con la campaña)</label>
                                <input className={field} placeholder="Se habilitarán más puntos en otras ciudades de acuerdo con las necesidades."
                                    value={content.centersNote || ''}
                                    onChange={e => patchContent({ centersNote: e.target.value })} />
                            </div>
                            <div>
                                <label className={lbl}>Alianza (al pie de los centros)</label>
                                <input className={field} placeholder="En alianza con el Banco de Alimentos — ABACO"
                                    value={content.centersAlliance || ''}
                                    onChange={e => patchContent({ centersAlliance: e.target.value })} />
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Indicadores */}
                <Card id="panorama" open={isOpen('panorama')} onToggle={toggleCard} warn={statWarnings.length} title="Panorama de la emergencia" hint="Cada cifra necesita su fuente y su fecha: un indicador sin fuente no se publica — lo bloquea el servidor, no esta pantalla.">
                    <div className="space-y-3">
                        {stats.map((s, i) => (
                            <div key={s.id} className="border border-gray-100 rounded-2xl p-4 space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <label className="flex items-center gap-2 text-xs font-bold text-gray-500 cursor-pointer">
                                        <input type="checkbox" checked={s.active !== false} className="w-4 h-4 accent-rotary-blue"
                                            onChange={e => patch({ stats: stats.map((x, j) => j === i ? { ...x, active: e.target.checked } : x) })} />
                                        Publicado
                                    </label>
                                    <RowTools
                                        onUp={() => patch({ stats: moveIn(stats, i, -1) })}
                                        onDown={() => patch({ stats: moveIn(stats, i, 1) })}
                                        onRemove={() => patch({ stats: stats.filter((_, j) => j !== i) })} />
                                </div>
                                <div className="grid md:grid-cols-2 gap-3">
                                    {/* Qué métrica del catálogo es. Es lo que
                                        autoriza a la lectura automática a
                                        tocar este indicador: sin métrica es
                                        MANUAL y no se pisa nunca. */}
                                    <label className="md:col-span-2 block">
                                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Actualización automática</span>
                                        <select className={field} value={s.metricKey || ''}
                                            onChange={e => patch({ stats: stats.map((x, j) => j === i ? { ...x, metricKey: e.target.value } : x) })}>
                                            <option value="">Manual — la lectura automática no lo toca</option>
                                            {METRIC_KEYS.map(k => <option key={k} value={k}>{FEED_METRICS[k].label}</option>)}
                                        </select>
                                    </label>
                                    <input className={field} placeholder="Etiqueta (ej: Fallecidos)" value={s.label}
                                        onChange={e => patch({ stats: stats.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} />
                                    <input className={field} placeholder="Valor (ej: 54)" value={s.value}
                                        onChange={e => patch({ stats: stats.map((x, j) => j === i ? { ...x, value: e.target.value } : x) })} />
                                    <input className={field} placeholder="Fuente (ej: UNGRD, corte 14/08/2026)" value={s.source}
                                        onChange={e => patch({ stats: stats.map((x, j) => j === i ? { ...x, source: e.target.value } : x) })} />
                                    <input type="date" className={field} value={(s.updatedAt || '').slice(0, 10)}
                                        onChange={e => patch({ stats: stats.map((x, j) => j === i ? { ...x, updatedAt: e.target.value } : x) })} />
                                </div>
                            </div>
                        ))}
                        <button type="button"
                            onClick={() => patch({ stats: [...stats, { id: `stat-${Date.now()}`, label: '', value: '', source: '', updatedAt: '', active: true }] })}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-rotary-blue bg-rotary-blue/5 hover:bg-rotary-blue/10 transition">
                            <Plus className="w-4 h-4" /> Agregar indicador
                        </button>
                        {statWarnings.length > 0 && (
                            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                                <ul className="text-sm text-amber-700 space-y-1 list-disc pl-5">
                                    {statWarnings.map((w, i) => <li key={i}>{w}</li>)}
                                </ul>
                            </div>
                        )}
                    </div>
                </Card>

                {/* ── Lectura automatizada (v4.825) ─────────────────────────
                    Por qué NO se publica «lo último que aparezca en Internet»:
                    para el mismo sismo, con cortes de horas de diferencia, los
                    medios daban 284, 287, 288 y 294 fallecidos mientras la
                    UNGRD publicaba 289, y las personas afectadas BAJARON de
                    145.601 a 115.461. Ver `emergencyFeed.js`. */}
                <Card id="lectura" open={isOpen('lectura')} onToggle={toggleCard} warn={feedWarnings.length} title="Lectura automatizada del panorama"
                    hint="Las fuentes se consultan cada 15 minutos y dejan propuestas. Sólo una fuente OFICIAL puede publicar sola, y sólo si se enciende abajo.">
                    <div className="space-y-4">
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input type="checkbox" checked={feed.enabled} className="w-4 h-4 mt-1 accent-rotary-blue"
                                onChange={e => patchFeed({ enabled: e.target.checked })} />
                            <span>
                                <span className="block text-sm font-bold text-gray-800">Consultar las fuentes automáticamente</span>
                                <span className="block text-xs text-gray-500">Se leen cada 15 minutos y las cifras nuevas aparecen acá como propuestas.</span>
                            </span>
                        </label>

                        {feed.enabled && (
                            <>
                                {/* Qué hace, en tres pasos. Sin esto, la sección
                                    es una lista de campos sin contexto — se
                                    reportó como «no entiendo, no funciona». */}
                                <div className="rounded-2xl bg-gray-50/70 p-4 text-xs text-gray-600 space-y-1">
                                    <p><b>1.</b> Se agrega una o varias fuentes abajo (de dónde se leen las cifras).</p>
                                    <p><b>2.</b> La plataforma las consulta {(INTERVAL_OPTIONS.find(o => o.minutes === feed.intervalMinutes)?.label || '').toLowerCase()} y lee lo que publiquen.</p>
                                    <p><b>3.</b> Lo que encuentre aparece acá abajo como <b>propuesta</b>, y se aplica con un clic al «Panorama de la emergencia».</p>
                                    <p className="text-gray-400 pt-1">Un indicador del panorama sólo se actualiza solo si tiene declarada su métrica en «Actualización automática».</p>
                                </div>

                                <label className="block max-w-xs">
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Cada cuánto se consulta</span>
                                    <select className={field} value={feed.intervalMinutes}
                                        onChange={e => patchFeed({ intervalMinutes: Number(e.target.value) })}>
                                        {INTERVAL_OPTIONS.map(o => <option key={o.minutes} value={o.minutes}>{o.label}</option>)}
                                    </select>
                                    {/* La consecuencia del intervalo: cada vuelta
                                        gasta una consulta al modelo POR FUENTE. */}
                                    <span className="block text-xs text-gray-400 mt-1.5">
                                        {INTERVAL_OPTIONS.find(o => o.minutes === feed.intervalMinutes)?.hint
                                            || 'Cada consulta gasta una lectura por fuente.'}
                                        {c?.feedRunAt && <> · Última consulta: <span data-no-translate>{new Date(c.feedRunAt).toLocaleString('es-CO')}</span></>}
                                    </span>
                                </label>

                                <label className="flex items-start gap-3 cursor-pointer">
                                    <input type="checkbox" checked={feed.autoPublish} className="w-4 h-4 mt-1 accent-rotary-blue"
                                        onChange={e => patchFeed({ autoPublish: e.target.checked })} />
                                    <span>
                                        <span className="block text-sm font-bold text-gray-800">Publicar sola la cifra de la fuente oficial</span>
                                        {/* La consecuencia, no sólo el nombre del interruptor: esto pone
                                            un número en la página de muchos sitios sin que nadie lo mire. */}
                                        <span className="block text-xs text-gray-500">
                                            La cifra sale publicada sin que nadie la revise. Se retiene igual si retrocede,
                                            si salta más del {feed.maxJumpPct} % o si la fuente no es oficial.
                                        </span>
                                    </span>
                                </label>

                                <label className="block max-w-xs">
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Salto máximo que se publica solo (%)</span>
                                    <input type="number" min={1} max={500} className={field} value={feed.maxJumpPct}
                                        onChange={e => patchFeed({ maxJumpPct: Number(e.target.value) || DEFAULT_MAX_JUMP_PCT })} />
                                </label>

                                <div className="space-y-3">
                                    {feed.sources.map((src, i) => (
                                        <div key={src.id} className="border border-gray-100 rounded-2xl p-4 space-y-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <label className="flex items-center gap-2 text-xs font-bold text-gray-500 cursor-pointer">
                                                    <input type="checkbox" checked={src.active} className="w-4 h-4 accent-rotary-blue"
                                                        onChange={e => patchSources(feed.sources.map((x, j) => j === i ? { ...x, active: e.target.checked } : x))} />
                                                    Activa
                                                </label>
                                                <RowTools
                                                    onUp={() => patchSources(moveIn(feed.sources, i, -1) as FeedSource[])}
                                                    onDown={() => patchSources(moveIn(feed.sources, i, 1) as FeedSource[])}
                                                    onRemove={() => patchSources(feed.sources.filter((_, j) => j !== i))} />
                                            </div>
                                            <div className="grid md:grid-cols-2 gap-3">
                                                <input className={field} placeholder="Nombre (ej: UNGRD)" value={src.name}
                                                    onChange={e => patchSources(feed.sources.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                                                <input className={field} placeholder="https://…" value={src.url}
                                                    onChange={e => patchSources(feed.sources.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} />
                                                <label className="block">
                                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Autoridad</span>
                                                    <select className={field} value={src.kind}
                                                        onChange={e => patchSources(feed.sources.map((x, j) => j === i ? { ...x, kind: e.target.value } : x))}>
                                                        {Object.entries(SOURCE_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                                    </select>
                                                </label>
                                                <label className="block">
                                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Formato</span>
                                                    <select className={field} value={src.format}
                                                        onChange={e => patchSources(feed.sources.map((x, j) => j === i ? { ...x, format: e.target.value } : x))}>
                                                        {Object.entries(SOURCE_FORMATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                                    </select>
                                                </label>
                                            </div>
                                            {/* Qué significa lo que se eligió. La
                                                autoridad decide si esa cifra puede
                                                publicarse sola: no es un detalle. */}
                                            <p className="text-xs text-gray-400">
                                                {src.kind === 'oficial'
                                                    ? 'Oficial: su cifra puede fijar el indicador y publicarse sola (si el interruptor de arriba está encendido).'
                                                    : 'Secundaria: avisa de que hay balance nuevo, pero su cifra nunca se publica sola.'}
                                                {src.format === 'imagen' && ' Se lee la IMAGEN: pegá la dirección de la infografía, no la de la página que la contiene.'}
                                            </p>
                                        </div>
                                    ))}
                                    {/* Sin fuentes, la sección no hace nada y hay
                                        que decirlo con la salida: es el estado
                                        en el que se reportó «no funciona». */}
                                    {feed.sources.length === 0 && (
                                        <div className="rounded-2xl border border-dashed border-gray-200 p-5 text-center">
                                            <p className="text-sm font-bold text-gray-700">Todavía no hay ninguna fuente</p>
                                            <p className="text-xs text-gray-500 mt-1">
                                                Sin una fuente no hay nada que consultar. Elegí una de la lista de abajo y pegá la dirección de la página o de la imagen del balance.
                                            </p>
                                        </div>
                                    )}
                                    {feed.sources.length < MAX_SOURCES && (
                                        <div className="flex flex-wrap items-end gap-3">
                                            {/* Elegir de una lista en vez de escribir:
                                                la plantilla fija la AUTORIDAD y el
                                                FORMATO, que es lo que no se puede
                                                deducir mirando una página. */}
                                            <label className="block flex-1 min-w-[260px]">
                                                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Agregar una fuente</span>
                                                <select className={field} value=""
                                                    onChange={e => { addSourceFromPreset(e.target.value); e.target.value = ''; }}>
                                                    <option value="">Elegí de dónde se leen las cifras…</option>
                                                    {FEED_PRESETS.map(p => (
                                                        <option key={p.id} value={p.id}>
                                                            {p.name || (p.format === 'json' ? 'Otra fuente — JSON / API' : 'Otro medio de comunicación')}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                            <button type="button"
                                                onClick={() => patchSources([...feed.sources, { id: `src-${Date.now()}`, name: '', url: '', kind: 'secundaria', format: 'texto', active: true }])}
                                                className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-rotary-blue bg-rotary-blue/5 hover:bg-rotary-blue/10 transition">
                                                <Plus className="w-4 h-4" /> En blanco
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {feedWarnings.length > 0 && (
                                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                                        <ul className="text-sm text-amber-700 space-y-1 list-disc pl-5">
                                            {feedWarnings.map((w, i) => <li key={i}>{w}</li>)}
                                        </ul>
                                    </div>
                                )}

                                <button type="button" onClick={runFeed} disabled={reading}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-rotary-blue hover:bg-rotary-navy disabled:opacity-50 transition">
                                    <RefreshCw className={`w-4 h-4 ${reading ? 'animate-spin' : ''}`} />
                                    {reading ? 'Consultando las fuentes…' : 'Leer ahora'}
                                </button>
                            </>
                        )}

                        {/* La bandeja. Se muestra AUNQUE la lectura esté
                            apagada: apagarla no puede esconder propuestas que
                            quedaron sin decidir. */}
                        {readings.length > 0 && (
                            <div className="space-y-3 pt-2">
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                                    {readings.length} propuesta(s) sin decidir
                                </p>
                                {readings.map(r => (
                                    <div key={r.id} className="border border-gray-100 rounded-2xl p-4 space-y-3">
                                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                            <span className="text-sm font-bold text-gray-800">{r.label}</span>
                                            <span className="text-lg font-light text-gray-900" data-no-translate>
                                                {r.before !== null && <span className="text-gray-400">{formatFigure(r.before)} → </span>}
                                                {formatFigure(r.after)}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500">
                                            <span data-no-translate>{r.sourceName || r.sourceId}</span>
                                            {r.cutoffLabel && <> · corte <span data-no-translate>{r.cutoffLabel}</span></>}
                                            {r.url && (
                                                <> · <a href={r.url} target="_blank" rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-rotary-blue hover:underline">
                                                    <Link2 className="w-3 h-3" /> ver la fuente
                                                </a></>
                                            )}
                                        </p>
                                        {/* El fragmento donde se leyó: es lo que permite
                                            verificar sin abrir la página. */}
                                        {r.quote && <p className="text-xs text-gray-400 italic" data-no-translate>«{r.quote}»</p>}
                                        {r.warnings.length > 0 && (
                                            <ul className="text-xs text-amber-700 space-y-1 list-disc pl-5">
                                                {r.warnings.map((w, i) => <li key={i}>{w}</li>)}
                                            </ul>
                                        )}
                                        <div className="flex gap-2">
                                            <button type="button" onClick={() => decideReading(r.id, 'aplicar')}
                                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-rotary-blue hover:bg-rotary-navy transition">
                                                <Check className="w-4 h-4" /> Aplicar al panorama
                                            </button>
                                            <button type="button" onClick={() => decideReading(r.id, 'descartar')}
                                                className="px-4 py-2 rounded-xl text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition">
                                                Descartar
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {feed.enabled && readings.length === 0 && (
                            <p className="text-xs text-gray-500">
                                No hay propuestas sin decidir. Que casi todas las lecturas no encuentren nada es lo esperado:
                                una página que no cambió no deja propuesta.
                            </p>
                        )}
                    </div>
                </Card>

                {/* Bloques informativos */}
                <Card id="bloques" open={isOpen('bloques')} onToggle={toggleCard} title="Bloques informativos" hint="Las tarjetas de contexto: por qué ayudar, cómo estamos actuando, cómo contribuir.">
                    <div className="space-y-3">
                        {infoBlocks.map((b, i) => (
                            <div key={b.id} className="border border-gray-100 rounded-2xl p-4 space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <label className="flex items-center gap-2 text-xs font-bold text-gray-500 cursor-pointer">
                                        <input type="checkbox" checked={b.active !== false} className="w-4 h-4 accent-rotary-blue"
                                            onChange={e => patchContent({ infoBlocks: infoBlocks.map((x, j) => j === i ? { ...x, active: e.target.checked } : x) })} />
                                        Visible
                                    </label>
                                    <RowTools
                                        onUp={() => patchContent({ infoBlocks: moveIn(infoBlocks, i, -1) })}
                                        onDown={() => patchContent({ infoBlocks: moveIn(infoBlocks, i, 1) })}
                                        onRemove={() => patchContent({ infoBlocks: infoBlocks.filter((_, j) => j !== i) })} />
                                </div>
                                <input className={field} placeholder="Título" value={b.title}
                                    onChange={e => patchContent({ infoBlocks: infoBlocks.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} />
                                <textarea rows={3} className={`${field} resize-none`} placeholder="Texto" value={b.text}
                                    onChange={e => patchContent({ infoBlocks: infoBlocks.map((x, j) => j === i ? { ...x, text: e.target.value } : x) })} />
                            </div>
                        ))}
                        <button type="button"
                            onClick={() => patchContent({ infoBlocks: [...infoBlocks, { id: `info-${Date.now()}`, title: '', text: '', active: true }] })}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-rotary-blue bg-rotary-blue/5 hover:bg-rotary-blue/10 transition">
                            <Plus className="w-4 h-4" /> Agregar bloque
                        </button>
                    </div>
                </Card>

                {/* Cierre final */}
                <Card id="cierre" open={isOpen('cierre')} onToggle={toggleCard} title="Cierre final" hint="El llamado de alto impacto al pie de la campaña.">
                    <div className="space-y-4">
                        <div><label className={lbl}>Título</label>
                            <input className={field} placeholder="HOY, MÁS QUE NUNCA, UNIDOS PODEMOS LLEVAR ESPERANZA" value={finalCta.title || ''}
                                onChange={e => patchContent({ finalCta: { ...finalCta, title: e.target.value } })} /></div>
                        <div><label className={lbl}>Texto</label>
                            <textarea rows={2} className={`${field} resize-none`} value={finalCta.text || ''}
                                onChange={e => patchContent({ finalCta: { ...finalCta, text: e.target.value } })} /></div>
                        <div><label className={lbl}>Frase</label>
                            <input className={field} placeholder="Servir es estar presentes cuando más nos necesitan." value={finalCta.quote || ''}
                                onChange={e => patchContent({ finalCta: { ...finalCta, quote: e.target.value } })} /></div>
                        <CtaEditor label="CTA primario" value={finalCta.ctaPrimary || { ...emptyCta(), action: 'donate' }}
                            onChange={v => patchContent({ finalCta: { ...finalCta, ctaPrimary: v } })} />
                        <CtaEditor label="CTA secundario" value={finalCta.ctaSecondary || { ...emptyCta(), action: 'centers' }}
                            onChange={v => patchContent({ finalCta: { ...finalCta, ctaSecondary: v } })} />
                    </div>
                </Card>

                {/* Aliados */}
                <Card id="aliados" open={isOpen('aliados')} onToggle={toggleCard} title="Aliados y logos" hint="Rotary, Colrotarios, ABACO y los que se sumen. Nada va escrito en el código.">
                    <div className="space-y-3">
                        {partners.map((p, i) => (
                            <div key={p.id} className="border border-gray-100 rounded-2xl p-4 space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <label className="flex items-center gap-2 text-xs font-bold text-gray-500 cursor-pointer">
                                        <input type="checkbox" checked={p.active !== false} className="w-4 h-4 accent-rotary-blue"
                                            onChange={e => patchContent({ partners: partners.map((x, j) => j === i ? { ...x, active: e.target.checked } : x) })} />
                                        Visible
                                    </label>
                                    <RowTools
                                        onUp={() => patchContent({ partners: moveIn(partners, i, -1) })}
                                        onDown={() => patchContent({ partners: moveIn(partners, i, 1) })}
                                        onRemove={() => patchContent({ partners: partners.filter((_, j) => j !== i) })} />
                                </div>
                                <div className="grid md:grid-cols-2 gap-3">
                                    <input className={field} placeholder="Nombre" value={p.name}
                                        onChange={e => patchContent({ partners: partners.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} />
                                    <input className={field} placeholder="URL (opcional)" value={p.url}
                                        onChange={e => patchContent({ partners: partners.map((x, j) => j === i ? { ...x, url: e.target.value } : x) })} />
                                </div>
                                <div className="flex items-center gap-2">
                                    <input className={`${field} mt-0 flex-1`} placeholder="Logo (URL)" value={p.logo}
                                        onChange={e => patchContent({ partners: partners.map((x, j) => j === i ? { ...x, logo: e.target.value } : x) })} />
                                    <button type="button" onClick={() => startUpload(`partner:${i}`)} disabled={uploading}
                                        className="flex items-center gap-1.5 px-3 py-3 rounded-xl text-sm font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 disabled:opacity-50">
                                        <Upload className="w-4 h-4" /> Subir
                                    </button>
                                    <button type="button" onClick={() => setPickerField(`partner:${i}`)}
                                        className="flex items-center gap-1.5 px-3 py-3 rounded-xl text-sm font-bold text-gray-600 bg-gray-50 hover:bg-gray-100">
                                        <ImageIcon className="w-4 h-4" /> Biblioteca
                                    </button>
                                </div>
                            </div>
                        ))}
                        <button type="button"
                            onClick={() => patchContent({ partners: [...partners, { id: `partner-${Date.now()}`, name: '', logo: '', url: '', active: true }] })}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-rotary-blue bg-rotary-blue/5 hover:bg-rotary-blue/10 transition">
                            <Plus className="w-4 h-4" /> Agregar aliado
                        </button>
                    </div>
                </Card>

                {/* SEO */}
                <Card id="seo" open={isOpen('seo')} onToggle={toggleCard} title="SEO y tarjeta social" hint="Cómo se ve la campaña al compartirla por WhatsApp o redes. Se aplica en la Fase 2, cuando la página pública tome la campaña.">
                    <div className="space-y-4">
                        <div><label className={lbl}>Meta título</label>
                            <input className={field} value={seo.title || ''}
                                onChange={e => patchContent({ seo: { ...seo, title: e.target.value } })} /></div>
                        <div><label className={lbl}>Meta descripción</label>
                            <textarea rows={2} className={`${field} resize-none`} value={seo.description || ''}
                                onChange={e => patchContent({ seo: { ...seo, description: e.target.value } })} /></div>
                        <div>
                            <label className={lbl}>Imagen OG (la de la tarjeta al compartir)</label>
                            <div className="flex items-center gap-2 mt-1.5">
                                <input className={`${field} mt-0 flex-1`} placeholder="URL de la imagen" value={seo.ogImage || ''}
                                    onChange={e => patchContent({ seo: { ...seo, ogImage: e.target.value } })} />
                                <button type="button" onClick={() => startUpload('og')} disabled={uploading}
                                    className="flex items-center gap-1.5 px-3 py-3 rounded-xl text-sm font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 disabled:opacity-50">
                                    <Upload className="w-4 h-4" /> Subir
                                </button>
                                <button type="button" onClick={() => setPickerField('og')}
                                    className="flex items-center gap-1.5 px-3 py-3 rounded-xl text-sm font-bold text-gray-600 bg-gray-50 hover:bg-gray-100">
                                    <ImageIcon className="w-4 h-4" /> Biblioteca
                                </button>
                            </div>
                        </div>
                    </div>
                </Card>

                <div className="bg-sky-50/60 rounded-3xl p-6 border border-sky-100 text-sm text-gray-600">
                    <p className="font-bold text-gray-700 mb-1 flex items-center gap-2"><Eye className="w-4 h-4" /> Qué pinta ya la página pública</p>
                    <p>Con la campaña publicada, los sitios alcanzados muestran el <b>hero</b>, la <b>tarjeta de aporte</b> (pasarela de siempre, en la moneda del club), <b>¿cómo puedes ayudar?</b>, los <b>elementos requeridos</b>, los <b>centros de acopio</b> por ciudad y los <b>aliados</b>. Los <b>indicadores, bloques informativos y cierre</b> llegan en la Fase 4 — ya se pueden configurar y quedan guardados. Un botón que apunte a los centros sólo se pinta si hay centros publicados.</p>
                </div>
            </div>
        </AdminLayout>
    );
};

export default ContributionCampaigns;
