// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Stack presets — opinionated tech-stack briefs handed to the planner agent.
// Add new presets here and they become available via `mycelium plant --stack <name>`.
//
// Each preset MUST supply a `contractAppendix` — a frozen contract surface the
// planner copies verbatim into NUTRIENTS.md. This is what prevents the
// contract-drift class of failure observed in early cultivations: prose-only
// NUTRIENTS lets parallel leaves interpret the same surface inconsistently.
// The appendix is the verifier's source of truth.
//
// Section semantics:
//   A. Dependency Manifest        — verbatim copy
//   B. Component Prop Contracts   — verbatim copy
//   C. Symbol Ownership Matrix    — baseline rows verbatim; planner appends
//                                    organism-specific rows from agent decomposition
//   D. Barrel File Ownership      — verbatim copy
//   E. Allow-listed Identifiers   — universal rules verbatim; planner appends
//                                    organism enums + route map
//   F. Style System Rules         — verbatim copy

import { EXPO_SUPABASE_APPENDIX } from "./appendix.expo-supabase.js";
import { NEXTJS_FASTAPI_SUPABASE_APPENDIX } from "./appendix.nextjs-fastapi-supabase.js";

export interface ContractAppendix {
  /** Intro paragraph + the planner directive. Copied verbatim into NUTRIENTS. */
  preamble: string;
  /** Section A — full dependency list with owners. Verbatim. */
  dependencyManifest: string;
  /** Section B — TypeScript interfaces for shared primitives. Verbatim. */
  primitiveProps: string;
  /** Section C — baseline rows for primitives + theme. Planner appends organism rows. */
  baselineOwnership: string;
  /** Section D — barrel file ownership table. Verbatim. */
  barrelOwnership: string;
  /** Section E — universal rules (Ionicons, brand glyphs). Planner appends organism specifics. */
  allowlistedIdentifiers: string;
  /** Section F — style system rules. Verbatim. */
  styleSystemRules: string;
  /**
   * Section G — Screen Ownership Matrix. Universal wiring rules verbatim.
   * Planner generates the per-route table from §E's RootStackParamList,
   * mapping each route → biome → screen file path → import line. This is
   * what prevents the "PlaceholderScreen returns null" black-screen failure
   * mode observed in run-3.
   */
  screenOwnershipMatrix: string;
  /**
   * Section H — Security Rules. Tiered enforcement (demo/startup/regulated)
   * with [always-block] catastrophic floor. Renders as §H of NUTRIENTS.md.
   * Contains universal rules + stack-specific addenda inline.
   */
  securityRules: string;
}

export interface StackPreset {
  name: string;
  description: string;
  rules: string;
  /** Suggested agents — the planner may use, rename, or skip. */
  archetypeAgents: string[];
  /** Required agents — the planner MUST create these; they own contract baselines. */
  requiredAgents: string[];
  claudeMdHeader: string;
  /** Required. Frozen contract surface the planner copies into NUTRIENTS.md. */
  contractAppendix: ContractAppendix;
}

const NEXTJS_FASTAPI_SUPABASE: StackPreset = {
  name: "nextjs-fastapi-supabase",
  description:
    "Next.js 14 (App Router) + FastAPI (Python 3.11+) + Supabase Postgres + Stripe",
  rules: `- FastAPI only for backend — no Express, no other framework
- All DB access via Supabase Python or JS client — no raw SQL outside migrations
- Design tokens from NUTRIENTS.md → DESIGN_TOKENS — no hardcoded colors or fonts
- Mobile-first — every component built for mobile, scaled up to desktop
- TypeScript strict mode — no \`any\`
- Dark theme is default and only`,
  archetypeAgents: [
    "infra-agent",
    "auth-agent",
    "data-agent",
    "api-agent",
    "frontend-agent",
    "payments-agent",
  ],
  requiredAgents: ["frontend-agent", "api-agent", "data-agent"],
  claudeMdHeader: `## Stack
- Frontend: Next.js 14 (App Router) → Vercel
- Backend: FastAPI (Python 3.11+) → Hetzner
- DB: PostgreSQL via Supabase
- Auth: Custom WebAuthn/Passkeys + JWT
- Payments: Stripe
- Storage: Supabase Storage`,
  contractAppendix: NEXTJS_FASTAPI_SUPABASE_APPENDIX,
};

const EXPO_SUPABASE: StackPreset = {
  name: "expo-supabase",
  description:
    "Expo (React Native + TypeScript) + Supabase + React Navigation + Stripe Connect (stubbed for demo, real for prod)",
  rules: `- Expo SDK 50, React Native 0.73, TypeScript strict mode — no \`any\`
- Routing via @react-navigation/* — NEVER expo-router (lock decision)
- All DB access via @supabase/supabase-js — no raw SQL outside migrations
- Design tokens from NUTRIENTS.md → DESIGN_TOKENS — no hardcoded hex
- Raw <Text> from react-native is forbidden in screens; use Typography primitives
- Every screen wraps content in <Screen> (owns safe-area + scroll behavior)
- Dark theme is default and only
- No biome adds a runtime dep without amending the Dependency Manifest`,
  archetypeAgents: [
    "schema-core",
    "design-system",
    "auth",
    "app-shell",
    "discovery",
    "messaging",
  ],
  requiredAgents: ["schema-core", "design-system", "auth", "app-shell"],
  claudeMdHeader: `## Stack
- Mobile shell: Expo SDK 50 (React Native 0.73 + TypeScript)
- Backend: Supabase (Postgres + Auth + Storage + RLS)
- Navigation: @react-navigation/native + native-stack + bottom-tabs
- Auth: Supabase Auth (email/password + OAuth providers)
- Payments: Stripe Connect (stub for demo; real for prod)
- Storage: Supabase Storage`,
  contractAppendix: EXPO_SUPABASE_APPENDIX,
};

export const STACKS: Record<string, StackPreset> = {
  "nextjs-fastapi-supabase": NEXTJS_FASTAPI_SUPABASE,
  "expo-supabase": EXPO_SUPABASE,
};

export function getStack(name?: string): StackPreset | null {
  if (!name) return null;
  return STACKS[name] ?? null;
}

/**
 * Render a contract appendix as a single markdown string suitable for splicing
 * into the planner prompt. Matches the format the planner is required to copy
 * into NUTRIENTS.md verbatim.
 */
export function renderContractAppendix(appendix: ContractAppendix): string {
  return [
    "## CONTRACT APPENDIX (verbatim → NUTRIENTS.md)",
    "",
    appendix.preamble,
    "",
    "### A. Dependency Manifest",
    "",
    appendix.dependencyManifest,
    "",
    "### B. Component Prop Contracts (TypeScript, frozen)",
    "",
    appendix.primitiveProps,
    "",
    "### C. Symbol Ownership Matrix (baseline rows — planner appends organism rows)",
    "",
    appendix.baselineOwnership,
    "",
    "### D. Barrel File Ownership",
    "",
    appendix.barrelOwnership,
    "",
    "### E. Allow-listed Identifiers (universal rules — planner appends organism enums and route map)",
    "",
    appendix.allowlistedIdentifiers,
    "",
    "### F. Style System Rules",
    "",
    appendix.styleSystemRules,
    "",
    "### G. Screen Ownership Matrix (universal rules — planner appends per-route table)",
    "",
    appendix.screenOwnershipMatrix,
    "",
    "### H. Security Rules",
    "",
    appendix.securityRules,
    "",
  ].join("\n");
}
