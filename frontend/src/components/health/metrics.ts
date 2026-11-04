// The numbers Health can read from Home Assistant (3.4.0), with their names.
import type { TranslationKey } from "@/lib/i18n";

export const HEALTH_METRICS: [string, TranslationKey][] = [
  ["steps", "health.steps"], ["sleep", "health.sleep"], ["weight", "health.weight"], ["resting_hr", "health.restingHr"],
  // 3.4.0: a workout calendar (Withings) or an activities sensor (Garmin, Strava …).
  ["workouts", "health.workouts"],
];
