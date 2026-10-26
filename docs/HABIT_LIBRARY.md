# Daily Tracker — Habit Library (evidence-based presets)

These are the one-tap presets shipped in the **Library** section of the Habits tab. Each has a
default rule, a default nudge policy, a one-sentence "why" shown in the app, and the evidence behind
it. Evidence grades: **Strong** (meta-analyses / large cohorts), **Moderate** (several RCTs or one
good crossover trial), **Emerging** (small or pilot trials), **Guidance** (expert consensus, weak
trial evidence — shown honestly as such in the app).

Nudge policies refer to the engine in `IMPLEMENTATION_PLAN.md` §5.4: `INTERVAL` (every N minutes
inside active hours), `FIXED` (clock times), `ROTATION` (one interval slot cycles through a set of
snacks), `EVENT` (user-triggered, e.g. "I'm about to eat something sweet"). Defaults are editable:
every habit's page has a Reminders card whose **Change** button opens the policy editor (Off / Set
times / Every so often, or the movement rotation; the daily limit; "only when behind"). The
policies below are the defaults a preset starts with.

---

## A. Hydration

| Preset | Default rule | Default nudge | Why (in-app copy) | Evidence |
|---|---|---|---|---|
| **Drink water** | 2,000 ml/day of fluids (adjustable 1,000–4,000; ml or oz) | `INTERVAL` 90 min, 9 am–9 pm, **only when behind pace**, stops at goal | Adequate intake for adults is about 2.7 L (women) to 3.7 L (men) of total water a day, and roughly a fifth comes from food — so ~2 L of drinks is a sensible default, not a law. | **Guidance**. NASEM adequate-intake figures as summarized by Scientific American: https://www.scientificamerican.com/article/fact-or-fiction-you-must-drink-8-glasses-of-water-daily — the "8 × 8 glasses" rule itself has no scientific basis (Valtin 2002): https://pubmed.ncbi.nlm.nih.gov/12376390 ; a 2024 JAMA Network Open systematic review found benefits of *increasing* intake mainly for kidney stones, weight loss and some other specific situations: https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2827021 |
| **Water before meals** | 3×/day, 300–500 ml | `FIXED` at meal times (defaults 8:00, 12:30, 19:00) | A glass before eating is an easy way to front-load the day's intake. | **Guidance** (modest trial evidence for appetite/weight; see the JAMA review above). |

Pace logic (from the Cadence design, kept): expected intake = goal × fraction of active hours
elapsed; you are "on pace" if logged + half a tap ≥ expected; reminders are skipped silently when on
pace, so the app never nags someone who is already drinking.

---

## B. Movement snacks (the core of the reminder system)

