/**
 * Nexus App - CSS Keyframe Animations
 * Material 3 motion-based animations for enterprise UI
 */

export const keyframes = {
  fadeInUp: `
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `,
  scaleIn: `
    @keyframes scaleIn {
      from {
        opacity: 0;
        transform: scale(0.95);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
  `,
  slideInRight: `
    @keyframes slideInRight {
      from {
        opacity: 0;
        transform: translateX(-16px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }
  `,
  shimmer: `
    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
  `,
};

/** Apply fadeInUp with staggered delay */
export const fadeInUpStyle = (delayMs = 0) => ({
  animation: `fadeInUp 400ms cubic-bezier(0.05, 0.7, 0.1, 1) ${delayMs}ms both`,
});

/** Apply scaleIn animation */
export const scaleInStyle = (delayMs = 0) => ({
  animation: `scaleIn 300ms cubic-bezier(0.05, 0.7, 0.1, 1) ${delayMs}ms both`,
});

/** Global keyframes string to inject once */
export const globalKeyframes = Object.values(keyframes).join('\n');
