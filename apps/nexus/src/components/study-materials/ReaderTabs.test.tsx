import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ReaderTabs from './ReaderTabs';

/**
 * The phone tab row in the chapter viewer. Slides add two choices to one row
 * instead of a second row of tabs, and a chapter without slides looks exactly
 * as it did.
 */

const labels = () => screen.getAllByRole('button').map((b) => (b.textContent || '').trim());

describe('ReaderTabs', () => {
  it('offers PDF, Slides, Notes and Comments when the chapter has slides', () => {
    render(<ReaderTabs value="pdf" onChange={() => {}} hasSlides kind="pdf" />);
    expect(labels()).toEqual(['PDF', 'Slides', 'Notes', 'Comments']);
  });

  it('keeps Document, Notes and Comments when it has none', () => {
    render(<ReaderTabs value="pdf" onChange={() => {}} hasSlides={false} kind="pdf" />);
    expect(labels()).toEqual(['Document', 'Notes', 'Comments']);
  });

  it('never calls an image a PDF', () => {
    render(<ReaderTabs value="pdf" onChange={() => {}} hasSlides kind="image" />);
    expect(labels()[0]).toBe('Document');
  });

  it('marks the view on screen as pressed', () => {
    render(<ReaderTabs value="slides" onChange={() => {}} hasSlides kind="pdf" />);
    expect(screen.getByRole('button', { name: 'Slides' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'PDF' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('reports the tab a student presses', () => {
    const onChange = vi.fn();
    render(<ReaderTabs value="pdf" onChange={onChange} hasSlides kind="pdf" />);
    fireEvent.click(screen.getByRole('button', { name: 'Slides' }));
    expect(onChange).toHaveBeenCalledWith('slides');
  });

  it('ignores a press on the tab already showing', () => {
    const onChange = vi.fn();
    render(<ReaderTabs value="pdf" onChange={onChange} hasSlides kind="pdf" />);
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
