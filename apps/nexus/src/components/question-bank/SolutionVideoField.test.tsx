import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SolutionVideoField from './SolutionVideoField';

/**
 * One question's solution-video link.
 *
 * The field has to tell a teacher, before Save, whether what they pasted is a
 * video students can play, and let them open it to check it is the right one.
 */

const LABEL = 'Video for question 31';

describe('SolutionVideoField', () => {
  it('offers to open a valid link in a new tab, so the teacher can check it', () => {
    render(<SolutionVideoField label={LABEL} value="https://youtu.be/U1X9MmLh-ZQ" onChange={vi.fn()} />);
    const open = screen.getByRole('link', { name: 'Open the video for question 31 in a new tab' });
    expect(open.getAttribute('href')).toBe('https://www.youtube.com/watch?v=U1X9MmLh-ZQ');
    expect(open.getAttribute('target')).toBe('_blank');
    expect(screen.getByRole('img', { name: 'Preview of the video for question 31' })).not.toBeNull();
  });

  it('says a link is not a video once the teacher leaves the field', () => {
    render(<SolutionVideoField label={LABEL} value="abc123" onChange={vi.fn()} />);
    const input = screen.getByLabelText(LABEL);
    fireEvent.focus(input);
    expect(screen.queryByText('Not a YouTube or SharePoint link')).toBeNull();
    fireEvent.blur(input);
    expect(screen.getByText('Not a YouTube or SharePoint link')).not.toBeNull();
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('clears the link from its own button', () => {
    const onChange = vi.fn();
    render(<SolutionVideoField label={LABEL} value="https://youtu.be/U1X9MmLh-ZQ" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear the video link for question 31' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('moves on with Enter, so a run of pastes needs no mouse', () => {
    const onEnter = vi.fn();
    render(<SolutionVideoField label={LABEL} value="" onChange={vi.fn()} onEnter={onEnter} />);
    fireEvent.keyDown(screen.getByLabelText(LABEL), { key: 'Enter' });
    expect(onEnter).toHaveBeenCalled();
  });

  it('hands a paste of several links to the matcher instead of stuffing one field', () => {
    const onBulkPaste = vi.fn();
    const onChange = vi.fn();
    render(<SolutionVideoField label={LABEL} value="" onChange={onChange} onBulkPaste={onBulkPaste} />);
    const text = 'Q no 2\nhttps://youtu.be/xrKukhHIt0A\nQ no 4\nhttps://youtu.be/J9rHcdRPslM';
    fireEvent.paste(screen.getByLabelText(LABEL), { clipboardData: { getData: () => text } });
    expect(onBulkPaste).toHaveBeenCalledWith(text);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('lets a single pasted link land in the field as usual', () => {
    const onBulkPaste = vi.fn();
    render(<SolutionVideoField label={LABEL} value="" onChange={vi.fn()} onBulkPaste={onBulkPaste} />);
    fireEvent.paste(screen.getByLabelText(LABEL), {
      clipboardData: { getData: () => 'https://youtu.be/xrKukhHIt0A' },
    });
    expect(onBulkPaste).not.toHaveBeenCalled();
  });

  it('shows what Save will do to the row', () => {
    const { rerender } = render(
      <SolutionVideoField label={LABEL} value="https://youtu.be/U1X9MmLh-ZQ" onChange={vi.fn()} status="unsaved" />,
    );
    expect(screen.getByText('Unsaved')).not.toBeNull();
    rerender(<SolutionVideoField label={LABEL} value="" onChange={vi.fn()} status="removing" />);
    expect(screen.getByText('Unsaved: the video will be removed')).not.toBeNull();
  });

  it('puts a server refusal under the field', () => {
    render(
      <SolutionVideoField
        label={LABEL}
        value="https://youtu.be/U1X9MmLh-ZQ"
        onChange={vi.fn()}
        errorText="This question is not on this paper"
      />,
    );
    expect(screen.getByText('This question is not on this paper')).not.toBeNull();
  });
});
