import React, { useMemo, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Clock, Video, User, CalendarDays, Loader2, CalendarX2 } from 'lucide-react';

// Selector de fecha y hora estilo Calendly/Google Calendar, adaptado a Club
// Platform. Mini-calendario mensual (días con disponibilidad resaltados) +
// panel de horarios del día elegido. Selección en 2 clics. Responsive.

interface Slot { startAt: string; endAt: string; responsibleId?: string | null }
interface DayGroup { dateKey: string; slots: Slot[] }
interface Props {
    days: DayGroup[];
    loading: boolean;
    typeName?: string;
    durationMin?: number;
    instructor?: string | null;
    timezone: string;
    selectedStart: string | null;
    onSelect: (slot: Slot) => void;
}

const WD = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const pad = (n: number) => String(n).padStart(2, '0');
// Clave de fecha local del navegador (coincide con la zona del usuario).
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const keyOfIso = (iso: string) => keyOf(new Date(iso));
const fmtTime = (iso: string, tz: string) => new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(iso));
const fmtLongDate = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(y, m - 1, d));
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const AgendaDateTimePicker: React.FC<Props> = ({ days, loading, typeName, durationMin, instructor, timezone, selectedStart, onSelect }) => {
    // Agrupa todos los slots por fecha local del usuario.
    const slotsByDate = useMemo(() => {
        const map: Record<string, Slot[]> = {};
        for (const g of days) for (const s of g.slots) {
            const k = keyOfIso(s.startAt);
            (map[k] = map[k] || []).push(s);
        }
        for (const k of Object.keys(map)) map[k].sort((a, b) => a.startAt.localeCompare(b.startAt));
        return map;
    }, [days]);

    const availableDates = useMemo(() => Object.keys(slotsByDate).sort(), [slotsByDate]);
    const firstAvailable = availableDates[0];

    const [month, setMonth] = useState<{ y: number; m: number }>(() => {
        const base = firstAvailable ? new Date(firstAvailable + 'T00:00:00') : new Date();
        return { y: base.getFullYear(), m: base.getMonth() };
    });
    const [selectedDate, setSelectedDate] = useState<string | null>(null);

    // Al cambiar la disponibilidad (p. ej. cambia el tipo), reposicionar.
    useEffect(() => {
        if (selectedStart) { setSelectedDate(keyOfIso(selectedStart)); return; }
        if (firstAvailable) {
            setSelectedDate((prev) => (prev && slotsByDate[prev] ? prev : firstAvailable));
            const b = new Date(firstAvailable + 'T00:00:00');
            setMonth({ y: b.getFullYear(), m: b.getMonth() });
        } else {
            setSelectedDate(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [firstAvailable]);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayKey = keyOf(today);

    // Rejilla del mes (6 semanas).
    const cells = useMemo(() => {
        const first = new Date(month.y, month.m, 1);
        const start = new Date(first);
        start.setDate(1 - first.getDay()); // retrocede al domingo
        return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
    }, [month]);

    const monthLabel = cap(new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(new Date(month.y, month.m, 1)));
    const canPrev = new Date(month.y, month.m, 1) > new Date(today.getFullYear(), today.getMonth(), 1);
    const goMonth = (delta: number) => setMonth((s) => { const d = new Date(s.y, s.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

    const daySlots = selectedDate ? (slotsByDate[selectedDate] || []) : [];

    return (
        <div>
            <style>{`
                @keyframes cpFadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
                .cp-fade { animation: cpFadeUp .22s ease both; }
            `}</style>

            <div className="mb-5">
                <h3 className="text-lg font-black text-gray-900">Elige fecha y hora</h3>
                <p className="text-gray-500 text-sm">Horarios en tu zona: <span className="font-semibold">{timezone}</span></p>
            </div>

            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
            ) : availableDates.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                    <CalendarX2 className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                    <p className="text-sm font-semibold">No hay horarios disponibles por ahora.</p>
                    <p className="text-xs">Intenta con otro tipo de sesión o vuelve más tarde.</p>
                </div>
            ) : (
                <div className="flex flex-col md:flex-row gap-6">
                    {/* Calendario */}
                    <div className="md:w-[340px] shrink-0">
                        <div className="flex items-center justify-between mb-3">
                            <span className="font-black text-gray-900">{monthLabel}</span>
                            <div className="flex gap-1">
                                <button onClick={() => canPrev && goMonth(-1)} disabled={!canPrev} aria-label="Mes anterior"
                                    className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"><ChevronLeft className="w-4 h-4" /></button>
                                <button onClick={() => goMonth(1)} aria-label="Mes siguiente" className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronRight className="w-4 h-4" /></button>
                            </div>
                        </div>
                        <div className="grid grid-cols-7 mb-1">
                            {WD.map((w) => <div key={w} className="text-center text-[10px] font-black text-gray-400 uppercase py-1">{w}</div>)}
                        </div>
                        <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Calendario de disponibilidad">
                            {cells.map((d, i) => {
                                const key = keyOf(d);
                                const inMonth = d.getMonth() === month.m;
                                const count = slotsByDate[key]?.length || 0;
                                const isPast = d < today;
                                const enabled = inMonth && count > 0 && !isPast;
                                const isSel = selectedDate === key;
                                const isToday = key === todayKey;
                                return (
                                    <button key={i} disabled={!enabled} onClick={() => setSelectedDate(key)}
                                        aria-label={enabled ? `${fmtLongDate(key)}, ${count} horarios` : undefined}
                                        aria-pressed={isSel}
                                        className={[
                                            'relative aspect-square rounded-xl text-sm font-bold flex flex-col items-center justify-center transition-all',
                                            !inMonth ? 'text-gray-200' : '',
                                            isSel ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30 scale-[1.03]' : '',
                                            !isSel && enabled ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:scale-[1.03] cursor-pointer' : '',
                                            !enabled && inMonth ? 'text-gray-300 cursor-default' : '',
                                            isToday && !isSel ? 'ring-1 ring-indigo-300' : '',
                                        ].join(' ')}>
                                        <span>{d.getDate()}</span>
                                        {enabled && !isSel && <span className="absolute bottom-1 w-1 h-1 rounded-full bg-indigo-500" />}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex items-center gap-4 mt-3 text-[11px] text-gray-400">
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-indigo-50 border border-indigo-200" />Disponible</span>
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-indigo-600" />Seleccionado</span>
                        </div>
                    </div>

                    {/* Horarios del día */}
                    <div className="flex-1 min-w-0 md:border-l md:border-gray-100 md:pl-6">
                        {selectedDate ? (
                            <div key={selectedDate} className="cp-fade">
                                <div className="font-black text-gray-900 capitalize mb-1">{fmtLongDate(selectedDate)}</div>
                                <div className="text-xs text-gray-400 mb-4">{daySlots.length} horario{daySlots.length === 1 ? '' : 's'} disponible{daySlots.length === 1 ? '' : 's'}</div>
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[280px] overflow-y-auto pr-1">
                                    {daySlots.map((s) => {
                                        const active = selectedStart === s.startAt;
                                        return (
                                            <button key={s.startAt} onClick={() => onSelect(s)} aria-pressed={active}
                                                className={[
                                                    'py-2.5 rounded-xl text-sm font-bold border-2 transition-all',
                                                    active ? 'border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-500/30'
                                                        : 'border-gray-100 text-gray-700 hover:border-indigo-300 hover:bg-indigo-50/50 hover:scale-[1.03]',
                                                ].join(' ')}>
                                                {fmtTime(s.startAt, timezone)}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400 py-12">
                                <CalendarDays className="w-8 h-8 mb-2 text-gray-300" />
                                <p className="text-sm">Selecciona un día con disponibilidad</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Resumen */}
            <div className="mt-6 pt-5 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <Meta icon={CalendarDays} label="Tipo" value={typeName} />
                <Meta icon={Clock} label="Duración" value={durationMin ? `${durationMin} min` : undefined} />
                <Meta icon={Video} label="Zona horaria" value={timezone} />
                <Meta icon={User} label="Instructor" value={instructor || 'Equipo Club Platform'} />
                {selectedStart && (
                    <div className="col-span-2 sm:col-span-4 mt-1 flex flex-wrap items-center gap-2 rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-2.5">
                        <span className="text-emerald-700 font-black text-sm capitalize">{fmtLongDate(keyOfIso(selectedStart))}</span>
                        <span className="text-emerald-600">·</span>
                        <span className="text-emerald-700 font-black text-sm">{fmtTime(selectedStart, timezone)}</span>
                        <span className="text-[11px] text-emerald-600">({timezone})</span>
                    </div>
                )}
            </div>
        </div>
    );
};

const Meta: React.FC<{ icon: any; label: string; value?: string }> = ({ icon: Icon, label, value }) => (
    <div className="flex items-start gap-2">
        <Icon className="w-4 h-4 text-gray-300 mt-0.5 shrink-0" />
        <div className="min-w-0">
            <div className="text-[10px] uppercase font-black text-gray-400 tracking-wide">{label}</div>
            <div className="font-semibold text-gray-800 truncate">{value || '—'}</div>
        </div>
    </div>
);

export default AgendaDateTimePicker;
