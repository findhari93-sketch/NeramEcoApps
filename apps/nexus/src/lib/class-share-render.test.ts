/**
 * Two renderers, one section list. The load-bearing test in this file is the
 * anti-drift one: the clipboard text and the Teams card must carry the same
 * links and the same headings, because the whole reason the model exists is
 * that hand-written duplicates of this message had already diverged.
 */
import { describe, it, expect } from 'vitest';
import { buildShareSections, type ClassSharePayload, type ShareSectionId, TOGGLEABLE_SECTIONS } from './class-share-model';
import { renderShareHtml, renderShareText, shareUrls } from './class-share-render';

const BASE = 'https://nexus.neramclasses.com';
const ALL = new Set<ShareSectionId>(TOGGLEABLE_SECTIONS);

/** A past class with every optional section populated. */
function fullPayload(over: Partial<ClassSharePayload> = {}): ClassSharePayload {
  return {
    classId: 'cls-1',
    title: 'Isometric Drawing Basics',
    scheduled_date: '2026-08-14',
    start_time: '19:00',
    end_time: '20:30',
    state: 'past',
    tutorName: 'Ar. Hari Babu',
    description: 'We started from the cube and built up to subtractive forms.',
    summaryBullets: ['Cube in isometric, the 30 degree rule', 'Two worked examples'],
    links: {
      join: null,
      rsvp: `${BASE}/student/rsvp/cls-1`,
      watch: `${BASE}/student/class-recap/rec-9`,
      watchKind: 'recap',
      prepTest: null,
      classTest: `${BASE}/student/catch-up/cls-1/test`,
    },
    prepTest: null,
    classTest: { questionCount: 10, passingPct: 85 },
    assignments: [
      { id: 'a1', title: 'Subtractive cube sheet', timing: 'homework', dueAtIso: '2026-08-18T12:30:00Z', type: 'drawing', url: `${BASE}/student/assignments/a1` },
      { id: 'a2', title: 'Reading notes', timing: 'homework', dueAtIso: null, type: 'document', url: `${BASE}/student/assignments/a2` },
    ],
    ...over,
  };
}

const hrefs = (html: string): string[] =>
  Array.from(html.matchAll(/href="([^"]+)"/g)).map((m) => m[1]);

describe('renderShareText and renderShareHtml agree', () => {
  it('carry an identical set of URLs', () => {
    const sections = buildShareSections(fullPayload());
    const text = renderShareText(sections, ALL);
    const html = renderShareHtml(sections, ALL);

    const expected = shareUrls(sections, ALL);
    expect(expected.length).toBeGreaterThan(0);

    // Every URL in the model appears verbatim in the plain text.
    expected.forEach((url) => expect(text).toContain(url));
    // And is an anchor target in the HTML. Sets, because the HTML escaper may
    // reorder nothing but the comparison should not care about duplicates.
    expect(new Set(hrefs(html))).toEqual(new Set(expected));
  });

  it('carry the same section headings', () => {
    const sections = buildShareSections(fullPayload());
    const text = renderShareText(sections, ALL);
    const html = renderShareHtml(sections, ALL);
    sections
      .map((s) => s.heading?.text)
      .filter((t): t is string => !!t)
      .forEach((heading) => {
        expect(text).toContain(heading);
        expect(html).toContain(heading);
      });
  });

  it('drop the same sections when a checkbox is unticked', () => {
    const sections = buildShareSections(fullPayload());
    const without = new Set<ShareSectionId>(TOGGLEABLE_SECTIONS.filter((s) => s !== 'assignments'));
    expect(renderShareText(sections, without)).not.toContain('Subtractive cube sheet');
    expect(renderShareHtml(sections, without)).not.toContain('Subtractive cube sheet');
    expect(hrefs(renderShareHtml(sections, without))).not.toContain(`${BASE}/student/assignments/a1`);
  });
});

