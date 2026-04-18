// Mycelium Framework — VibeSpace LLC — The network provides.
//
// `mycelium sporenet` — cellular cultivation dashboard.
//
// Reads mycelium.yaml + state.json and emits a single auto-refreshing
// index.html that visualizes every leaf's status in real time. Generic
// across organisms — no product-specific strings.
//
// Subcommands:
//   init   — scaffold sporenet/ + initial state.json (all leaves pending)
//   render — regenerate index.html from current state.json
//   mark   — mark a leaf as done/active/failed with a commit SHA
//   serve  — start a tiny static server (optional --port)

import { Command } from "commander";
import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { execFileSync } from "node:child_process";
import YAML from "yaml";
import type { BaseEvent, DDPStageId } from "../lib/telemetry/events.js";
import { DDP_STAGES } from "../lib/telemetry/ddp-stages.js";

interface Leaf {
  id: string;
  agent: string;
  tag: string;
  scope: string;
  status: "pending" | "active" | "done" | "failed";
  commit?: string;
  started_at?: string;
  completed_at?: string;
}

interface SporeNetState {
  session_id: string;
  organism: string;
  started_at: string;
  ship_target?: string;
  gating?: string;
  total: number;
  leaves: Leaf[];
}

const AGENT_PALETTE = [
  "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981", "#e11d48",
  "#ec4899", "#3b82f6", "#84cc16", "#f97316", "#a855f7",
  "#14b8a6", "#eab308", "#6366f1", "#22c55e", "#ef4444",
];

function agentColor(agentId: string, allAgents: string[]): string {
  const idx = allAgents.indexOf(agentId);
  return AGENT_PALETTE[idx % AGENT_PALETTE.length];
}

function walkLeaves(agent: any, accumulator: Leaf[]): void {
  if (!agent.sub_agents || agent.sub_agents.length === 0) {
    accumulator.push({
      id: agent.id,
      agent: agent._biome,
      tag: agent._tag,
      scope: agent.scope,
      status: "pending",
    });
    return;
  }
  for (const sa of agent.sub_agents) {
    walkLeaves({ ...sa, _biome: agent._biome, _tag: agent._tag }, accumulator);
  }
}

function extractLeaves(mycelium: any): Leaf[] {
  const leaves: Leaf[] = [];
  for (const biome of mycelium.agents ?? []) {
    const tag = biome.id.replace(/-agent$/, "").toUpperCase();
    walkLeaves({ ...biome, _biome: biome.id, _tag: tag }, leaves);
  }
  return leaves;
}

function loadMycelium(dir: string): any {
  const yamlPath = [
    path.join(dir, "mycelium.yaml"),
    ...(fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((f) => f.endsWith("-mycelium.yaml"))
          .map((f) => path.join(dir, f))
      : []),
  ].find((p) => fs.existsSync(p));

  if (!yamlPath) {
    console.log(chalk.red(`  ❌ mycelium.yaml not found in ${dir}`));
    process.exit(1);
  }
  return YAML.parse(fs.readFileSync(yamlPath, "utf-8"));
}

