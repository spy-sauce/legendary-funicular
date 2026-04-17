# HYPHA-LAYOUT_AGENT

## Goal

Build the visual shell for the architecture diagram: a layered dark-mode layout with canvas particle background, layer headers, animated flow connectors between layers, and a responsive grid system.

## Scope

### In Scope
- HTML structure for the diagram container
- CSS for dark-mode aesthetic (Space Mono + Syne fonts)
- Canvas particle background with connection lines
- Layer headers and visual separators
- Flow connectors with animated particles between layers
- Responsive grid layout for component cards
- CSS custom properties from NUTRIENTS.md §2

### Out of Scope
- Component card content/interactivity
- Detail panel
- Cost visualization section
- Search/filter functionality
- Final HTML assembly

## Inputs

### Contracts
- `NUTRIENTS.md §2` — Design tokens (colors, typography, spacing, animation)
- `NUTRIENTS.md §4` — Layer definitions and ordering
- `NUTRIENTS.md §7` — Particle specification

### Upstream Agents
- None (this agent has no dependencies)

## Outputs

### Deliverables
- `layout-shell.html` — HTML structure for the visual shell
- `layout-styles.css` — All CSS for the layout (can be `<style>` block)
- `layout-particles.js` — Canvas particle background script (can be `<script>` block)

### Contract Fulfillment
- All design tokens from §2 applied as CSS custom properties
- All four layers rendered with correct colors and order
- Particle behavior matches §7 specification

## Acceptance Criteria

- [ ] Dark-mode palette matches NUTRIENTS.md §2
- [ ] Space Mono (code) and Syne (display) fonts loaded from Google Fonts
- [ ] Four distinct layers visible with correct accent colors
- [ ] Layer headers show layer name and description
- [ ] Canvas particle background animates smoothly
- [ ] Particles connect with lines when within 100px
- [ ] Grid is responsive (single column on mobile, 2-3 columns on desktop)
- [ ] Flow connectors animate between layers
- [ ] No external JS dependencies
- [ ] All styles use CSS custom properties for consistency

## Notes

- Reference `templates/scale.html` for aesthetic guidelines
- Particle count should scale with viewport (~100 on desktop)
- Use `requestAnimationFrame` for smooth animation
- Consider reduced-motion preference: `@media (prefers-reduced-motion: reduce)`
- Flow connectors can use SVG or CSS/canvas — choose simplest approach
- Grid should accommodate 3-7 components per layer
