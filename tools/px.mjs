/* px.mjs — read a screenshot and say what is actually painted where.

   Layout boxes are measured by the probes; boxes survive being clipped away by
   an ancestor's overflow, pixels do not. This is the eye that never forgets to
   look: it finds the roof's mast, the water tank and the small print under the
   button, in the real PNG.

   usage:  node px.mjs .impeccable/shot-laptop.png                               */

import { readFileSync } from "node:fs";
import zlib from "node:zlib";

const file = process.argv[2];
if (!file) { console.error("usage: node px.mjs <file.png>"); process.exit(2); }

/* ── the smallest PNG reader that works: 8-bit RGB/RGBA, no interlace ────── */
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

function scan(img, test, y0 = 0, y1 = img.h - 1) {
  const { w, bpp, px } = img;
  let n = 0, top = 1e9, bottom = -1, left = 1e9, right = -1;
  for (let y = y0; y <= y1; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * bpp;
      if (!test(px[i], px[i + 1], px[i + 2])) { continue; }
      n++;
      if (y < top) { top = y; }
      if (y > bottom) { bottom = y; }
      if (x < left) { left = x; }
      if (x > right) { right = x; }
    }
  }
  return { n, top, bottom, left, right };
}

const img = decode(readFileSync(file));
const { h } = img;
const near = (r, g, b, R, G, B, t) =>
  Math.abs(r - R) <= t && Math.abs(g - G) <= t && Math.abs(b - B) <= t;

/* the roof's own colours — none of them blinks, none appears anywhere else */
const mast  = scan(img, (r, g, b) => near(r, g, b, 125, 120, 108, 3));   // .mast, .mast::before
const tank  = scan(img, (r, g, b) => near(r, g, b, 143, 154, 168, 3));   // .tank
const hatch = scan(img, (r, g, b) => near(r, g, b, 111, 105, 93, 3));    // .hatch

/* the tray along the bottom: the button's gold rail and the grey small print
   under it — the print scan starts below the rail so the pavement above the
   button cannot be mistaken for text */
const foot = Math.max(0, h - 160);
const gold  = scan(img, (r, g, b) => near(r, g, b, 255, 194, 46, 34), foot);
const print = scan(img, (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx > 96 && mx - mn < 44;
}, gold.n ? gold.bottom + 1 : foot, h - 1);

const rows = (s) => (s.n ? `${s.top}..${s.bottom}` : "-");
const ok = (b) => (b ? "OK  " : "FAIL");
const roofTop = Math.min(
  mast.n ? mast.top : 1e9,
  tank.n ? tank.top : 1e9,
  hatch.n ? hatch.top : 1e9);

/* the roof has to sit ON the building, not float above it. Below the roof's
   bottom edge the tower must start at once. The dusk gradient reads the same
   colour at any x on a given row, so a column inside the tower is compared with
   one out at the far right: equal means "sky", i.e. the roof has drifted off
   the top of the stack. */
let floatPx = null;
if (mast.n) {
  const roofBottom = mast.bottom + 11;   // roof box is 56 tall; the mast spans its first 42 rows
  const xIn = mast.left + 6, xOut = img.w - 40;
  let run = 0;
  for (let y = roofBottom + 2; y < h - 1 && run < 400; y++) {
    const i = (y * img.w + xIn) * img.bpp, o = (y * img.w + xOut) * img.bpp;
    const sameSky =
      Math.abs(img.px[i] - img.px[o]) <= 4 &&
      Math.abs(img.px[i + 1] - img.px[o + 1]) <= 4 &&
      Math.abs(img.px[i + 2] - img.px[o + 2]) <= 4;
    if (!sameSky) { break; }
    run++;
  }
  floatPx = run;
}

/* sky above the roof: the dusk gradient is blue-dominant and smooth, so
   anything that is not blue-dominant up there is a cut-off piece of building */
/* the facade: lit windows are the warm cream pixels, and there should be a lot */
const lit = scan(img, (r, g, b) => r > 205 && g > 185 && b < 190 && r - b > 26, Math.max(0, roofTop - 8), foot);

/* A shot with no roof in it is a shot taken halfway up the tower, and the roof
   checks below cannot mean anything there — the roof is not missing, it is
   twenty storeys overhead. What such a shot does have to show is a tower: the
   whole point of the sliding window is that scrolling down the rail never lands
   on empty sky where the lower storeys should be.

   The tower occupies a known band of columns, and the biome's sky is a smooth
   gradient — the same colour at every x on a given row. So a row in the band
   that matches the far-right sky column is sky showing through the building,
   and a run of them is the building gone missing. */
