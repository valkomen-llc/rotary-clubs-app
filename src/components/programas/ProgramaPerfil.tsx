/**
 * Programas — el perfil institucional en la página de detalle (v4.1286.0)
 *
 * Lo que llega aprobado desde el formulario institucional: propósito, quiénes
 * somos, misión, visión, valores, objetivos, reseña e hitos, la entidad que
 * opera el programa, y los servicios, pasos y preguntas frecuentes. «No
 * aplica» y «Pendiente» nunca se pintan (el servidor ya los quitó).
 */
import type { ReactNode } from 'react';

const Bloque = ({ titulo, children }: { titulo: string; children: ReactNode }) => (
    <div className="rounded-2xl bg-white border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-900 mb-2">{titulo}</h3>
        {children}
    </div>
);
const Texto = ({ t }: { t?: string }) => <>{String(t || '').split(/\n{2,}/).map((p, i) => <p key={i} className="text-sm text-gray-600 leading-relaxed whitespace-pre-line mb-2 last:mb-0">{p}</p>)}</>;

export const PerfilPrograma = ({ profile }: { profile?: any }) => {
    const p = profile || {};
    const bloques: [string, string][] = [['Propósito', p.purpose], ['Quiénes somos', p.whoWeAre], ['Sobre nosotros', p.about], ['Misión', p.mission], ['Visión', p.vision], ['Valores', p.values], ['Objetivos', p.objectives], ['Reseña histórica', p.history]].filter(([, v]) => v) as [string, string][];
    const hitos = Array.isArray(p.milestones) ? p.milestones : [];
    if (!bloques.length && !hitos.length && !p.tagline && !p.operatorName) return null;
    return (
        <div className="mt-8 space-y-4">
            {p.tagline ? <p className="text-lg font-light text-rotary-blue">{p.tagline}</p> : null}
            {bloques.length ? <div className="grid md:grid-cols-2 gap-4">{bloques.map(([t, v]) => <Bloque key={t} titulo={t}><Texto t={v} /></Bloque>)}</div> : null}
            {hitos.length ? (
                <Bloque titulo={p.startYear ? `Trayectoria desde ${p.startYear}` : 'Trayectoria'}>
                    <ol className="space-y-2">{[...hitos].sort((a: any, b: any) => (a.year || 0) - (b.year || 0)).map((h: any) => <li key={h.id} className="text-sm text-gray-700"><b className="text-rotary-blue mr-2">{h.year || ''}</b>{h.title}{h.description ? <span className="block text-gray-500 text-xs mt-0.5">{h.description}</span> : null}</li>)}</ol>
                </Bloque>
            ) : null}
            {p.operatorName ? <p className="text-xs text-gray-500">Entidad que opera el programa: {p.operatorName}.</p> : null}
        </div>
    );
};

export const AtencionExtra = ({ care, health = true }: { care?: any; health?: boolean }) => {
    const c = care || {};
    const services = Array.isArray(c.services) ? c.services : [];
    const steps = Array.isArray(c.steps) ? c.steps : [];
    const faqs = Array.isArray(c.faqs) ? c.faqs : [];
    if (!services.length && !steps.length && !faqs.length && !c.contactHours) return null;
    return (
        <div className="mt-6 space-y-4">
            {services.length ? <Bloque titulo={health ? 'Servicios del programa' : 'Servicios y actividades'}><ul className="grid sm:grid-cols-2 gap-3">{services.map((s: any) => <li key={s.id} className="text-sm"><b className="text-gray-800">{s.name}</b>{s.description ? <span className="block text-gray-500">{s.description}</span> : null}</li>)}</ul></Bloque> : null}
            {steps.length ? <Bloque titulo="Pasos para vincularse"><ol className="space-y-2 list-decimal pl-5">{steps.map((s: any) => <li key={s.id} className="text-sm text-gray-700"><b>{s.title}</b>{s.description ? <span className="block text-gray-500">{s.description}</span> : null}</li>)}</ol></Bloque> : null}
            {faqs.length ? <Bloque titulo="Preguntas frecuentes"><div className="divide-y divide-gray-100">{faqs.map((f: any) => <details key={f.id} className="py-2"><summary className="text-sm font-semibold text-gray-800 cursor-pointer">{f.question}</summary><div className="mt-2"><Texto t={f.answer} /></div></details>)}</div></Bloque> : null}
            {c.contactHours ? <p className="text-xs text-gray-500">Horarios de contacto: {c.contactHours}</p> : null}
        </div>
    );
};
