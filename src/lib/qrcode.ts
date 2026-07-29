// ════════════════════════════════════════════════════════════════════
// Generador de códigos QR — v4.648.0
//
// Implementación propia y sin dependencias: el proyecto no tenía librería de
// QR y agregarla sólo para la escarapela de la feria no se justificaba.
//
// Alcance deliberado: QR modelo 2, **modo byte**, nivel de corrección **M**
// (recupera ~15%), versiones 1 a 10 — hasta 213 bytes, de sobra para un código
// de inscripción o una URL de acreditación. Si el contenido no cabe, la función
// lanza en vez de recortar en silencio.
//
// Referencia: ISO/IEC 18004. Las tablas de capacidad, bloques, patrones de
// alineación e información de formato/versión son las del estándar.
// ════════════════════════════════════════════════════════════════════

// ── Tablas del estándar (nivel M, versiones 1-10) ────────────────────

/** Codewords de datos por versión, en nivel M. */
const DATA_CODEWORDS = [16, 28, 44, 64, 86, 108, 124, 154, 182, 216];

/** Codewords de corrección por bloque, en nivel M. */
const EC_PER_BLOCK = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26];

/** Estructura de bloques: [nº grupo 1, nº grupo 2]. El grupo 2 lleva un dato más. */
const BLOCKS = [
    [1, 0], [1, 0], [1, 0], [2, 0], [2, 0],
    [4, 0], [4, 0], [2, 2], [3, 2], [4, 1],
];

/** Coordenadas de los patrones de alineación por versión. */
const ALIGNMENT: number[][] = [
    [], [6, 18], [6, 22], [6, 26], [6, 30],
    [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

/** Información de formato ya calculada (nivel M × 8 máscaras). */
const FORMAT_INFO = [0x5412, 0x5125, 0x5E7C, 0x5B4B, 0x45F9, 0x40CE, 0x4F97, 0x4AA0];

/** Información de versión, obligatoria desde la versión 7. */
const VERSION_INFO: Record<number, number> = {
    7: 0x07C94, 8: 0x085BC, 9: 0x09A99, 10: 0x0A4D3,
};

// ── Aritmética en GF(256) ────────────────────────────────────────────
// El polinomio generador del QR es 0x11D.

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
    let x = 1;
    for (let i = 0; i < 255; i++) {
        EXP[i] = x;
        LOG[x] = i;
        x <<= 1;
        if (x & 0x100) x ^= 0x11D;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const mul = (a: number, b: number): number =>
    (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

/** Polinomio generador de `degree` codewords de corrección. */
const generatorPoly = (degree: number): Uint8Array => {
    let poly = new Uint8Array([1]);
    for (let i = 0; i < degree; i++) {
        const next = new Uint8Array(poly.length + 1);
        for (let j = 0; j < poly.length; j++) {
            next[j] ^= poly[j];
            next[j + 1] ^= mul(poly[j], EXP[i]);
        }
        poly = next;
    }
    return poly;
};

/** Codewords de corrección Reed-Solomon de un bloque de datos. */
const reedSolomon = (data: Uint8Array, ecLength: number): Uint8Array => {
    const generator = generatorPoly(ecLength);
    const remainder = new Uint8Array(ecLength);
    for (const byte of data) {
        const factor = byte ^ remainder[0];
        remainder.copyWithin(0, 1);
        remainder[ecLength - 1] = 0;
        for (let i = 0; i < ecLength; i++) {
            remainder[i] ^= mul(generator[i + 1], factor);
        }
    }
    return remainder;
};

// ── Construcción de la matriz ────────────────────────────────────────

type Matrix = (0 | 1 | null)[][];

const sizeOf = (version: number) => version * 4 + 17;

const placeFinder = (matrix: Matrix, row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
            const y = row + r;
            const x = col + c;
            if (y < 0 || y >= matrix.length || x < 0 || x >= matrix.length) continue;
            const border = r === -1 || r === 7 || c === -1 || c === 7;
            const inner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
            const ring = r === 0 || r === 6 || c === 0 || c === 6;
            matrix[y][x] = border ? 0 : (ring || inner) ? 1 : 0;
        }
    }
};

const buildBase = (version: number): { matrix: Matrix; reserved: boolean[][] } => {
    const size = sizeOf(version);
    const matrix: Matrix = Array.from({ length: size }, () => Array(size).fill(null));
    const reserved: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

    const reserve = (y: number, x: number) => {
        if (y >= 0 && y < size && x >= 0 && x < size) reserved[y][x] = true;
    };

    // Patrones de búsqueda, en las tres esquinas.
    placeFinder(matrix, 0, 0);
    placeFinder(matrix, 0, size - 7);
    placeFinder(matrix, size - 7, 0);
    for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
            reserve(r, c);
            reserve(r, size - 7 + c);
            reserve(size - 7 + r, c);
        }
    }

    // Patrones de sincronización.
    for (let i = 8; i < size - 8; i++) {
        const bit = i % 2 === 0 ? 1 : 0;
        matrix[6][i] = bit; reserved[6][i] = true;
        matrix[i][6] = bit; reserved[i][6] = true;
    }

    // Patrones de alineación: no se dibujan sobre los de búsqueda.
    const centers = ALIGNMENT[version - 1];
    for (const row of centers) {
        for (const col of centers) {
            const nearFinder =
                (row <= 8 && col <= 8) ||
                (row <= 8 && col >= size - 9) ||
                (row >= size - 9 && col <= 8);
            if (nearFinder) continue;
            for (let r = -2; r <= 2; r++) {
                for (let c = -2; c <= 2; c++) {
                    const edge = Math.max(Math.abs(r), Math.abs(c));
                    matrix[row + r][col + c] = edge === 1 ? 0 : 1;
                    reserved[row + r][col + c] = true;
                }
            }
        }
    }

    // Módulo oscuro fijo y zonas de formato.
    matrix[size - 8][8] = 1;
    reserved[size - 8][8] = true;
    for (let i = 0; i < 9; i++) { reserve(8, i); reserve(i, 8); }
    for (let i = 0; i < 8; i++) { reserve(8, size - 1 - i); reserve(size - 1 - i, 8); }

    // Zona de información de versión (sólo v7+).
    if (version >= 7) {
        for (let i = 0; i < 18; i++) {
            const a = Math.floor(i / 3);
            const b = i % 3;
            reserve(size - 11 + b, a);
            reserve(a, size - 11 + b);
        }
    }

    return { matrix, reserved };
};

