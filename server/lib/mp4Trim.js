// ════════════════════════════════════════════════════════════════════
// Recorte del FINAL de un MP4 sin mover los bytes del video — v4.936
//
// POR QUÉ EXISTE. El recorte con ffmpeg necesita el RESULTADO en el disco
// temporal de la función, que en serverless tiene 512 MB y no es configurable.
// Una grabación de 2:20 h (~600 MB) no entra por ninguna vía que pase los
// bytes por la función. La salida estructural: para quitar el FINAL de un MP4
// no hace falta tocar los bytes de video — alcanza con REESCRIBIR EL ÍNDICE
// (la caja `moov`: unos pocos MB) y TRUNCAR el cuerpo (`mdat`). El cuerpo se
// copia de objeto a objeto DENTRO de S3 con UploadPartCopy: por la función
// sólo pasan la cabecera y el plan.
//
// QUÉ HACE ESTE MÓDULO. Dado un lector por rangos (`readRange`) y el punto de
// corte, devuelve el PLAN del archivo nuevo: los bytes reescritos (cabecera,
// moov editado, header del mdat) y los RANGOS del original que se copian tal
// cual. No toca S3 ni disco: la I/O la pone quien llama — por eso se puede
// probar entero contra un archivo local, que es como está probado
// (`npm run test:mp4-trim`, con MP4s reales generados por ffmpeg).
//
// QUÉ NO HACE. No recorta el INICIO (eso desplaza todos los offsets y exige
// alinear a keyframes — es otro proyecto), no toca WebM, y ante cualquier
// rasgo que no sabe editar con certeza (fragmentado, cifrado, varios mdat,
// edit lists complejas, stz2) SE NIEGA con el motivo en vez de producir un
// archivo dudoso: un contenedor corrupto servido en el enlace de una campaña
// es el peor resultado posible, y para eso está el bail.
//
// La VALIDACIÓN final no es de este módulo: quien ensambla decodifica el
// resultado con ffmpeg (inicio y final, leyendo de la URL) antes de
// reemplazar nada.
// ════════════════════════════════════════════════════════════════════

const MAX_MOOV_BYTES = 64 * 1024 * 1024; // un moov de más de 64 MB no es un video normal

// ─── Lectura de cajas ──────────────────────────────────────────────────────

const u32 = (b, o) => b.readUInt32BE(o);
const u64 = (b, o) => Number(b.readBigUInt64BE(o));

/** Cajas de primer nivel, leyendo SÓLO cabeceras por rangos (16 B por caja). */
export const readTopBoxes = async (readRange, fileSize) => {
    const boxes = [];
    let pos = 0;
    while (pos + 8 <= fileSize) {
        const head = await readRange(pos, Math.min(pos + 16, fileSize));
        const size32 = u32(head, 0);
        const type = head.toString('latin1', 4, 8);
        let size = size32;
        let headerLen = 8;
        if (size32 === 1) {
            if (head.length < 16) return { ok: false, reason: 'Cabecera de caja incompleta.' };
            size = u64(head, 8);
            headerLen = 16;
        } else if (size32 === 0) {
            size = fileSize - pos; // «hasta el final del archivo»
        }
        if (size < headerLen || pos + size > fileSize) {
            return { ok: false, reason: `La caja «${type}» declara un tamaño inválido.` };
        }
        boxes.push({ type, start: pos, size, headerLen, dataStart: pos + headerLen });
        pos += size;
    }
    if (pos !== fileSize) return { ok: false, reason: 'El archivo tiene bytes sueltos fuera de toda caja.' };
    return { ok: true, boxes };
};

/** Árbol de cajas SOBRE UN BUFFER (para el moov, que ya está en memoria). */
const parseChildren = (buf, start, end) => {
    const out = [];
    let pos = start;
    while (pos + 8 <= end) {
        const size32 = u32(buf, pos);
        const type = buf.toString('latin1', pos + 4, pos + 8);
        let size = size32, headerLen = 8;
        if (size32 === 1) { size = u64(buf, pos + 8); headerLen = 16; }
        else if (size32 === 0) { size = end - pos; }
        if (size < headerLen || pos + size > end) break;
        out.push({ type, start: pos, size, headerLen, dataStart: pos + headerLen, end: pos + size });
        pos += size;
    }
    return out;
};

