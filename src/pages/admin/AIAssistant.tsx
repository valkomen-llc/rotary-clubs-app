import React, { useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import {
    Sparkles, FileText, Upload, CheckCircle2,
    AlertCircle, ArrowRight, Loader2, Save
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../hooks/useAuth';

const AIAssistant: React.FC = () => {
    const { user } = useAuth();
    const [step, setStep] = useState(1);
    const [isProcessing, setIsProcessing] = useState(false);
    const [scannedData, setScannedData] = useState<any>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            setStep(2);
        }
    };

    const processWithAI = async () => {
        if (!selectedFile) return;
        setIsProcessing(true);

        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('clubId', user?.clubId || '');

        try {
            const token = localStorage.getItem('rotary_token');
            // This endpoint will forward the file to n8n for processing
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/ai/process-document`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (response.ok) {
                const data = await response.json();
                setScannedData(data.sections);
                setStep(3);
                toast.success('Documento analizado con éxito');
            } else {
                toast.error('Error al procesar el documento con IA');
            }
        } catch (error) {
            toast.error('Error de conexión con el agente de IA');
        } finally {
            setIsProcessing(false);
        }
    };

    const saveAIContent = async () => {
        setIsProcessing(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/sections/batch-upsert`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    clubId: user?.clubId,
                    sections: scannedData
                })
            });

            if (response.ok) {
                toast.success('Contenido del sitio actualizado correctamente');
                setStep(4);
            }
        } catch (error) {
            toast.error('Error al guardar los cambios');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <AdminLayout>
            <div className="max-w-4xl mx-auto">
                <div className="mb-8 text-center">
                    <div className="inline-flex p-3 bg-sky-50 text-rotary-blue rounded-2xl mb-4 border border-sky-100 shadow-sm animate-pulse">
                        <Sparkles className="w-8 h-8" />
                    </div>
                    <h1 className="text-3xl font-bold text-gray-800">Asistente de Configuración IA</h1>
                    <p className="text-gray-500 mt-2">Carga documentos de tu club y deja que nuestra IA configure tu sitio por ti.</p>
                </div>

                {/* Progress Steps */}
                <div className="flex justify-between mb-12 relative px-10">
                    <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-100 -translate-y-1/2 z-0" />
                    {[1, 2, 3, 4].map((s) => (
                        <div key={s} className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${step >= s ? 'bg-rotary-blue text-white shadow-lg' : 'bg-white border-2 border-gray-100 text-gray-300'
                            }`}>
                            {step > s ? <CheckCircle2 className="w-6 h-6" /> : s}
                        </div>
                    ))}
                </div>

                <div className="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden">
                    {/* Step 1: Upload */}
                    {step === 1 && (
                        <div className="p-12 text-center">
                            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-dashed border-gray-200">
                                <Upload className="w-10 h-10 text-gray-300" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 mb-2">Sube la información de tu club</h3>
                            <p className="text-gray-500 mb-8 max-w-sm mx-auto">
                                Puedes subir actas, documentos de misión, historia en PDF, Word o TXT.
                            </p>
                            <label className="inline-flex items-center gap-2 bg-rotary-blue text-white px-8 py-3.5 rounded-2xl font-bold hover:bg-sky-800 cursor-pointer transition-all shadow-lg shadow-rotary-blue/20">
                                <FileText className="w-5 h-5" /> Seleccionar Archivo
                                <input type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.doc,.docx,.txt" />
                            </label>
                        </div>
                    )}

                    {/* Step 2: Confirm & Process */}
                    {step === 2 && (
                        <div className="p-12 text-center">
                            <div className="inline-flex items-center gap-3 px-4 py-2 bg-sky-50 text-rotary-blue rounded-xl mb-6 font-medium text-sm border border-sky-100">
                                <FileText className="w-4 h-4" /> {selectedFile?.name}
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 mb-6">¿Listo para procesar con IA?</h3>
                            <div className="flex flex-col gap-3 max-w-xs mx-auto">
                                <button
                                    onClick={processWithAI}
                                    disabled={isProcessing}
                                    className="flex items-center justify-center gap-2 bg-rotary-blue text-white px-8 py-3.5 rounded-2xl font-bold hover:bg-sky-800 transition-all disabled:opacity-50"
                                >
                                    {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                                    Analizar ahora
                                </button>
                                <button onClick={() => setStep(1)} className="text-gray-400 font-bold py-2 hover:text-gray-600">
                                    Cambiar archivo
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Preview and Edit */}
                    {step === 3 && (
                        <div className="p-8">
                            <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                                <CheckCircle2 className="w-6 h-6 text-green-500" /> Resultados del Análisis
                            </h3>

                            <div className="space-y-6 mb-8">
                                {scannedData?.map((section: any, idx: number) => (
                                    <div key={idx} className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
                                        <div className="flex justify-between items-center mb-3">
                                            <span className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400">
                                                Página: {section.page} / Sección: {section.section}
                                            </span>
                                        </div>
                                        <textarea
                                            className="w-full bg-white p-4 rounded-xl border border-gray-200 text-sm font-medium focus:ring-2 focus:ring-rotary-blue/20 outline-none"
                                            rows={4}
                                            value={typeof section.content === 'string' ? section.content : JSON.stringify(section.content, null, 2)}
                                            onChange={(e) => {
                                                const newData = [...scannedData];
                                                try {
                                                    newData[idx].content = JSON.parse(e.target.value);
                                                } catch {
                                                    newData[idx].content = e.target.value;
                                                }
                                                setScannedData(newData);
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>

                            <button
                                onClick={saveAIContent}
                                disabled={isProcessing}
                                className="w-full bg-green-500 text-white py-4 rounded-2xl font-bold hover:bg-green-600 transition-all shadow-xl shadow-green-500/20 flex items-center justify-center gap-2"
                            >
                                {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                Aplicar cambios al sitio web
                            </button>
                        </div>
                    )}

                    {/* Step 4: Success */}
                    {step === 4 && (
                        <div className="p-16 text-center">
                            <div className="w-20 h-20 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                                <CheckCircle2 className="w-12 h-12" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-800 mb-2">¡Configuración Completa!</h3>
                            <p className="text-gray-500 mb-8 max-w-sm mx-auto">
                                La IA ha distribuido correctamente la información en las secciones de Quienes Somos e Historia.
                            </p>
                            <div className="flex gap-4 justify-center">
                                <a href="/" target="_blank" className="flex items-center gap-2 bg-gray-50 text-gray-700 px-6 py-3 rounded-xl font-bold hover:bg-gray-100">
                                    Ver Sitio Web
                                </a>
                                <button
                                    onClick={() => setStep(1)}
                                    className="flex items-center gap-2 bg-rotary-blue text-white px-8 py-3 rounded-xl font-bold hover:bg-sky-800"
                                >
                                    Cargar otro documento <ArrowRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Tips */}
                <div className="mt-8 flex gap-4 p-6 bg-amber-50 rounded-2xl border border-amber-100">
                    <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                    <div>
                        <h4 className="text-amber-800 font-bold text-sm">¿Cómo funciona?</h4>
                        <p className="text-amber-700 text-xs mt-1 leading-relaxed">
                            Nuestra IA lee los documentos, entiende el contexto local de tu club y redacta los textos para que tu sitio web se vea profesional y alineado con los valores de Rotary, ahorrándote horas de escritura manual.
                        </p>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
};

export default AIAssistant;
