# Handoff: Marketplace polish

## What this is

I polished three customer-facing surfaces of Doppel into a shippable prototype. This package tells your engineer (or Claude Code) **exactly which existing Next.js files to update** and **what specific changes to apply** to bring the polish into the codebase.

This is **not** a "ship the HTML" handoff — the HTML files in `prototypes/` are visual references. The work is recreating their look-and-feel inside `ui/app/...` using Next.js / Tailwind / Clerk that already exist there.

## Fidelity

**High-fidelity.** Pixel-precise colors, typography, motion curves, and timings. Match exactly.

## Surfaces in scope

| Prototype | Maps to (in `ui/`) |
|---|---|
| `prototypes/BrowseScreen.jsx` | `app/marketplace/page.tsx` |
| `prototypes/DetailScreen.jsx` | `app/marketplace/[handle]/page.tsx` |
| `prototypes/ChatScreen.jsx`   | `app/c/[handle]/PublicChatClient.tsx` + `components/chat/ChatInterface.tsx`, `MessageBubble.tsx`, `TypingIndicator.tsx` |

## Required global changes (do these first)

These touch all three surfaces and should land before the per-page work.

### 1. Add motion tokens to `app/globals.css`

Drop the contents of `snippets/motion-tokens.css` into `app/globals.css` under the existing `:root` block. You will get:

- `--ease-ios`: `cubic-bezier(0.25, 0.46, 0.45, 0.94)` — **the only easing curve for product UI**
- `--dur-fast` (180ms) / `--dur-base` (280ms) / `--dur-slow` (420ms)
- Keyframes: `fade-up`, `fade-in`, `scale-in`, `shimmer`, `pulse-soft`, `pop`, `dot-bounce`
- Utility classes: `.anim-fade-up`, `.anim-fade-in`, `.anim-scale-in`, `.stagger > *:nth-child(n)` (staggers grid children by 40ms)

### 2. Fix the design-system violations baked into the current code

These appear repeatedly across every page:

| Replace | With | Why |
|---|---|---|
| `font-black` (900) | `font-medium` (500) or `font-semibold` (600) | Doppel hard-caps weight at 600. "Bold is forbidden." |
| `font-bold` (700) | `font-semibold` (600) | Same |
| Emoji in category chips (`💼`, `⚙️`, etc.) | SVG glyphs from `snippets/category-glyphs.tsx` | Documented violation per the system; `assets/icons/*` is the source of truth |
| `"Best Rated"` / `"Most Popular"` / etc. (Title Case in buttons & options) | `"Best rated"` / `"Most popular"` | Sentence case for everything except eyebrows |
| `text-xl font-black` headings | `text-2xl font-medium tracking-tight` | Visual weight from size, not stroke |
| Heavy flat blue hero | Deep navy (`#0F1B3D`) + dot pattern + accent gradient on key word | See `prototypes/browse.css` `.hero` |

### 3. Iconography

The current code reaches for emoji and ad-hoc SVG. Lock to one source:

- Pull from `ui/components/icons/` (if it exists) or create it
- All icons: 16×16 viewBox, `1.4` stroke, `strokeLinecap="round"`, `currentColor` fill or stroke
- Library is in `prototypes/primitives.jsx` exported as the `I` object — port that into a TS module (`components/icons/index.tsx`) and import everywhere

---

## Per-page work

### A. Marketplace browse (`app/marketplace/page.tsx`)

| Change | Reference |
|---|---|
| Replace the heavy flat blue hero with the editorial dark hero (deep navy + dot grid + animated live indicator + floating mock chat card on the right) | `prototypes/BrowseScreen.jsx` → `<BrowseHero>`, `prototypes/browse.css` → `.hero*` |
| Rebuild `CategoryStrip` to use SVG glyphs + count chips, with active state slide-in (no emoji) | `prototypes/BrowseScreen.jsx` → `<CatStrip>`, `prototypes/browse.css` → `.cats`, `.cat` |
| Add grid/list view toggle in the sort row | `prototypes/BrowseScreen.jsx` → `<SortRow>` |
| Skeleton cards while loading must use the **shimmer** keyframe (`background-position` animation), not Tailwind `animate-pulse` | `prototypes/cards.css` → `.shimmer`, `prototypes/BrowseScreen.jsx` → `<SkeletonCard>` |
| Card on hover lifts `-3px` with `box-shadow: var(--shadow-md)` over `var(--dur-base) var(--ease-ios)` — **not** a `transition-all` blanket | `prototypes/cards.css` → `.gig:hover` |
| Add save-heart on each card with `pop` animation on click; opacity-fades-in on card hover; filled red when saved | `prototypes/BrowseScreen.jsx` → `<CloneCard>`, `prototypes/cards.css` → `.gig__heart` |
| Card grid uses the `.stagger` utility — children fade-up sequentially when filters change; reset by remounting the grid with `key={filterCount}` | `prototypes/BrowseScreen.jsx` — see the `filterKey` pattern |
| Remove the "🔍" emoji + bold "No clones found" empty state; replace with quiet empty state per `<Empty>` in the prototype | `prototypes/BrowseScreen.jsx` empty branch |
| Bottom CTA strip: deep navy + dot pattern, sentence-cased copy, single ghost CTA | `prototypes/cards.css` → `.cta-strip` |