function renderHtml(state: SporeNetState, mycelium: any): string {
  const biomes = (mycelium.agents ?? []).map((a: any) => a.id);
  const byBiome = new Map<string, Leaf[]>();
  for (const id of biomes) byBiome.set(id, []);
  for (const leaf of state.leaves) {
    const bucket = byBiome.get(leaf.agent);
    if (bucket) bucket.push(leaf);
  }

  const done = state.leaves.filter((l) => l.status === "done").length;
  const pct = state.total > 0 ? (done * 100) / state.total : 0;
  const lastLeaf = [...state.leaves]
    .filter((l) => l.status === "done")
    .sort((a, b) =>
      (b.completed_at ?? "").localeCompare(a.completed_at ?? "")
    )[0];

  const recentEvents = [...state.leaves]
    .filter((l) => l.status === "done")
    .sort((a, b) =>
      (b.completed_at ?? "").localeCompare(a.completed_at ?? "")
    )
    .slice(0, 20);

  const biomeCards = biomes
    .map((biomeId: string) => {
      const leaves = byBiome.get(biomeId) ?? [];
      const biomeDone = leaves.filter((l) => l.status === "done").length;
      const biomePct =
        leaves.length > 0 ? (biomeDone * 100) / leaves.length : 0;
      const color = agentColor(biomeId, biomes);
      const leafHtml = leaves
        .map((l) => {
          const cls = `leaf ${l.status}`;
          const commit = l.commit
            ? `<span class="commit">${l.commit.slice(0, 7)}</span>`
            : "";
          return `<div class="${cls}" data-leaf-id="${escapeHtml(
            l.id
          )}" role="button" tabindex="0"><span class="dot">●</span><span class="lid">${escapeHtml(
            l.id
          )}</span> ${commit}<div class="scope">${escapeHtml(
            l.scope
          )}</div></div>`;
        })
        .join("");
      return `<div class="agent" style="--agent-color:${color}">
  <div class="agent-head">
    <span class="agent-name">${escapeHtml(biomeId)}</span>
    <span class="agent-count">${biomeDone}/${leaves.length}</span>
  </div>
  <div class="agent-bar"><div class="agent-fill" style="width:${biomePct.toFixed(
    1
  )}%"></div></div>
  <div class="leaves">${leafHtml}</div>
</div>`;
    })
    .join("\n");

  const eventHtml = recentEvents
    .map((e) => {
      const t = e.completed_at ? e.completed_at.slice(11, 19) : "";
      const commit = e.commit ? e.commit.slice(0, 7) : "";
      return `<div class="event"><div class="ev-time">${t}</div><div class="ev-tag" style="color:${agentColor(
        e.agent,
        biomes
      )}">${escapeHtml(e.tag)}</div><div class="ev-id">${escapeHtml(
        e.id
      )}</div><div class="ev-commit">${commit}</div></div>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>SporeNet — ${escapeHtml(state.organism)} Cultivation ${escapeHtml(
    state.session_id
  )}</title>
<style>
:root { --bg:#0a0a0f; --panel:#12121a; --fg:#e5e7eb; --muted:#6b7280; --red:#e11d48; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:13px/1.5 ui-monospace,"SF Mono",Menlo,monospace; }
header { padding:24px 32px; border-bottom:1px solid #222; display:flex; justify-content:space-between; align-items:baseline; }
h1 { margin:0; font:600 22px/1 ui-serif,Georgia,serif; color:var(--red); letter-spacing:-.5px; }
.session { color:var(--muted); font-size:11px; }
.hero { padding:24px 32px; border-bottom:1px solid #222; }
.pct { font:300 72px/1 ui-serif,Georgia,serif; color:var(--fg); }
.pct small { font-size:18px; color:var(--muted); margin-left:8px; }
.bar { height:4px; background:#1f1f2a; border-radius:2px; overflow:hidden; margin-top:16px; }
.fill { height:100%; background:linear-gradient(90deg,var(--red),#f97316); transition:width .6s; }
.meta { display:flex; gap:32px; margin-top:16px; color:var(--muted); font-size:11px; flex-wrap:wrap; }
.meta b { color:var(--fg); font-weight:600; }
main { display:grid; grid-template-columns:1fr 320px; gap:0; }
.grid { padding:24px 32px; display:grid; grid-template-columns:repeat(auto-fill,minmax(380px,1fr)); gap:16px; }
.agent { background:var(--panel); border:1px solid #1f1f2a; border-radius:8px; padding:16px; border-left:3px solid var(--agent-color); }
.agent-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
.agent-name { font-weight:600; color:var(--agent-color); }
.agent-count { color:var(--muted); font-size:11px; }
.agent-bar { height:2px; background:#1f1f2a; margin-bottom:12px; }
.agent-fill { height:100%; background:var(--agent-color); transition:width .6s; }
.leaves { display:flex; flex-direction:column; gap:4px; }
.leaf { padding:6px 8px; border-radius:4px; font-size:11px; border-left:2px solid transparent; }
.leaf.done { opacity:.55; border-left-color:var(--agent-color); }
.leaf.active { background:#1f1f2a; border-left-color:var(--red); animation:pulse 1s infinite; }
.leaf.pending { opacity:.35; }
.leaf.failed { background:#2a0a0a; border-left-color:#ef4444; }
.leaf .dot { margin-right:6px; color:var(--agent-color); }
.leaf.pending .dot { color:var(--muted); }
.leaf.failed .dot { color:#ef4444; }
.lid { color:var(--fg); }
.commit { color:var(--muted); margin-left:6px; font-size:10px; }
.scope { color:var(--muted); font-size:10px; margin-top:2px; margin-left:16px; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.6} }
aside { background:var(--panel); border-left:1px solid #1f1f2a; padding:24px; height:100vh; overflow-y:auto; position:sticky; top:0; }
aside h2 { margin:0 0 12px; font-size:11px; text-transform:uppercase; letter-spacing:1px; color:var(--muted); font-weight:600; }
.event { display:grid; grid-template-columns:60px 80px 1fr 60px; gap:8px; padding:6px 0; border-bottom:1px solid #1f1f2a; font-size:10px; }
.ev-time { color:var(--muted); }
.ev-tag { font-weight:600; }
.ev-id { color:var(--fg); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ev-commit { color:var(--muted); font-family:ui-monospace; }
footer { padding:16px 32px; color:var(--muted); font-size:10px; border-top:1px solid #222; text-align:center; }
@media (max-width: 900px) {
  main { grid-template-columns:1fr; }
  aside { position:static; height:auto; border-left:0; border-top:1px solid #1f1f2a; }
}
.leaf { cursor:pointer; transition:background .15s,border-left-color .15s; }
.leaf:hover { background:#1f1f2a; border-left-color:var(--agent-color); opacity:1; }
.leaf:focus { outline:1px solid var(--agent-color); outline-offset:1px; }
.modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.7); backdrop-filter:blur(4px); display:none; z-index:100; align-items:center; justify-content:center; padding:24px; }
.modal-backdrop.open { display:flex; }
.modal { background:var(--panel); border:1px solid #2a2a3a; border-left:3px solid var(--modal-color,var(--red)); border-radius:10px; max-width:560px; width:100%; padding:24px; font:13px/1.5 ui-monospace,"SF Mono",Menlo,monospace; color:var(--fg); box-shadow:0 20px 60px rgba(0,0,0,.5); max-height:90vh; overflow-y:auto; }
.modal h3 { margin:0 0 4px; font:600 16px/1.3 ui-monospace,Menlo,monospace; color:var(--modal-color,var(--fg)); word-break:break-all; }
.modal .modal-tag { display:inline-block; font-size:10px; padding:2px 8px; border-radius:3px; background:var(--modal-color,var(--red)); color:#0a0a0f; font-weight:600; letter-spacing:.5px; }
.modal .modal-status { display:inline-block; font-size:10px; padding:2px 8px; border-radius:3px; margin-left:6px; font-weight:600; text-transform:uppercase; }
.modal .modal-status.done { background:#10b981; color:#0a0a0f; }
.modal .modal-status.active { background:#e11d48; color:#fff; animation:pulse 1s infinite; }
.modal .modal-status.pending { background:#1f1f2a; color:var(--muted); }
.modal .modal-status.failed { background:#ef4444; color:#fff; }
.modal dl { display:grid; grid-template-columns:100px 1fr; gap:8px 12px; margin:16px 0 0; }
.modal dt { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.5px; }
.modal dd { margin:0; color:var(--fg); font-size:12px; word-break:break-all; }
.modal dd.scope { color:#a3a3a3; line-height:1.6; }
.modal dd .commit-sha { color:#f59e0b; font-weight:600; }
.modal .modal-actions { margin-top:20px; display:flex; gap:8px; justify-content:flex-end; }
.modal button { background:#1f1f2a; border:1px solid #2a2a3a; color:var(--fg); padding:6px 14px; border-radius:4px; font:12px ui-monospace,Menlo,monospace; cursor:pointer; }
.modal button:hover { background:#2a2a3a; }
.modal .empty { color:var(--muted); font-style:italic; }
.modal .diff-section { margin-top:18px; border-top:1px solid #1f1f2a; padding-top:14px; }
.modal .diff-section h4 { margin:0 0 8px; font-size:11px; text-transform:uppercase; letter-spacing:.5px; color:var(--muted); font-weight:600; }
.modal .diff-subject { color:var(--fg); font-size:12px; margin-bottom:10px; padding:8px 10px; background:#1f1f2a; border-radius:4px; border-left:2px solid var(--modal-color,var(--red)); white-space:pre-wrap; }
.modal .diff-stat { color:#a3a3a3; font-size:10px; white-space:pre; margin-bottom:10px; padding:8px 10px; background:#0a0a0f; border-radius:4px; overflow-x:auto; }
.modal .diff-patch { font-size:10px; background:#0a0a0f; border-radius:4px; padding:10px; overflow:auto; max-height:360px; white-space:pre; border:1px solid #1f1f2a; }
.modal .diff-patch .diff-hunk { color:#6366f1; }
.modal .diff-patch .diff-add  { color:#22c55e; background:#042f1f; display:block; }
.modal .diff-patch .diff-del  { color:#ef4444; background:#2f0a0a; display:block; }
.modal .diff-patch .diff-meta { color:var(--muted); }
.modal .diff-loading { color:var(--muted); font-style:italic; font-size:11px; }
</style></head><body>
<header>
  <div><h1>SporeNet · ${escapeHtml(
    state.organism
  )}</h1><div class="session">execution ${escapeHtml(
    state.session_id
  )} · the network provides</div></div>
  <div class="session">auto-refresh 3s</div>
</header>
<section class="hero">
  <div class="pct">${done}<small>/ ${state.total} leaves fruited · ${pct.toFixed(
    1
  )}%</small></div>
  <div class="bar"><div class="fill" style="width:${pct.toFixed(
    1
  )}%"></div></div>
  <div class="meta">
    <div>started <b>${escapeHtml(state.started_at)}</b></div>
    <div>last <b>${
      lastLeaf
        ? escapeHtml(lastLeaf.id) +
          " @ " +
          (lastLeaf.commit ?? "").slice(0, 7)
        : "—"
    }</b></div>
    ${
      state.ship_target
        ? `<div>ship target <b>${escapeHtml(state.ship_target)}</b></div>`
        : ""
    }
    ${
      state.gating
        ? `<div>gate <b>${escapeHtml(state.gating)}</b></div>`
        : ""
    }
  </div>
</section>
<main>
  <div class="grid">
${biomeCards}
  </div>
  <aside>
    <h2>Recent fruits</h2>
    ${eventHtml || '<div class="session">no completions yet</div>'}
  </aside>
</main>
<footer>Mycelium Framework · VibeSpace LLC · the network provides 🍄</footer>
<div class="modal-backdrop" id="modal-backdrop" aria-hidden="true">
  <div class="modal" role="dialog" aria-modal="true" id="modal-body"></div>
</div>
<script>
(function(){
  const AGENT_PALETTE = ${JSON.stringify(AGENT_PALETTE)};
  const BIOMES = ${JSON.stringify(biomes)};
  function agentColor(agentId){ const idx = BIOMES.indexOf(agentId); return AGENT_PALETTE[idx % AGENT_PALETTE.length] || "#e11d48"; }
  function esc(s){ return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function fmtTime(iso){ if(!iso) return null; try { return new Date(iso).toLocaleString(); } catch(e){ return iso; } }
  function duration(start, end){ if(!start || !end) return null; const ms = new Date(end) - new Date(start); if(isNaN(ms) || ms < 0) return null; if(ms < 1000) return ms + "ms"; if(ms < 60000) return (ms/1000).toFixed(1) + "s"; if(ms < 3600000) return (ms/60000).toFixed(1) + "m"; return (ms/3600000).toFixed(1) + "h"; }

  const backdrop = document.getElementById("modal-backdrop");
  const body = document.getElementById("modal-body");

  function openLeafModal(leafId){
    fetch("/state.json?t=" + Date.now()).then(r => r.json()).then(state => {
      const leaf = state.leaves.find(l => l.id === leafId);
      if (!leaf) return;
      const color = agentColor(leaf.agent);
      body.style.setProperty("--modal-color", color);
      const dur = duration(leaf.started_at, leaf.completed_at);
      const rows = [
        ["Biome", esc(leaf.agent)],
        ["Tag", esc(leaf.tag)],
        ["Scope", '<span class="scope">' + esc(leaf.scope) + '</span>'],
        leaf.commit ? ["Commit", '<span class="commit-sha">' + esc(leaf.commit) + '</span>'] : null,
        leaf.started_at ? ["Started", esc(fmtTime(leaf.started_at))] : null,
        leaf.completed_at ? ["Completed", esc(fmtTime(leaf.completed_at))] : null,
        dur ? ["Duration", esc(dur)] : null,
      ].filter(Boolean);
      const diffSection = leaf.commit
        ? '<div class="diff-section" id="diff-section"><h4>Code change</h4><div class="diff-loading">loading diff for ' + esc(leaf.commit.slice(0,7)) + '…</div></div>'
        : (leaf.status === "done" ? '<div class="diff-section"><h4>Code change</h4><div class="empty">no commit SHA recorded for this leaf</div></div>' : '');
      body.innerHTML =
        '<span class="modal-tag">' + esc(leaf.tag) + '</span>' +
        '<span class="modal-status ' + esc(leaf.status) + '">' + esc(leaf.status) + '</span>' +
        '<h3>' + esc(leaf.id) + '</h3>' +
        '<dl>' + rows.map(([k,v]) => '<dt>' + k + '</dt><dd>' + v + '</dd>').join("") + '</dl>' +
        diffSection +
        '<div class="modal-actions">' +
        (leaf.commit ? '<button onclick="navigator.clipboard.writeText(\\'' + esc(leaf.commit) + '\\')">copy SHA</button>' : '') +
        '<button onclick="closeModal()">close</button>' +
        '</div>';
      backdrop.classList.add("open");
      backdrop.setAttribute("aria-hidden", "false");

      if (leaf.commit) {
        fetch("/diff/" + encodeURIComponent(leaf.id) + "?t=" + Date.now())
          .then(r => r.json())
          .then(data => {
            const target = document.getElementById("diff-section");
            if (!target) return;
            if (!data.diff && data.message) {
              target.innerHTML = '<h4>Code change</h4><div class="empty">' + esc(data.message) + '</div>';
              return;
            }
            target.innerHTML =
              '<h4>Code change · <span class="commit-sha">' + esc(leaf.commit.slice(0,7)) + '</span></h4>' +
              (data.subject ? '<div class="diff-subject">' + esc(data.subject) + '</div>' : '') +
              (data.stat    ? '<div class="diff-stat">'    + esc(data.stat)    + '</div>' : '') +
              (data.diff    ? '<div class="diff-patch">'   + highlightDiff(data.diff) + '</div>' : '');
          })
          .catch(err => {
            const target = document.getElementById("diff-section");
            if (target) target.innerHTML = '<h4>Code change</h4><div class="empty">error loading diff: ' + esc(String(err)) + '</div>';
          });
      }
    }).catch(err => console.error("sporenet fetch error", err));
  }

  function highlightDiff(text){
    const lines = String(text).split("\\n");
    return lines.map(line => {
      const escaped = esc(line);
      if (line.startsWith("@@")) return '<span class="diff-hunk">' + escaped + '</span>';
      if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff --git") || line.startsWith("index ")) return '<span class="diff-meta">' + escaped + '</span>';
      if (line.startsWith("+")) return '<span class="diff-add">' + escaped + '</span>';
      if (line.startsWith("-")) return '<span class="diff-del">' + escaped + '</span>';
      return escaped;
    }).join("\\n");
  }

  window.closeModal = function(){
    backdrop.classList.remove("open");
    backdrop.setAttribute("aria-hidden", "true");
  };

  document.addEventListener("click", function(e){
    const leaf = e.target.closest("[data-leaf-id]");
    if (leaf) { e.preventDefault(); openLeafModal(leaf.dataset.leafId); return; }
    if (e.target === backdrop) closeModal();
  });
  document.addEventListener("keydown", function(e){
    if (e.key === "Escape") closeModal();
    if (e.key === "Enter" || e.key === " ") {
      const leaf = e.target.closest && e.target.closest("[data-leaf-id]");
      if (leaf) { e.preventDefault(); openLeafModal(leaf.dataset.leafId); }
    }
  });

  // Polling refresh that preserves modal state + scroll position.
  setInterval(function(){
    if (backdrop.classList.contains("open")) return;
    const y = window.scrollY;
    fetch(window.location.pathname + "?t=" + Date.now()).then(r => r.text()).then(html => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const freshMain = doc.querySelector("main");
      const freshHero = doc.querySelector(".hero");
      if (freshMain) document.querySelector("main").replaceWith(freshMain);
      if (freshHero) document.querySelector(".hero").replaceWith(freshHero);
      window.scrollTo(0, y);
    }).catch(()=>{});
  }, 3000);
})();
</script>
</body></html>`;
}

function handleDiffRequest(res: http.ServerResponse, dir: string, leafId: string): void {
  const statePath = path.join(dir, "sporenet", "state.json");
  if (!fs.existsSync(statePath)) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "state.json not found" }));
    return;
  }
  try {
    const state: SporeNetState = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    const leaf = state.leaves.find((l) => l.id === leafId);
    if (!leaf) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `leaf "${leafId}" not found` }));
      return;
    }
    if (!leaf.commit) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ leaf_id: leafId, commit: null, diff: null, message: "no commit recorded for this leaf" }));
      return;
    }

    let stat = "";
    let patch = "";
    let subject = "";
    try {
      subject = execFileSync("git", ["-C", dir, "log", "-1", "--format=%s%n%n%b", leaf.commit], { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    } catch {}
    try {
      stat = execFileSync("git", ["-C", dir, "show", "--stat", "--format=", leaf.commit], { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    } catch (e: any) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ leaf_id: leafId, commit: leaf.commit, diff: null, message: `commit ${leaf.commit} not found in repo at ${dir}` }));
      return;
    }
    try {
      patch = execFileSync("git", ["-C", dir, "show", "--format=", leaf.commit], { encoding: "utf-8", maxBuffer: 8 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    } catch {}

    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ leaf_id: leafId, commit: leaf.commit, subject, stat, diff: patch }));
  } catch (err: any) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err?.message ?? String(err) }));
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Fleet route handlers

