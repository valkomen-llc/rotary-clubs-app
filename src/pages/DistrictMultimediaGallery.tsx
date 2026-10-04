import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import { UploadCloud, CheckCircle, AlertCircle, Loader2, X, Image as ImageIcon, Film, Play, Eye, RefreshCw, Plus } from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useClub } from '../contexts/ClubContext';

const API = import.meta.env.VITE_API_URL || '/api';

interface UploadedFileRecord {
    originalName: string;
    url: string;
    size: number;
    mimetype: string;
    s3Key?: string;
}

const ROLES = [
    'Presidente',
    'Secretario',
    'Tesorero',
    'Comité de Imagen Pública',
    'Comité de Proyectos',
    'Comité de La Fundación Rotaria',
    'Membresía',
    'Socio Activo',
    'Otro'
];

export const getFileKind = (file: { name: string; type?: string }): 'image' | 'video' | 'unknown' => {
    const mime = (file.type || '').toLowerCase();
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'webp', 'svg', 'gif'].includes(ext)) return 'image';
    if (['mp4', 'mov', 'webm', 'm4v', 'avi'].includes(ext)) return 'video';
    return 'unknown';
};

export const resolveMimeType = (file: File): string => {
    if (file.type && file.type !== 'application/octet-stream') return file.type;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (['mp4', 'm4v'].includes(ext)) return 'video/mp4';
    if (ext === 'mov') return 'video/quicktime';
    if (ext === 'webm') return 'video/webm';
    if (['jpg', 'jpeg'].includes(ext)) return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'svg') return 'image/svg+xml';
    return 'application/octet-stream';
};