### B. Clone detail (`app/marketplace/[handle]/page.tsx`)

| Change | Reference |
|---|---|
| Hero gets a category glyph chip (no emoji), a "Responds in ~Xs" stat, and a live "N asking now" indicator | `prototypes/DetailScreen.jsx` → `<DetailHero>` |
| Knowledge breakdown tiles must **count up** from 0 with `easeOutQuint` over 700ms when they mount | `prototypes/DetailScreen.jsx` → `useCountUp` hook |
| Memory bars fill on mount over `var(--dur-slow)` | `prototypes/detail.css` → `.mem-tile__bar > span` transition |
| Replace single-button "Ask Sarah" panel with **three-plan tab control**: Single / Pack 25 / Day pass. Tabs animate a sliding pill behind the active label | `prototypes/DetailScreen.jsx` → `<PriceCard>`, `prototypes/detail.css` → `.price-card__plans` |
| Reviews panel: add the **rating distribution** (5-star bars filling on mount), the 44px display rating, and creator replies inline | `prototypes/DetailScreen.jsx` → `<ReviewsPanel>`, `prototypes/detail.css` → `.rev-bars` |
| Add `<SourcesPanel>` — connected source breakdown with kind + count + label | `prototypes/DetailScreen.jsx` → `<SourcesPanel>` |
| Add `<SellerCard>` (the human behind the clone) and `<TrustGrid>` (quiet refund, sources, confidence scoring) below the price card | `prototypes/DetailScreen.jsx` → `<SellerCard>`, `<TrustGrid>` |
| Add `<QuoteCard>` showing a signature line — small gradient bg tinted by category color | `prototypes/DetailScreen.jsx` → `<QuoteCard>` |
| Sample question rows: arrow icon **slides in** on hover, row shifts `2px` right, icon background fills with category color | `prototypes/detail.css` → `.q-row`, `.q-row__arrow` |

### C. Public chat (`app/c/[handle]/PublicChatClient.tsx` + chat components)

