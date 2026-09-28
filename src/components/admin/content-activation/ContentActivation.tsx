import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { toast } from 'sonner';
import { STATUS_LABEL, FREQUENCIES, LEVEL_LABEL } from '../../../lib/contentActivationSpec';

const API = import.meta.env.VITE_API_URL || '/api';

type Campaign = any;
type Execution = any;

const emptyForm = {
  name: '', description: '', objetivo: '', contributionCampaignId: '',
  startAt: '', endAt: '', timezone: 'America/Bogota', frecuencia: 'mensual',
  canales: ['whatsapp'], audienceDef: { match: 'all', rules: [] as any[] },
  flowDef: [
    { dayOffset: 0, key: 'invitacion', channel: 'whatsapp', template: '', condition: 'siempre', waitDays: 0, action: 'enviar', expect: 'clic' },
    { dayOffset: 3, key: 'recordatorio_1', channel: 'whatsapp', template: '', condition: 'no_solicitud', waitDays: 3, action: 'enviar', expect: 'solicitud' },
    { dayOffset: 7, key: 'recordatorio_2', channel: 'email', template: '', condition: 'no_solicitud', waitDays: 4, action: 'enviar', expect: 'solicitud' },
    { dayOffset: 14, key: 'ideas', channel: 'whatsapp', template: '', condition: 'no_solicitud', waitDays: 7, action: 'enviar', expect: 'solicitud' },
    { dayOffset: 21, key: 'seguimiento_final', channel: 'whatsapp', template: '', condition: 'no_participo', waitDays: 7, action: 'enviar', expect: 'solicitud' },
    { dayOffset: 30, key: 'cierre', channel: 'email', template: '', condition: 'siempre', waitDays: 9, action: 'cerrar_ciclo', expect: 'nueva_recurrencia' },
  ],
  followRules: { stopOnResponse: true, maxAttempts: 5, quietHours: { start: '20:00', end: '08:00' }, maxPerWeek: 3, respectOptOut: true, altChannel: true },
};

const AUDIENCE_FIELDS = [
  { id: 'district', label: 'Distrito' }, { id: 'siteId', label: 'Club (siteId)' },
  { id: 'orgRole', label: 'Cargo (president/secretary/...)' }, { id: 'cargo', label: 'Cargo (presidente/secretario)' },
  { id: 'tags', label: 'Etiqueta CRM' }, { id: 'has_sent', label: 'Ya envió contenido (true/false)' },
  { id: 'has_published', label: 'Con contenido publicado (true/false)' },
  { id: 'participation_level', label: 'Nivel (alta/recurrente/ocasional/en_riesgo/sin_reciente)' },
];

