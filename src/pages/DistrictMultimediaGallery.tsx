import React, { useState, useRef } from 'react';
import { UploadCloud, CheckCircle, AlertCircle, Loader2, X, Image as ImageIcon, Film } from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useClub } from '../contexts/ClubContext';

const API = import.meta.env.VITE_API_URL || '/api';

const DistrictMultimediaGallery: React.FC = () => {
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

    // File state
    const [files, setFiles] = useState<File[]>([]);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    const validateFiles = (newFiles: File[]) => {
        const errorMessages: string[] = [];
        const combinedFiles = [...files, ...newFiles];

        const imgFiles = combinedFiles.filter(f => f.type.startsWith('image/'));
        const vidFiles = combinedFiles.filter(f => f.type.startsWith('video/'));

        if (imgFiles.length > 10) errorMessages.push('Máximo 10 fotografías.');
        if (vidFiles.length > 3) errorMessages.push('Máximo 3 videos.');

        combinedFiles.forEach(file => {
            const isImage = file.type.startsWith('image/');
            const isVideo = file.type.startsWith('video/');
            if (!isImage && !isVideo) {
                errorMessages.push(`El archivo ${file.name} no tiene un formato válido.`);
            }
            if (isImage && file.size > 10 * 1024 * 1024) {
                errorMessages.push(`La imagen ${file.name} supera los 10MB.`);
            }
            if (isVideo && file.size > 80 * 1024 * 1024) {
                errorMessages.push(`El video ${file.name} supera los 80MB.`);
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
        if (validateFiles(incomingFiles)) {
            setFiles(prev => [...prev, ...incomingFiles]);
        }
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFiles(Array.from(e.dataTransfer.files));
        }
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
        setError('');
    };

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (files.length === 0) {
            setError('Por favor suba al menos una fotografía o video.');
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            const uploadedFiles = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                // 1. Obtener Presigned URL
                const presignRes = await fetch(`${API}/public/district-media/presign?fileName=${encodeURIComponent(file.name)}&fileType=${encodeURIComponent(file.type)}`);
                if (!presignRes.ok) throw new Error(`Error al preparar el archivo: ${file.name}`);
                const { uploadUrl, url } = await presignRes.json();
                
                // 2. Subir directo a S3
                const uploadRes = await fetch(uploadUrl, {
                    method: 'PUT',
                    body: file,
                    headers: { 'Content-Type': file.type }
                });
                
                if (!uploadRes.ok) throw new Error(`Error de conexión al subir: ${file.name}`);
                
                uploadedFiles.push({
                    originalName: file.name,
                    url,
                    size: file.size,
                    mimetype: file.type
                });
            }

            // 3. Enviar Formulario Final (JSON Payload Ligero)
            const res = await fetch(`${API}/public/district-media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    firstName: formData.firstName,
                    lastName: formData.lastName,
                    email: formData.email,
                    phone: `${formData.phoneCode} ${formData.phone}`,
                    clubName: formData.clubName,
                    role: formData.role,
                    message: formData.message,
                    uploadedFiles
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al subir los archivos.');

            setSuccess(true);
            setFiles([]);
            setFormData({
                firstName: '', lastName: '', email: '', phoneCode: '+57', phone: '',
                clubName: '', role: '', message: ''
            });
        } catch (err: any) {
            setError(err.message || 'Error de conexión. Inténtelo de nuevo.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-rotary-concrete font-sans flex flex-col">
            <Navbar />
            
            {/* Header Hero */}
            <section className="bg-rotary-geo pt-32 pb-16 px-6 relative border-t-[6px] border-[#013388]">
                <div className="max-w-4xl mx-auto text-center relative z-10">
                    <p className="text-white/80 font-bold uppercase tracking-[0.2em] text-sm mb-4">
                        CONFERENCIA BIDISTRITAL ROTARY MEDELLÍN 2026
                    </p>
                    <h1 className="text-4xl md:text-5xl font-normal text-white drop-shadow-md">
                        Galería Multimedia del Club
                    </h1>
                </div>
            </section>

            {/* Main Content */}
            <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                
                {/* Intro Info */}
                <div className="mb-10 text-gray-700">
                    <h2 className="text-xl md:text-2xl font-bold mb-6 text-gray-900 leading-snug">
                        La Conferencia Bidistrital Rotary 4271 - 4281 "Unidos para Hacer el Bien", será un espacio para celebrar el impacto de nuestros clubes y compartir historias que inspiran.
                    </h2>
                    
                    <p className="mb-6 leading-relaxed">
                        🌟 La Gobernadora Ximena Caicedo y el Comité Organizador de la Conferencia Bidistrital Rotary 4271 - 4281 Medellín 2026, invitan a todos los clubes rotarios a compartir sus fotografías oficiales de sus actividades, videos de proyectos o eventos de nuestro «Servicio en Acción» realizados durante el año rotario 2025-2026.
                    </p>

                    <p className="mb-6 leading-relaxed">
                        Este registro multimedia será parte del <strong>mural digital</strong> y de la <strong>galería de reconocimiento</strong> de la conferencia en Medellín.
                    </p>

                    <p className="font-medium mb-4">
                        Por favor, diligencie el siguiente formulario y adjunte sus archivos siguiendo las recomendaciones:
                    </p>

                    <ul className="list-disc list-inside space-y-2 font-medium text-gray-800">
                        <li>Máximo <strong>10 fotografías</strong> por envío (formatos <strong>JPG</strong> o <strong>PNG</strong>, hasta <strong>10 MB</strong> cada una) y <strong>3 videos</strong> (formatos .mov, .mp4).</li>
                    </ul>
                </div>

                {/* Form Card */}
                <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
                    {success ? (
                        <div className="p-12 text-center">
                            <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
                                <CheckCircle className="w-10 h-10 text-green-500" />
                            </div>
                            <h3 className="text-2xl font-black text-gray-900 mb-2">¡Archivos Enviados!</h3>
                            <p className="text-gray-500 max-w-sm mx-auto mb-8">
                                Su material multimedia ha sido recibido con éxito. Formará parte esencial del mural digital de la Conferencia Bidistrital.
                            </p>
                            <button
                                onClick={() => setSuccess(false)}
                                className="bg-[#013388] hover:bg-blue-800 text-white px-8 py-3 rounded-xl font-bold transition-colors"
                            >
                                Enviar más contenido
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={onSubmit} className="p-6 md:p-10 space-y-8">
                            
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 mb-6">Comparta la historia de su club aquí:</h3>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Primer Nombre</label>
                                        <input 
                                            type="text" required
                                            placeholder="Escriba su primer nombre"
                                            value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})}
                                            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#013388]/20 focus:border-[#013388]"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Primer Apellido</label>
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
                                            placeholder="Escriba su dirección de email"
                                            value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})}
                                            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#013388]/20 focus:border-[#013388]"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Número de contacto de WhatsApp <span className="text-red-500">*</span></label>
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
                                            </select>
                                            <input 
                                                type="tel" required
                                                placeholder="Escriba su número de celular"
                                                value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})}
                                                className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#013388]/20 focus:border-[#013388]"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Club Rotario <span className="text-red-500">*</span></label>
                                        <input 
                                            type="text" required
                                            placeholder="Escriba el nombre del club rotario"
                                            value={formData.clubName} onChange={e => setFormData({...formData, clubName: e.target.value})}
                                            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#013388]/20 focus:border-[#013388]"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Seleccione un cargo o rol en Rotary <span className="text-red-500">*</span></label>
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
                                <label className="block text-sm font-medium text-gray-800 mb-4">
                                    Suba sus imágenes o videos de las actividades, eventos, reuniones o proyectos del club
                                </label>
                                
                                <div 
                                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-blue-200 bg-[#f4f7fb]'}`}
                                    onDragEnter={e => { e.preventDefault(); setDragActive(true); }}
                                    onDragLeave={e => { e.preventDefault(); setDragActive(false); }}
                                    onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                                    onDrop={onDrop}
                                >
                                    <input 
                                        type="file" multiple ref={fileInputRef} className="hidden"
                                        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/x-m4v,video/*"
                                        onChange={e => { if (e.target.files) handleFiles(Array.from(e.target.files)); }}
                                    />
                                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <UploadCloud className="w-6 h-6 text-gray-500" />
                                    </div>
                                    <p className="text-sm text-gray-600 mb-1">Drag and drop files here</p>
                                    <p className="text-xs text-gray-400 mb-4">OR</p>
                                    <button 
                                        type="button" 
                                        onClick={() => fileInputRef.current?.click()}
                                        className="bg-[#4285F4] hover:bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
                                    >
                                        Browse Files
                                    </button>
                                </div>

                                {/* File List Preview */}
                                {files.length > 0 && (
                                    <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                        {files.map((f, i) => (
                                            <div key={i} className="relative group bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center gap-2">
                                                {f.type.startsWith('video/') ? (
                                                    <Film className="w-5 h-5 text-gray-400 flex-shrink-0" />
                                                ) : (
                                                    <ImageIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                                                )}
                                                <span className="text-xs text-gray-600 truncate flex-1" title={f.name}>{f.name}</span>
                                                <button 
                                                    type="button" onClick={() => removeFile(i)}
                                                    className="w-5 h-5 bg-red-100 hover:bg-red-200 rounded items-center justify-center flex flex-shrink-0 absolute -top-2 -right-2 shadow-sm transition-colors"
                                                >
                                                    <X className="w-3 h-3 text-red-600" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Additional Message */}
                            <div>
                                <label className="flex gap-2 items-center text-sm font-bold text-gray-700 mb-2">
                                    💬 Mensaje adicional (opcional):
                                </label>
                                <textarea 
                                    rows={3}
                                    placeholder="✍️ Déjenos sus comentarios, reflexiones o detalles sobre los archivos subidos..."
                                    value={formData.message} onChange={e => setFormData({...formData, message: e.target.value})}
                                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#013388]/20 focus:border-[#013388]"
                                />
                            </div>

                            {/* Errors */}
                            {error && (
                                <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm flex items-start gap-3 border border-red-100">
                                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                    <p>{error}</p>
                                </div>
                            )}

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-[200px] flex items-center justify-center gap-2 bg-[#4285F4] hover:bg-blue-600 disabled:opacity-70 disabled:cursor-not-allowed text-white px-6 py-3.5 rounded-lg font-medium transition-colors text-sm uppercase tracking-wide"
                            >
                                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                {isSubmitting ? 'SUBIENDO...' : 'SUBIR CONTENIDO'}
                            </button>
                        </form>
                    )}
                </div>
            </main>
            
            <Footer />
        </div>
    );
};

export default DistrictMultimediaGallery;
