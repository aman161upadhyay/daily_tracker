/**
 * The Habit Library as data. Source of truth: docs/HABIT_LIBRARY.md.
 *
 * Honesty rules for "why" copy: say what the study measured; observational
 * findings are "linked with", never "reduces your risk"; lab caveats stay
 * visible; every entry links its source.
 */
import type {
  Cadence,
  Category,
  EvidenceGrade,
  HabitIcon,
  HabitType,
  MindKind,
  NudgeKind,
  SnackType,
} from '../domain/models';

export interface PresetSource {
  label: string;
  url: string;
}

export interface Preset {
  id: string;
  name: string;
  category: Category;
  type: HabitType;
  unit: string;
  icon: HabitIcon;
  snackType?: SnackType;
  mindKind?: MindKind;
  rule: { cadence: Cadence; timesPerPeriod: number; target: number };
  /** One line shown under the name ("10 squats · 6×/day"). */
  ruleText: string;
  policy: {
    kind: NudgeKind;
    intervalMin?: number;
    times?: string[];
    onlyWhenBehind?: boolean;
    maxPerDay?: number;
  };
  nudgeText: string;
  why: string;
  caveat?: string;
  evidence: EvidenceGrade;
  sources: PresetSource[];
  /** Shown when the data comes from Health Connect rather than manual logging. */
  autoFilled?: boolean;
}

