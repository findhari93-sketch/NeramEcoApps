/**
 * The YouTube IFrame API's globals.
 *
 * This declaration used to live inside components/foundation/VideoPlayer.tsx,
 * which was a second full IFrame API integration. That file is now the shared
 * player with a YouTube source, so the declaration moved here rather than
 * disappearing: two files still load the API themselves and still need it.
 *
 * Both are staff-only editor previews that scrub to pick section boundaries:
 *   - components/foundation/FoundationChapterEditorContent.tsx
 *   - app/(teacher)/teacher/modules/[id]/items/[itemId]/page.tsx
 *
 * They are the last two of what were four separate `iframe_api` script loaders.
 * Neither is student-facing and neither gates anything, which is why they were
 * left alone: NeramVideoPlayer exposes `youtubePlayerRef` for a caller that
 * genuinely needs the raw player, so migrating them is possible when someone is
 * working in that code anyway.
 */

declare global {
  // eslint-disable-next-line no-var
  var onYouTubeIframeAPIReady: (() => void) | undefined;
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

export {};
