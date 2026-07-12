import {
    Globe2, Heart, Users, HandHeart, Gift, Award, Sparkles, DollarSign,
    ShieldCheck, Star, Trophy, HeartHandshake, Landmark, Handshake,
    type LucideIcon,
} from 'lucide-react';

// ── Tipos ───────────────────────────────────────────────────────────────────
// Un "bloque de pago" es una tarjeta configurable de la página de Aportes.
// kind determina el tipo de ítem que se agrega al carrito.
export type PaymentBlockKind = 'donation' | 'aporte' | 'membership';

// Periodicidades de cobro recurrente (membresías). El socio elige una.
export type RecurringIntervalKey = 'month' | 'quarter' | 'semiannual' | 'year';
export interface RecurringInterval { key: RecurringIntervalKey; amount: number; }

export const RECURRING_INTERVAL_LABELS: Record<RecurringIntervalKey, string> = {
    month: 'Mensual',
    quarter: 'Trimestral',
    semiannual: 'Semestral',
    year: 'Anual',
};
export const RECURRING_INTERVAL_ORDER: RecurringIntervalKey[] = ['month', 'quarter', 'semiannual', 'year'];

export interface PaymentBlock {
    id: string;
    enabled: boolean;
    kind: PaymentBlockKind;
    title: string;
    description: string;
    icon: string;            // clave en BLOCK_ICONS
    theme: string;           // clave en BLOCK_THEMES
    presetAmounts: number[]; // montos sugeridos (chips)
    allowCustom: boolean;    // permitir "otro monto"
    defaultAmount?: number;  // monto preseleccionado
    showMessage: boolean;    // campo de mensaje/dedicatoria
    showAnonymous: boolean;  // opción "aportar como anónimo"
    buttonText: string;
    benefits: string[];      // lista opcional de beneficios (ideal para membresía)
    campaign?: string;       // etiqueta de campaña (metadata)
    // Cobro recurrente (solo aplica a kind === 'membership').
    recurring: boolean;
    recurringIntervals: RecurringInterval[];
}

// ── Registro de iconos ───────────────────────────────────────────────────────
export const BLOCK_ICONS: Record<string, LucideIcon> = {
    globe: Globe2,
    heart: Heart,
    users: Users,
    handheart: HandHeart,
    handshake: Handshake,
    hearthandshake: HeartHandshake,
    gift: Gift,
    award: Award,
    trophy: Trophy,
    star: Star,
    sparkles: Sparkles,
    dollar: DollarSign,
    shield: ShieldCheck,
    landmark: Landmark,
};

export const BLOCK_ICON_KEYS = Object.keys(BLOCK_ICONS);

export const getBlockIcon = (key: string): LucideIcon => BLOCK_ICONS[key] || Heart;

// ── Registro de temas de color ───────────────────────────────────────────────
// bubble: fondo+color del ícono. button: botón sólido del CTA.
export interface BlockTheme { label: string; bubble: string; button: string; ring: string; }

