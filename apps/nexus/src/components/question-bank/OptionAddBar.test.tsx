import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OptionAddBar from './OptionAddBar';

const four = ['a', 'b', 'c', 'd'].map((id) => ({ id, text: id }));

/**
 * A paper whose printed answer is none of the four options needs a fifth. The
 * old button made `opt_4_<timestamp>` and labelled it with that id.
 */
describe('OptionAddBar', () => {
  it('names the next option by its letter', () => {
    render(<OptionAddBar options={four} onAdd={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Add option E' })).not.toBeNull();
  });

  it('adds a blank option, or a ready-made one with its Hindi', () => {
    const onAdd = vi.fn();
    render(<OptionAddBar options={four} onAdd={onAdd} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add option E' }));
    expect(onAdd).toHaveBeenLastCalledWith();
    fireEvent.click(screen.getByRole('button', { name: 'Set option E to None of the above' }));
    expect(onAdd).toHaveBeenLastCalledWith('None of the above', 'इनमें से कोई नहीं');
    fireEvent.click(screen.getByRole('button', { name: 'Set option E to All of the above' }));
    expect(onAdd).toHaveBeenLastCalledWith('All of the above', 'उपर्युक्त सभी');
  });

  it('targets a blank last option rather than the next new one', () => {
    render(<OptionAddBar options={[...four, { id: 'e', text: '' }]} onAdd={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Add option F' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Set option E to None of the above' })).not.toBeNull();
  });

  it('does not treat a picture-only last option as blank', () => {
    render(
      <OptionAddBar options={[...four, { id: 'e', text: '' }]} optionImages={{ e: { url: 'x' } }} onAdd={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Set option F to None of the above' })).not.toBeNull();
  });

  it('disables a quick option already on the list', () => {
    render(<OptionAddBar options={[...four, { id: 'e', text: 'None of the above' }]} onAdd={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Set option F to None of the above' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Set option F to All of the above' })).toHaveProperty('disabled', false);
  });

  it('at eight options, still offers to fill a blank last one', () => {
    const eight = 'abcdefg'.split('').map((id) => ({ id, text: id }));
    render(<OptionAddBar options={[...eight, { id: 'h', text: '' }]} onAdd={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /^Add option/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Set option H to None of the above' })).not.toBeNull();
  });

  it('hides at eight filled options', () => {
    const eight = 'abcdefgh'.split('').map((id) => ({ id, text: id }));
    const { container } = render(<OptionAddBar options={eight} onAdd={vi.fn()} />);
    expect(container.textContent).toBe('');
  });
});
