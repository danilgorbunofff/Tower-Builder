/* ro.mjs — readout for shoot.mjs probe output files.
   node ro.mjs out-a.json [out-b.json ...] [--keys name,name] [--flags]        */
import { readFileSync } from "node:fs";

function parse(file){
  let s = readFileSync(file, "utf8");
  if(!s.includes("EVAL")) s = readFileSync(file, "utf16le");
  const at = s.indexOf("EVAL");
  const from = s.indexOf("{", at);
  const src = s.slice(from, s.lastIndexOf("}") + 1);
  try { return JSON.parse(src); }
  catch(e){ return { __parseError: String(e), __raw: src.slice(0, 400) }; }
}

const args = process.argv.slice(2);
const keys = (args.find(a => a.startsWith("--keys=")) || "").slice(7).split(",").filter(Boolean);
const wantFlags = args.includes("--flags");
const files = args.filter(a => !a.startsWith("--"));

for(const f of files){
  const o = parse(f);
  console.log("\n=== " + f + " ===");
  if(keys.length){
    for(const k of keys) if(k in o) console.log(k + ": " + JSON.stringify(o[k]));
  } else if(!wantFlags){
    console.log(JSON.stringify(o, null, 1));
  }
  const flags = [];
  (function walk(v, path){
    if(v && typeof v === "object"){
      for(const [k, x] of Object.entries(v)){
        if(k === "ok" && typeof x === "boolean") flags.push([path, x]);
        else walk(x, path ? path + "." + k : k);
      }
    }
  })(o, "");
  if(wantFlags || keys.length){
    const bad = flags.filter(([, v]) => !v);
    console.log("blocks: " + flags.length + "   failing: " + bad.length
      + (bad.length ? "  -> " + bad.map(([p]) => p).join(", ") : ""));
  }
  if(o.errs && o.errs.length) console.log("console errors: " + JSON.stringify(o.errs));
}
