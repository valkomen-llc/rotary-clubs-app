// Biblioteca de plantillas (v4.1166): ver, previsualizar, usar, guardar,
// duplicar, archivar, eliminar, versiones y predeterminada. Todo pasa por
// `/api/content-activation/templates`; el servidor decide permisos.
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { substituteVars, TEST_VARS } from '../../../../lib/contentActivationVariables';
import { renderDesignToHtml } from '../../../../lib/emailBlocks';
import { buildEmailShell } from './designUtils';
import { useAuth } from '../../../../hooks/useAuth';

const API = import.meta.env.VITE_API_URL || '/api';

const TemplateLibrary: React.FC<{
  channel: 'email' | 'whatsapp';
  onUse: (snap: { design: unknown; html: string; subject: string; preheader: string; templateId: string; templateVersion: number }) => void;
  onClose: () => void;
  refreshKey?: number;
  /** Borrador actual del editor, para "Guardar como plantilla". */
  draft?: { design?: unknown; html?: string; subject?: string; preheader?: string };
}> = ({ channel, onUse, onClose, refreshKey, draft }) => {
  const { token } = useAuth();
  const H = { Authorization: `Bearer ${token}` };
  const [list, setList] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [usage, setUsage] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [q, setQ] = useState('');
  const [savingAs, setSavingAs] = useState(false);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/content-activation/templates?channel=${channel}`, { headers: H });
      const d = await r.json();
      if (r.ok) setList(d.templates || []);
      else toast.error(d.error || 'No se pudo listar');
    } catch { toast.error('Sin conexión con la biblioteca'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, refreshKey]);

  useEffect(() => { load(); }, [load]);

  const open = async (id: string, version?: number) => {
    try {
      const r = await fetch(`${API}/content-activation/templates/${id}${version ? `?version=${version}` : ''}`, { headers: H });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      setSel(d.template);
      setUsage(null);
      setMetrics(null);
      const rv = await fetch(`${API}/content-activation/templates/${id}/versions`, { headers: H }).then((x) => x.json()).catch(() => ({}));
      setVersions(rv.versions || []);
      fetch(`${API}/content-activation/templates/${id}/usage`, { headers: H }).then((x) => x.json()).then((u) => {
        if (typeof u.total === 'number') setUsage(u);
      }).catch(() => {});
      fetch(`${API}/content-activation/templates/${id}/metrics`, { headers: H }).then((x) => x.json()).then((m) => {
        if (m && m.email) setMetrics(m);
      }).catch(() => {});
    } catch (e: any) { toast.error(e.message); }
  };

  const acc = async (id: string, path: string, body: unknown, okMsg: string) => {
    try {
      const r = await fetch(`${API}/content-activation/templates/${id}/${path}`, {
        method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      toast.success(okMsg);
      load();
      if (sel?.id === id) open(id);
    } catch (e: any) { toast.error(e.message); }
  };

  const del = async (id: string) => {
    if (!confirm('¿Eliminar definitivamente esta plantilla archivada? Las campañas que la usaron conservan su copia.')) return;
    try {
      const r = await fetch(`${API}/content-activation/templates/${id}`, {
        method: 'DELETE', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      toast.success('Plantilla eliminada.');
      if (sel?.id === id) setSel(null);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const tplHtml = (() => {
    if (sel?.html) return sel.html;
    // Semilla sin HTML guardado: se deriva de sus bloques (igual que al usarla).
    if (sel?.design && Array.isArray(sel.design.blocks)) {
      try { return renderDesignToHtml(sel.design); } catch { return ''; }
    }
    return '';
  })();
  const previewHtml = sel && channel === 'email'
    ? buildEmailShell({
      subject: substituteVars(sel.subject || '', TEST_VARS).text,
      preheader: substituteVars(sel.preheader || '', TEST_VARS).text,
      bodyHtml: substituteVars(tplHtml, TEST_VARS).text,
      footer: '',
    })
    : '';

  const filtradas = list.filter((t) => !q || String(t.name || '').toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-auto p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="font-bold text-lg">Biblioteca de plantillas · {channel === 'email' ? 'Email' : 'WhatsApp'}</div>
          <button onClick={onClose} className="border rounded-xl px-3 py-1.5 text-xs font-bold">Cerrar</button>
        </div>
        <div className="flex gap-2 mt-3">
          <input className="border rounded-xl px-3 py-2 text-sm flex-1" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="grid md:grid-cols-2 gap-4 mt-3">
          <div className="space-y-1.5 max-h-[55vh] overflow-auto">
            {filtradas.length === 0 && <div className="text-xs text-gray-400">Sin plantillas. Guardá el diseño actual como plantilla.</div>}
            {filtradas.map((t) => (
              <button key={t.id} onClick={() => open(t.id)}
                className={`w-full text-left border rounded-xl px-3 py-2 hover:border-gray-300 ${sel?.id === t.id ? 'border-rotary-blue ring-1 ring-rotary-blue' : ''}`}>
                <div className="text-sm font-bold truncate">{t.name} {t.isDefault && <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full ml-1">PREDETERMINADA</span>}</div>
                <div className="text-[11px] text-gray-400">v{t.version} · {t.versions ?? '?'} versiones · {t.scope === 'global' ? 'global' : 'sitio'}</div>
              </button>
            ))}
          </div>
          <div className="min-w-0">
            {!sel ? (
              <div className="text-xs text-gray-400 border rounded-xl p-4">Elegí una plantilla para previsualizarla y usarla.</div>
            ) : (
              <div className="space-y-2">
                <div className="font-bold text-sm">{sel.name} <span className="text-gray-400 font-normal">· v{sel.version}{sel.pinned ? ' (versión fijada)' : ''}</span></div>
                {sel.status && sel.status !== 'activa' && (
                  <div className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                    Estado: {sel.status} · las campañas que la usaron conservan su copia.
                  </div>
                )}
                {channel === 'email' ? (
                  <div className="border rounded-xl overflow-hidden"><iframe title="Vista previa de plantilla" srcDoc={previewHtml} className="w-full bg-white" style={{ height: 320 }} /></div>
                ) : (
                  <div className="border rounded-xl p-3 bg-[#e7ffdb] text-xs whitespace-pre-wrap max-h-80 overflow-auto">
                    {substituteVars(`${sel.design?.headerText ? `${sel.design.headerText}\n\n` : ''}${sel.design?.body || ''}${sel.design?.footer ? `\n\n${sel.design.footer}` : ''}`, TEST_VARS).text || '—'}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <button onClick={() => {
                    // El snapshot congela diseño+html+versión en la campaña. Si la
                    // plantilla nació sin HTML (semilla institucional), se deriva
                    // de sus bloques para que la campaña renderice esa versión
                    // exacta (ruta diseño) en vez de caer al clásico.
                    let html = sel.html || '';
                    if (!html && sel.design && Array.isArray(sel.design.blocks)) {
                      try { html = renderDesignToHtml(sel.design); } catch { html = ''; }
                    }
                    onUse({ design: sel.design, html, subject: sel.subject, preheader: sel.preheader, templateId: sel.id, templateVersion: sel.version });
                  }} className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold">Usar en la campaña</button>
                  <button onClick={() => acc(sel.id, 'duplicate', {}, 'Plantilla duplicada como borrador.')} className="px-3 py-1.5 rounded-xl border font-bold">Duplicar</button>
                  {sel.status === 'borrador' && <button onClick={() => acc(sel.id, 'status', { status: 'activa' }, 'Plantilla activada.')} className="px-3 py-1.5 rounded-xl border font-bold text-emerald-700">Activar</button>}
                  {sel.status === 'activa' && <button onClick={() => acc(sel.id, 'status', { status: 'inactiva' }, 'Desactivada (no se ofrece para campañas nuevas).')} className="px-3 py-1.5 rounded-xl border font-bold">Desactivar</button>}
                  {sel.status === 'inactiva' && <button onClick={() => acc(sel.id, 'status', { status: 'activa' }, 'Reactivada.')} className="px-3 py-1.5 rounded-xl border font-bold text-emerald-700">Reactivar</button>}
                  <button onClick={() => acc(sel.id, 'archive', { archived: sel.status !== 'archivada' }, sel.status !== 'archivada' ? 'Archivada.' : 'Restaurada.')} className="px-3 py-1.5 rounded-xl border font-bold">{sel.status !== 'archivada' ? 'Archivar' : 'Restaurar'}</button>
                  <button onClick={() => acc(sel.id, 'set-default', {}, 'Marcada como predeterminada.')} className="px-3 py-1.5 rounded-xl border font-bold">Predeterminada</button>
                  <button onClick={() => del(sel.id)} className="px-3 py-1.5 rounded-xl border font-bold text-red-600">Eliminar…</button>
                </div>
                {usage && (
                  <div className="text-xs bg-gray-50 border rounded-xl p-2">
                    {usage.total} campaña(s) la usan
                    {usage.lastUsedAt && <> · último uso {new Date(usage.lastUsedAt).toLocaleString('es-CO')}</>}
                  </div>
                )}
                {metrics?.email && (
                  <div className="text-xs bg-gray-50 border rounded-xl p-2">
                    {metrics.email.enviados} enviados · {metrics.email.aperturas} aperturas · {metrics.email.clics} clics
                  </div>
                )}
                {versions.length > 0 && (
                  <div className="text-xs">
                    <div className="font-bold text-gray-500 mb-1">Versiones (cada edición guarda una; las campañas usan la que adoptaron)</div>
                    <div className="space-y-1 max-h-32 overflow-auto">
                      {versions.map((v: any) => (
                        <button key={v.id} onClick={() => open(sel.id, v.version)} className="w-full text-left border rounded-lg px-2 py-1 hover:bg-gray-50">
                          v{v.version} · {new Date(v.createdAt).toLocaleString('es-CO')} · {v.note || '—'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="text-xs border-t pt-2">
                  {!savingAs ? (
                    <button onClick={() => setSavingAs(true)} className="text-blue-700 font-bold">Guardar el diseño actual como plantilla nueva</button>
                  ) : (
                    <SaveAsForm
                      onCancel={() => setSavingAs(false)}
                      onSave={async () => {
                        try {
                          const r = await fetch(`${API}/content-activation/templates`, {
                            method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: newName, channel, ...(draft || {}) }),
                          });
                          const d = await r.json();
                          if (!r.ok) throw new Error(d.error || 'Error');
                          toast.success('Plantilla guardada.');
                          setSavingAs(false); setNewName(''); load();
                        } catch (e: any) { toast.error(e.message); }
                      }}
                      name={newName} setName={setNewName} />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const SaveAsForm: React.FC<{ onCancel: () => void; onSave: () => void; name: string; setName: (v: string) => void }> = ({ onCancel, onSave, name, setName }) => (
  <div className="flex gap-2">
    <input className="border rounded-xl px-3 py-2 text-sm flex-1" placeholder="Nombre de la plantilla" value={name} onChange={(e) => setName(e.target.value)} />
    <button onClick={onSave} disabled={!name.trim()} className="px-3 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold disabled:opacity-50">Guardar</button>
    <button onClick={onCancel} className="px-3 py-2 text-xs text-gray-500">Cancelar</button>
  </div>
);

export default TemplateLibrary;
