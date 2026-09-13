#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// CONEXIÓN CON META: VUELTA DEL OAUTH, TENANT Y SINCRONIZACIÓN
// npm run test:meta:oauth  ·  v4.1043.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED. El criterio es puro; el CAMINO del
// sincronizador corre de verdad con Prisma y la Graph API sustituidas por un
// hook de resolución de módulos.
//
// Lo que protege, en orden de lo que costaría equivocarse:
//
//   1. QUE EL CALLBACK NO TERMINE EN UNA PÁGINA EN BLANCO. El `redirect_uri`
//      de Meta es UNO y vive en el host de la plataforma; quien pulsó
//      «Conectar» estaba en el dominio de su sitio, donde vive su sesión. Una
//      redirección RELATIVA la resuelve el navegador contra el host del
//      callback y deja a la persona en un panel donde no tiene sesión — el
//      defecto reportado. Toda salida tiene que ser ABSOLUTA y hacia el
//      origen que inició el flujo.
//
//   2. QUE EL ORIGEN NO SE ACEPTE A CIEGAS. Lo manda el navegador: sin
//      comprobarlo contra los sitios REALES del ecosistema, esto sería un
//      salto abierto — bastaría armar el enlace de conexión con otro
//      `returnOrigin` para que Meta devolviera a alguien a un dominio ajeno.
//
//   3. QUE LAS CUENTAS SE ATRIBUYAN AL TENANT QUE INICIÓ EL FLUJO, no al
//      sitio por el que entró quien lo pulsó.
//
//   4. QUE LO QUE YA NO SE AUTORIZA SE RETIRE. Una Página concedida hace
//      meses y no vuelta a conceder se quedaba `active` para siempre, y el
//      selector de «Publicar en redes sociales» la seguía ofreciendo: así es
//      como un sitio termina viendo Páginas que no son las suyas.
//
//   5. …PERO SÓLO LO DE QUIEN SINCRONIZA. Dos personas pueden haber conectado
//      Páginas distintas para el mismo sitio: retirar por ausencia a secas
//      dejaría sin publicar a la otra, que no pidió nada.
//
//   6. QUE HAYA UN SOLO SINCRONIZADOR. Con dos, el día que cambie cómo se
//      descubre Instagram una mitad se queda atrás y el fallo es MUDO: las dos
//      siguen guardando cuentas.
//
//   7. QUE UNA PÁGINA SIN INSTAGRAM SE EXPLIQUE. «Instagram no conectado» a
//      secas manda a reconectar una cuenta que está bien: lo que suele faltar
//      es convertirla a profesional o vincularla en Meta Business.
//
//   8. QUE NINGÚN ACCESS TOKEN VIAJE AL NAVEGADOR NI AL REGISTRO.
// ════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const HERE = pathToFileURL(`${process.cwd()}/`).href;
const PRISMA = new URL('./scripts/fixtures/prisma-meta-stub.mjs', HERE).href;
const META = new URL('./scripts/fixtures/meta-graph-stub.mjs', HERE).href;
const CRYPTO = new URL('./scripts/fixtures/crypto-meta-stub.mjs', HERE).href;

