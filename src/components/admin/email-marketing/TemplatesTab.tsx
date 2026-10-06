// Pestaña "Plantillas" de Email Marketing (v4.1167): casa central de la
// infraestructura "Plantillas y Automatizaciones".
//
// NO es una tienda paralela: todo pasa por `/api/content-activation/templates`,
// el mismo backend versionado que usan Campañas de Contenido (diseñador de
// mensajes) y el selector del modal de campaña. Editar aquí nunca reescribe
// campañas ya enviadas: cada campaña guarda su snapshot + templateId/version,
// y aquí se muestra el uso (conteo + último uso) y las métricas agregadas.
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('rotary_token')}` });

interface Tpl {
  id: string;
  name: string;
  channel: string;
  scope: string;
  subject?: string;
  preheader?: string;
  isDefault?: boolean;
  status?: string;
  version?: number;
  versions?: number;
  updatedAt?: string;
}

const STATUS_CLS: Record<string, string> = {
  borrador: 'bg-gray-100 text-gray-600',
  activa: 'bg-emerald-100 text-emerald-700',
  inactiva: 'bg-amber-100 text-amber-700',
  archivada: 'bg-rose-100 text-rose-600',
};

const TemplatesTab: React.FC = () => {
  const [list, setList] = useState<Tpl[]>([]);
  const [q, setQ] = useState('');
  const [soloActivas, setSoloActivas] = useState(true);
  const [sel, setSel] = useState<any>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [usage, setUsage] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/content-activation/templates`, { headers: authHeaders() });
      const d = await r.json();
      if (r.ok) setList((d.templates || []).filter((t: Tpl) => t.channel !== 'whatsapp'));
      else toast.error(d.error || 'No se pudo listar');
    } catch {
      toast.error('Sin conexión con la biblioteca');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const open = async (id: string) => {
    try {
      const r = await fetch(`${API}/content-activation/templates/${id}`, { headers: authHeaders() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      setSel(d.template);
      setUsage(null);
      setMetrics(null);
      const [rv, ru, rm] = await Promise.all([
        fetch(`${API}/content-activation/templates/${id}/versions`, { headers: authHeaders() }).then((x) => x.json()).catch(() => ({})),
        fetch(`${API}/content-activation/templates/${id}/usage`, { headers: authHeaders() }).then((x) => x.json()).catch(() => ({})),
        fetch(`${API}/content-activation/templates/${id}/metrics`, { headers: authHeaders() }).then((x) => x.json()).catch(() => ({})),
      ]);
      setVersions(rv.versions || []);
      if (typeof ru.total === 'number') setUsage(ru);
      if (ru && typeof ru.total !== 'number' && ru.error) { /* sin permiso o sin datos */ }
      if (rm && rm.email) setMetrics(rm);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const acc = async (id: string, path: string, body: unknown, okMsg: string) => {
    try {
      const r = await fetch(`${API}/content-activation/templates/${id}/${path}`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      toast.success(okMsg);
      load();
      open(id);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const filtradas = list.filter((t) => {
    if (soloActivas && t.status && t.status !== 'activa') return false;
    if (!soloActivas && t.status === 'archivada') return false;
    return !q || String(t.name || '').toLowerCase().includes(q.toLowerCase());
  });

  return (
    <div className="grid md:grid-cols-5 gap-4">
      <div className="md:col-span-2 space-y-2">
        <div className="flex gap-2">
          <input
            className="border rounded-xl px-3 py-2 text-sm flex-1"
            placeholder="Buscar plantilla…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <label className="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap">
            <input type="checkbox" checked={soloActivas} onChange={(e) => setSoloActivas(e.target.checked)} />
            Solo activas
          </label>
        </div>
        {loading && <div className="text-xs text-gray-400">Cargando biblioteca central…</div>}
        {!loading && filtradas.length === 0 && (
          <div className="text-xs text-gray-400 border rounded-xl p-4">
            Sin plantillas de email. Guardá una desde el modal de campaña (“Guardar como plantilla”).
          </div>
        )}
        <div className="space-y-1.5 max-h-[60vh] overflow-auto">
          {filtradas.map((t) => (
            <button
              key={t.id}
              onClick={() => open(t.id)}
              className={`w-full text-left border rounded-xl px-3 py-2 hover:border-gray-300 ${sel?.id === t.id ? 'border-rotary-blue ring-1 ring-rotary-blue' : ''}`}
            >
              <div className="text-sm font-bold truncate">
                {t.name}{' '}
                {t.isDefault && <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full ml-1">PREDETERMINADA</span>}
              </div>
              <div className="text-[11px] text-gray-400 flex items-center gap-1.5 mt-0.5">
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${STATUS_CLS[t.status || 'activa'] || 'bg-gray-100 text-gray-500'}`}>
                  {t.status || 'activa'}
                </span>
                <span>v{t.version} · {t.versions ?? '?'} versiones · {t.scope === 'global' ? 'global' : 'sitio'}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="md:col-span-3 min-w-0">
        {!sel ? (
          <div className="text-xs text-gray-400 border rounded-xl p-4">
            Elegí una plantilla para ver su estado, uso y métricas. Las campañas que la usaron conservan su copia aunque la edites.
          </div>
        ) : (
          <div className="space-y-2 border rounded-2xl p-4">
            <div className="font-bold text-sm">
              {sel.name} <span className="text-gray-400 font-normal">· v{sel.version}</span>
            </div>
            {sel.subject && <div className="text-xs text-gray-600">Asunto: {sel.subject}</div>}
            <div className="flex flex-wrap gap-1.5 text-xs pt-1">
              {sel.status === 'borrador' && (
                <button onClick={() => acc(sel.id, 'status', { status: 'activa' }, 'Plantilla activada.')} className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold">Activar</button>
              )}
              {sel.status === 'activa' && (
                <button onClick={() => acc(sel.id, 'status', { status: 'inactiva' }, 'Plantilla desactivada (no se ofrece para campañas nuevas).')} className="px-3 py-1.5 rounded-xl border font-bold">Desactivar</button>
              )}
              {sel.status === 'inactiva' && (
                <button onClick={() => acc(sel.id, 'status', { status: 'activa' }, 'Plantilla reactivada.')} className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold">Reactivar</button>
              )}
              {sel.status !== 'archivada' ? (
                <button onClick={() => acc(sel.id, 'archive', { archived: true }, 'Archivada.')} className="px-3 py-1.5 rounded-xl border font-bold">Archivar</button>
              ) : (
                <button onClick={() => acc(sel.id, 'archive', { archived: false }, 'Restaurada a activa.')} className="px-3 py-1.5 rounded-xl border font-bold">Restaurar</button>
              )}
              <button onClick={() => acc(sel.id, 'duplicate', {}, 'Duplicada como borrador.')} className="px-3 py-1.5 rounded-xl border font-bold">Duplicar</button>
              <button onClick={() => acc(sel.id, 'set-default', {}, 'Marcada como predeterminada.')} className="px-3 py-1.5 rounded-xl border font-bold">Predeterminada</button>
            </div>
            <div className="text-xs bg-gray-50 border border-gray-100 rounded-xl p-3">
              <div className="font-bold text-gray-500 mb-1">Uso (campañas con snapshot de esta plantilla)</div>
              {!usage ? (
                <div className="text-gray-400">Cargando uso…</div>
              ) : (
                <div>
                  {usage.total} campaña(s)
                  {usage.lastUsedAt && <> · último uso {new Date(usage.lastUsedAt).toLocaleString('es-CO')}</>}
                  {(usage.emailCampaigns || []).length > 0 && (
                    <ul className="mt-1 space-y-0.5 max-h-24 overflow-auto">
                      {(usage.emailCampaigns || []).slice(0, 10).map((c: any) => (
                        <li key={c.id} className="truncate">· {c.name} ({c.status})</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            {metrics?.email && (
              <div className="text-xs bg-gray-50 border border-gray-100 rounded-xl p-3">
                <div className="font-bold text-gray-500 mb-1">Métricas agregadas (sobreviven a ediciones futuras)</div>
                <div>
                  {metrics.email.campanas} campaña(s) · {metrics.email.enviados} enviados · {metrics.email.aperturas} aperturas · {metrics.email.clics} clics
                  {' '}· apertura {metrics.email.tasaApertura}% · clic {metrics.email.tasaClic}%
                </div>
              </div>
            )}
            {versions.length > 0 && (
              <div className="text-xs">
                <div className="font-bold text-gray-500 mb-1">Versiones (cada edición guarda una; las campañas usan la que adoptaron)</div>
                <div className="space-y-1 max-h-32 overflow-auto">
                  {versions.map((v: any) => (
                    <div key={v.id} className="border rounded-lg px-2 py-1">
                      v{v.version} · {v.createdAt ? new Date(v.createdAt).toLocaleString('es-CO') : '—'} · {v.note || '—'}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplatesTab;
