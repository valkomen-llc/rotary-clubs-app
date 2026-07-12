import { useState } from 'react';
import { Star, Pencil, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSiteImages } from '../hooks/useSiteImages';
import { useClub } from '../contexts/ClubContext';
import { useAuth } from '../hooks/useAuth';

// Una imagen se considera "subida" (personalizada) si no es un asset por defecto.
const isUploaded = (url?: string) => !!url && !url.includes('/defaults/');

const EDITOR_ROLES = ['administrator', 'club_admin', 'editor', 'crowdfunder'];

// Rueda de Rotary autocontenida (SVG). Usa `currentColor`, con el centro
// recortado (fill-rule evenodd) para que funcione sobre cualquier fondo.
const RotaryWheel = ({ className = '' }: { className?: string }) => {
    const teeth = 24;
    const rOut = 50;
    const rIn = 45;
    const rHole = 30;
    // Anillo dentado exterior + agujero central (subtrayectoria en sentido inverso).
    let outer = '';
    for (let i = 0; i < teeth * 2; i++) {
        const r = i % 2 === 0 ? rOut : rIn;
        const a = (Math.PI / teeth) * i - Math.PI / 2;
        const x = (50 + r * Math.cos(a)).toFixed(2);
        const y = (50 + r * Math.sin(a)).toFixed(2);
        outer += `${i === 0 ? 'M' : 'L'}${x},${y} `;
    }
    outer += 'Z';
    // Agujero central como círculo (dos arcos) para el recorte evenodd.
    const hole = `M${50 - rHole},50 a${rHole},${rHole} 0 1,0 ${rHole * 2},0 a${rHole},${rHole} 0 1,0 ${-rHole * 2},0 Z`;
    // 6 rayos radiales.
    const spokes = Array.from({ length: 6 }).map((_, i) => {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        return { x2: (50 + rHole * Math.cos(a)).toFixed(2), y2: (50 + rHole * Math.sin(a)).toFixed(2) };
    });
    return (
        <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
            <path d={`${outer} ${hole}`} fill="currentColor" fillRule="evenodd" />
            {spokes.map((s, i) => (
                <line key={i} x1="50" y1="50" x2={s.x2} y2={s.y2} stroke="currentColor" strokeWidth="5" />
            ))}
            <circle cx="50" cy="50" r="13" fill="currentColor" />
        </svg>
    );
};

// Lockup "The Rotary Foundation" (rueda + texto), en versión clara para fondos oscuros.
export const TrfLogoLockup = ({ className = '' }: { className?: string }) => (
    <div className={`flex items-center gap-4 ${className}`}>
        <RotaryWheel className="w-14 h-14 md:w-16 md:h-16 text-rotary-gold shrink-0" />
        <div className="text-left leading-none">
            <span className="block text-white/70 text-[11px] font-semibold tracking-[0.25em] uppercase mb-1">The</span>
            <span className="block text-white font-extrabold text-2xl md:text-[28px] tracking-tight">Rotary Foundation</span>
        </div>
    </div>
);

