import React, { useState, useRef } from 'react';
import { UploadCloud, ClipboardPaste, ArrowRight, ArrowLeft, CheckCircle2, XCircle, AlertCircle, AlertTriangle, FileSpreadsheet, List, Copy, Globe, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../../hooks/useAuth';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { validatePhoneClient, cleanPhoneInput } from '../../../../lib/phoneUtils';
import { findCountryByNameOrQuery } from '../../../../lib/countryData';

const API = import.meta.env.VITE_API_URL || '/api';

export default function ImportWizard({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) {
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
    const [previewFilter, setPreviewFilter] = useState<'all' | 'valid' | 'pending_review' | 'duplicate' | 'error'>('all');
    
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
        { key: 'phone', label: 'Teléfono / WhatsApp' },
        { key: 'countryCode', label: 'Indicativo internacional (+57, +1, etc.)' },
        { key: 'country', label: 'País (Residencia o contexto telefónico)' },
        { key: 'email', label: 'Correo Electrónico (Opcional)' },
        { key: 'name', label: 'Nombre' },
        { key: 'lastName', label: 'Apellidos' },
        { key: 'listName', label: 'Lista / Grupo (crea y asigna)' },
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
            const hLow = h.toLowerCase().trim();
            if (hLow.includes('mail')) newMapping[h] = 'email';
            else if (hLow.includes('lista') || hLow.includes('grupo') || hLow === 'list' || hLow === 'group') newMapping[h] = 'listName';
            else if (hLow.includes('indicativo') || hLow.includes('prefijo') || hLow.includes('dial') || hLow.includes('cod_pais') || hLow === 'code') newMapping[h] = 'countryCode';
            else if (hLow.includes('pais') || hLow.includes('país') || hLow === 'country' || hLow.includes('nacion')) newMapping[h] = 'country';
            else if (hLow.includes('last') || hLow.includes('apellido')) newMapping[h] = 'lastName';
            else if (hLow.includes('name') || hLow.includes('nombre')) newMapping[h] = 'name';
            else if (hLow.includes('phone') || hLow.includes('tel') || hLow.includes('movil') || hLow.includes('celular') || hLow.includes('whatsapp')) newMapping[h] = 'phone';
            else if (hLow.includes('company') || hLow.includes('empresa')) newMapping[h] = 'company';
            else if (hLow.includes('ciudad') || hLow === 'city') newMapping[h] = 'city';
            else if (hLow.includes('cargo') || hLow === 'title') newMapping[h] = 'title';
        });
        setMapping(newMapping);
    };

    const processValidation = () => {
        const seenPhones = new Set<string>();
        const seenEmails = new Set<string>();

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

            // Limpieza de espacios y comillas residuales de exportación
            if (mappedRow.email) mappedRow.email = String(mappedRow.email).trim().toLowerCase();
            if (mappedRow.phone) mappedRow.phone = cleanPhoneInput(mappedRow.phone);
            if (mappedRow.countryCode) mappedRow.countryCode = cleanPhoneInput(mappedRow.countryCode);
            if (mappedRow.country) mappedRow.country = String(mappedRow.country).trim();
            if (mappedRow.listName) mappedRow.listName = String(mappedRow.listName).trim();

            let status = 'valid'; // 'valid' | 'pending_review' | 'duplicate' | 'error'
            let errors: string[] = [];
            let phoneVal: any = null;

            // Combinar columna de indicativo separada si se mapeó
            let phoneToValidate = mappedRow.phone;
            if (mappedRow.countryCode && phoneToValidate && !phoneToValidate.startsWith('+')) {
                const ccClean = String(mappedRow.countryCode).replace(/[^0-9]/g, '');
                const phoneDigits = phoneToValidate.replace(/[^0-9]/g, '');
                if (ccClean && !phoneDigits.startsWith(ccClean)) {
                    phoneToValidate = `+${ccClean}${phoneDigits}`;
                    mappedRow.phone = phoneToValidate;
                }
            }

            // Normalización telefónica con estándar E.164
            if (phoneToValidate) {
                const countryContext = mappedRow.countryCode || mappedRow.country || 'CO';
                phoneVal = validatePhoneClient(phoneToValidate, countryContext);

                if (phoneVal.ok) {
                    mappedRow.phone = phoneVal.e164Formatted;
                    if (!mappedRow.country && phoneVal.country) {
                        mappedRow.country = phoneVal.country.name;
                    }
                } else if (phoneVal.status === 'pending_review') {
                    status = 'pending_review';
                    errors.push(phoneVal.reason);
                } else {
                    if (!mappedRow.email) {
                        status = 'error';
                        errors.push(phoneVal.reason || 'Teléfono no válido');
                    } else {
                        status = 'pending_review';
                        errors.push(`Teléfono no normalizado: ${phoneVal.reason}`);
                    }
                }
            } else if (!mappedRow.email) {
                status = 'error';
                errors.push('Falta Teléfono (o al menos un Correo)');
            }

            // Detección de duplicados dentro del lote importado
            const phoneDigits = phoneVal?.e164 || (mappedRow.phone ? mappedRow.phone.replace(/[^0-9]/g, '') : null);
            if (phoneDigits && seenPhones.has(phoneDigits)) {
                status = 'duplicate';
                errors.push('Número duplicado en este archivo');
            } else if (phoneDigits) {
                seenPhones.add(phoneDigits);
            }

            if (mappedRow.email && seenEmails.has(mappedRow.email)) {
                if (status === 'valid') {
                    status = 'duplicate';
                    errors.push('Correo duplicado en este archivo');
                }
            } else if (mappedRow.email) {
                seenEmails.add(mappedRow.email);
            }

            return { raw: row, mapped: mappedRow, status, errors, phoneValidation: phoneVal };
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

    // ¿El usuario mapeó alguna columna como "Lista / Grupo"? Si es así, cada fila puede
    // ir a su propia lista (creándose automáticamente), además de las listas globales.
    const hasListColumn = Object.values(mapping).includes('listName');

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
                            <p className="text-sm text-gray-500 text-center -mt-4">
                                Tip: agrega una columna <span className="font-bold text-gray-700">"Lista"</span> (o "Grupo") y cada contacto irá a su propia lista — las que no existan se crean solas.
                            </p>

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
                        <div className="space-y-4">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">Validación Internacional y Configuración</h3>
                                    <p className="text-sm text-gray-500">Revisa los números normalizados E.164, países detectados y duplicados antes de importar.</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <div className="text-xs px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 font-bold flex items-center gap-1.5 border border-emerald-100">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> {validatedRows.filter(r => r.status === 'valid').length} Válidos
                                    </div>
                                    <div className="text-xs px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 font-bold flex items-center gap-1.5 border border-amber-100">
                                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> {validatedRows.filter(r => r.status === 'pending_review').length} Revisión
                                    </div>
                                    <div className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 font-bold flex items-center gap-1.5 border border-blue-100">
                                        <Copy className="w-3.5 h-3.5 text-blue-600" /> {validatedRows.filter(r => r.status === 'duplicate').length} Duplicados
                                    </div>
                                    <div className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-700 font-bold flex items-center gap-1.5 border border-red-100">
                                        <AlertCircle className="w-3.5 h-3.5 text-red-600" /> {validatedRows.filter(r => r.status === 'error').length} Errores
                                    </div>
                                </div>
                            </div>

                            {/* Filtros de Vista Previa */}
                            <div className="flex flex-wrap gap-2 text-xs border-b border-gray-100 pb-2">
                                {[
                                    { key: 'all', label: `Todos (${validatedRows.length})` },
                                    { key: 'valid', label: `Válidos (${validatedRows.filter(r => r.status === 'valid').length})` },
                                    { key: 'pending_review', label: `Requieren revisión (${validatedRows.filter(r => r.status === 'pending_review').length})` },
                                    { key: 'duplicate', label: `Duplicados (${validatedRows.filter(r => r.status === 'duplicate').length})` },
                                    { key: 'error', label: `Errores (${validatedRows.filter(r => r.status === 'error').length})` },
                                ].map(tab => (
                                    <button
                                        key={tab.key}
                                        type="button"
                                        onClick={() => setPreviewFilter(tab.key as any)}
                                        className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                                            previewFilter === tab.key
                                                ? 'bg-rotary-blue text-white shadow-sm'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Tabla de validación */}
                                <div className="lg:col-span-2 bg-gray-50 border border-gray-100 rounded-xl overflow-hidden h-[400px] overflow-y-auto">
                                    <table className="w-full text-left text-sm whitespace-nowrap">
                                        <thead className="bg-gray-100 text-gray-500 text-xs font-bold uppercase sticky top-0">
                                            <tr>
                                                <th className="p-3 w-10">Estado</th>
                                                <th className="p-3">Teléfono (E.164)</th>
                                                <th className="p-3">País</th>
                                                <th className="p-3">Nombre</th>
                                                {hasListColumn && <th className="p-3">Lista</th>}
                                                <th className="p-3">Detalle / Diagnóstico</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {validatedRows
                                                .filter(r => previewFilter === 'all' || r.status === previewFilter)
                                                .map((row, i) => (
                                                <tr key={i} className={
                                                    row.status === 'error' ? 'bg-red-50/50' :
                                                    row.status === 'pending_review' ? 'bg-amber-50/40' :
                                                    row.status === 'duplicate' ? 'bg-blue-50/30' : 'bg-white'
                                                }>
                                                    <td className="p-3">
                                                        {row.status === 'valid' ? (
                                                            <CheckCircle2 className="w-4 h-4 text-emerald-500" title="Válido E.164" />
                                                        ) : row.status === 'pending_review' ? (
                                                            <AlertTriangle className="w-4 h-4 text-amber-500" title="Requiere confirmación" />
                                                        ) : row.status === 'duplicate' ? (
                                                            <Copy className="w-4 h-4 text-blue-500" title="Duplicado en archivo" />
                                                        ) : (
                                                            <AlertCircle className="w-4 h-4 text-red-500" title="Error" />
                                                        )}
                                                    </td>
                                                    <td className="p-3 font-mono text-xs font-semibold text-gray-800">
                                                        {row.mapped.phone || '—'}
                                                    </td>
                                                    <td className="p-3 text-xs">
                                                        {row.phoneValidation?.country ? (
                                                            <span className="inline-flex items-center gap-1.5 font-medium text-gray-700">
                                                                <span>{row.phoneValidation.country.flag}</span>
                                                                <span>{row.phoneValidation.country.name}</span>
                                                            </span>
                                                        ) : row.mapped.country ? (
                                                            <span className="text-gray-600">{row.mapped.country}</span>
                                                        ) : (
                                                            <span className="text-gray-300">—</span>
                                                        )}
                                                    </td>
                                                    <td className="p-3 font-medium text-gray-900">{row.mapped.name} {row.mapped.lastName}</td>
                                                    {hasListColumn && (
                                                        <td className="p-3">
                                                            {row.mapped.listName
                                                                ? <span className="inline-block px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">{row.mapped.listName}</span>
                                                                : <span className="text-xs text-gray-400">—</span>}
                                                        </td>
                                                    )}
                                                    <td className="p-3 text-xs max-w-xs truncate">
                                                        {row.errors.length > 0 ? (
                                                            <span className={
                                                                row.status === 'error' ? 'text-red-600' :
                                                                row.status === 'pending_review' ? 'text-amber-700' : 'text-blue-600'
                                                            }>
                                                                {row.errors.join('; ')}
                                                            </span>
                                                        ) : (
                                                            <span className="text-emerald-600 font-medium">Listo para WhatsApp</span>
                                                        )}
                                                    </td>
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
                                    
                                    {/* Aviso: columna de Lista/Grupo detectada */}
                                    {hasListColumn && (
                                        <div className="text-xs p-3 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-100">
                                            <span className="font-bold">Columna "Lista / Grupo" detectada.</span> Cada contacto se asignará a la lista indicada en su fila y las listas que no existan se crearán automáticamente. Las listas marcadas abajo se agregan además a <span className="font-bold">todos</span> los contactos.
                                        </div>
                                    )}

                                    {/* Listas */}
                                    <div className="bg-white p-4 border border-gray-200 rounded-xl shadow-sm">
                                        <label className="block text-xs font-bold text-gray-700 mb-2">Asignar a Listas {hasListColumn && <span className="font-normal text-gray-400">(a todas las filas)</span>}</label>
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
                            
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8">
                                <div className="p-6 border border-gray-100 bg-gray-50 rounded-2xl">
                                    <p className="text-3xl font-black text-emerald-600 mb-1">{results.summary.totalImported}</p>
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Nuevos</p>
                                </div>
                                <div className="p-6 border border-gray-100 bg-gray-50 rounded-2xl">
                                    <p className="text-3xl font-black text-blue-600 mb-1">{results.summary.totalUpdated}</p>
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Actualizados</p>
                                </div>
                                <div className="p-6 border border-gray-100 bg-gray-50 rounded-2xl">
                                    <p className="text-3xl font-black text-amber-600 mb-1">{results.summary.totalExisting ?? 0}</p>
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Ya existían</p>
                                </div>
                                <div className="p-6 border border-red-50 bg-red-50/30 rounded-2xl">
                                    <p className="text-3xl font-black text-red-500 mb-1">{results.summary.totalFailed}</p>
                                    <p className="text-xs font-bold text-red-500 uppercase tracking-wide">Fallidos</p>
                                </div>
                            </div>

                            {results.summary.listsCreated > 0 && (
                                <div className="mt-4 text-sm inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 text-blue-700 font-bold">
                                    <List className="w-4 h-4" /> {results.summary.listsCreated} lista{results.summary.listsCreated === 1 ? '' : 's'} nueva{results.summary.listsCreated === 1 ? '' : 's'} creada{results.summary.listsCreated === 1 ? '' : 's'} automáticamente
                                </div>
                            )}
                            
                            <div className="mt-8 pt-8 border-t border-gray-100">
                                <button onClick={() => { onSuccess(); onClose(); }} className="px-8 py-3 bg-rotary-blue text-white font-bold rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-shadow">
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
