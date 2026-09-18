import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StudentStageAvatar from './StudentStageAvatar';
import * as facts from './StudentStageFactsProvider';
import type { LanguageKey } from '@/lib/student-language';

/**
 * The language mark at bottom-left.
 *
 * A plain English student keeps a bare corner by decision, which is what makes a
 * mark mean something, so these cases pin which states are marked, at exactly the
 * sizes the cohort glyph appears at, and that the spoken label still starts with
 * the stage (the e2e suite finds every ring in the app by that prefix).
 */

vi.mock('@/components/GraphAvatar', () => ({
  default: () => <span data-testid="graph-avatar" />,
}));

/** The e2e ring selector, copied from tests/e2e/avatar-ring-nexus-mobile.spec.ts. */
const RING = /(Class 10|Class 11|Class 12|Break Year|Not set|Dormant):/;

function stubFacts(map: Record<string, { language: LanguageKey; limitedEnglish?: boolean }>) {
  vi.spyOn(facts, 'useStudentStageFacts').mockReturnValue({
    ready: true,
    factsFor: (id) =>
      id && id in map
        ? {
            stage: '11th',
            dormant: false,
            photo: null,
            name: null,
            language: map[id].language,
            limitedEnglish: map[id].limitedEnglish === true,
          }
        : null,
  });
}

const badge = () => screen.queryByTestId('language-badge');
const ring = () => screen.getByLabelText(RING);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('StudentStageAvatar language mark', () => {
  it('marks Tamil and Hindi with their own letter', () => {
    const { unmount } = render(<StudentStageAvatar stage="11th" name="Nithya Raman" language="tamil" />);
    expect(badge()?.textContent).toBe('த');
    unmount();
    render(<StudentStageAvatar stage="11th" name="Aarav Sharma" language="hindi" />);
    expect(badge()?.textContent).toBe('ह');
  });

  it('marks Kannada and Malayalam with a Latin initial, because those scripts are not read here', () => {
    const { unmount } = render(<StudentStageAvatar stage="11th" name="Meera Rao" language="kannada" />);
    expect(badge()?.textContent).toBe('K');
    unmount();
    render(<StudentStageAvatar stage="11th" name="Anil Nair" language="malayalam" />);
    expect(badge()?.textContent).toBe('M');
  });

  it('keeps a bare corner for a plain English student', () => {
    render(<StudentStageAvatar stage="11th" name="Nithya Raman" language="english" />);
    expect(badge()).toBeNull();
  });

  it('keeps a bare corner when nobody has recorded it, which reads as English', () => {
    render(<StudentStageAvatar stage="11th" name="Nithya Raman" language={null} />);
    expect(badge()).toBeNull();
  });

  it('marks an English student who cannot follow English', () => {
    render(<StudentStageAvatar stage="11th" name="Nithya Raman" language="english" limitedEnglish />);
    expect(badge()?.textContent).toBe('E');
    expect(badge()?.getAttribute('data-limited-english')).toBe('true');
  });

  it('keeps the language letter when they also cannot follow English', () => {
    render(<StudentStageAvatar stage="11th" name="Nithya Raman" language="tamil" limitedEnglish />);
    expect(badge()?.textContent).toBe('த');
    expect(badge()?.getAttribute('data-limited-english')).toBe('true');
  });

  it('drops the mark below the size where the cohort glyph drops too', () => {
    render(<StudentStageAvatar stage="11th" name="Nithya Raman" size={24} language="tamil" />);
    expect(badge()).toBeNull();
  });

  it('drops the mark when the caller turns corner marks off', () => {
    render(<StudentStageAvatar stage="11th" name="Nithya Raman" showGlyph={false} language="tamil" />);
    expect(badge()).toBeNull();
  });

  it('keeps the mark on a dormant student, whose photo alone goes grey', () => {
    render(<StudentStageAvatar stage="12th" dormant name="Paused Person" language="tamil" />);
    expect(badge()?.textContent).toBe('த');
  });

  it('hides the letter from screen readers, because the label already says it', () => {
    render(<StudentStageAvatar stage="11th" name="Nithya Raman" language="tamil" />);
    expect(badge()?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('StudentStageAvatar language label', () => {
  it('appends the language after the stage, keeping the ring prefix first', () => {
    render(<StudentStageAvatar stage="11th" name="Nithya Raman" language="tamil" />);
    const label = ring().getAttribute('aria-label') || '';
    expect(label).toMatch(/^Class 11:/);
    expect(label.endsWith(' Tamil.')).toBe(true);
  });

  it('spells out limited English after the language', () => {
    render(<StudentStageAvatar stage="11th" name="Meera Rao" language="kannada" limitedEnglish />);
    expect((ring().getAttribute('aria-label') || '').endsWith(' Kannada. Limited English.')).toBe(true);
  });

  it('says nothing about language for a plain English student, so most labels are unchanged', () => {
    render(<StudentStageAvatar stage="11th" name="Nithya Raman" language="english" />);
    const label = ring().getAttribute('aria-label') || '';
    expect(label).not.toMatch(/Tamil|English/);
  });
});

describe('StudentStageAvatar language source', () => {
  it('reads the lookup by userId when the caller passes no language', () => {
    stubFacts({ s1: { language: 'hindi' } });
    render(<StudentStageAvatar stage="11th" name="Aarav Sharma" userId="s1" />);
    expect(badge()?.textContent).toBe('ह');
  });

  it('carries the limited English tick out of the lookup too', () => {
    stubFacts({ s1: { language: 'tamil', limitedEnglish: true } });
    render(<StudentStageAvatar stage="11th" name="Nithya Raman" userId="s1" />);
    expect(badge()?.getAttribute('data-limited-english')).toBe('true');
  });

  it('lets an explicit null win over the lookup, so a fresh payload beats a stale cache', () => {
    stubFacts({ s1: { language: 'tamil' } });
    render(<StudentStageAvatar stage="11th" name="Nithya Raman" userId="s1" language={null} />);
    expect(badge()).toBeNull();
  });

  it('shows nothing without a provider, which is every student-facing screen', () => {
    render(<StudentStageAvatar stage="11th" name="Nithya Raman" userId="s1" />);
    expect(badge()).toBeNull();
  });
});
