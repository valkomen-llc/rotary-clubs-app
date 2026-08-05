// ════════════════════════════════════════════════════════════════════
// La sede de un evento — pruebas del CRITERIO — v4.717
//
// Sin base, sin credenciales y sin red: se prueba qué se acepta, qué se
// normaliza y qué se rechaza, separado de cómo se dibuja.
//
//   npm run test:event-venue
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const out = await build({
    entryPoints: ['src/lib/eventVenue.ts'],
    bundle: true, write: false, format: 'esm', platform: 'neutral',
});
const mod = await import(`data:text/javascript,${encodeURIComponent(out.outputFiles[0].text)}`);
const { normalizeVenue, normalizeMapUrl, normalizeWebsite, websiteLabel, venueHasContent, telHref } = mod;

let ok = 0; const malos = [];
const check = (n, c, e = '') => {
    if (c) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${e ? ` — ${e}` : ''}`); }
};
const grupo = t => console.log(`\n${t}`);

// El iframe tal como lo entrega Google, que es lo que el administrador pega.
const IFRAME = '<iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d5036.6!2d-73.26!3d10.49!5e1!3m2!1ses!2sco" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>';

grupo('El mapa se pega como venga');
check('del <iframe> completo se toma el src',
    normalizeMapUrl(IFRAME).startsWith('https://www.google.com/maps/embed?pb='), normalizeMapUrl(IFRAME));
check('y conserva los parámetros del mapa', normalizeMapUrl(IFRAME).includes('!3d10.49'));
check('una dirección suelta también vale',
    normalizeMapUrl('https://www.google.com/maps/embed?pb=!1m18') !== '');
check('maps.google.com con output=embed también',
    normalizeMapUrl('https://maps.google.com/maps?q=Sonesta&output=embed') !== '');
check('un campo vacío no deja mapa', normalizeMapUrl('') === '');
check('espacios alrededor no molestan', normalizeMapUrl(`  ${IFRAME}  `) !== '');

grupo('Lo que NO se admite como mapa');
check('otro dominio se rechaza',
    normalizeMapUrl('<iframe src="https://evil.example.com/x"></iframe>') === '', 'dominio ajeno');
check('http sin cifrar se rechaza',
    normalizeMapUrl('http://www.google.com/maps/embed?pb=1') === '');
check('javascript: se rechaza',
    normalizeMapUrl('javascript:alert(1)') === '');
check('data: se rechaza', normalizeMapUrl('data:text/html,<script>') === '');
check('una URL de Google que no es un mapa se rechaza',
    normalizeMapUrl('https://www.google.com/search?q=hotel') === '');
check('texto suelto se rechaza', normalizeMapUrl('el hotel queda en la 16') === '');

grupo('El sitio web');
check('se admite escribirlo sin esquema',
    normalizeWebsite('www.sonestavalledupar.com') === 'https://www.sonestavalledupar.com/');
check('con https se respeta',
    normalizeWebsite('https://www.sonestavalledupar.com/') === 'https://www.sonestavalledupar.com/');
check('se muestra sin esquema ni barra final',
    websiteLabel('https://www.sonestavalledupar.com/') === 'www.sonestavalledupar.com');
check('vacío es vacío', normalizeWebsite('') === '');

grupo('Los contactos');
const venue = normalizeVenue({
    name: '  Sonesta Hotel Valledupar  ',
    address: 'Valledupar, Colombia',
    website: 'www.sonestavalledupar.com',
    mapUrl: IFRAME,
    contacts: [
        { name: 'Andreina Milagros Saurith Fuentes', role: 'Commercial Coordinator',
          email: 'ANDREINA.SAURITH@HOTELES.COM', mobile: '300 248 7730', phone: '6055748686' },
        { name: '', role: '', email: '', phone: '', mobile: '' },
        { name: 'Otro contacto' },
    ],
});
check('el nombre se recorta', venue.name === 'Sonesta Hotel Valledupar', `«${venue.name}»`);
check('el correo se guarda en minúsculas',
    venue.contacts[0].email === 'andreina.saurith@hoteles.com');
check('un contacto totalmente vacío se descarta', venue.contacts.length === 2, String(venue.contacts.length));
check('un contacto con sólo nombre se conserva', venue.contacts[1].name === 'Otro contacto');
check('el mapa quedó normalizado', venue.mapUrl.startsWith('https://www.google.com/maps/embed'));
check('y el sitio web también', venue.website === 'https://www.sonestavalledupar.com/');

const muchos = normalizeVenue({ contacts: Array.from({ length: 12 }, (_, i) => ({ name: `C${i}` })) });
check('no se guardan más de seis contactos', muchos.contacts.length === 6, String(muchos.contacts.length));

grupo('Cuándo se dibuja la sede');
check('sin nada, no se dibuja', venueHasContent(normalizeVenue({})) === false);
check('sin nada tampoco con datos vacíos',
    venueHasContent(normalizeVenue({ name: '  ', contacts: [{}] })) === false);
check('sólo con la foto ya se dibuja',
    venueHasContent(normalizeVenue({ image: 'https://x/y.jpg' })) === true);
check('sólo con el mapa también',
    venueHasContent(normalizeVenue({ mapUrl: IFRAME })) === true);
check('sólo con un contacto también',
    venueHasContent(normalizeVenue({ contacts: [{ email: 'a@b.com' }] })) === true);

grupo('Teléfonos');
check('el marcador quita los espacios', telHref('300 248 7730') === 'tel:3002487730');
check('y conserva el indicativo', telHref('+57 300 248 7730') === 'tel:+573002487730');

grupo('Nada de esto rompe con datos ausentes');
check('undefined da una sede vacía', venueHasContent(normalizeVenue(undefined)) === false);
check('null también', venueHasContent(normalizeVenue(null)) === false);
check('un contacts que no es lista no rompe',
    normalizeVenue({ contacts: 'nada' }).contacts.length === 0);

// El componente público no puede quedarse sin la guarda de contenido.
const card = readFileSync('src/components/EventVenueCard.tsx', 'utf8');
check('la ficha no se dibuja si la sede está vacía', card.includes('venueHasContent'));
check('y el mapa va con referrerPolicy', card.includes('strict-origin-when-cross-origin'));

console.log(`\n${ok}/${ok + malos.length} comprobaciones OK`);
if (malos.length) { console.log(malos.map(m => `  - ${m}`).join('\n')); process.exit(1); }
