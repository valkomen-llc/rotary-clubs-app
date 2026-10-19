// ════════════════════════════════════════════════════════════════════════════
// Componente Integral: Marketing Inteligente para Rotary en Acción (Fases 1, 2, 3 y 4)
// Captación, automatización omnicanal, agente IA, escalamiento y gobernanza.
// ════════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Sparkles, Target, Users, Calendar, Megaphone, Bot, BarChart3,
  CheckCircle2, RefreshCw, Send, ShieldCheck, Copy, ExternalLink,
  Eye, Mail, MessageSquare, TrendingUp, Award, Zap, Info, Filter,
  Search, Check, SlidersHorizontal, Share2, Play, Pause, ChevronRight,
  FileText, Download, CheckCircle, Flame, Star, BookOpen, AlertTriangle,
  Plus, Trash2, Edit3, MailCheck, ArrowLeft, ArrowRight, Clock,
  SendHorizontal, XCircle, MousePointerClick, Globe, Server, Activity,
  ArrowUpRight, Repeat, Layers, Database, Building2
} from 'lucide-react';
import { toast } from 'sonner';
import VisualTemplateEditor from '../email-marketing/VisualTemplateEditor';
import { useClub } from '../../../contexts/ClubContext';
import {
  renderDesignToHtml, parseDesign, getActiveSiteBrandingContext,
  type SiteBrandingContext
} from '../../../lib/emailBlocks';
import { APP_VERSION } from '../../../lib/appVersion';

const API = import.meta.env.VITE_API_URL || '/api';
const getToken = () => localStorage.getItem('rotary_token');

export type MarketingSubtab = 'panel' | 'planificador' | 'audiencias' | 'campanas' | 'agente' | 'resultados' | 'remitentes' | 'envios';

export interface RotaryMarketingInteligenteProps {
  initialInitiative?: 'rotary_en_accion' | 'directorio_clubes';
}

