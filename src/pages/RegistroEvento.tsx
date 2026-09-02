// ════════════════════════════════════════════════════════════════════
// Inscripción a un evento — asistente público — v4.648.0
//
// Ruta: /eventos/:eventRef/registro (acepta el id o el slug del evento).
//
// El asistente va por pasos: categoría → datos personales → información
// rotaria → (información adicional) → necesidades → acompañantes → resumen →
// pago → confirmación. Los pasos intermedios NO están escritos aquí: llegan
// del servidor dentro de `category.form`, así que agregar una categoría o un
// campo desde el panel no obliga a tocar esta pantalla.
//
// Decisiones:
//
// - **Autoguardado.** Desde que hay categoría y correo válido, el avance se
//   guarda como borrador cada pocos segundos. El id y su token quedan en
//   `localStorage`, así que cerrar la pestaña no pierde lo escrito.
// - **Se puede volver atrás.** Los pasos ya visitados son clicables.
// - **El precio lo dice el servidor.** Aquí sólo se muestra; el importe real lo
//   calcula y congela el backend al enviar el formulario.
// - **La confirmación la da el webhook de Stripe.** Al volver del pago se
//   consulta el estado real; si todavía no llegó, se dice que puede tardar unos
//   segundos en vez de dar por bueno el retorno del navegador.
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
    AlertCircle, ArrowLeft, ArrowRight, Briefcase, Building2, CalendarDays,
    Check, CheckCircle2, Clock, CreditCard, FileText, Globe, Hotel, IdCard, KeyRound,
    LayoutDashboard, Loader2, Lock, LogIn, Mail, MapPin, MessageSquare, Plane, Plus, ShieldCheck,
    UserCheck,
    Target, Trash2, User, Users, Utensils,
} from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useClub } from '../contexts/ClubContext';
import { useLang } from '../contexts/LanguageContext';
import {
    money, validateStep, isFieldVisible, validateCredentials,
    optionsForField, CLUB_NOT_LISTED,
    type FormField, type FormStep, type PublicCategory, type Companion,
    type FormCatalogs,
} from '../lib/eventRegistrationSpec';
// v4.980 — El desglose del recargo. Espejo del criterio del servidor: existe
// para PINTAR mientras la persona agrega acompañantes, sin pagar un viaje de
// red por pulsación. Lo que se COBRA lo calcula el servidor al abrir el pago.
import { computeSurcharge, percentLabel } from '../lib/checkoutSurcharge';
// Las dos listas que el navegador YA lleva: los países del selector telefónico
// y los departamentos de Colombia que usa Postular Proyecto. Mandarlas desde el
// servidor sería duplicar en la respuesta lo que el bundle carga de todos modos.
import { COUNTRIES } from '../lib/countryPhones';
import { DEPARTAMENTOS_COLOMBIA } from '../lib/colombiaGeo';
import { localeOf } from '../components/EventRegistrationCta';
import { openLoginModal, onLoginSuccess } from '../lib/loginModal';
import { emitSessionChange } from '../lib/siteSession';
import { ATTENDEE_TOKEN_KEY } from './MiInscripcion';
import { PAGE_HEADER_BACKGROUND } from '../lib/pageHeader';
// Mismos componentes que usa Postular Proyecto — no una copia parecida.
import { Field, PhoneField, StepProgress, controlCls } from '../components/forms/FairField';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
/** Panel del Asistente al Evento. La misma ruta que devuelve el servidor. */
const ATTENDEE_PATH = '/mi-inscripcion';
const BLUE = '#17458F';
const GOLD = '#F7A81B';

/** Identidad reconocida por el servidor a partir del token del navegador. */
interface Identity {
    realm: 'portal' | 'platform' | 'attendee';
    roleLabel: string;
    email: string;
    name: string;
    organization: string | null;
}

interface RegistrationConfig {
    event: { id: string; slug: string | null; title: string; startDate: string; endDate: string | null; location: string | null };
    edition: { editionNumber: number | null; editionLabel: string; venue: string; city: string; country: string; opensAt: string | null; closesAt: string | null };
    enabled: boolean;
    closed: boolean;
    successMessage: string;
    categories: PublicCategory[];
    /** Clave de la categoría con la que se entró desde la ficha del evento. */
    lockedCategory: string | null;
    /** Si esta categoría admite inscribirse con una cuenta que ya existe. */
    accountLinking?: { allowed: boolean; requiresAccount: boolean; mode: string };
    /** Quién está autenticado, si el navegador trajo una sesión válida. */
    identity?: Identity | null;
    /** Datos del perfil para precargar el formulario. */
    prefill?: Record<string, string> | null;
    /** Catálogos que sólo el servidor conoce: distritos con sus clubes. */
    catalogs?: { districts?: { value: string; label: string; clubs: string[] }[] };
}

interface Registration {
    id: string;
    publicRef: string;
    registrationCode: string | null;
    status: string;
    categoryLabel: string;
    firstName: string;
    lastName: string;
    email: string;
    baseCurrency: string;
    baseAmount: number;
    chargeCurrency: string;
    chargeAmount: number;
    fxRate: number | null;
    companionsCount: number;
    accessToken?: string;
    pricing?: Record<string, any>;
    /** Cuenta de Asistente al Evento a la que quedó vinculada la inscripción. */
    account?: { email: string; portalPath: string; token?: string } | null;
}

type Answers = Record<string, any>;

const emptyCompanion = (): Companion => ({
    firstName: '', lastName: '', documentNumber: '',
    relationship: '', email: '', phone: '', dietary: '', notes: '',
});

const storageKey = (eventRef: string, categoryKey: string) =>
    `rotary_event_reg_${eventRef}_${categoryKey}`;

/**
 * Sesión que tenga abierta el navegador, sea cual sea (v4.692).
 *
 * Se manda tal cual y es el SERVIDOR quien decide si vale: aquí no se
 * interpreta ni se confía en su contenido. El orden es el de utilidad para
 * inscribirse: el panel del club primero, porque es el caso que motiva esto.
 */
const IDENTITY_TOKEN_KEYS = ['feria_portal_token', 'evento_asistente_token', 'rotary_token'];

/**
 * Deja abierta la sesión del Asistente al Evento (v4.710).
 *
 * El token lo emite el SERVIDOR: aquí sólo se guarda y se avisa, que es lo que
 * hace que el encabezado muestre el avatar y que `/mi-inscripcion` deje de
 * pedir el ingreso. Sin este paso el encabezado y la ruta protegida decían
 * cosas distintas sobre la misma persona.
 */
const openAttendeeSession = (token?: string | null) => {
    if (!token) return false;
    localStorage.setItem(ATTENDEE_TOKEN_KEY, token);
    emitSessionChange();
    return true;
};
const currentIdentityToken = (): string => {
    for (const key of IDENTITY_TOKEN_KEYS) {
        const value = localStorage.getItem(key);
        if (value) return value;
    }
    return '';
};

// ── Campo dinámico ───────────────────────────────────────────────────
//
// El formulario de un evento lo define el servidor (una lista de campos por
// categoría), mientras que el de Postular Proyecto está escrito a mano. Para
// que se vean idénticos, este componente NO dibuja controles propios: traduce
// cada campo dinámico a las mismas piezas compartidas (`Field`, `PhoneField`)
// que usa Postular Proyecto. Lo único propio son los controles que allá no
// existen —selección múltiple y casilla de aceptación—, y usan el mismo borde
// (`controlCls`) y el mismo mensaje de error.

