import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type {
  GamificationPointEventType,
  GamificationActivityType,
  GamificationBadgeDefinition,
  GamificationStudentBadge,
  GamificationStudentStreak,
  GamificationStudentActivityLog,
  LeaderboardEntry,
  BadgeCatalogEntry,
} from '../../types';

// ============================================
// POINT EVENT RECORDING
// ============================================

export async function recordPointEvent(
  data: {
    student_id: string;
    classroom_id: string;
    batch_id?: string | null;
    event_type: GamificationPointEventType;
    points: number;
    metadata?: Record<string, unknown>;
    source_id: string;
    event_date?: string;
  },
  client?: TypedSupabaseClient
) {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data: result, error } = await supabase
    .from('gamification_point_events')
    .upsert(
      {
        student_id: data.student_id,
        classroom_id: data.classroom_id,
        batch_id: data.batch_id || null,
        event_type: data.event_type,
        points: data.points,
        metadata: data.metadata || {},
        source_id: data.source_id,
        event_date: data.event_date || new Date().toISOString().split('T')[0],
      } as any,
      { onConflict: 'student_id,event_type,source_id', ignoreDuplicates: true }
    )
    .select()
    .single();
  // Ignore conflict errors (duplicate event)
  if (error && !error.message.includes('duplicate') && error.code !== '23505') {
    throw error;
  }
  return result;
}

export async function getStudentPoints(
  studentId: string,
  options?: { from?: string; to?: string; classroomId?: string },
  client?: TypedSupabaseClient
): Promise<number> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  let query = supabase
    .from('gamification_point_events')
    .select('points')
    .eq('student_id', studentId);
  if (options?.from) query = query.gte('event_date', options.from);
  if (options?.to) query = query.lte('event_date', options.to);
  if (options?.classroomId) query = query.eq('classroom_id', options.classroomId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).reduce((sum: number, row: any) => sum + row.points, 0);
}

export async function getStudentPointBreakdown(
  studentId: string,
  from: string,
  to: string,
  client?: TypedSupabaseClient
): Promise<{ event_type: string; total_points: number; count: number }[]> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase
    .from('gamification_point_events')
    .select('event_type, points')
    .eq('student_id', studentId)
    .gte('event_date', from)
    .lte('event_date', to);
  if (error) throw error;

  const breakdown: Record<string, { total_points: number; count: number }> = {};
  for (const row of data || []) {
    const r = row as any;
    if (!breakdown[r.event_type]) {
      breakdown[r.event_type] = { total_points: 0, count: 0 };
    }
    breakdown[r.event_type].total_points += r.points;
    breakdown[r.event_type].count += 1;
  }
  return Object.entries(breakdown).map(([event_type, stats]) => ({
    event_type,
    ...stats,
  }));
}

// ============================================
// STREAK MANAGEMENT
// ============================================

export async function updateStudentStreak(
  studentId: string,
  activityDate?: string,
  client?: TypedSupabaseClient
): Promise<GamificationStudentStreak> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const today = activityDate || new Date().toISOString().split('T')[0];

  // Get current streak record
  const { data: existing } = await supabase
    .from('gamification_student_streaks')
    .select('*')
    .eq('student_id', studentId)
    .single();

  const streak = existing as GamificationStudentStreak | null;

  if (!streak) {
    // First activity ever
    const { data: created, error } = await supabase
      .from('gamification_student_streaks')
      .insert({
        student_id: studentId,
        current_streak: 1,
        longest_streak: 1,
        last_active_date: today,
        streak_started_date: today,
        updated_at: new Date().toISOString(),
      } as any)
      .select()
      .single();
    if (error) throw error;
    return created as any;
  }

  // Already active today — no change needed
  if (streak.last_active_date === today) {
    return streak;
  }

  const lastActive = new Date(streak.last_active_date || today);
  const todayDate = new Date(today);
  const diffDays = Math.floor((todayDate.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));

  let newStreak: number;
  let streakStart: string;

  if (diffDays === 1) {
    // Consecutive day — extend streak
    newStreak = streak.current_streak + 1;
    streakStart = streak.streak_started_date || today;
  } else if (diffDays === 0) {
    // Same day — no change
    return streak;
  } else {
    // Gap — reset streak
    newStreak = 1;
    streakStart = today;
  }

  const longestStreak = Math.max(streak.longest_streak, newStreak);

  const { data: updated, error } = await supabase
    .from('gamification_student_streaks')
    .update({
      current_streak: newStreak,
      longest_streak: longestStreak,
      last_active_date: today,
      streak_started_date: streakStart,
      updated_at: new Date().toISOString(),
    } as any)
    .eq('student_id', studentId)
    .select()
    .single();
  if (error) throw error;
  return updated as any;
}

