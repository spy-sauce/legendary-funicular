// Mycelium Framework — VibeSpace LLC — The network provides.
//
// `mycelium export` — walk one or more organism directories, collect all
// canonical artifacts, and emit a self-contained bundle that can be dropped
// into a fresh Claude Code session as full context.

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

interface OrganismSummary {
  name: string;
  source: string;
  ship_target?: string;
  gating?: string;
  max_depth?: number;
  agent_count: number;
  agents: AgentSummary[];
  contracts: any[];
  merge_order: string[];
  files: Record<string, string>;
}

interface AgentSummary {
  id: string;
  scope: string;
  branch: string;
  blocked_by: string[];
  blocks: string[];
  capabilities: string[];
  sub_agent_count: number;
  leaf_count: number;
}

function countLeaves(agent: any): number {
  if (!agent.sub_agents || agent.sub_agents.length === 0) return 1;
  return agent.sub_agents.reduce(
    (sum: number, sa: any) => sum + countLeaves(sa),
    0
  );
}

function countSubAgents(agent: any): number {
  if (!agent.sub_agents) return 0;
  return agent.sub_agents.reduce(
    (sum: number, sa: any) => sum + 1 + countSubAgents(sa),
    0
  );
}

function collectOrganism(dir: string): OrganismSummary | null {
  const yamlPath = [
    path.join(dir, "mycelium.yaml"),
    ...fs
      .readdirSync(dir)
      .filter((f) => f.endsWith("-mycelium.yaml"))
      .map((f) => path.join(dir, f)),
  ].find((p) => fs.existsSync(p));

  if (!yamlPath) return null;

  const raw = fs.readFileSync(yamlPath, "utf-8");
  const config = YAML.parse(raw);
  const org = config.organism ?? {};

  const agents: AgentSummary[] = (config.agents ?? []).map((a: any) => ({
    id: a.id,
    scope: a.scope,
    branch: a.branch ?? `feat/${a.id}`,
    blocked_by: a.blocked_by ?? [],
    blocks: a.blocks ?? [],
    capabilities: a.capabilities ?? [],
    sub_agent_count: countSubAgents(a),
    leaf_count: countLeaves(a),
  }));

  const files: Record<string, string> = {};

  const collectFile = (name: string) => {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) {
      files[name] = fs.readFileSync(p, "utf-8");
    }
  };

  collectFile("CLAUDE.md");
  collectFile("NUTRIENTS.md");
  collectFile("CELLULAR-MAP.md");
  collectFile("KPI-GAPS.md");
  collectFile("README.md");
  collectFile(path.basename(yamlPath));

  const hyphaeDir = path.join(dir, "hyphae");
  if (fs.existsSync(hyphaeDir)) {
    for (const f of fs.readdirSync(hyphaeDir)) {
      if (f.endsWith(".md")) {
        files[`hyphae/${f}`] = fs.readFileSync(
          path.join(hyphaeDir, f),
          "utf-8"
        );
      }
    }
  }

  const contractsDir = path.join(dir, "contracts");
  if (fs.existsSync(contractsDir)) {
    for (const f of fs.readdirSync(contractsDir)) {
      if (f.endsWith(".json") || f.endsWith(".md")) {
        files[`contracts/${f}`] = fs.readFileSync(
          path.join(contractsDir, f),
          "utf-8"
        );
      }
    }
  }

  return {
    name: org.name ?? path.basename(dir),
    source: dir,
    ship_target: org.ship_target,
    gating: org.gating,
    max_depth: org.max_depth,
    agent_count: agents.length,
    agents,
    contracts: config.contracts ?? [],
    merge_order: config.merge_order ?? [],
    files,
  };
}

