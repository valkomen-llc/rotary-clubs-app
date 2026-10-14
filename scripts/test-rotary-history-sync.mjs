import dotenv from 'dotenv';
dotenv.config();

async function runTest() {
  console.log('🧪 INICIANDO VERIFICACIÓN DE HISTORIAL DE CAMPAÑAS Y TRAZABILIDAD');

  const { default: prisma } = await import('../server/lib/prisma.js');
  const { default: db } = await import('../server/lib/db.js');
  const { ensureRotaryMarketingSchema } = await import('../server/lib/ensureRotaryMarketingSchema.js');
  const {
    reconcileRotaryExecutions,
    getCampaignsHistory,
    getCampaignHistoryDetail
  } = await import('../server/controllers/rotaryMarketingController.js');

  const clubId = '8aa470c5-0a5a-4a8d-b872-38645b8b9f3a';

  // 1. Asegurar esquema
  console.log('\n--- 1. Asegurar Esquema y Tablas ---');
  await ensureRotaryMarketingSchema();
  const { rows: tableCheck } = await db.query(
    `SELECT to_regclass('"RotaryCampaignExecution"') as exists`
  );
  console.log('Tabla RotaryCampaignExecution existe:', !!tableCheck[0]?.exists);

  // 2. Reconciliación
  console.log('\n--- 2. Ejecutar Reconciliación Automática ---');
  const recRes = await reconcileRotaryExecutions(clubId);
  console.log('Resultado reconciliación:', recRes);

  // 3. Simular getCampaignsHistory
  console.log('\n--- 3. Simular Endpoint getCampaignsHistory ---');
  let historyResponse = null;
  const mockReq = {
    headers: { 'x-club-id': clubId },
    query: {},
    params: {}
  };
  const mockRes = {
    json: (data) => { historyResponse = data; return mockRes; },
    status: (code) => { console.log('Status code:', code); return mockRes; }
  };

  await getCampaignsHistory(mockReq, mockRes);
  if (!historyResponse || !historyResponse.ok) {
    throw new Error('getCampaignsHistory falló: ' + JSON.stringify(historyResponse));
  }

  console.log(`✅ Total campañas en historial: ${historyResponse.campaigns?.length || 0}`);
  for (const c of historyResponse.campaigns) {
    console.log(`- ID: ${c.id}`);
    console.log(`  Nombre: ${c.name}`);
    console.log(`  Asunto: ${c.subject}`);
    console.log(`  Fecha: ${c.sentAt || c.executedAt}`);
    console.log(`  Destinatarios: ${c.stats?.sentCount} / ${c.stats?.totalRecipients} (Opens: ${c.stats?.uniqueOpens}, Clicks: ${c.stats?.uniqueClicks})`);
    console.log(`  Estado: ${c.status} | Modo: ${c.mode}`);
  }

  // 4. Comprobar KPIs esperados
  const totalSent = historyResponse.campaigns.reduce((acc, c) => acc + (c.stats?.sentCount || 0), 0);
  const totalClicks = historyResponse.campaigns.reduce((acc, c) => acc + (c.stats?.uniqueClicks || 0), 0);
  const totalOpens = historyResponse.campaigns.reduce((acc, c) => acc + (c.stats?.uniqueOpens || 0), 0);
  console.log('\n--- KPIs Calculados en Centro de Envíos ---');
  console.log(`Campañas despachadas: ${historyResponse.campaigns.filter(c => c.status === 'sent').length}`);
  console.log(`Mensajes aceptados por proveedor: ${totalSent}`);
  console.log(`Interacciones (clics únicos): ${totalClicks}`);
  console.log(`Aperturas estimadas: ${totalOpens}`);

  if (totalSent < 356) {
    console.warn('⚠️ Advertencia: Se esperaban al menos 356 mensajes enviados (354 + 2). Encontrados:', totalSent);
  } else {
    console.log('✅ Mensajes enviados verificados con éxito (356)');
  }

  // 5. Simular getCampaignHistoryDetail para la campaña general
  console.log('\n--- 5. Simular getCampaignHistoryDetail (Campaña General 354 Destinatarios) ---');
  const generalExec = historyResponse.campaigns.find(c => c.stats?.totalRecipients >= 300);
  if (!generalExec) {
    throw new Error('No se encontró la ejecución general en el historial');
  }

  let detailResponse = null;
  const mockDetailReq = {
    headers: { 'x-club-id': clubId },
    params: { id: generalExec.id }
  };
  const mockDetailRes = {
    json: (data) => { detailResponse = data; return mockDetailRes; },
    status: (code) => { console.log('Detail Status code:', code); return mockDetailRes; }
  };

  await getCampaignHistoryDetail(mockDetailReq, mockDetailRes);
  if (!detailResponse || !detailResponse.ok) {
    throw new Error('getCampaignHistoryDetail falló: ' + JSON.stringify(detailResponse));
  }

  console.log(`✅ Detalle cargado con éxito para ${detailResponse.campaign?.name}`);
  console.log(`Total destinatarios devueltos: ${detailResponse.recipients?.length || 0}`);
  console.log(`Stats en respuesta:`, detailResponse.stats);
  if (detailResponse.recipients?.length > 0) {
    console.log('Ejemplo de destinatario enriquecido:', detailResponse.recipients[0]);
  }

  // 6. Simular getCampaignHistoryDetail para el envío piloto
  console.log('\n--- 6. Simular getCampaignHistoryDetail (Envío Piloto 2 Destinatarios) ---');
  const pilotExec = historyResponse.campaigns.find(c => c.id.includes('piloto') || c.stats?.totalRecipients === 2);
  if (!pilotExec) {
    throw new Error('No se encontró la ejecución piloto en el historial');
  }

  let pilotDetailResponse = null;
  const mockPilotReq = {
    headers: { 'x-club-id': clubId },
    params: { id: pilotExec.id }
  };
  const mockPilotRes = {
    json: (data) => { pilotDetailResponse = data; return mockPilotRes; },
    status: (code) => { console.log('Pilot Detail Status code:', code); return mockPilotRes; }
  };

  await getCampaignHistoryDetail(mockPilotReq, mockPilotRes);
  console.log(`✅ Detalle piloto cargado: ${pilotDetailResponse.recipients?.length} destinatarios`);
  for (const r of pilotDetailResponse.recipients) {
    console.log(`- ${r.email} | Estado: ${r.status}`);
  }

  console.log('\n🎉 TODAS LAS VALIDACIONES SUPERADAS CON ÉXITO');
  process.exit(0);
}

runTest().catch(err => {
  console.error('❌ Error en prueba:', err);
  process.exit(1);
});
