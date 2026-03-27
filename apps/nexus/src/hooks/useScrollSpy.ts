'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseScrollSpyOptions {
  /** CSS selector for question card elements */
  itemSelector: string;
  /** Root element for intersection (null = viewport) */
  root?: HTMLElement | null;
  /** Threshold for "visible" (0-1) */
  threshold?: number;
  /** Root margin */
  rootMargin?: string;
}

export interface UseScrollSpyReturn {
  /** Index of the currently most-visible item */
  currentIndex: number;
  /** Ref to attach to the scrollable container */
  containerRef: React.RefObject<HTMLElement>;
  /** Programmatic scroll to index with smooth behavior */
  scrollToIndex: (index: number) => void;
}

/**
 * Hook that uses IntersectionObserver to track which question card
 * is currently most visible in the viewport.
 */
export function useScrollSpy(options: UseScrollSpyOptions): UseScrollSpyReturn {
  const {
    itemSelector,
    root = null,
    threshold: _threshold,
    rootMargin = '0px',
  } = options;

  const containerRef = useRef<HTMLElement>(null!);
  const [currentIndex, setCurrentIndex] = useState(0);
  const ratioMap = useRef<Map<number, number>>(new Map());
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced update to avoid thrashing during fast scroll
  const scheduleUpdate = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      let bestIndex = 0;
      let bestRatio = 0;
      ratioMap.current.forEach((ratio, idx) => {
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestIndex = idx;
        }
      });
      setCurrentIndex(bestIndex);
    }, 100);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const el = entry.target as HTMLElement;
          const idx = parseInt(el.dataset.questionIndex ?? '0', 10);
          ratioMap.current.set(idx, entry.intersectionRatio);
        });
        scheduleUpdate();
      },
      {
        root,
        rootMargin,
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    const items = container.querySelectorAll(itemSelector);
    items.forEach((item) => observer.observe(item));

    return () => {
      observer.disconnect();
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      ratioMap.current.clear();
    };
  }, [itemSelector, root, rootMargin, scheduleUpdate]);

  const scrollToIndex = useCallback(
    (index: number) => {
      const container = containerRef.current;
      if (!container) return;
      const items = container.querySelectorAll(itemSelector);
      const target = items[index] as HTMLElement | undefined;
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    },
    [itemSelector],
  );

  return { currentIndex, containerRef, scrollToIndex };
}
