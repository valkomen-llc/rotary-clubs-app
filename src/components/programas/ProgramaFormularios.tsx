/**
 * Programas — los cuatro formularios públicos (v4.1280.0)
 *
 *   A. Necesito orientación   B. Quiero apoyar
 *   C. Mi club quiere participar   D. Quiero recibir novedades
 *
 * Cada uno manda SÓLO sus campos; el servidor descarta cualquier otro (así
 * ninguna historia clínica ni documento entra por «orientación»). Quien pide
 * orientación o apoyo NO queda suscrito a novedades: la suscripción es un
 * formulario aparte con su propio consentimiento.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useClub } from '../../contexts/ClubContext';
import { leerJson } from '../../lib/leerJson';
import {
    validatePublicRequest, validateSubscriber, DATA_CONSENT_TEXT, NEWSLETTER_CONSENT_TEXT,
    SUPPORT_TYPES, CLUB_PARTICIPATION_TYPES, CONTACT_MEANS, type FieldError,
} from '../../lib/programSpec';

const API = import.meta.env.VITE_API_URL || '/api';
const campo = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-rotary-blue/30 focus:border-rotary-blue';
const rotulo = 'block text-xs font-semibold text-gray-600 mb-1';

interface Props {
    slug: string;
    clubId?: string;
    formsEnabled: Record<string, boolean>;
    newsletterEnabled: boolean;
    districtNumber?: number | null;
    initialTab?: string | null;
}

type Tab = 'orientacion' | 'apoyo' | 'club' | 'novedades';

const TABS: { id: Tab; label: string; short: string }[] = [
    { id: 'orientacion', label: 'Necesito orientación', short: 'Orientación' },
    { id: 'apoyo', label: 'Quiero apoyar', short: 'Apoyar' },
    { id: 'club', label: 'Mi club quiere participar', short: 'Mi club' },
    { id: 'novedades', label: 'Quiero recibir novedades', short: 'Novedades' },
];

const Aviso = ({ errors, field }: { errors: FieldError[]; field: string }) => {
    const e = errors.find(x => x.field === field);
    return e ? <p role="alert" className="text-xs text-rose-600 mt-1">{e.message}</p> : null;
};

const Recibo = ({ refCode, texto }: { refCode: string; texto: string }) => (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900" role="status">
        <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="w-5 h-5" /> Recibimos tu solicitud</div>
        <p className="text-sm mt-1">{texto}</p>
        {refCode ? <p className="text-sm mt-2">Referencia: <span className="font-mono font-semibold">{refCode}</span>. Guárdala para consultar el estado.</p> : null}
    </div>
);

const ProgramaFormularios = ({ slug, clubId, formsEnabled, newsletterEnabled, districtNumber, initialTab }: Props) => {
    const { user } = useAuth();
    const { club } = useClub();
    const visibles = useMemo(() => TABS.filter(t => (t.id === 'novedades' ? newsletterEnabled : formsEnabled[t.id] !== false)), [formsEnabled, newsletterEnabled]);
    const [tab, setTab] = useState<Tab>(() => (visibles.find(t => t.id === initialTab)?.id || visibles[0]?.id || 'orientacion'));
    const [enviando, setEnviando] = useState(false);
    const [errores, setErrores] = useState<FieldError[]>([]);
    const [fallo, setFallo] = useState('');
    const [recibo, setRecibo] = useState<{ ref: string; texto: string } | null>(null);
    const [f, setF] = useState<Record<string, any>>({});

    useEffect(() => { setErrores([]); setFallo(''); setRecibo(null); setF({}); }, [tab]);

    // Con sesión y pertenencia a un club, el formulario C ya viene con esos datos.
    useEffect(() => {
        if (tab !== 'club') return;
        const esClub = user && (club as any)?.type !== 'district' && club?.name;
        setF(prev => ({
            ...prev,
            clubName: prev.clubName ?? (esClub ? club.name : ''),
            districtNumber: prev.districtNumber ?? (districtNumber || ''),
            responsibleName: prev.responsibleName ?? (user?.name || ''),
            email: prev.email ?? (user?.email || ''),
        }));
    }, [tab, user, club, districtNumber]);

    const set = (k: string, v: any) => setF(prev => ({ ...prev, [k]: v }));
    if (!visibles.length) return null;

    const enviar = async (e: FormEvent) => {
        e.preventDefault();
        setFallo('');
        const errs = tab === 'novedades' ? validateSubscriber(f) : validatePublicRequest(tab, f);
        setErrores(errs);
        if (errs.length) return;
        setEnviando(true);
        try {
            const url = tab === 'novedades' ? `${API}/programas/public/${encodeURIComponent(slug)}/novedades` : `${API}/programas/public/${encodeURIComponent(slug)}/solicitud`;
            const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, type: tab, clubId: clubId || undefined }) });
            const { data } = await leerJson<any>(r);
            if (!r.ok) { setErrores(Array.isArray(data?.errors) ? data.errors : []); setFallo(data?.error || `No se pudo enviar (${r.status}).`); return; }
            setRecibo(tab === 'novedades'
                ? { ref: '', texto: 'Quedaste suscrito a las novedades del programa. Puedes retirar tu consentimiento cuando quieras.' }
                : { ref: data?.receipt?.publicRef || '', texto: tab === 'orientacion' ? 'El equipo del programa te contactará por el medio que elegiste para orientarte. Este canal no reemplaza la atención médica.' : 'El equipo del programa se pondrá en contacto contigo.' });
            setF({});
        } catch {
            setFallo('No pudimos enviar la solicitud. Revisa tu conexión e intenta de nuevo.');
        } finally { setEnviando(false); }
    };

    const consentimiento = (texto: string, k: string) => (
        <label className="flex items-start gap-2 text-xs text-gray-600">
            <input type="checkbox" className="mt-0.5" checked={f[k] === true} onChange={e => set(k, e.target.checked)} aria-describedby={`${k}-texto`} />
            <span id={`${k}-texto`}>{texto}</span>
        </label>
    );

    return (
        <div className="rounded-3xl border border-gray-100 bg-white shadow-sm p-5 sm:p-7">
            <div role="tablist" aria-label="Formularios del programa" className="flex flex-wrap gap-2 mb-5">
                {visibles.map(t => (
                    <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                        className={`px-3.5 py-2 rounded-full text-sm font-semibold border transition-colors ${tab === t.id ? 'bg-rotary-blue text-white border-rotary-blue' : 'bg-white text-gray-700 border-gray-200 hover:border-rotary-blue/50'}`}>
                        <span className="sm:hidden">{t.short}</span><span className="hidden sm:inline">{t.label}</span>
                    </button>
                ))}
            </div>

            {recibo ? <Recibo refCode={recibo.ref} texto={recibo.texto} /> : (
                <form onSubmit={enviar} noValidate className="space-y-4" aria-live="polite">
                    {/* Trampa para bots: ningún humano la ve ni la llena. */}
                    <div className="hidden" aria-hidden="true"><label>No llenar<input type="text" tabIndex={-1} autoComplete="off" value={f.website_url || ''} onChange={e => set('website_url', e.target.value)} /></label></div>

                    {tab === 'orientacion' && (<>
                        <p className="text-sm text-gray-600">Para una orientación inicial. <strong>No envíes historia clínica, documentos de identidad, fotografías ni datos detallados de menores.</strong></p>
                        <div><label className={rotulo} htmlFor="adultName">Nombre del adulto responsable</label><input id="adultName" className={campo} value={f.adultName || ''} onChange={e => set('adultName', e.target.value)} autoComplete="name" /><Aviso errors={errores} field="adultName" /></div>
                        <div className="grid sm:grid-cols-2 gap-3">
                            <div><label className={rotulo} htmlFor="city">Ciudad</label><input id="city" className={campo} value={f.city || ''} onChange={e => set('city', e.target.value)} /><Aviso errors={errores} field="city" /></div>
                            <div><label className={rotulo} htmlFor="region">Departamento</label><input id="region" className={campo} value={f.region || ''} onChange={e => set('region', e.target.value)} /></div>
                        </div>
                        <div><label className={rotulo} htmlFor="contactMeans">¿Por qué medio prefieres que te contactemos?</label>
                            <select id="contactMeans" className={campo} value={f.contactMeans || ''} onChange={e => set('contactMeans', e.target.value)}><option value="">Elige…</option>{CONTACT_MEANS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select><Aviso errors={errores} field="contactMeans" /></div>
                        {f.contactMeans === 'correo' ? (
                            <div><label className={rotulo} htmlFor="email">Correo electrónico</label><input id="email" type="email" className={campo} value={f.email || ''} onChange={e => set('email', e.target.value)} autoComplete="email" /><Aviso errors={errores} field="email" /></div>
                        ) : f.contactMeans ? (
                            <div><label className={rotulo} htmlFor="phone">Número de teléfono (con indicativo)</label><input id="phone" type="tel" className={campo} value={f.phone || ''} onChange={e => set('phone', e.target.value)} autoComplete="tel" /><Aviso errors={errores} field="phone" /></div>
                        ) : null}
                        <div><label className={rotulo} htmlFor="reason">Motivo general</label><textarea id="reason" className={campo} rows={3} value={f.reason || ''} onChange={e => set('reason', e.target.value)} placeholder="Cuéntanos en pocas palabras en qué podemos orientarte." /><Aviso errors={errores} field="reason" /></div>
                        {consentimiento(DATA_CONSENT_TEXT, 'dataConsent')}<Aviso errors={errores} field="dataConsent" />
                    </>)}

                    {tab === 'apoyo' && (<>
                        <div className="flex gap-4 text-sm">
                            {['persona', 'empresa'].map(k => <label key={k} className="flex items-center gap-2"><input type="radio" name="entityKind" checked={(f.entityKind || 'persona') === k} onChange={() => set('entityKind', k)} />{k === 'persona' ? 'Persona' : 'Empresa'}</label>)}
                        </div>
                        {f.entityKind === 'empresa' && <div><label className={rotulo} htmlFor="organization">Empresa</label><input id="organization" className={campo} value={f.organization || ''} onChange={e => set('organization', e.target.value)} autoComplete="organization" /><Aviso errors={errores} field="organization" /></div>}
                        <div><label className={rotulo} htmlFor="contactName">Nombre de contacto</label><input id="contactName" className={campo} value={f.contactName || ''} onChange={e => set('contactName', e.target.value)} autoComplete="name" /><Aviso errors={errores} field="contactName" /></div>
                        <div className="grid sm:grid-cols-2 gap-3">
                            <div><label className={rotulo} htmlFor="email2">Correo</label><input id="email2" type="email" className={campo} value={f.email || ''} onChange={e => set('email', e.target.value)} autoComplete="email" /><Aviso errors={errores} field="email" /></div>
                            <div><label className={rotulo} htmlFor="phone2">Teléfono</label><input id="phone2" type="tel" className={campo} value={f.phone || ''} onChange={e => set('phone', e.target.value)} autoComplete="tel" /></div>
                        </div>
                        <div><label className={rotulo} htmlFor="supportType">Tipo de apoyo</label>
                            <select id="supportType" className={campo} value={f.supportType || ''} onChange={e => set('supportType', e.target.value)}><option value="">Elige…</option>{SUPPORT_TYPES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select><Aviso errors={errores} field="supportType" /></div>
                        <div><label className={rotulo} htmlFor="message">Mensaje</label><textarea id="message" className={campo} rows={3} value={f.message || ''} onChange={e => set('message', e.target.value)} /></div>
                        {consentimiento(DATA_CONSENT_TEXT, 'dataConsent')}<Aviso errors={errores} field="dataConsent" />
                    </>)}

                    {tab === 'club' && (<>
                        <div className="grid sm:grid-cols-2 gap-3">
                            <div><label className={rotulo} htmlFor="clubName">Club</label><input id="clubName" className={campo} value={f.clubName || ''} onChange={e => set('clubName', e.target.value)} /><Aviso errors={errores} field="clubName" /></div>
                            <div><label className={rotulo} htmlFor="districtNumber">Distrito</label><input id="districtNumber" inputMode="numeric" className={campo} value={f.districtNumber || ''} onChange={e => set('districtNumber', e.target.value.replace(/\D/g, ''))} /><Aviso errors={errores} field="districtNumber" /></div>
                        </div>
                        <div><label className={rotulo} htmlFor="responsibleName">Responsable</label><input id="responsibleName" className={campo} value={f.responsibleName || ''} onChange={e => set('responsibleName', e.target.value)} autoComplete="name" /><Aviso errors={errores} field="responsibleName" /></div>
                        <div className="grid sm:grid-cols-2 gap-3">
                            <div><label className={rotulo} htmlFor="email3">Correo</label><input id="email3" type="email" className={campo} value={f.email || ''} onChange={e => set('email', e.target.value)} autoComplete="email" /><Aviso errors={errores} field="email" /></div>
                            <div><label className={rotulo} htmlFor="phone3">Teléfono</label><input id="phone3" type="tel" className={campo} value={f.phone || ''} onChange={e => set('phone', e.target.value)} autoComplete="tel" /></div>
                        </div>
                        <div><label className={rotulo} htmlFor="participationType">Tipo de participación</label>
                            <select id="participationType" className={campo} value={f.participationType || ''} onChange={e => set('participationType', e.target.value)}><option value="">Elige…</option>{CLUB_PARTICIPATION_TYPES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select><Aviso errors={errores} field="participationType" /></div>
                        <div><label className={rotulo} htmlFor="message3">Mensaje</label><textarea id="message3" className={campo} rows={3} value={f.message || ''} onChange={e => set('message', e.target.value)} /></div>
                        {consentimiento(DATA_CONSENT_TEXT, 'dataConsent')}<Aviso errors={errores} field="dataConsent" />
                    </>)}

                    {tab === 'novedades' && (<>
                        <div className="grid sm:grid-cols-2 gap-3">
                            <div><label className={rotulo} htmlFor="name4">Nombre</label><input id="name4" className={campo} value={f.name || ''} onChange={e => set('name', e.target.value)} autoComplete="name" /><Aviso errors={errores} field="name" /></div>
                            <div><label className={rotulo} htmlFor="email4">Correo</label><input id="email4" type="email" className={campo} value={f.email || ''} onChange={e => set('email', e.target.value)} autoComplete="email" /><Aviso errors={errores} field="email" /></div>
                        </div>
                        {consentimiento(NEWSLETTER_CONSENT_TEXT, 'newsletterConsent')}<Aviso errors={errores} field="newsletterConsent" />
                    </>)}

                    {fallo ? <p role="alert" className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2"><AlertCircle className="w-4 h-4" /> {fallo}</p> : null}
                    <button type="submit" disabled={enviando} className="inline-flex items-center gap-2 rounded-full bg-rotary-blue text-white px-6 py-2.5 text-sm font-semibold hover:bg-rotary-blue/90 disabled:opacity-60">
                        {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : null} {tab === 'novedades' ? 'Suscribirme' : 'Enviar solicitud'}
                    </button>
                </form>
            )}
        </div>
    );
};

export default ProgramaFormularios;
