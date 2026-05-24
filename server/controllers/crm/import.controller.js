import db from '../../lib/prisma.js';
import { resolveClubId } from '../crmController.js';

export const importContacts = async (req, res) => {
  try {
    const clubId = await resolveClubId(req, true);
    const { contacts, config, lists, tags } = req.body;

    if (!contacts || !Array.isArray(contacts)) {
      return res.status(400).json({ error: 'Formato de contactos inválido. Se esperaba un array.' });
    }

    const { onDuplicate = 'ignore', status = 'subscribed' } = config || {};
    
    let totalImported = 0;
    let totalUpdated = 0;
    let totalFailed = 0;
    let errors = [];

    // Para evitar consultas N+1 en exceso, podríamos usar db.$transaction, pero dadas
    // las inserciones condicionales y los upserts complejos (con relations),
    // procesaremos iterativamente (adecuado para lotes de ~500-1000).
    // Si la carga es muy masiva en el futuro, usaríamos un queue.
    
    for (const [index, contact] of contacts.entries()) {
      try {
        if (!contact.email && !contact.phone) {
          throw new Error('El contacto debe tener al menos un Email o Teléfono válido.');
        }
        
        // Criterio de unicidad: Primero buscamos por Email, luego por Teléfono (si ambos existen)
        let existingContact = null;
        if (contact.email) {
           existingContact = await db.crmContact.findFirst({ where: { clubId, email: contact.email } });
        }
        if (!existingContact && contact.phone) {
           existingContact = await db.crmContact.findFirst({ where: { clubId, phone: contact.phone } });
        }

        const data = {
          clubId,
          prefix: contact.prefix || null,
          name: contact.name || 'Sin nombre',
          lastName: contact.lastName || null,
          email: contact.email || null,
          phone: contact.phone || null,
          title: contact.title || null,
          company: contact.company || null,
          city: contact.city || null,
          country: contact.country || null,
          address: contact.address || null,
          website: contact.website || null,
          status: contact.status || status,
          source: 'import',
        };

        let contactId;

        if (existingContact) {
          if (onDuplicate === 'ignore') {
             // Ya existe, saltamos
             continue;
          } else if (onDuplicate === 'update') {
             const updated = await db.crmContact.update({
               where: { id: existingContact.id },
               data
             });
             contactId = updated.id;
             totalUpdated++;
          }
        } else {
          // Crear nuevo
          const created = await db.crmContact.create({ data });
          contactId = created.id;
          totalImported++;
        }

        // Si tenemos un contactId válido (creado o actualizado), asociamos listas y etiquetas
        if (contactId) {
           if (tags && tags.length > 0) {
             // Ignoramos duplicados insertando sólo los que no existen
             for (const tagId of tags) {
                const exists = await db.crmContactTag.findUnique({ where: { contactId_tagId: { contactId, tagId } } });
                if (!exists) {
                   await db.crmContactTag.create({ data: { contactId, tagId } });
                }
             }
           }
           if (lists && lists.length > 0) {
             for (const listId of lists) {
                const exists = await db.contactListMember.findUnique({ where: { contactId_listId: { contactId, listId } } });
                if (!exists) {
                   await db.contactListMember.create({ data: { contactId, listId } });
                }
             }
           }
           
           if (contact.customFields && contact.customFields.length > 0) {
             for (const cf of contact.customFields) {
               await db.crmCustomFieldValue.upsert({
                 where: { contactId_fieldId: { contactId, fieldId: cf.fieldId } },
                 update: { value: String(cf.value) },
                 create: { contactId, fieldId: cf.fieldId, value: String(cf.value) }
               });
             }
           }
        }

      } catch (err) {
        totalFailed++;
        errors.push({ row: index + 1, email: contact.email, error: err.message });
      }
    }

    res.json({
      success: true,
      summary: {
        totalProcessed: contacts.length,
        totalImported,
        totalUpdated,
        totalFailed,
      },
      errors
    });

  } catch (error) {
    console.error('Error in importContacts:', error);
    res.status(500).json({ error: error.message });
  }
};
