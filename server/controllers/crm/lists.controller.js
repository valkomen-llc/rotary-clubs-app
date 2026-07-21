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

// Creación MASIVA de listas por NOMBRE (motor de importación de listados). Distinto del
// importador de contactos: aquí solo se crean listas vacías a partir de una lista de
// nombres (uno por línea / pegado de Excel). Se saltan las que ya existan (match por
// nombre case-insensitive dentro del club) y los duplicados dentro del mismo lote. Solo
// creación aditiva — no borra ni modifica listas existentes.
export const bulkCreateLists = async (req, res) => {
  try {
    const clubId = await resolveClubId(req, true);
    const { names, color, description } = req.body;

    if (!Array.isArray(names)) {
      return res.status(400).json({ error: 'Se esperaba un array de nombres.' });
    }

    // Normalizar: trim, descartar vacíos y deduplicar dentro del lote (case-insensitive).
    const seen = new Set();
    const cleanNames = [];
    for (const raw of names) {
      const name = String(raw ?? '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      cleanNames.push(name);
    }

    if (cleanNames.length === 0) {
      return res.status(400).json({ error: 'No se detectaron nombres de lista válidos.' });
    }

    // Listas ya existentes en el club (para no duplicar).
    const existing = await db.crmList.findMany({ where: { clubId }, select: { name: true } });
    const existingSet = new Set(existing.map(l => l.name.toLowerCase()));

    let created = 0;
    let skipped = 0;
    const createdLists = [];

    for (const name of cleanNames) {
      if (existingSet.has(name.toLowerCase())) { skipped++; continue; }
      const list = await db.crmList.create({
        data: { clubId, name, color: color || '#3B82F6', description: description || null, tags: [] }
      });
      existingSet.add(name.toLowerCase());
      createdLists.push(list);
      created++;
    }

    res.status(201).json({
      success: true,
      summary: { total: cleanNames.length, created, skipped },
      lists: createdLists,
    });
  } catch (error) {
    console.error('Error in bulkCreateLists:', error);
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
