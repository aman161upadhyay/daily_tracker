# Reference: the original Cadence spec

These four files are the documentation of **Cadence**, a native Kotlin/Jetpack Compose Android tracker
(habits, water, workouts, fasting, menstrual cycle) built earlier for another user. They were supplied by
Aman as the starting spec for Daily Tracker. Only the docs are available, not the source code.

What we take from them: product decisions that were validated on device (pace-aware water reminders,
sticky-notification behaviour, forgiving streak freezes, the 3 am tracking day, "manual beats automatic",
versioned habit rules, non-destructive migrations, backup/restore design, cycle prediction rules, the
on-device acceptance checklist). Daily Tracker ports the algorithms to TypeScript; see
`docs/IMPLEMENTATION_PLAN.md`. Where these files and the plan disagree, the plan wins.

Files: `CLAUDE.md` (agent rules), `HANDOFF.md` (full architecture and checklist), `PLAN.md` (original plan), `README.md`.
