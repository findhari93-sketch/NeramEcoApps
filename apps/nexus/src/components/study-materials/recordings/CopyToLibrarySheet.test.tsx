import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CopyToLibrarySheet, { type CopyToLibrarySheetProps } from './CopyToLibrarySheet';

/**
 * "Copy into the Neram library?", then the copy running, then what went wrong.
 *
 * The teachers whose recordings sat in OneDrive had never used SharePoint. This
 * sheet is the whole of what they see of the move: where the file goes, that the
 * original stays, that nothing students did is lost, and how far it has got.
 */

const DESTINATION = 'NeramStorage › nexus › class-videos › Ch 1 History Of Architecture';

function renderSheet(over: Partial<CopyToLibrarySheetProps> = {}) {
  const props: CopyToLibrarySheetProps = {
    open: true,
    label: 'தமிழ்',
    file: { name: '1.History of Architecture.mp4', sizeBytes: 877174153, durationSeconds: 3758 },
    destination: DESTINATION,
    keepsCheckpoints: true,
    status: { phase: 'confirm' },
    onClose: vi.fn(),
    onCopy: vi.fn(),
    onChooseAnother: vi.fn(),
    ...over,
  };
  render(<CopyToLibrarySheet {...props} />);
  return props;
}

describe('CopyToLibrarySheet', () => {
  it('says which file is copied, where it goes, and what stays as it is', () => {
    const props = renderSheet();
    const text = document.body.textContent || '';
    expect(text).toContain('Copy into the Neram library?');
    expect(text).toContain('1.History of Architecture.mp4');
    expect(text).toContain('1:02:38');
    expect(text).toContain(DESTINATION);
    expect(text).toContain('The original stays where it is.');
    expect(text).toContain('Checkpoints and student progress are kept.');

    fireEvent.click(screen.getByRole('button', { name: 'Copy video' }));
    expect(props.onCopy).toHaveBeenCalled();
  });

  it('does not promise kept checkpoints for a language that has no recording yet', () => {
    renderSheet({ keepsCheckpoints: false });
    expect(document.body.textContent).not.toContain('Checkpoints and student progress are kept.');
  });

  it('cannot be pressed twice while the copy is starting', () => {
    renderSheet({ status: { phase: 'starting' } });
    const button = screen.getByRole('button', { name: /Starting the copy/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows how far the copy has got, in words and on the bar', () => {
    const props = renderSheet({ status: { phase: 'copying', percent: 42 } });
    expect(document.body.textContent).toContain('Copying 837 MB into the Neram library... 42%');
    expect(document.body.textContent).toContain('the copy still finishes');
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('42');

    fireEvent.click(screen.getByRole('button', { name: 'Hide progress' }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('shows a running copy without a percent before Microsoft reports one', () => {
    renderSheet({ status: { phase: 'copying', percent: null } });
    expect(document.body.textContent).toContain('Copying 837 MB into the Neram library...');
    expect(document.body.textContent).not.toContain('null');
  });

  it('says what went wrong, and offers to try again or choose another video', () => {
    const props = renderSheet({
      status: { phase: 'failed', message: 'The Neram library is out of space. Ask an admin to free some up.' },
    });
    expect(document.body.textContent).toContain('out of space');

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(props.onCopy).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Choose another video' }));
    expect(props.onChooseAnother).toHaveBeenCalled();
  });
});
