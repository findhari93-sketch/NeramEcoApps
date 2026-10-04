import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { NexusQBQuestion } from '@neram/database';
import QuestionEditForm from './QuestionEditForm';

/**
 * The real zone uploads to storage and hands back a URL. Standing in for it
 * with two buttons keeps these tests about what the form does with that URL.
 */
vi.mock('../ImageUploadZone', () => ({
  default: ({ label, onChange }: { label: string; onChange: (img: unknown) => void }) => (
    <div>
      <button
        type="button"
        onClick={() => onChange({ url: `https://x/pasted-${label.charAt(7).toLowerCase()}.png`, uploaded: true })}
      >
        Paste {label}
      </button>
      <button type="button" onClick={() => onChange(undefined)}>
        Remove {label}
      </button>
    </div>
  ),
}));

/** A figure MCQ: option A already has its figure, B to D do not. */
const question = {
  id: 'q75',
  question_text: 'Identify the elevation',
  question_text_hi: null,
  question_format: 'MCQ',
  options: [
    { id: 'a', text: 'Figure A', image_url: 'https://x/a.png' },
    { id: 'b', text: 'Figure B' },
    { id: 'c', text: 'Figure C' },
  ],
  correct_answer: null,
  categories: [],
  difficulty: 'MEDIUM',
  exam_relevance: 'BOTH',
  display_order: 75,
  section: 'aptitude',
  status: 'draft',
  is_active: false,
} as unknown as NexusQBQuestion;

const getToken = async () => 'token';
const fetchMock = () => globalThis.fetch as ReturnType<typeof vi.fn>;
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string);

