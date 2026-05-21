# Doppel — Design System

> AI knowledge marketplace. Creators build persistent AI clones trained on their
> own expertise and sell access per query. Consumers chat with expert clones,
> synthesise perspectives across multiple clones, and buy packaged knowledge
> bundles.

---

## Product context

Doppel is an **AI knowledge marketplace** with two distinct audiences sharing
one platform:

**Creators** train an AI clone on their own expertise — emails, Slack threads,
GitHub history, Notion docs, file uploads, recorded meetings, manual Q&A. The
clone reasons in their voice, cites real sources, and answers with a confidence
score. Creators set a per-query price and earn 80% of every paid query.

**Consumers** browse the marketplace, query individual clones directly, or use
**Synthesis** to ask 2–5 clones the same question and get a synthesised answer
plus each clone's individual perspective. They can also "Deliberate" — pair two
clones and watch them debate a topic across rounds.

**Enterprise / teams** layer Doppel on top of departing or busy experts. When
Sarah leaves, her clone stays queryable. Individual brains aggregate into role
brains; role brains expose a Skills API that AI agents can call before acting.

### Surfaces (two design languages)

| Surface | URL pattern | Theme | Vibe |
|---|---|---|---|
| Marketing landing | `/` | **DARK** | Quiet, editorial, glassmorphic — for creators |
| Creator dashboard | `/dashboard/*` | **DARK** | Cockpit; dense glass panels, telemetry |
| Public chat | `/c/[handle]` | **DARK** | Focused conversation with the clone |
| Marketplace | `/marketplace`, `/marketplace/[handle]` | **LIGHT** | Browse & discover, retail energy |
| Synthesis | `/synthesis` | **LIGHT** | Decision tool — neutral, clinical |
| Bundles | `/marketplace/bundles/[id]` | **LIGHT** | Knowledge "products" — light retail |

The dark surfaces are for **the creator's workspace** (private, focused). The
light surfaces are for **public discovery and transaction** (open, browsable).

### Source materials

| Resource | Where | Access |
|---|---|---|
| `ui/` Next.js codebase | Mounted via File System Access API | local_ls / local_read |
| Marketing site `app/page.tsx` | `ui/app/page.tsx` | local |
| Marketplace pages | `ui/app/marketplace/*` | local |
| Creator dashboard | `ui/app/(dashboard)/dashboard/*` | local |
| Public chat | `ui/app/c/[handle]/*` | local |
| Synthesis | `ui/app/synthesis/page.tsx` | local |
| Global tokens | `ui/app/globals.css`, `ui/tailwind.config.ts` | local |
| Components | `ui/components/{chat,dashboard,layout,ui}/*` | local |

This design system distills the **intended** Doppel system per the brief, not
the in-flight state of the repo. The repo currently has the dashboard remapped
to light tones while the dark dashboard look is being reinstated; this system
documents the canonical dark dashboard / light marketplace split.

---

## File index

```
.
├─ README.md               this file — start here
├─ SKILL.md                Agent Skills frontmatter, makes this folder a
│                          drop-in skill in Claude Code
├─ colors_and_type.css     CSS variables for both surfaces + semantic type
│                          scale. Load this first.
│
├─ assets/
│   ├─ wordmark-{light,dark}.svg
│   ├─ logo-lockup-{light,dark}.svg
│   ├─ mark-{light,dark}.svg
│   └─ icons/              28 in-house 16×16 SVGs (stroke 1.4)
│
├─ preview/                ~30 small spec cards (~700×variable) rendered
│                          into the Design System tab. Type, colors,
│                          spacing, components, brand groups.
│
├─ ui_kits/
│   ├─ marketplace/        LIGHT — 5 screens (Browse, Detail, Synthesis,
│   │                      Bundle, Chat-dark). React + Babel inline.
│   │   ├─ README.md       full screen map and components
│   │   ├─ index.html      click-thru prototype with all 5 screens
│   │   ├─ marketplace.css
│   │   ├─ primitives.jsx  Header, Avatar, Button, Stars, Icon, CATS
│   │   ├─ BrowseScreen.jsx
│   │   ├─ DetailScreen.jsx
│   │   ├─ SynthesisScreen.jsx
│   │   ├─ ChatScreen.jsx
│   │   └─ BundleScreen.jsx
│   │
│   └─ dashboard/          DARK — sidebar shell + 5 full screens + 11
│                          placeholder pages, click-thru via sidebar.
│       ├─ README.md
│       ├─ index.html
│       ├─ dashboard.css
│       ├─ primitives.jsx  Sidebar, PageHead, StatTile, Icon, NAV_GROUPS
│       ├─ OverviewScreen.jsx
│       ├─ TrainScreen.jsx
│       ├─ BrainScreen.jsx
│       ├─ TestScreen.jsx
│       └─ ListingScreen.jsx
```

