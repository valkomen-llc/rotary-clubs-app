// ════════════════════════════════════════════════════════════════════════════
// Editor Visual de Plantillas Institucionales — Club Platform & Rotary en Acción
// Lienzo central con vista responsiva, barra de propiedades y bloques configurables.
// Separa estrictamente la Plantilla Maestra (componentes institucionales protegidos)
// de las Instancias de Campaña (zonas dinámicas editables e impulsadas por IA).
// ════════════════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Shield, Lock, Unlock, Sparkles, Send, Save, Layout, Box, Palette,
  Plus, Trash2, Copy, ArrowUp, ArrowDown, Smartphone, Monitor,
  Columns, Type, Image as ImageIcon, Square,
  Minus, Table as TableIcon, Menu as MenuIcon, Share2, Video, Code,
  Tag, X, ArrowLeft, RefreshCw, ZoomIn, ZoomOut
} from 'lucide-react';

import {
  renderDesignToHtml, makeBlock, BLOCK_LABELS,
  FONT_OPTIONS, newId, createRotaryMasterDesign, getRotaryGlobalBlocksCatalog,
  type EmailDesign, type Block, type BlockType, type Align
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

  // Inspector y barra lateral
  const [activeTab, setActiveTab] = useState<TabMode>('blocks');
  const [deviceView, setDeviceView] = useState<'desktop' | 'mobile'>('desktop');
  const [bodyWidthPreset, setBodyWidthPreset] = useState<number>(600);
  const [previewMode, setPreviewMode] = useState<'editor' | 'live'>('editor');
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  // Modales
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaTargetField, setMediaTargetField] = useState<'url' | 'thumbnail'>('url');
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const [testEmailOpen, setTestEmailOpen] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [saving, setSaving] = useState(false);

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

  // Actualizar configuración global de diseño
  const updateSettings = useCallback((patch: Partial<EmailDesign['settings']>) => {
    setDesign((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...patch }
    }));
  }, []);

  // Mutador de bloques
  const updateBlock = useCallback((id: string, patch: Partial<Block>) => {
    setDesign((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b))
    }));
  }, []);

  // Agregar nuevo bloque
  const handleAddBlock = (type: BlockType) => {
    const newB = makeBlock(type);
    setDesign((prev) => ({
      ...prev,
      blocks: [...prev.blocks, newB]
    }));
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
    setDesign((prev) => ({
      ...prev,
      blocks: [...prev.blocks, newB]
    }));
    setSelectedBlockId(newB.id);
    toast.success(`Bloque Global «${label}» insertado como protegido`);
  };

  // Mover bloque
  const handleMoveBlock = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= design.blocks.length) return;
    setDesign((prev) => {
      const arr = [...prev.blocks];
      const [item] = arr.splice(index, 1);
      arr.splice(targetIdx, 0, item);
      return { ...prev, blocks: arr };
    });
  };

  // Duplicar bloque
  const handleDuplicateBlock = (index: number) => {
    setDesign((prev) => {
      const original = prev.blocks[index];
      const copy = {
        ...original,
        id: newId(),
        label: original.label ? `${original.label} (Copia)` : undefined,
        isProtected: false // Las copias nacen editables
      } as Block;
      const arr = [...prev.blocks];
      arr.splice(index + 1, 0, copy);
      return { ...prev, blocks: arr };
    });
    toast.success('Bloque duplicado');
  };

  // Eliminar bloque
  const handleDeleteBlock = (id: string, isProtected?: boolean) => {
    if (isProtected) {
      if (!window.confirm('⚠️ Este es un Componente Institucional Protegido (logo, cabecera o pie oficial). ¿Realmente deseas retirarlo de esta plantilla?')) {
        return;
      }
    }
    setDesign((prev) => ({
      ...prev,
      blocks: prev.blocks.filter((b) => b.id !== id)
    }));
    if (selectedBlockId === id) setSelectedBlockId(null);
    toast.info('Bloque eliminado');
  };

  // Toggle protección
  const handleToggleProtection = (id: string) => {
    const current = design.blocks.find((b) => b.id === id);
    if (!current) return;
    const nextVal = !current.isProtected;
    updateBlock(id, { isProtected: nextVal, isLocked: nextVal });
    toast.success(nextVal ? 'Bloque protegido contra ediciones' : 'Bloque marcado como dinámico/editable');
  };

  // Restablecer a plantilla maestra oficial Rotary
  const handleResetToRotaryMaster = () => {
    if (window.confirm('¿Restablecer el diseño a la Plantilla Maestra Oficial de Rotary en Acción? Se reemplazarán los bloques actuales.')) {
      setDesign(createRotaryMasterDesign());
      setSelectedBlockId(null);
      toast.success('Diseño restablecido a la Plantilla Maestra Oficial');
    }
  };

  // Render HTML email-safe
  const compiledHtml = useMemo(() => {
    try {
      return renderDesignToHtml(design, { interactive: previewMode === 'editor' });
    } catch {
      return '<div style="padding:20px;color:red">Error al compilar HTML de la plantilla</div>';
    }
  }, [design, previewMode]);

  // Guardar plantilla en base de datos
  const handleSaveTemplate = async () => {
    if (!name.trim()) {
      toast.error('La plantilla requiere un nombre');
      return;
    }
    setSaving(true);
    try {
      const fullHtml = renderDesignToHtml(design, { interactive: false });

      // Si se proporcionó callback externo
      if (onSave) {
        onSave({ name, subject, preheader, design, html: fullHtml });
      }

      // Persistir en backend runtime ContentActivationTemplate
      const targetId = templateId || 'tpl-rotary-en-accion-master';
      const res = await fetch(`${API}/content-activation/templates/${targetId}`, {
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

      if (res.ok) {
        const data = await res.json();
        toast.success(`¡Plantilla guardada como v${data.template?.version || 1}!`, {
          description: 'Estructura institucional protegida y lista para campañas.'
        });
      } else {
        toast.success('Plantilla actualizada en memoria local para esta campaña.');
      }
    } catch {
      toast.error('Error al guardar la plantilla en el servidor');
    } finally {
      setSaving(false);
    }
  };

  // Enviar correo de prueba
  const handleSendTestEmail = async () => {
    if (!testEmailRecipient || !testEmailRecipient.includes('@')) {
      toast.error('Ingresa una dirección de correo válida');
      return;
    }
    setSendingTest(true);
    try {
      const testHtml = renderDesignToHtml(design, { interactive: false });
      const res = await fetch(`${API}/rotary-en-accion/marketing/templates/test-email`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          to: testEmailRecipient.trim(),
          subject,
          html: testHtml
        })
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`¡Correo de prueba enviado a ${testEmailRecipient}!`, {
          description: 'Revisa tu bandeja de entrada para verificar la visualización.'
        });
        setTestEmailOpen(false);
      } else {
        toast.error(data.error || 'No se pudo enviar el correo de prueba');
      }
    } catch {
      toast.error('Error de red al enviar el correo de prueba');
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
    // La IA solo reemplaza los bloques de texto no protegidos
    const textClean = aiHtml
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    setDesign((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => {
        if (!b.isProtected && b.type === 'text') {
          return {
            ...b,
            text: textClean
          };
        }
        return b;
      })
    }));
    toast.success('Texto de campaña enriquecido por IA (componentes institucionales protegidos intactos)');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col text-slate-100 font-sans select-none overflow-hidden">
      {/* ─── 1. BARRA SUPERIOR (HEADER ESTILO FLUENTCRM) ────────────────── */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              title="Volver"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider font-extrabold bg-blue-900/60 text-blue-400 px-2 py-0.5 rounded-full border border-blue-700/50">
                Club Platform · Editor Visual de Plantillas
              </span>
              <span className="text-xs text-slate-400 truncate">
                {campaignContext ? `Campaña: ${campaignContext.name}` : 'Plantillas de Correo'}
              </span>
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-transparent text-sm font-bold text-white border-b border-transparent hover:border-slate-700 focus:border-blue-500 focus:outline-none px-1 py-0.5 w-72 sm:w-96 truncate"
              placeholder="Nombre de la plantilla institucional..."
              disabled={readOnly}
            />
          </div>
        </div>

        {/* Acciones principales del encabezado */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAiAssistantOpen(true)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-xs font-bold shadow-md shadow-violet-900/20 transition-all"
            title="Asistente de IA para optimizar textos dinámicos"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Asistente IA</span>
          </button>

          <button
            onClick={() => setTestEmailOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors shadow-sm"
            title="Enviar correo de prueba"
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Enviar Prueba</span>
          </button>

          <button
            onClick={handleSaveTemplate}
            disabled={saving || readOnly}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors shadow-md shadow-blue-900/30 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Guardando...' : 'Guardar Plantilla'}</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      {/* ─── 2. SUB-BARRA DE METADATOS Y CONTROL DE LIENZO ─────────────── */}
      <div className="bg-slate-900/80 border-b border-slate-800 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
            <span className="text-[11px] font-bold text-slate-400 shrink-0">Asunto:</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Asunto llamativo del correo..."
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 w-full focus:outline-none focus:border-blue-500"
              disabled={readOnly}
            />
          </div>
          <div className="hidden lg:flex items-center gap-1.5 flex-1 min-w-[180px]">
            <span className="text-[11px] font-bold text-slate-400 shrink-0">Pre-header:</span>
            <input
              type="text"
              value={preheader}
              onChange={(e) => setPreheader(e.target.value)}
              placeholder="Texto de previsualización..."
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 w-full focus:outline-none focus:border-blue-500"
              disabled={readOnly}
            />
          </div>
        </div>

        {/* Controles de Vista de Lienzo (Ancho, Dispositivo, Zoom) */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Selector de Ancho */}
          <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800">
            <button
              onClick={() => { setBodyWidthPreset(540); updateSettings({ width: 540 }); }}
              className={`px-2 py-1 rounded text-[11px] font-bold ${bodyWidthPreset === 540 ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              540px
            </button>
            <button
              onClick={() => { setBodyWidthPreset(600); updateSettings({ width: 600 }); }}
              className={`px-2 py-1 rounded text-[11px] font-bold ${bodyWidthPreset === 600 ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              600px
            </button>
            <button
              onClick={() => { setBodyWidthPreset(660); updateSettings({ width: 660 }); }}
              className={`px-2 py-1 rounded text-[11px] font-bold ${bodyWidthPreset === 660 ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              660px
            </button>
          </div>

          {/* Toggle Escritorio / Móvil */}
          <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800">
            <button
              onClick={() => setDeviceView('desktop')}
              className={`p-1.5 rounded ${deviceView === 'desktop' ? 'bg-slate-800 text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
              title="Vista de escritorio"
            >
              <Monitor className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setDeviceView('mobile')}
              className={`p-1.5 rounded ${deviceView === 'mobile' ? 'bg-slate-800 text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
              title="Vista móvil (375px)"
            >
              <Smartphone className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Toggle Modo Editor / Vista Previa Real */}
          <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800">
            <button
              onClick={() => setPreviewMode('editor')}
              className={`px-2 py-1 rounded text-[11px] font-bold ${previewMode === 'editor' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}
            >
              Lienzo
            </button>
            <button
              onClick={() => setPreviewMode('live')}
              className={`px-2 py-1 rounded text-[11px] font-bold ${previewMode === 'live' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400'}`}
            >
              Vista Real
            </button>
          </div>

          {/* Zoom */}
          <div className="hidden sm:flex items-center gap-1 text-slate-400">
            <button
              onClick={() => setZoomLevel((z) => Math.max(70, z - 10))}
              className="p-1 hover:text-white"
              title="Reducir zoom"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono w-8 text-center">{zoomLevel}%</span>
            <button
              onClick={() => setZoomLevel((z) => Math.min(130, z + 10))}
              className="p-1 hover:text-white"
              title="Aumentar zoom"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ─── 3. ÁREA PRINCIPAL: LIENZO CENTRAL + BARRA LATERAL DERECHA ──── */}
      <div className="flex-1 flex overflow-hidden">
        {/* LIENZO DE TRABAJO (CANVAS CENTRAL) */}
        <main
          className="flex-1 bg-slate-950 overflow-y-auto p-4 sm:p-8 flex justify-center items-start"
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
            className="shadow-2xl rounded-2xl overflow-hidden border border-slate-800 transition-all bg-white"
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
                          setSelectedBlockId(block.id);
                        }}
                        className={`relative group transition-all cursor-pointer ${
                          isSelected
                            ? 'ring-2 ring-blue-500 z-10'
                            : 'hover:outline hover:outline-1 hover:outline-blue-400/60'
                        }`}
                      >
                        {/* Barra de control flotante sobre el bloque */}
                        <div
                          className={`absolute -top-3 left-3 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase shadow-md transition-opacity z-20 ${
                            isProt
                              ? 'bg-blue-900 text-blue-200 border border-blue-700'
                              : 'bg-emerald-900 text-emerald-200 border border-emerald-700'
                          } ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                        >
                          {isProt ? (
                            <>
                              <Shield className="w-3 h-3 text-amber-400" />
                              <span>{block.label || 'Protegido'}</span>
                            </>
                          ) : (
                            <>
                              <Box className="w-3 h-3 text-emerald-400" />
                              <span>{block.label || BLOCK_LABELS[block.type]}</span>
                            </>
                          )}
                        </div>

                        {/* Botones rápidos de orden y acción en hover */}
                        <div
                          className={`absolute top-2 right-2 flex items-center gap-1 bg-slate-900/90 backdrop-blur rounded-lg p-1 shadow-lg border border-slate-700 z-20 transition-opacity ${
                            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          }`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => handleMoveBlock(idx, 'up')}
                            disabled={idx === 0}
                            className="p-1 text-slate-300 hover:text-white disabled:opacity-30"
                            title="Subir"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleMoveBlock(idx, 'down')}
                            disabled={idx === design.blocks.length - 1}
                            className="p-1 text-slate-300 hover:text-white disabled:opacity-30"
                            title="Bajar"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDuplicateBlock(idx)}
                            className="p-1 text-slate-300 hover:text-white"
                            title="Duplicar"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleToggleProtection(block.id)}
                            className={`p-1 ${isProt ? 'text-amber-400' : 'text-slate-400 hover:text-amber-300'}`}
                            title={isProt ? 'Quitar protección institucional' : 'Proteger componente'}
                          >
                            {isProt ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                          </button>
                          <button
                            onClick={() => handleDeleteBlock(block.id, isProt)}
                            className="p-1 text-rose-400 hover:text-rose-300"
                            title="Eliminar bloque"
                          >
                            <Trash2 className="w-3 h-3" />
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
                        className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-500"
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
        <aside className="w-80 sm:w-96 bg-slate-900 border-l border-slate-800 flex flex-col shrink-0">
          {/* Pestañas de la barra lateral */}
          <div className="flex border-b border-slate-800 bg-slate-950/60 p-1">
            <button
              onClick={() => setActiveTab('blocks')}
              className={`flex-1 py-2 px-1 text-center text-[11px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1 ${
                activeTab === 'blocks'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              <span>Bloques</span>
            </button>
            <button
              onClick={() => setActiveTab('layouts')}
              className={`flex-1 py-2 px-1 text-center text-[11px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1 ${
                activeTab === 'layouts'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Layout className="w-3.5 h-3.5" />
              <span>Diseños</span>
            </button>
            <button
              onClick={() => setActiveTab('global')}
              className={`flex-1 py-2 px-1 text-center text-[11px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1 ${
                activeTab === 'global'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span>Globales</span>
            </button>
            <button
              onClick={() => setActiveTab('style')}
              className={`flex-1 py-2 px-1 text-center text-[11px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1 ${
                activeTab === 'style'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Estilo</span>
            </button>
            <button
              onClick={() => setActiveTab('tags')}
              className={`flex-1 py-2 px-1 text-center text-[11px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1 ${
                activeTab === 'tags'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
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
              <div className="space-y-4 bg-slate-950/60 border border-slate-800 rounded-xl p-3.5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-white">
                      Propiedades: {BLOCK_LABELS[selectedBlock.type] || selectedBlock.type}
                    </span>
                    {selectedBlock.isProtected && (
                      <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-bold border border-amber-500/40">
                        Protegido
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedBlockId(null)}
                    className="text-slate-400 hover:text-white p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Formulario de propiedades según el tipo */}
                <div className="space-y-3 text-xs">
                  {/* Encabezado */}
                  {selectedBlock.type === 'heading' && (
                    <>
                      <div>
                        <label className="text-[11px] font-bold text-slate-400 block mb-1">Texto del encabezado</label>
                        <input
                          type="text"
                          value={selectedBlock.text}
                          onChange={(e) => updateBlock(selectedBlock.id, { text: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-bold text-slate-400 block mb-1">Nivel</label>
                          <select
                            value={selectedBlock.level}
                            onChange={(e) => updateBlock(selectedBlock.id, { level: Number(e.target.value) as any })}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white"
                          >
                            <option value={1}>H1 (28px)</option>
                            <option value={2}>H2 (22px)</option>
                            <option value={3}>H3 (18px)</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-400 block mb-1">Color</label>
                          <input
                            type="color"
                            value={selectedBlock.color || '#013388'}
                            onChange={(e) => updateBlock(selectedBlock.id, { color: e.target.value })}
                            className="w-full h-8 bg-slate-900 border border-slate-800 rounded-lg p-1 cursor-pointer"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Texto / Párrafo */}
                  {selectedBlock.type === 'text' && (
                    <>
                      <div>
                        <label className="text-[11px] font-bold text-slate-400 block mb-1">Contenido (admite párrafos y variables)</label>
                        <textarea
                          rows={6}
                          value={selectedBlock.text}
                          onChange={(e) => updateBlock(selectedBlock.id, { text: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white font-mono text-xs"
                          placeholder="Texto del mensaje..."
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-bold text-slate-400 block mb-1">Tamaño (px)</label>
                          <input
                            type="number"
                            min={11}
                            max={24}
                            value={selectedBlock.size || 15}
                            onChange={(e) => updateBlock(selectedBlock.id, { size: Number(e.target.value) })}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-400 block mb-1">Color</label>
                          <input
                            type="color"
                            value={selectedBlock.color || '#334155'}
                            onChange={(e) => updateBlock(selectedBlock.id, { color: e.target.value })}
                            className="w-full h-8 bg-slate-900 border border-slate-800 rounded-lg p-1 cursor-pointer"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Botón */}
                  {selectedBlock.type === 'button' && (
                    <>
                      <div>
                        <label className="text-[11px] font-bold text-slate-400 block mb-1">Texto del botón</label>
                        <input
                          type="text"
                          value={selectedBlock.text}
                          onChange={(e) => updateBlock(selectedBlock.id, { text: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-400 block mb-1">Destino URL</label>
                        <input
                          type="text"
                          value={selectedBlock.href}
                          onChange={(e) => updateBlock(selectedBlock.id, { href: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white"
                          placeholder="https://... o {{form_url}}"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-bold text-slate-400 block mb-1">Color de Fondo</label>
                          <input
                            type="color"
                            value={selectedBlock.bg || '#013388'}
                            onChange={(e) => updateBlock(selectedBlock.id, { bg: e.target.value })}
                            className="w-full h-8 bg-slate-900 border border-slate-800 rounded-lg p-1 cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-400 block mb-1">Color de Texto</label>
                          <input
                            type="color"
                            value={selectedBlock.color || '#ffffff'}
                            onChange={(e) => updateBlock(selectedBlock.id, { color: e.target.value })}
                            className="w-full h-8 bg-slate-900 border border-slate-800 rounded-lg p-1 cursor-pointer"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-400 block mb-1">Redondeo de Bordes (px)</label>
                        <input
                          type="number"
                          min={0}
                          max={32}
                          value={selectedBlock.radius ?? 8}
                          onChange={(e) => updateBlock(selectedBlock.id, { radius: Number(e.target.value) })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white"
                        />
                      </div>
                    </>
                  )}

                  {/* Imagen */}
                  {selectedBlock.type === 'image' && (
                    <>
                      <div>
                        <label className="text-[11px] font-bold text-slate-400 block mb-1">URL de la imagen</label>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={selectedBlock.url}
                            onChange={(e) => updateBlock(selectedBlock.id, { url: e.target.value })}
                            className="flex-1 bg-slate-900 border border-slate-800 rounded-lg p-2 text-white"
                            placeholder="https://..."
                          />
                          <button
                            onClick={() => {
                              setMediaTargetField('url');
                              setMediaPickerOpen(true);
                            }}
                            className="px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold"
                          >
                            Biblioteca
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-400 block mb-1">Texto alternativo (Alt)</label>
                        <input
                          type="text"
                          value={selectedBlock.alt}
                          onChange={(e) => updateBlock(selectedBlock.id, { alt: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-bold text-slate-400 block mb-1">Ancho %</label>
                          <input
                            type="number"
                            min={10}
                            max={100}
                            value={selectedBlock.width}
                            onChange={(e) => updateBlock(selectedBlock.id, { width: Number(e.target.value) })}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-400 block mb-1">Radio borde</label>
                          <input
                            type="number"
                            min={0}
                            max={32}
                            value={selectedBlock.radius}
                            onChange={(e) => updateBlock(selectedBlock.id, { radius: Number(e.target.value) })}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Alineación (común) */}
                  {'align' in selectedBlock && (
                    <div>
                      <label className="text-[11px] font-bold text-slate-400 block mb-1">Alineación</label>
                      <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-800">
                        {(['left', 'center', 'right'] as Align[]).map((al) => (
                          <button
                            key={al}
                            onClick={() => updateBlock(selectedBlock.id, { align: al })}
                            className={`flex-1 py-1 rounded text-xs font-bold capitalize ${
                              selectedBlock.align === al ? 'bg-blue-600 text-white' : 'text-slate-400'
                            }`}
                          >
                            {al === 'left' ? 'Izquierda' : al === 'center' ? 'Centro' : 'Derecha'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Relleno vertical padTop / padBottom */}
                  <div className="border-t border-slate-800 pt-3">
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">Espaciado Vertical (px)</label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-500">Arriba</span>
                        <input
                          type="number"
                          min={0}
                          max={120}
                          value={selectedBlock.padTop ?? 8}
                          onChange={(e) => updateBlock(selectedBlock.id, { padTop: Number(e.target.value) })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500">Abajo</span>
                        <input
                          type="number"
                          min={0}
                          max={120}
                          value={selectedBlock.padBottom ?? 8}
                          onChange={(e) => updateBlock(selectedBlock.id, { padBottom: Number(e.target.value) })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Estado de protección */}
                  <div className="border-t border-slate-800 pt-3">
                    <button
                      onClick={() => handleToggleProtection(selectedBlock.id)}
                      className={`w-full py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border ${
                        selectedBlock.isProtected
                          ? 'bg-amber-950/40 border-amber-600 text-amber-300 hover:bg-amber-900/60'
                          : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {selectedBlock.isProtected ? (
                        <>
                          <Lock className="w-3.5 h-3.5 text-amber-400" />
                          <span>Componente Protegido</span>
                        </>
                      ) : (
                        <>
                          <Unlock className="w-3.5 h-3.5" />
                          <span>Componente Dinámico (Editable)</span>
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
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
                    Bloques Disponibles
                  </h3>
                  <span className="text-[10px] text-slate-500">Clic para insertar</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { type: 'heading', label: 'HEADING', icon: Type, desc: 'Encabezados' },
                    { type: 'text', label: 'PARAGRAPH', icon: Type, desc: 'Texto de párrafo' },
                    { type: 'button', label: 'BUTTON', icon: Square, desc: 'Botón de acción' },
                    { type: 'image', label: 'IMAGE', icon: ImageIcon, desc: 'Foto o banner' },
                    { type: 'columns', label: 'COLUMNS', icon: Columns, desc: '2 columnas' },
                    { type: 'divider', label: 'DIVIDER', icon: Minus, desc: 'Línea divisoria' },
                    { type: 'table', label: 'TABLE', icon: TableIcon, desc: 'Tabla estilizada' },
                    { type: 'menu', label: 'MENU', icon: MenuIcon, desc: 'Barra de enlaces' },
                    { type: 'social', label: 'SOCIAL', icon: Share2, desc: 'Redes sociales' },
                    { type: 'video', label: 'VIDEO', icon: Video, desc: 'Enlace a video' },
                    { type: 'html', label: 'HTML', icon: Code, desc: 'Código HTML libre' },
                    { type: 'spacer', label: 'SPACER', icon: Minus, desc: 'Espaciador vacío' }
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.type}
                        onClick={() => handleAddBlock(item.type as BlockType)}
                        className="bg-slate-950/70 border border-slate-800 hover:border-blue-500/80 hover:bg-slate-800/60 rounded-xl p-3 text-center transition-all group flex flex-col items-center justify-center gap-1.5"
                      >
                        <div className="w-8 h-8 rounded-lg bg-slate-900 group-hover:bg-blue-600/20 text-slate-300 group-hover:text-blue-400 flex items-center justify-center transition-colors">
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-extrabold text-slate-200 tracking-wide">
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
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Estructuras Prearmadas
                </h3>
                <div className="space-y-2">
                  <div
                    onClick={handleResetToRotaryMaster}
                    className="bg-slate-950/70 border border-slate-800 hover:border-blue-500 rounded-xl p-3 cursor-pointer transition-all group"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Shield className="w-4 h-4 text-blue-400" />
                      <span className="text-xs font-bold text-white group-hover:text-blue-400">
                        Plantilla Maestra Rotary en Acción
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Encabezado oficial, saludo dinámico, 7 áreas de enfoque, botón CTA, firma y pie protegido.
                    </p>
                  </div>

                  <div
                    onClick={() => {
                      setDesign((prev) => ({
                        ...prev,
                        blocks: [
                          makeBlock('global'),
                          makeBlock('heading'),
                          makeBlock('text'),
                          makeBlock('columns'),
                          makeBlock('button'),
                          makeBlock('global')
                        ]
                      }));
                      toast.success('Estructura de boletín aplicada');
                    }}
                    className="bg-slate-950/70 border border-slate-800 hover:border-blue-500 rounded-xl p-3 cursor-pointer transition-all group"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Columns className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold text-white group-hover:text-emerald-400">
                        Boletín de Servicio y Proyectos
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Formato de noticia de alto impacto con 2 columnas para imágenes y testimonios.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* PESTAÑA: BLOQUES GLOBALES INSTITUCIONALES */}
            {activeTab === 'global' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5" />
                    <span>Bloques Globales</span>
                  </h3>
                  <span className="text-[10px] text-slate-500">Protegidos</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Componentes oficiales centralizados. Conservan las proporciones exactas de los logos y la identidad gráfica de Rotary.
                </p>

                <div className="space-y-2">
                  {getRotaryGlobalBlocksCatalog().map((gb) => (
                    <div
                      key={gb.key}
                      className="bg-slate-950/80 border border-slate-800 hover:border-amber-500/70 rounded-xl p-3 space-y-2 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-white">
                          {gb.name}
                        </span>
                        <span className="text-[9px] uppercase font-black bg-blue-950 text-blue-300 px-1.5 py-0.5 rounded border border-blue-800">
                          {gb.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {gb.description}
                      </p>
                      <button
                        onClick={() => handleInsertGlobalBlock(gb.key, gb.name)}
                        className="w-full py-1.5 bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white rounded-lg text-xs font-bold border border-blue-500/30 transition-all flex items-center justify-center gap-1.5"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Insertar en Lienzo</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PESTAÑA: ESTILOS GLOBALES */}
            {activeTab === 'style' && (
              <div className="space-y-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Estilos Globales del Correo
                </h3>

                <div className="space-y-3 bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-xs">
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">Tipografía Principal</label>
                    <select
                      value={design.settings.font}
                      onChange={(e) => updateSettings({ font: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white"
                    >
                      {FONT_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-bold text-slate-400 block mb-1">Fondo Exterior</label>
                      <input
                        type="color"
                        value={design.settings.bg}
                        onChange={(e) => updateSettings({ bg: e.target.value })}
                        className="w-full h-8 bg-slate-900 border border-slate-800 rounded-lg p-1 cursor-pointer"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-400 block mb-1">Fondo Contenido</label>
                      <input
                        type="color"
                        value={design.settings.contentBg}
                        onChange={(e) => updateSettings({ contentBg: e.target.value })}
                        className="w-full h-8 bg-slate-900 border border-slate-800 rounded-lg p-1 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-bold text-slate-400 block mb-1">Texto Base</label>
                      <input
                        type="color"
                        value={design.settings.textColor}
                        onChange={(e) => updateSettings({ textColor: e.target.value })}
                        className="w-full h-8 bg-slate-900 border border-slate-800 rounded-lg p-1 cursor-pointer"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-400 block mb-1">Color Enlaces</label>
                      <input
                        type="color"
                        value={design.settings.linkColor}
                        onChange={(e) => updateSettings({ linkColor: e.target.value })}
                        className="w-full h-8 bg-slate-900 border border-slate-800 rounded-lg p-1 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* PESTAÑA: MERGE TAGS / VARIABLES */}
            {activeTab === 'tags' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
                    Variables Dinámicas (Tags)
                  </h3>
                  <span className="text-[10px] text-slate-500">Clic para copiar</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Inserta estas etiquetas en textos o enlaces para personalizar el mensaje por cada club o socio receptor:
                </p>

                <div className="space-y-1.5">
                  {[
                    { tag: '{{contact.first_name}}', label: 'Nombre de pila del contacto' },
                    { tag: '{{club.name}}', label: 'Nombre oficial del club rotario' },
                    { tag: '{{district}}', label: 'Distrito rotario (4271 o 4281)' },
                    { tag: '{{campaign.name}}', label: 'Nombre de la campaña activa' },
                    { tag: '{{form_url}}', label: 'Enlace al formulario con UTMs y token' },
                    { tag: '{{unsubscribe_url}}', label: 'Enlace de cancelación de suscripción' }
                  ].map((item) => (
                    <button
                      key={item.tag}
                      onClick={() => {
                        navigator.clipboard?.writeText(item.tag);
                        toast.success(`Copiado: ${item.tag}`);
                      }}
                      className="w-full text-left bg-slate-950 border border-slate-800 hover:border-blue-500 rounded-lg p-2 transition-all flex items-center justify-between group"
                    >
                      <span className="text-xs font-mono text-blue-400 group-hover:text-blue-300">
                        {item.tag}
                      </span>
                      <span className="text-[10px] text-slate-500 truncate ml-2">
                        {item.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ─── 5. MODAL DE ENVIAR CORREO DE PRUEBA ───────────────────────── */}
      {testEmailOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">Enviar Correo de Prueba</h3>
              </div>
              <button onClick={() => setTestEmailOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Verifica el diseño real en tu cliente de correo (Gmail, Apple Mail, Outlook). Se compilará con estilos inline y tabla compatible.
            </p>
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">Destinatario:</label>
              <input
                type="email"
                value={testEmailRecipient}
                onChange={(e) => setTestEmailRecipient(e.target.value)}
                placeholder="tu-correo@rotary.org"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setTestEmailOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={handleSendTestEmail}
                disabled={sendingTest}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold disabled:opacity-50 flex items-center gap-1.5"
              >
                {sendingTest ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>{sendingTest ? 'Enviando...' : 'Enviar Prueba'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 6. SELECTOR DE MEDIOS (MediaPicker) ───────────────────────── */}
      <MediaPicker
        isOpen={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        mediaType="image"
        maxSelection={1}
        onSelect={(items) => {
          const url = items?.[0]?.url;
          if (url && selectedBlockId) {
            updateBlock(selectedBlockId, { [mediaTargetField]: url } as any);
          }
          setMediaPickerOpen(false);
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
