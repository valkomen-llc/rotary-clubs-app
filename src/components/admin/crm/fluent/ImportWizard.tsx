import React, { useState, useRef } from 'react';
import { UploadCloud, ClipboardPaste, ArrowRight, ArrowLeft, CheckCircle2, XCircle, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../../hooks/useAuth';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const API = import.meta.env.VITE_API_URL || '/api';

export default function ImportWizard({ onClose, onImported }: { onClose: () => void, onImported: () => void }) {
    const { token } = useAuth();
    
    // Steps: 1: Source, 2: Mapping, 3: Preview/Validation, 4: Results
    const [step, setStep] = useState(1);
    
    // Data state
    const [importMethod, setImportMethod] = useState<'upload' | 'paste' | null>(null);
    const [rawText, setRawText] = useState('');
    const [file, setFile] = useState<File | null>(null);
    
    const [parsedData, setParsedData] = useState<any[]>([]);
    const [columns, setColumns] = useState<string[]>([]);
    
    // Mapping state: file header -> CRM field
    const [mapping, setMapping] = useState<Record<string, string>>({});
    
    // Validation state
    const [validatedRows, setValidatedRows] = useState<any[]>([]);
    
    // Config state
    const [config, setConfig] = useState({ onDuplicate: 'ignore', status: 'subscribed' });
    const [selectedLists, setSelectedLists] = useState<string[]>([]);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [availableLists, setAvailableLists] = useState<any[]>([]);
    const [availableTags, setAvailableTags] = useState<any[]>([]);
    const [newListName, setNewListName] = useState('');
    const [creatingList, setCreatingList] = useState(false);
    
    // Results state
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<any>(null);

    const [crmFields, setCrmFields] = useState<any[]>([
        { key: 'email', label: 'Correo Electrónico (Requerido)' },
        { key: 'phone', label: 'Teléfono' },
        { key: 'name', label: 'Nombre' },
        { key: 'lastName', label: 'Apellidos' },
        { key: 'company', label: 'Empresa' },
        { key: 'title', label: 'Cargo' },
        { key: 'city', label: 'Ciudad' },
    ]);

    React.useEffect(() => {
        const fetchMetadata = async () => {
            if (!token) return;
            try {
                const [resFields, resLists, resTags] = await Promise.all([
                    fetch(`${API}/crm/custom-fields`, { headers: { 'Authorization': `Bearer ${token}` } }),
                    fetch(`${API}/crm/lists`, { headers: { 'Authorization': `Bearer ${token}` } }),
                    fetch(`${API}/crm/tags`, { headers: { 'Authorization': `Bearer ${token}` } })
                ]);
                
                if (resFields.ok) {
                    const fields = await resFields.json();
                    const customMappings = fields.map((f: any) => ({
                        key: `cf_${f.id}`,
                        label: `[Personalizado] ${f.label}`
                    }));
                    setCrmFields(prev => {
                        const existingKeys = prev.map(p => p.key);
                        const newMappings = customMappings.filter((m: any) => !existingKeys.includes(m.key));
                        return [...prev, ...newMappings];
                    });
                }
                
                if (resLists.ok) setAvailableLists(await resLists.json());
                if (resTags.ok) setAvailableTags(await resTags.json());
            } catch (e) {
                console.error("Error fetching metadata", e);
            }
        };
        fetchMetadata();
    }, [token]);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (!selected) return;
        setFile(selected);
        
        const ext = selected.name.split('.').pop()?.toLowerCase();
        if (ext === 'csv') {
            Papa.parse(selected, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    setParsedData(results.data);
                    setColumns(results.meta.fields || []);
                    autoMapColumns(results.meta.fields || []);
                    setStep(2);
                }
            });
        } else if (ext === 'xlsx' || ext === 'xls') {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
                if (data.length > 0) {
                    const headers = data[0] as string[];
                    const rows = data.slice(1).map(row => {
                        const obj: any = {};
                        headers.forEach((h, i) => obj[h] = (row as any)[i]);
                        return obj;
                    });
                    setParsedData(rows);
                    setColumns(headers);
                    autoMapColumns(headers);
                    setStep(2);
                }
            };
            reader.readAsBinaryString(selected);
        } else {
            toast.error('Formato no soportado. Usa CSV o Excel.');
        }
    };

    const handlePasteProcess = () => {
        if (!rawText.trim()) return toast.error('Pega datos para continuar');
        
        Papa.parse(rawText, {
            header: true,
            delimiter: '\t', // Excel paste default
            skipEmptyLines: true,
            complete: (results) => {
                if (results.data.length === 0) return toast.error('No se detectaron datos válidos');
                setParsedData(results.data);
                setColumns(results.meta.fields || []);
                autoMapColumns(results.meta.fields || []);
                setStep(2);
            }
        });
    };

    const autoMapColumns = (headers: string[]) => {
        const newMapping: Record<string, string> = {};
        headers.forEach(h => {
            const hLow = h.toLowerCase();
            if (hLow.includes('mail')) newMapping[h] = 'email';
            else if (hLow.includes('name') || hLow.includes('nombre')) newMapping[h] = 'name';
            else if (hLow.includes('last') || hLow.includes('apellido')) newMapping[h] = 'lastName';
            else if (hLow.includes('phone') || hLow.includes('tel')) newMapping[h] = 'phone';
            else if (hLow.includes('company') || hLow.includes('empresa')) newMapping[h] = 'company';
        });
        setMapping(newMapping);
    };

    const processValidation = () => {
        const rows = parsedData.map(row => {
            const mappedRow: any = {};
            const customFields: any[] = [];
            // Apply mapping
            Object.keys(mapping).forEach(col => {
                if (mapping[col]) {
                    const mappedKey = mapping[col];
                    if (mappedKey.startsWith('cf_')) {
                        customFields.push({
                            fieldId: mappedKey.replace('cf_', ''),
                            value: row[col]
                        });
                    } else {
                        mappedRow[mappedKey] = row[col];
                    }
                }
            });
            mappedRow.customFields = customFields;
            
            // Validate
            let status = 'valid'; // valid (green), warning (yellow), error (red)
            let errors = [];
            
            if (!mappedRow.email && !mappedRow.phone) {
                status = 'error';
                errors.push('Falta Email o Teléfono');
            } else if (mappedRow.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mappedRow.email)) {
                status = 'error';
                errors.push('Email inválido');
            }
            
            return { raw: row, mapped: mappedRow, status, errors };
        });
        
        setValidatedRows(rows);
        setStep(3);
    };

    const createAndSelectList = async () => {
        const name = newListName.trim();
        if (!name) return;
        setCreatingList(true);
        try {
            const res = await fetch(`${API}/crm/lists`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ name })
            });
            const list = await res.json();
            if (res.ok) {
                setAvailableLists(prev => [...prev, list]);
                setSelectedLists(prev => [...prev, list.id]);
                setNewListName('');
                toast.success(`Lista "${list.name}" creada y seleccionada`);
            } else {
                throw new Error(list.error);
            }
        } catch (e: any) {
            toast.error(e.message || 'No se pudo crear la lista');
        } finally {
            setCreatingList(false);
        }
    };

    const executeImport = async () => {
        const validContacts = validatedRows.filter(r => r.status !== 'error').map(r => r.mapped);
        
        if (validContacts.length === 0) {
            return toast.error('No hay contactos válidos para importar');
        }
        
        setLoading(true);
        try {
            const res = await fetch(`${API}/crm/contacts/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    contacts: validContacts,
                    config,
                    lists: selectedLists,
                    tags: selectedTags
                })
            });
            
            const data = await res.json();
            if (res.ok) {
                setResults(data);
                setStep(4);
                toast.success('Importación finalizada');
            } else {
                throw new Error(data.error);
            }
        } catch (e: any) {
            toast.error(e.message || 'Error importando contactos');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Importación Masiva</h2>
                        <div className="flex gap-2 mt-2">
                            {[1, 2, 3, 4].map(s => (
                                <div key={s} className={`h-1.5 w-12 rounded-full ${step >= s ? 'bg-rotary-blue' : 'bg-gray-200'}`} />
                            ))}
                        </div>
                    </div>
                    {step < 4 && (
                        <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                            <XCircle className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-white">
                    
                    {/* STEP 1: ORIGEN */}
                    {step === 1 && (
                        <div className="max-w-2xl mx-auto space-y-6">
                            <h3 className="text-lg font-bold text-center">¿Cómo deseas importar tus contactos?</h3>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <button 
                                    onClick={() => setImportMethod('upload')}
                                    className={`p-6 border-2 rounded-xl text-center transition-all ${importMethod === 'upload' ? 'border-rotary-blue bg-blue-50/50' : 'border-gray-100 hover:border-gray-200'}`}
                                >
                                    <UploadCloud className={`w-8 h-8 mx-auto mb-3 ${importMethod === 'upload' ? 'text-rotary-blue' : 'text-gray-400'}`} />
                                    <h4 className="font-bold text-gray-900">Subir Archivo</h4>
                                    <p className="text-xs text-gray-500 mt-1">Soporta CSV o Excel (.xlsx)</p>
                                </button>
                                
                                <button 
                                    onClick={() => setImportMethod('paste')}
                                    className={`p-6 border-2 rounded-xl text-center transition-all ${importMethod === 'paste' ? 'border-rotary-blue bg-blue-50/50' : 'border-gray-100 hover:border-gray-200'}`}
                                >
                                    <ClipboardPaste className={`w-8 h-8 mx-auto mb-3 ${importMethod === 'paste' ? 'text-rotary-blue' : 'text-gray-400'}`} />
                                    <h4 className="font-bold text-gray-900">Pegar desde Excel</h4>
                                    <p className="text-xs text-gray-500 mt-1">CTRL+V directamente de tu tabla</p>
                                </button>
                            </div>

                            {importMethod === 'upload' && (
                                <div className="mt-8 border-2 border-dashed border-gray-200 rounded-xl p-10 text-center hover:border-rotary-blue transition-colors cursor-pointer bg-gray-50" onClick={() => fileInputRef.current?.click()}>
                                    <input type="file" className="hidden" ref={fileInputRef} accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" onChange={handleFileUpload} />
                                    <FileSpreadsheet className="w-10 h-10 text-gray-400 mx-auto mb-4" />
                                    <p className="font-bold text-gray-700">Haz clic o arrastra un archivo aquí</p>
                                </div>
                            )}

                            {importMethod === 'paste' && (
                                <div className="mt-8">
                                    <textarea 
                                        className="w-full h-48 p-4 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-rotary-blue outline-none resize-none font-mono"
                                        placeholder="Copia tus filas de Excel (incluyendo los títulos en la primera fila) y pégalas aquí..."
                                        value={rawText}
                                        onChange={e => setRawText(e.target.value)}
                                    ></textarea>
                                    <div className="flex justify-end mt-4">
                                        <button onClick={handlePasteProcess} className="bg-rotary-blue text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2">
                                            Procesar Datos <ArrowRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* STEP 2: MAPPING */}
                    {step === 2 && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">Mapeo de Columnas</h3>
                                <p className="text-sm text-gray-500">Asocia las columnas detectadas en tu archivo con los campos del CRM.</p>
                            </div>
                            
                            <div className="bg-gray-50 border border-gray-100 rounded-xl overflow-hidden">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-gray-100 text-gray-500 text-xs font-bold uppercase">
                                        <tr>
                                            <th className="p-4">Columna Original</th>
                                            <th className="p-4">Campo CRM</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {columns.map(col => (
                                            <tr key={col}>
                                                <td className="p-4 font-medium text-gray-900">{col}</td>
                                                <td className="p-4">
                                                    <select 
                                                        value={mapping[col] || ''}
                                                        onChange={(e) => setMapping({...mapping, [col]: e.target.value})}
                                                        className="w-64 p-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none"
                                                    >
                                                        <option value="">-- Ignorar columna --</option>
                                                        {crmFields.map(f => (
                                                            <option key={f.key} value={f.key}>{f.label}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="flex justify-between mt-8">
                                <button onClick={() => setStep(1)} className="px-6 py-2 border border-gray-200 text-gray-700 font-bold rounded-lg flex items-center gap-2 hover:bg-gray-50">
                                    <ArrowLeft className="w-4 h-4" /> Volver
                                </button>
                                <button onClick={processValidation} className="px-6 py-2 bg-rotary-blue text-white font-bold rounded-lg flex items-center gap-2 hover:bg-sky-800">
                                    Validar Datos <ArrowRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: PREVIEW & SETTINGS */}
                    {step === 3 && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-end">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">Validación y Configuración</h3>
                                    <p className="text-sm text-gray-500">Revisa los datos antes de importar y define los ajustes masivos.</p>
                                </div>
                                <div className="flex gap-4">
                                    <div className="text-sm flex items-center gap-1 text-emerald-600 font-bold">
                                        <CheckCircle2 className="w-4 h-4" /> {validatedRows.filter(r => r.status === 'valid').length} Válidos
                                    </div>
                                    <div className="text-sm flex items-center gap-1 text-red-600 font-bold">
                                        <AlertCircle className="w-4 h-4" /> {validatedRows.filter(r => r.status === 'error').length} Errores
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Tabla de validación */}
                                <div className="lg:col-span-2 bg-gray-50 border border-gray-100 rounded-xl overflow-hidden h-[400px] overflow-y-auto">
                                    <table className="w-full text-left text-sm whitespace-nowrap">
                                        <thead className="bg-gray-100 text-gray-500 text-xs font-bold uppercase sticky top-0">
                                            <tr>
                                                <th className="p-3 w-10">St</th>
                                                <th className="p-3">Email / Teléfono</th>
                                                <th className="p-3">Nombre</th>
                                                <th className="p-3">Detalle</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {validatedRows.map((row, i) => (
                                                <tr key={i} className={row.status === 'error' ? 'bg-red-50/50' : 'bg-white'}>
                                                    <td className="p-3">
                                                        {row.status === 'valid' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <AlertCircle className="w-4 h-4 text-red-500" />}
                                                    </td>
                                                    <td className="p-3 font-medium">{row.mapped.email || row.mapped.phone || '-'}</td>
                                                    <td className="p-3">{row.mapped.name} {row.mapped.lastName}</td>
                                                    <td className="p-3 text-xs text-red-600 max-w-xs truncate">{row.errors.join(', ')}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Opciones de Importación */}
                                <div className="space-y-4 overflow-y-auto max-h-[400px] pr-2">
                                    <div className="bg-white p-4 border border-gray-200 rounded-xl shadow-sm">
                                        <label className="block text-xs font-bold text-gray-700 mb-1">Comportamiento de Duplicados</label>
                                        <select value={config.onDuplicate} onChange={e => setConfig({...config, onDuplicate: e.target.value})} className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                                            <option value="ignore">Ignorar (Mantener existente)</option>
                                            <option value="update">Actualizar datos</option>
                                        </select>
                                    </div>
                                    <div className="bg-white p-4 border border-gray-200 rounded-xl shadow-sm">
                                        <label className="block text-xs font-bold text-gray-700 mb-1">Estado a asignar</label>
                                        <select value={config.status} onChange={e => setConfig({...config, status: e.target.value})} className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                                            <option value="subscribed">Suscrito</option>
                                            <option value="pending">Pendiente</option>
                                        </select>
                                    </div>
                                    
                                    {/* Listas */}
                                    <div className="bg-white p-4 border border-gray-200 rounded-xl shadow-sm">
                                        <label className="block text-xs font-bold text-gray-700 mb-2">Asignar a Listas</label>
                                        <div className="max-h-32 overflow-y-auto space-y-1 bg-gray-50 p-2 rounded-lg border border-gray-100">
                                            {availableLists.length === 0 ? (
                                                <p className="text-xs text-gray-400">No hay listas todavía. Crea una abajo para agregar los contactos importados.</p>
                                            ) : availableLists.map((l: any) => (
                                                <label key={l.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer p-1 hover:bg-gray-100 rounded transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedLists.includes(l.id)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) setSelectedLists([...selectedLists, l.id]);
                                                            else setSelectedLists(selectedLists.filter(id => id !== l.id));
                                                        }}
                                                        className="rounded border-gray-300 text-rotary-blue focus:ring-rotary-blue"
                                                    />
                                                    {l.name}
                                                </label>
                                            ))}
                                        </div>
                                        <div className="flex gap-2 mt-2">
                                            <input
                                                type="text"
                                                value={newListName}
                                                onChange={e => setNewListName(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createAndSelectList(); } }}
                                                placeholder="Crear nueva lista..."
                                                className="flex-1 min-w-0 p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-rotary-blue outline-none"
                                            />
                                            <button
                                                type="button"
                                                onClick={createAndSelectList}
                                                disabled={creatingList || !newListName.trim()}
                                                className="px-3 py-2 bg-rotary-blue text-white text-sm font-bold rounded-lg hover:bg-sky-800 disabled:opacity-50 shrink-0"
                                            >
                                                {creatingList ? '...' : 'Crear'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Etiquetas */}
                                    <div className="bg-white p-4 border border-gray-200 rounded-xl shadow-sm">
                                        <label className="block text-xs font-bold text-gray-700 mb-2">Asignar Etiquetas</label>
                                        <div className="max-h-32 overflow-y-auto space-y-1 bg-gray-50 p-2 rounded-lg border border-gray-100">
                                            {availableTags.length === 0 ? (
                                                <p className="text-xs text-gray-400">No hay etiquetas disponibles.</p>
                                            ) : availableTags.map((t: any) => (
                                                <label key={t.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer p-1 hover:bg-gray-100 rounded transition-colors">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={selectedTags.includes(t.id)} 
                                                        onChange={(e) => {
                                                            if (e.target.checked) setSelectedTags([...selectedTags, t.id]);
                                                            else setSelectedTags(selectedTags.filter(id => id !== t.id));
                                                        }}
                                                        className="rounded border-gray-300 text-rotary-blue focus:ring-rotary-blue" 
                                                    />
                                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }}></div>
                                                    {t.name}
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="text-xs text-gray-500 p-2 bg-blue-50 text-blue-800 rounded-lg border border-blue-100">
                                        Se importarán únicamente los {validatedRows.filter(r => r.status === 'valid').length} contactos válidos marcados en verde.
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-between mt-8 border-t border-gray-100 pt-4">
                                <button onClick={() => setStep(2)} className="px-6 py-2 border border-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-50">
                                    Volver
                                </button>
                                <button onClick={executeImport} disabled={loading} className="px-6 py-2 bg-rotary-blue text-white font-bold rounded-lg hover:bg-sky-800 flex items-center gap-2 disabled:opacity-50">
                                    {loading ? 'Importando...' : 'Comenzar Importación'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 4: RESULTADOS */}
                    {step === 4 && results && (
                        <div className="max-w-2xl mx-auto space-y-6 text-center py-10">
                            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-100/50">
                                <CheckCircle2 className="w-10 h-10" />
                            </div>
                            <h3 className="text-2xl font-black text-gray-900">¡Importación Completada!</h3>
                            
                            <div className="grid grid-cols-3 gap-4 mt-8">
                                <div className="p-6 border border-gray-100 bg-gray-50 rounded-2xl">
                                    <p className="text-3xl font-black text-emerald-600 mb-1">{results.summary.totalImported}</p>
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Nuevos</p>
                                </div>
                                <div className="p-6 border border-gray-100 bg-gray-50 rounded-2xl">
                                    <p className="text-3xl font-black text-blue-600 mb-1">{results.summary.totalUpdated}</p>
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Actualizados</p>
                                </div>
                                <div className="p-6 border border-red-50 bg-red-50/30 rounded-2xl">
                                    <p className="text-3xl font-black text-red-500 mb-1">{results.summary.totalFailed}</p>
                                    <p className="text-xs font-bold text-red-500 uppercase tracking-wide">Fallidos</p>
                                </div>
                            </div>
                            
                            <div className="mt-8 pt-8 border-t border-gray-100">
                                <button onClick={() => { onImported(); onClose(); }} className="px-8 py-3 bg-rotary-blue text-white font-bold rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-shadow">
                                    Ir al Directorio
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
