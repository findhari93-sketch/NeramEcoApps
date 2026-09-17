import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ patchItem: vi.fn(async () => ({ item: null })) }));
vi.mock('@/components/inspiration/inspiration-api', () => api);

import InspirationSwitch from './InspirationSwitch';

const auto = { item_id: 'i1', curation: 'auto' as const, visible: true, auto_eligible: true };

describe('InspirationSwitch', () => {
  beforeEach(() => api.patchItem.mockClear());

  it('hides the drawing by hand', async () => {
    const onChange = vi.fn();
    render(<InspirationSwitch state={auto} getToken={async () => 't'} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show in Inspiration' }));
    await waitFor(() => expect(api.patchItem).toHaveBeenCalledWith(expect.any(Function), 'i1', { curation: 'hidden' }));
    expect(onChange).toHaveBeenCalledWith({ ...auto, curation: 'hidden', visible: false });
  });

  it('hands a hand-set choice back to the automatic rule', async () => {
    const onChange = vi.fn();
    render(<InspirationSwitch state={{ ...auto, curation: 'hidden', visible: false }} getToken={async () => 't'} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use automatic' }));
    await waitFor(() => expect(api.patchItem).toHaveBeenCalledWith(expect.any(Function), 'i1', { curation: 'auto' }));
    expect(onChange).toHaveBeenCalledWith({ ...auto, curation: 'auto', visible: true });
  });

  it('says why it is on when it is automatic', () => {
    render(<InspirationSwitch state={auto} getToken={async () => 't'} onChange={vi.fn()} />);
    expect(screen.getByText('Automatic at 4 stars and above.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Use automatic' })).toBeNull();
  });
});
