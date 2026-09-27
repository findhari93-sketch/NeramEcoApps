// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { evidenceLines } from './lifecycle-evidence';

const NOW = new Date('2026-09-26T04:30:00Z');

describe('evidenceLines', () => {
  it('describes a quiet student with labels', () => {
    const lines = evidenceLines(
      { last_activity_at: '2026-09-01T06:00:00Z', last_activity: 'class_attended', classroom: 'NATA 2027' },
      { activitySources: { class_attended: 'Attended a class' } },
      NOW,
    );
    expect(lines).toEqual([
      { label: 'Last active', value: '1 Sep 2026 (25 days ago)' },
      { label: 'Last activity', value: 'Attended a class' },
      { label: 'Classroom', value: 'NATA 2027' },
    ]);
  });

  it('says so when there is no recorded activity', () => {
    expect(evidenceLines({ last_activity_at: null }, {}, NOW)).toEqual([{ label: 'Last active', value: 'No activity recorded' }]);
  });

  it('labels lead stages and falls back to words for unknown keys', () => {
    const lines = evidenceLines(
      { last_activity_at: null, stage: 'lead', crm_stage: 'phone_verified' },
      { stages: { lead: 'Lead' } },
      NOW,
    );
    expect(lines[1]).toEqual({ label: 'Stage', value: 'Lead' });
    expect(lines[2]).toEqual({ label: 'CRM stage', value: 'phone verified' });
  });

  it('shows the archive date and batch facts', () => {
    const lines = evidenceLines(
      { archived_at: '2025-06-01T00:00:00Z', academic_year: '2025-26', current_batch: '2026-27' },
      {},
      NOW,
    );
    expect(lines).toEqual([
      { label: 'Archived', value: '1 Jun 2025 (482 days ago)' },
      { label: 'Batch', value: '2025-26 (current is 2026-27)' },
    ]);
  });

  it('returns nothing for empty evidence', () => {
    expect(evidenceLines(null)).toEqual([]);
    expect(evidenceLines({})).toEqual([]);
  });
});
