/* map.mjs — print an ASCII map of a rectangle of a screenshot, colours as letters.

   usage:  node map.mjs <file.png> <x0> <y0> <x1> <y1> [maxColours]            */

import { readFileSync } from "node:fs";
import zlib from "node:zlib";

const [file, x0s, y0s, x1s, y1s, maxs] = process.argv.slice(2);
if (!file) { console.error("usage: node map.mjs <file.png> <x0> <y0> <x1> <y1>"); process.exit(2); }

function decode(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) { throw new Error("not a png"); }
  let pos = 8, w = 0, h = 0, color = 0, idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); color = data[9]; }
    else if (type === "IDAT") { idat.push(data); }
    else if (type === "IEND") { break; }
    pos += 12 + len;
  }
  const bpp = color === 6 ? 4 : 3;
  const stride = w * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * h);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const line = raw.subarray(p, p + stride); p += stride;
    const cur = px.subarray(y * stride, (y + 1) * stride);
    const prev = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) { v += a; }
      else if (filter === 2) { v += b; }
      else if (filter === 3) { v += (a + b) >> 1; }
      else if (filter === 4) {
        const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 255;
    }
  }
  return { w, h, bpp, px };
}

const img = decode(readFileSync(file));
const hex = (x, y) => {
  const i = (y * img.w + x) * img.bpp;
  return "#" + [0, 1, 2].map((k) => img.px[i + k].toString(16).padStart(2, "0")).join("");
};
const x0 = Math.max(0, +(x0s ?? 0)), y0 = Math.max(0, +(y0s ?? 0));
const x1 = Math.min(img.w - 1, x1s === undefined ? img.w - 1 : +x1s);
const y1 = Math.min(img.h - 1, y1s === undefined ? img.h - 1 : +y1s);

const counts = new Map();
for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
  const c = hex(x, y); counts.set(c, (counts.get(c) || 0) + 1);
}
const max = Math.min(34, maxs ? +maxs : 34);
const palette = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map((e) => e[0]);
const AL = "0123456789abcdefghijklmnopqrstuvwxyz";
const key = (c) => { const i = palette.indexOf(c); return i < 0 ? "?" : AL[i]; };

console.log(`${file}  ${img.w}x${img.h}  region ${x0},${y0} .. ${x1},${y1}`);
console.log(palette.map((c, i) => `${AL[i]}=${c}(${counts.get(c)})`).join("  "));
const hdr = "     " + Array.from({ length: x1 - x0 + 1 }, (_, i) => (x0 + i) % 10).join("");
console.log(hdr);
for (let y = y0; y <= y1; y++) {
  let line = String(y).padStart(4) + " ";
  for (let x = x0; x <= x1; x++) line += key(hex(x, y));
  console.log(line);
}
