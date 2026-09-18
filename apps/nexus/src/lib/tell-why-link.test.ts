import { describe, expect, it } from 'vitest';
import { WHY_PARAM, findTestForWhyLink, tellWhyPath, tellWhyUrl } from './tell-why-link';

describe('the Tell your teacher why link', () => {
  it('is the student tests page with the run named in one parameter', () => {
    expect(tellWhyPath('run-1')).toBe('/student/tests?why=run-1');
    expect(new URL(`https://x${tellWhyPath('run-1')}`).searchParams.get(WHY_PARAM)).toBe('run-1');
  });

  it('never doubles a slash whatever base it is given', () => {
    expect(tellWhyUrl('https://nexus.neramclasses.com/', 'run-1')).toBe(
      'https://nexus.neramclasses.com/student/tests?why=run-1',
    );
  });

  type Listed = { placement_id: string; attempts?: number; card: { why: unknown } };
  const asking: Listed = { placement_id: 'run-1', card: { why: { given: null } } };
  const satSince: Listed = { placement_id: 'run-1', attempts: 1, card: { why: null } };

  it('opens on the test when its card still asks why', () => {
    const found = findTestForWhyLink({ exams: [asking] }, 'run-1');
    expect(found).toEqual({ kind: 'ask', test: asking });
  });

  it('finds the copy that asks, when the same run is listed twice', () => {
    const found = findTestForWhyLink({ due: [satSince], all: [asking] }, 'run-1');
    expect(found.kind).toBe('ask');
  });

  it('says there is nothing to explain once they have sat it', () => {
    expect(findTestForWhyLink({ all: [satSince] }, 'run-1').kind).toBe('not_needed');
  });

  it('says so when the link is for a test not on this list', () => {
    expect(findTestForWhyLink({ all: [asking] }, 'run-2').kind).toBe('not_found');
    expect(findTestForWhyLink({}, 'run-1').kind).toBe('not_found');
  });
});