export default function ContentActivation() {
  const { token } = useAuth();
  const [list, setList] = useState<Campaign[]>([]);
  const [contrib, setContrib] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<any>(emptyForm);
  const [preview, setPreview] = useState<any>(null);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [activeExec, setActiveExec] = useState<string>('');
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiDraft, setAiDraft] = useState<any>(null);
  const [detailTab, setDetailTab] = useState<'flujo'|'tablero'|'tracker'|'analitica'|'insights'>('flujo');

  const H = { Authorization: `Bearer ${token}` };

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/content-activation`, { headers: H });
      const d = await r.json();
      setList(d.campaigns || []);
      const c2 = await fetch(`${API}/contribution-campaigns`, { headers: H }).catch(() => null);
      if (c2?.ok) { const j = await c2.json(); setContrib(j.campaigns || j || []); }
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openDetail = async (c: Campaign) => {
    setSelected(c); setDetailTab('flujo');
    try {
      const r = await fetch(`${API}/content-activation/${c.id}`, { headers: H });
      const d = await r.json();
      if (d.campaign) setSelected(d.campaign);
      setExecutions(d.executions || []);
      const ex = (d.executions || [])[0];
      if (ex) { setActiveExec(ex.id); loadExecData(c.id, ex.id); }
    } catch { /* noop */ }
  };

  const loadExecData = async (campaignId: string, executionId: string) => {
    try {
      const [e1, e2, e3, e4] = await Promise.all([
        fetch(`${API}/content-activation/executions/${executionId}/enrollments?limit=200`, { headers: H }).then((r) => r.json()).catch(() => ({})),
        fetch(`${API}/content-activation/${campaignId}/timeline?executionId=${executionId}`, { headers: H }).then((r) => r.json()).catch(() => ({})),
        fetch(`${API}/content-activation/${campaignId}/analytics?executionId=${executionId}`, { headers: H }).then((r) => r.json()).catch(() => ({})),
        fetch(`${API}/content-activation/${campaignId}/insights?executionId=${executionId}`, { headers: H }).then((r) => r.json()).catch(() => ({})),
      ]);
      setEnrollments(e1.enrollments || []);
      setEvents(e2.events || []);
      setKpis(e3.kpis || null);
      setInsights(e4);
    } catch { /* noop */ }
  };

  const doPreview = async () => {
    try {
      const r = await fetch(`${API}/content-activation/${selected?.id || 'preview'}/preview`, {
        method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ audienceDef: form.audienceDef }),
      }).catch(() => null);
      // Si no hay campaña aún, previsualizar con endpoint de borrador vía enroll-preview local:
      if (!r || !r.ok) {
        toast.info('Guarda la campaña para ver la audiencia estimada.');
        return;
      }
      const d = await r.json();
      setPreview(d.preview || d);
    } catch { toast.error('No se pudo previsualizar'); }
  };

  const save = async () => {
    try {
      const r = await fetch(`${API}/content-activation`, {
        method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      toast.success('Campaña creada en borrador. Revísala antes de activar.');
      setShowWizard(false); setForm(emptyForm); setStep(0); load();
    } catch (e: any) { toast.error(e.message); }
  };

  const transition = async (to: string) => {
    if (!selected) return;
    if (to === 'activa' && !confirm('¿Activar la campaña? Se empezará a contactar según el flujo.')) return;
    try {
      const r = await fetch(`${API}/content-activation/${selected.id}/status`, {
        method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: to }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success(`Estado: ${to}`);
      openDetail(d.campaign); load();
    } catch (e: any) { toast.error(e.message); }
  };

  const askAi = async () => {
    try {
      const r = await fetch(`${API}/content-activation/ai-draft`, {
        method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt }),
      });
      const d = await r.json();
      setAiDraft(d.draft || d);
      if (d.draft) {
        setForm((f: any) => ({ ...f, name: d.draft.name || f.name, description: d.draft.description || f.description, frecuencia: d.draft.frecuencia || f.frecuencia, canales: d.draft.canales || f.canales, audienceDef: d.draft.audienceDef || f.audienceDef, flowDef: d.draft.flowDef || f.flowDef, followRules: { ...f.followRules, ...(d.draft.followRules || {}) } }));
        toast.success('Borrador propuesto por IA. Revísalo antes de guardar.');
      }
    } catch { toast.error('IA no disponible'); }
  };

  const addRule = () => {
    setForm((f: any) => ({ ...f, audienceDef: { ...f.audienceDef, rules: [...(f.audienceDef.rules || []), { field: 'district', op: 'eq', value: '' }] } }));
  };

  if (loading) return <div className="p-8 text-sm text-gray-500">Cargando campañas de contenido…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Campañas de Contenido</h2>
          <p className="text-sm text-gray-500">Segmentar → Contactar → Recordar → Recibir → Analizar → Generar → Aprobar → Publicar → Medir → Aprender → Reactivar.</p>
        </div>
        <button onClick={() => { setShowWizard(true); setStep(0); }} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold">+ Nueva campaña</button>
      </div>

      {list.length === 0 ? (
        <div className="bg-white border rounded-2xl p-8 text-center text-sm text-gray-500">Todavía no hay campañas de contenido. Crea la primera (p. ej. “Rotary en Acción — Participación mensual”).</div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map((c) => (
            <button key={c.id} onClick={() => openDetail(c)} className="text-left bg-white border rounded-2xl p-4 hover:shadow">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold px-2 py-1 rounded-full bg-gray-100">{STATUS_LABEL[c.status] || c.status}</span>
                <span className="text-xs text-gray-400">{c.frecuencia}</span>
              </div>
              <div className="font-bold mt-2">{c.name}</div>
              <div className="text-xs text-gray-500 mt-1 line-clamp-2">{c.description}</div>
              <div className="text-xs text-gray-400 mt-2">{c.executionCount ?? 0} ejecuciones · {c.enrollmentCount ?? 0} inscritos</div>
            </button>
          ))}
        </div>
      )}

      {showWizard && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-auto p-6">
            <h3 className="font-bold text-lg">Nueva campaña de contenido {step + 1}/5</h3>
            <div className="text-xs text-gray-500 mt-1">{['Datos', 'Audiencia', 'Flujo', 'Contenido', 'Revisión'][step]}</div>
            {step === 0 && (
              <div className="grid gap-3 mt-4">
                <input className="border rounded-xl px-3 py-2 text-sm" placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <textarea className="border rounded-xl px-3 py-2 text-sm" placeholder="Descripción" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                <textarea className="border rounded-xl px-3 py-2 text-sm" placeholder="Objetivo" value={form.objetivo} onChange={(e) => setForm({ ...form, objetivo: e.target.value })} />
                <label className="text-xs font-bold">Campaña / formulario Rotary en Acción</label>
                <select className="border rounded-xl px-3 py-2 text-sm" value={form.contributionCampaignId} onChange={(e) => setForm({ ...form, contributionCampaignId: e.target.value })}>
                  <option value="">Seleccionar…</option>
                  {(Array.isArray(contrib) ? contrib : []).map((c: any) => <option key={c.id} value={c.id}>{c.name || c.slug || c.id}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs">Inicio<input type="datetime-local" className="border rounded-xl px-3 py-2 text-sm w-full" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} /></label>
                  <label className="text-xs">Fin (opcional)<input type="datetime-local" className="border rounded-xl px-3 py-2 text-sm w-full" value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} /></label>
                  <label className="text-xs">Zona horaria<input className="border rounded-xl px-3 py-2 text-sm w-full" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} /></label>
                  <label className="text-xs">Frecuencia<select className="border rounded-xl px-3 py-2 text-sm w-full" value={form.frecuencia} onChange={(e) => setForm({ ...form, frecuencia: e.target.value })}>{FREQUENCIES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
                </div>
                <label className="text-xs">Canales</label>
                <div className="flex gap-2 text-sm">
                  {['whatsapp', 'email', 'ambos'].map((c) => (
                    <label key={c} className="flex items-center gap-1 border rounded-xl px-3 py-2"><input type="checkbox" checked={form.canales.includes(c)} onChange={() => setForm({ ...form, canales: form.canales.includes(c) ? form.canales.filter((x: string) => x !== c) : [...form.canales, c] })} />{c}</label>
                  ))}
                </div>
                <div className="bg-gray-50 border rounded-2xl p-3">
                  <div className="text-xs font-bold">Asistente IA (revisa antes de activar)</div>
                  <div className="flex gap-2 mt-2">
                    <input className="border rounded-xl px-3 py-2 text-sm flex-1" placeholder="Ej: campaña mensual Distrito 4281 historias de servicio, WhatsApp primero…" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} />
                    <button onClick={askAi} className="px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold">Proponer</button>
                  </div>
                  {aiDraft && <pre className="text-[11px] mt-2 whitespace-pre-wrap">{JSON.stringify(aiDraft, null, 2).slice(0, 1500)}</pre>}
                </div>
              </div>
            )}
            {step === 1 && (
              <div className="mt-4 space-y-2">
                <div className="text-xs text-gray-500">Segmenta con el Directorio CRM. No se duplican contactos.</div>
                {(form.audienceDef.rules || []).map((r: any, i: number) => (
                  <div key={i} className="flex gap-2">
                    <select className="border rounded-xl px-2 py-2 text-sm" value={r.field} onChange={(e) => { const rules = [...form.audienceDef.rules]; rules[i] = { ...rules[i], field: e.target.value }; setForm({ ...form, audienceDef: { ...form.audienceDef, rules } }); }}>
                      {AUDIENCE_FIELDS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                    <select className="border rounded-xl px-2 py-2 text-sm" value={r.op} onChange={(e) => { const rules = [...form.audienceDef.rules]; rules[i] = { ...rules[i], op: e.target.value }; setForm({ ...form, audienceDef: { ...form.audienceDef, rules } }); }}>
                      <option value="eq">=</option><option value="neq">≠</option>
                    </select>
                    <input className="border rounded-xl px-2 py-2 text-sm flex-1" value={r.value} onChange={(e) => { const rules = [...form.audienceDef.rules]; rules[i] = { ...rules[i], value: e.target.value }; setForm({ ...form, audienceDef: { ...form.audienceDef, rules } }); }} />
                    <button className="text-xs text-red-600" onClick={() => { const rules = form.audienceDef.rules.filter((_: any, j: number) => j !== i); setForm({ ...form, audienceDef: { ...form.audienceDef, rules } }); }}>Quitar</button>
                  </div>
                ))}
                <button onClick={addRule} className="text-xs font-bold text-emerald-700">+ Agregar criterio</button>
              </div>
            )}
            {step === 2 && (
              <div className="mt-4 space-y-2">
                <div className="text-xs text-gray-500">Constructor de flujos: canal, espera, condición y siguiente paso. Tiempos configurables.</div>
                {form.flowDef.map((n: any, i: number) => (
                  <div key={i} className="border rounded-xl p-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <label>Día<input type="number" className="border rounded px-2 py-1 w-full" value={n.dayOffset} onChange={(e) => { const f = [...form.flowDef]; f[i] = { ...f[i], dayOffset: Number(e.target.value) }; setForm({ ...form, flowDef: f }); }} /></label>
                    <label>Paso<input className="border rounded px-2 py-1 w-full" value={n.key} onChange={(e) => { const f = [...form.flowDef]; f[i] = { ...f[i], key: e.target.value }; setForm({ ...form, flowDef: f }); }} /></label>
                    <label>Canal<select className="border rounded px-2 py-1 w-full" value={n.channel} onChange={(e) => { const f = [...form.flowDef]; f[i] = { ...f[i], channel: e.target.value }; setForm({ ...form, flowDef: f }); }}><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select></label>
                    <label>Condición<select className="border rounded px-2 py-1 w-full" value={n.condition} onChange={(e) => { const f = [...form.flowDef]; f[i] = { ...f[i], condition: e.target.value }; setForm({ ...form, flowDef: f }); }}><option value="siempre">siempre</option><option value="no_solicitud">no_solicitud</option><option value="no_participo">no_participo</option><option value="no_abrio">no_abrio</option><option value="clic_sin_solicitud">clic_sin_solicitud</option><option value="ya_publico">ya_publico</option></select></label>
                    <label className="col-span-2">Plantilla / mensaje (admite {'{{nombre}} {{club}} {{distrito}} {{formulario_url}}'})<input className="border rounded px-2 py-1 w-full" value={n.template || ''} onChange={(e) => { const f = [...form.flowDef]; f[i] = { ...f[i], template: e.target.value }; setForm({ ...form, flowDef: f }); }} /></label>
                    <label>Espera (días)<input type="number" className="border rounded px-2 py-1 w-full" value={n.waitDays} onChange={(e) => { const f = [...form.flowDef]; f[i] = { ...f[i], waitDays: Number(e.target.value) }; setForm({ ...form, flowDef: f }); }} /></label>
                  </div>
                ))}
              </div>
            )}
            {step === 3 && (
              <div className="mt-4 text-xs space-y-2">
                <div>Variables: {'{{nombre}} {{club}} {{distrito}} {{cargo}} {{ultima_participacion}} {{tipo_contenido_frecuente}} {{formulario_url}}'}</div>
                <label className="flex items-center gap-2"><input type="checkbox" checked={form.followRules.stopOnResponse} onChange={(e) => setForm({ ...form, followRules: { ...form.followRules, stopOnResponse: e.target.checked } })} />Detener recordatorios al recibir solicitud</label>
                <label>Máx. intentos<input type="number" className="border rounded px-2 py-1 ml-2 w-20" value={form.followRules.maxAttempts} onChange={(e) => setForm({ ...form, followRules: { ...form.followRules, maxAttempts: Number(e.target.value) } })} /></label>
                <label>Máx. por semana<input type="number" className="border rounded px-2 py-1 ml-2 w-20" value={form.followRules.maxPerWeek} onChange={(e) => setForm({ ...form, followRules: { ...form.followRules, maxPerWeek: Number(e.target.value) } })} /></label>
                <div>Horario permitido: {form.followRules.quietHours.start} – {form.followRules.quietHours.end} (no se envía de noche). Opt-out y listas de exclusión del CRM siempre respetados.</div>
              </div>
            )}
            {step === 4 && (
              <div className="mt-4 text-sm space-y-2">
                <div><b>{form.name}</b> · {form.frecuencia} · {(form.canales || []).join('+')}</div>
                <div className="text-xs text-gray-500">Al activar se crea la ejecución del período (p. ej. Octubre 2026) y se inscribe la audiencia. La IA nunca envía sin tu aprobación.</div>
                {preview && <pre className="text-[11px] bg-gray-50 border rounded-xl p-3 whitespace-pre-wrap">{JSON.stringify(preview, null, 2)}</pre>}
                {!preview && <div className="text-xs text-amber-600">Guarda primero para previsualizar: Audiencia estimada, WhatsApp, Email, Excluidos, Ya participaron, Sin canal.</div>}
              </div>
            )}
            <div className="flex justify-between mt-6">
              <button onClick={() => { setShowWizard(false); }} className="text-sm text-gray-500">Cancelar</button>
              <div className="flex gap-2">
                {step > 0 && <button onClick={() => setStep(step - 1)} className="px-4 py-2 rounded-xl border text-sm">Atrás</button>}
                {step < 4 && <button onClick={() => { if (step === 1) doPreview(); setStep(step + 1); }} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold">Siguiente</button>}
                {step === 4 && <button onClick={save} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold">Guardar en borrador</button>}
              </div>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div className="bg-white border rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-lg">{selected.name}</div>
              <div className="text-xs text-gray-500">{STATUS_LABEL[selected.status]} · {selected.frecuencia} · {(selected.canales || []).join('+')}</div>
            </div>
            <div className="flex gap-2 text-xs">
              <button onClick={() => setSelected(null)} className="border rounded-xl px-3 py-2">Cerrar</button>
              {selected.status === 'borrador' && <button onClick={() => transition('programada')} className="border rounded-xl px-3 py-2 font-bold">Programar</button>}
              {selected.status === 'programada' && <button onClick={() => transition('activa')} className="bg-emerald-600 text-white rounded-xl px-3 py-2 font-bold">Activar</button>}
              {selected.status === 'activa' && <button onClick={() => transition('pausada')} className="border rounded-xl px-3 py-2 font-bold">Pausar</button>}
              {selected.status === 'pausada' && <button onClick={() => transition('activa')} className="bg-emerald-600 text-white rounded-xl px-3 py-2 font-bold">Reanudar</button>}
              {(selected.status === 'activa' || selected.status === 'pausada') && <button onClick={() => transition('finalizada')} className="border rounded-xl px-3 py-2">Finalizar</button>}
            </div>
          </div>
          <div className="flex gap-2 mt-4 text-xs">
            {(['flujo', 'tablero', 'tracker', 'analitica', 'insights'] as const).map((t) => (
              <button key={t} onClick={() => setDetailTab(t)} className={`px-3 py-2 rounded-xl border ${detailTab === t ? 'bg-gray-900 text-white' : ''}`}>{t}</button>
            ))}
            <select className="border rounded-xl px-2 py-2 ml-auto" value={activeExec} onChange={(e) => { setActiveExec(e.target.value); if (selected) loadExecData(selected.id, e.target.value); }}>
              {executions.map((x: any) => <option key={x.id} value={x.id}>{x.periodoLabel}</option>)}
            </select>
          </div>

          {detailTab === 'flujo' && (
            <div className="mt-4 grid md:grid-cols-3 gap-2 text-xs">
              {(selected.flowDef || []).map((n: any, i: number) => (
                <div key={i} className="border rounded-xl p-3">
                  <div className="font-bold">Día {n.dayOffset} · {n.key}</div>
                  <div>Canal: {n.channel} · Condición: {n.condition}</div>
                  <div>Espera: {n.waitDays}d · Espera evento: {n.expect}</div>
                </div>
              ))}
              {(!selected.flowDef || !selected.flowDef.length) && <div className="text-gray-500">Sin flujo definido.</div>}
            </div>
          )}
          {detailTab === 'tablero' && (
            <div className="mt-4">
              {enrollments.length === 0 ? <div className="text-xs text-gray-500">Todavía no hay inscripciones en esta ejecución.</div> : (
                <div className="overflow-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-left text-gray-400"><th>Club/Contacto</th><th>Estado</th><th>Canal</th><th>Intentos</th><th>Última</th><th>Acciones</th></tr></thead>
                    <tbody>
                      {enrollments.map((e: any) => (
                        <tr key={e.id} className="border-t">
                          <td className="py-2">{e.contactSnapshot?.name || e.contactId}<div className="text-gray-400">{e.siteId}</div></td>
                          <td>{e.status}</td><td>{e.channel}</td><td>{e.attempts}</td>
                          <td>{e.lastInteractionAt ? new Date(e.lastInteractionAt).toLocaleString('es-CO') : '—'}</td>
                          <td className="flex gap-1">
                            <button className="border rounded px-2 py-1" onClick={async () => { await fetch(`${API}/content-activation/enrollments/${e.id}/pause`, { method: 'POST', headers: H }); if (selected && activeExec) loadExecData(selected.id, activeExec); }}>Pausar</button>
                            <button className="border rounded px-2 py-1" onClick={async () => { await fetch(`${API}/content-activation/enrollments/${e.id}/retry`, { method: 'POST', headers: H }); if (selected && activeExec) loadExecData(selected.id, activeExec); }}>Reintentar</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {detailTab === 'tracker' && (
            <div className="mt-4 space-y-1 text-xs">
              {events.length === 0 ? <div className="text-gray-500">Sin eventos todavía. Cada envío, entrega, lectura, clic, solicitud, generación, aprobación y publicación quedará aquí con fecha y origen.</div> : events.map((ev: any) => (
                <div key={ev.id} className="border-b py-1 flex gap-2"><span className="text-gray-400">{new Date(ev.createdAt).toLocaleString('es-CO')}</span><b>{ev.type}</b><span className="text-gray-500">{ev.channel || ''}</span></div>
              ))}
            </div>
          )}
          {detailTab === 'analitica' && (
            <div className="mt-4 text-sm">
              {!kpis ? <div className="text-xs text-gray-500">Sin datos aún.</div> : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  {Object.entries(kpis).map(([k, v]) => <div key={k} className="border rounded-xl p-3"><div className="text-gray-400">{k}</div><div className="font-bold text-lg">{String(v ?? '—')}</div></div>)}
                </div>
              )}
              <div className="text-[11px] text-gray-400 mt-2">Tasa participación = clubes únicos con solicitud / contactados. Conversión = válidas / contactados. Publicación = publicadas / válidas. Solo datos atribuibles reales.</div>
            </div>
          )}
          {detailTab === 'insights' && (
            <div className="mt-4 text-xs space-y-2">
              {!insights ? <div className="text-gray-500">Sin insights aún.</div> : (
                <>
                  {(insights.insights || []).map((i: any, j: number) => <div key={j} className="border rounded-xl p-3">💡 {i.text}</div>)}
                  {(insights.suggestions || []).map((s: any, j: number) => <div key={`s${j}`} className="bg-amber-50 border border-amber-200 rounded-xl p-3">→ {s.action}: {s.detail}</div>)}
                </>
              )}
              <div className="text-[11px] text-gray-400">Solo afirmaciones calculadas desde datos reales. Nivel por club: {Object.values(LEVEL_LABEL).join(' · ')}.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