export async function getStudentStreak(
  studentId: string,
  client?: TypedSupabaseClient
): Promise<GamificationStudentStreak | null> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase
    .from('gamification_student_streaks')
    .select('*')
    .eq('student_id', studentId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return (data as any) || null;
}

export async function checkStreakMilestones(
  studentId: string,
  classroomId: string,
  batchId: string | null,
  currentStreak: number,
  client?: TypedSupabaseClient
) {
  const milestones = [
    { days: 7, points: 25 },
    { days: 30, points: 100 },
    { days: 90, points: 300 },
  ];

  for (const milestone of milestones) {
    if (currentStreak === milestone.days) {
      await recordPointEvent(
        {
          student_id: studentId,
          classroom_id: classroomId,
          batch_id: batchId,
          event_type: 'streak_milestone',
          points: milestone.points,
          source_id: `streak_${milestone.days}_${studentId}`,
          metadata: { streak_length: milestone.days },
        },
        client
      );
      await logActivity(
        studentId,
        'streak_milestone',
        `Reached ${milestone.days}-day streak! (+${milestone.points} bonus points)`,
        { streak_length: milestone.days, bonus_points: milestone.points },
        client
      );
    }
  }
}

// ============================================
// ACTIVITY LOG
// ============================================

export async function logActivity(
  studentId: string,
  activityType: GamificationActivityType,
  title: string,
  metadata?: Record<string, unknown>,
  client?: TypedSupabaseClient
) {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { error } = await supabase
    .from('gamification_student_activity_log')
    .insert({
      student_id: studentId,
      activity_type: activityType,
      title,
      metadata: metadata || {},
    } as any);
  if (error) throw error;
}

export async function getStudentActivityLog(
  studentId: string,
  limit: number = 20,
  client?: TypedSupabaseClient
): Promise<GamificationStudentActivityLog[]> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase
    .from('gamification_student_activity_log')
    .select('*')
    .eq('student_id', studentId)
    .order('activity_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as any;
}

// ============================================
// BADGE QUERIES
// ============================================

export async function getAllBadgeDefinitions(
  client?: TypedSupabaseClient
): Promise<GamificationBadgeDefinition[]> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase
    .from('gamification_badge_definitions')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return (data || []) as any;
}

export async function getStudentBadges(
  studentId: string,
  client?: TypedSupabaseClient
): Promise<(GamificationStudentBadge & { badge: GamificationBadgeDefinition })[]> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase
    .from('gamification_student_badges')
    .select('*, badge:gamification_badge_definitions!gamification_student_badges_badge_id_fkey(*)')
    .eq('student_id', studentId)
    .order('earned_at', { ascending: false });
  if (error) throw error;
  return (data || []) as any;
}

export async function getBadgeCatalogForStudent(
  studentId: string,
  client?: TypedSupabaseClient
): Promise<BadgeCatalogEntry[]> {
  const supabase = (client || getSupabaseAdminClient()) as any;

  const [definitions, earned] = await Promise.all([
    getAllBadgeDefinitions(client),
    getStudentBadges(studentId, client),
  ]);

  const earnedMap = new Map(earned.map(b => [b.badge_id, b.earned_at]));

  return definitions.map(def => ({
    ...def,
    earned: earnedMap.has(def.id),
    earned_at: earnedMap.get(def.id) || null,
  }));
}