async function handleFleetOrganismsRequest(res: http.ServerResponse, dir: string): Promise<void> {
  try {
    // Import query functions dynamically (will be provided by fleet.query.api leaf)
    const queriesPath = path.join(dir, "cli/src/lib/fleet/queries.js");

    if (!fs.existsSync(queriesPath)) {
      // Fallback: scan .mycelium/events directory for organism names
      const eventsDir = path.join(dir, ".mycelium/events");
      const organisms: Array<{ name: string; last_run_at: string | null; run_count: number }> = [];

      if (fs.existsSync(eventsDir)) {
        const files = fs.readdirSync(eventsDir).filter(f => f.endsWith(".jsonl"));
        const organismSet = new Set<string>();

        for (const file of files) {
          const match = file.match(/^([^-]+)-/);
          if (match) {
            organismSet.add(match[1]);
          }
        }

        for (const name of organismSet) {
          organisms.push({ name, last_run_at: null, run_count: 0 });
        }
      }

      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(organisms));
      return;
    }

    // Use the fleet query API when available
    const { listOrganisms } = await import(queriesPath);
    const organisms = await listOrganisms();

    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(organisms));
  } catch (err: any) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err?.message ?? String(err) }));
  }
}

async function handleFleetOrganismDetailRequest(res: http.ServerResponse, dir: string, name: string): Promise<void> {
  try {
    const queriesPath = path.join(dir, "cli/src/lib/fleet/queries.js");

    if (!fs.existsSync(queriesPath)) {
      // Fallback: return stub data
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({
        organism: name,
        avg_health: null,
        total_runs: 0,
        total_cost_usd: null,
        last_health: null,
        last_run_wall_ms: null,
        stage_durations: []
      }));
      return;
    }

    // Use the fleet query API when available
    const { organismRollup, stageDurations } = await import(queriesPath);
    const rollup = await organismRollup(name);
    const stages = await stageDurations(name);

    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ ...rollup, stage_durations: stages }));
  } catch (err: any) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err?.message ?? String(err) }));
  }
}

