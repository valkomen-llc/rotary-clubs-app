import db from '../../lib/prisma.js';
import { resolveClubId } from '../crmController.js';

export const getGroups = async (req, res) => {
  try {
    const clubId = await resolveClubId(req);
    const groups = await db.crmCustomFieldGroup.findMany({
      where: { clubId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    });
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createGroup = async (req, res) => {
  try {
    const clubId = await resolveClubId(req, true);
    const { name, description, sortOrder } = req.body;

    if (!name) return res.status(400).json({ error: 'El nombre del grupo es obligatorio' });

    const group = await db.crmCustomFieldGroup.create({
      data: {
        clubId,
        name,
        description: description || null,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0
      }
    });

    res.status(201).json(group);
  } catch (error) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'El nombre del grupo ya existe' });
    res.status(500).json({ error: error.message });
  }
};

export const updateGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const clubId = await resolveClubId(req, true);
    const { name, description, sortOrder } = req.body;

    const existing = await db.crmCustomFieldGroup.findFirst({ where: { id, clubId } });
    if (!existing) return res.status(404).json({ error: 'Grupo no encontrado' });

    const data = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description || null;
    if (sortOrder !== undefined) data.sortOrder = sortOrder;

    const group = await db.crmCustomFieldGroup.update({ where: { id }, data });
    res.json(group);
  } catch (error) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'El nombre del grupo ya existe' });
    res.status(500).json({ error: error.message });
  }
};

export const deleteGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const clubId = await resolveClubId(req, true);

    const existing = await db.crmCustomFieldGroup.findFirst({ where: { id, clubId } });
    if (!existing) return res.status(404).json({ error: 'Grupo no encontrado' });

    // Los campos que apuntaban a este grupo quedan con groupId = null (onDelete: SetNull)
    await db.crmCustomFieldGroup.delete({ where: { id } });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
