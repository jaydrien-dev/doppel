# Marketplace UI kit (consumer · light)

Visual recreations of every consumer-facing surface of Doppel. Light theme,
`#F8F9FA` base, white cards, `#1A73E8` accent, no gradients.

## Screens

| Screen | URL pattern | Component |
|---|---|---|
| Browse | `/marketplace` | `BrowseScreen.jsx` |
| Clone detail | `/marketplace/[handle]` | `DetailScreen.jsx` |
| Synthesis | `/synthesis` | `SynthesisScreen.jsx` |
| Bundle | `/marketplace/bundles/[id]` | `BundleScreen.jsx` |
| Public chat | `/c/[handle]` | `ChatScreen.jsx` *(switches to dark surface)* |

The chat surface is intentionally **dark**, even though it's entered from the
light marketplace flow. The product treats chatting with a clone as a focused
work surface like the dashboard — it's a hand-off, not just a marketplace
sub-page.

## Files

- `index.html` — runs all five screens with hash-routed nav at the bottom.
- `marketplace.css` — light-surface tokens (extends `colors_and_type.css`).
- `primitives.jsx` — `Header`, `Avatar`, `Button`, `Stars`, `Icon` lookup,
  category color/glyph config (`CATS`).
- `BrowseScreen.jsx` — full marketplace landing, search, category strip,
  sort, grid of `CloneCard`s, CTA strip.
- `DetailScreen.jsx` — clone detail (hero, memory breakdown, sample
  questions, reviews, right-rail buy/review panel).
- `SynthesisScreen.jsx` — mode toggle (Query / Deliberate), clone picker,
  textarea, results view with tabs.
- `BundleScreen.jsx` — bundle detail (mixed-dark hero, clone list, buy
  card with plan radios).
- `ChatScreen.jsx` — dark chat thread with confidence + sources.

## How fixtures connect

`BrowseScreen.jsx` exports a `CLONES` array — eight sample clones with
realistic metadata. `DetailScreen`, `BundleScreen`, and `SynthesisScreen`
read from that same array so navigating between screens preserves the clone
identity (color, name, monogram).

## Components worth lifting

If you're building a new marketplace page, the most reusable bits:
- `Header({ search, onSearch, breadcrumb })` — sticky header with brand,
  search OR crumbs, two action buttons.
- `Button({ variant, size, icon, iconAfter })` — `primary | secondary |
  ghost | outline`.
- `Avatar({ name, color, size, radius })` — monogram, white-30% letter on
  flat category color.
- `Stars({ rating, count })` — Google-style stars + count.
- `CloneCard({ clone, onOpen })` — full Fiverr-style card with banner pill,
  price tag, level badge, footer stats.
- `CATS` — single config map for marketplace categories (color, label,
  glyph).