export async function awardBadge(
  studentId: string,
  badgeId: string,
  earnedContext?: Record<string, unknown>,
  client?: TypedSupabaseClient
): Promise<boolean> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { error } = await supabase
    .from('gamification_student_badges')
    .insert({
      student_id: studentId,
      badge_id: badgeId,
      earned_context: earnedContext || {},
    } as any);

  // Already earned — not an error
  if (error && (error.code === '23505' || error.message.includes('duplicate'))) {
    return false;
  }
  if (error) throw error;

  // Log the badge earn activity
  const badgeDefs = await getAllBadgeDefinitions(client);
  const badge = badgeDefs.find(b => b.id === badgeId);
  if (badge) {
    await logActivity(
      studentId,
      'badge_earned',
      `Earned "${badge.display_name}" badge (${badge.rarity_tier})`,
      { badge_id: badgeId, rarity: badge.rarity_tier },
      client
    );
  }

  return true; // newly awarded
}

export async function getUnnotifiedBadges(
  studentId: string,
  client?: TypedSupabaseClient
): Promise<(GamificationStudentBadge & { badge: GamificationBadgeDefinition })[]> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase
    .from('gamification_student_badges')
    .select('*, badge:gamification_badge_definitions!gamification_student_badges_badge_id_fkey(*)')
    .eq('student_id', studentId)
    .eq('notified', false)
    .order('earned_at', { ascending: false });
  if (error) throw error;
  return (data || []) as any;
}

export async function markBadgesNotified(
  studentId: string,
  badgeIds: string[],
  client?: TypedSupabaseClient
) {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { error } = await supabase
    .from('gamification_student_badges')
    .update({ notified: true } as any)
    .eq('student_id', studentId)
    .in('badge_id', badgeIds);
  if (error) throw error;
}

