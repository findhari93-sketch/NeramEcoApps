import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { NexusQBQuestionStudy, QBStudyEditorData } from '@neram/database';
import StudyEditor, { statusLine } from './StudyEditor';

const row = (over: Partial<NexusQBQuestionStudy> = {}): NexusQBQuestionStudy => ({
  question_id: 'q1',
  primary_slug: 'functions',
  also_uses: ['trigonometric_ratios'],
  concepts: [{ name: 'Domain of a function', why: 'Roots must be defined', ncert_ref: 'c11.2.4' }],
  source: 'ai',
  model: 'claude-opus-5-5',
  confidence: 0.72,
  rationale: 'The answer depends on where the square roots are defined',
  reviewed_by: null,
  reviewed_at: null,
  created_at: '',
  updated_at: '',
  ...over,
});

const data = (r: NexusQBQuestionStudy | null): QBStudyEditorData => ({
  row: r,
  categories: ['mathematics', 'trigonometry'],
  chapters: [
    { slug: 'functions', label: 'Functions', group: 'Algebra' },
    { slug: 'trigonometric_ratios', label: 'Trigonometric Ratios & Identities', group: 'Trigonometry' },
  ],
  ncert: [{ ref: 'c11.2.4', label: 'Class 11 · Ch 2 Relations and Functions, 2.4 Functions' }],
  foundation: [],
});

describe('statusLine', () => {
  it('says who wrote it and whether students see it', () => {
    expect(statusLine(null)).toMatch(/Not set yet/);
    expect(statusLine(row())).toBe('Suggested by AI, 72% sure. Save to approve it for students.');
    expect(statusLine(row({ reviewed_at: 'x' }))).toMatch(/approved\. Students see this/);
    expect(statusLine(row({ source: 'staff' }))).toBe('Written by a teacher. Students see this.');
  });
});

describe('StudyEditor', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads only when opened, then saves and hands back the new categories', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: data(row()) }) });
    const onCategoriesChange = vi.fn();
    render(<StudyEditor questionId="q1" isMath getToken={async () => 't'} onCategoriesChange={onCategoriesChange} />);
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('What to study'));
    await screen.findByDisplayValue('Domain of a function');
    expect(screen.getByDisplayValue('Functions')).toBeTruthy();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { ...data(row({ source: 'staff' })), categories: ['functions', 'mathematics'] } }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save and approve' }));

    await waitFor(() => expect(onCategoriesChange).toHaveBeenCalledWith(['functions', 'mathematics']));
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/question-bank/questions/q1/study');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({
      primary_slug: 'functions',
      also_uses: ['trigonometric_ratios'],
      concepts: [{ name: 'Domain of a function', why: 'Roots must be defined', ncert_ref: 'c11.2.4', foundation_section_id: null }],
    });
    expect(await screen.findByText('Saved. Students see this now.')).toBeTruthy();
  });

  it('shows a load failure instead of an empty form', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Forbidden' }) });
    render(<StudyEditor questionId="q1" isMath getToken={async () => 't'} />);
    fireEvent.click(screen.getByText('What to study'));
    expect(await screen.findByText('Forbidden')).toBeTruthy();
  });
});
