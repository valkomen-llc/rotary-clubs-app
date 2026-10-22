import db from '../../lib/prisma.js';
import { resolveClubId } from '../crmController.js';
import { validatePhoneNumber, sanitizeRawPhone } from '../../lib/phone.js';
import {
  ensureInstitutionalSchema,
  enrichContactPage,
  filterInstitutionalContactIds,
  hasInstitutionalFilters,
  resolveInstitutionalSegment,
  getInstitutionalContactDetail,
} from '../../lib/institutionalCrm.js';

const contactInclude = {
  listMemberships: { include: { list: true } },
  customFieldValues: { include: { field: { select: { id: true, label: true, key: true } } } },
  club: { select: { id: true, name: true } },
};

function mapTag(t, explicitTags = []) {
  const name = typeof t === 'string' ? t : t?.name;
  const explicit = explicitTags.find((et) => et.name === name);
  return { id: typeof t === 'string' ? t : (t?.id || name), name, color: explicit?.color || '#3B82F6' };
}

function serializeContact(contact, explicitTags = []) {
  return {
    ...contact,
    tags: contact.tags ? contact.tags.map((t) => mapTag(t, explicitTags)) : [],
    lists: contact.lists || (contact.listMemberships ? contact.listMemberships.map((lm) => lm.list) : []),
    customFields: contact.customFields || (contact.customFieldValues || []).map((item) => ({
      fieldId: item.fieldId,
      value: item.value,
      label: item.field?.label || null,
      key: item.field?.key || null,
    })),
  };
}

async function getExplicitTags(clubId) {
  const settings = await db.setting.findFirst({
    where: { clubId, key: 'crm_tags' }
  });
  if (!settings?.value) return [];
  try { return JSON.parse(settings.value); } catch { return []; }
}

/**
 * Sincroniza los campos personalizados de UN contacto. Sólo acepta campos del
 * club y reemplaza el conjunto de valores de ese contacto: lo que la ficha no
 * envía queda vacío, igual que ve el administrador en pantalla.
 */
