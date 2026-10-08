import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ patchItem: vi.fn(async () => ({ item: null })) }));
vi.mock('@/components/inspiration/inspiration-api', () => api);

import InspirationStatus, { inspirationLine } from './InspirationStatus';

const auto = { item_id: 'i1', curation: 'auto' as const, visible: true, auto_eligible: true };

describe('inspirationLine', () => {
  it('says why it is on, or not, under the automatic rule', () => {
    expect(inspirationLine(auto, false)).toBe('On the Inspiration shelf (automatic at 4 stars)');
    expect(inspirationLine({ ...auto, visible: false, auto_eligible: false }, false))
      .toBe('Not on the Inspiration shelf (goes on automatically at 4 stars)');
  });
  it('names a hand choice as the teacher’s', () => {
    expect(inspirationLine({ ...auto, curation: 'shown' }, false)).toBe('On the Inspiration shelf (set by you)');
    expect(inspirationLine({ ...auto, curation: 'hidden', visible: false }, false)).toBe('Kept off the Inspiration shelf (set by you)');
  });
  it('never promises stars on a sketch, which has none', () => {
    const sketch = { ...auto, visible: false, auto_eligible: false };
    expect(inspirationLine(sketch, false, false)).toBe('Not on the Inspiration shelf (a sketch goes on when you feature it)');
    expect(inspirationLine(sketch, false, false)).not.toMatch(/stars/);
  });
  it('says featuring brought the shelf with it', () => {
    expect(inspirationLine(auto, true)).toBe('Featured: posted to your class and on the Inspiration shelf');
    expect(inspirationLine({ ...auto, curation: 'hidden', visible: false }, true)).toBe('Featured, but kept off the Inspiration shelf');
  });
  it('never uses a dash as punctuation', () => {
    const lines = [inspirationLine(auto, true), inspirationLine(auto, false), inspirationLine({ ...auto, visible: false }, false)].join(' ');
    expect(lines.includes(String.fromCharCode(8212))).toBe(false);
    expect(lines.includes('--')).toBe(false);
  });
});

describe('InspirationStatus', () => {
  beforeEach(() => api.patchItem.mockClear());

  it('is a line and a Change button, not a switch', () => {
    render(<InspirationStatus state={auto} getToken={async () => 't'} onChange={vi.fn()} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Change Inspiration shelf setting' })).toBeTruthy();
  });

  it('keeps the drawing off the shelf by hand', async () => {
    const onChange = vi.fn();
    render(<InspirationStatus state={auto} getToken={async () => 't'} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change Inspiration shelf setting' }));
    fireEvent.click(screen.getByRole('radio', { name: /Never show/ }));
    await waitFor(() => expect(api.patchItem).toHaveBeenCalledWith(expect.any(Function), 'i1', { curation: 'hidden' }));
    expect(onChange).toHaveBeenCalledWith({ ...auto, curation: 'hidden', visible: false });
  });

  it('hands a hand-set choice back to the automatic rule', async () => {
    const onChange = vi.fn();
    render(<InspirationStatus state={{ ...auto, curation: 'hidden', visible: false }} getToken={async () => 't'} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change Inspiration shelf setting' }));
    fireEvent.click(screen.getByRole('radio', { name: /Automatic/ }));
    await waitFor(() => expect(api.patchItem).toHaveBeenCalledWith(expect.any(Function), 'i1', { curation: 'auto' }));
    expect(onChange).toHaveBeenCalledWith({ ...auto, curation: 'auto', visible: true });
  });
});
