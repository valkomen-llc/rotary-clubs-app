#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// FDD y FAP en el listado de proyectos postulados.  npm run test:fair:fdd-columns
// v4.1304.0
//
// 1–4 sin base y sin red: que los valores salgan de los campos REALES de la
// Solicitud de Aportes del FDD (sin campo nuevo ni escritura), que el
// listado, el orden, los rangos y las exportaciones usen la MISMA lectura, y
// que la tabla los muestre en el orden pedido.
//
// 5 contra Postgres DE VERDAD, si se le da una base desechable:
//   FDD_TEST_DATABASE_URL=postgres://postgres@localhost:55432/postgres npm run test:fair:fdd-columns
// Crea dos tablas mínimas en un esquema temporal, ejecuta las MISMAS
// expresiones SQL del servidor y lo borra al terminar. Sin la variable se
// omite y lo dice.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    FDD_LIST_FIELDS, SQL_FDD_COLUMNS, FDD_SORTABLE, FDD_RANGE_FILTERS,
    sqlAmount, sqlUsdAmount, rangeBound, amountReading, fddAmountsOf,
} from '../server/lib/projectFairFddAmounts.js';
import { DEFAULT_FDD_FORM, FDD_FORM_KEY } from '../server/lib/projectFairFddForm.js';
import { storageOf } from '../server/lib/projectFormsRegistry.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); } };
const leer = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

console.log('\n1. Los campos son los REALES del formulario, no unos nuevos');
const seccion = DEFAULT_FDD_FORM.sections.find(s => s.key === 'fdd');
const campo = (k) => seccion?.fields?.find(f => f.key === k);
ok('el paso «Solicitud del FDD» existe con la clave «fdd»', seccion?.title === 'Solicitud del FDD');
ok('FDD = answers.fdd.requestedUsd «Cantidad solicitada al Distrito del FDD 2026-2027 (US$)»',
    FDD_LIST_FIELDS.fdd.section === 'fdd' && FDD_LIST_FIELDS.fdd.field === 'requestedUsd'
    && /Cantidad solicitada al Distrito del FDD 2026-2027/.test(campo('requestedUsd')?.label || ''));
ok('FAP = answers.fdd.fapGoalUsd «Meta de aportes al FAP 2026-2027 (US$)»',
    FDD_LIST_FIELDS.fap.section === 'fdd' && FDD_LIST_FIELDS.fap.field === 'fapGoalUsd'
    && /Meta de aportes al FAP 2026-2027/.test(campo('fapGoalUsd')?.label || ''));
ok('los dos son de tipo moneda en el formulario', campo('requestedUsd')?.type === 'currency' && campo('fapGoalUsd')?.type === 'currency');
ok('se leen de la tabla donde el formulario FDD guarda sus respuestas', storageOf(FDD_FORM_KEY) === 'ProjectFairProjectForm'
    && SQL_FDD_COLUMNS.includes('FROM "ProjectFairProjectForm" ff') && SQL_FDD_COLUMNS.includes(`ff."formKey" = '${FDD_FORM_KEY}'`));
ok('cada fila lee SÓLO el formulario de su proyecto (por su id, no por club ni inscripción)',
    SQL_FDD_COLUMNS.includes('ff."submissionId" = "ProjectFairSubmission".id') && !/registrationId|clubName|email/.test(SQL_FDD_COLUMNS));
const lib = leer('server/lib/projectFairFddAmounts.js');
ok('la lectura no escribe nada', !/\b(INSERT|UPDATE|DELETE|ALTER|CREATE)\b/.test(lib.replace(/^\s*\/\/.*$/gm, '')));
ok('sin comillas invertidas dentro del SQL', !SQL_FDD_COLUMNS.includes('`') && !sqlUsdAmount('x').includes('`'));
ok('el formulario del club no se tocó (los campos siguen obligatorios)', campo('requestedUsd')?.required === true && campo('fapGoalUsd')?.required === true);

