/**
 * What a teacher is told about a recording's video, in one place.
 *
 * Pure, with no server imports, so the recordings page in the browser and the
 * API routes on the server say exactly the same thing. lib/sharepoint-video.ts
 * re-exports it.
 *
 * Library-only is a policy, and the wording says so: the probe of 2026-09-11
 * showed Nexus CAN read a file in a teacher's OneDrive, so the message never
 * claims students would be unable to play it.
 */

export type RecordingMessageCode =
  | 'LINK_NOT_RECOGNISED'
  | 'NOT_FOUND'
  | 'NO_ACCESS'
  | 'GRAPH_UNAVAILABLE'
  | 'RECORDING_IN_ONEDRIVE'
  | 'NOT_A_VIDEO'
  | 'UNRESOLVED';

export function videoItemMessage(code: RecordingMessageCode, item?: { name?: string | null }): string {
  const named = item?.name ? `"${item.name}"` : 'This video';
  switch (code) {
    case 'RECORDING_IN_ONEDRIVE':
      return `${named} is in a personal OneDrive. Class recordings have to live in the Neram SharePoint library, so they stay available whoever recorded them. Nexus can copy it there for you.`;
    case 'NOT_A_VIDEO':
      return `${named} is not a video file. Pick the recording itself.`;
    case 'NOT_FOUND':
      return 'This video could not be found in SharePoint. It may have been moved or deleted. Find it again in the Neram library.';
    case 'NO_ACCESS':
      return 'Nexus is not allowed to open this file. Move it into the Neram SharePoint library, then pick it here.';
    case 'LINK_NOT_RECOGNISED':
      return 'That link does not point at a file in SharePoint. Open the video in SharePoint, choose Copy link, and paste that.';
    case 'UNRESOLVED':
      return 'Nexus could not check this video just now. It will check again the next time this page opens.';
    default:
      return 'SharePoint did not answer just now. Try again in a moment.';
  }
}
