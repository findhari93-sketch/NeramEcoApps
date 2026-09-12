import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PasteLinkSheet, { type PasteLinkSheetProps } from './PasteLinkSheet';

/**
 * Pasting the link to a recording.
 *
 * A pasted OneDrive link used to end at a refusal ("Links to a personal
 * OneDrive are not accepted"), which left a teacher who has never used
 * SharePoint with nowhere to go. Now the refusal comes with the fix: Nexus
 * copies the video into the Neram library and uses the copy.
 */

function renderSheet(over: Partial<PasteLinkSheetProps> = {}) {
  const props: PasteLinkSheetProps = {
    open: true,
    label: 'English',
    busy: false,
    error: null,
    onClose: vi.fn(),
    onSubmit: vi.fn(),
    ...over,
  };
  render(<PasteLinkSheet {...props} />);
  return props;
}

describe('PasteLinkSheet', () => {
  it('says up front that a OneDrive video is copied into the library first', () => {
    renderSheet();
    expect(document.body.textContent).toContain('A OneDrive video is copied into the Neram library first.');
    expect(screen.queryByRole('button', { name: 'Copy to Neram library and use it' })).toBeNull();
  });

  it('offers to copy a pasted OneDrive video, instead of stopping at the refusal', () => {
    const onCopy = vi.fn();
    renderSheet({
      copyOffer: { message: '"English 2026 Hari History of Architecture.mp4" is in a personal OneDrive.' },
      onCopy,
    });
    expect(document.body.textContent).toContain('is in a personal OneDrive');
    fireEvent.click(screen.getByRole('button', { name: 'Copy to Neram library and use it' }));
    expect(onCopy).toHaveBeenCalled();
  });

  it('drops the offer once the link is changed, since it was for the old link', () => {
    const onEdit = vi.fn();
    renderSheet({ copyOffer: { message: 'In a personal OneDrive.' }, onCopy: vi.fn(), onEdit });
    fireEvent.change(screen.getByLabelText('SharePoint link'), { target: { value: 'https://neram.sharepoint.com/x.mp4' } });
    expect(onEdit).toHaveBeenCalled();
  });
});