async function handleFleetPageRequest(res: http.ServerResponse, dir: string): Promise<void> {
  try {
    const templatePath = path.join(dir, "cli/src/commands/sporenet/templates/fleet.html");

    if (!fs.existsSync(templatePath)) {
      // Render a minimal fleet page inline if template doesn't exist yet
      const html = renderFleetPageFallback();
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(html);
      return;
    }

    // Serve the template when available (will be provided by fleet.view.render leaf)
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(templatePath, "utf-8"));
  } catch (err: any) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Error rendering fleet page: " + (err?.message ?? String(err)));
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Events API — reads from JSONL event log
// ────────────────────────────────────────────────────────────────────────────

/**
 * Find the current run's JSONL file by scanning .mycelium/events/ for the most
 * recent file that matches the organism name from mycelium.yaml.
 *
 * @param dir - The organism directory
 * @returns Path to the current run's JSONL file, or null if none found
 */
function findCurrentRunFile(dir: string): string | null {
  const eventsDir = path.join(dir, ".mycelium/events");

  if (!fs.existsSync(eventsDir)) {
    return null;
  }

  // Load organism name from mycelium.yaml for cross-reference
  let organismName: string | null = null;
  try {
    const mycelium = loadMycelium(dir);
    organismName = mycelium.organism?.name ?? null;
  } catch {
    // If we can't load mycelium.yaml, we'll just use the most recent file
  }

  // Get all JSONL files, sorted by modification time (newest first)
  const files = fs.readdirSync(eventsDir)
    .filter(f => f.endsWith(".jsonl"))
    .map(f => ({
      name: f,
      path: path.join(eventsDir, f),
      mtime: fs.statSync(path.join(eventsDir, f)).mtime.getTime(),
    }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length === 0) {
    return null;
  }

  // If we have an organism name, prefer files that match it
  if (organismName) {
    const matching = files.find(f => f.name.startsWith(organismName + "-"));
    if (matching) {
      return matching.path;
    }
  }

  // Fall back to the most recent file
  return files[0].path;
}

/**
 * Parse JSONL file into array of events.
 *
 * @param filePath - Path to the JSONL file
 * @returns Array of parsed events
 */
function parseJSONLFile(filePath: string): BaseEvent[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n").filter(line => line.trim());
  const events: BaseEvent[] = [];

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as BaseEvent;
      events.push(event);
    } catch {
      // Skip malformed lines — best effort, never block
    }
  }

  return events;
}

