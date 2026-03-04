'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView } from 'framer-motion';
import { Typography } from '@neram/ui';
import type { TypographyProps } from '@mui/material';

interface AnimatedCounterProps extends Omit<TypographyProps, 'children'> {
  /** Target number to count to */
  target: number;
  /** Duration in ms */
  duration?: number;
  /** Prefix text (e.g., "₹") */
  prefix?: string;
  /** Suffix text (e.g., "+") */
  suffix?: string;
}

export default function AnimatedCounter({
  target,
  duration = 1500,
  prefix = '',
  suffix = '',
  ...typographyProps
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isInView) return;

    let startTime: number;
    let animationFrame: number;

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(step);
      }
    };

    animationFrame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationFrame);
  }, [isInView, target, duration]);

  return (
    <Typography ref={ref} {...typographyProps}>
      {prefix}{count}{suffix}
    </Typography>
  );
}
