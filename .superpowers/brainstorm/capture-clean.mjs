import { readFileSync, writeFileSync } from 'node:fs';
const CDIR = '/Users/spy/ToledoTech/repos/legendary-funicular/.superpowers/brainstorm/53468-1780891870/content';
// note: session dir resolved at runtime by caller; this script just wraps fragments
const wrap = (frag, bg) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body{margin:0;padding:24px;background:${bg};font-family:-apple-system,system-ui,sans-serif;}
  h2{color:#e8e8f0;margin:0 0 6px;font-size:22px;}
  .subtitle{color:#9a9ab0;font-size:13px;margin:0 0 18px;}
</style></head><body>${frag}</body></html>`;
const [,, inPath, outPath, bg] = process.argv;
const frag = readFileSync(inPath, 'utf8');
writeFileSync(outPath, wrap(frag, bg || '#0a0a12'));
console.log('wrapped', outPath);
