import { describe, expect, it } from 'vitest';
import { start, step } from './upload-sketch';

const deps = { today: '2026-10-03', now: new Date('2026-10-03T04:30:00Z'), upcoming: [], declined: new Set<string>() };
const photo = { original_image_url: 'https://cdn.test/a.jpg', thumbnail_url: 'https://cdn.test/t.jpg' };

describe('upload-sketch flow', () => {
  it('asks for the photo and flags that an attachment is wanted', () => {
    const out = start({ text: 'add a sketch' }, deps);
    expect(out.state?.step).toBe('attach');
    expect(out.wantsAttachment).toBe(true);
    const nag = step(out.state!, { text: 'here' }, deps);
    expect(nag.state?.step).toBe('attach');
    expect(nag.reply).toMatch(/still need the photo/);
  });

  it('moves to the caption once a photo arrives, then proposes add_sketch', () => {
    let out = start({ text: 'add a sketch', attachment: photo }, deps);
    expect(out.state).toMatchObject({ step: 'caption', data: photo });
    expect(out.suggestions.map((s) => s.label)).toEqual(['No caption']);
    out = step(out.state!, { text: 'Two point perspective practice' }, deps);
    expect(out.state).toBeNull();
    expect(out.propose).toMatchObject({ kind: 'add_sketch', args: { ...photo, caption: 'Two point perspective practice' } });
  });

  it('No caption proposes with an empty caption', () => {
    let out = start({ text: 'upload my drawing' }, deps);
    out = step(out.state!, { text: '', attachment: photo }, deps);
    out = step(out.state!, { text: 'No caption' }, deps);
    expect(out.propose?.args).toEqual({ ...photo, caption: '' });
  });
});
