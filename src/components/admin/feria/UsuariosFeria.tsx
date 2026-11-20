// ════════════════════════════════════════════════════════════════════
// «Usuarios» — Postulación de Proyectos (v4.1342.0)
//
// Las cuentas de la edición: gestores de proyecto (/mi-proyecto) y
// asistentes al evento (/mi-inscripcion). El comité ve el perfil y, si la
// persona perdió el acceso, le asigna una contraseña nueva o le genera un
// enlace para que cree la suya. El servidor (`projectFairUsersController.js`)
// guarda sólo el hash y deja cada acción en la bitácora.
//
// Los componentes van declarados FUERA unos de otros: uno declarado dentro
// de otro es un tipo nuevo en cada render y el campo pierde el foco.
// ════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Users, Search, KeyRound, Link2, Copy, Check, Eye, EyeOff, X, Loader2, RefreshCw,
    ShieldCheck, AlertTriangle, Mail, Phone, FolderOpen, Ticket, History, Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { leerJson } from '../../../lib/leerJson';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('rotary_token')}` });
const jsonHeaders = () => ({ ...authHeaders(), 'Content-Type': 'application/json' });

type Realm = 'project' | 'attendee';
interface AccessState { key: string; label: string; tone: string; description: string }
interface FairUser {
    realm: Realm; realmLabel: string; id: string; email: string; name: string; phone: string | null;
    clubName: string | null; district?: string | null; role?: string; status?: string; linkedRealm?: string | null;
    projects?: { id: string; publicRef: string; projectName: string; workflowStatus: string; paymentStatus: string }[];
    registrations?: { id: string; code: string | null; status: string; category: string | null; clubName: string | null }[];
    hasPassword: boolean; resetPending: boolean; mustChangePassword?: boolean;
    lastLoginAt: string | null; createdAt: string | null;
    access: AccessState; canSetPassword: boolean; cannotSetReason?: string | null;
    linkedTo?: { realm: Realm; id: string; email: string } | null;
}
interface ListResponse {
    total: number; counts: { project: number; attendee: number }; page: number; pages: number;
    users: FairUser[]; passwordMin: number;
}
interface HistoryRow { action: string; actorEmail: string | null; actorRole: string | null; detail: any; createdAt: string }
interface DetailResponse { user: FairUser; history: HistoryRow[]; logins: { outcome: string; createdAt: string }[]; passwordMin: number }

const TONES: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    sky: 'bg-sky-50 text-sky-700 border-sky-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    slate: 'bg-slate-50 text-slate-600 border-slate-200',
};
const ACTION_LABELS: Record<string, string> = {
    password_set: 'Asignó una contraseña nueva',
    reset_link: 'Generó un enlace de restablecimiento',
};
const fmtDate = (d: string | null | undefined) => {
    if (!d) return '—';
    const t = new Date(d);
    return Number.isNaN(t.getTime()) ? '—' : t.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
};

const copyText = async (text: string, okMsg = 'Copiado') => {
    try { await navigator.clipboard.writeText(text); toast.success(okMsg); }
    catch { toast.error('No se pudo copiar: selecciónalo y cópialo a mano.'); }
};

const Badge = ({ state }: { state: AccessState }) => (
    <span title={state.description} className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONES[state.tone] || TONES.slate}`}>
        {state.label}
    </span>
);

