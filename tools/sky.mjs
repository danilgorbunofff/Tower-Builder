/* sky.mjs — read an art screenshot without eyes: classify every pixel and print
   a coarse structure map, so "deep clean space" and "no dust speckle" are facts.
   usage: node sky.mjs <file.png> [x0 y0 x1 y1]                                */
import { readFileSync } from "node:fs";
import zlib from "node:zlib";

function decode(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a png");
  let pos = 8, w = 0, h = 0, color = 0, idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); color = data[9]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const bpp = color === 6 ? 4 : 3, stride = w * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * h);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++], line = raw.subarray(p, p + stride); p += stride;
    const cur = px.subarray(y * stride, (y + 1) * stride);
    const prev = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a; else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 255;
    }
  }
  return { w, h, bpp, px };
}

const [file, ...rest] = process.argv.slice(2);
const img = decode(readFileSync(file));
const [x0r, y0r, x1r, y1r] = rest.length === 4 ? rest.map(Number) : [0, 0, img.w - 1, img.h - 1];
const x0 = Math.max(0, x0r), y0 = Math.max(0, y0r);
const x1 = Math.min(img.w - 1, x1r), y1 = Math.min(img.h - 1, y1r);
const at = (x, y) => {
  const i = (y * img.w + x) * img.bpp;
  return [img.px[i], img.px[i + 1], img.px[i + 2]];
};

/* classes: what a visitor can actually see in a patch of sky */
function classify([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mn >= 190) return "star";              // white starlight / lamp
  if (mx <= 40) return "black";              // the deep
  if (mx <= 72) return "dim";                // barely-there banding
  if (g >= r + 8 && b >= r + 8 && g + 4 >= b) return "teal";
  if (b >= r + 16 && b >= g + 16) return "violet";   // the blue/violet speckle
  if (b >= r + 8 && b >= g + 8) return "navy";
  if (r >= g + 8 && g >= b + 8) return "gold";
  if (r >= b + 8 && r >= g && b >= g) return "rust";
  return "other";
}

const tally = new Map();
let violetSamples = 0;
const violet = [];
/* Depth in this sky is brightness and nothing else, so the class census alone
   cannot tell a far world from a near one: a dim blue and a saturated blue are
   both "violet" to a hue test. These bands are the same pixels read as light —
   the share of the patch at each brightness — which is what a far object has to
   lose and what the moon is allowed to keep. */
const BANDS = [[0, 8], [8, 24], [24, 48], [48, 96], [96, 256]];
const bandTally = BANDS.map(() => 0);
let maxLum = -1, maxAt = "";
for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
  const c = at(x, y), k = classify(c);
  tally.set(k, (tally.get(k) || 0) + 1);
  const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  if (l > maxLum) { maxLum = l; maxAt = x + "," + y + " #" + c.map((v) => v.toString(16).padStart(2, "0")).join(""); }
  for (let b = 0; b < BANDS.length; b++) {
    if (l >= BANDS[b][0] && l < BANDS[b][1]) { bandTally[b]++; break; }
  }
  if (k === "violet") { violetSamples++; if (violet.length < 6) violet.push(`#` + c.map((v) => v.toString(16).padStart(2, "0")).join("") + `@${x},${y}`); }
}
const total = (x1 - x0 + 1) * (y1 - y0 + 1);
console.log(`${file}  ${img.w}x${img.h}  region ${x0},${y0}..${x1},${y1}  (${total}px)`);
for (const [k, v] of [...tally].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(7)} ${String(v).padStart(8)}  ${(100 * v / total).toFixed(2)}%`);
}
console.log("  light   " + BANDS.map((b, i) =>
  `${b[0]}-${b[1] - 1}:${(100 * bandTally[i] / total).toFixed(2)}%`).join("  "));
console.log(`  brightest ${maxLum.toFixed(1)} luma at ${maxAt}`);
if (violetSamples) console.log("  violet samples:", violet.join(" "));

/* coarse structure map: 1 char per 18x12 block, dominant class */
const GLYPH = { black: ".", dim: "-", navy: "n", violet: "V", teal: "t", star: "*", gold: "G", rust: "R", other: "?" };
const cols = 78, rows = 26;
const cw = Math.max(1, Math.floor((x1 - x0 + 1) / cols)), ch = Math.max(1, Math.floor((y1 - y0 + 1) / rows));
console.log("structure map (" + cw + "x" + ch + " px blocks, dominant class):");
for (let by = y0; by <= y1; by += ch) {
  let line = "";
  for (let bx = x0; bx <= x1; bx += cw) {
    const c = new Map();
    for (let y = by; y < Math.min(by + ch, y1 + 1); y++) for (let x = bx; x < Math.min(bx + cw, x1 + 1); x++) {
      const k = classify(at(x, y)); c.set(k, (c.get(k) || 0) + 1);
    }
    const top = [...c].sort((a, b) => b[1] - a[1])[0][0];
    line += GLYPH[top] || "?";
  }
  console.log("  " + line);
}