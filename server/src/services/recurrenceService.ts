import type { RecurrenceRule } from '../types';

/**
 * Calculate the next occurrence date based on a recurrence rule.
 * Returns ISO date string (YYYY-MM-DD).
 */
export function calculateNextOccurrence(
  rule: RecurrenceRule,
  completedOn: string
): string {
  const completed = new Date(completedOn + 'T00:00:00Z');

  switch (rule.type) {
    case 'weekdays': {
      const completedDay = completed.getUTCDay();
      let minDaysAhead = 8;

      for (const targetDay of rule.days) {
        let daysAhead = targetDay - completedDay;
        if (daysAhead <= 0) daysAhead += 7;
        if (daysAhead < minDaysAhead) minDaysAhead = daysAhead;
      }

      const next = new Date(completed);
      next.setUTCDate(next.getUTCDate() + minDaysAhead);
      return formatDate(next);
    }

    case 'days_after': {
      const next = new Date(completed);
      next.setUTCDate(next.getUTCDate() + rule.interval);
      return formatDate(next);
    }

    case 'months_after': {
      const next = new Date(completed);
      const targetMonth = next.getUTCMonth() + rule.interval;
      const targetDay = next.getUTCDate();
      next.setUTCMonth(targetMonth);
      if (next.getUTCDate() !== targetDay) {
        next.setUTCDate(0);
      }
      return formatDate(next);
    }
  }
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}
