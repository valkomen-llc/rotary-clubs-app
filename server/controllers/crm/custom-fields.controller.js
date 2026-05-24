import db from '../../lib/prisma.js';
import { resolveClubId } from '../crmController.js';

export const getCustomFields = async (req, res) => {
  try {
    const clubId = await resolveClubId(req);
    const fields = await db.crmCustomField.findMany({
      where: { clubId },
      orderBy: { sortOrder: 'asc' },
      include: {
        group: true
      }
    });
    
    res.json(fields);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createCustomField = async (req, res) => {
  try {
    const clubId = await resolveClubId(req, true);
    const { label, key, type, options, required, status, groupId, sortOrder } = req.body;
    
    const field = await db.crmCustomField.create({
      data: { 
        clubId, 
        label, 
        key, 
        type, 
        options, 
        required: !!required,
        status: status || 'active',
        groupId: groupId || null,
        sortOrder: sortOrder || 0
      }
    });
    res.status(201).json(field);
  } catch (error) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'La llave (key) ya existe' });
    res.status(500).json({ error: error.message });
  }
};

export const updateCustomField = async (req, res) => {
  try {
    const { id } = req.params;
    const clubId = await resolveClubId(req, true);
    const { label, key, type, options, required, status, groupId, sortOrder } = req.body;
    
    const field = await db.crmCustomField.update({
      where: { id },
      data: { 
        label, 
        key, 
        type, 
        options, 
        required: !!required,
        status: status || 'active',
        groupId: groupId || null,
        sortOrder: sortOrder || 0
      }
    });
    res.json(field);
  } catch (error) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'La llave (key) ya existe' });
    res.status(500).json({ error: error.message });
  }
};

export const deleteCustomField = async (req, res) => {
  try {
    const { id } = req.params;
    const clubId = await resolveClubId(req);
    
    await db.crmCustomField.deleteMany({
      where: { id, clubId }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
