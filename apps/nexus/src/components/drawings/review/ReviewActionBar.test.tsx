import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReviewActionBar, { type ReviewActionBarProps } from './ReviewActionBar';

const props = (over: Partial<ReviewActionBarProps> = {}): ReviewActionBarProps => ({
  isEditMode: true,
  isSuperseded: false,
  attemptIndex: 1,
  attemptTotal: 1,
  statusLabel: 'Submitted',
  alreadyReviewed: false,
  onEvaluate: vi.fn(),
  onOpenLatest: null,
  onSaveDraft: vi.fn(),
  draftSaving: false,
  draftSaved: false,
  onRedo: vi.fn(),
  onComplete: vi.fn(),
  saving: false,
  pendingAction: 'complete',
  voiceBusy: false,
  mode: 'owed',
  canRedo: true,
  onNext: null,
  ...over,
});

describe('ReviewActionBar', () => {
  it('keeps the owed bar: draft, redo, complete, and no Next', () => {
    render(<ReviewActionBar {...props()} />);
    expect(screen.getByRole('button', { name: 'Redo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Complete' })).toBeTruthy();
    expect(screen.getAllByTitle('Save draft').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });

  it('gives a sketch Next and Send review, with no redo and no draft', () => {
    const onNext = vi.fn();
    render(<ReviewActionBar {...props({ mode: 'practice', canRedo: false, onNext })} />);
    expect(screen.queryByRole('button', { name: 'Redo' })).toBeNull();
    expect(screen.queryAllByTitle('Save draft')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onNext).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Send review' })).toBeTruthy();
  });

  it('says Update review once practice has a review', () => {
    render(<ReviewActionBar {...props({ mode: 'practice', canRedo: false, onNext: vi.fn(), alreadyReviewed: true })} />);
    expect(screen.getByRole('button', { name: 'Update review' })).toBeTruthy();
  });

  it('keeps Next on a locked practice drawing', () => {
    render(<ReviewActionBar {...props({ mode: 'practice', canRedo: false, onNext: vi.fn(), isEditMode: false, statusLabel: 'Completed' })} />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Evaluate' })).toBeTruthy();
  });

  it('keeps the locked owed bar Next-free', () => {
    render(<ReviewActionBar {...props({ isEditMode: false, statusLabel: 'Completed' })} />);
    expect(screen.getByRole('button', { name: 'Evaluate' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });

  it('renders the Inspiration slot where the gallery switch was', () => {
    render(<ReviewActionBar {...props({ inspirationSlot: <span>slot here</span> })} />);
    expect(screen.getByText('slot here')).toBeTruthy();
  });
});
