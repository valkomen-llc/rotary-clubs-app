import db from '../../lib/prisma.js';
import { resolveClubId } from '../crmController.js';
import { validatePhoneNumber, sanitizeRawPhone } from '../../lib/phone.js';

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
    let totalExisting = 0; // ya existían (se enlazaron a la lista, sin actualizar datos)
    let listsCreated = 0;  // listas creadas al vuelo por la columna "Lista/Grupo"
    let errors = [];

    // Resolución de listas por NOMBRE (columna "Lista/Grupo" del importador). Permite
    // que un solo archivo cree y reparta contactos en múltiples listas a la vez.
    // Cache por request para no crear duplicados ni repetir consultas. La comparación es
    // case-insensitive: si ya existe una lista con ese nombre se reutiliza (NUNCA se
    // borra/recrea nada — solo creación aditiva).
    const listNameCache = new Map(); // nombreLower -> listId
    const resolveListIdByName = async (rawName) => {
      const name = String(rawName || '').trim();
      if (!name) return null;
      const key = name.toLowerCase();
      if (listNameCache.has(key)) return listNameCache.get(key);
      let list = await db.crmList.findFirst({
        where: { clubId, name: { equals: name, mode: 'insensitive' } },
        select: { id: true },
      });
      if (!list) {
        list = await db.crmList.create({ data: { clubId, name }, select: { id: true } });
        listsCreated++;
      }
      listNameCache.set(key, list.id);
      return list.id;
    };

    // Para evitar consultas N+1 en exceso, procesaremos iterativamente
    for (const [index, contact] of contacts.entries()) {
      try {
        if (!contact.email && !contact.phone) {
          throw new Error('El contacto debe tener al menos un Email o Teléfono válido.');
        }

        // Normalización internacional E.164
        let finalPhone = contact.phone ? sanitizeRawPhone(contact.phone) : null;
        let finalCountry = contact.country || null;

        if (contact.countryCode && finalPhone && !finalPhone.startsWith('+')) {
          const ccClean = String(contact.countryCode).replace(/[^0-9]/g, '');
          const phoneDigits = finalPhone.replace(/[^0-9]/g, '');
          if (ccClean && !phoneDigits.startsWith(ccClean)) {
            finalPhone = `+${ccClean}${phoneDigits}`;
          }
        }

        if (finalPhone) {
          const norm = validatePhoneNumber(finalPhone, contact.countryCode || contact.country);
          if (norm.ok) {
            finalPhone = norm.e164Formatted;
            if (!finalCountry && norm.country) {
              finalCountry = norm.country;
            }
          }
        }

        // Criterio de unicidad: PRIORIDAD al teléfono (identidad en WhatsApp).
        // Se busca por formato E.164, sin +, o con + para tolerar variaciones previas.
        let existingContact = null;
        if (finalPhone) {
           const rawDigits = finalPhone.replace(/[^0-9]/g, '');
           existingContact = await db.crmContact.findFirst({
             where: {
               clubId,
               OR: [
                 { phone: finalPhone },
                 { phone: rawDigits },
                 { phone: `+${rawDigits}` }
               ]
             }
           });
        }
        if (!existingContact && contact.email) {
           existingContact = await db.crmContact.findFirst({ where: { clubId, email: contact.email } });
        }

        const data = {
          clubId,
          prefix: contact.prefix || null,
          name: contact.name || 'Sin nombre',
          lastName: contact.lastName || null,
          email: contact.email || null,
          phone: finalPhone || null,
          title: contact.title || null,
          company: contact.company || null,
          city: contact.city || null,
          country: finalCountry || null,
          address: contact.address || null,
          website: contact.website || null,
          status: contact.status || status,
          source: 'import',
        };

        let contactId;

        if (existingContact) {
          contactId = existingContact.id;
          if (onDuplicate === 'update') {
             await db.crmContact.update({ where: { id: existingContact.id }, data });
             totalUpdated++;
          } else {
             totalExisting++;
          }
        } else {
          // Crear nuevo
          const created = await db.crmContact.create({ data });
          contactId = created.id;
          totalImported++;
        }

        // Si tenemos un contactId válido (creado o actualizado), asociamos listas, etiquetas y campos personalizados
        if (contactId) {
           // Etiquetas: se almacenan como String[] en el contacto (el id de la etiqueta === su nombre)
           if (tags && tags.length > 0) {
             const current = await db.crmContact.findUnique({ where: { id: contactId }, select: { tags: true } });
             const merged = Array.from(new Set([...(current?.tags || []), ...tags]));
             await db.crmContact.update({ where: { id: contactId }, data: { tags: merged } });
           }

           // Listas destino = las seleccionadas globalmente en el asistente (aplican a
           // todas las filas) + la de la columna "Lista/Grupo" de ESTA fila (se crea si
           // no existe). Se deduplican para no intentar el mismo enlace dos veces.
           const targetListIds = new Set(Array.isArray(lists) ? lists : []);
           if (contact.listName) {
             const rowListId = await resolveListIdByName(contact.listName);
             if (rowListId) targetListIds.add(rowListId);
           }

           for (const listId of targetListIds) {
              const exists = await db.contactListMember.findFirst({ where: { contactId, listId } });
              if (!exists) {
                 await db.contactListMember.create({ data: { contactId, listId } });
              }
           }

           // Campos personalizados mapeados en el asistente de importación
           if (contact.customFields && contact.customFields.length > 0) {
             for (const cf of contact.customFields) {
               if (!cf.fieldId || cf.value === undefined || cf.value === null || cf.value === '') continue;
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
        totalExisting,
        totalFailed,
        listsCreated,
      },
      errors
    });

  } catch (error) {
    console.error('Error in importContacts:', error);
    res.status(500).json({ error: error.message });
  }
};
