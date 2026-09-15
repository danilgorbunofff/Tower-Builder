/* fontserver.mjs — serves the app with its own pixel fonts actually available.

   The probes block fonts.googleapis.com because this machine cannot reach it, so
   every reading taken through tools/shoot.mjs alone is taken in Courier New. That
   is not what a visitor sees. In production the two arcade faces load in a few
   hundred milliseconds, and the type is measurably bigger for it: the sign stands
   3px taller and the name tag 18px wider with the real faces on.

   So the two environments do not agree and are not interchangeable, and a port is
   only worth judging against the one it will ship in. This server rewrites the
   Google stylesheet link to a local copy of the same three faces, so the original
   hand-written page can be measured the way it will actually be seen. `nofonts/`
   keeps the blocked reading as the record of the other environment.

     node baseline/fontserver.mjs [port]         # default 58695

   Nothing but that one link is touched, and the HTML is re-read on every request,
   so this can never drift away from index.html.
*/
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const ASSETS = join(HERE, "fonts-assets");
const PORT = Number(process.argv[2] || 58695);

const GOOGLE_LINK = /https:\/\/fonts\.googleapis\.com\/css2\?family=[^"]*/;
const TYPE = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
};

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://local").pathname);
  let body, type;

  if (path === "/" || path === "/index.html") {
    const html = readFileSync(join(ROOT, "index.html"), "utf8");
    if (!GOOGLE_LINK.test(html)) {
      res.writeHead(500, { "content-type": "text/plain" });
      return res.end("no google fonts link in index.html -- the rewrite is stale");
    }
    body = Buffer.from(html.replace(GOOGLE_LINK, "/fonts.css"), "utf8");
    type = TYPE[".html"];
  } else {
    /* basename() so a crafted path cannot climb out of fonts-assets/ */
    const name = basename(path);
    try {
      body = readFileSync(join(ASSETS, name));
    } catch {
      res.writeHead(404, { "content-type": "text/plain" });
      return res.end("not found");
    }
    type = TYPE[name.slice(name.lastIndexOf("."))] || "application/octet-stream";
  }

  res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`fontserver on http://127.0.0.1:${PORT}/index.html`);
});
