// ════════════════════════════════════════════════════════════════════════════
// Editor Visual de Plantillas Institucionales — Club Platform & Rotary en Acción
// Interfaz nativa clara y profesional con la identidad visual de Club Platform.
// Lienzo central con vista responsiva, inspector de bloques contextual y
// separación estricta entre Plantilla Maestra y zonas dinámicas de Campaña.
// ════════════════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  Shield, Lock, Unlock, Sparkles, Send, Save, Layout, Box, Palette,
  Plus, Trash2, Copy, ArrowUp, ArrowDown, Smartphone, Monitor,
  Columns, Type, Image as ImageIcon, Square,
  Minus, Table as TableIcon, Menu as MenuIcon, Share2, Video, Code,
  Tag, X, ArrowLeft, RefreshCw, ZoomIn, ZoomOut, Undo2, Redo2,
  CheckCircle2, Eye, Upload, RotateCcw, Building2,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, Globe,
  Bold, Italic, Underline, Strikethrough, Superscript, Subscript, Smile,
  List, ListOrdered, Link as LinkIcon, Unlink as UnlinkIcon, RemoveFormatting,
  Highlighter, ChevronDown, Indent, Outdent, GripVertical, Edit3, Code2, Layers
} from 'lucide-react';

import {
  renderDesignToHtml, renderSingleBlockHtml, makeBlock, BLOCK_LABELS,
  FONT_OPTIONS, FONT_WEIGHT_OPTIONS, LINE_HEIGHT_OPTIONS, newId, createRotaryMasterDesign, createChannelCampaignDesign, getRotaryGlobalBlocksCatalog,
  resolveInstitutionalLogo, getActiveSiteBrandingContext, normalizeInstitutionalDesign, resolveSiteRotaryEnAccionUrl,
  DEFAULT_FOOTER_SOCIAL_LINKS, textToHtml, sanitizeRichTextHtml,
  type EmailDesign, type Block, type BlockType, type Align, type SocialNetwork,
  type TableRow, type MenuItem, type SiteBrandingContext, type FooterSocialLink, type SocialIconStyle, type GlobalBlockItem,
  type TextBlock, type HeadingBlock
} from '../../../lib/emailBlocks';
import { DEFAULT_TIPOS } from '../../../lib/rotaryEnAccionSpec';
import MediaPicker from '../content-studio/MediaPicker';
import EmailAiAssistant from './EmailAiAssistant';
import { useClub } from '../../../contexts/ClubContext';
import { uploadMediaFiles } from '../../../lib/mediaUpload';
import { APP_VERSION } from '../../../lib/appVersion';

const API = import.meta.env.VITE_API_URL || '/api';
const getToken = () => localStorage.getItem('rotary_token') || '';
const authHeaders = () => ({
  Authorization: `Bearer ${getToken()}`,
  'Content-Type': 'application/json'
});

type SavedTemplate = { name: string; subject: string; preheader: string; design: EmailDesign; html: string };
type SaveOutcome = { ok: boolean; error?: string; version?: number; saved?: SavedTemplate };

// Pausa sin teclear antes del autoguardado de una campaña.
const AUTOSAVE_DELAY_MS = 4000;
// Tope de un fetch con keepalive (el navegador rechaza cuerpos de más de 64 KB).
const KEEPALIVE_MAX_BYTES = 60000;

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
  onSave?: (saved: SavedTemplate) => void;
  // Autoguardado de una campaña confirmado por el servidor (el editor sigue abierto).
  onAutoSaved?: (saved: SavedTemplate) => void;
  onClose?: () => void;
  readOnly?: boolean;
}

export const INSTITUTIONAL_PRESET_COLORS = [
  { label: 'Navy', value: '#0C2340' },
  { label: 'Azul', value: '#013388' },
  { label: 'Dorado', value: '#F7A81B' },
  { label: 'Blanco', value: '#FFFFFF' },
  { label: 'Gris', value: '#94A3B8' },
  { label: 'Oscuro', value: '#1E293B' },
];

export const MERGE_TAGS_CATALOG = [
  {
    category: 'Contacto y Destinatario',
    items: [
      { tag: '{{contact.first_name|Líder Rotario(a)}}', label: 'Nombre con saludo por defecto', example: 'Estimado(a) Juan' },
      { tag: '{{contact.first_name}}', label: 'Solo Primer Nombre', example: 'Juan' },
      { tag: '{{contact.last_name}}', label: 'Apellido del Contacto', example: 'Pérez' },
      { tag: '{{contact.email}}', label: 'Correo Electrónico', example: 'socio@rotary.org' },
      { tag: '{{contact.role|Líder Rotario}}', label: 'Cargo o Rol Oficial', example: 'Presidente' }
    ]
  },
  {
    category: 'Club Rotario',
    items: [
      { tag: '{{club.name|su Club}}', label: 'Nombre Oficial del Club', example: 'Rotary Club Medellín' },
      { tag: '{{club.city|su localidad}}', label: 'Ciudad o Localidad', example: 'Medellín' },
      { tag: '{{club.type|Club Rotario}}', label: 'Tipo de Club (Rotary / Rotaract)', example: 'Club Rotario' },
      { tag: '{{club.completion_percentage|0%}}', label: 'Porcentaje de Perfil Completado', example: '85%' },
      { tag: '{{club.missing_fields|Información institucional}}', label: 'Campos Faltantes', example: 'Fotografías y logo' }
    ]
  },
  {
    category: 'Enlaces y Formularios Oficiales',
    items: [
      { tag: '{{form_url}}', label: 'Enlace Oficial Rotary en Acción', example: 'https://rotary4281.org/rotary-en-accion' },
      { tag: '{{activar_club_url}}', label: 'Enlace Activar mi Club', example: 'https://rotary4281.org/activar-mi-club' },
      { tag: '{{club.profile_url}}', label: 'Ficha Pública en Directorio', example: 'https://app.clubplatform.org/clubes/directorio' },
      { tag: '{{club.update_form_url}}', label: 'Formulario de Actualización', example: 'https://app.clubplatform.org/clubes/registro' },
      { tag: '{{unsubscribe_url}}', label: 'Enlace de Cancelación de Suscripción', example: 'https://.../unsubscribe' }
    ]
  },
  {
    category: 'Distrito y Campaña',
    items: [
      { tag: '{{district.name|Distrito 4281}}', label: 'Distrito Rotario', example: 'Distrito 4281' },
      { tag: '{{campaign.name}}', label: 'Nombre de la Campaña', example: 'Identidad Digital' }
    ]
  }
];

export const EMOJI_LIST = [
  '🌍', '🤝', '💙', '⚙️', '🎯', '✉️', '⭐', '🏆',
  '📋', '✨', '👏', '💡', '📍', '📞', '📅', '👥',
  '🚀', '💬', '📢', '🏷️', '🎉', '💼', '📌', '🔍'
];

export const HIGHLIGHT_PRESET_COLORS = [
  { label: 'Amarillo', value: '#fef08a' },
  { label: 'Azul', value: '#e0f2fe' },
  { label: 'Verde', value: '#dcfce7' },
  { label: 'Naranja', value: '#ffedd5' },
  { label: 'Rosa', value: '#fce7f3' },
  { label: 'Lavanda', value: '#f3e8ff' },
  { label: 'Sin resaltar', value: 'transparent' }
];

export const TEXT_COLOR_PRESETS = [
  { label: 'Azul Rotary', value: '#013388' },
  { label: 'Royal Blue', value: '#005a9c' },
  { label: 'Dorado', value: '#f7a81b' },
  { label: 'Carbón', value: '#1e293b' },
  { label: 'Pizarra', value: '#475569' },
  { label: 'Rojo', value: '#dc2626' },
  { label: 'Verde', value: '#16a34a' },
  { label: 'Púrpura', value: '#9333ea' }
];

export const FONT_SIZE_OPTIONS = [
  '11px', '12px', '13px', '14px', '15px', '16px', '18px', '20px', '22px', '24px', '28px', '32px'
];

