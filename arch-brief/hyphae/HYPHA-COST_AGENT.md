# HYPHA-COST_AGENT

## Goal

Build the cost visualization section that demonstrates why parallel execution beats sequential — a horizontal bar/comparison showing time and cost differences with real numbers from NUTRIENTS.md §8.

## Scope

### In Scope
- Cost comparison visualization (sequential vs parallel)
- Animated bars showing relative time/cost
- Real token cost numbers from NUTRIENTS.md §8
- Model pricing display (claude-sonnet-4-6 vs claude-opus-4-7)
- Time-to-completion emphasis (the primary win)
- Formula/math visibility
- CSS animations for comparison effect

### Out of Scope
- Layout shell
- Component cards
- Detail panel
- Search/filter
- Final HTML assembly

## Inputs

### Contracts
- `NUTRIENTS.md §2` — Design tokens (cost colors: sequential red, parallel green, savings yellow)
- `NUTRIENTS.md §8` — Cost model (token rates, formulas, example calculations)

### Upstream Agents
- None (this agent has no dependencies)

## Outputs

### Deliverables
- `cost-section.html` — HTML structure for cost visualization
- `cost-styles.css` — CSS for bars, animations, typography
- `cost-script.js` — Animation logic, number display

### Contract Fulfillment
- All numbers match §8 exactly
- Cost colors match §2 tokens

## Acceptance Criteria

- [ ] Displays token costs for claude-sonnet-4-6 ($3/$15 per 1M)
- [ ] Displays token costs for claude-opus-4-7 ($15/$75 per 1M)
- [ ] Shows sequential calculation: 5 agents × $0.30 = $1.50, Time: 5T
- [ ] Shows parallel calculation: same cost, Time: 1T (5× faster)
- [ ] Visual bars animate to show time comparison (5T vs 1T)
- [ ] Emphasizes "The win is time, not raw token cost"
- [ ] Shows formulas in readable format
- [ ] Uses correct colors: sequential (#ef4444), parallel (#22c55e)
- [ ] Savings/speedup shown prominently
- [ ] Animation is smooth and not distracting
- [ ] Numbers are real, not placeholders

## Notes

- The key insight: parallel doesn't save money, it saves TIME
- 5× speedup is the headline — make it viscerally clear
- Consider: side-by-side bars, animated counter, timeline comparison
- Keep it compact — this is a supporting element, not the main diagram
- Position: horizontal bar at top of diagram area
- Use Space Mono for numbers/formulas, Syne for labels
- Animation should run on page load and optionally replay on hover