console.log('\n2. Criterio puro');
ok('vacío → «empty»', amountReading('', null) === 'empty' && amountReading(null, null) === 'empty' && amountReading('   ', null) === 'empty');
ok('«0» → «ok» (un cero explícito no es vacío)', amountReading('0', 0) === 'ok');
ok('«5000» y «5000.50» → «ok»', amountReading('5000', 5000) === 'ok' && amountReading('5000.50', 5000.5) === 'ok');
ok('«5.000» leído como 5000 → «normalized»', amountReading('5.000', 5000) === 'normalized');
ok('«abc» sin valor → «unreadable»', amountReading('abc', null) === 'unreadable');
const leido = fddAmountsOf({ fddRequestedRaw: '5.000', fddRequestedUsd: '5000', fapGoalRaw: '', fapGoalUsd: null });
ok('fddAmountsOf: número, lectura y texto original sólo si no es el canónico',
    leido.fddRequestedUsd === 5000 && leido.fddRequestedReading === 'normalized' && leido.fddRequestedRaw === '5.000'
    && leido.fapGoalUsd === null && leido.fapGoalReading === 'empty' && !('fapGoalRaw' in leido));
ok('fddAmountsOf no agrega nada a filas de otras consultas', Object.keys(fddAmountsOf({ id: 'x' })).length === 0);
ok('rango: número ≥ 0 o nada', rangeBound('100') === 100 && rangeBound('') === null && rangeBound('-5') === null && rangeBound('1e9') === null && rangeBound('12.5') === 12.5);

console.log('\n3. Servidor: una sola lectura para listar, ordenar, filtrar y exportar');
const admin = leer('server/controllers/projectFairAdminController.js');
ok('el listado agrega las columnas a cada fila', /SELECT \*, \$\{SQL_FDD_COLUMNS\} FROM "ProjectFairSubmission" \$\{clause\}\s*\n\s*ORDER BY \$\{sortBy\} \$\{sortDir\} NULLS LAST, id ASC/.test(admin));
ok('el orden es numérico (alias de la columna calculada)', /\.\.\.FDD_SORTABLE/.test(admin)
    && FDD_SORTABLE.fddRequestedUsd === '"fddRequestedUsd"' && FDD_SORTABLE.fapGoalUsd === '"fapGoalUsd"');
ok('los rangos viven en buildFilters (alcanzan listado, CSV e inteligencia)',
    /for \(const r of FDD_RANGE_FILTERS\)[\s\S]{0,200}sqlAmount\(r\.key\)\} \$\{r\.op\} \$\?::numeric/.test(admin)
    && FDD_RANGE_FILTERS.map(r => r.param).join() === 'fddMin,fddMax,fapMin,fapMax');
ok('mapRow entrega los valores', /\.\.\.fddAmountsOf\(row\)/.test(admin));
ok('el CSV lleva FDD y FAP justo después del presupuesto',
    /'Presupuesto USD', 'FDD \(USD\)', 'FAP \(USD\)', 'Comentarios del postulante'/.test(admin)
    && /r\.budgetUsd,\s*\n[^\n]*\n\s*csvAmount\(r\.fddRequestedUsd\), csvAmount\(r\.fapGoalUsd\), r\.notes/.test(admin)
    && /SELECT \*, \$\{SQL_FDD_COLUMNS\} FROM "ProjectFairSubmission" \$\{clause\} ORDER BY "createdAt" DESC/.test(admin));
ok('el CSV deja vacío lo que falta (no un 0)', /const csvAmount = \(v\) => \(v === null \|\| v === undefined \? '' : String\(Number\(v\)\)\)/.test(admin));
ok('el log de arranque anuncia la versión', /\[projectFairAdminController\] v4\.1304\.0 cargado/.test(admin));

console.log('\n4. La pantalla y las exportaciones del navegador');
const page = leer('src/pages/admin/PostulacionesPagos.tsx');
const cabecera = page.match(/\['budgetUsd', 'Presupuesto'\][\s\S]{0,400}?\['amountCop', 'Valor'\]/)?.[0] || '';
ok('orden de columnas: Presupuesto | FDD | FAP | Estado | Pago | Valor',
    /\['budgetUsd', 'Presupuesto'\],\s*\['fddRequestedUsd', 'FDD'\],\s*\['fapGoalUsd', 'FAP'\],\s*\['workflowStatus', 'Estado'\],\s*\['paymentStatus', 'Pago'\],\s*\['amountCop', 'Valor'\]/.test(cabecera));
