/**
 * Put a wrapped-up class recording into the student Library.
 *
 * When a class gets a YouTube recording and tags, we mirror it into
 * `library_videos` so a student searching the Library by a tag or keyword finds
 * the class next to channel videos. The class's tag labels become the video's
 * `topics`, which the Library search_vector trigger indexes at weight B, so
 * search "just works" with no extra wiring.
 *
 * When the class has a `nexus_class_video_meta` row (the YouTube upload record
 * the teacher authored in Wrap up), that record wins: its title, description,
 * search terms, category, language, exam and level are what the student sees
 * and searches. Without it we fall back to the class title and description.
 *
 * Dedupe is by `youtube_video_id` (UNIQUE). If a row already exists for that
 * video (for example the channel sync grabbed it), we merge our tags into its
 * topics rather than overwriting a legitimately-classified video.
 */

import { extractYouTubeId } from './youtube';

interface TagLite {
  label: string;
  slug: string;
  group_type: string;
}

/**
 * Fine-grained subject slugs roll up to one of the six Library categories the
 * filter chips and CategoryRow query by.
 *
 * This only matters for classes with no video-meta row: the meta record stores
 * a human-confirmed category directly. Anything unmapped falls through to
 * 'general_knowledge', which is what the channel classifier also defaults to.
 */
const SUBJECT_SLUG_TO_CATEGORY: Record<string, string> = {
  drawing: 'drawing',
  perspective: 'drawing',
  visualization_3d: 'drawing',
  orthographic_projection: 'drawing',
  design_fundamentals: 'drawing',

  aptitude: 'aptitude',
  spatial_visualization: 'aptitude',
  pattern_recognition: 'aptitude',
  analogy: 'aptitude',
  counting_figures: 'aptitude',
  odd_one_out: 'aptitude',
  surface_counting: 'aptitude',
  mirror_image: 'aptitude',
  embedded_figure: 'aptitude',
  puzzle: 'aptitude',

  mathematics: 'mathematics',
};

const LIBRARY_CATEGORIES = new Set([
  'drawing',
  'aptitude',
  'mathematics',
  'general_knowledge',
  'exam_preparation',
  'orientation',
]);

/**
 * Roll a class's subject tags up to a Library category slug.
 *
 * The chips and CategoryRow filter on the slug ('drawing'), never the human
 * label ('Drawing'), so returning a label here is what used to drop every
 * wrapped-up recording into a category nothing could match.
 *
 * Mathematics slugs are numerous and all roll up the same way, so they are
 * matched by exclusion rather than listed one by one.
 */
export function categoryForSubjectSlugs(slugs: string[]): string | null {
  for (const slug of slugs) {
    const mapped = SUBJECT_SLUG_TO_CATEGORY[slug];
    if (mapped) return mapped;
  }
  // Every remaining seeded subject slug is a JEE maths chapter.
  if (slugs.length > 0) return 'mathematics';
  return null;
}

/** Derive the Library exam enum from the class's exam-group tags. */
export function examForTagSlugs(slugs: string[]): string | null {
  const nata = slugs.includes('nata');
  const jee = slugs.includes('jee');
  if (nata && jee) return 'both';
  if (nata) return 'nata';
  if (jee) return 'jee_barch';
  return null;
}

interface VideoMeta {
  yt_title: string | null;
  yt_description: string | null;
  search_terms: string[] | null;
  chapters: unknown;
  language: string | null;
  exam: string | null;
  difficulty: string | null;
  category: string | null;
  thumbnail_url: string | null;
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
    .select('tag:nexus_qb_tags(label, slug, group_type)')
    .eq('scheduled_class_id', classId);
  const tags: TagLite[] = (tagRows || []).map((r: any) => r.tag).filter(Boolean);

  // Topics feed search at weight B. Exam tags stay out: they are a filter, not
  // a topic, and "NATA" in every topic list would flatten ranking.
  const topics = [...new Set(
    tags.filter((t) => t.group_type !== 'exam').map((t) => t.label),
  )];
  const subjectSlugs = tags.filter((t) => t.group_type === 'subject').map((t) => t.slug);
  const themeLabels = tags.filter((t) => t.group_type === 'theme').map((t) => t.label);
  const examSlugs = tags.filter((t) => t.group_type === 'exam').map((t) => t.slug);

  const { data: meta } = (await supabase
    .from('nexus_class_video_meta')
    .select(
      'yt_title, yt_description, search_terms, chapters, language, exam, difficulty, category, thumbnail_url',
    )
    .eq('scheduled_class_id', classId)
    .maybeSingle()) as { data: VideoMeta | null };

  const title = meta?.yt_title || cls.title || 'Class recording';
  const description = meta?.yt_description || cls.description || null;
  const searchTerms = meta?.search_terms?.length ? meta.search_terms : null;

  // The teacher-confirmed category wins. Without one, roll the subject tags up.
  const metaCategory =
    meta?.category && LIBRARY_CATEGORIES.has(meta.category) ? meta.category : null;
  const category = metaCategory || categoryForSubjectSlugs(subjectSlugs);

  const exam = meta?.exam || examForTagSlugs(examSlugs);
  const language = meta?.language || null;
  const difficulty = meta?.difficulty || null;

  const thumbnail = meta?.thumbnail_url || `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;

  const { data: existing } = await supabase
    .from('library_videos')
    .select('id, topics, subcategories, key_concepts, category, language, exam, difficulty')
    .eq('youtube_video_id', ytId)
    .maybeSingle();

  if (existing) {
    // Tags are additive: union ours into whatever the channel classifier found.
    // The classification fields are fill-the-blanks, so a human-authored value
    // lands on a row the classifier left empty, but never clobbers one it set.
    const patch: Record<string, unknown> = {
      topics: [...new Set([...(existing.topics || []), ...topics])],
      subcategories: [...new Set([...(existing.subcategories || []), ...themeLabels])],
    };
    if (searchTerms) {
      patch.key_concepts = [...new Set([...(existing.key_concepts || []), ...searchTerms])];
    }
    // A meta record is an explicit human decision, so it does overwrite.
    if (metaCategory) patch.category = metaCategory;
    else if (!existing.category && category) patch.category = category;
    if (meta?.language) patch.language = meta.language;
    else if (!existing.language && language) patch.language = language;
    if (meta?.exam) patch.exam = meta.exam;
    else if (!existing.exam && exam) patch.exam = exam;
    if (meta?.difficulty) patch.difficulty = meta.difficulty;
    else if (!existing.difficulty && difficulty) patch.difficulty = difficulty;
    if (meta?.yt_title) patch.approved_title = meta.yt_title;
    if (meta?.yt_description) patch.approved_description = meta.yt_description;
    if (meta?.thumbnail_url) patch.youtube_thumbnail_hq_url = meta.thumbnail_url;

    await supabase.from('library_videos').update(patch).eq('id', existing.id);
    if (cls.library_video_id !== existing.id) {
      await supabase
        .from('nexus_scheduled_classes')
        .update({ library_video_id: existing.id })
        .eq('id', classId);
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
      key_concepts: searchTerms || [],
      category,
      language,
      exam,
      difficulty,
      classification_status: 'classified',
      review_status: 'approved',
      is_published: true,
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) throw error;

  await supabase
    .from('nexus_scheduled_classes')
    .update({ library_video_id: inserted.id })
    .eq('id', classId);
  return inserted.id as string;
}