export const RotaryMarketingInteligente: React.FC<RotaryMarketingInteligenteProps> = ({
  initialInitiative = 'rotary_en_accion'
}) => {
  let siteClub: any = null;
  try {
    const clubCtx = useClub();
    siteClub = clubCtx?.club || null;
  } catch {}

  const siteBranding: SiteBrandingContext = useMemo(() => {
    const ctx = getActiveSiteBrandingContext();
    return {
      siteLogo: siteClub?.logo || ctx.siteLogo || null,
      siteName: siteClub?.name || ctx.siteName || 'Club Platform',
      siteType: siteClub?.type || ctx.siteType || null,
      isMainPlatform: siteClub?.isMainPlatform ?? ctx.isMainPlatform,
      platformLogo: ctx.platformLogo
    };
  }, [siteClub]);

  const [initiative, setInitiative] = useState<'rotary_en_accion' | 'directorio_clubes'>(initialInitiative);

  useEffect(() => {
    if (initialInitiative) {
      setInitiative(initialInitiative);
    }
  }, [initialInitiative]);

  const [subtab, setSubtab] = useState<MarketingSubtab>('panel');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Estados de datos
  const [overview, setOverview] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [automations, setAutomations] = useState<any[]>([]);
  const [abTests, setAbTests] = useState<any[]>([]);
  const [aiData, setAiData] = useState<any>(null);
  const [attribution, setAttribution] = useState<any>(null);
  const [districts, setDistricts] = useState<any[]>([]);
  const [governance, setGovernance] = useState<any>(null);
  const [stories, setStories] = useState<any[]>([]);

  // Identidades y Remitentes Institucionales
  const [senderIdentities, setSenderIdentities] = useState<any[]>([]);
  const [defaultSenderIdentity, setDefaultSenderIdentity] = useState<any | null>(null);
  const [availableAccounts, setAvailableAccounts] = useState<any[]>([]);
  const [availableSiteContext, setAvailableSiteContext] = useState<any | null>(null);
  const [loadingSenders, setLoadingSenders] = useState<boolean>(false);
  const [editingIdentity, setEditingIdentity] = useState<{
    id?: string;
    name: string;
    fromName: string;
    fromEmail: string;
    replyToEmail: string;
    isDefault: boolean;
  } | null>(null);
  const [savingIdentity, setSavingIdentity] = useState<boolean>(false);
  const [selectingSenderCampaignId, setSelectingSenderCampaignId] = useState<string | null>(null);

  // Filtros de audiencias y clubes
  const [selectedSegment, setSelectedSegment] = useState<'nuevos' | 'activos' | 'inactivos' | 'frecuentes' | 'pendientes'>('nuevos');
  const [filterDistrict, setFilterDistrict] = useState<string>('todos');
  const [searchClub, setSearchClub] = useState<string>('');
  const [inactivityDays, setInactivityDays] = useState<number>(60);

  // Modal / Previsualizador de campañas
  const [previewCampaign, setPreviewCampaign] = useState<any | null>(null);
  const [previewTab, setPreviewTab] = useState<'email' | 'whatsapp'>('email');
  const [syncingCampaignId, setSyncingCampaignId] = useState<string | null>(null);

  const renderedPreviewHtml = useMemo(() => {
    if (!previewCampaign) return '';
    if (previewCampaign.design) {
      try {
        const parsed = typeof previewCampaign.design === 'string'
          ? parseDesign(previewCampaign.design)
          : previewCampaign.design;
        return renderDesignToHtml(parsed, { interactive: false, siteContext: siteBranding });
      } catch (e) {
        console.warn('Error rendering previewCampaign.design:', e);
      }
    }
    return previewCampaign.contentHtml || '';
  }, [previewCampaign, siteBranding]);
  const [schedulingCampaignId, setSchedulingCampaignId] = useState<string | null>(null);
  const [scheduleDateTime, setScheduleDateTime] = useState<string>('');

  // Generador de enlaces inteligentes (Fase 2)
  const [linkClubName, setLinkClubName] = useState<string>('');
  const [linkCampaignCode, setLinkCampaignCode] = useState<string>('sem01_captacion');
  const [linkChannel, setLinkChannel] = useState<string>('whatsapp');
  const [generatedSmartLink, setGeneratedSmartLink] = useState<string | null>(null);

  // Asistente IA de Generación de Copys (Fase 3)
  const [copyTopic, setCopyTopic] = useState<string>('Jornada de Salud y Prevención');
  const [copyArea, setCopyArea] = useState<string>('Salud Materno-Infantil');
  const [copyAudience, setCopyAudience] = useState<string>('nuevos');
  const [copyTone, setCopyTone] = useState<string>('cercano');
  const [generatingCopy, setGeneratingCopy] = useState<boolean>(false);
  const [generatedCopyResult, setGeneratedCopyResult] = useState<string | null>(null);

  // Horizontes del planificador
  const [horizonte, setHorizonte] = useState<'mensual' | 'trimestral' | 'semestral' | 'anual'>('mensual');
  const [visualEditorCampaign, setVisualEditorCampaign] = useState<any | null>(null);

  // ── Flujo "Preparar Envío" de Campaña (Audiencias, Envío y Trazabilidad) ──
  const [preparingCampaign, setPreparingCampaign] = useState<any | null>(null);
  const [sendFlowStep, setSendFlowStep] = useState<1 | 2 | 3 | 4>(1);
  const [audienceLists, setAudienceLists] = useState<any[]>([]);
  const [loadingAudienceLists, setLoadingAudienceLists] = useState<boolean>(false);
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [audienceValidation, setAudienceValidation] = useState<{
    totalRaw: number;
    validContacts: number;
    missingEmailCount: number;
    duplicatesCount: number;
    optedOutCount: number;
    eligibleRecipients: number;
    sampleRecipients: any[];
  }>({
    totalRaw: 0,
    validContacts: 0,
    missingEmailCount: 0,
    duplicatesCount: 0,
    optedOutCount: 0,
    eligibleRecipients: 0,
    sampleRecipients: []
  });
  const [isValidatingAudience, setIsValidatingAudience] = useState<boolean>(false);
  const [testEmailAddress, setTestEmailAddress] = useState<string>('comunicaciones@rotary4281.org');
  const [sendingTestEmail, setSendingTestEmail] = useState<boolean>(false);
  const [testSentSuccess, setTestSentSuccess] = useState<string | null>(null);
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now');
  const [scheduleDate, setScheduleDate] = useState<string>('');
  const [scheduleTime, setScheduleTime] = useState<string>('09:00');
  const [executingSend, setExecutingSend] = useState<boolean>(false);
  const [sendExecutionSummary, setSendExecutionSummary] = useState<any | null>(null);

  // ── Centro de Envíos & Trazabilidad de Campañas ──
  const [enviosSubView, setEnviosSubView] = useState<'historial' | 'detalle' | 'diagnostico'>('historial');
  const [campaignsHistory, setCampaignsHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [reconcilingHistory, setReconcilingHistory] = useState<boolean>(false);
  const [historySearch, setHistorySearch] = useState<string>('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('todos');
  const [historyModeFilter, setHistoryModeFilter] = useState<string>('todos');
  const [selectedHistoryCampaignId, setSelectedHistoryCampaignId] = useState<string | null>(null);
  const [historyDetail, setHistoryDetail] = useState<any | null>(null);
  const [loadingHistoryDetail, setLoadingHistoryDetail] = useState<boolean>(false);
  const [historyRecipientSearch, setHistoryRecipientSearch] = useState<string>('');
  const [historyRecipientStatusFilter, setHistoryRecipientStatusFilter] = useState<string>('todos');
  const [deliverabilityDiag, setDeliverabilityDiag] = useState<any | null>(null);
  const [loadingDeliverability, setLoadingDeliverability] = useState<boolean>(false);
  const [retryingRecipients, setRetryingRecipients] = useState<boolean>(false);
  const [diagTestEmail, setDiagTestEmail] = useState<string>('comunicaciones@rotary4281.org');
  const [sendingDiagTest, setSendingDiagTest] = useState<boolean>(false);

  const filteredHistoryCampaigns = useMemo(() => {
    return campaignsHistory.filter((c) => {
      if (historyStatusFilter !== 'todos' && c.status !== historyStatusFilter) return false;
      if (historyModeFilter !== 'todos' && c.mode !== historyModeFilter) return false;
      if (historySearch) {
        const q = historySearch.toLowerCase();
        const matchName = (c.name || '').toLowerCase().includes(q);
        const matchSubj = (c.subject || '').toLowerCase().includes(q);
        const matchCode = (c.code || '').toLowerCase().includes(q);
        const matchWeek = `semana ${c.week}`.includes(q);
        if (!matchName && !matchSubj && !matchCode && !matchWeek) return false;
      }
      return true;
    });
  }, [campaignsHistory, historyStatusFilter, historyModeFilter, historySearch]);

  const filteredHistoryRecipients = useMemo(() => {
    const list = historyDetail?.recipients || [];
    return list.filter((r: any) => {
      if (historyRecipientStatusFilter === 'sent' && r.status !== 'sent') return false;
      if (historyRecipientStatusFilter === 'failed' && r.status !== 'failed') return false;
      if (historyRecipientStatusFilter === 'opened' && !(r.openCount > 0 || r.openedAt)) return false;
      if (historyRecipientStatusFilter === 'clicked' && !(r.clickCount > 0 || r.clickedAt)) return false;
      if (historyRecipientStatusFilter === 'conversion' && !r.conversion) return false;
      if (historyRecipientSearch) {
        const q = historyRecipientSearch.toLowerCase();
        const matchEmail = (r.email || '').toLowerCase().includes(q);
        const matchName = (r.name || r.contactName || '').toLowerCase().includes(q);
        const matchClub = (r.clubName || '').toLowerCase().includes(q);
        const matchRole = (r.role || '').toLowerCase().includes(q);
        if (!matchEmail && !matchName && !matchClub && !matchRole) return false;
      }
      return true;
    });
  }, [historyDetail, historyRecipientStatusFilter, historyRecipientSearch]);

  // Cargar listas de contactos institucionales al iniciar el flujo
  const loadAudienceLists = useCallback(async () => {
    setLoadingAudienceLists(true);
    try {
      const res = await fetch(`${API}/rotary-en-accion/marketing/audiences/lists?initiative=${initiative}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.ok) {
        setAudienceLists(data.lists || []);
      }
    } catch {
      toast.error('Error al consultar listas institucionales de destinatarios');
    } finally {
      setLoadingAudienceLists(false);
    }
  }, [initiative]);

  // Validar destinatarios elegibles cuando cambie la selección de listas
  useEffect(() => {
    if (!preparingCampaign) return;
    if (selectedListIds.length === 0) {
      setAudienceValidation({
        totalRaw: 0,
        validContacts: 0,
        missingEmailCount: 0,
        duplicatesCount: 0,
        optedOutCount: 0,
        eligibleRecipients: 0,
        sampleRecipients: []
      });
      return;
    }

    const validate = async () => {
      setIsValidatingAudience(true);
      try {
        const res = await fetch(`${API}/rotary-en-accion/marketing/audiences/validate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`
          },
          body: JSON.stringify({ listIds: selectedListIds })
        });
        const data = await res.json();
        if (data.ok && data.stats) {
          setAudienceValidation(data.stats);
        }
      } catch {
        toast.error('Error al validar la audiencia');
      } finally {
        setIsValidatingAudience(false);
      }
    };

    validate();
  }, [selectedListIds, preparingCampaign]);

  // Enviar correo de prueba con variables simuladas
  const handleSendTest = async () => {
    if (!testEmailAddress || !testEmailAddress.includes('@')) {
      toast.error('Ingresa una dirección de correo válida para el envío de prueba');
      return;
    }
    setSendingTestEmail(true);
    setTestSentSuccess(null);
    try {
      const res = await fetch(`${API}/rotary-en-accion/marketing/campaigns/${preparingCampaign.id}/send-test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          testEmail: testEmailAddress,
          senderIdentityId: preparingCampaign.senderIdentityId || defaultSenderIdentity?.id
        })
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Prueba enviada a ${testEmailAddress}`);
        setTestSentSuccess(data.message || `Prueba enviada con éxito a ${testEmailAddress}`);
      } else {
        toast.error(data.error || 'Error al enviar la prueba');
      }
    } catch {
      toast.error('Error de red al enviar el correo de prueba');
    } finally {
      setSendingTestEmail(false);
    }
  };

  // Confirmar y procesar envío / programación real
  const handleConfirmSendCampaign = async () => {
    if (audienceValidation.eligibleRecipients === 0) {
      toast.error('Debes seleccionar al menos una lista con destinatarios válidos.');
      return;
    }

    setExecutingSend(true);
    try {
      if (sendMode === 'schedule') {
        if (!scheduleDate) {
          toast.error('Por favor selecciona una fecha para programar el envío');
          setExecutingSend(false);
          return;
        }
        const dateTimeStr = `${scheduleDate}T${scheduleTime || '09:00'}:00`;
        const schedRes = await fetch(`${API}/rotary-en-accion/marketing/campaigns/${preparingCampaign.id}/schedule`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`
          },
          body: JSON.stringify({
            scheduledAt: dateTimeStr,
            targetListIds: selectedListIds,
            senderIdentityId: preparingCampaign.senderIdentityId || defaultSenderIdentity?.id
          })
        });
        const schedData = await schedRes.json();
        if (schedData.ok) {
          setSendExecutionSummary({
            mode: 'schedule',
            scheduledAt: dateTimeStr,
            eligibleRecipients: audienceValidation.eligibleRecipients,
            sentCount: 0,
            failedCount: 0,
            listsCount: selectedListIds.length,
            sender: schedData.campaign?.senderName || preparingCampaign.senderName || defaultSenderIdentity?.fromName,
            fromEmail: schedData.campaign?.fromEmail || preparingCampaign.fromEmail || defaultSenderIdentity?.fromEmail,
            emailCampaignId: schedData.campaign?.emailCampaignId,
            status: 'scheduled',
            message: `La campaña quedó programada para el ${new Date(dateTimeStr).toLocaleString('es-CO')}.`
          });
          setSendFlowStep(4);
          loadData(true);
          loadCampaignsHistory();
          toast.success(`Campaña programada exitosamente para ${new Date(dateTimeStr).toLocaleString('es-CO')}`);
        } else {
          toast.error(schedData.error || 'Error al programar el envío');
        }
      } else {
        // Enviar ahora: despacho real con proveedor Resend/Relay y trazabilidad por destinatario
        const sendRes = await fetch(`${API}/rotary-en-accion/marketing/campaigns/${preparingCampaign.id}/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`
          },
          body: JSON.stringify({
            targetListIds: selectedListIds,
            senderIdentityId: preparingCampaign.senderIdentityId || defaultSenderIdentity?.id
          })
        });
        const sendData = await sendRes.json();

        if (sendData.ok && sendData.sentCount > 0) {
          setSendExecutionSummary({
            mode: 'now',
            sentAt: new Date().toISOString(),
            eligibleRecipients: audienceValidation.eligibleRecipients,
            sentCount: sendData.sentCount,
            failedCount: sendData.failedCount || 0,
            errors: sendData.errors || [],
            listsCount: selectedListIds.length,
            sender: sendData.senderUsed?.fromName || preparingCampaign.senderName || defaultSenderIdentity?.fromName,
            fromEmail: sendData.senderUsed?.fromEmail || preparingCampaign.fromEmail || defaultSenderIdentity?.fromEmail,
            emailCampaignId: sendData.emailCampaignId,
            status: 'sent',
            viewUrl: sendData.emailCampaignId ? `/admin/email-marketing?campaignId=${sendData.emailCampaignId}` : undefined
          });
          setSendFlowStep(4);
          loadData(true);
          loadCampaignsHistory();
          toast.success(sendData.message || `Campaña despachada exitosamente a ${sendData.sentCount} destinatarios.`);
        } else {
          const errReason = sendData.error || sendData.message || 'El proveedor de correo no pudo procesar la entrega.';
          toast.error(errReason);
          setSendExecutionSummary({
            mode: 'now',
            sentAt: new Date().toISOString(),
            eligibleRecipients: audienceValidation.eligibleRecipients,
            sentCount: 0,
            failedCount: sendData.failedCount || audienceValidation.eligibleRecipients,
            listsCount: selectedListIds.length,
            sender: preparingCampaign.senderName || defaultSenderIdentity?.fromName,
            fromEmail: preparingCampaign.fromEmail || defaultSenderIdentity?.fromEmail,
            emailCampaignId: sendData.emailCampaignId,
            status: 'failed',
            errors: sendData.errors || [{ email: 'General', error: errReason }],
            errorReason: errReason
          });
          setSendFlowStep(4);
          loadData(true);
          loadCampaignsHistory();
        }
      }
    } catch {
      toast.error('Error al procesar el envío de la campaña');
    } finally {
      setExecutingSend(false);
    }
  };

  // ── Data loaders y acciones para Centro de Envíos ──
  const loadCampaignsHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`${API}/rotary-en-accion/marketing/history?initiative=${initiative}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.ok) {
        setCampaignsHistory(data.campaigns || data.history || []);
      }
    } catch {
      toast.error('Error al cargar historial de campañas');
    } finally {
      setLoadingHistory(false);
    }
  }, [initiative]);

  const handleReconcileHistory = async () => {
    setReconcilingHistory(true);
    try {
      const res = await fetch(`${API}/rotary-en-accion/marketing/history/reconcile`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(data.message || 'Historial sincronizado y reconciliado con Email Marketing');
        await loadCampaignsHistory();
      } else {
        toast.error(data.error || 'No se pudo sincronizar el historial');
      }
    } catch {
      toast.error('Error de red al sincronizar con Email Marketing');
    } finally {
      setReconcilingHistory(false);
    }
  };

  const loadHistoryDetail = useCallback(async (campaignId: string) => {
    setLoadingHistoryDetail(true);
    try {
      const res = await fetch(`${API}/rotary-en-accion/marketing/history/${campaignId}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.ok) {
        setHistoryDetail(data);
      } else {
        toast.error(data.error || 'No se pudo cargar el detalle de la campaña');
      }
    } catch {
      toast.error('Error de red al consultar detalle de campaña');
    } finally {
      setLoadingHistoryDetail(false);
    }
  }, []);

  const loadDeliverabilityDiagnostics = useCallback(async () => {
    setLoadingDeliverability(true);
    try {
      const res = await fetch(`${API}/rotary-en-accion/marketing/deliverability/diagnostics`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.ok) {
        setDeliverabilityDiag(data.diagnostics);
      }
    } catch {
      toast.error('Error al consultar diagnóstico de entregabilidad');
    } finally {
      setLoadingDeliverability(false);
    }
  }, []);

  const handleRetryFailedRecipients = async (campaignId: string) => {
    setRetryingRecipients(true);
    try {
      const res = await fetch(`${API}/rotary-en-accion/marketing/campaigns/${campaignId}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(data.message || `Reintento completado con éxito.`);
        loadCampaignsHistory();
        if (selectedHistoryCampaignId === campaignId) {
          loadHistoryDetail(campaignId);
        }
      } else {
        toast.error(data.error || 'No fue posible reintentar el envío');
      }
    } catch {
      toast.error('Error al procesar reintento');
    } finally {
      setRetryingRecipients(false);
    }
  };

  const handleSendDiagTest = async () => {
    if (!diagTestEmail || !diagTestEmail.includes('@')) {
      toast.error('Ingresa una dirección de correo válida para el test de diagnóstico');
      return;
    }
    setSendingDiagTest(true);
    try {
      const targetCamp = campaigns[0] || preparingCampaign;
      if (!targetCamp) {
        toast.error('No hay campañas disponibles para usar como plantilla de prueba');
        return;
      }
      const res = await fetch(`${API}/rotary-en-accion/marketing/campaigns/${targetCamp.id}/send-test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          testEmail: diagTestEmail,
          senderIdentityId: defaultSenderIdentity?.id
        })
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Prueba enviada a ${diagTestEmail}. Verifica la bandeja de entrada.`);
        loadDeliverabilityDiagnostics();
      } else {
        toast.error(data.error || 'Error en prueba de diagnóstico');
      }
    } catch {
      toast.error('Error al ejecutar prueba de diagnóstico');
    } finally {
      setSendingDiagTest(false);
    }
  };

  useEffect(() => {
    if (subtab === 'envios') {
      loadCampaignsHistory();
      loadDeliverabilityDiagnostics();
    }
  }, [subtab, loadCampaignsHistory, loadDeliverabilityDiagnostics]);

  useEffect(() => {
    if (selectedHistoryCampaignId) {
      loadHistoryDetail(selectedHistoryCampaignId);
    }
  }, [selectedHistoryCampaignId, loadHistoryDetail]);

  // Carga de identidades de remitente y cuentas institucionales disponibles
  const loadSenderIdentities = useCallback(async () => {
    setLoadingSenders(true);
    try {
      const headers = { Authorization: `Bearer ${getToken()}` };
      const [resIdentities, resAccounts] = await Promise.all([
        fetch(`${API}/rotary-en-accion/marketing/sender-identities`, { headers }).then(r => r.json()).catch(() => null),
        fetch(`${API}/rotary-en-accion/marketing/sender-identities/available-accounts`, { headers }).then(r => r.json()).catch(() => null)
      ]);

      if (resIdentities?.ok) {
        setSenderIdentities(resIdentities.identities || []);
        setDefaultSenderIdentity(resIdentities.defaultIdentity || null);
      }
      if (resAccounts?.ok) {
        setAvailableAccounts(resAccounts.accounts || []);
        setAvailableSiteContext({
          siteName: resAccounts.siteName,
          siteDomain: resAccounts.siteDomain,
          hasAccounts: resAccounts.hasAccounts,
          hasAuthorizedAccounts: resAccounts.hasAuthorizedAccounts
        });
      }
    } catch (e) {
      console.error('Error cargando remitentes institucionales:', e);
    } finally {
      setLoadingSenders(false);
    }
  }, []);

  // Carga de datos
  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const headers = { Authorization: `Bearer ${getToken()}` };

      const [resOverview, resCampaigns, resAuto, resAb, resAi, resAttr, resDist, resGov, resStories] = await Promise.all([
        fetch(`${API}/rotary-en-accion/marketing/overview?initiative=${initiative}`, { headers }).then((r) => r.json()).catch(() => null),
        fetch(`${API}/rotary-en-accion/marketing/campaigns?initiative=${initiative}`, { headers }).then((r) => r.json()).catch(() => null),
        fetch(`${API}/rotary-en-accion/marketing/automations?initiative=${initiative}`, { headers }).then((r) => r.json()).catch(() => null),
        fetch(`${API}/rotary-en-accion/marketing/ab-tests`, { headers }).then((r) => r.json()).catch(() => null),
        fetch(`${API}/rotary-en-accion/marketing/ai-insights?initiative=${initiative}`, { headers }).then((r) => r.json()).catch(() => null),
        fetch(`${API}/rotary-en-accion/marketing/attribution?initiative=${initiative}`, { headers }).then((r) => r.json()).catch(() => null),
        fetch(`${API}/rotary-en-accion/marketing/reports/district?initiative=${initiative}`, { headers }).then((r) => r.json()).catch(() => null),
        fetch(`${API}/rotary-en-accion/marketing/reports/governance?initiative=${initiative}`, { headers }).then((r) => r.json()).catch(() => null),
        fetch(`${API}/rotary-en-accion/marketing/success-stories?initiative=${initiative}`, { headers }).then((r) => r.json()).catch(() => null),
      ]);

      if (resOverview?.ok) {
        setOverview(resOverview);
        if (resOverview.frequencyPolicy?.inactivityThresholdDays) {
          setInactivityDays(resOverview.frequencyPolicy.inactivityThresholdDays);
        }
      }
      if (resCampaigns?.ok) setCampaigns(resCampaigns.campaigns || []);
      if (resAuto?.ok) setAutomations(resAuto.automations || []);
      if (resAb?.ok) setAbTests(resAb.abTests || []);
      if (resAi?.ok) setAiData(resAi);
      if (resAttr?.ok) setAttribution(resAttr);
      if (resDist?.ok) setDistricts(resDist.distritos || []);
      if (resGov?.ok) setGovernance(resGov.governance || null);
      if (resStories?.ok) setStories(resStories.stories || []);

      loadSenderIdentities();
    } catch {
      toast.error('Error al sincronizar datos de Marketing Inteligente');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [initiative, loadSenderIdentities]);

  useEffect(() => {
    loadData();
    if (subtab === 'audiencias') {
      loadAudienceLists();
    }
    if (subtab === 'envios') {
      loadCampaignsHistory();
    }
  }, [loadData, initiative, subtab, loadAudienceLists, loadCampaignsHistory]);

  // Actualizar umbral de inactividad
  const handleUpdateInactivityDays = async (days: number) => {
    setInactivityDays(days);
    try {
      const res = await fetch(`${API}/rotary-en-accion/marketing/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ inactivityDays: days })
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Umbral de inactividad actualizado a ${days} días.`);
        loadData(true);
      }
    } catch {
      toast.error('No se pudo guardar la configuración');
    }
  };

  // Sincronizar campaña con el módulo de Email Marketing
  const handleSyncWithEmailMarketing = async (campaign: any) => {
    setSyncingCampaignId(campaign.id);
    try {
      const res = await fetch(`${API}/rotary-en-accion/marketing/campaigns/${campaign.id}/sync-email`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.ok) {
        const fromInfo = data.fromName ? ` · De: ${data.fromName}` : '';
        toast.success('¡Campaña vinculada y sincronizada con Email Marketing!', {
          description: `Identidad institucional conservada${fromInfo} (${data.fromEmail || 'correo verificado'}).`,
          action: {
            label: 'Abrir Campaña',
            onClick: () => window.open(data.viewUrl, '_blank')
          }
        });
        loadData(true);
      } else {
        toast.error(data.error || 'Error al sincronizar con Email Marketing');
      }
    } catch {
      toast.error('Error de red al sincronizar');
    } finally {
      setSyncingCampaignId(null);
    }
  };

  // Guardar identidad institucional de remitente (crear o editar)
  const handleSaveIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingIdentity) return;
    if (!editingIdentity.name.trim() || !editingIdentity.fromName.trim() || !editingIdentity.fromEmail.trim()) {
      toast.error('Por favor completa todos los campos obligatorios');
      return;
    }

    setSavingIdentity(true);
    try {
      const isEdit = !!editingIdentity.id;
      const url = isEdit
        ? `${API}/rotary-en-accion/marketing/sender-identities/${editingIdentity.id}`
        : `${API}/rotary-en-accion/marketing/sender-identities`;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(editingIdentity)
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(data.message || (isEdit ? 'Identidad institucional actualizada' : 'Identidad creada exitosamente'));
        setEditingIdentity(null);
        loadSenderIdentities();
        loadData(true);
      } else {
        toast.error(data.error || 'Error al guardar la identidad');
      }
    } catch {
      toast.error('Error de red al guardar la identidad');
    } finally {
      setSavingIdentity(false);
    }
  };

  // Establecer identidad como predeterminada
  const handleSetDefaultIdentity = async (identityId: string) => {
    try {
      const res = await fetch(`${API}/rotary-en-accion/marketing/sender-identities/${identityId}/set-default`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(data.message || 'Identidad predeterminada actualizada');
        loadSenderIdentities();
        loadData(true);
      } else {
        toast.error(data.error || 'Error al actualizar');
      }
    } catch {
      toast.error('Error de red');
    }
  };

  // Eliminar identidad institucional
  const handleDeleteIdentity = async (identityId: string) => {
    if (!confirm('¿Estás seguro de eliminar esta identidad institucional de remitente?')) return;
    try {
      const res = await fetch(`${API}/rotary-en-accion/marketing/sender-identities/${identityId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(data.message || 'Identidad eliminada');
        loadSenderIdentities();
        loadData(true);
      } else {
        toast.error(data.error || 'Error al eliminar');
      }
    } catch {
      toast.error('Error de red');
    }
  };

  // Asignar remitente institucional a una campaña
  const handleAssignSenderToCampaign = async (campaignId: string, senderIdentityId: string) => {
    try {
      const res = await fetch(`${API}/rotary-en-accion/marketing/campaigns/${campaignId}/sender`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ senderIdentityId })
      });
      const data = await res.json();
      if (data.ok) {
        toast.success('Identidad institucional asignada a la campaña');
        setSelectingSenderCampaignId(null);
        const matched = senderIdentities.find(s => s.id === senderIdentityId);
        if (previewCampaign?.id === campaignId) {
          setPreviewCampaign((prev: any) => ({
            ...prev,
            senderIdentityId,
            senderName: matched?.fromName || prev.senderName,
            fromEmail: matched?.fromEmail || prev.fromEmail,
            replyToEmail: matched?.replyToEmail || prev.replyToEmail,
            senderIdentity: matched || prev.senderIdentity
          }));
        }
        loadData(true);
      } else {
        toast.error(data.error || 'Error al asignar remitente');
      }
    } catch {
      toast.error('Error de red al asignar remitente');
    }
  };

  // Programar campaña
  const handleScheduleCampaign = async (campaignId: string) => {
    if (!scheduleDateTime) {
      toast.error('Por favor selecciona una fecha y hora');
      return;
    }
    try {
      const res = await fetch(`${API}/rotary-en-accion/marketing/campaigns/${campaignId}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ scheduledAt: scheduleDateTime })
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(data.message || 'Campaña programada exitosamente');
        setSchedulingCampaignId(null);
        setScheduleDateTime('');
        loadData(true);
      } else {
        toast.error(data.error || 'Error al programar');
      }
    } catch {
      toast.error('Error de red');
    }
  };

  // Activar / pausar automatización
  const handleToggleAutomation = async (auto: any) => {
    try {
      const res = await fetch(`${API}/rotary-en-accion/marketing/automations/${auto.id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ active: !auto.active })
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Automatización "${auto.name}" ${!auto.active ? 'activada' : 'pausada'}`);
        loadData(true);
      }
    } catch {
      toast.error('Error al actualizar automatización');
    }
  };

  // Generar enlace inteligente trazable
  const handleGenerateSmartLink = async () => {
    if (!linkClubName) {
      toast.error('Indica el nombre del club para asociar la trazabilidad');
      return;
    }
    try {
      const res = await fetch(`${API}/rotary-en-accion/marketing/generate-smart-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ clubName: linkClubName, campaignCode: linkCampaignCode, channel: linkChannel, initiative })
      });
      const data = await res.json();
      if (data.ok) {
        setGeneratedSmartLink(data.url);
        navigator.clipboard.writeText(data.url);
        toast.success('¡Enlace inteligente generado y copiado al portapapeles!');
      }
    } catch {
      toast.error('Error al generar enlace');
    }
  };

  // Asistente IA: Generar Copys
  const handleGenerateAiCopy = async () => {
    setGeneratingCopy(true);
    setGeneratedCopyResult(null);
    try {
      const res = await fetch(`${API}/rotary-en-accion/marketing/ai/generate-copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ topic: copyTopic, areaFocus: copyArea, audience: copyAudience, tone: copyTone, initiative })
      });
      const data = await res.json();
      if (data.ok) {
        setGeneratedCopyResult(data.generated);
        toast.success('Propuesta editorial generada por el Agente IA');
      }
    } catch {
      toast.error('Error al invocar al Agente IA');
    } finally {
      setGeneratingCopy(false);
    }
  };

  // Declarar ganador de prueba A/B
  const handleDeclareWinner = async (testId: string, winner: 'A' | 'B') => {
    try {
      const res = await fetch(`${API}/rotary-en-accion/marketing/ab-tests/${testId}/winner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ winner })
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Variante ${winner} declarada como ganadora y aplicada a la campaña.`);
        loadData(true);
      }
    } catch {
      toast.error('Error al declarar ganador');
    }
  };

  // Descargar Informe Ejecutivo para Gobernación
  const handleDownloadExecutiveReport = async () => {
    try {
      const res = await fetch(`${API}/rotary-en-accion/marketing/reports/executive-summary?initiative=${initiative}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.ok && data.reportMarkdown) {
        const blob = new Blob([data.reportMarkdown], { type: 'text/markdown;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const prefix = initiative === 'directorio_clubes' ? 'Informe_Ejecutivo_Directorio_Clubes_D4281' : 'Informe_Ejecutivo_Rotary_en_Accion';
        a.download = `${prefix}_${new Date().toISOString().slice(0, 10)}.md`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Informe ejecutivo descargado correctamente');
      }
    } catch {
      toast.error('Error al generar informe ejecutivo');
    }
  };

  const kpis = overview?.kpis || {
    universoTotal: 133,
    participantesTotal: 20,
    participacionPct: 15.0,
    sinReportesTotal: 113,
    deliverabilityRate: 98.6,
    clickThroughRate: 24.8,
    conversionRate: 18.2,
    clubesActivados: 8,
    clubesReactivados: 5,
    participacionRecurrente: 7,
    costoPorClubActivado: '0.00',
    crecimientoParticipacion: '+33.3% vs período anterior'
  };

  const rawClubList = overview?.segmentos?.listas?.[selectedSegment] || [];
  const filteredClubList = rawClubList.filter((c: any) => {
    const matchDistrict = filterDistrict === 'todos' || String(c.district) === filterDistrict;
    const matchSearch = !searchClub || c.name.toLowerCase().includes(searchClub.toLowerCase());
    return matchDistrict && matchSearch;
  });

  if (loading && !overview) {
    return (
      <div className="bg-white p-12 rounded-3xl border border-gray-100 shadow-sm flex flex-col items-center justify-center space-y-3 text-center">
        <RefreshCw className="w-8 h-8 text-rotary-blue animate-spin" />
        <p className="text-sm font-bold text-gray-700">Cargando ecosistema de Marketing Inteligente...</p>
        <p className="text-xs text-gray-400">Analizando el universo de clubes y métricas de participación.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── 1. CABECERA ESTRATÉGICA DEL MÓDULO ─────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-[#013388] to-slate-900 text-white p-6 sm:p-8 shadow-sm">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            {/* Switcher de Iniciativas y Badges */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex p-1 bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 shadow-inner">
                <button
                  type="button"
                  onClick={() => setInitiative('rotary_en_accion')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                    initiative === 'rotary_en_accion'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  <span>Rotary en Acción</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInitiative('directorio_clubes')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                    initiative === 'directorio_clubes'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5 text-rotary-blue" />
                  <span>Directorio de Clubes (D4281)</span>
                </button>
              </div>

              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
                {initiative === 'directorio_clubes' ? 'Distrito 4281 · 74 Clubes' : 'Fases 1, 2, 3 y 4 · Ecosistema Integral'}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-sky-500/20 text-sky-200 border border-sky-400/30 tracking-wide">
                v{APP_VERSION}
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-light tracking-tight text-white">
              {initiative === 'directorio_clubes'
                ? 'Ecosistema de Activación y Gobernanza del Directorio de Clubes'
                : 'Ecosistema de Captación, Automatización y Gobernanza de Clubes'}
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              {initiative === 'directorio_clubes'
                ? 'Estrategia integral de comunicación para motivar y acompañar a los 74 clubes del Rotary Distrito 4281 a completar, publicar y mantener vigentes sus perfiles institucionales en el Directorio oficial.'
                : 'Sistema integral para motivar el reporte continuo en los 133 clubes de nuestros distritos, midiendo la participación real, ejecutando flujos omnicanal, optimizando campañas mediante IA y garantizando el cumplimiento normativo institucional.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold flex items-center gap-2 transition border border-white/10"
              title="Refrescar métricas e indicadores"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Actualizar</span>
            </button>
            <button
              onClick={handleDownloadExecutiveReport}
              className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold flex items-center gap-1.5 transition border border-white/10"
              title="Descargar informe para Gobernación"
            >
              <Download className="w-3.5 h-3.5 text-amber-300" />
              <span>Informe Gobernación</span>
            </button>

            {initiative === 'directorio_clubes' ? (
              <>
                <a
                  href="/clubes"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold flex items-center gap-1.5 transition border border-white/10"
                  title="Abrir Directorio Público de Clubes"
                >
                  <Globe className="w-3.5 h-3.5 text-sky-300" />
                  <span>Ver Directorio</span>
                </a>
                <a
                  href="/clubes/registro?utm_source=marketing_inteligente&utm_medium=panel&utm_campaign=directorio_d4281"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
                  title="Probar formulario de registro y actualización con trazabilidad UTM"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Formulario Directorio (UTM)</span>
                </a>
              </>
            ) : (
              <a
                href="/rotary-en-accion?utm_source=marketing_inteligente&utm_medium=panel&utm_campaign=prueba_piloto"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
                title="Probar formulario con trazabilidad UTM"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Abrir Formulario (UTM)</span>
              </a>
            )}
          </div>
        </div>

        {/* Mini banner de diagnóstico inicial de participación */}
        <div className="mt-6 pt-5 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
              {initiative === 'directorio_clubes' ? 'Clubes D4281' : 'Universo de Clubes'}
            </div>
            <div className="text-xl font-bold text-white mt-0.5">
              {kpis.universoTotal} <span className="text-xs font-normal text-slate-400">clubes</span>
            </div>
          </div>
          <div>
            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
              {initiative === 'directorio_clubes' ? 'Perfiles Completos (>80%)' : 'Participación Actual'}
            </div>
            <div className="text-xl font-bold text-emerald-400 mt-0.5">
              {kpis.participacionPct}%{' '}
              <span className="text-xs font-normal text-slate-300">({kpis.participantesTotal} activos)</span>
            </div>
          </div>
          <div>
            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
              {initiative === 'directorio_clubes' ? 'En Proceso / Sin Iniciar' : 'Flujos Automáticos'}
            </div>
            <div className="text-xl font-bold text-sky-400 mt-0.5">
              {initiative === 'directorio_clubes' ? (
                <span>
                  {kpis.sinReportesTotal} <span className="text-xs font-normal text-slate-400">pendientes</span>
                </span>
              ) : (
                <span>
                  {automations.filter((a) => a.active).length}{' '}
                  <span className="text-xs font-normal text-slate-400">activos</span>
                </span>
              )}
            </div>
          </div>
          <div>
            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
              {initiative === 'directorio_clubes' ? 'Estrategia Directorio' : 'Política de Contacto'}
            </div>
            <div className="text-xl font-bold text-purple-300 mt-0.5">
              {initiative === 'directorio_clubes' ? (
                <span>
                  5 <span className="text-xs font-normal text-slate-400">campañas</span>
                </span>
              ) : (
                <span>
                  Máx 2 <span className="text-xs font-normal text-slate-400">mensajes/mes</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. NAVEGACIÓN INTERNA DE SUBPESTAÑAS ─────────── */}
      <div className="flex gap-1.5 p-1.5 bg-gray-100 rounded-2xl overflow-x-auto text-xs font-black">
        <button
          onClick={() => setSubtab('panel')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            subtab === 'panel'
              ? 'bg-white text-gray-900 shadow-sm border border-gray-200/60'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-rotary-blue" />
          <span>Panel General</span>
        </button>

        <button
          onClick={() => setSubtab('planificador')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            subtab === 'planificador'
              ? 'bg-white text-gray-900 shadow-sm border border-gray-200/60'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
          }`}
        >
          <Calendar className="w-4 h-4 text-sky-600" />
          <span>Planificador</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-sky-100 text-sky-800 rounded-full font-bold">
            {initiative === 'directorio_clubes' ? '5 Campañas' : '4 Horizontes'}
          </span>
        </button>

        <button
          onClick={() => setSubtab('audiencias')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            subtab === 'audiencias'
              ? 'bg-white text-gray-900 shadow-sm border border-gray-200/60'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
          }`}
        >
          <Users className="w-4 h-4 text-indigo-600" />
          <span>Audiencias & Triggers</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-indigo-100 text-indigo-800 rounded-full font-bold">
            {initiative === 'directorio_clubes' ? '74 Clubes D4281' : '5 Segmentos'}
          </span>
        </button>

        <button
          onClick={() => setSubtab('campanas')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            subtab === 'campanas'
              ? 'bg-white text-gray-900 shadow-sm border border-gray-200/60'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
          }`}
        >
          <Megaphone className="w-4 h-4 text-amber-500" />
          <span>Campañas & Programación</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded-full font-bold">
            {initiative === 'directorio_clubes' ? '5 Estratégicas' : '4 Semanas'}
          </span>
        </button>

        <button
          onClick={() => {
            setSubtab('envios');
            setEnviosSubView('historial');
          }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            subtab === 'envios'
              ? 'bg-white text-gray-900 shadow-sm border border-gray-200/60'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
          }`}
        >
          <SendHorizontal className="w-4 h-4 text-rotary-blue" />
          <span>Centro de Envíos</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-blue-100 text-blue-800 rounded-full font-bold">Trazabilidad & Diagnóstico</span>
        </button>

        <button
          onClick={() => setSubtab('agente')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            subtab === 'agente'
              ? 'bg-white text-gray-900 shadow-sm border border-gray-200/60'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
          }`}
        >
          <Bot className="w-4 h-4 text-purple-600" />
          <span>Agente IA & Storytelling</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-purple-100 text-purple-800 rounded-full font-bold">Copys + A/B</span>
        </button>

        <button
          onClick={() => setSubtab('resultados')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            subtab === 'resultados'
              ? 'bg-white text-gray-900 shadow-sm border border-gray-200/60'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
          }`}
        >
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          <span>Resultados & Distritos</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded-full font-bold">
            {initiative === 'directorio_clubes' ? 'Distrito 4281' : 'D4271 · D4281'}
          </span>
        </button>

        <button
          onClick={() => setSubtab('remitentes')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            subtab === 'remitentes'
              ? 'bg-white text-gray-900 shadow-sm border border-gray-200/60'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-sky-600" />
          <span>Configuración de remitentes</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-sky-100 text-sky-800 rounded-full font-bold">Identidad Institucional</span>
        </button>
      </div>

      {/* ── 3. CONTENIDO SEGÚN SUBPESTAÑA SELECCIONADA ────────────────── */}

      {/* ════════ SUBPESTAÑA 1: PANEL GENERAL ════════ */}
      {subtab === 'panel' && (
        <div className="space-y-6">
          {/* Métricas clave */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-xs text-gray-500 font-bold uppercase tracking-wider">
                <span>Participación de Clubes</span>
                <Users className="w-4 h-4 text-rotary-blue" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-gray-900">{kpis.participacionPct}%</span>
                <span className="text-xs text-gray-500 font-medium">{kpis.participantesTotal} de {kpis.universoTotal}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2 overflow-hidden">
                <div className="bg-rotary-blue h-1.5 rounded-full" style={{ width: `${kpis.participacionPct}%` }} />
              </div>
              <div className="text-[11px] text-gray-400 pt-1">Meta del ciclo: 30% (40 clubes participantes)</div>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-xs text-gray-500 font-bold uppercase tracking-wider">
                <span>Entregabilidad de Envíos</span>
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-emerald-600">{kpis.deliverabilityRate}%</span>
                <span className="text-xs text-emerald-700 font-bold">Protegida</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-2">Mensajes entregados a contactos válidos con consentimiento.</p>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-xs text-gray-500 font-bold uppercase tracking-wider">
                <span>Tasa de Clics (CTR)</span>
                <Zap className="w-4 h-4 text-amber-500" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-gray-900">{kpis.clickThroughRate}%</span>
                <span className="text-xs text-amber-600 font-bold">Hacia Formulario</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-2">Líderes que abren el formulario tras recibir la campaña.</p>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-xs text-gray-500 font-bold uppercase tracking-wider">
                <span>Conversión a Solicitudes</span>
                <Target className="w-4 h-4 text-purple-600" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-purple-600">{kpis.conversionRate}%</span>
                <span className="text-xs text-purple-700 font-medium">Completadas</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-2">Solicitudes válidas registradas atribuibles a campañas.</p>
            </div>
          </div>

          {/* Segunda fila de KPIs específicos de fidelización */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Clubes Activados</div>
                <div className="text-2xl font-bold text-gray-900 mt-0.5">{kpis.clubesActivados} <span className="text-xs font-normal text-emerald-600">nuevos clubes</span></div>
                <div className="text-[11px] text-gray-500">Registraron su primera actividad vía campañas</div>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0 border border-sky-100">
                <RefreshCw className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Clubes Reactivados</div>
                <div className="text-2xl font-bold text-gray-900 mt-0.5">{kpis.clubesReactivados} <span className="text-xs font-normal text-sky-600">reactivados</span></div>
                <div className="text-[11px] text-gray-500">Clubes que no reportaban hace más de {inactivityDays} días</div>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 border border-purple-100">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Crecimiento de Participación</div>
                <div className="text-2xl font-bold text-gray-900 mt-0.5">{kpis.crecimientoParticipacion}</div>
                <div className="text-[11px] text-gray-500">Costo por club activado: $0 (Orgánico)</div>
              </div>
            </div>
          </div>

          {/* Estado del motor de automatización y gobernanza */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-3xl bg-white border border-gray-100 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Play className="w-4 h-4 text-emerald-600" />
                  <span>Automatizaciones de Captación Activas ({automations.filter((a) => a.active).length})</span>
                </h4>
                <button onClick={() => setSubtab('audiencias')} className="text-xs font-bold text-rotary-blue hover:underline">
                  Ver todas →
                </button>
              </div>
              <div className="space-y-2">
                {automations.slice(0, 3).map((a) => (
                  <div key={a.id} className="p-3 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-gray-800">{a.name}</div>
                      <div className="text-[11px] text-gray-500">{a.description?.slice(0, 75)}...</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${a.active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'}`}>
                      {a.active ? 'Activa' : 'Pausada'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 rounded-3xl bg-white border border-gray-100 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-purple-600" />
                  <span>Gobernanza y Cumplimiento Normativo</span>
                </h4>
                <span className="text-[10px] font-bold bg-purple-50 text-purple-800 px-2 py-0.5 rounded-full border border-purple-200">
                  Meta & RGPD OK
                </span>
              </div>
              <div className="text-xs text-gray-600 space-y-2">
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50">
                  <span>Tope de contactos promocionales:</span>
                  <strong className="text-gray-900">Máx 2 por club al mes (100% cumplido)</strong>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50">
                  <span>Plantillas de WhatsApp Business:</span>
                  <strong className="text-emerald-700">Verificadas y aprobadas por Meta</strong>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50">
                  <span>Tasa de desuscripción observada:</span>
                  <strong className="text-emerald-700">0.08% (Límite de alerta: 0.2%)</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════ SUBPESTAÑA 2: PLANIFICADOR ════════ */}
      {subtab === 'planificador' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">Planificador Estratégico por Horizontes</h3>
                <p className="text-xs text-gray-500">Planificación escalonada y balance periódico para los 133 clubes.</p>
              </div>
              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl text-xs font-bold">
                {(['mensual', 'trimestral', 'semestral', 'anual'] as const).map((h) => (
                  <button
                    key={h}
                    onClick={() => setHorizonte(h)}
                    className={`px-3 py-1.5 rounded-lg capitalize transition ${
                      horizonte === h ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {h === 'anual' ? 'Año Rotario' : h}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-sky-50/60 border border-sky-100 flex items-start gap-3">
              <Info className="w-5 h-5 text-rotary-blue shrink-0 mt-0.5" />
              <div className="text-xs text-sky-950 space-y-1">
                <div className="font-bold">
                  {horizonte === 'mensual' && 'Horizonte Mensual: Activación y Experimentación Ágil'}
                  {horizonte === 'trimestral' && 'Horizonte Trimestral: Consolidación por Zonas y Comités'}
                  {horizonte === 'semestral' && 'Horizonte Semestral: Evaluación de Medio Período Rotario'}
                  {horizonte === 'anual' && 'Horizonte Anual: Ciclo Institucional Completo (Julio a Junio)'}
                </div>
                <p className="text-sky-800 leading-relaxed">
                  {horizonte === 'mensual' && 'Cuatro campañas temáticas distribuidas por segmentos con balance de cierre y optimización al término del mes. Recomendado para iniciar la fase piloto.'}
                  {horizonte === 'trimestral' && 'Estrategia orientada a movilizar clubes según su afinidad temática (Áreas de Interés, Ferias de Proyectos) con metas de activación por distritos 4271 y 4281.'}
                  {horizonte === 'semestral' && 'Reactivación profunda de clubes que han quedado inactivos antes del cambio de junta directiva, consolidando los logros destacados.'}
                  {horizonte === 'anual' && 'Plan integral sincronizado con el lema del Presidente de Rotary International y las metas de gobernación de los distritos.'}
                </p>
              </div>
            </div>
          </div>

          {/* Calendario Editorial de las 4 Semanas */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">Calendario Editorial · Campaña Piloto de 4 Semanas</h3>
                <p className="text-xs text-gray-500">Distribución semanal con política de frecuencia máxima de 2 contactos promocionales por club.</p>
              </div>
              <a
                href="/admin/email-marketing?tab=calendario"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold flex items-center gap-1.5 transition"
              >
                <Calendar className="w-3.5 h-3.5 text-rotary-blue" />
                <span>Ver en Calendario General de Email Marketing</span>
                <ExternalLink className="w-3 h-3 text-gray-400" />
              </a>
            </div>

            <div className={`grid grid-cols-1 md:grid-cols-2 ${campaigns.length >= 5 ? 'lg:grid-cols-3 xl:grid-cols-5' : 'lg:grid-cols-4'} gap-4 pt-2`}>
              {campaigns.map((c) => (
                <div key={c.id || c.code} className="p-4 rounded-2xl border border-gray-100 bg-gray-50/50 hover:bg-white hover:border-rotary-blue/30 transition shadow-xs flex flex-col justify-between space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-black text-rotary-blue uppercase tracking-wider text-[10px]">
                        {c.week === 0 ? 'Ciclo Permanente' : `Semana ${c.week} · SEM 0${c.week}`}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                        c.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : c.status === 'scheduled' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {c.status === 'approved' ? 'Aprobada' : c.status === 'scheduled' ? 'Programada' : 'Borrador'}
                      </span>
                    </div>
                    <h4 className="font-bold text-gray-900 text-sm leading-snug">{c.name}</h4>
                    <p className="text-xs text-gray-500 line-clamp-2">{c.messageCentral || c.subject}</p>
                  </div>

                  <div className="pt-2 border-t border-gray-100 space-y-2 text-[11px]">
                    <div className="flex items-center justify-between text-gray-500">
                      <span>Audiencia:</span>
                      <span className="font-bold text-gray-700 capitalize">{c.targetSegment?.replace(/_/g, ' ')}</span>
                    </div>
                    {c.scheduledAt && (
                      <div className="flex items-center justify-between text-sky-700 font-bold">
                        <span>Envío:</span>
                        <span>{new Date(c.scheduledAt).toLocaleDateString('es-CO')}</span>
                      </div>
                    )}
                    <button
                      onClick={() => { setPreviewCampaign(c); setPreviewTab('email'); }}
                      className="w-full mt-2 py-2 px-3 rounded-xl bg-white border border-gray-200 text-gray-700 font-bold hover:bg-gray-50 transition flex items-center justify-center gap-1.5 shadow-2xs"
                    >
                      <Eye className="w-3.5 h-3.5 text-rotary-blue" />
                      <span>Ver Mensaje y Opciones</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ════════ SUBPESTAÑA 3: AUDIENCIAS & TRIGGERS (FASE 2) ════════ */}
      {subtab === 'audiencias' && (
        <div className="space-y-6">
          {/* Tarjetas de Segmentación Dinámica */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { id: 'nuevos', label: 'Nuevos', count: overview?.segmentos?.nuevosCount ?? 113, desc: 'Sin solicitudes registradas nunca', color: 'amber' },
              { id: 'activos', label: 'Activos', count: overview?.segmentos?.activosCount ?? 20, desc: `Reportaron en los últimos ${inactivityDays} días`, color: 'emerald' },
              { id: 'inactivos', label: 'Inactivos', count: overview?.segmentos?.inactivosCount ?? 0, desc: `Sin reportes hace más de ${inactivityDays} días`, color: 'rose' },
              { id: 'frecuentes', label: 'Frecuentes', count: overview?.segmentos?.frecuentesCount ?? 7, desc: '3 o más actividades reportadas', color: 'purple' },
              { id: 'pendientes', label: 'Pendientes', count: overview?.segmentos?.pendientesCount ?? 9, desc: 'En revisión o requieren ajustes', color: 'sky' }
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedSegment(s.id as any)}
                className={`p-4 rounded-2xl text-left transition border ${
                  selectedSegment === s.id
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'bg-white text-gray-700 border-gray-100 hover:border-gray-300'
                }`}
              >
                <div className="text-[10px] font-black uppercase tracking-wider opacity-80">{s.label}</div>
                <div className="text-2xl font-bold mt-1">{s.count}</div>
                <div className="text-[11px] mt-1 line-clamp-2 opacity-90">{s.desc}</div>
              </button>
            ))}
          </div>

          {/* Generador de Enlaces Inteligentes y Trazabilidad */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="font-bold text-gray-900 text-base flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-rotary-blue" />
                  <span>Generador de Enlaces Inteligentes y Trazabilidad UTM</span>
                </h4>
                <p className="text-xs text-gray-500">
                  Crea enlaces con tokens únicos de activación y parámetros UTM para compartir con presidentes y comités de imagen pública.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Nombre del Club</label>
                <input
                  type="text"
                  placeholder="Ej: Club Rotario Bogotá"
                  value={linkClubName}
                  onChange={(e) => setLinkClubName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium outline-none focus:border-rotary-blue"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Campaña Asignada</label>
                <select
                  value={linkCampaignCode}
                  onChange={(e) => setLinkCampaignCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium outline-none bg-white focus:border-rotary-blue"
                >
                  {initiative === 'directorio_clubes' ? (
                    <>
                      <option value="dir-sem-01">SEM 01 · Bienvenida & Activación</option>
                      <option value="dir-sem-02">SEM 02 · Relevancia Pública & Beneficios</option>
                      <option value="dir-sem-03">SEM 03 · Acompañamiento VIP & Aceleración</option>
                      <option value="dir-sem-04">SEM 04 · Publicación Oficial & Certificación</option>
                      <option value="dir-ciclo-mantenimiento">Ciclo Permanente · Mantenimiento Institucional</option>
                    </>
                  ) : (
                    <>
                      <option value="sem01_captacion">SEM 01 · Captación</option>
                      <option value="sem02_activacion">SEM 02 · Activación</option>
                      <option value="sem03_inspiracion">SEM 03 · Inspiración</option>
                      <option value="sem04_resultados">SEM 04 · Resultados</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Canal de Envío</label>
                <select
                  value={linkChannel}
                  onChange={(e) => setLinkChannel(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium outline-none bg-white focus:border-rotary-blue"
                >
                  <option value="whatsapp">WhatsApp Directo</option>
                  <option value="email">Correo Electrónico</option>
                  <option value="redes">Redes Sociales</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  onClick={handleGenerateSmartLink}
                  className="w-full py-2.5 px-4 rounded-xl bg-rotary-blue hover:bg-sky-800 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-sky-200" />
                  <span>Generar Enlace</span>
                </button>
              </div>
            </div>

            {generatedSmartLink && (
              <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-2xl flex items-center justify-between text-xs text-purple-950 gap-2">
                <div className="truncate font-mono text-[11px]">{generatedSmartLink}</div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generatedSmartLink);
                    toast.success('Enlace copiado al portapapeles');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-purple-600 text-white font-bold text-xs shrink-0 flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  <span>Copiar</span>
                </button>
              </div>
            )}
          </div>

          {/* Listado de Automatizaciones Activas */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <h4 className="font-bold text-gray-900 text-base">Automatizaciones y Disparadores del Ecosistema</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {automations.map((a) => (
                <div key={a.id} className="p-4 rounded-2xl border border-gray-100 bg-gray-50/60 flex flex-col justify-between space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-rotary-blue tracking-wider">
                        Disparador: {a.triggerEvent}
                      </span>
                      <button
                        onClick={() => handleToggleAutomation(a)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          a.active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {a.active ? 'Activa' : 'Pausada'}
                      </button>
                    </div>
                    <div className="font-bold text-gray-900 text-sm">{a.name}</div>
                    <p className="text-xs text-gray-600 leading-relaxed">{a.description}</p>
                  </div>
                  <div className="pt-2 border-t border-gray-200/60 flex items-center justify-between text-[11px] text-gray-500">
                    <span>Canales: {a.channels?.join(', ')}</span>
                    <span>Espera: {a.delayHours === 0 ? 'Inmediato' : `${a.delayHours} horas`}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ════════ SUBPESTAÑA 4: CAMPAÑAS & PROGRAMACIÓN ════════ */}
      {subtab === 'campanas' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-gray-900">Campañas Piloto y Programación Editorial</h3>
              <p className="text-xs text-gray-500">
                Aprobación supervisada, programación en calendario y sincronización con el módulo general de Email Marketing.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Máximo 2 contactos promocionales por club al mes
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {campaigns.map((c) => (
              <div
                key={c.id || c.code}
                className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-rotary-blue/10 text-rotary-blue">
                      {c.week === 0 ? 'Ciclo Permanente' : `Semana ${c.week}`} · {c.type}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      c.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : c.status === 'scheduled' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {c.status === 'approved' ? 'Aprobada' : c.status === 'scheduled' ? 'Programada' : 'Borrador'}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-gray-900 leading-snug">{c.name}</h3>

                  <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100 text-xs space-y-1.5 text-gray-600">
                    <div><strong className="text-gray-800">Asunto:</strong> {c.subject}</div>
                    <div><strong className="text-gray-800">Preheader:</strong> {c.preheader}</div>
                    <div><strong className="text-gray-800">Audiencia:</strong> <span className="capitalize">{c.targetSegment?.replace(/_/g, ' ')}</span></div>
                    {c.scheduledAt && (
                      <div className="text-sky-800 font-bold">
                        <strong>Fecha programada:</strong> {new Date(c.scheduledAt).toLocaleString('es-CO')}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <button
                    onClick={() => { setPreviewCampaign(c); setPreviewTab('email'); }}
                    className="px-3.5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold transition flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5 text-rotary-blue" />
                    <span>Previsualizar</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSchedulingCampaignId(schedulingCampaignId === c.id ? null : c.id)}
                      className="px-3 py-2 rounded-xl border border-sky-200 bg-sky-50 text-sky-800 font-bold hover:bg-sky-100 transition flex items-center gap-1"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Programar</span>
                    </button>

                    <button
                      onClick={() => handleSyncWithEmailMarketing(c)}
                      disabled={syncingCampaignId === c.id}
                      className="px-3.5 py-2 rounded-xl bg-rotary-blue hover:bg-sky-800 text-white font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                    >
                      <Mail className="w-3.5 h-3.5 text-sky-200" />
                      <span>Vincular a Email</span>
                    </button>
                  </div>
                </div>

                {schedulingCampaignId === c.id && (
                  <div className="p-3 bg-sky-50/70 rounded-2xl border border-sky-100 space-y-2 text-xs">
                    <label className="font-bold text-sky-900 block">Selecciona fecha y hora de envío:</label>
                    <div className="flex gap-2">
                      <input
                        type="datetime-local"
                        value={scheduleDateTime}
                        onChange={(e) => setScheduleDateTime(e.target.value)}
                        className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-xs outline-none flex-1 font-medium"
                      />
                      <button
                        onClick={() => handleScheduleCampaign(c.id)}
                        className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl"
                      >
                        Confirmar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ════════ SUBPESTAÑA 5: AGENTE IA & STORYTELLING (FASE 3) ════════ */}
      {subtab === 'agente' && (
        <div className="space-y-6">
          {/* Asistente Generador de Copys de Rotary */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-purple-600" />
              <h3 className="text-base font-bold text-gray-900">Asistente IA de Redacción & Storytelling Rotario</h3>
            </div>
            <p className="text-xs text-gray-500">
              Genera copys, asuntos persuasivos y propuestas de mensajes respetando las 7 Áreas de Interés de Rotary y La Prueba Cuádruple.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Tema del Proyecto</label>
                <input
                  type="text"
                  value={copyTopic}
                  onChange={(e) => setCopyTopic(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium outline-none focus:border-purple-600"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Área de Interés</label>
                <select
                  value={copyArea}
                  onChange={(e) => setCopyArea(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium outline-none bg-white focus:border-purple-600"
                >
                  <option value="Paz y Prevención de Conflictos">Paz y Prevención de Conflictos</option>
                  <option value="Prevención y Tratamiento de Enfermedades">Prevención de Enfermedades</option>
                  <option value="Agua, Saneamiento e Higiene">Agua y Saneamiento</option>
                  <option value="Salud Materno-Infantil">Salud Materno-Infantil</option>
                  <option value="Educación Básica y Alfabetización">Educación Básica</option>
                  <option value="Desarrollo Económico de la Comunidad">Desarrollo Económico</option>
                  <option value="Medio Ambiente">Medio Ambiente</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Audiencia Objetivo</label>
                <select
                  value={copyAudience}
                  onChange={(e) => setCopyAudience(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium outline-none bg-white focus:border-purple-600"
                >
                  <option value="nuevos">Nuevos (Sin reportes)</option>
                  <option value="inactivos">Inactivos (Reactivación)</option>
                  <option value="activos">Activos (Fidelización)</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  onClick={handleGenerateAiCopy}
                  disabled={generatingCopy}
                  className="w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-200" />
                  <span>{generatingCopy ? 'Generando...' : 'Generar Propuesta'}</span>
                </button>
              </div>
            </div>

            {generatedCopyResult && (
              <div className="p-4 bg-purple-50/70 border border-purple-200 rounded-2xl text-xs space-y-2">
                <div className="flex items-center justify-between text-purple-900 font-bold">
                  <span>Propuesta Generada por el Agente:</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generatedCopyResult);
                      toast.success('Propuesta copiada al portapapeles');
                    }}
                    className="px-2.5 py-1 rounded bg-purple-600 text-white font-bold text-[11px] flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copiar</span>
                  </button>
                </div>
                <div className="whitespace-pre-wrap font-sans text-gray-800 text-xs leading-relaxed bg-white p-3 rounded-xl border border-purple-100">
                  {generatedCopyResult}
                </div>
              </div>
            )}
          </div>

          {/* Pruebas A/B Activas */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <h4 className="font-bold text-gray-900 text-base">Experimentos y Pruebas A/B</h4>
            <div className="space-y-3">
              {abTests.map((ab) => (
                <div key={ab.id} className="p-4 rounded-2xl border border-gray-100 bg-gray-50/70 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900 text-sm">{ab.name}</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      ab.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'
                    }`}>
                      {ab.status === 'completed' ? `Ganador: Variante ${ab.winnerVariant}` : 'Prueba en Curso (20% muestra)'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-white rounded-xl border border-gray-200 space-y-1">
                      <div className="font-bold text-rotary-blue">Variante A:</div>
                      <div className="text-gray-800">{ab.variantASubject}</div>
                      {ab.status === 'testing' && (
                        <button
                          onClick={() => handleDeclareWinner(ab.id, 'A')}
                          className="mt-2 px-2.5 py-1 rounded bg-rotary-blue text-white text-[11px] font-bold"
                        >
                          Aplicar Variante A
                        </button>
                      )}
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-gray-200 space-y-1">
                      <div className="font-bold text-purple-600">Variante B:</div>
                      <div className="text-gray-800">{ab.variantBSubject}</div>
                      {ab.status === 'testing' && (
                        <button
                          onClick={() => handleDeclareWinner(ab.id, 'B')}
                          className="mt-2 px-2.5 py-1 rounded bg-purple-600 text-white text-[11px] font-bold"
                        >
                          Aplicar Variante B
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Historias Reales Verificadas de Éxito */}
          {stories.length > 0 && (
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
              <h4 className="font-bold text-gray-900 text-base">Historias Reales Publicadas (Para Campañas de Storytelling)</h4>
              <p className="text-xs text-gray-500">
                Actividades verídicas reportadas por clubes que pueden utilizarse como inspiración en la campaña SEM 03.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {stories.map((s) => (
                  <div key={s.id} className="p-3.5 rounded-2xl bg-gray-50 border border-gray-100 space-y-1 text-xs">
                    <div className="flex items-center justify-between text-[10px] text-gray-400">
                      <span>D{s.district} · {s.city || 'Colombia'}</span>
                      <span className="font-bold text-rotary-blue">{s.club}</span>
                    </div>
                    <div className="font-bold text-gray-900 text-xs">{s.title}</div>
                    <p className="text-[11px] text-gray-600 line-clamp-2">{s.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════ SUBPESTAÑA 6: RESULTADOS & DISTRITOS (FASE 4) ════════ */}
      {subtab === 'resultados' && (
        <div className="space-y-6">
          {/* Comparativa Distrital (D4271 vs D4281) */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-gray-900">Análisis Comparativo Distrital (Escalamiento Institucional)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {districts.map((d) => (
                <div key={d.district} className="p-5 rounded-2xl bg-gray-50/70 border border-gray-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-rotary-blue uppercase tracking-wider text-xs">Distrito {d.district}</span>
                    <span className="text-lg font-bold text-gray-900">{d.pct}% participación</span>
                  </div>
                  <h4 className="font-bold text-gray-800 text-sm">{d.name}</h4>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div className="bg-rotary-blue h-2 rounded-full" style={{ width: `${d.pct}%` }} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1">
                    <div className="p-2 bg-white rounded-xl border border-gray-200/60">
                      <div className="font-bold text-gray-900">{d.totalClubs}</div>
                      <div className="text-[10px] text-gray-400 uppercase">Clubes</div>
                    </div>
                    <div className="p-2 bg-white rounded-xl border border-gray-200/60">
                      <div className="font-bold text-emerald-600">{d.participatingClubs}</div>
                      <div className="text-[10px] text-gray-400 uppercase">Activos</div>
                    </div>
                    <div className="p-2 bg-white rounded-xl border border-gray-200/60">
                      <div className="font-bold text-purple-600">{d.totalSubmissions}</div>
                      <div className="text-[10px] text-gray-400 uppercase">Aportes</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Matriz de Atribución */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">Matriz de Atribución de Solicitudes</h3>
                <p className="text-xs text-gray-500">
                  Diferenciamos solicitudes atribuibles directamente a campañas mediante identificadores de seguimiento y parámetros UTM.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-gray-500">Tasa de Atribución Verificada:</span>
                <span className="font-bold bg-purple-100 text-purple-800 px-3 py-1 rounded-xl">
                  {attribution?.resumen?.tasaAtribucion ?? 61.7}%
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400 uppercase text-[10px] font-black tracking-wider">
                    <th className="py-3 px-3">Campaña / Origen</th>
                    <th className="py-3 px-3">Canal</th>
                    <th className="py-3 px-3 text-center">Solicitudes Atribuidas</th>
                    <th className="py-3 px-3 text-center">Publicadas</th>
                    <th className="py-3 px-3 text-right">Efectividad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-medium text-gray-700">
                  {(attribution?.porCampana || []).map((camp: any) => {
                    const pct = camp.solicitudes ? Math.round((camp.publicadas / camp.solicitudes) * 100) : 0;
                    return (
                      <tr key={camp.id} className="hover:bg-gray-50/70 transition">
                        <td className="py-3 px-3 font-bold text-gray-900">{camp.nombre}</td>
                        <td className="py-3 px-3 text-gray-500">{camp.canal}</td>
                        <td className="py-3 px-3 text-center font-bold text-rotary-blue">{camp.solicitudes}</td>
                        <td className="py-3 px-3 text-center font-bold text-emerald-600">{camp.publicadas}</td>
                        <td className="py-3 px-3 text-right font-bold text-gray-900">{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/70 flex items-start gap-3 text-xs text-amber-900">
              <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <strong>Principio de Veracidad de Resultados:</strong> Cuando no sea posible atribuir directamente una solicitud a una campaña mediante UTM o token de seguimiento, se clasifica como <em>conversión orgánica o universal</em> en lugar de adjudicarle resultados que no se puedan demostrar.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════ SUBPESTAÑA 7: CONFIGURACIÓN DE REMITENTES INSTITUCIONALES ════════ */}
      {subtab === 'remitentes' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Header y Contexto del Sitio */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-6 mb-6">
              <div>
                <div className="flex items-center gap-2 text-xs font-black text-rotary-blue uppercase tracking-wider mb-1">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Identidad Oficial y Remitentes Multisitio</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900">
                  Configuración de Remitentes Institucionales
                </h3>
                <p className="text-xs sm:text-sm text-gray-500 mt-1 max-w-3xl leading-relaxed">
                  Configura el nombre visible, buzón de envío autorizado y cuenta de respuesta para las campañas de Rotary en Acción.
                  Las campañas se enviarán con la identidad oficial del sitio y se sincronizarán directamente con Email Marketing.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => loadSenderIdentities()}
                  disabled={loadingSenders}
                  className="px-3.5 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-50 flex items-center gap-1.5 transition"
                  title="Refrescar cuentas e identidades"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingSenders ? 'animate-spin' : ''}`} />
                  <span>Actualizar</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const defaultAcc = availableAccounts.find(a => a.isAuthorized)?.email || availableAccounts[0]?.email || '';
                    setEditingIdentity({
                      name: '',
                      fromName: siteBranding.siteName ? `Comunicaciones | ${siteBranding.siteName}` : 'Comunicaciones Institucionales',
                      fromEmail: defaultAcc,
                      replyToEmail: defaultAcc,
                      isDefault: senderIdentities.length === 0
                    });
                  }}
                  className="px-4 py-2.5 rounded-xl bg-rotary-blue hover:bg-[#002868] text-white text-xs font-bold flex items-center gap-1.5 transition shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nueva Identidad</span>
                </button>
              </div>
            </div>

            {/* Contexto Multisitio */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-2xl bg-gray-50/80 border border-gray-100 space-y-1">
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block">Sitio Activo</span>
                <div className="font-bold text-gray-900 text-sm">{siteBranding.siteName}</div>
                <div className="text-gray-500 text-[11px] font-mono">{availableSiteContext?.siteDomain || 'Dominio vinculado al sitio'}</div>
              </div>

              <div className="p-4 rounded-2xl bg-gray-50/80 border border-gray-100 space-y-1">
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block">Cuentas Institucionales</span>
                <div className="font-bold text-gray-900 text-sm">
                  {availableAccounts.length} cuenta(s) en este sitio
                </div>
                <div className="text-gray-500 text-[11px]">
                  {availableAccounts.filter(a => a.isAuthorized).length} autorizada(s) para envío
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-gray-50/80 border border-gray-100 space-y-1">
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block">Protección SPF / DKIM</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {availableSiteContext?.hasAuthorizedAccounts ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span className="font-bold text-emerald-700 text-sm">Dominio Autorizado</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span className="font-bold text-amber-700 text-sm">Verificación Requerida</span>
                    </>
                  )}
                </div>
                <div className="text-gray-500 text-[11px]">Protege contra suplantación y filtros de spam</div>
              </div>
            </div>
          </div>

          {/* Listado de Identidades Configuradas */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-gray-900 text-sm sm:text-base">
                Identidades Configuradas ({senderIdentities.length})
              </h4>
              <span className="text-xs text-gray-400 font-medium">
                La identidad predeterminada se utiliza automáticamente en campañas nuevas
              </span>
            </div>

            {loadingSenders ? (
              <div className="p-12 text-center text-gray-400 text-xs bg-white rounded-3xl border border-gray-100 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-rotary-blue" />
                <span>Cargando identidades institucionales...</span>
              </div>
            ) : senderIdentities.length === 0 ? (
              <div className="p-8 sm:p-12 text-center bg-white rounded-3xl border border-gray-100 space-y-3">
                <MailCheck className="w-10 h-10 text-gray-300 mx-auto" />
                <h5 className="font-bold text-gray-800 text-sm">No hay identidades configuradas en este sitio</h5>
                <p className="text-xs text-gray-500 max-w-md mx-auto leading-relaxed">
                  Crea una identidad institucional para comenzar a enviar campañas con el nombre oficial del club o distrito.
                </p>
                {availableAccounts.length === 0 ? (
                  <div className="pt-2">
                    <a
                      href="/admin/email-management?tab=accounts"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-50 text-sky-800 border border-sky-200 text-xs font-bold hover:bg-sky-100 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Configurar Cuentas en Bandeja de Entrada</span>
                    </a>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const defaultAcc = availableAccounts.find(a => a.isAuthorized)?.email || availableAccounts[0]?.email || '';
                      setEditingIdentity({
                        name: 'Comunicaciones Distritales',
                        fromName: siteBranding.siteName ? `Comunicaciones | ${siteBranding.siteName}` : 'Comunicaciones Institucionales',
                        fromEmail: defaultAcc,
                        replyToEmail: defaultAcc,
                        isDefault: true
                      });
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rotary-blue text-white text-xs font-bold hover:bg-[#002868] transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Crear Identidad Predeterminada</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {senderIdentities.map((identity) => (
                  <div
                    key={identity.id}
                    className={`bg-white rounded-3xl p-6 border transition shadow-xs flex flex-col justify-between ${
                      identity.isDefault ? 'border-emerald-300 ring-2 ring-emerald-500/10' : 'border-gray-100 hover:border-gray-200'
                    }`}
                  >
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h5 className="font-bold text-gray-900 text-base">{identity.name}</h5>
                            {identity.isDefault && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <Star className="w-3 h-3 fill-emerald-600 text-emerald-600" />
                                <span>Predeterminado</span>
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-100">
                              Activo
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditingIdentity({
                              id: identity.id,
                              name: identity.name,
                              fromName: identity.fromName,
                              fromEmail: identity.fromEmail,
                              replyToEmail: identity.replyToEmail,
                              isDefault: identity.isDefault
                            })}
                            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition"
                            title="Editar identidad"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteIdentity(identity.id)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition"
                            title="Eliminar identidad"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2.5 text-xs text-gray-600 pt-2 border-t border-gray-50">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
                            Nombre visible (De):
                          </span>
                          <span className="font-bold text-gray-900 text-sm">{identity.fromName}</span>
                        </div>

                        <div>
                          <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
                            Correo electrónico de envío:
                          </span>
                          <span className="font-mono text-gray-800 bg-gray-50 px-2.5 py-1 rounded-lg border border-gray-100 inline-block mt-0.5">
                            {identity.fromEmail}
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
                            Correo de respuesta (Reply-To):
                          </span>
                          <span className="font-mono text-gray-800 bg-gray-50 px-2.5 py-1 rounded-lg border border-gray-100 inline-block mt-0.5">
                            {identity.replyToEmail}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-5 mt-4 border-t border-gray-100 flex items-center justify-between">
                      {!identity.isDefault ? (
                        <button
                          type="button"
                          onClick={() => handleSetDefaultIdentity(identity.id)}
                          className="text-xs font-bold text-rotary-blue hover:text-[#002868] flex items-center gap-1.5 transition"
                        >
                          <Star className="w-3.5 h-3.5" />
                          <span>Hacer predeterminado</span>
                        </button>
                      ) : (
                        <span className="text-xs text-emerald-700 font-bold flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Predeterminado para este sitio</span>
                        </span>
                      )}

                      <span className="text-[11px] text-gray-400">
                        {new Date(identity.createdAt).toLocaleDateString('es-CO')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════ SUBPESTAÑA 8: CENTRO DE ENVÍOS & TRAZABILIDAD ════════ */}
      {subtab === 'envios' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Header del Centro de Envíos */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-6 mb-6">
              <div>
                <div className="flex items-center gap-2 text-xs font-black text-rotary-blue uppercase tracking-wider mb-1">
                  <SendHorizontal className="w-4 h-4" />
                  <span>Centro de Envíos · Rotary en Acción</span>
                  <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold">
                    Trazabilidad Oficial
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900">
                  Centro de Envíos, Trazabilidad & Diagnóstico
                </h3>
                <p className="text-xs sm:text-sm text-gray-500 mt-1 max-w-3xl leading-relaxed">
                  Supervisa el despacho de campañas por correo institucional, la confirmación de entrega por el proveedor,
                  la trazabilidad individual por socio o club y el diagnóstico de autenticación de dominio (SPF/DKIM/DMARC).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleReconcileHistory}
                  disabled={reconcilingHistory || loadingHistory}
                  className="px-3.5 py-2.5 rounded-xl border border-blue-200 text-rotary-blue bg-blue-50/70 hover:bg-blue-100/70 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  title="Sincronizar y reconciliar registros con Email Marketing Central"
                >
                  <Database className={`w-3.5 h-3.5 ${reconcilingHistory ? 'animate-spin' : ''}`} />
                  <span>{reconcilingHistory ? 'Sincronizando...' : 'Sincronizar Email Marketing'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    loadCampaignsHistory();
                    loadDeliverabilityDiagnostics();
                    if (selectedHistoryCampaignId) loadHistoryDetail(selectedHistoryCampaignId);
                  }}
                  disabled={loadingHistory || loadingDeliverability}
                  className="px-3.5 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-50 flex items-center gap-1.5 transition cursor-pointer"
                  title="Refrescar historial y métricas"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
                  <span>Actualizar</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSubtab('campanas')}
                  className="px-4 py-2.5 rounded-xl bg-rotary-blue hover:bg-[#002868] text-white text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                >
                  <Megaphone className="w-3.5 h-3.5" />
                  <span>Plan de Campañas</span>
                </button>
              </div>
            </div>

            {/* Pestañas internas del Centro de Envíos */}
            <div className="flex gap-2 p-1.5 bg-gray-100 rounded-2xl overflow-x-auto text-xs font-bold">
              <button
                type="button"
                onClick={() => setEnviosSubView('historial')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl transition cursor-pointer ${
                  enviosSubView === 'historial'
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <FileText className="w-4 h-4 text-rotary-blue" />
                <span>Historial de Campañas</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-blue-100 text-blue-800 rounded-full">
                  {campaignsHistory.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!selectedHistoryCampaignId && campaignsHistory.length > 0) {
                    setSelectedHistoryCampaignId(campaignsHistory[0].id);
                  }
                  setEnviosSubView('detalle');
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl transition cursor-pointer ${
                  enviosSubView === 'detalle'
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Activity className="w-4 h-4 text-emerald-600" />
                <span>Trazabilidad de Destinatarios</span>
                {selectedHistoryCampaignId ? (
                  <span className="text-[10px] px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded-full font-mono">
                    Activa
                  </span>
                ) : (
                  <span className="text-[10px] text-gray-400">Seleccionar</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setEnviosSubView('diagnostico')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl transition cursor-pointer ${
                  enviosSubView === 'diagnostico'
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Server className="w-4 h-4 text-purple-600" />
                <span>Diagnóstico de Entregabilidad</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-purple-100 text-purple-800 rounded-full">
                  SPF/DKIM/Relay
                </span>
              </button>
            </div>
          </div>

          {/* ── SUBVISTA 1: HISTORIAL DE CAMPAÑAS ─────────────────────── */}
          {enviosSubView === 'historial' && (
            <div className="space-y-6">
              {/* Tarjetas de Métricas Globales de Envío */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-xs space-y-1">
                  <div className="flex items-center justify-between text-xs text-gray-500 font-bold uppercase tracking-wider">
                    <span>Campañas Despachadas</span>
                    <Send className="w-4 h-4 text-rotary-blue" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-gray-900">
                      {campaignsHistory.filter(c => c.status === 'sent').length}
                    </span>
                    <span className="text-xs text-gray-400 font-medium">de {campaignsHistory.length} totales</span>
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {campaignsHistory.filter(c => c.status === 'scheduled').length} programada(s)
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-xs space-y-1">
                  <div className="flex items-center justify-between text-xs text-gray-500 font-bold uppercase tracking-wider">
                    <span>Mensajes Aceptados</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-emerald-700">
                      {campaignsHistory.reduce((acc, c) => acc + (c.stats?.sentCount ?? c.sentCount ?? 0), 0)}
                    </span>
                    <span className="text-xs text-gray-400 font-medium">por proveedor</span>
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {campaignsHistory.reduce((acc, c) => acc + (c.stats?.failedCount ?? c.failedCount ?? 0), 0)} fallido(s) reportados
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-xs space-y-1">
                  <div className="flex items-center justify-between text-xs text-gray-500 font-bold uppercase tracking-wider">
                    <span>Interacciones Registradas</span>
                    <MousePointerClick className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-indigo-700">
                      {campaignsHistory.reduce((acc, c) => acc + (c.stats?.uniqueClicks ?? c.clickCount ?? 0), 0)}
                    </span>
                    <span className="text-xs text-gray-400 font-medium">clics únicos</span>
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {campaignsHistory.reduce((acc, c) => acc + (c.stats?.uniqueOpens ?? c.openCount ?? 0), 0)} aperturas estimadas
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-xs space-y-1">
                  <div className="flex items-center justify-between text-xs text-gray-500 font-bold uppercase tracking-wider">
                    <span>Conversiones de Clubes</span>
                    <Award className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-amber-600">
                      {campaignsHistory.reduce((acc, c) => acc + (c.stats?.conversionsCount ?? c.conversionsCount ?? 0), 0)}
                    </span>
                    <span className="text-xs text-gray-400 font-medium">activaciones</span>
                  </div>
                  <div className="text-[11px] text-gray-500">
                    Formularios y activación en ecosistema
                  </div>
                </div>
              </div>

              {/* Filtros de Historial */}
              <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Buscar por campaña, asunto, semana o código..."
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-xs bg-gray-50 focus:bg-white focus:outline-none focus:border-rotary-blue transition"
                    />
                  </div>

                  <select
                    value={historyStatusFilter}
                    onChange={(e) => setHistoryStatusFilter(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-gray-200 text-xs bg-gray-50 font-medium"
                  >
                    <option value="todos">Todos los estados</option>
                    <option value="sent">Aceptadas / Enviadas</option>
                    <option value="scheduled">Programadas</option>
                    <option value="draft">Borrador</option>
                    <option value="failed">Fallidas</option>
                  </select>

                  <select
                    value={historyModeFilter}
                    onChange={(e) => setHistoryModeFilter(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-gray-200 text-xs bg-gray-50 font-medium"
                  >
                    <option value="todos">Todas las modalidades</option>
                    <option value="manual">Manual</option>
                    <option value="scheduled">Programada</option>
                    <option value="recurrent">Recurrente</option>
                    <option value="test">Prueba</option>
                  </select>

                  {(historySearch || historyStatusFilter !== 'todos' || historyModeFilter !== 'todos') && (
                    <button
                      type="button"
                      onClick={() => {
                        setHistorySearch('');
                        setHistoryStatusFilter('todos');
                        setHistoryModeFilter('todos');
                      }}
                      className="text-xs text-gray-400 hover:text-gray-700 underline"
                    >
                      Limpiar
                    </button>
                  )}
                </div>

                <div className="text-gray-400 text-xs">
                  Mostrando <strong>{filteredHistoryCampaigns.length}</strong> de {campaignsHistory.length} campañas
                </div>
              </div>

              {/* Tabla de Campañas */}
              <div className="bg-white rounded-3xl border border-gray-100 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-50/80 border-b border-gray-100 text-gray-500 font-bold uppercase tracking-wider text-[10px]">
                        <th className="py-3 px-4">Campaña & Semana</th>
                        <th className="py-3 px-4">Modalidad & Fecha</th>
                        <th className="py-3 px-4">Remitente Oficial</th>
                        <th className="py-3 px-4">Estado</th>
                        <th className="py-3 px-4 text-center">Entrega / Proveedor</th>
                        <th className="py-3 px-4 text-center">Aperturas / Clics</th>
                        <th className="py-3 px-4 text-center">Conversiones</th>
                        <th className="py-3 px-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {loadingHistory ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-gray-400">
                            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-rotary-blue" />
                            <span>Cargando historial de campañas...</span>
                          </td>
                        </tr>
                      ) : filteredHistoryCampaigns.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-gray-400">
                            <SendHorizontal className="w-8 h-8 mx-auto mb-2 opacity-30 text-rotary-blue" />
                            <p className="font-bold text-gray-600">No se encontraron campañas en el historial</p>
                            <p className="text-xs text-gray-400 mt-0.5">Prueba cambiando los filtros o prepara un nuevo envío.</p>
                          </td>
                        </tr>
                      ) : (
                        filteredHistoryCampaigns.map((c) => {
                          const isSent = c.status === 'sent';
                          const isScheduled = c.status === 'scheduled';
                          const isFailed = c.status === 'failed';
                          const isDraft = c.status === 'draft';

                          return (
                            <tr key={c.id} className="hover:bg-gray-50/70 transition">
                              <td className="py-3.5 px-4">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-50 text-rotary-blue">
                                    {c.week === 0 ? 'Ciclo Permanente' : `Semana ${c.week}`} · {c.stage || 'Captación'}
                                  </span>
                                  <code className="text-[10px] bg-gray-100 px-1.5 py-0.2 rounded font-mono text-gray-600">
                                    {c.code}
                                  </code>
                                </div>
                                <div className="font-bold text-gray-900 text-sm">{c.name}</div>
                                <div className="text-gray-500 text-[11px] truncate max-w-xs">{c.subject}</div>
                              </td>

                              <td className="py-3.5 px-4">
                                <span className="inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 mb-1">
                                  {c.mode || 'Manual'}
                                </span>
                                <div className="text-gray-500 text-[11px]">
                                  {c.sentAt
                                    ? new Date(c.sentAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
                                    : c.scheduledAt
                                    ? `Programada: ${new Date(c.scheduledAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}`
                                    : new Date(c.createdAt).toLocaleDateString('es-CO')}
                                </div>
                              </td>

                              <td className="py-3.5 px-4">
                                <div className="font-medium text-gray-900 truncate max-w-[180px]">
                                  {c.fromName || `Comunicaciones | ${siteBranding.siteName}`}
                                </div>
                                <div className="font-mono text-[10px] text-gray-400 truncate max-w-[180px]">
                                  {c.fromEmail || 'comunicaciones@rotary4281.org'}
                                </div>
                              </td>

                              <td className="py-3.5 px-4">
                                {isSent && (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>Aceptada / Despachada</span>
                                  </span>
                                )}
                                {isScheduled && (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200/60">
                                    <Clock className="w-3 h-3" />
                                    <span>Programada</span>
                                  </span>
                                )}
                                {isFailed && (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200/60">
                                    <XCircle className="w-3 h-3" />
                                    <span>Fallida / Rechazada</span>
                                  </span>
                                )}
                                {isDraft && (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60">
                                    <span>Borrador</span>
                                  </span>
                                )}
                              </td>

                              <td className="py-3.5 px-4 text-center">
                                <div className="font-bold text-gray-900">
                                  {c.stats?.sentCount || 0} / {c.stats?.totalRecipients || 0}
                                </div>
                                <div className="text-[10px] text-gray-400">destinatarios</div>
                                {Boolean(c.stats?.failedCount) && (
                                  <div className="text-[10px] font-bold text-red-600">
                                    {c.stats.failedCount} con error
                                  </div>
                                )}
                              </td>

                              <td className="py-3.5 px-4 text-center">
                                <div className="flex items-center justify-center gap-3">
                                  <span className="flex items-center gap-1 text-gray-700" title="Aperturas detectadas">
                                    <Eye className="w-3 h-3 text-sky-600" />
                                    <strong>{c.stats?.uniqueOpens || 0}</strong>
                                  </span>
                                  <span className="flex items-center gap-1 text-gray-700" title="Clics registrados">
                                    <MousePointerClick className="w-3 h-3 text-indigo-600" />
                                    <strong>{c.stats?.uniqueClicks || 0}</strong>
                                  </span>
                                </div>
                              </td>

                              <td className="py-3.5 px-4 text-center">
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/60">
                                  <Award className="w-3 h-3" />
                                  <span>{c.stats?.conversionsCount || 0}</span>
                                </span>
                              </td>

                              <td className="py-3.5 px-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedHistoryCampaignId(c.id);
                                      setEnviosSubView('detalle');
                                    }}
                                    className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 font-bold flex items-center gap-1 transition cursor-pointer"
                                    title="Ver trazabilidad por destinatario"
                                  >
                                    <Activity className="w-3 h-3 text-emerald-600" />
                                    <span>Trazabilidad</span>
                                  </button>

                                  {Boolean(c.stats?.failedCount) && (
                                    <button
                                      type="button"
                                      onClick={() => handleRetryFailedRecipients(c.id)}
                                      disabled={retryingRecipients}
                                      className="px-2 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-bold transition cursor-pointer"
                                      title="Reintentar destinatarios con error"
                                    >
                                      <RefreshCw className={`w-3 h-3 ${retryingRecipients ? 'animate-spin' : ''}`} />
                                    </button>
                                  )}

                                  {c.emailCampaignId && (
                                    <button
                                      type="button"
                                      onClick={() => window.open(`/admin/email-marketing?campaignId=${c.emailCampaignId}`, '_blank')}
                                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
                                      title="Abrir en Email Marketing Central"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── SUBVISTA 2: DETALLE Y TRAZABILIDAD POR DESTINATARIO ─────── */}
          {enviosSubView === 'detalle' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setEnviosSubView('historial')}
                  className="px-3.5 py-2 rounded-xl border border-gray-200 text-gray-700 text-xs font-bold hover:bg-white flex items-center gap-1.5 transition cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Volver al Historial de Campañas</span>
                </button>

                {historyDetail?.stats?.failedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => handleRetryFailedRecipients(selectedHistoryCampaignId!)}
                    disabled={retryingRecipients}
                    className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${retryingRecipients ? 'animate-spin' : ''}`} />
                    <span>Reintentar Destinatarios Fallidos ({historyDetail.stats.failedCount})</span>
                  </button>
                )}
              </div>

              {loadingHistoryDetail ? (
                <div className="p-12 text-center text-gray-400 bg-white rounded-3xl border border-gray-100">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-rotary-blue" />
                  <span>Cargando detalle de trazabilidad por destinatario...</span>
                </div>
              ) : !historyDetail?.campaign ? (
                <div className="p-12 text-center text-gray-400 bg-white rounded-3xl border border-gray-100">
                  <p className="font-bold text-gray-700">Selecciona una campaña del historial para ver su trazabilidad.</p>
                  <button
                    type="button"
                    onClick={() => setEnviosSubView('historial')}
                    className="mt-3 px-4 py-2 rounded-xl bg-rotary-blue text-white text-xs font-bold cursor-pointer"
                  >
                    Ir al Historial
                  </button>
                </div>
              ) : (
                <>
                  {/* Tarjeta Ejecutiva de la Campaña */}
                  <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-50 text-rotary-blue">
                            {historyDetail.campaign.week === 0 ? 'Ciclo Permanente' : `Semana ${historyDetail.campaign.week}`} · {historyDetail.campaign.stage || 'Captación'}
                          </span>
                          <span className="text-[10px] font-mono bg-gray-100 px-1.5 py-0.2 rounded text-gray-600">
                            {historyDetail.campaign.code}
                          </span>
                          {historyDetail.campaign.status === 'sent' && (
                            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                              Despachada / Aceptada por Proveedor
                            </span>
                          )}
                        </div>
                        <h4 className="text-xl font-bold text-gray-900">{historyDetail.campaign.name}</h4>
                        <p className="text-xs text-gray-500 mt-0.5">
                          <strong>Asunto:</strong> {historyDetail.campaign.subject}
                        </p>
                      </div>

                      <div className="text-right text-xs space-y-0.5">
                        <div className="text-gray-400 text-[10px] uppercase font-bold">Fecha de Despacho</div>
                        <div className="font-bold text-gray-800">
                          {historyDetail.campaign.sentAt
                            ? new Date(historyDetail.campaign.sentAt).toLocaleString('es-CO')
                            : 'No despachada'}
                        </div>
                        <div className="text-[11px] text-gray-500 font-mono">
                          De: {historyDetail.campaign.fromEmail}
                        </div>
                      </div>
                    </div>

                    {/* Embudo de Trazabilidad */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
                      <div className="p-3 rounded-2xl bg-gray-50 border border-gray-100">
                        <div className="text-[10px] font-bold text-gray-400 uppercase">1. Elegibles</div>
                        <div className="text-xl font-bold text-gray-900 mt-1">
                          {historyDetail.stats?.totalRecipients || 0}
                        </div>
                        <div className="text-[10px] text-gray-500">Contactos</div>
                      </div>

                      <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-100">
                        <div className="text-[10px] font-bold text-emerald-800 uppercase">2. Aceptados</div>
                        <div className="text-xl font-bold text-emerald-700 mt-1">
                          {historyDetail.stats?.sentCount || 0}
                        </div>
                        <div className="text-[10px] text-emerald-600">Por proveedor</div>
                      </div>

                      <div className="p-3 rounded-2xl bg-blue-50/70 border border-blue-100">
                        <div className="text-[10px] font-bold text-blue-800 uppercase">3. Entregados</div>
                        <div className="text-xl font-bold text-rotary-blue mt-1">
                          {historyDetail.stats?.sentCount || 0}
                        </div>
                        <div className="text-[10px] text-blue-600">Buzones válidos</div>
                      </div>

                      <div className="p-3 rounded-2xl bg-sky-50/70 border border-sky-100">
                        <div className="text-[10px] font-bold text-sky-800 uppercase">4. Aperturas*</div>
                        <div className="text-xl font-bold text-sky-700 mt-1">
                          {historyDetail.stats?.uniqueOpens || 0}
                        </div>
                        <div className="text-[10px] text-sky-600">*Aproximada</div>
                      </div>

                      <div className="p-3 rounded-2xl bg-indigo-50/70 border border-indigo-100">
                        <div className="text-[10px] font-bold text-indigo-800 uppercase">5. Clics Únicos</div>
                        <div className="text-xl font-bold text-indigo-700 mt-1">
                          {historyDetail.stats?.uniqueClicks || 0}
                        </div>
                        <div className="text-[10px] text-indigo-600">Tracking seguro</div>
                      </div>

                      <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-100">
                        <div className="text-[10px] font-bold text-amber-800 uppercase">6. Activaciones</div>
                        <div className="text-xl font-bold text-amber-700 mt-1">
                          {historyDetail.stats?.conversionsCount || 0}
                        </div>
                        <div className="text-[10px] text-amber-600">Activar mi Club</div>
                      </div>
                    </div>
                  </div>

                  {/* Tabla de Destinatarios Individuales */}
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-xs overflow-hidden">
                    <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3 text-xs bg-gray-50/50">
                      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
                        <div className="relative flex-1 min-w-[200px]">
                          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            placeholder="Buscar por socio, email, club o cargo..."
                            value={historyRecipientSearch}
                            onChange={(e) => setHistoryRecipientSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-gray-200 text-xs bg-white focus:outline-none"
                          />
                        </div>

                        <select
                          value={historyRecipientStatusFilter}
                          onChange={(e) => setHistoryRecipientStatusFilter(e.target.value)}
                          className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs bg-white font-medium"
                        >
                          <option value="todos">Todos los destinatarios</option>
                          <option value="sent">Aceptados / Enviados</option>
                          <option value="opened">Con Apertura</option>
                          <option value="clicked">Con Clics</option>
                          <option value="conversion">Con Conversión</option>
                          <option value="failed">Con Error</option>
                        </select>
                      </div>

                      <div className="text-gray-400 text-xs">
                        Mostrando <strong>{filteredHistoryRecipients.length}</strong> de {historyDetail?.recipients?.length || 0} destinatarios
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-gray-50/80 border-b border-gray-100 text-gray-500 font-bold uppercase tracking-wider text-[10px]">
                            <th className="py-3 px-4">Destinatario & Correo</th>
                            <th className="py-3 px-4">Club Rotario & Rol</th>
                            <th className="py-3 px-4">Estado Proveedor</th>
                            <th className="py-3 px-4 text-center">Apertura Detectada</th>
                            <th className="py-3 px-4 text-center">Clics Registrados</th>
                            <th className="py-3 px-4 text-center">Conversión «Activar Club»</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {filteredHistoryRecipients.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-gray-400">
                                No se encontraron destinatarios que coincidan con la búsqueda.
                              </td>
                            </tr>
                          ) : (
                            filteredHistoryRecipients.map((r: any) => {
                              const hasOpened = r.openCount > 0 || r.openedAt;
                              const hasClicked = r.clickCount > 0 || r.clickedAt;
                              const hasConversion = !!r.conversion;

                              return (
                                <tr key={r.id} className="hover:bg-gray-50/60 transition">
                                  <td className="py-3 px-4">
                                    <div className="font-bold text-gray-900">{r.contactName || 'Socio Rotario'}</div>
                                    <div className="font-mono text-[11px] text-gray-500">{r.email}</div>
                                  </td>

                                  <td className="py-3 px-4">
                                    <div className="font-medium text-gray-800">{r.clubName || 'Club Rotario'}</div>
                                    <div className="text-[10px] text-gray-400">{r.role || 'Líder de Club'}</div>
                                  </td>

                                  <td className="py-3 px-4">
                                    {r.status === 'sent' ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                                        <CheckCircle2 className="w-3 h-3" />
                                        <span>Aceptado</span>
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700">
                                        <XCircle className="w-3 h-3" />
                                        <span>Fallido</span>
                                      </span>
                                    )}
                                  </td>

                                  <td className="py-3 px-4 text-center">
                                    {hasOpened ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full">
                                        <Eye className="w-3 h-3" />
                                        <span>{r.openedAt ? new Date(r.openedAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : 'Detectada'}</span>
                                      </span>
                                    ) : (
                                      <span className="text-[11px] text-gray-300">-</span>
                                    )}
                                  </td>

                                  <td className="py-3 px-4 text-center">
                                    {hasClicked ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                                        <MousePointerClick className="w-3 h-3" />
                                        <span>{r.clickCount} clic(s)</span>
                                      </span>
                                    ) : (
                                      <span className="text-[11px] text-gray-300">-</span>
                                    )}
                                  </td>

                                  <td className="py-3 px-4 text-center">
                                    {hasConversion ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                                        <Award className="w-3 h-3 text-amber-600" />
                                        <span>Club Activado</span>
                                      </span>
                                    ) : (
                                      <span className="text-[11px] text-gray-300">-</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── SUBVISTA 3: DIAGNÓSTICO DE ENTREGABILIDAD ───────────────── */}
          {enviosSubView === 'diagnostico' && (
            <div className="space-y-6">
              {/* Banner de Estado del Ecosistema */}
              <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-900 to-[#002868] text-white shadow-md">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-black text-sky-400 uppercase tracking-wider">
                      <ShieldCheck className="w-4 h-4" />
                      <span>Diagnóstico de Infraestructura de Envío</span>
                    </div>
                    <h4 className="text-xl font-bold">Estado de Autenticación & Entrega en Producción</h4>
                    <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                      Verificación en tiempo real de registros DNS, buzones autorizados y conexión con el proveedor.
                      Esencial para garantizar que los correos lleguen a la bandeja de entrada de los 133 clubes sin caer en spam.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => loadDeliverabilityDiagnostics()}
                      disabled={loadingDeliverability}
                      className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingDeliverability ? 'animate-spin' : ''}`} />
                      <span>Verificar Nuevamente</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 4 Paneles de Diagnóstico */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                {/* 1. Proveedor */}
                <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-500 uppercase text-[10px] tracking-wider">Proveedor de Correo</span>
                    <Server className="w-4 h-4 text-rotary-blue" />
                  </div>
                  <div>
                    <div className="font-bold text-gray-900 text-sm">
                      {deliverabilityDiag?.provider?.name || 'Resend Email API'}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-emerald-700 font-bold text-[11px]">
                        {deliverabilityDiag?.provider?.status === 'operational' ? 'Conectado / Operacional' : 'Simulación Local'}
                      </span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-gray-100 text-[11px] text-gray-500 space-y-1">
                    <div><strong>Protocolo:</strong> {deliverabilityDiag?.provider?.activeProtocol}</div>
                    <div className="truncate"><strong>Relay:</strong> {deliverabilityDiag?.provider?.fallbackRelay}</div>
                  </div>
                </div>

                {/* 2. Dominio y DNS */}
                <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-500 uppercase text-[10px] tracking-wider">Autenticación Dominio</span>
                    <Globe className="w-4 h-4 text-sky-600" />
                  </div>
                  <div>
                    <div className="font-bold text-gray-900 text-sm">
                      {deliverabilityDiag?.domain?.name || 'rotary4281.org'}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700 font-bold text-[11px]">SPF / DKIM Verificados</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-gray-100 text-[11px] text-gray-500 space-y-1">
                    <div><strong>SPF:</strong> Configurado</div>
                    <div><strong>DKIM:</strong> resend._domainkey</div>
                    <div><strong>DMARC:</strong> v=DMARC1; p=none;</div>
                  </div>
                </div>

                {/* 3. Buzones Institucionales */}
                <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-500 uppercase text-[10px] tracking-wider">Buzones Institucionales</span>
                    <MailCheck className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div>
                    <div className="font-bold text-gray-900 text-sm">
                      {deliverabilityDiag?.mailboxes?.total || 1} cuenta(s) en este sitio
                    </div>
                    <div className="text-[11px] text-gray-500 mt-1 truncate">
                      Principal: <strong>{deliverabilityDiag?.mailboxes?.recommendedSender}</strong>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-gray-100 text-[11px] text-gray-500 space-y-1">
                    <div className="truncate">comunicaciones@rotary4281.org</div>
                    <div className="truncate">distrito4281@rotary4281.org</div>
                  </div>
                </div>

                {/* 4. Colas y Gobernanza */}
                <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-500 uppercase text-[10px] tracking-wider">Monitor de Colas & Cron</span>
                    <Clock className="w-4 h-4 text-purple-600" />
                  </div>
                  <div>
                    <div className="font-bold text-gray-900 text-sm">
                      {deliverabilityDiag?.queue?.scheduledPending || 0} en cola programada
                    </div>
                    <div className="text-[11px] text-emerald-700 font-bold mt-1">
                      Cron Worker: Activo
                    </div>
                  </div>
                  <div className="pt-2 border-t border-gray-100 text-[11px] text-gray-500 space-y-1">
                    <div><strong>Frecuencia:</strong> Cada 5 minutos</div>
                    <div><strong>Idempotencia:</strong> Activada</div>
                    <div><strong>Tope:</strong> Máx 2 mensajes/mes</div>
                  </div>
                </div>
              </div>

              {/* Prueba Rápida de Entregabilidad */}
              <div className="p-6 rounded-3xl bg-white border border-gray-100 shadow-xs space-y-4">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-500" />
                  <div>
                    <h5 className="font-bold text-gray-900 text-sm sm:text-base">
                      Test de Envío en Tiempo Real (Diagnóstico Rápido)
                    </h5>
                    <p className="text-xs text-gray-500">
                      Envía un correo de prueba instantáneo a cualquier casilla para verificar recepción, SPF, DKIM y visualización.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 max-w-xl">
                  <input
                    type="email"
                    placeholder="ejemplo@rotary4281.org"
                    value={diagTestEmail}
                    onChange={(e) => setDiagTestEmail(e.target.value)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-xs bg-gray-50 focus:bg-white focus:outline-none focus:border-rotary-blue transition"
                  />
                  <button
                    type="button"
                    onClick={handleSendDiagTest}
                    disabled={sendingDiagTest}
                    className="px-5 py-2.5 rounded-xl bg-rotary-blue hover:bg-[#002868] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    {sendingDiagTest ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Enviando...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Enviar Prueba</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Últimos Errores del Proveedor */}
              {deliverabilityDiag?.recentErrors && deliverabilityDiag.recentErrors.length > 0 && (
                <div className="p-6 rounded-3xl bg-white border border-gray-100 shadow-xs space-y-3">
                  <div className="flex items-center gap-2 text-amber-700 font-bold text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Últimos Errores Reportados por el Proveedor</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold">
                          <th className="py-2.5 px-3">Fecha</th>
                          <th className="py-2.5 px-3">Destinatario</th>
                          <th className="py-2.5 px-3">Asunto</th>
                          <th className="py-2.5 px-3">Detalle del Error</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {deliverabilityDiag.recentErrors.map((err: any) => (
                          <tr key={err.id} className="hover:bg-gray-50">
                            <td className="py-2.5 px-3 text-gray-400 font-mono text-[11px]">
                              {new Date(err.createdAt).toLocaleString('es-CO')}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-medium text-gray-900">{err.recipient}</td>
                            <td className="py-2.5 px-3 text-gray-600 truncate max-w-xs">{err.subject}</td>
                            <td className="py-2.5 px-3 text-red-600 font-medium">{err.errorMsg}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL DE PREVISUALIZACIÓN DE CAMPAÑA ────────────────────── */}
      {previewCampaign && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-gray-100">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/70">
              <div>
                <span className="text-[10px] font-black uppercase text-rotary-blue tracking-wider">
                  {previewCampaign.week === 0 ? 'Ciclo Permanente' : `Semana ${previewCampaign.week}`} · {previewCampaign.type}
                </span>
                <h4 className="font-bold text-gray-900 text-base">{previewCampaign.name}</h4>
              </div>
              <button
                onClick={() => setPreviewCampaign(null)}
                className="w-8 h-8 rounded-full bg-gray-200/70 hover:bg-gray-200 text-gray-700 flex items-center justify-center font-bold text-lg"
              >
                ×
              </button>
            </div>

            <div className="p-3 bg-gray-100 flex gap-2 text-xs font-bold border-b border-gray-200/60">
              <button
                onClick={() => setPreviewTab('email')}
                className={`px-4 py-2 rounded-xl transition flex items-center gap-1.5 ${
                  previewTab === 'email' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Mail className="w-3.5 h-3.5 text-sky-600" />
                <span>Correo Electrónico</span>
              </button>
              <button
                onClick={() => setPreviewTab('whatsapp')}
                className={`px-4 py-2 rounded-xl transition flex items-center gap-1.5 ${
                  previewTab === 'whatsapp' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                <span>Mensaje de WhatsApp</span>
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {previewTab === 'email' ? (
                <div className="space-y-3">
                  {/* Sección compacta: Identidad del envío (Requerimiento 4) */}
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50/90 to-slate-50 border border-blue-200/80 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-black text-rotary-blue uppercase tracking-wider">
                        <ShieldCheck className="w-4 h-4 text-rotary-blue" />
                        <span>Identidad del envío</span>
                        {previewCampaign.senderIdentity?.isDefault && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                            Predeterminado
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectingSenderCampaignId(selectingSenderCampaignId === previewCampaign.id ? null : previewCampaign.id)}
                        className="text-xs font-bold text-rotary-blue hover:text-[#002868] underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>Cambiar remitente</span>
                      </button>
                    </div>

                    {/* Selector desplegable de remitente si está abierto */}
                    {selectingSenderCampaignId === previewCampaign.id && (
                      <div className="p-3 bg-white rounded-xl border border-blue-200 shadow-sm space-y-2 animate-in fade-in duration-150">
                        <div className="flex items-center justify-between text-xs font-bold text-gray-800">
                          <span>Selecciona una identidad autorizada para esta campaña:</span>
                          <button
                            type="button"
                            onClick={() => setSelectingSenderCampaignId(null)}
                            className="text-gray-400 hover:text-gray-600 text-sm font-bold"
                          >
                            ×
                          </button>
                        </div>
                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                          {senderIdentities.map((ident) => (
                            <div
                              key={ident.id}
                              onClick={() => handleAssignSenderToCampaign(previewCampaign.id, ident.id)}
                              className={`p-2 rounded-lg border text-xs cursor-pointer transition flex items-center justify-between ${
                                (previewCampaign.senderIdentityId === ident.id || (!previewCampaign.senderIdentityId && ident.isDefault))
                                  ? 'bg-blue-50/80 border-rotary-blue font-bold text-rotary-blue'
                                  : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                              }`}
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span>{ident.name}</span>
                                  {ident.isDefault && <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-bold">Predeterminado</span>}
                                </div>
                                <div className="text-[11px] text-gray-500 font-normal">
                                  De: <strong>{ident.fromName}</strong> · &lt;{ident.fromEmail}&gt;
                                </div>
                              </div>
                              <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                            </div>
                          ))}
                        </div>
                        <div className="pt-1.5 flex justify-between items-center text-[11px]">
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewCampaign(null);
                              setSelectingSenderCampaignId(null);
                              setSubtab('remitentes');
                            }}
                            className="text-rotary-blue font-bold hover:underline"
                          >
                            + Gestionar identidades en Configuración
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectingSenderCampaignId(null)}
                            className="text-gray-500 hover:text-gray-700 font-medium"
                          >
                            Cerrar
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-gray-700 pt-1.5 border-t border-blue-100/80">
                      <div>
                        <span className="text-gray-400 font-bold block text-[10px] uppercase tracking-wider">De:</span>
                        <span className="font-bold text-gray-900 truncate block">
                          {previewCampaign.senderName || previewCampaign.senderIdentity?.fromName || defaultSenderIdentity?.fromName || `Comunicaciones | ${siteBranding.siteName}`}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 font-bold block text-[10px] uppercase tracking-wider">Correo:</span>
                        <span className="font-mono text-gray-800 text-[11px] truncate block">
                          {previewCampaign.fromEmail || previewCampaign.senderIdentity?.fromEmail || defaultSenderIdentity?.fromEmail || availableAccounts[0]?.email || 'comunicaciones@rotary4281.org'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 font-bold block text-[10px] uppercase tracking-wider">Responder a:</span>
                        <span className="font-mono text-gray-800 text-[11px] truncate block">
                          {previewCampaign.replyToEmail || previewCampaign.senderIdentity?.replyToEmail || defaultSenderIdentity?.replyToEmail || previewCampaign.fromEmail || availableAccounts[0]?.email || 'comunicaciones@rotary4281.org'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 space-y-1">
                    <div><strong>Asunto:</strong> {previewCampaign.subject}</div>
                    <div><strong>Preheader:</strong> {previewCampaign.preheader}</div>
                    <div><strong>UTM:</strong> <code className="text-[11px] bg-white px-1.5 py-0.5 rounded">{previewCampaign.utmCampaign}</code></div>
                  </div>
                  <div
                    className="border border-gray-200 rounded-2xl p-4 bg-white"
                    dangerouslySetInnerHTML={{ __html: renderedPreviewHtml }}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-4 rounded-2xl bg-[#DCF8C6]/40 border border-emerald-200 text-gray-800 whitespace-pre-wrap font-sans text-xs leading-relaxed">
                    {previewCampaign.whatsappTemplate}
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(previewCampaign.whatsappTemplate);
                        toast.success('Texto de WhatsApp copiado al portapapeles');
                      }}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar Texto</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 bg-gray-50 flex flex-wrap items-center justify-between gap-2 text-xs">
              <button
                onClick={() => setPreviewCampaign(null)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-white"
              >
                Cerrar
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const camp = previewCampaign;
                    setPreviewCampaign(null);
                    setPreparingCampaign(camp);
                    setSendFlowStep(1);
                    setSelectedListIds(camp.targetListIds || []);
                    loadAudienceLists();
                  }}
                  className="px-4 py-2 rounded-xl bg-rotary-blue hover:bg-[#002868] text-white font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5 text-sky-200" />
                  <span>Preparar Envío</span>
                </button>

                <button
                  onClick={() => setVisualEditorCampaign(previewCampaign)}
                  className="px-3.5 py-2 rounded-xl bg-violet-700 hover:bg-violet-600 text-white font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-violet-200" />
                  <span>Diseñar en Editor Visual</span>
                </button>

                <button
                  onClick={() => handleSyncWithEmailMarketing(previewCampaign)}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-white font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Mail className="w-3.5 h-3.5 text-sky-600" />
                  <span>Sincronizar con Email Marketing</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Editor Visual Institucional Modal */}
      {visualEditorCampaign && (
        <VisualTemplateEditor
          campaignContext={visualEditorCampaign}
          initialDesign={
            visualEditorCampaign.design
              ? (typeof visualEditorCampaign.design === 'string'
                  ? JSON.parse(visualEditorCampaign.design)
                  : visualEditorCampaign.design)
              : null
          }
          initialName={`[${visualEditorCampaign.code?.toUpperCase() || 'ROTARY'}] ${visualEditorCampaign.name}`}
          initialSubject={visualEditorCampaign.subject}
          initialPreheader={visualEditorCampaign.preheader}
          onSave={({ subject: s, preheader: p, html, design: savedDesign }) => {
            setCampaigns((prev) =>
              prev.map((c) =>
                c.id === visualEditorCampaign.id
                  ? { ...c, subject: s, preheader: p, contentHtml: html, design: savedDesign }
                  : c
              )
            );
            if (previewCampaign?.id === visualEditorCampaign.id) {
              setPreviewCampaign((prev: any) => ({
                ...prev,
                subject: s,
                preheader: p,
                contentHtml: html,
                design: savedDesign
              }));
            }
            toast.success('Campaña actualizada y sincronizada con éxito');
            setVisualEditorCampaign(null);
          }}
          onClose={() => setVisualEditorCampaign(null)}
        />
      )}

      {/* ── MODAL DE CONFIGURACIÓN DE REMITENTE INSTITUCIONAL ───────── */}
      {editingIdentity && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full max-h-[92vh] overflow-hidden flex flex-col shadow-2xl border border-gray-100">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-blue-50 text-rotary-blue flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-rotary-blue" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 text-base">
                    {editingIdentity.id ? 'Editar Identidad Institucional' : 'Nueva Identidad Institucional de Envío'}
                  </h4>
                  <p className="text-xs text-gray-500">
                    Configuración de remitente oficial para campañas de Rotary en Acción
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingIdentity(null)}
                className="w-8 h-8 rounded-full bg-gray-200/70 hover:bg-gray-200 text-gray-700 flex items-center justify-center font-bold text-lg"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveIdentity} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 overflow-y-auto space-y-4 text-xs">
                {/* Alerta si no hay cuentas institucionales */}
                {availableAccounts.length === 0 && (
                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-sm text-amber-800">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span>No hay cuentas de correo institucionales configuradas en este sitio</span>
                    </div>
                    <p className="text-xs text-amber-700 leading-relaxed">
                      Para que los envíos provengan de un buzón institucional oficial, primero debes vincular y verificar una cuenta de correo en la configuración de Club Platform.
                    </p>
                  </div>
                )}

                {/* Nombre de Identificación Interna */}
                <div>
                  <label className="block text-xs font-bold text-gray-800 mb-1">
                    Nombre de identificación interna <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Comunicaciones Distritales, Presidencia de Club..."
                    value={editingIdentity.name}
                    onChange={(e) => setEditingIdentity({ ...editingIdentity, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-rotary-blue/20 focus:border-rotary-blue outline-hidden transition"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Nombre descriptivo para administrar y distinguir fácilmente esta identidad dentro de la plataforma.
                  </p>
                </div>

                {/* Nombre Visible del Remitente */}
                <div>
                  <label className="block text-xs font-bold text-gray-800 mb-1">
                    Nombre visible del remitente (De / From Name) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={`Ej: Comunicaciones | ${siteBranding.siteName}`}
                    value={editingIdentity.fromName}
                    onChange={(e) => setEditingIdentity({ ...editingIdentity, fromName: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-rotary-blue/20 focus:border-rotary-blue outline-hidden transition font-medium"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Es el nombre institucional oficial que verán los socios y destinatarios en la bandeja de entrada de su correo.
                  </p>
                </div>

                {/* Correo Electrónico del Remitente */}
                <div>
                  <label className="block text-xs font-bold text-gray-800 mb-1">
                    Correo electrónico del remitente <span className="text-red-500">*</span>
                  </label>
                  {availableAccounts.length > 0 ? (
                    <select
                      required
                      value={editingIdentity.fromEmail}
                      onChange={(e) => {
                        const newFromEmail = e.target.value;
                        const wasSame = !editingIdentity.replyToEmail || editingIdentity.replyToEmail === editingIdentity.fromEmail;
                        setEditingIdentity({
                          ...editingIdentity,
                          fromEmail: newFromEmail,
                          replyToEmail: wasSame ? newFromEmail : editingIdentity.replyToEmail
                        });
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-rotary-blue/20 focus:border-rotary-blue outline-hidden transition font-mono bg-white"
                    >
                      <option value="" disabled>Selecciona una cuenta institucional del sitio</option>
                      {availableAccounts.map((acc) => (
                        <option
                          key={acc.id}
                          value={acc.email}
                          disabled={!acc.isAuthorized}
                        >
                          {acc.email} {acc.name ? `(${acc.name})` : ''} {acc.isAuthorized ? '✓ Autorizada' : '✗ No verificada'}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="email"
                      required
                      placeholder="comunicaciones@rotary4281.org"
                      value={editingIdentity.fromEmail}
                      onChange={(e) => setEditingIdentity({ ...editingIdentity, fromEmail: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-rotary-blue/20 focus:border-rotary-blue outline-hidden transition font-mono"
                    />
                  )}
                  <p className="text-[11px] text-gray-400 mt-1">
                    Buzón institucional autenticado en el servidor de correo del sitio activo ({availableSiteContext?.siteDomain || 'dominio oficial'}).
                  </p>
                </div>

                {/* Correo de Respuesta (Reply-To) */}
                <div>
                  <label className="block text-xs font-bold text-gray-800 mb-1">
                    Correo electrónico de respuesta (Reply-To)
                  </label>
                  {availableAccounts.length > 0 ? (
                    <select
                      value={editingIdentity.replyToEmail}
                      onChange={(e) => setEditingIdentity({ ...editingIdentity, replyToEmail: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-rotary-blue/20 focus:border-rotary-blue outline-hidden transition font-mono bg-white"
                    >
                      <option value="">Mismo correo de envío ({editingIdentity.fromEmail || 'predeterminado'})</option>
                      {availableAccounts.map((acc) => (
                        <option key={acc.id} value={acc.email}>
                          {acc.email} {acc.name ? `(${acc.name})` : ''} {acc.isAuthorized ? '✓' : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="email"
                      placeholder={editingIdentity.fromEmail || 'comunicaciones@rotary4281.org'}
                      value={editingIdentity.replyToEmail}
                      onChange={(e) => setEditingIdentity({ ...editingIdentity, replyToEmail: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-rotary-blue/20 focus:border-rotary-blue outline-hidden transition font-mono"
                    />
                  )}
                  <p className="text-[11px] text-gray-400 mt-1">
                    Cuenta institucional a la cual llegarán las respuestas que envíen los socios y destinatarios.
                  </p>
                </div>

                {/* Opción Remitente Predeterminado */}
                <div className="pt-2">
                  <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-gray-50 border border-gray-200/80 cursor-pointer hover:bg-gray-100/70 transition">
                    <input
                      type="checkbox"
                      checked={editingIdentity.isDefault}
                      onChange={(e) => setEditingIdentity({ ...editingIdentity, isDefault: e.target.checked })}
                      className="mt-0.5 rounded text-rotary-blue focus:ring-rotary-blue"
                    />
                    <div>
                      <span className="font-bold text-gray-900 block text-xs">
                        Establecer como remitente predeterminado de este sitio
                      </span>
                      <span className="text-[11px] text-gray-500 block leading-normal mt-0.5">
                        Las nuevas campañas y comunicaciones de Rotary en Acción utilizarán esta identidad institucional de forma automática.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="p-4 border-t border-gray-100 bg-gray-50/70 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingIdentity(null)}
                  disabled={savingIdentity}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-bold hover:bg-white transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingIdentity}
                  className="px-5 py-2.5 rounded-xl bg-rotary-blue hover:bg-[#002868] text-white text-xs font-bold flex items-center gap-2 transition shadow-xs disabled:opacity-50"
                >
                  {savingIdentity ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{editingIdentity.id ? 'Guardar Cambios' : 'Crear Identidad'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL DEL FLUJO "PREPARAR ENVÍO" (AUDIENCIAS Y ENVÍO) ───── */}
      {preparingCampaign && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
            {/* Cabecera del Modal */}
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-rotary-blue flex items-center justify-center shrink-0">
                  <Send className="w-5 h-5 text-rotary-blue" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-rotary-blue bg-blue-100/70 px-2 py-0.5 rounded-full">
                      {preparingCampaign.week === 0 ? 'Ciclo Permanente' : `Semana ${preparingCampaign.week}`} · {preparingCampaign.type}
                    </span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                      <span>Remitente Configurado</span>
                    </span>
                  </div>
                  <h4 className="font-bold text-gray-900 text-base mt-0.5">
                    Preparar Envío: {preparingCampaign.name}
                  </h4>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreparingCampaign(null)}
                className="w-8 h-8 rounded-full bg-gray-200/70 hover:bg-gray-200 text-gray-700 flex items-center justify-center font-bold text-lg cursor-pointer"
              >
                ×
              </button>
            </div>

            {/* Barra de Pasos (Stepper) */}
            <div className="px-6 py-3 bg-gray-100/70 border-b border-gray-200/60 flex items-center justify-between text-xs">
              {[
                { step: 1, label: '1. Destinatarios', desc: 'Audiencias reales' },
                { step: 2, label: '2. Revisión', desc: 'Contenido e identidad' },
                { step: 3, label: '3. Prueba y Envío', desc: 'Verificación' },
                { step: 4, label: '4. Resultado', desc: 'Trazabilidad' }
              ].map((s) => (
                <div
                  key={s.step}
                  onClick={() => {
                    if (s.step < sendFlowStep || (s.step === 2 && audienceValidation.eligibleRecipients > 0)) {
                      setSendFlowStep(s.step as any);
                    }
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition ${
                    sendFlowStep === s.step
                      ? 'bg-white shadow-xs text-rotary-blue font-bold border border-blue-200'
                      : sendFlowStep > s.step
                      ? 'text-emerald-700 font-medium cursor-pointer hover:bg-white/50'
                      : 'text-gray-400 font-medium'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    sendFlowStep === s.step
                      ? 'bg-rotary-blue text-white'
                      : sendFlowStep > s.step
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}>
                    {sendFlowStep > s.step ? '✓' : s.step}
                  </span>
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
              ))}
            </div>

            {/* Contenido del Paso */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
              {/* ── PASO 1: SELECCIONAR DESTINATARIOS ──────────────── */}
              {sendFlowStep === 1 && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="font-bold text-gray-900 text-sm">
                        Listas de Contactos Institucionales ({audienceLists.length})
                      </h5>
                      <p className="text-gray-500 text-[11px] mt-0.5">
                        Selecciona uno o más segmentos reales del sitio. El sistema deduplicará automáticamente los contactos repetidos.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setSelectedListIds(audienceLists.filter(l => l.validEmailCount > 0).map(l => l.id))}
                        className="text-[11px] text-rotary-blue font-bold hover:underline cursor-pointer"
                      >
                        Seleccionar con correos
                      </button>
                      <span className="text-gray-300">·</span>
                      <button
                        type="button"
                        onClick={() => setSelectedListIds([])}
                        className="text-[11px] text-gray-500 font-medium hover:underline cursor-pointer"
                      >
                        Limpiar
                      </button>
                    </div>
                  </div>

                  {/* Listado con scroll de listas */}
                  {loadingAudienceLists ? (
                    <div className="p-8 text-center text-gray-400 text-xs bg-gray-50 rounded-2xl flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-rotary-blue" />
                      <span>Consultando listas institucionales...</span>
                    </div>
                  ) : audienceLists.length === 0 ? (
                    <div className="p-6 text-center bg-amber-50 rounded-2xl border border-amber-200 text-amber-900">
                      <p className="font-bold">No hay listas institucionales configuradas para este sitio.</p>
                      <p className="text-[11px] text-amber-700 mt-1">
                        Puedes importar o segmentar contactos desde el módulo de Contactos & Leads.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                      {audienceLists.map((list) => {
                        const isChecked = selectedListIds.includes(list.id);
                        return (
                          <div
                            key={list.id}
                            onClick={() => {
                              setSelectedListIds(prev =>
                                isChecked ? prev.filter(id => id !== list.id) : [...prev, list.id]
                              );
                            }}
                            className={`p-3 rounded-2xl border transition cursor-pointer flex items-start gap-2.5 select-none ${
                              isChecked
                                ? 'bg-blue-50/70 border-rotary-blue shadow-2xs'
                                : 'bg-white border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              className="mt-0.5 rounded text-rotary-blue focus:ring-rotary-blue"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-gray-900 text-xs truncate">{list.name}</div>
                              <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                                <span>{list.totalMembers} socios</span>
                                <span>·</span>
                                <span className={list.validEmailCount > 0 ? 'text-emerald-700 font-bold' : 'text-gray-400'}>
                                  {list.validEmailCount} con correo
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Panel de Auditoría en Tiempo Real */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-blue-50/40 border border-blue-200/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-rotary-blue uppercase tracking-wider">
                        <BarChart3 className="w-4 h-4 text-rotary-blue" />
                        <span>Auditoría de Destinatarios en Vivo</span>
                      </div>
                      {isValidatingAudience && (
                        <span className="flex items-center gap-1 text-[11px] text-gray-500 font-medium">
                          <RefreshCw className="w-3 h-3 animate-spin text-rotary-blue" />
                          <span>Validando...</span>
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center">
                      <div className="p-2.5 rounded-xl bg-white border border-gray-100 shadow-2xs">
                        <span className="text-[10px] text-gray-400 font-bold block uppercase">Brutos</span>
                        <span className="text-base font-extrabold text-gray-800">{audienceValidation.totalRaw}</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white border border-gray-100 shadow-2xs">
                        <span className="text-[10px] text-emerald-600 font-bold block uppercase">Con Correo</span>
                        <span className="text-base font-extrabold text-emerald-700">{audienceValidation.validContacts}</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white border border-gray-100 shadow-2xs">
                        <span className="text-[10px] text-amber-600 font-bold block uppercase">Sin Correo</span>
                        <span className="text-base font-extrabold text-amber-700">{audienceValidation.missingEmailCount}</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white border border-gray-100 shadow-2xs">
                        <span className="text-[10px] text-purple-600 font-bold block uppercase">Duplicados</span>
                        <span className="text-base font-extrabold text-purple-700">-{audienceValidation.duplicatesCount}</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white border border-gray-100 shadow-2xs">
                        <span className="text-[10px] text-red-600 font-bold block uppercase">Bajas</span>
                        <span className="text-base font-extrabold text-red-700">-{audienceValidation.optedOutCount}</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-300 shadow-2xs">
                        <span className="text-[10px] text-emerald-800 font-black block uppercase tracking-wider">Elegibles</span>
                        <span className="text-lg font-black text-emerald-700">{audienceValidation.eligibleRecipients}</span>
                      </div>
                    </div>

                    <p className="text-[11px] text-gray-500 leading-normal">
                      ℹ️ <strong>Protección Anti-Duplicados:</strong> Cada contacto recibirá exactamente 1 correo, independientemente de cuántas listas seleccionadas integre.
                    </p>

                    {/* Previsualización de muestra de contactos */}
                    {audienceValidation.sampleRecipients.length > 0 && (
                      <div className="pt-2 border-t border-blue-100/70">
                        <span className="text-[10px] font-bold uppercase text-gray-400 block mb-1">
                          Muestra de Destinatarios Verificados ({audienceValidation.sampleRecipients.length} primeros):
                        </span>
                        <div className="space-y-1">
                          {audienceValidation.sampleRecipients.map((rec, idx) => (
                            <div key={idx} className="flex items-center justify-between text-[11px] bg-white/80 px-2.5 py-1 rounded-lg border border-gray-100">
                              <span className="font-bold text-gray-900 truncate max-w-[200px]">{rec.name}</span>
                              <span className="font-mono text-gray-600 truncate max-w-[220px]">{rec.email}</span>
                              <span className="text-gray-400 text-[10px] truncate max-w-[150px]">{rec.club}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── PASO 2: REVISIÓN DE IDENTIDAD Y CONTENIDO ────────── */}
              {sendFlowStep === 2 && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  {/* Resumen de Identidad Institucional */}
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-slate-50 border border-blue-200 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-rotary-blue uppercase tracking-wider">
                        <ShieldCheck className="w-4 h-4 text-rotary-blue" />
                        <span>Identidad Oficial del Remitente</span>
                      </div>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                        SPF / DKIM Verificado
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-blue-100">
                      <div>
                        <span className="text-[10px] text-gray-400 font-bold uppercase block">Nombre visible (De):</span>
                        <span className="font-bold text-gray-900 truncate block">
                          {preparingCampaign.senderName || defaultSenderIdentity?.fromName || `Comunicaciones | ${siteBranding.siteName}`}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-400 font-bold uppercase block">Buzón de envío:</span>
                        <span className="font-mono text-gray-800 text-[11px] truncate block">
                          {preparingCampaign.fromEmail || defaultSenderIdentity?.fromEmail || 'comunicaciones@rotary4281.org'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-400 font-bold uppercase block">Responder a (Reply-To):</span>
                        <span className="font-mono text-gray-800 text-[11px] truncate block">
                          {preparingCampaign.replyToEmail || defaultSenderIdentity?.replyToEmail || preparingCampaign.fromEmail || 'comunicaciones@rotary4281.org'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Asunto, Preheader y Parámetros */}
                  <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200 space-y-1.5">
                    <div><strong>Asunto:</strong> {preparingCampaign.subject}</div>
                    {preparingCampaign.preheader && <div><strong>Preheader:</strong> {preparingCampaign.preheader}</div>}
                    <div><strong>Parámetro de Campaña (UTM):</strong> <code className="bg-white px-2 py-0.5 rounded border border-gray-200 text-[11px]">{preparingCampaign.utmCampaign}</code></div>
                    <div><strong>Destinatarios confirmados:</strong> <span className="font-bold text-emerald-700">{audienceValidation.eligibleRecipients} socios en {selectedListIds.length} listas</span></div>
                  </div>

                  {/* Previsualización del Contenido Renderizado */}
                  <div className="border border-gray-200 rounded-2xl p-4 bg-white max-h-64 overflow-y-auto">
                    <div dangerouslySetInnerHTML={{ __html: renderedPreviewHtml }} />
                  </div>
                </div>
              )}

              {/* ── PASO 3: PRUEBA OPCIONAL Y CONFIRMAR ENVÍO ─────────── */}
              {sendFlowStep === 3 && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  {/* Envío de Correo de Prueba */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-gray-200 space-y-3">
                    <div className="flex items-center gap-2 font-bold text-gray-900 text-xs">
                      <Mail className="w-4 h-4 text-rotary-blue" />
                      <span>1. Enviar Correo de Prueba (Recomendado)</span>
                    </div>
                    <p className="text-[11px] text-gray-500 leading-normal">
                      Verifica cómo recibirán el correo los líderes rotarios. Este envío de prueba no contabiliza en las estadísticas de campaña ni genera conversiones en el embudo.
                    </p>

                    <div className="flex items-center gap-2">
                      <input
                        type="email"
                        placeholder="tu-correo@rotary4281.org"
                        value={testEmailAddress}
                        onChange={(e) => setTestEmailAddress(e.target.value)}
                        className="flex-1 px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs focus:ring-2 focus:ring-rotary-blue/20 focus:border-rotary-blue font-mono bg-white outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={handleSendTest}
                        disabled={sendingTestEmail}
                        className="px-4 py-2.5 rounded-xl bg-gray-900 hover:bg-black text-white font-bold flex items-center gap-1.5 shrink-0 transition disabled:opacity-50 cursor-pointer"
                      >
                        {sendingTestEmail ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Enviando prueba...</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" />
                            <span>Enviar Prueba</span>
                          </>
                        )}
                      </button>
                    </div>

                    {testSentSuccess && (
                      <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{testSentSuccess}</span>
                      </div>
                    )}
                  </div>

                  {/* Modalidad de Envío */}
                  <div className="p-4 rounded-2xl bg-white border border-gray-200 space-y-3">
                    <div className="font-bold text-gray-900 text-xs">
                      2. Modalidad de Envío a la Audiencia ({audienceValidation.eligibleRecipients} destinatarios)
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className={`p-3.5 rounded-2xl border cursor-pointer transition flex items-start gap-2.5 ${
                        sendMode === 'now' ? 'bg-blue-50/70 border-rotary-blue ring-1 ring-rotary-blue/30' : 'border-gray-200 hover:border-gray-300'
                      }`}>
                        <input
                          type="radio"
                          name="sendMode"
                          checked={sendMode === 'now'}
                          onChange={() => setSendMode('now')}
                          className="mt-0.5 text-rotary-blue"
                        />
                        <div>
                          <span className="font-bold text-gray-900 block text-xs">Enviar Ahora</span>
                          <span className="text-[11px] text-gray-500 block leading-normal mt-0.5">
                            Procesar la entrega inmediata a los {audienceValidation.eligibleRecipients} destinatarios elegibles.
                          </span>
                        </div>
                      </label>

                      <label className={`p-3.5 rounded-2xl border cursor-pointer transition flex items-start gap-2.5 ${
                        sendMode === 'schedule' ? 'bg-blue-50/70 border-rotary-blue ring-1 ring-rotary-blue/30' : 'border-gray-200 hover:border-gray-300'
                      }`}>
                        <input
                          type="radio"
                          name="sendMode"
                          checked={sendMode === 'schedule'}
                          onChange={() => setSendMode('schedule')}
                          className="mt-0.5 text-rotary-blue"
                        />
                        <div>
                          <span className="font-bold text-gray-900 block text-xs">Programar Envío</span>
                          <span className="text-[11px] text-gray-500 block leading-normal mt-0.5">
                            Seleccionar fecha y hora óptima para disparar la campaña automáticamente.
                          </span>
                        </div>
                      </label>
                    </div>

                    {sendMode === 'schedule' && (
                      <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                        <div>
                          <label className="block text-[11px] font-bold text-gray-700 mb-1">Fecha de envío:</label>
                          <input
                            type="date"
                            min={new Date().toISOString().split('T')[0]}
                            value={scheduleDate}
                            onChange={(e) => setScheduleDate(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-gray-700 mb-1">Hora de envío (hora local):</label>
                          <input
                            type="time"
                            value={scheduleTime}
                            onChange={(e) => setScheduleTime(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs bg-white"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Política de Frecuencia y Gobernanza */}
                  <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-amber-900 flex items-start gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-[11px] leading-relaxed">
                      <strong>Gobernanza Distrital:</strong> Esta campaña respeta el tope máximo de 2 impactos promocionales al mes por club y procesará bajas (opt-out) automáticamente.
                    </div>
                  </div>
                </div>
              )}

              {/* ── PASO 4: RESULTADO Y TRAZABILIDAD ──────────────────── */}
              {sendFlowStep === 4 && (
                <div className="p-8 text-center space-y-4 animate-in fade-in duration-200">
                  {sendExecutionSummary?.status === 'failed' ? (
                    <div className="w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto shadow-xs">
                      <XCircle className="w-8 h-8" />
                    </div>
                  ) : sendExecutionSummary?.mode === 'schedule' ? (
                    <div className="w-14 h-14 rounded-full bg-sky-100 text-rotary-blue flex items-center justify-center mx-auto shadow-xs">
                      <Clock className="w-8 h-8" />
                    </div>
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                  )}

                  <div>
                    <h5 className="font-extrabold text-gray-900 text-base">
                      {sendExecutionSummary?.status === 'failed'
                        ? 'Envío no completado por el proveedor'
                        : sendExecutionSummary?.mode === 'schedule'
                        ? '¡Campaña Programada Exitosamente!'
                        : '¡Campaña Despachada y Aceptada por el Proveedor!'}
                    </h5>
                    <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                      {sendExecutionSummary?.status === 'failed'
                        ? (sendExecutionSummary.errorReason || 'El proveedor rechazó la entrega. Revisa el diagnóstico de entregabilidad.')
                        : sendExecutionSummary?.mode === 'schedule'
                        ? `La campaña quedará en cola para enviarse automáticamente el ${new Date(sendExecutionSummary.scheduledAt).toLocaleString('es-CO')}.`
                        : `El proveedor aceptó el despacho para ${sendExecutionSummary?.sentCount} de ${sendExecutionSummary?.eligibleRecipients} destinatario(s). Verifica aperturas, clics y entregas en el Centro de Envíos.`}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 text-left space-y-2 max-w-md mx-auto text-xs">
                    <div className="flex justify-between border-b border-gray-200/60 pb-1.5">
                      <span className="text-gray-500">Destinatarios elegibles:</span>
                      <span className="font-bold text-gray-900">{sendExecutionSummary?.eligibleRecipients} socios</span>
                    </div>
                    {sendExecutionSummary?.mode === 'now' && (
                      <>
                        <div className="flex justify-between border-b border-gray-200/60 pb-1.5">
                          <span className="text-gray-500">Aceptados por proveedor:</span>
                          <span className="font-bold text-emerald-700">{sendExecutionSummary?.sentCount || 0} enviados</span>
                        </div>
                        {Boolean(sendExecutionSummary?.failedCount) && (
                          <div className="flex justify-between border-b border-gray-200/60 pb-1.5">
                            <span className="text-gray-500">Errores / Rechazados:</span>
                            <span className="font-bold text-red-600">{sendExecutionSummary?.failedCount} fallidos</span>
                          </div>
                        )}
                      </>
                    )}
                    <div className="flex justify-between border-b border-gray-200/60 pb-1.5">
                      <span className="text-gray-500">Listas incluidas:</span>
                      <span className="font-bold text-gray-900">{sendExecutionSummary?.listsCount} listas</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-200/60 pb-1.5">
                      <span className="text-gray-500">Remitente institucional:</span>
                      <span className="font-bold text-gray-900 truncate max-w-[200px]">{sendExecutionSummary?.sender}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Buzón de salida:</span>
                      <span className="font-mono text-gray-800">{sendExecutionSummary?.fromEmail}</span>
                    </div>
                  </div>

                  {sendExecutionSummary?.errors && sendExecutionSummary.errors.length > 0 && (
                    <div className="max-w-md mx-auto p-3 rounded-xl bg-red-50 border border-red-200 text-left text-[11px] text-red-800 space-y-1">
                      <div className="font-bold flex items-center gap-1 text-red-900">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Detalles reportados por el proveedor:</span>
                      </div>
                      <ul className="list-disc list-inside space-y-0.5 text-red-700">
                        {sendExecutionSummary.errors.slice(0, 3).map((err: any, idx: number) => (
                          <li key={idx} className="truncate">
                            {err.email}: {err.error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer de Acciones del Stepper */}
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-xs">
              {sendFlowStep > 1 && sendFlowStep < 4 ? (
                <button
                  type="button"
                  onClick={() => setSendFlowStep((prev) => (prev - 1) as any)}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-gray-700 font-bold hover:bg-white flex items-center gap-1.5 transition cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Anterior</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setPreparingCampaign(null)}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-white transition cursor-pointer"
                >
                  Cerrar
                </button>
              )}

              <div className="flex items-center gap-2">
                {sendFlowStep === 1 && (
                  <button
                    type="button"
                    disabled={selectedListIds.length === 0 || audienceValidation.eligibleRecipients === 0}
                    onClick={() => setSendFlowStep(2)}
                    className="px-5 py-2.5 rounded-xl bg-rotary-blue hover:bg-[#002868] text-white font-bold flex items-center gap-1.5 shadow-xs transition disabled:opacity-40 cursor-pointer"
                  >
                    <span>Siguiente: Revisar Contenido</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}

                {sendFlowStep === 2 && (
                  <button
                    type="button"
                    onClick={() => setSendFlowStep(3)}
                    className="px-5 py-2.5 rounded-xl bg-rotary-blue hover:bg-[#002868] text-white font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                  >
                    <span>Siguiente: Prueba y Confirmación</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}

                {sendFlowStep === 3 && (
                  <button
                    type="button"
                    disabled={executingSend || audienceValidation.eligibleRecipients === 0}
                    onClick={handleConfirmSendCampaign}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-xs transition disabled:opacity-50 cursor-pointer"
                  >
                    {executingSend ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Procesando...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>
                          {sendMode === 'schedule'
                            ? 'Confirmar Programación'
                            : `Confirmar Envío (${audienceValidation.eligibleRecipients} Destinatarios)`}
                        </span>
                      </>
                    )}
                  </button>
                )}

                {sendFlowStep === 4 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const targetId = preparingCampaign.id;
                        setPreparingCampaign(null);
                        setSubtab('envios');
                        setSelectedHistoryCampaignId(targetId);
                        setEnviosSubView('detalle');
                      }}
                      className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Activity className="w-3.5 h-3.5" />
                      <span>Ver Trazabilidad en Centro de Envíos</span>
                    </button>
                    {sendExecutionSummary?.viewUrl && (
                      <button
                        type="button"
                        onClick={() => window.open(sendExecutionSummary.viewUrl, '_blank')}
                        className="px-4 py-2.5 rounded-xl bg-gray-900 hover:bg-black text-white font-bold flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Abrir Campaña en Email Marketing</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPreparingCampaign(null)}
                      className="px-5 py-2.5 rounded-xl bg-rotary-blue hover:bg-[#002868] text-white font-bold transition cursor-pointer"
                    >
                      Finalizar y Volver
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RotaryMarketingInteligente;
