# Design system violations to fix

The current `ui/` codebase has several violations of the Doppel design system that I corrected in the polish. List them here so the engineer applying the changes doesn't accidentally regress them.

---

## 1. Font weight

**Rule:** Plus Jakarta Sans, weights `300 / 400 / 500 / 600` only. **Never 700, 800, or 900.** Visual weight comes from size, not stroke. "Bold is forbidden — it breaks the quietness."

**Current violations** (sample, from `ui/app/marketplace/page.tsx` and `ui/app/marketplace/[handle]/page.tsx`):

```tsx
// ❌ Wrong
<h1 className="text-4xl font-black">Knowledge for hire.</h1>
<p className="text-sm font-bold text-neutral-800">{clone.display_name}</p>
<span className="text-[10px] font-bold">Verified</span>

// ✅ Right
<h1 className="text-4xl font-light tracking-tight">Ask the people who built it.</h1>
<p className="text-sm font-medium text-neutral-800">{clone.display_name}</p>
<span className="text-[10px] font-medium">Verified</span>
```

**Action:** Find-and-replace `font-black` → `font-medium`, `font-bold` → `font-semibold`. Audit headings: `font-black text-4xl` should become `font-light text-4xl tracking-tight`.

---

## 2. Emoji in product UI

**Rule:** Never in product UI. Not in buttons, not in empty states, not in chips. Use SVG icons. The marketplace category strip's emoji are documented in the design system as the **one** known legacy violation.

**Current violations:**

```tsx
// ❌ ui/app/marketplace/page.tsx
const CATEGORIES = [
  { value: "business",    label: "Business",    emoji: "💼", ... },
  { value: "engineering", label: "Engineering", emoji: "⚙️", ... },
  // ...
];

<button>
  <span>{emoji}</span> {label}
</button>

// ❌ Empty state
<div className="text-6xl mb-4">🔍</div>

// ❌ Not-found
<div className="text-5xl mb-2">🔍</div>
```

**Action:** Replace with the SVG glyphs in `snippets/category-glyphs.tsx`. Each is a 12×12 SVG using `currentColor` and 1.2 stroke. The empty/not-found states should use a quiet 16×16 search-glass SVG inside a 56×56 rounded square (`prototypes/cards.css` → `.empty__icon`).

---

## 3. Casing

**Rule:** Sentence case for everything except eyebrows. Eyebrows are uppercase with `letter-spacing: 0.18em`.

**Current violations:**

```tsx
// ❌ Wrong (Title Case)
const SORT_OPTIONS = [
  { value: "best_rated",   label: "Best Rated" },
  { value: "most_queries", label: "Most Popular" },
  { value: "price_asc",    label: "Price: Low to High" },
];

<span>★ Top Rated</span>
<span>Level 2</span>      // OK — proper noun
<button>Start selling →</button>  // OK — sentence case

// ✅ Right
{ value: "best_rated", label: "Best rated" }
{ value: "most_queries", label: "Most popular" }
{ value: "price_asc", label: "Price: low to high" }
<span>Top rated</span>
```

**Action:** Sweep `SORT_OPTIONS`, all button labels, all menu items, all section titles. Headings stay sentence case.

---

## 4. Marketing-style shouty hero copy

**Rule:** Voice is "senior engineer writing release notes — confident, quiet, technically literate. It does not perform enthusiasm."

**Current violations:**

```tsx
// ❌ Cheerful marketing copy
<h1>Knowledge for hire.</h1>
<p>Query expert clones directly. Pay per question. No subscriptions, no gatekeepers.</p>

// Better — adopts the two-clause structure the brand uses
<h1>Ask the people who built it. <em>Pay only when you do.</em></h1>
<p>Doppel is a marketplace of AI clones trained on real expertise — engineers, operators, designers, clinicians. Query directly. Cite real sources. No subscriptions.</p>
```

**Action:** Pass copy through this filter: would a senior engineer write this in a release note? If it sounds like an ad, cut it.

---

## 5. Single accent color

