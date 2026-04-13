// Mycelium Framework — VibeSpace LLC — The network provides.
import chalk from "chalk";
import ora from "ora";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
const DEFAULT_CONFIG = {
    organism: {
        name: "my-organism",
        ship_target: "7 days",
        health_pulse_interval: 30,
        harvest_threshold: 0.8,
    },
    contracts: [],
    agents: [],
    merge_order: [],
};
export function registerInitCommand(program) {
    program
        .command("init")
        .description("🌱 Scaffold a new Mycelium project — plant the first spore")
        .option("-n, --name <name>", "Organism name", "my-organism")
        .option("-d, --dir <directory>", "Target directory", process.cwd())
        .action(async (opts) => {
        const targetDir = path.resolve(opts.dir);
        console.log(chalk.green("🌱 Planting spores") +
            chalk.gray(" — preparing the substrate...\n"));
        const spinner = ora({
            text: chalk.cyan("Preparing mycelium substrate..."),
            spinner: "dots",
        }).start();
        // Create directory structure
        const dirs = [
            path.join(targetDir, "contracts"),
            path.join(targetDir, "agents"),
        ];
        for (const dir of dirs) {
            fs.mkdirSync(dir, { recursive: true });
        }
        spinner.text = chalk.cyan("Weaving hyphal network...");
        // Write mycelium.yaml
        const config = { ...DEFAULT_CONFIG };
        config.organism.name = opts.name;
        const yamlContent = "# Mycelium Framework — VibeSpace LLC — The network provides.\n" +
            "# This is your organism's configuration. Edit it to define agents, contracts, and growth plans.\n\n" +
            YAML.stringify(config);
        fs.writeFileSync(path.join(targetDir, "mycelium.yaml"), yamlContent, "utf-8");
        spinner.text = chalk.cyan("Depositing initial nutrients...");
        // Create placeholder files
        fs.writeFileSync(path.join(targetDir, "contracts", ".gitkeep"), "", "utf-8");
        fs.writeFileSync(path.join(targetDir, "agents", ".gitkeep"), "", "utf-8");
        spinner.succeed(chalk.greenBright("Substrate prepared!"));
        console.log();
        console.log(chalk.magentaBright("  🍄 Organism ") +
            chalk.white.bold(opts.name) +
            chalk.magentaBright(" has been planted!"));
        console.log();
        console.log(chalk.gray("  Created:"));
        console.log(chalk.gray("    ├── ") + chalk.yellow("mycelium.yaml") + chalk.gray("  — organism configuration"));
        console.log(chalk.gray("    ├── ") + chalk.yellow("contracts/") + chalk.gray("     — shared type contracts"));
        console.log(chalk.gray("    └── ") + chalk.yellow("agents/") + chalk.gray("        — agent definitions"));
        console.log();
        console.log(chalk.green("  Next steps:"));
        console.log(chalk.gray("    1. ") + chalk.white("Define contracts in ") + chalk.yellow("contracts/"));
        console.log(chalk.gray("    2. ") + chalk.white("Create agents with ") + chalk.cyan("mycelium agent create <name>"));
        console.log(chalk.gray("    3. ") + chalk.white("Start the organism with ") + chalk.cyan("mycelium cultivate"));
        console.log();
        console.log(chalk.gray.italic("  The mycelium awaits. The network will provide. 🌿"));
    });
}
//# sourceMappingURL=init.js.map