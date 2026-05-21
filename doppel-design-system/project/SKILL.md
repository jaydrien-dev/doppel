---
name: doppel-design
description: Use this skill to generate well-branded interfaces and assets for Doppel, either for production or throwaway prototypes/mocks. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping the two-surface Doppel system (light consumer marketplace + dark creator dashboard).
user-invocable: true
---

Read the `README.md` file within this skill, and explore the other available
files. The README is the source of truth for visual foundations, content
fundamentals, and iconography.

**Critical rules to internalize before building anything:**

- **Two surfaces, one system.** Light (`#F8F9FA` base, white cards, real
  shadows) is for marketplace / synthesis / bundles — public, transactional.
  Dark (`#080808` base, glass panels, no shadows) is for the creator
  dashboard / chat — private, focused.
- **Plus Jakarta Sans, weights 300–600 only.** Never bold (700+).
- **One accent: `#1A73E8` (Doppel blue), used flat.** No gradients with hue,
  anywhere.
- **Status colors are reserved** — emerald = positive, red = destructive,
  violet = enterprise badge, amber = warning. Nothing else gets color.
- **No emoji in product UI.** Use SVGs from `assets/icons/`.
- **Cards are `rounded-2xl` (16px), buttons/inputs are `rounded-xl` (12px).**
  Nothing else.
- **Dark text uses opacity scale 85 / 60 / 40 / 25**, never solid white.
- **Voice is direct, precise, no fluff.** Never cheerful, never salesy.
  Sentence case. Em dashes liberally. No exclamation points.

**Files in this skill:**

- `README.md` — context, content fundamentals, visual foundations,
  iconography.
- `colors_and_type.css` — CSS variables for both surfaces and semantic type.
  Load this first.
- `assets/` — wordmark, lockup, mark (light + dark), icon set.
- `assets/icons/` — 28 in-house 16×16 SVG icons (stroke 1.4, round caps).
- `preview/` — small cards demonstrating each token / component.
- `ui_kits/marketplace/` — light-surface UI kit (5 screens, JSX components).
- `ui_kits/dashboard/` — dark-surface UI kit (5 screens + 11 placeholders).

**How to use:**

If creating visual artifacts (slides, mocks, throwaway prototypes), copy
assets out of `assets/` and load `colors_and_type.css` at the top of your
HTML. Reach into `ui_kits/{marketplace,dashboard}/` for ready-made
components (`Header`, `Sidebar`, `Avatar`, `Button`, `CloneCard`,
`StatTile`, etc).

If working on production code, the design system is canon; reconcile to
this when the live codebase drifts. The repo currently has
`ui/app/globals.css` remapping the dashboard to light tones — this is a
known in-flight state, and the system documents the intended dark
dashboard / light marketplace split.

If the user invokes this skill without any other guidance, ask them what
they want to build, which surface (light marketplace? dark dashboard?
chat?), and any specific page or component. Act as an expert designer who
outputs HTML artifacts or production code depending on need.

**Substitutions flagged:**

- Plus Jakarta Sans is loaded via Google Fonts CDN (no local .woff2).
  If offline use is required, grab weights 300/400/500/600 from
  https://fonts.google.com/specimen/Plus+Jakarta+Sans and drop in `fonts/`.
- The marketplace category strip in the live repo uses emoji; the system
  forbids emoji in product UI. Use `CATS[key].glyph` (inline SVG) from
  `ui_kits/marketplace/primitives.jsx` as the replacement.
