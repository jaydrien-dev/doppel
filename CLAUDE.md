
## Design System

### Brand
- **Product name:** Doppel (always lowercase in UI: `doppel`)
- **Legal entity:** Doppel AI, Inc.
- **Tagline:** Knowledge shouldn't have a lifespan.
- **Voice:** Direct, precise, no fluff. Short sentences. Never cheerful or salesy. Treat the user as an intelligent adult.

### Color & Theme
- **Background:** `#080808` — near-black, never pure black
- **Color palette:** Monochrome only. No color accents anywhere in the product UI.
  - Exception: `emerald-400` for positive/connected status indicators only (kept at low opacity, e.g. `/60`)
  - Exception: `red-400` for destructive actions / warnings only (kept at low opacity)
  - Exception: `violet-400` for enterprise badges only
- **Light/dark:** Dark only — no light mode, no system preference detection

### Typography
- **Font:** Plus Jakarta Sans — loaded as `var(--font-sans)`, applied globally via root layout
- **Max weight:** 600 — never use 700, 800, or 900
- **Heading style:** `font-light` (300) for large headings, `font-medium` (500) for labels, `font-normal` (400) for body
- **Text opacity scale:** `/85` (primary), `/60` (secondary), `/40` (tertiary), `/25` (placeholder/hint)
- **No uppercase except:** `text-[11px] uppercase tracking-widest text-white/25` — used only for section labels / eyebrows

### Glass System
Three glass elevation levels, defined as CSS utilities in `globals.css`:
```
.glass     → --surface  (rgba 255/255/255 / 0.04)  + border 0.08
.glass-md  → --surface-md (0.07)  + border 0.08
.glass-hi  → --surface-hi (0.11)  + border-hi 0.14
```
- All glass uses `backdrop-filter: blur(20px)`
- **Rounding:** `rounded-2xl` (16px) for cards/panels, `rounded-xl` (12px) for inputs/buttons, `rounded-full` for pills/toggles
- **Never use solid backgrounds** for UI panels — always a glass variant
- **Layering:** base bg → `.glass` cards → `.glass-md` interactive elements → `.glass-hi` primary CTAs

### Backgrounds & Texture
- **Dotted grid:** Use on hero sections and problem/feature sections where visual rhythm is needed
  ```css
  backgroundImage: "radial-gradient(rgba(255,255,255,0.065) 1px, transparent 1px)"
  backgroundSize: "28px 28px"
  ```
  Always mask with a radial gradient so dots fade at edges — never a hard edge
- **Ambient glow:** `rounded-full bg-white/[0.02] blur-[120px]` positioned absolutely — one per section max
- **No decorative images, illustrations, or gradients with hue**

### Spacing & Layout
- **Max page width:** `max-w-6xl` (72rem) for most sections, `max-w-5xl` for content-heavy sections
- **Section padding:** `py-24 px-6`
- **Card padding:** `p-5` (compact), `p-6` (standard), `p-8`–`p-10` (feature cards)
- **Gap between cards:** `gap-3` (tight grid), `gap-4` (standard grid)

### Motion
- Use `framer-motion` for all entrance animations — never CSS `@keyframes` for page-level motion
- Standard entrance: `initial={{ opacity: 0, y: 12 }}` → `animate={{ opacity: 1, y: 0 }}`, `duration: 0.5`
- Stagger children with `delay: 0.1 * i`
- `useInView({ once: true, margin: "-80px" })` for scroll-triggered sections
- Spring configs: `{ type: "spring", stiffness: 220, damping: 38 }` for layout shifts

### Component Patterns
- **Section eyebrow:** `<p className="text-[11px] uppercase tracking-widest text-white/25 mb-3">Label</p>`
- **Section heading:** `text-4xl font-light text-white/85`
- **Section subtext:** `text-base text-white/35 leading-relaxed`
- **Primary CTA:** `.glass-hi hover:bg-white/[0.14]` + `text-white/85`
- **Secondary CTA:** `.glass hover:glass-md` + `text-white/55`
- **Input fields:** `bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white/70 outline-none focus:border-white/20`
- **Status badge (connected):** `text-emerald-400/70 bg-emerald-400/10 border border-emerald-400/20 rounded-full`
- **Destructive:** `text-red-400/70 border-red-400/15 hover:border-red-400/30`
- **Enterprise badge:** `text-violet-400/60 bg-violet-400/[0.07] border border-violet-400/12 rounded-full`

### Don'ts
- No colored backgrounds, gradients with hue, or drop shadows with color
- No font weight above 600
- No `text-white` at full opacity except on the most critical single element per screen
- No emoji in product UI (landing page or dashboard)
- No border-radius below `rounded-lg` (8px) in any component

## Workflow Orchestration
### 1. Plan Mode Default
-Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
-If something goes sideways, STOP and re-plan immediately
-Use plan mode for verification steps, not just building
-Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
-Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
-For complex problems, throw more compute at it via subagents -One task per subagent for focused execution

### 3. Self-Improvement Loop
-After ANY correction from the user: update tasks/lessons.md with the pattern Write rules for yourself that prevent the same mistake
-Ruthlessly iterate on these lessons until mistake rate drops -Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
-Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
-Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
-If a fix feels hacky: "Knowing everything I know now, implement the elegant solution" -Skip this for simple, obvious fixes -- don't over-engineer
-Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
-When given a bug report: just fix it. Don't ask for hand-holding
-Point at logs, errors, failing tests -- then resolve them
-Zero context switching required from the user
-Go fix failing Cl tests without being told how

## Task Management
1. Plan First: Write plan to tasks/todo.md with checkable items
2. Verify Plan: Check in before starting implementation
3. Track Progress: Mark items complete as you go
4. Explain Changes: High-level summary at each step
5. Document Results: Add review section to tasks/todo.md 6. Capture Lessons: Update tasks/lessons.md after corrections

## Core Principles
-Simplicity First: Make every change as simple as possible. Impact minimal code. No Laziness: Find root causes. No temporary fixes. Senior developer standards. -Minimal Impact: Only touch what's necessary. No side effects with new bugs.
