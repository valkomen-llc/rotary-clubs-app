import db from '../../lib/prisma.js';
import { resolveClubId } from '../crmController.js';

const VALID_TRIGGERS = ['keyword', 'exact', 'welcome', 'fallback'];
const VALID_MATCH = ['contains', 'exact', 'starts_with'];

// ── Respuestas automáticas (reglas) ──────────────────────────────────────────

export const getAutoReplies = async (req, res) => {
  try {
    const clubId = await resolveClubId(req);
    const rules = await db.whatsAppAutoReplyRule.findMany({
      where: { clubId },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
    res.json(rules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createAutoReply = async (req, res) => {
  try {
    const clubId = await resolveClubId(req, true);
    const { name, triggerType, matchMode, keywords, responseText, active, priority } = req.body;

    if (!name || !responseText) {
      return res.status(400).json({ error: 'El nombre y el texto de respuesta son obligatorios' });
    }
    const type = VALID_TRIGGERS.includes(triggerType) ? triggerType : 'keyword';
    if (['keyword', 'exact'].includes(type) && (!Array.isArray(keywords) || keywords.filter(Boolean).length === 0)) {
      return res.status(400).json({ error: 'Debes indicar al menos una palabra clave' });
    }

    const rule = await db.whatsAppAutoReplyRule.create({
      data: {
        clubId,
        name,
        triggerType: type,
        matchMode: VALID_MATCH.includes(matchMode) ? matchMode : 'contains',
        keywords: Array.isArray(keywords) ? keywords.map(k => String(k).trim()).filter(Boolean) : [],
        responseText,
        active: active !== undefined ? !!active : true,
        priority: Number.isFinite(priority) ? priority : 0,
      },
    });
    res.status(201).json(rule);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateAutoReply = async (req, res) => {
  try {
    const { id } = req.params;
    const clubId = await resolveClubId(req, true);

    const existing = await db.whatsAppAutoReplyRule.findFirst({ where: { id, clubId } });
    if (!existing) return res.status(404).json({ error: 'Regla no encontrada' });

    const { name, triggerType, matchMode, keywords, responseText, active, priority } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (triggerType !== undefined && VALID_TRIGGERS.includes(triggerType)) data.triggerType = triggerType;
    if (matchMode !== undefined && VALID_MATCH.includes(matchMode)) data.matchMode = matchMode;
    if (keywords !== undefined) data.keywords = Array.isArray(keywords) ? keywords.map(k => String(k).trim()).filter(Boolean) : [];
    if (responseText !== undefined) data.responseText = responseText;
    if (active !== undefined) data.active = !!active;
    if (priority !== undefined) data.priority = priority;

    const rule = await db.whatsAppAutoReplyRule.update({ where: { id }, data });
    res.json(rule);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const toggleAutoReply = async (req, res) => {
  try {
    const { id } = req.params;
    const clubId = await resolveClubId(req, true);

    const existing = await db.whatsAppAutoReplyRule.findFirst({ where: { id, clubId } });
    if (!existing) return res.status(404).json({ error: 'Regla no encontrada' });

    const active = req.body?.active !== undefined ? !!req.body.active : !existing.active;
    const rule = await db.whatsAppAutoReplyRule.update({ where: { id }, data: { active } });
    res.json(rule);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteAutoReply = async (req, res) => {
  try {
    const { id } = req.params;
    const clubId = await resolveClubId(req, true);

    const existing = await db.whatsAppAutoReplyRule.findFirst({ where: { id, clubId } });
    if (!existing) return res.status(404).json({ error: 'Regla no encontrada' });

    await db.whatsAppAutoReplyRule.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── Configuración del agente de IA ───────────────────────────────────────────

export const getAgentConfig = async (req, res) => {
  try {
    const clubId = await resolveClubId(req);
    let config = await db.whatsAppAgentConfig.findUnique({ where: { clubId } });
    if (!config) {
      // Devolver valores por defecto sin persistir aún
      config = {
        clubId,
        enabled: false,
        name: 'Asistente',
        systemPrompt: '',
        modelSlug: 'gemini-2.5-flash',
        useKnowledge: true,
        temperature: 0.6,
        maxTokens: 600,
        historyLimit: 12,
        humanPauseMinutes: 120,
        fallbackMessage: null,
        _new: true,
      };
    }
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const upsertAgentConfig = async (req, res) => {
  try {
    const clubId = await resolveClubId(req, true);
    const {
      enabled, name, systemPrompt, modelSlug, useKnowledge,
      temperature, maxTokens, historyLimit, humanPauseMinutes, fallbackMessage,
    } = req.body;

    const data = {
      enabled: enabled !== undefined ? !!enabled : undefined,
      name: name ?? undefined,
      systemPrompt: systemPrompt ?? undefined,
      modelSlug: modelSlug ?? undefined,
      useKnowledge: useKnowledge !== undefined ? !!useKnowledge : undefined,
      temperature: temperature !== undefined ? Number(temperature) : undefined,
      maxTokens: maxTokens !== undefined ? parseInt(maxTokens, 10) : undefined,
      historyLimit: historyLimit !== undefined ? parseInt(historyLimit, 10) : undefined,
      humanPauseMinutes: humanPauseMinutes !== undefined ? parseInt(humanPauseMinutes, 10) : undefined,
      fallbackMessage: fallbackMessage !== undefined ? (fallbackMessage || null) : undefined,
    };

    // No permitir activar el agente sin instrucción
    if (data.enabled && !(data.systemPrompt ?? '').trim()) {
      const existing = await db.whatsAppAgentConfig.findUnique({ where: { clubId } });
      if (!(existing?.systemPrompt || '').trim() && !(data.systemPrompt || '').trim()) {
        return res.status(400).json({ error: 'No puedes activar el agente sin una instrucción' });
      }
    }

    const config = await db.whatsAppAgentConfig.upsert({
      where: { clubId },
      update: data,
      create: {
        clubId,
        enabled: data.enabled ?? false,
        name: data.name ?? 'Asistente',
        systemPrompt: data.systemPrompt ?? '',
        modelSlug: data.modelSlug ?? 'gemini-2.5-flash',
        useKnowledge: data.useKnowledge ?? true,
        temperature: data.temperature ?? 0.6,
        maxTokens: data.maxTokens ?? 600,
        historyLimit: data.historyLimit ?? 12,
        humanPauseMinutes: data.humanPauseMinutes ?? 120,
        fallbackMessage: data.fallbackMessage ?? null,
      },
    });
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/** Diagnóstico de por qué el agente podría no estar respondiendo por WhatsApp. */
export const getAutomationDiagnostics = async (req, res) => {
  try {
    const clubId = await resolveClubId(req);
    const isPlatformAdmin = !req.user?.clubId; // superadmin / sistema central

    const [club, agent, rules] = await Promise.all([
      db.club.findUnique({ where: { id: clubId }, select: { id: true, name: true } }),
      db.whatsAppAgentConfig.findUnique({ where: { clubId } }),
      db.whatsAppAutoReplyRule.findMany({ where: { clubId }, select: { triggerType: true, active: true } }),
    ]);

    // Config(s) de WhatsApp: sólo se listan todas para el admin de plataforma (evita filtrar datos entre clubes)
    const waConfigs = isPlatformAdmin
      ? await db.whatsAppConfig.findMany({ select: { clubId: true, phoneNumberId: true, enabled: true } })
      : await db.whatsAppConfig.findMany({ where: { clubId }, select: { clubId: true, phoneNumberId: true, enabled: true } });
    const thisClubWa = waConfigs.find(w => w.clubId === clubId) || null;

    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const [inbound24h, outbound24h, lastInbound] = await Promise.all([
      db.whatsAppMessageLog.count({ where: { clubId, direction: 'incoming', createdAt: { gte: since } } }),
      db.whatsAppMessageLog.count({ where: { clubId, direction: 'outgoing', createdAt: { gte: since } } }),
      db.whatsAppMessageLog.findFirst({ where: { clubId, direction: 'incoming' }, orderBy: { createdAt: 'desc' }, select: { phone: true, contactId: true, createdAt: true } }),
    ]);

    let lastContact = null;
    if (lastInbound?.contactId) {
      lastContact = await db.crmContact.findUnique({
        where: { id: lastInbound.contactId },
        select: { name: true, phone: true, autoReplyDisabled: true, autoReplyPausedUntil: true },
      });
    }
    const pausedActive = !!(lastContact?.autoReplyPausedUntil && new Date(lastContact.autoReplyPausedUntil) > new Date());

    const issues = [];
    if (!thisClubWa) {
      issues.push('Este club no tiene número de WhatsApp configurado. Las respuestas se evalúan en el club dueño del número que recibe los mensajes; activa el agente en ese club.');
    } else if (thisClubWa.enabled === false) {
      issues.push('La integración de WhatsApp de este club está DESHABILITADA (Configuración → WhatsApp).');
    }
    if (!agent || !agent.enabled) issues.push('El agente de IA está DESACTIVADO para este club.');
    else if (!(agent.systemPrompt || '').trim()) issues.push('El agente de IA no tiene instrucción guardada.');
    if (isPlatformAdmin && waConfigs.length > 1) {
      issues.push(`Hay ${waConfigs.length} clubes con WhatsApp configurado. El bot sólo responde en el club dueño del número que recibe el mensaje: confirma que el agente esté activo en ESE club.`);
    }
    if (lastContact?.autoReplyDisabled) issues.push('El último contacto tiene el bot silenciado (silencio por contacto).');
    if (pausedActive) issues.push(`El bot está EN PAUSA para ${lastContact?.name || lastInbound?.phone} hasta ${new Date(lastContact.autoReplyPausedUntil).toLocaleString()} porque alguien respondió manualmente desde el Chat. Durante la pausa el agente no responde.`);
    if (!process.env.GEMINI_API_KEY) issues.push('Falta GEMINI_API_KEY en el servidor (el agente no podrá generar respuestas).');
    if (inbound24h === 0) issues.push('No hay mensajes entrantes en las últimas 24h para este club: revisa que el webhook de Meta apunte a /api/crm/webhook y esté suscrito al campo "messages".');
    else if (outbound24h === 0 && agent?.enabled && !pausedActive) issues.push('Llegan mensajes pero el bot no ha enviado nada: posible error de envío a Meta (token/ventana de 24h) o el contacto está en pausa/silencio.');

    res.json({
      clubId,
      clubName: club?.name || null,
      whatsapp: thisClubWa ? { configured: true, enabled: thisClubWa.enabled, phoneNumberId: thisClubWa.phoneNumberId } : { configured: false },
      agent: agent
        ? { exists: true, enabled: agent.enabled, hasInstruction: !!(agent.systemPrompt || '').trim(), model: agent.modelSlug, useKnowledge: agent.useKnowledge, humanPauseMinutes: agent.humanPauseMinutes }
        : { exists: false },
      rules: { total: rules.length, active: rules.filter(r => r.active).length },
      lastInbound: lastInbound
        ? { phone: lastInbound.phone, name: lastContact?.name || null, at: lastInbound.createdAt, autoReplyDisabled: !!lastContact?.autoReplyDisabled, pausedUntil: lastContact?.autoReplyPausedUntil || null, pausedActive }
        : null,
      traffic24h: { inbound: inbound24h, outbound: outbound24h },
      clubsWithWhatsapp: isPlatformAdmin ? waConfigs : undefined,
      geminiKey: !!process.env.GEMINI_API_KEY,
      issues,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/** Quita la pausa por intervención humana del último (o de todos los) contacto(s). */
export const resumeAutomation = async (req, res) => {
  try {
    const clubId = await resolveClubId(req, true);
    const { contactId } = req.body || {};
    const where = contactId ? { id: contactId, clubId } : { clubId, autoReplyPausedUntil: { not: null } };
    const result = await db.crmContact.updateMany({ where, data: { autoReplyPausedUntil: null } });
    res.json({ success: true, resumed: result.count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/** Genera la instrucción del agente con IA a partir del conocimiento del club. */
export const generateAgentInstruction = async (req, res) => {
  try {
    const clubId = await resolveClubId(req, true);
    const { generateAgentInstruction: gen } = await import('../../services/whatsappAgent.js');
    const instruction = await gen({ clubId });
    if (!instruction) return res.status(502).json({ error: 'No se pudo generar la instrucción. Revisa la API key de IA.' });
    res.json({ instruction });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/** Prueba la respuesta del agente sin enviarla por WhatsApp. */
export const testAgentConfig = async (req, res) => {
  try {
    const clubId = await resolveClubId(req, true);
    const { message, history } = req.body;
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Escribe un mensaje de prueba' });
    }

    // Usar la config recibida (sin guardar) si viene, o la persistida
    const overrides = req.body.config;
    let agent = null;
    if (overrides && (overrides.systemPrompt || '').trim()) {
      agent = {
        systemPrompt: overrides.systemPrompt,
        modelSlug: overrides.modelSlug || 'gemini-2.5-flash',
        useKnowledge: overrides.useKnowledge !== undefined ? !!overrides.useKnowledge : true,
        fallbackMessage: overrides.fallbackMessage || null,
      };
    }

    const { previewAgentReply } = await import('../../services/whatsappAgent.js');
    const reply = await previewAgentReply({
      clubId,
      agent,
      messageText: String(message),
      history: Array.isArray(history) ? history : [],
    });
    res.json({ reply });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