register(
    `data:text/javascript,export async function resolve(s,c,n){
        if(/(^|\\/)prisma\\.js$/.test(s)) return {url:${JSON.stringify(PRISMA)},shortCircuit:true};
        if(/metaService\\.js$/.test(s)) return {url:${JSON.stringify(META)},shortCircuit:true};
        if(/tokenCrypto\\.js$/.test(s)) return {url:${JSON.stringify(CRYPTO)},shortCircuit:true};
        return n(s,c);
    }`,
    HERE
);

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const eq = (n, a, b) => check(n, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const grupo = t => console.log(`\n${t}`);
const leer = f => readFileSync(f, 'utf8');
/** El archivo SIN comentarios: el comentario que explica un cambio no puede
 *  hacer fallar la comprobación que lo defiende (la lección de v4.1005). */
const codigo = f => leer(f)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

const RET = await import('../server/lib/socialReturnUrl.js');
const SYNC = await import('../server/lib/metaSync.js');
const DEF = await import('../server/lib/socialDefaults.js');
const db = await import('../scripts/fixtures/prisma-meta-stub.mjs');
const graph = await import('../scripts/fixtures/meta-graph-stub.mjs');

const CTRL = codigo('server/controllers/socialPublishingController.js');
const SYNC_SRC = codigo('server/lib/metaSync.js');
const PANEL = codigo('src/components/admin/content-studio/AccountManager.tsx');

// ════════════════════════════════════════════════════════════════════
grupo('1. La vuelta del OAuth es ABSOLUTA y hacia el sitio que empezó');

check('Un host se normaliza sin `www.` y en minúsculas',
      RET.hostOf('https://WWW.Rotary4281.org/admin') === 'rotary4281.org');
check('`javascript:` no es un origen', RET.hostOf('javascript://evil.com/%0aalert(1)') === null);
check('Una cadena vacía tampoco', RET.hostOf('') === null);

const URL_OK = RET.buildReturnUrl({
    origin: 'https://rotary4281.org', baseUrl: 'https://app.clubplatform.org',
    params: { tab: 'accounts', meta: 'connected', fb: 1, ig: 1 },
});
check('⚠️ La vuelta es ABSOLUTA al sitio que inició el flujo, no al host del callback',
      URL_OK.startsWith('https://rotary4281.org/admin/content-studio?'), URL_OK);
check('…y lleva el resultado para que la pantalla pueda decir qué pasó',
      URL_OK.includes('meta=connected') && URL_OK.includes('tab=accounts'));

const URL_SIN = RET.buildReturnUrl({
    origin: '', baseUrl: 'https://app.clubplatform.org', params: { meta: 'error', message: 'x' },
});
check('Sin origen comprobado se cae al host de la plataforma, nunca a una ruta relativa',
      URL_SIN.startsWith('https://app.clubplatform.org/admin/content-studio'), URL_SIN);

check('El mensaje viaja codificado (un error de Meta trae espacios y signos)',
      RET.buildReturnUrl({ origin: 'https://rotary4281.org', baseUrl: '', params: { message: 'no se pudo & falló' } })
         .includes('message=no+se+pudo+%26+fall%C3%B3'));

// ⚠️ La comprobación que de verdad importa: que no quede NINGUNA redirección
// relativa en el controlador. Es el defecto reportado, y es un cambio de una
// línea reintroducirlo.
check('⚠️ Ninguna redirección del controlador es relativa (`res.redirect(\'/…\')`)',
      !/res\.redirect\(\s*[`'"]\//.test(CTRL));
check('⚠️ Y ninguna se arma pegando `${getBaseUrl(req)}/admin`',
      !/getBaseUrl\(req\)\}\/admin/.test(CTRL));
check('Toda salida del callback pasa por `buildReturnUrl`',
      (CTRL.match(/buildReturnUrl\(/g) || []).length >= 2);

// ════════════════════════════════════════════════════════════════════
grupo('2. El origen se comprueba contra los sitios REALES, no se acepta a ciegas');

db.reset({ clubs: [{ id: 'c-4281', domain: 'rotary4281.org' }] });
eq('El sitio propio se admite',
   await RET.resolveReturnOrigin({ candidate: 'https://rotary4281.org/admin/content-studio', baseUrl: 'https://app.clubplatform.org' }),
   'https://rotary4281.org');
eq('El host de la plataforma se admite siempre',
   await RET.resolveReturnOrigin({ candidate: 'https://app.clubplatform.org/x', baseUrl: 'https://app.clubplatform.org' }),
   'https://app.clubplatform.org');
eq('⚠️ Un dominio que no existe en la base NO se admite (salto abierto)',
   await RET.resolveReturnOrigin({ candidate: 'https://sitio-ajeno.example/phish', baseUrl: 'https://app.clubplatform.org' }),
   null);
eq('…ni un esquema que no es http/https',
   await RET.resolveReturnOrigin({ candidate: 'javascript://rotary4281.org/%0aalert(1)', baseUrl: 'https://app.clubplatform.org' }),
   null);

db.reset({ districts: [{ id: 'd-4281', domain: 'rotary4281.org' }] });
eq('⚠️ El dominio propio de un DISTRITO no vive en `Club.domain` (v4.744) y se reconoce igual',
   await RET.resolveReturnOrigin({ candidate: 'https://rotary4281.org', baseUrl: 'https://app.clubplatform.org' }),
   'https://rotary4281.org');

// ════════════════════════════════════════════════════════════════════
grupo('3. El sincronizador guarda lo autorizado, en el tenant que lo pidió');

const PAGINAS = [
    { id: '728932976959414', name: 'Distrito 4281 de RI', category: 'Nonprofit', accessToken: 'tok-4281', avatar: null, tasks: ['CREATE_CONTENT', 'MANAGE'] },
];
const IG = { '728932976959414': { id: '17841408037178163', username: 'rotary4281', name: 'Rotary 4281', avatar: null, followersCount: 10 } };

db.reset({});
graph.reset({ pages: PAGINAS, instagram: IG, profile: { id: 'u-felipe', name: 'Felipe' } });

const inf = await SYNC.syncMetaAccountsForClub({
    clubId: 'c-4281', userToken: 'user-largo', userTokenExpiresAt: new Date('2027-01-01'),
});

eq('La Página autorizada se guarda con su Page ID de Meta',
   inf.pages.map(p => p.pageId), ['728932976959414']);
eq('El Instagram vinculado se guarda con su id de cuenta profesional',
   inf.instagram.map(i => i.igId), ['17841408037178163']);
check('…y se anota de qué Página cuelga',
      inf.instagram[0].pageId === '728932976959414');

const filas = db.rows('socialAccount');
check('⚠️ TODO se escribe acotado al tenant que inició el flujo',
      filas.length === 2 && filas.every(f => f.clubId === 'c-4281'));
check('La fila de Facebook lleva el Page ID como `platformId`',
      filas.some(f => f.platform === 'facebook' && f.platformId === '728932976959414'));
check('La de Instagram lleva el IG ID y su Página en `pageId`',
      filas.some(f => f.platform === 'instagram' && f.platformId === '17841408037178163' && f.pageId === '728932976959414'));
check('Las dos quedan activas y con el cifrado vigente',
      filas.every(f => f.status === 'active' && f.tokenVersion === 1));
check('⚠️ El token de usuario queda guardado CIFRADO para poder resincronizar sin otro OAuth',
      filas.every(f => typeof f.refreshToken === 'string' && f.refreshToken.startsWith('enc:')));
check('…y el token de la Página también se guarda cifrado, nunca en claro',
      filas.every(f => String(f.accessToken).startsWith('enc:')));

const guardado = await SYNC.storedUserTokenFor('c-4281');
check('El token guardado se recupera para «Sincronizar cuentas»', guardado?.token === 'user-largo');
eq('Un sitio sin conexión no devuelve ninguno', await SYNC.storedUserTokenFor('c-otro'), null);

// ════════════════════════════════════════════════════════════════════
grupo('4. Lo que ya no se autoriza se RETIRA — y sólo lo de quien sincroniza');

// Segunda vuelta: el mismo usuario ya no concede la Página vieja.
db.reset({
    socialAccount: [
        { id: 'a1', clubId: 'c-4281', platform: 'facebook', platformId: '175397702326386',
          accountName: 'Rotary E-Club Origen', status: 'active',
          metadata: { connectedBy: { id: 'u-felipe', name: 'Felipe' } } },
        { id: 'a2', clubId: 'c-4281', platform: 'facebook', platformId: '1069684432899390',
          accountName: 'Club Platform for Rotary', status: 'active',
          metadata: { connectedBy: { id: 'u-otro', name: 'Otra persona' } } },
        { id: 'a3', clubId: 'c-4281', platform: 'facebook', platformId: '999',
          accountName: 'Heredada sin autor', status: 'active', metadata: {} },
    ],
});
graph.reset({ pages: PAGINAS, instagram: IG, profile: { id: 'u-felipe', name: 'Felipe' } });
const inf2 = await SYNC.syncMetaAccountsForClub({ clubId: 'c-4281', userToken: 'user-largo' });

const estado = (id) => db.rows('socialAccount').find(f => f.id === id)?.status;
check('⚠️ La Página que este usuario ya NO autoriza se retira (deja de ofrecerse)',
      estado('a1') === 'revoked');
check('⚠️ …pero la que conectó OTRA persona NO se toca', estado('a2') === 'active');
check('…ni una fila heredada que no se puede atribuir a nadie', estado('a3') === 'active');
eq('Lo retirado se informa', inf2.revoked.map(r => r.platformId), ['175397702326386']);
check('Y la Página recién autorizada queda activa',
      db.rows('socialAccount').some(f => f.platformId === '728932976959414' && f.status === 'active'));

// ════════════════════════════════════════════════════════════════════
grupo('5. Una Página sin Instagram se explica, no se deja en silencio');

db.reset({});
graph.reset({
    pages: [{ id: '1', name: 'Sin IG', accessToken: 't', tasks: [] }],
    instagram: {}, profile: { id: 'u', name: 'X' },
});
const inf3 = await SYNC.syncMetaAccountsForClub({ clubId: 'c-x', userToken: 'u' });
eq('No se inventa ninguna cuenta de Instagram', inf3.instagram, []);
check('Se dice POR QUÉ no hay Instagram', inf3.notes[0]?.code === 'ig_not_linked');
check('…y se dice DÓNDE se corrige — un bloqueo sin salida se lee como una avería',
      /Profesional/.test(inf3.notes[0]?.fix || '') && /vinculada/.test(inf3.notes[0]?.fix || ''));

// ════════════════════════════════════════════════════════════════════
grupo('6. Hay UN solo sincronizador, y el callback lo usa');

check('⚠️ El callback llama a `syncMetaAccountsForClub`, no a su propia copia',
      /syncMetaAccountsForClub\(/.test(CTRL));
const CUERPO_META = CTRL.slice(
    CTRL.indexOf('export const handleMetaCallback'),
    CTRL.indexOf('export const syncMetaAccounts'));
check('⚠️ Y el callback de Meta ya no escribe cuentas por su cuenta (ni un upsert de `socialAccount`)',
      CUERPO_META.length > 500 && !/socialAccount\.upsert/.test(CUERPO_META));
check('…ni recorre Páginas a mano (`for (const page of pages)`)',
      !/for\s*\(\s*const page of/.test(CUERPO_META));
check('El botón «Sincronizar cuentas» entra por el MISMO motor',
      (CTRL.match(/syncMetaAccountsForClub\(/g) || []).length === 2);
check('Sólo `metaSync.js` enumera las Páginas de Meta',
      /getUserPages\(/.test(SYNC_SRC) && !/getUserPages\(/.test(CTRL));

// ════════════════════════════════════════════════════════════════════
grupo('7. Ningún token sale al navegador ni al registro');

check('⚠️ El registro del callback no imprime ningún token',
      !/console\.log\([^)]*[Tt]oken/.test(CTRL) || !/longToken|shortToken|accessToken/.test(
          (CTRL.match(/console\.log\([\s\S]{0,400}?\);/g) || []).join('\n')));
check('El informe de sincronización no lleva ningún token',
      !JSON.stringify(inf).includes('user-largo') && !JSON.stringify(inf).includes('tok-4281'));

// ════════════════════════════════════════════════════════════════════
grupo('8. La cuenta PRINCIPAL del sitio');

const targets = [
    { id: 'a1', network: 'facebook', ready: true },
    { id: 'a2', network: 'instagram', ready: true },
    { id: 'a3', network: 'facebook', ready: false },
];
eq('Los predeterminados vivos se conservan',
   DEF.resolveDefaults({ facebook: 'a1', instagram: 'a2' }, targets),
   { facebook: 'a1', instagram: 'a2' });
eq('⚠️ Uno que apunta a una cuenta que NO puede publicar se suelta — marcarlo abriría el modal con una cuenta que el servidor rechaza',
   DEF.resolveDefaults({ facebook: 'a3', instagram: null }, targets),
   { facebook: null, instagram: null });
eq('…y uno que apunta a una cuenta borrada, también',
   DEF.resolveDefaults({ facebook: 'ya-no-existe' }, targets),
   { facebook: null, instagram: null });
check('El id se guarda, nunca el nombre',
      /platformId|acc\.id/.test(codigo('server/lib/socialDefaults.js')) &&
      !/accountName\s*===/.test(codigo('server/lib/socialDefaults.js')));

// ════════════════════════════════════════════════════════════════════
grupo('9. La pantalla: vuelve, sincroniza y dice los ids');

check('El panel manda el origen para que el callback sepa a dónde devolver',
      /returnOrigin=\$\{encodeURIComponent\(window\.location\.origin\)\}/.test(PANEL));
check('Lee el parámetro nuevo (`meta`) y también el anterior (`social`), que puede venir en vuelo',
      /params\.get\('meta'\)\s*\|\|\s*params\.get\('social'\)/.test(PANEL));
check('Ofrece «Sincronizar cuentas» sin volver a autorizar',
      /SINCRONIZAR CUENTAS/.test(PANEL) && /accounts\/sync/.test(PANEL));
check('⚠️ Muestra el id oficial de Meta de cada cuenta (Page ID / IG ID)',
      /Page ID/.test(PANEL) && /IG ID/.test(PANEL));
check('…y cuándo fue la última sincronización',
      /lastSyncAt/.test(PANEL));
check('Se puede marcar cuál es la cuenta principal del sitio',
      /markDefault/.test(PANEL) && /accounts\/defaults/.test(PANEL));

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`✗ ${malos.length} de ${ok + malos.length} fallaron:`);
    malos.forEach(m => console.log(`   · ${m}`));
    process.exit(1);
}
console.log(`✓ ${ok} comprobaciones, todas en verde.`);
