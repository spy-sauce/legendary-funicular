// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Bundled upgrade registry. Every upgrade that ships with the framework is
// imported here and exposed through the public resolve / list API used by
// cultivate.ts and the `mycelium upgrades` command.
//
// Project-local custom upgrades are a future extension — the registry is
// kept intentionally small and static so version upgrades behave
// predictably.

import type { Upgrade } from "../lib/upgrades/types.js";
import hyphaValidator from "./hypha-validator.js";
import crashRecovery from "./crash-recovery.js";
import depth3Enforcement from "./depth-3-enforcement.js";
import cacheHeaders from "./cache-headers.js";
import routingMap from "./routing-map.js";

const BUNDLED: Upgrade[] = [
  hyphaValidator,
  crashRecovery,
  depth3Enforcement,
  cacheHeaders,
  routingMap,
];

export const REGISTRY: Map<string, Upgrade> = new Map(
  BUNDLED.map((u) => [u.manifest.name, u])
);

export function listAll(): Upgrade[] {
  return [...BUNDLED];
}

export function resolveUpgrades(names: string[]): Upgrade[] {
  const resolved: Upgrade[] = [];
  const missing: string[] = [];

  for (const n of names) {
    const u = REGISTRY.get(n);
    if (u) resolved.push(u);
    else missing.push(n);
  }

  if (missing.length > 0) {
    throw new Error(
      `unknown upgrade(s): ${missing.join(", ")}. run \`mycelium upgrades list\` to see what's available.`
    );
  }

  const active = new Set(resolved.map((u) => u.manifest.name));
  for (const u of resolved) {
    for (const c of u.manifest.conflicts ?? []) {
      if (active.has(c)) {
        throw new Error(
          `upgrade "${u.manifest.name}" conflicts with "${c}" — both are installed.`
        );
      }
    }
  }

  return resolved;
}
