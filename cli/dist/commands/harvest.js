// Mycelium Framework — VibeSpace LLC — The network provides.
import chalk from "chalk";
import ora from "ora";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import Table from "cli-table3";
export function registerHarvestCommand(program) {
    program
        .command("harvest")
        .description("🧺 Collect all FRUIT_READY deliverables from the organism")
        .option("-t, --threshold <number>", "Minimum harvest threshold (0-1)", "0.8")
        .action(async (opts) => {
        const configPath = path.join(process.cwd(), "mycelium.yaml");
        if (!fs.existsSync(configPath)) {
            console.log(chalk.red("  ❌ No mycelium.yaml found. Run ") +
                chalk.cyan("mycelium init") +
                chalk.red(" first."));
            return;
        }
        const raw = fs.readFileSync(configPath, "utf-8");
        const config = YAML.parse(raw);
        const agents = config.agents || [];
        const threshold = parseFloat(opts.threshold);
        if (agents.length === 0) {
            console.log(chalk.yellow("  🌑 No agents to harvest from."));
            return;
        }
        console.log(chalk.magentaBright("  🧺 Harvest Time") +
            chalk.gray(" — collecting deliverables from the organism...\n"));
        const spinner = ora({
            text: chalk.cyan("Inspecting fruiting bodies..."),
            spinner: "dots",
        }).start();
        await sleep(500);
        spinner.text = chalk.cyan("Evaluating ripeness...");
        await sleep(400);
        spinner.text = chalk.cyan("Collecting deliverables...");
        await sleep(300);
        // Determine fruit-ready agents (unblocked agents are simulated as ready)
        const fruitReady = [];
        const notReady = [];
        for (const agent of agents) {
            const blockers = agent.blocked_by || [];
            const isReady = agent.state === "FRUIT_READY" || blockers.length === 0;
            if (isReady) {
                fruitReady.push(agent);
            }
            else {
                notReady.push(agent);
            }
        }
        const harvestRatio = fruitReady.length / agents.length;
        spinner.succeed(chalk.greenBright("Harvest inspection complete!"));
        console.log();
        // Results table
        const table = new Table({
            head: [
                chalk.magenta("Agent"),
                chalk.magenta("Branch"),
                chalk.magenta("Status"),
                chalk.magenta("Deliverable"),
            ],
            style: { head: [], border: ["gray"] },
        });
        for (const agent of fruitReady) {
            table.push([
                chalk.greenBright(`✅ ${agent.id}`),
                chalk.cyan(agent.branch),
                chalk.green("FRUIT_READY"),
                chalk.white(agent.scope),
            ]);
        }
        for (const agent of notReady) {
            table.push([
                chalk.gray(`⏳ ${agent.id}`),
                chalk.gray(agent.branch),
                chalk.yellow("GROWING"),
                chalk.gray(agent.scope),
            ]);
        }
        console.log(table.toString());
        console.log();
        // Harvest threshold check
        const pct = Math.round(harvestRatio * 100);
        if (harvestRatio >= threshold) {
            console.log(chalk.greenBright(`  🎉 Harvest threshold met! `) +
                chalk.white.bold(`${pct}%`) +
                chalk.green(` >= ${Math.round(threshold * 100)}%`));
            console.log();
            console.log(chalk.greenBright("  Ready to ship! ") +
                chalk.gray("The organism has borne fruit. 🍄"));
        }
        else {
            console.log(chalk.yellow(`  ⚠️  Harvest threshold not met: `) +
                chalk.white.bold(`${pct}%`) +
                chalk.yellow(` < ${Math.round(threshold * 100)}%`));
            console.log();
            console.log(chalk.gray("  Still growing: ") +
                chalk.yellow(notReady.map((a) => a.id).join(", ")));
            console.log();
            console.log(chalk.gray.italic("  Patience. The mycelium grows in its own time. 🌱"));
        }
        console.log();
        // Merge order suggestion
        if (fruitReady.length > 0) {
            const mergeOrder = config.merge_order || fruitReady.map((a) => a.id);
            const readyIds = new Set(fruitReady.map((a) => a.id));
            const orderedReady = mergeOrder.filter((id) => readyIds.has(id));
            console.log(chalk.magentaBright("  📋 Suggested merge order:"));
            for (let i = 0; i < orderedReady.length; i++) {
                const connector = i === orderedReady.length - 1 ? "└──" : "├──";
                console.log(chalk.gray(`     ${connector} `) +
                    chalk.white.bold(`${i + 1}. ${orderedReady[i]}`));
            }
            console.log();
        }
    });
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=harvest.js.map