/**
 * Handle GET /api/events?since=<ts>&limit=<n>
 *
 * Returns events from the current run's JSONL file, optionally filtered by
 * timestamp and limited to N results.
 *
 * @param res - HTTP response object
 * @param dir - Organism directory
 * @param query - Query string (everything after ?)
 */
function handleEventsRequest(
  res: http.ServerResponse,
  dir: string,
  query: string
): void {
  try {
    // Parse query parameters
    const params = new URLSearchParams(query);
    const sinceParam = params.get("since");
    const limitParam = params.get("limit");

    // Find the current run's JSONL file
    const jsonlPath = findCurrentRunFile(dir);

    if (!jsonlPath) {
      // No events file exists — return empty array (not an error)
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify([]));
      return;
    }

    // Parse all events from the file
    let events = parseJSONLFile(jsonlPath);

    // Filter by timestamp if `since` parameter provided
    if (sinceParam) {
      const sinceDate = new Date(sinceParam);
      if (!isNaN(sinceDate.getTime())) {
        events = events.filter(e => {
          const eventDate = new Date(e.ts);
          return !isNaN(eventDate.getTime()) && eventDate > sinceDate;
        });
      }
    }

    // Apply limit if provided
    if (limitParam) {
      const limit = parseInt(limitParam, 10);
      if (!isNaN(limit) && limit > 0) {
        events = events.slice(-limit); // Take the last N events (most recent)
      }
    }

    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(events));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: message }));
  }
}

