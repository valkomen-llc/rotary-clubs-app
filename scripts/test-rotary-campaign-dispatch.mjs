import dotenv from 'dotenv';
dotenv.config();

async function main() {
  console.log('🧪 Probando nuevos endpoints del Centro de Envíos e Historial de Rotary en Acción...');
  const mkt = await import('../server/controllers/rotaryMarketingController.js');

  const req = {
    protocol: 'https',
    get: () => 'rotary4281.org',
    user: { id: 'test-admin', role: 'club_admin' },
    params: { id: 'sem-01' },
    body: {}
  };

  // 1. Diagnóstico de Entregabilidad
  let diagData = null;
  const resDiag = {
    json: (d) => { diagData = d; },
    status: (code) => ({ json: (d) => { diagData = { code, ...d }; } })
  };
  await mkt.getDeliverabilityDiagnostics(req, resDiag);
  console.log('✅ 1. getDeliverabilityDiagnostics:');
  console.log('     - Provider:', diagData?.diagnostics?.provider?.name, `(status: ${diagData?.diagnostics?.provider?.status})`);
  console.log('     - Domain:', diagData?.diagnostics?.domain?.name, `(SPF: ${diagData?.diagnostics?.domain?.spfStatus})`);
  console.log('     - Mailboxes count:', diagData?.diagnostics?.mailboxes?.total);
  console.log('     - Queue pending:', diagData?.diagnostics?.queue?.scheduledPending);

  if (!diagData?.ok) throw new Error('getDeliverabilityDiagnostics falló');

  // 2. Historial de Campañas
  let historyData = null;
  const resHist = {
    json: (d) => { historyData = d; },
    status: (code) => ({ json: (d) => { historyData = { code, ...d }; } })
  };
  await mkt.getCampaignsHistory(req, resHist);
  console.log('✅ 2. getCampaignsHistory:');
  console.log('     - Campañas encontradas en historial:', historyData?.history?.length);
  if (historyData?.history?.length > 0) {
    const first = historyData.history[0];
    console.log('     - Campaña 1:', first.code, first.name, `[status: ${first.status}]`, `[remitente: ${first.fromEmail}]`);
  }
  if (!historyData?.ok) throw new Error('getCampaignsHistory falló');

  // 3. Detalle de Campaña e Historial por Destinatario
  let detailData = null;
  const resDetail = {
    json: (d) => { detailData = d; },
    status: (code) => ({ json: (d) => { detailData = { code, ...d }; } })
  };
  await mkt.getCampaignHistoryDetail(req, resDetail);
  console.log('✅ 3. getCampaignHistoryDetail:');
  console.log('     - Campaña:', detailData?.campaign?.name);
  console.log('     - Asunto:', detailData?.campaign?.subject);
  console.log('     - Total destinatarios vinculados:', detailData?.recipients?.length);

  if (!detailData?.ok) throw new Error('getCampaignHistoryDetail falló');

  console.log('🎉 TODOS LOS ENDPOINTS DEL CENTRO DE ENVÍOS FUNCIONAN CORRECTAMENTE!');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error en test:', err);
  process.exit(1);
});
