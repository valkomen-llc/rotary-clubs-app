/**
 * Sitio web de Club Platform — el ícono de un contenedor (v4.1348.0).
 * Lista CERRADA (`ICONS` del criterio) pintada con lucide. Un id desconocido pinta la estrella.
 */
import type { ComponentType } from 'react';
import {
    Globe, Monitor, LayoutDashboard, BarChart3, Megaphone, Mail, MessageCircle, Users, ShieldCheck, Zap, Plug, Bot, Search, Languages, Calendar, FolderKanban,
    Image, FileText, CreditCard, Layers, Settings, Palette, Rocket, RefreshCw, Heart, Star, CheckCircle2, Sparkles, HelpCircle, ArrowRight,
} from 'lucide-react';

const MAP: Record<string, ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
    globe: Globe, monitor: Monitor, layout: LayoutDashboard, chart: BarChart3, megaphone: Megaphone, mail: Mail, message: MessageCircle, users: Users,
    shield: ShieldCheck, zap: Zap, plug: Plug, bot: Bot, search: Search, languages: Languages, calendar: Calendar, folder: FolderKanban,
    image: Image, file: FileText, card: CreditCard, layers: Layers, settings: Settings, palette: Palette, rocket: Rocket, refresh: RefreshCw,
    heart: Heart, star: Star, check: CheckCircle2, sparkles: Sparkles, help: HelpCircle, arrow: ArrowRight,
};
export const PLATFORM_ICON_IDS = Object.keys(MAP);

const PlatformIcon = ({ id, className = 'w-6 h-6' }: { id?: string; className?: string }) => {
    const Icon = MAP[id || ''] || Star;
    return <Icon className={className} aria-hidden />;
};

export default PlatformIcon;