// ── Máscaras ─────────────────────────────────────────────────────────

const MASKS: ((row: number, col: number) => boolean)[] = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (_, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** Penalización del estándar: cuanto más baja, mejor se lee el código. */
const penalty = (matrix: Matrix): number => {
    const size = matrix.length;
    let score = 0;

    // Regla 1: rachas de 5 o más módulos del mismo color.
    for (let i = 0; i < size; i++) {
        for (const horizontal of [true, false]) {
            let run = 1;
            for (let j = 1; j < size; j++) {
                const prev = horizontal ? matrix[i][j - 1] : matrix[j - 1][i];
                const cur = horizontal ? matrix[i][j] : matrix[j][i];
                if (cur === prev) {
                    run++;
                } else {
                    if (run >= 5) score += run - 2;
                    run = 1;
                }
            }
            if (run >= 5) score += run - 2;
        }
    }

    // Regla 2: bloques de 2×2 del mismo color.
    for (let r = 0; r < size - 1; r++) {
        for (let c = 0; c < size - 1; c++) {
            const v = matrix[r][c];
            if (v === matrix[r][c + 1] && v === matrix[r + 1][c] && v === matrix[r + 1][c + 1]) score += 3;
        }
    }

    // Regla 3: el patrón 1:1:3:1:1 que se confunde con un patrón de búsqueda.
    const pattern = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    const reversed = [...pattern].reverse();
    const matches = (line: (0 | 1 | null)[], start: number, target: number[]) =>
        target.every((bit, k) => line[start + k] === bit);
    for (let i = 0; i < size; i++) {
        const row = matrix[i];
        const col = matrix.map(r => r[i]);
        for (let j = 0; j + 11 <= size; j++) {
            if (matches(row, j, pattern) || matches(row, j, reversed)) score += 40;
            if (matches(col, j, pattern) || matches(col, j, reversed)) score += 40;
        }
    }

    // Regla 4: desbalance entre módulos oscuros y claros.
    let dark = 0;
    for (const row of matrix) for (const cell of row) if (cell === 1) dark++;
    const ratio = (dark * 100) / (size * size);
    score += Math.floor(Math.abs(ratio - 50) / 5) * 10;

    return score;
};

// ── Codificación ─────────────────────────────────────────────────────

/** Menor versión (1-10) en la que caben `byteLength` bytes en nivel M. */
const pickVersion = (byteLength: number): number => {
    for (let version = 1; version <= 10; version++) {
        const lengthBits = version >= 10 ? 16 : 8;
        const capacity = Math.floor((DATA_CODEWORDS[version - 1] * 8 - 4 - lengthBits) / 8);
        if (byteLength <= capacity) return version;
    }
    throw new Error('El contenido es demasiado largo para un QR de nivel M hasta la versión 10.');
};

/** Flujo de bits de datos, ya rellenado hasta la capacidad de la versión. */
const encodeData = (bytes: Uint8Array, version: number): Uint8Array => {
    const total = DATA_CODEWORDS[version - 1];
    const bits: number[] = [];
    const push = (value: number, length: number) => {
        for (let i = length - 1; i >= 0; i--) bits.push((value >> i) & 1);
    };

    push(0b0100, 4);                              // modo byte
    push(bytes.length, version >= 10 ? 16 : 8);   // longitud
    for (const byte of bytes) push(byte, 8);

    // Terminador de hasta 4 bits y relleno hasta completar el codeword.
    const capacityBits = total * 8;
    for (let i = 0; i < 4 && bits.length < capacityBits; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);

    const codewords = new Uint8Array(total);
    for (let i = 0; i < bits.length / 8; i++) {
        let byte = 0;
        for (let b = 0; b < 8; b++) byte = (byte << 1) | bits[i * 8 + b];
        codewords[i] = byte;
    }
    // Bytes de relleno alternos que exige el estándar.
    for (let i = Math.ceil(bits.length / 8); i < total; i++) {
        codewords[i] = (i - Math.ceil(bits.length / 8)) % 2 === 0 ? 0xEC : 0x11;
    }
    return codewords;
};

/** Intercala bloques de datos y de corrección en el orden final. */
const interleave = (data: Uint8Array, version: number): Uint8Array => {
    const [group1, group2] = BLOCKS[version - 1];
    const totalBlocks = group1 + group2;
    const ecLength = EC_PER_BLOCK[version - 1];
    const shortLength = Math.floor(DATA_CODEWORDS[version - 1] / totalBlocks);

    const dataBlocks: Uint8Array[] = [];
    const ecBlocks: Uint8Array[] = [];
    let offset = 0;
    for (let i = 0; i < totalBlocks; i++) {
        const length = i < group1 ? shortLength : shortLength + 1;
        const block = data.slice(offset, offset + length);
        offset += length;
        dataBlocks.push(block);
        ecBlocks.push(reedSolomon(block, ecLength));
    }

    const out: number[] = [];
    const maxData = Math.max(...dataBlocks.map(b => b.length));
    for (let i = 0; i < maxData; i++) {
        for (const block of dataBlocks) if (i < block.length) out.push(block[i]);
    }
    for (let i = 0; i < ecLength; i++) {
        for (const block of ecBlocks) out.push(block[i]);
    }
    return new Uint8Array(out);
};

/** Recorre la matriz en zigzag y coloca los bits del mensaje. */
const placeData = (matrix: Matrix, reserved: boolean[][], codewords: Uint8Array) => {
    const size = matrix.length;
    let bitIndex = 0;
    const nextBit = (): 0 | 1 => {
        const byte = codewords[bitIndex >> 3];
        const bit = byte === undefined ? 0 : (byte >> (7 - (bitIndex & 7))) & 1;
        bitIndex++;
        return bit as 0 | 1;
    };

    let upward = true;
    for (let right = size - 1; right > 0; right -= 2) {
        // La columna 6 es de sincronización: se salta entera.
        if (right === 6) right = 5;
        for (let step = 0; step < size; step++) {
            const row = upward ? size - 1 - step : step;
            for (const col of [right, right - 1]) {
                if (reserved[row][col]) continue;
                matrix[row][col] = nextBit();
            }
        }
        upward = !upward;
    }
};

const applyFormat = (matrix: Matrix, mask: number) => {
    const size = matrix.length;
    const bits = FORMAT_INFO[mask];
    const bit = (i: number) => ((bits >> i) & 1) as 0 | 1;

    // Copia superior izquierda: baja por la columna 8 y sigue por la fila 8.
    for (let i = 0; i <= 5; i++) matrix[i][8] = bit(i);
    matrix[7][8] = bit(6);
    matrix[8][8] = bit(7);
    matrix[8][7] = bit(8);
    for (let i = 9; i <= 14; i++) matrix[8][14 - i] = bit(i);

    // Copia redundante: fila 8 por la derecha y columna 8 por abajo.
    for (let i = 0; i <= 7; i++) matrix[8][size - 1 - i] = bit(i);
    for (let i = 8; i <= 14; i++) matrix[size - 15 + i][8] = bit(i);

    // Módulo oscuro obligatorio, justo encima de la copia inferior (que ocupa
    // de size-7 hacia abajo, sin llegar a tocarlo).
    matrix[size - 8][8] = 1;
};

const applyVersionInfo = (matrix: Matrix, version: number) => {
    if (version < 7) return;
    const size = matrix.length;
    const bits = VERSION_INFO[version];
    for (let i = 0; i < 18; i++) {
        const bit = ((bits >> i) & 1) as 0 | 1;
        const a = Math.floor(i / 3);
        const b = i % 3;
        matrix[size - 11 + b][a] = bit;
        matrix[a][size - 11 + b] = bit;
    }
};

// ── API pública ──────────────────────────────────────────────────────

/**
 * Convierte un texto en la matriz de módulos del QR.
 * `true` = módulo oscuro. El resultado NO incluye la zona de silencio.
 */
export const encodeQr = (text: string): boolean[][] => {
    const bytes = new TextEncoder().encode(String(text ?? ''));
    if (!bytes.length) throw new Error('No hay contenido que codificar.');

    const version = pickVersion(bytes.length);
    const codewords = interleave(encodeData(bytes, version), version);

    let best: { matrix: Matrix; score: number } | null = null;
    for (let mask = 0; mask < 8; mask++) {
        const { matrix, reserved } = buildBase(version);
        placeData(matrix, reserved, codewords);
        // La máscara se aplica sólo a los módulos de datos, nunca a los fijos.
        for (let r = 0; r < matrix.length; r++) {
            for (let c = 0; c < matrix.length; c++) {
                if (reserved[r][c]) continue;
                if (MASKS[mask](r, c)) matrix[r][c] = (matrix[r][c] === 1 ? 0 : 1);
            }
        }
        applyFormat(matrix, mask);
        applyVersionInfo(matrix, version);

        const score = penalty(matrix);
        if (!best || score < best.score) best = { matrix, score };
    }

    return best!.matrix.map(row => row.map(cell => cell === 1));
};

/**
 * QR listo para pintar, como SVG. `size` es el lado en píxeles.
 * Se dibuja como un único `<path>`: pesa poco y se imprime nítido.
 */
export const qrToSvg = (text: string, size = 160, quietZone = 4): string => {
    const modules = encodeQr(text);
    const count = modules.length + quietZone * 2;
    const parts: string[] = [];

    for (let r = 0; r < modules.length; r++) {
        for (let c = 0; c < modules.length; c++) {
            if (modules[r][c]) parts.push(`M${c + quietZone} ${r + quietZone}h1v1h-1z`);
        }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${count} ${count}" shape-rendering="crispEdges">`
        + `<rect width="${count}" height="${count}" fill="#ffffff"/>`
        + `<path d="${parts.join('')}" fill="#000000"/>`
        + '</svg>';
};

/** El mismo SVG como data URI, para usarlo en un `<img>` o imprimirlo. */
export const qrToDataUri = (text: string, size = 160): string =>
    `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(qrToSvg(text, size))))}`;

export default { encodeQr, qrToSvg, qrToDataUri };