const findChild = (children, type) => children.find(c => c.type === type) || null;
const slice = (buf, box) => buf.subarray(box.start, box.end);

// ─── Escritura de cajas ────────────────────────────────────────────────────

const boxOf = (type, ...payloads) => {
    const len = 8 + payloads.reduce((a, p) => a + p.length, 0);
    const head = Buffer.alloc(8);
    head.writeUInt32BE(len, 0);
    head.write(type, 4, 'latin1');
    return Buffer.concat([head, ...payloads], len);
};

const u32buf = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n, 0); return b; };
const fullHeader = () => Buffer.alloc(4); // versión 0, flags 0

// ─── Tablas de muestras: lectura y truncado ────────────────────────────────

const readEntries32 = (buf, box, perEntry) => {
    const count = u32(buf, box.dataStart + 4);
    const base = box.dataStart + 8;
    if (base + count * perEntry * 4 > box.end) return null;
    const rows = [];
    for (let i = 0; i < count; i++) {
        const row = [];
        for (let j = 0; j < perEntry; j++) row.push(u32(buf, base + (i * perEntry + j) * 4));
        rows.push(row);
    }
    return rows;
};

const buildTable32 = (type, rows) => {
    const flat = rows.flat();
    const body = Buffer.alloc(4 + flat.length * 4);
    body.writeUInt32BE(rows.length, 0);
    flat.forEach((n, i) => body.writeUInt32BE(n >>> 0, 4 + i * 4));
    return boxOf(type, fullHeader(), body);
};

/** stts truncado en `limit` unidades de tiempo del track. */
const cutStts = (rows, limit) => {
    let kept = 0, dur = 0;
    const out = [];
    for (const [count, delta] of rows) {
        if (delta <= 0) { out.push([count, delta]); kept += count; continue; }
        const fits = Math.floor((limit - dur) / delta);
        const take = Math.min(count, Math.max(0, fits));
        if (take > 0) { out.push([take, delta]); kept += take; dur += take * delta; }
        if (take < count) break;
    }
    return { rows: out, keptSamples: kept, mediaDuration: dur };
};

/** Trunca una tabla de corridas (ctts) a `keptSamples` muestras. */
const cutRuns = (rows, keptSamples) => {
    const out = [];
    let seen = 0;
    for (const [count, value] of rows) {
        if (seen >= keptSamples) break;
        const take = Math.min(count, keptSamples - seen);
        out.push([take, value]);
        seen += take;
    }
    return out;
};

// stbl: qué se conserva, qué se trunca, qué se descarta y qué obliga a
// negarse. Descartar una caja OPCIONAL (grupos de muestras, dependencias) es
// legal — los reproductores las ignoran—; una que gobierna bytes (cifrado,
// tamaños compactos) no se puede descartar ni editar a ciegas.
const STBL_KEEP = new Set(['stsd']);
const STBL_DROP = new Set(['sgpd', 'sbgp', 'sdtp', 'padb', 'stdp', 'subs', 'cslg', 'stsh']);
const STBL_BAIL = new Set(['stz2', 'saiz', 'saio', 'senc']);

// ─── Duraciones: parcheo respetando la versión de cada caja ────────────────

const patchDuration = (bufBox, kind, newDuration) => {
    const b = Buffer.from(bufBox); // copia: el original no se toca
    const version = b[8];
    // offset del campo duration desde el inicio del PAYLOAD (tras ver/flags)
    const spec = {
        mvhd: { v0: 12, v1: 20 }, tkhd: { v0: 16, v1: 24 }, mdhd: { v0: 12, v1: 20 },
    }[kind];
    const at = 8 + 4 + (version === 1 ? spec.v1 : spec.v0);
    if (version === 1) b.writeBigUInt64BE(BigInt(Math.round(newDuration)), at);
    else b.writeUInt32BE(Math.min(0xFFFFFFFF, Math.round(newDuration)), at);
    return b;
};