### Quick start

To build something new in the Doppel system:

1. Pick your surface: light (`<html class="doppel-light">`) or dark (default).
2. Link `colors_and_type.css`.
3. Either link a UI kit's css (`ui_kits/marketplace/marketplace.css` or
   `ui_kits/dashboard/dashboard.css`) for ready primitives, **or** roll your
   own using the CSS variables (`--fg-1`, `--surface-1`, `--doppel-blue`,
   `--radius-xl`, etc).
4. Copy SVGs from `assets/icons/` for iconography. Lucide is the fallback if
   you need a glyph that isn't here.

---

## Content fundamentals

> Voice: **direct, precise, no fluff. Short sentences. Never cheerful or salesy.**

### Tone
Doppel sounds like a senior engineer writing release notes — confident,
quiet, technically literate. It does not perform enthusiasm. It states facts.
Marketing copy is allowed one degree warmer than product copy, but never
playful. Product copy is one degree cooler than marketing.

The brand has an opinion: knowledge is undervalued, lossy and ephemeral, and
that is a problem. Copy carries that conviction without ever saying it
out loud.

### Casing
- **Sentence case for everything** — buttons, labels, headings, nav items.
- Two exceptions: the brand mark **`doppel`** is always lowercase. Eyebrows
  / kickers are UPPERCASE with `letter-spacing: 0.18em`.
- Never use ALL CAPS for emphasis in body copy.

### Person
- **Second person ("you")** when speaking to the user about their clone, their
  knowledge, their decisions: *"Your clone answers with your frameworks."*
- **Third person** when describing what the system does: *"Doppel turns your
  expertise into a permanent, queryable intelligence."*
- **Never "we"** in product UI. "Doppel" or system-as-subject only.

### Sentence rhythm
Short. Declarative. Frequently fragmented. Two clauses max. The landing page
uses two-clause structures — a setup and a counter:

> *"You are the bottleneck. You don't have to be."*
> *"When they leave, it doesn't have to go with them."*
> *"Free for individuals. Company Brain on Enterprise plans."*

Product copy is even tighter: *"50 queries / month"*, *"Connected"*,
*"all reviewed"*, *"3 sources · email, Slack, design doc"*.

### Punctuation
- Em dash `—` for asides and emphasis. Use it liberally.
- Middle dot `·` for compact metadata: *"3 sources · email, Slack, design doc"*.
- Curly quotes `"..."` in marketing copy. Straight quotes in code/API copy.
- Never exclamation points in product UI. One per landing page is the cap.
- Never ellipsis as a "trail-off" decoration. Reserve `…` for *Loading…*,
  *Thinking…*, *Submitting…* — actual ongoing states.

### Vocabulary
| Use | Don't use |
|---|---|
| clone | bot, agent, AI |
| query / ask | message, prompt, chat with |
| knowledge | content, data |
| memory / memories | embeddings, vectors, chunks (in product UI) |
| confidence | accuracy, certainty |
| source | citation, reference |
| brain | knowledge base, index |
| handoff / handoff report | offboarding |
| deploy | publish, launch |

### Eyebrows / kickers
Every section starts with a uppercase, wide-tracked eyebrow at `var(--fs-caption)`:
*FOR INDIVIDUALS*, *FOR TEAMS*, *HOW IT WORKS*, *PRICING*, *MARKETPLACE*.
Eyebrows are colored `var(--fg-3)` — never the accent.

