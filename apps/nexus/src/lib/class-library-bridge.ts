/**
 * Put a wrapped-up class recording into the student Library.
 *
 * When a class gets a YouTube recording and tags, we mirror it into
 * `library_videos` so a student searching the Library by a tag or keyword finds
 * the class next to channel videos. The class's tag labels become the video's
 * `topics`, which the Library search_vector trigger already indexes, so search
 * "just works" with no extra wiring.
 *
 * Dedupe is by `youtube_video_id` (UNIQUE). If a row already exists for that
 * video (for example the channel sync grabbed it), we merge our tags into its
 * topics rather than overwriting a legitimately-classified video.
 */

import { extractYouTubeId } from './youtube';

interface TagLite {
  label: string;
  group_type: string;
}

/**
 * Sync one class's recording to the Library. No-op (returns null) when there is
 * no valid YouTube URL. Returns the library_videos id on success.
 */
export async function syncClassToLibrary(
  supabase: any,
  classId: string,
): Promise<string | null> {
  const { data: cls } = await supabase
    .from('nexus_scheduled_classes')
    .select('id, title, description, youtube_url, library_video_id')
    .eq('id', classId)
    .single();
  if (!cls?.youtube_url) return null;

  const ytId = extractYouTubeId(cls.youtube_url);
  if (!ytId) return null;

  const { data: tagRows } = await supabase
    .from('nexus_class_tags')
    .select('tag:nexus_qb_tags(label, group_type)')
    .eq('scheduled_class_id', classId);
  const tags: TagLite[] = (tagRows || []).map((r: any) => r.tag).filter(Boolean);
  const topics = [...new Set(tags.map((t) => t.label))];
  const subjectLabels = tags.filter((t) => t.group_type === 'subject').map((t) => t.label);
  const themeLabels = tags.filter((t) => t.group_type === 'theme').map((t) => t.label);
  const category = subjectLabels[0] || null;

  const title = cls.title || 'Class recording';
  const description = cls.description || null;
  const thumbnail = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;

  const { data: existing } = await supabase
    .from('library_videos')
    .select('id, topics, subcategories')
    .eq('youtube_video_id', ytId)
    .maybeSingle();

  if (existing) {
    // Additive only: union our tags into the existing row's topics without
    // clobbering a category a channel classification may already have set.
    const mergedTopics = [...new Set([...(existing.topics || []), ...topics])];
    const mergedSubs = [...new Set([...(existing.subcategories || []), ...themeLabels])];
    await supabase
      .from('library_videos')
      .update({ topics: mergedTopics, subcategories: mergedSubs })
      .eq('id', existing.id);
    if (cls.library_video_id !== existing.id) {
      await supabase.from('nexus_scheduled_classes').update({ library_video_id: existing.id }).eq('id', classId);
    }
    return existing.id as string;
  }

  const { data: inserted, error } = await supabase
    .from('library_videos')
    .insert({
      youtube_video_id: ytId,
      original_title: title,
      suggested_title: title,
      approved_title: title,
      suggested_description: description,
      approved_description: description,
      youtube_thumbnail_url: thumbnail,
      youtube_thumbnail_hq_url: thumbnail,
      privacy_status: 'unlisted',
      topics,
      subcategories: themeLabels,
      category,
      classification_status: 'classified',
      review_status: 'approved',
      is_published: true,
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) throw error;

  await supabase.from('nexus_scheduled_classes').update({ library_video_id: inserted.id }).eq('id', classId);
  return inserted.id as string;
}