const formatFileSize = (bytes: number): string => {
    if (!bytes || isNaN(bytes)) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb < 1) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${mb.toFixed(1)} MB`;
};

const DistrictMultimediaGallery: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const { id: paramId } = useParams();
    const editId = paramId || searchParams.get('id') || searchParams.get('edit') || searchParams.get('submission');

    const [currentId, setCurrentId] = useState<string | null>(editId);
    const [isLoadingRecord, setIsLoadingRecord] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');
    
    // Form state
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        phoneCode: '+57',
        phone: '',
        clubName: '',
        role: '',
        message: ''
    });

    // File state: Existing files (when editing) + New files queued for upload
    const [existingFiles, setExistingFiles] = useState<UploadedFileRecord[]>([]);
    const [newFiles, setNewFiles] = useState<File[]>([]);
    const [newPreviews, setNewPreviews] = useState<{ [key: string]: string }>({});
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Progress indicator for uploads
    const [uploadProgress, setUploadProgress] = useState<{
        current: number;
        total: number;
        fileName: string;
        percent: number;
    } | null>(null);

    // Load existing record when editId is provided
    useEffect(() => {
        if (!editId) return;
        const fetchRecord = async () => {
            setIsLoadingRecord(true);
            setError('');
            try {
                const res = await fetch(`${API}/public/district-media/${editId}`);
                if (!res.ok) throw new Error('No se encontró el registro para editar.');
                const data = await res.json();
                setCurrentId(data.id || editId);
                setFormData({
                    firstName: data.firstName || '',
                    lastName: data.lastName || '',
                    email: data.email || '',
                    phoneCode: data.phone?.includes(' ') ? data.phone.split(' ')[0] : '+57',
                    phone: data.phone?.includes(' ') ? data.phone.split(' ').slice(1).join(' ') : (data.phone || ''),
                    clubName: data.clubName || '',
                    role: data.role || '',
                    message: data.message || ''
                });
                setExistingFiles(data.files || []);
            } catch (err: any) {
                console.error('Error loading existing record:', err);
                setError(err.message || 'Error al cargar el registro existente');
            } finally {
                setIsLoadingRecord(false);
            }
        };
        fetchRecord();
    }, [editId]);

    // Generate local preview URLs for newly added files
    useEffect(() => {
        const urls: { [key: string]: string } = {};
        newFiles.forEach((file, index) => {
            const kind = getFileKind(file);
            if (kind === 'image' || kind === 'video') {
                urls[`${file.name}-${index}`] = URL.createObjectURL(file);
            }
        });
        setNewPreviews(urls);

        return () => {
            Object.values(urls).forEach(url => URL.revokeObjectURL(url));
        };
    }, [newFiles]);

    const validateFiles = (incomingFiles: File[]) => {
        const errorMessages: string[] = [];

        // Count combined images & videos (existing + queued + incoming)
        const allFiles = [
            ...existingFiles.map(f => ({ name: f.originalName, type: f.mimetype, size: f.size })),
            ...newFiles.map(f => ({ name: f.name, type: f.type, size: f.size })),
            ...incomingFiles.map(f => ({ name: f.name, type: f.type, size: f.size }))
        ];

        const imgFiles = allFiles.filter(f => getFileKind(f) === 'image');
        const vidFiles = allFiles.filter(f => getFileKind(f) === 'video');

        if (imgFiles.length > 10) errorMessages.push('Máximo 10 fotografías permitidas en total.');
        if (vidFiles.length > 3) errorMessages.push('Máximo 3 videos permitidos en total.');

        incomingFiles.forEach(file => {
            const kind = getFileKind(file);
            if (kind === 'unknown') {
                errorMessages.push(`El archivo "${file.name}" no tiene un formato admitido (use JPG, PNG, WEBP, SVG, MP4, MOV).`);
            }
            if (kind === 'image' && file.size > 10 * 1024 * 1024) {
                errorMessages.push(`La imagen "${file.name}" supera el límite de 10MB (${formatFileSize(file.size)}).`);
            }
            if (kind === 'video' && file.size > 200 * 1024 * 1024) {
                errorMessages.push(`El video "${file.name}" supera el límite de 200MB (${formatFileSize(file.size)}).`);
            }
        });

        if (errorMessages.length > 0) {
            setError(errorMessages[0]);
            return false;
        }
        setError('');
        return true;
    };

    const handleFiles = (incomingFiles: File[]) => {
        if (incomingFiles.length === 0) return;
        if (validateFiles(incomingFiles)) {
            setNewFiles(prev => [...prev, ...incomingFiles]);
        }
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFiles(Array.from(e.dataTransfer.files));
        }
    };

    const removeNewFile = (index: number) => {
        setNewFiles(prev => prev.filter((_, i) => i !== index));
        setError('');
    };

    const removeExistingFile = (index: number) => {
        setExistingFiles(prev => prev.filter((_, i) => i !== index));
        setError('');
    };

    // Upload with real-time percentage progress tracking
    const uploadToS3WithProgress = (
        uploadUrl: string, 
        file: File, 
        contentType: string, 
        onProgress: (pct: number) => void
    ): Promise<void> => {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', uploadUrl);
            xhr.setRequestHeader('Content-Type', contentType);
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const pct = Math.round((e.loaded / e.total) * 100);
                    onProgress(pct);
                }
            };
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) resolve();
                else reject(new Error(`Error al subir a almacenamiento (${xhr.status} ${xhr.statusText})`));
            };
            xhr.onerror = () => reject(new Error(`Error de conexión al transferir "${file.name}".`));
            xhr.ontimeout = () => reject(new Error(`Tiempo agotado al subir "${file.name}".`));
            xhr.timeout = 180000; // 3 min timeout for larger 200MB video files
            xhr.send(file);
        });
    };

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const totalFilesCount = existingFiles.length + newFiles.length;
        if (totalFilesCount === 0) {
            setError('Por favor adjunte al menos una fotografía o video.');
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            const uploadedNewList: UploadedFileRecord[] = [];

            // 1. Subir los archivos nuevos directo a S3 vía presigned URL
            for (let i = 0; i < newFiles.length; i++) {
                const file = newFiles[i];
                const mimeType = resolveMimeType(file);

                setUploadProgress({
                    current: i + 1,
                    total: newFiles.length,
                    fileName: file.name,
                    percent: 0
                });

                // Solicitar presigned URL al backend
                const presignRes = await fetch(
                    `${API}/public/district-media/presign?fileName=${encodeURIComponent(file.name)}&fileType=${encodeURIComponent(mimeType)}`
                );
                if (!presignRes.ok) {
                    const errJson = await presignRes.json().catch(() => ({}));
                    throw new Error(errJson.error || `Error al preparar la carga de: ${file.name}`);
                }
                const { uploadUrl, url, s3Key } = await presignRes.json();

                // Carga directa a S3 con progreso
                await uploadToS3WithProgress(uploadUrl, file, mimeType, (pct) => {
                    setUploadProgress(prev => prev ? { ...prev, percent: pct } : null);
                });

                uploadedNewList.push({
                    originalName: file.name,
                    url,
                    size: file.size,
                    mimetype: mimeType,
                    s3Key
                });
            }

            // 2. Combinar archivos existentes (conservados) + recién cargados
            const finalFiles = [...existingFiles, ...uploadedNewList];

            // 3. Persistir en la API (POST para nuevo, PUT para edición)
            const endpoint = currentId 
                ? `${API}/public/district-media/${currentId}` 
                : `${API}/public/district-media`;
            const method = currentId ? 'PUT' : 'POST';

            const res = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    firstName: formData.firstName,
                    lastName: formData.lastName,
                    email: formData.email,
                    phone: `${formData.phoneCode} ${formData.phone}`,
                    clubName: formData.clubName,
                    role: formData.role,
                    message: formData.message,
                    uploadedFiles: finalFiles
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al guardar los archivos en el servidor.');

            const savedId = data.id || currentId || data.submissionId;
            setCurrentId(savedId);
            setExistingFiles(finalFiles);
            setNewFiles([]);
            setSuccess(true);

            // Actualizar URL sin recargar para que al dar F5 continúe cargando este registro
            if (savedId) {
                const url = new URL(window.location.href);
                url.searchParams.set('id', savedId);
                window.history.replaceState(null, '', url.toString());
            }
        } catch (err: any) {
            console.error('Submit error:', err);
            setError(err.message || 'Error de conexión. Inténtelo de nuevo.');
        } finally {
            setIsSubmitting(false);
            setUploadProgress(null);
        }
    };

    const handleStartNew = () => {
        setSuccess(false);
        setCurrentId(null);
        setExistingFiles([]);
        setNewFiles([]);
        setFormData({
            firstName: '', lastName: '', email: '', phoneCode: '+57', phone: '',
            clubName: '', role: '', message: ''
        });
        const url = new URL(window.location.href);
        url.searchParams.delete('id');
        url.searchParams.delete('edit');
        url.searchParams.delete('submission');
        window.history.replaceState(null, '', url.toString());
    };

    return (
        <div className="min-h-screen bg-rotary-concrete font-sans flex flex-col">
            <Navbar />
            
            {/* Header Hero */}
            <section
                className="relative overflow-hidden"
                style={{
                    backgroundColor: '#0c3c7c',
                    backgroundImage: "url('/geo-darkblue.png')",
                    backgroundPosition: '50% 0',
                    backgroundRepeat: 'repeat',
                    backgroundSize: '71px 85px'
                }}
            >
                <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 md:pt-36 pb-16 md:pb-24">
                    <div className="text-center max-w-4xl mx-auto flex flex-col justify-center h-full">
                        <p className="text-white/80 text-sm md:text-base tracking-widest uppercase mb-4 font-bold">
                            Conferencia Bidistrital Rotary Medellín 2026
                        </p>
                        <h1 className="text-3xl md:text-5xl text-white font-black tracking-tight">
                            Rotary En Acción · Galería Multimedia
                        </h1>
                        <p className="text-white/90 text-sm md:text-base mt-3 max-w-2xl mx-auto font-medium">
                            {currentId ? 'Modo de Edición: Gestiona y actualiza las imágenes y videos de tu club' : 'Comparte las imágenes y videos oficiales del impacto de tu club'}
                        </p>
                    </div>
                </div>
            </section>

            {/* Main Content */}
            <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
                
                {/* Intro Info */}
                <div className="mb-10 text-gray-700">
                    <h2 className="text-xl md:text-2xl font-bold mb-4 text-gray-900 leading-snug">
                        La Conferencia Bidistrital Rotary 4271 - 4281 "Unidos para Hacer el Bien", celebrará el impacto de nuestros clubes rotarios.
                    </h2>
                    
                    <p className="mb-4 leading-relaxed">
                        🌟 La Gobernadora Ximena Caicedo y el Comité Organizador invitan a todos los clubes rotarios a compartir sus fotografías oficiales de sus actividades, videos de proyectos o eventos de nuestro «Servicio en Acción» realizados durante el año rotario 2025-2026.
                    </p>

                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs md:text-sm text-blue-900 font-medium space-y-1">
                        <p className="font-bold flex items-center gap-1.5 text-blue-950">
                            📌 Reglas de carga de archivos:
                        </p>
                        <p>• Máximo <strong>10 fotografías</strong> (formatos JPG, JPEG, PNG, WEBP, hasta <strong>10 MB</strong> cada una).</p>
                        <p>• Máximo <strong>3 videos</strong> (formatos MP4, MOV, hasta <strong>200 MB</strong> cada uno con carga optimizada).</p>
                    </div>
                </div>

                {isLoadingRecord ? (
                    <div className="bg-white rounded-2xl shadow-xl p-16 text-center border border-gray-100 flex flex-col items-center justify-center">
                        <Loader2 className="w-10 h-10 text-rotary-blue animate-spin mb-4" />
                        <p className="text-sm font-bold text-gray-600">Cargando registro de Rotary En Acción...</p>
                    </div>
                ) : (
                    /* Form Card */
                    <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
                        {success ? (
                            <div className="p-8 md:p-12 text-center">
                                <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <CheckCircle className="w-10 h-10 text-green-500" />
                                </div>
                                <h3 className="text-2xl font-black text-gray-900 mb-2">¡Archivos Guardados con Éxito!</h3>
                                <p className="text-gray-600 max-w-md mx-auto mb-6 text-sm">
                                    Tu material multimedia ha sido almacenado de forma segura y queda asociado al registro de tu club en el mural digital de la Conferencia Bidistrital.
                                </p>

                                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 max-w-md mx-auto mb-8 text-left text-xs space-y-1 text-gray-700">
                                    <p className="font-bold text-gray-900">Resumen del registro:</p>
                                    <p>• Club: <span className="font-semibold text-rotary-blue">{formData.clubName || 'N/A'}</span></p>
                                    <p>• Contacto: <span className="font-semibold">{formData.firstName} {formData.lastName} ({formData.email})</span></p>
                                    <p>• Archivos asociados: <span className="font-semibold">{existingFiles.length} archivo(s) guardado(s)</span></p>
                                </div>

                                <div className="flex flex-wrap items-center justify-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setSuccess(false)}
                                        className="bg-[#013388] hover:bg-blue-800 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-colors flex items-center gap-2"
                                    >
                                        <Eye className="w-4 h-4" /> Ver / Editar este registro
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleStartNew}
                                        className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-6 py-2.5 rounded-xl font-bold text-sm transition-colors flex items-center gap-2"
                                    >
                                        <Plus className="w-4 h-4" /> Enviar nuevo registro
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={onSubmit} className="p-6 md:p-10 space-y-8">
                                
                                {currentId && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between text-xs text-amber-900 font-medium">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                                            <span>Editando registro existente: <strong className="font-mono">{currentId}</strong></span>
                                        </div>
                                        <button 
                                            type="button" 
                                            onClick={handleStartNew}
                                            className="text-amber-800 underline font-bold hover:text-amber-950 ml-4"
                                        >
                                            Crear nuevo en su lugar
                                        </button>
                                    </div>
                                )}

                                <div>
                                    <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                                        <span>1. Información del Socio y Club:</span>
                                    </h3>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-1.5">Primer Nombre <span className="text-red-500">*</span></label>
                                            <input 
                                                type="text" required
                                                placeholder="Escriba su primer nombre"
                                                value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})}
                                                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#013388]/20 focus:border-[#013388]"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-1.5">Primer Apellido <span className="text-red-500">*</span></label>
                                            <input 
                                                type="text" required
                                                placeholder="Escriba su primer apellido"
                                                value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})}
                                                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#013388]/20 focus:border-[#013388]"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-1.5">Email <span className="text-red-500">*</span></label>
                                            <input 
                                                type="email" required
                                                placeholder="ejemplo@rotary.org"
                                                value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})}
                                                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#013388]/20 focus:border-[#013388]"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-1.5">WhatsApp de contacto <span className="text-red-500">*</span></label>
                                            <div className="flex gap-2">
                                                <select 
                                                    value={formData.phoneCode} 
                                                    onChange={e => setFormData({...formData, phoneCode: e.target.value})}
                                                    className="bg-white border border-gray-200 rounded-xl px-2 py-3 text-sm focus:outline-none focus:border-[#013388] cursor-pointer w-[100px]"
                                                >
                                                    <option value="+57">🇨🇴 +57</option>
                                                    <option value="+1">🇺🇸 +1</option>
                                                    <option value="+52">🇲🇽 +52</option>
                                                    <option value="+34">🇪🇸 +34</option>
                                                    <option value="+54">🇦🇷 +54</option>
                                                    <option value="+56">🇨🇱 +56</option>
                                                    <option value="+51">🇵🇪 +51</option>
                                                </select>
                                                <input 
                                                    type="tel" required
                                                    placeholder="300 123 4567"
                                                    value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})}
                                                    className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#013388]/20 focus:border-[#013388]"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-1.5">Club Rotario <span className="text-red-500">*</span></label>
                                            <input 
                                                type="text" required
                                                placeholder="Ej. Rotary Club Medellín El Poblado"
                                                value={formData.clubName} onChange={e => setFormData({...formData, clubName: e.target.value})}
                                                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#013388]/20 focus:border-[#013388]"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-1.5">Cargo o rol en Rotary <span className="text-red-500">*</span></label>
                                            <select 
                                                required
                                                value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})}
                                                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#013388]/20 focus:border-[#013388] cursor-pointer"
                                            >
                                                <option value="">- Seleccione -</option>
                                                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <hr className="border-gray-100" />

                                {/* File Upload Area */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="block text-sm font-bold text-gray-800">
                                            2. Fotografías y Videos de “Rotary En Acción”:
                                        </label>
                                        <span className="text-xs font-semibold text-gray-500">
                                            Total: {existingFiles.length + newFiles.length} archivo(s)
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 mb-4">
                                        Selecciona imágenes (JPG, PNG, WEBP hasta 10MB) o videos (MP4, MOV hasta 200MB).
                                    </p>
                                    
                                    {/* Drag & Drop Zone */}
                                    <div 
                                        className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${dragActive ? 'border-[#013388] bg-blue-50/60' : 'border-gray-200 hover:border-[#013388]/50 bg-[#f8fafc]'}`}
                                        onDragEnter={e => { e.preventDefault(); setDragActive(true); }}
                                        onDragLeave={e => { e.preventDefault(); setDragActive(false); }}
                                        onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                                        onDrop={onDrop}
                                    >
                                        <input 
                                            type="file" multiple ref={fileInputRef} className="hidden"
                                            accept=".jpg,.jpeg,.png,.webp,.svg,.mov,.mp4,.m4v,.webm"
                                            onChange={e => { if (e.target.files) handleFiles(Array.from(e.target.files)); }}
                                        />
                                        <div className="w-14 h-14 bg-white shadow-sm border border-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3 text-rotary-blue">
                                            <UploadCloud className="w-7 h-7" />
                                        </div>
                                        <p className="text-sm font-bold text-gray-800 mb-1">Arrastra y suelta imágenes o videos aquí</p>
                                        <p className="text-xs text-gray-400 mb-4">Compatible con fotos JPG/PNG y videos MP4/MOV</p>
                                        <button 
                                            type="button" 
                                            onClick={() => fileInputRef.current?.click()}
                                            className="bg-[#013388] hover:bg-blue-800 text-white px-6 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all shadow-md active:scale-95 inline-flex items-center gap-2"
                                        >
                                            <Plus className="w-4 h-4" /> Seleccionar Archivos
                                        </button>
                                    </div>

                                    {/* Upload Progress Bar (when submitting) */}
                                    {uploadProgress && (
                                        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
                                            <div className="flex items-center justify-between text-xs font-bold text-blue-900">
                                                <span>Subiendo ({uploadProgress.current}/{uploadProgress.total}): {uploadProgress.fileName}</span>
                                                <span>{uploadProgress.percent}%</span>
                                            </div>
                                            <div className="w-full bg-blue-200 rounded-full h-2.5 overflow-hidden">
                                                <div 
                                                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                                                    style={{ width: `${uploadProgress.percent}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* PREVIEWS: Existing Files (Saved) + New Files (Queued) */}
                                    {(existingFiles.length > 0 || newFiles.length > 0) && (
                                        <div className="mt-6 space-y-4">
                                            {/* Previously uploaded files */}
                                            {existingFiles.length > 0 && (
                                                <div>
                                                    <p className="text-xs font-black text-emerald-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                                        <CheckCircle className="w-4 h-4" /> Archivos previamente guardados ({existingFiles.length}):
                                                    </p>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                                        {existingFiles.map((file, i) => {
                                                            const isVideo = file.mimetype?.includes('video') || /\.(mp4|mov|webm)$/i.test(file.originalName);
                                                            return (
                                                                <div key={`existing-${i}`} className="relative bg-white border border-emerald-200 rounded-xl p-3 shadow-sm flex flex-col justify-between overflow-hidden group">
                                                                    <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden mb-2 relative flex items-center justify-center">
                                                                        {isVideo ? (
                                                                            <video 
                                                                                src={file.url} 
                                                                                controls 
                                                                                className="w-full h-full object-cover" 
                                                                                preload="metadata"
                                                                            />
                                                                        ) : (
                                                                            <img 
                                                                                src={file.url} 
                                                                                alt={file.originalName} 
                                                                                className="w-full h-full object-cover" 
                                                                            />
                                                                        )}
                                                                        <span className="absolute top-1.5 left-1.5 bg-emerald-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow">
                                                                            GUARDADO
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex items-center justify-between text-xs gap-2 min-w-0">
                                                                        <div className="truncate flex-1">
                                                                            <p className="font-bold text-gray-800 truncate" title={file.originalName}>{file.originalName}</p>
                                                                            <p className="text-[10px] text-gray-400">{formatFileSize(file.size)}</p>
                                                                        </div>
                                                                        <button 
                                                                            type="button" 
                                                                            onClick={() => removeExistingFile(i)}
                                                                            title="Eliminar archivo"
                                                                            className="w-7 h-7 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg flex items-center justify-center transition-colors shrink-0"
                                                                        >
                                                                            <X className="w-4 h-4" />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Newly added files */}
                                            {newFiles.length > 0 && (
                                                <div>
                                                    <p className="text-xs font-black text-blue-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                                        <Plus className="w-4 h-4" /> Archivos nuevos listos para subir ({newFiles.length}):
                                                    </p>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                                        {newFiles.map((file, i) => {
                                                            const kind = getFileKind(file);
                                                            const previewUrl = newPreviews[`${file.name}-${i}`];
                                                            return (
                                                                <div key={`new-${i}`} className="relative bg-white border border-blue-200 rounded-xl p-3 shadow-sm flex flex-col justify-between overflow-hidden group">
                                                                    <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden mb-2 relative flex items-center justify-center">
                                                                        {kind === 'video' ? (
                                                                            previewUrl ? (
                                                                                <video 
                                                                                    src={previewUrl} 
                                                                                    className="w-full h-full object-cover" 
                                                                                    controls
                                                                                    preload="metadata"
                                                                                />
                                                                            ) : (
                                                                                <Film className="w-8 h-8 text-blue-500" />
                                                                            )
                                                                        ) : previewUrl ? (
                                                                            <img 
                                                                                src={previewUrl} 
                                                                                alt={file.name} 
                                                                                className="w-full h-full object-cover" 
                                                                            />
                                                                        ) : (
                                                                            <ImageIcon className="w-8 h-8 text-blue-500" />
                                                                        )}
                                                                        <span className="absolute top-1.5 left-1.5 bg-blue-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow">
                                                                            NUEVO
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex items-center justify-between text-xs gap-2 min-w-0">
                                                                        <div className="truncate flex-1">
                                                                            <p className="font-bold text-gray-800 truncate" title={file.name}>{file.name}</p>
                                                                            <p className="text-[10px] text-gray-400">{formatFileSize(file.size)} · {kind === 'video' ? 'Video' : 'Imagen'}</p>
                                                                        </div>
                                                                        <button 
                                                                            type="button" 
                                                                            onClick={() => removeNewFile(i)}
                                                                            title="Quitar archivo"
                                                                            className="w-7 h-7 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg flex items-center justify-center transition-colors shrink-0"
                                                                        >
                                                                            <X className="w-4 h-4" />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Additional Message */}
                                <div>
                                    <label className="flex gap-2 items-center text-sm font-bold text-gray-700 mb-2">
                                        💬 Mensaje o contexto adicional (opcional):
                                    </label>
                                    <textarea 
                                        rows={3}
                                        placeholder="✍️ Breve descripción de la actividad, proyecto o fecha del material compartido..."
                                        value={formData.message} onChange={e => setFormData({...formData, message: e.target.value})}
                                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#013388]/20 focus:border-[#013388]"
                                    />
                                </div>

                                {/* Error Alert */}
                                {error && (
                                    <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm flex items-start gap-3 border border-red-200">
                                        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
                                        <div className="flex-1">
                                            <p className="font-bold">Error en la carga</p>
                                            <p className="text-xs mt-0.5">{error}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Submit Button */}
                                <div className="flex items-center gap-4 pt-2">
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="flex items-center justify-center gap-2 bg-[#013388] hover:bg-blue-800 disabled:opacity-70 disabled:cursor-not-allowed text-white px-8 py-3.5 rounded-xl font-bold transition-all text-sm uppercase tracking-wide shadow-lg active:scale-95"
                                    >
                                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                        {isSubmitting 
                                            ? (uploadProgress ? `Subiendo (${uploadProgress.percent}%)...` : 'Guardando...') 
                                            : (currentId ? 'Actualizar y Guardar' : 'Guardar y Subir Archivos')}
                                    </button>

                                    {currentId && (
                                        <button
                                            type="button"
                                            onClick={handleStartNew}
                                            disabled={isSubmitting}
                                            className="text-xs font-bold text-gray-500 hover:text-gray-800 px-4 py-2"
                                        >
                                            Cancelar edición
                                        </button>
                                    )}
                                </div>
                            </form>
                        )}
                    </div>
                )}
            </main>
            
            <Footer />
        </div>
    );
};

export default DistrictMultimediaGallery;
