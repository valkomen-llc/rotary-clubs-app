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
export const DEFAULT_PAYMENT_BLOCKS: PaymentBlock[] = [
    {
        id: 'end-polio',
        enabled: true,
        kind: 'donation',
        title: 'End Polio Now',
        description: 'Únete a la campaña histórica de Rotary International para erradicar la polio en todo el mundo.',
        icon: 'globe',
        theme: 'rose',
        presetAmounts: [10, 25, 50, 100],
        allowCustom: true,
        defaultAmount: 50,
        showMessage: true,
        showAnonymous: true,
        buttonText: 'Agregar al carrito',
        benefits: [],
        campaign: 'End Polio Now',
        recurring: false,
        recurringIntervals: [],
    },
    {
        id: 'aporte-club',
        enabled: true,
        kind: 'aporte',
        title: 'Aporte al Club',
        description: 'Apoya directamente los proyectos locales y las iniciativas de servicio del club.',
        icon: 'heart',
        theme: 'sky',
        presetAmounts: [20, 50],
        allowCustom: true,
        showMessage: true,
        showAnonymous: true,
        buttonText: 'Agregar al carrito',
        benefits: [],
        campaign: 'Club General',
        recurring: false,
        recurringIntervals: [],
    },
    {
        id: 'cuota-socios',
        enabled: true,
        kind: 'membership',
        title: 'Cuota de Socios',
        description: 'Portal de pago rápido para cuotas y membresías de los socios actuales del club.',
        icon: 'users',
        theme: 'emerald',
        presetAmounts: [],
        allowCustom: true,
        defaultAmount: 150,
        showMessage: true,
        showAnonymous: false,
        buttonText: 'Pagar Cuota',
        benefits: [],
        campaign: 'Membresía',
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