const readTimescaleAndDuration = (buf, box) => {
    const version = buf[box.start + 8];
    const p = box.dataStart + 4;
    if (version === 1) return { timescale: u32(buf, p + 16), duration: u64(buf, p + 20) };
    return { timescale: u32(buf, p + 8), duration: u32(buf, p + 12) };
};

/** elst de UNA entrada: se le reescribe la duración del segmento. */
const patchElst = (buf, edtsBox, newTkhdDuration) => {
    const children = parseChildren(buf, edtsBox.dataStart, edtsBox.end);
    const elst = findChild(children, 'elst');
    if (!elst) return { ok: true, buffer: slice(buf, edtsBox) };
    const version = buf[elst.start + 8];
    const count = u32(buf, elst.dataStart + 4);
    if (count !== 1) return { ok: false, reason: 'El video tiene una lista de edición con varios segmentos.' };
    const copy = Buffer.from(slice(buf, edtsBox));
    const at = (elst.start - edtsBox.start) + (elst.headerLen + 4 + 4);
    if (version === 1) copy.writeBigUInt64BE(BigInt(Math.round(newTkhdDuration)), at);
    else copy.writeUInt32BE(Math.min(0xFFFFFFFF, Math.round(newTkhdDuration)), at);
    return { ok: true, buffer: copy };
};

// ─── El corte de un track ──────────────────────────────────────────────────

/**
 * Trunca las tablas de un track en el tiempo `endSec` y devuelve las cajas
 * nuevas del stbl, la duración real conservada y hasta qué byte del archivo
 * llegan sus muestras conservadas.
 */
