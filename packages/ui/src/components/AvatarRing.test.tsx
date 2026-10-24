import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AvatarRing, AVATAR_RING_EXTRA, type AvatarRingVariant } from './AvatarRing';
import { LanguageMark } from '../language/LanguageMark';

describe('AvatarRing', () => {
  it('names its variant for tests and styles', () => {
    for (const variant of ['student', 'paused', 'alumni', 'lead', 'staff', 'other', 'none'] as AvatarRingVariant[]) {
      const { container, unmount } = render(
        <AvatarRing variant={variant} size={32}>
          <span>AK</span>
        </AvatarRing>,
      );
      expect(container.querySelector('[data-ring]')?.getAttribute('data-ring')).toBe(variant);
      unmount();
    }
  });

  it('keeps one footprint for every variant, so rows line up', () => {
    expect(AVATAR_RING_EXTRA).toBe(6);
    const sizes = (['student', 'lead', 'staff', 'other', 'none'] as AvatarRingVariant[]).map((variant) => {
      const { container, unmount } = render(
        <AvatarRing variant={variant} size={40}>
          <span />
        </AvatarRing>,
      );
      const style = getComputedStyle(container.firstElementChild as Element);
      unmount();
      return `${style.width}x${style.height}`;
    });
    expect(new Set(sizes)).toEqual(new Set(['46pxx46px']));
  });
});

describe('LanguageMark', () => {
  it('draws Telugu as a Latin T', () => {
    const { container } = render(<LanguageMark language="telugu" />);
    expect(container.textContent).toBe('T');
  });

  it('flags a guess as likely', () => {
    const { container } = render(<LanguageMark language="tamil" likely />);
    expect(container.querySelector('[data-likely="true"]')).not.toBeNull();
  });

  it('draws nothing for a plain English speaker', () => {
    const { container } = render(<LanguageMark language="english" likely />);
    expect(container.firstChild).toBeNull();
  });
});
