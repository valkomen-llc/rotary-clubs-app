import db from '../../lib/prisma.js';
import { resolveClubId } from '../crmController.js';

export const getTags = async (req, res) => {
  try {
    const clubId = await resolveClubId(req);
    const contacts = await db.crmContact.findMany({
      where: { clubId },
      select: { tags: true }
    });
    
    // Extract unique tags and map them to standard format
    const uniqueTags = [...new Set(contacts.flatMap(c => c.tags || []))].filter(Boolean);
    const mappedTags = uniqueTags.map(tag => ({
      id: tag,
      name: tag,
      color: '#3B82F6',
      _count: { contacts: contacts.filter(c => c.tags && c.tags.includes(tag)).length }
    })).sort((a, b) => a.name.localeCompare(b.name));
    
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
    const { name } = req.body;
    res.status(201).json({ id: name, name, color: '#3B82F6' });
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
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
