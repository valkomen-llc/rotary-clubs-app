#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// Por qué falló un mensaje de campaña — v4.1363.0
//
//   npm run test:whatsapp:campaign-failure
//
// Caso «Ver el video de invitación de John - 002»: 42 de 51 fallidos con el
// 131049 de Meta («healthy ecosystem engagement»), números +1 de EE. UU. y
// plantilla de marketing. Sin base ni red.
// ════════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    isUsNumber, isMarketingTemplate, classifyCampaignFailure, summarizeFailures,
} from '../server/lib/whatsappCampaignFailure.js';

let ok = 0; const malos = [];
const check = (n, c, extra = '') => { if (c) { ok++; console.log('  ✓', n); } else { malos.push(n); console.log('  ✗', n, extra ? `— ${extra}` : ''); } };
const leer = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const META = 'In order to maintain a healthy ecosystem engagement, the message failed to be delivered.';
const NOW = Date.parse('2026-11-27T20:00:00Z');

console.log('\n1. Números de Estados Unidos');
check('18054022370 es de EE. UU.', isUsNumber('18054022370'));
check('+1 (207) 595-1138 es de EE. UU.', isUsNumber('+1 (207) 595-1138'));
check('un +1 de Canadá no', !isUsNumber('14165551234', 'CA'));
check('un móvil colombiano no', !isUsNumber('573216937317'));
check('un 1 de 10 dígitos no', !isUsNumber('1805402237'));
check('sin categoría, la plantilla cuenta como marketing (el valor por defecto de la tabla)', isMarketingTemplate(null) && isMarketingTemplate('marketing') && !isMarketingTemplate('UTILITY'));

console.log('\n2. Clasificación');
const us = classifyCampaignFailure({ errorMessage: `131049 ${META}`, phone: '18054022370', templateCategory: 'MARKETING', failedAt: '2026-11-27T19:01:00Z', now: NOW });
check('131049 + número +1 + marketing → bloqueo de Meta a EE. UU.', us.kind === 'meta_us_marketing', us.kind);
check('… no se reintenta ni se ofrece «Corregir número»', us.retryable === false && us.canFixNumber === false);
check('… y dice qué sí funciona (utilidad o 24 h)', /UTILIDAD/.test(us.action) && /24 horas/.test(us.action));
const usOld = classifyCampaignFailure({ errorMessage: META, phone: '18054022370', templateCategory: 'MARKETING', failedAt: '2026-11-01T00:00:00Z', now: NOW });
check('… tampoco después de 24 h: la pausa no se levanta sola', usOld.retryable === false);
const usUtility = classifyCampaignFailure({ errorMessage: META, phone: '18054022370', templateCategory: 'UTILITY', failedAt: '2026-11-27T19:01:00Z', now: NOW });
check('con plantilla de UTILIDAD el 131049 es el límite general, no el de EE. UU.', usUtility.kind === 'meta_marketing_limit');
const co = classifyCampaignFailure({ errorMessage: META, phone: '573001234567', templateCategory: 'MARKETING', failedAt: '2026-11-27T19:01:00Z', now: NOW });
check('131049 en Colombia → límite de marketing, sin reintento antes de 24 h', co.kind === 'meta_marketing_limit' && co.retryable === false && !co.canFixNumber);
const coOld = classifyCampaignFailure({ errorMessage: META, phone: '573001234567', templateCategory: 'MARKETING', failedAt: '2026-11-25T19:01:00Z', now: NOW });
check('… pasadas 24 h sí se puede reintentar', coOld.retryable === true);
check('sin fecha de fallo, no se reintenta (prudente)', classifyCampaignFailure({ errorMessage: META, phone: '573001234567' }).retryable === false);
const exp = classifyCampaignFailure({ errorMessage: 'Message failed to send because the user is part of an experiment', phone: '573001234567' });
check('grupo de control de Meta → no se reintenta', exp.kind === 'meta_experiment' && !exp.retryable && !exp.canFixNumber);
const inv = classifyCampaignFailure({ errorMessage: 'Número inválido: longitud inválida', phone: '57300' });
check('número inválido → «Corregir número» y reintento', inv.kind === 'invalid_phone' && inv.canFixNumber && inv.retryable);
const otro = classifyCampaignFailure({ errorMessage: 'Something else', phone: '573001234567' });
check('otro error → se puede reintentar y se muestra lo que dijo Meta', otro.kind === 'other' && otro.retryable && /Something else/.test(otro.explanation));
const sum = summarizeFailures([
    { errorMessage: META, phone: '18054022370' }, { errorMessage: META, phone: '12075951138' },
    { errorMessage: META, phone: '573001234567', failedAt: '2026-11-27T19:00:00Z' }, { errorMessage: 'x', phone: '573001234567' },
], { templateCategory: 'MARKETING', now: NOW });
check('el resumen cuenta por tipo', sum.meta_us_marketing === 2 && sum.meta_marketing_limit === 1 && sum.other === 1 && sum.notRetryable === 3, JSON.stringify(sum));

console.log('\n3. Dónde se usa');
const ctl = leer('server/controllers/crmController.js');
check('el seguimiento manda el motivo de cada fallo', /failure: classifyCampaignFailure\(/.test(ctl));
check('el reintento omite lo que Meta volvería a rechazar', /!alreadySentIds\.has\(c\.id\) && !blockedIds\.has\(c\.id\)/.test(ctl) && /skippedPolicy: blockedIds\.size/.test(ctl));
check('la verificación previa avisa de los +1 con plantilla de marketing', /breakdown\.usMarketingBlocked = isMarketingTemplate/.test(ctl) && /warnings,/.test(ctl));
check('ninguna comilla invertida dentro de un db.query del criterio nuevo', !/db\.query\(\s*`[^`]*\\`/.test(leer('server/lib/whatsappCampaignFailure.js')));
const ui = leer('src/components/admin/whatsapp/WhatsAppCampaigns.tsx');
check('«Corregir número» sólo cuando el número puede ser el problema', /l\.status === 'failed' && \(!l\.failure \|\| l\.failure\.canFixNumber\) &&/.test(ui));
check('la fila muestra el motivo y qué hacer', /l\.failure\.title/.test(ui) && /l\.failure\.action/.test(ui));
check('«Reintentar fallidos» se apaga si nada se puede reintentar', /disabled=\{retrying \|\| retryableFailed === 0\}/.test(ui));
check('el aviso de la política de Meta encima de la tabla', /usBlocked > 0 \|\| metaLimited > 0/.test(ui));
check('la verificación previa se abre también por los +1', /data\.stats\.usMarketingBlocked > 0/.test(ui) && /preflightData\.warnings/.test(ui));

console.log(`\n${malos.length ? '❌' : '✅'} test:whatsapp:campaign-failure — ${ok} pasaron, ${malos.length} fallaron.`);
process.exit(malos.length ? 1 : 0);