// Fila de credibilidad: calificación de 4 estrellas + eficacia de las donaciones.
// Totalmente autocontenida (sin imágenes externas), pensada para fondos oscuros.
const FoundationCredibility = ({ percent = 90.8 }: { percent?: number }) => {
    const images = useSiteImages();
    const { club, refreshClub } = useClub();
    const { isAuthenticated, user } = useAuth();
    const [saving, setSaving] = useState(false);

    const r = 42;
    const circ = 2 * Math.PI * r;
    const filled = (circ * percent) / 100;
    const pctLabel = `${percent.toString().replace('.', ',')}%`;

    const charity = images.trfCharityBadge;
    const efficiency = images.trfEfficiencyBadge;
    const logo = images.trfFoundationLogo;

    const canEdit = isAuthenticated && EDITOR_ROLES.includes(user?.role || '');
    const visible = (club as any)?.trfCredibilityVisible !== false;

    const toggleVisible = async () => {
        if (!(club as any)?.id) return;
        setSaving(true);
        try {
            const API = import.meta.env.VITE_API_URL || '/api';
            const token = localStorage.getItem('rotary_token');
            const res = await fetch(`${API}/admin/clubs/${(club as any).id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ trfCredibilityVisible: !visible }),
            });
            if (res.ok) await refreshClub?.();
        } catch { /* noop */ } finally {
            setSaving(false);
        }
    };

    // Oculto para el público; los admins ven un aviso para reactivarlo.
    if (!visible && !canEdit) return null;
    if (!visible && canEdit) {
        return (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 py-8 px-6 border border-dashed border-white/25 rounded-2xl text-white/70 max-w-2xl mx-auto">
                <EyeOff className="w-5 h-5 shrink-0" />
                <span className="text-sm text-center">Bloque de sellos de La Fundación Rotaria <b>oculto</b>. Solo tú (administrador) ves este aviso.</span>
                <button onClick={toggleVisible} disabled={saving}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/20 transition whitespace-nowrap">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />} Mostrar bloque
                </button>
            </div>
        );
    }

    return (
        <div className="relative flex flex-col items-center gap-12">
            {canEdit && (
                <div className="absolute -top-3 right-0 md:right-2 flex items-center gap-2 z-10">
                    <Link to="/admin/imagenes-sitio" title="Cambiar los sellos"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur border border-white/20 transition">
                        <Pencil className="w-3.5 h-3.5" /> Editar
                    </Link>
                    <button onClick={toggleVisible} disabled={saving} title="Ocultar este bloque en el sitio"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur border border-white/20 transition">
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <EyeOff className="w-3.5 h-3.5" />} Ocultar
                    </button>
                </div>
            )}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-10 sm:gap-16 md:gap-24">
                {/* Charity Navigator — imagen subida o diseño por defecto */}
                {isUploaded(charity?.url) ? (
                    <img src={charity!.url} alt={charity!.alt || 'Charity Navigator'} className="max-h-28 md:max-h-32 w-auto object-contain" />
                ) : (
                    <div className="flex flex-col items-center gap-3 text-center">
                        <div className="flex gap-1.5">
                            {[0, 1, 2, 3].map(i => (
                                <Star key={i} className="w-7 h-7 md:w-8 md:h-8 text-rotary-gold fill-current" strokeWidth={1} />
                            ))}
                        </div>
                        <div>
                            <p className="text-white font-bold text-lg md:text-xl leading-tight">Charity Navigator</p>
                            <p className="text-white/60 text-sm">Máxima calificación · 4 estrellas</p>
                        </div>
                    </div>
                )}

                {/* Eficacia de las donaciones — imagen subida o anillo por defecto */}
                {isUploaded(efficiency?.url) ? (
                    <img src={efficiency!.url} alt={efficiency!.alt || 'Eficacia de las donaciones'} className="max-h-28 md:max-h-32 w-auto object-contain" />
                ) : (
                    <div className="flex items-center gap-5">
                        <div className="relative w-28 h-28 shrink-0">
                            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                                <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="8" />
                                <circle
                                    cx="50" cy="50" r={r} fill="none"
                                    stroke="currentColor"
                                    className="text-rotary-gold"
                                    strokeWidth="8"
                                    strokeLinecap="round"
                                    strokeDasharray={`${filled.toFixed(2)} ${circ.toFixed(2)}`}
                                />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-white font-extrabold text-xl md:text-2xl">{pctLabel}</span>
                            </div>
                        </div>
                        <p className="text-white/80 text-sm max-w-[200px] text-left leading-snug">
                            de los fondos se destinan directamente a los programas y su ejecución.
                        </p>
                    </div>
                )}
            </div>

            {/* Logo de The Rotary Foundation — imagen subida o lockup por defecto */}
            {isUploaded(logo?.url) ? (
                <img src={logo!.url} alt={logo!.alt || 'The Rotary Foundation'} className="h-16 md:h-20 w-auto object-contain" />
            ) : (
                <TrfLogoLockup />
            )}
        </div>
    );
};

export default FoundationCredibility;
