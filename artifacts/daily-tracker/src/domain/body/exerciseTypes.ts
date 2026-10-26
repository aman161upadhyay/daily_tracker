/**
 * Health Connect exercise type constants (androidx.health.connect
 * ExerciseSessionRecord.EXERCISE_TYPE_*), the ones worth a label. Copied
 * rather than imported so the domain never depends on the native library.
 */

interface ExerciseMeta {
  label: string;
  /** Counts toward the Strength session habit. */
  strength: boolean;
}

/** The handful of constants the app refers to by name. */
export const EXERCISE_TYPE = {
  OTHER_WORKOUT: 0,
  STRENGTH_TRAINING: 70,
  WALKING: 79,
  WEIGHTLIFTING: 81,
} as const;

const TYPES: Record<number, ExerciseMeta> = {
  0: { label: 'Workout', strength: false },
  2: { label: 'Badminton', strength: false },
  4: { label: 'Baseball', strength: false },
  5: { label: 'Basketball', strength: false },
  8: { label: 'Cycling', strength: false },
  9: { label: 'Indoor cycling', strength: false },
  10: { label: 'Boot camp', strength: true },
  11: { label: 'Boxing', strength: false },
  13: { label: 'Calisthenics', strength: true },
  14: { label: 'Cricket', strength: false },
  16: { label: 'Dancing', strength: false },
  25: { label: 'Elliptical', strength: false },
  26: { label: 'Exercise class', strength: false },
  27: { label: 'Fencing', strength: false },
  28: { label: 'Football (American)', strength: false },
  29: { label: 'Football (Australian)', strength: false },
  31: { label: 'Frisbee', strength: false },
  32: { label: 'Golf', strength: false },
  33: { label: 'Guided breathing', strength: false },
  34: { label: 'Gymnastics', strength: true },
  35: { label: 'Handball', strength: false },
  36: { label: 'HIIT', strength: true },
  37: { label: 'Hiking', strength: false },
  38: { label: 'Ice hockey', strength: false },
  39: { label: 'Ice skating', strength: false },
  44: { label: 'Martial arts', strength: true },
  46: { label: 'Paddling', strength: false },
  47: { label: 'Paragliding', strength: false },
  48: { label: 'Pilates', strength: true },
  50: { label: 'Racquetball', strength: false },
  51: { label: 'Rock climbing', strength: true },
  52: { label: 'Roller hockey', strength: false },
  53: { label: 'Rowing', strength: false },
  54: { label: 'Rowing machine', strength: false },
  55: { label: 'Rugby', strength: false },
  56: { label: 'Running', strength: false },
  57: { label: 'Treadmill', strength: false },
  58: { label: 'Sailing', strength: false },
  59: { label: 'Scuba diving', strength: false },
  60: { label: 'Skating', strength: false },
  61: { label: 'Skiing', strength: false },
  62: { label: 'Snowboarding', strength: false },
  63: { label: 'Snowshoeing', strength: false },
  64: { label: 'Soccer', strength: false },
  65: { label: 'Softball', strength: false },
  66: { label: 'Squash', strength: false },
  68: { label: 'Stair climbing', strength: false },
  69: { label: 'Stair machine', strength: false },
  70: { label: 'Strength training', strength: true },
  71: { label: 'Stretching', strength: false },
  72: { label: 'Surfing', strength: false },
  73: { label: 'Swimming (open water)', strength: false },
  74: { label: 'Swimming (pool)', strength: false },
  75: { label: 'Table tennis', strength: false },
  76: { label: 'Tennis', strength: false },
  78: { label: 'Volleyball', strength: false },
  79: { label: 'Walking', strength: false },
  80: { label: 'Water polo', strength: false },
  81: { label: 'Weightlifting', strength: true },
  82: { label: 'Wheelchair', strength: false },
  83: { label: 'Yoga', strength: false },
};

export function exerciseLabel(type: number, title?: string): string {
  const t = title?.trim();
  if (t) return t;
  return TYPES[type]?.label ?? 'Workout';
}

export function isStrengthExercise(type: number): boolean {
  return TYPES[type]?.strength ?? false;
}

/** Walks are movement, not workouts: they never tick the Strength session habit and stay out of the count. */
export function isWalk(type: number): boolean {
  return type === 79;
}
