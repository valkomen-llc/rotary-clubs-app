/**
 * Programas — el ícono de un contenedor (v4.1281.0).
 * Lista CERRADA (`ICONS` del criterio) pintada con lucide: azul con el detalle
 * dorado de la referencia. Un id desconocido pinta la estrella.
 */
import type { ComponentType } from 'react';
import {
    BookOpen, MapPin, HelpCircle, Users, Baby, Building2, LifeBuoy, Heart, HeartHandshake, Play, Headphones, FileText, Layers, Search, Phone, Mail,
    Star, Award, Calendar, Globe, Stethoscope, Home, Sparkles, ArrowRight,
} from 'lucide-react';

const MAP: Record<string, ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
    book: BookOpen, 'map-pin': MapPin, help: HelpCircle, users: Users, family: Baby, hospital: Building2, rotary: LifeBuoy, heart: Heart, hands: HeartHandshake,
    play: Play, headphones: Headphones, file: FileText, layers: Layers, search: Search, phone: Phone, mail: Mail, star: Star, award: Award, calendar: Calendar,
    globe: Globe, baby: Baby, stethoscope: Stethoscope, home: Home, sparkles: Sparkles, arrow: ArrowRight,
};

interface Props { id?: string; className?: string; gold?: boolean }

const ProgramIcon = ({ id, className = 'w-6 h-6', gold = false }: Props) => {
    const Icon = MAP[id || ''] || Star;
    if (id === 'rotary') {
        // La rueda rotaria: círculo dorado con radios, sin depender de un logo.
        return (
            <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="8.5" stroke={gold ? '#F5A623' : 'currentColor'} />
                <circle cx="12" cy="12" r="3" />
                {[0, 60, 120, 180, 240, 300].map(a => { const r = (a * Math.PI) / 180; return <line key={a} x1={12 + Math.cos(r) * 3.6} y1={12 + Math.sin(r) * 3.6} x2={12 + Math.cos(r) * 8} y2={12 + Math.sin(r) * 8} />; })}
            </svg>
        );
    }
    return <Icon className={className} aria-hidden />;
};

export default ProgramIcon;
