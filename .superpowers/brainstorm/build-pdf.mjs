import { readFileSync, writeFileSync } from 'node:fs';

const REPO = '/Users/spy/ToledoTech/repos/legendary-funicular';
const md = readFileSync(`${REPO}/docs/mycelium-bus-product-architecture-whitepaper.md`, 'utf8');

// inline the two diagrams as base64 data URIs
const img = (p) => 'data:image/png;base64,' + readFileSync(p).toString('base64');
const structural = img(`${REPO}/docs/assets/bus-architecture-structural.png`);
const runtime = img(`${REPO}/docs/assets/bus-architecture-runtime-flow.png`);

// --- tiny, dependency-free markdown -> HTML (scoped to what this doc uses) ---
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');

const lines = md.split('\n');
let html = '';
let i = 0;
const flushList = (buf, tag) => { if (buf.length) { html += `<${tag}>` + buf.map(li => `<li>${inline(li)}</li>`).join('') + `</${tag}>`; buf.length = 0; } };

while (i < lines.length) {
  let line = lines[i];

  // images
  const imgm = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
  if (imgm) {
    const src = imgm[2].includes('structural') ? structural : runtime;
    html += `<figure><img src="${src}" alt="${esc(imgm[1])}"/></figure>`;
    i++; continue;
  }
  // code fence
  if (line.startsWith('```')) {
    i++; let code = '';
    while (i < lines.length && !lines[i].startsWith('```')) { code += lines[i] + '\n'; i++; }
    i++; html += `<pre><code>${esc(code.trimEnd())}</code></pre>`; continue;
  }
  // tables
  if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|/.test(lines[i + 1])) {
    const parseRow = (r) => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    const head = parseRow(line); i += 2;
    let rows = '';
    while (i < lines.length && lines[i].includes('|')) { rows += '<tr>' + parseRow(lines[i]).map(c => `<td>${inline(c)}</td>`).join('') + '</tr>'; i++; }
    html += `<table><thead><tr>${head.map(h => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
    continue;
  }
  // headings
  let m;
  if ((m = line.match(/^(#{1,4})\s+(.*)/))) { const lvl = m[1].length; html += `<h${lvl}>${inline(m[2])}</h${lvl}>`; i++; continue; }
  // blockquote (may span multiple lines)
  if (line.startsWith('>')) {
    let bq = '';
    while (i < lines.length && lines[i].startsWith('>')) { bq += inline(lines[i].replace(/^>\s?/, '')) + '<br/>'; i++; }
    html += `<blockquote>${bq}</blockquote>`; continue;
  }
  // hr
  if (/^---+$/.test(line.trim())) { html += '<hr/>'; i++; continue; }
  // ordered list
  if (/^\d+\.\s/.test(line)) { const buf = []; while (i < lines.length && /^\d+\.\s/.test(lines[i])) { buf.push(lines[i].replace(/^\d+\.\s/, '')); i++; } flushList(buf, 'ol'); continue; }
  // unordered list
  if (/^[-*]\s/.test(line)) { const buf = []; while (i < lines.length && /^[-*]\s/.test(lines[i])) { buf.push(lines[i].replace(/^[-*]\s/, '')); i++; } flushList(buf, 'ul'); continue; }
  // blank
  if (line.trim() === '') { i++; continue; }
  // paragraph
  let para = line; i++;
  while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,4}\s|>|```|[-*]\s|\d+\.\s|!\[)/.test(lines[i]) && !/^---+$/.test(lines[i].trim())) { para += ' ' + lines[i]; i++; }
  html += `<p>${inline(para)}</p>`;
}

const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; line-height: 1.55; font-size: 11pt; }
h1 { font-size: 22pt; color: #0d3a47; border-bottom: 3px solid #1E9EBF; padding-bottom: 8px; margin: 0 0 4px; line-height: 1.2; }
h2 { font-size: 15pt; color: #0d3a47; margin-top: 26px; border-bottom: 1px solid #cdd; padding-bottom: 3px; page-break-after: avoid; }
h3 { font-size: 12.5pt; color: #155; margin-top: 18px; page-break-after: avoid; }
h4 { font-size: 11pt; color: #266; margin-top: 12px; }
p { margin: 8px 0; }
strong { color: #0d3a47; }
code { font-family: 'SF Mono', Menlo, monospace; font-size: 9.2pt; background: #eef4f6; color: #0a4453; padding: 1px 5px; border-radius: 3px; }
pre { background: #0d2027; color: #9fe0ec; padding: 12px 14px; border-radius: 6px; overflow-x: auto; border-left: 4px solid #1E9EBF; page-break-inside: avoid; }
pre code { background: none; color: inherit; font-size: 8.8pt; padding: 0; }
blockquote { background: #f4f9fb; border-left: 4px solid #1E9EBF; margin: 12px 0; padding: 8px 14px; color: #445; font-size: 10pt; }
table { border-collapse: collapse; width: 100%; margin: 14px 0; font-size: 9pt; font-family: -apple-system, system-ui, sans-serif; page-break-inside: auto; }
th { background: #0d3a47; color: #fff; text-align: left; padding: 7px 9px; font-size: 8.6pt; }
td { border: 1px solid #d4dde0; padding: 6px 9px; vertical-align: top; }
tr:nth-child(even) td { background: #f6fafb; }
tr { page-break-inside: avoid; }
ul, ol { margin: 8px 0; padding-left: 22px; }
li { margin: 4px 0; }
figure { margin: 16px 0; text-align: center; page-break-inside: avoid; }
figure img { max-width: 100%; border: 1px solid #ccd; border-radius: 8px; }
hr { border: none; border-top: 1px solid #dde; margin: 22px 0; }
h2 { page-break-before: auto; }
</style></head><body>${html}</body></html>`;

writeFileSync(`${REPO}/.superpowers/brainstorm/whitepaper.html`, doc);
console.log('wrote whitepaper.html');
