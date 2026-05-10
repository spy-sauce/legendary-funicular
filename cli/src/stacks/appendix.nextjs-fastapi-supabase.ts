// Mycelium Framework — VibeSpace LLC — The network provides.
//
// nextjs-fastapi-supabase contract appendix.
//
// Initial baseline derived from Next.js 14 + FastAPI conventions. Refine on
// the first cultivation that hits this stack — the same pattern as
// expo-supabase, where we measure contract-drift errors and tighten the
// appendix to block them.

import type { ContractAppendix } from "./index.js";

const PREAMBLE = `This appendix is the frozen contract surface for any organism on the nextjs-fastapi-supabase stack. It exists to block the contract-drift class of failure: missing runtime deps, component prop drift, inconsistent styling, ad-hoc icon usage, and duplicate exports.

> The mycelium planner MUST copy every subsection below verbatim into the matching section of NUTRIENTS.md. No paraphrasing. No placeholders. No \`#TODO\`. Sections C and E are partly verbatim (universal rules) and partly planner-generated (organism-specific rows the planner appends from the agent decomposition). Leaves reading NUTRIENTS treat these as frozen contracts — amendments only via FRUIT_READY contract-amendment line, never silent edits.`;

const DEPENDENCY_MANIFEST = `Single source of truth for runtime deps. Default owner is \`frontend-agent\` (web) or \`api-agent\` (Python). A biome that needs a package not on this list MUST emit \`+dep:<pkg>@<ver> reason:<one-line>\` on its FRUIT_READY line, or the orchestrator rejects the harvest.

**Frontend (Next.js 14, App Router):**
- next@^14.2.0 — owner: frontend-agent
- react@^18.3.0 — owner: frontend-agent
- react-dom@^18.3.0 — owner: frontend-agent
- typescript@^5.4.0 — owner: frontend-agent
- @supabase/supabase-js@^2.39.0 — owner: frontend-agent
- @supabase/ssr@^0.1.0 — owner: frontend-agent
- tailwindcss@^3.4.0 — owner: frontend-agent
- class-variance-authority@^0.7.0 — owner: frontend-agent
- clsx@^2.1.0 — owner: frontend-agent
- tailwind-merge@^2.2.0 — owner: frontend-agent
- lucide-react@^0.330.0 — owner: frontend-agent
- @radix-ui/react-* — owner: frontend-agent (per-component pin in package.json)
- stripe@^14.0.0 — owner: payments-agent
- @stripe/stripe-js@^3.0.0 — owner: payments-agent

**Backend (FastAPI, Python 3.11+):**
- fastapi>=0.110 — owner: api-agent
- uvicorn[standard]>=0.27 — owner: api-agent
- pydantic>=2.6 — owner: api-agent
- supabase>=2.4 — owner: api-agent
- python-jose[cryptography]>=3.3 — owner: auth-agent
- stripe>=8.0 — owner: payments-agent
- httpx>=0.26 — owner: api-agent

Frontend is locked to Next.js App Router (NOT Pages Router). Backend is locked to FastAPI (NOT Express, NOT Flask).`;

const PRIMITIVE_PROPS = `Full TS interfaces for every shared primitive in \`components/ui/\`. Frozen: leaves cannot add, remove, or rename props. The frontend-agent biome MUST ship exactly these signatures. If a consumer biome needs a prop not listed, it amends the contract via FRUIT_READY contract-amendment line — never inlines a workaround.

\`\`\`ts
import type { ButtonHTMLAttributes, InputHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type Variant = 'default' | 'primary' | 'secondary' | 'ghost' | 'destructive' | 'outline';
export type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: LucideIcon;
  rightIcon?: LucideIcon;
  asChild?: boolean;
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  leftIcon?: LucideIcon;
  rightIcon?: LucideIcon;
}

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: 'default' | 'elevated' | 'outlined' | 'flat';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export interface AvatarProps {
  src?: string;
  alt?: string;
  fallback?: string;  // initials
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  shape?: 'circle' | 'square';
  className?: string;
}

export interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'destructive';
  size?: 'sm' | 'md';
  className?: string;
}

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}
\`\`\``;

