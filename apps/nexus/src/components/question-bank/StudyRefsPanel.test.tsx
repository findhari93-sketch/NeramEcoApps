import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { QBQuestionStudyView } from '@neram/database';
import StudyRefsPanel, { foundationHref, ncertLabel } from './StudyRefsPanel';
import { chapterChips } from './QuestionDetail';

const functions = {
  ref: 'c11.2.4',
  class_level: 11,
  chapter_no: 2,
  chapter_title: 'Relations and Functions',
  section_no: '2.4',
  section_title: 'Functions',
  url: 'https://ncert.nic.in/textbook/pdf/kemh102.pdf',
};

// The founder's class example: a domain question that was filed under Trigonometry.
const study: QBQuestionStudyView = {
  source: 'ai',
  primary: { slug: 'functions', label: 'Functions', ncert: [functions] },
  also_uses: [{ slug: 'trigonometry', label: 'Trigonometry', ncert: [] }],
  concepts: [
    { name: 'Domain of a function', why: 'Each square root needs a non-negative argument', ncert: functions, foundation: null },
    {
      name: 'English bond',
      why: null,
      ncert: null,
      foundation: { chapter_id: 'ch6', chapter_number: 6, chapter_title: 'Building Materials', section_id: 's2', section_title: 'Brick Cuts and Brick Bonds' },
    },
  ],
};

describe('StudyRefsPanel', () => {
  it('stays behind a button until the student asks, before an answer', () => {
    render(<StudyRefsPanel study={study} submitted={false} />);
    expect(screen.queryByText('What to study')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /what this question needs/i }));
    expect(screen.getByText('What to study')).toBeTruthy();
  });

  it('opens after an answer with the chapter, the chapters it leans on, and the readings', () => {
    render(<StudyRefsPanel study={study} submitted />);

    expect(screen.getByText('Functions', { selector: 'p' })).toBeTruthy();
    expect(screen.getByText('Trigonometry')).toBeTruthy();
    const ncert = screen.getAllByRole('link', { name: /NCERT Class 11 · Ch 2 Relations and Functions, 2.4 Functions, opens in a new tab/ });
    expect(ncert[0].getAttribute('href')).toBe(functions.url);
    expect(ncert[0].getAttribute('target')).toBe('_blank');

    const foundation = screen.getByRole('link', { name: 'Foundation Ch 6 · Brick Cuts and Brick Bonds' });
    expect(foundation.getAttribute('href')).toMatch(/^\/student\/foundation\/ch6\?section=s2/);
  });

  it('renders nothing without study data', () => {
    const { container } = render(<StudyRefsPanel study={null} submitted />);
    expect(container.innerHTML).toBe('');
  });

  it('tells the student when a chapter goes beyond NCERT', () => {
    render(
      <StudyRefsPanel
        submitted
        study={{
          source: 'chapter',
          primary: { slug: 'properties_of_triangles', label: 'Properties of Triangles', ncert: [{ ...functions, beyond_ncert: true }] },
          also_uses: [],
          concepts: [],
        }}
      />,
    );
    expect(screen.getByText(/beyond the current NCERT book/)).toBeTruthy();
  });
});

describe('labels', () => {
  it('formats NCERT and Foundation references', () => {
    expect(ncertLabel({ ...functions, section_no: null, section_title: null })).toBe('Class 11 · Ch 2 Relations and Functions');
    expect(
      foundationHref({ chapter_id: 'c', chapter_number: 1, chapter_title: 't', section_id: 's', section_title: 'x' }, '/student/question-bank/questions?qid=1'),
    ).toBe('/student/foundation/c?section=s&back=%2Fstudent%2Fquestion-bank%2Fquestions%3Fqid%3D1');
  });

  it('drops the broad subject chip beside a chapter', () => {
    expect(chapterChips(['mathematics', 'functions'])).toEqual(['functions']);
    expect(chapterChips(['aptitude'])).toEqual(['aptitude']);
  });
});