/** Ícono de cada campo, para que el rótulo se vea igual que en Postular. */
const FIELD_ICONS: Record<string, any> = {
    firstName: User, lastName: User, email: Mail,
    documentType: IdCard, documentNumber: IdCard,
    country: Globe, city: MapPin, department: MapPin,
    clubName: Building2, district: MapPin, rotaryRole: Briefcase,
    residenceCountry: Globe, arrivalDate: Plane, departureDate: Plane,
    lodging: Hotel, lodgingDetail: Hotel,
    needsVisa: FileText, preferredLanguage: Globe,
    emergencyName: User, emergencyRelation: Users,
    dietary: Utensils, dietaryDetail: Utensils, accessibility: MessageSquare,
    technicalExperience: Target, specialties: Target, availability: CalendarDays,
    supportedClubs: Building2,
};

/** Un campo ocupa el ancho completo cuando su control no cabe en media fila. */
const isWide = (field: FormField) =>
    field.type === 'textarea' || field.type === 'multiselect' || field.type === 'checkbox';

const DynamicField = ({ field, value, error, onChange, answers, catalogs, onClear }: {
    field: FormField;
    value: any;
    error?: string;
    onChange: (value: any) => void;
    /** Las respuestas actuales: un catálogo dependiente se resuelve con ellas. */
    answers: Answers;
    catalogs: FormCatalogs;
    /** Vuelve a la lista tras haber marcado «no está en la lista». */
    onClear?: () => void;
}) => {
    const invalid = Boolean(error);
    // `onClear` sólo llega cuando la persona marcó «no está en la lista»: es
    // la señal de que pidió escribirlo a mano, aunque haya catálogo.
    const catalogOptions = onClear ? null : optionsForField(field, answers, catalogs);
    const common = {
        // Un campo con catálogo puede llamarse distinto según si lo hay:
        // «Departamento» en Colombia, «Estado / Provincia» fuera.
        label: (!catalogOptions && field.altLabel) ? field.altLabel : field.label,
        name: field.key,
        value,
        error,
        // Los errores del asistente llegan sólo cuando se intenta avanzar, así
        // que un campo con error siempre está "tocado".
        touched: invalid,
        required: Boolean(field.required),
        icon: FIELD_ICONS[field.key],
        hint: field.help,
        placeholder: field.placeholder,
        maxLength: field.max,
    };

    // Aceptación de términos: una casilla no lleva rótulo arriba.
    if (field.type === 'checkbox') {
        return (
            <div className="sm:col-span-2">
                <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-4 text-[15px] transition ${
                    invalid ? 'border-red-400 bg-red-50/40 text-red-800' : 'border-slate-300 bg-white text-slate-700'}`}>
                    <input type="checkbox" checked={value === true}
                        onChange={e => onChange(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{field.label}{field.required && <span className="text-red-500"> *</span>}</span>
                </label>
                {invalid && (
                    <p className="mt-1.5 flex items-center gap-1 text-[13px] font-medium text-red-600">
                        <AlertCircle size={13} /> {error}
                    </p>
                )}
            </div>
        );
    }

    // Teléfono: el mismo selector de país con banderas de Postular Proyecto.
    if (field.type === 'tel') {
        return (
            <PhoneField
                label={field.label} name={field.key} required={Boolean(field.required)}
                value={value ?? ''} onChange={onChange}
                error={error} touched={invalid} hint={field.help}
            />
        );
    }

    if (field.type === 'multiselect') {
        return (
            <div className="sm:col-span-2">
                <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                    {FIELD_ICONS[field.key] && (() => { const I = FIELD_ICONS[field.key]; return <I size={15} className="text-slate-400" />; })()}
                    {field.label} {field.required && <span className="text-red-500">*</span>}
                </label>
                <div className={`flex flex-wrap gap-2 rounded-xl border p-3 ${invalid ? 'border-red-400' : 'border-slate-300'} bg-white`}>
                    {(field.options || []).map(o => {
                        const selected = Array.isArray(value) && value.includes(o.value);
                        return (
                            <button key={o.value} type="button"
                                onClick={() => {
                                    const current: string[] = Array.isArray(value) ? value : [];
                                    onChange(selected ? current.filter(v => v !== o.value) : [...current, o.value]);
                                }}
                                className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition ${selected
                                    ? 'border-transparent text-white'
                                    : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'}`}
                                style={selected ? { background: BLUE } : undefined}>
                                {selected && <Check size={12} className="mr-1 inline" />}{o.label}
                            </button>
                        );
                    })}
                </div>
                {invalid ? (
                    <p className="mt-1.5 flex items-center gap-1 text-[13px] font-medium text-red-600">
                        <AlertCircle size={13} /> {error}
                    </p>
                ) : field.help ? (
                    <p className="mt-1.5 text-[13px] text-slate-500">{field.help}</p>
                ) : null}
            </div>
        );
    }

    const handle = (e: any) => onChange(e.target.value);

    // ── Catálogos (v4.708) ───────────────────────────────────────────
    //
    // `optionsForField` devuelve la lista cuando la hay y `null` cuando en
    // este contexto no la hay: un país sin catálogo de divisiones, un distrito
    // de fuera de Colombia, un club cuyo distrito todavía no se ha elegido.
    // La MISMA casilla es desplegable o texto según eso, para que el campo no
    // se mueva de sitio ni cambie de tamaño al elegir el país.
    //
    // Hasta v4.656 esto se intentó con un `<datalist>` y el cliente lo
    // rechazó: sugería sin restringir y confundía las dos cosas. La conclusión
    // que quedó escrita fue que si hay lista, es un `select`. Esto es eso.
    if (catalogOptions) {
        // El club se ofrece con salida: un catálogo se queda viejo solo
        // —clubes nuevos, fusiones, cambios de nombre— y esta inscripción se
        // paga, así que dejar fuera a quien no figure sería perderlo. La
        // opción va de ÚLTIMA y cuesta un clic extra, de modo que quien sí
        // está en la lista la usa. Misma regla que la postulación (v4.706).
        const escapable = field.catalog === 'clubs';
        return (
            <div className={isWide(field) ? 'sm:col-span-2' : undefined}>
                <Field
                    {...common} as="select"
                    options={escapable
                        ? [...catalogOptions, { value: CLUB_NOT_LISTED, label: 'Mi club no está en la lista' }]
                        : catalogOptions}
                    onChange={(e: any) => onChange(e.target.value)}
                />
            </div>
        );
    }

    return (
        <div className={isWide(field) ? 'sm:col-span-2' : undefined}>
            {field.type === 'textarea' ? (
                <Field {...common} as="textarea" rows={3} onChange={handle} />
            ) : field.type === 'select' ? (
                <Field {...common} as="select" options={field.options || []} onChange={handle} />
            ) : (
                <Field {...common} onChange={handle}
                    type={field.type === 'email' ? 'email' : field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'} />
            )}
            {/* La vuelta atrás tiene que ser explícita: volver a elegir el
                MISMO distrito no dispara nada, así que sin este botón quien se
                equivocara al marcar «no está en la lista» se quedaría
                escribiendo a mano. */}
            {onClear && (
                <button type="button" onClick={onClear}
                    className="mt-1.5 text-[13px] font-semibold text-blue-700 hover:underline">
                    Elegir de la lista
                </button>
            )}
        </div>
    );
};

// ── Pantalla ─────────────────────────────────────────────────────────

