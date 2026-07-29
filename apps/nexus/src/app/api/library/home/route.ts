import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getVideosByCategory, getTopicCounts } from '@neram/database/queries/nexus';

/**
 * GET /api/library/home
 *
 * Everything the Library home needs in one request: the category rows and the
 * popular-topic chips.
 *
 * Previously each CategoryRow fetched itself, so first paint fired six parallel
 * requests to /api/library/videos plus one for collections. That is six Vercel
 * function invocations per page view, on the app's most visited student screen,
 * for data that is identical for every student.
 */

const CATEGORIES = [
  { key: 'drawing', label: 'Drawing' },
  { key: 'aptitude', label: 'Aptitude' },
  { key: 'mathematics', label: 'Mathematics' },
  { key: 'general_knowledge', label: 'General Knowledge' },
  { key: 'exam_preparation', label: 'Exam Preparation' },
  { key: 'orientation', label: 'Orientation' },
];

const PER_ROW = 8;

export async function GET(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));

    const [rows, topics] = await Promise.all([
      Promise.all(
        CATEGORIES.map(async (cat) => ({
          key: cat.key,
          label: cat.label,
          videos: await getVideosByCategory(cat.key, PER_ROW),
        })),
      ),
      getTopicCounts(12),
    ]);

    return NextResponse.json({
      // Empty rows are dropped here rather than in the client, so the browser
      // is not handed six sections to render and then hide.
      sections: rows.filter((r) => r.videos.length > 0),
      topics,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the library';
    console.error('Library home error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