const CopyBox = ({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) => (
    <div>
        <p className="mb-1 text-xs font-semibold text-slate-600">{label}</p>
        <div className="flex items-stretch gap-2">
            <code className={`min-w-0 flex-1 break-all rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 ${mono ? 'font-mono' : 'font-sans'}`}>{value}</code>
            <button type="button" onClick={() => copyText(value)} aria-label={`Copiar ${label.toLowerCase()}`}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <Copy size={13} /> Copiar
            </button>
        </div>
    </div>
);

const EmailOutcome = ({ email }: { email: { sent: boolean; error: string | null } | null }) => {
    if (!email) return null;
    return email.sent
        ? <p className="flex items-center gap-1.5 text-xs text-emerald-700"><Check size={13} /> El correo salió hacia la cuenta.</p>
        : <p className="flex items-start gap-1.5 text-xs text-red-700"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> El correo NO salió: {email.error}. Entrégalo por WhatsApp o teléfono.</p>;
};

// ── Asignar contraseña ───────────────────────────────────────────────
interface PasswordFormProps { user: FairUser; min: number; withEvento: (u: string) => string; onDone: () => void }
const PasswordForm: React.FC<PasswordFormProps> = ({ user, min, withEvento, onDone }) => {
    const [password, setPassword] = useState('');
    const [show, setShow] = useState(false);
    const [notify, setNotify] = useState(false);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<{ password: string; email: { sent: boolean; error: string | null } | null } | null>(null);
    const loginUrl = `${window.location.origin}${user.realm === 'project' ? '/mi-proyecto' : '/mi-inscripcion'}`;

    const submit = async (generate: boolean) => {
        if (!generate && password.length < min) { toast.error(`La contraseña debe tener al menos ${min} caracteres.`); return; }
        setBusy(true);
        try {
            const res = await fetch(withEvento(`${API}/project-fair/admin/usuarios/${user.realm}/${encodeURIComponent(user.id)}/password`), {
                method: 'POST', headers: jsonHeaders(),
                body: JSON.stringify(generate ? { generate: true, notify } : { password, notify }),
            });
            const { data } = await leerJson<any>(res);
            if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
            setResult({ password: data.password || password, email: data.email || null });
            setPassword('');
            toast.success('Contraseña asignada');
            onDone();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo asignar la contraseña');
        } finally { setBusy(false); }
    };

    if (result) {
        const mensaje = `Hola ${user.name.split(' ')[0] || ''}, el comité organizador te asignó una contraseña nueva. Ingresa en ${loginUrl} con tu correo ${user.email} y la contraseña: ${result.password}`;
        return (
            <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><ShieldCheck size={16} /> Contraseña asignada</p>
                <p className="text-xs text-emerald-900/80">Cópiala ahora: por seguridad no se guarda en ningún lado y no se puede volver a ver.</p>
                <CopyBox label="Contraseña" value={result.password} />
                <CopyBox label="Mensaje listo para enviar por WhatsApp" value={mensaje} mono={false} />
                <EmailOutcome email={result.email} />
                <button type="button" onClick={() => setResult(null)} className="text-xs font-semibold text-blue-700 hover:underline">Asignar otra</button>
            </div>
        );
    }
    return (
        <div className="space-y-3">
            <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">Contraseña nueva</span>
                <div className="flex items-stretch gap-2">
                    <input type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password"
                        placeholder={`Mínimo ${min} caracteres`}
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                    <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        className="inline-flex shrink-0 items-center rounded-lg border border-slate-300 px-3 text-slate-600 hover:bg-slate-50">
                        {show ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                </div>
            </label>
            <label className="flex items-start gap-2 text-xs text-slate-600">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={notify} onChange={e => setNotify(e.target.checked)} />
                <span>Avisarle por correo que su contraseña cambió (el correo NO incluye la contraseña).</span>
            </label>
            <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy || password.length < min} onClick={() => submit(false)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Guardar contraseña
                </button>
                <button type="button" disabled={busy} onClick={() => submit(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50">
                    <Wand2 size={15} /> Generar una segura y asignarla
                </button>
            </div>
        </div>
    );
};

// ── Enlace de restablecimiento ───────────────────────────────────────
interface ResetLinkProps { user: FairUser; withEvento: (u: string) => string; onDone: () => void }
const ResetLinkForm: React.FC<ResetLinkProps> = ({ user, withEvento, onDone }) => {
    const [sendEmail, setSendEmail] = useState(false);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<{ link: string; expiresInHours: number; email: { sent: boolean; error: string | null } | null } | null>(null);

    const generate = async () => {
        setBusy(true);
        try {
            const res = await fetch(withEvento(`${API}/project-fair/admin/usuarios/${user.realm}/${encodeURIComponent(user.id)}/reset-link`), {
                method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ sendEmail }),
            });
            const { data } = await leerJson<any>(res);
            if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
            setResult({ link: data.link, expiresInHours: data.expiresInHours, email: data.email || null });
            onDone();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo generar el enlace');
        } finally { setBusy(false); }
    };

    return (
        <div className="space-y-3">
            <p className="text-xs leading-relaxed text-slate-600">
                La persona abre el enlace y crea ella misma su contraseña. Sirve una sola vez y genera uno nuevo invalida el anterior.
            </p>
            {result ? (
                <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/60 p-4">
                    <CopyBox label={`Enlace (vence en ${result.expiresInHours} horas)`} value={result.link} />
                    <EmailOutcome email={result.email} />
                </div>
            ) : null}
            <label className="flex items-start gap-2 text-xs text-slate-600">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} />
                <span>Enviarlo también a {user.email}</span>
            </label>
            <button type="button" disabled={busy} onClick={generate}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />} {result ? 'Generar otro enlace' : 'Generar enlace'}
            </button>
        </div>
    );
};