| Preset | Default rule | Default nudge | Why (in-app copy) | Evidence |
|---|---|---|---|---|
| **Squat snack** | 10 bodyweight squats, 6×/day | `ROTATION` slot, every 45–60 min of the active day | In an 8.5-hour sitting study, ten short squat breaks every 45 min lowered post-meal glucose more than one 30-minute walk of the same energy cost. | **Moderate**. Gao et al. 2024, *Scand J Med Sci Sports* (randomized crossover, 18 men): https://onlinelibrary.wiley.com/doi/10.1111/sms.14628 ; meta-analyses of "exercise snacks" show reduced post-meal glucose in people at metabolic risk: https://pmc.ncbi.nlm.nih.gov/articles/PMC13437454 and https://www.frontiersin.org/journals/nutrition/articles/10.3389/fnut.2025.1708301/full — but a 2026 umbrella review found the pooled effect is not yet statistically clear, so the app says "likely helps", not "proven": https://pmc.ncbi.nlm.nih.gov/articles/PMC13609052 |
| **Sugar Shield** (the "before you eat something sweet" habit) | On demand; counts each use | `EVENT`: a widget / app button "About to eat something sweet" starts a 10–20-squat (or 2-min walk) countdown and schedules a **post-meal walk** nudge 20 min later | Working muscles pull glucose out of the blood without needing insulin, so a minute of squats right before, and a short walk right after, blunts the spike. | **Moderate**. Even a 10-minute walk immediately after glucose intake lowered 2-hour glucose more than a later 30-minute walk (Sci Rep 2025): https://www.nature.com/articles/s41598-025-07312-y ; post-meal walking lowers glucose response vs. sitting (Nutrients 2022): https://www.mdpi.com/2072-6643/14/5/1080 |
| **Soleus push-ups / calf raises** ("step on your toes") | 2 min seated heel raises, 4×/day | `ROTATION` slot | Raising your heels while seated works the soleus, a calf muscle that can burn blood sugar for hours without tiring; in the lab, sustained soleus contractions cut the post-meal glucose rise by about half. | **Emerging**. Hamilton et al. 2022, *iScience*: 52% less post-meal glucose excursion, 60% less hyperinsulinemia (note: the lab protocol was hours long): https://www.cell.com/iscience/fulltext/S2589-0042(22)01141-5 ; a 2025 pilot in prediabetes found ~32% reduction during a glucose test: https://pmc.ncbi.nlm.nih.gov/articles/PMC11946342 |
| **Walk break** | 5 min light walk, every 30–60 min of sitting | `INTERVAL` 60 min (tighten to 30 on desk days) | Five minutes of walking every half hour was the only "snack" that lowered both blood sugar spikes and blood pressure in Columbia's sitting study; even 1 minute an hour helped blood pressure. | **Moderate**. Duran et al. 2023, *Med Sci Sports Exerc* (randomized crossover): https://pubmed.ncbi.nlm.nih.gov/36728338 ; Columbia summary: https://www.cuimc.columbia.edu/news/rx-prolonged-sitting-five-minute-stroll-every-half-hour |
| **Stair sprint** | 3× ~20-second vigorous stair climbs, on 3 days/week | `FIXED` 10:30 / 14:30 / 16:30 (every day until the weekly rule's 3 days are in; pick the days under Reminders → Change → On) | Three quick stair climbs a day, three days a week, improved cardiorespiratory fitness in six weeks. | **Moderate**. Jenkins et al. 2019 (McMaster), *Appl Physiol Nutr Metab*: https://pubmed.ncbi.nlm.nih.gov/30649897 |
| **Vigorous minute** (VILPA) | 3 × 1-minute hard efforts/day (fast stairs, brisk carry, fast walk) | `ROTATION` slot, max 3/day | Three to four one-minute bursts of vigorous everyday activity are linked with substantially lower mortality in people who do no formal exercise. | **Strong (observational)**. Stamatakis et al. 2022, *Nature Medicine* (UK Biobank wearables): https://www.nature.com/articles/s41591-022-02101-w ; overview of exercise-snack research: https://www.frontiersin.org/journals/public-health/articles/10.3389/fpubh.2026.1810516/full |
| **Stand & stretch** | 1–2 min neck / shoulder / hip-flexor mobility, every hour | `INTERVAL` 60 min, merges with other snacks | Breaking up sitting every 30–60 min helps blood sugar and blood pressure; stretching keeps the break from being wasted. | **Guidance** for stretching specifically; the sitting-break evidence is above. |
| **Push-up / wall push-up snack** | 10 reps, 3×/day | `ROTATION` slot | Thirty to sixty minutes a week of muscle-strengthening is linked with 10–20% lower all-cause mortality — snacks add up to that. | **Strong (observational)**. Momma et al. 2022, *Br J Sports Med* meta-analysis: https://bjsm.bmj.com/content/56/13/755 |
| **Strength session** | 2×/week, ≥ 20 min | `FIXED` 18:00 (every day until the weekly rule's 2 sessions are in; pick the days under Reminders → Change → On) | Same evidence as above; the J-curve peaks around 30–60 min/week (later work suggests 90–120 min/week may be optimal). | **Strong (observational)**. Momma 2022 (above); BMJ Group 2025 summary: https://bmjgroup.com/90-120-weekly-minutes-of-strength-training-may-be-optimal-for-lowering-death-risk |
| **Steps** | 7,500 steps/day (auto-filled from Health Connect) | Evening check-in only (19:00) if < 60% of goal | Mortality risk falls steeply up to ~7,000–8,000 steps a day and flattens after; 10,000 was a marketing number. | **Strong (observational)**. Paluch et al. 2022, *Lancet Public Health* meta-analysis (15 cohorts): https://www.thelancet.com/journals/lanpub/article/PIIS2468-2667(21)00302-9/fulltext |

The **rotation** default: one `ROTATION` slot every 60 minutes between 9 am and 7 pm cycles through
the snacks the user enabled (e.g. squats → calf raises → walk → stretch → push-ups → squats …).
Each notification names one concrete snack with **Done / Snooze 10 min / Swap** actions. The daily
cap (default 10 nudges across *all* habits) keeps it from nagging; water and movement nudges due
within 5 minutes of each other merge into one.

---

## C. Mind

| Preset | Default rule | Default nudge | Why (in-app copy) | Evidence |
|---|---|---|---|---|
| **Meditate 13 min** | 13 min/day (timer habit; presets 5 / 10 / 13 / 20) | `FIXED` 7:30 (or after the first coffee) | Eight weeks of 13 minutes a day improved attention, memory and mood in people who had never meditated — four weeks was not enough, so the streak matters. | **Moderate**. Basso et al. 2019, *Behav Brain Res* (RCT): https://pubmed.ncbi.nlm.nih.gov/30153464 |
| **5-minute breathing (cyclic sighing)** | 5 min/day, guided | `FIXED` 15:00 or on demand | Five minutes of exhale-focused "cyclic sighing" improved mood and lowered breathing rate more than the same time spent on mindfulness. | **Moderate**. Balban et al. 2023, *Cell Reports Medicine* (RCT, 1 month): https://www.cell.com/cell-reports-medicine/fulltext/S2666-3791(22)00474-8 |
| **Screen-free wind-down** | 30 min before bed, yes/no | `FIXED` bedtime − 30 min | A fixed wind-down protects sleep regularity, which the sleep card will reflect. | **Guidance**. |
| **Gratitude / journal line** | 1 line/day | `FIXED` 21:30 | Small, fast, and it closes the day. | **Guidance**. |

---

## C2. Craft & learning (added in M2 at Aman's request: reading, writing, daily AI build-out)

| Preset | Default rule | Default nudge | Why (in-app copy) | Evidence |
|---|---|---|---|---|
| **Read 10 pages before bed** | 10 pages/day (COUNT) | `FIXED` 21:30 | Reading in bed is one of the few wind-downs that reliably displaces the phone; in a large trial, people assigned to read in bed reported better sleep than those who did not. | **Emerging**. Finucane et al. 2021, *Trials* (The Reading Trial, n≈990): https://doi.org/10.1186/s13063-021-05831-3 |
| **Technical reading, 20 pages** | 5 × 20 pages per week (WEEKLY) | `FIXED` 08:30 | Spacing study sessions across the week beats one long sitting for retention; a short daily block keeps the material fresh. | **Moderate**. Cepeda et al. 2006, *Psychol Bull* (meta-analysis of spacing): https://pubmed.ncbi.nlm.nih.gov/16719566 |
| **Write for 15 minutes** | 15 min/day (TIMER) | `FIXED` 20:30 | A fixed "when and where" (an implementation intention) roughly doubles the odds of actually doing a planned task. | **Moderate**. Gollwitzer & Sheeran 2006, *Adv Exp Soc Psychol* (meta-analysis, 94 studies): https://doi.org/10.1016/S0065-2601(06)38002-1 |
| **Build with AI, 20 minutes** | 20 min/day (TIMER; Claude Code, Replit or Codex) | `FIXED` 19:30 | Daily repetition in a stable context is what turns a project into a habit — the median in the classic study was about two months, and missing a single day did not matter much. | **Emerging** (habit formation, not a productivity claim). Lally et al. 2010, *Eur J Soc Psychol*: https://doi.org/10.1002/ejsp.674 |

The widget can show any of these (Settings → Home-screen widget); a tap logs the natural unit (10 pages, the full timer block) — see §F for the honesty rules the "Why" text follows.

---

## D. Cycle (opt-in; shown only when cycle tracking is on)

| Preset | Default rule | Default nudge | Why | Evidence |
|---|---|---|---|---|
| **Log period start / end** | Event | Prediction-based prompt on the expected start day, discreet wording | Needed for predictions. | n/a |
| **Pre-period reminder** (e.g. vitamin C, iron-rich meals, lighter training) | Custom text, N days before the predicted start | `CYCLE` anchor (days-before-start) | Carried over from the original Cadence spec as a personal preference — the app labels it "your reminder", not as medical advice. | **Guidance / personal**. |
| **Symptom check-in** | 10-second log of 14 symptoms + mood | No automatic prompt yet (deferred); a cycle reminder anchored "into the luteal phase" can stand in | Enables the symptom-pattern insights after ≥ 3 cycles. | n/a |

---

## E. Body (read from Health Connect; not habits, but shown as cards)

Steps, sleep duration and regularity, resting heart rate, weight trend, workouts (imported as
exercise sessions), and hydration logged in Samsung Health (imported into the water log, de-duplicated
by record id; manual entries always win). Google Fit's APIs are supported only until the end of 2026
and Google is moving Fit users into the Google Health app, so **Health Connect is the import path**
for Samsung Health, Fitbit/Google Health and Google Fit alike:
https://developer.android.com/health-and-fitness/health-connect/migration/fit/faq

---

## F. Honesty rules for the in-app "Why" text

1. Say what the study measured (glucose spike, mood, fitness, mortality association) — not "boosts health".
2. Observational ≠ causal: "is linked with", never "reduces your risk by".
3. Lab-protocol caveats stay visible (soleus push-ups: hours of contraction in the trial; we nudge 2-minute bouts because they are what people actually do).
4. Every "Why" that cites a study has a tappable source link that opens in the browser (the only time the app touches the network, and only on the user's tap). Guidance-only rows (wind-down, journal, the Mind and Shield explainers) have no link because they cite none.
5. Nothing here is medical advice; the Settings → About screen says so once, plainly.
