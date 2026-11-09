// ════════════════════════════════════════════════════════════════════════════
// Galería de revisión — v4.1305.0
//
// La galería con la que el panel revisa el material que envía un club
// (Visitas del Gobernador, Solicitudes de Rotary en Acción) ANTES de aprobarlo.
// Ver `docs/claude/vistas-previas-heic-de-los-aportes.md`.
//
// · La rejilla dibuja la MINIATURA (`thumbUrl`); el visor, la vista grande
//   (`url`). Una foto HEIC llega con su versión JPEG generada en el servidor.
// · Una foto sin vista previa todavía muestra «Generando vista previa…»; una
//   que no se pudo procesar dice por qué y ofrece Reintentar y Descargar el
//   original. NUNCA se pinta un `<img>` que se sabe que no va a dibujarse.
// · Si aun así una imagen no carga (enlace vencido, red), la casilla muestra
//   un aviso en su lugar: una foto defectuosa no rompe la rejilla.
// · Carga progresiva: fondo animado hasta que la miniatura llega, `loading=lazy`.
// · Visor: clic para ampliar, flechas ← → y Escape, contador, descarga del
//   original según el permiso que trae `originalUrl`.
// ════════════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Film, Image as ImageIcon, Loader2, RefreshCw, X } from 'lucide-react';

export interface PreviewInfo { status: 'not_needed' | 'pending' | 'processing' | 'ready' | 'error'; error?: string | null; canRetry?: boolean }
export interface GalleryItem {
  id: string; kind: 'image' | 'video' | string; filename?: string | null; caption?: string | null;
  url?: string | null; thumbUrl?: string | null; originalUrl?: string | null; preview?: PreviewInfo | null;
  badge?: React.ReactNode; note?: React.ReactNode;
}

const esperando = (p?: PreviewInfo | null) => p?.status === 'pending' || p?.status === 'processing';

