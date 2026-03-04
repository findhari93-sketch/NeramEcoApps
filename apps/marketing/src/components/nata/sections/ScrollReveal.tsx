'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Box } from '@neram/ui';
import type { BoxProps } from '@mui/material';

interface ScrollRevealProps extends BoxProps {
  children: React.ReactNode;
  /** Delay in seconds before animation starts */
  delay?: number;
  /** Amount of element visible before triggering (0-1) */
  threshold?: number;
  /** Direction to animate from */
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
  /** Duration in seconds */
  duration?: number;
}

export default function ScrollReveal({
  children,
  delay = 0,
  threshold = 0.2,
  direction = 'up',
  duration = 0.6,
  ...boxProps
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: threshold });

  const directionMap = {
    up: { y: 40, x: 0 },
    down: { y: -40, x: 0 },
    left: { x: -40, y: 0 },
    right: { x: 40, y: 0 },
    none: { x: 0, y: 0 },
  };

  const offset = directionMap[direction];

  return (
    <Box ref={ref} {...boxProps}>
      <motion.div
        initial={{ opacity: 0, ...offset }}
        animate={isInView ? { opacity: 1, x: 0, y: 0 } : { opacity: 0, ...offset }}
        transition={{
          duration,
          delay,
          ease: [0.05, 0.7, 0.1, 1], // M3 emphasized decelerate
        }}
      >
        {children}
      </motion.div>
    </Box>
  );
}
