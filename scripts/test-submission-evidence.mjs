// ════════════════════════════════════════════════════════════════════════════
// Evidencias de Rotary en Acción — v4.1165
//
// Límites (5 MB foto / 300 MB video), mensajes, duplicados y conteo válido.
// Lo puro se ejecuta (spec del navegador empaquetada con esbuild + spec del
// servidor); el cableado UI/backend se comprueba por código, como el resto
// de las pruebas del repo.
//
// Sin red, sin Postgres, sin S3.
// ════════════════════════════════════════════════════════════════════════════
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  ✓ ${n}`); }
  else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const grupo = (t) => console.log(`\n── ${t} ──`);

// ── Spec del navegador, empaquetada tal cual la consume el formulario ──
execSync(
  './node_modules/.bin/esbuild src/lib/contentSubmissionSpec.ts --bundle --platform=node --format=esm --outfile=/tmp/spec-front.mjs --log-level=error',
  { stdio: 'inherit' }
);
const front = await import(pathToFileURL('/tmp/spec-front.mjs').href);
const back = await import('../server/lib/contentSubmissionSpec.js');

grupo('1 · Topes iguales en las dos puntas (sin pared de 1 MB en ningún lado)');
for (const [lado, spec] of [['navegador', front], ['servidor', back]]) {
  check(`${lado}: foto hasta 5 MB`, spec.IMAGE_MAX_BYTES === 5 * 1048576, String(spec.IMAGE_MAX_BYTES));
  check(`${lado}: video hasta 300 MB`, spec.VIDEO_MAX_BYTES === 300 * 1048576, String(spec.VIDEO_MAX_BYTES));
}

grupo('2 · Matriz de tamaños: lo válido sube, el resto se explica');
const MB = 1048576;
const casosFoto = [
  [512 * 1024, true, '500 KB'],
  [1 * MB, true, '1 MB'],
  [3 * MB, true, '3 MB'],
  [Math.round(4.9 * MB), true, '4.9 MB'],
  [5 * MB, true, '5 MB exactos (borde incluido)'],
  [5 * MB + 1, false, '5.1 MB'],
];
for (const [size, esperado, etiqueta] of casosFoto) {
  for (const [lado, spec] of [['navegador', front], ['servidor', back]]) {
    const r = spec.checkFileMeta({ contentType: 'image/jpeg', filename: 'IMG_7213.JPG', size });
    check(`${lado}: foto ${etiqueta} → ${esperado ? 'pasa' : 'rechazada'}`, r.ok === esperado);
  }
}
const casosVideo = [
  [50 * MB, true, '50 MB'],
  [299 * MB, true, '299 MB'],
  [300 * MB, true, '300 MB exactos (borde incluido)'],
  [300 * MB + 1, false, 'más de 300 MB'],
];
for (const [size, esperado, etiqueta] of casosVideo) {
  for (const [lado, spec] of [['navegador', front], ['servidor', back]]) {
    const r = spec.checkFileMeta({ contentType: 'video/mp4', filename: 'clip.mp4', size });
    check(`${lado}: video ${etiqueta} → ${esperado ? 'pasa' : 'rechazado'}`, r.ok === esperado);
  }
}

grupo('3 · Mensaje de sobrepeso: nombre, peso real y tope');
for (const [lado, spec] of [['navegador', front], ['servidor', back]]) {
  const mFoto = spec.overweightMessage({ filename: 'IMG_7213.JPG', size: Math.round(5.1 * MB), kind: 'image' });
  check(`${lado}: foto dice nombre + peso + tope 5 MB`,
    mFoto.includes('IMG_7213.JPG') && mFoto.includes('5.1 MB') && mFoto.includes('5 MB'), mFoto);
  const mVideo = spec.overweightMessage({ filename: 'clip.mp4', size: 310 * MB, kind: 'video' });
  check(`${lado}: video dice nombre + peso + tope 300 MB`,
    mVideo.includes('clip.mp4') && mVideo.includes('310.0 MB') && mVideo.includes('300 MB'), mVideo);
  const r = spec.checkFileMeta({ contentType: 'image/jpeg', filename: 'IMG_1.JPG', size: Math.round(5.1 * MB) });
  check(`${lado}: checkFileMeta rechaza con ese mensaje`, r.ok === false && r.error.includes('IMG_1.JPG') && r.error.includes('5 MB'));
}

grupo('4 · Duplicados: identidad sin depender solo del nombre');
for (const [lado, spec] of [['navegador', front], ['servidor', back]]) {
  const a = { name: 'foto.jpg', size: 1000, type: 'image/jpeg', lastModified: 111 };
  const b = { name: 'foto.jpg', size: 1000, type: 'image/jpeg', lastModified: 111 };
  const c = { name: 'foto.jpg', size: 2000, type: 'image/jpeg', lastModified: 111 };
  const d = { name: 'foto.jpg', size: 1000, type: 'image/jpeg', lastModified: 222 };
  check(`${lado}: mismo archivo ⇒ misma llave`, spec.duplicateKey(a) === spec.duplicateKey(b));
  check(`${lado}: distinto tamaño ⇒ distinta llave`, spec.duplicateKey(a) !== spec.duplicateKey(c));
  check(`${lado}: distinta fecha ⇒ distinta llave`, spec.duplicateKey(a) !== spec.duplicateKey(d));
  check(`${lado}: aviso de duplicado exacto`, spec.DUPLICATE_MESSAGE === 'Este archivo ya fue agregado. No puedes cargar el mismo archivo dos veces.');
}

grupo('5 · Huella parcial: mismo contenido aunque cambie el nombre');
{
  const bytes = new Uint8Array(600 * 1024);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  const f1 = new Blob([bytes], { type: 'image/jpeg' });
  const f2 = new Blob([bytes], { type: 'image/jpeg' });
  const otros = new Uint8Array(600 * 1024);
  for (let i = 0; i < otros.length; i++) otros[i] = (i * 7) % 251;
  const f3 = new Blob([otros], { type: 'image/jpeg' });
  const h1 = await front.partialFileHash(f1);
  const h2 = await front.partialFileHash(f2);
  const h3 = await front.partialFileHash(f3);
  check('mismo contenido ⇒ mismo hash', h1 === h2 && h1.length === 64);
  check('distinto contenido ⇒ distinto hash', h1 !== h3);
  // Solo se leen 256 KB aunque el archivo pese 300 MB: el hash de un video
  // grande es igual al de su cabeza.
  const cabeza = new Blob([bytes.slice(0, 262144)], { type: 'image/jpeg' });
  check('la huella sale de los primeros 256 KB', (await front.partialFileHash(cabeza)) === h1);
}

grupo('6 · El mínimo cuenta solo lo cargado con éxito');
{
  const items = [
    { kind: 'image', estado: 'uploaded' }, { kind: 'image', estado: 'uploaded' },
    { kind: 'image', estado: 'uploaded' }, { kind: 'image', estado: 'uploaded' },
    { kind: 'image', estado: 'error' },
    { kind: 'video', estado: 'uploaded' },
    { kind: 'image', estado: 'too-heavy' }, { kind: 'image', estado: 'duplicate' },
    { kind: 'image', estado: 'pending' }, { kind: 'image', estado: 'uploading' },
  ];
  for (const [lado, spec] of [['navegador', front], ['servidor', back]]) {
    check(`${lado}: 5 elegidas con 1 fallida ⇒ 4 válidas`, spec.countValidPhotos(items) === 4);
  }
  check('vacío ⇒ 0', front.countValidPhotos([]) === 0);
}

grupo('7 · Cableado: estados, reintento solo recuperable y cola');
{
  const form = readFileSync('src/components/rotary/RotaryEnAccionForm.tsx', 'utf8');
  for (const e of ['pending', 'uploading', 'uploaded', 'error', 'too-heavy', 'duplicate']) {
    check(`la tarjeta pinta «${e}»`, form.includes(`'${e}'`));
  }
  check('reintentar exige estado error', /if \(!item \|\| item\.estado !== 'error'\) return/.test(form));
  check('lo pesado/duplicado nunca llama a subir', !/too-heavy[\s\S]{0,300}iniciarSubida|duplicate[\s\S]{0,300}iniciarSubida/.test(form.replace(/bombearCola[\s\S]*/, '')));
  check('cola de 3 subidas simultáneas', /MAX_SUBIDAS_SIMULTANEAS = 3/.test(form));
  check('la bomba solo arranca pendientes', /filter\(\(a\) => a\.estado === 'pending'\)/.test(form));
  check('el mínimo usa el conteo válido', /countValidPhotos\(adjuntos\)/.test(form));
  check('validar bloquea duplicados y pesados con su motivo', /estado === 'duplicate'/g.test(form) && /estado === 'too-heavy'/.test(form));
  check('eliminar quita también la huella', /hashesRef\.current\.delete\(id\)/.test(form));
  check('sin compresión: el PUT manda el archivo tal cual', /xhr\.send\(item\.file\)/.test(form) && !/canvas\.toBlob|toDataURL\(.*0\.[0-9]|drawImage/.test(form));
}

grupo('8 · Servidor: presign y head con los mismos topes');
{
  const files = readFileSync('server/lib/submissionFiles.js', 'utf8');
  check('presign valida con checkFileMeta (5 MB / 300 MB)', /checkFileMeta\(\{ contentType, filename, size \}\)/.test(files));
  check('head usa el mismo mensaje de sobrepeso', /overweightMessage\(\{ filename/.test(files));
  check('PUT prefirmado sin condición de tamaño (S3 no limita)', !/content-length-range/i.test(files));
}

console.log('\n' + '─'.repeat(60));
if (malos.length) {
  console.log(`❌ ${malos.length} fallo(s) de ${ok + malos.length}:`);
  for (const m of malos) console.log('   ·', m);
  process.exit(1);
}
console.log(`✅ ${ok} comprobaciones, todas en verde.`);