// ── Panel de una cuenta ──────────────────────────────────────────────
interface UserPanelProps { target: { realm: Realm; id: string }; withEvento: (u: string) => string; onClose: () => void; onOpen: (t: { realm: Realm; id: string }) => void; onChanged: () => void }
const UserPanel: React.FC<UserPanelProps> = ({ target, withEvento, onClose, onOpen, onChanged }) => {
    const [detail, setDetail] = useState<DetailResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setError(null);
        try {
            const res = await fetch(withEvento(`${API}/project-fair/admin/usuarios/${target.realm}/${encodeURIComponent(target.id)}`), { headers: authHeaders() });
            const { data } = await leerJson<any>(res);
            if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
            setDetail(data as DetailResponse);
        } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar la cuenta'); }
    }, [target.realm, target.id, withEvento]);
    useEffect(() => { setDetail(null); load(); }, [load]);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const changed = () => { load(); onChanged(); };
    const u = detail?.user;

    return (
        <div className="fixed inset-0 z-[120] flex justify-end bg-slate-900/40" onClick={onClose}>
            <aside role="dialog" aria-modal="true" aria-label="Cuenta de usuario" onClick={e => e.stopPropagation()}
                className="flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-2xl">
                <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{u?.realmLabel || 'Cuenta'}</p>
                        <h3 className="truncate text-lg font-bold text-slate-900">{u?.name || '…'}</h3>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
                </div>

                {error && <div className="m-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
                {!u && !error && <div className="flex items-center gap-2 p-5 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Cargando…</div>}

                {u && (
                    <div className="space-y-6 p-5">
                        <section className="space-y-2 text-sm">
                            <div className="flex flex-wrap items-center gap-2"><Badge state={u.access} />{u.resetPending && <span className="text-[11px] text-slate-500">Tiene un enlace de restablecimiento vigente</span>}</div>
                            <p className="flex items-center gap-2 text-slate-700"><Mail size={14} className="text-slate-400" /> {u.email}</p>
                            {u.phone && <p className="flex items-center gap-2 text-slate-700"><Phone size={14} className="text-slate-400" /> {u.phone}</p>}
                            {u.clubName && <p className="text-slate-600">Club: <strong className="font-semibold text-slate-800">{u.clubName}</strong>{u.district ? ` · Distrito ${u.district}` : ''}</p>}
                            <p className="text-xs text-slate-500">Creada: {fmtDate(u.createdAt)} · Último ingreso: {fmtDate(u.lastLoginAt)}</p>
                        </section>

                        {!!u.projects?.length && (
                            <section>
                                <h4 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><FolderOpen size={14} /> Proyectos</h4>
                                <ul className="space-y-1.5">
                                    {u.projects.map(p => (
                                        <li key={p.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                                            <span className="font-mono text-xs text-slate-500">{p.publicRef}</span>
                                            <span className="block font-semibold text-slate-800">{p.projectName || 'Sin nombre'}</span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                        {!!u.registrations?.length && (
                            <section>
                                <h4 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><Ticket size={14} /> Inscripciones al evento</h4>
                                <ul className="space-y-1.5">
                                    {u.registrations.map(r => (
                                        <li key={r.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                                            <span className="font-mono text-xs text-slate-500">{r.code || r.id.slice(0, 8)}</span>
                                            <span className="block text-slate-800">{r.category || 'Inscripción'}{r.clubName ? ` · ${r.clubName}` : ''}</span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        {u.canSetPassword ? (
                            <>
                                <section className="rounded-xl border border-slate-200 p-4">
                                    <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800"><KeyRound size={16} className="text-blue-700" /> Asignar una contraseña nueva</h4>
                                    <PasswordForm user={u} min={detail?.passwordMin || 8} withEvento={withEvento} onDone={changed} />
                                </section>
                                <section className="rounded-xl border border-slate-200 p-4">
                                    <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800"><Link2 size={16} className="text-blue-700" /> Enlace para que cree su contraseña</h4>
                                    <ResetLinkForm user={u} withEvento={withEvento} onDone={changed} />
                                </section>
                            </>
                        ) : (
                            <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                <p className="flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> {u.cannotSetReason || 'A esta cuenta no se le puede asignar una contraseña desde aquí.'}</p>
                                {u.linkedTo && (
                                    <button type="button" onClick={() => onOpen({ realm: u.linkedTo!.realm, id: u.linkedTo!.id })}
                                        className="mt-2 text-xs font-semibold text-blue-700 hover:underline">
                                        Abrir la cuenta de origen ({u.linkedTo.email})
                                    </button>
                                )}
                            </section>
                        )}

                        <section>
                            <h4 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><History size={14} /> Historial de acceso</h4>
                            {!detail?.history.length ? (
                                <p className="text-xs text-slate-500">El comité no ha hecho cambios en esta cuenta.</p>
                            ) : (
                                <ul className="space-y-1.5 text-xs">
                                    {detail.history.map((h, i) => (
                                        <li key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">
                                            <strong>{ACTION_LABELS[h.action] || h.action}</strong>
                                            {h.detail?.generated ? ' (generada)' : ''}{h.detail?.emailed || h.detail?.notified ? ' · correo enviado' : ''}
                                            <span className="block text-slate-500">{h.actorEmail || 'Comité'} · {fmtDate(h.createdAt)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>
                )}
            </aside>
        </div>
    );
};

// ── La pestaña ───────────────────────────────────────────────────────
const UsuariosFeria: React.FC<{ eventId: string | null }> = ({ eventId }) => {
    const withEvento = useCallback((url: string) => (eventId ? `${url}${url.includes('?') ? '&' : '?'}evento=${encodeURIComponent(eventId)}` : url), [eventId]);
    const [q, setQ] = useState('');
    const [query, setQuery] = useState('');
    const [tipo, setTipo] = useState<'all' | Realm>('all');
    const [page, setPage] = useState(1);
    const [list, setList] = useState<ListResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [open, setOpen] = useState<{ realm: Realm; id: string } | null>(null);

    // La búsqueda espera a que se deje de escribir.
    useEffect(() => {
        const t = setTimeout(() => { setQuery(q.trim()); setPage(1); }, 300);
        return () => clearTimeout(t);
    }, [q]);

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const params = new URLSearchParams({ tipo, page: String(page) });
            if (query) params.set('q', query);
            const res = await fetch(withEvento(`${API}/project-fair/admin/usuarios?${params}`), { headers: authHeaders() });
            const { data } = await leerJson<any>(res);
            if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
            setList(data as ListResponse);
        } catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron cargar los usuarios'); }
        finally { setLoading(false); }
    }, [tipo, page, query, withEvento]);
    useEffect(() => { load(); }, [load]);

    const filtros = useMemo(() => ([
        { key: 'all' as const, label: 'Todos' },
        { key: 'project' as const, label: 'Gestores de proyecto' },
        { key: 'attendee' as const, label: 'Asistentes al evento' },
    ]), []);
    const closePanel = useCallback(() => setOpen(null), []);

    return (
        <div className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><Users size={18} className="text-blue-700" /> Usuarios de la edición</h2>
                <p className="mt-1 text-sm text-slate-500">
                    Las cuentas que se crean al postular un proyecto y al inscribirse al evento. Si alguien perdió el acceso o no le llega el correo de recuperación,
                    ábrela con «Gestionar» y asígnale una contraseña nueva o genérale un enlace para que cree la suya.
                </p>
                <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
                    <label className="relative block flex-1">
                        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, correo, teléfono, club o proyecto"
                            aria-label="Buscar usuarios"
                            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {filtros.map(f => (
                            <button key={f.key} type="button" onClick={() => { setTipo(f.key); setPage(1); }}
                                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${tipo === f.key ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>
                                {f.label}
                                {list && f.key !== 'all' && tipo === 'all' ? ` · ${list.counts[f.key]}` : ''}
                            </button>
                        ))}
                        <button type="button" onClick={load} aria-label="Actualizar" className="rounded-full border border-slate-300 p-1.5 text-slate-500 hover:bg-slate-50">
                            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>
            </section>

            {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                {/* `relative`: el «Acciones» de lectores de pantalla (sr-only, posición
                    absoluta) quedaría fuera de la caja y desbordaría la página en el teléfono. */}
                <div className="relative overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <tr>
                                <th className="px-4 py-3">Usuario</th>
                                <th className="px-4 py-3">Tipo</th>
                                <th className="px-4 py-3">Club / proyecto</th>
                                <th className="px-4 py-3">Acceso</th>
                                <th className="px-4 py-3">Último ingreso</th>
                                <th className="px-4 py-3"><span className="sr-only">Acciones</span></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {list?.users.map(u => (
                                <tr key={`${u.realm}:${u.id}`} className="align-top hover:bg-slate-50/60">
                                    <td className="px-4 py-3">
                                        <p className="font-semibold text-slate-900">{u.name}</p>
                                        <p className="text-xs text-slate-500">{u.email}</p>
                                        {u.phone && <p className="text-xs text-slate-400">{u.phone}</p>}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-600">{u.realmLabel}</td>
                                    <td className="px-4 py-3 text-xs text-slate-600">
                                        {u.clubName && <p className="font-semibold text-slate-700">{u.clubName}</p>}
                                        {u.projects?.map(p => <p key={p.id} className="line-clamp-2">{p.publicRef} · {p.projectName}</p>)}
                                        {u.registrations?.map(r => <p key={r.id}>{r.code || 'Inscripción'}{r.category ? ` · ${r.category}` : ''}</p>)}
                                    </td>
                                    <td className="px-4 py-3"><Badge state={u.access} /></td>
                                    <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(u.lastLoginAt)}</td>
                                    <td className="px-4 py-3 text-right">
                                        <button type="button" onClick={() => setOpen({ realm: u.realm, id: u.id })}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                            <KeyRound size={13} /> Gestionar
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {list && !list.users.length && (
                                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">{query ? 'Ninguna cuenta coincide con la búsqueda.' : 'Esta edición todavía no tiene cuentas.'}</td></tr>
                            )}
                            {!list && loading && (
                                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500"><Loader2 size={16} className="mr-2 inline animate-spin" /> Cargando…</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {list && list.pages > 1 && (
                    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
                        <span>{list.total} cuentas · página {list.page} de {list.pages}</span>
                        <div className="flex gap-2">
                            <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40">Anterior</button>
                            <button type="button" disabled={page >= list.pages} onClick={() => setPage(p => p + 1)} className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40">Siguiente</button>
                        </div>
                    </div>
                )}
                {list && list.pages <= 1 && <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">{list.total} {list.total === 1 ? 'cuenta' : 'cuentas'}</p>}
            </section>

            {open && <UserPanel target={open} withEvento={withEvento} onClose={closePanel} onOpen={setOpen} onChanged={load} />}
        </div>
    );
};

export default UsuariosFeria;