### Emoji
**Never in product UI.** Not in buttons, not in empty states, not in toasts,
not in tooltips. Use SVG icons (see Iconography). The legacy marketplace
category strip uses emoji; that is the *one* place to clean up. Treat it as
a known violation, not a precedent.

### Sample copy

```
Landing — hero:           What you know should outlast you.
Landing — subtext:        Doppel turns your expertise into a permanent,
                          queryable intelligence — for yourself, and for
                          the teams that depend on you.
Empty state:              No queries yet. Test your clone to see activity here.
Loading state:            Thinking…  /  Querying…  /  Synthesising…
Confirmation:             ✓ Review submitted   (the ✓ is an SVG, not unicode)
Source-cited answer:      "Made that call in April — here's her reasoning,
                          with sources."   92% confident · 3 sources
Pricing micro:            Free forever · No credit card
Status badge (positive):  knowledge preserved
Status badge (negative):  Gone on their last day
```

---

## Visual foundations

### The two surfaces, in one paragraph
**Dark** is the working surface — `#080808` base, glass panels at 4 / 7 / 11%
white overlay, text at 85 / 60 / 40 / 25% opacity, never solid white. Depth
comes from `backdrop-filter: blur(20px)` plus a 6–12% white border. No
shadows. **Light** is the public surface — `#F8F9FA` base, solid `#FFFFFF`
cards, real soft shadows (`0 1px 4px rgba(0,0,0,0.06)`), text at solid hex
values, single `#1A73E8` accent.

### Colors
Single accent: **`#1A73E8`** (Doppel blue) — used flat, never gradient.
Status accents are reserved:
- `emerald-400` → positive status / knowledge preserved / approved
- `red-400` → destructive / lost / departed / rejected
- `violet-400` → **enterprise badges only**
- `amber-400` → warning / escalation / low confidence

Everything else is neutral. No hue gradients, anywhere. The only "gradient" in
the system is luminance-only — slightly lighter glass when hovered (4% → 7%).

### Type
**Plus Jakarta Sans**, weights `300 / 400 / 500 / 600`. **Never 700+.** Headlines
are `light (300)` or `regular (400)`; the visual weight comes from size, not
stroke. Eyebrows are `medium (500)` uppercase. Buttons and key labels are
`medium (500)`. Bold is forbidden — it breaks the quietness.

Numbers use `font-variant-numeric: tabular-nums` everywhere they appear in
telemetry (dashboard stats, credit counts, confidence percentages).

### Spacing
4-pt grid: `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64`. Cards have `24px`
internal padding (`p-6` in Tailwind). Page-level vertical rhythm is `96px`
(`py-24`). Sidebar nav items get `8px 12px`. Inputs get `10px 16px`.

Cards stack with **`16px`** gap. Sections separate with **`96px`** vertical
padding on marketing pages, **`32px`** on dashboard pages.

### Backgrounds
- **Dark surface**: flat `#080808` + an optional radial dot grid for hero
  sections only. The dot grid is `radial-gradient(rgba(255,255,255,0.065)
  1px, transparent 1px)` at `28px` spacing, masked to an ellipse so it fades
  to edge.
- **Light surface**: flat `#F8F9FA`. The marketplace hero is the *only* solid
  accent panel — a flat `#1A73E8` block, no gradient.
- **Never**: noise textures, hand-drawn illustrations, full-bleed photos,
  repeating patterns. Doppel is software, not a magazine.

### Borders
Borders are the primary depth signal on dark surface — `rgba(255,255,255,0.06)`
at rest, `rgba(255,255,255,0.12)` on hover. On light, `rgba(0,0,0,0.08)` at
rest, `rgba(0,0,0,0.14)` on hover. Border-radius is strict:
- `rounded-2xl` (**`16px`**) for cards, panels, surfaces
- `rounded-xl` (**`12px`**) for inputs, buttons, badges
- `rounded-full` for pills and avatars
- `rounded-3xl` (**`24px`**) for the rare hero / feature container
- Nothing else.

