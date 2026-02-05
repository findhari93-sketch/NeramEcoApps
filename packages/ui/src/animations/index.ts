/**
 * Neram Classes - Animation Presets
 *
 * Material 3 inspired animations using Framer Motion.
 * These presets follow M3 motion guidelines for natural, expressive animations.
 */

import type { Variants, Transition } from 'framer-motion';
import { m3Motion } from '../theme/brand-2025';

// ============================================
// TRANSITION PRESETS
// ============================================

/**
 * Standard M3 transition
 */
export const standardTransition: Transition = {
  duration: m3Motion.duration.medium2 / 1000,
  ease: [0.2, 0, 0, 1], // M3 standard easing
};

/**
 * Emphasized M3 transition (for attention-grabbing animations)
 */
export const emphasizedTransition: Transition = {
  duration: m3Motion.duration.long1 / 1000,
  ease: [0.05, 0.7, 0.1, 1], // M3 emphasized decelerate
};

/**
 * Quick M3 transition (for micro-interactions)
 */
export const quickTransition: Transition = {
  duration: m3Motion.duration.short4 / 1000,
  ease: [0.2, 0, 0, 1],
};

/**
 * Spring transition for playful animations
 */
export const springTransition: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 25,
};

// ============================================
// ANIMATION VARIANTS
// ============================================

/**
 * Fade In
 */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: standardTransition,
  },
  exit: {
    opacity: 0,
    transition: quickTransition,
  },
};

/**
 * Fade In Up (great for lists, cards)
 */
export const fadeInUp: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: emphasizedTransition,
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: quickTransition,
  },
};

/**
 * Fade In Down
 */
export const fadeInDown: Variants = {
  hidden: {
    opacity: 0,
    y: -20,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: emphasizedTransition,
  },
  exit: {
    opacity: 0,
    y: 10,
    transition: quickTransition,
  },
};

/**
 * Fade In Left
 */
export const fadeInLeft: Variants = {
  hidden: {
    opacity: 0,
    x: -20,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: emphasizedTransition,
  },
  exit: {
    opacity: 0,
    x: 20,
    transition: quickTransition,
  },
};

/**
 * Fade In Right
 */
export const fadeInRight: Variants = {
  hidden: {
    opacity: 0,
    x: 20,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: emphasizedTransition,
  },
  exit: {
    opacity: 0,
    x: -20,
    transition: quickTransition,
  },
};

/**
 * Scale In (for modals, dialogs)
 */
export const scaleIn: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: emphasizedTransition,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: quickTransition,
  },
};

/**
 * Scale In with Bounce
 */
export const scaleInBounce: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.8,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: springTransition,
  },
  exit: {
    opacity: 0,
    scale: 0.8,
    transition: quickTransition,
  },
};

/**
 * Slide In from Bottom (for sheets, drawers)
 */
export const slideInBottom: Variants = {
  hidden: {
    y: '100%',
    opacity: 0,
  },
  visible: {
    y: 0,
    opacity: 1,
    transition: emphasizedTransition,
  },
  exit: {
    y: '100%',
    opacity: 0,
    transition: standardTransition,
  },
};

/**
 * Slide In from Left (for sidebars)
 */
export const slideInLeft: Variants = {
  hidden: {
    x: '-100%',
    opacity: 0,
  },
  visible: {
    x: 0,
    opacity: 1,
    transition: emphasizedTransition,
  },
  exit: {
    x: '-100%',
    opacity: 0,
    transition: standardTransition,
  },
};

/**
 * Slide In from Right
 */
export const slideInRight: Variants = {
  hidden: {
    x: '100%',
    opacity: 0,
  },
  visible: {
    x: 0,
    opacity: 1,
    transition: emphasizedTransition,
  },
  exit: {
    x: '100%',
    opacity: 0,
    transition: standardTransition,
  },
};

// ============================================
// STAGGER ANIMATIONS (for lists)
// ============================================

/**
 * Stagger container (wrap list items)
 */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

/**
 * Stagger item (use inside stagger container)
 */
