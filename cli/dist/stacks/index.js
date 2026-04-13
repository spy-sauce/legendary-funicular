// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Stack presets — opinionated tech-stack briefs handed to the planner agent.
// Add new presets here and they become available via `mycelium plant --stack <name>`.
const NEXTJS_FASTAPI_SUPABASE = {
    name: "nextjs-fastapi-supabase",
    description: "Next.js 14 (App Router) + FastAPI (Python 3.11+) + Supabase Postgres + Stripe",
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
    claudeMdHeader: `## Stack
- Frontend: Next.js 14 (App Router) → Vercel
- Backend: FastAPI (Python 3.11+) → Hetzner
- DB: PostgreSQL via Supabase
- Auth: Custom WebAuthn/Passkeys + JWT
- Payments: Stripe
- Storage: Supabase Storage`,
};
export const STACKS = {
    "nextjs-fastapi-supabase": NEXTJS_FASTAPI_SUPABASE,
};
export function getStack(name) {
    if (!name)
        return null;
    return STACKS[name] ?? null;
}
//# sourceMappingURL=index.js.map