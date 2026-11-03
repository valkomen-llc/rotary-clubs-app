// ════════════════════════════════════════════════════════════════════
// «Movimiento de la portada» — editor del panel — v4.1276.0
//
// Va en la pestaña Multimedia del evento, debajo de la imagen de portada.
// Encender/apagar, intensidad, duración y punto de acercamiento, con una
// vista previa que usa EL MISMO componente que la ficha pública y se puede
// volver a reproducir. Se guarda en `metadata.heroMotion` con «Guardar todos
// los cambios».
// ════════════════════════════════════════════════════════════════════
import React, { useState } from 'react';
import { Move, Play } from 'lucide-react';
import EventHeroImage from '../../EventHeroImage';
import { ToggleSwitch } from './EventWidgetsEditor';
import {
    HERO_MOTION_DURATIONS, HERO_MOTION_FOCUS_LABELS, HERO_MOTION_INTENSITY_LABELS, normalizeHeroMotion,
    type HeroMotionConfig, type HeroMotionFocus, type HeroMotionIntensity,
} from '../../../lib/eventHeroMotion';

interface Props {
    motion: unknown;
    coverUrl?: string | null;
    eventTitle?: string;
    onChange: (next: HeroMotionConfig) => void;
}

const EventHeroMotionEditor: React.FC<Props> = ({ motion, coverUrl, eventTitle, onChange }) => {
    const cfg = normalizeHeroMotion(motion);
    const [replay, setReplay] = useState(0);
    const set = (patch: Partial<HeroMotionConfig>) => {
        onChange({ ...cfg, ...patch });
        setReplay(r => r + 1);
    };
    const select = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-400';

    return (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-rotary-blue border border-blue-100"><Move className="h-4 w-4" /></span>
                    <div>
                        <h4 className="text-sm font-bold text-gray-900">🎬 Movimiento de la portada</h4>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Un acercamiento muy suave sobre la imagen de portada al abrir la página del evento. Se detiene al terminar y no se aplica a quien tiene activado «Reducir movimiento» en su dispositivo.
                        </p>
                    </div>
                </div>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-700 shrink-0">
                    {cfg.enabled ? 'Activado' : 'Desactivado'}
                    <ToggleSwitch checked={cfg.enabled} onChange={next => set({ enabled: next })} label="Movimiento de la portada" />
                </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Intensidad</label>
                    <select className={select} disabled={!cfg.enabled} value={cfg.intensity} onChange={e => set({ intensity: e.target.value as HeroMotionIntensity })}>
                        {(Object.keys(HERO_MOTION_INTENSITY_LABELS) as HeroMotionIntensity[]).map(k => <option key={k} value={k}>{HERO_MOTION_INTENSITY_LABELS[k]}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Duración</label>
                    <select className={select} disabled={!cfg.enabled} value={cfg.durationSec} onChange={e => set({ durationSec: Number(e.target.value) })}>
                        {HERO_MOTION_DURATIONS.map(s => <option key={s} value={s}>{s} segundos{s === 5 ? ' (recomendado)' : ''}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Acercarse hacia</label>
                    <select className={select} disabled={!cfg.enabled} value={cfg.focus} onChange={e => set({ focus: e.target.value as HeroMotionFocus })}>
                        {(Object.keys(HERO_MOTION_FOCUS_LABELS) as HeroMotionFocus[]).map(k => <option key={k} value={k}>{HERO_MOTION_FOCUS_LABELS[k]}</option>)}
                    </select>
                </div>
            </div>

            {coverUrl ? (
                <div className="space-y-2">
                    <div className="relative aspect-[16/6] overflow-hidden rounded-xl bg-gray-900">
                        <EventHeroImage src={coverUrl} alt={eventTitle || 'Portada del evento'} motion={cfg} replayKey={replay} />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                        <p className="pointer-events-none absolute bottom-3 left-4 right-4 text-white font-black text-lg sm:text-2xl leading-tight line-clamp-2">{eventTitle}</p>
                    </div>
                    <button type="button" onClick={() => setReplay(r => r + 1)} disabled={!cfg.enabled}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:text-rotary-blue hover:border-rotary-blue disabled:opacity-40">
                        <Play className="h-3.5 w-3.5" /> Ver el movimiento otra vez
                    </button>
                </div>
            ) : (
                <p className="text-xs text-gray-400">Sube una imagen de portada para ver la vista previa del movimiento.</p>
            )}
        </div>
    );
};

export default EventHeroMotionEditor;
