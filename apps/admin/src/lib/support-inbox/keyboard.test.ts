// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isSendShortcut, isTypingTarget, shortcutFor, stepIndex } from './keyboard';

const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, getAttribute: () => null, ...extra });

describe('shortcutFor', () => {
  it('maps the inbox keys', () => {
    expect(shortcutFor({ key: 'j', target: el('BODY') })).toBe('next');
    expect(shortcutFor({ key: 'J', target: el('BODY') })).toBe('next');
    expect(shortcutFor({ key: 'k', target: el('BUTTON') })).toBe('prev');
    expect(shortcutFor({ key: 'r' })).toBe('reply');
    expect(shortcutFor({ key: 'n' })).toBe('note');
    expect(shortcutFor({ key: '/' })).toBe('search');
    expect(shortcutFor({ key: 'Escape' })).toBe('back');
    expect(shortcutFor({ key: '?' })).toBe('help');
    expect(shortcutFor({ key: 'x' })).toBeNull();
  });

  it('is off while typing', () => {
    for (const target of [el('INPUT'), el('TEXTAREA'), el('SELECT'), el('DIV', { isContentEditable: true }), el('DIV', { getAttribute: (n: string) => (n === 'role' ? 'textbox' : null) })]) {
      expect(shortcutFor({ key: 'j', target })).toBeNull();
      expect(shortcutFor({ key: 'Escape', target })).toBeNull();
    }
  });

  it('leaves browser shortcuts alone', () => {
    expect(shortcutFor({ key: 'r', ctrlKey: true })).toBeNull();
    expect(shortcutFor({ key: 'k', metaKey: true })).toBeNull();
    expect(shortcutFor({ key: 'n', altKey: true })).toBeNull();
  });
});

describe('helpers', () => {
  it('isTypingTarget tolerates odd targets', () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget('x')).toBe(false);
    expect(isTypingTarget(el('A'))).toBe(false);
  });

  it('isSendShortcut wants Ctrl or Cmd with Enter', () => {
    expect(isSendShortcut({ key: 'Enter', ctrlKey: true })).toBe(true);
    expect(isSendShortcut({ key: 'Enter', metaKey: true })).toBe(true);
    expect(isSendShortcut({ key: 'Enter' })).toBe(false);
  });

  it('stepIndex clamps to the list', () => {
    expect(stepIndex(-1, 5, 1)).toBe(0);
    expect(stepIndex(-1, 5, -1)).toBe(4);
    expect(stepIndex(2, 5, 1)).toBe(3);
    expect(stepIndex(4, 5, 1)).toBe(4);
    expect(stepIndex(0, 5, -1)).toBe(0);
    expect(stepIndex(0, 0, 1)).toBe(-1);
  });
});
