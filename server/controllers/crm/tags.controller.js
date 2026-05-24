import db from '../../lib/prisma.js';
import { resolveClubId } from '../crmController.js';

export const getTags = async (req, res) => {
  try {
    const clubId = await resolveClubId(req);
    const contacts = await db.crmContact.findMany({
      where: { clubId },
      select: { tags: true }
    });
    
    // Load explicitly created tags from Settings
    const settings = await db.setting.findFirst({
      where: { clubId, key: 'crm_tags' }
    });
    let explicitTags = [];
    if (settings && settings.value) {
      try { explicitTags = JSON.parse(settings.value); } catch (e) {}
    }

    // Extract unique tags from contacts
    const contactTags = [...new Set(contacts.flatMap(c => c.tags || []))].filter(Boolean);
    
    // Merge explicit tags with implicit tags
    const allTagNames = new Set([...explicitTags.map(t => t.name), ...contactTags]);
    
    const mappedTags = Array.from(allTagNames).map(tagName => {
      const explicit = explicitTags.find(t => t.name === tagName);
      return {
        id: explicit ? explicit.id : tagName,
        name: tagName,
        color: explicit ? explicit.color : '#3B82F6',
        _count: { contacts: contacts.filter(c => c.tags && c.tags.includes(tagName)).length }
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
    
    res.json(mappedTags);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getTagById = async (req, res) => {
  try {
    const { id } = req.params;
    const clubId = await resolveClubId(req);

    // Reconstruct tag from contacts
    const contacts = await db.crmContact.findMany({
      where: { clubId, tags: { has: id } },
      select: { id: true, status: true }
    });

    if (!contacts) return res.status(404).json({ error: 'Etiqueta no encontrada' });

    const tag = {
      id,
      name: id,
      color: '#3B82F6',
      _count: { contacts: contacts.length }
    };

    const stats = {
      total: contacts.length,
      subscribed: contacts.filter(c => c.status === 'subscribed').length,
      unsubscribed: contacts.filter(c => c.status === 'unsubscribed').length,
      pending: contacts.filter(c => c.status === 'pending').length,
    };

    res.json({ tag, stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createTag = async (req, res) => {
  try {
    const clubId = await resolveClubId(req, true);
    const { name, color } = req.body;
    
    const settings = await db.setting.findFirst({ where: { clubId, key: 'crm_tags' } });
    let tags = [];
    if (settings && settings.value) {
      try { tags = JSON.parse(settings.value); } catch (e) {}
    }
    
    const newTag = { id: name, name, color: color || '#3B82F6' };
    
    if (!tags.find(t => t.name === name)) {
      tags.push(newTag);
      if (settings) {
        await db.setting.update({ where: { id: settings.id }, data: { value: JSON.stringify(tags) }});
      } else {
        await db.setting.create({ data: { clubId, key: 'crm_tags', value: JSON.stringify(tags) }});
      }
    }
    
    res.status(201).json(newTag);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateTag = async (req, res) => {
  try {
    const { id } = req.params;
    const clubId = await resolveClubId(req, true);
    const { name } = req.body;
    
    // Replace old tag with new tag in all contacts
    const contacts = await db.crmContact.findMany({ where: { clubId, tags: { has: id } } });
    for (const c of contacts) {
      const updatedTags = c.tags.filter(t => t !== id);
      if (name) updatedTags.push(name);
      await db.crmContact.update({ where: { id: c.id }, data: { tags: updatedTags } });
    }
    
    // Update in Settings
    const settings = await db.setting.findFirst({ where: { clubId, key: 'crm_tags' } });
    if (settings && settings.value) {
      try {
        let tags = JSON.parse(settings.value);
        tags = tags.map(t => t.id === id || t.name === id ? { ...t, name: name || t.name, id: name || t.id } : t);
        await db.setting.update({ where: { id: settings.id }, data: { value: JSON.stringify(tags) }});
      } catch (e) {}
    }
    
    res.json({ success: true, updated: contacts.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteTag = async (req, res) => {
  try {
    const { id } = req.params;
    const clubId = await resolveClubId(req);
    
    const contacts = await db.crmContact.findMany({ where: { clubId, tags: { has: id } } });
    for (const c of contacts) {
      const updatedTags = c.tags.filter(t => t !== id);
      await db.crmContact.update({ where: { id: c.id }, data: { tags: updatedTags } });
    }
    
    // Remove from Settings
    const settings = await db.setting.findFirst({ where: { clubId, key: 'crm_tags' } });
    if (settings && settings.value) {
      try {
        let tags = JSON.parse(settings.value);
        tags = tags.filter(t => t.id !== id && t.name !== id);
        await db.setting.update({ where: { id: settings.id }, data: { value: JSON.stringify(tags) }});
      } catch (e) {}
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
