// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { diffLedger, parseMigrationFile, normaliseName } from './ledger-diff.mjs';

const local = [
  '20260509_user_funnel_events.sql',
  '20260911120000_application_form_link_autofill.sql',
  '20260926090000_notification_event_type_recap_ready.sql',
  '20261008090100_new_thing.sql',
  '20260401_a.sql',
  '20260401_b.sql',
].map(parseMigrationFile);

const remote = [
  { version: '20260509', name: 'user_funnel_events' },
  { version: '20260912095744', name: 'application_form_link_autofill' },
  { version: '20260926090000', name: 'notification_event_type_recap_ready' },
  { version: '20260628103857', name: 'merge_user_records' },
  { version: '20260401', name: 'a' },
];

describe('ledger-diff', () => {
  it('parses the version prefix the CLI keys on', () => {
    expect(parseMigrationFile('20260509_user_funnel_events.sql')).toEqual({
      file: '20260509_user_funnel_events.sql',
      version: '20260509',
      name: 'user_funnel_events',
    });
    expect(parseMigrationFile('README.md')).toBeNull();
  });

  it('normalises names with or without a version prefix', () => {
    expect(normaliseName('20260911120000_Application_Form.sql')).toBe('application_form');
  });

  it('classifies each file', () => {
    const d = diffLedger(local, remote);
    expect(d.appliedUnderOtherVersion.map((m) => m.file)).toEqual([
      '20260911120000_application_form_link_autofill.sql',
    ]);
    expect(d.appliedUnderOtherVersion[0].remoteVersions).toEqual(['20260912095744']);
    expect(d.missing.map((m) => m.file)).toEqual(['20261008090100_new_thing.sql']);
    expect(d.remoteOnly.map((r) => r.version).sort()).toEqual(['20260628103857', '20260912095744']);
    expect(d.duplicateLocalVersions).toEqual([
      { version: '20260401', files: ['20260401_a.sql', '20260401_b.sql'] },
    ]);
  });

  it('does not propose a repair when the twin version is itself a local file', () => {
    const d = diffLedger(
      [parseMigrationFile('20260101_x.sql'), parseMigrationFile('20260102_x.sql')],
      [{ version: '20260101', name: 'x' }],
    );
    expect(d.appliedUnderOtherVersion).toEqual([]);
    expect(d.missing.map((m) => m.file)).toEqual(['20260102_x.sql']);
  });
});
