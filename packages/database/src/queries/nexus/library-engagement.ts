import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type {
  LibraryWatchSessionUpsert,
  LibraryStudentStreak,
  LibraryEngagementDaily,
  LibraryEngagementDashboard,
  LibraryEngagementDashboardStudent,
} from '../../types';

// ============================================
// WATCH SESSION TRACKING
// ============================================

export async function upsertWatchSession(
  studentId: string,
  session: LibraryWatchSessionUpsert,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('library_watch_sessions')
    .upsert(
      {
        id: session.id,
        student_id: studentId,
        video_id: session.video_id,
        watched_seconds: session.watched_seconds,
        furthest_position_seconds: session.furthest_position_seconds,
        completion_pct: session.completion_pct,
        completed: session.completion_pct >= 90,
        play_count: session.play_count,
        pause_count: session.pause_count,
        seek_count: session.seek_count,
        rewind_count: session.rewind_count,
        replay_segments: session.replay_segments as any,
        device_type: session.device_type,
        ended_at: new Date().toISOString(),
        duration_seconds: session.watched_seconds,
      } as any,
      { onConflict: 'id' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ============================================
// TEACHER ENGAGEMENT DASHBOARD
// ============================================

export async function getEngagementDashboard(
  options: {
    classroomId?: string;
    period: 'daily' | 'weekly' | 'monthly' | 'all';
  },
  client?: TypedSupabaseClient
): Promise<LibraryEngagementDashboard> {
  const supabase = client || getSupabaseAdminClient();

  // Determine date range
  const now = new Date();
  let dateFrom: string;
  switch (options.period) {
    case 'daily':
      dateFrom = now.toISOString().split('T')[0];
      break;
    case 'weekly':
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      dateFrom = weekAgo.toISOString().split('T')[0];
      break;
    case 'monthly':
      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      dateFrom = monthAgo.toISOString().split('T')[0];
      break;
    default:
      dateFrom = '2000-01-01';
  }

  // Get students in classroom (or all)
  let studentsQuery = supabase
    .from('nexus_enrollments')
    .select('user_id, user:users!nexus_enrollments_user_id_fkey(id, first_name, last_name, avatar_url)')
    .eq('role', 'student')
    .eq('is_active', true);

  if (options.classroomId) {
    studentsQuery = studentsQuery.eq('classroom_id', options.classroomId);
  }

  const { data: enrollments, error: enrollError } = await studentsQuery;
  if (enrollError) throw enrollError;

  const studentIds = (enrollments || []).map((e: any) => e.user_id);
  const studentMap = new Map<string, any>();
  for (const e of enrollments || []) {
    studentMap.set((e as any).user_id, (e as any).user);
  }

  if (studentIds.length === 0) {
    return {
      class_aggregates: {
        total_students: 0, active_students: 0, moderate_students: 0,
        inactive_students: 0, new_students: 0, total_watch_hours: 0,
        avg_completion_pct: 0, videos_watched: 0,
      },
      top_videos: [],
      least_watched_videos: [],
      students: [],
    };
  }

  // Get streaks for all students
  const { data: streaks } = await supabase
    .from('library_student_streaks')
    .select('*')
    .in('student_id', studentIds);

  const streakMap = new Map<string, LibraryStudentStreak>();
  for (const s of streaks || []) {
    streakMap.set((s as any).student_id, s as any);
  }

  // Get engagement data for the period
  const { data: engagementData } = await supabase
    .from('library_engagement_daily')
    .select('*')
    .in('student_id', studentIds)
    .gte('activity_date', dateFrom);

  // Aggregate per student
  const studentAggregates = new Map<string, {
    videos_watched: number;
    total_watch_seconds: number;
    avg_completion_pct: number;
    bookmark_count: number;
    total_rewinds: number;
    completions: number[];
  }>();

  for (const row of engagementData || []) {
    const d = row as any;
    const existing = studentAggregates.get(d.student_id) || {
      videos_watched: 0, total_watch_seconds: 0, avg_completion_pct: 0,
      bookmark_count: 0, total_rewinds: 0, completions: [],
    };
    existing.videos_watched += d.videos_watched;
    existing.total_watch_seconds += d.total_watch_seconds;
    existing.bookmark_count += d.bookmarks_created;
    existing.total_rewinds += d.total_rewinds;
    if (d.avg_completion_pct > 0) existing.completions.push(d.avg_completion_pct);
    studentAggregates.set(d.student_id, existing);
  }

  // Build student list
  const students: LibraryEngagementDashboardStudent[] = studentIds.map((sid: string) => {
    const user = studentMap.get(sid);
    const streak = streakMap.get(sid);
    const agg = studentAggregates.get(sid);
    const avgCompletion = agg && agg.completions.length > 0
      ? agg.completions.reduce((a: number, b: number) => a + b, 0) / agg.completions.length
      : 0;
    const watchHours = (agg?.total_watch_seconds || 0) / 3600;

    return {
      id: sid,
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
      avatar_url: user?.avatar_url || null,
      engagement_status: streak?.engagement_status || 'new',
      engagement_score: streak?.engagement_score || 0,
      videos_watched: agg?.videos_watched || 0,
      total_watch_hours: Math.round(watchHours * 10) / 10,
      avg_completion_pct: Math.round(avgCompletion * 10) / 10,
      current_streak: streak?.current_streak_days || 0,
      last_active: streak?.last_activity_date || null,
      bookmark_count: agg?.bookmark_count || 0,
      rewind_ratio: watchHours > 0
        ? Math.round((agg?.total_rewinds || 0) / watchHours * 10) / 10
        : 0,
    };
  });

  // Class aggregates
  const classAgg = {
    total_students: students.length,
    active_students: students.filter(s => s.engagement_status === 'active').length,
    moderate_students: students.filter(s => s.engagement_status === 'moderate').length,
    inactive_students: students.filter(s => s.engagement_status === 'inactive').length,
    new_students: students.filter(s => s.engagement_status === 'new').length,
    total_watch_hours: Math.round(students.reduce((a, s) => a + s.total_watch_hours, 0) * 10) / 10,
    avg_completion_pct: students.length > 0
      ? Math.round(students.reduce((a, s) => a + s.avg_completion_pct, 0) / students.length * 10) / 10
      : 0,
    videos_watched: students.reduce((a, s) => a + s.videos_watched, 0),
  };

  // Top videos (most watched in period)
  const { data: topVideosData } = await supabase
    .from('library_watch_sessions')
    .select('video_id, completion_pct, video:library_videos(approved_title, suggested_title)')
    .gte('started_at', dateFrom + 'T00:00:00Z');

  const videoAgg = new Map<string, { title: string; count: number; completions: number[] }>();
  for (const row of topVideosData || []) {
    const d = row as any;
    const existing = videoAgg.get(d.video_id) || {
      title: d.video?.approved_title || d.video?.suggested_title || 'Untitled',
      count: 0,
      completions: [],
    };
    existing.count++;
    (existing.completions as any[]).push(d.completion_pct);
    videoAgg.set(d.video_id, existing);
  }

  const videoList = Array.from(videoAgg.entries())
    .map(([vid, v]) => ({
      video_id: vid,
      title: v.title,
      watch_count: v.count,
      avg_completion: Math.round(
        v.completions.reduce((a, b) => a + b, 0) / v.completions.length * 10
      ) / 10,
    }));

  const top_videos = videoList.sort((a, b) => b.watch_count - a.watch_count).slice(0, 5);
  const least_watched_videos = videoList
    .sort((a, b) => a.watch_count - b.watch_count)
    .slice(0, 5)
    .map(({ video_id, title, watch_count }) => ({ video_id, title, watch_count }));

  return {
    class_aggregates: classAgg,
    top_videos,
    least_watched_videos,
    students,
  };
}

// ============================================
// PER-STUDENT ENGAGEMENT DETAIL
// ============================================

export async function getStudentEngagement(
  studentId: string,
  period: 'daily' | 'weekly' | 'monthly' | 'all' = 'weekly',
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();

  const now = new Date();
  let dateFrom: string;
  switch (period) {
    case 'daily': dateFrom = now.toISOString().split('T')[0]; break;
    case 'weekly':
      const w = new Date(now); w.setDate(w.getDate() - 7);
      dateFrom = w.toISOString().split('T')[0]; break;
    case 'monthly':
      const m = new Date(now); m.setMonth(m.getMonth() - 1);
      dateFrom = m.toISOString().split('T')[0]; break;
    default: dateFrom = '2000-01-01';
  }

  // Student info
  const { data: user } = await supabase
    .from('users')
    .select('id, first_name, last_name, avatar_url')
    .eq('id', studentId)
    .single();

  // Streak
  const { data: streak } = await supabase
    .from('library_student_streaks')
    .select('*')
    .eq('student_id', studentId)
    .single();

  // Daily activity
  const { data: dailyActivity } = await supabase
    .from('library_engagement_daily')
    .select('*')
    .eq('student_id', studentId)
    .gte('activity_date', dateFrom)
    .order('activity_date', { ascending: true });

  // Videos watched with details
  const { data: watchHistory } = await supabase
    .from('library_watch_history')
    .select('*, video:library_videos(approved_title, suggested_title)')
    .eq('student_id', studentId)
    .order('last_watched_at', { ascending: false });

  // Replay patterns from sessions
  const { data: sessions } = await supabase
    .from('library_watch_sessions')
    .select('video_id, replay_segments, video:library_videos(approved_title, suggested_title)')
    .eq('student_id', studentId)
    .gte('started_at', dateFrom + 'T00:00:00Z')
    .gt('rewind_count', 0);

  const replayPatterns: any[] = [];
  for (const s of sessions || []) {
    const d = s as any;
    if (d.replay_segments && (d.replay_segments as any[]).length > 0) {
      replayPatterns.push({
        video_id: d.video_id,
        title: d.video?.approved_title || d.video?.suggested_title || 'Untitled',
        segments: d.replay_segments,
      });
    }
  }

  // Bookmarks
  const { data: bookmarks } = await supabase
    .from('library_bookmarks')
    .select('*, video:library_videos(approved_title, suggested_title)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  return {
    student: user || { id: studentId, first_name: '', last_name: '', avatar_url: null },
    streak: streak as LibraryStudentStreak || {
      student_id: studentId,
      current_streak_days: 0, best_streak_days: 0,
      engagement_status: 'new', engagement_score: 0,
      total_active_days: 0, total_active_weeks: 0,
      current_weekly_streak: 0, best_weekly_streak: 0,
      updated_at: new Date().toISOString(),
    },
    daily_activity: (dailyActivity || []) as LibraryEngagementDaily[],
    videos_watched: (watchHistory || []).map((wh: any) => ({
      video_id: wh.video_id,
      title: wh.video?.approved_title || wh.video?.suggested_title || 'Untitled',
      completion_pct: wh.total_watched_seconds > 0 ? Math.min(100, wh.total_watched_seconds / (wh.video?.duration_seconds || 1) * 100) : 0,
      total_watched_seconds: wh.total_watched_seconds,
      watch_count: wh.watch_count,
      last_watched_at: wh.last_watched_at,
    })),
    replay_patterns: replayPatterns,
    bookmarks: (bookmarks || []).map((b: any) => ({
      ...b,
      video_title: b.video?.approved_title || b.video?.suggested_title || 'Untitled',
    })),
  };
}

// ============================================
// STUDENT SELF-TRACKING
// ============================================

export async function getMyActivity(
  studentId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();

  // Streak
  const { data: streak } = await supabase
    .from('library_student_streaks')
    .select('*')
    .eq('student_id', studentId)
    .single();

  // Total videos available
  const { count: totalVideos } = await supabase
    .from('library_videos')
    .select('id', { count: 'exact', head: true })
    .eq('is_published', true);

  // Videos watched
  const { data: watchHistory } = await supabase
    .from('library_watch_history')
    .select('video_id, completed')
    .eq('student_id', studentId);

  const watchedCount = (watchHistory || []).length;
  const completedCount = (watchHistory || []).filter((w: any) => w.completed).length;

  // Weekly activity (last 7 days)
  const weekDates: { date: string; watched: boolean; watch_seconds: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    weekDates.push({
      date: d.toISOString().split('T')[0],
      watched: false,
      watch_seconds: 0,
    });
  }

  const weekStart = weekDates[0].date;
  const { data: weeklyEngagement } = await supabase
    .from('library_engagement_daily')
    .select('activity_date, total_watch_seconds')
    .eq('student_id', studentId)
    .gte('activity_date', weekStart);

  let watchTimeThisWeek = 0;
  for (const row of weeklyEngagement || []) {
    const d = row as any;
    const dayEntry = weekDates.find(wd => wd.date === d.activity_date);
    if (dayEntry) {
      dayEntry.watched = true;
      dayEntry.watch_seconds = d.total_watch_seconds;
    }
    watchTimeThisWeek += d.total_watch_seconds;
  }

  // Continue watching
  const { data: continueWatching } = await supabase
    .from('library_watch_history')
    .select('*, video:library_videos(*)')
    .eq('student_id', studentId)
    .eq('completed', false)
    .order('last_watched_at', { ascending: false })
    .limit(5);

  // Bookmarks
  const { data: bookmarks } = await supabase
    .from('library_bookmarks')
    .select('*, video:library_videos(*)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(10);

  return {
    streak: streak as LibraryStudentStreak || {
      student_id: studentId,
      current_streak_days: 0, best_streak_days: 0,
      engagement_status: 'new', engagement_score: 0,
      total_active_days: 0, total_active_weeks: 0,
      current_weekly_streak: 0, best_weekly_streak: 0,
      updated_at: new Date().toISOString(),
    },
    total_videos_available: totalVideos || 0,
    videos_watched_count: watchedCount,
    videos_completed_count: completedCount,
    weekly_activity: weekDates,
    watch_time_this_week: watchTimeThisWeek,
    continue_watching: continueWatching || [],
    bookmarks: bookmarks || [],
  };
}

// ============================================
// SEARCH LOGGING
// ============================================

export async function logSearch(
  studentId: string,
  queryText: string,
  resultsCount: number,
  clickedVideoId?: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase
    .from('library_search_log')
    .insert({
      student_id: studentId,
      query_text: queryText,
      results_count: resultsCount,
      clicked_video_id: clickedVideoId || null,
    });
  if (error) throw error;
}

// ============================================
// PARENT VIEW
// ============================================

export async function getChildEngagement(
  parentId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();

  // Find the parent's linked child
  // Check parent-student relationship via nexus_enrollments or a direct link
  const { data: parentUser } = await supabase
    .from('users')
    .select('id, linked_student_ids')
    .eq('id', parentId)
    .single();

  if (!parentUser || !(parentUser as any).linked_student_ids?.length) {
    return null;
  }

  const childId = (parentUser as any).linked_student_ids[0];
  return getMyActivity(childId, client);
}
