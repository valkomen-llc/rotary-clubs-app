import createJiti from 'jiti';
import assert from 'node:assert';

const jiti = createJiti(import.meta.url);
const { generateEventReportPdf } = jiti('../src/lib/eventReportPdf.ts');
const { generateProjectFairReportPdf } = jiti('../src/lib/projectFairReportPdf.ts');

console.log('🧪 Iniciando pruebas de generación de reportes PDF...');

async function testEventReportPdf() {
    console.log('\n--- Test 1: generateEventReportPdf con dataset completo de la Feria ---');

    const sampleRegistrations = [
        {
            registrationCode: 'RPF12-MHBVE',
            firstName: 'Carolyn',
            lastName: 'Johnson',
            email: 'cfj2@mac.com',
            categoryLabel: 'Registro Internacional',
            country: 'Estados Unidos',
            clubName: 'Yarmouth - D. 7780',
            district: '7780',
            companionsCount: 1,
            baseCurrency: 'USD',
            baseAmount: 700,
            status: 'confirmed',
            createdAt: '2026-09-30T10:00:00Z',
        },
        {
            registrationCode: 'EV-8XEYC3',
            firstName: 'SANDY LEONOR',
            lastName: 'MERLANO CABALLERO',
            email: 'sandymerlano@yahoo.es',
            categoryLabel: 'Registro Nacional',
            country: 'Colombia',
            clubName: 'Montería Ronda del Sinú - D. 4271',
            district: '4271',
            companionsCount: 0,
            baseCurrency: 'COP',
            baseAmount: 400000,
            status: 'pending_payment',
            createdAt: '2026-09-15T14:30:00Z',
        },
        {
            registrationCode: 'RPF12-HGPL4',
            firstName: 'LEGI',
            lastName: 'PAZROSERO GONZALEZ',
            email: 'legipg@hotmail.com',
            categoryLabel: 'Registro Nacional',
            country: 'Colombia',
            clubName: 'Pasto Valle de Atriz - D. 4281',
            district: '4281',
            companionsCount: 0,
            baseCurrency: 'COP',
            baseAmount: 400000,
            status: 'confirmed',
            createdAt: '2026-08-31T09:15:00Z',
        },
        {
            registrationCode: 'RPF12-VG325',
            firstName: 'Alicia Maria',
            lastName: 'Rivas Soto',
            email: 'comercial@serimagenes.com',
            categoryLabel: 'CADRE',
            country: 'Colombia',
            clubName: 'Nuevo Medellín - D. 4271',
            district: '4271',
            companionsCount: 0,
            baseCurrency: 'USD',
            baseAmount: 130,
            status: 'confirmed',
            createdAt: '2026-08-31T11:20:00Z',
        },
        {
            registrationCode: 'RPF12-AGXAA',
            firstName: 'Sonia María',
            lastName: 'Gomez Erazo',
            email: 'soniagomeze@hotmail.com',
            categoryLabel: 'Registro Nacional',
            country: 'Colombia',
            clubName: 'Pasto Valle de Atriz - D. 4281',
            district: '4281',
            companionsCount: 0,
            baseCurrency: 'COP',
            baseAmount: 400000,
            status: 'confirmed',
            createdAt: '2026-08-18T16:00:00Z',
        },
        {
            registrationCode: 'EV-6FJ5F2',
            firstName: 'alfasfa',
            lastName: 'sadas,as',
            email: 'xc@hotmail.com',
            categoryLabel: 'Registro Internacional',
            country: 'Canadá',
            clubName: 'FNLANFSA - D. 6330',
            district: '6330',
            companionsCount: 0,
            baseCurrency: 'USD',
            baseAmount: 350,
            status: 'pending_payment',
            createdAt: '2026-08-13T18:45:00Z',
        },
    ];

    // Multiplicamos para validar paginación de tablas extensas
    for (let i = 1; i <= 35; i++) {
        sampleRegistrations.push({
            registrationCode: `EV-TEST${i}`,
            firstName: `Asistente ${i}`,
            lastName: `Apellido Rotario ${i}`,
            email: `rotario${i}@ejemplo.org`,
            categoryLabel: i % 2 === 0 ? 'Registro Nacional' : 'Registro Internacional',
            country: i % 3 === 0 ? 'Estados Unidos' : 'Colombia',
            clubName: `Club Rotario Distrito ${4271 + (i % 2)}`,
            district: `${4271 + (i % 2)}`,
            companionsCount: i % 4 === 0 ? 1 : 0,
            baseCurrency: i % 2 === 0 ? 'COP' : 'USD',
            baseAmount: i % 2 === 0 ? 400000 : 350,
            status: i % 2 === 0 ? 'confirmed' : 'pending_payment',
            createdAt: '2026-09-01T10:00:00Z',
        });
    }

    const input = {
        event: {
            title: 'XII Rotary Project Fair Colombia 2027',
            location: 'Sonesta Hotel Valledupar, Valledupar, Cesar, Colombia',
            startDate: '2027-01-28',
            endDate: '2027-01-30',
        },
        period: { from: '2026-08-01', to: '2026-10-07' },
        dashboard: {
            totals: {
                registrations: sampleRegistrations.length,
                companions: 10,
                people: sampleRegistrations.length + 10,
                settled: 22,
                pending: 19,
                failed: 0,
                refunded: 0,
                waitlist: 0,
                accredited: 5,
                countries: 3,
                districts: 4,
                clubs: 12,
                national: 28,
                international: 13,
            },
            byCurrency: [
                { currency: 'COP', base: 8800000, charged: 8800000, chargeCurrency: 'COP', total: 22 },
                { currency: 'USD', base: 4550, charged: 4550, chargeCurrency: 'USD', total: 13 },
            ],
            byCategory: [
                { categoryKey: 'nacional', categoryLabel: 'Registro Nacional', total: 25, people: 28, settled: 15, revenue: 6000000, currency: 'COP' },
                { categoryKey: 'internacional', categoryLabel: 'Registro Internacional', total: 12, people: 14, settled: 6, revenue: 2100, currency: 'USD' },
                { categoryKey: 'cadre', categoryLabel: 'CADRE', total: 4, people: 4, settled: 1, revenue: 130, currency: 'USD' },
            ],
            byCountry: [
                { country: 'Colombia', total: 28 },
                { country: 'Estados Unidos', total: 8 },
                { country: 'Canadá', total: 5 },
            ],
            byClub: [
                { clubName: 'E-Club Origen', total: 7 },
                { clubName: 'Pasto Valle de Atriz', total: 5 },
                { clubName: 'Montería Ronda del Sinú', total: 4 },
                { clubName: 'Yarmouth', total: 3 },
            ],
            timeline: [
                { day: '2026-08-13', total: 2, settled: 1 },
                { day: '2026-08-18', total: 4, settled: 3 },
                { day: '2026-08-31', total: 6, settled: 5 },
                { day: '2026-09-15', total: 8, settled: 4 },
                { day: '2026-09-30', total: 10, settled: 7 },
            ],
        },
        registrations: sampleRegistrations,
        generatedAt: '2026-10-07T16:45:00Z',
    };

    const res = await generateEventReportPdf(input, { returnBytes: true });
    assert(res && res.bytes, 'Debe devolver bytes del PDF');
    assert(res.bytes.byteLength > 5000, `Tamaño del PDF debe ser significativo (${res.bytes.byteLength} bytes)`);
    assert(res.pages >= 2, `El reporte debe tener al menos 2 páginas (obtenidas: ${res.pages})`);
    console.log(`✅ generateEventReportPdf exitoso: ${res.pages} páginas generadas, ${res.bytes.byteLength} bytes.`);
}

