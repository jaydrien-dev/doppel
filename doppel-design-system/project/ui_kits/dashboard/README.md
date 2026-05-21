# Creator dashboard UI kit (dark)

Visual recreations of the Doppel creator-side surfaces. Dark theme, `#080808`
base, glass panels (`backdrop-filter: blur(20px)`), text at 85 / 60 / 40 / 25%
opacity, never solid white.

## Screens

| Screen | URL pattern | Component | Status |
|---|---|---|---|
| Overview | `/dashboard` | `OverviewScreen.jsx` | Full |
| Train | `/dashboard/train` | `TrainScreen.jsx` | Full |
| Brain | `/dashboard/brain` | `BrainScreen.jsx` | Full |
| Test | `/dashboard/test` | `TestScreen.jsx` | Full (with owner-mode controls) |
| Listing | `/dashboard/listing` | `ListingScreen.jsx` | Full (with live preview) |
| 11 more | `/dashboard/{identity,deploy,earnings,credits,…}` | — | Placeholder shells |

The 11 placeholder pages use the same `PageHead` + glass-card primitives;
they exist to demonstrate that the dashboard layout/nav scales to the full
product surface area.

## Files

- `index.html` — runs the dashboard inside a sidebar shell. The sidebar
  replicates `ui/components/layout/Sidebar.tsx` exactly (4 colored groups,
  active-state group color fill, sticky to viewport).
- `dashboard.css` — dark-surface tokens (extends `colors_and_type.css`),
  with `.glass / .glass-md / .glass-hi`, `.btn / .card`, `.stat-tile`,
  `.act-row` (recent-query row), `.src-row` (data-source row), `.badge`.
- `primitives.jsx` — `Sidebar` (full nav with 4 groups), `PageHead`,
  `StatTile`, `Icon` lookup.
- `OverviewScreen.jsx` — stats strip, recent queries, data sources panel,
  style fingerprint.
- `TrainScreen.jsx` — training progress bar, connector tiles (Gmail, Slack,
  GitHub, Notion, Meetings, file upload, manual Q&A).
- `BrainScreen.jsx` — topic coverage with gap/strong tagging, recent
  memories cards (episodic / semantic / procedural).
- `TestScreen.jsx` — owner-mode chat with approve/edit/reject controls per
  response; toggle to "public preview" mode.
- `ListingScreen.jsx` — basics + pricing slider + sample questions, with a
  live miniaturised marketplace-card preview on the right.

## Components worth lifting

- `Sidebar({ active, onNav })` — drop-in 230px sidebar with 4 colored groups.
- `PageHead({ eyebrow, title, subtitle, actions })` — every dashboard page
  uses this; pass JSX into `title` for the `<em>` muted-secondary pattern.
- `StatTile({ value, label, sub })` — light-300 number, tabular-nums, two
  lines of muted metadata.
- `.glass / .glass-md / .glass-hi` — three elevation tiers for dark glass.
- `.act-row` — single-line activity row with dot, text ellipsis, and meta
  cluster (confidence + tag + relative time).
