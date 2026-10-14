import dotenv from 'dotenv';
dotenv.config();

async function runTest() {
  console.log('🧪 PROBANDO NUEVO ENVÍO Y NO-DUPLICACIÓN');

  const { default: db } = await import('../server/lib/db.js');
  const {
    reconcileRotaryExecutions,
    getCampaignsHistory
  } = await import('../server/controllers/rotaryMarketingController.js');

  const clubId = '8aa470c5-0a5a-4a8d-b872-38645b8b9f3a';

  // 1. Simular nuevo despacho controlado
  const testExecId = `exec_test_verificacion_${Date.now()}`;
  console.log('Insertando ejecución de prueba controlada:', testExecId);

  await db.query(`
    INSERT INTO "RotaryCampaignExecution" (
      id, "campaignId", "campaignCode", "campaignName", week, stage,
      subject, preheader, "emailCampaignId", "clubId", mode, status,
      "totalRecipients", "sentCount", "failedCount", "openCount", "clickCount",
      "senderName", "fromEmail", "replyToEmail", "sentAt", "executedAt", "createdAt"
    ) VALUES (
      $1, 'rmk-sem-01', 'sem-01',
      'Tu club transforma comunidades (Envío Controlado de Validación)',
      1, 'Semana 1 · Captación',
      '🚀 Prueba de verificación de persistencia automática',
      'Preheader de prueba',
      null, $2, 'manual', 'sent',
      1, 1, 0, 0, 0,
      'Comunicaciones | Distrito 4281', 'comunicaciones@rotary4281.org', 'comunicaciones@rotary4281.org',
      NOW(), NOW(), NOW()
    )
  `, [testExecId, clubId]);

  // 2. Comprobar que aparece en getCampaignsHistory inmediatamente
  let resData = null;
  const mockReq = {
    headers: { 'x-club-id': clubId },
    user: { role: 'administrator', clubId }
  };
  const mockRes = {
    json: (d) => { resData = d; return mockRes; },
    status: () => mockRes
  };

  await getCampaignsHistory(mockReq, mockRes);
  console.log('Total campañas en historial con nuevo envío:', resData.campaigns?.length);
  const found = resData.campaigns?.some(c => c.id === testExecId);
  if (!found) throw new Error('El nuevo envío no apareció inmediatamente en el historial');
  console.log('✅ Nuevo envío detectado automáticamente en el historial');

  // 3. Probar idempotencia y reconciliación múltiple (no duplicación)
  await reconcileRotaryExecutions(clubId);
  await getCampaignsHistory(mockReq, mockRes);
  const occurrences = resData.campaigns?.filter(c => c.id === testExecId).length;
  if (occurrences !== 1) throw new Error(`Duplicación detectada: ${occurrences} registros`);
  console.log('✅ Idempotencia validada: cero duplicados');

  // 4. Limpiar registro de prueba
  await db.query(`DELETE FROM "RotaryCampaignExecution" WHERE id = $1`, [testExecId]);
  console.log('✅ Registro de prueba limpiado correctamente');

  process.exit(0);
}

runTest().catch(e => { console.error('Error:', e); process.exit(1); });
