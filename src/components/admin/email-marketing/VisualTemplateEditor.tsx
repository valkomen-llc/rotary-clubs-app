// ════════════════════════════════════════════════════════════════════════════
// Editor Visual de Plantillas Institucionales — Club Platform & Rotary en Acción
// Interfaz nativa clara y profesional con la identidad visual de Club Platform.
// Lienzo central con vista responsiva, inspector de bloques contextual y
// separación estricta entre Plantilla Maestra y zonas dinámicas de Campaña.
// ════════════════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Shield, Lock, Unlock, Sparkles, Send, Save, Layout, Box, Palette,
  Plus, Trash2, Copy, ArrowUp, ArrowDown, Smartphone, Monitor,
  Columns, Type, Image as ImageIcon, Square,
  Minus, Table as TableIcon, Menu as MenuIcon, Share2, Video, Code,
  Tag, X, ArrowLeft, RefreshCw, ZoomIn, ZoomOut, Undo2, Redo2,
  Check, CheckCircle2, Eye, AlertCircle
} from 'lucide-react';

import {
  renderDesignToHtml, makeBlock, BLOCK_LABELS,
  FONT_OPTIONS, newId, createRotaryMasterDesign, getRotaryGlobalBlocksCatalog,
  type EmailDesign, type Block, type BlockType, type Align, type SocialNetwork,
  type TableRow, type MenuItem
} from '../../../lib/emailBlocks';
import MediaPicker from '../content-studio/MediaPicker';
import EmailAiAssistant from './EmailAiAssistant';

const API = import.meta.env.VITE_API_URL || '/api';
const getToken = () => localStorage.getItem('rotary_token') || '';
const authHeaders = () => ({
  Authorization: `Bearer ${getToken()}`,
  'Content-Type': 'application/json'
});

interface VisualTemplateEditorProps {
  initialDesign?: EmailDesign | null;
  initialName?: string;
  initialSubject?: string;
  initialPreheader?: string;
  templateId?: string | null;
  campaignContext?: {
    id: string;
    code: string;
    name: string;
    subject?: string;
    preheader?: string;
    messageCentral?: string;
    utmCampaign?: string;
  } | null;
  onSave?: (saved: { name: string; subject: string; preheader: string; design: EmailDesign; html: string }) => void;
  onClose?: () => void;
  readOnly?: boolean;
}

type TabMode = 'blocks' | 'layouts' | 'global' | 'style' | 'tags';