**Rule:** One accent — `#1A73E8` (Doppel blue). Status colors (`emerald`, `red`, `violet`, `amber`) are reserved for their semantic meaning. **Violet is enterprise badges only.** No decorative use of status colors.

**Current violations:** The clone-card "Level 2" badge currently uses solid `#1A73E8` background + white text — looks like a primary button, competes with the price pill. The polished version uses a white-pill + colored-text + colored-dot pattern for all levels, keeping the visual hierarchy clean.

```tsx
// ❌ Loud — looks like a button
<span style={{ background: "#1A73E8", color: "#fff" }}>Level 2</span>

// ✅ Quieter — pill on photo
<span className="gig__pill gig__pill--lvl2">
  <span className="gig__pill__dot"></span>Level 2
</span>
```

---

## 6. Shadows on dark surface

**Rule:** Dark surface uses **no shadows**. Depth comes from `backdrop-filter: blur(20px)` + a 6–12% white border + glass overlay opacity. Shadows live on the light surface only.

**Current state:** The chat surface in your codebase is currently remapped to light via `globals.css` `.text-white → #1D1D1F`. The polish reverses this — chat goes back to dark per the design system. The dashboard is also intended to be dark; that's a separate cleanup.

---

## 7. No gradients on text or backgrounds

**Rule:** No hue gradients. The only "gradient" allowed is luminance-only (lighter glass on hover, 4% → 7%).

**Current violations:** The detail page hero uses a `from/to` gradient pair per category. The polish keeps it a single flat category color with subtle radial light/shadow overlays — no hue gradient.

**Exception:** The hero title in the polish uses an accent-only gradient on one emphasized word (`<em>Pay only when you do.</em>`). This is the editorial single-word treatment from the marketing landing page, used **only** on hero titles. Don't extend it elsewhere.

---

## 8. Animation curves

**Rule:** One easing curve in product UI: `cubic-bezier(0.25, 0.46, 0.45, 0.94)` (`--ease-ios`). Spring (`0.34, 1.56, 0.64, 1`) is reserved for the marketing landing only.

**Current state:** Most transitions in the codebase use Tailwind's default `transition-all` which uses `cubic-bezier(0.4, 0, 0.2, 1)` (Material-style). Audit transitions and lock to `--ease-ios`.

**Durations:** `180ms` for hover/state, `280ms` for panel transitions, `420ms` for entries. Don't invent intermediate values.

---

## 9. Border radius

**Rule:** Strict scale, no other values:
- `var(--radius-md)` = `8px` — small badges
- `var(--radius-lg)` = `12px` — inputs, buttons, small chips
- `var(--radius-xl)` = `16px` — cards, panels, surfaces
- `var(--radius-2xl)` = `24px` — rare hero / feature container
- `var(--radius-full)` = `9999px` — pills, avatars

**Current violations:** `rounded-2xl` (24px in Tailwind) is used for clone cards — should be `rounded-xl` per the system (Tailwind's `rounded-xl` is 12px; you want the **custom 16px**, which means using `var(--radius-xl)` or extending Tailwind's `borderRadius` in `tailwind.config.ts`).

---

## 10. Spacing

**Rule:** 4-pt grid: `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64`. Cards have `24px` internal padding (`p-6`). Sections separate with `32px` on dashboard, `96px` on marketing.

**Current state:** Mostly fine. Watch `p-4` (16px) on cards — should be `p-6`. Watch `gap-3` (12px) on grids — should be `gap-4` or `gap-5`.

---

## Quick verification checklist for the engineer

After applying the polish, scan the diffs for these tokens. If any appear, regression:

- [ ] No `font-black`, `font-bold`, or `font-extrabold` anywhere
- [ ] No emoji in JSX strings (`grep -rE "['\"][\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]" app/`)
- [ ] All sort option labels lowercase except first letter
- [ ] No `.text-white\\/[0-9]+` overrides on dark surfaces
- [ ] All `transition` declarations use `var(--ease-ios)` (or a Tailwind extension that maps to it)
- [ ] All hero titles `font-light` or `font-regular` — never `font-medium` and above
- [ ] No status color used decoratively (e.g., violet on a non-enterprise badge)
