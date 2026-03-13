'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Lightweight replacement for framer-motion's useInView.
 * Returns a ref to attach to the observed element and a boolean
 * that flips to `true` once the element enters the viewport.
 *
 * @param options.once  If true (default), stays visible after first intersection.
 * @param options.margin  rootMargin for IntersectionObserver (e.g. '-60px').
 */
export function useInView(
  options: { once?: boolean; margin?: string } = {},
): [RefObject<HTMLDivElement | null>, boolean] {
  const { once = true, margin = '0px' } = options;
  const ref = useRef<HTMLDivElement | null>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          if (once) observer.unobserve(node);
        } else if (!once) {
          setIsInView(false);
        }
      },
      { rootMargin: margin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [once, margin]);

  return [ref, isInView];
}

/**
 * CSS-class based scroll animation helper.
 * Attaches an IntersectionObserver to the ref and adds/removes
 * 'is-visible' class. Pair with CSS transitions on the element.
 *
 * Usage:
 *   const ref = useScrollReveal({ margin: '-60px' });
 *   <Box ref={ref} sx={scrollRevealSx(index)}>...</Box>
 */
export function useScrollReveal(
  options: { once?: boolean; margin?: string } = {},
): RefObject<HTMLDivElement | null> {
  const { once = true, margin = '0px' } = options;
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          node.classList.add('is-visible');
          if (once) observer.unobserve(node);
        } else if (!once) {
          node.classList.remove('is-visible');
        }
      },
      { rootMargin: margin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [once, margin]);

  return ref;
}

/**
 * SX helper for scroll-reveal elements.
 * Elements start invisible and translated down, then animate in
 * when the 'is-visible' class is added.
 *
 * @param delayIndex  Optional stagger index (each adds 80ms delay).
 */
export const scrollRevealSx = (delayIndex = 0) => ({
  opacity: 0,
  transform: 'translateY(32px)',
  transition: `opacity 0.5s ease ${delayIndex * 0.08}s, transform 0.5s ease ${delayIndex * 0.08}s`,
  '&.is-visible': {
    opacity: 1,
    transform: 'translateY(0)',
  },
});
