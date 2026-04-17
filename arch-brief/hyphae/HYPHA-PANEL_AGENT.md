# HYPHA-PANEL_AGENT

## Goal

Build the slide-in detail panel component that displays when a component card is clicked, showing the file path (copyable), actual source code with syntax highlighting, and exported symbols.

## Scope

### In Scope
- Panel HTML structure
- Slide-in animation from right edge
- File path display with copy-to-clipboard button
- Source code display with syntax highlighting (inline CSS)
- Exported symbols list
- One-line description display
- Close functionality (Escape key, backdrop click, close button)
- Responsive width (50vw desktop, 100vw mobile)

### Out of Scope
- Component card design
- Layout grid
- Cost visualization
- Search/filter
- Final HTML assembly

## Inputs

### Contracts
- `NUTRIENTS.md §1` — `ComponentEntry` interface (what data to display)
- `NUTRIENTS.md §2` — Design tokens for styling
- `NUTRIENTS.md §6` — Panel specification

### Upstream Agents
- None (this agent has no dependencies)

## Outputs

### Deliverables
- `panel-component.html` — Panel HTML structure
- `panel-styles.css` — Panel CSS including transitions
- `panel-script.js` — Panel JavaScript (open, close, fetch, highlight)

### Contract Fulfillment
- Panel behavior matches §6 specification
- Syntax highlighting uses colors from §2

## Acceptance Criteria

- [ ] Panel slides in from right edge with 300ms transition
- [ ] Panel width is 50vw on desktop, 100vw on mobile (< 768px breakpoint)
- [ ] File path displayed at top with copy button
- [ ] Copy button copies path to clipboard and shows feedback
- [ ] Source code displayed in scrollable code block
- [ ] Basic syntax highlighting for TypeScript (keywords, strings, comments)
- [ ] Exported symbols listed below code
- [ ] One-line description shown prominently
- [ ] Panel closes on Escape key press
- [ ] Panel closes on backdrop/overlay click
- [ ] Panel closes on close button (X) click
- [ ] Smooth transition on open and close
- [ ] No external JS dependencies for syntax highlighting

## Notes

- Syntax highlighting must be pure CSS/JS — no Prism, highlight.js, etc.
- Minimum highlighting: keywords (const, function, export, etc.), strings, comments
- Use `<pre><code>` for code block, monospace font
- Backdrop should be semi-transparent overlay
- Consider loading state while fetching source code
- `fetch()` relative paths will work when served locally
- For inlined sources, panel receives source as data attribute or JS variable
