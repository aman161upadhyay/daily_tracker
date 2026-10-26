# Daily Tracker — Design System

Direction in one line: **Apple Health's information design, dressed in Spotify green, with gold
framing and a violet "flow" state for habits that are going well.** Dark theme first (that is where
Spotify green and metallic gold read as luxurious); a light theme follows once the dark one is right.

This document is the single source of truth for tokens, type, layout, components and motion. The
project agent should turn it into `src/ui/theme/tokens.ts` in M0 and never hard-code colors in screens.

Design guidance applied: the `frontend-design` skill from github.com/anthropics/skills (deliberate
palette/typography choices, structure that encodes meaning, one orchestrated motion moment, no
generic SaaS-card chrome) — with this brief's explicit color direction taking precedence.

---

## 1. What we copy from Apple Health (and what we don't)

| Apple Health pattern | Daily Tracker equivalent |
|---|---|
| **Summary** tab: large bold title, date line, profile avatar top-right | **Today** tab: "Today", "Sunday, Oct 25", avatar → Settings |
| **Favorites**: metric cards — colored icon + name + chevron, big value + unit, timestamp, mini chart | **Pinned** cards: Water, Movement snacks, Meditation (always), Cycle (when tracked and "Show on Today" is on); a picker for Steps / Sleep and the order is backlog item B5 — `Settings.pinned` exists for it but is not read yet |
| **Activity rings** (Move / Exercise / Stand) | **Today rings**: Hydration / Movement / Mind — the hero card at the top of Today |
| **Highlights**: insight cards with comparison sparklines ("You walked more this week") | **Highlights**: generated from data (e.g. "You logged water 6 of 7 days", "Best streak: squats, 12 days") |
| **Browse** tab: search + category list with colored icons | **Habits** tab: your habits grouped by category + the **Library** of evidence-based presets |
| **Metric detail**: segmented D / W / M / 6M / Y, big chart, "About", "Options" | **Habit detail**: segmented range, chart, 26-week heatmap, streak + freezes, "Why this matters" (evidence), nudge settings |
| Grouped, generously rounded cards on a quiet background | Same geometry; dark surfaces instead of white, gold hairline frames on featured cards only |
| Per-category colors (red activity, cyan cycle, purple mindfulness…) | Per-category accents (below), all tuned to sit with Spotify green |

Not copied: Apple's Sharing tab, medical records, the light-only palette.

---

## 2. Color tokens

### 2.1 Base (dark theme, default)

| Token | Hex | Use |
|---|---|---|
| `bg` | `#0D120F` | Screen background (green-black, not pure black) |
| `surface` | `#151B17` | Cards |
| `surfaceRaised` | `#1C2420` | Sheets, pressed states, nested cards |
| `hairline` | `#2A3430` | Dividers, default card border |
| `text` | `#F3F6F2` | Primary text |
| `textSecondary` | `#AEB8B1` | Labels, units, timestamps |
| `textTertiary` | `#85918A` | Placeholders, disabled, captions (4.9:1 on `surfaceRaised`) |

### 2.2 Brand accents

| Token | Hex | Use |
|---|---|---|
| `green` | `#1DB954` | The hero color (Spotify green): primary buttons, "on track" state, Movement |
| `greenBright` | `#1ED760` | Pressed/hover of green, ring highlights |
| `greenDeep` | `#128A3E` | Green on light surfaces (AA on white), chart fills |
| `greenMist` | `#8BE3A2` | "Building" adherence stop, soft fills |
| `lime` | `#D7E58C` | "Warming" adherence stop (gold → green bridge) |
| `gold` | `#C9A84C` | Frames, edges, the streak flame, premium hairlines (metallic, never large fills) |
| `goldBright` | `#E6C76A` | Inner highlight of a frame, gold text on dark |
| `goldPale` | `#F2E3A9` | "Dormant" adherence stop (reads as pale yellow) |
| `violet` | `#8B5CF6` | "Flow" state, Mind category, celebratory gradient end |
| `violetSoft` | `#B8A1F5` | Tints, Mind icon, violet text on dark |
| `plum` | `#5E35B1` | Deep end of violet gradients |

### 2.3 Category accents (Apple-Health-style per-area colors)

| Category | Token | Hex |
|---|---|---|
| Hydration | `cat.hydration` | `#5CD3C0` (sea-glass green, distinct from the hero green) |
| Movement (snacks, workouts, steps) | `cat.movement` | `#1DB954` |
| Mind (meditation, breathing) | `cat.mind` | `#B8A1F5` |
| Cycle | `cat.cycle` | `#E59AB7` |
| Body (sleep, heart, weight from Health Connect) | `cat.body` | `#E6C76A` |
| Nutrition-adjacent ("Sugar Shield", post-meal walk) | `cat.fuel` | `#F0A35E` |
| Craft & learning (reading, writing, building with AI) | `cat.craft` | `#D7E58C` (chartreuse — warm, distinct from both greens) |

### 2.4 The adherence scale (the "row changes color" requirement)

