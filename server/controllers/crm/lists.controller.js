import db from '../../lib/prisma.js';
import { resolveClubId } from '../crmController.js';

export const getLists = async (req, res) => {
  try {
    const clubId = await resolveClubId(req);
    // Listas propias del sitio + listas de OTROS sitios que fueron vinculadas a este
    // sitio vía siteIds (para que el sitio pueda verlas y usarlas en campañas). Solo
    // suma listas visibles — no oculta ni modifica nada.
    const lists = await db.crmList.findMany({
      where: { OR: [{ clubId }, { siteIds: { has: clubId } }] },
      include: {
        _count: {
          select: { members: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    // Marca las que no son propias como "vinculadas" (solo lectura para este sitio).
    res.json(lists.map(l => ({ ...l, isLinked: l.clubId !== clubId })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getListById = async (req, res) => {
  try {
    const { id } = req.params;
    const clubId = await resolveClubId(req);

    // Propia o vinculada a este sitio (lectura).
    const list = await db.crmList.findFirst({
      where: { id, OR: [{ clubId }, { siteIds: { has: clubId } }] },
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
    const { name, color, description, tags, siteIds } = req.body;

    const list = await db.crmList.create({
      data: { clubId, name, color, description, tags: tags || [], siteIds: siteIds || [] }
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
    const { name, color, description, tags, siteIds } = req.body;

    // Solo campos presentes (evita pisar tags/siteIds con [] si el form no los manda).
    const data = { name, color, description };
    if (tags !== undefined) data.tags = tags || [];
    if (siteIds !== undefined) data.siteIds = siteIds || [];

    // Solo el sitio dueño puede editar (las vinculadas son de solo lectura acá).
    const list = await db.crmList.updateMany({
      where: { id, clubId },
      data
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

// Acciones MASIVAS sobre varias listas propias: agregar/quitar etiquetas y enlazar/
// desenlazar sitios. Solo afecta listas del sitio dueño (las vinculadas de otros
// sitios no se tocan). Todo aditivo/idempotente, sin borrados de datos.
export const bulkUpdateLists = async (req, res) => {
  try {
    const clubId = await resolveClubId(req, true);
    const { ids, addTags = [], removeTags = [], addSiteIds = [], removeSiteIds = [] } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Se esperaba un array de ids de listas.' });
    }

    const lists = await db.crmList.findMany({
      where: { id: { in: ids }, clubId },
      select: { id: true, tags: true, siteIds: true }
    });

    let updated = 0;
    for (const l of lists) {
      const tagSet = new Set(l.tags || []);
      (addTags || []).forEach(t => { const v = String(t || '').trim(); if (v) tagSet.add(v); });
      (removeTags || []).forEach(t => tagSet.delete(t));

      const siteSet = new Set(l.siteIds || []);
      (addSiteIds || []).forEach(s => { if (s) siteSet.add(s); });
      (removeSiteIds || []).forEach(s => siteSet.delete(s));

      await db.crmList.update({
        where: { id: l.id },
        data: { tags: Array.from(tagSet), siteIds: Array.from(siteSet) }
      });
      updated++;
    }

    res.json({ success: true, updated });
  } catch (error) {
    console.error('Error in bulkUpdateLists:', error);
    res.status(500).json({ error: error.message });
  }
};

// Eliminación MASIVA de listas propias (los contactos se conservan; solo se pierde la
// asociación lista↔contacto). Solo listas del sitio dueño.
export const bulkDeleteLists = async (req, res) => {
  try {
    const clubId = await resolveClubId(req, true);
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Se esperaba un array de ids de listas.' });
    }
    const result = await db.crmList.deleteMany({ where: { id: { in: ids }, clubId } });
    res.json({ success: true, deleted: result.count });
  } catch (error) {
    console.error('Error in bulkDeleteLists:', error);
    res.status(500).json({ error: error.message });
  }
};

// Sitios de la plataforma vinculables a una lista: clubs (y sus sub-tipos: evento,
// feria, asociación, fundación…) + distritos. Solo lectura, campos mínimos. Se usa
// para poblar el selector/filtro de "Sitios vinculados".
export const getLinkableSites = async (req, res) => {
  try {
    const [clubs, districts] = await Promise.all([
      db.club.findMany({ select: { id: true, name: true, type: true, category: true }, orderBy: { name: 'asc' } }),
      db.district.findMany({ select: { id: true, number: true, name: true }, orderBy: { name: 'asc' } }),
    ]);

    const sites = [
      ...districts.map(d => ({ id: d.id, name: d.name || `Distrito ${d.number ?? ''}`.trim(), type: 'district' })),
      ...clubs.map(c => ({ id: c.id, name: c.name, type: c.type || c.category || 'club' })),
    ];

    res.json(sites);
  } catch (error) {
    console.error('Error in getLinkableSites:', error);
    res.status(500).json({ error: error.message });
  }
};