export async function getRecentBadgeFeed(
  classroomId: string,
  limit: number = 10,
  client?: TypedSupabaseClient
) {
  const supabase = (client || getSupabaseAdminClient()) as any;
  // Get students in this classroom, then their recent badges
  const { data: enrollments } = await supabase
    .from('nexus_enrollments')
    .select('user_id')
    .eq('classroom_id', classroomId)
    .eq('role', 'student');

  if (!enrollments || enrollments.length === 0) return [];

  const studentIds = enrollments.map((e: any) => e.user_id);

  const { data, error } = await supabase
    .from('gamification_student_badges')
    .select('*, badge:gamification_badge_definitions!gamification_student_badges_badge_id_fkey(*), student:users!gamification_student_badges_student_id_fkey(id, name, avatar_url)')
    .in('student_id', studentIds)
    .order('earned_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as any;
}

// ============================================
// LEADERBOARD QUERIES
// ============================================

export async function getLiveLeaderboard(
  classroomId: string,
  options: {
    batchId?: string | null;
    from: string;
    to: string;
    scope?: 'batch' | 'all_neram';
  },
  client?: TypedSupabaseClient
): Promise<LeaderboardEntry[]> {
  const supabase = (client || getSupabaseAdminClient()) as any;

  // Get all enrolled students
  let enrollmentQuery = supabase
    .from('nexus_enrollments')
    .select('user_id, batch_id, user:users!inner(id, name, avatar_url)')
    .eq('role', 'student');

  if (options.scope === 'all_neram') {
    // Cross-classroom — no classroom filter
  } else {
    enrollmentQuery = enrollmentQuery.eq('classroom_id', classroomId);
    if (options.batchId) {
      enrollmentQuery = enrollmentQuery.eq('batch_id', options.batchId);
    }
  }

  const { data: enrollments, error: enrollError } = await enrollmentQuery;
  if (enrollError) throw enrollError;
  if (!enrollments || enrollments.length === 0) return [];

  const studentIds = enrollments.map((e: any) => e.user_id);

  // Aggregate points for each student in the period
  const { data: points, error: ptsError } = await supabase
    .from('gamification_point_events')
    .select('student_id, points')
    .in('student_id', studentIds)
    .gte('event_date', options.from)
    .lte('event_date', options.to);
  if (ptsError) throw ptsError;

  // Sum points per student
  const pointsByStudent: Record<string, number> = {};
  for (const p of points || []) {
    const r = p as any;
    pointsByStudent[r.student_id] = (pointsByStudent[r.student_id] || 0) + r.points;
  }

  // Get streaks for all students
  const { data: streaks } = await supabase
    .from('gamification_student_streaks')
    .select('student_id, current_streak')
    .in('student_id', studentIds);
  const streakByStudent: Record<string, number> = {};
  for (const s of streaks || []) {
    const r = s as any;
    streakByStudent[r.student_id] = r.current_streak;
  }

  // Get top 3 badges per student
  const { data: badges } = await supabase
    .from('gamification_student_badges')
    .select('student_id, badge:gamification_badge_definitions!gamification_student_badges_badge_id_fkey(id, display_name, rarity_tier, icon_svg_path)')
    .in('student_id', studentIds)
    .order('earned_at', { ascending: false });
  const badgesByStudent: Record<string, any[]> = {};
  for (const b of badges || []) {
    const r = b as any;
    if (!badgesByStudent[r.student_id]) badgesByStudent[r.student_id] = [];
    if (badgesByStudent[r.student_id].length < 3) {
      badgesByStudent[r.student_id].push(r.badge);
    }
  }

  // Build batch name map
  const batchIds = [...new Set(enrollments.map((e: any) => e.batch_id).filter(Boolean))];
  let batchNameMap: Record<string, string> = {};
  if (batchIds.length > 0) {
    const { data: batches } = await supabase
      .from('nexus_batches')
      .select('id, name')
      .in('id', batchIds);
    for (const b of batches || []) {
      const r = b as any;
      batchNameMap[r.id] = r.name;
    }
  }

  // Build entries
  const entries: LeaderboardEntry[] = enrollments.map((e: any) => {
    const rawScore = pointsByStudent[e.user_id] || 0;
    return {
      rank: 0,
      student_id: e.user_id,
      student_name: e.user?.name || 'Unknown',
      avatar_url: e.user?.avatar_url || null,
      batch_name: e.batch_id ? (batchNameMap[e.batch_id] || null) : null,
      raw_score: rawScore,
      normalized_score: rawScore, // Will compute if cross-batch
      streak_length: streakByStudent[e.user_id] || 0,
      attendance_pct: 0, // Computed separately if needed
      rank_change: 0,
      is_rising_star: false,
      is_comeback_kid: false,
      top_badges: badgesByStudent[e.user_id] || [],
    };
  });

  // Sort by score DESC, streak DESC, name ASC (tiebreaker)
  entries.sort((a, b) => {
    if (b.raw_score !== a.raw_score) return b.raw_score - a.raw_score;
    if (b.streak_length !== a.streak_length) return b.streak_length - a.streak_length;
    return a.student_name.localeCompare(b.student_name);
  });

  // Assign ranks
  entries.forEach((entry, i) => {
    entry.rank = i + 1;
  });

  return entries;
}

export async function getWeeklyLeaderboardSnapshot(
  weekStart: string,
  options?: { classroomId?: string; batchId?: string },
  client?: TypedSupabaseClient
) {
  const supabase = (client || getSupabaseAdminClient()) as any;
  let query = supabase
    .from('gamification_weekly_leaderboard')
    .select('*, student:users!gamification_weekly_leaderboard_student_id_fkey(id, name, avatar_url)')
    .eq('week_start', weekStart)
    .order('rank_in_batch', { ascending: true });

  if (options?.classroomId) query = query.eq('classroom_id', options.classroomId);
  if (options?.batchId) query = query.eq('batch_id', options.batchId);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as any;
}

export async function getMonthlyLeaderboardSnapshot(
  monthStart: string,
  options?: { classroomId?: string; batchId?: string },
  client?: TypedSupabaseClient
) {
  const supabase = (client || getSupabaseAdminClient()) as any;
  let query = supabase
    .from('gamification_monthly_leaderboard')
    .select('*, student:users!gamification_monthly_leaderboard_student_id_fkey(id, name, avatar_url)')
    .eq('month_start', monthStart)
    .order('rank_in_batch', { ascending: true });

  if (options?.classroomId) query = query.eq('classroom_id', options.classroomId);
  if (options?.batchId) query = query.eq('batch_id', options.batchId);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as any;
}

// ============================================
// DASHBOARD HELPERS
// ============================================

export async function getDashboardGamification(
  classroomId: string,
  currentUserId: string,
  client?: TypedSupabaseClient
) {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + mondayOffset);
  const from = weekStart.toISOString().split('T')[0];
  const to = now.toISOString().split('T')[0];

  const [leaderboard, badgeFeed] = await Promise.all([
    getLiveLeaderboard(classroomId, { from, to }, client),
    getRecentBadgeFeed(classroomId, 5, client),
  ]);

  const top3 = leaderboard.slice(0, 3);
  const myRank = leaderboard.find(e => e.student_id === currentUserId) || null;

  return {
    top3,
    myRank,
    totalStudents: leaderboard.length,
    recentBadges: badgeFeed,
    weekLabel: `Week of ${from}`,
  };
}

