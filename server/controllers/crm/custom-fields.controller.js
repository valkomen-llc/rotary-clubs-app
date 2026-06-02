import { Prisma } from '@prisma/client';
import db from '../../lib/prisma.js';
import { resolveClubId } from '../crmController.js';

export const getCustomFields = async (req, res) => {
  try {
    const clubId = await resolveClubId(req);
    const fields = await db.whatsAppCustomField.findMany({
      where: { clubId },
      include: { group: { select: { id: true, name: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
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

    if (!label || !key) {
      return res.status(400).json({ error: 'El nombre (label) y la llave (key) son obligatorios' });
    }

    const field = await db.whatsAppCustomField.create({
      data: {
        clubId,
        label,
        key,
        type: type || 'text',
        required: !!required,
        status: status || 'active',
        options: options == null ? Prisma.JsonNull : options,
        groupId: groupId || null,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0
      },
      include: { group: { select: { id: true, name: true } } }
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

    // Asegurar que el campo pertenezca a este club
    const existing = await db.whatsAppCustomField.findFirst({ where: { id, clubId } });
    if (!existing) return res.status(404).json({ error: 'Campo no encontrado' });

    const data = {};
    if (label !== undefined) data.label = label;
    if (key !== undefined) data.key = key;
    if (type !== undefined) data.type = type;
    if (required !== undefined) data.required = !!required;
    if (status !== undefined) data.status = status;
    if (sortOrder !== undefined) data.sortOrder = sortOrder;
    if (groupId !== undefined) data.groupId = groupId || null;
    if (options !== undefined) data.options = options == null ? Prisma.JsonNull : options;

    const field = await db.whatsAppCustomField.update({
      where: { id },
      data,
      include: { group: { select: { id: true, name: true } } }
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
    const clubId = await resolveClubId(req, true);

    const existing = await db.whatsAppCustomField.findFirst({ where: { id, clubId } });
    if (!existing) return res.status(404).json({ error: 'Campo no encontrado' });

    // Los valores asociados (CrmCustomFieldValue) se borran en cascada por la FK
    await db.whatsAppCustomField.delete({ where: { id } });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