ok('encabezados cortos con ayuda accesible (role="tooltip" + aria-describedby + foco)',
    /role="tooltip"/.test(page) && /aria-describedby=\{help \? helpId : undefined\}/.test(page) && /group-focus-within:/.test(page));
ok('las descripciones del pedido en la ayuda',
    /Cantidad solicitada al Distrito del Fondo Distrital Designado para el periodo 2026-2027\./.test(page)
    && /Meta de aportes al Fondo Anual de Programas para el periodo 2026-2027\./.test(page));
ok('celda: «—» si falta, «USD 0» si es cero', /const fmtUsdAmount = /.test(page) && /=== null \|\| n === undefined \? '—'/.test(page) && /`USD \$\{/.test(page));
ok('celdas alineadas a la derecha y sin partirse', /<AmountCell value=\{s\.fddRequestedUsd\}/.test(page) && /<AmountCell value=\{s\.fapGoalUsd\}/.test(page));
ok('la tabla vacía ocupa las 13 columnas', /colSpan=\{selectMode \? 14 : 13\}/.test(page));
ok('ordenar, «Limpiar», archivadas y tamaño de página recargan con el estado NUEVO (no el loadRows del render anterior)',
    /loadRowsRef\.current = loadRows;/.test(page) && (page.match(/reloadNext\(\); \}\}/g) || []).length === 4 && !/setTimeout\(\(\) => loadRows\(1\), 0\)/.test(page));
ok('filtros por rango FDD y FAP', /fddMin: '', fddMax: '', fapMin: '', fapMax: ''/.test(page) && /FDD mín\. \(USD\)/.test(page) && /Meta FAP máx\. \(USD\)/.test(page));
ok('el componente de la celda vive en el ámbito del módulo', /^const AmountCell = /m.test(page) && /^const SortHeader = /m.test(page));
ok('Excel: FDD y FAP numéricos tras el presupuesto, y una hoja con su definición',
    /'Presupuesto USD': s\.budgetUsd,\s*\n\s*'FDD \(USD\)': s\.fddRequestedUsd \?\? null,\s*\n\s*'FAP \(USD\)': s\.fapGoalUsd \?\? null,/.test(page)
    && /'Columnas'/.test(page));
const pdf = leer('src/lib/projectFairReportPdf.ts');
ok('PDF: columnas FDD y FAP con su leyenda', /d\.text\('FDD'/.test(pdf) && /d\.text\('FAP'/.test(pdf) && /Fondo Distrital Designado/.test(pdf) && /fddRequestedUsd\?: number \| null/.test(pdf));

// ── 5. Postgres ──────────────────────────────────────────────────────
const url = process.env.FDD_TEST_DATABASE_URL;
if (!url) {
    console.log('\n5. Postgres: OMITIDO (sin FDD_TEST_DATABASE_URL)');
} else {
    console.log('\n5. Postgres real: las mismas expresiones del servidor');
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    const schema = `fdd_test_${Date.now()}`;
    try {
        await client.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema};`);
        await client.query(`
            CREATE TABLE "ProjectFairSubmission" (id TEXT PRIMARY KEY, "projectName" TEXT, "registrationId" TEXT,
                "projectIndex" INT, "budgetUsd" NUMERIC, "workflowStatus" TEXT, "createdAt" TIMESTAMPTZ DEFAULT NOW());
            CREATE TABLE "ProjectFairProjectForm" (id SERIAL PRIMARY KEY, "submissionId" TEXT NOT NULL, "formKey" VARCHAR(60) NOT NULL,
                answers JSONB NOT NULL DEFAULT '{}', UNIQUE ("submissionId", "formKey"));`);
        // [id, estado, fdd guardado, fap guardado] — undefined = la clave no existe.
        const casos = [
            ['ambos', 'received', '5000', '2000'],
            ['vacios', 'received', '', ''],
            ['solo_fdd', 'in_review', '8000', ''],
            ['solo_fap', 'received', undefined, '3000'],
            ['ceros', 'received', '0', '0'],
            ['borrador', 'draft', '12000', '4000'],
            ['sin_form', 'received', null, null],
            ['miles', 'received', '5.000', '1,500'],
            ['decimales', 'received', '1234.5', '99,5'],
            ['usd', 'received', 'US$ 2,500.75', 'USD 1.000,25'],
            ['raro', 'received', '-50', 'abc'],
            ['numero_json', 'received', 7000, 2500],
            ['enorme', 'received', '9'.repeat(400), '1e99999'],
            // Un club con dos proyectos: cada uno con lo suyo.
            ['club_p1', 'received', '10000', '500'],
            ['club_p2', 'received', '300', '20000'],
        ];
        for (const [id, wf, fdd, fap] of casos) {
            await client.query(`INSERT INTO "ProjectFairSubmission" (id, "projectName", "workflowStatus", "registrationId", "projectIndex", "budgetUsd")
                                VALUES ($1, $1, $2, $3, $4, 30066)`,
                [id, wf, id.startsWith('club_') ? 'reg_club' : null, id === 'club_p2' ? 2 : 1]);
            if (fdd === null) continue;
            const fddSec = {};
            if (fdd !== undefined) fddSec.requestedUsd = fdd;
            if (fap !== undefined) fddSec.fapGoalUsd = fap;
            await client.query(`INSERT INTO "ProjectFairProjectForm" ("submissionId", "formKey", answers) VALUES ($1, $2, $3::jsonb)`,
                [id, FDD_FORM_KEY, JSON.stringify({ fdd: fddSec, aportes: { fapContributionUsd: '777' } })]);
        }
        // Otro formulario del mismo proyecto con las mismas claves: no se lee.
        await client.query(`INSERT INTO "ProjectFairProjectForm" ("submissionId", "formKey", answers) VALUES ('vacios', 'otro_form', '{"fdd":{"requestedUsd":"999"}}')`);

        const listar = async (orderBy = '"createdAt" DESC', where = '', params = []) =>
            (await client.query(`SELECT *, ${SQL_FDD_COLUMNS} FROM "ProjectFairSubmission" ${where} ORDER BY ${orderBy} NULLS LAST, id ASC`, params)).rows;
        const filas = Object.fromEntries((await listar()).map(r => [r.id, { ...r, ...fddAmountsOf(r) }]));
        const val = (id) => [filas[id].fddRequestedUsd, filas[id].fapGoalUsd];
        const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

        ok('1. FDD y FAP diligenciados', igual(val('ambos'), [5000, 2000]));
        ok('2. ambos vacíos → null (se pinta «—»)', igual(val('vacios'), [null, null]) && filas.vacios.fddRequestedReading === 'empty');
        ok('3. FDD sí, FAP vacío', igual(val('solo_fdd'), [8000, null]));
        ok('4. FAP sí, FDD ausente', igual(val('solo_fap'), [null, 3000]));
        ok('5. ceros explícitos → 0 (se pinta «USD 0»)', igual(val('ceros'), [0, 0]) && filas.ceros.fddRequestedReading === 'ok');
        ok('6. un borrador muestra lo que guardó', igual(val('borrador'), [12000, 4000]));
        ok('7/8. postulado y en revisión, cada uno lo suyo', igual(val('ambos'), [5000, 2000]) && igual(val('solo_fdd'), [8000, null]));
        ok('sin formulario FDD → null, sin inventar', igual(val('sin_form'), [null, null]));
        ok('miles «5.000» / «1,500» → 5000 / 1500 (marcados como normalizados)',
            igual(val('miles'), [5000, 1500]) && filas.miles.fddRequestedReading === 'normalized' && filas.miles.fddRequestedRaw === '5.000');
        ok('decimales «1234.5» / «99,5»', igual(val('decimales'), [1234.5, 99.5]));
        ok('«US$ 2,500.75» / «USD 1.000,25»', igual(val('usd'), [2500.75, 1000.25]));
        ok('negativo o texto → ilegible, sin valor', igual(val('raro'), [null, null]) && filas.raro.fddRequestedReading === 'unreadable' && filas.raro.fapGoalRaw === 'abc');
        ok('un número JSON también se lee', igual(val('numero_json'), [7000, 2500]));
        ok('un texto desmesurado no rompe la consulta: ilegible', igual(val('enorme'), [null, null]));
        ok('no confunde el FAP histórico (aportes.fapContributionUsd) ni el presupuesto', filas.ambos.fapGoalUsd === 2000 && Number(filas.ambos.budgetUsd) === 30066);
        ok('no lee otro formulario del mismo proyecto', filas.vacios.fddRequestedUsd === null);
        ok('9. club con dos proyectos: cada fila con SUS valores', igual(val('club_p1'), [10000, 500]) && igual(val('club_p2'), [300, 20000]));

        // 10. Modificación posterior: el club guarda de nuevo y el listado lo refleja.
        await client.query(`UPDATE "ProjectFairProjectForm" SET answers = jsonb_set(answers, '{fdd,requestedUsd}', '"6500"') WHERE "submissionId" = 'ambos' AND "formKey" = $1`, [FDD_FORM_KEY]);
        const tras = (await listar()).find(r => r.id === 'ambos');
        ok('10. un cambio guardado se ve en la siguiente consulta', Number(tras.fddRequestedUsd) === 6500 && Number(tras.fapGoalUsd) === 2000);
        await client.query(`UPDATE "ProjectFairProjectForm" SET answers = jsonb_set(answers, '{fdd,requestedUsd}', '"5000"') WHERE "submissionId" = 'ambos' AND "formKey" = $1`, [FDD_FORM_KEY]);

        // 12. Orden numérico, no alfabético.
        const fddAsc = (await listar(`${FDD_SORTABLE.fddRequestedUsd} ASC`)).map(r => r.fddRequestedUsd === null ? null : Number(r.fddRequestedUsd));
        const conValor = fddAsc.filter(v => v !== null);
        ok('12. FDD ascendente es numérico (300 antes que 1234.5 antes que 5000 antes que 10000)',
            conValor.every((v, i) => i === 0 || conValor[i - 1] <= v) && conValor.indexOf(300) < conValor.indexOf(10000) && conValor[0] === 0);
        ok('    los vacíos van al final', fddAsc.slice(conValor.length).every(v => v === null) && fddAsc.length === casos.length);
        const fapDesc = (await listar(`${FDD_SORTABLE.fapGoalUsd} DESC`)).map(r => r.fapGoalUsd === null ? null : Number(r.fapGoalUsd)).filter(v => v !== null);
        ok('12. FAP descendente es numérico (20000 primero, aunque «3000» > «20000» como texto)',
            fapDesc[0] === 20000 && fapDesc.every((v, i) => i === 0 || fapDesc[i - 1] >= v));

        // Rangos, con el mismo SQL que buildFilters.
        const enRango = async (key, op, n) => (await listar('id', `WHERE ${sqlAmount(key)} ${op} $1::numeric`, [n])).map(r => r.id).sort();
        ok('rango FDD ≥ 5000', igual(await enRango('fdd', '>=', 5000), ['ambos', 'borrador', 'club_p1', 'miles', 'numero_json', 'solo_fdd']));
        ok('rango FAP ≤ 0 = sólo el cero explícito (un vacío no entra)', igual(await enRango('fap', '<=', 0), ['ceros']));
        const nada = (await client.query(`SELECT COUNT(*)::int AS n FROM "ProjectFairProjectForm" WHERE answers->'fdd'->>'requestedUsd' = '5.000'`)).rows[0].n;
        ok('lo guardado no cambió (no se normaliza en la base)', nada === 1);
    } finally {
        await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
        await client.end();
    }
}

console.log(`\n${pass} pasaron, ${fail} fallaron\n`);
process.exit(fail ? 1 : 0);