describe('renderShareText', () => {
  const sections = buildShareSections(fullPayload());

  it('leads with the class title and the IST date and time', () => {
    const text = renderShareText(sections, ALL);
    expect(text.startsWith('✅ Class done: Isometric Drawing Basics')).toBe(true);
    // en-IN puts a comma before the year. Matching the existing WhatsApp
    // builder's output exactly, so both messages read the same way.
    expect(text).toContain('Fri, 14 Aug, 2026');
    expect(text).toContain('7:00 PM to 8:30 PM (IST)');
  });

  it('uses one casing for AM/PM across the header and the deadlines', () => {
    const text = renderShareText(sections, ALL);
    expect(text).toContain('6:00 PM');
    expect(text).not.toMatch(/\d\s?(am|pm)\b/);
  });

  it('appends the URL after the label', () => {
    expect(renderShareText(sections, ALL)).toContain(`Watch the recording: ${BASE}/student/class-recap/rec-9`);
  });

  it('marks bullets and keeps a blank line between blocks', () => {
    const text = renderShareText(sections, ALL);
    expect(text).toContain('• Cube in isometric, the 30 degree rule');
    expect(text).not.toContain('\n\n\n');
  });

  it('leaves the header and the sign-off when every toggleable section is off', () => {
    const text = renderShareText(sections, new Set<ShareSectionId>());
    expect(text).toContain('Isometric Drawing Basics');
    expect(text).toContain('Any doubts, ask in the group');
    expect(text).not.toContain('\n\n\n');
    expect(text).not.toContain('Watch the recording');
  });

  it('never contains an em dash or a double dash', () => {
    const text = renderShareText(sections, ALL);
    expect(text).not.toContain('—');
    expect(text).not.toContain('--');
    expect(text).not.toContain('&mdash;');
  });
});

describe('renderShareHtml', () => {
  it('uses h3 for the class and bold paragraphs for later headings', () => {
    const html = renderShareHtml(buildShareSections(fullPayload()), ALL);
    expect(html).toContain('<h3>✅ Class done: Isometric Drawing Basics</h3>');
    expect(html).toContain('<p><strong>📚 Homework</strong></p>');
  });

  it('collapses consecutive bullets into one list', () => {
    const html = renderShareHtml(buildShareSections(fullPayload()), ALL);
    // Two homework items, one <ul>, two <li>.
    const homework = html.slice(html.indexOf('📚 Homework'));
    expect(homework.match(/<ul>/g) ?? []).toHaveLength(1);
    expect(homework.match(/<li>/g) ?? []).toHaveLength(2);
  });

  it('escapes a title carrying markup characters', () => {
    // The failure this guards is on record: a class called "Angles < 90 & > 45"
    // produced a card Teams rendered as garbage, silently.
    const html = renderShareHtml(buildShareSections(fullPayload({ title: 'Angles < 90 & > 45' })), ALL);
    expect(html).toContain('&lt; 90 &amp; &gt; 45');
    expect(html).not.toContain('< 90 & > 45');
  });

  it('does not let a title close the heading tag', () => {
    const html = renderShareHtml(buildShareSections(fullPayload({ title: '</h3><script>alert(1)</script>' })), ALL);
    expect(html).not.toContain('<script>');
    expect(html.match(/<h3>/g) ?? []).toHaveLength(1);
  });

  it('does not let an assignment title break out of its list item', () => {
    const html = renderShareHtml(
      buildShareSections(
        fullPayload({
          assignments: [
            { id: 'a1', title: '</li></ul><h1>gotcha', timing: 'homework', dueAtIso: null, type: 'drawing', url: `${BASE}/student/assignments/a1` },
          ],
        }),
      ),
      ALL,
    );
    expect(html).not.toContain('<h1>');
    expect(html).toContain('&lt;/li&gt;&lt;/ul&gt;');
  });

  it('never contains an em dash or a double dash', () => {
    const html = renderShareHtml(buildShareSections(fullPayload()), ALL);
    expect(html).not.toContain('—');
    expect(html).not.toContain('&mdash;');
  });
});
