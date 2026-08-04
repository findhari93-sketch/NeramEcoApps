'use client';

/**
 * The Library player.
 *
 * A thin adapter over the shared player. It used to be its own YouTube IFrame
 * API integration, which was fine on its own but meant a third place where the
 * loading of the API, the nocookie host and the cleanup were written out.
 *
 * The Library is deliberately ungated: no checkpoint pause and no anti-seek
 * clamp. A recap is a gated lesson you have to earn your way through; the
 * Library is a reference shelf, and a student jumping straight to "Building the
 * first box" is exactly the behaviour this whole feature is for. That is what
 * OPEN_GATE says, and it is the only difference from the recap wiring.
 *
 * The raw player instance is still handed back through `playerRef`, because
 * useWatchTracker attaches to a player rather than to timestamps, and the parent
 * seeks to a chapter through it.
 */

import { Box } from '@neram/ui';
import NeramVideoPlayer from '@/components/video/NeramVideoPlayer';
import { OPEN_GATE } from '@/lib/video-gate';

interface LibraryYouTubePlayerProps {
  youtubeId: string;
  /** Filled with the YT.Player instance once it is ready. */
  playerRef: React.MutableRefObject<any>;
  onReady?: () => void;
}

export default function LibraryYouTubePlayer({
  youtubeId,
  playerRef,
  onReady,
}: LibraryYouTubePlayerProps) {
  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', bgcolor: '#000' }}>
      <NeramVideoPlayer
        source={{ kind: 'youtube', youtubeId }}
        gate={OPEN_GATE}
        allowFullscreen
        youtubePlayerRef={playerRef}
        // The surface reports a duration as soon as the player answers, which is
        // the same moment the old onReady fired.
        onLoadedMetadata={() => onReady?.()}
      />
    </Box>
  );
}
