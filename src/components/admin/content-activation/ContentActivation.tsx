import { useEffect, useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { toast } from 'sonner';
import { STATUS_LABEL, FREQUENCIES, LEVEL_LABEL, SCOPE_TYPES, WIZARD_STEPS } from '../../../lib/contentActivationSpec';

const API = import.meta.env.VITE_API_URL || '/api';

type Campaign = any;
type Execution = any;

const emptyForm = {
  name: '', description: '', objetivo: '', contributionCampaignId: '',
  startAt: '', endAt: '', timezone: 'America/Bogota', frecuencia: 'mensual',
  canales: ['email'],
  scopeDef: { type: 'district', ids: [] as string[] },
  audienceMode: 'dynamic',
  excludedContactIds: [] as string[],
  manualRecipients: [] as any[],
  savedSegmentId: '',
  contentDef: { template: '', ctaUrl: '' },
  audienceDef: { match: 'all', rules: [] as any[], sources: ['crm_contacts', 'club_roles'] as string[] },
  flowDef: [
    { dayOffset: 0, key: 'invitacion', channel: 'email', template: '', condition: 'siempre', waitDays: 0, action: 'enviar', expect: 'clic' },
    { dayOffset: 7, key: 'recordatorio', channel: 'email', template: '', condition: 'no_solicitud', waitDays: 7, action: 'enviar', expect: 'solicitud' },
    { dayOffset: 14, key: 'segundo_recordatorio', channel: 'email', template: '', condition: 'no_solicitud', waitDays: 7, action: 'enviar', expect: 'solicitud' },
    { dayOffset: 21, key: 'ultimo_llamado', channel: 'email', template: '', condition: 'no_solicitud', waitDays: 7, action: 'enviar', expect: 'solicitud' },
  ],
  followRules: { stopOnResponse: true, maxAttempts: 5, quietHours: { start: '20:00', end: '08:00' }, maxPerWeek: 3, respectOptOut: true, altChannel: true },
};

const ROLE_OPTIONS = [
  { id: 'president', label: 'Presidentes' },
  { id: 'secretary', label: 'Secretarios' },
  { id: 'treasurer', label: 'Tesoreros' },
  { id: 'technology', label: 'Tecnología' },
  { id: 'public_image', label: 'Imagen pública' },
  { id: 'communications', label: 'Comunicaciones' },
  { id: 'platform_admin', label: 'Admins. plataforma' },
];

const SOURCE_OPTIONS = [
  { id: 'crm_contacts', label: 'Contactos CRM' },
  { id: 'site_admins', label: 'Admins. de sitios' },
  { id: 'district_admins', label: 'Admins. de distritos' },
  { id: 'club_admins', label: 'Admins. de clubes' },
  { id: 'club_roles', label: 'Presidentes / Secretarios / Roles' },
  { id: 'leads', label: 'Leads' },
  { id: 'crm_lists', label: 'Listas CRM' },
  { id: 'event_contacts', label: 'Contactos de eventos' },
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
  const [contacts, setContacts] = useState<any[]>([]);
  const [scopeItems, setScopeItems] = useState<any[]>([]);
  const [scopeSearch, setScopeSearch] = useState('');
  const [crmLists, setCrmLists] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<Campaign | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [manual, setManual] = useState({ name: '', email: '', phone: '', organization: '' });
  const [segmentName, setSegmentName] = useState('');
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
      const s3 = await fetch(`${API}/content-activation/catalog/audience-sources`, { headers: H }).catch(() => null);
      if (s3?.ok) { const j = await s3.json(); setCrmLists(j.lists || []); }
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const loadScopeItems = async (type: string, search: string) => {
    try {
      const r = await fetch(`${API}/content-activation/catalog/scopes?type=${type}&search=${encodeURIComponent(search)}`, { headers: H });
      const d = await r.json();
      setScopeItems(d.items || []);
    } catch { setScopeItems([]); }
  };
  useEffect(() => {
    if (showWizard && step === 1) loadScopeItems(form.scopeDef.type, scopeSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showWizard, step, form.scopeDef.type]);

  const toggleId = (id: string) => {
    const ids = form.scopeDef.ids || [];
    const next = ids.includes(id) ? ids.filter((x: string) => x !== id) : [...ids, id];
    setForm({ ...form, scopeDef: { ...form.scopeDef, ids: next } });
  };

  const toggleRole = (roleId: string) => {
    const rules = [...(form.audienceDef.rules || [])];
    const idx = rules.findIndex((r) => r.field === 'role');
    const cur: string[] = idx >= 0 ? (Array.isArray(rules[idx].value) ? rules[idx].value : [rules[idx].value]) : [];
    const next = cur.includes(roleId) ? cur.filter((x) => x !== roleId) : [...cur, roleId];
    if (idx >= 0) rules[idx] = { ...rules[idx], value: next };
    else rules.push({ field: 'role', op: 'in', value: [roleId] });
    const cleaned = rules.filter((r) => !(r.field === 'role' && (!r.value || !r.value.length)));
    setForm({ ...form, audienceDef: { ...form.audienceDef, rules: cleaned } });
  };

  const activeRoles = (): string[] => {
    const r = (form.audienceDef.rules || []).find((x: any) => x.field === 'role');
    if (!r) return [];
    return Array.isArray(r.value) ? r.value : [r.value];
  };

  const toggleSource = (sid: string) => {
    const cur: string[] = form.audienceDef.sources || [];
    const next = cur.includes(sid) ? cur.filter((x) => x !== sid) : [...cur, sid];
    setForm({ ...form, audienceDef: { ...form.audienceDef, sources: next } });
  };

  const toggleList = (lid: string) => {
    const rules = [...(form.audienceDef.rules || [])];
    const idx = rules.findIndex((r) => r.field === 'listId');
    const cur: string[] = idx >= 0 ? (Array.isArray(rules[idx].value) ? rules[idx].value : [rules[idx].value]) : [];
    const next = cur.includes(lid) ? cur.filter((x) => x !== lid) : [...cur, lid];
    if (idx >= 0) rules[idx] = { ...rules[idx], value: next };
    else rules.push({ field: 'listId', op: 'in', value: [lid] });
    const cleaned = rules.filter((r) => !(r.field === 'listId' && (!r.value || !r.value.length)));
    setForm({ ...form, audienceDef: { ...form.audienceDef, rules: cleaned } });
  };

  const doPreview = async () => {
    try {
      const body = {
        audienceDef: form.audienceDef,
        scopeDef: form.scopeDef,
        excludedContactIds: form.excludedContactIds,
        manualRecipients: form.manualRecipients,
      };
      const url = created?.id
        ? `${API}/content-activation/${created.id}/preview`
        : `${API}/content-activation/preview`;
      const r = await fetch(url, {
        method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo previsualizar');
      setPreview(d.preview || d);
      setContacts(d.contactos || d.contacts || []);
    } catch (e: any) { toast.error(e.message); }
  };

  const saveDraft = async (): Promise<Campaign | null> => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        audienceDef: { ...form.audienceDef, scopeDef: form.scopeDef, manualRecipients: form.manualRecipients },
      };
      let campaign: Campaign | null = created;
      if (campaign?.id) {
        const r = await fetch(`${API}/content-activation/${campaign.id}`, {
          method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Error');
        campaign = d.campaign;
      } else {
        const r = await fetch(`${API}/content-activation`, {
          method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Error');
        campaign = d.campaign;
      }
      setCreated(campaign);
      toast.success('Borrador guardado.');
      load();
      return campaign;
    } catch (e: any) { toast.error(e.message); return null; }
    finally { setSaving(false); }
  };

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

  const transition = async (to: string, campaign?: Campaign | null) => {
    const target = campaign || selected;
    if (!target) return;
    if (to === 'activa' && !confirm('¿Activar la campaña? Se empezará a contactar según el flujo.')) return;
    try {
      const r = await fetch(`${API}/content-activation/${target.id}/status`, {
        method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: to }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success(`Estado: ${to}`);
      if (!campaign) { openDetail(d.campaign); }
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const sendTest = async () => {
    let campaign = created;
    if (!campaign) campaign = await saveDraft();
    if (!campaign) return;
    if (!testEmail.includes('@')) { toast.error('Indica un correo de prueba.'); return; }
    try {
      const r = await fetch(`${API}/content-activation/${campaign.id}/send-test`, {
        method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail, channel: form.canales.includes('whatsapp') && !form.canales.includes('email') ? 'whatsapp' : 'email' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success('Prueba enviada.');
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

  if (loading) return <div className="p-8 text-sm text-gray-500">Cargando campañas de contenido…</div>;

  const scopeLabel = (form.scopeDef?.type ? (SCOPE_TYPES.find((s) => s.id === form.scopeDef.type)?.label || form.scopeDef.type) : '—');
  const scopeNames = scopeItems.filter((i) => (form.scopeDef.ids || []).includes(i.id)).map((i) => i.name);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Campañas de Contenido</h2>
          <p className="text-sm text-gray-500">Campaña → Ámbito → Audiencia → Destinatarios → Canal → Automatización.</p>
        </div>
        <button onClick={() => { setShowWizard(true); setStep(0); setForm(emptyForm); setCreated(null); setPreview(null); setContacts([]); }} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold">+ Nueva campaña</button>
      </div>

      {list.length === 0 ? (
        <div className="bg-white border rounded-2xl p-8 text-center text-sm text-gray-500">Todavía no hay campañas de contenido. Crea la primera (p. ej. “Rotary en Acción”).</div>
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
              <div className="text-xs text-gray-400 mt-2">{c.scopeDef?.type || '—'} · {c.audienceMode === 'fixed' ? 'fija' : 'dinámica'} · {c.executionCount ?? 0} ejecuciones</div>
            </button>
          ))}
        </div>
      )}

      {showWizard && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-auto p-6">
            <h3 className="font-bold text-lg">Nueva campaña de contenido {step + 1}/5</h3>
            <div className="text-xs text-gray-500 mt-1">{WIZARD_STEPS[step]}</div>
            <div className="flex gap-1 mt-3">
              {WIZARD_STEPS.map((s, i) => (
                <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-emerald-600' : 'bg-gray-200'}`} title={s} />
              ))}
            </div>

            {step === 0 && (
              <div className="grid gap-3 mt-4">
                <div className="text-xs font-bold text-gray-500">PASO 1 — CONFIGURACIÓN GENERAL</div>
                <input className="border rounded-xl px-3 py-2 text-sm" placeholder="Nombre (ej. Rotary en Acción)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <textarea className="border rounded-xl px-3 py-2 text-sm" placeholder="Descripción" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                <textarea className="border rounded-xl px-3 py-2 text-sm" placeholder="Objetivo" value={form.objetivo} onChange={(e) => setForm({ ...form, objetivo: e.target.value })} />
                <label className="text-xs font-bold">Campaña / formulario relacionado</label>
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
                    <input className="border rounded-xl px-3 py-2 text-sm flex-1" placeholder="Ej: campaña mensual Distrito 4281 historias de servicio, Email primero…" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} />
                    <button onClick={askAi} className="px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold">Proponer</button>
                  </div>
                  {aiDraft && <pre className="text-[11px] mt-2 whitespace-pre-wrap">{JSON.stringify(aiDraft, null, 2).slice(0, 1500)}</pre>}
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="mt-4 space-y-4">
                <div className="text-xs font-bold text-gray-500">PASO 2 — ¿DÓNDE APLICA ESTA CAMPAÑA? (ÁMBITO) + ¿A QUIÉN QUEREMOS LLEGAR? (AUDIENCIA)</div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold">Tipo de ámbito</label>
                    <select className="border rounded-xl px-3 py-2 text-sm w-full" value={form.scopeDef.type} onChange={(e) => setForm({ ...form, scopeDef: { type: e.target.value, ids: [] } })}>
                      {SCOPE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                    <input className="border rounded-xl px-3 py-2 text-sm w-full" placeholder="Buscar…" value={scopeSearch} onChange={(e) => { setScopeSearch(e.target.value); loadScopeItems(form.scopeDef.type, e.target.value); }} />
                    <div className="border rounded-xl max-h-56 overflow-auto divide-y text-sm">
                      {scopeItems.length === 0 && <div className="p-3 text-xs text-gray-400">Sin resultados. Si eres admin de distrito/club solo verás tus entidades permitidas.</div>}
                      {scopeItems.map((it) => (
                        <label key={it.id} className="flex items-center gap-2 p-2">
                          <input type="checkbox" checked={(form.scopeDef.ids || []).includes(it.id)} onChange={() => toggleId(it.id)} />
                          <span><b>{it.name}</b>{it.detail && <span className="text-gray-400 text-xs"> · {it.detail}</span>}</span>
                        </label>
                      ))}
                    </div>
                    <div className="text-xs text-gray-500">Seleccionados: {(form.scopeDef.ids || []).length} — el servidor valida tus permisos.</div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs font-bold mb-1">Roles / cargos (ámbito + criterio, sin mezclar)</div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {ROLE_OPTIONS.map((r) => (
                          <label key={r.id} className={`border rounded-xl px-2 py-1 cursor-pointer ${activeRoles().includes(r.id) ? 'bg-emerald-100 border-emerald-400' : ''}`}>
                            <input type="checkbox" className="mr-1" checked={activeRoles().includes(r.id)} onChange={() => toggleRole(r.id)} />{r.label}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-bold mb-1">Fuentes (infraestructura existente)</div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {SOURCE_OPTIONS.map((s) => (
                          <label key={s.id} className={`border rounded-xl px-2 py-1 cursor-pointer ${(form.audienceDef.sources || []).includes(s.id) ? 'bg-blue-50 border-blue-300' : ''}`}>
                            <input type="checkbox" className="mr-1" checked={(form.audienceDef.sources || []).includes(s.id)} onChange={() => toggleSource(s.id)} />{s.label}
                          </label>
                        ))}
                      </div>
                    </div>
                    {crmLists.length > 0 && (
                      <div>
                        <div className="text-xs font-bold mb-1">Listas de Comunicaciones CRM</div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          {crmLists.slice(0, 20).map((l: any) => {
                            const active = ((form.audienceDef.rules || []).find((r: any) => r.field === 'listId')?.value || []).includes(l.id);
                            return (
                              <label key={l.id} className={`border rounded-xl px-2 py-1 cursor-pointer ${active ? 'bg-violet-100 border-violet-400' : ''}`}>
                                <input type="checkbox" className="mr-1" checked={active} onChange={() => toggleList(l.id)} />{l.name}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <label className="text-xs flex items-center gap-2">Estado del contacto
                      <select className="border rounded-xl px-2 py-1" value={(form.audienceDef.rules || []).find((r: any) => r.field === 'status')?.value || ''} onChange={(e) => {
                        const rules = (form.audienceDef.rules || []).filter((r: any) => r.field !== 'status');
                        if (e.target.value) rules.push({ field: 'status', op: 'eq', value: e.target.value });
                        setForm({ ...form, audienceDef: { ...form.audienceDef, rules } });
                      }}>
                        <option value="">Todos (activos por defecto)</option>
                        <option value="active">Activos</option>
                        <option value="subscribed">Suscritos</option>
                      </select>
                    </label>
                    <div className="text-[11px] text-gray-400">Ej. Distrito = 4281 · Rol = Presidente OR Secretario · Estado = Activo → audiencia dinámica. El nicho (distrito) no se mezcla con los destinatarios (personas).</div>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="mt-4 space-y-3">
                <div className="text-xs font-bold text-gray-500">PASO 3 — DESTINATARIOS REALES (PREVISUALIZACIÓN)</div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <button onClick={doPreview} className="px-3 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold">Actualizar audiencia</button>
                  <label className="text-xs flex items-center gap-1 border rounded-xl px-2 py-2">
                    Audiencia
                    <select value={form.audienceMode} onChange={(e) => setForm({ ...form, audienceMode: e.target.value })} className="text-xs">
                      <option value="dynamic">Dinámica (se recalcula cada envío)</option>
                      <option value="fixed">Fija (foto actual)</option>
                    </select>
                  </label>
                  {preview && <span className="text-xs font-bold">Audiencia estimada: {preview.audienciaEstimada ?? preview.estimada} destinatarios · {preview.clubesAlcanzados ?? ''} {preview.clubesAlcanzados != null ? 'clubes' : ''}</span>}
                </div>
                {preview && (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                    <div className="border rounded-xl p-2">WhatsApp: <b>{preview.whatsapp}</b></div>
                    <div className="border rounded-xl p-2">Email: <b>{preview.email}</b></div>
                    <div className="border rounded-xl p-2">Excluidos: <b>{preview.excluidos}</b></div>
                    <div className="border rounded-xl p-2">Ya participaron: <b>{preview.yaParticiparon}</b></div>
                    <div className="border rounded-xl p-2">Sin canal: <b>{preview.sinCanal}</b></div>
                  </div>
                )}
                <div className="border rounded-xl overflow-auto max-h-72">
                  <table className="w-full text-xs">
                    <thead><tr className="text-left text-gray-400 bg-gray-50"><th className="p-2">Nombre</th><th className="p-2">Email</th><th className="p-2">Organización</th><th className="p-2">Distrito</th><th className="p-2">Club</th><th className="p-2">Rol</th><th className="p-2">Fuente</th><th className="p-2"></th></tr></thead>
                    <tbody>
                      {contacts.map((c: any) => (
                        <tr key={c.contactId} className="border-t">
                          <td className="p-2">{c.name}</td><td className="p-2">{c.email}</td>
                          <td className="p-2">{c.organizacion || c.club}</td><td className="p-2">{c.distrito}</td>
                          <td className="p-2">{c.club}</td><td className="p-2">{c.rol}</td><td className="p-2">{c.fuente}</td>
                          <td className="p-2"><button className="text-red-600" onClick={() => setForm({ ...form, excludedContactIds: [...form.excludedContactIds, String(c.contactId)] })}>Excluir</button></td>
                        </tr>
                      ))}
                      {contacts.length === 0 && <tr><td colSpan={8} className="p-3 text-gray-400">Pulsa “Actualizar audiencia” para resolver ámbito + criterios. Se eliminan duplicados por email/contacto.</td></tr>}
                    </tbody>
                  </table>
                </div>
                {form.excludedContactIds.length > 0 && <div className="text-xs text-gray-500">Excluidos: {form.excludedContactIds.length} <button className="text-blue-600 ml-2" onClick={() => setForm({ ...form, excludedContactIds: [] })}>Limpiar</button></div>}
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="border rounded-xl p-3 space-y-2">
                    <div className="text-xs font-bold">Agregar destinatario manual</div>
                    <input className="border rounded px-2 py-1 text-xs w-full" placeholder="Nombre" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} />
                    <input className="border rounded px-2 py-1 text-xs w-full" placeholder="Email" value={manual.email} onChange={(e) => setManual({ ...manual, email: e.target.value })} />
                    <input className="border rounded px-2 py-1 text-xs w-full" placeholder="Organización / Club" value={manual.organization} onChange={(e) => setManual({ ...manual, organization: e.target.value })} />
                    <button className="text-xs font-bold text-emerald-700" onClick={() => {
                      if (!manual.email.includes('@')) { toast.error('Email inválido'); return; }
                      setForm({ ...form, manualRecipients: [...form.manualRecipients, { ...manual }] });
                      setManual({ name: '', email: '', phone: '', organization: '' });
                    }}>+ Agregar</button>
                    {form.manualRecipients.length > 0 && <div className="text-xs text-gray-500">Manuales: {form.manualRecipients.length}</div>}
                  </div>
                  <div className="border rounded-xl p-3 space-y-2">
                    <div className="text-xs font-bold">Guardar como segmento</div>
                    <input className="border rounded px-2 py-1 text-xs w-full" placeholder="Nombre del segmento" value={segmentName} onChange={(e) => setSegmentName(e.target.value)} />
                    <button className="text-xs font-bold text-blue-700" onClick={async () => {
                      let campaign = created;
                      if (!campaign) campaign = await saveDraft();
                      if (!campaign) return;
                      const r = await fetch(`${API}/content-activation/${campaign.id}/save-segment`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: segmentName }) });
                      const d = await r.json();
                      if (r.ok) { toast.success('Segmento guardado.'); setSegmentName(''); }
                      else toast.error(d.error || 'Error');
                    }}>Guardar segmento</button>
                    <div className="text-[11px] text-gray-400">Dinámica: si el próximo mes cambia el presidente, el nuevo recibe el siguiente envío. Fija: se congela la foto actual.</div>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="mt-4 space-y-3">
                <div className="text-xs font-bold text-gray-500">PASO 4 — CONTENIDO Y AUTOMATIZACIÓN</div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-xs font-bold">Canal</label>
                    <div className="flex gap-2 text-sm">
                      {['whatsapp', 'email', 'ambos'].map((c) => (
                        <label key={c} className="flex items-center gap-1 border rounded-xl px-3 py-2 text-xs"><input type="checkbox" checked={form.canales.includes(c)} onChange={() => setForm({ ...form, canales: form.canales.includes(c) ? form.canales.filter((x: string) => x !== c) : [...form.canales, c] })} />{c}</label>
                      ))}
                    </div>
                    <label className="text-xs font-bold">Plantilla / contenido (admite {'{{nombre}} {{club}} {{distrito}} {{formulario_url}}'})</label>
                    <textarea className="border rounded-xl px-3 py-2 text-sm w-full" rows={4} placeholder="Hola {{nombre}}, ..." value={form.contentDef.template} onChange={(e) => setForm({ ...form, contentDef: { ...form.contentDef, template: e.target.value } })} />
                    <label className="text-xs">CTA — URL del formulario público del ámbito
                      <input className="border rounded-xl px-3 py-2 text-sm w-full" placeholder="Se genera automáticamente (/rotary-en-accion?ca_token=…)" value={form.contentDef.ctaUrl} onChange={(e) => setForm({ ...form, contentDef: { ...form.contentDef, ctaUrl: e.target.value } })} />
                    </label>
                    <div className="text-[11px] text-gray-400">El CTA lleva al formulario público del ámbito seleccionado, con token atribuible por destinatario.</div>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="font-bold">Secuencia (modelo preparado para Día 0 → 7 → 14 → 21)</div>
                    {form.flowDef.map((n: any, i: number) => (
                      <div key={i} className="border rounded-xl p-2 grid grid-cols-3 gap-2">
                        <label>Día<input type="number" className="border rounded px-2 py-1 w-full" value={n.dayOffset} onChange={(e) => { const f = [...form.flowDef]; f[i] = { ...f[i], dayOffset: Number(e.target.value) }; setForm({ ...form, flowDef: f }); }} /></label>
                        <label>Canal<select className="border rounded px-2 py-1 w-full" value={n.channel} onChange={(e) => { const f = [...form.flowDef]; f[i] = { ...f[i], channel: e.target.value }; setForm({ ...form, flowDef: f }); }}><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select></label>
                        <label>Condición<select className="border rounded px-2 py-1 w-full" value={n.condition} onChange={(e) => { const f = [...form.flowDef]; f[i] = { ...f[i], condition: e.target.value }; setForm({ ...form, flowDef: f }); }}><option value="siempre">siempre</option><option value="no_solicitud">no_solicitud</option><option value="no_participo">no_participo</option></select></label>
                      </div>
                    ))}
                    <label className="flex items-center gap-2"><input type="checkbox" checked={form.followRules.stopOnResponse} onChange={(e) => setForm({ ...form, followRules: { ...form.followRules, stopOnResponse: e.target.checked } })} />Detener al recibir solicitud</label>
                    <div className="text-[11px] text-gray-400">Frecuencia: {form.frecuencia} · Zona: {form.timezone}. Cada ejecución (campaign_id, scope, audience, recipient, channel, execution, delivery_status, sent_at) queda trazada.</div>
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="mt-4 text-sm space-y-3">
                <div className="text-xs font-bold text-gray-500">PASO 5 — REVISIÓN Y ACTIVACIÓN</div>
                <div className="border rounded-2xl p-4 text-sm space-y-1 bg-gray-50">
                  <div><b>Campaña:</b> {form.name || '—'}</div>
                  <div><b>Ámbito:</b> {scopeLabel} {scopeNames.length ? `· ${scopeNames.slice(0, 5).join(', ')}${scopeNames.length > 5 ? ` (+${scopeNames.length - 5})` : ''}` : `· ${(form.scopeDef.ids || []).length} seleccionados`}</div>
                  <div><b>Audiencia:</b> {(activeRoles().length ? activeRoles().join(' + ') : 'todos los roles')} · {(form.audienceDef.sources || []).join(', ')} · {form.audienceMode === 'fixed' ? 'fija' : 'dinámica'}</div>
                  <div><b>Clubes alcanzados:</b> {preview?.clubesAlcanzados ?? '—'} · <b>Destinatarios únicos:</b> {preview?.destinatariosUnicos ?? preview?.audienciaEstimada ?? '—'}</div>
                  <div><b>Canal:</b> {(form.canales || []).join(' + ')} · <b>Frecuencia:</b> {form.frecuencia} · <b>Inicio:</b> {form.startAt || '—'}</div>
                  <div><b>Formulario:</b> {(contrib.find((c: any) => c.id === form.contributionCampaignId)?.name) || form.contributionCampaignId || '—'}</div>
                </div>
                {!preview && <div className="text-xs text-amber-600">Pulsa “Actualizar audiencia” en el paso 3 para ver destinatarios antes de activar.</div>}
                <div className="flex flex-wrap gap-2 items-center">
                  <input className="border rounded-xl px-3 py-2 text-sm" placeholder="Correo para prueba" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
                  <button onClick={sendTest} className="px-3 py-2 rounded-xl border text-sm">Enviar prueba</button>
                </div>
              </div>
            )}

            <div className="flex justify-between mt-6">
              <button onClick={() => { setShowWizard(false); }} className="text-sm text-gray-500">Cancelar</button>
              <div className="flex gap-2">
                {step > 0 && <button onClick={() => setStep(step - 1)} className="px-4 py-2 rounded-xl border text-sm">Atrás</button>}
                {step === 2 && <button onClick={async () => { await saveDraft(); }} disabled={saving} className="px-4 py-2 rounded-xl border text-sm">Guardar borrador</button>}
                {step < 4 && <button onClick={async () => { if (step === 1) await doPreview(); if (step === 2 && !created) await saveDraft(); setStep(step + 1); }} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold">Siguiente</button>}
                {step === 4 && (
                  <>
                    <button onClick={saveDraft} disabled={saving} className="px-4 py-2 rounded-xl border text-sm font-bold">Guardar borrador</button>
                    <button onClick={async () => { const c = created || await saveDraft(); if (c) await transition('programada', c); }} className="px-4 py-2 rounded-xl border text-sm font-bold">Programar</button>
                    <button onClick={async () => { const c = created || await saveDraft(); if (c) { await transition('activa', c); setShowWizard(false); } }} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold">Activar campaña</button>
                  </>
                )}
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
              <div className="text-xs text-gray-500">{STATUS_LABEL[selected.status]} · {selected.frecuencia} · {(selected.canales || []).join('+')} · ámbito {selected.scopeDef?.type || '—'} · audiencia {selected.audienceMode === 'fixed' ? 'fija' : 'dinámica'}</div>
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
                            <button className="border rounded px-2 py-1 font-bold text-emerald-700" onClick={async () => {
                              const r = await fetch(`${API}/content-activation/enrollments/${e.id}/link`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ utm_source: 'crm', utm_medium: e.channel, utm_campaign: selected?.name || '' }) });
                              const d = await r.json();
                              if (d.url) { await navigator.clipboard.writeText(d.url).catch(() => {}); toast.success('Enlace copiado: Rotary en Acción con attribution'); }
                            }}>Enlace</button>
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
              <div className="text-[11px] text-gray-400 mt-2">Clubes contactados vs. clubes que enviaron contenido: compara clubesAlcanzados con clubesConContenido. Solo datos atribuibles reales.</div>
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