const BASELINE_OWNERSHIP = `Every shared symbol has exactly ONE owner biome. No biome exports a symbol another biome has claimed. If a biome needs a symbol it does not own, it imports — never re-declares.

The rows below are stack-universal — they exist in every nextjs-fastapi-supabase organism. The planner MUST append organism-specific rows below this baseline (entity types, hooks, page-level components) derived from the brief.

| Symbol | Owner biome | File path |
|---|---|---|
| \`createServerClient\`, \`createBrowserClient\` | frontend-agent | \`lib/supabase.ts\` |
| \`Button\`, \`ButtonProps\` | frontend-agent | \`components/ui/button.tsx\` |
| \`Input\`, \`InputProps\` | frontend-agent | \`components/ui/input.tsx\` |
| \`Card\`, \`CardProps\` | frontend-agent | \`components/ui/card.tsx\` |
| \`Avatar\`, \`AvatarProps\` | frontend-agent | \`components/ui/avatar.tsx\` |
| \`Badge\`, \`BadgeProps\` | frontend-agent | \`components/ui/badge.tsx\` |
| \`Dialog\`, \`DialogProps\` | frontend-agent | \`components/ui/dialog.tsx\` |
| \`Spinner\`, \`SpinnerProps\` | frontend-agent | \`components/ui/spinner.tsx\` |
| \`cn\` (className merge) | frontend-agent | \`lib/utils.ts\` |
| \`Variant\`, \`Size\` | frontend-agent | \`components/ui/types.ts\` |
| \`Settings\` (Pydantic) | api-agent | \`api/config.py\` |
| \`get_supabase_client\` | api-agent | \`api/lib/supabase.py\` |
| \`SessionUser\` (Pydantic) | auth-agent | \`api/auth/models.py\` |
| \`get_current_user\` (FastAPI dependency) | auth-agent | \`api/auth/deps.py\` |`;

const BARREL_OWNERSHIP = `Module ownership is enforced at the directory level. A biome may not write to a directory it does not own. Cross-biome imports go through public re-export points; never reach into a biome's internals.

| Path | Owner biome | Allowed exports |
|---|---|---|
| \`components/ui/\` | frontend-agent | All UI primitives. Other biomes import via \`@/components/ui/<name>\`. |
| \`components/<domain>/\` | (per-biome) | Domain-specific components owned by the biome named \`<domain>\`. |
| \`lib/\` | frontend-agent | Cross-cutting utilities (supabase clients, cn, formatters). |
| \`hooks/\` | frontend-agent | Re-exports from each biome's hook tree. |
| \`types/\` | frontend-agent | Sole source of truth for domain entity types. |
| \`app/\` | frontend-agent | Next.js routes. Other biomes provide page-level components consumed by route segments. |
| \`api/\` | api-agent | FastAPI app + per-domain routers. Each domain biome contributes \`api/<domain>/router.py\`. |
| \`api/auth/\` | auth-agent | All auth-related Python modules. |
| \`api/lib/\` | api-agent | Shared Python utilities (DB, logging, settings). |

Cardinal rule: a symbol appears in EXACTLY ONE module. Domain enums live in \`types/\`, NOT in component files.`;

const ALLOWLISTED_IDENTIFIERS = `**Icons.** All icons MUST be \`LucideIcon\` from \`lucide-react\`. NEVER import from other icon libraries. NEVER inline SVGs in component code (use a static asset under \`public/\` if a custom glyph is needed and reference it via \`<Image src=... />\`).

\`\`\`tsx
import { Check, X, Loader2 } from 'lucide-react';
<Check className="h-4 w-4" />
\`\`\`

**Brand glyphs.** Brand logos (Google, GitHub, Stripe, etc.) live as SVG components in \`components/brand/\`, owned by frontend-agent. NEVER reference brand logos through Lucide.

**Domain enums.** Every domain enum (status, role, type, etc.) is owned by frontend-agent for the TS side (\`types/\`) and by the corresponding api-agent biome for the Python side (\`api/<domain>/models.py\`). Both sides MUST stay in sync; the contract amendment process covers both edits.

**Route names.** Next.js App Router uses file-based routing — route paths are file paths under \`app/\`. The planner appends the full route map below from the brief's page inventory. Cross-route navigation uses typed \`Link href\` literals or a \`routes\` constant exported from \`lib/routes.ts\`. Biomes do NOT inline route strings.`;

