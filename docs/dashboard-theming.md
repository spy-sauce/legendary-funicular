# Dashboard Theming Guide

Customize your cultivation's dashboard by editing `theme.yaml`. This guide walks through the schema, worked examples, and the reasoning behind the default cryogenic palette.

---

## 1. The `theme.yaml` Schema

Your theme file lives at the cultivation root, next to `mycelium.yaml`. Run `mycelium dashboard init` to scaffold a default; edit in place.

For the canonical TypeScript shape and validation contract, see **NUTRIENTS.md §1**. Below is a quick annotation of what each top-level key controls on-screen.

| Key | Controls |
|-----|----------|
| `brand.title` | Dashboard titlebar text |
| `brand.tagline` | Subtitle beneath the title |
| `brand.logo_char` | Single glyph rendered in the header seal |
| `palette.ink` / `ink_2` | Background gradient (darkest layer) |
| `palette.ice` / `ice_2` | Primary and secondary text colors |
| `palette.cryo` | Accent color — interactive elements, highlights |
| `palette.rule` | Divider lines and grid rules |
| `lifecycle.*` | Hue for each lifecycle state (germ / grow / flow / fruit / dorm) |
| `severity.*` | Alert badge and border colors (warn / alert / crit) |
| `identity.<biome_id>` | Stable hue assigned to each biome — see §3 |
| `modulator.*` | Brightness multipliers applied per lifecycle state — see §4 |

---

## 2. Per-Cultivation Customization

Each cultivation can override the default theme to match its domain or visual emphasis. Two worked examples below.

### 2.1 Security-focused cultivation

A security audit cultivation wants critical-severity surfaces to dominate. Shift `palette.cryo` toward the red band and boost `severity.crit` saturation.

**Before (default):**

```yaml
palette:
  cryo: "#7AE5FF"

severity:
  crit: "#DB5C6E"
```

**After (security-tint):**

```yaml
palette:
  cryo: "#E07A7A"   # warm red accent

severity:
  crit: "#FF5A5A"   # brighter, more saturated critical
```

**On-screen changes:**

- Interactive highlights (buttons, focused rings) shift from cyan to warm red.
- Critical alert badges pulse brighter, drawing immediate eye.
- Lifecycle state colors remain unchanged — agents and leaves stay legible.

### 2.2 Docs-only cultivation

A documentation-heavy cultivation has most biomes dormant by design. The default `dorm` brightness (0.25) makes dormant nodes nearly invisible. Raise it.

**Before (default):**

```yaml
modulator:
  pending_brightness: 0.30
  active_brightness:  1.00
  fruit_brightness:   0.90
  failed_brightness:  0.45
  active_pulse_hz:    0.9
```

**After (docs-tint):**

```yaml
modulator:
  pending_brightness: 0.40
  active_brightness:  1.00
  fruit_brightness:   0.95
  failed_brightness:  0.50
  active_pulse_hz:    0.6   # slower pulse for calmer visual
```

**On-screen changes:**

- Dormant biomes render at 50% brightness instead of 25%, keeping them readable.
- Slower pulse rate (0.6 Hz vs 0.9 Hz) suits a less time-critical workflow.

---

## 3. Biome Identity Color Rationale

Each biome in the `identity` map gets a **stable hue**. Lifecycle transitions modulate **brightness and saturation**, never hue. Why?

**Legibility across states.** An operator learns that `dashboard-canvas` is cyan and `cache-network-store` is teal. When the biome moves from `germ` (dim) to `flow` (bright), the hue stays recognizable — only the intensity shifts. This lets the operator track biomes by color without re-learning after each state change.

**Hue stays; brightness shifts.** The default palette assigns spectrally separated hues so adjacent biomes remain distinguishable even under dim modulator values. The modulator then applies per-state brightness multipliers (see §4), not hue rotations.

### Visual ground truth

The cryogenic palette was developed against the v9.4 prototype:

```
.superpowers/brainstorm/4035-1778891130/content/hybrid-v9.4-cache-relays.html
```

(Gitignored, local-only. Refer by path; do not link.)

**Why cryogenic over warm?** An earlier iteration used single-bulb warmth (amber tones, candlelight gradients) to invoke the "cellar" metaphor. This was rejected for two reasons:

1. **Dense data legibility.** The dashboard renders 10–50 nodes simultaneously. Warm palettes with similar luminance values caused biomes to blur together at the canvas level.
2. **Operator-console framing.** The dashboard is a mission-control surface, not a consumer app. Cryo-cool tones read as "system status" rather than "cozy product".

The default cyan/teal/violet palette survives color-vision simulation (deuteranopia, protanopia) at 70%+ distinguishability across the 10 biome identity slots.

---

## 4. Lifecycle Modulator Curves

The `modulator` block defines brightness multipliers applied to each biome's identity hue based on its current lifecycle state. The curve is:

```
pending  → active  → fruit   → dorm
  0.30      1.00      0.90     (implicit: ~0.25)
```

`failed` biomes use `failed_brightness` (0.45 default), which is intentionally brighter than dormant but dimmer than active — the operator should notice failures without them visually shouting over healthy active nodes.

### Worked curve: germinating → flowing → dormant

Consider a biome with identity hue `#7AE5FF` (HSL: 192°, 100%, 74%).

| State | Brightness multiplier | Rendered luminance |
|-------|----------------------|-------------------|
| `germ` (pending) | 0.30 | 22% (dim) |
| `grow` | 0.65 (interpolated) | 48% |
| `flow` (active) | 1.00 | 74% (full) |
| `fruit` | 0.90 | 67% |
| `dorm` | 0.25 | 18% (very dim) |

The `active_pulse_hz` (default 0.9) adds a slow sinusoidal modulation to active nodes: ±8% brightness at 0.9 cycles per second. This falls within the slow-pulse discipline (max 1.5 Hz) to avoid strobe-like flicker.

### Numeric formula

```
rendered_luminance = base_luminance * modulator[state]
pulse_offset       = sin(2 * PI * active_pulse_hz * t) * 0.08
final_luminance    = clamp(rendered_luminance + pulse_offset, 0, 1)
```

This is implemented in the canvas renderer; the theme file only controls the multiplier values.

---

## 5. Cross-References

- **Schema contract:** NUTRIENTS.md §1 (`DashboardTheme` interface, `loadTheme` loader, validation rules)
- **CLI surface:** DEVELOPER_GUIDE.md §16 (`mycelium dashboard {init,serve,render}`)
- **Cache relay visual semantics:** `docs/cache-network-micro-agents.md` (HIT_HALO is dashboard-internal, not a contract)
- **Visual prototype (local-only):** `.superpowers/brainstorm/4035-1778891130/content/hybrid-v9.4-cache-relays.html`

---

*The network provides.*
