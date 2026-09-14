/* biome.mjs — read a screenshot down one column and say what colour is painted
   where. Layout boxes tell you where the sky is; only pixels tell you what the
   sky *is*. Prints one line per run of identical colour, so a graded band, a
   dithered seam, a star and a hard cut all look different on paper.

   usage:  node biome.mjs .impeccable/sky2-panel.png [x] [y0] [y1]           */

import { readFileSync } from "node:fs";
import zlib from "node:zlib";

const file = process.argv[2];
if (!file) { console.error("usage: node biome.mjs <file.png> [x] [y0] [y1]"); process.exit(2); }

function decode(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) { throw new Error("not a png"); }
  let pos = 8, w = 0, h = 0, color = 0, idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      if (data[8] !== 8) { throw new Error("png depth " + data[8]); }
      color = data[9];
      if (color !== 2 && color !== 6) { throw new Error("png colorType " + color); }
      if (data[12] !== 0) { throw new Error("interlaced png"); }
    } else if (type === "IDAT") { idat.push(data); }
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
const at = (x, y) => {
  const i = (y * img.w + x) * img.bpp;
  const hex = (v) => v.toString(16).padStart(2, "0");
  return "#" + hex(img.px[i]) + hex(img.px[i + 1]) + hex(img.px[i + 2]);
};

const x = process.argv[3] === undefined ? Math.round(img.w * 0.94) : Number(process.argv[3]);
const y0 = process.argv[4] === undefined ? 0 : Number(process.argv[4]);
const y1 = process.argv[5] === undefined ? img.h - 1 : Number(process.argv[5]);

console.log(`# ${file}  ${img.w}x${img.h}  column x=${x}  rows ${y0}..${y1}`);
let runStart = y0, runCol = at(x, y0), runs = 0;
for (let y = y0 + 1; y <= y1 + 1; y++) {
  const col = y <= y1 ? at(x, y) : null;
  if (col === runCol) { continue; }
  runs++;
  console.log(`  ${String(runStart).padStart(4)}..${String(y - 1).padStart(4)}  ${String(y - runStart).padStart(4)}px  ${runCol}`);
  runStart = y; runCol = col;
}
const uniq = new Set();
for (let y = y0; y <= y1; y++) { uniq.add(at(x, y)); }
console.log(`  ${runs} runs, ${uniq.size} distinct colours in this column`);
