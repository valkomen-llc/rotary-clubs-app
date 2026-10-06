// Editor del mensaje de WhatsApp (v4.1166). A propósito NO reutiliza el
// editor HTML del email: WhatsApp es texto con límites reales del proveedor
// (encabezado 60, cuerpo 1024, pie 60, máx. 3 botones) y vista de teléfono.
// El envío masivo sigue pendiente de integración (ver `whatsappStatus`): lo
// que se guarda acá queda validado y listo, y la vista previa + validación
// de prueba funcionan desde ya.
import React from 'react';
import { VARIABLE_CATALOG, substituteVars, TEST_VARS } from '../../../../lib/contentActivationVariables';
import MediaPicker from '../../content-studio/MediaPicker';

export interface WaButton {
  type: 'url' | 'quick';
  label: string;
  url?: string;
}

export interface WaMessage {
  headerType: 'none' | 'text' | 'image';
  headerText: string;
  mediaUrl: string;
  body: string;
  footer: string;
  buttons: WaButton[];
  templateName?: string | null;
  templateLang?: string | null;
}

const input = 'w-full border rounded-xl px-3 py-2 text-sm';

const VarChips: React.FC<{ onInsert: (v: string) => void }> = ({ onInsert }) => (
  <div className="flex flex-wrap gap-1">
    {VARIABLE_CATALOG.map((v) => (
      <button key={v.id} type="button" title={`${v.label} · ej.: ${v.ejemplo}`}
        onClick={() => onInsert(`{{${v.id}}}`)}
        className="px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-[11px] font-bold hover:bg-blue-100">
        {`{{${v.id}}}`}
      </button>
    ))}
  </div>
);

