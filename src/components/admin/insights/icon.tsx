import React from 'react';
// Mapa EXPLÍCITO de iconos usados por los informes. Importar solo los
// necesarios preserva el tree-shaking de lucide-react (un `import *` incluiría
// toda la librería y engordaría el bundle de iconos de toda la app).
import {
    Circle, Sparkles, CheckCircle2, Info, Cpu, GitCommitHorizontal, Award, BadgeCheck, Lightbulb,
    Globe, Newspaper, Calendar, Bot, Brain, Mail, ClipboardList, ShoppingBag, CreditCard, Users,
    HeartHandshake, FolderOpen, Images, Video, FolderKanban, MessageSquare, Workflow, Share2,
    BarChart3, Search, Landmark, MessagesSquare, Gauge, LayoutGrid, FileText, DollarSign,
    FileStack, LayoutTemplate, Database, Plug, ShieldCheck, DatabaseBackup, HardDrive,
    Send, MailOpen, MousePointerClick, MessageCircle, PlusCircle, Star, Activity, UserCheck,
    Crown, UserPlus, Target, Contact, CalendarPlus, Package, ShoppingCart, Receipt, TrendingUp,
    IdCard, HandCoins, Gift, Calculator, Flag, Heart, FileSearch, Mailbox, Reply, Clock, Lock,
    ListChecks, Percent, Smartphone, Zap, Link2, LineChart, Rocket,
    Compass, PenTool, Megaphone,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const MAP: Record<string, LucideIcon> = {
    Circle, Sparkles, CheckCircle2, Info, Cpu, GitCommitHorizontal, Award, BadgeCheck, Lightbulb,
    Globe, Newspaper, Calendar, Bot, Brain, Mail, ClipboardList, ShoppingBag, CreditCard, Users,
    HeartHandshake, FolderOpen, Images, Video, FolderKanban, MessageSquare, Workflow, Share2,
    BarChart3, Search, Landmark, MessagesSquare, Gauge, LayoutGrid, FileText, DollarSign,
    FileStack, LayoutTemplate, Database, Plug, ShieldCheck, DatabaseBackup, HardDrive,
    Send, MailOpen, MousePointerClick, MessageCircle, PlusCircle, Star, Activity, UserCheck,
    Crown, UserPlus, Target, Contact, CalendarPlus, Package, ShoppingCart, Receipt, TrendingUp,
    IdCard, HandCoins, Gift, Calculator, Flag, Heart, FileSearch, Mailbox, Reply, Clock, Lock,
    ListChecks, Percent, Smartphone, Zap, Link2, LineChart, Rocket,
    Compass, PenTool, Megaphone,
};

// Resuelve un icono por nombre (string del dataset). Fallback a Circle.
export const Icon: React.FC<{ name?: string; className?: string; size?: number; style?: React.CSSProperties }> = ({ name, className, size, style }) => {
    const Cmp = (name && MAP[name]) || Circle;
    return <Cmp className={className} size={size} style={style} />;
};

export default Icon;
