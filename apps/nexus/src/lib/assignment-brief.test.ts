import { describe, it, expect } from 'vitest';
import { parseAssignmentBrief } from './assignment-brief';

/** The real brief from assignment 85a1dd5d, verbatim. */
const REAL_BRIEF = `Q1. Prove that the Triangle is Isosceles (5 Marks)

Using the distance formula, prove that the triangle with vertices

A(2, 1), B(6, 5), C(2, 9)

is an isosceles triangle.

Q2. Find the Missing Coordinate (5 Marks)

Find the value of k such that the points

A(2, 3), B(5, 7), C(k, 11)

are collinear.

Q3. Find the Area of a Triangle (5 Marks)

Find the area of the triangle whose vertices are

A(-2, 1), B(4, 5), C(6, -1).

Q4. Find the Area of the Trapezium (5 Marks)

Find the area of the trapezium with vertices

A(0, 0), B(8, 0), C(6, 4), D(2, 4).

Submission Guidelines
Write the solutions neatly on A4 sheets.
Mention Name, Roll Number, and Date on the first page.
Scan all pages into one PDF file.
Upload the PDF before the next class.`;

describe('parseAssignmentBrief', () => {
  describe('the real coordinate geometry brief', () => {
    const brief = parseAssignmentBrief(REAL_BRIEF);

    it('finds all four questions', () => {
      expect(brief.questions).toHaveLength(4);
      expect(brief.questions.map((q) => q.label)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    });

    it('lifts the marks out of each heading and totals them', () => {
      expect(brief.questions.map((q) => q.marks)).toEqual([5, 5, 5, 5]);
      expect(brief.totalMarks).toBe(20);
    });

    it('strips the mark value from the title', () => {
      expect(brief.questions[0].title).toBe('Prove that the Triangle is Isosceles');
      expect(brief.questions[3].title).toBe('Find the Area of the Trapezium');
    });

    it('keeps each question body with its own question', () => {
      expect(brief.questions[1].body).toContain('A(2, 3), B(5, 7), C(k, 11)');
      expect(brief.questions[1].body).toContain('are collinear');
      // The coordinate lines must not leak into a neighbouring question.
      expect(brief.questions[0].body).not.toContain('collinear');
    });

    it('does not mistake a coordinate line for a heading', () => {
      // "A(-2, 1), B(4, 5), C(6, -1)." is the shape most likely to be misread.
      expect(brief.questions[2].body).toContain('A(-2, 1), B(4, 5), C(6, -1).');
    });

    it('pulls the submission rules out as their own list', () => {
      expect(brief.guidelines).toEqual([
        'Write the solutions neatly on A4 sheets.',
        'Mention Name, Roll Number, and Date on the first page.',
        'Scan all pages into one PDF file.',
        'Upload the PDF before the next class.',
      ]);
    });

    it('reports itself as structured', () => {
      expect(brief.structured).toBe(true);
    });
  });

  describe('heading shapes', () => {
    it('accepts Q1) and Question 1: as well as Q1.', () => {
      const brief = parseAssignmentBrief('Q1) First\nbody\nQuestion 2: Second\nbody');
      expect(brief.questions.map((q) => q.label)).toEqual(['Q1', 'Q2']);
      expect(brief.questions[1].title).toBe('Second');
    });

    it('accepts marks in brackets or after a dash', () => {
      const brief = parseAssignmentBrief('Q1. One [3 marks]\nQ2. Two - 4 Marks\nQ3. Three (1 mark)');
      expect(brief.questions.map((q) => q.marks)).toEqual([3, 4, 1]);
      expect(brief.questions[1].title).toBe('Two');
    });

    it('falls back to bare numbering only when no Q headings exist', () => {
      const brief = parseAssignmentBrief('1. First\nbody\n2. Second\nbody');
      expect(brief.questions).toHaveLength(2);
    });

    it('ignores bare numbering when Q headings are present', () => {
      // "2." here is a step inside Q1, not a second question.
      const brief = parseAssignmentBrief('Q1. Only question\n1. do this\n2. then this');
      expect(brief.questions).toHaveLength(1);
      expect(brief.questions[0].body).toContain('2. then this');
    });

    it('never lets numbered guidelines become questions', () => {
      const brief = parseAssignmentBrief(
        'Do all the work.\n\nGuidelines\n1. Use A4 sheets.\n2. Scan to one PDF.',
      );
      expect(brief.questions).toHaveLength(0);
      expect(brief.guidelines).toEqual(['Use A4 sheets.', 'Scan to one PDF.']);
    });

    it('strips bullet characters from guideline lines', () => {
      const brief = parseAssignmentBrief('Instructions\n- One\n* Two\n• Three');
      expect(brief.guidelines).toEqual(['One', 'Two', 'Three']);
    });
  });

  describe('text it should leave alone', () => {
    it('reports unstructured prose so the caller renders it untouched', () => {
      const brief = parseAssignmentBrief('Read chapter 4 and bring your questions to class.');
      expect(brief.structured).toBe(false);
      expect(brief.questions).toHaveLength(0);
      expect(brief.intro).toBe('Read chapter 4 and bring your questions to class.');
    });

    it('handles empty, null and whitespace input', () => {
      for (const value of ['', '   \n  ', null, undefined]) {
        const brief = parseAssignmentBrief(value);
        expect(brief.structured).toBe(false);
        expect(brief.questions).toHaveLength(0);
      }
    });

    it('keeps intro text that precedes the first question', () => {
      const brief = parseAssignmentBrief('Answer all questions.\n\nQ1. First (2 Marks)\nbody');
      expect(brief.intro).toBe('Answer all questions.');
      expect(brief.questions).toHaveLength(1);
    });

    it('leaves totalMarks null when no question states any', () => {
      expect(parseAssignmentBrief('Q1. First\nQ2. Second').totalMarks).toBeNull();
    });

    it('survives Windows line endings', () => {
      const brief = parseAssignmentBrief('Q1. First (2 Marks)\r\nbody\r\nQ2. Second (3 Marks)');
      expect(brief.questions).toHaveLength(2);
      expect(brief.totalMarks).toBe(5);
    });
  });
});
