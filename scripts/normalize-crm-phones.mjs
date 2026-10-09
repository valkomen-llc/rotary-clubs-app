import prisma from '../server/lib/prisma.js';
import { validatePhoneNumber } from '../server/lib/phone.js';

async function run() {
  console.log('--- Iniciando Auditoría y Normalización Segura de Contactos ---');
  
  // Obtenemos los contactos vinculados a la campaña de la Feria de Proyectos
  const logs = await prisma.whatsAppMessageLog.findMany({
    where: { campaignId: 'dac8a1d3-8449-4ec0-8f59-af44b8c8d763' },
    include: { contact: true }
  });

  const contactIds = [...new Set(logs.map(l => l.contactId).filter(Boolean))];
  console.log(`Analizando ${contactIds.length} contactos únicos de la campaña...`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const id of contactIds) {
    const contact = await prisma.crmContact.findUnique({ where: { id } });
    if (!contact) continue;

    const validation = validatePhoneNumber(contact.phone, contact.country);
    
    // Si es un número válido y necesita normalización
    if (validation.ok && validation.e164Formatted && validation.e164Formatted !== contact.phone) {
      let meta = {};
      try { meta = JSON.parse(contact.metadata || '{}'); } catch {}
      if (!meta.phoneHistory) meta.phoneHistory = [];
      meta.phoneHistory.push({
        previousPhone: contact.phone,
        previousCountry: contact.country,
        normalizedTo: validation.e164Formatted,
        normalizedAt: new Date().toISOString(),
        method: 'audit_normalization_v4',
      });

      try {
        await prisma.crmContact.update({
          where: { id: contact.id },
          data: {
            phone: validation.e164Formatted,
            country: validation.country || contact.country,
            metadata: JSON.stringify(meta),
          }
        });

        console.log(`✔ [${contact.name}] ${contact.phone} -> ${validation.e164Formatted} (${validation.country})`);
        updatedCount++;
      } catch (err) {
        if (err.code === 'P2002') {
          console.warn(`⚠ Colisión de duplicado: [${contact.name}] con teléfono ${validation.e164Formatted} ya existe en el club.`);
          // Buscar el contacto existente con ese número
          const existing = await prisma.crmContact.findFirst({
            where: { clubId: contact.clubId, phone: validation.e164Formatted }
          });
          if (existing) {
            console.log(`  -> Contacto existente: [${existing.name}] ID: ${existing.id}`);
            // Fusionar tags y membresías si son la misma persona
            const mergedTags = [...new Set([...(existing.tags || []), ...(contact.tags || [])])];
            await prisma.crmContact.update({
              where: { id: existing.id },
              data: { tags: mergedTags }
            });
            // Reasignar logs hacia el existente
            await prisma.whatsAppMessageLog.updateMany({
              where: { contactId: contact.id },
              data: { contactId: existing.id, phone: validation.e164Formatted }
            });
            // Eliminar el duplicado sobrante de forma limpia
            await prisma.crmContact.delete({ where: { id: contact.id } });
            console.log(`  -> Fusionado y deduplicado exitosamente hacia ${existing.id}`);
            updatedCount++;
          }
        } else {
          console.error(`Error en contacto ${contact.name}:`, err.message);
        }
      }
    } else {
      skippedCount++;
    }
  }

  console.log(`\nResumen de Normalización:`);
  console.log(`- Contactos actualizados con E.164: ${updatedCount}`);
  console.log(`- Contactos sin cambios requeridos: ${skippedCount}`);

  process.exit(0);
}

run().catch(err => {
  console.error('Error al normalizar contactos:', err);
  process.exit(1);
});