export function registerExportCommand(program: Command): void {
  program
    .command("export")
    .description(
      "📦 Export the ecosystem into a self-contained bundle for visualization or handoff"
    )
    .option(
      "-d, --dirs <dirs...>",
      "Organism directories to include (auto-discovers siblings if omitted)"
    )
    .option(
      "-o, --out <dir>",
      "Output directory",
      path.join(process.env.HOME ?? "~", "Desktop", "mf-export")
    )
    .action(async (opts) => {
      const outDir = path.resolve(opts.out);

      let dirs: string[] = opts.dirs ?? [];
      if (dirs.length === 0) {
        const scanRoots = [
          path.join(process.env.HOME ?? "~", "Desktop", "mfautomation"),
          path.join(process.env.HOME ?? "~", "Desktop", "bardot"),
          path.join(
            process.env.HOME ?? "~",
            "Desktop",
            "vs_mf_merge",
            "bloom-labs"
          ),
          path.join(
            process.env.HOME ?? "~",
            "Desktop",
            "vs_mf_merge",
            "legendary-funicular"
          ),
        ];
        dirs = scanRoots.filter((d) => fs.existsSync(d));
      }

      console.log();
      console.log(
        chalk.magentaBright.bold("  📦 Exporting ecosystem") +
          chalk.gray(` → ${outDir}`)
      );
      console.log();

      const spinner = ora({
        text: chalk.cyan("Scanning organism directories..."),
        spinner: "earth",
      }).start();

      const organisms: OrganismSummary[] = [];

      for (const dir of dirs) {
        const org = collectOrganism(dir);
        if (org) {
          organisms.push(org);
          spinner.text = chalk.cyan(`Found organism: ${chalk.white(org.name)}`);
        }
      }

      if (organisms.length === 0) {
        spinner.fail(chalk.red("No organisms found in scanned directories."));
        process.exit(1);
      }

      fs.mkdirSync(outDir, { recursive: true });

      const manifest = {
        exported_at: new Date().toISOString(),
        framework: "mycelium",
        version: "1.0.0",
        organism_count: organisms.length,
        total_agents: organisms.reduce((s, o) => s + o.agent_count, 0),
        total_leaves: organisms.reduce(
          (s, o) => s + o.agents.reduce((a, ag) => a + ag.leaf_count, 0),
          0
        ),
        organisms: organisms.map((o) => ({
          name: o.name,
          source: o.source,
          ship_target: o.ship_target,
          gating: o.gating,
          max_depth: o.max_depth,
          agent_count: o.agent_count,
          agents: o.agents,
          contracts: o.contracts,
          merge_order: o.merge_order,
        })),
      };

      fs.writeFileSync(
        path.join(outDir, "manifest.json"),
        JSON.stringify(manifest, null, 2)
      );

      for (const org of organisms) {
        const orgDir = path.join(outDir, org.name);
        fs.mkdirSync(orgDir, { recursive: true });

        for (const [relPath, content] of Object.entries(org.files)) {
          const full = path.join(orgDir, relPath);
          fs.mkdirSync(path.dirname(full), { recursive: true });
          fs.writeFileSync(full, content);
        }
      }

      const readme = `# Mycelium Ecosystem Export

Exported: ${new Date().toISOString()}

## Organisms

${organisms
  .map(
    (o) =>
      `### ${o.name}
- Source: \`${o.source}\`
- Ship target: ${o.ship_target ?? "not set"}
- Gating: ${o.gating ?? "wave (default)"}
- Agents: ${o.agent_count} biomes, ${o.agents.reduce((s, a) => s + a.leaf_count, 0)} leaves at peak
- Merge order: ${o.merge_order.join(" → ")}
`
  )
  .join("\n")}

## Usage

Drop this directory into a Claude Code session:

\`\`\`
cd ${outDir}
claude
\`\`\`

Then: "Read manifest.json and build a React visualization of the ecosystem."

## Files

- \`manifest.json\` — machine-readable ecosystem graph (organisms, agents, contracts, merge order)
- \`{organism}/\` — per-organism copies of CLAUDE.md, NUTRIENTS.md, CELLULAR-MAP.md, hyphae/, contracts/
`;

      fs.writeFileSync(path.join(outDir, "README.md"), readme);

      spinner.succeed(
        chalk.greenBright(
          `Exported ${organisms.length} organism(s) → ${outDir}`
        )
      );

      console.log();
      for (const o of organisms) {
        const leafCount = o.agents.reduce((s, a) => s + a.leaf_count, 0);
        console.log(
          chalk.gray("  ") +
            chalk.white.bold(o.name) +
            chalk.gray(` — ${o.agent_count} agents, ${leafCount} leaves`)
        );
      }
      console.log();
      console.log(
        chalk.green("  manifest.json ") +
          chalk.gray("ready for viz or Claude Code handoff")
      );
      console.log();
    });
}
