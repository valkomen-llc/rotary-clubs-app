import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { Users, Plus, Search, Upload, Download, Trash2, Edit3, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

const WhatsAppContacts: React.FC = () => {
    const { token } = useAuth();
    const [contacts, setContacts] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [showForm, setShowForm] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState({ name: '', phone: '', email: '', tags: '' });
    const [importing, setImporting] = useState(false);
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [csvText, setCsvText] = useState('');
    const [importMode, setImportMode] = useState<'file' | 'paste'>('file');

    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    useEffect(() => { fetchContacts(); }, [search, statusFilter]);

    const fetchContacts = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ limit: '100', offset: '0' });
            if (search) params.set('search', search);
            if (statusFilter !== 'all') params.set('status', statusFilter);
            const res = await fetch(`${API}/whatsapp/contacts?${params}`, { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            setContacts(data.contacts || []);
            setTotal(data.total || 0);
        } catch { } finally { setLoading(false); }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const body = { ...form, tags: form.tags ? form.tags.split(',').map(t => t.trim()) : [] };
        try {
            const url = editId ? `${API}/whatsapp/contacts/${editId}` : `${API}/whatsapp/contacts`;
            const res = await fetch(url, { method: editId ? 'PUT' : 'POST', headers, body: JSON.stringify(body) });
            const data = await res.json();
            if (res.ok) { toast.success(editId ? 'Contacto actualizado' : 'Contacto creado'); setShowForm(false); resetForm(); fetchContacts(); }
            else toast.error(data.error);
        } catch { toast.error('Error de conexión'); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Eliminar este contacto?')) return;
        await fetch(`${API}/whatsapp/contacts/${id}`, { method: 'DELETE', headers });
        toast.success('Contacto eliminado'); fetchContacts();
    };

    // ── CSV Parsing Helper ──
    const parseCSV = (text: string): { name: string; phone: string; email: string }[] => {
        // Strip BOM and normalize line endings
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) { toast.error('El archivo está vacío o solo tiene encabezados'); return []; }

        // Auto-detect delimiter
        const headerLine = lines[0];
        let delimiter = ',';
        if (headerLine.split(';').length > headerLine.split(',').length) delimiter = ';';
        else if (headerLine.split('\t').length > headerLine.split(',').length) delimiter = '\t';

        const splitLine = (line: string) => line.split(delimiter).map(v => v.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, ''));

        const cols = splitLine(headerLine.toLowerCase());
        const nameIdx = cols.findIndex(c => c.includes('nombre') || c.includes('name') || c === 'contacto');
        const phoneIdx = cols.findIndex(c => c.includes('telefono') || c.includes('teléfono') || c.includes('phone') || c.includes('celular') || c.includes('whatsapp') || c.includes('movil') || c.includes('móvil') || c.includes('numero') || c.includes('número'));
        const emailIdx = cols.findIndex(c => c.includes('email') || c.includes('correo') || c.includes('e-mail'));

        if (nameIdx === -1 || phoneIdx === -1) {
            toast.error(`Columnas detectadas: [${cols.join(', ')}]. Se requieren: "nombre" y "telefono".`);
            return [];
        }

        const parsed = lines.slice(1).map(line => {
            const vals = splitLine(line);
            return { name: vals[nameIdx]?.trim() || '', phone: vals[phoneIdx]?.trim() || '', email: emailIdx >= 0 ? vals[emailIdx]?.trim() || '' : '' };
        }).filter(c => c.name && c.phone);

        if (!parsed.length) { toast.error('No se encontraron contactos válidos con nombre y teléfono'); return []; }
        return parsed;
    };

    const sendContactsToAPI = async (parsed: { name: string; phone: string; email: string }[]) => {
        setImporting(true);
        toast.info(`Enviando ${parsed.length} contactos al servidor...`);
        try {
            const res = await fetch(`${API}/whatsapp/contacts/import`, { method: 'POST', headers, body: JSON.stringify({ contacts: parsed }) });
            const data = await res.json();
            if (res.ok) {
                toast.success(`✅ Importados: ${data.imported}, Omitidos: ${data.skipped}`);
                fetchContacts();
                setShowImport(false);
                setCsvFile(null);
                setCsvText('');
            } else {
                toast.error(data.error || 'Error al importar');
            }
        } catch (err) {
            console.error('Import API error:', err);
            toast.error('Error de conexión al importar');
        } finally {
            setImporting(false);
        }
    };

    const processCSVFile = async () => {
        if (!csvFile) return;
        setImporting(true);
        try {
            const text = await csvFile.text();
            const parsed = parseCSV(text);
            if (parsed.length) await sendContactsToAPI(parsed);
            else setImporting(false);
        } catch (err) {
            console.error('File read error:', err);
            toast.error('Error al leer el archivo');
            setImporting(false);
        }
    };

    const processCSVText = async () => {
        if (!csvText.trim()) return;
        const parsed = parseCSV(csvText);
        if (parsed.length) await sendContactsToAPI(parsed);
    };

    const handleImportLeads = async () => {
        try {
            const res = await fetch(`${API}/whatsapp/contacts/import/leads`, {
                method: 'POST', headers, body: JSON.stringify({ leadIds: 'all' }),
            });
            const data = await res.json();
            toast.success(`Importados: ${data.imported}, Omitidos: ${data.skipped}`);
            fetchContacts(); setShowImport(false);
        } catch { toast.error('Error al importar'); }
    };

    const resetForm = () => { setForm({ name: '', phone: '', email: '', tags: '' }); setEditId(null); };
    const startEdit = (c: any) => {
        setForm({ name: c.name, phone: c.phone, email: c.email || '', tags: (c.tags || []).join(', ') });
        setEditId(c.id); setShowForm(true);
    };

    return (
        <div>
            {/* Toolbar */}
            <div className="flex items-center gap-3 mb-6 flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar contacto..."
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none" />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:ring-2 focus:ring-green-500/20 outline-none">
                    <option value="all">Todos</option>
                    <option value="active">Activos</option>
                    <option value="opted_out">Opt-out</option>
                </select>
                <button onClick={() => setShowImport(!showImport)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50">
                    <Upload className="w-4 h-4" /> Importar
                </button>
                <button onClick={() => { resetForm(); setShowForm(true); }}
                    className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-green-700 shadow-sm">
                    <Plus className="w-4 h-4" /> Nuevo Contacto
                </button>
            </div>

            {/* Import Panel */}
            {showImport && (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-6 mb-6">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <p className="font-bold text-green-800 text-sm">Importar Contactos</p>
                            <p className="text-xs text-green-600 mt-0.5">CSV o texto con columnas: nombre, telefono, email (opcional). Separador: coma, punto y coma o tab.</p>
                        </div>
                        <button onClick={() => { setShowImport(false); setCsvFile(null); setCsvText(''); }} className="text-green-600 hover:text-green-800"><X className="w-5 h-5" /></button>
                    </div>

                    {/* Tab selector: File or Paste */}
                    <div className="flex gap-2 mb-4">
                        <button onClick={() => setImportMode('file')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${importMode === 'file' ? 'bg-green-600 text-white' : 'bg-white border border-green-200 text-green-700'}`}>
                            📁 Archivo CSV
                        </button>
                        <button onClick={() => setImportMode('paste')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${importMode === 'paste' ? 'bg-green-600 text-white' : 'bg-white border border-green-200 text-green-700'}`}>
                            📋 Pegar datos
                        </button>
                        <button onClick={handleImportLeads}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-green-200 text-green-700 hover:bg-green-100">
                            <Download className="w-3 h-3 inline mr-1" /> Desde Leads
                        </button>
                    </div>

                    {importMode === 'file' ? (
                        <div className="space-y-3">
                            {/* Visible file input area */}
                            <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-green-300 rounded-xl cursor-pointer bg-white hover:bg-green-50/50 transition-colors">
                                <input
                                    type="file"
                                    accept=".csv,.txt,.tsv,.xls"
                                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-green-600 file:text-white hover:file:bg-green-700 file:cursor-pointer cursor-pointer p-4"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) { setCsvFile(f); toast.info(`Archivo seleccionado: ${f.name} (${(f.size / 1024).toFixed(1)} KB)`); }
                                    }}
                                />
                                {csvFile && (
                                    <p className="text-xs text-green-700 font-bold pb-2">✅ {csvFile.name} — {(csvFile.size / 1024).toFixed(1)} KB</p>
                                )}
                            </label>
                            <button
                                onClick={processCSVFile}
                                disabled={!csvFile || importing}
                                className="flex items-center gap-2 bg-green-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm w-full justify-center">
                                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                {importing ? 'Importando...' : `Importar${csvFile ? ` desde ${csvFile.name}` : ''}`}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <textarea
                                value={csvText}
                                onChange={(e) => setCsvText(e.target.value)}
                                placeholder={'nombre;telefono;email\nJuan Pérez;+573001234567;juan@email.com\nMaría López;+573009876543;maria@email.com'}
                                rows={6}
                                className="w-full px-4 py-3 rounded-xl border border-green-200 text-sm font-mono focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none resize-none bg-white"
                            />
                            <button
                                onClick={processCSVText}
                                disabled={!csvText.trim() || importing}
                                className="flex items-center gap-2 bg-green-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm w-full justify-center">
                                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                {importing ? 'Importando...' : 'Importar datos pegados'}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Create/Edit Form */}
            {showForm && (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6 shadow-sm">
                    <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required
                            placeholder="Nombre completo" className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-500" />
                        <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required
                            placeholder="+573001234567" className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-500" />
                        <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                            placeholder="Email (opcional)" className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-500" />
                        <div className="flex gap-2">
                            <input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })}
                                placeholder="Tags: vip, socio" className="flex-1 px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-500" />
                            <button type="submit" className="bg-green-600 text-white px-4 rounded-lg font-bold text-sm hover:bg-green-700">
                                {editId ? 'Actualizar' : 'Crear'}
                            </button>
                            <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                    </form>
                </div>
            )}

            {/* Contacts Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-500 uppercase">{total} contactos</span>
                </div>
                {loading ? (
                    <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
                ) : contacts.length === 0 ? (
                    <div className="py-16 text-center text-gray-400">
                        <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p className="font-bold">Sin contactos</p>
                        <p className="text-sm mt-1">Importa o agrega contactos para empezar</p>
                    </div>
                ) : (
                    <table className="w-full text-left">
                        <thead><tr className="border-b border-gray-100 text-xs font-bold text-gray-400 uppercase">
                            <th className="p-4">Nombre</th><th className="p-4">Teléfono</th><th className="p-4">Email</th>
                            <th className="p-4">Tags</th><th className="p-4">Estado</th><th className="p-4">Métricas</th><th className="p-4 w-20"></th>
                        </tr></thead>
                        <tbody className="divide-y divide-gray-50 text-sm">
                            {contacts.map(c => (
                                <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="p-4 font-medium text-gray-900">{c.name}</td>
                                    <td className="p-4 text-gray-600 font-mono text-xs">{c.phone}</td>
                                    <td className="p-4 text-gray-500 text-xs">{c.email || '—'}</td>
                                    <td className="p-4">{(c.tags || []).map((t: string) => (
                                        <span key={t} className="inline-block bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-full mr-1">{t}</span>
                                    ))}</td>
                                    <td className="p-4">
                                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${c.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                                            {c.status === 'active' ? 'Activo' : 'Opt-out'}
                                        </span>
                                    </td>
                                    <td className="p-4 text-[10px] text-gray-500 space-x-2">
                                        <span title="Enviados">📤{c.totalSent}</span>
                                        <span title="Entregados">✅{c.totalDelivered}</span>
                                        <span title="Leídos">👁{c.totalRead}</span>
                                    </td>
                                    <td className="p-4 flex gap-1">
                                        <button onClick={() => startEdit(c)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600"><Edit3 className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default WhatsAppContacts;
