import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type {
  LibraryVideo,
  LibraryVideoInsert,
  LibraryVideoUpdate,
  LibraryCollection,
  LibraryBookmark,
  LibraryWatchHistory,
} from '../../types';

// ============================================
// VIDEOS
// ============================================

export async function getPublishedVideos(
  filters?: {
    category?: string;
    exam?: string;
    language?: string;
    difficulty?: string;
    search?: string;
    limit?: number;
    offset?: number;
    sortBy?: 'published_at' | 'view_count' | 'duration_seconds';
    sortOrder?: 'asc' | 'desc';
  },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  let query = supabase
    .from('library_videos')
    .select('*', { count: 'exact' })
    .eq('is_published', true);

  if (filters?.category) query = query.eq('category', filters.category);
  if (filters?.exam) query = query.eq('exam', filters.exam);
  if (filters?.language) query = query.eq('language', filters.language);
  if (filters?.difficulty) query = query.eq('difficulty', filters.difficulty);
  if (filters?.search) {
    query = query.textSearch(
      'approved_title',
      filters.search,
      { type: 'websearch' }
    );
  }

  const sortBy = filters?.sortBy || 'published_at';
  const sortOrder = filters?.sortOrder || 'desc';
  query = query.order(sortBy, { ascending: sortOrder === 'asc' });

  const limit = filters?.limit || 20;
  const offset = filters?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { videos: (data || []) as LibraryVideo[], total: count || 0 };
}

