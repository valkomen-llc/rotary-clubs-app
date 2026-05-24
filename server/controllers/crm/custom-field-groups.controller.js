import db from '../../lib/prisma.js';
import { resolveClubId } from '../crmController.js';

export const getGroups = async (req, res) => {
  try {
    const clubId = await resolveClubId(req);
    const groups = await db.crmCustomFieldGroup.findMany({
      where: { clubId },
      orderBy: { sortOrder: 'asc' },
      include: {
        fields: {
          orderBy: { sortOrder: 'asc' }
        }
      }
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
    
    const group = await db.crmCustomFieldGroup.create({
      data: { clubId, name, description, sortOrder: sortOrder || 0 }
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
    
    const group = await db.crmCustomFieldGroup.update({
      where: { id },
      data: { name, description, sortOrder }
    });
    res.json(group);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const clubId = await resolveClubId(req);
    
    await db.crmCustomFieldGroup.deleteMany({
      where: { id, clubId }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