const RegistroEvento = () => {
    const { eventRef } = useParams<{ eventRef: string }>();
    const { club } = useClub();
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const { lang, locale } = useLang();

    const [config, setConfig] = useState<RegistrationConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [savingDraft, setSavingDraft] = useState(false);

    const [categoryKey, setCategoryKey] = useState('');
    const [answers, setAnswers] = useState<Answers>({});
    const [companions, setCompanions] = useState<Companion[]>([]);
    const [stepIndex, setStepIndex] = useState(0);
    const [maxVisited, setMaxVisited] = useState(0);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    /**
     * Sube al ingresar (v4.692). Está en las dependencias del efecto que pide
     * la configuración, así que al entrar con la cuenta el formulario vuelve a
     * preguntarle al servidor quién es y se precarga solo, SIN recargar la
     * página ni perder lo que la persona ya hubiera escrito.
     */
    const [authTick, setAuthTick] = useState(0);
    useEffect(() => onLoginSuccess(() => setAuthTick(t => t + 1)), []);

    const [registration, setRegistration] = useState<Registration | null>(null);
    const draftRef = useRef<{ id: string; accessToken: string } | null>(null);

    /**
     * Credenciales de la cuenta de Asistente al Evento. Viven APARTE de
     * `answers` a propósito: así no entran en el autoguardado del servidor ni
     * en el borrador de `localStorage`, y el navegador nunca guarda una
     * contraseña en claro. Sólo viajan en el envío final, y el servidor guarda
     * el hash.
     */
    const [credentials, setCredentials] = useState({ password: '', passwordConfirm: '' });
    const [credentialsTouched, setCredentialsTouched] = useState<Record<string, boolean>>({});
    /** Lo que respondió el servidor (p. ej. "esa no es la clave de tu cuenta"). */
    const [serverCredentialErrors, setServerCredentialErrors] = useState<Record<string, string>>({});

    // La regla es la misma que corre el servidor; el mensaje del servidor manda
    // cuando lo hay, porque sabe cosas que el navegador no —si el correo ya
    // tiene cuenta, por ejemplo—.
    const credentialErrors = useMemo(
        () => ({ ...validateCredentials(credentials), ...serverCredentialErrors }),
        [credentials, serverCredentialErrors]);

    const setCredential = (key: 'password' | 'passwordConfirm', value: string) => {
        setCredentials(prev => ({ ...prev, [key]: value }));
        setServerCredentialErrors(prev => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };
    const touchCredential = (key: string) => setCredentialsTouched(prev => ({ ...prev, [key]: true }));
    const touchAllCredentials = () => setCredentialsTouched({ password: true, passwordConfirm: true });

    // ── Cuenta que ya existe (v4.692) ────────────────────────────────
    //
    // `identity` la resuelve el SERVIDOR a partir del token que mandó el
    // navegador; aquí sólo se pinta. `linkingAllowed` dice si esta categoría
    // admite reutilizar la cuenta — por defecto sólo el registro nacional.
    const identity = config?.identity || null;
    const linkingAllowed = config?.accountLinking?.allowed === true;
    const linkingRequired = config?.accountLinking?.requiresAccount === true;
    /** Con sesión reconocida no hay contraseña que crear ni que validar. */
    const usingExistingAccount = Boolean(identity) && linkingAllowed;

    /** Vuelve aquí después de ingresar, al formulario y la categoría actuales. */
    const openLoginAndReturn = () => openLoginModal({
        next: `${window.location.pathname}${window.location.search}`,
        reason: 'Ingresa con la cuenta que ya usas en la plataforma y seguimos con tu inscripción.',
    });

    const clubId = (club as any)?.id as string | undefined;
    const returningId = params.get('registro');
    const returningToken = params.get('t') || '';
    const paymentCancelled = params.get('pago') === 'cancelado';
    /**
     * Categoría fijada desde la ficha del evento. Cuando viene, este formulario
     * es el de ESA categoría y nada más: el servidor devuelve únicamente sus
     * datos, no se muestra el selector y no se puede cambiar desde aquí. Para
     * elegir otra hay que volver al evento, que es donde están los botones.
     */
    const lockedCategory = params.get('categoria') || '';
    const eventUrl = `/eventos/${eventRef}`;

    useEffect(() => { window.scrollTo(0, 0); }, []);

    // ── Configuración ────────────────────────────────────────────────
    useEffect(() => {
        if (!clubId || !eventRef) return;
        setLoading(true);
        const query = new URLSearchParams();
        if (lockedCategory) query.set('categoria', lockedCategory);
        // El idioma activo del sitio, el mismo que decide los botones de la
        // ficha. Aquí importa cuando se entra al asistente sin categoría fijada.
        query.set('locale', localeOf(lang));

        const identityToken = currentIdentityToken();
        fetch(`${API}/event-registrations/config/${clubId}/${encodeURIComponent(eventRef)}?${query}`,
            identityToken ? { headers: { Authorization: `Bearer ${identityToken}` } } : undefined)
            .then(r => r.json())
            .then(data => {
                if (data?.error) throw new Error(data.error);
                setConfig(data);
                // Con categoría fijada se entra directo al primer paso del
                // formulario, sin pasar por la pantalla de selección.
                if (data.lockedCategory) setCategoryKey(data.lockedCategory);

                // v4.692 — Precarga con el perfil de quien ya tiene cuenta. Se
                // rellenan sólo los campos VACÍOS: si la persona ya escribió
                // algo, o retomó un borrador, su texto manda sobre el perfil.
                if (data.identity && data.prefill) {
                    setAnswers(prev => {
                        const next = { ...prev };
                        for (const [key, value] of Object.entries(data.prefill as Record<string, string>)) {
                            const actual = next[key];
                            if (actual === undefined || actual === null || actual === '') next[key] = value;
                        }
                        return next;
                    });
                }
            })
            .catch(err => setError(err?.message || 'No pudimos cargar el registro de este evento.'))
            .finally(() => setLoading(false));
    }, [clubId, eventRef, lockedCategory, lang, authTick]);

    // ── Dirección canónica (v4.658) ──────────────────────────────────
    //
    // El formulario se abre igual con el id interno del evento que con su
    // slug. Cuando el evento tiene slug, esa es su dirección: se reemplaza la
    // del navegador, conservando `?categoria=` —que es lo que decide de qué
    // registro se trata— y sin dejar la del id en el historial.
    useEffect(() => {
        const slug = config?.event?.slug;
        if (!slug || !eventRef || eventRef === slug) return;
        navigate(`/eventos/${slug}/registro${window.location.search}`, { replace: true });
    }, [config?.event?.slug, eventRef, navigate]);

    // ── Regreso desde Stripe ─────────────────────────────────────────
    useEffect(() => {
        if (!returningId) return;
        if (paymentCancelled) {
            setNotice('El pago quedó pendiente. Tu inscripción está guardada: puedes reintentarlo cuando quieras.');
        }
        fetch(`${API}/event-registrations/${returningId}?t=${encodeURIComponent(returningToken)}`)
            .then(r => r.json())
            .then(data => { if (!data?.error) setRegistration({ ...data, accessToken: returningToken }); })
            .catch(() => { /* la pantalla sigue usable */ });

        // Se vuelve de la pasarela, quizá en otro dispositivo o tras cerrar la
        // pestaña: si este navegador no tiene sesión de asistente, se canjea la
        // propiedad de la inscripción por una. Sin esto, «Ir a mi inscripción»
        // manda al formulario de ingreso a quien acaba de pagar.
        if (returningToken && !localStorage.getItem(ATTENDEE_TOKEN_KEY)) {
            fetch(`${API}/event-registrations/portal/claim`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ registrationId: returningId, accessToken: returningToken }),
            })
                .then(r => r.json())
                .then(body => { if (openAttendeeSession(body?.token)) setAttendeeSessionOpen(true); })
                .catch(() => { /* podrá entrar con su correo y contraseña */ });
        }
    }, [returningId, returningToken, paymentCancelled]);

    const category = useMemo(
        () => config?.categories.find(c => c.key === categoryKey) || null,
        [config, categoryKey]);

    // ── Catálogos del formulario (v4.708) ────────────────────────────
    //
    // Los distritos con sus clubes vienen del servidor, que es donde tienen su
    // fuente de verdad; los países y los departamentos los pone el navegador,
    // que ya los lleva. Los clubes viven DENTRO de cada distrito y no en un
    // mapa aparte con el nombre como llave: renombrar un distrito no puede
    // dejar su lista huérfana.
    const catalogs = useMemo<FormCatalogs>(() => ({
        districts: config?.catalogs?.districts || [],
        departments: DEPARTAMENTOS_COLOMBIA,
        countries: COUNTRIES.map(c => c.name),
    }), [config?.catalogs?.districts]);

    /**
     * Marcó «Mi club no está en la lista». Es estado DE LA PANTALLA: dice de
     * dónde salió el nombre, no cuál es, así que no se envía ni se guarda.
     */
    const [clubNotListed, setClubNotListed] = useState(false);

    /**
     * ¿Quedó abierta la sesión del asistente? Decide el TEXTO del recuadro
     * final, no el acceso: eso lo verifica el servidor en cada petición.
     */
    const [attendeeSessionOpen, setAttendeeSessionOpen] = useState(
        () => Boolean(localStorage.getItem(ATTENDEE_TOKEN_KEY)));

    /**
     * Con qué nace el formulario de la categoría elegida. Sólo rellena lo que
     * esté VACÍO: un borrador a medias o lo que la persona ya escribió manda
     * sobre el valor por defecto, igual que la precarga del perfil.
     */
    useEffect(() => {
        const defaults = (category as any)?.defaults;
        if (!defaults || !Object.keys(defaults).length) return;
        setAnswers(prev => {
            let changed = false;
            const next = { ...prev };
            for (const [key, value] of Object.entries(defaults as Record<string, string>)) {
                if (next[key] === undefined || next[key] === null || next[key] === '') {
                    next[key] = value;
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
    }, [category]);

    // ── Retomar un borrador guardado ─────────────────────────────────
    useEffect(() => {
        if (!category || !eventRef || returningId) return;
        try {
            const stored = localStorage.getItem(storageKey(eventRef, category.key));
            if (!stored) return;
            const parsed = JSON.parse(stored);
            if (!parsed?.id || !parsed?.accessToken) return;
            draftRef.current = { id: parsed.id, accessToken: parsed.accessToken };
            if (parsed.answers && Object.keys(parsed.answers).length) {
                setAnswers(a => (Object.keys(a).length ? a : parsed.answers));
                setCompanions(parsed.companions || []);
                setNotice('Retomamos el registro que habías empezado. Revisa los datos antes de continuar.');
            }
        } catch { /* un borrador ilegible no debe impedir empezar de nuevo */ }
    }, [category, eventRef, returningId]);

    // ── Pasos ────────────────────────────────────────────────────────
    const steps: FormStep[] = useMemo(() => {
        if (!category) return [];
        const base = [...category.form.steps];
        if (category.companions.allowed) {
            base.push({ key: 'companions', label: 'Acompañantes', fields: [] });
        }
        base.push({ key: 'summary', label: 'Resumen y pago', fields: [] });
        return base;
    }, [category]);

    const currentStep = steps[stepIndex] || null;

    // ── Autoguardado ─────────────────────────────────────────────────
    const persistDraft = useCallback(async () => {
        if (!category || !eventRef || !clubId) return;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(answers.email || ''))) return;
        setSavingDraft(true);
        try {
            const res = await fetch(`${API}/event-registrations/draft`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clubId, eventRef, categoryKey: category.key, answers, companions,
                    registrationId: draftRef.current?.id,
                    accessToken: draftRef.current?.accessToken,
                }),
            });
            const data = await res.json();
            if (res.ok && data?.id) {
                draftRef.current = { id: data.id, accessToken: data.accessToken };
                localStorage.setItem(storageKey(eventRef, category.key), JSON.stringify({
                    id: data.id, accessToken: data.accessToken, answers, companions,
                }));
            }
        } catch { /* el autoguardado nunca interrumpe al usuario */ } finally {
            setSavingDraft(false);
        }
    }, [category, eventRef, clubId, answers, companions]);

    useEffect(() => {
        if (!category || registration) return;
        const timer = setTimeout(persistDraft, 2500);
        return () => clearTimeout(timer);
    }, [answers, companions, category, registration, persistDraft]);

    // ── Navegación ───────────────────────────────────────────────────
    const setAnswer = (key: string, value: any) => {
        // «Mi club no está en la lista» no es un club: es la decisión de
        // escribirlo a mano. No entra en las respuestas.
        if (key === 'clubName' && value === CLUB_NOT_LISTED) {
            setClubNotListed(true);
            setAnswers(prev => ({ ...prev, clubName: '' }));
            return;
        }
        setAnswers(prev => {
            const next = { ...prev, [key]: value };
            // Cambiar de distrito descarta el club: el que estaba elegido era
            // del catálogo anterior y ahí ya no significa nada. Se retira
            // también la marca de «no está en la lista», porque el catálogo
            // nuevo puede tenerlo.
            if (key === 'district' && prev.district !== value) next.clubName = '';
            // Y cambiar de país descarta el departamento por lo mismo: el de
            // Colombia no es un estado de Brasil.
            if (key === 'country' && prev.country !== value) next.department = '';
            return next;
        });
        if (key === 'district') setClubNotListed(false);
        setFieldErrors(prev => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };

    const goTo = (index: number) => {
        setStepIndex(index);
        setMaxVisited(m => Math.max(m, index));
        setError('');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const nextStep = () => {
        if (!currentStep) return;
        if (currentStep.fields.length) {
            const errors = validateStep(currentStep.fields, answers);
            if (Object.keys(errors).length) {
                setFieldErrors(errors);
                setError('Revisa los campos marcados en rojo.');
                return;
            }
        }
        // No se avanza con las contraseñas incompletas o distintas: es el punto
        // donde todavía se ve el bloque y se puede corregir sin retroceder.
        if (currentStep.key === 'personal' && !registration && !usingExistingAccount
            && Object.keys(credentialErrors).length) {
            touchAllCredentials();
            setError(credentialErrors.passwordConfirm === 'Las contraseñas no coinciden.'
                ? 'Las contraseñas no coinciden.'
                : 'Crea la contraseña con la que consultarás tu inscripción.');
            return;
        }
        if (currentStep.key === 'companions' && category) {
            for (let i = 0; i < companions.length; i++) {
                const c = companions[i];
                const missing = !c.firstName?.trim() || !c.lastName?.trim()
                    || (category.companions.requireDocument && !c.documentNumber?.trim());
                if (missing) {
                    setError(`Faltan datos del acompañante ${i + 1}.`);
                    return;
                }
            }
        }
        setFieldErrors({});
        goTo(Math.min(stepIndex + 1, steps.length - 1));
    };

    // ── Envío y pago ─────────────────────────────────────────────────
    const startPayment = useCallback(async (id: string, accessToken: string) => {
        const res = await fetch(`${API}/event-registrations/${id}/checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ returnUrl: window.location.origin, accessToken }),
        });
        const data = await res.json();
        if (!res.ok || !data?.url) throw new Error(data?.error || 'No pudimos iniciar el pago.');
        window.location.href = data.url;
    }, []);

    const handleSubmit = async () => {
        if (!category || !eventRef) return;
        setError('');

        // Última comprobación antes de gastar un viaje de red: si las
        // contraseñas fallan se vuelve al paso donde se corrigen, en vez de
        // dejar el aviso al pie del resumen.
        if (!usingExistingAccount && Object.keys(credentialErrors).length) {
            touchAllCredentials();
            setError('Revisa la contraseña con la que consultarás tu inscripción.');
            const personalStep = steps.findIndex(s => s.key === 'personal');
            if (personalStep >= 0) goTo(personalStep);
            return;
        }

        setSubmitting(true);
        try {
            const identityToken = currentIdentityToken();
            const res = await fetch(`${API}/event-registrations`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // El servidor verifica firma y audiencia; aquí sólo se pasa.
                    ...(identityToken ? { Authorization: `Bearer ${identityToken}` } : {}),
                },
                body: JSON.stringify({
                    clubId, eventRef, categoryKey: category.key, answers, companions,
                    registrationId: draftRef.current?.id,
                    accessToken: draftRef.current?.accessToken,
                    // Van fuera de `answers`: el servidor guarda el hash, no el valor.
                    // Con cuenta existente no se manda ninguna: no hay que crearla.
                    password: usingExistingAccount ? undefined : credentials.password,
                    passwordConfirm: usingExistingAccount ? undefined : credentials.passwordConfirm,
                    returnUrl: window.location.origin,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                const credErrors: Record<string, string> = {};
                if (data?.fieldErrors) {
                    const { password, passwordConfirm, ...rest } = data.fieldErrors;
                    if (password) credErrors.password = password;
                    if (passwordConfirm) credErrors.passwordConfirm = passwordConfirm;
                    setFieldErrors(rest);
                    // Llevar a la persona al primer paso que tenga un error.
                    const firstBad = steps.findIndex(s => s.fields.some(f => rest[f.key]));
                    if (firstBad >= 0) goTo(firstBad);
                }
                if (Object.keys(credErrors).length || data?.accountExists) {
                    setServerCredentialErrors(credErrors);
                    touchAllCredentials();
                    const personalStep = steps.findIndex(s => s.key === 'personal');
                    if (personalStep >= 0) goTo(personalStep);
                }
                throw new Error(data?.error || 'No pudimos registrar tu inscripción.');
            }

            localStorage.removeItem(storageKey(eventRef, category.key));
            setCredentials({ password: '', passwordConfirm: '' });
            // La inscripción ABRE la sesión del asistente (v4.710). El servidor
            // acaba de comprobar la credencial —la creó o la verificó—, así que
            // pedir el ingreso a continuación era pedir dos veces lo mismo.
            if (openAttendeeSession(data?.account?.token)) setAttendeeSessionOpen(true);
            setRegistration(data);
            if (Number(data.chargeAmount) > 0) await startPayment(data.id, data.accessToken);
        } catch (err: any) {
            setError(err?.message || 'No pudimos registrar tu inscripción.');
        } finally {
            setSubmitting(false);
        }
    };

    const retryPayment = async () => {
        if (!registration) return;
        setError('');
        setSubmitting(true);
        try {
            await startPayment(registration.id, registration.accessToken || returningToken);
        } catch (err: any) {
            setError(err?.message || 'No pudimos iniciar el pago.');
            setSubmitting(false);
        }
    };

    // ── Piezas de la pantalla ────────────────────────────────────────
    const backToEvent = (
        <Link to={`/eventos/${eventRef}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-800">
            <ArrowLeft size={16} /> Volver al evento
        </Link>
    );

    const totals = useMemo(() => {
        if (!category) return null;
        const holder = category.price;
        const companionUnit = category.companions.allowed ? category.companions.price : 0;
        const companionsTotal = companionUnit * companions.length;
        const subtotal = holder + companionsTotal;
        // El recargo se calcula sobre el valor de la inscripción, con las tasas
        // que mandó el servidor para la moneda de ESTA categoría. Sin ellas
        // —bundle anterior, o el recargo apagado— el resumen se ve como antes.
        const quote = computeSurcharge(subtotal, category.surcharge, category.currency, 'event_registration');
        return { holder, companionUnit, companionsTotal, subtotal, total: quote.total, quote };
    }, [category, companions.length]);

    // El recargo de la inscripción YA guardada, para la pantalla de pago
    // pendiente. Se calcula sobre el importe congelado y con las tasas de su
    // categoría: mostrar ahí el valor sin recargo diría un número menor que el
    // que la persona va a ver en la pasarela.
    const pendingQuote = useMemo(() => {
        if (!registration || !(Number(registration.chargeAmount) > 0)) return null;
        const cat = config?.categories?.find(c => c.name === registration.categoryLabel)
            || (category?.name === registration.categoryLabel ? category : null);
        return computeSurcharge(
            Number(registration.chargeAmount),
            cat?.surcharge,
            registration.chargeCurrency,
            'event_registration',
        );
    }, [registration, config, category]);

    if (loading) {
        return (
            <div className="min-h-screen bg-rotary-concrete">
                <Navbar />
                <div className="flex min-h-[60vh] items-center justify-center">
                    <div className="text-center text-slate-500">
                        <Loader2 className="mx-auto mb-3 animate-spin" size={32} style={{ color: BLUE }} />
                        <p className="text-sm">Cargando el registro…</p>
                    </div>
                </div>
                <Footer />
            </div>
        );
    }

    const confirmed = registration && ['paid', 'confirmed', 'accredited', 'attended'].includes(registration.status);
    const awaitingPayment = registration && !confirmed;

    return (
        <div className="min-h-screen bg-rotary-concrete">
            <Navbar />

            <header style={PAGE_HEADER_BACKGROUND} className="px-4 py-8 text-white sm:px-6 sm:py-10">
                <div className="mx-auto max-w-4xl text-center sm:text-left">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">
                        Inscripción{config?.edition?.editionNumber ? ` · Edición ${config.edition.editionNumber}` : ''}
                    </p>
                    <h1 className="mt-1.5 text-2xl font-bold leading-tight sm:text-3xl">{config?.event?.title}</h1>
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-white/85 sm:justify-start">
                        {config?.event?.startDate && (
                            <span className="flex items-center gap-1.5">
                                <CalendarDays size={14} />
                                {new Date(config.event.startDate).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}
                            </span>
                        )}
                        {(config?.edition?.venue || config?.event?.location) && (
                            <span className="flex items-center gap-1.5">
                                <MapPin size={14} /> {config?.edition?.venue || config?.event?.location}
                            </span>
                        )}
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
                {error && (
                    <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        <AlertCircle size={17} className="mt-0.5 shrink-0" /> <span>{error}</span>
                    </div>
                )}
                {notice && !confirmed && (
                    <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <AlertCircle size={17} className="mt-0.5 shrink-0" /> <span>{notice}</span>
                    </div>
                )}

                {/* ── Confirmada ───────────────────────────────────── */}
                {confirmed ? (
                    <section className="rounded-2xl bg-white p-7 text-center shadow-sm sm:p-10">
                        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
                            <CheckCircle2 size={38} className="text-emerald-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900">¡Inscripción confirmada!</h2>
                        <p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-slate-600">
                            Enviamos el comprobante a <strong>{registration!.email}</strong>.
                            {config?.successMessage ? ` ${config.successMessage}` : ''}
                        </p>
                        <div className="mx-auto mt-6 max-w-sm rounded-xl bg-slate-50 px-5 py-4 text-left">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                Código de inscripción
                            </p>
                            <p className="font-mono text-2xl font-bold" style={{ color: BLUE }}>
                                {registration!.registrationCode || registration!.publicRef}
                            </p>
                            <p className="mt-2 text-sm text-slate-600">{registration!.categoryLabel}</p>
                            {registration!.baseAmount > 0 && (
                                <p className="text-sm text-slate-600">
                                    {money(registration!.baseAmount, registration!.baseCurrency)}
                                    {registration!.chargeCurrency !== registration!.baseCurrency && (
                                        <span className="text-slate-400">
                                            {' '}· cobrado {money(registration!.chargeAmount, registration!.chargeCurrency)}
                                        </span>
                                    )}
                                </p>
                            )}
                            {registration!.companionsCount > 0 && (
                                <p className="text-sm text-slate-600">{registration!.companionsCount} acompañante(s)</p>
                            )}
                        </div>
                        <p className="mt-5 text-xs text-slate-400">
                            Presenta este código el día del evento para recoger tu escarapela.
                        </p>

                        {/* Acceso al panel del asistente. La inscripción ya
                            dejó la sesión abierta (v4.710), así que el botón
                            entra directo; el correo se nombra para la próxima
                            vez, no para volver a entrar ahora. */}
                        <div className="mx-auto mt-7 max-w-md rounded-xl border border-slate-200 bg-slate-50 p-5 text-left">
                            <p className="flex items-center gap-2 text-sm font-bold text-slate-700">
                                <LayoutDashboard size={16} className="text-slate-400" /> Tu panel de asistente
                            </p>
                            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
                                {attendeeSessionOpen
                                    ? <>Ya estás dentro: entra cuando quieras a consultar el estado de tu inscripción,
                                        tu código y tu comprobante. La próxima vez, con <strong>{registration!.email}</strong> y
                                        la contraseña que creaste.</>
                                    : <>Con <strong>{registration!.email}</strong> y la contraseña que creaste puedes
                                        consultar cuando quieras el estado de tu inscripción, tu código y tu comprobante.</>}
                            </p>
                            <Link to={ATTENDEE_PATH}
                                className="mt-3 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
                                style={{ background: BLUE }}>
                                Ir a mi inscripción <ArrowRight size={15} />
                            </Link>
                        </div>

                        <div className="mt-7">{backToEvent}</div>
                    </section>
                ) : awaitingPayment ? (
                    /* ── Pago pendiente ───────────────────────────── */
                    <section className="rounded-2xl bg-white p-7 shadow-sm sm:p-9">
                        <h2 className="text-xl font-bold text-slate-900">Pago pendiente</h2>
                        <p className="mt-2 text-sm leading-relaxed text-slate-600">
                            Tu inscripción <strong>{registration!.publicRef}</strong> está guardada. Si ya pagaste,
                            la confirmación la da nuestro sistema de pagos y puede tardar unos segundos: recarga
                            esta página en un momento.
                        </p>
                        <div className="mt-5 rounded-xl bg-slate-50 px-5 py-4">
                            <p className="text-sm text-slate-600">{registration!.categoryLabel}</p>
                            {pendingQuote && pendingQuote.lines.length > 0 && (
                                <div className="mb-2 mt-1 space-y-1">
                                    <div className="flex justify-between text-sm text-slate-600">
                                        <span>Inscripción</span>
                                        <span>{money(pendingQuote.base, registration!.chargeCurrency)}</span>
                                    </div>
                                    {pendingQuote.lines.map(line => (
                                        <div key={line.key} className="flex justify-between gap-4 text-sm text-slate-600">
                                            <span>{line.label} <span className="text-slate-400">({percentLabel(line.percent)})</span></span>
                                            <span>{money(line.amount, registration!.chargeCurrency)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <p className="text-2xl font-bold" style={{ color: BLUE }}>
                                {money(pendingQuote?.total ?? registration!.chargeAmount, registration!.chargeCurrency)}
                            </p>
                            {registration!.chargeCurrency !== registration!.baseCurrency && (
                                <p className="mt-1 text-xs text-slate-500">
                                    Valor publicado: {money(registration!.baseAmount, registration!.baseCurrency)}
                                    {registration!.fxRate ? ` · tasa ${registration!.fxRate.toLocaleString(locale, { maximumFractionDigits: 6 })}` : ''}
                                </p>
                            )}
                        </div>
                        <button onClick={retryPayment} disabled={submitting}
                            className="mt-6 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
                            style={{ background: BLUE }}>
                            {submitting ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />} Pagar ahora
                        </button>
                        <div className="mt-6">{backToEvent}</div>
                    </section>
                ) : !config?.enabled || config?.closed ? (
                    /* ── Cerrado ──────────────────────────────────── */
                    <section className="rounded-2xl bg-white p-10 text-center shadow-sm">
                        <Clock className="mx-auto mb-4" size={40} style={{ color: BLUE }} />
                        <h2 className="mb-2 text-2xl font-bold text-slate-900">
                            {config?.closed ? 'Inscripciones cerradas' : 'Inscripciones no disponibles'}
                        </h2>
                        <p className="text-slate-600">
                            {config?.closed
                                ? 'El plazo de inscripción para este evento ya terminó. Escríbenos si necesitas más información.'
                                : 'En este momento no estamos recibiendo inscripciones para este evento.'}
                        </p>
                        <div className="mt-7">{backToEvent}</div>
                    </section>
                ) : !category ? (
                    /* ── Paso 1: categoría ────────────────────────── */
                    <section className="space-y-4">
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">¿Cómo participas en la feria?</h2>
                            <p className="mt-1 text-sm text-slate-500">
                                Elige tu categoría. De ella dependen el formulario, el valor y los beneficios incluidos.
                            </p>
                        </div>
                        {config.categories.map(c => (
                            <button key={c.key} type="button" disabled={!c.open}
                                onClick={() => { setCategoryKey(c.key); goTo(0); }}
                                className={`w-full rounded-2xl border-2 bg-white p-6 text-left transition ${c.open
                                    ? 'border-slate-200 hover:border-blue-400 hover:shadow-md'
                                    : 'cursor-not-allowed border-slate-200 opacity-60'}`}>
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="flex-1">
                                        <h3 className="text-lg font-bold text-slate-900">{c.name}</h3>
                                        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{c.description}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-2xl font-bold" style={{ color: BLUE }}>
                                            {c.price > 0 ? money(c.price, c.currency) : 'Sin costo'}
                                        </p>
                                        {c.charge.converted && (
                                            <p className="text-xs text-slate-400">
                                                se cobra {money(c.charge.amount, c.charge.currency)}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {c.benefits.length > 0 && (
                                    <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
                                        {c.benefits.map(b => (
                                            <li key={b} className="flex items-start gap-1.5 text-xs text-slate-600">
                                                <Check size={13} className="mt-0.5 shrink-0" style={{ color: GOLD }} /> {b}
                                            </li>
                                        ))}
                                    </ul>
                                )}

                                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
                                    {c.companions.allowed && (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 font-semibold text-indigo-700">
                                            <Users size={11} /> Hasta {c.companions.max} acompañante(s)
                                        </span>
                                    )}
                                    {c.remaining !== null && c.remaining <= 20 && c.remaining > 0 && (
                                        <span className="font-semibold text-amber-700">Quedan {c.remaining} cupos</span>
                                    )}
                                    {c.soldOut && <span className="font-bold uppercase tracking-wide text-red-600">Agotada</span>}
                                    {!c.open && !c.soldOut && (
                                        <span className="font-semibold text-slate-500">
                                            {c.closedReason === 'not_yet' ? `Abre el ${c.opensAt}` : 'Cerrada'}
                                        </span>
                                    )}
                                </div>
                            </button>
                        ))}
                        <div className="pt-2">{backToEvent}</div>
                    </section>
                ) : (
                    /* ── Pasos del formulario ─────────────────────── */
                    <div className="space-y-5">
                        {/* Barra de pasos */}
                        <nav className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-2xl bg-white p-4 shadow-sm">
                            {lockedCategory ? (
                                // Categoría fijada desde la ficha: se muestra, no se cambia.
                                // Para elegir otra hay que volver al evento.
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">
                                    <Lock size={11} /> {category.name}
                                </span>
                            ) : (
                                <button type="button" onClick={() => { setCategoryKey(''); setStepIndex(0); setMaxVisited(0); }}
                                    className="text-xs font-semibold text-slate-400 hover:text-slate-700">
                                    {category.name} ✕
                                </button>
                            )}
                            <span className="text-slate-300">|</span>
                            {steps.map((s, i) => (
                                <button key={s.key} type="button" disabled={i > maxVisited}
                                    onClick={() => i <= maxVisited && goTo(i)}
                                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${i === stepIndex
                                        ? 'text-white'
                                        : i < stepIndex || i <= maxVisited
                                            ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                            : 'text-slate-300'}`}
                                    style={i === stepIndex ? { background: BLUE } : undefined}>
                                    {i + 1}. {s.label}
                                </button>
                            ))}
                            {savingDraft && (
                                <span className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-400">
                                    <Loader2 size={11} className="animate-spin" /> Guardando…
                                </span>
                            )}
                        </nav>

                        {/* Campos del paso */}
                        {currentStep && currentStep.fields.length > 0 && (
                            <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-9">
                                <StepProgress step={stepIndex + 1} total={steps.length} title={currentStep.label} />
                                <div className="grid gap-5 sm:grid-cols-2">
                                    {/* v4.708 — Los pasos traen `groups` con un
                                        subtítulo por bloque (Ubicación, Tu club
                                        en Rotary). Es aditivo: un paso sin
                                        grupos se dibuja como siempre. */}
                                    {(currentStep.groups?.length
                                        ? currentStep.groups
                                        : [{ key: currentStep.key, label: '', fields: currentStep.fields }]
                                    ).map(group => {
                                        const visible = group.fields.filter(f => isFieldVisible(f, answers));
                                        if (!visible.length) return null;
                                        const campos = visible.map(f => (
                                            <DynamicField key={f.key} field={f}
                                                value={answers[f.key]} error={fieldErrors[f.key]}
                                                answers={answers} catalogs={catalogs}
                                                onChange={v => setAnswer(f.key, v)}
                                                onClear={f.key === 'clubName' && clubNotListed
                                                    ? () => setClubNotListed(false)
                                                    : undefined} />
                                        ));
                                        // Un bloque de tres campos tiene su PROPIA rejilla y ocupa
                                        // el ancho completo, igual que en Postular Proyecto: así los
                                        // tres caben en una fila en vez de dejar el tercero colgando
                                        // bajo el primero. Los de dos columnas se disuelven en la
                                        // rejilla del paso (`contents`), que es la que ya tenían.
                                        if (group.columns === 3) {
                                            return (
                                                <div key={group.key} className="sm:col-span-2">
                                                    {group.label && (
                                                        <h3 className="mb-5 mt-2 border-b border-slate-200 pb-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">
                                                            {group.label}
                                                        </h3>
                                                    )}
                                                    <div className="grid gap-5 sm:grid-cols-3">{campos}</div>
                                                </div>
                                            );
                                        }
                                        return (
                                            <div key={group.key} className="contents">
                                                {group.label && (
                                                    <h3 className="sm:col-span-2 mt-2 border-b border-slate-200 pb-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">
                                                        {group.label}
                                                    </h3>
                                                )}
                                                {campos}
                                            </div>
                                        );
                                    })}

                                    {/* ── Caso 1: ya tiene sesión ──────────
                                        El servidor reconoció el token del
                                        navegador. No se le vuelve a pedir
                                        correo, contraseña ni datos que ya
                                        conocemos: se le dice con qué cuenta va
                                        a quedar su inscripción y sigue. */}
                                    {currentStep.key === 'personal' && !registration && usingExistingAccount && identity && (
                                        <div className="sm:col-span-2">
                                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                                                <p className="flex items-center gap-2 text-sm font-bold text-emerald-900">
                                                    <UserCheck size={16} /> Has iniciado sesión como {identity.name}
                                                </p>
                                                <p className="mt-1.5 text-[13px] leading-relaxed text-emerald-800">
                                                    Tu registro al evento utilizará esta cuenta, así que no necesitas
                                                    crear otra contraseña.
                                                </p>
                                                <dl className="mt-3 space-y-1 text-[13px] text-emerald-900">
                                                    <div className="flex gap-2">
                                                        <dt className="font-semibold">Correo:</dt>
                                                        <dd>{identity.email}</dd>
                                                    </div>
                                                    {identity.organization && (
                                                        <div className="flex gap-2">
                                                            <dt className="font-semibold">Organización:</dt>
                                                            <dd>{identity.organization}</dd>
                                                        </div>
                                                    )}
                                                    <div className="flex gap-2">
                                                        <dt className="font-semibold">Cuenta:</dt>
                                                        <dd>{identity.roleLabel}</dd>
                                                    </div>
                                                </dl>
                                                <button type="button" onClick={openLoginAndReturn}
                                                    className="mt-3 text-[13px] font-semibold text-emerald-800 underline hover:text-emerald-900">
                                                    Ingresar con otra cuenta
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* ── Caso 2: sin sesión, pero puede tenerla
                                        Se ofrece antes de que empiece a inventar
                                        una contraseña que quizá ya tiene. */}
                                    {currentStep.key === 'personal' && !registration && !usingExistingAccount && linkingAllowed && (
                                        <div className="sm:col-span-2">
                                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                                                    <LogIn size={15} className="text-slate-400" /> ¿Ya tienes una cuenta?
                                                </p>
                                                <p className="mb-3 text-[13px] leading-relaxed text-slate-500">
                                                    Si anteriormente postulaste un proyecto o eres un gestor de proyectos
                                                    registrado, puedes ingresar con tu cuenta para inscribirte al evento
                                                    sin crear una nueva contraseña.
                                                </p>
                                                <button type="button" onClick={openLoginAndReturn}
                                                    className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
                                                    style={{ background: BLUE }}>
                                                    <LogIn size={15} /> Iniciar sesión
                                                </button>
                                                {!linkingRequired && (
                                                    <p className="mt-3 text-[13px] text-slate-500">
                                                        ¿No tienes cuenta? Sigue llenando el formulario y creamos una
                                                        contigo más abajo.
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* ── Caso 3: usuario nuevo ────────────
                                        El flujo de siempre. Mismo bloque, mismo
                                        texto y misma jerarquía que en Postular
                                        Proyecto: la cuenta se crea con la
                                        inscripción, no después del pago. La
                                        contraseña NO entra en `answers`, así que
                                        nunca se guarda con las respuestas ni en
                                        el borrador local. */}
                                    {currentStep.key === 'personal' && !registration && !usingExistingAccount && !linkingRequired && (
                                        <div className="sm:col-span-2">
                                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                                                    <KeyRound size={15} className="text-slate-400" /> Crea tu clave de acceso
                                                </p>
                                                <p className="mb-4 text-[13px] leading-relaxed text-slate-500">
                                                    Con este correo y tu contraseña entrarás a tu panel de asistente para
                                                    consultar el estado de tu inscripción al evento, tu código y tu
                                                    comprobante. Podrás volver cuantas veces necesites.
                                                </p>
                                                <div className="grid gap-4 sm:grid-cols-2">
                                                    <Field
                                                        label="Contraseña" name="password" type="password" revealable
                                                        value={credentials.password}
                                                        onChange={(e: any) => setCredential('password', e.target.value)}
                                                        onBlur={() => touchCredential('password')}
                                                        error={credentialErrors.password}
                                                        touched={credentialsTouched.password}
                                                        placeholder="Mínimo 8 caracteres"
                                                    />
                                                    <Field
                                                        label="Repite la contraseña" name="passwordConfirm" type="password" revealable
                                                        value={credentials.passwordConfirm}
                                                        onChange={(e: any) => setCredential('passwordConfirm', e.target.value)}
                                                        onBlur={() => touchCredential('passwordConfirm')}
                                                        error={credentialErrors.passwordConfirm}
                                                        touched={credentialsTouched.passwordConfirm}
                                                        placeholder="Escríbela de nuevo"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </section>
                        )}

                        {/* Acompañantes */}
                        {currentStep?.key === 'companions' && (
                            <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-9">
                                <h2 className="text-lg font-bold text-slate-900">Acompañantes</h2>
                                <p className="mt-1 text-sm text-slate-500">
                                    Puedes registrar hasta {category.companions.max}.
                                    {category.companions.price > 0 && (
                                        <> Cada uno agrega {money(category.companions.price, category.companions.currency)} al total.</>
                                    )}
                                </p>

                                <div className="mt-5 space-y-4">
                                    {companions.map((c, i) => (
                                        <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                                            <div className="mb-3 flex items-center justify-between">
                                                <p className="text-sm font-bold text-slate-700">Acompañante {i + 1}</p>
                                                <button type="button"
                                                    onClick={() => setCompanions(list => list.filter((_, ix) => ix !== i))}
                                                    className="rounded-lg p-1.5 text-red-500 transition hover:bg-red-50">
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                            <div className="grid gap-4 sm:grid-cols-2">
                                                {([
                                                    ['firstName', 'Nombres', true],
                                                    ['lastName', 'Apellidos', true],
                                                    ['documentNumber', 'Documento o pasaporte', category.companions.requireDocument],
                                                    ['relationship', 'Parentesco o relación', false],
                                                    ['email', 'Correo electrónico', false],
                                                    ['phone', 'Teléfono', false],
                                                ] as [keyof Companion, string, boolean][]).map(([key, label, required]) => (
                                                    <div key={key}>
                                                        <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                                                            {label}{required && <span className="text-red-500"> *</span>}
                                                        </label>
                                                        <input type={key === 'email' ? 'email' : 'text'}
                                                            value={(c[key] as string) || ''}
                                                            onChange={e => setCompanions(list =>
                                                                list.map((item, ix) => ix === i ? { ...item, [key]: e.target.value } : item))}
                                                            className={controlCls(false)} />
                                                    </div>
                                                ))}
                                                <div className="sm:col-span-2">
                                                    <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                                                        Necesidades alimentarias u observaciones
                                                    </label>
                                                    <input type="text" value={c.notes || ''}
                                                        onChange={e => setCompanions(list =>
                                                            list.map((item, ix) => ix === i ? { ...item, notes: e.target.value } : item))}
                                                        className={controlCls(false)} />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {companions.length < category.companions.max && (
                                    <button type="button" onClick={() => setCompanions(list => [...list, emptyCompanion()])}
                                        className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:underline">
                                        <Plus size={15} /> Agregar acompañante
                                    </button>
                                )}
                                {companions.length === 0 && (
                                    <p className="mt-4 text-sm text-slate-400">
                                        Si asistes sin acompañantes, continúa al siguiente paso.
                                    </p>
                                )}
                            </section>
                        )}

                        {/* Resumen */}
                        {currentStep?.key === 'summary' && totals && (
                            <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-9">
                                <h2 className="text-lg font-bold text-slate-900">Resumen de tu inscripción</h2>

                                <dl className="mt-5 divide-y divide-slate-100">
                                    {[
                                        ['Categoría', category.name],
                                        ['Participante', `${answers.firstName || ''} ${answers.lastName || ''}`.trim()],
                                        ['Correo', answers.email],
                                        ['Club', answers.clubName],
                                        ['Distrito', answers.district],
                                        ['País', answers.country],
                                        companions.length ? ['Acompañantes', String(companions.length)] : null,
                                    ].filter(Boolean).map(pair => {
                                        const [label, value] = pair as [string, string];
                                        return value ? (
                                            <div key={label} className="flex justify-between gap-4 py-2.5 text-sm">
                                                <dt className="text-slate-500">{label}</dt>
                                                <dd className="text-right font-semibold text-slate-900">{value}</dd>
                                            </div>
                                        ) : null;
                                    })}
                                </dl>

                                <div className="mt-5 rounded-xl bg-slate-50 p-5">
                                    <div className="flex justify-between text-sm text-slate-600">
                                        <span>Inscripción ({category.name})</span>
                                        <span className="font-semibold">{money(totals.holder, category.currency)}</span>
                                    </div>
                                    {companions.length > 0 && totals.companionUnit > 0 && (
                                        <div className="mt-1.5 flex justify-between text-sm text-slate-600">
                                            <span>{companions.length} acompañante(s) × {money(totals.companionUnit, category.companions.currency)}</span>
                                            <span className="font-semibold">{money(totals.companionsTotal, category.currency)}</span>
                                        </div>
                                    )}
                                    {/* ⚠️ EL RECARGO SE MUESTRA ANTES DE PAGAR, línea por
                                        línea y con su porcentaje. Es lo que hace legítimo
                                        que el total sea mayor que el valor anunciado: un
                                        cobro de más sin explicar se lee como un error del
                                        sistema. El importe que de verdad se cobra lo
                                        calcula el servidor al abrir el pago. */}
                                    {totals.quote.lines.length > 0 && (
                                        <>
                                            <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-sm text-slate-600">
                                                <span>Subtotal</span>
                                                <span className="font-semibold">{money(totals.subtotal, category.currency)}</span>
                                            </div>
                                            {totals.quote.lines.map(line => (
                                                <div key={line.key} className="mt-1.5 flex justify-between gap-4 text-sm text-slate-600">
                                                    <span>{line.label} <span className="text-slate-400">({percentLabel(line.percent)})</span></span>
                                                    <span className="font-semibold">{money(line.amount, category.currency)}</span>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                    <div className="mt-3 flex items-end justify-between border-t border-slate-200 pt-3">
                                        <span className="text-sm font-bold text-slate-700">Total a pagar</span>
                                        <span className="text-2xl font-bold" style={{ color: BLUE }}>
                                            {totals.total > 0 ? money(totals.total, category.currency) : 'Sin costo'}
                                        </span>
                                    </div>
                                    {category.charge.converted && totals.total > 0 && (
                                        <p className="mt-2 text-xs leading-relaxed text-slate-500">
                                            El cobro se procesa en {category.charge.currency} a la tasa vigente del evento.
                                            En tu extracto verás el valor convertido; en el comprobante quedan registrados
                                            el valor en {category.currency}, el convertido y la tasa aplicada.
                                        </p>
                                    )}
                                </div>

                                <button type="button" onClick={handleSubmit} disabled={submitting}
                                    className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-7 py-3.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60 sm:w-auto"
                                    style={{ background: BLUE }}>
                                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                                    {totals.total > 0 ? 'Continuar al pago' : 'Confirmar inscripción'}
                                </button>

                                {totals.total > 0 && (
                                    <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-500">
                                        <ShieldCheck size={14} /> Pago seguro procesado por Stripe. La inscripción se
                                        confirma cuando el pago se aprueba.
                                    </p>
                                )}
                            </section>
                        )}

                        {/* Navegación entre pasos */}
                        <div className="flex items-center justify-between gap-3">
                            <button type="button"
                                onClick={() => {
                                    if (stepIndex > 0) return goTo(stepIndex - 1);
                                    // En el primer paso, "Atrás" sale del formulario: al
                                    // selector si se entró por él, o a la ficha del evento
                                    // si se entró por uno de sus botones.
                                    if (lockedCategory) navigate(eventUrl);
                                    else setCategoryKey('');
                                }}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                                <ArrowLeft size={15} /> {stepIndex === 0 && lockedCategory ? 'Cambiar categoría' : 'Atrás'}
                            </button>
                            {currentStep?.key !== 'summary' && (
                                <button type="button" onClick={nextStep}
                                    className="inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
                                    style={{ background: BLUE }}>
                                    Continuar <ArrowRight size={15} />
                                </button>
                            )}
                        </div>

                        <div>{backToEvent}</div>
                    </div>
                )}
            </main>

            <Footer />
        </div>
    );
};

export default RegistroEvento;