const STYLE_SYSTEM_RULES = `1. **NEVER hardcode hex colors in component code.** All colors come from Tailwind tokens defined in \`tailwind.config.ts\`. Theme tokens live in CSS variables. Rationale: hardcoded hex defeats the token system and prevents theme switching.

   \`\`\`tsx
   // GOOD
   <div className="bg-primary text-primary-foreground" />
   // BAD
   <div style={{ backgroundColor: '#7C5CFF' }} />
   \`\`\`

2. **Conditional className composition uses \`cn\` from \`lib/utils.ts\`** (clsx + tailwind-merge). Never inline string concatenation.

   \`\`\`tsx
   // GOOD
   <div className={cn('base-classes', active && 'bg-primary', disabled && 'opacity-50')} />
   // BAD
   <div className={\`base-classes \${active ? 'bg-primary' : ''}\`} />
   \`\`\`

3. **Class-Variance-Authority (cva) for primitive variants.** Every primitive that exposes a \`variant\` or \`size\` prop MUST implement them via \`cva\`. NEVER ad-hoc switch statements over variant strings.

4. **Server Components by default; Client Components only when needed.** Add \`'use client'\` only when the component uses state, effects, browser APIs, or event handlers. Rationale: Server Component default keeps bundle size down and aligns with App Router conventions.

5. **TypeScript strict mode.** No \`any\`. No \`@ts-ignore\` (use \`@ts-expect-error\` with a comment explaining why, or fix the type). No \`as\` casts on shared primitives.

6. **API responses are typed end-to-end.** FastAPI Pydantic models on the backend; matching TS interfaces on the frontend. NEVER consume an API response without a type. The api-agent biome owns the source-of-truth Pydantic models; frontend-agent owns the TS mirrors.`;

const SCREEN_OWNERSHIP_MATRIX = `Next.js App Router uses file-based routing — there is no central RootNavigator to stub. Each route is a directory under \`app/\` with a \`page.tsx\` (and optionally \`layout.tsx\`, \`loading.tsx\`, \`error.tsx\`).

**Universal wiring rules:**

1. **Every route in the brief's route inventory MUST have a real \`page.tsx\` file.** Stubbing pages with \`export default function Page() { return null; }\` is FORBIDDEN — it produces the same black-screen failure mode as React Native's PlaceholderScreen anti-pattern. Either ship a real page or ship a visible placeholder showing the route name and "Page pending" copy.

2. **Each domain biome owns its own \`app/<domain>/\` subtree.** \`frontend-agent\` owns \`app/(marketing)/\`, layout files, and root-level files (\`app/layout.tsx\`, \`app/page.tsx\`); domain biomes own everything under their domain segment.

3. **Server vs client components**: routes default to Server Components. \`'use client'\` is required only when state, effects, or browser APIs are needed.

**Required table format** (planner generates from the brief's route inventory):

| Route | Owner biome | File path | Type |
|---|---|---|---|
| \`/\` | frontend-agent | \`app/page.tsx\` | server |
| \`/login\` | auth-agent | \`app/(auth)/login/page.tsx\` | client |
| \`/dashboard\` | frontend-agent | \`app/dashboard/page.tsx\` | server |
| ... (every route in the brief) | ... | ... | ... |

**Anti-pattern (FORBIDDEN):** empty pages returning \`null\`. If a page's logic isn't yet shipped, render a visible placeholder with the route path and a "Page pending" message on the theme background.`;