// ────────────────────────────────────────────────────────────────────────────
// /api/state — serve state.json as JSON
// ────────────────────────────────────────────────────────────────────────────

function handleStateRequest(res: http.ServerResponse, dir: string): void {
  const statePath = path.join(dir, "sporenet", "state.json");
  if (!fs.existsSync(statePath)) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "state.json not found" }));
    return;
  }
  try {
    const content = fs.readFileSync(statePath, "utf-8");
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(content);
  } catch (err: unknown) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  }
}

// ────────────────────────────────────────────────────────────────────────────
// /api/events/stream — SSE endpoint tailing the current JSONL run file
// ────────────────────────────────────────────────────────────────────────────

function handleSSEStream(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  dir: string
): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "X-Accel-Buffering": "no",
  });

  // Send a heartbeat immediately so the browser knows the connection is open
  res.write(": connected\n\n");

  const jsonlPath = findCurrentRunFile(dir);

  if (!jsonlPath) {
    // No JSONL file yet — send an idle event and keep polling for the file
    res.write('event: idle\ndata: {}\n\n');
  } else {
    // Send all existing events first (catch-up)
    try {
      const existing = parseJSONLFile(jsonlPath);
      for (const ev of existing) {
        res.write(`data: ${JSON.stringify(ev)}\n\n`);
      }
    } catch {}
  }

  // Track byte offset to only emit new lines
  let offset = 0;
  if (jsonlPath && fs.existsSync(jsonlPath)) {
    try { offset = fs.statSync(jsonlPath).size; } catch {}
  }

  // Heartbeat every 15s to keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch {}
  }, 15000);

  // Poll for new content every 500ms (fs.watchFile-style but simpler)
  const poll = setInterval(() => {
    const current = findCurrentRunFile(dir);
    if (!current) return;
    try {
      const stat = fs.statSync(current);
      if (stat.size <= offset) return;
      const fd = fs.openSync(current, "r");
      const newBytes = stat.size - offset;
      const buf = Buffer.alloc(newBytes);
      fs.readSync(fd, buf, 0, newBytes, offset);
      fs.closeSync(fd);
      offset = stat.size;
      const chunk = buf.toString("utf-8");
      const lines = chunk.split("\n").filter((l) => l.trim());
      for (const line of lines) {
        try {
          const ev = JSON.parse(line);
          res.write(`data: ${JSON.stringify(ev)}\n\n`);
        } catch {}
      }
    } catch {}
  }, 500);

  req.on("close", () => {
    clearInterval(heartbeat);
    clearInterval(poll);
  });
}

