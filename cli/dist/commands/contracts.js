// Mycelium Framework — VibeSpace LLC — The network provides.
import chalk from "chalk";
import ora from "ora";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
export function registerContractsCommand(program) {
    const contracts = program
        .command("contracts")
        .description("📜 Manage shared type contracts across the organism");
    contracts
        .command("freeze")
        .description("Freeze all contracts — lock the shared types so agents build on stable ground")
        .action(async () => {
        const configPath = path.join(process.cwd(), "mycelium.yaml");
        if (!fs.existsSync(configPath)) {
            console.log(chalk.red("  ❌ No mycelium.yaml found. Run ") +
                chalk.cyan("mycelium init") +
                chalk.red(" first."));
            return;
        }
        const spinner = ora({
            text: chalk.cyan("Crystallizing contracts..."),
            spinner: "dots",
        }).start();
        const raw = fs.readFileSync(configPath, "utf-8");
        const config = YAML.parse(raw);
        const contractsList = config.contracts || [];
        if (contractsList.length === 0) {
            spinner.warn(chalk.yellow("No contracts found in mycelium.yaml. Add contract paths first."));
            return;
        }
        const now = new Date().toISOString();
        // Transform contracts into frozen form
        config.contracts = contractsList.map((c) => {
            const contractPath = typeof c === "string" ? c : c.path;
            return {
                path: contractPath,
                frozen: true,
                frozenAt: now,
            };
        });
        const updatedYaml = "# Mycelium Framework — VibeSpace LLC — The network provides.\n\n" +
            YAML.stringify(config);
        fs.writeFileSync(configPath, updatedYaml, "utf-8");
        spinner.succeed(chalk.greenBright("All contracts frozen!"));
        console.log();
        console.log(chalk.magentaBright("  🧊 Contract Freeze Report"));
        console.log(chalk.gray(`  ── Frozen at: ${chalk.white(now)}`));
        console.log();
        for (const c of config.contracts) {
            console.log(chalk.gray("    🔒 ") +
                chalk.yellow(c.path) +
                chalk.green(" — frozen"));
        }
        console.log();
        console.log(chalk.gray.italic("  The contracts are crystallized. Agents may now grow with certainty. 🧊"));
    });
    contracts
        .command("list")
        .description("Show all contracts and their freeze state")
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
        const contractsList = config.contracts || [];
        if (contractsList.length === 0) {
            console.log(chalk.yellow("  📭 No contracts defined in mycelium.yaml"));
            return;
        }
        console.log(chalk.magentaBright("  📜 Contracts:\n"));
        for (const c of contractsList) {
            if (typeof c === "string") {
                console.log(chalk.gray("    📄 ") +
                    chalk.yellow(c) +
                    chalk.gray(" — ") +
                    chalk.red("unfrozen"));
            }
            else {
                const status = c.frozen
                    ? chalk.green("frozen") +
                        chalk.gray(` (${c.frozenAt})`)
                    : chalk.red("unfrozen");
                console.log(chalk.gray("    📄 ") +
                    chalk.yellow(c.path || "unknown") +
                    chalk.gray(" — ") +
                    status);
            }
        }
        console.log();
    });
}
//# sourceMappingURL=contracts.js.map