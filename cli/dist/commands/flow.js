// Mycelium Framework — VibeSpace LLC — The network provides.
import chalk from "chalk";
import ora from "ora";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
export function registerFlowCommand(program) {
    program
        .command("flow")
        .description("🌊 Trigger the nutrient flow algorithm — distribute work to ready agents")
        .action(async () => {
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
        if (agents.length === 0) {
            console.log(chalk.yellow("  🌑 No agents to nourish."));
            return;
        }
        console.log(chalk.magentaBright("  🌊 Nutrient Flow Algorithm") +
            chalk.gray(" — distributing resources through the network...\n"));
        const spinner = ora({
            text: chalk.cyan("Analyzing dependency graph..."),
            spinner: "dots",
        }).start();
        // Simulate nutrient flow computation
        await sleep(400);
        spinner.text = chalk.cyan("Computing optimal nutrient distribution...");
        await sleep(400);
        spinner.text = chalk.cyan("Matching agents to available nutrients...");
        await sleep(300);
        spinner.succeed(chalk.greenBright("Nutrient flow complete!"));
        console.log();
        // Determine which agents can receive nutrients (unblocked)
        const completedIds = new Set();
        const readyAgents = [];
        const blockedAgents = [];
        const growingAgents = [];
        for (const agent of agents) {
            const blockers = agent.blocked_by || [];
            const allResolved = blockers.every((b) => completedIds.has(b));
            if (blockers.length === 0) {
                readyAgents.push(agent);
            }
            else if (allResolved) {
                growingAgents.push(agent);
            }
            else {
                blockedAgents.push(agent);
            }
        }
        // Flow report
        if (readyAgents.length > 0) {
            console.log(chalk.greenBright("  🟢 Receiving nutrients (unblocked):"));
            for (const a of readyAgents) {
                console.log(chalk.gray("     ├── ") +
                    chalk.white.bold(a.id) +
                    chalk.gray(` — ${a.scope}`) +
                    chalk.cyan(` [${a.capabilities.join(", ")}]`));
            }
            console.log();
        }
        if (growingAgents.length > 0) {
            console.log(chalk.yellow("  🟡 Ready to germinate (dependencies met):"));
            for (const a of growingAgents) {
                console.log(chalk.gray("     ├── ") +
                    chalk.white.bold(a.id) +
                    chalk.gray(` — ${a.scope}`));
            }
            console.log();
        }
        if (blockedAgents.length > 0) {
            console.log(chalk.red("  🔴 Awaiting nutrients (blocked):"));
            for (const a of blockedAgents) {
                const waitingOn = (a.blocked_by || []).filter((b) => !completedIds.has(b));
                console.log(chalk.gray("     ├── ") +
                    chalk.white.bold(a.id) +
                    chalk.gray(" — waiting on ") +
                    chalk.red(waitingOn.join(", ")));
            }
            console.log();
        }
        // Summary
        const total = agents.length;
        console.log(chalk.magentaBright("  📊 Flow Summary: ") +
            chalk.green(`${readyAgents.length} nourished`) +
            chalk.gray(" / ") +
            chalk.yellow(`${growingAgents.length} germinating`) +
            chalk.gray(" / ") +
            chalk.red(`${blockedAgents.length} blocked`) +
            chalk.gray(` — ${total} total`));
        console.log();
        console.log(chalk.gray.italic("  Nutrients flow to where they are needed. The network provides. 🌿"));
    });
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=flow.js.map