// ── Piezas (fuera del componente: ver CLAUDE.md) ─────────────────────────
const Casilla: React.FC<{
  item: GalleryItem; onOpen: () => void; onRetry?: (id: string) => void; retrying: boolean;
}> = ({ item, onOpen, onRetry, retrying }) => {
  const [cargada, setCargada] = useState(false);
  const [rota, setRota] = useState(false);
  const thumb = item.thumbUrl || item.url || null;
  const nombre = item.filename || 'archivo';
  // Si la URL cambia (vista previa recién generada), se vuelve a intentar.
  useEffect(() => { setCargada(false); setRota(false); }, [thumb]);

  let cuerpo: React.ReactNode;
  if (item.preview?.status === 'error') {
    cuerpo = (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 p-3 text-center bg-amber-50">
        <AlertTriangle className="w-6 h-6 text-amber-500" />
        <p className="text-[11px] font-bold text-amber-800 leading-snug">No se pudo generar la vista previa</p>
        {item.preview.error && <p className="text-[10px] text-amber-700 leading-snug line-clamp-3">{item.preview.error}</p>}
        <div className="flex flex-wrap items-center justify-center gap-1.5 mt-1">
          {onRetry && item.preview.canRetry !== false && (
            <button type="button" disabled={retrying} onClick={() => onRetry(item.id)} className="inline-flex items-center gap-1 text-[10px] font-black text-rotary-blue bg-white border border-rotary-blue/30 rounded-full px-2 py-1 disabled:opacity-50">
              {retrying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Reintentar
            </button>
          )}
          {item.originalUrl && (
            <a href={item.originalUrl} className="inline-flex items-center gap-1 text-[10px] font-black text-gray-600 bg-white border border-gray-200 rounded-full px-2 py-1">
              <Download className="w-3 h-3" /> Original
            </a>
          )}
        </div>
      </div>
    );
  } else if (esperando(item.preview) || retrying) {
    cuerpo = (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-3 text-center bg-gray-50" role="status">
        <Loader2 className="w-6 h-6 text-rotary-blue animate-spin" />
        <p className="text-[11px] font-bold text-gray-600">Generando vista previa…</p>
        <p className="text-[10px] text-gray-400">Foto HEIC: se convierte a JPG para verla en cualquier navegador.</p>
      </div>
    );
  } else if (!thumb || rota) {
    cuerpo = (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 p-3 text-center bg-gray-50">
        {item.kind === 'video' ? <Film className="w-7 h-7 text-gray-300" /> : <ImageIcon className="w-7 h-7 text-gray-300" />}
        <p className="text-[11px] font-bold text-gray-500">{rota ? 'No se pudo mostrar' : 'Sin vista previa'}</p>
        {rota && <p className="text-[10px] text-gray-400">El enlace pudo vencer: recarga la ficha.</p>}
        {item.originalUrl && <a href={item.originalUrl} className="text-[10px] font-black text-rotary-blue inline-flex items-center gap-1"><Download className="w-3 h-3" /> Descargar original</a>}
      </div>
    );
  } else if (item.kind === 'video') {
    cuerpo = (
      <button type="button" onClick={onOpen} className="relative w-full h-full bg-black group" aria-label={`Ver video ${nombre}`}>
        <video src={thumb} muted playsInline preload="metadata" className="w-full h-full object-cover" onError={() => setRota(true)} />
        <span className="absolute inset-0 flex items-center justify-center"><span className="w-10 h-10 rounded-full bg-white/85 flex items-center justify-center group-hover:scale-105 transition-transform"><Film className="w-5 h-5 text-gray-800" /></span></span>
      </button>
    );
  } else {
    cuerpo = (
      <button type="button" onClick={onOpen} className={`relative w-full h-full ${cargada ? 'bg-gray-100' : 'bg-gray-100 animate-pulse'}`} aria-label={`Ampliar ${nombre}`}>
        <img
          src={thumb} alt={item.caption || nombre} loading="lazy" decoding="async"
          onLoad={() => setCargada(true)} onError={() => setRota(true)}
          className={`w-full h-full object-cover transition-opacity duration-300 ${cargada ? 'opacity-100' : 'opacity-0'}`}
        />
      </button>
    );
  }

  return (
    <figure className="rounded-xl overflow-hidden border border-gray-100 bg-white flex flex-col min-w-0">
      <div className="relative aspect-square">
        {cuerpo}
        {item.badge && <div className="absolute top-1.5 right-1.5 pointer-events-none">{item.badge}</div>}
      </div>
      <figcaption className="p-2 text-[11px] text-gray-600 min-w-0">
        {item.caption ? <span className="block break-words">{item.caption}</span> : null}
        <span className="block text-[10px] text-gray-400 truncate" title={nombre}>{nombre}</span>
        {item.note}
      </figcaption>
    </figure>
  );
};

const Visor: React.FC<{ items: GalleryItem[]; index: number; onIndex: (i: number) => void; onClose: () => void }> = ({ items, index, onIndex, onClose }) => {
  const item = items[index];
  const total = items.length;
  const [rota, setRota] = useState(false);
  useEffect(() => { setRota(false); }, [index]);
  if (!item) return null;
  const grande = item.url || item.thumbUrl || null;
  return (
    <div className="fixed inset-0 z-[70] bg-black/90 flex flex-col" role="dialog" aria-modal="true" aria-label="Visor de fotografías" onClick={onClose}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-bold truncate min-w-0">{index + 1} / {total} · {item.filename || ''}</p>
        <div className="flex items-center gap-2 shrink-0">
          {item.originalUrl && (
            <a href={item.originalUrl} className="inline-flex items-center gap-1.5 text-xs font-bold bg-white/10 hover:bg-white/20 rounded-full px-3 py-1.5">
              <Download className="w-4 h-4" /> <span className="hidden sm:inline">Descargar original</span>
            </a>
          )}
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-white/10" aria-label="Cerrar visor"><X className="w-5 h-5" /></button>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center px-2 sm:px-14 relative">
        {grande && !rota ? (
          item.kind === 'video'
            ? <video key={grande} src={grande} controls autoPlay playsInline className="max-w-full max-h-full" onClick={(e) => e.stopPropagation()} />
            : <img key={grande} src={grande} alt={item.caption || item.filename || ''} className="max-w-full max-h-full object-contain select-none" onClick={(e) => e.stopPropagation()} onError={() => setRota(true)} />
        ) : (
          <div className="text-center text-white/80 text-sm" onClick={(e) => e.stopPropagation()}>
            <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-60" />
            {esperando(item.preview) ? 'La vista previa todavía se está generando.' : item.preview?.status === 'error' ? (item.preview.error || 'No se pudo generar la vista previa.') : 'No se pudo mostrar este archivo.'}
          </div>
        )}
        {total > 1 && (
          <>
            <button type="button" onClick={(e) => { e.stopPropagation(); onIndex((index - 1 + total) % total); }} className="absolute left-1 sm:left-3 top-1/2 -translate-y-1/2 p-2 sm:p-3 rounded-full bg-white/10 hover:bg-white/25 text-white" aria-label="Anterior"><ChevronLeft className="w-6 h-6" /></button>
            <button type="button" onClick={(e) => { e.stopPropagation(); onIndex((index + 1) % total); }} className="absolute right-1 sm:right-3 top-1/2 -translate-y-1/2 p-2 sm:p-3 rounded-full bg-white/10 hover:bg-white/25 text-white" aria-label="Siguiente"><ChevronRight className="w-6 h-6" /></button>
          </>
        )}
      </div>
      {item.caption && <p className="px-4 py-3 text-center text-sm text-white/85" onClick={(e) => e.stopPropagation()}>{item.caption}</p>}
    </div>
  );
};

export const ReviewGallery: React.FC<{
  items: GalleryItem[]; onRetry?: (id: string) => void; retryingId?: string | null; className?: string;
}> = ({ items, onRetry, retryingId = null, className = '' }) => {
  const [abierta, setAbierta] = useState<number | null>(null);
  const cerrar = useCallback(() => setAbierta(null), []);

  useEffect(() => {
    if (abierta === null) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setAbierta(null); }
      else if (e.key === 'ArrowRight') setAbierta((i) => (i === null ? i : (i + 1) % items.length));
      else if (e.key === 'ArrowLeft') setAbierta((i) => (i === null ? i : (i - 1 + items.length) % items.length));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [abierta, items.length]);

  if (!items.length) return null;
  return (
    <>
      <div className={`grid grid-cols-2 sm:grid-cols-3 gap-3 ${className}`}>
        {items.map((item, i) => (
          <Casilla key={item.id} item={item} onOpen={() => setAbierta(i)} onRetry={onRetry} retrying={retryingId === item.id} />
        ))}
      </div>
      {abierta !== null && <Visor items={items} index={abierta} onIndex={setAbierta} onClose={cerrar} />}
    </>
  );
};

export default ReviewGallery;