function renderFleetPageFallback(): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>Fleet · Mycelium</title>
<style>
:root { --bg:#0a0a0f; --panel:#12121a; --fg:#e5e7eb; --muted:#6b7280; --red:#e11d48; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:13px/1.5 ui-monospace,"SF Mono",Menlo,monospace; }
header { padding:24px 32px; border-bottom:1px solid #222; }
h1 { margin:0; font:600 22px/1 ui-serif,Georgia,serif; color:var(--red); letter-spacing:-.5px; }
.subtitle { color:var(--muted); font-size:11px; margin-top:4px; }
main { padding:24px 32px; }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(360px,1fr)); gap:16px; margin-top:24px; }
.card { background:var(--panel); border:1px solid #1f1f2a; border-radius:8px; padding:20px; border-left:3px solid var(--red); }
.card h2 { margin:0 0 12px; font:600 16px/1.2 ui-monospace,Menlo,monospace; color:var(--fg); }
.card .stat { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #1f1f2a; font-size:11px; }
.card .stat:last-child { border:0; }
.card .stat dt { color:var(--muted); }
.card .stat dd { margin:0; color:var(--fg); font-weight:600; }
.empty { text-align:center; padding:80px 32px; color:var(--muted); }
footer { padding:16px 32px; color:var(--muted); font-size:10px; border-top:1px solid #222; text-align:center; margin-top:40px; }
</style>
</head><body>
<header>
  <h1>Fleet Overview</h1>
  <div class="subtitle">Cross-organism dashboard · the network provides</div>
</header>
<main id="main">
  <div class="empty">Loading organisms...</div>
</main>
<footer>Mycelium Framework · VibeSpace LLC · the network provides 🍄</footer>
<script>
(function(){
  fetch("/api/fleet/organisms")
    .then(r => r.json())
    .then(organisms => {
      const main = document.getElementById("main");
      if (!organisms || organisms.length === 0) {
        main.innerHTML = '<div class="empty">No organisms found. Run a cultivation to see results here.</div>';
        return;
      }

      const cards = organisms.map(org => {
        const runCount = org.run_count ?? 0;
        const lastRun = org.last_run_at ? new Date(org.last_run_at).toLocaleString() : "—";

        return \`<div class="card">
          <h2>\${escapeHtml(org.name)}</h2>
          <dl class="stat">
            <dt>Total runs</dt>
            <dd>\${runCount}</dd>
          </dl>
          <dl class="stat">
            <dt>Last run</dt>
            <dd>\${escapeHtml(lastRun)}</dd>
          </dl>
        </div>\`;
      }).join("");

      main.innerHTML = '<div class="grid">' + cards + '</div>';
    })
    .catch(err => {
      document.getElementById("main").innerHTML =
        '<div class="empty">Error loading organisms: ' + escapeHtml(String(err)) + '</div>';
    });

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
</script>
</body></html>`;
}

export function registerSporenetCommand(program: Command): void {
  const sn = program
    .command("sporenet")
    .description("🍄 Cellular cultivation dashboard — live viz of leaf status");

  sn.command("init")
    .description("Scaffold sporenet/ with state.json + rendered index.html")
    .option(
      "-d, --dir <dir>",
      "Organism directory (must have mycelium.yaml)",
      process.cwd()
    )
    .option(
      "-s, --session <id>",
      "Session id",
      `exec-${new Date().toISOString().replace(/[:.]/g, "-")}`
    )
    .action((opts) => {
      const dir = path.resolve(opts.dir);
      const mycelium = loadMycelium(dir);
      const leaves = extractLeaves(mycelium);
      const state: SporeNetState = {
        session_id: opts.session,
        organism: mycelium.organism?.name ?? path.basename(dir),
        started_at: new Date().toISOString(),
        ship_target: mycelium.organism?.ship_target,
        gating: mycelium.organism?.gating,
        total: leaves.length,
        leaves,
      };
      const snDir = path.join(dir, "sporenet");
      fs.mkdirSync(snDir, { recursive: true });
      fs.writeFileSync(
        path.join(snDir, "state.json"),
        JSON.stringify(state, null, 2)
      );
      fs.writeFileSync(
        path.join(snDir, "index.html"),
        renderHtml(state, mycelium)
      );
      console.log(
        chalk.greenBright(
          `  ✔ SporeNet seeded: ${leaves.length} leaves across ${
            mycelium.agents?.length ?? 0
          } biomes`
        )
      );
      console.log(chalk.gray("    ") + chalk.yellow(snDir + "/index.html"));
    });

  sn.command("render")
    .description("Re-render sporenet/index.html from current state.json")
    .option("-d, --dir <dir>", "Organism directory", process.cwd())
    .action((opts) => {
      const dir = path.resolve(opts.dir);
      const mycelium = loadMycelium(dir);
      const statePath = path.join(dir, "sporenet", "state.json");
      if (!fs.existsSync(statePath)) {
        console.log(
          chalk.red("  ❌ sporenet/state.json not found. Run `mycelium sporenet init` first.")
        );
        process.exit(1);
      }
      const state: SporeNetState = JSON.parse(
        fs.readFileSync(statePath, "utf-8")
      );
      fs.writeFileSync(
        path.join(dir, "sporenet", "index.html"),
        renderHtml(state, mycelium)
      );
      console.log(chalk.greenBright("  ✔ Re-rendered sporenet/index.html"));
    });

  sn.command("mark <leafId>")
    .description("Mark a leaf done|active|failed with optional commit SHA")
    .option("-d, --dir <dir>", "Organism directory", process.cwd())
    .option("-s, --status <status>", "done|active|failed|pending", "done")
    .option("-c, --commit <sha>", "Commit SHA")
    .action((leafId: string, opts) => {
      const dir = path.resolve(opts.dir);
      const mycelium = loadMycelium(dir);
      const statePath = path.join(dir, "sporenet", "state.json");
      const state: SporeNetState = JSON.parse(
        fs.readFileSync(statePath, "utf-8")
      );
      const leaf = state.leaves.find((l) => l.id === leafId);
      if (!leaf) {
        console.log(chalk.red(`  ❌ Leaf "${leafId}" not found`));
        process.exit(1);
      }
      leaf.status = opts.status;
      if (opts.commit) leaf.commit = opts.commit;
      if (opts.status === "active" && !leaf.started_at)
        leaf.started_at = new Date().toISOString();
      if (opts.status === "done") leaf.completed_at = new Date().toISOString();
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
      fs.writeFileSync(
        path.join(dir, "sporenet", "index.html"),
        renderHtml(state, mycelium)
      );
      console.log(
        chalk.greenBright(`  ✔ ${leafId} → ${opts.status}`) +
          (opts.commit ? chalk.gray(` @ ${opts.commit.slice(0, 7)}`) : "")
      );
    });

  sn.command("serve")
    .description("Serve sporenet/ on localhost with live auto-refresh")
    .option("-d, --dir <dir>", "Organism directory", process.cwd())
    .option("-p, --port <port>", "Port", "4444")
    .action((opts) => {
      const dir = path.resolve(opts.dir);
      const snDir = path.join(dir, "sporenet");
      if (!fs.existsSync(path.join(snDir, "index.html"))) {
        console.log(
          chalk.red(
            "  ❌ sporenet/index.html not found. Run `mycelium sporenet init` first."
          )
        );
        process.exit(1);
      }
      const port = parseInt(opts.port, 10);
      const server = http.createServer(async (req, res) => {
        const raw = req.url ?? "/";
        const pathOnly = raw.split("?")[0];

        // Fleet API routes
        if (pathOnly === "/api/fleet/organisms") {
          await handleFleetOrganismsRequest(res, dir);
          return;
        }

        if (pathOnly.startsWith("/api/fleet/organism/")) {
          const name = decodeURIComponent(pathOnly.slice("/api/fleet/organism/".length));
          await handleFleetOrganismDetailRequest(res, dir, name);
          return;
        }

        // Fleet overview page
        if (pathOnly === "/fleet") {
          await handleFleetPageRequest(res, dir);
          return;
        }

        // State API — returns sporenet/state.json as JSON
        if (pathOnly === "/api/state") {
          handleStateRequest(res, dir);
          return;
        }

        // SSE stream — tail the current JSONL run file in real time
        if (pathOnly === "/api/events/stream") {
          handleSSEStream(req, res, dir);
          return;
        }

        // Events API — JSONL event log (dashboard.live.events scope)
        if (pathOnly === "/api/events") {
          const query = raw.includes("?") ? raw.split("?")[1] : "";
          handleEventsRequest(res, dir, query);
          return;
        }

        // Existing diff endpoint
        if (pathOnly.startsWith("/diff/")) {
          const leafId = decodeURIComponent(pathOnly.slice("/diff/".length));
          handleDiffRequest(res, dir, leafId);
          return;
        }

        // Serve state.json from sporenet/ directory
        if (pathOnly === "/state.json") {
          handleStateRequest(res, dir);
          return;
        }

        // Try live template first, fall back to rendered index.html
        let url = pathOnly === "/" ? "/index.html" : pathOnly;
        const liveTemplatePath = path.join(
          dir, "cli/src/commands/sporenet/templates/scale.html"
        );
        if (pathOnly === "/" && fs.existsSync(liveTemplatePath)) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
          res.end(fs.readFileSync(liveTemplatePath, "utf-8"));
          return;
        }

        const filePath = path.normalize(path.join(snDir, url));
        if (!filePath.startsWith(snDir) || !fs.existsSync(filePath)) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found: " + pathOnly);
          return;
        }
        const ext = path.extname(filePath);
        const contentType =
          ext === ".html"
            ? "text/html; charset=utf-8"
            : ext === ".json"
            ? "application/json; charset=utf-8"
            : "text/plain";
        res.writeHead(200, {
          "Content-Type": contentType,
          "Cache-Control": "no-store",
        });
        res.end(fs.readFileSync(filePath));
      });
      server.listen(port, () => {
        console.log(
          chalk.greenBright(`  ✔ SporeNet serving at `) +
            chalk.cyan(`http://localhost:${port}`)
        );
        console.log(chalk.gray("    ctrl+c to stop"));
      });
    });
}