async function syncContactCustomFields(clubId, contactId, customFields) {
  if (!Array.isArray(customFields)) return;

  const clubFields = await db.whatsAppCustomField.findMany({
    where: { clubId },
    select: { id: true }
  });
  const clubFieldIds = new Set(clubFields.map((field) => field.id));

  const submitted = [];
  for (const item of customFields) {
    const fieldId = item?.fieldId ? String(item.fieldId) : '';
    if (!fieldId || !clubFieldIds.has(fieldId)) continue;
    if (item.value === undefined || item.value === null || item.value === '') continue;
    submitted.push({ fieldId, value: String(item.value) });
  }

  const submittedIds = new Set(submitted.map((item) => item.fieldId));
  const toDelete = [...clubFieldIds].filter((fieldId) => !submittedIds.has(fieldId));

  await db.$transaction(async (tx) => {
    for (const item of submitted) {
      await tx.crmCustomFieldValue.upsert({
        where: { contactId_fieldId: { contactId, fieldId: item.fieldId } },
        update: { value: item.value },
        create: { contactId, fieldId: item.fieldId, value: item.value }
      });
    }
    if (toDelete.length) {
      await tx.crmCustomFieldValue.deleteMany({
        where: { contactId, fieldId: { in: toDelete } }
      });
    }
  });
}

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

    let institutionalIds = null;
    if (hasInstitutionalFilters(req.query)) {
      await ensureInstitutionalSchema();

      const idSets = [];
      const filters = { ...req.query };
      const segmentKey = filters.institutionalSegment;
      delete filters.institutionalSegment;

      if (segmentKey) {
        const segment = await resolveInstitutionalSegment(clubId, String(segmentKey));
        if (segment.error) return res.status(400).json({ error: segment.error });
        idSets.push(new Set(segment.contacts.map((contact) => contact.id)));
      }
      if (hasInstitutionalFilters(filters)) {
        const filtered = await filterInstitutionalContactIds(clubId, filters);
        idSets.push(new Set(filtered.ids));
      }

      if (idSets.length === 1) {
        institutionalIds = [...idSets[0]];
      } else if (idSets.length > 1) {
        institutionalIds = [...idSets[0]].filter((id) => idSets[1].has(id));
      } else {
        institutionalIds = [];
      }

      if (!institutionalIds.length) {
        return res.json({
          contacts: [],
          total: 0,
          page: parseInt(page),
          totalPages: 0,
        });
      }
      where.id = { in: institutionalIds };
    }

    const pageNumber = Math.max(1, parseInt(page) || 1);
    const pageSize = Math.max(1, Math.min(parseInt(limit) || 50, 200));
    const skip = (pageNumber - 1) * pageSize;

    const [contacts, total] = await Promise.all([
      db.crmContact.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: contactInclude
      }),
      db.crmContact.count({ where })
    ]);

    // La completitud y el estado de plataforma vienen del Directorio; nunca se
    // recalculan en el CRM. El tenant del contacto se devuelve como `origin`.
    await ensureInstitutionalSchema();
    const enriched = await enrichContactPage(clubId, contacts);
    const explicitTags = await getExplicitTags(clubId);
    const mappedContacts = enriched.map((contact) => serializeContact(contact, explicitTags));

    res.json({
      contacts: mappedContacts,
      total,
      page: pageNumber,
      totalPages: Math.ceil(total / pageSize)
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

    await ensureInstitutionalSchema();
    const detail = await getInstitutionalContactDetail(clubId, id);
    if (!detail) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }

    const explicitTags = await getExplicitTags(clubId);
    const mapped = {
      ...serializeContact(detail.contact, explicitTags),
      // La ficha inteligente consume estos bloques sin tener que hacer una
      // segunda petición. `contact.institutional` sigue siendo la fuente.
      institutionalDetail: {
        candidates: detail.candidates,
        audit: detail.audit,
        profile: detail.profile,
        completion: detail.completion,
        platformStatus: detail.platformStatus,
        alerts: detail.alerts,
      },
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

    let finalPhone = phone ? sanitizeRawPhone(phone) : null;
    let finalCountry = country || null;

    if (finalPhone) {
      const norm = validatePhoneNumber(finalPhone, country);
      if (norm.ok) {
        finalPhone = norm.e164Formatted;
        if (!finalCountry && norm.country) finalCountry = norm.country;
      }
      const rawDigits = finalPhone.replace(/[^0-9]/g, '');
      const duplicate = await db.crmContact.findFirst({
        where: {
          clubId,
          OR: [
            { phone: finalPhone },
            { phone: rawDigits },
            { phone: `+${rawDigits}` }
          ]
        }
      });
      if (duplicate) {
        return res.status(400).json({ 
          error: `Ya existe otro contacto (${duplicate.name} ${duplicate.lastName || ''}) con el número de teléfono ${finalPhone}.` 
        });
      }
    }

    const newContact = await db.crmContact.create({
      data: {
        clubId,
        prefix,
        name,
        lastName,
        email,
        phone: finalPhone,
        title,
        company,
        city,
        country: finalCountry,
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
      include: contactInclude
    });

    await syncContactCustomFields(clubId, newContact.id, customFields);

    await ensureInstitutionalSchema();
    const fresh = await db.crmContact.findFirst({
      where: { id: newContact.id, clubId },
      include: contactInclude
    });
    const [enriched] = await enrichContactPage(clubId, [fresh]);
    const explicitTags = await getExplicitTags(clubId);
    res.status(201).json(serializeContact(enriched || fresh || newContact, explicitTags));
  } catch (error) {
    console.error('Error creating CRM contact:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateContact = async (req, res) => {
  try {
    const { id } = req.params;
    const clubId = await resolveClubId(req, true);
    const updates = { ...req.body };

    // Verify ownership
    const existing = await db.crmContact.findFirst({ where: { id, clubId } });
    if (!existing) return res.status(404).json({ error: 'Contact not found' });

    if (updates.phone) {
      let finalPhone = sanitizeRawPhone(updates.phone);
      const norm = validatePhoneNumber(finalPhone, updates.country || existing.country);
      if (norm.ok) {
        finalPhone = norm.e164Formatted;
        if (!updates.country && norm.country) updates.country = norm.country;
      }
      updates.phone = finalPhone;

      const rawDigits = finalPhone.replace(/[^0-9]/g, '');
      const duplicate = await db.crmContact.findFirst({
        where: {
          clubId,
          id: { not: id },
          OR: [
            { phone: finalPhone },
            { phone: rawDigits },
            { phone: `+${rawDigits}` }
          ]
        }
      });
      if (duplicate) {
        return res.status(400).json({ 
          error: `Ya existe otro contacto (${duplicate.name} ${duplicate.lastName || ''}) con el número de teléfono ${finalPhone}.` 
        });
      }
    }

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

    const customFields = updates.customFields;
    delete updates.customFields;
    // El club del contacto es el tenant de origen; no se cambia desde la ficha
    // ni desde un payload arbitrario.
    delete updates.clubId;
    delete updates.id;
    delete updates.createdAt;
    delete updates.updatedAt;

    // Update basic info
    await db.crmContact.update({
      where: { id },
      data: updates,
      include: contactInclude
    });

    await syncContactCustomFields(clubId, id, customFields);

    await ensureInstitutionalSchema();
    const fresh = await db.crmContact.findFirst({
      where: { id, clubId },
      include: contactInclude
    });
    const [enriched] = await enrichContactPage(clubId, [fresh]);
    const explicitTags = await getExplicitTags(clubId);

    res.json(serializeContact(enriched || fresh, explicitTags));
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
