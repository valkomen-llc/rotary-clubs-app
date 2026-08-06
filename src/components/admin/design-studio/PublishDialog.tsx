// ════════════════════════════════════════════════════════════════════
// Plantillas IA — publicar al portal público
// v4.721.0
//
// Publicar es exponer un diseño a Internet sin sesión. Por eso esta pantalla
// hace dos cosas antes de dejar hacerlo:
//
//   1. **Enseña el formulario que le va a salir al público**, derivado de las
//      variables que el documento usa. El administrador tiene que poder VER la
//      consecuencia de sus bloqueos antes de compartir el enlace, no después.
//   2. **Enseña lo que queda congelado** —logotipo, distrito, gobernador,
//      periodo— con el valor exacto con el que se publica. Es la firma de la
//      pieza y quien publica es responsable de ella.
//
// Publicar CONGELA el diseño: lo que se guarda es el documento tal como está,
// no una referencia a la plantilla del catálogo. Un enlace ya compartido no
// puede cambiar porque alguien tocó el código en un despliegue.
// ════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { X, Globe2, Loader2, Copy, Check, Lock, ExternalLink, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { DesignDocument } from '../../../lib/designSpec';
import { previewPublication, publishDesign, type PublicField, type Publication } from './designApi';

interface Props {
    document: DesignDocument;
    defaultName: string;
    frozen: Record<string, string>;
    onClose: () => void;
    onPublished: (p: Publication) => void;
}

const slugify = (raw: string) => raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const box = 'w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500';

