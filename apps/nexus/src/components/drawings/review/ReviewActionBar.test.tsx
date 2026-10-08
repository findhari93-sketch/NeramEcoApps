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

  it('gives an untouched sketch one button, Skip, with no redo, no draft and no send', () => {
    const onNext = vi.fn();
    render(<ReviewActionBar {...props({ mode: 'practice', canRedo: false, onNext })} />);
    expect(screen.queryByRole('button', { name: 'Redo' })).toBeNull();
    expect(screen.queryAllByTitle('Save draft')).toHaveLength(0);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onNext).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Send/ })).toBeNull();
  });

  it('calls it Next on a sketch the student already has a review of', () => {
    render(<ReviewActionBar {...props({ mode: 'practice', canRedo: false, onNext: vi.fn(), alreadyReviewed: true })} />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Update/ })).toBeNull();
  });

  it('makes Send & next the main button once something changed, and keeps a quiet Skip', () => {
    const onNext = vi.fn();
    const onComplete = vi.fn();
    render(<ReviewActionBar {...props({ mode: 'practice', canRedo: false, onNext, onComplete, hasChanges: true })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send & next' }));
    expect(onComplete).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Skip without sending' }));
    expect(onNext).toHaveBeenCalled();
  });

  it('says Update & next when changing a review the student already has', () => {
    render(<ReviewActionBar {...props({ mode: 'practice', canRedo: false, onNext: vi.fn(), alreadyReviewed: true, hasChanges: true })} />);
    expect(screen.getByRole('button', { name: 'Update & next' })).toBeTruthy();
  });

  it('holds both while a voice note is still saving', () => {
    render(<ReviewActionBar {...props({ mode: 'practice', canRedo: false, onNext: vi.fn(), hasChanges: true, voiceBusy: true })} />);
    expect((screen.getByRole('button', { name: 'Send & next' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Skip without sending' }) as HTMLButtonElement).disabled).toBe(true);
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

  it('carries no Inspiration control: the bar only holds what waits for the send', () => {
    render(<ReviewActionBar {...props({ mode: 'practice', canRedo: false, onNext: vi.fn() })} />);
    expect(screen.queryByText(/Inspiration/)).toBeNull();
  });
});
