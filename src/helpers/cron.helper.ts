import { IntervalUnit } from "@/types/job";

/**
 * Build a 5-field cron expression for a simple "every N <unit>" interval.
 * Kept deliberately narrow — the schedule builder only offers these shapes.
 */
export const buildCron = (every: number, unit: IntervalUnit): string => {
  const n = Math.max(1, Math.floor(every));
  switch (unit) {
    case "minutes":
      return `*/${n} * * * *`;
    case "hours":
      return `0 */${n} * * *`;
    case "days":
      return `0 0 */${n} * *`;
  }
};

/** Inverse of buildCron. Returns null when the expression isn't one we generated. */
export const parseCron = (
  cron: string
): { every: number; unit: IntervalUnit } | null => {
  const minutes = cron.match(/^\*\/(\d+) \* \* \* \*$/);
  if (minutes) return { every: parseInt(minutes[1], 10), unit: "minutes" };

  const hours = cron.match(/^0 \*\/(\d+) \* \* \*$/);
  if (hours) return { every: parseInt(hours[1], 10), unit: "hours" };

  const days = cron.match(/^0 0 \*\/(\d+) \* \*$/);
  if (days) return { every: parseInt(days[1], 10), unit: "days" };

  return null;
};

/** Short human label, e.g. "Every 6h". Falls back to the raw expression. */
export const describeCron = (cron: string): string => {
  const parsed = parseCron(cron);
  if (!parsed) return cron;
  const suffix = { minutes: "m", hours: "h", days: "d" }[parsed.unit];
  return `Every ${parsed.every}${suffix}`;
};