const SECURITY_RULES = `Section H is the security contract surface for the nextjs-fastapi-supabase stack. Initial baseline — will tighten on first cultivation. Rules tagged with tiers: \`[demo]\` everywhere, \`[startup]\` startup+regulated, \`[regulated]\` regulated only, \`[always-block]\` blocks at every tier.

#### H.1 Secret Management

##### H.1.1 No hardcoded secrets in committed code [always-block]
Rule: No real API keys, tokens, or credentials in committed source. Exempt:
  literals containing \`placeholder\` matching demo-stub patterns.
Audit: \`grep -rEn 'sk_live_|sk_test_|eyJ[A-Za-z0-9]{30,}|service_role|AKIA[0-9A-Z]{16}' src/ api/\` excluding lines containing \`placeholder\` returns zero.
Violation: freeze-block at all tiers.

##### H.1.2 .env gitignored [demo]
Rule: \`.env\`, \`.env.local\`, \`.env.production\` listed in \`.gitignore\`. Only \`.env.example\` (no real values) committed.
Audit: parse \`.gitignore\`; \`git ls-files\` for .env* returns at most \`.env.example\`.
Violation: demo=advisory, startup+=freeze-block.

##### H.1.3 Server secrets never in client bundle [always-block]
Rule: Next.js client code (under \`app/\` or \`components/\` consumed by client components) MUST NOT reference secrets without \`NEXT_PUBLIC_\` prefix. Server-only secrets (no prefix) used only in Server Components, Server Actions, Route Handlers, or under \`api/\` (FastAPI).
Audit: in \`'use client'\`-annotated files, grep for env var references not starting with \`NEXT_PUBLIC_\`; must return zero.
Violation: freeze-block at all tiers.

#### H.2 Auth Flows

##### H.2.1 Sessions in httpOnly cookies, never localStorage [demo]
Rule: Auth tokens persisted as httpOnly + Secure + SameSite=Strict cookies. \`localStorage\`, \`sessionStorage\` for sessions are forbidden.
Audit: grep \`localStorage.setItem\` and \`sessionStorage.setItem\` in src/ near auth/session/token identifiers.
Violation: demo=advisory, startup+=freeze-block.

#### H.3 Database (RLS)

##### H.3.1 Every Supabase table has RLS enabled [always-block]
Rule: Every \`CREATE TABLE\` in migrations is followed by \`ENABLE ROW LEVEL SECURITY\` in the same file.
Audit: regex parse SQL migrations.
Violation: freeze-block at all tiers.

#### H.4 PII Handling

##### H.4.1 PII categories defined [demo]
Rule: NUTRIENTS.md §H.4 defines PII vocabulary (default: email, phone, address, payment, legal name, location, national IDs).
Audit: contract-vs-contract via audit prompt.
Violation: demo=advisory, startup+=freeze-block.

##### H.4.2 No PII in logs [demo]
Rule: \`console.log\`, \`console.error\`, server logger calls, and \`Sentry.captureException\` MUST NOT include PII identifiers.
Audit: regex grep for log calls containing PII identifier names.
Violation: demo=advisory, startup+=freeze-block.

(Other rules — H.2.2/H.2.3, H.3.2-5, H.4.3-5 — refine on first cultivation.)
`;

export const NEXTJS_FASTAPI_SUPABASE_APPENDIX: ContractAppendix = {
  preamble: PREAMBLE,
  dependencyManifest: DEPENDENCY_MANIFEST,
  primitiveProps: PRIMITIVE_PROPS,
  baselineOwnership: BASELINE_OWNERSHIP,
  barrelOwnership: BARREL_OWNERSHIP,
  allowlistedIdentifiers: ALLOWLISTED_IDENTIFIERS,
  styleSystemRules: STYLE_SYSTEM_RULES,
  screenOwnershipMatrix: SCREEN_OWNERSHIP_MATRIX,
  securityRules: SECURITY_RULES,
};
