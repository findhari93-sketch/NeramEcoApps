import { describe, it, expect } from 'vitest';
import { buildFeaturedSketchHtml } from './teams-class-announcements';

describe('buildFeaturedSketchHtml', () => {
  it('names the student, embeds the image and links to Inspiration', () => {
    const html = buildFeaturedSketchHtml({
      studentName: 'Asha <3',
      imageUrl: 'https://x.supabase.co/storage/v1/object/public/drawing-uploads/u/1.jpg',
      nexusUrl: 'https://nexus.neramclasses.com/student/inspiration/item-1',
    });
    expect(html).toContain('Featured work');
    expect(html).toContain('Asha &lt;3');
    expect(html).toContain('<img src="https://x.supabase.co/storage/v1/object/public/drawing-uploads/u/1.jpg"');
    expect(html).toContain('href="https://nexus.neramclasses.com/student/inspiration/item-1"');
    expect(html).toContain('See it in Inspiration');
    expect(html).not.toContain('—');
  });

  /**
   * The regression net for a privacy leak, not a style check.
   *
   * The card used to take a caption that defaulted to the sketch's `self_note`,
   * the student's private reflection. With the caption box gone from the sheet,
   * a caption argument would put that note in front of a whole class with no
   * human reading it first. If this test starts failing because somebody added
   * the parameter back, that is the bug, not the test.
   */
  it('has no way to put arbitrary text on the card', () => {
    const html = buildFeaturedSketchHtml({
      studentName: 'Asha',
      imageUrl: 'https://x/1.jpg',
      nexusUrl: 'https://n/x',
      // @ts-expect-error the caption parameter is deliberately gone
      caption: 'i hate how this turned out, my proportions are always wrong',
    });
    expect(html).not.toContain('proportions');
    expect(html).not.toContain('<i>');
  });

  it('drops a non-https image rather than embedding it', () => {
    const html = buildFeaturedSketchHtml({ studentName: 'A', imageUrl: 'javascript:alert(1)', nexusUrl: 'https://n/x' });
    expect(html).not.toContain('<img');
  });

  it('drops a non-https link rather than rendering it', () => {
    const html = buildFeaturedSketchHtml({ studentName: 'A', imageUrl: 'https://x/1.jpg', nexusUrl: 'javascript:alert(1)' });
    expect(html).not.toContain('<a');
  });
});