export const staggerItem: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: emphasizedTransition,
  },
};

/**
 * Fast stagger container
 */
export const fastStaggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.05,
    },
  },
};

// ============================================
// MICRO-INTERACTIONS
// ============================================

/**
 * Button hover effect
 */
export const buttonHover = {
  scale: 1.02,
  y: -2,
  transition: quickTransition,
};

/**
 * Button tap effect
 */
export const buttonTap = {
  scale: 0.98,
  transition: { duration: 0.1 },
};

/**
 * Card hover effect
 */
export const cardHover = {
  y: -8,
  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
  transition: standardTransition,
};

/**
 * Icon spin
 */
export const iconSpin: Variants = {
  initial: { rotate: 0 },
  animate: {
    rotate: 360,
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};

/**
 * Pulse effect (for loading, notifications)
 */
export const pulse: Variants = {
  initial: { scale: 1, opacity: 1 },
  animate: {
    scale: [1, 1.05, 1],
    opacity: [1, 0.8, 1],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

/**
 * Shake effect (for errors)
 */
export const shake: Variants = {
  initial: { x: 0 },
  animate: {
    x: [-5, 5, -5, 5, -3, 3, -2, 2, 0],
    transition: {
      duration: 0.5,
    },
  },
};

/**
 * Bounce effect
 */
export const bounce: Variants = {
  initial: { y: 0 },
  animate: {
    y: [0, -10, 0],
    transition: {
      duration: 0.6,
      repeat: Infinity,
      repeatType: 'loop',
    },
  },
};

// ============================================
// SCROLL ANIMATIONS
// ============================================

/**
 * Scroll reveal animation config
 * Use with useInView hook from framer-motion
 */
export const scrollReveal: Variants = {
  hidden: {
    opacity: 0,
    y: 50,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.05, 0.7, 0.1, 1],
    },
  },
};

/**
 * Scroll reveal with scale
 */
export const scrollRevealScale: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.9,
    y: 30,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.7,
      ease: [0.05, 0.7, 0.1, 1],
    },
  },
};

// ============================================
// PAGE TRANSITIONS
// ============================================

/**
 * Page fade transition
 */
export const pageFade: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      duration: 0.3,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.2,
    },
  },
};

/**
 * Page slide transition
 */
export const pageSlide: Variants = {
  initial: {
    opacity: 0,
    x: 20,
  },
  animate: {
    opacity: 1,
    x: 0,
    transition: emphasizedTransition,
  },
  exit: {
    opacity: 0,
    x: -20,
    transition: quickTransition,
  },
};

// ============================================
// LOADING ANIMATIONS
// ============================================

/**
 * Loading dots animation
 */
export const loadingDots: Variants = {
  initial: { y: 0 },
  animate: (i: number) => ({
    y: [0, -10, 0],
    transition: {
      duration: 0.6,
      delay: i * 0.1,
      repeat: Infinity,
    },
  }),
};

/**
 * Skeleton shimmer effect (CSS-based, use as className)
 */
export const skeletonShimmerCSS = `
  background: linear-gradient(
    90deg,
    rgba(0, 0, 0, 0.06) 0%,
    rgba(0, 0, 0, 0.12) 50%,
    rgba(0, 0, 0, 0.06) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
`;

// ============================================
// UTILITY TYPES
// ============================================

export type AnimationVariant =
  | 'fadeIn'
  | 'fadeInUp'
  | 'fadeInDown'
  | 'fadeInLeft'
  | 'fadeInRight'
  | 'scaleIn'
  | 'scaleInBounce'
  | 'slideInBottom'
  | 'slideInLeft'
  | 'slideInRight';

/**
 * Get animation variant by name
 */
export function getVariant(name: AnimationVariant): Variants {
  const variants: Record<AnimationVariant, Variants> = {
    fadeIn,
    fadeInUp,
    fadeInDown,
    fadeInLeft,
    fadeInRight,
    scaleIn,
    scaleInBounce,
    slideInBottom,
    slideInLeft,
    slideInRight,
  };
  return variants[name];
}
