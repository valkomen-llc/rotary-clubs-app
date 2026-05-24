import db from '../../lib/prisma.js';
import { resolveClubId } from '../crmController.js';

export const getLists = async (req, res) => {
  try {
    const clubId = await resolveClubId(req);
    const lists = await db.crmList.findMany({
      where: { clubId },
      include: {
        _count: {
          select: { members: true }
        }
      },
      orderBy: { name: 'asc' }
    });
    
    res.json(lists);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getListById = async (req, res) => {
  try {
    const { id } = req.params;
    const clubId = await resolveClubId(req);

    const list = await db.crmList.findFirst({
      where: { id, clubId },
      include: {
        _count: {
          select: { members: true }
        }
      }
    });

    if (!list) return res.status(404).json({ error: 'Lista no encontrada' });

    // Optional: Fetch basic counts for the list dashboard
    // Count total subscribed vs unsubscribed inside this list
    const statusCounts = await db.crmContact.groupBy({
      by: ['status'],
      where: { 
        clubId, 
        listMemberships: { some: { listId: id } } 
      },
      _count: { id: true }
    });

    const stats = {
      total: list._count.members,
      subscribed: statusCounts.find(s => s.status === 'subscribed')?._count.id || 0,
      unsubscribed: statusCounts.find(s => s.status === 'unsubscribed')?._count.id || 0,
      pending: statusCounts.find(s => s.status === 'pending')?._count.id || 0,
    };

    res.json({ list, stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createList = async (req, res) => {
  try {
    const clubId = await resolveClubId(req, true);
    const { name, color, description, tags } = req.body;
    
    const list = await db.crmList.create({
      data: { clubId, name, color, description, tags: tags || [] }
    });
    res.status(201).json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateList = async (req, res) => {
  try {
    const { id } = req.params;
    const clubId = await resolveClubId(req, true);
    const { name, color, description, tags } = req.body;
    
    const list = await db.crmList.updateMany({
      where: { id, clubId },
      data: { name, color, description, tags: tags || [] }
    });
    res.json({ success: true, updated: list.count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteList = async (req, res) => {
  try {
    const { id } = req.params;
    const clubId = await resolveClubId(req);
    
    await db.crmList.deleteMany({
      where: { id, clubId }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