Every habit row, ring segment and heatmap cell is colored by **adherence** `a ∈ [0, 1]`:
adherence = completion rate over the trailing 14 tracking days, with today's partial progress
counted proportionally (a habit at 3/5 today contributes 0.6 for today). New habits (< 3 days of
history) use today's progress only.

Stops (interpolate in OKLCH between them for a smooth, non-muddy ramp):

| a | Color | Name | Meaning |
|---|---|---|---|
| 0.00 | `#F2E3A9` goldPale | **Dormant** | Not being pursued yet — pale gold/yellow |
| 0.25 | `#D7E58C` lime | **Warming** | Starting to show up |
| 0.50 | `#8BE3A2` greenMist | **Building** | Light green |
| 0.75 | `#1DB954` green | **On track** | Spotify green |
| 0.90–1.00 | gradient `#1DB954 → #8B5CF6` + gold frame glow | **Flow** | Fully followed — green with a violet hue, framed in gold |

Rules:
- Color applies to **fills** (bars, rings, cells, the check circle) — never to body text (contrast).
- The transition animates (400 ms) when a tick changes the value; this is the app's main feedback moment.
- "Flow" additionally gets the `gold` 1 dp frame with a soft outer glow (`violet` at 25%, 12 dp blur).
- Heatmap cells use the same scale at 70% opacity; empty cells are `surfaceRaised`.

### 2.5 Light theme (shipped in M6, opt-in: Settings → Appearance; dark stays the default)

`bg #F5F7F6`, `surface #FFFFFF`, `surfaceRaised #EEF2EF`, `hairline #DCE3DF`, `text #0D120F`,
`textSecondary #4F5B55`, `textTertiary #5F6B63` (4.9:1 on `surfaceRaised`), `scrim` 40 % black. Gold frames become `#B8973F`
at 70 % (inner 15 %). The adherence scale is unchanged (fills only).

Because screens use one token for both an icon/text ink and (through `withAlpha`) its tinted fill,
the light palette remaps the brand tokens themselves to AA inks and lets the tints follow:
`green → #107A37` (so primary buttons are deep green with **white** `onGreen` text — 5.4:1; `#128A3E` was 4.4:1),
`greenBright → #16A34A`, `greenMist → #3B9D5D`, `lime → #7A8A1F`, `gold → #9A7A1F`,
`goldBright → #8A6D1C`, `goldPale → #B8973F`, `violet`/`violetSoft → #6D3FE0`, `danger → #C62828`;
categories `hydration #13897A`, `movement #107A37`, `mind #6D3FE0`, `cycle #C2487A`, `body #8A6D1C`,
`fuel #B5541A`, `craft #6F7F14`. Cards get the `0 1 2 rgba(0,0,0,.06)` shadow; the home-screen
widget stays dark in both themes.

### 2.6 Contrast rules (WCAG AA)
- `text` on `bg`/`surface`: ≥ 12:1. `textSecondary` on `surface`: ≥ 6:1.
- `goldBright` on `surface`: 9.7:1 → fine for labels. `goldPale` is **never** used for text on light surfaces.
- White text on `green` is only 2.9:1 → **dark-theme buttons use `#0D120F` text on green** (Spotify does this too);
  the light theme's deep green takes white text instead.
- Violet/soft violet text only on dark surfaces; the light theme substitutes `#6D3FE0` for both.

---

## 3. Typography

One family: **Manrope** (variable; Google Fonts, bundled with `expo-font`). Geometric but warm,
excellent tabular numerals for metrics, and it is not the default anyone reaches for.

| Role | Size / line (sp) | Weight | Notes |
|---|---|---|---|
| Display (ring totals, big metric values) | 40 / 44 | 800 | `tabular-nums`, letter-spacing −0.5 |
| Large title (tab titles) | 32 / 38 | 800 | Apple Health's 34 pt large title |
| Title 1 (section headers: "Pinned", "Highlights") | 22 / 28 | 700 | |
| Title 2 (card titles) | 17 / 22 | 700 | |
| Body | 16 / 22 | 500 | ≤ 70 characters per line |
| Callout (metric units, chips) | 15 / 20 | 600 | |
| Footnote (timestamps, "Updated 9:41 AM") | 13 / 18 | 500 | `textSecondary` |
| Caption (axis labels) | 12 / 16 | 600 | `textTertiary`, `tabular-nums` |

Numbers are the hero: value in Display weight 800, unit in Callout `textSecondary` on the baseline
("1,750" **ml**). Thousands separators always. No all-caps labels anywhere.

---

## 4. Layout, shape, depth

- Screen padding 20 dp; card gap 12 dp; card inner padding 16 dp.
- Card radius **20 dp**, nested elements 12 dp, pills fully round. One radius per hierarchy level, not one everywhere.
- Default card: `surface` + 1 dp `hairline`. **Featured** cards (the Today rings card, a habit in Flow, the current nudge) get the gold frame: 1 dp `gold` at 70% + inner 1 dp `goldBright` at 20%. Frames mean "this matters now"; they are not decoration.
- No drop shadows in dark; elevation is expressed by `surfaceRaised`. Light theme: `0 1 2 rgba(0,0,0,.06)`.
- Bottom tab bar: `surface` with hairline top, 4 tabs: **Today · Habits · Body · Cycle** (Cycle hides if cycle tracking is off → 3 tabs). Settings via the avatar on Today.
- Touch targets ≥ 48 dp; the habit check circle is 48 dp with a 28 dp visual.

