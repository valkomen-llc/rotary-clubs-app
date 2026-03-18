import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { Users, Plus, Search, Upload, Download, Trash2, Edit3, X, Loader2, ChevronRight, Eye, Settings2 } from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

interface ParsedRow { [key: string]: string }

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

    // Import wizard state
    const [importStep, setImportStep] = useState<'select' | 'map' | 'confirm'>('select');
    const [csvColumns, setCsvColumns] = useState<string[]>([]);
    const [csvRows, setCsvRows] = useState<ParsedRow[]>([]);
    const [colMap, setColMap] = useState<{ name: string; phone: string; email: string }>({ name: '', phone: '', email: '' });
    const [importTags, setImportTags] = useState('');
    const [lists, setLists] = useState<any[]>([]);
    const [selectedListId, setSelectedListId] = useState('');
    const [newListName, setNewListName] = useState('');
    const [creatingList, setCreatingList] = useState(false);

    // Custom fields
    const [customFields, setCustomFields] = useState<any[]>([]);
    const [customFieldMap, setCustomFieldMap] = useState<{ [fieldKey: string]: string }>({});
    const [showFieldManager, setShowFieldManager] = useState(false);
    const [newFieldLabel, setNewFieldLabel] = useState('');
    const [newFieldType, setNewFieldType] = useState('text');

    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    useEffect(() => { fetchContacts(); fetchCustomFields(); }, [search, statusFilter]);
    useEffect(() => { if (showImport) { fetchLists(); fetchCustomFields(); } }, [showImport]);

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

    const fetchCustomFields = async () => {
        try {
            const res = await fetch(`${API}/whatsapp/custom-fields`, { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            setCustomFields(data.fields || []);
        } catch { }
    };

    const createFieldInline = async () => {
        if (!newFieldLabel.trim()) return;
        try {
            const res = await fetch(`${API}/whatsapp/custom-fields`, {
                method: 'POST', headers, body: JSON.stringify({ label: newFieldLabel.trim(), type: newFieldType }),
            });
            if (res.ok) {
                toast.success(`Campo "${newFieldLabel}" creado`);
                setNewFieldLabel('');
                setNewFieldType('text');
                await fetchCustomFields();
            } else {
                const err = await res.json();
                toast.error(err.error || 'Error al crear campo');
            }
        } catch { toast.error('Error de conexión'); }
    };

    const deleteField = async (id: string) => {
        if (!confirm('¿Eliminar este campo personalizado?')) return;
        await fetch(`${API}/whatsapp/custom-fields/${id}`, { method: 'DELETE', headers });
        toast.success('Campo eliminado');
        fetchCustomFields();
    };

    const fetchLists = async () => {
        try {
            const res = await fetch(`${API}/whatsapp/lists`, { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            const listArr = Array.isArray(data) ? data : (data.lists || []);
            setLists(listArr);
        } catch { }
    };

    const createListInline = async () => {
        if (!newListName.trim()) return;
        setCreatingList(true);
        try {
            const res = await fetch(`${API}/whatsapp/lists`, {
                method: 'POST', headers, body: JSON.stringify({ name: newListName.trim() }),
            });
            if (res.ok) {
                const data = await res.json();
                toast.success(`Lista "${newListName}" creada`);
                setNewListName('');
                await fetchLists();
                setSelectedListId(data.id);
            } else {
                const err = await res.json();
                toast.error(err.error || 'Error al crear lista');
            }
        } catch { toast.error('Error de conexión'); }
        finally { setCreatingList(false); }
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

    // ── CSV Parsing ──
    const parseCSVData = (text: string): { columns: string[]; rows: ParsedRow[] } => {
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) return { columns: [], rows: [] };

        const headerLine = lines[0];
        let delimiter = ',';
        const semiCount = (headerLine.match(/;/g) || []).length;
        const commaCount = (headerLine.match(/,/g) || []).length;
        const tabCount = (headerLine.match(/\t/g) || []).length;
        if (semiCount > commaCount && semiCount > tabCount) delimiter = ';';
        else if (tabCount > commaCount && tabCount > semiCount) delimiter = '\t';

        const split = (line: string) => line.split(delimiter).map(v => v.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, ''));

        const columns = split(headerLine);
        const rows = lines.slice(1).map(line => {
            const vals = split(line);
            const row: ParsedRow = {};
            columns.forEach((col, i) => { row[col] = vals[i] || ''; });
            return row;
        }).filter(r => Object.values(r).some(v => v.trim()));

        return { columns, rows };
    };

    const autoDetectMapping = (cols: string[]) => {
        const lower = cols.map(c => c.toLowerCase());
        const nameIdx = lower.findIndex(c => c.includes('nombre') || c.includes('name') || c === 'contacto' || c.includes('socio'));
        const phoneIdx = lower.findIndex(c => c.includes('telefono') || c.includes('teléfono') || c.includes('phone') || c.includes('celular') || c.includes('whatsapp') || c.includes('movil') || c.includes('móvil') || c.includes('numero') || c.includes('número'));
        const emailIdx = lower.findIndex(c => c.includes('email') || c.includes('correo') || c.includes('e-mail'));
        return {
            name: nameIdx >= 0 ? cols[nameIdx] : '',
            phone: phoneIdx >= 0 ? cols[phoneIdx] : '',
            email: emailIdx >= 0 ? cols[emailIdx] : '',
        };
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            toast.info(`Leyendo ${file.name}...`);
            const text = await file.text();
            const { columns, rows } = parseCSVData(text);
            if (!columns.length || !rows.length) {
                toast.error('No se encontraron datos en el archivo');
                return;
            }
            setCsvColumns(columns);
            setCsvRows(rows);
            const detected = autoDetectMapping(columns);
            setColMap(detected);
            setImportStep('map');
            toast.success(`${rows.length} filas encontradas con ${columns.length} columnas`);
        } catch (err) {
            console.error('File read error:', err);
            toast.error('Error al leer el archivo');
        }
        // Reset file input
        e.target.value = '';
    };

    const handlePasteImport = () => {
        const text = prompt('Pega tus datos CSV aquí (primera línea = encabezados):');
        if (!text) return;
        const { columns, rows } = parseCSVData(text);
        if (!columns.length || !rows.length) { toast.error('No se encontraron datos'); return; }
        setCsvColumns(columns);
        setCsvRows(rows);
        setColMap(autoDetectMapping(columns));
        setImportStep('map');
        toast.success(`${rows.length} filas encontradas`);
    };

    const getMappedContacts = () => {
        if (!colMap.name || !colMap.phone) return [];
        return csvRows.map(row => {
            const metadata: any = {};
            customFields.forEach(f => {
                const csvCol = customFieldMap[f.key];
                if (csvCol && row[csvCol]) metadata[f.key] = row[csvCol].trim();
            });
            return {
                name: row[colMap.name]?.trim() || '',
                phone: row[colMap.phone]?.trim() || '',
                email: colMap.email ? row[colMap.email]?.trim() || '' : '',
                metadata: Object.keys(metadata).length ? metadata : undefined,
            };
        }).filter(c => c.name && c.phone);
    };

    const executeImport = async () => {
        const mapped = getMappedContacts();
        if (!mapped.length) { toast.error('No hay contactos válidos para importar'); return; }

        setImporting(true);
        try {
            const tags = importTags ? importTags.split(',').map(t => t.trim()).filter(Boolean) : [];
            const body: any = { contacts: mapped.map(c => ({ ...c, tags })) };

            const res = await fetch(`${API}/whatsapp/contacts/import`, { method: 'POST', headers, body: JSON.stringify(body) });
            const data = await res.json();
            if (!res.ok) { toast.error(data.error || 'Error al importar'); return; }

            // If a list was selected, add contacts to it
            if (selectedListId && data.imported > 0) {
                try {
                    // Fetch recently imported contacts
                    const cRes = await fetch(`${API}/whatsapp/contacts?limit=${data.imported}&offset=0`, { headers: { Authorization: `Bearer ${token}` } });
                    const cData = await cRes.json();
                    const contactIds = (cData.contacts || []).map((c: any) => c.id);
                    if (contactIds.length) {
                        await fetch(`${API}/whatsapp/lists/${selectedListId}/members`, {
                            method: 'POST', headers, body: JSON.stringify({ contactIds }),
                        });
                    }
                } catch { /* silent */ }
            }

            toast.success(`✅ Importados: ${data.imported}, Omitidos: ${data.skipped}`);
            resetImport();
            fetchContacts();
        } catch (err) {
            console.error('Import error:', err);
            toast.error('Error de conexión al importar');
        } finally {
            setImporting(false);
        }
    };

    const handleImportLeads = async () => {
        setImporting(true);
        try {
            const res = await fetch(`${API}/whatsapp/contacts/import/leads`, {
                method: 'POST', headers, body: JSON.stringify({ leadIds: 'all' }),
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(`Importados: ${data.imported}, Omitidos: ${data.skipped}`);
                resetImport();
                fetchContacts();
            } else toast.error(data.error || 'Error');
        } catch { toast.error('Error al importar'); }
        finally { setImporting(false); }
    };

    const resetImport = () => {
        setShowImport(false);
        setImportStep('select');
        setCsvColumns([]);
        setCsvRows([]);
        setColMap({ name: '', phone: '', email: '' });
        setCustomFieldMap({});
        setImportTags('');
        setSelectedListId('');
    };

    const resetForm = () => { setForm({ name: '', phone: '', email: '', tags: '' }); setEditId(null); };
    const startEdit = (c: any) => {
        setForm({ name: c.name, phone: c.phone, email: c.email || '', tags: (c.tags || []).join(', ') });
        setEditId(c.id); setShowForm(true);
    };

    const mappedPreview = getMappedContacts();

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
                <button onClick={() => { setShowImport(true); setImportStep('select'); }} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50">
                    <Upload className="w-4 h-4" /> Importar
                </button>
                <button onClick={() => setShowFieldManager(!showFieldManager)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-colors ${showFieldManager ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                    <Settings2 className="w-4 h-4" /> Campos
                </button>
                <button onClick={() => { resetForm(); setShowForm(true); }}
                    className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-green-700 shadow-sm">
                    <Plus className="w-4 h-4" /> Nuevo Contacto
                </button>
            </div>

            {/* Field Manager Panel */}
            {showFieldManager && (
                <div className="bg-white border border-blue-200 rounded-2xl p-5 mb-6 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h3 className="font-bold text-gray-900 text-sm">Campos Personalizados</h3>
                            <p className="text-xs text-gray-500 mt-0.5">Define campos extra que aparecerán como opciones de mapeo al importar CSV</p>
                        </div>
                        <button onClick={() => setShowFieldManager(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                    </div>

                    {/* Existing fields */}
                    {customFields.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                            {customFields.map(f => (
                                <div key={f.id} className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
                                    <span className="text-sm font-bold text-blue-800">{f.label}</span>
                                    <span className="text-[10px] text-blue-500 bg-blue-100 px-1.5 rounded">{f.type}</span>
                                    <button onClick={() => deleteField(f.id)} className="text-blue-400 hover:text-red-500 ml-1"><X className="w-3 h-3" /></button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Create new field */}
                    <div className="flex gap-2 items-end">
                        <div className="flex-1">
                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Nombre del campo</label>
                            <input value={newFieldLabel} onChange={e => setNewFieldLabel(e.target.value)}
                                placeholder="ej: Ciudad, Profesión, Cargo..."
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-blue-500"
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createFieldInline(); } }} />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Tipo</label>
                            <select value={newFieldType} onChange={e => setNewFieldType(e.target.value)}
                                className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white outline-none focus:border-blue-500">
                                <option value="text">Texto</option>
                                <option value="number">Número</option>
                                <option value="date">Fecha</option>
                                <option value="url">URL</option>
                            </select>
                        </div>
                        <button onClick={createFieldInline} disabled={!newFieldLabel.trim()}
                            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-40 whitespace-nowrap">
                            + Añadir Campo
                        </button>
                    </div>
                </div>
            )}

            {/* Import Wizard */}
            {showImport && (
                <div className="bg-white border border-gray-200 rounded-2xl mb-6 shadow-sm overflow-hidden">
                    {/* Header */}
                    <div className="px-6 py-4 bg-gradient-to-r from-green-50 to-emerald-50 border-b border-green-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Upload className="w-5 h-5 text-green-600" />
                            <div>
                                <h3 className="font-bold text-green-900 text-sm">Importar Contactos</h3>
                                <div className="flex items-center gap-1 mt-1">
                                    {(['select', 'map', 'confirm'] as const).map((step, i) => (
                                        <React.Fragment key={step}>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${importStep === step ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                                                {i === 0 ? '1. Archivo' : i === 1 ? '2. Mapear' : '3. Importar'}
                                            </span>
                                            {i < 2 && <ChevronRight className="w-3 h-3 text-gray-300" />}
                                        </React.Fragment>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <button onClick={resetImport} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                    </div>

                    <div className="p-6">
                        {/* Step 1: Select source */}
                        {importStep === 'select' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* CSV File */}
                                    <label className="group relative flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-green-400 hover:bg-green-50/30 transition-all">
                                        <input type="file" accept=".csv,.txt,.tsv" onChange={handleFileSelect} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                        <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-3 group-hover:bg-green-200 transition-colors">
                                            <Upload className="w-6 h-6 text-green-600" />
                                        </div>
                                        <p className="font-bold text-sm text-gray-700">Subir CSV</p>
                                        <p className="text-xs text-gray-400 mt-1 text-center">Arrastra o selecciona un archivo .csv</p>
                                    </label>

                                    {/* Paste */}
                                    <button onClick={handlePasteImport}
                                        className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all">
                                        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-3">
                                            <Edit3 className="w-6 h-6 text-blue-600" />
                                        </div>
                                        <p className="font-bold text-sm text-gray-700">Pegar datos</p>
                                        <p className="text-xs text-gray-400 mt-1 text-center">Pega contenido CSV directamente</p>
                                    </button>

                                    {/* From Leads */}
                                    <button onClick={handleImportLeads} disabled={importing}
                                        className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-purple-400 hover:bg-purple-50/30 transition-all disabled:opacity-50">
                                        <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-3">
                                            {importing ? <Loader2 className="w-6 h-6 text-purple-600 animate-spin" /> : <Download className="w-6 h-6 text-purple-600" />}
                                        </div>
                                        <p className="font-bold text-sm text-gray-700">Desde Leads</p>
                                        <p className="text-xs text-gray-400 mt-1 text-center">Importa leads del sistema</p>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Step 2: Map columns */}
                        {importStep === 'map' && (
                            <div className="space-y-5">
                                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                                    <p className="text-sm font-bold text-blue-800">Se encontraron {csvRows.length} filas y {csvColumns.length} columnas</p>
                                    <p className="text-xs text-blue-600 mt-1">Columnas: {csvColumns.join(', ')}</p>
                                </div>

                                {/* Column mapping */}
                                <div>
                                    <p className="font-bold text-sm text-gray-700 mb-3">Mapear columnas del CSV</p>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Nombre *</label>
                                            <select value={colMap.name} onChange={e => setColMap({ ...colMap, name: e.target.value })}
                                                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white outline-none focus:border-green-500">
                                                <option value="">— Seleccionar columna —</option>
                                                {csvColumns.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Teléfono *</label>
                                            <select value={colMap.phone} onChange={e => setColMap({ ...colMap, phone: e.target.value })}
                                                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white outline-none focus:border-green-500">
                                                <option value="">— Seleccionar columna —</option>
                                                {csvColumns.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Email (opcional)</label>
                                            <select value={colMap.email} onChange={e => setColMap({ ...colMap, email: e.target.value })}
                                                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white outline-none focus:border-green-500">
                                                <option value="">— No mapear —</option>
                                                {csvColumns.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Custom fields mapping */}
                                {customFields.length > 0 && (
                                    <div>
                                        <p className="font-bold text-sm text-gray-700 mb-3">Campos personalizados</p>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {customFields.map(f => (
                                                <div key={f.id}>
                                                    <label className="text-xs font-bold text-blue-600 uppercase block mb-1">{f.label} <span className="text-gray-400 font-normal">({f.type})</span></label>
                                                    <select value={customFieldMap[f.key] || ''} onChange={e => setCustomFieldMap({ ...customFieldMap, [f.key]: e.target.value })}
                                                        className="w-full px-3 py-2.5 rounded-lg border border-blue-200 text-sm bg-white outline-none focus:border-blue-500">
                                                        <option value="">— No mapear —</option>
                                                        {csvColumns.map(c => <option key={c} value={c}>{c}</option>)}
                                                    </select>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <p className="font-bold text-sm text-gray-700 mb-3">Opciones de importación</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Etiquetas (tags)</label>
                                            <input value={importTags} onChange={e => setImportTags(e.target.value)}
                                                placeholder="ej: vip, socio, rotary"
                                                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-500" />
                                            <p className="text-[10px] text-gray-400 mt-1">Separar con comas. Se asignan a todos los contactos.</p>
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Agregar a lista</label>
                                            <select value={selectedListId} onChange={e => setSelectedListId(e.target.value)}
                                                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white outline-none focus:border-green-500">
                                                <option value="">— No agregar a lista —</option>
                                                {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                            </select>
                                            {/* Create new list inline */}
                                            <div className="flex gap-2 mt-2">
                                                <input value={newListName} onChange={e => setNewListName(e.target.value)}
                                                    placeholder="Nombre de nueva lista..."
                                                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-500"
                                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createListInline(); } }} />
                                                <button type="button" onClick={createListInline} disabled={!newListName.trim() || creatingList}
                                                    className="px-3 py-2 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 disabled:opacity-40 whitespace-nowrap">
                                                    {creatingList ? '...' : '+ Crear'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-3">
                                    <button onClick={() => setImportStep('select')} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50">
                                        ← Atrás
                                    </button>
                                    <button onClick={() => setImportStep('confirm')} disabled={!colMap.name || !colMap.phone}
                                        className="flex items-center gap-2 px-6 py-2 rounded-lg bg-green-600 text-white text-sm font-bold hover:bg-green-700 disabled:opacity-40">
                                        <Eye className="w-4 h-4" /> Previsualizar ({mappedPreview.length} contactos)
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Preview and confirm */}
                        {importStep === 'confirm' && (
                            <div className="space-y-4">
                                <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between">
                                    <div>
                                        <p className="font-bold text-green-800 text-sm">{mappedPreview.length} contactos listos para importar</p>
                                        {importTags && <p className="text-xs text-green-600 mt-0.5">Tags: {importTags}</p>}
                                        {selectedListId && <p className="text-xs text-green-600">Lista: {lists.find(l => l.id === selectedListId)?.name}</p>}
                                    </div>
                                </div>

                                {/* Preview table */}
                                <div className="max-h-64 overflow-auto border border-gray-100 rounded-xl">
                                    <table className="w-full text-left text-sm">
                                        <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                                            <tr className="text-xs font-bold text-gray-400 uppercase">
                                                <th className="p-3">#</th><th className="p-3">Nombre</th><th className="p-3">Teléfono</th><th className="p-3">Email</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {mappedPreview.slice(0, 50).map((c, i) => (
                                                <tr key={i} className="text-xs">
                                                    <td className="p-3 text-gray-400">{i + 1}</td>
                                                    <td className="p-3 font-medium text-gray-900">{c.name}</td>
                                                    <td className="p-3 font-mono text-gray-600">{c.phone}</td>
                                                    <td className="p-3 text-gray-500">{c.email || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {mappedPreview.length > 50 && (
                                        <div className="p-3 text-center text-xs text-gray-400 bg-gray-50">...y {mappedPreview.length - 50} más</div>
                                    )}
                                </div>

                                <div className="flex gap-3">
                                    <button onClick={() => setImportStep('map')} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50">
                                        ← Ajustar mapeo
                                    </button>
                                    <button onClick={executeImport} disabled={importing || !mappedPreview.length}
                                        className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 disabled:opacity-40 shadow-sm">
                                        {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                        {importing ? 'Importando...' : `Importar ${mappedPreview.length} contactos`}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
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