### Shadows
- **Dark surface: no shadows.** Depth = blur + border + overlay opacity.
- **Light surface**: three tiers
  - `sm` — `0 1px 3px rgba(0,0,0,0.06)` for resting cards
  - `md` — `0 4px 16px rgba(0,0,0,0.08)` for floating menus / sticky CTA
  - `lg` — `0 8px 32px rgba(0,0,0,0.10)` for modal overlays
- **Brand shadow** (light surface, primary CTA only) —
  `0 4px 14px rgba(26,115,232,0.25)`

### Animation
- **Easing**: `cubic-bezier(0.25, 0.46, 0.45, 0.94)` (`--ease-ios`). One curve
  for everything in product UI. Spring (`0.34, 1.56, 0.64, 1`) is reserved for
  the marketing landing page only.
- **Durations**: `180ms` (hover/state), `280ms` (panel transitions, sidebar
  active state), `420ms` (entry).
- **Entry**: fade + 8–12px upward translate. Stagger by `80–100ms` for grids.
- **Never**: rotation, scale-bounce, parallax, full-page slide-in. Doppel
  doesn't show off.

### Hover & press states
- **Dark surface**: surface lift only — `bg-white/[0.04]` → `bg-white/[0.07]`,
  text `/60` → `/80`. No scale. No translate.
- **Light surface**:
  - Cards lift `-4px` vertically with shadow upgrade (`sm` → `md`).
  - Buttons drop `opacity: 0.90` on hover (primary) or background tint to
    `--bg-light-muted` (secondary).
  - Press state: `opacity: 0.80` (no scale-down).

### Transparency & blur
Used **only** on dark surface, and only for two things:
1. Glass panels (`backdrop-filter: blur(20px) saturate(140%)`).
2. Sticky headers and modal scrims (`background: rgba(8,8,8,0.6)` + blur).

Light surface is opaque. Don't introduce blur there — it dirties the cards.

### Imagery
Doppel has **no** brand photography or illustration. Avatars are
**single-letter monograms** on a flat category color (initial in `font-weight:
600`, white at 30% opacity on the colored background). Logos for clones, when
they exist, are square SVGs over a flat colored square. Never gradient
backdrops, never circle crops.

### Fixed elements
- Sidebar: `210px` fixed-width on creator dashboard; sticky to viewport.
- Marketing nav: `56px` tall, sticky top, `backdrop-filter` blur when scrolled.
- Marketplace header: `56px` tall, sticky top, white `0.95` opacity + blur.
- Sidebar tour menu and clone-detail right-rail CTA are sticky.

### Layout rules
- Marketing pages: `max-width: 1152px` (6xl), `padding-x: 24px`.
- Marketplace: `max-width: 1280px` (7xl), grid `1 / 2 / 3 / 4` at `sm / md /
  lg / xl`.
- Dashboard pages: full width inside the `210px` sidebar, content padded
  `32px`.

---

## Iconography

Doppel uses **inline custom SVG icons**, hand-drawn at a `16×16` viewBox with a
`1.4` stroke width, `strokeLinecap="round"`, `strokeLinejoin="round"`. They are
not from a public icon set — they were authored in-repo to maintain a quiet,
geometric feel that matches Plus Jakarta Sans.

### Stroke spec
- ViewBox: **`16 16`** (sometimes `12 12` for inline mini icons, `18 18` for
  feature icons).
- Stroke width: **`1.4`** for line icons, **`1.6`** for emphasis.
- Stroke linecap & linejoin: **`round`** always.
- Fill: usually `none` (line icons). Filled variants are reserved for the brain
  / dot icons and avatars — they use the brand blue at full opacity for the
  primary node and `opacity: 0.4` for secondary nodes.
- Color: `currentColor`. Caller controls hue via text color.

### Iconography library
We've extracted the live SVGs into `assets/icons/` as standalone files so they
can be imported anywhere. Naming follows the sidebar group they appear in:
`overview.svg`, `train.svg`, `identity.svg`, `brain.svg`, `test.svg`,
`deploy.svg`, `browse.svg`, `listing.svg`, `earnings.svg`, `credits.svg`,
`synthesis.svg`, `bundles.svg`, `email.svg`, `billing.svg`, `developer.svg`,
`settings.svg`, plus chrome icons: `arrow-right.svg`, `arrow-up-right.svg`,
`check.svg`, `chevron-right.svg`, `close.svg`, `search.svg`, `send.svg`,
`signout.svg`, `back.svg`.

