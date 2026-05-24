import db from '../../lib/prisma.js';
import { resolveClubId } from '../crmController.js';

export const getTags = async (req, res) => {
  try {
    const clubId = await resolveClubId(req);
    const tags = await db.crmTag.findMany({
      where: { clubId },
      include: {
        _count: {
          select: { contacts: true }
        }
      },
      orderBy: { name: 'asc' }
    });
    
    res.json(tags);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getTagById = async (req, res) => {
  try {
    const { id } = req.params;
    const clubId = await resolveClubId(req);

    const tag = await db.crmTag.findFirst({
      where: { id, clubId },
      include: {
        _count: {
          select: { contacts: true }
        }
      }
    });

    if (!tag) return res.status(404).json({ error: 'Etiqueta no encontrada' });

    // Optional: Fetch basic counts for the tag dashboard
    // Count total subscribed vs unsubscribed inside this tag
    const statusCounts = await db.crmContact.groupBy({
      by: ['status'],
      where: { 
        clubId, 
        contactTags: { some: { tagId: id } } 
      },
      _count: { id: true }
    });

    const stats = {
      total: tag._count.contacts,
      subscribed: statusCounts.find(s => s.status === 'subscribed')?._count.id || 0,
      unsubscribed: statusCounts.find(s => s.status === 'unsubscribed')?._count.id || 0,
      pending: statusCounts.find(s => s.status === 'pending')?._count.id || 0,
    };

    res.json({ tag, stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createTag = async (req, res) => {
  try {
    const clubId = await resolveClubId(req, true);
    const { name, color, description } = req.body;
    
    const tag = await db.crmTag.create({
      data: { clubId, name, color, description }
    });
    res.status(201).json(tag);
  } catch (error) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'La etiqueta ya existe' });
    res.status(500).json({ error: error.message });
  }
};

export const updateTag = async (req, res) => {
  try {
    const { id } = req.params;
    const clubId = await resolveClubId(req, true);
    const { name, color, description } = req.body;
    
    const tag = await db.crmTag.updateMany({
      where: { id, clubId },
      data: { name, color, description }
    });
    res.json({ success: true, updated: tag.count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteTag = async (req, res) => {
  try {
    const { id } = req.params;
    const clubId = await resolveClubId(req);
    
    await db.crmTag.deleteMany({
      where: { id, clubId }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
