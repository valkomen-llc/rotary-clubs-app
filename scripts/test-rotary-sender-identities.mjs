#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import db from '../server/lib/db.js';
import prisma from '../server/lib/prisma.js';
import {
  getSenderIdentities,
  getAvailableSenderAccounts,
  createSenderIdentity,
  updateSenderIdentity,
  setDefaultSenderIdentity,
  assignCampaignSender
} from '../server/controllers/rotaryMarketingController.js';

console.log('🧪 Iniciando prueba de remitentes institucionales para Rotary en Acción...');

const mockReq = (overrides = {}) => ({
  user: { role: 'administrator', clubId: '8aa470c5-0a5a-4a8d-b872-38645b8b9f3a' },
  headers: {},
  query: {},
  params: {},
  body: {},
  ...overrides
});

const mockRes = () => {
  const res = {
    statusCode: 200,
    headers: {},
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(k, v) {
      this.headers[k] = v;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    }
  };
  return res;
};

async function runTests() {
  const clubId = '8aa470c5-0a5a-4a8d-b872-38645b8b9f3a'; // Distrito 4281

  // 1. Cuentas disponibles del sitio
  const reqAcc = mockReq();
  const resAcc = mockRes();
  await getAvailableSenderAccounts(reqAcc, resAcc);
  assert.equal(resAcc.statusCode, 200, 'getAvailableSenderAccounts debe responder 200');
  assert.ok(Array.isArray(resAcc.data?.accounts), 'accounts debe ser un array');
  console.log(`✅ 1. getAvailableSenderAccounts: ${resAcc.data.accounts.length} cuentas institucionales encontradas para el sitio.`);

  // 2. Identidades existentes o auto-generadas
  const reqId = mockReq();
  const resId = mockRes();
  await getSenderIdentities(reqId, resId);
  assert.equal(resId.statusCode, 200, 'getSenderIdentities debe responder 200');
  assert.ok(Array.isArray(resId.data?.identities), 'identities debe ser un array');
  console.log(`✅ 2. getSenderIdentities: ${resId.data.identities.length} identidades cargadas.`);

  // 3. Crear una nueva identidad institucional
  const availableEmail = resAcc.data.accounts[0]?.email || 'comunicaciones@rotary4281.org';
  const reqCreate = mockReq({
    body: {
      name: 'Comité de Imagen Pública Test',
      fromName: 'Imagen Pública | Rotary D4281 Test',
      fromEmail: availableEmail,
      replyToEmail: availableEmail,
      isDefault: false
    }
  });
  const resCreate = mockRes();
  await createSenderIdentity(reqCreate, resCreate);
  assert.equal(resCreate.statusCode, 201, 'createSenderIdentity debe responder 201');
  const createdId = resCreate.data?.identity?.id;
  assert.ok(createdId, 'Debe devolver un id para la identidad creada');
  console.log(`✅ 3. createSenderIdentity: Identidad creada exitosamente con id: ${createdId}`);

  // 4. Asignar a una campaña
  const reqAssign = mockReq({
    params: { id: 'sem-01' },
    body: { senderIdentityId: createdId }
  });
  const resAssign = mockRes();
  await assignCampaignSender(reqAssign, resAssign);
  assert.equal(resAssign.statusCode, 200, 'assignCampaignSender debe responder 200');
  assert.equal(resAssign.data?.campaign?.senderIdentityId, createdId, 'La campaña debe tener la identidad asignada');
  console.log(`✅ 4. assignCampaignSender: Campaña sem-01 asignada a la identidad ${createdId}`);

  // Limpiar identidad de prueba creada
  await db.query(`DELETE FROM "RotarySenderIdentity" WHERE id = $1`, [createdId]);
  await db.query(`UPDATE "RotaryMarketingCampaign" SET "senderIdentityId"=NULL, "senderName"=NULL, "fromEmail"=NULL, "replyToEmail"=NULL WHERE code='sem-01'`);
  console.log('✅ 5. Limpieza de datos de prueba completada.');

  console.log('🎉 TODOS LOS TESTS DE REMITENTES INSTITUCIONALES PASARON CON ÉXITO!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Error en test:', err);
  process.exit(1);
});
