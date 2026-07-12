// Bloques de pago por defecto (espejo de src/lib/paymentBlocks.ts).
// Se usan como respaldo en el backend cuando el club aún no ha GUARDADO sus
// bloques (setting payment_blocks vacío) — p. ej. para resolver el monto de una
// membresía recurrente al crear la suscripción de Stripe.
export const DEFAULT_PAYMENT_BLOCKS = [
    {
        id: 'aporte-voluntario',
        kind: 'aporte',
        title: 'Aporte Voluntario',
        recurring: false,
        recurringIntervals: [],
    },
    {
        id: 'membresia-rotaria',
        kind: 'membership',
        title: 'Membresía Rotaria',
        recurring: true,
        recurringIntervals: [
            { key: 'month', amount: 120000 },
            { key: 'quarter', amount: 360000 },
            { key: 'semiannual', amount: 720000 },
            { key: 'year', amount: 1440000 },
        ],
    },
    {
        id: 'end-polio',
        kind: 'donation',
        title: 'Erradicación a la Polio',
        recurring: false,
        recurringIntervals: [],
    },
];
