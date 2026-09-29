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
  senderSiteId: '',
  audienceMode: 'dynamic',
  excludedContactIds: [] as string[],
  manualRecipients: [] as any[],
  savedSegmentId: '',
  contentDef: {
    email: { fromEmail: '', fromName: '', subject: '', preheader: '', bodyText: '', ctaText: 'Compartir una actividad →', ctaUrl: '' },
    whatsapp: { body: '' },
  },
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
  const [contentTab, setContentTab] = useState<'email'|'whatsapp'>('email');
  const [emailPreview, setEmailPreview] = useState<any>(null);
  const [waPreview, setWaPreview] = useState<any>(null);
  const [waOperative, setWaOperative] = useState(true);
  const [waNote, setWaNote] = useState('');
  const [readiness, setReadiness] = useState<any>(null);
  const [previewDevice, setPreviewDevice] = useState<'desktop'|'mobile'>('desktop');
  const [showPreview, setShowPreview] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [senderAuto, setSenderAuto] = useState<any>(null);
  const [senderOptions, setSenderOptions] = useState<any[]>([]);
  const [senderSearch, setSenderSearch] = useState('');
  const [previewAs, setPreviewAs] = useState('');

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

  const loadSenderOptions = async (search = '') => {
    try {
      const r = await fetch(`${API}/content-activation/catalog/sender-options?search=${encodeURIComponent(search)}`, { headers: H });
      const d = await r.json();
      if (d.auto) {
        setSenderAuto(d.auto);
        setForm((f: any) => ({ ...f, senderSiteId: f.senderSiteId || d.auto.ref }));
      } else {
        setSenderAuto(null);
      }
      setSenderOptions(d.options || []);
    } catch { /* noop */ }
  };
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

  const setEmailField = (k: string, v: string) => {
    setForm((f: any) => ({ ...f, contentDef: { ...f.contentDef, email: { ...(f.contentDef?.email || {}), [k]: v } } }));
  };
  const setWaField = (v: string) => {
    setForm((f: any) => ({ ...f, contentDef: { ...f.contentDef, whatsapp: { body: v } } }));
  };

  const wantsEmail = form.canales.includes('email') || form.canales.includes('ambos');
  const wantsWA = form.canales.includes('whatsapp') || form.canales.includes('ambos');

  const loadContent = async (campaignId: string, asContactId = '') => {
    try {
      const qs = new URLSearchParams();
      if (asContactId) qs.set('contactId', asContactId);
      else { if (testEmail) qs.set('testEmail', testEmail); }
      const r = await fetch(`${API}/content-activation/${campaignId}/content?${qs.toString()}`, { headers: H });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      if (d.content) {
        setForm((f: any) => ({
          ...f,
          contentDef: {
            email: { ...(f.contentDef?.email || {}), ...d.content.email },
            whatsapp: { ...(f.contentDef?.whatsapp || {}), ...d.content.whatsapp },
          },
        }));
      }
      setEmailPreview(d.email || null);
      setWaPreview(d.whatsapp || null);
      setWaOperative(d.whatsappOperative !== false);
      setWaNote(d.whatsappNote || '');
    } catch (e: any) { toast.error(e.message); }
  };

  const saveContent = async () => {
    let campaign = created;
    if (!campaign) campaign = await saveDraft();
    if (!campaign) return null;
    try {
      const r = await fetch(`${API}/content-activation/${campaign.id}/content`, {
        method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentDef: form.contentDef }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      setCreated(d.campaign);
      toast.success('Plantilla guardada.');
      await loadContent(d.campaign.id);
      return d.campaign;
    } catch (e: any) { toast.error(e.message); return null; }
  };

  const loadReadiness = async (campaignId?: string) => {
    const id = campaignId || created?.id;
    if (!id) return null;
    try {
      const r = await fetch(`${API}/content-activation/${id}/readiness`, { headers: H });
      const d = await r.json();
      if (r.ok) setReadiness(d);
      return d;
    } catch { return null; }
  };

  const sendTest = async (channel: 'email' | 'whatsapp' = 'email') => {
    let campaign = created;
    if (!campaign) campaign = await saveDraft();
    if (!campaign) return;
    // La plantilla se guarda antes de probar: la prueba refleja lo editado.
    try {
      await fetch(`${API}/content-activation/${campaign.id}/content`, {
        method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentDef: form.contentDef }),
      }).catch(() => null);
    } catch { /* la prueba igual intenta */ }
    if (channel === 'email' && !testEmail.includes('@')) { toast.error('Indica un correo de prueba. Solo esa dirección recibirá el correo.'); return; }
    setSendingTest(true);
    try {
      const r = await fetch(`${API}/content-activation/${campaign.id}/send-test`, {
        method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail, channel }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo enviar la prueba');
      if (channel === 'whatsapp') {
        if (d.message) setWaPreview((w: any) => ({ ...(w || {}), body: d.message, formUrl: d.formUrl }));
        toast.success(d.pendingIntegration ? 'WhatsApp pendiente de integración: plantilla validada, sin envíos reales.' : 'Prueba de WhatsApp validada.');
      } else {
        toast.success(`Prueba enviada solo a ${testEmail}.`);
      }
      await loadContent(campaign.id);
    } catch (e: any) { toast.error(e.message); }
    finally { setSendingTest(false); }
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
        <button onClick={() => { setShowWizard(true); setStep(0); setForm(emptyForm); setCreated(null); setPreview(null); setContacts([]); setPreviewAs(''); setSenderAuto(null); setSenderOptions([]); setSenderSearch(''); loadSenderOptions(''); }} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold">+ Nueva campaña</button>
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
                <div className="border rounded-2xl p-3 space-y-2">
                  <div className="text-xs font-bold">Sitio remitente — la campaña habla como este sitio</div>
                  {senderAuto ? (
                    <div className="text-xs">📍 <b>{senderAuto.name}</b>{senderAuto.host && <span className="text-gray-400"> · {senderAuto.host}</span>} <span className="text-gray-400">(asignado a tu sitio)</span></div>
                  ) : (
                    <>
                      <input className="border rounded-xl px-3 py-2 text-sm w-full" placeholder="Buscar sitio remitente (distrito, club)…" value={senderSearch} onChange={(e) => { setSenderSearch(e.target.value); loadSenderOptions(e.target.value); }} />
                      <div className="border rounded-xl max-h-32 overflow-auto divide-y text-sm">
                        {senderOptions.length === 0 && <div className="p-2 text-xs text-gray-400">Busca el distrito o club remitente. Si queda vacío se deriva del ámbito.</div>}
                        {senderOptions.map((o: any) => (
                          <label key={o.ref} className="flex items-center gap-2 p-2 text-xs cursor-pointer">
                            <input type="radio" name="sender" checked={form.senderSiteId === o.ref} onChange={() => setForm({ ...form, senderSiteId: o.ref })} />
                            <span><b>{o.name}</b>{o.detail && <span className="text-gray-400"> · {o.detail}</span>}</span>
                          </label>
                        ))}
                      </div>
                      {form.senderSiteId && <div className="text-xs text-gray-500">Remitente: <b>{(senderOptions.find((o: any) => o.ref === form.senderSiteId)?.name) || form.senderSiteId}</b> <button className="text-blue-600 ml-1" onClick={() => setForm({ ...form, senderSiteId: '' })}>Quitar (derivar del ámbito)</button></div>}
                    </>
                  )}
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
                <div className="text-xs font-bold text-gray-500">PASO 4 — CONTENIDO Y PLANTILLAS POR CANAL</div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-xs font-bold">Canales</label>
                    <div className="flex gap-2 text-sm">
                      {['email', 'whatsapp', 'ambos'].map((c) => (
                        <label key={c} className="flex items-center gap-1 border rounded-xl px-3 py-2 text-xs"><input type="checkbox" checked={form.canales.includes(c)} onChange={() => {
                          const next = form.canales.includes(c) ? form.canales.filter((x: string) => x !== c) : [...form.canales, c];
                          setForm({ ...form, canales: next });
                          if (next.includes('email') || next.includes('ambos')) setContentTab('email');
                          else setContentTab('whatsapp');
                        }} />{c === 'email' ? 'Correo electrónico' : c === 'whatsapp' ? 'WhatsApp' : 'Ambos'}</label>
                      ))}
                    </div>
                    <label className="text-xs font-bold">Contenido del correo (texto por párrafos — admite {'{{recipient_name}} {{club_name}} {{district_name}} {{campaign_name}} {{form_url}} {{site_name}}'})</label>
                    <textarea className="border rounded-xl px-3 py-2 text-sm w-full" rows={6} placeholder="Hola {{recipient_name}}, ..." value={form.contentDef?.email?.bodyText || ''} onChange={(e) => setEmailField('bodyText', e.target.value)} />
                    <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={form.contentDef?.email?.showShareGrid !== false} onChange={(e) => setForm((f: any) => ({ ...f, contentDef: { ...f.contentDef, email: { ...(f.contentDef?.email || {}), showShareGrid: e.target.checked } } }))} />Mostrar sección visual “¿Qué puedes compartir?”</label>
                    <label className="text-xs">CTA — URL del formulario público del ámbito
                      <input className="border rounded-xl px-3 py-2 text-sm w-full" placeholder="Se genera automáticamente (/rotary-en-accion?ca_token=…)" value={form.contentDef.ctaUrl} onChange={(e) => setForm({ ...form, contentDef: { ...form.contentDef, ctaUrl: e.target.value } })} />
                    </label>
                    <div className="text-[11px] text-gray-400">El CTA lleva al formulario público del ámbito seleccionado, con token atribuible por destinatario.</div>
                    {(wantsEmail && wantsWA) && (
                      <div className="flex gap-2 text-xs pt-1">
                        <button onClick={() => setContentTab('email')} className={`px-3 py-2 rounded-xl border font-bold ${contentTab === 'email' ? 'bg-gray-900 text-white' : ''}`}>✉ Correo electrónico</button>
                        <button onClick={() => setContentTab('whatsapp')} className={`px-3 py-2 rounded-xl border font-bold ${contentTab === 'whatsapp' ? 'bg-gray-900 text-white' : ''}`}>WhatsApp</button>
                      </div>
                    )}
                    {(wantsEmail && (contentTab === 'email' || !wantsWA)) && (
                      <div className="space-y-2 border rounded-2xl p-3">
                        <div className="grid md:grid-cols-2 gap-2">
                          <label className="text-xs">Remitente (email)<input className="border rounded-xl px-3 py-2 text-sm w-full" placeholder="Vacío = remitente de la plataforma" value={form.contentDef?.email?.fromEmail || ''} onChange={(e) => setEmailField('fromEmail', e.target.value)} /></label>
                          <label className="text-xs">Nombre del remitente<input className="border rounded-xl px-3 py-2 text-sm w-full" value={form.contentDef?.email?.fromName || ''} onChange={(e) => setEmailField('fromName', e.target.value)} /></label>
                        </div>
                        <label className="text-xs">Asunto<input className="border rounded-xl px-3 py-2 text-sm w-full font-bold" value={form.contentDef?.email?.subject || ''} onChange={(e) => setEmailField('subject', e.target.value)} /></label>
                        <label className="text-xs">Preheader<input className="border rounded-xl px-3 py-2 text-sm w-full" value={form.contentDef?.email?.preheader || ''} onChange={(e) => setEmailField('preheader', e.target.value)} /></label>
                        <label className="text-xs">Texto del CTA principal<input className="border rounded-xl px-3 py-2 text-sm w-full" value={form.contentDef?.email?.ctaText || ''} onChange={(e) => setEmailField('ctaText', e.target.value)} /></label>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <button onClick={saveContent} className="px-3 py-2 rounded-xl border font-bold">Guardar plantilla</button>
                          <button onClick={async () => { let c = created; if (!c) c = await saveDraft(); if (c) { await loadContent(c.id); setPreviewDevice('desktop'); setShowPreview(true); } }} className="px-3 py-2 rounded-xl border font-bold">Vista previa</button>
                          <input className="border rounded-xl px-3 py-2 text-xs" placeholder="Email de prueba" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
                          <button onClick={() => sendTest('email')} disabled={sendingTest} className="px-3 py-2 rounded-xl bg-blue-600 text-white font-bold">Enviar prueba</button>
                        </div>
                      </div>
                    )}
                    {(wantsWA && (contentTab === 'whatsapp' || !wantsEmail)) && (
                      <div className="space-y-2 border rounded-2xl p-3">
                        <div className="text-xs font-bold">Mensaje de WhatsApp — usa {'{{form_url}}'} para el enlace dinámico</div>
                        {!waOperative && waNote && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2">{waNote}</div>}
                        <textarea className="border rounded-xl px-3 py-2 text-sm w-full" rows={7} value={form.contentDef?.whatsapp?.body || ''} onChange={(e) => setWaField(e.target.value)} />
                        <div className="border rounded-xl p-3 bg-[#e7ffdb] text-xs whitespace-pre-wrap max-w-md">📱 {waPreview?.body || form.contentDef?.whatsapp?.body || '—'}</div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <button onClick={saveContent} className="px-3 py-2 rounded-xl border font-bold">Guardar plantilla</button>
                          <button onClick={async () => { let c = created; if (!c) c = await saveDraft(); if (c) { await loadContent(c.id); setShowPreview(true); } }} className="px-3 py-2 rounded-xl border font-bold">Vista previa</button>
                          <button onClick={() => sendTest('whatsapp')} disabled={sendingTest} className="px-3 py-2 rounded-xl border font-bold">Validar prueba</button>
                        </div>
                        <div className="text-[11px] text-gray-400">WhatsApp no envía mensajes reales desde la prueba: valida mensaje y URL antes de activar.</div>
                      </div>
                    )}
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
                {!preview && <div className="text-xs text-amber-600">Pulsa Actualizar audiencia en el paso 3 para ver destinatarios antes de activar.</div>}
                <div className="border rounded-2xl p-4 space-y-2 bg-white">
                  <div className="text-xs font-bold text-gray-500">COMUNICACIONES — lo que recibirá la audiencia</div>
                  {wantsEmail && (
                    <div className="text-xs border rounded-xl p-2">
                      <div className="font-bold">✉ Correo electrónico {emailPreview?.isDefault !== false && <span className="text-gray-400 font-normal">(plantilla institucional inicial)</span>}</div>
                      <div>Asunto: <b>{emailPreview?.subject || form.contentDef?.email?.subject || '—'}</b></div>
                      <div>Remitente: {emailPreview?.fromName || form.contentDef?.email?.fromName || '—'} {emailPreview?.fromEmail ? `· ${emailPreview.fromEmail}` : '· remitente de la plataforma'}</div>
                      <div>CTA: {form.contentDef?.email?.ctaText || '—'} → {emailPreview?.ctaUrl || emailPreview?.formUrl || '—'}</div>
                      <button onClick={async () => { let c = created; if (!c) c = await saveDraft(); if (c) { await loadContent(c.id); setPreviewDevice('desktop'); setShowPreview(true); } }} className="mt-1 px-3 py-1 rounded-xl border font-bold">Vista previa</button>
                    </div>
                  )}
                  {wantsWA && (
                    <div className="text-xs border rounded-xl p-2">
                      <div className="font-bold">WhatsApp {!waOperative && <span className="text-amber-600 font-normal">· pendiente de integración</span>}</div>
                      <div className="whitespace-pre-wrap bg-[#e7ffdb] rounded-xl p-2 mt-1 max-w-md">{waPreview?.body || form.contentDef?.whatsapp?.body || '—'}</div>
                      <button onClick={async () => { let c = created; if (!c) c = await saveDraft(); if (c) { await loadContent(c.id); setShowPreview(true); } }} className="mt-1 px-3 py-1 rounded-xl border font-bold">Vista previa</button>
                    </div>
                  )}
                </div>
                {readiness && (
                  <div className="border rounded-2xl p-4 text-xs space-y-1">
                    <div className="font-bold text-gray-500">VALIDACIONES ANTES DE ACTIVAR</div>
                    {readiness.items.map((it: any) => (
                      <div key={it.id}>{it.ok ? '✓' : '✗'} <b>{it.label}</b>{!it.ok && <span className="text-amber-600"> — {it.hint}</span>}</div>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 items-center">
                  <input className="border rounded-xl px-3 py-2 text-sm" placeholder="Correo para prueba (solo él lo recibe)" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
                  {wantsEmail && <button onClick={() => sendTest('email')} disabled={sendingTest} className="px-3 py-2 rounded-xl border text-sm font-bold">Enviar prueba ✉</button>}
                  {wantsWA && <button onClick={() => sendTest('whatsapp')} disabled={sendingTest} className="px-3 py-2 rounded-xl border text-sm font-bold">Probar WhatsApp</button>}
                </div>
              </div>
            )}

            <div className="flex justify-between mt-6">
              <button onClick={() => { setShowWizard(false); }} className="text-sm text-gray-500">Cancelar</button>
              <div className="flex gap-2">
                {step > 0 && <button onClick={() => setStep(step - 1)} className="px-4 py-2 rounded-xl border text-sm">Atrás</button>}
                {step === 2 && <button onClick={async () => { await saveDraft(); }} disabled={saving} className="px-4 py-2 rounded-xl border text-sm">Guardar borrador</button>}
                {step < 4 && <button onClick={async () => {
                  if (step === 1) await doPreview();
                  if (step === 2 && !created) await saveDraft();
                  if (step === 3) {
                    const c = created || await saveDraft();
                    if (c) { await saveContent(); await loadContent(c.id); }
                  }
                  if (step === 3) {
                    const c = created || await saveDraft();
                    if (c) await loadReadiness(c.id);
                  }
                  setStep(step + 1);
                }} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold">Siguiente</button>}
                {step === 4 && (
                  <>
                    <button onClick={saveDraft} disabled={saving} className="px-4 py-2 rounded-xl border text-sm font-bold">Guardar borrador</button>
                    <button onClick={async () => { const c = created || await saveDraft(); if (c) await transition('programada', c); }} className="px-4 py-2 rounded-xl border text-sm font-bold">Programar</button>
                    <button onClick={async () => {
                      let c = created || await saveDraft();
                      if (!c) return;
                      const r = await loadReadiness(c.id);
                      if (r && !r.ok) { toast.error(`Falta completar: ${r.items.filter((i: any) => !i.ok).map((i: any) => i.label).join(', ')}`); return; }
                      await transition('activa', c); setShowWizard(false);
                    }} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold">Activar campaña</button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showPreview && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-auto p-5">
            <div className="flex items-center justify-between">
              <div className="font-bold">Vista previa — lo que recibirá la audiencia</div>
              <button onClick={() => setShowPreview(false)} className="border rounded-xl px-3 py-1 text-xs">Cerrar</button>
            </div>
            {(emailPreview?.sender || waPreview?.sender) && (
              <div className="flex items-center gap-2 mt-2 text-xs bg-gray-50 border rounded-xl p-2">
                {(emailPreview?.sender?.logoUrl || waPreview?.sender?.logoUrl) && <img src={emailPreview?.sender?.logoUrl || waPreview?.sender?.logoUrl} alt="" style={{ height: 28, maxWidth: 120 }} />}
                <span>Remitente: <b>{emailPreview?.sender?.siteName || waPreview?.sender?.siteName || '—'}</b></span>
                {(emailPreview?.formUrl || waPreview?.formUrl) && <span className="text-gray-400 break-all">· {(emailPreview?.formUrl || waPreview?.formUrl)}</span>}
              </div>
            )}
            {contacts.length > 0 && (
              <label className="flex items-center gap-2 mt-2 text-xs">Previsualizar como
                <select className="border rounded-xl px-2 py-1 text-xs max-w-xs" value={previewAs} onChange={async (e) => {
                  setPreviewAs(e.target.value);
                  if (created && e.target.value) await loadContent(created.id, e.target.value);
                  else if (created) await loadContent(created.id);
                }}>
                  <option value="">Destinatario simulado</option>
                  {contacts.slice(0, 100).map((c: any) => <option key={c.contactId} value={c.contactId}>{c.name || c.email} · {c.club || c.rol}</option>)}
                </select>
              </label>
            )}
            {((emailPreview?.missing || []).length > 0) && <div className="text-xs text-amber-600 mt-1">Variables sin resolver: {(emailPreview.missing || []).map((m: string) => `{{${m}}}`).join(', ')}</div>}
            {wantsEmail && wantsWA && (
              <div className="flex gap-2 mt-3 text-xs">
                <button onClick={() => setContentTab('email')} className={`px-3 py-1 rounded-xl border font-bold ${contentTab === 'email' ? 'bg-gray-900 text-white' : ''}`}>Correo electrónico</button>
                <button onClick={() => setContentTab('whatsapp')} className={`px-3 py-1 rounded-xl border font-bold ${contentTab === 'whatsapp' ? 'bg-gray-900 text-white' : ''}`}>WhatsApp</button>
              </div>
            )}
            {(contentTab === 'email' || !wantsWA) && emailPreview && (
              <div className="mt-3">
                <div className="flex gap-2 text-xs mb-2">
                  <button onClick={() => setPreviewDevice('desktop')} className={`px-3 py-1 rounded-xl border ${previewDevice === 'desktop' ? 'bg-gray-900 text-white' : ''}`}>Escritorio</button>
                  <button onClick={() => setPreviewDevice('mobile')} className={`px-3 py-1 rounded-xl border ${previewDevice === 'mobile' ? 'bg-gray-900 text-white' : ''}`}>Móvil</button>
                </div>
                <div className="text-xs text-gray-500 mb-1">Asunto: <b>{emailPreview.subject}</b> · De: {emailPreview.fromName}</div>
                <div className={`mx-auto border rounded-xl overflow-hidden ${previewDevice === 'mobile' ? 'max-w-[375px]' : 'w-full'}`}>
                  <iframe title="Vista previa del correo" srcDoc={emailPreview.html} className="w-full bg-white" style={{ height: 520 }} />
                </div>
                <div className="text-[11px] text-gray-400 mt-1">CTA: {emailPreview.ctaText} → {emailPreview.ctaUrl}</div>
              </div>
            )}
            {(contentTab === 'whatsapp' || !wantsEmail) && waPreview && (
              <div className="mt-3 max-w-md mx-auto">
                <div className="border rounded-2xl p-4 bg-[#e7ffdb] text-sm whitespace-pre-wrap">{waPreview.body}</div>
                {!waOperative && waNote && <div className="text-xs text-amber-700 mt-2">{waNote}</div>}
              </div>
            )}
            <div className="flex flex-wrap gap-2 mt-4 items-center">
              <input className="border rounded-xl px-3 py-2 text-sm" placeholder="Email de prueba (solo él lo recibe)" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
              {wantsEmail && <button onClick={() => sendTest('email')} disabled={sendingTest} className="px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold">Enviar prueba ✉</button>}
              {wantsWA && <button onClick={() => sendTest('whatsapp')} disabled={sendingTest} className="px-3 py-2 rounded-xl border text-sm font-bold">Probar WhatsApp</button>}
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