const cutTrack = (buf, trak, endSec, delta) => {
    const mdia = findChild(parseChildren(buf, trak.dataStart, trak.end), 'mdia');
    if (!mdia) return { ok: false, reason: 'Track sin mdia.' };
    const mdiaKids = parseChildren(buf, mdia.dataStart, mdia.end);
    const mdhd = findChild(mdiaKids, 'mdhd');
    const hdlr = findChild(mdiaKids, 'hdlr');
    const minf = findChild(mdiaKids, 'minf');
    if (!mdhd || !minf) return { ok: false, reason: 'Track sin mdhd o minf.' };
    const handler = hdlr ? buf.toString('latin1', hdlr.dataStart + 8, hdlr.dataStart + 12) : '????';

    const stbl = findChild(parseChildren(buf, minf.dataStart, minf.end), 'stbl');
    if (!stbl) return { ok: false, reason: 'Track sin stbl.' };
    const kids = parseChildren(buf, stbl.dataStart, stbl.end);

    for (const k of kids) {
        if (STBL_BAIL.has(k.type)) return { ok: false, reason: `El video usa «${k.type}» (${k.type === 'stz2' ? 'tamaños compactos' : 'cifrado'}), que no se puede editar con certeza.` };
    }

    const { timescale } = readTimescaleAndDuration(buf, mdhd);
    if (!timescale) return { ok: false, reason: 'Track sin timescale.' };

    const sttsBox = findChild(kids, 'stts');
    const stszBox = findChild(kids, 'stsz');
    const stscBox = findChild(kids, 'stsc');
    const stcoBox = findChild(kids, 'stco') || findChild(kids, 'co64');
    if (!sttsBox || !stszBox || !stscBox || !stcoBox) {
        return { ok: false, reason: 'Track sin tablas de muestras completas.' };
    }
    const is64 = stcoBox.type === 'co64';

    // stts → cuántas muestras se conservan y cuánto dura de verdad lo conservado
    const sttsRows = readEntries32(buf, sttsBox, 2);
    if (!sttsRows) return { ok: false, reason: 'stts ilegible.' };
    const limit = Math.floor(endSec * timescale);
    const cut = cutStts(sttsRows, limit);
    if (cut.keptSamples < 1) {
        return { ok: false, reason: `El corte deja sin muestras a una pista (${handler}).`, emptyTrack: handler };
    }
    const keptN = cut.keptSamples;

    // stsz — tamaño uniforme o tabla
    const sampleSizeUniform = u32(buf, stszBox.dataStart + 4);
    const totalSamples = u32(buf, stszBox.dataStart + 8);
    if (keptN > totalSamples) return { ok: false, reason: 'stts y stsz no concuerdan.' };
    const sizeOf = (i /* 0-based */) => sampleSizeUniform !== 0
        ? sampleSizeUniform
        : u32(buf, stszBox.dataStart + 12 + i * 4);
    let newStsz;
    if (sampleSizeUniform !== 0) {
        const body = Buffer.alloc(8);
        body.writeUInt32BE(sampleSizeUniform, 0);
        body.writeUInt32BE(keptN, 4);
        newStsz = boxOf('stsz', fullHeader(), body);
    } else {
        const body = Buffer.alloc(8 + keptN * 4);
        body.writeUInt32BE(0, 0);
        body.writeUInt32BE(keptN, 4);
        buf.copy(body, 8, stszBox.dataStart + 12, stszBox.dataStart + 12 + keptN * 4);
        newStsz = boxOf('stsz', fullHeader(), body);
    }

    // stsc + stco → en qué chunk cae la última muestra conservada
    const stscRows = readEntries32(buf, stscBox, 3);
    const chunkCount = u32(buf, stcoBox.dataStart + 4);
    if (!stscRows || !chunkCount) return { ok: false, reason: 'stsc/stco ilegibles.' };
    const chunkOffset = (c /* 1-based */) => is64
        ? u64(buf, stcoBox.dataStart + 8 + (c - 1) * 8)
        : u32(buf, stcoBox.dataStart + 8 + (c - 1) * 4);

    let sampleCursor = 0, lastChunk = 0, samplesInLastChunk = 0, firstSampleOfLastChunk = 0;
    outer:
    for (let e = 0; e < stscRows.length; e++) {
        const [firstChunk, spc] = stscRows[e];
        const nextFirst = e + 1 < stscRows.length ? stscRows[e + 1][0] : chunkCount + 1;
        for (let c = firstChunk; c < nextFirst; c++) {
            if (c > chunkCount) break outer;
            if (sampleCursor + spc >= keptN) {
                lastChunk = c;
                firstSampleOfLastChunk = sampleCursor;
                samplesInLastChunk = keptN - sampleCursor;
                break outer;
            }
            sampleCursor += spc;
        }
    }
    if (!lastChunk) return { ok: false, reason: 'Las tablas de chunks no cubren las muestras conservadas.' };

    // Hasta qué byte llega lo conservado de ESTE track
    let end = chunkOffset(lastChunk);
    for (let i = 0; i < samplesInLastChunk; i++) end += sizeOf(firstSampleOfLastChunk + i);

    // stsc nuevo: corridas hasta lastChunk, con el último chunk a su medida
    const newStscRows = [];
    let cursor = 0;
    outer2:
    for (let e = 0; e < stscRows.length; e++) {
        const [firstChunk, spc, sdidx] = stscRows[e];
        const nextFirst = e + 1 < stscRows.length ? stscRows[e + 1][0] : chunkCount + 1;
        for (let c = firstChunk; c < nextFirst && c <= lastChunk; c++) {
            const take = (c === lastChunk) ? samplesInLastChunk : spc;
            const prev = newStscRows[newStscRows.length - 1];
            if (prev && prev[1] === take && prev[2] === sdidx) { /* misma corrida */ }
            else newStscRows.push([c, take, sdidx]);
            cursor += take;
            if (c === lastChunk) break outer2;
        }
    }
    if (cursor !== keptN) return { ok: false, reason: 'El recuento de muestras por chunk no cierra.' };

    // stco/co64 nuevo, con el desplazamiento aplicado (delta puede ser 0)
    let newStco;
    if (is64) {
        const body = Buffer.alloc(4 + lastChunk * 8);
        body.writeUInt32BE(lastChunk, 0);
        for (let c = 1; c <= lastChunk; c++) body.writeBigUInt64BE(BigInt(chunkOffset(c) + delta), 4 + (c - 1) * 8);
        newStco = boxOf('co64', fullHeader(), body);
    } else {
        const rows = [];
        for (let c = 1; c <= lastChunk; c++) {
            const v = chunkOffset(c) + delta;
            if (v < 0 || v > 0xFFFFFFFF) return { ok: false, reason: 'Un offset desplazado no entra en stco.' };
            rows.push([v]);
        }
        newStco = buildTable32('stco', rows);
    }

    // stss / ctts / sdtp truncados
    const stssBox = findChild(kids, 'stss');
    let newStss = null;
    if (stssBox) {
        const rows = (readEntries32(buf, stssBox, 1) || []).filter(([s]) => s <= keptN);
        if (!rows.length) return { ok: false, reason: 'El corte deja al video sin ningún keyframe.' };
        newStss = buildTable32('stss', rows);
    }
    const cttsBox = findChild(kids, 'ctts');
    let newCtts = null;
    if (cttsBox) {
        const rows = readEntries32(buf, cttsBox, 2);
        if (!rows) return { ok: false, reason: 'ctts ilegible.' };
        // Se conserva la VERSIÓN original (v1 tiene offsets con signo): sólo
        // se recorta la lista, los valores viajan tal cual.
        const cutRows = cutRuns(rows, keptN);
        const flat = cutRows.flat();
        const body = Buffer.alloc(4 + flat.length * 4);
        body.writeUInt32BE(cutRows.length, 0);
        flat.forEach((n, i) => body.writeUInt32BE(n >>> 0, 4 + i * 4));
        const verflags = Buffer.from(buf.subarray(cttsBox.start + 8, cttsBox.start + 12));
        newCtts = boxOf('ctts', verflags, body);
    }
    const sdtpBox = findChild(kids, 'sdtp');
    let newSdtp = null;
    if (sdtpBox) {
        const avail = sdtpBox.end - (sdtpBox.dataStart + 4);
        newSdtp = boxOf('sdtp', fullHeader(), Buffer.from(buf.subarray(sdtpBox.dataStart + 4, sdtpBox.dataStart + 4 + Math.min(keptN, avail))));
    }

    // stbl reensamblado: lo conocido editado, lo opcional descartado con aviso
    const warnings = [];
    const parts = [];
    for (const k of kids) {
        if (STBL_KEEP.has(k.type)) parts.push(slice(buf, k));
        else if (k.type === 'stts') parts.push(buildTable32('stts', cut.rows));
        else if (k.type === 'stsz') parts.push(newStsz);
        else if (k.type === 'stsc') parts.push(buildTable32('stsc', newStscRows));
        else if (k.type === 'stco' || k.type === 'co64') parts.push(newStco);
        else if (k.type === 'stss') { if (newStss) parts.push(newStss); }
        else if (k.type === 'ctts') { if (newCtts) parts.push(newCtts); }
        else if (k.type === 'sdtp') { if (newSdtp) parts.push(newSdtp); }
        else if (STBL_DROP.has(k.type)) warnings.push(`se descartó «${k.type}» (metadato opcional)`);
        else warnings.push(`se descartó «${k.type}» (caja desconocida en stbl)`);
    }
    const newStbl = boxOf('stbl', ...parts);

    // minf / mdia / trak reensamblados, con las duraciones nuevas
    const minfParts = parseChildren(buf, minf.dataStart, minf.end)
        .map(k => (k.type === 'stbl' ? newStbl : slice(buf, k)));
    const newMinf = boxOf('minf', ...minfParts);

    const newMdhd = patchDuration(slice(buf, mdhd), 'mdhd', cut.mediaDuration);
    const mdiaParts = mdiaKids.map(k =>
        k.type === 'mdhd' ? newMdhd : k.type === 'minf' ? newMinf : slice(buf, k));
    const newMdia = boxOf('mdia', ...mdiaParts);

    return {
        ok: true, handler, keptN,
        mediaDuration: cut.mediaDuration, timescale,
        keptEndOffset: end,
        buildTrak: (mvhdTimescale) => {
            const tkhdDuration = Math.round(cut.mediaDuration / timescale * mvhdTimescale);
            const trakKids = parseChildren(buf, trak.dataStart, trak.end);
            const parts2 = [];
            for (const k of trakKids) {
                if (k.type === 'tkhd') parts2.push(patchDuration(slice(buf, k), 'tkhd', tkhdDuration));
                else if (k.type === 'mdia') parts2.push(newMdia);
                else if (k.type === 'edts') {
                    const e = patchElst(buf, k, tkhdDuration);
                    if (!e.ok) throw Object.assign(new Error(e.reason), { bail: true });
                    parts2.push(e.buffer);
                } else parts2.push(slice(buf, k));
            }
            return { buffer: boxOf('trak', ...parts2), tkhdDuration };
        },
        warnings,
    };
};