describe('QuestionEditForm per-figure Save', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers no figure Save until a figure changes', () => {
    render(<QuestionEditForm question={question} getToken={getToken} onSaved={() => {}} onCancel={() => {}} />);
    expect(screen.queryByRole('button', { name: /Save Figure/ })).toBeNull();
  });

  it('saves one pasted figure on its own, without the rest of the form', async () => {
    const onSaved = vi.fn();
    render(<QuestionEditForm question={question} getToken={getToken} onSaved={onSaved} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText('Question text'), { target: { value: 'Not saved yet' } });
    fireEvent.click(screen.getByRole('button', { name: 'Paste Option B image' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Figure B' }));

    await screen.findByText('Figure B saved');
    const [url, init] = fetchMock().mock.calls[0];
    expect(url).toBe('/api/question-bank/questions/q75/images');
    expect(init.method).toBe('PATCH');
    expect(bodyOf(fetchMock().mock.calls[0])).toEqual({ option_images: { b: 'https://x/pasted-b.png' } });
    // No refetch, which would re-seed the form and lose the unsaved stem.
    expect(onSaved).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Question text') as HTMLTextAreaElement).value).toBe('Not saved yet');
    // The question's own Save is still there for the end.
    expect(screen.getByRole('button', { name: 'Save question' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Save Figure B' })).toBeNull();
  });

  it('keeps each figure separate: B saved, C still waiting for its own Save', async () => {
    render(<QuestionEditForm question={question} getToken={getToken} onSaved={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Paste Option B image' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Figure B' }));
    await screen.findByText('Figure B saved');
    fireEvent.click(screen.getByRole('button', { name: 'Paste Option C image' }));
    expect(screen.getByRole('button', { name: 'Save Figure C' })).not.toBeNull();
    expect(screen.getByText('Figure B saved')).not.toBeNull();
  });

  it('shows a figure save failure beside that figure and keeps the button', async () => {
    fetchMock().mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Forbidden' }) });
    render(<QuestionEditForm question={question} getToken={getToken} onSaved={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Paste Option B image' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Figure B' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Forbidden');
    expect(screen.getByRole('button', { name: 'Save Figure B' })).not.toBeNull();
  });

  it('final Save question sends every figure, then refetches', async () => {
    const onSaved = vi.fn();
    render(<QuestionEditForm question={question} getToken={getToken} onSaved={onSaved} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Paste Option B image' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Figure B' }));
    await screen.findByText('Figure B saved');
    fireEvent.click(screen.getByRole('button', { name: 'Paste Option C image' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save question' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const last = fetchMock().mock.calls.at(-1)!;
    expect(last[0]).toBe('/api/question-bank/questions/q75');
    expect(bodyOf(last).options.map((o: { image_url?: string }) => o.image_url)).toEqual([
      'https://x/a.png',
      'https://x/pasted-b.png',
      'https://x/pasted-c.png',
    ]);
  });

  it('Ctrl+S walks the paste rhythm: Figure B, then Figure C, then the question', async () => {
    const onSaved = vi.fn();
    render(<QuestionEditForm question={question} getToken={getToken} onSaved={onSaved} onCancel={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Paste Option B image' }));
    expect(screen.getByText('Ctrl+S saves Figure B')).not.toBeNull();
    fireEvent.keyDown(document, { key: 's', ctrlKey: true });
    await screen.findByText('Figure B saved');
    expect(fetchMock().mock.calls[0][0]).toBe('/api/question-bank/questions/q75/images');
    expect(bodyOf(fetchMock().mock.calls[0])).toEqual({ option_images: { b: 'https://x/pasted-b.png' } });

    fireEvent.click(screen.getByRole('button', { name: 'Paste Option C image' }));
    fireEvent.keyDown(document, { key: 's', ctrlKey: true });
    await screen.findByText('Figure C saved');
    expect(bodyOf(fetchMock().mock.calls[1])).toEqual({ option_images: { c: 'https://x/pasted-c.png' } });
    expect(onSaved).not.toHaveBeenCalled();

    // Nothing waiting any more, so this one saves the question.
    expect(screen.getByText('Unsaved changes (Ctrl+S saves the question)')).not.toBeNull();
    fireEvent.keyDown(document, { key: 's', ctrlKey: true });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const last = fetchMock().mock.calls.at(-1)!;
    expect(last[0]).toBe('/api/question-bank/questions/q75');
    expect(bodyOf(last).options.map((o: { image_url?: string }) => o.image_url)).toEqual([
      'https://x/a.png',
      'https://x/pasted-b.png',
      'https://x/pasted-c.png',
    ]);
  });

  it('Ctrl+S with two figures waiting saves both in one request, so neither overwrites the other', async () => {
    render(<QuestionEditForm question={question} getToken={getToken} onSaved={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Paste Option B image' }));
    fireEvent.click(screen.getByRole('button', { name: 'Paste Option C image' }));
    expect(screen.getByText('Ctrl+S saves Figure B, C')).not.toBeNull();
    fireEvent.keyDown(document, { key: 's', metaKey: true });

    await screen.findByText('Figure C saved');
    expect(fetchMock().mock.calls).toHaveLength(1);
    expect(bodyOf(fetchMock().mock.calls[0])).toEqual({
      option_images: { b: 'https://x/pasted-b.png', c: 'https://x/pasted-c.png' },
    });
  });

  it('a removed figure is cleared, on its own Save and on the question Save', async () => {
    const onSaved = vi.fn();
    render(<QuestionEditForm question={question} getToken={getToken} onSaved={onSaved} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Option A image' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Figure A' }));
    await screen.findByText('Figure A saved');
    expect(bodyOf(fetchMock().mock.calls[0])).toEqual({ option_images: { a: null } });

    fireEvent.click(screen.getByRole('button', { name: 'Save question' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(bodyOf(fetchMock().mock.calls.at(-1)!).options[0].image_url).toBeUndefined();
  });

  it('a figure on an option added in this form waits for the question Save', () => {
    render(<QuestionEditForm question={question} getToken={getToken} onSaved={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Add option D/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Paste Option D image' }));
    expect(screen.queryByRole('button', { name: 'Save Figure D' })).toBeNull();
    expect(screen.getByText('New option: this figure is saved with the question')).not.toBeNull();
  });
});
