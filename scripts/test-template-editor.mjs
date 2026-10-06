// ════════════════════════════════════════════════════════════════════════════
// Editor profesional de plantillas — v4.1170 (FASE 1)
//
// Modelo único `emailBlocks` (10 tipos), render email-safe con padding/peso,
// vista previa interactiva (clic→selección, solo preview), validadores
// sincronizados y paridad editor↔validador. Sin red, sin Postgres real.
// ════════════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

const HERE = pathToFileURL(`${process.cwd()}/`).href;
const DB = new URL('./scripts/fixtures/db-activation-stub.mjs', HERE).href;

register(
  `data:text/javascript,export async function resolve(s,c,n){
        if(/(^|\\/)db\\.js$/.test(s)) return {url:${JSON.stringify(DB)},shortCircuit:true};
        return n(s,c);
     }`,
  HERE
);

let ok = 0;
const malos = [];
const check = (nombre, cond, extra = '') => {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else { malos.push(nombre); console.log(`  ✗ ${nombre}${extra ? ` — ${extra}` : ''}`); }
};
const grupo = (t) => console.log(`\n── ${t} ──`);

execSync(
  './node_modules/.bin/esbuild src/lib/emailBlocks.ts --bundle --platform=node --format=esm --outfile=/tmp/spec-blocks.mjs --log-level=error',
  { stdio: 'inherit' }
);
execSync(
  './node_modules/.bin/esbuild src/components/admin/content-activation/MessageDesigner/designUtils.ts --bundle --platform=node --format=esm --outfile=/tmp/spec-designutils.mjs --log-level=error --external:react --external:react-dom',
  { stdio: 'inherit' }
);
const B = await import(pathToFileURL('/tmp/spec-blocks.mjs').href);
const DU = await import(pathToFileURL('/tmp/spec-designutils.mjs').href);

grupo('1 · Modelo completo (10 bloques, Mailchimp-conceptual)');
{
  const tipos = ['heading', 'text', 'image', 'button', 'columns', 'divider', 'spacer', 'social', 'video', 'html'];
  check('10 tipos con etiqueta y fábrica', tipos.every((t) => B.BLOCK_LABELS[t] && B.makeBlock(t).type === t));
  const d = { version: 1, settings: { ...B.DEFAULT_SETTINGS }, blocks: tipos.map((t) => B.makeBlock(t)) };
  const html = B.renderDesignToHtml(d);
  check('todos renderizan sin romperse', tipos.every((t) => !html.includes('undefined')) && html.length > 500, `len=${html.length}`);
  check('video sin autoplay inserido (thumbnail+enlace)', html.includes('Ver el video') && !/<video/i.test(html));
  check('social sin urls no rompe', B.renderDesignToHtml({ version: 1, settings: { ...B.DEFAULT_SETTINGS }, blocks: [{ id: 's', type: 'social', align: 'center', links: [], color: '#000' }] }).length > 50);
}

grupo('2 · Props avanzadas sin romper lo existente');
{
  const conpads = {
    version: 1, settings: { ...B.DEFAULT_SETTINGS },
    blocks: [
      { id: 'h', type: 'heading', text: 'T', level: 2, align: 'left', color: '#111', weight: 'normal', padTop: 20, padBottom: 4 },
      { id: 't', type: 'text', text: 'x', align: 'left', color: '#333', size: 15, weight: 'bold' },
      { id: 'i', type: 'image', url: 'https://x.org/a.png', alt: '', href: '', align: 'center', width: 100, radius: 16 },
    ],
  };
  const h = B.renderDesignToHtml(conpads);
  check('peso normal/bold', h.includes('font-weight:400') && h.includes('font-weight:700'));
  check('padding vertical por bloque', h.includes('padding:20px 24px 4px'));
  check('radio en imagen', h.includes('border-radius:16px'));
  const base = B.renderDesignToHtml(B.DEFAULT_DESIGN);
  check('guardado limpio (sin data-bid ni script)', !base.includes('data-bid') && !base.includes('<script'));
  check('heading 800 por defecto', base.includes('font-weight:800'));
  const inter = B.renderDesignToHtml(conpads, { interactive: true });
  check('interactivo: bids + listener de clic', inter.includes('data-bid="h"') && inter.includes('ca-select-block'));
  const viejo = B.parseDesign(JSON.stringify({ version: 1, settings: {}, blocks: [{ id: 'x', type: 'text', text: 'hola', align: 'left', color: '#333', size: 15 }] }));
  check('diseños viejos siguen válidos', !!viejo && viejo.blocks.length === 1);
}

