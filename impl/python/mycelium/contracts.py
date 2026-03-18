# Mycelium Framework — VibeSpace LLC — The network provides.

"""
contracts.py — Chemical signals of the mycelium network.

Contracts are the pheromones and enzymes that coordinate the organism.
Each one defines a shared interface — a chemical language between hyphae.
Once frozen, a contract is as immutable as a fossil in amber: the organism
has committed to that signal shape and cannot change it mid-growth.
"""

from __future__ import annotations

import json
import logging
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import jsonschema

logger = logging.getLogger("mycelium.contracts")

# -- Path to the canonical schema -------------------------------------------
# Field notes: the schema lives in spec/contracts/ at the repository root.
# We resolve relative to this file's location to stay portable.

_SCHEMA_DIR = Path(__file__).resolve().parent.parent.parent.parent / "spec" / "contracts"
_CONTRACT_SCHEMA_PATH = _SCHEMA_DIR / "contract.schema.json"


class ContractViolationError(Exception):
    """
    Raised when a contract fails validation — the chemical signal is malformed.

    A malformed signal poisons the substrate. The organism must reject it
    before it propagates.
    """


def _load_schema() -> dict[str, Any]:
    """
    Load the contract JSON schema from the spec directory.

    Field notes: the schema is the organism's immune system — it defines
    what a healthy signal looks like. Without it, anything can claim to
    be a contract.
    """
    if not _CONTRACT_SCHEMA_PATH.exists():
        raise FileNotFoundError(
            f"Contract schema not found at {_CONTRACT_SCHEMA_PATH}. "
            "The organism cannot validate signals without its immune system."
        )
    with open(_CONTRACT_SCHEMA_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)  # type: ignore[no-any-return]


_schema_cache: dict[str, Any] | None = None


def _get_schema() -> dict[str, Any]:
    """Cached schema loader — no need to read the disk on every validation."""
    global _schema_cache
    if _schema_cache is None:
        _schema_cache = _load_schema()
    return _schema_cache


def validate_contract(contract: dict[str, Any]) -> None:
    """
    Validate a contract against the canonical schema.

    Field notes: hold the specimen up to the reference plate. If the
    morphology doesn't match, it's not a real signal — discard it.

    Args:
        contract: A dictionary representing a contract.

    Raises:
        ContractViolationError: If validation fails.
    """
    schema = _get_schema()
    try:
        jsonschema.validate(instance=contract, schema=schema)
    except jsonschema.ValidationError as exc:
        raise ContractViolationError(
            f"Contract '{contract.get('name', '<unnamed>')}' failed validation: {exc.message}"
        ) from exc


def load_contract(path: str | Path) -> dict[str, Any]:
    """
    Load a single contract from a JSON file and validate it.

    Args:
        path: Filesystem path to the contract JSON file.

    Returns:
        The validated contract as a dictionary.

    Raises:
        ContractViolationError: If the contract is malformed.
        FileNotFoundError: If the file doesn't exist.
    """
    filepath = Path(path)
    if not filepath.exists():
        raise FileNotFoundError(f"Contract file not found: {filepath}")

    with open(filepath, "r", encoding="utf-8") as fh:
        contract: dict[str, Any] = json.load(fh)

    validate_contract(contract)
    logger.info("Loaded and validated contract: %s v%s", contract["name"], contract["version"])
    return contract


def load_contracts_from_directory(directory: str | Path) -> list[dict[str, Any]]:
    """
    Load all contract JSON files from a directory.

    Field notes: sweep the substrate and collect every signal found.
    Each one is individually validated — one rotten specimen doesn't
    spoil the batch (it's logged and skipped).

    Args:
        directory: Path to a directory containing contract JSON files.

    Returns:
        A list of validated contracts.
    """
    dirpath = Path(directory)
    if not dirpath.is_dir():
        raise NotADirectoryError(f"Not a directory: {dirpath}")

    contracts: list[dict[str, Any]] = []
    for filepath in sorted(dirpath.glob("*.json")):
        # Skip schema files — they're reference plates, not specimens
        if filepath.name.endswith(".schema.json"):
            continue
        try:
            contract = load_contract(filepath)
            contracts.append(contract)
        except (ContractViolationError, json.JSONDecodeError) as exc:
            logger.warning("Skipping malformed contract %s: %s", filepath.name, exc)

    logger.info("Loaded %d contracts from %s", len(contracts), dirpath)
    return contracts


def freeze_contracts(contracts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Freeze a list of contracts — seal them in amber.

    Once frozen, contracts are immutable for the duration of the growth
    cycle. This prevents mid-execution signal mutations that would
    confuse the organism.

    Field notes: freezing sets `frozen=true` and stamps `frozenAt` with
    the current UTC time. Already-frozen contracts are left untouched —
    you can't freeze amber twice.

    Args:
        contracts: List of contract dictionaries.

    Returns:
        A new list of deep-copied, frozen contracts.
    """
    frozen_specimens: list[dict[str, Any]] = []
    now = datetime.now(timezone.utc).isoformat()

    for contract in contracts:
        specimen = deepcopy(contract)
        if specimen.get("frozen"):
            logger.debug(
                "Contract %s already frozen at %s — skipping",
                specimen.get("name"),
                specimen.get("frozenAt"),
            )
            frozen_specimens.append(specimen)
            continue

        specimen["frozen"] = True
        specimen["frozenAt"] = now
        frozen_specimens.append(specimen)
        logger.info("Froze contract: %s", specimen.get("name"))

    return frozen_specimens
