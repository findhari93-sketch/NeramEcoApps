import { describe, it, expect } from 'vitest';
import { buildFeaturedSketchHtml } from './teams-class-announcements';

describe('buildFeaturedSketchHtml', () => {
  it('escapes the caption and embeds the image and the Nexus link', () => {
    const html = buildFeaturedSketchHtml({
      studentName: 'Asha <3',
      caption: 'My street in 10 minutes & a chair',
      imageUrl: 'https://x.supabase.co/storage/v1/object/public/drawing-uploads/u/1.jpg',
      nexusUrl: 'https://nexus.neramclasses.com/teacher/sketchbook/u/1',
    });
    expect(html).toContain('Featured sketch');
    expect(html).toContain('Asha &lt;3');
    expect(html).toContain('My street in 10 minutes &amp; a chair');
    expect(html).toContain('<img src="https://x.supabase.co/storage/v1/object/public/drawing-uploads/u/1.jpg"');
    expect(html).toContain('href="https://nexus.neramclasses.com/teacher/sketchbook/u/1"');
    expect(html).not.toContain('—');
  });
  it('drops a non-https image rather than embedding it', () => {
    const html = buildFeaturedSketchHtml({ studentName: 'A', caption: null, imageUrl: 'javascript:alert(1)', nexusUrl: 'https://n/x' });
    expect(html).not.toContain('<img');
  });
});
