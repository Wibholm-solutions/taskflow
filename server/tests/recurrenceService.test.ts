import { describe, it, expect } from 'vitest';
import { calculateNextOccurrence } from '../src/services/recurrenceService';
import type { RecurrenceRule } from '../src/types';

describe('calculateNextOccurrence', () => {
  describe('weekdays rule', () => {
    it('should find next Monday from a Sunday completion', () => {
      const rule: RecurrenceRule = { type: 'weekdays', days: [1] }; // Monday
      const completedOn = '2026-02-15'; // Sunday
      expect(calculateNextOccurrence(rule, completedOn)).toBe('2026-02-16'); // Monday
    });

    it('should find next occurrence when completed on the same weekday', () => {
      const rule: RecurrenceRule = { type: 'weekdays', days: [1] }; // Monday
      const completedOn = '2026-02-16'; // Monday
      expect(calculateNextOccurrence(rule, completedOn)).toBe('2026-02-23'); // Next Monday
    });

    it('should find nearest weekday from multiple days', () => {
      const rule: RecurrenceRule = { type: 'weekdays', days: [1, 4] }; // Mon, Thu
      const completedOn = '2026-02-16'; // Monday
      expect(calculateNextOccurrence(rule, completedOn)).toBe('2026-02-19'); // Thursday
    });

    it('should wrap around week boundary', () => {
      const rule: RecurrenceRule = { type: 'weekdays', days: [1] }; // Monday
      const completedOn = '2026-02-18'; // Wednesday
      expect(calculateNextOccurrence(rule, completedOn)).toBe('2026-02-23'); // Next Monday
    });
  });

  describe('days_after rule', () => {
    it('should add days to completion date', () => {
      const rule: RecurrenceRule = { type: 'days_after', interval: 7 };
      const completedOn = '2026-02-16';
      expect(calculateNextOccurrence(rule, completedOn)).toBe('2026-02-23');
    });

    it('should handle month boundary', () => {
      const rule: RecurrenceRule = { type: 'days_after', interval: 3 };
      const completedOn = '2026-02-27';
      expect(calculateNextOccurrence(rule, completedOn)).toBe('2026-03-02');
    });

    it('should handle 1 day interval', () => {
      const rule: RecurrenceRule = { type: 'days_after', interval: 1 };
      const completedOn = '2026-02-16';
      expect(calculateNextOccurrence(rule, completedOn)).toBe('2026-02-17');
    });
  });

  describe('months_after rule', () => {
    it('should add months to completion date', () => {
      const rule: RecurrenceRule = { type: 'months_after', interval: 1 };
      const completedOn = '2026-02-16';
      expect(calculateNextOccurrence(rule, completedOn)).toBe('2026-03-16');
    });

    it('should handle year boundary', () => {
      const rule: RecurrenceRule = { type: 'months_after', interval: 2 };
      const completedOn = '2026-11-15';
      expect(calculateNextOccurrence(rule, completedOn)).toBe('2027-01-15');
    });

    it('should clamp to end of month if day exceeds', () => {
      const rule: RecurrenceRule = { type: 'months_after', interval: 1 };
      const completedOn = '2026-01-31';
      expect(calculateNextOccurrence(rule, completedOn)).toBe('2026-02-28');
    });
  });
});
