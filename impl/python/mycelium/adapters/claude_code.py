# Mycelium Framework — VibeSpace LLC — The network provides.

"""
claude_code.py — Claude Code adapter for cellular execution.

This adapter wraps the Claude Code CLI so that each hyphal agent can
delegate its metabolic work to an external AI session. The agent reads
its growth instructions from a HYPHA file, constrains its territory to a
file-scope list, and spawns a ``claude --print`` subprocess to carry out
the work.

PetriDishCoordinator groups multiple ClaudeCodeAgents that share a
common HYPHA context and activates them in dependency order, collecting
their fruits when the culture is complete.
"""

from __future__ import annotations

import asyncio
import json
import logging
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..agent import AgentState, BaseAgent

logger = logging.getLogger("mycelium.adapters.claude_code")

# Marker strings the Claude Code session may emit to signal completion.
_FRUITING_MARKER = "FRUITING"
_PASS_MARKER = "PASS"
_FAIL_MARKER = "FAIL"


class ClaudeCodeAgent(BaseAgent):
    """
    A hyphal agent that performs cellular execution via the Claude Code SDK.

    When activated, the agent reads its growth instructions (a HYPHA markdown
    file), scopes its territory to a set of file-glob patterns, and spawns a
    Claude Code session to metabolize the work. Session output is monitored
    for fruiting markers and acceptance-criteria signals so the agent can
    transition its own lifecycle state accordingly.

    Specimen notes:
        - ``prompt_path`` is the HYPHA file that contains the full task context.
        - ``file_scope`` is a list of glob patterns defining the agent's territory.
        - ``cwd`` is the working directory for the Claude Code session.
        - ``model`` selects the Claude model variant (default ``"sonnet"``).
    """

    def __init__(
        self,
        *,
        agent_id: Optional[str] = None,
        scope: str = "",
        lane: str = "main",
        capabilities: Optional[List[str]] = None,
        dependencies: Optional[List[str]] = None,
        prompt_path: str = "",
        file_scope: Optional[List[str]] = None,
        cwd: str = ".",
        model: str = "sonnet",
    ) -> None:
        super().__init__(
            agent_id=agent_id,
            scope=scope,
            lane=lane,
            capabilities=capabilities,
            dependencies=dependencies,
        )
        self._prompt_path: str = prompt_path
        self._file_scope: List[str] = file_scope or []
        self._cwd: str = cwd
        self._model: str = model

        # Outputs captured from the session.
        self._session_output: Optional[str] = None
        self._blockers: List[str] = []
        self._fruit_payload: Optional[Dict[str, Any]] = None
        self._worktree_path: Optional[str] = None
        self._worktree_branch: Optional[str] = None
        self._use_worktree: bool = True

    # -- Lifecycle implementation ----------------------------------------------

    async def sense(self) -> Dict[str, Any]:
        """
        Probe the environment — verify the HYPHA file and working directory
        exist and are accessible before attempting growth.
        """
        prompt_exists = Path(self._prompt_path).is_file() if self._prompt_path else False
        cwd_exists = Path(self._cwd).is_dir()

        return {
            "agent_id": self._id,
            "prompt_path": self._prompt_path,
            "prompt_exists": prompt_exists,
            "cwd": self._cwd,
            "cwd_exists": cwd_exists,
            "file_scope": self._file_scope,
            "state": self._state.value,
        }

    async def execute(self) -> Any:
        """
        Perform cellular execution in an isolated git worktree.

        1. Creates a temporary git worktree + branch for this agent
        2. Spawns ``claude --print`` inside the worktree
        3. On success (FRUITING): merges the branch back into the source branch
        4. On failure: leaves the worktree for manual inspection
        5. Cleans up the worktree (unless failed — keeps it for debugging)
        """
        if self._state not in (AgentState.GROWING, AgentState.FLOWING):
            logger.warning(
                "Hypha %s cannot execute in state %s — must be GROWING or FLOWING",
                self._id,
                self._state.value,
            )
            return None

        prompt_file = Path(self._prompt_path)
        if not prompt_file.is_file():
            self._blockers.append(f"Prompt file not found: {self._prompt_path}")
            self._transition(AgentState.DORMANT)
            return None

        prompt_text = prompt_file.read_text(encoding="utf-8")

        # Strip auto-commit instructions — the coordinator handles commits.
        prompt_text += (
            "\n\nIMPORTANT: Do NOT run auto-commit.sh or git push. "
            "Just make the code changes and verify they work. "
            "The orchestrator handles commits and merges."
        )

        if self._file_scope:
            prompt_text += (
                "\n\nFile scope (only touch files matching these patterns): "
                + ", ".join(self._file_scope)
            )

        claude_bin = self._find_claude_binary()
        if not claude_bin:
            self._blockers.append("claude CLI binary not found")
            self._transition(AgentState.DORMANT)
            return None

        # --- Worktree setup ---
        work_cwd = self._cwd
        if self._use_worktree:
            work_cwd = self._create_worktree()
            if not work_cwd:
                self._transition(AgentState.DORMANT)
                return None

        cmd = [
            claude_bin,
            "--print",
            "--output-format", "json",
            "--model", self._model,
            "--max-turns", "50",
            "-p", prompt_text,
        ]

        logger.info(
            "Hypha %s spawning claude CLI (model=%s, worktree=%s)",
            self._id, self._model, work_cwd,
        )

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=work_cwd,
            )
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(),
                timeout=600,
            )
        except asyncio.TimeoutError:
            logger.error("Hypha %s timed out after 600s", self._id)
            self._blockers.append("Session timed out (600s)")
            self._transition(AgentState.DORMANT)
            return None
        except Exception as exc:
            logger.error("Claude CLI failed for hypha %s: %s", self._id, exc)
            self._blockers.append(f"Session error: {exc}")
            self._transition(AgentState.DORMANT)
            return None

        stdout_text = stdout_bytes.decode("utf-8", errors="replace") if stdout_bytes else ""
        stderr_text = stderr_bytes.decode("utf-8", errors="replace") if stderr_bytes else ""
        self._session_output = stdout_text

        if proc.returncode != 0:
            logger.warning(
                "Hypha %s claude CLI exited with code %d: %s",
                self._id, proc.returncode, stderr_text[:500],
            )

        result_text = stdout_text
        try:
            parsed = json.loads(stdout_text)
            if isinstance(parsed, dict):
                result_text = parsed.get("result", stdout_text)
        except (json.JSONDecodeError, TypeError):
            pass

        output = result_text if isinstance(result_text, str) else str(result_text)

        if _FRUITING_MARKER in output and _FAIL_MARKER not in output:
            # --- Commit in worktree + merge back ---
            if self._use_worktree and self._worktree_path:
                self._commit_and_merge(success=True)
            self._fruit_payload = {
                "agent_id": self._id,
                "scope": self._scope,
                "output": output[:2000],
                "status": "success",
                "branch": self._worktree_branch,
            }
            self._transition(AgentState.FRUITING)
            logger.info("Hypha %s reached FRUITING — merged to main", self._id)

        elif _FAIL_MARKER in output:
            self._blockers.append("Acceptance criteria failed")
            if self._use_worktree and self._worktree_path:
                self._commit_and_merge(success=False)
            logger.warning("Hypha %s failed — worktree preserved at %s", self._id, self._worktree_path)

        else:
            if self._use_worktree and self._worktree_path:
                self._commit_and_merge(success=True)
            self._fruit_payload = {
                "agent_id": self._id,
                "scope": self._scope,
                "output": output[:2000],
                "status": "completed_no_marker",
                "branch": self._worktree_branch,
            }
            self._transition(AgentState.FRUITING)
            logger.info("Hypha %s completed (no marker) — merged to main", self._id)

        return self._session_output

    # -- Worktree management ---------------------------------------------------

    def _create_worktree(self) -> Optional[str]:
        """Create an isolated git worktree for this agent."""
        branch = f"hypha/{self._id}"
        self._worktree_branch = branch

        worktree_dir = Path(tempfile.mkdtemp(prefix=f"mycelium-{self._id}-"))
        self._worktree_path = str(worktree_dir)

        try:
            # Create branch from current HEAD if it doesn't exist.
            subprocess.run(
                ["git", "branch", branch],
                cwd=self._cwd,
                capture_output=True,
            )
            # Create the worktree.
            result = subprocess.run(
                ["git", "worktree", "add", str(worktree_dir), branch],
                cwd=self._cwd,
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                logger.error(
                    "Failed to create worktree for %s: %s",
                    self._id, result.stderr,
                )
                self._blockers.append(f"Worktree creation failed: {result.stderr}")
                return None

            logger.info("Worktree created at %s (branch: %s)", worktree_dir, branch)
            return str(worktree_dir)

        except Exception as exc:
            logger.error("Worktree setup error for %s: %s", self._id, exc)
            self._blockers.append(f"Worktree error: {exc}")
            return None

    def _commit_and_merge(self, success: bool) -> None:
        """Commit changes in the worktree and optionally merge back."""
        if not self._worktree_path or not self._worktree_branch:
            return

        wt = self._worktree_path

        # Stage + commit any changes in the worktree.
        subprocess.run(["git", "add", "-A"], cwd=wt, capture_output=True)
        has_changes = subprocess.run(
            ["git", "diff", "--cached", "--quiet"],
            cwd=wt, capture_output=True,
        ).returncode != 0

        if has_changes:
            stream_tag = "TS"  # TODO: read from mycelium.yaml
            msg = f"{stream_tag}/{self._id.upper()}: {'fruiting' if success else 'incomplete'}"
            subprocess.run(
                ["git", "commit", "-m", msg],
                cwd=wt, capture_output=True,
            )
            logger.info("Committed in worktree: %s", msg)

        if success and has_changes:
            # Merge into the source branch (typically main).
            result = subprocess.run(
                ["git", "merge", "--no-ff", self._worktree_branch, "-m",
                 f"Merge {self._worktree_branch} (cellular execution)"],
                cwd=self._cwd,
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                logger.warning(
                    "Merge conflict for %s — branch preserved: %s\n%s",
                    self._id, self._worktree_branch, result.stderr,
                )
                self._blockers.append(f"Merge conflict — resolve manually on branch {self._worktree_branch}")
            else:
                logger.info("Merged %s into main", self._worktree_branch)
                self._cleanup_worktree()
        elif not success:
            logger.info("Worktree preserved for inspection: %s", self._worktree_path)
        else:
            # No changes — clean up.
            self._cleanup_worktree()

    def _cleanup_worktree(self) -> None:
        """Remove the worktree and its branch."""
        if not self._worktree_path:
            return
        try:
            subprocess.run(
                ["git", "worktree", "remove", "--force", self._worktree_path],
                cwd=self._cwd, capture_output=True,
            )
            if self._worktree_branch:
                subprocess.run(
                    ["git", "branch", "-d", self._worktree_branch],
                    cwd=self._cwd, capture_output=True,
                )
            logger.debug("Cleaned up worktree %s", self._worktree_path)
        except Exception as exc:
            logger.warning("Worktree cleanup failed: %s", exc)

    @staticmethod
    def _find_claude_binary() -> Optional[str]:
        """Locate the claude CLI binary."""
        found = shutil.which("claude")
        if found:
            return found
        for candidate in [
            Path.home() / ".local" / "bin" / "claude",
            Path("/usr/local/bin/claude"),
            Path("/opt/homebrew/bin/claude"),
        ]:
            if candidate.is_file():
                return str(candidate)
        return None

    async def flow(self, target_agent: BaseAgent) -> Dict[str, Any]:
        """
        Direct nutrient flow toward another hypha — share session context
        or partial outputs so the target can continue the work.
        """
        payload = {
            "source": self._id,
            "target": target_agent.id,
            "output_preview": (self._session_output or "")[:500],
            "scope": self._scope,
        }
        logger.debug("Flowing nutrients from %s to %s", self._id, target_agent.id)
        return payload

    async def signal(self) -> Dict[str, Any]:
        """
        Emit a health pulse — report current state and any blockers.
        """
        return {
            "agent_id": self._id,
            "state": self._state.value,
            "blockers": list(self._blockers),
            "has_output": self._session_output is not None,
        }

    async def absorb(self, contract: Dict[str, Any]) -> None:
        """
        Absorb a contract from the substrate and integrate it into the
        agent's metabolic context.
        """
        self._absorbed_contracts.append(contract)
        logger.debug("Hypha %s absorbed contract: %s", self._id, contract.get("name", "unnamed"))

    async def fruit(self) -> Any:
        """
        Produce the fruiting body — return the collected session output
        and metadata. Only valid in the FRUITING state.
        """
        if self._state != AgentState.FRUITING:
            logger.warning("Hypha %s is not in FRUITING state — cannot fruit", self._id)
            return None

        return self._fruit_payload

    # -- Convenience -----------------------------------------------------------

    def activate(self) -> None:
        """
        Shorthand to move from DORMANT through GERMINATING to GROWING,
        readying the agent for execution.
        """
        if self._state == AgentState.DORMANT:
            self._transition(AgentState.GERMINATING)
        if self._state == AgentState.GERMINATING:
            self._transition(AgentState.GROWING)


class PetriDishCoordinator:
    """
    A thin coordinator that manages a culture of ClaudeCodeAgents for a
    single HYPHA context.

    The petri dish holds a set of specialist agents, activates them in
    dependency order, waits for each batch to fruit, then activates the
    next wave. When every agent in the culture has fruited, the dish
    itself is considered complete.

    This is NOT an Orchestrator subclass — it is a lightweight coordination
    layer for a single bounded context, whereas the Orchestrator manages
    the entire organism.

    Specimen notes:
        - ``agents`` are the specialist hyphae in this culture.
        - ``dependency_map`` maps agent IDs to lists of agent IDs they depend on.
    """

    def __init__(
        self,
        *,
        agents: Optional[List[ClaudeCodeAgent]] = None,
        dependency_map: Optional[Dict[str, List[str]]] = None,
    ) -> None:
        self._agents: List[ClaudeCodeAgent] = agents or []
        self._dependency_map: Dict[str, List[str]] = dependency_map or {}
        self._fruited: set[str] = set()
        self._is_complete: bool = False

    @property
    def agents(self) -> List[ClaudeCodeAgent]:
        """All specialist agents in this culture."""
        return list(self._agents)

    @property
    def is_complete(self) -> bool:
        """Whether every agent in the culture has fruited."""
        return self._is_complete

    def register_agent(self, agent: ClaudeCodeAgent) -> None:
        """Add a specialist agent to the culture."""
        if agent.id not in {a.id for a in self._agents}:
            self._agents.append(agent)

    async def activate(self) -> None:
        """
        Activate all agents in dependency order.

        Agents with no unmet dependencies are activated first. As each
        batch fruits, the next wave of agents whose dependencies are now
        satisfied is activated. This continues until all agents have
        fruited or a batch fails to make progress.
        """
        logger.info(
            "Petri dish activating — %d agents in culture", len(self._agents)
        )

        agent_index: Dict[str, ClaudeCodeAgent] = {a.id: a for a in self._agents}

        while len(self._fruited) < len(self._agents):
            # Identify agents ready to activate: dependencies all fruited.
            batch: List[ClaudeCodeAgent] = []
            for agent in self._agents:
                if agent.id in self._fruited:
                    continue
                deps = self._dependency_map.get(agent.id, [])
                if all(d in self._fruited for d in deps):
                    batch.append(agent)

            if not batch:
                logger.warning(
                    "No agents eligible for activation — possible circular dependency. "
                    "Fruited: %s, Remaining: %s",
                    self._fruited,
                    {a.id for a in self._agents} - self._fruited,
                )
                break

            # Activate and execute the batch concurrently.
            for agent in batch:
                agent.activate()

            results = await asyncio.gather(
                *(agent.execute() for agent in batch),
                return_exceptions=True,
            )

            # Record which agents fruited.
            for agent, result in zip(batch, results):
                if isinstance(result, Exception):
                    logger.error(
                        "Agent %s raised during execution: %s", agent.id, result
                    )
                    continue
                if agent.state == AgentState.FRUITING:
                    self._fruited.add(agent.id)
                    logger.info("Agent %s fruited in petri dish", agent.id)

            # Safety: if no agent in this batch fruited, we are stuck.
            newly_fruited = {a.id for a in batch if a.state == AgentState.FRUITING}
            if not newly_fruited:
                logger.warning("No agents fruited in this wave — halting activation")
                break

        self._is_complete = len(self._fruited) == len(self._agents)
        if self._is_complete:
            logger.info("Petri dish culture complete — all agents fruited")
        else:
            logger.warning(
                "Petri dish culture incomplete — %d/%d agents fruited",
                len(self._fruited),
                len(self._agents),
            )

    async def collect_fruits(self) -> List[Dict[str, Any]]:
        """
        Aggregate the fruiting outputs from all agents in the culture.

        Returns a list of fruit payloads, one per agent that reached
        the FRUITING state.
        """
        fruits: List[Dict[str, Any]] = []
        for agent in self._agents:
            if agent.state == AgentState.FRUITING:
                payload = await agent.fruit()
                if payload is not None:
                    fruits.append(payload)
        logger.info("Collected %d fruits from petri dish", len(fruits))
        return fruits
