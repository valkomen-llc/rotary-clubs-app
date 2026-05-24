import db from '../../lib/prisma.js';
import { resolveClubId } from '../crmController.js';

export const getContacts = async (req, res) => {
  try {
    const clubId = await resolveClubId(req);
    const { search, tags, lists, status, page = 1, limit = 50 } = req.query;

    const where = { clubId };
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }
    
    if (status) {
      where.status = status;
    }

    if (tags) {
      const tagIds = Array.isArray(tags) ? tags : tags.split('|||');
      where.tags = { hasSome: tagIds };
    }

    if (lists) {
      const listIds = Array.isArray(lists) ? lists : lists.split('|||');
      where.listMemberships = {
        some: { listId: { in: listIds } }
      };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [contacts, total] = await Promise.all([
      db.crmContact.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          listMemberships: { include: { list: true } },
        }
      }),
      db.crmContact.count({ where })
    ]);

    // Fetch tags settings to map colors correctly
    const settings = await db.setting.findFirst({
      where: { clubId, key: 'crm_tags' }
    });
    let explicitTags = [];
    if (settings && settings.value) {
      try { explicitTags = JSON.parse(settings.value); } catch (e) {}
    }

    // Map to a cleaner structure for the frontend
    const mappedContacts = contacts.map(c => ({
      ...c,
      tags: c.tags ? c.tags.map(t => {
         const explicit = explicitTags.find(et => et.name === t);
         return { id: t, name: t, color: explicit ? explicit.color : '#3B82F6' };
      }) : [],
      lists: c.listMemberships ? c.listMemberships.map(lm => lm.list) : [],
    }));

    res.json({
      contacts: mappedContacts,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('Error fetching CRM contacts:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getContactById = async (req, res) => {
  try {
    const { id } = req.params;
    const clubId = await resolveClubId(req);

    const contact = await db.crmContact.findFirst({
      where: { id, clubId },
      include: {
        listMemberships: { include: { list: true } },
      }
    });

    if (!contact) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }

    const mapped = {
      ...contact,
      tags: contact.tags ? contact.tags.map(t => ({ id: t, name: t, color: '#3B82F6' })) : [],
      lists: contact.listMemberships ? contact.listMemberships.map(lm => lm.list) : [],
    };

    res.json(mapped);
  } catch (error) {
    console.error('Error fetching CRM contact by ID:', error);
    res.status(500).json({ error: error.message });
  }
};

export const createContact = async (req, res) => {
  try {
    const clubId = await resolveClubId(req, true);
    const { 
      prefix, name, lastName, email, phone, title, company, 
      city, country, tags, lists, customFields, status 
    } = req.body;

    const newContact = await db.crmContact.create({
      data: {
        clubId,
        prefix,
        name,
        lastName,
        email,
        phone,
        title,
        company,
        city,
        country,
        status: status || 'subscribed',
        source: 'manual',
        // Optional nested creates
        ...(lists && lists.length > 0 && {
          listMemberships: {
            create: lists.map(listId => ({ listId }))
          }
        }),
        tags: tags && tags.length > 0 ? tags : []
      },
      include: {
        listMemberships: { include: { list: true } }
      }
    });

    const mapped = {
      ...newContact,
      tags: newContact.tags ? newContact.tags.map(t => ({ id: t, name: t, color: '#3B82F6' })) : [],
      lists: newContact.listMemberships ? newContact.listMemberships.map(lm => lm.list) : [],
    };

    res.status(201).json(mapped);
  } catch (error) {
    console.error('Error creating CRM contact:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateContact = async (req, res) => {
  try {
    const { id } = req.params;
    const clubId = await resolveClubId(req, true);
    const updates = req.body;

    // Verify ownership
    const existing = await db.crmContact.findFirst({ where: { id, clubId } });
    if (!existing) return res.status(404).json({ error: 'Contact not found' });

    // Handle tags update (direct array update)
    if (updates.tags) {
      updates.tags = Array.isArray(updates.tags) ? updates.tags : updates.tags.split(',');
    }

    // Handle lists update (replace all)
    if (updates.lists) {
      await db.contactListMember.deleteMany({ where: { contactId: id } });
      if (updates.lists.length > 0) {
        await db.contactListMember.createMany({
          data: updates.lists.map(listId => ({ contactId: id, listId }))
        });
      }
      delete updates.lists;
    }

    // Removed hallucinated customFields operations
    if (updates.customFields) {
      delete updates.customFields;
    }

    // Update basic info
    const updated = await db.crmContact.update({
      where: { id },
      data: updates,
      include: {
        listMemberships: { include: { list: true } }
      }
    });

    const mapped = {
      ...updated,
      tags: updated.tags ? updated.tags.map(t => ({ id: t, name: t, color: '#3B82F6' })) : [],
      lists: updated.listMemberships ? updated.listMemberships.map(lm => lm.list) : [],
    };

    res.json(mapped);
  } catch (error) {
    console.error('Error updating CRM contact:', error);
    res.status(500).json({ error: error.message });
  }
};

export const deleteContact = async (req, res) => {
  try {
    const { id } = req.params;
    const clubId = await resolveClubId(req);
    
    await db.crmContact.delete({
      where: { id_clubId: { id, clubId } } // Actually standard delete with verification
    }).catch(async () => {
       await db.crmContact.deleteMany({ where: { id, clubId }});
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting CRM contact:', error);
    res.status(500).json({ error: error.message });
  }
};
