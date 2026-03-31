/**
 * Test Data Factory
 *
 * Domain-specific seed/cleanup functions for E2E and integration tests.
 * All test data uses the `__TEST__` prefix for easy identification and cleanup.
 *
 * Uses the existing createTestAdminClient() from ./supabase.ts
 * (connects to local Supabase or SUPABASE_TEST_URL).
 */

import { createTestAdminClient } from './supabase';

/**
 * Seed a test classroom with N students.
 * All test data uses identifiable prefixes for easy cleanup.
 */
export async function seedClassroom(options: {
  name?: string;
  studentCount?: number;
  classroom_type?: 'NATA' | 'JEE' | 'Revit';
} = {}) {
  const supabase = createTestAdminClient();
  const {
    name = `__TEST__Classroom_${Date.now()}`,
    studentCount = 5,
    classroom_type = 'NATA',
  } = options;

  const { data: classroom } = await supabase
    .from('classrooms')
    .insert({ name, type: classroom_type })
    .select()
    .single();

  const students = Array.from({ length: studentCount }, (_, i) => ({
    name: `__TEST__Student ${i + 1}`,
    email: `__test__student${i + 1}_${Date.now()}@test.neramclasses.com`,
    classroom_id: classroom!.id,
    enrolled_at: new Date(Date.now() - (studentCount - i) * 86400000).toISOString(),
  }));

  const { data: createdStudents } = await supabase
    .from('students')
    .insert(students)
    .select();

  return { classroom: classroom!, students: createdStudents! };
}

/**
 * Seed JEE question bank data for testing.
 */
export async function seedQuestionBank(options: {
  year?: number;
  questionCount?: number;
  withVideoUrls?: boolean;
} = {}) {
  const supabase = createTestAdminClient();
  const { year = 2024, questionCount = 10, withVideoUrls = true } = options;

  const questions = Array.from({ length: questionCount }, (_, i) => ({
    year,
    question_number: i + 1,
    section: i < 5 ? 'Mathematics' : 'Aptitude',
    text_en: `__TEST__Question ${i + 1} English`,
    text_hi: `__TEST__Question ${i + 1} Hindi`,
    marks: i < 5 ? 4 : 2,
    negative_marks: i < 5 ? -1 : -0.5,
    correct_option: ['A', 'B', 'C', 'D'][i % 4],
    solution_video_url: withVideoUrls ? `https://youtube.com/watch?v=__test__${year}q${i + 1}` : null,
  }));

  const { data } = await supabase.from('questions').insert(questions).select();
  return data!;
}

/**
 * Seed TNEA rank/cutoff test data for Tools App.
 */
export async function seedTNEAData(options: {
  year?: number;
  collegeCount?: number;
} = {}) {
  const supabase = createTestAdminClient();
  const { year = 2025, collegeCount = 10 } = options;

  const colleges = Array.from({ length: collegeCount }, (_, i) => ({
    name: `__TEST__College ${i + 1}`,
    code: `__TC${String(i + 1).padStart(3, '0')}`,
    year,
    cutoff_oc: 180 - i * 5,
    cutoff_bc: 170 - i * 5,
    cutoff_sc: 150 - i * 5,
    branch: 'B.Arch',
    coa_approved: i % 3 !== 0,
  }));

  const { data } = await supabase.from('tnea_cutoffs').insert(colleges).select();
  return data!;
}

/**
 * Clean up ALL test data across all tables.
 * Run after every test suite. Uses __TEST__ prefix to identify test records.
 */
export async function cleanupAllTestData(): Promise<void> {
  const supabase = createTestAdminClient();

  const tables = [
    { name: 'attendance', column: 'student_id', pattern: '__test__%' },
    { name: 'students', column: 'name', pattern: '__TEST__%' },
    { name: 'classrooms', column: 'name', pattern: '__TEST__%' },
    { name: 'questions', column: 'text_en', pattern: '__TEST__%' },
    { name: 'tnea_cutoffs', column: 'name', pattern: '__TEST__%' },
  ];

  for (const table of tables) {
    await supabase.from(table.name).delete().like(table.column, table.pattern);
  }
}