grupo('3 · Validadores sincronizados con el modelo');
{
  const { EMAIL_BLOCKS } = await import('../server/controllers/contentActivationTemplateController.js');
  const tipos = ['heading', 'text', 'image', 'button', 'columns', 'divider', 'spacer', 'social', 'video', 'html'];
  check('servidor acepta los 10 tipos', tipos.every((t) => EMAIL_BLOCKS.includes(t)), JSON.stringify(EMAIL_BLOCKS));
  check('diseñador valida los 10 tipos', DU.validateDesign({ version: 1, settings: {}, blocks: tipos.map((t, i) => ({ id: `b${i}`, type: t })) }).length === 0);
  check('tipo inválido se rechaza', DU.validateDesign({ version: 1, settings: {}, blocks: [{ id: 'x', type: 'marquesina' }] }).length > 0);
  check('límite 50 bloques', DU.validateDesign({ version: 1, settings: {}, blocks: Array.from({ length: 51 }, (_, i) => ({ id: `b${i}`, type: 'text' })) }).length > 0);
}

grupo('4 · Guardado de extremo a extremo con bloques nuevos');
{
  const SUPER = { user: { role: 'superadmin', id: 'u1' }, headers: {} };
  const TPLC = await import('../server/controllers/contentActivationTemplateController.js');
  const res = () => {
    const r = { code: 200, body: null };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    return r;
  };
  const correr = async (h, req) => { const r = res(); await h(req, r); return r; };
  const design = {
    version: 1, settings: { ...B.DEFAULT_SETTINGS },
    blocks: [
      { id: 'h1', type: 'heading', text: 'Novedades {{club_name}}', level: 2, align: 'center', color: '#0c3c7c', weight: '800', padBottom: 8 },
      { id: 'v1', type: 'video', url: 'https://video.org/x', thumbnail: '', title: 'Ver el video', align: 'center' },
      { id: 's1', type: 'social', align: 'center', color: '#0c3c7c', links: [{ network: 'facebook', url: 'https://fb.org/x' }] },
      { id: 'h9', type: 'html', html: '<p>Legal</p>' },
    ],
  };
  let r = await correr(TPLC.create, {
    ...SUPER, body: { name: 'Editor pro', channel: 'email', design, html: B.renderDesignToHtml(design), subject: 'Hola {{club_name}}', preheader: '' },
  });
  check('crear con bloques nuevos → 201 v1', r.code === 201 && r.body?.template?.version === 1, `code=${r.code} ${r.body?.error || ''}`);
  const id = r.body?.template?.id;
  // La IA propone HTML → se convierte a bloques y se guarda como versión.
  r = await correr(TPLC.update, {
    ...SUPER, params: { templateId: id },
    body: {
      design: { ...design, blocks: [...design.blocks, { id: 't9', type: 'text', text: 'Agregado por IA', align: 'left', color: '#333', size: 15 }] },
      html: '<p>Agregado por IA</p>', note: 'mejora IA',
    },
  });
  check('editar crea v2 (versionado intacto)', r.code === 200 && r.body?.template?.version === 2, `code=${r.code} ${r.body?.error || ''}`);
  r = await correr(TPLC.versions, { ...SUPER, params: { templateId: id } });
  check('historial v1+v2', (r.body?.versions || []).length === 2, `n=${r.body?.versions?.length}`);
}

console.log('\n' + '─'.repeat(60));
if (malos.length) {
  console.log(`❌ ${malos.length} fallo(s) de ${ok + malos.length}:`);
  for (const m of malos) console.log('   ·', m);
  process.exit(1);
}
console.log(`✅ ${ok} comprobaciones, todas en verde.`);
