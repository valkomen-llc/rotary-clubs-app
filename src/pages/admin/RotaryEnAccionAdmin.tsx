import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';
const KINDS = [
  { id: 'tipo', label: 'Tipos de actividad' },
  { id: 'area', label: 'Áreas de interés' },
  { id: 'programa', label: 'Programas' },
  { id: 'tema', label: 'Temáticas' },
];

const RotaryEnAccionAdmin: React.FC = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'resumen' | 'tax' | 'config' | 'impacto'>('resumen');
  const [kind, setKind] = useState('tipo');
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);
  const [form, setForm] = useState({ slug: '', name: '', icon: '', color: '', order: 0 });
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const loadTax = async (k = kind) => {
    const r = await fetch(`${API}/rotary-en-accion/taxonomies?kind=${k}`, { headers: { Authorization: `Bearer ${token}` } });
    const d = await r.json();
    setItems(d.taxonomies || []);
  };
  const loadAll = async () => {
    try {
      const [s, c] = await Promise.all([
        fetch(`${API}/rotary-en-accion/stats`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).catch(() => null),
        fetch(`${API}/rotary-en-accion/config-admin`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).catch(() => null),
      ]);
      setStats(s); setConfig(c?.config || null);
    } catch { /* noop */ }
    loadTax();
  };
  useEffect(() => { loadAll(); }, []);
  useEffect(() => { loadTax(kind); }, [kind]);

  const save = async () => {
    if (!form.slug || !form.name) { toast.error('Slug y nombre obligatorios'); return; }
    const r = await fetch(`${API}/rotary-en-accion/taxonomies`, { method: 'POST', headers: H, body: JSON.stringify({ kind, ...form }) });
    if (!r.ok) { toast.error('No se pudo guardar'); return; }
    toast.success('Guardado'); setForm({ slug: '', name: '', icon: '', color: '', order: 0 }); loadTax();
  };
  const toggle = async (id: string, active: boolean) => {
    await fetch(`${API}/rotary-en-accion/taxonomies/${id}/active`, { method: 'POST', headers: H, body: JSON.stringify({ active: !active }) });
    loadTax();
  };
  const saveConfig = async () => {
    const r = await fetch(`${API}/rotary-en-accion/config-admin`, { method: 'PUT', headers: H, body: JSON.stringify(config) });
    if (r.ok) toast.success('Configuración guardada'); else toast.error('No se pudo guardar');
  };

  const row = (arr: any[] | undefined) => (arr && arr.length ? arr : null);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-xl font-bold">Rotary en Acción</h2>
            <p className="text-sm text-gray-500">Captación universal · Las campañas activan · Las solicitudes gestionan · El Centro de Control opera.</p>
          </div>
          <div className="flex gap-2 text-xs">
            <button onClick={() => navigate('/admin/campanas-contribucion/solicitudes')} className="border rounded-xl px-3 py-2 font-bold">Ver solicitudes</button>
            <button onClick={() => navigate('/admin/activacion-contenido')} className="border rounded-xl px-3 py-2 font-bold">Campañas de Contenido</button>
            <button onClick={() => navigate('/admin/mission-control-vip')} className="border rounded-xl px-3 py-2 font-bold">Centro de Control</button>
            <a href="/rotary-en-accion" target="_blank" rel="noreferrer" className="bg-gray-900 text-white rounded-xl px-3 py-2 font-bold">Abrir formulario</a>
          </div>
        </div>

        <div className="flex gap-2 text-xs">
          {(['resumen', 'tax', 'config', 'impacto'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 rounded-xl border font-bold ${tab === t ? 'bg-gray-900 text-white' : ''}`}>
              {t === 'resumen' ? 'Resumen' : t === 'tax' ? 'Taxonomías' : t === 'config' ? 'Configuración' : 'Impacto'}
            </button>
          ))}
        </div>

        {tab === 'resumen' && (
          <div className="grid md:grid-cols-3 gap-3 text-xs">
            <div className="bg-white border rounded-2xl p-4">
              <div className="font-bold mb-2">Funnel de solicitudes</div>
              {row(stats?.funnel) ? stats.funnel.map((f: any) => <div key={f.status} className="flex justify-between py-1 border-b"><span>{f.status}</span><b>{f.n}</b></div>) : <div className="text-gray-400">Sin datos aún.</div>}
            </div>
            <div className="bg-white border rounded-2xl p-4">
              <div className="font-bold mb-2">Por tipo</div>
              {row(stats?.porTipo) ? stats.porTipo.slice(0, 8).map((f: any) => <div key={f.k} className="flex justify-between py-1 border-b"><span>{f.k}</span><b>{f.n}</b></div>) : <div className="text-gray-400">Sin datos aún.</div>}
            </div>
            <div className="bg-white border rounded-2xl p-4">
              <div className="font-bold mb-2">Por mes</div>
              {row(stats?.porMes) ? stats.porMes.map((f: any) => <div key={f.k} className="flex justify-between py-1 border-b"><span>{f.k}</span><b>{f.n}</b></div>) : <div className="text-gray-400">Sin datos aún.</div>}
              <div className="mt-2 text-gray-500">Universales (sin campaña): <b>{stats?.universal ?? '—'}</b></div>
            </div>
          </div>
        )}

        {tab === 'tax' && (
          <div className="bg-white border rounded-2xl p-4">
            <div className="flex gap-2 text-xs mb-3 flex-wrap">
              {KINDS.map((k) => <button key={k.id} onClick={() => setKind(k.id)} className={`px-3 py-2 rounded-xl border font-bold ${kind === k.id ? 'bg-gray-900 text-white' : ''}`}>{k.label}</button>)}
            </div>
            <div className="grid md:grid-cols-5 gap-2 text-xs mb-3">
              <input className="border rounded-xl px-2 py-2" placeholder="slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })} />
              <input className="border rounded-xl px-2 py-2" placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input className="border rounded-xl px-2 py-2" placeholder="Icono (emoji)" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
              <input className="border rounded-xl px-2 py-2" placeholder="Color #hex" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
              <button onClick={save} className="bg-emerald-600 text-white rounded-xl px-3 py-2 font-bold">Agregar</button>
            </div>
            <div className="space-y-1 text-xs">
              {items.map((t: any) => (
                <div key={t.id} className={`flex items-center gap-2 border rounded-xl px-3 py-2 ${t.active ? '' : 'opacity-50'}`}>
                  <span className="text-lg">{t.icon}</span><b>{t.name}</b><code className="text-gray-400">{t.slug}</code>
                  <button onClick={() => toggle(t.id, t.active)} className="ml-auto border rounded-lg px-2 py-1">{t.active ? 'Desactivar' : 'Activar'}</button>
                </div>
              ))}
              {items.length === 0 && <div className="text-gray-400">Sin elementos.</div>}
            </div>
          </div>
        )}

        {tab === 'config' && config && (
          <div className="bg-white border rounded-2xl p-4 text-sm space-y-3 max-w-xl">
            <div className="font-bold">Reglas de fotografía (enviar ≠ producir formatos)</div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <label>Mínimo para enviar<input type="number" min={1} className="border rounded-xl px-2 py-2 w-full" value={config.photoRules?.minToSubmit ?? 1} onChange={(e) => setConfig({ ...config, photoRules: { ...config.photoRules, minToSubmit: Number(e.target.value) } })} /></label>
              <label>Recomendado<input type="number" className="border rounded-xl px-2 py-2 w-full" value={config.photoRules?.recommended ?? 3} onChange={(e) => setConfig({ ...config, photoRules: { ...config.photoRules, recommended: Number(e.target.value) } })} /></label>
              <label>Mínimo para Reel<input type="number" className="border rounded-xl px-2 py-2 w-full" value={config.photoRules?.reelMin ?? 5} onChange={(e) => setConfig({ ...config, photoRules: { ...config.photoRules, reelMin: Number(e.target.value) } })} /></label>
              <label>Ventana duplicados (días)<input type="number" className="border rounded-xl px-2 py-2 w-full" value={config.duplicateWindowDays ?? 90} onChange={(e) => setConfig({ ...config, duplicateWindowDays: Number(e.target.value) })} /></label>
            </div>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!config.notifyOnPublish} onChange={(e) => setConfig({ ...config, notifyOnPublish: e.target.checked })} /> Avisar al remitente cuando se publique su historia</label>
            <button onClick={saveConfig} className="bg-emerald-600 text-white rounded-xl px-4 py-2 text-xs font-bold">Guardar configuración</button>
          </div>
        )}

        {tab === 'impacto' && (
          <div className="grid md:grid-cols-2 gap-3 text-xs">
            <div className="bg-white border rounded-2xl p-4">
              <div className="font-bold mb-2">Impacto reportado (agregado, nunca estimado)</div>
              {stats?.impactoReportado ? (
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(stats.impactoReportado).filter(([k]) => k !== 'solicitudes').map(([k, v]) => (
                    <div key={k} className="border rounded-xl p-3"><div className="text-gray-400">{k}</div><div className="font-bold text-lg">{String(v)}</div></div>
                  ))}
                </div>
              ) : <div className="text-gray-400">Sin datos aún.</div>}
            </div>
            <div className="bg-white border rounded-2xl p-4">
              <div className="font-bold mb-2">Actividad por ciudad (base del mapa)</div>
              {row(stats?.ciudades) ? stats.ciudades.slice(0, 15).map((f: any) => <div key={f.k} className="flex justify-between py-1 border-b"><span>{f.k}</span><b>{f.n}</b></div>) : <div className="text-gray-400">Sin datos aún.</div>}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};
export default RotaryEnAccionAdmin;
