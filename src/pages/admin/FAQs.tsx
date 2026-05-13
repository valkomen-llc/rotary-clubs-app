import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, GripVertical, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const FAQManagement = () => {
    const { user } = useAuth();
    const [faqs, setFaqs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [newFaq, setNewFaq] = useState({ question: '', answer: '' });
    const [showAdd, setShowAdd] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const API = import.meta.env.VITE_API_URL || '/api';
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    const clubId = user?.role === 'administrator' ? undefined : user?.clubId;

    const fetchFaqs = async () => {
        try {
            const url = clubId ? `${API}/faqs?clubId=${clubId}` : `${API}/faqs`;
            const res = await fetch(url);
            const data = await res.json();
            setFaqs(data.faqs || []);
        } catch {
            console.error('Error fetching FAQs');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchFaqs(); }, []);

    const handleCreate = async () => {
        if (!newFaq.question.trim() || !newFaq.answer.trim()) return;
        setSaving('new');
        try {
            const res = await fetch(`${API}/faqs`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    question: newFaq.question,
                    answer: newFaq.answer,
                    clubId: clubId || null,
                    order: faqs.length,
                }),
            });
            if (res.ok) {
                setNewFaq({ question: '', answer: '' });
                setShowAdd(false);
                await fetchFaqs();
            }
        } catch (err) {
            console.error('Error creating FAQ:', err);
        } finally {
            setSaving(null);
        }
    };

    const handleUpdate = async (faq: any) => {
        setSaving(faq.id);
        try {
            await fetch(`${API}/faqs/${faq.id}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    question: faq.question,
                    answer: faq.answer,
                    order: faq.order,
                    active: faq.active,
                }),
            });
            await fetchFaqs();
        } catch (err) {
            console.error('Error updating FAQ:', err);
        } finally {
            setSaving(null);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Estás seguro de eliminar esta pregunta frecuente?')) return;
        try {
            await fetch(`${API}/faqs/${id}`, { method: 'DELETE', headers });
            await fetchFaqs();
        } catch (err) {
            console.error('Error deleting FAQ:', err);
        }
    };

    const updateFaqField = (id: string, field: string, value: string | boolean) => {
        setFaqs(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f));
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-sky-100 flex items-center justify-center">
                        <HelpCircle className="w-6 h-6 text-rotary-blue" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Preguntas Frecuentes</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            Resuelve dudas comunes de los visitantes · {faqs.length} FAQs
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => setShowAdd(!showAdd)}
                    className="flex items-center gap-2 bg-rotary-blue text-white px-5 py-2.5 rounded-xl hover:bg-sky-800 transition-all font-bold shadow-xl shadow-blue-900/20 active:scale-95"
                >
                    <Plus className="w-5 h-5" /> Agregar FAQ
                </button>
            </div>

            {/* Add new FAQ form */}
            {showAdd && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 space-y-4">
                    <h3 className="font-bold text-gray-900">Nueva Pregunta Frecuente</h3>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Pregunta *</label>
                        <input
                            type="text"
                            value={newFaq.question}
                            onChange={e => setNewFaq({ ...newFaq, question: e.target.value })}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                            placeholder="¿Cuál es la pregunta?"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Respuesta *</label>
                        <textarea
                            value={newFaq.answer}
                            onChange={e => setNewFaq({ ...newFaq, answer: e.target.value })}
                            rows={3}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
                            placeholder="Escribe la respuesta..."
                        />
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={handleCreate}
                            disabled={saving === 'new' || !newFaq.question.trim() || !newFaq.answer.trim()}
                            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                            <Save className="w-4 h-4" />
                            {saving === 'new' ? 'Guardando...' : 'Guardar'}
                        </button>
                        <button
                            onClick={() => { setShowAdd(false); setNewFaq({ question: '', answer: '' }); }}
                            className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* FAQ List */}
            {faqs.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                    <HelpCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-600 mb-2">Sin preguntas frecuentes</h3>
                    <p className="text-gray-400 mb-6">Agrega preguntas frecuentes para que los visitantes encuentren respuestas rápidamente.</p>
                    <button
                        onClick={() => setShowAdd(true)}
                        className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        <Plus className="w-5 h-5" />
                        Agregar la primera FAQ
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {faqs.map((faq, index) => (
                        <div
                            key={faq.id}
                            className={`bg-white rounded-xl border transition-all ${!faq.active ? 'border-gray-200 opacity-60' : 'border-gray-200 hover:border-blue-300'
                                }`}
                        >
                            {/* Row header */}
                            <div
                                className="flex items-center gap-3 px-5 py-4 cursor-pointer"
                                onClick={() => setExpandedId(expandedId === faq.id ? null : faq.id)}
                            >
                                <GripVertical className="w-5 h-5 text-gray-300 flex-shrink-0" />
                                <span className="text-xs font-bold text-gray-400 w-6">{index + 1}</span>
                                <h3 className="flex-1 font-semibold text-gray-900 text-sm">{faq.question}</h3>
                                <div className="flex items-center gap-2">
                                    {!faq.active && (
                                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactiva</span>
                                    )}
                                    {expandedId === faq.id ? (
                                        <ChevronUp className="w-5 h-5 text-gray-400" />
                                    ) : (
                                        <ChevronDown className="w-5 h-5 text-gray-400" />
                                    )}
                                </div>
                            </div>

                            {/* Expanded edit area */}
                            {expandedId === faq.id && (
                                <div className="px-5 pb-5 pt-0 border-t border-gray-100 space-y-4">
                                    <div className="pt-4">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Pregunta</label>
                                        <input
                                            type="text"
                                            value={faq.question}
                                            onChange={e => updateFaqField(faq.id, 'question', e.target.value)}
                                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Respuesta</label>
                                        <textarea
                                            value={faq.answer}
                                            onChange={e => updateFaqField(faq.id, 'answer', e.target.value)}
                                            rows={4}
                                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <label className="flex items-center gap-2 text-sm">
                                            <input
                                                type="checkbox"
                                                checked={faq.active}
                                                onChange={e => {
                                                    updateFaqField(faq.id, 'active', e.target.checked);
                                                    handleUpdate({ ...faq, active: e.target.checked });
                                                }}
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-gray-700">Activa (visible en el sitio)</span>
                                        </label>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleDelete(faq.id)}
                                                className="flex items-center gap-1 text-red-500 hover:text-red-700 text-sm px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                Eliminar
                                            </button>
                                            <button
                                                onClick={() => handleUpdate(faq)}
                                                disabled={saving === faq.id}
                                                className="flex items-center gap-1 bg-blue-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                                            >
                                                <Save className="w-4 h-4" />
                                                {saving === faq.id ? 'Guardando...' : 'Guardar'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Info */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                <p>
                    <strong>💡 Tip:</strong> Las preguntas frecuentes se muestran en la página de Contacto del sitio web. Si no hay FAQs creadas, se mostrarán las preguntas por defecto del sistema.
                </p>
            </div>
        </div>
    );
};

export default FAQManagement;
