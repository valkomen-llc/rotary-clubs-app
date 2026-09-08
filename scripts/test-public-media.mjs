// ════════════════════════════════════════════════════════════════════
// El acceso público a un archivo de la Biblioteca de Medios.
//
// El defecto que abrió esto: un PDF daba `AccessDenied` en el móvil y abría
// bien en el escritorio. Medido contra el bucket real, la clave en NFD
// respondía 200 y la MISMA en NFC, 403 — o sea que no era un permiso, era una
// clave que no existe disfrazada de 403 porque el bucket no concede listar.
//
// Se prueba el CRITERIO y el CAMINO. El criterio puede quedar intacto mientras
// alguien vuelve a componer una clave con el nombre crudo, o mientras el
// endpoint pasa a contestar 403 sobre lo privado — y esos fallos son mudos.
//
// No necesita Postgres, credenciales ni red.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

let ok = 0, fail = 0;
const t = (nombre, fn) => {
    try { fn(); ok++; }
    catch (e) { fail++; console.error(`  ✗ ${nombre}\n    ${e.message}`); }
};
const grupo = (n) => console.log(`\n── ${n}`);
const leer = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
/** El archivo SIN comentarios: una regla no puede pasar por nombrarse a sí misma. */
const codigo = (p) => leer(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const HERE = pathToFileURL(`${process.cwd()}/`).href;
const STUB = new URL('./scripts/fixtures/db-public-media-stub.mjs', HERE).href;
register(
    `data:text/javascript,export async function resolve(s,c,n){return s.endsWith('/lib/db.js')?{url:${JSON.stringify(STUB)},shortCircuit:true}:n(s,c)}`,
    HERE
);

const M = await import('../server/lib/publicMedia.js');
const stub = await import(STUB);

// El caso REAL, con los bytes que tiene el objeto en producción.
// Las dos formas se derivan con `.normalize()` a proposito, no escribiendo dos
// literales que se ven iguales: un editor —o un formateador— puede normalizar
// el archivo y dejar los dos identicos, y entonces la prueba compararia una
// cosa consigo misma. Paso al escribir el arnes de punta a punta: el literal
// salio en NFC, el destino apunto a una clave que no existe y S3 contesto un
// 403 — o sea que reprodujo el defecto reportado sin querer.
const BASE = 'Carta_del_Gobernador_-_Edici\u00f3n,_Julio-Agosto_(Rotary_4281).pdf';
const NFD = BASE.normalize('NFD');
const NFC = BASE.normalize('NFC');
const CLAVE = `clubs/8aa470c5-0a5a-4a8d-b872-38645b8b9f3a/documents/1788906344509-${NFD}`;
const BUCKET = 'rotary-platform-assets';

// ── 1. La causa raíz: NFD y NFC tienen que dar la MISMA clave ──────────
grupo('1. La clave no puede depender de la normalización');

t('NFD y NFC dan el mismo nombre canónico', () => {
    assert.notStrictEqual(NFD, NFC, 'el fixture no está probando nada: son iguales');
    assert.strictEqual(M.canonicalObjectName(NFD), M.canonicalObjectName(NFC));
});
t('el nombre canónico es sólo [A-Za-z0-9._-]', () => {
    const c = M.canonicalObjectName(NFD);
    assert.match(c, /^[A-Za-z0-9._-]+$/, `salió «${c}»`);
});
t('no quedan tildes, comas ni paréntesis', () => {
    const c = M.canonicalObjectName(NFD);
    for (const malo of ['ó', '́', ',', '(', ')', ' ']) {
        assert.ok(!c.includes(malo), `«${malo}» sobrevivió en «${c}»`);
    }
});
t('conserva la extensión, en minúsculas', () => {
    assert.ok(M.canonicalObjectName(NFD).endsWith('.pdf'));
    assert.ok(M.canonicalObjectName('FOTO.JPEG').endsWith('.jpeg'));
});
t('un nombre entero de tildes no queda vacío', () => {
    assert.strictEqual(M.canonicalObjectName('áéí.pdf'), 'aei.pdf');
    assert.strictEqual(M.canonicalObjectName('...'), 'archivo');
});
t('la ñ no desaparece: pasa a n', () => {
    assert.strictEqual(M.canonicalObjectName('Niños.pdf'), 'Ninos.pdf');
});

// ── 2. Público y privado ───────────────────────────────────────────────
grupo('2. La clasificación public/private');

t('los prefijos privados son un catálogo cerrado', () => {
    assert.ok(Object.isFrozen(M.PRIVATE_PREFIXES));
    assert.ok(M.PRIVATE_PREFIXES.includes('private/'));
});
t('un comprobante de pago es privado', () => {
    assert.ok(M.isPrivateKey('private/event-receipts/2026/x.pdf'));
    assert.ok(M.isPrivateKey('private/campaign-submissions/a/b.jpg'));
    assert.ok(M.isPrivateKey('private/mail-attachments/z.pdf'));
});
t('un archivo de la Biblioteca no lo es', () => {
    assert.ok(!M.isPrivateKey(CLAVE));
    assert.ok(!M.isPrivateKey('clubs/x/images/logo.png'));
});
t('sin clave se toma por privado (el lado seguro)', () => {
    assert.ok(M.isPrivateKey(''));
    assert.ok(M.isPrivateKey(null));
});
t('lo efímero no es privado, y se distingue', () => {
    assert.ok(!M.isPrivateKey('public-tmp/foto.jpg'));
    assert.ok(M.isEphemeralKey('public-tmp/foto.jpg'));
    assert.strictEqual(M.servability({ s3Key: 'public-tmp/f.jpg' }).reason, 'efimero');
});
t('servability devuelve el motivo, no sólo el veredicto', () => {
    assert.strictEqual(M.servability(null).reason, 'no_existe');
    assert.strictEqual(M.servability({}).reason, 'sin_objeto');
    assert.strictEqual(M.servability({ s3Key: 'private/x.pdf' }).reason, 'privado');
    const bien = M.servability({ s3Key: CLAVE });
    assert.ok(bien.ok); assert.strictEqual(bien.key, CLAVE);
});

// ── 3. De la URL a la clave, sin normalizar ────────────────────────────
grupo('3. keyFromBucketUrl');

t('lee la clave de la URL con host de bucket', () => {
    const url = `https://${BUCKET}.s3.us-east-1.amazonaws.com/${CLAVE.split('/').map(encodeURIComponent).join('/')}`;
    assert.strictEqual(M.keyFromBucketUrl(url, { bucket: BUCKET }), CLAVE);
});
t('lee la clave con el bucket en la ruta', () => {
    const url = `https://s3.us-east-1.amazonaws.com/${BUCKET}/clubs/a/documents/x.pdf`;
    assert.strictEqual(M.keyFromBucketUrl(url, { bucket: BUCKET }), 'clubs/a/documents/x.pdf');
});
t('⚠️ NO normaliza: devuelve los bytes que venían', () => {
    const url = `https://${BUCKET}.s3.us-east-1.amazonaws.com/${CLAVE.split('/').map(encodeURIComponent).join('/')}`;
    const k = M.keyFromBucketUrl(url, { bucket: BUCKET });
    assert.ok(k.includes('́'), 'se recompuso la tilde: reintroduce el AccessDenied');
    assert.ok(!k.includes('ó'));
});
t('otro bucket no es nuestro', () => {
    assert.strictEqual(M.keyFromBucketUrl(`https://otro.s3.us-east-1.amazonaws.com/a.pdf`, { bucket: BUCKET }), null);
});
t('un dominio ajeno no se confunde con S3', () => {
    assert.strictEqual(M.keyFromBucketUrl('https://drive.google.com/x', { bucket: BUCKET }), null);
    assert.strictEqual(M.keyFromBucketUrl('https://s3.amazonaws.com.evil.io/a/b', { bucket: BUCKET }), null);
});
t('un percent-encoding roto no se adivina', () => {
    assert.strictEqual(M.keyFromBucketUrl(`https://${BUCKET}.s3.us-east-1.amazonaws.com/a%ZZb.pdf`, { bucket: BUCKET }), null);
});
t('pointsToOwnBucket reconoce el destino de la redirección reportada', () => {
    const url = `https://${BUCKET}.s3.us-east-1.amazonaws.com/clubs/a/documents/x.pdf`;
    assert.ok(M.pointsToOwnBucket(url, { bucket: BUCKET }));
    assert.ok(!M.pointsToOwnBucket('https://www.rotary4281.org/x', { bucket: BUCKET }));
});

// ── 4. La dirección estable ────────────────────────────────────────────
grupo('4. publicMediaPath');

t('sólo lleva el id: nada que normalizar', () => {
    const p = M.publicMediaPath('abc-123', NFD);
    assert.ok(!/[^\x20-\x7E]/.test(p), `salió Unicode crudo: ${p}`);
    assert.ok(p.startsWith('/api/public/media/abc-123/'));
});
t('el nombre de atrás es decorativo: el id manda', () => {
    assert.ok(M.publicMediaPath('abc-123', 'uno.pdf').startsWith('/api/public/media/abc-123/'));
    assert.ok(M.publicMediaPath('abc-123', 'otro.pdf').startsWith('/api/public/media/abc-123/'));
});
t('sin id no hay dirección', () => {
    assert.strictEqual(M.publicMediaPath(''), null);
    assert.strictEqual(M.publicMediaPath(null), null);
});

// ── 5. Cabeceras ───────────────────────────────────────────────────────
grupo('5. Content-Type y Content-Disposition');

t('un .pdf se sirve como application/pdf', () => {
    assert.strictEqual(M.contentTypeFor({ filename: NFD }), 'application/pdf');
    assert.strictEqual(M.contentTypeFor({ key: CLAVE }), 'application/pdf');
});
t('octet-stream del móvil no se toma por bueno', () => {
    assert.strictEqual(M.contentTypeFor({ contentType: 'application/octet-stream', filename: 'a.pdf' }), 'application/pdf');
});
t('el PDF va inline; un .docx, no', () => {
    assert.ok(M.isInlineType('application/pdf'));
    assert.ok(M.isInlineType('image/jpeg'));
    assert.ok(!M.isInlineType('application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
});
t('el disposition lleva las DOS formas del nombre', () => {
    const d = M.contentDispositionFor(NFD, { contentType: 'application/pdf' });
    assert.ok(d.startsWith('inline;'), d);
    assert.match(d, /filename="[A-Za-z0-9._-]+"/, 'falta el respaldo ASCII');
    assert.match(d, /filename\*=UTF-8''/, 'falta el nombre real');
});
t('?descargar=1 fuerza attachment', () => {
    assert.ok(M.contentDispositionFor('a.pdf', { download: true, contentType: 'application/pdf' }).startsWith('attachment;'));
});
t('lo que no se puede dibujar se baja', () => {
    assert.ok(M.contentDispositionFor('a.docx', { contentType: M.contentTypeFor({ filename: 'a.docx' }) }).startsWith('attachment;'));
});

// ── 6. El CAMINO: el endpoint de verdad ────────────────────────────────
grupo('6. El endpoint público (base sustituida)');

const { servePublicMedia, headPublicMedia } = await import('../server/controllers/publicMediaController.js');

const pedir = async (id, query = {}) => {
    const res = {
        _status: 200, _headers: {}, _json: null, _redirect: null, _ended: false,
        status(c) { this._status = c; return this; },
        json(o) { this._json = o; return this; },
        setHeader(k, v) { this._headers[k.toLowerCase()] = v; },
        redirect(c, u) { this._status = c; this._redirect = u; return this; },
        end() { this._ended = true; return this; },
    };
    await servePublicMedia({ params: { id }, query }, res);
    return res;
};

const FILA = { id: 'med-1', filename: NFD, url: '', type: 'document', bucket: BUCKET, region: 'us-east-1', s3Key: CLAVE };

await (async () => {
    stub.reset([FILA, { id: 'med-priv', filename: 'r.pdf', type: 'document', bucket: BUCKET, s3Key: 'private/event-receipts/r.pdf' }]);
    const r = await pedir('med-1');
    t('un documento público redirige (302)', () => {
        assert.strictEqual(r._status, 302, JSON.stringify(r._json));
        assert.ok(r._redirect, 'sin destino');
    });
    t('el 302 no se cachea: la firma caduca', () => {
        assert.strictEqual(r._headers['cache-control'], 'no-store');
    });
    t('⚠️ el destino conserva los bytes de la clave, sin recomponer', () => {
        const d = decodeURIComponent(new URL(r._redirect).pathname);
        assert.ok(d.includes('́'), `se normalizó: ${d}`);
    });
    // Sólo cuando de verdad se firmó: sin credenciales el camino degrada a la
    // URL pública, y entonces no hay parámetros de respuesta que comprobar.
    const firmado = String(r._redirect).includes('X-Amz-Signature');
    t('la firma impone el tipo y el nombre (el objeto puede no tener metadata)', () => {
        if (!firmado) return; // se comprueba en el entorno que sí puede firmar
        const q = new URL(r._redirect).searchParams;
        assert.strictEqual(q.get('response-content-type'), 'application/pdf');
        assert.ok(String(q.get('response-content-disposition')).startsWith('inline;'));
    });
    t('la firma es de vida corta y no se guarda en ninguna parte', () => {
        if (!firmado) return;
        const exp = Number(new URL(r._redirect).searchParams.get('X-Amz-Expires'));
        assert.ok(exp > 0 && exp <= 900, `caduca en ${exp}s`);
    });
})();

await (async () => {
    // El camino degradado: sin poder firmar, el enlace público se compone
    // desde los bytes guardados. Se comprueba sobre el archivo porque forzar
    // el fallo de la firma dentro del proceso apagaría el resto del grupo.
    const c = codigo('server/controllers/publicMediaController.js');
    t('sin credenciales degrada en vez de dejar el PDF sin abrir', () => {
        assert.match(c, /catch[\s\S]{0,400}encodeURIComponent/, 'no hay respaldo');
    });
    t('⚠️ el respaldo tampoco normaliza la clave', () => {
        assert.ok(!/\.normalize\(/.test(c), 'normalizar acá reintroduce el AccessDenied');
    });
})();

await (async () => {
    const r = await pedir('med-priv');
    t('⚠️ un archivo privado responde 404, NUNCA 403', () => {
        assert.strictEqual(r._status, 404, 'un 403 confirmaría que existe');
        assert.strictEqual(r._json.detail, 'privado');
    });
})();

await (async () => {
    const r = await pedir('no-existe');
    t('un id inventado responde 404', () => assert.strictEqual(r._status, 404));
})();

await (async () => {
    stub.reset([FILA]);
    await pedir('med-1');
    t('se consulta por id, con columnas NOMBRADAS (no SELECT *)', () => {
        const q = stub.CONSULTAS.at(-1);
        assert.match(q.text, /WHERE id = \$1/);
        assert.ok(!/SELECT \*/i.test(q.text), 'un SELECT * arrastra toda la tabla');
        for (const col of ['"s3Key"', 'filename', 'bucket']) {
            assert.ok(q.text.includes(col), `falta ${col} en el SELECT`);
        }
    });
})();

await (async () => {
    // Fila vieja: sólo `url`, sin s3Key. Tiene que servirse igual.
    stub.reset([{ id: 'med-viejo', filename: 'x.pdf', type: 'document', bucket: BUCKET,
        url: `https://${BUCKET}.s3.us-east-1.amazonaws.com/clubs/a/documents/x.pdf` }]);
    const r = await pedir('med-viejo');
    t('una fila sin s3Key se resuelve desde su url (sin migrar nada)', () => {
        assert.strictEqual(r._status, 302, JSON.stringify(r._json));
    });
})();

await (async () => {
    stub.reset([FILA]);
    const res = { _s: 200, _h: {}, status(c) { this._s = c; return this; },
        setHeader(k, v) { this._h[k.toLowerCase()] = v; }, end() { return this; } };
    await headPublicMedia({ params: { id: 'med-1' } }, res);
    t('HEAD dice el tipo sin descargar los 15 MB', () => {
        assert.strictEqual(res._s, 200);
        assert.strictEqual(res._h['content-type'], 'application/pdf');
        assert.ok(String(res._h['content-disposition']).startsWith('inline;'));
    });
})();

// ── 7. Invariantes sobre los archivos ──────────────────────────────────
grupo('7. Lo que no se puede volver a romper');

t('los TRES caminos de subida sanean la clave', () => {
    const c = codigo('server/routes/media.js');
    const claves = [...c.matchAll(/`clubs\/\$\{[^`]*?\}\/\$\{[^`]*?\}\/\$\{([^`]*?)\}`/g)];
    assert.ok(claves.length >= 2, `se encontraron ${claves.length} composiciones de clave`);
    assert.ok(!/originalname\.replace\(\/\\s\+\/g/.test(c) && !/fileName\.replace\(\/\\s\+\/g/.test(c),
        'volvió el saneado que sólo quitaba espacios');
    assert.strictEqual((c.match(/canonicalObjectName\(/g) || []).length, 3,
        'los tres caminos tienen que pasar por el criterio');
});
t('el controlador no lee una columna que Media no tiene', () => {
    const c = codigo('server/controllers/publicMediaController.js');
    assert.ok(!/row\.mimeType/.test(c), 'Media no tiene mimeType: daría undefined en silencio');
});
t('lo privado se contesta con 404 en el código, no con 403', () => {
    const c = codigo('server/controllers/publicMediaController.js');
    assert.ok(c.includes('status(404)'));
    assert.ok(!/status\(403\)/.test(c), 'un 403 sería un censo de documentos privados');
});
t('la firma NO se persiste: se genera al vuelo', () => {
    const c = codigo('server/controllers/publicMediaController.js');
    assert.ok(!/INSERT|UPDATE/.test(c), 'este endpoint no escribe nada');
    assert.ok(c.includes('getSignedUrl'));
});
t('la redirección traduce los destinos del bucket al leer, no por clic', () => {
    const c = codigo('server/lib/linkRedirectStore.js');
    assert.ok(c.includes('resolveBucketTargets'));
    assert.ok(/readRedirectsForHost[\s\S]*resolveBucketTargets|resolveBucketTargets[\s\S]*readRedirectsForHost/.test(c));
});
t('la Biblioteca comparte el enlace estable de un documento', () => {
    const c = codigo('src/pages/admin/MediaLibrary.tsx');
    assert.ok(c.includes('shareLinkFor'));
    assert.ok(!/copyToClipboard\(item\.url\)/.test(c), 'volvió a copiar la URL cruda de S3');
});

// ── 8. Paridad de los dos espejos ──────────────────────────────────────
grupo('8. Servidor y navegador dicen lo mismo');

let esbuild = null;
try { esbuild = (await import('esbuild')).default || await import('esbuild'); } catch { /* opcional */ }
if (!esbuild) {
    console.log('  (se salta: falta esbuild — npm i --no-save esbuild)');
} else {
    const out = esbuild.buildSync({
        entryPoints: ['src/lib/publicMedia.ts'], bundle: true, write: false,
        format: 'esm', platform: 'neutral',
    });
    const espejo = await import(`data:text/javascript,${encodeURIComponent(out.outputFiles[0].text)}`);

    const casos = [NFD, NFC, 'Niños (2026).PDF', 'a  b__c.pdf', 'áéí.pdf', '...', 'sin-extension'];
    t('canonicalObjectName da lo mismo en los dos', () => {
        for (const c of casos) {
            assert.strictEqual(espejo.canonicalObjectName(c), M.canonicalObjectName(c), `difieren en «${c}»`);
        }
    });
    t('publicMediaPath da lo mismo en los dos', () => {
        for (const c of casos) {
            assert.strictEqual(espejo.publicMediaPath('id-1', c), M.publicMediaPath('id-1', c), `difieren en «${c}»`);
        }
    });
    t('⚠️ el espejo NO trae el criterio de acceso', () => {
        for (const prohibido of ['servability', 'isPrivateKey', 'PRIVATE_PREFIXES']) {
            assert.strictEqual(espejo[prohibido], undefined,
                `«${prohibido}» en el navegador: quien decide el acceso es el servidor`);
        }
    });
}

console.log(`\n${fail ? '❌' : '✅'} test:public-media — ${ok} bien, ${fail} mal.`);
process.exit(fail ? 1 : 0);
