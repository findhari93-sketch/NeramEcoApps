import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/modules/foundation/items
 * Bridge API: Return Foundation chapters formatted as module items for unified display.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    // Look up user
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    // Fetch all published chapters ordered by chapter_number
    const { data: chapters, error: chaptersError } = await supabase
      .from('nexus_foundation_chapters')
      .select('*')
      .eq('is_published', true)
      .order('chapter_number', { ascending: true });

    if (chaptersError) throw chaptersError;

    if (!chapters || chapters.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const chapterIds = chapters.map((c: any) => c.id);

    // Fetch section counts per chapter
    const { data: sectionCounts } = await supabase
      .from('nexus_foundation_sections')
      .select('chapter_id')
      .in('chapter_id', chapterIds);

    const sectionCountMap: Record<string, number> = {};
    (sectionCounts || []).forEach((s: any) => {
      sectionCountMap[s.chapter_id] = (sectionCountMap[s.chapter_id] || 0) + 1;
    });

    // Fetch student-specific data if user found
    let progressMap: Record<string, any> = {};
    let completedSectionsMap: Record<string, number> = {};

    if (user) {
      // Fetch progress for all chapters
      const { data: progressData } = await supabase
        .from('nexus_foundation_student_progress')
        .select('*')
        .eq('student_id', user.id)
        .in('chapter_id', chapterIds);

      (progressData || []).forEach((p: any) => {
        progressMap[p.chapter_id] = p;
      });

      // Fetch sections with passed quiz attempts to count completed sections
      const { data: sections } = await supabase
        .from('nexus_foundation_sections')
        .select('id, chapter_id')
        .in('chapter_id', chapterIds);

      if (sections && sections.length > 0) {
        const sectionIds = sections.map((s: any) => s.id);

        const { data: passedAttempts } = await supabase
          .from('nexus_foundation_quiz_attempts')
          .select('section_id')
          .eq('student_id', user.id)
          .in('section_id', sectionIds)
          .eq('passed', true);

        const passedSectionIds = new Set<string>((passedAttempts || []).map((a: any) => a.section_id));

        // Map section_id back to chapter_id to count completed sections per chapter
        const sectionToChapter: Record<string, string> = {};
        sections.forEach((s: any) => {
          sectionToChapter[s.id] = s.chapter_id;
        });

        passedSectionIds.forEach((sectionId) => {
          const chapterId = sectionToChapter[sectionId];
          if (chapterId) {
            completedSectionsMap[chapterId] = (completedSectionsMap[chapterId] || 0) + 1;
          }
        });
      }
    }

    // Map each chapter to a module-item-like object
    const items = chapters.map((chapter: any) => {
      const progress = progressMap[chapter.id];
      const sectionCount = sectionCountMap[chapter.id] || 0;
      const completedCount = completedSectionsMap[chapter.id] || 0;

      let status = 'locked';
      if (progress) {
        status = progress.status || 'in_progress';
      }

      return {
        id: chapter.id,
        title: chapter.title,
        description: chapter.description,
        item_type: 'chapter',
        video_source: chapter.video_source,
        youtube_video_id: chapter.youtube_video_id,
        sharepoint_video_url: chapter.sharepoint_video_url,
        chapter_number: chapter.chapter_number,
        is_published: chapter.is_published,
        source: 'foundation',
        section_count: sectionCount,
        completed_sections: completedCount,
        progress: {
          status,
        },
      };
    });

    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load foundation items';
    console.error('Foundation bridge items GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
