'use client';

import { Box } from '@neram/ui';
import NeramVideoPlayer from '@/components/video/NeramVideoPlayer';
import { OPEN_GATE } from '@/lib/video-gate';
import { classifySolutionVideo } from '@/lib/solution-video';

/**
 * Convert a SharePoint sharing link into a direct download the HTML5 player can
 * stream. A link that already asks for a download is left alone.
 */
function sharePointDownloadUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has('download')) return url;
    parsed.searchParams.set('download', '1');
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * A question's solution video, wherever a student reaches it: the practice
 * question view and the test review.
 *
 * Nothing to gate on a solution the student has already reached (OPEN_GATE),
 * but the chrome is worth having: speed, keyboard and captions behave as they
 * do everywhere else. YouTube is read with the shared parser, so every link
 * the teacher's field accepted is a link that plays here.
 */
export default function SolutionVideoPlayer({ url, title = 'Solution video' }: { url: string; title?: string }) {
  const link = classifySolutionVideo(url);

  if (link.kind === 'youtube') {
    return (
      <Box sx={{ position: 'relative', width: '100%', paddingTop: '56.25%', borderRadius: 2, overflow: 'hidden', bgcolor: '#000' }}>
        <Box sx={{ position: 'absolute', inset: 0 }}>
          <NeramVideoPlayer source={{ kind: 'youtube', youtubeId: link.id }} gate={OPEN_GATE} title={title} allowFullscreen />
        </Box>
      </Box>
    );
  }

  // SharePoint streams as a direct download; anything older is tried as-is.
  const src = link.kind === 'sharepoint' ? sharePointDownloadUrl(link.url) : url.trim();
  return (
    <Box sx={{ position: 'relative', width: '100%', borderRadius: 2, overflow: 'hidden', bgcolor: '#000' }}>
      <Box sx={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', maxHeight: 480 }}>
        <NeramVideoPlayer
          // A fixed link, not a grant: nothing to renew, so a failure reloads
          // the same URL in place.
          source={{ kind: 'html5', src, renew: null }}
          gate={OPEN_GATE}
          title={title}
          allowFullscreen
          allowPictureInPicture
        />
      </Box>
    </Box>
  );
}