const PublishDialog: React.FC<Props> = ({ document: doc, defaultName, frozen, onClose, onPublished }) => {
    const [name, setName] = useState(defaultName);
    const [slug, setSlug] = useState(slugify(defaultName));
    const [intro, setIntro] = useState('');
    const [fields, setFields] = useState<PublicField[]>([]);
    const [institutional, setInstitutional] = useState<string[]>([]);
    const [locked, setLocked] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [result, setResult] = useState<Publication | null>(null);
    const [copied, setCopied] = useState(false);

    // El formulario se recalcula cada vez que cambian los bloqueos: es la
    // vista previa de lo que va a ver el público.
    useEffect(() => {
        let vivo = true;
        setLoading(true);
        previewPublication(doc, { locked })
            .then(r => { if (!vivo) return; setFields(r.fields); setInstitutional(r.institutional); })
            .catch(e => toast.error(e instanceof Error ? e.message : 'No se pudo calcular el formulario'))
            .finally(() => { if (vivo) setLoading(false); });
        return () => { vivo = false; };
    }, [doc, locked]);

    const toggleLock = (key: string) =>
        setLocked(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

    const publicar = async () => {
        setSaving(true);
        try {
            const p = await publishDesign({
                document: doc, name, slug, category: 'aniversario',
                settings: { locked, intro, frozen },
            });
            setResult(p);
            onPublished(p);
            toast.success('Plantilla publicada.');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo publicar');
        } finally { setSaving(false); }
    };

    const copiar = async () => {
        if (!result) return;
        try {
            await navigator.clipboard.writeText(result.url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch { toast.error('No se pudo copiar. Seleccioná el enlace a mano.'); }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
                    <Globe2 className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-sm font-black text-gray-900 flex-1">Publicar al portal público</h3>
                    <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X className="w-4 h-4 text-gray-500" /></button>
                </div>

                {result ? (
                    <div className="p-5">
                        <p className="text-sm text-gray-700 mb-3">
                            Listo. Cualquiera con este enlace puede generar su pieza, sin cuenta ni contraseña.
                        </p>
                        <div className="flex gap-2 mb-4">
                            <input readOnly value={result.url} className={`${box} font-mono text-xs`} onFocus={e => e.currentTarget.select()} />
                            <button onClick={copiar} className="shrink-0 px-3 rounded-lg border border-gray-300 hover:border-indigo-400 transition-colors" title="Copiar">
                                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-600" />}
                            </button>
                            <a href={result.url} target="_blank" rel="noreferrer" className="shrink-0 px-3 flex items-center rounded-lg border border-gray-300 hover:border-indigo-400 transition-colors" title="Abrir">
                                <ExternalLink className="w-4 h-4 text-gray-600" />
                            </a>
                        </div>
                        <button onClick={onClose} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg py-2.5 transition-colors">
                            Cerrar
                        </button>
                    </div>
                ) : (
                    <div className="p-5 space-y-4">
                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Nombre</label>
                            <input className={box} value={name} onChange={e => { setName(e.target.value); setSlug(slugify(e.target.value)); }} />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Dirección pública</label>
                            <div className="flex items-center gap-1 text-xs">
                                <span className="text-gray-400 shrink-0">/plantillas/</span>
                                <input className={`${box} font-mono`} value={slug} onChange={e => setSlug(slugify(e.target.value))} />
                            </div>
                            <p className="mt-1 text-[10px] text-gray-400">Es el enlace que se comparte. Conviene que sea corto y fácil de dictar.</p>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Instrucción para quien la use (opcional)</label>
                            <input className={box} value={intro} placeholder="Completá los datos y descargá tu pieza"
                                onChange={e => setIntro(e.target.value)} maxLength={200} />
                        </div>

                        {/* Lo que va a ver el público */}
                        <div className="rounded-xl border border-gray-200 p-3">
                            <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-2">
                                El público va a completar {loading && <Loader2 className="w-3 h-3 animate-spin inline ml-1" />}
                            </p>
                            {fields.length === 0 && !loading ? (
                                <p className="flex gap-1.5 text-[11px] text-amber-700">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                    Este diseño no tiene ninguna variable editable, así que el formulario saldría vacío
                                    y todos generarían la misma pieza.
                                </p>
                            ) : (
                                <div className="space-y-1">
                                    {fields.map(f => (
                                        <div key={f.key} className="flex items-center gap-2 text-xs">
                                            <span className="font-semibold text-gray-700 flex-1">{f.label}</span>
                                            <span className="text-[10px] text-gray-400">{f.type}</span>
                                            <button onClick={() => toggleLock(f.key)}
                                                className="text-[10px] font-bold text-gray-400 hover:text-indigo-600 transition-colors" title="Congelar este campo">
                                                bloquear
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {locked.length > 0 && (
                                <p className="mt-2 pt-2 border-t border-gray-100 text-[11px] text-gray-500">
                                    Bloqueados: {locked.join(', ')}.{' '}
                                    <button onClick={() => setLocked([])} className="font-bold text-indigo-600 hover:underline">desbloquear todo</button>
                                </p>
                            )}
                        </div>

                        {/* Lo que queda congelado */}
                        {institutional.length > 0 && (
                            <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
                                <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-gray-400 mb-2">
                                    <Lock className="w-3 h-3" /> Fijo en la pieza
                                </p>
                                <div className="space-y-0.5">
                                    {institutional.map(k => (
                                        <div key={k} className="flex items-center gap-2 text-[11px]">
                                            <span className="text-gray-500 w-24 shrink-0">{k}</span>
                                            <span className="text-gray-700 truncate">
                                                {k === 'logo' ? (frozen[k] ? 'imagen cargada' : '— sin valor —') : (frozen[k] || '— sin valor —')}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <p className="mt-2 text-[10px] text-gray-400">
                                    El público no puede cambiarlos ni verlos como campos. Es la firma de la pieza.
                                </p>
                            </div>
                        )}

                        <button onClick={publicar} disabled={saving || !slug || fields.length === 0}
                            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg py-2.5 transition-colors">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe2 className="w-4 h-4" />}
                            {saving ? 'Publicando…' : 'Publicar'}
                        </button>
                        <p className="text-[10px] text-gray-400 text-center">
                            Se publica el diseño tal como está ahora. Editarlo después no cambia la pieza publicada
                            hasta que la vuelvas a publicar.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PublishDialog;
