// Pestaña "Plantillas" de Email Marketing (v4.1167-68): casa central y ÚNICA
// de las plantillas de correo del sistema.
//
// Todo pasa por `/api/content-activation/templates` (tabla runtime
// `ContentActivationTemplate` + versiones inmutables), el mismo backend que
// usan Campañas de Contenido y el selector del modal de campaña. El almacén
// legado `/communications/templates` (Prisma, sin versiones) queda solo como
// respaldo de lectura; aquí nunca se escribe en él.
//
// Relación Plantillas → Versiones → Campañas → Vista previa → Envíos:
// - Cada guardado crea una VERSIÓN nueva e inmutable (nunca reescribe).
// - La campaña congela un SNAPSHOT (design+html+subject+templateId/version);
//   preview, prueba y envío resuelven ese snapshot (`resolveChannelContent`).
//   Editar la plantilla jamás altera campañas ya enviadas ni snapshots.
// - Las campañas futuras adoptan explícitamente ("actualizar a vN"); nada
//   auto-muta en silencio. Uso y métricas se rastrean por `templateId`.
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import EmailDesigner from '../content-activation/MessageDesigner/EmailDesigner';
import EmailAiAssistant from './EmailAiAssistant';
import { renderDesignToHtml, newId, DEFAULT_SETTINGS, type EmailDesign, type Block } from '../../../lib/emailBlocks';

// HTML simple de la IA → bloques editables (h2/h3→encabezado, p/li→texto,
// primer enlace→botón). La IA nunca escribe directo: el humano revisa en el
// diseñador y guarda como nueva versión.
const aiHtmlToDesign = (html: string): EmailDesign['blocks'] => {
  const t = String(html || '');
  const blocks: EmailDesign['blocks'] = [];
  const push = (b: Block) => blocks.push(b);
  const clean = (s: string) => s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
  const heads = [...t.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi)].map((m) => clean(m[1])).filter(Boolean);
  const paras = [...t.matchAll(/<(p|li)[^>]*>([\s\S]*?)<\/(p|li)>/gi)].map((m) => clean(m[2])).filter(Boolean);
  const link = t.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
  heads.slice(0, 2).forEach((h) => push({ id: newId(), type: 'heading', text: h, level: 2, align: 'left', color: '#0c3c7c' }));
  paras.slice(0, 8).forEach((p) => push({ id: newId(), type: 'text', text: p, align: 'left', color: '#333333', size: 15 }));
  if (link) push({ id: newId(), type: 'button', text: clean(link[2]) || 'Ver más', href: link[1], bg: '#0c3c7c', color: '#ffffff', align: 'center', radius: 8 });
  if (!blocks.length && clean(t)) push({ id: newId(), type: 'text', text: clean(t).slice(0, 2000), align: 'left', color: '#333333', size: 15 });
  return blocks;
};

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

const asDesign = (v: unknown): EmailDesign | null => {
  if (v && typeof v === 'object' && Array.isArray((v as any).blocks)) return v as EmailDesign;
  return null;
};

