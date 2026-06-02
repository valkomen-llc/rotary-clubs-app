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
