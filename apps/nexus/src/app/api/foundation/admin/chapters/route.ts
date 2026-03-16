import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getAllChaptersAdmin,
  createFoundationChapter,
  getChapterReactionCounts,
} from '@neram/database/queries/nexus';

async function verifyTeacher(request: NextRequest) {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient();
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type, name')
    .eq('ms_oid', msUser.oid)
    .single();
  if (!user) throw new Error('User not found');
  if (user.user_type !== 'teacher' && user.user_type !== 'admin') {
    throw new Error('Not authorized');
  }
  return user;
}

export async function GET(request: NextRequest) {
  try {
    await verifyTeacher(request);
    const chapters = await getAllChaptersAdmin();

    // Fetch reaction counts for all chapters
    const chapterIds = chapters.map((c: any) => c.id);
    const reactionCounts = chapterIds.length > 0
      ? await getChapterReactionCounts(chapterIds)
      : [];

    const countsMap = new Map(reactionCounts.map(rc => [rc.chapter_id, rc]));
    const chaptersWithCounts = chapters.map((c: any) => ({
      ...c,
      like_count: countsMap.get(c.id)?.like_count || 0,
      dislike_count: countsMap.get(c.id)?.dislike_count || 0,
    }));

    return NextResponse.json({ chapters: chaptersWithCounts });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load chapters';
    const status = message === 'Not authorized' ? 403 : message === 'User not found' ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyTeacher(request);
    const body = await request.json();

    const videoSource = body.video_source || 'youtube';
    if (!body.title?.trim() || body.chapter_number == null) {
      return NextResponse.json(
        { error: 'title and chapter_number are required' },
        { status: 400 }
      );
    }
    if (videoSource === 'youtube' && !body.youtube_video_id?.trim()) {
      return NextResponse.json(
        { error: 'youtube_video_id is required for YouTube chapters' },
        { status: 400 }
      );
    }
    if (videoSource === 'sharepoint' && !body.sharepoint_video_url?.trim()) {
      return NextResponse.json(
        { error: 'sharepoint_video_url is required for SharePoint chapters' },
        { status: 400 }
      );
    }

    const chapter = await createFoundationChapter({
      title: body.title.trim(),
      description: body.description?.trim() || null,
      video_source: videoSource,
      youtube_video_id: videoSource === 'youtube' ? body.youtube_video_id.trim() : null,
      sharepoint_video_url: videoSource === 'sharepoint' ? body.sharepoint_video_url.trim() : null,
      video_duration_seconds: body.video_duration_seconds || null,
      chapter_number: body.chapter_number,
      min_quiz_score_pct: body.min_quiz_score_pct ?? 90,
      is_published: body.is_published ?? false,
      created_by: user.id,
    });

    return NextResponse.json({ chapter }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create chapter';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