export const VisualTemplateEditor: React.FC<VisualTemplateEditorProps> = ({
  initialDesign,
  initialName = 'Plantilla Maestra Institucional · Rotary en Acción',
  initialSubject = 'Tu club transforma comunidades. ¡Hagámoslo visible!',
  initialPreheader = 'Comparte tus proyectos y actividades comunitarias en Rotary en Acción.',
  templateId = null,
  campaignContext = null,
  onSave,
  onClose,
  readOnly = false
}) => {
  // Estado general de plantilla
  const [name, setName] = useState(initialName);
  const [subject, setSubject] = useState(initialSubject);
  const [preheader, setPreheader] = useState(initialPreheader);
  const [design, setDesign] = useState<EmailDesign>(() => initialDesign || createRotaryMasterDesign());
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  // Pila de Deshacer / Rehacer (Undo / Redo)
  const [history, setHistory] = useState<EmailDesign[]>([initialDesign || createRotaryMasterDesign()]);
  const [historyIdx, setHistoryIdx] = useState(0);

  // Inspector y barra lateral
  const [activeTab, setActiveTab] = useState<TabMode>('blocks');
  const [deviceView, setDeviceView] = useState<'desktop' | 'mobile'>('desktop');
  const [bodyWidthPreset, setBodyWidthPreset] = useState<number>(600);
  const [previewMode, setPreviewMode] = useState<'editor' | 'live'>('editor');
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  // Modales
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaTargetCallback, setMediaTargetCallback] = useState<((url: string) => void) | null>(null);
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const [testEmailOpen, setTestEmailOpen] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testReceipt, setTestReceipt] = useState<{ to: string; messageId?: string; timestamp: string } | null>(null);

  // Bloque actualmente seleccionado
  const selectedBlock = useMemo(() => {
    if (!selectedBlockId) return null;
    return design.blocks.find((b) => b.id === selectedBlockId) || null;
  }, [design.blocks, selectedBlockId]);

  // Si viene contexto de campaña y no se pasó diseño específico, inyectar dinámicamente
  useEffect(() => {
    if (campaignContext && !initialDesign) {
      if (campaignContext.name) setName(`[${campaignContext.code.toUpperCase()}] ${campaignContext.name}`);
      if (campaignContext.subject) setSubject(campaignContext.subject);
      if (campaignContext.preheader) setPreheader(campaignContext.preheader);
    }
  }, [campaignContext, initialDesign]);

  // Aplicar actualización registrando en el historial
  const pushDesignState = useCallback((newDesign: EmailDesign) => {
    setDesign(newDesign);
    setHistory((prev) => {
      const next = prev.slice(0, historyIdx + 1);
      if (next.length >= 25) next.shift();
      return [...next, newDesign];
    });
    setHistoryIdx((prev) => Math.min(prev + 1, 24));
  }, [historyIdx]);

  // Deshacer / Rehacer
  const handleUndo = useCallback(() => {
    if (historyIdx > 0) {
      const targetIdx = historyIdx - 1;
      setHistoryIdx(targetIdx);
      setDesign(history[targetIdx]);
      toast.info('Acción deshecha');
    }
  }, [history, historyIdx]);

  const handleRedo = useCallback(() => {
    if (historyIdx < history.length - 1) {
      const targetIdx = historyIdx + 1;
      setHistoryIdx(targetIdx);
      setDesign(history[targetIdx]);
      toast.info('Acción rehecha');
    }
  }, [history, historyIdx]);

  // Atajos de teclado (Cmd+Z / Ctrl+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Actualizar configuración global de diseño
  const updateSettings = useCallback((patch: Partial<EmailDesign['settings']>) => {
    pushDesignState({
      ...design,
      settings: { ...design.settings, ...patch }
    });
  }, [design, pushDesignState]);

  // Mutador de bloques
  const updateBlock = useCallback((id: string, patch: Partial<Block>) => {
    pushDesignState({
      ...design,
      blocks: design.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b))
    });
  }, [design, pushDesignState]);

  // Agregar nuevo bloque
  const handleAddBlock = (type: BlockType) => {
    const newB = makeBlock(type);
    pushDesignState({
      ...design,
      blocks: [...design.blocks, newB]
    });
    setSelectedBlockId(newB.id);
    toast.success(`Bloque «${BLOCK_LABELS[type]}» agregado`);
  };

  // Insertar bloque global institucional
  const handleInsertGlobalBlock = (globalKey: string, label: string) => {
    const newB: Block = {
      id: newId(),
      type: 'global',
      globalKey,
      label,
      isProtected: true,
      isLocked: true
    };
    pushDesignState({
      ...design,
      blocks: [...design.blocks, newB]
    });
    setSelectedBlockId(newB.id);
    toast.success(`Bloque global «${label}» insertado`);
  };

  // Mover bloque arriba/abajo
  const handleMoveBlock = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= design.blocks.length) return;
    const arr = [...design.blocks];
    const [moved] = arr.splice(index, 1);
    arr.splice(targetIdx, 0, moved);
    pushDesignState({ ...design, blocks: arr });
  };

  // Duplicar bloque
  const handleDuplicateBlock = (index: number) => {
    const original = design.blocks[index];
    const copy = {
      ...original,
      id: newId(),
      label: original.label ? `${original.label} (Copia)` : undefined,
      isProtected: false // Las copias nacen editables
    } as Block;
    const arr = [...design.blocks];
    arr.splice(index + 1, 0, copy);
    pushDesignState({ ...design, blocks: arr });
    setSelectedBlockId(copy.id);
    toast.success('Bloque duplicado');
  };

  // Eliminar bloque
  const handleDeleteBlock = (id: string, isProtected?: boolean) => {
    if (isProtected) {
      if (!window.confirm('Este bloque es un componente institucional oficial. ¿Estás seguro de quitarlo de esta plantilla?')) {
        return;
      }
    }
    pushDesignState({
      ...design,
      blocks: design.blocks.filter((b) => b.id !== id)
    });
    if (selectedBlockId === id) setSelectedBlockId(null);
    toast.info('Bloque eliminado');
  };

  // Bloquear / desbloquear protección de bloque institucional
  const handleToggleProtection = (id: string) => {
    const target = design.blocks.find((b) => b.id === id);
    if (!target) return;
    const nextState = !target.isProtected;
    updateBlock(id, { isProtected: nextState, isLocked: nextState });
    toast.success(nextState ? 'Componente institucional protegido' : 'Componente desbloqueado para edición');
  };

  // Restaurar plantilla institucional base
  const handleResetToRotaryMaster = () => {
    if (!window.confirm('¿Deseas restaurar la Plantilla Maestra Oficial de Rotary en Acción? Se perderán las modificaciones no guardadas.')) return;
    const master = createRotaryMasterDesign();
    pushDesignState(master);
    setSelectedBlockId(null);
    toast.success('Plantilla Maestra Oficial restaurada');
  };

  // HTML compilado completo
  const compiledHtml = useMemo(() => {
    try {
      return renderDesignToHtml(design, { interactive: false });
    } catch {
      return '<div style="padding:20px;text-align:center;color:#ef4444">Error al compilar vista previa</div>';
    }
  }, [design]);

  // Guardar plantilla
  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('La plantilla requiere un nombre identificador');
      return;
    }
    setSaving(true);
    try {
      const fullHtml = renderDesignToHtml(design, { interactive: false });

      // 1. Si viene contexto de campaña, aplicar y sincronizar con la campaña
      if (campaignContext?.id) {
        const res = await fetch(`${API}/rotary-en-accion/marketing/campaigns/${campaignContext.id}/apply-template`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            design,
            subject: subject.trim(),
            preheader: preheader.trim(),
            html: fullHtml
          })
        });

        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          toast.success('¡Diseño aplicado y sincronizado con la campaña!', {
            description: `Campaña ${campaignContext.code.toUpperCase()} guardada y sincronizada con Email Marketing.`
          });
          onSave?.({ name, subject, preheader, design, html: fullHtml });
          onClose?.();
          return;
        } else {
          toast.error(data.error || 'No se pudo guardar la plantilla de la campaña');
          return;
        }
      }

      // 2. Si viene templateId específico, actualizar en content-activation
      if (templateId) {
        const res = await fetch(`${API}/content-activation/templates/${templateId}`, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify({
            name: name.trim(),
            subject: subject.trim(),
            preheader: preheader.trim(),
            design,
            html: fullHtml,
            note: 'Guardado desde Editor Visual de Plantillas'
          })
        });

        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          toast.success(`¡Plantilla guardada como v${data.template?.version || 1}!`, {
            description: 'Cambios persistidos correctamente.'
          });
          onSave?.({ name, subject, preheader, design, html: fullHtml });
          return;
        } else {
          toast.error(data.error || 'No se pudo guardar la plantilla');
          return;
        }
      }

      // 3. Guardar como Plantilla Maestra Central Oficial de Rotary en Acción
      const res = await fetch(`${API}/rotary-en-accion/marketing/templates/save-master`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          name: name.trim(),
          subject: subject.trim(),
          preheader: preheader.trim(),
          design,
          html: fullHtml,
          note: 'Guardado desde Editor Visual de Plantillas'
        })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        toast.success(`¡Plantilla guardada como v${data.template?.version || 1}!`, {
          description: 'Estructura institucional protegida y lista para campañas.'
        });
        onSave?.({ name, subject, preheader, design, html: fullHtml });
      } else {
        toast.error(data.error || 'No se pudo guardar la plantilla');
      }
    } catch (err: any) {
      toast.error('Error de red al guardar la plantilla', {
        description: err?.message || 'No se pudo comunicar con el servidor.'
      });
    } finally {
      setSaving(false);
    }
  };

  // Enviar correo de prueba con validación estricta y reporte del proveedor
  const handleSendTestEmail = async () => {
    const emailTo = testEmailRecipient.trim();
    if (!emailTo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTo)) {
      toast.error('Ingresa una dirección de correo válida (ej: socio@club.org)');
      return;
    }
    setSendingTest(true);
    setTestReceipt(null);
    try {
      const testHtml = renderDesignToHtml(design, { interactive: false });
      const res = await fetch(`${API}/rotary-en-accion/marketing/templates/test-email`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          to: emailTo,
          subject,
          html: testHtml
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setTestReceipt({
          to: emailTo,
          messageId: data.messageId || 'OK',
          timestamp: data.timestamp || new Date().toISOString()
        });
        toast.success(`¡Correo de prueba aceptado por el proveedor!`, {
          description: `Entregado al canal de salida para ${emailTo}`
        });
      } else {
        const errorText = data.error || (data.result && data.result.error) || 'El proveedor de correo no aceptó el envío del correo de prueba.';
        toast.error('Fallo en el envío de prueba', {
          description: errorText
        });
      }
    } catch (err: any) {
      toast.error('Error de conexión', {
        description: err?.message || 'No se pudo comunicar con el servidor de correo.'
      });
    } finally {
      setSendingTest(false);
    }
  };

  // Aplicar sugerencias de la IA a las zonas dinámicas exclusivamente
  const handleApplyAiSubject = (newSub: string) => {
    setSubject(newSub);
    toast.success('Asunto actualizado por IA');
  };

  const handleApplyAiPreheader = (newPre: string) => {
    setPreheader(newPre);
    toast.success('Preheader actualizado por IA');
  };

  const handleApplyAiBody = (aiHtml: string) => {
    const textClean = aiHtml
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    pushDesignState({
      ...design,
      blocks: design.blocks.map((b) => {
        if (!b.isProtected && b.type === 'text') {
          return { ...b, text: textClean };
        }
        return b;
      })
    });
    toast.success('Texto de campaña enriquecido por IA (componentes institucionales protegidos intactos)');
  };

  // Ayudante para abrir selector de medios y vincular con campo
  const openMediaPickerFor = (callback: (url: string) => void) => {
    setMediaTargetCallback(() => callback);
    setMediaPickerOpen(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col text-slate-800 font-sans">
      {/* ─── 1. BARRA SUPERIOR (HEADER ESTILO CLUB PLATFORM) ─────────────── */}
      <header className="bg-white border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xs shrink-0 z-30">
        {/* Lado izquierdo: Botón volver + Identidad + Nombre de plantilla */}
        <div className="flex items-center gap-3 min-w-0">
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              title="Volver"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] uppercase tracking-wider font-extrabold bg-blue-50 text-rotary-blue px-2.5 py-0.5 rounded-full border border-blue-200">
                Club Platform · Editor Visual de Plantillas
              </span>
              <span className="text-xs text-slate-500 truncate">
                {campaignContext ? `Campaña: ${campaignContext.name}` : 'Plantillas de Correo'}
              </span>
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-transparent text-sm sm:text-base font-bold text-slate-900 border-b border-transparent hover:border-slate-300 focus:border-rotary-blue focus:outline-none px-1 py-0.5 w-64 sm:w-80 truncate transition-colors"
              placeholder="Nombre de la plantilla institucional..."
              disabled={readOnly}
            />
          </div>
        </div>

        {/* Centro: Controles de vista, ancho, zoom y deshacer/rehacer */}
        <div className="flex items-center gap-2">
          {/* Deshacer / Rehacer */}
          <div className="flex items-center bg-slate-100 rounded-xl p-0.5 border border-slate-200">
            <button
              onClick={handleUndo}
              disabled={historyIdx <= 0}
              className="p-1.5 text-slate-600 hover:text-slate-900 disabled:opacity-30 rounded-lg hover:bg-white transition-colors"
              title="Deshacer (Cmd+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIdx >= history.length - 1}
              className="p-1.5 text-slate-600 hover:text-slate-900 disabled:opacity-30 rounded-lg hover:bg-white transition-colors"
              title="Rehacer (Cmd+Shift+Z)"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          {/* Selector de Ancho */}
          <div className="hidden md:flex items-center bg-slate-100 rounded-xl p-0.5 border border-slate-200">
            {[540, 600, 660].map((w) => (
              <button
                key={w}
                onClick={() => { setBodyWidthPreset(w); updateSettings({ width: w }); }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  bodyWidthPreset === w
                    ? 'bg-white text-rotary-blue shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {w}px
              </button>
            ))}
          </div>

          {/* Alternador Escritorio / Móvil */}
          <div className="flex items-center bg-slate-100 rounded-xl p-0.5 border border-slate-200">
            <button
              onClick={() => setDeviceView('desktop')}
              className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                deviceView === 'desktop'
                  ? 'bg-white text-rotary-blue shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Vista Escritorio"
            >
              <Monitor className="w-4 h-4" />
            </button>
            <button
              onClick={() => setDeviceView('mobile')}
              className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                deviceView === 'mobile'
                  ? 'bg-white text-rotary-blue shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Vista Móvil (375px)"
            >
              <Smartphone className="w-4 h-4" />
            </button>
          </div>

          {/* Zoom */}
          <div className="hidden lg:flex items-center bg-slate-100 rounded-xl p-0.5 border border-slate-200 text-xs">
            <button
              onClick={() => setZoomLevel((z) => Math.max(z - 15, 60))}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors"
              title="Reducir Zoom"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 font-bold text-slate-700 min-w-[42px] text-center">
              {zoomLevel}%
            </span>
            <button
              onClick={() => setZoomLevel((z) => Math.min(z + 15, 140))}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors"
              title="Aumentar Zoom"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Lado derecho: Asistente IA + Enviar Prueba + Guardar */}
        <div className="flex items-center gap-2">
          {/* Alternar Modo Vista Previa Iframe */}
          <button
            onClick={() => setPreviewMode(previewMode === 'editor' ? 'live' : 'editor')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all ${
              previewMode === 'live'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{previewMode === 'live' ? 'Lienzo Editable' : 'Vista Previa Final'}</span>
          </button>

          {/* Asistente IA */}
          <button
            onClick={() => setAiAssistantOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all"
            title="Asistente de Redacción IA"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Asistente IA</span>
          </button>

          {/* Enviar Prueba */}
          <button
            onClick={() => setTestEmailOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all"
            title="Enviar Correo de Prueba"
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Enviar Prueba</span>
          </button>

          {/* Guardar */}
          <button
            onClick={handleSave}
            disabled={saving || readOnly}
            className="px-4 py-1.5 rounded-xl bg-[#013388] hover:bg-[#00246c] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs disabled:opacity-50 transition-all"
          >
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>{campaignContext ? 'Guardar y Sincronizar' : 'Guardar Plantilla'}</span>
          </button>
        </div>
      </header>

      {/* ─── 2. FILA DE ASUNTO Y PREHEADER ─────────────────────────────── */}
      <div className="bg-slate-50/90 border-b border-slate-200 px-4 py-2 flex flex-wrap items-center gap-3 shrink-0 text-xs">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0">
            Asunto:
          </span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-rotary-blue focus:ring-1 focus:ring-rotary-blue"
            placeholder="Asunto llamativo del correo..."
            disabled={readOnly}
          />
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0">
            Preheader:
          </span>
          <input
            type="text"
            value={preheader}
            onChange={(e) => setPreheader(e.target.value)}
            className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-rotary-blue focus:ring-1 focus:ring-rotary-blue"
            placeholder="Texto secundario que se muestra en la bandeja de entrada..."
            disabled={readOnly}
          />
        </div>
      </div>

      {/* ─── 3. ÁREA PRINCIPAL: LIENZO CENTRAL + BARRA LATERAL DERECHA ──── */}
      <div className="flex-1 flex overflow-hidden">
        {/* LIENZO DE TRABAJO (CANVAS CENTRAL) */}
        <main
          className="flex-1 bg-slate-200/60 overflow-y-auto p-4 sm:p-8 flex justify-center items-start"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedBlockId(null);
          }}
        >
          <div
            style={{
              width: deviceView === 'mobile' ? '375px' : `${bodyWidthPreset}px`,
              transform: `scale(${zoomLevel / 100})`,
              transformOrigin: 'top center',
              transition: 'width 0.2s ease, transform 0.2s ease'
            }}
            className="shadow-2xl rounded-2xl overflow-hidden border border-slate-300/80 transition-all bg-white"
          >
            {previewMode === 'live' ? (
              // Vista previa HTML real en Iframe
              <iframe
                title="Email Preview"
                srcDoc={compiledHtml}
                className="w-full min-h-[700px] border-0 bg-white"
              />
            ) : (
              // Lienzo interactivo de bloques con protección visual
              <div
                style={{
                  backgroundColor: design.settings.bg,
                  fontFamily: design.settings.font
                }}
                className="p-3 sm:p-5"
              >
                <div
                  style={{
                    backgroundColor: design.settings.contentBg,
                    color: design.settings.textColor
                  }}
                  className="rounded-xl overflow-hidden shadow-sm"
                >
                  {design.blocks.map((block, idx) => {
                    const isSelected = selectedBlockId === block.id;
                    const isProt = Boolean(block.isProtected);

                    return (
                      <div
                        key={block.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          const target = e.target as HTMLElement;
                          if (target && target.closest('a')) {
                            e.preventDefault();
                          }
                          setSelectedBlockId(block.id);
                        }}
                        className={`relative group transition-all cursor-pointer ${
                          isSelected
                            ? 'ring-2 ring-blue-600 ring-offset-2 shadow-md z-10'
                            : 'hover:outline hover:outline-1 hover:outline-blue-400/80'
                        }`}
                      >
                        {/* Etiqueta flotante del bloque */}
                        <div
                          className={`absolute -top-3 left-3 flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase shadow-md transition-opacity z-20 ${
                            isProt
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-blue-100 text-blue-900 border border-blue-300'
                          } ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                        >
                          {isProt ? (
                            <>
                              <Shield className="w-3 h-3 text-amber-600" />
                              <span>{block.label || 'Protegido'}</span>
                            </>
                          ) : (
                            <>
                              <Box className="w-3 h-3 text-blue-600" />
                              <span>{block.label || BLOCK_LABELS[block.type]}</span>
                            </>
                          )}
                        </div>

                        {/* Botones rápidos de orden y acción en hover */}
                        <div
                          className={`absolute top-2 right-2 flex items-center gap-1 bg-white/95 backdrop-blur rounded-xl p-1 shadow-lg border border-slate-200 z-20 transition-opacity ${
                            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          }`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => handleMoveBlock(idx, 'up')}
                            disabled={idx === 0}
                            className="p-1 text-slate-600 hover:text-rotary-blue disabled:opacity-30 rounded-lg hover:bg-slate-100"
                            title="Subir"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleMoveBlock(idx, 'down')}
                            disabled={idx === design.blocks.length - 1}
                            className="p-1 text-slate-600 hover:text-rotary-blue disabled:opacity-30 rounded-lg hover:bg-slate-100"
                            title="Bajar"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDuplicateBlock(idx)}
                            className="p-1 text-slate-600 hover:text-rotary-blue rounded-lg hover:bg-slate-100"
                            title="Duplicar"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggleProtection(block.id)}
                            className={`p-1 rounded-lg hover:bg-slate-100 ${isProt ? 'text-amber-600' : 'text-slate-400 hover:text-amber-600'}`}
                            title={isProt ? 'Quitar protección institucional' : 'Proteger componente'}
                          >
                            {isProt ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => handleDeleteBlock(block.id, isProt)}
                            className="p-1 text-rose-600 hover:text-rose-700 rounded-lg hover:bg-rose-50"
                            title="Eliminar bloque"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Renderizado de bloque individual */}
                        <div
                          dangerouslySetInnerHTML={{
                            __html: renderDesignToHtml(
                              { version: 1, settings: design.settings, blocks: [block] },
                              { interactive: false }
                            )
                          }}
                        />
                      </div>
                    );
                  })}

                  {design.blocks.length === 0 && (
                    <div className="p-12 text-center text-slate-400 space-y-3">
                      <Box className="w-10 h-10 mx-auto text-slate-300" />
                      <p className="text-sm font-semibold">El diseño no tiene bloques aún.</p>
                      <button
                        onClick={handleResetToRotaryMaster}
                        className="px-4 py-2 bg-rotary-blue text-white rounded-xl text-xs font-bold hover:bg-blue-700 shadow-xs"
                      >
                        Cargar Plantilla Maestra Oficial Rotary
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>

        {/* ─── 4. BARRA LATERAL DERECHA (BLOQUES Y PROPIEDADES) ───────── */}
        <aside className="w-80 sm:w-96 bg-white border-l border-slate-200 flex flex-col shrink-0 z-20">
          {/* Pestañas de la barra lateral */}
          <div className="flex border-b border-slate-200 bg-slate-50/90 p-1.5 gap-1">
            <button
              onClick={() => setActiveTab('blocks')}
              className={`flex-1 py-2 px-1 text-center text-[11px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1 ${
                activeTab === 'blocks'
                  ? 'bg-white text-rotary-blue shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              <span>Bloques</span>
            </button>
            <button
              onClick={() => setActiveTab('layouts')}
              className={`flex-1 py-2 px-1 text-center text-[11px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1 ${
                activeTab === 'layouts'
                  ? 'bg-white text-rotary-blue shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Layout className="w-3.5 h-3.5" />
              <span>Diseños</span>
            </button>
            <button
              onClick={() => setActiveTab('global')}
              className={`flex-1 py-2 px-1 text-center text-[11px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1 ${
                activeTab === 'global'
                  ? 'bg-white text-rotary-blue shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-amber-600" />
              <span>Globales</span>
            </button>
            <button
              onClick={() => setActiveTab('style')}
              className={`flex-1 py-2 px-1 text-center text-[11px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1 ${
                activeTab === 'style'
                  ? 'bg-white text-rotary-blue shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Estilo</span>
            </button>
            <button
              onClick={() => setActiveTab('tags')}
              className={`flex-1 py-2 px-1 text-center text-[11px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1 ${
                activeTab === 'tags'
                  ? 'bg-white text-rotary-blue shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
              title="Variables de combinación"
            >
              <Tag className="w-3.5 h-3.5" />
              <span>Tags</span>
            </button>
          </div>

          {/* Contenido de la pestaña activa o Inspector de Bloque */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Si hay un bloque seleccionado, mostrar Inspector de Propiedades */}
            {selectedBlock ? (
              <div className="space-y-4 bg-slate-50/80 border border-slate-200 rounded-2xl p-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                      Propiedades: {BLOCK_LABELS[selectedBlock.type] || selectedBlock.type}
                    </span>
                    {selectedBlock.isProtected && (
                      <span className="text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-bold border border-amber-300">
                        Protegido
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedBlockId(null)}
                    className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-200/60"
                    title="Cerrar inspector"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Formulario contextual de propiedades según el tipo */}
                <div className="space-y-3.5 text-xs text-slate-700">
                  {/* Encabezado */}
                  {selectedBlock.type === 'heading' && (
                    <>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 block mb-1">Texto del encabezado</label>
                        <input
                          type="text"
                          value={selectedBlock.text}
                          onChange={(e) => updateBlock(selectedBlock.id, { text: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:border-rotary-blue focus:ring-1 focus:ring-rotary-blue"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">Nivel</label>
                          <select
                            value={selectedBlock.level}
                            onChange={(e) => updateBlock(selectedBlock.id, { level: Number(e.target.value) as any })}
                            className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900"
                          >
                            <option value={1}>H1 (28px)</option>
                            <option value={2}>H2 (22px)</option>
                            <option value={3}>H3 (18px)</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">Color</label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              value={selectedBlock.color || '#013388'}
                              onChange={(e) => updateBlock(selectedBlock.id, { color: e.target.value })}
                              className="w-8 h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5"
                            />
                            <input
                              type="text"
                              value={selectedBlock.color || '#013388'}
                              onChange={(e) => updateBlock(selectedBlock.id, { color: e.target.value })}
                              className="flex-1 bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Texto / Párrafo */}
                  {selectedBlock.type === 'text' && (
                    <>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 block mb-1">Contenido (admite párrafos y variables)</label>
                        <textarea
                          rows={6}
                          value={selectedBlock.text}
                          onChange={(e) => updateBlock(selectedBlock.id, { text: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 font-mono text-xs focus:border-rotary-blue focus:ring-1 focus:ring-rotary-blue"
                          placeholder="Texto del mensaje..."
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">Tamaño (px)</label>
                          <input
                            type="number"
                            min={11}
                            max={24}
                            value={selectedBlock.size || 15}
                            onChange={(e) => updateBlock(selectedBlock.id, { size: Number(e.target.value) })}
                            className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">Color de Texto</label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              value={selectedBlock.color || '#334155'}
                              onChange={(e) => updateBlock(selectedBlock.id, { color: e.target.value })}
                              className="w-8 h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5"
                            />
                            <input
                              type="text"
                              value={selectedBlock.color || '#334155'}
                              onChange={(e) => updateBlock(selectedBlock.id, { color: e.target.value })}
                              className="flex-1 bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Botón */}
                  {selectedBlock.type === 'button' && (
                    <>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 block mb-1">Texto del botón</label>
                        <input
                          type="text"
                          value={selectedBlock.text}
                          onChange={(e) => updateBlock(selectedBlock.id, { text: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 block mb-1">Destino URL</label>
                        <input
                          type="text"
                          value={selectedBlock.href}
                          onChange={(e) => updateBlock(selectedBlock.id, { href: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900"
                          placeholder="https://... o {{form_url}}"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">Color Fondo</label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              value={selectedBlock.bg || '#013388'}
                              onChange={(e) => updateBlock(selectedBlock.id, { bg: e.target.value })}
                              className="w-8 h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5"
                            />
                            <input
                              type="text"
                              value={selectedBlock.bg || '#013388'}
                              onChange={(e) => updateBlock(selectedBlock.id, { bg: e.target.value })}
                              className="flex-1 bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-mono"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">Color Texto</label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              value={selectedBlock.color || '#ffffff'}
                              onChange={(e) => updateBlock(selectedBlock.id, { color: e.target.value })}
                              className="w-8 h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5"
                            />
                            <input
                              type="text"
                              value={selectedBlock.color || '#ffffff'}
                              onChange={(e) => updateBlock(selectedBlock.id, { color: e.target.value })}
                              className="flex-1 bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-mono"
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 block mb-1">Bordes Redondeados (px)</label>
                        <input
                          type="number"
                          min={0}
                          max={32}
                          value={selectedBlock.radius ?? 8}
                          onChange={(e) => updateBlock(selectedBlock.id, { radius: Number(e.target.value) })}
                          className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900"
                        />
                      </div>
                    </>
                  )}

                  {/* Imagen / Logo */}
                  {selectedBlock.type === 'image' && (
                    <>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 block mb-1">Archivo / URL de Imagen o Logo</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={selectedBlock.url}
                            onChange={(e) => updateBlock(selectedBlock.id, { url: e.target.value })}
                            className="flex-1 bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs"
                            placeholder="https://... o selecciona de biblioteca"
                          />
                          <button
                            type="button"
                            onClick={() => openMediaPickerFor((url) => updateBlock(selectedBlock.id, { url }))}
                            className="px-3 py-2 bg-rotary-blue hover:bg-blue-700 text-white rounded-xl font-bold text-xs shrink-0 shadow-xs"
                          >
                            Biblioteca
                          </button>
                        </div>
                        {selectedBlock.url && (
                          <div className="mt-2 p-2 border border-slate-200 rounded-xl bg-white text-center">
                            <img
                              src={selectedBlock.url}
                              alt={selectedBlock.alt || 'Preview'}
                              className="max-h-24 mx-auto object-contain rounded"
                            />
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 block mb-1">Texto alternativo (Alt)</label>
                        <input
                          type="text"
                          value={selectedBlock.alt}
                          onChange={(e) => updateBlock(selectedBlock.id, { alt: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900"
                          placeholder="Descripción de la imagen..."
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 block mb-1">Enlace de destino (opcional)</label>
                        <input
                          type="text"
                          value={selectedBlock.href || ''}
                          onChange={(e) => updateBlock(selectedBlock.id, { href: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900"
                          placeholder="https://..."
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">Ancho % ({selectedBlock.width}%)</label>
                          <input
                            type="range"
                            min={10}
                            max={100}
                            value={selectedBlock.width}
                            onChange={(e) => updateBlock(selectedBlock.id, { width: Number(e.target.value) })}
                            className="w-full"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">Radio borde ({selectedBlock.radius}px)</label>
                          <input
                            type="range"
                            min={0}
                            max={32}
                            value={selectedBlock.radius}
                            onChange={(e) => updateBlock(selectedBlock.id, { radius: Number(e.target.value) })}
                            className="w-full"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Columnas */}
                  {selectedBlock.type === 'columns' && (
                    <div className="space-y-3">
                      <div className="border border-slate-200 rounded-xl p-2.5 bg-white space-y-2">
                        <span className="font-bold text-rotary-blue block">Columna Izquierda</span>
                        <div className="flex gap-2">
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="radio"
                              name="col-left-kind"
                              checked={selectedBlock.left.kind === 'text'}
                              onChange={() => updateBlock(selectedBlock.id, { left: { ...selectedBlock.left, kind: 'text' } })}
                            />
                            Texto
                          </label>
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="radio"
                              name="col-left-kind"
                              checked={selectedBlock.left.kind === 'image'}
                              onChange={() => updateBlock(selectedBlock.id, { left: { ...selectedBlock.left, kind: 'image' } })}
                            />
                            Imagen
                          </label>
                        </div>
                        {selectedBlock.left.kind === 'text' ? (
                          <textarea
                            rows={3}
                            value={selectedBlock.left.text || ''}
                            onChange={(e) => updateBlock(selectedBlock.id, { left: { ...selectedBlock.left, text: e.target.value } })}
                            className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs"
                          />
                        ) : (
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={selectedBlock.left.url || ''}
                              onChange={(e) => updateBlock(selectedBlock.id, { left: { ...selectedBlock.left, url: e.target.value } })}
                              className="flex-1 bg-slate-50 border border-slate-300 rounded-lg p-1.5 text-xs"
                              placeholder="URL imagen..."
                            />
                            <button
                              type="button"
                              onClick={() => openMediaPickerFor((url) => updateBlock(selectedBlock.id, { left: { ...selectedBlock.left, url } }))}
                              className="px-2 py-1 bg-rotary-blue text-white rounded text-[11px] font-bold"
                            >
                              Medios
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="border border-slate-200 rounded-xl p-2.5 bg-white space-y-2">
                        <span className="font-bold text-rotary-blue block">Columna Derecha</span>
                        <div className="flex gap-2">
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="radio"
                              name="col-right-kind"
                              checked={selectedBlock.right.kind === 'text'}
                              onChange={() => updateBlock(selectedBlock.id, { right: { ...selectedBlock.right, kind: 'text' } })}
                            />
                            Texto
                          </label>
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="radio"
                              name="col-right-kind"
                              checked={selectedBlock.right.kind === 'image'}
                              onChange={() => updateBlock(selectedBlock.id, { right: { ...selectedBlock.right, kind: 'image' } })}
                            />
                            Imagen
                          </label>
                        </div>
                        {selectedBlock.right.kind === 'text' ? (
                          <textarea
                            rows={3}
                            value={selectedBlock.right.text || ''}
                            onChange={(e) => updateBlock(selectedBlock.id, { right: { ...selectedBlock.right, text: e.target.value } })}
                            className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs"
                          />
                        ) : (
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={selectedBlock.right.url || ''}
                              onChange={(e) => updateBlock(selectedBlock.id, { right: { ...selectedBlock.right, url: e.target.value } })}
                              className="flex-1 bg-slate-50 border border-slate-300 rounded-lg p-1.5 text-xs"
                              placeholder="URL imagen..."
                            />
                            <button
                              type="button"
                              onClick={() => openMediaPickerFor((url) => updateBlock(selectedBlock.id, { right: { ...selectedBlock.right, url } }))}
                              className="px-2 py-1 bg-rotary-blue text-white rounded text-[11px] font-bold"
                            >
                              Medios
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Tabla estructurada */}
                  {selectedBlock.type === 'table' && (
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-slate-600">Columnas / Cabeceras</label>
                          <button
                            type="button"
                            onClick={() => {
                              const newHeaders = [...(selectedBlock.headers || []), `Col ${((selectedBlock.headers || []).length) + 1}`];
                              const newRows = (selectedBlock.rows || []).map((r) => ({ cells: [...r.cells, 'Dato'] }));
                              updateBlock(selectedBlock.id, { headers: newHeaders, rows: newRows });
                            }}
                            className="text-rotary-blue font-bold text-xs"
                          >
                            + Columna
                          </button>
                        </div>
                        <div className="space-y-1">
                          {(selectedBlock.headers || []).map((h, hi) => (
                            <div key={hi} className="flex gap-1">
                              <input
                                type="text"
                                value={h}
                                onChange={(e) => {
                                  const headersCopy = [...(selectedBlock.headers || [])];
                                  headersCopy[hi] = e.target.value;
                                  updateBlock(selectedBlock.id, { headers: headersCopy });
                                }}
                                className="flex-1 bg-white border border-slate-300 rounded-lg p-1 text-xs"
                              />
                              {(selectedBlock.headers || []).length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const headersCopy = (selectedBlock.headers || []).filter((_, idx) => idx !== hi);
                                    const rowsCopy = (selectedBlock.rows || []).map((r) => ({
                                      cells: r.cells.filter((_, idx) => idx !== hi)
                                    }));
                                    updateBlock(selectedBlock.id, { headers: headersCopy, rows: rowsCopy });
                                  }}
                                  className="text-red-500 hover:text-red-700 px-1 text-xs"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-slate-600">Filas ({selectedBlock.rows?.length || 0})</label>
                          <button
                            type="button"
                            onClick={() => {
                              const colCount = (selectedBlock.headers || []).length || 2;
                              const newRow: TableRow = { cells: Array(colCount).fill('Dato') };
                              updateBlock(selectedBlock.id, { rows: [...(selectedBlock.rows || []), newRow] });
                            }}
                            className="text-rotary-blue font-bold text-xs"
                          >
                            + Fila
                          </button>
                        </div>
                        <div className="space-y-1.5 max-h-36 overflow-y-auto">
                          {(selectedBlock.rows || []).map((r, ri) => (
                            <div key={ri} className="flex gap-1 items-center bg-white border border-slate-200 p-1 rounded-lg">
                              {r.cells.map((c, ci) => (
                                <input
                                  key={ci}
                                  type="text"
                                  value={c}
                                  onChange={(e) => {
                                    const rowsCopy = [...selectedBlock.rows];
                                    const cellsCopy = [...rowsCopy[ri].cells];
                                    cellsCopy[ci] = e.target.value;
                                    rowsCopy[ri] = { cells: cellsCopy };
                                    updateBlock(selectedBlock.id, { rows: rowsCopy });
                                  }}
                                  className="flex-1 bg-slate-50 border border-slate-200 rounded p-1 text-xs"
                                />
                              ))}
                              <button
                                type="button"
                                onClick={() => {
                                  const rowsCopy = selectedBlock.rows.filter((_, idx) => idx !== ri);
                                  updateBlock(selectedBlock.id, { rows: rowsCopy });
                                }}
                                className="text-red-500 px-1 font-bold"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Menú de Navegación */}
                  {selectedBlock.type === 'menu' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-slate-600">Enlaces del Menú</label>
                        <button
                          type="button"
                          onClick={() => {
                            const newItems: MenuItem[] = [...(selectedBlock.items || []), { label: 'Enlace', url: '#' }];
                            updateBlock(selectedBlock.id, { items: newItems });
                          }}
                          className="text-rotary-blue font-bold text-xs"
                        >
                          + Enlace
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        {(selectedBlock.items || []).map((item, ii) => (
                          <div key={ii} className="flex gap-1.5 items-center">
                            <input
                              type="text"
                              value={item.label}
                              onChange={(e) => {
                                const copy = [...selectedBlock.items];
                                copy[ii] = { ...copy[ii], label: e.target.value };
                                updateBlock(selectedBlock.id, { items: copy });
                              }}
                              className="w-1/3 bg-white border border-slate-300 rounded-lg p-1.5 text-xs"
                              placeholder="Etiqueta"
                            />
                            <input
                              type="text"
                              value={item.url}
                              onChange={(e) => {
                                const copy = [...selectedBlock.items];
                                copy[ii] = { ...copy[ii], url: e.target.value };
                                updateBlock(selectedBlock.id, { items: copy });
                              }}
                              className="flex-1 bg-white border border-slate-300 rounded-lg p-1.5 text-xs"
                              placeholder="https://..."
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const copy = selectedBlock.items.filter((_, idx) => idx !== ii);
                                updateBlock(selectedBlock.id, { items: copy });
                              }}
                              className="text-red-500 px-1 font-bold"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Redes Sociales */}
                  {selectedBlock.type === 'social' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-slate-600">Perfiles de Redes Sociales</label>
                        <button
                          type="button"
                          onClick={() => {
                            const nextNet: SocialNetwork = 'whatsapp';
                            const copy = [...(selectedBlock.links || []), { network: nextNet, url: 'https://wa.me/' }];
                            updateBlock(selectedBlock.id, { links: copy });
                          }}
                          className="text-rotary-blue font-bold text-xs"
                        >
                          + Red
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        {(selectedBlock.links || []).map((lnk, li) => (
                          <div key={li} className="flex gap-1.5 items-center">
                            <select
                              value={lnk.network}
                              onChange={(e) => {
                                const copy = [...selectedBlock.links];
                                copy[li] = { ...copy[li], network: e.target.value as SocialNetwork };
                                updateBlock(selectedBlock.id, { links: copy });
                              }}
                              className="w-1/3 bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-bold"
                            >
                              <option value="facebook">Facebook</option>
                              <option value="instagram">Instagram</option>
                              <option value="whatsapp">WhatsApp</option>
                              <option value="youtube">YouTube</option>
                              <option value="linkedin">LinkedIn</option>
                              <option value="x">X / Twitter</option>
                              <option value="web">Sitio Web</option>
                            </select>
                            <input
                              type="text"
                              value={lnk.url}
                              onChange={(e) => {
                                const copy = [...selectedBlock.links];
                                copy[li] = { ...copy[li], url: e.target.value };
                                updateBlock(selectedBlock.id, { links: copy });
                              }}
                              className="flex-1 bg-white border border-slate-300 rounded-lg p-1.5 text-xs"
                              placeholder="URL de tu perfil..."
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const copy = selectedBlock.links.filter((_, idx) => idx !== li);
                                updateBlock(selectedBlock.id, { links: copy });
                              }}
                              className="text-red-500 px-1 font-bold"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Divisor */}
                  {selectedBlock.type === 'divider' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 block mb-1">Grosor (px)</label>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={selectedBlock.thickness || 1}
                          onChange={(e) => updateBlock(selectedBlock.id, { thickness: Number(e.target.value) })}
                          className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 block mb-1">Color de línea</label>
                        <input
                          type="color"
                          value={selectedBlock.color || '#e2e8f0'}
                          onChange={(e) => updateBlock(selectedBlock.id, { color: e.target.value })}
                          className="w-full h-9 rounded-lg border border-slate-300 cursor-pointer p-0.5"
                        />
                      </div>
                    </div>
                  )}

                  {/* Espaciador */}
                  {selectedBlock.type === 'spacer' && (
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">Altura del espacio: {selectedBlock.height}px</label>
                      <input
                        type="range"
                        min={10}
                        max={120}
                        value={selectedBlock.height}
                        onChange={(e) => updateBlock(selectedBlock.id, { height: Number(e.target.value) })}
                        className="w-full"
                      />
                    </div>
                  )}

                  {/* Video */}
                  {selectedBlock.type === 'video' && (
                    <div className="space-y-2">
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 block mb-1">URL del Video (YouTube o Vimeo)</label>
                        <input
                          type="text"
                          value={selectedBlock.url}
                          onChange={(e) => updateBlock(selectedBlock.id, { url: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 block mb-1">Título del Video</label>
                        <input
                          type="text"
                          value={selectedBlock.title}
                          onChange={(e) => updateBlock(selectedBlock.id, { title: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 block mb-1">Miniatura del Video</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={selectedBlock.thumbnail}
                            onChange={(e) => updateBlock(selectedBlock.id, { thumbnail: e.target.value })}
                            className="flex-1 bg-white border border-slate-300 rounded-xl p-2 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => openMediaPickerFor((url) => updateBlock(selectedBlock.id, { thumbnail: url }))}
                            className="px-3 bg-rotary-blue text-white rounded-xl text-xs font-bold"
                          >
                            Biblioteca
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* HTML Libre */}
                  {selectedBlock.type === 'html' && (
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">Código HTML Seguro</label>
                      <textarea
                        rows={6}
                        value={selectedBlock.html}
                        onChange={(e) => updateBlock(selectedBlock.id, { html: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 font-mono text-xs"
                        placeholder="<div>...</div>"
                      />
                    </div>
                  )}

                  {/* Bloque Global Institucional */}
                  {selectedBlock.type === 'global' && (
                    <div className="space-y-4">
                      {/* Cabecera Informativa de Bloque Global */}
                      <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-bold text-amber-900">
                            <Shield className="w-4 h-4 text-amber-600" />
                            <span>Componente Institucional Oficial</span>
                          </div>
                          <span className="text-[10px] font-mono bg-white px-1.5 py-0.5 rounded border border-amber-200 text-amber-800">
                            {selectedBlock.globalKey}
                          </span>
                        </div>
                        <p className="text-[11px] text-amber-800/90 leading-relaxed">
                          Personaliza este componente para la plantilla o campaña conservando la armonía y marca de Rotary International.
                        </p>
                      </div>

                      {/* 1. Encabezado Oficial Rotary */}
                      {selectedBlock.globalKey === 'rotary_header' && (
                        <div className="space-y-3.5">
                          {/* Logo de Cabecera */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[11px] font-bold text-slate-700">Logo de Cabecera</label>
                              {selectedBlock.logoUrl && (
                                <button
                                  type="button"
                                  onClick={() => updateBlock(selectedBlock.id, { logoUrl: '' })}
                                  className="text-[11px] text-rose-600 hover:text-rose-700 font-bold"
                                >
                                  Restaurar Emblema
                                </button>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={selectedBlock.logoUrl || ''}
                                onChange={(e) => updateBlock(selectedBlock.id, { logoUrl: e.target.value })}
                                className="flex-1 bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs"
                                placeholder="URL de logo personalizado..."
                              />
                              <button
                                type="button"
                                onClick={() => openMediaPickerFor((url) => updateBlock(selectedBlock.id, { logoUrl: url }))}
                                className="px-3 py-2 bg-rotary-blue hover:bg-blue-700 text-white rounded-xl font-bold text-xs shrink-0 shadow-xs flex items-center gap-1"
                              >
                                <ImageIcon className="w-3.5 h-3.5" />
                                <span>Biblioteca</span>
                              </button>
                            </div>
                            {selectedBlock.logoUrl ? (
                              <div className="mt-2 p-2 border border-slate-200 rounded-xl bg-white text-center">
                                <img
                                  src={selectedBlock.logoUrl}
                                  alt="Logo Cabecera"
                                  className="max-h-16 mx-auto object-contain rounded"
                                />
                              </div>
                            ) : (
                              <div className="mt-1.5 p-2 bg-slate-100/80 rounded-lg text-center text-[11px] text-slate-600 font-medium">
                                Emblema tipográfico oficial activo (ROTARY INTERNATIONAL)
                              </div>
                            )}
                          </div>

                          {/* Fondo de Cabecera */}
                          <div>
                            <label className="text-[11px] font-bold text-slate-700 block mb-1">Fondo de Cabecera</label>
                            <div className="grid grid-cols-2 gap-1.5 mb-2">
                              {[
                                { label: 'Degradado Rotary', val: 'linear-gradient(135deg, #013388 0%, #0c2340 100%)' },
                                { label: 'Azul Oficial (#013388)', val: '#013388' },
                                { label: 'Azul Marino (#0c2340)', val: '#0c2340' },
                                { label: 'Dorado Rotario', val: 'linear-gradient(135deg, #f7a81b 0%, #d97706 100%)' }
                              ].map((preset) => (
                                <button
                                  key={preset.label}
                                  type="button"
                                  onClick={() => updateBlock(selectedBlock.id, { bgGradient: preset.val, bgColor: preset.val })}
                                  className={`p-1.5 text-[10px] font-bold rounded-lg border text-left transition-all truncate ${
                                    (selectedBlock.bgGradient || selectedBlock.bgColor) === preset.val
                                      ? 'border-rotary-blue bg-blue-50 text-rotary-blue ring-1 ring-rotary-blue'
                                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                  }`}
                                >
                                  {preset.label}
                                </button>
                              ))}
                            </div>
                            <input
                              type="text"
                              value={selectedBlock.bgGradient || selectedBlock.bgColor || ''}
                              onChange={(e) => updateBlock(selectedBlock.id, { bgGradient: e.target.value, bgColor: e.target.value })}
                              className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs font-mono"
                              placeholder="CSS de fondo (ej: #013388 o linear-gradient(...))"
                            />
                          </div>

                          {/* Insignia / Distritos */}
                          <div>
                            <label className="text-[11px] font-bold text-slate-700 block mb-1">Insignia / Distritos</label>
                            <input
                              type="text"
                              value={selectedBlock.badge !== undefined ? selectedBlock.badge : 'Rotary en Acción · Distritos 4271 & 4281'}
                              onChange={(e) => updateBlock(selectedBlock.id, { badge: e.target.value })}
                              className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs"
                              placeholder="Dejar vacío para ocultar insignia"
                            />
                          </div>

                          {/* Título Principal */}
                          <div>
                            <label className="text-[11px] font-bold text-slate-700 block mb-1">Título Principal</label>
                            <textarea
                              rows={2}
                              value={selectedBlock.title !== undefined ? selectedBlock.title : 'Tu club transforma comunidades.\n¡Hagámoslo visible!'}
                              onChange={(e) => updateBlock(selectedBlock.id, { title: e.target.value })}
                              className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs"
                            />
                          </div>

                          {/* Subtítulo Opcional */}
                          <div>
                            <label className="text-[11px] font-bold text-slate-700 block mb-1">Subtítulo Opcional</label>
                            <input
                              type="text"
                              value={selectedBlock.subtitle || ''}
                              onChange={(e) => updateBlock(selectedBlock.id, { subtitle: e.target.value })}
                              className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs"
                              placeholder="Subtítulo..."
                            />
                          </div>

                          {/* Color Texto y Espaciado */}
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[11px] font-bold text-slate-700 block mb-1">Color de Texto</label>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="color"
                                  value={selectedBlock.textColor || '#ffffff'}
                                  onChange={(e) => updateBlock(selectedBlock.id, { textColor: e.target.value })}
                                  className="w-8 h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5"
                                />
                                <input
                                  type="text"
                                  value={selectedBlock.textColor || '#ffffff'}
                                  onChange={(e) => updateBlock(selectedBlock.id, { textColor: e.target.value })}
                                  className="flex-1 bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-mono"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-slate-700 block mb-1">Espaciado</label>
                              <select
                                value={selectedBlock.padding || '28px 24px'}
                                onChange={(e) => updateBlock(selectedBlock.id, { padding: e.target.value })}
                                className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs"
                              >
                                <option value="16px 20px">Compacto (16px)</option>
                                <option value="28px 24px">Estándar (28px)</option>
                                <option value="40px 24px">Amplio (40px)</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 2. Pie de Página Oficial Rotary */}
                      {selectedBlock.globalKey === 'rotary_footer' && (
                        <div className="space-y-3.5">
                          {/* Logo de Pie */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[11px] font-bold text-slate-700">Logo de Pie de Página (opcional)</label>
                              {selectedBlock.logoUrl && (
                                <button
                                  type="button"
                                  onClick={() => updateBlock(selectedBlock.id, { logoUrl: '' })}
                                  className="text-[11px] text-rose-600 hover:text-rose-700 font-bold"
                                >
                                  Quitar Logo
                                </button>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={selectedBlock.logoUrl || ''}
                                onChange={(e) => updateBlock(selectedBlock.id, { logoUrl: e.target.value })}
                                className="flex-1 bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs"
                                placeholder="URL de logo..."
                              />
                              <button
                                type="button"
                                onClick={() => openMediaPickerFor((url) => updateBlock(selectedBlock.id, { logoUrl: url }))}
                                className="px-3 py-2 bg-rotary-blue hover:bg-blue-700 text-white rounded-xl font-bold text-xs shrink-0 shadow-xs flex items-center gap-1"
                              >
                                <ImageIcon className="w-3.5 h-3.5" />
                                <span>Biblioteca</span>
                              </button>
                            </div>
                          </div>

                          {/* Color Fondo Footer */}
                          <div>
                            <label className="text-[11px] font-bold text-slate-700 block mb-1">Color Fondo de Footer</label>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="color"
                                value={selectedBlock.bgColor || '#0c2340'}
                                onChange={(e) => updateBlock(selectedBlock.id, { bgColor: e.target.value })}
                                className="w-8 h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5"
                              />
                              <input
                                type="text"
                                value={selectedBlock.bgColor || '#0c2340'}
                                onChange={(e) => updateBlock(selectedBlock.id, { bgColor: e.target.value })}
                                className="flex-1 bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-mono"
                              />
                            </div>
                          </div>

                          {/* Título de Footer */}
                          <div>
                            <label className="text-[11px] font-bold text-slate-700 block mb-1">Título de Pie</label>
                            <input
                              type="text"
                              value={selectedBlock.title !== undefined ? selectedBlock.title : '¡Síguenos y comparte el orgullo rotario!'}
                              onChange={(e) => updateBlock(selectedBlock.id, { title: e.target.value })}
                              className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs"
                            />
                          </div>

                          {/* Toggles de Contenido */}
                          <div className="space-y-2 pt-1 border-t border-slate-200">
                            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                              <input
                                type="checkbox"
                                checked={selectedBlock.showAreas !== false}
                                onChange={(e) => updateBlock(selectedBlock.id, { showAreas: e.target.checked })}
                                className="rounded border-slate-300 text-rotary-blue focus:ring-rotary-blue"
                              />
                              <span>Mostrar insignias de las 7 Áreas de Interés</span>
                            </label>

                            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                              <input
                                type="checkbox"
                                checked={selectedBlock.showSocial !== false}
                                onChange={(e) => updateBlock(selectedBlock.id, { showSocial: e.target.checked })}
                                className="rounded border-slate-300 text-rotary-blue focus:ring-rotary-blue"
                              />
                              <span>Mostrar botones de redes sociales oficiales</span>
                            </label>
                          </div>

                          {/* Enlace WhatsApp */}
                          <div className="pt-1 border-t border-slate-200">
                            <label className="text-[11px] font-bold text-slate-700 block mb-1">Asistencia WhatsApp</label>
                            <input
                              type="text"
                              value={selectedBlock.whatsappUrl !== undefined ? selectedBlock.whatsappUrl : 'https://wa.me/573108520231'}
                              onChange={(e) => updateBlock(selectedBlock.id, { whatsappUrl: e.target.value })}
                              className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs mb-1.5"
                              placeholder="https://wa.me/..."
                            />
                            <input
                              type="text"
                              value={selectedBlock.whatsappText || 'Asistencia directa a través de WhatsApp'}
                              onChange={(e) => updateBlock(selectedBlock.id, { whatsappText: e.target.value })}
                              className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs"
                              placeholder="Texto del enlace..."
                            />
                          </div>

                          {/* Texto Institucional y Legal */}
                          <div className="pt-1 border-t border-slate-200">
                            <label className="text-[11px] font-bold text-slate-700 block mb-1">Texto Institucional y Enlace de Baja</label>
                            <textarea
                              rows={3}
                              value={selectedBlock.footerText !== undefined ? selectedBlock.footerText : 'Rotary en Acción · Distritos 4271 y 4281 Colombia.\n© 2026 Rotary International. Todos los derechos reservados.\n<a href="{{unsubscribe_url}}" target="_blank" style="color:#cbd5e1;text-decoration:underline">Preferencias de comunicación y cancelar suscripción</a>'}
                              onChange={(e) => updateBlock(selectedBlock.id, { footerText: e.target.value })}
                              className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs font-mono"
                            />
                          </div>
                        </div>
                      )}

                      {/* 3. Firma Distrital Oficial */}
                      {selectedBlock.globalKey === 'rotary_signature' && (
                        <div className="space-y-3.5">
                          <div>
                            <label className="text-[11px] font-bold text-slate-700 block mb-1">Título del Comité / Firmante</label>
                            <input
                              type="text"
                              value={selectedBlock.title || 'Comité Distrital de Imagen Pública y Comunicaciones'}
                              onChange={(e) => updateBlock(selectedBlock.id, { title: e.target.value })}
                              className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-700 block mb-1">Subtítulo / Entidad</label>
                            <input
                              type="text"
                              value={selectedBlock.subtitle || 'Rotary en Acción · Distritos 4271 y 4281'}
                              onChange={(e) => updateBlock(selectedBlock.id, { subtitle: e.target.value })}
                              className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-700 block mb-1">Lema Institucional</label>
                            <input
                              type="text"
                              value={selectedBlock.motto || '«Dar de sí antes de pensar en sí»'}
                              onChange={(e) => updateBlock(selectedBlock.id, { motto: e.target.value })}
                              className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[11px] font-bold text-slate-700 block mb-1">Color Fondo</label>
                              <input
                                type="color"
                                value={selectedBlock.bgColor || '#f8fafc'}
                                onChange={(e) => updateBlock(selectedBlock.id, { bgColor: e.target.value })}
                                className="w-full h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-slate-700 block mb-1">Color Acento</label>
                              <input
                                type="color"
                                value={selectedBlock.borderColor || '#013388'}
                                onChange={(e) => updateBlock(selectedBlock.id, { borderColor: e.target.value })}
                                className="w-full h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 4. 7 Áreas de Interés */}
                      {selectedBlock.globalKey === 'rotary_areas_focus' && (
                        <div className="space-y-3.5">
                          <div>
                            <label className="text-[11px] font-bold text-slate-700 block mb-1">Título de Sección</label>
                            <input
                              type="text"
                              value={selectedBlock.title || 'Las 7 Áreas de Interés de Rotary International:'}
                              onChange={(e) => updateBlock(selectedBlock.id, { title: e.target.value })}
                              className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-700 block mb-1">Color Fondo</label>
                            <input
                              type="color"
                              value={selectedBlock.bgColor || '#f8fafc'}
                              onChange={(e) => updateBlock(selectedBlock.id, { bgColor: e.target.value })}
                              className="w-full h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5"
                            />
                          </div>
                        </div>
                      )}

                      {/* 5. Otros bloques globales genéricos */}
                      {!['rotary_header', 'rotary_footer', 'rotary_signature', 'rotary_areas_focus'].includes(selectedBlock.globalKey || '') && (
                        <div>
                          <label className="text-[11px] font-bold text-slate-700 block mb-1">HTML Personalizado</label>
                          <textarea
                            rows={5}
                            value={selectedBlock.customHtml || ''}
                            onChange={(e) => updateBlock(selectedBlock.id, { customHtml: e.target.value })}
                            className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs font-mono"
                            placeholder="<div>...</div>"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Alineación (si aplica al bloque) */}
                  {'align' in selectedBlock && (
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">Alineación</label>
                      <div className="grid grid-cols-3 gap-1 bg-white p-1 rounded-xl border border-slate-300 text-center">
                        {(['left', 'center', 'right'] as Align[]).map((a) => (
                          <button
                            key={a}
                            onClick={() => updateBlock(selectedBlock.id, { align: a })}
                            className={`py-1 rounded-lg text-xs font-bold capitalize transition-all ${
                              selectedBlock.align === a
                                ? 'bg-rotary-blue text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {a === 'left' ? 'Izquierda' : a === 'center' ? 'Centro' : 'Derecha'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Espaciado Vertical Padding (padTop / padBottom) */}
                  <div className="border-t border-slate-200 pt-3">
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Espaciado Vertical (px)</label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-500">Arriba</span>
                        <input
                          type="number"
                          min={0}
                          max={120}
                          value={(selectedBlock as any).padTop ?? 8}
                          onChange={(e) => updateBlock(selectedBlock.id, { padTop: Number(e.target.value) })}
                          className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500">Abajo</span>
                        <input
                          type="number"
                          min={0}
                          max={120}
                          value={(selectedBlock as any).padBottom ?? 8}
                          onChange={(e) => updateBlock(selectedBlock.id, { padBottom: Number(e.target.value) })}
                          className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Estado de protección institucional */}
                  <div className="border-t border-slate-200 pt-3">
                    <button
                      onClick={() => handleToggleProtection(selectedBlock.id)}
                      className={`w-full py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border transition-all ${
                        selectedBlock.isProtected
                          ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {selectedBlock.isProtected ? (
                        <>
                          <Lock className="w-3.5 h-3.5 text-amber-600" />
                          <span>Componente Protegido (Clic para Desbloquear)</span>
                        </>
                      ) : (
                        <>
                          <Unlock className="w-3.5 h-3.5 text-slate-500" />
                          <span>Bloquear como Componente Institucional Protegido</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* PESTAÑA: BLOQUES DISPONIBLES */}
            {activeTab === 'blocks' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                    Bloques Disponibles
                  </h3>
                  <span className="text-[10px] text-slate-400">Clic para insertar</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { type: 'heading', label: 'ENCABEZADO', icon: Type, desc: 'Títulos H1, H2, H3' },
                    { type: 'text', label: 'PÁRRAFO', icon: Type, desc: 'Texto editorial' },
                    { type: 'button', label: 'BOTÓN', icon: Square, desc: 'Llamado a la acción' },
                    { type: 'image', label: 'IMAGEN / LOGO', icon: ImageIcon, desc: 'Fotos y logos' },
                    { type: 'columns', label: 'COLUMNAS', icon: Columns, desc: '2 columnas paralelas' },
                    { type: 'divider', label: 'DIVISOR', icon: Minus, desc: 'Línea de separación' },
                    { type: 'table', label: 'TABLA', icon: TableIcon, desc: 'Tabla estilizada' },
                    { type: 'menu', label: 'MENÚ', icon: MenuIcon, desc: 'Barra de enlaces' },
                    { type: 'social', label: 'REDES', icon: Share2, desc: 'Redes sociales' },
                    { type: 'video', label: 'VIDEO', icon: Video, desc: 'Enlace a video' },
                    { type: 'html', label: 'HTML', icon: Code, desc: 'Código libre seguro' },
                    { type: 'spacer', label: 'ESPACIADOR', icon: Minus, desc: 'Espacio en blanco' }
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.type}
                        onClick={() => handleAddBlock(item.type as BlockType)}
                        className="bg-white border border-slate-200 hover:border-rotary-blue hover:bg-blue-50/40 rounded-xl p-3 text-center transition-all group flex flex-col items-center justify-center gap-1.5 shadow-2xs"
                      >
                        <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-blue-100 text-slate-700 group-hover:text-rotary-blue flex items-center justify-center transition-colors">
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-black text-slate-800 tracking-wide">
                          {item.label}
                        </span>
                        <span className="text-[10px] text-slate-500 line-clamp-1">
                          {item.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* PESTAÑA: ESTRUCTURAS (LAYOUTS) */}
            {activeTab === 'layouts' && (
              <div className="space-y-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                  Estructuras Prearmadas
                </h3>
                <div className="space-y-2">
                  <div
                    onClick={() => {
                      handleAddBlock('heading');
                      handleAddBlock('text');
                      handleAddBlock('button');
                    }}
                    className="p-3 bg-white border border-slate-200 hover:border-rotary-blue rounded-xl cursor-pointer hover:bg-blue-50/30 transition-all flex items-center gap-3"
                  >
                    <div className="p-2 bg-blue-100 text-rotary-blue rounded-lg">
                      <Shield className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">Hero Principal</div>
                      <div className="text-[10px] text-slate-500">Título destacado + Párrafo + Botón CTA</div>
                    </div>
                  </div>

                  <div
                    onClick={() => {
                      handleAddBlock('columns');
                    }}
                    className="p-3 bg-white border border-slate-200 hover:border-rotary-blue rounded-xl cursor-pointer hover:bg-blue-50/30 transition-all flex items-center gap-3"
                  >
                    <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                      <Columns className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">Mosaico 2 Columnas</div>
                      <div className="text-[10px] text-slate-500">Distribución lado a lado (imagen o texto)</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* PESTAÑA: BLOQUES GLOBALES INSTITUCIONALES */}
            {activeTab === 'global' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-amber-500" />
                    <span>Componentes Globales</span>
                  </h3>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Componentes oficiales de la identidad Rotary en Acción. Los cambios guardados se replican en plantillas futuras sin alterar snapshots históricos.
                </p>

                <div className="space-y-2.5">
                  {getRotaryGlobalBlocksCatalog().map((gb) => (
                    <div
                      key={gb.key}
                      className="p-3 bg-white border border-slate-200 hover:border-rotary-blue rounded-xl flex items-center justify-between gap-2 shadow-2xs"
                    >
                      <div>
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{gb.title}</span>
                          <span className="text-[9px] font-black bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full border border-amber-300">
                            OFICIAL
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {gb.description}
                        </div>
                      </div>
                      <button
                        onClick={() => handleInsertGlobalBlock(gb.key, gb.title)}
                        className="px-2.5 py-1 bg-rotary-blue hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg shrink-0 flex items-center gap-1 shadow-xs"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Insertar</span>
                      </button>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-slate-200">
                  <button
                    onClick={handleResetToRotaryMaster}
                    className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold border border-slate-300 transition-colors"
                  >
                    Restaurar Plantilla Maestra Completa
                  </button>
                </div>
              </div>
            )}

            {/* PESTAÑA: ESTILOS GENERALES */}
            {activeTab === 'style' && (
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                  Estilos Globales de la Plantilla
                </h3>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Fondo Exterior del Correo</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={design.settings.bg}
                        onChange={(e) => updateSettings({ bg: e.target.value })}
                        className="w-8 h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5"
                      />
                      <input
                        type="text"
                        value={design.settings.bg}
                        onChange={(e) => updateSettings({ bg: e.target.value })}
                        className="flex-1 bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Fondo del Contenedor Central</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={design.settings.contentBg}
                        onChange={(e) => updateSettings({ contentBg: e.target.value })}
                        className="w-8 h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5"
                      />
                      <input
                        type="text"
                        value={design.settings.contentBg}
                        onChange={(e) => updateSettings({ contentBg: e.target.value })}
                        className="flex-1 bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Color de Texto Base</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={design.settings.textColor}
                        onChange={(e) => updateSettings({ textColor: e.target.value })}
                        className="w-8 h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5"
                      />
                      <input
                        type="text"
                        value={design.settings.textColor}
                        onChange={(e) => updateSettings({ textColor: e.target.value })}
                        className="flex-1 bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Color de Enlaces</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={design.settings.linkColor}
                        onChange={(e) => updateSettings({ linkColor: e.target.value })}
                        className="w-8 h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5"
                      />
                      <input
                        type="text"
                        value={design.settings.linkColor}
                        onChange={(e) => updateSettings({ linkColor: e.target.value })}
                        className="flex-1 bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Tipografía Principal</label>
                    <select
                      value={design.settings.font}
                      onChange={(e) => updateSettings({ font: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900"
                    >
                      {FONT_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* PESTAÑA: VARIABLES (TAGS) */}
            {activeTab === 'tags' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                    Variables Dinámicas (Tags)
                  </h3>
                  <span className="text-[10px] text-slate-400">Clic para copiar</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Inserta estas etiquetas en asuntos o bloques de texto para personalizar automáticamente cada envío:
                </p>

                <div className="space-y-1.5">
                  {[
                    { tag: '{{contact.first_name}}', desc: 'Nombre del socio o contacto' },
                    { tag: '{{contact.last_name}}', desc: 'Apellido del contacto' },
                    { tag: '{{contact.email}}', desc: 'Correo electrónico del destinatario' },
                    { tag: '{{contact.first_name|Amigo rotario}}', desc: 'Nombre con fallback por defecto' },
                    { tag: '{{club.name}}', desc: 'Nombre oficial del Club Rotario' },
                    { tag: '{{campaign.name}}', desc: 'Nombre de la campaña' },
                    { tag: '{{district.name}}', desc: 'Distrito Rotario (4271 / 4281)' },
                    { tag: '{{form_url}}', desc: 'Enlace al formulario de postulación' },
                    { tag: '{{unsubscribe_url}}', desc: 'Enlace de cancelación de suscripción' }
                  ].map((t) => (
                    <button
                      key={t.tag}
                      onClick={() => {
                        navigator.clipboard.writeText(t.tag);
                        toast.success(`Copiado: ${t.tag}`);
                      }}
                      className="w-full text-left p-2.5 bg-white border border-slate-200 hover:border-rotary-blue hover:bg-blue-50/30 rounded-xl transition-all group flex items-center justify-between shadow-2xs"
                    >
                      <div>
                        <div className="text-xs font-mono font-bold text-rotary-blue">
                          {t.tag}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {t.desc}
                        </div>
                      </div>
                      <Copy className="w-3.5 h-3.5 text-slate-400 group-hover:text-rotary-blue" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ─── 5. MODAL DE ENVÍO DE CORREO DE PRUEBA ─────────────────────── */}
      {testEmailOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl text-slate-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-50 rounded-xl text-amber-600">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Enviar Correo de Prueba</h3>
                  <p className="text-xs text-slate-500">Comprueba la renderización real en tu cliente de correo</p>
                </div>
              </div>
              <button
                onClick={() => setTestEmailOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Correo Electrónico de Destino:
                </label>
                <input
                  type="email"
                  value={testEmailRecipient}
                  onChange={(e) => setTestEmailRecipient(e.target.value)}
                  placeholder="ejemplo@rotary.org"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-sm text-slate-900 focus:outline-none focus:border-rotary-blue focus:bg-white focus:ring-1 focus:ring-rotary-blue transition-all"
                />
              </div>

              {testReceipt && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Último envío aceptado por el proveedor:</span>
                  </div>
                  <div>Destinatario: <span className="font-mono">{testReceipt.to}</span></div>
                  <div>ID Proveedor: <span className="font-mono text-[11px]">{testReceipt.messageId}</span></div>
                  <div className="text-[10px] text-emerald-600">{new Date(testReceipt.timestamp).toLocaleTimeString()}</div>
                </div>
              )}

              <p className="text-[11px] text-slate-500 leading-relaxed">
                El correo compila el HTML con tablas compatibles y estilos en línea aptos para Gmail, Outlook, Apple Mail y Yahoo Mail.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setTestEmailOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
              >
                Cerrar
              </button>
              <button
                onClick={handleSendTestEmail}
                disabled={sendingTest}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold disabled:opacity-50 flex items-center gap-1.5 shadow-xs transition-all"
              >
                {sendingTest ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>{sendingTest ? 'Enviando...' : 'Enviar Prueba'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 6. SELECTOR DE MEDIOS (MediaPicker Integrado) ─────────────── */}
      <MediaPicker
        isOpen={mediaPickerOpen}
        onClose={() => {
          setMediaPickerOpen(false);
          setMediaTargetCallback(null);
        }}
        mediaType="image"
        maxSelection={1}
        onSelect={(items) => {
          const url = items?.[0]?.url;
          if (url && mediaTargetCallback) {
            mediaTargetCallback(url);
          }
          setMediaPickerOpen(false);
          setMediaTargetCallback(null);
          toast.success('Recurso multimedia seleccionado');
        }}
      />

      {/* ─── 7. ASISTENTE DE IA PARA ZONAS DINÁMICAS ───────────────────── */}
      <EmailAiAssistant
        open={aiAssistantOpen}
        onClose={() => setAiAssistantOpen(false)}
        subject={subject}
        content={compiledHtml}
        objectiveDefault={name}
        onApplySubject={handleApplyAiSubject}
        onApplyPreheader={handleApplyAiPreheader}
        onApplyHtml={(html) => handleApplyAiBody(html)}
      />
    </div>
  );
};

export default VisualTemplateEditor;