const TemplatesTab: React.FC<{ initialTemplateId?: string | null }> = ({ initialTemplateId = null }) => {
  const [list, setList] = useState<Tpl[]>([]);
  const [q, setQ] = useState('');
  const [soloActivas, setSoloActivas] = useState(true);
  const [sel, setSel] = useState<any>(null);
  const [selError, setSelError] = useState<string | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [usage, setUsage] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // Estado del editor (fuente central: logo y pie los aporta el sitio
  // remitente en preview/envío; aquí se edita nombre, asunto, preheader,
  // bloques, colores, fondos, tipografías, tamaños y alineaciones).
  const [editName, setEditName] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editPreheader, setEditPreheader] = useState('');
  const [editDesign, setEditDesign] = useState<EmailDesign | null>(null);
  const [editNote, setEditNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiWorking, setAiWorking] = useState(false);

  // IA → bloques: el HTML propuesto se convierte a bloques editables y se
  // anexa o reemplaza en el diseñador (nada se guarda sin revisión humana).
  const applyAiHtml = (html: string, mode: 'append' | 'replace') => {
    const base: EmailDesign = editDesign || { version: 1, settings: { ...DEFAULT_SETTINGS }, blocks: [] };
    const blocks = aiHtmlToDesign(html);
    if (!blocks.length) { toast.error('La IA no devolvió contenido utilizable'); return; }
    setEditDesign(mode === 'replace' ? { ...base, blocks } : { ...base, blocks: [...base.blocks, ...blocks] });
    toast.success(mode === 'replace' ? 'Contenido IA aplicado (revisá y guardá la versión)' : 'Bloques IA agregados al final');
  };

  const load = useCallback(async (solo: boolean) => {
    setLoading(true);
    try {
      const qs = solo ? '?channel=email' : '?channel=email&all=1';
      const r = await fetch(`${API}/content-activation/templates${qs}`, { headers: authHeaders() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo listar');
      setList(d.templates || []);
    } catch (e: any) {
      toast.error(e.message || 'Sin conexión con la biblioteca');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(soloActivas); }, [load, soloActivas]);

  // Deep link (?plantilla=<id>): abre la plantilla aunque no esté activa.
  useEffect(() => {
    if (!initialTemplateId) return;
    setSoloActivas(false);
    open(initialTemplateId);
  }, [initialTemplateId]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = async (id: string, version?: number) => {
    setSelError(null);
    try {
      const r = await fetch(
        `${API}/content-activation/templates/${id}${version ? `?version=${version}` : ''}`,
        { headers: authHeaders() }
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      const t = d.template;
      setSel(t);
      setEditName(t.name || '');
      setEditSubject(t.subject || '');
      setEditPreheader(t.preheader || '');
      setEditDesign(asDesign(t.design));
      setEditNote('');
      setUsage(null);
      setMetrics(null);
      const [rv, ru, rm] = await Promise.all([
        fetch(`${API}/content-activation/templates/${id}/versions`, { headers: authHeaders() }).then((x) => x.json()).catch(() => ({})),
        fetch(`${API}/content-activation/templates/${id}/usage`, { headers: authHeaders() }).then((x) => x.json()).catch(() => ({})),
        fetch(`${API}/content-activation/templates/${id}/metrics`, { headers: authHeaders() }).then((x) => x.json()).catch(() => ({})),
      ]);
      setVersions(rv.versions || []);
      if (typeof ru.total === 'number') setUsage(ru);
      if (rm && rm.email) setMetrics(rm);
    } catch (e: any) {
      setSel(null);
      setSelError(e.message);
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
      load(soloActivas);
      open(id);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const del = async () => {
    if (!sel) return;
    const n = usage?.total ?? '?';
    if (sel.isDefault) {
      toast.error('Es la predeterminada: marcá otra como predeterminada antes de eliminarla.');
      return;
    }
    if (!window.confirm(
      `¿Eliminar definitivamente "${sel.name}" (v${sel.version})?\n\n` +
      `${n} campaña(s) la usan, pero conservan su copia (snapshot). Esta acción no se puede deshacer.`
    )) return;
    try {
      const r = await fetch(`${API}/content-activation/templates/${sel.id}`, {
        method: 'DELETE', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      toast.success('Plantilla eliminada. Las campañas conservan su copia.');
      setSel(null);
      load(soloActivas);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const save = async () => {
    if (!sel || sel.pinned) return;
    if (!['borrador', 'activa'].includes(sel.status)) {
      toast.error(`En estado ${sel.status} no se edita: restaurala a activa primero.`);
      return;
    }
    if (!editName.trim()) { toast.error('La plantilla necesita un nombre'); return; }
    setSaving(true);
    try {
      let html = '';
      try { html = editDesign ? renderDesignToHtml(editDesign) : ''; } catch { html = ''; }
      const r = await fetch(`${API}/content-activation/templates/${sel.id}`, {
        method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(), subject: editSubject, preheader: editPreheader,
          design: editDesign || {}, html, note: editNote.trim() || 'Edición desde Email Marketing',
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      toast.success(`Guardada como v${d.template?.version} (las campañas conservan la que adoptaron).`);
      setEditNote('');
      load(soloActivas);
      open(sel.id);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const createNew = async () => {
    const name = window.prompt('Nombre de la nueva plantilla:', 'Nueva plantilla institucional');
    if (!name) return;
    setCreating(true);
    try {
      const r = await fetch(`${API}/content-activation/templates`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), channel: 'email', design: {}, html: '',
          subject: 'Asunto de la campaña {{campaign_name}}', preheader: '',
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      toast.success('Plantilla creada en borrador: editala y activala para ofrecerla a las campañas.');
      if (!soloActivas) load(soloActivas);
      else { setSoloActivas(false); }
      open(d.template.id);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  // Crear mediante IA: propone asunto + cuerpo, se guarda en borrador y se
  // abre en el editor para revisión humana (la IA nunca publica sola).
  const createWithAi = async () => {
    const objective = window.prompt('¿Qué debe comunicar la plantilla?', 'Recordar a los clubes que compartan sus actividades en Rotary en Acción');
    if (!objective) return;
    setAiWorking(true);
    try {
      const H = { ...authHeaders(), 'Content-Type': 'application/json' };
      const [rs, rb] = await Promise.all([
        fetch(`${API}/email-marketing/ai/assist`, { method: 'POST', headers: H, body: JSON.stringify({ task: 'subjects', objective, tone: 'profesional' }) }),
        fetch(`${API}/email-marketing/ai/assist`, { method: 'POST', headers: H, body: JSON.stringify({ task: 'body', objective, tone: 'profesional', length: 'media' }) }),
      ]);
      const ds = await rs.json().catch(() => ({}));
      const db = await rb.json().catch(() => ({}));
      if (!rs.ok) throw new Error(ds.error || 'La IA no pudo proponer asuntos');
      if (!rb.ok) throw new Error(db.error || 'La IA no pudo redactar el cuerpo');
      const design: EmailDesign = { version: 1, settings: { ...DEFAULT_SETTINGS }, blocks: aiHtmlToDesign(db.html || '') };
      const r = await fetch(`${API}/content-activation/templates`, {
        method: 'POST', headers: H,
        body: JSON.stringify({
          name: `IA: ${objective.slice(0, 60)}`, channel: 'email', design, html: renderDesignToHtml(design),
          subject: ds.subjects?.[0] || 'Propuesta IA', preheader: ds.preheaders?.[0] || '',
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      toast.success('Borrador IA creado: revisalo en el editor antes de activar.');
      setSoloActivas(false);
      open(d.template.id);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAiWorking(false);
    }
  };

  const filtradas = list.filter((t) => !q || String(t.name || '').toLowerCase().includes(q.toLowerCase()));
  const editable = sel && !sel.pinned && ['borrador', 'activa'].includes(sel.status);

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
          <button
            onClick={createNew}
            disabled={creating}
            className="px-3 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold disabled:opacity-50 whitespace-nowrap"
          >
            + Nueva
          </button>
          <button
            onClick={createWithAi}
            disabled={aiWorking}
            title="La IA propone asunto y cuerpo; se guarda en borrador para tu revisión"
            className="px-3 py-2 rounded-xl text-white text-xs font-bold disabled:opacity-50 whitespace-nowrap bg-gradient-to-r from-violet-600 to-fuchsia-600"
          >
            {aiWorking ? '…' : '✨ IA'}
          </button>
        </div>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          <input type="checkbox" checked={soloActivas} onChange={(e) => setSoloActivas(e.target.checked)} />
          Solo activas (sin el check se gestiona todo el ciclo de vida)
        </label>
        {loading && <div className="text-xs text-gray-400">Cargando biblioteca central…</div>}
        {!loading && filtradas.length === 0 && (
          <div className="text-xs text-gray-400 border rounded-xl p-4">
            Sin plantillas de email con este filtro.
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
        {selError && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-4">
            No se pudo abrir la plantilla: {selError}
          </div>
        )}
        {!sel && !selError && (
          <div className="text-xs text-gray-400 border rounded-xl p-4">
            Elegí una plantilla para editarla, ver su estado, uso y métricas. Las campañas que la usaron conservan su copia aunque la edites.
          </div>
        )}
        {sel && (
          <div className="space-y-3 border rounded-2xl p-4">
            <div className="font-bold text-sm">
              {sel.name} <span className="text-gray-400 font-normal">· v{sel.version}{sel.pinned ? ' (versión fijada, solo lectura)' : ''}</span>
            </div>
            {sel.pinned && (
              <div className="text-xs">
                <button onClick={() => open(sel.id)} className="text-blue-700 font-bold">← Volver a la versión actual (v{sel.version})</button>
              </div>
            )}
            {/* Editor central: nombre, asunto, preheader y bloques */}
            <div className="grid gap-2 text-sm">
              <label className="grid gap-1">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Nombre</span>
                <input className="border rounded-xl px-3 py-2" value={editName} onChange={(e) => setEditName(e.target.value)} disabled={!editable} />
              </label>
              <div className="grid md:grid-cols-2 gap-2">
                <label className="grid gap-1">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Asunto (admite variables)</span>
                  <input className="border rounded-xl px-3 py-2" value={editSubject} onChange={(e) => setEditSubject(e.target.value)} disabled={!editable} placeholder="Ej: Novedades de {{club.name}} — {{campaign.name}}" />
                </label>
                <label className="grid gap-1">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Preheader</span>
                  <input className="border rounded-xl px-3 py-2" value={editPreheader} onChange={(e) => setEditPreheader(e.target.value)} disabled={!editable} />
                </label>
              </div>
            </div>
            {editable ? (
              <EmailDesigner design={editDesign} onChange={setEditDesign} />
            ) : (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                {sel.pinned
                  ? 'Estás viendo una versión anterior (solo lectura). Volvé a la actual para editar.'
                  : `En estado ${sel.status} no se edita. Restaurala a activa para modificarla.`}
              </div>
            )}
            <p className="text-[11px] text-gray-400">
              El logo y el pie los aporta el sitio remitente en vista previa y envío (idénticos siempre).
              Variables disponibles: {'{{contact.first_name}}'}, {'{{club.name}}'}, {'{{campaign.name}}'}, {'{{contact.first_name|Amigo}}'}…
            </p>
            {editable && (
              <div className="flex flex-wrap gap-2 items-end">
                <label className="grid gap-1 text-sm flex-1 min-w-[180px]">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Nota de esta versión</span>
                  <input className="border rounded-xl px-3 py-2" value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Ej: nuevo encabezado institucional" />
                </label>
                <button
                  onClick={() => setAiOpen(true)}
                  title="Generar asuntos, redactar, mejorar, variantes A/B y revisión antispam (la IA propone; vos guardás la versión)"
                  className="px-4 py-2 rounded-xl text-white text-sm font-bold bg-gradient-to-r from-violet-600 to-fuchsia-600"
                >
                  ✨ Asistente IA
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50"
                >
                  {saving ? 'Guardando…' : 'Guardar nueva versión'}
                </button>
              </div>
            )}
            <EmailAiAssistant
              open={aiOpen}
              onClose={() => setAiOpen(false)}
              subject={editSubject}
              content={(() => { try { return editDesign ? renderDesignToHtml(editDesign) : ''; } catch { return ''; } })()}
              objectiveDefault={editName}
              onApplySubject={(s) => setEditSubject(s)}
              onApplyPreheader={(p) => setEditPreheader(p)}
              onApplyHtml={(html, mode) => applyAiHtml(html, mode)}
            />
            <div className="flex flex-wrap gap-1.5 text-xs pt-1 border-t border-gray-100">
              {sel.status === 'borrador' && (
                <button onClick={() => acc(sel.id, 'status', { status: 'activa' }, 'Plantilla activada: ya se ofrece a las campañas.')} className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold">Activar</button>
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
              <button onClick={del} className="px-3 py-1.5 rounded-xl border font-bold text-red-600">Eliminar…</button>
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
                    <div key={v.id} className="border rounded-lg px-2 py-1 flex items-center justify-between gap-2">
                      <span>v{v.version} · {v.createdAt ? new Date(v.createdAt).toLocaleString('es-CO') : '—'} · {v.note || '—'}</span>
                      <button onClick={() => open(sel.id, v.version)} className="text-blue-700 font-bold shrink-0">Ver</button>
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
