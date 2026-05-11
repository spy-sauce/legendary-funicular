// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Branch management for `--autofix-branch` mode in audit-run heal loop.
// Per NUTRIENTS.md §7 and HYPHA-AUDIT-HEAL-LOOP-AGENT.md:
//   - When autofixBranch is set: git checkout -b <autofixBranch> before iteration 1;
//     stash any uncommitted operator work first — abort loudly if stash conflicts.
//   - At loop end: do NOT merge — leave the branch for operator review.
//   - When autofixBranch is NOT set (default — commit-on-top): no branch surgery;
//     cultivate's existing auto-commit behavior takes over.

import { spawn } from "node:child_process";

/**
 * Result of a git command execution.
 */
export interface GitResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Result of attempting to set up the autofix branch.
 */
export interface AutofixBranchSetupResult {
  success: boolean;
  branchCreated: boolean;
  stashCreated: boolean;
  stashRef?: string;
  originalBranch?: string;
  error?: string;
}

/**
 * Executes a git command in the given directory.
 * Does NOT commit — read-only and branch management ops only.
 */
async function runGit(
  cwd: string,
  args: string[]
): Promise<GitResult> {
  return new Promise((resolve) => {
    const proc = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });

    proc.on("error", (err) => {
      resolve({
        exitCode: 1,
        stdout: "",
        stderr: err.message,
      });
    });
  });
}

/**
 * Check if the working tree has uncommitted changes.
 * Returns true if there are staged or unstaged changes.
 */
export async function hasUncommittedChanges(cwd: string): Promise<boolean> {
  const result = await runGit(cwd, ["status", "--porcelain"]);
  return result.exitCode === 0 && result.stdout.length > 0;
}

/**
 * Get the current branch name.
 */
export async function getCurrentBranch(cwd: string): Promise<string | null> {
  const result = await runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (result.exitCode !== 0) return null;
  return result.stdout || null;
}

/**
 * Check if a branch exists locally.
 */
export async function branchExists(cwd: string, branchName: string): Promise<boolean> {
  const result = await runGit(cwd, ["rev-parse", "--verify", branchName]);
  return result.exitCode === 0;
}

/**
 * Stash uncommitted changes with a descriptive message.
 * Returns the stash ref if successful.
 */
async function stashChanges(cwd: string): Promise<{ success: boolean; stashRef?: string; error?: string }> {
  const stashMsg = `mycelium-autofix-${Date.now()}`;
  const result = await runGit(cwd, ["stash", "push", "-m", stashMsg]);

  if (result.exitCode !== 0) {
    return { success: false, error: `Failed to stash changes: ${result.stderr}` };
  }

  // Get the stash ref for later reference
  const listResult = await runGit(cwd, ["stash", "list", "--format=%gd %s"]);
  const lines = listResult.stdout.split("\n");
  const stashLine = lines.find((line) => line.includes(stashMsg));
  const stashRef = stashLine?.split(" ")[0];

  return { success: true, stashRef };
}

/**
 * Create and checkout a new branch for autofix work.
 * Aborts loudly if the branch already exists.
 */
async function createAndCheckoutBranch(
  cwd: string,
  branchName: string
): Promise<{ success: boolean; error?: string }> {
  // Check if branch already exists
  if (await branchExists(cwd, branchName)) {
    return {
      success: false,
      error: `Branch '${branchName}' already exists. Delete it or choose a different name.`,
    };
  }

  const result = await runGit(cwd, ["checkout", "-b", branchName]);

  if (result.exitCode !== 0) {
    return {
      success: false,
      error: `Failed to create branch '${branchName}': ${result.stderr}`,
    };
  }

  return { success: true };
}

/**
 * Set up the autofix branch before iteration 1.
 *
 * When autofixBranch is provided:
 *   1. Record the current branch for reference
 *   2. If there are uncommitted changes, stash them
 *   3. Create and checkout the autofix branch
 *   4. If any step fails, abort loudly with a descriptive error
 *
 * When autofixBranch is NOT provided (undefined/null):
 *   - No branch surgery; commit-on-top mode
 *   - Returns immediately with success: true, branchCreated: false
 */
export async function setupAutofixBranch(
  cultivationDir: string,
  autofixBranch: string | undefined
): Promise<AutofixBranchSetupResult> {
  // Default mode: commit-on-top — no branch surgery
  if (!autofixBranch) {
    return {
      success: true,
      branchCreated: false,
      stashCreated: false,
    };
  }

  // Sub-organism mode: create autofix branch

  // 1. Get current branch
  const originalBranch = await getCurrentBranch(cultivationDir);
  if (!originalBranch) {
    return {
      success: false,
      branchCreated: false,
      stashCreated: false,
      error: "Failed to determine current branch. Is this a git repository?",
    };
  }

  // 2. Check for uncommitted changes and stash if needed
  let stashCreated = false;
  let stashRef: string | undefined;

  const hasChanges = await hasUncommittedChanges(cultivationDir);
  if (hasChanges) {
    const stashResult = await stashChanges(cultivationDir);
    if (!stashResult.success) {
      return {
        success: false,
        branchCreated: false,
        stashCreated: false,
        originalBranch,
        error: stashResult.error,
      };
    }
    stashCreated = true;
    stashRef = stashResult.stashRef;

    // Verify stash actually cleared the changes (abort if conflicts)
    const stillDirty = await hasUncommittedChanges(cultivationDir);
    if (stillDirty) {
      return {
        success: false,
        branchCreated: false,
        stashCreated: true,
        stashRef,
        originalBranch,
        error: "Stash created but working tree still has changes. Possible stash conflict — aborting.",
      };
    }
  }

  // 3. Create and checkout the autofix branch
  const branchResult = await createAndCheckoutBranch(cultivationDir, autofixBranch);
  if (!branchResult.success) {
    return {
      success: false,
      branchCreated: false,
      stashCreated,
      stashRef,
      originalBranch,
      error: branchResult.error,
    };
  }

  return {
    success: true,
    branchCreated: true,
    stashCreated,
    stashRef,
    originalBranch,
  };
}

/**
 * Result of finalizing the autofix branch mode.
 */
export interface AutofixBranchFinalizeResult {
  success: boolean;
  currentBranch?: string;
  message?: string;
}

/**
 * Finalize the autofix branch at loop end.
 *
 * Per spec: do NOT merge — leave the branch for operator review.
 * This function just logs the current state for operator awareness.
 *
 * When autofixBranch is NOT provided:
 *   - No-op; commit-on-top mode handled by cultivate's existing behavior.
 */
export async function finalizeAutofixBranch(
  cultivationDir: string,
  autofixBranch: string | undefined,
  _setupResult: AutofixBranchSetupResult
): Promise<AutofixBranchFinalizeResult> {
  // Default mode: nothing to finalize
  if (!autofixBranch) {
    return { success: true };
  }

  // Sub-organism mode: verify we're on the autofix branch
  const currentBranch = await getCurrentBranch(cultivationDir);

  if (currentBranch !== autofixBranch) {
    return {
      success: false,
      currentBranch: currentBranch ?? undefined,
      message: `Expected to be on branch '${autofixBranch}' but found '${currentBranch}'.`,
    };
  }

  // Per spec: do NOT merge — leave the branch for operator review
  return {
    success: true,
    currentBranch,
    message: `Autofix branch '${autofixBranch}' ready for operator review. ` +
      `Merge manually when satisfied with the fixes.`,
  };
}

/**
 * Check if we're in autofix branch mode.
 */
export function isAutofixBranchMode(autofixBranch: string | undefined): boolean {
  return typeof autofixBranch === "string" && autofixBranch.length > 0;
}