export const BLOCK_THEMES: Record<string, BlockTheme> = {
    blue: { label: 'Azul Rotario', bubble: 'bg-rotary-blue/10 text-rotary-blue', button: 'bg-rotary-blue hover:bg-sky-800 shadow-rotary-blue/20', ring: 'border-rotary-blue bg-rotary-blue/5 text-rotary-blue' },
    sky: { label: 'Celeste', bubble: 'bg-sky-50 text-sky-500', button: 'bg-sky-500 hover:bg-sky-600 shadow-sky-500/20', ring: 'border-sky-500 bg-sky-50 text-sky-600' },
    rose: { label: 'Rosa', bubble: 'bg-rose-50 text-rose-500', button: 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20', ring: 'border-rose-500 bg-rose-50 text-rose-600' },
    emerald: { label: 'Verde', bubble: 'bg-emerald-50 text-emerald-500', button: 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20', ring: 'border-emerald-500 bg-emerald-50 text-emerald-600' },
    amber: { label: 'Dorado', bubble: 'bg-amber-50 text-amber-500', button: 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20', ring: 'border-amber-500 bg-amber-50 text-amber-600' },
    violet: { label: 'Violeta', bubble: 'bg-violet-50 text-violet-500', button: 'bg-violet-500 hover:bg-violet-600 shadow-violet-500/20', ring: 'border-violet-500 bg-violet-50 text-violet-600' },
};

export const BLOCK_THEME_KEYS = Object.keys(BLOCK_THEMES);

export const getBlockTheme = (key: string): BlockTheme => BLOCK_THEMES[key] || BLOCK_THEMES.blue;

// El tipo de ítem del carrito según el kind del bloque.
export const cartTypeForKind = (kind: PaymentBlockKind): 'donation' | 'membership' =>
    kind === 'membership' ? 'membership' : 'donation';

export const KIND_LABELS: Record<PaymentBlockKind, string> = {
    donation: 'Donación',
    aporte: 'Aporte voluntario',
    membership: 'Membresía / Cuota',
};

// ── Bloques por defecto (equivalen a los 3 fijos actuales) ────────────────────
// Se usan como semilla en el editor y como respaldo público si no hay guardados.
// Los textos pueden usar {club}, que se reemplaza por el nombre del club al renderizar.
export const DEFAULT_PAYMENT_BLOCKS: PaymentBlock[] = [
    {
        id: 'aporte-voluntario',
        enabled: true,
        kind: 'aporte',
        title: 'Aporte Voluntario',
        description: 'Hoy, reafirmemos nuestra cultura de donación y apoyo a la Fundación Rotaria 💙🤝. Cada contribución es una semilla de esperanza 🌱 que transforma vidas y construye comunidades más fuertes y saludables. ✨\n\nSigamos siendo un ejemplo de generosidad y servicio, porque ¡dar de nosotros mismos es el motor del cambio! 🙌🌟\n\n📑 Importante: todo aporte genera un certificado tributario a nombre del donante, que podrá usarse para beneficios fiscales según la normativa vigente.',
        icon: 'handheart',
        theme: 'sky',
        presetAmounts: [],
        allowCustom: true,
        showMessage: true,
        showAnonymous: true,
        buttonText: 'Aportar',
        benefits: [],
        campaign: 'Aporte Voluntario',
        recurring: false,
        recurringIntervals: [],
    },
    {
        id: 'membresia-rotaria',
        enabled: true,
        kind: 'membership',
        title: 'Membresía Rotaria',
        description: 'Como socio activo de {club} eres parte esencial del motor que impulsa nuestros proyectos de servicio y mantienes viva la misión rotaria de generar cambios positivos y sostenibles en la comunidad. 🌍✨',
        icon: 'users',
        theme: 'emerald',
        presetAmounts: [],
        allowCustom: false,
        showMessage: false,
        showAnonymous: false,
        buttonText: 'Suscribirme',
        benefits: [
            'Apoyas proyectos sociales, educativos y ambientales.',
            'Contribuyes a iniciativas locales y globales de Rotary.',
            'Vives experiencias de amistad y liderazgo.',
            'Eres embajador de los valores rotarios.',
        ],
        campaign: 'Membresía Rotaria',
        recurring: true,
        recurringIntervals: [
            { key: 'month', amount: 120000 },
            { key: 'quarter', amount: 360000 },
            { key: 'semiannual', amount: 720000 },
            { key: 'year', amount: 1440000 },
        ],
    },
    {
        id: 'end-polio',
        enabled: true,
        kind: 'donation',
        title: 'Erradicación a la Polio',
        description: 'Hoy reafirmemos nuestra cultura de donación y compromiso con la erradicación de la polio 🤝. Cada contribución es una semilla de esperanza 🌱 que impulsa las campañas de vacunación, protege a los niños del mundo y nos acerca a un planeta libre de esta enfermedad. 💉🌍\n\nCon cada aporte fortalecemos la labor de La Fundación Rotaria y de {club} en su misión de poner fin a la poliomielitis para siempre. 💪🌟',
        icon: 'globe',
        theme: 'rose',
        presetAmounts: [],
        allowCustom: true,
        showMessage: true,
        showAnonymous: true,
        buttonText: 'Aportar',
        benefits: [],
        campaign: 'End Polio Now',
        recurring: false,
        recurringIntervals: [],
    },
];

// Normaliza/parcha un bloque venido del backend para tolerar campos faltantes.
export const normalizeBlock = (b: Partial<PaymentBlock>, idx = 0): PaymentBlock => ({
    id: b.id || `block-${idx}`,
    enabled: b.enabled !== false,
    kind: (b.kind as PaymentBlockKind) || 'donation',
    title: b.title || 'Nuevo bloque',
    description: b.description || '',
    icon: b.icon || 'heart',
    theme: b.theme || 'blue',
    presetAmounts: Array.isArray(b.presetAmounts) ? b.presetAmounts.filter(n => typeof n === 'number' && n > 0) : [],
    allowCustom: b.allowCustom !== false,
    defaultAmount: typeof b.defaultAmount === 'number' ? b.defaultAmount : undefined,
    showMessage: b.showMessage !== false,
    showAnonymous: !!b.showAnonymous,
    buttonText: b.buttonText || 'Aportar',
    benefits: Array.isArray(b.benefits) ? b.benefits.filter(Boolean) : [],
    campaign: b.campaign || undefined,
    recurring: !!b.recurring,
    recurringIntervals: Array.isArray(b.recurringIntervals)
        ? b.recurringIntervals
            .filter((r: any) => r && RECURRING_INTERVAL_ORDER.includes(r.key) && typeof r.amount === 'number' && r.amount > 0)
            .map((r: any) => ({ key: r.key as RecurringIntervalKey, amount: r.amount }))
        : [],
});

export const resolvePaymentBlocks = (raw: any): PaymentBlock[] => {
    if (Array.isArray(raw) && raw.length > 0) return raw.map((b, i) => normalizeBlock(b, i));
    return DEFAULT_PAYMENT_BLOCKS;
};
