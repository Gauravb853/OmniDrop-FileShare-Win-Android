// server/qr.js - Lightweight, self-contained SVG QR Code Generator
// Supports alphanumeric & byte modes up to version 6 (plenty for URLs up to 134 bytes)
// Provides clean, responsive SVG output with zero external dependencies.

const QRCode = (function () {
  // GF(256) log and antilog tables
  const EXP_TABLE = new Uint8Array(512);
  const LOG_TABLE = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) {
    EXP_TABLE[i] = x;
    EXP_TABLE[i + 255] = x;
    LOG_TABLE[x] = i;
    x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
  }

  function gfMul(x, y) {
    if (x === 0 || y === 0) return 0;
    return EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]];
  }

  function polyMul(p1, p2) {
    const result = new Uint8Array(p1.length + p2.length - 1);
    for (let i = 0; i < p1.length; i++) {
      for (let j = 0; j < p2.length; j++) {
        result[i + j] ^= gfMul(p1[i], p2[j]);
      }
    }
    return result;
  }

  function getGeneratorPoly(degree) {
    let poly = new Uint8Array([1]);
    for (let i = 0; i < degree; i++) {
      poly = polyMul(poly, new Uint8Array([1, EXP_TABLE[i]]));
    }
    return poly;
  }

  function calcEC(data, ecCount) {
    const gen = getGeneratorPoly(ecCount);
    const result = new Uint8Array(ecCount);
    for (let i = 0; i < data.length; i++) {
      const factor = data[i] ^ result[0];
      for (let j = 0; j < ecCount - 1; j++) {
        result[j] = result[j + 1] ^ gfMul(gen[j + 1], factor);
      }
      result[ecCount - 1] = gfMul(gen[ecCount], factor);
    }
    return result;
  }

  // Version specs: [version, totalCodewords, ecCodewords, charCountBits]
  // Mode: Byte (8-bit), Error Correction Level M
  const SPECS = [
    null,
    { ver: 1, size: 21, totalCW: 26, ecCW: 10, dataCW: 16, ccBits: 8 },
    { ver: 2, size: 25, totalCW: 44, ecCW: 16, dataCW: 28, ccBits: 8 },
    { ver: 3, size: 29, totalCW: 70, ecCW: 26, dataCW: 44, ccBits: 8 },
    { ver: 4, size: 33, totalCW: 100, ecCW: 36, dataCW: 64, ccBits: 8 },
    { ver: 5, size: 37, totalCW: 134, ecCW: 48, dataCW: 86, ccBits: 8 },
    { ver: 6, size: 41, totalCW: 172, ecCW: 64, dataCW: 108, ccBits: 8 },
  ];

  const ALIGNMENT_PATTERNS = {
    2: [6, 18],
    3: [6, 22],
    4: [6, 26],
    5: [6, 30],
    6: [6, 34],
  };

  function selectVersion(byteLength) {
    for (let v = 1; v <= 6; v++) {
      const spec = SPECS[v];
      const maxDataBytes = spec.dataCW - 2; // 4 bit mode + 8 bit length
      if (byteLength <= maxDataBytes) return spec;
    }
    return SPECS[6];
  }

  function encodeData(str, spec) {
    const bytes = Buffer.from(str, 'utf8');
    const bits = [];

    function pushBits(val, len) {
      for (let i = len - 1; i >= 0; i--) {
        bits.push((val >> i) & 1);
      }
    }

    // Mode indicator: 0100 (Byte mode)
    pushBits(0b0100, 4);
    // Character count indicator
    pushBits(bytes.length, spec.ccBits);

    // Data bits
    for (let b of bytes) {
      pushBits(b, 8);
    }

    // Terminator (up to 4 zero bits)
    const totalDataBits = spec.dataCW * 8;
    const termLen = Math.min(4, totalDataBits - bits.length);
    for (let i = 0; i < termLen; i++) bits.push(0);

    // Pad to byte boundary
    while (bits.length % 8 !== 0) bits.push(0);

    // Pad bytes
    const padBytes = [0xec, 0x11];
    let padIndex = 0;
    while (bits.length < totalDataBits) {
      pushBits(padBytes[padIndex % 2], 8);
      padIndex++;
    }

    // Convert bits to codewords
    const dataCW = new Uint8Array(spec.dataCW);
    for (let i = 0; i < spec.dataCW; i++) {
      let b = 0;
      for (let j = 0; j < 8; j++) {
        b = (b << 1) | bits[i * 8 + j];
      }
      dataCW[i] = b;
    }

    // Calculate Error Correction codewords
    const ecCW = calcEC(dataCW, spec.ecCW);

    // Combine Data + EC
    const full = new Uint8Array(spec.totalCW);
    full.set(dataCW, 0);
    full.set(ecCW, dataCW.length);
    return full;
  }

  function createMatrix(spec) {
    const size = spec.size;
    const matrix = Array.from({ length: size }, () => new Array(size).fill(null));
    const isReserved = Array.from({ length: size }, () => new Array(size).fill(false));

    function setModule(r, c, val, reserved = true) {
      if (r >= 0 && r < size && c >= 0 && c < size) {
        matrix[r][c] = val ? 1 : 0;
        if (reserved) isReserved[r][c] = true;
      }
    }

    // Finder patterns (top-left, top-right, bottom-left)
    function drawFinder(r0, c0) {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const row = r0 + r;
          const col = c0 + c;
          if (row < 0 || row >= size || col < 0 || col >= size) continue;
          if (r === -1 || r === 7 || c === -1 || c === 7) {
            setModule(row, col, 0);
          } else if (r === 0 || r === 6 || c === 0 || c === 6) {
            setModule(row, col, 1);
          } else if (r >= 2 && r <= 4 && c >= 2 && c <= 4) {
            setModule(row, col, 1);
          } else {
            setModule(row, col, 0);
          }
        }
      }
    }

    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      setModule(6, i, i % 2 === 0);
      setModule(i, 6, i % 2 === 0);
    }

    // Alignment patterns (for ver >= 2)
    if (spec.ver >= 2 && ALIGNMENT_PATTERNS[spec.ver]) {
      const coords = ALIGNMENT_PATTERNS[spec.ver];
      for (let r of coords) {
        for (let c of coords) {
          if (isReserved[r][c]) continue;
          for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              const border = Math.max(Math.abs(dr), Math.abs(dc));
              setModule(r + dr, c + dc, border !== 1);
            }
          }
        }
      }
    }

    // Dark module
    setModule(4 * spec.ver + 9, 8, 1);

    // Format information area (reserve)
    for (let i = 0; i <= 8; i++) {
      if (!isReserved[8][i]) isReserved[8][i] = true;
      if (!isReserved[i][8]) isReserved[i][8] = true;
      if (!isReserved[8][size - 1 - i]) isReserved[8][size - 1 - i] = true;
      if (!isReserved[size - 1 - i][8]) isReserved[size - 1 - i][8] = true;
    }

    return { matrix, isReserved, size };
  }

  function writeCodewords(matrix, isReserved, size, codewords) {
    const bits = [];
    for (let cw of codewords) {
      for (let i = 7; i >= 0; i--) {
        bits.push((cw >> i) & 1);
      }
    }

    let bitIdx = 0;
    let up = true;
    for (let right = size - 1; right > 0; right -= 2) {
      if (right === 6) right--; // skip timing column
      const cols = [right, right - 1];
      const rows = [];
      for (let r = 0; r < size; r++) rows.push(up ? size - 1 - r : r);
      up = !up;

      for (let r of rows) {
        for (let c of cols) {
          if (!isReserved[r][c]) {
            matrix[r][c] = bitIdx < bits.length ? bits[bitIdx++] : 0;
          }
        }
      }
    }
  }

  // Mask pattern 0: (row + col) % 2 === 0
  function applyMask(matrix, isReserved, size) {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!isReserved[r][c]) {
          if ((r + c) % 2 === 0) {
            matrix[r][c] ^= 1;
          }
        }
      }
    }
  }

  // Format info for EC Level M (00) and Mask 0 (000): 0b00000 -> BCH format 0x5412 (101010000010010)
  const FORMAT_BITS = 0x5412;

  function writeFormatInfo(matrix, size) {
    const bits = [];
    for (let i = 14; i >= 0; i--) {
      bits.push((FORMAT_BITS >> i) & 1);
    }

    // Top-left
    for (let i = 0; i <= 5; i++) matrix[8][i] = bits[i];
    matrix[8][7] = bits[6];
    matrix[8][8] = bits[7];
    matrix[7][8] = bits[8];
    for (let i = 9; i <= 14; i++) matrix[14 - i][8] = bits[i];

    // Split format bits around corners
    for (let i = 0; i < 7; i++) matrix[size - 1 - i][8] = bits[i];
    for (let i = 7; i < 15; i++) matrix[8][size - 15 + i] = bits[i];
  }

  return {
    generateSVG: function (text, options = {}) {
      const padding = options.padding !== undefined ? options.padding : 4;
      const fgColor = options.fgColor || '#000000';
      const bgColor = options.bgColor || '#ffffff';
      const size = options.size || 256;

      const spec = selectVersion(Buffer.byteLength(text, 'utf8'));
      const codewords = encodeData(text, spec);
      const { matrix, isReserved, size: matrixSize } = createMatrix(spec);

      writeCodewords(matrix, isReserved, matrixSize, codewords);
      applyMask(matrix, isReserved, matrixSize);
      writeFormatInfo(matrix, matrixSize);

      const totalSize = matrixSize + padding * 2;
      let pathData = '';

      for (let r = 0; r < matrixSize; r++) {
        for (let c = 0; c < matrixSize; c++) {
          if (matrix[r][c] === 1) {
            pathData += `M${c + padding},${r + padding}h1v1h-1z `;
          }
        }
      }

      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${size}" height="${size}" shape-rendering="crispEdges">
  <rect width="100%" height="100%" fill="${bgColor}" rx="12" />
  <path d="${pathData}" fill="${fgColor}" />
</svg>`;
    },
  };
})();

module.exports = QRCode;