export const PRESETS: Preset[] = [
  // ── A. Hydration ─────────────────────────────────────────────────────────
  {
    id: 'water',
    name: 'Drink water',
    category: 'hydration',
    type: 'AMOUNT',
    unit: 'ml',
    icon: 'drop',
    rule: { cadence: 'DAILY', timesPerPeriod: 1, target: 2000 },
    ruleText: '2,000 ml a day',
    policy: { kind: 'INTERVAL', intervalMin: 90, onlyWhenBehind: true, maxPerDay: 8 },
    nudgeText: 'Every 90 min, only when behind pace',
    why:
      'Adequate intake for adults is about 2.7 L (women) to 3.7 L (men) of total water a day, and roughly a fifth of that comes from food — so about 2 L of drinks is a sensible default, not a law.',
    caveat: 'The “8 × 8 glasses” rule has no scientific basis; benefits of drinking more show up mainly for kidney stones and a few specific situations.',
    evidence: 'Guidance',
    sources: [
      {
        label: 'NASEM intake figures (Scientific American)',
        url: 'https://www.scientificamerican.com/article/fact-or-fiction-you-must-drink-8-glasses-of-water-daily',
      },
      { label: 'Valtin 2002, Am J Physiol', url: 'https://pubmed.ncbi.nlm.nih.gov/12376390' },
      {
        label: 'JAMA Netw Open 2024 systematic review',
        url: 'https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2827021',
      },
    ],
  },
  {
    id: 'water-before-meals',
    name: 'Water before meals',
    category: 'hydration',
    type: 'COUNT',
    unit: 'glasses',
    icon: 'meal',
    rule: { cadence: 'DAILY', timesPerPeriod: 1, target: 3 },
    ruleText: 'A glass before each of 3 meals',
    policy: { kind: 'FIXED', times: ['08:00', '12:30', '19:00'], maxPerDay: 3 },
    nudgeText: 'At 8:00 AM, 12:30 PM and 7:00 PM',
    why: 'A glass before eating is an easy way to front-load the day’s intake.',
    evidence: 'Guidance',
    sources: [
      {
        label: 'JAMA Netw Open 2024 systematic review',
        url: 'https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2827021',
      },
    ],
  },

  // ── B. Movement snacks ───────────────────────────────────────────────────
  {
    id: 'squat-snack',
    name: 'Squat snack',
    category: 'movement',
    type: 'COUNT',
    unit: 'sets',
    icon: 'squat',
    snackType: 'SQUATS',
    rule: { cadence: 'DAILY', timesPerPeriod: 1, target: 6 },
    ruleText: '10 squats · 6 sets a day',
    policy: { kind: 'ROTATION', intervalMin: 60, maxPerDay: 8 },
    nudgeText: 'Rotation slot, about every hour of the active day',
    why:
      'In an 8.5-hour sitting study, ten short squat breaks every 45 minutes lowered post-meal glucose more than one 30-minute walk of the same energy cost.',
    caveat: 'A 2026 umbrella review found the pooled effect of exercise snacks is not yet statistically clear — so this says “likely helps”, not “proven”.',
    evidence: 'Moderate',
    sources: [
      { label: 'Gao et al. 2024, Scand J Med Sci Sports', url: 'https://onlinelibrary.wiley.com/doi/10.1111/sms.14628' },
      { label: 'Exercise-snack meta-analysis (PMC)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC13437454' },
      { label: 'Umbrella review 2026 (PMC)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC13609052' },
    ],
  },
  {
    id: 'sugar-shield',
    name: 'Sugar Shield',
    category: 'fuel',
    type: 'COUNT',
    unit: 'uses',
    icon: 'shield',
    snackType: 'SQUATS',
    rule: { cadence: 'DAILY', timesPerPeriod: 1, target: 1 },
    ruleText: 'Squats before something sweet, a short walk after',
    policy: { kind: 'EVENT' },
    nudgeText: 'On demand: schedules a 2-minute walk 20 min after you use it',
    why:
      'Working muscles pull glucose out of the blood without needing insulin, so a minute of squats right before, and a short walk right after, blunts the spike.',
    evidence: 'Moderate',
    sources: [
      { label: 'Sci Rep 2025 — 10-min walk right after glucose', url: 'https://www.nature.com/articles/s41598-025-07312-y' },
      { label: 'Nutrients 2022 — post-meal walking', url: 'https://www.mdpi.com/2072-6643/14/5/1080' },
    ],
  },
  {
    id: 'calf-raises',
    name: 'Soleus push-ups',
    category: 'movement',
    type: 'COUNT',
    unit: 'sets',
    icon: 'calf',
    snackType: 'CALF_RAISES',
    rule: { cadence: 'DAILY', timesPerPeriod: 1, target: 4 },
    ruleText: '2 min of seated heel raises · 4 sets a day',
    policy: { kind: 'ROTATION', intervalMin: 60, maxPerDay: 6 },
    nudgeText: 'Rotation slot',
    why:
      'Raising your heels while seated works the soleus, a calf muscle that can burn blood sugar for hours without tiring; in the lab, sustained soleus contractions cut the post-meal glucose rise by about half.',
    caveat: 'The lab protocol ran for hours; two-minute bouts are what people actually do, so expect a smaller effect.',
    evidence: 'Emerging',
    sources: [
      { label: 'Hamilton et al. 2022, iScience', url: 'https://www.cell.com/iscience/fulltext/S2589-0042(22)01141-5' },
      { label: '2025 pilot in prediabetes (PMC)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11946342' },
    ],
  },
  {
    id: 'walk-break',
    name: 'Walk break',
    category: 'movement',
    type: 'COUNT',
    unit: 'walks',
    icon: 'walk',
    snackType: 'WALK',
    rule: { cadence: 'DAILY', timesPerPeriod: 1, target: 4 },
    ruleText: '5 min of light walking · 4 times a day',
    policy: { kind: 'INTERVAL', intervalMin: 60, maxPerDay: 8 },
    nudgeText: 'Every 60 min of sitting (tighten to 30 on desk days)',
    why:
      'Five minutes of walking every half hour was the only “snack” that lowered both blood sugar spikes and blood pressure in Columbia’s sitting study; even one minute an hour helped blood pressure.',
    evidence: 'Moderate',
    sources: [
      { label: 'Duran et al. 2023, Med Sci Sports Exerc', url: 'https://pubmed.ncbi.nlm.nih.gov/36728338' },
      {
        label: 'Columbia summary',
        url: 'https://www.cuimc.columbia.edu/news/rx-prolonged-sitting-five-minute-stroll-every-half-hour',
      },
    ],
  },
  {
    id: 'stair-sprint',
    name: 'Stair sprint',
    category: 'movement',
    type: 'COUNT',
    unit: 'climbs',
    icon: 'stairs',
    snackType: 'STAIRS',
    rule: { cadence: 'WEEKLY', timesPerPeriod: 3, target: 3 },
    ruleText: '3 quick climbs · 3 days a week',
    policy: { kind: 'FIXED', times: ['10:30', '14:30', '16:30'], maxPerDay: 3 },
    nudgeText: 'At 10:30 AM, 2:30 PM and 4:30 PM until 3 days are in this week',
    why: 'Three quick stair climbs a day, three days a week, improved cardiorespiratory fitness in six weeks.',
    evidence: 'Moderate',
    sources: [{ label: 'Jenkins et al. 2019 (McMaster), Appl Physiol Nutr Metab', url: 'https://pubmed.ncbi.nlm.nih.gov/30649897' }],
  },
  {
    id: 'vigorous-minute',
    name: 'Vigorous minute',
    category: 'movement',
    type: 'COUNT',
    unit: 'bursts',
    icon: 'lightning',
    snackType: 'VIGOROUS_MINUTE',
    rule: { cadence: 'DAILY', timesPerPeriod: 1, target: 3 },
    ruleText: '3 one-minute hard efforts a day',
    policy: { kind: 'ROTATION', intervalMin: 60, maxPerDay: 3 },
    nudgeText: 'Rotation slot, at most 3 a day',
    why:
      'Three to four one-minute bursts of vigorous everyday activity are linked with substantially lower mortality in people who do no formal exercise.',
    evidence: 'Strong',
    sources: [
      { label: 'Stamatakis et al. 2022, Nature Medicine', url: 'https://www.nature.com/articles/s41591-022-02101-w' },
      {
        label: 'Exercise-snack overview (Frontiers)',
        url: 'https://www.frontiersin.org/journals/public-health/articles/10.3389/fpubh.2026.1810516/full',
      },
    ],
  },
  {
    id: 'stand-stretch',
    name: 'Stand & stretch',
    category: 'movement',
    type: 'COUNT',
    unit: 'breaks',
    icon: 'stretch',
    snackType: 'STRETCH',
    rule: { cadence: 'DAILY', timesPerPeriod: 1, target: 6 },
    ruleText: '1–2 min of mobility every hour',
    policy: { kind: 'INTERVAL', intervalMin: 60, maxPerDay: 8 },
    nudgeText: 'Every 60 min, merged with other snacks',
    why: 'Breaking up sitting every 30–60 minutes helps blood sugar and blood pressure; stretching keeps the break from being wasted.',
    evidence: 'Guidance',
    sources: [{ label: 'Duran et al. 2023 (sitting breaks)', url: 'https://pubmed.ncbi.nlm.nih.gov/36728338' }],
  },
  {
    id: 'pushup-snack',
    name: 'Push-up snack',
    category: 'movement',
    type: 'COUNT',
    unit: 'sets',
    icon: 'pushup',
    snackType: 'PUSH_UPS',
    rule: { cadence: 'DAILY', timesPerPeriod: 1, target: 3 },
    ruleText: '10 reps (wall push-ups count) · 3 sets a day',
    policy: { kind: 'ROTATION', intervalMin: 60, maxPerDay: 4 },
    nudgeText: 'Rotation slot',
    why: 'Thirty to sixty minutes a week of muscle-strengthening is linked with 10–20% lower all-cause mortality — snacks add up to that.',
    evidence: 'Strong',
    sources: [{ label: 'Momma et al. 2022, Br J Sports Med', url: 'https://bjsm.bmj.com/content/56/13/755' }],
  },
  {
    id: 'strength-session',
    name: 'Strength session',
    category: 'movement',
    type: 'YES_NO',
    unit: '',
    icon: 'barbell',
    rule: { cadence: 'WEEKLY', timesPerPeriod: 2, target: 1 },
    ruleText: '20+ min · twice a week',
    policy: { kind: 'FIXED', times: ['18:00'], maxPerDay: 1 },
    nudgeText: 'At 6:00 PM until both sessions are in this week',
    why: 'The mortality link with strength training peaks around 30–60 minutes a week; later work suggests 90–120 minutes a week may be optimal.',
    evidence: 'Strong',
    sources: [
      { label: 'Momma et al. 2022, Br J Sports Med', url: 'https://bjsm.bmj.com/content/56/13/755' },
      {
        label: 'BMJ Group 2025 summary',
        url: 'https://bmjgroup.com/90-120-weekly-minutes-of-strength-training-may-be-optimal-for-lowering-death-risk',
      },
    ],
  },
  {
    id: 'steps',
    name: 'Steps',
    category: 'movement',
    type: 'AMOUNT',
    unit: 'steps',
    icon: 'steps',
    rule: { cadence: 'DAILY', timesPerPeriod: 1, target: 7500 },
    ruleText: '7,500 a day · fills in from Health Connect',
    policy: { kind: 'FIXED', times: ['19:00'], onlyWhenBehind: true, maxPerDay: 1 },
    nudgeText: 'Evening check-in at 7:00 PM if under 60% of goal',
    why: 'Mortality risk falls steeply up to about 7,000–8,000 steps a day and flattens after; 10,000 was a marketing number.',
    evidence: 'Strong',
    sources: [
      {
        label: 'Paluch et al. 2022, Lancet Public Health',
        url: 'https://www.thelancet.com/journals/lanpub/article/PIIS2468-2667(21)00302-9/fulltext',
      },
    ],
    autoFilled: true,
  },

  // ── C. Mind ──────────────────────────────────────────────────────────────
  {
    id: 'meditate',
    name: 'Meditate',
    category: 'mind',
    type: 'TIMER',
    unit: 'min',
    icon: 'lotus',
    mindKind: 'MEDITATION',
    rule: { cadence: 'DAILY', timesPerPeriod: 1, target: 13 },
    ruleText: '13 min a day',
    policy: { kind: 'FIXED', times: ['07:30'], maxPerDay: 1 },
    nudgeText: 'At 7:30 AM',
    why:
      'Eight weeks of 13 minutes a day improved attention, memory and mood in people who had never meditated — four weeks was not enough, so the streak matters.',
    evidence: 'Moderate',
    sources: [{ label: 'Basso et al. 2019, Behav Brain Res', url: 'https://pubmed.ncbi.nlm.nih.gov/30153464' }],
  },
  {
    id: 'breathing',
    name: 'Cyclic sighing',
    category: 'mind',
    type: 'TIMER',
    unit: 'min',
    icon: 'wind',
    mindKind: 'BREATHING',
    rule: { cadence: 'DAILY', timesPerPeriod: 1, target: 5 },
    ruleText: '5 min of guided breathing a day',
    policy: { kind: 'FIXED', times: ['15:00'], maxPerDay: 1 },
    nudgeText: 'At 3:00 PM or on demand',
    why: 'Five minutes of exhale-focused “cyclic sighing” improved mood and lowered breathing rate more than the same time spent on mindfulness.',
    evidence: 'Moderate',
    sources: [
      {
        label: 'Balban et al. 2023, Cell Reports Medicine',
        url: 'https://www.cell.com/cell-reports-medicine/fulltext/S2666-3791(22)00474-8',
      },
    ],
  },
  {
    id: 'wind-down',
    name: 'Screen-free wind-down',
    category: 'mind',
    type: 'YES_NO',
    unit: '',
    icon: 'moon',
    rule: { cadence: 'DAILY', timesPerPeriod: 1, target: 1 },
    ruleText: '30 min before bed',
    policy: { kind: 'FIXED', times: ['22:30'], maxPerDay: 1 },
    nudgeText: '30 min before bedtime',
    why: 'A fixed wind-down protects sleep regularity, which the sleep card will reflect.',
    evidence: 'Guidance',
    sources: [],
  },
  {
    id: 'journal',
    name: 'One line of journal',
    category: 'mind',
    type: 'YES_NO',
    unit: '',
    icon: 'journal',
    rule: { cadence: 'DAILY', timesPerPeriod: 1, target: 1 },
    ruleText: 'One line a day',
    policy: { kind: 'FIXED', times: ['21:30'], maxPerDay: 1 },
    nudgeText: 'At 9:30 PM',
    why: 'Small, fast, and it closes the day.',
    evidence: 'Guidance',
    sources: [],
  },

  // ── D. Craft & learning (reading, writing, building) ─────────────────────
  {
    id: 'read-before-bed',
    name: 'Read 10 pages',
    category: 'craft',
    type: 'COUNT',
    unit: 'pages',
    icon: 'book',
    rule: { cadence: 'DAILY', timesPerPeriod: 1, target: 10 },
    ruleText: '10 pages a night',
    policy: { kind: 'FIXED', times: ['21:30'], maxPerDay: 1 },
    nudgeText: 'At 9:30 PM, before bed',
    why:
      'In a 991-person online trial, people assigned to read a book in bed were more likely to report better sleep after a week (42% vs 28%) than those told not to. Ten pages a night is also 3,000+ pages a year.',
    evidence: 'Emerging',
    sources: [{ label: 'Finucane et al. 2021, Trials (The People\'s Trial)', url: 'https://trialsjournal.biomedcentral.com/articles/10.1186/s13063-021-05831-3' }],
  },
  {
    id: 'technical-reading',
    name: 'Technical reading',
    category: 'craft',
    type: 'COUNT',
    unit: 'pages',
    icon: 'book',
    rule: { cadence: 'WEEKLY', timesPerPeriod: 5, target: 20 },
    ruleText: '20 pages on 5 days a week (about 100 a week)',
    policy: { kind: 'FIXED', times: ['08:30'], maxPerDay: 1 },
    nudgeText: 'At 8:30 AM on days you have not read yet',
    why:
      'Spacing study over several days beats one long session for remembering what you read. Five short sessions a week turn a dense technical book into a predictable 100 pages.',
    evidence: 'Moderate',
    sources: [{ label: 'Cepeda et al. 2006, Psychol Bull (spacing meta-analysis)', url: 'https://pubmed.ncbi.nlm.nih.gov/16719566' }],
  },
  {
    id: 'write',
    name: 'Write',
    category: 'craft',
    type: 'TIMER',
    unit: 'min',
    icon: 'pen',
    rule: { cadence: 'DAILY', timesPerPeriod: 1, target: 15 },
    ruleText: '15 min a day',
    policy: { kind: 'FIXED', times: ['20:30'], maxPerDay: 1 },
    nudgeText: 'At 8:30 PM',
    why:
      'A daily slot at a fixed time is the habit-formation finding that replicates: planned "when and where" cues roughly double follow-through on goals. Fifteen minutes is small enough to start on a bad day.',
    evidence: 'Moderate',
    sources: [{ label: 'Gollwitzer & Sheeran 2006 (implementation intentions meta-analysis)', url: 'https://doi.org/10.1016/S0065-2601(06)38002-1' }],
  },
  {
    id: 'build-with-ai',
    name: 'Build with AI',
    category: 'craft',
    type: 'TIMER',
    unit: 'min',
    icon: 'code',
    rule: { cadence: 'DAILY', timesPerPeriod: 1, target: 20 },
    ruleText: '20 min a day (Claude Code, Replit, Codex…)',
    policy: { kind: 'FIXED', times: ['19:30'], maxPerDay: 1 },
    nudgeText: 'At 7:30 PM',
    why:
      'New routines took a median of 66 days to feel automatic in the classic diary study, and missing a single day made little difference — so a short daily build beats an occasional long one.',
    evidence: 'Emerging',
    sources: [{ label: 'Lally et al. 2010, Eur J Soc Psychol', url: 'https://onlinelibrary.wiley.com/doi/10.1002/ejsp.674' }],
  },
];

export const PRESET_BY_ID: Record<string, Preset> = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

/**
 * The preset with this id, or undefined. For ids that arrive from outside the table — a deep
 * link's query, a habit's presetId from a backup — where a plain index would also answer for
 * inherited names ("constructor", "__proto__") with something that is not a preset.
 */
export function presetById(id: unknown): Preset | undefined {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(PRESET_BY_ID, id) ? PRESET_BY_ID[id] : undefined;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  hydration: 'Hydration',
  movement: 'Movement',
  mind: 'Mind',
  cycle: 'Cycle',
  body: 'Body',
  fuel: 'Fuel',
  craft: 'Craft & learning',
};

export const CATEGORY_ORDER: Category[] = ['hydration', 'movement', 'fuel', 'mind', 'craft', 'body', 'cycle'];

export const EVIDENCE_HELP: Record<EvidenceGrade, string> = {
  Strong: 'Meta-analyses or large cohorts',
  Moderate: 'Several RCTs or a good crossover trial',
  Emerging: 'Small or pilot trials',
  Guidance: 'Expert consensus, weak trial evidence',
};
