import db from '../../lib/prisma.js';
import { resolveClubId } from '../crmController.js';

export const getGroups = async (req, res) => {
  try {
    const clubId = await resolveClubId(req);
    res.json([]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createGroup = async (req, res) => {
  try {
    const clubId = await resolveClubId(req, true);
    const { name, description, sortOrder } = req.body;
    
    res.status(201).json({ id: Date.now().toString(), name, description, sortOrder: sortOrder || 0 });
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
    
    res.json({ id, name, description, sortOrder });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const clubId = await resolveClubId(req);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
