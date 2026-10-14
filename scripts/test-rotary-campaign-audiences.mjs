// Prueba de verificación para Audiencias, Listas de Destinatarios y Validación de Campañas
// Rotary en Acción · Club Platform
import db from '../server/lib/db.js';
import { getAudienceLists, validateAudienceSelection, sendCampaignPersonalizedTest } from '../server/controllers/rotaryMarketingController.js';

console.log('🧪 Iniciando prueba de Audiencias y Validación de Destinatarios...');

async function run() {
  const mockReq = {
    user: { id: 'test-admin', role: 'superadmin' },
    query: { clubId: '8aa470c5-0a5a-4a8d-b872-38645b8b9f3a' },
    body: {},
    params: {},
    headers: {}
  };

  // 1. Probar getAudienceLists
  let listsResult = null;
  const res1 = {
    json: (data) => { listsResult = data; },
    status: (code) => ({ json: (d) => { console.error('Error', code, d); } })
  };

  await getAudienceLists(mockReq, res1);
  if (!listsResult?.ok || !Array.isArray(listsResult.lists)) {
    throw new Error('Fallo en getAudienceLists');
  }
  console.log(`✅ 1. getAudienceLists: ${listsResult.lists.length} listas encontradas para el sitio.`);

  // 2. Probar validateAudienceSelection con listas reales
  const availableWithMembers = listsResult.lists.filter(l => l.totalMembers > 0);
  const sampleListIds = availableWithMembers.slice(0, 2).map(l => l.id);
  
  let valResult = null;
  const res2 = {
    json: (data) => { valResult = data; },
    status: (code) => ({ json: (d) => { console.error('Error', code, d); } })
  };

  await validateAudienceSelection({
    ...mockReq,
    body: { listIds: sampleListIds }
  }, res2);

  if (!valResult?.ok || typeof valResult.stats?.eligibleRecipients !== 'number') {
    throw new Error('Fallo en validateAudienceSelection');
  }

  console.log(`✅ 2. validateAudienceSelection:
     - Listas evaluadas: ${sampleListIds.length}
     - Total miembros brutos: ${valResult.stats.totalRaw}
     - Válidos con correo: ${valResult.stats.validContacts}
     - Duplicados deduplicados: ${valResult.stats.duplicatesCount}
     - Sin correo: ${valResult.stats.missingEmailCount}
     - Bajas / Opt-out: ${valResult.stats.optedOutCount}
     - Destinatarios elegibles: ${valResult.stats.eligibleRecipients}`);

  // 3. Probar validación con lista vacía
  let emptyVal = null;
  await validateAudienceSelection({ ...mockReq, body: { listIds: [] } }, {
    json: (d) => { emptyVal = d; },
    status: () => ({ json: () => {} })
  });
  if (emptyVal?.stats?.eligibleRecipients !== 0) {
    throw new Error('Fallo en validateAudienceSelection con listas vacías');
  }
  console.log('✅ 3. Validación con lista vacía retorna 0 destinatarios correctamente.');

  console.log('🎉 TODOS LOS TESTS DE AUDIENCIAS Y DESTINATARIOS PASARON CON ÉXITO!');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Error en tests:', err);
  process.exit(1);
});