---

## 5. Components (build in M0 with mock data, reuse everywhere)

| Component | Spec |
|---|---|
| `TodayRings` | Three concentric rings (Hydration outer, Movement middle, Mind inner), stroke 14 dp, round caps, track at 15% of the category color. Center: the most relevant number (water remaining until goal before noon, otherwise snacks done). Fills animate once on screen open. |
| `SummaryCard` | Apple-Health metric card: 20 dp icon tile in the category color + title + chevron; Display value + unit; footnote timestamp right-aligned; 56 dp mini chart (7 bars or sparkline) in the category color. |
| `HabitRow` | 56 dp row: icon tile, name, sub-line ("3 of 5 · every 60 min"), a 4 dp adherence bar under the name colored by the scale, right: check circle (yes/no) or `+` stepper (count/amount) or `▶` (timer). Streak chip appears at ≥ 3 days: gold flame + number. |
| `AdherenceBar` | Thin bar with the scale color; in Flow it becomes the green→violet gradient. |
| `NudgeCard` | "Next: 10 squats · in 24 min" with **Done now** / **Snooze** / policy gear. Gold frame while a nudge is live. |
| `SectionHeader` | Title 1 + optional "Show all" link, 8 dp above cards. |
| `Heatmap26w` | 26 columns × 7 rows, 10 dp cells, 3 dp gap, adherence scale. |
| `RangeSegment` | D / W / M / 6M / Y segmented control, `surfaceRaised` thumb. |
| `MetricChart` | Bars (daily totals) or line (trends), goal line dashed in `gold` at 60%, axis captions. |
| `BreathCircle` | Cyclic-sighing guide: circle scales with inhale/inhale/long exhale, `violet` → `green` glow. |
| `QuickActionSheet` | Bottom sheet for logging: water amounts (150 / 250 / 350 ml + custom), snack types with reps, meditation presets. |
| `Stepper`, `ChipChoice`, `TimeField`, `ConfirmDialog` | Standard form controls, 48 dp, accessible names. |

Icons: **Phosphor Icons** (`phosphor-react-native`), duotone weight for category tiles, regular
weight elsewhere. Lucide/Material defaults are avoided on purpose.

---

## 6. Motion and haptics

- **One orchestrated moment**: the Today rings fill (600 ms, ease-out-cubic) when Today appears after a cold start. Nothing else auto-animates on entry.
- **Response motion**: ticking a habit animates the check (scale 0.9 → 1, 180 ms) and the adherence color shift (400 ms); water tap pulses the ring segment; reaching a goal plays a 700 ms green→violet sweep on that card.
- Haptics (`expo-haptics`): light impact on tick/tap, success notification on goal reached, none on navigation.
- Respect the system "reduce motion" setting (fade instead of fill).

---

## 7. Widgets (home screen)

- **Water 2×2**: ring + "1,250 / 2,000 ml" + a large green **+250 ml** button + small Undo. Dark `surface` background, gold hairline frame, 20 dp radius.
- **Water 4×1**: compact bar version.
- **Move 2×1 "Sugar Shield"**: two buttons — **10 squats** and **2-min walk** — logging a snack directly. Tap the widget body to open the app.
- Widgets update within ~1 s of any tap in the app, the notification, or the widget itself.

---

## 8. Voice and copy

Calm, concrete, second person, US English. Never nag: "Behind on water — 500 ml would catch you up"
rather than "You failed to drink water!". Evidence notes are one sentence plus a source link.
Numbers over adjectives. No exclamation marks in notifications.

---

## 9. Reference shots (for the project agent, when checking the look)

- Apple Health Summary / Browse / metric detail screens (Apple's Human Interface Guidelines and the app itself).
- Dribbble: "Habit Tracker Mobile App Design" (dark theme, daily health goals cards) — https://dribbble.com/shots/25203304-Habit-Tracker-Mobile-App-Design
- Dribbble: "Habitify — GitHub-style heatmap" — https://dribbble.com/shots/27473545-Habitify-Habit-tracker-app-with-Github-style-heatmap
- Dribbble: "Fitness App UI — Step Tracker Dashboard, daily streak" — https://dribbble.com/shots/27340427-Fitness-App-UI-Step-Tracker-Dashboard-Daily-Streak-Activit
- Dribbble: "Habit Tracker App Design — motivational, consistency focused" — https://dribbble.com/shots/27111069-Habit-Tracker-App-Design-Motivational-and-Consistency-Focused
- 21st.dev: browse "progress ring", "bento grid", "stat card" components for interaction ideas (web components; we re-implement natively).

Take from these: heatmaps, streak chips, ring dashboards, dark cards. Do **not** take: neumorphism,
paywall screens, gradient washes on every card, AI-coach chat bubbles.
