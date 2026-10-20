// scripts/reconcile-clara-hernandez.mjs
// Conciliación financiera e histórica para la postulación de Clara Hernández (Nuevo Medellín, Distrito 4271)
import 'dotenv/config';
import pg from 'pg';
import crypto from 'crypto';

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    console.log('🔄 Iniciando conciliación de Clara Hernández...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const oldId = 'cbb2cabd-5a7d-42fc-aef7-e923f8d84d62'; // FP-U9CKYB (chernandez@gmail.com, con pago y formularios)
        const targetId = '01b69cee-5910-44b5-a370-1634307f0a80'; // FP-W2MP36 (chernandez4914@gmail.com, postulación activa)

        // 1. Verificar registros
        const oldSub = (await client.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 FOR UPDATE', [oldId])).rows[0];
        const targetSub = (await client.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 FOR UPDATE', [targetId])).rows[0];

        if (!oldSub || !targetSub) {
            throw new Error(`No se encontraron ambas postulaciones: old=${!!oldSub}, target=${!!targetSub}`);
        }

        console.log(`Encontradas postulaciones:`);
        console.log(`- Anterior con pago: ${oldSub.publicRef} (${oldSub.email}) - Estado: ${oldSub.status}`);
        console.log(`- Activa a conciliar: ${targetSub.publicRef} (${targetSub.email}) - Estado: ${targetSub.status}`);

        // 2. Transferir datos financieros verificados a targetSub
        await client.query(`
            UPDATE "ProjectFairSubmission"
            SET status = 'paid',
                "workflowStatus" = 'payment_confirmed',
                "stripeSessionId" = $1,
                "stripePaymentIntentId" = $2,
                "stripeChargeId" = $3,
                "amountCop" = $4,
                "amountUsd" = $5,
                "amountReceived" = $6,
                "chargeCurrency" = $7,
                "paidAt" = $8,
                "receiptUrl" = $9,
                "paymentConfirmationOrigin" = 'stripe',
                "lastSyncAt" = NOW(),
                "lastPaymentError" = NULL,
                "updatedAt" = NOW()
            WHERE id = $10
        `, [
            oldSub.stripeSessionId,
            oldSub.stripePaymentIntentId,
            oldSub.stripeChargeId,
            oldSub.amountCop,
            oldSub.amountUsd,
            oldSub.amountReceived,
            oldSub.chargeCurrency || 'USD',
            oldSub.paidAt,
            oldSub.receiptUrl,
            targetId
        ]);
        console.log(`✅ Postulación ${targetSub.publicRef} actualizada a 'paid' con Stripe Session y datos financieros.`);

        // 3. Migrar formularios existentes preservando 100% de las respuestas
        const moveMaster = await client.query(`
            UPDATE "ProjectFairMasterForm"
            SET "submissionId" = $1,
                "updatedAt" = NOW()
            WHERE "submissionId" = $2
        `, [targetId, oldId]);
        console.log(`✅ ProjectFairMasterForm transferido a ${targetSub.publicRef} (filas: ${moveMaster.rowCount}).`);

        const moveProject = await client.query(`
            UPDATE "ProjectFairProjectForm"
            SET "submissionId" = $1,
                "updatedAt" = NOW()
            WHERE "submissionId" = $2
        `, [targetId, oldId]);
        console.log(`✅ ProjectFairProjectForm transferido a ${targetSub.publicRef} (filas: ${moveProject.rowCount}).`);

        // 4. Actualizar rol de la cuenta activa a 'project_manager'
        const updateAccount = await client.query(`
            UPDATE "ProjectFairAccount"
            SET role = 'project_manager',
                "roleGrantedAt" = NOW(),
                "updatedAt" = NOW()
            WHERE email = $1
        `, ['chernandez4914@gmail.com']);
        console.log(`✅ Cuenta chernandez4914@gmail.com promovida a 'project_manager' (filas: ${updateAccount.rowCount}).`);

        // 5. Archivar ordenadamente la postulación duplicada antigua
        await client.query(`
            UPDATE "ProjectFairSubmission"
            SET "archivedAt" = NOW(),
                "archivedBy" = 'sistema-conciliacion',
                "archivedReason" = $1,
                "updatedAt" = NOW()
            WHERE id = $2
        `, [
            `Consolidada con ${targetSub.publicRef} tras corrección del correo de contacto (${oldSub.email} -> ${targetSub.email}) y vinculación de pago y formularios completados.`,
            oldId
        ]);
        console.log(`✅ Postulación anterior ${oldSub.publicRef} archivada como consolidada.`);

        // 6. Registrar eventos de auditoría inmutables en ProjectFairEvent
        const eventId1 = crypto.randomUUID();
        await client.query(`
            INSERT INTO "ProjectFairEvent" (
                id, "submissionId", type, title, detail, "actorId", "actorName", "actorRole", metadata, "createdAt"
            ) VALUES (
                $1, $2, 'payment_reconciliation', 'Conciliación financiera de pago Stripe',
                $3, 'system', 'Sistema de Conciliación', 'system', $4, NOW()
            )
        `, [
            eventId1,
            targetId,
            `Pago confirmado por Stripe ($${oldSub.amountCop} COP / $${oldSub.amountReceived} ${oldSub.chargeCurrency || 'USD'}). Vinculado desde sesión Stripe ${oldSub.stripeSessionId} registrada previamente bajo correo alterno ${oldSub.email}. Formularios migrados exitosamente.`,
            JSON.stringify({
                origin: 'stripe_reconciliation',
                stripeSessionId: oldSub.stripeSessionId,
                stripePaymentIntentId: oldSub.stripePaymentIntentId,
                stripeChargeId: oldSub.stripeChargeId,
                receiptUrl: oldSub.receiptUrl,
                amountCop: oldSub.amountCop,
                amountReceived: oldSub.amountReceived,
                previousEmail: oldSub.email,
                targetEmail: targetSub.email,
                consolidatedFrom: oldSub.publicRef,
            })
        ]);

        const eventId2 = crypto.randomUUID();
        await client.query(`
            INSERT INTO "ProjectFairEvent" (
                id, "submissionId", type, title, detail, "actorId", "actorName", "actorRole", metadata, "createdAt"
            ) VALUES (
                $1, $2, 'submission_consolidated', 'Postulación consolidada y archivada',
                $3, 'system', 'Sistema de Conciliación', 'system', $4, NOW()
            )
        `, [
            eventId2,
            oldId,
            `Postulación consolidada en ${targetSub.publicRef} (${targetSub.email}). Pago y formularios completados fueron transferidos a la postulación activa.`,
            JSON.stringify({
                consolidatedInto: targetSub.publicRef,
                targetId: targetId
            })
        ]);
        console.log(`✅ Eventos de auditoría registrados en ProjectFairEvent.`);

        await client.query('COMMIT');
        console.log('🎉 Conciliación finalizada y confirmada exitosamente (COMMIT).');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error durante la conciliación, se ejecutó ROLLBACK:', err);
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch(err => {
    console.error('Error fatal:', err);
    process.exit(1);
});
