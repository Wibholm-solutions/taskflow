import { useRef, useCallback, useEffect, useState } from 'react';

interface UseSwipeOptions {
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  threshold?: number;
}

export function getSwipeDirection(
  startX: number,
  endX: number,
  threshold: number
): 'left' | 'right' | null {
  const diff = endX - startX;
  if (Math.abs(diff) <= threshold) return null;
  return diff > 0 ? 'right' : 'left';
}

export function useSwipe(options: UseSwipeOptions = {}) {
  const { onSwipeRight, onSwipeLeft, threshold = 80 } = options;
  const [offset, setOffset] = useState(0);
  const startX = useRef(0);
  const currentX = useRef(0);
  const ref = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    startX.current = e.touches[0].clientX;
    currentX.current = e.touches[0].clientX;
    setOffset(0);
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    currentX.current = e.touches[0].clientX;
    const diff = currentX.current - startX.current;
    setOffset(diff);
  }, []);

  const handleTouchEnd = useCallback(() => {
    const direction = getSwipeDirection(startX.current, currentX.current, threshold);
    if (direction === 'right') onSwipeRight?.();
    if (direction === 'left') onSwipeLeft?.();
    setOffset(0);
  }, [threshold, onSwipeRight, onSwipeLeft]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: true });
    el.addEventListener('touchend', handleTouchEnd);
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { ref, offset };
}
