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
    const [mode, setMode] = useState<'upload' | 'interview' | null>(null);
    const [step, setStep] = useState(1);
    const [isProcessing, setIsProcessing] = useState(false);
    const [scannedData, setScannedData] = useState<any>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [interviewData, setInterviewData] = useState({
        mision: '',
        vision: '',
        historia: '',
        proyectos: '',
        valores: ''
    });

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            setStep(2);
        }
    };

    const processWithAI = async (rawData?: any) => {
        setIsProcessing(true);
        const formData = new FormData();

        if (selectedFile) {
            formData.append('file', selectedFile);
        } else if (rawData) {
            formData.append('rawContent', JSON.stringify(rawData));
        }

        formData.append('clubId', user?.clubId || '');

        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/ai/process-document`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (response.ok) {
                const data = await response.json();
                setScannedData(data.sections);
                setStep(3);
                toast.success('Información procesada con éxito');
            } else {
                toast.error('Error al procesar con IA');
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
                    <h1 className="text-3xl font-bold text-gray-800">Canal Maestro de Configuración</h1>
                    <p className="text-gray-500 mt-2">Dile al Agente Estratega qué quieres proyectar en tu club.</p>
                </div>

                {!mode && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12 animate-in slide-in-from-bottom duration-500">
                        <button
                            onClick={() => setMode('upload')}
                            className="bg-white p-8 rounded-3xl border-2 border-gray-100 hover:border-rotary-blue transition-all group text-left shadow-sm hover:shadow-xl"
                        >
                            <div className="w-14 h-14 bg-sky-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-rotary-blue group-hover:text-white transition-colors">
                                <Upload className="w-7 h-7" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 mb-2">Cargar Documentos</h3>
                            <p className="text-gray-500 text-sm">Sube PDFs, actas o documentos oficiales para que la IA los analice.</p>
                        </button>

                        <button
                            onClick={() => { setMode('interview'); setStep(1); }}
                            className="bg-white p-8 rounded-3xl border-2 border-gray-100 hover:border-rotary-blue transition-all group text-left shadow-sm hover:shadow-xl"
                        >
                            <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-rotary-gold group-hover:text-white transition-colors">
                                <FileText className="w-7 h-7" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 mb-2">Entrevista Guiada</h3>
                            <p className="text-gray-500 text-sm">Responde unas preguntas rápidas y deja que la IA redacte todo el sitio.</p>
                        </button>
                    </div>
                )}

                {mode && (
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden animate-in zoom-in duration-300">
                        {/* Interview Mode Steps */}
                        {mode === 'interview' && (
                            <div className="p-8">
                                <div className="flex items-center gap-4 mb-8">
                                    <button onClick={() => setMode(null)} className="text-gray-400 hover:text-gray-600">
                                        <ArrowRight className="w-6 h-6 rotate-180" />
                                    </button>
                                    <h3 className="text-xl font-bold text-gray-800">Paso {step} de 3: {step === 1 ? 'Identidad' : step === 2 ? 'Historia' : 'Impacto'}</h3>
                                </div>

                                {step === 1 && (
                                    <div className="space-y-6">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">¿Cuál es la misión de su club?</label>
                                            <textarea
                                                className="w-full p-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-rotary-blue/20 outline-none h-32"
                                                placeholder="Ej: Servir a la comunidad de Bogotá a través de proyectos de salud..."
                                                value={interviewData.mision}
                                                onChange={(e) => setInterviewData({ ...interviewData, mision: e.target.value })}
                                            />
                                        </div>
                                        <button
                                            onClick={() => setStep(2)}
                                            className="w-full bg-rotary-blue text-white py-4 rounded-2xl font-bold hover:bg-sky-800 transition-colors"
                                        >
                                            Siguiente: Historia
                                        </button>
                                    </div>
                                )}

                                {step === 2 && (
                                    <div className="space-y-6">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">Cuéntanos sobre la historia del club</label>
                                            <textarea
                                                className="w-full p-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-rotary-blue/20 outline-none h-32"
                                                placeholder="Fundado en 19XX, hemos participado en..."
                                                value={interviewData.historia}
                                                onChange={(e) => setInterviewData({ ...interviewData, historia: e.target.value })}
                                            />
                                        </div>
                                        <div className="flex gap-4">
                                            <button onClick={() => setStep(1)} className="flex-1 bg-gray-50 text-gray-600 py-4 rounded-2xl font-bold">Atrás</button>
                                            <button onClick={() => setStep(3)} className="flex-[2] bg-rotary-blue text-white py-4 rounded-2xl font-bold">Siguiente: Impacto</button>
                                        </div>
                                    </div>
                                )}

                                {step === 3 && (
                                    <div className="space-y-6">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">¿Qué proyectos o causas son prioridad ahora?</label>
                                            <textarea
                                                className="w-full p-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-rotary-blue/20 outline-none h-32"
                                                placeholder="Educación, End Polio Now, etc..."
                                                value={interviewData.proyectos}
                                                onChange={(e) => setInterviewData({ ...interviewData, proyectos: e.target.value })}
                                            />
                                        </div>
                                        <button
                                            onClick={() => processWithAI(interviewData)}
                                            disabled={isProcessing}
                                            className="w-full bg-rotary-blue text-white py-4 rounded-2xl font-bold hover:bg-sky-800 transition-all flex items-center justify-center gap-2"
                                        >
                                            {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                                            Generar Configuración con IA
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Existing logic fits for step 3 and 4 once data is processed */}
                        {(step === 3 || step === 4) && (
                            <div className="p-8">
                                {step === 3 && (
                                    <>
                                        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                                            <CheckCircle2 className="w-6 h-6 text-green-500" /> Resultados del Agente
                                        </h3>
                                        <p className="text-gray-500 text-sm mb-6">Revisa cómo la IA ha distribuido tu información. Puedes editar los textos antes de aplicar.</p>
                                        <div className="space-y-4 mb-8 max-h-[400px] overflow-y-auto pr-2">
                                            {scannedData?.map((section: any, idx: number) => (
                                                <div key={idx} className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <span className="text-[10px] font-extrabold uppercase tracking-widest text-rotary-blue">
                                                            {section.page} - {section.section}
                                                        </span>
                                                    </div>
                                                    <textarea
                                                        className="w-full bg-white p-3 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-rotary-blue/20 outline-none"
                                                        rows={3}
                                                        value={typeof section.content === 'string' ? section.content : JSON.stringify(section.content, null, 2)}
                                                        onChange={(e) => {
                                                            const newData = [...scannedData];
                                                            newData[idx].content = e.target.value;
                                                            setScannedData(newData);
                                                        }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                        <button
                                            onClick={saveAIContent}
                                            disabled={isProcessing}
                                            className="w-full bg-green-500 text-white py-4 rounded-2xl font-bold hover:bg-green-600 transition-all flex items-center justify-center gap-2"
                                        >
                                            {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                            Aplicar a todo el sitio
                                        </button>
                                    </>
                                )}

                                {step === 4 && (
                                    <div className="text-center py-8">
                                        <div className="w-20 h-20 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                                            <CheckCircle2 className="w-12 h-12" />
                                        </div>
                                        <h3 className="text-2xl font-bold text-gray-800 mb-2">¡Despliegue Exitoso!</h3>
                                        <p className="text-gray-500 mb-8 max-w-sm mx-auto">
                                            El Agente Estratega ha actualizado todas las secciones de tu club con la nueva información.
                                        </p>
                                        <div className="flex gap-4 justify-center">
                                            <a href="/" target="_blank" className="flex items-center gap-2 bg-gray-50 text-gray-700 px-6 py-3 rounded-xl font-bold hover:bg-gray-100 transition-colors">
                                                Ver Sitio Web
                                            </a>
                                            <button
                                                onClick={() => { setMode(null); setStep(1); }}
                                                className="flex items-center gap-2 bg-rotary-blue text-white px-8 py-3 rounded-xl font-bold hover:bg-sky-800 transition-colors"
                                            >
                                                Nueva Tarea <ArrowRight className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Keep Upload Path UI if needed, but simplified */}
                        {mode === 'upload' && step < 3 && (
                            <div className="p-12 text-center">
                                {step === 1 ? (
                                    <>
                                        <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-dashed border-gray-200">
                                            <Upload className="w-10 h-10 text-gray-300" />
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-800 mb-2">Sube documentos de tu club</h3>
                                        <p className="text-gray-500 mb-8">Actas, misiones o historia en PDF/Word.</p>
                                        <div className="flex flex-col gap-4">
                                            <label className="inline-flex items-center justify-center gap-2 bg-rotary-blue text-white px-8 py-3.5 rounded-2xl font-bold hover:bg-sky-800 cursor-pointer transition-all">
                                                <FileText className="w-5 h-5" /> Seleccionar
                                                <input type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.doc,.docx,.txt" />
                                            </label>
                                            <button onClick={() => setMode(null)} className="text-gray-400 font-bold hover:text-gray-600">Cancelar</button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="inline-flex items-center gap-3 px-4 py-2 bg-sky-50 text-rotary-blue rounded-xl mb-6 font-medium text-sm border border-sky-100">
                                            <FileText className="w-4 h-4" /> {selectedFile?.name}
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-800 mb-6">¿Analizar con Agente Estratega?</h3>
                                        <div className="flex flex-col gap-3 max-w-xs mx-auto">
                                            <button
                                                onClick={() => processWithAI()}
                                                disabled={isProcessing}
                                                className="flex items-center justify-center gap-2 bg-rotary-blue text-white px-8 py-3.5 rounded-2xl font-bold hover:bg-sky-800 transition-all"
                                            >
                                                {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                                                Procesar ahora
                                            </button>
                                            <button onClick={() => setStep(1)} className="text-gray-400 font-bold py-2 hover:text-gray-600">Cambiar archivo</button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Tips */}
                <div className="mt-8 flex gap-4 p-6 bg-amber-50 rounded-2xl border border-amber-100">
                    <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                    <div>
                        <h4 className="text-amber-800 font-bold text-sm">¿Cómo funciona el Agente Estratega?</h4>
                        <p className="text-amber-700 text-xs mt-1 leading-relaxed">
                            No solo redacta. El agente analiza qué información pertenece a "Quienes Somos", qué hitos van en "Historia" y qué datos alimentan la sección de "Contribuir", distribuyendo todo el contenido de forma coherente en los contenedores del sitio.
                        </p>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
};

export default AIAssistant;