// ============================================
// HELPER: Record gamification event (convenience)
// ============================================

/**
 * One-call helper to record a point event + update streak + log activity.
 * Use this from API routes to avoid repeating the 3-step pattern.
 */
export async function recordGamificationEvent(
  data: {
    student_id: string;
    classroom_id: string;
    batch_id?: string | null;
    event_type: GamificationPointEventType;
    points: number;
    source_id: string;
    activity_type: GamificationActivityType;
    activity_title: string;
    metadata?: Record<string, unknown>;
  },
  client?: TypedSupabaseClient
) {
  const c = client || getSupabaseAdminClient();

  // 1. Record point event
  await recordPointEvent(
    {
      student_id: data.student_id,
      classroom_id: data.classroom_id,
      batch_id: data.batch_id,
      event_type: data.event_type,
      points: data.points,
      source_id: data.source_id,
      metadata: data.metadata,
    },
    c
  );

  // 2. Update streak
  const streak = await updateStudentStreak(data.student_id, undefined, c);

  // 3. Check streak milestones
  await checkStreakMilestones(
    data.student_id,
    data.classroom_id,
    data.batch_id || null,
    streak.current_streak,
    c
  );

  // 4. Log activity
  await logActivity(data.student_id, data.activity_type, data.activity_title, data.metadata, c);

  return { points: data.points, streak };
}

// ============================================
// BADGE CHECKING (called by nightly cron)
// ============================================

/**
 * Check and award all applicable badges for a student.
 * Called by the nightly cron job.
 */
export async function checkAndAwardBadges(
  studentId: string,
  client?: TypedSupabaseClient
) {
  const c = client || getSupabaseAdminClient();
  const awarded: string[] = [];

  // --- ATTENDANCE BADGES ---

  // first_step: Attended at least 1 class
  const { count: attendedCount } = await (c as any)
    .from('nexus_attendance')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .eq('attended', true);

  if ((attendedCount || 0) >= 1) {
    if (await awardBadge(studentId, 'first_step', { total_attended: attendedCount }, c)) {
      awarded.push('first_step');
    }
  }

  // never_miss: 95%+ attendance in current calendar month
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const { count: monthTotal } = await (c as any)
    .from('nexus_attendance')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .gte('marked_at', monthStart);
  const { count: monthAttended } = await (c as any)
    .from('nexus_attendance')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .eq('attended', true)
    .gte('marked_at', monthStart);

  const monthPct = (monthTotal || 0) > 0 ? ((monthAttended || 0) / (monthTotal || 1)) * 100 : 0;
  if (monthPct >= 95 && (monthTotal || 0) >= 5) {
    if (await awardBadge(studentId, 'never_miss', { month: monthStart, pct: monthPct }, c)) {
      awarded.push('never_miss');
    }
  }

  // iron_streak: 30-day streak
  const streak = await getStudentStreak(studentId, c);
  if (streak && streak.current_streak >= 30) {
    if (await awardBadge(studentId, 'iron_streak', { streak: streak.current_streak }, c)) {
      awarded.push('iron_streak');
    }
  }

  // --- CHECKLIST BADGES ---

  // task_starter: Completed at least 1 checklist item
  const { count: checklistCount } = await (c as any)
    .from('nexus_student_entry_progress')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .eq('status', 'completed');

  if ((checklistCount || 0) >= 1) {
    if (await awardBadge(studentId, 'task_starter', { total_completed: checklistCount }, c)) {
      awarded.push('task_starter');
    }
  }

  // --- GROWTH BADGES ---
  // rising_star and comeback_kid are checked in the weekly cron
  // (they depend on leaderboard rank changes)

  return awarded;
}
