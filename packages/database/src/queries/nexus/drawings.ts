import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';

// ============================================
// DRAWING LEVELS
// ============================================

export async function getDrawingLevels(
  classroomId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_drawing_levels')
    .select('*')
    .eq('classroom_id', classroomId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createDrawingLevel(
  data: { classroom_id: string; title: string; description?: string; sort_order?: number },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data: level, error } = await supabase
    .from('nexus_drawing_levels')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return level;
}

export async function updateDrawingLevel(
  levelId: string,
  updates: { title?: string; description?: string; sort_order?: number; is_active?: boolean },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_drawing_levels')
    .update(updates)
    .eq('id', levelId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ============================================
// DRAWING CATEGORIES
// ============================================

export async function getDrawingCategories(
  levelId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_drawing_categories')
    .select('*')
    .eq('level_id', levelId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createDrawingCategory(
  data: { level_id: string; title: string; description?: string; sort_order?: number },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data: category, error } = await supabase
    .from('nexus_drawing_categories')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return category;
}

// ============================================
// DRAWING EXERCISES
// ============================================

export async function getDrawingExercises(
  categoryId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_drawing_exercises')
    .select('*')
    .eq('category_id', categoryId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getDrawingExerciseById(
  exerciseId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_drawing_exercises')
    .select('*, category:nexus_drawing_categories(*, level:nexus_drawing_levels(*))')
    .eq('id', exerciseId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

export async function createDrawingExercise(
  data: {
    category_id: string;
    title: string;
    description?: string;
    instructions?: string;
    dos_and_donts?: string;
    reference_images?: any[];
    demo_video_url?: string;
    sort_order?: number;
  },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data: exercise, error } = await supabase
    .from('nexus_drawing_exercises')
    .insert({
      ...data,
      reference_images: data.reference_images || [],
    })
    .select()
    .single();
  if (error) throw error;
  return exercise;
}

export async function updateDrawingExercise(
  exerciseId: string,
  updates: {
    title?: string;
    description?: string;
    instructions?: string;
    dos_and_donts?: string;
    reference_images?: any[];
    demo_video_url?: string;
    sort_order?: number;
    is_active?: boolean;
  },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_drawing_exercises')
    .update(updates)
    .eq('id', exerciseId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ============================================
// FULL DRAWING LEARNING PATH (nested)
// ============================================

export async function getDrawingLearningPath(
  classroomId: string,
  studentId?: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();

  // Get levels → categories → exercises in one query
  const { data: levels, error } = await supabase
    .from('nexus_drawing_levels')
    .select(`
      *,
      categories:nexus_drawing_categories(
        *,
        exercises:nexus_drawing_exercises(*)
      )
    `)
    .eq('classroom_id', classroomId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;

  // Sort nested arrays
  const sortedLevels = (levels || []).map((level: any) => ({
    ...level,
    categories: (level.categories || [])
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((cat: any) => ({
        ...cat,
        exercises: (cat.exercises || [])
          .filter((ex: any) => ex.is_active)
          .sort((a: any, b: any) => a.sort_order - b.sort_order),
      })),
  }));

  // If student, fetch their submissions to determine progress
  if (studentId) {
    const exerciseIds = sortedLevels.flatMap((l: any) =>
      l.categories.flatMap((c: any) => c.exercises.map((e: any) => e.id))
    );

    if (exerciseIds.length > 0) {
      const { data: submissions } = await supabase
        .from('nexus_drawing_submissions')
        .select('*')
        .eq('student_id', studentId)
        .in('exercise_id', exerciseIds)
        .order('attempt_number', { ascending: false });

      // Group submissions by exercise_id
      const submissionMap = new Map<string, any[]>();
      for (const sub of submissions || []) {
        const list = submissionMap.get(sub.exercise_id) || [];
        list.push(sub);
        submissionMap.set(sub.exercise_id, list);
      }

      // Attach submissions to exercises and compute unlock status
      let previousCategoryApproved = true; // first category is always unlocked
      for (const level of sortedLevels) {
        for (const cat of level.categories) {
          let allApproved = true;
          for (const exercise of cat.exercises) {
            const subs = submissionMap.get(exercise.id) || [];
            exercise.submissions = subs;
            exercise.latest_submission = subs[0] || null;
            exercise.is_unlocked = previousCategoryApproved;
            if (!subs.some((s: any) => s.status === 'approved')) {
              allApproved = false;
            }
          }
          cat.is_unlocked = previousCategoryApproved;
          previousCategoryApproved = allApproved && cat.exercises.length > 0;
        }
      }
    }
  }

  return sortedLevels;
}

// ============================================
// DRAWING SUBMISSIONS
// ============================================

export async function createDrawingSubmission(
  data: {
    exercise_id: string;
    student_id: string;
    submission_url: string;
    attempt_number?: number;
  },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();

  // Get the latest attempt number
  if (!data.attempt_number) {
    const { data: existing } = await supabase
      .from('nexus_drawing_submissions')
      .select('attempt_number')
      .eq('exercise_id', data.exercise_id)
      .eq('student_id', data.student_id)
      .order('attempt_number', { ascending: false })
      .limit(1);
    data.attempt_number = ((existing?.[0]?.attempt_number) || 0) + 1;
  }

  const { data: submission, error } = await supabase
    .from('nexus_drawing_submissions')
    .insert({
      exercise_id: data.exercise_id,
      student_id: data.student_id,
      submission_url: data.submission_url,
      attempt_number: data.attempt_number,
      status: 'pending',
    })
    .select()
    .single();
  if (error) throw error;
  return submission;
}

export async function getStudentSubmissions(
  studentId: string,
  exerciseId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_drawing_submissions')
    .select('*')
    .eq('student_id', studentId)
    .eq('exercise_id', exerciseId)
    .order('attempt_number', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getPendingSubmissions(
  classroomId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_drawing_submissions')
    .select(`
      *,
      exercise:nexus_drawing_exercises(
        id, title,
        category:nexus_drawing_categories(
          id, title,
          level:nexus_drawing_levels(id, title, classroom_id)
        )
      ),
      student:users(id, name, email, avatar_url)
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) throw error;

  // Filter by classroom
  return (data || []).filter(
    (s: any) => s.exercise?.category?.level?.classroom_id === classroomId
  );
}

export async function evaluateSubmission(
  submissionId: string,
  evaluation: {
    status: 'approved' | 'redo' | 'graded';
    grade?: string;
    teacher_notes?: string;
    correction_url?: string;
    evaluated_by: string;
  },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_drawing_submissions')
    .update({
      status: evaluation.status,
      grade: evaluation.grade || null,
      teacher_notes: evaluation.teacher_notes || null,
      correction_url: evaluation.correction_url || null,
      evaluated_by: evaluation.evaluated_by,
      evaluated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ============================================
// DRAWING ASSIGNMENTS
// ============================================

export async function createDrawingAssignment(
  data: {
    classroom_id: string;
    exercise_id: string;
    assigned_by: string;
    scheduled_class_id?: string;
    due_date?: string;
  },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data: assignment, error } = await supabase
    .from('nexus_drawing_assignments')
    .insert(data)
    .select('*, exercise:nexus_drawing_exercises(id, title)')
    .single();
  if (error) throw error;
  return assignment;
}

export async function getDrawingAssignments(
  classroomId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_drawing_assignments')
    .select('*, exercise:nexus_drawing_exercises(id, title, description)')
    .eq('classroom_id', classroomId)
    .order('assigned_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ============================================
// DRAWING PROGRESS SUMMARY
// ============================================

export async function getDrawingProgressSummary(
  studentId: string,
  classroomId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();

  // Get total exercises for classroom
  const { data: exercises } = await supabase
    .from('nexus_drawing_exercises')
    .select('id, category:nexus_drawing_categories(level:nexus_drawing_levels(classroom_id))')
    .eq('is_active', true);

  const classroomExercises = (exercises || []).filter(
    (e: any) => e.category?.level?.classroom_id === classroomId
  );

  // Get student's approved submissions
  const exerciseIds = classroomExercises.map((e) => e.id);
  let approvedCount = 0;

  if (exerciseIds.length > 0) {
    const { data: submissions } = await supabase
      .from('nexus_drawing_submissions')
      .select('exercise_id, status')
      .eq('student_id', studentId)
      .eq('status', 'approved')
      .in('exercise_id', exerciseIds);

    // Count unique approved exercises
    const approvedExerciseIds = new Set((submissions || []).map((s) => s.exercise_id));
    approvedCount = approvedExerciseIds.size;
  }

  return {
    total: classroomExercises.length,
    approved: approvedCount,
    percentage: classroomExercises.length > 0
      ? Math.round((approvedCount / classroomExercises.length) * 100)
      : 0,
  };
}