const midTour = roofTop === 1e9;
/* panel viewport only: the tower box there is x 132..296 (probe-px2 reports it) */
const BAND_L = 132, BAND_R = 296, BAND_X = Math.floor((BAND_L + BAND_R) / 2);
const skyX = img.w - 40;
let through = 0, throughBest = 0, litInBand = 0, rowsFilled = 0;
for (let y = 2; y < foot; y++) {
  const i = (y * img.w + BAND_X) * img.bpp, o = (y * img.w + skyX) * img.bpp;
  const isSky =
    Math.abs(img.px[i] - img.px[o]) <= 4 &&
    Math.abs(img.px[i + 1] - img.px[o + 1]) <= 4 &&
    Math.abs(img.px[i + 2] - img.px[o + 2]) <= 4;
  if (isSky) { through++; throughBest = Math.max(throughBest, through); } else { through = 0; rowsFilled++; }
  for (let x = BAND_L; x <= BAND_R; x++) {
    const k = (y * img.w + x) * img.bpp;
    if (img.px[k] > 205 && img.px[k + 1] > 185 && img.px[k + 2] < 190 && img.px[k] - img.px[k + 2] > 26) { litInBand++; }
  }
}
/* clear air above the roof: walk the mast's own column from the top of the
   screen down to the roof. A dusk gradient changes by a hair per row, so a
   run of hard steps means a piece of building got cut off up there; single
   rows are just stars twinkling on the way past. */
const airX = (mast.n ? mast.left + 6 : (img.w >> 1));
const airStop = Math.max(2, Math.min(roofTop - 6, h) - 1);
let airHits = 0, airRows = [];
for (let y = 1; y < airStop; y++) {
  const i = (y * img.w + airX) * img.bpp, j = ((y - 1) * img.w + airX) * img.bpp;
  const d = Math.max(Math.abs(img.px[i] - img.px[j]), Math.abs(img.px[i + 1] - img.px[j + 1]), Math.abs(img.px[i + 2] - img.px[j + 2]));
  if (d > 18) { airHits++; if (airRows.length < 6) { airRows.push(y); } }
}

console.log(`${file}   ${img.w}x${img.h}`);
console.log(`  roof mast   n=${String(mast.n).padStart(6)}  rows=${rows(mast)}  cols=${mast.n ? mast.left + ".." + mast.right : "-"}`);
console.log(`  roof tank   n=${String(tank.n).padStart(6)}  rows=${rows(tank)}  cols=${tank.n ? tank.left + ".." + tank.right : "-"}`);
console.log(`  roof hatch  n=${String(hatch.n).padStart(6)}  rows=${rows(hatch)}`);
console.log(`  button gold n=${String(gold.n).padStart(6)}  rows=${rows(gold)}`);
console.log(`  small print n=${String(print.n).padStart(6)}  rows=${rows(print)}`);
console.log(`  lit windows n=${String(lit.n).padStart(6)}  rows=${rows(lit)}  cols=${lit.n ? lit.left + ".." + lit.right : "-"}`);
console.log(`  tower band  filled rows=${String(rowsFilled).padStart(4)}/${foot - 2}  longest sky-through run=${String(throughBest).padStart(4)}px  lit in band=${litInBand}`);
console.log(`  sky column  x=${airX}  hard steps above the roof=${airHits}${airRows.length ? " at y=" + airRows.join(",") : ""}  (a star or two is fine)`);
console.log(`  roof-to-tower gap ${floatPx === null ? "-" : floatPx + "px"}  (sky rows between the roof and the top storey)`);
console.log("");
if (midTour) {
  console.log("  halfway up the tower — the roof is overhead and out of frame, so the roof checks do not apply");
  console.log(`  ${ok(throughBest <= 24)} no strip of sky where the lower storeys should be  (longest run ${throughBest}px, allowed 24)`);
  console.log(`  ${ok(litInBand > 400)} the window really paints storeys halfway up  (lit pixels in the tower band ${litInBand})`);
  console.log(`  ${ok(rowsFilled > (foot - 2) * 0.5)} most of the frame is building, not air  (${rowsFilled}/${foot - 2} rows)`);
} else {
  console.log(`  ${ok(mast.n > 40 && tank.n > 40)} the roof is painted at all (mast + tank both present)`);
  console.log(`  ${ok(roofTop !== 1e9 && roofTop > 6)} roof top inside the frame, not cut by the top edge  (top=${roofTop})`);
  console.log(`  ${ok(roofTop !== 1e9 && roofTop < h - 260)} roof up in the sky, not collapsed down by the street`);
  console.log(`  ${ok(mast.n >= 160 && tank.n >= 550 && hatch.n >= 160)} the whole roof is painted — not one row cut off  (mast ${mast.n}/168, tank ${tank.n}/576, hatch ${hatch.n}/176)`);
  console.log(`  ${ok(floatPx !== null && floatPx <= 24)} the roof sits ON the top storey — no sky between them  (gap ${floatPx}px, allowed 24)`);
  console.log(`  ${ok(lit.n > 400)} the facade is really there (lots of lit windows)  (n=${lit.n})`);
}
console.log(`  ${ok(print.n > 30 && print.bottom < h - 4)} small print under the button fully on screen  (bottom=${print.bottom}/${h})`);
console.log(`  ${ok(print.n > 30 && print.top > (gold.n ? gold.bottom : 0))} small print sits below the button rail`);
