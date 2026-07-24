/**
 * Unit tests for the class-draft paste-back bridge parser. The teacher pastes
 * whatever an external AI returned, so the parser must survive fenced blocks,
 * prose wrappers and malformed input without throwing.
 */
import { describe, it, expect } from 'vitest';
import { parseClassDraft, buildClassDraftPrompt } from './class-ai-draft';

describe('parseClassDraft', () => {
  it('parses a bare JSON object', () => {
    const r = parseClassDraft('{ "title": "Isometric Basics", "description": "Draw 3D forms." }');
    expect(r.valid).toBe(true);
    expect(r.data).toEqual({ title: 'Isometric Basics', description: 'Draw 3D forms.' });
  });

  it('parses a ```json fenced block', () => {
    const text = 'Here you go:\n```json\n{ "title": "Perspective", "description": "One-point perspective." }\n```\nHope that helps!';
    const r = parseClassDraft(text);
    expect(r.valid).toBe(true);
    expect(r.data?.title).toBe('Perspective');
  });

  it('extracts JSON when surrounded by prose without a fence', () => {
    const r = parseClassDraft('Sure! { "title": "Shadows", "description": "Cast shadows." } Done.');
    expect(r.valid).toBe(true);
    expect(r.data?.description).toBe('Cast shadows.');
  });

  it('accepts a title-only draft', () => {
    const r = parseClassDraft('{ "title": "Only a title" }');
    expect(r.valid).toBe(true);
    expect(r.data).toEqual({ title: 'Only a title', description: '' });
  });

  it('rejects empty input', () => {
    expect(parseClassDraft('').valid).toBe(false);
    expect(parseClassDraft('   ').valid).toBe(false);
  });

  it('rejects malformed JSON', () => {
    const r = parseClassDraft('{ title: not json }');
    expect(r.valid).toBe(false);
    expect(r.data).toBeNull();
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('rejects a JSON object with no usable fields', () => {
    const r = parseClassDraft('{ "foo": "bar" }');
    expect(r.valid).toBe(false);
    expect(r.data).toBeNull();
  });

  it('rejects a JSON array', () => {
    expect(parseClassDraft('[1,2,3]').valid).toBe(false);
  });
});

describe('buildClassDraftPrompt', () => {
  it('embeds the teacher idea when provided', () => {
    const p = buildClassDraftPrompt('isometric basics');
    expect(p).toContain('isometric basics');
    expect(p).toContain('"title"');
  });

  it('works with no idea', () => {
    const p = buildClassDraftPrompt();
    expect(p).toContain('"title"');
    expect(p).toContain('"description"');
  });
});