### Lucide as fallback
For one-off icons that don't appear in the repo (e.g. `MoveRight`, `Check`,
`ArrowUpRight` used on the landing page), the repo imports from
**`lucide-react`**. If you need an icon that isn't in `assets/icons/`, use
Lucide's matching name at the same stroke width (`1.4`) — Lucide is the
intended fallback set. **Do not mix Heroicons, Phosphor, or Feather** — their
stroke geometry differs.

CDN for Lucide in standalone HTML:
```html
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
```

### Emoji
**Never in product UI.** The legacy marketplace category strip is a documented
exception that should be replaced. Use SVG glyphs at `12×12` for category chips
instead.

### Unicode glyphs
The middle dot `·` is the only unicode "icon" the system uses, as a metadata
separator. Em dash `—` is for copy, not iconography. No arrows, no checkmarks,
no stars in unicode — always SVG.

### Logo / brand mark
- **Wordmark**: lowercase **`doppel`** in Plus Jakarta Sans `semibold (600)`,
  letter-spacing `-0.02em`. Brand blue `#1A73E8` on the leading `d` only, rest
  in the surface's primary text color. Stored in `assets/wordmark.svg`.
- **Mark**: two overlapping circles — `5r` primary at full opacity, `2.2r`
  secondary at `0.55` opacity, offset by `(4.5, 3.5)` from primary. On dark
  surface the mark is white; on light surface, brand blue. Stored as
  `assets/mark-dark.svg` and `assets/mark-light.svg`.
- **Logo lockup**: `28×28` mark + `8px` gap + wordmark. Used in nav and
  sidebar. `assets/logo-lockup-light.svg` and `assets/logo-lockup-dark.svg`.

---

## Component patterns

The full inventory is in `ui_kits/{marketplace,dashboard}/`. Quick reference:

| Pattern | Dark variant | Light variant |
|---|---|---|
| Card | `.glass` (4% white + border) | `.card-light` (white + shadow-sm) |
| Primary button | `.glass-hi` (11% white + brighter border) | flat `#1A73E8` bg + `box-shadow: var(--shadow-blue)` |
| Secondary button | `.glass-md` | `--bg-light-muted` bg, `--fg-light-2` text |
| Input | transparent inside `.glass-md` panel | `--bg-light-muted` until focused → white + blue border |
| Badge (positive) | emerald text on emerald `/10` bg | emerald text on emerald `/10` bg |
| Badge (enterprise) | violet text on violet `/10` bg | violet text on violet `/10` bg |
| Avatar | monogram, white-30% on flat category color | monogram, white-30% on flat category color |
| Eyebrow | uppercase, `tracking-widest`, `--fg-3` | uppercase, `tracking-widest`, `--fg-light-2` |

---

## Known gaps & substitutions

- **Font files**: Plus Jakarta Sans is loaded via Google Fonts CDN. No local
  `.woff2` files are bundled. If you need offline use, grab the four weights
  (300, 400, 500, 600) from
  https://fonts.google.com/specimen/Plus+Jakarta+Sans and drop them in
  `fonts/`.
- **Marketplace emoji**: the current marketplace uses emoji in category chips.
  The system's stance is **no emoji**; treat the existing emoji as legacy and
  use the SVG category glyphs in `assets/icons/categories/` for new work.
- **No brand photography**: Doppel has no photographic brand assets. Any time
  you need imagery, default to a monogram avatar over a flat category color.
- **Marketing-only spring easing**: the spring curve (`--ease-spring`) is for
  the marketing landing's headline rotator and one-time entry pops. Don't use
  it in dashboard or marketplace.

---

## Iterating

This system describes the **intended** Doppel — the repo is in flight (e.g.
the dashboard is currently remapped to light tones in `globals.css`; this
system documents the canonical dark dashboard). Use this README as the
source of truth when designing new surfaces, and reconcile back to code as the
codebase catches up.
