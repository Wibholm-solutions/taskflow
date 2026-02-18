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

const DEAD_ZONE = 10;

export function useSwipe(options: UseSwipeOptions = {}) {
  const { onSwipeRight, onSwipeLeft, threshold = 80 } = options;
  const [offset, setOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const isTracking = useRef(false);
  const isVertical = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    currentX.current = e.touches[0].clientX;
    isTracking.current = false;
    isVertical.current = false;
    setOffset(0);
    setIsSwiping(false);
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    currentX.current = touchX;

    if (!isTracking.current) {
      const dx = Math.abs(touchX - startX.current);
      const dy = Math.abs(touchY - startY.current);
      if (dx < DEAD_ZONE && dy < DEAD_ZONE) return;
      isTracking.current = true;
      isVertical.current = dy > dx;
    }

    if (isVertical.current) return;

    setIsSwiping(true);
    setOffset(touchX - startX.current);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (isTracking.current && !isVertical.current) {
      const direction = getSwipeDirection(startX.current, currentX.current, threshold);
      if (direction === 'right') onSwipeRight?.();
      if (direction === 'left') onSwipeLeft?.();
    }
    setOffset(0);
    setIsSwiping(false);
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

  return { ref, offset, isSwiping };
}
