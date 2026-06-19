import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { Megaphone, Plus, Trash2, Edit3, Play, Loader2, X, Eye, CheckCircle2, XCircle, Clock, Image, Video, Link2, CheckCheck, Check, MailOpen, FileDown, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

const WhatsAppCampaigns: React.FC = () => {
    const { token } = useAuth();
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [lists, setLists] = useState<any[]>([]);
    const [templates, setTemplates] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [sending, setSending] = useState<string | null>(null);
    const [viewLogs, setViewLogs] = useState<string | null>(null);
    const [logs, setLogs] = useState<any[]>([]);
    const [logFilter, setLogFilter] = useState<'all' | 'delivered' | 'read' | 'failed'>('all');
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [reportLoading, setReportLoading] = useState(false);
    const [report, setReport] = useState<any>(null);
    const [reportFetching, setReportFetching] = useState(false);
    const [form, setForm] = useState({ name: '', description: '', listId: '', templateId: '', mediaUrl: '' });
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    const selectedTemplate = templates.find((t: any) => t.id === form.templateId);
    const needsMedia = selectedTemplate && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(selectedTemplate.headerType);

    useEffect(() => { fetchAll(); }, []);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [c, l, t] = await Promise.all([
                fetch(`${API}/whatsapp/campaigns`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
                fetch(`${API}/whatsapp/lists`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
                fetch(`${API}/whatsapp/templates`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
            ]);
            setCampaigns(Array.isArray(c) ? c : (c.campaigns || []));
            setLists(Array.isArray(l) ? l : (l.lists || []));
            const allTemplates = Array.isArray(t) ? t : (t.templates || []);
            setTemplates(allTemplates.filter((tpl: any) => tpl.status === 'approved'));
        } catch { } finally { setLoading(false); }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const url = editId ? `${API}/whatsapp/campaigns/${editId}` : `${API}/whatsapp/campaigns`;
        const payload: any = { name: form.name, description: form.description, listId: form.listId, templateId: form.templateId };
        if (form.mediaUrl) payload.templateVars = { mediaUrl: form.mediaUrl };
        const res = await fetch(url, { method: editId ? 'PUT' : 'POST', headers, body: JSON.stringify(payload) });
        if (res.ok) { toast.success(editId ? 'Campaña actualizada' : 'Campaña creada'); setShowForm(false); resetForm(); fetchAll(); }
        else toast.error((await res.json()).error);
    };

    const handleSend = async (id: string) => {
        if (!confirm('¿Enviar esta campaña ahora? Los mensajes se enviarán inmediatamente.\n\nEsto puede tardar unos segundos dependiendo de la cantidad de contactos.')) return;
        setSending(id);
        try {
            const res = await fetch(`${API}/whatsapp/campaigns/${id}/send`, { method: 'POST', headers });
            const data = await res.json();
            if (data.success) {
                toast.success(data.message);
            } else {
                toast.error(data.error || 'Error al enviar campaña');
            }
            fetchAll();
        } catch { toast.error('Error al enviar — posible timeout. Recarga para ver el estado.'); } finally { setSending(null); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Eliminar esta campaña?')) return;
        await fetch(`${API}/whatsapp/campaigns/${id}`, { method: 'DELETE', headers });
        toast.success('Campaña eliminada'); fetchAll();
    };

    const openLogs = async (id: string) => {
        setViewLogs(id);
        setLogFilter('all');
        setLoadingLogs(true);
        setReport(null);
        try {
            const res = await fetch(`${API}/whatsapp/campaigns/${id}/logs`, { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            setLogs(Array.isArray(data) ? data : []);
        } catch { setLogs([]); } finally { setLoadingLogs(false); }
        // Cargar el informe analítico (agente Data Analyst) en segundo plano
        loadReport(id);
    };

    const fmt = (d: string | null | undefined) => d ? new Date(d).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

    // Carga (y cachea) el informe analítico de la campaña desde el backend.
    const loadReport = async (id: string): Promise<any | null> => {
        if (report && report.campaign?.id === id) return report;
        setReportFetching(true);
        try {
            const res = await fetch(`${API}/whatsapp/campaigns/${id}/report`, { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            if (!res.ok) { toast.error(data.error || 'No se pudo generar el informe'); return null; }
            setReport(data);
            return data;
        } catch { toast.error('Error al generar el informe analítico'); return null; }
        finally { setReportFetching(false); }
    };

    // Genera el reporte PDF del tracker (resumen + análisis del agente Data Analyst)
    const downloadReport = async (id: string) => {
        setReportLoading(true);
        try {
            const data = await loadReport(id);
            if (!data) return;
            const html = buildReportHtml(data);
            // Usamos un iframe oculto en vez de window.open para evitar el bloqueo de
            // pop-ups (la llamada ocurre tras un await, así que el navegador ya no la
            // considera iniciada por el usuario). Imprimir el iframe abre el diálogo
            // "Guardar como PDF".
            const fileTitle = `Reporte - ${data?.campaign?.name || 'campaña'}`;
            const prevTitle = document.title;
            const iframe = document.createElement('iframe');
            iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
            document.body.appendChild(iframe);
            const idoc = iframe.contentWindow?.document;
            if (!idoc) { iframe.remove(); toast.error('No se pudo generar el reporte'); return; }
            idoc.open();
            idoc.write(html);
            idoc.close();
            // Imprimir solo una vez, tras esperar a que cargue el logo (imagen externa).
            let printed = false;
            const doPrint = () => {
                if (printed) return;
                printed = true;
                try {
                    document.title = fileTitle; // el PDF toma el título del documento
                    iframe.contentWindow?.focus();
                    iframe.contentWindow?.print();
                } catch { toast.error('No se pudo abrir el diálogo de impresión'); }
                finally {
                    document.title = prevTitle;
                    setTimeout(() => iframe.remove(), 1000);
                }
            };
            const logoImg = idoc.querySelector('img.logo') as HTMLImageElement | null;
            if (logoImg && !logoImg.complete) {
                logoImg.addEventListener('load', doPrint, { once: true });
                logoImg.addEventListener('error', doPrint, { once: true });
                setTimeout(doPrint, 2500); // fallback si la imagen tarda o falla
            } else {
                setTimeout(doPrint, 400);
            }
            if (data.analysisError) toast.warning('El análisis IA no está disponible ahora; el reporte incluye solo las métricas.');
        } catch {
            toast.error('Error al generar el reporte');
        } finally {
            setReportLoading(false);
        }
    };

    const buildReportHtml = (data: any) => {
        const PLATFORM_EMAIL = 'soporte@clubplatform.org';
        const PLATFORM_LOGO = 'https://rotary-platform-assets.s3.us-east-1.amazonaws.com/platform/logo/1776225800089-Club_Platform_for_Rotary.png';
        const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
        const c = data.campaign || {};
        const s = data.stats || {};
        const a = data.analysis || null;
        const recipients: any[] = Array.isArray(data.recipients) ? data.recipients : [];
        const gen = data.generatedAt ? new Date(data.generatedAt).toLocaleString('es-CO') : '';
        const sentAt = c.sentAt ? new Date(c.sentAt).toLocaleString('es-CO') : '—';
        const fmtD = (d: any) => d ? new Date(d).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
        const card = (label: string, value: any, sub: any, color: string) =>
            `<div class="card"><div class="num" style="color:${color}">${esc(value)}</div><div class="lbl">${esc(label)}</div><div class="sub">${esc(sub)}</div></div>`;
        const list = (arr: any[]) => (Array.isArray(arr) && arr.length)
            ? `<ul>${arr.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : '<p class="muted">—</p>';
        const errorsRows = (s.topErrors || []).map((e: any) =>
            `<tr><td>${esc(e.msg)}</td><td style="text-align:right">${esc(e.count)}</td></tr>`).join('');

        // Estado legible + color para la tabla de destinatarios
        const statusMeta: Record<string, { label: string; color: string; bg: string }> = {
            read: { label: 'Leído', color: '#6d28d9', bg: '#f5f3ff' },
            delivered: { label: 'Entregado', color: '#1d4ed8', bg: '#eff6ff' },
            sent: { label: 'Enviado', color: '#047857', bg: '#ecfdf5' },
            failed: { label: 'Fallido', color: '#b91c1c', bg: '#fef2f2' },
            pending: { label: 'Pendiente', color: '#b45309', bg: '#fffbeb' },
            received: { label: 'Recibido', color: '#374151', bg: '#f3f4f6' },
        };
        const badge = (st: string) => {
            const m = statusMeta[st] || { label: st || '—', color: '#374151', bg: '#f3f4f6' };
            return `<span class="badge" style="color:${m.color};background:${m.bg}">${esc(m.label)}</span>`;
        };
        const recipientsRows = recipients.map(r => `
            <tr>
              <td>${esc(r.name || '—')}<div class="phone">${esc(r.phone || '')}</div></td>
              <td>${badge(r.status)}</td>
              <td class="ts">${esc(fmtD(r.sentAt))}</td>
              <td class="ts">${esc(fmtD(r.deliveredAt))}</td>
              <td class="ts">${esc(fmtD(r.readAt))}</td>
              <td class="${r.status === 'failed' ? 'reason' : 'muted'}">${esc(r.errorReason || '—')}</td>
            </tr>`).join('');
        const failedList = recipients.filter(r => r.status === 'failed');

        const aiSection = a ? `
            ${a.resumen ? `<h2>Resumen ejecutivo</h2><p>${esc(a.resumen)}</p>` : ''}
            <h2>Análisis</h2>${list(a.analisis)}
            <h2>Conclusiones</h2>${list(a.conclusiones)}
            <h2>Recomendaciones</h2>${list(a.recomendaciones)}`
            : `<h2>Análisis</h2><p class="muted">El análisis del agente Data Analyst no está disponible en este momento. Vuelve a intentarlo más tarde.</p>`;

        return `<!doctype html><html lang="es"><head><meta charset="utf-8">
        <title>Reporte de campaña — ${esc(c.name)}</title>
        <style>
          *{box-sizing:border-box}
          body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;margin:0;padding:40px;max-width:820px;margin:0 auto;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
          .head{border-bottom:3px solid #16a34a;padding-bottom:16px;margin-bottom:24px}
          .head .logo{height:46px;width:auto;margin-bottom:10px;display:block}
          .head h1{margin:0;font-size:22px;color:#111827}
          .head .meta{font-size:12px;color:#6b7280;margin-top:6px}
          .tag{display:inline-block;background:#dcfce7;color:#15803d;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;margin-left:6px}
          .cards{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:18px 0}
          .card{border:1px solid #e5e7eb;border-radius:10px;padding:12px 8px;text-align:center}
          .card .num{font-size:24px;font-weight:800}
          .card .lbl{font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;letter-spacing:.4px;margin-top:2px}
          .card .sub{font-size:10px;color:#9ca3af}
          h2{font-size:15px;color:#111827;margin:22px 0 8px;border-left:4px solid #16a34a;padding-left:10px}
          ul{margin:6px 0;padding-left:20px}
          li{margin:4px 0;font-size:13px}
          p{font-size:13px}
          .muted{color:#9ca3af}
          table{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}
          th,td{border:1px solid #e5e7eb;padding:6px 10px;text-align:left}
          th{background:#f9fafb;font-size:11px;text-transform:uppercase;color:#6b7280}
          .brand{font-size:13px;font-weight:800;color:#16a34a}
          .brand .email{font-weight:600;color:#6b7280;font-size:12px}
          .badge{display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;white-space:nowrap}
          .phone{font-size:10px;color:#9ca3af;font-family:monospace}
          .ts{font-size:10px;color:#6b7280;white-space:nowrap}
          .reason{font-size:11px;color:#b91c1c}
          td.muted{color:#d1d5db}
          .rtable th,.rtable td{padding:5px 8px}
          .rtable tr{break-inside:avoid}
          .foot{margin-top:32px;border-top:1px solid #e5e7eb;padding-top:12px;font-size:11px;color:#9ca3af}
          @media print{body{padding:0}.noprint{display:none}@page{margin:16mm}thead{display:table-header-group}}
        </style></head><body>
          <div class="head">
            <img class="logo" src="${esc(PLATFORM_LOGO)}" alt="Club Platform for Rotary" onerror="this.style.display='none'">
            <div class="brand"><span class="email">${esc(PLATFORM_EMAIL)}</span></div>
            <h1>Reporte de campaña WhatsApp${a ? '<span class="tag">Análisis IA</span>' : ''}</h1>
            <div class="meta">
              <b>${esc(c.name)}</b>${c.description ? ' — ' + esc(c.description) : ''}<br>
              Lista: ${esc(c.listName || 'N/D')} &nbsp;·&nbsp; Plantilla: ${esc(c.templateName || 'N/D')} &nbsp;·&nbsp; Enviada: ${esc(sentAt)}
            </div>
          </div>

          <div class="cards">
            ${card('Total', s.total, '100%', '#111827')}
            ${card('Enviados', s.sent, (s.sentPct ?? 0) + '%', '#059669')}
            ${card('Entregados', s.delivered, (s.deliveredPct ?? 0) + '%', '#2563eb')}
            ${card('Leídos', s.read, (s.readPct ?? 0) + '%', '#7c3aed')}
            ${card('Fallidos', s.failed, (s.failedPct ?? 0) + '%', '#dc2626')}
          </div>
          ${s.avgReadMin != null ? `<p class="muted">⏱ Tiempo medio de lectura: <b>${esc(s.avgReadMin)} min</b></p>` : ''}

          ${aiSection}

          ${errorsRows ? `<h2>Principales errores</h2><table><thead><tr><th>Error</th><th style="text-align:right">Cantidad</th></tr></thead><tbody>${errorsRows}</tbody></table>` : ''}

          ${recipients.length ? `
          <h2>Listado de destinatarios (${esc(recipients.length)})</h2>
          <p class="muted">Estado de cada mensaje. Para los fallidos se indica el motivo por el que no se entregó.</p>
          <table class="rtable">
            <thead><tr>
              <th>Contacto</th><th>Estado</th><th>Enviado</th><th>Entregado</th><th>Leído</th><th>Motivo del fallo</th>
            </tr></thead>
            <tbody>${recipientsRows}</tbody>
          </table>` : ''}

          ${failedList.length ? `
          <h2>Detalle de fallidos (${esc(failedList.length)})</h2>
          <table class="rtable">
            <thead><tr><th>Contacto</th><th>Teléfono</th><th>Motivo por el que no se envió</th></tr></thead>
            <tbody>${failedList.map(r => `<tr><td>${esc(r.name || '—')}</td><td class="ts">${esc(r.phone || '')}</td><td class="reason">${esc(r.errorReason || '—')}</td></tr>`).join('')}</tbody>
          </table>` : ''}

          <div class="foot">
            Reporte generado el ${esc(gen)} · Club Platform for Rotary · ${esc(PLATFORM_EMAIL)} · Análisis elaborado por el agente Data Analyst.
          </div>
          <div class="noprint" style="margin-top:24px;text-align:center">
            <button onclick="window.print()" style="background:#16a34a;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-weight:700;cursor:pointer">Imprimir / Guardar como PDF</button>
          </div>
        </body></html>`;
    };

    const resetForm = () => { setForm({ name: '', description: '', listId: '', templateId: '', mediaUrl: '' }); setEditId(null); };
    const startEdit = (c: any) => {
        const vars = (() => { try { return typeof c.templateVars === 'string' ? JSON.parse(c.templateVars) : (c.templateVars || {}); } catch { return {}; } })();
        setForm({ name: c.name, description: c.description || '', listId: c.listId || '', templateId: c.templateId || '', mediaUrl: vars.mediaUrl || '' });
        setEditId(c.id); setShowForm(true);
    };

    const statusBadge = (s: string) => {
        const map: any = {
            draft: { bg: 'bg-gray-100 text-gray-600', icon: <Edit3 className="w-3 h-3" />, label: 'Borrador' },
            sending: { bg: 'bg-blue-50 text-blue-700', icon: <Loader2 className="w-3 h-3 animate-spin" />, label: 'Enviando' },
            sent: { bg: 'bg-emerald-50 text-emerald-700', icon: <Check className="w-3 h-3" />, label: 'Enviado' },
            delivered: { bg: 'bg-blue-50 text-blue-700', icon: <CheckCheck className="w-3 h-3" />, label: 'Entregado' },
            read: { bg: 'bg-purple-50 text-purple-700', icon: <MailOpen className="w-3 h-3" />, label: 'Leído' },
            received: { bg: 'bg-gray-100 text-gray-600', icon: <CheckCircle2 className="w-3 h-3" />, label: 'Recibido' },
            pending: { bg: 'bg-amber-50 text-amber-700', icon: <Clock className="w-3 h-3" />, label: 'Pendiente' },
            failed: { bg: 'bg-red-50 text-red-600', icon: <XCircle className="w-3 h-3" />, label: 'Fallido' },
            paused: { bg: 'bg-amber-50 text-amber-700', icon: <Clock className="w-3 h-3" />, label: 'Pausada' },
        };
        const m = map[s] || map.draft;
        return <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold ${m.bg}`}>{m.icon}{m.label}</span>;
    };

    if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <p className="text-sm text-gray-500">{campaigns.length} campañas</p>
                <button onClick={() => { resetForm(); setShowForm(true); }}
                    className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-green-700 shadow-sm">
                    <Plus className="w-4 h-4" /> Nueva Campaña
                </button>
            </div>

            {showForm && (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6 shadow-sm">
                    <form onSubmit={handleSave} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required
                                placeholder="Nombre de la campaña" className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-500" />
                            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                                placeholder="Descripción" className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-500" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <select value={form.listId} onChange={e => setForm({ ...form, listId: e.target.value })}
                                className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white outline-none focus:border-green-500">
                                <option value="">— Seleccionar lista —</option>
                                {lists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.memberCount} contactos)</option>)}
                            </select>
                            <select value={form.templateId} onChange={e => setForm({ ...form, templateId: e.target.value, mediaUrl: '' })}
                                className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white outline-none focus:border-green-500">
                                <option value="">— Seleccionar template —</option>
                                {templates.map(t => (
                                    <option key={t.id} value={t.id}>
                                        {t.displayName || t.name}
                                        {t.headerType && ['IMAGE','VIDEO','DOCUMENT'].includes(t.headerType) ? ` 📎 ${t.headerType}` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {needsMedia && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    {selectedTemplate.headerType === 'IMAGE' ? <Image className="w-4 h-4 text-amber-600" /> 
                                        : selectedTemplate.headerType === 'VIDEO' ? <Video className="w-4 h-4 text-amber-600" />
                                        : <Link2 className="w-4 h-4 text-amber-600" />}
                                    <p className="text-xs font-bold text-amber-700 uppercase">
                                        URL del {selectedTemplate.headerType === 'IMAGE' ? 'imagen' : selectedTemplate.headerType === 'VIDEO' ? 'video' : 'documento'} del header
                                    </p>
                                </div>
                                <input value={form.mediaUrl} onChange={e => setForm({ ...form, mediaUrl: e.target.value })}
                                    placeholder={selectedTemplate.headerType === 'IMAGE'
                                        ? 'https://ejemplo.com/imagen.jpg'
                                        : selectedTemplate.headerType === 'VIDEO'
                                        ? 'https://ejemplo.com/video.mp4'
                                        : 'https://ejemplo.com/documento.pdf'}
                                    className="w-full px-3 py-2.5 rounded-lg border border-amber-300 text-sm outline-none focus:border-amber-500 bg-white" />
                                <p className="text-[10px] text-amber-500 mt-1.5">
                                    {selectedTemplate.headerType === 'IMAGE'
                                        ? 'Pega la URL de la imagen (JPG, PNG). Si dejas vacío se usará la imagen registrada en Meta.'
                                        : selectedTemplate.headerType === 'VIDEO'
                                        ? 'Pega la URL del video (MP4). Si dejas vacío se usará el video registrado en Meta.'
                                        : 'Pega la URL del documento (PDF). Si dejas vacío se usará el documento registrado en Meta.'}
                                </p>
                                {selectedTemplate.headerType === 'IMAGE' && (
                                    <>
                                        <div className="text-[10px] text-amber-600 mt-1.5 bg-amber-100/60 rounded-lg px-2.5 py-1.5">
                                            💡 Para mejor calidad: usa una imagen <b>horizontal (apaisada)</b> y de <b>alta resolución</b> (peso máx. 5 MB). WhatsApp recorta las imágenes muy verticales en el encabezado.
                                        </div>
                                        {form.mediaUrl.trim().startsWith('http') && (
                                            <div className="mt-2">
                                                <p className="text-[10px] font-bold text-amber-700 uppercase mb-1">Vista previa</p>
                                                <img src={form.mediaUrl.trim()} alt="Vista previa del encabezado"
                                                    className="max-h-40 rounded-lg border border-amber-200 object-contain bg-white"
                                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                    onLoad={(e) => { (e.target as HTMLImageElement).style.display = 'block'; }}
                                                />
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                        <div className="flex gap-2">
                            <button type="submit" className="bg-green-600 text-white px-5 py-2 rounded-lg font-bold text-sm hover:bg-green-700">
                                {editId ? 'Actualizar' : 'Crear Campaña'}
                            </button>
                            <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="text-gray-400 px-3"><X className="w-5 h-5" /></button>
                        </div>
                    </form>
                </div>
            )}

            {/* Campaigns Grid */}
            {campaigns.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
                    <Megaphone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="font-bold text-gray-400">Sin campañas</p>
                    <p className="text-sm text-gray-400 mt-1">Crea tu primera campaña de WhatsApp</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {campaigns.map(c => (
                        <div key={c.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4 flex-1">
                                    <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-green-600">
                                        <Megaphone className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="font-bold text-gray-900">{c.name}</h3>
                                            {statusBadge(c.status)}
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-gray-500">
                                            {c.listName && <span>📋 {c.listName}</span>}
                                            {c.templateDisplayName && <span>📄 {c.templateDisplayName}</span>}
                                            {c.sentAt && <span>📅 {new Date(c.sentAt).toLocaleString()}</span>}
                                        </div>
                                    </div>
                                </div>

                                {c.status === 'sent' && (
                                    <div className="flex items-center gap-4 mr-4 text-xs">
                                        <div className="text-center"><p className="font-black text-gray-900">{c.totalContacts}</p><p className="text-gray-400">Total</p></div>
                                        <div className="text-center"><p className="font-black text-emerald-600">{c.sent}</p><p className="text-gray-400">Enviados</p></div>
                                        <div className="text-center"><p className="font-black text-blue-600">{c.delivered}</p><p className="text-gray-400">Entregados</p></div>
                                        <div className="text-center"><p className="font-black text-purple-600">{c.read}</p><p className="text-gray-400">Leídos</p></div>
                                        <div className="text-center"><p className="font-black text-red-600">{c.failed}</p><p className="text-gray-400">Fallidos</p></div>
                                    </div>
                                )}

                                <div className="flex items-center gap-1">
                                    {(c.status === 'sent' || c.status === 'sending') && (
                                        <button onClick={() => openLogs(c.id)} className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600" title="Ver progreso / logs">
                                            <Eye className="w-4 h-4" />
                                        </button>
                                    )}
                                    {['draft', 'paused', 'failed'].includes(c.status) && (
                                        <>
                                            <button onClick={() => handleSend(c.id)} disabled={sending === c.id}
                                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 disabled:opacity-50">
                                                {sending === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} Enviar
                                            </button>
                                            <button onClick={() => startEdit(c)} className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600"><Edit3 className="w-4 h-4" /></button>
                                        </>
                                    )}
                                    {c.status === 'sending' && (
                                        <button onClick={() => handleSend(c.id)} disabled={sending === c.id}
                                            title="Si el envío se quedó detenido, reanúdalo (no reenvía a quien ya recibió)"
                                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 disabled:opacity-50">
                                            {sending === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} Reanudar
                                        </button>
                                    )}
                                    <button onClick={() => handleDelete(c.id)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Seguimiento (Tracker) Modal */}
            {viewLogs && (() => {
                const total = logs.length;
                const failed = logs.filter(l => l.status === 'failed').length;
                const read = logs.filter(l => l.status === 'read').length;
                const delivered = logs.filter(l => ['delivered', 'read'].includes(l.status)).length;
                const sent = logs.filter(l => ['sent', 'delivered', 'read'].includes(l.status)).length;
                const pct = (n: number) => total ? Math.round((n / total) * 100) : 0;
                const filtered = logs.filter(l => {
                    if (logFilter === 'all') return true;
                    if (logFilter === 'delivered') return ['delivered', 'read'].includes(l.status);
                    if (logFilter === 'read') return l.status === 'read';
                    if (logFilter === 'failed') return l.status === 'failed';
                    return true;
                });
                const camp = campaigns.find(c => c.id === viewLogs);
                const funnel = [
                    { key: 'all', label: 'Total', value: total, color: 'text-gray-900', sub: '100%' },
                    { key: 'sent', label: 'Enviados', value: sent, color: 'text-emerald-600', sub: `${pct(sent)}%` },
                    { key: 'delivered', label: 'Entregados', value: delivered, color: 'text-blue-600', sub: `${pct(delivered)}%` },
                    { key: 'read', label: 'Leídos', value: read, color: 'text-purple-600', sub: `${pct(read)}%` },
                    { key: 'failed', label: 'Fallidos', value: failed, color: 'text-red-600', sub: `${pct(failed)}%` },
                ];
                return (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setViewLogs(null)}>
                    <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-gray-900">Seguimiento de la campaña</h3>
                                {camp && <p className="text-xs text-gray-500 mt-0.5">{camp.name}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => downloadReport(viewLogs)} disabled={reportLoading}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 disabled:opacity-50"
                                    title="Genera un PDF con el resumen y un análisis del agente Data Analyst">
                                    {reportLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                                    {reportLoading ? 'Generando…' : 'Descargar PDF'}
                                </button>
                                <button onClick={() => setViewLogs(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                            </div>
                        </div>

                        {/* Embudo */}
                        <div className="p-5 border-b border-gray-100 grid grid-cols-5 gap-2">
                            {funnel.map(f => (
                                <button key={f.key}
                                    onClick={() => setLogFilter((f.key === 'sent' ? 'all' : f.key) as any)}
                                    className={`text-center rounded-xl border p-3 transition-colors ${(logFilter === f.key || (f.key === 'sent' && logFilter === 'all')) ? 'border-green-300 bg-green-50/40' : 'border-gray-100 hover:bg-gray-50'}`}>
                                    <p className={`text-2xl font-black ${f.color}`}>{f.value}</p>
                                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{f.label}</p>
                                    <p className="text-[10px] text-gray-400">{f.sub}</p>
                                </button>
                            ))}
                        </div>

                        {/* Informe analítico (agente Data Analyst) */}
                        <div className="px-5 py-4 border-b border-gray-100 shrink-0 max-h-64 overflow-auto">
                            <div className="flex items-center gap-2 mb-2">
                                <Sparkles className="w-4 h-4 text-green-600" />
                                <h4 className="text-sm font-bold text-gray-900">Informe analítico</h4>
                                <span className="text-[10px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">Data Analyst IA</span>
                            </div>
                            {reportFetching ? (
                                <div className="flex items-center gap-2 text-xs text-gray-400 py-3">
                                    <Loader2 className="w-4 h-4 animate-spin" /> Generando análisis con IA…
                                </div>
                            ) : report?.analysis ? (
                                <div className="space-y-3 text-sm text-gray-700">
                                    {report.analysis.resumen && (
                                        <p className="bg-gray-50 rounded-lg p-3 text-[13px] leading-relaxed">{report.analysis.resumen}</p>
                                    )}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        {[
                                            { t: 'Análisis', items: report.analysis.analisis, c: 'text-blue-700' },
                                            { t: 'Conclusiones', items: report.analysis.conclusiones, c: 'text-purple-700' },
                                            { t: 'Recomendaciones', items: report.analysis.recomendaciones, c: 'text-emerald-700' },
                                        ].map(sec => (
                                            <div key={sec.t}>
                                                <p className={`text-[11px] font-bold uppercase tracking-wide mb-1 ${sec.c}`}>{sec.t}</p>
                                                {Array.isArray(sec.items) && sec.items.length ? (
                                                    <ul className="list-disc pl-4 space-y-1 text-[12px] text-gray-600">
                                                        {sec.items.map((it: string, i: number) => <li key={i}>{it}</li>)}
                                                    </ul>
                                                ) : <p className="text-[12px] text-gray-300">—</p>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between gap-2 text-xs text-gray-400 py-2">
                                    <span>{report?.analysisError ? 'El análisis IA no está disponible en este momento.' : 'Análisis no cargado.'}</span>
                                    <button onClick={() => viewLogs && loadReport(viewLogs)}
                                        className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 font-bold hover:bg-gray-200">
                                        Reintentar
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Filtros */}
                        <div className="px-5 pt-3 flex gap-2">
                            {[
                                { k: 'all', l: 'Todos' }, { k: 'delivered', l: 'Entregados' },
                                { k: 'read', l: 'Leídos' }, { k: 'failed', l: 'Fallidos' },
                            ].map(t => (
                                <button key={t.k} onClick={() => setLogFilter(t.k as any)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${logFilter === t.k ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                                    {t.l}
                                </button>
                            ))}
                        </div>

                        <div className="overflow-auto flex-1 p-3">
                            {loadingLogs ? (
                                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
                            ) : filtered.length === 0 ? (
                                <p className="text-center text-sm text-gray-400 py-12">Sin registros para este filtro.</p>
                            ) : (
                            <table className="w-full text-left text-sm">
                                <thead><tr className="border-b border-gray-100 text-xs text-gray-400 uppercase font-bold">
                                    <th className="p-3">Contacto</th><th className="p-3">Estado</th>
                                    <th className="p-3">Enviado</th><th className="p-3">Entregado</th><th className="p-3">Leído</th>
                                    <th className="p-3">Error</th>
                                </tr></thead>
                                <tbody className="divide-y divide-gray-50">
                                    {filtered.map(l => (
                                        <tr key={l.id}>
                                            <td className="p-3">
                                                <div className="font-medium text-gray-900">{l.contactName || '—'}</div>
                                                <div className="text-[11px] font-mono text-gray-400">{l.phone}</div>
                                            </td>
                                            <td className="p-3">{statusBadge(l.status)}</td>
                                            <td className="p-3 text-[11px] text-gray-500">{fmt(l.sentAt)}</td>
                                            <td className="p-3 text-[11px] text-gray-500">{fmt(l.deliveredAt)}</td>
                                            <td className="p-3 text-[11px] text-gray-500">{fmt(l.readAt)}</td>
                                            <td className={`p-3 text-[11px] ${l.status === 'failed' ? 'text-red-500 font-medium' : 'text-gray-300'}`}>
                                                {l.errorMessage || (l.status === 'failed' ? 'Error de envío (Meta API)' : '—')}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            )}
                        </div>
                        <div className="px-5 py-2.5 border-t border-gray-100 bg-gray-50/50 text-[11px] text-gray-400">
                            Los estados (entregado/leído) se actualizan automáticamente conforme Meta los reporta. "Leído" = interacción del destinatario; las respuestas aparecen en la pestaña Chat.
                        </div>
                    </div>
                </div>
                );
            })()}
        </div>
    );
};

export default WhatsAppCampaigns;
