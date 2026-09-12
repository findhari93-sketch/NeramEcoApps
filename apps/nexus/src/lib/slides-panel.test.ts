import { describe, it, expect } from 'vitest';
import { formatAgo, slidesAttachBody, slidesSourceLine } from './slides-panel';

const NOW = new Date('2026-09-11T12:00:00Z').getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('slidesAttachBody', () => {
  it('sends the ids of a picked file, since a search hit link is often a list form page', () => {
    expect(
      slidesAttachBody({
        id: '01ABC',
        driveId: 'b!drive',
        webUrl: 'https://neramclasses.sharepoint.com/sites/x/Shared%20Documents/Forms/DispForm.aspx?ID=12',
      }),
    ).toEqual({ drive_id: 'b!drive', item_id: '01ABC' });
  });

  it('falls back to the link when the row has no drive id', () => {
    expect(slidesAttachBody({ id: '01ABC', driveId: null, webUrl: 'https://neramclasses.sharepoint.com/x.pptx' })).toEqual({
      url: 'https://neramclasses.sharepoint.com/x.pptx',
    });
  });
});

describe('formatAgo', () => {
  it('reads recent times in plain words', () => {
    expect(formatAgo(ago(30 * 1000), NOW)).toBe('just now');
    expect(formatAgo(ago(5 * MIN), NOW)).toBe('5 min ago');
    expect(formatAgo(ago(HOUR), NOW)).toBe('1 hour ago');
    expect(formatAgo(ago(3 * HOUR), NOW)).toBe('3 hours ago');
    expect(formatAgo(ago(DAY), NOW)).toBe('1 day ago');
    expect(formatAgo(ago(2 * DAY), NOW)).toBe('2 days ago');
  });

  it('gives a date once it is more than a month old', () => {
    expect(formatAgo(ago(45 * DAY), NOW)).toMatch(/2026/);
  });

  it('is empty when the time is unknown', () => {
    expect(formatAgo(null, NOW)).toBe('');
    expect(formatAgo('not a date', NOW)).toBe('');
  });

  it('never reads a clock skew as the future', () => {
    expect(formatAgo(new Date(NOW + 5 * MIN).toISOString(), NOW)).toBe('just now');
  });
});

describe('slidesSourceLine', () => {
  const source = {
    name: 'History of Architecture.pptx',
    web_url: null,
    modified_at: null,
    converted_at: ago(2 * DAY),
    checked_at: ago(5 * MIN),
    size_bytes: 480000,
    problem: null,
  };

  it('says when SharePoint was checked and when this version was made', () => {
    expect(slidesSourceLine(source, NOW)).toBe('Checked with SharePoint 5 min ago. This version made 2 days ago');
  });

  it('leaves out what it does not know', () => {
    expect(slidesSourceLine({ ...source, converted_at: null }, NOW)).toBe('Checked with SharePoint 5 min ago');
    expect(slidesSourceLine(undefined, NOW)).toBe('');
  });
});
