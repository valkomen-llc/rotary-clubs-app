import db from '../../lib/prisma.js';
import { resolveClubId } from '../crmController.js';

export const getCustomFields = async (req, res) => {
  try {
    const clubId = await resolveClubId(req);
    res.json([]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createCustomField = async (req, res) => {
  try {
    const clubId = await resolveClubId(req, true);
    const { label, key, type, options, required, status, groupId, sortOrder } = req.body;
    
    res.status(201).json({ id: Date.now().toString(), label, key, type, options, required, status, groupId, sortOrder });
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
    
    res.json({ id, label, key, type, options, required, status, groupId, sortOrder });
  } catch (error) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'La llave (key) ya existe' });
    res.status(500).json({ error: error.message });
  }
};

export const deleteCustomField = async (req, res) => {
  try {
    const { id } = req.params;
    const clubId = await resolveClubId(req);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
