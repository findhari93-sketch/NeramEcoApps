import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StudentStageAvatar from './StudentStageAvatar';
import * as facts from './StudentStageFactsProvider';

/**
 * The த badge at bottom-left: the only mark a Tamil student wears.
 *
 * English only and not recorded both keep a bare corner by decision, so these
 * cases pin that the badge appears for exactly one state, at exactly the sizes the
 * cohort glyph appears at, and that the spoken label still starts with the stage
 * (the e2e suite finds every ring in the app by that prefix).
 */

vi.mock('@/components/GraphAvatar', () => ({
  default: () => <span data-testid="graph-avatar" />,
}));

/** The e2e ring selector, copied from tests/e2e/avatar-ring-nexus-mobile.spec.ts. */
const RING = /(Class 10|Class 11|Class 12|Break Year|Not set|Dormant):/;

function stubFacts(map: Record<string, boolean | null>) {
  vi.spyOn(facts, 'useStudentStageFacts').mockReturnValue({
    ready: true,
    factsFor: (id) =>
      id && id in map
        ? { stage: '11th', dormant: false, photo: null, name: null, knowsTamil: map[id] }
        : null,
  });
}

const badge = () => screen.queryByTestId('tamil-badge');
const ring = () => screen.getByLabelText(RING);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('StudentStageAvatar language badge', () => {
  it('shows த at bottom-left for a student who knows Tamil', () => {
    render(<StudentStageAvatar stage="11th" name="Nithya Raman" knowsTamil />);
    expect(badge()?.textContent).toBe('த');
  });

  it('keeps a bare corner for English only', () => {
    render(<StudentStageAvatar stage="11th" name="Nithya Raman" knowsTamil={false} />);
    expect(badge()).toBeNull();
  });

  it('keeps a bare corner when nobody has recorded it', () => {
    render(<StudentStageAvatar stage="11th" name="Nithya Raman" knowsTamil={null} />);
    expect(badge()).toBeNull();
  });

  it('drops the badge below the size where the cohort glyph drops too', () => {
    render(<StudentStageAvatar stage="11th" name="Nithya Raman" size={24} knowsTamil />);
    expect(badge()).toBeNull();
  });

  it('drops the badge when the caller turns corner marks off', () => {
    render(<StudentStageAvatar stage="11th" name="Nithya Raman" showGlyph={false} knowsTamil />);
    expect(badge()).toBeNull();
  });

  it('keeps the badge on a dormant student, whose photo alone goes grey', () => {
    render(<StudentStageAvatar stage="12th" dormant name="Paused Person" knowsTamil />);
    expect(badge()?.textContent).toBe('த');
  });

  it('hides the letter from screen readers, because the label already says it', () => {
    render(<StudentStageAvatar stage="11th" name="Nithya Raman" knowsTamil />);
    expect(badge()?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('StudentStageAvatar language label', () => {
  it('appends Knows Tamil after the stage, keeping the ring prefix first', () => {
    render(<StudentStageAvatar stage="11th" name="Nithya Raman" knowsTamil />);
    const label = ring().getAttribute('aria-label') || '';
    expect(label).toMatch(/^Class 11:/);
    expect(label.endsWith(' Knows Tamil.')).toBe(true);
  });

  it('spells out English only in the label even though there is no badge', () => {
    render(<StudentStageAvatar stage="11th" name="Nithya Raman" knowsTamil={false} />);
    expect((ring().getAttribute('aria-label') || '').endsWith(' English only.')).toBe(true);
  });

  it('says nothing about language when it is not recorded', () => {
    render(<StudentStageAvatar stage="11th" name="Nithya Raman" />);
    const label = ring().getAttribute('aria-label') || '';
    expect(label).not.toMatch(/Tamil|English only/);
  });
});

describe('StudentStageAvatar language source', () => {
  it('reads the lookup by userId when the caller passes no language', () => {
    stubFacts({ s1: true });
    render(<StudentStageAvatar stage="11th" name="Nithya Raman" userId="s1" />);
    expect(badge()?.textContent).toBe('த');
  });

  it('lets an explicit null win over the lookup, so a fresh payload beats a stale cache', () => {
    stubFacts({ s1: true });
    render(<StudentStageAvatar stage="11th" name="Nithya Raman" userId="s1" knowsTamil={null} />);
    expect(badge()).toBeNull();
  });

  it('shows nothing without a provider, which is every student-facing screen', () => {
    render(<StudentStageAvatar stage="11th" name="Nithya Raman" userId="s1" />);
    expect(badge()).toBeNull();
  });
});
