import { describe, it, expect } from 'vitest';
import {
  applicationGaps,
  applicationSummary,
  draftToSubmitBody,
  normaliseAnswers,
  programmeOfDuration,
  type ApplicationRow,
} from './application';

const NOW = new Date('2026-10-20T06:00:00Z');

const COMPLETE: ApplicationRow = {
  id: 'draft-1',
  status: 'draft',
  first_name: 'Priya Kumar',
  father_name: 'Kumar S',
  phone: '9876543210',
  email: 'priya@example.com',
  date_of_birth: '2009-05-14',
  country: 'IN',
  pincode: '600020',
  city: 'Chennai',
  district: 'Chennai',
  state: 'Tamil Nadu',
  applicant_category: 'school_student',
  academic_data: { current_class: '11', school_name: 'DAV School', board: 'cbse' },
  target_exam_year: 2028,
  interest_course: 'nata',
  fee_structure_id: 'fs-1y',
  fee_source: 'standard',
  learning_mode: 'hybrid',
};

describe('normaliseAnswers', () => {
  it('turns chat answers into the form columns', () => {
    const { patch, rejected } = normaliseAnswers(
      { student_name: '  Priya   Kumar ', father_name: 'Kumar S', currently_in: 'class_11', school_name: 'DAV School', board: 'CBSE', exam_year: 2028, course: 'nata' },
      null,
      NOW,
    );
    expect(rejected).toEqual({});
    expect(patch).toEqual({
      first_name: 'Priya Kumar',
      father_name: 'Kumar S',
      applicant_category: 'school_student',
      academic_data: { current_class: '11', school_name: 'DAV School', board: 'cbse' },
      target_exam_year: 2028,
      interest_course: 'nata',
    });
  });

  it('adds to the studies already saved instead of replacing them', () => {
    const saved: ApplicationRow = { applicant_category: 'school_student', academic_data: { current_class: '12' } };
    expect(normaliseAnswers({ school_name: 'KV Tambaram' }, saved, NOW).patch.academic_data).toEqual({ current_class: '12', school_name: 'KV Tambaram' });
  });

  it('clears the old studies when they turn out to be a different kind of student', () => {
    const saved: ApplicationRow = { applicant_category: 'school_student', academic_data: { current_class: '12', board: 'cbse' } };
    const { patch } = normaliseAnswers({ currently_in: 'college', college_name: 'Anna University' }, saved, NOW);
    expect(patch.applicant_category).toBe('college_student');
    expect(patch.academic_data).toEqual({ college_name: 'Anna University' });
  });

  it('reports what does not fit the form, and never guesses', () => {
    const { patch, rejected } = normaliseAnswers(
      { student_name: 'P', board: 'state board', exam_year: 2019, date_of_birth: '14/05/2009', course: 'architecture', pincode: '12345', programme: 'weekend' },
      null,
      NOW,
    );
    expect(patch).toEqual({});
    expect(Object.keys(rejected).sort()).toEqual(['board', 'course', 'date_of_birth', 'exam_year', 'pincode', 'programme', 'student_name']);
  });

  it('hands the programme and PIN code to the caller to resolve', () => {
    const n = normaliseAnswers({ programme: '1-year', pincode: '600 020' }, null, NOW);
    expect(n.programme).toBe('1-year');
    expect(n.pincode).toBe('600020');
  });

  it('drops a chosen programme when the course becomes "not sure"', () => {
    expect(normaliseAnswers({ course: 'not_sure' }, COMPLETE, NOW).patch).toMatchObject({ interest_course: 'not_sure', fee_structure_id: null });
  });
});

describe('applicationGaps', () => {
  it('is empty for a complete school application', () => {
    expect(applicationGaps(COMPLETE)).toEqual([]);
  });

  it('lists what is missing, in the order the form asks', () => {
    expect(applicationGaps(null)).toEqual([
      'student name',
      "father's name",
      'what they are studying now',
      'exam year',
      'course (NATA, JEE Paper 2 or both)',
      'PIN code',
      'date of birth',
    ]);
  });

  it('asks each kind of student for its own details', () => {
    expect(applicationGaps({ ...COMPLETE, applicant_category: 'college_student', academic_data: { college_name: 'X' } })).toEqual([
      'department',
      'year of study',
      'year they finished Class 12',
    ]);
    expect(applicationGaps({ ...COMPLETE, applicant_category: 'working_professional', academic_data: {} })).toEqual(['year they finished Class 12']);
  });

  it('needs a programme unless they are not sure of the course', () => {
    expect(applicationGaps({ ...COMPLETE, fee_structure_id: null })).toEqual(['programme (crash course, 1-year or 2-year)']);
    expect(applicationGaps({ ...COMPLETE, interest_course: 'not_sure', fee_structure_id: null })).toEqual([]);
  });
});

describe('applicationSummary / draftToSubmitBody', () => {
  it('reads like the form', () => {
    expect(applicationSummary(COMPLETE, 'One Year Long Program')).toEqual([
      { label: 'Student', value: 'Priya Kumar' },
      { label: "Father's name", value: 'Kumar S' },
      { label: 'Studying now', value: 'Class 11, DAV School, CBSE' },
      { label: 'Exam year', value: '2028' },
      { label: 'Course', value: 'NATA' },
      { label: 'Programme', value: 'One Year Long Program' },
      { label: 'Lives in', value: 'Chennai, Tamil Nadu (600020)' },
      { label: 'Date of birth', value: '14 May 2009' },
    ]);
  });

  it('submits the same keys the form does, with nothing empty', () => {
    const body = draftToSubmitBody({ ...COMPLETE, gender: null });
    expect(body).toMatchObject({
      status: 'submitted',
      first_name: 'Priya Kumar',
      applicant_category: 'school_student',
      interest_course: 'nata',
      fee_structure_id: 'fs-1y',
      fee_source: 'standard',
      location_source: 'pincode',
      target_exam_year: 2028,
    });
    expect(Object.values(body)).not.toContain(null);
    expect('gender' in body).toBe(false);
    expect('id' in body).toBe(false);
  });
});

describe('programmeOfDuration', () => {
  it('maps the live programmes by how long they run', () => {
    expect(programmeOfDuration('crash_course', '3 Months')).toBe('crash');
    expect(programmeOfDuration('year_long', '12 months')).toBe('1-year');
    expect(programmeOfDuration('year_long', '24 Months')).toBe('2-year');
    expect(programmeOfDuration('year_long', '6 months')).toBeNull();
  });
});
