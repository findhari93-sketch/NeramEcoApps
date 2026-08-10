import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { NexusQBQuestion } from '@neram/database';
import QuestionEditForm from './QuestionEditForm';

const question = {
  id: 'q1',
  question_text: 'If $c = 1$ then',
  question_text_hi: null,
  question_format: 'MCQ',
  options: [
    { id: 'a', text: '$c = 1$' },
    { id: 'b', text: '$c = 2$' },
  ],
  correct_answer: 'a',
  categories: ['algebra'],
  difficulty: 'MEDIUM',
  exam_relevance: 'BOTH',
  display_order: 1,
  section: 'math_mcq',
  status: 'active',
  is_active: true,
} as unknown as NexusQBQuestion;

describe('QuestionEditForm', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const getToken = async () => 'token';

  it('loads the question into the form', () => {
    render(<QuestionEditForm question={question} getToken={getToken} onSaved={() => {}} onCancel={() => {}} />);
    expect((screen.getByLabelText('Question text') as HTMLTextAreaElement).value).toBe('If $c = 1$ then');
  });

  it('saves an edited stem to the question endpoint', async () => {
    const onSaved = vi.fn();
    render(<QuestionEditForm question={question} getToken={getToken} onSaved={onSaved} onCancel={() => {}} />);

    fireEvent.change(screen.getByLabelText('Question text'), { target: { value: 'If $c = 5$ then' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/question-bank/questions/q1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body).question_text).toBe('If $c = 5$ then');
  });

  it('keeps Save disabled until something changes, so a stray click cannot rewrite a question', () => {
    render(<QuestionEditForm question={question} getToken={getToken} onSaved={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole('button', { name: /Save/ })).toHaveProperty('disabled', true);
  });

  it('sends the chosen option id as the correct answer', async () => {
    const onSaved = vi.fn();
    render(<QuestionEditForm question={question} getToken={getToken} onSaved={onSaved} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('radio', { name: /Mark option B correct/i }));
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body).correct_answer).toBe('b');
  });

  /**
   * Not in the plan. The plan's props dropped the `paper` fallback, which is the
   * fix that stopped every paper's questions reading 'NATA' whatever exam they
   * came from. Extracting without it would quietly reintroduce that.
   */
  it('falls back to the paper for the exam when the question has no source row', () => {
    render(
      <QuestionEditForm
        question={question}
        paper={{ exam_type: 'JEE_PAPER_2', year: 2026, session: null }}
        getToken={getToken}
        onSaved={() => {}}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Source & Format/i }));
    expect((screen.getByLabelText('Year') as HTMLInputElement).value).toBe('2026');
    expect((screen.getByLabelText('Exam Type') as HTMLInputElement).value).not.toBe('Not recorded');
  });
});

describe('QuestionEditForm compactness', () => {
  const getToken = async () => 'token';

  it('hides the Hindi fields behind a toggle, since they are empty on most papers', () => {
    render(<QuestionEditForm question={question} getToken={getToken} onSaved={() => {}} onCancel={() => {}} />);
    expect(screen.queryByLabelText('Question text (Hindi)')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Add Hindi/i }));
    expect(screen.getByLabelText('Question text (Hindi)')).not.toBeNull();
  });

  it('shows the Hindi fields straight away when the question already has Hindi', () => {
    const hindi = { ...question, question_text_hi: 'हिंदी' } as NexusQBQuestion;
    render(<QuestionEditForm question={hindi} getToken={getToken} onSaved={() => {}} onCancel={() => {}} />);
    expect(screen.getByLabelText('Question text (Hindi)')).not.toBeNull();
  });

  it('collapses the image dropzone to a button when the question needs no image', () => {
    render(<QuestionEditForm question={question} getToken={getToken} onSaved={() => {}} onCancel={() => {}} />);
    expect(screen.queryByText('Paste or drop question image')).toBeNull();
    expect(screen.getByRole('button', { name: /Add image/i })).not.toBeNull();
  });

  it('opens the dropzone for a question that references a figure', () => {
    const figure = { ...question, question_text: 'Which one of the answer figures shown below' } as NexusQBQuestion;
    render(<QuestionEditForm question={figure} getToken={getToken} onSaved={() => {}} onCancel={() => {}} />);
    expect(screen.getByText('Paste or drop question image')).not.toBeNull();
  });

  it('typesets the stem and each option while editing', () => {
    const { container } = render(
      <QuestionEditForm question={question} getToken={getToken} onSaved={() => {}} onCancel={() => {}} />,
    );
    expect(container.querySelectorAll('[data-testid="math-preview"]').length).toBeGreaterThanOrEqual(3);
  });
});

describe('QuestionEditForm section control', () => {
  it('saves a section change immediately, on its own endpoint', async () => {
    const onChangeSection = vi.fn().mockResolvedValue(undefined);
    render(
      <QuestionEditForm question={question} getToken={async () => 'token'}
        onSaved={() => {}} onCancel={() => {}} onChangeSection={onChangeSection} />,
    );
    fireEvent.mouseDown(screen.getByLabelText('Section for question 1'));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Aptitude'));
    await waitFor(() => expect(onChangeSection).toHaveBeenCalledWith('q1', 'aptitude'));
    // and it did not join the form's dirty state
    expect(screen.getByRole('button', { name: /Save/ })).toHaveProperty('disabled', true);
  });

  it('hides the section control when the caller does not offer one', () => {
    render(<QuestionEditForm question={question} getToken={async () => 'token'} onSaved={() => {}} onCancel={() => {}} />);
    expect(screen.queryByLabelText('Section for question 1')).toBeNull();
  });
});
