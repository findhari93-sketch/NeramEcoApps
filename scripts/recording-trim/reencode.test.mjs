import { describe, it, expect } from 'vitest';
import { buildFilterScript, encodeArgs, pickFps, segmentsOf, snapToFrames } from './reencode.mjs';

describe('pickFps', () => {
  it('keeps the source rate up to 30, where one frame is a whole number of samples', () => {
    expect(pickFps(30, 48000)).toBe(30);
    expect(pickFps(29.97, 48000)).toBe(30);
    expect(pickFps(60, 48000)).toBe(30);
    expect(pickFps(15, 48000)).toBe(15);
    expect(pickFps(24, 44100)).toBe(20); // 44100 / 24 is not whole
    expect(pickFps(NaN, 48000)).toBe(30);
    expect(pickFps(30, 0)).toBe(30); // no audio
  });
});

describe('snapToFrames', () => {
  it('keeps a little more, never less: start down, end up', () => {
    expect(snapToFrames([[716.08, 725.96]], 30, 3945.34)).toEqual([[21482, 21779]]);
    // 716.08 * 30 = 21482.4 -> 21482; 725.96 * 30 = 21778.8 -> 21779
  });

  it('a boundary already on the grid stays put despite float noise', () => {
    expect(snapToFrames([[0.1, 0.2]], 30, 10)).toEqual([[3, 6]]);
  });

  it('merges stretches that touch once snapped, and clamps to the file', () => {
    expect(snapToFrames([[1, 2.01], [2.02, 3], [9.5, 20]], 30, 10)).toEqual([[30, 90], [285, 300]]);
  });
});

describe('segmentsOf', () => {
  it('each segment comes out exactly as long as it is in the original', () => {
    const segs = segmentsOf([[30, 90], [285, 300]], 30);
    expect(segs).toEqual([
      { src_start: 1, src_end: 3, out_len: 2 },
      { src_start: 9.5, src_end: 10, out_len: 0.5 },
    ]);
  });
});

describe('buildFilterScript', () => {
  it('cuts video and audio with the same expression, audio in one-frame chunks', () => {
    const script = buildFilterScript([[30, 90], [285, 300]], 30, 48000);
    const [video, audio] = script.split(';\n');
    expect(video).toBe(
      "[0:v:0]fps=30,select='gte(t,0.983333)*lt(t,2.983333)+gte(t,9.483333)*lt(t,9.983333)',setpts=N/30/TB[v]",
    );
    expect(audio).toContain('asetnsamples=n=1600:p=0');
    expect(audio).toContain("aselect='gte(t,0.983333)*lt(t,2.983333)+gte(t,9.483333)*lt(t,9.983333)'");
    expect(audio.endsWith('asetpts=N/SR/TB[a]')).toBe(true);
  });

  it('video only when the recording has no audio', () => {
    expect(buildFilterScript([[0, 30]], 30, 0)).not.toContain('[a]');
  });

  it('stays one expression for hundreds of cuts', () => {
    const frames = Array.from({ length: 600 }, (_, i) => [i * 300, i * 300 + 200]);
    const script = buildFilterScript(frames, 30, 48000);
    expect(script.match(/gte\(t,/g)).toHaveLength(1200);
  });
});

describe('encodeArgs', () => {
  it('maps the filtered streams and keeps a keyframe every 2 seconds', () => {
    const args = encodeArgs({ input: 'in.mp4', scriptFile: 'g.txt', output: 'out.mp4', fps: 30, hasAudio: true });
    expect(args).toEqual(expect.arrayContaining(['-filter_complex_script', 'g.txt', '-map', '[v]', '[a]', '-g', '60']));
    const silent = encodeArgs({ input: 'in.mp4', scriptFile: 'g.txt', output: 'out.mp4', fps: 30, hasAudio: false });
    expect(silent).not.toContain('[a]');
    expect(silent).not.toContain('aac');
  });
});
