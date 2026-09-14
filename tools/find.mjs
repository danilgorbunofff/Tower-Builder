import fs from "node:fs";
import zlib from "node:zlib";
function dec(buf) {
  let i = 8, w = 0, h = 0, colorType = 0, idat = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i), type = buf.toString("ascii", i + 4, i + 8);
    const data = buf.subarray(i + 8, i + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); colorType = data[9]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    i += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat));
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
const hx = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const [file, ...cols] = process.argv.slice(2);
const { w, h, bpp, img } = dec(fs.readFileSync(file));
console.log(file.split("\\").pop(), w + "x" + h);
for (const c of cols) {
  const t = hx(c);
  let n = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * bpp;
    if (img[i] === t[0] && img[i + 1] === t[1] && img[i + 2] === t[2]) {
      n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  console.log(`  ${c} ${String(n).padStart(6)}  ${n ? `x ${x0}..${x1}  y ${y0}..${y1}` : "(absent)"}`);
}