const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPng(width, height, r1, g1, b1, r2, g2, b2) {
  // Simple PNG generator with gradient and border
  const rowSize = width * 4 + 1; // +1 for filter byte (0)
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter: None

    const t = y / height;
    const r = Math.round(r1 * (1 - t) + r2 * t);
    const g = Math.round(g1 * (1 - t) + g2 * t);
    const b = Math.round(b1 * (1 - t) + b2 * t);

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      
      // Calculate distance from center for play triangle or circle
      const cx = width / 2;
      const cy = height / 2;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Play button triangle logic
      const inTriangle = (x >= cx - width * 0.15) && 
                         (x <= cx + width * 0.22) &&
                         (Math.abs(dy) <= (cx + width * 0.22 - x) * 0.7);

      if (inTriangle) {
        rawData[pxOffset] = 255;
        rawData[pxOffset + 1] = 255;
        rawData[pxOffset + 2] = 255;
        rawData[pxOffset + 3] = 255;
      } else {
        // Gradient background
        rawData[pxOffset] = r;
        rawData[pxOffset + 1] = g;
        rawData[pxOffset + 2] = b;
        rawData[pxOffset + 3] = 255;
      }
    }
  }

  const deflated = zlib.deflateSync(rawData);

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);

    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);

    const toCrc = Buffer.concat([typeBuf, data]);
    const crc = crc32(toCrc);
    crcBuf.writeUInt32BE(crc, 0);

    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  // Simple CRC32 implementation
  function crc32(buf) {
    let crc = 0 ^ (-1);
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ (-1)) >>> 0;
  }

  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    }
    table[i] = c;
  }

  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', deflated);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const pubDir = path.join(__dirname, 'client', 'public');
if (!fs.existsSync(pubDir)) fs.mkdirSync(pubDir, { recursive: true });

// 192x192
const png192 = createPng(192, 192, 99, 102, 241, 6, 182, 212);
fs.writeFileSync(path.join(pubDir, 'pwa-192x192.png'), png192);

// 512x512
const png512 = createPng(512, 512, 99, 102, 241, 6, 182, 212);
fs.writeFileSync(path.join(pubDir, 'pwa-512x512.png'), png512);

// 512x512 maskable
const pngMaskable = createPng(512, 512, 15, 23, 42, 99, 102, 241);
fs.writeFileSync(path.join(pubDir, 'maskable-icon-512x512.png'), pngMaskable);

// Screenshots
const screenshotDesk = createPng(1280, 720, 11, 15, 25, 20, 27, 45);
fs.writeFileSync(path.join(pubDir, 'screenshot-desktop.png'), screenshotDesk);

const screenshotMob = createPng(720, 1280, 11, 15, 25, 20, 27, 45);
fs.writeFileSync(path.join(pubDir, 'screenshot-mobile.png'), screenshotMob);

console.log('✅ PWA Icons and Screenshots generated successfully in client/public/');
