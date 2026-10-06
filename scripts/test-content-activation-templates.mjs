// ════════════════════════════════════════════════════════════════════════════
// Diseñador de mensajes y biblioteca de plantillas — v4.1166
//
// 1. Criterio puro: variables, saneado, carcasa, versiones y snapshots.
// 2. Comportamiento con BD en memoria: biblioteca (CRUD, versiones,
//    predeterminada, borrado), aislamiento plantilla/campaña y validación al
//    guardar contenido (variables desconocidas, límites WhatsApp).
// 3. Cableado UI + paridad de la carcasa cliente/servidor.
//
// Sin red, sin Postgres real.
// ════════════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const HERE = pathToFileURL(`${process.cwd()}/`).href;
const DB = new URL('./scripts/fixtures/db-activation-stub.mjs', HERE).href;

register(
  `data:text/javascript,export async function resolve(s,c,n){
        if(/(^|\\/)db\\.js$/.test(s)) return {url:${JSON.stringify(DB)},shortCircuit:true};
        return n(s,c);
     }`,
  HERE
);

const V = await import('../server/lib/contentActivationVariables.js');
const M = await import('../server/lib/contentActivationMail.js');
const TPL = await import('../server/lib/contentActivationTemplates.js');
const stub = await import(DB);

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  ✓ ${n}`); }
  else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const grupo = (t) => console.log(`\n── ${t} ──`);

grupo('1 · Variables: catálogo cerrado y alias');
check('7 canónicas únicas', new Set(V.VARIABLE_IDS).size === 7 && V.VARIABLE_IDS.includes('form_url'));
check('alias español resuelven', V.canonicalVar('nombre_club') === 'club_name'
  && V.canonicalVar('nombre_contacto') === 'recipient_name'
  && V.canonicalVar('distrito') === 'district_name'
  && V.canonicalVar('nombre_campana') === 'campaign_name'
  && V.canonicalVar('url_rotary_en_accion') === 'form_url'
  && V.canonicalVar('formulario_url') === 'form_url');
check('desconocida no resuelve', V.canonicalVar('monto') === null);
check('dotted válido resuelve por ámbito', V.canonicalVar('contact.first_name') === 'contact.first_name'
  && V.canonicalVar('club.name') === 'club.name'
  && V.canonicalVar('campaign.url') === 'campaign.url');
check('dotted inválido no resuelve', V.canonicalVar('contact.monto') === null && V.canonicalVar('nave.club') === null);
check('findUnknownVars detecta', JSON.stringify(V.findUnknownVars('Hola {{nombre_club}}, tu {{monto}}')) === JSON.stringify(['monto']));
check('sin variables no hay desconocidas', V.findUnknownVars('Hola {{club_name}}').length === 0);
{
  const v = V.resolveCampaignVars({
    recipient: { club: 'Cali', distrito: '4281' },
    campaign: { name: 'Camp' }, sender: { siteName: 'Distrito' }, formUrl: 'https://f',
  });
  check('resuelve con aliases y contexto', v.club_name === 'Cali' && v.campaign_name === 'Camp' && v.form_url === 'https://f' && v.site_name === 'Distrito');
  check('fecha documentada presente', typeof v.fecha === 'string' && v.fecha.length > 4);
  check('ausente queda vacío, no "undefined"', V.resolveCampaignVars({}).club_name === '' && V.resolveCampaignVars({}).recipient_name === '');
}
{
  // Ámbitos CRM + `|default` (v4.1167).
  const scopes = V.buildCrmScopes({
    contact: { name: 'Ana Restrepo', email: 'ana@club.org', phone: '+57300111', company: 'ACME', city: 'Cali', country: 'Colombia' },
    club: { name: 'Club Rotario Cali', city: 'Cali', country: 'Colombia' },
    districtName: 'Distrito 4281',
    campaign: { name: 'Feria 2027', url: 'https://rotary4281.org/feria' },
  });
  check('buildCrmScopes separa nombre/apellido', scopes.contact.first_name === 'Ana' && scopes.contact.last_name === 'Restrepo');
  const r1 = V.renderWithDefaults('Hola {{contact.first_name}}, de {{club.name}} ({{district.name}})', scopes);
  check('dotted resuelve por ámbito', r1.text === 'Hola Ana, de Club Rotario Cali (Distrito 4281)' && r1.missing.length === 0, r1.text);
  const r2 = V.renderWithDefaults('Hola {{contact.first_name|Amigo}} <{{contact.email}}>', { contact: {} });
  check('|default cubre ausente y el presente manda', r2.text === 'Hola Amigo <>' && r2.missing.length === 1 && r2.missing[0] === 'contact.email', JSON.stringify(r2));
  const r3 = V.renderWithDefaults('Tu {{monto}} listo', scopes);
  check('desconocida se conserva y se reporta', r3.text === 'Tu {{monto}} listo' && JSON.stringify(r3.missing) === JSON.stringify(['monto']));
  const r4 = V.renderWithDefaults('<b>{{club.name}}</b>', { club: { name: 'A&B <Cali>' } });
  check('escapa valores para HTML', r4.text === '<b>A&amp;B &lt;Cali&gt;</b>', r4.text);
  const r5 = V.renderWithDefaults('Campaña {{campaign.name}}: {{campaign.url}}', scopes);
  check('campaña con nombre y url', r5.text === 'Campaña Feria 2027: https://rotary4281.org/feria', r5.text);
}
{
  // Paridad navegador/servidor del espejo TS (v4.1167).
  execSync(
    './node_modules/.bin/esbuild src/lib/contentActivationVariables.ts --bundle --platform=node --format=esm --outfile=/tmp/spec-vars-front.mjs --log-level=error',
    { stdio: 'inherit' }
  );
  const front = await import(pathToFileURL('/tmp/spec-vars-front.mjs').href);
  check('espejo: mismo catálogo', JSON.stringify(front.VARIABLE_IDS) === JSON.stringify(V.VARIABLE_IDS));
  check('espejo: mismos alias', JSON.stringify(Object.keys(front.VARIABLE_ALIASES).sort()) === JSON.stringify(Object.keys(V.VARIABLE_ALIASES).sort()));
  const scopes = { contact: { first_name: 'Ana', email: 'a@x.org' }, club: { name: 'Cali' }, district: { name: 'D4281' }, campaign: { name: 'F', url: 'https://f' } };
  for (const txt of ['Hola {{contact.first_name}} ({{club.name}})', 'Hola {{nombre_club|Amigo}}', 'Tu {{monto}}', '<b>{{club.name}}</b>']) {
    const a = V.renderWithDefaults(txt, scopes);
    const b = front.renderWithDefaults(txt, scopes);
    check(`espejo: paridad en ${txt.slice(0, 28)}…`, a.text === b.text && JSON.stringify(a.missing) === JSON.stringify(b.missing), `${a.text} vs ${b.text}`);
  }
}

grupo('2 · Sustitución escapada y saneado');
{
  const r = M.substituteVars('Hola {{recipient_name}}, <b>{{club_name}}</b> y {{monto}}', { recipient_name: 'Ana <CEO>', club_name: 'Cali' });
  check('escapa valores', r.text.includes('Ana &lt;CEO&gt;') && !r.text.includes('<CEO>'));
  check('desconocida se conserva y se reporta', r.text.includes('{{monto}}') && r.missing.includes('monto'));
  check('ausente se vacía y se reporta', M.substituteVars('Hola {{recipient_name}}', {}).text === 'Hola ');
  const s = M.sanitizeEmailHtml('<p>Hola</p><script>alert(1)</script><a href="javascript:evil()">x</a><a href="https://ok.org">y</a><img src="https://i.org/a.png" onerror="z()">');
  check('quita scripts', !/script/i.test(s));
  check('mata javascript: URLs', !/javascript:/i.test(s));
  check('quita manejadores', !/onerror/i.test(s));
  check('conserva http(s) e imágenes', s.includes('https://ok.org') && s.includes('https://i.org/a.png'));
  check('conserva tokens para resolver después', M.sanitizeEmailHtml('<a href="{{form_url}}">ir</a>').includes('{{form_url}}'));
  check('quita comentarios', !/<!--/.test(M.sanitizeEmailHtml('a<!--x-->b')));
  check('diseño vacío y sobredimensionado se rechazan',
    !M.validateDesignHtml('').ok && !M.validateDesignHtml('x'.repeat(M.EMAIL_HTML_MAX + 1)).ok);
  check('diseño con script se rechaza', !M.validateDesignHtml('<script>x</script>').ok);
}

grupo('3 · Carcasa determinista (preview = prueba = envío)');
{
  const a = M.buildEmailShell({ subject: 'S', preheader: 'P', bodyHtml: '<p>Hola</p>', footer: 'F' });
  const b = M.buildEmailShell({ subject: 'S', preheader: 'P', bodyHtml: '<p>Hola</p>', footer: 'F' });
  check('misma entrada ⇒ mismo documento', a === b);
  check('subject/preheader/footer presentes', a.includes('<title>S</title>') && a.includes('>P</div>') && a.includes('>F</td>'));
  const f = M.buildFinalEmail({ subject: 'Hola {{recipient_name}}', preheader: '', htmlBody: '<p>{{club_name}}</p>', footer: '', ctaUrl: '{{form_url}}', vars: { recipient_name: 'Ana', club_name: 'Cali', form_url: 'https://f' } });
  check('resuelve todo y no deja faltantes', f.subject === 'Hola Ana' && f.html.includes('Cali') && f.missing.length === 0);
  check('texto plano derivado', f.text.includes('Cali'));
}

grupo('4 · WhatsApp: límites del proveedor y respaldo');
{
  const bueno = { headerType: 'text', headerText: 'Hola', body: 'Texto {{form_url}}', footer: 'Gracias', buttons: [{ type: 'url', label: 'Compartir', url: '{{form_url}}' }] };
  check('mensaje válido pasa', M.validateWhatsAppFields(bueno).ok);
  check('cuerpo >1024 se rechaza', !M.validateWhatsAppFields({ ...bueno, body: 'x'.repeat(1025) }).ok);
  check('encabezado >60 se rechaza', !M.validateWhatsAppFields({ ...bueno, headerText: 'x'.repeat(61) }).ok);
  check('más de 3 botones se rechaza', !M.validateWhatsAppFields({ ...bueno, buttons: [1, 2, 3, 4].map(() => ({ type: 'quick', label: 'a' })) }).ok);
  check('variable desconocida se rechaza con su nombre',
    M.validateWhatsAppFields({ ...bueno, body: 'Hola {{monto}}' }).errores.join(' ').includes('{{monto}}'));
  check('respaldo une partes', M.waTextFallback({ headerText: 'H', body: 'B', footer: 'F' }) === 'H\n\nB\n\nF');
}

grupo('5 · Biblioteca con BD en memoria');
stub.reset();
const SUPER = { user: { role: 'superadmin', id: 'u1' }, headers: {} };
const TPLC = await import('../server/controllers/contentActivationTemplateController.js');
const CACT = await import('../server/controllers/contentActivationController.js');
const res = () => {
  const r = { code: 200, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};
const correr = async (h, req) => { const r = res(); await h(req, r); return r; };

let r = await correr(TPLC.list, { ...SUPER, query: {} });
check('primera visita siembra las 2 predeterminadas globales', r.code === 200 && (r.body?.templates || []).length === 2, `n=${r.body?.templates?.length}`);
check('una predeterminada por canal', (r.body?.templates || []).filter((t) => t.isDefault).length === 2);
const tplEmail = (r.body?.templates || []).find((t) => t.channel === 'email');

r = await correr(TPLC.create, {
  ...SUPER, body: {
    name: 'Invitación mensual', channel: 'email', scope: 'global',
    design: { version: 1, settings: {}, blocks: [{ id: 'b1', type: 'heading', text: 'Hola {{club_name}}' }] },
    html: '<h2>Hola {{club_name}}</h2>', subject: 'Hola {{club_name}}', preheader: 'Pre',
  },
});
check('crear plantilla → v1', r.code === 201 && r.body?.template?.version === 1, `code=${r.code} ${r.body?.error || ''}`);
const tplId = r.body?.template?.id;
check('nueva plantilla nace en borrador', r.body?.template?.status === 'borrador', r.body?.template?.status);
r = await correr(TPLC.transition, { ...SUPER, params: { id: tplId }, body: { status: 'activa' } });
check('borrador → activa', r.code === 200 && r.body?.template?.status === 'activa', `code=${r.code}`);
r = await correr(TPLC.transition, { ...SUPER, params: { id: tplId }, body: { status: 'borrador' } });
check('activa → borrador bloqueado', r.code === 400, `code=${r.code}`);
r = await correr(TPLC.transition, { ...SUPER, params: { id: tplId }, body: { status: 'inactiva' } });
check('activa → inactiva', r.code === 200, `code=${r.code}`);
r = await correr(TPLC.transition, { ...SUPER, params: { id: tplId }, body: { status: 'activa' } });
check('inactiva → activa', r.code === 200, `code=${r.code}`);

r = await correr(TPLC.update, { ...SUPER, params: { id: tplId }, body: { subject: 'Hola {{club_name}} v2', note: 'ajuste' } });
check('editar crea v2 (no reescribe)', r.code === 200 && r.body?.template?.version === 2 && r.body?.template?.subject.includes('v2'), `code=${r.code}`);
r = await correr(TPLC.versions, { ...SUPER, params: { id: tplId } });
check('historial de versiones inmutable (v1+v2)', (r.body?.versions || []).length === 2, `n=${r.body?.versions?.length}`);

r = await correr(TPLC.create, { ...SUPER, body: { name: 'Mala', channel: 'email', html: '<p>{{monto}}</p>', subject: 'x' } });
check('variable desconocida al crear → 400 con su nombre', r.code === 400 && JSON.stringify(r.body).includes('{{monto}}'), `code=${r.code}`);
r = await correr(TPLC.create, { ...SUPER, body: { name: 'Mala2', channel: 'whatsapp', design: { body: 'x'.repeat(1025) } } });
check('cuerpo WA largo al crear → 400', r.code === 400, `code=${r.code}`);

grupo('6 · Plantilla y campaña no se tocan entre sí');
const CAMP = {
  name: 'Campaña diseño', contributionCampaignId: 'cc1',
  startAt: new Date(Date.now() + 86400000).toISOString(), frecuencia: 'mensual',
  canales: ['email', 'whatsapp'], scopeDef: { type: 'club', ids: ['club-1'] },
  audienceMode: 'fixed', audienceSnapshot: [{ contactId: 'c1', channel: 'email', name: 'Ana', email: 'ana@x.org' }],
  audienceDef: { match: 'all', rules: [{ field: 'role', op: 'in', value: ['president'] }] },
  contentDef: {
    email: { subject: 'S', bodyText: 'Hola', ctaText: 'Ir', showShareGrid: false, showRecentPosts: false },
    whatsapp: { body: 'Hola {{form_url}}' },
  },
};
r = await correr(CACT.create, { ...SUPER, body: CAMP });
const campId = r.body?.campaign?.id;
check('campaña creada en borrador', r.code === 201, `code=${r.code} ${r.body?.error || ''}`);

// Adoptar v1 de la plantilla (snapshot en la campaña).
const v1 = await correr(TPLC.detail, { ...SUPER, params: { id: tplId }, query: { version: 1 } });
r = await correr(CACT.updateContent, {
  ...SUPER, params: { id: campId },
  body: {
    contentDef: {
      email: {
        subject: v1.body.template.subject, design: v1.body.template.design, html: '<h2>Hola {{club_name}}</h2>',
        templateId: tplId, templateVersion: 1,
      },
      whatsapp: { body: 'Hola {{form_url}}' },
    },
  },
});
check('adoptar v1 guarda snapshot + referencia', r.code === 200
  && r.body?.campaign?.contentDef?.email?.templateVersion === 1
  && String(r.body?.campaign?.contentDef?.email?.html).includes('Hola {{club_name}}'), `code=${r.code} ${r.body?.error || ''}`);

// La plantilla evoluciona a v3…
await correr(TPLC.update, { ...SUPER, params: { id: tplId }, body: { subject: 'Hola {{club_name}} v3' } });
r = await correr(CACT.detail, { ...SUPER, params: { id: campId } });
check('…y la campaña SIGUE en v1 (sin mutación silenciosa)',
  r.body?.campaign?.contentDef?.email?.templateVersion === 1
  && r.body?.campaign?.contentDef?.email?.subject !== 'Hola {{club_name}} v3');

// Vista previa resuelve con el snapshot (no con la plantilla actual).
const { resolveChannelContent } = await import('../server/lib/contentActivationContent.js');
const camp = (await correr(CACT.detail, { ...SUPER, params: { id: campId } })).body?.campaign;
const prev = await resolveChannelContent(camp, 'email', { testName: 'Carolina' });
check('preview usa el snapshot y resuelve vars', prev.html.includes('Hola') && prev.designMode === 'design');
const prev2 = await resolveChannelContent(camp, 'email', { testName: 'Carolina' });
check('preview es determinista (== envío)', prev.html === prev2.html && prev.subject === prev2.subject);
const wa = await resolveChannelContent(camp, 'whatsapp', { testName: 'Luis' });
check('whatsapp estructurado con respaldo y sin faltantes', wa.body.includes('Hola') && typeof wa.text === 'string' && wa.missing.length === 0);

// Validación al guardar contenido.
r = await correr(CACT.updateContent, { ...SUPER, params: { id: campId }, body: { contentDef: { email: { subject: 'Hola {{monto}}' } } } });
check('variable desconocida al guardar → 400', r.code === 400 && JSON.stringify(r.body).includes('{{monto}}'), `code=${r.code}`);
r = await correr(CACT.updateContent, { ...SUPER, params: { id: campId }, body: { contentDef: { whatsapp: { body: 'x'.repeat(1025) } } } });
check('WA largo al guardar → 400', r.code === 400, `code=${r.code}`);

grupo('7 · Ciclo de la plantilla: duplicar, archivar, eliminar, default');
r = await correr(TPLC.duplicate, { ...SUPER, params: { id: tplId }, body: {} });
check('duplicar crea copia en v1', r.code === 201 && /\(copia\)/.test(r.body?.template?.name) && r.body?.template?.version === 1, `code=${r.code}`);
const copiaId = r.body?.template?.id;
r = await correr(TPLC.remove, { ...SUPER, params: { id: copiaId }, body: {} });
check('eliminar sin confirm → 400', r.code === 400, `code=${r.code}`);
r = await correr(TPLC.remove, { ...SUPER, params: { id: copiaId }, body: { confirm: true } });
check('eliminar activa → 400 (archivar primero)', r.code === 400, `code=${r.code}`);
await correr(TPLC.archive, { ...SUPER, params: { id: copiaId }, body: { archived: true } });
r = await correr(TPLC.remove, { ...SUPER, params: { id: copiaId }, body: { confirm: true } });
check('archivada + confirm → eliminada', r.code === 200 && r.body?.deleted === true, `code=${r.code}`);
r = await correr(TPLC.detail, { ...SUPER, params: { id: copiaId }, query: {} });
check('eliminada ya no existe', r.code === 404, `code=${r.code}`);
r = await correr(TPLC.setDefault, { ...SUPER, params: { id: tplId }, body: {} });
check('marcar predeterminada', r.code === 200 && r.body?.template?.isDefault === true, `code=${r.code}`);
r = await correr(TPLC.list, { ...SUPER, query: {} });
check('una sola default de email', (r.body?.templates || []).filter((t) => t.channel === 'email' && t.isDefault).length === 1);

// Permisos: sitio ajeno no escribe globales, pero sí las ve.
const SITIO = { user: { role: 'district_admin', id: 'u-d9', districtId: 'd9', clubId: 'club-9' }, headers: {} };
r = await correr(TPLC.update, { ...SITIO, params: { id: tplId }, body: { subject: 'hack' } });
check('sitio no edita plantilla global → 403', r.code === 403, `code=${r.code}`);
r = await correr(TPLC.list, { ...SITIO, query: {} });
check('sitio VE las globales (para usarlas)', (r.body?.templates || []).some((t) => t.id === tplId), `n=${r.body?.templates?.length}`);

grupo('8 · Ciclo de vida v4.1167: estados, default activa, duplicado y validaciones');
{
  // Transiciones permitidas y bloqueadas (matriz del flujo).
  check('flujo borrador→activa sí', TPL.canTransitionTemplate('borrador', 'activa'));
  check('flujo borrador→inactiva no', !TPL.canTransitionTemplate('borrador', 'inactiva'));
  check('flujo activa→inactiva sí', TPL.canTransitionTemplate('activa', 'inactiva'));
  check('flujo activa→borrador no', !TPL.canTransitionTemplate('activa', 'borrador'));
  check('flujo archivada→activa sí', TPL.canTransitionTemplate('archivada', 'activa'));
  check('flujo archivada→inactiva no', !TPL.canTransitionTemplate('archivada', 'inactiva'));
  // Predeterminada exige activa: borrador → 400.
  const nb = await correr(TPLC.create, { ...SUPER, body: { name: 'Solo borrador', channel: 'email', html: '<p>Hola</p>', subject: 'Hola' } });
  const nbId = nb.body?.template?.id;
  check('nueva nace en borrador', nb.body?.template?.status === 'borrador');
  const defBorrador = await correr(TPLC.setDefault, { ...SUPER, params: { id: nbId }, body: {} });
  check('default en borrador → 400', defBorrador.code === 400, `code=${defBorrador.code}`);
  await correr(TPLC.transition, { ...SUPER, params: { id: nbId }, body: { status: 'activa' } });
  const defActiva = await correr(TPLC.setDefault, { ...SUPER, params: { id: nbId }, body: {} });
  check('default en activa → 200', defActiva.code === 200 && defActiva.body?.template?.isDefault === true, `code=${defActiva.code}`);
  // Duplicar conserva canal y nace en borrador v1.
  const dup = await correr(TPLC.duplicate, { ...SUPER, params: { id: nbId }, body: {} });
  check('duplicado nace en borrador v1', dup.code === 201 && dup.body?.template?.status === 'borrador' && dup.body?.template?.version === 1, `code=${dup.code}`);
  // Uso y métricas responden con forma estable (aunque sea vacío).
  const uso = await correr(TPLC.usage, { ...SUPER, params: { id: nbId } });
  check('usage con total + lastUsedAt', uso.code === 200 && typeof uso.body?.total === 'number' && 'lastUsedAt' in uso.body, `code=${uso.code}`);
  const met = await correr(TPLC.metrics, { ...SUPER, params: { id: nbId } });
  check('metrics con email + activacion', met.code === 200 && met.body?.email && met.body?.activacion, `code=${met.code}`);
}
{
  // EmailCampaign: validación de variables y nombre de duplicado (sin BD).
  const EMC = await import('../server/controllers/emailMarketingController.js');
  check('unknownVars detecta en variantes', JSON.stringify(EMC.unknownVarsInCampaign({ subject: 'Hola {{club_name}}', content: 'x', variantSubject: 'B {{monto}}' })) === JSON.stringify(['monto']));
  check('unknownVars limpio en pieza sana', EMC.unknownVarsInCampaign({ subject: 'Hola {{club_name}}', content: 'Bienvenido {{contact.first_name|Amigo}}' }).length === 0);
  check('duplicar nombra (copia)', EMC.duplicateCampaignName('Feria') === 'Feria (copia)');
  check('duplicar incrementa', EMC.duplicateCampaignName('Feria (copia)') === 'Feria (copia 2)');
  check('duplicar incrementa 2→3', EMC.duplicateCampaignName('Feria (copia 2)') === 'Feria (copia 3)');
  // Automatizaciones: trigger namespaced + validación de variables.
  const EMA = await import('../server/controllers/emailAutomationController.js');
  check('trigger simple ok', EMA.assertTriggerTag('bienvenida') === 'bienvenida');
  check('trigger namespaced ca: ok', EMA.assertTriggerTag('ca:feria-2027') === 'ca:feria-2027');
  let mal = null;
  try { EMA.assertTriggerTag('con espacios'); } catch (e) { mal = e; }
  check('trigger con espacios → 400', mal?.status === 400);
  mal = null;
  try { EMA.assertTriggerTag(''); } catch (e) { mal = e; }
  check('trigger vacío → 400', mal?.status === 400);
  check('unknownVars en pasos email', JSON.stringify(EMA.unknownVarsInSteps([{ actionType: 'email', subject: 'Hola', content: 'Tu {{monto}}' }])) === JSON.stringify(['monto']));
  check('pasos no-email no aportan vars', EMA.unknownVarsInSteps([{ actionType: 'wait' }, { actionType: 'notify', subject: 'x {{monto}}', content: '' }]).length === 0);
}

console.log('\n' + '─'.repeat(60));
if (malos.length) {
  console.log(`❌ ${malos.length} fallo(s) de ${ok + malos.length}:`);
  for (const m of malos) console.log('   ·', m);
  process.exit(1);
}
console.log(`✅ ${ok} comprobaciones, todas en verde.`);
