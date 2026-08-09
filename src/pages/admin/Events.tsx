import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
    Plus, Trash2, Save, Calendar, ChevronDown, ChevronUp,
    MapPin, Clock, Image, Image as ImageIcon, Loader2, X, Upload, Code, Eye, EyeOff,
    ImagePlus, Link as LinkIcon, ExternalLink, Crop, ZoomIn, ZoomOut, RotateCw,
    Facebook, Linkedin, Twitter, Share2, AlertCircle, ExternalLink as ExternalLink2,
    CalendarDays, Network
} from 'lucide-react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import AdminLayout from '../../components/admin/AdminLayout';
import EventRegistrationTab from '../../components/admin/events/EventRegistrationTab';
import EventVenueEditor from '../../components/admin/events/EventVenueEditor';
import EcosystemPicker from '../../components/admin/events/EcosystemPicker';
import { useAuth } from '../../hooks/useAuth';
import { useClub } from '../../contexts/ClubContext';
import { isDistrictSiteType, sourceTraceOf } from '../../lib/districtEcosystem';

interface CalendarEvent {
    id: string;
    title: string;
    description?: string;
    htmlContent?: string;
    startDate: string;
    endDate?: string;
    location?: string;
    type: string;
    image?: string;
    images?: string[];
    clubId: string;
    socialCopy?: string;
    publishFacebook?: boolean;
    publishLinkedin?: boolean;
    publishTwitter?: boolean;
    /** Configuración extra del evento. `metadata.latir` guarda el panel de inscripción. */
    metadata?: Record<string, any>;
    /** Dirección amigable del evento: /eventos/mi-evento. Sin slug se entra por el id. */
    slug?: string | null;
}

/**
 * v4.605 — Misma normalización que aplica el servidor, para que el campo
 * muestre desde el principio la dirección que quedará publicada.
 */
export const slugify = (value: string) =>
    String(value ?? '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120);

/** Pestañas del editor de un evento. */
type EventTab = 'info' | 'media' | 'html' | 'social' | 'sede' | 'metadata' | 'registro';

const EVENT_TYPES = [
    { value: 'meeting', label: 'Reunión' },
    { value: 'Servicio', label: 'Servicio' },
    { value: 'Fundraising', label: 'Fundraising' },
    { value: 'Fija', label: 'Fija' },
    { value: 'Institucional', label: 'Institucional' },
    { value: 'Integración', label: 'Integración' },
    { value: 'conference', label: 'Conferencia' },
    { value: 'other', label: 'Otro' },
];

const TYPE_COLORS: Record<string, string> = {
    meeting: 'bg-blue-100 text-blue-700',
    Servicio: 'bg-green-100 text-green-700',
    Fundraising: 'bg-yellow-100 text-yellow-700',
    Fija: 'bg-purple-100 text-purple-700',
    Institucional: 'bg-indigo-100 text-indigo-700',
    Integración: 'bg-pink-100 text-pink-700',
    conference: 'bg-orange-100 text-orange-700',
    other: 'bg-gray-100 text-gray-700',
};

const emptyForm = {
    title: '',
    description: '',
    htmlContent: '',
    startDate: '',
    endDate: '',
    location: '',
    type: 'meeting',
    image: '',
    images: [] as string[],
    slug: '',
};

// ── Simple HTML Editor with preview ──────────────────────────────────────────
const HtmlEditor = ({
    value,
    onChange,
}: {
    value: string;
    onChange: (v: string) => void;
}) => {
    const [preview, setPreview] = useState(false);
    return (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between bg-gray-50 border-b border-gray-200 px-4 py-2">
                <div className="flex items-center gap-2">
                    <Code className="w-4 h-4 text-gray-500" />
                    <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Editor HTML</span>
                </div>
                <button
                    type="button"
                    onClick={() => setPreview(!preview)}
                    className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                >
                    {preview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {preview ? 'Editar' : 'Vista previa'}
                </button>
            </div>

            {preview ? (
                <div
                    className="min-h-[200px] p-6 prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: value || '<p class="text-gray-400">Sin contenido aún...</p>' }}
                />
            ) : (
                <textarea
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    rows={10}
                    className="w-full px-4 py-3 font-mono text-sm text-gray-800 bg-white resize-y outline-none"
                    placeholder={`<h2>Bienvenidos a la V Conferencia LATIR</h2>\n<p>Descripción enriquecida del evento...</p>\n<ul>\n  <li>Punto 1</li>\n  <li>Punto 2</li>\n</ul>`}
                />
            )}
        </div>
    );
};

const HERO_W = 1920;
const HERO_H = 520;

// ── Canvas crop helper (uses createImageBitmap — no CORS taint issues) ───────────────
const getCroppedBlob = async (imageSrc: string, pixelCrop: Area): Promise<Blob> => {
    // Validate dimensions first
    if (!pixelCrop || pixelCrop.width <= 0 || pixelCrop.height <= 0) {
        throw new Error('El área de recorte es inválida — mueve o haz zoom en la imagen y vuelve a intentarlo');
    }

    // createImageBitmap with blob source never taints the canvas, regardless of origin
    const resp = await fetch(imageSrc);
    const blob = await resp.blob();
    const bitmap = await createImageBitmap(blob);

    const maxDim = 4096;
    let targetWidth = pixelCrop.width;
    let targetHeight = pixelCrop.height;

    if (targetWidth > maxDim) {
        const scale = maxDim / targetWidth;
        targetWidth = maxDim;
        targetHeight = targetHeight * scale;
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context no disponible');

    ctx.drawImage(
        bitmap,
        pixelCrop.x, pixelCrop.y,
        pixelCrop.width, pixelCrop.height,
        0, 0, targetWidth, targetHeight,
    );
    bitmap.close();

    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            b => b ? resolve(b) : reject(new Error('Error al generar la imagen final')),
            'image/jpeg',
            1.0
        );
    });
};