interface InlineRichTextToolbarProps {
  fontFamily: string;
  fontSize: number;
  color: string;
  activeFormats: {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strike: boolean;
    sup: boolean;
    sub: boolean;
    align: Align | 'justify';
    listUl: boolean;
    listOl: boolean;
    textColor: string;
    highlightColor: string;
  };
  onApplyFontFamily: (font: string) => void;
  onApplyFontSize: (size: string) => void;
  onApplyFormat: (cmd: string, val?: string) => void;
  onApplyTextColor: (hex: string) => void;
  onApplyHighlightColor: (hex: string) => void;
  onInsertLink: () => void;
  onUnlink: () => void;
  onInsertMergeTag: (tag: string) => void;
  onInsertEmoji: (emoji: string) => void;
  onClearFormat: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export const InlineRichTextToolbar: React.FC<InlineRichTextToolbarProps> = ({
  fontFamily,
  fontSize,
  color,
  activeFormats,
  onApplyFontFamily,
  onApplyFontSize,
  onApplyFormat,
  onApplyTextColor,
  onApplyHighlightColor,
  onInsertLink,
  onUnlink,
  onInsertMergeTag,
  onInsertEmoji,
  onClearFormat,
  onUndo,
  onRedo
}) => {
  const [openDropdown, setOpenDropdown] = useState<'fontFamily' | 'fontSize' | 'emoji' | 'textColor' | 'highlight' | 'mergeTags' | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const toggleDropdown = (key: 'fontFamily' | 'fontSize' | 'emoji' | 'textColor' | 'highlight' | 'mergeTags') => {
    setOpenDropdown((prev) => (prev === key ? null : key));
  };

  const currentFontLabel = useMemo(() => {
    const found = FONT_OPTIONS.find((f) => f.value === fontFamily);
    if (found) return found.label.split('(')[0].trim();
    if (fontFamily.includes('Open Sans')) return 'Open Sans';
    if (fontFamily.includes('Arial')) return 'Arial';
    if (fontFamily.includes('Helvetica')) return 'Helvetica';
    if (fontFamily.includes('Georgia')) return 'Georgia';
    return 'Open Sans';
  }, [fontFamily]);

  return (
    <div
      ref={toolbarRef}
      onMouseDown={(e) => {
        // Crucial: impide que el contentEditable pierda el foco y la selección del texto
        e.preventDefault();
      }}
      className="bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-2xl rounded-2xl p-1.5 flex flex-wrap items-center gap-1 text-slate-700 select-none transition-all duration-150"
    >
      {/* 1. SELECTOR DE FAMILIA TIPOGRÁFICA */}
      <div className="relative">
        <button
          type="button"
          onClick={() => toggleDropdown('fontFamily')}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 transition-colors"
          title="Familia Tipográfica"
        >
          <span className="max-w-[100px] truncate">{currentFontLabel}</span>
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>

        {openDropdown === 'fontFamily' && (
          <div className="absolute top-full left-0 mt-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
            <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Tipografías Seguras de Correo
            </div>
            {FONT_OPTIONS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => {
                  onApplyFontFamily(f.value);
                  setOpenDropdown(null);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-slate-800 hover:bg-blue-50 hover:text-rotary-blue flex items-center justify-between"
                style={{ fontFamily: f.value }}
              >
                <span>{f.label}</span>
                {fontFamily === f.value && <CheckCircle2 className="w-3.5 h-3.5 text-rotary-blue" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 2. SELECTOR DE TAMAÑO DE FUENTE */}
      <div className="relative">
        <button
          type="button"
          onClick={() => toggleDropdown('fontSize')}
          className="flex items-center gap-1 px-2 py-1 rounded-xl text-xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 transition-colors"
          title="Tamaño de Fuente"
        >
          <span>{fontSize}px</span>
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>

        {openDropdown === 'fontSize' && (
          <div className="absolute top-full left-0 mt-1.5 w-24 bg-white border border-slate-200 rounded-xl shadow-2xl py-1 z-50 max-h-56 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
            {FONT_SIZE_OPTIONS.map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => {
                  onApplyFontSize(sz);
                  setOpenDropdown(null);
                }}
                className={`w-full text-left px-3 py-1 text-xs hover:bg-blue-50 hover:text-rotary-blue ${
                  `${fontSize}px` === sz ? 'font-bold text-rotary-blue bg-blue-50/50' : 'text-slate-700'
                }`}
              >
                {sz}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-[1px] h-5 bg-slate-200 mx-0.5" />

      {/* 3. FORMATOS BÁSICOS EN LÍNEA: B, I, U, S, X2, X_2 */}
      <button
        type="button"
        onClick={() => onApplyFormat('bold')}
        className={`p-1.5 rounded-lg text-xs font-black transition-colors ${
          activeFormats.bold ? 'bg-blue-100 text-rotary-blue ring-1 ring-rotary-blue/30' : 'hover:bg-slate-100 text-slate-700'
        }`}
        title="Negrita (Cmd+B)"
      >
        <Bold className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={() => onApplyFormat('italic')}
        className={`p-1.5 rounded-lg text-xs font-serif transition-colors ${
          activeFormats.italic ? 'bg-blue-100 text-rotary-blue ring-1 ring-rotary-blue/30' : 'hover:bg-slate-100 text-slate-700'
        }`}
        title="Cursiva (Cmd+I)"
      >
        <Italic className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={() => onApplyFormat('underline')}
        className={`p-1.5 rounded-lg text-xs transition-colors ${
          activeFormats.underline ? 'bg-blue-100 text-rotary-blue ring-1 ring-rotary-blue/30' : 'hover:bg-slate-100 text-slate-700'
        }`}
        title="Subrayado (Cmd+U)"
      >
        <Underline className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={() => onApplyFormat('strikeThrough')}
        className={`p-1.5 rounded-lg text-xs transition-colors ${
          activeFormats.strike ? 'bg-blue-100 text-rotary-blue ring-1 ring-rotary-blue/30' : 'hover:bg-slate-100 text-slate-700'
        }`}
        title="Tachado"
      >
        <Strikethrough className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={() => onApplyFormat('superscript')}
        className={`p-1.5 rounded-lg text-xs transition-colors ${
          activeFormats.sup ? 'bg-blue-100 text-rotary-blue ring-1 ring-rotary-blue/30' : 'hover:bg-slate-100 text-slate-700'
        }`}
        title="Superíndice"
      >
        <Superscript className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={() => onApplyFormat('subscript')}
        className={`p-1.5 rounded-lg text-xs transition-colors ${
          activeFormats.sub ? 'bg-blue-100 text-rotary-blue ring-1 ring-rotary-blue/30' : 'hover:bg-slate-100 text-slate-700'
        }`}
        title="Subíndice"
      >
        <Subscript className="w-4 h-4" />
      </button>

      {/* 4. SELECTOR DE EMOJIS 😊 */}
      <div className="relative">
        <button
          type="button"
          onClick={() => toggleDropdown('emoji')}
          className="p-1.5 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
          title="Insertar Emoji o Símbolo"
        >
          <Smile className="w-4 h-4 text-amber-500" />
        </button>

        {openDropdown === 'emoji' && (
          <div className="absolute top-full left-0 mt-1.5 p-2 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 w-56 grid grid-cols-6 gap-1 animate-in fade-in zoom-in-95 duration-100">
            {EMOJI_LIST.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => {
                  onInsertEmoji(em);
                  setOpenDropdown(null);
                }}
                className="w-7 h-7 flex items-center justify-center text-base rounded-md hover:bg-slate-100 hover:scale-125 transition-transform"
              >
                {em}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-[1px] h-5 bg-slate-200 mx-0.5" />

      {/* 5. ALINEACIONES */}
      <button
        type="button"
        onClick={() => onApplyFormat('justifyLeft')}
        className={`p-1.5 rounded-lg text-xs transition-colors ${
          activeFormats.align === 'left' ? 'bg-blue-100 text-rotary-blue' : 'hover:bg-slate-100 text-slate-700'
        }`}
        title="Alinear a la Izquierda"
      >
        <AlignLeft className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={() => onApplyFormat('justifyCenter')}
        className={`p-1.5 rounded-lg text-xs transition-colors ${
          activeFormats.align === 'center' ? 'bg-blue-100 text-rotary-blue' : 'hover:bg-slate-100 text-slate-700'
        }`}
        title="Centrar"
      >
        <AlignCenter className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={() => onApplyFormat('justifyRight')}
        className={`p-1.5 rounded-lg text-xs transition-colors ${
          activeFormats.align === 'right' ? 'bg-blue-100 text-rotary-blue' : 'hover:bg-slate-100 text-slate-700'
        }`}
        title="Alinear a la Derecha"
      >
        <AlignRight className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={() => onApplyFormat('justifyFull')}
        className={`p-1.5 rounded-lg text-xs transition-colors ${
          activeFormats.align === 'justify' ? 'bg-blue-100 text-rotary-blue' : 'hover:bg-slate-100 text-slate-700'
        }`}
        title="Justificar"
      >
        <AlignJustify className="w-4 h-4" />
      </button>

      <div className="w-[1px] h-5 bg-slate-200 mx-0.5" />

      {/* 6. LISTAS CON VIÑETAS Y NUMERADAS */}
      <button
        type="button"
        onClick={() => onApplyFormat('insertUnorderedList')}
        className={`p-1.5 rounded-lg text-xs transition-colors ${
          activeFormats.listUl ? 'bg-blue-100 text-rotary-blue ring-1 ring-rotary-blue/30' : 'hover:bg-slate-100 text-slate-700'
        }`}
        title="Lista con viñetas"
      >
        <List className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={() => onApplyFormat('insertOrderedList')}
        className={`p-1.5 rounded-lg text-xs transition-colors ${
          activeFormats.listOl ? 'bg-blue-100 text-rotary-blue ring-1 ring-rotary-blue/30' : 'hover:bg-slate-100 text-slate-700'
        }`}
        title="Lista numerada"
      >
        <ListOrdered className="w-4 h-4" />
      </button>

      <div className="w-[1px] h-5 bg-slate-200 mx-0.5" />

      {/* 7. COLOR DE TEXTO (A) */}
      <div className="relative">
        <button
          type="button"
          onClick={() => toggleDropdown('textColor')}
          className="flex flex-col items-center justify-center px-1.5 py-1 rounded-lg hover:bg-slate-100 transition-colors"
          title="Color del texto seleccionado"
        >
          <span className="font-serif font-black text-xs leading-none">A</span>
          <span
            className="w-3.5 h-1 rounded-sm mt-0.5"
            style={{ backgroundColor: color || '#334155' }}
          />
        </button>

        {openDropdown === 'textColor' && (
          <div className="absolute top-full left-0 mt-1.5 p-3 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 w-52 space-y-2 animate-in fade-in zoom-in-95 duration-100">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Paleta Institucional
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {TEXT_COLOR_PRESETS.map((tc) => (
                <button
                  key={tc.value}
                  type="button"
                  onClick={() => {
                    onApplyTextColor(tc.value);
                    setOpenDropdown(null);
                  }}
                  className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:scale-110 transition-transform shadow-2xs"
                  style={{ backgroundColor: tc.value }}
                  title={`${tc.label} (${tc.value})`}
                />
              ))}
            </div>
            <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
              <span className="text-[10px] font-medium text-slate-500">Libre:</span>
              <input
                type="color"
                onChange={(e) => {
                  onApplyTextColor(e.target.value);
                  setOpenDropdown(null);
                }}
                className="w-7 h-7 rounded border border-slate-200 cursor-pointer p-0"
              />
            </div>
          </div>
        )}
      </div>

      {/* 8. COLOR DE RESALTADO / MARCADOR */}
      <div className="relative">
        <button
          type="button"
          onClick={() => toggleDropdown('highlight')}
          className="flex flex-col items-center justify-center px-1.5 py-1 rounded-lg hover:bg-slate-100 transition-colors"
          title="Resaltado de texto"
        >
          <Highlighter className="w-3.5 h-3.5 text-slate-700" />
          <span className="w-3.5 h-1 rounded-sm mt-0.5 bg-yellow-300" />
        </button>

        {openDropdown === 'highlight' && (
          <div className="absolute top-full left-0 mt-1.5 p-3 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 w-48 space-y-2 animate-in fade-in zoom-in-95 duration-100">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Color de Resaltado
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {HIGHLIGHT_PRESET_COLORS.map((hc) => (
                <button
                  key={hc.value}
                  type="button"
                  onClick={() => {
                    onApplyHighlightColor(hc.value);
                    setOpenDropdown(null);
                  }}
                  className={`w-7 h-7 rounded-lg border flex items-center justify-center hover:scale-110 transition-transform ${
                    hc.value === 'transparent' ? 'border-dashed border-slate-300 text-[10px] font-bold text-slate-400' : 'border-slate-200 shadow-2xs'
                  }`}
                  style={{ backgroundColor: hc.value === 'transparent' ? '#fff' : hc.value }}
                  title={hc.label}
                >
                  {hc.value === 'transparent' ? '✕' : ''}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="w-[1px] h-5 bg-slate-200 mx-0.5" />

      {/* 9. SANGRÍAS (OUTDENT / INDENT) */}
      <button
        type="button"
        onClick={() => onApplyFormat('outdent')}
        className="p-1.5 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
        title="Disminuir sangría"
      >
        <Outdent className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={() => onApplyFormat('indent')}
        className="p-1.5 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
        title="Aumentar sangría"
      >
        <Indent className="w-4 h-4" />
      </button>

      <div className="w-[1px] h-5 bg-slate-200 mx-0.5" />

      {/* 10. ENLACE (LINK) Y QUITAR ENLACE (UNLINK) */}
      <button
        type="button"
        onClick={onInsertLink}
        className="p-1.5 rounded-lg text-slate-700 hover:bg-blue-50 hover:text-rotary-blue transition-colors"
        title="Insertar o editar enlace"
      >
        <LinkIcon className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={onUnlink}
        className="p-1.5 rounded-lg text-slate-700 hover:bg-rose-50 hover:text-rose-600 transition-colors"
        title="Quitar hipervínculo"
      >
        <UnlinkIcon className="w-4 h-4" />
      </button>

      {/* 11. ELIMINAR FORMATO */}
      <button
        type="button"
        onClick={onClearFormat}
        className="p-1.5 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
        title="Eliminar formato de la selección"
      >
        <RemoveFormatting className="w-4 h-4" />
      </button>

      <div className="w-[1px] h-5 bg-slate-200 mx-0.5" />

      {/* 12. DESHACER / REHACER */}
      <button
        type="button"
        onClick={onUndo}
        className="p-1.5 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
        title="Deshacer (Cmd+Z)"
      >
        <Undo2 className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={onRedo}
        className="p-1.5 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
        title="Rehacer (Cmd+Shift+Z)"
      >
        <Redo2 className="w-4 h-4" />
      </button>

      <div className="w-[1px] h-5 bg-slate-200 mx-0.5" />

      {/* 13. SELECTOR DE VARIABLES DINÁMICAS (MERGE TAGS) */}
      <div className="relative">
        <button
          type="button"
          onClick={() => toggleDropdown('mergeTags')}
          className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-blue-50 hover:bg-blue-100 text-rotary-blue font-bold text-xs transition-colors border border-blue-200/80 shadow-2xs"
          title="Insertar variable dinámica"
        >
          <span>Merge Tags</span>
          <ChevronDown className="w-3 h-3 text-rotary-blue" />
        </button>

        {openDropdown === 'mergeTags' && (
          <div className="absolute top-full right-0 mt-1.5 w-72 bg-white border border-slate-200 rounded-xl shadow-2xl py-2 z-50 max-h-80 overflow-y-auto animate-in fade-in zoom-in-95 duration-100 space-y-2">
            <div className="px-3 pb-1 border-b border-slate-100">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Variables Institucionales
              </span>
            </div>
            {MERGE_TAGS_CATALOG.map((cat) => (
              <div key={cat.category} className="space-y-0.5">
                <div className="px-3 py-1 text-[10px] font-bold text-slate-500 bg-slate-50">
                  {cat.category}
                </div>
                {cat.items.map((it) => (
                  <button
                    key={it.tag}
                    type="button"
                    onClick={() => {
                      onInsertMergeTag(it.tag);
                      setOpenDropdown(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-blue-50 transition-colors flex flex-col group"
                  >
                    <span className="text-xs font-mono font-bold text-rotary-blue group-hover:underline">
                      {it.tag}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {it.label}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface ColorPickerInputProps {
  label?: string;
  value: string;
  onChange: (hex: string) => void;
  presets?: { label: string; value: string }[];
  helpText?: string;
  showPresets?: boolean;
  className?: string;
}

export const ColorPickerInput: React.FC<ColorPickerInputProps> = ({
  label,
  value = '#000000',
  onChange,
  presets = INSTITUTIONAL_PRESET_COLORS,
  helpText,
  showPresets = true,
  className = '',
}) => {
  const normalizedHex = useMemo(() => {
    const v = (value || '').trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(v)) return v;
    if (/^#[0-9A-Fa-f]{3}$/.test(v)) {
      return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
    }
    return '#0C2340';
  }, [value]);

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-slate-700">{label}</label>
          <span className="text-[10px] font-mono text-slate-400 font-semibold">{value || '#000000'}</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <div
          className="relative w-8 h-8 rounded-lg border border-slate-300 shadow-2xs overflow-hidden shrink-0 cursor-pointer group hover:scale-105 transition-transform"
          style={{ backgroundColor: value || '#000000' }}
        >
          <input
            type="color"
            value={normalizedHex}
            onChange={(e) => onChange(e.target.value)}
            className="absolute -top-2 -left-2 w-12 h-12 opacity-0 cursor-pointer"
            title="Seleccionar color visual"
          />
        </div>
        <div className="relative flex-1">
          <input
            type="text"
            value={value || ''}
            onChange={(e) => {
              let val = e.target.value.trim();
              if (val && !val.startsWith('#') && !val.startsWith('rgba') && !val.startsWith('rgb')) {
                val = '#' + val;
              }
              onChange(val);
            }}
            placeholder="#000000"
            className="w-full bg-white border border-slate-300 rounded-lg py-1 px-2 text-xs font-mono text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-rotary-blue uppercase"
          />
        </div>
      </div>
      {showPresets && presets && presets.length > 0 && (
        <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
          <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400">Paleta:</span>
          {presets.map((p) => {
            const isActive = (value || '').toLowerCase() === p.value.toLowerCase();
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => onChange(p.value)}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold transition-all border ${
                  isActive
                    ? 'border-rotary-blue bg-blue-50 text-rotary-blue ring-1 ring-rotary-blue'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
                title={`${p.label} (${p.value})`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full border border-black/15 inline-block shrink-0 shadow-2xs"
                  style={{ backgroundColor: p.value }}
                />
                <span>{p.label}</span>
              </button>
            );
          })}
        </div>
      )}
      {helpText && <p className="text-[10px] text-slate-400 leading-tight">{helpText}</p>}
    </div>
  );
};

type TabMode = 'blocks' | 'layouts' | 'global' | 'style' | 'tags';

interface TextBlockCanvasRendererProps {
  block: TextBlock;
  isEditing: boolean;
  isProt: boolean;
  readOnly: boolean;
  designFont: string;
  onUpdateText: (newHtml: string, isFinal: boolean) => void;
  onSelectionChange: () => void;
  onDoubleClick: () => void;
  onFocus: () => void;
  registerEditableRef: (el: HTMLDivElement | null) => void;
}

const TextBlockCanvasRenderer: React.FC<TextBlockCanvasRendererProps> = ({
  block,
  isEditing,
  isProt,
  readOnly,
  designFont,
  onUpdateText,
  onSelectionChange,
  onDoubleClick,
  onFocus,
  registerEditableRef
}) => {
  const divRef = useRef<HTMLDivElement | null>(null);
  const isTypingRef = useRef(false);

  useEffect(() => {
    if (isEditing) {
      registerEditableRef(divRef.current);
    }
  }, [isEditing, registerEditableRef]);

  // Sincronizar HTML solo cuando cambia el bloque o externamente, NUNCA sobreescribir mientras el usuario escribe
  useEffect(() => {
    if (divRef.current) {
      if (isTypingRef.current) {
        return;
      }
      const targetHtml = textToHtml(block.text);
      if (divRef.current.innerHTML !== targetHtml) {
        divRef.current.innerHTML = targetHtml;
      }
    }
  }, [block.id, block.text]);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    isTypingRef.current = true;
    const html = e.currentTarget.innerHTML;
    onUpdateText(html, false);
  };

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    isTypingRef.current = false;
    const html = e.currentTarget.innerHTML;
    onUpdateText(html, true);
  };

  return (
    <div className="w-full">
      <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style={{ borderCollapse: 'collapse', margin: 0, padding: 0 }}>
        <tbody>
          <tr style={{ margin: 0, padding: 0 }}>
            <td
              style={{
                padding: `${(block as any).padTop ?? 8}px 24px ${(block as any).padBottom ?? 8}px 24px`
              }}
            >
              <div
                ref={divRef}
                contentEditable={isEditing && !isProt && !readOnly}
                suppressContentEditableWarning
                onFocus={onFocus}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onDoubleClick();
                }}
                onClick={(e) => {
                  if (isEditing) {
                    e.stopPropagation();
                  }
                }}
                onInput={handleInput}
                onBlur={handleBlur}
                onMouseUp={onSelectionChange}
                onKeyUp={onSelectionChange}
                onSelect={onSelectionChange}
                data-text-block-id={block.id}
                className={`rich-text-canvas-content transition-all focus:outline-none ${
                  isEditing && !isProt ? 'ring-2 ring-blue-500 rounded-lg p-1.5 bg-blue-50/15 cursor-text' : 'cursor-pointer'
                }`}
                style={{
                  fontFamily: block.fontFamily || designFont,
                  fontSize: `${block.size || 15}px`,
                  lineHeight: block.lineHeight || 1.6,
                  letterSpacing: block.letterSpacing !== undefined ? `${block.letterSpacing}px` : 'normal',
                  color: block.color || '#334155',
                  textAlign: (block.align as any) || 'left',
                  fontWeight: block.fontWeight || (block.weight === 'bold' || block.weight === '800' ? '700' : '400'),
                  minHeight: '28px',
                  outline: 'none',
                  userSelect: isEditing ? 'text' : 'auto'
                }}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

interface HeadingBlockCanvasRendererProps {
  block: HeadingBlock;
  isEditing: boolean;
  isProt: boolean;
  readOnly: boolean;
  designFont: string;
  onUpdateText: (newHtml: string, isFinal: boolean) => void;
  onSelectionChange: () => void;
  onDoubleClick: () => void;
  onFocus: () => void;
  registerEditableRef: (el: HTMLDivElement | null) => void;
}

const HeadingBlockCanvasRenderer: React.FC<HeadingBlockCanvasRendererProps> = ({
  block,
  isEditing,
  isProt,
  readOnly,
  designFont,
  onUpdateText,
  onSelectionChange,
  onDoubleClick,
  onFocus,
  registerEditableRef
}) => {
  const divRef = useRef<HTMLDivElement | null>(null);
  const isTypingRef = useRef(false);

  useEffect(() => {
    if (isEditing) {
      registerEditableRef(divRef.current);
    }
  }, [isEditing, registerEditableRef]);

  useEffect(() => {
    if (divRef.current) {
      if (isTypingRef.current) {
        return;
      }
      const targetHtml = block.text || '';
      if (divRef.current.innerHTML !== targetHtml) {
        divRef.current.innerHTML = targetHtml;
      }
    }
  }, [block.id, block.text]);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    isTypingRef.current = true;
    const html = e.currentTarget.innerHTML;
    onUpdateText(html, false);
  };

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    isTypingRef.current = false;
    const html = e.currentTarget.innerHTML;
    onUpdateText(html, true);
  };

  return (
    <div className="w-full">
      <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style={{ borderCollapse: 'collapse', margin: 0, padding: 0 }}>
        <tbody>
          <tr style={{ margin: 0, padding: 0 }}>
            <td
              style={{
                padding: `${(block as any).padTop ?? (block.level === 1 ? 16 : 8)}px 24px ${(block as any).padBottom ?? 8}px 24px`,
                textAlign: (block.align as any) || 'center'
              }}
            >
              <div
                ref={divRef}
                contentEditable={isEditing && !isProt && !readOnly}
                suppressContentEditableWarning
                onFocus={onFocus}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onDoubleClick();
                }}
                onClick={(e) => {
                  if (isEditing) {
                    e.stopPropagation();
                  }
                }}
                onInput={handleInput}
                onBlur={handleBlur}
                onMouseUp={onSelectionChange}
                onKeyUp={onSelectionChange}
                onSelect={onSelectionChange}
                data-text-block-id={block.id}
                className={`transition-all focus:outline-none rounded-lg p-1 ${
                  isEditing && !isProt ? 'ring-2 ring-blue-500 bg-blue-50/15 cursor-text' : 'cursor-pointer'
                }`}
                style={{
                  fontFamily: block.fontFamily || designFont,
                  fontSize: `${block.fontSize || (block.level === 1 ? 28 : block.level === 2 ? 22 : 18)}px`,
                  fontWeight: block.fontWeight || (block.weight === '300' ? '300' : block.weight === '800' ? '800' : '700'),
                  color: block.color || '#013388',
                  lineHeight: block.lineHeight || 1.25,
                  letterSpacing: block.letterSpacing !== undefined ? `${block.letterSpacing}px` : 0,
                  outline: 'none',
                  userSelect: isEditing ? 'text' : 'auto'
                }}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export const VisualTemplateEditor: React.FC<VisualTemplateEditorProps> = ({
  initialDesign,
  initialName = 'Plantilla Maestra Institucional · Rotary en Acción',
  initialSubject = 'Tu club transforma comunidades. ¡Hagámoslo visible!',
  initialPreheader = 'Comparte tus proyectos y actividades comunitarias en Rotary en Acción.',
  templateId = null,
  campaignContext = null,
  onSave,
  onAutoSaved,
  onClose,
  readOnly = false
}) => {
  // Estado general de plantilla
  const [name, setName] = useState(initialName);
  const [subject, setSubject] = useState(initialSubject);
  const [preheader, setPreheader] = useState(initialPreheader);
  const [design, setDesign] = useState<EmailDesign>(() => {
    if (initialDesign) return normalizeInstitutionalDesign(initialDesign);
    if (campaignContext) {
      const channel = (campaignContext as any).initiative === 'directorio_clubes'
        ? 'directorio_clubes'
        : (campaignContext as any).initiative === 'feria_proyectos'
        ? 'feria_proyectos'
        : 'rotary_en_accion';
      return normalizeInstitutionalDesign(createChannelCampaignDesign(channel, campaignContext));
    }
    return normalizeInstitutionalDesign(createRotaryMasterDesign());
  });
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [draggedBlockIndex, setDraggedBlockIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [blockNavigatorOpen, setBlockNavigatorOpen] = useState(false);

  // Referencia al contenedor de desplazamiento del lienzo y ayudantes de navegación
  const mainCanvasRef = useRef<HTMLElement | null>(null);
  const scrollToTop = () => {
    if (mainCanvasRef.current) {
      mainCanvasRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    const firstBlock = design.blocks[0];
    if (firstBlock) {
      const el = document.getElementById(`canvas-block-${firstBlock.id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  const scrollToBottom = () => {
    if (mainCanvasRef.current) {
      mainCanvasRef.current.scrollTo({
        top: mainCanvasRef.current.scrollHeight + 1000,
        behavior: 'smooth'
      });
    }
    const lastBlock = design.blocks[design.blocks.length - 1];
    if (lastBlock) {
      const el = document.getElementById(`canvas-block-${lastBlock.id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  };

  // Pila de Deshacer / Rehacer (Undo / Redo)
  const [history, setHistory] = useState<EmailDesign[]>([
    initialDesign
      ? normalizeInstitutionalDesign(initialDesign)
      : campaignContext
      ? normalizeInstitutionalDesign(createChannelCampaignDesign(
          (campaignContext as any).initiative === 'directorio_clubes'
            ? 'directorio_clubes'
            : (campaignContext as any).initiative === 'feria_proyectos'
            ? 'feria_proyectos'
            : 'rotary_en_accion',
          campaignContext
        ))
      : normalizeInstitutionalDesign(createRotaryMasterDesign())
  ]);
  const [historyIdx, setHistoryIdx] = useState(0);

  // Inspector y barra lateral
  const [activeTab, setActiveTab] = useState<TabMode>('blocks');
  const [deviceView, setDeviceView] = useState<'desktop' | 'mobile'>('desktop');
  const [bodyWidthPreset, setBodyWidthPreset] = useState<number>(600);
  const [previewMode, setPreviewMode] = useState<'editor' | 'live'>('editor');
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [textInspectorMode, setTextInspectorMode] = useState<'visual' | 'html'>('visual');

  // Modales
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaTargetCallback, setMediaTargetCallback] = useState<((url: string) => void) | null>(null);
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const [testEmailOpen, setTestEmailOpen] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testReceipt, setTestReceipt] = useState<{ to: string; messageId?: string; timestamp: string } | null>(null);

  // Identidad institucional multisitio inteligente y subida de archivos
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingSiteLogo, setSavingSiteLogo] = useState(false);

  // Contexto institucional multisitio activo
  let siteClub: any = null;
  try {
    const clubCtx = useClub();
    siteClub = clubCtx?.club || null;
  } catch {}

  const siteBranding: SiteBrandingContext = useMemo(() => {
    const ctx = getActiveSiteBrandingContext();
    let domain = siteClub?.domain || ctx.domain || null;
    const isDistrict4281 = (
      siteClub?.district === 4281 ||
      siteClub?.district === '4281' ||
      String(siteClub?.subdomain || '').includes('4281') ||
      String(siteClub?.name || '').includes('4281')
    );
    if (isDistrict4281 && (!domain || domain.includes('.clubplatform.org'))) {
      domain = 'rotary4281.org';
    }
    const publicUrl = domain ? `https://${domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}` : ctx.publicUrl;
    const isMainPlatform = Boolean((siteClub as any)?.isMainPlatform ?? ctx.isMainPlatform);
    const rotaryEnAccionUrl = resolveSiteRotaryEnAccionUrl({
      domain,
      publicUrl,
      isMainPlatform,
      siteName: siteClub?.name || ctx.siteName
    });
    return {
      siteLogo: siteClub?.logo || ctx.siteLogo || null,
      siteName: siteClub?.name || ctx.siteName || 'Club Platform',
      siteType: siteClub?.type || ctx.siteType || null,
      isMainPlatform,
      platformLogo: ctx.platformLogo,
      domain,
      publicUrl,
      rotaryEnAccionUrl
    };
  }, [siteClub]);

  // Subida directa de archivo local para logo de cabecera
  const handleLogoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedBlockId) return;
    setUploadingLogo(true);
    try {
      const res = await uploadMediaFiles([file], {
        clubId: siteClub?.id || null,
        maxDimension: 1200
      });
      if (res.uploaded && res.uploaded.length > 0) {
        const url = res.uploaded[0].url;
        updateBlock(selectedBlockId, { logoUrl: url });
        toast.success('Logo subido y aplicado a la cabecera');
      } else {
        toast.error('No se pudo subir el archivo de logo');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al subir el logo');
    } finally {
      setUploadingLogo(false);
      if (e.target) e.target.value = '';
    }
  };

  // Guardar logo como predeterminado en los ajustes del sitio activo
  const handleSetAsSiteDefaultLogo = async (url: string) => {
    if (!url) return;
    if (!siteClub?.id) {
      try {
        const token = getToken();
        await fetch(`${API}/platform-config/logo/url`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ url })
        }).catch(() => {});
        localStorage.setItem('cp_platform_logo', JSON.stringify({ url, size: 48 }));
        toast.success('Logo institucional oficial de Club Platform guardado');
      } catch {
        toast.info('Logo configurado localmente');
      }
      return;
    }
    setSavingSiteLogo(true);
    try {
      const token = getToken();
      const res = await fetch(`${API}/admin/clubs/${siteClub.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ logo: url })
      });
      if (res.ok) {
        toast.success('Logo institucional guardado como predeterminado del sitio', {
          description: `Se actualizaron los ajustes para ${siteClub.name || 'el sitio'}.`
        });
        try {
          const stored = JSON.parse(localStorage.getItem('rotary_club') || '{}');
          localStorage.setItem('rotary_club', JSON.stringify({ ...stored, logo: url }));
        } catch {}
      } else {
        toast.error('No se pudo guardar en los ajustes del sitio');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar logo del sitio');
    } finally {
      setSavingSiteLogo(false);
    }
  };

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
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.getAttribute('contenteditable') === 'true')
      ) {
        return;
      }
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

  // Mutador de bloques con soporte para actualización continua (sin saturar historial) o con registro
  const updateBlock = useCallback((id: string, patch: Partial<Block>, recordHistory = true) => {
    if (recordHistory) {
      pushDesignState({
        ...design,
        blocks: design.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b))
      });
    } else {
      setDesign((prev) => ({
        ...prev,
        blocks: prev.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b))
      }));
    }
  }, [design, pushDesignState]);

  // ─── EDITOR DE TEXTO ENRIQUECIDO EN LIENZO ───
  const activeEditableRef = useRef<HTMLDivElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const isTypingInCanvasRef = useRef(false);
  const typingTimeoutRef = useRef<any>(null);

  // Bloquear scroll de la página de fondo mientras el editor esté abierto
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = origOverflow;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  const [activeTextFormats, setActiveTextFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    sup: false,
    sub: false,
    align: 'left' as Align | 'justify',
    listUl: false,
    listOl: false,
    textColor: '#334155',
    highlightColor: 'transparent'
  });

  const restoreSelection = useCallback(() => {
    if (savedRangeRef.current) {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(savedRangeRef.current);
      }
    }
  }, []);

  const registerEditableRef = useCallback((el: HTMLDivElement | null) => {
    activeEditableRef.current = el;
  }, []);

  const handleSelectionCheck = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0);
    }
    try {
      setActiveTextFormats({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strike: document.queryCommandState('strikeThrough'),
        sup: document.queryCommandState('superscript'),
        sub: document.queryCommandState('subscript'),
        align: document.queryCommandState('justifyCenter')
          ? 'center'
          : document.queryCommandState('justifyRight')
          ? 'right'
          : document.queryCommandState('justifyFull')
          ? 'justify'
          : 'left',
        listUl: document.queryCommandState('insertUnorderedList'),
        listOl: document.queryCommandState('insertOrderedList'),
        textColor: document.queryCommandValue('foreColor') || '#334155',
        highlightColor: document.queryCommandValue('hiliteColor') || 'transparent'
      });
    } catch {
      // ignore
    }
  }, []);

  const syncActiveEditorContent = useCallback(() => {
    if (!activeEditableRef.current || !selectedBlockId) return;
    const rawHtml = activeEditableRef.current.innerHTML;
    const sanitized = sanitizeRichTextHtml(rawHtml);
    isTypingInCanvasRef.current = true;
    updateBlock(selectedBlockId, { text: sanitized });
    setTimeout(() => {
      isTypingInCanvasRef.current = false;
    }, 100);
  }, [selectedBlockId, updateBlock]);

  const handleApplyFontFamily = useCallback((family: string) => {
    restoreSelection();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand('fontName', false, family);
    if (activeEditableRef.current) {
      const fonts = activeEditableRef.current.querySelectorAll('font[face]');
      fonts.forEach((f) => {
        const span = document.createElement('span');
        span.style.fontFamily = f.getAttribute('face') || family;
        while (f.firstChild) {
          span.appendChild(f.firstChild);
        }
        f.parentNode?.replaceChild(span, f);
      });
    }
    syncActiveEditorContent();
  }, [restoreSelection, syncActiveEditorContent]);

  const handleApplyFontSize = useCallback((sizePx: string) => {
    restoreSelection();
    document.execCommand('fontSize', false, '7');
    if (activeEditableRef.current) {
      const fonts = activeEditableRef.current.querySelectorAll('font[size="7"]');
      fonts.forEach((f) => {
        const span = document.createElement('span');
        span.style.fontSize = sizePx;
        while (f.firstChild) {
          span.appendChild(f.firstChild);
        }
        f.parentNode?.replaceChild(span, f);
      });
    }
    syncActiveEditorContent();
  }, [restoreSelection, syncActiveEditorContent]);

  const handleExecuteFormat = useCallback((cmd: string, val?: string) => {
    restoreSelection();
    document.execCommand(cmd, false, val);
    handleSelectionCheck();
    syncActiveEditorContent();
  }, [restoreSelection, handleSelectionCheck, syncActiveEditorContent]);

  const handleApplyTextColor = useCallback((hex: string) => {
    restoreSelection();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand('foreColor', false, hex);
    if (activeEditableRef.current) {
      const fonts = activeEditableRef.current.querySelectorAll('font[color]');
      fonts.forEach((f) => {
        const span = document.createElement('span');
        span.style.color = f.getAttribute('color') || hex;
        while (f.firstChild) {
          span.appendChild(f.firstChild);
        }
        f.parentNode?.replaceChild(span, f);
      });
    }
    syncActiveEditorContent();
  }, [restoreSelection, syncActiveEditorContent]);

  const handleApplyHighlightColor = useCallback((hex: string) => {
    restoreSelection();
    document.execCommand('styleWithCSS', false, 'true');
    if (hex === 'transparent') {
      document.execCommand('removeFormat', false);
    } else {
      document.execCommand('hiliteColor', false, hex);
    }
    syncActiveEditorContent();
  }, [restoreSelection, syncActiveEditorContent]);

  const handleOpenLinkModal = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0);
      let node: Node | null = sel.anchorNode;
      let existingHref = '';
      while (node && node !== activeEditableRef.current) {
        if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'A') {
          existingHref = (node as HTMLAnchorElement).getAttribute('href') || '';
          break;
        }
        node = node.parentNode;
      }
      setLinkUrl(existingHref || '');
    }
    setLinkModalOpen(true);
  }, []);

  const handleConfirmLink = useCallback(() => {
    if (!linkUrl.trim()) {
      toast.error('Ingresa una URL válida');
      return;
    }
    setLinkModalOpen(false);
    restoreSelection();
    const safeTarget = linkUrl.trim();
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) {
      document.execCommand('createLink', false, safeTarget);
      if (activeEditableRef.current) {
        const links = activeEditableRef.current.querySelectorAll('a');
        links.forEach((a) => {
          if (a.getAttribute('href') === safeTarget) {
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener noreferrer');
            a.style.color = '#005a9c';
            a.style.textDecoration = 'underline';
          }
        });
      }
    } else {
      const aHtml = `<a href="${safeTarget}" target="_blank" rel="noopener noreferrer" style="color: #005a9c; text-decoration: underline;">${safeTarget}</a>`;
      document.execCommand('insertHTML', false, aHtml);
    }
    syncActiveEditorContent();
    toast.success('Enlace aplicado');
  }, [linkUrl, restoreSelection, syncActiveEditorContent]);

  const handleUnlink = useCallback(() => {
    restoreSelection();
    document.execCommand('unlink', false);
    syncActiveEditorContent();
    toast.info('Enlace retirado');
  }, [restoreSelection, syncActiveEditorContent]);

  const handleInsertMergeTag = useCallback((tag: string) => {
    restoreSelection();
    document.execCommand('insertHTML', false, tag);
    syncActiveEditorContent();
    toast.success(`Variable ${tag} insertada`);
  }, [restoreSelection, syncActiveEditorContent]);

  const handleInsertEmoji = useCallback((emoji: string) => {
    restoreSelection();
    document.execCommand('insertHTML', false, emoji);
    syncActiveEditorContent();
  }, [restoreSelection, syncActiveEditorContent]);

  const handleClearFormat = useCallback(() => {
    restoreSelection();
    document.execCommand('removeFormat', false);
    syncActiveEditorContent();
    toast.info('Formato eliminado de la selección');
  }, [restoreSelection, syncActiveEditorContent]);

  const handleTextUndo = useCallback(() => {
    document.execCommand('undo', false);
    syncActiveEditorContent();
  }, [syncActiveEditorContent]);

  const handleTextRedo = useCallback(() => {
    document.execCommand('redo', false);
    syncActiveEditorContent();
  }, [syncActiveEditorContent]);

  const handleEditableInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    if (!selectedBlockId) return;
    const currentHtml = e.currentTarget.innerHTML;
    isTypingInCanvasRef.current = true;
    updateBlock(selectedBlockId, { text: currentHtml }, false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingInCanvasRef.current = false;
    }, 400);
  }, [selectedBlockId, updateBlock]);

  const handleEditableBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    if (!selectedBlockId) return;
    const sanitized = sanitizeRichTextHtml(e.currentTarget.innerHTML);
    updateBlock(selectedBlockId, { text: sanitized }, true);
  }, [selectedBlockId, updateBlock]);

  const handleEditablePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    if (html) {
      const sanitized = sanitizeRichTextHtml(html);
      document.execCommand('insertHTML', false, sanitized);
    } else if (text) {
      document.execCommand('insertText', false, text);
    }
    syncActiveEditorContent();
  }, [syncActiveEditorContent]);

  const handleEditableKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      document.execCommand('bold', false);
      syncActiveEditorContent();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      document.execCommand('italic', false);
      syncActiveEditorContent();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      document.execCommand('underline', false);
      syncActiveEditorContent();
    }
  }, [syncActiveEditorContent]);

  // Sincronizar el contenido visual del canvas cuando cambia el bloque seleccionado o su texto desde el panel
  const selectedTextContent = selectedBlock && (selectedBlock.type === 'text' || selectedBlock.type === 'heading') ? (selectedBlock as any).text : null;

  useEffect(() => {
    if (activeEditableRef.current && selectedBlock && (selectedBlock.type === 'text' || selectedBlock.type === 'heading')) {
      if (!isTypingInCanvasRef.current && document.activeElement !== activeEditableRef.current) {
        const targetHtml = selectedBlock.type === 'text' ? textToHtml((selectedBlock as any).text) : (selectedBlock as any).text;
        if (activeEditableRef.current.innerHTML !== targetHtml) {
          activeEditableRef.current.innerHTML = targetHtml;
        }
      }
    }
  }, [selectedBlockId, selectedTextContent]);

  // Auto-foco cuando un bloque entra en modo de edición enriquecida
  useEffect(() => {
    if (editingBlockId && activeEditableRef.current) {
      activeEditableRef.current.focus();
    }
  }, [editingBlockId]);

  // Insertar bloque en una posición específica (o al final)
  const handleAddBlockAt = (type: BlockType, targetIndex?: number) => {
    const newB = makeBlock(type);
    const arr = [...design.blocks];
    if (targetIndex !== undefined && targetIndex >= 0 && targetIndex <= arr.length) {
      arr.splice(targetIndex, 0, newB);
    } else {
      arr.push(newB);
    }
    pushDesignState({
      ...design,
      blocks: arr
    });
    setSelectedBlockId(newB.id);
    if (type === 'text' || type === 'heading') {
      setEditingBlockId(newB.id);
    }
    toast.success(`Bloque «${BLOCK_LABELS[type]}» agregado`);
  };

  // Agregar nuevo bloque al final
  const handleAddBlock = (type: BlockType) => {
    handleAddBlockAt(type);
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
    setSelectedBlockId(moved.id);
  };

  // Reordenar por Drag & Drop
  const handleDropBlock = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= design.blocks.length || toIndex >= design.blocks.length) return;
    const arr = [...design.blocks];
    const [moved] = arr.splice(fromIndex, 1);
    arr.splice(toIndex, 0, moved);
    pushDesignState({ ...design, blocks: arr });
    setSelectedBlockId(moved.id);
    setDraggedBlockIndex(null);
    setDragOverIndex(null);
    toast.success('Posición del bloque actualizada');
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
    const master = normalizeInstitutionalDesign(createRotaryMasterDesign());
    pushDesignState(master);
    setSelectedBlockId(null);
    toast.success('Plantilla Maestra Oficial restaurada');
  };

  // HTML compilado completo
  const compiledHtml = useMemo(() => {
    try {
      return renderDesignToHtml(design, { interactive: false, siteContext: siteBranding });
    } catch {
      return '<div style="padding:20px;text-align:center;color:#ef4444">Error al compilar vista previa</div>';
    }
  }, [design, siteBranding]);

  // ─── PERSISTENCIA DE LA PLANTILLA (v4.1235) ───
  // Lo guardado se reconoce por una "foto" serializada de nombre, asunto,
  // preheader y diseño. "Cambios sin guardar" = la foto actual difiere de la
  // última que el servidor CONFIRMÓ. Los guardados van en fila (nunca dos a la
  // vez) y cada uno envía el estado más reciente, así una respuesta tardía no
  // puede pisar una edición posterior.
  const currentSnapshot = useMemo(
    () => JSON.stringify({ n: name.trim(), s: subject.trim(), p: preheader.trim(), d: design }),
    [name, subject, preheader, design]
  );
  const [savedSnapshot, setSavedSnapshot] = useState<string>(currentSnapshot);
  const savedSnapshotRef = useRef<string>(currentSnapshot);
  const latestStateRef = useRef({ name, subject, preheader, design, snapshot: currentSnapshot });
  latestStateRef.current = { name, subject, preheader, design, snapshot: currentSnapshot };
  const saveChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const discardOnExitRef = useRef(false);
  const [savesInFlight, setSavesInFlight] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const isDirty = !readOnly && currentSnapshot !== savedSnapshot;
  const autosaveEnabled = Boolean(campaignContext?.id) && !readOnly;
  const campaignSaveUrl = campaignContext?.id
    ? `${API}/rotary-en-accion/marketing/campaigns/${campaignContext.id}/apply-template`
    : null;

  // Escribe en la base el estado MÁS RECIENTE del editor. Sólo da el guardado
  // por bueno cuando el servidor devuelve el registro persistido.
  const persistLatest = useCallback(async (): Promise<SaveOutcome> => {
    const { name: n, subject: s, preheader: p, design: d, snapshot } = latestStateRef.current;
    if (!n.trim()) return { ok: false, error: 'La plantilla requiere un nombre identificador' };
    try {
      const fullHtml = renderDesignToHtml(d, { interactive: false, siteContext: siteBranding });
      let res: Response;
      if (campaignSaveUrl) {
        res = await fetch(campaignSaveUrl, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ design: d, subject: s.trim(), preheader: p.trim(), html: fullHtml })
        });
      } else if (templateId) {
        res = await fetch(`${API}/content-activation/templates/${templateId}`, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify({
            name: n.trim(), subject: s.trim(), preheader: p.trim(), design: d, html: fullHtml,
            note: 'Guardado desde Editor Visual de Plantillas'
          })
        });
      } else {
        res = await fetch(`${API}/rotary-en-accion/marketing/templates/save-master`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            name: n.trim(), subject: s.trim(), preheader: p.trim(), design: d, html: fullHtml,
            note: 'Guardado desde Editor Visual de Plantillas'
          })
        });
      }
      const data = await res.json().catch(() => ({} as any));
      const persisted = campaignSaveUrl
        ? res.ok && data.ok && Boolean(data.campaign?.id)
        : res.ok && Boolean(data.template);
      if (!persisted) {
        const error = data.error || `El servidor no confirmó el guardado (HTTP ${res.status}).`;
        setSaveError(error);
        return { ok: false, error };
      }
      savedSnapshotRef.current = snapshot;
      setSavedSnapshot(snapshot);
      setSaveError(null);
      setLastSavedAt(new Date());
      return {
        ok: true,
        version: data.template?.version,
        saved: { name: n, subject: s, preheader: p, design: d, html: fullHtml }
      };
    } catch (err: any) {
      const error = err?.message || 'No se pudo comunicar con el servidor.';
      setSaveError(error);
      return { ok: false, error };
    }
  }, [campaignSaveUrl, templateId, siteBranding]);

  // Encola un guardado detrás de los anteriores.
  const runSave = useCallback((): Promise<SaveOutcome> => {
    setSavesInFlight((c) => c + 1);
    const next = saveChainRef.current.then(persistLatest, persistLatest);
    saveChainRef.current = next.catch(() => undefined);
    return next.finally(() => setSavesInFlight((c) => c - 1));
  }, [persistLatest]);

  // Guarda hasta que lo persistido coincida con lo que se ve (si se editó
  // durante el guardado, vuelve a guardar).
  const saveUntilClean = useCallback(async (): Promise<SaveOutcome> => {
    let outcome = await runSave();
    for (let i = 0; i < 3 && outcome.ok && latestStateRef.current.snapshot !== savedSnapshotRef.current; i++) {
      outcome = await runSave();
    }
    return outcome;
  }, [runSave]);

  // Autoguardado con debounce, sólo para campañas (en plantillas cada guardado
  // crea una versión nueva y no conviene llenarlas de versiones intermedias).
  useEffect(() => {
    if (!autosaveEnabled || !isDirty || saving || savesInFlight > 0 || saveError) return;
    const timer = setTimeout(() => {
      runSave().then((outcome) => {
        if (outcome.ok && outcome.saved) onAutoSaved?.(outcome.saved);
      });
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [autosaveEnabled, isDirty, currentSnapshot, saving, savesInFlight, saveError, runSave, onAutoSaved]);

  // Tras un error, el autoguardado se reanuda cuando la persona vuelve a editar.
  useEffect(() => {
    if (saveError && currentSnapshot !== savedSnapshotRef.current) {
      const timer = setTimeout(() => setSaveError(null), AUTOSAVE_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [currentSnapshot, saveError]);

  // Aviso del navegador al recargar o cerrar la pestaña con cambios pendientes.
  useEffect(() => {
    if (!isDirty && savesInFlight === 0) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, savesInFlight]);

  // Último recurso en campañas: si el editor se desmonta o la página se cierra
  // con cambios sin confirmar, se envían con keepalive (el servidor compila el
  // HTML a partir del diseño). No aplica si la persona eligió descartar.
  useEffect(() => {
    if (!autosaveEnabled || !campaignSaveUrl) return;
    const flush = () => {
      if (discardOnExitRef.current) return;
      const cur = latestStateRef.current;
      if (cur.snapshot === savedSnapshotRef.current) return;
      try {
        const body = JSON.stringify({ design: cur.design, subject: cur.subject.trim(), preheader: cur.preheader.trim() });
        if (body.length > KEEPALIVE_MAX_BYTES) return;
        savedSnapshotRef.current = cur.snapshot;
        fetch(campaignSaveUrl, { method: 'POST', headers: authHeaders(), body, keepalive: true }).catch(() => {});
      } catch {
        // best-effort
      }
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [autosaveEnabled, campaignSaveUrl]);

  // Guardar (botón «Guardar y Sincronizar» / «Guardar Plantilla»)
  const handleSave = async () => {
    if (readOnly) return;
    if (!name.trim()) {
      toast.error('La plantilla requiere un nombre identificador');
      return;
    }
    setSaving(true);
    try {
      const outcome = await saveUntilClean();
      if (!outcome.ok || !outcome.saved) {
        toast.error('No se pudo guardar la plantilla', {
          description: `${outcome.error || 'Error desconocido.'} Tus cambios siguen en el editor; vuelve a intentarlo.`
        });
        return;
      }
      if (campaignContext?.id) {
        toast.success('¡Diseño aplicado y sincronizado con la campaña!', {
          description: `Campaña ${campaignContext.code.toUpperCase()} guardada y sincronizada con Email Marketing.`
        });
        onSave?.(outcome.saved);
        onClose?.();
        return;
      }
      toast.success(`¡Plantilla guardada como v${outcome.version || 1}!`, {
        description: templateId ? 'Cambios persistidos correctamente.' : 'Estructura institucional protegida y lista para campañas.'
      });
      onSave?.(outcome.saved);
    } finally {
      setSaving(false);
    }
  };

  // Salir del editor sin perder cambios en silencio
  const handleRequestClose = async () => {
    if (!onClose) return;
    if (isDirty || savesInFlight > 0) {
      const wantsSave = window.confirm(
        'Hay cambios sin guardar en esta plantilla.\n\nAceptar: guardarlos y salir.\nCancelar: elegir entre seguir editando o descartarlos.'
      );
      if (wantsSave) {
        setSaving(true);
        const outcome = await saveUntilClean();
        setSaving(false);
        if (!outcome.ok || !outcome.saved) {
          toast.error('No se pudo guardar; sigues en el editor para no perder tus cambios.', {
            description: outcome.error
          });
          return;
        }
        onSave?.(outcome.saved);
        onClose();
        return;
      }
      if (!window.confirm('¿Descartar los cambios no guardados y salir del editor?')) return;
      discardOnExitRef.current = true;
    }
    onClose();
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
      // La prueba usa la MISMA versión persistida: si hay cambios pendientes,
      // primero se guardan; si el guardado falla, no se envía nada.
      let testHtml = renderDesignToHtml(design, { interactive: false, siteContext: siteBranding });
      let testSubject = subject;
      if (isDirty) {
        const outcome = await saveUntilClean();
        if (!outcome.ok || !outcome.saved) {
          toast.error('No se envió la prueba: los cambios no se pudieron guardar', {
            description: outcome.error
          });
          return;
        }
        testHtml = outcome.saved.html;
        testSubject = outcome.saved.subject;
      }
      const res = await fetch(`${API}/rotary-en-accion/marketing/templates/test-email`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          to: emailTo,
          subject: testSubject,
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

  const editorModalContent = (
    <div
      className="fixed inset-0 z-[99999] h-screen w-screen bg-slate-100 flex flex-col text-slate-800 font-sans overflow-hidden"
      onWheel={(e) => {
        const target = e.target as HTMLElement;
        if (target && !target.closest('aside') && !target.closest('input') && !target.closest('textarea') && mainCanvasRef.current) {
          mainCanvasRef.current.scrollTop += e.deltaY;
        }
      }}
    >
      {/* ─── 1. BARRA SUPERIOR (HEADER ESTILO CLUB PLATFORM) ─────────────── */}
      <header className="bg-white border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xs shrink-0 z-30">
        {/* Lado izquierdo: Botón volver + Identidad + Nombre de plantilla */}
        <div className="flex items-center gap-3 min-w-0">
          {onClose && (
            <button
              onClick={handleRequestClose}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              title="Volver"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] uppercase tracking-wider font-extrabold bg-blue-50 text-rotary-blue px-2.5 py-0.5 rounded-full border border-blue-200">
                Club Platform · Editor Visual de Plantillas v{APP_VERSION}
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
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors cursor-pointer"
              title="Reducir Zoom"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 font-bold text-slate-700 min-w-[42px] text-center">
              {zoomLevel}%
            </span>
            <button
              onClick={() => setZoomLevel((z) => Math.min(z + 15, 140))}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors cursor-pointer"
              title="Aumentar Zoom"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-3.5 bg-slate-300 mx-0.5" />
            <button
              type="button"
              onClick={() => setZoomLevel((z) => (z === 100 ? 65 : 100))}
              className={`px-2 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                zoomLevel !== 100
                  ? 'bg-rotary-blue text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white'
              }`}
              title={zoomLevel === 100 ? 'Ajustar para ver plantilla completa en pantalla (65%)' : 'Restaurar tamaño de edición al 100%'}
            >
              {zoomLevel === 100 ? 'Ver Completa' : '100%'}
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

          {/* Estado del guardado */}
          {!readOnly && (
            <span
              role="status"
              aria-live="polite"
              title={saveError || (lastSavedAt ? `Último guardado confirmado: ${lastSavedAt.toLocaleTimeString('es-CO')}` : undefined)}
              className={`hidden md:inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border ${
                saving || savesInFlight > 0
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : saveError
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : isDirty
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700'
              }`}
            >
              {saving || savesInFlight > 0 ? (
                <><RefreshCw className="w-3 h-3 animate-spin" /> Guardando…</>
              ) : saveError ? (
                <><X className="w-3 h-3" /> Error al guardar</>
              ) : isDirty ? (
                <>● Cambios sin guardar{autosaveEnabled ? ' · autoguardado' : ''}</>
              ) : (
                <><CheckCircle2 className="w-3 h-3" /> {lastSavedAt ? 'Guardado correctamente' : 'Sin cambios'}</>
              )}
            </span>
          )}

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

      {/* ─── 2.5. BARRA DE FORMATO ENRIQUECIDO WYSIWYG DOCKEADA AL TOPE ──── */}
      {selectedBlock && (selectedBlock.type === 'text' || selectedBlock.type === 'heading') && !readOnly && (
        <div className="bg-white border-b border-slate-200 px-4 py-1.5 flex items-center justify-center shrink-0 z-30 shadow-xs">
          <InlineRichTextToolbar
            fontFamily={selectedBlock.fontFamily || design.settings.font}
            fontSize={selectedBlock.size || (selectedBlock.type === 'heading' ? (selectedBlock.fontSize || 22) : 15)}
            color={selectedBlock.color || '#334155'}
            activeFormats={activeTextFormats}
            onApplyFontFamily={handleApplyFontFamily}
            onApplyFontSize={handleApplyFontSize}
            onApplyFormat={handleExecuteFormat}
            onApplyTextColor={handleApplyTextColor}
            onApplyHighlightColor={handleApplyHighlightColor}
            onInsertLink={handleOpenLinkModal}
            onUnlink={handleUnlink}
            onInsertMergeTag={handleInsertMergeTag}
            onInsertEmoji={handleInsertEmoji}
            onClearFormat={handleClearFormat}
            onUndo={handleTextUndo}
            onRedo={handleTextRedo}
          />
        </div>
      )}

      {/* ─── 3. ÁREA PRINCIPAL: LIENZO CENTRAL + BARRA LATERAL DERECHA ──── */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* LIENZO DE TRABAJO (CANVAS CENTRAL) */}
        <main
          ref={mainCanvasRef}
          id="rotary-visual-canvas-scroll"
          tabIndex={0}
          className="flex-1 min-h-0 bg-slate-200/70 overflow-y-auto overflow-x-hidden relative focus:outline-none"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedBlockId(null);
              setEditingBlockId(null);
              setBlockNavigatorOpen(false);
            }
          }}
          onKeyDown={(e) => {
            const activeEl = document.activeElement;
            if (
              activeEl &&
              (activeEl.tagName === 'INPUT' ||
                activeEl.tagName === 'TEXTAREA' ||
                activeEl.getAttribute('contenteditable') === 'true')
            ) {
              return;
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              mainCanvasRef.current?.scrollBy({ top: 80, behavior: 'smooth' });
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              mainCanvasRef.current?.scrollBy({ top: -80, behavior: 'smooth' });
            } else if (e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) {
              e.preventDefault();
              mainCanvasRef.current?.scrollBy({ top: 450, behavior: 'smooth' });
            } else if (e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) {
              e.preventDefault();
              mainCanvasRef.current?.scrollBy({ top: -450, behavior: 'smooth' });
            } else if (e.key === 'Home') {
              e.preventDefault();
              scrollToTop();
            } else if (e.key === 'End') {
              e.preventDefault();
              scrollToBottom();
            }
          }}
        >

          {/* ESTILOS SCOPED PARA EDICIÓN EN LIENZO Y SCROLLBAR ROTARY BLUE PERMANENTE */}
          <style>{`
            #rotary-visual-canvas-scroll {
              overflow-y: auto !important;
              overscroll-behavior: contain;
              scrollbar-color: #013388 #e2e8f0;
            }
            #rotary-visual-canvas-scroll::-webkit-scrollbar {
              width: 14px !important;
              height: 14px !important;
              display: block !important;
            }
            #rotary-visual-canvas-scroll::-webkit-scrollbar-track {
              background: #e2e8f0 !important;
              border-radius: 8px !important;
            }
            #rotary-visual-canvas-scroll::-webkit-scrollbar-thumb {
              background: #013388 !important;
              border-radius: 8px !important;
              border: 3px solid #e2e8f0 !important;
            }
            #rotary-visual-canvas-scroll::-webkit-scrollbar-thumb:hover {
              background: #00246c !important;
            }
            .rich-text-canvas-content p {
              margin: 0 0 12px 0;
              line-height: inherit;
            }
            .rich-text-canvas-content p:last-child {
              margin-bottom: 0;
            }
            .rich-text-canvas-content ul {
              margin: 0 0 12px 0;
              padding-left: 24px;
              list-style-type: disc;
            }
            .rich-text-canvas-content ol {
              margin: 0 0 12px 0;
              padding-left: 24px;
              list-style-type: decimal;
            }
            .rich-text-canvas-content li {
              margin-bottom: 4px;
            }
            .rich-text-canvas-content a {
              color: #005a9c;
              text-decoration: underline;
            }
            .rich-text-canvas-content blockquote {
              border-left: 3px solid #005a9c;
              margin: 12px 0;
              padding-left: 12px;
              color: #475569;
              font-style: italic;
            }
          `}</style>

          {/* Wrapper con scroll padding amplio para que el footer y los últimos bloques siempre sean accesibles */}
          <div
            className="w-full flex flex-col items-center pb-64 min-h-full"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setSelectedBlockId(null);
                setEditingBlockId(null);
                setBlockNavigatorOpen(false);
              }
            }}
          >
            <div
              id="rotary-email-card-container"
              style={{
                width: deviceView === 'mobile' ? '375px' : `${bodyWidthPreset}px`,
                maxWidth: '100%',
                transform: zoomLevel === 100 ? undefined : `scale(${zoomLevel / 100})`,
                transformOrigin: 'top center',
                transition: 'width 0.2s ease, transform 0.2s ease'
              }}
              className="shadow-2xl rounded-2xl overflow-hidden border border-slate-300/80 transition-all bg-white"
            >
              {previewMode === 'live' ? (
                // Vista previa HTML real: altura dinámica al 100%, scroll continuo y fidelidad exacta
                <div
                  className="w-full bg-white select-text transition-all"
                  dangerouslySetInnerHTML={{ __html: compiledHtml }}
                />
              ) : (
                // Lienzo interactivo continuo de bloques con fidelidad 1:1 con el correo real
                <div
                  style={{
                    backgroundColor: design.settings.contentBg || '#ffffff',
                    color: design.settings.textColor || '#334155',
                    fontFamily: design.settings.font || "'Open Sans', Helvetica, Arial, sans-serif"
                  }}
                  className="w-full flex flex-col"
                >
                  {design.blocks.map((block, idx) => {
                    const isSelected = selectedBlockId === block.id;
                    const isEditing = editingBlockId === block.id;
                    const isProt = Boolean(block.isProtected);
                    const isDragged = draggedBlockIndex === idx;
                    const isOver = dragOverIndex === idx;

                    return (
                      <div
                        key={block.id}
                        id={`canvas-block-${block.id}`}
                        data-block-id={block.id}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            if (draggedBlockIndex !== null && draggedBlockIndex !== idx) {
                              if (dragOverIndex !== idx) setDragOverIndex(idx);
                            }
                          }}
                          onDragLeave={(e) => {
                            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                            if (dragOverIndex === idx) setDragOverIndex(null);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const newBlockType = e.dataTransfer.getData('application/rotary-new-block-type');
                            if (newBlockType) {
                              handleAddBlockAt(newBlockType as BlockType, idx);
                              setDragOverIndex(null);
                              return;
                            }
                            const rawIdx = e.dataTransfer.getData('text/plain');
                            const fromIndex = rawIdx !== '' ? parseInt(rawIdx, 10) : draggedBlockIndex;
                            if (fromIndex !== null && !isNaN(fromIndex) && fromIndex !== idx) {
                              handleDropBlock(fromIndex, idx);
                            }
                            setDraggedBlockIndex(null);
                            setDragOverIndex(null);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            const target = e.target as HTMLElement;
                            if (target && target.closest('a')) {
                              e.preventDefault();
                            }
                            setSelectedBlockId(block.id);
                            if (editingBlockId && editingBlockId !== block.id) {
                              setEditingBlockId(null);
                            }
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            if (!isProt && !readOnly && (block.type === 'text' || block.type === 'heading')) {
                              setSelectedBlockId(block.id);
                              setEditingBlockId(block.id);
                            }
                          }}
                          className={`relative group transition-all ${
                            isDragged ? 'opacity-40 scale-[0.99] border-dashed border-2 border-slate-400' : ''
                          } ${
                            isOver ? 'border-t-4 border-rotary-blue shadow-lg' : ''
                          } ${
                            isSelected
                              ? 'ring-2 ring-blue-600 ring-inset shadow-md z-10'
                              : 'hover:outline hover:outline-1 hover:outline-blue-400/80 cursor-pointer'
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
                            {/* Controlador de Arrastre (Drag Handle) */}
                            {!isProt && !readOnly && (
                              <div
                                draggable
                                onDragStart={(e) => {
                                  e.stopPropagation();
                                  e.dataTransfer.setData('text/plain', String(idx));
                                  e.dataTransfer.effectAllowed = 'move';
                                  setDraggedBlockIndex(idx);
                                }}
                                onDragEnd={() => {
                                  setDraggedBlockIndex(null);
                                  setDragOverIndex(null);
                                }}
                                className="p-1 text-slate-500 hover:text-rotary-blue cursor-grab active:cursor-grabbing rounded-lg hover:bg-slate-100 transition-colors"
                                title="Arrastrar para mover bloque"
                              >
                                <GripVertical className="w-3.5 h-3.5" />
                              </div>
                            )}

                            {/* Botón Editar Texto Enriquecido */}
                            {(block.type === 'text' || block.type === 'heading') && !isProt && !readOnly && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedBlockId(block.id);
                                  setEditingBlockId(block.id);
                                }}
                                className={`p-1 rounded-lg transition-colors ${
                                  isEditing ? 'text-rotary-blue bg-blue-50 font-bold' : 'text-slate-600 hover:text-rotary-blue hover:bg-slate-100'
                                }`}
                                title={isEditing ? 'Editando contenido actualmente' : 'Editar texto enriquecido (Doble clic)'}
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleMoveBlock(idx, 'up')}
                              disabled={idx === 0}
                              className="p-1 text-slate-600 hover:text-rotary-blue disabled:opacity-30 rounded-lg hover:bg-slate-100"
                              title="Subir bloque"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveBlock(idx, 'down')}
                              disabled={idx === design.blocks.length - 1}
                              className="p-1 text-slate-600 hover:text-rotary-blue disabled:opacity-30 rounded-lg hover:bg-slate-100"
                              title="Bajar bloque"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDuplicateBlock(idx)}
                              className="p-1 text-slate-600 hover:text-rotary-blue rounded-lg hover:bg-slate-100"
                              title="Duplicar bloque"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleProtection(block.id)}
                              className={`p-1 rounded-lg hover:bg-slate-100 ${isProt ? 'text-amber-600' : 'text-slate-400 hover:text-amber-600'}`}
                              title={isProt ? 'Quitar protección institucional' : 'Proteger componente'}
                            >
                              {isProt ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteBlock(block.id, isProt)}
                              className="p-1 text-rose-600 hover:text-rose-700 rounded-lg hover:bg-rose-50"
                              title="Eliminar bloque"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Renderizado de bloque individual */}
                          {block.type === 'heading' ? (
                            <HeadingBlockCanvasRenderer
                              block={block as HeadingBlock}
                              isEditing={isEditing}
                              isProt={isProt}
                              readOnly={readOnly}
                              designFont={design.settings.font}
                              registerEditableRef={registerEditableRef}
                              onFocus={() => {
                                setSelectedBlockId(block.id);
                              }}
                              onDoubleClick={() => {
                                setSelectedBlockId(block.id);
                                setEditingBlockId(block.id);
                              }}
                              onSelectionChange={handleSelectionCheck}
                              onUpdateText={(newHtml, isFinal) => {
                                if (isFinal) {
                                  updateBlock(block.id, { text: newHtml }, true);
                                } else {
                                  updateBlock(block.id, { text: newHtml }, false);
                                }
                              }}
                            />
                          ) : block.type === 'text' ? (
                            <TextBlockCanvasRenderer
                              block={block as TextBlock}
                              isEditing={isEditing}
                              isProt={isProt}
                              readOnly={readOnly}
                              designFont={design.settings.font}
                              registerEditableRef={registerEditableRef}
                              onFocus={() => {
                                setSelectedBlockId(block.id);
                              }}
                              onDoubleClick={() => {
                                setSelectedBlockId(block.id);
                                setEditingBlockId(block.id);
                              }}
                              onSelectionChange={handleSelectionCheck}
                              onUpdateText={(newHtml, isFinal) => {
                                if (isFinal) {
                                  updateBlock(block.id, { text: newHtml }, true);
                                } else {
                                  updateBlock(block.id, { text: newHtml }, false);
                                }
                              }}
                            />
                          ) : (
                            <div
                              dangerouslySetInnerHTML={{
                                __html: renderSingleBlockHtml(
                                  block,
                                  design.settings,
                                  siteBranding,
                                  {
                                    interactive: false,
                                    isCtaActive: design.blocks.some(
                                      (b) => b.type === 'global' && (b as GlobalBlockItem).globalKey === 'club_platform_cta' && (b as GlobalBlockItem).enabled !== false
                                    )
                                  }
                                )
                              }}
                            />
                          )}
                        </div>
                      );
                    })}

                    {/* Área de caída inferior para agregar bloques al final */}
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'copy';
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const newBlockType = e.dataTransfer.getData('application/rotary-new-block-type');
                        if (newBlockType) {
                          handleAddBlockAt(newBlockType as BlockType);
                        }
                      }}
                      className="py-3 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl my-3 mx-4 hover:border-rotary-blue hover:text-rotary-blue transition-colors cursor-pointer"
                      onClick={() => {
                        setSelectedBlockId(null);
                        setEditingBlockId(null);
                        setActiveTab('blocks');
                      }}
                    >
                      + Arrastra un bloque aquí o haz clic para abrir la biblioteca
                    </div>

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
              )}
            </div>
          </div>

          {/* ─── NAVEGADOR DE PLANTILLA FLOTANTE (ESTILO OFICIAL CLUB PLATFORM) ─── */}
          <div className="fixed bottom-6 right-84 sm:right-104 z-30 flex flex-col items-center select-none">
            {/* Popover desplegable con índice de bloques */}
            {blockNavigatorOpen && (
              <div
                className="mb-2 w-80 max-h-96 bg-white/98 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200/90 p-3 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150 z-40"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 px-1">
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-rotary-blue" />
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                      Índice de la Plantilla
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBlockNavigatorOpen(false)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="overflow-y-auto max-h-72 py-1.5 space-y-1">
                  {design.blocks.map((b, i) => {
                    const isSelected = selectedBlockId === b.id;
                    const isProt = Boolean(b.isProtected);
                    const label = b.label || BLOCK_LABELS[b.type] || 'Bloque';

                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          setSelectedBlockId(b.id);
                          setBlockNavigatorOpen(false);
                          setTimeout(() => {
                            const el = document.getElementById(`canvas-block-${b.id}`);
                            if (el) {
                              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                          }, 50);
                        }}
                        className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left text-xs transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-blue-50 text-rotary-blue font-bold ring-1 ring-rotary-blue'
                            : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] font-mono text-slate-400 font-bold shrink-0">
                            #{i + 1}
                          </span>
                          <span className="truncate">{label}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {isProt && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              Protegido
                            </span>
                          )}
                          {isSelected && (
                            <span className="w-2 h-2 rounded-full bg-rotary-blue shrink-0 animate-pulse" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Barra del navegador de plantilla */}
            <div className="flex flex-col bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden text-xs">
              {/* Cabecera del navegador */}
              <div className="flex items-center justify-between px-3.5 pt-2 pb-1 border-b border-slate-100 gap-3">
                <span className="text-[11px] font-extrabold text-slate-700 tracking-tight">
                  Navegador de plantilla
                </span>
                <span className="text-[10px] font-mono font-black text-rotary-blue bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                  {design.blocks.length} bloques
                </span>
              </div>

              {/* Botones de acción: Inicio | Bloques | Pie de página */}
              <div className="flex items-center gap-1 p-1">
                <button
                  type="button"
                  onClick={scrollToTop}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-slate-700 hover:text-rotary-blue hover:bg-blue-50/50 rounded-xl font-bold transition-all cursor-pointer"
                  title="Ir al inicio de la plantilla (Cabecera)"
                >
                  <ArrowUp className="w-3.5 h-3.5 text-rotary-blue" />
                  <span>Inicio</span>
                </button>

                <div className="w-px h-4 bg-slate-200 mx-0.5" />

                <button
                  type="button"
                  onClick={() => setBlockNavigatorOpen((prev) => !prev)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                    blockNavigatorOpen
                      ? 'bg-rotary-blue text-white shadow-xs'
                      : 'text-slate-700 hover:text-rotary-blue hover:bg-blue-50/50'
                  }`}
                  title="Abrir índice completo de bloques para salto rápido"
                >
                  <MenuIcon className="w-3.5 h-3.5" />
                  <span>Bloques</span>
                </button>

                <div className="w-px h-4 bg-slate-200 mx-0.5" />

                <button
                  type="button"
                  onClick={scrollToBottom}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-slate-700 hover:text-rotary-blue hover:bg-blue-50/50 rounded-xl font-bold transition-all cursor-pointer"
                  title="Ir al pie de página (Tarjeta Directorio, Botón CTA y Footer)"
                >
                  <ArrowDown className="w-3.5 h-3.5 text-rotary-blue" />
                  <span>Pie de página</span>
                </button>
              </div>
            </div>
          </div>
        </main>

        {/* ─── 4. BARRA LATERAL DERECHA (BLOQUES Y PROPIEDADES) ───────── */}
        <aside className="w-80 sm:w-96 bg-white border-l border-slate-200 flex flex-col min-h-0 shrink-0 z-20">
          {/* Pestañas de la barra lateral */}
          <div className="flex border-b border-slate-200 bg-slate-50/90 p-1.5 gap-1 shrink-0">
            <button
              onClick={() => {
                setSelectedBlockId(null);
                setEditingBlockId(null);
                setActiveTab('blocks');
              }}
              className={`flex-1 py-2 px-1 text-center text-[11px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1 ${
                activeTab === 'blocks' && !selectedBlock
                  ? 'bg-white text-rotary-blue shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              <span>Bloques</span>
            </button>
            <button
              onClick={() => {
                setSelectedBlockId(null);
                setEditingBlockId(null);
                setActiveTab('layouts');
              }}
              className={`flex-1 py-2 px-1 text-center text-[11px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1 ${
                activeTab === 'layouts' && !selectedBlock
                  ? 'bg-white text-rotary-blue shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Layout className="w-3.5 h-3.5" />
              <span>Diseños</span>
            </button>
            <button
              onClick={() => {
                setSelectedBlockId(null);
                setEditingBlockId(null);
                setActiveTab('global');
              }}
              className={`flex-1 py-2 px-1 text-center text-[11px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1 ${
                activeTab === 'global' && !selectedBlock
                  ? 'bg-white text-rotary-blue shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-amber-600" />
              <span>Globales</span>
            </button>
            <button
              onClick={() => {
                setSelectedBlockId(null);
                setEditingBlockId(null);
                setActiveTab('style');
              }}
              className={`flex-1 py-2 px-1 text-center text-[11px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1 ${
                activeTab === 'style' && !selectedBlock
                  ? 'bg-white text-rotary-blue shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Estilo</span>
            </button>
            <button
              onClick={() => {
                setSelectedBlockId(null);
                setEditingBlockId(null);
                setActiveTab('tags');
              }}
              className={`flex-1 py-2 px-1 text-center text-[11px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1 ${
                activeTab === 'tags' && !selectedBlock
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
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            {/* Si hay un bloque seleccionado, mostrar Inspector de Propiedades */}
            {selectedBlock ? (
              <div className="space-y-4 bg-slate-50/80 border border-slate-200 rounded-2xl p-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBlockId(null);
                        setEditingBlockId(null);
                        setActiveTab('blocks');
                      }}
                      className="text-slate-500 hover:text-rotary-blue hover:bg-slate-200/60 p-1 rounded-lg transition-colors flex items-center gap-1 text-[11px] font-bold"
                      title="Volver al catálogo de bloques"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Volver</span>
                    </button>
                    <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                      {BLOCK_LABELS[selectedBlock.type] || selectedBlock.type}
                    </span>
                    {selectedBlock.isProtected && (
                      <span className="text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-bold border border-amber-300">
                        Protegido
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setSelectedBlockId(null);
                      setEditingBlockId(null);
                    }}
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
                        <textarea
                          rows={2}
                          value={selectedBlock.text}
                          onChange={(e) => updateBlock(selectedBlock.id, { text: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:border-rotary-blue focus:ring-1 focus:ring-rotary-blue text-xs font-semibold"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">Nivel</label>
                          <select
                            value={selectedBlock.level}
                            onChange={(e) => updateBlock(selectedBlock.id, { level: Number(e.target.value) as any })}
                            className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs"
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

                      {/* Controles de Tipografía */}
                      <div className="bg-slate-50/90 border border-slate-200 rounded-xl p-3 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                            <Type className="w-3.5 h-3.5 text-rotary-blue" />
                            Tipografía Institucional
                          </label>
                          <span className="text-[10px] bg-blue-100 text-rotary-blue font-bold px-1.5 py-0.5 rounded">
                            {selectedBlock.fontFamily ? 'Personalizada' : 'Open Sans (Por defecto)'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 font-medium block mb-1">Familia Tipográfica</span>
                          <select
                            value={selectedBlock.fontFamily || ''}
                            onChange={(e) => updateBlock(selectedBlock.id, { fontFamily: e.target.value || undefined })}
                            className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs text-slate-900"
                          >
                            <option value="">Predeterminada ({design.settings.font.split(',')[0].replace(/['"]/g, '')})</option>
                            {FONT_OPTIONS.map((f) => (
                              <option key={f.value} value={f.value}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[10px] text-slate-500 font-medium block mb-1">Variante de Peso</span>
                            <select
                              value={String(selectedBlock.fontWeight || (selectedBlock.weight === 'normal' ? '400' : selectedBlock.weight === '800' ? '800' : '700'))}
                              onChange={(e) => updateBlock(selectedBlock.id, { fontWeight: e.target.value as any, weight: e.target.value as any })}
                              className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs text-slate-900"
                            >
                              {FONT_WEIGHT_OPTIONS.map((w) => (
                                <option key={w.value} value={w.value}>
                                  {w.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 font-medium block mb-1">Tamaño ({selectedBlock.fontSize || (selectedBlock.level === 1 ? 28 : selectedBlock.level === 2 ? 22 : 18)}px)</span>
                            <input
                              type="number"
                              min={14}
                              max={48}
                              value={selectedBlock.fontSize || (selectedBlock.level === 1 ? 28 : selectedBlock.level === 2 ? 22 : 18)}
                              onChange={(e) => updateBlock(selectedBlock.id, { fontSize: Number(e.target.value) })}
                              className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs text-slate-900"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[10px] text-slate-500 font-medium block mb-1">Interlineado</span>
                            <select
                              value={Number(selectedBlock.lineHeight || 1.25)}
                              onChange={(e) => updateBlock(selectedBlock.id, { lineHeight: Number(e.target.value) })}
                              className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs text-slate-900"
                            >
                              {LINE_HEIGHT_OPTIONS.map((lh) => (
                                <option key={lh.value} value={lh.value}>
                                  {lh.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 font-medium block mb-1">Espaciado ({selectedBlock.letterSpacing ?? -0.5}px)</span>
                            <input
                              type="number"
                              step={0.5}
                              min={-2}
                              max={4}
                              value={selectedBlock.letterSpacing ?? -0.5}
                              onChange={(e) => updateBlock(selectedBlock.id, { letterSpacing: Number(e.target.value) })}
                              className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs text-slate-900"
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Texto / Párrafo */}
                  {selectedBlock.type === 'text' && (
                    <>
                      {/* Selector de Modo: Visual vs Código HTML */}
                      <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold mb-3">
                        <button
                          type="button"
                          onClick={() => setTextInspectorMode('visual')}
                          className={`flex-1 py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                            textInspectorMode === 'visual'
                              ? 'bg-white text-rotary-blue shadow-xs border border-slate-200/60'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          <span>Modo Visual</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setTextInspectorMode('html')}
                          className={`flex-1 py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                            textInspectorMode === 'html'
                              ? 'bg-white text-rotary-blue shadow-xs border border-slate-200/60'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <Code2 className="w-3.5 h-3.5 text-slate-500" />
                          <span>Código HTML</span>
                        </button>
                      </div>

                      {textInspectorMode === 'visual' ? (
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50/60 border border-blue-200/90 rounded-xl p-3 space-y-2.5 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-rotary-blue">
                              <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <span>Edición Directa en el Lienzo</span>
                            </div>
                            <span className="text-[10px] bg-blue-100 text-rotary-blue font-bold px-2 py-0.5 rounded-full">
                              WYSIWYG
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 leading-relaxed">
                            Haz doble clic sobre este párrafo en la plantilla para editar el texto o selecciona palabras para aplicar negrita, colores, enlaces o variables institucionales con la barra superior.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedBlockId(selectedBlock.id);
                              setEditingBlockId(selectedBlock.id);
                            }}
                            className="w-full py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-white" />
                            <span>{editingBlockId === selectedBlock.id ? 'Editando actualmente en el lienzo' : 'Activar Edición en el Lienzo'}</span>
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                            <Code2 className="w-4 h-4 text-amber-600 shrink-0" />
                            <p className="text-[11px] leading-tight">
                              <strong>Modo avanzado:</strong> Edita el código HTML crudo solo si requieres maquetación especializada. La edición visual en el lienzo es recomendada.
                            </p>
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[11px] font-bold text-slate-700">Código HTML Fuente del Párrafo</label>
                              <span className="text-[10px] text-slate-400 font-mono">Sincronizado</span>
                            </div>
                            <textarea
                              rows={8}
                              value={selectedBlock.text}
                              onChange={(e) => updateBlock(selectedBlock.id, { text: e.target.value })}
                              className="w-full bg-slate-900 text-emerald-400 border border-slate-700 rounded-xl p-3 font-mono text-xs focus:border-rotary-blue focus:ring-1 focus:ring-rotary-blue leading-relaxed"
                              placeholder="<p>Texto con etiquetas HTML...</p>"
                            />
                            <div className="flex justify-end mt-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const sanitized = sanitizeRichTextHtml(selectedBlock.text);
                                  updateBlock(selectedBlock.id, { text: sanitized });
                                  toast.success('HTML sanitizado y sincronizado');
                                }}
                                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors"
                              >
                                Limpiar y Validar HTML
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">Tamaño Base (px)</label>
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

                      {/* Controles de Tipografía */}
                      <div className="bg-slate-50/90 border border-slate-200 rounded-xl p-3 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                            <Type className="w-3.5 h-3.5 text-rotary-blue" />
                            Tipografía Institucional
                          </label>
                          <span className="text-[10px] bg-blue-100 text-rotary-blue font-bold px-1.5 py-0.5 rounded">
                            {selectedBlock.fontFamily ? 'Personalizada' : 'Open Sans (Por defecto)'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 font-medium block mb-1">Familia Tipográfica</span>
                          <select
                            value={selectedBlock.fontFamily || ''}
                            onChange={(e) => updateBlock(selectedBlock.id, { fontFamily: e.target.value || undefined })}
                            className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs text-slate-900"
                          >
                            <option value="">Predeterminada ({design.settings.font.split(',')[0].replace(/['"]/g, '')})</option>
                            {FONT_OPTIONS.map((f) => (
                              <option key={f.value} value={f.value}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[10px] text-slate-500 font-medium block mb-1">Variante de Peso</span>
                            <select
                              value={String(selectedBlock.fontWeight || (selectedBlock.weight === 'bold' || selectedBlock.weight === '800' ? '700' : '400'))}
                              onChange={(e) => updateBlock(selectedBlock.id, { fontWeight: e.target.value as any, weight: e.target.value as any })}
                              className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs text-slate-900"
                            >
                              {FONT_WEIGHT_OPTIONS.map((w) => (
                                <option key={w.value} value={w.value}>
                                  {w.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 font-medium block mb-1">Interlineado</span>
                            <select
                              value={Number(selectedBlock.lineHeight || 1.6)}
                              onChange={(e) => updateBlock(selectedBlock.id, { lineHeight: Number(e.target.value) })}
                              className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs text-slate-900"
                            >
                              {LINE_HEIGHT_OPTIONS.map((lh) => (
                                <option key={lh.value} value={lh.value}>
                                  {lh.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 font-medium block mb-1">Espaciado de Letras ({selectedBlock.letterSpacing ?? 0}px)</span>
                          <input
                            type="number"
                            step={0.5}
                            min={-1}
                            max={3}
                            value={selectedBlock.letterSpacing ?? 0}
                            onChange={(e) => updateBlock(selectedBlock.id, { letterSpacing: Number(e.target.value) })}
                            className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs text-slate-900"
                          />
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
                          className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 font-semibold"
                          placeholder="COMPARTIR EN ROTARY EN ACCIÓN"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-slate-600">Destino URL</label>
                          {siteBranding.rotaryEnAccionUrl && (
                            <button
                              type="button"
                              onClick={() => {
                                updateBlock(selectedBlock.id, { href: siteBranding.rotaryEnAccionUrl || 'https://app.clubplatform.org/rotary-en-accion' });
                                toast.success('Enlace inteligente del sitio aplicado');
                              }}
                              className="text-[10px] text-rotary-blue hover:underline font-bold flex items-center gap-1 cursor-pointer"
                              title="Restaurar enlace automático del sitio activo"
                            >
                              <RotateCcw className="w-3 h-3" /> Restaurar enlace del sitio
                            </button>
                          )}
                        </div>
                        <input
                          type="text"
                          value={selectedBlock.href}
                          onChange={(e) => updateBlock(selectedBlock.id, { href: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 font-mono text-xs"
                          placeholder="https://... o {{form_url}}"
                        />
                        <div className="mt-1.5 bg-blue-50/80 border border-blue-200 rounded-lg p-2 text-[11px] text-blue-900 flex items-start gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-rotary-blue mt-0.5 shrink-0" />
                          <div>
                            <span className="font-bold">Enlace inteligente del sitio: </span>
                            <span className="font-mono text-[10px] text-rotary-blue font-semibold break-all">
                              {siteBranding.rotaryEnAccionUrl || 'https://app.clubplatform.org/rotary-en-accion'}
                            </span>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              Resuelve dinámicamente el dominio público de la organización activa.
                            </p>
                          </div>
                        </div>
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

                      {/* Controles de Tipografía en Botón */}
                      <div className="bg-slate-50/90 border border-slate-200 rounded-xl p-3 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                            <Type className="w-3.5 h-3.5 text-rotary-blue" />
                            Tipografía del Botón
                          </label>
                          <span className="text-[10px] bg-blue-100 text-rotary-blue font-bold px-1.5 py-0.5 rounded">
                            {selectedBlock.fontFamily ? 'Personalizada' : 'Open Sans'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 font-medium block mb-1">Familia Tipográfica</span>
                          <select
                            value={selectedBlock.fontFamily || ''}
                            onChange={(e) => updateBlock(selectedBlock.id, { fontFamily: e.target.value || undefined })}
                            className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs text-slate-900"
                          >
                            <option value="">Predeterminada ({design.settings.font.split(',')[0].replace(/['"]/g, '')})</option>
                            {FONT_OPTIONS.map((f) => (
                              <option key={f.value} value={f.value}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[10px] text-slate-500 font-medium block mb-1">Variante de Peso</span>
                            <select
                              value={String(selectedBlock.fontWeight || '700')}
                              onChange={(e) => updateBlock(selectedBlock.id, { fontWeight: e.target.value as any })}
                              className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs text-slate-900"
                            >
                              {FONT_WEIGHT_OPTIONS.map((w) => (
                                <option key={w.value} value={w.value}>
                                  {w.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 font-medium block mb-1">Tamaño ({selectedBlock.fontSize || 15}px)</span>
                            <input
                              type="number"
                              min={12}
                              max={22}
                              value={selectedBlock.fontSize || 15}
                              onChange={(e) => updateBlock(selectedBlock.id, { fontSize: Number(e.target.value) })}
                              className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs text-slate-900"
                            />
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 font-medium block mb-1">Espaciado de Letras ({selectedBlock.letterSpacing ?? 0.5}px)</span>
                          <input
                            type="number"
                            step={0.5}
                            min={-1}
                            max={3}
                            value={selectedBlock.letterSpacing ?? 0.5}
                            onChange={(e) => updateBlock(selectedBlock.id, { letterSpacing: Number(e.target.value) })}
                            className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs text-slate-900"
                          />
                        </div>
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

                  {/* HTML Propio / Componente Especial */}
                  {selectedBlock.type === 'html' && (() => {
                    const htmlContent = selectedBlock.html || '';
                    const titleMatch = htmlContent.match(/<div style="font-weight:700[^>]*>([^<]+)<\/div>/);
                    const descMatch = htmlContent.match(/<div style="font-size:13\.5px[^>]*>(.*?)<\/div>/s);
                    const noteMatch = htmlContent.match(/<div style="margin-top:10px[^>]*>([^<]+)<\/div>/);

                    const hasDirectorioStructure = Boolean(titleMatch || descMatch);

                    return (
                      <div className="space-y-4">
                        {hasDirectorioStructure && (
                          <div className="space-y-3 bg-white border border-slate-200 rounded-2xl p-3.5 shadow-2xs">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-rotary-blue pb-1 border-b border-slate-100">
                              <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <span>Textos del Componente Institucional</span>
                            </div>

                            {titleMatch && (
                              <div>
                                <label className="text-[11px] font-bold text-slate-700 block mb-1">Título del Módulo</label>
                                <input
                                  type="text"
                                  value={titleMatch[1]}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const updated = htmlContent.replace(
                                      titleMatch[0],
                                      titleMatch[0].replace(titleMatch[1], val)
                                    );
                                    updateBlock(selectedBlock.id, { html: updated });
                                  }}
                                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-xs font-bold text-slate-900 focus:bg-white"
                                />
                              </div>
                            )}

                            {descMatch && (
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-[11px] font-bold text-slate-700">Descripción y Variables</label>
                                  <span className="text-[10px] text-slate-400">Soporta Merge Tags</span>
                                </div>
                                <textarea
                                  rows={4}
                                  value={descMatch[1]}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const updated = htmlContent.replace(
                                      descMatch[0],
                                      descMatch[0].replace(descMatch[1], val)
                                    );
                                    updateBlock(selectedBlock.id, { html: updated });
                                  }}
                                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-xs text-slate-900 font-sans leading-relaxed focus:bg-white"
                                />
                              </div>
                            )}

                            {noteMatch && (
                              <div>
                                <label className="text-[11px] font-bold text-slate-700 block mb-1">Nota al Pie</label>
                                <input
                                  type="text"
                                  value={noteMatch[1]}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const updated = htmlContent.replace(
                                      noteMatch[0],
                                      noteMatch[0].replace(noteMatch[1], val)
                                    );
                                    updateBlock(selectedBlock.id, { html: updated });
                                  }}
                                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-xs text-slate-900 focus:bg-white"
                                />
                              </div>
                            )}
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-bold text-slate-600">Código HTML Fuente (Avanzado)</label>
                            <span className="text-[10px] text-slate-400">Totalmente editable</span>
                          </div>
                          <textarea
                            rows={8}
                            value={selectedBlock.html}
                            onChange={(e) => updateBlock(selectedBlock.id, { html: e.target.value })}
                            className="w-full bg-slate-900 text-slate-100 border border-slate-700 rounded-xl p-2.5 font-mono text-[11px] leading-snug focus:border-rotary-blue focus:ring-1 focus:ring-rotary-blue"
                            placeholder="<div>...</div>"
                          />
                        </div>
                      </div>
                    );
                  })()}

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

                      {/* 1. Cabecera Institucional Adaptable */}
                      {selectedBlock.globalKey === 'rotary_header' && (() => {
                        const branding = resolveInstitutionalLogo(selectedBlock, siteBranding);
                        const isCustom = Boolean(selectedBlock.logoUrl && selectedBlock.logoUrl.trim());
                        const activeAlign = selectedBlock.align || 'center';
                        const currentBg = selectedBlock.bgGradient || selectedBlock.bgColor || '#ffffff';
                        const maxW = typeof selectedBlock.logoMaxWidth === 'number' && selectedBlock.logoMaxWidth > 0 ? selectedBlock.logoMaxWidth : 240;
                        const maxH = typeof selectedBlock.logoMaxHeight === 'number' && selectedBlock.logoMaxHeight > 0 ? selectedBlock.logoMaxHeight : 60;
                        const currentPadding = selectedBlock.padding || '24px 20px';

                        return (
                          <div className="space-y-4">
                            {/* Input oculto para subida de archivo desde equipo */}
                            <input
                              type="file"
                              ref={logoFileInputRef}
                              onChange={handleLogoFileUpload}
                              accept="image/png,image/jpeg,image/webp,image/svg+xml"
                              className="hidden"
                            />

                            {/* Card de Identidad Institucional Inteligente */}
                            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-50/90 via-sky-50/60 to-indigo-50/80 border border-blue-200/80 text-slate-800 shadow-xs space-y-2">
                              <div className="flex items-center justify-between gap-1.5">
                                <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-[#013388] uppercase tracking-wider">
                                  <Building2 className="w-3.5 h-3.5 text-[#013388]" />
                                  <span>Identidad del Sitio Activo</span>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                  isCustom
                                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                                    : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                }`}>
                                  {isCustom ? 'Personalizado' : 'Heredado'}
                                </span>
                              </div>
                              <p className="text-xs font-bold text-slate-900 truncate">
                                {siteBranding.siteName || 'Club Platform'}
                              </p>
                              <p className="text-[11px] text-slate-600 leading-snug">
                                {isCustom
                                  ? 'Esta plantilla tiene un logo exclusivo asignado que sobrescribe el institucional del sitio.'
                                  : (siteBranding.siteLogo
                                    ? 'Resolviendo dinámicamente el logo institucional configurado en los ajustes del sitio.'
                                    : (siteBranding.isMainPlatform
                                      ? 'Entorno central: mostrando la identidad oficial de Club Platform.'
                                      : 'Mostrando tipografía institucional limpia con el nombre oficial del sitio.'))}
                              </p>
                            </div>

                            {/* Selector y Carga de Logo */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <label className="text-[11px] font-bold text-slate-700">Logo Institucional</label>
                                {isCustom && (
                                  <button
                                    type="button"
                                    onClick={() => updateBlock(selectedBlock.id, { logoUrl: '' })}
                                    className="text-[11px] text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1"
                                    title="Restaurar al logo institucional predeterminado del sitio"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    <span>Restaurar Logo del Sitio</span>
                                  </button>
                                )}
                              </div>

                              <div className="flex gap-1.5">
                                <input
                                  type="text"
                                  value={selectedBlock.logoUrl || ''}
                                  onChange={(e) => updateBlock(selectedBlock.id, { logoUrl: e.target.value })}
                                  className="flex-1 bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs"
                                  placeholder={siteBranding.siteLogo ? 'Usando logo predeterminado del sitio...' : 'URL de logo o subir...'}
                                />
                                <button
                                  type="button"
                                  onClick={() => openMediaPickerFor((url) => updateBlock(selectedBlock.id, { logoUrl: url }))}
                                  className="px-2.5 py-2 bg-rotary-blue hover:bg-blue-700 text-white rounded-xl font-bold text-xs shrink-0 shadow-xs flex items-center gap-1"
                                  title="Elegir desde la Biblioteca Multimedia"
                                >
                                  <ImageIcon className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">Biblioteca</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={uploadingLogo}
                                  onClick={() => logoFileInputRef.current?.click()}
                                  className="px-2.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shrink-0 shadow-xs flex items-center gap-1 disabled:opacity-50"
                                  title="Subir logo desde este equipo"
                                >
                                  {uploadingLogo ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                  <span className="hidden sm:inline">Subir</span>
                                </button>
                              </div>

                              {/* Vista previa en miniatura del logo resuelto */}
                              <div className="p-3 border border-slate-200 rounded-xl bg-slate-50 text-center flex flex-col items-center justify-center min-h-[70px]">
                                {branding.url ? (
                                  <img
                                    src={branding.url}
                                    alt="Vista Previa Logo"
                                    className="max-h-14 max-w-[220px] w-auto h-auto object-contain mx-auto transition-transform"
                                  />
                                ) : (
                                  <span className="text-base font-extrabold text-[#013388] tracking-tight uppercase">
                                    {branding.text || siteBranding.siteName || 'Identidad Institucional'}
                                  </span>
                                )}
                                <span className="text-[10px] text-slate-500 mt-1 font-medium">
                                  {branding.source === 'template_custom' ? 'Logo personalizado para esta plantilla' :
                                    branding.source === 'site_settings' ? 'Logo oficial del sitio activo' :
                                    branding.source === 'platform_default' ? 'Logo oficial de Club Platform' : 'Tipografía institucional'}
                                </span>
                              </div>

                              {/* Botón para definir como logo predeterminado del sitio si hay un logo personalizado */}
                              {isCustom && selectedBlock.logoUrl && (
                                <button
                                  type="button"
                                  disabled={savingSiteLogo}
                                  onClick={() => handleSetAsSiteDefaultLogo(selectedBlock.logoUrl!)}
                                  className="w-full py-1.5 px-3 rounded-xl bg-slate-100 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-700 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                                >
                                  {savingSiteLogo ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                                  <span>Definir como logo predeterminado del sitio</span>
                                </button>
                              )}
                            </div>

                            {/* Dimensiones y Proporciones */}
                            <div className="space-y-2 pt-1 border-t border-slate-200">
                              <label className="text-[11px] font-bold text-slate-700 block">Dimensiones del Logo</label>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1">
                                    <span>Ancho Máx</span>
                                    <span className="font-mono font-bold text-slate-900">{maxW}px</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="80"
                                    max="400"
                                    step="10"
                                    value={maxW}
                                    onChange={(e) => updateBlock(selectedBlock.id, { logoMaxWidth: Number(e.target.value) })}
                                    className="w-full accent-rotary-blue cursor-pointer"
                                  />
                                </div>
                                <div>
                                  <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1">
                                    <span>Alto Máx</span>
                                    <span className="font-mono font-bold text-slate-900">{maxH}px</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="24"
                                    max="140"
                                    step="4"
                                    value={maxH}
                                    onChange={(e) => updateBlock(selectedBlock.id, { logoMaxHeight: Number(e.target.value) })}
                                    className="w-full accent-rotary-blue cursor-pointer"
                                  />
                                </div>
                              </div>
                              <p className="text-[10px] text-slate-500 leading-tight">
                                Conserva 100% las proporciones y calidad original del logo sin deformaciones ni regeneraciones.
                              </p>
                            </div>

                            {/* Alineación */}
                            <div className="space-y-1.5 pt-1 border-t border-slate-200">
                              <label className="text-[11px] font-bold text-slate-700 block">Alineación del Logo</label>
                              <div className="grid grid-cols-3 gap-1.5">
                                {[
                                  { id: 'left', label: 'Izquierda', icon: AlignLeft },
                                  { id: 'center', label: 'Centro', icon: AlignCenter },
                                  { id: 'right', label: 'Derecha', icon: AlignRight }
                                ].map((opt) => {
                                  const IconComponent = opt.icon;
                                  const isActive = activeAlign === opt.id;
                                  return (
                                    <button
                                      key={opt.id}
                                      type="button"
                                      onClick={() => updateBlock(selectedBlock.id, { align: opt.id as Align })}
                                      className={`py-1.5 px-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                                        isActive
                                          ? 'bg-blue-50 border-rotary-blue text-rotary-blue ring-1 ring-rotary-blue'
                                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                      }`}
                                    >
                                      <IconComponent className="w-3.5 h-3.5" />
                                      <span>{opt.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Fondo de Cabecera */}
                            <div className="space-y-2 pt-1 border-t border-slate-200">
                              <label className="text-[11px] font-bold text-slate-700 block">Fondo de Cabecera</label>
                              <div className="grid grid-cols-2 gap-1.5">
                                {[
                                  { label: 'Blanco Limpio', val: '#ffffff' },
                                  { label: 'Gris Sutil', val: '#f8fafc' },
                                  { label: 'Azul Oficial', val: '#013388' },
                                  { label: 'Azul Marino', val: '#0c2340' },
                                  { label: 'Degradado Rotary', val: 'linear-gradient(135deg, #013388 0%, #0c2340 100%)' }
                                ].map((preset) => (
                                  <button
                                    key={preset.label}
                                    type="button"
                                    onClick={() => updateBlock(selectedBlock.id, { bgGradient: preset.val.includes('gradient') ? preset.val : '', bgColor: preset.val })}
                                    className={`p-1.5 text-[10px] font-bold rounded-lg border text-left transition-all truncate ${
                                      currentBg === preset.val
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
                                value={selectedBlock.bgGradient || selectedBlock.bgColor || '#ffffff'}
                                onChange={(e) => updateBlock(selectedBlock.id, { bgGradient: e.target.value.includes('gradient') ? e.target.value : '', bgColor: e.target.value })}
                                className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs font-mono"
                                placeholder="#ffffff o linear-gradient(...)"
                              />
                            </div>

                            {/* Espaciado Vertical (Padding) */}
                            <div className="space-y-1.5 pt-1 border-t border-slate-200">
                              <label className="text-[11px] font-bold text-slate-700 block">Espaciado Vertical (Padding)</label>
                              <div className="grid grid-cols-2 gap-1.5">
                                {[
                                  { label: 'Compacto (16px)', val: '16px 20px' },
                                  { label: 'Estándar (24px)', val: '24px 20px' },
                                  { label: 'Amplio (32px)', val: '32px 24px' },
                                  { label: 'Elegante (40px)', val: '40px 24px' }
                                ].map((pad) => (
                                  <button
                                    key={pad.label}
                                    type="button"
                                    onClick={() => updateBlock(selectedBlock.id, { padding: pad.val })}
                                    className={`p-1.5 text-[10px] font-bold rounded-lg border text-left transition-all truncate ${
                                      currentPadding === pad.val
                                        ? 'border-rotary-blue bg-blue-50 text-rotary-blue ring-1 ring-rotary-blue'
                                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                    }`}
                                  >
                                    {pad.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Restaurar Identidad Institucional Predeterminada */}
                            <div className="pt-2 border-t border-slate-200">
                              <button
                                type="button"
                                onClick={() => {
                                  updateBlock(selectedBlock.id, {
                                    logoUrl: '',
                                    logoMaxWidth: 240,
                                    logoMaxHeight: 60,
                                    align: 'center',
                                    bgColor: '#ffffff',
                                    bgGradient: '',
                                    padding: '24px 20px'
                                  });
                                  toast.success('Cabecera institucional restaurada a valores predeterminados');
                                }}
                                className="w-full py-2 px-3 rounded-xl border border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-900 text-xs font-bold flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 transition-colors"
                              >
                                <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                                <span>Restaurar Identidad Institucional</span>
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                      {/* 2. Pie de Página Oficial Rotary */}
                      {selectedBlock.globalKey === 'rotary_footer' && (
                        <div className="space-y-4">
                          {/* SECCIÓN 1: FONDO DEL FOOTER */}
                          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                <Palette className="w-3.5 h-3.5 text-rotary-blue" />
                                <span>Fondo del Footer</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const ctaBlock = design.blocks.find(b => b.type === 'global' && (b as GlobalBlockItem).globalKey === 'club_platform_cta') as GlobalBlockItem | undefined;
                                  const targetBg = ctaBlock?.bgGradientEnd || ctaBlock?.bgColor || '#0c2340';
                                  updateBlock(selectedBlock.id, { bgColor: targetBg });
                                }}
                                className="text-[10px] font-bold text-rotary-blue hover:text-blue-800 flex items-center gap-1"
                                title="Unifica el fondo con el color inferior del CTA para una transición continua y perfecta"
                              >
                                <Sparkles className="w-3 h-3 text-amber-500" />
                                <span>Unificar con CTA</span>
                              </button>
                            </div>

                            <ColorPickerInput
                              label="Color de Fondo Institucional"
                              value={selectedBlock.bgColor || '#0c2340'}
                              onChange={(hex) => updateBlock(selectedBlock.id, { bgColor: hex })}
                              helpText="Color sólido continuo del pie de página institucional."
                            />
                          </div>

                          {/* SECCIÓN 2: LOGOTIPO INSTITUCIONAL */}
                          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                <ImageIcon className="w-3.5 h-3.5 text-rotary-blue" />
                                <span>Logotipo Institucional</span>
                              </span>
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
                                placeholder="URL de logo (dejar vacío para logo blanco oficial de Rotary)..."
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

                          {/* SECCIÓN 3: TÍTULOS Y COLORES DE TEXTO */}
                          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                              <Type className="w-3.5 h-3.5 text-rotary-blue" />
                              <span>Textos y Colores</span>
                            </span>

                            <div>
                              <label className="text-[11px] font-bold text-slate-700 block mb-1">Título de Pie</label>
                              <input
                                type="text"
                                value={selectedBlock.title !== undefined ? selectedBlock.title : '¡Síguenos y comparte el orgullo rotario!'}
                                onChange={(e) => updateBlock(selectedBlock.id, { title: e.target.value })}
                                className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs font-bold"
                              />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <ColorPickerInput
                                label="Color del Título"
                                value={selectedBlock.titleColor || '#ffffff'}
                                onChange={(hex) => updateBlock(selectedBlock.id, { titleColor: hex })}
                              />
                              <ColorPickerInput
                                label="Color de Textos Legales"
                                value={selectedBlock.textColor || '#94a3b8'}
                                onChange={(hex) => updateBlock(selectedBlock.id, { textColor: hex })}
                              />
                            </div>

                            <ColorPickerInput
                              label="Color de Enlaces (Desuscripción / Preferencias)"
                              value={selectedBlock.linkColor || '#cbd5e1'}
                              onChange={(hex) => updateBlock(selectedBlock.id, { linkColor: hex })}
                            />
                          </div>

                          {/* Toggles de Contenido */}
                          <div className="space-y-2 pt-2 border-t border-slate-200">
                            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                              <input
                                type="checkbox"
                                checked={selectedBlock.showAreas !== false}
                                onChange={(e) => updateBlock(selectedBlock.id, { showAreas: e.target.checked })}
                                className="rounded border-slate-300 text-rotary-blue focus:ring-rotary-blue"
                              />
                              <span>Mostrar insignias de las 7 Áreas de Interés</span>
                            </label>
                          </div>

                          {/* GESTOR OFICIAL DE REDES SOCIALES */}
                          <div className="pt-2 border-t border-slate-200 space-y-3">
                            <div className="flex items-center justify-between">
                              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
                                <input
                                  type="checkbox"
                                  checked={selectedBlock.showSocial !== false}
                                  onChange={(e) => updateBlock(selectedBlock.id, { showSocial: e.target.checked })}
                                  className="rounded border-slate-300 text-rotary-blue focus:ring-rotary-blue"
                                />
                                <span>Redes Sociales Oficiales</span>
                              </label>
                              {selectedBlock.showSocial !== false && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const links: FooterSocialLink[] = [];
                                    const sc = siteClub || {};
                                    const soc = sc.socialNetworks || sc.social || {};
                                    const ig = soc.instagram || sc.instagram;
                                    if (ig) links.push({ network: 'instagram', url: ig.startsWith('http') ? ig : `https://instagram.com/${ig.replace('@', '')}`, label: 'Instagram' });
                                    const fb = soc.facebook || sc.facebook;
                                    if (fb) links.push({ network: 'facebook', url: fb.startsWith('http') ? fb : `https://facebook.com/${fb}`, label: 'Facebook' });
                                    const yt = soc.youtube || sc.youtube;
                                    if (yt) links.push({ network: 'youtube', url: yt.startsWith('http') ? yt : `https://youtube.com/${yt}`, label: 'YouTube' });
                                    const li = soc.linkedin || sc.linkedin;
                                    if (li) links.push({ network: 'linkedin', url: li.startsWith('http') ? li : `https://linkedin.com/in/${li}`, label: 'LinkedIn' });
                                    const x = soc.x || soc.twitter || sc.x || sc.twitter;
                                    if (x) links.push({ network: 'x', url: x.startsWith('http') ? x : `https://x.com/${x.replace('@', '')}`, label: 'X (Twitter)' });
                                    const tt = soc.tiktok || sc.tiktok;
                                    if (tt) links.push({ network: 'tiktok', url: tt.startsWith('http') ? tt : `https://tiktok.com/@${tt.replace('@', '')}`, label: 'TikTok' });
                                    const wa = soc.whatsapp || sc.whatsapp || sc.phone;
                                    if (wa) {
                                      const cleanWa = String(wa).replace(/\D/g, '');
                                      if (cleanWa) links.push({ network: 'whatsapp', url: `https://wa.me/${cleanWa}`, label: 'WhatsApp' });
                                    }
                                    const web = sc.publicUrl || (siteBranding.domain ? `https://${siteBranding.domain}` : siteBranding.rotaryEnAccionUrl);
                                    if (web) links.push({ network: 'web', url: web, label: siteBranding.siteName || 'Sitio Oficial' });
                                    const finalLinks = links.length > 0 ? links : DEFAULT_FOOTER_SOCIAL_LINKS;
                                    updateBlock(selectedBlock.id, { socialLinks: finalLinks });
                                    toast.success('Redes sociales cargadas según el sitio activo');
                                  }}
                                  className="text-[10px] font-bold text-rotary-blue hover:text-blue-800 flex items-center gap-1"
                                  title="Cargar automáticamente las redes sociales configuradas para el sitio activo"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  <span>Cargar del sitio</span>
                                </button>
                              )}
                            </div>

                            {selectedBlock.showSocial !== false && (
                              <div className="space-y-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                {/* Estilo de Iconos */}
                                <div>
                                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Estilo de Iconos</label>
                                  <div className="grid grid-cols-3 gap-1.5 p-1 bg-white border border-slate-200 rounded-xl">
                                    {(['white', 'black', 'color'] as SocialIconStyle[]).map((st) => {
                                      const currentSt = selectedBlock.socialIconStyle || 'white';
                                      const isSel = currentSt === st;
                                      const labels: Record<SocialIconStyle, string> = {
                                        white: 'Blanco',
                                        black: 'Negro',
                                        color: 'Color Oficial'
                                      };
                                      return (
                                        <button
                                          key={st}
                                          type="button"
                                          onClick={() => updateBlock(selectedBlock.id, { socialIconStyle: st })}
                                          className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all ${
                                            isSel
                                              ? 'bg-rotary-blue text-white shadow-xs'
                                              : 'text-slate-600 hover:bg-slate-100'
                                          }`}
                                        >
                                          {labels[st]}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Tamaño y Separación */}
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <div className="flex justify-between items-center mb-1">
                                      <label className="text-[11px] font-bold text-slate-700">Tamaño</label>
                                      <span className="text-[10px] font-mono text-slate-500 font-bold">{selectedBlock.socialIconSize || 28}px</span>
                                    </div>
                                    <input
                                      type="range"
                                      min={18}
                                      max={40}
                                      step={2}
                                      value={selectedBlock.socialIconSize || 28}
                                      onChange={(e) => updateBlock(selectedBlock.id, { socialIconSize: Number(e.target.value) })}
                                      className="w-full accent-rotary-blue cursor-pointer"
                                    />
                                  </div>
                                  <div>
                                    <div className="flex justify-between items-center mb-1">
                                      <label className="text-[11px] font-bold text-slate-700">Separación</label>
                                      <span className="text-[10px] font-mono text-slate-500 font-bold">{selectedBlock.socialIconGap || 12}px</span>
                                    </div>
                                    <input
                                      type="range"
                                      min={4}
                                      max={24}
                                      step={2}
                                      value={selectedBlock.socialIconGap || 12}
                                      onChange={(e) => updateBlock(selectedBlock.id, { socialIconGap: Number(e.target.value) })}
                                      className="w-full accent-rotary-blue cursor-pointer"
                                    />
                                  </div>
                                </div>

                                {/* Lista de redes configuradas */}
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <label className="text-[11px] font-bold text-slate-700">Redes Activas</label>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const current: FooterSocialLink[] = Array.isArray(selectedBlock.socialLinks) && selectedBlock.socialLinks.length > 0
                                          ? [...selectedBlock.socialLinks]
                                          : [...DEFAULT_FOOTER_SOCIAL_LINKS];
                                        current.push({ network: 'instagram', url: 'https://instagram.com', label: 'Instagram' });
                                        updateBlock(selectedBlock.id, { socialLinks: current });
                                      }}
                                      className="text-[10px] font-bold text-rotary-blue hover:text-blue-800 flex items-center gap-0.5"
                                    >
                                      <Plus className="w-3 h-3" />
                                      <span>Añadir red</span>
                                    </button>
                                  </div>

                                  {(() => {
                                    const links: FooterSocialLink[] = Array.isArray(selectedBlock.socialLinks) && selectedBlock.socialLinks.length > 0
                                      ? selectedBlock.socialLinks
                                      : DEFAULT_FOOTER_SOCIAL_LINKS;
                                    const iconStyle = selectedBlock.socialIconStyle || 'white';

                                    return links.map((link, idx) => {
                                      const net = (link.network || 'web').toLowerCase();
                                      const isCustom = net === 'custom';
                                      const iconSrc = link.customIconUrl
                                        ? link.customIconUrl
                                        : `/icons/social/${encodeURIComponent(net)}-${iconStyle}.png`;

                                      return (
                                        <div key={idx} className="p-2 bg-white border border-slate-200 rounded-xl space-y-1.5 shadow-2xs">
                                          <div className="flex items-center gap-1.5">
                                            {/* Preview del icono */}
                                            <div className="w-6 h-6 rounded-md bg-slate-800 flex items-center justify-center shrink-0 p-0.5 overflow-hidden">
                                              <img
                                                src={iconSrc}
                                                alt={link.label || net}
                                                className="w-5 h-5 object-contain"
                                                onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/icons/social/web-color.png'; }}
                                              />
                                            </div>

                                            {/* Selector de Red */}
                                            <select
                                              value={link.network || 'instagram'}
                                              onChange={(e) => {
                                                const next = [...links];
                                                next[idx] = { ...next[idx], network: e.target.value, label: e.target.value.toUpperCase() };
                                                updateBlock(selectedBlock.id, { socialLinks: next });
                                              }}
                                              className="bg-white border border-slate-200 rounded-lg py-1 px-1.5 text-xs font-bold text-slate-800 w-28 shrink-0"
                                            >
                                              <option value="instagram">Instagram</option>
                                              <option value="facebook">Facebook</option>
                                              <option value="youtube">YouTube</option>
                                              <option value="linkedin">LinkedIn</option>
                                              <option value="tiktok">TikTok</option>
                                              <option value="x">X (Twitter)</option>
                                              <option value="whatsapp">WhatsApp</option>
                                              <option value="web">Sitio Web</option>
                                              <option value="custom">Personalizado</option>
                                            </select>

                                            {/* Input URL */}
                                            <input
                                              type="text"
                                              value={link.url || ''}
                                              onChange={(e) => {
                                                const next = [...links];
                                                next[idx] = { ...next[idx], url: e.target.value };
                                                updateBlock(selectedBlock.id, { socialLinks: next });
                                              }}
                                              placeholder="https://..."
                                              className="flex-1 bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs font-mono text-slate-800"
                                            />

                                            {/* Acciones: Subir, Bajar, Eliminar */}
                                            <div className="flex items-center gap-0.5 shrink-0">
                                              <button
                                                type="button"
                                                disabled={idx === 0}
                                                onClick={() => {
                                                  if (idx === 0) return;
                                                  const next = [...links];
                                                  const temp = next[idx - 1];
                                                  next[idx - 1] = next[idx];
                                                  next[idx] = temp;
                                                  updateBlock(selectedBlock.id, { socialLinks: next });
                                                }}
                                                className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                                                title="Subir"
                                              >
                                                <ArrowUp className="w-3.5 h-3.5" />
                                              </button>
                                              <button
                                                type="button"
                                                disabled={idx === links.length - 1}
                                                onClick={() => {
                                                  if (idx === links.length - 1) return;
                                                  const next = [...links];
                                                  const temp = next[idx + 1];
                                                  next[idx + 1] = next[idx];
                                                  next[idx] = temp;
                                                  updateBlock(selectedBlock.id, { socialLinks: next });
                                                }}
                                                className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                                                title="Bajar"
                                              >
                                                <ArrowDown className="w-3.5 h-3.5" />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const next = links.filter((_, i) => i !== idx);
                                                  updateBlock(selectedBlock.id, { socialLinks: next });
                                                }}
                                                className="p-1 text-rose-500 hover:text-rose-700"
                                                title="Eliminar red"
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </button>
                                            </div>
                                          </div>

                                          {/* Si es personalizado, permitir cargar imagen de icono */}
                                          {isCustom && (
                                            <div className="flex gap-2 pt-1 border-t border-slate-100">
                                              <input
                                                type="text"
                                                value={link.customIconUrl || ''}
                                                onChange={(e) => {
                                                  const next = [...links];
                                                  next[idx] = { ...next[idx], customIconUrl: e.target.value };
                                                  updateBlock(selectedBlock.id, { socialLinks: next });
                                                }}
                                                placeholder="URL icono PNG..."
                                                className="flex-1 bg-white border border-slate-200 rounded-lg p-1 text-xs"
                                              />
                                              <button
                                                type="button"
                                                onClick={() => openMediaPickerFor((url) => {
                                                  const next = [...links];
                                                  next[idx] = { ...next[idx], customIconUrl: url };
                                                  updateBlock(selectedBlock.id, { socialLinks: next });
                                                })}
                                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold"
                                              >
                                                Icono
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    });
                                  })()}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* PERSONALIZACIÓN COMPLETA DE WHATSAPP */}
                          <div className="pt-2 border-t border-slate-200 space-y-2.5">
                            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
                              <input
                                type="checkbox"
                                checked={selectedBlock.showWhatsapp !== false}
                                onChange={(e) => updateBlock(selectedBlock.id, { showWhatsapp: e.target.checked })}
                                className="rounded border-slate-300 text-rotary-blue focus:ring-rotary-blue"
                              />
                              <span>Enlace de Asistencia WhatsApp</span>
                            </label>

                            {selectedBlock.showWhatsapp !== false && (
                              <div className="space-y-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                                  <input
                                    type="checkbox"
                                    checked={selectedBlock.showWhatsappIcon !== false}
                                    onChange={(e) => updateBlock(selectedBlock.id, { showWhatsappIcon: e.target.checked })}
                                    className="rounded border-slate-300 text-rotary-blue focus:ring-rotary-blue"
                                  />
                                  <span>Mostrar icono oficial de WhatsApp</span>
                                </label>

                                <div>
                                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Texto del Enlace</label>
                                  <input
                                    type="text"
                                    value={selectedBlock.whatsappText || 'Asistencia directa a través de WhatsApp'}
                                    onChange={(e) => updateBlock(selectedBlock.id, { whatsappText: e.target.value })}
                                    className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs font-medium"
                                    placeholder="Texto del enlace..."
                                  />
                                </div>

                                <div>
                                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Destino (URL o Número)</label>
                                  <input
                                    type="text"
                                    value={selectedBlock.whatsappUrl !== undefined ? selectedBlock.whatsappUrl : 'https://wa.me/573108520231'}
                                    onChange={(e) => updateBlock(selectedBlock.id, { whatsappUrl: e.target.value })}
                                    className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs font-mono"
                                    placeholder="https://wa.me/57..."
                                  />
                                </div>

                                {/* Color del texto y enlace de WhatsApp */}
                                <ColorPickerInput
                                  label="Color del Enlace WhatsApp"
                                  value={selectedBlock.whatsappColor || '#ffffff'}
                                  onChange={(hex) => updateBlock(selectedBlock.id, { whatsappColor: hex })}
                                  presets={[
                                    { label: 'Blanco', value: '#FFFFFF' },
                                    { label: 'Celeste', value: '#38BDF8' },
                                    { label: 'Verde WA', value: '#25D366' },
                                    { label: 'Dorado', value: '#F7A81B' },
                                  ]}
                                />

                                {/* Tamaño y Peso tipográfico */}
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[11px] font-bold text-slate-700 block mb-1">Tamaño Fuente</label>
                                    <select
                                      value={selectedBlock.whatsappFontSize || 13}
                                      onChange={(e) => updateBlock(selectedBlock.id, { whatsappFontSize: Number(e.target.value) })}
                                      className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-bold"
                                    >
                                      <option value={11}>11px</option>
                                      <option value={12}>12px</option>
                                      <option value={13}>13px (Default)</option>
                                      <option value={14}>14px</option>
                                      <option value={15}>15px</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-[11px] font-bold text-slate-700 block mb-1">Peso Tipográfico</label>
                                    <select
                                      value={selectedBlock.whatsappFontWeight || '600'}
                                      onChange={(e) => updateBlock(selectedBlock.id, { whatsappFontWeight: e.target.value as any })}
                                      className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-bold"
                                    >
                                      <option value="400">Normal (400)</option>
                                      <option value="600">Seminegrita (600)</option>
                                      <option value="700">Negrita (700)</option>
                                    </select>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Texto Institucional y Legal */}
                          <div className="pt-2 border-t border-slate-200">
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

                      {/* 4. Categorías Oficiales de Rotary en Acción */}
                      {(selectedBlock.globalKey === 'rotary_areas_focus' || selectedBlock.globalKey === 'rotary_categories') && (
                        <div className="space-y-3.5">
                          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900">
                            <div className="font-bold flex items-center gap-1.5 mb-1 text-rotary-blue">
                              <Sparkles className="w-3.5 h-3.5" />
                              Categorías Oficiales Rotary en Acción
                            </div>
                            <p className="text-[11px] text-slate-600 leading-relaxed">
                              Sincronizadas automáticamente con el formulario público activo. Se presentan en un formato compacto de 5 filas x 3 columnas adaptable a móviles y compatible con todos los clientes de correo.
                            </p>
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-700 block mb-1">Título de Sección</label>
                            <input
                              type="text"
                              value={selectedBlock.title || '¿Qué puede compartir tu club en Rotary en Acción?'}
                              onChange={(e) => updateBlock(selectedBlock.id, { title: e.target.value })}
                              className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs font-semibold"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-700 block mb-1">Subtítulo / Instrucción</label>
                            <input
                              type="text"
                              value={selectedBlock.subtitle !== undefined ? selectedBlock.subtitle : 'El formulario unificado se adapta a lo que elijas para visibilizar el impacto de tu club:'}
                              onChange={(e) => updateBlock(selectedBlock.id, { subtitle: e.target.value })}
                              className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[11px] font-bold text-slate-700 block mb-1">Color Fondo</label>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="color"
                                  value={selectedBlock.bgColor || '#f8fafc'}
                                  onChange={(e) => updateBlock(selectedBlock.id, { bgColor: e.target.value })}
                                  className="w-8 h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5"
                                />
                                <input
                                  type="text"
                                  value={selectedBlock.bgColor || '#f8fafc'}
                                  onChange={(e) => updateBlock(selectedBlock.id, { bgColor: e.target.value })}
                                  className="flex-1 bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-mono"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-slate-700 block mb-1">Color Título</label>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="color"
                                  value={selectedBlock.textColor || '#013388'}
                                  onChange={(e) => updateBlock(selectedBlock.id, { textColor: e.target.value })}
                                  className="w-8 h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5"
                                />
                                <input
                                  type="text"
                                  value={selectedBlock.textColor || '#013388'}
                                  onChange={(e) => updateBlock(selectedBlock.id, { textColor: e.target.value })}
                                  className="flex-1 bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-mono"
                                />
                              </div>
                            </div>
                          </div>
                          <div className="border border-slate-200 rounded-xl p-2.5 bg-slate-50">
                            <div className="text-[11px] font-bold text-slate-700 mb-2">15 Categorías Oficiales del Formulario:</div>
                            <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto pr-1">
                              {DEFAULT_TIPOS.map((t) => (
                                <div key={t.slug} className="text-[10px] bg-white border border-slate-200 rounded px-2 py-1 text-slate-800 font-medium truncate flex items-center gap-1">
                                  <span>{t.icon}</span> <span>{t.shortName || t.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 5. CTA Promocional Club Platform (Shopify-style) */}
                      {selectedBlock.globalKey === 'club_platform_cta' && (
                        <div className="space-y-4">
                          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-indigo-50/90 via-blue-50/60 to-amber-50/60 border border-blue-200/80 text-slate-800 shadow-xs space-y-2">
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-[#013388] uppercase tracking-wider">
                                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                <span>Bloque Promocional Club Platform</span>
                              </div>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                selectedBlock.enabled !== false
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : 'bg-slate-100 text-slate-600 border-slate-300'
                              }`}>
                                {selectedBlock.enabled !== false ? 'Activo' : 'Oculto'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 leading-snug">
                              Componente continuo con el Footer para potenciar el ecosistema digital de nuevos clubes rotarios.
                            </p>
                          </div>

                          {/* Interruptor de activación */}
                          <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                            <div>
                              <div className="text-xs font-bold text-slate-800">Mostrar CTA en la campaña</div>
                              <div className="text-[10px] text-slate-500">Si está inactivo, no se incluirá en el correo final.</div>
                            </div>
                            <input
                              type="checkbox"
                              checked={selectedBlock.enabled !== false}
                              onChange={(e) => updateBlock(selectedBlock.id, { enabled: e.target.checked })}
                              className="w-4 h-4 accent-rotary-blue rounded cursor-pointer"
                            />
                          </div>

                          {/* SECCIÓN 1: FONDO Y DEGRADADO */}
                          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                <Palette className="w-3.5 h-3.5 text-rotary-blue" />
                                <span>Fondo y Degradado</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const footerBlock = design.blocks.find(b => b.type === 'global' && (b as GlobalBlockItem).globalKey === 'rotary_footer') as GlobalBlockItem | undefined;
                                  const targetBg = footerBlock?.bgColor || '#0c2340';
                                  updateBlock(selectedBlock.id, {
                                    bgType: 'solid',
                                    bgColor: targetBg,
                                    bgGradientStart: targetBg,
                                    bgGradientEnd: targetBg,
                                  });
                                  toast.success(`Fondo alineado con el Footer (${targetBg})`);
                                }}
                                className="text-[10px] font-bold text-rotary-blue hover:text-blue-800 flex items-center gap-1"
                                title="Alinea el fondo con el Footer para una continuidad visual perfecta"
                              >
                                <Sparkles className="w-3 h-3 text-amber-500" />
                                <span>Unificar con Footer</span>
                              </button>
                            </div>

                            {/* Switch Sólido vs Degradado */}
                            <div className="grid grid-cols-2 gap-1.5 p-1 bg-white border border-slate-200 rounded-xl">
                              <button
                                type="button"
                                onClick={() => updateBlock(selectedBlock.id, { bgType: 'gradient' })}
                                className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
                                  (selectedBlock.bgType || 'gradient') === 'gradient'
                                    ? 'bg-rotary-blue text-white shadow-xs'
                                    : 'text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                Degradado
                              </button>
                              <button
                                type="button"
                                onClick={() => updateBlock(selectedBlock.id, { bgType: 'solid' })}
                                className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
                                  selectedBlock.bgType === 'solid'
                                    ? 'bg-rotary-blue text-white shadow-xs'
                                    : 'text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                Color Sólido
                              </button>
                            </div>

                            {/* Controles si es Degradado */}
                            {(selectedBlock.bgType || 'gradient') === 'gradient' && (
                              <div className="space-y-3 pt-1">
                                {/* Preset rápido institucional Rotary */}
                                <div className="flex items-center justify-between pb-1 border-b border-slate-200/80">
                                  <span className="text-[10px] font-bold text-slate-500">Preset Oficial Rotary:</span>
                                  <button
                                    type="button"
                                    onClick={() => updateBlock(selectedBlock.id, {
                                      bgType: 'gradient',
                                      bgGradientType: 'linear',
                                      bgGradientAngle: 180,
                                      bgGradientStart: '#013388',
                                      bgGradientEnd: '#0C2340',
                                      bgColor: '#0C2340',
                                    })}
                                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-rotary-blue border border-blue-200 hover:bg-blue-100 flex items-center gap-1"
                                  >
                                    <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-b from-[#013388] to-[#0C2340] border border-black/10 inline-block" />
                                    <span>Azul #013388 → Marino #0C2340</span>
                                  </button>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <ColorPickerInput
                                    label="Color Inicial (Superior)"
                                    value={selectedBlock.bgGradientStart || '#013388'}
                                    onChange={(hex) => updateBlock(selectedBlock.id, { bgGradientStart: hex })}
                                  />
                                  <ColorPickerInput
                                    label="Color Final (Inferior)"
                                    value={selectedBlock.bgGradientEnd || '#0c2340'}
                                    onChange={(hex) => updateBlock(selectedBlock.id, { bgGradientEnd: hex, bgColor: hex })}
                                  />
                                </div>

                                <div className="grid grid-cols-2 gap-2 pt-1">
                                  <div>
                                    <label className="text-[11px] font-bold text-slate-700 block mb-1">Tipo Degradado</label>
                                    <select
                                      value={selectedBlock.bgGradientType || 'linear'}
                                      onChange={(e) => updateBlock(selectedBlock.id, { bgGradientType: e.target.value as 'linear' | 'radial' })}
                                      className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs text-slate-800 font-medium"
                                    >
                                      <option value="linear">Lineal</option>
                                      <option value="radial">Radial</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-[11px] font-bold text-slate-700 block mb-1">Dirección / Ángulo</label>
                                    <select
                                      disabled={(selectedBlock.bgGradientType || 'linear') === 'radial'}
                                      value={selectedBlock.bgGradientAngle ?? 180}
                                      onChange={(e) => updateBlock(selectedBlock.id, { bgGradientAngle: Number(e.target.value) })}
                                      className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs text-slate-800 font-medium disabled:opacity-40"
                                    >
                                      <option value={180}>180° (Arriba → Abajo)</option>
                                      <option value={90}>90° (Izquierda → Derecha)</option>
                                      <option value={135}>135° (Diagonal)</option>
                                      <option value={0}>0° (Abajo → Arriba)</option>
                                      <option value={270}>270° (Derecha → Izquierda)</option>
                                    </select>
                                  </div>
                                </div>

                                {/* Color Sólido de Respaldo Fallback para Outlook */}
                                <ColorPickerInput
                                  label="Color de Respaldo Fallback (Outlook y Clientes sin CSS3)"
                                  value={selectedBlock.bgColor || selectedBlock.bgGradientEnd || '#0c2340'}
                                  onChange={(hex) => updateBlock(selectedBlock.id, { bgColor: hex })}
                                  helpText="Utilizado como alternativa en clientes que no procesan degradados CSS."
                                />
                              </div>
                            )}

                            {/* Controles si es Fondo Sólido */}
                            {selectedBlock.bgType === 'solid' && (
                              <ColorPickerInput
                                label="Color de Fondo Sólido"
                                value={selectedBlock.bgColor || '#0c2340'}
                                onChange={(hex) => updateBlock(selectedBlock.id, { bgColor: hex, bgGradientStart: hex, bgGradientEnd: hex })}
                              />
                            )}
                          </div>

                          {/* SECCIÓN 2: TIPOGRAFÍA Y TEXTOS */}
                          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                              <Type className="w-3.5 h-3.5 text-rotary-blue" />
                              <span>Textos y Tipografía</span>
                            </span>

                            <div>
                              <label className="text-[11px] font-bold text-slate-700 block mb-1">Título Destacado</label>
                              <input
                                type="text"
                                value={selectedBlock.title ?? '¡Activa el ecosistema digital de tu club!'}
                                onChange={(e) => updateBlock(selectedBlock.id, { title: e.target.value })}
                                className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs font-bold"
                                placeholder="¡Activa el ecosistema digital de tu club!"
                              />
                            </div>

                            <ColorPickerInput
                              label="Color del Título"
                              value={selectedBlock.titleColor || selectedBlock.textColor || '#ffffff'}
                              onChange={(hex) => updateBlock(selectedBlock.id, { titleColor: hex })}
                            />

                            <div>
                              <label className="text-[11px] font-bold text-slate-700 block mb-1">Mensaje Secundario</label>
                              <textarea
                                rows={2}
                                value={selectedBlock.subtitle ?? 'Conecta, comunica y potencia el impacto de tu club con Club Platform.'}
                                onChange={(e) => updateBlock(selectedBlock.id, { subtitle: e.target.value })}
                                className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs"
                                placeholder="Conecta, comunica y potencia el impacto de tu club con Club Platform."
                              />
                            </div>

                            <ColorPickerInput
                              label="Color del Subtítulo / Texto Secundario"
                              value={selectedBlock.subtitleColor || selectedBlock.textColor || '#ffffff'}
                              onChange={(hex) => updateBlock(selectedBlock.id, { subtitleColor: hex, textColor: hex })}
                            />
                          </div>

                          {/* SECCIÓN 3: BOTÓN DE ACCIÓN */}
                          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                              <Square className="w-3.5 h-3.5 text-amber-500" />
                              <span>Botón de Llamado a la Acción</span>
                            </span>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[11px] font-bold text-slate-700 block mb-1">Texto del Botón</label>
                                <input
                                  type="text"
                                  value={selectedBlock.buttonText ?? 'ACTIVAR MI CLUB'}
                                  onChange={(e) => updateBlock(selectedBlock.id, { buttonText: e.target.value })}
                                  className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs font-bold"
                                  placeholder="ACTIVAR MI CLUB"
                                />
                              </div>
                              <div>
                                <label className="text-[11px] font-bold text-slate-700 block mb-1">Redondeo Botón (px)</label>
                                <input
                                  type="number"
                                  min={0}
                                  max={50}
                                  value={selectedBlock.buttonRadius ?? 24}
                                  onChange={(e) => updateBlock(selectedBlock.id, { buttonRadius: Number(e.target.value) })}
                                  className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs font-bold"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="text-[11px] font-bold text-slate-700 block mb-1">Enlace de Destino (URL Pública)</label>
                              <input
                                type="text"
                                value={selectedBlock.buttonHref ?? 'https://clubplatform.org?utm_source=email_marketing&utm_medium=campaign&utm_campaign=cta_club_platform'}
                                onChange={(e) => updateBlock(selectedBlock.id, { buttonHref: e.target.value })}
                                className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900 font-mono text-xs"
                                placeholder="https://clubplatform.org"
                              />
                              <p className="text-[10px] text-slate-500 mt-0.5">
                                Enlace oficial con parámetros para atribución y medición de impacto.
                              </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <ColorPickerInput
                                label="Fondo del Botón"
                                value={selectedBlock.buttonBg || '#f7a81b'}
                                onChange={(hex) => updateBlock(selectedBlock.id, { buttonBg: hex })}
                              />
                              <ColorPickerInput
                                label="Texto del Botón"
                                value={selectedBlock.buttonColor || '#0c2340'}
                                onChange={(hex) => updateBlock(selectedBlock.id, { buttonColor: hex })}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 6. Otros bloques globales genéricos */}
                      {!['rotary_header', 'rotary_footer', 'rotary_signature', 'rotary_areas_focus', 'club_platform_cta'].includes(selectedBlock.globalKey || '') && (
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
            ) : (
              <>
                {/* PESTAÑA: BLOQUES DISPONIBLES */}
                {activeTab === 'blocks' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                        Bloques Disponibles
                      </h3>
                      <span className="text-[10px] text-slate-400">Clic o arrastra al lienzo</span>
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
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('application/rotary-new-block-type', item.type);
                              e.dataTransfer.effectAllowed = 'copy';
                            }}
                            onClick={() => handleAddBlock(item.type as BlockType)}
                            className="bg-white border border-slate-200 hover:border-rotary-blue hover:bg-blue-50/40 rounded-xl p-3 text-center transition-all group flex flex-col items-center justify-center gap-1.5 shadow-2xs cursor-grab active:cursor-grabbing"
                            title="Clic para agregar o arrastra al lienzo"
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
                          <span>{gb.name}</span>
                          <span className="text-[9px] font-black bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full border border-amber-300">
                            OFICIAL
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {gb.description}
                        </div>
                      </div>
                      <button
                        onClick={() => handleInsertGlobalBlock(gb.key, gb.name)}
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

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                    <label className="text-[11px] font-bold text-slate-700 block mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Type className="w-3.5 h-3.5 text-rotary-blue" />
                        Tipografía Global de la Plantilla
                      </span>
                      <span className="text-[10px] bg-blue-100 text-rotary-blue font-bold px-1.5 py-0.5 rounded">
                        Open Sans Oficial
                      </span>
                    </label>
                    <select
                      value={design.settings.font}
                      onChange={(e) => updateSettings({ font: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-xl p-2 text-slate-900 text-xs font-medium"
                    >
                      {FONT_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500 leading-normal">
                      Gobierna el estilo base de todos los bloques. Open Sans se entrega con sus variantes oficiales (300 a 800) y fallbacks automáticos a Helvetica/Arial para clientes de correo como Gmail y Outlook.
                    </p>
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
              </>
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

      {/* ─── 5.1 MODAL DE INSERTAR / EDITAR ENLACE ──────────────────────── */}
      {linkModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100"
          onClick={() => setLinkModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 w-full max-w-sm space-y-3.5 text-slate-800 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2 text-rotary-blue font-bold text-sm">
                <LinkIcon className="w-4 h-4" />
                <span>Insertar / Editar Enlace</span>
              </div>
              <button
                type="button"
                onClick={() => setLinkModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Destino (URL o Variable)</label>
              <input
                type="text"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://rotary4281.org o {{form_url}}"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-rotary-blue"
                autoFocus
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">Accesos rápidos institucionales:</label>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setLinkUrl('{{form_url}}')}
                  className="text-[10px] bg-blue-50 text-rotary-blue px-2 py-0.5 rounded-md font-mono hover:bg-blue-100 font-semibold"
                >
                  {'{{form_url}}'}
                </button>
                <button
                  type="button"
                  onClick={() => setLinkUrl('{{activar_club_url}}')}
                  className="text-[10px] bg-blue-50 text-rotary-blue px-2 py-0.5 rounded-md font-mono hover:bg-blue-100 font-semibold"
                >
                  {'{{activar_club_url}}'}
                </button>
                <button
                  type="button"
                  onClick={() => setLinkUrl('{{club.profile_url}}')}
                  className="text-[10px] bg-blue-50 text-rotary-blue px-2 py-0.5 rounded-md font-mono hover:bg-blue-100 font-semibold"
                >
                  {'{{club.profile_url}}'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setLinkModalOpen(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmLink}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-rotary-blue text-white hover:bg-blue-700 shadow-xs"
              >
                Aplicar Enlace
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

  return typeof document !== 'undefined'
    ? createPortal(editorModalContent, document.body)
    : editorModalContent;
};

export default VisualTemplateEditor;