export async function getVideoById(
  videoId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('library_videos')
    .select('*')
    .eq('id', videoId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as LibraryVideo;
}

export async function getVideosByCategory(
  category: string,
  limit: number = 10,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('library_videos')
    .select('*')
    .eq('is_published', true)
    .eq('category', category)
    .order('published_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as LibraryVideo[];
}

export async function getRelatedVideos(
  videoId: string,
  category: string,
  subcategories: string[],
  limit: number = 6,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('library_videos')
    .select('*')
    .eq('is_published', true)
    .eq('category', category)
    .neq('id', videoId)
    .overlaps('subcategories', subcategories)
    .order('view_count', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as LibraryVideo[];
}

export async function getVideoCategories(
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('library_videos')
    .select('category')
    .eq('is_published', true)
    .not('category', 'is', null);
  if (error) throw error;
  const categories = [...new Set((data || []).map((d: any) => d.category))];
  return categories as string[];
}

// ============================================
// ADMIN: REVIEW QUEUE
// ============================================

export async function getReviewQueue(
  filters?: {
    status?: string;
    minConfidence?: number;
    maxConfidence?: number;
    transcriptStatus?: string;
    limit?: number;
    offset?: number;
  },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  let query = supabase
    .from('library_videos')
    .select('*', { count: 'exact' });

  if (filters?.status) {
    query = query.eq('review_status', filters.status);
  }
  if (filters?.minConfidence !== undefined) {
    query = query.gte('ai_confidence', filters.minConfidence);
  }
  if (filters?.maxConfidence !== undefined) {
    query = query.lte('ai_confidence', filters.maxConfidence);
  }
  if (filters?.transcriptStatus) {
    query = query.eq('transcript_status', filters.transcriptStatus);
  }

  query = query.order('ai_confidence', { ascending: false });

  const limit = filters?.limit || 20;
  const offset = filters?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { videos: (data || []) as LibraryVideo[], total: count || 0 };
}

export async function updateVideoReview(
  videoId: string,
  update: LibraryVideoUpdate,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('library_videos')
    .update(update as any)
    .eq('id', videoId)
    .select()
    .single();
  if (error) throw error;
  return data as LibraryVideo;
}

export async function bulkApproveVideos(
  videoIds: string[],
  reviewedBy: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('library_videos')
    .update({
      review_status: 'approved',
      is_published: true,
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
    })
    .in('id', videoIds)
    .select();
  if (error) throw error;
  return (data || []) as LibraryVideo[];
}

export async function getReviewStats(
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('library_videos')
    .select('review_status, classification_status');
  if (error) throw error;

  const stats = {
    approved: 0,
    pending: 0,
    rejected: 0,
    needs_reclass: 0,
    errors: 0,
    total: (data || []).length,
  };
  for (const v of data || []) {
    const d = v as any;
    if (d.review_status === 'approved') stats.approved++;
    else if (d.review_status === 'pending') stats.pending++;
    else if (d.review_status === 'rejected') stats.rejected++;
    else if (d.review_status === 'needs_reclass') stats.needs_reclass++;
    if (d.classification_status === 'error') stats.errors++;
  }
  return stats;
}

// ============================================
// COLLECTIONS
// ============================================

export async function getPublishedCollections(
  classroomId?: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  let query = supabase
    .from('library_collections')
    .select('*')
    .eq('is_published', true)
    .order('sort_order', { ascending: true });

  if (classroomId) {
    query = query.or(`classroom_id.eq.${classroomId},classroom_id.is.null`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as LibraryCollection[];
}

export async function getCollectionWithVideos(
  collectionId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('library_collections')
    .select(`
      *,
      items:library_collection_items(
        *,
        video:library_videos(*)
      )
    `)
    .eq('id', collectionId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as any;
}

export async function createCollection(
  collection: {
    title: string;
    description?: string;
    cover_image_url?: string;
    created_by: string;
    classroom_id?: string;
    exam?: string;
    is_published?: boolean;
  },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('library_collections')
    .insert(collection)
    .select()
    .single();
  if (error) throw error;
  return data as LibraryCollection;
}

export async function updateCollection(
  collectionId: string,
  update: Partial<LibraryCollection>,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('library_collections')
    .update(update)
    .eq('id', collectionId)
    .select()
    .single();
  if (error) throw error;
  return data as LibraryCollection;
}

export async function deleteCollection(
  collectionId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase
    .from('library_collections')
    .delete()
    .eq('id', collectionId);
  if (error) throw error;
}

export async function addVideoToCollection(
  collectionId: string,
  videoId: string,
  sortOrder: number,
  notes?: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('library_collection_items')
    .insert({ collection_id: collectionId, video_id: videoId, sort_order: sortOrder, notes })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeVideoFromCollection(
  collectionId: string,
  videoId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase
    .from('library_collection_items')
    .delete()
    .eq('collection_id', collectionId)
    .eq('video_id', videoId);
  if (error) throw error;
}

// ============================================
// BOOKMARKS
// ============================================

export async function getStudentBookmarks(
  studentId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('library_bookmarks')
    .select('*, video:library_videos(*)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as any;
}

export async function createBookmark(
  bookmark: { student_id: string; video_id: string; timestamp_seconds?: number; note?: string },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('library_bookmarks')
    .insert(bookmark)
    .select()
    .single();
  if (error) throw error;
  return data as LibraryBookmark;
}

export async function deleteBookmark(
  bookmarkId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase
    .from('library_bookmarks')
    .delete()
    .eq('id', bookmarkId);
  if (error) throw error;
}

// ============================================
// WATCH HISTORY
// ============================================

export async function getContinueWatching(
  studentId: string,
  limit: number = 10,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('library_watch_history')
    .select('*, video:library_videos(*)')
    .eq('student_id', studentId)
    .eq('completed', false)
    .order('last_watched_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as any;
}

export async function upsertWatchHistory(
  entry: {
    student_id: string;
    video_id: string;
    last_position_seconds: number;
    total_watched_seconds: number;
    completed: boolean;
  },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('library_watch_history')
    .upsert(
      {
        ...entry,
        last_watched_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,video_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return data as LibraryWatchHistory;
}

// ============================================
// SYNC LOG
// ============================================

export async function getLatestSyncLog(
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('library_sync_log')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}