**This surface stays DARK** per the design system (`#080808` base, glass panels). The current code currently uses the light-remapped `globals.css` — wrap the chat route in a `<div class="doppel-dark">` (you'll need to add this scope; mirrors the `.doppel-light` pattern).

| Change | Reference |
|---|---|
| Chat header: glass blur background, back button, avatar with name + live status + queries/rating row, share/more actions | `prototypes/ChatScreen.jsx` → `<ChatHeader>`, `prototypes/chat.css` → `.chat-hdr*` |
| Returning-user banner becomes a centered pill with sparkle glyph; no full-width strip | `prototypes/ChatScreen.jsx` → `.chat-banner__pill` |
| **Typing indicator** uses three dots with `dot-bounce` keyframe at 150ms staggered delays. Replace `TypingIndicator.tsx` body entirely | `prototypes/ChatScreen.jsx` → `<TypingIndicator>`, `prototypes/chat.css` → `.typing`, `@keyframes dot-bounce` |
| AI message bubbles: tail on bottom-left (`border-radius: 14px 14px 14px 4px`); user bubbles: tail on bottom-right | `prototypes/chat.css` → `.msg__bubble` rules |
| **Sources** render as pill row below the bubble (kind icon + kind name + title), hoverable | `prototypes/ChatScreen.jsx` → `<CitePill>`, `prototypes/chat.css` → `.msg__cite*` |
| **Confidence bar** below sources: animates fill from 0→N% over `var(--dur-slow)` | `prototypes/ChatScreen.jsx` → `<ConfidenceBar>` |
| Hover-only message actions: copy / regen / thumbs-up / thumbs-down (opacity 0 → 1 on `.msg:hover`) | `prototypes/chat.css` → `.msg__actions` |
| Suggestion chips fade-up after the first AI message; clicking sends | `prototypes/ChatScreen.jsx` → suggestions block |
| Composer: glass background, auto-grow textarea (`height: auto` + `scrollHeight`, max 200px), focus ring on focus-within, Enter-to-send + Shift+Enter for newline, send button scales `0.92` on press | `prototypes/ChatScreen.jsx` → `<Composer>`, `prototypes/chat.css` → `.composer*` |
| Composer meta strip below: credit cost + keyboard hint | `prototypes/ChatScreen.jsx` → `.composer-meta` |
| Smooth-scroll to bottom on new message (`scrollTo({ top: scrollHeight, behavior: "smooth" })`) | `prototypes/ChatScreen.jsx` → scroll effect |

---

## Design tokens (drop into globals.css)

These already exist in your `globals.css` under different names. Reconcile to these canonical names per the Doppel design system:

```css
/* Brand */
--doppel-blue:        #1A73E8;
--doppel-blue-hover:  #1765C9;
--doppel-blue-soft:   rgba(26, 115, 232, 0.08);
--doppel-blue-ring:   rgba(26, 115, 232, 0.30);

/* Status — semantic only, no decorative use */
--emerald-400:  #34D399;  /* preserved / positive / approved */
--red-400:      #F87171;  /* lost / destructive */
--violet-400:   #A78BFA;  /* enterprise badges ONLY */
--amber-400:    #FBBF24;  /* warning / low confidence */

/* Light surface (consumer) */
--bg-light:         #F8F9FA;
--bg-light-card:    #FFFFFF;
--bg-light-muted:   #F1F3F4;
--fg-light-1:       #1D1D1F;
--fg-light-2:       #5F6368;
--fg-light-3:       #9CA3AF;
--border-light:     rgba(0, 0, 0, 0.08);

/* Dark surface (chat / dashboard) */
--bg-dark:          #080808;
--bg-dark-elev-1:   rgba(255, 255, 255, 0.04);
--bg-dark-elev-2:   rgba(255, 255, 255, 0.07);
--bg-dark-elev-3:   rgba(255, 255, 255, 0.11);
--border-dark:      rgba(255, 255, 255, 0.06);
--fg-dark-1:        rgba(255, 255, 255, 0.85);
--fg-dark-2:        rgba(255, 255, 255, 0.60);
--fg-dark-3:        rgba(255, 255, 255, 0.40);

/* Motion */
--ease-ios:    cubic-bezier(0.25, 0.46, 0.45, 0.94);
--dur-fast:    180ms;
--dur-base:    280ms;
--dur-slow:    420ms;

/* Radii (strict — no other values) */
--radius-md:   8px;    /* badges, small chips */
--radius-lg:   12px;   /* inputs, buttons */
--radius-xl:   16px;   /* cards, panels */

/* Shadows — light surface only */
--shadow-sm:  0 1px 3px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.04);
--shadow-md:  0 4px 16px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.05);
--shadow-lg:  0 8px 32px rgba(0, 0, 0, 0.10);
--shadow-blue:0 4px 14px rgba(26, 115, 232, 0.25);
```

## Implementation order (recommended)

1. **Land global changes** (motion tokens, icon module, type/casing sweep)
2. **Marketplace browse** — most users see this first; ship + measure
3. **Clone detail** — second click, highest conversion impact
4. **Public chat** — most complex; lands last because dark-surface scoping touches `globals.css`

## How to verify

After each page, the visual diff against the matching prototype HTML should be near-pixel-perfect. The motion check:

- Hover any card → lift `-3px` with shadow upgrade, ~280ms, no scale
- Switch category → grid children fade-up sequentially, ~40ms apart
- Open detail → memory tiles count up 0→N, bars fill simultaneously
- Send a chat message → typing dots bounce, then bubble fades-up

## Files in this package

```
design_handoff_marketplace_polish/
├── README.md                  ← you are here
├── DESIGN_SYSTEM_RULES.md     ← the violations to fix, in detail
├── prototypes/                ← run index.html to see the target
│   ├── index.html
│   ├── styles.css browse.css cards.css detail.css chat.css
│   ├── primitives.jsx data.jsx chrome.jsx
│   ├── BrowseScreen.jsx DetailScreen.jsx ChatScreen.jsx
│   └── colors_and_type.css    ← the canonical token file
└── snippets/
    ├── motion-tokens.css      ← paste into globals.css
    └── category-glyphs.tsx    ← TS-ready SVG glyphs to replace emoji
```

Open `prototypes/index.html` in a browser. Use the top tab strip to switch between the three surfaces and walk the flow (Browse → click card → Ask Sarah).
