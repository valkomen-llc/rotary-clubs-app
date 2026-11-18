#!/usr/bin/env node
// Directorio de Clubes — números escritos como texto (v4.1336.0). Sin base ni red.
// El recorrido con Postgres real: `npm run test:club-directory:approve:e2e`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { foundationYearFrom: y, countFrom: c } = await import(`${REPO}/server/lib/clubProfileNumbers.js`);
let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const now = { now: new Date('2026-11-18T12:00:00Z') };
for (const [t, v] of [['15 de marzo de 1927', 1927], ['1927-03-15', 1927], ['15/03/1927', 1927], ['Fundado en 1954', 1954], ['1954', 1954], [' 1990 ', 1990], [1960, 1960]]) eq(y(t, now), v, `año de «${t}»`);
for (const t of ['', null, undefined, 'hace muchos años', '3027', '1899', '19271', 'abc', 2030, 1927.5, NaN]) eq(y(t, now), null, `sin año en «${t}»`);
for (const [t, v] of [['35 socios', 35], ['28', 28], ['1.200', 1200], ['41 activos', 41], [0, 0], [30, 30]]) eq(c(t), v, `socios de «${t}»`);
for (const t of ['', null, 'aprox. veinte', '-5', '12 a 15', -1, 2.5, NaN, '999999999999']) eq(c(t), null, `sin número en «${t}»`);
// Invariante: ningún `Number(…)` directo sobre los dos campos en el controlador.
const src = readFileSync(`${REPO}/server/controllers/districtClubsController.js`, 'utf8');
assert.ok(!/Number\((payload|body)\.(foundationYear|memberCount)\)/.test(src), 'el controlador no convierte con Number() el año ni los socios'); n++;
assert.equal((src.match(/foundationYearFrom\(/g) || []).length, 4, 'las cuatro escrituras usan foundationYearFrom'); n++;
assert.equal((src.match(/countFrom\(/g) || []).length, 4, 'las cuatro escrituras usan countFrom'); n++;
console.log(`✅ test:club-profile-numbers — ${n} comprobaciones.`);