// ─── El plan completo ──────────────────────────────────────────────────────

/**
 * Plan para conservar `[0, endSec)` de un MP4/MOV sin pasar el cuerpo por la
 * función. Devuelve segmentos: `{ bytes }` (reescritos acá) y `{ copy: [a,b) }`
 * (rangos del ORIGINAL que se copian tal cual, p. ej. con UploadPartCopy).
 *
 * `readRange(start, end)` → Buffer de `[start, end)`. Async a propósito: en
 * producción son GETs por rango a S3; en las pruebas, un archivo local.
 */
export const planMp4EndTrim = async ({ readRange, fileSize, endSec }) => {
    const bail = (reason) => ({ ok: false, reason });
    if (!Number.isFinite(fileSize) || fileSize <= 0) return bail('Tamaño de archivo desconocido.');
    if (!Number.isFinite(endSec) || endSec <= 0) return bail('Punto de corte inválido.');

    const top = await readTopBoxes(readRange, fileSize);
    if (!top.ok) return bail(top.reason);
    const boxes = top.boxes;

    const mdats = boxes.filter(b => b.type === 'mdat');
    if (mdats.length !== 1) return bail(mdats.length ? 'El video tiene varias cajas mdat.' : 'El video no tiene caja mdat.');
    const mdat = mdats[0];
    const moovTop = boxes.find(b => b.type === 'moov');
    if (!moovTop) return bail('El video no tiene cabecera moov.');
    if (moovTop.size > MAX_MOOV_BYTES) return bail('La cabecera del video es inusualmente grande.');

    const moovBuf = await readRange(moovTop.start, moovTop.start + moovTop.size);
    // El árbol del moov se parsea con offsets RELATIVOS a este buffer.
    const moovBox = { type: 'moov', start: 0, size: moovBuf.length, headerLen: moovTop.headerLen, dataStart: moovTop.headerLen, end: moovBuf.length };
    const moovKids = parseChildren(moovBuf, moovBox.dataStart, moovBox.end);
    if (findChild(moovKids, 'mvex')) return bail('El video es un MP4 fragmentado.');
    const mvhd = findChild(moovKids, 'mvhd');
    if (!mvhd) return bail('El moov no tiene mvhd.');
    const movie = readTimescaleAndDuration(moovBuf, mvhd);
    if (!movie.timescale) return bail('El mvhd no declara timescale.');

    // Cortar cada track. Un track no A/V que queda vacío (un capítulo, un
    // timecode) se DESCARTA con aviso; uno A/V vacío es un corte inválido.
    const traks = moovKids.filter(k => k.type === 'trak');
    if (!traks.length) return bail('El video no tiene pistas.');
    const cuts = [];
    const warnings = [];
    const droppedTraks = new Set();
    for (const trak of traks) {
        const cut = cutTrack(moovBuf, trak, endSec, 0 /* delta se aplica en la pasada 2 */);
        if (!cut.ok) {
            if (cut.emptyTrack && cut.emptyTrack !== 'vide' && cut.emptyTrack !== 'soun') {
                droppedTraks.add(trak);
                warnings.push(`se descartó una pista «${cut.emptyTrack}» que quedaba vacía`);
                continue;
            }
            return bail(cut.reason);
        }
        cuts.push({ trak, cut });
    }
    if (!cuts.some(c => c.cut.handler === 'vide')) return bail('El corte deja el video sin pista de imagen.');

    // Hasta qué byte del original llegan las muestras conservadas
    const payloadStart = mdat.dataStart;
    const payloadEnd = mdat.start + mdat.size;
    let keptEnd = payloadStart;
    for (const { cut } of cuts) {
        if (cut.keptEndOffset < payloadStart || cut.keptEndOffset > payloadEnd) {
            return bail('Una pista referencia bytes fuera del mdat.');
        }
        keptEnd = Math.max(keptEnd, cut.keptEndOffset);
    }
    if (keptEnd <= payloadStart) return bail('El corte no conserva ningún byte.');

    // Construcción en DOS pasadas: la primera (delta 0) sólo mide el tamaño
    // del moov nuevo — los VALORES de stco no cambian ninguna longitud—, y con
    // el desplazamiento ya conocido la segunda escribe los offsets reales.
    const buildMoov = (delta) => {
        const trakBuffers = [];
        let maxTkhd = 0;
        for (const { trak } of cuts) {
            const cut = cutTrack(moovBuf, trak, endSec, delta);
            if (!cut.ok) throw Object.assign(new Error(cut.reason), { bail: true });
            const built = cut.buildTrak(movie.timescale);
            trakBuffers.push({ trak, buffer: built.buffer });
            maxTkhd = Math.max(maxTkhd, built.tkhdDuration);
        }
        const parts = [];
        for (const k of moovKids) {
            if (k.type === 'mvhd') parts.push(patchDuration(slice(moovBuf, k), 'mvhd', maxTkhd));
            else if (k.type === 'trak') {
                if (droppedTraks.has(k)) continue;
                const hit = trakBuffers.find(t => t.trak === k);
                parts.push(hit ? hit.buffer : slice(moovBuf, k));
            }
            else parts.push(slice(moovBuf, k));
        }
        return boxOf('moov', ...parts);
    };

    let newMoov;
    try {
        const pass1 = buildMoov(0);
        // Prefijo nuevo: las cajas de antes del mdat, con el moov editado si
        // vivía ahí (faststart); si vivía después, el prefijo no cambia.
        const preBoxes = boxes.filter(b => b.start < mdat.start);
        const moovBefore = moovTop.start < mdat.start;
        const preLen = preBoxes.reduce((a, b) => a + (b.type === 'moov' ? pass1.length : b.size), 0);
        const delta = (preLen + mdat.headerLen) - payloadStart;
        newMoov = buildMoov(delta);
        if (newMoov.length !== pass1.length) throw new Error('El moov cambió de tamaño entre pasadas.');

        // mdat nuevo: mismo largo de cabecera que el original
        const keptPayload = keptEnd - payloadStart;
        const newMdatSize = mdat.headerLen + keptPayload;
        const mdatHeader = Buffer.alloc(mdat.headerLen);
        if (mdat.headerLen === 16) {
            mdatHeader.writeUInt32BE(1, 0);
            mdatHeader.write('mdat', 4, 'latin1');
            mdatHeader.writeBigUInt64BE(BigInt(newMdatSize), 8);
        } else {
            if (newMdatSize > 0xFFFFFFFF) throw new Error('El mdat truncado no entra en una cabecera de 32 bits.');
            mdatHeader.writeUInt32BE(newMdatSize, 0);
            mdatHeader.write('mdat', 4, 'latin1');
        }

        const preParts = [];
        for (const b of preBoxes) {
            preParts.push(b.type === 'moov' ? newMoov : await readRange(b.start, b.start + b.size));
        }
        const prefix = Buffer.concat([...preParts, mdatHeader]);
        if (prefix.length !== preLen + mdat.headerLen) throw new Error('El prefijo no mide lo declarado.');

        const segments = [{ bytes: prefix }, { copy: [payloadStart, keptEnd] }];
        if (!moovBefore) segments.push({ bytes: newMoov });
        const newSize = prefix.length + keptPayload + (moovBefore ? 0 : newMoov.length);

        const durations = cuts.map(c => c.cut.mediaDuration / c.cut.timescale);
        return {
            ok: true, segments, newSize,
            newDurationSec: Math.max(...durations),
            moovAtFront: moovBefore,
            copiedBytes: keptPayload,
            warnings: [...warnings, ...cuts.flatMap(c => c.cut.warnings)],
        };
    } catch (e) {
        return bail(e.bail ? e.message : `No se pudo reescribir la cabecera: ${e.message}`);
    }
};
