// ════════════════════════════════════════════════════════════════════════════
// Persistencia del Editor Visual de Plantillas — v4.1235
//
// Causa del incidente: cada arranque en frío del servidor corría
// ensureRotaryMarketingSchema, cuyas semillas (ON CONFLICT DO UPDATE)
// reescribían el diseño de toda campaña en borrador —y el asunto, preheader y
// textos de las de Directorio y Feria— y el diseño de las tres plantillas
// maestras. Lo guardado con «Guardar y Sincronizar» vivía hasta que Vercel
// levantaba otra instancia.
//
// Esta prueba corre contra un Postgres REAL (las semillas son SQL; un stub no
// prueba nada) y simula los arranques en frío importando de nuevo el módulo
// del ensure (cada import con otra query string trae su propio `_ready`).
//
//   TEST_DATABASE_URL=postgres://usuario:clave@localhost:5432/base_vacia \
//     node scripts/test-template-persistence.mjs
//
// ¡Borra y recrea las tablas de marketing de esa base! Usar una base de prueba.
// Sin TEST_DATABASE_URL se omite (no hay Postgres en el build).
// ════════════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

if (!process.env.TEST_DATABASE_URL) {
  console.log('test-template-persistence: omitida (define TEST_DATABASE_URL con una base de prueba).');
  process.exit(0);
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const { default: db } = await import('../server/lib/db.js');
const { ensureTemplateSchema } = await import('../server/lib/contentActivationTemplates.js');
const ctrl = await import('../server/controllers/rotaryMarketingController.js');
const { normalizeInstitutionalDesign } = await import('../server/lib/emailBlocks.js');

let ok = 0;
const malos = [];
const check = (nombre, cond, extra = '') => {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else { malos.push(nombre); console.log(`  ✗ ${nombre}${extra ? ` — ${extra}` : ''}`); }
};
const grupo = (t) => console.log(`\n── ${t} ──`);

let arranques = 0;
const arranqueEnFrio = async () => {
  arranques++;
  const mod = await import(`../server/lib/ensureRotaryMarketingSchema.js?arranque=${arranques}`);
  await mod.ensureRotaryMarketingSchema();
};
const llamar = async (handler, req) => {
  const res = {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  await handler({ user: { id: 'u-test', role: 'superadmin' }, params: {}, query: {}, body: {}, headers: {}, ...req }, res);
  return res;
};
const fila = async (id) => (await db.query(`SELECT * FROM "RotaryMarketingCampaign" WHERE id=$1`, [id])).rows[0];
const asObj = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
// JSONB reordena las claves: se compara por contenido, no por texto.
const igual = (a, b) => isDeepStrictEqual(JSON.parse(JSON.stringify(asObj(a))), JSON.parse(JSON.stringify(asObj(b))));

// Edición "completa" sobre el diseño que el editor abre: texto enriquecido,
// variables, bloque nuevo, reordenamiento, CTA y espaciados.
const editar = (design, marca) => {
  const d = structuredClone(design);
  const iTexto = d.blocks.findIndex((b) => b.type === 'text');
  d.blocks[iTexto] = {
    ...d.blocks[iTexto],
    text: `<p><b>Negrilla ${marca}</b>, <i>cursiva</i>, <span style="color:#d41367;font-family:Georgia">color y tipografía</span>, ` +
      `<a href="https://rotary4281.org/${marca}">enlace</a> y {{contact.first_name|Líder}}.</p>`,
    align: 'center',
    padTop: 30,
    padBottom: 18,
  };
  const iBoton = d.blocks.findIndex((b) => b.type === 'button');
  d.blocks[iBoton] = { ...d.blocks[iBoton], text: `CTA ${marca}`, href: `https://rotary4281.org/cta-${marca}`, bg: '#123456', radius: 4 };
  d.blocks.splice(2, 0, { id: `nuevo_${marca}`, type: 'spacer', height: 37, label: `Espaciador ${marca}` });
  // Reordenar: el bloque nuevo y el siguiente intercambian lugar.
  [d.blocks[2], d.blocks[3]] = [d.blocks[3], d.blocks[2]];
  d.settings = { ...d.settings, contentBg: '#fefefe', width: 640 };
  return d;
};

// ── Base limpia ───────────────────────────────────────────────────────────
for (const t of ['RotaryMarketingCampaign', 'RotaryMarketingGlobalBlock', 'ContentActivationTemplate', 'ContentActivationTemplateVersion']) {
  await db.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
}
await ensureTemplateSchema();
await arranqueEnFrio();

const CANALES = [
  { canal: 'Rotary en Acción', id: 'rmk-sem-01' },
  { canal: 'Directorio de Clubes', id: 'rmk-dir-sem-02' },
  { canal: 'Feria de Proyectos', id: null },
];
const feria = (await db.query(`SELECT id FROM "RotaryMarketingCampaign" WHERE initiative='feria_proyectos' AND status='draft' ORDER BY week LIMIT 1`)).rows[0];
CANALES[2].id = feria?.id;

grupo('0 · Semillas presentes en los tres canales');
for (const c of CANALES) {
  const f = c.id && await fila(c.id);
  check(`${c.canal}: campaña ${c.id} sembrada en borrador`, f && f.status === 'draft' && f.design);
}

const guardado = {};
grupo('1 · «Guardar y Sincronizar» escribe en la base');
for (const c of CANALES) {
  const antes = await fila(c.id);
  const design = editar(normalizeInstitutionalDesign(asObj(antes.design)), c.id);
  const subject = `Asunto propio ${c.id}`;
  const preheader = `Preheader propio ${c.id}`;
  const r = await llamar(ctrl.applyCampaignTemplate, {
    params: { id: c.id },
    body: { design, subject, preheader, html: `<html>${c.id}</html>` },
  });
  check(`${c.canal}: responde ok con la fila persistida`, r.statusCode === 200 && r.body?.ok && r.body?.campaign?.id === c.id, JSON.stringify(r.body).slice(0, 200));
  const despues = await fila(c.id);
  check(`${c.canal}: diseño idéntico en la base`, igual(despues.design, design));
  check(`${c.canal}: asunto/preheader/HTML en la base`, despues.subject === subject && despues.preheader === preheader && despues.contentHtml === `<html>${c.id}</html>`);
  check(`${c.canal}: marcada como personalizada (customizedAt)`, Boolean(despues.customizedAt));
  guardado[c.id] = { design, subject, preheader };
}

// Un borrador que nadie tocó debe seguir recibiendo el copy del código.
const intacta = (await db.query(
  `SELECT id, design FROM "RotaryMarketingCampaign" WHERE status='draft' AND id <> ALL($1) ORDER BY id LIMIT 1`,
  [CANALES.map((c) => c.id)]
)).rows[0];
await db.query(`UPDATE "RotaryMarketingCampaign" SET design='{"blocks":[],"marca":"vieja"}'::jsonb WHERE id=$1`, [intacta.id]);

grupo('2 · Arranques en frío (nueva instancia del servidor) NO pisan lo guardado');
for (let n = 1; n <= 2; n++) {
  await arranqueEnFrio();
  for (const c of CANALES) {
    const f = await fila(c.id);
    const g = guardado[c.id];
    check(`arranque ${n} · ${c.canal}: diseño intacto`, igual(f.design, g.design));
    check(`arranque ${n} · ${c.canal}: asunto y preheader intactos`, f.subject === g.subject && f.preheader === g.preheader, `${f.subject} | ${f.preheader}`);
  }
}
check('borrador NO personalizado sí se refresca desde la semilla', asObj((await fila(intacta.id)).design).marca !== 'vieja');

grupo('3 · Lo que el editor recibe al volver a abrir (GET /marketing/campaigns)');
{
  const r = await llamar(ctrl.getCampaigns, { query: { clubId: 'club-test' } });
  check('GET campañas responde ok', r.body?.ok && Array.isArray(r.body.campaigns));
  for (const c of CANALES) {
    const camp = r.body.campaigns.find((x) => x.id === c.id);
    const g = guardado[c.id];
    const ids = (d) => d.blocks.map((b) => b.id);
    check(`${c.canal}: mismo orden de bloques`, JSON.stringify(ids(camp.design)) === JSON.stringify(ids(g.design)), `${ids(camp.design)} vs ${ids(g.design)}`);
    const texto = camp.design.blocks.find((b) => b.type === 'text' && String(b.text).includes('Negrilla'));
    check(`${c.canal}: texto enriquecido y variable conservados`, texto && texto.text.includes('<b>Negrilla') && texto.text.includes('{{contact.first_name|Líder}}') && texto.padTop === 30);
    const boton = camp.design.blocks.find((b) => b.type === 'button' && b.text === `CTA ${c.id}`);
    check(`${c.canal}: CTA conservado`, boton && boton.href === `https://rotary4281.org/cta-${c.id}` && boton.bg === '#123456');
    check(`${c.canal}: estilos globales conservados`, camp.design.settings.contentBg === '#fefefe' && camp.design.settings.width === 640);
    check(`${c.canal}: el HTML que se envía sale del diseño guardado`, camp.contentHtml.includes(`CTA ${c.id}`) && camp.contentHtml.includes('Negrilla'));
  }
}

grupo('4 · Ediciones previas al despliegue (sin customizedAt) se rescatan');
{
  const legado = (await db.query(
    `SELECT id FROM "RotaryMarketingCampaign" WHERE status='draft' AND initiative='directorio_clubes' AND id <> ALL($1) ORDER BY id LIMIT 1`,
    [[...CANALES.map((c) => c.id), intacta.id]]
  )).rows[0];
  await db.query(
    `UPDATE "RotaryMarketingCampaign" SET design='{"blocks":[{"id":"legado","type":"spacer","height":9}]}'::jsonb,
       subject='Asunto editado antes del fix', "updatedAt"="createdAt" + INTERVAL '2 hours' WHERE id=$1`,
    [legado.id]
  );
  await arranqueEnFrio();
  const f = await fila(legado.id);
  check('se marca como personalizada', Boolean(f.customizedAt));
  check('su diseño y asunto sobreviven al arranque', asObj(f.design).blocks?.[0]?.id === 'legado' && f.subject === 'Asunto editado antes del fix');
}

grupo('5 · Plantilla maestra guardada sobrevive al arranque');
{
  const base = (await db.query(`SELECT design FROM "ContentActivationTemplate" WHERE id='tpl-rotary-en-accion-master'`)).rows[0];
  check('maestra sembrada', Boolean(base));
  const design = editar(normalizeInstitutionalDesign(asObj(base.design)), 'maestra');
  const r = await llamar(ctrl.saveMasterTemplate, { body: { name: 'Maestra propia', subject: 'S', preheader: 'P', design, html: '<p>m</p>' } });
  check('guardar maestra responde ok (v2)', r.body?.ok && r.body.template?.version === 2);
  await arranqueEnFrio();
  const f = (await db.query(`SELECT * FROM "ContentActivationTemplate" WHERE id='tpl-rotary-en-accion-master'`)).rows[0];
  check('diseño de la maestra intacto tras el arranque', igual(f.design, design));
  check('nombre de la maestra intacto', f.name === 'Maestra propia');
  const otras = (await db.query(`SELECT id, version FROM "ContentActivationTemplate" WHERE id IN ('tpl-directorio-clubes-master','tpl-feria-proyectos-master') ORDER BY id`)).rows;
  check('las otras dos maestras no se tocaron', otras.length === 2 && otras.every((o) => o.version === 1));
}

grupo('6 · Guardado de emergencia sin HTML (keepalive al salir)');
{
  const id = CANALES[0].id;
  const design = structuredClone(guardado[id].design);
  design.blocks.push({ id: 'emergencia', type: 'divider', color: '#ff0000', thickness: 2 });
  const r = await llamar(ctrl.applyCampaignTemplate, { params: { id }, body: { design, subject: guardado[id].subject, preheader: guardado[id].preheader } });
  const f = await fila(id);
  check('responde ok', r.body?.ok);
  check('el servidor compila el HTML desde el diseño', f.contentHtml && f.contentHtml.length > 500 && f.contentHtml !== `<html>${id}</html>`);
  check('el diseño quedó guardado', asObj(f.design).blocks.some((b) => b.id === 'emergencia'));
  const malo = await llamar(ctrl.applyCampaignTemplate, { params: { id }, body: { design: { nada: true } } });
  check('un diseño sin bloques se rechaza (400) y no pisa nada', malo.statusCode === 400 && asObj((await fila(id)).design).blocks.some((b) => b.id === 'emergencia'));
}

await db.pool.end().catch(() => {});
console.log(`\n${ok} comprobaciones OK${malos.length ? `, ${malos.length} FALLAN:\n - ${malos.join('\n - ')}` : ''}`);
assert.equal(malos.length, 0);
process.exit(0);