const WhatsAppDesigner: React.FC<{
  value: Partial<WaMessage>;
  onChange: (v: WaMessage) => void;
  operative: boolean;
  operativeNote: string;
}> = ({ value, onChange, operative, operativeNote }) => {
  const [pickMedia, setPickMedia] = React.useState(false);
  const v: WaMessage = {
    headerType: value.headerType || 'none',
    headerText: value.headerText || '',
    mediaUrl: value.mediaUrl || '',
    body: value.body || '',
    footer: value.footer || '',
    buttons: Array.isArray(value.buttons) ? value.buttons : [],
    templateName: value.templateName || null,
    templateLang: value.templateLang || null,
  };
  const set = (patch: Partial<WaMessage>) => onChange({ ...v, ...patch });
  const insertBody = (token: string) => set({ body: `${v.body}${v.body && !v.body.endsWith('\n') ? ' ' : ''}${token}` });

  const preview = substituteVars(
    `${v.headerType === 'text' && v.headerText ? `${v.headerText}\n\n` : ''}${v.body}${v.footer ? `\n\n${v.footer}` : ''}`,
    TEST_VARS
  );

  const setBtn = (i: number, patch: Partial<WaButton>) =>
    set({ buttons: v.buttons.map((b, j) => (j === i ? { ...b, ...patch } : b)) });

  return (
    <div className="grid lg:grid-cols-2 gap-3">
      <div className="space-y-3">
        <div>
          <div className="text-xs font-bold mb-1">Encabezado</div>
          <div className="flex gap-1 text-xs mb-2">
            {[{ id: 'none', label: 'Sin encabezado' }, { id: 'text', label: 'Texto' }, { id: 'image', label: 'Imagen' }].map((o) => (
              <button key={o.id} type="button" onClick={() => set({ headerType: o.id as WaMessage['headerType'] })}
                className={`px-3 py-1.5 rounded-xl border font-bold ${v.headerType === o.id ? 'bg-gray-900 text-white' : ''}`}>{o.label}</button>
            ))}
          </div>
          {v.headerType === 'text' && (
            <input className={input} value={v.headerText} maxLength={60} onChange={(e) => set({ headerText: e.target.value })} placeholder="Título corto (máx. 60)" />
          )}
          {v.headerType === 'image' && (
            <div className="flex gap-2">
              <input className={`${input} flex-1`} value={v.mediaUrl} onChange={(e) => set({ mediaUrl: e.target.value })} placeholder="https://… imagen del encabezado" />
              <button type="button" onClick={() => setPickMedia(true)} className="px-3 py-2 rounded-xl border text-xs font-bold">Biblioteca…</button>
            </div>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs font-bold">Texto principal</div>
            <div className={`text-[11px] font-bold ${v.body.length > 1024 ? 'text-red-600' : 'text-gray-400'}`}>{v.body.length} / 1024</div>
          </div>
          <textarea className={`${input} min-h-[160px] whitespace-pre-wrap`} value={v.body} maxLength={1500}
            onChange={(e) => set({ body: e.target.value })} placeholder="Hola {{recipient_name}}, …" />
          <div className="mt-1.5"><VarChips onInsert={insertBody} /></div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs font-bold">Pie (opcional)</div>
            <div className="text-[11px] text-gray-400">{v.footer.length} / 60</div>
          </div>
          <input className={input} value={v.footer} maxLength={60} onChange={(e) => set({ footer: e.target.value })} placeholder="Gracias por participar" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs font-bold">Botones (máx. 3)</div>
            {!operative && <div className="text-[11px] text-amber-700">ℹ Se guardan, pero el envío masivo requiere la integración ({operativeNote || 'pendiente'}).</div>}
          </div>
          {v.buttons.map((b, i) => (
            <div key={i} className="border rounded-xl p-2 mb-2 space-y-1.5">
              <div className="flex gap-1 text-xs">
                <button type="button" onClick={() => setBtn(i, { type: 'url' })} className={`px-2 py-1 rounded-lg border font-bold ${b.type === 'url' ? 'bg-gray-900 text-white' : ''}`}>Enlace</button>
                <button type="button" onClick={() => setBtn(i, { type: 'quick' })} className={`px-2 py-1 rounded-lg border font-bold ${b.type === 'quick' ? 'bg-gray-900 text-white' : ''}`}>Respuesta rápida</button>
                <button type="button" onClick={() => set({ buttons: v.buttons.filter((_, j) => j !== i) })} className="ml-auto text-red-600 text-xs font-bold">Quitar</button>
              </div>
              <input className={input} value={b.label} maxLength={25} onChange={(e) => setBtn(i, { label: e.target.value })} placeholder="Etiqueta (máx. 25)" />
              {b.type === 'url' && (
                <input className={input} value={b.url || ''} onChange={(e) => setBtn(i, { url: e.target.value })} placeholder="https://… o {{form_url}} para Rotary en Acción" />
              )}
            </div>
          ))}
          {v.buttons.length < 3 && (
            <button type="button" onClick={() => set({ buttons: [...v.buttons, { type: 'url', label: '', url: '{{form_url}}' }] })} className="px-3 py-1.5 rounded-xl border text-xs font-bold">+ Agregar botón</button>
          )}
        </div>
        <details className="border rounded-xl p-3 text-xs">
          <summary className="font-bold cursor-pointer">Plantilla aprobada por Meta (opcional)</summary>
          <div className="grid gap-2 mt-2">
            <input className={input} value={v.templateName || ''} onChange={(e) => set({ templateName: e.target.value || null })} placeholder="Nombre de la plantilla aprobada" />
            <input className={input} value={v.templateLang || ''} onChange={(e) => set({ templateLang: e.target.value || null })} placeholder="Idioma (ej. es)" />
            <p className="text-[11px] text-gray-400">Si tu cuenta usa plantillas aprobadas, indícalas acá para trazabilidad. El cuerpo validado arriba debe coincidir con la aprobada.</p>
          </div>
        </details>
      </div>
      {/* Vista previa teléfono */}
      <div>
        <div className="text-xs font-bold mb-2">Vista previa · WhatsApp</div>
        <div className="mx-auto max-w-[320px] rounded-[28px] border-[10px] border-gray-900 bg-[#e7ffdb] overflow-hidden">
          <div className="px-3 py-2 text-[11px] font-bold text-gray-500 bg-[#d9fdd3]">Rotary en Acción · ahora</div>
          <div className="p-3">
            {v.headerType === 'image' && v.mediaUrl && <img src={v.mediaUrl} alt="" className="rounded-xl mb-2 w-full object-cover" />}
            <div className="bg-white rounded-xl rounded-tl-none p-2.5 shadow-sm text-[13px] text-gray-800 whitespace-pre-wrap">{preview.text || '—'}</div>
            {v.buttons.map((b, i) => (
              <div key={i} className="mt-1 bg-white rounded-xl p-2 text-center text-[13px] font-bold text-[#00a680] shadow-sm">
                {b.type === 'url' ? `🔗 ${b.label || 'Enlace'}` : `↩ ${b.label || 'Responder'}`}
              </div>
            ))}
            {preview.missing.length > 0 && (
              <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2">
                Sin valor de prueba: {preview.missing.map((m) => `{{${m}}}`).join(', ')}
              </div>
            )}
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">Variables resueltas con datos de prueba. En el envío real se resuelven por destinatario.</p>
      </div>
      <MediaPicker isOpen={pickMedia} onClose={() => setPickMedia(false)} mediaType="image" maxSelection={1}
        onSelect={(items) => { if (items?.[0]?.url) set({ mediaUrl: items[0].url }); setPickMedia(false); }} />
    </div>
  );
};

export default WhatsAppDesigner;
