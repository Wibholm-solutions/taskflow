import type { RecurrenceRule } from '../types';

/**
 * Calculate the next occurrence date based on a recurrence rule.
 * Returns ISO date string (YYYY-MM-DD).
 */
export function calculateNextOccurrence(
  rule: RecurrenceRule,
  completedOn: string
): string {
  const completed = new Date(completedOn + 'T00:00:00');

  switch (rule.type) {
    case 'weekdays': {
      const completedDay = completed.getDay();
      let minDaysAhead = 8;

      for (const targetDay of rule.days) {
        let daysAhead = targetDay - completedDay;
        if (daysAhead <= 0) daysAhead += 7;
        if (daysAhead < minDaysAhead) minDaysAhead = daysAhead;
      }

      const next = new Date(completed);
      next.setDate(next.getDate() + minDaysAhead);
      return formatDate(next);
    }

    case 'days_after': {
      const next = new Date(completed);
      next.setDate(next.getDate() + rule.interval);
      return formatDate(next);
    }

    case 'months_after': {
      const next = new Date(completed);
      const targetMonth = next.getMonth() + rule.interval;
      const targetDay = next.getDate();
      next.setMonth(targetMonth);
      if (next.getDate() !== targetDay) {
        next.setDate(0);
      }
      return formatDate(next);
    }
  }
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}
