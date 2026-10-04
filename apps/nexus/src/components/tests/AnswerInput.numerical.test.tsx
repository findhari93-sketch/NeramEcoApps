import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AnswerInput from './AnswerInput';

/**
 * The numerical answer box. A phone's decimal keyboard has no / or √, and
 * students do not know LaTeX, so the keypad under the box is how a fraction or
 * a root gets typed at all.
 */

function Harness({ initial = '', onChange }: { initial?: string; onChange?: (v: string) => void }) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <AnswerInput
      question={{ question_id: 'q1', question_format: 'NUMERICAL', options: null }}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

describe('AnswerInput for a numerical question', () => {
  it('offers the maths keys, each with a name', () => {
    render(<Harness />);
    for (const name of ['Fraction', 'Square root', 'Pi', 'Power', 'Open bracket', 'Close bracket', 'Minus', 'Delete']) {
      expect(screen.getByRole('button', { name })).not.toBeNull();
    }
  });

  it('types a fraction at the cursor', () => {
    const onChange = vi.fn();
    render(<Harness initial="34" onChange={onChange} />);
    const input = screen.getByLabelText('Your numerical answer') as HTMLInputElement;
    input.setSelectionRange(1, 1);
    fireEvent.click(screen.getByRole('button', { name: 'Fraction' }));
    expect(onChange).toHaveBeenLastCalledWith('3/4');
  });

  it('opens a root with its brackets', () => {
    const onChange = vi.fn();
    render(<Harness initial="2" onChange={onChange} />);
    const input = screen.getByLabelText('Your numerical answer') as HTMLInputElement;
    input.setSelectionRange(1, 1);
    fireEvent.click(screen.getByRole('button', { name: 'Square root' }));
    expect(onChange).toHaveBeenLastCalledWith('2√()');
  });

  it('shows how a formula reads, with its value', () => {
    render(<Harness initial="2√(3)" />);
    expect(screen.getByText('Reads as')).not.toBeNull();
    expect(screen.getByText(/≈ 3\.4641/)).not.toBeNull();
  });

  it('says nothing extra under a plain number', () => {
    render(<Harness initial="42" />);
    expect(screen.queryByText('Reads as')).toBeNull();
  });

  it('flags an answer it cannot read, without blocking it', () => {
    render(<Harness initial="(3" />);
    expect(screen.getByText(/does not read as a number yet/)).not.toBeNull();
    expect((screen.getByLabelText('Your numerical answer') as HTMLInputElement).disabled).toBe(false);
  });
});
