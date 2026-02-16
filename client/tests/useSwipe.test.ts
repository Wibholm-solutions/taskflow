import { describe, it, expect } from 'vitest';
import { getSwipeDirection } from '../src/hooks/useSwipe';

describe('getSwipeDirection', () => {
  it('returns right when exceeding threshold', () => {
    expect(getSwipeDirection(0, 100, 80)).toBe('right');
  });

  it('returns left when exceeding threshold', () => {
    expect(getSwipeDirection(100, 0, 80)).toBe('left');
  });

  it('returns null when under threshold', () => {
    expect(getSwipeDirection(0, 50, 80)).toBeNull();
  });

  it('returns null at exact threshold', () => {
    expect(getSwipeDirection(0, 80, 80)).toBeNull();
  });
});