async function testEventReportPdfEmpty() {
    console.log('\n--- Test 2: generateEventReportPdf con 0 registros (filtros vacíos) ---');
    const input = {
        event: {
            title: 'XII Rotary Project Fair Colombia 2027',
            location: 'Valledupar',
        },
        dashboard: {
            totals: {
                registrations: 0,
                companions: 0,
                people: 0,
                settled: 0,
                pending: 0,
                countries: 0,
                clubs: 0,
            },
            byCurrency: [],
            byCategory: [],
            byCountry: [],
            byClub: [],
            timeline: [],
        },
        registrations: [],
    };
    const res = await generateEventReportPdf(input, { returnBytes: true });
    assert(res && res.bytes && res.pages >= 1, 'Debe generar PDF sin errores con datos vacíos');
    console.log(`✅ generateEventReportPdf vacío exitoso: ${res.pages} página(s), ${res.bytes.byteLength} bytes.`);
}

async function testProjectFairReportPdf() {
    console.log('\n--- Test 3: generateProjectFairReportPdf de Postulación de Proyectos ---');
    const input = {
        intelligence: {
            kpis: {
                total: 15,
                paid: 10,
                pending: 3,
                pendingReview: 2,
                conversionRate: 66.7,
                clubs: 8,
                districts: 3,
                countries: 2,
                priceMode: 'COP',
                totalCop: 7500000,
                totalUsd: 0,
                periodStart: '2026-07-01',
                periodEnd: '2026-10-07',
            },
            edition: { name: 'XII Rotary Project Fair Colombia 2027', venue: 'Valledupar' },
            branding: null,
            funnel: {},
            finance: {},
            alerts: [],
            breakdown: {},
        },
        submissions: [
            {
                publicRef: 'POST-001',
                projectName: 'Agua potable y saneamiento para comunidades indígenas de La Guajira',
                clubName: 'Club Rotario Valledupar',
                district: '4271',
                workflowStatus: 'approved',
                paymentStatus: 'paid',
                amountCop: 500000,
            },
            {
                publicRef: 'POST-002',
                projectName: 'Dotación de biblioteca comunitaria y tecnología educativa',
                clubName: 'Club Rotario Bogotá Centenario',
                district: '4281',
                workflowStatus: 'pending_payment',
                paymentStatus: 'pending_payment',
                amountCop: 500000,
            },
            {
                publicRef: 'POST-003',
                projectName: 'Capacitación en emprendimiento sostenible para jóvenes rurales',
                clubName: 'Club Rotario Medellín',
                district: '4271',
                workflowStatus: 'in_review',
                paymentStatus: 'paid',
                amountCop: 500000,
            },
        ],
        catalog: {
            workflowStates: [
                { key: 'approved', label: 'Aprobada' },
                { key: 'pending_payment', label: 'Pendiente de pago' },
                { key: 'in_review', label: 'En revisión' },
            ],
            paymentStates: [
                { key: 'paid', label: 'Pagado' },
                { key: 'pending_payment', label: 'Pendiente' },
            ],
        },
    };

    const res = await generateProjectFairReportPdf(input, { returnBytes: true });
    assert(res && res.bytes, 'Debe devolver bytes del PDF');
    assert(res.pages >= 2, `El reporte de postulaciones debe tener al menos 2 páginas (obtenidas: ${res.pages})`);
    console.log(`✅ generateProjectFairReportPdf exitoso: ${res.pages} páginas generadas, ${res.bytes.byteLength} bytes.`);
}

async function run() {
    await testEventReportPdf();
    await testEventReportPdfEmpty();
    await testProjectFairReportPdf();
    console.log('\n🎉 ¡TODAS LAS PRUEBAS DE PDF PASARON SATISFACTORIAMENTE!');
}

run().catch(err => {
    console.error('❌ Error en pruebas:', err);
    process.exit(1);
});
