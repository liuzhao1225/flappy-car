// Encode the hand-drawn pixel grid directly into PNG; no resampling.
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { deflateSync } = require('node:zlib');
const asset = join(__dirname, '../assets');
const name = process.argv[2] || 'roadster';
const { width, height, palette, rows } = JSON.parse(readFileSync(join(asset, `${name}.pixels.json`)));
if (rows.length !== height || rows.some(row => row.length !== width)) throw new Error('Invalid pixel grid dimensions');
const pixels = Buffer.alloc(height * (1 + width * 4));
rows.forEach((row, y) => [...row].forEach((pixel, x) => {
  const color = palette[pixel];
  if (!color || !/^[\da-f]{8}$/i.test(color)) throw new Error(`Invalid pixel at ${x},${y}: ${pixel}`);
  Buffer.from(color, 'hex').copy(pixels, y * (1 + width * 4) + 1 + x * 4);
}));
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const size = Buffer.alloc(4), checksum = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, body, checksum]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(width, 0);
header.writeUInt32BE(height, 4);
header[8] = 8;
header[9] = 6;
writeFileSync(join(asset, `${name}.png`), Buffer.concat([
  Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
  chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0)),
]));
console.log(`Wrote ${name}.png: ${width} x ${height}, one grid cell per PNG pixel.`);