// ── Crop Modal ────────────────────────────────────────────────────────────────
const CropModal = ({
    src,
    onConfirm,
    onCancel,
}: {
    src: string;
    onConfirm: (croppedBlob: Blob) => void;
    onCancel: () => void;
}) => {
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [croppedArea, setCroppedArea] = useState<Area | null>(null);
    const [processing, setProcessing] = useState(false);

    const onCropComplete = useCallback((_: Area, croppedAreaPixels: Area) => {
        setCroppedArea(croppedAreaPixels);
    }, []);

    const handleConfirm = async () => {
        if (!croppedArea || croppedArea.width <= 0 || croppedArea.height <= 0) {
            alert('Ajusta el área de recorte antes de confirmar');
            return;
        }
        setProcessing(true);
        try {
            const blob = await getCroppedBlob(src, croppedArea);
            onConfirm(blob);
        } catch (err) {
            console.error('Crop error:', err);
            const msg = err instanceof Error ? err.message : 'Error desconocido';
            alert(`Error al recortar: ${msg}`);
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onCancel} />

            {/* Modal */}
            <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <Crop className="w-5 h-5 text-blue-600" />
                        <div>
                            <h3 className="font-bold text-gray-900">Recortar portada</h3>
                            <p className="text-xs text-gray-400">Banner panorámico · Salida {HERO_W}×{HERO_H}px (ratio exacto del sitio)</p>
                        </div>
                    </div>
                    <button onClick={onCancel} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>

                {/* Cropper area */}
                <div className="relative bg-gray-900" style={{ height: '400px' }}>
                    <Cropper
                        image={src}
                        crop={crop}
                        zoom={zoom}
                        rotation={rotation}
                        aspect={HERO_W / HERO_H}
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onCropComplete={onCropComplete}
                        showGrid
                        style={{
                            containerStyle: { background: '#111' },
                            cropAreaStyle: {
                                border: '2px solid rgba(59,130,246,0.8)',
                                boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
                            },
                        }}
                    />
                </div>

                {/* Controls */}
                <div className="px-5 py-4 bg-gray-50 space-y-3 border-t border-gray-100">
                    {/* Zoom */}
                    <div className="flex items-center gap-3">
                        <ZoomOut className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <input
                            type="range"
                            min={1} max={3} step={0.01}
                            value={zoom}
                            onChange={e => setZoom(Number(e.target.value))}
                            className="flex-1 h-1.5 appearance-none rounded-full bg-gray-200 accent-blue-600 cursor-pointer"
                        />
                        <ZoomIn className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="text-xs text-gray-500 w-10 text-right">{Math.round(zoom * 100)}%</span>
                    </div>

                    {/* Rotation */}
                    <div className="flex items-center gap-3">
                        <RotateCw className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <input
                            type="range"
                            min={-180} max={180} step={1}
                            value={rotation}
                            onChange={e => setRotation(Number(e.target.value))}
                            className="flex-1 h-1.5 appearance-none rounded-full bg-gray-200 accent-blue-600 cursor-pointer"
                        />
                        <span className="text-xs text-gray-500 w-14 text-right">{rotation}°</span>
                        <button
                            type="button"
                            onClick={() => setRotation(0)}
                            className="text-xs text-blue-600 hover:underline"
                        >Reset</button>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-100">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                    >Cancelar</button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={processing}
                        className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                        {processing ? (
                            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Procesando...</>
                        ) : (
                            <><Crop className="w-4 h-4" /> Confirmar recorte</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Image Uploader (with crop) ────────────────────────────────────────────────
const ImageUploader = ({
    label,
    currentUrl,
    onUploaded,
    onUrlChange,
    noCrop,
}: {
    label: string;
    currentUrl: string;
    onUploaded: (url: string) => void;
    onUrlChange: (url: string) => void;
    noCrop?: boolean;
}) => {
    const [uploading, setUploading] = useState(false);
    const [tab, setTab] = useState<'upload' | 'url'>('upload');
    const [cropSrc, setCropSrc] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const API = import.meta.env.VITE_API_URL || '/api';
    const token = localStorage.getItem('rotary_token');

    const handleUploadAction = async (blobOrFile: Blob | File) => {
        setUploading(true);
        try {
            const form = new FormData();
            form.append('image', blobOrFile, 'upload.jpg');
            const res = await fetch(`${API}/calendar/events/upload-image`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: form,
            });
            const data = await res.json();
            if (data.url) onUploaded(data.url);
        } catch {
            alert('Error al subir la imagen');
        } finally {
            setUploading(false);
        }
    };

    // Step 1: file selected → open crop modal OR upload directly
    const handleFileSelected = (file: File) => {
        if (noCrop) {
            handleUploadAction(file);
        } else {
            const reader = new FileReader();
            reader.onload = () => setCropSrc(reader.result as string);
            reader.readAsDataURL(file);
        }
        // Reset input so same file can be re-selected
        if (inputRef.current) inputRef.current.value = '';
    };

    // Step 2: crop confirmed → upload blob to S3
    const handleCropConfirmed = async (blob: Blob) => {
        setCropSrc(null);
        await handleUploadAction(blob);
    };

    return (
        <>
            {/* Crop modal (portal) */}
            {cropSrc && (
                <CropModal
                    src={cropSrc}
                    onConfirm={handleCropConfirmed}
                    onCancel={() => setCropSrc(null)}
                />
            )}

            <div className="space-y-3">
                <label className="block text-sm font-semibold text-gray-700">{label}</label>

                {/* Tab switcher */}
                <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
                    <button
                        type="button"
                        onClick={() => setTab('upload')}
                        className={`text-xs font-medium px-3 py-1.5 rounded-md transition-all ${tab === 'upload' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Upload className="w-3 h-3 inline mr-1" />{noCrop ? 'Subir imagen' : 'Subir y recortar'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setTab('url')}
                        className={`text-xs font-medium px-3 py-1.5 rounded-md transition-all ${tab === 'url' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <LinkIcon className="w-3 h-3 inline mr-1" />URL externa
                    </button>
                </div>

                {tab === 'upload' ? (
                    <div
                        onClick={() => inputRef.current?.click()}
                        className="border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl p-6 text-center cursor-pointer transition-colors group"
                    >
                        <input
                            ref={inputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={e => e.target.files?.[0] && handleFileSelected(e.target.files[0])}
                        />
                        {uploading ? (
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                <p className="text-sm text-gray-500">{noCrop ? 'Subiendo imagen...' : 'Subiendo portada recortada...'}</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-2">
                                <div className="flex gap-3 justify-center">
                                    <ImagePlus className="w-8 h-8 text-gray-300 group-hover:text-blue-400 transition-colors" />
                                    {!noCrop && <Crop className="w-8 h-8 text-gray-300 group-hover:text-blue-400 transition-colors" />}
                                </div>
                                <p className="text-sm text-gray-500">Haz clic para seleccionar {noCrop ? 'una imagen' : 'y recortar'}</p>
                                {!noCrop && <p className="text-xs text-gray-400">Se abrirá el editor de recorte · Salida 1920×1080 (o 1920x520) · JPG, PNG, WEBP</p>}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex gap-2">
                        <input
                            type="url"
                            value={currentUrl}
                            onChange={e => onUrlChange(e.target.value)}
                            placeholder="https://ejemplo.com/imagen.jpg"
                            className="flex-1 px-3 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        {currentUrl && (
                            <a href={currentUrl} target="_blank" rel="noopener noreferrer"
                                className="flex items-center px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                                <ExternalLink className="w-4 h-4 text-gray-600" />
                            </a>
                        )}
                    </div>
                )}

                {/* Preview with aspect ratio matching the hero, unless noCrop is true */}
                {currentUrl && (
                    <div
                        className={`relative w-full overflow-hidden rounded-xl border border-gray-200 group ${noCrop ? 'bg-gray-50 flex items-center justify-center p-2' : ''}`}
                        style={noCrop ? {} : { aspectRatio: `${HERO_W}/${HERO_H}` }}
                    >
                        <img 
                            src={currentUrl} 
                            alt="preview" 
                            className={`w-full ${noCrop ? 'h-auto max-h-[600px] object-contain' : 'h-full object-cover'}`} 
                        />
                        {!noCrop && (
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                                <p className="text-xs text-white/80">Vista previa — ratio exacto del sitio ({HERO_W}×{HERO_H}px)</p>
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={() => onUploaded('')}
                            className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                        >
                            <X className="w-3 h-3" />
                        </button>
                        {/* Re-crop button (only if it has crop enabled) */}
                        {!noCrop && currentUrl.length > 0 && (
                            <button
                                type="button"
                                onClick={async () => {
                                    if (currentUrl.startsWith('data:')) {
                                        setCropSrc(currentUrl);
                                        return;
                                    }
                                    try {
                                        const res = await fetch(`${API}/calendar/events/image-proxy?url=${encodeURIComponent(currentUrl)}`, { headers: { Authorization: `Bearer ${token}` } });
                                        const blob = await res.blob();
                                        const reader = new FileReader();
                                        reader.onload = () => setCropSrc(reader.result as string);
                                        reader.readAsDataURL(blob);
                                    } catch {
                                        alert('No se pudo cargar la imagen para recortar. Sube la imagen de nuevo.');
                                    }
                                }}
                                className="absolute top-2 left-2 flex items-center gap-1 px-2.5 py-1.5 bg-black/60 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                            >
                                <Crop className="w-3 h-3" /> Recortar de nuevo
                            </button>
                        )}
                    </div>
                )}
            </div>
        </>
    );
};

// ── Gallery Manager ───────────────────────────────────────────────────────────
const GalleryManager = ({
    images,
    onChange,
}: {
    images: string[];
    onChange: (imgs: string[]) => void;
}) => {
    const [uploading, setUploading] = useState(false);
    const [urlInput, setUrlInput] = useState('');
    const [showMediaPicker, setShowMediaPicker] = useState(false);
    const [mediaItems, setMediaItems] = useState<{ id: string, url: string, filename: string, type: string }[]>([]);
    const [loadingMedia, setLoadingMedia] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const API = import.meta.env.VITE_API_URL || '/api';
    const token = localStorage.getItem('rotary_token');

    const fetchMedia = async () => {
        setLoadingMedia(true);
        try {
            const res = await fetch(`${API}/media`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) setMediaItems(await res.json());
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingMedia(false);
        }
    };

    useEffect(() => {
        if (showMediaPicker && mediaItems.length === 0) fetchMedia();
    }, [showMediaPicker]);

    const handleFiles = async (files: FileList) => {
        setUploading(true);
        const newUrls: string[] = [];
        try {
            for (const file of Array.from(files)) {
                const form = new FormData();
                form.append('image', file);
                const res = await fetch(`${API}/calendar/events/upload-image`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                    body: form,
                });
                const data = await res.json();
                if (data.url) newUrls.push(data.url);
            }
            onChange([...images, ...newUrls]);
        } catch {
            alert('Error al subir imágenes');
        } finally {
            setUploading(false);
        }
    };

    const remove = (idx: number) => {
        onChange(images.filter((_, i) => i !== idx));
    };

    const addByUrl = () => {
        if (!urlInput.trim()) return;
        onChange([...images, urlInput.trim()]);
        setUrlInput('');
    };

    return (
        <div className="space-y-3">
            <label className="block text-sm font-semibold text-gray-700">
                <Image className="w-4 h-4 inline mr-1.5" />
                Galería Multimedia ({images.length} imagen{images.length !== 1 ? 'es' : ''})
            </label>

            {/* Grid */}
            {images.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                    {images.map((url, idx) => (
                        <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 group">
                            <img src={url} alt={`gallery-${idx}`} className="w-full h-full object-cover" />
                            <button
                                type="button"
                                onClick={() => remove(idx)}
                                className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                            >
                                <X className="w-5 h-5 text-white" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Upload zone */}
            <div
                onClick={() => inputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl p-5 text-center cursor-pointer transition-colors group mb-3"
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={e => e.target.files && handleFiles(e.target.files)}
                />
                {uploading ? (
                    <div className="flex items-center justify-center gap-2">
                        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm text-gray-500">Subiendo imágenes...</span>
                    </div>
                ) : (
                    <div className="flex items-center justify-center gap-2">
                        <Upload className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
                        <p className="text-sm text-gray-500">Haz clic para buscar imágenes en tu dispositivo (selección múltiple)</p>
                    </div>
                )}
            </div>

            {/* URL URL Input */}
            <div className="flex gap-2">
                <input
                    type="url"
                    value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addByUrl()}
                    placeholder="https://ejemplo.com/imagen.jpg (Agregar por enlace)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
                <button
                    type="button"
                    onClick={addByUrl}
                    disabled={!urlInput.trim()}
                    className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors"
                >
                    + Adjuntar enlace
                </button>
                <button
                    type="button"
                    onClick={() => setShowMediaPicker(true)}
                    className="px-4 py-2 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors flex items-center gap-2"
                >
                    <Image className="w-4 h-4" /> Librería
                </button>
            </div>

            {/* Media Picker Modal */}
            {showMediaPicker && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowMediaPicker(false)}>
                    <div className="bg-white w-full max-w-4xl max-h-[80vh] rounded-2xl shadow-xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <ImageIcon className="w-5 h-5 text-rotary-blue" />
                                Seleccionar desde Librería Multimedia
                            </h3>
                            <button onClick={() => setShowMediaPicker(false)} className="p-1 hover:bg-gray-200 rounded-lg transition-colors">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>
                        <div className="p-4 flex-1 overflow-y-auto">
                            {loadingMedia ? (
                                <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-rotary-blue" /></div>
                            ) : mediaItems.filter(m => m.type === 'image').length === 0 ? (
                                <div className="text-center py-20 text-gray-400">No hay imágenes en la librería.</div>
                            ) : (
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                                    {mediaItems.filter(m => m.type === 'image').map(item => (
                                        <div
                                            key={item.id}
                                            onClick={() => {
                                                onChange([...images, item.url]);
                                                setShowMediaPicker(false);
                                            }}
                                            className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 cursor-pointer group hover:ring-4 hover:ring-rotary-blue/30 transition-all"
                                        >
                                            <img src={item.url} alt={item.filename} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                                                <p className="text-[10px] text-white truncate">{item.filename}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Main Component ────────────────────────────────────────────────────────────
const EventsManagement = () => {
    const { user } = useAuth();
    const { club } = useClub();
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [showAdd, setShowAdd] = useState(false);
    // v4.747 — Traer eventos de los sitios vinculados al distrito.
    const [showEcosystem, setShowEcosystem] = useState(false);
    const [newEvent, setNewEvent] = useState(emptyForm);
    /** Qué falta o qué falló al crear el evento. */
    const [formError, setFormError] = useState('');
    /** Permite distinguir "sin fecha" de "fecha a medio escribir" (validity.badInput). */
    const startDateRef = useRef<HTMLInputElement>(null);
    const [activeTab, setActiveTab] = useState<Record<string, EventTab>>({});
    // v4.653 — A qué lleva /eventos en el sitio público: al calendario (vacío)
    // o directo a la ficha de un evento. Se guarda como sección de CMS
    // (page 'eventos', section 'redirect'), que es lo que ya lee esa página.
    const [publicRedirect, setPublicRedirect] = useState('');
    const [savingRedirect, setSavingRedirect] = useState(false);
    const [redirectSaved, setRedirectSaved] = useState(false);

    const API = import.meta.env.VITE_API_URL || '/api';
    const token = localStorage.getItem('rotary_token');
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    const fetchEvents = async () => {
        try {
            const res = await fetch(`${API}/calendar`, { headers });
            const data = await res.json();
            setEvents(data.events || []);
        } catch {
            console.error('Error fetching events');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchEvents(); }, []);

    // El sitio al que pertenecen estos eventos. Se toma del propio evento
    // porque un usuario con rol `administrator` no lleva `clubId`, y guardar
    // sin club dejaría la redirección como GLOBAL: se filtraría a los demás
    // sitios de la plataforma.
    const siteClubId = (events[0] as any)?.clubId || (user as any)?.clubId || '';

    // v4.747 — Quién ve el botón de «Traer del ecosistema». Se mira el TIPO del
    // sitio, no el rol: la función es del sitio de un distrito. Se comprueban
    // `type` y `organizationType` porque `Club` guarda la clasificación en uno
    // u otro según por dónde se creó el sitio, cosa que `entityTypes.js` ya
    // documenta. El operador de la plataforma lo ve siempre, para diagnosticar.
    //
    // Esto decide QUÉ SE PINTA, nunca a qué se tiene acceso: el alcance real lo
    // resuelve `resolveScope` en el servidor y devuelve 403 a quien no
    // corresponda.
    const canBringFromEcosystem =
        isDistrictSiteType((club as any)?.type)
        || isDistrictSiteType((club as any)?.organizationType)
        || (user as any)?.role === 'administrator';

    // Destino actual de la sección pública de Eventos.
    useEffect(() => {
        if (!siteClubId) return;
        fetch(`${API}/clubs/${siteClubId}/sections?page=eventos&clubId=${siteClubId}`)
            .then(r => r.json())
            .then((rows: any[]) => {
                const row = (rows || []).find(x => x.section === 'redirect');
                if (!row) return;
                const content = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
                setPublicRedirect(String(content?.target || ''));
            })
            .catch(() => { /* la pantalla sigue usable sin este dato */ });
    }, [siteClubId]);

    // El valor guardado puede venir como slug (así se guardaba hasta v4.657) o
    // como id (desde v4.658). Se resuelve contra la lista de eventos para que el
    // desplegable muestre la selección correcta en los dos casos, y para poder
    // enseñar la dirección PÚBLICA —la del slug— en el aviso.
    const redirectEvent = publicRedirect
        ? events.find((e: any) => e.id === publicRedirect || e.slug === publicRedirect)
        : undefined;
    const redirectValue = redirectEvent ? redirectEvent.id : publicRedirect;
    const redirectPublicRef = redirectEvent ? (redirectEvent.slug || redirectEvent.id) : publicRedirect;

    const savePublicRedirect = async (target: string) => {
        setSavingRedirect(true);
        setRedirectSaved(false);
        try {
            const res = await fetch(`${API}/admin/sections/batch-upsert`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    clubId: siteClubId,
                    sections: [{ page: 'eventos', section: 'redirect', content: { target } }],
                }),
            });
            if (!res.ok) throw new Error();
            setPublicRedirect(target);
            setRedirectSaved(true);
            setTimeout(() => setRedirectSaved(false), 2500);
        } catch {
            alert('No pudimos guardar el destino de la sección de Eventos.');
        } finally {
            setSavingRedirect(false);
        }
    };

    const getTab = (id: string) => activeTab[id] || 'info';
    const setTab = (id: string, tab: EventTab) =>
        setActiveTab(prev => ({ ...prev, [id]: tab }));

    // v4.604 — El botón de guardar ya no se deshabilita por validación: se
    // valida al pulsarlo y se dice qué falta. Antes quedaba gris sin ninguna
    // explicación, y el caso típico es una fecha incompleta: los campos de
    // fecha y hora del navegador no entregan ningún valor mientras les falte
    // un segmento (a. m. / p. m., por ejemplo), así que el formulario se veía
    // lleno pero la fecha de inicio llegaba vacía.
    const handleCreate = async () => {
        const missing: string[] = [];
        if (!newEvent.title.trim()) missing.push('el título');
        if (!newEvent.startDate) {
            missing.push(startDateRef.current?.validity?.badInput
                ? 'la fecha de inicio completa — revisa la hora y el a. m. / p. m.'
                : 'la fecha de inicio');
        }
        if (missing.length) {
            setFormError(`Falta ${missing.join(' y ')}.`);
            return;
        }

        setFormError('');
        setSaving('new');
        try {
            const res = await fetch(`${API}/calendar/events`, {
                method: 'POST',
                headers,
                body: JSON.stringify(newEvent),
            });
            if (res.ok) {
                setNewEvent(emptyForm);
                setShowAdd(false);
                await fetchEvents();
            } else {
                const data = await res.json().catch(() => null);
                setFormError(data?.error || 'No pudimos guardar el evento. Inténtalo de nuevo.');
            }
        } catch {
            setFormError('No pudimos guardar el evento: revisa tu conexión e inténtalo de nuevo.');
        } finally {
            setSaving(null);
        }
    };

    const handleUpdate = async (event: CalendarEvent) => {
        setSaving(event.id);
        try {
            const res = await fetch(`${API}/calendar/events/${event.id}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(event),
            });
            // Un guardado fallido pasaba desapercibido: la pantalla quedaba
            // igual y los cambios se perdían sin aviso.
            if (!res.ok) {
                const data = await res.json().catch(() => null);
                alert(data?.error || 'No pudimos guardar los cambios del evento.');
                return;
            }
            await fetchEvents();
        } catch {
            alert('No pudimos guardar los cambios: revisa tu conexión e inténtalo de nuevo.');
        } finally {
            setSaving(null);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Estás seguro de eliminar este evento?')) return;
        try {
            await fetch(`${API}/calendar/events/${id}`, { method: 'DELETE', headers });
            await fetchEvents();
        } catch {
            console.error('Error deleting event');
        }
    };

    const updateEventField = (id: string, field: string, value: any) => {
        setEvents(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('es-ES', {
            weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
        });
    };

    const toInputDate = (dateStr: string) => {
        if (!dateStr) return '';
        return new Date(dateStr).toISOString().slice(0, 16);
    };

    if (loading) {
        return (
            <AdminLayout>
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-sky-100 flex items-center justify-center">
                            <CalendarDays className="w-6 h-6 text-rotary-blue" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Gestión de Eventos</h1>
                            <p className="text-sm text-gray-500 mt-1">
                                Planifica y organiza tus actividades · {events.length} eventos registrados
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {canBringFromEcosystem && (
                            <button
                                onClick={() => setShowEcosystem(true)}
                                className="flex items-center gap-2 bg-white text-rotary-blue border border-blue-200 px-4 py-2.5 rounded-xl hover:bg-blue-50 transition-all font-bold active:scale-95"
                            >
                                <Network className="w-5 h-5" /> Traer del ecosistema
                            </button>
                        )}
                        <button
                            onClick={() => setShowAdd(!showAdd)}
                            className="flex items-center gap-2 bg-rotary-blue text-white px-5 py-2.5 rounded-xl hover:bg-sky-800 transition-all font-bold shadow-xl shadow-blue-900/20 active:scale-95"
                        >
                            <Plus className="w-5 h-5" /> Nuevo Evento
                        </button>
                    </div>
                </div>

                {showEcosystem && (
                    <EcosystemPicker
                        onClose={() => setShowEcosystem(false)}
                        onDone={fetchEvents}
                    />
                )}

                {/* ── Sección pública de Eventos ──────────────────────
                    Un sitio con un solo evento no necesita calendario: puede
                    llevar directo a la ficha. */}
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                            <h3 className="font-bold text-gray-900 text-sm">Sección pública de Eventos</h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                                A dónde llega quien entra a <span className="font-mono">/eventos</span> desde el menú o un enlace.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <select
                                value={redirectValue}
                                disabled={savingRedirect}
                                onChange={e => savePublicRedirect(e.target.value)}
                                className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm max-w-xs disabled:opacity-50"
                            >
                                <option value="">Mostrar el calendario de eventos</option>
                                {/* El valor guardado es el ID, no el slug: es lo
                                    único que no cambia. La dirección bonita la
                                    resuelve la página pública con el slug del
                                    momento, así que renombrar el slug no rompe
                                    la redirección. */}
                                {events.map(ev => (
                                    <option key={ev.id} value={ev.id}>
                                        Ir directo a: {ev.title}
                                    </option>
                                ))}
                            </select>
                            {savingRedirect && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
                            {redirectSaved && <span className="text-sm font-semibold text-emerald-600">Guardado.</span>}
                        </div>
                    </div>
                    {publicRedirect && (
                        <p className="mt-3 text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                            El calendario queda oculto: <span className="font-mono">/eventos</span> redirige a{' '}
                            <span className="font-mono font-bold">/eventos/{redirectPublicRef}</span>. Los demás eventos
                            siguen accesibles por su propio enlace.
                        </p>
                    )}
                </div>

                {/* Create form */}
                {showAdd && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 space-y-4">
                        <h3 className="font-bold text-gray-900">Nuevo Evento</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                                <input
                                    type="text"
                                    value={newEvent.title}
                                    onChange={e => { setNewEvent({ ...newEvent, title: e.target.value }); setFormError(''); }}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Nombre del evento"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de inicio *</label>
                                <input type="datetime-local" value={newEvent.startDate} ref={startDateRef}
                                    onChange={e => { setNewEvent({ ...newEvent, startDate: e.target.value }); setFormError(''); }}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                                <p className="mt-1 text-xs text-gray-400">Completa el día, la hora y el a. m. / p. m.: mientras falte alguno, la fecha se toma como vacía.</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de fin</label>
                                <input type="datetime-local" value={newEvent.endDate}
                                    onChange={e => setNewEvent({ ...newEvent, endDate: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Ubicación</label>
                                <input type="text" value={newEvent.location}
                                    onChange={e => setNewEvent({ ...newEvent, location: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Lugar del evento" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                                <select value={newEvent.type}
                                    onChange={e => setNewEvent({ ...newEvent, type: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                                    {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Dirección del evento (opcional)</label>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-gray-400 shrink-0">/eventos/</span>
                                    <input type="text" value={newEvent.slug}
                                        onChange={e => { setNewEvent({ ...newEvent, slug: e.target.value }); setFormError(''); }}
                                        onBlur={e => setNewEvent(prev => ({ ...prev, slug: slugify(e.target.value) }))}
                                        className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder={newEvent.title ? slugify(newEvent.title) : 'xii-feria-valledupar'} />
                                    {!newEvent.slug.trim() && newEvent.title.trim() && (
                                        <button type="button" onClick={() => setNewEvent(prev => ({ ...prev, slug: slugify(prev.title) }))}
                                            className="shrink-0 text-sm font-semibold text-blue-600 hover:underline">Usar el título</button>
                                    )}
                                </div>
                                <p className="mt-1 text-xs text-gray-400">
                                    Dirección amigable para enlazar el evento desde botones y menús. Si la dejas vacía, el evento se abre por su código interno.
                                </p>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción breve</label>
                                <textarea value={newEvent.description}
                                    onChange={e => setNewEvent({ ...newEvent, description: e.target.value })}
                                    rows={3}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                    placeholder="Describe el evento en pocas palabras..." />
                            </div>
                        </div>
                        {formError && (
                            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{formError}</span>
                            </div>
                        )}
                        <div className="flex gap-3">
                            <button onClick={handleCreate}
                                disabled={saving === 'new'}
                                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                                <Save className="w-4 h-4" />
                                {saving === 'new' ? 'Guardando...' : 'Guardar evento'}
                            </button>
                            <button onClick={() => { setShowAdd(false); setNewEvent(emptyForm); setFormError(''); }}
                                className="px-4 py-2 text-gray-600 hover:text-gray-800">
                                Cancelar
                            </button>
                        </div>
                    </div>
                )}

                {/* Events list */}
                {events.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                        <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-gray-600 mb-2">Sin eventos registrados</h3>
                        <p className="text-gray-400 mb-6">Crea el primer evento para que aparezca en el sitio.</p>
                        <button onClick={() => setShowAdd(true)}
                            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                            <Plus className="w-5 h-5" /> Crear primer evento
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {events
                            .slice()
                            .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
                            .map(event => (
                                <div key={event.id} className="bg-white rounded-xl border border-gray-200 hover:border-blue-200 transition-all shadow-sm">
                                    {/* Row header */}
                                    <div
                                        className="flex items-center gap-3 px-5 py-4 cursor-pointer"
                                        onClick={() => setExpandedId(expandedId === event.id ? null : event.id)}
                                    >
                                        {/* Cover thumbnail */}
                                        {event.image ? (
                                            <img src={event.image} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-gray-100" />
                                        ) : (
                                            <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                                                <Calendar className="w-5 h-5 text-gray-400" />
                                            </div>
                                        )}

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="font-semibold text-gray-900 text-sm">{event.title}</h3>
                                                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[event.type] || TYPE_COLORS.other}`}>
                                                    {EVENT_TYPES.find(t => t.value === event.type)?.label || event.type}
                                                </span>
                                                {event.images && event.images.length > 0 && (
                                                    <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
                                                        <Image className="w-3 h-3" /> {event.images.length}
                                                    </span>
                                                )}
                                                {event.htmlContent && (
                                                    <span className="text-[11px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                                                        <Code className="w-3 h-3" /> HTML
                                                    </span>
                                                )}
                                                {/* v4.747 — Un evento traído se DICE. Sin esta marca,
                                                    una copia se ve igual que un evento propio y nadie
                                                    puede saber por qué su fecha no coincide con la del
                                                    club que lo organiza. */}
                                                {sourceTraceOf(event) && (
                                                    <span className="text-[11px] bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                        <Network className="w-3 h-3" />
                                                        {sourceTraceOf(event)?.clubName || 'Otro sitio'}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-4 mt-1">
                                                <span className="text-xs text-gray-400 flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {formatDate(event.startDate)}
                                                </span>
                                                {event.location && (
                                                    <span className="text-xs text-gray-400 flex items-center gap-1">
                                                        <MapPin className="w-3 h-3" /> {event.location}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {expandedId === event.id
                                            ? <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                                            : <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                                        }
                                    </div>

                                    {/* ── Edit panel ── */}
                                    {expandedId === event.id && (
                                        <div className="border-t border-gray-100">
                                            {/* v4.747 — Editar una copia la separa de su original, y
                                                eso es legítimo: el distrito puede querer su propio
                                                texto. Lo que no puede pasar es que ocurra sin saberlo,
                                                así que se avisa acá, donde se edita, y se deja a la
                                                vista el enlace al evento de verdad. */}
                                            {sourceTraceOf(event) && (
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 bg-sky-50/70 border-b border-sky-100 text-xs">
                                                    <span className="text-sky-900">
                                                        Traído de <strong>{sourceTraceOf(event)?.clubName || 'otro sitio'}</strong>.
                                                        Si lo editás acá, tu copia deja de coincidir con el original.
                                                    </span>
                                                    {sourceTraceOf(event)?.url && (
                                                        <a
                                                            href={sourceTraceOf(event)?.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 font-semibold text-rotary-blue hover:underline"
                                                        >
                                                            Ver el evento original <ExternalLink className="w-3 h-3" />
                                                        </a>
                                                    )}
                                                </div>
                                            )}
                                            {/* Tab nav */}
                                            <div className="flex border-b border-gray-100 bg-gray-50/70">
                                                {/* v4.603 — La pestaña del panel de inscripción estaba
                                                    reservada al evento de la Conferencia LATIR; ahora
                                                    cualquier evento de cualquier sitio puede tener el suyo. */}
                                                {(['info', 'media', 'html', 'social', 'sede', 'metadata', 'registro'] as const).map(tab => (
                                                    <button
                                                        key={tab}
                                                        type="button"
                                                        onClick={() => setTab(event.id, tab)}
                                                        className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${getTab(event.id) === tab
                                                            ? 'border-blue-600 text-blue-600 bg-white'
                                                            : 'border-transparent text-gray-500 hover:text-gray-700'
                                                            }`}
                                                    >
                                                        {{
                                                            info: '📋 Información',
                                                            media: '🖼️ Multimedia',
                                                            html: '</> HTML',
                                                            social: '🚀 Social',
                                                            sede: '🏨 Sede',
                                                            metadata: '🎟️ Panel de inscripción',
                                                            registro: '💳 Registro',
                                                        }[tab as string]}
                                                    </button>
                                                ))}
                                            </div>

                                            <div className="p-6 space-y-5">
                                                {/* ── Tab: Info ── */}
                                                {getTab(event.id) === 'info' && (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div className="md:col-span-2">
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                                                            <input
                                                                type="text"
                                                                value={event.title}
                                                                onChange={e => updateEventField(event.id, 'title', e.target.value)}
                                                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de inicio</label>
                                                            <input type="datetime-local"
                                                                value={toInputDate(event.startDate)}
                                                                onChange={e => updateEventField(event.id, 'startDate', e.target.value)}
                                                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de fin</label>
                                                            <input type="datetime-local"
                                                                value={toInputDate(event.endDate || '')}
                                                                onChange={e => updateEventField(event.id, 'endDate', e.target.value)}
                                                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">Ubicación</label>
                                                            <input type="text"
                                                                value={event.location || ''}
                                                                onChange={e => updateEventField(event.id, 'location', e.target.value)}
                                                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                                placeholder="Ciudad, País" />
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                                                            <select
                                                                value={event.type}
                                                                onChange={e => updateEventField(event.id, 'type', e.target.value)}
                                                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                                                                {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                                            </select>
                                                        </div>
                                                        <div className="md:col-span-2">
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">Dirección del evento</label>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm text-gray-400 shrink-0">/eventos/</span>
                                                                <input type="text"
                                                                    value={event.slug || ''}
                                                                    onChange={e => updateEventField(event.id, 'slug', e.target.value)}
                                                                    onBlur={e => updateEventField(event.id, 'slug', slugify(e.target.value))}
                                                                    className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                                    placeholder={slugify(event.title) || 'mi-evento'} />
                                                                <button type="button"
                                                                    onClick={() => {
                                                                        const path = `${window.location.origin}/eventos/${event.slug || event.id}`;
                                                                        navigator.clipboard?.writeText(path);
                                                                        alert(`Enlace copiado:\n${path}`);
                                                                    }}
                                                                    className="shrink-0 text-sm font-semibold text-blue-600 hover:underline">Copiar enlace</button>
                                                            </div>
                                                            <p className="mt-1 text-xs text-gray-400">
                                                                Úsala para enlazar el evento desde botones y menús. Al cambiarla, los enlaces con la dirección anterior dejan de funcionar; el enlace por código interno siempre sirve.
                                                            </p>
                                                        </div>
                                                        <div className="md:col-span-2">
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción breve (texto plano)</label>
                                                            <textarea
                                                                value={event.description || ''}
                                                                onChange={e => updateEventField(event.id, 'description', e.target.value)}
                                                                rows={3}
                                                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                                                placeholder="Resumen breve del evento..." />
                                                        </div>
                                                    </div>
                                                )}

                                                {/* ── Tab: Media ── */}
                                                {getTab(event.id) === 'media' && (
                                                    <div className="space-y-8">
                                                        <ImageUploader
                                                            label="📸 Imagen de portada"
                                                            currentUrl={event.image || ''}
                                                            onUploaded={url => updateEventField(event.id, 'image', url)}
                                                            onUrlChange={url => updateEventField(event.id, 'image', url)}
                                                        />
                                                        <hr className="border-gray-100" />
                                                        <GalleryManager
                                                            images={event.images || []}
                                                            onChange={imgs => updateEventField(event.id, 'images', imgs)}
                                                        />
                                                    </div>
                                                )}

                                                {/* ── Tab: HTML ── */}
                                                {getTab(event.id) === 'html' && (
                                                    <div className="space-y-3">
                                                        <p className="text-sm text-gray-500">
                                                            Este contenido HTML se mostrará en la página del evento, debajo de la descripción breve. Puedes usar etiquetas como <code className="bg-gray-100 px-1 rounded text-xs">&lt;h2&gt;</code>, <code className="bg-gray-100 px-1 rounded text-xs">&lt;p&gt;</code>, <code className="bg-gray-100 px-1 rounded text-xs">&lt;ul&gt;</code>, <code className="bg-gray-100 px-1 rounded text-xs">&lt;a&gt;</code>, <code className="bg-gray-100 px-1 rounded text-xs">&lt;img&gt;</code>, etc.
                                                        </p>
                                                        <HtmlEditor
                                                            value={event.htmlContent || ''}
                                                            onChange={v => updateEventField(event.id, 'htmlContent', v)}
                                                        />
                                                    </div>
                                                )}

                                                {/* ── Tab: Panel de inscripción (barra lateral del evento) ── */}
                                                {getTab(event.id) === 'sede' && (
                                                    <div className="p-6">
                                                        <EventVenueEditor
                                                            venue={event.metadata?.venue}
                                                            onChange={venue => updateEventField(
                                                                event.id, 'metadata', { ...event.metadata, venue })}
                                                        />
                                                    </div>
                                                )}

                                                {getTab(event.id) === 'metadata' && (
                                                    <div className="space-y-5">
                                                        <p className="text-sm text-gray-500">
                                                            Panel que aparece en la barra lateral de la página del evento: logo, cuenta
                                                            regresiva hasta la fecha de inicio, botón de inscripción, precios y fecha de
                                                            cierre. <b>Todos los campos son opcionales</b>: los que dejes vacíos no se
                                                            muestran, y el título y el subtítulo caen en el nombre y el lugar del evento.
                                                        </p>

                                                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                                                            <input
                                                                type="checkbox"
                                                                className="h-4 w-4"
                                                                checked={event.metadata?.latir?.enabled !== false && (
                                                                    event.metadata?.latir?.enabled === true ||
                                                                    Object.values(event.metadata?.latir || {}).some(v => typeof v === 'string' && v.trim() !== '')
                                                                )}
                                                                onChange={e => updateEventField(event.id, 'metadata', { ...event.metadata, latir: { ...event.metadata?.latir, enabled: e.target.checked } })}
                                                            />
                                                            Mostrar el panel de inscripción en la página de este evento
                                                        </label>

                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">Título del panel</label>
                                                                <textarea
                                                                    rows={3}
                                                                    value={event.metadata?.latir?.title || ''}
                                                                    onChange={e => updateEventField(event.id, 'metadata', { ...event.metadata, latir: { ...event.metadata?.latir, title: e.target.value } })}
                                                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                                    placeholder={event.title || 'Vacío usa el nombre del evento'}
                                                                />
                                                                <p className="mt-1 text-xs text-gray-400">Cada salto de línea se respeta tal cual.</p>
                                                            </div>
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">Subtítulo</label>
                                                                <textarea
                                                                    rows={3}
                                                                    value={event.metadata?.latir?.subtitle || ''}
                                                                    onChange={e => updateEventField(event.id, 'metadata', { ...event.metadata, latir: { ...event.metadata?.latir, subtitle: e.target.value } })}
                                                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                                    placeholder={event.location || 'Vacío usa el lugar del evento'}
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">Texto del Botón</label>
                                                                <input
                                                                    type="text"
                                                                    value={event.metadata?.latir?.buttonLabel || ''}
                                                                    onChange={e => updateEventField(event.id, 'metadata', { ...event.metadata, latir: { ...event.metadata?.latir, buttonLabel: e.target.value } })}
                                                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                                    placeholder="Inscripciones"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">Link del Botón de Inscripciones</label>
                                                                <input
                                                                    type="text"
                                                                    value={event.metadata?.latir?.buttonLink || ''}
                                                                    onChange={e => updateEventField(event.id, 'metadata', { ...event.metadata, latir: { ...event.metadata?.latir, buttonLink: e.target.value } })}
                                                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                                    placeholder="Ej: https://forms.gle/… o /postular-proyecto"
                                                                />
                                                                <p className="mt-1 text-xs text-gray-400">Vacío oculta el botón. Una dirección del propio sitio abre en la misma pestaña.</p>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">Etiqueta del primer precio</label>
                                                                <input
                                                                    type="text"
                                                                    value={event.metadata?.latir?.ticketGeneralLabel || ''}
                                                                    onChange={e => updateEventField(event.id, 'metadata', { ...event.metadata, latir: { ...event.metadata?.latir, ticketGeneralLabel: e.target.value } })}
                                                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                                    placeholder="Ticket general:"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">Etiqueta del segundo precio</label>
                                                                <input
                                                                    type="text"
                                                                    value={event.metadata?.latir?.ticketRotexLabel || ''}
                                                                    onChange={e => updateEventField(event.id, 'metadata', { ...event.metadata, latir: { ...event.metadata?.latir, ticketRotexLabel: e.target.value } })}
                                                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                                    placeholder="Ticket ROTEX:"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">Precio Ticket General</label>
                                                                <input
                                                                    type="text"
                                                                    value={event.metadata?.latir?.ticketGeneral || ''}
                                                                    onChange={e => updateEventField(event.id, 'metadata', { ...event.metadata, latir: { ...event.metadata?.latir, ticketGeneral: e.target.value } })}
                                                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">Precio Ticket ROTEX</label>
                                                                <input
                                                                    type="text"
                                                                    value={event.metadata?.latir?.ticketRotex || ''}
                                                                    onChange={e => updateEventField(event.id, 'metadata', { ...event.metadata, latir: { ...event.metadata?.latir, ticketRotex: e.target.value } })}
                                                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">Aumento a partir de (Ej: A partir del 15/03: USD 625)</label>
                                                                <input
                                                                    type="text"
                                                                    value={event.metadata?.latir?.ticketDesc || ''}
                                                                    onChange={e => updateEventField(event.id, 'metadata', { ...event.metadata, latir: { ...event.metadata?.latir, ticketDesc: e.target.value } })}
                                                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Cierre (Ej: 31/03/2026)</label>
                                                                <input
                                                                    type="text"
                                                                    value={event.metadata?.latir?.closeDateText || ''}
                                                                    onChange={e => updateEventField(event.id, 'metadata', { ...event.metadata, latir: { ...event.metadata?.latir, closeDateText: e.target.value } })}
                                                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                                />
                                                            </div>
                                                        </div>

                                                        <hr className="border-gray-100" />
                                                        
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <ImageUploader
                                                                label="🖼️ Logo del Evento (Aparece arriba del título)"
                                                                currentUrl={event.metadata?.latir?.headerLogo || ''}
                                                                onUploaded={url => updateEventField(event.id, 'metadata', { ...event.metadata, latir: { ...event.metadata?.latir, headerLogo: url } })}
                                                                onUrlChange={url => updateEventField(event.id, 'metadata', { ...event.metadata, latir: { ...event.metadata?.latir, headerLogo: url } })}
                                                                noCrop={true}
                                                            />
                                                            <ImageUploader
                                                                label="🖼️ Imagen adjunta (Final de la columna)"
                                                                currentUrl={event.metadata?.latir?.footerImage || ''}
                                                                onUploaded={url => updateEventField(event.id, 'metadata', { ...event.metadata, latir: { ...event.metadata?.latir, footerImage: url } })}
                                                                onUrlChange={url => updateEventField(event.id, 'metadata', { ...event.metadata, latir: { ...event.metadata?.latir, footerImage: url } })}
                                                                noCrop={true}
                                                            />
                                                        </div>
                                                    </div>
                                                )}

                                                {/* ── Tab: Registro ──
                                                    Desde v4.648 esta pestaña administra su propia configuración
                                                    (edición, categorías, inscripciones y acreditación) contra
                                                    /api/event-registrations/admin, así que ya no depende del
                                                    botón "Guardar cambios" del evento ni de `metadata`. */}
                                                {getTab(event.id) === 'registro' && (
                                                    <EventRegistrationTab
                                                        eventId={event.id}
                                                        eventSlug={event.slug}
                                                        eventTitle={event.title}
                                                    />
                                                )}

                                                {/* ── Tab: Social ── */}
                                                {getTab(event.id) === 'social' && (
                                                    <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                                                        <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between">
                                                            <div className="flex items-center gap-3">
                                                                <div className="p-2 bg-blue-600 text-white rounded-lg">
                                                                    <Share2 className="w-5 h-5" />
                                                                </div>
                                                                <div>
                                                                    <h4 className="font-bold text-gray-800 text-sm">Campaña de Difusión Automática</h4>
                                                                    <p className="text-[11px] text-gray-500">Publica este evento en tus redes al guardar los cambios.</p>
                                                                </div>
                                                            </div>
                                                            <Link to="/admin/social-hub" className="px-3 py-1.5 bg-white border border-gray-200 text-blue-600 rounded-lg text-xs font-bold hover:bg-gray-50 transition-all flex items-center gap-1.5">
                                                                <ExternalLink2 className="w-3.5 h-3.5" /> Social Hub
                                                            </Link>
                                                        </div>

                                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                            <div className="space-y-4">
                                                                <div>
                                                                    <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-widest">Copy para Redes Sociales</label>
                                                                    <textarea 
                                                                        value={event.socialCopy || ''}
                                                                        onChange={(e) => updateEventField(event.id, 'socialCopy', e.target.value)}
                                                                        rows={4}
                                                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 outline-none text-sm"
                                                                        placeholder="Ej: 🎉 No te pierdas nuestra próxima reunión de club este jueves..."
                                                                    />
                                                                </div>

                                                                <div className="space-y-2">
                                                                    <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-widest">Plataformas de destino</label>
                                                                    <div className="grid grid-cols-1 gap-2">
                                                                        <label className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${event.publishFacebook ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100'}`}>
                                                                            <div className="flex items-center gap-2">
                                                                                <Facebook className={`w-4 h-4 ${event.publishFacebook ? 'text-blue-600' : 'text-gray-300'}`} />
                                                                                <span className={`text-xs font-bold ${event.publishFacebook ? 'text-blue-900' : 'text-gray-400'}`}>Facebook Página</span>
                                                                            </div>
                                                                            <input type="checkbox" checked={!!event.publishFacebook} onChange={e => updateEventField(event.id, 'publishFacebook', e.target.checked)} className="w-4 h-4 accent-blue-600" />
                                                                        </label>

                                                                        <label className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${event.publishLinkedin ? 'bg-sky-50 border-sky-200' : 'bg-white border-gray-100'}`}>
                                                                            <div className="flex items-center gap-2">
                                                                                <Linkedin className={`w-4 h-4 ${event.publishLinkedin ? 'text-sky-700' : 'text-gray-300'}`} />
                                                                                <span className={`text-xs font-bold ${event.publishLinkedin ? 'text-sky-900' : 'text-gray-400'}`}>LinkedIn Perfil</span>
                                                                            </div>
                                                                            <input type="checkbox" checked={!!event.publishLinkedin} onChange={e => updateEventField(event.id, 'publishLinkedin', e.target.checked)} className="w-4 h-4 accent-sky-700" />
                                                                        </label>

                                                                        <label className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${event.publishTwitter ? 'bg-gray-800 border-gray-900 text-white' : 'bg-white border-gray-100'}`}>
                                                                            <div className="flex items-center gap-2">
                                                                                <Twitter className={`w-4 h-4 ${event.publishTwitter ? 'text-white' : 'text-gray-300'}`} />
                                                                                <span className={`text-sm font-bold ${event.publishTwitter ? 'text-white' : 'text-gray-400'}`}>X (Twitter) Feed</span>
                                                                            </div>
                                                                            <input type="checkbox" checked={!!event.publishTwitter} onChange={e => updateEventField(event.id, 'publishTwitter', e.target.checked)} className="w-4 h-4 accent-gray-100" />
                                                                        </label>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="space-y-4">
                                                                <div className="p-4 bg-white border border-gray-100 rounded-2xl shadow-sm">
                                                                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Vista Previa</h4>
                                                                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                                                        <div className="aspect-video bg-gray-200 rounded-lg overflow-hidden mb-2">
                                                                            <img src={event.image || ''} className="w-full h-full object-cover" alt="Event Preview" />
                                                                        </div>
                                                                        <p className="text-[10px] font-black text-blue-600 uppercase tracking-tighter mb-1">PRÓXIMO EVENTO</p>
                                                                        <p className="text-xs font-bold text-gray-900 line-clamp-1 mb-1">{event.title || 'Título del Evento'}</p>
                                                                        <p className="text-[10px] text-gray-500 line-clamp-2 leading-relaxed italic">
                                                                            {event.socialCopy || 'Este evento será compartido automáticamente con tus seguidores...'}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex items-start gap-2">
                                                                    <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                                                                    <p className="text-[10px] text-amber-800 leading-relaxed">
                                                                        <b>Tip de Eventos:</b> Asegúrate de incluir la hora y el lugar en el copy para aumentar la asistencia.
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Save / Delete row */}
                                                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                                                    <button
                                                        onClick={() => handleDelete(event.id)}
                                                        className="flex items-center gap-1 text-red-500 hover:text-red-700 text-sm px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
                                                        <Trash2 className="w-4 h-4" /> Eliminar evento
                                                    </button>
                                                    <button
                                                        onClick={() => handleUpdate(event)}
                                                        disabled={saving === event.id}
                                                        className="flex items-center gap-2 bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 font-medium">
                                                        <Save className="w-4 h-4" />
                                                        {saving === event.id ? 'Guardando...' : 'Guardar todos los cambios'}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                    </div>
                )}

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                    <p>
                        <strong>💡 Tip:</strong> Los eventos aparecen en la página pública ordenados por fecha.
                        Usa la pestaña <strong>Portada & Galería</strong> para subir imágenes directamente a S3,
                        y <strong>Contenido HTML</strong> para añadir detalles ricos como listas, enlaces e imágenes embebidas.
                    </p>
                </div>
            </div>
        </AdminLayout>
    );
};

export default EventsManagement;
