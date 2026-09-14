import fs from "node:fs";
import zlib from "node:zlib";
function decode(buf) {
  let i = 8, w = 0, h = 0, bitDepth = 0, colorType = 0, idat = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i), type = buf.toString("ascii", i + 4, i + 8);
    const data = buf.subarray(i + 8, i + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    i += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp, img = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? img[y * stride + x - bpp] : 0, b = y > 0 ? img[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? img[(y - 1) * stride + x - bpp] : 0, v = line[x];
      img[y * stride + x] = f === 0 ? v : f === 1 ? (v + a) & 255 : f === 2 ? (v + b) & 255
        : f === 3 ? (v + ((a + b) >> 1)) & 255
        : (v + (() => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
            return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; })()) & 255;
    }
  }
  return { w, h, bpp, img };
}
function encode(w, h, rgb) {
  const stride = w * 3, raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0); out.write(type, 4, "ascii"); data.copy(out, 8);
    out.writeUInt32BE(zlib.crc32 ? zlib.crc32(Buffer.concat([Buffer.from(type, "ascii"), data])) : crc(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
let T = null;
function crc(buf) {
  if (!T) { T = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c; } }
  let c = -1; for (const b of buf) c = T[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0;
}
const [file, x0, y0, x1, y1, scale] = process.argv.slice(2);
const src = decode(fs.readFileSync(file));
const X0 = +x0, Y0 = +y0, W = +x1 - X0, H = +y1 - Y0, S = +scale || 1;
const out = Buffer.alloc(W * S * H * S * 3);
for (let y = 0; y < H * S; y++) for (let x = 0; x < W * S; x++) {
  const sx = X0 + Math.floor(x / S), sy = Y0 + Math.floor(y / S);
  const si = (sy * src.w + sx) * src.bpp, di = (y * W * S + x) * 3;
  out[di] = src.img[si]; out[di + 1] = src.img[si + 1]; out[di + 2] = src.img[si + 2];
}
const dest = file.replace(/\.png$/, "") + `-crop.png`;
fs.writeFileSync(dest, encode(W * S, H * S, out));
console.log(dest, src.w + "x" + src.h, "->", W * S + "x" + H * S);